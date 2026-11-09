import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "app/dashboard/administracion/suscripciones/page.tsx");
const source = fs.readFileSync(pagePath, "utf8");

test("los dialogos de empresa usan ModalFrame portado y no capas fixed inline", () => {
  assert.match(source, /import \{ ModalFrame \} from "@\/components\/ui\/ModalFrame"/);
  assert.doesNotMatch(source, /className="fixed inset-0/);
  assert.equal((source.match(/<ModalFrame/g) || []).length, 3);
});

test("crear y editar envian su formulario desde el pie del modal", () => {
  assert.match(source, /form="company-create-form"/);
  assert.match(source, /id="company-create-form"/);
  assert.match(source, /form="company-edit-form"/);
  assert.match(source, /id="company-edit-form"/);
  assert.match(source, /title="Crear empresa"/);
  assert.match(source, /title="Editar empresa"/);
  assert.match(source, /title="Inactivar empresa"/);
});
