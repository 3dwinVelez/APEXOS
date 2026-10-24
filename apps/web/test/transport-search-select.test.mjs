import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../components/transport/TransportSearchSelect.tsx', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, { exports, require });
test('busca iniciales, texto, códigos y términos sin depender de tildes ni mayúsculas', () => {
  const match = exports.matchesTransportOption;
  for (const query of ['tan', 'T A N', 'aguila', 'NORTE transportes', '']) assert.equal(match('Transportes Águila Norte', query), true, query);
  assert.equal(match('ABC123 · Bogotá Centro', 'abc123'), true);
  assert.equal(match('ABC123 · Bogotá Centro', 'bogota'), true);
  assert.equal(match('Transportes Águila Norte', 'xyz'), false);
});
test('todo select de Transporte utiliza el buscador compartido', () => {
  const roots = ['../app/dashboard/transporte/', '../components/transport/'];
  let migrated = 0;
  function audit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) audit(url);
      else if (entry.name.endsWith('.tsx') && entry.name !== 'TransportSearchSelect.tsx') {
        const text = fs.readFileSync(url, 'utf8');
        assert.doesNotMatch(text, /<select\b/, url.pathname);
        if (text.includes('<TransportSearchSelect')) { migrated++; assert.match(text, /import \{ TransportSearchSelect \}/); }
      }
    }
  }
  roots.forEach(root => audit(new URL(root, import.meta.url)));
  assert.equal(migrated, 14);
});
