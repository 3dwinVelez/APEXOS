import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("paneles limitan a top 10 sin filtros y muestran todas las coincidencias al filtrar", () => {
  const visits = read("app/dashboard/gestion-comercial/VisitOperationsPanel.tsx");
  assert.match(visits, /const hasFilters = Boolean\(query \|\| status \|\| advisor \|\| date\)/);
  assert.match(visits, /hasFilters \? filtered : filtered\.slice\(-10\)/);
  assert.match(visits, /10 visitas más recientes/);
  const quotes = read("app/dashboard/gestion-comercial/OpenQuotationSummary.tsx");
  assert.match(quotes, /const hasFilters = Boolean\(query \|\| advisor \|\| customer \|\| dateFrom \|\| dateTo\)/);
  assert.match(quotes, /hasFilters \? filtered : filtered\.slice\(0, 10\)/);
  assert.match(quotes, /Todos los asesores/);
  assert.match(quotes, /Todos los clientes/);
  assert.match(quotes, /Emitida desde/);
  assert.match(quotes, /Emitida hasta/);
  assert.match(quotes, /Limpiar filtros/);
  const body = quotes.match(/const filtered = rows\.filter\(row => \{([\s\S]*?)\}\);/)[1];
  const match = new Function("row", "query", "advisor", "customer", "dateFrom", "dateTo", "localDay", body);
  const row = { quotation_number: "COT-10", quotation_date: "2026-08-15T20:00:00Z", advisor_id: 2, customer_id: 3, customer: { legal_name: "Cliente Uno" }, advisor: { name: "Ana" } };
  const localDay = value => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(value));
  assert.equal(match(row, "cliente", "2", "3", "2026-08-01", "2026-08-31", localDay), true);
  assert.equal(match(row, "", "1", "3", "", "", localDay), false);
  assert.equal(match(row, "", "2", "3", "2026-08-16", "", localDay), false);
  assert.equal(match(row, "cot-10", "", "", "", "", localDay), true);
});

test("presupuestos separa configuración y ejecución con filtros compartidos", () => {
  const source = read("app/dashboard/gestion-comercial/presupuestos/page.tsx");
  assert.match(source, /"execution", "Ejecutado vs\. real"/);
  assert.match(source, /"configuration", "Configuración del presupuesto"/);
  assert.match(source, /<BudgetFilters periods=\{periods\} advisors=\{advisors\}/);
  assert.match(source, /view === "configuration"/);
  assert.match(source, /<BudgetTable rows=\{filteredRows\}/);
  assert.match(source, /<Report rows=\{report\}/);
  assert.match(source, /function MultiFilter/);
  assert.match(source, /Seleccionar todo/);
  assert.match(source, /selected === null/);
  assert.match(source, /selected\.includes\(value\)/);
  assert.match(source, /selected\.length === 1/);
  const body = source.match(/const filteredRows = useMemo\(\(\) => rows\.filter\(\(row: Row\) => \{([\s\S]*?)\n  \}\), \[rows/)[1].replaceAll(": string", "");
  const matches = new Function("row", "years", "months", "advisorFilter", body);
  const advisorMonthly = { budget_type: "MONTHLY", budget_date: "2026-08-01T05:00:00Z", period: { start_date: "2026-08-01T05:00:00Z" }, advisor_id: 1 };
  const customerDaily = { budget_type: "DAILY", budget_date: "2026-08-15T17:00:00Z", period: { start_date: "2026-08-01T05:00:00Z" }, advisor_id: 1 };
  assert.equal(matches(advisorMonthly, ["2025", "2026"], ["7", "8"], ["1", "2"]), true);
  assert.equal(matches(customerDaily, ["2026"], ["8"], ["1"]), true);
  assert.equal(matches(advisorMonthly, ["2025"], ["8"], ["1"]), false);
  assert.equal(matches(advisorMonthly, ["2026"], ["9"], ["1"]), false);
  assert.equal(matches(advisorMonthly, ["2026"], ["8"], ["2"]), false);
  assert.equal(matches(advisorMonthly, null, null, null), true);
  assert.equal(matches(advisorMonthly, [], null, null), false);
});

test("agenda busca cliente con texto, Enter y lista desplegable inteligente", () => {
  const agenda = read("app/dashboard/gestion-comercial/agenda/page.tsx");
  const combo = read("app/dashboard/gestion-comercial/agenda/CustomerCombobox.tsx");
  assert.match(agenda, /<CustomerCombobox customers=\{customers\}/);
  assert.match(combo, /role="combobox"/);
  assert.match(combo, /aria-autocomplete="list"/);
  assert.match(combo, /event.key === "Enter"/);
  assert.match(combo, /!query.trim\(\) \|\| !open/);
  assert.match(combo, /Mostrar lista de clientes/);
  for (const field of ["customer.code", "customer.legal_name", "customer.trade_name", "customer.identification", "customer.phone", "customer.whatsapp", "customer.city", "customer.address"]) assert.ok(combo.includes(field));
  assert.match(combo, /Sin cliente \/ prospección/);
  assert.match(combo, /No se encontraron clientes/);
  assert.match(combo, /ArrowDown/);
  assert.match(combo, /Escape/);
});

test("reportes enlaza comparativo cotizado pedido con filtros y cantidades originales", () => {
  const hub = read("app/dashboard/gestion-comercial/reportes/page.tsx");
  const report = read("app/dashboard/gestion-comercial/reportes/cotizado-vs-pedido/page.tsx");
  assert.match(hub, /reportes\/cotizado-vs-pedido/);
  assert.match(report, /quotation-comparison\?year=/);
  for (const field of ['quoted_quantity', 'ordered_quantity', 'quantity_difference', 'quoted_value', 'ordered_value', 'value_difference']) assert.ok(report.includes(field));
  assert.match(report, /setAdvisor/); assert.match(report, /setCustomer/); assert.match(report, /setMonth/);
  assert.match(report, /Pendiente de pedido/); assert.match(report, /Pedido cancelado/);
});

test("agenda comparte el todo de compromisos y lo refresca tras guardar una visita", () => {
  const agenda = read("app/dashboard/gestion-comercial/agenda/page.tsx");
  assert.match(agenda, /<CommitmentAlerts key=\{commitmentRevision\}/);
  assert.match(agenda, /setCommitmentRevision\(value => value \+ 1\)/);
  assert.doesNotMatch(agenda, /commitments.slice\(0, 9\)/);
});

test("inicio muestra alertas y permite chulear compromisos sin ocultar fallos", () => {
  const home = read("app/dashboard/gestion-comercial/page.tsx");
  const alerts = read("app/dashboard/gestion-comercial/CommitmentAlerts.tsx");
  assert.ok(home.indexOf('<CommitmentAlerts />') < home.indexOf('<VisitOperationsPanel />'));
  assert.match(alerts, /type="checkbox"/);
  assert.match(alerts, /method: "PATCH"/);
  assert.match(alerts, /item.status === "COMPLETED" \? "PENDING" : "COMPLETED"/);
  assert.match(alerts, /JSON.stringify\(\{ status \}\)/);
  assert.doesNotMatch(alerts, /disabled=\{busy !== null \|\| item.status === "COMPLETED"\}/);
  assert.match(alerts, /"Vencidos"/);
  assert.match(alerts, /"Para hoy"/);
  assert.match(alerts, /"Cumplidos"/);
  assert.match(alerts, /role="alert"/);
  assert.match(alerts, /cache: "no-store"/);
});

test("acciones de visita distinguen gestion, ejecucion e historial de solo consulta", () => {
  const panel = read("app/dashboard/gestion-comercial/VisitOperationsPanel.tsx");
  assert.match(panel, /visit.status === "SCHEDULED" \? <Link/);
  assert.match(panel, /Gestionar visita/);
  assert.match(panel, /agenda\/\$\{visit.id\}\/ejecucion/);
  assert.match(panel, /Continuar visita/);
  assert.match(panel, /visit.status === "RESCHEDULED" \? "Ver reprogramación" : "Ver historial"/);
  assert.doesNotMatch(panel, />\s*Editar\s*</);
  const history = read("app/dashboard/gestion-comercial/VisitHistory.tsx");
  assert.match(history, /Abrir nueva programación/);
  assert.doesNotMatch(history, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
});

test("conversion editable compartida e historial adaptado al contenido", () => {
  const editor = read("app/dashboard/gestion-comercial/QuotationOrderEditor.tsx");
  const summary = read("app/dashboard/gestion-comercial/OpenQuotationSummary.tsx");
  const execution = read("app/dashboard/gestion-comercial/agenda/[id]/ejecucion/page.tsx");
  const history = read("app/dashboard/gestion-comercial/VisitHistory.tsx");
  assert.match(editor, /"Cotizado", "Pedido", "Diferencia"/);
  assert.match(editor, /!line.source && <button/);
  assert.match(editor, /quantity: line.quantity/);
  assert.match(summary, /<QuotationOrderEditor/);
  assert.match(execution, /<QuotationOrderEditor/);
  assert.match(history, /target \? "max-w-4xl" : "max-w-2xl"/);
  assert.match(history, /history.visits.length > 1/);
});

test("doble clic abre historial por ID y permite regresar desde documentos", () => {
  const panel = read("app/dashboard/gestion-comercial/VisitOperationsPanel.tsx");
  const history = read("app/dashboard/gestion-comercial/VisitHistory.tsx");
  assert.match(panel, /onDoubleClick=\{\(\) => setHistoryId\(visit.id\)\}/);
  assert.match(panel, /VisitHistory key=\{historyId\}/);
  assert.match(history, /visits\/\$\{visitId\}\/history/);
  assert.match(history, /history.commitments.filter/);
  assert.match(history, /setTarget\(entry.target\)/);
  assert.match(history, /Volver al lead time/);
  assert.match(history, /showModal\(\)/);
});

test("cada visita remonta su detalle por ID y consulta datos operativos sin cache", () => {
  const agenda = read("app/dashboard/gestion-comercial/agenda/page.tsx");
  const execution = read(
    "app/dashboard/gestion-comercial/agenda/[id]/ejecucion/page.tsx",
  );
  const panel = read(
    "app/dashboard/gestion-comercial/VisitOperationsPanel.tsx",
  );
  assert.match(agenda, /key={`detail-\$\{modal\.visit\.id\}`}/);
  assert.match(agenda, /key={`complete-\$\{modal\.visit\.id\}`}/);
  assert.match(agenda, /visits\?\$\{params\}`,[\s\S]*cache: "no-store"/);
  assert.match(
    execution,
    /commercial-management\/visits", \{ cache: "no-store" \}/,
  );
  assert.match(
    panel,
    /commercial-management\/visits", \{\s*cache: "no-store",?\s*\}/,
  );
});

test("no-store tambien evita reutilizar solicitudes GET en curso", () => {
  const api = read("lib/api.ts");
  assert.match(api, /method === "GET" && !retried && !bypassReadCache/);
});

test("prospeccion sin cliente y calendario con historial completo", () => {
  const agenda = read("app/dashboard/gestion-comercial/agenda/page.tsx");
  const execution = read("app/dashboard/gestion-comercial/agenda/[id]/ejecucion/page.tsx");
  assert.match(agenda, /visits.filter\(visit => visit.status !== "RESCHEDULED"\)/);
  assert.match(agenda, /<CustomerCombobox customers=\{customers\}/);
  assert.match(agenda, /visits\/\$\{visitId\}\/timeline/);
  assert.match(execution, /VisitCustomerForm/);
  assert.match(execution, /disabled=\{busy \|\| !visit.customer_id\}/);
});

test("pendientes en tabla con cancelacion justificada y resultado comercial", () => {
  const summary = read("app/dashboard/gestion-comercial/OpenQuotationSummary.tsx");
  const panel = read("app/dashboard/gestion-comercial/VisitOperationsPanel.tsx");
  assert.match(summary, /<table/);
  assert.match(summary, /Confirmar y generar pedido/);
  assert.match(summary, /reason.trim\(\)/);
  assert.match(panel, /Resultado comercial/);
  assert.match(panel, /Sin cotización ni pedido/);
  assert.doesNotMatch(panel, /new Date\(visit.started_at\)/);
});

test("la negociacion captura productos por codigo y conserva nombre y precio del maestro", () => {
  const execution = read(
    "app/dashboard/gestion-comercial/agenda/[id]/ejecucion/page.tsx",
  );
  assert.match(execution, /product_code: string/);
  assert.match(execution, /if \(e\.key === "Enter"\)/);
  assert.match(
    execution,
    /if \(!code\) \{ setProductQuery\(""\); setSearchingLine\(index\)/,
  );
  assert.match(execution, /readOnly value=\{selected\?\.name \|\| ""\}/);
  assert.match(execution, /money\(selected\?\.unit_price\)/);
  assert.match(execution, /<table className="w-full min-w-\[820px\] text-sm">/);
});

test("la consulta de pedidos filtra, abre detalle con doble clic y descarga PDF", () => {
  const orders = read("app/dashboard/gestion-comercial/pedidos/page.tsx");
  assert.match(orders, /commercial-management\/orders/);
  assert.match(orders, /onDoubleClick=\{\(\) => void openDetail\(order\)\}/);
  assert.match(orders, /downloadCommercialDocumentPdf/);
  assert.match(orders, /Fecha de creación/);
  assert.match(orders, /Número de pedido/);
  assert.match(orders, /Todos los asesores/);
});

test("el inicio compacto enlaza una consulta completa de cotizaciones", () => {
  const home = read("app/dashboard/gestion-comercial/page.tsx");
  const quotations = read(
    "app/dashboard/gestion-comercial/cotizaciones/page.tsx",
  );
  assert.match(home, /href="\/dashboard\/gestion-comercial\/cotizaciones"/);
  assert.match(home, /min-h-28/);
  assert.doesNotMatch(home, /description=/);
  assert.match(quotations, /commercial-management\/quotations/);
  assert.match(quotations, /onDoubleClick=\{\(\) => void openDetail\(row\)\}/);
  assert.match(quotations, /downloadCommercialDocumentPdf/);
});

test("el control muestra finalizacion y duracion real de cada visita", () => {
  const panel = read(
    "app/dashboard/gestion-comercial/VisitOperationsPanel.tsx",
  );
  assert.match(panel, /Finalización/);
  assert.match(panel, /visit\.completed_at/);
  assert.match(panel, /visit\.actual_duration_minutes/);
  assert.match(panel, /Duró/);
});

test("el pedido abre la cotizacion de origen con doble clic", () => {
  const orders = read("app/dashboard/gestion-comercial/pedidos/page.tsx");
  assert.match(orders, /onDoubleClick=\{\(\) => setShowQuotation\(true\)\}/);
  assert.match(orders, /function QuotationOriginDetail/);
  assert.match(orders, /Cotización origen/);
  assert.match(orders, /kind: "COTIZACION"/);
});

test("la cotizacion abre el pedido generado con doble clic", () => {
  const quotations = read(
    "app/dashboard/gestion-comercial/cotizaciones/page.tsx",
  );
  assert.match(quotations, /onDoubleClick=\{\(\) => setShowOrder\(true\)\}/);
  assert.match(quotations, /function GeneratedOrderDetail/);
  assert.match(quotations, /Pedido generado desde/);
  assert.match(quotations, /kind: "PEDIDO"/);
});

test("presupuestos permite crear y comparar contra pedidos realizados", () => {
  const budgets = read("app/dashboard/gestion-comercial/presupuestos/page.tsx");
  assert.match(budgets, /Crear presupuesto/);
  assert.match(budgets, /function CreateModal/);
  assert.match(budgets, /Presupuesto vs\. pedidos realizados/);
  assert.match(budgets, /\["REGISTERED", "CONFIRMED", "INVOICED"\]/);
  assert.match(budgets, /compliance/);
  assert.match(budgets, /value="DAILY"/);
  assert.match(budgets, /Día del presupuesto/);
});

test("presupuesto suma registrados y conserva filtros de fecha, asesor y cliente", () => {
  const source = read("app/dashboard/gestion-comercial/presupuestos/page.tsx");
  const expression = source.match(/const sales = (orders[\s\S]*?)\s*,\s*budget =/)[1];
  const calculate = new Function("orders", "row", "rangeStart", "rangeEnd", `return ${expression};`);
  const start = new Date("2026-08-01T00:00:00-05:00"), end = new Date("2026-08-31T23:59:59.999-05:00");
  const order = { advisor_id: 1, customer_id: 2, order_date: "2026-08-29T15:08:57Z", total: "1000000", status: "REGISTERED" };
  const orders = [order, { ...order, order_date: "2026-08-31T16:38:32Z" }, { ...order, status: "CANCELLED" }, { ...order, advisor_id: 3, customer_id: 4 }, { ...order, order_date: "2026-09-01T05:00:00Z" }];
  assert.equal(calculate(orders, { scope: "advisor", advisor_id: 1 }, start, end), 2000000);
  assert.equal(calculate(orders, { scope: "customer", customer_id: 2 }, start, end), 2000000);
  assert.equal(calculate(orders, { scope: "advisor", advisor_id: 1 }, new Date("2026-08-29T00:00:00-05:00"), new Date("2026-08-29T23:59:59.999-05:00")), 1000000);
  assert.equal(calculate([{ ...order, status: "CONFIRMED" }, { ...order, status: "INVOICED" }], { scope: "advisor", advisor_id: 1 }, start, end), 2000000);
});

test("Mi día, disponibilidad previa y exportaciones gerenciales estan disponibles", () => {
  const home = read("app/dashboard/gestion-comercial/page.tsx");
  const myDay = read("app/dashboard/gestion-comercial/mi-dia/page.tsx");
  const agenda = read("app/dashboard/gestion-comercial/agenda/page.tsx");
  const advisors = read("app/dashboard/gestion-comercial/reportes/page.tsx");
  const quotationComparison = read("app/dashboard/gestion-comercial/reportes/cotizado-vs-pedido/page.tsx");
  const exporter = read("lib/commercial-report-export.ts");
  assert.match(home, /gestion-comercial\/mi-dia/);
  assert.match(myDay, /commercial-management\/my-day/);
  assert.match(myDay, /Compromisos vencidos y del día/);
  assert.match(agenda, /visits\/check-availability/);
  assert.match(agenda, /Revisando disponibilidad/);
  assert.match(advisors, /Exportar Excel/);
  assert.match(quotationComparison, /Exportar Excel/);
  assert.match(exporter, /workbook\.xlsx\.writeBuffer/);
});

test("Gestión Comercial se publica como M-27 en la navegación lateral", () => {
  const modules = read("lib/modules.ts");
  const sidebar = read("components/shell/Sidebar.tsx");
  assert.match(modules, /id: "M-27"[\s\S]*slug: "gestion-comercial"[\s\S]*name: "Gestión Comercial"/);
  assert.match(sidebar, /MODULES\.map/);
  assert.match(sidebar, /href: `\/dashboard\/\$\{module\.slug\}`/);
});
