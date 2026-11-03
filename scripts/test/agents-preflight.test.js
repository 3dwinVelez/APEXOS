'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyDocumentFreshness,
  classifyFreshness,
  compareVersions,
  isBlocking,
  normalizePath,
  routePaths
} = require('../agents/lib/agent-routing');

const agent = (version, updatedAt, sha = 'a'.repeat(64)) => ({
  version,
  updated_at: updatedAt,
  sha256: sha
});

test('compareVersions ordena numericamente, no lexicograficamente', () => {
  assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
  assert.equal(compareVersions('1.10.0', '1.2.0'), 1);
  assert.equal(compareVersions('2.0.0', '2.0.0'), 0);
  assert.throws(() => compareVersions('1.2', '1.2.0'), /semver invalida/);
});

test('classifyFreshness detecta remoto mas nuevo por version o fecha', () => {
  assert.equal(classifyFreshness(agent('1.2.0', '2026-11-01'), agent('1.3.0', '2026-11-01')), 'remote-newer');
  assert.equal(classifyFreshness(agent('1.2.0', '2026-11-01'), agent('1.2.0', '2026-11-02')), 'remote-newer');
  assert.equal(classifyFreshness(agent('2.0.0', '2026-11-01'), agent('1.9.9', '2026-11-02')), 'local-ahead');
});

test('classifyFreshness bloquea conflicto cuando version y fecha coinciden con sha distinto', () => {
  const local = agent('1.2.0', '2026-11-02', 'a'.repeat(64));
  const remote = agent('1.2.0', '2026-11-02', 'b'.repeat(64));
  assert.equal(classifyFreshness(local, remote), 'conflict');
  assert.equal(classifyFreshness(local, { ...remote, sha256: local.sha256 }), 'in-sync');
});

test('classifyFreshness distingue agentes solo locales o solo remotos', () => {
  assert.equal(classifyFreshness(null, agent('1.0.0', '2026-11-02')), 'remote-only');
  assert.equal(classifyFreshness(agent('1.0.0', '2026-11-02'), null), 'local-only');
});

test('classifyDocumentFreshness usa fecha y sha, sin semver', () => {
  const local = { updated_at: '2026-11-01', sha256: 'a'.repeat(64) };
  assert.equal(classifyDocumentFreshness(local, { ...local, updated_at: '2026-11-02' }), 'remote-newer');
  assert.equal(classifyDocumentFreshness(local, { ...local, sha256: 'b'.repeat(64) }), 'conflict');
  assert.equal(classifyDocumentFreshness(local, local), 'in-sync');
});

test('isBlocking solo bloquea actualizaciones remotas, remotos nuevos y conflictos', () => {
  for (const status of ['remote-newer', 'remote-only', 'conflict']) assert.equal(isBlocking(status), true);
  for (const status of ['in-sync', 'local-ahead', 'local-only', 'unknown']) assert.equal(isBlocking(status), false);
});

test('normalizePath unifica separadores de Windows', () => {
  assert.equal(normalizePath('.\\apps\\web\\app\\page.tsx'), 'apps/web/app/page.tsx');
});

test('routePaths exige frontend y QA para apps/web', () => {
  const result = routePaths(['apps/web/app/dashboard/page.tsx']);
  assert.deepEqual(result.agents, ['equipo-apexos', 'apexos-frontend', 'apexos-qa']);
  assert.deepEqual(result.unmatched, []);
});

test('routePaths exige DB, backend, seguridad y QA para el esquema Prisma', () => {
  const result = routePaths(['apps/api/prisma/schema.prisma']);
  assert.deepEqual(result.agents, [
    'equipo-apexos',
    'apexos-db-nube',
    'apexos-backend',
    'apexos-seguridad',
    'apexos-qa'
  ]);
});

test('routePaths concentra HR en backend, seguridad y QA', () => {
  const result = routePaths(['apps/api/src/modules/hr/service.js']);
  assert.deepEqual(result.agents, ['equipo-apexos', 'apexos-backend', 'apexos-seguridad', 'apexos-qa']);
});

test('routePaths manda gobernanza al trio de agentes', () => {
  const result = routePaths(['AGENTS.md']);
  assert.deepEqual(result.agents, ['equipo-apexos', 'apexos-brief', 'apexos-git-guardian']);
});

test('routePaths agrega equipo-apexos cuando la tarea es multidisciplinaria', () => {
  const result = routePaths(['apps/web/app/page.tsx', 'apps/api/src/server.js']);
  assert.ok(result.agents.includes('equipo-apexos'));
  assert.ok(result.agents.includes('apexos-frontend'));
  assert.ok(result.agents.includes('apexos-backend'));
});

test('routePaths informa rutas sin agente asignado', () => {
  const result = routePaths(['docs/project/contexto-proyecto.md']);
  assert.deepEqual(result.agents, []);
  assert.deepEqual(result.unmatched, ['docs/project/contexto-proyecto.md']);
});
