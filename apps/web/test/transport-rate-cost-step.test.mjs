import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const designer = fs.readFileSync(path.join(root, "components/transport/RateCostDesigner.tsx"), "utf8");
const page = fs.readFileSync(path.join(root, "app/dashboard/transporte/tarifas/page.tsx"), "utf8");
const planningMap = fs.readFileSync(path.join(root, "components/transport/PlanningRouteMap.tsx"), "utf8");

test("etapa 3 renderiza el layout de 3 columnas con los bloques del PRD", () => {
  assert.match(designer, /lg:grid-cols-\[minmax\(280px,1\.1fr\)_minmax\(0,1\.65fr\)_minmax\(260px,\.8fr\)\]/);
  assert.match(designer, /Tarifa principal/);
  assert.match(designer, /Costos adicionales/);
  assert.match(designer, /Simulador de recorrido/);
  assert.match(designer, /Resumen del cálculo/);
  assert.match(designer, /Información adicional/);
  assert.match(designer, /Consumo estimado del vehículo/);
});

test("métodos visuales de tarifa principal con campos condicionales", () => {
  for (const label of ["Valor fijo", "Por kilómetro", "Por carga"]) assert.ok(designer.includes(label), label);
  assert.match(designer, /draft\.tariff_method === "por_km" \? <NumField label="Precio por kilómetro"/);
  assert.match(designer, /draft\.tariff_method === "por_carga"/);
  assert.match(designer, /\["kg", "Kilogramo"\], \["m3", "Volumen \(m³\)"\]/, "unidad kg o m3, nunca ambas");
});

test("costos adicionales como toggles independientes", () => {
  for (const label of ["Paradas adicionales", "Peajes", "Tiempo de espera", "Cargue y descargue", "Otros costos"]) {
    assert.match(designer, new RegExp(`label="${label}"`));
  }
  assert.match(designer, /aria-pressed=\{enabled\}/, "cada toggle expresa su estado");
  assert.match(designer, /Paradas incluidas/);
  assert.match(designer, /Valor por parada extra/);
});

test("resumen distingue cobrable vs referencial y respeta el cobro mínimo", () => {
  assert.match(designer, /Math\.max\(subtotal \+ fuel, minimum\)/);
  assert.match(designer, /El cobro mínimo \(/);
  assert.match(designer, /solo el resumen superior alimenta el costo del servicio/);
  assert.match(designer, /Total del servicio/);
  assert.match(designer, /text-2xl text-apex/, "total destacado con el color del tema activo");
  assert.match(designer, /\$\{stopsCount\} paradas − \$\{num\(draft\.stops_included\)\} incl\. = \$\{extraStops\} extra/, "línea de paradas extra del caso de aceptación");
});

test("paradas extra nunca negativas y recargo porcentual preservado", () => {
  assert.match(designer, /Math\.max\(0, stopsCount - num\(draft\.stops_included\)\)/);
  assert.match(designer, /\(subtotal \* num\(draft\.fuel_surcharge_pct\)\) \/ 100/);
  assert.match(designer, /Recargo de combustible \$\{draft\.fuel_surcharge_pct/);
});

test("flujo de combustible estimado sin duplicar el recargo %", () => {
  assert.match(designer, /Usar este costo en la tarifa/);
  assert.match(designer, /window\.confirm\(`El recargo porcentual de combustible/);
  assert.match(designer, /onChange\(\{ fuel_mode: "estimated", fuel_estimated_cost: String\(costo\), fuel_surcharge_pct: "0" \}\)/);
  assert.match(designer, /Volver a recargo porcentual/);
  assert.match(designer, /Combustible estimado \(recargo % en 0\)/);
  assert.match(designer, /fuelCalc\.litros = km \/ rendimiento|km \/ rendimiento/);
});

test("simulador consume endpoints server-side y km manual queda marcado", () => {
  assert.match(designer, /\/api\/v1\/transport\/route-simulator/);
  assert.match(designer, /\/api\/v1\/transport\/route-places\?term=/);
  assert.match(designer, /km_source: "manual", sim_manual_km: true/);
  assert.match(designer, /\.\.\.\(currentDraft\.sim_manual_km \? \{\} : \{ billable_km: String\(result\.distance_km\), km_source: result\.source \}\)/, "km manual no se sobrescribe");
  assert.match(designer, /Usar la calculada/, "restaurar distancia calculada");
  assert.match(designer, /Ida y regreso/);
  assert.match(designer, /Agregar parada/);
});

test("mapa usa Leaflet y decodeGooglePolyline exportado", () => {
  assert.match(designer, /react-leaflet/);
  assert.match(designer, /decodeGooglePolyline/);
  assert.match(planningMap, /export function decodeGooglePolyline/);
  assert.doesNotMatch(designer, /GOOGLE.*API_KEY|maps\.googleapis\.com\/maps\/api\/js/i, "sin claves ni SDK de Google en el cliente");
});

test("payload guarda metadata aditiva y bloque de simulación condicional", () => {
  assert.match(page, /metadata\.tariff_method = draft\.tariff_method/);
  assert.match(page, /if \(numberValue\(draft\.stops_included\) > 0\) metadata\.stops_included/);
  assert.match(page, /if \(draft\.fuel_mode === "estimated"\) \{/);
  assert.match(page, /metadata\.fuel_estimated_cost = numberValue\(draft\.fuel_estimated_cost\)/);
  assert.match(page, /if \(draft\.sim_origin_label\.trim\(\) \|\| draft\.sim_destination_label\.trim\(\) \|\| simulatedDistance > 0\) \{/);
  assert.match(page, /distance_km: simulatedDistance/);
  assert.doesNotMatch(page, /metadata\.simulation[\s\S]{0,400}polyline/i, "sin polyline persistida");
});

test("draftFromRate infiere método y restaura la simulación", () => {
  assert.match(page, /meta\.tariff_method === "por_km" \|\| meta\.tariff_method === "por_carga" \? meta\.tariff_method/);
  assert.match(page, /Number\(rate\.price_per_km\) > 0 \? "por_km"/);
  assert.match(page, /sim_manual_km: sim\?\.source === "manual"/);
  assert.match(page, /fuel_mode: meta\.fuel_mode === "estimated" \? "estimated" : "surcharge"/);
});

test("el asistente tiene tres etapas y el cálculo ocupa la última", () => {
  const steps = page.match(/title: "[^"]+"/g) || [];
  assert.deepEqual(steps, ['title: "Identificación"', 'title: "Transporte y vigencia"', 'title: "Cálculo del costo"']);
  assert.match(page, /\{step === 0 \? <div className="grid gap-3 sm:grid-cols-2">/);
  assert.doesNotMatch(page, /GeoCascade|Ámbito geográfico/);
  assert.match(page, /\{step === 1 \? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">/);
  assert.match(page, /\{step === 2 \? <RateCostDesigner draft=\{draft\}/);
  assert.match(page, /wizardStep === 2 \? "md:max-w-\[1536px\]" : "md:max-w-3xl"/, "modal ensancha solo en la etapa 3");
  assert.match(page, /stepError[\s\S]*?Escribe el código y el nombre para continuar\./);
  assert.match(page, /Selecciona la transportadora de terceros para continuar\./);
  assert.doesNotMatch(page, /calculateExample|function CostField|function ExampleInput/, "cálculo de ejemplo viejo eliminado");
});

test("flujo de guardado/versionado preservado", () => {
  assert.match(page, /Guardar como nueva version/);
  assert.match(page, /\/versions`, \{ method: "POST"/);
  assert.match(page, /activate\(rate\)/);
  assert.match(page, /await api\(`\/api\/v1\/transport\/rate-cards\/\$\{editing\.id\}`/, "edición borrador por PUT");
});
