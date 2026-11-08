// Solicitudes publicas de Servicios.
//
// La empresa destino NO la elige el cliente: sale de APEXOS_PUBLIC_SERVICE_COMPANY_ID,
// una allowlist de servidor. El formulario publico es anonimo, asi que todo lo que viaje
// en el body (company_id, company_name, empresa) se ignora por construccion. El tenant se
// cierra con runWithTenant y el catalogo solo publica los campos que la vitrina dibuja:
// nunca costo, stock, tenant_id ni rutas internas.
const { randomUUID } = require("node:crypto");
const prisma = require("../../core/prisma");
const { normalizeServiceTypes, normalizeServiceStores, serviceTypeCode } = require("./service");

const SERVICE_TYPES_REFERENCE_CODE = "__SERVICE_TYPES__";
const MAX_ITEMS = 20;
const PUBLIC_TENANT_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

function appError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicTenantId() {
  const value = String(process.env.APEXOS_PUBLIC_SERVICE_COMPANY_ID || "").trim();
  if (!value || !PUBLIC_TENANT_PATTERN.test(value)) {
    throw appError(
      503,
      "EMPRESA_PUBLICA_NO_CONFIGURADA",
      "El formulario publico no tiene empresa configurada (APEXOS_PUBLIC_SERVICE_COMPANY_ID)."
    );
  }
  return value;
}

function tenantServices(tenant) {
  const config = tenant?.config && typeof tenant.config === "object" ? tenant.config : {};
  const services = config.services && typeof config.services === "object" ? config.services : {};
  return {
    serviceTypes: normalizeServiceTypes(services.service_types).filter((item) => item.active),
    serviceStores: normalizeServiceStores(services.service_stores).filter((item) => item.active)
  };
}

async function activeTenant(tenantId) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, active: true },
    select: { id: true, config: true }
  });
  if (!tenant) {
    throw appError(404, "EMPRESA_PUBLICA_NO_ENCONTRADA", "La empresa del formulario publico no esta activa.");
  }
  return tenant;
}

async function publicCatalog() {
  const tenantId = publicTenantId();
  return prisma.runWithTenant(tenantId, async () => {
    const tenant = await activeTenant(tenantId);
    const references = await prisma.serviceReference.findMany({
      where: { tenant_id: tenant.id, active: true, code: { not: SERVICE_TYPES_REFERENCE_CODE } },
      select: { id: true, code: true, name: true, category: true, brand: true, model: true },
      orderBy: { code: "asc" },
      take: 500
    });
    const { serviceTypes, serviceStores } = tenantServices(tenant);
    return {
      ok: true,
      company_id: tenant.id,
      references: references.map((row) => ({ ...row, id: String(row.id), company_id: tenant.id })),
      service_types: serviceTypes,
      service_stores: serviceStores
    };
  });
}

function validatePublicOrderInput(input) {
  const requestedItems = Array.isArray(input.items) && input.items.length
    ? input.items
    : [{ reference_id: input.reference_id, service_type: input.service_type, quantity: 1, observation: input.notes }];
  if (requestedItems.length > MAX_ITEMS) {
    throw appError(400, "SOLICITUDES_EXCEDIDAS", `Una orden admite maximo ${MAX_ITEMS} solicitudes.`);
  }
  requestedItems.forEach((item, index) => {
    if (!clean(item.reference_id) || !clean(item.service_type) || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      throw appError(400, "SOLICITUD_INCOMPLETA", `Completa referencia, servicio y cantidad de la solicitud ${index + 1}.`);
    }
  });
  const required = [
    ["customer_name", "nombre completo"],
    ["customer_document", "cedula"],
    ["customer_phone", "telefono"],
    ["customer_phone_secondary", "telefono alterno"],
    ["customer_address", "direccion"],
    ["customer_neighborhood", "barrio"],
    ["service_store", "almacen"]
  ];
  const missing = required.filter(([key]) => !clean(input[key])).map(([, label]) => label);
  if (missing.length) throw appError(400, "CAMPOS_OBLIGATORIOS", `Completa los campos obligatorios: ${missing.join(", ")}.`);
  if (!/^\d{5,12}$/.test(clean(input.customer_document))) {
    throw appError(400, "CEDULA_INVALIDA", "La cedula debe contener entre 5 y 12 numeros.");
  }
  if (!/^[0-9+()\-\s]{7,20}$/.test(clean(input.customer_phone))) {
    throw appError(400, "TELEFONO_INVALIDO", "Registra un telefono valido para confirmar la visita.");
  }
  if (!/^[0-9+()\-\s]{7,20}$/.test(clean(input.customer_phone_secondary))) {
    throw appError(400, "TELEFONO_INVALIDO", "Registra un telefono alterno valido para confirmar la visita.");
  }
  if (clean(input.customer_phone).replace(/\D/g, "") === clean(input.customer_phone_secondary).replace(/\D/g, "")) {
    throw appError(400, "TELEFONOS_IGUALES", "Los dos telefonos de contacto deben ser diferentes.");
  }
  return requestedItems;
}

async function createPublicOrder(input = {}) {
  const tenantId = publicTenantId();
  const requestedItems = validatePublicOrderInput(input);
  return prisma.runWithTenant(tenantId, async () => {
    const tenant = await activeTenant(tenantId);
    const referenceIds = [...new Set(requestedItems.map((item) => Number(item.reference_id)))];
    if (referenceIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      throw appError(400, "REFERENCIA_INVALIDA", "Selecciona referencias validas para esta empresa.");
    }
    const references = await prisma.serviceReference.findMany({
      where: { tenant_id: tenant.id, id: { in: referenceIds }, active: true },
      select: { id: true }
    });
    if (references.length !== referenceIds.length) {
      throw appError(400, "REFERENCIA_INVALIDA", "Una o mas referencias no estan activas para esta empresa.");
    }
    const { serviceTypes, serviceStores } = tenantServices(tenant);
    const store = serviceStores.find((item) => item.code === serviceTypeCode(clean(input.service_store)));
    if (!store) {
      throw appError(400, "ALMACEN_INVALIDO", "Selecciona un almacen activo para esta empresa.");
    }
    const normalizedItems = requestedItems.map((item, index) => {
      const type = serviceTypeCode(item.service_type);
      if (!serviceTypes.some((candidate) => candidate.code === type)) {
        throw appError(400, "TIPO_SERVICIO_INVALIDO", "Selecciona tipos de servicio activos para esta empresa.");
      }
      return {
        tenant_id: tenant.id,
        reference_id: Number(item.reference_id),
        service_type: type,
        quantity: Number(item.quantity),
        observation: clean(item.observation),
        display_order: index,
        idempotency_key: `public-${randomUUID()}-${index}`
      };
    });
    const count = await prisma.serviceOrder.count({ where: { tenant_id: tenant.id } });
    const order = await prisma.serviceOrder.create({
      data: {
        tenant_id: tenant.id,
        number: `SOL-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`,
        reference_id: normalizedItems[0].reference_id,
        service_type: normalizedItems[0].service_type,
        status: "agendado",
        customer_name: clean(input.customer_name),
        customer_address: clean(input.customer_address),
        customer_phone: clean(input.customer_phone),
        invoice_number: clean(input.invoice_number),
        notes: clean(input.notes) || "Solicitud creada por formulario publico.",
        metadata: {
          created_from: "public_service_request",
          public_request: true,
          requires_admin_completion: true,
          customer_document: clean(input.customer_document),
          customer_phone_secondary: clean(input.customer_phone_secondary),
          customer_email: clean(input.customer_email),
          customer_neighborhood: clean(input.customer_neighborhood),
          service_store: store.code,
          service_store_label: store.label,
          received_at: new Date().toISOString(),
          request_count: normalizedItems.length
        },
        items: { create: normalizedItems }
      },
      select: { id: true, number: true }
    });
    return { ok: true, order };
  });
}

module.exports = { publicCatalog, createPublicOrder };
