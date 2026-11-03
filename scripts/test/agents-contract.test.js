'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REQUIRED_SECTIONS,
  contractVersion,
  extractReadingPaths,
  isContractV2,
  normalizeReadingPath,
  sectionBody,
  validateContractText
} = require('../agents/lib/agent-contract');

const body = REQUIRED_SECTIONS.map((heading) => `${heading}\n\nContenido de ${heading}.`).join('\n\n');
const valid = `---\nname: apexos-demo\nversion: 2.0.0\nupdated_at: 2026-11-03\ncontract: 2\n---\n\n# Demo\n\n${body}\n`;

test('detecta contract v2 solo con la version declarada', () => {
  assert.equal(contractVersion(valid), '2');
  assert.equal(isContractV2(valid), true);
  assert.equal(isContractV2(valid.replace('contract: 2', 'contract: 1')), false);
  assert.equal(isContractV2('sin frontmatter'), false);
});

test('un contrato v2 completo y ordenado pasa', () => {
  assert.deepEqual(validateContractText({ text: valid, relPath: 'demo/SKILL.md' }), []);
});

test('falla cuando falta una seccion obligatoria', () => {
  const text = valid.replace('## Handoff\n\nContenido de ## Handoff.\n\n', '');
  const errors = validateContractText({ text, relPath: 'demo/SKILL.md' });
  assert.ok(errors.some((error) => error.includes('falta la seccion obligatoria "## Handoff"')));
});

test('falla cuando una seccion esta vacia', () => {
  const text = valid.replace('## Evidencia\n\nContenido de ## Evidencia.', '## Evidencia');
  const errors = validateContractText({ text, relPath: 'demo/SKILL.md' });
  assert.ok(errors.some((error) => error.includes('la seccion "## Evidencia" esta vacia')));
});

test('falla cuando las secciones estan fuera de orden', () => {
  const reordered = valid
    .replace('## Evidencia\n\nContenido de ## Evidencia.\n\n', '')
    .replace('## Antipatrones\n\nContenido de ## Antipatrones.', '## Evidencia\n\nContenido.\n\n## Antipatrones\n\nContenido.');
  const errors = validateContractText({ text: reordered, relPath: 'demo/SKILL.md' });
  assert.ok(errors.some((error) => error.includes('fuera de orden')));
});

test('valida que las lecturas obligatorias existan', () => {
  const text = valid.replace(
    'Contenido de ## Lecturas obligatorias.',
    '1. `docs/existe.md`\n2. `apps/web/components/ui/`\n3. `<placeholder>`'
  );
  const seen = [];
  const errors = validateContractText({
    text,
    relPath: 'demo/SKILL.md',
    exists: (rel) => {
      seen.push(rel);
      return rel !== 'docs/existe.md';
    }
  });
  assert.deepEqual(seen.sort(), ['apps/web/components/ui', 'docs/existe.md']);
  assert.ok(errors.some((error) => error.includes('lectura obligatoria inexistente "docs/existe.md"')));
});

test('extrae y normaliza rutas de lectura con globs y barras de Windows', () => {
  const text = valid.replace(
    'Contenido de ## Lecturas obligatorias.',
    '1. `apps\\web\\app\\`\n2. `apps/api/prisma/**`\n3. `npm`\n4. `<pendiente>`'
  );
  assert.deepEqual(extractReadingPaths(text), ['apps/web/app', 'apps/api/prisma']);
  assert.equal(normalizeReadingPath('`docs/x.md`'), 'docs/x.md');
  assert.equal(normalizeReadingPath('npm'), null);
});

test('sectionBody corta en el siguiente encabezado de nivel 2', () => {
  assert.equal(sectionBody(valid, '## Alcance'), 'Contenido de ## Alcance.');
  assert.equal(sectionBody(valid, '## Inexistente'), null);
});

test('un agente sin contract 2 no se valida contra el contrato nuevo', () => {
  assert.deepEqual(validateContractText({ text: '# Libre\n\nSin contrato.' }), [
    '<skill>: sin frontmatter YAML'
  ]);
  assert.deepEqual(
    validateContractText({ text: '---\nname: x\nversion: 1.0.0\n---\n\n# X' }),
    ['<skill>: contract debe ser 2 para validar']
  );
});

test('todos los agentes del registro declaran contract 2 y cumplen el contrato', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..', '..');
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'agents', 'registry.json'), 'utf8'));
  assert.ok(registry.agents.length > 0);
  for (const entry of registry.agents) {
    const text = fs.readFileSync(path.join(root, entry.source), 'utf8');
    assert.equal(isContractV2(text), true, `${entry.name} debe declarar contract: 2`);
    assert.deepEqual(
      validateContractText({
        text,
        relPath: entry.source,
        exists: (rel) => fs.existsSync(path.join(root, rel))
      }),
      [],
      `${entry.name} debe cumplir el contrato v2`
    );
  }
});
