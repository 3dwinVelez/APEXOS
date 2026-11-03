#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  classifyDocumentFreshness,
  classifyFreshness,
  isBlocking,
  normalizePath,
  routePaths
} = require('./lib/agent-routing');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY_REL = 'agents/registry.json';
const REMOTE = process.env.APEXOS_AGENTS_REMOTE || 'origin';
const BRANCH = process.env.APEXOS_AGENTS_BRANCH || 'desarrollo';

function fail(message) {
  console.error(`[agents:preflight] ${message}`);
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  const normalized = Buffer.from(fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n'), 'utf8');
  return crypto.createHash('sha256').update(normalized).digest('hex');
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
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--staged') {
      options.staged = true;
    } else if (arg === '--no-fetch') {
      options.fetch = false;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--paths' || arg === '--path') {
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
  // Sin trim: el primer renglon de `git status --porcelain` empieza con espacio
  // y recortarlo desplaza el prefijo XY, perdiendo el primer caracter de la ruta.
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

function isDirty(relPath) {
  const status = git(['status', '--porcelain', '--', relPath], { allowFailure: true, trim: false }) || '';
  return status.split(/\r?\n/).some((line) => line.trim());
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: ROOT,
      stdio: 'ignore',
      timeout: 15000
    });
    return true;
  } catch {
    return false;
  }
}

function fromDiff(args) {
  const raw = git(args, { allowFailure: true }) || '';
  return raw
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);
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

function label(entry) {
  return entry ? entry.version : '-';
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function printFreshness(title, rows) {
  console.log(`\n${title}`);
  if (!rows.length) {
    console.log('  (sin entradas)');
    return;
  }
  const nameWidth = Math.max(...rows.map((row) => row.name.length), 8) + 2;
  console.log(`  ${pad('NOMBRE', nameWidth)}${pad('LOCAL', 12)}${pad('REMOTO', 12)}ESTADO`);
  for (const row of rows) {
    const marker = row.blocking ? ' BLOQUEA' : '';
    console.log(`  ${pad(row.name, nameWidth)}${pad(row.localLabel, 12)}${pad(row.remoteLabel, 12)}${row.status}${marker}`);
  }
}

function usage() {
  console.log(`Uso: npm run agents:preflight -- [opciones]

Opciones:
  --paths "<a,b|c d>"  Rutas que la intervencion va a tocar. Se puede repetir.
  --staged             Usa solo los archivos en el indice.
  --no-fetch           No consulta origin; compara contra la ultima referencia local.
  --json               Salida legible por maquina (usa npm run --silent para pipeline).
  --help               Esta ayuda.

Sin --paths, el preflight usa los commits no publicados y el arbol de trabajo.

Veredictos:
  OK                    Sin cambios remotos mas nuevos. Se puede intervenir.
  OK_CON_ADVERTENCIAS   Hay avisos que no bloquean.
  INTEGRAR_REMOTO       origin/desarrollo tiene una version mas nueva: integrar antes de editar.
  CONFLICTO             Misma version y fecha con sha256 distinto: resolver manualmente.
  RAMA_NO_AUTORIZADA    La rama activa no es desarrollo.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const branch = git(['branch', '--show-current'], { allowFailure: true }) || 'DETACHED';
  const head = git(['rev-parse', '--short', 'HEAD'], { allowFailure: true }) || '?';

  let fetched = false;
  if (options.fetch) {
    try {
      git(['fetch', '--quiet', REMOTE, BRANCH], { timeout: 20000 });
      fetched = true;
    } catch {
      fetched = false;
    }
  }

  const remoteHead = git(['rev-parse', '--short', `${REMOTE}/${BRANCH}`], { allowFailure: true }) || '?';
  const paths = collectPaths(options);
  const routing = routePaths(paths);

  const localRegistry = readJson(path.join(ROOT, REGISTRY_REL));
  let remoteRegistry = null;
  let remoteRegistryError = null;
  try {
    remoteRegistry = JSON.parse(git(['show', `${REMOTE}/${BRANCH}:${REGISTRY_REL}`]));
  } catch (error) {
    remoteRegistryError = error.message;
  }

  const localAgents = new Map((localRegistry.agents || []).map((entry) => [entry.name, entry]));
  const remoteAgents = new Map((remoteRegistry?.agents || []).map((entry) => [entry.name, entry]));
  const agentNames = [...new Set([...localAgents.keys(), ...remoteAgents.keys()])].sort();

  const agentRows = agentNames.map((name) => {
    const local = localAgents.get(name) || null;
    const remote = remoteAgents.get(name) || null;
    const status = classifyFreshness(local, remote);
    return {
      name,
      local,
      remote,
      status,
      blocking: isBlocking(status),
      localLabel: label(local),
      remoteLabel: label(remote)
    };
  });

  const governanceTouched = paths.some(
    (file) =>
      file === 'AGENTS.md' ||
      file === 'BRANCHING_WORKFLOW.md' ||
      file.startsWith('agents/') ||
      file.startsWith('.qoder/skills/') ||
      file.startsWith('docs/briefs/')
  );

  const localDocuments = new Map((localRegistry.documents || []).map((entry) => [entry.path, entry]));
  const remoteDocuments = new Map((remoteRegistry?.documents || []).map((entry) => [entry.path, entry]));
  const documentPaths = [...new Set([...localDocuments.keys(), ...remoteDocuments.keys()])].sort();

  const remoteBehind = isAncestor(`${REMOTE}/${BRANCH}`, 'HEAD');

  const documentRows = documentPaths.map((documentPath) => {
    const local = localDocuments.get(documentPath) || null;
    const remote = remoteDocuments.get(documentPath) || null;
    // Una edicion local del mismo dia es avance propio, no conflicto remoto.
    const status = classifyDocumentFreshness(local, remote, {
      localDirty: isDirty(documentPath),
      remoteBehind
    });
    const blocking = governanceTouched && isBlocking(status);
    return {
      name: documentPath,
      local,
      remote,
      status,
      blocking,
      localLabel: local ? local.updated_at : '-',
      remoteLabel: remote ? remote.updated_at : '-'
    };
  });

  const warnings = [];
  if (!fetched) {
    warnings.push('No se pudo consultar origin; la comparacion usa la ultima referencia local.');
  }
  if (remoteRegistryError) {
    warnings.push(`No se pudo leer ${REGISTRY_REL} de ${REMOTE}/${BRANCH}: ${remoteRegistryError.split('\n')[0]}`);
  }
  for (const row of agentRows) {
    if (row.status === 'local-only') warnings.push(`Agente solo local: ${row.name} (aun no publicado).`);
    if (row.local) {
      const sourcePath = path.join(ROOT, row.local.source);
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`Fuente canonica inexistente: ${row.local.source}`);
      } else if (sha256(sourcePath) !== row.local.sha256) {
        warnings.push(`Agente editado sin sincronizar: ${row.name} (corre npm run agents:sync).`);
      }
    }
  }
  if (routing.unmatched.length) {
    warnings.push(`Rutas sin agente asignado: ${routing.unmatched.join(', ')} (usa equipo-apexos).`);
  }

  const branchBlocking = branch !== BRANCH;
  const blockingAgents = agentRows.filter((row) => row.blocking);
  const blockingDocuments = documentRows.filter((row) => row.blocking);

  let verdict = 'OK';
  if (branchBlocking) verdict = 'RAMA_NO_AUTORIZADA';
  else if ([...agentRows, ...documentRows].some((row) => row.status === 'conflict')) verdict = 'CONFLICTO';
  else if (blockingAgents.length || blockingDocuments.length) verdict = 'INTEGRAR_REMOTO';
  else if (warnings.length) verdict = 'OK_CON_ADVERTENCIAS';

  const readings = routing.agents.map((name) => {
    const local = localAgents.get(name);
    return local ? local.source : `.qoder/skills/${name}/SKILL.md`;
  });

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          branch,
          head,
          remote: `${REMOTE}/${BRANCH}`,
          remoteHead,
          fetched,
          verdict,
          blocking: branchBlocking || blockingAgents.length > 0 || blockingDocuments.length > 0,
          paths,
          agents: agentRows.map(({ name, status, blocking, local, remote }) => ({
            name,
            status,
            blocking,
            local: local ? { version: local.version, updated_at: local.updated_at, sha256: local.sha256 } : null,
            remote: remote ? { version: remote.version, updated_at: remote.updated_at, sha256: remote.sha256 } : null
          })),
          documents: documentRows.map(({ name, status, blocking, local, remote }) => ({
            name,
            status,
            blocking,
            local: local ? { updated_at: local.updated_at, sha256: local.sha256 } : null,
            remote: remote ? { updated_at: remote.updated_at, sha256: remote.sha256 } : null
          })),
          routing,
          readings,
          warnings
        },
        null,
        2
      )
    );
  } else {
    console.log(`[agents:preflight] rama: ${branch} | HEAD: ${head} | fetch: ${fetched ? 'si' : 'no'}`);
    console.log(`[agents:preflight] comparacion contra ${REMOTE}/${BRANCH} @ ${remoteHead}`);
    printFreshness('Frescura de agentes', agentRows);
    printFreshness('Frescura de gobernanza', documentRows);

    console.log(`\nRuteo obligatorio (${paths.length} ruta(s))`);
    if (!paths.length) {
      console.log('  (sin rutas: declara --paths "<archivo o directorio>" antes de intervenir)');
    } else if (!routing.matches.length) {
      console.log('  (ninguna ruta coincide; entra por equipo-apexos)');
    } else {
      for (const match of routing.matches) {
        console.log(`  ${match.agent}: ${match.paths.join(', ')}`);
      }
    }

    if (readings.length) {
      console.log('\nLecturas obligatorias antes de editar');
      for (const reading of readings) console.log(`  - ${reading}`);
    }

    if (warnings.length) {
      console.log('\nAdvertencias');
      for (const warning of warnings) console.log(`  - ${warning}`);
    }

    console.log(`\nVeredicto: ${verdict}`);
  }

  const blocking = branchBlocking || blockingAgents.length > 0 || blockingDocuments.length > 0;
  if (blocking) {
    if (!options.json) {
      console.error(
        '\n[agents:preflight] BLOQUEADO: integra origin/desarrollo o resuelve el conflicto antes de editar agentes o gobernanza.'
      );
    }
    process.exit(1);
  }
}

main();
