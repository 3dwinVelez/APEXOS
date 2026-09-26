import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/dashboard/servicios/page.tsx", import.meta.url), "utf8");
const routeSource = fs.readFileSync(new URL("../app/api/services/monitor-orders/route.ts", import.meta.url), "utf8");

test("el monitor usa la consulta avanzada solo para sesiones Supabase y conserva respaldo", () => {
  assert.match(source, /Promise\.allSettled\(\[/);
  assert.match(source, /const received = monitorResponse\?\.data \|\| apiOrders/);
  assert.match(source, /monitorResult\.status === "rejected" && apiResult\.status === "rejected"/);
  assert.match(source, /localStorage\.getItem\("auth_provider"\) !== "supabase"/);
});

test("la busqueda remota usa debounce y envia filtros completos", () => {
  assert.match(source, /setTimeout\(\(\) => setDebouncedQuery\(query\.trim\(\)\), 350\)/);
  assert.match(source, /query\.set\("q", filters\.q\)/);
  assert.match(source, /query\.set\("status", filters\.status\)/);
  assert.match(source, /query\.set\("date_from", filters\.dateFrom\)/);
  assert.match(source, /query\.set\("date_to", filters\.dateTo\)/);
  assert.match(source, /offset: String\(filters\.offset \|\| 0\)/);
});

test("el monitor presenta rango configurable y paginacion observable", () => {
  assert.match(source, /Rango de fecha programada/);
  assert.match(source, /type="date" value=\{dateFrom\}/);
  assert.match(source, /type="date" value=\{dateTo\}/);
  assert.match(source, /monitorResponse\?\.total/);
  assert.match(source, /monitorResponse\?\.has_more/);
  assert.match(source, /monitorResponse\?\.next_offset/);
  assert.match(source, /Cargar mas ordenes/);
  assert.match(source, /La consulta devolvio advertencias/);
});

test("la busqueda local de respaldo incluye datos operativos completos", () => {
  assert.match(source, /order\.metadata\?\.customer_document/);
  assert.match(source, /order\.metadata\?\.customer_neighborhood/);
  assert.match(source, /order\.invoice_number/);
  assert.match(source, /order\.notes/);
  assert.match(source, /order\.metadata\?\.product_description/);
});

test("el monitor refresca periodicamente y al recuperar el foco", () => {
  assert.match(source, /window\.setInterval/);
  assert.match(source, /document\.visibilityState === "visible"/);
  assert.match(source, /30_000/);
  assert.match(source, /window\.addEventListener\("focus", refreshOnFocus\)/);
  assert.match(source, /window\.removeEventListener\("focus", refreshOnFocus\)/);
});

test("el endpoint local exige identidad y membresia Supabase antes de consultar PostgreSQL", () => {
  assert.match(routeSource, /function localDatabase\(\)/);
  assert.match(routeSource, /async function localMonitorOrders/);
  assert.match(routeSource, /tenant_id: tenant\.id/);
  assert.match(routeSource, /if \(localDatabase\(\)\)/);
  assert.match(routeSource, /if \(!userId\) return jsonError\("La sesion local no corresponde a una identidad Supabase valida\.", 401\)/);
  assert.match(routeSource, /if \(!membership\?\.company_id\) return jsonError\("El usuario no tiene acceso a la empresa solicitada\.", 403\)/);
  assert.match(routeSource, /\/rest\/v1\/companies\?select=name&id=eq\./);
});

test("el endpoint rechaza sesiones invalidas, usuarios sin membresia y acceso fuera del rol operativo", () => {
  assert.match(routeSource, /if \(!userId\) return jsonError\("La sesion no es valida para consultar el monitor de servicios\.", 401\)/);
  assert.match(routeSource, /if \(!memberships\.length\) return jsonError\("El usuario no tiene acceso a empresas habilitadas para este monitor\.", 403\)/);
  assert.match(routeSource, /activeMemberships\.filter\(\(membership\) => membership\.company_id === requestedCompanyId\)/);
  assert.match(routeSource, /function canonicalCompanyId/);
  assert.match(routeSource, /requestedCompanyValue \? \[\] : activeMemberships/);
  assert.match(routeSource, /administrativeCompanyIds\.length/);
  assert.match(routeSource, /companyIds: administrativeCompanyIds, technicianOnly: false, authorized: true/);
  assert.match(routeSource, /role=in\.\(owner,admin\)/);
  assert.match(routeSource, /confirmedAdministrativeCompanyIds/);
  assert.match(routeSource, /X-Apexos-Monitor-Release/);
  assert.match(routeSource, /X-Apexos-Scope-Reason/);
  assert.match(routeSource, /if \(!scope\.authorized \|\| !scope\.companyIds\.length\) return jsonError\("El usuario no tiene permiso para consultar este monitor\.", 403/);
  assert.match(routeSource, /technicianOnly: true,[\s\S]*authorized: true/);
  assert.doesNotMatch(routeSource, /fallbackCompanies/);
});

test("el endpoint limita entradas costosas y no expone errores internos", () => {
  assert.match(routeSource, /ALLOWED_SERVICE_ORDER_STATUSES/);
  assert.match(routeSource, /MAX_RELATED_PAGES = 20/);
  assert.match(routeSource, /0, 0, 10_000/);
  assert.match(routeSource, /date\.toISOString\(\)\.slice\(0, 10\) === value/);
  assert.match(routeSource, /code: "SERVICE_MONITOR_UNAVAILABLE"/);
  assert.doesNotMatch(routeSource, /body\?\.message \|\| body\?\.error_description/);
});

test("el monitor pagina y filtra en servidor sin ocultar ordenes historicas", () => {
  for (const parameter of ["q", "status", "date_from", "date_to", "offset", "limit"]) {
    assert.match(routeSource, new RegExp(`searchParams\\.get\\("${parameter}"\\)`));
  }
  assert.match(routeSource, /headers: \{ Prefer: "count=exact" \}/);
  assert.match(routeSource, /total,/);
  assert.match(routeSource, /has_more: hasMore/);
  assert.match(routeSource, /next_offset: hasMore \? nextOffset : null/);
  assert.match(routeSource, /warnings,/);
  assert.match(routeSource, /metadata->>customer_document/);
  assert.match(routeSource, /metadata->>customer_phone_secondary/);
  assert.match(routeSource, /metadata->>customer_neighborhood/);
  assert.match(routeSource, /metadata->>product_description/);
  assert.match(routeSource, /service_references\?select=id/);
});

test("incidentes y evidencias se consultan por lotes paginados y los fallos son visibles", () => {
  assert.match(routeSource, /function chunks<T>/);
  assert.match(routeSource, /relatedRowsForOrders/);
  assert.match(routeSource, /offset=\$\{offset\}&limit=500/);
  assert.match(routeSource, /warnings\.push\(`No fue posible completar \$\{table === "service_evidence"/);
  assert.doesNotMatch(routeSource, /service_incidents[^\n]+\.catch\(\(\) => \[\]\)/);
  assert.doesNotMatch(routeSource, /service_evidence[^\n]+\.catch\(\(\) => \[\]\)/);
});

test("un error de acceso no se presenta como una lista de campos faltantes", () => {
  assert.match(source, /\^\(Completa\|Selecciona\|Asigna\)\\b/);
  assert.doesNotMatch(source, /else if \(\/referencia\|tecnico/);
});

test("la solicitud externa usa la empresa autenticada y no un nombre almacenado obsoleto", () => {
  assert.match(source, /api<AuthContext>\("\/api\/v1\/auth\/me", \{ cache: "no-store" \}\)/);
  assert.match(source, /setExternalRequestCompany\(companyName\)/);
  assert.match(source, /aria-disabled=\{!externalRequestCompany\}/);
  assert.doesNotMatch(source, /const externalRequestCompany = typeof window/);
});
