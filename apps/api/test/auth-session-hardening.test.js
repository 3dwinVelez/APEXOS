const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcrypt");
const jwt = require("../src/security/jwt");

// Fase 2 del plan candado, en modo observar: login uniforme, bcrypt siempre,
// refresh rotado y reuso de refresh medido sin expulsar sesiones.
// Desde el 2026-11-24 este arnes tambien fija el numero de sentencias del ingreso y de la
// renovacion, y que un correo registrado en varias empresas no pueda abrir la empresa equivocada.

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

// El snapshot de autorizacion decide con UNA sentencia. El mock reproduce sus condiciones de verdad
// (usuario por id, o todas las filas del correo, cada una con su empresa y su sesion) y no el texto
// del SQL, salvo para distinguir cual de las dos lecturas pago cada prueba.
function baseUsuario(overrides = {}) {
  return {
    id: 7,
    name: "Usuario Prueba",
    email: "activo@example.test",
    tenant_id: "empresa-a",
    active: true,
    authorization_version: 3,
    password: passwordHash,
    last_login: null,
    role: { id: 2, name: "Tecnico", permissions: [] },
    ...overrides
  };
}

function fixture(overrides = {}) {
  const state = {
    users: [],
    tenant: { id: "empresa-a", name: "Empresa A", active: true, authorization_version: 5, active_modules: [], config: {}, ...(overrides.tenant || {}) },
    sessions: [],
    created: [],
    updated: [],
    compares: [],
    sentencias: [],
    lecturas: { usuario: 0, tenant: 0 },
    seq: 0
  };
  if (overrides.users) {
    for (const usuario of overrides.users) if (usuario) state.users.push(baseUsuario(usuario));
  } else if (overrides.user !== null) {
    state.users.push(baseUsuario(overrides.user || {}));
  }
  if (overrides.session) {
    state.sessions.push({ created_at: new Date(), ...overrides.session });
  }

  const fila = (usuario, sid) => {
    const { role, tenant, ...columns } = usuario;
    const hit = sid ? state.sessions.find((session) => session.id === sid && session.user_id === usuario.id) : null;
    return {
      user: columns,
      role: role ? { ...role, permissions: role.permissions || [] } : null,
      tenant: tenant || state.tenant,
      session: hit ? { ...hit } : null
    };
  };

  const prisma = {
    async $queryRawUnsafe(sql, sid, clave, limite) {
      if (/lower\(u\.email\)/.test(sql)) {
        state.sentencias.push("correo");
        return state.users
          .filter((usuario) => usuario.email === String(clave || "").toLowerCase())
          .slice(0, Number(limite) || 1)
          .map((usuario) => fila(usuario, sid));
      }
      state.sentencias.push("id");
      const usuario = state.users.find((u) => u.id === clave);
      return usuario ? [fila(usuario, sid)] : [];
    },
    user: {
      async findFirst({ where }) {
        state.lecturas.usuario += 1;
        if (where?.email) return state.users.find((u) => u.email === where.email) || null;
        if (where?.id) return state.users.find((u) => u.id === where.id) || null;
        return null;
      },
      async findUnique({ where }) {
        state.lecturas.usuario += 1;
        return state.users.find((u) => u.id === where.id) || null;
      },
      async update({ where, data }) {
        state.updated.push({ where, data });
        const usuario = state.users.find((u) => u.id === where.id);
        if (usuario) Object.assign(usuario, data);
        return usuario;
      }
    },
    tenant: {
      async findUnique() {
        state.lecturas.tenant += 1;
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

// ------------------------------------------------------------------- camino de sesion en una sentencia
// Cada viaje al pooler cuesta ~660 ms desde Railway (medido el 2026-11-24 con Server-Timing), asi que
// lo que se fija aqui no es el estilo sino el numero de sentencias del ingreso y de la renovacion.

test("el login lee el correo en UNA sentencia y no vuelve a leer usuario ni empresa", async () => {
  spyBcrypt();
  const { state, service } = fixture();
  const result = await service.login({ email: "activo@example.test", password: PASSWORD }, {}, { ip: "1.1.1.4" });

  assert.deepEqual(state.sentencias, ["correo"], `el login pagó ${state.sentencias.length} sentencias de lectura`);
  assert.equal(state.lecturas.usuario, 0, "el login sigue leyendo el usuario con include aparte");
  assert.equal(state.lecturas.tenant, 0, "el login sigue leyendo la empresa en una sentencia aparte");
  assert.equal(result.user.id, 7);
  assert.equal(result.tenant.id, "empresa-a");
  assert.equal(jwt.verify(result.token).tenant_id, "empresa-a");
});

test("un correo activo en dos empresas no entra a ninguna y responde el mismo 401", async () => {
  spyBcrypt();
  const { state, service, authorizationState } = fixture({
    users: [{ id: 7, tenant_id: "empresa-a" }, { id: 8, tenant_id: "empresa-b" }]
  });
  const antes = authorizationState.authorizationMetrics().reasons.LOGIN_CORREO_AMBIGUO || 0;

  await assert.rejects(
    () => service.login({ email: "activo@example.test", password: PASSWORD }, {}, { ip: "1.1.1.5" }),
    (error) => error.statusCode === 401 && error.message === "No fue posible iniciar sesion con esas credenciales."
  );

  // Las dos filas pagan el compare: si se detuviera en la primera, el tiempo diria en que empresa
  // esta registrado el correo.
  assert.equal(fixtureCalls.length, 2, "se dejo de comparar contra todas las filas del correo");
  assert.equal(state.created.length, 0, "un empate entre empresas no puede abrir sesion");
  assert.equal(authorizationState.authorizationMetrics().reasons.LOGIN_CORREO_AMBIGUO, antes + 1);
});

test("la fila inactiva del mismo correo no le cierra la puerta a la empresa activa", async () => {
  spyBcrypt();
  const { state, service, authorizationState } = fixture({
    users: [
      { id: 7, tenant_id: "empresa-a", active: false },
      { id: 8, tenant_id: "empresa-b" }
    ]
  });
  const antes = authorizationState.authorizationMetrics().reasons.LOGIN_CORREO_AMBIGUO || 0;

  const result = await service.login({ email: "activo@example.test", password: PASSWORD }, {}, { ip: "1.1.1.6" });

  // Antes de este cambio un `findFirst` podia devolver la fila inactiva y negar el acceso a una
  // cuenta que si esta viva en otra empresa.
  assert.equal(result.user.id, 8);
  assert.equal(jwt.verify(result.token).tenant_id, "empresa-b");
  assert.equal(state.created[0].tenant_id, "empresa-b");
  assert.equal(authorizationState.authorizationMetrics().reasons.LOGIN_CORREO_AMBIGUO || 0, antes);
});

test("el refresh decide en UNA sentencia y conserva el rol dentro del token", async () => {
  const { state, service } = fixture({
    session: { id: "session-vieja", user_id: 7, expires_at: new Date(Date.now() + 60000) }
  });
  const refresh = jwt.sign({ id: 7, tenant_id: "empresa-a", sid: "session-vieja", uv: 3, tv: 5, type: "refresh", jti: "uno" }, { expiresIn: "30d" });

  const result = await service.refresh({ refresh }, {});

  assert.deepEqual(state.sentencias, ["id"], `el refresh pagó ${state.sentencias.length} sentencias de lectura`);
  assert.equal(state.lecturas.usuario, 0, "el refresh sigue releyendo usuario y rol con include");
  assert.equal(state.lecturas.tenant, 0, "el refresh sigue releyendo la empresa aparte");
  // El reclamo de rol es lo que autoriza cada peticion: si cambiara de forma, el cliente se
  // desconectaria aunque el refresh responda 200.
  assert.deepEqual(jwt.verify(result.token).role, { id: 2, name: "Tecnico", permissions: [] });
});
