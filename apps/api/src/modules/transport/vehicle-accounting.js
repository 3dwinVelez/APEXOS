// Vehicle identity is the cost centre code. Never infer a company/branch from a label.

function fail(code, message) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  throw error;
}

function planVehicleCenter(tree, vehicle, previous = null) {
  const owned = tree.cost_centers.find(row => row.vehicle_id === vehicle.id);
  const code = String(owned?.code || vehicle.plate || "").trim().toUpperCase();
  const branchCode = vehicle.metadata?.accounting_branch_code || owned?.branch_code || vehicle.base_site;
  const branch = tree.branches.find(row => row.code === branchCode && row.active !== false);
  const society = branch && tree.societies.find(row => row.code === branch.society_code && row.active !== false);
  if (!society) fail("VEHICLE_ACCOUNTING_BRANCH_REQUIRED", "Seleccione una sucursal contable activa de la empresa para el vehiculo.");
  const existing = tree.cost_centers.find(row => row.code === code);
  if (existing && (existing.vehicle_id !== vehicle.id || existing.branch_code !== branch.code || existing.society_code !== society.code)) {
    fail("VEHICLE_ACCOUNTING_CENTER_CONFLICT", "El centro de costo ya pertenece a otra unidad. Conserve la sucursal contable del vehiculo o corrija su asignacion antes de guardar.");
  }
  if (owned && previous?.cost_center && vehicle.cost_center && vehicle.cost_center !== previous.cost_center) {
    fail("VEHICLE_ACCOUNTING_CENTER_IMMUTABLE", "El centro de costo vehicular conserva su codigo para mantener la trazabilidad contable.");
  }
  return { code, name: `Vehiculo ${vehicle.plate}`, branch_code: branch.code, society_code: society.code, vehicle_id: vehicle.id, active: vehicle.active !== false && !["retirado", "inactivo"].includes(vehicle.status) };
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
