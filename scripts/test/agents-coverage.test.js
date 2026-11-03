'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { routePaths } = require('../agents/lib/agent-routing');
const { evaluateCoverage, latestChangelogSection, mentionsAgent } = require('../agents/lib/agent-coverage');

const entry = (version, updatedAt, sha = 'a'.repeat(64)) => ({
  version,
  updated_at: updatedAt,
  sha256: sha
});

const changelog = `# Changelog\n\n## 2026-11-03\n\n### Entrenamiento\n\n- apexos-frontend: catalogo de componentes.\n- apexos-db-nube: convenciones de tablas.\n\n## 2026-11-02\n\n- apexos-qa: version anterior.\n`;

test('latestChangelogSection solo toma la seccion mas reciente', () => {
  const section = latestChangelogSection(changelog);
  assert.ok(section.includes('2026-11-03'));
  assert.ok(section.includes('apexos-db-nube'));
  assert.ok(!section.includes('apexos-qa'));
});

test('mentionsAgent no confunde prefijos', () => {
  assert.equal(mentionsAgent('bump de apexos-frontend.', 'apexos-frontend'), true);
  assert.equal(mentionsAgent('bump de apexos-frontend-web.', 'apexos-frontend'), false);
  assert.equal(mentionsAgent('nada', 'apexos-frontend'), false);
});

test('cobertura pasa con bump local y changelog de la intervencion', () => {
  const result = evaluateCoverage({
    routing: routePaths(['apps/web/app/page.tsx', 'apps/api/prisma/schema.prisma']),
    localAgents: new Map([
      ['apexos-frontend', entry('2.0.0', '2026-11-03')],
      ['apexos-db-nube', entry('2.0.0', '2026-11-03')]
    ]),
    remoteAgents: new Map([
      ['apexos-frontend', entry('1.2.0', '2026-11-02')],
      ['apexos-db-nube', entry('1.1.0', '2026-11-02')]
    ]),
    changelog
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.rows.map((row) => row.owner), ['apexos-db-nube', 'apexos-frontend']);
});

test('cobertura bloquea si el dueno no avanzo frente a origin', () => {
  const result = evaluateCoverage({
    routing: routePaths(['apps/web/app/page.tsx']),
    localAgents: new Map([['apexos-frontend', entry('1.2.0', '2026-11-02')]]),
    remoteAgents: new Map([['apexos-frontend', entry('1.2.0', '2026-11-02')]]),
    changelog
  });
  assert.equal(result.ok, false);
  assert.equal(result.pending[0].status, 'in-sync');
  assert.ok(result.pending[0].missing.some((item) => item.includes('sin bump local')));
});

test('cobertura bloquea si falta la entrada de changelog', () => {
  const result = evaluateCoverage({
    routing: routePaths(['apps/api/src/modules/services/routes.js']),
    localAgents: new Map([['apexos-backend', entry('1.5.0', '2026-11-03')]]),
    remoteAgents: new Map([['apexos-backend', entry('1.4.0', '2026-11-02')]]),
    changelog
  });
  assert.equal(result.ok, false);
  assert.equal(result.pending[0].changelogOk, false);
});

test('cobertura bloquea un agente dueno ausente del registro local', () => {
  const result = evaluateCoverage({
    routing: routePaths(['apps/control-tower/server.js']),
    localAgents: new Map(),
    remoteAgents: new Map([['apexos-performance', entry('1.0.0', '2026-11-01')]]),
    changelog
  });
  assert.equal(result.ok, false);
  assert.equal(result.pending[0].status, 'unknown');
});

test('sin duenos no se exige actualizacion de contexto', () => {
  const result = evaluateCoverage({
    routing: routePaths(['AGENTS.md', 'scripts/test/x.test.js']),
    localAgents: new Map(),
    remoteAgents: new Map(),
    changelog
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows, []);
});

test('un dueno nuevo solo local se acepta si el changelog lo menciona', () => {
  const result = evaluateCoverage({
    routing: routePaths(['apps/web/app/page.tsx']),
    localAgents: new Map([['apexos-frontend', entry('1.0.0', '2026-11-03')]]),
    remoteAgents: new Map(),
    changelog
  });
  assert.equal(result.ok, true);
  assert.equal(result.rows[0].status, 'local-only');
});
