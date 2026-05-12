const prisma = require("../../core/prisma");

function dateOrNull(value) {
  return value ? new Date(value) : null;
}

function vehicleData(input) {
  return {
    plate: input.plate.toUpperCase().trim(),
    model: input.model || "",
    type: input.type || "",
    brand: input.brand || "",
    year: input.year,
    color: input.color || "",
    engine_displacement: input.engine_displacement || "",
    load_capacity: input.load_capacity || "",
    fuel: input.fuel || "",
    mileage: Number(input.mileage || 0),
    serial_number: input.serial_number || "",
    engine_number: input.engine_number || "",
    soat_expires: dateOrNull(input.soat_expires),
    technical_review_expires: dateOrNull(input.technical_review_expires),
    insurance_expires: dateOrNull(input.insurance_expires),
    owner: input.owner || "",
    notes: input.notes || "",
    status: input.status || "activo",
    metadata: input.metadata || {}
  };
}

async function listVehicles(tenantId, query = {}) {
  return prisma.runWithTenant(tenantId, async () => prisma.vehicle.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {})
    },
    orderBy: { plate: "asc" }
  }));
}

async function createVehicle(tenantId, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.vehicle.create({ data: vehicleData(input) }));
}

async function updateVehicle(tenantId, id, input) {
  return prisma.runWithTenant(tenantId, async () => prisma.vehicle.update({
    where: { id: Number(id) },
    data: vehicleData(input)
  }));
}

async function getVehicle(tenantId, id) {
  return prisma.runWithTenant(tenantId, async () => prisma.vehicle.findFirstOrThrow({ where: { id: Number(id) } }));
}

module.exports = { listVehicles, createVehicle, updateVehicle, getVehicle };
