#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { normalizePath, routePaths } = require('./lib/agent-routing');
const { evaluateCoverage } = require('./lib/agent-coverage');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY_REL = 'agents/registry.json';
const CHANGELOG_REL = 'agents/CHANGELOG.md';
const REMOTE = process.env.APEXOS_AGENTS_REMOTE || 'origin';
const BRANCH = process.env.APEXOS_AGENTS_BRANCH || 'desarrollo';

function fail(message) {
  console.error(`[agents:coverage] ${message}`);
  process.exit(1);
}

function git(args, { allowFailure = false, timeout = 30000, trim = true } = {}) {
  try {
    const output = execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout
    });
    return trim ? output.trim() : output;
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function splitPaths(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = { paths: [], staged: false, fetch: true, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--staged') options.staged = true;
    else if (arg === '--no-fetch') options.fetch = false;
    else if (arg === '--json') options.json = true;
    else if (arg === '--paths' || arg === '--path') {
      const value = argv[index + 1];
      if (!value) fail(`${arg} requiere un valor`);
      options.paths.push(...splitPaths(value));
      index += 1;
    } else if (arg.startsWith('--paths=') || arg.startsWith('--path=')) {
      options.paths.push(...splitPaths(arg.slice(arg.indexOf('=') + 1)));
    } else if (arg.startsWith('-')) {
      fail(`Argumento no reconocido: ${arg}`);
    } else {
      options.paths.push(...splitPaths(arg));
    }
  }
  return options;
}

function fromPorcelain() {
  const raw = git(['status', '--porcelain'], { allowFailure: true, trim: false }) || '';
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const value = line.slice(3).trim().replace(/^"(.*)"$/, '$1');
      const arrow = value.indexOf(' -> ');
      return normalizePath(arrow >= 0 ? value.slice(arrow + 4) : value);
    })
    .filter(Boolean);
}

function fromDiff(args) {
  const raw = git(args, { allowFailure: true }) || '';
  return raw.split(/\r?\n/).map(normalizePath).filter(Boolean);
}

function collectPaths(options) {
  if (options.paths.length) return [...new Set(options.paths.map(normalizePath))];
  if (options.staged) return [...new Set(fromDiff(['diff', '--cached', '--name-only']))];
  return [
    ...new Set([
      ...fromDiff(['diff', '--name-only', `${REMOTE}/${BRANCH}...HEAD`]),
      ...fromPorcelain()
    ])
  ];
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function usage() {
  console.log(`Uso: npm run agents:coverage -- [opciones]

Verifica que cada agente dueno del contexto de las rutas declaradas tenga
version local por delante de origin/${BRANCH} y una entrada en la seccion
mas reciente de ${CHANGELOG_REL}.

Opciones:
  --paths "<a,b|c d>"  Rutas de la intervencion. Se puede repetir.
  --staged             Usa solo los archivos en el indice.
  --no-fetch           No consulta origin; compara contra la ultima referencia local.
  --json               Salida legible por maquina (usa npm run --silent para pipeline).
  --help               Esta ayuda.

Sin --paths, usa los commits no publicados y el arbol de trabajo.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const branch = git(['branch', '--show-current'], { allowFailure: true }) || 'DETACHED';
  if (branch !== BRANCH) {
    fail(`La rama activa es "${branch}"; la cobertura de contexto solo aplica en "${BRANCH}".`);
  }

  let fetched = false;
  if (options.fetch) {
    try {
      git(['fetch', '--quiet', REMOTE, BRANCH], { timeout: 20000 });
      fetched = true;
    } catch {
      fetched = false;
    }
  }

  const paths = collectPaths(options);
  const routing = routePaths(paths);
  const localRegistry = readJsonFile(path.join(ROOT, REGISTRY_REL));
  let remoteRegistry = { agents: [] };
  try {
    remoteRegistry = JSON.parse(git(['show', `${REMOTE}/${BRANCH}:${REGISTRY_REL}`]));
  } catch {
    if (!options.json) console.warn(`[agents:coverage] Sin ${REGISTRY_REL} en ${REMOTE}/${BRANCH}; se asume registro vacio.`);
  }

  const changelogPath = path.join(ROOT, CHANGELOG_REL);
  const changelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
  const result = evaluateCoverage({
    routing,
    localAgents: new Map((localRegistry.agents || []).map((entry) => [entry.name, entry])),
    remoteAgents: new Map((remoteRegistry.agents || []).map((entry) => [entry.name, entry])),
    changelog
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          branch,
          remote: `${REMOTE}/${BRANCH}`,
          fetched,
          paths,
          owners: result.rows,
          ok: result.ok
        },
        null,
        2
      )
    );
  } else {
    console.log(`[agents:coverage] rama: ${branch} | rutas: ${paths.length} | fetch: ${fetched ? 'si' : 'no'}`);
    if (!result.rows.length) {
      console.log('  Sin agentes duenos para estas rutas: no se exige actualizacion de contexto.');
    } else {
      const width = Math.max(...result.rows.map((row) => row.owner.length), 10) + 2;
      console.log(`  ${pad('AGENTE', width)}${pad('VERSION', 10)}${pad('FRESCURA', 14)}CHANGELOG  RESULTADO`);
      for (const row of result.rows) {
        const changelogLabel = row.changelogOk ? 'si' : 'NO';
        console.log(
          `  ${pad(row.owner, width)}${pad(row.version || '-', 10)}${pad(row.status, 14)}${pad(changelogLabel, 11)}${row.ok ? 'OK' : 'FALTA'}`
        );
        for (const missing of row.missing) console.log(`      - ${missing}`);
      }
    }
  }

  if (!result.ok) {
    if (!options.json) {
      console.error(
        '\n[agents:coverage] BLOQUEADO: actualiza el agente dueno (control/bump/updated_at), registra la entrada en agents/CHANGELOG.md y corre npm run agents:sync.'
      );
    }
    process.exit(1);
  }
  if (!options.json) console.log('\n[agents:coverage] OK: contexto del equipo actualizado para todas las rutas.');
}

main();
