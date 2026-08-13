# Repository normalization audit - 2026-07-30

Repository: `Nyvora/APEXOS`
Remote: `origin https://github.com/3dwinVelez/APEXOS.git`
Worktree used: `C:\Users\mq1\Documents\Proyectos\APEXOS-worktrees\desarrollo-login-visibility`

## Objective

Normalize the repository conservatively around the mandatory flow:

```text
desarrollo -> develop -> main
```

No remote branch deletion, force push, deployment, remote migration, infrastructure change, or production promotion was executed.

## Backup refs

Local backup tags were created before normalization and were not pushed:

- `backup/repository-normalization-20260730-desarrollo` -> previous `origin/desarrollo` (`dd8c32f`)
- `backup/repository-normalization-20260730-develop` -> previous `origin/develop` (`0131a04`)
- `backup/repository-normalization-20260730-main` -> previous `origin/main` (`4594572`)

Reason for not pushing backups: conservative rule; backup refs can expose unreviewed repository history and require explicit authorization before publication.

## Permanent branch alignment

Before normalization:

- `origin/develop...origin/desarrollo`: `58 3`
- `origin/main...origin/develop`: `14 75`
- `origin/main...origin/desarrollo`: `14 20`

After local retrointegration into `desarrollo`:

- `origin/develop...desarrollo`: `0 20`
- `origin/main...desarrollo`: `0 81`
- `origin/desarrollo...desarrollo`: `0 75`

Result: local `desarrollo` contains the current remote `develop` and `main` histories.

## Integrations performed in desarrollo

- `30aff12 merge: retrointegrate develop into desarrollo`
- `0f144f0 merge: retrointegrate main into desarrollo`
- `docs(governance): document repository normalization` (current audit/governance commit)

Conflicts found while retrointegrating `main`:

- `apps/api/src/modules/accounting/service.js`
- `apps/api/src/modules/purchases/service.js`
- `apps/api/src/security/supabaseAuth.js`
- `apps/web/lib/api.ts`
- `apps/web/lib/sessionSecurity.ts`

Conflict resolution:

- Preserved the payable document transaction implementation and exported both `createPayableDocumentInTransaction` and `createPayableDocumentTx` compatibility names.
- Preserved purchase invoice posting in a single accounting transaction.
- Preserved Supabase auth company/module status query with user RLS context instead of service bypass.
- Preserved both API base URL imports and schedule/session security helpers in web API files.

## Branch inventory

| Branch | Type | Upstream | Last commit | Exclusive state vs local desarrollo | Classification | Action |
| --- | --- | --- | --- | ---: | --- | --- |
| `desarrollo` | local/permanent | `origin/desarrollo` | `0f144f0` | ahead 74 | A | Keep. Local normalized integration branch. |
| `origin/desarrollo` | remote/permanent | none | `dd8c32f` | behind local 74 | A | Do not push without explicit authorization. |
| `develop` | local/permanent | `origin/develop` | `0131a04` | contained in local desarrollo | A | Keep. |
| `origin/develop` | remote/permanent | none | `0131a04` | contained in local desarrollo | A | Keep. No promotion performed. |
| `main` | local/permanent | `origin/main` | `4594572` | contained in local desarrollo | A | Keep. |
| `origin/main` | remote/permanent | none | `4594572` | contained in local desarrollo | A | Keep. No production merge performed. |
| `codex/desarrollo-monitor-company` | local | `origin/desarrollo` | `2bdb948` | contained | C | Candidate for local deletion after explicit approval. |
| `codex/desarrollo-monitor-memberships` | local | `origin/desarrollo` | `6bb07c8` | contained | C | Candidate for local deletion after explicit approval. |
| `codex/desarrollo-service-form` | local | `origin/desarrollo` | `aec7cc0` | contained | C | Candidate for local deletion after explicit approval. |
| `codex/desarrollo-services-fix` | local | `origin/desarrollo` | `80379f2` | contained | C | Candidate for local deletion after explicit approval. |
| `codex/error-fixes-only` | local | `origin/desarrollo` | `8a38713` | contained | C | Candidate for local deletion after explicit approval. |
| `codex/hr-schedule-monitor-refresh` | local | none | `4d9124c` | contained | C | Candidate for local deletion after explicit approval. |
| `codex/promote-main-services-performance` | local | `origin/main` | `03d955e` | worktree branch | E | Keep because it is attached to another worktree. |
| `codex/qa-operational-design-system-v2` | local/remote | `origin/codex/qa-operational-design-system-v2` | local `dd8c32f`, remote `ff2c04a` | UI work represented in `origin/desarrollo` plus remote doc tail | E | Keep; do not delete while remote branch has extra documentation commit. |
| `codex/services-execution-performance` | local/remote | `origin/codex/services-execution-performance` | `8efb91f` | cherry-equivalent patch reported as integrated, branch not ancestor | C/E | Keep until owner confirms cleanup. |
| `codex-user-creation-agile-audit` | local/remote | `origin/codex-user-creation-agile-audit` | `9a22f09` | cherry-equivalent patch reported as integrated, branch not ancestor | C/E | Keep until owner confirms cleanup. |
| `feature/offline-first-technicians` | local/remote | `origin/feature/offline-first-technicians` | `df7b788` | contained | C | Candidate for deletion after explicit approval. |
| `feature/offline-manual-sync` | local | `origin/develop` | `e10d16a` | 5 unique commits; includes migration/test/offline sync changes | B/E | Keep. Requires separate review before integration. |
| `origin/chore/openclaw-agent-foundation` | remote | none | `2fe55f6` | 1 unique commit; purchase/accounting patch | B/E | Keep. Needs selective review because branch diff touches older base. |
| `origin/codex/perf-runtime-root-cause` | remote | none | `0131a04` | same as `origin/develop` | C | Candidate for remote cleanup after explicit approval. |
| `origin/codex/perf-ui-remediation` | remote | none | `fd07058` | 4 unique commits; UI docs/refactor | B/E | Keep. Needs selective review before integration. |

## Branches deleted

- Local branches deleted: none.
- Remote branches deleted: none.

Reason: the task required conservative handling and explicit authorization for destructive operations. Ambiguous branches remain documented.

## Validations

Executed in local `desarrollo` after retrointegration:

- `npm install`: completed. NPM reported 12 high severity vulnerabilities; no automatic remediation was run.
- `npm --workspace apps/web run typecheck`: passed.
- `npm --workspace apps/web run lint`: passed.
- `npm --workspace apps/web run build`: passed.
- `npm run prisma:validate`: initially blocked by missing `DATABASE_URL`; passed with local placeholder `postgresql://apex:apex_dev_password@localhost:54320/apexos`.
- Selected API tests with local env (`DATABASE_URL`, `JWT_SECRET`, `DISABLE_REDIS=true`): passed, 16/16.
- `npm --workspace apps/web run test:offline`: failed, 40/49 passing. The same 9 failures were reproduced on clean local `develop`, so they are classified as preexisting.
- `gitleaks`: unavailable in local PATH.
- Secret scan with `rg`: executed with secret-oriented patterns; findings require manual review and no secret values are published in this report.

API test support update:

- `apps/api/test/supabase-auth-modules.test.js` mock was aligned with current service calls (`tenant.findFirst`, `user`, `role`, and `permission` helpers) so the existing contract test can execute under the normalized code.

Generated file handling:

- `apps/web/next-env.d.ts` was modified by `next build` and restored before commit.

## Commands executed

Representative command list:

```bash
git status
git remote -v
git fetch --all --prune
git branch -vv
git branch -a
git log --all --graph --decorate --oneline --date-order --max-count=250
git tag backup/repository-normalization-20260730-desarrollo origin/desarrollo
git tag backup/repository-normalization-20260730-develop origin/develop
git tag backup/repository-normalization-20260730-main origin/main
git merge --no-ff origin/develop -m "merge: retrointegrate develop into desarrollo"
git merge --no-ff origin/main -m "merge: retrointegrate main into desarrollo"
git add apps/api/src/modules/accounting/service.js apps/api/src/modules/purchases/service.js apps/api/src/security/supabaseAuth.js apps/web/lib/api.ts apps/web/lib/sessionSecurity.ts
git commit --no-edit
npm install
npm --workspace apps/web run typecheck
npm --workspace apps/web run lint
npm --workspace apps/web run build
npm run prisma:validate
npm --workspace apps/web run test:offline
node --test apps/api/test/purchase-invoice-transaction.test.js apps/api/test/purchases-invoice-transaction.test.js apps/api/test/purchases-supplier-flow.test.js apps/api/test/supabase-auth-modules.test.js apps/api/test/accounting-routes-contract.test.js apps/api/test/rbac-module-access.test.js apps/api/test/supabase-company-context.test.js
git rev-list --left-right --count origin/develop...HEAD
git rev-list --left-right --count origin/main...HEAD
git rev-list --left-right --count origin/desarrollo...HEAD
git cherry -v HEAD <branch>
git diff --stat HEAD..<branch>
```

## Pushes and promotions

- Pushes performed: none.
- Promotions to `develop`: none.
- Promotions to `main`: none.
- Deployments: none.
- Remote migrations: none.

## Recommended next actions

1. Review and approve whether local `desarrollo` should be pushed to `origin/desarrollo`.
2. Review branches classified as `B/E` before any integration:
   - `feature/offline-manual-sync`
   - `origin/chore/openclaw-agent-foundation`
   - `origin/codex/perf-ui-remediation`
3. After approval, remove only branches proven integrated or obsolete.
4. Configure GitHub branch protections for `desarrollo`, `develop`, and `main`.
5. Add CI checks for source/target branch validation and secret detection.
6. Fix or formally retire the 9 preexisting offline test failures.
7. Run dependency security remediation in a separate controlled task.

## Final verdict

APROBADO CON OBSERVACIONES.

The permanent branch relationship is locally ordered because `develop` and `main` were retrointegrated into `desarrollo`. Remote state was intentionally not changed. Some auxiliary branches still require manual review before cleanup or selective integration, and offline tests have preexisting failures that must be addressed separately.
