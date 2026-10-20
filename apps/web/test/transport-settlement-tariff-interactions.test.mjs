import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../components/transport/SettlementDocumentsEditor.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function setup(count = 1) {
  let cursor = 0, tree, docs, ready;
  const hooks = [], effects = [], pendingEffects = [], quotes = [];
  const rates = [1, 2].map(id => ({ id, code: `T-${id}`, name: `Tarifa ${id}`, version: 1, valid_from: '2020-01-01', valid_to: '2099-12-31', unit_amount: id * 100, default_metrics: { distance_km: 10 }, requires_distance: true, route_description: 'Origen → Destino' }));
  const componentExports = {};
  vm.runInNewContext(compiled, { exports: componentExports, crypto: { randomUUID }, require(name) {
    if (name === 'react') return {
      useRef(value) { const i = cursor++; return hooks[i] ||= { current: value }; },
      useState(value) { const i = cursor++; if (!(i in hooks)) hooks[i] = value; return [hooks[i], next => { hooks[i] = typeof next === 'function' ? next(hooks[i]) : next; }]; },
      useEffect(callback, deps) { const i = cursor++; if (!effects[i] || deps.some((dep, j) => dep !== effects[i][j])) { effects[i] = deps; pendingEffects.push(callback); } }
    };
    if (name === '@/lib/api') return { api(route, options) { if (route.includes('settlement-destinations')) return Promise.resolve([{ id: 7, code: 'T1', name: 'Tienda 1', city: 'Medellin' }]); if (route.includes('settlement-customers')) return Promise.resolve([{ id: 1, name: 'Cliente A' }, { id: 2, name: 'Cliente B' }]); if (route.includes('settlement-rate-options')) return Promise.resolve(rates); return new Promise(resolve => quotes.push({ payload: JSON.parse(options.body), resolve })); } };
    return require(name);
  } });
  docs = Array.from({ length: count }, () => ({ ...componentExports.newSettlementDocument(), customer_id: 1, delivery_point_id: 7, service: 'Cliente A' }));
  const change = value => { docs = value; render(); };
  const onReady = value => { ready = value; };
  function render() { cursor = 0; tree = componentExports.SettlementDocumentsEditor({ documents: docs, onChange: change, vehicleId: 1, onReadyChange: onReady }); pendingEffects.splice(0).forEach(fn => fn()); }
  function nodes() { const out = []; function walk(node) { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; out.push(node); walk(node.props?.children); } walk(tree); return out; }
  render();
  return { module, render, nodes, quotes, docs: () => docs, ready: () => ready, field: label => nodes().find(node => node.props?.['aria-label'] === label), async flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); render(); } };
}
const quote = (id, unit_value, metrics = { distance_km: 10 }) => ({ rate_card_id: id, rate_version: 1, concept: `T-${id}`, unit_value, quantity: 1, support: '', metrics });

test('el valor del tarifario es solo lectura y la respuesta anterior no sustituye la última selección', async () => {
  const ui = setup(); await ui.flush();
  assert.equal(ui.field('Valor 1.1').props.readOnly, true);
  assert.equal(ui.field('Valor 1.1').props.onChange, undefined);
  ui.field('Criterio 1.1').props.onChange({ target: { value: '1' } });
  ui.field('Criterio 1.1').props.onChange({ target: { value: '2' } });
  ui.quotes[1].resolve(quote(2, 200)); await ui.flush();
  ui.quotes[0].resolve(quote(1, 100)); await ui.flush();
  assert.equal(ui.docs()[0].charge_criteria[0].rate_card_id, 2);
  assert.equal(ui.docs()[0].charge_criteria[0].unit_value, 200);
  assert.equal(ui.ready(), true);
});
test('las metricas configuradas en el tarifario son solo lectura', async () => {
  const ui = setup(); await ui.flush();
  ui.field('Criterio 1.1').props.onChange({ target: { value: '1' } });
  assert.equal(ui.field('Kilómetros del recorrido 1.1').props.readOnly, true);
  assert.equal(ui.field('Kilómetros del recorrido 1.1').props.onChange, undefined);
  ui.quotes[0].resolve(quote(1, 100)); await ui.flush();
  assert.equal(ui.docs()[0].charge_criteria[0].unit_value, 100);
});

test('quitar un documento no aplica su respuesta tardía al documento siguiente', async () => {
  const ui = setup(2); await ui.flush();
  ui.field('Criterio 1.1').props.onChange({ target: { value: '1' } });
  ui.nodes().find(node => node.type === 'button' && node.props.children === 'Quitar recorrido').props.onClick();
  ui.quotes[0].resolve(quote(1, 100)); await ui.flush();
  assert.equal(ui.docs().length, 1); assert.equal(ui.docs()[0].charge_criteria[0].rate_card_id, undefined);
});
test('el payload conserva servicios y soporte actuales y excluye estado interno del editor', async () => {
  const ui = setup(); await ui.flush();
  ui.field('Criterio 1.1').props.onChange({ target: { value: '1' } });
  ui.field('Cantidad 1.1').props.onChange({ target: { value: '3' } });
  ui.field('Soporte 1.1').props.onChange({ target: { value: 'Remesa firmada' } });
  ui.quotes[0].resolve(quote(1, 100)); await ui.flush();
  const payload = ui.module.settlementDocumentPayload(ui.docs()[0]);
  assert.equal(payload.charge_criteria[0].quantity, 3); assert.equal(payload.charge_criteria[0].support, 'Remesa firmada');
  assert.equal(payload.charge_criteria[0]._key, undefined); assert.equal(payload.charge_criteria[0].pricing, undefined);
  assert.equal(ui.module.documentTotal(ui.docs()[0]), 300);
});

test('cliente se selecciona del maestro y se conserva en el payload', async () => {
  const ui = setup(); await ui.flush();
  ui.field('Cliente del servicio 1').props.onChange({ target: { value: '2' } });
  assert.equal(ui.docs()[0].service, 'Cliente B');
  assert.equal(ui.module.settlementDocumentPayload(ui.docs()[0]).customer_id, 2);
  ui.field('Cliente del servicio 1').props.onChange({ target: { value: '' } });
  assert.equal(ui.ready(), false);
});

test('destino del maestro sustituye guia manual y viaja al servidor', async () => {
  const ui = setup(); await ui.flush();
  if (ui.field('Quitar tienda 1: Tienda 1')) ui.field('Quitar tienda 1: Tienda 1').props.onClick();
  ui.field('Buscar tiendas del recorrido 1').props.onChange({ target: { value: 'tienda' } }); ui.render();
  ui.field('Agregar tienda 1: Tienda 1 · T1').props.onClick();
  const payload = ui.module.settlementDocumentPayload(ui.docs()[0]);
  assert.equal(payload.delivery_point_ids[0], 7);
  assert.equal(payload.guide_reference, undefined);
});

test('seleccionar o quitar tiendas informativas conserva el precio y la cantidad', async () => {
  const ui = setup(); await ui.flush();
  ui.field('Criterio 1.1').props.onChange({ target: { value: '1' } });
  ui.quotes[0].resolve(quote(1, 500000)); await ui.flush();
  const amount = ui.module.documentTotal(ui.docs()[0]);
  ui.field('Quitar tienda 1: Tienda 1').props.onClick();
  assert.equal(ui.module.documentTotal(ui.docs()[0]), amount);
  assert.equal(ui.ready(), false);
  if (ui.field('Quitar tienda 1: Tienda 1')) ui.field('Quitar tienda 1: Tienda 1').props.onClick();
  ui.field('Buscar tiendas del recorrido 1').props.onChange({ target: { value: 'tienda' } }); ui.render();
  ui.field('Agregar tienda 1: Tienda 1 · T1').props.onClick();
  assert.equal(ui.module.documentTotal(ui.docs()[0]), 500000);
  assert.equal(ui.docs()[0].charge_criteria[0].quantity, 1);
});

test('buscador excluye seleccionadas y permite buscar por codigo y agregar con teclado', async () => {
  const ui = setup(); await ui.flush();
  ui.field('Buscar tiendas del recorrido 1').props.onChange({ target: { value: 'T1' } }); ui.render();
  assert.equal(ui.field('Agregar tienda 1: Tienda 1 · T1'), undefined);
  ui.field('Quitar tienda 1: Tienda 1').props.onClick();
  ui.field('Buscar tiendas del recorrido 1').props.onChange({ target: { value: 'T1' } }); ui.render();
  assert.ok(ui.field('Agregar tienda 1: Tienda 1 · T1'));
  let prevented = false;
  ui.field('Buscar tiendas del recorrido 1').props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } }); ui.render();
  assert.equal(prevented, true);
  assert.equal(ui.docs()[0].delivery_point_ids.length, 1);
  assert.equal(ui.field('Buscar tiendas del recorrido 1').props.value, '');
  assert.ok(ui.field('Quitar tienda 1: Tienda 1'));
});

test('Escape cierra solo los resultados sin propagarse al modal', async () => {
  const ui = setup(); await ui.flush();
  ui.field('Buscar tiendas del recorrido 1').props.onChange({ target: { value: 'T1' } }); ui.render();
  let stopped = false;
  ui.field('Buscar tiendas del recorrido 1').props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } }); ui.render();
  assert.equal(stopped, true);
  assert.equal(ui.field('Buscar tiendas del recorrido 1').props['aria-expanded'], false);
});
