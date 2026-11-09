const test = require("node:test");
const assert = require("node:assert/strict");

const { bucketInexistente } = require("../../../scripts/ensure-comercio-assets-bucket");

// Medido en produccion el 2026-11-08: Supabase responde un bucket que no existe con HTTP 400
// y `NoSuchBucket` en el cuerpo, no con el 404 limpio que el script esperaba. El script abortaba
// con `GET bucket -> 400` justo antes de poder crearlo.
test("un bucket inexistente se reconoce tambien cuando el borde lo envuelve en HTTP 400", () => {
  assert.equal(bucketInexistente({
    status: 400,
    payload: { statusCode: "404", error: "Bucket not found", code: "NoSuchBucket" }
  }), true);
  assert.equal(bucketInexistente({ status: 404, payload: { message: "Bucket not found" } }), true);
});

test("un bucket presente o un rechazo de credencial no se confunden con bucket ausente", () => {
  assert.equal(bucketInexistente({ status: 200, payload: { public: true } }), false);
  assert.equal(bucketInexistente({ status: 401, payload: { message: "invalid apikey" } }), false);
  // Un 400 de otra causa tampoco autoriza a crear: creeria sobre un estado no comprendido.
  assert.equal(bucketInexistente({ status: 400, payload: { message: "Invalid path" } }), false);
});
