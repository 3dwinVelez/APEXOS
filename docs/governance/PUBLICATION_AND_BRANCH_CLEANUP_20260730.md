# Publication and branch cleanup - 2026-07-30

Repository: `Nyvora/APEXOS`
Remote: `origin https://github.com/3dwinVelez/APEXOS.git`
Execution branch: `desarrollo`

## Objective

Publish the locally normalized `desarrollo` branch and clean auxiliary branches only when their useful content is integrated, superseded, or explicitly discarded.

No promotion to `develop` or `main` was performed. No force push, history rewrite, rebase, deployment, Supabase change, Railway change, or remote migration was performed.

## Pre-publication verification

Commands executed:

```bash
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git status --short
git worktree list
git branch -vv
git fetch origin --prune
git rev-list --left-right --count origin/desarrollo...HEAD
git merge-base --is-ancestor origin/desarrollo HEAD
git merge-base --is-ancestor origin/develop HEAD
git merge-base --is-ancestor origin/main HEAD
```

Result:

- Worktree: clean.
- Active branch: `desarrollo`.
- Remote: expected GitHub repository.
- `origin/desarrollo...HEAD`: `0 76`.
- `origin/desarrollo` was an ancestor of `HEAD`.
- `origin/develop` was an ancestor of `HEAD`.
- `origin/main` was an ancestor of `HEAD`.

## Publication

Executed:

```bash
git push origin desarrollo
```

Result:

```text
dd8c32f..598539e  desarrollo -> desarrollo
```

Post-push:

- `origin/desarrollo...HEAD`: `0 0`.
- `origin/desarrollo` points to `598539e`.

## Remote branch audit after publication

| Remote branch | Evidence | Decision |
| --- | --- | --- |
| `origin/codex/perf-runtime-root-cause` | Ancestor of `origin/desarrollo`; no exclusive commits. | Deleted. |
| `origin/codex/qa-operational-design-system-v2` | Ancestor of `origin/desarrollo`; no exclusive commits. | Deleted. |
| `origin/feature/offline-first-technicians` | Ancestor of `origin/desarrollo`; no exclusive commits. | Deleted. |
| `origin/codex/services-execution-performance` | `git cherry -v origin/desarrollo` showed patch-equivalent commit with `-`. | Deleted as superseded. |
| `origin/codex-user-creation-agile-audit` | `git cherry -v origin/desarrollo` showed patch-equivalent commit with `-`. | Deleted as superseded. |
| `origin/codex/perf-ui-remediation` | Documentation was recovered into `desarrollo`; code refactor/deletions were deliberately discarded as experimental. | Deleted as processed/discarded. |
| `origin/chore/openclaw-agent-foundation` | Contains `+ 2fe55f6 fix(purchases): reuse invoice transaction`; not patch-equivalent and not ancestor. | Conserved. |

Remote deletion command:

```bash
git push origin --delete codex/perf-runtime-root-cause codex/perf-ui-remediation codex/qa-operational-design-system-v2 codex/services-execution-performance codex-user-creation-agile-audit feature/offline-first-technicians
```

Post-prune remote branches:

- `origin/chore/openclaw-agent-foundation`
- `origin/desarrollo`
- `origin/develop`
- `origin/main`

## Local cleanup

Deleted with `git branch -d`:

- `codex/desarrollo-monitor-company`
- `codex/desarrollo-monitor-memberships`
- `codex/desarrollo-service-form`
- `codex/desarrollo-services-fix`
- `codex/error-fixes-only`
- `codex/hr-schedule-monitor-refresh`
- `feature/offline-first-technicians`
- `codex/qa-operational-design-system-v2`
- `codex/promote-main-services-performance`

Deleted with `git branch -D` after `git branch -d` refused and patch-equivalence was verified:

- `codex-user-creation-agile-audit`
- `codex/services-execution-performance`

Removed clean auxiliary worktrees:

- `C:\Users\mq1\Documents\Proyectos\APEXOS-worktrees\audit-login-visibility`
- `C:\Users\mq1\Documents\Proyectos\APEXOS-worktrees\services-execution-performance`
- `C:\Users\mq1\Documents\Proyectos\APEXOS-worktrees\promote-main-services-performance`

The main workspace `C:\Users\mq1\Documents\Proyectos\APEXOS` was switched from the deleted auxiliary UI branch to `main` so the branch could be removed without deleting the main folder.

## Branches intentionally conserved

Remote:

- `origin/chore/openclaw-agent-foundation`: conserved because it has one unique non-equivalent purchase/accounting commit. It must be reviewed separately before integration or deletion.

Local:

- `feature/offline-manual-sync`: conserved because it contains an offline manual sync prototype with implementation, migration, tests, and evidence not fully integrated into `desarrollo`. Documentation was recovered earlier, but the code remains intentionally isolated.

Permanent branches:

- `desarrollo`
- `develop`
- `main`

## Final state

Remote:

```text
origin/chore/openclaw-agent-foundation
origin/desarrollo
origin/develop
origin/main
```

Local:

```text
desarrollo
develop
feature/offline-manual-sync
main
```

Worktrees:

```text
C:/Users/mq1/Documents/Proyectos/APEXOS                                       [main]
C:/Users/mq1/Documents/Proyectos/APEXOS-worktrees/desarrollo-login-visibility [desarrollo]
C:/Users/mq1/Documents/Proyectos/APEXOS-worktrees/develop-login-visibility    [develop]
```

Containment:

- `origin/desarrollo...desarrollo`: `0 0`
- `origin/develop...origin/desarrollo`: `0 21`
- `origin/main...origin/desarrollo`: `0 82`

## Dictamen

APROBADO CON OBSERVACIONES.

`desarrollo` was published successfully without rewriting history. Integrated or superseded auxiliary branches were removed locally and remotely. Two exceptions remain because deleting them could discard unreviewed unique work:

- Remote `chore/openclaw-agent-foundation`
- Local `feature/offline-manual-sync`
