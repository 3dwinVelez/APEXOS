"use strict";

// Contrato del registro tecnico del 4xx: el rechazo tiene que nombrarse solo. Estas dos funciones
// son las unicas que alimentan `code` y `detail` en `platform_logs`, asi que lo que aqui se afirma
// es lo que despues lee el triage.
//
// Se prueba el helper y no `server.js` por la misma razon que `core/api-error.js`: `build()` deja
// handles vivos (cron, websockets, base de datos) y el proceso del test no termina.

const test = require("node:test");
const assert = require("node:assert/strict");

const { rejectionDetailFrom, rejectionFromPayload } = require("../src/fabric/platformLogs");

const SELFIE = "data:image/jpeg;base64," + "A".repeat(4096);

test("el detalle nombra el motivo machine-readable, el campo y los tipos olidos", () => {
  const error = Object.assign(new Error("El contenido del archivo no es una imagen permitida."), {
    statusCode: 400,
    code: "VALIDACION",
    details: {
      evidence_failure_code: "EVIDENCIA_CLASE_RECHAZADA",
      field: "identity_photo",
      declared_mime: "image/jpeg",
      sniffed_mime: "video/mp4",
      byte_length: 512,
      max_bytes: 2097152
    }
  });
  const detail = rejectionDetailFrom(error);
  for (const wanted of [
    "evidence_failure_code=EVIDENCIA_CLASE_RECHAZADA",
    "field=identity_photo",
    "declared_mime=image/jpeg",
    "sniffed_mime=video/mp4",
    "byte_length=512",
    "max_bytes=2097152"
  ]) {
    assert.ok(detail.includes(wanted), `esperaba ${wanted} en "${detail}"`);
  }
});

test("una marcacion fuera de secuencia se nombra por la hora que sigue", () => {
  const error = Object.assign(new Error("La siguiente marcacion permitida es fin_almuerzo."), {
    statusCode: 409,
    code: "MARCACION_FUERA_DE_SECUENCIA",
    details: { expected_type: "fin_almuerzo", punch_type: "salida" }
  });
  const detail = rejectionDetailFrom(error);
  assert.ok(detail.includes("expected_type="), detail);
  assert.ok(detail.includes("punch_type=salida"), detail);
});

test("el detalle jamas arrastra el contenido de la evidencia ni claves fuera de la lista", () => {
  const detail = rejectionDetailFrom({
    details: {
      field: "identity_photo",
      base64_data: SELFIE,
      base64: SELFIE,
      raw: SELFIE,
      payload: SELFIE,
      token: "eyJhbGciOi...",
      password: "secreta",
      normalization_applied: ["whitespace"],
      evidence_failure_code: "EVIDENCIA_NO_DECODIFICABLE"
    }
  });
  assert.equal(detail.includes("base64"), false, detail);
  assert.equal(detail.includes("AAAA"), false, detail);
  assert.equal(detail.includes("eyJ"), false, detail);
  assert.equal(detail.includes("secreta"), false, detail);
  // Un arreglo u objeto no es un valor escalar: se omite en lugar de serializarlo.
  assert.equal(detail.includes("whitespace"), false, detail);
  assert.equal(detail, "evidence_failure_code=EVIDENCIA_NO_DECODIFICABLE field=identity_photo");
});

test("el detalle queda acotado aunque el rechazo traiga claves largas", () => {
  const detail = rejectionDetailFrom({ details: { reason: "x".repeat(5000), field: "identity_photo" } });
  assert.ok(detail.length <= 500, `longitud ${detail.length}`);
  assert.ok(detail.startsWith("reason="), detail);
});

test("un detalle vacio no inventa texto", () => {
  assert.equal(rejectionDetailFrom(null), "");
  assert.equal(rejectionDetailFrom(undefined), "");
  assert.equal(rejectionDetailFrom(new Error("sin detalles")), "");
  assert.equal(rejectionDetailFrom({ details: { unrelated: "valor" } }), "");
});

test("la respuesta ya serializada aporta el codigo y el detalle del 4xx que no se lancio", () => {
  const body = JSON.stringify({
    error: "El archivo supera el tamano maximo permitido (2097152 bytes).",
    code: "VALIDACION",
    request_id: "req-abc",
    details: { evidence_failure_code: "EVIDENCIA_SUPERA_LIMITE", max_bytes: 2097152, byte_length: 4194304 }
  });
  const viaString = rejectionFromPayload(body);
  assert.equal(viaString.code, "VALIDACION");
  assert.ok(viaString.detail.includes("max_bytes=2097152"), viaString.detail);
  assert.ok(viaString.detail.includes("byte_length=4194304"), viaString.detail);
  const viaBuffer = rejectionFromPayload(Buffer.from(body, "utf8"));
  assert.deepEqual(viaBuffer, viaString);
});

test("un cuerpo que no es JSON pequeno se ignora en lugar de romperse", () => {
  assert.deepEqual(rejectionFromPayload(undefined), { code: "", detail: "" });
  assert.deepEqual(rejectionFromPayload(null), { code: "", detail: "" });
  assert.deepEqual(rejectionFromPayload("<html>502 Bad Gateway</html>"), { code: "", detail: "" });
  assert.deepEqual(rejectionFromPayload(JSON.stringify(["a", "b"])), { code: "", detail: "" });
  assert.deepEqual(rejectionFromPayload({ pipe: () => {} }), { code: "", detail: "" });
  assert.deepEqual(rejectionFromPayload(JSON.stringify({ code: "X", blob: "y".repeat(70000) })), { code: "", detail: "" });
});
