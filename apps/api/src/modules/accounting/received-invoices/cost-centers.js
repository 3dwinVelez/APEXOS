const { appError } = require("./errors");

// El maestro vive en Tenant.config.accounting.organization_tree (Contabilidad >
// Estructura). La factura solo guarda el codigo, asi que aqui se normaliza a
// opciones listas para elegir y se valida que el codigo exista y este activo.
function buildCostCenterOptions(tree = {}) {
  const societies = new Map((tree.societies || []).map((row) => [String(row.code || "").trim(), row]));
  const branches = new Map((tree.branches || []).map((row) => [String(row.code || "").trim(), row]));
  return (tree.cost_centers || [])
    .filter((row) => row && row.active !== false)
    .map((row) => {
      const branch = branches.get(String(row.branch_code || "").trim());
      const society = societies.get(String(row.society_code || "").trim());
      return {
        code: String(row.code || "").trim(),
        name: String(row.name || "").trim(),
        branch_code: String(row.branch_code || "").trim() || null,
        branch_name: branch ? String(branch.name || "").trim() : null,
        society_code: String(row.society_code || "").trim() || null,
        society_name: society ? String(society.name || "").trim() : null
      };
    })
    .filter((row) => row.code && row.name)
    .sort((a, b) => `${a.branch_code || ""}\u0000${a.code}`.localeCompare(`${b.branch_code || ""}\u0000${b.code}`, "es"));
}

function findCostCenter(options, code) {
  const value = String(code || "").trim().toLowerCase();
  if (!value) return null;
  return (options || []).find((row) => row.code.toLowerCase() === value) || null;
}

// `current` permite conservar un valor heredado (texto libre anterior al maestro)
// cuando el usuario no lo cambia; cualquier valor nuevo debe existir en la estructura.
function resolveCostCenterCode(options, value, current = null) {
  if (value === undefined) return undefined;
  const text = value === null ? "" : String(value).trim();
  if (!text) return null;
  if (current && text.toLowerCase() === String(current).trim().toLowerCase()) return current;
  const match = findCostCenter(options, text);
  if (!match) {
    throw appError(
      "El centro de costo indicado no existe o esta inactivo en la estructura contable.",
      "INVOICE_COST_CENTER_INVALID",
      422
    );
  }
  return match.code;
}

module.exports = { buildCostCenterOptions, findCostCenter, resolveCostCenterCode };
