const prisma = require("../core/prisma");

const observe = () => String(process.env.AUTHORIZATION_VERSION_OBSERVATION_ENABLED || "").toLowerCase() === "true";
const enforce = () => String(process.env.AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED || "").toLowerCase() === "true";

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

  if (reason && (observe() || enforce())) {
    console.warn(JSON.stringify({ event: "authorization_version_mismatch", reason, user_id: payload.id, session_id: payload.sid || null }));
  }
  if (reason && (enforce() || ["USER_REVOKED", "TENANT_REVOKED", "AUTHORIZATION_STATE_MISSING"].includes(reason))) throw denied(reason);
  if (!user || !tenant) throw denied(reason || "AUTHORIZATION_STATE_MISSING");
  return {
    ...payload,
    tenant_id: user.tenant_id,
    role: user.role,
    authorization_reason: reason || null,
    authorization_user_version: user.authorization_version,
    authorization_tenant_version: tenant.authorization_version
  };
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

module.exports = { authorizationDecision, createSession, validateAuthorization, revokeSession, revokeAllUserSessions, revokeRoleUsers };
