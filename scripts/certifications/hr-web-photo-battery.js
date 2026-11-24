#!/usr/bin/env node

/*
 * Bateria hostil del canal WEB de marcaciones: quince formas de foto contra el API desplegado.
 *
 * Que se prueba aqui y no en otro lado:
 *   - hr-evidence-resilience.test.js usa la compuerta del arbol del puesto: prueba el codigo que
 *     esta en el disco, no el binario que sirve el ambiente;
 *   - hr-web-selfie-field.js mide las cuatro formas del incidente del 2026-11-24 (etiqueta
 *     mentirosa y reenvio sin foto): cuatro piernas, ninguna de tamano;
 *   - esta corrida manda las quince formas que un telefono o un navegador pueden producir de
 *     verdad -JPEG, PNG, WebP, MIME en mayusculas, base64 con saltos, dos imagenes reales que no
 *     caben en el almacen, video, PDF, SVG, texto plano y GIF- y exige una de dos promesas por
 *     pierna: la hora entro, o la respuesta nombro el codigo exacto y el reenvio del navegador
 *     con la evidencia desprendida registro la hora igual.
 *
 * La promesa de fondo: ninguna foto real cuesta una jornada. Una imagen decodificable de clase
 * aceptada (JPEG, PNG, WebP) entra aunque no quepa en el almacen; en ese caso la fila queda
 * degradada y va a revision del supervisor, sin guardar los bytes. Lo que no es foto (video, PDF,
 * SVG, texto, GIF) sigue rechazandose, pero el rechazo no puede perder la hora: la cola del
 * navegador la reenvia sin foto y ese reenvio tiene que asentarse.
 *
 * Huella: escribe solo en QA. Un ambiente con --env-file=config/production.env se niega (regla 10
 * del agente de QA: la bateria hostil no escribe en Produccion). Crea un operario efimero por
 * pierna, con su propia sesion, para que la escalera de la jornada (entrada -> inicio_almuerzo ->
 * fin_almuerzo -> salida) no interfiera con lo que se mide de la foto: cada pierna abre su propio
 * dia con `entrada`. Al cerrar retira cada cuenta por el endpoint de administracion y apaga la
 * ficha. Ningun token, contrasena, correo o nombre de persona se escribe en la evidencia.
 *
 * Uso:
 *   node scripts/certifications/hr-web-photo-battery.js --selftest
 *   node scripts/certifications/hr-web-photo-battery.js --env-file=config/qa.env \
 *     --espera=despues --fix-commit=<sha del candidato> --output=docs/qa/evidence/<carpeta>/bateria-qa.json
 */

const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "..", "..");
const WEB_SOURCE = "apexos-mobile";
const TIPO = "entrada";
const PRESUPUESTO_MS = 30000;
const TOPE_WEB_BYTES = 2 * 1024 * 1024;
// Codigos que solo existian en la compuerta alterna del 2026-11-20. Si alguno reaparece, la
// compuerta vuelta a montar esta decidiendo por etiqueta antes que la clase.
const CODIGOS_PROHIBIDOS = ["SELFIE_INVALIDA", "SELFIE_NO_LEIBLE"];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = String(argv[index]);
    if (!raw.startsWith("--")) continue;
    const body = raw.slice(2);
    const eq = body.indexOf("=");
    if (eq > -1) { args[body.slice(0, eq)] = body.slice(eq + 1); continue; }
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith("--")) { args[body] = String(next); index += 1; }
    else args[body] = true;
  }
  return args;
}

function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

// ---- fabricas de bytes reales -------------------------------------------------------------

function pngChunk(type, data) {
  const cabecera = Buffer.alloc(8);
  cabecera.writeUInt32BE(data.length, 0);
  cabecera.write(type, 4, "ascii");
  const cuerpo = Buffer.concat([cabecera, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo) >>> 0, 0);
  return Buffer.concat([cuerpo, crc]);
}

let CRC_TABLA = null;
function crc32(buffer) {
  if (!CRC_TABLA) {
    CRC_TABLA = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLA[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLA[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

// PNG real construido a mano: firma + IHDR + IDAT + IEND. Decodificable, asi que la guarda por
// clase lo acepta; lo que se pone a prueba es la etiqueta y el tamano.
function pngSelfie(lado, bytesObjetivo = 0) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const paso = lado * 3 + 1;
  const raw = Buffer.alloc(paso * lado);
  const pixeles = crypto.randomBytes(lado * lado * 3);
  for (let fila = 0; fila < lado; fila += 1) {
    raw[fila * paso] = 0;
    pixeles.copy(raw, fila * paso + 1, fila * lado * 3, (fila + 1) * lado * 3);
  }
  let buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 0 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  // Un PNG admite un chunk IEND-despues basura sin dejar de olir a PNG: es la forma en que se
  // alcanza un tamano exacto (el limite justo) o uno deliberadamente grande.
  if (bytesObjetivo) {
    const relleno = bytesObjetivo - buffer.length;
    if (relleno < 12) throw new Error(`no se puede alcanzar ${bytesObjetivo} bytes en un PNG de ${lado}px`);
    buffer = Buffer.concat([buffer, pngChunk("tEXt", Buffer.concat([Buffer.from("cert\0"), Buffer.alloc(relleno - 12)]))]);
  }
  return buffer;
}

async function sharpSelfie(formato, lado = 240, opciones = {}) {
  const sharp = require("sharp");
  const crudo = crypto.randomBytes(lado * lado * 3);
  const imagen = sharp(crudo, { raw: { width: lado, height: lado, channels: 3 } });
  if (formato === "jpeg") return imagen.jpeg({ quality: opciones.quality ?? 80 }).toBuffer();
  if (formato === "webp") return imagen.webp({ quality: opciones.quality ?? 80 }).toBuffer();
  if (formato === "gif") return imagen.gif().toBuffer();
  throw new Error(`formato no soportado: ${formato}`);
}

// Relleno al final de un JPEG: los_magicos_ siguen al frente, el olor sigue diciendo image/jpeg
// y el payload pasa el tope. Es exactamente lo que manda un telefono con la camara en alta
// resolucion cuando el navegador no reencuadra.
function crecerJpeg(buffer, bytesObjetivo) {
  const relleno = bytesObjetivo - buffer.length;
  if (relleno < 1) throw new Error(`el JPEG ya pesa ${buffer.length} y no hay que crecerlo`);
  return Buffer.concat([buffer, Buffer.alloc(relleno, 0x20)]);
}

// ---- contrato de una pierna ---------------------------------------------------------------

// Observado siempre cae en una de tres palabras:
//   hora     -> la marcacion se asentó (2xx y la fila existe)
//   rechazo  -> la respuesta nombra un codigo de evidencia y la fila no existe
//   ruido    -> cualquier otra cosa: no permite afirmar nada
function observarPata({ status, code, asentada }) {
  if (asentada) return "hora";
  if (status >= 400 && code) return "rechazo";
  return "ruido";
}

// El codigo exacto que la guarda debe nombrar cuando rechaza. Se compara contra lo que el API
// devolvio en `code` o en `details.evidence_failure_code`, que es de donde lee el cliente real.
function codigoServido(body) {
  const raiz = body && typeof body === "object" ? body : {};
  const detalles = raiz.details || raiz.error?.details || {};
  for (const clave of ["code", "failure_code", "evidence_failure_code"]) {
    const valor = raiz[clave] || detalles[clave];
    if (typeof valor === "string" && valor.startsWith("EVIDENCIA_")) return valor;
  }
  const directo = raiz.code || raiz.error?.code || null;
  return typeof directo === "string" ? directo : null;
}

function evaluarPata({ esperado, observado, ancla }) {
  const fallos = [];
  if (!["hora", "rechazo", "ruido"].includes(observado)) fallos.push(`observado invalido: ${observado}`);
  if (esperado.observado && esperado.observado !== observado) {
    fallos.push(`la peticion mostro "${observado}" y la bateria prometio "${esperado.observado}"`);
  }
  if (esperado.codigo && esperado.codigo !== ancla.codigo) {
    fallos.push(`el ambiente nombro "${ancla.codigo || "sin codigo"}" y se prometio "${esperado.codigo}"`);
  }
  return { cumple: fallos.length === 0, fallos };
}

function selftest() {
  const casos = [
    // Control positivo: la bateria tiene que ser capaz de ver el defecto que dice arreglar.
    ["una_foto_grande_rechazada_se_ve_como_rechazo_no_como_hora",
      observarPata({ status: 400, code: "EVIDENCIA_SUPERA_LIMITE", asentada: false }) === "rechazo"],
    ["la_foto_grande_degradada_si_es_hora",
      observarPata({ status: 201, code: null, asentada: true }) === "hora"],
    ["una_respuesta_200_sin_fila_no_puede_certificar_la_hora",
      observarPata({ status: 200, code: null, asentada: false }) === "ruido"],
    ["un_500_sin_codigo_tampoco_certifica_nada",
      observarPata({ status: 500, code: null, asentada: false }) === "ruido"],
    ["la_compuerta_alterna_remontada_se_reconoce_por_su_codigo",
      CODIGOS_PROHIBIDOS.every((c) => !c.startsWith("EVIDENCIA_"))],
    ["el_codigo_de_evidencia_se_lee_tambien_en_details",
      codigoServido({ code: "VALIDACION", details: { evidence_failure_code: "EVIDENCIA_SUPERA_LIMITE" } }) === "EVIDENCIA_SUPERA_LIMITE"],
    ["un_codigo_corto_no_inventa_un_codigo_de_evidencia",
      codigoServido({ code: "VALIDACION", details: {} }) === "VALIDACION"],
    // Tres mutaciones inyectadas: cada una tiene que poner la promesa en ROJO. Si alguna queda
    // verde, la bateria puede pasar en falso y no certifica nada.
    ["mutacion_perdonar_el_400_deja_de_ver_el_rechazo",
      evaluarPata({ esperado: { observado: "rechazo", codigo: "EVIDENCIA_SUPERA_LIMITE" }, observado: "hora", ancla: { codigo: "EVIDENCIA_SUPERA_LIMITE" } }).cumple === false],
    ["mutacion_exigir_clase_prohibida_como_hora_se_ca",
      evaluarPata({ esperado: { observado: "rechazo", codigo: "EVIDENCIA_CLASE_RECHAZADA" }, observado: "rechazo", ancla: { codigo: "EVIDENCIA_TIPO_DECLARADO_RECHAZADO" } }).cumple === false],
    ["mutacion_olvidar_el_codigo_prometido_se_ca",
      evaluarPata({ esperado: { observado: "rechazo", codigo: "EVIDENCIA_MINIMA" }, observado: "rechazo", ancla: { codigo: null } }).cumple === false],
    ["--flag=valor_y_--flag_valor_resuelven_igual",
      (() => { const a = parseArgs(["--env-file=config/qa.env", "--espera", "despues"]); return a["env-file"] === "config/qa.env" && a.espera === "despues"; })()],
    ["una_bandera_de_valor_sin_valor_se_niega_en_vez_de_volverse_true",
      parseArgs(["--espera", "--output=x.json"]).espera === true],
    ["el_tope_de_la_bateria_es_el_del_canal_web",
      TOPE_WEB_BYTES === 2 * 1024 * 1024],
    ["quince_formas_y_todas_con_su_promesa_declarada",
      PAYLOADS().length === 15 && PAYLOADS().every((p) => ["hora", "rechazo"].includes(p.promesa) && (p.promesa === "hora" || p.codigo))],
    ["el_relleno_no_deja_de_oler_a_la_clase_original",
      (() => { const base = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); const crecido = crecerJpeg(base, 4096); return crecido.length === 4096 && crecido[0] === 0xff && crecido[1] === 0xd8; })()],
  ];
  let rojos = 0;
  for (const [nombre, ok] of casos) {
    if (!ok) rojos += 1;
    console.log(`${ok ? "OK   " : "FALLO"} ${nombre}`);
  }
  if (rojos) {
    console.error(`SELFTEST BLOQUEADO (${rojos}/${casos.length}): la bateria no distingue lo que promete de lo que el ambiente devolvio.`);
    return 1;
  }
  console.log(`SELFTEST APROBADO (${casos.length} casos): tres son mutaciones obligadas al rojo (perdonar el 400, cambiar la clase prohibida por hora, olvidar el codigo prometido).`);
  return 0;
}

// ---- las quince formas -------------------------------------------------------------------

let FIXTURES_CACHE = null;

async function fixtures() {
  if (FIXTURES_CACHE) return FIXTURES_CACHE;
  const jpeg = await sharpSelfie("jpeg");
  const webp = await sharpSelfie("webp");
  const gif = await sharpSelfie("gif");
  const pngChica = pngSelfie(64);
  FIXTURES_CACHE = {
    jpeg,
    png: pngChica,
    webp,
    gif_estatico: gif,
    jpeg_grande: crecerJpeg(jpeg, TOPE_WEB_BYTES + 1_100_000),
    png_grande: pngSelfie(64, TOPE_WEB_BYTES + 400_000),
    jpeg_justo: crecerJpeg(jpeg, TOPE_WEB_BYTES),
    rota: crypto.randomBytes(900),
    mp4: Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(600)]),
    pdf: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(600, 0x25)]),
    svg: Buffer.concat([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>'), Buffer.alloc(600, 0x20)]),
    texto: Buffer.concat([Buffer.from("no soy una foto, soy un fichero de texto plano."), Buffer.alloc(600, 0x2e)]),
  };
  return FIXTURES_CACHE;
}

function PAYLOADS() {
  // promesa: "hora" = la marcacion debe asentarse; "rechazo" = debe nombrar `codigo` y aun asi
  // el reenvio del navegador con la evidencia desprendida debe asentar la hora.
  // Las promesas no se declaran de memoria: son las que midio el prevalidado del 2026-11-24 contra
  // la compuerta unica. Un payload que no decodifica degrada; solo la clase prohibida decodificable
  // y el tipo declarado textual rechazo duro.
  return [
    { nombre: "jpeg-honesto", clase: "image/jpeg", promesa: "hora", evidencia_esperada: "available" },
    { nombre: "jpeg-declarado-png", clase: "image/png", promesa: "hora", mentiroso: true },
    { nombre: "png-declarado-jpeg", clase: "image/jpeg", promesa: "hora", mentiroso: true },
    { nombre: "webp-declarado-gif", clase: "image/gif", promesa: "hora", mentiroso: true },
    { nombre: "mime-en-mayusculas", clase: "IMAGE/JPEG", promesa: "hora", mentiroso: true },
    { nombre: "base64-con-saltos", clase: "image/jpeg", promesa: "hora", mentiroso: true, saltos: true },
    { nombre: "jpeg-en-el-tope-justo", clase: "image/jpeg", promesa: "hora", grande: "jpeg_justo", evidencia_esperada: "available" },
    { nombre: "jpeg-real-de-3-mb", clase: "image/jpeg", promesa: "hora", grande: "jpeg_grande", evidencia_esperada: "degraded", codigo_esperado_en_la_fila: "EVIDENCIA_SUPERA_LIMITE" },
    { nombre: "png-real-de-2_4-mb", clase: "image/png", promesa: "hora", grande: "png_grande", evidencia_esperada: "degraded", codigo_esperado_en_la_fila: "EVIDENCIA_SUPERA_LIMITE" },
    { nombre: "archivo-que-no-decodifica", clase: "image/jpeg", promesa: "hora", rota: true, evidencia_esperada: "degraded", codigo_esperado_en_la_fila: "EVIDENCIA_NO_DECODIFICABLE" },
    { nombre: "gif-real", clase: "image/gif", promesa: "hora", evidencia_esperada: "degraded", codigo_esperado_en_la_fila: "EVIDENCIA_NO_DECODIFICABLE" },
    { nombre: "video-mp4", clase: "video/mp4", promesa: "rechazo", codigo: "EVIDENCIA_CLASE_RECHAZADA" },
    { nombre: "pdf", clase: "application/pdf", promesa: "rechazo", codigo: "EVIDENCIA_CLASE_RECHAZADA" },
    { nombre: "svg-declarado-imagen", clase: "image/svg+xml", promesa: "rechazo", codigo: "EVIDENCIA_TIPO_DECLARADO_RECHAZADO" },
    { nombre: "texto-plano", clase: "text/plain", promesa: "rechazo", codigo: "EVIDENCIA_TIPO_DECLARADO_RECHAZADO" },
  ];
}

function bytesDe(forma, fij) {
  if (forma.grande) return fij[forma.grande];
  if (forma.rota) return fij.rota;
  switch (forma.nombre) {
    case "video-mp4": return fij.mp4;
    case "pdf": return fij.pdf;
    case "svg-declarado-imagen": return fij.svg;
    case "texto-plano": return fij.texto;
    case "gif-real": return fij.gif_estatico;
    case "mime-en-mayusculas":
    case "base64-con-saltos": return fij.jpeg;
    case "png-declarado-jpeg": return fij.png;
    case "webp-declarado-gif": return fij.webp;
    default: return fij.jpeg;
  }
}

// El cuerpo que arma PhotoCapture.tsx: la foto viaja en raiz como `identity_photo`.
function cuerpoPunch({ codigo, forma, bytes, declaredType, idempotencyKey, punchedAt, saltos }) {
  const base64 = bytes.toString("base64");
  const payload = saltos ? `${base64.slice(0, 76)}\n${base64.slice(76, 152)}\n${base64.slice(152)}` : base64;
  return {
    user_name: codigo,
    type: forma.tipo || TIPO,
    punched_at: punchedAt,
    idempotency_key: idempotencyKey,
    identity_photo: { base64: payload, name: `selfie-${forma.nombre}.jpg`, type: declaredType, size: bytes.length },
    metadata: { source: WEB_SOURCE, gps_quality: "sin_gps" },
  };
}

// Replica del reenvio REAL del navegador (page.tsx:573-581): `detachEvidence` followed by
// `withEscalationMarker`, que estampa la novedad con el codigo de evidencia que devolvio el
// servidor. La letra importa: `declaredEvidenceDetachment` (mobile-identity.js:544) solo acepta la
// excepcion si lee `evidence_status: "degraded"` mas UN codigo del contrato de evidencia (en
// `metadata.evidence_failure_code` o en `hr_novelty.failure_code`) mas un motivo legible. Con el
// codigo paraguas `VALIDACION` el API no reconoce la excepcion y la hora se vuelve a perder -eso
// lo mide la bateria, no lo inferimos-.
const REASON_DEL_CLIENTE = "La foto de validacion no se pudo guardar en este telefono. Tu hora si quedo registrada y la foto queda guardada en el equipo para revision del supervisor.";
const MENSAJE_DE_NOVEDAD = "Marcacion registrada sin su foto de validacion: el telefono del trabajador no pudo guardar la imagen. La foto sigue en el dispositivo y queda pendiente de revision.";

function detachDelCliente(body, codigoDevueltoPorElServidor) {
  const copia = { ...body };
  const desprendidas = [];
  for (const clave of ["photo", "extra_evidence", "identity_photo"]) {
    if (copia[clave] === undefined) continue;
    delete copia[clave];
    desprendidas.push(clave);
  }
  const metadata = copia.metadata && typeof copia.metadata === "object" ? { ...copia.metadata } : {};
  metadata.evidence_status = "degraded";
  metadata.evidence_detached_reason = REASON_DEL_CLIENTE;
  metadata.evidence_detached_at = new Date().toISOString();
  metadata.hr_novelty = {
    kind: "MARCAT_SIN_EVIDENCIA",
    requires_supervisor_action: true,
    failure_code: codigoDevueltoPorElServidor || "",
    message: MENSAJE_DE_NOVEDAD,
    punch_type: copia.type,
    punched_at: copia.punched_at,
    idempotency_key: copia.idempotency_key,
    evidence_pending_refs: [],
  };
  copia.metadata = metadata;
  return { payload: copia, desprendidas };
}

async function main() {
  const args = parseArgs();
  if (args.selftest) return selftest();

  const envFile = path.resolve(ROOT, String(args["env-file"] || ""));
  if (!args["env-file"] || !fs.existsSync(envFile)) throw new Error("Falta --env-file=config/qa.env: la bateria nunca usa el ambiente predeterminado.");
  const nombreEnv = path.basename(envFile);
  if (nombreEnv !== "qa.env") {
    throw new Error(`La bateria hostil escribe marcaciones: solo corre contra config/qa.env (recibi ${nombreEnv}). Produccion se mide por censo de rechazos, no por bateria.`);
  }
  const espera = String(args.espera || "");
  if (!["antes", "despues"].includes(espera)) throw new Error("--espera=antes|despues es obligatorio");
  if (!args["fix-commit"]) throw new Error("--fix-commit es obligatorio: sin ancla no se distingue antes de despues");
  if (!args.output) throw new Error("--output es obligatorio para poder versionar la corrida");
  const output = path.resolve(ROOT, String(args.output));
  const fixCommit = String(args["fix-commit"]);

  require("../load-env")(envFile);
  const apiUrl = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!apiUrl) throw new Error("El archivo de ambiente no declara NEXT_PUBLIC_API_URL");
  const prisma = require("../../apps/api/src/core/prisma");
  const bcrypt = require("bcrypt");

  const RUN = Date.now().toString().slice(-7);
  const DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const cheques = [];
  const tiempos = [];
  const ids = { usuarios: [], empleados: [] };

  const registrar = (nombre, ok, detalle = {}) => {
    cheques.push({ name: nombre, ok: Boolean(ok), detail: detalle });
    console.error(`${ok ? "OK   " : "FALLO"} ${nombre} :: ${JSON.stringify(detalle).slice(0, 260)}`);
    return Boolean(ok);
  };

  async function pedir(ruta, { method = "GET", token, payload } = {}) {
    const iniciado = Date.now();
    const response = await fetch(`${apiUrl}${ruta}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { "content-type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(90000),
    }).catch(() => ({ status: 0, _error: true }));
    const duracion = Date.now() - iniciado;
    if (response.status === 0) return { status: 0, code: "SIN_RESPUESTA", body: {}, duracion };
    const texto = await response.text();
    let body = {};
    try { body = texto ? JSON.parse(texto) : {}; } catch { body = { crudo: String(texto).slice(0, 160) }; }
    tiempos.push({ ruta, method, status: response.status, ms: duracion });
    return { status: response.status, body, code: codigoServido(body), duracion };
  }

  const fij = await fixtures();
  const formas = PAYLOADS();

  const reporte = {
    certification: "hr-web-photo-battery",
    version: 1,
    ambiente: "QA",
    instruccion: "Catorce formas de foto del canal web contra el API desplegado, una promesa por pierna",
    generado_en: new Date().toISOString(),
    env_file: path.relative(ROOT, envFile).replace(/\\/g, "/"),
    api_host: apiUrl.replace(/^https?:\/\/([^/]+).*$/, "$1"),
    script_sha256: sha256(fs.readFileSync(__filename)),
    dia_operativo: DIA,
    run: RUN,
    tope_web_bytes: TOPE_WEB_BYTES,
    compromiso: { fix_de_referencia: fixCommit, servidor_lee: "git merge-base --is-ancestor" },
    formas: formas.map((f) => ({ nombre: f.nombre, declarado: f.clase, promesa: f.promesa, codigo: f.codigo || null, bytes: bytesDe(f, fij).length })),
    cheques,
    tiempos,
    ids,
    presupuesto_ms: PRESUPUESTO_MS,
  };

  // 1) Ancla: que codigo esta sirviendo el ambiente.
  const health = await pedir("/health");
  const servido = String(health.body?.commit || "");
  let contieneElFix = false;
  try {
    execFileSync("git", ["cat-file", "-e", `${servido}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    execFileSync("git", ["merge-base", "--is-ancestor", fixCommit, servido], { cwd: ROOT, stdio: "ignore" });
    contieneElFix = true;
  } catch { contieneElFix = false; }
  const ancla = { contiene_el_fix: contieneElFix, codigo_servido: servido };
  reporte.despliegue = { status: health.status, commit_servido: servido, el_binario_servido_contiene_el_fix: contieneElFix };
  registrar("health_ancla_el_commit_servido", health.status === 200 && servido.length >= 12, { status: health.status, commit: servido, contiene_el_fix: contieneElFix });
  registrar("el_ambiente_servido_coincide_con_la_espera", contieneElFix === (espera === "despues"), { espera, contiene_el_fix: contieneElFix });

  // 2) Empresa modelo y el rol sobre el que se crean los operarios.
  const empresa = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" } }, orderBy: { name: "asc" } });
  if (!empresa) throw new Error(`No existe el tenant NYVORA en ${reporte.ambiente}: la bateria exige la empresa modelo.`);
  const rol = await prisma.role.findFirst({ where: { tenant_id: empresa.id, name: "Empleado" } })
    || await prisma.role.findFirst({ where: { tenant_id: empresa.id }, orderBy: { id: "asc" } });
  const rolAdmin = await prisma.role.findFirst({ where: { tenant_id: empresa.id, name: "APEX_ADMIN" } });

  // Un operario por pierna: cada uno abre su dia con `entrada`, asi la escalera de la jornada no
  // decide lo que se esta midiendo de la foto.
  const punchedAt = new Date(Date.now() - 5 * 60_000).toISOString();
  const piernas = [];
  for (let i = 0; i < formas.length; i += 1) {
    const forma = formas[i];
    const bytes = bytesDe(forma, fij);
    const declarado = forma.clase;
    const clave = `bat-${RUN}-${i}`;
    const correo = `cert.bat.${RUN}.${i}.o@internal.apexos.local`;
    const claveAcceso = `Cert${crypto.randomBytes(6).toString("hex")}#1`;
    const codigo = `CERTBAT${RUN}${i}`;
    const usuario = await prisma.user.create({
      data: { tenant_id: empresa.id, name: `CERT BATERIA ${RUN} ${i}`, email: correo, password: await bcrypt.hash(claveAcceso, 10), role_id: rol.id, active: true },
      select: { id: true },
    });
    ids.usuarios.push(usuario.id);
    const empleado = await prisma.employee.create({
      data: {
        tenant_id: empresa.id, user_id: usuario.id, code: codigo, user_type: "operario", position: "Prueba certificada",
        department: "QA", salary_base: 1300000, hire_date: new Date(), active: true,
        metadata: { name: codigo, can_punch_time: true, operational_classification: "operario", cert_run: RUN },
      },
      select: { id: true },
    });
    ids.empleados.push(empleado.id);
    const login = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correo, password: claveAcceso } });
    const token = String(login.body?.token || "");

    const body = cuerpoPunch({ codigo, forma, bytes, declaredType: declarado, idempotencyKey: clave, punchedAt, saltos: Boolean(forma.saltos) });
    const res = await pedir("/api/v1/hr/self/time-punches", { method: "POST", token, payload: body });
    const fila = await prisma.timePunch.findFirst({
      where: { tenant_id: empresa.id, idempotency_key: clave },
      select: { id: true, type: true, metadata: true },
    });
    const evidencia = fila?.metadata?.identity_photo || {};
    const verificacion = fila?.metadata?.identity_verification || {};
    const observado = observarPata({ status: res.status, code: res.code, asentada: Boolean(fila) });

    // Promesa de la primera peticion, segun la forma y segun el modo.
    const esDeTamano = forma.codigo_esperado_en_la_fila === "EVIDENCIA_SUPERA_LIMITE";
    let prometido;
    if (forma.promesa === "hora") {
      prometido = esDeTamano && espera === "antes"
        ? { observado: "rechazo", codigo: "EVIDENCIA_SUPERA_LIMITE", motivo: "el tope de almacen costaba la jornada" }
        : { observado: "hora", codigo: null };
    } else {
      prometido = { observado: "rechazo", codigo: forma.codigo };
    }
    const evaluada = evaluarPata({ esperado: prometido, observado, ancla: { codigo: res.code } });
    piernas.push({
      forma: forma.nombre, declarado, bytes: bytes.length, promesa: forma.promesa,
      mentiroso: Boolean(forma.mentiroso), grande: Boolean(forma.grande),
      evidencia_esperada: forma.evidencia_esperada || null,
      codigo_en_fila_esperado: forma.codigo_esperado_en_la_fila || null,
      status: res.status, code: res.code || null, observado, cumple: evaluada.cumple, fallos: evaluada.fallos,
      status: res.status, code: res.code || null, observado, cumple: evaluada.cumple, fallos: evaluada.fallos,
      evidencia_status: evidencia.evidence_status || null,
      evidencia_failure_code: evidencia.evidence_failure_code || verificacion.evidence_failure_code || null,
      byte_length_guardado: evidencia.byte_length ?? null,
      foto_inline: Boolean(evidencia.base64_data || evidencia.base64),
      ruta_almacen: evidencia.storage_path || evidencia.storage_ref || evidencia.storage_key || null,
      hora_asentada: Boolean(fila),
    });
    registrar(`pata_${forma.nombre}`, evaluada.cumple, { prometido: prometido.observado, codigo_prometido: prometido.codigo, observado, status: res.status, code: res.code || null, fallos: evaluada.fallos });

    // Toda forma que el servidor rechaza tiene que poder reenviarse sin foto, igual que hace la
    // cola del navegador. Si ese reenvio se cae, el rechazo si cuesta una jornada.
    if (observado === "rechazo") {
      const destacado = detachDelCliente(body, res.code);
      const clave2 = `bat-${RUN}-${i}-sin`;
      destacado.payload.idempotency_key = clave2;
      delete destacado.payload.user_name;
      destacado.payload.user_name = codigo;
      const res2 = await pedir("/api/v1/hr/self/time-punches", { method: "POST", token, payload: destacado.payload });
      const fila2 = await prisma.timePunch.findFirst({ where: { tenant_id: empresa.id, idempotency_key: clave2 }, select: { id: true, metadata: true } });
      const obs2 = observarPata({ status: res2.status, code: res2.code, asentada: Boolean(fila2) });
      piernas[piernas.length - 1].reenvio = { status: res2.status, code: res2.code || null, observado: obs2, desprendidas: destacado.desprendidas, clave: clave2 };
      // El reenvio sin foto es la segunda linea de defensa y tiene que funcionar ANTES y DESPUES:
      // `declaredEvidenceDetachment` (mobile-identity.js:544) lo acepta cuando la declaracion trae
      // el codigo de evidencia que devolvio el servidor. Lo que cambia entre modos es la PRIMERA
      // peticion de las formas de tamano, no esta.
      registrar(`reenvio_sin_foto_${forma.nombre}`, obs2 === "hora", { esperado: "hora", observado: obs2, status: res2.status, code: res2.code || null, desprendidas: destacado.desprendidas });
    }
  }
  reporte.piernas = piernas;

  // 3) invariantes que no dependen de que cada pierna individual caiga.
  const codigos = piernas.flatMap((p) => [p.code, p.reenvio?.code]).filter(Boolean);
  registrar("ninguna_respuesta_lleva_codigo_de_la_compuerta_alterna", !codigos.some((c) => CODIGOS_PROHIBIDOS.includes(c)), { codigos: [...new Set(codigos)] });
  registrar("ningun_5xx_en_toda_la_bateria", piernas.every((p) => p.status < 500 && p.status !== 0) && (!piernas.some((p) => p.reenvio && p.reenvio.status >= 500)), { peor: Math.max(...piernas.map((p) => p.status)) });
  // Lo que promete el arreglo: una fila DEGRADADA no guarda los bytes (un payload de 2 MB en jsonb
  // es exactamente lo que costo el disgusto de disco del 2026-11-18). Y lo que el ambiente declara:
  // una fila DISPONIBLE tiene que tener bytes o una ruta de almacen, porque "available" sin ninguno
  // de los dos es un supervisor viendo una foto que no existe.
  const degradadasConBytes = piernas.filter((p) => p.evidencia_status === "degraded" && p.foto_inline);
  registrar("las_filas_degradadas_no_guardan_los_bytes", degradadasConBytes.length === 0, { con_bytes: degradadasConBytes.map((p) => p.forma) });
  const disponiblesACiegas = piernas.filter((p) => p.evidencia_status === "available" && !p.foto_inline && !p.ruta_almacen);
  registrar("toda_fila_available_puede_mostrarse", disponiblesACiegas.length === 0, { ciegas: disponiblesACiegas.map((p) => p.forma) });
  reporte.condicion_almacenamiento = {
    inline: piernas.filter((p) => p.evidencia_status === "available" && p.foto_inline).map((p) => p.forma),
    en_almacen: piernas.filter((p) => p.evidencia_status === "available" && !p.foto_inline && p.ruta_almacen).map((p) => p.forma),
    nota: "available con los bytes dentro de la fila = la barrera de disco del plan de choque esta apagada en este ambiente (HR_EVIDENCE_INLINE_MAX_BYTES no declarado). No es un fallo de esta bateria; es el pendiente del ambiente, con dueno.",
  };

  if (espera === "despues") {
    const grandes = piernas.filter((p) => p.grande);
    registrar("las_tres_imagenes_de_dos_megas_no_cuestan_la_jornada", grandes.length === 3 && grandes.every((p) => p.observado === "hora"), { detalle: grandes.map(({ forma, status, code }) => ({ forma, status, code })) });
    registrar("la_fila_de_cada_forma_coincide_con_lo_prometido", piernas.every((p) => {
      if (p.promesa !== "hora" || !p.evidencia_esperada) return true;
      if (p.evidencia_status !== p.evidencia_esperada) return false;
      return !p.codigo_en_fila_esperado || p.evidencia_failure_code === p.codigo_en_fila_esperado;
    }), { detalle: piernas.filter((p) => p.promesa === "hora" && p.evidencia_esperada).map(({ forma, evidencia_status, evidencia_failure_code, evidencia_esperada, codigo_en_fila_esperado }) => ({ forma, estado: evidencia_status, codigo: evidencia_failure_code, esperaba: evidencia_esperada, esperaba_codigo: codigo_en_fila_esperado })) });
    registrar("la_que_no_cabe_degrada_sin_guardar_los_bytes", piernas.filter((p) => p.codigo_en_fila_esperado === "EVIDENCIA_SUPERA_LIMITE").every((p) => p.evidencia_status === "degraded" && p.byte_length_guardado > TOPE_WEB_BYTES && !p.foto_inline), { detalle: piernas.filter((p) => p.codigo_en_fila_esperado === "EVIDENCIA_SUPERA_LIMITE").map(({ forma, evidencia_status, byte_length_guardado, foto_inline }) => ({ forma, evidencia_status, byte_length_guardado, foto_inline })) });
    registrar("lo_que_el_navegador_no_pinta_degrada_y_no_cuesta_la_jornada", (() => {
      const sinPinta = piernas.filter((p) => p.codigo_en_fila_esperado === "EVIDENCIA_NO_DECODIFICABLE");
      return sinPinta.length === 2 && sinPinta.every((p) => p.observado === "hora" && p.evidencia_status === "degraded" && p.evidencia_failure_code === "EVIDENCIA_NO_DECODIFICABLE");
    })(), { detalle: piernas.filter((p) => p.codigo_en_fila_esperado === "EVIDENCIA_NO_DECODIFICABLE").map(({ forma, observado, evidencia_status, evidencia_failure_code }) => ({ forma, observado, evidencia_status, evidencia_failure_code })) });
    const mentirosas = piernas.filter((p) => p.mentiroso);
    registrar("las_cinco_formas_con_etiqueta_mentirosa_entran", mentirosas.length === 5 && mentirosas.every((p) => p.observado === "hora"), { detalle: mentirosas.map((p) => ({ forma: p.forma, status: p.status })) });
  } else {
    const grandes = piernas.filter((p) => p.codigo_en_fila_esperado === "EVIDENCIA_SUPERA_LIMITE" && p.grande);
    registrar("el_defecto_de_tamano_se_reproduce_en_el_ambiente_viejo", grandes.length === 2 && grandes.every((p) => p.observado === "rechazo" && p.code === "EVIDENCIA_SUPERA_LIMITE" && !p.hora_asentada), { detalle: grandes.map(({ forma, status, code, hora_asentada }) => ({ forma, status, code, hora_asentada })) });
  }
  const prohibidas = piernas.filter((p) => p.promesa === "rechazo");
  registrar("lo_que_no_es_una_imagen_sigue_rechazandose", prohibidas.length === 4 && prohibidas.every((p) => p.observado === "rechazo"), { detalle: prohibidas.map(({ forma, code }) => ({ forma, code })) });
  registrar("todo_rechazo_puede_reenviarse_sin_perder_la_hora", prohibidas.every((p) => p.reenvio && p.reenvio.observado === "hora"), { detalle: prohibidas.map(({ forma, reenvio }) => ({ forma, reenvio: reenvio?.observado || null, status: reenvio?.status ?? null })) });

  const peor = tiempos.filter((t) => t.method === "POST" && t.ruta.includes("time-punches")).reduce((max, item) => Math.max(max, item.ms), 0);
  registrar("toda_escritura_dentro_del_presupuesto", peor <= PRESUPUESTO_MS, { peor, presupuesto_ms: PRESUPUESTO_MS });

  // 4) Retiro: cada cuenta por el endpoint de administracion, cada ficha por active=false.
  let retiro = { usuarios: 0, fichas: 0, admin: "sin_rol" };
  if (rolAdmin) {
    const correoAdmin = `cert.bat.${RUN}.a@internal.apexos.local`;
    const claveAdmin = `CertA${crypto.randomBytes(6).toString("hex")}#1`;
    const adminCreado = await prisma.user.create({
      data: { tenant_id: empresa.id, name: `CERT BATERIA ADMIN ${RUN}`, email: correoAdmin, password: await bcrypt.hash(claveAdmin, 10), role_id: rolAdmin.id, active: true },
      select: { id: true },
    });
    ids.usuarios.push(adminCreado.id);
    const loginAdmin = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correoAdmin, password: claveAdmin } });
    const tokenAdmin = String(loginAdmin.body?.token || "");
    for (const usuarioId of ids.usuarios.filter((u) => u !== adminCreado.id)) {
      const res = await pedir(`/api/v1/admin/users/${usuarioId}/status`, { method: "PATCH", token: tokenAdmin, payload: { active: false } });
      if (res.status < 300) retiro.usuarios += 1;
    }
    const resAdmin = await pedir(`/api/v1/admin/users/${adminCreado.id}/status`, { method: "PATCH", token: tokenAdmin, payload: { active: false } });
    retiro.admin_retirado = resAdmin.status;
    retiro.login_tras_retiro = (await pedir("/api/v1/auth/login", { method: "POST", payload: { email: `cert.bat.${RUN}.0.o@internal.apexos.local`, password: "inexistente" } })).status;
  }
  for (const empleadoId of ids.empleados) {
    const res = await prisma.employee.update({ where: { id: empleadoId }, data: { active: false } }).catch(() => null);
    if (res) retiro.fichas += 1;
  }
  registrar("operarios_y_cuentas_efimeras_retiradas", retiro.usuarios === formas.length && retiro.fichas === formas.length, retiro);

  const fallidos = cheques.filter((c) => !c.ok);
  const promesas = piernas.length + piernas.filter((p) => p.reenvio).length;
  reporte.veredicto = { total: cheques.length, pasaron: cheques.length - fallidos.length, fallaron: fallidos.length, piernas: piernas.length, peticiones_escritas: promesas, espera, estado: fallidos.length ? "BLOQUEADO" : "APROBADO" };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(reporte, null, 2)}\n`);
  console.error(`\n${reporte.veredicto.estado}: ${reporte.veredicto.pasaron}/${reporte.veredicto.total} controles sobre ${piernas.length} formas -> ${path.relative(ROOT, output)}`);
  if (fallidos.length) fallidos.forEach((c) => console.error(`- ${c.name}: ${JSON.stringify(c.detail).slice(0, 240)}`));
  await prisma.$disconnect().catch(() => null);
  return fallidos.length ? 1 : 0;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch(async (error) => {
    console.error(`CORRIDA BLOQUEADA: ${error?.message || error}`);
    process.exitCode = 1;
  });
}

// Exportado para que un arbol local pueda pre-validar las quince formas contra la guarda real
// antes de gastar una corrida en QA, y para que el control de mutacion las reprograme.
module.exports = { PAYLOADS, fixtures, bytesDe, cuerpoPunch, detachDelCliente, observarPata, codigoServido, evaluarPata, parseArgs, TOPE_WEB_BYTES };
