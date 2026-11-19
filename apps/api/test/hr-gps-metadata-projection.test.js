const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.NODE_ENV = "test";
process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";

const { GPS_COLUMNS, METADATA_SHRINK_MIN_BYTES, projectEvidence, readDayGpsPings } = require("../src/modules/hr/monitorEvidenceRows");
const serviceSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");

const SCALAR_TYPES = /^(String|Boolean|Int|BigInt|Float|Decimal|DateTime|Json|Bytes)$/;

function gpsPingScalarFields() {
  const schema = fs.readFileSync(path.join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
  const block = schema.match(/\nmodel GpsPing \{([\s\S]*?)\n\}/);
  assert.ok(block, "el schema.prisma no define el modelo GpsPing");
  return block[1].split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
    .filter((line) => SCALAR_TYPES.test(line.split(/\s+/)[1].replace(/[?\[\]]/g, "")))
    .map((line) => line.split(/\s+/)[0]);
}

// El mapa de operaciones paso de `findMany` a una lectura crua para poder proyectar. Ese
// cambio tiene dos formas de romperse en silencio: perder una columna (el agrupamiento del
// mapa lee `employee_name`, `identity_aliases` y `gps_skipped` del metadata, y el cliente
// pinta `user_name`, `route_id`, `captured_at`) y olvidar el `tenant_id` escrito, porque
// `$queryRaw` no pasa por el middleware de `core/prisma.js`.
test("GPS_COLUMNS cubre todo campo escalar de GpsPing en el schema", () => {
  assert.deepEqual([...GPS_COLUMNS].sort(), gpsPingScalarFields().sort());
});

test("la lectura de pings del mapa proyecta la selfie y conserva las demas columnas", async () => {
  const captured = [];
  const db = { $queryRaw: async (query) => { captured.push(query); return []; } };
  const start = new Date("2026-11-18T05:00:00Z");
  const end = new Date("2026-11-19T04:59:59Z");
  const rows = await readDayGpsPings(db, "nyvora", start, end, 300);
  assert.deepEqual(rows, []);
  const { sql, values } = captured[0];
  for (const column of GPS_COLUMNS) {
    if (column === "metadata") continue;
    assert.ok(sql.includes(`"GpsPing"."${column}" AS "${column}"`), `la lectura del GPS perdio la columna ${column}`);
  }
  assert.equal(/"GpsPing"\."metadata" AS "metadata"/.test(sql), false, "metadata del GPS viaja dos veces en la misma fila");
  assert.match(sql, /"GpsPing"\."tenant_id" = \?/, "la lectura crua del GPS no filtra por tenant");
  assert.deepEqual(values, ["nyvora", start, end, 300]);
  // La misma guarda que en `TimePunch`: la fila flaca no se detoasta (el deflector de
  // escritura ya no duplica la selfie, pero las 44 filas hechas antes de ese corte siguen
  // pesando 2,7 MB cada una) y solo se abre la que `pg_column_size` anuncia gorda.
  assert.match(sql, /pg_column_size\("GpsPing"\."metadata"\) > \d+/, "la lectura del GPS dejo de protegerse por el tamano de la fila");
  assert.match(sql, /jsonb_set\("GpsPing"\."metadata", '\{identity_photo\}'/, "el ping vuelve a traer la selfie en claro");
  assert.match(sql, /ORDER BY "GpsPing"\."captured_at" DESC/);
});

test("el mapa lee el GPS del dia y la huella extendida por la lectura proyectada", () => {
  const mapSource = serviceSource.match(/async function getOperationsMap[\s\S]*?(?=\r?\nasync function )/)?.[0] || "";
  assert.ok(mapSource, "no se encontro getOperationsMap en el servicio");
  assert.equal((mapSource.match(/monitorEvidenceRows\.readDayGpsPings/g) || []).length, 2,
    "el mapa dejo de leer por la proyeccion una de sus dos lecturas de GPS");
  assert.doesNotMatch(mapSource, /prisma\.gpsPing\.findMany/, "el mapa vuelve a arrastrar la metadata cruda del GPS");
});

// El contrato de escritura: `TimePunch` es duena del sustento y las filas derivadas del
// mismo evento (ping de GPS, actividad, sesion) no heredan la copia. Medido en produccion
// el 2026-11-18, `GpsPing` guardaba 28,5 MB de `identity_photo` en 44 filas duplicadas de
// los 29,7 MB de `TimePunch`, y ninguna pantalla la lee por el ping.
test("el ping de GPS no guarda una copia del sustento de la marcacion", async () => {
  const selfie = { name: "selfie.jpg", type: "image/jpeg", base64: "data:image/jpeg;base64," + "A".repeat(4096) };
  const created = [];
  const db = {
    runWithTenant: async (tenantId, callback) => callback(),
    employee: { findFirst: async () => ({ id: 7, code: "EMP-7", user_name: "usuario-7", metadata: {} }) },
    gpsPing: { create: async (args) => { created.push(args.data); return { id: 1 }; } }
  };
  const servicePath = require.resolve("../src/modules/hr/service");
  const prismaPath = require.resolve("../src/core/prisma");
  const originalPrisma = require.cache[prismaPath];
  const originalService = require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
  delete require.cache[servicePath];
  let service;
  try {
    service = require(servicePath);
  } finally {
    if (originalPrisma) require.cache[prismaPath] = originalPrisma;
    else delete require.cache[prismaPath];
    if (originalService) require.cache[servicePath] = originalService;
    else delete require.cache[servicePath];
  }
  await service.createGpsPing("nyvora", {
    user_name: "usuario-7",
    latitude: 4.6,
    longitude: -74.1,
    accuracy_meters: 12,
    vehicle_plate: "ABC123",
    source: "mobile",
    captured_at: "2026-11-18T13:00:00Z",
    metadata: {
      source: "apexos-mobile",
      route_code: "336",
      identity_photo: selfie,
      extra_evidence: [{ file_name: "soporte.jpg", base64: selfie.base64 }],
      photo: selfie.base64,
      gps_required: true
    }
  });
  assert.equal(created.length, 1, "no se escribio el ping");
  const metadata = created[0].metadata;
  assert.equal("identity_photo" in metadata, false, "el ping volvio a heredar la selfie de la marcacion");
  assert.equal("extra_evidence" in metadata, false, "el ping volvio a heredar la evidencia extra");
  assert.equal("photo" in metadata, false, "el ping volvio a heredar la foto en claro");
  assert.doesNotMatch(JSON.stringify(metadata), /base64/, "el ping guarda binario en linea");
  // Lo que el mapa si consume sigue llegando intacto.
  assert.equal(metadata.route_code, "336");
  assert.equal(metadata.display_route_id, "336");
  assert.equal(metadata.gps_required, true);
  assert.equal(metadata.employee_code, "EMP-7");
  assert.ok(Array.isArray(metadata.identity_aliases), "el ping perdio sus alias de agrupamiento");
});

// La marcacion si conserva su sustento: proyectarselo en la escritura seria borrar la
// evidencia que la pantalla pide por id (`getMonitorEvidence`) y la que valida la
// identidad (`mobile-identity.publicPunchMetadata`).
test("la marcacion sigue siendo la duena del sustento que se escribe", () => {
  const punchWrite = serviceSource.match(/const punch = await tx\.timePunch\.create\(\{[\s\S]*?\n {4}\}\);/)?.[0] || "";
  assert.ok(punchWrite, "no se encontro la escritura de la marcacion");
  assert.match(punchWrite, /routeEventMetadata\(input, route\?\.id \|\| inputRouteId, \{ owner: true \}\)/,
    "la marcacion dejo de declararse duena de su evidencia");
  assert.equal((serviceSource.match(/\{ owner: true \}/g) || []).length, 1,
    "mas de una fila se declara duena del sustento");
});

test("el umbral de guarda de metadata deja las filas flacas sin detoastear", () => {
  // Medido en produccion el 2026-11-18: `GpsPing.metadata` promedia 4.761 B sobre 6.522
  // filas y `identity_photo` aparece en 44 de ellas con 2.699.051 B la peor. Un umbral por
  // encima de la media deja el 99 % de las filas como estaba (cero detoast) y abre solo la
  // fila que trae binario.
  assert.ok(METADATA_SHRINK_MIN_BYTES > 4761 && METADATA_SHRINK_MIN_BYTES < 75_000,
    `el umbral (${METADATA_SHRINK_MIN_BYTES}) dejo de separar la fila flaca de la que trae selfie`);
});
