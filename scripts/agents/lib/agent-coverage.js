'use strict';

const { classifyFreshness } = require('./agent-routing');

const ACCEPTED_FRESHNESS = new Set(['local-ahead', 'local-only']);

function latestChangelogSection(text) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+/.test(line));
  if (start === -1) return '';
  const body = [];
  for (let index = start; index < lines.length; index += 1) {
    if (index > start && /^##\s+/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join('\n');
}

function mentionsAgent(text, agent) {
  const escaped = String(agent).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9-])${escaped}([^A-Za-z0-9-]|$)`).test(String(text || ''));
}

function evaluateCoverage({ routing, localAgents, remoteAgents, changelog }) {
  const local = localAgents instanceof Map ? localAgents : new Map(Object.entries(localAgents || {}));
  const remote = remoteAgents instanceof Map ? remoteAgents : new Map(Object.entries(remoteAgents || {}));
  const section = latestChangelogSection(changelog);

  const rows = (routing.owners || []).map((owner) => {
    const localEntry = local.get(owner) || null;
    const remoteEntry = remote.get(owner) || null;
    const status = localEntry ? classifyFreshness(localEntry, remoteEntry) : 'unknown';
    const versionOk = ACCEPTED_FRESHNESS.has(status);
    const changelogOk = mentionsAgent(section, owner);
    const paths = (routing.ownerMatches || []).find((match) => match.owner === owner)?.paths || [];
    return {
      owner,
      paths,
      status,
      version: localEntry ? localEntry.version : null,
      versionOk,
      changelogOk,
      ok: versionOk && changelogOk,
      missing: [
        versionOk ? null : `sin bump local frente a origin (estado ${status})`,
        changelogOk ? null : 'sin entrada en la seccion mas reciente de agents/CHANGELOG.md'
      ].filter(Boolean)
    };
  });

  return {
    rows,
    pending: rows.filter((row) => !row.ok),
    ok: rows.every((row) => row.ok)
  };
}

module.exports = {
  ACCEPTED_FRESHNESS,
  evaluateCoverage,
  latestChangelogSection,
  mentionsAgent
};
