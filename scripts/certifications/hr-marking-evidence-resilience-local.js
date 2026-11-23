// Certificacion LOCAL (en vivo) de la marcacion con evidencia resiliente y de la via de
// desbloqueo administrativo que autorizo el dueno el 2026-11-19.
//
// Que se certifica y por que existe este script:
//   La queja operativa fue "la app rechaza marcaciones y los operarios quedan sin jornada".
//   El diagnostico separo dos cosas distintas: archivos de foto que el servidor NO deberia
//   haber tirado (PNG etiquetado como JPEG, HEIC de camara, base64 mal transportado) y huecos
//   historicos de escalera que ya no pueden marcarse por el canal propio. Este script ejercita
//   en vivo, por HTTP y contra la base local, las dos salidas:
//     - La evidencia degrada pero la marcacion vive (criterios 2, 3, 4, 5 y 9 del brief
//       docs/briefs/2026-11-19-marcacion-evidencia-resiliente.md).
//     - El supervisor rellena el eslabon que falto con `correccion_administrativa` +
//       `motivo_correccion`, la fila queda sellada con autor/motivo/salto y genera la novedad
//       `AJUSTE_MANUAL_MARCACION`; el canal propio sigue obligado por la escalera (criterio 10).
//
// Forma: API Fastify real (`apps/api/server.js`) escuchando en 127.0.0.1, fixtures temporales
// (roles, usuarios, ficha) creados por el servicio de admin y marcaciones enviadas por HTTP con
// selfies sinteticas generadas con `sharp`. Ningun assertion depende de un stub.
//
// NO toca QA ni produccion: aborta si DATABASE_URL no apunta a localhost/127.0.0.1. La evidencia
// que se guarda en docs/qa/evidence suprime las cadenas largas (no se escribe base64 de fotos en
// el JSON de certificacion). Sale con codigo distinto de cero ante cualquier fallo.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (!v.startsWith("--")) continue;
    out[v.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return out;
}
const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || "apps/api/.env")));

const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: esta certificacion solo corre contra una base LOCAL (localhost/127.0.0.1). Define DATABASE_URL local antes de ejecutar.");
  process.exit(1);
}
process.env.DISABLE_REDIS = process.env.DISABLE_REDIS || "true";

const ROOT = path.resolve(__dirname, "..", "..");
const API = path.join(ROOT, "apps/api");
const WEB = path.join(ROOT, "apps/web");

const PORT = Number(args.port || 3219);
const API_URL = `http://127.0.0.1:${PORT}`;
const REQUEST_TIMEOUT_MS = Number(args["request-timeout-ms"] || 30000);
const ARTIFACT = "hr-marca-evidence-resilience-20261119";
const OUTPUT = path.resolve(String(args.output || path.join("docs", "qa", "evidence", ARTIFACT, "local-certification.json")));
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Mrs-${crypto.randomBytes(6).toString("hex")}#26`;
const CODE_PREFIX = "QA-MRS-";
const EMAIL_PREFIX = "qa.mrs.";
const ROLE_PREFIXES = ["QA MarcaResil Supervisor", "QA MarcaResil Operario"];
const HR_CODES = ["m-17", "talento-humano", "talento_humano", "hr"];
const MANUAL_ADJUSTMENT_NOVELTY_CODE = "AJUSTE_MANUAL_MARCACION";
// America/Bogota es UTC-05:00 fijo (sin horario de verano): todas las horas de jornada se declaran
// con ese desplazamiento explicito para que el servidor no las lea como UTC.
const OPERATING_OFFSET = "-05:00";
const WEB_EVIDENCE_MAX_BYTES = 2 * 1024 * 1024;

const prisma = require(path.join(API, "src/core/prisma"));
const admin = require(path.join(API, "src/modules/admin/service"));

function loadSharp() {
  for (const candidate of [path.join(API, "node_modules", "sharp"), path.join(ROOT, "node_modules", "sharp"), "sharp"]) {
    try { return require(candidate); } catch { /* siguiente resolucion */ }
  }
  return null;
}
const sharp = loadSharp();

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const dayBack = (days) => new Date(Date.now() - days * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const instantAt = (day, clock) => `${day}T${clock}:00${OPERATING_OFFSET}`;

const result = {
  change_id: ARTIFACT,
  certification: "hr-marking-evidence-resilience-local",
  environment: "LOCAL",
  database_url_host: DATABASE_URL.replace(/\/\/[^@]*@/, "//***@"),
  generated_at: new Date().toISOString(),
  api_commit: "unknown",
  api_url: API_URL,
  operating_timezone: "America/Bogota",
  scope: {
    capability:
      "Marcacion web resiliente con evidencia (PNG etiquetado como JPEG, HEIC/AVIF de camara, tres variantes de transporte base64 roto, payload sobre el tope, PDF y mp4 hostiles) y via de desbloqueo administrativo sancionada (POST /hr/time-punches con correccion_administrativa + motivo_correccion fuera de la escalera, sello de autor en metadata, novedad AJUSTE_MANUAL_MARCACION del mismo dia y canal propio que sigue obligado por la escalera).",
    proven_by_live_execution: [
      "POST /api/v1/hr/self/time-punches guarda la marcacion con evidencia disponible cuando el archivo es PNG etiquetado image/jpeg, conserva el tipo olido y el hash de lo recibido",
      "Un HEIC real (marca mayor heic) degrada la evidencia con su codigo y NO cuesta la marcacion",
      "Doble prefijo data:, saltos de linea, alfabeto url-safe y padding ausente se normalizan y la marcacion se guarda",
      "Alfabeto invalido, payload sobre el tope, PDF y mp4 se rechazan con codigo y detalle que nombran el motivo; despues del rechazo la jornada puede marcarse limpia",
      "La fila degradada de la web no arrastra bytes (has_base64_data false, sin base64_data)",
      "Todo 4xx del flujo trae code legible y ningun 5xx aparece",
      "POST /api/v1/hr/time-punches rechaza el hueco fuera de escalera sin motivo (422 MOTIVO_CORRECCION_REQUERIDO) y lo acepta con motivo, sellando autor, motivo y salto",
      "La correccion genera la novedad AJUSTE_MANUAL_MARCACION del mismo dia con el motivo y escalera:<salto>",
      "El canal propio ignora correccion_administrativa: sigue obligado por la escalera (409)"
    ],
    proven_by_versioned_unit_suite: [
      "apps/api/test/hr-mobile-identity.test.js (camino feliz de la app: verified y hash firmado)",
      "apps/api/test/hr-evidence-resilience.test.js (matriz de clases y normalizaciones)",
      "apps/api/test/hr-marking-declared-employee.test.js (destino declarado y escalera)",
      "apps/web/test/hr-marking-correction.test.mjs (contrato del boton de correccion del supervisor)"
    ]
  },
  checks: [],
  status: "running"
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.error(`[cert] ${String(result.checks.length).padStart(2, "0")} ${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

// La evidencia no puede pesar lo que pesa la base de datos: ninguna cadena larga (un data URL de
// selfie) se escribe en el JSON de certificacion.
function redact(value, depth = 0) {
  if (typeof value === "string") {
    if (value.length <= 120) return value;
    const kind = /^data:[^;]+;base64,/.test(value) ? "data-url" : "cadena";
    return `<${kind} de ${value.length} caracteres suprimida>`;
  }
  if (Array.isArray(value)) return depth > 4 ? `[${value.length} elementos]` : value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    if (depth > 4) return `{${Object.keys(value).length} claves}`;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item, depth + 1)]));
  }
  return value;
}

const requestLog = [];
async function capture(route, { token = "", method = "GET", body } = {}) {
  const started = Date.now();
  let status = 0;
  let payload = {};
  let transportError = null;
  try {
    const res = await fetch(`${API_URL}${route}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    status = res.status;
    payload = await res.json().catch(() => ({}));
  } catch (error) {
    transportError = error.message;
  }
  requestLog.push({ method, path: route, status, code: payload?.code || null, transport_error: transportError, latency_ms: Date.now() - started });
  return { status, payload, transportError };
}

async function login(email) {
  const response = await capture("/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  if (response.status !== 200 || !response.payload?.token) throw new Error(`Login fallo para ${email}: ${response.status} ${response.payload?.code || ""}`);
  return response.payload.token;
}

function modulesOf(tenant) {
  return Array.isArray(tenant.active_modules) ? tenant.active_modules.map((code) => String(code || "").trim().toLowerCase()) : [];
}

// Limpieza del arbol operativo completo de la ficha (sesiones, marcaciones, jornales y novedades)
// antes de borrar la ficha: los fixtures de esta corrida escriben ~12 dias de jornada.
async function purgeEmployeeFixture(tenantId, employeeIds) {
  const summary = { sessions: 0, punches: 0, workdays: 0, novelties: 0, employees: 0, errors: [] };
  if (!tenantId || !employeeIds.length) return summary;
  await prisma.runWithTenant(tenantId, async () => {
    const sessions = await prisma.workSession.findMany({ where: { tenant_id: tenantId, employee_id: { in: employeeIds } }, select: { id: true } });
    const sessionIds = sessions.map((item) => item.id);
    if (sessionIds.length) {
      await prisma.workActivity.deleteMany({ where: { tenant_id: tenantId, session_id: { in: sessionIds } } }).then((r) => { summary.activities = r.count; }).catch(() => undefined);
    }
    summary.sessions = await prisma.workSession.deleteMany({ where: { tenant_id: tenantId, employee_id: { in: employeeIds } } }).then((r) => r.count).catch(() => 0);
    summary.punches = await prisma.timePunch.deleteMany({ where: { tenant_id: tenantId, employee_id: { in: employeeIds } } }).then((r) => r.count).catch(() => 0);
    summary.workdays = await prisma.processedWorkday.deleteMany({ where: { tenant_id: tenantId, employee_id: { in: employeeIds } } }).then((r) => r.count).catch(() => 0);
    for (const id of employeeIds) {
      try { await prisma.$executeRaw`DELETE FROM th_novedades_jornada WHERE tenant_id = ${tenantId} AND employee_id = ${id}`; summary.novelties += 1; }
      catch (error) { summary.errors.push(`novelties ${id}: ${error.message}`); }
    }
    for (const id of employeeIds) {
      try { await prisma.employee.delete({ where: { id } }); summary.employees += 1; } catch (error) { summary.errors.push(`employee ${id}: ${error.message}`); }
    }
  });
  return summary;
}

async function purgeStaleLeftovers(tenantId) {
  const purged = { employees: 0, users: 0, roles: 0, errors: [] };
  const staleEmployees = await prisma.runWithTenant(tenantId, () => prisma.employee.findMany({ where: { code: { startsWith: CODE_PREFIX } }, select: { id: true } }));
  if (staleEmployees.length) {
    try {
      const summary = await purgeEmployeeFixture(tenantId, staleEmployees.map((item) => item.id));
      purged.employees = summary.employees;
      purged.errors.push(...summary.errors);
    } catch (error) { purged.errors.push(error.message); }
  }
  await prisma.runWithTenant(tenantId, async () => {
    const staleUsers = await prisma.user.findMany({ where: { email: { startsWith: EMAIL_PREFIX } }, select: { id: true } });
    for (const user of staleUsers) {
      try { await admin.setUserActive(tenantId, user.id, false); purged.users += 1; } catch (error) { purged.errors.push(`user ${user.id}: ${error.message}`); }
    }
    const staleRoles = await prisma.role.findMany({ where: { name: { startsWith: "QA " } }, select: { id: true, name: true, metadata: true } });
    for (const role of staleRoles.filter((item) => ROLE_PREFIXES.some((prefix) => String(item.name || "").startsWith(prefix)))) {
      if (role.metadata?.active === false) continue;
      try { await admin.setRoleActive(tenantId, role.id, false); purged.roles += 1; } catch (error) { purged.errors.push(`role ${role.id}: ${error.message}`); }
    }
  });
  return purged;
}

// ---------------------------------------------------------------------------
// Fixtures de evidencia: imagenes reales sinteticas y contenedores hostiles.
// ---------------------------------------------------------------------------
async function fixtures() {
  if (!sharp) throw new Error("sharp no esta disponible en el puesto: sin el no hay fixtures reales de evidencia");
  const jpeg = await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 180, g: 140, b: 110 } } }).jpeg({ quality: 90 }).toBuffer();
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 9, g: 20, b: 40 } } }).png().toBuffer();
  let avif = null;
  try {
    avif = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 30, g: 90, b: 60 } } }).avif().toBuffer();
  } catch { avif = null; }
  // HEIC sintetica con marca mayor `heic`: contenedor HEIF legitimo (clase imagen) que este build
  // de sharp no decodifica (libvips sin decodificador HEVC). Es el caso de la camara de un iPhone.
  const heic = Buffer.concat([
    Buffer.from([0, 0, 0, 24]), Buffer.from("ftyp"), Buffer.from("heic"),
    Buffer.from([0, 0, 0, 24]), Buffer.from("heic"), Buffer.from("mif1"),
    Buffer.alloc(600, 11)
  ]);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7 ", "ascii"), Buffer.alloc(400, 7)]);
  const mp4 = Buffer.concat([Buffer.alloc(4, 0), Buffer.from("ftypisom", "ascii"), Buffer.alloc(400, 7)]);
  // PNG de ruido: intratable para el compresor, asi se pasa del tope de 2 MB con dimensiones
  // decodificables (< 4096 px). Lo que se certifica es el rechazo del tope, no un payload ileible
  // (un payload ileible por encima del tope degrada a proposito).
  let oversize = null;
  for (const size of [900, 1100, 1400]) {
    const raw = crypto.randomBytes(size * size * 3);
    const buffer = await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
    if (buffer.length > WEB_EVIDENCE_MAX_BYTES + 8192) { oversize = buffer; break; }
  }
  return { jpeg, png, avif, heic, pdf, mp4, oversize };
}

const photo = (buffer, { type = "image/jpeg", name = "selfie.jpg", base64 } = {}) => ({
  base64: base64 ?? buffer.toString("base64"),
  type,
  name,
  size: buffer.length
});

async function main() {
  let app = null;
  const cleanup = { users: [], roles: [], employees: [], tenantId: null };
  try {
    if (!sharp) throw new Error("sharp no esta disponible en el puesto: la certificacion exige fixtures reales de imagen");
    const FIX = await fixtures();
    result.fixtures = {
      jpeg_bytes: FIX.jpeg.length, png_bytes: FIX.png.length, heic_bytes: FIX.heic.length,
      avif_bytes: FIX.avif ? FIX.avif.length : null, avif_disponible: Boolean(FIX.avif),
      pdf_bytes: FIX.pdf.length, mp4_bytes: FIX.mp4.length,
      oversize_bytes: FIX.oversize ? FIX.oversize.length : null,
      oversize_supera_tope: Boolean(FIX.oversize && FIX.oversize.length > WEB_EVIDENCE_MAX_BYTES),
      tope_evidencia_web_bytes: WEB_EVIDENCE_MAX_BYTES
    };
    check("fixture_oversize_real_por_encima_del_tope", Boolean(FIX.oversize), {
      oversize_bytes: FIX.oversize ? FIX.oversize.length : 0, tope: WEB_EVIDENCE_MAX_BYTES
    });

    const build = require(path.join(API, "server.js"));
    app = await build();
    await app.listen({ port: PORT, host: "127.0.0.1" });
    const watchdog = setInterval(() => {
      const last = result.checks[result.checks.length - 1];
      console.error(`[cert] watchdog ${result.checks.length} controles; ultimo=${last ? last.name : "ninguno"}`);
    }, 30000);
    watchdog.unref();

    const health = await capture("/health");
    result.api_commit = health.payload?.commit || "unknown";
    check("health_ok", health.status === 200 && health.payload?.status === "OK", { status: health.status, commit: result.api_commit });

    // ---- Fixtures de tenant/roles/usuarios ----
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, active: true, active_modules: true } });
    const withHr = tenants.filter((tenant) => tenant.active !== false && modulesOf(tenant).some((code) => HR_CODES.includes(code)));
    const tenant = withHr.find((item) => /puebla|operaciones/i.test(String(item.name || ""))) || withHr[0];
    check("fixture_tenant_con_hr", Boolean(tenant), { tenant: tenant ? { id: tenant.id, name: tenant.name } : null });
    cleanup.tenantId = tenant.id;
    result.stale_leftovers_purged = await purgeStaleLeftovers(tenant.id);

    const supervisorRole = await admin.createRole(tenant.id, {
      name: `${ROLE_PREFIXES[0]} ${RUN_ID}`,
      description: "Rol temporal de certificacion con hr:write para la correccion administrativa (se desactiva al final).",
      permissions: { talento_humano: { view: true, edit: true } }
    });
    const operarioRole = await admin.createRole(tenant.id, {
      name: `${ROLE_PREFIXES[1]} ${RUN_ID}`,
      description: "Rol temporal de certificacion con marcaciones read/write para el canal propio (se desactiva al final).",
      permissions: { marcaciones: { view: true, create: true } }
    });
    cleanup.roles.push({ tenantId: tenant.id, id: supervisorRole.id }, { tenantId: tenant.id, id: operarioRole.id });

    const userShape = (label, roleId, slug, { canPunch = false } = {}) => ({
      name: `QA MarcaResil ${label} ${RUN_ID}`,
      first_names: "QA",
      last_names: `${label} ${RUN_ID}`,
      email: `${EMAIL_PREFIX}${slug}.${RUN_ID}@apex.test`,
      password: PASSWORD,
      role_id: roleId,
      company: "QA",
      // El documento tiene que ser unico por usuario: dos fichas sembradas con el mismo documento
      // vuelven ambiguo el auto-vinculo usuario-empleado y createUser rechaza sin escribir.
      document: `QAMRS${RUN_ID.slice(-12)}${slug}`,
      // Employee tiene @@unique([tenant_id, code]) y createUser crea la ficha anidada: el code
      // lleva la corrida para que la certificacion sea repetible.
      code: `${CODE_PREFIX}${slug}-${RUN_ID.slice(-10)}`.slice(0, 24),
      department: "QA",
      position: "Operario de certificacion",
      operational_classification: "operativo",
      can_punch_time: canPunch,
      can_be_assigned_routes: false,
      require_password_change: false
    });
    const supervisor = await admin.createUser(tenant.id, userShape("Supervisor", supervisorRole.id, "sup"));
    const operario = await admin.createUser(tenant.id, userShape("Operario", operarioRole.id, "ope", { canPunch: true }));
    cleanup.users.push({ tenantId: tenant.id, id: supervisor.id }, { tenantId: tenant.id, id: operario.id });
    for (const user of [supervisor, operario]) if (user.employee_id) cleanup.employees.push({ tenantId: tenant.id, id: user.employee_id });
    const ficha = operario.employee_id;
    check("fixture_ficha_del_operario", Number.isInteger(ficha) && ficha > 0, { operario_id: operario.id, ficha });

    const tokenSup = await login(supervisor.metadata?.access?.email || `${EMAIL_PREFIX}sup.${RUN_ID}@apex.test`);
    const tokenOpe = await login(operario.metadata?.access?.email || `${EMAIL_PREFIX}ope.${RUN_ID}@apex.test`);
    // `punchSchema` exige `user_name` en el cuerpo (los dos canales). En el ambito propio el
    // servidor lo reescribe con el nombre de la ficha; declararlo aqui evita el 400 de esquema y
    // hace que la correccion del supervisor agrupe en la misma fila del reporte.
    const alias = String(operario.name || `${EMAIL_PREFIX}ope.${RUN_ID}`).trim();
    const selfPunch = (body) => capture("/api/v1/hr/self/time-punches", { token: tokenOpe, method: "POST", body: { user_name: alias, ...body } });
    const adminPunch = (body) => capture("/api/v1/hr/time-punches", { token: tokenSup, method: "POST", body: { user_name: alias, ...body } });

    // La columna `date` se guarda a medianoche de Bogota (05:00Z): se busca por rango del dia,
    // nunca por igualdad de una marca exacta, o la comprobacion daria falsa ausencia.
    const punchRow = (day, type) => {
      const from = new Date(`${day}T00:00:00${OPERATING_OFFSET}`);
      return prisma.runWithTenant(tenant.id, () => prisma.timePunch.findFirst({
        where: { tenant_id: tenant.id, employee_id: ficha, type, date: { gte: from, lt: new Date(from.getTime() + 86400000) } },
        orderBy: { punched_at: "desc" }
      }));
    };

    // =========================================================================
    // Criterio 2 - PNG etiquetado image/jpeg: se guarda, con el tipo olido y el
    // hash de lo recibido (antes: 400 y jornada perdida).
    // =========================================================================
    const dayPng = dayBack(2);
    const pngMark = await selfPunch({ type: "entrada", punched_at: instantAt(dayPng, "08:00"), identity_photo: photo(FIX.png, { type: "image/jpeg" }) });
    const pngEvidence = pngMark.payload?.punch?.metadata?.identity_photo || {};
    check("criterio2_png_etiquetado_jpeg_se_guarda_disponible", pngMark.status === 200 && pngMark.payload?.ok === true
      && pngEvidence.evidence_status === "available" && pngEvidence.type === "image/png"
      && pngEvidence.sha256 === sha256(FIX.png) && pngEvidence.original_sha256 === sha256(FIX.png), {
      status: pngMark.status, code: pngMark.payload?.code ?? null,
      evidence_status: pngEvidence.evidence_status ?? null, tipo: pngEvidence.type ?? null,
      hash_coincide_con_lo_recibido: pngEvidence.sha256 === sha256(FIX.png),
      hora: pngMark.payload?.hora ?? null
    });
    check("criterio2_marca_almacena_data_url_canonico_del_tipo_olido", typeof pngEvidence.base64_data === "string"
      && pngEvidence.base64_data.startsWith(`data:image/png;base64,`) && pngEvidence.has_base64_data === true, {
      prefijo: typeof pngEvidence.base64_data === "string" ? pngEvidence.base64_data.slice(0, 22) : null,
      has_base64_data: pngEvidence.has_base64_data ?? null
    });

    // =========================================================================
    // Criterio 3 - HEIC real: degrada la evidencia, nunca cuesta la hora.
    // =========================================================================
    const dayHeic = dayBack(3);
    const heicMark = await selfPunch({ type: "entrada", punched_at: instantAt(dayHeic, "08:00"), identity_photo: photo(FIX.heic, { type: "image/heic", name: "selfie.heic" }) });
    const heicMeta = heicMark.payload?.punch?.metadata || {};
    const heicEvidence = heicMeta.identity_photo || {};
    check("criterio3_heic_degrada_y_no_cuesta_la_jornada", heicMark.status === 200 && heicMark.payload?.ok === true
      && heicMeta.identity_verification?.status === "photo_only"
      && heicEvidence.evidence_status === "degraded"
      && typeof heicEvidence.evidence_failure_code === "string" && heicEvidence.evidence_failure_code.startsWith("EVIDENCIA_"), {
      status: heicMark.status, code: heicMark.payload?.code ?? null,
      identidad: heicMeta.identity_verification?.status ?? null,
      evidence_status: heicEvidence.evidence_status ?? null,
      evidence_failure_code: heicEvidence.evidence_failure_code ?? null
    });
    const heicRow = await punchRow(dayHeic, "entrada");
    check("criterio3_fila_degradada_de_la_web_no_arrastra_bytes", Boolean(heicRow) && heicRow.metadata?.identity_photo?.has_base64_data === false
      && heicRow.metadata?.identity_photo?.base64_data === undefined && heicRow.metadata?.identity_photo?.storage_path === null, {
      fila_guardada: Boolean(heicRow), has_base64_data: heicRow?.metadata?.identity_photo?.has_base64_data ?? null,
      storage_path: heicRow?.metadata?.identity_photo?.storage_path ?? null,
      sha256_conservado: Boolean(heicRow?.metadata?.identity_photo?.sha256)
    });

    // AVIF de camara: la clase puede o no decodificarse en este build de sharp. Lo que se
    // certifica es la propiedad de resiliencia (la marcacion vive y la fila declara su estado),
    // no el veredicto del decodificador local.
    if (FIX.avif) {
      const dayAvif = dayBack(4);
      const avifMark = await selfPunch({ type: "entrada", punched_at: instantAt(dayAvif, "08:00"), identity_photo: photo(FIX.avif, { type: "image/jpeg", name: "selfie.avif" }) });
      const avifEvidence = avifMark.payload?.punch?.metadata?.identity_photo || {};
      check("criterio3_avif_se_guarda_sin_costar_la_jornada", avifMark.status === 200 && avifMark.payload?.ok === true
        && ["available", "degraded"].includes(avifEvidence.evidence_status) && avifEvidence.sha256 === sha256(FIX.avif), {
        status: avifMark.status, evidence_status: avifEvidence.evidence_status ?? null,
        tipo: avifEvidence.type ?? null,
        evidence_failure_code: avifEvidence.evidence_failure_code ?? null,
        hash_coincide: avifEvidence.sha256 === sha256(FIX.avif)
      });
    } else {
      result.avif_skipped = "el sharp de este puesto no puede codificar AVIF: sin fixture real no se afirma el veredicto";
    }

    // =========================================================================
    // Criterio 4 - transporte base64 roto: se repara y se persiste lo canonico.
    // =========================================================================
    const b64 = FIX.png.toString("base64");
    const urlSafe = b64.replace(/\+/g, "-").replace(/\//g, "_");
    const sinPadding = b64.replace(/=+$/, "");
    const variantes = [
      { dia: dayBack(5), etiqueta: "doble_prefijo_y_saltos", base64: `data:image/png;base64,data:image/png;base64,${b64.match(/.{1,76}/g).join("\n")}`, esperado: ["double_prefix", "whitespace"] },
      { dia: dayBack(6), etiqueta: "alfabeto_url_safe", base64: urlSafe, esperado: ["urlsafe"] },
      { dia: dayBack(7), etiqueta: "padding_ausente", base64: sinPadding, esperado: ["padding"] }
    ];
    const normalizaciones = {};
    for (const variante of variantes) {
      const mark = await selfPunch({ type: "entrada", punched_at: instantAt(variante.dia, "08:00"), identity_photo: { base64: variante.base64, type: "image/jpeg", name: "selfie.jpg" } });
      const evidencia = mark.payload?.punch?.metadata?.identity_photo || {};
      const aplicadas = evidencia.normalization_applied || [];
      normalizaciones[variante.etiqueta] = { status: mark.status, evidence_status: evidencia.evidence_status ?? null, aplicadas, tipo: evidencia.type ?? null };
      check(`criterio4_${variante.etiqueta}_se_normaliza_y_la_marca_vive`, mark.status === 200 && mark.payload?.ok === true
        && evidencia.evidence_status === "available" && evidencia.sha256 === sha256(FIX.png)
        && variante.esperado.every((token) => aplicadas.includes(token))
        && typeof evidencia.base64_data === "string" && evidencia.base64_data.startsWith("data:image/png;base64,")
        && !evidencia.base64_data.slice("data:image/png;base64,".length).includes("\n"), {
        status: mark.status, code: mark.payload?.code ?? null, normalizacion_aplicada: aplicadas,
        hash_coincide: evidencia.sha256 === sha256(FIX.png), persistido_canonico: evidencia.type === "image/png"
      });
    }

    // Alfabeto invalido: rechazo con el motivo (no degradacion silenciosa).
    const diaAlfabeto = dayBack(8);
    const invalido = await selfPunch({ type: "entrada", punched_at: instantAt(diaAlfabeto, "08:00"), identity_photo: { base64: "!!!!no-es-base64****", type: "image/jpeg", name: "selfie.jpg" } });
    // El motivo viaja en las dos mitades del contrato: la maquina (`evidence_failure_code`,
    // lo unico que lee la pantalla) y la frase legible. Medido en produccion, el rojo real era
    // un 400 sin codigo ni detalle.
    check("criterio4_alfabeto_invalido_se_rechaza_con_el_motivo", invalido.status === 400
      && invalido.payload?.code === "VALIDACION"
      && invalido.payload?.details?.evidence_failure_code === "EVIDENCIA_ALFABETO_INVALIDO"
      && invalido.payload?.details?.field === "identity_photo"
      && String(invalido.payload?.error || "").trim().length > 10, {
      status: invalido.status, code: invalido.payload?.code ?? null,
      evidence_failure_code: invalido.payload?.details?.evidence_failure_code ?? null,
      field: invalido.payload?.details?.field ?? null,
      error: invalido.payload?.error ?? null
    });
    check("criterio4_alfabeto_invalido_no_escribe_marca", await punchRow(diaAlfabeto, "entrada") === null, { dia: diaAlfabeto });

    // =========================================================================
    // Criterio 5 - tope y clases duras: 400 con codigo y detalle; la jornada
    // despues se puede marcar limpia.
    // =========================================================================
    const grande = await selfPunch({ type: "entrada", punched_at: instantAt(dayBack(9), "08:00"), identity_photo: { base64: FIX.oversize.toString("base64"), type: "image/jpeg", name: "selfie.jpg", size: FIX.oversize.length } });
    check("criterio5_payload_sobre_el_tope_se_rechaza_nombrando_el_tope", grande.status === 400
      && grande.payload?.code === "VALIDACION"
      && grande.payload?.details?.evidence_failure_code === "EVIDENCIA_SUPERA_LIMITE"
      && Number(grande.payload?.details?.max_bytes) === WEB_EVIDENCE_MAX_BYTES
      && Number(grande.payload?.details?.byte_length) === FIX.oversize.length, {
      status: grande.status, code: grande.payload?.code ?? null,
      evidence_failure_code: grande.payload?.details?.evidence_failure_code ?? null,
      byte_length: grande.payload?.details?.byte_length ?? null, max_bytes: grande.payload?.details?.max_bytes ?? null,
      bytes_reales: FIX.oversize.length
    });

    for (const [etiqueta, buffer, mime, dia] of [["pdf", FIX.pdf, "application/pdf", dayBack(10)], ["mp4", FIX.mp4, "video/mp4", dayBack(11)]]
    ) {
      const hostil = await selfPunch({ type: "entrada", punched_at: instantAt(dia, "08:00"), identity_photo: photo(buffer, { type: "image/jpeg", name: `selfie.${etiqueta}` }) });
      check(`criterio5_${etiqueta}_como_selfie_se_rechaza_por_clase`, hostil.status === 400
        && hostil.payload?.code === "VALIDACION"
        && hostil.payload?.details?.evidence_failure_code === "EVIDENCIA_CLASE_RECHAZADA"
        && Boolean(hostil.payload?.details?.sniffed_mime), {
        status: hostil.status, code: hostil.payload?.code ?? null,
        evidence_failure_code: hostil.payload?.details?.evidence_failure_code ?? null,
        mime_olido: hostil.payload?.details?.sniffed_mime ?? null, mime_declarado: mime
      });
      // El rechazo no puede bloquear la jornada: el mismo dia, con foto valida, marca.
      const limpia = await selfPunch({ type: "entrada", punched_at: instantAt(dia, "08:05"), identity_photo: photo(FIX.jpeg) });
      check(`criterio5_${etiqueta}_rechazada_la_jornada_puede_marcarse`, limpia.status === 200 && limpia.payload?.ok === true
        && (await punchRow(dia, "entrada")) !== null, { status: limpia.status, code: limpia.payload?.code ?? null, dia });
    }

    // =========================================================================
    // Criterio 10 - via de desbloqueo administrativo (fuera de la escalera).
    // =========================================================================
    const diaCorreccion = dayBack(12);
    const apertura = await selfPunch({ type: "entrada", punched_at: instantAt(diaCorreccion, "06:00"), identity_photo: photo(FIX.jpeg) });
    check("criterio10_jornada_abierta_por_el_operario", apertura.status === 200 && apertura.payload?.ok === true, { status: apertura.status, code: apertura.payload?.code ?? null });

    const enSilencio = await adminPunch({ employee_id: ficha, type: "salida", punched_at: instantAt(diaCorreccion, "17:00") });
    check("criterio10_el_hueco_no_se_rellena_en_silencio", enSilencio.status === 409 && enSilencio.payload?.code === "MARCACION_FUERA_DE_SECUENCIA", {
      status: enSilencio.status, code: enSilencio.payload?.code ?? null, error: enSilencio.payload?.error ?? null
    });

    const sinMotivo = await adminPunch({ employee_id: ficha, type: "salida", punched_at: instantAt(diaCorreccion, "17:00"), correccion_administrativa: true, motivo_correccion: "   " });
    check("criterio10_sin_motivo_legible_se_rechaza_422", sinMotivo.status === 422 && sinMotivo.payload?.code === "MOTIVO_CORRECCION_REQUERIDO"
      && sinMotivo.payload?.details?.field === "motivo_correccion" && (await punchRow(diaCorreccion, "salida")) === null, {
      status: sinMotivo.status, code: sinMotivo.payload?.code ?? null, field: sinMotivo.payload?.details?.field ?? null
    });

    const MOTIVO = "El operario marco 06:00 y el cierre nunca llego: rechazo acumulado de la app sin senal. Se registra la hora del horario asignado.";
    const cierra = await adminPunch({ employee_id: ficha, type: "salida", punched_at: instantAt(diaCorreccion, "17:00"), correccion_administrativa: true, motivo_correccion: MOTIVO });
    const selloCierre = cierra.payload?.punch?.metadata?.correccion_administrativa || {};
    check("criterio10_la_correccion_fuera_de_escalera_se_guarda_sellada", cierra.status === 200 && cierra.payload?.ok === true
      && selloCierre.salto === "esperada:inicio_almuerzo" && selloCierre.motivo === MOTIVO
      && selloCierre.por === supervisor.id && Boolean(selloCierre.en), {
      status: cierra.status, code: cierra.payload?.code ?? null, salto: selloCierre.salto ?? null,
      autor: selloCierre.por ?? null, supervisor_esperado: supervisor.id,
      motivo_coincide: selloCierre.motivo === MOTIVO, motivo_caracteres: (selloCierre.motivo || "").length
    });

    const huecoAlmuerzo = await adminPunch({ employee_id: ficha, type: "inicio_almuerzo", punched_at: instantAt(diaCorreccion, "12:00"), correccion_administrativa: true, motivo_correccion: "Falto el almuerzo: la escalera ya estaba cerrada por salida corregida." });
    const selloAlmuerzo = huecoAlmuerzo.payload?.punch?.metadata?.correccion_administrativa || {};
    check("criterio10_jornada_cerrada_tambien_admite_el_hueco", huecoAlmuerzo.status === 200 && huecoAlmuerzo.payload?.ok === true
      && selloAlmuerzo.salto === "jornada_completa", {
      status: huecoAlmuerzo.status, code: huecoAlmuerzo.payload?.code ?? null, salto: selloAlmuerzo.salto ?? null
    });

    const novedad = await prisma.runWithTenant(tenant.id, async () => prisma.$queryRaw`
      SELECT metadata::text AS metadata FROM th_novedades_jornada
      WHERE tenant_id = ${tenant.id} AND employee_id = ${ficha} AND type_code = ${MANUAL_ADJUSTMENT_NOVELTY_CODE}
        AND date = ${diaCorreccion}::date ORDER BY id DESC LIMIT 1`);
    const novedadMeta = novedad?.[0]?.metadata ? JSON.parse(novedad[0].metadata) : {};
    check("criterio10_genera_la_novedad_del_mismo_dia_con_su_autor", Boolean(novedad?.[0])
      && novedadMeta.source === "correccion_administrativa" && novedadMeta.reason === selloAlmuerzo.motivo
      && /^escalera:/.test(String(novedadMeta.detail || "")) && novedadMeta.corrected_by === supervisor.id, {
      novedad_existe: Boolean(novedad?.[0]), source: novedadMeta.source ?? null,
      detail: novedadMeta.detail ?? null, corrected_by: novedadMeta.corrected_by ?? null, supervisor_esperado: supervisor.id
    });

    // El supervisor tiene que ver la correccion en el reporte que consulta (mitad servidor del 10b).
    const reporte = await capture(`/api/v1/hr/attendance?fecha_inicio=${diaCorreccion}&fecha_fin=${diaCorreccion}&date=${diaCorreccion}`, { token: tokenSup });
    const grupos = Array.isArray(reporte.payload) ? reporte.payload : (reporte.payload?.data || reporte.payload?.rows || []);
    const selladas = grupos.flatMap((grupo) => (grupo?.punches || [])).filter((punch) => punch?.metadata?.correccion_administrativa);
    check("criterio10b_el_reporte_del_supervisor_muestra_la_correccion", reporte.status === 200 && selladas.length === 2
      && selladas.every((punch) => Boolean(punch.metadata.correccion_administrativa.motivo) && punch.metadata.correccion_administrativa.por === supervisor.id), {
      status: reporte.status, filas_corregidas: selladas.length,
      saltos: selladas.map((punch) => punch.metadata.correccion_administrativa.salto)
    });

    // =========================================================================
    // Criterio 10 (contencion) - el canal propio no se autoriza solo.
    // =========================================================================
    const diaPropio = dayBack(13);
    const aperturaPropia = await selfPunch({ type: "entrada", punched_at: instantAt(diaPropio, "06:00"), identity_photo: photo(FIX.jpeg) });
    const bypass = await selfPunch({
      type: "salida", punched_at: instantAt(diaPropio, "17:00"), identity_photo: photo(FIX.jpeg),
      correccion_administrativa: true, motivo_correccion: "Intento de autocorreccion desde el canal propio."
    });
    check("criterio10_el_canal_propio_no_se_autoriza_solo", aperturaPropia.status === 200 && bypass.status === 409
      && bypass.payload?.code === "MARCACION_FUERA_DE_SECUENCIA" && (await punchRow(diaPropio, "salida")) === null, {
      apertura: aperturaPropia.status, status: bypass.status, code: bypass.payload?.code ?? null,
      cierre_registrado: (await punchRow(diaPropio, "salida")) !== null
    });

    // El tope del motivo esta en dos capas: el esquema (300) y el servicio (recorte). Se certifica
    // que un motivo de 300 entra integro y que 301 se rechazan en el transporte: el cliente del
    // supervisor recorta antes de enviar, asi que ningun usuario ve ese 400.
    const motivoExacto = "m".repeat(300);
    const motivoLargo = "x".repeat(301);
    const recorte = await adminPunch({ employee_id: ficha, type: "fin_almuerzo", punched_at: instantAt(diaPropio, "13:00"), correccion_administrativa: true, motivo_correccion: motivoLargo });
    check("criterio10_motivo_de_mas_de_300_se_rechaza_en_el_esquema", recorte.status === 400 && recorte.payload?.code === "FST_ERR_VALIDATION", {
      status: recorte.status, code: recorte.payload?.code ?? null
    });
    const motivoPleno = await adminPunch({ employee_id: ficha, type: "fin_almuerzo", punched_at: instantAt(diaPropio, "13:00"), correccion_administrativa: true, motivo_correccion: motivoExacto });
    const selloRecorte = motivoPleno.payload?.punch?.metadata?.correccion_administrativa || {};
    check("criterio10_el_motivo_de_300_se_guarda_integro", motivoPleno.status === 200 && selloRecorte.motivo?.length === 300
      && selloRecorte.salto === "esperada:inicio_almuerzo", {
      status: motivoPleno.status, code: motivoPleno.payload?.code ?? null,
      longitud_motivo: selloRecorte.motivo?.length ?? null, salto: selloRecorte.salto ?? null
    });

    // =========================================================================
    // Criterio 9 - todo rechazo del flujo es clasificable y legible (sin "sin codigo").
    // =========================================================================
    const rechazos = requestLog.filter((item) => item.status >= 400);
    const ilegibles = [];
    for (const item of rechazos) {
      if (!item.code || /sin codigo|undefined|null/i.test(String(item.code))) ilegibles.push({ path: item.path, status: item.status, code: item.code });
    }
    check("criterio9_todo_rechazo_trae_codigo_clasificable", rechazos.length >= 6 && ilegibles.length === 0, {
      rechazos: rechazos.length, codigos: Array.from(new Set(rechazos.map((item) => item.code))), ilegibles
    });
    result.rechazos_certificados = rechazos.map((item) => ({ path: item.path, status: item.status, code: item.code }));

    // =========================================================================
    // Suites unitarios versionados (criterio 1) y triage (criterio 11).
    // =========================================================================
    const suites = {
      "apps/api/test/hr-mobile-identity.test.js": { cwd: API, argv: ["--test", "test/hr-mobile-identity.test.js"], minimo: 30 },
      "apps/api/test/hr-evidence-resilience.test.js": { cwd: API, argv: ["--test", "test/hr-evidence-resilience.test.js"], minimo: 18 },
      "apps/api/test/hr-marking-declared-employee.test.js": { cwd: API, argv: ["--test", "test/hr-marking-declared-employee.test.js"], minimo: 6 },
      "apps/web/test/hr-marking-correction.test.mjs": { cwd: WEB, argv: ["--test", "test/hr-marking-correction.test.mjs"], minimo: 10 }
    };
    result.versioned_suites = {};
    for (const [nombre, suite] of Object.entries(suites)) {
      const run = spawnSync(process.execPath, suite.argv, { cwd: suite.cwd, encoding: "utf8", env: { ...process.env, DISABLE_REDIS: "true" } });
      const out = `${run.stdout || ""}${run.stderr || ""}`;
      const pass = Number((out.match(/(?:#|ℹ)\s+pass\s+(\d+)/) || [])[1] || 0);
      const fail = Number((out.match(/(?:#|ℹ)\s+fail\s+(\d+)/) || [])[1] || 0);
      result.versioned_suites[nombre] = { exit: run.status, pass, fail };
      check(`suite_${path.basename(nombre)}_en_verde`, run.status === 0 && fail === 0 && pass >= suite.minimo, { exit: run.status, pass, fail });
    }

    const triage = spawnSync(process.execPath, [path.join(ROOT, "scripts", "certifications", "hr-marking-blocked-workers.js"), "--selftest"], {
      cwd: ROOT, encoding: "utf8", env: { ...process.env }
    });
    const triageOut = `${triage.stdout || ""}${triage.stderr || ""}`;
    check("criterio11_triage_de_bloqueados_selftest_pasado", triage.status === 0 && /SELFTEST PASADO/.test(triageOut), {
      exit: triage.status, salida: triageOut.trim().split("\n").slice(-2).join(" | ")
    });

    const serverErrors = requestLog.filter((item) => !item.status || item.status >= 500 || item.transport_error);
    check("no_5xx_during_certification", serverErrors.length === 0, { requests: requestLog.length, errores: serverErrors.slice(0, 10) });
    result.http_log = requestLog;

    result.status = "passed";
    result.verdict = { passed: result.checks.filter((item) => item.ok).length, total: result.checks.length };
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, stack: error.stack, checks: result.checks.map((item) => ({ name: item.name, ok: item.ok })) };
    result.http_log = requestLog;
    throw error;
  } finally {
    const purgeSummary = { employees: 0, punches: 0, sessions: 0, workdays: 0, novelties: 0, errors: [] };
    const employeeIds = cleanup.employees.map((item) => item.id);
    if (cleanup.tenantId && employeeIds.length) {
      try {
        const summary = await purgeEmployeeFixture(cleanup.tenantId, employeeIds);
        purgeSummary.employees = summary.employees; purgeSummary.punches = summary.punches;
        purgeSummary.sessions = summary.sessions; purgeSummary.workdays = summary.workdays;
        purgeSummary.novelties = summary.novelties; purgeSummary.errors.push(...summary.errors);
      } catch (error) { purgeSummary.errors.push(error.message); }
    }
    const cleanupErrors = [...purgeSummary.errors];
    for (const user of cleanup.users) {
      try { await admin.setUserActive(user.tenantId, user.id, false); } catch (error) { cleanupErrors.push(`user ${user.id}: ${error.message}`); }
    }
    for (const role of cleanup.roles) {
      try { await admin.setRoleActive(role.tenantId, role.id, false); } catch (error) { cleanupErrors.push(`role ${role.id}: ${error.message}`); }
    }
    result.cleanup = {
      empleados_eliminados: purgeSummary.employees, marcaciones_eliminadas: purgeSummary.punches,
      sesiones_eliminadas: purgeSummary.sessions, jornadas_eliminadas: purgeSummary.workdays,
      novedades_eliminadas: purgeSummary.novelties, usuarios_desactivados: cleanup.users.length,
      roles_desactivados: cleanup.roles.length, errores: cleanupErrors
    };
    result.finished_at = new Date().toISOString();
    try {
      fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
      fs.writeFileSync(OUTPUT, `${JSON.stringify(redact(result), (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2)}\n`);
    } finally {
      if (app) await app.close().catch(() => undefined);
    }
  }
}

main()
  .then(() => console.log(`CERTIFICACION MARCACION RESILIENTE Y CORRECCION ADMINISTRATIVA APROBADA: ${result.checks.length} controles, status=${result.status}`))
  .catch((error) => { console.error(`CERTIFICACION BLOQUEADA: ${error.message}`); process.exitCode = 1; })
  .finally(() => {
    prisma.$disconnect();
    // La API embebida deja cron del fabric (apexControlPulse) con temporizadores vivos: sin esta
    // salida explicita el proceso nunca termina y la evidencia ya esta escrita.
    setTimeout(() => process.exit(process.exitCode || 0), 500);
  });
