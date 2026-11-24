'use strict';
// La marcacion de la web tiene que pasar por UNA sola compuerta de identidad.
// Produccion se cayo en noviembre porque existieron dos: `verifyPunchIdentity` (que
// degradaba la foto rechazada y dejaba marcar la hora) y `webPunchSelfie.js`, nacida
// directamente en `develop` sin pasar nunca por `desarrollo`, que se ejecutaba tres
// lineas antes, aplicaba la regla vieja de etiqueta-vs-bytes y renombraba todo como
// SELFIE_INVALIDA. La segunda compuerta hacia inalcanzable a la primera, asi que el
// arreglo desplegado no podia actuar.
//
// Este archivo no prueba comportamiento: prueba la estructura del camino. Falla apenas
// aparece una segunda compuerta, aunque funcione.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const GATE_FILE = 'src/modules/hr/webPunchSelfie.js';
const SERVICE_FILE = 'src/modules/hr/service.js';
const IDENTITY_FILE = 'src/modules/hr/mobile-identity.js';
// Motivos de rechazo propios de una compuerta alterna. El contrato legitimo del modulo
// de identidad mantiene el codigo de negocio en VALIDACION y manda el motivo machine-
// readable en details.evidence_failure_code; una etiqueta suelta en la respuesta es la
// firma de quien volvio a decidir la selfie en otro sitio.
const ALTERNATE_GATE_CODES = ['SELFIE_INVALIDA', 'SELFIE_REQUERIDA'];

function readIfExists(rootDir, relative) {
  const absolute = path.join(rootDir, relative);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
}

function findAlternateSelfieGates(rootDir) {
  const problems = [];
  if (fs.existsSync(path.join(rootDir, GATE_FILE))) {
    problems.push(`existe una segunda compuerta de selfie: ${GATE_FILE}`);
  }
  const service = readIfExists(rootDir, SERVICE_FILE);
  if (service === null) {
    problems.push(`no existe ${SERVICE_FILE}: la guarda perdio de vista el camino de marcacion`);
    return problems;
  }
  if (/webPunchSelfie/.test(service)) {
    problems.push(`${SERVICE_FILE} vuelve a requerir una compuerta alterna de selfie`);
  }
  const identityCalls = service.match(/verifyPunchIdentity\s*\(/g) || [];
  if (identityCalls.length !== 1) {
    problems.push(`la marcacion debe llamar a verifyPunchIdentity exactamente una vez, se cuentan ${identityCalls.length}`);
  }
  for (const code of ALTERNATE_GATE_CODES) {
    // mobile-identity.js nombra SELFIE_REQUERIDA en su propia compuerta; ahi es contrato,
    // no duplicado. Que el servicio dictamine el mismo motivo es un segundo criterio
    // sobre la misma foto, y deja de ser interpretable para el administrador.
    if (service.includes(`"${code}"`) || service.includes(`'${code}'`)) {
      problems.push(`el motivo ${code} se dictamina fuera de mobile-identity.js: ${SERVICE_FILE}`);
    }
  }
  return problems;
}

test('la marcacion web no puede volver a tener dos compuertas de selfie', () => {
  const rootDir = path.resolve(__dirname, '..');
  assert.deepEqual(findAlternateSelfieGates(rootDir), []);
});

test('la guarda detecta la compuerta alterna que rompio produccion', () => {
  // Control negativo obligatorio: una asercion sobre la ausencia de un archivo puede
  // volverse vacia si el arbol que mira deja de ser el del servicio. Aqui se reproduce
  // el arbol de `develop` del 20-11 y se exige que la guarda grite.
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexos-selfie-gate-'));
  try {
    fs.mkdirSync(path.join(rootDir, 'src/modules/hr'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, GATE_FILE),
      'const TYPES = new Set([\'entrada\', \'salida\']);\nfunction prepareWebPunchSelfie() {}\nmodule.exports = { prepareWebPunchSelfie };\n'
    );
    fs.writeFileSync(
      path.join(rootDir, SERVICE_FILE),
      'const { prepareWebPunchSelfie } = require("./webPunchSelfie");\n'
        + 'const mobileIdentity = require("./mobile-identity");\n'
        + 'async function createOwnPunch(input) {\n'
        + '  const gated = prepareWebPunchSelfie(input);\n'
        + '  return mobileIdentity.verifyPunchIdentity({ input: gated });\n'
        + '}\n'
    );
    fs.writeFileSync(path.join(rootDir, IDENTITY_FILE), 'module.exports = {};\n');
    const problems = findAlternateSelfieGates(rootDir);
    assert.ok(problems.some((problem) => problem.includes(GATE_FILE)), 'debe nombrar el archivo de la compuerta alterna');
    assert.ok(problems.some((problem) => problem.includes('vuelve a requerir')), 'debe nombrar el require en el servicio');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('la guarda detecta un motivo de selfie dictaminado fuera de la compuerta unica', () => {
  // Segunda deriva: nadie crea un archivo nuevo, simplemente alguien empieza a responder
  // SELFIE_INVALIDA desde el servicio. El rechazo deja de ser interpretable para el
  // administrador y el cliente no sabe si degradar o reintentar.
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexos-selfie-gate-code-'));
  try {
    fs.mkdirSync(path.join(rootDir, 'src/modules/hr'), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, SERVICE_FILE),
      'const mobileIdentity = require("./mobile-identity");\n'
        + 'async function createOwnPunch(input) {\n'
        + '  const error = new Error("no coincide");\n'
        + '  error.code = "SELFIE_INVALIDA";\n'
        + '  throw error;\n'
        + '}\n'
        + 'module.exports = { createOwnPunch: (input) => mobileIdentity.verifyPunchIdentity({ input }) };\n'
    );
    fs.writeFileSync(path.join(rootDir, IDENTITY_FILE), 'module.exports = {};\n');
    const problems = findAlternateSelfieGates(rootDir);
    assert.ok(problems.some((problem) => problem.includes('SELFIE_INVALIDA')), 'debe nombrar el motivo que se dictamina en otro lado');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('la compuerta unica es la que decide en que marcaciones se exige selfie', () => {
  // La regla del "cuando" tiene un solo dueno. El telefono firma el almuerzo sin foto,
  // asi que el conjunto firmado NO puede ensancharse desde ningun otro sitio.
  const rootDir = path.resolve(__dirname, '..');
  const identity = require('../src/modules/hr/mobile-identity');
  assert.deepEqual([...identity.WEB_SELFIE_REQUIRED_TYPES].sort(), ['entrada', 'fin_almuerzo', 'inicio_almuerzo', 'salida']);
  assert.deepEqual([...identity.SELFIE_REQUIRED_TYPES].sort(), ['entrada', 'salida']);
  assert.equal(typeof identity.webSelfieRequiredFor, 'function');
  assert.equal(identity.webSelfieRequiredFor('inicio_almuerzo'), true);
  assert.equal(identity.webSelfieRequiredFor('SALIDA'), true);
  const gate = readIfExists(rootDir, IDENTITY_FILE);
  const declarations = gate.match(/_SELFIE_REQUIRED_TYPES = new Set|SELFIE_REQUIRED_TYPES = new Set/g) || [];
  assert.equal(declarations.length, 2, 'los dos unicos conjuntos de tipos con selfie deben vivir en mobile-identity.js');
});
