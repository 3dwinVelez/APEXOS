'use strict';

// Sonda de volumen de la lectura diaria de marcaciones del monitor.
//
// Que reproduce: `getOperationsMap` leia `SELECT * FROM TimePunch WHERE date = hoy` con
// las selfies en base64 dentro de `extra_evidence` y despues el servicio tiraba los bytes
// al armar el resumen. La produccion lo midio el 2026-11-17 por pg_stat_statements: el
// SELECT mas caro de la base, 4.271 llamadas, 3.917,91 ms de media, 61.365,4 ms de maximo
// y `blocks_read_from_disk = 0`. Cero bloques de disco significa que el costo no es
// encontrar las filas sino llevarselas puestas.
//
// Que mide: la misma lectura antes y despues sobre un set con la distribucion de tamano
// medida en produccion, comparando tiempo y bytes que salen del servidor. No pretende
// reproducir el pooler de Supavisor; lo que traslada es cuanto payload deja de viajar.
//
// Uso (base de datos de trabajo del repositorio, nunca QA ni produccion):
//   node scripts/performance/selfie-payload-probe.js [--rows 3000] [--limit 300]
//
// La sonda crea su propia base (`apexos_selfie_probe`), la usa con datos sinteticos y la
// borra al terminar. No toca la base `apexos` mas alla de crear y eliminar esa base.

const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");

const PROBE_DB = process.env.SELFIE_PROBE_DB || "apexos_selfie_probe";
const CONTAINER = process.env.SELFIE_PROBE_CONTAINER || "infra-postgres-1";
const USER = process.env.SELFIE_PROBE_USER || "apex";
const PASSWORD = process.env.SELFIE_PROBE_PASSWORD || "apex_dev_password";
const HOST_PORT = process.env.SELFIE_PROBE_HOST_PORT || "55432";
const DAY = "2026-11-17";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? Number(process.argv[index + 1]) : fallback;
}

const ROWS = arg("rows", 3000);
const LIMIT = arg("limit", 300);

// Distribucion medida en produccion el 2026-11-17 sobre 2.247 filas de TimePunch:
// 104.856 bytes de media en `extra_evidence` y 2.792.205 en el peor caso.
const MEAN_BYTES = 104856;
const MAX_BYTES = 2792205;

function psql(database, sql) {
  return execFileSync("docker", ["exec", CONTAINER, "psql", "-U", USER, "-d", database, "-v", "ON_ERROR_STOP=1", "-tAc", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function psqlScript(database, sql) {
  execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", USER, "-d", database, "-v", "ON_ERROR_STOP=1", "-q"],
    { encoding: "utf8", input: sql });
}

// base64 viaja 4 caracteres por cada 3 bytes binarios.
const fillerChars = Math.round(MEAN_BYTES / 4) * 4;
const outlierChars = Math.round(MAX_BYTES / 4) * 4;

// El relleno tiene que ser INCOMPRESIBLE. Con `repeat('QUJD', n)` el TOAST almacena 1,3 KB
// en vez de los ~105 KB que mide produccion (comprobado el 2026-11-17: la columna guardaba
// 1289 bytes), y la sonda mide descompresiones que no existen: el resultado sale barato y
// optimiza una forma que la base real no tiene. Se siembra con bytes aleatorios en base64,
// materializados UNA sola vez en `_fill`: generados por fila, el seed no termina.
// Las columnas que `schema.prisma` declara no anulables lo son tambien aqui, y `time` se
// siembra: la tabla de sonda la lee ahora el delegador de Prisma (la lectura propia de la
// marcacion) y un `SELECT` de modelo sobre una columna NOT NULL del modelo devuelta como null
// aborta la corrida. Una sonda que no soporta la lectura real del producto no puede certificar
// que la optimizacion no rompió nada (comprobado el 2026-11-17: `time` sin sembrar daba
// `Error converting field "time" of expected non-nullable type "String", found null`).
const SEED = `
  DROP TABLE IF EXISTS "TimePunch";
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE TABLE _fill (kind text PRIMARY KEY, txt text);
  INSERT INTO _fill VALUES
    ('mean', (SELECT string_agg(encode(gen_random_bytes(1024), 'base64'), '') FROM generate_series(1, ${Math.ceil(fillerChars / 1365) + 1}) k)),
    ('max',  (SELECT string_agg(encode(gen_random_bytes(1024), 'base64'), '') FROM generate_series(1, ${Math.ceil(outlierChars / 1365) + 1}) k));
  CREATE TABLE "TimePunch" (
    id serial PRIMARY KEY,
    tenant_id text NOT NULL,
    employee_id integer,
    user_name text NOT NULL,
    type text NOT NULL,
    punched_at timestamptz NOT NULL,
    "date" timestamptz NOT NULL,
    "time" text NOT NULL,
    latitude double precision,
    longitude double precision,
    accuracy_meters double precision,
    vehicle_plate text,
    route_id integer,
    extra_minutes integer NOT NULL DEFAULT 0,
    extra_reason text,
    extra_detail text,
    extra_evidence jsonb NOT NULL,
    metadata jsonb NOT NULL,
    idempotency_key text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  INSERT INTO "TimePunch" (tenant_id, employee_id, user_name, type, punched_at, "date", "time", route_id, extra_evidence, metadata)
  SELECT 'probe', (i % 40), 'usuario-' || (i % 40),
         (array['entrada','inicio_almuerzo','fin_almuerzo','salida'])[(i % 4) + 1],
         clock.ts,
         timestamptz '${DAY}',
         to_char(clock.ts at time zone 'UTC', 'HH24:MI'),
         (i % 60) + 1,
         jsonb_build_object('name', 'soporte-' || i || '.png', 'base64',
           'data:image/jpeg;base64,' || (CASE WHEN i = 1 THEN (SELECT txt FROM _fill WHERE kind = 'max')
                                             ELSE left((SELECT txt FROM _fill WHERE kind = 'mean'), ${fillerChars}) END)),
         jsonb_build_object('source', 'apexos-movil', 'employee_code', 'EMP-' || (i % 40),
           'employee_name', 'Nombre Apellido ' || (i % 40), 'late_minutes', 12,
           'identity_verification', jsonb_build_object('status', 'verified', 'channel', 'mobile'),
           'identity_photo', CASE WHEN i % 250 <> 0 THEN NULL
             ELSE jsonb_build_object('type', 'image/jpeg', 'name', 'selfie.jpg', 'size', 20140,
               'base64_data', 'data:image/jpeg;base64,' || left((SELECT txt FROM _fill WHERE kind = 'mean'), 27000)) END)
  FROM generate_series(1, ${ROWS}) AS i
  CROSS JOIN LATERAL (SELECT timestamptz '${DAY} 06:00:00+00' + (i || ' minute')::interval AS ts) AS clock;
  VACUUM ANALYZE "TimePunch";
`;

// Cuanto guardo realmente el TOAST: si `stored_mean_bytes` no ronda MEAN_BYTES, la corrida
// no es comparable con produccion y el veredicto de tiempos no vale. Se publica en el reporte.
function seededSizes(psqlFn) {
  const row = psqlFn(PROBE_DB, `SELECT pg_size_pretty(pg_total_relation_size('"TimePunch"')),
    coalesce(round(avg(pg_column_size(extra_evidence)))::text, '0'), coalesce(max(pg_column_size(extra_evidence))::text, '0'),
    coalesce(round(avg(pg_column_size(metadata)))::text, '0') FROM "TimePunch"`);
  const [total, evidence_mean, evidence_max, metadata_mean] = row.split("|");
  return { total, evidence_mean: Number(evidence_mean), evidence_max: Number(evidence_max), metadata_mean: Number(metadata_mean),
    target_evidence_mean: MEAN_BYTES, seed_is_faithful: Math.abs(Number(evidence_mean) - MEAN_BYTES) / MEAN_BYTES < 0.15 };
}

// El SQL que ejecuta el producto, capturado del lector real en lugar de reescrito aqui,
// para que la sonda no pueda desalinearse del codigo que dice medir.
function capturedProjectedSql() {
  const monitorEvidenceRows = require("../../apps/api/src/modules/hr/monitorEvidenceRows");
  let captured = null;
  monitorEvidenceRows.readDayEvidencePunches({ $queryRaw: async (query) => { captured = query; return []; } },
    "probe", new Date(`${DAY}T00:00:00Z`), new Date("2026-11-18T00:00:00Z"), LIMIT);
  let index = 0;
  return captured.sql.replace(/\?/g, () => {
    index += 1;
    const value = captured.values[index - 1];
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (typeof value === "number") return String(value);
    return `'${String(value).replace(/'/g, "''")}'`;
  });
}

// Equivalente a prisma.timePunch.findMany({ where: { date }, orderBy: punched_at desc,
// take: LIMIT }): Prisma selecciona todas las columnas escalares del modelo.
function plainSelectSql() {
  const { PUNCH_COLUMNS } = require("../../apps/api/src/modules/hr/monitorEvidenceRows");
  return `SELECT ${PUNCH_COLUMNS.map((column) => `"${column}"`).join(", ")} FROM "TimePunch"
    WHERE "tenant_id" = 'probe' AND "date" >= '${DAY}T00:00:00Z' AND "date" < '2026-11-18T00:00:00Z'
    ORDER BY "punched_at" DESC LIMIT ${LIMIT}`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const REPETITIONS = 3;

async function timed(run, label) {
  // Muestra de calentamiento: la primera lectura paga plan y cache fria y decidiria el veredicto
  // por el orden en que corren las dos consultas.
  await run();
  const samples = [];
  for (let index = 0; index < REPETITIONS; index += 1) {
    const started = process.hrtime.bigint();
    const rows = await run();
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    samples.push({ elapsed_ms: elapsedMs, bytes: Buffer.byteLength(JSON.stringify(rows), "utf8"), rowCount: rows.length });
  }
  // No se publica `EXPLAIN (ANALYZE)`: corre en la misma conexion y PostgreSQL conserva la caché
  // de descompresion del TOAST del sondeo previo, asi que reporta ~2 ms "de servidor" para una
  // lectura que en pared tarda 3,3 s. Una metrica que miente en el sentido contrario es peor que
  // no tenerla. El tiempo de servidor real de produccion esta en `production_reference`
  // (pg_stat_statements), y lo que esta sonda si mide es pared + alambrado + cliente.
  return {
    label,
    repetitions: REPETITIONS,
    rows_returned: samples[samples.length - 1].rowCount,
    payload_bytes: samples[samples.length - 1].bytes,
    payload_mb: Number((samples[samples.length - 1].bytes / 1048576).toFixed(2)),
    elapsed_ms: Number(median(samples.map((item) => item.elapsed_ms)).toFixed(1)),
    elapsed_samples_ms: samples.map((item) => Number(item.elapsed_ms.toFixed(1)))
  };
}

function timedSql(prisma, sql, label) {
  return timed(() => prisma.$queryRawUnsafe(sql), label);
}

// La lectura propia de la pantalla de marcacion (`GET /hr/self/attendance`): un empleado, un
// dia. Va por el delegador de Prisma con el MISMO objeto `select` que usa el servicio, para que
// la sonda mida el argumento que se commitea y no una traduccion manual.
function timedSelfRead(prisma, label, withEvidence) {
  const { SELF_PUNCH_SELECT } = require("../../apps/api/src/modules/hr/monitorEvidenceRows");
  const where = { employee_id: 1, date: { gte: new Date(`${DAY}T00:00:00Z`), lt: new Date("2026-11-18T00:00:00Z") } };
  return timed(() => prisma.timePunch.findMany(withEvidence
    ? { where, orderBy: { punched_at: "asc" } }
    : { where, select: SELF_PUNCH_SELECT, orderBy: { punched_at: "asc" } }), label);
}

async function main() {
  psql("apexos", "SELECT 1");
  psql("apexos", `DROP DATABASE IF EXISTS ${PROBE_DB} WITH (FORCE)`);
  psql("apexos", `CREATE DATABASE ${PROBE_DB}`);

  const url = `postgresql://${USER}:${PASSWORD}@localhost:${HOST_PORT}/${PROBE_DB}`;
  const prisma = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const report = {
    format: "apexos-selfie-payload-probe-v1",
    started_at: new Date().toISOString(),
    target: { container: CONTAINER, database: PROBE_DB, rows: ROWS, limit: LIMIT,
      reproduce: `node scripts/performance/selfie-payload-probe.js --rows ${ROWS} --limit ${LIMIT}`,
      note: "base de sonda local con datos sinteticos; ni QA ni produccion" },
    production_reference: {
      measured_at: "2026-11-17", source: "pg_stat_statements", statement: "SELECT public.TimePunch (lectura diaria del mapa de operaciones)",
      calls: 4271, mean_ms: 3917.91, max_ms: 61365.4, rows_per_call: 615, blocks_read_from_disk: 0,
      share_of_measured_database_time_percent: 78.8
    },
    seeded_distribution: { mean_extra_evidence_bytes: MEAN_BYTES, max_extra_evidence_bytes: MAX_BYTES }
  };

  try {
    psqlScript(PROBE_DB, SEED);
    report.seeded_sizes = seededSizes(psql);
    if (!report.seeded_sizes.seed_is_faithful) {
      report.seeded_sizes.warning = "el TOAST almacenado no reproduce la media de produccion: los tiempos de esta corrida no son comparables";
    }
    const projectedSql = capturedProjectedSql();
    report.before = await timedSql(prisma, plainSelectSql(), "lectura cruda: todas las columnas con la selfie dentro");
    report.after = await timedSql(prisma, projectedSql, "lectura del producto: metadata cruda + aviso de evidencia sin abrirla");
    assert.equal(report.after.rows_returned, report.before.rows_returned, "la proyeccion cambio el numero de filas leidas");
    report.after.sql_preview = projectedSql.slice(0, 500);
    // La pantalla que el dueño midio en 12-20 s al abrir un horario no es el mapa: es la
    // marcacion propia (`GET /hr/self/attendance`), que traia cada marcacion del dia con su
    // selfie dentro aunque la pantalla pinta tipo, hora, placa y ruta.
    report.self_read = {};
    report.self_read.before = await timedSelfRead(prisma, "marcaciones del dia de un empleado: con extra_evidence (codigo anterior)", true);
    report.self_read.after = await timedSelfRead(prisma, "marcaciones del dia de un empleado: select del servicio (extra_evidence fuera)", false);
    assert.equal(report.self_read.after.rows_returned, report.self_read.before.rows_returned, "el select del servicio cambio el numero de filas leidas");
    report.self_read.verdict = {
      payload_bytes_avoided: report.self_read.before.payload_bytes - report.self_read.after.payload_bytes,
      payload_reduction_x: Number((report.self_read.before.payload_bytes / Math.max(1, report.self_read.after.payload_bytes)).toFixed(1)),
      local_ms_saved: Number((report.self_read.before.elapsed_ms - report.self_read.after.elapsed_ms).toFixed(1)),
      nota: `El seed concentra ${ROWS} filas en un solo dia, asi que la lectura de un empleado trae ${report.self_read.before.rows_returned} marcaciones cuando una jornada real marca 4. Lo que traslada de esta medida son los bytes por fila; la ultima linea los proyecta a la jornada real.`,
      bytes_por_marcacion_antes: Math.round(report.self_read.before.payload_bytes / Math.max(1, report.self_read.before.rows_returned)),
      bytes_por_marcacion_despues: Math.round(report.self_read.after.payload_bytes / Math.max(1, report.self_read.after.rows_returned)),
      jornada_real_4_marcaciones_antes_kb: Math.round(4 * report.self_read.before.payload_bytes / Math.max(1, report.self_read.before.rows_returned) / 1024),
      jornada_real_4_marcaciones_despues_kb: Math.round(4 * report.self_read.after.payload_bytes / Math.max(1, report.self_read.after.rows_returned) / 1024)
    };
    report.verdict = {
      payload_bytes_avoided: report.before.payload_bytes - report.after.payload_bytes,
      payload_reduction_x: Number((report.before.payload_bytes / Math.max(1, report.after.payload_bytes)).toFixed(1)),
      local_ms_saved: Number((report.before.elapsed_ms - report.after.elapsed_ms).toFixed(1)),
      interpretation: "El tiempo local corre por loopback sobre una base recien vacuumed, asi que mide el piso del ahorro: los bytes del TOAST que dejan de cruzar el pooler (produccion midio 3.917,91 ms de media con blocks_read_from_disk = 0, o sea transferir y no buscar) y la descompresion por fila que ya no se paga (medido el 2026-11-17 sobre esta misma copia: abrir el jsonb de 615 filas cuesta ~0,6 ms por fila, preguntar solo por su tamano almacenado 9,4 ms en total)."
    };
  } finally {
    await prisma.$disconnect().catch(() => {});
    psql("apexos", `DROP DATABASE IF EXISTS ${PROBE_DB} WITH (FORCE)`);
    report.finished_at = new Date().toISOString();
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`PROBE_ERROR ${error.message}`);
  process.exitCode = 1;
});
