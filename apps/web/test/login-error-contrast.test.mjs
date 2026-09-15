import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("login usa una clase dedicada para errores de autenticacion", () => {
  const source = read("app/login/page.tsx");
  assert.match(source, /apex-login-error/);
  assert.doesNotMatch(source, /text-rose-200" id="login-error"/);
});

test("mensaje de error del login tiene contraste propio en tema claro y oscuro", () => {
  const css = read("app/globals.css");
  assert.match(css, /html\[data-theme="light"\] \.apex-login-error/);
  assert.match(css, /color: #9f1239/);
  assert.match(css, /background: #fff1f3/);
  assert.match(css, /html\[data-theme="dark"\] \.apex-login-error/);
  assert.match(css, /color: #fecdd3/);
});
