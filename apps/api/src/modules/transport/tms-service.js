const prisma = require("../../core/prisma");

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
    const route = optimizeStopOrder(origin, foundNeeds, input);
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
    quotes.sort((left, right) => {
      if (strategy === "service") return right.carrier_score - left.carrier_score || left.total - right.total || left.priority - right.priority;
      if (strategy === "priority") return left.priority - right.priority || left.total - right.total;
      return left.total - right.total || right.carrier_score - left.carrier_score || left.priority - right.priority;
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
      where: { id: Number(id) }, include: { origin: true, carrier: true, driver: true, needs: { include: { need: { include: { delivery_point: true, lines: true } } } }, stops: { include: { delivery_point: true, attempts: { include: { pod: true } } }, orderBy: { sequence: "asc" } }, events: { orderBy: { occurred_at: "asc" } }, settlements: { include: { lines: true } } }
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
    const carrierId = input.carrier_id || driver.carrier_id || null;
    if (carrierId) await prisma.transportCarrier.findFirstOrThrow({ where: { id: Number(carrierId), status: "activo" } });
    const updated = await prisma.transportTrip.update({ where: { id: trip.id }, data: { carrier_id: carrierId, vehicle_id: vehicle.id, vehicle_plate: vehicle.plate, driver_id: driver.id, committed_cost: numberValue(input.committed_cost), status: "asignado", version: { increment: 1 } } });
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
    if (next === "entregado" && trip.stops.some((stop) => !TERMINAL_STOP_RESULTS.has(stop.status))) throw appError(409, "TMS_STOPS_PENDING", "Todas las paradas deben tener resultado de entrega.");
    if (next === "cerrado" && !trip.settlements.some((settlement) => settlement.status === "aprobada")) throw appError(409, "TMS_SETTLEMENT_REQUIRED", "Se requiere una liquidacion aprobada para cerrar el viaje.");
    const now = dateValue(input.occurred_at, "Fecha del evento") || new Date();
    const data = { status: next, version: { increment: 1 } };
    if (next === "despachado") data.actual_departure = now;
    if (next === "entregado") data.actual_arrival = now;
    const updated = await prisma.transportTrip.update({ where: { id: trip.id }, data });
    const needStatus = { despachado: "despachada", en_transito: "en_transito", entregado: "entregada", cerrado: "cerrada", cancelado: "pendiente" }[next];
    if (needStatus) await prisma.transportNeed.updateMany({ where: { tenant_id: String(tenantId), trip_links: { some: { trip_id: trip.id } } }, data: { status: needStatus } });
    await prisma.transportTripEvent.create({ data: { trip_id: trip.id, event_type: `ESTADO_${next.toUpperCase()}`, occurred_at: now, actor_id: user?.id || null, observation: input.reason || null, data: { previous_status: trip.status, new_status: next } } });
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
    const stop = await prisma.transportStop.findFirstOrThrow({ where: { id: Number(stopId), trip_id: Number(tripId) }, include: { trip: true } });
    if (!["despachado", "en_transito"].includes(stop.trip.status)) throw appError(409, "TMS_TRIP_NOT_IN_EXECUTION", "El viaje debe estar despachado o en transito.");
    if (!ATTEMPT_RESULTS.has(input.result)) throw appError(400, "TMS_INVALID_ATTEMPT_RESULT", "Resultado de entrega no reconocido.");
    if (["completa", "parcial"].includes(input.result) && (!input.pod || !String(input.pod.receiver_name || "").trim())) throw appError(400, "TMS_POD_REQUIRED", "La entrega completa o parcial requiere receptor en el POD.");
    const count = await prisma.transportDeliveryAttempt.count({ where: { stop_id: stop.id } });
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
    return attempt;
  });
}

async function createSettlement(tenantId, user, tripId, input) {
  return prisma.runWithTenant(tenantId, async () => {
    const trip = await prisma.transportTrip.findFirstOrThrow({ where: { id: Number(tripId) } });
    if (!['entregado', 'cerrado'].includes(trip.status)) throw appError(409, "TMS_TRIP_NOT_SETTLEABLE", "El viaje debe estar entregado para liquidarse.");
    const lines = input.lines.map((line) => {
      const quantity = numberValue(line.quantity, 1);
      const unitRate = numberValue(line.unit_rate);
      return { tenant_id: String(tenantId), concept: String(line.concept || "").trim(), quantity, unit_rate: unitRate, total: numberValue(line.total, quantity * unitRate), source: line.source || null, support: line.support || {}, recoverable: line.recoverable === true, approved_by: line.approved_by || null, metadata: line.metadata || {} };
    });
    if (lines.some((line) => !line.concept)) throw appError(400, "TMS_SETTLEMENT_CONCEPT_REQUIRED", "Cada linea requiere un concepto.");
    const total = lines.reduce((sum, line) => sum + line.total, 0);
    return prisma.transportSettlement.create({ data: { code: normalizedCode(input.code), trip_id: trip.id, estimated_cost: trip.estimated_cost, committed_cost: trip.committed_cost, liquidated_cost: total, currency: input.currency || trip.currency, metadata: input.metadata || {}, created_by: user?.id || null, lines: { create: lines } }, include: { lines: true } });
  });
}

async function approveSettlement(tenantId, user, id) {
  return prisma.runWithTenant(tenantId, async () => {
    const settlement = await prisma.transportSettlement.findFirstOrThrow({ where: { id: Number(id) } });
    if (settlement.status !== "borrador") throw appError(409, "TMS_SETTLEMENT_NOT_DRAFT", "Solo una liquidacion en borrador puede aprobarse.");
    const updated = await prisma.transportSettlement.update({ where: { id: settlement.id }, data: { status: "aprobada", approved_by: user?.id || null, approved_at: new Date() }, include: { lines: true } });
    await prisma.transportTrip.update({ where: { id: settlement.trip_id }, data: { actual_cost: settlement.liquidated_cost, version: { increment: 1 } } });
    await prisma.transportTripEvent.create({ data: { trip_id: settlement.trip_id, event_type: "LIQUIDACION_APROBADA", actor_id: user?.id || null, data: { settlement_id: settlement.id } } });
    return updated;
  });
}

async function getControlTower(tenantId) {
  return prisma.runWithTenant(tenantId, async () => {
    const trips = await prisma.transportTrip.findMany({ where: { status: { notIn: ["cerrado", "cancelado"] } }, include: { stops: true } });
    const now = new Date();
    return {
      total: trips.length,
      normal: trips.filter((trip) => !trip.planned_arrival || trip.planned_arrival >= now).length,
      at_risk: trips.filter((trip) => trip.planned_arrival && trip.planned_arrival < now && !["entregado", "cerrado"].includes(trip.status)).length,
      in_execution: trips.filter((trip) => ["despachado", "en_transito"].includes(trip.status)).length,
      pending_delivery: trips.reduce((sum, trip) => sum + trip.stops.filter((stop) => !TERMINAL_STOP_RESULTS.has(stop.status)).length, 0),
      trips
    };
  });
}

module.exports = {
  TRIP_TRANSITIONS, ATTEMPT_RESULTS, assertTripTransition, needValidationErrors, vehicleCapacityKg, haversineKm, optimizeStopOrder, calculateRateQuote,
  listCarriers, saveCarrier, listDrivers, saveDriver, listOrigins, saveOrigin, listDeliveryPoints, saveDeliveryPoint,
  listRateCards, saveRateCard, versionRateCard, activateRateCard, deactivateRateCard, createNeed, listNeeds, getPlanningWorkbench, evaluatePlan, commitPlan,
  createTrip, listTrips, getTrip, assignTrip, transitionTrip, recordTripEvent, registerDeliveryAttempt,
  createSettlement, approveSettlement, getControlTower
};
