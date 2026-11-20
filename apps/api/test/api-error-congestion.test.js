// Como responde el API cuando la base esta congestionada. Estos tres codigos de Prisma no
// significan "el dato esta mal" sino "el servidor no dio abasto en este instante": mientras
// el mapper no los conocio, caian al 500 generico y el operario leia "Error interno" y el
// cliente "el API se cayo" (marcacion y mallas, y el 500 de POST /hr/routes del 2026-10-26).
// El contrato es 503 + codigo propio + Retry-After, y lo que no esta declarado sigue siendo
// 500 sin filtrar el detalle tecnico.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { mapApiError } = require("../src/core/api-error");

const request = { url: "/api/v1/hr/routes", method: "POST", user: { id: 7, tenant_id: "t-1" } };
const call = (code) => mapApiError(Object.assign(new Error("PrismaClientKnownRequestError: Transaccion muerta"), { code }), request, "req-congestion");

test("congestion: los tres codigos de Prisma se responden 503 con su codigo y su presupuesto", () => {
  const esperado = {
    P2024: ["BASE_OCUPADA", 2],
    P2028: ["TRANSACCION_INTERRUMPIDA", 2],
    P2034: ["CONFLICTO_DE_ESCRITURA", 1]
  };
  for (const [code, [resuelto, retryAfter]] of Object.entries(esperado)) {
    const outcome = call(code);
    assert.equal(outcome.statusCode, 503, `${code} no puede llegar como 500: se lee como caida nuestra`);
    assert.equal(outcome.payload.code, resuelto, `${code} perdio su codigo`);
    assert.equal(outcome.payload.retry_after, retryAfter, `${code} no anuncia cuando se puede reintentar`);
    assert.equal(outcome.retryAfter, retryAfter, "la cabecera retry-after sale del mismo numero que el cuerpo");
    assert.equal(outcome.payload.request_id, "req-congestion", "la referencia para soporte se conserva");
    assert.equal(outcome.log, undefined, "la congestion es un fallo esperado: no se registra como caida");
  }
});

test("congestion: el mensaje que ve el operario no contiene el detalle tecnico", () => {
  for (const code of ["P2024", "P2028", "P2034"]) {
    const cuerpo = JSON.stringify(call(code).payload);
    assert.ok(!/PrismaClient|Transaccion muerta|P20\d\d/.test(cuerpo), `${code} filtro su detalle al cliente: ${cuerpo}`);
  }
});

// Control de contraste: el mapper nuevo no puede tragarse lo que ya estaba declarado, que es
// justo lo que el cliente distingue para saber si reintentar o corregir el dato.
test("congestion: un 503 declarado por un servicio conserva su mensaje y no recibe retry-after", () => {
  const outcome = mapApiError(
    Object.assign(new Error("No fue posible confirmar la marcacion por alta concurrencia. Se reintentara automaticamente."), {
      statusCode: 503,
      code: "MARCACION_CONCURRENCIA_TEMPORAL"
    }),
    request,
    "req-marcacion"
  );
  assert.equal(outcome.statusCode, 503);
  assert.equal(outcome.payload.code, "MARCACION_CONCURRENCIA_TEMPORAL");
  assert.equal(outcome.payload.error, "No fue posible confirmar la marcacion por alta concurrencia. Se reintentara automaticamente.");
  assert.equal(outcome.retryAfter, undefined, "un fallo que ya decide su politica no recibe presupuesto ajeno");
});

test("congestion: lo que no es congestion sigue bajando a 500 sin filtrar detalle", () => {
  const outcome = mapApiError(new RangeError("stack depth overflow"), request, "req-otro");
  assert.equal(outcome.statusCode, 500);
  assert.equal(outcome.payload.code, "ERROR_INTERNO");
  assert.ok(!/stack depth/.test(JSON.stringify(outcome.payload)));
  assert.equal(outcome.log.err.message, "stack depth overflow");
});

test("congestion: P2002 y P2025 no se volvieron reintento", () => {
  assert.equal(call("P2002").statusCode, 409, "un duplicado reintentado sigue siendo duplicado");
  assert.equal(call("P2025").statusCode, 404);
});

// El mapper devuelve el numero; la cabecera la pone el handler. Sin esta linea el contrato
// seria "el servidor lo sabe" y el cliente seguiria reintentando a ciegas.
test("congestion: el handler traduce outcome.retryAfter en la cabecera retry-after", () => {
  const fuente = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  assert.match(fuente, /reply\.header\("retry-after", String\(outcome\.retryAfter\)\)/);
});
