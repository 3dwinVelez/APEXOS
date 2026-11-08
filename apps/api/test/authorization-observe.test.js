const assert = require("node:assert/strict");
const test = require("node:test");

// C-06 del plan candado: la revocacion estaba medida solo en la funcion pura
// `authorizationDecision`. Lo que decide expulsar o no es `validateAuthorization`,
// y con los flags apagados una sesion revocada seguia sirviendo hasta que el
// access token expirara (8 h). Aqui se prueba la funcion que honra el flag.

const prismaPath = require.resolve("../src/core/prisma");
const statePath = require.resolve("../src/security/authorizationState");

const future = new Date(Date.now() + 60000);
const past = new Date(Date.now() - 60000);

function fixture(overrides = {}) {
  const state = {
    user: { id: 7, tenant_id: "empresa-a", active: true, authorization_version: 3, authorization_tenant_version: 5, ...overrides.user },
    tenant: { id: "empresa-a", active: true, authorization_version: 5, ...overrides.tenant },
    session: { id: "session-a", user_id: 7, revoked_at: null, revoke_reason: null, expires_at: future, ...overrides.session },
    created: [],
    updated: []
  };
  const prisma = {
    user: {
      async findUnique({ where }) {
        return state.user && state.user.id === where.id ? state.user : null;
      }
    },
    tenant: {
      async findUnique() {
        return state.tenant;
      }
    },
    authorizationSession: {
      async findUnique({ where }) {
        return state.session && state.session.id === where.id ? state.session : null;
      },
      async create({ data }) {
        state.created.push(data);
        return { id: "session-nueva", ...data };
      },
      async updateMany({ where, data }) {
        state.updated.push({ where, data });
        return { count: 1 };
      }
    }
  };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  delete require.cache[statePath];
  return { state, authorizationState: require(statePath) };
}

function withMode({ observe = false, enforce = false }) {
  process.env.AUTHORIZATION_VERSION_OBSERVATION_ENABLED = observe ? "true" : "false";
  process.env.AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED = enforce ? "true" : "false";
}

function silenceWarnings() {
  const original = console.warn;
  console.warn = () => {};
  return () => {
    console.warn = original;
  };
}

test.afterEach(() => withMode({}));

test("observar cuenta una sesion revocada y no expulsa", async () => {
  const restore = silenceWarnings();
  withMode({ observe: true });
  const { authorizationState } = fixture({ session: { revoked_at: past, revoke_reason: "logout" } });
  const before = authorizationState.authorizationMetrics();

  const result = await authorizationState.validateAuthorization({ id: 7, sid: "session-a", uv: 3, tv: 5 });

  assert.equal(result.authorization_reason, "SESSION_REVOKED");
  assert.equal(result.authorization_session_revoke_reason, "logout");
  const after = authorizationState.authorizationMetrics();
  assert.equal(after.mode, "observe");
  assert.equal(after.total, before.total + 1);
  assert.equal(after.reasons.SESSION_REVOKED, (before.reasons.SESSION_REVOKED || 0) + 1);
  restore();
});

test("enforce rechaza la misma sesion revocada con 401", async () => {
  withMode({ enforce: true });
  const { authorizationState } = fixture({ session: { revoked_at: past, revoke_reason: "logout" } });

  await assert.rejects(
    () => authorizationState.validateAuthorization({ id: 7, sid: "session-a", uv: 3, tv: 5 }),
    (error) => error.statusCode === 401 && error.code === "SESSION_REVOKED"
  );
});

test("con los flags apagados no expulsa pero la tasa queda medida", async () => {
  const restore = silenceWarnings();
  withMode({});
  const { authorizationState } = fixture({ session: { revoked_at: past, revoke_reason: "logout" } });
  const before = authorizationState.authorizationMetrics().reasons.SESSION_REVOKED || 0;

  const result = await authorizationState.validateAuthorization({ id: 7, sid: "session-a", uv: 3, tv: 5 });

  assert.equal(result.authorization_reason, "SESSION_REVOKED");
  assert.equal(authorizationState.authorizationMetrics().mode, "off");
  assert.equal(authorizationState.authorizationMetrics().reasons.SESSION_REVOKED, before + 1);
  restore();
});

test("una version de usuario vieja se mide y solo expulsa con enforce", async () => {
  const restore = silenceWarnings();
  withMode({ observe: true });
  const { authorizationState } = fixture({ user: { authorization_version: 4 } });

  const observed = await authorizationState.validateAuthorization({ id: 7, sid: "session-a", uv: 3, tv: 5 });
  assert.equal(observed.authorization_reason, "USER_VERSION_STALE");

  withMode({ enforce: true });
  await assert.rejects(
    () => authorizationState.validateAuthorization({ id: 7, sid: "session-a", uv: 3, tv: 5 }),
    (error) => error.code === "USER_VERSION_STALE"
  );
  restore();
});

test("un usuario revocado se rechaza incluso en modo observar", async () => {
  const restore = silenceWarnings();
  withMode({ observe: true });
  const { authorizationState } = fixture({ user: { active: false } });
  await assert.rejects(
    () => authorizationState.validateAuthorization({ id: 7, sid: "session-a", uv: 3, tv: 5 }),
    (error) => error.code === "USER_REVOKED"
  );
  restore();
});

test("rotar la sesion revoca la anterior con un motivo distinguible", async () => {
  withMode({ observe: true });
  const { state, authorizationState } = fixture();
  const authorization = await authorizationState.validateAuthorization({ id: 7, sid: "session-a", uv: 3, tv: 5 });

  const rotated = await authorizationState.rotateSession(state.user, authorization, "session-a");

  assert.equal(rotated.id, "session-nueva");
  assert.equal(state.created.length, 1);
  assert.equal(state.created[0].user_version, 3);
  assert.equal(state.created[0].tenant_version, 5);
  assert.deepEqual(state.updated[0].where, { id: "session-a", user_id: 7, revoked_at: null });
  assert.equal(state.updated[0].data.revoke_reason, "refresh_rotated");
});
