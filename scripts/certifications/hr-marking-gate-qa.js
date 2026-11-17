// Certificacion QA del corte "marcacion sin horario y mapa sin selfies".
// Mide contra el build desplegado las dos promesas del brief:
//  1) un dia sin horario asignado responde 200 con lista vacia, que es lo que le
//     permite a la pantalla decir "sin horario asignado" en vez de mostrar errores, y
//  2) la lectura diaria del monitor no arrastra el base64 de las selfies y se mantiene
//     bajo el presupuesto de dos segundos sobre la jornada real de la empresa modelo.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return result;
}

const args = argsFrom(process.argv.slice(2));
require("../load-env")(path.resolve(String(args["env-file"] || "config/qa.env")));

const prisma = require("../../apps/api/src/core/prisma");
const admin = require("../../apps/api/src/modules/admin/service");

const API_URL = String(args["api-url"] || "https://apexos-api-qa-production.up.railway.app").replace(/\/$/, "");
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-marking-gate-qa-20261117/certification.json"));
const EXPECTED_COMMIT = String(args["expected-commit"] || "");
const BUDGET_MS = Number(args["budget-ms"] || 2000);
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const PASSWORD = `Qa-Gate-${crypto.randomBytes(6).toString("hex")}#26`;
const FREE_EMAIL = `qa.gate.free.${RUN_ID}@nyvora.test`;
const FIXED_EMAIL = `qa.gate.fixed.${RUN_ID}@nyvora.test`;
const MONITOR_EMAIL = `qa.gate.monitor.${RUN_ID}@nyvora.test`;
const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
// PNG real de ruido: zlib no comprime bytes aleatorios, asi que el archivo pesa lo que
// pesa la foto de una camara. Con un stub de 68 bytes la comparacion de tamano seria
// decorativa; con una selfie material se ve si el mapa de verdad deja de arrastrarla.
function crc32(buffer) {
  if (!crc32.table) {
    crc32.table = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32.table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}
function pngSelfie(lado) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const paso = lado * 3 + 1;
  const raw = Buffer.alloc(paso * lado);
  const pixeles = crypto.randomBytes(lado * lado * 3);
  for (let fila = 0; fila < lado; fila += 1) pixeles.copy(raw, fila * paso + 1, fila * lado * 3, (fila + 1) * lado * 3);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 0 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return { base64: png.toString("base64"), bytes: png.length };
}
const SELFIE_FILE = pngSelfie(320);
const EVIDENCIA_FILE = pngSelfie(320);
const SELFIE = { base64: SELFIE_FILE.base64, name: `identity-${RUN_ID}.png`, type: "image/png", size: SELFIE_FILE.bytes };
const EVIDENCIA = { base64: EVIDENCIA_FILE.base64, name: `evidencia-${RUN_ID}.png`, type: "image/png", size: EVIDENCIA_FILE.bytes };
const FOTO_BYTES = SELFIE_FILE.bytes + EVIDENCIA_FILE.bytes;

// La jornada del fixture arranca en el minuto de la corrida: lateMinutes se mide como
// punch - start_time - tolerance, y una corrida a cualquier hora del dia no es una
// llegada tarde.
const minuteOfDayBogota = (date) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(date);
  return Number(parts.find((part) => part.type === "hour")?.value || 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value || 0);
};
const toHhmm = (minute) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const NOW_MINUTE = minuteOfDayBogota(new Date());
const ROUTE_START = toHhmm(NOW_MINUTE);
const ROUTE_END = toHhmm(Math.min(23 * 60 + 58, NOW_MINUTE + 55));

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function check(result, name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`Fallo de certificacion: ${name}`);
}

async function request(pathname, { token = "", method = "GET", body, expected = 200 } = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const elapsed = Date.now() - startedAt;
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (response.status !== expected) {
    const error = new Error(`${method} ${pathname}: esperado ${expected}, obtenido ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return { payload, elapsed, bytes: Buffer.byteLength(text, "utf8"), text };
}

async function login(email) {
  const { payload } = await request("/api/v1/auth/login", { method: "POST", body: { email, password: PASSWORD } });
  if (!payload.token) throw new Error(`El login de ${email} no devolvio token.`);
  return payload.token;
}

function assertQaTarget() {
  if (![process.env.APP_ENV, process.env.TARGET_ENV].some((value) => normalize(value) === "qa")) {
    throw new Error("La certificacion solo puede ejecutarse con configuracion QA.");
  }
  const expectedRef = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
  const url = String(process.env.DATABASE_URL || "");
  if (!expectedRef) throw new Error("EXPECTED_SUPABASE_PROJECT_REF es obligatorio: esta certificacion escribe en la empresa modelo.");
  if (!url.includes(expectedRef)) throw new Error(`DATABASE_URL no pertenece al project ref esperado (${expectedRef}); se aborta sin conectar.`);
}

async function nyvoraTenant() {
  const direct = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" } } });
  if (direct) return direct;
  const companies = await prisma.$queryRawUnsafe("select id,name,legal_name from public.companies order by name").catch(() => []);
  const company = companies.find((item) => normalize(item.name).includes("nyvora") || normalize(item.legal_name).includes("nyvora"));
  if (!company) throw new Error("No existe la empresa modelo Nyvora en QA.");
  const tenant = await prisma.tenant.findFirst({ where: { config: { path: ["company_id"], equals: String(company.id) } } });
  if (!tenant) throw new Error("No existe tenant operativo Nyvora en QA.");
  return tenant;
}

// Bytes de evidencia almacenados hoy: es lo que la lectura antigua arrastraba dentro
// del propio mapa (la foto viaja en metadata de la marcacion y en base64_data de la
// actividad). Se compara contra el tamano real de la respuesta del monitor.
async function evidenceBytesStored(tenantId) {
  const punches = await prisma.$queryRawUnsafe(
    `select coalesce(sum(octet_length(metadata::text)), 0)::bigint as bytes
       from public."TimePunch" where tenant_id = $1 and date(punched_at) = $2::date`,
    tenantId, TODAY
  ).catch(() => [{ bytes: 0 }]);
  const activities = await prisma.$queryRawUnsafe(
    `select coalesce(sum(octet_length(e.base64_data)), 0)::bigint as bytes
       from public."ActivityEvidence" e
       join public."WorkActivity" a on a.id = e.activity_id
      where e.tenant_id = $1 and date(a.created_at) = $2::date`,
    tenantId, TODAY
  ).catch(() => [{ bytes: 0 }]);
  const punch = Number(punches?.[0]?.bytes || 0);
  const activity = Number(activities?.[0]?.bytes || 0);
  return { punch, activity, total: punch + activity };
}

async function main() {
  assertQaTarget();
  const health = await request("/health");
  const tenant = await nyvoraTenant();
  const roles = await admin.listRoles(tenant.id, {}, "APEX_ADMIN");
  const markingRole = roles.find((item) => item.name === "Empleado marcaciones");
  const monitorRole = roles.find((item) => item.name === "Administrador de empresa") || roles.find((item) => item.name === "APEX_ADMIN");
  if (!markingRole || !monitorRole) throw new Error("No existen los roles requeridos para certificar el gate.");

  const result = {
    change_id: "hr-marking-gate-20261117",
    environment: "QA",
    company: "NYVORA",
    generated_at: new Date().toISOString(),
    api_url: API_URL,
    api_commit: health.payload.commit || "unknown",
    presupuesto_ms: BUDGET_MS,
    date: TODAY,
    checks: [],
    fixture: {},
    medicion: {},
    status: "running"
  };
  let freeUser;
  let fixedUser;
  let monitorUser;
  let route;

  try {
    check(result, "build_de_qa_responde", health.payload.status === "OK", { status: health.payload.status, commit: health.payload.commit });
    if (EXPECTED_COMMIT) {
      check(result, "build_desplegado_es_el_candidato", String(health.payload.commit || "").startsWith(EXPECTED_COMMIT), {
        desplegado: health.payload.commit, esperado: EXPECTED_COMMIT
      });
    }

    const fixture = (suffix) => ({
      name: `Gate ${suffix}`, first_names: "Gate", last_names: suffix, password: PASSWORD,
      company: "Nyvora", department: "QA", position: "Empleado de pruebas",
      operational_classification: "operario", require_password_change: false
    });
    // Sin horario: ficha creada y ninguna jornada del dia.
    freeUser = await admin.createUser(tenant.id, { ...fixture("free"), email: FREE_EMAIL, role_id: markingRole.id, document: `QGF${RUN_ID}`, code: `QA-GATE-F-${RUN_ID}`, can_punch_time: true, can_be_assigned_routes: true });
    // Con horario: la misma pantalla con una jornada activa asignada.
    fixedUser = await admin.createUser(tenant.id, { ...fixture("fixed"), email: FIXED_EMAIL, role_id: markingRole.id, document: `QGG${RUN_ID}`, code: `QA-GATE-X-${RUN_ID}`, can_punch_time: true, can_be_assigned_routes: true });
    // Supervisor del monitor.
    monitorUser = await admin.createUser(tenant.id, { ...fixture("monitor"), email: MONITOR_EMAIL, role_id: monitorRole.id, document: `QGM${RUN_ID}`, code: `QA-GATE-M-${RUN_ID}`, operational_classification: "administrativo", can_punch_time: false, can_be_assigned_routes: false });
    route = await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.create({
      data: {
        tenant_id: tenant.id, date: new Date(`${TODAY}T05:00:00.000Z`), vehicle_plate: "", employees: [FIXED_EMAIL],
        start_time: ROUTE_START, end_time: ROUTE_END, tolerance_minutes: 15, per_diem: 0,
        notes: "Certificacion gate sin horario y presupuesto del monitor", status: "active"
      }
    }));
    result.fixture = { free_user_id: freeUser.id, fixed_user_id: fixedUser.id, monitor_user_id: monitorUser.id, route_id: route.id, ventana: `${ROUTE_START}-${ROUTE_END}` };

    const freeToken = await login(FREE_EMAIL);
    const fixedToken = await login(FIXED_EMAIL);
    const monitorToken = await login(MONITOR_EMAIL);

    // 1) El dia sin horario es un estado, no un error.
    const freeRoutes = await request("/api/v1/hr/self/routes", { token: freeToken });
    check(result, "sin_horario_es_200_con_lista_vacia", Array.isArray(freeRoutes.payload) && freeRoutes.payload.length === 0, {
      status: freeRoutes.payload
    });
    const freeSelf = await request("/api/v1/hr/self", { token: freeToken });
    check(result, "la_ficha_del_empleado_se_lee_ok", Boolean(freeSelf.payload?.id || freeSelf.payload?.employee), { claves: Object.keys(freeSelf.payload || {}).slice(0, 6) });
    // El mismo endpoint, con jornada: un verde que no puede fallar no protege nada.
    const fixedRoutes = await request("/api/v1/hr/self/routes", { token: fixedToken });
    check(result, "con_horario_el_mismo_endpoint_devuelve_la_jornada",
      Array.isArray(fixedRoutes.payload) && fixedRoutes.payload.some((item) => Number(item.id) === Number(route.id)), {
        rutas: (fixedRoutes.payload || []).length, route_id: route.id
      });

    // 2) El monitor no arrastra la evidencia: se marca con foto y se lee el mapa.
    await request("/api/v1/hr/self/time-punches", {
      token: fixedToken, method: "POST",
      body: { employee_id: fixedUser.employee_id, user_name: FIXED_EMAIL, type: "entrada", route_id: route.id, punched_at: new Date().toISOString(), identity_photo: SELFIE }
    });
    // La secuencia del dia es entrada -> inicio_almuerzo -> fin_almuerzo -> salida;
    // saltarse un paso se responde 409 MARCACION_FUERA_DE_SECUENCIA.
    for (const tipo of ["inicio_almuerzo", "fin_almuerzo"]) {
      await request("/api/v1/hr/self/time-punches", {
        token: fixedToken, method: "POST",
        body: { employee_id: fixedUser.employee_id, user_name: FIXED_EMAIL, type: tipo, route_id: route.id, punched_at: new Date().toISOString() }
      });
    }
    const salida = await request("/api/v1/hr/self/time-punches", {
      token: fixedToken, method: "POST",
      body: {
        employee_id: fixedUser.employee_id, user_name: FIXED_EMAIL, type: "salida", route_id: route.id,
        punched_at: new Date().toISOString(), identity_photo: SELFIE,
        extra_reason: "certificacion_qa", extra_detail: "Evidencia controlada para medir el mapa", extra_evidence: EVIDENCIA
      }
    });
    const punchId = Number(salida.payload?.punch?.id || 0);

    const map = await request(`/api/v1/hr/operations-map?date=${TODAY}&minutes=30&footprint_days=30`, { token: monitorToken });
    const stored = await evidenceBytesStored(tenant.id);
    result.medicion = {
      operaciones_ms: map.elapsed,
      operaciones_bytes: map.bytes,
      fotos_del_fixture_bytes: FOTO_BYTES,
      bytes_evidencia_almacenados_hoy: stored,
      rutas_en_el_mapa: (map.payload?.routes || []).length
    };
    // "has_base64_data" es el nombre del boton que pinta la miniatura: lo que no
    // puede aparecer en el cuerpo es el valor, es decir la foto en si.
    const llevaFoto = /"base64_data"\s*:\s*"/.test(map.text) || map.text.includes("data:image");
    check(result, "mapa_no_lleva_ninguna_foto_en_el_cuerpo", !llevaFoto, {
      valor_base64_detectado: /"base64_data"\s*:\s*"/.test(map.text), incluye_data_image: map.text.includes("data:image")
    });
    check(result, "mapa_bajo_el_presupuesto_de_dos_segundos", map.elapsed < BUDGET_MS, { ms: map.elapsed, presupuesto_ms: BUDGET_MS });
    check(result, "mapa_pesa_menos_que_la_evidencia_del_dia", stored.total > 0 && map.bytes < stored.total, {
      mapa_bytes: map.bytes, evidencia_bytes: stored.total
    });

    const monitoredRoute = (map.payload?.routes || []).find((item) => Number(item.id) === Number(route.id));
    const punchPoint = (monitoredRoute?.punch_points || []).find((item) => Number(item.id) === punchId);
    const summary = punchPoint?.extra_evidence;
    check(result, "la_evidencia_llega_como_resumen_disponible", Boolean(summary?.available && summary?.id), { summary });
    const loaded = await request(`/api/v1/hr/monitor-evidence/punch/${summary.id}`, { token: monitorToken });
    check(result, "la_foto_aparece_solo_al_pedirla", String(loaded.payload?.base64_data || "").startsWith("data:image/png;base64,"), {
      source: loaded.payload?.source, bytes: loaded.bytes
    });

    const denied = await request(`/api/v1/hr/operations-map?date=${TODAY}`, { token: fixedToken, expected: 403 });
    check(result, "el_marcador_no_lee_el_monitor", denied.payload?.code === "PERMISO_DENEGADO", { code: denied.payload?.code });
    const anonymous = await request(`/api/v1/hr/operations-map?date=${TODAY}`, { expected: 401 });
    check(result, "el_mapa_exige_sesion", Boolean(anonymous.payload?.code), { code: anonymous.payload?.code });

    result.status = "passed";
  } catch (error) {
    result.status = "failed";
    result.error = { message: error.message, payload: error.payload || null };
    throw error;
  } finally {
    if (freeUser?.id) await admin.setUserActive(tenant.id, freeUser.id, false).catch(() => undefined);
    if (fixedUser?.id) await admin.setUserActive(tenant.id, fixedUser.id, false).catch(() => undefined);
    if (monitorUser?.id) await admin.setUserActive(tenant.id, monitorUser.id, false).catch(() => undefined);
    if (route?.id) await prisma.runWithTenant(tenant.id, () => prisma.timeRoute.updateMany({ where: { id: route.id }, data: { status: "inactive" } })).catch(() => undefined);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(`CERTIFICACION GATE DE MARCACION EN QA APROBADA: ${result.checks.length} controles, mapa ${result.medicion.operaciones_ms} ms / ${result.medicion.operaciones_bytes} bytes`);
}

main().catch((error) => {
  console.error(`CERTIFICACION GATE DE MARCACION EN QA FALLIDA: ${error.message}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
