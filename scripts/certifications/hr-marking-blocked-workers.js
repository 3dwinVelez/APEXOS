// Triaje de desbloqueo: que trabajadores NO pudieron marcar y por que.
//
// Solo lectura. No escribe marcaciones, no reintentia colas y no toca ningun
// ambiente que no sea el que declara el archivo de ambiente pasado por
// argumento: la salida nombra siempre el archivo resuelto, el host de la base y
// el dia medido, porque un numero sin destino no sustenta una decision.
//
//   node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env
//   node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/qa.env --date=2026-11-18
//   node scripts/certifications/hr-marking-blocked-workers.js --env-file=config/production.env \
//     --date=2026-11-26 --days=7 --semana=2026-11-24T21:55:07Z --sin-nombres --output=docs/qa/evidence/...
//   node scripts/certifications/hr-marking-blocked-workers.js --selftest
//
// `--semana=<corte ISO UTC>` añade el dictamen de la semana: cada dia calendario de Colombia con
// sus rechazos por clase y su antes/despues del corte, y la lista de rechazos de foto posteriores
// al corte con la marca del trabajador en la hora siguiente (0 = la jornada perdio esa pierna).
// Exige `--days=7` o mas: la ventana la fija `--days`, no este flag, y con la ventana por defecto
// el ANTES se queda en dos dias. El instrumento se bloquea antes de publicar ese numero corto.
//
// `--canal` responde si la HERRAMIENTA es el inconveniente: de que canal declarado salen las
// marcaciones que si entraron (la web que marca declara `apexos-mobile`), si llegaron en vivo o
// desde la cola (`metadata.queued_at`), con que tipo de foto de justificacion, en que ruta y en que
// dispositivo se acumulan los rechazos y los envios perdidos, y si los rechazos de una misma cuenta
// llegan en rafaga (cola reenviando el mismo cuerpo) o separados (mano humana). Selects agregados:
// ninguna lectura del censo proyecta el cuerpo base64 de una foto, y el selftest lo exige.
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
  for (const key of ["env-file", "date", "days", "output", "manifest", "semana"]) {
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

// El host del pooler es parte de la credencial de Produccion: identifica la instancia y se filtra
// igual que una cadena de conexion. La evidencia necesita afirmar A QUE ambiente se le pregunto
// (eso lo da `ambiente` + `archivo_ambiente`), no el nombre de la maquina. Los hosts locales si se
// versionan: 127.0.0.1 no es un secreto y es lo que permite distinguir una corrida de scratch.
function hostParaEvidencia(url) {
  const host = hostOf(url);
  if (/supabase|pooler/i.test(host)) return "(pooler de Supabase: el nombre de host no se versiona en evidencia)";
  return host;
}

function isoDay(value) {
  // `String(new Date())` devuelve "Wed Nov 18 2026 ..." y comparar eso contra un ISO da
  // siempre distinto: el dia calendario se extrae SIEMPRE del UTC de la fecha.
  return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
}

function messageKey(message = "") {
  return String(message).replace(/req-[0-9a-z-]+/gi, "req-*").slice(0, 160);
}

// ---- Semana (`--semana=<corte ISO UTC>`) --------------------------------------------------------
// Un corte por dia calendario de Colombia y por CLASE de rechazo, con su antes/despues de un
// instante dado. La clase se decide por lo que el registro dice, nunca por lo que el codigo trae:
// en campo el cliente manda el 400 sin codigo y lo unico que sobrevive es la frase del servidor.
// El mismo mapa lo usan la medicion y el selftest: si la clasificacion se cambia a mano en un
// solo lugar, el control se pone rojo.
function claseDeRechazo(value = {}) {
  const msg = String(value.message || "");
  const code = String(value.code || "");
  if (code === "SELFIE_REQUERIDA" || /Toma la selfie/.test(msg)) return "foto-faltante";
  if (code === "SELFIE_INVALIDA" || code.startsWith("EVIDENCIA_") || code.startsWith("EVIDENCE_")
    || /formato declarado|no pudo decodificarse|no es una .+ permitida|tipo declarado no puede aceptarse|demasiado pequeno para ser un archivo/.test(msg)) return "foto-contenido";
  if (/supera el (tamano|limite)|EVIDENCIA_SUPERA_LIMITE/.test(msg) || code === "SELFIE_SUPERA_LIMITE") return "foto-tamano";
  if (code === "MARCACION_FUERA_DE_SECUENCIA" || /siguiente marcacion permitida/.test(msg)) return "secuencia";
  if (code === "MARCACION_DIFERIDA_EXPIRADA" || /24 horas/.test(msg)) return "diferida-24h";
  if (code === "KILOMETRAJE_REQUERIDO" || /kilometraje/.test(msg)) return "kilometraje";
  if (code === "IDEMPOTENCY_KEY_CONFLICT" || /idempotencia/.test(msg)) return "llave-repetida";
  if (code === "PERMISO_DENEGADO" || code === "HORARIO_AJENO_DENEGADO" || code === "HORARIO_FUERA_DEL_DIA" || /horario asignado/.test(msg)) return "permiso-horario";
  if (code === "JORNADA_COMPLETA") return "jornada-completa";
  if (code === "MOTIVO_CORRECCION_REQUERIDO" || /Justifica por que/.test(msg)) return "justificacion-pendiente";
  if (/Backend no disponible desde frontend/.test(msg)) return "transporte-caido";
  // La frase genérica del cliente NO es transporte: es un 4xx que el navegador recibio y no supo
  // clasificar. Mezclarla con "Backend no disponible" infla la caida y esconde el rechazo real.
  if (/Solicitud frontend fallida|Solicitud rechazada por validacion/.test(msg)) return "cliente-no-clasifica";
  if (msg) return "otro";
  return "sin-mensaje";
}

// El codigo que acompana al rechazo de foto distingue la puerta que lo emito: la compuerta de
// identidad nueva siempre manda SELFIE_INVALIDA o un EVIDENCIA_* con su detalle; la validacion
// antigua de la foto de justificacion lanza un Error pelado (400 sin codigo y sin detalle) con la
// MISMA frase. Contar solo la frase juntaria las dos puertas en un mismo numero.
function bucketDeCodigosFoto(filas) {
  const out = {};
  for (const fila of filas) {
    if (!claseDeRechazo(fila).startsWith("foto-")) continue;
    const clave = `${fila.status || "-"} ${fila.code || "(sin codigo)"} | ${fila.message || "(sin mensaje)"}`;
    out[clave] = (out[clave] || 0) + 1;
  }
  return out;
}

// El dia CALENDARIO de Colombia de un instante UTC. `isoDay` mira la porcion UTC y para las
// columnas `date` de la marcacion es correcto; para agrupar rechazos no, porque una marcacion de
// las 20:32 CO de un martes cae en el miercoles UTC y el corte de media semana mentiría.
function diaColombia(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().slice(0, 10);
}

// El corte es el instante en que se PROBO el binario nuevo sirviendo (no la hora del commit): la
// fila que cae exactamente en el corte cuenta como despues, porque ese minuto ya es del mundo nuevo.
function partirPorCorte(filas, corte) {
  const desde = new Date(String(corte));
  if (!Number.isFinite(desde.getTime())) throw new Error(`--semana espera un corte ISO UTC valido y recibio: ${corte}`);
  const partes = { corte_utc: desde.toISOString(), antes: [], despues: [] };
  for (const fila of filas) (new Date(fila.timestamp) < desde ? partes.antes : partes.despues).push(fila);
  return partes;
}

// `--semana` promete una semana, pero lo que se lee depende de `--days`: con la ventana por defecto
// el ANTES se queda en dos dias y el dictamen sale corto sin avisar. Medido el 2026-11-26: la misma
// corrida sin `--days=7` devolvio 7 rechazos de foto antes del corte en vez de 38 y un denominador
// de 36 en vez de 267, y el artefacto habria quedado publicado con esa cifra. Se bloquea, no se advierte.
function validarVentanaDeSemana(ventana, diasMinimos = 7) {
  const desde = new Date(ventana.from);
  const hasta = new Date(ventana.to);
  if (!Number.isFinite(desde.getTime()) || !Number.isFinite(hasta.getTime())) {
    throw new Error(`--semana necesita una ventana UTC valida y recibio: ${JSON.stringify(ventana)}`);
  }
  const dias = (hasta - desde) / (24 * 3600 * 1000);
  if (!(dias >= diasMinimos)) {
    throw new Error(`--semana promete ${diasMinimos} dias de diagnostico pero la ventana leida cubre ${dias.toFixed(2)}; corra con --days=${diasMinimos} o mas`);
  }
  return dias;
}

// ---- Censo de canales (`--canal`) ---------------------------------------------------------------
// El dueño volcó la operación a la web para tener UNA fuente de captura. Cuando algo no entra hay
// que poder decir si la herramienta es la responsable (todos los teléfonos fallan igual y en canales
// que ya no deberían existir) o un cliente concreto (un solo teléfono repitiendo). Eso se mide:
// canal declarado por el servidor, tipo de foto declarado, dispositivo y si los rechazos de una
// misma cuenta llegan en ráfaga —firma de una cola que reenvía— o separados —firma de mano humana—.
// Las dos lecturas son SELECT agregados: NINGUNA proyecta el cuerpo de la foto. Leer
// `extra_evidence->>'base64_data'` detoasta megas por fila y convierte la medición en el problema
// que mide (plan de disco 2026-11-18); por eso el censo pregunta por la EXISTENCIA de la clave.
function sqlCensoDeCanales() {
  return `
SELECT "tenant_id" AS tenant,
       COALESCE("metadata"->>'source', '(sin source)') AS canal,
       CASE WHEN COALESCE("metadata"->>'offline', '(sin declaracion)') = 'true' THEN 'abierto_sin_senal'
            WHEN COALESCE("metadata"->>'queued_at', '') <> '' THEN 'reintento_de_cola'
            ELSE 'en_vivo' END AS envio,
       CASE WHEN COALESCE("extra_evidence"->>'type', '') = '' THEN '(sin evidencia adjunta)'
            ELSE "extra_evidence"->>'type' END AS tipo_declarado,
       CASE WHEN "extra_evidence" ? 'base64_data' THEN 'con_foto_inline' ELSE 'sin_foto_inline' END AS cuerpo,
       CASE WHEN COALESCE("extra_evidence"->>'storage_path', '') = '' THEN 'sin_ruta_almacen'
            ELSE 'con_ruta_almacen' END AS respaldo,
       COUNT(*)::int AS marcaciones,
       COUNT(DISTINCT "employee_id")::int AS trabajadores,
       COALESCE(SUM(CASE WHEN jsonb_typeof("extra_evidence"->'size') = 'number'
                         THEN ("extra_evidence"->>'size')::int ELSE 0 END), 0)::bigint AS bytes_declarados
FROM "TimePunch"
WHERE "date" >= $1::timestamptz AND "date" < $2::timestamptz
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY marcaciones DESC, tenant, canal
`;
}

// Quiénes lograron adjuntar la foto de justificación y con qué tipo declarado, partido por el corte.
// Sin esta lectura no se puede afirmar que "la herramienta funciona para los demás": el único
// denominador honesto es cuántos aceptados con evidencia hay del otro lado de la puerta.
function sqlCensoDeEvidencia() {
  return `
SELECT "employee_id" AS empleado,
       CASE WHEN COALESCE("extra_evidence"->>'type', '') = '' THEN '(sin tipo declarado)'
            ELSE "extra_evidence"->>'type' END AS tipo_declarado,
       CASE WHEN "extra_evidence" ? 'base64_data' THEN 'con_foto_inline' ELSE 'sin_foto_inline' END AS cuerpo,
       COUNT(*) FILTER (WHERE "punched_at" < $3::timestamptz)::int AS antes_del_corte,
       COUNT(*) FILTER (WHERE "punched_at" >= $3::timestamptz)::int AS despues_del_corte
FROM "TimePunch"
WHERE "date" >= $1::timestamptz AND "date" < $2::timestamptz
  AND jsonb_typeof("extra_evidence") = 'object'
  AND COALESCE("extra_evidence"->>'type', '') <> ''
GROUP BY 1, 2, 3
ORDER BY empleado, tipo_declarado
`;
}

// Las marcaciones que no traen estampa de canal hay que nombrarlas, no contarlas en bloque: esta
// lectura devuelve SOLO nombres de clave del jsonb `metadata` (jamais su valor, jamas un cuerpo),
// para poder decir si son correcciones administrativas, rescates del propio triage o capturas que
// llegaron sin estampa.
function sqlCensoDeEstampas() {
  return `
SELECT k AS clave_de_metadata,
       COUNT(*)::int AS marcaciones,
       COUNT(DISTINCT "employee_id")::int AS trabajadores
FROM "TimePunch", jsonb_object_keys("metadata") AS k
WHERE "date" >= $1::timestamptz AND "date" < $2::timestamptz
  AND COALESCE("metadata"->>'source', '') = ''
GROUP BY 1
ORDER BY marcaciones DESC, clave_de_metadata
LIMIT 25
`;
}

function afirmarQueElCensoNombraClavesDelMetadata(sql, nombre) {
  if (!/jsonb_object_keys\(\s*"metadata"\s*\)/.test(sql)) {
    throw new Error(`${nombre} dejo de enumerar los NOMBRES de clave del metadata: las marcaciones sin canal quedan en un bloque inatribuible y el dueno vuelve a preguntar "entonces quien las hizo"`);
  }
  return { nombra_claves_del_metadata: true };
}

function afirmarQueElCensoNoArrastraCuerpos(sql, nombre, { exigePresencia = true } = {}) {
  const lecturasDeCuerpo = (sql.match(/->>\s*'base64_data'/g) || []).length;
  if (lecturasDeCuerpo > 0) {
    throw new Error(`${nombre} proyecta el cuerpo de la foto (${lecturasDeCuerpo} lectura(s) de base64_data): eso detoasta megas por fila en Produccion y viola la regla 58`);
  }
  const presenciasDeClave = (sql.match(/\?\s*'base64_data'/g) || []).length;
  if (exigePresencia && presenciasDeClave === 0) {
    throw new Error(`${nombre} dejó de preguntar por la existencia de la clave base64_data: sin ese criterio no se separa el respaldo del cuerpo y el censo miente sobre la evidencia`);
  }
  return { lecturas_de_cuerpo: 0, presencias_de_clave: presenciasDeClave };
}

// La pregunta del dueño tiene forma de número: si la operación quedó homologada en la web, TODAS
// las marcaciones aceptadas deberían traer el canal que declara ese cliente. Todo lo que caiga
// fuera de ese canal es otra fuente viva, y hay que nombrarla con su conteo, no dejarla en "se ve
// parecido". El `envio` (en vivo / cola reintentada / abierto sin señal) es el que dice si el
// cuerpo de la foto que llega es de este minuto o de un guardado anterior.
const CANAL_WEB_QUE_MARCA = "apexos-mobile";

function agruparCensoDeCanales(filas = [], { canalEsperado = CANAL_WEB_QUE_MARCA } = {}) {
  const acumular = (mapa, clave, fila) => {
    const actual = mapa.get(clave) || { clave, marcaciones: 0, trabajadores: 0, tipos: new Set(), inline: 0, respaldo: 0, bytes_declarados: 0 };
    actual.marcaciones += Number(fila.marcaciones || 0);
    actual.trabajadores += Number(fila.trabajadores || 0);
    actual.tipos.add(fila.tipo_declarado);
    if (fila.cuerpo === "con_foto_inline") actual.inline += Number(fila.marcaciones || 0);
    if (fila.respaldo === "con_ruta_almacen") actual.respaldo += Number(fila.marcaciones || 0);
    actual.bytes_declarados += Number(fila.bytes_declarados || 0);
    mapa.set(clave, actual);
  };
  const porCanal = new Map();
  const porTipo = new Map();
  const porEnvio = new Map();
  const porTenant = new Map();
  for (const fila of filas) {
    if (!Number.isFinite(Number(fila.marcaciones))) {
      throw new Error(`el censo de canales devolvio una fila sin conteo numerico: ${JSON.stringify(fila)}`);
    }
    acumular(porCanal, fila.canal, fila);
    acumular(porTipo, fila.tipo_declarado, fila);
    acumular(porEnvio, fila.envio, fila);
    // El censo se corre con SQL crudo y el aislamiento de tenant lo sostiene el middleware, no la
    // base: si la lectura cruza empresas hay que verlo escrito, no confiar en que no cruzo.
    acumular(porTenant, fila.tenant || "(sin tenant)", fila);
  }
  const sellar = (mapa) => [...mapa.values()]
    .map((x) => ({
      clave: x.clave,
      marcaciones: x.marcaciones,
      trabajadores: x.trabajadores,
      con_foto_inline: x.inline,
      con_ruta_de_almacen: x.respaldo,
      megas_declarados: Math.round((x.bytes_declarados / 1048576) * 10) / 10,
      tipos: [...x.tipos].sort()
    }))
    .sort((a, b) => b.marcaciones - a.marcaciones);
  const total = [...porCanal.values()].reduce((suma, x) => suma + x.marcaciones, 0);
  const enElCanal = (porCanal.get(canalEsperado) || { marcaciones: 0, trabajadores: 0 }).marcaciones;
  return {
    canal_que_declara_la_web: canalEsperado,
    total_marcaciones: total,
    canales_distintos: porCanal.size,
    tipos_distintos: porTipo.size,
    tenants_observados: porTenant.size,
    marcaciones_en_el_canal_de_la_web: enElCanal,
    marcaciones_fuera_del_canal_de_la_web: total - enElCanal,
    porcentaje_en_el_canal_de_la_web: total > 0 ? Math.round((enElCanal / total) * 1000) / 10 : null,
    por_canal: sellar(porCanal),
    por_tipo_declarado: sellar(porTipo),
    por_envio: sellar(porEnvio),
    por_tenant: sellar(porTenant)
  };
}

// Ráfaga = el mismo operario reintentando en segundos. Es la firma de una cola que reenvía el
// mismo cuerpo (IndexedDB conserva la foto con el tipo declarado en el momento del click), y
// distingue eso de un trabajador que vuelve a oprimir el botón media hora después.
function rafagaDeReintentos(filas = [], umbralSegundos = 180) {
  const instantes = filas.map((fila) => new Date(fila).getTime()).filter((ms) => Number.isFinite(ms)).sort((a, b) => a - b);
  const brechas = [];
  for (let i = 1; i < instantes.length; i += 1) brechas.push(Math.round((instantes[i] - instantes[i - 1]) / 1000));
  const breves = brechas.filter((segundos) => segundos <= umbralSegundos).length;
  const separados = brechas.length - breves;
  let senal = "unica";
  if (brechas.length > 0) senal = breves > separados ? "rafaga" : "disperso";
  return { intentos: instantes.length, brechas_segundos: brechas, senal, umbral_segundos: umbralSegundos };
}

// El porcentaje de concentración solo se afirma con denominador mayor que cero: un 0 % inventado
// sobre una ventana sin rechazos leería "no es la herramienta" sin haber medido nada. El recorte "top 5"
// satura al 100 % cuando hay menos claves que el recorte, así que se reporta aparte el peso de la
// PRIMERA clave: es el número que dice si un solo teléfono acumula la caída.
function concentracionPorClave(filas = [], claveDe, top = 5) {
  const conteos = new Map();
  for (const fila of filas) {
    const clave = String(claveDe(fila));
    conteos.set(clave, (conteos.get(clave) || 0) + 1);
  }
  const ordenadas = [...conteos].sort((a, b) => b[1] - a[1]);
  const total = filas.length;
  const enTop = ordenadas.slice(0, top).reduce((suma, pareja) => suma + pareja[1], 0);
  const porcentaje = (parte) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);
  return {
    total,
    claves_distintas: conteos.size,
    en_el_top: enTop,
    porcentaje_en_el_top: porcentaje(enTop),
    primera_clave: ordenadas.length ? ordenadas[0][0] : null,
    ocurrencias_en_la_primera_clave: ordenadas.length ? ordenadas[0][1] : 0,
    porcentaje_en_la_primera_clave: porcentaje(ordenadas.length ? ordenadas[0][1] : 0),
    top: ordenadas.slice(0, top).map(([clave, ocurrencias]) => ({ clave, ocurrencias }))
  };
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

// El buzon publico acepta exactamente esta forma, y el instrumento tampoco confia en otra cosa:
// un id con otra forma no llego del navegador, llego de un cuerpo manipulado.
const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Que telefono es de quien. Solo se aprende de filas que YA tienen usuario: un intento sin sesion
// no puede atribuirse a si mismo, y una marca vista por primera vez en una fila anonima se queda
// sin dueno hasta que ese navegador vuelva a entrar con sesion.
function duenosPorDispositivo(rows) {
  const mapa = new Map();
  for (const row of rows || []) {
    if (!row || !row.device_id || !Number.isInteger(row.user_id)) continue;
    const clave = `${row.tenant_id}|${row.device_id}`;
    if (!mapa.has(clave)) mapa.set(clave, row.user_id);
  }
  return mapa;
}

// El grupo huerfano, agrupado por el navegador que oprimio y con su dueno si ya se conoce. Sin
// esto, los rechazos de `user_id null` eran una sola cifra informe-independiente; con esto el
// supervisor ve que telefono persigue y a quien llamar.
function intentosSinUsuarioPorDispositivo(rows, duenos, employeeByUser) {
  const huerfanas = (rows || []).filter((row) => row.user_id === null && row.device_id);
  const grupos = [];
  for (const [clave, filas] of groupBy(huerfanas, (row) => `${row.tenant_id}|${row.device_id}`)) {
    const [tenantId, deviceId] = clave.split("|");
    const userId = duenos.get(clave) ?? null;
    const empleado = userId !== null ? (employeeByUser.get(`${tenantId}|${userId}`) || null) : null;
    grupos.push({
      tenant_id: tenantId,
      device_id: deviceId,
      user_id: userId,
      nombre: empleado && empleado.user ? empleado.user.name : null,
      empleado_codigo: empleado ? empleado.code : null,
      user_email: empleado && empleado.user ? empleado.user.email : null,
      rechazos: filas.length,
      intentos_de_marcacion: filas.filter(esIntentoDeMarcacionPropia).length,
      rutas: [...new Set(filas.map((fila) => fila.route).filter(Boolean))],
      navegadores: [...new Set(filas.map((fila) => fila.device))],
      ultimo_rechazo: filas[0].at,
      estado: empleado ? "ATRIBUIBLE_POR_DISPOSITIVO" : userId !== null ? "USUARIO_SIN_EMPLEADO" : "SIN_DUENO_AUN"
    });
  }
  return grupos.sort((a, b) => b.rechazos - a.rechazos);
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
    // La marca del navegador, si el reporte la traia. Se valida por forma, no por presencia: un
    // valor inventado en el cuerpo de la peticion no puede adjudicarle una jornada a nadie.
    device_id: value.metadata && UUID_CANONICO.test(String(value.metadata.device_id || "")) ? String(value.metadata.device_id) : null,
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
// La otra punta del mismo almacen: por aqui no oprime un operario, corrige un administrador.
// Mezclarlas hace que el propio rescatista aparezca como trabajador bloqueado los dias en que
// escribio, y el supervisor persigue un empleado fantasma.
const RUTA_DE_CORRECCION = "/api/v1/hr/time-punches";

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

// El oprimido del operario es el que llega por la ruta propia del dispositivo. El de la ruta
// administrativa es una correccion que fallo: prueba otra cosa y no puede inflar los intentos
// de quien se reporta bloqueado.
function esIntentoDeMarcacionPropia(row) {
  return !!row && row.route === RUTA_DE_MARCACION;
}

function rechazosDeOperario(rows) {
  return rows.filter((row) => row.route !== RUTA_DE_CORRECCION).length;
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

function construirRescate({ jornadasSinRegistro, jornadasSinCierre, marcasPorTrabajadorDia, intentosPorUsuarioDia, rutasPorEmpleadoDia, identidades, ahora = Date.now() }) {
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
  // la anterior del mismo dia es un artefacto de la evidencia y no una marcacion que registrar. Y una
  // pierna con hora futura es peor: seria firmar que alguien salio a una hora que aun no llego, sobre
  // una jornada que sigue abierta. Esa se descarta y se queda esperando a que el dia cierre.
  const descartadas = [];
  for (const [, rows] of groupBy(filas, (row) => `${row.empleado_id}|${row.dia}`)) {
    rows.sort((a, b) => ORDEN_MARCAS.indexOf(a.tipo) - ORDEN_MARCAS.indexOf(b.tipo));
    let anterior = null;
    for (const row of rows) {
      const ms = new Date(row.punched_at).getTime();
      if (ms > ahora) {
        descartadas.push({ empleado_id: row.empleado_id, dia: row.dia, tipo: row.tipo, hora_colombia: row.hora_colombia, motivo: "hora futura: la jornada de ese dia sigue abierta" });
        filas.splice(filas.indexOf(row), 1);
        continue;
      }
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
    // La lista de booleanos que alimentaba el codigo de salida se mantenia a mano y ya habia
    // quedado atras: dos checks imprimian FALLO sin bloquear. Aqui lo que se imprime es lo que
    // cuenta, asi que un check nuevo no puede nacer decorativo.
    const informa = (linea) => {
      if (/^FALLO/.test(linea)) failed += 1;
      console.log(linea);
    };
    for (const testCase of cases) {
      const parsed = parseArgs(testCase.argv);
      for (const [key, value] of Object.entries(testCase.expect)) {
        const ok = parsed[key] === value;
        informa(`${ok ? "ok  " : "FALLO"} --${key}=${JSON.stringify(parsed[key])} esperado ${JSON.stringify(value)} (argv: ${testCase.argv.join(" ")})`);
      }
    }
    const drifted = parseFailures(["--env-file"]);
    informa(`${drifted.length === 1 ? "ok  " : "FALLO"} la compuerta detecta un --env-file sin valor (rojo provocado): ${JSON.stringify(drifted)}`);
    const quiet = parseFailures(["--env-file=config/qa.env", "--date", "2026-11-17"]);
    informa(`${quiet.length === 0 ? "ok  " : "FALLO"} ambas formas de argumento resuelven sin arrastrar el predeterminado: ${JSON.stringify(quiet)}`);
    const window = dayWindow("2026-11-19");
    const windowOk = window.from.toISOString() === "2026-11-19T05:00:00.000Z" && window.to.toISOString() === "2026-11-20T05:00:00.000Z";
    informa(`${windowOk ? "ok  " : "FALLO"} ventana de jornada colombiana: ${window.from.toISOString()} .. ${window.to.toISOString()}`);
    informa(`${deviceKey("Mozilla/5.0 (Linux; Android 10) Chrome/157.0.0.0 Mobile Safari/537.36") === "Android / Chrome 157" ? "ok  " : "FALLO"} agrupacion de dispositivo`);
    const isoOk = isoDay(new Date("2026-11-18T23:30:00.000Z")) === "2026-11-18" && isoDay("2026-11-19T05:00:00.000Z") === "2026-11-19";
    informa(`${isoOk ? "ok  " : "FALLO"} dia calendario ISO (no el texto legible del Date): ${isoDay(new Date("2026-11-18T23:30:00.000Z"))}`);
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
    informa(`${namesOut ? "ok  " : "FALLO"} --sin-nombres poda nombre, empleado_codigo, codigo y correo en cualquier nivel`);
    informa(`${idsDentro && intacto ? "ok  " : "FALLO"} la medicion conserva user/emp/dia y los codigos HTTP (rojo provocado si se poda de mas)`);
    // El rescate se sostiene en tres reglas puras. Cada una se prueba con su rojo provocado:
    // si el diferenciador deja de discriminar, el manifiesto deja de ser confiable.
    const piernaOk = piernaNombrada("La siguiente marcacion permitida es fin_almuerzo.") === "fin_almuerzo"
      && piernaNombrada("La marcacion diferida supero las 24 horas permitidas.") === null;
    informa(`${piernaOk ? "ok  " : "FALLO"} la pierna se lee del mensaje del servidor y no de la intuicion`);
    const inmediatoOk = esIntentoInmediato({ route: RUTA_DE_MARCACION, code: "MARCACION_DIFERIDA_EXPIRADA", message: "x" }) === false
      && esIntentoInmediato({ route: RUTA_DE_MARCACION, code: "SELFIE_REQUERIDA", message: "x" }) === true
      && esIntentoInmediato({ route: RUTA_DE_MARCACION, code: null, message: "Backend no disponible desde frontend" }) === true
      && esIntentoInmediato({ route: "/api/v1/hr/self/gps/ping", code: null, message: "Backend no disponible desde frontend" }) === false;
    informa(`${inmediatoOk ? "ok  " : "FALLO"} una marca diferida nunca presta su hora (es el reintento) y solo la ruta de marcacion cuenta`);
    // Quien corrige no es quien quedo bloqueado. Las dos rutas tienen que seguir siendo distintas
    // entre si y con el operario: si una se reescribe con el prefijo de la otra, la seleccion de
    // personas vuelve a llenarse del propio rescatista (emp 551, medido el 2026-11-20).
    const rutasSeparadasOk = RUTA_DE_CORRECCION !== RUTA_DE_MARCACION
      && !RUTA_DE_MARCACION.startsWith(RUTA_DE_CORRECCION) && !RUTA_DE_CORRECCION.startsWith(`${RUTA_DE_MARCACION}/`);
    informa(`${rutasSeparadasOk ? "ok  " : "FALLO"} la ruta de correccion y la del operario siguen siendo dos rutas (rojo provocado si una traga a la otra)`);
    const rolOk = rechazosDeOperario([{ route: RUTA_DE_CORRECCION }, { route: RUTA_DE_CORRECCION }]) === 0
      && rechazosDeOperario([{ route: RUTA_DE_CORRECCION }, { route: RUTA_DE_MARCACION }]) === 1
      && rechazosDeOperario([{ route: "/api/v1/accounting/accounts" }]) === 1
      && esIntentoDeMarcacionPropia({ route: RUTA_DE_MARCACION }) === true
      && esIntentoDeMarcacionPropia({ route: RUTA_DE_CORRECCION }) === false;
    informa(`${rolOk ? "ok  " : "FALLO"} una correccion administrativa rechazada no es intento de marcacion ni hace a un operario afectado (rojo provocado: las 30 escritas por el rescatista)`);
    const utcOk = utcDeHoraLocal("2026-11-18", "05:30") === "2026-11-18T10:30:00.000Z"
      && utcDeHoraLocal("2026-11-18", "04:00", { finDeJornada: true, horaInicio: "22:00" }) === "2026-11-19T09:00:00.000Z"
      && utcDeHoraLocal("2026-11-18", "-") === null;
    informa(`${utcOk ? "ok  " : "FALLO"} la hora del horario se ancla a Colombia-05:00 y cruza medianoche solo al cerrar`);
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
    informa(`${rescateOk ? "ok  " : "FALLO"} el rescate no presta la hora de un reintento, no inventa almuerzos ni toca dias sin rechazos (rojo provocado: ${uno || "nada"} | descartadas ${JSON.stringify(rescate.descartadas)})`);
    // La hora que aun no llega tampoco se firma: las mismas fichas con el reloj puesto a mitad de la
    // jornada (13:00 CO) solo pueden proponer la entrada; la salida de las 14:00 espera a que cierre.
    const aMediodia = construirRescate({
      jornadasSinRegistro: [{ empleado_id: 1, dia: "2026-11-18", sin_registro: true }],
      jornadasSinCierre: [],
      marcasPorTrabajadorDia: marcas,
      intentosPorUsuarioDia: intentos,
      rutasPorEmpleadoDia: rutas,
      identidades,
      ahora: Date.parse("2026-11-18T18:00:00.000Z")
    });
    const futuraOk = aMediodia.length === 1 && aMediodia[0].tipo === "entrada"
      && aMediodia.descartadas.some((row) => row.tipo === "salida" && /hora futura/.test(row.motivo));
    informa(`${futuraOk ? "ok  " : "FALLO"} una pierna con hora futura se descarta en vez de firmarse (propuestas: ${aMediodia.map((row) => row.tipo).join(",") || "nada"} | descartadas ${JSON.stringify(aMediodia.descartadas.map((row) => row.motivo))})`);
    const ventanaOk = minutosDeHora("05:30:00") === 330 && minutosDeHora(null) === null
      && minutosDelDiaColombia("2026-11-18T10:30:00.000Z") === 5 * 60 + 30;
    informa(`${ventanaOk ? "ok  " : "FALLO"} minutos del dia en Colombia (la ventana de apertura compara horas locales, no UTC)`);
    // La marca del navegador es lo unico que puede devolverle el dueno a un rechazo sin sesion. Se
    // prueba por las cuatro vias: comparte marca y tenant -> adjudica; no comparte -> NO adjudica
    // (rojo provocado); la marca no es UUID -> el cuerpo manipulado no existe; la marca se repite en
    // otro tenant -> no cruza, porque un id de dispositivo ajeno tampoco puede dar una jornada.
    const MARCA = "6f1c2d3e-4a5b-4c6d-9e7f-8a9b0c1d2e3f";
    const OTRA = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const fila = (user_id, device_id, tenant = "t1") => normalize({
      tenant_id: tenant, user_id, timestamp: "2026-11-23T14:00:00.000Z",
      user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/605.1.15",
      new_value: { route: RUTA_DE_MARCACION, status_code: 409, code: "MARCACION_FUERA_DE_SECUENCIA", metadata: device_id ? { device_id } : {} }
    });
    const fichas = new Map([["t1|239", { id: 535, code: "OP-535", tenant_id: "t1", user_id: 239, user: { name: "Dos Nombres", email: "op@example.invalid" } }]]);
    const filasConMarca = [fila(239, MARCA), fila(null, MARCA), fila(null, MARCA)];
    const conDueno = intentosSinUsuarioPorDispositivo(filasConMarca, duenosPorDispositivo(filasConMarca), fichas);
    const adjudicaOk = conDueno.length === 1 && conDueno[0].estado === "ATRIBUIBLE_POR_DISPOSITIVO"
      && conDueno[0].user_id === 239 && conDueno[0].empleado_codigo === "OP-535"
      && conDueno[0].rechazos === 2 && conDueno[0].intentos_de_marcacion === 2 && conDueno[0].rutas.join(",") === RUTA_DE_MARCACION;
    informa(`${adjudicaOk ? "ok  " : "FALLO"} la marca compartida con una fila autenticada devuelve el dueno de la jornada: ${JSON.stringify(conDueno.map((g) => [g.estado, g.user_id, g.empleado_codigo, g.rechazos, g.intentos_de_marcacion]))}`);
    const filasHuerfanas = [fila(null, OTRA), fila(null, OTRA)];
    const huerfano = intentosSinUsuarioPorDispositivo(filasHuerfanas, duenosPorDispositivo(filasHuerfanas), fichas);
    const noInventaOk = huerfano.length === 1 && huerfano[0].estado === "SIN_DUENO_AUN" && huerfano[0].user_id === null && huerfano[0].empleado_codigo === null && huerfano[0].rechazos === 2;
    informa(`${noInventaOk ? "ok  " : "FALLO"} sin una fila autenticada que comparta la marca no se inventa dueno (rojo provocado): ${JSON.stringify(huerfano.map((g) => [g.estado, g.user_id, g.empleado_codigo]))}`);
    const torcida = fila(null, "no-es-un-uuid");
    const formaOk = torcida.device_id === null && intentosSinUsuarioPorDispositivo([torcida], duenosPorDispositivo([torcida]), fichas).length === 0;
    informa(`${formaOk ? "ok  " : "FALLO"} una marca que no tiene forma de UUID se descarta: un cuerpo manipulado no puede adjudicar la jornada de otro`);
    const filasCruzadas = [...filasConMarca, fila(null, MARCA, "t2"), fila(999, MARCA, "t2")];
    const cruzados = intentosSinUsuarioPorDispositivo(filasCruzadas, duenosPorDispositivo(filasCruzadas), fichas);
    const grupoT2 = cruzados.find((g) => g.tenant_id === "t2");
    const aislamientoOk = cruzados.length === 2 && grupoT2 && grupoT2.empleado_codigo === null && grupoT2.user_id === 999
      && grupoT2.estado === "USUARIO_SIN_EMPLEADO" && cruzados.find((g) => g.tenant_id === "t1").empleado_codigo === "OP-535";
    informa(`${aislamientoOk ? "ok  " : "FALLO"} la misma marca en otro tenant no hereda la ficha del primero (la marca es por tenant): ${JSON.stringify(cruzados.map((g) => [g.tenant_id, g.estado, g.empleado_codigo]))}`);

    // Controles del modo `--semana`: la clase se decide por la frase del servidor (en campo el
    // cliente manda el 400 sin codigo), el corte no puede tragar filas ni afirmar un despues vacio,
    // y el dia es el calendario de Colombia (05:00 UTC), no la porcion UTC del instante.
    const fotoSinCodigo = claseDeRechazo({ message: "El contenido del archivo no coincide con el formato declarado.", code: "" });
    informa(`${fotoSinCodigo === "foto-contenido" ? "ok  " : "FALLO"} un 400 de foto sin codigo se clasifica por la frase del servidor: ${fotoSinCodigo}`);
    const caidaNoEsFoto = claseDeRechazo({ message: "Backend no disponible desde frontend (TypeError: Failed to fetch)" });
    informa(`${caidaNoEsFoto === "transporte-caido" && !caidaNoEsFoto.startsWith("foto-") ? "ok  " : "FALLO"} un fallo de red no se cuenta como rechazo de foto: ${caidaNoEsFoto}`);
    const genericaDelCliente = claseDeRechazo({ message: "Solicitud frontend fallida" });
    // Rojo provocado: si la frase generica se clasifica como caida, el numero de intermitencia sube
    // con rechazos ajenos a la red y el dictamen de disponibilidad deja de ser creible.
    informa(`${genericaDelCliente === "cliente-no-clasifica" ? "ok  " : "FALLO"} la frase generica del cliente no infla la caida de red (rojo provocado): ${genericaDelCliente}`);
    const faltaLaFoto = claseDeRechazo({ code: "SELFIE_REQUERIDA", message: "Toma la selfie para continuar." });
    informa(`${faltaLaFoto === "foto-faltante" ? "ok  " : "FALLO"} la foto que nunca llego es clase propia, no contenido rechizado: ${faltaLaFoto}`);
    const muyGrande = claseDeRechazo({ message: "El archivo supera el tamano maximo permitido. Limite: 6291456 bytes." });
    informa(`${muyGrande === "foto-tamano" ? "ok  " : "FALLO"} el tope de tamano tiene su propia clase: ${muyGrande}`);
    const fueraDeOrden = claseDeRechazo({ message: "La siguiente marcacion permitida es SALIDA." });
    informa(`${fueraDeOrden === "secuencia" ? "ok  " : "FALLO"} un rechazo de secuencia no se disfraza de foto: ${fueraDeOrden}`);
    const sinContenido = claseDeRechazo({ message: "" });
    informa(`${sinContenido === "sin-mensaje" ? "ok  " : "FALLO"} un registro sin mensaje se cuenta aparte, no como rechazo de foto: ${sinContenido}`);
    const puertasFoto = bucketDeCodigosFoto([
      { status: 400, code: "SELFIE_INVALIDA", message: "El contenido del archivo no coincide con el formato declarado." },
      { status: 400, code: "", message: "El contenido del archivo no coincide con el formato declarado." },
      { status: 400, code: "EVIDENCIA_CLASE_RECHAZADA", message: "El contenido del archivo no es una imagen permitida." },
      { status: 0, code: "", message: "Backend no disponible desde frontend (TypeError: Failed to fetch)" }
    ]);
    // Rojo provocado: si el contador se hace solo con la frase, las dos puertas dan un numero
    // conjunto y el dictamen no puede decir cual de las dos sigue rechazando en campo.
    const llavesPuertas = Object.keys(puertasFoto);
    informa(`${llavesPuertas.length === 3 && puertasFoto["400 SELFIE_INVALIDA | El contenido del archivo no coincide con el formato declarado."] === 1 && puertasFoto["400 (sin codigo) | El contenido del archivo no coincide con el formato declarado."] === 1 ? "ok  " : "FALLO"} la compuerta nueva (SELFIE_INVALIDA) y la validacion antigua (sin codigo) se cuentan aparte aunque digan la misma frase, y una caida de red no entra: ${JSON.stringify(puertasFoto)}`);
    const marcasDePrueba = ["2026-11-24T21:55:07.000Z", "2026-11-24T20:00:00.000Z", "2026-11-25T01:32:10.933Z"]
      .map((timestamp) => ({ timestamp: new Date(timestamp) }));
    const particion = partirPorCorte(marcasDePrueba, "2026-11-24T21:55:07.000Z");
    informa(`${particion.antes.length === 1 && particion.despues.length === 2 && particion.antes.length + particion.despues.length === marcasDePrueba.length ? "ok  " : "FALLO"} la fila que cae justo en el corte cuenta como despues y ninguna se pierde: antes ${particion.antes.length} / despues ${particion.despues.length}`);
    const corteFuturo = partirPorCorte(marcasDePrueba, "2027-01-01T00:00:00.000Z");
    informa(`${corteFuturo.despues.length === 0 ? "ok  " : "FALLO"} un corte en el futuro no puede dar un DESPUES con filas (rojo provocado si el corte se compara al reves): antes ${corteFuturo.antes.length} / despues ${corteFuturo.despues.length}`);
    let corteInvalido = "ACEPTO (FALLO)";
    try {
      partirPorCorte(marcasDePrueba, "ayer");
    } catch (error) {
      corteInvalido = error.message.includes("--semana") ? "BLOQUEADO" : corteInvalido;
    }
    informa(`${corteInvalido === "BLOQUEADO" ? "ok  " : "FALLO"} un --semana sin fecha ISO UTC valida se bloquea en vez de medir con fechas NaN: ${corteInvalido}`);
    // La ventana que se lee depende de `--days`, no del flag `--semana`. Con la ventana por defecto
    // el ANTES se encoge a dos dias y el dictamen sale corto sin ruido: medido el 2026-11-26, la
    // misma corrida sin `--days=7` reporto 7 rechazos de foto antes del corte (38 reales) y un
    // denominador de 36 marcaciones (267 reales). Se bloquea, no se consuela con una advertencia.
    let ventanaCorta = "ACEPTO (FALLO)";
    try {
      validarVentanaDeSemana({ from: "2026-11-24T05:00:00.000Z", to: "2026-11-27T05:00:00.000Z" }, 7);
    } catch (error) {
      ventanaCorta = error.message.includes("--days=7") ? "BLOQUEADO" : ventanaCorta;
    }
    const ventanaDeSieteDias = validarVentanaDeSemana({ from: "2026-11-19T14:00:00.000Z", to: "2026-11-26T14:00:00.000Z" }, 7);
    informa(`${ventanaCorta === "BLOQUEADO" && ventanaDeSieteDias === 7 ? "ok  " : "FALLO"} una ventana de menos de 7 dias bloquea el dictamen de semana en vez de reportar un ANTES corto: ${ventanaCorta} | ventana completa leida = ${ventanaDeSieteDias} dias`);
    let ventanaSinFechas = "ACEPTO (FALLO)";
    try {
      validarVentanaDeSemana({ from: "ayer", to: "2026-11-26T14:00:00.000Z" }, 7);
    } catch (error) {
      ventanaSinFechas = error.message.includes("ventana UTC valida") ? "BLOQUEADO" : ventanaSinFechas;
    }
    informa(`${ventanaSinFechas === "BLOQUEADO" ? "ok  " : "FALLO"} una ventana con fechas NaN se bloquea antes de partir por corte: ${ventanaSinFechas}`);
    const antesDeLasCinco = diaColombia(new Date("2026-11-25T04:30:00.000Z"));
    const enLasCinco = diaColombia("2026-11-25T05:00:00.000Z");
    informa(`${antesDeLasCinco === "2026-11-24" && enLasCinco === "2026-11-25" ? "ok  " : "FALLO"} el dia de Colombia abre a las 05:00 UTC: 04:30Z -> ${antesDeLasCinco} | 05:00Z -> ${enLasCinco}`);
    // Fila real de produccion: una marcacion de las 20:32 CO del martes llega al servidor a las
    // 01:32 UTC del miercoles. Si el agrupador usa la porcion UTC, el rechazo se le atribuye a otro dia.
    const nocheDeMartes = diaColombia(new Date("2026-11-25T01:32:10.933Z"));
    informa(`${nocheDeMartes === "2026-11-24" ? "ok  " : "FALLO"} las 20:32 CO del 24 se cuentan el martes y no el miercoles UTC: ${nocheDeMartes}`);

    // Controles del modo `--canal`: la pregunta es si la HERRAMIENTA es el inconveniente o es un
    // cliente concreto, y eso no se responde con una impresion. Un canal inesperado tiene que verse
    // (no diluirse en un total), la rafaga tiene que distinguirse del reintento separado, la
    // concentracion no puede afirmarse sin denominador y la lectura jamas puede arrastrar el cuerpo
    // de una foto: eso detoasta megas por fila y convierte la medicion en el problema que mide.
    {
      const filasFalsas = [
        { tenant: "t1", canal: "apexos-mobile", envio: "en_vivo", tipo_declarado: "image/jpeg", cuerpo: "con_foto_inline", respaldo: "con_ruta_almacen", marcaciones: 300, trabajadores: 18, bytes_declarados: 5 * 1048576 },
        { tenant: "t1", canal: "apexos-mobile", envio: "reintento_de_cola", tipo_declarado: "(sin evidencia adjunta)", cuerpo: "sin_foto_inline", respaldo: "sin_ruta_almacen", marcaciones: 70, trabajadores: 12, bytes_declarados: 0 },
        { tenant: "t1", canal: "app_legada", envio: "en_vivo", tipo_declarado: "image/jpeg", cuerpo: "con_foto_inline", respaldo: "con_ruta_almacen", marcaciones: 9, trabajadores: 3, bytes_declarados: 1048576 }
      ];
      const censoFalso = agruparCensoDeCanales(filasFalsas);
      const sumaPorCanal = censoFalso.por_canal.reduce((s, x) => s + x.marcaciones, 0);
      const sumaPorEnvio = censoFalso.por_envio.reduce((s, x) => s + x.marcaciones, 0);
      const canalInesperado = censoFalso.por_canal.find((x) => x.clave === "app_legada");
      informa(`${sumaPorCanal === 379 && sumaPorEnvio === 379 && censoFalso.tenants_observados === 1 && censoFalso.marcaciones_en_el_canal_de_la_web === 370 && censoFalso.marcaciones_fuera_del_canal_de_la_web === 9 && canalInesperado && Math.round(censoFalso.porcentaje_en_el_canal_de_la_web) === 98 ? "ok  " : "FALLO"} el censo no disuelve un canal inesperado y las sumas cuadran: total ${censoFalso.total_marcaciones} | en la web ${censoFalso.marcaciones_en_el_canal_de_la_web} (${censoFalso.porcentaje_en_el_canal_de_la_web} %) | fuera ${censoFalso.marcaciones_fuera_del_canal_de_la_web} | suma por canal ${sumaPorCanal} | suma por envio ${sumaPorEnvio} | tenants observados ${censoFalso.tenants_observados}`);

      // El mismo numero de rechazos dice dos cosas distintas segun como llegan: tres en un minuto es
      // una cola que reenvia el mismo cuerpo; tres en tres dias es un operario que lo intento a mano.
      const rafagaFalsa = rafagaDeReintentos([
        new Date("2026-11-26T13:52:10Z"), new Date("2026-11-26T13:53:05Z"), new Date("2026-11-26T13:53:40Z")
      ]);
      const dispersoFalso = rafagaDeReintentos([
        new Date("2026-11-24T01:32:00Z"), new Date("2026-11-25T01:21:00Z"), new Date("2026-11-26T13:52:00Z")
      ]);
      const unicoFalso = rafagaDeReintentos([new Date("2026-11-26T13:52:00Z")]);
      informa(`${rafagaFalsa.senal === "rafaga" && dispersoFalso.senal === "disperso" && unicoFalso.senal === "unica" && rafagaFalsa.intentos === 3 && rafagaFalsa.brechas_segundos[0] === 55 ? "ok  " : "FALLO"} tres rechazos en un minuto son rafaga de cola y tres en tres dias son disperso (rojo provocado si se invierte la comparacion breves/separados): ${rafagaFalsa.senal}/${dispersoFalso.senal}/${unicoFalso.senal} brechas ${rafagaFalsa.brechas_segundos.join("/")}`);

      const perdidasFalsas = [
        ...Array.from({ length: 11 }, () => ({ device: "Android / Chrome 158" })),
        { device: "iPhone / Safari 18" }
      ];
      const concentrada = concentracionPorClave(perdidasFalsas, (fila) => fila.device);
      const vacia = concentracionPorClave([], (fila) => fila.device);
      informa(`${concentrada.total === 12 && concentrada.claves_distintas === 2 && concentrada.primera_clave === "Android / Chrome 158" && concentrada.porcentaje_en_la_primera_clave === 91.7 && concentrada.porcentaje_en_el_top === 100 && vacia.total === 0 && vacia.primera_clave === null && vacia.porcentaje_en_el_top === null && vacia.porcentaje_en_la_primera_clave === null ? "ok  " : "FALLO"} la concentracion nombra la clave que acumula y no se afirma con denominador cero (rojo provocado si se reporta el top como si fuera la primera clave): ${concentrada.primera_clave} ${concentrada.ocurrencias_en_la_primera_clave}/${concentrada.total} = ${concentrada.porcentaje_en_la_primera_clave} % | top 5 ${concentrada.porcentaje_en_el_top} % con solo ${concentrada.claves_distintas} claves | ventana sin perdidas = ${vacia.porcentaje_en_la_primera_clave}`);

      const lecturaSanaCanales = afirmarQueElCensoNoArrastraCuerpos(sqlCensoDeCanales(), "sqlCensoDeCanales");
      const lecturaSanaEvidencia = afirmarQueElCensoNoArrastraCuerpos(sqlCensoDeEvidencia(), "sqlCensoDeEvidencia");
      let guardaConCuerpo = "NO_BLOQUEO (FALLO)";
      try {
        afirmarQueElCensoNoArrastraCuerpos(`SELECT "extra_evidence"->>'base64_data' AS foto FROM "TimePunch" WHERE "extra_evidence" ? 'base64_data'`, "sqlMutado");
      } catch (error) {
        guardaConCuerpo = error.message.includes("base64_data") ? "BLOQUEADO" : `MENSAJE INESPERADO (${error.message.slice(0, 40)})`;
      }
      let guardaSinClave = "NO_BLOQUEO (FALLO)";
      try {
        afirmarQueElCensoNoArrastraCuerpos(`SELECT count(*) FROM "TimePunch"`, "sqlSinPresencia");
      } catch (error) {
        guardaSinClave = error.message.includes("base64_data") ? "BLOQUEADO" : `MENSAJE INESPERADO (${error.message.slice(0, 40)})`;
      }
      informa(`${guardaConCuerpo === "BLOQUEADO" && guardaSinClave === "BLOQUEADO" && lecturaSanaCanales.lecturas_de_cuerpo === 0 && lecturaSanaEvidencia.presencias_de_clave >= 1 ? "ok  " : "FALLO"} la lectura del censo no puede arrastrar el cuerpo de la foto ni dejar de preguntar por la clave: sanas ${lecturaSanaCanales.presencias_de_clave}/${lecturaSanaEvidencia.presencias_de_clave} presencia(s), 0 cuerpo(s) | SQL con cuerpo = ${guardaConCuerpo} | SQL sin la clave = ${guardaSinClave}`);

      const sqlEstampasReal = sqlCensoDeEstampas();
      let estampasDejanDeNombrar = "NO_BLOQUEO (FALLO)";
      try {
        afirmarQueElCensoNombraClavesDelMetadata(sqlEstampasReal.replace(/jsonb_object_keys\("metadata"\)/, "metadata"), "sqlCensoDeEstampas mutado");
      } catch (error) {
        estampasDejanDeNombrar = error.message.includes("NOMBRES de clave") ? "BLOQUEADO" : `MENSAJE INESPERADO (${error.message.slice(0, 40)})`;
      }
      let estampasArrastranCuerpo = "NO_BLOQUEO (FALLO)";
      try {
        afirmarQueElCensoNoArrastraCuerpos(sqlEstampasReal.replace("jsonb_object_keys(\"metadata\") AS k", "jsonb_object_keys(\"metadata\") AS k, \"metadata\"->>'base64_data' AS cuerpo"), "sqlCensoDeEstampas mutado", { exigePresencia: false });
      } catch (error) {
        estampasArrastranCuerpo = error.message.includes("base64_data") ? "BLOQUEADO" : `MENSAJE INESPERADO (${error.message.slice(0, 40)})`;
      }
      informa(`${estampasDejanDeNombrar === "BLOQUEADO" && estampasArrastranCuerpo === "BLOQUEADO" ? "ok  " : "FALLO"} el censo de stampas nombra las marcaciones sin canal por CLAVE de metadata y nunca por valor: SQL que deja de enumerar = ${estampasDejanDeNombrar} | SQL que proyecta la foto = ${estampasArrastranCuerpo}`);

      // Host sintético: la prueba es que CUALQUIER pooler de Supabase se redacte, no el de la casa.
      const hostNube = hostParaEvidencia("postgresql://usuario:contrasena@aws-0-ejemplo-0000.pooler.supabase.com:6543/postgres");
      const hostLocal = hostParaEvidencia("postgresql://user:pass@127.0.0.1:55432/postgres");
      informa(`${/no se versiona/.test(hostNube) && hostLocal === "127.0.0.1" ? "ok  " : "FALLO"} la evidencia nombra el ambiente sin versionar el host de la nube: pooler -> "${hostNube}" | local -> ${hostLocal}`);

      let conteoMalo = "NO_BLOQUEO (FALLO)";
      try {
        agruparCensoDeCanales([{ canal: "apexos-mobile", envio: "en_vivo", tipo_declarado: "image/jpeg", cuerpo: "sin_foto_inline", respaldo: "sin_ruta_almacen" }]);
      } catch (error) {
        conteoMalo = error.message.includes("conteo numerico") ? "BLOQUEADO" : `MENSAJE INESPERADO (${error.message.slice(0, 40)})`;
      }
      informa(`${conteoMalo === "BLOQUEADO" ? "ok  " : "FALLO"} una fila del censo sin conteo numerico se bloquea en vez de sumar como NaN (rojo provocado si se tolera el NaN): ${conteoMalo}`);
    }

    console.log(failed === 0 ? "SELFTEST PASADO" : `SELFTEST BLOQUEADO (${failed} fallo(s) impresos)`);
    process.exit(failed === 0 ? 0 : 1);
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
        intentos_de_marcacion: rows.filter(esIntentoDeMarcacionPropia).length,
        rechazos_de_operario: rechazosDeOperario(rows),
        correcciones_administrativas_rechazadas: rows.filter((row) => row.route === RUTA_DE_CORRECCION).length,
        marcaciones_del_dia: punchesDelDia
      });
    }

    // Los rechazos sin usuario no eran un solo bulto: cada navegador que perdio la sesion deja su
    // marca, y si ese telefono volvio a entrar con sesion la marca devuelve el dueno de la jornada.
    const duenosDeMarca = duenosPorDispositivo(rejected);
    const intentosHuerfanos = intentosSinUsuarioPorDispositivo(rejected, duenosDeMarca, employeeByUser);
    const filasSinUsuario = rejected.filter((row) => row.user_id === null);

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
    const empleadosAfectados = [...new Set(porUsuario
      .filter((row) => row.rechazos_de_operario > 0)
      .map((row) => row.empleado_id)
      .filter((id) => id != null))];
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
      medicion: { archivo_ambiente: path.relative(ROOT, envFile), ambiente: declared, host: hostParaEvidencia(databaseUrl), dia: dateText, ventana_utc: [window.from.toISOString(), window.to.toISOString()], leido_en: new Date().toISOString(), escrituras: 0, sin_nombres: args["sin-nombres"] === true },
      total_rechazos: rejected.length,
      nivel_fuente: porNivel,
      rechazos_por_codigo: porCodigo,
      rechazos_por_detalle: porDetalle,
      causa_cruda_transporte: porCausaCruda,
      frontera_de_dia: { marcaciones: todas.length, con_date_distinto_del_dia_colombia: fronteraRota.length, por_dia: fronteraPorDia },
      trabajadores_afectados: porUsuario.sort((a, b) => b.rechazos - a.rechazos),
      intentos_sin_usuario: {
        filas: filasSinUsuario.length,
        con_marca_de_dispositivo: filasSinUsuario.filter((row) => row.device_id).length,
        dispositivos: intentosHuerfanos.length,
        adjudicables: intentosHuerfanos.filter((g) => g.empleado_codigo).length,
        grupos: intentosHuerfanos
      },
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

    const adjudicados = intentosHuerfanos.filter((g) => g.empleado_codigo).length;
    console.log(`\nINTENTOS SIN SESION, por navegador (${intentosHuerfanos.length} dispositivo(s); ${intentosHuerfanos.reduce((a, g) => a + g.rechazos, 0)} de ${filasSinUsuario.length} filas sin usuario traen marca; ${adjudicados} adjudicable(s)):`);
    for (const g of intentosHuerfanos.slice(0, 15)) console.log(`  ${g.device_id.slice(0, 8)}  ${String(g.nombre || g.user_email || "-").padEnd(34)}  emp ${String(g.empleado_codigo || "-").padEnd(9)} ${String(g.estado).padEnd(26)} rechazos ${String(g.rechazos).padStart(3)}  intentos de marcacion ${g.intentos_de_marcacion}  ${g.navegadores.join(",")}  ultimo ${g.ultimo_rechazo}`);

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
        select: { date: true, type: true, punched_at: true, route_id: true, extra_minutes: true, extra_reason: true, extra_detail: true, extra_evidence: true },
        orderBy: { punched_at: "asc" },
        take: 500
      });
      console.log(`\nDETALLE user ${userId} (${fila ? `${fila.code} / ${fila.user ? fila.user.name : "sin nombre"}` : "sin ficha de empleado"})`);
      for (const row of marcas) {
        const horaCo = new Date(row.punched_at.getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
        // La justificacion se muestra junto a la marca porque es lo unico que explica por que ese
        // oprimido llevaba foto de soporte: la foto de la selfie y la de la justificacion se
        // validan en dos compuertas distintas y solo una de las dos tolera el formato.
        const soporte = row.extra_evidence && typeof row.extra_evidence === "object"
          ? (String(row.extra_evidence.storage_path || "") ? "almacen" : (String(row.extra_evidence.base64_data || row.extra_evidence.base64 || "").length ? "inline" : "sin bytes"))
          : "no";
        const minutos = Number(row.extra_minutes || 0);
        console.log(`  MARCO  date=${isoDay(row.date)}  ${String(row.type).padEnd(16)}  hora Colombia ${horaCo}  ruta ${row.route_id ?? "(sin ruta)"}${minutos ? `  JUSTIFICA ${minutos} min (${row.extra_reason || "sin motivo"})  foto_soporte=${soporte}` : ""}`);
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

    // --semana=<corte ISO UTC> responde la pregunta que queda despues de publicar un arreglo:
    // cuantos rechazos de cada clase hubo por dia, cuantos cayeron antes y despues del corte, y
    // si los rechazos de foto posteriores al corte le costaron la hora a alguien. Es SELECT puro:
    // el instrumento nunca escribe, y en Produccion lo que se escribe se lee, no se provoca.
    if (args.semana) {
      const corte = new Date(String(args.semana));
      const diasLeidos = validarVentanaDeSemana(window, 7);
      const partes = partirPorCorte(rejected.map((row) => ({ ...row, timestamp: new Date(row.at) })), corte);
      const porDiaSemana = new Map();
      for (const lado of ["antes", "despues"]) {
        for (const fila of partes[lado]) {
          const dia = diaColombia(fila.timestamp);
          if (!porDiaSemana.has(dia)) porDiaSemana.set(dia, { registros: 0, clases: new Map() });
          const bucket = porDiaSemana.get(dia);
          bucket.registros += 1;
          const clase = claseDeRechazo(fila);
          if (!bucket.clases.has(clase)) bucket.clases.set(clase, { total: 0, antes: 0, despues: 0, usuarios: new Set() });
          const x = bucket.clases.get(clase);
          x.total += 1;
          x[lado] += 1;
          x.usuarios.add(fila.user_id);
        }
      }
      const aceptadasAntes = todas.filter((row) => row.punched_at < corte).length;
      const aceptadasDespues = todas.filter((row) => row.punched_at >= corte).length;
      // El codigo que acompana al rechazo de foto distingue la puerta: la compuerta de identidad
      // nueva siempre manda SELFIE_INVALIDA o un EVIDENCIA_* y su detalle; la validacion antigua
      // de la foto de justificacion lanza un Error pelado (400 sin codigo y sin detalle) con la
      // MISMA frase. Contar solo la frase dejaria las dos puertas en el mismo numero.
      const codigosDeFoto = { antes: bucketDeCodigosFoto(partes.antes), despues: bucketDeCodigosFoto(partes.despues) };
      const horaColombia = (instante) => `${diaColombia(instante)} ${new Date(instante.getTime() - COLOMBIA_OFFSET_HOURS * 3600 * 1000).toISOString().slice(11, 16)}`;
      const fotoDespues = partes.despues
        .filter((fila) => claseDeRechazo(fila).startsWith("foto-"))
        .map((fila) => {
          const empleado = employeeByUser.get(`${fila.tenant_id}|${fila.user_id}`) || null;
          // Si en la hora siguiente el mismo trabajador si logro marcar, la jornada no se perdio:
          // hubo reintento aceptado. Con 0 marcas el rechazo le costo la salida del turno.
          const siguientes = empleado
            ? todas.filter((row) => row.employee_id === empleado.id && row.punched_at > fila.timestamp
              && row.punched_at < new Date(fila.timestamp.getTime() + 3600 * 1000))
            : [];
          return {
            utc: fila.timestamp.toISOString(),
            hora_colombia: horaColombia(fila.timestamp),
            user_id: fila.user_id ?? null,
            empleado_id: empleado ? empleado.id : null,
            clase: claseDeRechazo(fila),
            status: fila.status,
            code: fila.code || "(el cliente no trajo codigo)",
            ruta: fila.route,
            mensaje: fila.message,
            detalle: fila.detail || null,
            dispositivo: fila.device,
            marcas_del_mismo_trabajador_en_la_hora_siguiente: siguientes.length,
            tipos_de_esas_marcas: [...new Set(siguientes.map((row) => row.type))]
          };
        });
      reporte.semana = {
        criterio: "dia calendario de Colombia para agrupar; el corte es el primer instante en que se LEYO el binario nuevo sirviendo (no la hora del commit). Las clases se deciden por la frase del servidor cuando el cliente no trae codigo.",
        corte_utc: corte.toISOString(),
        ventana_utc: [window.from.toISOString(), window.to.toISOString()],
        dias_de_ventana_leida: diasLeidos,
        escrituras: 0,
        denominador_marcaciones_aceptadas: { antes_del_corte: aceptadasAntes, despues_del_corte: aceptadasDespues },
        rechazos_de_foto: {
          antes_del_corte: partes.antes.filter((fila) => claseDeRechazo(fila).startsWith("foto-")).length,
          despues_del_corte: fotoDespues.length,
          // Cada fila con codigo (SELFIE_INVALIDA / EVIDENCIA_*) es la compuerta de identidad;
          // cada fila "(sin codigo)" es la validacion antigua. Un numero global de "rechazos de
          // foto" no puede separarlas y por eso se guarda el desglose por lado.
          codigos_por_lado: codigosDeFoto
        },
        por_dia: [...porDiaSemana].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([dia, bucket]) => ({
          dia,
          registros: bucket.registros,
          aceptadas: todas.filter((row) => diaColombia(row.punched_at) === dia).length,
          trabajadores: new Set(todas.filter((row) => diaColombia(row.punched_at) === dia).map((row) => row.employee_id)).size,
          clases: [...bucket.clases].map(([clase, x]) => ({ clase, total: x.total, antes: x.antes, despues: x.despues, usuarios: x.usuarios.size }))
            .sort((a, b) => b.total - a.total)
        })),
        foto_despues_del_corte: fotoDespues
      };

      console.log(`\nSEMANA POR DIA (Colombia) | corte ${corte.toISOString()} | clases con su antes/despues:`);
      for (const dia of reporte.semana.por_dia) {
        console.log(`  ${dia.dia}  registros ${String(dia.registros).padStart(4)}  aceptadas ${String(dia.aceptadas).padStart(3)}  trabajadores ${String(dia.trabajadores).padStart(3)}`);
        for (const clase of dia.clases.filter((row) => row.clase !== "sin-mensaje")) {
          console.log(`      ${clase.clase.padEnd(22)} ${String(clase.total).padStart(4)}  (antes ${String(clase.antes).padStart(4)} / despues ${String(clase.despues).padStart(4)})  usuarios ${clase.usuarios}`);
        }
      }
      console.log(`\nRECHAZOS DE FOTO  antes ${reporte.semana.rechazos_de_foto.antes_del_corte} / despues ${reporte.semana.rechazos_de_foto.despues_del_corte}  (denominador de marcaciones aceptadas: antes ${aceptadasAntes} / despues ${aceptadasDespues})`);
      for (const lado of ["antes", "despues"]) {
        const entradas = Object.entries(codigosDeFoto[lado]).sort((a, b) => b[1] - a[1]);
        console.log(`  codigos de foto ${lado.toUpperCase().padEnd(7)}: ${entradas.length ? entradas.map(([clave, n]) => `${n} x ${clave}`).join("   |   ") : "ninguno"}`);
      }
      for (const foto of fotoDespues) {
        console.log(`  ${foto.hora_colombia} CO  ${foto.utc}  user ${String(foto.user_id).padStart(5)}  emp ${String(foto.empleado_id ?? "-").padEnd(5)} ${foto.clase}  ${foto.status} ${foto.code}  ${foto.ruta}`);
        console.log(`        "${foto.mensaje}"  [${foto.dispositivo}]  marcas del mismo trabajador en la hora siguiente: ${foto.marcas_del_mismo_trabajador_en_la_hora_siguiente}${foto.tipos_de_esas_marcas.length ? ` (${foto.tipos_de_esas_marcas.join(",")})` : " -> LA HORA NO VOLVIO A ENTRAR"}`);
      }
    }

    // --canal responde si la HERRAMIENTA es el inconveniente: de donde salen las marcaciones que si
    // entraron (canal declarado por el cliente, en vivo o desde la cola), con que tipo de foto las
    // acompaan, donde se concentran los rechazos y los envios perdidos, y si las rechazos de una
    // misma cuenta llegan en rafaga. Todo SELECT agregado: ninguna lectura arrastra un cuerpo.
    if (args.canal) {
      const guardas = {
        censo_de_canales: afirmarQueElCensoNoArrastraCuerpos(sqlCensoDeCanales(), "sqlCensoDeCanales"),
        censo_de_evidencia: afirmarQueElCensoNoArrastraCuerpos(sqlCensoDeEvidencia(), "sqlCensoDeEvidencia")
      };
      const filasCrudas = await prisma.$queryRawUnsafe(sqlCensoDeCanales(), window.from, window.to);
      const censo = agruparCensoDeCanales(filasCrudas);
      const corteCanal = args.semana ? new Date(String(args.semana)) : new Date(window.from.getTime() + Math.floor((window.to - window.from) / 2));
      if (!Number.isFinite(corteCanal.getTime())) throw new Error(`--canal no puede partir la evidencia con un corte invalido: ${args.semana}`);
      const filasEvidencia = await prisma.$queryRawUnsafe(sqlCensoDeEvidencia(), window.from, window.to, corteCanal);
      const sqlEstampas = sqlCensoDeEstampas();
      afirmarQueElCensoNombraClavesDelMetadata(sqlEstampas, "sqlCensoDeEstampas");
      guardas.censo_de_estampas = afirmarQueElCensoNoArrastraCuerpos(sqlEstampas, "sqlCensoDeEstampas", { exigePresencia: false });
      const filasEstampas = await prisma.$queryRawUnsafe(sqlEstampas, window.from, window.to);
      const evidenciaPorEmpleado = new Map();
      for (const fila of filasEvidencia) {
        const clave = String(fila.empleado);
        const actual = evidenciaPorEmpleado.get(clave) || { empleado: Number(fila.empleado), tipos: new Set(), antes: 0, despues: 0 };
        actual.tipos.add(fila.tipo_declarado);
        actual.antes += Number(fila.antes_del_corte || 0);
        actual.despues += Number(fila.despues_del_corte || 0);
        evidenciaPorEmpleado.set(clave, actual);
      }

      const rechazosDeFoto = rejected.filter((fila) => claseDeRechazo(fila).startsWith("foto-"));
      const fotoDespuesDeCorte = args.semana ? rechazosDeFoto.filter((fila) => new Date(fila.at) >= corteCanal) : rechazosDeFoto;
      const transporte = rejected.filter((fila) => claseDeRechazo(fila) === "transporte-caido");

      const porCuenta = new Map();
      for (const fila of fotoDespuesDeCorte) {
        const clave = `${fila.tenant_id}|${fila.user_id}`;
        if (!porCuenta.has(clave)) porCuenta.set(clave, []);
        porCuenta.get(clave).push(fila.at);
      }
      const cuentas = [...porCuenta].map(([clave, instantes]) => {
        const [tenantId, userId] = clave.split("|");
        const empleado = userId === "null" ? null : (employeeByUser.get(`${tenantId}|${userId}`) || null);
        const rafaga = rafagaDeReintentos(instantes);
        const suEvidencia = empleado ? (evidenciaPorEmpleado.get(String(empleado.id)) || null) : null;
        return {
          user_id: userId === "null" ? null : Number(userId),
          empleado_id: empleado ? empleado.id : null,
          rechazos_de_foto_despues_del_corte: instantes.length,
          dispositivos: [...new Set(fotoDespuesDeCorte.filter((fila) => `${fila.tenant_id}|${fila.user_id}` === clave).map((fila) => fila.device))],
          senal_de_reintento: rafaga.senal,
          brechas_segundos: rafaga.brechas_segundos,
          fotos_de_justificacion_aceptadas_antes_del_corte: suEvidencia ? suEvidencia.antes : 0,
          fotos_de_justificacion_aceptadas_despues_del_corte: suEvidencia ? suEvidencia.despues : 0,
          tipos_que_si_entraron: suEvidencia ? [...suEvidencia.tipos].sort() : []
        };
      }).sort((a, b) => b.rechazos_de_foto_despues_del_corte - a.rechazos_de_foto_despues_del_corte);

      const trabajadoresConFotoAceptada = [...evidenciaPorEmpleado.values()];
      reporte.canal = {
        criterio: `el canal se lee de metadata->>'source' (la web que marca declara "${CANAL_WEB_QUE_MARCA}"); el envio distingue en vivo, cola reintentada (metadata.queued_at) y abierto sin senal (metadata.offline). Las lecturas son agregados de jsonb y NINGUNA proyecta el cuerpo de la foto.`,
        escrituras: 0,
        ventana_utc: [window.from.toISOString(), window.to.toISOString()],
        corte_utc: corteCanal.toISOString(),
        guardas_de_lectura: guardas,
        censo,
        estampas_de_marcaciones_sin_canal: filasEstampas.map((fila) => ({
          clave_de_metadata: String(fila.clave_de_metadata),
          marcaciones: Number(fila.marcaciones || 0),
          trabajadores: Number(fila.trabajadores || 0)
        })),
        evidencia_aceptada: {
          trabajadores_que_adjuntaron_foto_en_la_ventana: trabajadoresConFotoAceptada.length,
          los_mesmos_despues_del_corte: trabajadoresConFotoAceptada.filter((x) => x.despues > 0).length,
          tipos_declarados_aceptados: [...new Set(trabajadoresConFotoAceptada.flatMap((x) => [...x.tipos]))].sort()
        },
        rechazos: {
          por_ruta: histograma(rejected, (fila) => fila.route || "(sin ruta)", 12),
          por_dispositivo: histograma(rejected, (fila) => fila.device || "(sin user agent)", 12),
          foto_por_dispositivo: histograma(rechazosDeFoto, (fila) => `${fila.device} | ${fila.code || "(sin codigo)"}`, 12),
          concentracion_de_envios_perdidos_por_dispositivo: concentracionPorClave(transporte, (fila) => fila.device || "(sin user agent)"),
          concentracion_de_envios_perdidos_por_cuenta: concentracionPorClave(transporte, (fila) => fila.user_id ?? "(sin sesion)")
        },
        cuentas_con_rechazos_de_foto: cuentas
      };

      console.log(`\nCENSO DE CANALES (marcaciones aceptadas, ventana leida, 0 escrituras):`);
      console.log(`  total ${censo.total_marcaciones} | canales distintos ${censo.canales_distintos} | en el canal de la web (${CANAL_WEB_QUE_MARCA}) ${censo.marcaciones_en_el_canal_de_la_web} (${censo.porcentaje_en_el_canal_de_la_web ?? "-"} %) | fuera ${censo.marcaciones_fuera_del_canal_de_la_web}`);
      for (const fila of censo.por_canal) {
        console.log(`  canal ${String(fila.clave).padEnd(26)} ${String(fila.marcaciones).padStart(5)} marcaciones  trabajadores ${String(fila.trabajadores).padStart(4)}  foto inline ${String(fila.con_foto_inline).padStart(4)}  ruta de almacen ${String(fila.con_ruta_de_almacen).padStart(4)}  ${fila.megas_declarados} MB declarados  tipos ${fila.tipos.join(",")}`);
      }
      for (const fila of censo.por_tenant) console.log(`  tenant ${fila.clave}  ${fila.marcaciones} marcaciones`);
      console.log(`\n  stampas del metadata en las marcaciones que no declaran canal (solo NOMBRES de clave, nunca el cuerpo):`);
      for (const fila of reporte.canal.estampas_de_marcaciones_sin_canal) {
        console.log(`    ${String(fila.marcaciones).padStart(5)}  ${String(fila.clave_de_metadata).padEnd(24)} trabajadores ${fila.trabajadores}`);
      }
      for (const fila of censo.por_envio) {
        console.log(`  envio ${String(fila.clave).padEnd(20)} ${String(fila.marcaciones).padStart(5)}`);
      }
      console.log(`\n  foto de justificacion: ${reporte.canal.evidencia_aceptada.trabajadores_que_adjuntaron_foto_en_la_ventana} trabajadores la adjuntaron en la ventana (${reporte.canal.evidencia_aceptada.los_mesmos_despues_del_corte} de ellos despues del corte); tipos que si entraron: ${reporte.canal.evidencia_aceptada.tipos_declarados_aceptados.join(", ") || "ninguno"}`);
      console.log(`\nRECHAZOS POR RUTA (todo lo que reboto en la ventana, incluido lo que no es marcacion):`);
      for (const fila of reporte.canal.rechazos.por_ruta) console.log(`  ${String(fila.ocurrencias).padStart(5)}  ${fila.clave}  cuentas ${fila.usuarios}`);
      console.log(`\nRECHAZOS DE FOTO POR DISPOSITIVO Y PUERTA:`);
      for (const fila of reporte.canal.rechazos.foto_por_dispositivo) console.log(`  ${String(fila.ocurrencias).padStart(5)}  ${fila.clave}  cuentas ${fila.usuarios}`);
      for (const llave of ["concentracion_de_envios_perdidos_por_dispositivo", "concentracion_de_envios_perdidos_por_cuenta"]) {
        const c = reporte.canal.rechazos[llave];
        console.log(`\nENVOS PERDIDOS ${llave.includes("cuenta") ? "por cuenta" : "por dispositivo"}: total ${c.total} en ${c.claves_distintas} claves | la primera (${c.primera_clave}) acumula ${c.ocurrencias_en_la_primera_clave} (${c.porcentaje_en_la_primera_clave ?? "-"} %) | top 5 ${c.en_el_top} (${c.porcentaje_en_el_top ?? "-"} %)`);
        for (const fila of c.top) console.log(`  ${String(fila.ocurrencias).padStart(5)}  ${fila.clave}`);
      }
      console.log(`\nRAFAGAS DE REINTENTO en las cuentas con rechazos de foto${args.semana ? " despues del corte" : " (sin --semana: toda la ventana)"}:`);
      for (const cuenta of cuentas) {
        console.log(`  user ${String(cuenta.user_id).padStart(5)}  emp ${String(cuenta.empleado_id ?? "-").padEnd(5)}  ${cuenta.rechazos_de_foto_despues_del_corte} rechazo(s)  ${cuenta.senal_de_reintento}  brechas ${cuenta.brechas_segundos.join("/")}s  fotos aceptadas antes ${cuenta.fotos_de_justificacion_aceptadas_antes_del_corte} / despues ${cuenta.fotos_de_justificacion_aceptadas_despues_del_corte}  tipos ${cuenta.tipos_que_si_entraron.join(",") || "-"}`);
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
