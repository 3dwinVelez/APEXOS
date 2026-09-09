import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("la presencia se aísla por empresa y sesión de navegador", () => {
  const source = read("components/system/CollaborationPresence.tsx");
  assert.match(source, /apexos_company_id/);
  assert.match(source, /apex_collaboration_tab/);
  assert.match(source, /BroadcastChannel/);
  assert.match(source, /apex-collaboration:/);
});

test("la colaboración comunica presencia, edición y salida", () => {
  const source = read("components/system/CollaborationPresence.tsx");
  assert.match(source, /PresenceState = "viewing" \| "editing"/);
  assert.match(source, /focusin/);
  assert.match(source, /pagehide/);
  assert.match(source, /Edición concurrente/);
  assert.match(source, /aria-live="assertive"/);
});

test("el canal no transmite contenido de formularios y expira sesiones", () => {
  const source = read("components/system/CollaborationPresence.tsx");
  assert.match(source, /staleMs = 16_000/);
  assert.doesNotMatch(source, /FormData/);
  assert.match(source, /no comparte el contenido de los formularios/);
});

test("la presencia está disponible globalmente en el dashboard", () => {
  assert.match(read("components/shell/DashboardChrome.tsx"), /<CollaborationPresence \/>/);
});
