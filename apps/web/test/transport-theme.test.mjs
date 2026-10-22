import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
test('los diálogos heredan la paleta y el esquema activo sin fijar el tema claro', () => {
  for (const file of ['RateCostDesigner.module.css', 'SettlementDialog.module.css']) {
    const css = read(`../components/transport/${file}`);
    assert.doesNotMatch(css, /--(?:surface|text-|color-)[\w-]*\s*:/, file);
    assert.doesNotMatch(css, /color-scheme:\s*light|#[\da-f]{3,8}\b|background:\s*white/i, file);
    assert.match(css, /background: rgb\(var\(--surface\)\)/);
    assert.doesNotMatch(css, /color-scheme:/);
  }
});
test('planeación y portales no fuerzan fondos claros en modo oscuro', () => {
  const planning = read('../app/dashboard/transporte/planeacion/page.tsx');
  const global = read('../app/globals.css');
  assert.doesNotMatch(planning, /\[&_.*\]:!|bg-\[#|text-\[#/);
  assert.doesNotMatch(global, /html\.dark \.transport-planning-modal/);
  assert.match(read('../components/transport/TransportSearchSelect.tsx'), /bg-surface/);
  assert.match(global, /\.transport-map\.leaflet-container \.leaflet-popup-content-wrapper/);
});
test('las superficies neutrales de Transporte usan tokens en vez de depender de parches globales o del tema del sistema operativo', () => {
  function audit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) audit(url);
      else if (entry.name.endsWith('.tsx')) assert.doesNotMatch(fs.readFileSync(url, 'utf8'), /\bbg-white\b|\btext-neutral-[4-9]00\b|\bdark:(?:bg|text)-/, url.pathname);
    }
  }
  audit(new URL('../app/dashboard/transporte/', import.meta.url));
  audit(new URL('../components/transport/', import.meta.url));
});
