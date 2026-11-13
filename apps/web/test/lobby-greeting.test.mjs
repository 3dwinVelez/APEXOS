import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("el saludo del hero nombra al usuario con avatar y nombre destacado", () => {
  const page = read("app/dashboard/page.tsx");
  assert.match(page, /className="apex-lobby-eyebrow"/);
  assert.match(page, /<Avatar aria-hidden="true" className="apex-lobby-eyebrow-avatar" name=\{displayName\}/);
  assert.match(page, /Bienvenido, <strong className="apex-lobby-eyebrow-name">\{displayName\}<\/strong>/);
  assert.match(page, /apex-lobby-eyebrow-company/);
  assert.match(page, /· \{companyName\}/, "la empresa sigue presente junto al nombre");
});

test("el saludo sube de tamaño sin desbordar el chip", () => {
  const css = read("app/globals.css");
  const start = css.indexOf(".apex-lobby-eyebrow {");
  assert.ok(start >= 0, "falta el bloque del saludo en globals.css");
  const block = css.slice(start, css.indexOf(".apex-lobby-accent", start));
  assert.match(block, /\.apex-lobby-eyebrow-name \{[^}]*font-size: 1\.1875rem;/s);
  assert.match(block, /\.apex-lobby-eyebrow-name \{[^}]*font-weight: 700;/s);
  assert.match(block, /\.apex-lobby-eyebrow-copy \{[^}]*font-size: 0\.875rem;/s);
  assert.match(block, /\.apex-lobby-eyebrow-avatar \{[^}]*width: 2\.25rem;[^}]*height: 2\.25rem;/s);
  assert.match(block, /\.apex-lobby-eyebrow \{[^}]*max-width: 100%;/s);
  assert.match(block, /\.apex-lobby-eyebrow \{[^}]*align-self: flex-start;/s, "el chip se ajusta a su contenido y no estira la columna");
  assert.match(block, /\.apex-lobby-eyebrow-copy \{[^}]*min-width: 0;/s);
  assert.doesNotMatch(block, /position: fixed|position: absolute/, "el saludo no sale del flujo del hero");
});
