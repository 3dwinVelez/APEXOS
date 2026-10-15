function text(value) {
  return String(value ?? "").trim();
}

function active(row) {
  return row && row.active !== false;
}

function organizationTreeFromConfig(config = {}) {
  const tree = config && typeof config.accounting === "object"
    ? config.accounting?.organization_tree
    : null;
  return {
    societies: Array.isArray(tree?.societies) ? tree.societies : [],
    branches: Array.isArray(tree?.branches) ? tree.branches : [],
    cost_centers: Array.isArray(tree?.cost_centers) ? tree.cost_centers : []
  };
}

function organizationError(message, code = "EMPLEADO_ORGANIZACION_INVALIDA") {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}

/**
 * Resolves an employee assignment against the tenant's accounting tree.
 * `allowEmpty` is only for existing legacy records that are not changing
 * their accounting assignment.
 */
function resolveEmployeeOrganization(tree, input = {}, current = {}, { allowEmpty = false } = {}) {
  const currentAccounting = current?.metadata?.accounting && typeof current.metadata.accounting === "object"
    ? current.metadata.accounting
    : {};
  const currentBranch = text(currentAccounting.branch_code || current?.branch_code || current?.metadata?.branch_code);
  // A flat metadata.cost_center value is legacy text and cannot establish a
  // valid organization assignment without branch/society codes.
  const currentCenter = text(currentAccounting.cost_center_code || current?.cost_center_code);
  const currentSociety = text(currentAccounting.society_code || current?.society_code);
  const hasInput = ["society_code", "branch_code", "cost_center_code", "cost_center"].some((key) => input[key] !== undefined);
  if (!hasInput && allowEmpty) return null;

  const branchCode = text(input.branch_code !== undefined ? input.branch_code : currentBranch);
  const centerCode = text(input.cost_center_code !== undefined ? input.cost_center_code : (input.cost_center !== undefined ? input.cost_center : currentCenter));
  const requestedSociety = text(input.society_code !== undefined ? input.society_code : currentSociety);
  if (!branchCode || !centerCode) {
    throw organizationError("La sucursal y el centro de costo son obligatorios para un empleado nuevo.", "EMPLEADO_ORGANIZACION_REQUERIDA");
  }

  const branch = tree.branches.find((row) => active(row) && text(row.code) === branchCode);
  if (!branch) throw organizationError("La sucursal no existe o esta inactiva en el maestro contable.", "EMPLEADO_SUCURSAL_NO_ENCONTRADA");
  const societyCode = requestedSociety || text(branch.society_code);
  if (!societyCode || text(branch.society_code) !== societyCode) {
    throw organizationError("La sucursal no pertenece a la sociedad seleccionada.", "EMPLEADO_SUCURSAL_SOCIEDAD_INVALIDA");
  }
  const society = tree.societies.find((row) => active(row) && text(row.code) === societyCode);
  if (!society) throw organizationError("La sociedad no existe o esta inactiva en el maestro contable.", "EMPLEADO_SOCIEDAD_NO_ENCONTRADA");
  const center = tree.cost_centers.find((row) => active(row) && text(row.code) === centerCode);
  if (!center) throw organizationError("El centro de costo no existe o esta inactivo en el maestro contable.", "EMPLEADO_CENTRO_COSTO_NO_ENCONTRADO");
  if (text(center.branch_code) !== branchCode || text(center.society_code) !== societyCode) {
    throw organizationError("El centro de costo no pertenece a la sucursal y sociedad seleccionadas.", "EMPLEADO_CENTRO_COSTO_ORGANIZACION_INVALIDA");
  }
  return {
    society_code: societyCode,
    branch_code: branchCode,
    cost_center_code: centerCode,
    cost_center: centerCode
  };
}

async function resolveTenantEmployeeOrganization(tenantId, input = {}, current = {}, options = {}) {
  const { getTenantConfig } = require("../../core/tenantCache");
  const config = await getTenantConfig(tenantId);
  return resolveEmployeeOrganization(organizationTreeFromConfig(config), input, current, options);
}

module.exports = {
  organizationTreeFromConfig,
  resolveEmployeeOrganization,
  resolveTenantEmployeeOrganization
};
