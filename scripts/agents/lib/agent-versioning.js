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

/**
 * Nivel de una diferencia entre la fecha registrada de un documento y la fecha del ultimo commit
 * que lo toco EN LA RAMA ACTUAL. La fecha es un hecho de la historia de la rama, no del contenido:
 * un contrato promocionado a otra rama aterriza con otro commit y el mismo sha, y bloquearlo dejaria
 * la puerta de agentes en rojo justo donde el contrato tiene que correr.
 */
function documentDriftLevel({ shaMatches, gitDate, registryDate }) {
  if (!shaMatches) return 'error';
  return gitDate === registryDate ? 'ok' : 'aviso';
}

module.exports = { versionBumpError, documentDriftLevel };
