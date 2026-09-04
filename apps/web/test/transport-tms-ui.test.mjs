import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const operation = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/operacion/page.tsx"), "utf8");
const masters = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/maestros/page.tsx"), "utf8");
const navigation = fs.readFileSync(path.resolve(directory, "../components/transport-nav.tsx"), "utf8");
const planning = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/planeacion/page.tsx"), "utf8");
const rates = fs.readFileSync(path.resolve(directory, "../app/dashboard/transporte/tarifas/page.tsx"), "utf8");

test("Transporte separa flota, operacion y maestros TMS", () => {
  assert.match(navigation, /\/dashboard\/transporte\/operacion/);
  assert.match(navigation, /\/dashboard\/transporte\/maestros/);
  assert.match(navigation, /\/dashboard\/transporte\/planeacion/);
  assert.match(navigation, /\/dashboard\/transporte\/tarifas/);
  assert.match(navigation, /Flota/);
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
  assert.match(operation, /hasStoredRolePermission\("transport", "write"\)/);
});

test("los maestros consumen contratos tenant-first del TMS", () => {
  assert.match(masters, /\/transport\/carriers/);
  assert.match(masters, /\/transport\/drivers/);
  assert.match(masters, /\/transport\/delivery-points/);
  assert.match(masters, /Direccion normalizada/);
  assert.match(masters, /window_start/);
});
