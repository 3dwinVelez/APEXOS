'use strict';

// Medicion SOLO LECTURA del rango que leen el reporte de asistencia y el cierre de jornada.
//
// Por que existe: MAR-109 decia que `listAttendance` y `processDay` pedian la fila cruda de
// `TimePunch` para todo el rango. El monitor ya estaba medido y cortado; estas dos lecturas no.
// Un corte sin numeros es una opinion, y el dueno pidio garantia de que la pantalla deja de
// arrastrar binarios, no promesas.
//
// Que hace: sobre UNA misma base y el mismo rango, dos pasadas con el codigo del producto:
//   - cruda:      `SELECT *` (el comportamiento anterior), contada con `punchPhotoItems`;
//   - proyectada: `monitorEvidenceRows.readPunchRowsProjected` + `mobileIdentity.publicPunchMetadata`
//     (el aviso que hoy ve la pantalla), contada por `has_base64_data`.
// La paridad se exige con el umbral de bytes del propio lector para el soporte de horas extra.
// El script ABORTA si la proyeccion pierde ids, selfies o soporte: una caida de conteo es la
// reincidencia que ya costo un reporte en "Sin evidencia fotografica".
//
// Que NO hace: no escribe, no hace DDL, no devuelve contenido de cliente. Lo versionado son
// tamanos, conteos, milisegundos y el encabezado del SQL.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const ROOT = path.resolve(__dirname, "..", "..");
const EXPECTED_REFS = { production: "jzbwzmkidfthknsohhnr", qa: "jbirkghkekuifgfsgquq" };
const LONG_BASE64 = /base64,[A-Za-z0-9+/=]{256,}/;

function parseArgs(argv) {
  const options = { target: "production", samples: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Falta valor para ${flag}`);
    index += 1;
    if (flag === "--target") options.target = value;
    else if (flag === "--date") options.date = value;
    else if (flag === "--tenant") options.tenantId = value;
    else if (flag === "--samples") options.samples = Math.min(5, Math.max(1, Number(value)));
    else if (flag === "--output") options.output = path.resolve(value);
    else throw new Error(`Opcion no reconocida: ${flag}`);
  }
  if (!EXPECTED_REFS[options.target]) throw new Error(`Ambiente no valido: ${options.target}`);
  return options;
}

function parseEnv(file) {
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

const byteLength = (value) => Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
const tenantRef = (value) => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);

async function timedRun(run, samples) {
  const runs = [];
  let rows = [];
  for (let index = 0; index < samples; index += 1) {
    const started = process.hrtime.bigint();
    rows = await run();
    runs.push(Math.round(Number(process.hrtime.bigint() - started) / 1e6));
  }
  return { rows, runs_ms: runs, ms: [...runs].sort((a, b) => a - b)[Math.ceil(runs.length / 2) - 1] };
}

function bytesOf(rows, drop = []) {
  return rows.reduce((sum, row) => {
    if (!drop.length) return sum + byteLength(row);
    const clone = { ...row };
    for (const key of drop) delete clone[key];
    return sum + byteLength(clone);
  }, 0);
}

function summarize(rows, { drop = [], selfieCountOf, soporteCountOf }) {
  return {
    filas: rows.length,
    bytes_fila_completa: bytesOf(rows, drop),
    bytes_metadata: rows.reduce((sum, row) => sum + byteLength(row.metadata), 0),
    bytes_extra_evidence: rows.reduce((sum, row) => sum + byteLength(row.extra_evidence), 0),
    filas_con_binario_largo: rows.filter((row) => LONG_BASE64.test(JSON.stringify(row) || "")).length,
    filas_con_selfie: rows.filter((row) => selfieCountOf(row) > 0).length,
    filas_con_soporte: rows.filter((row) => soporteCountOf(row)).length
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = parseEnv(path.join(ROOT, "config", `${options.target}.env`));
  const expectedRef = EXPECTED_REFS[options.target];
  if (!String(config.SUPABASE_URL || "").includes(expectedRef) && !String(config.DATABASE_URL || "").includes(expectedRef)) {
    throw new Error(`El ambiente declarado no apunta al proyecto esperado (${expectedRef}); la medicion se aborta.`);
  }
  const prisma = new PrismaClient({ datasources: { db: { url: config.DATABASE_URL } }, log: ["error"] });
  const day = options.date || new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const start = new Date(`${day}T05:00:00.000Z`);
  const end = new Date(new Date(`${day}T05:00:00.000Z`).getTime() + 86400000);
  const monitorEvidenceRows = require(path.join(ROOT, "apps/api/src/modules/hr/monitorEvidenceRows"));
  const punchPhotoItems = require(path.join(ROOT, "apps/api/src/modules/hr/punchEvidence")).punchPhotoItems;
  const { publicPunchMetadata } = require(path.join(ROOT, "apps/api/src/modules/hr/mobile-identity"));

  try {
    // El tenant se elige por lo que realmente arrastra evidencia en la ventana, no por nombre:
    // en produccion el dia gordo pertenece al cliente operativo y los tenants de prueba salen en
    // cero. Se versiona un hash corto del id, como en la medicion del monitor.
    const candidates = await prisma.$queryRawUnsafe(
      `select "tenant_id" as id, count(*)::int as filas,
              coalesce(sum(pg_column_size("metadata") + pg_column_size("extra_evidence")), 0)::bigint as bytes
         from "public"."TimePunch"
        where "punched_at" >= '${start.toISOString()}' and "punched_at" < '${end.toISOString()}'
        group by 1 order by bytes desc limit 5`
    );
    const chosen = candidates.find((item) => String(item.id) === String(options.tenantId || item.id));
    if (!chosen) throw new Error(`El rango ${day} no tiene marcaciones; ajuste --date o --tenant.`);
    const tenantId = chosen.id;

    let captured = null;
    await monitorEvidenceRows.readPunchRowsProjected({ $queryRaw: (query) => { captured = query; return Promise.resolve([]); } }, tenantId, { start, end });
    const rawSql = `select *, (pg_column_size("extra_evidence") > ${monitorEvidenceRows.EVIDENCE_PRESENT_MIN_BYTES}) as "raw_extra_flag"
                      from "public"."TimePunch"
                     where "tenant_id" = '${tenantId}' and "punched_at" >= '${start.toISOString()}' and "punched_at" < '${end.toISOString()}'
                     order by "punched_at"`;

    const raw = await timedRun(() => prisma.$queryRawUnsafe(rawSql), options.samples);
    const projected = await timedRun(() => monitorEvidenceRows.readPunchRowsProjected(prisma, tenantId, { start, end }), options.samples);

    const cruda = summarize(raw.rows, {
      drop: ["raw_extra_flag"],
      selfieCountOf: (row) => punchPhotoItems({ metadata: row.metadata }).length,
      soporteCountOf: (row) => row.raw_extra_flag === true
    });
    // El lector devuelve el metadata como texto ya proyectado; `toRow` lo parsea dentro del
    // lector, y aqui se aplica ademas el aviso publico que el servicio manda a la pantalla.
    const proyectada = summarize(projected.rows, {
      selfieCountOf: (row) => (publicPunchMetadata(row.metadata || {})?.identity_photo?.has_base64_data ? 1 : 0),
      soporteCountOf: (row) => row.extra_evidence?.has_base64_data === true || row.has_extra_evidence === true
    });

    const rawIds = raw.rows.map((row) => row.id).sort((a, b) => a - b);
    const projectedIds = projected.rows.map((row) => row.id).sort((a, b) => a - b);
    const idsIguales = rawIds.length === projectedIds.length && rawIds.every((id, index) => String(id) === String(projectedIds[index]));
    if (!idsIguales) throw new Error("La lectura proyectada no devuelve los mismos ids que la cruda.");
    if (cruda.filas_con_selfie !== proyectada.filas_con_selfie) {
      throw new Error(`Se perdieron selfies al proyectar: ${cruda.filas_con_selfie} -> ${proyectada.filas_con_selfie}.`);
    }
    if (cruda.filas_con_soporte !== proyectada.filas_con_soporte) {
      throw new Error(`Se perdio soporte de horas extra al proyectar: ${cruda.filas_con_soporte} -> ${proyectada.filas_con_soporte}.`);
    }
    if (proyectada.filas_con_binario_largo) {
      throw new Error(`La lectura proyectada sigue arrastrando binario en ${proyectada.filas_con_binario_largo} fila(s).`);
    }

    const report = {
      format: "APEXOS_TIMEPUNCH_RANGE_READ_V2",
      scope: "READ-ONLY. La misma ventana leida cruda y con el lector proyectado del producto; sin DDL, sin DML, sin contenido de cliente en la evidencia.",
      target: options.target,
      project_ref: expectedRef,
      tenant_ref: tenantRef(tenantId),
      candidatos_rango: candidates.map((item) => ({ tenant_ref: tenantRef(item.id), filas: item.filas, bytes_evidencia: Number(item.bytes) })),
      day,
      umbral_bytes_metadata: monitorEvidenceRows.METADATA_SHRINK_MIN_BYTES,
      umbral_bytes_evidencia: monitorEvidenceRows.EVIDENCE_PRESENT_MIN_BYTES,
      muestras: options.samples,
      ran_at: new Date().toISOString(),
      cruda: { ...cruda, ms: raw.ms, runs_ms: raw.runs_ms },
      proyectada: { ...proyectada, ms: projected.ms, runs_ms: projected.runs_ms },
      ids_iguales: idsIguales,
      reduction: {
        bytes_x: Number((cruda.bytes_fila_completa / Math.max(1, proyectada.bytes_fila_completa)).toFixed(1)),
        ms_delta: raw.ms - projected.ms,
        ms_x: Number((raw.ms / Math.max(1, projected.ms)).toFixed(1))
      },
      projected_sql_head: captured.sql.replace(/\s+/g, " ").slice(0, 320)
    };
    const output = options.output || path.join(ROOT, `docs/qa/evidence/hr-monitor-byte-budget-20261118/rango-${options.target}-${day}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`CRUDA      ${cruda.filas} filas · ${Math.round(cruda.bytes_fila_completa / 1024)} KB · ${raw.ms} ms`);
    console.log(`PROYECTADA ${proyectada.filas} filas · ${Math.round(proyectada.bytes_fila_completa / 1024)} KB · ${projected.ms} ms`);
    console.log(`PARIDAD    ids iguales · selfies ${cruda.filas_con_selfie}=${proyectada.filas_con_selfie} · soporte ${cruda.filas_con_soporte}=${proyectada.filas_con_soporte} · binario inline proyectado ${proyectada.filas_con_binario_largo}`);
    console.log(`REDUCCION  ${report.reduction.bytes_x}x bytes · ${report.reduction.ms_x}x mas rapida (${report.reduction.ms_delta} ms menos)`);
    console.log(`EVIDENCIA  ${output}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`SONDA DE RANGO FALLIDA: ${error.message}`);
  process.exitCode = 1;
});
