import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/dashboard/servicios/page.tsx", import.meta.url), "utf8");
const routeSource = fs.readFileSync(new URL("../app/api/services/monitor-orders/route.ts", import.meta.url), "utf8");

test("el monitor combina la fuente Supabase solo para sesiones Supabase", () => {
  assert.match(source, /Promise\.allSettled\(\[/);
  assert.match(source, /mergeOrders\(\[\.\.\.monitorOrders, \.\.\.apiOrders\]\)/);
  assert.match(source, /monitorResult\.status === "rejected" && apiResult\.status === "rejected"/);
  assert.match(source, /localStorage\.getItem\("auth_provider"\) !== "supabase"/);
});

test("el monitor refresca periodicamente y al recuperar el foco", () => {
  assert.match(source, /window\.setInterval/);
  assert.match(source, /document\.visibilityState === "visible"/);
  assert.match(source, /5_000/);
  assert.match(source, /window\.addEventListener\("focus", refreshOnFocus\)/);
  assert.match(source, /window\.removeEventListener\("focus", refreshOnFocus\)/);
});

test("el endpoint local exige identidad y membresia Supabase antes de consultar PostgreSQL", () => {
  assert.match(routeSource, /function localDatabase\(\)/);
  assert.match(routeSource, /async function localMonitorOrders/);
  assert.match(routeSource, /where: \{ tenant_id: tenant\.id \}/);
  assert.match(routeSource, /if \(localDatabase\(\)\)/);
  assert.match(routeSource, /if \(!userId\) return jsonError\("La sesion local no corresponde a una identidad Supabase valida\.", 401\)/);
  assert.match(routeSource, /if \(!membership\?\.company_id\) return jsonError\("El usuario no tiene acceso a la empresa solicitada\.", 403\)/);
  assert.match(routeSource, /\/rest\/v1\/companies\?select=name&id=eq\./);
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
