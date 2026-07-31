# Controlled branch consolidation - 2026-07-30

Repository: `Nyvora/APEXOS`
Branch used: `desarrollo`
Remote: `origin https://github.com/3dwinVelez/APEXOS.git`

## Scope

This phase continued the previous repository normalization and prepared local daily operation from `desarrollo`.

No new working branch was created. No push, force push, remote branch deletion, deployment, remote migration, Railway change, Supabase change, or shared history rewrite was executed.

## Pre-checks

Executed:

```bash
git status
git branch --show-current
git remote -v
git fetch --all --prune
git branch -vv
git branch -a
git log --all --graph --decorate --oneline --date-order --max-count=250
```

Confirmed:

- Active branch: `desarrollo`.
- Worktree was clean before this phase.
- Remote points to `https://github.com/3dwinVelez/APEXOS.git`.
- Local `desarrollo` was ahead of `origin/desarrollo` with the prior normalized commits.

## Backup refs

Local backup tags were created and not pushed:

- `backup/pre-consolidation-desarrollo-20260730`
- `backup/pre-consolidation-develop-20260730`
- `backup/pre-consolidation-main-20260730`
- `backup/pre-consolidation-codex-desarrollo-monitor-company-20260730`
- `backup/pre-consolidation-codex-desarrollo-monitor-memberships-20260730`
- `backup/pre-consolidation-codex-desarrollo-service-form-20260730`
- `backup/pre-consolidation-codex-desarrollo-services-fix-20260730`
- `backup/pre-consolidation-codex-error-fixes-only-20260730`
- `backup/pre-consolidation-codex-hr-schedule-monitor-refresh-20260730`
- `backup/pre-consolidation-codex-qa-operational-design-system-v2-20260730`
- `backup/pre-consolidation-codex-services-execution-performance-20260730`
- `backup/pre-consolidation-codex-user-creation-agile-audit-20260730`
- `backup/pre-consolidation-feature-offline-first-technicians-20260730`
- `backup/pre-consolidation-feature-offline-manual-sync-20260730`
- `backup/pre-consolidation-origin-chore-openclaw-agent-foundation-20260730`
- `backup/pre-consolidation-origin-codex-perf-runtime-root-cause-20260730`
- `backup/pre-consolidation-origin-codex-perf-ui-remediation-20260730`
- `backup/pre-consolidation-origin-codex-qa-operational-design-system-v2-20260730`
- `backup/pre-consolidation-origin-codex-services-execution-performance-20260730`
- `backup/pre-consolidation-origin-codex-user-creation-agile-audit-20260730`
- `backup/pre-consolidation-origin-feature-offline-first-technicians-20260730`

## Branch and prototype matrix

| Source | Classification | Decision | Evidence |
| --- | --- | --- | --- |
| `origin/codex/perf-ui-remediation` | C, prototype useful | Recovered documentation only. Code refactor was not integrated. | Branch deletes UI primitives and adds UI remediation docs. |
| `feature/offline-manual-sync` | C/G, useful but risky prototype | Recovered documentation only. Backend/frontend sync code, migration, and evidence binaries were not integrated. | Diff includes offline writes, Prisma migration, sync processor/client, tests, and large evidence images. |
| `origin/chore/openclaw-agent-foundation` | B/G | Kept for manual review. | Single purchase/accounting commit exists on older base; equivalent logic appears partially integrated through current purchase transaction work, but exact content is not proven safe for blind merge. |
| `origin/codex/perf-runtime-root-cause` | B, already integrated | No action. | Same commit as `origin/develop`; `develop` is contained in local `desarrollo`. |
| `origin/codex/qa-operational-design-system-v2` | B, already integrated | No action. | Remote branch is merged in local `desarrollo`. |
| `origin/codex/services-execution-performance` | B/F | No code action. | `git cherry` reports patch-equivalent integration; branch remains non-ancestor and requires cleanup approval. |
| `origin/codex-user-creation-agile-audit` | B/F | No code action. | `git cherry` reports patch-equivalent integration; branch remains non-ancestor and requires cleanup approval. |
| `origin/feature/offline-first-technicians` | B, already integrated | No action. | Contained in local `desarrollo`. |
| Local `codex/desarrollo-*`, `codex/error-fixes-only`, `codex/hr-schedule-monitor-refresh` | B, already integrated | No deletion in this phase. | Contained in local `desarrollo`, but branch deletion requires explicit authorization. |

## Recovered into desarrollo

From `origin/codex/perf-ui-remediation`:

- `docs/design/APEXOS_SCREEN_PERFORMANCE_CHECKLIST.md`
- `docs/performance/APEXOS_UI_ADOPTION_INVENTORY.md`
- `docs/performance/APEXOS_UI_REMEDIATION_RAW_RESULTS.json`
- `docs/performance/APEXOS_UI_REMEDIATION_REPORT.md`
- `docs/performance/APEXOS_UI_SCREEN_MIGRATION_MATRIX.md`

From `feature/offline-manual-sync`:

- `docs/offline/OFFLINE_MANUAL_SYNC_CONTRACT.md`
- `docs/offline/OFFLINE_PHASE_5_CERTIFICATE.md`
- `docs/offline/OFFLINE_PHASE_5_EXECUTION_REPORT.md`
- `docs/offline/OFFLINE_TEST_CLOCK_STRATEGY.md`

## Deliberately not integrated

- Deletion of UI primitive files from `origin/codex/perf-ui-remediation`.
- Offline manual sync backend/frontend implementation from `feature/offline-manual-sync`.
- Offline Prisma migration from `feature/offline-manual-sync`.
- Offline evidence PNG files from `feature/offline-manual-sync`.
- Purchase/accounting patch from `origin/chore/openclaw-agent-foundation`, pending exact manual review.

Reason: these changes are mixed with older base state, migrations, experimental behavior, or deletions that could degrade current `desarrollo`.

## Local operation prepared

Created:

- `scripts/windows/start-apexos-desarrollo.bat`
- `scripts/windows/start-apexos-desarrollo.ps1`
- `docs/governance/LOCAL_DESARROLLO_STARTUP.md`

The launcher:

- Detects repository root.
- Requires Git, Node.js, and npm.
- Stops on local changes.
- Switches safely to `desarrollo` only when clean.
- Fetches and only fast-forwards from `origin/desarrollo`.
- Blocks divergence.
- Requires local `.env`.
- Blocks QA/PROD markers in local env files.
- Runs reproducible dependency install only when required.
- Runs Prisma validate and web TypeScript checks.
- Starts only local infrastructure/API/web terminals.

## Promotion scripts prepared

Created dry-run/safe scripts:

- `scripts/git/promote-desarrollo-to-develop.ps1`
- `scripts/git/promote-develop-to-main.ps1`

They do not run inside the local launcher and block by default unless explicit metadata and confirmation are supplied.

## Environment guardrails

Created:

- `docs/governance/ENVIRONMENT_MATRIX.md`

Local startup blocks these markers in `.env` or `config/local.env`:

- QA Supabase project ref.
- PROD Supabase project ref.
- `supabase.co`.
- `pooler.supabase.com`.
- `railway.app`.

## Validation performed in this phase

- PowerShell syntax parse for all new `.ps1` scripts: passed after one correction.
- `package.json` parse with Node.js: passed.
- `git diff --check`: passed, only line-ending warnings from Git on Windows.
- Initializer scenario 3 was exercised implicitly before commit: dirty worktree blocks startup.
- Initializer clean scenario was exercised after commit: blocked safely because local `.env` is missing.
- Promotion dry-run `desarrollo -> develop`: passed and generated evidence in `%TEMP%\apexos-promotion-dryrun`.
- Promotion dry-run `develop -> main` from `desarrollo`: blocked safely because the active branch is not `develop`.
- Secret-pattern scan over files in the final commit: no matches.
- Full runtime launcher scenario is blocked until local `.env` exists. This is expected and safe.

Previously validated normalized `desarrollo`:

- Web typecheck: passed.
- Web lint: passed.
- Web build: passed.
- Prisma validate: passed with local DATABASE_URL.
- Selected API tests: 16/16 passed.
- Offline web tests: 40/49 passed; same 9 failures reproduced on clean `develop`, classified preexisting.

## Branch deletion

- Local branches deleted: none.
- Remote branches deleted: none.

Reason: explicit authorization is still required, and some auxiliary branches remain ambiguous.

## Pushes

- Pushes performed: none.

## Dictamen

APROBADO CON OBSERVACIONES.

`desarrollo` remains the local integration branch and now contains the recovered safe documentation plus local startup and promotion guardrails. Code-bearing ambiguous prototypes remain isolated and documented for explicit review before any future integration or cleanup.
