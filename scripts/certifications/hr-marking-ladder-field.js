#!/usr/bin/env node

/*
 * Medicion en campo de la escalera destrabada, contra el API desplegado (QA o Produccion).
 *
 * Que se prueba aqui y no en otro lado:
 *   - los unitarios (hr-administrative-punch-correction, platform-log-rejection-detail) corren
 *     contra el arbol del puesto, no contra el binario que sirve el ambiente;
 *   - hr-marking-evidence-resilience-local.js levanta un API con Supabase simulado: prueba el
 *     codigo pero no prueba que el Railway desplegado acepte la correccion con su base real;
 *   - esta corrida si usa el ambiente: ancla el commit servido por /health, crea su propia cuenta
 *     efimera dentro de la empresa modelo, abre una jornada controlada y mide los cuatro contratos
 *     que el corte promete (rechazo legible, motivo obligatorio, destrabe con correccion, jornada
 *     cerrada sigue protegida) mas el aislamiento entre tenants.
 *
 * Huella: escribe solo en el ambiente declarado por el archivo de ambiente. Crea dos cuentas efimeras
 * y un empleado efimero etiquetados con el RUN, y los retira por el propio endpoint al cerrar.
 *
 * Uso:
 *   node scripts/certifications/hr-marking-ladder-field.js --selftest
 *   node scripts/certifications/hr-marking-ladder-field.js --env-file=config/qa.env \
 *     --espera=arreglo --fix-commit=c777dc13528f6e8cd502d83effd68325a92f6486 \
 *     --output=docs/qa/evidence/hr-marca-ladder-main-20261123/campo-qa.json
 *
 * Ningun token, contrasena, correo o nombre de persona se escribe en la evidencia: la corrida
 * registra ids, codigos de negocio y estados.
 */
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const FIX_DE_REFERENCIA = "c777dc13528f6e8cd502d83effd68325a92f6486";
const PRESUPUESTO_MS = 20000;
const PIERNAS = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = String(argv[index]);
    if (!raw.startsWith("--")) continue;
    const body = raw.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      args[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith("--")) {
      args[body] = String(next);
      index += 1;
    } else {
      args[body] = true;
    }
  }
  return args;
}

function sha256(texto) {
  return crypto.createHash("sha256").update(String(texto)).digest("hex");
}

// La pierna se decide con dos lecturas independientes: lo que la peticion mostro y lo que el codigo
// servido dice que deberia mostrar. Sin el ancla, una corrida "esperaba arreglo" sobre el arbol viejo
// queda verde igual, que es exactamente como se col6 el rojo de la Fase 3.
function evaluarPierna({ esperado, observado, ancla }) {
  const fallos = [];
  if (!["defecto", "arreglo"].includes(esperado)) fallos.push(`esperado invalido: ${esperado}`);
  if (observado !== esperado) fallos.push(`la peticion mostro "${observado}" y se declaro "${esperado}"`);
  if (ancla !== esperado) fallos.push(`el codigo servido anuncia "${ancla}" y la pierna se declaro "${esperado}"`);
  return { cumple: fallos.length === 0, fallos };
}

// Un 409 con el codigo de escalera NO basta: lo que el corte promete es que el rechazo diga cual era
// la marcacion esperada. Sin `expected_type` el operario sigue reintentando todo el dia contra el mismo
// muro, que es el defecto que se vino a cerrar (39 rechazos / 14 operarios medidos en produccion).
function rechazoLegible({ status, code, details, esperado, intentada }) {
  const fallos = [];
  if (status !== 409) fallos.push(`esperaba 409, llego ${status}`);
  if (code !== esperado) fallos.push(`esperaba el codigo ${esperado}, llego ${code || "(sin codigo)"}`);
  if (!details || typeof details !== "object") fallos.push("el rechazo no trajo detalles");
  else {
    if (details.expected_type !== undefined && details.expected_type !== intentada?.esperada) {
      fallos.push(`detalles dicen ${details.expected_type}, la escalera esperaba ${intentada?.esperada}`);
    }
    if (details.expected_type === undefined && esperado === "MARCACION_FUERA_DE_SECUENCIA") {
      fallos.push("falta expected_type: el rechazo nombra el codigo pero no la marcacion que sigue");
    }
    if (details.punch_type === undefined) fallos.push("falta punch_type: no se sabe cual intentaron");
  }
  return { cumple: fallos.length === 0, fallos };
}

// Lo unico que prueba el destrabe es nuestra propia clave de idempotencia con nuestra hora. Una marca
// del mismo tipo escrita por otro (o la misma pierna a otra hora) no certifica nada.
function piernaAsentada(filas, { employeeId, idempotencyKey, tipo, punchedAt }) {
  const ours = (filas || []).filter((p) => String(p?.idempotency_key || "") === String(idempotencyKey));
  if (!ours.length) return { asentada: false, ciego: (filas || []).length === 0, motivo: "ninguna fila con nuestra clave" };
  const exacta = ours.find((p) => String(p?.type) === String(tipo) && sameInstant(p?.punched_at || p?.date, punchedAt));
  if (!exacta) return { asentada: false, ciego: false, motivo: "nuestra clave esta pero con otro tipo u hora" };
  return { asentada: true, ciego: false, motivo: "", punch_id: Number(exacta.id || 0) || null };
}

function sameInstant(a, b) {
  const x = new Date(a || 0).getTime();
  const y = new Date(b || 0).getTime();
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1000;
}

// Selfie real de ruido: zlib no comprime bytes aleatorios, asi que el archivo pesa lo que pesa la foto
// de una camara. Un stub de 68 bytes haria que el canal propio rechace por calidad y no por escalera,
// que es justamente lo que hay que distinguir.
function crc32(buffer) {
  if (!crc32.table) {
    crc32.table = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 8) : value >>> 8;
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
    pngChunk("IDAT", require("node:zlib").deflateSync(raw, { level: 0 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
  return { base64: png.toString("base64"), bytes: png.length };
}

function tiposDelDia(filas, employeeId) {
  return (filas || [])
    .filter((p) => Number(p?.employee_id) === Number(employeeId))
    .map((p) => String(p?.type || ""))
    .filter((t) => PIERNAS.includes(t));
}

// El ambiente no se adivina por el nombre del host: en Railway los dos terminan en `-production`.
// Solo se mide el archivo cuyo TARGET_ENV coincide con lo que su nombre afirma, y `local.env` queda
// fuera porque el puesto no sirve el binario que se promociona.
function ambienteAceptado({ nombreEnv, declarado }) {
  const ambiente = String(declarado || "").toLowerCase();
  if (nombreEnv === "qa.env") return ambiente === "qa";
  if (nombreEnv === "production.env") return ["production", "prod"].includes(ambiente);
  return false;
}

function selftest() {
  const filasNuestras = [{ id: 9, employee_id: 7, type: "salida", punched_at: "2026-11-23T13:00:00.000Z", idempotency_key: "ladder-7-salida" }];
  const filasAjenas = [{ id: 9, employee_id: 7, type: "salida", punched_at: "2026-11-23T13:00:00.000Z", idempotency_key: "clave-ajena" }];
  const filaOtraHora = [{ id: 9, employee_id: 7, type: "salida", punched_at: "2026-11-23T09:00:00.000Z", idempotency_key: "ladder-7-salida" }];
  const caso = { employeeId: 7, idempotencyKey: "ladder-7-salida", tipo: "salida", punchedAt: "2026-11-23T13:00:00.000Z" };
  const rechazoSinEsperada = { status: 409, code: "MARCACION_FUERA_DE_SECUENCIA", details: { punch_type: "salida" }, esperado: "MARCACION_FUERA_DE_SECUENCIA", intentada: { esperada: "inicio_almuerzo" } };
  const rechazoCompleto = { status: 409, code: "MARCACION_FUERA_DE_SECUENCIA", details: { punch_type: "salida", expected_type: "inicio_almuerzo" }, esperado: "MARCACION_FUERA_DE_SECUENCIA", intentada: { esperada: "inicio_almuerzo" } };
  const rechazo400 = { status: 400, code: "VALIDACION", details: null, esperado: "MARCACION_FUERA_DE_SECUENCIA", intentada: { esperada: "inicio_almuerzo" } };
  const casos = [
    ["un_409_con_expected_type_si_certifica_rechazo_legible", rechazoLegible(rechazoCompleto).cumple === true],
    ["un_409_sin_expected_type_NO_puede_certificar_rechazo_legible", rechazoLegible(rechazoSinEsperada).cumple === false],
    ["un_400_cualquiera_NO_es_rechazo_de_escalera", rechazoLegible(rechazo400).cumple === false],
    ["nuestra_clave_con_nuestra_hora_esta_asentada", piernaAsentada(filasNuestras, caso).asentada === true],
    ["la_misma_pierna_escrita_por_otro_NO_certifica_el_destrabe", piernaAsentada(filasAjenas, caso).asentada === false],
    ["nuestra_clave_con_otra_hora_NO_esta_asentada", piernaAsentada(filaOtraHora, caso).asentada === false],
    ["una_lectura_vacia_se_declara_ciega_no_verde", piernaAsentada([], caso).ciego === true && piernaAsentada([], caso).asentada === false],
    ["el_dia_cierra_cuando_las_cuatro_piernas_estan", tiposDelDia([
      { employee_id: 7, type: "entrada" }, { employee_id: 7, type: "inicio_almuerzo" },
      { employee_id: 7, type: "fin_almuerzo" }, { employee_id: 7, type: "salida" },
      { employee_id: 8, type: "entrada" }
    ], 7).join(",") === "entrada,inicio_almuerzo,fin_almuerzo,salida"],
    ["el_arbol_servido_sin_el_fix_no_puede_declararse_arreglo", evaluarPierna({ esperado: "arreglo", observado: "arreglo", ancla: "defecto" }).cumple === false],
    ["la_peticion_en_defecto_no_puede_declararse_arreglo", evaluarPierna({ esperado: "arreglo", observado: "defecto", ancla: "arreglo" }).cumple === false],
    ["defecto_declarado_defecto_y_servido_si_cumple", evaluarPierna({ esperado: "defecto", observado: "defecto", ancla: "defecto" }).cumple === true],
    ["un_codigo_desconocido_nunca_cumple", evaluarPierna({ esperado: "arreglo", observado: "arreglo", ancla: "desconocida" }).cumple === false],
    ["--flag=valor_y_--flag_valor_resuelven_igual", (() => {
      const a = parseArgs(["--env-file=config/qa.env", "--espera", "arreglo"]);
      return a["env-file"] === "config/qa.env" && a.espera === "arreglo";
    })()],
    ["una_bandera_de_valor_sin_valor_se_niega_en_vez_de_volverse_true", (() => {
      const a = parseArgs(["--espera", "--output=x.json"]);
      return a.espera === true;
    })()],
    ["el_ambiente_del_archivo_manda_sobre_lo_que_se_cree", (() => {
      const qa = ambienteAceptado({ nombreEnv: "qa.env", declarado: "QA" });
      const seCreeQaPeroEsProd = ambienteAceptado({ nombreEnv: "qa.env", declarado: "production" });
      const local = ambienteAceptado({ nombreEnv: "local.env", declarado: "local" });
      const prod = ambienteAceptado({ nombreEnv: "production.env", declarado: "prod" });
      return qa === true && prod === true && seCreeQaPeroEsProd === false && local === false;
    })()]
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
  console.log(`SELFTEST APROBADO (${casos.length} casos): tres de ellos son rojos obligatorios (rechazo mudo, clave ajena, ancla que contradice).`);
  return 0;
}

async function main() {
  const args = parseArgs();
  if (args.selftest) return selftest();

  const envFile = path.resolve(ROOT, String(args["env-file"] || ""));
  if (!fs.existsSync(envFile)) throw new Error("--env-file apunta a un archivo inexistente");
  const nombreEnv = path.basename(envFile);
  if (!["qa.env", "production.env"].includes(nombreEnv)) {
    throw new Error(`Solo se mide contra config/qa.env o config/production.env (recibi ${nombreEnv}).`);
  }
  const esperado = String(args.espera || "");
  if (!["defecto", "arreglo"].includes(esperado)) throw new Error("--espera=defecto|arreglo es obligatorio");
  const fixCommit = String(args["fix-commit"] || FIX_DE_REFERENCIA);
  const output = path.resolve(ROOT, String(args.output || ""));
  if (!args.output) throw new Error("--output es obligatorio para poder versionar la corrida");

  require("../load-env")(envFile);
  const ambiente = String(process.env.TARGET_ENV || process.env.APP_ENV || "").toLowerCase();
  const apiUrl = String(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!apiUrl) throw new Error("El archivo de ambiente no declara NEXT_PUBLIC_API_URL");
  if (!ambienteAceptado({ nombreEnv, declarado: ambiente })) {
    throw new Error(`${path.basename(envFile)} declara ambiente "${ambiente || "ninguno"}": la corrida se niega a medir un ambiente que no coincide con el archivo.`);
  }
  const ref = String(process.env.EXPECTED_SUPABASE_PROJECT_REF || "").trim();
  if (ref && !String(process.env.DATABASE_URL || "").includes(ref)) throw new Error(`DATABASE_URL no pertenece al project ref ${ref}`);

  const prisma = require("../../apps/api/src/core/prisma");
  const bcrypt = require("bcrypt");
  const RUN = Date.now().toString().slice(-7);
  const DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const cheques = [];
  const tiempos = [];
  const ids = { usuarios: [], empleados: [] };

  const registrar = (nombre, ok, detalle = {}) => {
    cheques.push({ name: nombre, ok: Boolean(ok), detail: detalle });
    console.error(`${ok ? "OK   " : "FALLO"} ${nombre} :: ${JSON.stringify(detalle).slice(0, 220)}`);
    return Boolean(ok);
  };

  async function pedir(ruta, { method = "GET", token, payload } = {}) {
    const iniciado = Date.now();
    const response = await fetch(`${apiUrl}${ruta}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { "content-type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(60000)
    }).catch((error) => ({ status: 0, _error: error }));
    const duracion = Date.now() - iniciado;
    if (response.status === 0) return { status: 0, body: { code: "SIN_RESPUESTA" }, duracion };
    const texto = await response.text();
    let body = {};
    try { body = texto ? JSON.parse(texto) : {}; } catch { body = { crudo: String(texto).slice(0, 160) }; }
    tiempos.push({ ruta, method, status: response.status, ms: duracion });
    return { status: response.status, body, code: body?.code || body?.error?.code || "", details: body?.details || body?.error?.details || null, duracion };
  }

  const reporte = {
    certification: "hr-marking-ladder-field",
    version: 1,
    ambiente: nombreEnv === "qa.env" ? "QA" : "PRODUCCION",
    instruccion: "Escalera de marcacion con correccion administrativa motivada, medida sobre el binario desplegado",
    generado_en: new Date().toISOString(),
    env_file: path.relative(ROOT, envFile).replace(/\\/g, "/"),
    api_host: apiUrl.replace(/^https?:\/\/([^/]+).*$/, "$1"),
    script_sha256: sha256(fs.readFileSync(__filename)),
    dia_operativo: DIA,
    run: RUN,
    compromiso_del_arreglo: { fix_de_referencia: fixCommit, servidor_lee: "git merge-base --is-ancestor" },
    cheques,
    tiempos,
    ids,
    presupuesto_ms: PRESUPUESTO_MS
  };

  // 1) Ancla de despliegue.
  const health = await pedir("/health");
  const servido = String(health.body?.commit || "");
  let ancla = "desconocida";
  try {
    execFileSync("git", ["cat-file", "-e", `${servido}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", fixCommit, servido], { cwd: ROOT, stdio: "ignore" });
      ancla = "arreglo";
    } catch {
      ancla = "defecto";
    }
  } catch {
    ancla = "desconocida";
  }
  reporte.despliegue = { status: health.status, commit_servido: servido, codigo_servido_contiene_el_fix: ancla };
  registrar("health_ancla_el_commit_servido", health.status === 200 && servido.length >= 12, { status: health.status, commit: servido, ancla });

  // 2) Empresa modelo y cuenta efimera con permiso administrativo.
  const empresa = await prisma.tenant.findFirst({ where: { name: { contains: "NYVORA", mode: "insensitive" } }, orderBy: { name: "asc" } });
  if (!empresa) throw new Error(`No existe el tenant NYVORA en ${reporte.ambiente}: la medicion exige la empresa modelo.`);
  reporte.tenant = { id: empresa.id, licencia_admin: (empresa.active_modules || []).length };
  const rolAdmin = await prisma.role.findFirst({ where: { tenant_id: empresa.id, name: "APEX_ADMIN" } });
  const rolOperario = await prisma.role.findFirst({ where: { tenant_id: empresa.id, name: { not: "APEX_ADMIN" } }, orderBy: { id: "asc" } });

  async function cuenta({ rol, nombre }) {
    const correo = `cert.ladder.${RUN}.${nombre}@internal.apexos.local`;
    const clave = `Cert${crypto.randomBytes(6).toString("hex")}#1`;
    const creado = await prisma.user.create({
      data: { tenant_id: empresa.id, name: `CERT LADDER ${RUN} ${nombre}`, email: correo, password: await bcrypt.hash(clave, 12), role_id: rol.id, active: true },
      select: { id: true }
    });
    const login = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correo, password: clave } });
    ids.usuarios.push(creado.id);
    return { id: creado.id, correo, clave, token: String(login.body?.token || ""), status: login.status, rol_nombre: rol.name };
  }

  const admin = await cuenta({ rol: rolAdmin, nombre: "a" });
  // El tenant vecino tiene que traer Talentos Humanos y Administracion licenciados: con un tenant sin
  // licencias el primer request muere en MODULO_NO_HABILITADO y la prueba de aislamiento entre tenants
  // queda verde sin haber tocado nunca la frontera de tenant (control que no puede fallar).
  const LICENCIAS_HR = new Set(["talento_humano", "hr", "m-04", "m-05"]);
  const LICENCIAS_ADMIN = new Set(["administracion_apex", "administracion", "admin", "m-22", "roles", "usuarios"]);
  const vecinos = await prisma.tenant.findMany({ select: { id: true, name: true, active_modules: true }, orderBy: { created_at: "desc" } });
  const vecino = vecinos.find((item) => {
    const modulos = (item.active_modules || []).map((modulo) => String(modulo).toLowerCase());
    return item.id !== empresa.id && !/NYVORA/i.test(item.name)
      && modulos.some((modulo) => LICENCIAS_HR.has(modulo))
      && modulos.some((modulo) => LICENCIAS_ADMIN.has(modulo));
  }) || null;
  reporte.tenant_vecino = vecino ? { id: vecino.id, modulos_licenciados: (vecino.active_modules || []).length } : null;
  const rolVecino = vecino ? await prisma.role.findFirst({ where: { tenant_id: vecino.id, name: "APEX_ADMIN" } }) : null;
  let adminVecino = { id: null, token: "", correo: "", clave: "" };
  if (vecino && rolVecino) {
    const correo = `cert.ladder.${RUN}.x@internal.apexos.local`;
    const clave = `CertX${crypto.randomBytes(6).toString("hex")}#1`;
    const creado = await prisma.user.create({
      data: { tenant_id: vecino.id, name: `CERT LADDER ${RUN} X`, email: correo, password: await bcrypt.hash(clave, 12), role_id: rolVecino.id, active: true },
      select: { id: true }
    });
    const login = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: correo, password: clave } });
    adminVecino = { id: creado.id, correo, clave, token: String(login.body?.token || ""), status: login.status };
    ids.usuarios.push(creado.id);
  }
  registrar("sesion_efimera_en_la_empresa_modelo", Boolean(admin.token) && admin.status === 200, { user_id: admin.id, login: admin.status });
  registrar("sesion_efimera_en_tenant_vecino", Boolean(adminVecino.token), { user_id: adminVecino.id, login: adminVecino.status });

  // 3) Empleado efimero sin jornada previa: la medicion no puede apoyarse en datos ajenos.
  const codigo = `CERTL${RUN}`;
  const empleado = await prisma.employee.create({
    data: {
      tenant_id: empresa.id, code: codigo, user_type: "operario", position: "Prueba certificada", department: "QA",
      salary_base: 1300000, salary_type: "monthly", hire_date: new Date(), active: true,
      metadata: { name: codigo, can_punch_time: true, operational_classification: "operario", cert_run: RUN }
    },
    select: { id: true }
  });
  ids.empleados.push(empleado.id);
  const lectura = async () => {
    const res = await pedir(`/api/v1/hr/attendance?date=${DIA}&limit=500`, { token: admin.token });
    const filas = (res.body?.rows || res.body?.data || res.body || []).flatMap?.((r) => (Array.isArray(r?.punches) ? r.punches : [])) || [];
    return { status: res.status, filas };
  };
  const diaAntes = await lectura();
  registrar("empleado_efimero_sin_jornada", diaAntes.filas.filter((p) => Number(p?.employee_id) === Number(empleado.id)).length === 0, {
    employee_id: empleado.id, lectura: diaAntes.status, filas_antes: diaAntes.filas.length
  });

  // 4) Apertura por el canal administrativo (el que usa el boton de correccion).
  const horaEntrada = new Date(Date.now() - 3 * 3600_000).toISOString();
  const apertura = await pedir("/api/v1/hr/time-punches", {
    method: "POST", token: admin.token,
    payload: { employee_id: empleado.id, user_name: codigo, type: "entrada", punched_at: horaEntrada, idempotency_key: `ladder-${RUN}-entrada` }
  });
  const leidoApertura = await lectura();
  const asentadaApertura = piernaAsentada(leidoApertura.filas, { employeeId: empleado.id, idempotencyKey: `ladder-${RUN}-entrada`, tipo: "entrada", punchedAt: horaEntrada });
  registrar("entrada_administrativa_abre_la_jornada", apertura.status < 300 && asentadaApertura.asentada, {
    status: apertura.status, code: apertura.code, asentada: asentadaApertura.asentada, ciego: asentadaApertura.ciego, ms: apertura.duracion
  });

  // 5) El rechazo de escalera tiene que nombrar la marcacion que sigue.
  const horaSalida = new Date(Date.now() - 30 * 60_000).toISOString();
  const rechazo = await pedir("/api/v1/hr/time-punches", {
    method: "POST", token: admin.token,
    payload: { employee_id: empleado.id, user_name: codigo, type: "salida", punched_at: horaSalida, idempotency_key: `ladder-${RUN}-salida` }
  });
  const legible = rechazoLegible({
    status: rechazo.status, code: rechazo.code, details: rechazo.details,
    esperado: "MARCACION_FUERA_DE_SECUENCIA", intentada: { esperada: "inicio_almuerzo" }
  });
  registrar("rechazo_de_escalera_es_legible", legible.cumple && ancla === esperado, {
    status: rechazo.status, code: rechazo.code, details: rechazo.details, fallos: legible.fallos, ancla, esperado
  });

  // 6) Sin motivo no hay exception.
  const sinMotivo = await pedir("/api/v1/hr/time-punches", {
    method: "POST", token: admin.token,
    payload: { employee_id: empleado.id, user_name: codigo, type: "salida", punched_at: horaSalida, correccion_administrativa: true, idempotency_key: `ladder-${RUN}-nomotivo` }
  });
  registrar("correccion_sin_motivo_se_niega", sinMotivo.status === 422 && sinMotivo.code === "MOTIVO_CORRECCION_REQUERIDO" && sinMotivo.details?.field === "motivo_correccion", {
    status: sinMotivo.status, code: sinMotivo.code, field: sinMotivo.details?.field || null
  });

  // 7) La correccion motivada destraba y queda auditable.
  const correccion = await pedir("/api/v1/hr/time-punches", {
    method: "POST", token: admin.token,
    payload: {
      employee_id: empleado.id, user_name: codigo, type: "salida", punched_at: horaSalida,
      correccion_administrativa: true, motivo_correccion: `Certificacion ${RUN}: la jornada quedo abierta por un eslabon perdido y se cierra por el canal administrativo.`,
      idempotency_key: `ladder-${RUN}-salida`
    }
  });
  const leidoCorreccion = await lectura();
  const tipos = tiposDelDia(leidoCorreccion.filas, empleado.id);
  const asentadaSalida = piernaAsentada(leidoCorreccion.filas, { employeeId: empleado.id, idempotencyKey: `ladder-${RUN}-salida`, tipo: "salida", punchedAt: horaSalida });
  const novedades = await pedir(`/api/v1/hr/novelties?date=${DIA}&type=AJUSTE_MANUAL_MARCACION&limit=500`, { token: admin.token });
  const filasNovedad = (novedades.body?.rows || novedades.body?.data || novedades.body || []).filter?.((n) => Number(n?.employee_id) === Number(empleado.id)) || [];
  const auditable = filasNovedad.some((n) => String(JSON.stringify(n?.metadata || {})).includes("escalera:esperada:inicio_almuerzo"));
  registrar("correccion_motivada_destraba_la_jornada", correccion.status < 300 && asentadaSalida.asentada && tipos.includes("salida"), {
    status: correccion.status, code: correccion.code, asentada: asentadaSalida.asentada, motivo_lectura: asentadaSalida.motivo, tipos, ms: correccion.duracion
  });
  registrar("la_correccion_deja_novedad_auditable", auditable, {
    status: novedades.status, filas: filasNovedad.length, saltos: filasNovedad.map((n) => String(n?.metadata?.detail || "")).slice(0, 3)
  });

  // 8) Cerrada la jornada, la escalera sigue siendo control de asistencia.
  const duplicada = await pedir("/api/v1/hr/time-punches", {
    method: "POST", token: admin.token,
    payload: { employee_id: empleado.id, user_name: codigo, type: "salida", punched_at: new Date().toISOString(), idempotency_key: `ladder-${RUN}-doble` }
  });
  registrar("jornada_cerrada_sigue_bloqueada", duplicada.status === 409 && duplicada.code === "JORNADA_COMPLETA" && duplicada.details?.punch_type === "salida", {
    status: duplicada.status, code: duplicada.code, details: duplicada.details
  });

  // 9) Aislamiento: el administrador de otra empresa no escribe ni lee esta jornada.
  const ajeno = await pedir("/api/v1/hr/time-punches", {
    method: "POST", token: adminVecino.token,
    payload: {
      employee_id: empleado.id, user_name: codigo, type: "inicio_almuerzo", punched_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
      correccion_administrativa: true, motivo_correccion: `Intento de medicion entre tenants ${RUN}: no debe escribir nada.`, idempotency_key: `ladder-${RUN}-ajeno`
    }
  });
  const leidoAjeno = await lectura();
  const tiposAjeno = tiposDelDia(leidoAjeno.filas, empleado.id);
  registrar("otro_tenant_no_escribe_la_jornada", ajeno.status >= 400 && tiposAjeno.join(",") === tipos.join(","), {
    status: ajeno.status, code: ajeno.code, tipos_antes: tipos, tipos_despues: tiposAjeno
  });

  // 10) Datos vacios y tiempos: la pantalla no puede romperse por un dia sin marcas ni por lentitud.
  const vacio = await pedir(`/api/v1/hr/attendance?date=2020-01-01&limit=10`, { token: admin.token });
  const peor = tiempos.reduce((acc, item) => (item.ms > (acc?.ms || 0) ? item : acc), null);
  const filasVacio = vacio.body?.rows || vacio.body?.data || (Array.isArray(vacio.body) ? vacio.body : []);
  registrar("dia_sin_datos_responde_200", vacio.status === 200 && Array.isArray(filasVacio), { status: vacio.status, filas: filasVacio.length });
  registrar("toda_escritura_dentro_del_presupuesto", tiempos.every((item) => item.method === "POST" ? item.ms <= PRESUPUESTO_MS : true), { peor, presupuesto_ms: PRESUPUESTO_MS });

  // 10) El canal propio ignora la bandera: la excepcion a la escalera vive solo en el canal
  //     administrativo. Se compara la misma marcacion con y sin bandera para que el verde no pueda
  //     atribuirse a que el canal esta roto: la `entrada` del mismo operario si entro.
  const rolEmpleado = await prisma.role.findFirst({ where: { tenant_id: empresa.id, name: "Empleado" } }) || rolOperario;
  const operario = await cuenta({ rol: rolEmpleado, nombre: "o" });
  const codigoPropio = `CERTL${RUN}O`;
  const empleadoPropio = await prisma.employee.create({
    data: {
      tenant_id: empresa.id, user_id: operario.id, code: codigoPropio, user_type: "operario", position: "Prueba certificada",
      department: "QA", salary_base: 1300000, hire_date: new Date(), active: true,
      metadata: { name: codigoPropio, can_punch_time: true, operational_classification: "operario", cert_run: RUN }
    },
    select: { id: true }
  });
  ids.empleados.push(empleadoPropio.id);
  const selfie = pngSelfie(320);
  const foto = () => ({ base64: selfie.base64, name: `identity-${RUN}.png`, type: "image/png", size: selfie.bytes });
  const aperturaPropia = await pedir("/api/v1/hr/self/time-punches", {
    method: "POST", token: operario.token,
    payload: {
      employee_id: empleadoPropio.id, user_name: codigoPropio, type: "entrada",
      punched_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      identity_photo: foto()
    }
  });
  // Las dos intentadas llevan la misma selfie: sin ella el canal propio muere en SELFIE_REQUERIDA antes
  // de llegar a la escalera y el control quedaria verde por una razon que no prueba nada del flag.
  const sinBandera = await pedir("/api/v1/hr/self/time-punches", {
    method: "POST", token: operario.token,
    payload: { employee_id: empleadoPropio.id, user_name: codigoPropio, type: "salida", punched_at: new Date(Date.now() - 30 * 60_000).toISOString(), identity_photo: foto() }
  });
  const conBandera = await pedir("/api/v1/hr/self/time-punches", {
    method: "POST", token: operario.token,
    payload: {
      employee_id: empleadoPropio.id, user_name: codigoPropio, type: "salida", punched_at: new Date(Date.now() - 25 * 60_000).toISOString(),
      identity_photo: foto(),
      correccion_administrativa: true, motivo_correccion: `Intento de forjar la excepcion desde el canal propio ${RUN}.`,
      idempotency_key: `ladder-${RUN}-propio`
    }
  });
  const leidoPropio = await lectura();
  const forjada = piernaAsentada(leidoPropio.filas, { employeeId: empleadoPropio.id, idempotencyKey: `ladder-${RUN}-propio`, tipo: "salida", punchedAt: new Date(Date.now() - 25 * 60_000).toISOString() });
  registrar("canal_propio_no_forja_la_correccion", aperturaPropia.status < 300 && conBandera.code === "MARCACION_FUERA_DE_SECUENCIA" && conBandera.status >= 400 && !forjada.asentada && conBandera.code === sinBandera.code, {
    apertura: aperturaPropia.status, sin_bandera: { status: sinBandera.status, code: sinBandera.code }, con_bandera: { status: conBandera.status, code: conBandera.code }, asentada: forjada.asentada
  });

  // Medicion declarada (no es promesa de este corte): el rol generico de empleado trae `hr:write` en
  // la empresa modelo, asi que alcanza el canal administrativo con la bandera. Se registra con su
  // evidencia para que el dueno y seguridad decidan la frontera; no se cambia la conducta en una
  // promocion que no lo autorizo.
  const pruebaRolGenerico = await pedir("/api/v1/hr/time-punches", {
    method: "POST", token: operario.token,
    payload: {
      employee_id: empleadoPropio.id, user_name: codigoPropio, type: "salida", punched_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      correccion_administrativa: true, motivo_correccion: `Medicion del alcance del permiso ${RUN}: hasta donde llega hr:write con la bandera.`,
      idempotency_key: `ladder-${RUN}-generico`
    }
  });
  const leidoGenerico = await lectura();
  reporte.hallazgo_autorizacion = {
    descripcion: "El rol generico de la empresa modelo trae hr:write, que es el permiso del canal administrativo donde vive la excepcion de escalera.",
    rol: rolEmpleado?.name || null,
    endpoint: "/api/v1/hr/time-punches",
    status: pruebaRolGenerico.status,
    code: pruebaRolGenerico.code || null,
    pierna_asentada: piernaAsentada(leidoGenerico.filas, { employeeId: empleadoPropio.id, idempotencyKey: `ladder-${RUN}-generico`, tipo: "salida", punchedAt: new Date(Date.now() - 20 * 60_000).toISOString() }).asentada,
    decision_pendiente: "acotar la excepcion a rol administrativo (precedente: BIOMETRIA_RESTABLECER_DENEGADO) o aceptar que hr:write la conserve"
  };
  registrar("el_canal_propio_sigue_vivo_para_el_mismo_operario", aperturaPropia.status < 300 && tiposDelDia(leidoPropio.filas, empleadoPropio.id).length >= 1, {
    apertura: aperturaPropia.status, tipos: tiposDelDia(leidoPropio.filas, empleadoPropio.id)
  });

  // 11) Retiro por el endpoint, no por UPDATE: la cuenta deja de servir sesion con su clave real.
  //     El administrador se retira al final: su token es el que autoriza los otros dos retiros, y una
  //     cuenta inactiva revoca sus sesiones en el acto (medido: 401 USER_REVOKED).
  const retiro = [];
  for (const usuario of [{ cuenta: operario, token: admin.token }, { cuenta: adminVecino, token: adminVecino.token }, { cuenta: admin, token: admin.token }]) {
    if (!usuario.cuenta.id) continue;
    const res = await pedir(`/api/v1/admin/users/${usuario.cuenta.id}/status`, { method: "PATCH", token: usuario.token, payload: { active: false } });
    const trasRetiro = await pedir("/api/v1/auth/login", { method: "POST", payload: { email: usuario.cuenta.correo, password: usuario.cuenta.clave } });
    retiro.push({ user_id: usuario.cuenta.id, status: res.status, code: res.code || null, login_tras_retiro: trasRetiro.status });
  }
  registrar("cuentas_efimeras_retiradas_por_el_endpoint", retiro.length === 3 && retiro.every((item) => item.status < 300 && item.login_tras_retiro >= 400), { retiro });
  for (const idEmpleado of [...ids.empleados, empleado.id]) {
    await prisma.employee.update({ where: { id: idEmpleado }, data: { active: false } }).catch(() => null);
  }

  const fallidos = cheques.filter((c) => !c.ok);
  reporte.veredicto = { total: cheques.length, pasaron: cheques.length - fallidos.length, fallaron: fallidos.length, estado: fallidos.length ? "BLOQUEADO" : "APROBADO" };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(reporte, null, 2)}\n`);
  console.error(`\n${reporte.veredicto.estado}: ${reporte.veredicto.pasaron}/${reporte.veredicto.total} controles -> ${path.relative(ROOT, output)}`);
  if (fallidos.length) fallidos.forEach((c) => console.error(`- ${c.name}: ${JSON.stringify(c.detail).slice(0, 200)}`));
  await prisma.$disconnect().catch(() => null);
  return fallidos.length ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }).catch(async (error) => {
  console.error(`CORRIDA BLOQUEADA: ${error?.message || error}`);
  process.exitCode = 1;
});
