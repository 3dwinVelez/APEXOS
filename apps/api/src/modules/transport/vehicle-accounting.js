// Resolve legacy centres by their code, never by a display name or default branch.

function fail(code, message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  throw error;
}

function planVehicleCenter(tree, vehicle, previous = null) {
  const normalize = value => String(value || "").trim().toUpperCase();
  const plateKey = value => normalize(value).replace(/\s+/g, "");
  const ownedRows = tree.cost_centers.filter(row => row.vehicle_id != null && String(row.vehicle_id) === String(vehicle.id));
  if (ownedRows.length > 1) fail("VEHICLE_ACCOUNTING_CENTER_CONFLICT", "El vehiculo tiene varios centros contables vinculados; revise su asignacion.");
  const assigned = normalize(vehicle.cost_center);
  if (!ownedRows.length && assigned && plateKey(assigned) !== plateKey(vehicle.plate)) fail("VEHICLE_ACCOUNTING_CENTER_CONFLICT", "El centro indicado no esta vinculado al vehiculo; revise su asignacion contable.");
  const exact = tree.cost_centers.filter(row => normalize(row.code) === (assigned || normalize(vehicle.plate)));
  const legacy = exact.length ? exact : tree.cost_centers.filter(row => plateKey(row.code) === plateKey(vehicle.plate));
  if (!ownedRows.length && legacy.length > 1) fail("VEHICLE_ACCOUNTING_CENTER_CONFLICT", "Hay varios centros compatibles con la placa; seleccione el centro contable correcto del vehiculo.");
  const owned = ownedRows[0] || legacy[0];
  if (owned && (owned.active === false || (owned.vehicle_id != null && String(owned.vehicle_id) !== String(vehicle.id)))) fail("VEHICLE_ACCOUNTING_CENTER_CONFLICT", "El centro de costo esta inactivo o pertenece a otro vehiculo.");
  const code = normalize(owned?.code || vehicle.plate);
  const branchCode = vehicle.metadata?.accounting_branch_code || owned?.branch_code || vehicle.base_site;
  const branch = tree.branches.find(row => row.code === branchCode && row.active !== false);
  const society = branch && tree.societies.find(row => row.code === branch.society_code && row.active !== false);
  if (!society) fail("VEHICLE_ACCOUNTING_BRANCH_REQUIRED", "Seleccione una sucursal contable activa de la empresa para el vehiculo.");
  const existing = tree.cost_centers.find(row => row.code === code);
  if (existing && ((existing.vehicle_id != null && String(existing.vehicle_id) !== String(vehicle.id)) || existing.branch_code !== branch.code || existing.society_code !== society.code)) {
    fail("VEHICLE_ACCOUNTING_CENTER_CONFLICT", "El centro de costo ya pertenece a otra unidad. Conserve la sucursal contable del vehiculo o corrija su asignacion antes de guardar.");
  }
  if (owned && previous?.cost_center && vehicle.cost_center && vehicle.cost_center !== previous.cost_center) {
    fail("VEHICLE_ACCOUNTING_CENTER_IMMUTABLE", "El centro de costo vehicular conserva su codigo para mantener la trazabilidad contable.");
  }
  return { ...owned, code, name: owned?.name || `Vehiculo ${vehicle.plate}`, branch_code: branch.code, society_code: society.code, vehicle_id: vehicle.id, active: vehicle.active !== false && !["retirado", "inactivo"].includes(vehicle.status) };
}

async function ensureVehicleCenterTx(tx, tenantId, vehicle, previous = null) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", `${tenantId}:accounting-numbering`);
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
  const config = tenant?.config || {};
  const accounting = config.accounting || {};
  const tree = accounting.organization_tree || { societies: [], branches: [], cost_centers: [] };
  const center = planVehicleCenter(tree, vehicle, previous);
  const nextTree = { ...tree, cost_centers: [...tree.cost_centers.filter(row => row.code !== center.code), center] };
  await tx.tenant.update({ where: { id: tenantId }, data: { config: { ...config, accounting: { ...accounting, organization_tree: nextTree } } } });
  await tx.vehicle.update({ where: { id: vehicle.id }, data: { cost_center: center.code, metadata: { ...vehicle.metadata, accounting_branch_code: center.branch_code } } });
  return center;
}

async function invalidateVehicleAccounting(tenantId) {
  const { invalidateTenantCache } = require("../../core/tenantCache");
  await invalidateTenantCache(tenantId).catch(() => undefined);
}

module.exports = { planVehicleCenter, ensureVehicleCenterTx, invalidateVehicleAccounting };
