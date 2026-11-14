import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// SSR del componente real y de su vista previa. No sustituye la certificación
// de carga/validación/confirmación con API y navegador reales.
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootRequire = createRequire(path.join(webRoot, "../../package.json"));
const React = rootRequire("react");
const { renderToStaticMarkup } = rootRequire("react-dom/server");
const ts = rootRequire("typescript");

function execute(relative, customRequire = rootRequire) {
  const file = path.join(webRoot, relative);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const evaluatedModule = { exports: {} };
  new Function("exports", "require", "module", compiled)(evaluatedModule.exports, customRequire, evaluatedModule);
  return evaluatedModule.exports;
}

const regionalFormat = execute("lib/regionalFormat.ts");
let apiCalls = 0;
const component = execute("components/accounting/AccountingPygBudgetImport.tsx", (name) => {
  if (name === "@/lib/api") return { api() { apiCalls += 1; throw new Error("SSR no debe llamar a la API"); } };
  if (name === "@/lib/apiBaseUrl") return { API_BASE_URL: "http://127.0.0.1:3219" };
  if (name === "@/lib/regionalFormat") return regionalFormat;
  return rootRequire(name);
});

function row(excelRow, errors = []) {
  return {
    excel_row: excelRow, period: "2026-08", account_id: excelRow,
    account_code: String(41450000 + excelRow), account_name: `Cuenta de fila ${excelRow}`,
    branch_code: "200720", cost_center_code: `CENTRO-${excelRow}`, amount: 1000, amount_cents: 100000,
    status: errors.length ? "error" : "ok", errors
  };
}

function preview(rows) {
  const errors = rows.filter((item) => item.status === "error").length;
  return { valid: errors === 0, file_hash: "fixture", periods: ["2026-08"], totals: { rows: rows.length, valid_rows: rows.length - errors, error_rows: errors }, rows, monthly_semantics: "Cada fila planea un mes puntual." };
}

const issues = [
  { code: "UNKNOWN", message: "No existe el centro de costo ULTIMO." },
  { code: "UNKNOWN", message: "La sucursal no corresponde al centro indicado." }
];
const longPreview = preview([...Array.from({ length: 144 }, (_, index) => row(index + 5)), row(149, issues)]);
const render = (data, onlyErrors) => renderToStaticMarkup(React.createElement(component.AccountingPygBudgetPreview, { preview: data, onlyErrors, onFilterChange() {} }));
const body = (markup) => markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";
const rowNumbers = (markup) => [...body(markup).matchAll(/<tr\b[^>]*><td\b[^>]*>(\d+)<\/td>/g)].map((match) => Number(match[1]));

test("el error de la última fila de 145 se muestra arriba y fuera del scroll, con todos sus motivos", () => {
  const markup = render(longPreview, true);
  const summaryStart = markup.indexOf('role="alert"');
  const filtersStart = markup.indexOf('aria-label="Filtrar filas de presupuesto"');
  const summary = markup.slice(summaryStart, filtersStart);
  assert.ok(summaryStart >= 0 && summaryStart < markup.indexOf("max-h-80"));
  assert.match(summary, /Fila 149/);
  for (const issue of issues) assert.ok(summary.includes(issue.message));
  assert.deepEqual(rowNumbers(markup), [149]);
  assert.match(markup, /aria-pressed="true"[^>]*>Solo errores \(1\)/);
  assert.match(markup, /Mostrando 1 de 145 filas/);
});

test("Todas las filas recupera las 145 sin reordenar ni renumerar el Excel y conserva el resumen", () => {
  const markup = render(longPreview, false);
  assert.deepEqual(rowNumbers(markup), Array.from({ length: 145 }, (_, index) => index + 5));
  assert.match(markup, /aria-pressed="true"[^>]*>Todas las filas \(145\)/);
  assert.match(markup, /aria-label="Errores de la plantilla de presupuesto"/);
  assert.match(body(markup), /Válida/);
  assert.ok(body(markup).includes(issues[0].message));
});

test("los filtros emiten opciones opuestas y son botones accesibles", () => {
  const choices = [];
  const tree = component.AccountingPygBudgetPreview({ preview: longPreview, onlyErrors: true, onFilterChange: (choice) => choices.push(choice) });
  const buttons = [];
  function visit(node) {
    if (!React.isValidElement(node)) return;
    if (node.type === "button") buttons.push(node);
    React.Children.forEach(node.props.children, visit);
  }
  visit(tree);
  assert.equal(buttons.length, 2);
  for (const button of buttons) { assert.equal(button.props.type, "button"); button.props.onClick(); }
  assert.deepEqual(choices, [true, false]);
  assert.deepEqual(buttons.map((button) => button.props["aria-pressed"]), [true, false]);
});

test("una plantilla válida conserva todas sus filas y no presenta una alerta de errores", () => {
  const valid = preview([row(5), row(6)]);
  const markup = render(valid, false);
  assert.equal(component.budgetPreviewHasErrors(valid), false);
  assert.match(markup, /Validación correcta/);
  assert.doesNotMatch(markup, /role="alert"/);
  assert.deepEqual(rowNumbers(markup), [5, 6]);
  assert.match(markup, /Solo errores \(0\)/);
});

test("se detectan errores aunque un indicador del resumen sea inconsistente", () => {
  const error = preview([row(9, issues)]);
  assert.equal(component.budgetPreviewHasErrors({ ...error, valid: true, totals: { rows: 1, valid_rows: 1, error_rows: 0 } }), true);
  assert.equal(component.budgetPreviewHasErrors({ ...error, rows: [row(9)] }), true);
  assert.equal(component.budgetPreviewHasErrors({ ...preview([row(9)]), rows: [{ ...row(9), errors: issues }] }), true);
});

test("el primer render no confirma ni llama a la API y deja confirmar deshabilitado", () => {
  const markup = renderToStaticMarkup(React.createElement(component.default, { onImported() { throw new Error("No hay importación en SSR"); } }));
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Confirmar importación<\/button>/);
  assert.equal(apiCalls, 0);
});
