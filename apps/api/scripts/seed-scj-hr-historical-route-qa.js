const assert = require("node:assert/strict");
const prisma = require("../src/core/prisma");

const TENANT_ID = "cbbf3627-4336-4f23-95c6-1077414bcd17";
const PROJECT_REF = "jbirkghkekuifgfsgquq";
const SOURCE = "scj_hr_historical_trace_20260909_v1";
const ROUTE_NOTE = `Origen: ${SOURCE}`;
const DATE = "2026-09-09";
const VEHICLE = "QA-HIST-01";

function at(time) {
  return new Date(`${DATE}T${time}:00-05:00`);
}

const marks = [
  ["entrada", "08:00", 4.68135, -74.04815],
  ["inicio_almuerzo", "12:00", 4.6681, -74.0866],
  ["fin_almuerzo", "13:00", 4.65755, -74.1108],
  ["salida", "17:00", 4.68195, -74.14155]
];

const track = [
  ["08:00", 4.68135, -74.04815], ["08:25", 4.6768, -74.0552],
  ["08:50", 4.6729, -74.0648], ["09:20", 4.6706, -74.0742],
  ["10:00", 4.6689, -74.0811], ["12:00", 4.6681, -74.0866],
  ["12:35", 4.6637, -74.0974], ["13:00", 4.65755, -74.1108],
  ["13:35", 4.6532, -74.1197], ["14:10", 4.6588, -74.1278],
  ["15:00", 4.6674, -74.1345], ["16:00", 4.6761, -74.1391],
  ["17:00", 4.68195, -74.14155]
];

async function summarize(route, employee) {
  const [punches, pings, sessions] = await Promise.all([
    prisma.timePunch.findMany({ where: { tenant_id: TENANT_ID, route_id: route.id }, orderBy: { punched_at: "asc" } }),
    prisma.gpsPing.findMany({ where: { tenant_id: TENANT_ID, route_id: route.id }, orderBy: { captured_at: "asc" } }),
    prisma.workSession.count({ where: { tenant_id: TENANT_ID, route_id: route.id, employee_id: employee.id } })
  ]);
  assert.deepEqual(punches.map((item) => item.type), marks.map((item) => item[0]), "Las cuatro marcaciones historicas no estan completas y ordenadas.");
  assert.equal(pings.length, track.length, "La huella GPS historica no esta completa.");
  assert.equal(sessions, 1, "La jornada historica debe tener una sesion cerrada.");
  return {
    source: SOURCE,
    tenant: "SCJ",
    date: DATE,
    route_id: route.id,
    employee_id: employee.id,
    employee_email: employee.user.email,
    vehicle_plate: VEHICLE,
    punches: punches.length,
    punch_types: punches.map((item) => item.type),
    gps_points: pings.length,
    work_sessions: sessions,
    map_path: "/dashboard/talento-humano/mapa",
    map_mode: "historico"
  };
}

async function main() {
  assert.equal(process.env.CERTIFICATION_TARGET, "qa", "CERTIFICATION_TARGET debe ser qa.");
  assert.ok(String(process.env.DATABASE_URL || "").includes(PROJECT_REF), "DATABASE_URL debe corresponder a Supabase QA.");
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
  assert.ok(tenant?.active, "Tenant SCJ no disponible.");
  const employee = await prisma.employee.findFirst({
    where: { tenant_id: TENANT_ID, active: true, user: { email: "juliana@apexos.local", active: true } },
    include: { user: { select: { email: true, name: true } } }
  });
  assert.ok(employee, "Juliana no tiene empleado activo en SCJ.");
  const existing = await prisma.timeRoute.findFirst({ where: { tenant_id: TENANT_ID, notes: ROUTE_NOTE } });
  if (existing) {
    console.log(JSON.stringify({ reused: true, ...(await summarize(existing, employee)) }));
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const route = await tx.timeRoute.create({ data: {
      tenant_id: TENANT_ID,
      date: at("00:00"),
      vehicle_plate: VEHICLE,
      employees: [employee.code],
      start_time: "08:00",
      end_time: "17:00",
      tolerance_minutes: 15,
      notes: ROUTE_NOTE,
      status: "closed"
    } });
    const punches = [];
    for (const [type, time, latitude, longitude] of marks) {
      punches.push(await tx.timePunch.create({ data: {
        tenant_id: TENANT_ID,
        employee_id: employee.id,
        user_name: employee.code,
        type,
        punched_at: at(time),
        date: at("00:00"),
        time,
        latitude,
        longitude,
        accuracy_meters: 8,
        vehicle_plate: VEHICLE,
        route_id: route.id,
        metadata: { source: SOURCE, simulated: true, historical: true },
        idempotency_key: `${SOURCE}:${type}`
      } }));
    }
    await tx.gpsPing.createMany({ data: track.map(([time, latitude, longitude], index) => ({
      tenant_id: TENANT_ID,
      user_name: employee.code,
      employee_id: employee.id,
      vehicle_plate: VEHICLE,
      route_id: route.id,
      latitude,
      longitude,
      accuracy_meters: 6 + (index % 4),
      source: "qa_historical_seed",
      captured_at: at(time),
      metadata: { source: SOURCE, simulated: true, sequence: index + 1 }
    })) });
    await tx.workSession.create({ data: {
      tenant_id: TENANT_ID,
      employee_id: employee.id,
      user_name: employee.code,
      date: at("00:00"),
      status: "cerrada",
      started_at: at("08:00"),
      lunch_started_at: at("12:00"),
      lunch_ended_at: at("13:00"),
      closed_at: at("17:00"),
      entry_punch_id: punches[0].id,
      exit_punch_id: punches[3].id,
      route_id: route.id,
      vehicle_plate: VEHICLE,
      metadata: { source: SOURCE, simulated: true, historical: true }
    } });
    return route;
  }, { maxWait: 10000, timeout: 20000 });
  console.log(JSON.stringify({ reused: false, ...(await summarize(result, employee)) }));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
