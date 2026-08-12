import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/servicios/solicitar/page.tsx", import.meta.url), "utf8");

test("el formulario presenta un progreso compacto y accesible", () => {
  assert.match(source, /aria-label="Progreso de la solicitud"/);
  assert.match(source, /aria-current=\{active \? "step" : undefined\}/);
  assert.match(source, /disabled=\{index > step\}/);
  assert.match(source, /Continuar a \{steps\[step \+ 1\]\.shortTitle\}/);
});

test("cada producto conserva controles claros e independientes", () => {
  assert.match(source, /Referencia del producto \*/);
  assert.match(source, /Reducir cantidad del producto/);
  assert.match(source, /Aumentar cantidad del producto/);
  assert.match(source, /value=\{requestItem\.observation\}/);
  assert.match(source, /Añadir otro producto/);
  assert.match(source, /Eliminar producto/);
});

test("la estructura móvil evita anchos fijos para campos y acciones", () => {
  assert.match(source, /grid-cols-4/);
  assert.match(source, /w-full.*sm:w-auto/);
  assert.doesNotMatch(source, /lg:grid-cols-\[300px_minmax\(0,1fr\)\]/);
});
