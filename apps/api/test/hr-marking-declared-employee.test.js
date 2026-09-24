const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.DISABLE_REDIS = "true";

// Regresion de la correccion administrativa de marcaciones: cuando la ruta administrativa
// declara un employee_id que no existe en el tenant del solicitante (id inexistente, id de
// otro tenant o basura como un UUID), el servicio antes redirigia en silencio la marcacion
// a la propia ficha del admin. La correccion y la novedad AJUSTE_MANUAL_MARCACION quedaban
// sobre la persona equivocada sin ningun error visible — la clase de falla silenciosa que
// los operadores reportan como "errores al marcar". Ahora el destino declarado debe existir:
// si no existe, la marcacion falla explicitamente con EMPLEADO_NO_ENCONTRADO y no se escribe
// nada. El ambito self-service queda anclado al usuario autenticado y no se ve afectado.

function loadHrService(fakePrisma) {
  const prismaPath = require.resolve("../src/core/prisma");
  const servicePath = require.resolve("../src/modules/hr/service");
  const previousPrisma = require.cache[prismaPath];
  const previousService = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma };
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      if (previousPrisma) require.cache[prismaPath] = previousPrisma;
      else delete require.cache[prismaPath];
    }
  };
}

function adminUser() {
  return { id: 7, email: "admin@apexos.local" };
}

function adminEmployee() {
  return {
    id: 222,
    user_id: 7,
    code: "ADMIN-222",
    user_type: "administrativo",
    metadata: { name: "Administrador" },
    user: { id: 7, name: "Administrador", email: "admin@apexos.local" }
  };
}

function targetEmployee() {
  return {
    id: 463,
    user_id: null,
    code: "EMP-463",
    user_type: "operario",
    metadata: { name: "Operario 463" },
    user: null
  };
}

function route() {
  return { id: 12, tenant_id: "tenant-qa", employees: ["EMP-463"], vehicle_plate: "", end_time: "17:00", tolerance_minutes: 15 };
}

function buildTx({ employees, capture }) {
  return {
    employee: {
      findFirst: async ({ where }) => {
        if (where?.id != null) return employees.find((e) => e.id === where.id) || null;
        if (where?.OR) return employees.find((e) => (where.OR[0]?.user_id != null && e.user_id === where.OR[0].user_id)
          || (where.OR[1]?.user?.email && e.user?.email === where.OR[1].user.email)) || null;
        return null;
      }
    },
    timeRoute: { findFirst: async () => route() },
    routePreoperationalChecklist: { findFirst: async () => null, create: async ({ data }) => ({ id: 77, ...data }) },
    timePunch: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }) => {
        capture.punches.push(data);
        return { id: 91, ...data };
      }
    },
    gpsPing: { create: async () => ({}) },
    workSession: { findFirst: async () => null, create: async () => ({}), update: async () => ({}) },
    $executeRaw: async (strings, ...values) => {
      capture.raw.push({ sql: strings.join("?"), values });
    },
    $queryRaw: async () => []
  };
}

function prismaFor(tx) {
  return {
    runWithTenant: (_tenantId, callback) => callback(),
    $transaction: async (callback) => callback(tx),
    timePunch: { findFirst: async () => null }
  };
}

function yesterdayMoment() {
  return new Date(Date.now() - 86400000);
}

test("la correccion administrativa con empleado valido marca a ese empleado y genera el ajuste", async () => {
  const capture = { punches: [], raw: [] };
  const tx = buildTx({ employees: [adminEmployee(), targetEmployee()], capture });
  const loaded = loadHrService(prismaFor(tx));
  try {
    const result = await loaded.service.createPunch("tenant-qa", {
      employee_id: 463,
      user_name: "EMP-463",
      route_id: 12,
      type: "entrada",
      punched_at: yesterdayMoment().toISOString()
    }, adminUser());
    assert.equal(result.ok, true, "la marcacion administrativa declarada debe aceptarse");
    assert.equal(capture.punches.length, 1);
    assert.equal(capture.punches[0].employee_id, 463, "la marcacion debe quedar sobre el empleado declarado");
    const novelty = capture.raw.find((call) => call.sql.includes("INSERT INTO th_novedades_jornada"));
    assert.ok(novelty, "debe registrar la novedad de ajuste manual por fecha distinta al dia actual");
    assert.ok(novelty.values.includes("AJUSTE_MANUAL_MARCACION"), "la novedad debe ser de ajuste manual");
    assert.ok(novelty.values.includes(463), "la novedad debe senalar al empleado declarado, no a la ficha del admin");
  } finally {
    loaded.restore();
  }
});

test("un employee_id inexistente en el tenant falla explicitamente sin escribir nada", async () => {
  const capture = { punches: [], raw: [] };
  const tx = buildTx({ employees: [adminEmployee()], capture });
  const loaded = loadHrService(prismaFor(tx));
  try {
    await assert.rejects(
      loaded.service.createPunch("tenant-qa", {
        employee_id: 463,
        user_name: "EMP-463",
        route_id: 12,
        type: "entrada",
        punched_at: new Date().toISOString()
      }, adminUser()),
      (error) => error.code === "EMPLEADO_NO_ENCONTRADO" && error.statusCode === 404,
      "el empleado declarado que no existe debe rechazarse con error explicito"
    );
    assert.equal(capture.punches.length, 0, "no debe crear marcacion sobre la ficha del admin");
    assert.equal(capture.raw.length, 0, "no debe ejecutar escrituras ni locks tras el rechazo");
  } finally {
    loaded.restore();
  }
});

test("un employee_id con formato invalido (UUID) falla explicitamente sin escribir nada", async () => {
  const capture = { punches: [], raw: [] };
  const tx = buildTx({ employees: [adminEmployee(), targetEmployee()], capture });
  const loaded = loadHrService(prismaFor(tx));
  try {
    await assert.rejects(
      loaded.service.createPunch("tenant-qa", {
        employee_id: "3f2b8c1e-9d4a-4c1b-8f2e-6a1b2c3d4e5f",
        user_name: "EMP-463",
        route_id: 12,
        type: "entrada",
        punched_at: new Date().toISOString()
      }, adminUser()),
      (error) => error.code === "EMPLEADO_NO_ENCONTRADO" && error.statusCode === 422,
      "la basura en employee_id debe rechazarse con error explicito, no redirigirse"
    );
    assert.equal(capture.punches.length, 0, "no debe crear marcacion sobre la ficha del admin");
    assert.equal(capture.raw.length, 0, "no debe ejecutar escrituras ni locks tras el rechazo");
  } finally {
    loaded.restore();
  }
});

test("el ambito self-service ignora un employee_id declarado y marca al usuario conectado", async () => {
  const capture = { punches: [], raw: [] };
  const tx = buildTx({ employees: [adminEmployee()], capture });
  const loaded = loadHrService(prismaFor(tx));
  try {
    const result = await loaded.service.createPunch("tenant-qa", {
      employee_id: 463,
      user_name: "ADMIN-222",
      route_id: 12,
      type: "entrada",
      punched_at: new Date().toISOString()
    }, adminUser(), { scope: "own" });
    assert.equal(result.ok, true, "el ambito propio no debe rechazarse por un employee_id extrano");
    assert.equal(capture.punches.length, 1);
    assert.equal(capture.punches[0].employee_id, 222, "el ambito propio siempre marca al usuario autenticado");
  } finally {
    loaded.restore();
  }
});

test("la correccion administrativa sin employee_id conserva el respaldo sobre el propio usuario", async () => {
  const capture = { punches: [], raw: [] };
  const tx = buildTx({ employees: [adminEmployee()], capture });
  const loaded = loadHrService(prismaFor(tx));
  try {
    const result = await loaded.service.createPunch("tenant-qa", {
      user_name: "ADMIN-222",
      route_id: 12,
      type: "entrada",
      punched_at: new Date().toISOString()
    }, adminUser());
    assert.equal(result.ok, true, "sin employee_id declarado la marcacion del propio usuario debe aceptarse");
    assert.equal(capture.punches[0].employee_id, 222, "sin destino declarado se conserva la cadena de respaldo");
  } finally {
    loaded.restore();
  }
});

test("el servicio declara el rechazo explicito del empleado no resuelto", () => {
  const service = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");
  const start = service.indexOf("const declaredEmployeeId");
  assert.ok(start >= 0, "debe existir la resolucion del empleado declarado en createPunch");
  const block = service.slice(start, start + 1400);
  assert.match(block, /EMPLEADO_NO_ENCONTRADO/, "el bloque debe fallar con codigo estructurado");
  assert.match(block, /if \(declaredEmployeeId != null && !declaredEmployee\)/, "el empleado declarado sin resolver debe interrumpir la marcacion");
});
