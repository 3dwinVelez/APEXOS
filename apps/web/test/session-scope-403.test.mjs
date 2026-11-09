import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Certificacion del incidente 2026-11-08 en produccion: el usuario maestro abra Administracion y
// el sistema lo expulsa a /login. La causa no fue el token: la API respondio 401 porque la cuenta
// no tenia empresa asociada, y el cliente trata cualquier 401 como sesion muerta. El contrato que
// fija este archivo es que un 403 de contexto se EXPLICA y nunca borra la sesion.

const here = path.dirname(fileURLToPath(import.meta.url));
const api = fs.readFileSync(path.resolve(here, "../lib/api.ts"), "utf8");

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `debe existir ${signature}`);
  const fromStart = source.slice(start);
  const end = fromStart.search(/\n\}[ \t]*\r?\n/);
  assert.ok(end > 0, `${signature} debe cerrar a nivel de columna cero`);
  return fromStart.slice(0, end);
}

const messageFor = functionBody(api, "function requestErrorMessage(");

test("los codigos de contexto de empresa estan declarados como grupo", () => {
  const declaration = api.match(/const SESSION_SCOPE_CODES = \[[^\]]*\]/);
  assert.ok(declaration, "debe existir la lista SESSION_SCOPE_CODES");
  for (const code of ["EMPRESA_REQUERIDA", "EMPRESA_NO_VINCULADA", "EMPRESA_NO_AUTORIZADA"]) {
    assert.ok(declaration[0].includes(code), `${code} debe estar en la lista`);
  }
  assert.equal((declaration[0].match(/"/g) || []).length, 6, "tres codigos, sin duplicados");
});

test("el 403 de empresa dice que falta la empresa y afirma que la sesion sigue activa", () => {
  assert.ok(messageFor.includes("SESSION_SCOPE_CODES.includes(code)"), "debe ramificar antes del 403 generico");
  const scopeBranch = messageFor.slice(messageFor.indexOf("SESSION_SCOPE_CODES.includes(code)"));
  const line = scopeBranch.slice(0, scopeBranch.indexOf("\n"));
  assert.match(line, /empresa activa asociada/, "debe nombrar la empresa que falta");
  assert.match(line, /sesi[oó]n sigue activa/, "debe afirmar que no lo sacó de la sesion");
  assert.ok(
    messageFor.indexOf("SESSION_SCOPE_CODES.includes(code)") < messageFor.indexOf('if (status === 403) return writing'),
    "la rama especifica tiene que ganarles al 403 generico"
  );
});

test("el rol sin definir tambien se explica y no se disfraza de permiso negado", () => {
  assert.match(messageFor, /403 && code === "ROL_NO_DEFINIDO"/, "el codigo nuevo necesita su mensaje");
  assert.match(messageFor, /no tiene un rol definido/, "debe decir que falta el rol");
});

test("ningun 403 puede borrar la sesion: clearSession solo vive en las ramas de 401", () => {
  const ocurrencias = [];
  let index = api.indexOf("clearSession(");
  while (index >= 0) {
    ocurrencias.push(index);
    index = api.indexOf("clearSession(", index + 1);
  }
  assert.ok(ocurrencias.length >= 2, "debe existir al menos el 401 del fetch autorizado y el del api()");
  for (const position of ocurrencias) {
    const contexto = api.slice(Math.max(0, position - 600), position);
    assert.match(contexto, /401/, `la expulsion de sesion en el offset ${position} no esta bajo una rama 401`);
    assert.doesNotMatch(contexto.slice(contexto.lastIndexOf("401")), /status === 403/, "un 403 no puede caer en clearSession");
  }
});

test("el 401 sigue siendo sesion muerta y el 403 generico conserva su contrato", () => {
  assert.match(messageFor, /if \(status === 401\) return "Tu sesi[oó]n venci[oó]/, "el 401 real no se relaja");
  assert.match(messageFor, /No tienes permiso para ver esta informaci[oó]n/, "el 403 generico no puede desaparecer");
});
