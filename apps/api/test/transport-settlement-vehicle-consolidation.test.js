const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const E = require("../src/modules/transport/settlement-engine");

const item = (over = {}) => ({
  id: 1, guide_reference: "GUI-10041", vehicle_plate: "WGY-482", vehicle_type: "Camion sencillo",
  route_description: "Bogota - Medellin", origin_name: "Bodega Norte", destination_city: "Medellin",
  service_date: "2026-09-30", calculated_amount: 100000.55, adjusted_amount: 100000.55, approved_amount: 100000.55,
  weight_kg: 500, volume_m3: 2, distance_km: 120, ...over
});

const pkg = (over = {}) => ({
  id: 1, code: "LIQ-2026-001", carrier_name: "Transportes Andinos", status: "preliquidada",
  period_code: "SEM-2026-39", items: [item()], ...over
});

test("consolidateByVehicle groups by normalized plate and sums exactly in cents", () => {
  const packages = [
    pkg({ id: 1, items: [item({ guide_reference: "GUI-10041", calculated_amount: 100000.55, adjusted_amount: 100000.55, approved_amount: 100000.55 })] }),
    pkg({
      id: 2, code: "LIQ-2026-002", carrier_name: "Carga Express", status: "aprobada", period_code: "SEM-2026-40",
      items: [
        item({ guide_reference: "GUI-20011", vehicle_plate: " wgy-482 ", calculated_amount: 200000.45, adjusted_amount: 200000.45, approved_amount: 200000.45 }),
        item({ guide_reference: "GUI-20012", vehicle_plate: "SZX-119", calculated_amount: 50000, adjusted_amount: 50000, approved_amount: 50000 })
      ]
    })
  ];
  const vehicles = E.consolidateByVehicle(packages);
  assert.equal(vehicles.length, 2);

  const wgy = vehicles.find((vehicle) => vehicle.vehicle_key === "wgy-482");
  assert.equal(wgy.vehicle_plate, "WGY-482");
  assert.equal(wgy.line_count, 2);
  assert.equal(wgy.guide_count, 2);
  // 100000.55 + 200000.45 = 300001.00 exacto en centavos
  assert.equal(wgy.calculated_total, 300001);
  assert.equal(wgy.adjusted_total, 300001);
  assert.equal(wgy.approved_total, 300001);
  assert.equal(wgy.weight_kg, 1000);
  assert.equal(wgy.distance_km, 240);
  assert.deepEqual(wgy.packages.map((entry) => entry.code).sort(), ["LIQ-2026-001", "LIQ-2026-002"]);
  assert.equal(wgy.lines.length, 2);

  const szx = vehicles.find((vehicle) => vehicle.vehicle_key === "szx-119");
  assert.equal(szx.adjusted_total, 50000);
  assert.equal(szx.packages.length, 1);
  assert.equal(szx.packages[0].period_code, "SEM-2026-40");
  assert.equal(szx.packages[0].carrier_name, "Carga Express");
});

test("consolidateByVehicle sorts by adjusted_total desc with plate tiebreak", () => {
  const vehicles = E.consolidateByVehicle([
    pkg({ id: 1, items: [item({ vehicle_plate: "AAA-111", calculated_amount: 100, adjusted_amount: 100, approved_amount: 100 })] }),
    pkg({ id: 2, items: [item({ vehicle_plate: "ZZZ-999", calculated_amount: 100, adjusted_amount: 100, approved_amount: 100 })] }),
    pkg({ id: 3, items: [item({ vehicle_plate: "MMM-555", calculated_amount: 500, adjusted_amount: 500, approved_amount: 500 })] })
  ]);
  assert.deepEqual(vehicles.map((vehicle) => vehicle.vehicle_plate), ["MMM-555", "AAA-111", "ZZZ-999"]);
});

test("consolidateByVehicle buckets lines without plate and keeps first non-null vehicle_type", () => {
  const vehicles = E.consolidateByVehicle([
    pkg({ id: 1, items: [item({ vehicle_plate: "", vehicle_type: "Tractomula" }), item({ guide_reference: "GUI-10042", vehicle_plate: null, vehicle_type: null })] })
  ]);
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].vehicle_key, "sin-placa");
  assert.equal(vehicles[0].vehicle_plate, "SIN PLACA");
  assert.equal(vehicles[0].vehicle_type, "Tractomula");
  assert.equal(vehicles[0].line_count, 2);
});

test("consolidateByVehicle counts distinct guides once and dedups packages by id", () => {
  const repeated = item({ guide_reference: "GUI-30001" });
  const vehicles = E.consolidateByVehicle([
    pkg({ id: 7, items: [repeated, { ...repeated, id: 2 }] }),
    pkg({ id: 7, items: [{ ...repeated, id: 3 }] })
  ]);
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].line_count, 3);
  assert.equal(vehicles[0].guide_count, 1);
  assert.equal(vehicles[0].packages.length, 1);
});

test("consolidateByVehicle returns empty structures for empty input", () => {
  assert.deepEqual(E.consolidateByVehicle([]), []);
  assert.deepEqual(E.consolidateByVehicle([pkg({ items: [] })]), []);
});

test("consolidateByVehicle carries package context on each line", () => {
  const vehicles = E.consolidateByVehicle([
    pkg({ id: 4, code: "LIQ-CONTEXTO", carrier_name: "Flota Propia", status: "liquidada", period_code: "SEM-2026-41" })
  ]);
  const line = vehicles[0].lines[0];
  assert.equal(line.package_id, 4);
  assert.equal(line.package_code, "LIQ-CONTEXTO");
  assert.equal(line.carrier_name, "Flota Propia");
  assert.equal(line.package_status, "liquidada");
  assert.equal(line.guide_reference, "GUI-10041");
  assert.equal(line.destination_city, "Medellin");
  assert.equal(line.calculated_amount, 100000.55);
});

test("vehicle consolidation endpoint is registered with transport read permission", () => {
  const routes = fs.readFileSync(path.join(__dirname, "..", "src", "modules", "transport", "routes.js"), "utf8");
  assert.match(routes, /"\/transport\/settlement-vehicle-consolidation"/);
  assert.match(routes, /getSettlementVehicleConsolidation\(request\.user\?\.tenant_id/);
  const routeLine = routes.split("\n").find((line) => line.includes('"/transport/settlement-vehicle-consolidation"'));
  assert.match(routeLine, /requirePermission\("transport", "read"\)/);
});

test("settlement service exposes the vehicle consolidation function", () => {
  const service = fs.readFileSync(path.join(__dirname, "..", "src", "modules", "transport", "settlement-service.js"), "utf8");
  assert.match(service, /async function getSettlementVehicleConsolidation\(tenantId/);
  assert.match(service, /consolidateByVehicle/);
});
