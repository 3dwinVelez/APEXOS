import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(directory, relative), "utf8");
const source = read("../components/gastos-menores/GastosMenoresWorkspace.tsx");
const lookupSource = read("../components/gastos-menores/GastosLookup.tsx");
const fieldProductivitySource = read("../components/system/FieldProductivity.tsx");

function extractFrom(text, name) {
  const match = new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`).exec(text);
  assert.ok(match, `debe existir la funcion ${name}`);
  return match[0];
}

function extractFunction(name) {
  return extractFrom(source, name);
}

// Las funciones puras se extraen y transpilan para probar la transformacion real de filas.
const snippet = ["isLineEmpty", "lastFilledLineIndex", "repeatLineValues", "buildRepeatedLines", "nextLinesForFocus", "supplierLookupOption", "removeLineLookupErrors", "supportDataVisible"]
  .map(extractFunction)
  .join("\n");
const compiled = ts.transpileModule(snippet, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
// Las funciones provienen de un archivo versionado del repo, no de entrada externa.
const sandbox = {};
vm.runInNewContext(`${compiled}
this.helpers = { isLineEmpty, lastFilledLineIndex, repeatLineValues, buildRepeatedLines, nextLinesForFocus, supplierLookupOption, removeLineLookupErrors, supportDataVisible };`, sandbox, { timeout: 1000 });
const { isLineEmpty, lastFilledLineIndex, repeatLineValues, buildRepeatedLines, nextLinesForFocus, supplierLookupOption, removeLineLookupErrors, supportDataVisible } = sandbox.helpers;

const lookupCompiled = ts.transpileModule(
  ["lookupFields", "matches"].map((name) => extractFrom(lookupSource, name)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }
).outputText;
const lookupSandbox = {};
vm.runInNewContext(`${lookupCompiled}
this.helpers = { matches };`, lookupSandbox, { timeout: 1000 });
const { matches } = lookupSandbox.helpers;

const fieldHistoryCompiled = ts.transpileModule(
  ["fieldKey", "allowed"].map((name) => extractFrom(fieldProductivitySource, name)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }
).outputText;
const fieldHistorySandbox = {};
vm.runInNewContext(`${fieldHistoryCompiled}
this.helpers = { fieldKey, allowed };`, fieldHistorySandbox, { timeout: 1000 });
const { fieldKey, allowed } = fieldHistorySandbox.helpers;

// Los objetos creados en el sandbox atraviesan realms distintos: se normalizan antes de comparar.
const normalize = (value) => JSON.parse(JSON.stringify(value));

const blank = {
  row_key: "",
  concept_id: "",
  description: "",
  base_amount: "",
  vat_code: "",
  supplier_party_id: "",
  invoice_reference: "",
  cost_center_code: ""
};

const filled = {
  ...blank,
  row_key: "line-reference",
  concept_id: "12",
  description: "Transporte de materiales",
  base_amount: "150000",
  vat_code: "IVA19",
  supplier_party_id: "8",
  invoice_reference: "FV-88",
  cost_center_code: "CC-01"
};

const makeBlank = () => ({ ...blank });

const fieldInput = ({ type = "text", name = "", id = "", placeholder = "", optedOut = false } = {}) => ({
  type,
  name,
  id,
  placeholder,
  closest: (selector) => (optedOut && selector === '[data-field-history="off"]' ? {} : null)
});

test("repetir datos copia concepto, descripcion, IVA y soportes sin valor base", () => {
  const repeated = repeatLineValues(filled, blank);
  assert.equal(repeated.concept_id, filled.concept_id);
  assert.equal(repeated.description, filled.description);
  assert.equal(repeated.vat_code, filled.vat_code);
  assert.equal(repeated.supplier_party_id, filled.supplier_party_id);
  assert.equal(repeated.invoice_reference, filled.invoice_reference);
  assert.equal(repeated.cost_center_code, filled.cost_center_code);
  assert.equal(repeated.base_amount, "");
});

test("repetir datos aprovecha la fila vacia final y estrena una identidad nueva", () => {
  let seed = 0;
  const keyedBlank = () => ({ ...blank, row_key: `line-new-${++seed}` });
  const replaced = keyedBlank();
  const result = buildRepeatedLines([filled, replaced], keyedBlank);
  assert.equal(result.targetIndex, 1);
  assert.equal(result.lines.length, 3);
  // La fila repetida nace del factory: identidad nueva, nunca la de la fuente ni la reemplazada.
  assert.deepEqual(normalize(result.lines[1]), { ...filled, base_amount: "", row_key: "line-new-2" });
  assert.equal(result.lines[1].row_key, "line-new-2");
  assert.notEqual(result.lines[1].row_key, filled.row_key);
  assert.notEqual(result.lines[1].row_key, replaced.row_key);
  assert.ok(isLineEmpty(result.lines[2]), "debe quedar una fila vacia al final");
  assert.equal(result.lines[2].row_key, "line-new-3", "la fila final tambien estrena identidad");
  assert.deepEqual(normalize(result.lines[0]), normalize(filled), "la linea de referencia no se modifica");
});

test("repetir datos compacta huecos posteriores a la ultima linea con datos", () => {
  let seed = 0;
  const keyedBlank = () => ({ ...blank, row_key: `line-new-${++seed}` });
  const firstHole = keyedBlank();
  const secondHole = keyedBlank();
  const result = buildRepeatedLines([filled, firstHole, secondHole], keyedBlank);
  assert.equal(result.targetIndex, 1);
  assert.equal(result.lines.length, 3);
  assert.deepEqual(normalize(result.lines[1]), { ...filled, base_amount: "", row_key: "line-new-3" });
  assert.notEqual(result.lines[1].row_key, filled.row_key);
  assert.notEqual(result.lines[1].row_key, firstHole.row_key);
  assert.notEqual(result.lines[1].row_key, secondHole.row_key);
  assert.ok(isLineEmpty(result.lines[2]));
  assert.equal(result.lines[2].row_key, "line-new-4", "el hueco compactado no se reutiliza como identidad");
});

test("repetir datos no esta disponible sin linea de referencia ni supera 100 lineas", () => {
  const withoutReference = buildRepeatedLines([makeBlank()], makeBlank);
  assert.equal(withoutReference.targetIndex, -1);
  assert.equal(withoutReference.lines.length, 1);

  const full = Array.from({ length: 100 }, () => ({ ...filled }));
  assert.equal(lastFilledLineIndex(full), 99);
  const atLimit = buildRepeatedLines(full, makeBlank);
  assert.equal(atLimit.targetIndex, -1);
  assert.equal(atLimit.lines.length, 100);
});

test("repetir datos renueva solo la identidad de la fila repetida", () => {
  let seed = 0;
  const keyedBlank = () => ({ ...blank, row_key: `line-test-${++seed}` });
  const replaced = keyedBlank();
  const result = buildRepeatedLines([filled, replaced], keyedBlank);
  assert.equal(result.lines[0].row_key, "line-reference");
  assert.equal(result.lines[0].base_amount, filled.base_amount, "la fuente conserva su valor");
  assert.equal(result.lines[1].row_key, "line-test-2");
  assert.notEqual(result.lines[1].row_key, replaced.row_key);
  assert.notEqual(result.lines[1].row_key, result.lines[2].row_key);
  assert.equal(result.lines[1].base_amount, "");
});

test("el lookup de proveedor soporta NIT opcional y conserva nombre y NIT como alias", () => {
  const withTax = normalize(supplierLookupOption({ id: 7, name: "Ferreteria Central", tax_id: "900123456" }));
  assert.deepEqual(withTax, {
    value: "7",
    label: "Ferreteria Central",
    search: "Ferreteria Central 900123456",
    aliases: ["Ferreteria Central", "900123456"]
  });

  const withoutTax = normalize(supplierLookupOption({ id: 8, name: "Proveedor Sin NIT", tax_id: null }));
  assert.deepEqual(withoutTax, {
    value: "8",
    label: "Proveedor Sin NIT",
    search: "Proveedor Sin NIT",
    aliases: ["Proveedor Sin NIT"]
  });
  assert.ok(withoutTax.aliases.every((alias) => typeof alias === "string" && alias.length > 0));

  const missingTax = normalize(supplierLookupOption({ id: 9, name: "Proveedor Sin Campo", tax_id: undefined }));
  assert.deepEqual(missingTax.aliases, ["Proveedor Sin Campo"], "un tax_id omitido no contamina aliases");
});

test("el contrato de Party usa tax_id opcional, no code, y busca por nombre o NIT", () => {
  assert.match(source, /type Party = \{ id: number; name: string; tax_id: string \| null \}/);
  assert.match(source, /suppliers\.map\(\(row\) => supplierLookupOption\(row\)\)/);
  const supplierOptions = /const supplierOptions = useMemo<GastosLookupOption\[\]>\(\(\) => \[[\s\S]*?\], \[suppliers\]\);/.exec(source)?.[0] ?? "";
  assert.ok(supplierOptions.length > 0, "debe existir supplierOptions");
  assert.doesNotMatch(supplierOptions, /row\.code/);
});

test("el lookup ignora aliases ausentes y la ambiguedad exacta sigue rechazada", () => {
  const option = { value: "7", label: "Ferreteria Central", search: undefined, aliases: [undefined, null, "", "900123456"] };
  assert.equal(matches(option, "900123456"), true);
  assert.equal(matches(option, "Ferreteria Central"), true);
  assert.equal(matches(option, ""), false);

  const duplicateNit = [
    { value: "1", label: "Uno", search: "", aliases: ["900"] },
    { value: "2", label: "Dos", search: "", aliases: ["900"] }
  ].filter((candidate) => matches(candidate, "900"));
  assert.equal(duplicateNit.length, 2, "dos opciones con el mismo NIT no son una coincidencia unica");
  assert.match(lookupSource, /exactMatches\.length !== 1/);
});

test("el historial de campos se apaga solo en la captura de gastos", () => {
  assert.equal(allowed(fieldInput({ type: "text", name: "description" })), true, "las demas pantallas conservan el historial");
  assert.equal(allowed(fieldInput({ type: "text", name: "description", optedOut: true })), false, "la captura no debe guardar historial");
  assert.equal(allowed(fieldInput({ type: "password", name: "description", optedOut: true })), false, "el opt-out manda sobre un tipo permitido");
  assert.equal(allowed(fieldInput({ type: "password" })), false);
  assert.equal(allowed(fieldInput({ type: "email" })), false);
  assert.equal(allowed(fieldInput({ type: "text", name: "api_token" })), false);
  assert.equal(allowed(fieldInput({ type: "text", id: "document_number" })), false, "la clave derivada del id tambien bloquea documentos");

  const selectors = [];
  const spyInput = { type: "text", name: "description", id: "", placeholder: "", closest: (selector) => { selectors.push(selector); return null; } };
  assert.equal(allowed(spyInput), true);
  assert.equal(selectors.length, 1, "allowed consulta un unico selector");
  assert.equal(selectors[0], '[data-field-history="off"]');

  assert.match(fieldProductivitySource, /input\.closest\('\[data-field-history="off"\]'\)/);
  assert.match(fieldProductivitySource, /setSuggestion\(null\); return;/, "el foco excluido limpia la sugerencia previa");
});

test("la clave del historial prioriza name, id y recorta el placeholder", () => {
  assert.equal(fieldKey(fieldInput({ name: "description", id: "desc-id", placeholder: "Escribe" })), "description");
  assert.equal(fieldKey(fieldInput({ id: "desc-id", placeholder: "Escribe" })), "desc-id");
  assert.equal(fieldKey(fieldInput({ placeholder: "Escribe el detalle" })), "Escribe el detalle");
  assert.equal(fieldKey(fieldInput({ placeholder: "x".repeat(60) })), "x".repeat(40), "el placeholder se recorta a 40 caracteres");
  assert.equal(fieldKey(fieldInput()), "");
});

test("la seccion de captura declara el opt-out del historial de campos", () => {
  const start = source.indexOf('{mode === "new" && access.canWrite ?');
  const end = source.indexOf('{mode !== "new" ? (', start);
  assert.ok(start >= 0 && end > start, "debe existir la seccion de captura");
  const capture = source.slice(start, end);
  assert.match(capture, /<section[^>]*data-field-history="off"/, "la seccion de captura debe declarar el opt-out");
});

test("avanzar desde la ultima celda nunca crea una linea 101", () => {
  const full = Array.from({ length: 100 }, (_, index) => ({ ...filled, row_key: `line-full-${index + 1}` }));
  const atLimit = nextLinesForFocus(full, makeBlank);
  assert.equal(atLimit, full, "con 100 lineas devuelve la misma coleccion sin crear otra");
  assert.equal(atLimit.length, 100);

  const ninetyNine = Array.from({ length: 99 }, (_, index) => ({ ...filled, row_key: `line-99-${index + 1}` }));
  const appended = nextLinesForFocus(ninetyNine, makeBlank);
  assert.equal(appended.length, 100, "la linea 100 sigue permitida");
  assert.ok(isLineEmpty(appended[99]), "la nueva fila nace vacia");

  const withTrailingBlank = [filled, makeBlank()];
  assert.equal(nextLinesForFocus(withTrailingBlank, makeBlank), withTrailingBlank, "no duplica la fila vacia existente");
});

test("quitar una linea solo descarta los errores de esa fila", () => {
  const current = new Set([
    "concept-line-1", "supplier-line-1", "concept-line-2", "vat-line-2", "advance", "box"
  ]);
  const next = removeLineLookupErrors(current, "line-1");
  assert.deepEqual([...next].sort(), ["advance", "box", "concept-line-2", "vat-line-2"]);
});

test("los soportes se muestran si el concepto los exige, tienen datos o error de lookup", () => {
  const optionalConcept = { requires_supplier: false, requires_invoice_reference: false };
  assert.equal(supportDataVisible(false, blank, optionalConcept, false), false);
  assert.equal(supportDataVisible(true, blank, optionalConcept, false), true);
  assert.equal(supportDataVisible(false, blank, { ...optionalConcept, requires_supplier: true }, false), true);
  assert.equal(supportDataVisible(false, blank, { ...optionalConcept, requires_invoice_reference: true }, false), true);
  assert.equal(supportDataVisible(false, { ...blank, supplier_party_id: "8" }, optionalConcept, false), true);
  assert.equal(supportDataVisible(false, { ...blank, invoice_reference: "FV-88" }, optionalConcept, false), true);
  assert.equal(supportDataVisible(false, { ...blank, cost_center_code: "CC-01" }, optionalConcept, false), true);
  assert.equal(supportDataVisible(false, blank, optionalConcept, true), true);
});

test("la captura oculta las pestanas, conserva el volver al listado y usa lookups para caja y anticipo", () => {
  const start = source.indexOf('{mode === "new" && access.canWrite ?');
  const end = source.indexOf('{mode !== "new" ? (', start);
  assert.ok(start >= 0 && end > start, "debe existir la seccion de captura");
  const capture = source.slice(start, end);
  assert.match(source, /mode !== "new" \? <GastosMenoresNav \/> : null/);
  assert.match(source, /Volver a gastos/);
  assert.match(capture, /aria-label="Caja de trabajo"/);
  assert.match(capture, /aria-label="Anticipo del comprobante"/);
  assert.doesNotMatch(capture, /<select/, "caja y anticipo no deben volver a selects");
  assert.match(capture, /Agregar observación/);
  assert.match(capture, /Esta caja exige un anticipo vigente/);
  assert.match(capture, /boxAdvances\.length === 0/);
  assert.doesNotMatch(capture, /servidor/i);
  assert.doesNotMatch(capture, /rechaza la línea/i);
});

test("la planilla mantiene soportes, repeticion sin valor y una sola accion de contabilizar", () => {
  assert.match(source, /Mostrar datos de soporte/);
  assert.match(source, /Repetir datos anteriores \(sin valor\)/);
  assert.match(source, /Enter confirma y avanza/);
  assert.match(source, /data-field="base"/);
  assert.match(source, /min-w-\[780px\]/);
  assert.match(source, /max-w-full overflow-x-auto/);
  assert.doesNotMatch(source, /min-w-\[1080px\]/);
  assert.doesNotMatch(source, /requestSubmit/);
  assert.equal((source.match(/type="submit"/g) || []).length, 1, "Contabilizar gasto debe ser el unico submit");
});

test("el Enter inline y el Enter del popup avanzan por un solo mecanismo", () => {
  assert.match(source, /onEnterResolved=\{focusNextCell\}/);
  assert.match(source, /onSelected=\{focusNextInput\}/);
  assert.match(lookupSource, /choose\(exactMatches\[0\], true, false\)/);
  assert.match(lookupSource, /choose\(option, true\)/);
  assert.match(lookupSource, /notifySelected/);
});

test("una busqueda editada queda pendiente hasta Enter o eleccion y bloquea repetir", () => {
  // onChange no valida por coincidencia exacta: el texto tecleado sigue pendiente
  // aunque coincida; solo Enter o el popup resuelven y limpian la marca. Vacio es valido.
  assert.match(lookupSource, /onValidityChange\?\.\(!event\.target\.value\.trim\(\)\)/);
  assert.doesNotMatch(lookupSource, /onValidityChange\?\.\([^\n]*options\.some/);
  assert.match(lookupSource, /choose\(exactMatches\[0\], true, false\)/);
  // Repetir no puede reemplazar una fila cuya busqueda aun no se resolvio.
  assert.match(source, /lookupErrors\.size === 0/);
  assert.match(source, /if \(lookupErrors\.size > 0\) return;/);
  assert.match(source, /disabled=\{!canRepeat \|\| saving\}/);
});

test("el encabezado encadena caja, fecha y anticipo sin saltar a la planilla", () => {
  assert.match(source, /focusDateInput/);
  assert.match(source, /focusAdvanceInput/);
  assert.match(source, /focusFirstLineCell/);
  assert.match(source, /onEnterResolved=\{focusDateInput\}/);
  assert.match(source, /onSelected=\{focusFirstLineCell\}/);
  assert.match(source, /ref=\{dateInputRef\}/);
  assert.match(source, /ref=\{advanceFieldRef\}/);
});
