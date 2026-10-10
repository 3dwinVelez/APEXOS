// Gastos Menores / Cajas Menores - capa de servicio.
// T2: maestros (PettyCashConcept, PettyCashBox). T3 anadira anticipos/comprobantes y T4 reportes
// en las secciones reservadas al final del archivo, sin reescribir lo existente.
// Los dos maestros estan en SOFT_DELETE: el borrado es logico (active = false) y las busquedas
// usan __includeInactive solo donde hace falta distinguir inactivos.
// Tenant: jamas se escribe el filtro a mano ni se confia en un tenant_id del body; todo pasa por
// prisma.runWithTenant(tenantId, ...).
const prisma = require("../../core/prisma");
const accounting = require("../accounting/service");
const { partyRoleWhere } = require("../parties/roles");

// Reservado para T3 (anticipos + contabilizacion). Los maestros no necesitan transaccion.
const TX_OPTIONS = { maxWait: 5_000, timeout: 20_000 };

const CONCEPT_ACCOUNT_TYPE = "expense";
const BOX_ACCOUNT_TYPE = "asset";
const BOX_ACCOUNT_PREFIX = "11";
const BOX_ADVANCE_ACCOUNT_PREFIX = "13";
const CUSTODIAN_PARTY_ROLES = ["supplier", "employee"];

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function round(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

// Codigo de maestro y de IVA: siempre en mayusculas (mismo criterio que accounting/normalizeCode + VAT).
function upperCode(value) { return String(value ?? "").trim().toUpperCase(); }
// Codigo de cuenta y de estructura organizacional: solo trim, NO mayusculas.
// getOrganizationTree y Account conservan el codigo tal como se capturo.
function trimCode(value) { return String(value ?? "").trim(); }
function normalizeText(value) { return String(value ?? "").trim(); }
function nullableText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}
function activeRows(rows) { return Array.isArray(rows) ? rows.filter((row) => row && row.active !== false) : []; }

// === Helpers puros de validacion (exportados para pruebas unitarias) ===

// Cuenta de gasto del concepto: debe existir, ser type "expense", estar activa y permitir movimientos.
function assertExpenseAccount(account, requestedCode) {
  const code = trimCode(requestedCode);
  if (!account) throw appError(400, "CONCEPT_ACCOUNT_INVALID", `La cuenta de gasto ${code} no existe en el plan de cuentas del tenant`);
  if (account.type !== CONCEPT_ACCOUNT_TYPE) throw appError(400, "CONCEPT_ACCOUNT_INVALID", `La cuenta ${account.code} no es de tipo gasto; el concepto de caja menor debe apuntar a una cuenta de gastos (5xxx/6xxx/7xxx)`);
  if (account.active === false) throw appError(400, "CONCEPT_ACCOUNT_INVALID", `La cuenta de gasto ${account.code} esta inactiva`);
  if (account.allows_tx !== true) throw appError(400, "CONCEPT_ACCOUNT_INVALID", `La cuenta de gasto ${account.code} no permite movimientos`);
  return account;
}

// Cuenta de activo con prefijo PUC (11 caja / 13 anticipos).
function assertAssetAccount(account, requestedCode, prefix, errorCode, subject) {
  const code = trimCode(requestedCode);
  if (!account) throw appError(400, errorCode, `La cuenta ${code} de ${subject} no existe en el plan de cuentas del tenant`);
  if (account.type !== BOX_ACCOUNT_TYPE) throw appError(400, errorCode, `La cuenta ${account.code} de ${subject} debe ser de tipo activo`);
  if (account.active === false) throw appError(400, errorCode, `La cuenta ${account.code} de ${subject} esta inactiva`);
  if (account.allows_tx !== true) throw appError(400, errorCode, `La cuenta ${account.code} de ${subject} no permite movimientos`);
  if (!String(account.code || "").startsWith(prefix)) throw appError(400, errorCode, `La cuenta ${account.code} de ${subject} debe empezar por ${prefix} segun el PUC`);
  return account;
}

function assertBoxAccount(account, requestedCode) {
  return assertAssetAccount(account, requestedCode, BOX_ACCOUNT_PREFIX, "BOX_ACCOUNT_INVALID", "la caja menor");
}

// PUC de referencia para anticipos a terceros: 1330. No se siembra ni se asume por defecto:
// el codigo debe venir explicito en el payload.
function assertBoxAdvanceAccount(account, requestedCode) {
  const code = trimCode(requestedCode);
  if (!code) throw appError(400, "BOX_ADVANCE_ACCOUNT_INVALID", "La cuenta deudora del anticipo es obligatoria (PUC de referencia 1330, anticipos a terceros)");
  return assertAssetAccount(account, requestedCode, BOX_ADVANCE_ACCOUNT_PREFIX, "BOX_ADVANCE_ACCOUNT_INVALID", "el anticipo al custodio");
}

// Override opcional por concepto: misma regla PUC 13xx, pero no es obligatorio.
function assertConceptAdvanceAccount(account, requestedCode) {
  return assertAssetAccount(account, requestedCode, BOX_ADVANCE_ACCOUNT_PREFIX, "CONCEPT_ADVANCE_ACCOUNT_INVALID", "el anticipo del concepto");
}

// default_vat_code es solo una sugerencia: null significa "sin IVA sugerido", no "IVA 0%".
// El IVA real se decide linea a linea en T3.
function assertVatMaster(masters, code) {
  const normalized = upperCode(code);
  if (!normalized) return null;
  const master = activeRows(masters).find((row) => upperCode(row.code) === normalized);
  if (!master) throw appError(400, "VAT_MASTER_NOT_FOUND", `El codigo de IVA ${normalized} no existe o esta inactivo en el maestro de IVA de compras`);
  return normalized;
}

function assertMonthlyLimit(value) {
  if (value === undefined || value === null || value === "") return null;
  const limit = Number(value);
  if (!Number.isFinite(limit)) throw appError(400, "BOX_LIMIT_INVALID", "El limite mensual debe ser un numero");
  if (limit <= 0) throw appError(400, "BOX_LIMIT_INVALID", "El limite mensual de la caja debe ser mayor a cero o dejarse vacio");
  return round(limit);
}

// require_advance = true + block_unliquidated_advance = false es valido (anticipo obligatorio,
// varios anticipos abiertos permitidos). Lo incoherente es bloquear segundos anticipos en una caja
// que no usa anticipos: ahi se normaliza a false y se devuelve normalizado, sin error.
function normalizeAdvancePolicy(requireAdvance, blockUnliquidatedAdvance) {
  const requires = requireAdvance === true || requireAdvance === "true";
  if (!requires) return { require_advance: false, block_unliquidated_advance: false };
  const block = blockUnliquidatedAdvance === undefined || blockUnliquidatedAdvance === null
    ? true
    : (blockUnliquidatedAdvance === true || blockUnliquidatedAdvance === "true");
  return { require_advance: true, block_unliquidated_advance: block };
}

// La caja no tiene society_code, asi que se valida sucursal y centro de costo contra el arbol
// devuelto por accounting.getOrganizationTree (assertOrganizationReferences de accounting exige
// sociedad y no esta exportado).
function assertBoxOrganizationReferences(tree, branchCode, costCenterCode) {
  const branch = trimCode(branchCode);
  const costCenter = trimCode(costCenterCode);
  if (branch) {
    const found = activeRows(tree?.branches).find((item) => trimCode(item.code) === branch);
    if (!found) throw appError(400, "ORGANIZATION_REFERENCE_INVALID", `La sucursal ${branch} no existe o esta inactiva en la estructura organizacional`);
  }
  if (costCenter) {
    const found = activeRows(tree?.cost_centers).find((item) => trimCode(item.code) === costCenter && (!branch || trimCode(item.branch_code) === branch));
    if (!found) throw appError(400, "ORGANIZATION_REFERENCE_INVALID", `El centro de costo ${costCenter} no existe${branch ? ` o no pertenece a la sucursal ${branch}` : ""} en la estructura organizacional`);
  }
  return { branch_code: branch || null, cost_center_code: costCenter || null };
}

function custodianPartyWhere() {
  return { OR: CUSTODIAN_PARTY_ROLES.flatMap((role) => partyRoleWhere(role).OR) };
}

function custodianDisplayName(party) {
  if (!party) return null;
  return nullableText(party.legal_name) || nullableText(party.name);
}

// createAccountingDocument exige party_id en TODAS las lineas (accounting/service.js), por eso una
// caja sin custodio no puede girar anticipos ni contabilizar. No se bloquea la creacion: se informa.
function boxReadiness(box, context = {}) {
  const warnings = [];
  const custodian = context.custodian || null;
  const advanceAccount = context.advanceAccount || null;
  if (!custodian) warnings.push("La caja no tiene custodio asignado: sin custodio no se pueden girar anticipos ni contabilizar comprobantes (todo documento exige tercero).");
  if (!advanceAccount) warnings.push(`La cuenta de anticipo ${trimCode(box?.advance_account_code)} no es un activo 13xx activo y movible: la caja no podra girar anticipos.`);
  if (!box || !box.account_id) warnings.push("La caja no tiene resuelta la cuenta de efectivo (account_id): no se podra contabilizar contra ella.");
  return { ready_for_advances: Boolean(box && box.account_id && custodian && advanceAccount), warnings };
}

// Contrato para T3: girar un anticipo exige que la caja este lista.
function assertBoxReadyForAdvances(box, context = {}) {
  const readiness = boxReadiness(box, context);
  if (!readiness.ready_for_advances) {
    throw appError(422, "BOX_NOT_READY_FOR_ADVANCES", `La caja ${trimCode(box?.code)} no puede girar anticipos. ${readiness.warnings.join(" ")}`);
  }
  return readiness;
}

function conceptDto(row) {
  if (!row) return row;
  return { ...row };
}

function boxDto(row, context = {}) {
  if (!row) return row;
  const readiness = boxReadiness(row, context);
  return {
    ...row,
    monthly_limit: row.monthly_limit === null || row.monthly_limit === undefined ? null : Number(row.monthly_limit),
    ready_for_advances: readiness.ready_for_advances,
    warnings: readiness.warnings
  };
}

// === Resolutores compartidos (T3 debe reutilizarlos, no duplicarlos) ===

// __includeInactive permite distinguir "no existe" de "existe pero inactiva" y dar mensaje preciso.
async function findAccountByCode(tx, code) {
  const normalized = trimCode(code);
  if (!normalized) return null;
  return tx.account.findFirst({ where: { code: normalized, __includeInactive: true } });
}

async function resolveConceptAccount(tx, code) {
  return assertExpenseAccount(await findAccountByCode(tx, code), code);
}

async function resolveBoxAccount(tx, code) {
  return assertBoxAccount(await findAccountByCode(tx, code), code);
}

async function resolveBoxAdvanceAccount(tx, code) {
  return assertBoxAdvanceAccount(await findAccountByCode(tx, code), code);
}

// Devuelve null cuando el concepto no trae override de cuenta de anticipo.
async function resolveConceptAdvanceAccount(tx, code) {
  const normalized = trimCode(code);
  if (!normalized) return null;
  return assertConceptAdvanceAccount(await findAccountByCode(tx, normalized), normalized);
}

async function resolveCustodian(tx, partyId) {
  if (partyId === undefined || partyId === null || partyId === "") return null;
  const id = Number(partyId);
  if (!Number.isInteger(id) || id <= 0) throw appError(400, "BOX_CUSTODIAN_INVALID", "El custodio seleccionado no es valido");
  const party = await tx.party.findFirst({ where: { id, active: true, ...custodianPartyWhere() } });
  if (!party) throw appError(400, "BOX_CUSTODIAN_INVALID", "El custodio no existe, esta inactivo o no tiene rol de proveedor ni de empleado");
  return party;
}

// Enriquece cajas en lote (2 consultas, sin N+1) para calcular ready_for_advances y warnings.
async function enrichBoxes(tx, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [];
  const advanceCodes = [...new Set(list.map((row) => trimCode(row.advance_account_code)).filter(Boolean))];
  const custodianIds = [...new Set(list.map((row) => Number(row.custodian_party_id)).filter((id) => Number.isInteger(id) && id > 0))];
  const [advanceAccounts, custodians] = await Promise.all([
    advanceCodes.length
      ? tx.account.findMany({ where: { code: { in: advanceCodes }, type: BOX_ACCOUNT_TYPE, active: true, allows_tx: true } })
      : Promise.resolve([]),
    custodianIds.length
      ? tx.party.findMany({ where: { id: { in: custodianIds }, active: true } })
      : Promise.resolve([])
  ]);
  const accountsByCode = new Map(advanceAccounts.filter((account) => String(account.code || "").startsWith(BOX_ADVANCE_ACCOUNT_PREFIX)).map((account) => [trimCode(account.code), account]));
  const custodianById = new Map(custodians.map((party) => [Number(party.id), party]));
  return list.map((row) => boxDto(row, {
    advanceAccount: accountsByCode.get(trimCode(row.advance_account_code)) || null,
    custodian: custodianById.get(Number(row.custodian_party_id)) || null
  }));
}

// === Filtros y busquedas comunes ===

function includesInactive(query = {}) { return String(query.include_inactive) === "true"; }
function conceptListWhere(query = {}) { return includesInactive(query) ? { __includeInactive: true } : {}; }
function boxListWhere(query = {}) { return includesInactive(query) ? { __includeInactive: true } : {}; }

async function findConcept(tx, id) {
  const conceptId = Number(id);
  if (!Number.isInteger(conceptId) || conceptId <= 0) throw appError(404, "CONCEPT_NOT_FOUND", "Concepto de caja menor no encontrado");
  const row = await tx.pettyCashConcept.findFirst({ where: { id: conceptId, __includeInactive: true } });
  if (!row) throw appError(404, "CONCEPT_NOT_FOUND", "Concepto de caja menor no encontrado");
  return row;
}

async function findBox(tx, id) {
  const boxId = Number(id);
  if (!Number.isInteger(boxId) || boxId <= 0) throw appError(404, "BOX_NOT_FOUND", "Caja menor no encontrada");
  const row = await tx.pettyCashBox.findFirst({ where: { id: boxId, __includeInactive: true } });
  if (!row) throw appError(404, "BOX_NOT_FOUND", "Caja menor no encontrada");
  return row;
}

// === Maestro de conceptos de gasto ===

async function listConcepts(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.pettyCashConcept.findMany({
      where: conceptListWhere(query),
      orderBy: [{ active: "desc" }, { code: "asc" }]
    });
    return rows.map(conceptDto);
  });
}

async function getConcept(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => conceptDto(await findConcept(prisma, id)));
}

async function saveConcept(tenantId, userId, data = {}, id = null) {
  const code = upperCode(data.code);
  const name = normalizeText(data.name);
  if (!code || !name) throw appError(400, "REQUIRED_CONCEPT_FIELDS", "Codigo y nombre del concepto son obligatorios");
  if (!trimCode(data.account_code)) throw appError(400, "CONCEPT_ACCOUNT_INVALID", "La cuenta de gasto del concepto es obligatoria");

  return prisma.runWithTenant(tenantId, async () => {
    const current = id ? await findConcept(prisma, id) : null;
    // En actualizacion, las claves ausentes heredan el valor vigente (PUT parcial seguro).
    const inherited = (key) => (data[key] === undefined && current ? current[key] : data[key]);

    const account = await resolveConceptAccount(prisma, data.account_code);
    const advanceAccount = await resolveConceptAdvanceAccount(prisma, inherited("advance_account_code"));
    const requestedVat = inherited("default_vat_code");
    const vatCode = requestedVat === undefined || requestedVat === null || requestedVat === ""
      ? null
      : assertVatMaster(await accounting.getVatMasters(tenantId, "purchases"), requestedVat);

    const duplicate = await prisma.pettyCashConcept.findFirst({
      where: { code, ...(id ? { id: { not: Number(id) } } : {}), __includeInactive: true }
    });
    if (duplicate) throw appError(409, "CONCEPT_CODE_TAKEN", `Ya existe un concepto de caja menor con el codigo ${code}`);

    const payload = {
      code,
      name,
      account_id: account.id,
      account_code: account.code,
      advance_account_code: advanceAccount ? advanceAccount.code : null,
      default_vat_code: vatCode,
      requires_supplier: inherited("requires_supplier") === true,
      requires_invoice_reference: inherited("requires_invoice_reference") === true,
      notes: nullableText(inherited("notes"))
    };

    if (current) {
      if (data.active !== undefined) payload.active = data.active !== false;
      const updated = await prisma.pettyCashConcept.update({ where: { id: current.id }, data: payload });
      return conceptDto(updated);
    }
    const created = await prisma.pettyCashConcept.create({ data: { ...payload, active: data.active !== false } });
    return conceptDto(created);
  });
}

async function createConcept(tenantId, userId, data) { return saveConcept(tenantId, userId, data, null); }
async function updateConcept(tenantId, userId, id, data) { return saveConcept(tenantId, userId, data, id); }

// Borrado logico: nunca DELETE fisico (PettyCashConcept esta en SOFT_DELETE).
async function setConceptActive(tenantId, id, active) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await findConcept(prisma, id);
    const updated = await prisma.pettyCashConcept.update({ where: { id: current.id }, data: { active: active !== false } });
    return conceptDto(updated);
  });
}

// === Maestro de cajas menores ===

async function listBoxes(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await prisma.pettyCashBox.findMany({
      where: boxListWhere(query),
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
    return enrichBoxes(prisma, rows);
  });
}

async function getBox(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const rows = await enrichBoxes(prisma, [await findBox(prisma, id)]);
    return rows[0];
  });
}

async function saveBox(tenantId, userId, data = {}, id = null) {
  const code = upperCode(data.code);
  const name = normalizeText(data.name);
  if (!code || !name) throw appError(400, "REQUIRED_BOX_FIELDS", "Codigo y nombre de la caja menor son obligatorios");
  if (!trimCode(data.account_code)) throw appError(400, "BOX_ACCOUNT_INVALID", "La cuenta de efectivo de la caja es obligatoria (activo que inicia por 11)");

  return prisma.runWithTenant(tenantId, async () => {
    const current = id ? await findBox(prisma, id) : null;
    // En actualizacion, las claves de politica ausentes heredan el valor vigente: asi un PUT
    // parcial no desactiva por accidente la exigencia de anticipo ni borra el limite mensual.
    const inherited = (key) => (data[key] === undefined && current ? current[key] : data[key]);
    const limit = assertMonthlyLimit(inherited("monthly_limit"));
    const policy = normalizeAdvancePolicy(inherited("require_advance"), inherited("block_unliquidated_advance"));

    const account = await resolveBoxAccount(prisma, data.account_code);
    const advanceAccount = await resolveBoxAdvanceAccount(prisma, data.advance_account_code);
    const custodian = await resolveCustodian(prisma, inherited("custodian_party_id"));
    const organization = assertBoxOrganizationReferences(
      (inherited("branch_code") || inherited("cost_center_code")) ? await accounting.getOrganizationTree(tenantId) : { branches: [], cost_centers: [] },
      inherited("branch_code"),
      inherited("cost_center_code")
    );

    const duplicate = await prisma.pettyCashBox.findFirst({
      where: { code, ...(id ? { id: { not: Number(id) } } : {}), __includeInactive: true }
    });
    if (duplicate) throw appError(409, "BOX_CODE_TAKEN", `Ya existe una caja menor con el codigo ${code}`);

    const payload = {
      code,
      name,
      account_id: account.id,
      account_code: account.code,
      advance_account_code: advanceAccount.code,
      custodian_party_id: custodian ? custodian.id : null,
      // custodian_name siempre se deriva del tercero resuelto: no se acepta del cliente.
      custodian_name: custodianDisplayName(custodian),
      branch_code: organization.branch_code,
      cost_center_code: organization.cost_center_code,
      monthly_limit: limit,
      require_advance: policy.require_advance,
      block_unliquidated_advance: policy.block_unliquidated_advance,
      notes: nullableText(inherited("notes"))
    };

    const stored = current
      ? await prisma.pettyCashBox.update({
        where: { id: current.id },
        data: data.active === undefined ? payload : { ...payload, active: data.active !== false }
      })
      : await prisma.pettyCashBox.create({ data: { ...payload, active: data.active !== false, created_by: userId || null } });

    return boxDto(stored, { advanceAccount, custodian });
  });
}

async function createBox(tenantId, userId, data) { return saveBox(tenantId, userId, data, null); }
async function updateBox(tenantId, userId, id, data) { return saveBox(tenantId, userId, data, id); }

// Borrado logico: nunca DELETE fisico (PettyCashBox esta en SOFT_DELETE).
async function setBoxActive(tenantId, id, active) {
  return prisma.runWithTenant(tenantId, async () => {
    const current = await findBox(prisma, id);
    const updated = await prisma.pettyCashBox.update({ where: { id: current.id }, data: { active: active !== false } });
    const rows = await enrichBoxes(prisma, [updated]);
    return rows[0];
  });
}

// === T3: anticipos y comprobantes de caja menor (contabilizacion inmediata) ===
//
// DECISION A/B sobre como emitir el documento contable (documentada para el manifiesto de alcance):
//   Se usa el patron treasury/inventario (opcion ii): el CntCabdoc, sus CntCuedoc y los LedgerEntry
//   se crean DENTRO del $transaction del modulo. No se llama a accounting.createAccountingDocument
//   (opcion i) porque esa funcion NO acepta un tx: abre su propio prisma.$transaction, de modo que
//   el comprobante quedaria contabilizado aunque la grabacion del voucher fallara despues (sin
//   atomicidad), y ademas exige society/branch/cost_center validados contra el maestro
//   organizacional, datos que la caja menor no siempre tiene.
//   La numeracion NO se resuelve con el numberingFromConfig naive de treasury: accounting/service.js
//   documenta que otros modulos reescriben Tenant.config completo desde cache y pueden revertir
//   next_number a un valor obsoleto (P2002 determinista). Se usa el mecanismo canonico
//   accounting.reserveAccountingDocumentNumber (pg_advisory_xact_lock por tenant +
//   max(configurado, maximo emitido + 1)), que es exactamente lo que hacen
//   createGoodsReceiptDocumentTx / createInventoryAdjustmentDocumentTx dentro del propio accounting.
//   Atomicidad: un solo $transaction. Colisiones: imposibles por el candado advisory.
//
// Convenciones contables implementadas (doble partida, tolerancia 0.01):
//   APC giro de anticipo   : debito advance_account_code (13xx) / credito account_code (caja 11xx)
//   GM  gasto menor        : debito cuenta del concepto + debito cuenta de IVA (2408) por linea /
//                            credito advance_account_code (imputado) y/o account_code (contra caja)
//   LCM liquidacion        : debito account_code (reintegro) + debito cuenta del concepto del
//                            faltante / credito advance_account_code por el saldo del anticipo
//   Anulaciones: documento espejo con is_reversal + referenced_document_id e is_cancelled en el
//   original (mismo patron que treasury.cancelPayment). Los documentos de caja menor NUNCA se
//   borran fisicamente: PettyCashAdvance/Voucher/VoucherLine estan fuera de SOFT_DELETE y de
//   PHYSICAL_DELETE_ALLOWED a proposito (core/prisma.js).
//   La liquidacion NO altera balance/applied_total: preserva el invariante
//   balance = amount - applied_total y deja refund_amount/shortfall_amount como la disposicion
//   del saldo. T4 (reportes) debe leer status, no derivar el estado del saldo.

const ADVANCE_DOCUMENT_TYPE = "APC";
const VOUCHER_DOCUMENT_TYPE = "GM";
const LIQUIDATION_DOCUMENT_TYPE = "LCM";
const ADVANCE_STATUS_OPEN = "open";
const ADVANCE_STATUS_LIQUIDATED = "liquidated";
const ADVANCE_STATUS_CANCELLED = "cancelled";
const VOUCHER_STATUS_POSTED = "posted";
const VOUCHER_STATUS_CANCELLED = "cancelled";
// CntCabdoc.society_code no acepta nulos y la caja menor no tiene sociedad: se usa la primera
// sociedad activa del arbol organizacional (getOrganizationTree ya devuelve SOC-01 por defecto).
const DEFAULT_SOCIETY_CODE = "SOC-01";
const BALANCE_TOLERANCE = 0.01;
const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Decimal de Prisma -> numero plano. Todos los importes que salen del modulo pasan por aqui para
// que el contrato JSON de T5-T7 sea siempre numerico (nunca un objeto Decimal ni un string).
function money(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? round(parsed) : 0;
}

// Fecha sin hora -> UTC. Si se parsea como hora local, periodFromDate (que usa toISOString)
// puede correr el periodo un mes hacia atras en servidores con zona horaria positiva.
function parseDocumentDate(value, code, subject) {
  const text = normalizeText(value);
  if (!text) throw appError(400, code, `La fecha ${subject} es obligatoria (formato AAAA-MM-DD)`);
  const parsed = new Date(DATE_ONLY_PATTERN.test(text) ? `${text}T00:00:00.000Z` : text);
  if (Number.isNaN(parsed.getTime())) throw appError(400, code, `La fecha ${subject} no es valida (formato AAAA-MM-DD)`);
  return parsed;
}

function assertPositiveAmount(value, code, message) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw appError(400, code, message);
  return round(amount);
}

// Rango del mes en UTC, coherente con parseDocumentDate y con accounting.periodFromDate (que usa
// toISOString). NO se reutiliza accounting.periodBounds: construye el rango con el constructor
// local `new Date(year, month - 1, 1)`, que en America/Bogota (UTC-5) devuelve
// [01T05:00:00Z .. dia1SiguienteT04:59Z] y dejaria por fuera los documentos fechados el primer
// dia del mes (almacenados a medianoche UTC) metiendo los del dia 1 del mes siguiente.
function monthBoundsUtc(period) {
  const [year, month] = String(period || "").split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw appError(400, "INVALID_PERIOD", `El periodo ${period} no tiene formato AAAA-MM`);
  }
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    // Dia 0 del mes siguiente = ultimo dia del mes pedido (funciona con febrero y meses de 30).
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  };
}

function pageParams(query = {}) {
  const limit = Number(query.limit);
  const offset = Number(query.offset);
  return {
    take: Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE,
    skip: Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0
  };
}

function dateRange(query = {}, field = "date") {
  const from = normalizeText(query.date_from);
  const to = normalizeText(query.date_to);
  if (!from && !to) return {};
  const range = {};
  if (from) range.gte = parseDocumentDate(from, "DATE_FILTER_INVALID", "inicial del filtro");
  if (to) {
    const end = parseDocumentDate(to, "DATE_FILTER_INVALID", "final del filtro");
    end.setUTCHours(23, 59, 59, 999);
    range.lte = end;
  }
  return { [field]: range };
}

// --- Numeracion contable canonica (advisory lock + auto-sanado) leida fresca DENTRO del tx ---

async function reserveDocumentNumber(tx, tenantId, documentType) {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
  const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
  const accountingConfig = config.accounting && typeof config.accounting === "object" ? config.accounting : {};
  const merged = accounting.mergeNumbering(accounting.DEFAULT_ACCOUNTING_DOCUMENT_TYPES, accountingConfig.accounting_numbering);
  const numbering = merged.find((row) => upperCode(row.document_type) === documentType && row.active !== false);
  if (!numbering) throw appError(400, "NUMBERING_NOT_IN_MASTER", `El tipo de documento ${documentType} no tiene numeracion activa en el maestro contable`);
  const documentNumber = await accounting.reserveAccountingDocumentNumber(tx, tenantId, documentType, numbering);
  const prefix = trimCode(numbering.prefix) || documentType;
  return {
    tenantId,
    config,
    accountingConfig,
    merged,
    document_type: documentType,
    document_number: documentNumber,
    prefix,
    full_number: `${prefix}-${String(documentNumber).padStart(6, "0")}`
  };
}

// Se escribe de vuelta el arreglo ya normalizado por mergeNumbering: conserva las filas de los
// otros tipos y materializa el next_number real, igual que createGoodsReceiptDocumentTx.
async function persistDocumentNumber(tx, reserved) {
  const nextNumbering = reserved.merged.map((row) => (upperCode(row.document_type) === reserved.document_type
    ? { ...row, prefix: reserved.prefix, next_number: reserved.document_number + 1, active: true, source: row.source || "Sistema" }
    : row));
  await tx.tenant.update({
    where: { id: reserved.tenantId },
    data: { config: { ...reserved.config, accounting: { ...reserved.accountingConfig, accounting_numbering: nextNumbering } } }
  });
}

// Candado por caja: serializa "existe anticipo abierto?" contra el giro concurrente de otro
// anticipo (block_unliquidated_advance) y contra la imputacion/liquidacion simultanea del mismo
// anticipo. Sin esto dos peticiones en paralelo leen el mismo estado y ambas pasan la validacion.
async function lockBox(tx, tenantId, boxId) {
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", `${tenantId}:petty-cash-box:${boxId}`);
}

// --- Estructura organizacional y emision del documento contable ---

async function organizationContext(tenantId, box) {
  const tree = await accounting.getOrganizationTree(tenantId);
  // Reutiliza el validador de T2 (assertOrganizationReferences de accounting no esta exportado y
  // exige sociedad, dato que la caja menor no tiene).
  const organization = assertBoxOrganizationReferences(tree, box?.branch_code, box?.cost_center_code);
  const branch = organization.branch_code
    ? activeRows(tree?.branches).find((item) => trimCode(item.code) === organization.branch_code)
    : null;
  const societyCode = trimCode(branch?.society_code) || trimCode(activeRows(tree?.societies)[0]?.code) || DEFAULT_SOCIETY_CODE;
  // branch_code/cost_center_code de CntCuedoc no aceptan nulo: respaldo con la sociedad
  // (precedente treasury: sourceLine?.branch_code || societies[0]).
  return {
    tree,
    societyCode,
    branchCode: organization.branch_code || societyCode,
    costCenterCode: organization.cost_center_code || societyCode
  };
}

// La linea hereda sucursal/centro de costo de la caja; si trae los propios se validan contra el
// arbol (400 ORGANIZATION_REFERENCE_INVALID).
function resolveLineOrganization(context, line = {}) {
  const organization = assertBoxOrganizationReferences(context.tree, line.branch_code, line.cost_center_code);
  return {
    branch_code: organization.branch_code || context.branchCode,
    cost_center_code: organization.cost_center_code || context.costCenterCode
  };
}

function documentLine({ account, movement, amount, party, description, branchCode, costCenterCode, tax = null, ref = null }) {
  const value = round(Number(amount));
  const side = movement === "credit" ? "credit" : "debit";
  return {
    ref,
    account_id: account.id,
    account_code: account.code,
    movement: side,
    debit: side === "debit" ? value : 0,
    credit: side === "credit" ? value : 0,
    party_id: Number(party?.id) || null,
    party_tax_id: party?.tax_id || null,
    description: normalizeText(description),
    branch_code: trimCode(branchCode),
    cost_center_code: trimCode(costCenterCode),
    tax_type: tax?.tax_type || null,
    tax_code: tax?.tax_code || null,
    tax_base: tax ? round(tax.tax_base) : 0,
    tax_rate: tax ? Number(tax.tax_rate) : 0,
    tax_amount: tax ? round(tax.tax_amount) : 0
  };
}

function assertBalancedDocument(lines) {
  const totalDebit = round(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const totalCredit = round(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  if (Math.abs(totalDebit - totalCredit) > BALANCE_TOLERANCE) {
    throw appError(422, "UNBALANCED_DOCUMENT", `Documento no cuadra: Debito ${totalDebit.toFixed(2)}, Credito ${totalCredit.toFixed(2)}`);
  }
  return { total_debit: totalDebit, total_credit: totalCredit };
}

async function createAccountingDocumentTx(tx, options) {
  const { tenantId, userId, documentType, postingDate, lines } = options;
  if (!Array.isArray(lines) || lines.length < 2) throw appError(400, "MIN_DOCUMENT_LINES", "El comprobante contable requiere al menos dos lineas");
  for (const line of lines) {
    if (!line.account_code) throw appError(400, "REQUIRED_DOCUMENT_LINE", "Cada linea contable requiere cuenta");
    if (!line.description) throw appError(400, "REQUIRED_DOCUMENT_LINE", "Cada linea contable requiere descripcion");
    if (!(Number(line.debit) > 0) && !(Number(line.credit) > 0)) throw appError(400, "INVALID_LINE_AMOUNT", "Cada linea contable requiere un valor mayor a cero");
    const partyId = Number(line.party_id);
    if (!Number.isInteger(partyId) || partyId <= 0) {
      throw appError(422, "PARTY_REQUIRED_FOR_POSTING", "Cada linea contable requiere un tercero: la caja menor debe tener custodio o la linea debe registrar proveedor");
    }
  }
  const totals = assertBalancedDocument(lines);
  const reserved = await reserveDocumentNumber(tx, tenantId, documentType);
  const societyCode = trimCode(options.societyCode) || DEFAULT_SOCIETY_CODE;
  const headerText = typeof options.header === "function"
    ? options.header(reserved.full_number)
    : normalizeText(options.header) || `${documentType} ${reserved.full_number}`;
  const period = accounting.periodFromDate(postingDate);
  const cabdoc = await tx.cntCabdoc.create({
    data: {
      document_type: documentType,
      document_number: reserved.document_number,
      full_number: reserved.full_number,
      posting_date: postingDate,
      reference: nullableText(options.reference),
      header_text: headerText,
      society_code: societyCode,
      total_debit: totals.total_debit,
      total_credit: totals.total_credit,
      created_by: userId || null,
      is_reversal: options.isReversal === true,
      referenced_document_id: options.referencedDocumentId || null
    }
  });
  let lineNo = 1;
  const createdLines = [];
  for (const line of lines) {
    const ledger = await tx.ledgerEntry.create({
      data: {
        account_id: line.account_id,
        transaction_id: null,
        date: postingDate,
        debit: line.debit,
        credit: line.credit,
        balance: 0,
        description: line.description,
        period
      }
    });
    await tx.cntCuedoc.create({
      data: {
        cabdoc_id: cabdoc.id,
        line_no: lineNo,
        account_id: line.account_id,
        account_code: line.account_code,
        branch_code: line.branch_code || societyCode,
        cost_center_code: line.cost_center_code || societyCode,
        party_id: line.party_id,
        party_tax_id: line.party_tax_id,
        movement: line.movement,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        tax_type: line.tax_type,
        tax_code: line.tax_code,
        tax_base: line.tax_base,
        tax_rate: line.tax_rate,
        tax_amount: line.tax_amount,
        ledger_entry_id: ledger.id
      }
    });
    createdLines.push({ ...line, line_no: lineNo, ledger_entry_id: ledger.id });
    lineNo += 1;
  }
  return {
    cabdoc,
    reserved,
    document_number: reserved.document_number,
    full_number: reserved.full_number,
    lines: createdLines,
    total_debit: totals.total_debit,
    total_credit: totals.total_credit
  };
}

// Documento espejo del original (debito <-> credito), mismo patron que treasury.cancelPayment.
async function createReversalDocumentTx(tx, { tenantId, userId, original, postingDate, sourceNumber }) {
  const description = `Reversion ${sourceNumber}`;
  const lines = (original.lines || []).map((line) => ({
    ref: { reversed_line_no: line.line_no },
    account_id: line.account_id,
    account_code: line.account_code,
    branch_code: line.branch_code,
    cost_center_code: line.cost_center_code,
    party_id: Number(line.party_id) || null,
    party_tax_id: line.party_tax_id || null,
    movement: Number(line.credit) > 0 ? "debit" : "credit",
    debit: round(Number(line.credit)),
    credit: round(Number(line.debit)),
    description,
    tax_type: line.tax_type || null,
    tax_code: line.tax_code || null,
    tax_base: Number(line.tax_base || 0),
    tax_rate: Number(line.tax_rate || 0),
    tax_amount: Number(line.tax_amount || 0)
  }));
  if (!lines.length) throw appError(422, "ACCOUNTING_TRACE_NOT_FOUND", `El asiento original de ${sourceNumber} no tiene lineas para reversar`);
  return createAccountingDocumentTx(tx, {
    tenantId,
    userId,
    documentType: original.document_type,
    postingDate,
    societyCode: original.society_code,
    reference: sourceNumber,
    header: () => description,
    lines,
    isReversal: true,
    referencedDocumentId: original.id
  });
}

// --- Conceptos y terceros ---

async function findActiveConceptByCode(tx, code, subject) {
  const normalized = upperCode(code);
  if (!normalized) throw appError(400, "CONCEPT_NOT_FOUND", `${subject} requiere un concepto de gasto de caja menor`);
  const row = await tx.pettyCashConcept.findFirst({ where: { code: normalized, __includeInactive: true } });
  if (!row) throw appError(400, "CONCEPT_NOT_FOUND", `${subject}: el concepto de caja menor ${normalized} no existe en el maestro`);
  if (row.active === false) throw appError(400, "CONCEPT_NOT_FOUND", `${subject}: el concepto de caja menor ${normalized} esta inactivo`);
  return row;
}

// A nivel de linea el error es 400 (validacion de captura); GET /concepts/:id sigue devolviendo
// 404 CONCEPT_NOT_FOUND (comportamiento de T2, sin cambios).
async function resolveLineConcept(tx, raw, position) {
  const code = upperCode(raw?.concept_code);
  const id = Number(raw?.concept_id);
  if (!code && !(Number.isInteger(id) && id > 0)) {
    throw appError(400, "CONCEPT_NOT_FOUND", `La linea ${position} requiere un concepto de gasto (concept_code o concept_id)`);
  }
  if (code) return findActiveConceptByCode(tx, code, `La linea ${position}`);
  const row = await tx.pettyCashConcept.findFirst({ where: { id, __includeInactive: true } });
  if (!row) throw appError(400, "CONCEPT_NOT_FOUND", `La linea ${position}: el concepto de caja menor con id ${id} no existe en el maestro`);
  if (row.active === false) throw appError(400, "CONCEPT_NOT_FOUND", `La linea ${position}: el concepto de caja menor ${row.code} esta inactivo`);
  return row;
}

// partyRoleWhere("supplier") se reutiliza desde parties/roles.js: no se reimplementa el rol.
async function resolveSupplier(tx, partyId) {
  if (partyId === undefined || partyId === null || partyId === "") return null;
  const id = Number(partyId);
  if (!Number.isInteger(id) || id <= 0) throw appError(400, "SUPPLIER_INVALID", "El proveedor seleccionado no es valido");
  const party = await tx.party.findFirst({ where: { id, active: true, AND: [partyRoleWhere("supplier")] } });
  if (!party) throw appError(400, "SUPPLIER_INVALID", "El proveedor no existe, esta inactivo o no tiene rol de proveedor");
  return party;
}

// --- DTO (Decimal -> numero; fechas ISO tal como las serializa Prisma/Fastify) ---

function boxSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    account_code: row.account_code,
    advance_account_code: row.advance_account_code,
    custodian_party_id: row.custodian_party_id ?? null,
    custodian_name: row.custodian_name ?? null
  };
}

function advanceSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    full_number: row.full_number,
    date: row.date,
    status: row.status,
    amount: money(row.amount),
    applied_total: money(row.applied_total),
    balance: money(row.balance),
    custodian_name: row.custodian_name ?? null
  };
}

function advanceDto(row, context = {}) {
  if (!row) return row;
  const box = row.box || context.box || null;
  return {
    id: row.id,
    box_id: row.box_id,
    document_type: row.document_type,
    number: row.number,
    full_number: row.full_number,
    date: row.date,
    custodian_party_id: row.custodian_party_id ?? null,
    custodian_name: row.custodian_name ?? null,
    amount: money(row.amount),
    applied_total: money(row.applied_total),
    balance: money(row.balance),
    status: row.status,
    description: row.description ?? null,
    accounting_document_id: row.accounting_document_id ?? null,
    reversal_accounting_document_id: row.reversal_accounting_document_id ?? null,
    liquidated_at: row.liquidated_at ?? null,
    refund_amount: money(row.refund_amount),
    shortfall_amount: money(row.shortfall_amount),
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    box: boxSummary(box),
    vouchers_count: context.vouchers_count ?? row._count?.vouchers ?? null
  };
}

function voucherLineDto(row, parties = new Map()) {
  const total = money(row.total);
  const applied = money(row.advance_applied);
  return {
    id: row.id,
    voucher_id: row.voucher_id,
    line_number: row.line_number,
    concept_id: row.concept_id,
    concept_code: row.concept_code,
    account_code: row.account_code,
    description: row.description,
    cost_center_code: row.cost_center_code ?? null,
    branch_code: row.branch_code ?? null,
    supplier_party_id: row.supplier_party_id ?? null,
    supplier: parties.get(Number(row.supplier_party_id)) || null,
    invoice_reference: row.invoice_reference ?? null,
    base_amount: money(row.base_amount),
    vat_code: row.vat_code ?? null,
    vat_percent: Number(row.vat_percent || 0),
    vat_amount: money(row.vat_amount),
    vat_account_code: row.vat_account_code ?? null,
    total,
    advance_applied: applied,
    cash_applied: round(total - applied),
    ledger_entry_id: row.ledger_entry_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function voucherDto(row, context = {}) {
  if (!row) return row;
  const box = row.box || context.box || null;
  const advance = row.advance || context.advance || null;
  const rawLines = Array.isArray(row.lines) ? row.lines : (Array.isArray(context.lines) ? context.lines : null);
  const parties = context.parties instanceof Map ? context.parties : new Map();
  const dto = {
    id: row.id,
    box_id: row.box_id,
    advance_id: row.advance_id ?? null,
    document_type: row.document_type,
    number: row.number,
    full_number: row.full_number,
    date: row.date,
    posting_date: row.posting_date,
    period: row.period,
    description: row.description ?? null,
    status: row.status,
    subtotal: money(row.subtotal),
    vat_total: money(row.vat_total),
    total: money(row.total),
    accounting_document_id: row.accounting_document_id ?? null,
    reversal_accounting_document_id: row.reversal_accounting_document_id ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    box: boxSummary(box),
    advance: advanceSummary(advance),
    lines_count: rawLines ? rawLines.length : (row._count?.lines ?? null),
    advance_applied_total: rawLines ? money(rawLines.reduce((sum, line) => sum + Number(line.advance_applied || 0), 0)) : null,
    cash_applied_total: rawLines
      ? money(rawLines.reduce((sum, line) => sum + (Number(line.total || 0) - Number(line.advance_applied || 0)), 0))
      : null
  };
  if (rawLines) {
    dto.lines = [...rawLines]
      .sort((a, b) => Number(a.line_number) - Number(b.line_number))
      .map((line) => voucherLineDto(line, parties));
  }
  return dto;
}

function accountingDocumentDto(row) {
  if (!row) return null;
  const dto = {
    id: row.id,
    document_type: row.document_type,
    document_number: row.document_number,
    full_number: row.full_number,
    posting_date: row.posting_date,
    reference: row.reference ?? null,
    header_text: row.header_text,
    society_code: row.society_code,
    status: row.status,
    is_reversal: row.is_reversal === true,
    is_cancelled: row.is_cancelled === true,
    referenced_document_id: row.referenced_document_id ?? null,
    cancelled_by: row.cancelled_by ?? null,
    cancelled_at: row.cancelled_at ?? null,
    total_debit: Number(row.total_debit || 0),
    total_credit: Number(row.total_credit || 0),
    created_at: row.created_at
  };
  if (Array.isArray(row.lines)) {
    dto.lines = [...row.lines].sort((a, b) => Number(a.line_no) - Number(b.line_no)).map((line) => ({
      line_no: line.line_no,
      account_id: line.account_id,
      account_code: line.account_code,
      branch_code: line.branch_code,
      cost_center_code: line.cost_center_code,
      party_id: line.party_id,
      party_tax_id: line.party_tax_id ?? null,
      movement: line.movement,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      description: line.description,
      tax_type: line.tax_type ?? null,
      tax_code: line.tax_code ?? null,
      tax_base: Number(line.tax_base || 0),
      tax_rate: Number(line.tax_rate || 0),
      tax_amount: Number(line.tax_amount || 0),
      ledger_entry_id: line.ledger_entry_id ?? null
    }));
  }
  return dto;
}

async function partySummaryMap(tx, ids) {
  const unique = [...new Set((ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!unique.length) return new Map();
  const rows = await tx.party.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, legal_name: true, tax_id: true } });
  return new Map(rows.map((row) => [Number(row.id), { id: row.id, name: row.name, legal_name: row.legal_name, tax_id: row.tax_id }]));
}

// --- Lecturas ---

async function getAdvanceTx(tx, id) {
  const advanceId = Number(id);
  if (!Number.isInteger(advanceId) || advanceId <= 0) throw appError(404, "ADVANCE_NOT_FOUND", "Anticipo de caja menor no encontrado");
  const row = await tx.pettyCashAdvance.findFirst({
    where: { id: advanceId },
    include: { box: true, vouchers: { orderBy: [{ date: "desc" }, { id: "desc" }], include: { lines: true } } }
  });
  if (!row) throw appError(404, "ADVANCE_NOT_FOUND", "Anticipo de caja menor no encontrado");
  const vouchers = row.vouchers || [];
  const [document, reversal, parties] = await Promise.all([
    row.accounting_document_id
      ? tx.cntCabdoc.findFirst({ where: { id: row.accounting_document_id }, include: { lines: { orderBy: { line_no: "asc" } } } })
      : null,
    row.reversal_accounting_document_id
      ? tx.cntCabdoc.findFirst({ where: { id: row.reversal_accounting_document_id }, include: { lines: { orderBy: { line_no: "asc" } } } })
      : null,
    partySummaryMap(tx, [row.custodian_party_id, ...vouchers.flatMap((voucher) => (voucher.lines || []).map((line) => line.supplier_party_id))])
  ]);
  return {
    ...advanceDto(row, { box: row.box, vouchers_count: vouchers.length }),
    custodian: parties.get(Number(row.custodian_party_id)) || null,
    vouchers: vouchers.map((voucher) => voucherDto(voucher, { box: row.box, parties })),
    accounting_document: accountingDocumentDto(document),
    reversal_accounting_document: accountingDocumentDto(reversal)
  };
}

async function getVoucherTx(tx, id) {
  const voucherId = Number(id);
  if (!Number.isInteger(voucherId) || voucherId <= 0) throw appError(404, "VOUCHER_NOT_FOUND", "Comprobante de caja menor no encontrado");
  const row = await tx.pettyCashVoucher.findFirst({
    where: { id: voucherId },
    include: { box: true, advance: true, lines: { orderBy: { line_number: "asc" } } }
  });
  if (!row) throw appError(404, "VOUCHER_NOT_FOUND", "Comprobante de caja menor no encontrado");
  const [document, reversal, parties] = await Promise.all([
    row.accounting_document_id
      ? tx.cntCabdoc.findFirst({ where: { id: row.accounting_document_id }, include: { lines: { orderBy: { line_no: "asc" } } } })
      : null,
    row.reversal_accounting_document_id
      ? tx.cntCabdoc.findFirst({ where: { id: row.reversal_accounting_document_id }, include: { lines: { orderBy: { line_no: "asc" } } } })
      : null,
    partySummaryMap(tx, (row.lines || []).map((line) => line.supplier_party_id))
  ]);
  return {
    ...voucherDto(row, { parties }),
    accounting_document: accountingDocumentDto(document),
    reversal_accounting_document: accountingDocumentDto(reversal)
  };
}

async function listAdvances(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const where = {
      ...(query.box_id ? { box_id: Number(query.box_id) } : {}),
      ...(query.status ? { status: normalizeText(query.status) } : {}),
      ...dateRange(query, "date")
    };
    const rows = await prisma.pettyCashAdvance.findMany({
      where,
      include: { box: true },
      _count: { select: { vouchers: true } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      ...pageParams(query)
    });
    return rows.map((row) => advanceDto(row, { box: row.box, vouchers_count: row._count?.vouchers ?? 0 }));
  });
}

async function listVouchers(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const conceptCode = upperCode(query.concept_code);
    const where = {
      ...(query.box_id ? { box_id: Number(query.box_id) } : {}),
      ...(query.advance_id ? { advance_id: Number(query.advance_id) } : {}),
      ...(query.status ? { status: normalizeText(query.status) } : {}),
      ...(query.period ? { period: normalizeText(query.period) } : {}),
      ...(conceptCode ? { lines: { some: { concept_code: conceptCode } } } : {}),
      ...dateRange(query, "date")
    };
    const rows = await prisma.pettyCashVoucher.findMany({
      where,
      include: { box: true, advance: true },
      _count: { select: { lines: true } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      ...pageParams(query)
    });
    return rows.map((row) => voucherDto(row));
  });
}

async function getAdvance(tenantId, id) { return prisma.runWithTenant(tenantId, () => getAdvanceTx(prisma, id)); }
async function getVoucher(tenantId, id) { return prisma.runWithTenant(tenantId, () => getVoucherTx(prisma, id)); }

// --- Anticipos ---

async function createAdvance(tenantId, userId, data = {}) {
  const postingDate = parseDocumentDate(data.date, "ADVANCE_DATE_INVALID", "del anticipo");
  const amount = assertPositiveAmount(data.amount, "ADVANCE_AMOUNT_INVALID", "El valor del anticipo debe ser mayor a cero");
  await accounting.assertPeriodOpen(tenantId, postingDate);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const box = await findBox(tx, data.box_id);
    if (box.active === false) throw appError(409, "BOX_INACTIVE", `La caja menor ${box.code} esta inactiva`);
    const cashAccount = await resolveBoxAccount(tx, box.account_code);
    const advanceAccount = await resolveBoxAdvanceAccount(tx, box.advance_account_code);
    const requestedCustodian = data.custodian_party_id === undefined || data.custodian_party_id === null
      ? box.custodian_party_id
      : data.custodian_party_id;
    const custodian = await resolveCustodian(tx, requestedCustodian);
    // Reutiliza la puerta de T2: sin custodio real y sin las dos cuentas validas no hay anticipo,
    // porque todo asiento exige tercero (Number(undefined) -> NaN -> REQUIRED_DOCUMENT_LINE).
    assertBoxReadyForAdvances({ ...box, account_id: box.account_id ?? cashAccount.id }, { custodian, advanceAccount });

    // El candado va ANTES de la lectura: block_unliquidated_advance se evalua sobre estado fresco
    // y serializado, no sobre el box cacheado que se leyo arriba.
    await lockBox(tx, tenantId, box.id);
    if (box.block_unliquidated_advance === true) {
      const open = await tx.pettyCashAdvance.findFirst({
        where: { box_id: box.id, status: ADVANCE_STATUS_OPEN },
        orderBy: [{ date: "desc" }, { id: "desc" }]
      });
      if (open) {
        throw appError(409, "ADVANCE_ALREADY_OPEN", `La caja ${box.code} ya tiene el anticipo ${open.full_number} sin liquidar (saldo ${money(open.balance)}); liquidelo o anulelo antes de girar uno nuevo`);
      }
    }

    const period = accounting.periodFromDate(postingDate);
    if (box.monthly_limit !== null && box.monthly_limit !== undefined) {
      const limit = money(box.monthly_limit);
      const bounds = monthBoundsUtc(period);
      const aggregated = await tx.pettyCashAdvance.aggregate({
        where: { box_id: box.id, status: { not: ADVANCE_STATUS_CANCELLED }, date: { gte: bounds.start, lte: bounds.end } },
        _sum: { amount: true }
      });
      const used = money(aggregated?._sum?.amount);
      if (round(used + amount) > round(limit) + BALANCE_TOLERANCE) {
        throw appError(422, "ADVANCE_EXCEEDS_MONTHLY_LIMIT", `El anticipo de ${amount} supera el limite mensual de ${limit} de la caja ${box.code}: en ${period} ya se giraron ${used} y quedan disponibles ${round(Math.max(limit - used, 0))}`);
      }
    }

    const context = await organizationContext(tenantId, box);
    const custodianName = custodianDisplayName(custodian);
    const document = await createAccountingDocumentTx(tx, {
      tenantId,
      userId,
      documentType: ADVANCE_DOCUMENT_TYPE,
      postingDate,
      societyCode: context.societyCode,
      header: (fullNumber) => `${ADVANCE_DOCUMENT_TYPE} ${fullNumber} - Anticipo caja menor ${box.name}`,
      lines: [
        // Debito: anticipo al custodio (activo 13xx). Credito: salida de efectivo de la caja (11xx).
        documentLine({
          account: advanceAccount, movement: "debit", amount, party: custodian,
          description: `Anticipo de caja menor ${box.code} a ${custodianName}`,
          branchCode: context.branchCode, costCenterCode: context.costCenterCode, ref: { kind: "advance" }
        }),
        documentLine({
          account: cashAccount, movement: "credit", amount, party: custodian,
          description: `Giro de anticipo caja menor ${box.code}`,
          branchCode: context.branchCode, costCenterCode: context.costCenterCode, ref: { kind: "cash" }
        })
      ]
    });
    const advance = await tx.pettyCashAdvance.create({
      data: {
        box_id: box.id,
        document_type: ADVANCE_DOCUMENT_TYPE,
        number: document.document_number,
        full_number: document.full_number,
        date: postingDate,
        custodian_party_id: custodian.id,
        custodian_name: custodianName,
        amount,
        applied_total: 0,
        balance: amount,
        status: ADVANCE_STATUS_OPEN,
        description: nullableText(data.description),
        accounting_document_id: document.cabdoc.id,
        created_by: userId || null
      }
    });
    await persistDocumentNumber(tx, document.reserved);
    return getAdvanceTx(tx, advance.id);
  }, TX_OPTIONS));
}

async function liquidateAdvance(tenantId, userId, id, data = {}) {
  const advanceId = Number(id);
  if (!Number.isInteger(advanceId) || advanceId <= 0) throw appError(404, "ADVANCE_NOT_FOUND", "Anticipo de caja menor no encontrado");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const current = await tx.pettyCashAdvance.findFirst({ where: { id: advanceId } });
    if (!current) throw appError(404, "ADVANCE_NOT_FOUND", "Anticipo de caja menor no encontrado");
    if (current.status !== ADVANCE_STATUS_OPEN) {
      throw appError(409, "ADVANCE_NOT_OPEN", `El anticipo ${current.full_number} esta ${current.status}: solo se puede liquidar un anticipo abierto`);
    }
    await lockBox(tx, tenantId, current.box_id);
    const advance = await tx.pettyCashAdvance.findFirst({ where: { id: advanceId } });
    if (!advance || advance.status !== ADVANCE_STATUS_OPEN) {
      throw appError(409, "ADVANCE_NOT_OPEN", `El anticipo ${current.full_number} cambio de estado y ya no puede liquidarse`);
    }

    const balance = money(advance.balance);
    if (!(balance > 0)) {
      throw appError(422, "ADVANCE_FULLY_APPLIED", `El anticipo ${advance.full_number} ya fue imputado en su totalidad (saldo 0): no hay nada que liquidar`);
    }
    const refund = data.refund_amount === undefined || data.refund_amount === null || data.refund_amount === ""
      ? balance
      : round(Number(data.refund_amount));
    const shortfall = data.shortfall_amount === undefined || data.shortfall_amount === null || data.shortfall_amount === ""
      ? 0
      : round(Number(data.shortfall_amount));
    if (!Number.isFinite(refund) || refund < 0 || !Number.isFinite(shortfall) || shortfall < 0) {
      throw appError(400, "LIQUIDATION_AMOUNTS_MISMATCH", "El reintegro y el faltante deben ser numeros mayores o iguales a cero");
    }
    if (Math.abs(round(refund + shortfall) - balance) > BALANCE_TOLERANCE) {
      throw appError(400, "LIQUIDATION_AMOUNTS_MISMATCH", `El reintegro (${refund}) mas el faltante (${shortfall}) debe sumar el saldo pendiente del anticipo (${balance})`);
    }

    const postingDate = data.date ? parseDocumentDate(data.date, "LIQUIDATION_DATE_INVALID", "de la liquidacion") : new Date();
    await accounting.assertPeriodOpen(tenantId, postingDate);

    const box = await findBox(tx, advance.box_id);
    const cashAccount = await resolveBoxAccount(tx, box.account_code);
    const advanceAccount = await resolveBoxAdvanceAccount(tx, box.advance_account_code);
    const custodian = await resolveCustodian(tx, advance.custodian_party_id ?? box.custodian_party_id);
    if (!custodian) {
      throw appError(422, "PARTY_REQUIRED_FOR_POSTING", `El anticipo ${advance.full_number} y la caja ${box.code} no tienen custodio: la liquidacion exige un tercero para contabilizar`);
    }
    const context = await organizationContext(tenantId, box);

    let shortfallConcept = null;
    let shortfallAccount = null;
    if (shortfall > 0) {
      shortfallConcept = await findActiveConceptByCode(tx, data.shortfall_concept_code, "El faltante del anticipo");
      shortfallAccount = await resolveConceptAccount(tx, shortfallConcept.account_code);
    }

    const lines = [];
    if (refund > 0) {
      // Unicamente el reintegro genera movimiento de efectivo.
      lines.push(documentLine({
        account: cashAccount, movement: "debit", amount: refund, party: custodian,
        description: `Reintegro de sobrante del anticipo ${advance.full_number} a la caja ${box.code}`,
        branchCode: context.branchCode, costCenterCode: context.costCenterCode, ref: { kind: "refund" }
      }));
    }
    if (shortfall > 0) {
      lines.push(documentLine({
        account: shortfallAccount, movement: "debit", amount: shortfall, party: custodian,
        description: `Faltante del anticipo ${advance.full_number} - ${shortfallConcept.name}`,
        branchCode: context.branchCode, costCenterCode: context.costCenterCode, ref: { kind: "shortfall", concept_code: shortfallConcept.code }
      }));
    }
    lines.push(documentLine({
      account: advanceAccount, movement: "credit", amount: balance, party: custodian,
      description: `Liquidacion del anticipo ${advance.full_number}`,
      branchCode: context.branchCode, costCenterCode: context.costCenterCode, ref: { kind: "advance" }
    }));

    const document = await createAccountingDocumentTx(tx, {
      tenantId,
      userId,
      documentType: LIQUIDATION_DOCUMENT_TYPE,
      postingDate,
      societyCode: context.societyCode,
      header: (fullNumber) => `${LIQUIDATION_DOCUMENT_TYPE} ${fullNumber} - Liquidacion anticipo ${advance.full_number}`,
      lines
    });
    const updated = await tx.pettyCashAdvance.updateMany({
      where: { id: advance.id, status: ADVANCE_STATUS_OPEN },
      data: {
        status: ADVANCE_STATUS_LIQUIDATED,
        liquidated_at: postingDate,
        refund_amount: refund,
        shortfall_amount: shortfall
      }
    });
    if (updated.count !== 1) throw appError(409, "ADVANCE_NOT_OPEN", `El anticipo ${advance.full_number} cambio de estado durante la liquidacion`);
    await persistDocumentNumber(tx, document.reserved);
    return getAdvanceTx(tx, advance.id);
  }, TX_OPTIONS));
}

async function cancelAdvance(tenantId, userId, id) {
  const advanceId = Number(id);
  if (!Number.isInteger(advanceId) || advanceId <= 0) throw appError(404, "ADVANCE_NOT_FOUND", "Anticipo de caja menor no encontrado");
  const cancelledAt = new Date();
  await accounting.assertPeriodOpen(tenantId, cancelledAt);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const advance = await tx.pettyCashAdvance.findFirst({ where: { id: advanceId } });
    if (!advance) throw appError(404, "ADVANCE_NOT_FOUND", "Anticipo de caja menor no encontrado");
    if (advance.status !== ADVANCE_STATUS_OPEN) {
      throw appError(409, "ADVANCE_NOT_OPEN", `El anticipo ${advance.full_number} esta ${advance.status}: solo se anula un anticipo abierto`);
    }
    await lockBox(tx, tenantId, advance.box_id);
    const imputed = await tx.pettyCashVoucher.count({ where: { advance_id: advance.id, status: { not: VOUCHER_STATUS_CANCELLED } } });
    if (imputed > 0) {
      throw appError(409, "ADVANCE_HAS_VOUCHERS", `El anticipo ${advance.full_number} tiene ${imputed} comprobante(s) de gasto imputado(s): anulelos primero para poder anular el anticipo`);
    }
    const original = await tx.cntCabdoc.findFirst({
      where: { id: advance.accounting_document_id, is_cancelled: false },
      include: { lines: { orderBy: { line_no: "asc" } } }
    });
    if (!original) throw appError(422, "ACCOUNTING_TRACE_NOT_FOUND", `No se encontro el asiento contable vigente del anticipo ${advance.full_number}`);
    const reversal = await createReversalDocumentTx(tx, { tenantId, userId, original, postingDate: cancelledAt, sourceNumber: advance.full_number });
    await tx.cntCabdoc.update({ where: { id: original.id }, data: { is_cancelled: true, cancelled_by: userId || null, cancelled_at: cancelledAt } });
    const updated = await tx.pettyCashAdvance.updateMany({
      where: { id: advance.id, status: ADVANCE_STATUS_OPEN },
      data: { status: ADVANCE_STATUS_CANCELLED, reversal_accounting_document_id: reversal.cabdoc.id }
    });
    if (updated.count !== 1) throw appError(409, "ADVANCE_NOT_OPEN", `El anticipo ${advance.full_number} cambio de estado durante la anulacion`);
    await persistDocumentNumber(tx, reversal.reserved);
    return getAdvanceTx(tx, advance.id);
  }, TX_OPTIONS));
}

// --- Comprobantes de gasto ---

async function createVoucher(tenantId, userId, data = {}) {
  const rawLines = Array.isArray(data.lines) ? data.lines : [];
  if (!rawLines.length) throw appError(400, "VOUCHER_LINES_REQUIRED", "El comprobante de gasto requiere al menos una linea");
  const postingDate = parseDocumentDate(data.date, "VOUCHER_DATE_INVALID", "del comprobante");
  await accounting.assertPeriodOpen(tenantId, postingDate);
  const vatMasters = activeRows(await accounting.getVatMasters(tenantId, "purchases"));

  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const box = await findBox(tx, data.box_id);
    if (box.active === false) throw appError(409, "BOX_INACTIVE", `La caja menor ${box.code} esta inactiva`);
    const cashAccount = await resolveBoxAccount(tx, box.account_code);
    const advanceAccount = await resolveBoxAdvanceAccount(tx, box.advance_account_code);
    const custodian = await resolveCustodian(tx, box.custodian_party_id);
    const context = await organizationContext(tenantId, box);

    const requestedAdvanceId = data.advance_id === undefined || data.advance_id === null || data.advance_id === ""
      ? null
      : Number(data.advance_id);
    if (requestedAdvanceId !== null || box.require_advance === true) await lockBox(tx, tenantId, box.id);
    let advance = null;
    if (requestedAdvanceId !== null) {
      if (!Number.isInteger(requestedAdvanceId) || requestedAdvanceId <= 0) throw appError(404, "ADVANCE_NOT_FOUND", "El anticipo seleccionado no es valido");
      advance = await tx.pettyCashAdvance.findFirst({ where: { id: requestedAdvanceId } });
      if (!advance) throw appError(404, "ADVANCE_NOT_FOUND", "El anticipo seleccionado no existe");
      if (advance.box_id !== box.id) throw appError(422, "ADVANCE_BOX_MISMATCH", `El anticipo ${advance.full_number} pertenece a otra caja menor (box_id ${advance.box_id}), no a ${box.code}`);
      if (advance.status !== ADVANCE_STATUS_OPEN) throw appError(409, "ADVANCE_NOT_OPEN", `El anticipo ${advance.full_number} esta ${advance.status}: solo se imputan gastos a anticipos abiertos`);
    } else if (box.require_advance === true) {
      throw appError(422, "ADVANCE_REQUIRED", `La caja ${box.code} exige imputar los gastos a un anticipo vigente`);
    }

    const prepared = [];
    let subtotal = 0;
    let vatTotal = 0;
    for (const [index, raw] of rawLines.entries()) {
      const position = index + 1;
      const concept = await resolveLineConcept(tx, raw, position);
      const account = await resolveConceptAccount(tx, concept.account_code);
      const description = normalizeText(raw?.description);
      if (!description) throw appError(400, "LINE_DESCRIPTION_REQUIRED", `La linea ${position} requiere una descripcion del gasto`);
      const baseAmount = assertPositiveAmount(raw?.base_amount, "LINE_AMOUNT_INVALID", `El valor base de la linea ${position} debe ser mayor a cero`);
      const supplier = await resolveSupplier(tx, raw?.supplier_party_id);
      if (concept.requires_supplier === true && !supplier) {
        throw appError(400, "SUPPLIER_REQUIRED", `El concepto ${concept.code} (${concept.name}) exige registrar el proveedor del gasto en la linea ${position}`);
      }
      const invoiceReference = nullableText(raw?.invoice_reference);
      if (concept.requires_invoice_reference === true && !invoiceReference) {
        throw appError(400, "INVOICE_REFERENCE_REQUIRED", `El concepto ${concept.code} (${concept.name}) exige la referencia de la factura o soporte en la linea ${position}`);
      }
      const organization = resolveLineOrganization(context, raw || {});
      // IVA por linea: null/ausente = gasto sin IVA. default_vat_code del concepto es solo una
      // sugerencia para la UI y NO se aplica automaticamente (la ausencia significa sin IVA).
      // vat_amount/total enviados por el cliente se IGNORAN y se recalculan aqui: nunca se
      // confia en importes que vienen del navegador.
      const vatCode = assertVatMaster(vatMasters, raw?.vat_code);
      const vatMaster = vatCode ? vatMasters.find((row) => upperCode(row.code) === vatCode) : null;
      const vatPercent = vatMaster ? Number(vatMaster.percent) : 0;
      const vatAmount = vatMaster ? round(baseAmount * (vatPercent / 100)) : 0;
      let vatAccount = null;
      if (vatAmount > 0) {
        const vatAccountCode = trimCode(vatMaster.account_code);
        vatAccount = await findAccountByCode(tx, vatAccountCode);
        if (!vatAccount || vatAccount.active === false || vatAccount.allows_tx !== true) {
          throw appError(404, "VAT_ACCOUNT_NOT_FOUND", `La cuenta de IVA ${vatAccountCode} no existe, esta inactiva o no permite movimientos`);
        }
      }
      const party = supplier || custodian;
      if (!party) {
        throw appError(422, "PARTY_REQUIRED_FOR_POSTING", `La linea ${position} no registra proveedor y la caja ${box.code} no tiene custodio: todo asiento contable exige un tercero`);
      }
      subtotal = round(subtotal + baseAmount);
      vatTotal = round(vatTotal + vatAmount);
      prepared.push({
        position, concept, account, description,
        base_amount: baseAmount,
        vat_code: vatCode,
        vat_percent: vatPercent,
        vat_amount: vatAmount,
        vat_account: vatAccount,
        vat_account_code: vatAccount ? vatAccount.code : null,
        vat_master: vatMaster,
        total: round(baseAmount + vatAmount),
        organization, supplier, party,
        invoice_reference: invoiceReference,
        advance_applied: 0,
        cash_applied: 0
      });
    }
    const total = round(subtotal + vatTotal);

    // Imputacion al anticipo, linea a linea.
    //   require_advance = true  -> el anticipo DEBE cubrir el comprobante (422 si no alcanza).
    //   require_advance = false -> el anticipo es opcional y lo que no cubra se acredita directo
    //                              contra la caja: el credito se parte en dos lineas del documento.
    let advanceAppliedTotal = 0;
    if (advance) {
      const available = money(advance.balance);
      if (box.require_advance === true && total > round(available) + BALANCE_TOLERANCE) {
        throw appError(422, "ADVANCE_INSUFFICIENT_BALANCE", `El anticipo ${advance.full_number} tiene un saldo disponible de ${available} y el comprobante suma ${total}`);
      }
      let remaining = available;
      for (const line of prepared) {
        const applied = round(Math.min(line.total, Math.max(remaining, 0)));
        line.advance_applied = applied;
        line.cash_applied = round(line.total - applied);
        remaining = round(remaining - applied);
      }
      advanceAppliedTotal = round(prepared.reduce((sum, line) => sum + line.advance_applied, 0));
    } else {
      for (const line of prepared) {
        line.advance_applied = 0;
        line.cash_applied = line.total;
      }
    }
    const cashAppliedTotal = round(total - advanceAppliedTotal);

    if (advance && advanceAppliedTotal > 0) {
      // Update optimista sobre el saldo leido bajo el candado: si otro comprobante lo movio, la
      // transaccion completa se revierte (no queda documento sin descuento ni descuento sin documento).
      const updated = await tx.pettyCashAdvance.updateMany({
        where: { id: advance.id, status: ADVANCE_STATUS_OPEN, balance: advance.balance },
        data: { balance: { decrement: advanceAppliedTotal }, applied_total: { increment: advanceAppliedTotal } }
      });
      if (updated.count !== 1) {
        throw appError(409, "ADVANCE_BALANCE_CHANGED", `El saldo del anticipo ${advance.full_number} cambio mientras se grababa el comprobante`);
      }
    }

    // Tercero del anticipo: puede diferir del custodio actual de la caja si la caja cambio de
    // custodio despues del giro. El credito contra el anticipo va contra el tercero del anticipo.
    let advanceParty = custodian;
    if (advance && advance.custodian_party_id && advance.custodian_party_id !== custodian?.id) {
      advanceParty = (await tx.party.findFirst({ where: { id: advance.custodian_party_id } })) || custodian;
    }
    const creditParty = advanceAppliedTotal > 0 ? (advanceParty || prepared[0].party) : (custodian || prepared[0].party);

    const documentLines = [];
    for (const line of prepared) {
      const tax = line.vat_amount > 0
        ? { tax_type: "iva", tax_code: line.vat_code, tax_base: line.base_amount, tax_rate: line.vat_percent, tax_amount: line.vat_amount }
        : null;
      documentLines.push(documentLine({
        account: line.account, movement: "debit", amount: line.base_amount, party: line.party,
        description: line.description, branchCode: line.organization.branch_code,
        costCenterCode: line.organization.cost_center_code, tax, ref: { kind: "base", position: line.position }
      }));
      if (line.vat_amount > 0) {
        documentLines.push(documentLine({
          account: line.vat_account, movement: "debit", amount: line.vat_amount, party: line.party,
          description: `IVA ${line.vat_percent}% ${normalizeText(line.vat_master?.concept) || "compras"} - ${line.description}`,
          branchCode: line.organization.branch_code, costCenterCode: line.organization.cost_center_code,
          tax, ref: { kind: "vat", position: line.position }
        }));
      }
    }
    if (advanceAppliedTotal > 0) {
      documentLines.push(documentLine({
        account: advanceAccount, movement: "credit", amount: advanceAppliedTotal, party: creditParty,
        description: `Gastos imputados al anticipo ${advance.full_number}`,
        branchCode: context.branchCode, costCenterCode: context.costCenterCode, ref: { kind: "advance_credit" }
      }));
    }
    if (cashAppliedTotal > 0) {
      documentLines.push(documentLine({
        account: cashAccount, movement: "credit", amount: cashAppliedTotal, party: creditParty,
        description: advanceAppliedTotal > 0
          ? `Excedente de gasto pagado con la caja ${box.code}`
          : `Gasto menor pagado con la caja ${box.code}`,
        branchCode: context.branchCode, costCenterCode: context.costCenterCode, ref: { kind: "cash_credit" }
      }));
    }

    const document = await createAccountingDocumentTx(tx, {
      tenantId,
      userId,
      documentType: VOUCHER_DOCUMENT_TYPE,
      postingDate,
      societyCode: context.societyCode,
      header: (fullNumber) => `${VOUCHER_DOCUMENT_TYPE} ${fullNumber} - Gasto menor caja ${box.name}`,
      lines: documentLines
    });
    const voucher = await tx.pettyCashVoucher.create({
      data: {
        box_id: box.id,
        advance_id: advance ? advance.id : null,
        document_type: VOUCHER_DOCUMENT_TYPE,
        number: document.document_number,
        full_number: document.full_number,
        date: postingDate,
        posting_date: postingDate,
        period: accounting.periodFromDate(postingDate),
        description: nullableText(data.description),
        status: VOUCHER_STATUS_POSTED,
        subtotal,
        vat_total: vatTotal,
        total,
        accounting_document_id: document.cabdoc.id,
        created_by: userId || null
      }
    });
    const ledgerByPosition = new Map(document.lines
      .filter((line) => line.ref?.kind === "base")
      .map((line) => [line.ref.position, line.ledger_entry_id]));
    await tx.pettyCashVoucherLine.createMany({
      data: prepared.map((line) => ({
        voucher_id: voucher.id,
        line_number: line.position,
        concept_id: line.concept.id,
        concept_code: line.concept.code,
        account_code: line.account.code,
        description: line.description,
        cost_center_code: line.organization.cost_center_code,
        branch_code: line.organization.branch_code,
        supplier_party_id: line.supplier ? line.supplier.id : null,
        invoice_reference: line.invoice_reference,
        base_amount: line.base_amount,
        vat_code: line.vat_code,
        vat_percent: line.vat_percent,
        vat_amount: line.vat_amount,
        vat_account_code: line.vat_account_code,
        total: line.total,
        advance_applied: line.advance_applied,
        ledger_entry_id: ledgerByPosition.get(line.position) ?? null
      }))
    });
    await persistDocumentNumber(tx, document.reserved);
    return getVoucherTx(tx, voucher.id);
  }, TX_OPTIONS));
}

async function cancelVoucher(tenantId, userId, id) {
  const voucherId = Number(id);
  if (!Number.isInteger(voucherId) || voucherId <= 0) throw appError(404, "VOUCHER_NOT_FOUND", "Comprobante de caja menor no encontrado");
  const cancelledAt = new Date();
  await accounting.assertPeriodOpen(tenantId, cancelledAt);
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const voucher = await tx.pettyCashVoucher.findFirst({
      where: { id: voucherId },
      include: { lines: { orderBy: { line_number: "asc" } } }
    });
    if (!voucher) throw appError(404, "VOUCHER_NOT_FOUND", "Comprobante de caja menor no encontrado");
    if (voucher.status === VOUCHER_STATUS_CANCELLED) {
      throw appError(409, "VOUCHER_ALREADY_CANCELLED", `El comprobante ${voucher.full_number} ya esta anulado`);
    }
    let advance = null;
    if (voucher.advance_id) {
      advance = await tx.pettyCashAdvance.findFirst({ where: { id: voucher.advance_id } });
      if (!advance) throw appError(404, "ADVANCE_NOT_FOUND", `El anticipo imputado por el comprobante ${voucher.full_number} no existe`);
      if (advance.status === ADVANCE_STATUS_LIQUIDATED) {
        throw appError(409, "VOUCHER_ADVANCE_LIQUIDATED", `El anticipo ${advance.full_number} ya fue liquidado: no se puede reversar la imputacion de ${voucher.full_number}`);
      }
      if (advance.status !== ADVANCE_STATUS_OPEN) {
        throw appError(409, "ADVANCE_NOT_OPEN", `El anticipo ${advance.full_number} esta ${advance.status} y no puede recibir la reversa de la imputacion`);
      }
      await lockBox(tx, tenantId, advance.box_id);
      advance = await tx.pettyCashAdvance.findFirst({ where: { id: advance.id } });
      if (!advance || advance.status !== ADVANCE_STATUS_OPEN) {
        throw appError(409, "ADVANCE_NOT_OPEN", `El anticipo imputado por ${voucher.full_number} cambio de estado`);
      }
    }
    const original = await tx.cntCabdoc.findFirst({
      where: { id: voucher.accounting_document_id, is_cancelled: false },
      include: { lines: { orderBy: { line_no: "asc" } } }
    });
    if (!original) throw appError(422, "ACCOUNTING_TRACE_NOT_FOUND", `No se encontro el asiento contable vigente del comprobante ${voucher.full_number}`);
    const reversal = await createReversalDocumentTx(tx, { tenantId, userId, original, postingDate: cancelledAt, sourceNumber: voucher.full_number });
    const restore = money((voucher.lines || []).reduce((sum, line) => sum + Number(line.advance_applied || 0), 0));
    if (advance && restore > 0) {
      const reopened = await tx.pettyCashAdvance.updateMany({
        where: { id: advance.id, status: ADVANCE_STATUS_OPEN, applied_total: { gte: restore } },
        data: { balance: { increment: restore }, applied_total: { decrement: restore } }
      });
      if (reopened.count !== 1) throw appError(409, "ADVANCE_BALANCE_CHANGED", `No se pudo restaurar el saldo del anticipo ${advance.full_number}`);
    }
    await tx.cntCabdoc.update({ where: { id: original.id }, data: { is_cancelled: true, cancelled_by: userId || null, cancelled_at: cancelledAt } });
    const updated = await tx.pettyCashVoucher.updateMany({
      where: { id: voucher.id, status: { not: VOUCHER_STATUS_CANCELLED } },
      data: { status: VOUCHER_STATUS_CANCELLED, reversal_accounting_document_id: reversal.cabdoc.id }
    });
    if (updated.count !== 1) throw appError(409, "VOUCHER_ALREADY_CANCELLED", `El comprobante ${voucher.full_number} cambio de estado durante la anulacion`);
    await persistDocumentNumber(tx, reversal.reserved);
    return getVoucherTx(tx, voucher.id);
  }, TX_OPTIONS));
}

// === Reservado T4: reportes ===

module.exports = {
  TX_OPTIONS,
  CONCEPT_ACCOUNT_TYPE,
  BOX_ACCOUNT_TYPE,
  BOX_ACCOUNT_PREFIX,
  BOX_ADVANCE_ACCOUNT_PREFIX,
  CUSTODIAN_PARTY_ROLES,
  appError,
  round,
  upperCode,
  trimCode,
  normalizeText,
  nullableText,
  activeRows,
  assertExpenseAccount,
  assertAssetAccount,
  assertBoxAccount,
  assertBoxAdvanceAccount,
  assertConceptAdvanceAccount,
  assertVatMaster,
  assertMonthlyLimit,
  normalizeAdvancePolicy,
  assertBoxOrganizationReferences,
  custodianPartyWhere,
  custodianDisplayName,
  boxReadiness,
  assertBoxReadyForAdvances,
  conceptDto,
  boxDto,
  findAccountByCode,
  resolveConceptAccount,
  resolveBoxAccount,
  resolveBoxAdvanceAccount,
  resolveConceptAdvanceAccount,
  resolveCustodian,
  enrichBoxes,
  includesInactive,
  findConcept,
  findBox,
  listConcepts,
  getConcept,
  saveConcept,
  createConcept,
  updateConcept,
  setConceptActive,
  listBoxes,
  getBox,
  saveBox,
  createBox,
  updateBox,
  setBoxActive,

  // --- T3: anticipos, comprobantes de gasto y contabilizacion inmediata ---
  ADVANCE_DOCUMENT_TYPE,
  VOUCHER_DOCUMENT_TYPE,
  LIQUIDATION_DOCUMENT_TYPE,
  ADVANCE_STATUS_OPEN,
  ADVANCE_STATUS_LIQUIDATED,
  ADVANCE_STATUS_CANCELLED,
  VOUCHER_STATUS_POSTED,
  VOUCHER_STATUS_CANCELLED,
  DEFAULT_SOCIETY_CODE,
  BALANCE_TOLERANCE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  DATE_ONLY_PATTERN,
  money,
  parseDocumentDate,
  monthBoundsUtc,
  assertPositiveAmount,
  pageParams,
  dateRange,
  reserveDocumentNumber,
  persistDocumentNumber,
  lockBox,
  organizationContext,
  resolveLineOrganization,
  documentLine,
  assertBalancedDocument,
  createAccountingDocumentTx,
  createReversalDocumentTx,
  findActiveConceptByCode,
  resolveLineConcept,
  resolveSupplier,
  boxSummary,
  advanceSummary,
  advanceDto,
  voucherLineDto,
  voucherDto,
  accountingDocumentDto,
  partySummaryMap,
  getAdvanceTx,
  getVoucherTx,
  listAdvances,
  listVouchers,
  getAdvance,
  getVoucher,
  createAdvance,
  liquidateAdvance,
  cancelAdvance,
  createVoucher,
  cancelVoucher
};
