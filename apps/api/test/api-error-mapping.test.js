// Que responde el API cuando un servicio lanza. Un fallo de dependencia declarado
// (502 almacen caido, 503 sin configuracion, 504 sin tiempo) tiene que llegar al cliente
// con su estado y su codigo; si cae al 500 generico el usuario lee "el API se cayo" y no
// sabe si reiniciar o si su archivo estaba mal. Ahi vive el defecto del banner de Comercio
// (2026-11-06): el almacen estaba apagado y el panel decia "Error interno".
const assert = require("node:assert/strict");
const test = require("node:test");

const { mapApiError } = require("../src/core/api-error");

const request = { url: "/api/v1/comercio/settings/storefront/banner", method: "POST", user: { id: 1, tenant_id: "t-1" } };
const call = (error) => mapApiError(error, request, "req-prueba");

test("mapeo: el almacen caido se responde 502 con su codigo legible", () => {
  const outcome = call(Object.assign(new Error("El almacén de imágenes no responde."), { statusCode: 502, code: "ALMACEN_NO_RESPONDE" }));
  assert.equal(outcome.statusCode, 502, "un 502 declarado no puede llegar como 500");
  assert.deepEqual(outcome.payload, { error: "El almacén de imágenes no responde.", code: "ALMACEN_NO_RESPONDE", request_id: "req-prueba" });
  assert.equal(outcome.log, undefined, "un fallo esperado no es una caida del API: no se loguea como tal");
});

test("mapeo: el generador sin cuota y el almacen sin configurar conservan su estado", () => {
  for (const [statusCode, code] of [[503, "ALMACENAMIENTO_NO_CONFIGURADO"], [504, "IMAGEGEN_UNAVAILABLE"], [502, "IMAGEGEN_UNAVAILABLE"]]) {
    const outcome = call(Object.assign(new Error("mensaje"), { statusCode, code }));
    assert.equal(outcome.statusCode, statusCode, `${code} se deformo`);
    assert.equal(outcome.payload.code, code);
  }
});

// El codigo es lo que distingue "un servicio decidio responder 502" de un error de un
// pedazo cualquiera del stack. Sin esa condicion cualquiera podria filtrar internals.
test("mapeo: un 502 sin codigo sigue siendo error interno", () => {
  const outcome = call(Object.assign(new Error("detalle interno"), { statusCode: 502 }));
  assert.equal(outcome.statusCode, 500);
  assert.equal(outcome.payload.code, "ERROR_INTERNO");
  assert.ok(!/detalle interno/.test(JSON.stringify(outcome.payload)), "el mensaje tecnico no se filtra al cliente");
  assert.equal(outcome.log.err.message, "detalle interno", "pero si queda en el log con su request id");
  assert.equal(outcome.log.requestId, "req-prueba");
});

test("mapeo: una excepcion inesperada se convierte en 500 y se registra", () => {
  const outcome = call(new TypeError("fetch failed"));
  assert.equal(outcome.statusCode, 500);
  assert.equal(outcome.payload.error, "Error interno");
  assert.equal(outcome.log.url, request.url);
  assert.equal(outcome.log.tenantId, "t-1");
});

test("mapeo: los 4xx del negocio siguen saliendo con su mensaje y su detalle", () => {
  const conflicto = call(Object.assign(new Error("Horario solapado"), { statusCode: 409, code: "MALLA_SOLAPADA", details: { tramos: 2 } }));
  assert.equal(conflicto.statusCode, 409);
  assert.deepEqual(conflicto.payload.details, { tramos: 2 }, "el diagnostico estructurado es parte del contrato del cliente");

  assert.equal(call(Object.assign(new Error("duplicado"), { code: "P2002" })).statusCode, 409);
  assert.equal(call(Object.assign(new Error("no esta"), { code: "P2025" })).statusCode, 404);
});
