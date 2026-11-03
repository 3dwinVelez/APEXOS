'use strict';

const { compareVersions } = require('./agent-routing');

function versionBumpError({ name, previous, next }) {
  if (!previous || !previous.sha256 || !previous.version) return null;
  if (previous.sha256 === next.sha256) return null;
  const comparison = compareVersions(next.version, previous.version);
  if (comparison > 0) return null;
  const direction = comparison < 0 ? 'retrocede' : 'no avanza';
  return `${name}: contenido modificado sin bump de version (${previous.version} -> ${next.version}, ${direction})`;
}

module.exports = { versionBumpError };
