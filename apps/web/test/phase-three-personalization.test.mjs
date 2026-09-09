import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("las preferencias se aíslan por usuario y persisten densidad y fuente", () => {
  const source = read("components/system/ExperiencePreferences.tsx");
  assert.match(source, /apex_experience_v1/);
  assert.match(source, /user_email/);
  assert.match(source, /dataset\.density/);
  assert.match(source, /dataset\.fontScale/);
  assert.match(source, /dataset\.contrast/);
  assert.match(source, /dataset\.reducedMotion/);
  assert.match(source, /localStorage\.setItem\(storageKey\(\)/);
});

test("el panel integra tema favoritos y vistas con estado accesible", () => {
  const source = read("components/system/ExperiencePreferences.tsx");
  assert.match(source, /apex_theme/);
  assert.match(source, /aria-pressed=\{favorite\}/);
  assert.match(source, /aria-pressed=\{viewSaved\}/);
  assert.match(source, /window\.location\.search/);
  assert.match(source, /Accesos personales/);
});

test("densidad y escala tipográfica tienen reglas globales", () => {
  const styles = read("app/globals.css");
  assert.match(styles, /data-font-scale="small"/);
  assert.match(styles, /data-font-scale="large"/);
  assert.match(styles, /data-density="compact"/);
  assert.match(styles, /data-contrast="high"/);
  assert.match(styles, /data-reduced-motion="true"/);
});

test("el panel está disponible globalmente en el dashboard", () => {
  assert.match(read("components/shell/DashboardChrome.tsx"), /<ExperiencePreferences \/>/);
});
