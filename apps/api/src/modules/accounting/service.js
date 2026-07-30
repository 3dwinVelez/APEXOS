const prisma = require("../../core/prisma");
const { getTenantConfig, invalidateTenantCache } = require("../../core/tenantCache");

const COMPLEX_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 20_000 };

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
const DEFAULT_ACCOUNTING_DOCUMENT_TYPES = [
  { code: "CC", description: "Comprobante contable" },
  { code: "CE", description: "Comprobante de egreso" },
  { code: "CI", description: "Comprobante de ingreso" },
  { code: "NC", description: "Nota contable" },
  { code: "AJ", description: "Ajuste contable" },
  { code: "RE", description: "Factura proveedor" },
  { code: "KG", description: "Nota credito proveedor" },
  { code: "CP", description: "Factura compra" },
  { code: "NCP", description: "Nota credito compra" },
  { code: "FV", description: "Factura venta" },
  { code: "NCV", description: "Nota credito venta" }
].map((row) => ({ ...row, active: true, source: "Sistema" }));
const DEFAULT_VAT_MASTERS = [
  { code: "COMPRAS-0", concept: "Compras", percent: 0, account_code: "2408" },
  { code: "COMPRAS-5", concept: "Compras", percent: 5, account_code: "2408" },
  { code: "COMPRAS-19", concept: "Compras", percent: 19, account_code: "2408" },
  { code: "DEVOLUCIONES-0", concept: "Devoluciones", percent: 0, account_code: "2408" },
  { code: "DEVOLUCIONES-5", concept: "Devoluciones", percent: 5, account_code: "2408" },
  { code: "DEVOLUCIONES-19", concept: "Devoluciones", percent: 19, account_code: "2408" }
].map((row) => ({ ...row, active: true, source: "Sistema" }));

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
  const config = await getTenantConfig(tenantId);
  return config.accounting && typeof config.accounting === "object" ? config.accounting : {};
}

async function updateAccountingConfig(tenantId, accounting) {
  const config = await getTenantConfig(tenantId);
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { config: { ...config, accounting: { ...(config.accounting || {}), ...accounting } } },
    select: { config: true }
  });
  invalidateTenantCache(tenantId).catch(() => undefined);
  return updated;
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

function normalizeAccountingDocumentType(value) {
  return normalizeCode(value).toUpperCase();
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

function mergeNumbering(defaultTypes, custom) {
  const rows = new Map();
  for (const type of defaultTypes) {
    rows.set(type.code, {
      document_type: type.code,
      prefix: type.code,
      next_number: 1,
      active: true,
      source: "Sistema"
    });
  }
  for (const row of custom || []) {
    const code = normalizeAccountingDocumentType(row.document_type);
    if (code) rows.set(code, { ...rows.get(code), ...row, document_type: code, prefix: normalizeCode(row.prefix || code), next_number: Number(row.next_number) || 1 });
  }
  return Array.from(rows.values()).sort((a, b) => normalizeCode(a.document_type).localeCompare(normalizeCode(b.document_type)));
}

function parseDueTerm(value) {
  const match = String(value || "").trim().toUpperCase().match(/^AP(\d{1,3})$/);
  if (!match) throw appError(400, "INVALID_DUE_TERM", "El vencimiento debe tener formato AP15, AP30, AP60, etc.");
  return Number(match[1]);
}

function dueDateFromTerm(postingDate, dueTerm) {
  const due = new Date(postingDate);
  due.setDate(due.getDate() + parseDueTerm(dueTerm));
  return due;
}

function dueTermFromDates(postingDate, dueDate) {
  const start = new Date(postingDate);
  const end = new Date(dueDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw appError(400, "INVALID_DUE_DATE", "La fecha de vencimiento no es valida");
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days < 0) throw appError(400, "INVALID_DUE_DATE", "La fecha de vencimiento no puede ser anterior a la fecha de contabilizacion");
  return `AP${days}`;
}

function normalizeSupplierReference(value) {
  const reference = normalizeCode(value).toUpperCase();
  if (!reference) throw appError(400, "REQUIRED_SUPPLIER_REFERENCE", "La referencia de factura es obligatoria");
  if (!/^[A-Z0-9_-]+$/.test(reference)) throw appError(400, "INVALID_SUPPLIER_REFERENCE", "La referencia solo permite letras, numeros, guion y guion bajo");
  return reference;
}

function isPayableAccount(account) {
  const code = String(account.code || "");
  const name = String(account.name || "").toLowerCase();
  return account.type === "liability" && (code.startsWith("2205") || code.startsWith("2335") || name.includes("proveedor") || name.includes("pagar"));
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

async function getAccountingDocumentMasters(tenantId) {
  const accounting = await getAccountingConfig(tenantId);
  const documentTypes = mergeByCode(DEFAULT_ACCOUNTING_DOCUMENT_TYPES, accounting.accounting_document_types, "code")
    .map((row) => ({ ...row, code: normalizeAccountingDocumentType(row.code) }));
  return {
    document_types: documentTypes,
    numbering: mergeNumbering(documentTypes, accounting.accounting_numbering)
  };
}

async function saveAccountingDocumentType(tenantId, data) {
  const code = normalizeAccountingDocumentType(data.code);
  const description = String(data.description || "").trim();
  if (!code || !description) throw appError(400, "REQUIRED_ACCOUNTING_DOCUMENT_TYPE", "Codigo y descripcion son obligatorios");
  const accounting = await getAccountingConfig(tenantId);
  const existing = Array.isArray(accounting.accounting_document_types) ? accounting.accounting_document_types : [];
  const nextRows = [...existing.filter((item) => normalizeAccountingDocumentType(item.code) !== code), {
    code,
    description,
    active: data.active !== false,
    source: "Empresa"
  }];
  await updateAccountingConfig(tenantId, { accounting_document_types: nextRows });
  return getAccountingDocumentMasters(tenantId);
}

async function saveAccountingNumbering(tenantId, data) {
  const documentType = normalizeAccountingDocumentType(data.document_type);
  const nextNumber = Number(data.next_number);
  if (!documentType || !Number.isInteger(nextNumber) || nextNumber < 1) {
    throw appError(400, "INVALID_ACCOUNTING_NUMBERING", "Tipo de documento y proximo numero son obligatorios");
  }
  const masters = await getAccountingDocumentMasters(tenantId);
  if (!activeRows(masters.document_types).some((item) => item.code === documentType)) {
    throw appError(400, "ACCOUNTING_DOCUMENT_TYPE_NOT_IN_MASTER", "El tipo de documento debe existir en el maestro contable");
  }
  const accounting = await getAccountingConfig(tenantId);
  const existing = Array.isArray(accounting.accounting_numbering) ? accounting.accounting_numbering : [];
  const nextRows = [...existing.filter((item) => normalizeAccountingDocumentType(item.document_type) !== documentType), {
    document_type: documentType,
    prefix: normalizeCode(data.prefix || documentType),
    next_number: nextNumber,
    active: data.active !== false,
    source: "Empresa"
  }];
  await updateAccountingConfig(tenantId, { accounting_numbering: nextRows });
  return getAccountingDocumentMasters(tenantId);
}

async function getVatMasters(tenantId) {
  const accounting = await getAccountingConfig(tenantId);
  return mergeByCode(DEFAULT_VAT_MASTERS, accounting.vat_masters, "code")
    .map((row) => ({ ...row, code: normalizeCode(row.code).toUpperCase(), percent: Number(row.percent) || 0, account_code: normalizeCode(row.account_code || "2408") }));
}

async function saveVatMaster(tenantId, data) {
  const code = normalizeCode(data.code).toUpperCase();
  const concept = String(data.concept || "").trim();
  const percent = Number(data.percent);
  const accountCode = normalizeCode(data.account_code);
  if (!code || !concept || Number.isNaN(percent) || percent < 0 || !accountCode) throw appError(400, "INVALID_VAT_MASTER", "Codigo, concepto, porcentaje y cuenta contable de IVA son obligatorios");
  await prisma.runWithTenant(tenantId, async () => {
    const account = await prisma.account.findFirst({ where: { code: accountCode, active: true, allows_tx: true } });
    if (!account) throw appError(404, "VAT_ACCOUNT_NOT_FOUND", `Cuenta de IVA ${accountCode} no encontrada o inactiva`);
  });
  const accounting = await getAccountingConfig(tenantId);
  const existing = Array.isArray(accounting.vat_masters) ? accounting.vat_masters : [];
  const nextRows = [...existing.filter((item) => normalizeCode(item.code).toUpperCase() !== code), {
    code,
    concept,
    percent,
    account_code: accountCode,
    active: data.active !== false,
    source: "Empresa"
  }];
  await updateAccountingConfig(tenantId, { vat_masters: nextRows });
  return getVatMasters(tenantId);
}

async function deleteVatMaster(tenantId, codeInput) {
  const code = normalizeCode(codeInput).toUpperCase();
  if (!code) throw appError(400, "INVALID_VAT_MASTER", "Codigo de IVA obligatorio");
  const references = await prisma.runWithTenant(tenantId, () => prisma.cxpCuedoc.count({ where: { vat_code: code } }));
  if (references > 0) throw appError(409, "VAT_MASTER_HAS_RECORDS", "No se puede borrar el IVA porque ya tiene documentos CXP asociados");
  const accounting = await getAccountingConfig(tenantId);
  const existing = Array.isArray(accounting.vat_masters) ? accounting.vat_masters : [];
  const nextRows = existing.filter((item) => normalizeCode(item.code).toUpperCase() !== code);
  if (nextRows.length === existing.length && DEFAULT_VAT_MASTERS.some((item) => item.code === code)) {
    await updateAccountingConfig(tenantId, { vat_masters: [...existing, { code, active: false }] });
  } else {
    await updateAccountingConfig(tenantId, { vat_masters: nextRows });
  }
  return getVatMasters(tenantId);
}

async function listPayableAccounts(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const accounts = await prisma.account.findMany({
      where: { active: true, allows_tx: true, type: "liability" },
      orderBy: { code: "asc" }
    });
    const text = String(query.search || "").toLowerCase();
    return accounts.filter((account) => isPayableAccount(account))
      .filter((account) => !text || account.code.toLowerCase().includes(text) || account.name.toLowerCase().includes(text))
      .map(accountDto);
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
    if (type === "society") {
      count += await prisma.cntCabdoc.count({ where: { society_code: code } });
    } else if (type === "branch") {
      count += await prisma.cntCuedoc.count({ where: { branch_code: code } });
    } else {
      count += await prisma.cntCuedoc.count({ where: { cost_center_code: code } });
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
    const accounts = await prisma.account.findMany({
      where,
      orderBy: { code: "asc" },
      skip: Math.max(Number(query.offset || 0), 0),
      take: Math.min(Number(query.limit || 500), 1000)
    });
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
  return prisma.runWithTenant(tenantId, () => prisma.$transaction((tx) => journalEntryTx(tx, data)));
}

async function journalEntryTx(tx, data) {
  const { description, date = new Date(), transaction_id = null, entries = [] } = data;
  if (!description.trim()) throw appError(400, "REQUIRED_DESCRIPTION", "La descripcion del asiento es obligatoria");
  if (entries.length < 2) throw appError(400, "MIN_ENTRIES", "El asiento requiere al menos dos lineas");
  const totalDebit = entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
  const totalCredit = entries.reduce((sum, entry) => sum + (entry.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw appError(422, "UNBALANCED_ENTRY", `Partida no cuadra: Debito ${totalDebit.toFixed(2)}, Credito ${totalCredit.toFixed(2)}`);
  }
  const period = periodFromDate(date);
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
}

async function listAccountingDocuments(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {};
    if (query.document_type) where.document_type = normalizeAccountingDocumentType(query.document_type);
    if (query.society_code) where.society_code = normalizeCode(query.society_code);
    if (query.period) {
      const bounds = periodBounds(query.period);
      where.posting_date = { gte: bounds.start, lte: bounds.end };
    }
    const rows = await prisma.cntCabdoc.findMany({
      where,
      include: { lines: { orderBy: { line_no: "asc" } } },
      orderBy: [{ posting_date: "desc" }, { id: "desc" }],
      take: Number(query.limit) || 100
    });
    return enrichAccountingDocuments(rows);
  });
}

async function enrichAccountingDocuments(rows) {
  const userIds = [...new Set(rows.map((row) => row.created_by).filter(Boolean))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const userById = new Map(users.map((user) => [user.id, user]));
  return rows.map((row) => {
    const user = row.created_by ? userById.get(row.created_by) : null;
    return {
      ...row,
      created_by_user: user ? { id: user.id, name: user.name, email: user.email } : null,
      created_by_name: user?.name || user?.email || null
    };
  });
}

function assertOrganizationReferences(tree, societyCode, branchCode, costCenterCode) {
  const society = activeRows(tree.societies).find((item) => item.code === societyCode);
  if (!society) throw appError(400, "SOCIETY_NOT_IN_MASTER", "La sociedad debe existir y estar activa en el maestro");

  const branch = activeRows(tree.branches).find((item) => item.code === branchCode && item.society_code === societyCode);
  if (!branch) throw appError(400, "BRANCH_NOT_IN_MASTER", "La sucursal debe existir, estar activa y pertenecer a la sociedad");

  const costCenter = activeRows(tree.cost_centers).find((item) => item.code === costCenterCode && item.branch_code === branchCode && item.society_code === societyCode);
  if (!costCenter) throw appError(400, "COST_CENTER_NOT_IN_MASTER", "El centro de costo debe existir y pertenecer a la sucursal seleccionada");
}

async function createAccountingDocument(tenantId, userId, data) {
  const postingDate = data.posting_date ? new Date(data.posting_date) : null;
  if (!postingDate || Number.isNaN(postingDate.getTime())) throw appError(400, "REQUIRED_POSTING_DATE", "La fecha de contabilizacion es obligatoria");
  const headerText = String(data.header_text || "").trim();
  if (!headerText) throw appError(400, "REQUIRED_HEADER_TEXT", "El texto de cabecera es obligatorio");
  const documentType = normalizeAccountingDocumentType(data.document_type);
  const societyCode = normalizeCode(data.society_code);
  if (!documentType) throw appError(400, "REQUIRED_ACCOUNTING_DOCUMENT_TYPE", "El tipo de documento es obligatorio");
  if (!societyCode) throw appError(400, "REQUIRED_SOCIETY", "La sociedad es obligatoria");
  if (!Array.isArray(data.lines) || data.lines.length < 2) throw appError(400, "MIN_DOCUMENT_LINES", "El comprobante requiere al menos dos lineas");

  const masters = await getAccountingDocumentMasters(tenantId);
  const activeDocumentType = activeRows(masters.document_types).find((item) => item.code === documentType);
  if (!activeDocumentType) throw appError(400, "ACCOUNTING_DOCUMENT_TYPE_NOT_IN_MASTER", "El tipo de documento debe existir en el maestro contable");
  const tree = await getOrganizationTree(tenantId);
  assertOrganizationReferences(tree, societyCode, normalizeCode(data.lines[0]?.branch_code), normalizeCode(data.lines[0]?.cost_center_code));

  const preparedLines = data.lines.map((line, index) => {
    const movement = line.movement === "credit" ? "credit" : "debit";
    const amount = round(line.amount);
    if (amount <= 0) throw appError(400, "INVALID_LINE_AMOUNT", `El valor de la linea ${index + 1} debe ser mayor a 0`);
    const branchCode = normalizeCode(line.branch_code);
    const costCenterCode = normalizeCode(line.cost_center_code);
    assertOrganizationReferences(tree, societyCode, branchCode, costCenterCode);
    return {
      line_no: index + 1,
      account_code: normalizeCode(line.account_code),
      branch_code: branchCode,
      cost_center_code: costCenterCode,
      party_id: Number(line.party_id),
      movement,
      debit: movement === "debit" ? amount : 0,
      credit: movement === "credit" ? amount : 0,
      description: String(line.description || "").trim()
    };
  });
  const totalDebit = round(preparedLines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round(preparedLines.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw appError(422, "UNBALANCED_DOCUMENT", `Documento no cuadra: Debito ${totalDebit.toFixed(2)}, Credito ${totalCredit.toFixed(2)}`);
  }
  if (preparedLines.some((line) => !line.account_code || !line.party_id || !line.description)) {
    throw appError(400, "REQUIRED_DOCUMENT_LINE", "Cada linea requiere cuenta, tercero, descripcion y valor");
  }

  await assertPeriodOpen(tenantId, postingDate);
  const period = periodFromDate(postingDate);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
    const accounting = config.accounting && typeof config.accounting === "object" ? config.accounting : {};
    const freshMasters = {
      document_types: mergeByCode(DEFAULT_ACCOUNTING_DOCUMENT_TYPES, accounting.accounting_document_types, "code").map((row) => ({ ...row, code: normalizeAccountingDocumentType(row.code) })),
      numbering: mergeNumbering(mergeByCode(DEFAULT_ACCOUNTING_DOCUMENT_TYPES, accounting.accounting_document_types, "code").map((row) => ({ ...row, code: normalizeAccountingDocumentType(row.code) })), accounting.accounting_numbering)
    };
    if (!activeRows(freshMasters.document_types).some((item) => item.code === documentType)) {
      throw appError(400, "ACCOUNTING_DOCUMENT_TYPE_NOT_IN_MASTER", "El tipo de documento debe existir en el maestro contable");
    }
    const numbering = freshMasters.numbering.find((item) => item.document_type === documentType && item.active !== false);
    if (!numbering) throw appError(400, "NUMBERING_NOT_IN_MASTER", "El tipo de documento no tiene numeracion activa");
    const documentNumber = Number(numbering.next_number) || 1;
    const prefix = normalizeCode(numbering.prefix || documentType);
    const fullNumber = `${prefix}-${String(documentNumber).padStart(6, "0")}`;

    const cabdoc = await tx.cntCabdoc.create({
      data: {
        document_type: documentType,
        document_number: documentNumber,
        full_number: fullNumber,
        posting_date: postingDate,
        reference: data.reference ? String(data.reference).trim() : null,
        header_text: headerText,
        society_code: societyCode,
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: userId || null
      }
    });

    for (const line of preparedLines) {
      const account = await tx.account.findFirst({ where: { code: line.account_code, active: true, allows_tx: true } });
      if (!account) throw appError(404, "ACCOUNT_NOT_FOUND", `Cuenta ${line.account_code} no encontrada o inactiva`);
      const party = await tx.party.findFirst({ where: { id: line.party_id, active: true } });
      if (!party) throw appError(404, "PARTY_NOT_FOUND", `Tercero ${line.party_id} no encontrado o inactivo`);
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          account_id: account.id,
          transaction_id: null,
          date: postingDate,
          debit: line.debit,
          credit: line.credit,
          balance: 0,
          description: line.description || headerText,
          period
        }
      });
      await tx.cntCuedoc.create({
        data: {
          cabdoc_id: cabdoc.id,
          line_no: line.line_no,
          account_id: account.id,
          account_code: account.code,
          branch_code: line.branch_code,
          cost_center_code: line.cost_center_code,
          party_id: party.id,
          party_tax_id: party.tax_id || null,
          movement: line.movement,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          ledger_entry_id: ledgerEntry.id
        }
      });
    }

    const customNumbering = Array.isArray(accounting.accounting_numbering) ? accounting.accounting_numbering : [];
    const nextNumbering = [...customNumbering.filter((item) => normalizeAccountingDocumentType(item.document_type) !== documentType), {
      ...numbering,
      document_type: documentType,
      prefix,
      next_number: documentNumber + 1,
      active: true,
      source: numbering.source || "Sistema"
    }];
    await tx.tenant.update({
      where: { id: tenantId },
      data: { config: { ...config, accounting: { ...accounting, accounting_numbering: nextNumbering } } }
    });

    return tx.cntCabdoc.findFirst({
      where: { id: cabdoc.id },
      include: { lines: { orderBy: { line_no: "asc" } } }
    });
  }));
}

async function listPayableDocuments(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {};
    if (query.document_kind) where.document_kind = String(query.document_kind);
    if (query.supplier_id) where.supplier_id = Number(query.supplier_id);
    if (query.period) {
      const bounds = periodBounds(query.period);
      where.posting_date = { gte: bounds.start, lte: bounds.end };
    }
    const rows = await prisma.cxpCabdoc.findMany({
      where,
      include: { lines: { orderBy: { line_no: "asc" } } },
      orderBy: [{ posting_date: "desc" }, { id: "desc" }],
      take: Number(query.limit) || 100
    });
    return enrichPayableDocuments(rows);
  });
}

async function enrichPayableDocuments(rows) {
  const cntIds = [...new Set(rows.map((row) => row.accounting_document_id).filter(Boolean))];
  const creditNoteIds = rows.filter((row) => row.document_kind === "credit_note").map((row) => row.id);
  const directInvoiceIds = rows.map((row) => row.referenced_invoice_id).filter(Boolean);
  const applications = creditNoteIds.length ? await prisma.cxpApplication.findMany({ where: { credit_note_id: { in: creditNoteIds } } }) : [];
  const appliedInvoiceIds = applications.map((row) => row.invoice_id).filter(Boolean);
  const invoiceIds = [...new Set([...directInvoiceIds, ...appliedInvoiceIds])];
  const [cntDocs, invoices] = await Promise.all([
    cntIds.length ? prisma.cntCabdoc.findMany({ where: { id: { in: cntIds } }, include: { lines: { orderBy: { line_no: "asc" } } } }) : [],
    invoiceIds.length ? prisma.cxpCabdoc.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, number: true, supplier_reference: true, due_date: true, total: true, balance: true } }) : []
  ]);
  const enrichedCntDocs = await enrichAccountingDocuments(cntDocs);
  const cntById = new Map(enrichedCntDocs.map((row) => [row.id, row]));
  const invoiceById = new Map(invoices.map((row) => [row.id, row]));
  const appsByCreditNote = new Map();
  for (const app of applications) {
    const invoice = invoiceById.get(app.invoice_id);
    if (!invoice) continue;
    const current = appsByCreditNote.get(app.credit_note_id) || [];
    current.push({ ...invoice, applied_amount: app.amount, application_id: app.id, application_created_at: app.created_at });
    appsByCreditNote.set(app.credit_note_id, current);
  }
  return rows.map((row) => {
    const directInvoice = row.referenced_invoice_id ? invoiceById.get(row.referenced_invoice_id) : null;
    const affectedInvoices = appsByCreditNote.get(row.id) || (directInvoice ? [{ ...directInvoice, applied_amount: row.applied_total }] : []);
    return {
      ...row,
      accounting_document: row.accounting_document_id ? cntById.get(row.accounting_document_id) || null : null,
      affected_invoices: affectedInvoices
    };
  });
}

async function listOpenPayableInvoices(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const supplierId = Number(query.supplier_id);
    if (!supplierId) throw appError(400, "REQUIRED_SUPPLIER", "Seleccione un proveedor para consultar facturas abiertas");
    const search = String(query.search || "").trim().toUpperCase();
    const rows = await prisma.cxpCabdoc.findMany({
      where: {
        document_kind: "invoice",
        supplier_id: supplierId,
        balance: { gt: 0.01 },
        ...(search ? { OR: [{ number: { contains: search } }, { supplier_reference: { contains: search } }] } : {})
      },
      include: { lines: { orderBy: { line_no: "asc" } } },
      orderBy: [{ due_date: "asc" }, { id: "asc" }],
      take: Number(query.limit) || 100
    });
    return enrichPayableDocuments(rows);
  });
}

async function listSupplierPayableDocuments(tenantId, supplierId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const id = Number(supplierId);
    if (!id) throw appError(400, "REQUIRED_SUPPLIER", "Seleccione un proveedor para consultar documentos");
    const rows = await prisma.cxpCabdoc.findMany({
      where: {
        supplier_id: id,
        ...(String(query.open_only) === "true" ? { balance: { gt: 0.01 } } : {})
      },
      include: { lines: { orderBy: { line_no: "asc" } } },
      orderBy: [{ posting_date: "desc" }, { id: "desc" }],
      take: Number(query.limit) || 200
    });
    return enrichPayableDocuments(rows);
  });
}

function payableDocumentClass(documentKind, sourceModule = null) {
  if (sourceModule === "purchases") return documentKind === "credit_note" ? "NCP" : "CP";
  return documentKind === "credit_note" ? "KG" : "RE";
}

async function resolvePayableInvoiceReference(tx, data, supplierId) {
  if (data.document_kind !== "credit_note") return null;
  const referencedId = Number(data.referenced_invoice_id) || 0;
  const reference = String(data.invoice_reference || "").trim().toUpperCase();
  if (!referencedId && !reference) return null;
  const invoice = await tx.cxpCabdoc.findFirst({
    where: {
      document_kind: "invoice",
      supplier_id: supplierId,
      balance: { gt: 0.01 },
      ...(referencedId
        ? { id: referencedId }
        : { OR: [{ number: reference }, { supplier_reference: normalizeSupplierReference(reference) }] })
    }
  });
  if (!invoice) throw appError(404, "OPEN_INVOICE_NOT_FOUND", "No se encontro una factura con saldo vivo para cruzar con esta nota credito");
  return invoice;
}

async function preparePayableDocument(tx, tenantId, data, options = {}) {
  const postingDate = data.posting_date ? new Date(data.posting_date) : null;
  if (!postingDate || Number.isNaN(postingDate.getTime())) throw appError(400, "REQUIRED_POSTING_DATE", "La fecha de contabilizacion es obligatoria");
  const documentKind = data.document_kind === "credit_note" ? "credit_note" : "invoice";
  const documentClass = payableDocumentClass(documentKind, data.source_module || null);
  const dueDateInput = data.due_date ? new Date(data.due_date) : null;
  const dueTerm = data.due_term ? normalizeCode(data.due_term).toUpperCase() : dueTermFromDates(postingDate, dueDateInput);
  const dueDate = dueDateInput && !Number.isNaN(dueDateInput.getTime()) ? dueDateInput : dueDateFromTerm(postingDate, dueTerm);
  const supplierReference = normalizeSupplierReference(data.supplier_reference);
  const headerText = String(data.header_text || "").trim();
  const societyCode = normalizeCode(data.society_code);
  const associatedAccountCode = normalizeCode(data.associated_account_code);
  if (!headerText || !societyCode || !associatedAccountCode) throw appError(400, "REQUIRED_PAYABLE_HEADER", "Descripcion, sociedad y cuenta asociada son obligatorias");
  if (!Array.isArray(data.lines) || data.lines.length < 1) throw appError(400, "MIN_PAYABLE_LINES", "El documento requiere al menos una linea");

  await assertPeriodOpen(tenantId, postingDate);
  const tree = await getOrganizationTree(tenantId);
  const vatMasters = activeRows(await getVatMasters(tenantId));
  const period = periodFromDate(postingDate);

  const supplier = await tx.party.findFirst({ where: { id: Number(data.supplier_id), type: "supplier", active: true } });
  if (!supplier) throw appError(404, "SUPPLIER_NOT_FOUND", "Proveedor no encontrado o inactivo");
  const duplicate = await tx.cxpCabdoc.findFirst({
    where: {
      document_class: documentClass,
      supplier_id: supplier.id,
      supplier_reference: supplierReference
    }
  });
  if (duplicate && !options.ignoreDuplicate) throw appError(409, "DUPLICATE_SUPPLIER_REFERENCE", `Ya existe ${documentClass} para este proveedor con referencia ${supplierReference}`);
  const associatedAccount = await tx.account.findFirst({ where: { code: associatedAccountCode, active: true, allows_tx: true } });
  if (!associatedAccount || !isPayableAccount(associatedAccount)) throw appError(400, "INVALID_ASSOCIATED_ACCOUNT", "La cuenta asociada debe ser una cuenta de proveedores o cuentas por pagar");
  const referencedInvoice = await resolvePayableInvoiceReference(tx, data, supplier.id);

  const preparedLines = [];
  let subtotal = 0;
  let taxTotal = 0;
  const ledgerLines = [];
  for (const [index, line] of data.lines.entries()) {
    const branchCode = normalizeCode(line.branch_code);
    const costCenterCode = normalizeCode(line.cost_center_code);
    assertOrganizationReferences(tree, societyCode, branchCode, costCenterCode);
    const accountCode = normalizeCode(line.account_code);
    const account = await tx.account.findFirst({ where: { code: accountCode, active: true, allows_tx: true } });
    if (!account) throw appError(404, "ACCOUNT_NOT_FOUND", `Cuenta ${accountCode} no encontrada o inactiva`);
    const vatCode = normalizeCode(line.vat_code).toUpperCase();
    const vat = vatMasters.find((row) => row.code === vatCode);
    if (!vat) throw appError(400, "VAT_MASTER_NOT_FOUND", `El IVA ${vatCode} no existe en el maestro`);
    const taxAccountCode = normalizeCode(vat.account_code);
    const taxAccount = Number(vat.percent) > 0 ? await tx.account.findFirst({ where: { code: taxAccountCode, active: true, allows_tx: true } }) : null;
    if (Number(vat.percent) > 0 && !taxAccount) throw appError(404, "VAT_ACCOUNT_NOT_FOUND", `Cuenta de IVA ${taxAccountCode} no encontrada o inactiva`);
    const amount = round(line.amount);
    if (amount <= 0) throw appError(400, "INVALID_AMOUNT", `El valor de la linea ${index + 1} debe ser mayor a 0`);
    const movement = line.movement === "credit" ? "credit" : "debit";
    const vatAmount = round(amount * (Number(vat.percent) / 100));
    const description = String(line.description || "").trim();
    if (!description) throw appError(400, "REQUIRED_LINE_DESCRIPTION", "Cada linea requiere descripcion");
    subtotal = round(subtotal + amount);
    taxTotal = round(taxTotal + vatAmount);
    preparedLines.push({
      line_no: index + 1,
      account_id: account.id,
      account_code: account.code,
      branch_code: branchCode,
      cost_center_code: costCenterCode,
      movement,
      vat_code: vat.code,
      vat_concept: vat.concept,
      vat_account_code: taxAccountCode || null,
      vat_percent: Number(vat.percent),
      vat_amount: vatAmount,
      description,
      amount,
      total: round(amount + vatAmount)
    });
    ledgerLines.push({
      account_id: account.id,
      account_code: account.code,
      account_name: account.name,
      debit: movement === "debit" ? amount : 0,
      credit: movement === "credit" ? amount : 0,
      description
    });
    if (vatAmount > 0) {
      ledgerLines.push({
        account_id: taxAccount.id,
        account_code: taxAccount.code,
        account_name: taxAccount.name,
        debit: movement === "debit" ? vatAmount : 0,
        credit: movement === "credit" ? vatAmount : 0,
        description: `IVA ${vat.percent}% ${vat.concept}`
      });
    }
  }

  const total = round(subtotal + taxTotal);
  const debitBeforeAssociated = round(ledgerLines.reduce((sum, line) => sum + line.debit, 0));
  const creditBeforeAssociated = round(ledgerLines.reduce((sum, line) => sum + line.credit, 0));
  const difference = round(debitBeforeAssociated - creditBeforeAssociated);
  if (Math.abs(difference) <= 0.01) throw appError(422, "EMPTY_ASSOCIATED_BALANCE", "El documento no genera saldo para la cuenta asociada");
  ledgerLines.push({
    account_id: associatedAccount.id,
    account_code: associatedAccount.code,
    account_name: associatedAccount.name,
    debit: difference < 0 ? Math.abs(difference) : 0,
    credit: difference > 0 ? difference : 0,
    description: `${documentKind === "credit_note" ? "Nota credito proveedor" : "Factura proveedor"} ${headerText}`
  });
  const totalDebit = round(ledgerLines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round(ledgerLines.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw appError(422, "UNBALANCED_PAYABLE_DOCUMENT", "El asiento de cuentas por pagar no cuadra");

  let documentNumber = null;
  let number = `${documentClass}-SIMULACION`;
  let numbering = null;
  if (options.reserveNumber) {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
    const accounting = config.accounting && typeof config.accounting === "object" ? config.accounting : {};
    const documentTypes = mergeByCode(DEFAULT_ACCOUNTING_DOCUMENT_TYPES, accounting.accounting_document_types, "code").map((row) => ({ ...row, code: normalizeAccountingDocumentType(row.code) }));
    numbering = mergeNumbering(documentTypes, accounting.accounting_numbering).find((item) => item.document_type === documentClass && item.active !== false);
    if (!numbering) throw appError(400, "NUMBERING_NOT_IN_MASTER", `La clase ${documentClass} no tiene numeracion activa`);
    documentNumber = Number(numbering.next_number) || 1;
    const prefix = normalizeCode(numbering.prefix || documentClass);
    number = `${prefix}-${String(documentNumber).padStart(6, "0")}`;
    return { config, accounting, numbering, documentNumber, documentClass, documentKind, number, supplierReference, referencedInvoice, postingDate, dueTerm, dueDate, headerText, societyCode, supplier, associatedAccount, preparedLines, ledgerLines, subtotal, taxTotal, total, totalDebit, totalCredit, period };
  }

  return { documentClass, documentKind, number, supplierReference, referencedInvoice, postingDate, dueTerm, dueDate, headerText, societyCode, supplier, associatedAccount, preparedLines, ledgerLines, subtotal, taxTotal, total, totalDebit, totalCredit, period };
}

async function simulatePayableDocument(tenantId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const preview = await preparePayableDocument(prisma, tenantId, data);
    return {
      document_kind: preview.documentKind,
      document_class: preview.documentClass,
      number: preview.number,
      supplier_reference: preview.supplierReference,
      posting_date: preview.postingDate,
      due_term: preview.dueTerm,
      due_date: preview.dueDate,
      supplier: { id: preview.supplier.id, name: preview.supplier.legal_name || preview.supplier.name, tax_id: preview.supplier.tax_id },
      society_code: preview.societyCode,
      associated_account_code: preview.associatedAccount.code,
      subtotal: preview.subtotal,
      tax_total: preview.taxTotal,
      total: preview.total,
      referenced_invoice: preview.referencedInvoice ? {
        id: preview.referencedInvoice.id,
        number: preview.referencedInvoice.number,
        supplier_reference: preview.referencedInvoice.supplier_reference,
        due_date: preview.referencedInvoice.due_date,
        balance: preview.referencedInvoice.balance,
        applied_amount: round(Math.min(preview.total, preview.referencedInvoice.balance))
      } : null,
      totals: { debit: preview.totalDebit, credit: preview.totalCredit },
      lines: preview.ledgerLines.map((line, index) => ({ line_no: index + 1, account_code: line.account_code, account_name: line.account_name, debit: line.debit, credit: line.credit, description: line.description }))
    };
  });
}

async function createPayableDocumentInTransaction(tx, tenantId, userId, data) {
  const preview = await preparePayableDocument(tx, tenantId, data, { reserveNumber: true });
    const cxp = await tx.cxpCabdoc.create({
      data: {
        document_kind: preview.documentKind,
        document_class: preview.documentClass,
        number: preview.number,
        supplier_reference: preview.supplierReference,
        referenced_invoice_id: preview.referencedInvoice?.id || null,
        posting_date: preview.postingDate,
        due_term: preview.dueTerm,
        due_date: preview.dueDate,
        header_text: preview.headerText,
        supplier_id: preview.supplier.id,
        supplier_tax_id: preview.supplier.tax_id || null,
        society_code: preview.societyCode,
        associated_account_id: preview.associatedAccount.id,
        associated_account_code: preview.associatedAccount.code,
        subtotal: preview.subtotal,
        tax_total: preview.taxTotal,
        total: preview.total,
        balance: preview.total,
        applied_total: 0,
        status: "open",
        created_by: userId || null
      }
    });

    const cnt = await tx.cntCabdoc.create({
      data: {
        document_type: preview.documentClass,
        document_number: preview.documentNumber,
        full_number: preview.number,
        posting_date: preview.postingDate,
        reference: preview.supplierReference,
        header_text: preview.headerText,
        society_code: preview.societyCode,
        total_debit: preview.totalDebit,
        total_credit: preview.totalCredit,
        created_by: userId || null
      }
    });

    for (const line of preview.preparedLines) {
      await tx.cxpCuedoc.create({ data: { cabdoc_id: cxp.id, ...line } });
    }
    let lineNo = 1;
    for (const line of preview.ledgerLines) {
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          account_id: line.account_id,
          transaction_id: null,
          date: preview.postingDate,
          debit: line.debit,
          credit: line.credit,
          balance: 0,
          description: line.description,
          period: preview.period
        }
      });
      await tx.cntCuedoc.create({
        data: {
          cabdoc_id: cnt.id,
          line_no: lineNo,
          account_id: line.account_id,
          account_code: line.account_code,
          branch_code: preview.preparedLines[0].branch_code,
          cost_center_code: preview.preparedLines[0].cost_center_code,
          party_id: preview.supplier.id,
          party_tax_id: preview.supplier.tax_id || null,
          movement: line.debit > 0 ? "debit" : "credit",
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          ledger_entry_id: ledgerEntry.id
        }
      });
      lineNo += 1;
    }

    let cxpBalance = preview.total;
    let cxpApplied = 0;
    if (preview.documentKind === "credit_note" && preview.referencedInvoice) {
      const invoice = await tx.cxpCabdoc.findFirst({
        where: { id: preview.referencedInvoice.id, document_kind: "invoice", supplier_id: preview.supplier.id, balance: { gt: 0.01 } }
      });
      if (!invoice) throw appError(404, "OPEN_INVOICE_NOT_FOUND", "La factura seleccionada ya no tiene saldo vivo");
      const amount = round(Math.min(preview.total, invoice.balance));
      const invoiceBalance = round(invoice.balance - amount);
      cxpBalance = round(preview.total - amount);
      cxpApplied = amount;
      await tx.cxpApplication.create({
        data: {
          credit_note_id: cxp.id,
          invoice_id: invoice.id,
          amount,
          created_by: userId || null
        }
      });
      await tx.cxpCabdoc.update({
        where: { id: invoice.id },
        data: {
          applied_total: { increment: amount },
          balance: invoiceBalance,
          status: invoiceBalance <= 0.01 ? "cleared" : "open"
        }
      });
    }

    await tx.cxpCabdoc.update({
      where: { id: cxp.id },
      data: {
        accounting_document_id: cnt.id,
        applied_total: cxpApplied,
        balance: cxpBalance,
        status: cxpBalance <= 0.01 ? "cleared" : "open"
      }
    });
    await tx.party.update({ where: { id: preview.supplier.id }, data: { balance: { increment: preview.documentKind === "credit_note" ? -preview.total : preview.total } } });
    const customNumbering = Array.isArray(preview.accounting.accounting_numbering) ? preview.accounting.accounting_numbering : [];
    const nextNumbering = [...customNumbering.filter((item) => normalizeAccountingDocumentType(item.document_type) !== preview.documentClass), {
      ...preview.numbering,
      document_type: preview.documentClass,
      prefix: normalizeCode(preview.numbering.prefix || preview.documentClass),
      next_number: preview.documentNumber + 1,
      active: true,
      source: preview.numbering.source || "Sistema"
    }];
    await tx.tenant.update({
      where: { id: tenantId },
      data: { config: { ...preview.config, accounting: { ...preview.accounting, accounting_numbering: nextNumbering } } }
    });
  return tx.cxpCabdoc.findFirst({ where: { id: cxp.id }, include: { lines: { orderBy: { line_no: "asc" } } } });
}

async function createPayableDocument(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(
    (tx) => createPayableDocumentInTransaction(tx, tenantId, userId, data),
    COMPLEX_TRANSACTION_OPTIONS
  ));
}

async function applyPayableCreditNote(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const creditNote = await tx.cxpCabdoc.findFirst({
      where: { id: Number(data.credit_note_id), document_kind: "credit_note", balance: { gt: 0.01 } }
    });
    if (!creditNote) throw appError(404, "OPEN_CREDIT_NOTE_NOT_FOUND", "Nota credito no encontrada o sin saldo vivo");
    const invoice = await tx.cxpCabdoc.findFirst({
      where: { id: Number(data.invoice_id), document_kind: "invoice", supplier_id: creditNote.supplier_id, balance: { gt: 0.01 } }
    });
    if (!invoice) throw appError(404, "OPEN_INVOICE_NOT_FOUND", "Factura no encontrada o sin saldo vivo para este proveedor");
    const requested = round(Number(data.amount) || 0);
    if (requested <= 0) throw appError(400, "INVALID_APPLICATION_AMOUNT", "El valor a cruzar debe ser mayor a cero");
    if (requested - creditNote.balance > 0.01) throw appError(422, "CREDIT_NOTE_BALANCE_EXCEEDED", `La nota solo tiene saldo ${creditNote.balance}`);
    if (requested - invoice.balance > 0.01) throw appError(422, "INVOICE_BALANCE_EXCEEDED", `La factura solo tiene saldo ${invoice.balance}`);

    const invoiceBalance = round(invoice.balance - requested);
    const creditBalance = round(creditNote.balance - requested);
    await tx.cxpApplication.create({
      data: {
        credit_note_id: creditNote.id,
        invoice_id: invoice.id,
        amount: requested,
        created_by: userId || null
      }
    });
    await tx.cxpCabdoc.update({
      where: { id: invoice.id },
      data: {
        applied_total: { increment: requested },
        balance: invoiceBalance,
        status: invoiceBalance <= 0.01 ? "cleared" : "open"
      }
    });
    await tx.cxpCabdoc.update({
      where: { id: creditNote.id },
      data: {
        referenced_invoice_id: invoice.id,
        applied_total: { increment: requested },
        balance: creditBalance,
        status: creditBalance <= 0.01 ? "cleared" : "open"
      }
    });
    return {
      credit_note_id: creditNote.id,
      invoice_id: invoice.id,
      amount: requested,
      invoice_balance: invoiceBalance,
      credit_note_balance: creditBalance
    };
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

    await journalEntryTx(tx, {
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
  assertPeriodOpen,
  journalEntry,
  journalEntryTx,
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
  getAccountingDocumentMasters,
  saveAccountingDocumentType,
  saveAccountingNumbering,
  getVatMasters,
  saveVatMaster,
  deleteVatMaster,
  listPayableAccounts,
  listAccountingDocuments,
  createAccountingDocument,
  listPayableDocuments,
  listOpenPayableInvoices,
  listSupplierPayableDocuments,
  simulatePayableDocument,
  createPayableDocument,
  createPayableDocumentInTransaction,
  applyPayableCreditNote,
  listThirdParties,
  saveThirdParty,
  registerPayment,
  // Pure helpers (exported for unit tests)
  round,
  periodBounds,
  periodFromDate,
  // CxC (Cuentas por Cobrar)
  prepareReceivableDocument,
  simulateReceivableDocument,
  createReceivableDocument,
  listReceivableDocuments,
  listOpenReceivableInvoices,
  getCustomerStatement,
  registerPaymentReceivable,
  getAgingReceivablesReport,
  initializeRetentionMasters,
  getRetentionMasters,
  saveRetentionMaster
};

// ============================================================
// CxC — CUENTAS POR COBRAR (Simétrico a CXP pero invertido)
// ============================================================

function isReceivableAccount(account) {
  const code = String(account.code || "");
  return account.type === "asset" && (code.startsWith("1305") || code.startsWith("1330") || code.startsWith("1355"));
}

async function prepareReceivableDocument(tx, tenantId, data, options = {}) {
  const postingDate = data.posting_date ? new Date(data.posting_date) : null;
  if (!postingDate || Number.isNaN(postingDate.getTime())) throw appError(400, "REQUIRED_POSTING_DATE", "La fecha de contabilizacion es obligatoria");
  const documentKind = data.document_kind === "credit_note" ? "credit_note" : "invoice";
  const documentClass = documentKind === "credit_note" ? "NCV" : "FV";
  const dueDateInput = data.due_date ? new Date(data.due_date) : null;
  const dueTerm = data.due_term ? normalizeCode(data.due_term).toUpperCase() : dueTermFromDates(postingDate, dueDateInput);
  const dueDate = dueDateInput && !Number.isNaN(dueDateInput.getTime()) ? dueDateInput : dueDateFromTerm(postingDate, dueTerm);
  const customerReference = normalizeCode(data.customer_reference || "");
  const headerText = String(data.header_text || "").trim();
  const societyCode = normalizeCode(data.society_code);
  const associatedAccountCode = normalizeCode(data.associated_account_code);
  if (!headerText || !societyCode || !associatedAccountCode) throw appError(400, "REQUIRED_CXC_HEADER", "Descripcion, sociedad y cuenta asociada son obligatorias");
  if (!Array.isArray(data.ledger_lines) || data.ledger_lines.length < 2) throw appError(400, "MIN_CXC_LINES", "Se requieren al menos 2 lineas contables");

  await assertPeriodOpen(tenantId, postingDate);
  const tree = await getOrganizationTree(tenantId);
  const period = periodFromDate(postingDate);

  const customer = await tx.party.findFirst({ where: { id: Number(data.customer_id), type: "customer", active: true } });
  if (!customer) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado o inactivo");

  const associatedAccount = await tx.account.findFirst({ where: { code: associatedAccountCode, active: true, allows_tx: true } });
  if (!associatedAccount || !isReceivableAccount(associatedAccount)) throw appError(400, "INVALID_CXC_ACCOUNT", "La cuenta asociada debe ser una cuenta de deudor (1305)");

  const ledgerLines = data.ledger_lines.map((line, i) => ({
    account_id: line.account_id,
    account_code: line.account_code,
    account_name: line.account_name || "",
    debit: round(Number(line.debit) || 0),
    credit: round(Number(line.credit) || 0),
    description: String(line.description || "").trim() || `Linea ${i + 1}`,
    branch_code: normalizeCode(line.branch_code || data.branch_code || ""),
    cost_center_code: normalizeCode(line.cost_center_code || data.cost_center_code || "")
  }));

  // Validate organization references for first line
  const firstBranch = ledgerLines.find((l) => l.branch_code)?.branch_code || normalizeCode(data.branch_code || "");
  const firstCC = ledgerLines.find((l) => l.cost_center_code)?.cost_center_code || normalizeCode(data.cost_center_code || "");
  assertOrganizationReferences(tree, societyCode, firstBranch || "SOC-01", firstCC || "SOC-01");

  const debitBeforeAssociated = round(ledgerLines.reduce((sum, line) => sum + line.debit, 0));
  const creditBeforeAssociated = round(ledgerLines.reduce((sum, line) => sum + line.credit, 0));
  const difference = round(debitBeforeAssociated - creditBeforeAssociated);
  if (Math.abs(difference) <= 0.01) throw appError(422, "EMPTY_CXC_BALANCE", "El documento no genera saldo para la cuenta asociada");

  // For receivables: customer owes us → debit in 1305 (inverted from CXP)
  if (difference > 0) {
    // More debit → add credit to balance (money owed to us)
    ledgerLines.push({
      account_id: associatedAccount.id,
      account_code: associatedAccount.code,
      account_name: associatedAccount.name,
      debit: 0,
      credit: difference,
      description: `${documentKind === "credit_note" ? "NC" : "Factura"} ${headerText}`,
      branch_code: firstBranch,
      cost_center_code: firstCC
    });
  } else {
    // More credit → add debit
    ledgerLines.push({
      account_id: associatedAccount.id,
      account_code: associatedAccount.code,
      account_name: associatedAccount.name,
      debit: Math.abs(difference),
      credit: 0,
      description: `${documentKind === "credit_note" ? "NC" : "Factura"} ${headerText}`,
      branch_code: firstBranch,
      cost_center_code: firstCC
    });
  }

  const totalDebit = round(ledgerLines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round(ledgerLines.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw appError(422, "UNBALANCED_CXC_DOCUMENT", "El asiento de cuentas por cobrar no cuadra");

  const subtotal = round(Number(data.subtotal) || 0);
  const taxTotal = round(Number(data.tax_total) || 0);
  const retentionTotal = round(Number(data.retention_total) || 0);
  const total = round(Number(data.total) || (subtotal + taxTotal));

  let documentNumber = null;
  let number = `${documentClass}-SIMULACION`;
  let numbering = null;
  if (options.reserveNumber) {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
    const accounting = config.accounting && typeof config.accounting === "object" ? config.accounting : {};
    const documentTypes = mergeByCode(DEFAULT_ACCOUNTING_DOCUMENT_TYPES, accounting.accounting_document_types, "code").map((row) => ({ ...row, code: normalizeAccountingDocumentType(row.code) }));
    numbering = mergeNumbering(documentTypes, accounting.accounting_numbering).find((item) => item.document_type === documentClass && item.active !== false);
    if (!numbering) throw appError(400, "CXC_NUMBERING_NOT_FOUND", `La clase ${documentClass} no tiene numeracion activa. Configure en Contabilidad > Maestros > Numeracion`);
    documentNumber = Number(numbering.next_number) || 1;
    const prefix = normalizeCode(numbering.prefix || documentClass);
    number = `${prefix}-${String(documentNumber).padStart(6, "0")}`;
    return { config, accounting, numbering, documentNumber, documentClass, documentKind, number, customerReference, postingDate, dueTerm, dueDate, headerText, societyCode, customer, associatedAccount, ledgerLines, subtotal, taxTotal, retentionTotal, total, totalDebit, totalCredit, period, firstBranch, firstCC };
  }

  return { documentClass, documentKind, number, customerReference, postingDate, dueTerm, dueDate, headerText, societyCode, customer, associatedAccount, ledgerLines, subtotal, taxTotal, retentionTotal, total, totalDebit, totalCredit, period, firstBranch, firstCC };
}

async function simulateReceivableDocument(tenantId, data) {
  return prisma.runWithTenant(tenantId, async () => {
    const preview = await prepareReceivableDocument(prisma, tenantId, data);
    return {
      document_kind: preview.documentKind,
      document_class: preview.documentClass,
      number: preview.number,
      customer_reference: preview.customerReference,
      posting_date: preview.postingDate,
      due_term: preview.dueTerm,
      due_date: preview.dueDate,
      customer: { id: preview.customer.id, name: preview.customer.legal_name || preview.customer.name, tax_id: preview.customer.tax_id },
      society_code: preview.societyCode,
      associated_account_code: preview.associatedAccount.code,
      subtotal: preview.subtotal,
      tax_total: preview.taxTotal,
      retention_total: preview.retentionTotal,
      total: preview.total,
      totals: { debit: preview.totalDebit, credit: preview.totalCredit },
      lines: preview.ledgerLines.map((line, i) => ({
        line_no: i + 1,
        account_code: line.account_code,
        account_name: line.account_name,
        debit: line.debit,
        credit: line.credit,
        description: line.description
      }))
    };
  });
}

async function createReceivableDocument(tenantId, userId, data) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const preview = await prepareReceivableDocument(tx, tenantId, data, { reserveNumber: true });
    const cxc = await tx.cxcCabdoc.create({
      data: {
        document_kind: preview.documentKind,
        document_class: preview.documentClass,
        number: preview.number,
        customer_reference: preview.customerReference,
        posting_date: preview.postingDate,
        due_term: preview.dueTerm,
        due_date: preview.dueDate,
        header_text: preview.headerText,
        customer_id: preview.customer.id,
        customer_tax_id: preview.customer.tax_id || null,
        society_code: preview.societyCode,
        associated_account_id: preview.associatedAccount.id,
        associated_account_code: preview.associatedAccount.code,
        sales_invoice_id: data.sales_invoice_id || null,
        subtotal: preview.subtotal,
        tax_total: preview.taxTotal,
        retention_total: preview.retentionTotal,
        total: preview.total,
        applied_total: 0,
        balance: preview.documentKind === "credit_note" ? 0 : preview.total,
        status: preview.documentKind === "credit_note" ? "cleared" : "open",
        created_by: userId || null
      }
    });

    const cnt = await tx.cntCabdoc.create({
      data: {
        document_type: preview.documentClass,
        document_number: preview.documentNumber,
        full_number: preview.number,
        posting_date: preview.postingDate,
        reference: preview.customerReference || `FV-${preview.documentNumber}`,
        header_text: preview.headerText,
        society_code: preview.societyCode,
        total_debit: preview.totalDebit,
        total_credit: preview.totalCredit,
        created_by: userId || null
      }
    });

    let lineNo = 1;
    const branchCode = preview.firstBranch || "SOC-01";
    const costCenterCode = preview.firstCC || "SOC-01";

    for (const line of preview.ledgerLines) {
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          account_id: line.account_id,
          transaction_id: null,
          date: preview.postingDate,
          debit: line.debit,
          credit: line.credit,
          balance: 0,
          description: line.description,
          period: preview.period
        }
      });
      await tx.cntCuedoc.create({
        data: {
          cabdoc_id: cnt.id,
          line_no: lineNo,
          account_id: line.account_id,
          account_code: line.account_code,
          branch_code: line.branch_code || branchCode,
          cost_center_code: line.cost_center_code || costCenterCode,
          party_id: preview.customer.id,
          party_tax_id: preview.customer.tax_id || null,
          movement: line.debit > 0 ? "debit" : "credit",
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          ledger_entry_id: ledgerEntry.id
        }
      });
      lineNo += 1;

      // Also create CxcCuedoc for each ledger line
      await tx.cxcCuedoc.create({
        data: {
          cabdoc_id: cxc.id,
          line_no: lineNo - 1,
          account_id: line.account_id,
          account_code: line.account_code,
          branch_code: line.branch_code || branchCode,
          cost_center_code: line.cost_center_code || costCenterCode,
          movement: line.debit > 0 ? "debit" : "credit",
          description: line.description,
          amount: line.debit > 0 ? line.debit : line.credit,
          total: line.debit > 0 ? line.debit : line.credit,
          retention_code: line.retention_code || null,
          retention_percent: line.retention_percent || 0,
          retention_amount: line.retention_amount || 0
        }
      });
    }

    // Update CxcCabdoc with accounting document id
    await tx.cxcCabdoc.update({
      where: { id: cxc.id },
      data: { accounting_document_id: cnt.id }
    });

    // Update customer balance
    const balanceDelta = preview.documentKind === "credit_note" ? -preview.total : preview.total;
    await tx.party.update({ where: { id: preview.customer.id }, data: { balance: { increment: balanceDelta } } });

    // Update numbering sequence
    const customNumbering = Array.isArray(preview.accounting.accounting_numbering) ? preview.accounting.accounting_numbering : [];
    const nextNumbering = [...customNumbering.filter((item) => normalizeAccountingDocumentType(item.document_type) !== preview.documentClass), {
      ...preview.numbering,
      document_type: preview.documentClass,
      prefix: normalizeCode(preview.numbering.prefix || preview.documentClass),
      next_number: preview.documentNumber + 1,
      active: true,
      source: preview.numbering.source || "Sistema"
    }];
    await tx.tenant.update({
      where: { id: tenantId },
      data: { config: { ...preview.config, accounting: { ...preview.accounting, accounting_numbering: nextNumbering } } }
    });

    return tx.cxcCabdoc.findFirst({ where: { id: cxc.id }, include: { lines: { orderBy: { line_no: "asc" } } } });
  }));
}

async function listReceivableDocuments(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {};
    if (query.document_kind) where.document_kind = String(query.document_kind);
    if (query.customer_id) where.customer_id = Number(query.customer_id);
    if (query.status) where.status = String(query.status);
    if (query.period) {
      const bounds = periodBounds(query.period);
      where.posting_date = { gte: bounds.start, lte: bounds.end };
    }
    if (String(query.open_only) === "true") where.balance = { gt: 0.01 };
    const rows = await prisma.cxcCabdoc.findMany({
      where,
      include: { lines: { orderBy: { line_no: "asc" } } },
      orderBy: [{ posting_date: "desc" }, { id: "desc" }],
      take: Number(query.limit) || 100
    });
    return rows;
  });
}

async function listOpenReceivableInvoices(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const customerId = Number(query.customer_id);
    if (!customerId) throw appError(400, "REQUIRED_CUSTOMER", "Seleccione un cliente para consultar facturas abiertas");
    const search = String(query.search || "").trim().toUpperCase();
    return prisma.cxcCabdoc.findMany({
      where: {
        document_kind: "invoice",
        customer_id: customerId,
        balance: { gt: 0.01 },
        ...(search ? { OR: [{ number: { contains: search } }, { customer_reference: { contains: search } }] } : {})
      },
      orderBy: [{ due_date: "asc" }, { id: "asc" }],
      take: Number(query.limit) || 100
    });
  });
}

async function getCustomerStatement(tenantId, customerId) {
  return prisma.runWithTenant(tenantId, async () => {
    const id = Number(customerId);
    if (!id) throw appError(400, "REQUIRED_CUSTOMER", "Seleccione un cliente");
    const customer = await prisma.party.findFirst({ where: { id, type: "customer" } });
    if (!customer) throw appError(404, "CUSTOMER_NOT_FOUND", "Cliente no encontrado");

    const documents = await prisma.cxcCabdoc.findMany({
      where: { customer_id: id },
      include: { lines: { orderBy: { line_no: "asc" } } },
      orderBy: [{ posting_date: "asc" }, { id: "asc" }]
    });

    const payments = await prisma.cxcPayment.findMany({
      where: { customer_id: id },
      orderBy: { date: "asc" }
    });

    // Build statement: interleave documents and payments chronologically
    const statement = [];
    for (const doc of documents) {
      statement.push({
        date: doc.posting_date,
        type: doc.document_kind === "credit_note" ? "NOTA_CREDITO" : "FACTURA",
        document_class: doc.document_class,
        number: doc.number,
        reference: doc.customer_reference,
        debit: doc.total,
        credit: 0,
        balance: doc.balance,
        status: doc.status,
        is_payment: false
      });
    }
    for (const pay of payments) {
      statement.push({
        date: pay.date,
        type: "PAGO",
        document_class: "PAGO",
        number: pay.reference || `PAGO-${pay.id}`,
        reference: pay.method,
        debit: 0,
        credit: pay.amount,
        balance: 0,
        status: "completed",
        is_payment: true,
        payment_method: pay.method,
        payment_reference: pay.reference
      });
    }
    statement.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance
    let runningBalance = 0;
    for (const row of statement) {
      runningBalance = round(runningBalance + row.debit - row.credit);
      row.running_balance = runningBalance;
    }

    return {
      customer: { id: customer.id, name: customer.legal_name || customer.name, tax_id: customer.tax_id },
      total_balance: customer.balance,
      credit_limit: customer.credit_limit,
      credit_days: customer.credit_days,
      statement
    };
  });
}

async function registerPaymentReceivable(tenantId, userId, data) {
  const { customer_id, cabdoc_ids = [], amount, method, date = new Date(), reference = null, notes = null, account_id = null } = data;
  if (!amount || amount <= 0) throw appError(400, "INVALID_AMOUNT", "El monto debe ser mayor a 0");
  const validMethods = ["cash", "bank_transfer", "check", "credit_card", "other"];
  if (!validMethods.includes(method)) throw appError(400, "INVALID_METHOD", `Metodo invalido. Validos: ${validMethods.join(", ")}`);

  await assertPeriodOpen(tenantId, date);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    // Build list of invoices to pay
    let invoices = [];
    if (cabdoc_ids.length > 0) {
      invoices = await tx.cxcCabdoc.findMany({
        where: { id: { in: cabdoc_ids.map(Number) }, customer_id: Number(customer_id), document_kind: "invoice", balance: { gt: 0.01 } },
        orderBy: [{ due_date: "asc" }, { id: "asc" }]
      });
    } else {
      // Pay oldest invoices first
      invoices = await tx.cxcCabdoc.findMany({
        where: { customer_id: Number(customer_id), document_kind: "invoice", balance: { gt: 0.01 } },
        orderBy: [{ due_date: "asc" }, { id: "asc" }]
      });
    }

    if (!invoices.length) throw appError(404, "NO_OPEN_INVOICES", "No hay facturas abiertas para este cliente");

    let remaining = amount;
    const paidInvoices = [];

    for (const invoice of invoices) {
      if (remaining <= 0.01) break;
      const toPay = round(Math.min(remaining, invoice.balance));
      const newBalance = round(invoice.balance - toPay);
      remaining = round(remaining - toPay);
      paidInvoices.push({ invoice, paid: toPay, newBalance });

      await tx.cxcPayment.create({
        data: {
          cabdoc_id: invoice.id,
          customer_id: Number(customer_id),
          type: "payment",
          method,
          amount: toPay,
          date: new Date(date),
          reference: reference || null,
          account_id: account_id || null,
          notes: notes || null,
          created_by: userId || null
        }
      });

      await tx.cxcCabdoc.update({
        where: { id: invoice.id },
        data: {
          applied_total: { increment: toPay },
          balance: newBalance,
          status: newBalance <= 0.01 ? "cleared" : "open"
        }
      });
    }

    const actualPaid = round(amount - remaining);
    const accountCode = account_id ? null : "1105"; // default cash account
    let cashAccount = null;
    if (account_id) {
      cashAccount = await tx.account.findFirst({ where: { id: account_id, active: true } });
    } else {
      cashAccount = await tx.account.findFirst({ where: { code: "1105", active: true } });
    }
    if (!cashAccount) throw appError(404, "CASH_ACCOUNT_NOT_FOUND", "Cuenta de efectivo no encontrada");

    const payableAccount = await tx.account.findFirst({ where: { id: invoices[0].associated_account_id } });
    if (!payableAccount) throw appError(404, "RECEIVABLE_ACCOUNT_NOT_FOUND", "Cuenta de deudor no encontrada");

    // Journal entry: Debit Cash 1105, Credit Customer 1305
    const period = periodFromDate(date);
    const description = `Pago ${method} ${reference ? reference : "Recibo"} - ${actualPaid}`;

    const ledgerEntry1 = await tx.ledgerEntry.create({
      data: {
        account_id: cashAccount.id,
        transaction_id: null,
        date: new Date(date),
        debit: actualPaid,
        credit: 0,
        balance: 0,
        description,
        period
      }
    });
    const ledgerEntry2 = await tx.ledgerEntry.create({
      data: {
        account_id: payableAccount.id,
        transaction_id: null,
        date: new Date(date),
        debit: 0,
        credit: actualPaid,
        balance: 0,
        description,
        period
      }
    });

    // Create accounting document for the payment
    const headerText = `Pago cliente ${invoices[0].customer_id}`;
    const societyCode = invoices[0].society_code || "SOC-01";
    const docType = "CI"; // Comprobante de Ingreso
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
    const config = tenant?.config || {};
    const accounting = config.accounting || {};
    const documentTypes = mergeByCode(DEFAULT_ACCOUNTING_DOCUMENT_TYPES, accounting.accounting_document_types, "code").map((row) => ({ ...row, code: normalizeAccountingDocumentType(row.code) }));
    const numbering = mergeNumbering(documentTypes, accounting.accounting_numbering).find((item) => item.document_type === docType && item.active !== false);
    const docNumber = Number(numbering?.next_number || 1);
    const prefix = normalizeCode(numbering?.prefix || docType);
    const fullNumber = `${prefix}-${String(docNumber).padStart(6, "0")}`;

    const cnt = await tx.cntCabdoc.create({
      data: {
        document_type: docType,
        document_number: docNumber,
        full_number: fullNumber,
        posting_date: new Date(date),
        reference: reference || null,
        header_text: `Pago recibo de cartera - ${description}`,
        society_code: societyCode,
        total_debit: actualPaid,
        total_credit: actualPaid,
        created_by: userId || null
      }
    });

    await tx.cntCuedoc.create({
      data: {
        cabdoc_id: cnt.id,
        line_no: 1,
        account_id: cashAccount.id,
        account_code: cashAccount.code,
        branch_code: "SOC-01",
        cost_center_code: "SOC-01",
        party_id: Number(customer_id),
        movement: "debit",
        debit: actualPaid,
        credit: 0,
        description,
        ledger_entry_id: ledgerEntry1.id
      }
    });
    await tx.cntCuedoc.create({
      data: {
        cabdoc_id: cnt.id,
        line_no: 2,
        account_id: payableAccount.id,
        account_code: payableAccount.code,
        branch_code: "SOC-01",
        cost_center_code: "SOC-01",
        party_id: Number(customer_id),
        movement: "credit",
        debit: 0,
        credit: actualPaid,
        description,
        ledger_entry_id: ledgerEntry2.id
      }
    });

    // Update customer balance
    await tx.party.update({ where: { id: Number(customer_id) }, data: { balance: { decrement: actualPaid } } });

    const nextNumbering = [...(Array.isArray(accounting.accounting_numbering) ? accounting.accounting_numbering : []).filter((item) => normalizeAccountingDocumentType(item.document_type) !== docType), {
      document_type: docType,
      prefix,
      next_number: docNumber + 1,
      active: true,
      source: numbering?.source || "Sistema"
    }];
    await tx.tenant.update({
      where: { id: tenantId },
      data: { config: { ...config, accounting: { ...accounting, accounting_numbering: nextNumbering } } }
    });

    return {
      paid: actualPaid,
      remaining,
      applied_to: paidInvoices.map((p) => ({ id: p.invoice.id, number: p.invoice.number, paid: p.paid, new_balance: p.newBalance })),
      accounting_document_id: cnt.id,
      accounting_document_number: fullNumber
    };
  }));
}

async function getAgingReceivablesReport(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const customerId = query.customer_id ? Number(query.customer_id) : null;
    const where = { document_kind: "invoice", balance: { gt: 0.01 } };
    if (customerId) where.customer_id = customerId;

    const today = new Date();
    const rows = await prisma.cxcCabdoc.findMany({
      where,
      orderBy: [{ due_date: "asc" }, { id: "asc" }]
    });

    // Get customer names
    const customerIds = [...new Set(rows.map((r) => r.customer_id))];
    const customers = customerIds.length ? await prisma.party.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, tax_id: true } }) : [];
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over90: 0 };
    const documents = rows.map((row) => {
      const dueDate = row.due_date || row.posting_date;
      const days = Math.max(0, Math.floor((today.getTime() - new Date(dueDate).getTime()) / 86400000));
      const bucket = days <= 0 ? "current" : days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "over90";
      buckets[bucket] = round(buckets[bucket] + row.balance);
      const cust = customerMap.get(row.customer_id);
      return {
        id: row.id,
        number: row.number,
        customer_reference: row.customer_reference,
        customer: cust ? { id: cust.id, name: cust.name, tax_id: cust.tax_id } : null,
        date: row.posting_date,
        due_date: row.due_date,
        total: row.total,
        balance: row.balance,
        days_overdue: days,
        bucket
      };
    });

    return {
      date: today,
      documents,
      buckets: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, round(value)])),
      total: round(documents.reduce((sum, row) => sum + row.balance, 0))
    };
  });
}

// ============================================================
// RETENTION MASTERS
// ============================================================

const DEFAULT_RETENTIONS = [
  { code: "RETEFUENTE-1.0", description: "Retencion en la Fuente 1.0%", account_code: "2365", percent: 1.0, concept: "Honorarios" },
  { code: "RETEFUENTE-2.5", description: "Retencion en la Fuente 2.5%", account_code: "2365", percent: 2.5, concept: "Servicios" },
  { code: "RETEFUENTE-3.5", description: "Retencion en la Fuente 3.5%", account_code: "2365", percent: 3.5, concept: "Compras" },
  { code: "RETEFUENTE-11", description: "Retencion en la Fuente 11%", account_code: "2365", percent: 11, concept: "Rendimientos financieros" },
  { code: "RETEICA-0.5", description: "Retencion ICA 0.5%", account_code: "2368", percent: 0.5, concept: "Industria y Comercio" },
  { code: "RETEIVA-15", description: "Retencion IVA 15%", account_code: "2367", percent: 15, concept: "IVA retenido" }
];

async function initializeRetentionMasters(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const existing = await prisma.retentionMaster.findFirst({ where: { tenant_id: tenantId } });
    if (existing) return { message: "Retenciones ya inicializadas" };
    for (const ret of DEFAULT_RETENTIONS) {
      await prisma.retentionMaster.create({
        data: { tenant_id: tenantId, ...ret }
      });
    }
    return { message: "Retenciones inicializadas", count: DEFAULT_RETENTIONS.length };
  });
}

async function getRetentionMasters(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    return prisma.retentionMaster.findMany({
      where: { tenant_id: tenantId },
      orderBy: { code: "asc" }
    });
  });
}

async function saveRetentionMaster(tenantId, data, id = null) {
  return prisma.runWithTenant(tenantId, async () => {
    const code = normalizeCode(data.code);
    const account_code = normalizeCode(data.account_code);
    if (!code || !data.description || !account_code || !data.percent) {
      throw appError(400, "REQUIRED_RETENTION_FIELDS", "Codigo, descripcion, cuenta contable y porcentaje son obligatorios");
    }
    const existing = await prisma.retentionMaster.findFirst({ where: { tenant_id: tenantId, code, ...(id ? { id: { not: Number(id) } } : {}) } });
    if (existing) throw appError(409, "DUPLICATE_RETENTION_CODE", `Ya existe una retencion con codigo ${code}`);

    const payload = {
      code,
      description: String(data.description).trim(),
      account_code,
      percent: Number(data.percent),
      concept: data.concept || null,
      active: data.active !== false
    };

    if (id) {
      const current = await prisma.retentionMaster.findFirst({ where: { id: Number(id), tenant_id: tenantId } });
      if (!current) throw appError(404, "RETENTION_NOT_FOUND", "Retencion no encontrada");
      return prisma.retentionMaster.update({ where: { id: current.id }, data: payload });
    }
    return prisma.retentionMaster.create({ data: { tenant_id: tenantId, ...payload } });
  });
}
