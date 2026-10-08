import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const operation = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/operacion/page.tsx"), "utf8");
const masters = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/maestros/page.tsx"), "utf8");
const transportLayout = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/layout.tsx"), "utf8");
const planning = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/planeacion/page.tsx"), "utf8");
const planningMap = fs.readFileSync(path.resolve(directory, "../components/transport/PlanningRouteMap.tsx"), "utf8");
const rates = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/tarifas/page.tsx"), "utf8");
const configuration = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/configuracion/page.tsx"), "utf8");
const orders = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/ordenes/page.tsx"), "utf8");
const monitoring = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/monitoreo/page.tsx"), "utf8");
const liveMap = fs.readFileSync(path.resolve(directory, "../components/tms-live-map.tsx"), "utf8");
const notifications = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/notificaciones/page.tsx"), "utf8");
const pod = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/pod/page.tsx"), "utf8");
const fleet = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/page.tsx"), "utf8");
const packing = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/cubicaje/page.tsx"), "utf8");
const profilePicker = fs.readFileSync(path.resolve(directory, "../components/transport/VehicleProfilePicker.tsx"), "utf8");
const transportOrderTemplate = path.resolve(directory, "../public/plantillas/Plantilla_Pedidos_Transporte.xlsx");

test("Transporte organiza el trabajo por etapas sin navegación redundante", () => {
  assert.doesNotMatch(transportLayout, /TransportNav|TabsList|TabLink/);
  assert.match(transportLayout, /transport-workspace/);
  assert.match(fleet, /apex-workspace-shell/);
  assert.match(fleet, /apex-section-card/);
  assert.match(fleet, /transportWorkflows\.map/);
  assert.match(fleet, /1\. Preparar pedidos/);
  assert.match(fleet, /2\. Ejecutar y entregar/);
  assert.match(fleet, /3\. Preparar la operación/);
  assert.match(fleet, /\/dashboard\/transporte\/flota/);
  assert.match(packing, /apex-workspace-shell/);
  assert.match(packing, /apex-section-card/);
  assert.match(packing, /Largo/);
  assert.match(packing, /Ancho/);
  assert.match(packing, /Alto/);
  assert.match(packing, /aria-modal="true"/);
  assert.match(packing, /Seleccionar vehículo/);
  assert.match(packing, /Agregar pedidos/);
  assert.match(packing, /Revisar productos/);
  assert.match(packing, /event\.key === "Escape"/);
  assert.match(packing, /volume_utilization_pct/);
  assert.match(packing, /weight_utilization_pct/);
  assert.match(profilePicker, /Seleccionar tipo de vehículo/);
  assert.match(profilePicker, /Espacio interior/);
  assert.doesNotMatch(profilePicker, /profiles\.map\(\(profile\) => \{[\s\S]*?<button/);
});

test("Transporte separa flota, operacion y maestros TMS", () => {
  for (const route of ["flota", "operacion", "maestros", "planeacion", "tarifas", "configuracion", "ordenes", "monitoreo", "notificaciones", "pod"]) {
    assert.match(fleet, new RegExp(`/dashboard/transporte/${route}`));
  }
});
test("POD expone KPIs, filtros y evidencia", () => { assert.match(pod, /\/transport\/pod\/stats/); assert.match(pod, /Primer intento/); assert.match(pod, /photos/); assert.match(pod, /signature/); });
test("la operacion carga foto y firma POD como archivos", () => { assert.match(operation, /pod_photo/); assert.match(operation, /pod_signature_file/); assert.match(operation, /\/evidence/); assert.match(operation, /FormData/); });
test("entrega y novedades cubren lineas parciales, reintentos e historial", () => { assert.match(operation, /delivered_/); assert.match(operation, /Historial de intentos/); assert.match(operation, /next_attempt_at/); assert.match(operation, /evidencia de novedad/); assert.match(pod, /evidence\/view/); assert.match(pod, /Ver firma/); });

test("notificaciones TMS expone envio manual e historial durable", () => { assert.match(notifications, /\/transport\/notifications\/send/); assert.match(notifications, /Registro/); assert.match(notifications, /Correo/); assert.match(notifications, /Push/); });

test("el monitoreo usa mapa real, refresco automatico, ETA, geocercas y alertas", () => {
  assert.match(monitoring, /\/transport\/monitoring\/live/); assert.match(monitoring, /setInterval/); assert.match(monitoring, /ETA/); assert.match(monitoring, /Alertas activas/);
  assert.match(liveMap, /MapContainer/); assert.match(liveMap, /openstreetmap/); assert.match(liveMap, /Polyline/); assert.match(liveMap, /geofence_radius_m/);
  assert.match(monitoring, /Turf\.js/); assert.match(monitoring, /route_deviation_m/); assert.match(liveMap, /route_coordinates/); assert.match(liveMap, /off_route/);
});

test("las ordenes TMS conectan modulos activos y ofrecen una plantilla Excel guiada", () => {
  assert.match(orders, /\/transport\/orders\/intake/);
  assert.match(orders, /\/transport\/orders\/sync/);
  assert.match(orders, /Conexión automática activa/);
  assert.match(orders, /Monitor de pedidos/);
  assert.match(orders, /ModalFrame/);
  assert.match(orders, /Subir Excel/);
  assert.match(orders, /Nuevo plan/);
  assert.match(orders, /Plantilla_Pedidos_Transporte\.xlsx/);
  assert.match(orders, /Descargar plantilla Excel/);
  assert.match(orders, /Seleccionar Excel/);
  assert.match(orders, /Ver campos y ejemplos/);
  assert.match(orders, /columnas verdes son obligatorias/);
  assert.match(orders, /datos personalizados del pedido/);
  assert.match(orders, /import\("exceljs"\)/);
  assert.ok(fs.statSync(transportOrderTemplate).size > 5000);
  assert.doesNotMatch(orders, /<textarea/);
  assert.match(orders, /\/transport\/orders\/import/);
  assert.match(orders, /dry_run: dryRun/);
  assert.match(orders, /Validar archivo/);
  assert.match(orders, /Agregar a Transporte/);
  assert.match(orders, /method: "DELETE"/);
});

test("las pantallas críticas explican la tarea y el siguiente paso en lenguaje cotidiano", () => {
  assert.match(fleet, /Empieza preparando los pedidos pendientes/);
  assert.match(operation, /Siguiente paso/);
  assert.match(operation, /Prepara el primer pedido para comenzar/);
  assert.match(packing, /Empieza aquí/);
  assert.match(packing, /Todavía no hay una simulación/);
  assert.match(orders, /Debes completar/);
});

test("las ordenes abren con el monitor como protagonista sin encabezado decorativo", () => {
  assert.doesNotMatch(orders, /<h1/);
  assert.doesNotMatch(orders, /Paso 1 de 6/);
  assert.match(orders, /Monitor de pedidos/);
  assert.match(orders, /Actualizar pedidos/);
});

test("cubicaje respeta las restricciones visuales del Design System", () => {
  assert.doesNotMatch(packing, /backdrop-blur|shadow-2xl|rounded-2xl/);
  assert.doesNotMatch(packing, /bg-\[#[0-9a-f]+\]/i);
});

test("pedidos adapta la consulta a móvil", () => {
  assert.match(orders, /md:hidden/);
  assert.match(orders, /hidden max-h-\[560px\] overflow-auto md:block/);
  assert.match(orders, /md:grid-cols-3/);
});

test("la configuracion TMS gobierna operacion, movil y notificaciones", () => {
  assert.match(configuration, /\/transport\/config/);
  assert.match(configuration, /\/config\/mobile/);
  assert.match(configuration, /\/config\/notifications/);
  assert.match(configuration, /Retencion GPS/);
});

test("el planeador evalua consolidacion, capacidad, ruta y alternativas", () => {
  assert.match(planning, /\/transport\/planning\/workbench/);
  assert.match(planning, /\/transport\/planning\/evaluate/);
  assert.match(planning, /\/transport\/planning\/commit/);
  assert.match(planning, /PlanningRouteMap/);
  assert.match(planning, /Evaluar escenarios/);
  assert.match(planning, /Parámetros bloqueados del escenario/);
  assert.match(planning, /Monitor de escenarios logísticos/);
  assert.match(planning, /Selecciona vehículo y compara 4 estrategias/);
  assert.match(planning, /Sin tarifa activa para este escenario\./);
  assert.match(planning, /route_variants/);
});

test("el planeador distingue clave invalida y cuota agotada de Google Routes", () => {
  assert.match(planning, /invalid_key/);
  assert.match(planning, /quota_exceeded/);
  assert.match(planning, /Clave Google Routes rechazada/);
  assert.match(planning, /Cuota de Google Routes agotada/);
});

test("el mapa del planeador corrige tooltips duplicados, enriquece etiquetas y garantiza alternativas reales", () => {
  assert.doesNotMatch(planningMap, /permanent sticky/);
  assert.match(planningMap, /detourViaPoint/);
  assert.match(planningMap, /osrmVariantsForScenario/);
  assert.match(planningMap, /complementWithOsrmDetours/);
  assert.match(planningMap, /Ruta alterna/);
  assert.match(planningMap, /delay_min/);
  assert.match(planningMap, /Tráfico/);
  assert.match(planningMap, /variants\.length < 2/);
});

test("el planeador valida la conexión de Google Routes en vivo desde la pantalla", () => {
  assert.match(planning, /\/api\/v1\/transport\/route-intelligence\/status\?probe=1/);
  assert.doesNotMatch(planning, /api<\{ probe[^\n]*\(`\/transport\/route-intelligence/);
  assert.match(planning, /Validar conexión/);
  assert.match(planning, /reinicia el proceso de la API/);
});

test("el mapa del planeador detecta tramos difíciles reales y compara rutas", () => {
  assert.match(planningMap, /annotations=speed,distance/);
  assert.match(planningMap, /difficultSegments/);
  assert.match(planningMap, /Tramo difícil/);
  assert.match(planningMap, /Velocidad reducida/);
  assert.match(planningMap, /Comparación de rutas/);
  assert.match(planningMap, /Tramos difíciles/);
  assert.match(planningMap, /Lectura estática de velocidad de vía/);
  assert.match(planningMap, /tramos difíciles por velocidad de vía/);
});

test("el mapa del planeador garantiza rutas alternativas dibujadas con ETA propia", () => {
  assert.match(planningMap, /ensureAlternatives/);
  assert.match(planningMap, /DETOUR_FACTORS/);
  assert.match(planningMap, /DETOUR_ATTEMPT_LIMIT/);
  assert.match(planningMap, /ratio < 1\.01 \|\| ratio > 1\.75/);
  assert.match(planningMap, /withRouteEstimates/);
  assert.match(planningMap, /estimateDurationMin/);
  assert.match(planningMap, /plannedVariant/);
  assert.match(planningMap, /ETA estimada/);
  assert.match(planningMap, /Ruta planeada/);
  assert.match(planningMap, /osrmCache/);
  assert.doesNotMatch(planningMap, /route\.alternates/);
});

test("los tarifarios exponen vigencias, versiones y componentes de costo", () => {
  assert.match(rates, /\/transport\/rate-cards/);
  assert.match(rates, /\/versions/);
  assert.match(rates, /\/activate/);
  assert.match(rates, /price_per_km/);
  assert.match(rates, /fuel_surcharge_pct/);
});

test("la torre cubre demanda, viaje, entrega y liquidacion", () => {
  assert.match(operation, /\/transport\/control-tower/);
  assert.match(operation, /\/transport\/needs/);
  assert.match(operation, /\/transport\/trips/);
  assert.match(operation, /\/assign/);
  assert.match(operation, /\/transition/);
  assert.match(operation, /\/attempts/);
  assert.match(operation, /\/settlements/);
  assert.match(operation, /\/tracking\?limit=200/);
  assert.match(operation, /\/stops\/\$\{stop\.id\}\/\$\{action\}/);
  assert.match(operation, /Tracking operativo/);
  assert.match(operation, /Registrar llegada/);
  assert.match(operation, /Registrar salida/);
  assert.match(operation, /hasStoredRolePermission\("transport", "write"\)/);
});

test("los maestros consumen contratos tenant-first del TMS", () => {
  assert.match(masters, /\/transport\/carriers/);
  assert.match(masters, /\/transport\/drivers/);
  assert.match(masters, /\/transport\/delivery-points/);
  assert.match(masters, /Direccion normalizada/);
  assert.match(masters, /window_start/);
});
