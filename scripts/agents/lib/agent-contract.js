'use strict';

const REQUIRED_SECTIONS = [
  '## Alcance',
  '## Lecturas obligatorias',
  '## Reglas duras',
  '## Checklist de intervención',
  '## Evidencia',
  '## Handoff',
  '## Antipatrones'
];

const CONTRACT_VERSION = '2';

function parseFrontmatter(text) {
  const match = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

function contractVersion(text) {
  const fields = parseFrontmatter(text);
  return fields ? String(fields.contract || '').trim() : '';
}

function isContractV2(text) {
  return contractVersion(text) === CONTRACT_VERSION;
}

function sectionBody(text, heading) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join('\n').trim();
}

function normalizeReadingPath(token) {
  let value = String(token || '').trim();
  if (!value) return null;
  if (value.startsWith('<') || value.includes('<')) return null;
  value = value.replace(/^`+|`+$/g, '').trim();
  if (!value) return null;
  if (!/[\\/]/.test(value) && !/\.[A-Za-z0-9]+$/.test(value)) return null;
  value = value.replace(/\\/g, '/').replace(/\/\*{1,2}$/, '').replace(/\/+$/, '');
  return value || null;
}

function extractReadingPaths(text) {
  const body = sectionBody(text, '## Lecturas obligatorias');
  if (!body) return [];
  const tokens = body.match(/`[^`]+`/g) || [];
  return [...new Set(tokens.map(normalizeReadingPath).filter(Boolean))];
}

function validateContractText({ text, relPath = '<skill>', exists = null }) {
  const errors = [];
  const content = String(text || '');

  if (!parseFrontmatter(content)) {
    errors.push(`${relPath}: sin frontmatter YAML`);
    return errors;
  }
  if (!isContractV2(content)) {
    errors.push(`${relPath}: contract debe ser ${CONTRACT_VERSION} para validar`);
    return errors;
  }

  let previousIndex = -1;
  for (const heading of REQUIRED_SECTIONS) {
    const lines = content.split(/\r?\n/);
    const index = lines.findIndex((line) => line.trim() === heading);
    if (index === -1) {
      errors.push(`${relPath}: falta la seccion obligatoria "${heading}"`);
      continue;
    }
    if (index < previousIndex) {
      errors.push(`${relPath}: la seccion "${heading}" esta fuera de orden`);
    }
    previousIndex = index;
    const body = sectionBody(content, heading);
    if (!body) errors.push(`${relPath}: la seccion "${heading}" esta vacia`);
  }

  const actualOrder = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => REQUIRED_SECTIONS.includes(line));
  if (
    actualOrder.length === REQUIRED_SECTIONS.length &&
    actualOrder.join('|') !== REQUIRED_SECTIONS.join('|')
  ) {
    errors.push(`${relPath}: las secciones obligatorias estan fuera de orden respecto al contrato`);
  }

  if (exists) {
    for (const reading of extractReadingPaths(content)) {
      if (!exists(reading)) {
        errors.push(`${relPath}: lectura obligatoria inexistente "${reading}"`);
      }
    }
  }

  return errors;
}

module.exports = {
  CONTRACT_VERSION,
  REQUIRED_SECTIONS,
  contractVersion,
  extractReadingPaths,
  isContractV2,
  normalizeReadingPath,
  parseFrontmatter,
  sectionBody,
  validateContractText
};
