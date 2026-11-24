const fs = require("node:fs");
const path = require("node:path");

// Puerta de presupuesto del monitor de marcaciones (Talento Humano).
//
// El incidente del horario #336 en produccion (2026-11-18) no fue un problema de datos: fue de
// transporte. Las lecturas del monitor y del reporte pedian la fila cruda de `TimePunch` y
// arrastraban la selfie en base64. Medido ese dia sobre el tenant del cliente: 44,4 MB y
// 7,74 s + 9,79 s para abrir un horario; proyectadas las mismas lecturas: 154 KB y 0,94 s +
// 1,06 s, con los mismos ids y el mismo conteo de evidencias (27=27 y 25=25).
//
// Esta puerta existe para que ese numero no vuelva a depender de la buena voluntad: mide bytes
// y latencia reales contra un ambiente desplegado y falla. `--selftest` demuestra los dos
// sentidos sin red, porque un gate que solo sabe decir "passed" no es una puerta.
//
// Presupuestos (con margen sobre la linea base medida, no sobre el mejor caso):
//   - 4 MiB por respuesta de listado: el dia gordo del cliente proyectado dio 154 KB; sin
//     proyectar dio 44,4 MB. Cualquier valor por debajo de 4 MiB ya distingue los dos mundos.
//   - 3.000 ms de p95: 1.060 ms medido despues del corte contra 9.790 ms antes; el tope tambien
//     deja margen para un pooler lento sin perdonar un binario dentro del listado.
//   - Ningun listado puede traer un `data:...;base64,` de mas de 8 KB: el binario se pide por id
//     a `/hr/monitor-evidence/:source/:id`, que es el unico camino que todavia lo transporta.
//
// El 2026-11-24 mostro que el corte de transporte no cerraba la demora: `event-summaries` ignoraba
// la fecha pedida y aglomeraba el historico entero. Medido en produccion sobre el tenant del
// cliente, mismo dia: 7.000 ms sin fecha contra ~500 ms con el dia fijado, 266 evidencias = 266
// y 594 KB -> 16 KB. Por eso la tabla separa el camino con fecha (goberna) del que no la manda
// (referencia exenta), y el selftest comprueba las dos direcciones y el cableado.
//
// Ojo con `--env-file`: Node se lo queda y aborta con codigo 9 si el archivo no existe, antes de
// que corra este script. El camino largo (el del backfill) usa `--config` por esa razon.

const BUDGETS = {
  listing_bytes: 4 * 1024 * 1024,
  p95_ms: 3000,
  inline_base64_chars: 8192
};

const ENDPOINTS = [
  { key: "operations_map", label: "Mapa del dia", path: (date) => `/api/v1/hr/operations-map?date=${date}&minutes=30&footprint_days=30` },
  // La pantalla de rutas fija el dia desde 2026-11-24, asi que el contador con fecha es el camino
  // real del usuario y el que lleva presupuesto.
  { key: "event_summaries_day", label: "Contadores de eventos (dia fijado)", path: (date) => `/api/v1/hr/routes/event-summaries?date=${date}` },
  { key: "attendance_day", label: "Reporte de asistencia (un dia)", path: (date) => `/api/v1/hr/attendance?fecha_inicio=${date}&fecha_fin=${date}` },
  // Exenta de veredicto: la misma ruta sin fecha sigue existiendo (otros consumidores la piden) y
  // su peso historico es el del acote viejo. Medirla informa cuanto queda por migrar; dejarla
  // gobernar el estado haria que la puerta diga "rojo" por un camino que la pantalla ya no toma,
  // y un rojo que no se puede corregir en esta intervencion se termina perdonando a mano.
  { key: "event_summaries_all", label: "Contadores de eventos (sin fecha, referencia)", path: () => "/api/v1/hr/routes/event-summaries", reference: true }
];

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return result;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

// Un data URL largo dentro de un listado es exactamente la recaida: el contrato por referencia
// anuncia el archivo (`has_base64_data`) y el binario viaja solo por la ruta de evidencia.
function inlinePayloadHits(value, found = [], label = "respuesta") {
  if (typeof value === "string") {
    if (/^data:[^;]+;base64,.+/.test(value) && value.length > BUDGETS.inline_base64_chars) {
      found.push({ where: label, chars: value.length });
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inlinePayloadHits(item, found, `${label}[${index}]`));
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) inlinePayloadHits(child, found, `${label}.${key}`);
  }
  return found;
}

function evaluate(samples) {
  const failures = [];
  for (const sample of samples) {
    if (sample.reference) continue;
    if (sample.bytes > BUDGETS.listing_bytes) {
      failures.push(`${sample.label}: ${sample.bytes} bytes superan el presupuesto de ${BUDGETS.listing_bytes}`);
    }
    if (sample.p95_ms > BUDGETS.p95_ms) {
      failures.push(`${sample.label}: p95 de ${sample.p95_ms} ms supera el presupuesto de ${BUDGETS.p95_ms} ms`);
    }
    if (sample.inline_payloads.length) {
      const worst = sample.inline_payloads.reduce((max, hit) => Math.max(max, hit.chars), 0);
      failures.push(`${sample.label}: ${sample.inline_payloads.length} binario(s) inline en el listado (peor ${worst} caracteres)`);
    }
  }
  return failures;
}

function todayBogota() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

async function measureRemote({ apiUrl, email, password, date, samplesPerEndpoint }) {
  const login = await fetch(`${apiUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!login.ok) throw new Error(`El ambiente no acepto la sesion de medicion (HTTP ${login.status}).`);
  const token = String((await login.json()).token || "");
  if (!token) throw new Error("El ambiente devolvio una sesion sin token.");

  const measured = [];
  for (const endpoint of ENDPOINTS) {
    const timings = [];
    let bytes = 0;
    let inlinePayloads = [];
    for (let index = 0; index < samplesPerEndpoint; index += 1) {
      const started = Date.now();
      const response = await fetch(`${apiUrl}${endpoint.path(date)}`, { headers: { Authorization: `Bearer ${token}` } });
      const text = await response.text();
      timings.push(Date.now() - started);
      if (!response.ok) {
        // Una referencia caida se reporta, no tumba la corrida: lo que goberna son los caminos con
        // presupuesto, y abortar por la exenta dejaria el veredicto sin evidencia.
        if (endpoint.reference) {
          measured.push({ key: endpoint.key, label: endpoint.label, reference: true, samples: index + 1, bytes, p50_ms: percentile(timings, 0.5), p95_ms: percentile(timings, 0.95), max_ms: Math.max(...timings), inline_payloads: inlinePayloads, error: `HTTP ${response.status}` });
          break;
        }
        throw new Error(`${endpoint.label}: HTTP ${response.status}`);
      }
      bytes = Math.max(bytes, Buffer.byteLength(text, "utf8"));
      inlinePayloads = inlinePayloads.concat(inlinePayloadHits(JSON.parse(text || "null"), [], endpoint.key));
    }
    measured.push({
      key: endpoint.key,
      label: endpoint.label,
      reference: Boolean(endpoint.reference),
      samples: timings.length,
      bytes,
      p50_ms: percentile(timings, 0.5),
      p95_ms: percentile(timings, 0.95),
      max_ms: Math.max(...timings),
      inline_payloads: inlinePayloads
    });
  }
  return measured;
}

// El selftest no toca red: alimenta los mismos evaluadores con un listado gordo (el mundo
// anterior al corte) y uno anunciado (el mundo despues). Si alguna de las dos direcciones deja
// de comportarse, el gate esta roto y la evidencia de la corrida real no vale.
function selftest() {
  const fatBase64 = `data:image/jpeg;base64,${"A".repeat(2 * 1024 * 1024)}`;
  // El dia gordo medido en produccion: 44,4 MB arrastrando las selfies. Un solo data URL no
  // basta para pasar el tope de bytes, asi que el volumen se declara como el payload real.
  const fat = { key: "operations_map", label: "Listado con binario inline", bytes: Math.round(44.4 * 1024 * 1024), p95_ms: 7740, inline_payloads: inlinePayloadHits({ punch_points: [{ extra_evidence: { base64_data: fatBase64 } }] }, [], "operations_map") };
  const lean = { key: "operations_map", label: "Listado anunciado por referencia", bytes: 154 * 1024, p95_ms: 940, inline_payloads: inlinePayloadHits({ punch_points: [{ extra_evidence: { has_base64_data: true, available: true } }] }, [], "operations_map") };
  const slow = { ...lean, label: "Listado anunciado pero lento", p95_ms: 5200 };
  const heavyNoMarker = { ...lean, label: "Listado gordo sin data URL", bytes: 12 * 1024 * 1024, p95_ms: 900 };

  const fatFailures = evaluate([fat]);
  const leanFailures = evaluate([lean]);
  const slowFailures = evaluate([slow]);
  const heavyFailures = evaluate([heavyNoMarker]);
  // El dia fijado (2026-11-24) es el camino real de la pantalla, asi que un contador por dia gordo
  // o lento tiene que poner la puerta en rojo. La misma ruta sin fecha se mide pero no decide.
  const dayHeavy = { key: "event_summaries_day", label: "Contadores por dia", bytes: 9 * 1024 * 1024, p95_ms: 7000, inline_payloads: [] };
  const dayFailures = evaluate([dayHeavy]);
  const refHeavy = evaluate([{ ...dayHeavy, key: "event_summaries_all", label: "Contadores sin fecha (referencia)", reference: true }]);
  // La tabla se autoverifica: si la exencion se mueve a la ruta con fecha, la puerta deja de gobernar
  // lo que el usuario ve sin que cambie ningun numero, y un rojo que nunca llega se perdona solo.
  const dated = ENDPOINTS.find((endpoint) => endpoint.key === "event_summaries_day");
  const undated = ENDPOINTS.find((endpoint) => endpoint.key === "event_summaries_all");
  const wiringFailures = [];
  if (!dated || dated.reference) wiringFailures.push("el contador por dia no goberna el veredicto");
  if (dated && !/date=2026-11-24/.test(String(dated.path("2026-11-24")))) wiringFailures.push("el contador por dia no manda la fecha pedida");
  if (!undated || !undated.reference) wiringFailures.push("la lectura sin fecha no esta marcada como referencia");
  // La interfaz de argumentos tambien se autoverifica: si `--flag=valor` vuelve a caerse al
  // suelo, la corrida de produccion volveria a medir QA sin avisar.
  const parsed = argsFrom(["--env-file=config/production.env", "--samples=5", "--date", "2026-11-18", "--selftest"]);
  const parseFailures = [];
  if (parsed["env-file"] !== "config/production.env") parseFailures.push(`--env-file= se perdio (leo ${JSON.stringify(parsed["env-file"])})`);
  if (parsed.samples !== "5") parseFailures.push(`--samples= se perdio (leo ${JSON.stringify(parsed.samples)})`);
  if (parsed.date !== "2026-11-18") parseFailures.push(`--date sin valor no booleano se perdio (leo ${JSON.stringify(parsed.date)})`);
  if (parsed.selftest !== true) parseFailures.push(`--selftest booleano se perdio (leo ${JSON.stringify(parsed.selftest)})`);
  // El sentido rojo de la declaracion: sin --env-file el certificador tiene que abortar en vez de
  // elegir un ambiente por su cuenta. Un control que solo sabe pasar no cierra la puerta.
  const declareFailures = [];
  let abortaSinDeclarar = false;
  try {
    declareEnvFile({});
  } catch (error) {
    abortaSinDeclarar = /Falta --env-file/.test(String(error.message));
  }
  if (!abortaSinDeclarar) declareFailures.push("sin --env-file no aborta: mediria un ambiente predeterminado");
  if (declareEnvFile({ "env-file": "config/production.env" }) !== path.resolve("config/production.env")) {
    declareFailures.push("con --env-file declarado no resuelve ese archivo");
  }
  const cases = [
    { id: "gordo-rojo", ok: fatFailures.some((line) => /superan el presupuesto/.test(line)) && fatFailures.some((line) => /binario\(s\) inline/.test(line)), failures: fatFailures },
    { id: "anunciado-verde", ok: leanFailures.length === 0, failures: leanFailures },
    { id: "lento-rojo", ok: slowFailures.some((line) => /p95/.test(line)), failures: slowFailures },
    { id: "volumen-rojo", ok: heavyFailures.some((line) => /superan el presupuesto/.test(line)), failures: heavyFailures },
    { id: "dia-fijado-rojo", ok: dayFailures.some((line) => /superan el presupuesto/.test(line)) && dayFailures.some((line) => /p95/.test(line)), failures: dayFailures },
    { id: "referencia-exenta", ok: refHeavy.length === 0, failures: refHeavy },
    { id: "ruta-declarada", ok: wiringFailures.length === 0, failures: wiringFailures },
    { id: "parseo-ambas-formas", ok: parseFailures.length === 0, failures: parseFailures },
    { id: "ambiente-declarado-obligatorio", ok: declareFailures.length === 0, failures: declareFailures }
  ];
  return cases;
}

// La cuenta de medicion puede venir de tres sitios, en este orden: la fixture que deja
// `certify:hr-monitor-evidence:qa` (--fixture), los argumentos explicitos o el archivo real de
// NYVORA (`NYVORA_REAL_ADMIN="<email>|<password>|<rol>|<extra>"`). Nunca se imprime la clave.
function resolveCredentials(args) {
  if (args.fixture) {
    const fixture = JSON.parse(fs.readFileSync(path.resolve(String(args.fixture)), "utf8"));
    return { email: String(fixture.admin_email || fixture.email || ""), password: String(fixture.password || "") };
  }
  if (args.email && args.password) return { email: String(args.email), password: String(args.password) };
  const tuple = String(process.env.NYVORA_REAL_ADMIN || "").split("|");
  return { email: String(args.email || tuple[0] || "").trim(), password: String(args.password || tuple[1] || "").trim() };
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.selftest) {
    const cases = selftest();
    for (const item of cases) {
      console.log(`${item.ok ? "OK  " : "FALLO"} ${item.id}${item.failures.length ? ` -> ${item.failures.join(" | ")}` : ""}`);
    }
    if (cases.some((item) => !item.ok)) {
      console.error("SELFTEST DEL GATE FALLIDO: la puerta no distingue el listado gordo del anunciado.");
      process.exitCode = 1;
      return;
    }
    console.log(`SELFTEST APROBADO: el gate falla con binario inline o latencia fuera de presupuesto y pasa con el aviso por referencia.`);
    return;
  }

  const envFile = path.resolve(String(args["env-file"] || "config/qa.env"));
  require("../load-env")(envFile);
  const environment = String(process.env.TARGET_ENV || process.env.APP_ENV || "").toLowerCase();
  if (!["qa", "production"].includes(environment)) {
    throw new Error(`La medicion del monitor solo corre contra QA o Produccion (ambiente declarado: ${environment || "ninguno"}).`);
  }
  require("../load-env")(path.resolve(String(args["credentials-file"] || "config/nyvora-real-test-credentials.env")));

  const credentials = resolveCredentials(args);
  const apiUrl = String(args["api-url"] || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (!apiUrl) throw new Error("Falta --api-url o NEXT_PUBLIC_API_URL en el ambiente declarado.");
  const date = String(args.date || todayBogota());
  const samplesPerEndpoint = Math.min(5, Math.max(1, Number(args.samples || 3)));

  const measured = await measureRemote({ apiUrl, ...credentials, date, samplesPerEndpoint });
  const failures = evaluate(measured);
  const report = {
    change_id: "hr-monitor-byte-budget",
    environment,
    api_url: apiUrl.replace(/^https?:\/\/([^/]+).*$/, "$1"),
    date,
    generated_at: new Date().toISOString(),
    samples_per_endpoint: samplesPerEndpoint,
    budgets: BUDGETS,
    baseline: {
      source: "docs/audits/2026-11-18-monitor-marcaciones-336/00-hallazgos-y-plan.md",
      before: { bytes: 44.4 * 1024 * 1024, ms: [7740, 9790] },
      after: { bytes: 154 * 1024, ms: [940, 1060] },
      proof: "mismo dia, mismo tenant, mismos ids y mismo conteo de evidencias (27=27, 25=25)"
    },
    // Segunda linea base, la del acote por dia (2026-11-24): el contador sin fecha leia todo el
    // historico del tenant, asi que fijar el dia no bastaba si el backend seguia ignorando la fecha.
    day_scope: {
      source: "docs/briefs/2026-11-24-monitor-marcaciones-latencia.md",
      before: { ms_event_summaries: 7000, bytes: 594 * 1024 },
      after: { ms_event_summaries: 500, bytes: 16 * 1024 },
      proof: "mismo dia y tenant medidos el 2026-11-24; 266 evidencias = 266 antes y despues"
    },
    measurements: measured,
    failures,
    status: failures.length ? "failed" : "passed"
  };
  const output = path.resolve(String(args.output || `docs/qa/evidence/hr-monitor-byte-budget-${environment}/presupuesto.json`));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  for (const item of measured) {
    console.log(`${item.label}: ${Math.round(item.bytes / 1024)} KB · p50 ${item.p50_ms} ms · p95 ${item.p95_ms} ms · binarios inline ${item.inline_payloads.length}${item.reference ? ` · referencia sin veredicto${item.error ? ` (${item.error})` : ""}` : ""}`);
  }
  if (failures.length) {
    console.error(`GATE DE PRESUPUESTO EN ROJO (${environment}):`);
    for (const line of failures) console.error(` - ${line}`);
    console.error(`Evidencia: ${output}`);
    process.exitCode = 1;
    return;
  }
  console.log(`GATE DE PRESUPUESTO EN VERDE (${environment}): ${output}`);
}

main().catch((error) => {
  console.error(`MEDICION DE PRESUPUESTO DEL MONITOR FALLIDA: ${error.message}`);
  process.exitCode = 1;
});
