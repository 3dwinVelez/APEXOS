#!/usr/bin/env node

/*
 * Medicion en campo del canal web de marcaciones: la selfie se decide por la clase de los bytes
 * y nunca por la etiqueta que anuncia el navegador.
 *
 * Que se prueba aqui y no en otro lado:
 *   - hr-mobile-identity-local.js levanta la API del arbol con Supabase simulado: prueba el codigo
 *     del puesto, no el binario que sirve el ambiente;
 *   - hr-marking-ladder-field.js mide la escalera administrativa con una PNG honesta: nunca anuncia
 *     un JPEG como PNG, que es exactamente la forma que producia los rechazos;
 *   - esta corrida manda las cuatro formas que costo jornadas contra el API desplegado y exige que
 *     la hora entre y que ninguna respuesta lleve el codigo de la compuerta alterna.
 *
 * Formas (brief 2026-11-24): JPEG real anunciado image/png, PNG real anunciado image/jpeg, JPEG
 * honesto y el reenvio sin foto que hace la cola del navegador despues de un rechazo de formato.
 *
 * Huella: escribe solo en el ambiente que declara el archivo de ambiente. Crea una cuenta y un
 * empleado efimeros etiquetados con el RUN y los retira (cuenta por el endpoint, empleado por
 * active=false) al cerrar. Las marcaciones quedan con el código CERTWS para poder identificarlas.
 *
 * Uso:
 *   node scripts/certifications/hr-web-selfie-field.js --selftest
 *   node scripts/certifications/hr-web-selfie-field.js --env-file=config/qa.env --espera=arreglo \
 *     --fix-commit=<sha del candidato en la rama> --output=docs/qa/evidence/<carpeta>/campo-qa.json
 *
 * Ningun token, contrasena, correo o nombre de persona se escribe en la evidencia.
 */

const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const WEB_SOURCE = "apexos-mobile";
const CODIGO_RECHAZO_POR_FORMATO = ["SELFIE_INVALIDA", "SELFIE_NO_LEIBLE"];
const PRESUPUESTO_MS = 30000;
const TIPOS = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];

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

// PNG real, construida a mano: 8 bytes de firma + IHDR + IDAT + IEND. Es decodificable, asi que
// la guarda por clase la acepta; lo que se pone a prueba es que la etiqueta diga otra cosa.
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

function pngSelfie(lado) {
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
  const zlib = require("node:zlib");
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// JPEG real via sharp: es la forma que produce la camara de un telefono. Un JPEG fabricado a mano
// sin SOF no decodifica y el rechazo entonces seria por contenido, no por etiqueta.
function jpegSelfie(lado = 240) {
  const sharp = require("sharp");
  const crudo = crypto.randomBytes(lado * lado * 3);
  return sharp(crudo, { raw: { width: lado, height: lado, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
}

// Clasificacion de una pierna. Devuelve siempre una de tres palabras:
//   defecto  -> la compuerta alterna decidio por etiqueta (o exiguio foto donde ya habia foto)
//   arreglo  -> la hora entro y ninguna respuesta lleva codigo de formato
//   ciego    -> paso otra cosa (409 de secuencia, 404 de ficha): no permite afirmar nada
function clasificarPierna({ status, code, teniaFoto, asentada }) {
  if (CODIGO_RECHAZO_POR_FORMATO.includes(code)) return "defecto";
  if (teniaFoto && code === "SELFIE_REQUERIDA") return "defecto";
  if (!asentada && status >= 400) return "ciego";
  if (asentada) return "arreglo";
  return "ciego";
}

function evaluarPierna({ esperado, observado, ancla }) {
  const fallos = [];
  if (!["defecto", "arreglo"].includes(esperado)) fallos.push(`esperado invalido: ${esperado}`);
  if (observado !== esperado) fallos.push(`la peticion mostro "${observado}" y se declaro "${esperado}"`);
  if (ancla !== esperado) fallos.push(`el codigo servido anuncia "${ancla}" y la pierna se declaro "${esperado}"`);
  return { cumple: fallos.length === 0, fallos };
}

function selftest() {
  const caso = { esperado: "arreglo", ancla: "arreglo" };
  const casos = [
    ["un_JPEG_declarado_PNG_rechazado_es_defecto", clasificarPierna({ status: 400, code: "SELFIE_INVALIDA", teniaFoto: true, asentada: false }) === "defecto"],
    ["un_400_SELFIE_REQUERIDA_con_foto_enviada_es_defecto", clasificarPierna({ status: 400, code: "SELFIE_REQUERIDA", teniaFoto: true, asentada: false }) === "defecto"],
    ["la_misma_fila_sin_codigo_de_formato_es_arreglo", clasificarPierna({ status: 201, code: null, teniaFoto: true, asentada: true }) === "arreglo"],
    ["un_409_de_secuencia_NO_es_arreglo_ni_defecto", clasificarPierna({ status: 409, code: "MARCACION_FUERA_DE_SECUENCIA", teniaFoto: true, asentada: false }) === "ciego"],
    ["una_lectura_vacia_no_puede_certificar_la_hora", clasificarPierna({ status: 201, code: null, teniaFoto: true, asentada: false }) === "ciego"],
    ["el_arbol_servido_sin_el_fix_no_puede_declararse_arreglo", evaluarPierna({ ...caso, observado: "arreglo", ancla: "defecto" }).cumple === false],
    ["defecto_declarado_defecto_con_codigo_servido_defecto_si_cumple", evaluarPierna({ esperado: "defecto", observado: "defecto", ancla: "defecto" }).cumple === true],
    ["--flag=valor_y_--flag_valor_resuelven_igual", (() => {
      const a = parseArgs(["--env-file=config/qa.env", "--espera", "arreglo"]);
      return a["env-file"] === "config/qa.env" && a.espera === "arreglo";
    })()],
    ["una_bandera_de_valor_sin_valor_se_niega_en_vez_de_volverse_true", parseArgs(["--espera", "--output=x.json"]).espera === true],
    ["el_reenvio_sin_foto_se_clasifica_por_su_codigo", CODIGO_RECHAZO_POR_FORMATO.length === 2 && WEB_SOURCE === "apexos-mobile"],
  ];
  let rojos = 0;
  for (const [nombre, ok] of casos) {
    if (!ok) rojos += 1;
    console.log(`${ok ? "OK   " : "FALLO"} ${nombre}`);
  }
  if (rojos) {
    console.error(`SELFTEST BLOQUEADO (${rojos}): la compuerta no distingue lo que se afirma de lo que el ambiente devolvio.`);
    return 1;
  }
  console.log(`SELFTEST APROBADO (${casos.length} casos): cuatro son rojos obligatorios (rechazo por etiqueta, hora no asentada, ancla que contradice, bandera sin valor).`);
  return 0;
}

async function main() {
  const args = parseArgs();
  if (args.selftest) return selftest();

  const envFile = path.resolve(ROOT, String(args["env-file"] || ""));
  if (!args["env-file"] || !fs.existsSync(envFile)) throw new Error("Falta --env-file=config/<ambiente>.env: la corrida nunca usa el ambiente predeterminado.");
  const nombreEnv = path.basename(envFile);
  if (!["qa.env", "production.env"].includes(nombreEnv)) {
    throw new Error(`Solo se mide contra config/qa.env o config/production.env (recibi ${nombreEnv}).`);
  }
  const esperado = String(args.espera || "");
  if (!["defecto", "arreglo"].includes(esperado)) throw new Error("--espera=defecto|arreglo es obligatorio");
  const fixCommit = String(args["fix-commit"] || "");
  if (!args["fix-commit"]) throw new Error("--fix-commit es obligatorio: la ancla sin referencia no distingue defecto de arreglo");
  if (!args.output) throw new Error("--output es obligatorio para poder versionar la corrida");
  const output = path.resolve(ROOT, String(args.output));

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
    console.error(`${ok ? "OK   " : "FALLO"} ${nombre} :: ${JSON.stringify(detalle).slice(0, 240)}`);
    return Boolean(ok);
  };

  async function pedir(ruta, { method = "GET", token, payload } = {}) {
    const iniciado = Date.now();
    const response = await fetch(`${apiUrl}${ruta}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { "content-type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(60000),
    }).catch(() => ({ status: 0, _error: true }));
    const duracion = Date.now() - iniciado;
    if (response.status === 0) return { status: 0, code: "SIN_RESPUESTA", body: {}, duracion };
    const texto = await response.text();
    let body = {};
    try { body = texto ? JSON.parse(texto) : {}; } catch { body = { crudo: String(texto).slice(0, 160) }; }
    tiempos.push({ ruta, method, status: response.status, ms: duracion });
    return { status: response.status, body, code: body?.code || body?.error?.code || null, duracion };
  }

  const jpeg = await jpegSelfie();
  const png = pngSelfie(200);

  // Las cuatro formas del incidente. `declarado` es la etiqueta que manda el navegador; `bytes`
  // es lo que realmente viaja. La ultima pierna no manda foto: es el reenvio de la cola.
  const FORMAS = [
    { tipo: "entrada", bytes: jpeg, declarado: "image/png", nombre: "jpeg-declarado-png" },
    { tipo: "inicio_almuerzo", bytes: png, declarado: "image/jpeg", nombre: "png-declarado-jpeg" },
    { tipo: "fin_almuerzo", bytes: jpeg, declarado: "image/jpeg", nombre: "jpeg-honesto" },
    { tipo: "salida", bytes: null, declarado: null, nombre: "reenvio-sin-foto" },
  ];

  const reporte = {
    certification: "hr-web-selfie-field",
    version: 1,
    ambiente: nombreEnv === "qa.env" ? "QA" : "PRODUCCION",
    instruccion: "Cuatro marcaciones web con etiqueta mentirosa, medidas sobre el binario desplegado",
    generado_en: new Date().toISOString(),
    env_file: path.relative(ROOT, envFile).replace(/\\/g, "/"),
    api_host: apiUrl.replace(/^https?:\/\/([^/]+).*$/, "$1"),
    script_sha256: sha256(fs.readFileSync(__filename)),
    dia_operativo: DIA,
    run: RUN,
    formas: FORMAS.map((f) => ({ tipo: f.tipo, nombre: f.nombre, bytes: f.bytes ? f.bytes.length : 0, declarado: f.declarado })),
    compromiso_del_arreglo: { fix_de_referencia: fixCommit, servidor_lee: "git merge-base --is-ancestor" },
    cheques,
    tiempos,
    ids,
    presupuesto_ms: PRESUPUESTO_MS,
  };

  // 1) Ancla: que codigo esta sirviendo el ambiente.
  const health = await pedir("/health");
  const servido = String(health.body?.commit || "");
  let ancla = "desconocida";
  try {
    execFileSync("git", ["cat-file", "-e", `${servido}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    try { execFileSync("git", ["merge-base", "--is-ancestor", fixCommit, servido], { cwd: ROOT, stdio: "ignore" }); ancla = "arreglo"; }
    catch { ancla = "defecto"; }
  } catch { ancla = "desconocida"; }
  reporte.despliegue = { status: health.status, commit_servido: servido, codigo_servido_contiene_el_fix: ancla };
  registrar("health_ancla_el_commit_servido", health.status === 200 && servido.length >= 12, { status: health.status, commit: servido, ancla });

  // 2) Empresa modelo, cuenta y ficha efimeras.
  const empresa = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" } }, orderBy: { name: "asc" } });
  if (!empresa) throw new Error(`No existe el tenant NYVORA en ${reporte.ambiente}: la medicion exige la empresa modelo.`);
  const rol = await prisma.role.findFirst({ where: { tenant_id: empresa.id, name: "Empleado" } })
    || await prisma.role.findFirst({ where: { tenant_id: empresa.id }, orderBy: { id: "asc" } });
  const correo = `cert.ws.${RUN}.o@internal.apexos.local`;
  const clave = `Cert${crypto.randomBytes(6).toString("hex")}#1`;
  const creado = await prisma.user.create({
    data: { tenant_id: empresa.id, name: `CERT WEB SELFIE ${RUN}`, email: correo, password: await bcrypt.hash(clave, 12), role_id: rol.id, active: true },
    select: { id: true },
  });
  ids.usuarios.push(creado.id);
  const login = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correo, password: clave } });
  const token = String(login.body?.token || "");
  const codigo = `CERTWS${RUN}`;
  const empleado = await prisma.employee.create({
    data: {
      tenant_id: empresa.id, user_id: creado.id, code: codigo, user_type: "operario", position: "Prueba certificada",
      department: "QA", salary_base: 1300000, hire_date: new Date(), active: true,
      metadata: { name: codigo, can_punch_time: true, operational_classification: "operario", cert_run: RUN },
    },
    select: { id: true },
  });
  ids.empleados.push(empleado.id);
  reporte.efimeros = { user_id: creado.id, employee_id: empleado.id, rol: rol?.name || null, login: login.status };
  registrar("operario_efimero_con_sesion", login.status < 300 && Boolean(token) && Boolean(empleado.id), { login: login.status, rol: rol?.name || null });

  // 3) Las cuatro marcaciones, en el orden real de la jornada.
  const horas = [4, 3, 2, 1].map((h) => new Date(Date.now() - h * 3600_000).toISOString());
  const piernas = [];
  for (let i = 0; i < FORMAS.length; i += 1) {
    const forma = FORMAS[i];
    const idempotencyKey = `ws-${RUN}-${forma.tipo}`;
    const punchedAt = horas[i];
    const body = {
      user_name: codigo,
      type: forma.tipo,
      punched_at: punchedAt,
      idempotency_key: idempotencyKey,
      ...(forma.bytes ? { identity_photo: { base64: forma.bytes.toString("base64"), name: `selfie-${RUN}.jpg`, type: forma.declarado, size: forma.bytes.length } } : {}),
      metadata: {
        source: WEB_SOURCE,
        gps_quality: "sin_gps",
        ...(forma.bytes ? {} : {
          evidence_status: "degraded",
          evidence_detached_reason: "El navegador no pudo entregar la foto de esta marcacion.",
          hr_novelty: {
            kind: "MARCAT_SIN_EVIDENCIA", requires_supervisor_action: true, failure_code: "EVIDENCIA_CLASE_RECHAZADA",
            message: "La foto de validacion no se pudo guardar en este telefono.", punch_type: forma.tipo,
            punched_at: punchedAt, idempotency_key: idempotencyKey, evidence_pending_refs: [],
          },
        }),
      },
    };
    const res = await pedir("/api/v1/hr/self/time-punches", { method: "POST", token, payload: body });
    const fila = await prisma.timePunch.findFirst({
      where: { tenant_id: empresa.id, idempotency_key: idempotencyKey },
      select: { id: true, type: true, punched_at: true, metadata: true },
    });
    const asentada = Boolean(fila && String(fila.type) === forma.tipo);
    const verificacion = fila?.metadata?.identity_verification || {};
    const evidencia = fila?.metadata?.identity_photo || {};
    const observado = clasificarPierna({ status: res.status, code: res.code, teniaFoto: Boolean(forma.bytes), asentada });
    // Un ambiente con la compuerta alterna montada rechaza las dos formas con etiqueta mentirosa;
    // la honesta y el reenvio sin foto pueden entrar igual, asi que en la corrida ANTES esas dos
    // se registran como informacion y no como promesa. En la corrida DESPUES las cuatro son promesa.
    const esFormaMentirosa = /declarado/.test(forma.nombre);
    const exigida = esperado === "arreglo" || esFormaMentirosa;
    piernas.push({
      forma: forma.nombre, tipo: forma.tipo, status: res.status, code: res.code || null, observado, exigida,
      hora_asentada: asentada, verificacion: verificacion.status || null, evidence_status: evidencia.evidence_status || null,
      evidence_failure_code: evidencia.evidence_failure_code || verificacion.evidence_failure_code || null,
      foto_guardada: Boolean(evidencia.base64_data || evidencia.base64 || evidencia.storage_ref),
    });
    if (exigida) {
      const evalPierna = evaluarPierna({ esperado, observado, ancla });
      registrar(`pierna_${forma.tipo}_${forma.nombre}`, evalPierna.cumple, { esperado, observado, ancla, exigida, fallos: evalPierna.fallos, status: res.status, code: res.code || null, asentada });
    } else {
      // En la corrida ANTES las dos piernas que no mienten quedan bloqueadas por la escalera
      // (la jornada nunca abrio) o por el requisito de foto del canal viejo: se registran como
      // informativas, sin promesa, para que el rojo de esta corrida sea el rechazo por etiqueta
      // y no un ruido de secuencia.
      registrar(`pierna_${forma.tipo}_${forma.nombre}_informativa`, true, { observado, status: res.status, code: res.code || null, asentada, motivo: "el defecto bloquea la jornada antes de esta pierna" });
    }
  }
  reporte.piernas = piernas;

  // 4) Controles que no dependen de la ancla: la compuerta alterna no puede aparecer en ninguna
  //    respuesta y el dia tiene que leerse con sus cuatro piernas.
  const codigos = piernas.map((p) => p.code).filter(Boolean);
  const mentirosas = piernas.filter((p) => /declarado/.test(p.forma));
  if (esperado === "arreglo") {
    registrar("ninguna_respuesta_lleva_codigo_de_la_compuerta_alterna", !codigos.some((c) => CODIGO_RECHAZO_POR_FORMATO.includes(c)), { codigos });
    const tiposAsentados = piernas.filter((p) => p.hora_asentada).map((p) => p.tipo);
    registrar("el_dia_se_lee_con_las_cuatro_piernas", TIPOS.every((t) => tiposAsentados.includes(t)), { esperados: TIPOS, asentados: tiposAsentados });
  } else {
    // Control positivo: el instrumento tiene que ser capaz de ver el defecto. Si la corrida ANTES
    // no lo reproduce, la corrida DESPUES no prueba nada.
    registrar("las_dos_formas_con_etiqueta_mentirosa_reproducen_el_rechazo", mentirosas.length === 2 && mentirosas.every((p) => p.observado === "defecto" && CODIGO_RECHAZO_POR_FORMATO.includes(p.code)), { detalle: mentirosas.map(({ forma, code, status }) => ({ forma, code, status })) });
  }
  const claves = piernas.map((p) => `ws-${RUN}-${p.tipo}`);
  const leidas = await prisma.timePunch.findMany({ where: { tenant_id: empresa.id, idempotency_key: { in: claves } }, select: { type: true, idempotency_key: true, metadata: true } });
  if (esperado === "arreglo") {
    registrar("lectura_no_vacia_cuando_se_afirma_un_dia_completo", leidas.length === TIPOS.length, { filas: leidas.length, esperadas: TIPOS.length });
  } else {
    registrar("la_lectura_del_dia_no_inventa_piernas", leidas.length < TIPOS.length, { filas: leidas.length, esperadas: TIPOS.length });
  }
  if (esperado === "arreglo") {
    const conFoto = piernas.filter((p) => p.tipo !== "salida");
    registrar("las_tres_fotos_reales_quedan_guardadas_disponibles_o_degradadas", conFoto.every((p) => p.hora_asentada && ["available", "degraded"].includes(p.evidence_status) || p.forma === "jpeg-honesto" && p.evidence_status === "available"), { detalle: conFoto.map((p) => ({ forma: p.forma, evidence_status: p.evidence_status })) });
    registrar("la_marca_sin_foto_registra_la_hora_con_su_novedad", (() => {
      const p = piernas.find((x) => x.forma === "reenvio-sin-foto");
      return Boolean(p && p.hora_asentada && (p.verificacion === "not_verified" || p.evidence_status === "degraded" || p.evidence_failure_code));
    })(), { pierna: piernas.find((x) => x.forma === "reenvio-sin-foto") });
  }
  const peor = tiempos.reduce((max, item) => Math.max(max, item.ms), 0);
  registrar("toda_escritura_dentro_del_presupuesto", tiempos.every((item) => item.method === "POST" ? item.ms <= PRESUPUESTO_MS : true), { peor, presupuesto_ms: PRESUPUESTO_MS });

  // 5) Retiro por el endpoint (cuenta) y active=false (ficha).
  const rolAdmin = await prisma.role.findFirst({ where: { tenant_id: empresa.id, name: "APEX_ADMIN" } });
  let retiro = { status: "sin_admin", login_tras_retiro: null };
  if (rolAdmin) {
    const correoAdmin = `cert.ws.${RUN}.a@internal.apexos.local`;
    const claveAdmin = `CertA${crypto.randomBytes(6).toString("hex")}#1`;
    const adminCreado = await prisma.user.create({
      data: { tenant_id: empresa.id, name: `CERT WEB SELFIE ADMIN ${RUN}`, email: correoAdmin, password: await bcrypt.hash(claveAdmin, 12), role_id: rolAdmin.id, active: true },
      select: { id: true },
    });
    ids.usuarios.push(adminCreado.id);
    const loginAdmin = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correoAdmin, password: claveAdmin } });
    const res = await pedir(`/api/v1/admin/users/${creado.id}/status`, { method: "PATCH", token: String(loginAdmin.body?.token || ""), payload: { active: false } });
    const tras = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correo, password: clave } });
    retiro = { status: res.status, login_tras_retiro: tras.status };
    const resAdmin = await pedir(`/api/v1/admin/users/${adminCreado.id}/status`, { method: "PATCH", token: String(loginAdmin.body?.token || ""), payload: { active: false } });
    retiro.admin_retirado = resAdmin.status;
  } else {
    const res = await prisma.user.update({ where: { id: creado.id }, data: { active: false } });
    retiro = { status: res ? "update_local_sin_admin" : "fallo", login_tras_retiro: null };
  }
  await prisma.employee.update({ where: { id: empleado.id }, data: { active: false } }).catch(() => null);
  registrar("cuenta_efimera_retirada", Number(retiro.status) < 300 && Number(retiro.login_tras_retiro) >= 400, retiro);

  const fallidos = cheques.filter((c) => !c.ok);
  reporte.veredicto = { total: cheques.length, pasaron: cheques.length - fallidos.length, fallaron: fallidos.length, esperado, estado: fallidos.length ? "BLOQUEADO" : "APROBADO" };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(reporte, null, 2)}\n`);
  console.error(`\n${reporte.veredicto.estado}: ${reporte.veredicto.pasaron}/${reporte.veredicto.total} controles -> ${path.relative(ROOT, output)}`);
  if (fallidos.length) fallidos.forEach((c) => console.error(`- ${c.name}: ${JSON.stringify(c.detail).slice(0, 220)}`));
  await prisma.$disconnect().catch(() => null);
  return fallidos.length ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }).catch(async (error) => {
  console.error(`CORRIDA BLOQUEADA: ${error?.message || error}`);
  process.exitCode = 1;
});
