// Certificacion local-remota de la fase de autenticacion: compara la decision de autorizacion que
// hoy viaja en UNA sentencia parametrizada contra la forma anterior (cinco sentencias Prisma) sobre
// datos reales del ambiente, y mide cuanto cuesta cada camino.
//
//   node scripts/certifications/hr-auth-latency-differential.js --env qa
//   node scripts/certifications/hr-auth-latency-differential.js --env production --limit=8
//
// Solo lectura: no escribe, no purge, no DDL. Aborta sin conectar si el ambiente declarado no
// coincide con el proyecto Supabase del DATABASE_URL, para no medir QA creyendo medir produccion.
// La evidencia guarda hash de tenant y numeros, nunca correos, ids crudos ni cadenas de conexion.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const REFS = { qa: "jbirkghkekuifgfsgquq", production: "jzbwzmkidfthknsohhnr" };
const envArg = process.argv.find((a) => a.startsWith("--env="))?.split("=")[1];
const limitArg = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || 6);
if (!envArg || !REFS[envArg]) {
  console.error("Uso: --env=qa|production [--limit=N]. Sin ambiente declarado no se conecta nada.");
  process.exit(2);
}

const envFile = path.resolve(__dirname, "..", "..", "config", envArg === "qa" ? "qa.env" : "production.env");
if (!fs.existsSync(envFile)) {
  console.error(`No existe ${path.relative(process.cwd(), envFile)}: no hay credenciales para ${envArg}.`);
  process.exit(2);
}
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en el archivo de ambiente.");
  process.exit(2);
}
const ref = String(process.env.DATABASE_URL).match(/[a-z]{20,27}/)?.[0] || "";
if (ref !== REFS[envArg]) {
  console.error(`ABORT: ${envArg} espera el proyecto ${REFS[envArg]} y el DATABASE_URL apunta a otro. No se conecta nada.`);
  process.exit(2);
}

const ROOT = path.resolve(__dirname, "..", "..");
const prisma = require(path.join(ROOT, "apps/api/src/core/prisma.js"));
const estado = require(path.join(ROOT, "apps/api/src/security/authorizationState.js"));
const { authorizationDecision } = estado;

// Con los flags apagados el modulo no escribe warn por consola; la politica de rechazo (usuario o
// empresa revocados) sigue activa, que es exactamente lo que se quiere comparar.
process.env.AUTHORIZATION_VERSION_OBSERVATION_ENABLED = "false";
process.env.AUTHORIZATION_VERSION_ENFORCEMENT_ENABLED = "false";

// Replica textual de validateAuthorization en HEAD~ (5 sentencias), sin tocar el modulo. Devuelve y
// rechaza con la misma forma que el producto para que la comparacion sea manzana con manzana.
function deny(reason) {
  const error = new Error("Sesion revocada o autorizacion desactualizada.");
  error.statusCode = 401;
  error.code = reason;
  return error;
}

async function lineaAntigua(payload) {
  const user = await prisma.user.findUnique({
    where: { id: Number(payload.id) },
    include: { role: { include: { permissions: true } } }
  });
  const tenant = user ? await prisma.tenant.findUnique({ where: { id: user.tenant_id } }) : null;
  const session = payload.sid ? await prisma.authorizationSession.findUnique({ where: { id: payload.sid } }) : null;
  const reason = authorizationDecision(payload, user, tenant, session);
  if (reason && ["USER_REVOKED", "TENANT_REVOKED", "AUTHORIZATION_STATE_MISSING"].includes(reason)) throw deny(reason);
  if (!user || !tenant) throw deny(reason || "AUTHORIZATION_STATE_MISSING");
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

// Lo que ve el cliente: la ruta rechaza (401), mide y deja pasar, o acepta. Un rechazo con codigo
// Prisma (sid mal formado) es 401 igual, pero se clasifica aparte para no disimular la diferencia.
const MOTIVOS = ["USER_REVOKED", "TENANT_REVOKED", "AUTHORIZATION_STATE_MISSING", "SESSION_REVOKED", "USER_VERSION_STALE", "TENANT_VERSION_STALE"];
function clasifica(ejecucion) {
  if (ejecucion.lanz) {
    return MOTIVOS.includes(ejecucion.code)
      ? { clase: "RECHAZA", motivo: ejecucion.code }
      : { clase: "RECHAZA_INTERNO", motivo: null };
  }
  return { clase: ejecucion.motivo ? "MIDE_Y_DEJA_PASAR" : "ACEPTA", motivo: ejecucion.motivo || null };
}

function resume(resultado) {
  return {
    tenant_ref: resultado.tenant_id ? crypto.createHash("sha256").update(String(resultado.tenant_id)).digest("hex").slice(0, 12) : null,
    motivo: resultado.authorization_reason || null,
    role: resultado.role?.name || null,
    permisos: Array.isArray(resultado.role?.permissions) ? resultado.role.permissions.length : 0,
    uv: resultado.authorization_user_version ?? null,
    tv: resultado.authorization_tenant_version ?? null,
    revoke_reason: resultado.authorization_session_revoke_reason || null
  };
}

async function segura(fn, payload) {
  const started = process.hrtime.bigint();
  try {
    const r = await fn(payload);
    return { ms: Number(process.hrtime.bigint() - started) / 1e6, ...resume(r), lanz: false };
  } catch (error) {
    return { ms: Number(process.hrtime.bigint() - started) / 1e6, lanz: true, code: error?.code || String(error?.message || "").slice(0, 40) };
  }
}

const meds = (valores) => [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)];

async function main() {
  const branch = require("node:child_process").execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim();
  const commit = require("node:child_process").execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();

  // Muestra util: usuarios ACTIVOS de empresas ACTIVAS con marcaciones recientes y sesion viva.
  // Sin ese filtro la corrida sale vacia (todo USER_REVOKED / TENANT_REVOKED) y el gate pasaría
  // midiendo solo rechazos identicos.
  const muestras = await prisma.$queryRawUnsafe(`
    select u.id as user_id, u.tenant_id, u.authorization_version as uv, u.active,
           t.authorization_version as tv_real,
           (select s.id from "AuthorizationSession" s
             where s.user_id = u.id and s.revoked_at is null and s.expires_at > now()
             order by s.created_at desc limit 1) as sid
    from "User" u
    join "Tenant" t on t.id = u.tenant_id and t.active
    where u.active and u.role_id is not null and u.tenant_id in (
      select distinct t2.tenant_id from "TimePunch" t2
      where t2.punched_at > now() - interval '15 days' and t2.employee_id is not null)
    order by u.id desc limit $1`, limitArg);
  if (!muestras.length) {
    console.error(`Sin muestras en ${envArg}: no hay usuarios con marcaciones recientes.`);
    process.exit(1);
  }

  const corridas = [];
  for (const m of muestras) {
    const base = { id: Number(m.user_id), sid: m.sid || undefined, uv: Number(m.uv), tv: Number(m.tv_real), tenant_id: m.tenant_id };
    const casos = [
      ["vivo", base],
      ["sid inexistente", { ...base, sid: "00000000-0000-4000-8000-000000000000" }],
      ["sid nulo", { ...base, sid: undefined }],
      ["uv viejo", { ...base, uv: Number(m.uv) + 1 }],
      ["tv viejo", { ...base, tv: 9999 }],
      ["usuario inactivo", { ...base, id: Number(m.user_id), forced_inactive: true }]
    ];
    for (const [nombre, payload] of casos) {
      if (nombre === "usuario inactivo") {
        // No se desactiva a nadie: se toma un usuario que YA esta inactivo si existe; si no, se
        // omite el caso y queda declarado en la evidencia.
        const inactivo = await prisma.$queryRawUnsafe(
          `select id, tenant_id, authorization_version as uv from "User" where active = false and role_id is not null limit 1`
        );
        if (!inactivo[0]) { corridas.push({ caso: nombre, omitido: "sin usuarios inactivos en el ambiente" }); continue; }
        const p = { id: Number(inactivo[0].id), sid: undefined, uv: Number(inactivo[0].uv), tv: 1 };
        const antigua = await segura(lineaAntigua, p);
        const nueva = await segura((x) => estado.validateAuthorization(x), p);
        corridas.push({ caso: nombre, user_id: p.id, antigua, nueva });
        continue;
      }
      const antigua = await segura(lineaAntigua, payload);
      const nueva = await segura((x) => estado.validateAuthorization(x), payload);
      corridas.push({ caso: `${crypto.createHash("sha256").update(String(m.tenant_id)).digest("hex").slice(0, 6)} · ${nombre}`, user_id: payload.id, antigua, nueva });
    }
  }

  const ejecutadas = corridas.filter((c) => c.antigua && c.nueva);
  const divergencias = [];
  const anomalias = [];
  for (const c of ejecutadas) {
    const a = clasifica(c.antigua);
    const n = clasifica(c.nueva);
    const detalleAntigua = c.antigua.lanz ? null : { ...c.antigua, ms: 0, lanz: undefined };
    const detalleNueva = c.nueva.lanz ? null : { ...c.nueva, ms: 0, lanz: undefined };
    if (a.clase === n.clase && a.motivo === n.motivo && JSON.stringify(detalleAntigua) === JSON.stringify(detalleNueva)) continue;
    const ambosCuarentaUno = a.clase.startsWith("RECHAZA") && n.clase.startsWith("RECHAZA");
    const registro = {
      caso: c.caso,
      antigua: { ...a, code: c.antigua.code || null },
      nueva: { ...n, code: c.nueva.code || null },
      detalle: { antigua: detalleAntigua, nueva: detalleNueva }
    };
    // Un sid mal formado puede dar motivos internos distintos segun la ruta: ambos son 401 en el
    // middleware. Se declara como anomaly, no se cuenta como divergencia de decision.
    if (ambosCuarentaUno) anomalias.push(registro);
    else divergencias.push(registro);
  }

  const tiemposAntigua = ejecutadas.map((c) => c.antigua.ms);
  const tiemposNueva = ejecutadas.map((c) => c.nueva.ms);
  const medianaAntigua = meds(tiemposAntigua);
  const medianaNueva = meds(tiemposNueva);
  const factor = medianaAntigua ? medianaNueva / medianaAntigua : null;
  const PRESUPUESTO_FACTOR = 0.6; // de 5 sentencias a 1: el piso por viaje debe caer en cascada

  // Cobertura obligatoria: una corrida donde todo se rechaza por igual tambien sale sin divergencias,
  // pero no demuestra nada. Se exige al menos un ACEPTA y dos casos con motivo (medido o rechazado).
  const cobertura = { ACEPTA: 0, MIDE_Y_DEJA_PASAR: 0, RECHAZA: 0, RECHAZA_INTERNO: 0 };
  for (const c of ejecutadas) cobertura[clasifica(c.nueva).clase] += 1;
  const coberturaSuficiente = cobertura.ACEPTA >= 1 && (cobertura.MIDE_Y_DEJA_PASAR + cobertura.RECHAZA + cobertura.RECHAZA_INTERNO) >= 2;
  const verde = divergencias.length === 0 && coberturaSuficiente && factor !== null && factor <= PRESUPUESTO_FACTOR;
  const evidencia = {
    evento: "hr_auth_latency_diferencial",
    ejecutado_en: new Date().toISOString(),
    rama: branch,
    commit,
    ambiente: envArg,
    project_ref: ref,
    muestra_usuarios: muestras.length,
    casos: ejecutadas.length,
    preservacion: { decisiones_revisadas: ejecutadas.length, divergencias: divergencias.length, lista: divergencias, anomalías_401: anomalias.length, lista_anomalias: anomalias },
    latencia_ms: {
      cinco_sentencias: { mediana: Number(medianaAntigua.toFixed(1)), min: Number(Math.min(...tiemposAntigua).toFixed(1)), max: Number(Math.max(...tiemposAntigua).toFixed(1)) },
      una_sentencia: { mediana: Number(medianaNueva.toFixed(1)), min: Number(Math.min(...tiemposNueva).toFixed(1)), max: Number(Math.max(...tiemposNueva).toFixed(1)) },
      factor: factor === null ? null : Number(factor.toFixed(2)),
      presupuesto_factor: PRESUPUESTO_FACTOR
    },
    cobertura,
    corridas: ejecutadas.map((c) => ({
      caso: c.caso,
      clase: clasifica(c.nueva).clase,
      antigua_ms: Number(c.antigua.ms.toFixed(1)),
      nueva_ms: Number(c.nueva.ms.toFixed(1)),
      antigua_lanza: !!c.antigua.lanz,
      nueva_lanza: !!c.nueva.lanz,
      code_antigua: c.antigua.code || null,
      code_nueva: c.nueva.code || null,
      motivo: c.nueva.motivo ?? null
    })),
    omitidos: corridas.filter((c) => c.omitido).map((c) => ({ caso: c.caso, motivo: c.omitido })),
    veredicto: verde ? "VERDE" : "ROJO",
    lectura: verde
      ? `Una sentencia decide igual que cinco en ${ejecutadas.length} casos y mediana ${medianaNueva.toFixed(0)} ms vs ${medianaAntigua.toFixed(0)} ms.`
      : `ROJO: ${divergencias.length} divergencias, cobertura ${JSON.stringify(cobertura)}${coberturaSuficiente ? "" : " (insuficiente: hace falta al menos un ACEPTA y dos casos con motivo)"}, factor ${factor === null ? "n/a" : factor.toFixed(2)} (presupuesto <= ${PRESUPUESTO_FACTOR}).`
  };

  const carpeta = path.join(ROOT, "docs", "qa", "evidence", "hr-auth-latency-20261119");
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `diferencial-${envArg}-${Date.now()}.json`);
  fs.writeFileSync(archivo, `${JSON.stringify(evidencia, null, 2)}\n`, "utf8");

  console.log(evidencia.lectura);
  console.log(`   ${ejecutadas.length} casos · divergencias ${divergencias.length} · anomalías 401 ${anomalias.length} · factor ${evidencia.latencia_ms.factor}`);
  for (const d of divergencias) console.log(`   DIVERGENCIA en ${d.caso}: antigua ${JSON.stringify(d.antigua)} vs nueva ${JSON.stringify(d.nueva)}`);
  for (const o of evidencia.omitidos) console.log(`   omitido: ${o.caso} (${o.motivo})`);
  console.log(`   evidencia -> ${path.relative(process.cwd(), archivo)}`);
  process.exit(verde ? 0 : 1);
}

main()
  .catch((error) => {
    console.error(`ABORT ${error?.code || ""} ${(error?.message || "").split("\n")[0]}`);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect().catch(() => {}));
