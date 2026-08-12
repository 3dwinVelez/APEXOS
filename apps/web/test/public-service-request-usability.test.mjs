import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/servicios/solicitar/page.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("el formulario presenta un progreso compacto y accesible", () => {
  assert.match(source, /aria-label="Progreso de la solicitud"/);
  assert.match(source, /aria-current=\{active \? "step" : undefined\}/);
  assert.match(source, /disabled=\{index > step\}/);
  assert.match(source, /Continuar a \{steps\[step \+ 1\]\.shortTitle\}/);
});

test("cada producto conserva controles claros e independientes", () => {
  assert.match(source, /Referencia del producto \*/);
  assert.match(source, /value=\{requestItem\.observation\}/);
  assert.match(source, /Añadir otro producto/);
  assert.match(source, /Eliminar producto/);
  assert.doesNotMatch(source, /Cantidad \*/);
  assert.match(source, /items: requestItems\.map\(\(item\) => \(\{ \.\.\.item, quantity: 1 \}\)\)/);
});

test("la estructura móvil evita anchos fijos para campos y acciones", () => {
  assert.match(source, /grid-cols-4/);
  assert.match(source, /w-full.*sm:w-auto/);
  assert.doesNotMatch(source, /lg:grid-cols-\[300px_minmax\(0,1fr\)\]/);
});

test("la solicitud publica conserva contraste aunque el panel use tema oscuro", () => {
  assert.match(source, /apex-service-request/);
  assert.doesNotMatch(source, /bg-\[\#f8faf9\]/);
  assert.match(styles, /html\.dark \.apex-service-request \.bg-white/);
  assert.match(styles, /html\.dark \.apex-service-request input/);
});
