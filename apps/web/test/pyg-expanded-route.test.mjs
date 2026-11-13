import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const route = read("../app/dashboard/contabilidad/pyg/ampliado/page.tsx");
const page = read("../app/dashboard/contabilidad/pyg/page.tsx");
const expanded = read("../components/accounting/PygVehicleExpanded.tsx");
const chrome = read("../components/shell/DashboardChrome.tsx");
const layout = read("../app/dashboard/layout.tsx");

test("la ruta ampliada es un componente de servidor que valida searchParams", () => {
  assert.doesNotMatch(route, /^"use client";/m);
  assert.match(route, /searchParams: Promise</);
  assert.match(route, /await searchParams/);
  assert.match(route, /parsePyVehicleSelection\(/);
  assert.match(route, /isPygPeriod\(/);
});

test("la ruta ampliada envuelve el cliente en Suspense (Next 16)", () => {
  assert.match(route, /<Suspense/);
  assert.match(route, /<PygVehicleExpanded/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /robots: \{ index: false, follow: false \}/);
});

test("la ventana ampliada relee el mismo lector contable y valida libro y periodo", () => {
  assert.match(expanded, /getTransportPygReport\(/);
  assert.match(expanded, /report_source !== "ledger"/);
  assert.match(expanded, /data\.period !== targetPeriod/);
  assert.doesNotMatch(expanded, /downloadXlsxWorkbook|reportExports/, "la vista ampliada no exporta");
  assert.doesNotMatch(expanded, /BroadcastChannel|announcePygExpandedOpen|window\.open/, "sin handshake ni apertura programatica");
});

test("la ventana ampliada permite pantalla completa con boton explicito", () => {
  assert.match(expanded, /requestFullscreen/);
  assert.match(expanded, /exitFullscreen/);
  assert.match(expanded, /aria-pressed=/);
  assert.match(expanded, /Salir de pantalla completa/);
  assert.match(expanded, /pantalla completa no disponible en este navegador/);
});

test("la ventana ampliada reconoce placa y periodo en la URL", () => {
  assert.match(expanded, /pygExpandedHref\(\{ plate: selection, period: report\.period \}\)/);
  assert.match(expanded, /history\.replaceState/);
  assert.match(expanded, /type="month"/);
  assert.match(expanded, /<select/);
});

test("el enlace de la pantalla normal es nativo con target blank y noopener,noreferrer", () => {
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /href=\{href\}/);
  assert.match(page, /pygExpandedHref\(/);
  assert.match(page, /Abrir en otra ventana/);
  assert.doesNotMatch(page, /window\.open|watchPygExpandedOpen|BroadcastChannel/, "no hay apertura programatica ni handshake");
});

test("el shell activa el modo sin sidebar solo para la ruta ampliada exacta del PYG", () => {
  assert.match(chrome, /import \{ usePathname \} from "next\/navigation"/);
  assert.match(chrome, /const pathname = usePathname\(\)/);
  assert.match(chrome, /const expanded = pathname === PYG_EXPANDED_PATH/);
  assert.match(chrome, /if \(expanded\) \{[\s\S]*?<RouteAccessGuard>\{children\}<\/RouteAccessGuard>/);
  assert.doesNotMatch(chrome, /EXPANDED_VIEW_PREFIX|isExpandedViewPath/, "sin prefijos amplios: la ruta es exacta");
});

test("la ruta ampliada conserva el guard de modulo del dashboard", () => {
  assert.match(chrome, /RouteAccessGuard/);
  assert.match(page, /hasStoredRolePermission/);
});

test("el layout del dashboard sigue usando el shell para autorizacion y tenant", () => {
  assert.match(layout, /DashboardChrome/);
  assert.match(chrome, /Sidebar/);
});

test("la pantalla normal conserva consolidado, selector de placas y bloque sin vehiculo", () => {
  assert.match(page, /ConsolidatedView/);
  assert.match(page, /VehiclesView/);
  assert.match(page, /Sin vehículo \/ sin asignar/);
  const view = page.slice(page.indexOf("function VehiclesView("), page.indexOf("function ConfigView("));
  assert.ok(view.length > 0, "no se encontró VehiclesView");
  // La ventana ampliada se ofrece con la placa exacta seleccionada y el período del reporte.
  assert.match(view, /const expandedHref = vehicle \? pygExpandedHref\(\{ plate: vehicle\.plate, period: report\.period \}\) : ""/);
  assert.match(view, /<ExpandedWindowLink href=\{expandedHref\}/);
  // Selector de placas que mantiene la selección y el bloque sin vehículo seleccionable.
  assert.match(view, /report\.vehicles\.map\(\(item\) =>/);
  assert.match(view, /setLocalSelection\(item\.plate\); onSelectPlate\(item\.plate\)/);
  assert.match(view, /unassignedSelected && report\.unassigned \?/);
  assert.match(view, /<UnassignedKpis unassigned=\{report\.unassigned\} \/>/);
});
