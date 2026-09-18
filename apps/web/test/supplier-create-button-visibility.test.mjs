import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("el botón de nuevo proveedor conserva fondo visible con tokens RGB", () => {
  const page = read("app/dashboard/compras/proveedores/page.tsx");
  const styles = read("app/globals.css");
  assert.match(page, /className="btn-primary"/);
  assert.match(page, /<Plus size=\{16\}\/> Nuevo proveedor/);
  assert.match(styles, /\.btn-primary\s*\{\s*background:\s*rgb\(var\(--color-apex,/);
  assert.doesNotMatch(styles, /\.btn-primary\s*\{\s*background:\s*var\(--color-apex/);
});
