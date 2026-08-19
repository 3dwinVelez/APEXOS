import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modules = fs.readFileSync(path.resolve(here, "..", "lib", "modules.ts"), "utf8");
const guard = fs.readFileSync(path.resolve(here, "..", "components", "shell", "RouteAccessGuard.tsx"), "utf8");

test("the Nyvora visual gate covers every operational module in the certified route sweep", () => {
  for (const [code, slug] of [
    ["M-01", "inventario"], ["M-02", "compras"], ["M-03", "ventas"], ["M-04", "facturacion"],
    ["M-06", "cxc"], ["M-07", "contabilidad"], ["M-14", "transporte"], ["M-17", "talento-humano"],
    ["M-19", "proyectos"], ["M-22", "administracion"], ["M-26", "servicios"], ["AI-CORE", "apex-ai"]
  ]) {
    assert.match(modules, new RegExp(`id: "${code}"[\\s\\S]{0,80}slug: "${slug}"`));
  }
  assert.match(guard, /Acceso no autorizado/);
  assert.match(guard, /access\.bySlug\[slug\] === true/);
});
