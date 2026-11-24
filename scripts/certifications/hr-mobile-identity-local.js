// Certificacion LOCAL de la identidad en las marcaciones de la app movil.
//
// Flujo de punta a punta contra la API real (server.js) y un Postgres LOCAL
// con el esquema de Prisma:
//   1. El tecnico registra su telefono: llave EC P-256 firmada tras la huella.
//   2. Marca desde ese telefono con selfie y firma: queda verificada y la
//      selfie se guarda como data URL en la marcacion.
//   3. Se rechaza: sin registro, desde otro telefono, con otra llave, con la
//      selfie alterada, sin selfie, con una version vieja de la app y un
//      segundo registro sin restablecer.
//   4. La web sigue marcando, como no verificada.
//   4bis. La ventana de actualizacion del canal web: las CUATRO marcaciones piden
//      selfie y ninguna se pierde por el formato de la foto. Se reproduce el rechazo
//      de produccion (foto real del telefono con la etiqueta que anuncio el navegador)
//      y se exige que entre; se exige que lo que no es imagen siga rechazandose sin
//      etiqueta SELFIE_INVALIDA; y se manda el reenvio sin foto que hace el navegador
//      (desprendimiento declarado) para probar que la hora sobrevive.
//   5. El supervisor ve la selfie por el monitor; el listado no la trae.
//   6. Solo un administrador restablece, y nadie se restablece a si mismo;
//      tras restablecer el tecnico se registra de nuevo y la llave vieja ya
//      no sirve.
//
// El telefono se simula con una llave generada por Node en el mismo formato
// que entrega Android Keystore (SPKI DER y firma SHA256withECDSA en DER).
// Supabase se sustituye por un servidor HTTP local con las rutas que consulta
// supabaseAuth.js. Aborta si DATABASE_URL no es localhost/127.0.0.1.
//
// Uso:
//   DATABASE_URL=postgresql://apex:<clave>@127.0.0.1:55441/apexos \
//     node scripts/certifications/hr-mobile-identity-local.js --output <json>
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

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
const ROOT = path.resolve(__dirname, "../..");
const DATABASE_URL = String(args["database-url"] || process.env.DATABASE_URL || "").trim();
if (!/^postgres(?:ql)?:\/\/[^@\s]+@(localhost|127\.0\.0\.1)(:\d+)?\//.test(DATABASE_URL)) {
  console.error("BLOQUEADO: la certificacion solo corre contra una base LOCAL (localhost/127.0.0.1).");
  process.exit(2);
}
const OUTPUT = path.resolve(String(args.output || "docs/qa/evidence/hr-mobile-identity-20261104/local-certification.json"));
const API_PORT = Number(args["api-port"] || 3198);
const API = `http://127.0.0.1:${API_PORT}/api/v1`;
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const COMPANY_ID = crypto.randomUUID();
const COMPANY_NAME = `CERT BIOMETRIA ${RUN_ID}`;
const identity = require(path.join(ROOT, "apps/api/src/modules/hr/mobile-identity"));

function persona(key, { membership = "member", roleName = "Tecnico" } = {}) {
  const id = crypto.randomUUID();
  const email = `cert.${key}.${RUN_ID}@apexos.local`;
  return {
    key,
    id,
    email,
    token: `cert-${key}-${RUN_ID}-${crypto.randomBytes(6).toString("hex")}`,
    membership,
    employee: { id: crypto.randomUUID(), user_id: id, email, metadata: { role_id: `role_${key}`, role_name: roleName } }
  };
}

const tecnico = persona("tecnico");
const otro = persona("otro");
const admin = persona("admin", { membership: "admin", roleName: "Administrador de empresa" });
const people = [tecnico, otro, admin];
const byToken = new Map(people.map((p) => [p.token, p]));
const byId = new Map(people.map((p) => [p.id, p]));

function deviceKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    sign: (message) => crypto.sign("sha256", Buffer.from(message, "utf8"), { key: privateKey, dsaEncoding: "der" }).toString("base64")
  };
}

// Cabecera JPEG real: la API valida la firma del archivo.
function selfieBytes(seed) {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.createHash("sha256").update(seed).digest(), Buffer.alloc(2000, 9)]);
}

const sharp = require("sharp");

// Fotos verdaderas, y ademas las cuatro marcaciones de la web. Lo que tumbo la
// produccion no fueron fotos falsas: fueron fotos reales cuya etiqueta no coincidia con
// los bytes. sharp genera el archivo decodificable y el certificado decide que MIME
// anuncia, que es exactamente el poder que tiene el navegador de un telefono.
function realImage(format, tone) {
  const background = tone === "frio" ? { r: 40, g: 120, b: 160 } : { r: 140, g: 90, b: 60 };
  return sharp({ create: { width: 480, height: 640, channels: 3, background } }).toFormat(format).toBuffer();
}

// Un MP4 y un HEIC declarados como JPEG. El primero no es una imagen y tiene que
// rechazarse; el segundo si es una foto que este build no puede pintar y tiene que
// guardarse degradada. Los dos llegaron etiquetados igual en produccion.
const videoBytes = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypmp42", "ascii"), Buffer.alloc(400, 7)]);
const heicBytes = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftyp", "ascii"), Buffer.from("heic", "ascii"), Buffer.alloc(400, 11)]);

const WEB_PUNCH_TYPES = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];
// Etiqueta que la pantalla web manda realmente en `metadata.source`. No es la constante
// firmada de la app (`MOBILE_SOURCE`), y por eso el servidor lo toma por canal web.
const WEB_SOURCE_ALIAS = "apexos-mobile";
// Codigo duro que devolvio la compuerta alterna de `develop`. Si reaparece en cualquier
// respuesta de esta ventana, la certificacion se cae: es la firma de dos dictamenes sobre
// la misma foto.
const SELFIE_GATE_RETIRED_CODE = "SELFIE_INVALIDA";

function startSupabaseStub() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (url.pathname === "/auth/v1/user") {
      const who = byToken.get(bearer);
      return who ? send(200, { id: who.id, email: who.email, user_metadata: { full_name: `Cert ${who.key}` } }) : send(401, { msg: "invalid" });
    }
    if (url.pathname === "/rest/v1/company_users") {
      const who = byId.get(String(url.searchParams.get("user_id") || "").replace(/^eq\./, ""));
      return send(200, who ? [{ company_id: COMPANY_ID, role: who.membership, status: "active" }] : []);
    }
    if (url.pathname === "/rest/v1/companies") return send(200, [{ id: COMPANY_ID, name: COMPANY_NAME }]);
    if (url.pathname === "/rest/v1/v_company_module_status") {
      return send(200, ["M-17", "M-22"].map((module_code) => ({ module_code, enabled: true })));
    }
    if (url.pathname === "/rest/v1/employees") {
      const or = String(url.searchParams.get("or") || "");
      const who = people.find((p) => or.includes(`user_id.eq.${p.id}`));
      return send(200, who ? [who.employee] : []);
    }
    return send(404, { message: `ruta no simulada: ${url.pathname}` });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function startApi(supabaseUrl) {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    APPDATA: process.env.APPDATA,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: "development",
    APP_ENV: "local",
    PORT: String(API_PORT),
    DATABASE_URL,
    DIRECT_URL: DATABASE_URL,
    DISABLE_REDIS: "true",
    REDIS_DISABLED: "true",
    WORKERS_DISABLED: "true",
    JWT_SECRET: crypto.randomBytes(32).toString("hex"),
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: "cert-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "cert-service-key",
    SUPABASE_AUTH_CACHE_TTL_MS: "1000"
  };
  const child = spawn(process.execPath, ["server.js"], { cwd: path.join(ROOT, "apps/api"), env, stdio: ["ignore", "pipe", "pipe"] });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

async function waitForApi(api) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (api.child.exitCode !== null) throw new Error(`la API termino antes de arrancar:\n${api.logs.join("").slice(-3000)}`);
    try {
      if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("la API no respondio /health en 90 s");
}

async function call(who, method, pathname, body) {
  const response = await fetch(`${API}${pathname}`, {
    method,
    headers: { ...(who ? { Authorization: `Bearer ${who.token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, code: payload?.code || null, payload };
}

const result = {
  certification: "hr-mobile-identity-local",
  run_id: RUN_ID,
  environment: "LOCAL",
  database: DATABASE_URL.replace(/\/\/[^@]+@/, "//***@"),
  started_at: new Date().toISOString(),
  checks: []
};

function check(name, ok, detail = {}) {
  result.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "OK  " : "FALLA"} ${name}`);
  if (!ok) throw new Error(`Fallo de certificacion: ${name} ${JSON.stringify(detail)}`);
}

async function enroll(who, key, deviceId) {
  const signedAt = new Date().toISOString();
  const userId = (await call(who, "GET", "/auth/me")).payload?.user?.id;
  return call(who, "POST", "/hr/self/biometric-enrollment", {
    device_id: deviceId,
    public_key: key.publicKey,
    signed_at: signedAt,
    signature: key.sign(identity.enrollmentMessage({ userId, deviceId, signedAt })),
    platform: "android",
    device_model: "Cert Pixel"
  });
}

// Marcacion como la manda la app: firma sobre tipo, hora, clave, telefono y
// hash de la selfie.
async function mobilePunch(who, { type, key, deviceId, selfie = selfieBytes(type), signedSelfie, withIdentity = true, withSelfie = true, idempotencyKey = crypto.randomUUID(), punchedAt = new Date().toISOString() }) {
  const userId = (await call(who, "GET", "/auth/me")).payload?.user?.id;
  const photoSha256 = crypto.createHash("sha256").update(signedSelfie || selfie).digest("hex");
  const message = identity.punchMessage({ userId, type, punchedAt, idempotencyKey, deviceId, photoSha256 });
  const body = {
    user_name: `Cert ${who.key}`,
    type,
    punched_at: punchedAt,
    idempotency_key: idempotencyKey,
    metadata: {
      source: identity.MOBILE_SOURCE,
      gps_quality: "sin_gps",
      ...(withIdentity ? { identity: { device_id: deviceId, signature: key.sign(message) } } : { biometric_verified: true }),
      ...(withSelfie ? { identity_photo: { name: "selfie.jpg", type: "image/jpeg", size: selfie.length, base64: `data:image/jpeg;base64,${selfie.toString("base64")}` } } : {})
    }
  };
  return { response: await call(who, "POST", "/hr/self/time-punches", body), body };
}

// Marcacion como la manda la pantalla web: sin firma (el navegador no tiene chip), con
// la selfie en `metadata.identity_photo` y con el MIME que el navegador quiso anunciar.
// `declaredType` es la perilla que reproduce el incidente; `detach` arma el reenvio sin
// foto que hace la cola del navegador despues de un rechazo de formato.
async function webPunch(who, { type, photo, declaredType = "image/jpeg", source = WEB_SOURCE_ALIAS, detached = false, idempotencyKey = crypto.randomUUID(), punchedAt = new Date().toISOString() }) {
  const body = {
    user_name: `Cert ${who.key}`,
    type,
    punched_at: punchedAt,
    idempotency_key: idempotencyKey,
    // La pantalla real pone la foto en la raiz del cuerpo (`payload.identity_photo`,
    // marcacion/page.tsx:1306) y el desprendimiento declarado en `metadata`: reproducir esa
    // separacion es lo que hace que esta evidencia mida lo que manda un telefono de verdad.
    ...(photo ? { identity_photo: { base64: photo.toString("base64"), name: "selfie.jpg", type: declaredType, size: photo.length } } : {}),
    metadata: {
      source,
      gps_quality: "sin_gps",
      ...(detached ? {
        evidence_status: "degraded",
        evidence_detached_reason: "El navegador no pudo entregar la foto de esta marcacion.",
        hr_novelty: {
          kind: "MARCAT_SIN_EVIDENCIA",
          requires_supervisor_action: true,
          failure_code: "EVIDENCIA_CLASE_RECHAZADA",
          message: "La foto de validacion no se pudo guardar en este telefono.",
          punch_type: type,
          punched_at: punchedAt,
          idempotency_key: idempotencyKey,
          evidence_pending_refs: []
        }
      } : {})
    }
  };
  return call(who, "POST", "/hr/self/time-punches", body);
}

// Desde `70e4e100` marcar sin `Employee` vinculado es 404 `EMPLEADO_NO_ASOCIADO`: la
// evidencia siembra su ficha para no medir los datos que hubo en la maquina de quien corre.
async function sembrarFichas(prisma) {
  for (const who of people) {
    await call(who, "GET", "/auth/me");
    const user = await prisma.user.findFirst({ where: { email: who.email } });
    if (!user) throw new Error(`el aprovisionamiento no creo el usuario ${who.email}`);
    const existing = await prisma.employee.findFirst({ where: { user_id: user.id } });
    if (existing) { who.employee_id = existing.id; continue; }
    const employee = await prisma.employee.create({
      data: {
        tenant_id: user.tenant_id,
        user_id: user.id,
        code: `CERT-${who.key}-${RUN_ID}`,
        position: `Tecnico ${who.key}`,
        department: "Certificacion",
        salary_base: 2000000,
        hire_date: new Date("2026-01-05"),
        metadata: { name: `Cert ${who.key}`, employee_code: `CERT-${who.key}-${RUN_ID}` }
      }
    });
    who.employee_id = employee.id;
  }
}

async function main() {
  const stub = await startSupabaseStub();
  const api = startApi(`http://127.0.0.1:${stub.address().port}`);
  const { PrismaClient } = require(require.resolve("@prisma/client", { paths: [path.join(ROOT, "apps/api"), ROOT] }));
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    await waitForApi(api);
    check("la API real arranca contra el Postgres local", true, { api: API });
    await sembrarFichas(prisma);
    check("las fichas de la certificacion existen y estan vinculadas", people.every((p) => p.employee_id), { employee_ids: people.map((p) => p.employee_id) });

    const keyA = deviceKey();
    const keyB = deviceKey();
    const DEVICE_A = `and-cert-a-${RUN_ID}`;
    const DEVICE_B = `and-cert-b-${RUN_ID}`;

    const initial = await call(tecnico, "GET", "/hr/self/biometric-enrollment");
    check("un tecnico nuevo no tiene telefono registrado", initial.status === 200 && initial.payload.enrolled === false, { status: initial.status, payload: initial.payload });

    const beforeEnroll = await mobilePunch(tecnico, { type: "entrada", key: keyA, deviceId: DEVICE_A });
    check("sin registro la app no puede marcar", beforeEnroll.response.status === 403 && beforeEnroll.response.code === "BIOMETRIA_NO_REGISTRADA", { status: beforeEnroll.response.status, code: beforeEnroll.response.code });

    const enrolled = await enroll(tecnico, keyA, DEVICE_A);
    check("registra su telefono con la firma de la huella", enrolled.status === 201 && enrolled.payload.enrolled === true && enrolled.payload.device_id === DEVICE_A, { status: enrolled.status, payload: enrolled.payload });

    const visible = await call(tecnico, "GET", "/hr/self/biometric-enrollment");
    check("consulta su registro sin que viaje la llave", visible.payload.enrolled === true && visible.payload.device_id === DEVICE_A && !("public_key" in visible.payload), { payload: visible.payload });

    const second = await enroll(tecnico, keyB, DEVICE_B);
    check("no puede registrar otro telefono sin que lo restablezcan", second.status === 409 && second.code === "BIOMETRIA_YA_REGISTRADA", { status: second.status, code: second.code });

    // El caso real que lo motivo: la esposa entra con SU usuario en el telefono
    // del tecnico y "registra su huella"; el telefono acepta el dedo del
    // tecnico, que entonces marca por ella.
    const shared = await enroll(otro, deviceKey(), DEVICE_A);
    check("otro empleado no puede registrarse en un telefono ajeno", shared.status === 409 && shared.code === "DISPOSITIVO_DE_OTRO_EMPLEADO", { status: shared.status, code: shared.code });

    const employee = await prisma.employee.findFirst({ where: { user: { email: tecnico.email } } });
    check("la llave publica queda en la ficha del empleado", employee?.metadata?.mobile_biometric?.public_key === keyA.publicKey, { employee_id: employee?.id });

    // Rechazos antes de la marcacion valida (no deben crear nada).
    const otherDevice = await mobilePunch(tecnico, { type: "entrada", key: keyB, deviceId: DEVICE_B });
    check("desde otro telefono no puede marcar", otherDevice.response.status === 403 && otherDevice.response.code === "DISPOSITIVO_NO_REGISTRADO", { status: otherDevice.response.status, code: otherDevice.response.code });

    const otherKey = await mobilePunch(tecnico, { type: "entrada", key: keyB, deviceId: DEVICE_A });
    check("con otra llave haciendose pasar por su telefono no pasa", otherKey.response.status === 403 && otherKey.response.code === "FIRMA_BIOMETRICA_INVALIDA", { status: otherKey.response.status, code: otherKey.response.code });

    const swapped = await mobilePunch(tecnico, { type: "entrada", key: keyA, deviceId: DEVICE_A, selfie: selfieBytes("otra-cara"), signedSelfie: selfieBytes("cara-firmada") });
    check("cambiar la selfie despues de firmar invalida la marcacion", swapped.response.status === 403 && swapped.response.code === "FIRMA_BIOMETRICA_INVALIDA", { status: swapped.response.status, code: swapped.response.code });

    const noSelfie = await mobilePunch(tecnico, { type: "entrada", key: keyA, deviceId: DEVICE_A, withSelfie: false });
    check("sin selfie la app no puede marcar", noSelfie.response.status === 400 && noSelfie.response.code === "SELFIE_REQUERIDA", { status: noSelfie.response.status, code: noSelfie.response.code });

    const oldApp = await mobilePunch(tecnico, { type: "entrada", key: keyA, deviceId: DEVICE_A, withIdentity: false });
    check("una version vieja de la app (sin firma) no puede marcar", oldApp.response.status === 403 && oldApp.response.code === "IDENTIDAD_REQUERIDA", { status: oldApp.response.status, code: oldApp.response.code });

    const rejectedCount = await prisma.timePunch.count({ where: { employee_id: employee.id } });
    check("los intentos rechazados no dejaron marcaciones", rejectedCount === 0, { punches: rejectedCount });

    // Marcacion valida.
    const selfie = selfieBytes("entrada-valida");
    const good = await mobilePunch(tecnico, { type: "entrada", key: keyA, deviceId: DEVICE_A, selfie });
    check("marca desde su telefono con huella y selfie", [200, 201].includes(good.response.status), { status: good.response.status, code: good.response.code, error: good.response.payload?.error });
    const stored = await prisma.timePunch.findFirst({ where: { employee_id: employee.id, type: "entrada" }, orderBy: { id: "desc" } });
    const verification = stored?.metadata?.identity_verification || {};
    check("la marcacion queda verificada con su telefono", verification.status === "verified" && verification.device_id === DEVICE_A && verification.channel === "mobile", { identity_verification: { ...verification, signature: verification.signature ? "[presente]" : null } });
    const photo = stored?.metadata?.identity_photo || {};
    check("la selfie se guarda como data URL con su hash", photo.base64_data === `data:image/jpeg;base64,${selfie.toString("base64")}` && photo.sha256 === crypto.createHash("sha256").update(selfie).digest("hex"), { type: photo.type, size: photo.size });
    check("la firma cruda de la app no queda suelta en la metadata", stored?.metadata?.identity === undefined, {});

    const replay = await call(tecnico, "POST", "/hr/self/time-punches", good.body);
    const afterReplay = await prisma.timePunch.count({ where: { employee_id: employee.id, type: "entrada" } });
    check("reenviar la misma marcacion (cola offline) no la duplica", [200, 201].includes(replay.status) && afterReplay === 1, { status: replay.status, entradas: afterReplay });

    // Registros dobles anteriores a la regla: se bloquea la marcacion.
    const otroBefore = await prisma.employee.findFirst({ where: { user: { email: otro.email } } });
    await prisma.employee.update({ where: { id: otroBefore.id }, data: { metadata: { ...(otroBefore.metadata || {}), mobile_biometric: { device_id: DEVICE_A, public_key: deviceKey().publicKey, enrolled_at: new Date().toISOString() } } } });
    const duplicated = await mobilePunch(tecnico, { type: "inicio_almuerzo", key: keyA, deviceId: DEVICE_A });
    check("un telefono que quedo registrado para dos empleados no puede marcar", duplicated.response.status === 403 && duplicated.response.code === "DISPOSITIVO_COMPARTIDO", { status: duplicated.response.status, code: duplicated.response.code });
    await prisma.employee.update({ where: { id: otroBefore.id }, data: { metadata: otroBefore.metadata || {} } });

    // El canal firmado NO cambia en esta ventana. Las apps instaladas firman el almuerzo
    // contra el hash del vacio: exigirles selfie no produce un pedido de foto, produce una
    // firma invalida, y deja sin marcar a quien todavia no actualizo.
    const signedLunch = await mobilePunch(tecnico, { type: "inicio_almuerzo", key: keyA, deviceId: DEVICE_A, withSelfie: false, signedSelfie: Buffer.alloc(0) });
    check("la app instalada sigue marcando el almuerzo sin foto", [200, 201].includes(signedLunch.response.status), { status: signedLunch.response.status, code: signedLunch.response.code, error: signedLunch.response.payload?.error });
    const storedLunch = await prisma.timePunch.findFirst({ where: { employee_id: employee.id, type: "inicio_almuerzo" }, orderBy: { id: "desc" } });
    check("el almuerzo firmado queda verificado y sin cara acumulada", storedLunch?.metadata?.identity_verification?.status === "verified" && !storedLunch?.metadata?.identity_photo, { identity_verification: storedLunch?.metadata?.identity_verification });

    // Ventana de actualizacion del canal web: las cuatro marcaciones piden selfie y la
    // hora nunca se pierde por el formato de la foto. Cada tipo se intenta primero sin
    // foto (debe rechazarlo con nombre propio) y despues con la forma en que realmente
    // llega del telefono: foto verdadera con la etiqueta que el navegador quiso anunciar.
    const jpegReal = await realImage("jpeg", "frio");
    const pngReal = await realImage("png", "calido");
    const otroFicha = await prisma.employee.findFirst({ where: { user: { email: otro.email } } });
    const formasWeb = [
      { type: "entrada", photo: jpegReal, declaredType: "image/png", estado: "available", como: "JPEG real declarado PNG" },
      { type: "inicio_almuerzo", photo: pngReal, declaredType: "image/jpeg", estado: "available", como: "PNG real declarado JPEG (el rechazo literal de produccion)", video: true },
      { type: "fin_almuerzo", photo: heicBytes, declaredType: "image/jpeg", estado: "degraded", como: "HEIC de telefono que el visor no pinta" },
      { type: "salida", detached: true, estado: "desprendida", como: "reenvio sin foto que hace la cola del navegador" }
    ];
    const codigosWeb = [];
    const filasWeb = new Map();
    for (const forma of formasWeb) {
      const sinFoto = await webPunch(otro, { type: forma.type });
      codigosWeb.push(sinFoto.code);
      check(`la web no puede marcar ${forma.type} sin selfie`, sinFoto.status === 400 && sinFoto.code === "SELFIE_REQUERIDA", { status: sinFoto.status, code: sinFoto.code, error: sinFoto.payload?.error });
      if (forma.video) {
        // Control positivo: la ventana no abre la puerta a cualquier cosa. Un MP4
        // etiquetado como foto se rechaza, y se rechaza con el motivo de evidencia en
        // claro, no con la etiqueta suelta de la compuerta alterna.
        const video = await webPunch(otro, { type: forma.type, photo: videoBytes, declaredType: "image/jpeg" });
        codigosWeb.push(video.code);
        const motivo = String(video.payload?.error?.message || video.payload?.error || "");
        check(`un video declarado foto si se rechaza (${forma.type})`, video.status === 400 && /imagen permitida/.test(motivo), { status: video.status, code: video.code, message: motivo });
      }
      const respuesta = await webPunch(otro, { type: forma.type, photo: forma.photo, declaredType: forma.declaredType, detached: Boolean(forma.detached) });
      codigosWeb.push(respuesta.code);
      check(`la web marca ${forma.type} con ${forma.como}`, [200, 201].includes(respuesta.status), { status: respuesta.status, code: respuesta.code, error: respuesta.payload?.error });
      const fila = await prisma.timePunch.findFirst({ where: { employee_id: otroFicha.id, type: forma.type }, orderBy: { id: "desc" } });
      filasWeb.set(forma.type, fila);
      const verificacion = fila?.metadata?.identity_verification || {};
      check(`${forma.type}: la marcacion web entro por el canal web`, verificacion.channel === "web", { identity_verification: verificacion });
      if (forma.estado === "available") {
        check(`${forma.type}: la foto verdadero-etiqueta-mentiroso se guarda disponible`, verificacion.status === "photo_only" && fila?.metadata?.identity_photo?.evidence_status === "available" && Boolean(fila?.metadata?.identity_photo?.base64_data), { status: verificacion.status, evidence_status: fila?.metadata?.identity_photo?.evidence_status });
      }
      if (forma.estado === "degraded") {
        // El visor no pinta el HEIC, pero la hora entro y la fila dice por que: ciego para
        // el supervisor, nunca perdido para el empleado.
        check(`${forma.type}: la foto que el visor no pinta se conserva degradada y la hora entra`, verificacion.status === "photo_only" && verificacion.evidence_status === "degraded" && fila?.metadata?.identity_photo?.evidence_status === "degraded" && Boolean(fila?.metadata?.identity_photo?.evidence_failure_code), { identity_verification: verificacion, identity_photo: fila?.metadata?.identity_photo });
      }
      if (forma.estado === "desprendida") {
        check(`${forma.type}: el reenvio sin foto registra la hora con su novedad`, verificacion.status === "not_verified" && verificacion.evidence_status === "degraded" && verificacion.evidence_failure_code === "EVIDENCIA_CLASE_RECHAZADA" && Boolean(verificacion.evidence_detached_reason) && !fila?.metadata?.identity_photo, { identity_verification: verificacion });
      }
    }
    check("los cuatro tipos de la web quedaron marcados", WEB_PUNCH_TYPES.every((type) => filasWeb.get(type)), { tipos: [...filasWeb.keys()] });
    check("ninguna respuesta de la ventana web lleva la etiqueta de la compuerta alterna", !codigosWeb.includes(SELFIE_GATE_RETIRED_CODE), { codigos: codigosWeb.filter(Boolean) });

    // Monitor.
    const evidence = await call(admin, "GET", `/hr/monitor-evidence/identity/${stored.id}`);
    check("el supervisor ve la selfie desde el monitor", evidence.status === 200 && evidence.payload.base64_data === photo.base64_data && evidence.payload.source === "identity", { status: evidence.status, code: evidence.code });
    const webSelfie = await call(admin, "GET", `/hr/monitor-evidence/identity/${filasWeb.get("inicio_almuerzo").id}`);
    check("el supervisor ve la selfie de la web tal como llego", webSelfie.status === 200 && webSelfie.payload.base64_data === `data:image/png;base64,${pngReal.toString("base64")}`, { status: webSelfie.status, code: webSelfie.code, mime: webSelfie.payload?.type });
    const detachedEvidence = await call(admin, "GET", `/hr/monitor-evidence/identity/${filasWeb.get("salida").id}`);
    check("una marcacion sin selfie no inventa evidencia", detachedEvidence.status === 404, { status: detachedEvidence.status });

    // Marcaciones hechas con la app nueva ANTES del despliegue: la API anterior
    // guardo la selfie tal cual la mando la app (identity_photo.base64).
    const legacySelfie = selfieBytes("antes-del-despliegue");
    const legacy = await prisma.timePunch.create({
      data: {
        tenant_id: stored.tenant_id,
        employee_id: employee.id,
        user_name: "Cert tecnico",
        type: "salida",
        punched_at: new Date(),
        date: new Date(new Date().toISOString().slice(0, 10)),
        time: "23:59",
        metadata: { source: identity.MOBILE_SOURCE, identity_photo: { name: "selfie.jpg", type: "image/jpeg", size: legacySelfie.length, base64: `data:image/jpeg;base64,${legacySelfie.toString("base64")}` } }
      }
    });
    const legacyEvidence = await call(admin, "GET", `/hr/monitor-evidence/identity/${legacy.id}`);
    check("las selfies guardadas antes del despliegue tambien se ven en el monitor", legacyEvidence.status === 200 && legacyEvidence.payload.base64_data === `data:image/jpeg;base64,${legacySelfie.toString("base64")}`, { status: legacyEvidence.status, code: legacyEvidence.code });
    await prisma.timePunch.delete({ where: { id: legacy.id } });

    // Restablecer.
    const otroMe = await call(otro, "GET", "/auth/me");
    const otroEmployee = await prisma.employee.findFirst({ where: { user: { email: otro.email } } }) || (await call(otro, "GET", "/hr/self/biometric-enrollment"), await prisma.employee.findFirst({ where: { user: { email: otro.email } } }));
    check("el segundo tecnico existe para las pruebas de restablecer", otroMe.status === 200 && Boolean(otroEmployee), {});
    const peerReset = await call(otro, "DELETE", `/hr/employees/${employee.id}/biometric-enrollment`, { reason: "cert" });
    check("un tecnico con hr:write no puede restablecer a un compañero", peerReset.status === 403 && peerReset.code === "BIOMETRIA_RESTABLECER_DENEGADO", { status: peerReset.status, code: peerReset.code });
    const selfReset = await call(tecnico, "DELETE", `/hr/employees/${employee.id}/biometric-enrollment`, { reason: "cert" });
    check("nadie se restablece a si mismo", selfReset.status === 403, { status: selfReset.status, code: selfReset.code });

    const adminReset = await call(admin, "DELETE", `/hr/employees/${employee.id}/biometric-enrollment`, { reason: "cambio de telefono" });
    check("el administrador restablece el registro", adminReset.status === 200 && adminReset.payload.ok === true && adminReset.payload.previous?.device_id === DEVICE_A, { status: adminReset.status, code: adminReset.code });
    const afterReset = await prisma.employee.findFirst({ where: { id: employee.id } });
    const history = afterReset?.metadata?.mobile_biometric_history || [];
    check("el registro anterior queda en el historial sin la llave", !afterReset?.metadata?.mobile_biometric && history.length === 1 && history[0].device_id === DEVICE_A && !history[0].public_key && history[0].reset_reason === "cambio de telefono", { history: history.map(({ device_id, reset_reason }) => ({ device_id, reset_reason })) });

    const reEnrolled = await enroll(tecnico, keyB, DEVICE_B);
    check("tras restablecer se registra en el telefono nuevo", reEnrolled.status === 201 && reEnrolled.payload.device_id === DEVICE_B, { status: reEnrolled.status });
    const staleKey = await mobilePunch(tecnico, { type: "fin_almuerzo", key: keyA, deviceId: DEVICE_A });
    check("el telefono anterior ya no puede marcar", staleKey.response.status === 403 && staleKey.response.code === "DISPOSITIVO_NO_REGISTRADO", { status: staleKey.response.status, code: staleKey.response.code });
    const newDevice = await mobilePunch(tecnico, { type: "fin_almuerzo", key: keyB, deviceId: DEVICE_B });
    check("el telefono nuevo marca verificado", [200, 201].includes(newDevice.response.status), { status: newDevice.response.status, code: newDevice.response.code, error: newDevice.response.payload?.error });

    const noToken = await call(null, "GET", "/hr/self/biometric-enrollment");
    check("sin sesion la API responde 401", noToken.status === 401, { status: noToken.status });
  } finally {
    await prisma.$disconnect().catch(() => {});
    api.child.kill();
    stub.close();
    result.finished_at = new Date().toISOString();
    result.passed = result.checks.length > 0 && result.checks.every((item) => item.ok);
    if (!result.passed) result.api_log_tail = api.logs.join("").slice(-20000);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Evidencia: ${OUTPUT}`);
  }
}

main().then(() => {
  console.log(`CERTIFICACION ${result.passed ? "APROBADA" : "FALLIDA"}: ${result.checks.filter((c) => c.ok).length}/${result.checks.length}`);
  process.exit(result.passed ? 0 : 1);
}).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
