const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { Prisma } = require("@prisma/client");

// C-03 del plan candado: el aislamiento no puede depender de una allowlist que
// alguien mantiene a mano. Un modelo con columna `tenant_id` que no este en
// TENANT_MODELS pierde el filtro de empresa en todas sus lecturas, y un modelo
// sin la columna que este dentro recibe un `where.tenant_id` que Prisma rechaza.
// El conjunto se deriva del schema (DMMF) y esta prueba fija el contrato: los 29
// modelos que estaban fuera (tesoreria, importaciones, suscripciones, apex-heart,
// los 17 Commercial* y los 4 TransportPyg*) quedan dentro.

const tenantModelsPath = require.resolve("../src/core/tenantModels");
const prismaPath = require.resolve("../src/core/prisma");

const { TENANT_MODELS, GLOBAL_MODELS } = require(tenantModelsPath);
const dmmfModels = Prisma.dmmf.datamodel.models.map((model) => model.name);
const withTenantColumn = Prisma.dmmf.datamodel.models
  .filter((model) => model.fields.some((field) => field.name === "tenant_id"))
  .map((model) => model.name);

test("todo modelo con columna tenant_id queda dentro del filtro", () => {
  const missing = withTenantColumn.filter((name) => !TENANT_MODELS.has(name));
  assert.deepEqual(missing, [], "un modelo con tenant_id fuera del filtro es una fuga entre empresas");
  assert.equal(TENANT_MODELS.size, withTenantColumn.length);
});

test("los modelos que estaban fuera ahora estan cubiertos", () => {
  const formerlyMissing = [
    "TreasuryBank", "TreasuryAdvance", "TreasuryAdvanceApplication", "TreasuryPayment", "TreasuryPaymentApplication",
    "PurchaseImport", "PurchaseImportCost", "Subscription", "ApexHeartReportSchedule",
    "TransportPygConcept", "TransportPygBudget", "TransportPygSourceMap", "TransportPygConfig",
    "CommercialAdvisor", "CommercialCustomer", "CommercialCustomerCommitment", "CommercialZone",
    "CommercialCustomerCategory", "CommercialPeriod", "CommercialAdvisorBudget", "CommercialCustomerBudget",
    "CommercialVisit", "CommercialVisitEvent", "CommercialSettings", "CommercialVisitReason",
    "CommercialVisitResult", "CommercialProduct", "CommercialSalesOrder", "CommercialQuotation",
  ];
  for (const name of formerlyMissing) {
    assert.ok(TENANT_MODELS.has(name), `${name} debe quedar filtrado por empresa`);
  }
});

test("ningun modelo global tiene columna de empresa ni se solapa con el filtro", () => {
  for (const name of GLOBAL_MODELS) {
    assert.ok(dmmfModels.includes(name), `${name} esta declarado global pero no existe en el schema`);
    assert.ok(!TENANT_MODELS.has(name), `${name} no puede ser global: tiene tenant_id`);
  }
  const undeclared = dmmfModels.filter((name) => !TENANT_MODELS.has(name) && !GLOBAL_MODELS.has(name));
  assert.deepEqual(undeclared, [], "cada modelo debe estar en el filtro por empresa o declarado global");
});

test("ApexReportRun sale del filtro porque no tiene columna de empresa", () => {
  assert.ok(GLOBAL_MODELS.has("ApexReportRun"));
  assert.ok(!TENANT_MODELS.has("ApexReportRun"));
});

function freshPrisma() {
  delete require.cache[prismaPath];
  delete require.cache[tenantModelsPath];
  const prisma = require(prismaPath);
  const captured = [];
  prisma.$use(async (params, next) => {
    captured.push({ model: params.model, action: params.action, where: params.args?.where, data: params.args?.data });
    throw new Error("__sondeo_tenant_models");
  });
  return { prisma, captured };
}

async function probe(call) {
  const { prisma, captured } = freshPrisma();
  await assert.rejects(() => call(prisma), /__sondeo_tenant_models/);
  return captured[0];
}

test("el middleware filtra un modelo de tesoreria que antes quedaba fuera", async () => {
  const read = await probe((prisma) => prisma.runWithTenant("empresa-a", () => prisma.treasuryBank.findMany({})));
  assert.equal(read.where.tenant_id, "empresa-a");
});

test("el middleware filtra gestion comercial y pyg, y estampa la empresa al crear", async () => {
  const read = await probe((prisma) => prisma.runWithTenant("empresa-a", () => prisma.commercialVisit.findMany({})));
  assert.equal(read.where.tenant_id, "empresa-a");
  const write = await probe((prisma) => prisma.runWithTenant("empresa-a", () => prisma.transportPygConcept.create({ data: { code: "X" } })));
  assert.equal(write.data.tenant_id, "empresa-a");
});

test("un modelo global no recibe un filtro de columna inexistente", async () => {
  const read = await probe((prisma) => prisma.runWithTenant("empresa-a", () => prisma.apexReportRun.findMany({})));
  assert.equal(read.where?.tenant_id, undefined, "inyectar tenant_id en ApexReportRun romperia la consulta");
});

test("sin contexto de empresa el middleware no inventa el filtro", async () => {
  const read = await probe((prisma) => prisma.treasuryBank.findMany({}));
  assert.equal(read.where?.tenant_id, undefined);
});
