require("./load-env")();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function day(value) {
  const date = new Date(`${value}T00:00:00-05:00`);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function at(date, time) {
  return new Date(`${date}T${time}:00-05:00`);
}

function time(date) {
  return date.toTimeString().slice(0, 5);
}

async function ensureEmployee(tenantId, code, name) {
  return prisma.employee.upsert({
    where: { tenant_id_code: { tenant_id: tenantId, code } },
    update: { active: true, metadata: { name, document: "", company: "Demo APEX", labor_status: "activo", demo_map: true } },
    create: {
      tenant_id: tenantId,
      code,
      position: "tecnico",
      department: "Operacion",
      salary_base: 1800000,
      salary_type: "monthly",
      hire_date: new Date(),
      contract_type: "indefinite",
      metadata: { name, document: "", company: "Demo APEX", labor_status: "activo", demo_map: true }
    }
  });
}

async function ensureVehicle(tenantId, plate, type) {
  return prisma.vehicle.upsert({
    where: { tenant_id_plate: { tenant_id: tenantId, plate } },
    update: { status: "activo", type, model: "Demo operativo" },
    create: { tenant_id: tenantId, plate, type, model: "Demo operativo", brand: "APEX", status: "activo", metadata: { demo_map: true } }
  });
}

async function createRouteScenario(tenantId, config) {
  const routeDate = day(config.date);
  const existing = await prisma.timeRoute.findFirst({
    where: { tenant_id: tenantId, date: routeDate, vehicle_plate: config.plate, notes: config.notes }
  });
  const route = existing || await prisma.timeRoute.create({
    data: {
      tenant_id: tenantId,
      date: routeDate,
      vehicle_plate: config.plate,
      employees: config.users,
      start_time: config.start,
      end_time: config.end,
      tolerance_minutes: 15,
      per_diem: 25000,
      notes: config.notes,
      status: config.status
    }
  });

  for (const user of config.users) {
    await prisma.timePunch.deleteMany({ where: { tenant_id: tenantId, route_id: route.id, user_name: user } });
    await prisma.gpsPing.deleteMany({ where: { tenant_id: tenantId, route_id: route.id, user_name: user } });
    const points = config.points[user];
    for (const point of points) {
      const when = at(config.date, point.time);
      await prisma.timePunch.create({
        data: {
          tenant_id: tenantId,
          employee_id: config.employeeIds[user],
          user_name: user,
          type: point.type,
          punched_at: when,
          date: routeDate,
          time: time(when),
          latitude: point.lat,
          longitude: point.lng,
          accuracy_meters: point.accuracy || 18,
          vehicle_plate: config.plate,
          route_id: route.id,
          extra_minutes: point.extra || 0,
          metadata: { demo_map: true, checkpoint: point.label }
        }
      });
      await prisma.gpsPing.create({
        data: {
          tenant_id: tenantId,
          employee_id: config.employeeIds[user],
          user_name: user,
          vehicle_plate: config.plate,
          route_id: route.id,
          latitude: point.lat,
          longitude: point.lng,
          accuracy_meters: point.accuracy || 18,
          captured_at: when,
          source: "demo_route_mark",
          metadata: { demo_map: true, checkpoint: point.label, punch_type: point.type }
        }
      });
    }
  }
  return route;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: "demo@apex.local" } });
  if (!admin) throw new Error("Ejecuta primero npm run seed:demo");
  const tenantId = admin.tenant_id;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const employees = await Promise.all([
    ensureEmployee(tenantId, "tec-demo-ruta-1", "Carlos Ruta Demo"),
    ensureEmployee(tenantId, "tec-demo-ruta-2", "Laura Ruta Demo"),
    ensureEmployee(tenantId, "tec-demo-offline", "Miguel Ultima Huella")
  ]);
  await Promise.all([
    ensureVehicle(tenantId, "MAP-101", "Camioneta"),
    ensureVehicle(tenantId, "MAP-202", "Moto")
  ]);
  const employeeIds = Object.fromEntries(employees.map((employee) => [employee.code, employee.id]));

  const routeClosed = await createRouteScenario(tenantId, {
    date: yesterday,
    plate: "MAP-101",
    users: ["tec-demo-ruta-1", "tec-demo-ruta-2"],
    employeeIds,
    start: "07:30",
    end: "17:00",
    status: "closed",
    notes: "DEMO_MAP_HISTORICO_CERRADO",
    points: {
      "tec-demo-ruta-1": [
        { type: "entrada", time: "07:34", lat: 4.71099, lng: -74.07209, label: "bodega" },
        { type: "inicio_almuerzo", time: "12:10", lat: 4.69572, lng: -74.08351, label: "cliente norte" },
        { type: "fin_almuerzo", time: "13:05", lat: 4.68611, lng: -74.07594, label: "retorno" },
        { type: "salida", time: "17:18", lat: 4.65026, lng: -74.06109, label: "cierre", extra: 18 }
      ],
      "tec-demo-ruta-2": [
        { type: "entrada", time: "07:38", lat: 4.7118, lng: -74.0712, label: "bodega" },
        { type: "inicio_almuerzo", time: "12:03", lat: 4.7245, lng: -74.0914, label: "cliente oeste" },
        { type: "fin_almuerzo", time: "12:58", lat: 4.7186, lng: -74.1041, label: "retorno" },
        { type: "salida", time: "16:54", lat: 4.7017, lng: -74.1168, label: "cierre" }
      ]
    }
  });

  const routeOffline = await createRouteScenario(tenantId, {
    date: today,
    plate: "MAP-202",
    users: ["tec-demo-offline"],
    employeeIds,
    start: "08:00",
    end: "16:00",
    status: "active",
    notes: "DEMO_MAP_ULTIMA_HUELLA",
    points: {
      "tec-demo-offline": [
        { type: "entrada", time: "08:02", lat: 4.66891, lng: -74.05631, label: "inicio zona sin senal" }
      ]
    }
  });

  console.log(JSON.stringify({
    ok: true,
    tenantId,
    escenarios: [
      { nombre: "Historico cerrado", fecha: yesterday, ruta_id: routeClosed.id, placa: "MAP-101" },
      { nombre: "Ultima huella offline", fecha: today, ruta_id: routeOffline.id, placa: "MAP-202" }
    ]
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
