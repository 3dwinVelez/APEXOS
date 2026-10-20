import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../components/transport/RateCostDesigner.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, require(name) {
  if (name === 'react') return { useMemo: fn => fn() };
  if (name.endsWith('.module.css')) return { default: {} };
  if (name.startsWith('@/') || name === 'react-leaflet' || name.endsWith('.css')) return {};
  return require(name);
}});
function setup(overrides = {}) {
  let draft = new Proxy({ currency: 'COP', tariff_method: 'fijo', load_unit: 'kg', sim_stops: [], ...overrides }, { get: (obj, key) => obj[key] ?? '' });
  let tree;
  const render = () => { tree = exports.RateCostDesigner({ draft, sedes: [], onChange: patch => { draft = new Proxy({ ...draft, ...patch }, { get: (obj, key) => obj[key] ?? '' }); } }); };
  const nodes = () => { const all = []; function walk(node) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(walk); return; } all.push(node); walk(node.props?.children); } walk(tree); return all; };
  render();
  return { render, nodes, draft: () => draft };
}
test('costos inicialmente vacíos pueden activarse y desactivarse', () => {
  const ui = setup();
  for (const label of ['Peajes', 'Cargue y descargue', 'Otros costos']) {
    ui.nodes().find(n => n.props?.label === label && n.props.onToggle).props.onToggle(true);
    ui.render();
    assert.equal(ui.nodes().find(n => n.props?.label === label && n.props.onToggle).props.enabled, true, label);
    ui.nodes().find(n => n.props?.label === label && n.props.onToggle).props.onToggle(false);
    ui.render();
    assert.equal(ui.nodes().find(n => n.props?.label === label && n.props.onToggle).props.enabled, false, label);
  }
});
test('cambiar a fijo elimina cobros ocultos por distancia y carga', () => {
  const ui = setup({ tariff_method: 'por_km', price_per_km: '5000', price_per_kg: '100', price_per_m3: '200' });
  ui.nodes().find(n => n.type === 'button' && n.key === 'fijo').props.onClick();
  assert.equal(ui.draft().price_per_km, '');
  assert.equal(ui.draft().price_per_kg, '');
  assert.equal(ui.draft().price_per_m3, '');
});

test('paradas vacías no se facturan y dos intermedias más destino menos una incluida cuestan 24000', () => {
  const empty = setup({ base_rate: '85000', price_per_stop: '12000', stops_included: '1', sim_stops: [{ id: 'blank', label: '', latitude: null, longitude: null }] });
  const text = JSON.stringify(empty.nodes().map(n => n.props?.children).filter(c => typeof c === 'string'));
  assert.ok(text.includes('85.000'));
  const selected = setup({ base_rate: '85000', price_per_stop: '12000', stops_included: '1', sim_destination_lat: 6.3, sim_destination_lng: -75.5, sim_stops: [{ id: 'a', latitude: 6.2, longitude: -75.4 }, { id: 'b', latitude: 6.4, longitude: -75.6 }] });
  const values = JSON.stringify(selected.nodes().map(n => n.props?.children).filter(c => typeof c === 'string'));
  assert.ok(values.includes('109.000'));
  assert.ok(values.includes('24.000'));
});

test('guardar y reabrir preserva configuración de combustible y distancia manual sin fingir una calculada', () => {
  const pageSource = fs.readFileSync(new URL('../app/dashboard/transporte/tarifas/page.tsx', import.meta.url), 'utf8') + '\nexport { ratePayload, draftFromRate };';
  const pageExports = {};
  vm.runInNewContext(ts.transpileModule(pageSource, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: pageExports, require(name) { return name.startsWith('@/') ? {} : require(name); } });
  const base = { code: 'QA', name: 'QA', valid_from: '2026-01-01', valid_to: '2027-01-01', currency: 'COP', metadata: {} };
  const draft = pageExports.draftFromRate(base, []);
  Object.assign(draft, { fuel_kind: 'acpm', fuel_rendimiento: '8', fuel_precio_litro: '11000', fuel_extra_pct: '10', billable_km: '48.6', km_source: 'manual' });
  const payload = pageExports.ratePayload(draft, []);
  const reopened = pageExports.draftFromRate(payload, []);
  assert.equal(reopened.fuel_kind, 'acpm');
  assert.equal(reopened.fuel_rendimiento, '8');
  assert.equal(reopened.fuel_precio_litro, '11000');
  assert.equal(reopened.fuel_extra_pct, '10');
  assert.equal(reopened.billable_km, '48.6');
  assert.equal(reopened.sim_distance_km, '');
});

test('los interruptores conservan cero activado y peajes desactivados al reabrir', () => {
  const pageSource = fs.readFileSync(new URL('../app/dashboard/transporte/tarifas/page.tsx', import.meta.url), 'utf8') + '\nexport { ratePayload, draftFromRate };';
  const out = {};
  vm.runInNewContext(ts.transpileModule(pageSource, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: out, require(name) { return name.startsWith('@/') ? {} : require(name); } });
  const draft = out.draftFromRate({ code: 'QA', name: 'QA', metadata: {} }, []);
  Object.assign(draft, { tolls_flat: '', stops_included: '0', wait_included_min: '0', load_unload_flat: '0', other_costs_amount: '0' });
  const reopened = out.draftFromRate(out.ratePayload(draft, []), []);
  assert.equal(reopened.tolls_flat, '');
  for (const field of ['stops_included', 'wait_included_min', 'load_unload_flat', 'other_costs_amount']) assert.equal(reopened[field], '0', field);
});
