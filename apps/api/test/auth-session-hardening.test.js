const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcrypt");
const jwt = require("../src/security/jwt");

// Fase 2 del plan candado, en modo observar: login uniforme, bcrypt siempre,
// refresh rotado y reuso de refresh medido sin expulsar sesiones.

process.env.JWT_SECRET = "secreto-de-prueba-con-mas-de-24-caracteres";

const prismaPath = require.resolve("../src/core/prisma");
const queuesPath = require.resolve("../src/fabric/queues");
const accountingPath = require.resolve("../src/modules/accounting/service");
const servicePath = require.resolve("../src/modules/auth/service");
const statePath = require.resolve("../src/security/authorizationState");

const bcryptPath = require.resolve("bcrypt");
const realBcrypt = require("bcrypt");

const PASSWORD = "ClaveDePrueba1";
let passwordHash;

function fixture(overrides = {}) {
  const state = {
    user: overrides.user === null ? null : {
      id: 7,
      name: "Usuario Prueba",
      email: "activo@example.test",
      tenant_id: "empresa-a",
      active: true,
      authorization_version: 3,
      password: passwordHash,
      last_login: null,
      role: { id: 2, name: "Tecnico", permissions: [] },
      ...overrides.user
    },
    tenant: { id: "empresa-a", name: "Empresa A", active: true, authorization_version: 5, active_modules: [], config: {} },
    sessions: [],
    created: [],
    updated: [],
    compares: [],
    seq: 0
  };
  if (overrides.session) {
    state.sessions.push({ created_at: new Date(), ...overrides.session });
  }

  const prisma = {
    user: {
      async findFirst({ where }) {
        if (where?.email) return state.user && state.user.email === where.email ? state.user : null;
        if (where?.id) return state.user && state.user.id === where.id ? state.user : null;
        return null;
      },
      async findUnique({ where }) {
        return state.user && state.user.id === where.id ? state.user : null;
      },
      async update({ where, data }) {
        state.updated.push({ where, data });
        if (state.user) Object.assign(state.user, data);
        return state.user;
      }
    },
    tenant: {
      async findUnique() {
        return state.tenant;
      }
    },
    authorizationSession: {
      async findUnique({ where }) {
        return state.sessions.find((session) => session.id === where.id) || null;
      },
      async create({ data }) {
        const row = { id: `session-${++state.seq}`, revoked_at: null, revoke_reason: null, ...data };
        state.sessions.push(row);
        state.created.push(data);
        return row;
      },
      async updateMany({ where, data }) {
        state.updated.push({ where, data });
        const rows = state.sessions.filter((session) => session.id === where.id
          && session.user_id === where.user_id
          && (where.revoked_at === null ? !session.revoked_at : true));
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      }
    }
  };

  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[queuesPath] = {
    id: queuesPath,
    filename: queuesPath,
    loaded: true,
    exports: { brainQueue: { add: async () => ({}) }, auditQueue: { add: async () => ({}) } }
  };
  require.cache[accountingPath] = {
    id: accountingPath,
    filename: accountingPath,
    loaded: true,
    exports: { initChartOfAccounts: async () => undefined }
  };
  delete require.cache[servicePath];
  delete require.cache[statePath];
  return { state, service: require(servicePath), authorizationState: require(statePath) };
}

function spyBcrypt() {
  require.cache[bcryptPath] = {
    id: bcryptPath,
    filename: bcryptPath,
    loaded: true,
    exports: {
      compare: async (value, hash) => {
        fixtureCalls.push(hash);
        return realBcrypt.compare(value, hash);
      },
      hash: (value, rounds) => realBcrypt.hash(value, rounds),
      hashSync: (value, rounds) => realBcrypt.hashSync(value, rounds)
    }
  };
}

const fixtureCalls = [];

function restoreBcrypt() {
  require.cache[bcryptPath] = { id: bcryptPath, filename: bcryptPath, loaded: true, exports: realBcrypt };
}

test.before(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 12);
});

test.afterEach(() => {
  restoreBcrypt();
  fixtureCalls.length = 0;
  process.env.AUTHORIZATION_VERSION_OBSERVATION_ENABLED = "true";
  process.env.AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED = "false";
});

test("un correo inexistente paga bcrypt y responde el mismo 401", async () => {
  spyBcrypt();
  const { service } = fixture({ user: null });
  await assert.rejects(
    () => service.login({ email: "nadie@example.test", password: PASSWORD }, {}, { ip: "1.1.1.1" }),
    (error) => error.statusCode === 401 && /No fue posible iniciar sesion/.test(error.message)
  );
  assert.equal(fixtureCalls.length, 1);
  assert.match(fixtureCalls[0], /^\$2b\$12\$/);
});

test("un usuario desactivado responde 401 uniforme, no 403 con pista", async () => {
  spyBcrypt();
  const { service } = fixture({ user: { active: false } });
  await assert.rejects(
    () => service.login({ email: "activo@example.test", password: PASSWORD }, {}, { ip: "1.1.1.2" }),
    (error) => error.statusCode === 401 && error.message === "No fue posible iniciar sesion con esas credenciales."
  );
  assert.equal(fixtureCalls.length, 1);
  assert.match(fixtureCalls[0], /^\$2b\$12\$/);
});

test("el login valido devuelve token, refresh y sesion", async () => {
  spyBcrypt();
  const { state, service } = fixture();
  const result = await service.login({ email: "activo@example.test", password: PASSWORD }, {}, { ip: "1.1.1.3" });
  assert.ok(result.token);
  assert.equal(jwt.verify(result.token).sid, "session-1");
  assert.equal(jwt.verify(result.refresh).type, "refresh");
  assert.equal(state.sessions.length, 1);
});

test("el refresh sano rota la sesion y devuelve un refresh nuevo", async () => {
  const { state, service } = fixture({ session: { id: "session-vieja", user_id: 7, expires_at: new Date(Date.now() + 60000) } });
  const refresh = jwt.sign({ id: 7, tenant_id: "empresa-a", sid: "session-vieja", uv: 3, tv: 5, type: "refresh", jti: "uno" }, { expiresIn: "30d" });

  const result = await service.refresh({ refresh }, {});

  assert.equal(jwt.verify(result.token).sid, "session-1");
  const rotated = jwt.verify(result.refresh);
  assert.equal(rotated.sid, "session-1");
  assert.notEqual(rotated.jti, "uno");
  assert.equal(state.sessions.find((session) => session.id === "session-vieja").revoke_reason, "refresh_rotated");
});

test("reutilizar un refresh ya rotado se mide sin abrir sesion nueva ni expulsar", async () => {
  const { state, service, authorizationState } = fixture({
    session: { id: "session-vieja", user_id: 7, revoked_at: new Date(), revoke_reason: "refresh_rotated", expires_at: new Date(Date.now() + 60000) }
  });
  const before = authorizationState.authorizationMetrics().reasons.REFRESH_TOKEN_REUSED || 0;
  const refresh = jwt.sign({ id: 7, tenant_id: "empresa-a", sid: "session-vieja", uv: 3, tv: 5, type: "refresh", jti: "viejo" }, { expiresIn: "30d" });

  const result = await service.refresh({ refresh }, {});

  assert.equal(jwt.verify(result.token).sid, "session-vieja");
  assert.equal(result.refresh, refresh, "un refresh revocado no gana otros 30 dias");
  assert.equal(state.created.length, 0);
  assert.equal(authorizationState.authorizationMetrics().reasons.REFRESH_TOKEN_REUSED, before + 1);
});

test("un refresh de una sesion cerrada por logout se distingue del reuso", async () => {
  const { authorizationState, service } = fixture({
    session: { id: "session-logout", user_id: 7, revoked_at: new Date(), revoke_reason: "logout", expires_at: new Date(Date.now() + 60000) }
  });
  const before = authorizationState.authorizationMetrics().reasons.REFRESH_SESSION_REVOKED || 0;
  const refresh = jwt.sign({ id: 7, tenant_id: "empresa-a", sid: "session-logout", uv: 3, tv: 5, type: "refresh" }, { expiresIn: "30d" });

  await service.refresh({ refresh }, {});

  assert.equal(authorizationState.authorizationMetrics().reasons.REFRESH_SESSION_REVOKED, before + 1);
});

test("con enforcement encendido el mismo refresh revocado responde 401", async () => {
  process.env.AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED = "true";
  const { service } = fixture({
    session: { id: "session-logout", user_id: 7, revoked_at: new Date(), revoke_reason: "logout", expires_at: new Date(Date.now() + 60000) }
  });
  const refresh = jwt.sign({ id: 7, tenant_id: "empresa-a", sid: "session-logout", uv: 3, tv: 5, type: "refresh" }, { expiresIn: "30d" });

  await assert.rejects(() => service.refresh({ refresh }, {}), (error) => error.statusCode === 401 && error.code === "SESSION_REVOKED");
});
