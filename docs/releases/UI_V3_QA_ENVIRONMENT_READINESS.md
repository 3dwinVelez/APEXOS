# UI V3 - Readiness de configuracion QA

Fecha: 2026-08-04.

## Alcance ejecutado

Esta verificacion se ejecuto exclusivamente desde `desarrollo`, sin modificar
`develop`, sin merge, sin push, sin deploy QA, sin migraciones y sin cambios en
Railway/Supabase.

Objetivo: recuperar o validar de forma segura la configuracion local QA necesaria
para retomar la promocion controlada `desarrollo -> develop`.

## Estado de ramas

- `origin/desarrollo`: `254d3fc89ca220ff8fadfd978a448c2e000d7c75`.
- `origin/develop`: `76dadade39c24653648aebf0c1b20f3f670d45f5`.
- `origin/main`: `2678100e23bfcbb025dacb7bb2903a9f3dc07329`.
- Divergencia `origin/develop...origin/desarrollo`: 3 commits exclusivos en
  `develop` y 18 commits exclusivos en `desarrollo`.
- No hay diferencias entre `origin/develop..origin/desarrollo` en:
  `apps/api/prisma`, `scripts/migrations`, `supabase`, `infra`, `.github`,
  `railway.json`, `railway.toml`, `package.json`, `package-lock.json`,
  `apps/web/package.json` ni `apps/api/package.json`.

## Configuracion QA esperada

Segun `config/README.md`, `config/qa.env` debe apuntar al proyecto Supabase QA
`jbirkghkekuifgfsgquq`. Los archivos reales `config/*.env` estan ignorados por
Git y no deben versionarse.

Las validaciones obligatorias bloquean mezclas de entorno:

- `npm run env:doctor:qa` exige `EXPECTED_ENVIRONMENT=qa`,
  `TARGET_ENV=qa`, `EXPECTED_SUPABASE_PROJECT_REF`, `DATABASE_URL`,
  `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` y `JWT_SECRET`.
- `scripts/security/inspect-rls-deployment.js --target=qa` cancela antes de
  conectar si `EXPECTED_ENVIRONMENT` no es `qa`, si
  `EXPECTED_SUPABASE_PROJECT_REF` no coincide con `SUPABASE_URL`, o si
  `DATABASE_URL` no contiene la referencia del proyecto QA.

## Hallazgos

- En el worktree de `desarrollo` no existe `config/qa.env`.
- `config/qa.env` esta correctamente ignorado por `.gitignore` mediante
  `config/*.env`.
- Se encontro una copia local ignorada en
  `C:\Users\mq1\Documents\Proyectos\APEXOS\config\qa.env`, pero no se copio ni
  se reutilizo porque no cumple las guardas actuales:
  - no declara `EXPECTED_ENVIRONMENT`;
  - no declara `EXPECTED_SUPABASE_PROJECT_REF`;
  - `DATABASE_URL` no contiene la referencia QA `jbirkghkekuifgfsgquq`;
  - `DIRECT_URL` no contiene la referencia QA `jbirkghkekuifgfsgquq`;
  - no contiene la referencia productiva prohibida `jzbwzmkidfthknsohhnr`.

Este hallazgo coincide con el antecedente documentado en
`docs/RLS_DEPLOYMENT_VALIDATION.md`: una configuracion QA previa combinaba
Supabase remoto con base de datos local, por lo que la inspeccion de catalogo QA
no podia declararse autoritativamente validada.

## Validaciones read-only ejecutadas

```text
git rev-parse --show-toplevel
git branch --show-current
git status --short
git remote -v
git fetch origin --prune
git rev-list --left-right --count origin/develop...origin/desarrollo
git log --oneline --left-right --cherry-pick origin/develop...origin/desarrollo --max-count=30
git diff --name-status origin/develop..origin/desarrollo -- apps/api/prisma scripts/migrations supabase infra .github railway.json railway.toml package.json package-lock.json apps/web/package.json apps/api/package.json
git check-ignore -v config/qa.env
npm run env:doctor:qa
node scripts/security/inspect-rls-deployment.js --target=qa --env-file=config/qa.env
```

Resultado:

- `npm run env:doctor:qa`: falla por ausencia de `config/qa.env`.
- `inspect-rls-deployment`: no puede validar QA porque falta el archivo de
  entorno requerido.
- No se ejecuto ninguna conexion remota ni escritura sobre QA.
- No se generaron cambios en `develop`, `main`, Railway, Supabase ni migraciones.

## Dictamen

NO APTO -- CONFIGURACION QA

La promocion hacia `develop` no debe retomarse hasta reconstruir
`config/qa.env` con credenciales QA reales y verificables para el proyecto
`jbirkghkekuifgfsgquq`, incluyendo una `DATABASE_URL`/`DIRECT_URL` remota del
mismo proyecto, y hasta que pasen `env:doctor:qa` y la inspeccion RLS/Storage
read-only contra QA.

## Condicion para desbloqueo

Para emitir `APTO PARA RETOMAR PROMOCION A DEVELOP`, se debe completar:

1. Crear o restaurar localmente `config/qa.env` sin versionarlo.
2. Confirmar que contiene `EXPECTED_ENVIRONMENT=qa`,
   `TARGET_ENV=qa` y `EXPECTED_SUPABASE_PROJECT_REF=jbirkghkekuifgfsgquq`.
3. Confirmar que `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `DATABASE_URL` y `DIRECT_URL` corresponden al mismo proyecto QA.
4. Ejecutar `npm run env:doctor:qa` sin errores.
5. Ejecutar inspeccion RLS/Storage read-only contra QA sin diferencias criticas.
