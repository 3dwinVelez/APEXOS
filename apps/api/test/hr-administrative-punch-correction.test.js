"use strict";

// Se require `service` sin redis ni base: el mismo arreglo que usan las pruebas hermanas.
process.env.DISABLE_REDIS = "true";
process.env.REDIS_DISABLED = "true";

// Contrato de la escalera de marcacion y de su unica excepcion.
//
// Por que se prueba aqui y no por HTTP: `build()` de server.js deja handles vivos (cron,
// websockets, la conexion a la base) y el proceso del test no termina -la misma razon que obligo
// a sacar la traduccion de errores a `core/api-error.js`-. La decision es una funcion pura
// (`service.__resolvePunchLadder`) y el ambito (`ownScope`) lo fija la ruta, no el payload.
//
// Lo que se garantiza con esto es la frase del dueno del producto del 2026-11-19: "no debe estar
// rechazando marcaciones". El control de asistencia sigue intacto para el operario; lo que se abre
// es una via sancionada, con motivo y autor, para cerrar una jornada a la que le falta un eslabon
// (medido en produccion: 39 rechazos de escalera sobre 14 operarios, sin boton que los destrabara).

const test = require("node:test");
const assert = require("node:assert/strict");

const service = require("../src/modules/hr/service");

const ladder = service.__resolvePunchLadder;

test("el canal propio nunca puede declararse correccion administrativa", () => {
  // El payload del operario puede traer la bandera (o el metadata): el ambito lo fija el servidor,
  // asi que la escalera le sigue mandando y el rechazo conserva su codigo.
  const smuggled = ladder({
    ownScope: true,
    expectedType: "salida",
    type: "entrada",
    input: { correccion_administrativa: true, motivo_correccion: "me fui sin marcar", metadata: { correccion_administrativa: true } }
  });
  assert.equal(smuggled, null);
});

test("sin declaracion explicita manda la escalera en la ruta administrativa", () => {
  assert.equal(ladder({ ownScope: false, expectedType: "salida", type: "entrada", input: {} }), null);
  assert.equal(ladder({ ownScope: false, expectedType: null, type: "salida", input: { metadata: { fuente: "planilla" } } }), null);
});

test("una correccion sin motivo se rechaza con codigo y campo", () => {
  assert.throws(
    () => ladder({ ownScope: false, expectedType: "salida", type: "entrada", input: { correccion_administrativa: true } }),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.equal(error.code, "MOTIVO_CORRECCION_REQUERIDO");
      assert.equal(error.details.field, "motivo_correccion");
      return true;
    }
  );
  // El motivo en blanco no cuenta como motivo.
  assert.throws(
    () => ladder({ ownScope: false, expectedType: "salida", type: "entrada", input: { correccion_administrativa: true, motivo_correccion: "   " } }),
    { code: "MOTIVO_CORRECCION_REQUERIDO" }
  );
});

test("la correccion nombra que esperaba la escalera", () => {
  const hueco = ladder({ ownScope: false, expectedType: "fin_almuerzo", type: "salida", input: { correccion_administrativa: true, motivo_correccion: "salio sin marcar el almuerzo" } });
  assert.equal(hueco.salto, "esperada:fin_almuerzo");
  assert.equal(hueco.motivo, "salio sin marcar el almuerzo");

  const jornadaCerrada = ladder({ ownScope: false, expectedType: null, type: "salida", input: { correccion_administrativa: true, motivo_correccion: "cierre tardio autorizado" } });
  assert.equal(jornadaCerrada.salto, "jornada_completa");

  // Un administrador que declara la correccion sobre una marcacion que estaba en orden igual queda
  // trazado: el sello existe para que la fila no se lea como marcacion del operario.
  const enOrden = ladder({ ownScope: false, expectedType: "salida", type: "salida", input: { correccion_administrativa: true, motivo_correccion: "rehace la salida borrada" } });
  assert.equal(enOrden.salto, "en_orden");
});

test("el motivo se acota: no es un vertedero de texto", () => {
  const larga = ladder({ ownScope: false, expectedType: "salida", type: "entrada", input: { correccion_administrativa: true, motivo_correccion: "x".repeat(900) } });
  assert.equal(larga.motivo.length, 300);
});

test("la bandera tambien se acepta dentro de metadata (el canal que usa la app)", () => {
  const via = ladder({ ownScope: false, expectedType: "salida", type: "entrada", input: { metadata: { correccion_administrativa: true, motivo_correccion: "planilla del supervisor" } } });
  assert.equal(via.motivo, "planilla del supervisor");
  assert.equal(via.salto, "esperada:salida");
});
