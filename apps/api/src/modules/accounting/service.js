const prisma = require("../../core/prisma");

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const PUC_CO = [
  { code: "1105", name: "Caja", type: "asset" },
  { code: "1110", name: "Bancos", type: "asset" },
  { code: "1305", name: "Clientes", type: "asset" },
  { code: "1330", name: "Anticipos y Avances", type: "asset" },
  { code: "1435", name: "Inventarios", type: "asset" },
  { code: "1524", name: "Equipo de Oficina", type: "asset" },
  { code: "1540", name: "Flota y Equipo Transporte", type: "asset" },
  { code: "2105", name: "Obligaciones Financieras", type: "liability" },
  { code: "2205", name: "Proveedores", type: "liability" },
  { code: "2335", name: "Costos y Gastos por Pagar", type: "liability" },
  { code: "2365", name: "Retencion en la Fuente", type: "liability" },
  { code: "2408", name: "IVA por Pagar", type: "liability" },
  { code: "2610", name: "Obligaciones Laborales", type: "liability" },
  { code: "3105", name: "Capital Social", type: "equity" },
  { code: "3605", name: "Utilidad del Ejercicio", type: "equity" },
  { code: "4135", name: "Ingresos por Ventas", type: "income" },
  { code: "4175", name: "Ingresos por Servicios", type: "income" },
  { code: "5105", name: "Costo de Ventas", type: "expense" },
  { code: "5195", name: "Gastos de Inventario", type: "expense" },
  { code: "5205", name: "Sueldos y Salarios", type: "expense" },
  { code: "5210", name: "Horas Extras", type: "expense" },
  { code: "5220", name: "Auxilio de Transporte", type: "expense" },
  { code: "5260", name: "Aportes EPS", type: "expense" },
  { code: "5270", name: "Aportes Pensiones", type: "expense" },
  { code: "5290", name: "Aportes SENA ICBF CCF", type: "expense" },
  { code: "5320", name: "Arrendamientos", type: "expense" },
  { code: "5360", name: "Servicios Publicos", type: "expense" },
  { code: "5395", name: "Otros Gastos", type: "expense" }
];

const TAX_ACCOUNT_PREFIXES = ["2365", "2367", "2368", "2408", "2410"];
const RECEIVABLE_TYPES = ["invoice", "sale", "receivable"];
const PAYABLE_TYPES = ["purchase", "bill", "payable", "expense"];
const DEFAULT_DOCUMENT_TYPES = [
  { code: "11", description: "Registro civil" },
  { code: "12", description: "Tarjeta de identidad" },
  { code: "13", description: "Cedula de ciudadania" },
  { code: "21", description: "Tarjeta de extranjeria" },
  { code: "22", description: "Cedula de extranjeria" },
  { code: "31", description: "NIT" },
  { code: "41", description: "Pasaporte" },
  { code: "42", description: "Documento de identificacion extranjero" },
  { code: "43", description: "Sin identificacion del exterior o para uso definido por la DIAN" },
  { code: "47", description: "Permiso especial de permanencia PEP" },
  { code: "50", description: "NIT de otro pais" },
  { code: "91", description: "NUIP" }
].map((row) => ({ ...row, active: true, source: "DIAN" }));
const DEFAULT_DANE_LOCATIONS = [
  { dane_code: "11001", city: "Bogota, D.C.", department: "Bogota, D.C." },
  { dane_code: "05001", city: "Medellin", department: "Antioquia" },
  { dane_code: "76001", city: "Cali", department: "Valle del Cauca" },
  { dane_code: "08001", city: "Barranquilla", department: "Atlantico" },
  { dane_code: "13001", city: "Cartagena de Indias", department: "Bolivar" },
  { dane_code: "68001", city: "Bucaramanga", department: "Santander" },
  { dane_code: "66001", city: "Pereira", department: "Risaralda" },
  { dane_code: "17001", city: "Manizales", department: "Caldas" },
  { dane_code: "73001", city: "Ibague", department: "Tolima" },
  { dane_code: "54001", city: "Cucuta", department: "Norte de Santander" }
].map((row) => ({ ...row, active: true, source: "DANE" }));

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function periodBounds(period) {
  const [year, month] = String(period).split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) throw appError(400, "INVALID_PERIOD", "El periodo debe tener formato YYYY-MM");
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0, 23, 59, 59, 999)
  };
}

function periodFromDate(date) {
  return new Date(date).toISOString().substring(0, 7);
}

function accountNature(type) {
  return ["asset", "expense"].includes(type) ? "debit" : "credit";
}

function pucBreakdown(code) {
  const value = String(code || "");
  return {
    class: value.slice(0, 1) || null,
    group: value.slice(0, 2) || null,
    account: value.slice(0, 4) || null,
    subaccount: value.length >= 6 ? value.slice(0, 6) : null,
    auxiliary: value.length > 6 ? value : null
  };
}

function accountDto(account) {
  const breakdown = pucBreakdown(account.code);
  return {
    ...account,
    nature: accountNature(account.type),
    puc: breakdown,
    requires_third_party: ["1305", "2205", "2365", "2408"].some((prefix) => account.code.startsWith(prefix)),
    requires_cost_center: ["4", "5", "6", "7"].includes(breakdown.class),
    handles_tax: TAX_ACCOUNT_PREFIXES.some((prefix) => account.code.startsWith(prefix)),
    status: account.active ? "active" : "inactive"
  };
}

function calculateVerificationDigit(taxId) {
  const digits = String(taxId || "").replace(/\D/g, "");
  const weights = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
  const padded = digits.padStart(15, "0");
  const sum = padded.split("").reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  const mod = sum % 11;
  return mod > 1 ? 11 - mod : mod;
}

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function fullNaturalName(data) {
  return [
    data.first_name || data.metadata?.first_name,
    data.middle_name || data.metadata?.middle_name,
    data.first_last_name || data.metadata?.first_last_name,
    data.second_last_name || data.metadata?.second_last_name
  ].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

async function getAccountingConfig(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
  const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
  return config.accounting && typeof config.accounting === "object" ? config.accounting : {};
}

async function updateAccountingConfig(tenantId, accounting) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
  const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
  return prisma.tenant.update({
    where: { id: tenantId },
    data: { config: { ...config, accounting: { ...(config.accounting || {}), ...accounting } } },
    select: { config: true }
  });
}

function normalizeCode(value) {
  return String(value || "").trim();
}

function normalizeDocumentTypeInput(value) {
  const text = normalizeCode(value).toUpperCase();
  const legacy = {
    NIT: "31",
    CC: "13",
    CEDULA: "13",
    CE: "22",
    PAS: "41",
    PASAPORTE: "41",
    TI: "12",
    RC: "11"
  };
  return legacy[text] || text || "31";
}

function activeRows(rows) {
  return rows.filter((row) => row.active !== false);
}

function mergeByCode(defaults, custom, key) {
  const rows = new Map();
  for (const row of defaults) rows.set(normalizeCode(row[key]), row);
  for (const row of custom || []) {
    const code = normalizeCode(row[key]);
    if (code) rows.set(code, { ...rows.get(code), ...row, [key]: code });
  }
  return Array.from(rows.values()).sort((a, b) => normalizeCode(a[key]).localeCompare(normalizeCode(b[key])));
}

function defaultOrganizationTree(tenantId) {
  return {
    societies: [{
      code: "SOC-01",
      name: "Sociedad principal",
      tenant_id: tenantId,
      active: true
    }],
    branches: [],
    cost_centers: []
  };
}

function normalizeOrganizationTree(accounting, tenantId) {
  const tree = accounting.organization_tree || defaultOrganizationTree(tenantId);
  return {
    societies: Array.isArray(tree.societies) ? tree.societies : [],
    branches: Array.isArray(tree.branches) ? tree.branches : [],
    cost_centers: Array.isArray(tree.cost_centers) ? tree.cost_centers : []
  };
}

async function getThirdPartyMasters(tenantId) {
  const accounting = await getAccountingConfig(tenantId);
  const masters = accounting.third_party_masters || {};
  return {
    document_types: mergeByCode(DEFAULT_DOCUMENT_TYPES, masters.document_types, "code"),
    locations: mergeByCode(DEFAULT_DANE_LOCATIONS, masters.locations, "dane_code")
  };
}

async function updateThirdPartyMasterRow(tenantId, collection, key, row) {
  const accounting = await getAccountingConfig(tenantId);
  const masters = accounting.third_party_masters || {};
  const existing = Array.isArray(masters[collection]) ? masters[collection] : [];
  const code = normalizeCode(row[key]);
  const nextRows = [...existing.filter((item) => normalizeCode(item[key]) !== code), { ...row, [key]: code, active: row.active !== false }];
  await updateAccountingConfig(tenantId, {
    third_party_masters: {
      ...masters,
      [collection]: nextRows
    }
  });
  return getThirdPartyMasters(tenantId);
}

async function saveDocumentTypeMaster(tenantId, data) {
  const code = normalizeCode(data.code);
  const description = String(data.description || "").trim();
  if (!code || !description) throw appError(400, "REQUIRED_DOCUMENT_TYPE", "Codigo y descripcion son obligatorios");
  return updateThirdPartyMasterRow(tenantId, "document_types", "code", {
    code,
    description,
    active: data.active !== false,
    source: "Empresa"
  });
}

async function saveDaneLocationMaster(tenantId, data) {
  const daneCode = normalizeCode(data.dane_code);
  const city = String(data.city || "").trim();
  const department = String(data.department || "").trim();
  if (!daneCode || !city || !department) throw appError(400, "REQUIRED_DANE_LOCATION", "Codigo DANE, ciudad y departamento son obligatorios");
  return updateThirdPartyMasterRow(tenantId, "locations", "dane_code", {
    dane_code: daneCode,
    city,
    department,
    active: data.active !== false,
    source: "Empresa"
  });
}

async function getOrganizationTree(tenantId) {
  const accounting = await getAccountingConfig(tenantId);
  const tree = normalizeOrganizationTree(accounting, tenantId);
  if (!tree.societies.length) return defaultOrganizationTree(tenantId);
  return tree;
}

async function saveOrganizationUnit(tenantId, data) {
  const type = data.type;
  const code = normalizeCode(data.code);
  const name = String(data.name || "").trim();
  if (!code || !name) throw appError(400, "REQUIRED_ORG_UNIT", "Codigo y nombre son obligatorios");

  const accounting = await getAccountingConfig(tenantId);
  const tree = normalizeOrganizationTree(accounting, tenantId);
  const active = data.active !== false;

  if (type === "society") {
    const row = { code, name, tenant_id: tenantId, active };
    const societies = [...tree.societies.filter((item) => item.code !== code), row].sort((a, b) => a.code.localeCompare(b.code));
    await updateAccountingConfig(tenantId, { organization_tree: { ...tree, societies } });
    return getOrganizationTree(tenantId);
  }

  if (type === "branch") {
    const societyCode = normalizeCode(data.society_code);
    if (!tree.societies.some((item) => item.code === societyCode && item.active !== false)) {
      throw appError(400, "SOCIETY_REQUIRED", "La sucursal debe estar enlazada a una sociedad activa");
    }
    const row = { code, name, society_code: societyCode, active };
    const branches = [...tree.branches.filter((item) => item.code !== code), row].sort((a, b) => a.code.localeCompare(b.code));
    await updateAccountingConfig(tenantId, { organization_tree: { ...tree, branches } });
    return getOrganizationTree(tenantId);
  }

  const societyCode = normalizeCode(data.society_code);
  const branchCode = normalizeCode(data.branch_code);
  const branch = tree.branches.find((item) => item.code === branchCode && item.active !== false);
  if (!branch || branch.society_code !== societyCode) {
    throw appError(400, "BRANCH_REQUIRED", "El centro de costo debe estar enlazado a una sucursal de la sociedad seleccionada");
  }
  const row = { code, name, society_code: societyCode, branch_code: branchCode, active };
  const costCenters = [...tree.cost_centers.filter((item) => item.code !== code), row].sort((a, b) => a.code.localeCompare(b.code));
  await updateAccountingConfig(tenantId, { organization_tree: { ...tree, cost_centers: costCenters } });
  return getOrganizationTree(tenantId);
}

async function countOrganizationAccountingReferences(tenantId, type, code) {
  const metadataKeys = type === "society" ? ["society_code", "society"]
    : type === "branch" ? ["branch_code", "branch"]
      : ["cost_center_code", "cost_center"];
  return prisma.runWithTenant(tenantId, async () => {
    let count = 0;
    for (const key of metadataKeys) {
      count += await prisma.transaction.count({
        where: {
          metadata: {
            path: [key],
            equals: code
          }
        }
      });
    }
    return count;
  });
}

async function deleteOrganizationUnit(tenantId, type, codeInput) {
  const code = normalizeCode(codeInput);
  const accounting = await getAccountingConfig(tenantId);
  const tree = normalizeOrganizationTree(accounting, tenantId);
  const references = await countOrganizationAccountingReferences(tenantId, type, code);
  if (references > 0) {
    throw appError(409, "ORG_UNIT_HAS_ACCOUNTING_RECORDS", "No se puede borrar porque tiene registros contables asociados");
  }

  if (type === "society") {
    if (tree.branches.some((item) => item.society_code === code)) {
      throw appError(409, "SOCIETY_HAS_BRANCHES", "No se puede borrar una sociedad con sucursales enlazadas");
    }
    const societies = tree.societies.filter((item) => item.code !== code);
    if (societies.length === tree.societies.length) throw appError(404, "ORG_UNIT_NOT_FOUND", "Sociedad no encontrada");
    await updateAccountingConfig(tenantId, { organization_tree: { ...tree, societies } });
    return getOrganizationTree(tenantId);
  }

  if (type === "branch") {
    if (tree.cost_centers.some((item) => item.branch_code === code)) {
      throw appError(409, "BRANCH_HAS_COST_CENTERS", "No se puede borrar una sucursal con centros de costo enlazados");
    }
    const branches = tree.branches.filter((item) => item.code !== code);
    if (branches.length === tree.branches.length) throw appError(404, "ORG_UNIT_NOT_FOUND", "Sucursal no encontrada");
    await updateAccountingConfig(tenantId, { organization_tree: { ...tree, branches } });
    return getOrganizationTree(tenantId);
  }

  if (type !== "cost_center") throw appError(400, "INVALID_ORG_UNIT_TYPE", "Tipo de estructura invalido");
  const costCenters = tree.cost_centers.filter((item) => item.code !== code);
  if (costCenters.length === tree.cost_centers.length) throw appError(404, "ORG_UNIT_NOT_FOUND", "Centro de costo no encontrado");
  await updateAccountingConfig(tenantId, { organization_tree: { ...tree, cost_centers: costCenters } });
  return getOrganizationTree(tenantId);
}

async function validateThirdPartyMasters(tenantId, data) {
  const masters = await getThirdPartyMasters(tenantId);
  const documentType = normalizeDocumentTypeInput(data.document_type || data.tax_type || data.metadata?.document_type || "31");
  const validDocumentTypes = new Set(activeRows(masters.document_types).map((item) => normalizeCode(item.code)));
  if (!validDocumentTypes.has(documentType)) {
    throw appError(400, "DOCUMENT_TYPE_NOT_IN_MASTER", "El tipo de documento debe existir en el maestro de tipos de documento");
  }

  const daneCode = normalizeCode(data.dane_code || data.metadata?.dane_code);
  if (!daneCode) return { documentType };
  const location = activeRows(masters.locations).find((item) => normalizeCode(item.dane_code) === daneCode);
  if (!location) throw appError(400, "DANE_LOCATION_NOT_IN_MASTER", "La ciudad/departamento debe existir en el maestro DANE");
  return { documentType, location };
}

async function assertPeriodOpen(tenantId, date) {
  const period = periodFromDate(date);
  const accounting = await getAccountingConfig(tenantId);
  const status = accounting.periods?.[period]?.status;
  if (status === "closed") throw appError(423, "PERIOD_CLOSED", `El periodo contable ${period} esta cerrado`);
}

async function initChartOfAccounts(tenantId, country = "CO") {
  return prisma.runWithTenant(tenantId, async () => {
    const plan = country === "CO" ? PUC_CO : PUC_CO;
    const existing = await prisma.account.findMany({ select: { code: true } });
    const existingCodes = new Set(existing.map((row) => row.code));
    const missing = plan.filter((account) => !existingCodes.has(account.code));
    if (missing.length) {
      await prisma.account.createMany({
        data: missing.map((account) => ({ code: account.code, name: account.name, type: account.type, allows_tx: true, active: true }))
      });
    }
    const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } });
    return accounts.map(accountDto);
  });
}

async function listAccounts(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {};
    if (query.active !== undefined) where.active = String(query.active) !== "false";
    if (query.type) where.type = query.type;
    if (query.search) {
      where.OR = [
        { code: { contains: String(query.search), mode: "insensitive" } },
        { name: { contains: String(query.search), mode: "insensitive" } }
      ];
    }
    const accounts = await prisma.account.findMany({ where, orderBy: { code: "asc" } });
    return accounts.map(accountDto);
  });
}

async function createAccount(tenantId, data) {
  const code = String(data.code || "").trim();
  const name = String(data.name || "").trim();
  if (!code || !name) throw appError(400, "REQUIRED_ACCOUNT", "Codigo y nombre son obligatorios");
  return prisma.runWithTenant(tenantId, async () => {
    const existing = await prisma.account.findFirst({ where: { code } });
    if (existing) throw appError(409, "ACCOUNT_EXISTS", `La cuenta ${code} ya existe`);
    const account = await prisma.account.create({
      data: {
        code,
        name,
        type: data.type || "asset",
        parent_id: data.parent_id || null,
        level: data.level || Math.max(1, Math.ceil(code.length / 2)),
        allows_tx: data.allows_tx !== false,
        active: data.active !== false
      }
    });
    return accountDto(account);
  });
}

async function updateAccount(tenantId, id, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const account = await prisma.account.findFirst({ where: { id: Number(id) } });
    if (!account) throw appError(404, "ACCOUNT_NOT_FOUND", "Cuenta no encontrada");
    const updated = await prisma.account.update({
      where: { id: account.id },
      data: {
        name: data.name === undefined ? account.name : String(data.name).trim(),
        type: data.type || account.type,
        parent_id: data.parent_id === undefined ? account.parent_id : data.parent_id,
        level: data.level === undefined ? account.level : data.level,
        allows_tx: data.allows_tx === undefined ? account.allows_tx : Boolean(data.allows_tx),
        active: data.active === undefined ? account.active : Boolean(data.active)
      }
    });
    return accountDto(updated);
  });
}

async function deleteAccount(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const account = await prisma.account.findFirst({
      where: { id: Number(id) },
      include: { entries: { take: 1 } }
    });
    if (!account) throw appError(404, "ACCOUNT_NOT_FOUND", "Cuenta no encontrada");
    const child = await prisma.account.findFirst({ where: { parent_id: account.id } });
    if (account.entries.length || child) {
      return accountDto(await prisma.account.update({ where: { id: account.id }, data: { active: false } }));
    }
    await prisma.account.delete({ where: { id: account.id } });
    return { ok: true };
  });
}

async function journalEntry(tenantId, data) {
  const { description, date = new Date(), transaction_id = null, entries = [] } = data;
  if (!description.trim()) throw appError(400, "REQUIRED_DESCRIPTION", "La descripcion del asiento es obligatoria");
  if (entries.length < 2) throw appError(400, "MIN_ENTRIES", "El asiento requiere al menos dos lineas");

  const totalDebit = entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
  const totalCredit = entries.reduce((sum, entry) => sum + (entry.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw appError(422, "UNBALANCED_ENTRY", `Partida no cuadra: Debito ${totalDebit.toFixed(2)}, Credito ${totalCredit.toFixed(2)}`);
  }

  await assertPeriodOpen(tenantId, date);
  const period = periodFromDate(date);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const created = [];
    for (const entry of entries) {
      const account = await tx.account.findFirst({
        where: { code: { startsWith: String(entry.account) }, active: true }
      });
      if (!account) throw appError(404, "ACCOUNT_NOT_FOUND", `Cuenta ${entry.account} no encontrada`);
      created.push(await tx.ledgerEntry.create({
        data: {
          account_id: account.id,
          transaction_id,
          date: new Date(date),
          debit: entry.debit || 0,
          credit: entry.credit || 0,
          balance: 0,
          description,
          period
        }
      }));
    }
    return created;
  }));
}

async function getBalanceSheet(tenantId, period = null) {
  return prisma.runWithTenant(tenantId, async () => {
    const dateFilter = period ? { lte: periodBounds(period).end } : { lte: new Date() };
    const accounts = await prisma.account.findMany({
      where: { active: true },
      include: { entries: { where: { date: dateFilter } } },
      orderBy: { code: "asc" }
    });

    const grouped = { assets: [], liabilities: [], equity: [], income: [], expense: [] };
    for (const account of accounts) {
      const totalDebit = account.entries.reduce((sum, row) => sum + row.debit, 0);
      const totalCredit = account.entries.reduce((sum, row) => sum + row.credit, 0);
      const debitNature = ["asset", "expense"].includes(account.type);
      const balance = debitNature ? totalDebit - totalCredit : totalCredit - totalDebit;
      if (Math.abs(balance) < 0.0001) continue;
      const key = account.type === "asset" ? "assets"
        : account.type === "liability" ? "liabilities"
          : account.type === "equity" ? "equity"
            : account.type === "income" ? "income" : "expense";
      grouped[key].push({ code: account.code, name: account.name, balance: Math.round(balance * 100) / 100 });
    }

    const sum = (rows) => Math.round(rows.reduce((acc, row) => acc + row.balance, 0) * 100) / 100;
    const totalAssets = sum(grouped.assets);
    const totalLiabilities = sum(grouped.liabilities);
    const totalEquity = sum(grouped.equity);
    return {
      period: period || new Date().toISOString().substring(0, 7),
      assets: { total: totalAssets, accounts: grouped.assets },
      liabilities: { total: totalLiabilities, accounts: grouped.liabilities },
      equity: { total: totalEquity, accounts: grouped.equity },
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) <= 0.01
    };
  });
}

async function getIncomeStatement(tenantId, period) {
  if (!period) throw appError(400, "REQUIRED_PERIOD", "El periodo YYYY-MM es obligatorio");
  return prisma.runWithTenant(tenantId, async () => {
    const bounds = periodBounds(period);
    const dateRange = { gte: bounds.start, lte: bounds.end };
    const accounts = await prisma.account.findMany({
      where: { active: true, type: { in: ["income", "expense"] } },
      include: { entries: { where: { date: dateRange } } },
      orderBy: { code: "asc" }
    });

    const income = [];
    const cogs = [];
    const opex = [];
    for (const account of accounts) {
      const debit = account.entries.reduce((sum, row) => sum + row.debit, 0);
      const credit = account.entries.reduce((sum, row) => sum + row.credit, 0);
      const balance = account.type === "income" ? credit - debit : debit - credit;
      if (Math.abs(balance) < 0.0001) continue;
      const row = { code: account.code, name: account.name, balance: Math.round(balance * 100) / 100 };
      if (account.type === "income") income.push(row);
      else if (account.code.startsWith("5105") || account.code.startsWith("5195")) cogs.push(row);
      else opex.push(row);
    }

    const totalIncome = income.reduce((sum, row) => sum + row.balance, 0);
    const totalCOGS = cogs.reduce((sum, row) => sum + row.balance, 0);
    const totalOPEX = opex.reduce((sum, row) => sum + row.balance, 0);
    const grossProfit = totalIncome - totalCOGS;
    const operatingProfit = grossProfit - totalOPEX;
    const pct = (n, d) => (d > 0 ? Math.round((n / d) * 10000) / 100 : 0);

    return {
      period,
      income: { total: Math.round(totalIncome * 100) / 100, accounts: income },
      cogs: { total: Math.round(totalCOGS * 100) / 100, accounts: cogs },
      gross_profit: Math.round(grossProfit * 100) / 100,
      gross_margin_pct: pct(grossProfit, totalIncome),
      operating_expenses: { total: Math.round(totalOPEX * 100) / 100, accounts: opex },
      operating_profit: Math.round(operatingProfit * 100) / 100,
      net_margin_pct: pct(operatingProfit, totalIncome)
    };
  });
}

async function getLedgerByAccount(tenantId, accountCode, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const account = await prisma.account.findFirst({ where: { code: { startsWith: String(accountCode) } } });
    if (!account) throw appError(404, "ACCOUNT_NOT_FOUND", "Cuenta no encontrada");
    const where = { account_id: account.id };
    if (query.period) {
      const bounds = periodBounds(query.period);
      where.date = { gte: bounds.start, lte: bounds.end };
    }
    const entries = await prisma.ledgerEntry.findMany({ where, orderBy: [{ date: "asc" }, { id: "asc" }] });
    let running = 0;
    const debitNature = ["asset", "expense"].includes(account.type);
    return {
      account: accountDto(account),
      period: query.period || null,
      entries: entries.map((entry) => {
        running += debitNature ? entry.debit - entry.credit : entry.credit - entry.debit;
        return { ...entry, running_balance: round(running) };
      }),
      totals: {
        debit: round(entries.reduce((sum, row) => sum + row.debit, 0)),
        credit: round(entries.reduce((sum, row) => sum + row.credit, 0)),
        balance: round(running)
      }
    };
  });
}

async function getTrialBalance(tenantId, period) {
  return prisma.runWithTenant(tenantId, async () => {
    const dateFilter = period ? { lte: periodBounds(period).end } : { lte: new Date() };
    const accounts = await prisma.account.findMany({
      where: { active: true },
      include: { entries: { where: { date: dateFilter } } },
      orderBy: { code: "asc" }
    });
    const rows = accounts.map((account) => {
      const debit = round(account.entries.reduce((sum, row) => sum + row.debit, 0));
      const credit = round(account.entries.reduce((sum, row) => sum + row.credit, 0));
      const balance = ["asset", "expense"].includes(account.type) ? debit - credit : credit - debit;
      return { code: account.code, name: account.name, type: account.type, debit, credit, balance: round(balance) };
    }).filter((row) => row.debit || row.credit || row.balance);
    return {
      period: period || periodFromDate(new Date()),
      rows,
      totals: {
        debit: round(rows.reduce((sum, row) => sum + row.debit, 0)),
        credit: round(rows.reduce((sum, row) => sum + row.credit, 0)),
        balance: round(rows.reduce((sum, row) => sum + row.balance, 0))
      },
      balanced: Math.abs(rows.reduce((sum, row) => sum + row.debit - row.credit, 0)) <= 0.01
    };
  });
}

async function getTaxReport(tenantId, period) {
  if (!period) throw appError(400, "REQUIRED_PERIOD", "El periodo YYYY-MM es obligatorio");
  return prisma.runWithTenant(tenantId, async () => {
    const bounds = periodBounds(period);
    const accounts = await prisma.account.findMany({
      where: { active: true, OR: TAX_ACCOUNT_PREFIXES.map((prefix) => ({ code: { startsWith: prefix } })) },
      include: { entries: { where: { date: { gte: bounds.start, lte: bounds.end } } } },
      orderBy: { code: "asc" }
    });
    const taxes = accounts.map((account) => {
      const debit = round(account.entries.reduce((sum, row) => sum + row.debit, 0));
      const credit = round(account.entries.reduce((sum, row) => sum + row.credit, 0));
      return { code: account.code, name: account.name, debit, credit, payable: round(credit - debit) };
    }).filter((row) => row.debit || row.credit);
    return {
      period,
      taxes,
      totals: {
        debit: round(taxes.reduce((sum, row) => sum + row.debit, 0)),
        credit: round(taxes.reduce((sum, row) => sum + row.credit, 0)),
        payable: round(taxes.reduce((sum, row) => sum + row.payable, 0))
      },
      dian_ready_fields: ["cufe", "cune", "xml_url", "pdf_url", "dian_status", "validated_at", "technology_provider"]
    };
  });
}

async function getAgingReport(tenantId, kind) {
  const types = kind === "payables" ? PAYABLE_TYPES : RECEIVABLE_TYPES;
  return prisma.runWithTenant(tenantId, async () => {
    const today = new Date();
    const rows = await prisma.transaction.findMany({
      where: { type: { in: types }, balance: { gt: 0 }, status: { not: "paid" } },
      include: { party: true },
      orderBy: [{ due_date: "asc" }, { date: "asc" }]
    });
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    const documents = rows.map((row) => {
      const dueDate = row.due_date || row.date;
      const days = Math.max(0, Math.floor((today.getTime() - new Date(dueDate).getTime()) / 86400000));
      const bucket = days <= 0 ? "current" : days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "over90";
      buckets[bucket] += row.balance;
      return {
        id: row.id,
        type: row.type,
        number: row.number,
        party: row.party ? { id: row.party.id, name: row.party.legal_name || row.party.name, tax_id: row.party.tax_id } : null,
        date: row.date,
        due_date: row.due_date,
        total: row.total,
        paid: row.paid,
        balance: row.balance,
        status: row.status,
        days_overdue: days,
        bucket
      };
    });
    return {
      kind,
      documents,
      buckets: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, round(value)])),
      total: round(documents.reduce((sum, row) => sum + row.balance, 0))
    };
  });
}

async function listPeriods(tenantId) {
  const accounting = await getAccountingConfig(tenantId);
  return accounting.periods || {};
}

async function updatePeriod(tenantId, userId, period, data) {
  periodBounds(period);
  const allowed = ["open", "review", "closed"];
  const status = data.status || "open";
  if (!allowed.includes(status)) throw appError(400, "INVALID_STATUS", `Estado invalido. Usa: ${allowed.join(", ")}`);
  const accounting = await getAccountingConfig(tenantId);
  const oldValue = accounting.periods?.[period] || null;
  const nextPeriod = {
    status,
    notes: data.notes || "",
    updated_by: userId || null,
    updated_at: new Date().toISOString()
  };
  const periods = { ...(accounting.periods || {}), [period]: nextPeriod };
  await updateAccountingConfig(tenantId, { periods });
  await prisma.auditLog.create({
    data: {
      tenant_id: tenantId,
      user_id: userId || null,
      action: status === "closed" ? "close_period" : "update_period",
      module: "accounting",
      entity: "period",
      entity_id: period,
      old_value: oldValue,
      new_value: nextPeriod
    }
  });
  return { period, ...nextPeriod };
}

async function listThirdParties(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {};
    if (query.type) where.type = query.type;
    if (query.active !== undefined) where.active = String(query.active) !== "false";
    if (query.search) {
      where.OR = [
        { name: { contains: String(query.search), mode: "insensitive" } },
        { legal_name: { contains: String(query.search), mode: "insensitive" } },
        { tax_id: { contains: String(query.search), mode: "insensitive" } }
      ];
    }
    return prisma.party.findMany({ where, orderBy: { updated_at: "desc" }, take: Number(query.limit) || 100 });
  });
}

async function saveThirdParty(tenantId, data, id = null) {
  const personType = data.person_type || data.metadata?.person_type || "juridica";
  const naturalName = personType === "natural" ? fullNaturalName(data) : "";
  const name = String(naturalName || data.name || data.legal_name || "").trim();
  if (!name) throw appError(400, "REQUIRED_NAME", "Nombre o razon social es obligatorio");
  if (!["customer", "supplier", "employee"].includes(data.type || "customer")) {
    throw appError(400, "INVALID_THIRD_PARTY_TYPE", "Tipo de tercero invalido. Usa cliente, proveedor o empleado");
  }
  if (!isValidEmail(data.email)) throw appError(400, "INVALID_EMAIL", "El correo ingresado no tiene un formato valido");
  const taxId = data.tax_id ? String(data.tax_id).replace(/\s/g, "") : null;
  const masterMatch = await validateThirdPartyMasters(tenantId, data);
  const verificationDigit = taxId ? calculateVerificationDigit(taxId) : null;
  const metadata = {
    ...(data.metadata || {}),
    person_type: personType,
    first_name: data.first_name || data.metadata?.first_name || null,
    middle_name: data.middle_name || data.metadata?.middle_name || null,
    first_last_name: data.first_last_name || data.metadata?.first_last_name || null,
    second_last_name: data.second_last_name || data.metadata?.second_last_name || null,
    document_type: masterMatch.documentType,
    verification_digit: verificationDigit,
    tax_responsibilities: data.tax_responsibilities || data.metadata?.tax_responsibilities || [],
    dane_code: masterMatch.location?.dane_code || data.dane_code || data.metadata?.dane_code || null,
    department: masterMatch.location?.department || data.department || data.metadata?.department || null,
    role_flags: data.role_flags || data.metadata?.role_flags || {},
    dian: {
      cufe: null,
      cune: null,
      xml_url: null,
      pdf_url: null,
      dian_status: null,
      validated_at: null,
      technology_provider: null,
      ...(data.metadata?.dian || {})
    }
  };
  const payload = {
    type: data.type || "customer",
    name,
    legal_name: personType === "natural" ? naturalName : data.legal_name || name,
    tax_id: taxId,
    tax_type: masterMatch.documentType,
    email: data.email || null,
    phone: data.phone || null,
    address: data.address || null,
    city: masterMatch.location?.city || data.city || null,
    country: data.country || "CO",
    segment: data.segment || null,
    credit_limit: data.credit_limit || 0,
    credit_days: data.credit_days || 0,
    active: data.active !== false,
    metadata
  };
  return prisma.runWithTenant(tenantId, async () => {
    if (taxId) {
      const existing = await prisma.party.findFirst({ where: { tax_id: taxId, ...(id ? { id: { not: Number(id) } } : {}) } });
      if (existing) throw appError(409, "PARTY_EXISTS", `Ya existe un tercero con documento ${taxId}`);
    }
    if (id) {
      const current = await prisma.party.findFirst({ where: { id: Number(id) } });
      if (!current) throw appError(404, "PARTY_NOT_FOUND", "Tercero no encontrado");
      return prisma.party.update({ where: { id: current.id }, data: payload });
    }
    return prisma.party.create({ data: payload });
  });
}

async function registerPayment(tenantId, userId, data) {
  const { transaction_id = null, party_id = null, type, method, amount, date = new Date(), reference = null, notes = null } = data;
  if (!amount || amount <= 0) throw appError(400, "INVALID_AMOUNT", "El monto debe ser mayor a 0");
  if (!["income", "expense"].includes(type)) throw appError(400, "INVALID_TYPE", "type debe ser income o expense");
  const validMethods = ["cash", "transfer", "card", "check", "other"];
  if (!validMethods.includes(method)) throw appError(400, "INVALID_METHOD", `Metodo invalido. Validos: ${validMethods.join(", ")}`);

  await assertPeriodOpen(tenantId, date);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    if (transaction_id) {
      const transaction = await tx.transaction.findFirst({ where: { id: transaction_id } });
      if (!transaction) throw appError(404, "TRANSACTION_NOT_FOUND", "Documento no encontrado");
      if (amount > transaction.balance) {
        throw appError(422, "EXCEEDS_BALANCE", `El pago supera el saldo pendiente (saldo: ${transaction.balance})`);
      }
      const newBalance = Math.round((transaction.balance - amount) * 100) / 100;
      await tx.transaction.update({
        where: { id: transaction.id },
        data: { paid: { increment: amount }, balance: newBalance, status: newBalance <= 0.01 ? "paid" : transaction.status }
      });
    }

    if (party_id) {
      const party = await tx.party.findFirst({ where: { id: party_id, active: true } });
      if (!party) throw appError(404, "PARTY_NOT_FOUND", "Tercero no encontrado");
      await tx.party.update({ where: { id: party_id }, data: { balance: { decrement: amount } } });
    }

    const payment = await tx.payment.create({
      data: { transaction_id, party_id, type, method, amount, date: new Date(date), reference, notes, created_by: userId }
    });

    await journalEntry(tenantId, {
      description: `Pago ${payment.id}`,
      date,
      transaction_id: transaction_id || null,
      entries: type === "income"
        ? [{ account: "1110", debit: amount, credit: 0 }, { account: "1305", debit: 0, credit: amount }]
        : [{ account: "2205", debit: amount, credit: 0 }, { account: "1110", debit: 0, credit: amount }]
    });

    return payment;
  }));
}

module.exports = {
  initChartOfAccounts,
  listAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  journalEntry,
  getBalanceSheet,
  getIncomeStatement,
  getLedgerByAccount,
  getTrialBalance,
  getTaxReport,
  getAgingReport,
  listPeriods,
  updatePeriod,
  getOrganizationTree,
  saveOrganizationUnit,
  deleteOrganizationUnit,
  getThirdPartyMasters,
  saveDocumentTypeMaster,
  saveDaneLocationMaster,
  listThirdParties,
  saveThirdParty,
  registerPayment
};
