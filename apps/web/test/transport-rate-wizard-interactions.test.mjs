import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../app/dashboard/transporte/tarifas/page.tsx', import.meta.url), 'utf8') + '\nexport { RateWizard, draftFromRate, ratePayload };';
function setup(initial) {
  let cursor = 0, step = 0, tree, saved;
  const hooks = [], exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, { exports, require(name) {
    if (name === 'react') return { useState(value) { const index = cursor++; if (!(index in hooks)) hooks[index] = value; return [hooks[index], next => { hooks[index] = typeof next === 'function' ? next(hooks[index]) : next; }]; }, useMemo: fn => fn() };
    if (name === '@/lib/api') return { isActiveMasterItem: () => true };
    if (name.startsWith('@/')) return {};
    return require(name);
  } });
  function render() { cursor = 0; tree = exports.RateWizard({ step, onStepChange: value => { step = value; }, initial: initial ? exports.draftFromRate(initial, []) : null, onSubmit: draft => { saved = exports.ratePayload(draft, []); }, onCancel() {}, carriers: [], vehicles: [], masters: null, sedes: [] }); }
  function nodes() { const result = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; result.push(node); walk(node.props?.children); } walk(tree); return result; }
  render();
  return { render, nodes, step: () => step, saved: () => saved, field: name => nodes().find(node => node.props?.name === name), next() { tree.props.onSubmit({ preventDefault() {} }); render(); } };
}
test('identificación pasa directamente a transporte y vigencia, valida fechas y guarda solo desde cálculo', () => {
  const ui = setup();
  ui.next(); assert.equal(ui.step(), 0);
  ui.field('code').props.onChange('LOCAL-THREE'); ui.field('name').props.onChange('Tres etapas'); ui.render();
  ui.next(); assert.equal(ui.step(), 1); assert.ok(ui.field('valid_from')); assert.equal(ui.saved(), undefined);
  ui.next(); assert.equal(ui.step(), 1);
  ui.field('valid_from').props.onChange('2026-10-21'); ui.field('valid_to').props.onChange('2026-01-01'); ui.render();
  ui.next(); assert.equal(ui.step(), 1);
  ui.field('valid_to').props.onChange('2027-01-01'); ui.render();
  ui.next(); assert.equal(ui.step(), 2); assert.equal(ui.saved(), undefined);
  ui.nodes().find(node => node.type === 'button' && node.props.children?.some?.(child => child === 'Atrás')).props.onClick(); ui.render();
  assert.equal(ui.step(), 1); assert.equal(ui.field('valid_from').props.value, '2026-10-21');
  ui.next(); ui.next();
  assert.equal(ui.saved().code, 'LOCAL-THREE');
  assert.equal(ui.saved().destination_department, ''); assert.equal(ui.saved().destination_city, ''); assert.equal(ui.saved().destination_municipality, '');
});
test('editar una tarifa preserva el alcance geográfico histórico aunque ya no exista la etapa geográfica', () => {
  const ui = setup({ code: 'HIST', name: 'Histórica', currency: 'COP', metadata: {}, valid_from: '2026-01-01', valid_to: '2027-01-01', destination_department: 'Antioquia', destination_city: 'Medellín', destination_municipality: 'El Poblado' });
  ui.next(); ui.next(); ui.next();
  assert.equal(ui.saved().destination_department, 'Antioquia');
  assert.equal(ui.saved().destination_city, 'Medellín');
  assert.equal(ui.saved().destination_municipality, 'El Poblado');
});

test('transporte de terceros sigue exigiendo transportadora en la nueva segunda etapa', () => {
  const ui = setup({ code: 'THIRD', name: 'Terceros', currency: 'COP', metadata: { applies_to: 'terceros' }, valid_from: '2026-01-01', valid_to: '2027-01-01' });
  ui.next(); ui.next(); assert.equal(ui.step(), 1);
  ui.field('carrier_id').props.onChange('10'); ui.render();
  ui.next(); assert.equal(ui.step(), 2);
  ui.next(); assert.equal(ui.saved().carrier_id, 10);
});
