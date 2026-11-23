#!/usr/bin/env node

/*
 * Medicion en campo del paquete acumulado de Talento Humano (maestro de bancos y cuenta de pago,
 * liquidacion de retiro con revision de dias y recibo PDF, periodo de nomina, horarios unificados y
 * marcacion web con selfie) contra el API desplegado en QA, con la empresa modelo NYVORA.
 *
 * No sustituye las certificaciones locales de cada paquete: prueba el binario que sirve el ambiente.
 * Por eso el ancla de build es bloqueante: si el commit servido no trae los blobs HR del candidato,
 * la corrida aborta en vez de medir otra cosa y llamarle verde.
 *
 * Las cuentas se crean con el propio servicio de administracion del producto (admin.createUser) y se
 * retiran por endpoint, nunca por UPDATE: es el idioma ya probado en QA (hr-marking-gate-qa.js).
 * Escribir exige la bandera explicita --escribe-en-qa=SI; con NO la corrida solo lee y las piernas
 * de estado final se reportan NO_APLICABLE en vez de verdes.
 */
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const CANDIDATO = process.env.CANDIDATO_HR || "54cabeb3";

// Rutas que a proposito NO viajan con este frente: cada una es contenido de otro frente, con su
// propio manifiesto de alcance y su dueo. La paridad las excluye por nombre; cualquier otra
// divergencia sigue siendo un FALLO. Con el candidato fundido sobre el tip actual de main la lista
// queda vacia: el ambiente sirve el tip de develop y las diez rutas ancla son byte a byte las del
// candidato, asi que un verde aqui no puede estar comprando una exclusion.
const EXCLUIDOS_DECLARADOS = {};

function argFrom(name) {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
}
const arg = (name) => String(argFrom(name) || "");
const has = (name) => process.argv.includes(`--${name}`);
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

// Los blobs que definen el producto medido: se comparan ruta por ruta entre el arbol servido y el
// candidato. Es la unica forma de afirmar que QA corre lo mismo que va a subir a main.
const RUTAS_ANCLA = [
  "apps/api/src/modules/hr/banks.js",
  "apps/api/src/modules/hr/webPunchSelfie.js",
  "apps/api/src/modules/hr/payrollPeriod.js",
  "apps/api/src/modules/hr/payrollReceiptPdf.js",
  "apps/api/src/modules/hr/terminationBenefits.js",
  "apps/api/src/modules/hr/terminationDayReviews.js",
  "apps/api/src/modules/hr/routes.js",
  "apps/api/src/modules/hr/service.js",
  "apps/api/src/modules/hr/schema.js",
  "apps/web/app/dashboard/talento-humano/bancos/page.tsx"
];

const IDS_PIERNAS = [
  "ancla_build", "paridad_blobs_hr", "bancos_por_defecto", "banco_efimero_alta_lectura",
  "banco_rechaza_codigo_corto", "banco_rechaza_swift_invalido", "banco_duplicado_409",
  "escritura_banco_preserva_otras_configuraciones", "cuenta_pago_empleado_resuelve_banco",
  "cuenta_pago_rechaza_banco_inactivo", "cuenta_pago_rechaza_cuenta_sin_banco",
  "liquidacion_preview_sin_persistir", "revision_dias_lee_y_valida_clasificacion",
  "nomina_cierres_lee_y_valida", "mallas_unificadas_ambas_lecturas", "contencion_sin_P2028",
  "mallas_retiradas_por_estado",
  "marcacion_sin_horario_responde_200_vacio", "punch_sin_selfie_400", "punch_selfie_no_imagen_400",
  "punch_horario_ajeno_403", "punch_con_selfie_valida", "punch_idempotente_reenvio",
  "rbac_contraste_roles_sobre_nomina", "aislamiento_tenant_lectura", "liquidacion_completa_con_recibo_pdf"
];

// Cada pierna se evalua con el mismo predicado que usa la corrida real: si un predicado no puede
// fallar, el selftest lo deja rojo.
function evalPierna(id, esperado, observado, detalle) {
  return { id, esperado, observado, cumple: esperado === observado, detalle: String(detalle || "").slice(0, 500) };
}

function selftest() {
  const casos = IDS_PIERNAS.map((id) => {
    const verde = evalPierna(id, "OK", "OK", "");
    const rojo = evalPierna(id, "OK", "FALLO", "");
    return { id, verde_cumple: verde.cumple === true, distingue_rojo: rojo.cumple === false };
  });
  const opcionalNa = evalPierna("liquidacion_completa_con_recibo_pdf", "OK", "NO_APLICABLE", "");
  casos.find((c) => c.id === "liquidacion_completa_con_recibo_pdf").distingue_no_aplicable = opcionalNa.cumple === false;
  return casos;
}

// PNG real de ruido: zlib no comprime bytes aleatorios, asi que la foto pesa lo que pesa una selfie
// de camara. Con un stub de 68 bytes la pierna de tamano seria decorativa.
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
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", require("node:zlib").deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

(async () => {
  if (has("selftest")) {
    let rojos = 0;
    for (const caso of selftest()) {
      const ok = caso.verde_cumple && caso.distingue_rojo && caso.distingue_no_aplicable !== false;
      if (!ok) rojos += 1;
      console.log(`${ok ? "OK   " : "FALLO"} ${caso.id} verde=${caso.verde_cumple} distingue_rojo=${caso.distingue_rojo}`);
    }
    if (rojos) {
      console.error(`SELFTEST BLOQUEADO (${rojos}): hay piernas que no distinguen lo observado de lo declarado.`);
      process.exitCode = 1;
      return;
    }
    console.log(`SELFTEST APROBADO: ${selftest().length} piernas, cada una cumple solo cuando lo observado coincide con lo declarado y falla ante la observacion contraria.`);
    return;
  }

  const envFile = path.resolve(ROOT, arg("env-file") || "config/qa.env");
  if (!fs.existsSync(envFile)) throw new Error("--env-file apunta a un archivo inexistente");
  if (path.basename(envFile) !== "qa.env") throw new Error(`Esta medicion es de ambiente QA (recibi ${path.basename(envFile)}).`);
  require("../load-env")(envFile);
  const normalizado = (v) => String(v || "").trim().toLowerCase();
  if (![process.env.APP_ENV, process.env.TARGET_ENV].some((v) => normalizado(v) === "qa")) {
    throw new Error("La certificacion solo puede ejecutarse con configuracion QA.");
  }
  const refEsperado = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
  const dbUrl = String(process.env.DATABASE_URL || "");
  if (!refEsperado) throw new Error("EXPECTED_SUPABASE_PROJECT_REF es obligatorio: esta certificacion escribe en la empresa modelo.");
  if (!dbUrl.includes(refEsperado)) throw new Error(`DATABASE_URL no pertenece al project ref esperado (${refEsperado}); se aborta sin conectar.`);
  const apiUrl = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!apiUrl) throw new Error("El archivo de ambiente no declara NEXT_PUBLIC_API_URL");
  const escribe = arg("escribe-en-qa");
  const modoEscritura = escribe === "SI";
  if (!modoEscritura && escribe !== "NO") throw new Error("--escribe-en-qa=SI|NO es obligatorio: sin la bandera explicita no se toca el ambiente.");
  // Las piernas de estado final solo pueden aspirar a verde cuando se autorizo escribir; en la
  // corrida de solo lectura su verde declarado es NO_APLICABLE, nunca un verde prestado.
  const esperarEscritura = modoEscritura ? "OK" : "NO_APLICABLE";

  const cheques = [];
  const registrar = (caso) => {
    cheques.push(caso);
    const marca = caso.cumple ? "OK  " : caso.observado === "NO_APLICABLE" ? "N/A " : "FALLO";
    console.error(`${marca} ${caso.id} :: ${caso.detalle}`);
  };

  async function pedir(ruta, { method = "GET", token, payload, raw = false } = {}) {
    const started = Date.now();
    const response = await fetch(`${apiUrl}${ruta}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { "content-type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(120_000)
    });
    if (raw) return { status: response.status, headers: Object.fromEntries(response.headers.entries()), buffer: Buffer.from(await response.arrayBuffer()), elapsed: Date.now() - started };
    const texto = await response.text();
    let cuerpo = {};
    try { cuerpo = texto ? JSON.parse(texto) : {}; } catch { cuerpo = { raw: texto.slice(0, 160) }; }
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), cuerpo, elapsed: Date.now() - started };
  }
  const resumen = (r) => `${r.status} ${r.cuerpo?.code || ""} ${String(r.cuerpo?.error || r.cuerpo?.message || "").slice(0, 80)}`.replace(/\s+/g, " ").trim();
  const filasDe = (c) => (Array.isArray(c) ? c : c?.items || c?.data || c?.results || []);

  const reporte = {
    certificacion: "hr-paquete-main-qa",
    version: 1,
    rol_evidencia: "field_measurement_qa",
    ambiente: "QA",
    empresa_modelo: "NYVORA",
    generado_en: new Date().toISOString(),
    api_host: apiUrl.replace(/^https?:\/\/([^/]+).*$/, "$1"),
    project_ref: refEsperado,
    script_sha256: sha256(fs.readFileSync(__filename)),
    candidato_ref: CANDIDATO,
    escribe_en_qa: modoEscritura,
    piernas: []
  };

  // 1. Ancla de build: que commit sirve QA y si ese commit trae los blobs HR del candidato.
  const health = await pedir("/health");
  const servido = String(health.cuerpo.commit || "");
  const gitOk = (args) => { try { execFileSync("git", args, { cwd: ROOT, stdio: "ignore" }); return true; } catch { return false; } };
  const blob = (ref, p) => { try { return execFileSync("git", ["rev-parse", `${ref}:${p}`], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return "(ausente)"; } };
  reporte.despliegue = { status: health.status, commit_servido: servido, modulos: health.cuerpo.modules, version: health.cuerpo.version };
  const igualdades = RUTAS_ANCLA.map((p) => {
    const s = blob(servido, p);
    const c = blob(CANDIDATO, p);
    return { ruta: p, servido: s, candidato: c, igual: /^[0-9a-f]{40}$/.test(s) && s === c };
  });
  const pares = igualdades.filter((f) => f.igual).length;
  registrar(evalPierna("ancla_build", "OK",
    health.status === 200 && servido.length >= 12 && gitOk(["cat-file", "-e", `${servido}^{commit}`]) ? "OK" : "FALLO",
    `GET /health -> ${health.status}, commit servido ${servido || "(vacio)"}, resoluble en el arbol local: ${gitOk(["cat-file", "-e", `${servido}^{commit}`])}`));
  const divergentes = igualdades.filter((f) => !f.igual);
  const sinDeclarar = divergentes.filter((f) => !EXCLUIDOS_DECLARADOS[f.ruta]);
  const listaDivergentes = divergentes.map((f) => {
    const causa = EXCLUIDOS_DECLARADOS[f.ruta] ? ` [excluido: ${EXCLUIDOS_DECLARADOS[f.ruta]}]` : " [SIN DECLARAR]";
    return `${f.ruta} (${f.servido.slice(0, 8)} vs ${f.candidato.slice(0, 8)})${causa}`;
  }).join("; ");
  const cierre = divergentes.length === 0 ? ""
    : sinDeclarar.length > 0 ? " | hay una divergencia sin declarar: el arbol servido no es el que se promociona"
    : " | la unica divergencia es el frente excluido por manifiesto";
  const paridadDetalle = `${pares}/${RUTAS_ANCLA.length} rutas HR del arbol servido son byte a byte las del candidato ${CANDIDATO}`
    + (divergentes.length ? ` | divergen: ${listaDivergentes}` : "") + cierre;
  registrar(evalPierna("paridad_blobs_hr", "OK", sinDeclarar.length === 0 ? "OK" : "FALLO", paridadDetalle));

  // 2. Empresa modelo, roles y cuentas efimeras creadas por el propio producto.
  const prisma = require("../../apps/api/src/core/prisma");
  const admin = require("../../apps/api/src/modules/admin/service");
  const empresa = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" } }, orderBy: { name: "asc" } });
  if (!empresa) throw new Error("No existe la empresa modelo NYVORA en QA.");
  reporte.tenant = { id: empresa.id, nombre: empresa.name, modulos_activos: (empresa.active_modules || []).length };

  const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const PASSWORD = `Qa-Paq-${crypto.randomBytes(6).toString("hex")}#26`;
  const EMAIL_JEFE = `qa.paquete.jefe.${RUN_ID}@nyvora.test`;
  const EMAIL_OPERARIO = `qa.paquete.fijado.${RUN_ID}@nyvora.test`;
  const EMAIL_SIN_HORARIO = `qa.paquete.libre.${RUN_ID}@nyvora.test`;
  const EMAIL_LECTOR = `qa.paquete.lector.${RUN_ID}@nyvora.test`;

  const roles = await admin.listRoles(empresa.id, {}, "APEX_ADMIN");
  const permisosDe = (rol) => {
    const lista = Array.isArray(rol?.permissions) ? rol.permissions : rol?.permissions?.permissions || [];
    return new Set(lista.map((p) => `${String(p.module || "").toLowerCase()}:${String(p.action || "").toLowerCase()}`));
  };
  const modulosDe = (rol) => [...new Set([...permisosDe(rol)].map((p) => p.split(":")[0]))].slice(0, 14);
  const supervisor = roles.find((r) => { const s = permisosDe(r); return s.has("hr:write") && s.has("payroll:write"); })
    || roles.find((r) => r.name === "Administrador de empresa") || roles.find((r) => r.name === "APEX_ADMIN");
  const marcaciones = roles.find((r) => r.name === "Empleado marcaciones") || roles.find((r) => permisosDe(r).has("time_tracking:write"));
  const lector = roles.find((r) => { const s = permisosDe(r); return s.has("hr:read") && !s.has("hr:write"); });
  if (!supervisor || !marcaciones) throw new Error(`Faltan roles en NYVORA QA: supervisor=${supervisor?.name || "no"} y marcaciones=${marcaciones?.name || "no"}.`);
  reporte.roles_de_medicion = [
    { nombre: supervisor.name, modulos: modulosDe(supervisor) },
    { nombre: marcaciones.name, modulos: modulosDe(marcaciones) },
    lector ? { nombre: lector.name, modulos: modulosDe(lector) } : null
  ].filter(Boolean);

  const ficha = (sufijo, clasificacion) => ({
    name: `Paquete ${sufijo}`, first_names: "Paquete", last_names: sufijo, password: PASSWORD,
    company: "Nyvora", department: "QA", position: "Empleado de pruebas",
    operational_classification: clasificacion, require_password_change: false
  });
  let jefe = null, operario = null, sinHorario = null, lectora = null;
  if (modoEscritura) {
    jefe = await admin.createUser(empresa.id, { ...ficha("jefe", "administrativo"), email: EMAIL_JEFE, role_id: supervisor.id, document: `QPJ${RUN_ID}`, code: `QA-PQ-J-${RUN_ID}`, can_punch_time: false, can_be_assigned_routes: false });
    operario = await admin.createUser(empresa.id, { ...ficha("fijado", "operario"), email: EMAIL_OPERARIO, role_id: marcaciones.id, document: `QPF${RUN_ID}`, code: `QA-PQ-F-${RUN_ID}`, can_punch_time: true, can_be_assigned_routes: true });
    sinHorario = await admin.createUser(empresa.id, { ...ficha("libre", "operario"), email: EMAIL_SIN_HORARIO, role_id: marcaciones.id, document: `QPL${RUN_ID}`, code: `QA-PQ-L-${RUN_ID}`, can_punch_time: true, can_be_assigned_routes: true });
    if (lector) lectora = await admin.createUser(empresa.id, { ...ficha("lector", "administrativo"), email: EMAIL_LECTOR, role_id: lector.id, document: `QPR${RUN_ID}`, code: `QA-PQ-R-${RUN_ID}`, can_punch_time: false, can_be_assigned_routes: false });
    reporte.cuentas_efimeras = { jefe: jefe?.id || null, operario: operario?.id || null, sin_horario: sinHorario?.id || null, lector: lectora?.id || null };
  }
  const tokens = {};
  const correos = { jefe: EMAIL_JEFE, operario: EMAIL_OPERARIO, sin_horario: EMAIL_SIN_HORARIO, lector: EMAIL_LECTOR };
  const creadas = { jefe, operario, sin_horario: sinHorario, lector: lectora };
  for (const [clave, correo] of Object.entries(correos)) {
    if (!creadas[clave]) continue;
    const r = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correo, password: PASSWORD } });
    if (r.cuerpo?.token) tokens[clave] = String(r.cuerpo.token);
  }
  const token = tokens.jefe || "";
  if (modoEscritura && !token) throw new Error("QA no devolvio sesion del supervisor efimero; la medicion se aborta en vez de adivinarla.");
  reporte.sesiones_obtenidas = Object.keys(tokens);

  let idEmpleadoOperario = null;
  let idEmpleadoLibre = null;
  if (tokens.operario) {
    const self = await pedir("/api/v1/hr/self", { token: tokens.operario });
    idEmpleadoOperario = Number(self.cuerpo?.id || self.cuerpo?.employee?.id || 0) || null;
  }
  if (tokens.sin_horario) {
    const self = await pedir("/api/v1/hr/self", { token: tokens.sin_horario });
    idEmpleadoLibre = Number(self.cuerpo?.id || self.cuerpo?.employee?.id || 0) || null;
  }
  reporte.empleado_operario_id = idEmpleadoOperario;
  reporte.empleado_sin_horario_id = idEmpleadoLibre;
  // La fecha de ingreso real de la ficha manda el tramo de retiro: adivinarla producía un 422 de
  // dominio (RETIRO_ANTERIOR_INGRESO) que el arnés leía como defecto de producto.
  let fechaIngresoOperario = null;
  if (idEmpleadoOperario) {
    const ficha = await pedir(`/api/v1/talento-humano/empleados/${idEmpleadoOperario}`, { token });
    fechaIngresoOperario = String(ficha.cuerpo?.hire_date || ficha.cuerpo?.fecha_ingreso || "").slice(0, 10) || null;
  }
  const masAlla = (fecha, dias) => {
    const d = new Date(`${fecha}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  };
  const FECHA_RETIRO = fechaIngresoOperario ? masAlla(fechaIngresoOperario, 30) : "";
  const FECHA_DIA_REVISADO = fechaIngresoOperario ? masAlla(fechaIngresoOperario, 29) : "";
  reporte.tramo_de_retiro_medido = { ingreso: fechaIngresoOperario, retiro: FECHA_RETIRO, dia_revisado: FECHA_DIA_REVISADO };

  // 3. Maestro de bancos: defaults, alta efimera, validaciones y ausencia de dao colateral.
  const bancos0 = await pedir("/api/v1/talento-humano/bancos", { token: token || tokens.operario });
  const codes = filasDe(bancos0.cuerpo).map((b) => String(b.code));
  const defaults = ["001", "007", "051"].every((c) => codes.includes(c));
  registrar(evalPierna("bancos_por_defecto", "OK", bancos0.status === 200 && defaults ? "OK" : "FALLO",
    `GET /talento-humano/bancos -> ${resumen(bancos0)} (${filasDe(bancos0.cuerpo).length} filas; defaults 001/007/051 presentes: ${defaults})`));

  const configAntes = await prisma.tenant.findUnique({ where: { id: empresa.id }, select: { config: true } });
  const sinBancos = (cfg) => JSON.stringify(Object.fromEntries(Object.keys(cfg || {}).filter((k) => k !== "hr_banks").sort().map((k) => [k, cfg[k]])));
  const valorAntes = sinBancos(configAntes?.config);

  // El codigo efimero no se busca en una lista fija: cada corrida deja filas inactivas en el maestro y
  // una lista corta se agota, lo que hunde en cascada las cuatro piernas que dependen de la alta.
  const libres = [];
  for (let n = 915; n <= 999 && libres.length < 2; n += 1) {
    const c = String(n);
    if (!codes.includes(c)) libres.push(c);
  }
  const codeNuevo = libres[0] || "";
  const nombreBanco = `CERT QA ${RUN_ID}`;
  if (modoEscritura && codeNuevo) {
    const alta = await pedir("/api/v1/talento-humano/bancos", { method: "POST", token, payload: { code: codeNuevo, name: nombreBanco, swift: "" } });
    const tras = await pedir("/api/v1/talento-humano/bancos", { token });
    const fila = filasDe(tras.cuerpo).find((b) => String(b.code) === codeNuevo);
    registrar(evalPierna("banco_efimero_alta_lectura", esperarEscritura, alta.status < 300 && fila && String(fila.name) === nombreBanco ? "OK" : "FALLO",
      `POST /talento-humano/bancos -> ${resumen(alta)} (code ${codeNuevo}); relectura: ${fila ? `fila presente, activa=${fila.active}` : "sin fila"} en ${filasDe(tras.cuerpo).length} filas`));
    const dup = await pedir("/api/v1/talento-humano/bancos", { method: "POST", token, payload: { code: codeNuevo, name: `${nombreBanco} dup` } });
    registrar(evalPierna("banco_duplicado_409", esperarEscritura, dup.status === 409 ? "OK" : "FALLO",
      `POST repetido del code ${codeNuevo} -> ${resumen(dup)} (409 esperado: el codigo nacional identifica al banco y no se cambia)`));
  } else {
    registrar(evalPierna("banco_efimero_alta_lectura", esperarEscritura, modoEscritura ? "FALLO" : "NO_APLICABLE",
      modoEscritura ? "no se resolvio un codigo nacional libre en 9xx" : "corrida con --escribe-en-qa=NO: pierna de alta no ejecutada"));
    registrar(evalPierna("banco_duplicado_409", esperarEscritura, modoEscritura ? "FALLO" : "NO_APLICABLE", "sin banco efimero que duplicar"));
  }

  const malo = await pedir("/api/v1/talento-humano/bancos", { method: "POST", token: token || tokens.operario, payload: { code: "12", name: `CERT MAL ${RUN_ID}` } });
  const trasMalo = await pedir("/api/v1/talento-humano/bancos", { token: token || tokens.operario });
  registrar(evalPierna("banco_rechaza_codigo_corto", "OK",
    malo.status >= 400 && malo.status < 500 && !filasDe(trasMalo.cuerpo).some((b) => String(b.name || "") === `CERT MAL ${RUN_ID}`) ? "OK" : "FALLO",
    `POST code "12" -> ${resumen(malo)} y el maestro no conserva la fila (rechazo en schema, sin escritura)`));

  const swift = await pedir("/api/v1/talento-humano/bancos", { method: "POST", token: token || tokens.operario, payload: { code: "921", name: `CERT SWIFT ${RUN_ID}`, swift: "AB12CD34" } });
  registrar(evalPierna("banco_rechaza_swift_invalido", "OK", swift.status >= 400 && swift.status < 500 ? "OK" : "FALLO",
    `POST swift "AB12CD34" (digitos dentro del bloque de letras) -> ${resumen(swift)} (el patron exige 6 letras + 2 alfanumericos)`));

  const configDespues = await prisma.tenant.findUnique({ where: { id: empresa.id }, select: { config: true } });
  const valorDespues = sinBancos(configDespues?.config);
  registrar(evalPierna("escritura_banco_preserva_otras_configuraciones", esperarEscritura,
    valorAntes === valorDespues ? (modoEscritura ? "OK" : "NO_APLICABLE") : "FALLO",
    `claves de Tenant.config distintas de hr_banks, antes y despues de tocar el maestro, byte a byte iguales: ${valorAntes === valorDespues} (${Object.keys(configAntes?.config || {}).length} claves -> ${Object.keys(configDespues?.config || {}).length} claves)${modoEscritura ? "" : " | corrida de solo lectura, no hubo escritura que preservar"}`));

  // 4. Cuenta de pago del empleado, gobernada por el maestro.
  // Banco que se retira para medir la asignacion: nunca puede ser el que la ficha ya tiene (el producto
  // conserva a proposito el banco vigente de una ficha cuando ese banco sale de servicio) ni uno del
  // maestro preexistente (retirarlo seria dao colateral sobre datos de la empresa modelo).
  const codeRetirado = libres[1] || "";
  const nombreRetirado = `CERT QA RETIRADO ${RUN_ID}`;
  if (modoEscritura && idEmpleadoOperario && codeNuevo) {
    const cuenta = String(1380000 + Number(RUN_ID.slice(8, 14)));
    const patch = await pedir(`/api/v1/talento-humano/empleados/${idEmpleadoOperario}`, { method: "PATCH", token, payload: { bank_code: codeNuevo, bank_account_code: cuenta } });
    const leido = await pedir(`/api/v1/talento-humano/empleados/${idEmpleadoOperario}`, { token });
    const md = leido.cuerpo?.metadata || {};
    registrar(evalPierna("cuenta_pago_empleado_resuelve_banco", esperarEscritura,
      patch.status < 300 && String(md.bank_entity_name || "") === nombreBanco && String(md.bank_account_code || "") === cuenta ? "OK" : "FALLO",
      `PATCH cuenta -> ${resumen(patch)}; relectura bank_entity_name="${md.bank_entity_name || "(vacio)"}" cuenta="${md.bank_account_code || "(vacio)"}" (el nombre lo resuelve el maestro, no lo envia el cliente)`));
    // Se retira un banco que la ficha NO tiene asignado: el producto conserva a proposito el banco ya
    // asignado cuando ese banco sale de servicio, y esa excepcion es la que hundia la pierna anterior
    // al reasignar el mismo codigo.
    await pedir("/api/v1/talento-humano/bancos", { method: "POST", token, payload: { code: codeRetirado, name: nombreRetirado, swift: "" } });
    const inactivo = await pedir(`/api/v1/talento-humano/bancos/${codeRetirado}`, { method: "PATCH", token, payload: { code: codeRetirado, name: nombreRetirado, active: false } });
    const reintento = await pedir(`/api/v1/talento-humano/empleados/${idEmpleadoOperario}`, { method: "PATCH", token, payload: { bank_code: codeRetirado, bank_account_code: cuenta } });
    const trasReintento = await pedir(`/api/v1/talento-humano/empleados/${idEmpleadoOperario}`, { token });
    const mdTras = trasReintento.cuerpo?.metadata || {};
    registrar(evalPierna("cuenta_pago_rechaza_banco_inactivo", esperarEscritura,
      Boolean(codeRetirado) && inactivo.status < 300 && reintento.status >= 400 && /activo/i.test(JSON.stringify(reintento.cuerpo || {}))
        && String(mdTras.bank_code || mdTras.bank_entity_code || codeNuevo) === codeNuevo ? "OK" : "FALLO",
      `alta de ${codeRetirado || "(sin codigo libre)"} y PATCH active=false -> ${resumen(inactivo)}; asignar ese banco fuera de servicio a la ficha ${idEmpleadoOperario}, que tiene el banco vigente ${codeNuevo} -> ${resumen(reintento)}; la ficha conserva bank=${JSON.stringify(mdTras.bank_code ?? mdTras.bank_entity_name ?? "(sin campo)")} (ninguna cuenta se paga a un banco inactivo y el rechazo no degrada la asignacion buena)`));
    // La cuenta huerfana se mide en la ficha libre, cuyo bank_code actual esta vacio: en la ficha ya
    // asignada el servicio conserva el banco vigente y el PATCH es legal por contrato.
    const huerfana = await pedir(`/api/v1/talento-humano/empleados/${idEmpleadoLibre || idEmpleadoOperario}`, { method: "PATCH", token, payload: { bank_account_code: "888888" } });
    registrar(evalPierna("cuenta_pago_rechaza_cuenta_sin_banco", esperarEscritura, huerfana.status >= 400 ? "OK" : "FALLO",
      `PATCH solo con cuenta y sin banco en la ficha ${idEmpleadoLibre ? "libre" : "(sin libre, reutilizada)"} ${idEmpleadoLibre || idEmpleadoOperario} -> ${resumen(huerfana)} (banco y cuenta van juntos o quedan ambos vacios)`));
  } else {
    for (const idPierna of ["cuenta_pago_empleado_resuelve_banco", "cuenta_pago_rechaza_banco_inactivo"]) {
      registrar(evalPierna(idPierna, esperarEscritura, modoEscritura ? "FALLO" : "NO_APLICABLE",
        modoEscritura ? `no hubo empleado efimero con banco que gobernar (empleado ${idEmpleadoOperario || "(sin id)"}, banco ${codeNuevo || "(sin code)"})` : "corrida de solo lectura"));
    }
    registrar(evalPierna("cuenta_pago_rechaza_cuenta_sin_banco", esperarEscritura, modoEscritura ? "FALLO" : "NO_APLICABLE", "corrida de solo lectura o sin ficha libre"));
  }

  // 5. Liquidacion de retiro: calculo sin persistir, revision de dias, recibo PDF real.
  if (idEmpleadoOperario && FECHA_RETIRO) {
    const docsAntes = await pedir("/api/v1/talento-humano/liquidacion-trabajador/documentos?limit=200", { token });
    const liq = await pedir("/api/v1/talento-humano/liquidacion-trabajador/preview", {
      method: "POST", token,
      payload: { employee_id: idEmpleadoOperario, termination_date: FECHA_RETIRO, termination_reason: "renuncia_voluntaria", pending_salary_days: 20, remaining_days: 30 }
    });
    const cuerpo = liq.cuerpo || {};
    // El preview devuelve { mode: "preview", document: {...} }: leer los conceptos en la raiz daba una
    // lista vacia y la pierna se hundia por el camino equivocado, no por el calculo.
    const documento = cuerpo.document || cuerpo;
    const conceptos = documento.lines || documento.concepts || documento.conceptos || documento.items || [];
    const totales = ["gross", "deductions", "net"].map((campo) => `${campo}=${documento[campo] ?? "(sin campo)"}`).join(" ");
    const docsDespues = await pedir("/api/v1/talento-humano/liquidacion-trabajador/documentos?limit=200", { token });
    const persistio = filasDe(docsDespues.cuerpo).some((f) => Number(f.employee_id) === Number(idEmpleadoOperario));
    registrar(evalPierna("liquidacion_preview_sin_persistir", esperarEscritura,
      liq.status < 300 && cuerpo.mode === "preview" && !persistio && Array.isArray(conceptos) && conceptos.length > 0
        && ["gross", "deductions", "net"].every((campo) => Number.isFinite(Number(documento[campo]))) ? "OK" : "FALLO",
      `POST preview (retiro ${FECHA_RETIRO}, 30 dias despues del ingreso) -> ${resumen(liq)} mode=${cuerpo.mode || "(sin mode)"} con ${Array.isArray(conceptos) ? conceptos.length : "(no es lista)"} lineas [${(conceptos || []).slice(0, 8).map((c) => c.code || c.concept || c.name || c.concepto).join(", ")}] y ${totales}; el listado de documentos no gano fila del empleado efimero (${filasDe(docsAntes.cuerpo).length} -> ${filasDe(docsDespues.cuerpo).length}): el preview calcula y no escribe`));
  } else {
    registrar(evalPierna("liquidacion_preview_sin_persistir", esperarEscritura, modoEscritura ? "FALLO" : "NO_APLICABLE", "sin id de empleado efimero resuelto por /hr/self"));
  }

  const revision = idEmpleadoOperario && FECHA_RETIRO
    ? await pedir(`/api/v1/talento-humano/liquidacion-trabajador/revision-dias?employee_id=${idEmpleadoOperario}&termination_date=${FECHA_RETIRO}`, { token })
    : { status: 0, cuerpo: {} };
  const revisionMala = await pedir("/api/v1/talento-humano/liquidacion-trabajador/revision-dias", {
    method: "POST", token,
    payload: { employee_id: idEmpleadoOperario || 1, termination_date: FECHA_RETIRO || "2026-12-20", work_date: FECHA_DIA_REVISADO || "2026-06-01", classification: "teletrabajo", note: "sondeo de catalogo cerrado", request_id: crypto.randomUUID() }
  });
  const revisionNotaCorta = await pedir("/api/v1/talento-humano/liquidacion-trabajador/revision-dias", {
    method: "POST", token,
    payload: { employee_id: idEmpleadoOperario || 1, termination_date: FECHA_RETIRO || "2026-12-20", work_date: FECHA_DIA_REVISADO || "2026-06-01", classification: "induccion", note: "abc", request_id: crypto.randomUUID() }
  });
  registrar(evalPierna("revision_dias_lee_y_valida_clasificacion", esperarEscritura,
    revision.status < 300 && Array.isArray(revision.cuerpo?.days) && Object.keys(revision.cuerpo?.classifications || {}).length > 0
      && revisionMala.status >= 400 && revisionMala.status < 500 && revisionNotaCorta.status >= 400 ? "OK" : "FALLO",
    `GET revision-dias del empleado ${idEmpleadoOperario || "(sin id)"} con retiro ${FECHA_RETIRO || "(sin fecha)"} -> ${resumen(revision)} (${(revision.cuerpo?.days || []).length} dias del tramo y ${Object.keys(revision.cuerpo?.classifications || {}).length} clasificaciones del catalogo: ${Object.keys(revision.cuerpo?.classifications || {}).slice(0, 5).join(", ")}); POST classification "teletrabajo" -> ${resumen(revisionMala)}; POST nota de 3 caracteres -> ${resumen(revisionNotaCorta)}`));

  const cierres = await pedir("/api/v1/talento-humano/nomina/cierres?limit=50", { token });
  const configLaboral = await pedir("/api/v1/talento-humano/configuracion-laboral/nomina", { token });
  const tipoPeriodo = String(configLaboral.cuerpo?.period_type || configLaboral.cuerpo?.periodicidad || configLaboral.cuerpo?.payroll_period || (Array.isArray(configLaboral.cuerpo) ? "quincenal" : "") || "").toLowerCase();
  const quincena = tipoPeriodo.includes("quin") || tipoPeriodo.includes("15") || tipoPeriodo === "";
  const rangoValido = quincena ? { fecha_inicio: "2026-10-01", fecha_fin: "2026-10-15" } : { fecha_inicio: "2026-10-01", fecha_fin: "2026-10-31" };
  const rangoInvalido = quincena ? { fecha_inicio: "2026-10-01", fecha_fin: "2026-10-31" } : { fecha_fin: "2026-10-31" };
  const validar = await pedir("/api/v1/talento-humano/nomina/cierres/validar", { method: "POST", token, payload: rangoValido });
  const validarMala = await pedir("/api/v1/talento-humano/nomina/cierres/validar", { method: "POST", token, payload: rangoInvalido });
  registrar(evalPierna("nomina_cierres_lee_y_valida", esperarEscritura,
    cierres.status < 300 && [200, 409, 422].includes(validar.status) && validarMala.status >= 400 && String(validarMala.cuerpo?.code || "").startsWith("NOMINA") ? "OK" : "FALLO",
    `GET cierres -> ${resumen(cierres)} (${filasDe(cierres.cuerpo).length} periodos) y configuracion de nomina del tenant: periodicidad "${tipoPeriodo || "(sin campo)"}" leida de /configuracion-laboral/nomina (${configLaboral.status}); POST validar ${rangoValido.fecha_inicio}..${rangoValido.fecha_fin} -> ${resumen(validar)} en ${validar.elapsed} ms; POST validar ${rangoInvalido.fecha_inicio || "(sin inicio)"}..${rangoInvalido.fecha_fin} -> ${resumen(validarMala)} (la regla de periodicidad se aplica con codigo de dominio, no con un crash)`));

  if (modoEscritura && idEmpleadoOperario && FECHA_RETIRO) {
    // La compuerta DIAS_RETIRO_SIN_JUSTIFICAR exige el tramo pendiente clasificado dia por dia. Se
    // justifica con una clasificacion del catalogo que el propio ambiente publico y se relee: la pierna
    // informa cuantos dias quedaron pendientes en vez de asumir que el envio cerro el tramo.
    const diasPendientes = (revision.cuerpo?.days || []).filter((d) => d.status === "pendiente");
    const llaveDemo = Object.keys(diasPendientes[0] || {}).slice(0, 8);
    const codigosJustificados = [];
    for (const dia of diasPendientes) {
      const fechaDia = String(dia.date || dia.work_date || dia.dia || dia.fecha || "").slice(0, 10);
      if (!fechaDia) break;
      const justificado = await pedir("/api/v1/talento-humano/liquidacion-trabajador/revision-dias", {
        method: "POST", token,
        payload: {
          employee_id: idEmpleadoOperario, termination_date: FECHA_RETIRO, work_date: fechaDia,
          classification: "trabajado_sin_marcacion", note: `Certificacion QA ${RUN_ID}: jornada trabajada sin marcacion, dia justificado por la corrida`, request_id: crypto.randomUUID()
        }
      });
      codigosJustificados.push(justificado.status);
    }
    const revisionTras = await pedir(`/api/v1/talento-humano/liquidacion-trabajador/revision-dias?employee_id=${idEmpleadoOperario}&termination_date=${FECHA_RETIRO}`, { token });
    const pendientesTras = (revisionTras.cuerpo?.days || []).filter((d) => d.status === "pendiente").length;
    reporte.justificacion_del_tramo = {
      pendientes_iniciales: diasPendientes.length, intentos: codigosJustificados.length,
      statuses: [...new Set(codigosJustificados)].join(","), pendientes_releidos: pendientesTras, campos_del_dia: llaveDemo
    };
    const run = await pedir("/api/v1/talento-humano/liquidacion-trabajador/documentos", {
      method: "POST", token,
      payload: { employee_id: idEmpleadoOperario, termination_date: FECHA_RETIRO, termination_reason: "renuncia_voluntaria", pending_salary_days: 20, remaining_days: 30 }
    });
    const id = Number(run.cuerpo?.id || run.cuerpo?.liquidation?.id || run.cuerpo?.document?.id || 0);
    if (run.status < 300 && id) {
      const pdf = await pedir(`/api/v1/talento-humano/liquidacion-trabajador/documentos/${id}/pdf`, { token, raw: true });
      const magic = pdf.buffer.subarray(0, 5).toString("latin1");
      const borrado = await pedir(`/api/v1/talento-humano/liquidacion-trabajador/documentos/${id}`, { method: "DELETE", token });
      registrar(evalPierna("liquidacion_completa_con_recibo_pdf", "OK",
        magic === "%PDF-" && pdf.buffer.length > 1000 && borrado.status < 300 ? "OK" : "FALLO",
        `tramo justificado dia por dia (${diasPendientes.length} pendientes -> ${pendientesTras} tras la corrida); POST documentos -> ${resumen(run)} id ${id}; GET pdf -> ${pdf.status}, ${pdf.buffer.length} bytes, magic "${magic}"; DELETE -> ${resumen(borrado)} (liquidacion completa calculada y recibo PDF real servido por el ambiente, documento retirado por endpoint)`));
    } else if (run.status === 422 && String(run.cuerpo?.code || "") === "DIAS_RETIRO_SIN_JUSTIFICAR") {
      registrar(evalPierna("liquidacion_completa_con_recibo_pdf", "NO_APLICABLE", "NO_APLICABLE",
        `POST documentos -> ${resumen(run)} con ${pendientesTras} dias aun pendientes despues de ${codigosJustificados.length} intentos de justificacion (statuses ${[...new Set(codigosJustificados)].join(",") || "ninguno"}): la compuerta de justificacion previo sigue en pie y el arnes no la fuerza por debajo del API; el calculo y el recibo PDF positivo quedan certificados por las suites locales hr-termination-* y el preview se midio en la pierna anterior`));
    } else {
      registrar(evalPierna("liquidacion_completa_con_recibo_pdf", "OK", "FALLO",
        `POST documentos -> ${resumen(run)} con ${pendientesTras} dias pendientes reeleidos; no es el 422 declarado de justificacion previa`));
    }
  } else {
    registrar(evalPierna("liquidacion_completa_con_recibo_pdf", "NO_APLICABLE", "NO_APLICABLE", modoEscritura ? "sin empleado efimero" : "corrida de solo lectura"));
  }

  // 6. Horarios unificados: una sola fuente leida por las dos rutas, retiro por endpoint, contencion.
  const TODAY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  // La ventana se centra en el momento de la corrida: con una malla de 08:00-17:00 medida a media
  // tarde, la marcacion cae en la pierna de llegada tarde y la idempotencia se mide sobre un 422.
  const hhmm = (minutos) => `${String(Math.floor(((minutos % 1440) + 1440) / 60) % 24).padStart(2, "0")}:${String((minutos % 60 + 60) % 60).padStart(2, "0")}`;
  const ahoraMinuto = new Date().toLocaleString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
  const MINUTO_ACTUAL = Number(ahoraMinuto.slice(0, 2)) * 60 + Number(ahoraMinuto.slice(3, 5));
  const VENTANA = { start_time: hhmm(MINUTO_ACTUAL - 5), end_time: hhmm(MINUTO_ACTUAL + 100) };
  reporte.ventana_de_malla = { fecha: TODAY, ...VENTANA, hora_local_bogota: ahoraMinuto };
  let idMalla = null;
  let payloadMalla = null;
  const filasConc = [];
  if (modoEscritura && idEmpleadoOperario) {
    payloadMalla = { date: TODAY, employees: [EMAIL_OPERARIO], ...VENTANA, tolerance_minutes: 15, kind: "trabajo", notes: `CERT QA ${RUN_ID}` };
    const malla = await pedir("/api/v1/talento-humano/mallas", {
      method: "POST", token, payload: payloadMalla
    });
    idMalla = Number(malla.cuerpo?.id || malla.cuerpo?.route?.id || 0);
    const porEspanol = await pedir("/api/v1/talento-humano/mallas?limit=500", { token });
    const porIngles = await pedir("/api/v1/hr/routes?limit=500", { token });
    const enEspanol = filasDe(porEspanol.cuerpo).find((r) => Number(r.id) === idMalla);
    const enIngles = filasDe(porIngles.cuerpo).find((r) => Number(r.id) === idMalla);
    registrar(evalPierna("mallas_unificadas_ambas_lecturas", esperarEscritura,
      idMalla && enEspanol && enIngles ? "OK" : "FALLO",
      `POST /talento-humano/mallas -> ${resumen(malla)} id ${idMalla || "(no resuelto)"}; la misma fila aparece en /talento-humano/mallas (${Boolean(enEspanol)}) y en /hr/routes (${Boolean(enIngles)}) con el mismo identificador: un solo almacen, dos lecturas`));
    reporte.malla_id = idMalla;
  } else registrar(evalPierna("mallas_unificadas_ambas_lecturas", esperarEscritura, "NO_APLICABLE", "corrida de solo lectura o sin empleado efimero"));

  if (idMalla && modoEscritura) {
    const payloadsConc = Array.from({ length: 6 }, (_, i) => ({
      date: TODAY, employees: [EMAIL_SIN_HORARIO], start_time: "08:00", end_time: `1${i % 6}:00`,
      tolerance_minutes: 10 + i, kind: "trabajo", notes: `CERT CONC ${RUN_ID} ${i}`
    }));
    const concurrentes = await Promise.all(payloadsConc.map((payload) => pedir("/api/v1/talento-humano/mallas", {
      method: "POST", token, payload
    })));
    const conP2028 = concurrentes.filter((r) => /P2028|Transaction not found/i.test(JSON.stringify(r.cuerpo || {}))).length;
    const fueraDeContrato = concurrentes.filter((r) => ![200, 201, 409, 422, 503].includes(r.status)).length;
    const sinRetryAfter = concurrentes.filter((r) => r.status === 503 && !r.headers["retry-after"]).length;
    const creadasConc = concurrentes.map((r, i) => ({ id: Number(r.cuerpo?.id || 0), payload: payloadsConc[i] })).filter((x) => x.id);
    for (const fila of creadasConc) await pedir(`/api/v1/talento-humano/mallas/${fila.id}`, { method: "DELETE", token }).catch(() => {});
    filasConc.push(...creadasConc);
    registrar(evalPierna("contencion_sin_P2028", esperarEscritura,
      concurrentes.length === 6 && conP2028 === 0 && fueraDeContrato === 0 && sinRetryAfter === 0 ? "OK" : "FALLO",
      `6 escrituras concurrentes de malla -> [${concurrentes.map((r) => r.status).join(", ")}]; cuerpos con P2028/Transaction not found: ${conP2028}; codigos fuera de contrato: ${fueraDeContrato}; 503 sin retry-after: ${sinRetryAfter}; ganadoras con id ${creadasConc.length} (su retiro se mide en la pierna mallas_retiradas_por_estado, no se da por hecho)`));
  } else registrar(evalPierna("contencion_sin_P2028", esperarEscritura, "NO_APLICABLE", "sin malla efimera que contendir"));

  // 7. Marcacion web con selfie: compuertas duras, horario asignado y reenvio idempotente.
  const selfieValida = { base64: pngSelfie(24).toString("base64"), type: "image/png", name: "qa-cert.png" };
  const payloadMarca = (extra = {}) => ({ user_name: "Paquete fijado", type: "entrada", punched_at: new Date().toISOString(), metadata: { source: "apexos-web" }, ...extra });

  if (tokens.sin_horario) {
    const rutasLibres = await pedir(`/api/v1/hr/self/routes?date=${TODAY}`, { token: tokens.sin_horario });
    const asignadas = filasDe(rutasLibres.cuerpo).filter((r) => JSON.stringify(r.employees || r.empleados || "").includes(EMAIL_SIN_HORARIO));
    registrar(evalPierna("marcacion_sin_horario_responde_200_vacio", "OK",
      rutasLibres.status === 200 && rutasLibres.cuerpo?.error === undefined && asignadas.length === 0 ? "OK" : "FALLO",
      `GET /hr/self/routes de la ficha sin jornada -> ${resumen(rutasLibres)} con ${filasDe(rutasLibres.cuerpo).length} filas y ${asignadas.length} asignadas al operario libre (200 vacio, no un error: la pantalla puede decir "sin horario asignado")`));
  } else registrar(evalPierna("marcacion_sin_horario_responde_200_vacio", esperarEscritura, "NO_APLICABLE", "sin ficha sin horario creada"));

  const tkMarca = tokens.operario || token;
  const sinFoto = await pedir("/api/v1/hr/self/time-punches", { method: "POST", token: tkMarca, payload: payloadMarca() });
  registrar(evalPierna("punch_sin_selfie_400", "OK",
    sinFoto.status === 400 && String(sinFoto.cuerpo?.code || "") === "SELFIE_REQUERIDA" ? "OK" : "FALLO",
    `POST /hr/self/time-punches sin identity_photo -> ${resumen(sinFoto)} (code ${(sinFoto.cuerpo || {}).code || "(sin code)"}): la compuerta dura sigue en pie en el ambiente`));

  const fotoPdf = await pedir("/api/v1/hr/self/time-punches", { method: "POST", token: tkMarca, payload: payloadMarca({ identity_photo: { base64: Buffer.from("%PDF-1.4 sondeo").toString("base64"), type: "application/pdf", name: "evidencia.pdf" } }) });
  const fotoSvg = await pedir("/api/v1/hr/self/time-punches", { method: "POST", token: tkMarca, payload: payloadMarca({ identity_photo: { base64: Buffer.from("<svg xmlns='x'/>").toString("base64"), type: "image/svg+xml", name: "logo.svg" } }) });
  const fotoGrande = await pedir("/api/v1/hr/self/time-punches", { method: "POST", token: tkMarca, payload: payloadMarca({ identity_photo: { base64: Buffer.alloc(2_500_000, 7).toString("base64"), type: "image/jpeg", name: "grande.jpg" } }) });
  registrar(evalPierna("punch_selfie_no_imagen_400", "OK",
    fotoPdf.status === 400 && String(fotoPdf.cuerpo?.code || "") === "SELFIE_INVALIDA"
      && fotoSvg.status === 400 && String(fotoSvg.cuerpo?.code || "") === "SELFIE_INVALIDA"
      && fotoGrande.status >= 400 && fotoGrande.status < 500 ? "OK" : "FALLO",
    `PDF -> ${resumen(fotoPdf)}; SVG -> ${resumen(fotoSvg)}; 2.5 MB -> ${resumen(fotoGrande)} (contenido duro rechazado en los tres casos; el tercero puede caer en el limite de cuerpo antes del contenido)`));

  const horarioAjeno = await pedir("/api/v1/hr/self/time-punches", { method: "POST", token: tokens.sin_horario || tkMarca, payload: payloadMarca({ route_id: idMalla || 1, identity_photo: selfieValida }) });
  registrar(evalPierna("punch_horario_ajeno_403", "OK",
    horarioAjeno.status === 403 && String(horarioAjeno.cuerpo?.code || "") === "HORARIO_AJENO_DENEGADO" ? "OK" : "FALLO",
    `POST con route_id ${idMalla || 1} desde la ficha que no tiene ese horario asignado -> ${resumen(horarioAjeno)} (code ${(horarioAjeno.cuerpo || {}).code || "(sin code)"}: la compuerta de horario vive antes que la foto)`));

  if (idMalla && tokens.operario && modoEscritura) {
    const llave = `qa-paquete-${RUN_ID}-reenvio`;
    const marca = (extra = {}) => pedir("/api/v1/hr/self/time-punches", { method: "POST", token: tokens.operario, payload: payloadMarca({ route_id: idMalla, idempotency_key: llave, identity_photo: selfieValida, ...extra }) });
    const evidencia = { base64: pngSelfie(24).toString("base64"), type: "image/png", name: "qa-cert-evidencia.png", size: pngSelfie(24).length };
    let primera = await marca();
    let sendroJustificado = "";
    // La malla se fundo en la hora local del ambiente, asi que la marcacion de oro no debe pedir
    // justificacion. Si el ambiente la pide igual, se reenvia con lo que la compuerta exija (primero
    // motivo, luego la foto de evidencia) y el reenvio queda declarado en el detalle de la pierna.
    if (primera.status === 422 && /^JUSTIFICACION_/.test(String(primera.cuerpo?.code || ""))) {
      sendroJustificado = `el ambiente pidio justificacion (${primera.cuerpo.code}) y se reenvio con motivo`;
      primera = await marca({ extra_reason: "transito", extra_detail: `Certificacion QA ${RUN_ID}: llegada visible para el supervisor` });
    }
    if (primera.status === 422 && /^EVIDENCIA_/.test(String(primera.cuerpo?.code || ""))) {
      sendroJustificado = `${sendroJustificado ? sendroJustificado + " | " : ""}el ambiente pidio evidencia fotografica (${primera.cuerpo.code}) y se reenvio con la foto`;
      primera = await marca({ extra_reason: "transito", extra_detail: `Certificacion QA ${RUN_ID}: llegada visible para el supervisor`, extra_evidence: evidencia });
    }
    const reenvio = await marca({ ...(sendroJustificado ? { extra_reason: "transito", extra_detail: `Certificacion QA ${RUN_ID}: reenvio con motivo`, extra_evidence: evidencia } : {}) });
    const asistencia = await pedir("/api/v1/hr/self/attendance?limit=100", { token: tokens.operario });
    const filas = filasDe(asistencia.cuerpo);
    const conLlave = filas.filter((f) => JSON.stringify(f).includes(llave));
    const idPrimera = Number(primera.cuerpo?.punch?.id || primera.cuerpo?.id || primera.cuerpo?.attendance?.id || 0);
    const idReenvio = Number(reenvio.cuerpo?.punch?.id || reenvio.cuerpo?.id || 0);
    const identidadPrimera = primera.cuerpo?.punch?.metadata?.identity_verification || primera.cuerpo?.punch?.metadata?.identity || primera.cuerpo?.identity_verification || null;
    registrar(evalPierna("punch_con_selfie_valida", esperarEscritura,
      [200, 201].includes(primera.status) && primera.cuerpo?.ok === true && idPrimera ? "OK" : "FALLO",
      `POST con selfie PNG real (24x24 de ruido, ${pngSelfie(24).length} bytes) y route_id propio -> ${resumen(primera)} ok=${primera.cuerpo?.ok} punch.id ${idPrimera || "(sin id)"} hora_servida ${JSON.stringify(primera.cuerpo?.hora || "(sin hora)")}, identidad ${JSON.stringify(identidadPrimera || "(sin campo)")}${sendroJustificado ? ` | ${sendroJustificado}` : ""}`));
    // La cola del dispositivo reenvia la misma llave: el ambiente tiene que decir replayed=true,
    // devolver el MISMO identificador y dejar una sola hora. Un verde sobre 0 filas leidas era el
    // verde vacio de la corrida anterior.
    registrar(evalPierna("punch_idempotente_reenvio", esperarEscritura,
      idPrimera && reenvio.status < 300 && reenvio.cuerpo?.replayed === true && idReenvio === idPrimera && conLlave.length === 1 ? "OK" : "FALLO",
      `primera marcacion id ${idPrimera || "(sin id)"}; reenvio con el mismo idempotency_key -> ${resumen(reenvio)} replayed=${reenvio.cuerpo?.replayed} id ${idReenvio || "(sin id)"}; filas leidas con esa llave: ${conLlave.length} (la revalidacion de la foto no paga una segunda hora)`));
  } else {
    registrar(evalPierna("punch_con_selfie_valida", esperarEscritura, "NO_APLICABLE", "sin horario propio que marcar o corrida de solo lectura"));
    registrar(evalPierna("punch_idempotente_reenvio", esperarEscritura, "NO_APLICABLE", "sin marcacion valida que reenviar"));
  }

  // 8. RBAC y aislamiento de tenant, con las sesiones reales de la empresa modelo.
  // NYVORA QA no trae un rol de solo lectura de hr, y buscar uno y declarar NO_APLICABLE era un verde
  // vacio. Se contrastan dos roles reales sobre LA MISMA peticion valida de nomina: el preHandler de
  // permiso resuelve antes que el calculo, asi que 403 contra un codigo de dominio demuestra que el
  // bloqueo es del permiso y no del ambiente. Se elige /validar porque no escribe: la pierna no deja
  // periodo cerrado ni documento en QA. (Con payload invalido no vale: Fastify valida el cuerpo antes
  // del preHandler y los dos roles devuelven el mismo 400 de esquema.)
  const rbacOperario = tokens.operario ? await pedir("/api/v1/talento-humano/nomina/cierres/validar", { method: "POST", token: tokens.operario, payload: rangoValido }) : { status: 0, cuerpo: {} };
  const rbacSupervisor = token ? await pedir("/api/v1/talento-humano/nomina/cierres/validar", { method: "POST", token, payload: rangoValido }) : { status: 0, cuerpo: {} };
  const controlNoBloqueado = tokens.operario ? await pedir(`/api/v1/hr/self/routes?date=${TODAY}`, { token: tokens.operario }) : { status: 0, cuerpo: {} };
  registrar(evalPierna("rbac_contraste_roles_sobre_nomina", esperarEscritura,
    rbacOperario.status === 403 && rbacSupervisor.status !== 403 && rbacSupervisor.status < 500 && controlNoBloqueado.status === 200 ? "OK" : "FALLO",
    `POST /talento-humano/nomina/cierres/validar con el mismo tramo ${rangoValido.fecha_inicio}..${rangoValido.fecha_fin}: rol "${(reporte.roles_de_medicion[1] || {}).nombre || "(marcaciones)"}" -> ${resumen(rbacOperario)} (403 esperado) y rol "${(reporte.roles_de_medicion[0] || {}).nombre || "(supervisor)"}" -> ${resumen(rbacSupervisor)} (pasa el permiso y responde con codigo de dominio); control: ese mismo token si lee sus propios horarios (${controlNoBloqueado.status}), o sea el bloqueo es del permiso de nomina y no del ambiente`));

  const vecina = await prisma.tenant.findFirst({ where: { NOT: { id: empresa.id }, name: { contains: "ISOLATION", mode: "insensitive" } }, select: { id: true, name: true } })
    || await prisma.tenant.findFirst({ where: { NOT: { id: empresa.id }, active: true }, select: { id: true, name: true } });
  // Employee no trae columna name: pedirla producía 42703 y la pierna se caia a "(sin vecino)".
  const empleadoVecino = vecina ? await prisma.$queryRawUnsafe(`SELECT id, code FROM "Employee" WHERE tenant_id = $1 ORDER BY id LIMIT 1`, vecina.id).then((r) => r[0]).catch(() => null) : null;
  const sondeo = empleadoVecino ? await pedir(`/api/v1/talento-humano/empleados/${empleadoVecino.id}`, { token: token || tokens.operario }) : { status: 0, cuerpo: {} };
  const listaPropia = await pedir("/api/v1/talento-humano/empleados?limit=200", { token: token || tokens.operario });
  const filasPropias = filasDe(listaPropia.cuerpo);
  const idsPropios = new Set((await prisma.employee.findMany({ where: { tenant_id: empresa.id }, select: { id: true } })).map((e) => Number(e.id)));
  const fueraDeAlcance = filasPropias.filter((e) => e.id && !idsPropios.has(Number(e.id))).length;
  registrar(evalPierna("aislamiento_tenant_lectura", "OK",
    empleadoVecino && [403, 404].includes(sondeo.status) && filasPropias.length > 0 && fueraDeAlcance === 0 ? "OK" : "FALLO",
    `lectura del empleado ${empleadoVecino?.id || "(sin vecino)"} (code ${empleadoVecino?.code || "?"}) de la empresa vecina ${vecina?.name || "(sin vecina)"} con la sesion de NYVORA -> ${resumen(sondeo)}; listado propio ${filasPropias.length} filas y filas fuera del alcance del tenant: ${fueraDeAlcance}`));

  // 9. Retiro de lo efmero por endpoint (nunca por UPDATE directo) y residuos declarados.
  //
  // El DELETE de una malla pide el permiso especial delete_physical_records que este arnes no
  // entrega (medido: 400), asi que la fila seguia activa en el almacen. Y el control anterior
  // ("la malla ya no aparece despues del retiro") se leia con la sesion del administrador que acababa
  // de desactivarse: un 401 vaciaba el listado y el verde quedaba imposible de obtener en rojo. Ademas
  // el listado deja de mostrar la malla por otro motivo -su ficha quedo inactiva-, no porque la malla
  // se retiro. El retiro real es PATCH /hr/routes/:id status=inactive, y la confirmacion es el estado
  // que la lectura del almacen devuelve, con la sesion aun viva y con la fila vista activa antes.
  const retiros = [];
  const mallasRetiradas = [];
  const mallasDeOtrasCorridas = [];
  async function estadoMalla(id, sesion) {
    const leida = await pedir("/api/v1/hr/routes?limit=500", { token: sesion });
    return filasDe(leida.cuerpo).find((r) => Number(r.id) === Number(id)) || null;
  }
  async function retirarMalla(id, payload, sesion) {
    const antes = await estadoMalla(id, sesion);
    const r = await pedir(`/api/v1/hr/routes/${id}`, {
      method: "PATCH", token: sesion, payload: { ...payload, status: "inactive" }
    });
    const despues = await estadoMalla(id, sesion);
    const borrado = await pedir(`/api/v1/talento-humano/mallas/${id}`, { method: "DELETE", token: sesion });
    return {
      id, visible_antes: Boolean(antes), estado_antes: antes?.status || "(ausente)", status_patch: r.status,
      patch_observado: resumen(r), estado_despues: despues?.status || "(ausente)",
      status_delete_fisico: borrado.status, delete_fisico_observado: resumen(borrado),
      retirado_confirmado: String(despues?.status || "").toLowerCase() === "inactive"
    };
  }
  if (modoEscritura) {
    if (idMalla && payloadMalla) mallasRetiradas.push(await retirarMalla(idMalla, payloadMalla, token));
    for (const fila of filasConc) mallasRetiradas.push(await retirarMalla(fila.id, fila.payload, token));
    // Residuos de corridas anteriores de ESTA intervencion: las mallas que el control viejo dejo
    // activas por anunciar un DELETE que no ejecutaba. Se barrendan por la marca del RUN_ID y se
    // retiran por el mismo endpoint, sin tocar horarios de otros frentes ni de otros tenants.
    const anteriores = await pedir("/api/v1/hr/routes?limit=500", { token });
    const deOtrasCorridas = filasDe(anteriores.cuerpo).filter((r) => {
      const notas = String(r.notes || "");
      const marca = notas.match(/CERT (?:QA|CONC) (\d{14})/);
      return marca && marca[1] !== RUN_ID && String(r.status || "active").toLowerCase() === "active";
    });
    const activasAntesDeReposicion = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "TimeRoute" WHERE (notes LIKE '%CERT QA %' OR notes LIKE '%CERT CONC %') AND status = 'active'`
    ).then((r) => Number(r[0]?.n || 0));
    for (const fila of deOtrasCorridas) {
      mallasDeOtrasCorridas.push(await retirarMalla(fila.id, {
        date: String(fila.date || TODAY).slice(0, 10), employees: Array.isArray(fila.equipo) ? fila.equipo : [],
        start_time: fila.h_inicio || "08:00", end_time: fila.h_fin || "17:00",
        tolerance_minutes: Number(fila.tolerancia_minutos ?? 15), kind: "trabajo", notes: fila.notes || ""
      }, token));
    }
    const activasDespuesDeReposicion = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "TimeRoute" WHERE (notes LIKE '%CERT QA %' OR notes LIKE '%CERT CONC %') AND status = 'active'`
    ).then((r) => Number(r[0]?.n || 0));
    reporte.reposicion_residuos_anteriores = {
      mallas_de_corridas_previas_encontradas_activas: deOtrasCorridas.length,
      activas_en_almacen_antes: activasAntesDeReposicion, activas_en_almacen_despues: activasDespuesDeReposicion,
      ids: mallasDeOtrasCorridas.map((m) => `${m.id} ${m.estado_antes}->${m.estado_despues}`),
      por: "PATCH /hr/routes/:id status=inactive con la sesion del administrador efmero de esta corrida"
    };
    const estabanActivas = mallasRetiradas.filter((m) => m.visible_antes && String(m.estado_antes).toLowerCase() === "active").length;
    const quedaronInactivas = mallasRetiradas.filter((m) => m.retirado_confirmado).length;
    registrar(evalPierna("mallas_retiradas_por_estado", esperarEscritura,
      mallasRetiradas.length > 0 && estabanActivas === mallasRetiradas.length && quedaronInactivas === mallasRetiradas.length ? "OK" : "FALLO",
      `${quedaronInactivas}/${mallasRetiradas.length} mallas de la corrida pasan a status=inactive por PATCH /hr/routes/:id y la lectura del almacen lo confirma; todas se veian activas antes (${estabanActivas}); borrado fisico: DELETE -> ${[...new Set(mallasRetiradas.map((m) => m.status_delete_fisico))].join("/")} sin delete_physical_records; ${mallasRetiradas.map((m) => `id ${m.id} ${m.estado_antes}->${m.estado_despues}`).join(", ") || "(sin mallas)"}`));
    retiros.push(...mallasRetiradas.map((m) => ({ tipo: "malla", ...m })));
    // El banco efmero se retira de verdad (el maestro no expone DELETE: se pone active=false) y se
    // relee, antes de matar la sesion que lo goberna.
    if (codeNuevo) {
      const r = await pedir(`/api/v1/talento-humano/bancos/${codeNuevo}`, { method: "PATCH", token, payload: { code: codeNuevo, name: nombreBanco, active: false } });
      const tras = await pedir("/api/v1/talento-humano/bancos", { token });
      const fila = filasDe(tras.cuerpo).find((b) => String(b.code) === codeNuevo);
      retiros.push({ tipo: "banco", code: codeNuevo, status: r.status, retirado_confirmado: fila ? fila.active === false : true, por: "PATCH /talento-humano/bancos/:code active=false" });
    }
    if (codeRetirado) {
      const tras = await pedir("/api/v1/talento-humano/bancos", { token });
      const fila = filasDe(tras.cuerpo).find((b) => String(b.code) === codeRetirado);
      retiros.push({ tipo: "banco_control_inactivo", code: codeRetirado, retirado_confirmado: fila ? fila.active === false : true, por: "relectura del maestro: se creo solo para medir la asignacion de un banco fuera de servicio" });
    }
    // La sesion que governa el retiro es la del administrador efmero: si se retira primero, su propio
    // token muere y las fichas restantes quedan activas en el ambiente con un 401 que parece retiro.
    const cuentas = [["operario", operario], ["sin_horario", sinHorario], ["lector", lectora], ["jefe", jefe]];
    for (const [tipo, cuenta] of cuentas) {
      if (!cuenta?.id) continue;
      const r = await pedir(`/api/v1/admin/users/${cuenta.id}/status`, { method: "PATCH", token, payload: { active: false } });
      const leido = await pedir(`/api/v1/admin/users?limit=500`, { token });
      const sigueVisible = filasDe(leido.cuerpo).some((u) => Number(u.id) === Number(cuenta.id));
      retiros.push({ tipo: `usuario_${tipo}`, id: cuenta.id, status: r.status, retirado_confirmado: !sigueVisible, por: "PATCH /admin/users/:id/status active=false" });
    }
  }
  reporte.verificacion_de_reposicion = {
    mallas_cert_en_almacen: mallasRetiradas.map((m) => ({ id: m.id, antes: m.estado_antes, despues: m.estado_despues, retirado_confirmado: m.retirado_confirmado, delete_fisico: m.status_delete_fisico })),
    borrado_fisico_disponible: mallasRetiradas.some((m) => [200, 204].includes(m.status_delete_fisico)),
    detalle: mallasRetiradas.length
      ? `${mallasRetiradas.filter((m) => m.retirado_confirmado).length}/${mallasRetiradas.length} mallas de la corrida con status=inactive releido del almacen; el DELETE fisico responde ${[...new Set(mallasRetiradas.map((m) => m.status_delete_fisico))].join("/")} porque exige delete_physical_records`
      : "corrida de solo lectura: sin mallas que verificar"
  };
  reporte.reposicion_de_qa = retiros;
  reporte.residuos_declarados = modoEscritura ? [
    `${[jefe, operario, sinHorario, lectora].filter((c) => c?.id).length} fichas de empleado "Paquete *" de la corrida ${RUN_ID} quedan inactivas: retiradas por endpoint, el producto no expone DELETE de empleado`,
    `banco ${codeNuevo || "(ninguno)"} queda active=false en Tenant.config.hr_banks: el maestro se retira por estado`,
    `banco ${codeRetirado || "(ninguno)"} queda active=false en Tenant.config.hr_banks: se creo solo para medir la asignacion de un banco fuera de servicio`,
    `${(reporte.justificacion_del_tramo || {}).intentos || 0} clases "trabajado_sin_marcacion" en revision-dias del empleado efimero ${idEmpleadoOperario || "(sin id)"}: el catalogo no expone DELETE de revision de dia y quedan ligadas a una ficha ya retirada`,
    `${mallasRetiradas.length} mallas de la corrida (${mallasRetiradas.map((m) => m.id).join(", ") || "ninguna"}) quedan con status=inactive por PATCH /hr/routes/:id: el DELETE fisico responde ${[...new Set(mallasRetiradas.map((m) => m.status_delete_fisico))].join("/") || "(sin intento)"} porque exige delete_physical_records, que este arnes no se entrega a si mismo; la fila no se borra, se retira por estado`,
    `marcaciones de prueba con idempotency_key qa-paquete-${RUN_ID}-reenvio, si la pierna idempotente se ejecuto`
  ] : [];

  const rojas = cheques.filter((c) => !c.cumple);
  const na = cheques.filter((c) => c.observado === "NO_APLICABLE");
  reporte.resumen = { total: cheques.length, verdes: cheques.length - rojas.length - na.length, rojas: rojas.length, no_aplicables: na.length };
  reporte.veredicto = rojas.length === 0 ? "APROBADO" : "BLOQUEADO";
  reporte.piernas_rojas = rojas.map((c) => ({ id: c.id, esperado: c.esperado, observado: c.observado, detalle: c.detalle }));
  const dir = path.resolve(ROOT, "docs/qa/evidence/hr-paquete-main-20261123");
  fs.mkdirSync(dir, { recursive: true });
  const etiqueta = modoEscritura ? "escritura" : "lectura";
  const archivo = path.join(dir, `qa-campo-${etiqueta}.json`);
  fs.writeFileSync(archivo, JSON.stringify({ ...reporte, piernas: cheques }, null, 2));
  console.error(`\n${reporte.veredicto} :: ${reporte.resumen.verdes}/${reporte.resumen.total} piernas en verde, ${rojas.length} rojas, ${na.length} NO_APLICABLE -> ${path.relative(ROOT, archivo).replace(/\\/g, "/")}`);
  process.exitCode = rojas.length ? 1 : 0;
})().catch((error) => {
  console.error(`BLOQUEADO: ${error.message}`);
  process.exitCode = 1;
});
