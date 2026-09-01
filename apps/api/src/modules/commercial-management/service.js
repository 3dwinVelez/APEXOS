const prisma = require("../../core/prisma");
const { budgetMetrics, isFullCalendarMonth, orderTotals, periodProgress, visitExecutionMinutes } = require("./domain");
const { LocalOrderSalesSource } = require("./salesSource");

const ADMIN_ROLES = new Set(["apex_admin", "admin", "owner", "superadmin", "administrador", "administrador de empresa"]);
const fail = (statusCode, message) => { throw Object.assign(new Error(message), { statusCode }); };
const roleName = (actor) => String(actor?.role?.name || "").trim().toLowerCase();

async function actorScope(db, tenantId, actor) {
  const role = roleName(actor);
  if (ADMIN_ROLES.has(role)) return { kind: "admin" };
  if (role.includes("supervisor") && role.includes("comercial")) {
    const advisors = await db.commercialAdvisor.findMany({ where: { tenant_id: tenantId, supervisor_user_id: actor.id, active: true }, select: { id: true } });
    return { kind: "supervisor", advisorIds: advisors.map((item) => item.id) };
  }
  const advisor = await db.commercialAdvisor.findFirst({ where: { tenant_id: tenantId, user_id: actor?.id, active: true } });
  if (!advisor) fail(403, "El usuario no esta vinculado a un asesor comercial activo.");
  return { kind: "advisor", advisorIds: [advisor.id], advisor };
}

async function accessContext(tenantId, actor) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    return {
      scope: scope.kind,
      advisor_id: scope.advisor?.id || null,
      advisor_name: scope.advisor?.name || null,
      can_manage_masters: scope.kind === "admin",
      can_manage_budgets: scope.kind === "admin",
      can_view_team: scope.kind !== "advisor"
    };
  });
}

function scopeWhere(scope) { return scope.kind === "admin" ? {} : { advisor_id: { in: scope.advisorIds } }; }
function bogotaDay(dateText) {
  const value = /^\d{4}-\d{2}-\d{2}$/.test(String(dateText || "")) ? dateText : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return { start: new Date(`${value}T00:00:00-05:00`), end: new Date(`${value}T23:59:59.999-05:00`) };
}
async function audit(db, tenantId, actor, action, entity, entityId, oldValue, newValue) {
  const json = (value) => value ? JSON.parse(JSON.stringify(value)) : undefined;
  await db.auditLog.create({ data: { tenant_id: tenantId, user_id: actor?.id || null, action, module: "commercial-management", entity, entity_id: String(entityId), old_value: json(oldValue), new_value: json(newValue) } });
}

async function settingsFor(db, tenantId) {
  return db.commercialSettings.upsert({ where: { tenant_id: tenantId }, create: { tenant_id: tenantId }, update: {} });
}
async function findAdvisorConflict(db, tenantId, advisorId, start, end, excludeId) {
  return db.commercialVisit.findFirst({ where: { tenant_id: tenantId, advisor_id: advisorId, status: { in: ["SCHEDULED", "IN_PROGRESS"] }, ...(excludeId ? { id: { not: excludeId } } : {}), visit_date: { lt: end }, scheduled_end_at: { gt: start } }, include: { customer: { select: { legal_name: true } }, advisor: { select: { name: true } } } });
}
async function assertAdvisorAvailability(db, tenantId, advisorId, start, end, excludeId) {
  const conflict = await findAdvisorConflict(db, tenantId, advisorId, start, end, excludeId);
  if (conflict) fail(409, `El asesor ya tiene la visita ${conflict.id} con ${(conflict.customer?.legal_name || "Prospeccion sin cliente")} entre ${conflict.visit_date.toISOString()} y ${conflict.scheduled_end_at.toISOString()}.`);
}
async function addVisitEvent(db, tenantId, visitId, eventType, actor, data = {}) {
  return db.commercialVisitEvent.create({ data: { tenant_id: tenantId, visit_id: visitId, event_type: eventType, event_at: data.event_at || new Date(), scheduled_for: data.scheduled_for || null, details: data.details || {}, created_by: actor?.id || null } });
}

async function getSettings(tenantId) { return prisma.runWithTenant(tenantId, () => settingsFor(prisma, tenantId)); }
async function updateSettings(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede modificar la configuracion comercial.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const current = await settingsFor(tx, tenantId); const updated = await tx.commercialSettings.update({ where: { id: current.id }, data: { ...(input.default_visit_duration_minutes !== undefined ? { default_visit_duration_minutes: input.default_visit_duration_minutes } : {}), ...(input.default_quote_validity_days !== undefined ? { default_quote_validity_days: input.default_quote_validity_days } : {}) } }); await audit(tx, tenantId, actor, "UPDATE", "CommercialSettings", current.id, current, updated); return updated; }));
}

async function listAdvisors(tenantId, actor) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    return prisma.commercialAdvisor.findMany({ where: { tenant_id: tenantId, ...(scope.kind === "admin" ? {} : { id: { in: scope.advisorIds } }) }, include: { zone_master: true }, orderBy: { name: "asc" } });
  });
}

async function createAdvisor(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede crear asesores.");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    if (input.user_id) {
      const assigned = await tx.commercialAdvisor.findFirst({ where: { tenant_id: tenantId, user_id: input.user_id }, select: { code: true, name: true } });
      if (assigned) fail(409, `El usuario APEX ${input.user_id} ya esta vinculado al asesor ${assigned.code} - ${assigned.name}. Usa otro usuario o deja el campo vacio.`);
    }
    const zone = input.zone_id ? await tx.commercialZone.findFirst({ where: { id: input.zone_id, tenant_id: tenantId, active: true } }) : null;
    if (input.zone_id && !zone) fail(400, "La zona seleccionada no existe o esta inactiva.");
    const created = await tx.commercialAdvisor.create({ data: { tenant_id: tenantId, code: input.code.trim(), name: input.name.trim(), email: input.email || null, phone: input.phone || null, zone_id: zone?.id || null, zone: zone?.name || null, user_id: input.user_id || null, supervisor_user_id: input.supervisor_user_id || null, active: input.active !== false } });
    await audit(tx, tenantId, actor, "CREATE", "CommercialAdvisor", created.id, null, created);
    return created;
  }));
}

async function updateAdvisor(tenantId, actor, id, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede editar asesores.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const current = await tx.commercialAdvisor.findFirst({ where: { id: Number(id), tenant_id: tenantId } });
    if (!current) fail(404, "Asesor no encontrado.");
    if (input.user_id && input.user_id !== current.user_id) {
      const assigned = await tx.commercialAdvisor.findFirst({ where: { tenant_id: tenantId, user_id: input.user_id, id: { not: current.id } }, select: { code: true, name: true } });
      if (assigned) fail(409, `El usuario APEX ${input.user_id} ya esta vinculado al asesor ${assigned.code} - ${assigned.name}.`);
    }
    const zone = input.zone_id ? await tx.commercialZone.findFirst({ where: { id: input.zone_id, tenant_id: tenantId, active: true } }) : null;
    if (input.zone_id && !zone) fail(400, "La zona seleccionada no existe o esta inactiva.");
    const data = { ...input, ...(input.code ? { code: input.code.trim() } : {}), ...(input.name ? { name: input.name.trim() } : {}), ...(Object.hasOwn(input, "zone_id") ? { zone_id: zone?.id || null, zone: zone?.name || null } : {}) };
    const updated = await tx.commercialAdvisor.update({ where: { id: current.id }, data });
    await audit(tx, tenantId, actor, "UPDATE", "CommercialAdvisor", current.id, current, updated); return updated;
  }));
}

async function listZones(tenantId, query = {}) { return prisma.runWithTenant(tenantId, () => prisma.commercialZone.findMany({ where: { tenant_id: tenantId, ...(query.active === "true" ? { active: true } : {}) }, orderBy: { name: "asc" } })); }
async function createZone(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede crear zonas.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const created = await tx.commercialZone.create({ data: { tenant_id: tenantId, code: input.code.trim(), name: input.name.trim(), description: input.description || null, city: input.city || null, department: input.department || null, active: input.active !== false } }); await audit(tx, tenantId, actor, "CREATE", "CommercialZone", created.id, null, created); return created; }));
}
async function updateZone(tenantId, actor, id, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede editar zonas.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const current = await tx.commercialZone.findFirst({ where: { id: Number(id), tenant_id: tenantId } }); if (!current) fail(404, "Zona no encontrada."); const updated = await tx.commercialZone.update({ where: { id: current.id }, data: { code: input.code.trim(), name: input.name.trim(), description: input.description || null, city: input.city || null, department: input.department || null, active: input.active !== false } }); await audit(tx, tenantId, actor, "UPDATE", "CommercialZone", current.id, current, updated); return updated; }));
}
async function listCustomerCategories(tenantId, query = {}) { return prisma.runWithTenant(tenantId, () => prisma.commercialCustomerCategory.findMany({ where: { tenant_id: tenantId, ...(query.active === "true" ? { active: true } : {}) }, orderBy: { name: "asc" } })); }
async function createCustomerCategory(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede crear categorias.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const created = await tx.commercialCustomerCategory.create({ data: { tenant_id: tenantId, code: input.code.trim(), name: input.name.trim(), description: input.description || null, active: input.active !== false } }); await audit(tx, tenantId, actor, "CREATE", "CommercialCustomerCategory", created.id, null, created); return created; }));
}
async function updateCustomerCategory(tenantId, actor, id, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede editar categorias.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const current = await tx.commercialCustomerCategory.findFirst({ where: { id: Number(id), tenant_id: tenantId } }); if (!current) fail(404, "Categoria no encontrada."); const updated = await tx.commercialCustomerCategory.update({ where: { id: current.id }, data: { code: input.code.trim(), name: input.name.trim(), description: input.description || null, active: input.active !== false } }); await audit(tx, tenantId, actor, "UPDATE", "CommercialCustomerCategory", current.id, current, updated); return updated; }));
}

async function listVisitReasons(tenantId, query = {}) { return prisma.runWithTenant(tenantId, () => prisma.commercialVisitReason.findMany({ where: { tenant_id: tenantId, ...(query.active === "true" ? { active: true } : {}) }, orderBy: { name: "asc" } })); }
async function createVisitReason(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede crear motivos de visita.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const created = await tx.commercialVisitReason.create({ data: { tenant_id: tenantId, code: input.code.trim(), name: input.name.trim(), description: input.description || null, active: input.active !== false } }); await audit(tx, tenantId, actor, "CREATE", "CommercialVisitReason", created.id, null, created); return created; }));
}
async function updateVisitReason(tenantId, actor, id, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede editar motivos de visita.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const current = await tx.commercialVisitReason.findFirst({ where: { id: Number(id), tenant_id: tenantId } }); if (!current) fail(404, "Motivo de visita no encontrado."); const updated = await tx.commercialVisitReason.update({ where: { id: current.id }, data: { code: input.code.trim(), name: input.name.trim(), description: input.description || null, active: input.active !== false } }); await audit(tx, tenantId, actor, "UPDATE", "CommercialVisitReason", current.id, current, updated); return updated; }));
}
async function listVisitResults(tenantId, query = {}) { return prisma.runWithTenant(tenantId, () => prisma.commercialVisitResult.findMany({ where: { tenant_id: tenantId, ...(query.active === "true" ? { active: true } : {}) }, orderBy: { name: "asc" } })); }
async function createVisitResult(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede crear resultados de visita.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const created = await tx.commercialVisitResult.create({ data: { tenant_id: tenantId, code: input.code.trim(), name: input.name.trim(), description: input.description || null, counts_as_effective: Boolean(input.counts_as_effective), requires_observation: input.requires_observation !== false, active: input.active !== false } }); await audit(tx, tenantId, actor, "CREATE", "CommercialVisitResult", created.id, null, created); return created; }));
}
async function updateVisitResult(tenantId, actor, id, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede editar resultados de visita.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const current = await tx.commercialVisitResult.findFirst({ where: { id: Number(id), tenant_id: tenantId } }); if (!current) fail(404, "Resultado de visita no encontrado."); const updated = await tx.commercialVisitResult.update({ where: { id: current.id }, data: { code: input.code.trim(), name: input.name.trim(), description: input.description || null, counts_as_effective: Boolean(input.counts_as_effective), requires_observation: input.requires_observation !== false, active: input.active !== false } }); await audit(tx, tenantId, actor, "UPDATE", "CommercialVisitResult", current.id, current, updated); return updated; }));
}

async function listCustomers(tenantId, actor) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const customers = await prisma.commercialCustomer.findMany({ where: { tenant_id: tenantId, ...scopeWhere(scope) }, include: { advisor: { select: { id: true, name: true } }, category: true, orders: { where: { status: { in: ["REGISTERED", "CONFIRMED", "INVOICED"] } }, orderBy: [{ order_date: "desc" }, { id: "desc" }], take: 1, select: { order_date: true, status: true } }, _count: { select: { commitments: { where: { status: "PENDING" } } } } }, orderBy: { legal_name: "asc" } });
    return customers.map(({ orders, ...customer }) => ({ ...customer, last_purchase_at: orders[0]?.order_date || null, last_purchase_status: orders[0]?.status || null }));
  });
}

async function createCustomer(tenantId, actor, input) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(tx => createCustomerInTransaction(tx, tenantId, actor, input)));
}

async function createCustomerInTransaction(tx, tenantId, actor, input) {
    const scope = await actorScope(tx, tenantId, actor);
    if (scope.kind !== "admin" && !scope.advisorIds.includes(input.advisor_id)) fail(403, "No puedes asignar clientes fuera de tu alcance.");
    const [advisor, category] = await Promise.all([tx.commercialAdvisor.findFirst({ where: { id: input.advisor_id, tenant_id: tenantId, active: true } }), tx.commercialCustomerCategory.findFirst({ where: { id: input.category_id, tenant_id: tenantId, active: true } })]);
    if (!advisor) fail(400, "El asesor no existe o esta inactivo.");
    if (!category) fail(400, "La categoria no existe o esta inactiva.");
    const created = await tx.commercialCustomer.create({ data: { tenant_id: tenantId, code: input.code.trim(), legal_name: input.legal_name.trim(), trade_name: input.trade_name || null, identification_type: input.identification_type || null, identification: input.identification || null, contact_name: input.contact_name || null, contact_position: input.contact_position || null, phone: input.phone || null, whatsapp: input.whatsapp || null, email: input.email || null, address: input.address || null, city: input.city || null, department: input.department || null, notes: input.notes || null, zone: advisor.zone || null, advisor_id: advisor.id, category_id: category.id, segment: category.code, status: input.status || "ACTIVE", visit_frequency_days: input.visit_frequency_days || 30, credit_capacity: input.credit_capacity || 0 } });
    await audit(tx, tenantId, actor, "CREATE", "CommercialCustomer", created.id, null, created);
    return created;
}

async function updateCustomer(tenantId, actor, id, input) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const scope = await actorScope(tx, tenantId, actor);
    const current = await tx.commercialCustomer.findFirst({ where: { id: Number(id), tenant_id: tenantId, ...scopeWhere(scope) } });
    if (!current) fail(404, "Cliente no encontrado dentro de tu alcance.");
    if (scope.kind !== "admin" && !scope.advisorIds.includes(input.advisor_id)) fail(403, "No puedes reasignar el cliente fuera de tu alcance.");
    const [advisor, category] = await Promise.all([tx.commercialAdvisor.findFirst({ where: { id: input.advisor_id, tenant_id: tenantId, active: true } }), tx.commercialCustomerCategory.findFirst({ where: { id: input.category_id, tenant_id: tenantId, active: true } })]);
    if (!advisor) fail(400, "El asesor no existe o esta inactivo.");
    if (!category) fail(400, "La categoria no existe o esta inactiva.");
    const updated = await tx.commercialCustomer.update({ where: { id: current.id }, data: { code: input.code.trim(), legal_name: input.legal_name.trim(), trade_name: input.trade_name || null, identification_type: input.identification_type || null, identification: input.identification || null, contact_name: input.contact_name || null, contact_position: input.contact_position || null, phone: input.phone || null, whatsapp: input.whatsapp || null, email: input.email || null, address: input.address || null, city: input.city || null, department: input.department || null, notes: input.notes || null, zone: advisor.zone || null, advisor_id: advisor.id, category_id: category.id, segment: category.code, status: input.status || current.status, visit_frequency_days: input.visit_frequency_days || current.visit_frequency_days, credit_capacity: input.credit_capacity ?? current.credit_capacity } });
    await audit(tx, tenantId, actor, "UPDATE", "CommercialCustomer", current.id, current, updated); return updated;
  }));
}

async function inventoryLicensed(db, tenantId) { const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { active_modules: true } }); const modules = Array.isArray(tenant?.active_modules) ? tenant.active_modules.map((item) => String(item).toLowerCase()) : []; return modules.some((item) => ["m-01", "inventario", "inventory"].includes(item)); }
const inventoryItemSelect = { id: true, code: true, name: true, category_id: true, family_code: true, unit: true, unit_price: true, active: true, metadata: true, category: { select: { id: true, name: true } } };
async function syncInventoryCatalog(db, tenantId) {
  const items = await db.item.findMany({ where: { tenant_id: tenantId, active: true, type: { in: ["product", "service"] } }, select: inventoryItemSelect });
  for (const item of items) await db.commercialProduct.upsert({ where: { tenant_id_inventory_item_id: { tenant_id: tenantId, inventory_item_id: item.id } }, create: { tenant_id: tenantId, code: item.code, name: item.name, category: item.category?.name || null, classification_id: item.category_id, subcategory: item.metadata?.subcategory || null, line: item.family_code || null, unit: item.unit, source_type: "INVENTORY", inventory_item_id: item.id, unit_price: item.unit_price, active: item.active }, update: { code: item.code, name: item.name, category: item.category?.name || null, classification_id: item.category_id, subcategory: item.metadata?.subcategory || null, line: item.family_code || null, unit: item.unit, source_type: "INVENTORY", unit_price: item.unit_price, active: item.active } });
}
async function listProducts(tenantId, query = {}) { return prisma.runWithTenant(tenantId, async () => { const licensed = await inventoryLicensed(prisma, tenantId); if (licensed) await syncInventoryCatalog(prisma, tenantId); const rows = await prisma.commercialProduct.findMany({ where: { tenant_id: tenantId, ...(query.active === "true" ? { active: true } : {}) }, include: { classification: true, inventory_item: { select: { id: true, code: true, name: true, unit_price: true, unit: true, active: true } } }, orderBy: { name: "asc" } }); return rows.map((row) => ({ ...row, unit_price: row.inventory_item ? row.inventory_item.unit_price : row.unit_price, inventory_licensed: licensed, price_source: row.inventory_item ? "INVENTORY" : "COMMERCIAL" })); }); }
async function createProduct(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede crear productos.");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const licensed = await inventoryLicensed(tx, tenantId);
    if (licensed && !input.inventory_item_id) fail(409, "Inventarios esta activo: crea el articulo en Inventarios o selecciona uno existente para evitar duplicados y diferencias de precio.");
    if (input.inventory_item_id) { const item = await tx.item.findFirst({ where: { id: input.inventory_item_id, tenant_id: tenantId, active: true }, select: inventoryItemSelect }); if (!item) fail(400, "El articulo de Inventarios no existe o esta inactivo."); const created = await tx.commercialProduct.upsert({ where: { tenant_id_inventory_item_id: { tenant_id: tenantId, inventory_item_id: item.id } }, create: { tenant_id: tenantId, code: item.code, name: item.name, category: item.category?.name || null, classification_id: item.category_id, subcategory: item.metadata?.subcategory || null, line: item.family_code || null, unit: item.unit, source_type: "INVENTORY", inventory_item_id: item.id, unit_price: item.unit_price, active: true }, update: { code: item.code, name: item.name, unit_price: item.unit_price, active: true } }); await audit(tx, tenantId, actor, "LINK", "CommercialProduct", created.id, null, created); return created; }
    const count = await tx.commercialProduct.count({ where: { tenant_id: tenantId, source_type: "LOCAL" } }); const code = String(input.code || "").trim().toUpperCase() || `GC-P-${String(count + 1).padStart(6, "0")}`;
    const created = await tx.commercialProduct.create({ data: { tenant_id: tenantId, code, name: input.name.trim(), category: input.category || null, classification_id: input.classification_id || null, subcategory: input.subcategory || null, line: input.line || null, unit: input.unit || "UND", source_type: "LOCAL", unit_price: input.unit_price || 0, active: input.active !== false } });
    await audit(tx, tenantId, actor, "CREATE", "CommercialProduct", created.id, null, created); return created;
  }));
}
async function updateProduct(tenantId, actor, id, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede editar productos.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const current = await tx.commercialProduct.findFirst({ where: { id: Number(id), tenant_id: tenantId } }); if (!current) fail(404, "Producto no encontrado."); if (current.inventory_item_id) { if (input.unit_price !== undefined) await tx.item.update({ where: { id: current.inventory_item_id }, data: { unit_price: input.unit_price } }); const item = await tx.item.findUnique({ where: { id: current.inventory_item_id }, select: inventoryItemSelect }); const updated = await tx.commercialProduct.update({ where: { id: current.id }, data: { code: item.code, name: item.name, category: item.category?.name || null, classification_id: item.category_id, subcategory: item.metadata?.subcategory || null, line: item.family_code || null, unit: item.unit, unit_price: input.unit_price ?? item.unit_price, active: item.active } }); await audit(tx, tenantId, actor, "UPDATE_PRICE_FROM_INVENTORY", "CommercialProduct", current.id, current, updated); return updated; } const updated = await tx.commercialProduct.update({ where: { id: current.id }, data: { code: String(input.code || current.code).trim().toUpperCase(), name: input.name.trim(), category: input.category || null, classification_id: input.classification_id || null, subcategory: input.subcategory || null, line: input.line || null, unit: input.unit || current.unit, unit_price: input.unit_price ?? current.unit_price, active: input.active !== false } }); await audit(tx, tenantId, actor, "UPDATE", "CommercialProduct", current.id, current, updated); return updated; }));
}

async function importProducts(tenantId, actor, buffer) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede importar productos.");
  const JSZip = require("jszip"); const zip = await JSZip.loadAsync(buffer); const xmlFile = zip.file("xl/worksheets/sheet1.xml"); if (!xmlFile) fail(400, "El archivo no contiene la hoja Productos."); const xml = await xmlFile.async("string");
  const decode = (value) => String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); const rows = [];
  for (const match of xml.matchAll(/<x:row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/x:row>/g)) { const index = Number(match[1]); if (index === 1) continue; const values = {}; for (const cell of match[2].matchAll(/<x:c[^>]*r="([A-J])\d+"[^>]*?(?:t="([^"]+)")?[^>]*>(?:<x:v>([\s\S]*?)<\/x:v>)?<\/x:c>|<x:c[^>]*r="([A-J])\d+"[^>]*\/>/g)) { const column = cell[1] || cell[4]; values[column] = decode(cell[3]); } const name = String(values.C || "").trim(); if (!name) continue; rows.push({ row: index, code: String(values.A || "").trim(), auto_code: String(values.B || "SI").trim().toUpperCase() === "SI", name, category: String(values.D || "").trim(), subcategory: String(values.E || "").trim(), line: String(values.F || "").trim(), unit: String(values.G || "UND").trim(), unit_price: Number(values.H || 0), active: String(values.I || "ACTIVO").trim().toUpperCase() !== "INACTIVO", inventory_code: String(values.J || "").trim() }); }
  if (!rows.length) fail(400, "La plantilla no contiene productos para importar.");
  const licensed = await prisma.runWithTenant(tenantId, () => inventoryLicensed(prisma, tenantId)); const errors = []; const prepared = [];
  for (const row of rows) { if (!Number.isFinite(row.unit_price) || row.unit_price < 0) { errors.push({ row: row.row, message: "Precio inválido." }); continue; } if (licensed) { const item = await prisma.runWithTenant(tenantId, () => prisma.item.findFirst({ where: { tenant_id: tenantId, code: row.inventory_code || row.code, active: true }, select: inventoryItemSelect })); if (!item) { errors.push({ row: row.row, message: "El código no existe en Inventarios." }); continue; } if (Number(item.unit_price) !== row.unit_price) { errors.push({ row: row.row, message: `El precio debe coincidir con Inventarios (${item.unit_price}).` }); continue; } prepared.push({ inventory_item_id: item.id, name: item.name, unit_price: Number(item.unit_price) }); } else prepared.push(row); }
  if (errors.length) fail(400, `La importación tiene ${errors.length} error(es).`, { errors });
  const imported = []; for (const row of prepared) imported.push(await createProduct(tenantId, actor, row)); return { imported: imported.length, inventory_licensed: licensed };
}

async function listPeriods(tenantId) { return prisma.runWithTenant(tenantId, () => prisma.commercialPeriod.findMany({ where: { tenant_id: tenantId }, orderBy: { start_date: "desc" } })); }
async function createPeriod(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede crear periodos.");
  const start = new Date(input.start_date); const end = new Date(input.end_date);
  if (end < start) fail(400, "La fecha final debe ser posterior a la inicial.");
  if (!isFullCalendarMonth(start, end)) fail(400, "El periodo debe cubrir un mes calendario completo en la zona horaria de Colombia.");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const overlap = await tx.commercialPeriod.findFirst({ where: { tenant_id: tenantId, start_date: { lte: end }, end_date: { gte: start } } });
    if (overlap) fail(409, "El periodo se superpone con otro periodo comercial.");
    const created = await tx.commercialPeriod.create({ data: { tenant_id: tenantId, name: input.name.trim(), start_date: start, end_date: end, status: input.status || "OPEN" } });
    await audit(tx, tenantId, actor, "CREATE", "CommercialPeriod", created.id, null, created); return created;
  }));
}

async function upsertAdvisorBudget(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede asignar presupuestos.");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const [period, advisor] = await Promise.all([tx.commercialPeriod.findFirst({ where: { id: input.period_id, tenant_id: tenantId } }), tx.commercialAdvisor.findFirst({ where: { id: input.advisor_id, tenant_id: tenantId } })]);
    if (!period || !advisor) fail(400, "Periodo o asesor no valido.");
    const budgetType = input.budget_type || "MONTHLY"; const budgetDate = budgetType === "DAILY" ? new Date(input.budget_date) : period.start_date; if (budgetDate < period.start_date || budgetDate > period.end_date) fail(400, "La fecha diaria debe pertenecer al periodo seleccionado.");
    const record = await tx.commercialAdvisorBudget.upsert({ where: { tenant_id_period_id_advisor_id_budget_type_budget_date: { tenant_id: tenantId, period_id: period.id, advisor_id: advisor.id, budget_type: budgetType, budget_date: budgetDate } }, create: { tenant_id: tenantId, period_id: period.id, advisor_id: advisor.id, budget_amount: input.budget_amount, budget_type: budgetType, budget_date: budgetDate }, update: { budget_amount: input.budget_amount } });
    await audit(tx, tenantId, actor, "UPSERT", "CommercialAdvisorBudget", record.id, null, record); return record;
  }));
}

async function upsertCustomerBudget(tenantId, actor, input) {
  if (!ADMIN_ROLES.has(roleName(actor))) fail(403, "Solo un administrador puede asignar presupuestos.");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const customer = await tx.commercialCustomer.findFirst({ where: { id: input.customer_id, tenant_id: tenantId } });
    const period = await tx.commercialPeriod.findFirst({ where: { id: input.period_id, tenant_id: tenantId } });
    if (!customer || !period) fail(400, "Periodo o cliente no valido.");
    const budgetType = input.budget_type || "MONTHLY"; const budgetDate = budgetType === "DAILY" ? new Date(input.budget_date) : period.start_date; if (budgetDate < period.start_date || budgetDate > period.end_date) fail(400, "La fecha diaria debe pertenecer al periodo seleccionado.");
    const record = await tx.commercialCustomerBudget.upsert({ where: { tenant_id_period_id_customer_id_budget_type_budget_date: { tenant_id: tenantId, period_id: period.id, customer_id: customer.id, budget_type: budgetType, budget_date: budgetDate } }, create: { tenant_id: tenantId, period_id: period.id, customer_id: customer.id, advisor_id: customer.advisor_id, budget_amount: input.budget_amount, budget_type: budgetType, budget_date: budgetDate }, update: { advisor_id: customer.advisor_id, budget_amount: input.budget_amount } });
    await audit(tx, tenantId, actor, "UPSERT", "CommercialCustomerBudget", record.id, null, record); return record;
  }));
}

async function listBudgets(tenantId, actor, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor); const periodId = query.period_id ? Number(query.period_id) : undefined;
    const [advisorBudgets, customerBudgets] = await Promise.all([
      prisma.commercialAdvisorBudget.findMany({ where: { tenant_id: tenantId, ...(periodId ? { period_id: periodId } : {}), ...scopeWhere(scope) }, include: { advisor: true, period: true }, orderBy: { updated_at: "desc" } }),
      prisma.commercialCustomerBudget.findMany({ where: { tenant_id: tenantId, ...(periodId ? { period_id: periodId } : {}), ...scopeWhere(scope) }, include: { advisor: true, customer: true, period: true }, orderBy: { updated_at: "desc" } })
    ]);
    return { advisor_budgets: advisorBudgets, customer_budgets: customerBudgets };
  });
}

async function createVisit(tenantId, actor, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const scope = await actorScope(tx, tenantId, actor);
    const customer = input.customer_id ? await tx.commercialCustomer.findFirst({ where: { id: input.customer_id, tenant_id: tenantId, ...scopeWhere(scope) } }) : null;
    if (input.customer_id && !customer) fail(404, "Cliente no encontrado dentro de tu alcance.");
    const advisorId = input.advisor_id || customer?.advisor_id || scope.advisor?.id;
    if (!advisorId) fail(400, "Selecciona el asesor para la visita sin cliente.");
    if (scope.kind !== "admin" && !scope.advisorIds.includes(advisorId)) fail(403, "Asesor fuera de tu alcance.");
    const advisor = await tx.commercialAdvisor.findFirst({ where: { id: advisorId, tenant_id: tenantId, active: true } });
    if (!advisor) fail(400, "Asesor no valido.");
    if (customer && advisorId !== customer.advisor_id) fail(400, "La visita debe pertenecer al asesor asignado al cliente.");
    const reason = await tx.commercialVisitReason.findFirst({ where: { id: input.reason_id, tenant_id: tenantId, active: true } });
    if (!reason) fail(400, "El motivo de visita no existe o esta inactivo.");
    const settings = await settingsFor(tx, tenantId); const duration = input.duration_minutes || settings.default_visit_duration_minutes; const start = new Date(input.visit_date); const end = new Date(start.getTime() + duration * 60000);
    await assertAdvisorAvailability(tx, tenantId, advisorId, start, end);
    const created = await tx.commercialVisit.create({ data: { tenant_id: tenantId, advisor_id: advisorId, customer_id: customer?.id || null, reason_id: reason.id, visit_date: start, scheduled_end_at: end, planned_duration_minutes: duration, visit_type: input.visit_type || "IN_PERSON", status: "SCHEDULED", notes: input.notes || null, created_by: actor?.id || null } });
    await addVisitEvent(tx, tenantId, created.id, "SCHEDULED", actor, { scheduled_for: start, details: { scheduled_end_at: end, duration_minutes: duration } });
    await audit(tx, tenantId, actor, "CREATE", "CommercialVisit", created.id, null, created); return created;
  }));
}

async function checkVisitAvailability(tenantId, actor, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const advisorId = Number(input.advisor_id);
    if (scope.kind !== "admin" && !scope.advisorIds.includes(advisorId)) fail(403, "Asesor fuera de tu alcance.");
    const advisor = await prisma.commercialAdvisor.findFirst({ where: { id: advisorId, tenant_id: tenantId, active: true } });
    if (!advisor) fail(400, "Asesor no valido.");
    const settings = await settingsFor(prisma, tenantId);
    const duration = Number(input.duration_minutes || settings.default_visit_duration_minutes);
    const start = new Date(input.visit_date);
    const end = new Date(start.getTime() + duration * 60000);
    const conflict = await findAdvisorConflict(prisma, tenantId, advisorId, start, end, input.exclude_visit_id ? Number(input.exclude_visit_id) : undefined);
    return { available: !conflict, requested: { advisor_id: advisorId, start, end, duration_minutes: duration }, conflict: conflict ? { id: conflict.id, customer: conflict.customer?.legal_name || "Prospeccion sin cliente", advisor: conflict.advisor.name, status: conflict.status, start: conflict.visit_date, end: conflict.scheduled_end_at } : null };
  });
}

async function myDay(tenantId, actor, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const range = bogotaDay(query.date);
    const advisorId = query.advisor_id ? Number(query.advisor_id) : scope.kind === "advisor" ? scope.advisor.id : undefined;
    if (advisorId && scope.kind !== "admin" && !scope.advisorIds.includes(advisorId)) fail(403, "Asesor fuera de tu alcance.");
    const advisorWhere = advisorId ? { advisor_id: advisorId } : scopeWhere(scope);
    const quoteLimit = new Date(range.end.getTime() + 7 * 86400000);
    const [visits, commitments, quotations] = await Promise.all([
      prisma.commercialVisit.findMany({ where: { tenant_id: tenantId, ...advisorWhere, visit_date: { gte: range.start, lte: range.end }, status: { notIn: ["RESCHEDULED", "CANCELLED"] } }, include: { customer: { select: { id: true, legal_name: true, city: true, address: true } }, advisor: { select: { id: true, name: true } }, reason: { select: { name: true } } }, orderBy: { visit_date: "asc" } }),
      prisma.commercialCustomerCommitment.findMany({ where: { tenant_id: tenantId, ...advisorWhere, status: "PENDING", due_date: { lte: range.end } }, include: { customer: { select: { id: true, legal_name: true } }, advisor: { select: { id: true, name: true } } }, orderBy: { due_date: "asc" }, take: 20 }),
      prisma.commercialQuotation.findMany({ where: { tenant_id: tenantId, ...advisorWhere, status: "OPEN", sales_order: null, valid_until: { lte: quoteLimit } }, include: { customer: { select: { id: true, legal_name: true } }, advisor: { select: { id: true, name: true } } }, orderBy: { valid_until: "asc" }, take: 20 })
    ]);
    const now = new Date();
    return { date: range.start, advisor_id: advisorId || null, totals: { visits: visits.length, scheduled: visits.filter(row => row.status === "SCHEDULED").length, in_progress: visits.filter(row => row.status === "IN_PROGRESS").length, completed: visits.filter(row => row.status === "COMPLETED").length, overdue: visits.filter(row => row.status === "SCHEDULED" && row.scheduled_end_at && row.scheduled_end_at < now).length, commitments: commitments.length, overdue_commitments: commitments.filter(row => row.due_date < range.start).length, quotations: quotations.length }, visits, commitments, quotations };
  });
}

async function listVisits(tenantId, actor, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const range = query.date ? bogotaDay(query.date) : null;
    const from = query.date_from ? bogotaDay(query.date_from).start : null; const to = query.date_to ? bogotaDay(query.date_to).end : null;
    const rows = await prisma.commercialVisit.findMany({
      where: { tenant_id: tenantId, ...scopeWhere(scope), ...(range ? { visit_date: { gte: range.start, lte: range.end } } : from || to ? { visit_date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}), ...(query.status ? { status: query.status } : {}), ...(query.customer_id ? { customer_id: Number(query.customer_id) } : {}), ...(query.advisor_id ? { advisor_id: Number(query.advisor_id) } : {}), ...(query.zone_id ? { advisor: { zone_id: Number(query.zone_id) } } : {}) },
      include: { reason: true, result: true, events: { orderBy: { event_at: "asc" } }, customer: { select: { id: true, code: true, legal_name: true, identification_type: true, identification: true, email: true, phone: true, whatsapp: true, address: true, city: true } }, advisor: { select: { id: true, code: true, name: true, phone: true, email: true } }, orders: { select: { id: true, order_number: true, status: true, total: true } }, quotations: { select: { id: true, quotation_number: true, status: true } }, rescheduled_visits: { select: { id: true, visit_date: true, status: true } } },
      orderBy: { visit_date: "asc" }
    });
    const now = new Date();
    return rows.map((visit) => ({ ...visit, display_status: visit.status === "SCHEDULED" && visit.scheduled_end_at && visit.scheduled_end_at < now ? "OVERDUE" : visit.status === "IN_PROGRESS" ? "PENDING_COMPLETION" : visit.status, actual_duration_minutes: visitExecutionMinutes(visit), duration_deviation_minutes: visit.started_at && visit.completed_at ? Math.round((visit.completed_at.getTime() - visit.started_at.getTime()) / 60000) - visit.planned_duration_minutes : null }));
  });
}

async function advisorReport(tenantId, actor, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const rows = await prisma.commercialVisit.findMany({
      where: { tenant_id: tenantId, ...scopeWhere(scope), visit_date: { gte: new Date(`${query.year}-01-01T00:00:00-05:00`), lt: new Date(`${Number(query.year) + 1}-01-01T00:00:00-05:00`) } },
      select: { advisor_id: true, visit_date: true, status: true, advisor: { select: { name: true } }, orders: { where: { tenant_id: tenantId }, select: { status: true, total: true } }, quotations: { where: { tenant_id: tenantId }, select: { status: true } } }
    });
    return require('./advisor-report').aggregateAdvisorVisits(rows, query);
  });
}

async function visitTimeline(tenantId, actor, id, full = false) {
  return prisma.runWithTenant(tenantId, async () => {
    let root = await visitForUpdate(prisma, tenantId, actor, id);
    const seen = new Set([root.id]);
    while (root.rescheduled_from_id) {
      if (seen.has(root.rescheduled_from_id)) fail(409, "Historial de reprogramacion inconsistente.");
      root = await visitForUpdate(prisma, tenantId, actor, root.rescheduled_from_id);
      seen.add(root.id);
    }
    const scope = await actorScope(prisma, tenantId, actor);
    const ids = [root.id];
    let frontier = [root.id];
    while (frontier.length) {
      const children = await prisma.commercialVisit.findMany({ where: { tenant_id: tenantId, ...scopeWhere(scope), rescheduled_from_id: { in: frontier } }, select: { id: true } });
      frontier = children.map(row => row.id).filter(child => !ids.includes(child));
      ids.push(...frontier);
    }
    const events = await prisma.commercialVisitEvent.findMany({ where: { tenant_id: tenantId, visit_id: { in: ids } }, orderBy: [{ event_at: "asc" }, { id: "asc" }] });
    if (!full) return events;
    const where = { tenant_id: tenantId, ...scopeWhere(scope), visit_id: { in: ids } };
    const [visits, orders, quotations, commitments] = await Promise.all([
      prisma.commercialVisit.findMany({ where: { tenant_id: tenantId, ...scopeWhere(scope), id: { in: ids } }, include: { customer: { select: { legal_name: true } }, advisor: { select: { name: true } }, result: true }, orderBy: { created_at: "asc" } }),
      prisma.commercialSalesOrder.findMany({ where, select: { id: true, visit_id: true, order_number: true, order_date: true, status: true, total: true }, orderBy: { order_date: "asc" } }),
      prisma.commercialQuotation.findMany({ where, select: { id: true, visit_id: true, quotation_number: true, quotation_date: true, status: true, total: true }, orderBy: { quotation_date: "asc" } }),
      prisma.commercialCustomerCommitment.findMany({ where, orderBy: { due_date: "asc" } })
    ]);
    return { events, visits, orders, quotations, commitments };
  });
}

async function createVisitCustomer(tenantId, actor, id, input) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async tx => {
    const visit = await visitForUpdate(tx, tenantId, actor, id);
    if (visit.status !== "IN_PROGRESS" || visit.customer_id) fail(409, "Solo puedes crear el cliente de una visita en curso sin cliente.");
    const customer = await createCustomerInTransaction(tx, tenantId, actor, { ...input, advisor_id: visit.advisor_id });
    const attached = await tx.commercialVisit.updateMany({ where: { id: visit.id, tenant_id: tenantId, status: "IN_PROGRESS", customer_id: null }, data: { customer_id: customer.id } });
    if (attached.count !== 1) fail(409, "La visita cambio. Actualiza antes de continuar.");
    await addVisitEvent(tx, tenantId, visit.id, "CUSTOMER_CREATED", actor, { details: { customer_id: customer.id, customer_name: customer.legal_name } });
    await audit(tx, tenantId, actor, "ASSIGN_CUSTOMER", "CommercialVisit", visit.id, visit, { customer_id: customer.id });
    return customer;
  }));
}

async function visitForUpdate(tx, tenantId, actor, id) {
  const scope = await actorScope(tx, tenantId, actor);
  const visit = await tx.commercialVisit.findFirst({ where: { id: Number(id), tenant_id: tenantId, ...scopeWhere(scope) } });
  if (!visit) fail(404, "Visita no encontrada dentro de tu alcance.");
  return visit;
}

async function startVisit(tenantId, actor, id) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const current = await visitForUpdate(tx, tenantId, actor, id);
    if (current.status !== "SCHEDULED") fail(409, `No se puede iniciar una visita ${current.status}.`);
    const updated = await tx.commercialVisit.update({ where: { id: current.id }, data: { status: "IN_PROGRESS", started_at: new Date() } });
    await addVisitEvent(tx, tenantId, current.id, "STARTED", actor, { details: { planned_start: current.visit_date } });
    await audit(tx, tenantId, actor, "START", "CommercialVisit", current.id, current, updated); return updated;
  }));
}

async function completeVisit(tenantId, actor, id, input) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const current = await visitForUpdate(tx, tenantId, actor, id);
    if (current.status !== "IN_PROGRESS") fail(409, "Solo una visita en curso puede completarse.");
    const result = await tx.commercialVisitResult.findFirst({ where: { id: input.result_id, tenant_id: tenantId, active: true } });
    if (!result) fail(400, "El resultado de visita no existe o esta inactivo.");
    if (result.requires_observation && !String(input.outcome_notes || "").trim()) fail(400, "Las observaciones son obligatorias para el resultado seleccionado.");
    const completedAt = new Date();
    const updated = await tx.commercialVisit.update({ where: { id: current.id }, data: { status: "COMPLETED", completed_at: completedAt, result_id: result.id, result_code: result.code, outcome_notes: String(input.outcome_notes || "").trim() || null, follow_up_required: Boolean(input.follow_up_required), follow_up_date: input.follow_up_date ? new Date(input.follow_up_date) : null } });
    await addVisitEvent(tx, tenantId, current.id, "COMPLETED", actor, { event_at: completedAt, details: { result_code: result.code, actual_duration_minutes: current.started_at ? Math.round((completedAt.getTime() - current.started_at.getTime()) / 60000) : null, planned_duration_minutes: current.planned_duration_minutes } });
    if (!current.customer_id && input.commitments?.length) fail(400, "Crea el cliente antes de registrar compromisos.");
    for (const item of input.commitments || []) {
      await tx.commercialCustomerCommitment.create({ data: { tenant_id: tenantId, customer_id: current.customer_id, advisor_id: current.advisor_id, visit_id: current.id, description: item.description.trim(), due_date: new Date(item.due_date), created_by: actor?.id || null } });
    }
    if (current.customer_id) await tx.commercialCustomer.update({ where: { id: current.customer_id }, data: { last_visit_at: completedAt } });
    await audit(tx, tenantId, actor, "COMPLETE", "CommercialVisit", current.id, current, updated); return updated;
  }));
}

async function listCommitments(tenantId, actor, query = {}) {
  return prisma.runWithTenant(tenantId, async () => { const scope = await actorScope(prisma, tenantId, actor); return prisma.commercialCustomerCommitment.findMany({ where: { tenant_id: tenantId, ...scopeWhere(scope), ...(query.customer_id ? { customer_id: Number(query.customer_id) } : {}), ...(query.status ? { status: query.status } : {}) }, include: { customer: { select: { id: true, code: true, legal_name: true } }, advisor: { select: { id: true, code: true, name: true } } }, orderBy: [{ status: "asc" }, { due_date: "asc" }] }); });
}
async function createCommitment(tenantId, actor, customerId, input) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const scope = await actorScope(tx, tenantId, actor); const customer = await tx.commercialCustomer.findFirst({ where: { id: Number(customerId), tenant_id: tenantId, ...scopeWhere(scope) } }); if (!customer) fail(404, "Cliente no encontrado dentro de tu alcance."); const created = await tx.commercialCustomerCommitment.create({ data: { tenant_id: tenantId, customer_id: customer.id, advisor_id: customer.advisor_id, description: input.description.trim(), due_date: new Date(input.due_date), created_by: actor?.id || null } }); await audit(tx, tenantId, actor, "CREATE", "CommercialCustomerCommitment", created.id, null, created); return created; }));
}
async function changeCommitmentStatus(tenantId, actor, id, status) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const scope = await actorScope(tx, tenantId, actor); const current = await tx.commercialCustomerCommitment.findFirst({ where: { id: Number(id), tenant_id: tenantId, ...scopeWhere(scope) } }); if (!current) fail(404, "Compromiso no encontrado dentro de tu alcance."); const updated = await tx.commercialCustomerCommitment.update({ where: { id: current.id }, data: { status, completed_at: status === "COMPLETED" ? new Date() : null } }); await audit(tx, tenantId, actor, "STATUS_CHANGE", "CommercialCustomerCommitment", current.id, current, updated); return updated; }));
}

async function rescheduleVisit(tenantId, actor, id, input) {
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const current = await visitForUpdate(tx, tenantId, actor, id);
    if (current.status !== "SCHEDULED" && current.status !== "IN_PROGRESS") fail(409, `No se puede reprogramar una visita ${current.status}.`);
    const reason = String(input.reason || "").trim();
    if (!reason) fail(400, "El motivo de reprogramacion es obligatorio.");
    const duration = input.duration_minutes || current.planned_duration_minutes || 60; const start = new Date(input.visit_date); const end = new Date(start.getTime() + duration * 60000);
    await assertAdvisorAvailability(tx, tenantId, current.advisor_id, start, end, current.id);
    const replacement = await tx.commercialVisit.create({ data: { tenant_id: tenantId, advisor_id: current.advisor_id, customer_id: current.customer_id, reason_id: current.reason_id, visit_date: start, scheduled_end_at: end, planned_duration_minutes: duration, visit_type: current.visit_type, status: "SCHEDULED", notes: current.notes, rescheduled_from_id: current.id, created_by: actor?.id || null } });
    const updated = await tx.commercialVisit.update({ where: { id: current.id }, data: { status: "RESCHEDULED", completed_at: new Date(), reschedule_reason: reason } });
    await addVisitEvent(tx, tenantId, current.id, "RESCHEDULED", actor, { scheduled_for: start, details: { reason, replacement_visit_id: replacement.id, previous_schedule: current.visit_date } });
    await addVisitEvent(tx, tenantId, replacement.id, "SCHEDULED", actor, { scheduled_for: start, details: { rescheduled_from_id: current.id, scheduled_end_at: end, duration_minutes: duration } });
    await audit(tx, tenantId, actor, "RESCHEDULE", "CommercialVisit", current.id, current, { original: updated, replacement }); return replacement;
  }));
}

async function visitReport(tenantId, actor, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const from = bogotaDay(query.from).start; const to = bogotaDay(query.to || query.from).end;
    const visits = await prisma.commercialVisit.findMany({ where: { tenant_id: tenantId, ...scopeWhere(scope), visit_date: { gte: from, lte: to } }, include: { result: true, reason: true, customer: { select: { code: true, legal_name: true } }, advisor: { select: { code: true, name: true } } }, orderBy: { visit_date: "asc" } });
    const rows = visits.map((visit) => ({ ...visit, variance_minutes: visit.started_at ? Math.round((visit.started_at.getTime() - visit.visit_date.getTime()) / 60000) : null, actual_duration_minutes: visit.started_at && visit.completed_at ? Math.round((visit.completed_at.getTime() - visit.started_at.getTime()) / 60000) : null, duration_deviation_minutes: visit.started_at && visit.completed_at ? Math.round((visit.completed_at.getTime() - visit.started_at.getTime()) / 60000) - visit.planned_duration_minutes : null, produced_order: Boolean(visit.result?.counts_as_effective) }));
    const completed = rows.filter((item) => item.status === "COMPLETED");
    const durations = completed.filter((item) => item.actual_duration_minutes !== null);
    return { from, to, totals: { scheduled: rows.length, completed: completed.length, rescheduled: rows.filter((item) => item.status === "RESCHEDULED").length, pending: rows.filter((item) => ["SCHEDULED", "IN_PROGRESS"].includes(item.status)).length, effective: completed.filter((item) => item.produced_order).length, effectiveness: completed.length ? completed.filter((item) => item.produced_order).length / completed.length : 0, average_duration_minutes: durations.length ? Math.round(durations.reduce((sum, item) => sum + item.actual_duration_minutes, 0) / durations.length) : 0, average_duration_deviation_minutes: durations.length ? Math.round(durations.reduce((sum, item) => sum + item.duration_deviation_minutes, 0) / durations.length) : 0 }, rows };
  });
}

async function createOrder(tenantId, actor, input) {
  if (!input.customer_id) fail(400, "Crea y vincula el cliente antes de generar el pedido.");
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const scope = await actorScope(tx, tenantId, actor);
    const customer = await tx.commercialCustomer.findFirst({ where: { id: input.customer_id, tenant_id: tenantId, ...scopeWhere(scope) } });
    if (!customer) fail(404, "Cliente no encontrado dentro de tu alcance.");
    if (input.visit_id) {
      const visit = await tx.commercialVisit.findFirst({ where: { id: input.visit_id, tenant_id: tenantId, customer_id: customer.id, advisor_id: customer.advisor_id } });
      if (!visit) fail(400, "La visita indicada no pertenece al cliente y asesor.");
    }
    if (input.quotation_id) {
      const quotation = await tx.commercialQuotation.findFirst({ where: { id: input.quotation_id, tenant_id: tenantId, customer_id: customer.id, ...scopeWhere(scope) } });
      if (!quotation) fail(404, "Cotizacion no encontrada dentro de tu alcance.");
      const claimed = await tx.commercialQuotation.updateMany({ where: { id: quotation.id, tenant_id: tenantId, status: "OPEN", sales_order: null }, data: { status: "CONVERTED" } });
      if (claimed.count !== 1) fail(409, "La cotizacion ya fue convertida o cancelada.");
      await audit(tx, tenantId, actor, "CONVERT", "CommercialQuotation", quotation.id, quotation, { status: "CONVERTED" });
    }
    const ids = [...new Set(input.lines.map((line) => line.product_id))];
    const products = await tx.commercialProduct.findMany({ where: { tenant_id: tenantId, id: { in: ids }, active: true }, include: { inventory_item: { select: { unit_price: true } } } });
    if (products.length !== ids.length) fail(400, "Uno o mas productos no existen o estan inactivos.");
    const byId = new Map(products.map((item) => [item.id, item]));
    const totals = orderTotals(input.lines.map((line) => { const product = byId.get(line.product_id); return { ...line, unit_price: product.inventory_item ? Number(product.inventory_item.unit_price) : (line.unit_price ?? Number(product.unit_price)) }; }));
    const count = await tx.commercialSalesOrder.count({ where: { tenant_id: tenantId } });
    const created = await tx.commercialSalesOrder.create({ data: { tenant_id: tenantId, order_number: `GC-${String(count + 1).padStart(6, "0")}`, customer_id: customer.id, advisor_id: customer.advisor_id, visit_id: input.visit_id || null, quotation_id: input.quotation_id || null, order_date: input.order_date ? new Date(input.order_date) : new Date(), status: "REGISTERED", subtotal: totals.subtotal, discount: totals.discount, total: totals.total, notes: input.notes || null, created_by: actor?.id || null, lines: { create: totals.lines.map((line) => { const product = byId.get(line.product_id); return { product_id: product.id, product_code: product.code, product_name: product.name, quantity: line.quantity, unit_price: line.unit_price, discount: line.discount, line_total: line.line_total }; }) } }, include: { lines: true, customer: true, advisor: true } });
    await audit(tx, tenantId, actor, "CREATE", "CommercialSalesOrder", created.id, null, created); return created;
  }));
}

async function listOrders(tenantId, actor, query = {}) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    return prisma.commercialSalesOrder.findMany({
      where: {
        tenant_id: tenantId,
        ...scopeWhere(scope),
        ...(query.advisor_id ? { advisor_id: Number(query.advisor_id) } : {}),
        ...(query.customer_id ? { customer_id: Number(query.customer_id) } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.from || query.to ? { order_date: { ...(query.from ? { gte: bogotaDay(query.from).start } : {}), ...(query.to ? { lte: bogotaDay(query.to).end } : {}) } } : {})
      },
      include: { customer: true, advisor: true, lines: true, quotation: { select: { id: true, quotation_number: true } } },
      orderBy: [{ order_date: "desc" }, { id: "desc" }]
    });
  });
}

async function getOrder(tenantId, actor, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const order = await prisma.commercialSalesOrder.findFirst({ where: { id: Number(id), tenant_id: tenantId, ...scopeWhere(scope) }, include: { customer: true, advisor: true, lines: true, visit: true, quotation: { include: { lines: true } } } });
    if (!order) fail(404, "Pedido no encontrado dentro de tu alcance.");
    return order;
  });
}

async function listQuotations(tenantId, actor, query = {}) {
  return prisma.runWithTenant(tenantId, async () => { const scope = await actorScope(prisma, tenantId, actor); const rows = await prisma.commercialQuotation.findMany({ where: { tenant_id: tenantId, ...scopeWhere(scope), ...(query.advisor_id ? { advisor_id: Number(query.advisor_id) } : {}), ...(query.customer_id ? { customer_id: Number(query.customer_id) } : {}), ...(query.visit_id ? { visit_id: Number(query.visit_id) } : {}), ...(query.status ? { status: query.status } : {}), ...(query.without_order === "true" ? { sales_order: null, status: "OPEN" } : {}) }, include: { customer: true, advisor: true, lines: true, sales_order: { select: { id: true, order_number: true, status: true } } }, orderBy: { quotation_date: "desc" } }); const now = new Date(); return rows.map((row) => ({ ...row, display_status: row.status === "OPEN" && row.valid_until < now ? "EXPIRED" : row.status })); });
}

async function quotationComparisonReport(tenantId, actor, year) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const quotes = await prisma.commercialQuotation.findMany({
      where: { tenant_id: tenantId, ...scopeWhere(scope), quotation_date: { gte: new Date(`${year}-01-01T00:00:00-05:00`), lt: new Date(`${Number(year) + 1}-01-01T00:00:00-05:00`) } },
      include: { advisor: { select: { name: true } }, customer: { select: { legal_name: true } }, lines: true, sales_order: { include: { lines: true } } },
      orderBy: [{ quotation_date: 'desc' }, { id: 'desc' }]
    });
    return quotes.flatMap(quote => require('./quotation-report').compareQuotation(quote));
  });
}

async function getQuotation(tenantId, actor, id) {
  return prisma.runWithTenant(tenantId, async () => { const scope = await actorScope(prisma, tenantId, actor); const row = await prisma.commercialQuotation.findFirst({ where: { id: Number(id), tenant_id: tenantId, ...scopeWhere(scope) }, include: { customer: true, advisor: true, visit: true, lines: { include: { product: true } }, sales_order: { include: { lines: true } } } }); if (!row) fail(404, "Cotizacion no encontrada dentro de tu alcance."); return row; });
}

async function createQuotation(tenantId, actor, input) {
  if (!input.customer_id) fail(400, "Crea y vincula el cliente antes de generar la cotizacion.");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => { const scope = await actorScope(tx, tenantId, actor); const customer = await tx.commercialCustomer.findFirst({ where: { id: input.customer_id, tenant_id: tenantId, ...scopeWhere(scope) } }); if (!customer) fail(404, "Cliente no encontrado dentro de tu alcance."); if (input.visit_id) { const visit = await tx.commercialVisit.findFirst({ where: { id: input.visit_id, tenant_id: tenantId, customer_id: customer.id, advisor_id: customer.advisor_id } }); if (!visit || visit.status !== "IN_PROGRESS") fail(409, "La cotizacion solo puede agregarse a una visita en curso."); }
    const ids = [...new Set(input.lines.map((line) => line.product_id))]; const products = await tx.commercialProduct.findMany({ where: { tenant_id: tenantId, id: { in: ids }, active: true }, include: { inventory_item: { select: { unit_price: true } } } }); if (products.length !== ids.length) fail(400, "Uno o mas productos no existen o estan inactivos."); const byId = new Map(products.map((item) => [item.id, item])); const totals = orderTotals(input.lines.map((line) => { const product = byId.get(line.product_id); return { ...line, unit_price: product.inventory_item ? Number(product.inventory_item.unit_price) : Number(product.unit_price) }; })); const settings = await settingsFor(tx, tenantId); const quotationDate = input.quotation_date ? new Date(input.quotation_date) : new Date(); const validityDays = input.validity_days || settings.default_quote_validity_days; const validUntil = new Date(quotationDate.getTime() + validityDays * 86400000); const count = await tx.commercialQuotation.count({ where: { tenant_id: tenantId } }); const created = await tx.commercialQuotation.create({ data: { tenant_id: tenantId, quotation_number: `COT-${String(count + 1).padStart(6, "0")}`, customer_id: customer.id, advisor_id: customer.advisor_id, visit_id: input.visit_id || null, quotation_date: quotationDate, valid_until: validUntil, subtotal: totals.subtotal, discount: totals.discount, total: totals.total, notes: input.notes || null, created_by: actor?.id || null, lines: { create: totals.lines.map((line) => { const product = byId.get(line.product_id); return { product_id: product.id, product_code: product.code, product_name: product.name, quantity: line.quantity, unit_price: line.unit_price, discount: line.discount, line_total: line.line_total }; }) } }, include: { lines: true, customer: true, advisor: true } }); await audit(tx, tenantId, actor, "CREATE", "CommercialQuotation", created.id, null, created); return created; }));
}

async function convertQuotationToOrder(tenantId, actor, id, input = {}) {
  const quotation = await getQuotation(tenantId, actor, id); if (quotation.sales_order) fail(409, `La cotizacion ya genero el pedido ${quotation.sales_order.order_number}.`); if (quotation.status !== "OPEN") fail(409, `No se puede convertir una cotizacion ${quotation.status}.`); const order = await createOrder(tenantId, actor, { customer_id: quotation.customer_id, visit_id: quotation.visit_id || undefined, quotation_id: quotation.id, notes: `Derivado de ${quotation.quotation_number}${quotation.notes ? ` - ${quotation.notes}` : ""}`, lines: require('./quotation-conversion').conversionLines(quotation.lines, input.lines) }); return order;
}

async function cancelQuotation(tenantId, actor, id, reason) {
  const justification = String(reason || "").trim();
  if (!justification || justification.length > 2000) fail(400, "Escribe el motivo de cancelacion (maximo 2000 caracteres).");
  return prisma.runWithTenant(tenantId, () => prisma.$transaction(async (tx) => {
    const scope = await actorScope(tx, tenantId, actor);
    const current = await tx.commercialQuotation.findFirst({ where: { id: Number(id), tenant_id: tenantId, ...scopeWhere(scope) } });
    if (!current) fail(404, "Cotizacion no encontrada dentro de tu alcance.");
    const notes = [current.notes, "Motivo de cancelacion: " + justification].filter(Boolean).join("\n");
    const result = await tx.commercialQuotation.updateMany({ where: { id: current.id, tenant_id: tenantId, status: "OPEN", sales_order: null }, data: { status: "CANCELLED", notes } });
    if (result.count !== 1) fail(409, "Solo se pueden cancelar cotizaciones abiertas sin pedido.");
    await audit(tx, tenantId, actor, "CANCEL", "CommercialQuotation", current.id, current, { status: "CANCELLED", cancellation_reason: justification });
    return { ...current, status: "CANCELLED", notes };
  }));
}

async function changeOrderStatus(tenantId, actor, id, status, reason) {
  const transitions = { REGISTERED: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["INVOICED", "CANCELLED"], INVOICED: [], CANCELLED: [] };
  return prisma.runWithTenant(tenantId, async () => prisma.$transaction(async (tx) => {
    const scope = await actorScope(tx, tenantId, actor);
    const current = await tx.commercialSalesOrder.findFirst({ where: { id: Number(id), tenant_id: tenantId, ...scopeWhere(scope) } });
    if (!current) fail(404, "Pedido no encontrado dentro de tu alcance.");
    if (!(transitions[current.status] || []).includes(status)) fail(409, `No se puede cambiar un pedido ${current.status} a ${status}.`);
    const justification = String(reason || "").trim();
    if (status === "CANCELLED" && !justification) fail(400, "El motivo de cancelacion es obligatorio.");
    const notes = status === "CANCELLED" ? [current.notes, `Motivo de cancelacion: ${justification}`].filter(Boolean).join("\n") : current.notes;
    const updated = await tx.commercialSalesOrder.update({ where: { id: current.id }, data: { status, notes } });
    if (status === "CONFIRMED" || status === "INVOICED") await tx.commercialCustomer.update({ where: { id: current.customer_id }, data: { last_purchase_at: current.order_date } });
    await audit(tx, tenantId, actor, status === "CANCELLED" ? "CANCEL" : "STATUS_CHANGE", "CommercialSalesOrder", current.id, current, status === "CANCELLED" ? { ...updated, cancellation_reason: justification } : updated); return updated;
  }));
}

async function customerOverview(tenantId, actor, customerId, periodId) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const customer = await prisma.commercialCustomer.findFirst({ where: { id: Number(customerId), tenant_id: tenantId, ...scopeWhere(scope) }, include: { advisor: true, visits: { include: { reason: true, result: true }, orderBy: { visit_date: "desc" }, take: 5 }, orders: { where: { status: { in: ["REGISTERED", "CONFIRMED", "INVOICED"] } }, include: { lines: true }, orderBy: { order_date: "desc" }, take: 5 }, commitments: { where: { status: "PENDING" }, orderBy: { due_date: "asc" } } } });
    if (!customer) fail(404, "Cliente no encontrado dentro de tu alcance.");
    customer.last_purchase_at = customer.orders[0]?.order_date || null;
    customer.last_purchase_status = customer.orders[0]?.status || null;
    const period = periodId ? await prisma.commercialPeriod.findFirst({ where: { id: Number(periodId), tenant_id: tenantId } }) : await prisma.commercialPeriod.findFirst({ where: { tenant_id: tenantId, status: "OPEN" }, orderBy: { start_date: "desc" } });
    const productFrequency = new Map();
    for (const order of customer.orders) for (const line of order.lines) { const current = productFrequency.get(line.product_id) || { product_id: line.product_id, code: line.product_code, name: line.product_name, quantity: 0, orders: 0 }; current.quantity += Number(line.quantity); current.orders += 1; productFrequency.set(line.product_id, current); }
    const suggested_products = [...productFrequency.values()].sort((a, b) => b.orders - a.orders || b.quantity - a.quantity).slice(0, 5);
    if (!period) return { customer, period: null, metrics: budgetMetrics({ budget: 0, sales: 0, progress: 0 }), suggested_products };
    const budget = await prisma.commercialCustomerBudget.findFirst({ where: { tenant_id: tenantId, period_id: period.id, customer_id: customer.id } });
    const sales = await new LocalOrderSalesSource(prisma).salesForCustomer(tenantId, customer.id, period);
    return { customer, period, metrics: budgetMetrics({ budget: budget?.budget_amount || 0, sales, progress: periodProgress(period) }), suggested_products };
  });
}

async function dashboard(tenantId, actor, periodId) {
  return prisma.runWithTenant(tenantId, async () => {
    const scope = await actorScope(prisma, tenantId, actor);
    const period = periodId ? await prisma.commercialPeriod.findFirst({ where: { id: Number(periodId), tenant_id: tenantId } }) : await prisma.commercialPeriod.findFirst({ where: { tenant_id: tenantId, status: "OPEN" }, orderBy: { start_date: "desc" } });
    const customers = await prisma.commercialCustomer.findMany({ where: { tenant_id: tenantId, status: "ACTIVE", ...scopeWhere(scope) }, select: { id: true } });
    if (!period) return { period: null, metrics: budgetMetrics({ budget: 0, sales: 0, progress: 0 }), customers: customers.length };
    const customerIds = customers.map((item) => item.id);
    const [advisorBudgets, customerBudgets, sales, visits, orders] = await Promise.all([
      prisma.commercialAdvisorBudget.aggregate({ where: { tenant_id: tenantId, period_id: period.id, ...(scope.kind === "admin" ? {} : { advisor_id: { in: scope.advisorIds } }) }, _sum: { budget_amount: true } }),
      prisma.commercialCustomerBudget.aggregate({ where: { tenant_id: tenantId, period_id: period.id, customer_id: { in: customerIds } }, _sum: { budget_amount: true } }),
      prisma.commercialSalesOrder.aggregate({ where: { tenant_id: tenantId, customer_id: { in: customerIds }, status: { in: ["CONFIRMED", "INVOICED"] }, order_date: { gte: period.start_date, lte: period.end_date } }, _sum: { total: true } }),
      prisma.commercialVisit.count({ where: { tenant_id: tenantId, customer_id: { in: customerIds }, status: "COMPLETED", visit_date: { gte: period.start_date, lte: period.end_date } } }),
      prisma.commercialSalesOrder.count({ where: { tenant_id: tenantId, customer_id: { in: customerIds }, order_date: { gte: period.start_date, lte: period.end_date } } })
    ]);
    const advisorBudget = Number(advisorBudgets._sum.budget_amount || 0);
    const allocatedBudget = Number(customerBudgets._sum.budget_amount || 0);
    return { period, metrics: budgetMetrics({ budget: advisorBudget || allocatedBudget, sales: sales._sum.total || 0, progress: periodProgress(period) }), allocated_budget: allocatedBudget, allocation_warning: advisorBudget > 0 && advisorBudget !== allocatedBudget, customers: customers.length, visits, orders, conversion: visits ? orders / visits : 0 };
  });
}

module.exports = { accessContext, quotationComparisonReport, advisorReport, myDay, checkVisitAvailability, listAdvisors, createAdvisor, updateAdvisor, listZones, createZone, updateZone, listCustomerCategories, createCustomerCategory, updateCustomerCategory, listVisitReasons, createVisitReason, updateVisitReason, listVisitResults, createVisitResult, updateVisitResult, getSettings, updateSettings, listCustomers, createCustomer, updateCustomer, listCommitments, createCommitment, changeCommitmentStatus, listProducts, createProduct, updateProduct, importProducts, listPeriods, createPeriod, upsertAdvisorBudget, upsertCustomerBudget, listBudgets, createVisit, listVisits, visitTimeline, createVisitCustomer, startVisit, completeVisit, rescheduleVisit, visitReport, listQuotations, getQuotation, createQuotation, convertQuotationToOrder, cancelQuotation, listOrders, getOrder, createOrder, changeOrderStatus, customerOverview, dashboard };
