const bcrypt = require("bcrypt");
const { randomUUID } = require("node:crypto");
const prisma = require("../../core/prisma");
const { brainQueue } = require("../../fabric/queues");
const { assertLoginAllowed, registerLoginFailure, registerLoginSuccess } = require("../../security/authGuard");
const jwt = require("../../security/jwt");
const { assertPasswordPolicy } = require("../../security/policy");
const accountingService = require("../accounting/service");
const authorizationState = require("../../security/authorizationState");
const personalWebauthn = require("../hr/personal-webauthn");
const { webauthnConfig } = require("../hr/shared-device-identity");

const SEED_MODULES = ["M-01", "M-03", "M-04", "M-05", "M-07", "M-22"];
const ALL_MODULES = Array.from({ length: 27 }, (_, index) => `M-${String(index + 1).padStart(2, "0")}`);

// Hash de un valor aleatorio que nadie conoce: solo sirve para que el login de
// un correo inexistente pague el mismo bcrypt.compare que uno real.
const DUMMY_PASSWORD_HASH = "$2b$12$S36X7Uc8tRh0EPeuWmminO0Ne4xKFPVqp94hVC14zntOU4K1R3PLO";

function publicUser(user) {
  const role = user.role || {};
  const preferences = user.preferences && typeof user.preferences === "object" ? user.preferences : {};
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    tenant_id: user.tenant_id,
    company_id: preferences.company_id || null,
    role: role.name || null,
    role_id: role.id || user.role_id || null,
    role_permissions: Array.isArray(role.permissions) ? role.permissions : [],
    role_metadata: role.metadata || {}
  };
}

function publicTenant(tenant) {
  if (!tenant) return null;
  const config = tenant.config && typeof tenant.config === "object" ? tenant.config : {};
  return {
    id: tenant.id,
    name: tenant.name,
    company_id: config.company_id || null,
    industry: tenant.industry,
    country: tenant.country,
    currency: tenant.currency,
    active_modules: tenant.active_modules || []
  };
}

async function registerTenant(input, fastify) {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  assertPasswordPolicy(input.password);
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

  const session = await authorizationState.createSession(result.user, result.tenant);
  const claims = {
    id: result.user.id,
    tenant_id: result.tenant.id,
    role: { name: result.role.name, permissions: result.role.permissions },
    sid: session.id,
    uv: result.user.authorization_version,
    tv: result.tenant.authorization_version
  };
  const token = jwt.sign(claims, { expiresIn: "8h" });
  const refresh = jwt.sign({ ...claims, role: undefined, type: "refresh" }, { expiresIn: "30d" });

  return { token, refresh, tenant: publicTenant(result.tenant), user: publicUser({ ...result.user, role: result.role }) };
}

async function login(input, fastify, request = {}) {
  const email = String(input.email || "").toLowerCase();
  assertLoginAllowed(email, request.ip);

  // El indice unico de `User` es (tenant_id, email), asi que el mismo correo puede vivir en varias
  // empresas y en QA vive (7 correos medidos el 2026-11-24, uno de ellos activo en 4). `findFirst`
  // escogia una fila al azar: metia al usuario en la empresa equivocada o le negaba el acceso a quien
  // si estaba activo en otra. Todas las filas del correo salen de UNA sentencia.
  const candidatos = await authorizationState.readAuthorizationSnapshotsByEmail(email);

  // bcrypt corre siempre, y contra cada fila del correo en paralelo para que el tiempo no delate cual
  // coincidio. Sin `DUMMY_PASSWORD_HASH` un correo inexistente respondia mas rapido que uno real y el
  // login se volvia un oraculo de correos.
  const hashes = candidatos.length ? candidatos.map((c) => c.user.password) : [DUMMY_PASSWORD_HASH];
  const resultados = await Promise.all(hashes.map((hash) => bcrypt.compare(String(input.password || ""), hash)));
  const coinciden = candidatos.filter((c, i) => resultados[i]);
  const admitidas = coinciden.filter((c) => c.user.active && c.tenant?.active);

  // Todo lo demas responde el MISMO 401 con el MISMO trabajo: ni la clave correcta de una cuenta
  // inactiva, ni un empate entre empresas, le dicen al que llama que ese correo existe.
  if (admitidas.length !== 1) {
    if (admitidas.length > 1) {
      authorizationState.noteAuthEvent("login_correo_ambiguo", "LOGIN_CORREO_AMBIGUO", null, { cuentas: admitidas.length });
    }
    registerLoginFailure(email, request.ip);
    const err = new Error("No fue posible iniciar sesion con esas credenciales.");
    err.statusCode = 401;
    throw err;
  }

  registerLoginSuccess(email, request.ip);
  return startSession(admitidas[0].user, admitidas[0].tenant);
}

// Sesion de un usuario ya autenticado (clave o huella): misma respuesta en ambos casos. `tenant`
// llega de la misma sentencia que trajó al usuario; pedirlo aparte era un viaje mas al pooler.
async function startSession(user, tenant = null) {
  await prisma.user.update({ where: { id: user.id }, data: { last_login: new Date() } });
  const company = tenant || await prisma.tenant.findUnique({ where: { id: user.tenant_id } });
  const session = await authorizationState.createSession(user, company);
  const claims = { id: user.id, tenant_id: user.tenant_id, role: user.role, sid: session.id, uv: user.authorization_version, tv: company.authorization_version };
  const token = jwt.sign(claims, { expiresIn: "8h" });
  const refresh = jwt.sign({ ...claims, role: undefined, type: "refresh" }, { expiresIn: "30d" });

  return { token, refresh, tenant: publicTenant(company), user: publicUser(user) };
}

// ---------------------------------------------------------------- ingreso con huella
// La web movil entra con la llave WebAuthn que el empleado registro en Marcar jornada
// (hr/personal-webauthn.js). El reto lleva empresa y usuario firmados por el servidor.
function fingerprintLoginConfig() {
  const config = webauthnConfig();
  if (!config.allowedOrigins.length || !config.allowedRpIds.length) {
    const err = new Error("El ingreso con huella no esta habilitado en este servidor.");
    err.statusCode = 503;
    err.code = "WEBAUTHN_NO_CONFIGURADO";
    throw err;
  }
  return config;
}

async function fingerprintChallenge(input = {}) {
  fingerprintLoginConfig();
  return personalWebauthn.issueLoginChallenge({ tenantId: input.tenant_id, userId: input.user_id, secret: process.env.JWT_SECRET });
}

async function fingerprintLogin(input = {}, fastify, request = {}) {
  const config = fingerprintLoginConfig();
  const { tenantId, userId } = personalWebauthn.consumeLoginChallenge(input.challenge, { secret: process.env.JWT_SECRET });
  const guardKey = `huella:${tenantId}:${userId}`;
  assertLoginAllowed(guardKey, request.ip);
  try {
    const credential = await prisma.hrWebauthnCredential.findFirst({
      where: { tenant_id: tenantId, credential_id: String(input.credential_id || ""), active: true }
    });
    const verified = personalWebauthn.verifyLoginAssertion({ credential, userId, input, ...config });
    // El reto ya trae la empresa firmada por el servidor: se contrasta contra la fila leida, como
    // hacia el `where { id, tenant_id }`, pero en la misma sentencia que da rol, permisos y empresa.
    const perfil = await authorizationState.readAuthorizationSnapshot(userId);
    const user = perfil.user && perfil.user.tenant_id === tenantId ? perfil.user : null;
    if (!user || !user.active) {
      const err = new Error("No fue posible entrar con tu huella. Entra con tu correo y clave.");
      err.statusCode = 401;
      err.code = "HUELLA_USUARIO_NO_DISPONIBLE";
      throw err;
    }
    await prisma.hrWebauthnCredential.update({ where: { id: credential.id }, data: { sign_count: verified.sign_count, last_used_at: new Date() } });
    registerLoginSuccess(guardKey, request.ip);
    return startSession(user, perfil.tenant);
  } catch (error) {
    if (error.statusCode === 401) registerLoginFailure(guardKey, request.ip);
    throw error;
  }
}

// El middleware ya resolvio usuario, rol, permisos y tenant en UNA sentencia
// (`AUTHORIZATION_SNAPSHOT`). Releerlos con `include` hacia cuatro viajes mas al pooler —~2,6 s de
// piso en cada apertura de pantalla, porque el dashboard consulta /auth/me en cada ruta— sin traer
// un dato nuevo. Se lee el mismo snapshot: sigue siendo estado vivo de la base, y `publicUser` /
// `publicTenant` son la unica proyeccion que sale (la fila cruda trae hash de clave).
async function me(user) {
  const snapshot = await authorizationState.readAuthorizationSnapshot(user.id);
  const current = snapshot.user;
  if (!current || !current.active) {
    const err = new Error("Usuario no disponible");
    err.statusCode = 401;
    throw err;
  }
  return { tenant: publicTenant(snapshot.tenant), user: publicUser(current) };
}

async function refresh(input, fastify) {
  const payload = jwt.verify(input.refresh);
  if (payload.type !== "refresh") {
    const err = new Error("Token de renovación inválido");
    err.statusCode = 401;
    throw err;
  }
  const authorization = await authorizationState.validateAuthorization(payload);
  // `validateAuthorization` ya leyo usuario, rol, permisos y tenant en la sentencia del snapshot y ya
  // rechazo al inexistente, al inactivo y a la empresa cerrada (USER_REVOKED / TENANT_REVOKED /
  // AUTHORIZATION_STATE_MISSING se rechazan siempre, no solo con enforcement). Volverlos a traer con
  // `include` eran tres viajes mas al pooler por datos ya resueltos arriba.

  // Un refresh viejo solo se puede distinguir de uno revocado por logout si se
  // mira por que se revoco la sesion. En modo observar se registra y se sigue;
  // con enforcement encendido, validateAuthorization ya lo rechazo arriba.
  const sessionRevoked = authorization.authorization_reason === "SESSION_REVOKED";
  if (sessionRevoked) {
    const revokedByRotation = authorization.authorization_session_revoke_reason === "refresh_rotated";
    authorizationState.noteAuthEvent(
      revokedByRotation ? "refresh_token_reused" : "refresh_session_revoked",
      revokedByRotation ? "REFRESH_TOKEN_REUSED" : "REFRESH_SESSION_REVOKED",
      payload,
      { session_revoke_reason: authorization.authorization_session_revoke_reason || null }
    );
  }

  // Solo la identidad que necesita `rotateSession`: el resto del perfil ya lo trajo el snapshot.
  const titular = { id: authorization.id, tenant_id: authorization.tenant_id };
  const claims = {
    id: authorization.id,
    tenant_id: authorization.tenant_id,
    uv: authorization.authorization_user_version,
    tv: authorization.authorization_tenant_version
  };

  // Rotar sobre una sesion ya revocada la lavaria en una sesion nueva: el
  // logout dejaria de valer para quien tenga el refresh. Se conserva el sid
  // revocado y se devuelve el mismo refresh presentado, sin ganar otros 30
  // dias; lo que se mide es el intento, no una sesion nueva.
  if (sessionRevoked) {
    return {
      token: jwt.sign({ ...claims, role: authorization.role, sid: payload.sid }, { expiresIn: "8h" }),
      refresh: input.refresh
    };
  }

  const rotated = await authorizationState.rotateSession(titular, authorization, payload.sid);
  return {
    token: jwt.sign({ ...claims, role: authorization.role, sid: rotated.id }, { expiresIn: "8h" }),
    refresh: jwt.sign({ ...claims, sid: rotated.id, type: "refresh", jti: randomUUID() }, { expiresIn: "30d" })
  };
}

async function changePassword(user, input = {}) {
  const currentPassword = String(input.current_password || "");
  const nextPassword = String(input.new_password || input.password || "");
  if (!currentPassword) {
    const err = new Error("Clave actual requerida.");
    err.statusCode = 400;
    throw err;
  }
  assertPasswordPolicy(nextPassword);
  const current = await prisma.user.findUnique({ where: { id: user.id } });
  if (!current || !current.active) {
    const err = new Error("Usuario no disponible");
    err.statusCode = 401;
    throw err;
  }
  if (!(await bcrypt.compare(currentPassword, current.password))) {
    const err = new Error("La clave actual no coincide.");
    err.statusCode = 403;
    throw err;
  }
  const password = await bcrypt.hash(nextPassword, 12);
  await prisma.user.update({ where: { id: current.id }, data: { password } });
  await authorizationState.revokeAllUserSessions(current.id, "password_changed");
  return { ok: true };
}

async function logout(user) {
  if (!user.sid) return { revoked: false };
  return authorizationState.revokeSession(user.id, user.sid, "logout");
}

async function revokeSession(user, sessionId) {
  return authorizationState.revokeSession(user.id, sessionId, "user_requested");
}

module.exports = { registerTenant, login, fingerprintChallenge, fingerprintLogin, me, refresh, changePassword, logout, revokeSession };
