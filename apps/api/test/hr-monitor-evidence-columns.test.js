const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.REDIS_DISABLED = "true";
process.env.DISABLE_REDIS = "true";

const { EVIDENCE_PRESENT_MIN_BYTES, PUNCH_COLUMNS, SELF_PUNCH_SELECT, readDayEvidencePunches } = require("../src/modules/hr/monitorEvidenceRows");
const serviceSource = fs.readFileSync(path.resolve(__dirname, "../src/modules/hr/service.js"), "utf8");

// La lectura cruda del mapa de operaciones enumeraba sus columnas a mano. Si el schema
// gana una columna y la lista no, el monitor deja de verla sin que falle nada: el
// agrupamiento por persona o el sustento de la llegada tarde se queda vacio. Este guard
// compara la lista contra `schema.prisma` para que ese olvido rompa la suite.
const SCALAR_TYPES = /^(String|Boolean|Int|BigInt|Float|Decimal|DateTime|Json|Bytes)$/;

function timePunchScalarFields() {
  const schema = fs.readFileSync(path.join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
  const block = schema.match(/\nmodel TimePunch \{([\s\S]*?)\n\}/);
  assert.ok(block, "el schema.prisma no define el modelo TimePunch");
  return block[1].split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@"))
    .filter((line) => SCALAR_TYPES.test(line.split(/\s+/)[1].replace(/[?\[\]]/g, "")))
    .map((line) => line.split(/\s+/)[0]);
}

test("PUNCH_COLUMNS cubre todo campo escalar de TimePunch en el schema", () => {
  assert.deepEqual([...PUNCH_COLUMNS].sort(), timePunchScalarFields().sort());
});

test("la lectura diaria del monitor no abre la evidencia: declara que existe y deja metadata cruda", async () => {
  const captured = [];
  const db = { $queryRaw: async (query) => { captured.push(query); return []; } };
  const day = new Date("2026-11-04T05:00:00Z");
  const end = new Date("2026-11-05T04:59:59Z");
  const rows = await readDayEvidencePunches(db, "nyvora", day, end, 300);
  assert.deepEqual(rows, []);
  const { sql, values } = captured[0];
  for (const column of PUNCH_COLUMNS) {
    // `extra_evidence` no se lee y `metadata` se proyecta como texto (se comprueba abajo).
    if (column === "extra_evidence" || column === "metadata") continue;
    assert.ok(sql.includes(`"TimePunch"."${column}" AS "${column}"`), `la lectura perdio la columna ${column}`);
  }
  assert.equal(/"TimePunch"\."metadata" AS "metadata"/.test(sql), false, "metadata viaja dos veces en la misma fila");
  // Medido el 2026-11-17 sobre una copia con el reparto de produccion: cualquier expresion
  // que abra el jsonb tostado cuesta ~0,6 ms por fila (362 ms sobre 615 filas solo para
  // contar), y reescribirlo llega a 1.047 ms. `pg_column_size` no detoasta: 9,4 ms.
  assert.doesNotMatch(sql, /md5\(|jsonb_set|jsonb_array_elements|jsonb_agg|jsonb_typeof|->>|->/, "la lectura vuelve a abrir el jsonb de la evidencia");
  assert.match(sql, /pg_column_size\("TimePunch"\."extra_evidence"\)/, "la lectura perdio el aviso de evidencia barata");
  assert.match(sql, /AS "has_extra_evidence"/);
  assert.match(sql, /"TimePunch"\."metadata"::text AS "metadata"/, "metadata dejo de viajar cruda");
  assert.match(sql, /"tenant_id" = \?/, "la lectura cruda no filtra por tenant");
  assert.match(sql, /ORDER BY "TimePunch"\."punched_at" DESC/);
  // El umbral se binda primero: va en el SELECT, antes que el WHERE.
  assert.deepEqual(values, [EVIDENCE_PRESENT_MIN_BYTES, "nyvora", day, end, 300]);
});

test("el aviso de evidencia no se inventa un archivo: separa el contenedor vacio de la referencia mas corta", () => {
  // Medido con pg_column_size en PostgreSQL 16: `{}` y `[]` ocupan 8 y el escalar `null` 12,
  // asi que por debajo de 13 el jsonb no anuncia nada. La referencia mas corta que escribe el
  // producto (`{"file_name":"punch-1.png","storage_path":"hr/2026/punch-1.png"}`) mide 75 y una
  // foto de prueba de 68 bytes, 157: las dos deben seguir anunciando su archivo, que es lo que
  // hacia el resumen viejo (monitorEvidenceSummary anuncia `available` por el id de la marcacion).
  assert.ok(EVIDENCE_PRESENT_MIN_BYTES > 12 && EVIDENCE_PRESENT_MIN_BYTES < 75,
    `el umbral de evidencia (${EVIDENCE_PRESENT_MIN_BYTES}) deja de separar un jsonb vacio de una referencia`);
});

// La fila que devuelve Postgres ya no trae `extra_evidence`: el lector tiene que conservar el
// booleano del aviso y seguir parseando `metadata`, porque el agrupamiento del mapa lee de ahi
// las identidades, los alias y `late_minutes`.
test("la fila leida conserva el aviso booleano y la metadata parseada, sin evidencia dentro", async () => {
  const selfie = { type: "image/jpeg", name: "selfie.jpg", size: 20140, base64_data: "data:image/jpeg;base64,AAAA" };
  const db = {
    $queryRaw: async () => [{
      id: 21, tenant_id: "nyvora", employee_id: "EMP-1", user_name: "usuario-1", type: "salida",
      punched_at: new Date("2026-11-04T14:00:00Z"), date: new Date("2026-11-04T05:00:00Z"), time: "09:00",
      latitude: 4.6, longitude: -74.1, accuracy_meters: 12, vehicle_plate: "ABC123", route_id: 7,
      extra_minutes: 0, extra_reason: null, extra_detail: null, idempotency_key: "idem-21", created_at: new Date("2026-11-04T14:00:01Z"),
      metadata: JSON.stringify({ source: "apexos-movil", late_minutes: 12, identity_photo: selfie }),
      has_extra_evidence: true
    }]
  };
  const [row] = await readDayEvidencePunches(db, "nyvora", new Date("2026-11-04T05:00:00Z"), new Date("2026-11-05T04:59:59Z"), 300);
  assert.equal("extra_evidence" in row, false, "la lectura volvio a traer la columna de evidencia");
  assert.equal(row.has_extra_evidence, true);
  assert.equal(row.metadata.late_minutes, 12);
  assert.equal(row.metadata.identity_photo.base64_data, selfie.base64_data, "metadata dejo de parsearse");
});

// La pantalla de marcacion (`/hr/self/attendance` y la jornada que se reconstruye desde las
// marcaciones) tampoco consume la selfie: pinta tipo, hora, placa y ruta. Es la lectura que el
// dueño midio en 12-20 s al abrir un horario, y `extra_evidence` es 106 KB de media por fila.
test("SELF_PUNCH_SELECT es la fila completa menos la evidencia tostada", () => {
  assert.deepEqual(Object.keys(SELF_PUNCH_SELECT).sort(), timePunchScalarFields().filter((column) => column !== "extra_evidence").sort());
  assert.equal(SELF_PUNCH_SELECT.extra_evidence, undefined, "la lectura de la marcacion volvio a pedir la columna tostada");
  assert.equal(SELF_PUNCH_SELECT.metadata, true, "metadata dejo de viajar: la pantalla pierde late_minutes y la identidad");
});

test("las lecturas de la pantalla de marcacion proyectan la fila sin selfie", () => {
  for (const name of ["latestPunchesForEmployee", "listOwnAttendance"]) {
    const source = serviceSource.match(new RegExp(`async function ${name}[\\s\\S]*?(?=\\r?\\nasync function )`))?.[0] || "";
    assert.ok(source, `no se encontro ${name} en el servicio`);
    assert.match(source, /select: SELF_PUNCH_SELECT/, `${name} vuelve a leer la marcacion con la selfie dentro`);
  }
  // Dentro de la transaccion de la marcacion solo se necesita la secuencia de tipos
  // (nextPunchType): llevar los bytes al tx es contencion P2028 a cambio de nada.
  const punchTx = serviceSource.match(/const punchesToday = await tx\.timePunch\.findMany\(\{[\s\S]*?\n {4}\}\);/)?.[0] || "";
  assert.ok(punchTx, "no se encontro la lectura de marcaciones del dia dentro de la transaccion");
  assert.match(punchTx, /select: SELF_PUNCH_SELECT/, "la transaccion de marcacion vuelve a traer la selfie al tx");
});

test("el reporte de asistencia conserva la evidencia porque si la pinta", () => {
  // `reportes/page.tsx` lee `punch.extra_evidence` para pintar la foto de la marcacion y
  // `/api/v1/hr/attendance` es su unica fuente: proyectarla aqui borraría un dato visible.
  const source = serviceSource.match(/async function listAttendance[\s\S]*?(?=\r?\nasync function )/)?.[0] || "";
  assert.ok(source, "no se encontro listAttendance en el servicio");
  assert.doesNotMatch(source, /SELF_PUNCH_SELECT/, "reportes dejo de traer la foto que muestra en pantalla");
});
