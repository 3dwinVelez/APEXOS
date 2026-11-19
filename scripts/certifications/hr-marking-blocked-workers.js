// Triaje de desbloqueo: que trabajadores NO pudieron marcar y por que.
//
// Solo lectura. No escribe marcaciones, no reintentia colas y no toca ningun
// ambiente que no sea el que declara el archivo de ambiente pasado por
// argumento: la salida nombra siempre el archivo resuelto, el host de la base y
// el dia medido, porque un numero sin destino no sustenta una decision.
//
//   node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env
//   node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/qa.env --date=2026-11-18
//   node scripts/certifications/hr-marking-blocked-workers.js --selftest
//
// La ventana es la jornada colombiana (UTC-5): 05:00Z del dia hasta 05:00Z del
// siguiente. Las marcaciones se filtran por la columna `date`, que ya guarda el
// dia calendario; los rechazos se filtran por `timestamp` porque el operario
// reclama en la hora local de su telefono.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const COLOMBIA_OFFSET_HOURS = 5;
const DEFAULT_DAYS = 3;

// `--flag=valor` y `--flag valor` resuelven igual. Una compuerta que pierde su
// argumento en silencio mide el ambiente predeterminado creyendo medir otro,
// y el selftest de abajo falla si alguna de las dos formas deja de funcionar.
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

function parseFailures(argv) {
  const failures = [];
  const parsed = parseArgs(argv);
  for (const key of ["env-file", "date", "days", "output"]) {
    if (parsed[key] === true) failures.push(`--${key} quedo sin valor`);
  }
  return failures;
}

function todayInColombia(now = new Date()) {
  const shifted = new Date(now.getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function dayWindow(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText))) throw new Error(`--date invalido: ${dateText}`);
  const start = new Date(`${dateText}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime())) throw new Error(`--date invalido: ${dateText}`);
  const from = new Date(start.getTime() + COLOMBIA_OFFSET_HOURS * 3600 * 1000);
  const to = new Date(from.getTime() + 24 * 3600 * 1000);
  return { from, to };
}

function loadEnvFile(envFile) {
  if (!fs.existsSync(envFile)) throw new Error(`No existe el archivo de ambiente: ${envFile}`);
  const values = {};
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

// Nunca se imprime la cadena de conexion: solo el host, que es lo que permite
// afirmar a que ambiente se le pregunto.
function hostOf(url) {
  try {
    return new global.URL(url).hostname;
  } catch {
    return "(ilegible)";
  }
}

function isoDay(value) {
  // `String(new Date())` devuelve "Wed Nov 18 2026 ..." y comparar eso contra un ISO da
  // siempre distinto: el dia calendario se extrae SIEMPRE del UTC de la fecha.
  return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
}

function messageKey(message = "") {
  return String(message).replace(/req-[0-9a-z-]+/gi, "req-*").slice(0, 160);
}

// El nombre completo de un trabajador es registro laboral, no diagnóstico: para actuar alcanza con
// el `user`/`emp`, que es lo que el supervisor busca en la ficha. La salida por consola conserva el
// nombre porque quien opera necesita reconocer a la persona en pantalla; el artefacto versionado se
// genera con `--sin-nombres`. En este tenant el nombre también viaja disfrazado de otro campo —
// `employee.code` guarda el nombre legal (no hay código) y el correo es `nombreapellido@apexos.local`
// — así que la poda no puede quedarse en `nombre`: esos tres son identificadores directos.
const CLAVES_DE_IDENTIDAD = ["nombre", "name", "user_name", "apellidos", "empleado_codigo", "codigo", "user_email", "email"];

function stripNames(value) {
  if (Array.isArray(value)) return value.map(stripNames);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    // `codigos` (HTTP) y `codigo` (nombre legal en este tenant) conviven en la misma fila: la
    // comparación es exacta, nunca por prefijo.
    if (CLAVES_DE_IDENTIDAD.includes(key)) continue;
    out[key] = stripNames(item);
  }
  return out;
}

function deviceKey(userAgent = "") {
  const ua = String(userAgent);
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : "otro";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "otro";
  const version = browser === "Chrome" ? (/Chrome\/(\d+)/.exec(ua) || [])[1] : (/version\/(\d+)/i.exec(ua) || [])[1];
  return `${os} / ${browser}${version ? ` ${version}` : ""}`;
}

function normalize(row) {
  const value = row.new_value && typeof row.new_value === "object" ? row.new_value : {};
  return {
    at: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
    tenant_id: row.tenant_id,
    user_id: row.user_id ?? null,
    user_email: value.metadata && value.metadata.user_email ? value.metadata.user_email : null,
    level: value.level || null,
    source: value.source || "api",
    status: value.status_code ?? null,
    code: value.code || null,
    route: value.route || row.entity || null,
    method: value.method || null,
    message: messageKey(value.message),
    detail: String(value.detail || "").replace(/req-[0-9a-z-]+/gi, "req-*").slice(0, 120),
    device: deviceKey(row.user_agent),
    request_id: value.request_id || null
  };
}

function groupBy(rows, keyOf) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  return buckets;
}

async function main() {
  const args = parseArgs();

  if (args.selftest) {
    const cases = [
      { argv: ["--env-file=config/production.env", "--date=2026-11-18"], expect: { "env-file": "config/production.env", date: "2026-11-18" } },
      { argv: ["--env-file", "config/qa.env", "--date", "2026-11-17"], expect: { "env-file": "config/qa.env", date: "2026-11-17" } }
    ];
    let failed = 0;
    for (const testCase of cases) {
      const parsed = parseArgs(testCase.argv);
      for (const [key, value] of Object.entries(testCase.expect)) {
        const ok = parsed[key] === value;
        if (!ok) failed += 1;
        console.log(`${ok ? "ok  " : "FALLO"} --${key}=${JSON.stringify(parsed[key])} esperado ${JSON.stringify(value)} (argv: ${testCase.argv.join(" ")})`);
      }
    }
    const drifted = parseFailures(["--env-file"]);
    console.log(`${drifted.length === 1 ? "ok  " : "FALLO"} la compuerta detecta un --env-file sin valor (rojo provocado): ${JSON.stringify(drifted)}`);
    const quiet = parseFailures(["--env-file=config/qa.env", "--date", "2026-11-17"]);
    console.log(`${quiet.length === 0 ? "ok  " : "FALLO"} ambas formas de argumento resuelven sin arrastrar el predeterminado: ${JSON.stringify(quiet)}`);
    const window = dayWindow("2026-11-19");
    const windowOk = window.from.toISOString() === "2026-11-19T05:00:00.000Z" && window.to.toISOString() === "2026-11-20T05:00:00.000Z";
    console.log(`${windowOk ? "ok  " : "FALLO"} ventana de jornada colombiana: ${window.from.toISOString()} .. ${window.to.toISOString()}`);
    console.log(`${deviceKey("Mozilla/5.0 (Linux; Android 10) Chrome/157.0.0.0 Mobile Safari/537.36") === "Android / Chrome 157" ? "ok  " : "FALLO"} agrupacion de dispositivo`);
    const isoOk = isoDay(new Date("2026-11-18T23:30:00.000Z")) === "2026-11-18" && isoDay("2026-11-19T05:00:00.000Z") === "2026-11-19";
    console.log(`${isoOk ? "ok  " : "FALLO"} dia calendario ISO (no el texto legible del Date): ${isoDay(new Date("2026-11-18T23:30:00.000Z"))}`);
    // El artefacto versionable tiene que poder probarse sin nombres y sin quedarse ciego: la prueba es
    // que sobra toda identidad directa (nombre, el `code` que en este tenant ES el nombre legal y el
    // correo cuya parte local tambien lo es) y que siguen el id, el dia y los codigos HTTP con los que
    // el supervisor opera.
    const muestra = {
      trabajadores_afectados: [{ nombre: "Uno Dos Tres", empleado_codigo: "Uno Dos Tres", user_email: "unodostres@apexos.local", user_id: 231, empleado_id: 503, codigos: [409, "VALIDACION"], dispositivos: ["Android / Chrome 157"] }],
      jornadas_sin_registro: [{ codigo: "Uno Dos Tres", nombre: "Uno Dos Tres", user_email: "unodostres@apexos.local", empleado_id: 503, dia: "2026-11-18", codigos: [409] }],
      medicion: { total_rechazos: 2 }
    };
    const podado = JSON.stringify(stripNames(muestra));
    const namesOut = !podado.includes("Uno Dos Tres") && !podado.includes("unodostres") && !/"nombre"/.test(podado) && !/"empleado_codigo"/.test(podado) && !/"user_email"/.test(podado) && !/"codigo":/.test(podado);
    const idsDentro = podado.includes('"user_id":231') && podado.includes('"empleado_id":503') && podado.includes("2026-11-18") && podado.includes("409") && podado.includes("VALIDACION") && podado.includes("Chrome 157");
    const intacto = podado.includes("total_rechazos");
    console.log(`${namesOut ? "ok  " : "FALLO"} --sin-nombres poda nombre, empleado_codigo, codigo y correo en cualquier nivel`);
    console.log(`${idsDentro && intacto ? "ok  " : "FALLO"} la medicion conserva user/emp/dia y los codigos HTTP (rojo provocado si se poda de mas)`);
    const outcome = failed === 0 && drifted.length === 1 && quiet.length === 0 && windowOk && isoOk && namesOut && idsDentro && intacto ? 0 : 1;
    console.log(outcome === 0 ? "SELFTEST PASADO" : "SELFTEST BLOQUEADO");
    process.exit(outcome);
  }

  const envFile = path.resolve(ROOT, String(args["env-file"] || ""));
  if (!args["env-file"]) throw new Error("Falta --env-file=config/<ambiente>.env: esta medicion nunca usa el ambiente predeterminado.");
  const env = loadEnvFile(envFile);
  const declared = env.TARGET_ENV || env.APP_ENV || "(sin declarar)";
  const databaseUrl = env.DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error(`El archivo ${path.relative(ROOT, envFile)} no entrega DATABASE_URL.`);
  const expected = args.expect ? String(args.expect) : null;
  if (expected && declared !== expected) throw new Error(`El ambiente declarado es ${declared} y se pidio ${expected}: se detiene la medicion.`);

  const dateText = args.date ? String(args.date) : todayInColombia();
  const days = Math.max(1, Math.min(Number(args.days || DEFAULT_DAYS), 30));
  const dayStart = dayWindow(dateText);
  const window = { from: new Date(dayStart.from.getTime() - (days - 1) * 24 * 3600 * 1000), to: dayStart.to };

  process.env.DATABASE_URL = databaseUrl;
  const { PrismaClient } = require(path.join(ROOT, "node_modules/@prisma/client/default.js"));
  const prisma = new PrismaClient();

  try {
    console.log(`MEDICION  archivo de ambiente: ${path.relative(ROOT, envFile)}`);
    console.log(`MEDICION  ambiente declarado: ${declared} | host: ${hostOf(databaseUrl)}`);
    console.log(`MEDICION  jornada dia: ${dateText} (Colombia) | ventana: ${window.from.toISOString()} .. ${window.to.toISOString()} | dias de historial: ${days}`);

    // Sin filtro de nivel: exigir level="error|warning" antes de leer oculta los
    // registros cuyo nivel no vino como el arnes lo supone, y un triage que no
    // ve una clase de falla no puede negarla. El nivel se clasifica despues.
    const rawRows = await prisma.auditLog.findMany({
      where: {
        module: "platform_logs",
        timestamp: { gte: window.from, lt: window.to }
      },
      orderBy: { timestamp: "desc" },
      take: 5000,
      select: { tenant_id: true, user_id: true, timestamp: true, entity: true, user_agent: true, new_value: true }
    });
    const rejected = rawRows.map(normalize);

    const histograma = (rows, keyOf, top = 20) => [...groupBy(rows, keyOf)]
      .map(([key, bucket]) => ({ clave: key, ocurrencias: bucket.length, usuarios: [...new Set(bucket.map((row) => row.user_id))].length }))
      .sort((a, b) => b.ocurrencias - a.ocurrencias)
      .slice(0, top);

    const porNivel = histograma(rejected, (row) => `${row.level}/${row.source}`);
    const porCodigo = histograma(rejected, (row) => `${row.status} ${row.code || "(sin codigo)"} | ${row.route || "(sin ruta)"} | ${row.message}`, 25);
    // Los 4xx reportados por el cliente llegan con el codigo vacio: lo unico que
    // sobrevive es la frase del servidor. Sin este desglose, un 409 de selfie y un
    // 409 de secuencia se leen igual y el triage no puede separarlos.
    const porDetalle = histograma(rejected.filter((row) => row.status), (row) => `${row.status} | ${row.route || "(sin ruta)"} | ${row.code || "(sin codigo)"} | ${row.detail || "(sin detalle)"}`);

    const identidades = await prisma.employee.findMany({
      where: { user_id: { in: [...new Set(rejected.map((row) => row.user_id).filter((id) => Number.isInteger(id)))].map(Number) } },
      select: { id: true, code: true, tenant_id: true, user_id: true, user: { select: { name: true, email: true } } }
    });
    const employeeByUser = new Map(identidades.map((row) => [`${row.tenant_id}|${row.user_id}`, row]));

    // Una sola lectura para todos los empleados involucrados: el pooler de
    // Produccion limita los clientes en modo sesion y un bucle por trabajador
    // abre tantas conexiones como afectados tiene la ventana.
    const employeeIds = [...new Set(identidades.map((row) => row.id))];
    const punchesDia = employeeIds.length ? await prisma.timePunch.findMany({
      where: { employee_id: { in: employeeIds }, date: { gte: dayStart.from, lt: dayStart.to } },
      select: { tenant_id: true, employee_id: true, type: true, punched_at: true, metadata: true },
      orderBy: { punched_at: "asc" },
      take: 5000
    }) : [];
    const punchesByKey = groupBy(punchesDia, (row) => `${row.tenant_id}|${row.employee_id}`);

    const porUsuario = [];
    for (const [key, rows] of groupBy(rejected, (row) => `${row.tenant_id}|${row.user_id}`)) {
      const [tenantId, userId] = key.split("|");
      const employee = userId === "null" ? null : employeeByUser.get(`${tenantId}|${userId}`) || null;
      const punches = employee ? (punchesByKey.get(`${tenantId}|${employee.id}`) || []) : [];
      const punchesDelDia = punches.map((punch) => ({
        type: punch.type,
        at: punch.punched_at.toISOString(),
        fuente: punch.metadata && punch.metadata.source ? punch.metadata.source : null,
        identidad: punch.metadata && punch.metadata.identity_verification ? punch.metadata.identity_verification.status : null
      }));
      porUsuario.push({
        user_id: userId === "null" ? null : Number(userId),
        user_email: (employee && employee.user ? employee.user.email : null) || rows.find((row) => row.user_email)?.user_email || null,
        nombre: employee && employee.user ? employee.user.name : null,
        empleado_codigo: employee ? employee.code : null,
        empleado_id: employee ? employee.id : null,
        tenant_id: tenantId,
        rechazos: rows.length,
        codigos: [...new Set(rows.map((row) => row.code))],
        dispositivos: [...new Set(rows.map((row) => row.device))],
        ultimo_rechazo: rows[0].at,
        intentos_de_marcacion: rows.filter((row) => /time-punches/.test(String(row.route))).length,
        marcaciones_del_dia: punchesDelDia
      });
    }

    const delDia = await prisma.timePunch.groupBy({
      by: ["type"],
      where: { date: { gte: dayStart.from, lt: dayStart.to } },
      _count: { _all: true }
    });

    // Denominador: cuantos trabajadores marcan habitualmente en la ventana, para
    // que "17 entradas hoy" se lea contra la dotacion real y no contra el aire.
    const todas = await prisma.timePunch.findMany({
      where: { date: { gte: window.from, lt: window.to } },
      select: { date: true, type: true, employee_id: true, punched_at: true, tenant_id: true },
      take: 20000
    });
    const porDia = [...groupBy(todas, (row) => isoDay(row.date))]
      .map(([dia, rows]) => ({
        dia,
        total: rows.length,
        entradas: rows.filter((row) => row.type === "entrada").length,
        trabajadores: [...new Set(rows.map((row) => row.employee_id).filter((id) => id != null))].length
      }))
      .sort((a, b) => (a.dia < b.dia ? 1 : -1));
    const trabajadoresVentana = new Set(todas.map((row) => row.employee_id).filter((id) => id != null)).size;

    // Frontera de dia: la columna `date` debe decir el dia CALendario de Colombia, porque
    // la secuencia (`nextPunchType`) y el horario asignado se leen contra ese dia. Si `date`
    // sale del dia UTC, una marcacion despues de las 19:00 CO queda en el dia siguiente y la
    // manana real amanece con `entrada` y `inicio_almuerzo` fantasma: el operario escucha
    // "se permite fin_almuerzo" a las 06:00. Se mide, no se opina.
    const fronteraRota = todas.filter((row) => {
      const diaColumna = isoDay(row.date);
      const diaColombia = new Date(row.punched_at.getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().slice(0, 10);
      return diaColumna !== diaColombia;
    });
    const fronteraPorDia = [...groupBy(fronteraRota, (row) => isoDay(row.date))]
      .map(([dia, rows]) => ({ dia, filas: rows.length, tipos: [...new Set(rows.map((row) => row.type))].join(","), trabajadores: [...new Set(rows.map((row) => row.employee_id))].length }))
      .sort((a, b) => (a.dia < b.dia ? 1 : -1));

    // Worklist de correccion administrativa: dias en que la empresa si opero
    // (otros trabajadores marcaron) y un trabajador que marca habitualmente no
    // tiene ninguna marcacion. No afirma que haya faltado: afirma que no hay
    // registro, que es lo que un supervisor tiene que resolver.
    const diasLaborables = [...groupBy(todas, (row) => isoDay(row.date))]
      .map(([dia, rows]) => ({ dia, total: rows.length }))
      .filter((row) => row.total >= 10)
      .map((row) => row.dia);
    const marcasPorTrabajadorDia = groupBy(todas, (row) => `${row.employee_id}|${isoDay(row.date)}`);
    const empleadosAfectados = [...new Set(porUsuario.map((row) => row.empleado_id).filter((id) => id != null))];
    const jornadasSinRegistro = [];
    for (const empleadoId of empleadosAfectados) {
      for (const dia of diasLaborables) {
        if (marcasPorTrabajadorDia.has(`${empleadoId}|${dia}`)) continue;
        const quien = porUsuario.find((row) => row.empleado_id === empleadoId);
        jornadasSinRegistro.push({
          empleado_id: empleadoId,
          codigo: quien ? quien.empleado_codigo : null,
          nombre: quien ? quien.nombre : null,
          user_email: quien ? quien.user_email : null,
          dia,
          rechazos_registrados: quien ? quien.rechazos : 0,
          codigos: quien ? quien.codigos : []
        });
      }
    }

    // La otra mitad: dias que SI empezaron y nunca se cerraron. Un operario con `entrada`
    // sin `salida` no aparece arriba (tiene registro) y sin embargo la jornada queda abierta
    // para la nomina.
    const jornadasSinCierre = [];
    for (const [clave, rows] of marcasPorTrabajadorDia) {
      const [empleadoId, dia] = clave.split("|");
      if (!empleadosAfectados.includes(Number(empleadoId))) continue;
      if (!rows.some((row) => row.type === "entrada")) continue;
      if (rows.some((row) => row.type === "salida")) continue;
      const quien = porUsuario.find((row) => row.empleado_id === Number(empleadoId));
      jornadasSinCierre.push({
        empleado_id: Number(empleadoId),
        nombre: quien ? quien.nombre : null,
        user_email: quien ? quien.user_email : null,
        dia,
        tipos: [...new Set(rows.map((row) => row.type))],
        faltan: ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"].filter((tipo) => !rows.some((row) => row.type === tipo))
      });
    }
    jornadasSinCierre.sort((a, b) => (a.dia < b.dia ? 1 : -1));

    // La causa cruda del fallo de transporte: el mensaje del cliente es uno solo
    // ("Backend no disponible") para tres cosas distintas (abandono por tiempo,
    // red del dispositivo, CORS). Contarlo por mensaje es contar el sintoma; este
    // desglose cuenta el detalle que el navegador ya traia.
    const fallasFrontend = rejected.filter((row) => /no disponible desde frontend/i.test(row.message));
    const porCausaCruda = histograma(fallasFrontend, (row) => row.detail || "(sin detalle)", 12);

    const reporte = {
      medicion: { archivo_ambiente: path.relative(ROOT, envFile), ambiente: declared, host: hostOf(databaseUrl), dia: dateText, ventana_utc: [window.from.toISOString(), window.to.toISOString()], leido_en: new Date().toISOString(), escrituras: 0, sin_nombres: args["sin-nombres"] === true },
      total_rechazos: rejected.length,
      nivel_fuente: porNivel,
      rechazos_por_codigo: porCodigo,
      rechazos_por_detalle: porDetalle,
      causa_cruda_transporte: porCausaCruda,
      frontera_de_dia: { marcaciones: todas.length, con_date_distinto_del_dia_colombia: fronteraRota.length, por_dia: fronteraPorDia },
      trabajadores_afectados: porUsuario.sort((a, b) => b.rechazos - a.rechazos),
      trabajadores_que_marcaron_en_ventana: trabajadoresVentana,
      jornadas_sin_registro: jornadasSinRegistro,
      jornadas_sin_cierre: jornadasSinCierre,
      marcaciones_por_dia: porDia,
      marcaciones_aceptadas_del_dia: delDia.map((row) => ({ tipo: row.type, total: row._count._all }))
    };

    console.log(`\nNIVEL/FUENTE de los ${rejected.length} registros leidos:`);
    for (const row of porNivel) console.log(`  ${String(row.ocurrencias).padStart(4)} x  ${row.clave}  [usuarios ${row.usuarios}]`);

    console.log(`\nRECHAZOS por codigo/ruta en la ventana:`);
    for (const row of porCodigo) console.log(`  ${String(row.ocurrencias).padStart(4)} x  ${row.clave}  [usuarios ${row.usuarios}]`);

    console.log(`\nLO QUE DIJO EL SERVIDOR (los 4xx del cliente llegan sin codigo; la frase es el unico rastro):`);
    for (const row of porDetalle) console.log(`  ${String(row.ocurrencias).padStart(4)} x  ${row.clave}  [usuarios ${row.usuarios}]`);

    const bloqueados = reporte.trabajadores_afectados.filter((row) => row.intentos_de_marcacion > 0 && !row.marcaciones_del_dia.some((punch) => punch.type === "entrada"));
    console.log(`\nSIN ENTRADA HOY Y CON RECHAZOS DE MARCACION (${bloqueados.length}):`);
    for (const row of bloqueados.slice(0, 25)) console.log(`  user ${String(row.user_id).padStart(6)}  ${String(row.user_email || "-").padEnd(34)}  rechazos ${String(row.rechazos).padStart(3)}  ${row.codigos.join(",")}  ${row.dispositivos.join(",")}`);

    console.log("\nMARCACIONES ACEPTADAS HOY:", delDia.map((row) => `${row.type}=${row._count._all}`).join(" "));
    console.log(`DENOMINADOR  trabajadores que marcaron en la ventana: ${trabajadoresVentana}`);
    for (const row of porDia) console.log(`  ${row.dia}  entradas ${String(row.entradas).padStart(3)}  total ${String(row.total).padStart(3)}  trabajadores ${String(row.trabajadores).padStart(3)}`);

    // La causa cruda del fallo de transporte: el mensaje del cliente es uno solo
    // ("Backend no disponible") para tres cosas distintas (abandono por tiempo,
    // red del dispositivo, CORS). Contarlo por mensaje es contar el sintoma; este
    // desglose cuenta el detalle que el navegador ya traia.
    console.log(`\nFRONTERA DE DIA: ${fronteraRota.length} de ${todas.length} marcaciones tienen \`date\` distinto del dia calendario de Colombia.`);
    for (const row of fronteraPorDia) console.log(`  ${row.dia}  filas ${String(row.filas).padStart(3)}  trabajadores ${String(row.trabajadores).padStart(3)}  tipos [${row.tipos}]`);

    console.log(`\nCAUSA CRUDA de las ${fallasFrontend.length} fallas de transporte nombradas "Backend no disponible desde frontend":`);
    for (const row of porCausaCruda) console.log(`  ${String(row.ocurrencias).padStart(4)} x  ${row.clave}  [usuarios ${row.usuarios}]`);

    console.log(`\nJORNADAS SIN REGISTRO (trabajador afectado, dia en que la empresa si opero): ${jornadasSinRegistro.length}`);
    for (const row of jornadasSinRegistro.slice(0, 40)) {
      console.log(`  ${row.dia}  emp ${String(row.empleado_id).padStart(5)}  ${String(row.codigo || "-").padEnd(10)} ${String(row.nombre || row.user_email || "-").padEnd(34)} rechazos ${String(row.rechazos_registrados).padStart(3)}  ${row.codigos.join(",")}`);
    }

    console.log(`\nJORNADAS EMPEZADAS Y NUNCA CERRADAS (entrada sin salida): ${jornadasSinCierre.length}`);
    for (const row of jornadasSinCierre.slice(0, 40)) {
      console.log(`  ${row.dia}  emp ${String(row.empleado_id).padStart(5)}  ${String(row.nombre || row.user_email || "-").padEnd(34)} tiene [${row.tipos.join(",")}]  falta [${row.faltan.join(",")}]`);
    }

    // --focus=<texto> responde por que una clase de rechazo existe o no existe en
    // la tabla, mostrando la forma real del registro (con los binarios fuera).
    if (args.focus) {
      const needle = String(args.focus);
      const matches = rawRows.filter((row) => JSON.stringify(row.new_value || {}).includes(needle));
      console.log(`\nFOCUS "${needle}": ${matches.length} registro(s) en la ventana.`);
      const porForma = groupBy(matches, (row) => {
        const value = row.new_value || {};
        return `${value.source || "-"}/${value.level || "-"} status=${value.status_code ?? "-"} code=${value.code || "-"} ruta=${value.route || row.entity || "-"}`;
      });
      for (const [key, rows] of [...porForma].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
        console.log(`  ${String(rows.length).padStart(4)} x  ${key}`);
      }
      for (const row of matches.slice(0, 3)) {
        const value = row.new_value || {};
        console.log(`  MUESTRA ${row.timestamp.toISOString()} user=${row.user_id} keys=[${Object.keys(value).join(",")}]`);
        console.log(`          message=${JSON.stringify(String(value.message || "").slice(0, 120))} detail=${JSON.stringify(String(value.detail || "").slice(0, 160))} code=${JSON.stringify(value.code)} request_id=${JSON.stringify(value.request_id)}`);
      }
    }

    // --secuencia responde la pregunta que el codigo plantea: la compuerta de secuencia
    // (apps/api/src/modules/hr/service.js, nextPunchType + operationalIdentityRouteWhere)
    // mira las marcaciones del dia filtrando por (identidad Y ruta). Si un trabajador tiene
    // el dia partido en dos rutas, la primera mitad desaparece y el servidor vuelve a exigir
    // `entrada`, rechazando el resto de la jornada. Se mide sin tocar `metadata`: la ruta
    // fragmentada se ve en la columna route_id, y los binarios no se leen jamas.
    if (args.secuencia) {
      const secuenciaUserIds = [...new Set(rejected
        .filter((row) => row.code === "MARCACION_FUERA_DE_SECUENCIA" || /siguiente marcacion permitida/i.test(row.detail || ""))
        .map((row) => row.user_id).filter((id) => Number.isInteger(id)))];
      const identidadesSecuencia = await prisma.employee.findMany({
        where: { user_id: { in: secuenciaUserIds } },
        select: { id: true, code: true, tenant_id: true, user_id: true, user: { select: { name: true } } }
      });
      const empleadosSecuencia = identidadesSecuencia.map((row) => row.id);
      const rutasDia = empleadosSecuencia.length ? await prisma.timePunch.findMany({
        where: { employee_id: { in: empleadosSecuencia }, date: { gte: window.from, lt: window.to } },
        select: { tenant_id: true, employee_id: true, date: true, type: true, punched_at: true, route_id: true },
        orderBy: { punched_at: "asc" },
        take: 5000
      }) : [];
      const porEmpleadoDia = groupBy(rutasDia, (row) => `${row.employee_id}|${isoDay(row.date)}`);
      const nombreDe = new Map(identidadesSecuencia.map((row) => [row.id, row.user ? row.user.name : `emp ${row.id}`]));
      const diasPartidos = [];
      for (const [key, rows] of porEmpleadoDia) {
        const rutas = [...new Set(rows.map((row) => (row.route_id == null ? "(sin ruta)" : String(row.route_id))))];
        if (rutas.length > 1) {
          const [empleadoId, dia] = key.split("|");
          diasPartidos.push({
            empleado_id: Number(empleadoId),
            nombre: nombreDe.get(Number(empleadoId)) || null,
            dia,
            rutas,
            secuencia: rows.map((row) => `${row.type}@${new Date(row.punched_at.getTime() + COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().slice(11, 16)}${row.route_id == null ? "" : `#${row.route_id}`}`)
          });
        }
      }
      console.log(`\nDIAS PARTIDOS EN VARIAS RUTAS (la secuencia se evalua por ruta): ${diasPartidos.length}`);
      for (const row of diasPartidos.sort((a, b) => (a.dia < b.dia ? 1 : -1)).slice(0, 30)) {
        console.log(`  ${row.dia}  emp ${String(row.empleado_id).padStart(5)}  ${String(row.nombre || "-").padEnd(34)}  rutas [${row.rutas.join(", ")}]`);
        console.log(`          ${row.secuencia.join(" -> ")}`);
      }
      const sinRuta = rutasDia.filter((row) => row.route_id == null).length;
      console.log(`  contexto: ${rutasDia.length} marcaciones leidas, ${sinRuta} sin route_id (route_id nulo no fragmenta la vista)`);
    }

    // --detalle=<user_id> responde "que le paso a esta persona" con las dos mitades del
    // mismo hilo: lo que marco (con hora de Colombia y dia almacenado) y lo que el servidor
    // le contesto. Sin esto, cada hipotesis sobre la secuencia se discute sin datos.
    if (args.detalle) {
      const userId = Number(args.detalle);
      const fila = identidades.find((row) => Number(row.user_id) === userId) || null;
      const empleadoId = fila ? fila.id : null;
      const marcas = empleadoId == null ? [] : await prisma.timePunch.findMany({
        where: { employee_id: empleadoId, date: { gte: window.from, lt: window.to } },
        select: { date: true, type: true, punched_at: true, route_id: true },
        orderBy: { punched_at: "asc" },
        take: 500
      });
      console.log(`\nDETALLE user ${userId} (${fila ? `${fila.code} / ${fila.user ? fila.user.name : "sin nombre"}` : "sin ficha de empleado"})`);
      for (const row of marcas) {
        const horaCo = new Date(row.punched_at.getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
        console.log(`  MARCO  date=${isoDay(row.date)}  ${String(row.type).padEnd(16)}  hora Colombia ${horaCo}  ruta ${row.route_id ?? "(sin ruta)"}`);
      }
      const mios = rejected.filter((row) => Number(row.user_id) === userId);
      for (const row of mios.slice(0, 40)) {
        const horaCo = new Date(new Date(row.at).getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
        console.log(`  RESPUESTA ${horaCo} CO  ${row.status ?? "-"} ${row.code || "(sin codigo)"}  ${row.route || "-"}  ${row.message}  ${row.detail ? `| ${row.detail}` : ""}`);
      }
      console.log(`  total respuestas registradas para este usuario: ${mios.length}`);
    }

    // --horario: el desbloqueo administrativo NO inventa horas. Toma el horario asignado
    // al trabajador para ese dia (TimeRoute.start_time / end_time, que es lo que la app
    // compara cuando valida la marcacion) y lo imprime junto con lo que ya existe. La
    // salida es el insumo del registro manual, con la fuente de la hora a la vista.
    if (args.horario) {
      const rutasVentana = await prisma.timeRoute.findMany({
        where: { date: { gte: window.from, lt: window.to } },
        select: { id: true, tenant_id: true, date: true, employees: true, start_time: true, end_time: true, status: true, kind: true },
        take: 2000
      });
      const aliasAEmpleado = new Map();
      for (const fila of identidades) {
        for (const alias of [fila.code, fila.user ? fila.user.name : null, fila.user ? fila.user.email : null, String(fila.id)]) {
          if (alias) aliasAEmpleado.set(`${fila.tenant_id}|${String(alias).trim().toLowerCase()}`, fila);
        }
      }
      const rutasPorEmpleadoDia = new Map();
      for (const ruta of rutasVentana) {
        const lista = Array.isArray(ruta.employees) ? ruta.employees : [];
        for (const value of lista) {
          const clave = `${ruta.tenant_id}|${String(value).trim().toLowerCase()}`;
          const empleado = aliasAEmpleado.get(clave);
          if (!empleado) continue;
          rutasPorEmpleadoDia.set(`${empleado.id}|${isoDay(ruta.date)}`, ruta);
        }
      }
      console.log(`\nHORARIO ASIGNADO de cada jornada sin registro (la hora sale del horario, no del log):`);
      const sinHorario = [];
      for (const fila of jornadasSinRegistro) {
        const ruta = rutasPorEmpleadoDia.get(`${fila.empleado_id}|${fila.dia}`);
        if (!ruta) {
          sinHorario.push(fila);
          console.log(`  ${fila.dia}  emp ${String(fila.empleado_id).padStart(5)}  ${String(fila.nombre || fila.user_email || "-").padEnd(34)}  SIN HORARIO ASIGNADO`);
          continue;
        }
        console.log(`  ${fila.dia}  emp ${String(fila.empleado_id).padStart(5)}  ${String(fila.nombre || fila.user_email || "-").padEnd(34)}  ruta ${ruta.id}  h_inicio ${ruta.start_time || "-"}  h_fin ${ruta.end_time || "-"}  ${ruta.status}/${ruta.kind}`);
      }
      console.log(`  total jornadas sin registro: ${jornadasSinRegistro.length}, sin horario resuelto: ${sinHorario.length}`);
    }

    if (args.output) {
      const out = path.resolve(ROOT, String(args.output));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      // La constancia queda dentro de la evidencia: quien abra el artefacto del repositorio tiene que
      // poder afirmar que no es la salida completa del instrumento, sino la misma medicion sin nombres.
      const artefacto = args["sin-nombres"] === true ? stripNames(reporte) : reporte;
      fs.writeFileSync(out, `${JSON.stringify(artefacto, null, 2)}\n`);
      console.log(`\nEVIDENCIA  ${path.relative(ROOT, out)}${args["sin-nombres"] === true ? "  (artefacto sin nombres, versionable)" : ""}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`BLOQUEADO  ${error.message}`);
  process.exit(1);
});
