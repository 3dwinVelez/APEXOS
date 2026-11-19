'use strict';

// Lectura de evidencias para el resumen de rutas del monitor de marcaciones.
//
// TimePunch.extra_evidence guarda la selfie en base64 dentro del jsonb. Medido en
// produccion el 2026-11-17 sobre 2247 filas: 104.856 bytes de media y 2.792.205 en el
// peor caso, con 233 MB de TOAST frente a 1,9 MB de heap. El resumen solo cuenta
// evidencias, pero la lectura traia los bytes: 615 filas por llamada, unos 63 MB
// cruzando el pooler, 3.098 ms de media y 61.365 ms de maximo. Entre las 40 huellas mas
// caras, 26 eran esta misma consulta y sumaban el 94 % del tiempo de base de produccion
// (62,7 % en QA).
//
// EXPLAIN descarta un indice: es Seq Scan con cero bloques leidos del disco, asi que el
// costo no esta en encontrar las filas sino en transferirlas. Esta proyeccion deja el
// conteo intacto y saca el payload del viaje:
//   - conserva la cabecera `data:<mime>;base64,` (los primeros 64 caracteres) porque
//     punchPhotoItems deriva el mime de esa cabecera y su lista de permitidos decide si
//     el item cuenta;
//   - sustituye el resto por md5 del valor completo, porque el dedupe de punchPhotoItems
//     se hace por valor: dos fotos identicales siguen contando como una.
// Los bytes del payload nunca salen de PostgreSQL. `metadata` se proyecta solo en la fila que
// los trae: ver `evidenceFreeMetadata`, que corrige la premisa "mide 575 bytes de media" con
// la medicion de produccion del 2026-11-18 (414 KB de media, 2,6 MB el peor caso).

const { Prisma } = require("@prisma/client");

const SHA_MARK = "#apexos-monitor-evidence-sha#";
const HEADER_KEEP = 64;
const UNLINKED_LIMIT = 2000;
// Umbral para decir "esta marcacion trae un soporte" sin abrir el jsonb tostado. No intenta
// medir una foto: separa el contenedor vacio del que tiene algo. Medido en PostgreSQL 16 con
// pg_column_size: `{}` y `[]` ocupan 8, el escalar `null` 12, y la referencia mas corta que
// escribe el producto (`{"file_name":...,"storage_path":...}`) 75. El criterio viejo era
// exactamente "extra_evidence no esta vacio" (ver monitorEvidenceSummary en service.js, que
// anuncia `available` por el id de la marcacion), asi que un objeto pequeno -una foto de
// prueba o una puntero a almacenamiento- sigue anunciando su archivo y la pantalla lo pide
// por id; lo que se perdio es viajar los bytes dentro del listado.
const EVIDENCE_PRESENT_MIN_BYTES = 16;
// Umbral a partir del cual `metadata` se reescribe para sacarle la evidencia. Reescribir un
// jsonb obliga a detoastearlo (~0,6 ms por fila, medido el 2026-11-17) y eso no paga la pena
// en una fila de 600 bytes; si paga en una de 414 KB, que es la media real del 2026-11-18.
const METADATA_SHRINK_MIN_BYTES = 8192;

// Campos escalares de `TimePunch` en `schema.prisma`. `extra_evidence` se reemplaza por
// su proyeccion; los demas viajan intactos porque el monitor los agrupa por ellos.
const PUNCH_COLUMNS = [
  "id", "tenant_id", "employee_id", "user_name", "type", "punched_at", "date", "time",
  "latitude", "longitude", "accuracy_meters", "vehicle_plate", "route_id", "extra_minutes",
  "extra_reason", "extra_detail", "extra_evidence", "metadata", "idempotency_key", "created_at"
];

// Las lecturas propias de la pantalla de marcacion (`GET /hr/self/attendance` y la jornada
// que se reconstruye desde las marcaciones del dia) tampoco necesitan la selfie: el cliente
// pinta tipo, hora, placa y ruta, y `ensureWorkSessionFromPunches` lee id, empleado, ruta y
// timestamps. Medido el 2026-11-17: `extra_evidence` es 106 KB de media y 2,8 MB en el peor
// caso por fila, mientras `metadata` mide 532 B y alli viven `late_minutes` y la
// verificacion de identidad que la pantalla si muestra. Se conserva por lo tanto toda la
// fila menos la evidencia, en lugar de enumerar un punado de campos que la pantalla aun no
// usa y que un cambio de schema borraria en silencio.
const SELF_PUNCH_SELECT = Object.fromEntries(PUNCH_COLUMNS
  .filter((column) => column !== "extra_evidence")
  .map((column) => [column, true]));

// Campos escalares de `GpsPing` en `schema.prisma`: los mismos que devolvian los
// `findMany` del mapa, sin enumerar ninguno a mano en el servicio.
const GPS_COLUMNS = [
  "id", "tenant_id", "user_name", "employee_id", "vehicle_plate", "route_id", "latitude",
  "longitude", "accuracy_meters", "source", "captured_at", "metadata"
];

function shrinkKey(target, key) {
  const text = `${target}->>'${key}'`;
  return `CASE WHEN jsonb_typeof(${target}->'${key}') = 'string' THEN `
    + `jsonb_set(${target}, '{${key}}', `
    + `to_jsonb(left(${text}, ${HEADER_KEEP}) || '${SHA_MARK}' || md5(${text}))) `
    + `ELSE ${target} END`;
}

function shrinkObject(target) {
  return shrinkKey(shrinkKey(target, "base64_data"), "base64");
}

// `extra_evidence` es jsonb y puede venir como objeto o como arreglo de objetos; las dos
// formas las acepta punchPhotoItems, asi que las dos se proyectan. Cualquier otro tipo
// (null, string, numero) se devuelve intacto para no cambiar lo que ve el lector canonico.
function evidenceProjection(column) {
  return `CASE WHEN jsonb_typeof(${column}) = 'array' THEN (`
    + `(SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(e) = 'object' THEN ${shrinkObject("e")} ELSE e END ORDER BY ord), '[]'::jsonb)`
    + ` FROM jsonb_array_elements(${column}) WITH ORDINALITY AS arr(e, ord)))`
    + ` WHEN jsonb_typeof(${column}) = 'object' THEN ${shrinkObject(column)}`
    + ` ELSE ${column} END`;
}

// El mismo cálculo en JS, para que la equivalencia se pueda probar sin base de datos.
function projectEvidenceItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const projected = { ...item };
  for (const key of ["base64_data", "base64"]) {
    if (typeof projected[key] === "string") {
      projected[key] = `${projected[key].slice(0, HEADER_KEEP)}${SHA_MARK}${require("crypto").createHash("md5").update(projected[key], "utf8").digest("hex")}`;
    }
  }
  return projected;
}

function projectEvidence(value) {
  if (Array.isArray(value)) return value.map(projectEvidenceItem);
  if (value && typeof value === "object") return projectEvidenceItem(value);
  return value;
}

function parseJsonColumn(value) {
  if (typeof value !== "string") return value;
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    out[key] = key === "extra_evidence" || key === "metadata" ? parseJsonColumn(value) : value;
  }
  return out;
}

// Reemplazo de prisma.timePunch.findMany({ where: { route_id: { in: routeIds } },
// select: { route_id, extra_evidence, metadata } }). $queryRaw no pasa por el middleware
// de tenant de core/prisma.js, por eso el filtro tenant_id va escrito: sin el, el resumen
// contaria evidencias de otras empresas.
function readRouteEvidence(prisma, tenantId, routeIds) {
  if (!Array.isArray(routeIds) || !routeIds.length) return Promise.resolve([]);
  const projection = Prisma.raw(evidenceProjection('"TimePunch"."extra_evidence"'));
  const metadata = Prisma.raw(evidenceFreeMetadata('"TimePunch"."metadata"'));
  return prisma.$queryRaw(Prisma.sql`
    SELECT "TimePunch"."route_id" AS "route_id",
           ${projection}::text AS "extra_evidence",
           ${metadata}::text AS "metadata"
    FROM "public"."TimePunch"
    WHERE "TimePunch"."tenant_id" = ${tenantId}
      AND "TimePunch"."route_id" IN (${Prisma.join(routeIds)})
  `).then((rows) => rows.map(toRow));
}

// Encoge solo la rama pedida de un jsonb, dejando el resto del objeto intacto: `metadata`
// tambien lleva las identidades y los alias que el agrupamiento del monitor si consume.
function shrinkNested(column, key) {
  const child = `${column} -> '${key}'`;
  return `CASE WHEN jsonb_typeof(${child}) IN ('object', 'array') THEN `
    + `jsonb_set(${column}, '{${key}}', (${evidenceProjection(child)})) ELSE ${column} END`;
}

// Unica rama de `metadata` que el contrato de escritura produce con bytes: `preparePunchEvidence`
// sube `identity_photo` y la columna `extra_evidence`, y nada mas. `punchPhotoItems` tolera
// ademas `metadata.extra_evidence` y `metadata.photo` por historia, pero anidar las tres ramas
// multiplica el CASE ~64 veces (cada nivel referencia al anterior cuatro veces) por un binario
// que el producto no escribe. La puerta de ese supuesto es el presupuesto de bytes del paquete
// 2, que mide la respuesta real y cae solo si aparece un transportador nuevo.
function shrinkMetadataEvidence(column) {
  return shrinkNested(column, "identity_photo");
}

// `metadata` de una marcacion ya no es barata. El comentario que gobernaba esta lectura decia
// "mide 532/575 bytes de media, alli viven las identidades": esa premisa se midio sobre
// `extra_evidence` y se heredo sin re-chequeo. Medido en produccion el 2026-11-18 (46 filas
// del tenant con la selfie dentro): 414 KB de media y 2,6 MB el peor caso, y el dia del monitor
// cruzaba 20,3 MB por el pooler por culpa de esta columna. La guarda deja la fila flaca como
// estaba -cero detoast, el contrato del 2026-11-17- y abre solo la que trae binario.
function evidenceFreeMetadata(column) {
  return `CASE WHEN pg_column_size(${column}) > ${METADATA_SHRINK_MIN_BYTES} `
    + `THEN (${shrinkMetadataEvidence(column)}) ELSE ${column} END`;
}

// El lote del monitor necesita el INDICE de las evidencias de una ruta, no sus bytes.
// Medido en produccion el 2026-11-17 sobre pg_stat_statements: la lectura sin proyectar
// era el primer consumidor de la base, 4.271 llamadas de ~615 filas, 3.917 ms de media y
// 61.365 ms de maximo, el 78,8 % de todo el tiempo medido. Con `blocks_read_from_disk = 0`
// el costo no es encontrar las filas sino transferir el TOAST por el pooler, asi que
// ningun indice lo arregla: lo arregla no pedir los bytes.
function readRoutePunchEvidence(prisma, tenantId, routeId) {
  const evidence = Prisma.raw(evidenceProjection('"TimePunch"."extra_evidence"'));
  const metadata = Prisma.raw(evidenceFreeMetadata('"TimePunch"."metadata"'));
  return prisma.$queryRaw(Prisma.sql`
    SELECT "TimePunch"."id" AS "id",
           "TimePunch"."type" AS "type",
           "TimePunch"."punched_at" AS "punched_at",
           ${evidence}::text AS "extra_evidence",
           ${metadata}::text AS "metadata"
    FROM "public"."TimePunch"
    WHERE "TimePunch"."tenant_id" = ${tenantId}
      AND "TimePunch"."route_id" = ${routeId}
    ORDER BY "TimePunch"."punched_at" ASC
  `).then((rows) => rows.map(toRow));
}

// El mapa de operaciones del dia (`GET /hr/operations-map`) es la llamada del monitor:
// el cliente la repite cada 5 segundos mientras un horario esta abierto. Medido el
// 2026-11-17 sobre pg_stat_statements de produccion era el SELECT mas caro de la base,
// 4.271 llamadas de ~615 filas con 0 bloques leidos del disco, 3.917,91 ms de media y
// 61.365,4 ms de maximo, el 78,8 % de todo el tiempo medido. Leia cada marcacion con su
// selfie en base64 y el servicio tiraba los bytes al construir `monitorPunchEvidence` y
// `monitorEvidenceSummary`: el viaje nunca le sirvio a nadie.
//
// Aqui NO se proyecta la evidencia: se declara que existe. Medido el 2026-11-17 sobre una
// copia con el reparto real de produccion (202 MB, `extra_evidence` 106.459 B de media y
// 2.839.316 de maximo, `metadata` 532 B de media, 615 filas por lectura):
//
//   SELECT * sin proyectar                4,6 ms servidor   2.554 ms cliente   53,94 MB
//   proyeccion con jsonb_set (la anterior) 1.047 ms           1.174 ms            0,61 MB
//   aplanar una vez y reescribir           643-761 ms           931-1.010 ms       0,57 MB
//   stub desde texto, sin jsonb_set        1.064-1.196 ms       1.407-1.428 ms     0,74 MB
//   solo detoast para contar (jsonb_array_length)            362 ms      460 ms    0,57 MB
//   tamano almacenado sin detoastar (esta lectura)             9,4 ms       37 ms   0,58 MB
//
// El payload ya no era el problema despues de proyectar (0,61 MB en todas las variantes):
// lo que costaba era traer el jsonb tostado a memoria, ~0,6 ms por fila aunque no se
// reescriba. `pg_column_size` lee el puntero TOAST y no detoasta, asi que sale gratis.
//
// `metadata` NO viaja cruda desde el 2026-11-18. La clausula que la dejaba pasar decia "mide
// 532 bytes de media", pero esa cifra era de `extra_evidence` re-etiquetada: con la selfie
// escrita dentro de `metadata` por el flujo movil, produccion mide 414 KB de media y 2,6 MB el
// peor caso, y el dia del monitor pagaba 20,3 MB de traslado por columnas que el agrupamiento
// usa por tres campos escalares. La guarda de `pg_column_size` deja intacta la lectura barata
// del 2026-11-17 (las filas flacas no se detoastean) y abre solo la fila que trae binario.
function readDayEvidencePunches(prisma, tenantId, dayStart, dayEnd, limit) {
  // `metadata` sale de la lista escalar porque se proyecta como texto: Prisma la decodificaria
  // como Json y dos columnas con el mismo nombre en la fila es un contrato ambiguo.
  const columns = Prisma.raw(PUNCH_COLUMNS.filter((column) => column !== "extra_evidence" && column !== "metadata")
    .map((column) => `"TimePunch"."${column}" AS "${column}"`).join(", "));
  const metadata = Prisma.raw(evidenceFreeMetadata('"TimePunch"."metadata"'));
  return prisma.$queryRaw(Prisma.sql`
    SELECT ${columns},
           ${metadata}::text AS "metadata",
           coalesce(pg_column_size("TimePunch"."extra_evidence") > ${EVIDENCE_PRESENT_MIN_BYTES}, false) AS "has_extra_evidence"
    FROM "public"."TimePunch"
    WHERE "TimePunch"."tenant_id" = ${tenantId}
      AND "TimePunch"."date" >= ${dayStart} AND "TimePunch"."date" < ${dayEnd}
    ORDER BY "TimePunch"."punched_at" DESC
    LIMIT ${limit}
  `).then((rows) => rows.map(toRow));
}

// El mapa de operaciones del dia tambien arrastra el GPS, y el deflector es el mismo
// binario. Medido en produccion el 2026-11-18 sobre el tenant del horario 336: `GpsPing`
// tiene 6.522 filas y 30 MB de `metadata`, 44 de esas filas llevan `identity_photo` en
// claro con 2.699.051 bytes en la peor -la COPIA que el deflector de marcacion ya guardo
// en `TimePunch`, 29,7 MB- y ninguna pantalla lee la selfie por el ping: el monitor y el
// reporte la piden por el id de la marcacion. La lectura del mapa pide hasta 1.000 pings
// del dia, asi que 16,1 MB cruzaban el pooler cada 5 segundos para pintar un punto.
// El contrato de escritura corta la copia nueva; esta proyeccion corta la que ya existe,
// con la misma guarda de tamano: la fila flaca no se detoastea.
function readDayGpsPings(prisma, tenantId, windowStart, windowEnd, limit) {
  const columns = Prisma.raw(GPS_COLUMNS.filter((column) => column !== "metadata")
    .map((column) => `"GpsPing"."${column}" AS "${column}"`).join(", "));
  const metadata = Prisma.raw(evidenceFreeMetadata('"GpsPing"."metadata"'));
  return prisma.$queryRaw(Prisma.sql`
    SELECT ${columns},
           ${metadata}::text AS "metadata"
    FROM "public"."GpsPing"
    WHERE "GpsPing"."tenant_id" = ${tenantId}
      AND "GpsPing"."captured_at" >= ${windowStart} AND "GpsPing"."captured_at" < ${windowEnd}
    ORDER BY "GpsPing"."captured_at" DESC
    LIMIT ${limit}
  `).then((rows) => rows.map(toRow));
}

// `base64_data` de ActivityEvidence es una columna de texto, no jsonb: la proyeccion es
// la misma regla (cabecera + marca + md5) aplicada sobre la columna.
function readRouteActivityEvidence(prisma, tenantId, routeId) {
  const marker = Prisma.raw(`CASE WHEN "ActivityEvidence"."base64_data" IS NULL THEN NULL `
    + `ELSE left("ActivityEvidence"."base64_data", ${HEADER_KEEP}) || '${SHA_MARK}' `
    + `|| md5("ActivityEvidence"."base64_data") END`);
  return prisma.$queryRaw(Prisma.sql`
    SELECT "ActivityEvidence"."id" AS "id",
           "ActivityEvidence"."activity_id" AS "activity_id",
           "ActivityEvidence"."evidence_type" AS "evidence_type",
           "ActivityEvidence"."file_name" AS "file_name",
           "ActivityEvidence"."file_url" AS "file_url",
           "ActivityEvidence"."storage_path" AS "storage_path",
           "ActivityEvidence"."mime_type" AS "mime_type",
           "ActivityEvidence"."file_size" AS "file_size",
           ${marker} AS "base64_data"
    FROM "public"."ActivityEvidence"
    WHERE "ActivityEvidence"."tenant_id" = ${tenantId}
      AND "ActivityEvidence"."activity_id" IN (
        SELECT "WorkActivity"."id" FROM "public"."WorkActivity"
        WHERE "WorkActivity"."tenant_id" = ${tenantId} AND "WorkActivity"."route_id" = ${routeId}
      )
    ORDER BY "ActivityEvidence"."id" ASC
  `);
}

// Reemplazo de la lectura de marcaciones sin ruta (fallback del mismo resumen), con las
// mismas ventanas de fecha, el mismo orden y el mismo limite.
function readUnlinkedEvidence(prisma, tenantId, dateWindows) {
  if (!Array.isArray(dateWindows) || !dateWindows.length) return Promise.resolve([]);
  const projection = Prisma.raw(evidenceProjection('"TimePunch"."extra_evidence"'));
  const windows = Prisma.join(dateWindows.map((window) => Prisma.sql`(
      "TimePunch"."date" >= ${window.gte} AND "TimePunch"."date" < ${window.lt})`), " OR ");
  const metadata = Prisma.raw(evidenceFreeMetadata('"TimePunch"."metadata"'));
  return prisma.$queryRaw(Prisma.sql`
    SELECT "TimePunch"."employee_id" AS "employee_id",
           "TimePunch"."user_name" AS "user_name",
           "TimePunch"."type" AS "type",
           "TimePunch"."punched_at" AS "punched_at",
           "TimePunch"."date" AS "date",
           ${metadata}::text AS "metadata",
           ${projection}::text AS "extra_evidence"
    FROM "public"."TimePunch"
    WHERE "TimePunch"."tenant_id" = ${tenantId}
      AND "TimePunch"."route_id" IS NULL
      AND (${windows})
    ORDER BY "TimePunch"."punched_at" DESC
    LIMIT ${UNLINKED_LIMIT}
  `).then((rows) => rows.map(toRow));
}

module.exports = {
  EVIDENCE_PRESENT_MIN_BYTES,
  GPS_COLUMNS,
  HEADER_KEEP,
  METADATA_SHRINK_MIN_BYTES,
  PUNCH_COLUMNS,
  SELF_PUNCH_SELECT,
  SHA_MARK,
  UNLINKED_LIMIT,
  evidenceFreeMetadata,
  evidenceProjection,
  projectEvidence,
  readDayEvidencePunches,
  readDayGpsPings,
  readRouteActivityEvidence,
  readRouteEvidence,
  readRoutePunchEvidence,
  readUnlinkedEvidence,
  shrinkMetadataEvidence,
  shrinkNested,
  shrinkObject
};
