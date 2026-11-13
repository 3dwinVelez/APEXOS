import assert from "node:assert/strict";
import test from "node:test";

// La libreria .ts se lee con la banda de tipos de Node (--experimental-strip-types).
import {
  ACCOUNT_LENGTH_HINT, ACCOUNT_CODE_LENGTHS, KIND_LABELS, KIND_SECTIONS, KINDS, LEDGER_PRODUCT_LABEL, PENDING_MESSAGE, SECTIONS,
  SECTION_LABELS, SUBTOTAL_KINDS,
  conceptRowKey, normalizeConceptCode, validAccountCode, validPygAccountCode, validateAccountConcepts, validationErrorLabel
} from "../lib/transport-pyg-account-config.ts";

const concept = (code, name, kind, section, order, ranges = [], exclusions = []) => ({
  code, name, kind, section, order, ranges, exclusions
});

test("constantes espejo del servidor: longitudes, tipos, secciones y mensaje pendiente", () => {
  assert.deepEqual([...ACCOUNT_CODE_LENGTHS].sort(), [1, 2, 4, 6, 8]);
  assert.ok(KINDS.includes("income") && KINDS.includes("subtotal_utilidad_neta") && KINDS.includes("informational"));
  assert.ok(SECTIONS.includes("resultados") && SECTIONS.includes("informativa"));
  assert.equal(KIND_SECTIONS.income.length, 2);
  assert.deepEqual(KIND_SECTIONS.tax, ["impuestos"]);
  assert.ok(SUBTOTAL_KINDS.includes("subtotal_gastos_operativos"));
  assert.equal(PENDING_MESSAGE, "Pendiente de asociar cuenta");
});

test("codigos de cuenta validos solo con longitudes 1/2/4/6/8 y digitos", () => {
  assert.equal(validAccountCode("41450101"), true);
  assert.equal(validAccountCode("41"), true);
  assert.equal(validAccountCode("1"), true);
  assert.equal(validAccountCode("4145010"), false);
  assert.equal(validAccountCode("414"), false);
  assert.equal(validAccountCode("41A50101"), false);
  assert.equal(validAccountCode(""), false);
});

test("validacion local: configuracion valida y errores basicos", () => {
  const valid = [
    concept("INGRESOS", "INGRESOS", "income", "ingresos", 1, [{ start: "41450101", end: "41999999" }]),
    concept("TOTAL_INGRESOS", "TOTAL INGRESOS", "subtotal_ingresos", "resultados", 2)
  ];
  assert.deepEqual(validateAccountConcepts(valid), []);

  const errors = validateAccountConcepts([
    concept("dup", "Uno", "income", "ingresos", 1, [{ start: "41450101", end: "41450101" }]),
    concept("DUP", "Dos", "income", "ingresos", 2, [{ start: "41750501", end: "41750501" }])
  ]);
  assert.ok(errors.some((item) => item.code === "CONCEPT_CODE_DUPLICATE"));

  const badRange = validateAccountConcepts([concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "52059999", end: "52050601" }])]);
  assert.ok(badRange.some((item) => item.code === "RANGE_INVERTED"));

  const badLength = validateAccountConcepts([concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "5205", end: "52050601" }])]);
  assert.ok(badLength.some((item) => item.code === "RANGE_LENGTH_MISMATCH"));

  const subtotal = validateAccountConcepts([concept("S", "S", "subtotal_ingresos", "resultados", 1, [{ start: "41450101", end: "41999999" }])]);
  assert.ok(subtotal.some((item) => item.code === "SUBTOTAL_WITH_RANGES"));

  const mismatch = validateAccountConcepts([concept("A", "A", "income", "impuestos", 1)]);
  assert.ok(mismatch.some((item) => item.code === "CONCEPT_KIND_SECTION_MISMATCH"));

  const outside = validateAccountConcepts([concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "52050601", end: "52050601" }], [{ start: "52000000", end: "52000000" }])]);
  assert.ok(outside.some((item) => item.code === "EXCLUSION_OUTSIDE_RANGE"));
});

test("validacion local: solape efectivo y desambiguacion con exclusiones", () => {
  const overlap = validateAccountConcepts([
    concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "52050601", end: "52059999" }]),
    concept("B", "B", "expense", "gastos_operativos", 2, [{ start: "52059501", end: "52059999" }])
  ]);
  assert.ok(overlap.some((item) => item.code === "CONCEPT_OVERLAP"));

  // Excluir solo el inicio deja solape en 52059502..52059999.
  const partialExclusion = validateAccountConcepts([
    concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "52050601", end: "52059999" }]),
    concept("B", "B", "expense", "gastos_operativos", 2, [{ start: "52059501", end: "52059999" }], [{ start: "52059501", end: "52059501" }])
  ]);
  assert.ok(partialExclusion.some((item) => item.code === "CONCEPT_OVERLAP"));

  const disambiguated = validateAccountConcepts([
    concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "52050601", end: "52059999" }]),
    concept("B", "B", "expense", "gastos_operativos", 2, [{ start: "52059501", end: "52059999" }], [{ start: "52059501", end: "52059999" }])
  ]);
  assert.deepEqual(disambiguated, []);
});

test("normalizacion de codigo de concepto a mayusculas", () => {
  assert.equal(normalizeConceptCode("  ingresos "), "INGRESOS");
  assert.equal(normalizeConceptCode(""), "");
});

test("identidad de tarjeta estable: no depende del codigo editable", () => {
  const edited = { ...concept("NUEVO_CONCEPTO_1", "Nuevo concepto", "expense", "gastos_operativos", 1) };
  const first = conceptRowKey(0);
  edited.code = "COMBUSTIBLE_NUEVO";
  assert.equal(conceptRowKey(0), first);
  assert.doesNotMatch(first, /NUEVO_CONCEPTO/);
  assert.notEqual(conceptRowKey(0), conceptRowKey(1));
});

test("etiquetas en espanol cubren todos los tipos y secciones y conservan el valor interno", () => {
  for (const kind of KINDS) assert.ok(KIND_LABELS[kind], `falta etiqueta para ${kind}`);
  for (const section of SECTIONS) assert.ok(SECTION_LABELS[section], `falta etiqueta para ${section}`);
  assert.equal(KIND_LABELS.income, "Ingreso");
  assert.equal(KIND_LABELS.expense, "Gasto");
  assert.equal(KIND_LABELS.subtotal_ingresos, "Total ingresos");
  assert.equal(KIND_LABELS.subtotal_gastos_operativos, "Gastos operacionales");
  assert.equal(KIND_LABELS.subtotal_utilidad_operacional, "Utilidad operacional");
  assert.equal(KIND_LABELS.subtotal_antes_de_impuestos, "Utilidad antes de provisiones");
  assert.equal(KIND_LABELS.subtotal_utilidad_neta, "Utilidad neta");
  assert.equal(KIND_LABELS.tax, "Impuesto");
  assert.equal(KIND_LABELS.informational, "Informativo");
  assert.equal(SECTION_LABELS.resultados, "Resultados");
  assert.equal(LEDGER_PRODUCT_LABEL, "libro contable");
  // Los valores del contrato interno no cambian: siguen siendo los codigos.
  assert.ok(KINDS.includes("subtotal_antes_de_impuestos"));
  assert.ok(SECTIONS.includes("gastos_operativos"));
});

test("rangos PYG solo aceptan clases 4-7 con longitudes 1/2/4/6/8", () => {
  assert.equal(validPygAccountCode("41450101"), true);
  assert.equal(validPygAccountCode("52050601"), true);
  assert.equal(validPygAccountCode("6"), true);
  assert.equal(validPygAccountCode("7"), true);
  assert.equal(validPygAccountCode("11050501"), false);
  assert.equal(validPygAccountCode("2"), false);
  assert.equal(validPygAccountCode("3"), false);
  assert.equal(validPygAccountCode("8"), false);
  assert.equal(validPygAccountCode("9"), false);
  assert.match(ACCOUNT_LENGTH_HINT, /clases PUC 4, 5, 6 o 7/);

  const outsideClass = validateAccountConcepts([concept("ACTIVOS", "Activos", "expense", "gastos_operativos", 1, [{ start: "11050501", end: "11999999" }])]);
  assert.ok(outsideClass.some((item) => item.code === "RANGE_CLASS_NOT_PYG"));
  const outsideExclusion = validateAccountConcepts([concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "52050601", end: "52059999" }], [{ start: "31050501", end: "31050501" }])]);
  assert.ok(outsideExclusion.some((item) => item.code === "EXCLUSION_CLASS_NOT_PYG"));
  // 4..7 es un rango valido de longitud 1 con clases 4-7: no hay error.
  assert.deepEqual(validateAccountConcepts([concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "4", end: "7" }])]), []);
  // Longitudes mixtas no equivalen a "todo el prefijo 4": se rechazan.
  const mixedLength = validateAccountConcepts([concept("A", "A", "expense", "gastos_operativos", 1, [{ start: "4", end: "79999999" }])]);
  assert.ok(mixedLength.some((item) => item.code === "RANGE_LENGTH_MISMATCH"));
  assert.ok(!mixedLength.some((item) => item.code === "RANGE_CLASS_NOT_PYG"));
});

test("los errores se presentan con etiqueta humana, no con el codigo interno", () => {
  assert.equal(validationErrorLabel("RANGE_CLASS_NOT_PYG"), "cuenta fuera del PYG");
  assert.equal(validationErrorLabel("CONCEPT_OVERLAP"), "se solapa con otro concepto");
  assert.equal(validationErrorLabel("CONCEPT_NAME_TOO_LONG"), "nombre demasiado largo");
});
