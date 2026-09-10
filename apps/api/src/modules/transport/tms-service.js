const basePrisma = require("../../core/prisma");

const { AsyncLocalStorage } = require("node:async_hooks");

const mutationContext = new AsyncLocalStorage();

const prisma = new Proxy(basePrisma, { get(target, key) {

  const source = key === "runWithTenant" ? target : (mutationContext.getStore() || target);

  const value = source[key]; return typeof value === "function" ? value.bind(source) : value;

} });

function atomicMutation(fn) {

  return async (tenantId, ...args) => {

    if (!tenantId) throw appError(401, "TMS_TENANT_REQUIRED", "Empresa requerida.");

    if (mutationContext.getStore()) return fn(tenantId, ...args);

    return basePrisma.runWithTenant(tenantId, () => basePrisma.$transaction(async (tx) => {

      // Serialize transport mutations within one tenant; unrelated tenants stay independent.

      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `transport:${tenantId}`);

      return mutationContext.run(tx, () => fn(tenantId, ...args));

    }, { maxWait: 10000, timeout: 20000 }));

  };

}

const { point, lineString, distance: turfDistance, buffer: turfBuffer, booleanPointInPolygon, pointToLineDistance } = require("@turf/turf");



const TRIP_TRANSITIONS = Object.freeze({

  borrador: ["planificado", "cancelado"],

  planificado: ["ofertado", "asignado", "cancelado"],

  ofertado: ["asignado", "cancelado"],

  asignado: ["en_cargue", "cancelado"],

  en_cargue: ["despachado", "cancelado"],

  despachado: ["en_transito"],

  en_transito: ["entregado"],

  entregado: ["cerrado"],

  cerrado: [],

  cancelado: []

});



const ATTEMPT_RESULTS = new Set(["completa", "parcial", "rechazada", "cliente_cerrado", "direccion_incorrecta", "averia"]);

const TERMINAL_STOP_RESULTS = new Set(["completa", "parcial"]);

const NOVELTY_RESULTS = new Set(["rechazada", "cliente_cerrado", "direccion_incorrecta", "averia"]);

const SAFE_EVIDENCE_REFERENCE = /^(service-images|tms-evidence)\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp)$/i;



function appError(statusCode, code, message, details) {

  const error = new Error(message);

  error.statusCode = statusCode;

  error.code = code;

  if (details) error.details = details;

  return error;

}



function normalizedCode(value) {

  return String(value || "").trim().toUpperCase().replace(/\s+/g, "-");

}



function dateValue(value, label, required = false) {

  if (!value) {

    if (required) throw appError(400, "TMS_DATE_REQUIRED", `${label} es obligatorio.`);

    return null;

  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) throw appError(400, "TMS_INVALID_DATE", `${label} no es una fecha valida.`);

  return date;

}



function numberValue(value, fallback = 0) {

  const number = Number(value ?? fallback);

  return Number.isFinite(number) ? number : fallback;

}



function assertCoordinatePair(latitude, longitude) {

  const onlyOne = (latitude === null || latitude === undefined) !== (longitude === null || longitude === undefined);

  if (onlyOne) throw appError(400, "TMS_COORDINATE_PAIR_REQUIRED", "Latitud y longitud deben registrarse juntas.");

  if (latitude !== null && latitude !== undefined && (Number(latitude) < -90 || Number(latitude) > 90)) throw appError(400, "TMS_INVALID_LATITUDE", "Latitud fuera de rango.");

  if (longitude !== null && longitude !== undefined && (Number(longitude) < -180 || Number(longitude) > 180)) throw appError(400, "TMS_INVALID_LONGITUDE", "Longitud fuera de rango.");

}



function assertTripTransition(current, next) {

  if (!TRIP_TRANSITIONS[current]?.includes(next)) {

    throw appError(409, "TMS_INVALID_TRIP_TRANSITION", `No se permite cambiar el viaje de ${current} a ${next}.`, { current, next });

  }

}



function carrierData(input) {

  return {

    code: normalizedCode(input.code), legal_name: String(input.legal_name || "").trim(), trade_name: input.trade_name || null,

    tax_id: input.tax_id || null, supplier_id: input.supplier_id || null, phone: input.phone || null, email: input.email || null,

    status: input.status || "activo", service_levels: input.service_levels || [], operating_zones: input.operating_zones || [],

    vehicle_types: input.vehicle_types || [], score: numberValue(input.score), metadata: input.metadata || {}, active: input.status !== "inactivo"

  };

}



function driverData(input) {

  return {

    code: normalizedCode(input.code), document: String(input.document || "").trim(), name: String(input.name || "").trim(), phone: input.phone || null,

    employee_id: input.employee_id || null, carrier_id: input.carrier_id || null, license_number: input.license_number || null,

    license_category: input.license_category || null, license_expires_at: dateValue(input.license_expires_at, "Vencimiento de licencia"),

    certifications: input.certifications || [], status: input.status || "disponible", metadata: input.metadata || {}, active: input.status !== "inactivo"

  };

}



function deliveryPointData(input) {

  assertCoordinatePair(input.latitude, input.longitude);

  return {

    code: normalizedCode(input.code), name: String(input.name || "").trim(), customer_party_id: input.customer_party_id || null,

    commercial_customer_id: input.commercial_customer_id || null, address: String(input.address || "").trim(), city: String(input.city || "").trim(),

    department: input.department || null, country: input.country || "CO", latitude: input.latitude ?? null, longitude: input.longitude ?? null,

    timezone: input.timezone || "America/Bogota", window_start: input.window_start || null, window_end: input.window_end || null,

    receiving_days: input.receiving_days || [], service_minutes: numberValue(input.service_minutes, 30), access_restrictions: input.access_restrictions || null,

    appointment_required: input.appointment_required === true, geofence_radius_m: numberValue(input.geofence_radius_m, 150),

    instructions: input.instructions || null, metadata: input.metadata || {}, active: input.active !== false

  };

}



function originData(input) {

  assertCoordinatePair(input.latitude, input.longitude);

  return {

    code: normalizedCode(input.code), name: String(input.name || "").trim(), address: String(input.address || "").trim(),

    city: String(input.city || "").trim(), department: input.department || null, country: input.country || "CO",

    latitude: numberValue(input.latitude), longitude: numberValue(input.longitude), timezone: input.timezone || "America/Bogota",

    operation_start: input.operation_start || null, operation_end: input.operation_end || null,

    service_minutes: numberValue(input.service_minutes, 60), metadata: input.metadata || {}, active: input.active !== false

  };

}



function rateCardData(input) {

  const validFrom = dateValue(input.valid_from, "Vigencia inicial", true);

  const validTo = dateValue(input.valid_to, "Vigencia final", true);

  if (validTo < validFrom) throw appError(400, "TMS_INVALID_RATE_VALIDITY", "La vigencia final no puede ser anterior a la inicial.");

  return {

    code: normalizedCode(input.code), name: String(input.name || "").trim(), carrier_id: input.carrier_id || null,

    origin_id: input.origin_id || null, destination_city: input.destination_city?.trim() || null,

    destination_department: input.destination_department?.trim() || null, service_level: input.service_level?.trim() || null,

    vehicle_type: input.vehicle_type?.trim() || null, valid_from: validFrom, valid_to: validTo, currency: input.currency || "COP",

    base_rate: numberValue(input.base_rate), minimum_charge: numberValue(input.minimum_charge), price_per_km: numberValue(input.price_per_km),

    price_per_kg: numberValue(input.price_per_kg), price_per_m3: numberValue(input.price_per_m3), price_per_stop: numberValue(input.price_per_stop),

    fuel_surcharge_pct: numberValue(input.fuel_surcharge_pct), tolls_flat: numberValue(input.tolls_flat), priority: numberValue(input.priority, 100),

    metadata: input.metadata || {}, active: input.active !== false

  };

}



function normalizedMatch(value) {

  return String(value || "").trim().toLocaleLowerCase("es-CO");

}



function haversineKm(a, b) {

  const radians = (degrees) => degrees * Math.PI / 180;

  const earthRadiusKm = 6371;

  const latitudeDelta = radians(Number(b.latitude) - Number(a.latitude));

  const longitudeDelta = radians(Number(b.longitude) - Number(a.longitude));

  const value = Math.sin(latitudeDelta / 2) ** 2

    + Math.cos(radians(Number(a.latitude))) * Math.cos(radians(Number(b.latitude))) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));

}



function optimizeStopOrder(origin, needs, options = {}) {

  const roadFactor = Math.min(Math.max(numberValue(options.road_factor, 1.22), 1), 2);

  const pending = [...needs];

  const ordered = [];

  const legs = [];

  let current = { latitude: origin.latitude, longitude: origin.longitude, label: origin.name, type: "origin" };

  let distanceKm = 0;

  while (pending.length) {

    pending.sort((left, right) => haversineKm(current, left.delivery_point) - haversineKm(current, right.delivery_point));

    const next = pending.shift();

    const directKm = haversineKm(current, next.delivery_point);

    const legKm = directKm * roadFactor;

    ordered.push(next);

    legs.push({

      sequence: ordered.length, from: current.label, to: next.delivery_point.name,

      need_id: next.id, distance_km: Number(legKm.toFixed(2)),

      from_coordinate: { latitude: Number(current.latitude), longitude: Number(current.longitude) },

      to_coordinate: { latitude: Number(next.delivery_point.latitude), longitude: Number(next.delivery_point.longitude) }

    });

    distanceKm += legKm;

    current = { latitude: next.delivery_point.latitude, longitude: next.delivery_point.longitude, label: next.delivery_point.name, type: "stop" };

  }

  if (options.return_to_origin === true && ordered.length) {

    const returnKm = haversineKm(current, origin) * roadFactor;

    legs.push({

      sequence: legs.length + 1, from: current.label, to: origin.name, need_id: null, distance_km: Number(returnKm.toFixed(2)),

      from_coordinate: { latitude: Number(current.latitude), longitude: Number(current.longitude) },

      to_coordinate: { latitude: Number(origin.latitude), longitude: Number(origin.longitude) }

    });

    distanceKm += returnKm;

  }

  return { ordered, legs, distance_km: Number(distanceKm.toFixed(2)), road_factor: roadFactor };

}



function calculateRateQuote(rateCard, metrics) {

  const components = {

    base: numberValue(rateCard.base_rate),

    distance: numberValue(rateCard.price_per_km) * metrics.distance_km,

    weight: numberValue(rateCard.price_per_kg) * metrics.weight_kg,

    volume: numberValue(rateCard.price_per_m3) * metrics.volume_m3,

    stops: numberValue(rateCard.price_per_stop) * metrics.stop_count,

    tolls: numberValue(rateCard.tolls_flat)

  };

  const beforeFuel = Object.values(components).reduce((sum, value) => sum + value, 0);

  const fuel = beforeFuel * numberValue(rateCard.fuel_surcharge_pct) / 100;

  const calculated = beforeFuel + fuel;

  const total = Math.max(calculated, numberValue(rateCard.minimum_charge));

  return {

    rate_card_id: rateCard.id, rate_code: rateCard.code, rate_version: rateCard.version, carrier_id: rateCard.carrier_id,

    carrier_name: rateCard.carrier?.legal_name || "Flota propia", currency: rateCard.currency,

    components: Object.fromEntries(Object.entries({ ...components, fuel }).map(([key, value]) => [key, Number(value.toFixed(2))])),

    minimum_applied: total > calculated, total: Number(total.toFixed(2)), carrier_score: numberValue(rateCard.carrier?.score), priority: rateCard.priority

  };

}



async function listCarriers(tenantId, query = {}) {

  return prisma.runWithTenant(tenantId, () => prisma.transportCarrier.findMany({

    where: { ...(query.status ? { status: query.status } : {}), ...(query.include_inactive === "true" ? { __includeInactive: true } : {}) },

    orderBy: { legal_name: "asc" }, take: Math.min(numberValue(query.limit, 100), 200)

  }));

}



async function saveCarrier(tenantId, id, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const data = carrierData(input);

    if (!data.code || !data.legal_name) throw appError(400, "TMS_CARRIER_REQUIRED", "Codigo y razon social son obligatorios.");

    if (id) {

      await prisma.transportCarrier.findFirstOrThrow({ where: { id: Number(id) } });

      return prisma.transportCarrier.update({ where: { id: Number(id) }, data });

    }

    return prisma.transportCarrier.create({ data });

  });

}



async function listDrivers(tenantId, query = {}) {

  return prisma.runWithTenant(tenantId, () => prisma.transportDriver.findMany({

    where: { ...(query.status ? { status: query.status } : {}), ...(query.carrier_id ? { carrier_id: Number(query.carrier_id) } : {}), ...(query.include_inactive === "true" ? { __includeInactive: true } : {}) },

    include: { carrier: true }, orderBy: { name: "asc" }, take: Math.min(numberValue(query.limit, 100), 200)

  }));

}



async function saveDriver(tenantId, id, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const data = driverData(input);

    if (!data.code || !data.document || !data.name) throw appError(400, "TMS_DRIVER_REQUIRED", "Codigo, documento y nombre son obligatorios.");

    if (data.carrier_id) await prisma.transportCarrier.findFirstOrThrow({ where: { id: data.carrier_id } });

    if (id) {

      await prisma.transportDriver.findFirstOrThrow({ where: { id: Number(id) } });

      return prisma.transportDriver.update({ where: { id: Number(id) }, data });

    }

    return prisma.transportDriver.create({ data });

  });

}



async function listDeliveryPoints(tenantId, query = {}) {

  return prisma.runWithTenant(tenantId, () => prisma.transportDeliveryPoint.findMany({

    where: { ...(query.city ? { city: { contains: query.city, mode: "insensitive" } } : {}), ...(query.customer_party_id ? { customer_party_id: Number(query.customer_party_id) } : {}), ...(query.include_inactive === "true" ? { __includeInactive: true } : {}) },

    orderBy: [{ city: "asc" }, { name: "asc" }], take: Math.min(numberValue(query.limit, 100), 200)

  }));

}



async function saveDeliveryPoint(tenantId, id, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const data = deliveryPointData(input);

    if (!data.code || !data.name || !data.address || !data.city) throw appError(400, "TMS_DELIVERY_POINT_REQUIRED", "Codigo, nombre, direccion y ciudad son obligatorios.");

    if (id) {

      await prisma.transportDeliveryPoint.findFirstOrThrow({ where: { id: Number(id) } });

      return prisma.transportDeliveryPoint.update({ where: { id: Number(id) }, data });

    }

    return prisma.transportDeliveryPoint.create({ data });

  });

}



async function listOrigins(tenantId, query = {}) {

  return prisma.runWithTenant(tenantId, () => prisma.transportOrigin.findMany({

    where: { ...(query.city ? { city: { contains: query.city, mode: "insensitive" } } : {}), ...(query.include_inactive === "true" ? { __includeInactive: true } : {}) },

    orderBy: [{ city: "asc" }, { name: "asc" }], take: Math.min(numberValue(query.limit, 100), 200)

  }));

}



async function saveOrigin(tenantId, id, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const data = originData(input);

    if (!data.code || !data.name || !data.address || !data.city) throw appError(400, "TMS_ORIGIN_REQUIRED", "Codigo, nombre, direccion y ciudad son obligatorios.");

    if (id) {

      await prisma.transportOrigin.findFirstOrThrow({ where: { id: Number(id) } });

      return prisma.transportOrigin.update({ where: { id: Number(id) }, data });

    }

    return prisma.transportOrigin.create({ data });

  });

}



async function listRateCards(tenantId, query = {}) {

  return prisma.runWithTenant(tenantId, () => prisma.transportRateCard.findMany({

    where: {

      ...(query.status ? { status: query.status } : {}), ...(query.carrier_id ? { carrier_id: Number(query.carrier_id) } : {}),

      ...(query.origin_id ? { origin_id: Number(query.origin_id) } : {}), ...(query.include_inactive === "true" ? { __includeInactive: true } : {})

    },

    include: { carrier: true, origin: true }, orderBy: [{ code: "asc" }, { version: "desc" }], take: Math.min(numberValue(query.limit, 200), 500)

  }));

}



async function activateRateCard(tenantId, id) {

  return prisma.runWithTenant(tenantId, async () => {

    const rate = await prisma.transportRateCard.findFirstOrThrow({ where: { id: Number(id) }, include: { carrier: true, origin: true } });

    if (rate.valid_to < new Date()) throw appError(409, "TMS_RATE_EXPIRED", "No se puede activar un tarifario vencido.");

    await prisma.transportRateCard.updateMany({ where: { tenant_id: String(tenantId), code: rate.code, id: { not: rate.id } }, data: { status: "inactiva", active: false } });

    return prisma.transportRateCard.update({ where: { id: rate.id }, data: { status: "activa", active: true }, include: { carrier: true, origin: true } });

  });

}



async function deactivateRateCard(tenantId, id) {

  return prisma.runWithTenant(tenantId, async () => {

    const rate = await prisma.transportRateCard.findFirstOrThrow({ where: { id: Number(id) } });

    return prisma.transportRateCard.update({ where: { id: rate.id }, data: { status: "inactiva", active: false } });

  });

}



async function saveRateCard(tenantId, user, id, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const data = rateCardData(input);

    if (!data.code || !data.name) throw appError(400, "TMS_RATE_REQUIRED", "Codigo y nombre del tarifario son obligatorios.");

    if (data.carrier_id) await prisma.transportCarrier.findFirstOrThrow({ where: { id: Number(data.carrier_id) } });

    if (data.origin_id) await prisma.transportOrigin.findFirstOrThrow({ where: { id: Number(data.origin_id) } });

    let rate;

    if (id) {

      const current = await prisma.transportRateCard.findFirstOrThrow({ where: { id: Number(id) } });

      if (current.status !== "borrador") throw appError(409, "TMS_RATE_IMMUTABLE", "Un tarifario publicado no se edita; crea una nueva version.");

      rate = await prisma.transportRateCard.update({ where: { id: current.id }, data, include: { carrier: true, origin: true } });

    } else {

      const latest = await prisma.transportRateCard.aggregate({ where: { code: data.code }, _max: { version: true } });

      rate = await prisma.transportRateCard.create({ data: { ...data, version: numberValue(latest._max.version, 0) + 1, status: "borrador", created_by: user?.id || null }, include: { carrier: true, origin: true } });

    }

    return input.status === "activa" ? activateRateCard(tenantId, rate.id) : rate;

  });

}



async function versionRateCard(tenantId, user, id, input = {}) {

  return prisma.runWithTenant(tenantId, async () => {

    const source = await prisma.transportRateCard.findFirstOrThrow({ where: { id: Number(id), __includeInactive: true }, include: { carrier: true, origin: true } });

    const merged = {

      ...source, ...input, code: source.code, valid_from: input.valid_from || source.valid_from, valid_to: input.valid_to || source.valid_to,

      active: true, metadata: { ...(source.metadata || {}), ...(input.metadata || {}), versioned_from_id: source.id }

    };

    return saveRateCard(tenantId, user, null, merged);

  });

}



function needValidationErrors(input, point) {

  const errors = [];

  if (numberValue(input.weight_kg) <= 0) errors.push("peso_faltante");

  if (numberValue(input.volume_m3) <= 0) errors.push("volumen_faltante");

  if (point.latitude === null || point.longitude === null) errors.push("coordenadas_destino_faltantes");

  if (!point.window_start || !point.window_end) errors.push("ventana_entrega_faltante");

  return errors;

}



async function createNeed(tenantId, user, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const availableAt = dateValue(input.available_at, "Fecha disponible", true);

    const dueAt = dateValue(input.due_at, "Fecha limite", true);

    if (dueAt < availableAt) throw appError(400, "TMS_INVALID_NEED_WINDOW", "La fecha limite no puede ser anterior a la fecha disponible.");

    const point = await prisma.transportDeliveryPoint.findFirstOrThrow({ where: { id: Number(input.delivery_point_id) } });

    const origin = input.origin_id ? await prisma.transportOrigin.findFirstOrThrow({ where: { id: Number(input.origin_id) } }) : null;

    const validationErrors = needValidationErrors(input, point);

    const lines = Array.isArray(input.lines) ? input.lines : [];

    if (new Set(lines.map(line => String(line.sku))).size !== lines.length || lines.some(line => !String(line.sku || "").trim() || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0)) throw appError(400, "TMS_INVALID_ORDER_LINES", "Cada SKU debe ser único y tener cantidad positiva.");

    return prisma.transportNeed.create({

      data: {

        code: normalizedCode(input.code), source_type: input.source_type, source_id: input.source_id || null, source_reference: input.source_reference || null,

        sales_order_id: input.sales_order_id || null, origin_place_id: input.origin_place_id || null, origin_id: origin?.id || null, origin_name: origin?.name || input.origin_name,

        delivery_point_id: point.id, available_at: availableAt, due_at: dueAt, priority: input.priority || "normal", service_level: input.service_level || "normal",

        weight_kg: numberValue(input.weight_kg), volume_m3: numberValue(input.volume_m3), pallets: numberValue(input.pallets), packages: numberValue(input.packages),

        temperature_min_c: input.temperature_min_c ?? null, temperature_max_c: input.temperature_max_c ?? null, required_vehicle_type: input.required_vehicle_type || null,

        cargo_value: numberValue(input.cargo_value), customer_freight: numberValue(input.customer_freight), currency: input.currency || "COP",

        status: validationErrors.length ? "incompleta" : "pendiente", validation_errors: validationErrors, metadata: input.metadata || {}, created_by: user?.id || null,

        lines: { create: lines.map((line) => ({ tenant_id: String(tenantId), item_id: line.item_id || null, sku: String(line.sku || "").trim(), description: line.description || null, quantity: numberValue(line.quantity), unit: line.unit || "UND", weight_kg: numberValue(line.weight_kg), volume_m3: numberValue(line.volume_m3), pallets: numberValue(line.pallets), metadata: line.metadata || {} })) }

      }, include: { delivery_point: true, lines: true }

    });

  });

}



async function listNeeds(tenantId, query = {}) {

  return prisma.runWithTenant(tenantId, () => prisma.transportNeed.findMany({

    where: { ...(query.status ? { status: query.status } : {}), ...(query.due_from || query.due_to ? { due_at: { ...(query.due_from ? { gte: dateValue(query.due_from, "Desde") } : {}), ...(query.due_to ? { lte: dateValue(query.due_to, "Hasta") } : {}) } } : {}) },

    include: { delivery_point: true, lines: true, trip_links: { include: { trip: true } } }, orderBy: [{ due_at: "asc" }, { priority: "asc" }], take: Math.min(numberValue(query.limit, 100), 200)

  }));

}



async function getPlanningWorkbench(tenantId) {

  return prisma.runWithTenant(tenantId, async () => {

    const needs = await prisma.transportNeed.findMany({

      where: { status: "pendiente" }, include: { origin: true, delivery_point: true }, orderBy: [{ due_at: "asc" }, { priority: "asc" }]

    });

    const grouped = new Map();

    for (const need of needs) {

      const day = need.due_at.toISOString().slice(0, 10);

      const key = `${need.origin_id || "sin-origen"}|${need.service_level}|${need.required_vehicle_type || "cualquiera"}|${day}`;

      const group = grouped.get(key) || {

        key, origin_id: need.origin_id, origin: need.origin, service_level: need.service_level,

        required_vehicle_type: need.required_vehicle_type, due_date: day, need_ids: [], needs: [],

        total_weight_kg: 0, total_volume_m3: 0, total_pallets: 0

      };

      group.need_ids.push(need.id);

      group.needs.push(need);

      group.total_weight_kg += numberValue(need.weight_kg);

      group.total_volume_m3 += numberValue(need.volume_m3);

      group.total_pallets += numberValue(need.pallets);

      grouped.set(key, group);

    }

    return { pending_needs: needs.length, consolidation_groups: [...grouped.values()] };

  });

}



function rateApplies(rate, context) {

  const cities = new Set(context.needs.map((need) => normalizedMatch(need.delivery_point.city)));

  const departments = new Set(context.needs.map((need) => normalizedMatch(need.delivery_point.department)));

  return (!rate.origin_id || rate.origin_id === context.origin.id)

    && (!rate.destination_city || (cities.size === 1 && cities.has(normalizedMatch(rate.destination_city))))

    && (!rate.destination_department || (departments.size === 1 && departments.has(normalizedMatch(rate.destination_department))))

    && (!rate.service_level || normalizedMatch(rate.service_level) === normalizedMatch(context.service_level))

    && (!rate.vehicle_type || normalizedMatch(rate.vehicle_type) === normalizedMatch(context.vehicle_type));

}



async function evaluatePlan(tenantId, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const origin = await prisma.transportOrigin.findFirstOrThrow({ where: { id: Number(input.origin_id) } });

    const needIds = input.need_ids.map(Number);

    const foundNeeds = await prisma.transportNeed.findMany({ where: { id: { in: needIds } }, include: { delivery_point: true } });

    if (foundNeeds.length !== needIds.length) throw appError(404, "TMS_NEEDS_NOT_FOUND", "Una o mas necesidades no existen en la empresa activa.");

    if (foundNeeds.some((need) => need.status !== "pendiente")) throw appError(409, "TMS_NEEDS_NOT_PLANNABLE", "El planeador solo recibe necesidades completas y pendientes.");

    if (foundNeeds.some((need) => need.origin_id && need.origin_id !== origin.id)) throw appError(409, "TMS_INCOMPATIBLE_ORIGIN", "Las necesidades seleccionadas no pertenecen al mismo origen.");

    if (foundNeeds.some((need) => need.delivery_point.latitude === null || need.delivery_point.longitude === null)) throw appError(409, "TMS_DESTINATION_COORDINATES_REQUIRED", "Todos los destinos necesitan coordenadas para optimizar la ruta.");

    const config = await getTmsConfig(tenantId);

    const route = optimizeStopOrder(origin, foundNeeds, { road_factor: config.road_factor, ...input });

    const totals = {

      weight_kg: foundNeeds.reduce((sum, need) => sum + numberValue(need.weight_kg), 0),

      volume_m3: foundNeeds.reduce((sum, need) => sum + numberValue(need.volume_m3), 0),

      pallets: foundNeeds.reduce((sum, need) => sum + numberValue(need.pallets), 0),

      stop_count: foundNeeds.length,

      distance_km: route.distance_km

    };

    const vehicle = input.vehicle_id ? await prisma.vehicle.findFirstOrThrow({ where: { id: Number(input.vehicle_id) } }) : null;

    const capacityKg = vehicle ? vehicleCapacityKg(vehicle) : 0;

    const capacity = {

      vehicle_id: vehicle?.id || null, plate: vehicle?.plate || null,

      weight_capacity_kg: capacityKg, volume_capacity_m3: numberValue(vehicle?.volume_available),

      weight_feasible: !vehicle || capacityKg <= 0 || totals.weight_kg <= capacityKg,

      volume_feasible: !vehicle || numberValue(vehicle.volume_available) <= 0 || totals.volume_m3 <= numberValue(vehicle.volume_available)

    };

    capacity.feasible = capacity.weight_feasible && capacity.volume_feasible;

    const averageSpeed = numberValue(input.average_speed_kmh, 45);

    const serviceMinutes = foundNeeds.reduce((sum, need) => sum + numberValue(need.delivery_point.service_minutes, 30), 0);

    const durationMinutes = Math.ceil(route.distance_km / averageSpeed * 60 + serviceMinutes);

    const now = new Date();

    const rates = await prisma.transportRateCard.findMany({

      where: { status: "activa", active: true, valid_from: { lte: now }, valid_to: { gte: now } }, include: { carrier: true, origin: true }

    });

    const context = { origin, needs: foundNeeds, service_level: input.service_level || foundNeeds[0].service_level, vehicle_type: input.vehicle_type || vehicle?.type || foundNeeds[0].required_vehicle_type };

    const quotes = rates.filter((rate) => rateApplies(rate, context)).map((rate) => calculateRateQuote(rate, totals));

    const strategy = input.strategy || "balanced";

    const totalValues = quotes.map((quote) => quote.total);
    const scoreValues = quotes.map((quote) => quote.carrier_score);
    const minTotal = Math.min(...totalValues, 0);
    const maxTotal = Math.max(...totalValues, 1);
    const minScore = Math.min(...scoreValues, 0);
    const maxScore = Math.max(...scoreValues, 1);
    const normalizedTotal = (value) => (value - minTotal) / Math.max(maxTotal - minTotal, 1);
    const normalizedScore = (value) => (value - minScore) / Math.max(maxScore - minScore, 1);
    const balancedKey = (quote) => normalizedTotal(quote.total) * 0.6 + (1 - normalizedScore(quote.carrier_score)) * 0.4;

    quotes.sort((left, right) => {

      if (strategy === "cost") return left.total - right.total || right.carrier_score - left.carrier_score || left.priority - right.priority;

      if (strategy === "service") return right.carrier_score - left.carrier_score || left.total - right.total || left.priority - right.priority;

      if (strategy === "priority") return left.priority - right.priority || left.total - right.total;

      return balancedKey(left) - balancedKey(right) || left.total - right.total || right.carrier_score - left.carrier_score || left.priority - right.priority;

    });

    quotes.forEach((quote, index) => { quote.rank = index + 1; quote.recommended = index === 0; });

    return {

      generated_at: new Date().toISOString(), strategy, origin,

      ordered_need_ids: route.ordered.map((need) => need.id), route: { ...route, ordered: undefined }, totals,

      planned_duration_minutes: durationMinutes, capacity, quotes,

      warnings: [

        ...(!capacity.feasible ? ["capacidad_vehiculo_excedida"] : []),

        ...(quotes.length ? [] : ["sin_tarifa_aplicable"])

      ]

    };

  });

}



async function commitPlan(tenantId, user, input) {

  const plan = await evaluatePlan(tenantId, input);

  if (!plan.capacity.feasible) throw appError(409, "TMS_VEHICLE_CAPACITY_EXCEEDED", "El vehiculo seleccionado no tiene capacidad suficiente.", plan.capacity);

  const quote = plan.quotes.find((candidate) => candidate.rate_card_id === Number(input.rate_card_id));

  if (!quote) throw appError(409, "TMS_RATE_NOT_APPLICABLE", "El tarifario seleccionado no es aplicable al plan actual.");

  const metadata = {

    ...(input.metadata || {}), planning: {

      strategy: plan.strategy, rate_card_id: quote.rate_card_id, rate_code: quote.rate_code, rate_version: quote.rate_version,

      quote_breakdown: quote.components, optimized_at: plan.generated_at, route_legs: plan.route.legs

    }

  };

  const trip = await createTrip(tenantId, user, {

    ...input, origin_name: plan.origin.name, need_ids: plan.ordered_need_ids,

    estimated_cost: quote.total, currency: quote.currency, planned_distance_km: plan.totals.distance_km,

    planned_duration_minutes: plan.planned_duration_minutes, metadata

  });

  return { trip, selected_quote: quote, plan };

}



async function getTrip(tenantId, id) {

  return prisma.runWithTenant(tenantId, async () => {

    const trip = await prisma.transportTrip.findFirstOrThrow({

      where: { id: Number(id) }, include: { origin: true, carrier: true, driver: true, needs: { include: { need: { include: { delivery_point: true, lines: true } } } }, stops: { include: { need: { include: { lines: true } }, delivery_point: true, attempts: { include: { pod: true }, orderBy: { attempt_number: "asc" } } }, orderBy: { sequence: "asc" } }, events: { orderBy: { occurred_at: "asc" } }, settlements: { include: { lines: true } } }

    });

    return { ...trip, events: trip.events.map((event) => ({ ...event, id: String(event.id) })) };

  });

}



async function createTrip(tenantId, user, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const needIds = input.need_ids.map(Number);

    const foundNeeds = await prisma.transportNeed.findMany({ where: { id: { in: needIds } }, include: { delivery_point: true } });

    if (foundNeeds.length !== needIds.length) throw appError(404, "TMS_NEEDS_NOT_FOUND", "Una o mas necesidades no existen en la empresa activa.");

    const needsById = new Map(foundNeeds.map((need) => [need.id, need]));

    const needs = needIds.map((needId) => needsById.get(needId));

    const origin = input.origin_id ? await prisma.transportOrigin.findFirstOrThrow({ where: { id: Number(input.origin_id) } }) : null;

    const unavailable = needs.filter((need) => need.status !== "pendiente");

    if (unavailable.length) throw appError(409, "TMS_NEEDS_NOT_PLANNABLE", "Solo se pueden planificar necesidades completas y pendientes.", { codes: unavailable.map((need) => need.code) });

    if (origin && needs.some((need) => need.origin_id && need.origin_id !== origin.id)) throw appError(409, "TMS_INCOMPATIBLE_ORIGIN", "Todas las necesidades deben coincidir con el origen del viaje.");

    if (!origin && needs.some((need) => need.origin_name !== input.origin_name)) throw appError(409, "TMS_INCOMPATIBLE_ORIGIN", "Todas las necesidades deben coincidir con el origen del viaje.");

    const total = (field) => needs.reduce((sum, need) => sum + numberValue(need[field]), 0);

    const trip = await prisma.transportTrip.create({

      data: {

        code: normalizedCode(input.code), status: "planificado", origin_place_id: input.origin_place_id || null, origin_id: origin?.id || null, origin_name: origin?.name || input.origin_name,

        planned_departure: dateValue(input.planned_departure, "Salida planificada"), planned_arrival: dateValue(input.planned_arrival, "Llegada planificada"),

        planned_distance_km: numberValue(input.planned_distance_km), planned_duration_minutes: numberValue(input.planned_duration_minutes),

        total_weight_kg: total("weight_kg"), total_volume_m3: total("volume_m3"), total_pallets: total("pallets"), estimated_cost: numberValue(input.estimated_cost),

        currency: input.currency || needs[0].currency || "COP", service_level: input.service_level || needs[0].service_level || "normal", metadata: input.metadata || {}, created_by: user?.id || null,

        needs: { create: needs.map((need) => ({ tenant_id: String(tenantId), need_id: need.id })) },

        stops: { create: needs.map((need, index) => ({ tenant_id: String(tenantId), need_id: need.id, delivery_point_id: need.delivery_point_id, sequence: index + 1, stop_type: "entrega", planned_arrival: need.due_at, address_snapshot: `${need.delivery_point.address}, ${need.delivery_point.city}`, latitude: need.delivery_point.latitude, longitude: need.delivery_point.longitude, instructions: need.delivery_point.instructions })) },

        events: { create: { tenant_id: String(tenantId), event_type: "VIAJE_PLANIFICADO", source: "usuario", actor_id: user?.id || null, data: { need_ids: needIds } } }

      }

    });

    await prisma.transportNeed.updateMany({ where: { tenant_id: String(tenantId), id: { in: needIds } }, data: { status: "planificada" } });

    return getTrip(tenantId, trip.id);

  });

}



async function listTrips(tenantId, query = {}) {

  return prisma.runWithTenant(tenantId, () => prisma.transportTrip.findMany({

    where: { ...(query.status ? { status: query.status } : {}), ...(query.date_from || query.date_to ? { planned_departure: { ...(query.date_from ? { gte: dateValue(query.date_from, "Desde") } : {}), ...(query.date_to ? { lte: dateValue(query.date_to, "Hasta") } : {}) } } : {}) },

    include: { origin: true, carrier: true, driver: true, needs: true, stops: { orderBy: { sequence: "asc" } } }, orderBy: [{ planned_departure: "asc" }, { created_at: "desc" }], take: Math.min(numberValue(query.limit, 100), 200)

  }));

}



function vehicleCapacityKg(vehicle) {

  const unit = String(vehicle.capacity_unit || "kg").toLowerCase();

  const value = numberValue(vehicle.capacity_value);

  return ["t", "ton", "tonelada", "toneladas"].includes(unit) ? value * 1000 : value;

}



async function assignTrip(tenantId, user, id, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const trip = await prisma.transportTrip.findFirstOrThrow({ where: { id: Number(id) } });

    if (!["planificado", "ofertado"].includes(trip.status)) throw appError(409, "TMS_TRIP_NOT_ASSIGNABLE", "El viaje no esta disponible para asignacion.");

    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: Number(input.vehicle_id) } });

    if (!["apto_documentalmente", "documento_proximo_a_vencer"].includes(vehicle.master_status)) throw appError(409, "TMS_VEHICLE_NOT_ELIGIBLE", "El vehiculo no esta habilitado documentalmente.");

    const capacityKg = vehicleCapacityKg(vehicle);

    if (capacityKg > 0 && trip.total_weight_kg > capacityKg) throw appError(409, "TMS_WEIGHT_CAPACITY_EXCEEDED", "El peso del viaje supera la capacidad del vehiculo.");

    if (numberValue(vehicle.volume_available) > 0 && trip.total_volume_m3 > numberValue(vehicle.volume_available)) throw appError(409, "TMS_VOLUME_CAPACITY_EXCEEDED", "El volumen del viaje supera la capacidad del vehiculo.");

    const driver = await prisma.transportDriver.findFirstOrThrow({ where: { id: Number(input.driver_id) }, include: { carrier: true } });

    if (driver.status !== "disponible") throw appError(409, "TMS_DRIVER_NOT_AVAILABLE", "El conductor no esta disponible.");

    if (driver.license_expires_at && driver.license_expires_at < new Date()) throw appError(409, "TMS_DRIVER_LICENSE_EXPIRED", "La licencia del conductor esta vencida.");

    const busy = await prisma.transportTrip.findFirst({ where: { id: { not: trip.id }, status: { notIn: ["cerrado", "cancelado"] }, OR: [{ vehicle_id: vehicle.id }, { driver_id: driver.id }] } });

    if (busy) throw appError(409, "TMS_RESOURCE_RESERVED", `El recurso ya esta reservado en ${busy.code}. Cierre o cancele ese viaje antes de reutilizarlo.`);

    if (input.carrier_id && driver.carrier_id && Number(input.carrier_id) !== driver.carrier_id) throw appError(409, "TMS_DRIVER_CARRIER_MISMATCH", "El conductor no pertenece a la transportadora seleccionada.");

    const carrierId = input.carrier_id || driver.carrier_id || null;

    if (carrierId) await prisma.transportCarrier.findFirstOrThrow({ where: { id: Number(carrierId), status: "activo" } });

    const updated = await prisma.transportTrip.update({ where: { id: trip.id }, data: { carrier_id: carrierId, vehicle_id: vehicle.id, vehicle_plate: vehicle.plate, driver_id: driver.id, committed_cost: numberValue(input.committed_cost), metadata: trip.metadata?.packing && trip.metadata.packing.vehicle_id !== vehicle.id ? { ...trip.metadata, packing: null } : trip.metadata, status: "asignado", version: { increment: 1 } } });

    await prisma.transportNeed.updateMany({ where: { tenant_id: String(tenantId), trip_links: { some: { trip_id: trip.id } } }, data: { status: "asignada" } });

    await prisma.transportTripEvent.create({ data: { trip_id: trip.id, event_type: "VIAJE_ASIGNADO", actor_id: user?.id || null, observation: input.reason || null, data: { carrier_id: carrierId, vehicle_id: vehicle.id, driver_id: driver.id } } });

    return getTrip(tenantId, updated.id);

  });

}



async function transitionTrip(tenantId, user, id, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const trip = await prisma.transportTrip.findFirstOrThrow({ where: { id: Number(id) }, include: { stops: true, settlements: true } });

    const next = String(input.status || "").toLowerCase();

    assertTripTransition(trip.status, next);

    if (["en_cargue", "despachado"].includes(next) && (!trip.vehicle_id || !trip.driver_id)) throw appError(409, "TMS_ASSIGNMENT_REQUIRED", "Vehiculo y conductor son obligatorios antes del cargue.");

    if (["en_cargue", "despachado"].includes(next) && trip.metadata?.packing_required && (!trip.metadata.packing || trip.metadata.packing.vehicle_id !== trip.vehicle_id)) throw appError(409, "TMS_PACKING_REVIEW_REQUIRED", "Actualice el cubicaje para el vehículo asignado antes de continuar.");
    if (next === "entregado" && trip.stops.some((stop) => stop.status !== "completa")) throw appError(409, "TMS_STOPS_PENDING", "Todas las paradas deben tener resultado de entrega.");

    if (next === "cerrado" && !trip.settlements.some((settlement) => settlement.status === "aprobada")) throw appError(409, "TMS_SETTLEMENT_REQUIRED", "Se requiere una liquidacion aprobada para cerrar el viaje.");

    const now = dateValue(input.occurred_at, "Fecha del evento") || new Date();

    const data = { status: next, version: { increment: 1 } };

    if (next === "despachado") data.actual_departure = now;

    if (next === "entregado") data.actual_arrival = now;

    const updated = await prisma.transportTrip.update({ where: { id: trip.id }, data });

    const needStatus = { despachado: "despachada", en_transito: "en_transito", entregado: "entregada", cerrado: "cerrada", cancelado: "pendiente" }[next];

    if (needStatus) await prisma.transportNeed.updateMany({ where: { tenant_id: String(tenantId), trip_links: { some: { trip_id: trip.id } } }, data: { status: needStatus } });

    await prisma.transportTripEvent.create({ data: { trip_id: trip.id, event_type: `ESTADO_${next.toUpperCase()}`, occurred_at: now, actor_id: user?.id || null, observation: input.reason || null, data: { previous_status: trip.status, new_status: next } } });

    if (next === "despachado") await notifyTripCustomers(tenantId, user, trip.id, "DESPACHADO", `El viaje ${trip.code} fue despachado.`);

    if (next === "entregado") await notifyTripCustomers(tenantId, user, trip.id, "ENTREGADO", `El viaje ${trip.code} completo sus entregas.`);

    return getTrip(tenantId, updated.id);

  });

}



async function recordTripEvent(tenantId, user, id, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const trip = await prisma.transportTrip.findFirstOrThrow({ where: { id: Number(id) } });

    if (input.stop_id) await prisma.transportStop.findFirstOrThrow({ where: { id: Number(input.stop_id), trip_id: trip.id } });

    assertCoordinatePair(input.latitude, input.longitude);

    const event = await prisma.transportTripEvent.create({ data: { trip_id: trip.id, stop_id: input.stop_id || null, event_type: normalizedCode(input.event_type).replace(/-/g, "_"), occurred_at: dateValue(input.occurred_at, "Fecha del evento") || new Date(), source: input.source || "usuario", latitude: input.latitude ?? null, longitude: input.longitude ?? null, actor_id: user?.id || null, device_id: input.device_id || null, observation: input.observation || null, data: input.data || {} } });

    return { ...event, id: String(event.id) };

  });

}



async function registerDeliveryAttempt(tenantId, user, tripId, stopId, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const stop = await prisma.transportStop.findFirstOrThrow({ where: { id: Number(stopId), trip_id: Number(tripId) }, include: { trip: true, need: { include: { lines: true } } } });

    if (!["despachado", "en_transito"].includes(stop.trip.status)) throw appError(409, "TMS_TRIP_NOT_IN_EXECUTION", "El viaje debe estar despachado o en transito.");

    if (!ATTEMPT_RESULTS.has(input.result)) throw appError(400, "TMS_INVALID_ATTEMPT_RESULT", "Resultado de entrega no reconocido.");

    validateAttemptInput(input);

    if (["completa", "parcial"].includes(input.result)) {

      const config = await getTmsConfig(tenantId); validatePodInput(input, stop.need, config.mobile_config || {});

    }

    if (stop.status === "completa") throw appError(409, "TMS_STOP_COMPLETE", "La parada ya fue entregada.");

    const previous = await prisma.transportDeliveryAttempt.findMany({ where: { stop_id: stop.id }, orderBy: { attempt_number: "asc" } });

    const remaining = remainingDeliveryLines(stop.need?.lines || [], previous);

    if (TERMINAL_STOP_RESULTS.has(input.result)) validatePodInput(input, { lines: remaining }, (await getTmsConfig(tenantId)).mobile_config || {});

    if (input.result === "completa") input = { ...input, delivered_lines: remaining.map(line => ({ sku: line.sku, quantity: line.quantity })) };

    const references = [...(input.evidence || []), ...(input.pod?.photos || []), ...(input.pod?.signature ? [input.pod.signature] : [])];

    await require("./tms-evidence-storage").assertEvidenceReferences(tenantId, stop.trip_id, stop.id, references);

    const count = previous.length;

    const attempt = await prisma.transportDeliveryAttempt.create({

      data: {

        trip_id: stop.trip_id, stop_id: stop.id, need_id: stop.need_id, attempt_number: count + 1, result: input.result, cause_code: input.cause_code || null,

        responsible: input.responsible || null, evidence: input.evidence || [], delivered_lines: input.delivered_lines || [], additional_cost: numberValue(input.additional_cost),

        recoverable: input.recoverable === true, next_attempt_at: dateValue(input.next_attempt_at, "Proximo intento"), approved_by: input.approved_by || null,

        observations: input.observations || null,

        ...(input.pod ? { pod: { create: { tenant_id: String(tenantId), received_at: dateValue(input.pod.received_at, "Fecha POD") || new Date(), receiver_name: input.pod.receiver_name, receiver_document: input.pod.receiver_document || null, signature: input.pod.signature || null, photos: input.pod.photos || [], latitude: input.pod.latitude ?? null, longitude: input.pod.longitude ?? null, observations: input.pod.observations || null, created_by: user?.id || null } } } : {})

      }, include: { pod: true }

    });

    const stopStatus = input.result === "completa" ? "completa" : input.result === "parcial" ? "parcial" : "reintento_pendiente";

    await prisma.transportStop.update({ where: { id: stop.id }, data: { status: stopStatus, completed_at: TERMINAL_STOP_RESULTS.has(input.result) ? new Date() : null } });

    if (stop.need_id) await prisma.transportNeed.update({ where: { id: stop.need_id }, data: { status: input.result === "completa" ? "entregada" : input.result === "parcial" ? "entrega_parcial" : "reintento_pendiente" } });

    await prisma.transportTripEvent.create({ data: { trip_id: stop.trip_id, stop_id: stop.id, event_type: `ENTREGA_${input.result.toUpperCase()}`, actor_id: user?.id || null, data: { attempt_id: attempt.id, attempt_number: attempt.attempt_number, cause_code: input.cause_code || null } } });

    if (!TERMINAL_STOP_RESULTS.has(input.result)) await notifyTripCustomers(tenantId, user, stop.trip_id, "ENTREGA_RECHAZADA", `La parada ${stop.sequence} registro la novedad ${input.result}.`);

    return attempt;

  });

}



function validatePodInput(input, need, settings = {}) {

  const pod = input.pod || {}; const photos = Array.isArray(pod.photos) ? pod.photos : [];

  if (!String(pod.receiver_name || "").trim()) throw appError(400, "TMS_POD_RECEIVER_REQUIRED", "El POD requiere el nombre del receptor.");

  if (settings.require_signature !== false && !String(pod.signature || "").trim()) throw appError(400, "TMS_POD_SIGNATURE_REQUIRED", "La firma es obligatoria para completar la entrega.");

  if (settings.require_photo !== false && !photos.length) throw appError(400, "TMS_POD_PHOTO_REQUIRED", "Se requiere al menos una fotografia.");

  for (const reference of photos) if (!SAFE_EVIDENCE_REFERENCE.test(String(reference))) throw appError(400, "TMS_POD_UNSAFE_EVIDENCE", "La fotografia debe ser una referencia validada de almacenamiento TMS.");

  if (pod.signature && !SAFE_EVIDENCE_REFERENCE.test(String(pod.signature))) throw appError(400, "TMS_POD_UNSAFE_SIGNATURE", "La firma debe ser una referencia validada de almacenamiento TMS.");

  if (input.result === "parcial") {

    if (!Array.isArray(input.delivered_lines) || !input.delivered_lines.length) throw appError(400, "TMS_PARTIAL_LINES_REQUIRED", "La entrega parcial requiere cantidades entregadas por producto.");

    const ordered = new Map((need?.lines || []).map((line) => [String(line.sku), numberValue(line.quantity)]));

    const seen = new Set();

    for (const line of input.delivered_lines) { if (seen.has(String(line.sku))) throw appError(400, "TMS_DUPLICATE_SKU", "Cada producto debe aparecer una sola vez."); seen.add(String(line.sku)); }

    for (const line of input.delivered_lines) { const quantity = numberValue(line.quantity); if (!line.sku || quantity <= 0 || !ordered.has(String(line.sku)) || quantity > ordered.get(String(line.sku))) throw appError(400, "TMS_INVALID_PARTIAL_QUANTITY", `Cantidad parcial invalida para ${line.sku || "producto"}.`); }

  }

}



function validateAttemptInput(input) {

  const evidence = Array.isArray(input.evidence) ? input.evidence : [];

  for (const reference of evidence) if (!SAFE_EVIDENCE_REFERENCE.test(String(reference))) throw appError(400, "TMS_UNSAFE_ATTEMPT_EVIDENCE", "La evidencia de la novedad debe provenir del almacenamiento TMS.");

  if (!NOVELTY_RESULTS.has(input.result)) return;

  if (!String(input.cause_code || "").trim()) throw appError(400, "TMS_NOVELTY_CAUSE_REQUIRED", "La novedad requiere una causa.");

  if (!String(input.responsible || "").trim()) throw appError(400, "TMS_NOVELTY_RESPONSIBLE_REQUIRED", "La novedad requiere un responsable.");

  if (!evidence.length) throw appError(400, "TMS_NOVELTY_EVIDENCE_REQUIRED", "La novedad requiere evidencia fotografica.");

  const retryAt = dateValue(input.next_attempt_at, "Proximo intento", true);

  if (retryAt <= new Date()) throw appError(400, "TMS_RETRY_DATE_INVALID", "El proximo intento debe quedar programado en el futuro.");

}



function validRouteCoordinates(trip) {

  const metadata = trip?.metadata || {};

  const candidate = metadata.route_geometry?.type === "LineString" ? metadata.route_geometry.coordinates : metadata.planned_route?.type === "LineString" ? metadata.planned_route.coordinates : metadata.route_coordinates;

  if (!Array.isArray(candidate) || candidate.length < 2) return null;

  const coordinates = candidate.map((coordinate) => Array.isArray(coordinate) ? [Number(coordinate[0]), Number(coordinate[1])] : null);

  return coordinates.every((coordinate) => coordinate && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]) && Math.abs(coordinate[0]) <= 180 && Math.abs(coordinate[1]) <= 90) ? coordinates : null;

}



function turfSpatialStatus(trip, latest, target, geofenceM) {

  const currentPoint = point([Number(latest.longitude), Number(latest.latitude)]);

  const targetPoint = point([Number(target.longitude), Number(target.latitude)]);

  const distanceKm = turfDistance(currentPoint, targetPoint, { units: "kilometers" });

  const customGeofence = target?.metadata?.geofence_geojson || trip?.metadata?.geofence_geojson;

  let insideGeofence;

  try { insideGeofence = customGeofence?.type === "Polygon" || customGeofence?.type === "MultiPolygon" ? booleanPointInPolygon(currentPoint, customGeofence) : booleanPointInPolygon(currentPoint, turfBuffer(targetPoint, geofenceM / 1000, { units: "kilometers", steps: 32 })); }

  catch { insideGeofence = distanceKm * 1000 <= geofenceM; }

  const coordinates = validRouteCoordinates(trip);

  const deviationKm = coordinates ? pointToLineDistance(currentPoint, lineString(coordinates), { units: "kilometers" }) : null;

  const corridorM = Math.max(50, Number(trip?.metadata?.corridor_radius_m || 500));

  return { distanceKm, insideGeofence, deviationKm, corridorM, offRoute: deviationKm != null && deviationKm * 1000 > corridorM };

}



function podDateWhere(query = {}) { return query.date_from || query.date_to ? { received_at: { ...(query.date_from ? { gte: dateValue(query.date_from, "Desde") } : {}), ...(query.date_to ? { lte: dateValue(query.date_to, "Hasta") } : {}) } } : {}; }

async function listPods(tenantId, query = {}) { return prisma.runWithTenant(tenantId, () => prisma.transportDeliveryAttempt.findMany({ where: { pod: { is: podDateWhere(query) }, ...(query.result ? { result: query.result } : {}), ...(query.driver_id ? { trip: { driver_id: Number(query.driver_id) } } : {}), ...(query.carrier_id ? { trip: { carrier_id: Number(query.carrier_id) } } : {}) }, include: { pod: true, trip: { include: { driver: true, carrier: true } }, stop: { include: { delivery_point: true } }, need: true }, orderBy: { occurred_at: "desc" }, take: Math.min(numberValue(query.limit, 100), 500) })); }

async function getPod(tenantId, id) { return prisma.runWithTenant(tenantId, () => prisma.transportPod.findFirstOrThrow({ where: { id: Number(id) }, include: { attempt: { include: { trip: { include: { driver: true, carrier: true } }, stop: { include: { delivery_point: true } }, need: { include: { lines: true } } } } } })); }

async function getPodStats(tenantId, query = {}) { return prisma.runWithTenant(tenantId, async () => { const rows = await prisma.transportDeliveryAttempt.findMany({ where: { ...(query.date_from || query.date_to ? { occurred_at: { ...(query.date_from ? { gte: dateValue(query.date_from, "Desde") } : {}), ...(query.date_to ? { lte: dateValue(query.date_to, "Hasta") } : {}) } } : {}), ...(query.result ? { result: query.result } : {}), ...(query.driver_id ? { trip: { driver_id: Number(query.driver_id) } } : {}), ...(query.carrier_id ? { trip: { carrier_id: Number(query.carrier_id) } } : {}) }, select: { result: true, attempt_number: true } }); const total = rows.length; const count = (result) => rows.filter((row) => row.result === result).length; return { total, complete: count("completa"), partial: count("parcial"), rejected: rows.filter((row) => !TERMINAL_STOP_RESULTS.has(row.result)).length, complete_pct: total ? Number((count("completa") / total * 100).toFixed(1)) : 0, partial_pct: total ? Number((count("parcial") / total * 100).toFixed(1)) : 0, first_attempt_pct: total ? Number((rows.filter((row) => row.attempt_number === 1 && row.result === "completa").length / total * 100).toFixed(1)) : 0 }; }); }



function calculateLiveStatus(trip, latest, now = new Date()) {

  const nextStop = trip.stops?.find((stop) => !TERMINAL_STOP_RESULTS.has(stop.status) && !stop.completed_at) || null;

  if (!latest) return { signal_status: "sin_senal", stale_seconds: null, next_stop: nextStop, distance_to_stop_km: null, eta_minutes: null, inside_geofence: false, alerts: [{ code: "GPS_SIN_SENAL", severity: "high", message: "El viaje no ha reportado posiciones GPS." }] };

  const staleSeconds = Math.max(0, Math.round((now.getTime() - new Date(latest.recorded_at).getTime()) / 1000));

  const target = nextStop?.latitude != null && nextStop?.longitude != null ? nextStop : nextStop?.delivery_point;

  const geofenceM = Number(nextStop?.delivery_point?.geofence_radius_m || 150);

  const spatial = target?.latitude != null && target?.longitude != null ? turfSpatialStatus(trip, latest, target, geofenceM) : null;

  const distanceKm = spatial?.distanceKm ?? null; const inside = spatial?.insideGeofence ?? false;

  const speed = Math.max(Number(latest.speed_kph || 0), 25); const eta = distanceKm == null ? null : Math.round(distanceKm / speed * 60);

  const alerts = [];

  if (staleSeconds > 300) alerts.push({ code: "GPS_DESACTUALIZADO", severity: "high", message: `Sin posicion reciente hace ${staleSeconds} segundos.` });

  if (latest.is_mocked) alerts.push({ code: "GPS_SIMULADO", severity: "high", message: "El dispositivo reporta una ubicacion simulada." });

  if (latest.accuracy_m != null && Number(latest.accuracy_m) > 100) alerts.push({ code: "GPS_BAJA_PRECISION", severity: "medium", message: "La precision GPS supera 100 metros." });

  if (latest.battery_pct != null && Number(latest.battery_pct) <= 15) alerts.push({ code: "BATERIA_BAJA", severity: "medium", message: "El dispositivo tiene bateria baja." });

  if (spatial?.offRoute) alerts.push({ code: "DESVIO_DE_RUTA", severity: "high", message: `El vehiculo esta a ${Math.round(spatial.deviationKm * 1000)} m del corredor planificado.` });

  return { signal_status: staleSeconds > 300 ? "desactualizada" : "activa", stale_seconds: staleSeconds, next_stop: nextStop, distance_to_stop_km: distanceKm == null ? null : Number(distanceKm.toFixed(2)), eta_minutes: eta, inside_geofence: inside, route_deviation_m: spatial?.deviationKm == null ? null : Math.round(spatial.deviationKm * 1000), corridor_radius_m: spatial?.corridorM ?? null, off_route: spatial?.offRoute ?? false, route_coordinates: validRouteCoordinates(trip), spatial_engine: "turf", alerts };

}



async function getLiveMonitoring(tenantId, query = {}) {

  return prisma.runWithTenant(tenantId, async () => {

    const statuses = query.include_planned === "true" ? ["planificado", "asignado", "en_cargue", "despachado", "en_transito"] : ["despachado", "en_transito"];

    const trips = await prisma.transportTrip.findMany({ where: { status: { in: statuses } }, include: { driver: true, carrier: true, stops: { include: { delivery_point: true }, orderBy: { sequence: "asc" } } }, orderBy: { planned_departure: "asc" }, take: 200 });

    const units = await Promise.all(trips.map(async (trip) => {

      const latest = await prisma.transportGpsPosition.findFirst({ where: { trip_id: trip.id }, orderBy: { recorded_at: "desc" } });

      const live = calculateLiveStatus(trip, latest);

      return { trip_id: trip.id, trip_code: trip.code, status: trip.status, vehicle_id: trip.vehicle_id, vehicle_plate: trip.vehicle_plate, driver: trip.driver, carrier: trip.carrier, latest: latest ? serializeGpsPosition(latest) : null, ...live };

    }));

    const alerts = units.flatMap((unit) => unit.alerts.map((alert) => ({ ...alert, trip_id: unit.trip_id, trip_code: unit.trip_code, vehicle_plate: unit.vehicle_plate })));

    return { generated_at: new Date().toISOString(), refresh_seconds: 15, summary: { active: units.length, with_signal: units.filter((unit) => unit.signal_status === "activa").length, stale: units.filter((unit) => unit.signal_status === "desactualizada").length, without_signal: units.filter((unit) => unit.signal_status === "sin_senal").length, inside_geofence: units.filter((unit) => unit.inside_geofence).length, off_route: units.filter((unit) => unit.off_route).length, alerts: alerts.length }, units, alerts };

  });

}



function parseCsv(text) {

  const rows = []; let row = []; let value = ""; let quoted = false;

  for (let index = 0; index < String(text).length; index += 1) {

    const char = String(text)[index]; const next = String(text)[index + 1];

    if (char === '"' && quoted && next === '"') { value += '"'; index += 1; }

    else if (char === '"') quoted = !quoted;

    else if (char === "," && !quoted) { row.push(value.trim()); value = ""; }

    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }

    else value += char;

  }

  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);

  if (!rows.length) return [];

  const headers = rows.shift().map((header) => normalizedMatch(header).replace(/\s+/g, "_"));

  return rows.map((cells, rowIndex) => ({ row: rowIndex + 2, data: Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])) }));

}



async function getOrder(tenantId, id) {

  return prisma.runWithTenant(tenantId, async () => {

    const order = await prisma.transportNeed.findFirstOrThrow({ where: { id: Number(id) }, include: { origin: true, delivery_point: true, lines: true, trip_links: { include: { trip: { include: { stops: true, events: { orderBy: { occurred_at: "asc" } } } } } }, attempts: { include: { pod: true }, orderBy: { occurred_at: "asc" } } } });

    return { ...order, trip_links: order.trip_links.map((link) => ({ ...link, trip: { ...link.trip, events: link.trip.events.map((event) => ({ ...event, id: String(event.id) })) } })) };

  });

}



async function updateOrder(tenantId, user, id, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const current = await getOrder(tenantId, id);

    if (!["pendiente", "incompleta"].includes(current.status)) throw appError(409, "TMS_ORDER_NOT_EDITABLE", "Solo se pueden editar ordenes pendientes o incompletas.");

    const merged = { ...current, ...input };

    const point = input.delivery_point_id ? await prisma.transportDeliveryPoint.findFirstOrThrow({ where: { id: Number(input.delivery_point_id) } }) : current.delivery_point;

    const origin = input.origin_id ? await prisma.transportOrigin.findFirstOrThrow({ where: { id: Number(input.origin_id) } }) : current.origin;

    const availableAt = dateValue(merged.available_at, "Fecha disponible", true); const dueAt = dateValue(merged.due_at, "Fecha limite", true);

    if (dueAt < availableAt) throw appError(400, "TMS_INVALID_NEED_WINDOW", "La fecha limite no puede ser anterior a la fecha disponible.");

    const errors = needValidationErrors(merged, point);

    const updated = await prisma.transportNeed.update({ where: { id: current.id }, data: { code: normalizedCode(merged.code), source_reference: merged.source_reference || null, origin_id: origin?.id || null, origin_name: origin?.name || merged.origin_name, delivery_point_id: point.id, available_at: availableAt, due_at: dueAt, priority: merged.priority, service_level: merged.service_level, weight_kg: numberValue(merged.weight_kg), volume_m3: numberValue(merged.volume_m3), pallets: numberValue(merged.pallets), packages: numberValue(merged.packages), required_vehicle_type: merged.required_vehicle_type || null, cargo_value: numberValue(merged.cargo_value), currency: merged.currency || "COP", status: errors.length ? "incompleta" : "pendiente", validation_errors: errors, metadata: { ...(current.metadata || {}), ...(input.metadata || {}), last_edited_by: user?.id || null } } });

    return getOrder(tenantId, updated.id);

  });

}



async function cancelOrder(tenantId, user, id, input = {}) {

  return prisma.runWithTenant(tenantId, async () => {

    const current = await getOrder(tenantId, id);

    if (!["pendiente", "incompleta", "planificada"].includes(current.status)) throw appError(409, "TMS_ORDER_NOT_CANCELLABLE", "La orden ya esta en ejecucion y no puede cancelarse.");

    if (current.trip_links.some((link) => !["borrador", "planificado", "cancelado"].includes(link.trip.status))) throw appError(409, "TMS_ORDER_TRIP_IN_EXECUTION", "La orden pertenece a un viaje en ejecucion.");

    return prisma.transportNeed.update({ where: { id: current.id }, data: { status: "cancelada", metadata: { ...(current.metadata || {}), cancellation_reason: input?.reason || null, cancelled_by: user?.id || null, cancelled_at: new Date().toISOString() } } });

  });

}



async function getOrderTracking(tenantId, id) {

  const order = await getOrder(tenantId, id); const trips = [];

  for (const link of order.trip_links) trips.push(await getTripTracking(tenantId, link.trip.id, { limit: 500 }));

  return { order_id: order.id, code: order.code, status: order.status, trips };

}



async function getOrderPod(tenantId, id) {

  const order = await getOrder(tenantId, id);

  return { order_id: order.id, code: order.code, attempts: order.attempts, pods: order.attempts.map((attempt) => attempt.pod).filter(Boolean) };

}



async function importOrdersCsv(tenantId, user, input) {

  const parsed = parseCsv(input.csv); const required = ["code", "origin_code", "delivery_point_code", "available_at", "due_at", "weight_kg", "volume_m3"];

  if (!parsed.length) throw appError(400, "TMS_EMPTY_CSV", "El archivo CSV no contiene filas de datos.");

  const errors = []; const prepared = [];

  await prisma.runWithTenant(tenantId, async () => {

    const origins = await prisma.transportOrigin.findMany(); const points = await prisma.transportDeliveryPoint.findMany();

    const originByCode = new Map(origins.map((row) => [normalizedCode(row.code), row])); const pointByCode = new Map(points.map((row) => [normalizedCode(row.code), row]));

    for (const entry of parsed) {

      const missing = required.filter((field) => !entry.data[field]); const origin = originByCode.get(normalizedCode(entry.data.origin_code)); const point = pointByCode.get(normalizedCode(entry.data.delivery_point_code));

      if (missing.length || !origin || !point) { errors.push({ row: entry.row, missing, ...(origin ? {} : { origin_code: "no_encontrado" }), ...(point ? {} : { delivery_point_code: "no_encontrado" }) }); continue; }

      prepared.push({ ...entry.data, source_type: entry.data.source_type || "csv", origin_id: origin.id, origin_name: origin.name, delivery_point_id: point.id, weight_kg: numberValue(entry.data.weight_kg), volume_m3: numberValue(entry.data.volume_m3), pallets: numberValue(entry.data.pallets), packages: numberValue(entry.data.packages), currency: entry.data.currency || "COP" });

    }

  });

  if (errors.length) return { status: "invalid", total: parsed.length, valid: prepared.length, errors };

  if (input.dry_run) return { status: "validated", total: parsed.length, valid: prepared.length, errors: [] };

  const created = []; for (const order of prepared) created.push(await createNeed(tenantId, user, order));

  return { status: "completed", total: parsed.length, created: created.length, order_ids: created.map((order) => order.id), errors: [] };

}



const DEFAULT_TMS_CONFIG = Object.freeze({ timezone: "America/Bogota", default_currency: "COP", distance_unit: "km", weight_unit: "kg", road_factor: 1.2, gps_interval_seconds: 30, gps_retention_days: 90, mobile_config: { tracking_enabled: true, background_tracking: true, require_photo: true, require_signature: true, allow_offline: true, max_offline_hours: 24 }, notification_config: { email_enabled: true, sms_enabled: false, push_enabled: true, notify_on_dispatched: true, notify_on_delivered: true, notify_on_rejected: true }, metadata: {} });



async function getTmsConfig(tenantId) {

  return prisma.runWithTenant(tenantId, async () => (await prisma.transportTmsConfig.findFirst({ where: { tenant_id: String(tenantId) } })) || { ...DEFAULT_TMS_CONFIG, tenant_id: String(tenantId), persisted: false });

}



async function saveTmsConfig(tenantId, user, section, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const current = await getTmsConfig(tenantId);

    const data = section === "mobile" ? { mobile_config: { ...(current.mobile_config || {}), ...input } } : section === "notifications" ? { notification_config: { ...(current.notification_config || {}), ...input } } : { ...input, default_currency: input.default_currency?.toUpperCase() || current.default_currency };

    return prisma.transportTmsConfig.upsert({ where: { tenant_id: String(tenantId) }, create: { ...DEFAULT_TMS_CONFIG, ...data, tenant_id: String(tenantId), updated_by: user?.id || null }, update: { ...data, updated_by: user?.id || null } });

  });

}



function gpsPositionData(position, context = {}) {

  assertCoordinatePair(position.latitude, position.longitude);

  const recordedAt = dateValue(position.recorded_at, "Fecha GPS", true);

  if (recordedAt.getTime() > Date.now() + 10 * 60 * 1000) throw appError(400, "TMS_GPS_FUTURE_TIMESTAMP", "La posicion GPS no puede estar mas de 10 minutos en el futuro.");

  return {

    trip_id: Number(context.trip_id), driver_id: context.driver_id || null, stop_id: position.stop_id ? Number(position.stop_id) : null,

    device_id: String(context.device_id || "").trim(), client_event_id: String(position.client_event_id || "").trim(), recorded_at: recordedAt,

    latitude: numberValue(position.latitude), longitude: numberValue(position.longitude), accuracy_m: position.accuracy_m ?? null,

    altitude_m: position.altitude_m ?? null, speed_kph: position.speed_kph ?? null, heading: position.heading ?? null,

    battery_pct: position.battery_pct ?? null, is_mocked: position.is_mocked === true, metadata: position.metadata || {}

  };

}



function serializeGpsPosition(position) {

  return { ...position, id: String(position.id) };

}



function serializeNotification(notification) { return { ...notification, id: String(notification.id) }; }



async function listNotifications(tenantId, query = {}) {

  return prisma.runWithTenant(tenantId, async () => (await prisma.transportNotification.findMany({ where: { ...(query.status ? { status: query.status } : {}), ...(query.channel ? { channel: query.channel } : {}), ...(query.trip_id ? { trip_id: Number(query.trip_id) } : {}) }, orderBy: { created_at: "desc" }, take: Math.min(numberValue(query.limit, 100), 500) })).map(serializeNotification));

}



async function sendNotification(tenantId, user, input) {

  return prisma.runWithTenant(tenantId, async () => {

    if (input.trip_id) await prisma.transportTrip.findFirstOrThrow({ where: { id: Number(input.trip_id) } });

    if (input.need_id) await prisma.transportNeed.findFirstOrThrow({ where: { id: Number(input.need_id) } });

    let status = "pendiente"; let error = null; let providerRef = null;

    if (input.channel === "email") {

      try {

        const { emailQueue } = require("../../fabric/queues");

        if (emailQueue?.add) { const job = await emailQueue.add("tms-notification", { tenant_id: String(tenantId), to: input.recipient, subject: input.subject || "Actualizacion de entrega", text: input.body }); status = "encolada"; providerRef = String(job?.id || ""); }

        else error = "EMAIL_QUEUE_DISABLED";

      } catch (cause) { error = cause.message; }

    }

    const row = await prisma.transportNotification.create({ data: { channel: input.channel, event_type: normalizedCode(input.event_type).replace(/-/g, "_"), recipient: String(input.recipient).trim(), subject: input.subject || null, body: input.body, status, trip_id: input.trip_id || null, need_id: input.need_id || null, attempt_id: input.attempt_id || null, provider_ref: providerRef, error, metadata: input.metadata || {}, created_by: user?.id || null } });

    return serializeNotification(row);

  });

}



async function notifyTripCustomers(tenantId, user, tripId, eventType, message) {

  return prisma.runWithTenant(tenantId, async () => {

    const config = await getTmsConfig(tenantId); const settings = config.notification_config || {};

    const eventSetting = { DESPACHADO: "notify_on_dispatched", ENTREGADO: "notify_on_delivered", ENTREGA_RECHAZADA: "notify_on_rejected" }[eventType];

    if (settings.email_enabled === false || (eventSetting && settings[eventSetting] === false)) return [];

    const trip = await prisma.transportTrip.findFirst({ where: { id: Number(tripId) }, include: { needs: { include: { need: { include: { delivery_point: true } } } } } });

    if (!trip) return [];

    const sent = [];

    for (const link of trip.needs) {

      const recipient = link.need.metadata?.notification_email || link.need.delivery_point?.metadata?.notification_email || link.need.delivery_point?.metadata?.email;

      if (recipient) sent.push(await sendNotification(tenantId, user, { channel: "email", event_type: eventType, recipient, subject: `Orden ${link.need.code}: ${eventType.toLowerCase()}`, body: message, trip_id: trip.id, need_id: link.need.id, metadata: { automatic: true } }));

    }

    return sent;

  });

}



async function recordGpsBatch(tenantId, user, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const trip = await prisma.transportTrip.findFirstOrThrow({ where: { id: Number(input.trip_id) } });

    if (!["despachado", "en_transito"].includes(trip.status)) throw appError(409, "TMS_TRIP_NOT_TRACKABLE", "El viaje debe estar despachado o en transito para recibir GPS.");

    if (!trip.driver_id) throw appError(409, "TMS_DRIVER_REQUIRED", "El viaje debe tener un conductor asignado para recibir GPS.");

    const deviceId = String(input.device_id || "").trim();

    if (!deviceId) throw appError(400, "TMS_DEVICE_REQUIRED", "El dispositivo es obligatorio.");

    const clientIds = new Set();

    const rows = input.positions.map((position) => {

      const row = gpsPositionData(position, { trip_id: trip.id, driver_id: trip.driver_id, device_id: deviceId });

      if (!row.client_event_id || clientIds.has(row.client_event_id)) throw appError(400, "TMS_GPS_EVENT_ID_INVALID", "Cada posicion debe tener un client_event_id unico dentro del lote.");

      clientIds.add(row.client_event_id);

      return { ...row, tenant_id: String(tenantId) };

    });

    const stopIds = [...new Set(rows.map((row) => row.stop_id).filter(Boolean))];

    if (stopIds.length) {

      const stops = await prisma.transportStop.findMany({ where: { id: { in: stopIds }, trip_id: trip.id }, select: { id: true } });

      if (stops.length !== stopIds.length) throw appError(404, "TMS_GPS_STOP_NOT_FOUND", "Una posicion referencia una parada que no pertenece al viaje.");

    }

    const created = await prisma.transportGpsPosition.createMany({ data: rows, skipDuplicates: true });

    const latest = await prisma.transportGpsPosition.findFirst({ where: { trip_id: trip.id }, orderBy: { recorded_at: "desc" } });

    if (latest) {

      await prisma.transportTripEvent.create({ data: { trip_id: trip.id, event_type: "GPS_BATCH_RECEIVED", occurred_at: latest.recorded_at, source: "movil", latitude: latest.latitude, longitude: latest.longitude, actor_id: user?.id || null, device_id: deviceId, data: { received: rows.length, inserted: created.count, mocked: rows.filter((row) => row.is_mocked).length } } });

    }

    return { received: rows.length, inserted: created.count, duplicates: rows.length - created.count, latest: latest ? serializeGpsPosition(latest) : null };

  });

}



async function getTripTracking(tenantId, id, query = {}) {

  return prisma.runWithTenant(tenantId, async () => {

    const trip = await prisma.transportTrip.findFirstOrThrow({ where: { id: Number(id) }, select: { id: true, code: true, status: true, driver_id: true, vehicle_id: true, vehicle_plate: true } });

    const limit = Math.max(1, Math.min(numberValue(query.limit, 500), 2000));

    const recordedAt = { ...(query.from ? { gte: dateValue(query.from, "Desde") } : {}), ...(query.to ? { lte: dateValue(query.to, "Hasta") } : {}) };

    const positions = await prisma.transportGpsPosition.findMany({

      where: { trip_id: trip.id, ...(Object.keys(recordedAt).length ? { recorded_at: recordedAt } : {}) },

      orderBy: { recorded_at: "desc" }, take: limit

    });

    positions.reverse();

    return { trip, count: positions.length, latest: positions.length ? serializeGpsPosition(positions[positions.length - 1]) : null, positions: positions.map(serializeGpsPosition) };

  });

}



async function recordStopVisit(tenantId, user, tripId, stopId, action, input = {}) {

  return prisma.runWithTenant(tenantId, async () => {

    const stop = await prisma.transportStop.findFirstOrThrow({ where: { id: Number(stopId), trip_id: Number(tripId) }, include: { trip: true } });

    if (!["despachado", "en_transito"].includes(stop.trip.status)) throw appError(409, "TMS_TRIP_NOT_IN_EXECUTION", "El viaje debe estar despachado o en transito.");

    assertCoordinatePair(input.latitude, input.longitude);

    const occurredAt = dateValue(input.occurred_at, "Fecha de visita") || new Date();

    const arriving = action === "arrive";

    if (arriving && stop.actual_arrival) throw appError(409, "TMS_STOP_ALREADY_ARRIVED", "La llegada a la parada ya fue registrada.");

    if (!arriving && !stop.actual_arrival) throw appError(409, "TMS_STOP_ARRIVAL_REQUIRED", "Debe registrarse la llegada antes de la salida.");

    if (!arriving && stop.completed_at) throw appError(409, "TMS_STOP_ALREADY_DEPARTED", "La salida de la parada ya fue registrada.");

    const updated = await prisma.transportStop.update({ where: { id: stop.id }, data: arriving ? { actual_arrival: occurredAt, service_started_at: occurredAt, status: "arribada" } : { completed_at: occurredAt } });

    const event = await prisma.transportTripEvent.create({ data: { trip_id: stop.trip_id, stop_id: stop.id, event_type: arriving ? "PARADA_LLEGADA" : "PARADA_SALIDA", occurred_at: occurredAt, source: input.device_id ? "movil" : "usuario", latitude: input.latitude ?? null, longitude: input.longitude ?? null, actor_id: user?.id || null, device_id: input.device_id || null, observation: input.observation || null, data: input.metadata || {} } });

    return { stop: updated, event: { ...event, id: String(event.id) } };

  });

}



function remainingDeliveryLines(lines, attempts) {

  const delivered = new Map();

  for (const attempt of attempts) for (const line of (attempt.delivered_lines || [])) delivered.set(line.sku, (delivered.get(line.sku) || 0) + Number(line.quantity));

  return lines.map(line => ({ ...line, quantity: Math.max(0, Number(line.quantity) - (delivered.get(line.sku) || 0)) })).filter(line => line.quantity > 0);

}

function settlementLines(input) {

  if (!Array.isArray(input) || !input.length || input.length > 200) throw appError(400, "TMS_LINES_REQUIRED", "Ingrese entre 1 y 200 conceptos.");

  if (new Set(input.map(line => String(line.concept).trim())).size !== input.length) throw appError(400, "TMS_DUPLICATE_CONCEPT", "Los conceptos no pueden repetirse.");

  const cents = value => Math.round(value * 100);

  return input.map(line => {

    const quantity = Number(line.quantity ?? 1), rate = Number(line.unit_rate);

    if (!String(line.concept || "").trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(rate) || rate < 0 || rate > 1e12) throw appError(400, "TMS_INVALID_SETTLEMENT_LINE", "Concepto, cantidad positiva y tarifa no negativa requeridos.");

    const total = cents(quantity * rate) / 100;

    if (!Number.isSafeInteger(cents(total)) || (line.total !== undefined && (!Number.isFinite(Number(line.total)) || cents(Number(line.total)) !== cents(total)))) throw appError(400, "TMS_SETTLEMENT_TOTAL_MISMATCH", "El total debe coincidir con cantidad por tarifa.");

    return { concept: String(line.concept).trim(), quantity, unit_rate: rate, total, source: line.source || "manual", support: line.support || {}, recoverable: line.recoverable === true, metadata: line.metadata || {} };

  });

}

async function previewSettlement(tenantId, tripId) {

  return prisma.runWithTenant(tenantId, async () => {

    const trip = await getTrip(tenantId, tripId);

    const lines = [{ concept: "FLETE_BASE", quantity: 1, unit_rate: Number(trip.committed_cost ?? trip.estimated_cost), source: "viaje", support: { trip_id: trip.id, rate: trip.metadata?.planning || null } }];

    for (const stop of trip.stops) for (const attempt of stop.attempts || []) if (Number(attempt.additional_cost) > 0) lines.push({ concept: `NOVEDAD_${attempt.id}`, quantity: 1, unit_rate: Number(attempt.additional_cost), source: "intento", recoverable: attempt.recoverable, support: { attempt_id: attempt.id, cause: attempt.cause_code, evidence: attempt.evidence } });

    const normalized = settlementLines(lines);

    const total = Math.round(normalized.reduce((sum, line) => sum + line.total, 0) * 100) / 100;

    return { trip_id: trip.id, currency: trip.currency, lines: normalized, total, recoverable: normalized.filter(l => l.recoverable).reduce((sum,l) => sum+l.total,0), variance: total - Number(trip.committed_cost), estimated_cost: Number(trip.estimated_cost), committed_cost: Number(trip.committed_cost) };

  });

}

async function createSettlement(tenantId, user, tripId, input) {

  return prisma.runWithTenant(tenantId, async () => {

    const trip = await prisma.transportTrip.findFirstOrThrow({ where: { id: Number(tripId) } });

    if (trip.status !== "entregado") throw appError(409, "TMS_TRIP_NOT_SETTLEABLE", "Solo un viaje entregado y abierto puede liquidarse.");

    if (await prisma.transportSettlement.findFirst({ where: { trip_id: trip.id, status: { in: ["borrador", "aprobada"] } } })) throw appError(409, "TMS_SETTLEMENT_EXISTS", "El viaje ya tiene una liquidacion vigente.");

    if (input.currency && input.currency !== trip.currency) throw appError(400, "TMS_CURRENCY_MISMATCH", "La moneda debe coincidir con el viaje.");

    const preview = await previewSettlement(tenantId, tripId);

    const lines = settlementLines(input.lines || preview.lines).map(line => ({ ...line, tenant_id: String(tenantId) }));

    // No manual replacement of the automatic basis: keep every auditable operational concept.

    for (const expected of preview.lines) if (!lines.some(line => line.concept === expected.concept && line.total === expected.total && line.recoverable === expected.recoverable)) throw appError(400, "TMS_SETTLEMENT_BASIS_CHANGED", "La liquidacion debe conservar el flete y todas las novedades registradas.");

    const total = Math.round(lines.reduce((sum, line) => sum + line.total, 0) * 100) / 100;

    return prisma.transportSettlement.create({ data: { code: normalizedCode(input.code), trip_id: trip.id, estimated_cost: trip.estimated_cost, committed_cost: trip.committed_cost, liquidated_cost: total, currency: trip.currency, metadata: input.metadata || {}, created_by: user?.id || null, lines: { create: lines } }, include: { lines: true } });

  });

}

async function approveSettlement(tenantId, user, id) {

  return prisma.runWithTenant(tenantId, async () => {

    const settlement = await prisma.transportSettlement.findFirstOrThrow({ where: { id: Number(id) }, include: { lines: true } });

    const trip = await prisma.transportTrip.findFirstOrThrow({ where: { id: settlement.trip_id } });

    if (trip.status !== "entregado" || settlement.status !== "borrador") throw appError(409, "TMS_SETTLEMENT_NOT_DRAFT", "Se requiere una liquidacion pendiente y un viaje entregado abierto.");

    settlementLines(settlement.lines);

    const updated = await prisma.transportSettlement.update({ where: { id: settlement.id }, data: { status: "aprobada", approved_by: user?.id || null, approved_at: new Date() }, include: { lines: true } });

    await prisma.transportTrip.update({ where: { id: trip.id }, data: { actual_cost: settlement.liquidated_cost, version: { increment: 1 } } });

    await prisma.transportTripEvent.create({ data: { trip_id: trip.id, event_type: "LIQUIDACION_APROBADA", actor_id: user?.id || null, data: { settlement_id: settlement.id } } });

    return updated;

  });

}



async function getControlTower(tenantId) {

  return prisma.runWithTenant(tenantId, async () => {

    const trips = await prisma.transportTrip.findMany({ where: { status: { notIn: ["cerrado", "cancelado"] } }, include: { stops: true, settlements: true } });

    const now = new Date();

    const exceptions = [];

    for (const trip of trips) {

      const hasApprovedSettlement = trip.settlements.some((settlement) => settlement.status === "aprobada");

      if (["planificado", "ofertado", "asignado"].includes(trip.status) && (!trip.vehicle_id || !trip.driver_id)) {

        exceptions.push({ trip_id: trip.id, code: trip.code, kind: "asignacion_pendiente", severity: "alta", message: "El viaje no tiene vehiculo y conductor asignados.", action: "Asignar recursos" });

      } else if (trip.status === "asignado" && trip.metadata?.packing_required && !trip.metadata?.packing) {

        exceptions.push({ trip_id: trip.id, code: trip.code, kind: "cubicaje_pendiente", severity: "alta", message: "El viaje asignado requiere cubicaje antes del cargue.", action: "Revisar cubicaje" });

      } else if (trip.planned_arrival && trip.planned_arrival < now && !["entregado", "cerrado"].includes(trip.status)) {

        exceptions.push({ trip_id: trip.id, code: trip.code, kind: "entrega_vencida", severity: "media", message: "La llegada planificada ya vencio con paradas pendientes.", action: "Revisar ruta" });

      } else if (trip.status === "entregado" && !hasApprovedSettlement) {

        exceptions.push({ trip_id: trip.id, code: trip.code, kind: "liquidacion_pendiente", severity: "media", message: "El viaje esta entregado sin liquidacion aprobada.", action: "Liquidar viaje" });

      }

    }

    return {

      total: trips.length,

      normal: trips.filter((trip) => !trip.planned_arrival || trip.planned_arrival >= now).length,

      at_risk: trips.filter((trip) => trip.planned_arrival && trip.planned_arrival < now && !["entregado", "cerrado"].includes(trip.status)).length,

      in_execution: trips.filter((trip) => ["despachado", "en_transito"].includes(trip.status)).length,

      pending_delivery: trips.reduce((sum, trip) => sum + trip.stops.filter((stop) => stop.status !== "completa").length, 0),

      exceptions,

      trips

    };

  });

}



module.exports = {

  TRIP_TRANSITIONS, ATTEMPT_RESULTS, assertTripTransition, needValidationErrors, vehicleCapacityKg, haversineKm, optimizeStopOrder, calculateRateQuote, gpsPositionData, calculateLiveStatus, turfSpatialStatus, validRouteCoordinates, validatePodInput, validateAttemptInput,

  getTmsConfig, saveTmsConfig, listCarriers, saveCarrier, listDrivers, saveDriver, listOrigins, saveOrigin, listDeliveryPoints, saveDeliveryPoint,

  listRateCards, saveRateCard, versionRateCard, activateRateCard, deactivateRateCard, createNeed, listNeeds, getPlanningWorkbench, evaluatePlan, commitPlan,

  createTrip, listTrips, getTrip, assignTrip, transitionTrip, recordTripEvent, registerDeliveryAttempt,

  getOrder, updateOrder, cancelOrder, importOrdersCsv, getOrderTracking, getOrderPod, parseCsv, recordGpsBatch, getTripTracking, recordStopVisit, getLiveMonitoring, listNotifications, sendNotification, listPods, getPod, getPodStats, previewSettlement, settlementLines, remainingDeliveryLines, createSettlement, approveSettlement, getControlTower

};



for (const name of ["createNeed", "createTrip", "commitPlan", "assignTrip", "transitionTrip", "registerDeliveryAttempt", "createSettlement", "approveSettlement", "updateOrder", "cancelOrder", "importOrdersCsv", "saveTmsConfig", "recordStopVisit"]) module.exports[name] = atomicMutation(module.exports[name]);
