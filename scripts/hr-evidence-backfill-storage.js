// Fase C.1 — sube a Supabase Storage el base64 de TimePunch que la Fase D no gobernaba.
//
// Uso:
//   node scripts/hr-evidence-backfill-storage.js --env qa|prod                 // dry-run: mide, no toca nada
//   --config=<archivo.env>            ambiente distinto del estandar (--env-file colisiona con Node)
//   node scripts/hr-evidence-backfill-storage.js --env prod --execute          // sube, verifica y quita los bytes
//   node scripts/hr-evidence-backfill-storage.js --env prod --execute --keep-inline
//   --limit 50 --after-id 2450        pasada acotada y reanudable por id
//   --tenant <id>                     una sola empresa (el censo del incidente)
//   --only extra|identity             una sola rama del contrato
//   --pilot 3                         procesa N filas y muestra sus ids para probar el lector desplegado
//   --sleep 120                       pausa (ms) entre subidas para no saturar el pooler
//
// Por que existe: el lector del monitor (`monitorEvidenceRows.js`) no puede contar evidencias sin
// des-tostar la columna, y la pantalla del monitor pago 12,9 s por esa lectura. Medido en
// Produccion el 2026-11-24 sobre las 2.676 marcaciones del tenant del cliente: 168 selfies en
// `metadata.identity_photo` (188,9 MB) y 58 evidencias en `extra_evidence` (51,2 MB) con los bytes
// dentro, y CERO de esas selfies con referencia a Storage. La Fase D ya escribe referencias cuando
// HR_EVIDENCE_STORAGE_ENABLED=true, pero esa bandera nunca se encendio; sin este guion, encenderla
// deja el historial igual de lento - el backfill es lo que convierte el flag en reparacion y no en
// parche a futuro.
//
// Que hace por fila (orden no negociable):
//   1) sondea candidatas SIN transferir el binario: traer la columna tostada por lotes es la causa
//      de las corridas muertas del rescate (57014);
//   2) baja el binario de ESE campo, de UNA fila, y lo hashea en Node (no depende de pgcrypto);
//   3) sube al bucket privado `operational-evidence` con la MISMA regla de ruta que usa la
//      escritura nueva (`evidenceStorage.uploadInline` sin entityId => ruta por contenido,
//      x-upsert: re-correr el guion no duplica objetos);
//   4) re-descarga el objeto y exige el mismo SHA-256 antes de escribir la base;
//   5) escribe `storage_path` / `sha256` / `size` y la bandera que consulta el lector
//      (`hr_evidence_rescue_extra` / `hr_evidence_rescue_identity`) y, salvo `--keep-inline`,
//      quita el base64 en la MISMA sentencia, con `returning pg_column_size` como prueba.
// Un paso que falla deja la fila intacta: la subida no confirmada jamas borra el unico ejemplar.
//
// Protecciones: aborta sin conectar si el ambiente no apunta al project ref esperado; nunca
// imprime claves ni contenido; la evidencia guarda referencias cortas, no ids de cliente.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const EXPECTED_REFS = { qa: "jbirkghkekuifgfsgquq", prod: "jzbwzmkidfthknsohhnr" };
const EVIDENCE_DIR = "hr-evidence-backfill-20261124";

// El modulo del producto es el unico dueno de la regla de ruta y del nombre del bucket: reimplementarla
// aqui es exactamente como el rescate del 2026-11-18 pudo divergir del lector desplegado.
const evidenceStorage = require(path.join(ROOT, "apps", "api", "src", "modules", "hr", "evidenceStorage.js"));

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=", 2);
    if (eq !== -1) { out[token.slice(2, eq)] = token.slice(eq + 1); continue; }
    const next = argv[index + 1];
    out[token.slice(2)] = next && !String(next).startsWith("--") ? (index += 1, next) : true;
  }
  return out;
}

// Toda la validacion vive aqui, sin efectos: es la parte del guion que se puede probar sin red y
// sin base de datos, que es justo la que tiene que impedir escribir en el proyecto equivocado.
function resolveRuntime(argv) {
  const args = parseArgs(argv);
  const env = String(args.env || "").trim();
  const mode = args.execute ? "execute" : "dry";
  const keepInline = Boolean(args["keep-inline"]);
  const only = args.only ? String(args.only) : null;
  const tenant = args.tenant ? String(args.tenant) : null;
  const problems = [];
  if (!env || !EXPECTED_REFS[env]) problems.push("falta --env qa|prod");
  if (tenant && !/^[A-Za-z0-9-]{8,64}$/.test(tenant)) problems.push("--tenant debe ser un id alfanumerico");
  if (only && !["extra", "identity"].includes(only)) problems.push("--only vale extra|identity");
  if (keepInline && mode !== "execute") problems.push("--keep-inline acompana a --execute (en dry no se escribe)");
  if (Number(args.limit || 50) < 1 && args.limit !== undefined) problems.push("--limit debe ser un entero positivo");
  if (problems.length) return { problems, env, mode };

  const conf = {};
  // El archivo se puede re-declarar (para el arnes), pero el guard del project ref corre sobre lo
  // que el archivo diga: cambiar la ruta de configuracion no cambia la proteccion.
  // `--config` es el nombre propio: Node se reserva `--env-file` y aborta el proceso antes de
  // arrancar si el archivo no existe (medido con Node 22 el 2026-11-24), lo que convierte un typo
  // del operador en un error incomprensible. Se sigue aceptando `--env-file` por costumbre de la
  // casa, pero el warning de arriba es el que manda.
  const configPath = args.config || args["env-file"];
  const envFile = configPath ? path.resolve(String(configPath)) : path.join(ROOT, "config", env === "qa" ? "qa.env" : "production.env");
  if (!fs.existsSync(envFile)) return { problems: [`no existe ${path.relative(ROOT, envFile)} para el ambiente ${env}`], env, mode };
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) conf[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const supabaseUrl = String(conf.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = String(conf.SUPABASE_SERVICE_ROLE_KEY || "");
  const databaseUrl = String(conf.DATABASE_URL || "");
  if (!supabaseUrl || !serviceKey) return { problems: [`faltan SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY en ${path.basename(envFile)}`], env, mode };
  // El guard corre antes de cualquier conexion: medir o escribir el proyecto equivocado es el peor fallo posible.
  if (!supabaseUrl.includes(EXPECTED_REFS[env]) && !databaseUrl.includes(EXPECTED_REFS[env])) {
    return { problems: [`el ambiente ${env} no apunta al project ref esperado (${EXPECTED_REFS[env]}): aborta sin conectar`], env, mode };
  }
  return {
    env, mode, keepInline, only, tenant, envFile,
    limit: Math.max(1, Number(args.limit || 50)),
    afterId: Math.max(0, Number(args["after-id"] || 0)),
    pilot: args.pilot ? Math.max(1, Number(args.pilot)) : 0,
    sleepMs: Math.max(0, Number(args.sleep || 120)),
    supabaseUrl, serviceKey, databaseUrl, problems: []
  };
}

// Las dos ramas que el contrato de escritura produce con bytes. `extra_evidence` admitio `base64`
// o `base64_data` segun el cliente, asi que cada expresion cubre ambas grafias.
// Cada rama devuelve su lista SET completa con UN solo destino por columna: `identity` toca
// `metadata` para la foto Y para la bandera de rescate, y Postgres rechaza dos asignaciones a la
// misma columna en el mismo UPDATE.
const rawOf = (obj) => `coalesce(nullif(${obj} ->> 'base64_data', ''), nullif(${obj} ->> 'base64', ''))`;
const REF = "jsonb_build_object('storage_path', $1::text, 'sha256', $2::text, 'size', $3::bigint)";
const BRANCHES = [
  {
    kind: "extra",
    entity: "extra-evidence",
    flagKey: evidenceStorage.FLAG_EXTRA,
    object: "case when jsonb_typeof(tp.extra_evidence) = 'object' then tp.extra_evidence else null end",
    guard: "jsonb_typeof(\"extra_evidence\") = 'object'",
    // El binario vive en la columna entera: la lectura puntual, de a UNA fila, es la unica que lo pide.
    single: rawOf('"TimePunch"."extra_evidence"'),
    sets: (keep) => [
      keep
        ? `"extra_evidence" = "extra_evidence" || ${REF}`
        : `"extra_evidence" = ("extra_evidence" - 'base64' - 'base64_data') || ${REF} || jsonb_build_object('base64', '')`,
      `"metadata" = jsonb_set("metadata", '{${evidenceStorage.FLAG_EXTRA}}', $4::jsonb)`
    ].join(", ")
  },
  {
    kind: "identity",
    entity: "identity-photos",
    flagKey: evidenceStorage.FLAG_IDENTITY,
    object: "case when jsonb_typeof(tp.metadata -> 'identity_photo') = 'object' then tp.metadata -> 'identity_photo' else null end",
    guard: "jsonb_typeof(\"metadata\" -> 'identity_photo') = 'object'",
    single: rawOf(`"TimePunch"."metadata" -> 'identity_photo'`),
    sets: (keep) => {
      const photo = keep
        ? `("metadata" -> 'identity_photo') || ${REF}`
        : `(("metadata" -> 'identity_photo') - 'base64' - 'base64_data') || ${REF} || jsonb_build_object('base64_data', '')`;
      return `"metadata" = jsonb_set(jsonb_set("metadata", '{identity_photo}', ${photo}), '{${evidenceStorage.FLAG_IDENTITY}}', $4::jsonb)`;
    }
  }
];

const compactRef = (value) => crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
const mb = (bytes) => Math.round((Number(bytes || 0) / 1048576) * 10) / 10;

async function main(runtime) {
  const { env, mode, keepInline, limit, afterId, pilot, sleepMs, tenant, supabaseUrl, serviceKey, databaseUrl } = runtime;
  process.env.SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
  const selected = runtime.only ? BRANCHES.filter((b) => b.kind === runtime.only) : BRANCHES;
  const bucket = evidenceStorage.BUCKET;

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: ["error"] });
  const startedAt = new Date().toISOString();
  const report = {
    change_id: "hr-evidence-backfill-c1",
    environment: env,
    project_ref: EXPECTED_REFS[env],
    mode,
    bytes_inline_retirados: mode === "execute" && !keepInline,
    bucket,
    ramas: selected.map((b) => b.kind),
    tenant: tenant || "todos",
    despues_de_id: afterId,
    limite: limit,
    started_at: startedAt,
    reglas: [
      "la subida solo se confirma re-descargando el objeto y comparando SHA-256",
      "el sondeo de candidatas des-tosta en el servidor pero no transfiere el binario: lo que mato las corridas anteriores fue el viaje por el pooler",
      "la referencia y la bandera de rescate se escriben en la misma sentencia que retira el base64",
      "un paso que falla deja la fila intacta"
    ],
    conteo: { candidatas: 0, sin_bytes: 0, procesadas: 0, subidas_verificadas: 0, bytes_inline: 0 },
    omitidas: { binario_no_decodificable: 0, objeto_no_releible: 0, objeto_no_coincide: 0, subida_rechazada: 0, forma_no_objeto: 0, update_no_toco_fila: 0 },
    omitidas_detalle: [],
    muestra_verificada: [],
    piloto_ids: [],
    tablas: {}
  };
  const sizeOf = async (table) => Number((await prisma.$queryRawUnsafe(`select pg_total_relation_size('"${table}"'::regclass)::bigint as bytes`))[0].bytes);
  const tenantClause = tenant ? ` and tp.tenant_id = '${tenant}'` : "";

  try {
    // La selfie pesa hasta 2,6 MB (medido 2026-11-24): con el timeout por defecto de 5 s la pasada
    // se muere a mitad. Se ampliza solo en esta conexion y solo para esta operacion.
    await prisma.$executeRawUnsafe("set statement_timeout = '300000'");
    const antes = await sizeOf("TimePunch");
    report.tablas.TimePunch = { bytes_antes: antes };

    for (const branch of selected) {
      const rows = await prisma.$queryRawUnsafe(`
        select tp.id::int as id, tp.tenant_id::text as tenant_id,
               ${rawOf(branch.object)} is not null as has_bytes,
               octet_length(case when ${rawOf(branch.object)} like 'data:%'
                 then split_part(${rawOf(branch.object)}, ',', 2) else ${rawOf(branch.object)} end) as b64_chars,
               ${branch.object} ->> 'name' as file_name,
               ${branch.object} ->> 'type' as declared_type
        from "TimePunch" tp
        where tp.id > ${afterId} and ${branch.object} is not null ${tenantClause}
        order by tp.id asc
        limit ${limit}`);
      const stats = { rama: branch.kind, candidatas: rows.length, con_bytes: 0, subidas: 0, verificadas: 0, bytes_inline: 0, mas_grande_despues: 0 };
      let done = 0;
      for (const row of rows) {
        report.conteo.candidatas++;
        if (!row.has_bytes) { report.conteo.sin_bytes++; continue; }
        // Los bytes reales son ~3/4 del texto base64: la medida de masa evita decodificar en la base.
        const inlineBytes = Math.floor(Number(row.b64_chars || 0) * 3 / 4);
        stats.con_bytes++;
        stats.bytes_inline += inlineBytes;
        report.conteo.bytes_inline += inlineBytes;
        if (mode === "dry" || (pilot && done >= pilot)) continue;

        // UNA fila, ESE campo: es el unico punto del guion donde el binario cruza el pooler.
        const [loaded] = await prisma.$queryRawUnsafe(
          `select ${branch.single} as raw from "TimePunch" where id = $1::int and ${branch.guard} limit 1`, Number(row.id));
        const raw = String(loaded?.raw || "").trim();
        if (!raw) { report.omitidas.forma_no_objeto++; continue; }
        let decoded;
        try {
          decoded = evidenceStorage.decodeInline(raw);
          if (!decoded.buf.length || decoded.buf.length < 32) throw new Error("binario vacio");
        } catch {
          report.omitidas.binario_no_decodificable++;
          if (report.omitidas_detalle.length < 400) report.omitidas_detalle.push({ rama: branch.kind, ref: compactRef(row.id), motivo: "binario_no_decodificable" });
          continue;
        }
        const localSha = crypto.createHash("sha256").update(decoded.buf).digest("hex");

        let uploaded;
        try {
          uploaded = await evidenceStorage.uploadInline({
            tenantId: row.tenant_id, entity: branch.entity,
            fileName: row.file_name || "", base64Raw: raw
          });
        } catch (error) {
          report.omitidas.subida_rechazada++;
          if (report.omitidas_detalle.length < 400) report.omitidas_detalle.push({ rama: branch.kind, ref: compactRef(row.id), motivo: "subida_rechazada", detalle: String(error.message).slice(0, 90) });
          continue;
        }
        stats.subidas++;

        // La subida no prueba que el almacen conserve ESTOS bytes: se re-descarga y se compara.
        let objectSha;
        try {
          const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${uploaded.storage_path.split("/").map(encodeURIComponent).join("/")}`, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
          });
          if (!res.ok) throw new Error(`respuesta ${res.status}`);
          objectSha = crypto.createHash("sha256").update(Buffer.from(await res.arrayBuffer())).digest("hex");
        } catch (error) {
          report.omitidas.objeto_no_releible++;
          if (report.omitidas_detalle.length < 400) report.omitidas_detalle.push({ rama: branch.kind, ref: compactRef(row.id), motivo: "objeto_no_releible", detalle: String(error.message).slice(0, 90) });
          continue;
        }
        if (objectSha !== localSha) {
          report.omitidas.objeto_no_coincide++;
          if (report.omitidas_detalle.length < 400) report.omitidas_detalle.push({ rama: branch.kind, ref: compactRef(row.id), motivo: "objeto_no_coincide" });
          continue;
        }
        stats.verificadas++;
        report.conteo.subidas_verificadas++;

        const flag = JSON.stringify({
          status: "rescued", storage_path: uploaded.storage_path, sha256: localSha,
          bytes: uploaded.bytes, mime: decoded.mime, backfilled_at: new Date().toISOString()
        });
        // `--keep-inline` escribe la referencia y deja los bytes: es la fase intermedia, la que permite
        // probar el lector desplegado antes de soltar el unico ejemplar del binario.
        // El `returning` es la prueba de que la escritura adelgazo la fila: la corrida no se declara
        // verde por haber corrido, se mide.
        const [written] = await prisma.$queryRawUnsafe(
          `update "TimePunch" set ${branch.sets(keepInline)} where "id" = $5::int and ${branch.guard}
             returning pg_column_size("metadata") as metadata_bytes, pg_column_size("extra_evidence") as extra_bytes`,
          uploaded.storage_path, localSha, Number(uploaded.bytes), flag, Number(row.id));
        if (!written) {
          report.omitidas.update_no_toco_fila++;
          if (report.omitidas_detalle.length < 400) report.omitidas_detalle.push({ rama: branch.kind, ref: compactRef(row.id), motivo: "update_no_toco_fila" });
          continue;
        }
        stats.mas_grande_despues = Math.max(stats.mas_grande_despues || 0,
          branch.kind === "identity" ? Number(written.metadata_bytes || 0) : Number(written.extra_bytes || 0));
        done++;
        report.conteo.procesadas++;
        report.piloto_ids.push(`${branch.kind}:${row.id}`);
        if (report.muestra_verificada.length < 25) {
          report.muestra_verificada.push({ rama: branch.kind, ref: compactRef(row.id), bytes: uploaded.bytes, ruta_del_producto: /^company\//.test(uploaded.storage_path) });
        }
        if (sleepMs) await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }
      report.tablas[branch.kind] = stats;
    }

    const despues = await sizeOf("TimePunch");
    report.tablas.TimePunch.bytes_despues = despues;
    report.tablas.TimePunch.delta_bytes = despues - antes;
    report.tablas.TimePunch.nota = mode === "dry" ? "dry-run: la tabla no cambia"
      : keepInline ? "--keep-inline: la referencia queda escrita y los bytes tambien (fase intermedia)"
        : "pg_total_relation_size no baja con el UPDATE: el TOAST se libera con VACUUM (fase C.3)";
    report.terminado_en = new Date().toISOString();
    report.duracion_ms = Date.parse(report.terminado_en) - Date.parse(startedAt);

    const outDir = path.join(ROOT, "docs", "qa", "evidence", EVIDENCE_DIR);
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, `${env}-${mode}${keepInline ? "-keep" : ""}-${Date.now()}.json`);
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

    console.log(`[backfill C.1] env=${env} ref=${EXPECTED_REFS[env]} modo=${mode}${keepInline ? " keep-inline" : ""} ramas=${report.ramas.join("+")} limite=${limit} despues_de=${afterId}`);
    for (const branch of selected) {
      const s = report.tablas[branch.kind];
      console.log(` - ${branch.kind}: candidatas ${s.candidatas} · con bytes ${s.con_bytes} · subidas ${s.subidas} · verificadas ${s.verificadas} · ${mb(s.bytes_inline)} MB inline`
        + (s.verificadas ? ` · fila mas gorda despues de escribir: ${mb(s.mas_grande_despues)} MB` : ""));
    }
    console.log(`[backfill C.1] masa inline medida: ${mb(report.conteo.bytes_inline)} MB · filas ya sin bytes: ${report.conteo.sin_bytes} · omitidas: ${JSON.stringify(report.omitidas)}`);
    if (report.piloto_ids.length) console.log(`[backfill C.1] ids procesados (para probar el lector): ${report.piloto_ids.slice(0, 12).join(", ")}`);
    if (mode === "dry") console.log("[backfill C.1] dry-run: no se subio ni se escribio nada.");
    console.log(`[backfill C.1] evidencia: ${out}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  const runtime = resolveRuntime(process.argv.slice(2));
  if (runtime.problems.length) {
    for (const problem of runtime.problems) console.error(`ERROR: ${problem}`);
    process.exit(2);
  }
  main(runtime).catch((error) => {
    console.error(`[backfill C.1] FALLO: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { BRANCHES, EXPECTED_REFS, compactRef, mb, parseArgs, rawOf, resolveRuntime };
