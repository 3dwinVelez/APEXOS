require("./load-env")();

const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PASSWORD = "ApexOS-QA-2026!";
const MODULES = ["M-17", "M-26", "M-14", "M-22"];
const BASE_DATE = new Date("2026-05-18T05:00:00.000Z");
const ORGS = [
  { key: "scj", name: "SCJ", domain: "scj.qa", city: "Bogota", lat: 4.711, lon: -74.0721 },
  { key: "puebla", name: "Puebla Operaciones", domain: "puebla.qa", city: "Puebla", lat: 19.0414, lon: -98.2063 }
];

function day(offset) {
  const d = new Date(BASE_DATE);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

function at(date, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setUTCHours(h + 5, m, 0, 0);
  return d;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 5, 0, 0, 0));
}

function time(date) {
  return date.toISOString().slice(11, 16);
}

async function ensureRole(tenantId, name, permissions) {
  const role = await prisma.role.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name } },
    update: { description: `${name} QA`, is_system: true },
    create: { tenant_id: tenantId, name, description: `${name} QA`, is_system: true }
  });
  await prisma.permission.deleteMany({ where: { role_id: role.id } });
  await prisma.permission.createMany({
    data: permissions.map(([module, action]) => ({ role_id: role.id, module, action })),
    skipDuplicates: true
  });
  return role;
}

async function seedTenant(org) {
  const tenant = await prisma.tenant.upsert({
    where: { domain: org.domain },
    update: {
      name: org.name,
      plan: "qa_operativo",
      active_modules: MODULES,
      active: true,
      config: { demo_seed: "scj-puebla-ops", city: org.city }
    },
    create: {
      name: org.name,
      domain: org.domain,
      industry: "servicios_operativos",
      plan: "qa_operativo",
      active_modules: MODULES,
      country: org.key === "puebla" ? "MX" : "CO",
      currency: org.key === "puebla" ? "MXN" : "COP",
      timezone: "America/Bogota",
      config: { demo_seed: "scj-puebla-ops", city: org.city }
    }
  });

  const adminRole = await ensureRole(tenant.id, "APEX_ADMIN", [["*", "*"]]);
  const techRole = await ensureRole(tenant.id, "Tecnico", [["services", "read"], ["services", "write"], ["hr", "read"], ["hr", "write"], ["transport", "read"]]);
  const employeeRole = await ensureRole(tenant.id, "Empleado", [["hr", "read"], ["hr", "write"], ["services", "read"]]);

  await prisma.subscription.upsert({
    where: { tenant_id: tenant.id },
    update: { plan: "qa_operativo", status: "active", price_monthly: 0 },
    create: { tenant_id: tenant.id, plan: "qa_operativo", status: "active", price_monthly: 0 }
  });

  const admin = await prisma.user.upsert({
    where: { tenant_id_email: { tenant_id: tenant.id, email: `admin@${org.domain}` } },
    update: { name: `Admin ${org.name}`, active: true, role_id: adminRole.id },
    create: { tenant_id: tenant.id, name: `Admin ${org.name}`, email: `admin@${org.domain}`, password: await bcrypt.hash(PASSWORD, 12), role_id: adminRole.id }
  });

  const employees = [];
  for (let i = 1; i <= 10; i += 1) {
    const isTech = i <= 5;
    const code = `${org.key.toUpperCase()}-${String(i).padStart(3, "0")}`;
    const user = await prisma.user.upsert({
      where: { tenant_id_email: { tenant_id: tenant.id, email: `${code.toLowerCase()}@${org.domain}` } },
      update: { name: `${isTech ? "Tecnico" : "Empleado"} ${org.name} ${i}`, active: true, role_id: isTech ? techRole.id : employeeRole.id },
      create: {
        tenant_id: tenant.id,
        name: `${isTech ? "Tecnico" : "Empleado"} ${org.name} ${i}`,
        email: `${code.toLowerCase()}@${org.domain}`,
        password: await bcrypt.hash(PASSWORD, 12),
        role_id: isTech ? techRole.id : employeeRole.id
      }
    });
    const employee = await prisma.employee.upsert({
      where: { tenant_id_code: { tenant_id: tenant.id, code } },
      update: {
        user_id: user.id,
        position: isTech ? "tecnico" : "operario",
        active: true,
        metadata: { name: user.name, company: org.name, demo_seed: true, user_email: user.email }
      },
      create: {
        tenant_id: tenant.id,
        user_id: user.id,
        code,
        position: isTech ? "tecnico" : "operario",
        department: isTech ? "Servicios" : "Operacion",
        salary_base: 0,
        hire_date: new Date("2026-01-15T05:00:00.000Z"),
        metadata: { name: user.name, company: org.name, demo_seed: true, user_email: user.email }
      },
      include: { user: true }
    });
    employees.push(employee);
  }

  const vehicles = [];
  for (let i = 1; i <= 5; i += 1) {
    vehicles.push(await prisma.vehicle.upsert({
      where: { tenant_id_plate: { tenant_id: tenant.id, plate: `${org.key.toUpperCase()}-${100 + i}` } },
      update: { status: "activo", metadata: { demo_seed: true } },
      create: {
        tenant_id: tenant.id,
        plate: `${org.key.toUpperCase()}-${100 + i}`,
        brand: ["Toyota", "Renault", "Nissan", "Chevrolet", "Ford"][i - 1],
        model: ["Hilux", "Kangoo", "Frontier", "NHR", "Transit"][i - 1],
        type: i <= 3 ? "camioneta" : "van",
        year: 2020 + i,
        color: ["Blanco", "Gris", "Azul", "Rojo", "Negro"][i - 1],
        mileage: 18000 + i * 2400,
        owner: org.name,
        metadata: { demo_seed: true, assigned_zone: org.city }
      }
    }));
  }

  for (let i = 1; i <= 100; i += 1) {
    const code = `${org.key.toUpperCase()}-REF-${String(i).padStart(3, "0")}`;
    await prisma.serviceReference.upsert({
      where: { tenant_id_code: { tenant_id: tenant.id, code } },
      update: {
        name: `Referencia operativa ${i}`,
        estimated_minutes: 35 + (i % 8) * 10,
        active: true,
        metadata: { demo_seed: true, scenario: i % 5 === 0 ? "requiere_inspeccion" : "estandar" }
      },
      create: {
        tenant_id: tenant.id,
        code,
        name: `Referencia operativa ${i}`,
        category: i % 3 === 0 ? "electrodomesticos" : "muebles",
        description: `Referencia demo ${i} para validar servicios end to end.`,
        estimated_minutes: 35 + (i % 8) * 10,
        brand: ["Apex", "Nova", "Andes", "Metro"][i % 4],
        model: `M-${String(2000 + i)}`,
        metadata: { demo_seed: true },
        parts: {
          create: [
            { tenant_id: tenant.id, name: "Kit principal", quantity: 1, unit: "und", display_order: 1 },
            { tenant_id: tenant.id, name: "Tornilleria", quantity: 4 + (i % 6), unit: "und", display_order: 2 }
          ]
        }
      }
    });
  }

  const seededEmployeeIds = employees.map((employee) => employee.id);
  await prisma.timePunch.deleteMany({ where: { tenant_id: tenant.id, employee_id: { in: seededEmployeeIds }, date: { gte: day(-5), lte: day(1) } } });
  await prisma.gpsPing.deleteMany({ where: { tenant_id: tenant.id, employee_id: { in: seededEmployeeIds }, captured_at: { gte: day(-5), lte: day(1) } } });
  await prisma.timeRoute.deleteMany({ where: { tenant_id: tenant.id, notes: { contains: "seed-scj-puebla" } } });

  const routes = [];
  for (let d = -4; d <= 0; d += 1) {
    const assigned = employees.slice(0, 5).map((employee) => employee.code);
    const route = await prisma.timeRoute.create({
      data: {
        tenant_id: tenant.id,
        date: startOfDay(day(d)),
        vehicle_plate: vehicles[Math.abs(d) % vehicles.length].plate,
        employees: assigned,
        start_time: "08:00",
        end_time: d === -1 ? "16:30" : "17:00",
        tolerance_minutes: 15,
        status: d < 0 ? "closed" : "active",
        notes: `seed-scj-puebla ${org.key} dia ${d}`
      }
    });
    routes.push(route);
  }

  for (const route of routes) {
    const date = route.date;
    const isExtraDay = route.end_time === "16:30";
    for (const employee of employees.slice(0, 5)) {
      const punchTimes = [
        ["entrada", "08:00"],
        ["inicio_almuerzo", "12:00"],
        ["fin_almuerzo", "13:00"],
        ["salida", isExtraDay ? "18:10" : "17:03"]
      ];
      for (let index = 0; index < punchTimes.length; index += 1) {
        const [type, hhmm] = punchTimes[index];
        const punchedAt = at(date, hhmm);
        const extra = type === "salida" && isExtraDay ? 85 : 0;
        await prisma.timePunch.create({
          data: {
            tenant_id: tenant.id,
            employee_id: employee.id,
            user_name: employee.code,
            type,
            punched_at: punchedAt,
            date: startOfDay(date),
            time: time(punchedAt),
            latitude: org.lat + index * 0.004 + employee.id * 0.00001,
            longitude: org.lon - index * 0.004 - employee.id * 0.00001,
            accuracy_meters: 12 + index,
            vehicle_plate: route.vehicle_plate,
            route_id: route.id,
            extra_minutes: extra,
            extra_reason: extra ? "Cierre de instalacion extendido por autorizacion del cliente" : null,
            metadata: { demo_seed: true, scenario: extra ? "overtime_justified" : "regular" }
          }
        });
      }
    }
    for (let p = 0; p < 6; p += 1) {
      await prisma.gpsPing.create({
        data: {
          tenant_id: tenant.id,
          employee_id: employees[p % 5].id,
          user_name: employees[p % 5].code,
          vehicle_plate: route.vehicle_plate,
          route_id: route.id,
          latitude: org.lat + p * 0.006,
          longitude: org.lon - p * 0.006,
          accuracy_meters: 10 + p,
          source: p === 5 ? "offline_sync" : "mobile_live_presence",
          captured_at: at(date, `1${p}:20`),
          metadata: { demo_seed: true, offline_recovered: p === 5 }
        }
      });
    }
  }

  const refs = await prisma.serviceReference.findMany({ where: { tenant_id: tenant.id }, take: 8, orderBy: { code: "asc" } });
  const statuses = ["pendiente", "en_curso", "inspeccion", "ejecucion", "cerrada", "no_ejecutada", "cerrada", "cancelada"];
  for (let i = 0; i < statuses.length; i += 1) {
    const number = `${org.key.toUpperCase()}-OS-${String(i + 1).padStart(3, "0")}`;
    const status = statuses[i];
    const order = await prisma.serviceOrder.upsert({
      where: { tenant_id_number: { tenant_id: tenant.id, number } },
      update: {
        status,
        technician_id: employees[i % 5].id,
        scheduled_date: day(i - 4),
        started_at: ["en_curso", "inspeccion", "ejecucion", "cerrada", "no_ejecutada"].includes(status) ? at(day(i - 4), "09:10") : null,
        closed_at: ["cerrada", "no_ejecutada"].includes(status) ? at(day(i - 4), "16:40") : null,
        metadata: { demo_seed: true, scenario: status }
      },
      create: {
        tenant_id: tenant.id,
        number,
        reference_id: refs[i % refs.length].id,
        technician_id: employees[i % 5].id,
        service_type: i % 3 === 0 ? "ambos" : i % 2 === 0 ? "desmontaje" : "montaje",
        status,
        customer_name: `Cliente ${org.name} ${i + 1}`,
        customer_address: `${org.city} Calle ${20 + i} # ${10 + i}-${30 + i}`,
        customer_phone: `30055510${String(i).padStart(2, "0")}`,
        invoice_number: `FAC-${org.key.toUpperCase()}-${1000 + i}`,
        scheduled_date: day(i - 4),
        started_at: ["en_curso", "inspeccion", "ejecucion", "cerrada", "no_ejecutada"].includes(status) ? at(day(i - 4), "09:10") : null,
        closed_at: ["cerrada", "no_ejecutada"].includes(status) ? at(day(i - 4), "16:40") : null,
        start_latitude: org.lat + i * 0.01,
        start_longitude: org.lon - i * 0.01,
        close_latitude: org.lat + i * 0.012,
        close_longitude: org.lon - i * 0.012,
        duration_minutes: ["cerrada", "no_ejecutada"].includes(status) ? 450 : null,
        created_by: admin.id,
        no_execution_reason: status === "no_ejecutada" ? "Cliente ausente en sitio" : null,
        metadata: { demo_seed: true, scenario: status }
      }
    });
    await prisma.serviceIncident.deleteMany({ where: { tenant_id: tenant.id, order_id: order.id } });
    await prisma.servicePhoto.deleteMany({ where: { tenant_id: tenant.id, order_id: order.id } });
    if (["inspeccion", "ejecucion", "cerrada", "no_ejecutada"].includes(status)) {
      await prisma.serviceIncident.create({
        data: {
          tenant_id: tenant.id,
          order_id: order.id,
          type: status === "no_ejecutada" ? "no_ejecucion" : "novedad_operativa",
          description: status === "no_ejecutada" ? "No fue posible ejecutar por ausencia del cliente." : "Se valida estado del producto y piezas requeridas.",
          action: status === "no_ejecutada" ? "Reprogramar" : "Continuar con evidencia fotografica",
          metadata: { demo_seed: true }
        }
      });
    }
    const photoTypes = status === "no_ejecutada" ? ["no_ejecutada"] : ["fachada", "producto_abierto", "producto_cerrado", "cliente", "firma_cliente"];
    for (const type of photoTypes.slice(0, status === "cerrada" ? 5 : 2)) {
      await prisma.servicePhoto.create({
        data: {
          tenant_id: tenant.id,
          order_id: order.id,
          type,
          file_url: `seed://${org.key}/${number}/${type}.webp`,
          size_bytes: 120000,
          metadata: { demo_seed: true, mime_type: "image/webp", file_name: `${number}-${type}.webp` }
        }
      });
    }
  }

  await prisma.auditLog.createMany({
    data: [
      { tenant_id: tenant.id, user_id: admin.id, action: "seed.created", module: "platform", entity: "tenant", entity_id: tenant.id, new_value: { seed: "scj-puebla-ops", date: "2026-05-18" } },
      { tenant_id: tenant.id, user_id: admin.id, action: "catalog.loaded", module: "services", entity: "service_reference", new_value: { references: 100 } },
      { tenant_id: tenant.id, user_id: admin.id, action: "operations.history", module: "hr", entity: "time_route", new_value: { routes: routes.length, employees: employees.length, vehicles: vehicles.length } }
    ]
  });

  return {
    empresa: org.name,
    admin: `admin@${org.domain}`,
    password: PASSWORD,
    empleados: employees.length,
    tecnicos: employees.filter((employee) => employee.position === "tecnico").length,
    vehiculos: vehicles.length,
    referencias: 100,
    rutas: routes.length,
    modulos: MODULES
  };
}

async function main() {
  const results = [];
  for (const org of ORGS) results.push(await seedTenant(org));
  console.log(JSON.stringify({ ok: true, fecha_historial: "2026-05-18", results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
