#!/usr/bin/env bash
# Runner local de la certificacion QA del borrado fisico de mallas.
# No contiene secretos: lee SUPABASE_DB_PASSWORD del .env local y las credenciales
# de QA de config/qa-cloud.env (ambos gitignored). Autorizado por el usuario el
# 2026-09-23 para conectar localmente a la BD de QA (proyecto jbirkghkekuifgfsgquq).
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a
source .env
source config/qa-cloud.env
source config/qa.env
set +a
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD requerida en .env}"
export DATABASE_URL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.jbirkghkekuifgfsgquq.supabase.co:5432/postgres?sslmode=require"
export NEXT_PUBLIC_SUPABASE_URL="https://jbirkghkekuifgfsgquq.supabase.co"
exec node scripts/certifications/hr-route-physical-deletion-qa.js "$@"
