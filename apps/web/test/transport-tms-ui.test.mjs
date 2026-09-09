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

test("Transporte usa un lobby APP sin navegación interna redundante", () => {
  assert.doesNotMatch(transportLayout, /TransportNav|TabsList|TabLink/);
  assert.match(transportLayout, /transport-workspace/);
  assert.match(fleet, /apex-workspace-shell/);
  assert.match(fleet, /apex-section-card/);
  assert.match(fleet, /Herramientas activas de transporte/);
  assert.match(fleet, /transportActions\.map/);
  assert.match(fleet, /\/dashboard\/transporte\/flota/);
  assert.match(packing, /apex-workspace-shell/);
  assert.match(packing, /apex-section-card/);
  assert.match(packing, /Largo/);
  assert.match(packing, /Ancho/);
  assert.match(packing, /Alto/);
  assert.match(packing, /aria-modal="true"/);
  assert.match(packing, /Espacio y vehículo/);
  assert.match(packing, /Pedidos y viaje/);
  assert.match(packing, /Productos y restricciones/);
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

test("las ordenes TMS permiten filtrar, validar CSV, importar y cancelar", () => {
  assert.match(orders, /\/transport\/orders\/import/);
  assert.match(orders, /dry_run: dryRun/);
  assert.match(orders, /Validar archivo/);
  assert.match(orders, /Importar órdenes/);
  assert.match(orders, /method: "DELETE"/);
  assert.doesNotMatch(orders, /integrations|webhook|sync ERP/i);
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
  assert.match(planning, /Mapa esquemático del plan/);
  assert.match(planning, /Alternativas tarifarias/);
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
