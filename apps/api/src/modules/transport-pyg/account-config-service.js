// Servicio GET/PUT de la configuracion contable del PYG por vehiculo.
// Vive en Tenant.config.accounting.vehicle_pyg (sin migraciones) y comparte el
// candado contable de numeracion (${tenantId}:accounting-numbering) con la
// configuracion contable y el presupuesto para no perder actualizaciones
// concurrentes. El GET nunca escribe la configuracion del tenant.
const basePrisma = require("../../core/prisma");
const { invalidateTenantCache } = require("../../core/tenantCache");
const { validateAccountConfig, cloneProposal, EXCEL_PROPOSAL } = require("./account-config");

const PROPOSAL_FROM = "excel-presupuesto";

function appError(statusCode, code, message, detail = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (detail !== undefined) error.detail = detail;
  return error;
}

function storedVehiclePyg(config) {
  const accounting = config && typeof config === "object" ? config.accounting : null;
  return accounting && typeof accounting.vehicle_pyg === "object" && accounting.vehicle_pyg !== null
    ? accounting.vehicle_pyg
    : null;
}

// GET: estado actual + propuesta del Excel. No cambia nada del tenant.
// El PYG en Contabilidad siempre lee el libro contable: la fuente efectiva se
// normaliza a "accounting" incluso si el tenant aun guarda el flag legacy
// "operational". Las claves guardadas (conceptos y resto de config) se preservan.
async function getAccountConfiguration(tenantId) {
  if (!tenantId) throw appError(401, "PYG_TENANT_REQUIRED", "Empresa requerida.");
  // runWithTenant solo abre el contexto de tenant via AsyncLocalStorage y no
  // entrega cliente al callback: las lecturas usan basePrisma dentro del scope.
  return basePrisma.runWithTenant(tenantId, async () => {
    const tenant = await basePrisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const stored = storedVehiclePyg(tenant?.config);
    const concepts = stored && Array.isArray(stored.concepts) ? stored.concepts : [];
    return {
      source: "accounting",
      has_config: concepts.length > 0,
      config: concepts.length > 0 ? { source: "accounting", concepts } : null,
      proposal: cloneProposal(),
      proposal_from: PROPOSAL_FROM,
      proposal_label: EXCEL_PROPOSAL.label
    };
  });
}

// PUT: valida todo (errores acumulados), conserva las demas claves de config y
// escribe solo accounting.vehicle_pyg bajo el candado contable compartido.
async function saveAccountConfiguration(tenantId, user, input = {}) {
  if (!tenantId) throw appError(401, "PYG_TENANT_REQUIRED", "Empresa requerida.");
  const result = validateAccountConfig(input);
  if (!result.ok) {
    throw appError(400, "PYG_ACCOUNT_CONFIG_INVALID", "La configuracion de conceptos PYG tiene errores de validacion.", result.errors);
  }
  const payload = result.normalized;
  await basePrisma.runWithTenant(tenantId, () => basePrisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", `${tenantId}:accounting-numbering`);
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config || {};
    const accounting = config.accounting && typeof config.accounting === "object" ? config.accounting : {};
    const vehiclePyg = { source: payload.source, concepts: payload.concepts };
    await tx.tenant.update({
      where: { id: tenantId },
      data: { config: { ...config, accounting: { ...accounting, vehicle_pyg: vehiclePyg } } }
    });
    await tx.auditLog.create({
      data: {
        user_id: user?.id ?? null,
        action: "transport.pyg.account_config.updated",
        module: "accounting",
        entity: "TenantConfig",
        entity_id: String(tenantId),
        new_value: vehiclePyg
      }
    });
  }, { maxWait: 10000, timeout: 25000 }));
  await invalidateTenantCache(tenantId).catch(() => undefined);
  return { ok: true, source: payload.source, concepts: payload.concepts.length };
}

module.exports = { getAccountConfiguration, saveAccountConfiguration };
