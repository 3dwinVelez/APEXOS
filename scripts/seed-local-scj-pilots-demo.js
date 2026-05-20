require("./load-env")();

const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PASSWORD = "ApexOS-Demo-2026!";
const DEMO_BATCH = "apexos_initial_demo";

function demoMeta(extra = {}) {
  return { is_demo: true, demo_batch: DEMO_BATCH, ...extra };
}

function date(value) {
  return new Date(`${value}T05:00:00.000Z`);
}

async function ensureRole(tenantId) {
  const role = await prisma.role.upsert({
    where: { tenant_id_name: { tenant_id: tenantId, name: "Piloto Demo" } },
    update: { description: "Rol demo para pilotos/conductores SCJ", is_system: true },
    create: { tenant_id: tenantId, name: "Piloto Demo", description: "Rol demo para pilotos/conductores SCJ", is_system: true }
  });

  await prisma.permission.createMany({
    data: [
      { role_id: role.id, module: "hr", action: "read" },
      { role_id: role.id, module: "hr", action: "write" },
      { role_id: role.id, module: "transport", action: "read" },
      { role_id: role.id, module: "services", action: "read" }
    ],
    skipDuplicates: true
  });

  return role;
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { domain: "scj.qa" },
    update: {
      name: "SCJ",
      active: true,
      active_modules: ["M-17", "M-26", "M-14", "M-22"],
      config: demoMeta({ source: "local_scj_pilots" })
    },
    create: {
      name: "SCJ",
      domain: "scj.qa",
      industry: "servicios_operativos",
      plan: "qa_operativo",
      active_modules: ["M-17", "M-26", "M-14", "M-22"],
      country: "CO",
      currency: "COP",
      timezone: "America/Bogota",
      config: demoMeta({ source: "local_scj_pilots" })
    }
  });

  const role = await ensureRole(tenant.id);
  const pilots = [
    { code: "PIL-DEMO-001", name: "Piloto Demo Norte", document: "DEMO-PIL-001", email: "piloto.norte@demo.apexos.local", user_type: "conductor", department: "Operacion" },
    { code: "PIL-DEMO-002", name: "Piloto Demo Centro", document: "DEMO-PIL-002", email: "piloto.centro@demo.apexos.local", user_type: "conductor", department: "Operacion" },
    { code: "AUX-DEMO-001", name: "Auxiliar Conductor Demo", document: "DEMO-AUX-001", email: "auxiliar.conductor@demo.apexos.local", user_type: "auxiliar_conductor", department: "Operacion" }
  ];

  const employees = [];
  for (const pilot of pilots) {
    const user = await prisma.user.upsert({
      where: { tenant_id_email: { tenant_id: tenant.id, email: pilot.email } },
      update: { name: pilot.name, active: true, role_id: role.id },
      create: {
        tenant_id: tenant.id,
        name: pilot.name,
        email: pilot.email,
        password: await bcrypt.hash(PASSWORD, 12),
        role_id: role.id,
        active: true,
        preferences: demoMeta()
      }
    });

    const employee = await prisma.employee.upsert({
      where: { tenant_id_code: { tenant_id: tenant.id, code: pilot.code } },
      update: {
        user_id: user.id,
        user_type: pilot.user_type,
        position: pilot.user_type,
        department: pilot.department,
        active: true,
        metadata: demoMeta({ name: pilot.name, document: pilot.document, user_type: pilot.user_type, classification: pilot.user_type, user_email: pilot.email })
      },
      create: {
        tenant_id: tenant.id,
        user_id: user.id,
        code: pilot.code,
        user_type: pilot.user_type,
        position: pilot.user_type,
        department: pilot.department,
        salary_base: 0,
        hire_date: date("2026-05-01"),
        contract_type: "indefinite",
        active: true,
        metadata: demoMeta({ name: pilot.name, document: pilot.document, user_type: pilot.user_type, classification: pilot.user_type, user_email: pilot.email })
      },
      include: { user: true }
    });
    employees.push(employee);
  }

  const vehicles = [];
  const vehicleData = [
    { plate: "PIL001", brand: "Chevrolet", model: "NPR Demo", type: "camion", master_status: "apto_documentalmente", document_status: "vigente", driver: employees[0] },
    { plate: "PIL002", brand: "Renault", model: "Kangoo Demo", type: "van", master_status: "documento_proximo_a_vencer", document_status: "documento_proximo_a_vencer", driver: employees[1] },
    { plate: "PIL003", brand: "Hino", model: "Dutro Demo", type: "camion", master_status: "bloqueado_documental", document_status: "vencido", driver: employees[0] }
  ];

  for (const item of vehicleData) {
    const vehicle = await prisma.vehicle.upsert({
      where: { tenant_id_plate: { tenant_id: tenant.id, plate: item.plate } },
      update: {
        brand: item.brand,
        model: item.model,
        type: item.type,
        status: item.master_status === "bloqueado_documental" ? "bloqueado" : "activo",
        master_status: item.master_status,
        document_status: item.document_status,
        base_site: "Sede Demo SCJ",
        authorized_driver_id: item.driver.id,
        authorized_driver_name: item.driver.metadata.name,
        authorized_driver_document: item.driver.metadata.document,
        authorized_driver_code: item.driver.code,
        active: true,
        metadata: demoMeta({ source: "local_scj_pilots" })
      },
      create: {
        tenant_id: tenant.id,
        plate: item.plate,
        brand: item.brand,
        model: item.model,
        type: item.type,
        year: 2024,
        color: "Blanco",
        mileage: 12500,
        owner: "SCJ",
        ownership_type: "propio",
        base_site: "Sede Demo SCJ",
        authorized_driver_id: item.driver.id,
        authorized_driver_name: item.driver.metadata.name,
        authorized_driver_document: item.driver.metadata.document,
        authorized_driver_code: item.driver.code,
        status: item.master_status === "bloqueado_documental" ? "bloqueado" : "activo",
        master_status: item.master_status,
        document_status: item.document_status,
        master_score: item.master_status === "apto_documentalmente" ? 95 : item.master_status === "documento_proximo_a_vencer" ? 72 : 45,
        active: true,
        metadata: demoMeta({ source: "local_scj_pilots" })
      }
    });
    vehicles.push(vehicle);
  }

  await prisma.timeRoute.deleteMany({ where: { tenant_id: tenant.id, notes: { contains: DEMO_BATCH } } });
  await prisma.timeRoute.createMany({
    data: [
      {
        tenant_id: tenant.id,
        date: date("2026-05-20"),
        vehicle_plate: vehicles[0].plate,
        employees: [employees[0].code, employees[2].code],
        start_time: "08:00",
        end_time: "17:00",
        tolerance_minutes: 15,
        per_diem: 0,
        status: "active",
        notes: `${DEMO_BATCH} ruta activa piloto norte`
      },
      {
        tenant_id: tenant.id,
        date: date("2026-05-20"),
        vehicle_plate: vehicles[1].plate,
        employees: [employees[1].code],
        start_time: "09:00",
        end_time: "18:00",
        tolerance_minutes: 15,
        per_diem: 0,
        status: "planned",
        notes: `${DEMO_BATCH} ruta programada piloto centro`
      }
    ]
  });

  console.log(JSON.stringify({
    status: "ok",
    tenant_id: tenant.id,
    tenant: tenant.name,
    demo_batch: DEMO_BATCH,
    pilots: employees.map((employee) => ({ id: employee.id, code: employee.code, name: employee.metadata.name, user_type: employee.user_type })),
    vehicles: vehicles.map((vehicle) => ({ id: vehicle.id, plate: vehicle.plate, authorized_driver_name: vehicle.authorized_driver_name }))
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
