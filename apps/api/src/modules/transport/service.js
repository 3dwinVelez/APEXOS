const prisma = require("../../core/prisma");
const { MAX_DOCUMENT_BYTES, assertSafeFile, normalizeFileName, secureStoragePath } = require("../../security/policy");

const REQUIRED_DOCUMENTS = ["soat", "revision_tecnico_mecanica"];
const EXPIRY_WARNING_DAYS = 30;
const CRITICAL_FIELDS = new Set([
  "plate",
  "owner",
  "legal_owner",
  "status",
  "base_site",
  "authorized_driver_id",
  "authorized_driver_name",
  "ownership_type",
  "soat_expires",
  "technical_review_expires"
]);

function normalizePlate(value = "") {
  return String(value).trim().replace(/\s+/g, "").toUpperCase();
}

function emptyToNull(value) {
  return value === "" || value === undefined ? null : value;
}

function dateOrNull(value) {
  return value ? new Date(value) : null;
}

function numberOrNull(value) {
  if (value === "" || value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value) {
  const date = asDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function documentStatus(expiresAt) {
  const remaining = daysUntil(expiresAt);
  if (remaining === null) return "pendiente_validacion";
  if (remaining < 0) return "vencido";
  if (remaining <= EXPIRY_WARNING_DAYS) return "proximo_a_vencer";
  return "vigente";
}

function validateVehicleInput(input, partial = false) {
  const required = ["plate", "type", "brand", "ownership_type", "base_site"];
  if (!partial) {
    for (const field of required) {
      if (!String(input[field] || "").trim()) {
        const error = new Error(`El campo ${field} es obligatorio.`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  const datePairs = [
    ["soat_issued_at", "soat_expires", "SOAT"],
    ["technical_review_issued_at", "technical_review_expires", "revision tecnico-mecanica"]
  ];
  for (const [issuedField, expiresField, label] of datePairs) {
    if (input[issuedField] && input[expiresField] && new Date(input[expiresField]) < new Date(input[issuedField])) {
      const error = new Error(`La fecha de vencimiento de ${label} no puede ser anterior a la fecha de emision.`);
      error.statusCode = 400;
      throw error;
    }
  }

  const capacity = numberOrNull(input.capacity_value);
  if (capacity !== null && capacity <= 0) {
    const error = new Error("La capacidad de carga debe ser mayor a cero.");
    error.statusCode = 400;
    throw error;
  }
}

function vehicleData(input) {
  const status = input.status || "activo";
  return {
    plate: normalizePlate(input.plate),
    model: input.model || input.line || "",
    type: input.type || "",
    category: input.category || "",
    brand: input.brand || "",
    line: input.line || input.model || "",
    year: numberOrNull(input.year),
    color: input.color || "",
    vin_chassis: emptyToNull(input.vin_chassis || input.serial_number),
    engine_displacement: input.engine_displacement || input.cylinder_capacity || "",
    cylinder_capacity: input.cylinder_capacity || input.engine_displacement || "",
    load_capacity: input.load_capacity || "",
    capacity_value: numberOrNull(input.capacity_value),
    capacity_unit: input.capacity_unit || "",
    volume_available: numberOrNull(input.volume_available),
    fuel: input.fuel || "",
    body_type: input.body_type || "",
    axle_count: numberOrNull(input.axle_count),
    mileage: Number(input.mileage || 0),
    serial_number: input.serial_number || input.vin_chassis || "",
    engine_number: input.engine_number || "",
    soat_issued_at: dateOrNull(input.soat_issued_at),
    soat_expires: dateOrNull(input.soat_expires),
    technical_review_issued_at: dateOrNull(input.technical_review_issued_at),
    technical_review_expires: dateOrNull(input.technical_review_expires),
    property_card: input.property_card || "",
    contractual_policy_expires: dateOrNull(input.contractual_policy_expires),
    extra_contractual_policy_expires: dateOrNull(input.extra_contractual_policy_expires),
    cargo_registry: input.cargo_registry || "",
    special_permits: input.special_permits || "",
    normative_restrictions: input.normative_restrictions || "",
    insurance_expires: dateOrNull(input.insurance_expires),
    owner: input.owner || input.legal_owner || "",
    ownership_type: input.ownership_type || "",
    legal_owner: input.legal_owner || input.owner || "",
    owner_document: input.owner_document || "",
    linked_company: input.linked_company || "",
    cost_center: input.cost_center || "",
    base_site: input.base_site || "",
    authorized_driver_id: numberOrNull(input.authorized_driver_id) && numberOrNull(input.authorized_driver_id) > 0 ? numberOrNull(input.authorized_driver_id) : null,
    authorized_driver_name: input.authorized_driver_name || "",
    authorized_driver_document: input.authorized_driver_document || "",
    authorized_driver_code: input.authorized_driver_code || "",
    linked_at: dateOrNull(input.linked_at),
    unlinked_at: dateOrNull(input.unlinked_at),
    legal_notes: input.legal_notes || "",
    notes: input.notes || "",
    status,
    active: !["retirado", "inactivo"].includes(status),
    deleted_at: status === "retirado" ? new Date() : null,
    metadata: input.metadata || {}
  };
}

function pickExpiry(vehicle, docs, documentType, fallbackField) {
  const doc = docs.find((item) => item.active && item.document_type === documentType);
  return doc?.expires_at || vehicle[fallbackField] || null;
}

function calculateVehicleMaster(vehicle, docs = []) {
  const activeDocs = docs.filter((doc) => doc.active);
  const mandatory = {
    soat: pickExpiry(vehicle, activeDocs, "soat", "soat_expires"),
    revision_tecnico_mecanica: pickExpiry(vehicle, activeDocs, "revision_tecnico_mecanica", "technical_review_expires")
  };
  const missing = REQUIRED_DOCUMENTS.filter((type) => !mandatory[type]);
  const expired = Object.entries(mandatory).filter(([, value]) => daysUntil(value) !== null && daysUntil(value) < 0);
  const warning = Object.entries(mandatory).filter(([, value]) => {
    const days = daysUntil(value);
    return days !== null && days >= 0 && days <= EXPIRY_WARNING_DAYS;
  });
  const criticalDates = Object.values(mandatory).filter(Boolean).map((value) => asDate(value)).filter(Boolean).sort((a, b) => a - b);

  let masterStatus = "apto_documentalmente";
  if (vehicle.status === "retirado") masterStatus = "retirado";
  else if (vehicle.status === "inactivo") masterStatus = "inactivo";
  else if (vehicle.status === "bloqueado") masterStatus = "bloqueado_documental";
  else if (expired.length) masterStatus = "bloqueado_documental";
  else if (missing.length) masterStatus = "pendiente_documentacion";
  else if (warning.length) masterStatus = "documento_proximo_a_vencer";

  const basicFields = ["plate", "type", "brand", "ownership_type", "base_site"];
  const technicalFields = ["vin_chassis", "engine_number", "fuel", "body_type", "capacity_value", "capacity_unit"];
  const basicScore = basicFields.every((field) => Boolean(vehicle[field])) ? 25 : Math.round((basicFields.filter((field) => Boolean(vehicle[field])).length / basicFields.length) * 25);
  const requiredDocsLoaded = REQUIRED_DOCUMENTS.filter((type) => activeDocs.some((doc) => doc.document_type === type) || mandatory[type]).length;
  const requiredDocsValid = REQUIRED_DOCUMENTS.filter((type) => {
    const remaining = daysUntil(mandatory[type]);
    return remaining !== null && remaining >= 0;
  }).length;
  const technicalScore = Math.round((technicalFields.filter((field) => Boolean(vehicle[field])).length / technicalFields.length) * 15);
  const attachmentsScore = activeDocs.length >= 3 ? 10 : Math.round((activeDocs.length / 3) * 10);
  const masterScore = Math.min(100, basicScore + Math.round((requiredDocsLoaded / REQUIRED_DOCUMENTS.length) * 25) + Math.round((requiredDocsValid / REQUIRED_DOCUMENTS.length) * 25) + technicalScore + attachmentsScore);

  return {
    master_status: masterStatus,
    document_status: masterStatus,
    master_score: masterScore,
    critical_expiry_at: criticalDates[0] || null,
    metrics: {
      soat_days_remaining: daysUntil(mandatory.soat),
      technical_review_days_remaining: daysUntil(mandatory.revision_tecnico_mecanica),
      expired_documents: activeDocs.filter((doc) => documentStatus(doc.expires_at) === "vencido").length + expired.length,
      expiring_documents: activeDocs.filter((doc) => documentStatus(doc.expires_at) === "proximo_a_vencer").length + warning.length,
      missing_required_documents: missing,
      score_label: masterScore >= 90 ? "ficha_confiable" : masterScore >= 70 ? "ficha_aceptable" : masterScore >= 50 ? "ficha_incompleta" : "ficha_critica"
    }
  };
}

function serializeVehicle(vehicle) {
  const master = calculateVehicleMaster(vehicle, vehicle.documents || []);
  return {
    ...vehicle,
    ...master,
    id: Number(vehicle.id),
    audit_logs: (vehicle.audit_logs || []).map((entry) => ({ ...entry, id: String(entry.id) })),
    dashboard_metrics: master.metrics
  };
}

async function refreshVehicleMaster(vehicleId) {
  const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: Number(vehicleId) }, include: { documents: true } });
  const master = calculateVehicleMaster(vehicle, vehicle.documents);
  await prisma.vehicle.update({
    where: { id: Number(vehicleId) },
    data: {
      master_status: master.master_status,
      document_status: master.document_status,
      master_score: master.master_score,
      critical_expiry_at: master.critical_expiry_at,
      metadata: { ...(vehicle.metadata || {}), dashboard_metrics: master.metrics }
    }
  });
  return serializeVehicle({ ...vehicle, ...master });
}

async function auditVehicle(user, vehicle, action, changes, reason = "") {
  const rows = changes.length ? changes : [{ field: null, old_value: null, new_value: null }];
  const toJson = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
  await prisma.vehicleMasterAuditLog.createMany({
    data: rows.map((change) => ({
      vehicle_id: vehicle.id,
      plate: vehicle.plate,
      user_id: user?.id || null,
      action,
      field: change.field,
      old_value: toJson(change.old_value),
      new_value: toJson(change.new_value),
      reason
    }))
  });
}

function criticalChanges(previous, next) {
  return Object.keys(next)
    .filter((field) => CRITICAL_FIELDS.has(field) && String(previous[field] || "") !== String(next[field] || ""))
    .map((field) => ({ field, old_value: previous[field] ?? null, new_value: next[field] ?? null }));
}

async function listVehicles(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const vehicles = await prisma.vehicle.findMany({
      where: {
        ...(query.status ? { status: query.status } : query.include_retired === "true" ? {} : { status: { not: "retirado" } }),
        ...(query.type ? { type: query.type } : {}),
        ...(query.base_site ? { base_site: query.base_site } : {}),
      ...(query.master_status ? { master_status: query.master_status } : {})
    },
      include: { documents: true, authorized_driver: { include: { user: true } } },
      orderBy: { plate: "asc" }
    });
    return vehicles.map(serializeVehicle);
  });
}

async function createVehicle(tenantId, user, input) {
  validateVehicleInput(input);
  return prisma.runWithTenant(tenantId, async () => {
    const data = vehicleData(input);
    if (data.authorized_driver_id) {
      const driver = await prisma.employee.findFirst({ where: { id: data.authorized_driver_id, active: true }, include: { user: true } });
      if (!driver) {
        const error = new Error("El conductor seleccionado no existe o esta inactivo.");
        error.statusCode = 400;
        throw error;
      }
      data.authorized_driver_name = data.authorized_driver_name || driver.metadata?.name || driver.user?.name || driver.code || "";
      data.authorized_driver_document = data.authorized_driver_document || driver.metadata?.document || "";
      data.authorized_driver_code = data.authorized_driver_code || driver.code || "";
    }
    const existingVin = data.vin_chassis ? await prisma.vehicle.findFirst({ where: { vin_chassis: data.vin_chassis } }) : null;
    if (existingVin) {
      const error = new Error("Ya existe un vehiculo con ese VIN/chasis.");
      error.statusCode = 409;
      throw error;
    }
    const vehicle = await prisma.vehicle.create({ data });
    await auditVehicle(user, vehicle, "created", [{ field: "plate", old_value: null, new_value: vehicle.plate }]);
    return refreshVehicleMaster(vehicle.id);
  });
}

async function updateVehicle(tenantId, user, id, input) {
  validateVehicleInput(input, true);
  return prisma.runWithTenant(tenantId, async () => {
    const previous = await prisma.vehicle.findFirstOrThrow({ where: { id: Number(id) } });
    const data = vehicleData({ ...previous, ...input, plate: input.plate || previous.plate });
    if (data.authorized_driver_id) {
      const driver = await prisma.employee.findFirst({ where: { id: data.authorized_driver_id, active: true }, include: { user: true } });
      if (!driver) {
        const error = new Error("El conductor seleccionado no existe o esta inactivo.");
        error.statusCode = 400;
        throw error;
      }
      data.authorized_driver_name = data.authorized_driver_name || driver.metadata?.name || driver.user?.name || driver.code || "";
      data.authorized_driver_document = data.authorized_driver_document || driver.metadata?.document || "";
      data.authorized_driver_code = data.authorized_driver_code || driver.code || "";
    }
    if (data.vin_chassis) {
      const existingVin = await prisma.vehicle.findFirst({ where: { vin_chassis: data.vin_chassis, id: { not: Number(id) } } });
      if (existingVin) {
        const error = new Error("Ya existe un vehiculo con ese VIN/chasis.");
        error.statusCode = 409;
        throw error;
      }
    }
    const updated = await prisma.vehicle.update({ where: { id: Number(id) }, data });
    await auditVehicle(user, updated, "updated", criticalChanges(previous, updated), input.reason || "");
    return refreshVehicleMaster(updated.id);
  });
}

async function getVehicle(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow({
      where: { id: Number(id) },
      include: { documents: { orderBy: { uploaded_at: "desc" } }, authorized_driver: { include: { user: true } }, audit_logs: { orderBy: { created_at: "desc" }, take: 50 } }
    });
    return serializeVehicle(vehicle);
  });
}

async function addVehicleDocument(tenantId, user, id, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: Number(id) } });
    const issuedAt = dateOrNull(input.issued_at);
    const expiresAt = dateOrNull(input.expires_at);
    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      const error = new Error("La fecha de vencimiento del documento no puede ser anterior a la emision.");
      error.statusCode = 400;
      throw error;
    }
    const documentType = String(input.document_type || "").trim();
    if (!documentType) {
      const error = new Error("El tipo documental es obligatorio.");
      error.statusCode = 400;
      throw error;
    }
    assertSafeFile(input, { maxBytes: MAX_DOCUMENT_BYTES });
    const fileName = normalizeFileName(input.file_name || input.name || `${documentType}-${vehicle.plate}`);
    const version = await prisma.vehicleDocument.count({ where: { vehicle_id: vehicle.id, document_type: documentType } }) + 1;
    const storagePath = input.storage_path || secureStoragePath({ tenantId, module: "transport", entity: "vehicle-documents", entityId: vehicle.id, fileName });
    const document = await prisma.vehicleDocument.create({
      data: {
        vehicle_id: vehicle.id,
        plate: vehicle.plate,
        document_type: documentType,
        file_name: fileName,
        file_url: input.file_url || "",
        storage_path: storagePath,
        base64_data: input.base64_data || "",
        mime_type: input.mime_type || "",
        file_size: numberOrNull(input.file_size),
        issued_at: issuedAt,
        expires_at: expiresAt,
        document_status: input.document_status || documentStatus(expiresAt),
        uploaded_by: user?.id || null,
        observations: input.observations || "",
        version,
        active: input.active !== false,
        metadata: input.metadata || {}
      }
    });
    await auditVehicle(user, vehicle, "document_uploaded", [{ field: documentType, old_value: null, new_value: { document_id: document.id, expires_at: document.expires_at } }]);
    await refreshVehicleMaster(vehicle.id);
    return document;
  });
}

async function updateVehicleDocument(tenantId, user, vehicleId, documentId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: Number(vehicleId) } });
    const previous = await prisma.vehicleDocument.findFirstOrThrow({ where: { id: Number(documentId), vehicle_id: vehicle.id } });
    const expiresAt = input.expires_at !== undefined ? dateOrNull(input.expires_at) : previous.expires_at;
    const issuedAt = input.issued_at !== undefined ? dateOrNull(input.issued_at) : previous.issued_at;
    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      const error = new Error("La fecha de vencimiento del documento no puede ser anterior a la emision.");
      error.statusCode = 400;
      throw error;
    }
    const document = await prisma.vehicleDocument.update({
      where: { id: Number(documentId) },
      data: {
        issued_at: issuedAt,
        expires_at: expiresAt,
        document_status: input.document_status || documentStatus(expiresAt),
        validated_by: input.validated_by || user?.id || previous.validated_by,
        validated_at: input.document_status ? new Date() : previous.validated_at,
        observations: input.observations ?? previous.observations,
        active: input.active ?? previous.active
      }
    });
    await auditVehicle(user, vehicle, "document_updated", [{ field: previous.document_type, old_value: previous, new_value: document }], input.reason || "");
    await refreshVehicleMaster(vehicle.id);
    return document;
  });
}

async function getPlanningVehicleStatus(tenantId, plate) {
  return prisma.runWithTenant(tenantId, async () => {
    const vehicle = await prisma.vehicle.findFirstOrThrow({
      where: { plate: normalizePlate(plate) },
      include: { documents: true }
    });
    const master = calculateVehicleMaster(vehicle, vehicle.documents);
    return {
      plate: vehicle.plate,
      can_start_route: master.master_status === "apto_documentalmente" || master.master_status === "documento_proximo_a_vencer",
      master_status: master.master_status,
      document_status: master.document_status,
      documents_expired: master.metrics.expired_documents,
      documents_expiring: master.metrics.expiring_documents,
      master_score: master.master_score,
      technical_data: {
        type: vehicle.type,
        brand: vehicle.brand,
        line: vehicle.line || vehicle.model,
        fuel: vehicle.fuel,
        capacity_value: vehicle.capacity_value,
        capacity_unit: vehicle.capacity_unit,
        load_capacity: vehicle.load_capacity,
        body_type: vehicle.body_type,
        axle_count: vehicle.axle_count
      },
      capacity: vehicle.capacity_value || vehicle.load_capacity,
      authorized_driver: {
        id: vehicle.authorized_driver_id,
        name: vehicle.authorized_driver_name,
        document: vehicle.authorized_driver_document,
        code: vehicle.authorized_driver_code
      },
      base_site: vehicle.base_site,
      restrictions: vehicle.normative_restrictions || "",
      next_critical_expiry: vehicle.critical_expiry_at || master.critical_expiry_at
    };
  });
}

async function getVehicleDashboardMetrics(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const vehicles = await prisma.vehicle.findMany({ include: { documents: true } });
    const rows = vehicles.map(serializeVehicle);
    return {
      total: rows.length,
      active: rows.filter((vehicle) => vehicle.status === "activo").length,
      blocked: rows.filter((vehicle) => vehicle.master_status === "bloqueado_documental").length,
      pending_validation: rows.filter((vehicle) => vehicle.master_status === "pendiente_documentacion").length,
      expiring: rows.filter((vehicle) => vehicle.master_status === "documento_proximo_a_vencer").length,
      reliable_records: rows.filter((vehicle) => vehicle.master_score >= 90).length,
      average_score: rows.length ? Math.round(rows.reduce((sum, vehicle) => sum + vehicle.master_score, 0) / rows.length) : 0,
      by_site: rows.reduce((acc, vehicle) => ({ ...acc, [vehicle.base_site || "Sin sede"]: (acc[vehicle.base_site || "Sin sede"] || 0) + 1 }), {}),
      by_ownership: rows.reduce((acc, vehicle) => ({ ...acc, [vehicle.ownership_type || "Sin propiedad"]: (acc[vehicle.ownership_type || "Sin propiedad"] || 0) + 1 }), {}),
      vehicles: rows.map((vehicle) => ({
        id: vehicle.id,
        plate: vehicle.plate,
        master_status: vehicle.master_status,
        master_score: vehicle.master_score,
        base_site: vehicle.base_site,
        ownership_type: vehicle.ownership_type,
        soat_days_remaining: vehicle.dashboard_metrics.soat_days_remaining,
        technical_review_days_remaining: vehicle.dashboard_metrics.technical_review_days_remaining,
        expired_documents: vehicle.dashboard_metrics.expired_documents,
        expiring_documents: vehicle.dashboard_metrics.expiring_documents,
        score_label: vehicle.dashboard_metrics.score_label
      }))
    };
  });
}

module.exports = {
  listVehicles,
  createVehicle,
  updateVehicle,
  getVehicle,
  addVehicleDocument,
  updateVehicleDocument,
  getPlanningVehicleStatus,
  getVehicleDashboardMetrics
};
