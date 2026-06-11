require("./load-env")();

const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ALL_MODULES = Array.from({ length: 26 }, (_, index) => `M-${String(index + 1).padStart(2, "0")}`);
const TECHNICIAN_PASSWORD = "Tecnico2026!";

async function main() {
  const email = "demo@apex.local";
  const password = "test1234";
  let user = await prisma.user.findFirst({ where: { email } });
  let tenant;

  if (!user) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Demo APEX",
        industry: "retail",
        plan: "crown",
        active_modules: ALL_MODULES,
        country: "CO",
        currency: "COP",
        timezone: "America/Bogota"
      }
    });

    const role = await prisma.role.create({
      data: {
        tenant_id: tenant.id,
        name: "APEX_ADMIN",
        description: "Administrador principal de la empresa",
        is_system: true,
        permissions: { create: [{ module: "*", action: "*" }] }
      }
    });

    user = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Admin Demo",
        email,
        password: await bcrypt.hash(password, 12),
        role_id: role.id
      }
    });

    await prisma.subscription.create({
      data: { tenant_id: tenant.id, plan: "crown", price_monthly: 0, status: "active" }
    });
  } else {
    tenant = await prisma.tenant.update({
      where: { id: user.tenant_id },
      data: { plan: "crown", active_modules: ALL_MODULES, active: true }
    });

    await prisma.subscription.upsert({
      where: { tenant_id: tenant.id },
      update: { plan: "crown", status: "active", price_monthly: 0 },
      create: { tenant_id: tenant.id, plan: "crown", status: "active", price_monthly: 0 }
    });
  }

  const technicianRole = await prisma.role.upsert({
    where: { tenant_id_name: { tenant_id: tenant.id, name: "Tecnico" } },
    update: {
      description: "Ejecuta exclusivamente servicios activos asignados.",
      is_system: true,
      metadata: { active: true, role_type: "operativo", profile_kind: "technician", workspace: "technician_services", landing_page: "/dashboard/servicios", services_assigned_only: true }
    },
    create: {
      tenant_id: tenant.id,
      name: "Tecnico",
      description: "Ejecuta exclusivamente servicios activos asignados.",
      is_system: true,
      metadata: { active: true, role_type: "operativo", profile_kind: "technician", workspace: "technician_services", landing_page: "/dashboard/servicios", services_assigned_only: true }
    }
  });
  await prisma.permission.deleteMany({ where: { role_id: technicianRole.id } });
  await prisma.permission.createMany({
    data: [
      { role_id: technicianRole.id, module: "services", action: "read" },
      { role_id: technicianRole.id, module: "services", action: "write" }
    ],
    skipDuplicates: true
  });

  const technicianPasswordHash = await bcrypt.hash(TECHNICIAN_PASSWORD, 12);
  const technicians = [];
  for (let index = 1; index <= 10; index += 1) {
    const suffix = String(index).padStart(2, "0");
    const technicianUser = await prisma.user.upsert({
      where: { tenant_id_email: { tenant_id: tenant.id, email: `tecnico${suffix}@apex.local` } },
      update: { name: `Tecnico Operativo ${suffix}`, password: technicianPasswordHash, role_id: technicianRole.id, active: true },
      create: {
        tenant_id: tenant.id,
        name: `Tecnico Operativo ${suffix}`,
        email: `tecnico${suffix}@apex.local`,
        password: technicianPasswordHash,
        role_id: technicianRole.id,
        active: true,
        preferences: { landing_page: "/dashboard/servicios", services_assigned_only: true }
      }
    });
    const technician = await prisma.employee.upsert({
      where: { user_id: technicianUser.id },
      update: { code: `TEC-${suffix}`, user_type: "tecnico", position: "Tecnico de servicios", department: "Servicios", active: true },
      create: {
        tenant_id: tenant.id,
        user_id: technicianUser.id,
        code: `TEC-${suffix}`,
        user_type: "tecnico",
        position: "Tecnico de servicios",
        department: "Servicios",
        salary_base: 0,
        hire_date: new Date(),
        active: true,
        metadata: { profile_kind: "technician", services_assigned_only: true }
      }
    });
    technicians.push(technician);
  }

  const activeOrders = await prisma.serviceOrder.findMany({
    where: { tenant_id: tenant.id, status: { in: ["pendiente", "en_curso", "inspeccion", "ejecucion"] } },
    orderBy: { id: "asc" }
  });
  for (const [index, order] of activeOrders.entries()) {
    await prisma.serviceOrder.update({ where: { id: order.id }, data: { technician_id: technicians[index % technicians.length].id } });
  }

  console.log(JSON.stringify({
    email,
    password,
    empresa: tenant.name,
    plan: "COPA",
    modulos_activos: ALL_MODULES.length,
    tecnicos_creados: technicians.length,
    tecnico_demo: "tecnico01@apex.local",
    clave_tecnicos: TECHNICIAN_PASSWORD
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

