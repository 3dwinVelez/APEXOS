const crypto = require("node:crypto");
const { posix } = require("node:path");
const { inflateRawSync } = require("node:zlib");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const db = require("../../core/prisma");
const service = require("./settlement-service");
const E = require("./settlement-engine");
const { partyRoleWhere } = require("../parties/roles");
const { planVehicleCenter } = require("./vehicle-accounting");
const { roleScopeViolation, isAdministrativeRole } = require("../../middleware/rbac");
const format = require("./settlement-import-format.json");
const MAX_FILE_BYTES = 2 * 1024 * 1024;
function assertResourceScope(user, vehicle, center) {
  if (isAdministrativeRole(user?.role)) return;
  if (roleScopeViolation(user?.role || {}, { body: { base_site: vehicle.base_site, cost_center_code: center.code } })) fail("TMS_IMPORT_ROLE_SCOPE", "El vehículo o centro de costos está fuera del alcance de su rol.", 403);
}
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const contentHash = rows => hash(rows.map(({ row, ...values }) => values).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
function fail(code, message, statusCode = 422) { throw Object.assign(new Error(message), { code, statusCode }); }

// Check the ZIP central directory before ExcelJS decompresses untrusted input.
function checkWorkbookArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > MAX_FILE_BYTES || buffer.readUInt32LE(0) !== 0x04034b50) fail("TMS_IMPORT_FILE", "Seleccione una plantilla .xlsx de máximo 2 MB.");
  let end = buffer.length - 22;
  while (end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50 || end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length) fail("TMS_IMPORT_ZIP", "El archivo Excel está dañado.");
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16), inflated = 0;
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || count > 200 || cursor >= end) fail("TMS_IMPORT_ZIP", "La estructura del archivo Excel no es válida.");
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) fail("TMS_IMPORT_ZIP", "El archivo Excel está dañado.");
    const size = buffer.readUInt32LE(cursor + 24);
    const compressedSize = buffer.readUInt32LE(cursor + 20), local = buffer.readUInt32LE(cursor + 42), method = buffer.readUInt16LE(cursor + 10);
    const length = buffer.readUInt16LE(cursor + 28), extra = buffer.readUInt16LE(cursor + 30), comment = buffer.readUInt16LE(cursor + 32);
    if (cursor + 46 + length + extra + comment > end) fail("TMS_IMPORT_ZIP", "El archivo Excel está dañado.");
    const name = buffer.subarray(cursor + 46, cursor + 46 + length).toString("utf8");
    inflated += size;
    if ((buffer.readUInt16LE(cursor + 8) & 1) || size > 8 * 1024 * 1024 || inflated > 20 * 1024 * 1024 || /vbaProject|externalLinks|embeddings|\.\.\//i.test(name)) fail("TMS_IMPORT_ARCHIVE_LIMIT", "La plantilla contiene elementos no admitidos o supera el límite de lectura.");
    if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50 || ![0, 8].includes(method)) fail("TMS_IMPORT_ZIP", "Compresión Excel no admitida.");
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (start + compressedSize > buffer.length) fail("TMS_IMPORT_ZIP", "El archivo Excel está dañado.");
    try {
      const content = method === 8 ? inflateRawSync(buffer.subarray(start, start + compressedSize), { maxOutputLength: 8 * 1024 * 1024 }) : buffer.subarray(start, start + compressedSize);
      if (content.length !== size) fail("TMS_IMPORT_ZIP", "El tamaño de una parte Excel no es válido.");
    } catch { fail("TMS_IMPORT_ZIP", "Una parte Excel está dañada o supera los límites de lectura."); }
    cursor += 46 + length + extra + comment;
  }
}

function cellValue(cell) {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") fail("TMS_IMPORT_CELL", "Use valores simples; no se admiten fórmulas, errores ni vínculos en las celdas.");
  if (!["string", "number"].includes(typeof value)) fail("TMS_IMPORT_CELL", "El tipo de dato de la celda no está permitido.");
  const text = String(value).trim();
  if (text.length > 2000 || /^[=+@]/.test(text)) fail("TMS_IMPORT_CELL", "La celda contiene un valor demasiado largo o no admitido.");
  return text;
}

async function parseWorkbook(buffer) {
  checkWorkbookArchive(buffer);
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(await compatibleWorkbook(buffer)); } catch { fail("TMS_IMPORT_XLSX", "No se pudo leer la plantilla Excel."); }
  const sheet = book.getWorksheet(format.sheet);
  if (!sheet || sheet.rowCount > format.max_rows + 1 || sheet.columnCount > format.columns.length) fail("TMS_IMPORT_SHEET", `Use la hoja ${format.sheet}, con máximo ${format.max_rows} filas y sus columnas originales.`);
  if (format.columns.some((name, index) => cellValue(sheet.getRow(1).getCell(index + 1)) !== name)) fail("TMS_IMPORT_HEADERS", "Los encabezados no coinciden con la plantilla. Descargue la versión actual.");
  const rows = [], errors = [];
  for (let number = 2; number <= sheet.rowCount; number++) {
    try {
      const values = format.columns.map((_, index) => cellValue(sheet.getRow(number).getCell(index + 1)));
      if (values.every(value => !value)) continue;
      const row = Object.fromEntries(format.columns.map((name, index) => [name, values[index]]));
      for (const name of format.columns.filter(name => name !== "observacion")) if (!row[name]) fail("TMS_IMPORT_REQUIRED", `Complete ${name}.`);
      for (const name of ["paquete", "documento"]) if (!/^[\p{L}\p{N}_.\/-]{1,80}$/u.test(row[name])) fail("TMS_IMPORT_REFERENCE", `${name} admite hasta 80 letras, números, guiones, puntos o barras, sin espacios.`);
      if (row.soporte.length > 1000 || row.observacion.length > 2000) fail("TMS_IMPORT_TEXT", "El soporte admite 1000 caracteres y la observación 2000.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha_servicio) || !Number.isFinite(Date.parse(row.fecha_servicio)) || new Date(row.fecha_servicio).toISOString().slice(0, 10) !== row.fecha_servicio) fail("TMS_IMPORT_DATE", "fecha_servicio debe ser una fecha válida (AAAA-MM-DD).");
      row.tarifa_version = Number(row.tarifa_version); row.cantidad_servicios = Number(row.cantidad_servicios);
      if (!Number.isSafeInteger(row.tarifa_version) || row.tarifa_version < 1 || !Number.isFinite(row.cantidad_servicios) || row.cantidad_servicios <= 0 || row.cantidad_servicios > 1e6) fail("TMS_IMPORT_NUMBER", "Indique versión entera positiva y cantidad de servicios mayor a cero.");
      row.placa = row.placa.toUpperCase(); row.centro_costos = row.centro_costos.toUpperCase();
      rows.push({ ...row, row: number });
    } catch (error) { errors.push({ row: number, code: error.code || "TMS_IMPORT_ROW", message: error.message }); }
  }
  if (!rows.length && !errors.length) fail("TMS_IMPORT_EMPTY", "La plantilla no contiene liquidaciones.");
  if (new Set(rows.map(row => row.paquete)).size > format.max_packages) fail("TMS_IMPORT_PACKAGE_LIMIT", `Cargue máximo ${format.max_packages} paquetes por archivo.`);
  return { rows, errors };
}

// ExcelJS only recognizes unprefixed spreadsheet element names; both namespace
// spellings are valid OOXML. Normalize the XML vocabulary, never the cell data.
async function compatibleWorkbook(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;
  for (const name of Object.keys(zip.files).filter(name => (name.startsWith("xl/") && name.endsWith(".xml")) || name.endsWith(".rels"))) {
    let xml = await zip.file(name).async("string");
    if (name.endsWith(".rels")) {
      const folder = posix.dirname(posix.dirname(name));
      const relative = xml.replace(/Target=(["'])\/([^"']+)\1/g, (_, quote, target) => `Target=${quote}${posix.relative(folder, target)}${quote}`);
      if (relative !== xml) { zip.file(name, relative); changed = true; }
      continue;
    }
    const match = xml.match(/xmlns:([A-Za-z_][\w.-]*)=["']http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main["']/);
    if (!match) continue;
    const prefix = match[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    xml = xml.replace(match[0], 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"').replace(new RegExp(`(<\\/?)${prefix}:`, "g"), "$1");
    zip.file(name, xml); changed = true;
  }
  return changed ? zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) : buffer;
}

async function loadCatalogs(tx, tenantId) {
  const [vehicles, customers, destinations, rates, tenant] = await Promise.all([
    tx.vehicle.findMany({ where: { tenant_id: String(tenantId), active: true, status: { notIn: ["retirado", "inactivo", "bloqueado"] } } }),
    tx.party.findMany({ where: { tenant_id: String(tenantId), active: true, ...partyRoleWhere("customer") }, select: { id: true, tax_id: true, name: true } }),
    tx.transportDeliveryPoint.findMany({ where: { tenant_id: String(tenantId), active: true } }),
    tx.transportRateCard.findMany({ where: { tenant_id: String(tenantId), status: "activa" } }),
    tx.tenant.findUnique({ where: { id: String(tenantId) }, select: { config: true } })
  ]);
  return { vehicles, customers, destinations, rates, tree: tenant?.config?.accounting?.organization_tree || { societies: [], branches: [], cost_centers: [] } };
}

async function catalogs(tenantId, user) {
  return db.runWithTenant(tenantId, async () => {
    const data = await loadCatalogs(db, tenantId);
    return { vehicles: data.vehicles.flatMap(vehicle => { try { const center = planVehicleCenter(data.tree, vehicle, vehicle); assertResourceScope(user, vehicle, center); return [{ plate: vehicle.plate, center }]; } catch (error) { return error.code === "TMS_IMPORT_ROLE_SCOPE" ? [] : [{ plate: vehicle.plate, error: error.message }]; } }), customers: data.customers, destinations: data.destinations.map(row => ({ code: row.code, name: row.name, customer_id: row.customer_party_id })), rates: data.rates.map(row => ({ code: row.code, name: row.name, version: row.version, currency: row.currency, vehicle_id: row.metadata?.vehicle_id, valid_from: row.valid_from, valid_to: row.valid_to })), limits: format };
  });
}
function unique(rows, predicate, label) { const found = rows.filter(predicate); if (found.length !== 1) fail("TMS_IMPORT_REFERENCE_INVALID", `${label}: no existe un registro activo único en esta empresa.`); return found[0]; }

async function prepare(tx, tenantId, user, parsed) {
  const data = await loadCatalogs(tx, tenantId);
  const errors = [...parsed.errors], groups = new Map(), guides = new Set();
  for (const row of parsed.rows) {
    try {
      const vehicle = unique(data.vehicles, item => item.plate.toUpperCase() === row.placa, "Placa");
      const center = planVehicleCenter(data.tree, vehicle, vehicle);
      assertResourceScope(user, vehicle, center);
      // Legacy plate centres may retain spaces; always post the authoritative code.
      if (center.code.replace(/\s+/g, "") !== row.centro_costos.replace(/\s+/g, "")) fail("TMS_IMPORT_CENTER", `El centro correcto de ${row.placa} es ${center.code}; corrija la plantilla.`);
      const customer = unique(data.customers, item => String(item.tax_id || "").trim() === row.cliente_documento, "Documento del cliente");
      const codes = row.destinos_codigos.split(";").map(value => value.trim()).filter(Boolean);
      if (!codes.length || codes.length > 100 || new Set(codes).size !== codes.length) fail("TMS_IMPORT_DESTINATIONS", "Indique códigos de destinos sin repetir, separados por punto y coma.");
      const destinations = codes.map(code => unique(data.destinations, item => item.code === code, `Destino ${code}`));
      if (destinations.some(point => point.customer_party_id && point.customer_party_id !== customer.id)) fail("TMS_IMPORT_CUSTOMER", "Los destinos no corresponden al cliente indicado.");
      const rate = unique(data.rates, item => item.code === row.tarifa_codigo && item.version === row.tarifa_version, "Tarifario y versión");
      const quote = await service.quoteSettlementCriterion(tenantId, { vehicle_id: vehicle.id, rate_card_id: rate.id, rate_version: rate.version, currency: "COP", service_date: row.fecha_servicio });
      const existing = groups.get(row.paquete);
      if (existing && (existing.vehicle_id !== vehicle.id || existing.observation !== row.observacion)) fail("TMS_IMPORT_GROUP", "Las filas de un paquete deben tener la misma placa y observación.");
      const group = existing || { reference: row.paquete, vehicle_id: vehicle.id, plate: vehicle.plate, center, observation: row.observacion, documents: new Map(), rows: [] };
      const document = group.documents.get(row.documento);
      if (document && (document.customer_id !== customer.id || document.service_date !== row.fecha_servicio || JSON.stringify(document.delivery_point_ids) !== JSON.stringify(destinations.map(point => point.id)))) fail("TMS_IMPORT_DOCUMENT", "Las filas de un documento deben conservar cliente, fecha y destinos.");
      const item = document || { guide_reference: row.documento, customer_id: customer.id, service_date: row.fecha_servicio, delivery_point_ids: destinations.map(point => point.id), charge_criteria: [] };
      if (!document && guides.has(row.documento)) fail("TMS_IMPORT_GUIDE", "La referencia del documento se repite en otro paquete del archivo.");
      if (item.charge_criteria.some(criterion => criterion.rate_card_id === rate.id)) fail("TMS_IMPORT_CRITERION_DUPLICATE", "El mismo tarifario se repite en el documento; agrupe su cantidad de servicios.");
      if (item.charge_criteria.length >= 50) fail("TMS_IMPORT_CRITERIA_LIMIT", "Máximo 50 criterios por documento.");
      item.charge_criteria.push({ concept: quote.concept, rate_card_id: rate.id, rate_version: rate.version, quantity: row.cantidad_servicios, unit_value: quote.unit_value, support: row.soporte });
      guides.add(row.documento); group.documents.set(row.documento, item); group.rows.push(row); groups.set(row.paquete, group);
    } catch (error) { if (!error.statusCode) throw error; errors.push({ row: row.row, code: error.code, message: error.message }); }
  }
  const packages = [];
  for (const group of groups.values()) {
    const groupHash = contentHash(group.rows);
    const previous = await tx.transportSettlementPackage.findFirst({ where: { tenant_id: String(tenantId), metadata: { path: ["settlement_import", "reference"], equals: group.reference } } });
    if (previous && previous.metadata.settlement_import.content_hash !== groupHash) errors.push({ row: group.rows[0].row, code: "TMS_IMPORT_REFERENCE_USED", message: `El paquete externo ${group.reference} ya fue importado con otros datos. Use su liquidación existente.` });
    if (!previous) {
      const duplicate = await tx.transportSettlementItem.findFirst({ where: { tenant_id: String(tenantId), guide_reference: { in: [...group.documents.keys()] }, package: { status: { notIn: ["cancelada", "reversada"] } } }, select: { id: true } });
      if (duplicate) errors.push({ row: group.rows[0].row, code: "TMS_IMPORT_DOCUMENT_USED", message: "Un documento ya pertenece a una liquidación vigente." });
    }
    const items = [...group.documents.values()];
    const total = E.round2(items.reduce((sum, item) => sum + E.calculateChargeCriteria(item.charge_criteria).amount, 0));
    if (total <= 0) errors.push({ row: group.rows[0].row, code: "TMS_IMPORT_ZERO_TOTAL", message: "El paquete debe tener un importe mayor a cero para contabilizar." });
    packages.push({ ...group, documents: undefined, rows: undefined, content_hash: groupHash, existing_id: previous?.id || null, items, total });
  }
  const previewHash = hash({ packages, period: service.currentAccountingMonth() });
  return { valid: !errors.length, errors, preview_hash: previewHash, packages, period: service.currentAccountingMonth() };
}

function publicPreview(prepared) { return { valid: prepared.valid, errors: prepared.errors, preview_hash: prepared.preview_hash, period: prepared.period, packages: prepared.packages.map(group => ({ reference: group.reference, plate: group.plate, center: group.center, documents: group.items.length, total: group.total, existing_id: group.existing_id })) }; }
async function replayed(tx, tenantId, user, parsed) {
  if (parsed.errors.length) return null;
  const packages = [];
  for (const reference of new Set(parsed.rows.map(row => row.paquete))) {
    const pkg = await tx.transportSettlementPackage.findFirst({ where: { tenant_id: String(tenantId), metadata: { path: ["settlement_import", "reference"], equals: reference } }, include: { items: true } });
    if (!pkg || pkg.metadata.settlement_import.content_hash !== contentHash(parsed.rows.filter(row => row.paquete === reference))) return null;
    const vehicle = await tx.vehicle.findFirst({ where: { tenant_id: String(tenantId), id: Number(pkg.metadata.vehicle_id), __includeInactive: true } });
    if (!vehicle) fail("TMS_IMPORT_PACKAGE", "El vehículo de la importación ya no está disponible.");
    assertResourceScope(user, vehicle, pkg.metadata.settlement_import.center);
    packages.push({ reference, plate: pkg.metadata.vehicle_plate, center: pkg.metadata.settlement_import.center, items: pkg.items, total: Number(pkg.adjusted_total), existing_id: pkg.id });
  }
  return { valid: true, errors: [], packages, preview_hash: hash(packages.map(pkg => pkg.existing_id)), period: service.currentAccountingMonth() };
}
async function validate(tenantId, user, buffer) {
  const parsed = await parseWorkbook(buffer);
  return db.runWithTenant(tenantId, async () => publicPreview(await replayed(db, tenantId, user, parsed) || await prepare(db, tenantId, user, parsed)));
}
async function commit(tenantId, user, buffer, previewHash) {
  const parsed = await parseWorkbook(buffer);
  return service.withSettlementTransaction(tenantId, async tx => {
    const prepared = await replayed(tx, tenantId, user, parsed) || await prepare(tx, tenantId, user, parsed);
    if (!prepared.valid) return publicPreview(prepared);
    // An exact replay remains valid even though package IDs/states changed after commit.
    if (prepared.packages.some(group => !group.existing_id) && previewHash !== prepared.preview_hash) fail("TMS_IMPORT_PREVIEW_CHANGED", "Los datos o tarifas cambiaron. Valide nuevamente la plantilla.", 409);
    const packages = [];
    for (const group of prepared.packages) {
      if (group.existing_id) { packages.push({ ...await service.getSettlementPackage(tenantId, group.existing_id), import_reference: group.reference, idempotent_replay: true }); continue; }
      let pkg = await service.createSettlementPackage(tenantId, user, { vehicle_id: group.vehicle_id, currency: "COP", observation: group.observation, items: group.items });
      await tx.transportSettlementPackage.update({ where: { id: pkg.id }, data: { metadata: { ...pkg.metadata, settlement_import: { reference: group.reference, content_hash: group.content_hash, center: group.center, imported_by: user.id } } } });
      pkg = await service.validateSettlementPackage(tenantId, user, pkg.id, { version: pkg.version });
      pkg = await service.precalculateSettlementPackage(tenantId, user, pkg.id, { version: pkg.version });
      pkg = await service.submitSettlementPackage(tenantId, user, pkg.id, { version: pkg.version });
      await tx.auditLog.create({ data: { user_id: user.id, module: "transport", action: "transport.settlement_package.imported", entity: "TransportSettlementPackage", entity_id: String(pkg.id), new_value: { reference: group.reference, content_hash: group.content_hash, center: group.center } } });
      packages.push({ ...pkg, import_reference: group.reference, idempotent_replay: false });
    }
    return { valid: true, packages, period: prepared.period };
  });
}

async function batch(tenantId, user, action, input) {
  if (!Array.isArray(input.packages) || !input.packages.length || input.packages.length > format.max_packages || new Set(input.packages.map(pkg => pkg.id)).size !== input.packages.length) fail("TMS_IMPORT_BATCH", "Seleccione paquetes sin repetir, máximo 30.", 400);
  const results = [];
  for (const requested of input.packages) {
    try {
      const current = await service.getSettlementPackage(tenantId, requested.id);
      if (!current.metadata?.settlement_import) fail("TMS_IMPORT_PACKAGE", "La operación masiva admite paquetes creados por esta importación.");
      const vehicle = await db.runWithTenant(tenantId, () => db.vehicle.findFirst({ where: { tenant_id: String(tenantId), id: Number(current.metadata.vehicle_id) } }));
      if (!vehicle) fail("TMS_IMPORT_PACKAGE", "El vehículo ya no está disponible.");
      assertResourceScope(user, vehicle, current.metadata.settlement_import.center);
      let pkg;
      if (action === "approve") pkg = ["aprobada", "contabilizada", "liquidada"].includes(current.status) ? current : await service.decideSettlementPackage(tenantId, user, current.id, { version: requested.version, decision: "aprobada", comment: input.comment || "Aprobación de carga masiva" });
      else if (action === "account") pkg = await service.accountSettlementPackage(tenantId, user, current.id, { version: requested.version, income_account_code: input.income_account_code, receivable_account_code: input.receivable_account_code, posting_date: input.posting_date, due_date: input.due_date });
      else fail("TMS_IMPORT_ACTION", "Acción no permitida.", 400);
      results.push({ id: current.id, success: true, package: pkg });
    } catch (error) { if (!error.statusCode && error.code !== "P2025") throw error; results.push({ id: requested.id, success: false, code: error.code === "P2025" ? "TMS_IMPORT_PACKAGE" : error.code, message: error.code === "P2025" ? "Paquete no disponible en esta empresa." : error.message }); }
  }
  return { results };
}
module.exports = { validate, commit, catalogs, batch, parseWorkbook, checkWorkbookArchive, compatibleWorkbook, MAX_FILE_BYTES };
