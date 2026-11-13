import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../app/print/transport-settlement/page.tsx', import.meta.url), 'utf8');
test('la impresión aísla el tema claro y restaura el tema previo al salir sin persistir cambios', () => {
  for (const previous of ['dark', 'light', null]) {
    const classes = new Set(previous === 'dark' ? ['dark'] : []);
    const attributes = new Map(previous === null ? [] : [['data-theme', previous]]);
    const html = { classList: { contains: key => classes.has(key), remove: key => classes.delete(key), toggle: (key, enabled) => enabled ? classes.add(key) : classes.delete(key) }, getAttribute: key => attributes.get(key) ?? null, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
    const exports = {}; let effect;
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, { exports, document: { documentElement: html }, require(name) {
      if (name === 'react') return { useLayoutEffect: callback => { effect = callback; }, useEffect() {}, useState: value => [value, () => {}], useRef: () => ({ current: null }) };
      if (name === 'next/dynamic') return { default: () => () => null };
      if (name.startsWith('@/')) return {};
      return require(name);
    } });
    exports.default(); const cleanup = effect();
    assert.equal(classes.has('dark'), false);
    assert.equal(attributes.get('data-theme'), 'light');
    cleanup();
    assert.equal(classes.has('dark'), previous === 'dark');
    assert.equal(attributes.get('data-theme') ?? null, previous);
  }
});
test('la captura declara los tonos secundarios de papel y no fuerza el título blanco', () => {
  assert.match(source, /--surface-muted:240 245 253/);
  assert.match(source, /--text-subtle:85 105 132/);
  assert.doesNotMatch(source, /summary[^\n]+color:#fff/);
});
