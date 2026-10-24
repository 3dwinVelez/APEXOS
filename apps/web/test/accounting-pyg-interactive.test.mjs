import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

const page = fs.readFileSync(path.join(root, "apps/web/app/dashboard/contabilidad/pyg/page.tsx"), "utf8");
const matrix = fs.readFileSync(path.join(root, "apps/web/components/accounting/AccountingPyg.tsx"), "utf8");
const budget = fs.readFileSync(path.join(root, "apps/web/components/accounting/AccountingPygBudget.tsx"), "utf8");
const nav = fs.readFileSync(path.join(root, "apps/web/components/contabilidad-nav.tsx"), "utf8");
const landing = fs.readFileSync(path.join(root, "apps/web/app/dashboard/contabilidad/page.tsx"), "utf8");

test("la vista por defecto es la matriz contable PUC y la vista por vehiculo queda intacta", () => {
  assert.ok(page.includes('useState<"contable" | "vehiculo">("contable")'));
  assert.ok(page.includes("<AccountingPyg />"));
  assert.ok(page.includes('onClick={() => setMainView("vehiculo")}'));
  assert.ok(page.includes("PYG por Vehículo"));
  assert.ok(page.includes("getTransportPygReport"));
  assert.ok(page.includes("downloadXlsxWorkbook"));
  assert.ok(page.includes("PYG corporativo ·"));
  assert.ok(page.includes('hasStoredRolePermission("accounting", "write")'));
  assert.ok(page.includes("<ContabilidadNav />"));
  assert.ok(page.includes('useEffect(() => { if (mainView === "vehiculo") void load(); }, [load, mainView]);'));
});

test("la matriz consulta sin cache, cancela peticiones viejas y refresca al foco y cada 60s solo visible", () => {
  assert.ok(matrix.includes('cache: "no-store"'));
  assert.ok(matrix.includes("new AbortController()"));
  assert.ok(matrix.includes("requestRef.current?.abort()"));
  assert.ok(matrix.includes('window.addEventListener("focus"'));
  assert.ok(matrix.includes("60000"));
  assert.ok(matrix.includes('document.visibilityState === "visible"'));
  assert.ok(matrix.includes("/api/v1/accounting/reports/pyg-interactive"));
  assert.ok(matrix.includes("setReport(null)"));
});

test("dimensiones configurables con puc obligatorio, presets y filtros por estructura", () => {
  assert.ok(matrix.includes('["puc", "branch", "cost_center"]'));
  assert.ok(matrix.includes('["branch", "puc", "cost_center"]'));
  assert.ok(matrix.includes('["cost_center", "puc", "branch"]'));
  assert.ok(matrix.includes("PUC · Sucursal · Centro"));
  assert.ok(matrix.includes("Cuenta PUC"));
  assert.ok(matrix.includes("Centro de costo"));
  assert.ok(matrix.includes("/api/v1/accounting/organization-tree"));
});

test("la matriz separa actual, ano anterior, diferencia, variacion, presupuesto, desvio y ejecucion", () => {
  assert.ok(matrix.includes("Año anterior"));
  assert.ok(matrix.includes("Diferencia"));
  assert.ok(matrix.includes("Var. %"));
  assert.ok(matrix.includes("Presupuesto"));
  assert.ok(matrix.includes("Desvío"));
  assert.ok(matrix.includes("Ejecución %"));
  assert.ok(matrix.includes("node.variation_pct"));
  assert.ok(matrix.includes("node.budget_variance"));
  assert.ok(matrix.includes("node.budget_execution_pct"));
});

test("negativos entre parentesis, guion para variacion no calculable y bandas por seccion", () => {
  assert.ok(matrix.includes('negative ? `(${formatRegionalMoney(Math.abs(value))})`'));
  assert.ok(matrix.includes('<span className="text-content-subtle">—</span>'));
  assert.ok(matrix.includes("ingresos4"));
  assert.ok(matrix.includes("gastos5"));
  assert.ok(matrix.includes("costos6"));
  assert.ok(matrix.includes("costosproduccion7"));
  assert.ok(matrix.includes("no_clasificado"));
  assert.ok(matrix.includes("SECTION_BAND"));
});

test("busqueda preserva totales de ancestros y expande/contrae con accesibilidad", () => {
  assert.ok(matrix.includes("pruneToSearch"));
  assert.ok(matrix.toLowerCase().includes("los totales de los nodos padre incluyen todas las fuentes"));
  assert.ok(matrix.includes("Expandir todo"));
  assert.ok(matrix.includes("Contraer todo"));
  assert.ok(matrix.includes("aria-label"));
});

test("convenciones explican metadata sin sucursal o centro de costo", () => {
  assert.ok(matrix.includes("Sin sucursal"));
  assert.ok(matrix.includes("Sin centro de costo"));
  assert.ok(matrix.includes("LedgerEntry"));
  assert.ok(matrix.includes("exportWorkbook"));
  assert.ok(matrix.includes("downloadXlsxWorkbook"));
});

test("el editor de presupuesto valida permisos, usa maestros reales y es operable por teclado", () => {
  assert.ok(budget.includes('hasStoredRolePermission("accounting", "write")'));
  assert.ok(budget.includes("/api/v1/accounting/reports/pyg-interactive/budgets"));
  assert.ok(budget.includes('method: "PUT"'));
  assert.ok(budget.includes("/api/v1/accounting/accounts?search="));
  assert.ok(budget.includes("allows_tx=true"));
  assert.ok(budget.includes("/api/v1/accounting/organization-tree"));
  assert.ok(budget.includes("ArrowDown"));
  assert.ok(budget.includes("ArrowUp"));
  assert.ok(budget.includes("Escape"));
  assert.ok(budget.includes("min={0}"));
  assert.ok(budget.includes("Cero explícito"));
  assert.ok(budget.includes("onSaved"));
  assert.ok(budget.toLowerCase().includes("consulta de solo lectura"));
});

test("el editor reutiliza las etiquetas guardadas, valida antes de enviar y recarga tras guardar", () => {
  assert.ok(budget.includes("account_label"));
  assert.ok(budget.includes("account_query"));
  assert.ok(!budget.includes("limit=1"));
  assert.ok(budget.includes("deben ser números no negativos"));
  assert.ok(budget.includes("Completa la cuenta PUC"));
  assert.ok(budget.includes("setReloadToken((current) => current + 1)"));
});

test("la matriz es de ancho completo con graficos debajo y expande/contrae todo el arbol recursivamente", () => {
  assert.ok(!matrix.includes("1.35fr"));
  assert.ok(matrix.includes('xl:grid-cols-2'));
  const matrixIndex = matrix.indexOf("Matriz interactiva");
  const chartIndex = matrix.indexOf("Resultado por sección");
  assert.ok(matrixIndex !== -1 && chartIndex !== -1 && matrixIndex < chartIndex);
  assert.ok(matrix.includes("expandableKeys"));
  assert.ok(matrix.includes("budget_coverage"));
  assert.ok(matrix.includes("budget_periods_found"));
});

test("navegacion y aterrizaje muestran PYG sin el calificativo de vehiculo", () => {
  assert.ok(nav.includes('{ href: "/dashboard/contabilidad/pyg", label: "PYG" }'));
  assert.ok(!nav.includes("PYG por vehículo"));
  assert.ok(landing.includes('title: "PYG interactivo"'));
  assert.ok(landing.includes("por PUC, sucursal y centro de costo"));
});
