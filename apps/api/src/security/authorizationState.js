const prisma = require("../core/prisma");
const { recordAuthorizationMismatch } = require("../fabric/metrics");

const flag = (name) => String(process.env[name] || "").toLowerCase() === "true";
const observe = () => flag("AUTHORIZATION_VERSION_OBSERVATION_ENABLED");
const enforce = () => flag("AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED");

// off: no registra nada; observe: mide y deja pasar; enforce: mide y rechaza.
// El orden importa: con enforcement encendido el modo es enforce aunque la
// observacion siga declarada.
function authorizationMode() {
  if (enforce()) return "enforce";
  if (observe()) return "observe";
  return "off";
}

const observed = Object.create(null);
const observationStartedAt = new Date().toISOString();
let observedTotal = 0;

function authorizationMetrics() {
  return {
    started_at: observationStartedAt,
    mode: authorizationMode(),
    total: observedTotal,
    reasons: { ...observed }
  };
}

// Se cuenta siempre, aunque el flag este apagado: una tasa que solo existe
// cuando alguien la enciende no sirve para decidir si conviene encenderla.
function noteAuthEvent(event, reason, payload, extra = {}) {
  observedTotal += 1;
  observed[reason] = (observed[reason] || 0) + 1;
  try {
    recordAuthorizationMismatch(reason);
  } catch {
    // Una metrica nunca puede tumbar una peticion.
  }
  if (authorizationMode() !== "off") {
    console.warn(JSON.stringify({
      event,
      mode: authorizationMode(),
      reason,
      user_id: payload?.id ?? null,
      session_id: payload?.sid || null,
      observed_total: observedTotal,
      ...extra
    }));
  }
}

function recordMismatch(reason, payload, session) {
  noteAuthEvent("authorization_version_mismatch", reason, payload, {
    session_revoke_reason: session?.revoke_reason || null
  });
}

function denied(reason) {
  const error = new Error("Sesion revocada o autorizacion desactualizada.");
  error.statusCode = 401;
  error.code = reason;
  return error;
}

function authorizationDecision(payload, user, tenant, session, now = new Date()) {
  if (!user || !user.active) return "USER_REVOKED";
  if (!tenant || !tenant.active) return "TENANT_REVOKED";
  if (payload.sid && (!session || session.user_id !== user.id || session.revoked_at || session.expires_at <= now)) return "SESSION_REVOKED";
  if (payload.uv !== undefined && payload.uv !== user.authorization_version) return "USER_VERSION_STALE";
  if (payload.tv !== undefined && payload.tv !== tenant.authorization_version) return "TENANT_VERSION_STALE";
  return "";
}

async function createSession(user, tenant, expiresInDays = 30) {
  return prisma.authorizationSession.create({
    data: {
      user_id: user.id,
      tenant_id: user.tenant_id,
      user_version: user.authorization_version,
      tenant_version: tenant.authorization_version,
      expires_at: new Date(Date.now() + expiresInDays * 86400000)
    }
  });
}

async function validateAuthorization(payload) {
  const user = await prisma.user.findUnique({
    where: { id: Number(payload.id) },
    include: { role: { include: { permissions: true } } }
  });
  const tenant = user ? await prisma.tenant.findUnique({ where: { id: user.tenant_id } }) : null;
  const session = payload.sid ? await prisma.authorizationSession.findUnique({ where: { id: payload.sid } }) : null;
  const reason = authorizationDecision(payload, user, tenant, session);

  if (reason) recordMismatch(reason, payload, session);
  if (reason && (enforce() || ["USER_REVOKED", "TENANT_REVOKED", "AUTHORIZATION_STATE_MISSING"].includes(reason))) throw denied(reason);
  if (!user || !tenant) throw denied(reason || "AUTHORIZATION_STATE_MISSING");
  return {
    ...payload,
    tenant_id: user.tenant_id,
    role: user.role,
    authorization_reason: reason || null,
    authorization_user_version: user.authorization_version,
    authorization_tenant_version: tenant.authorization_version,
    authorization_session_revoke_reason: session?.revoke_reason || null
  };
}

// Renueva la sesion sin subir las versiones: la anterior queda revocada con
// `refresh_rotated`, de modo que reutilizar un refresh viejo sea observable.
// Quien ya presento una sesion revocada no recibe una nueva: rotar ahi lavaria
// el logout en una sesion fresca.
async function rotateSession(user, authorization, previousSid) {
  const created = await prisma.authorizationSession.create({
    data: {
      user_id: user.id,
      tenant_id: user.tenant_id,
      user_version: authorization.authorization_user_version,
      tenant_version: authorization.authorization_tenant_version,
      expires_at: new Date(Date.now() + 30 * 86400000)
    }
  });
  if (previousSid) {
    await prisma.authorizationSession.updateMany({
      where: { id: previousSid, user_id: user.id, revoked_at: null },
      data: { revoked_at: new Date(), revoke_reason: "refresh_rotated" }
    });
  }
  return created;
}

async function revokeSession(userId, sessionId, reason = "user_requested") {
  const result = await prisma.authorizationSession.updateMany({
    where: { id: sessionId, user_id: Number(userId), revoked_at: null },
    data: { revoked_at: new Date(), revoke_reason: reason }
  });
  return { revoked: result.count === 1 };
}

async function revokeAllUserSessions(userId, reason = "authorization_changed") {
  await prisma.user.update({ where: { id: Number(userId) }, data: { authorization_version: { increment: 1 } } });
  return prisma.authorizationSession.updateMany({
    where: { user_id: Number(userId), revoked_at: null },
    data: { revoked_at: new Date(), revoke_reason: reason }
  });
}

async function revokeRoleUsers(roleId, reason = "role_authorization_changed") {
  const users = await prisma.user.findMany({ where: { role_id: Number(roleId) }, select: { id: true } });
  for (const user of users) await revokeAllUserSessions(user.id, reason);
  return users.length;
}

module.exports = {
  authorizationDecision,
  authorizationMode,
  authorizationMetrics,
  noteAuthEvent,
  createSession,
  rotateSession,
  validateAuthorization,
  revokeSession,
  revokeAllUserSessions,
  revokeRoleUsers
};
