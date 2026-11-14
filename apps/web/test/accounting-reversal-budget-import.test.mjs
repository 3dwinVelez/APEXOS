import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

const asientos = fs.readFileSync(path.join(root, "apps/web/app/dashboard/contabilidad/asientos/page.tsx"), "utf8");
const budgetImport = fs.readFileSync(path.join(root, "apps/web/components/accounting/AccountingPygBudgetImport.tsx"), "utf8");
const budget = fs.readFileSync(path.join(root, "apps/web/components/accounting/AccountingPygBudget.tsx"), "utf8");

test("asientos expone la anulacion solo a roles con escritura en contabilidad", () => {
  assert.ok(asientos.includes('hasStoredRolePermission("accounting", "write")'));
  assert.ok(asientos.includes('const canWrite = hasStoredRolePermission("accounting", "write");'));
  assert.ok(asientos.includes('doc.reversal_status !== "posted"'));
  assert.ok(asientos.includes('canWrite ?'));
  assert.ok(asientos.includes('setReversalDocument(doc)'));
  assert.ok(asientos.includes("Anular asiento"));
  assert.ok(asientos.includes("<RotateCcw size={14} /> Anular"));
  assert.ok(asientos.includes("Solo lectura"));
});

test("asientos lista estado, vincula la anulacion emitida y abre el documento por id", () => {
  assert.ok(asientos.includes("Estado"));
  assert.ok(asientos.includes('doc.reversal_status === "cancelled"'));
  assert.ok(asientos.includes('doc.reversal_status === "reversal" || doc.is_reversal'));
  assert.ok(asientos.includes("Contabilizado"));
  assert.ok(asientos.includes("Ver asiento de anulacion"));
  assert.ok(asientos.includes("openDocumentById(doc.reversal_document!.id)"));
  assert.ok(asientos.includes('/api/v1/accounting/documents/${id}'));
  assert.ok(asientos.includes('cache: "no-store"'));
  // Las etiquetas se arman con expresiones JSX condicionales: se fija el JSX exacto de la
  // fila (literales del nodo + numero del documento de anulacion/trazabilidad del original).
  assert.ok(asientos.includes("Anulado{doc.reversal_document ? ` por ${doc.reversal_document.full_number}` : \"\"}"));
  assert.ok(asientos.includes("Reversión{doc.reverses_document_id ? ` del asiento #${doc.reverses_document_id}` : \"\"}"));
  // El modal de registro contable conserva los mismos valores sobre document.*.
  assert.ok(asientos.includes("Anulado{document.reversal_document ? ` por ${document.reversal_document.full_number}` : \"\"}"));
  assert.ok(asientos.includes("Reversión{document.reverses_document_id ? ` del asiento #${document.reverses_document_id}` : \"\"}"));
  // Origen explicito por fila: el usuario ve por que un asiento no se puede anular aqui.
  assert.ok(asientos.includes("Origen: {doc.reversal_eligibility.origin_label}"));
  assert.ok(asientos.includes('doc.reversal_eligibility.eligible ? "" : " · no se anula desde contabilidad"'));
});

test("el modal de origen no verificable explica la denegacion por defecto", () => {
  assert.ok(asientos.includes('eligibility.eligibility.origin === "unverified"'));
  assert.ok(asientos.includes("no tiene la marca de origen que graba el sistema"));
  assert.ok(asientos.includes("firma de los saldos iniciales historicos"));
  assert.ok(asientos.includes("no se ofrece la anulacion desde contabilidad"));
  assert.ok(asientos.includes("Solo los asientos contables manuales y los saldos iniciales historicos se anulan desde este boton"));
});

test("el modal de anulacion consulta elegibilidad real y confirma motivo y fecha de periodo abierto", () => {
  assert.ok(asientos.includes("function ReversalModal"));
  assert.ok(asientos.includes('/api/v1/accounting/documents/${document.id}/reversal-eligibility'));
  assert.ok(asientos.includes("new AbortController()"));
  assert.ok(asientos.includes('/api/v1/accounting/documents/${document.id}/reverse'));
  assert.ok(asientos.includes('method: "POST"'));
  assert.ok(asientos.includes("reason: reason.trim(), reversal_date: reversalDate"));
  assert.ok(asientos.includes("window.confirm"));
  assert.ok(asientos.includes("Motivo de anulacion"));
  assert.ok(asientos.includes("maxLength={500}"));
  assert.ok(asientos.includes("Fecha de anulacion"));
  assert.ok(asientos.includes("periodo contable abierto"));
  assert.ok(asientos.includes("El motivo de anulacion debe tener al menos 3 caracteres."));
  assert.ok(asientos.includes("Confirmar anulacion"));
});

test("el modal explica el asiento espejo para elegibles y el modulo de origen para no elegibles", () => {
  assert.ok(asientos.includes("Elegible para anulacion"));
  assert.ok(asientos.includes("eligibility.eligibility.origin_label"));
  assert.ok(asientos.includes("debitos y creditos invertidos"));
  assert.ok(asientos.includes("El asiento original no se borra"));
  assert.ok(asientos.includes("reportes suman original + anulacion"));
  assert.ok(asientos.includes("No se puede anular desde contabilidad"));
  assert.ok(asientos.includes("eligibility.eligibility.reason_message"));
  assert.ok(asientos.toLowerCase().includes("solo los asientos contables manuales y los saldos iniciales historicos se anulan"));
  assert.ok(asientos.toLowerCase().includes("modulo de origen"));
});

test("la importacion de presupuesto descarga plantilla, valida y confirma sin sobrescribir", () => {
  assert.ok(budgetImport.includes("AccountingPygBudgetImport"));
  assert.ok(budgetImport.includes('/api/v1/accounting/reports/pyg-interactive/budgets/template'));
  assert.ok(budgetImport.includes('/api/v1/accounting/reports/pyg-interactive/budgets/validate'));
  assert.ok(budgetImport.includes('/api/v1/accounting/reports/pyg-interactive/budgets/import'));
  assert.ok(budgetImport.includes("new FormData()"));
  assert.ok(budgetImport.includes('form.append("file", file)'));
  assert.ok(budgetImport.includes('method: "POST"'));
  assert.ok(budgetImport.includes("window.confirm"));
  assert.ok(budgetImport.includes("no sobrescribe"));
  assert.ok(budgetImport.includes("plantilla-presupuesto-mensual.xlsx"));
  assert.ok(budgetImport.includes("Descargar Excel"));
  assert.ok(budgetImport.includes("Validar plantilla"));
  assert.ok(budgetImport.includes("Confirmar importación"));
});

test("la importacion explica la semantica mensual en lenguaje simple, sin jerga tecnica", () => {
  const copy = budgetImport.toLowerCase();
  assert.ok(copy.includes("cada fila es el presupuesto de un mes"));
  assert.ok(copy.includes("no es una fecha de corte"));
  assert.ok(copy.includes("jamás altera los meses anteriores"));
  assert.ok(copy.includes("no hay columna de tercero"));
  assert.ok(budgetImport.includes("AAAA-MM"));
  assert.ok(!copy.includes("semántica mensual"), "la copia visible evita jerga de analisis");
  assert.ok(!copy.includes("pyg firma"), "la copia visible evita jerga contable interna");
  assert.ok(budgetImport.includes("monthly_semantics"));
  assert.ok(budgetImport.includes("totals.valid_rows"));
  assert.ok(budgetImport.includes("totals.error_rows"));
  assert.ok(budgetImport.includes("row.errors.map"));
  assert.ok(budgetImport.includes("errorDetailsOf"));
  assert.ok(budgetImport.includes("created_count"));
  assert.ok(budgetImport.toLowerCase().includes("ningún asiento de libro fue creado"));
  assert.ok(budgetImport.includes("preview?.valid"));
});

test("el panel de importacion vive dentro del editor de presupuesto con recarga tras importar", () => {
  assert.ok(budget.includes('import AccountingPygBudgetImport'));
  assert.ok(budget.includes("<AccountingPygBudgetImport"));
  assert.ok(budget.includes("onImported"));
  assert.ok(budget.includes("setReloadToken((current) => current + 1)"));
  assert.ok(budget.includes("onSaved()"));
});

test("las rutas api de anulacion e importacion mantienen permisos por modulo", () => {
  const routes = fs.readFileSync(path.join(root, "apps/api/src/modules/accounting/routes.js"), "utf8");
  assert.ok(routes.includes('fastify.get("/accounting/documents/:id/reversal-eligibility"'));
  assert.ok(routes.includes('fastify.post("/accounting/documents/:id/reverse"'));
  assert.ok(routes.includes('fastify.get("/accounting/reports/pyg-interactive/budgets/template"'));
  assert.ok(routes.includes('fastify.post("/accounting/reports/pyg-interactive/budgets/validate"'));
  assert.ok(routes.includes('fastify.post("/accounting/reports/pyg-interactive/budgets/import"'));
  assert.ok(routes.includes('documentReversalSchema'));
  const readGuard = routes.split("reversal-eligibility")[1].split("fastify.")[0];
  assert.ok(readGuard.includes('requirePermission("accounting", "read")'));
  const writeGuard = routes.split("/accounting/documents/:id/reverse")[1].split("fastify.")[0];
  assert.ok(writeGuard.includes('requirePermission("accounting", "write")'));
});
