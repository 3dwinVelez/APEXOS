# Environment Management

APEXOS/NYVORA uses explicit environment files under `config/` to avoid mixing LOCAL, QA and PRODUCCION.

## Files

- `config/local.env`: local development only. It must point to localhost services.
- `config/qa.env`: QA only. It must point to Supabase QA `jbirkghkekuifgfsgquq`.
- `config/production.env`: production only. It must point to Supabase PROD `jzbwzmkidfthknsohhnr`.
- `config/.env.example`: versioned placeholder template.

Real files are ignored by Git. Do not commit `config/*.env`.

## Doctor

Run:

```powershell
npm.cmd run env:doctor:local
npm.cmd run env:doctor:qa
npm.cmd run env:doctor:prod
```

The doctor masks secrets and aborts if it detects environment mixing, for example PROD with localhost, QA with the PROD ref, or LOCAL with Railway production URLs.

## Platform Initialization

Production initialization must load only `config/production.env`:

```powershell
npm.cmd run platform:init:prod -- --dry-run --first-name "Edwin Hernan" --last-name "Velez Urrego" --document "1039458720" --email "ehvelez092@gmail.com" --username "ehvelez" --password "<temporary-password>"
```

Then run the same command with `--execute` only after the dry-run confirms the PROD project ref.

QA initialization must load only `config/qa.env`:

```powershell
npm.cmd run platform:init:qa -- --dry-run
```

## Rotation

After creating or rotating credentials:

1. Update only the corresponding ignored file under `config/`.
2. Run the matching `env:doctor:*`.
3. Confirm `git status --short` does not list real env files.
4. Never paste full secrets in docs, commits, issue comments or logs.

## Obsolete Or Legacy Inputs

The root `.env` may still exist for older local flows, but critical production commands must not depend on it. Prefer `config/*.env` plus `--env-file`.
