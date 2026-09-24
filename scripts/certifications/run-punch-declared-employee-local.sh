#!/usr/bin/env bash
# Runner LOCAL de la certificacion de marcaciones con empleado declarado.
# Arranca la API contra el Postgres local de desarrollo (infra, puerto 55432).
# El .env raiz aporta JWT_SECRET; su DATABASE_URL (obsoleto, 54320) se sobreescribe
# de forma explicita y load-env nunca pisa variables ya definidas.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

set -a
if [ -f .env ]; then source .env; fi
set +a

export DATABASE_URL="postgresql://apex:${LOCAL_DB_PASSWORD:-apex_dev_password}@localhost:55432/apexos"
export DISABLE_REDIS="${DISABLE_REDIS:-true}"

exec node scripts/certifications/hr-punch-declared-employee-local.js "$@"
