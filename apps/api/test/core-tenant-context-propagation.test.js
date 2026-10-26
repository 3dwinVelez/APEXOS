const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

// Pendiente abierto en la ronda hr-contention-p2028-20261026 y cerrado aqui.
//
// El arnes de certificacion de main fallo con "Argument `tenant_id` is missing" al sembrar un
// empleado dentro de prisma.runWithTenant(<tenant>, () => prisma.employee.create(...)), mientras el
// mismo arnes paso sin declararlo en desarrollo y develop. La diferencia es una linea del nucleo:
//   desarrollo/develop: tenantStorage.run(store, async () => await fn())
//   main:               tenantStorage.run(store, fn)
// Con la segunda forma, el callback se invoca de forma sincrona y el middleware de inyeccion de
// tenant (`client.$use`) ya no ve el contexto cuando Prisma ejecuta la operacion.
//
// No es un detalle de estilo: el middleware es el unico filtro de tenant de las lecturas y el unico
// que fija data.tenant_id en las escrituras. Si el contexto se pierde, la lectura queda SIN filtro
// entre empresas y la escritura depende de que el llamador haya declarado el tenant a mano. Hay 389
// sitios de runWithTenant en main, asi que este contrato se versiona para que ningun flujo dependa
// de una forma de callback que el nucleo ya no sostiene.
//
// La prueba no necesita base de datos: registra un middleware de sondeo despues de los del nucleo,
// captura los argumentos ya inyectados y aborta antes de que Prisma intente conectar.

const prismaPath = require.resolve("../src/core/prisma");

function freshPrisma() {
  delete require.cache[prismaPath];
  const prisma = require(prismaPath);
  const captured = [];
  // Los middlewares de Prisma se ejecutan en orden de registro: el nuestro corre al final, es decir
  // despues de la inyeccion de tenant, del soft-delete y del guardado de borrado fisico.
  prisma.$use(async (params, next) => {
    if (params.model === "Employee" && params.action === "create") {
      captured.push({ tenant_id: params.args?.data?.tenant_id });
      throw new Error("__sondeo_tenant_context");
    }
    return next(params);
  });
  return { prisma, captured };
}

function probeCalls() {
  return {
    syncArrow: (prisma, tenantId) => prisma.runWithTenant(tenantId, () => prisma.employee.create({ data: { code: `SYNC-${tenantId}` } })),
    asyncArrow: (prisma, tenantId) => prisma.runWithTenant(tenantId, async () => prisma.employee.create({ data: { code: `ASYNC-${tenantId}` } })),
    afterAwait: (prisma, tenantId) => prisma.runWithTenant(tenantId, async () => {
      await Promise.resolve();
      return prisma.employee.create({ data: { code: `AWAIT-${tenantId}` } });
    })
  };
}

async function runProbe(form) {
  const { prisma, captured } = freshPrisma();
  const call = probeCalls()[form];
  let aborted = false;
  try {
    await call(prisma, 7001);
  } catch (error) {
    aborted = error instanceof Error && error.message === "__sondeo_tenant_context";
  }
  if (!aborted) throw new Error(`el sondeo no llego al middleware de tenant (forma ${form})`);
  return captured[0]?.tenant_id;
}

test("runWithTenant propaga el tenant aunque el callback sea una funcion sincrona", async () => {
  assert.equal(await runProbe("syncArrow"), "7001", "un callback sincrono debe inyectar el tenant igual que uno asincrono");
});

test("runWithTenant propaga el tenant con callback asincrono y tras un await", async () => {
  assert.equal(await runProbe("asyncArrow"), "7001");
  assert.equal(await runProbe("afterAwait"), "7001");
});

test("fuera de runWithTenant el middleware no inventa un filtro de tenant", async () => {
  const { prisma, captured } = freshPrisma();
  await assert.rejects(() => prisma.employee.create({ data: { code: "SIN-AMBITO" } }), /__sondeo_tenant_context/);
  assert.equal(captured[0]?.tenant_id, undefined, "sin contexto de tenant la escritura no recibe tenant inyectado: el guard de RLS y el codigo deben proveer el valor");
});

test("el nucleo envuelve el callback del tenant en una funcion asincrona", () => {
  const source = require("node:fs").readFileSync(path.resolve(__dirname, "../src/core/prisma.js"), "utf8");
  assert.match(
    source,
    /property === "runWithTenant"[\s\S]{0,160}async \(\) => await fn\(\)/,
    "main llevaba runWithTenant(store, fn): la forma sincrona pierde el contexto ALS para Prisma"
  );
});
