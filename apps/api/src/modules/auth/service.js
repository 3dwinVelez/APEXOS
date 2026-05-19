const bcrypt = require("bcrypt");
const prisma = require("../../core/prisma");
const { brainQueue } = require("../../fabric/queues");
const accountingService = require("../accounting/service");

const SEED_MODULES = ["M-01", "M-03", "M-04", "M-05", "M-07", "M-22"];
const ALL_MODULES = Array.from({ length: 26 }, (_, index) => `M-${String(index + 1).padStart(2, "0")}`);

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    tenant_id: user.tenant_id,
    role: user.role.name
  };
}

function publicTenant(tenant) {
  if (!tenant) return null;
  return {
    id: tenant.id,
    name: tenant.name,
    industry: tenant.industry,
    country: tenant.country,
    currency: tenant.currency,
    active_modules: tenant.active_modules || []
  };
}

async function registerTenant(input, fastify) {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  const password = await bcrypt.hash(input.password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.company_name,
        industry: input.industry,
        country: input.country || "CO",
        timezone: input.timezone || "America/Bogota",
        currency: input.currency || "COP",
        active_modules: input.plan === "crown" ? ALL_MODULES : SEED_MODULES
      }
    });

    const role = await tx.role.create({
      data: {
        tenant_id: tenant.id,
        name: "APEX_ADMIN",
        description: "Administrador principal de la empresa",
        is_system: true,
        permissions: { create: [{ module: "*", action: "*" }] }
      },
      include: { permissions: true }
    });

    const user = await tx.user.create({
      data: {
        tenant_id: tenant.id,
        name: input.name,
        email: input.email.toLowerCase(),
        password,
        role_id: role.id
      }
    });

    await tx.subscription.create({
      data: {
        tenant_id: tenant.id,
        plan: input.plan === "crown" ? "crown" : "seed",
        price_monthly: 0,
        trial_ends: trialEnd
      }
    });

    return { tenant, role, user };
  });

  await accountingService.initChartOfAccounts(result.tenant.id, result.tenant.country || "CO");

  setImmediate(() => {
    brainQueue.add("onboarding", {
      tenant_id: result.tenant.id,
      type: "onboarding",
      industry: result.tenant.industry
    }).catch(() => undefined);
  });

  const token = fastify.jwt.sign({
    id: result.user.id,
    tenant_id: result.tenant.id,
    role: { name: result.role.name, permissions: result.role.permissions }
  }, { expiresIn: "8h" });
  const refresh = fastify.jwt.sign({ id: result.user.id, tenant_id: result.tenant.id, type: "refresh" }, { expiresIn: "30d" });

  return { token, refresh, tenant: publicTenant(result.tenant), user: publicUser({ ...result.user, role: result.role }) };
}

async function login(input, fastify) {
  const user = await prisma.user.findFirst({
    where: { email: input.email.toLowerCase() },
    include: { role: { include: { permissions: true } } }
  });

  if (!user || !(await bcrypt.compare(input.password, user.password))) {
    const err = new Error("Credenciales incorrectas");
    err.statusCode = 401;
    throw err;
  }
  if (!user.active) {
    const err = new Error("Usuario desactivado");
    err.statusCode = 403;
    throw err;
  }

  await prisma.user.update({ where: { id: user.id }, data: { last_login: new Date() } });
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenant_id } });
  const token = fastify.jwt.sign({ id: user.id, tenant_id: user.tenant_id, role: user.role }, { expiresIn: "8h" });
  const refresh = fastify.jwt.sign({ id: user.id, tenant_id: user.tenant_id, type: "refresh" }, { expiresIn: "30d" });

  return { token, refresh, tenant: publicTenant(tenant), user: publicUser(user) };
}

async function me(user) {
  const current = await prisma.user.findUnique({
    where: { id: user.id },
    include: { role: { include: { permissions: true } } }
  });
  if (!current || !current.active) {
    const err = new Error("Usuario no disponible");
    err.statusCode = 401;
    throw err;
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: current.tenant_id } });
  return { tenant: publicTenant(tenant), user: publicUser(current) };
}

async function refresh(input, fastify) {
  const payload = fastify.jwt.verify(input.refresh);
  if (payload.type !== "refresh") {
    const err = new Error("Token de renovación inválido");
    err.statusCode = 401;
    throw err;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    include: { role: { include: { permissions: true } } }
  });
  if (!user || !user.active) {
    const err = new Error("Usuario no disponible");
    err.statusCode = 401;
    throw err;
  }
  return {
    token: fastify.jwt.sign({ id: user.id, tenant_id: user.tenant_id, role: user.role }, { expiresIn: "8h" })
  };
}

module.exports = { registerTenant, login, me, refresh };
