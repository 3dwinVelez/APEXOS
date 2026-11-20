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
  for (const key of ["env-file", "date", "days", "output", "manifest"]) {
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

// ---- Rescate Fase 0 ---------------------------------------------------------------------------
// La escalera de asistencia es lineal, asi que el orden de las piernas es fijo.
const ORDEN_MARCAS = ["entrada", "inicio_almuerzo", "fin_almuerzo", "salida"];
// El horario solo define las dos puntas de la jornada; las piernas de almuerzo no se inventan:
// entran al manifiesto unicamente si el servidor las nombro en un rechazo ("la siguiente marcacion
// permitida es fin_almuerzo"), que es la prueba de que la malla de ESA persona si tiene esa pierna.
// Tolerancia del oprimido real respecto a la hora de entrada del horario. Medido: los operarios
// llegan y marcan antes o despues de su hora de ingreso; media jornada de desvio sigue siendo la
// apertura de ESA jornada, pero una tarde no.
const VENTANA_APERTURA_MIN = 120;
// Un `MARCACION_DIFERIDA_EXPIRADA` se registra cuando el dispositivo reenvia una marca vieja: su
// sello del log es la hora del REINTENTO, no la de la marcacion, y usarla registraria una entrada
// veinte horas despues de la real. Los demas codigos son el instante en que el operario oprimio.
const CODIGOS_DE_INTENTO_INMEDIATO = new Set(["MARCACION_FUERA_DE_SECUENCIA", "SELFIE_REQUERIDA", "IDEMPOTENCY_KEY_CONFLICT"]);
const RUTA_DE_MARCACION = "/api/v1/hr/self/time-punches";

function minutosDeHora(hora) {
  const match = /^(\d{2}):(\d{2})/.exec(String(hora || "").slice(0, 5));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function minutosDelDiaColombia(isoUtc) {
  const d = new Date(new Date(isoUtc).getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function piernaNombrada(message = "") {
  // El servidor cierra la frase con punto: capturar `\S+` devolveria "fin_almuerzo." y la pierna
  // no casaria con la escalera. Se capturan letras y guion bajo, nada mas.
  const match = /siguiente marcaci.n permitida es ([\p{L}_]+)/iu.exec(String(message || ""));
  return match ? match[1] : null;
}

// El rechazo de transporte ("Backend no disponible desde frontend") no trae codigo, pero es el
// operario oprimiendo: cuenta como intento inmediato siempre que la ruta sea la de marcacion.
function esIntentoInmediato(row) {
  if (!row || row.route !== RUTA_DE_MARCACION) return false;
  if (row.code && CODIGOS_DE_INTENTO_INMEDIATO.has(row.code)) return true;
  return !row.code && /backend no disponible|solicitud frontend fallida|contenido del archivo/i.test(String(row.message || ""));
}

// `HH:MM` del horario + dia calendario de Colombia -> ISO UTC. Una jornada que cruza medianoche
// (h_fin menor que h_inicio) cierra al dia siguiente.
function utcDeHoraLocal(dia, hora, { finDeJornada = false, horaInicio = null } = {}) {
  const limpio = String(hora || "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(limpio)) return null;
  const cruzaMedianoche = finDeJornada && horaInicio && limpio < String(horaInicio).slice(0, 5);
  const base = new Date(`${dia}T${limpio}:00.000-05:00`);
  if (!Number.isFinite(base.getTime())) return null;
  return new Date(base.getTime() + (cruzaMedianoche ? 24 * 3600 * 1000 : 0)).toISOString();
}

function horaColombia(isoUtc) {
  return new Date(new Date(isoUtc).getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
}

function construirRescate({ jornadasSinRegistro, jornadasSinCierre, marcasPorTrabajadorDia, intentosPorUsuarioDia, rutasPorEmpleadoDia, identidades }) {
  const ficha = new Map(identidades.map((row) => [row.id, row]));
  const dias = new Map();
  const registrar = (empleadoId, dia) => {
    const clave = `${empleadoId}|${dia}`;
    if (!dias.has(clave)) dias.set(clave, { empleado_id: Number(empleadoId), dia });
    return dias.get(clave);
  };
  for (const fila of jornadasSinRegistro) registrar(fila.empleado_id, fila.dia).sin_registro = true;
  for (const fila of jornadasSinCierre) registrar(fila.empleado_id, fila.dia).sin_cierre = true;

  const filas = [];
  for (const jornada of dias.values()) {
    const empleado = ficha.get(jornada.empleado_id) || null;
    if (!empleado) continue;
    const existentes = new Set((marcasPorTrabajadorDia.get(`${jornada.empleado_id}|${jornada.dia}`) || []).map((row) => row.type));
    const intentos = intentosPorUsuarioDia.get(`${empleado.user_id}|${jornada.dia}`) || [];
    const ruta = rutasPorEmpleadoDia.get(`${jornada.empleado_id}|${jornada.dia}`) || null;
    const disponibles = ORDEN_MARCAS.filter((tipo) => !existentes.has(tipo));
    // Primero se asignan las piernas que el servidor nombro: es el unico rastro de QUE iba a marcar
    // el operario, y fija el piso de que la pierna existe en su malla.
    const porPierna = new Map();
    for (const intento of intentos) {
      const pierna = piernaNombrada(intento.message);
      if (!pierna) continue;
      if (disponibles.includes(pierna) && !porPierna.has(pierna)) porPierna.set(pierna, [intento]);
    }
    // Las dos puntas del horario se anclan al primer y ultimo oprimido real del dia; si no hay
    // oprimidos, al horario asignado. Un dia sin ninguna de las dos fuentes no entra al manifiesto.
    // Un dia sin ningun rechazo de marcacion no es un rescate: es un supuesto. Queda fuera y se
    // declara, porque el dueño autorizo rescatar peticiones fallidas, no completar el tablero.
    if (!intentos.length) continue;
    const asignados = new Set([...porPierna.values()].flat().map((intento) => intento.at));
    const ordenados = [...intentos].sort((a, b) => new Date(a.at) - new Date(b.at));
    // Las puntas se anclan con reglas distintas y la razon es medida: los reintentos rechazados se
    // agrupan en la manana (la espiral de `MARCACION_FUERA_DE_SECUENCIA`), asi que el ULTIMO oprimido
    // del dia no es la hora de salida de nadie -producia cierres dos minutos despues de la entrada y
    // salidas a las 06:03-. La salida sale del horario; la entrada del log solo si cae dentro de una
    // ventana razonable del horario.
    const horaInicio = ruta ? minutosDeHora(ruta.start_time) : null;
    const desdeHorario = (tipo) => {
      const hora = tipo === "entrada" ? ruta.start_time : ruta.end_time;
      const cuando = utcDeHoraLocal(jornada.dia, hora, { finDeJornada: tipo === "salida", horaInicio: ruta.start_time });
      if (!cuando) return null;
      return {
        cuando,
        fuente: "horario_asignado",
        evidencia: `ruta ${ruta.id} h_${tipo === "entrada" ? "inicio" : "fin"} ${hora} ${ruta.status}/${ruta.kind}; ${intentos.length} rechazos ese dia, ninguno util como hora`
      };
    };
    const propuestaPara = (tipo) => {
      const inmediata = ordenados.filter((intento) => esIntentoInmediato(intento) && !asignados.has(intento.at));
      if (tipo === "entrada") {
        const cerca = inmediata.find((intento) => horaInicio == null
          || Math.abs(minutosDelDiaColombia(intento.at) - horaInicio) <= VENTANA_APERTURA_MIN);
        if (cerca) {
          return { cuando: cerca.at, fuente: "intento_real_en_log", evidencia: `primer oprimido del dia a las ${horaColombia(cerca.at)} CO (${inmediata.length} intentos inmediatos)` };
        }
        return ruta ? desdeHorario("entrada") : null;
      }
      if (tipo === "salida") {
        return ruta && minutosDeHora(ruta.end_time) != null ? desdeHorario("salida") : null;
      }
      const nombrada = porPierna.get(tipo);
      if (!nombrada || !nombrada.length) return null;
      const mejor = [...nombrada].sort((a, b) => new Date(a.at) - new Date(b.at))[0];
      return { cuando: mejor.at, fuente: "intento_real_en_log", evidencia: `el servidor le pidio ${tipo} a las ${horaColombia(mejor.at)} CO` };
    };
    for (const tipo of disponibles) {
      const propuesta = propuestaPara(tipo);
      if (!propuesta || !Number.isFinite(new Date(propuesta.cuando).getTime())) continue;
      filas.push({
        empleado_id: Number(jornada.empleado_id),
        tenant_id: empleado.tenant_id,
        user_id: empleado.user_id ?? null,
        nombre: empleado.user ? empleado.user.name : null,
        user_name: empleado.user ? empleado.user.name : (empleado.code || String(empleado.user_id)),
        dia: jornada.dia,
        jornada: jornada.sin_registro ? "sin_registro" : "sin_cierre",
        tipo,
        punched_at: propuesta.cuando,
        hora_colombia: horaColombia(propuesta.cuando),
        fuente: propuesta.fuente,
        evidencia: propuesta.evidencia,
        rechazos_del_dia: intentos.length,
        route_id: ruta ? Number(ruta.id) : null,
        payload: {
          employee_id: Number(jornada.empleado_id),
          user_name: empleado.user ? empleado.user.name : (empleado.code || String(empleado.user_id)),
          type: tipo,
          punched_at: propuesta.cuando,
          route_id: ruta ? Number(ruta.id) : undefined,
          correccion_administrativa: true,
          motivo_correccion: `Rescate Fase 0 2026-11-19 (${propuesta.fuente}): ${propuesta.evidencia}`,
          idempotency_key: `rescate-fase0-${jornada.empleado_id}-${jornada.dia}-${tipo}`.slice(0, 120)
        }
      });
    }
  }
  // Ultimo filtro antes de escribir: la escalera es ordenada, asi que una pierna que caiga antes de
  // la anterior del mismo dia es un artefacto de la evidencia y no una marcacion que registrar.
  const descartadas = [];
  for (const [, rows] of groupBy(filas, (row) => `${row.empleado_id}|${row.dia}`)) {
    rows.sort((a, b) => ORDEN_MARCAS.indexOf(a.tipo) - ORDEN_MARCAS.indexOf(b.tipo));
    let anterior = null;
    for (const row of rows) {
      const ms = new Date(row.punched_at).getTime();
      if (anterior != null && ms < anterior) {
        descartadas.push({ empleado_id: row.empleado_id, dia: row.dia, tipo: row.tipo, hora_colombia: row.hora_colombia, motivo: "antes de la pierna anterior de la escalera" });
        filas.splice(filas.indexOf(row), 1);
        continue;
      }
      anterior = ms;
    }
  }
  const orden = filas.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.empleado_id - b.empleado_id));
  orden.descartadas = descartadas;
  return orden;
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
    // El rescate se sostiene en tres reglas puras. Cada una se prueba con su rojo provocado:
    // si el diferenciador deja de discriminar, el manifiesto deja de ser confiable.
    const piernaOk = piernaNombrada("La siguiente marcacion permitida es fin_almuerzo.") === "fin_almuerzo"
      && piernaNombrada("La marcacion diferida supero las 24 horas permitidas.") === null;
    console.log(`${piernaOk ? "ok  " : "FALLO"} la pierna se lee del mensaje del servidor y no de la intuicion`);
    const inmediatoOk = esIntentoInmediato({ route: RUTA_DE_MARCACION, code: "MARCACION_DIFERIDA_EXPIRADA", message: "x" }) === false
      && esIntentoInmediato({ route: RUTA_DE_MARCACION, code: "SELFIE_REQUERIDA", message: "x" }) === true
      && esIntentoInmediato({ route: RUTA_DE_MARCACION, code: null, message: "Backend no disponible desde frontend" }) === true
      && esIntentoInmediato({ route: "/api/v1/hr/self/gps/ping", code: null, message: "Backend no disponible desde frontend" }) === false;
    console.log(`${inmediatoOk ? "ok  " : "FALLO"} una marca diferida nunca presta su hora (es el reintento) y solo la ruta de marcacion cuenta`);
    const utcOk = utcDeHoraLocal("2026-11-18", "05:30") === "2026-11-18T10:30:00.000Z"
      && utcDeHoraLocal("2026-11-18", "04:00", { finDeJornada: true, horaInicio: "22:00" }) === "2026-11-19T09:00:00.000Z"
      && utcDeHoraLocal("2026-11-18", "-") === null;
    console.log(`${utcOk ? "ok  " : "FALLO"} la hora del horario se ancla a Colombia-05:00 y cruza medianoche solo al cerrar`);
    // El manifiesto es lo que despues se escribe sobre una jornada real, asi que sus reglas se
    // prueban con fichas armadas a proposito: un diferido de la tarde no puede abrir la jornada,
    // una pierna fuera de orden se descarta y un dia sin rechazos no se toca.
    const identidades = [
      { id: 1, tenant_id: "t1", user_id: 11, code: "Uno", user: { name: "Uno" } },
      { id: 2, tenant_id: "t1", user_id: 12, code: "Dos", user: { name: "Dos" } },
      { id: 3, tenant_id: "t1", user_id: 13, code: "Tres", user: { name: "Tres" } },
      { id: 4, tenant_id: "t1", user_id: 14, code: "Cuatro", user: { name: "Cuatro" } },
      { id: 5, tenant_id: "t1", user_id: 15, code: "Cinco", user: { name: "Cinco" } }
    ];
    const rutas = new Map([
      ["1|2026-11-18", { id: 900, tenant_id: "t1", date: new Date("2026-11-18T05:00:00.000Z"), start_time: "06:00", end_time: "14:00", status: "active", kind: "trabajo" }],
      ["3|2026-11-18", { id: 902, tenant_id: "t1", date: new Date("2026-11-18T05:00:00.000Z"), start_time: "06:00", end_time: "14:00", status: "active", kind: "trabajo" }],
      ["4|2026-11-18", { id: 903, tenant_id: "t1", date: new Date("2026-11-18T05:00:00.000Z"), start_time: "06:00", end_time: "14:00", status: "active", kind: "trabajo" }],
      ["5|2026-11-18", { id: 904, tenant_id: "t1", date: new Date("2026-11-18T05:00:00.000Z"), start_time: "06:00", end_time: "14:00", status: "active", kind: "trabajo" }]
    ]);
    const intento = (user_id, at, extra = {}) => ({ user_id, at, route: RUTA_DE_MARCACION, code: null, message: "", ...extra });
    const intentos = groupBy([
      // emp 1: la unica huella es un diferido de las 19:12 CO (reintento) -> las dos puntas salen del horario.
      intento(11, "2026-11-19T00:12:00.000Z", { code: "MARCACION_DIFERIDA_EXPIRADA" }),
      // emp 3: oprimido real a las 05:55 CO (dentro de la ventana) + almuerzo pedido por el servidor.
      intento(13, "2026-11-18T10:55:00.000Z", { code: "SELFIE_REQUERIDA" }),
      intento(13, "2026-11-18T17:10:00.000Z", { message: "La siguiente marcacion permitida es fin_almuerzo." }),
      // emp 4: el almuerzo pedido (05:00 CO) cae ANTES de la entrada del horario -> se descarta.
      intento(14, "2026-11-18T10:00:00.000Z", { message: "La siguiente marcacion permitida es inicio_almuerzo." }),
      // emp 5: ya tiene entrada y salida; solo le falta el fin de almuerzo.
      intento(15, "2026-11-18T16:40:00.000Z", { message: "La siguiente marcacion permitida es fin_almuerzo." })
    ], (row) => `${row.user_id}|${new Date(new Date(row.at).getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().slice(0, 10)}`);
    const marcas = groupBy([
      { employee_id: 5, date: new Date("2026-11-18T11:00:00.000Z"), type: "entrada", punched_at: new Date("2026-11-18T11:00:00.000Z") },
      { employee_id: 5, date: new Date("2026-11-18T19:00:00.000Z"), type: "salida", punched_at: new Date("2026-11-18T19:00:00.000Z") }
    ], (row) => `${row.employee_id}|${isoDay(row.date)}`);
    const rescate = construirRescate({
      jornadasSinRegistro: [1, 2, 3].map((empleado_id) => ({ empleado_id, dia: "2026-11-18", sin_registro: true })),
      jornadasSinCierre: [{ empleado_id: 4, dia: "2026-11-18", sin_cierre: true }, { empleado_id: 5, dia: "2026-11-18", sin_cierre: true }],
      marcasPorTrabajadorDia: marcas,
      intentosPorUsuarioDia: intentos,
      rutasPorEmpleadoDia: rutas,
      identidades
    });
    const de = (empleadoId) => rescate.filter((row) => row.empleado_id === empleadoId);
    const uno = de(1).map((row) => `${row.tipo}@${row.hora_colombia.slice(11)}/${row.fuente}`).sort().join(",");
    const cuatro = de(4).map((row) => row.tipo).sort().join(",");
    const cinco = de(5).map((row) => row.tipo).join(",");
    const rescateOk = uno === "entrada@06:00/horario_asignado,salida@14:00/horario_asignado"
      && de(2).length === 0
      && de(3).some((row) => row.tipo === "entrada" && row.hora_colombia.endsWith("05:55") && row.fuente === "intento_real_en_log")
      && de(3).some((row) => row.tipo === "fin_almuerzo" && row.fuente === "intento_real_en_log")
      && de(3).some((row) => row.tipo === "salida" && row.fuente === "horario_asignado")
      && cuatro === "entrada,salida"
      && cinco === "fin_almuerzo"
      && rescate.descartadas.length === 1
      && rescate.every((row) => row.payload.correccion_administrativa === true && String(row.payload.motivo_correccion).length >= 12 && row.payload.idempotency_key.length >= 8);
    console.log(`${rescateOk ? "ok  " : "FALLO"} el rescate no presta la hora de un reintento, no inventa almuerzos ni toca dias sin rechazos (rojo provocado: ${uno || "nada"} | descartadas ${JSON.stringify(rescate.descartadas)})`);
    const ventanaOk = minutosDeHora("05:30:00") === 330 && minutosDeHora(null) === null
      && minutosDelDiaColombia("2026-11-18T10:30:00.000Z") === 5 * 60 + 30;
    console.log(`${ventanaOk ? "ok  " : "FALLO"} minutos del dia en Colombia (la ventana de apertura compara horas locales, no UTC)`);
    const outcome = failed === 0 && drifted.length === 1 && quiet.length === 0 && windowOk && isoOk && namesOut && idsDentro && intacto
      && piernaOk && inmediatoOk && utcOk && rescateOk && ventanaOk ? 0 : 1;
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
    // --rescate reusa el mismo mapa de horarios y ademas ancla cada pierna faltante al
    // instante real del intento rechazado, que SI existe en el log: el sello de la fila es
    // el momento en que el operario oprimio. La hora del horario es el respaldo, no la regla.
    if (args.horario || args.rescate) {
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
      if (args.horario) {
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

      if (args.rescate) {
        const diaColombiaDe = (isoUtc) => new Date(new Date(isoUtc).getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().slice(0, 10);
        const intentosPorUsuarioDia = groupBy(
          rejected.filter((row) => row.route === RUTA_DE_MARCACION && row.user_id != null),
          (row) => `${row.user_id}|${diaColombiaDe(row.at)}`
        );
        const filas = construirRescate({
          jornadasSinRegistro,
          jornadasSinCierre,
          marcasPorTrabajadorDia,
          intentosPorUsuarioDia,
          rutasPorEmpleadoDia,
          identidades
        });
        const porFuente = [...groupBy(filas, (row) => row.fuente)].map(([fuente, rows]) => ({ fuente, filas: rows.length }));
        const descartadas = filas.descartadas || [];
        console.log(`\nMANIFIESTO DE RESCATE (hora real del intento; el horario solo presta la salida y la entrada lejana): ${filas.length} piernas por corregir`);
        for (const fila of filas) {
          console.log(`  ${fila.dia}  emp ${String(fila.empleado_id).padStart(5)}  ${String(fila.nombre || "-").padEnd(32)} ${String(fila.tipo).padEnd(15)} ${fila.hora_colombia} CO  ${String(fila.fuente).padEnd(18)} ruta ${fila.route_id ?? "-"}  ${fila.evidencia}`);
        }
        for (const desc of descartadas) {
          console.log(`  DESCARTADA ${desc.dia}  emp ${String(desc.empleado_id).padStart(5)}  ${desc.tipo} a las ${desc.hora_colombia} CO  ${desc.motivo}`);
        }
        console.log(`  jornadas tocadas: ${new Set(filas.map((row) => `${row.empleado_id}|${row.dia}`)).size}  ${porFuente.map((row) => `${row.fuente}=${row.filas}`).join("  ")}  descartadas=${descartadas.length}`);
        const claveJornada = new Map([...jornadasSinRegistro, ...jornadasSinCierre].map((fila) => [`${fila.empleado_id}|${fila.dia}`, fila]));
        const sinFuente = [...claveJornada.keys()].filter((clave) => !filas.some((row) => `${row.empleado_id}|${row.dia}` === clave));
        console.log(`  jornadas sin ninguna fuente rescatable (no se tocan): ${sinFuente.length}${sinFuente.length ? ` -> ${sinFuente.join(", ")}` : ""}`);
        reporte.rescate = {
          criterio: "entra al manifiesto solo el dia con al menos un rechazo de marcacion; entrada = primer oprimido dentro de +/-120 min del horario (si no, el horario); salida = SIEMPRE el horario asignado (un reintento rechazado no prueba la hora de cierre); almuerzos solo si el servidor nombro la pierna y cae despues de la anterior; MARCACION_DIFERIDA_EXPIRADA nunca presta su hora",
          filas_propuestas: filas.length,
          por_fuente: porFuente,
          descartadas,
          jornadas_sin_fuente: sinFuente,
          // El artefacto versionado lleva el detalle de cada pierna propuesta: sin el, quien revisa
          // la evidencia meses despues no puede contrastar la hora escrita con su fuente.
          detalle: filas,
          escrituras: 0
        };
        if (args.manifest) {
          const destino = path.resolve(String(args.manifest));
          // El manifiesto ejecutable lleva nombres (el payload los necesita): jamas puede
          // escribirse dentro del repositorio, que es lo que se versiona y se promociona.
          if (destino.startsWith(`${ROOT}${path.sep}`)) throw new Error(`--manifest debe quedar fuera del repositorio: ${destino}`);
          fs.mkdirSync(path.dirname(destino), { recursive: true });
          fs.writeFileSync(destino, `${JSON.stringify({ generado_en: new Date().toISOString(), ambiente: hostOf(String(process.env.DATABASE_URL || "")), ...reporte.rescate, filas }, null, 2)}\n`);
          console.log(`\nMANIFIESTO EJECUTABLE  ${destino}  (fuera del repositorio: lleva nombres)`);
        }
      }
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
