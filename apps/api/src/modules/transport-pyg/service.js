// PYG por vehiculo (centro de costo = placa) - capa de servicio.
// Fuente del reporte en Contabilidad: siempre el libro contable (LedgerEntry)
// via getAccountingReport, sin importar la fuente guardada. getOperationalReport
// conserva el calculo legacy (liquidacion + caja menor + nomina) solo para las
// pruebas de la unidad; no existe ruta HTTP operativa.
// Todo corre dentro de prisma.runWithTenant; el SQL crudo siempre filtra tenant_id explicito.
const basePrisma = require("../../core/prisma");
const { CONCEPT_CATALOG, DEFAULT_SOURCE_MAP } = require("./concept-catalog");
const { buildReport, periodBounds } = require("./engine");
const { buildAccountingReport } = require("./account-engine");
const { validateAccountConfig, cloneProposal } = require("./account-config");

// pyg-interactive arrastra tenantCache -> Redis al requerirse; se carga solo al
// entrar por la ruta contable para no romper los flujos operativos/legacy.
function accountingSource() {
  return require("../accounting/pyg-interactive");
}

const MODULE = "accounting";
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function read(tenantId, fn) {
  if (!tenantId) throw appError(401, "PYG_TENANT_REQUIRED", "Empresa requerida.");
  return basePrisma.runWithTenant(tenantId, async () => await fn(basePrisma, tenantId));
}

function write(tenantId, fn) {
  if (!tenantId) throw appError(401, "PYG_TENANT_REQUIRED", "Empresa requerida.");
  return basePrisma.runWithTenant(tenantId, () =>
    basePrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `transport-pyg:${tenantId}`);
      return fn(tx, tenantId);
    }, { maxWait: 10000, timeout: 25000 })
  );
}

async function audit(tx, user, action, entity, entityId, newValue) {
  await tx.auditLog.create({
    data: {
      user_id: user?.id ?? null,
      action,
      module: MODULE,
      entity,
      entity_id: String(entityId ?? ""),
      ...(newValue !== undefined ? { new_value: newValue } : {})
    }
  });
}

// Siembra idempotente del catalogo de conceptos y del mapping por defecto del tenant.
async function ensureCatalog(db, tenantId) {
  for (const concept of CONCEPT_CATALOG) {
    // update vacio: un GET no puede sobrescribir nombre, orden ni defaults que
    // el tenant haya podido ajustar; solo siembra lo que falta.
    await db.transportPygConcept.upsert({
      where: { tenant_id_code: { tenant_id: tenantId, code: concept.code } },
      update: {},
      create: { tenant_id: tenantId, code: concept.code, name: concept.name, section: concept.section, kind: concept.kind, display_order: concept.order }
    });
  }
  for (const map of DEFAULT_SOURCE_MAP) {
    const existing = await db.transportPygSourceMap.findFirst({
      where: { tenant_id: tenantId, source_type: map.source_type, source_code: map.source_code }
    });
    if (!existing) {
      await db.transportPygSourceMap.create({ data: { tenant_id: tenantId, ...map } });
    }
  }
}

function assertPeriod(period) {
  const value = String(period || "").trim();
  if (!PERIOD_RE.test(value)) {
    throw appError(400, "PYG_PERIOD_INVALID", "El periodo debe tener formato YYYY-MM.");
  }
  return value;
}

async function listSourceConcepts(tenantId) {
  return read(tenantId, (db, tenant) => db.pettyCashConcept.findMany({
    where: { tenant_id: tenant, active: true },
    select: { id: true, code: true, name: true, active: true },
    orderBy: { code: "asc" }
  }));
}

async function listConcepts(tenantId) {
  return read(tenantId, async (db) => {
    await ensureCatalog(db, tenantId);
    const rows = await db.transportPygConcept.findMany({
      where: { tenant_id: tenantId, active: true },
      orderBy: { display_order: "asc" }
    });
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      section: row.section,
      kind: row.kind,
      display_order: row.display_order
    }));
  });
}

// Reporte operativo historico (liquidacion + caja menor + nomina). Ya no es la
// fuente del GET de PYG en Contabilidad: getReport siempre lee el libro contable
// (getAccountingReport). Se conserva como helper interno exportado solo para que
// las pruebas legacy de la unidad sigan ejercitando la logica sin perder cobertura.
async function getOperationalReport(tenantId, query = {}) {
  const period = assertPeriod(query.period);
  return read(tenantId, async (db, tenant) => {
    await ensureCatalog(db, tenant);
    const { start, end } = periodBounds(period);
    const [vehicles, budgets, maps, config] = await Promise.all([
      db.vehicle.findMany({
        where: { active: true, deleted_at: null },
        select: { id: true, plate: true, brand: true, line: true, authorized_driver_id: true },
        orderBy: { plate: "asc" }
      }),
      db.transportPygBudget.findMany({ where: { tenant_id: tenant, period } }),
      db.transportPygSourceMap.findMany({ where: { tenant_id: tenant, active: true } }),
      db.transportPygConfig.findFirst({ where: { tenant_id: tenant } })
    ]);

    const incomeRows = await db.$queryRaw`
      SELECT UPPER(BTRIM(i.vehicle_plate)) AS plate,
             COALESCE(SUM(COALESCE(NULLIF(i.approved_amount, 0), NULLIF(i.adjusted_amount, 0), i.calculated_amount)), 0)::float8 AS total
      FROM "TransportSettlementItem" i
      JOIN "TransportSettlementPackage" p ON p.id = i.package_id
      WHERE i.tenant_id = ${tenant}
        AND p.tenant_id = ${tenant}
        AND ((p.metadata->>'accounting_period' IS NOT NULL AND p.metadata->>'accounting_period' = ${period})
          OR (p.metadata->>'accounting_period' IS NULL AND i.service_date >= ${start}::date AND i.service_date <= ${end}::date))
        AND p.status IN ('aprobada', 'contabilizada', 'liquidada')
        AND i.vehicle_plate IS NOT NULL AND BTRIM(i.vehicle_plate) <> ''
      GROUP BY 1
    `;

    const pettyRows = await db.$queryRaw`
      SELECT UPPER(BTRIM(l.cost_center_code)) AS plate,
             UPPER(BTRIM(l.concept_code)) AS concept_code,
             COALESCE(SUM(l.total), 0)::float8 AS total
      FROM petty_cash_voucher_lines l
      JOIN petty_cash_vouchers v ON v.id = l.voucher_id
      WHERE l.tenant_id = ${tenant}
        AND v.period = ${period}
        AND l.cost_center_code IS NOT NULL AND BTRIM(l.cost_center_code) <> ''
      GROUP BY 1, 2
    `;

    // Nómina: "Payroll".period guarda el period_key de TH ("tipo:AAAA-MM-DD:AAAA-MM-DD"),
    // nunca el mes plano; se captura por traslape de rango del period_key.
    const payrollRows = await db.$queryRaw`
      SELECT employee_id, COALESCE(SUM(gross), 0)::float8 AS total
      FROM "Payroll"
      WHERE tenant_id = ${tenant}
        AND (
          period = ${period}
          OR (position(':' in period) > 0
              AND split_part(period, ':', 2)::date <= ${end}::date
              AND split_part(period, ':', 3)::date >= ${start}::date)
        )
      GROUP BY employee_id
    `;

    const pilaRows = await db.$queryRaw`
      SELECT l.employee_id, COALESCE(SUM(l.employee_amount + l.employer_amount), 0)::float8 AS total
      FROM th_aportes_sociales_lineas l
      JOIN th_aportes_sociales_documentos d ON d.id = l.document_id
      WHERE l.tenant_id = ${tenant}
        AND d.date_start <= ${end}::date AND d.date_end >= ${start}::date
      GROUP BY l.employee_id
    `;

    const provisionRows = await db.$queryRaw`
      SELECT employee_id, COALESCE(SUM(accrued_amount), 0)::float8 AS total
      FROM th_prestaciones_saldos
      WHERE tenant_id = ${tenant}
        AND date_start <= ${end}::date AND date_end >= ${start}::date
      GROUP BY employee_id
    `;

    return buildReport({
      period,
      concepts: CONCEPT_CATALOG,
      vehicles,
      budgets,
      incomeRows,
      pettyRows,
      payrollRows,
      pilaRows,
      provisionRows,
      sourceMaps: maps,
      taxPercent: config ? Number(config.tax_percent) : 2.25
    });
  });
}

// Fuente contable: LedgerEntry una sola vez via getInteractivePyg (archivo
// protegido, sin modificarlo). Solo se extraen las hojas terminales de centro
// de costo con cuenta PUC real; los padres nunca se suman. El presupuesto
// viene del almacen accounting.pyg_budgets a traves del mismo reporte.
// currentPuc.name llega como "codigo · nombre" (accountLabel de pyg-interactive);
// se quita solo ese prefijo exacto para no borrar numeros propios del nombre.
function cleanAccountName(rawName, accountCode) {
  const name = String(rawName || "");
  const code = String(accountCode || "");
  const prefix = `${code} \u00b7 `;
  if (code && name.startsWith(prefix)) return name.slice(prefix.length);
  return name || code;
}

function extractInteractiveLeaves(nodes) {
  const leaves = [];
  function walk(node, puc, branch) {
    let currentPuc = puc;
    let currentBranch = branch;
    if (node.dimension === "puc") currentPuc = node;
    else if (node.dimension === "branch") currentBranch = node;
    else if (node.dimension === "cost_center" && node.is_leaf) {
      if (currentPuc && currentPuc.account_id !== null && currentPuc.account_id !== undefined) {
        const rawCode = String(node.code || "");
        const separator = rawCode.indexOf("|");
        const center = separator >= 0 ? rawCode.slice(separator + 1) : rawCode;
        const accountCode = String(currentPuc.code || "");
        leaves.push({
          account_id: currentPuc.account_id,
          account_code: accountCode,
          account_name: cleanAccountName(currentPuc.name, accountCode),
          branch: currentBranch ? String(currentBranch.code || "") : "",
          branch_name: currentBranch ? String(currentBranch.name || currentBranch.code || "") : "",
          center,
          center_name: String(node.name || center || "Sin centro de costo"),
          actual_cents: Number(node.amount_cents || 0),
          // budget_cents del arbol es 0 aunque no haya presupuesto: la
          // presencia real la marca budget_rows.
          budget_cents: node.budget_rows > 0 ? Number(node.budget_cents || 0) : null,
          budget_months: node.budget_rows > 0 && Array.isArray(node.budget_months_found) ? node.budget_months_found : []
        });
      }
    }
    for (const child of node.children || []) walk(child, currentPuc, currentBranch);
  }
  for (const root of nodes || []) walk(root, null, null);
  return leaves;
}

// Sin configuracion guardada de conceptos no hay fallback que avisar: se usa la
// propuesta del Excel en memoria (sin persistirla). Si la config guardada existe
// pero es invalida, se cae a la propuesta con aviso para no romper el reporte.
function resolveAccountingConcepts(vehiclePyg, warnings) {
  const stored = vehiclePyg && Array.isArray(vehiclePyg.concepts) ? vehiclePyg.concepts : [];
  if (!stored.length) return cloneProposal().concepts;
  const result = validateAccountConfig({ source: "accounting", concepts: stored });
  if (result.ok) return result.normalized.concepts;
  warnings.push({
    code: "VEHICLE_PYG_CONFIG_FALLBACK",
    message: "La configuracion guardada de conceptos PYG es invalida; se muestra la propuesta del Excel. Guarde la configuracion para corregirla."
  });
  return cloneProposal().concepts;
}

// El GET del reporte PYG en Contabilidad siempre lee lo contabilizado en el
// libro (LedgerEntry) para el mes calendario pedido, sin importar la fuente
// guardada ni la preseleccion de fuente. No siembra catalogo ni escribe config:
// la resolucion de conceptos parte del tenant config y, si falta, usa la
// propuesta del Excel en memoria (sin persistirla).
async function getReport(tenantId, query = {}) {
  const period = assertPeriod(query.period);
  return read(tenantId, async (db, tenant) => {
    const tenantRow = await db.tenant.findUnique({ where: { id: tenant }, select: { config: true } });
    const vehiclePyg = tenantRow?.config?.accounting?.vehicle_pyg || null;
    return getAccountingReport(db, tenant, period, vehiclePyg);
  });
}

async function getAccountingReport(db, tenantId, period, vehiclePyg) {
  const { getInteractivePyg, parseOrganizationTree } = accountingSource();
  const tenantRow = await db.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
  const tree = parseOrganizationTree(tenantRow?.config);
  const pygConfig = await db.transportPygConfig.findFirst({ where: { tenant_id: tenantId } });
  const vehicles = await db.vehicle.findMany({
    where: { active: true, deleted_at: null },
    select: { id: true, plate: true, brand: true, line: true, authorized_driver_id: true },
    orderBy: { plate: "asc" }
  });
  const interactive = await getInteractivePyg(tenantId, {
    period,
    mode: "month",
    dimensions: "puc,branch,cost_center"
  });
  const fallbackWarnings = [];
  const concepts = resolveAccountingConcepts(vehiclePyg, fallbackWarnings);
  // getInteractivePyg ya entrega solo hojas de resultado (clases 4-7 mas
  // cuentas income/expense); no se re-filtra por Account.type ni por plan.
  const leaves = extractInteractiveLeaves(interactive.nodes);
  const report = buildAccountingReport({
    period,
    concepts,
    vehicles,
    tree,
    leaves,
    interactive,
    taxPercent: pygConfig ? Number(pygConfig.tax_percent) : 2.25
  });
  if (fallbackWarnings.length) report.warnings.unshift(...fallbackWarnings);
  return report;
}

async function getBudgets(tenantId, query = {}) {
  const period = assertPeriod(query.period);
  return read(tenantId, async (db) => {
    const rows = await db.transportPygBudget.findMany({ where: { tenant_id: tenantId, period }, orderBy: { vehicle_id: "asc" } });
    return {
      period,
      rows: rows.map((row) => ({ vehicle_id: row.vehicle_id, concept_code: row.concept_code, amount: Number(row.amount) }))
    };
  });
}

async function saveBudgets(tenantId, user, input = {}) {
  const period = assertPeriod(input.period);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) throw appError(400, "PYG_BUDGETS_EMPTY", "Debe enviar al menos una fila de presupuesto.");
  if (rows.length > 2000) throw appError(400, "PYG_BUDGETS_TOO_LARGE", "Maximo 2000 filas de presupuesto por solicitud.");
  return write(tenantId, async (tx) => {
    const conceptCodes = new Set(CONCEPT_CATALOG.map((concept) => concept.code));
    for (const row of rows) {
      const vehicleId = Number(row.vehicle_id);
      const conceptCode = String(row.concept_code || "").trim().toUpperCase();
      const amount = Number(row.amount);
      if (!Number.isInteger(vehicleId) || vehicleId <= 0) throw appError(400, "PYG_BUDGET_VEHICLE_INVALID", "Cada fila requiere vehicle_id entero positivo.");
      if (!conceptCodes.has(conceptCode)) throw appError(400, "PYG_BUDGET_CONCEPT_INVALID", `El concepto PYG ${conceptCode} no existe.`);
      if (!Number.isFinite(amount) || amount < 0) throw appError(400, "PYG_BUDGET_AMOUNT_INVALID", "El monto del presupuesto debe ser un numero mayor o igual a 0.");
      const vehicle = await tx.vehicle.findFirst({ where: { id: vehicleId } });
      if (!vehicle) throw appError(404, "PYG_VEHICLE_NOT_FOUND", `El vehiculo ${vehicleId} no existe en la empresa activa.`);
      await tx.transportPygBudget.upsert({
        where: { tenant_id_vehicle_id_period_concept_code: { tenant_id: tenantId, vehicle_id: vehicleId, period, concept_code: conceptCode } },
        update: { amount, created_by: user?.id ?? null },
        create: { tenant_id: tenantId, vehicle_id: vehicleId, period, concept_code: conceptCode, amount, created_by: user?.id ?? null }
      });
    }
    await audit(tx, user, "transport.pyg.budgets.updated", "TransportPygBudget", period, { rows: rows.length });
    return { ok: true, period, upserted: rows.length };
  });
}

async function getMapping(tenantId) {
  return read(tenantId, async (db) => {
    await ensureCatalog(db, tenantId);
    const rows = await db.transportPygSourceMap.findMany({ where: { tenant_id: tenantId }, orderBy: [{ source_type: "asc" }, { source_code: "asc" }] });
    return { rows: rows.map((row) => ({ source_type: row.source_type, source_code: row.source_code, pyg_concept_code: row.pyg_concept_code, active: row.active })) };
  });
}

async function saveMapping(tenantId, user, input = {}) {
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (!rows.length) throw appError(400, "PYG_MAPPING_EMPTY", "Debe enviar al menos una fila de mapping.");
  return write(tenantId, async (tx) => {
    const conceptCodes = new Set(CONCEPT_CATALOG.map((concept) => concept.code));
    for (const row of rows) {
      const sourceType = String(row.source_type || "petty_cash_concept").trim();
      const sourceCode = String(row.source_code || "").trim().toUpperCase();
      const pygCode = String(row.pyg_concept_code || "").trim().toUpperCase();
      if (sourceType !== "petty_cash_concept") throw appError(400, "PYG_MAPPING_SOURCE_INVALID", "source_type soportado: petty_cash_concept.");
      if (!sourceCode) throw appError(400, "PYG_MAPPING_SOURCE_CODE_REQUIRED", "source_code es obligatorio.");
      const existing = await tx.transportPygSourceMap.findFirst({ where: { tenant_id: tenantId, source_type: sourceType, source_code: sourceCode } });
      // Fila vacia: desactiva el mapping para que el concepto vuelva a "sin clasificar" en el reporte.
      if (!pygCode) {
        if (existing) await tx.transportPygSourceMap.update({ where: { id: existing.id }, data: { pyg_concept_code: "", active: false } });
        continue;
      }
      if (!conceptCodes.has(pygCode)) throw appError(400, "PYG_MAPPING_CONCEPT_INVALID", `El concepto PYG ${pygCode} no existe.`);
      const active = row.active !== false;
      if (existing) {
        await tx.transportPygSourceMap.update({ where: { id: existing.id }, data: { pyg_concept_code: pygCode, active } });
      } else {
        await tx.transportPygSourceMap.create({ data: { tenant_id: tenantId, source_type: sourceType, source_code: sourceCode, pyg_concept_code: pygCode, active } });
      }
    }
    await audit(tx, user, "transport.pyg.mapping.updated", "TransportPygSourceMap", "bulk", { rows: rows.length });
    return { ok: true, upserted: rows.length };
  });
}

async function getConfig(tenantId) {
  return read(tenantId, async (db) => {
    const config = await db.transportPygConfig.findFirst({ where: { tenant_id: tenantId } });
    return { tax_percent: config ? Number(config.tax_percent) : 2.25 };
  });
}

async function saveConfig(tenantId, user, input = {}) {
  const taxPercent = Number(input.tax_percent);
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) {
    throw appError(400, "PYG_TAX_INVALID", "tax_percent debe estar entre 0 y 100.");
  }
  return write(tenantId, async (tx) => {
    await tx.transportPygConfig.upsert({
      where: { tenant_id: tenantId },
      update: { tax_percent: taxPercent },
      create: { tenant_id: tenantId, tax_percent: taxPercent }
    });
    await audit(tx, user, "transport.pyg.config.updated", "TransportPygConfig", tenantId, { tax_percent: taxPercent });
    return { ok: true, tax_percent: taxPercent };
  });
}

module.exports = { listSourceConcepts, listConcepts, getReport, getOperationalReport, getBudgets, saveBudgets, getMapping, saveMapping, getConfig, saveConfig, ensureCatalog };
