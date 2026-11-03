'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { versionBumpError } = require('../agents/lib/agent-versioning');

const previous = { version: '2.0.0', sha256: 'aaa' };

test('un agente nuevo sin registro previo no requiere bump', () => {
  assert.equal(versionBumpError({ name: 'demo', previous: null, next: { version: '2.0.0', sha256: 'bbb' } }), null);
});

test('contenido sin cambios no exige bump', () => {
  assert.equal(versionBumpError({ name: 'demo', previous, next: { version: '2.0.0', sha256: 'aaa' } }), null);
});

test('un cambio con version mayor es valido', () => {
  assert.equal(versionBumpError({ name: 'demo', previous, next: { version: '2.1.0', sha256: 'bbb' } }), null);
});

test('un cambio sin bump de version se rechaza', () => {
  const error = versionBumpError({ name: 'demo', previous, next: { version: '2.0.0', sha256: 'bbb' } });
  assert.match(error, /sin bump de version \(2\.0\.0 -> 2\.0\.0/);
});

test('una version que retrocede se rechaza', () => {
  const error = versionBumpError({ name: 'demo', previous, next: { version: '1.9.0', sha256: 'bbb' } });
  assert.match(error, /retrocede/);
});
