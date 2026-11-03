#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isContractV2, validateContractText } = require('./lib/agent-contract');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY_PATH = path.join(ROOT, 'agents', 'registry.json');

function fail(message) {
  console.error(`[agents] ${message}`);
  process.exit(1);
}

function readNormalized(filePath) {
  return Buffer.from(fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'), 'utf8');
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(readNormalized(filePath)).digest('hex');
}

function parseFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) fail(`Sin frontmatter YAML: ${path.relative(ROOT, filePath)}`);
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) fail('Falta agents/registry.json');
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function gitDate(relPath) {
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', relPath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (dirty) return today();
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', relPath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (out) return out;
  } catch {
    // Sin historial: se usa la fecha del archivo.
  }
  return fs.statSync(path.join(ROOT, relPath)).mtime.toISOString().slice(0, 10);
}

function agentPaths(entry) {
  return {
    source: path.join(ROOT, entry.source),
    mirror: path.join(ROOT, entry.mirror)
  };
}

function validateAgent(source, relPath) {
  const text = fs.readFileSync(source, 'utf8');
  if (!isContractV2(text)) return;
  const errors = validateContractText({
    text,
    relPath,
    exists: (rel) => fs.existsSync(path.join(ROOT, rel))
  });
  if (errors.length) fail(errors.join('\n[agents] '));
}

function syncAgent(entry) {
  const { source, mirror } = agentPaths(entry);
  if (!fs.existsSync(source)) fail(`Fuente canónica inexistente: ${entry.source}`);
  const frontmatter = parseFrontmatter(source);
  const dirName = path.basename(path.dirname(source));
  if (frontmatter.name !== dirName) {
    fail(`${entry.source}: frontmatter name "${frontmatter.name}" != carpeta "${dirName}"`);
  }
  if (!frontmatter.version || !/^\d+\.\d+\.\d+$/.test(frontmatter.version)) {
    fail(`${entry.source}: version semver obligatoria (major.minor.patch)`);
  }
  if (!frontmatter.updated_at || !/^\d{4}-\d{2}-\d{2}$/.test(frontmatter.updated_at)) {
    fail(`${entry.source}: updated_at obligatorio en formato YYYY-MM-DD`);
  }
  validateAgent(source, entry.source);
  fs.mkdirSync(path.dirname(mirror), { recursive: true });
  fs.copyFileSync(source, mirror);
  return {
    ...entry,
    version: frontmatter.version,
    updated_at: frontmatter.updated_at,
    sha256: sha256(source)
  };
}

function syncDocument(entry) {
  const abs = path.join(ROOT, entry.path);
  if (!fs.existsSync(abs)) fail(`Documento de gobernanza inexistente: ${entry.path}`);
  return { ...entry, updated_at: gitDate(entry.path), sha256: sha256(abs) };
}

function writeRegistry() {
  const registry = readRegistry();
  if (!Array.isArray(registry.agents) || !registry.agents.length) fail('registry.agents vacío');
  if (!Array.isArray(registry.documents) || !registry.documents.length) fail('registry.documents vacío');

  const listed = new Set(registry.agents.map((a) => a.name));
  const canonicalDirs = fs
    .readdirSync(path.join(ROOT, '.qoder', 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const missing = canonicalDirs.filter((name) => !listed.has(name));
  if (missing.length) {
    fail(`Agentes en .qoder/skills sin entrada en registry.json: ${missing.join(', ')}`);
  }

  const agents = registry.agents
    .map(syncAgent)
    .sort((a, b) => a.name.localeCompare(b.name));
  const documents = registry.documents
    .map(syncDocument)
    .sort((a, b) => a.path.localeCompare(b.path));

  const output = {
    ...registry,
    generated_at: today(),
    agents,
    documents
  };
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`[agents] sincronizados ${agents.length} agentes y ${documents.length} documentos`);
}

function checkRegistry() {
  const registry = readRegistry();
  const errors = [];

  if (!Array.isArray(registry.agents) || !registry.agents.length) errors.push('registry.agents vacío');
  if (!Array.isArray(registry.documents) || !registry.documents.length) errors.push('registry.documents vacío');

  for (const entry of registry.agents || []) {
    const { source, mirror } = agentPaths(entry);
    if (!fs.existsSync(source)) {
      errors.push(`fuente inexistente: ${entry.source}`);
      continue;
    }
    if (!fs.existsSync(mirror)) {
      errors.push(`espejo inexistente: ${entry.mirror} (corre npm run agents:sync)`);
      continue;
    }
    if (!readNormalized(source).equals(readNormalized(mirror))) {
      errors.push(`espejo desincronizado: ${entry.mirror}`);
    }
    const frontmatter = parseFrontmatter(source);
    const dirName = path.basename(path.dirname(source));
    if (frontmatter.name !== dirName) errors.push(`${entry.source}: name != ${dirName}`);
    if (frontmatter.version !== entry.version) {
      errors.push(`${entry.name}: registry ${entry.version} != frontmatter ${frontmatter.version}`);
    }
    if (frontmatter.updated_at !== entry.updated_at) {
      errors.push(`${entry.name}: registry updated_at ${entry.updated_at} != frontmatter ${frontmatter.updated_at}`);
    }
    if (sha256(source) !== entry.sha256) {
      errors.push(`${entry.name}: sha256 del registro no coincide (corre npm run agents:sync)`);
    }
    const contractText = fs.readFileSync(source, 'utf8');
    if (isContractV2(contractText)) {
      errors.push(
        ...validateContractText({
          text: contractText,
          relPath: entry.source,
          exists: (rel) => fs.existsSync(path.join(ROOT, rel))
        })
      );
    }
  }

  for (const entry of registry.documents || []) {
    const abs = path.join(ROOT, entry.path);
    if (!fs.existsSync(abs)) {
      errors.push(`documento inexistente: ${entry.path}`);
      continue;
    }
    if (sha256(abs) !== entry.sha256) {
      errors.push(`documento cambiado sin registrar: ${entry.path} (corre npm run agents:sync)`);
    }
    if (gitDate(entry.path) !== entry.updated_at) {
      errors.push(`documento con fecha distinta al registro: ${entry.path}`);
    }
  }

  if (errors.length) {
    for (const error of errors) console.error(`[agents] ${error}`);
    process.exit(1);
  }
  console.log(
    `[agents] OK: ${registry.agents.length} agentes y ${registry.documents.length} documentos verificados`
  );
}

function restoreRegistry() {
  const registry = readRegistry();
  for (const entry of registry.agents) {
    const { source, mirror } = agentPaths(entry);
    if (!fs.existsSync(mirror)) fail(`Espejo inexistente: ${entry.mirror}`);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.copyFileSync(mirror, source);
  }
  console.log(`[agents] restaurados ${registry.agents.length} agentes desde agents/ a .qoder/skills/`);
}

const mode = process.argv[2];
if (mode === 'write' || mode === 'sync') writeRegistry();
else if (mode === 'check') checkRegistry();
else if (mode === 'restore') restoreRegistry();
else fail('Uso: node scripts/agents/sync-agents.js <write|check|restore>');
