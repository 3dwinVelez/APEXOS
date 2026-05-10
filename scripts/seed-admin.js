const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ALL_MODULES = Array.from({ length: 25 }, (_, index) => `M-${String(index + 1).padStart(2, "0")}`);

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

  console.log(JSON.stringify({
    email,
    password,
    empresa: tenant.name,
    plan: "COPA",
    modulos_activos: ALL_MODULES.length
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

