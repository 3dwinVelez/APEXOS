const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "hr-monitor-silent-failures-test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@127.0.0.1:5432/test";

function serviceWith(modulePath, database) {
  const prismaPath = require.resolve("../src/core/prisma");
  const targetPath = require.resolve(modulePath);
  const originalPrisma = require.cache[prismaPath];
  const originalTarget = require.cache[targetPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: database };
  delete require.cache[targetPath];
  const service = require(targetPath);
  if (originalPrisma) require.cache[prismaPath] = originalPrisma;
  else delete require.cache[prismaPath];
  if (originalTarget) require.cache[targetPath] = originalTarget;
  else delete require.cache[targetPath];
  return service;
}

const HR_SERVICE = "../src/modules/hr/service";
const ADMIN_SERVICE = "../src/modules/admin/service";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const EMPLOYEE = { id: 5, code: "E5", user: { id: "u1", name: "Operario", email: "op@scj.com" } };

function hrDatabase(routeRow, listRows) {
  const calls = [];
  return {
    calls,
    runWithTenant: async (tenantId, callback) => {
      calls.push({ model: "tenant", tenantId });
      return callback();
    },
    employee: {
      findFirst: async () => {
        calls.push({ model: "employee", method: "findFirst" });
        return EMPLOYEE;
      },
      findMany: async () => {
        calls.push({ model: "employee", method: "findMany" });
        return [EMPLOYEE];
      }
    },
    timeRoute: {
      findFirst: async () => {
        calls.push({ model: "timeRoute", method: "findFirst" });
        return routeRow;
      },
      findMany: async () => {
        calls.push({ model: "timeRoute", method: "findMany" });
        return listRows;
      }
    },
    gpsPing: {
      findMany: async () => {
        calls.push({ model: "gpsPing", method: "findMany" });
        return [];
      }
    },
    timePunch: {
      findMany: async () => {
        calls.push({ model: "timePunch", method: "findMany" });
        return [];
      },
      findFirst: async () => {
        calls.push({ model: "timePunch", method: "findFirst" });
        return null;
      }
    }
  };
}

function corruptNotes(separator = "\\n") {
  return `Instrucciones de ruta${separator}Control de marcacion: punch_only`;
}

test("listRoutes reconoce punch_only aunque las notas tengan escape \\n literal", async () => {
  const route = { id: 72, date: new Date(), status: "active", employees: ["5"], notes: corruptNotes("\\n") };
  const db = hrDatabase(route, [route]);
  const result = await serviceWith(HR_SERVICE, db).listRoutes("scj");
  assert.equal(result[0].tracking_mode, "punch_only");
  assert.equal(result[0].gps_required, false);
  assert.equal(result[0].notes, "Instrucciones de ruta");
});

test("listRoutes sigue reconociendo punch_only con saltos de linea reales", async () => {
  const route = { id: 72, date: new Date(), status: "active", employees: ["5"], notes: corruptNotes("\n") };
  const db = hrDatabase(route, [route]);
  const result = await serviceWith(HR_SERVICE, db).listRoutes("scj");
  assert.equal(result[0].tracking_mode, "punch_only");
  assert.equal(result[0].gps_required, false);
});

test("listRoutes reporta gps para horarios sin marcador punch_only", async () => {
  const route = { id: 90, date: new Date(), status: "active", employees: ["5"], notes: "Seguimiento GPS de la ruta" };
  const db = hrDatabase(route, [route]);
  const result = await serviceWith(HR_SERVICE, db).listRoutes("scj");
  assert.equal(result[0].tracking_mode, "gps");
  assert.equal(result[0].gps_required, true);
});

test("createOwnPunch con horario de ayer expone la ruta activa de hoy en el detalle 409", async () => {
  const db = hrDatabase({
    id: 72,
    date: new Date(Date.now() - 86400000),
    status: "active",
    employees: ["5"]
  }, [{
    id: 90,
    date: new Date(),
    status: "active",
    employees: ["5"]
  }]);
  await assert.rejects(
    serviceWith(HR_SERVICE, db).createOwnPunch("scj", { id: "u1", email: "op@scj.com" }, { route_id: 72 }),
    (error) => {
      assert.equal(error.code, "HORARIO_FUERA_DEL_DIA");
      assert.equal(error.statusCode, 409);
      assert.equal(error.details.active_route_id, 90);
      assert.equal(error.details.today, todayIso());
      return true;
    }
  );
});

test("createOwnPunch con horario de hoy que no es el activo expone la ruta activa en el detalle 409", async () => {
  const db = hrDatabase({
    id: 72,
    date: new Date(),
    status: "active",
    employees: ["5"]
  }, [{
    id: 90,
    date: new Date(),
    status: "active",
    employees: ["5"]
  }]);
  await assert.rejects(
    serviceWith(HR_SERVICE, db).createOwnPunch("scj", { id: "u1", email: "op@scj.com" }, { route_id: 72 }),
    (error) => {
      assert.equal(error.code, "HORARIO_NO_ACTIVO");
      assert.equal(error.statusCode, 409);
      assert.equal(error.details.active_route_id, 90);
      assert.equal(error.details.route_date, todayIso());
      return true;
    }
  );
});

test("createClientPlatformLog trunca el mensaje a 1000 caracteres", async () => {
  const calls = [];
  const db = {
    calls,
    runWithTenant: async (tenantId, callback) => {
      calls.push({ model: "tenant", tenantId });
      return callback();
    },
    auditLog: {
      create: async (args) => {
        calls.push({ model: "auditLog", args });
        return { id: 1 };
      }
    }
  };
  const result = await serviceWith(ADMIN_SERVICE, db).createClientPlatformLog(
    "scj",
    { id: "u1" },
    { message: "x".repeat(5000), module: "frontend", status_code: 500 },
    {}
  );
  assert.equal(result.ok, true);
  const createCall = calls.find((call) => call.model === "auditLog").args;
  assert.equal(createCall.data.new_value.message.length, 1000);
  assert.equal(createCall.data.new_value.source, "frontend");
  assert.equal(createCall.data.new_value.level, "error");
});

test("createClientPlatformLog rechaza mensajes vacios", async () => {
  const db = { runWithTenant: async () => { throw new Error("no debe consultar datos"); } };
  await assert.rejects(
    serviceWith(ADMIN_SERVICE, db).createClientPlatformLog("scj", { id: "u1" }, { message: "   " }, {}),
    (error) => error.statusCode === 400
  );
});
