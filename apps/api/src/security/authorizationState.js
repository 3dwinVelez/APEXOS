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

// El costo de una peticion autenticada es por SENTENCIA, no por trabajo: cada viaje al pooler paga su
// ida y vuelta (~114 ms medidos a Produccion y ~400 ms a QA desde el puesto; 500-600 ms desde Railway)
// y Prisma parte cada `include` en sentencias propias, asi que usuario+rol+permisos+tenant+sesion eran
// 5 viajes de piso en TODA peticion. Aqui se decide en una sola. Medido con
// `npm run certify:hr-auth-latency:qa|production`: 2 009 ms -> 532 ms y 572 ms -> 144 ms, 18 decisiones
// por ambiente sin divergencias. Las fechas salen como texto desde jsonb y `authorizationDecision` las
// compara como Date, asi que se normalizan aqui: sin este paso una sesion vencida no se veria vencida.
// `user` es palabra reservada en Postgres: los alias van entrecomillados o la sentencia revienta
// en 42601 antes de llegar a decidir nada.
const AUTHORIZATION_SNAPSHOT = `
  select to_jsonb(u) as "user",
    case when r.id is null then null
         else to_jsonb(r) || jsonb_build_object('permissions', coalesce(perms.perm_rows, '[]'::jsonb))
    end as "role",
    to_jsonb(t) as "tenant",
    case when s.id is null then null else to_jsonb(s) end as "session"
  from "User" u
  left join "Role" r on r.id = u.role_id
  left join lateral (select jsonb_agg(to_jsonb(p)) as perm_rows from "Permission" p where p.role_id = r.id) perms on true
  left join "Tenant" t on t.id = u.tenant_id
  left join "AuthorizationSession" s on s.id = cast(__SID__ as uuid) and s.user_id = u.id
  where u.id = cast(__UID__ as int4)
  limit 1`;

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Lee el estado vivo de autorizacion en UNA sentencia. `validateAuthorization` decide con ella y
// quien necesite el perfil (por ejemplo `/auth/me`) la reusa: cada viaje al pooler cuesta ~660 ms
// desde Railway, asi que volver a traer usuario+rol+permisos+tenant por otra via pagaba cuatro
// sentencias por algo ya resuelto. Las fechas salen como texto desde jsonb: se normalizan aqui.
async function readAuthorizationSnapshot(userId, sid = null) {
  // El sid viene de una columna uuid creada por el propio sistema, asi que se pasa tal cual: un
  // valor mal formado hace fallar el cast y el middleware responde 401, igual que hoy.
  const sessionParam = sid ? String(sid) : null;
  const rows = await prisma.$queryRawUnsafe(
    AUTHORIZATION_SNAPSHOT.replace("__SID__", "$1").replace("__UID__", "$2"),
    sessionParam,
    Number(userId)
  );
  const row = rows[0] || null;
  const user = row?.user ? { ...row.user, role: row.role || null } : null;
  const tenant = row?.tenant || null;
  const session = row?.session
    ? { ...row.session, revoked_at: dateOrNull(row.session.revoked_at), expires_at: dateOrNull(row.session.expires_at) }
    : null;
  return { user, tenant, session };
}

async function validateAuthorization(payload) {
  const { user, tenant, session } = await readAuthorizationSnapshot(payload.id, payload.sid || null);
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
  readAuthorizationSnapshot,
  revokeSession,
  revokeAllUserSessions,
  revokeRoleUsers
};
