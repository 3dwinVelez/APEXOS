'use strict';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

const BLOCKING_STATUSES = new Set(['remote-newer', 'remote-only', 'conflict']);

const ROLE_ORDER = [
  'equipo-apexos',
  'apexos-brief',
  'apexos-git-guardian',
  'apexos-db-nube',
  'apexos-backend',
  'apexos-seguridad',
  'apexos-frontend',
  'apexos-performance',
  'apexos-qa',
  'apexos-auditor-marcaciones',
  'apexos-auditor-nomina'
];

const ROUTES = [
  { id: 'frontend', test: /^apps\/web\//, agents: ['apexos-frontend', 'apexos-qa'] },
  {
    id: 'api-prisma',
    test: /^apps\/api\/prisma\//,
    agents: ['apexos-db-nube', 'apexos-backend', 'apexos-seguridad', 'apexos-qa']
  },
  { id: 'api-hr', test: /^apps\/api\/src\/modules\/hr\//, agents: ['apexos-backend', 'apexos-qa'] },
  { id: 'api-src', test: /^apps\/api\/src\//, agents: ['apexos-backend', 'apexos-seguridad', 'apexos-qa'] },
  { id: 'api-tests', test: /^apps\/api\/test\//, agents: ['apexos-qa'] },
  { id: 'control-tower', test: /^apps\/control-tower\//, agents: ['apexos-performance', 'apexos-seguridad', 'apexos-qa'] },
  { id: 'design-docs', test: /^docs\/design\//, agents: ['apexos-frontend'] },
  {
    id: 'ui-docs',
    test: /^docs\/project\/(filosofia-producto-ui|validacion-frontend-css)\.md$/,
    agents: ['apexos-frontend']
  },
  { id: 'qa-evidence', test: /^(docs\/qa\/|scripts\/certifications\/)/, agents: ['apexos-qa'] },
  { id: 'performance', test: /^(scripts\/performance\/|docs\/PERFORMANCE_)/, agents: ['apexos-performance'] },
  { id: 'infra', test: /^(infra\/|Dockerfile|docker-compose\.yml$)/, agents: ['apexos-performance', 'apexos-seguridad'] },
  {
    id: 'agents-governance',
    test: /^(agents\/|\.qoder\/skills\/|AGENTS\.md$|BRANCHING_WORKFLOW\.md$)/,
    agents: ['equipo-apexos', 'apexos-brief', 'apexos-git-guardian']
  },
  { id: 'briefs', test: /^docs\/briefs\//, agents: ['apexos-brief', 'equipo-apexos'] },
  { id: 'scripts-tests', test: /^scripts\/test\//, agents: ['apexos-qa'] },
  { id: 'scripts', test: /^(scripts\/|package\.json$|package-lock\.json$)/, agents: ['equipo-apexos', 'apexos-qa'] }
];

function parseVersion(value) {
  const match = String(value || '').trim().match(SEMVER);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error(`Version semver invalida: ${left} / ${right}`);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function classifyFreshness(local, remote) {
  if (!local && !remote) return 'unknown';
  if (!local) return 'remote-only';
  if (!remote) return 'local-only';

  const comparison = compareVersions(local.version, remote.version);
  if (comparison < 0) return 'remote-newer';
  if (comparison > 0) return 'local-ahead';

  const localDate = String(local.updated_at || '').trim();
  const remoteDate = String(remote.updated_at || '').trim();
  if (remoteDate > localDate) return 'remote-newer';
  if (localDate > remoteDate) return 'local-ahead';

  if (local.sha256 && remote.sha256 && local.sha256 !== remote.sha256) return 'conflict';
  return 'in-sync';
}

function classifyDocumentFreshness(local, remote) {
  if (!local && !remote) return 'unknown';
  if (!local) return 'remote-only';
  if (!remote) return 'local-only';

  const localDate = String(local.updated_at || '').trim();
  const remoteDate = String(remote.updated_at || '').trim();
  if (remoteDate > localDate) return 'remote-newer';
  if (localDate > remoteDate) return 'local-ahead';

  if (local.sha256 && remote.sha256 && local.sha256 !== remote.sha256) return 'conflict';
  return 'in-sync';
}

function isBlocking(status) {
  return BLOCKING_STATUSES.has(status);
}

function normalizePath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function routePaths(paths) {
  const matched = new Map();
  const unmatched = [];

  for (const raw of paths || []) {
    const file = normalizePath(raw);
    if (!file) continue;
    let hits = 0;
    for (const rule of ROUTES) {
      if (!rule.test.test(file)) continue;
      hits += 1;
      for (const agent of rule.agents) {
        if (!matched.has(agent)) matched.set(agent, new Set());
        matched.get(agent).add(file);
      }
    }
    if (!hits) unmatched.push(file);
  }

  if (matched.size >= 2 && !matched.has('equipo-apexos')) {
    matched.set('equipo-apexos', new Set(['<tarea-multidisciplinaria>']));
  }

  const agents = [...matched.keys()].sort((a, b) => {
    const left = ROLE_ORDER.indexOf(a);
    const right = ROLE_ORDER.indexOf(b);
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right) || a.localeCompare(b);
  });

  return {
    agents,
    matches: agents.map((agent) => ({ agent, paths: [...matched.get(agent)].sort() })),
    unmatched
  };
}

module.exports = {
  ROLE_ORDER,
  ROUTES,
  classifyDocumentFreshness,
  classifyFreshness,
  compareVersions,
  isBlocking,
  normalizePath,
  routePaths
};
