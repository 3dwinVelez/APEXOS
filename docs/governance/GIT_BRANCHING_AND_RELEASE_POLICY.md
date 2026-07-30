# Git branching and release policy

Status: official repository governance policy.

## Permanent branches

The only permanent branches are:

- `desarrollo`: work and integration branch. All normal development, bug fixes, local validation, Codex work, and consolidation from auxiliary branches starts here.
- `develop`: QA branch. It receives only controlled promotions from `desarrollo` and is used for integrated QA validation.
- `main`: production branch. It receives only controlled promotions from `develop`.

Allowed flow:

```text
desarrollo -> develop -> main
```

No agent, developer, administrator, or automation may bypass the `desarrollo -> develop -> main` flow.

Required containment after retrointegration:

```text
main <= develop <= desarrollo
```

## Authorization rule

Absence of authorization means prohibition.

An urgent production issue changes the priority of the change, but never changes the branch flow, tests, or required authorizations.

Generic instructions such as "continue", "fix", "implement", or "make the changes" are not authorization to:

- Create branches.
- Push.
- Merge into shared permanent branches.
- Deploy.
- Run remote migrations.
- Delete local or remote branches.
- Modify infrastructure.
- Change production.

Each action above requires explicit and independent user authorization.

## Agent rules

- Before modifying any file, Codex must run `git rev-parse --show-toplevel`, `git branch --show-current`, `git status --short`, and `git remote -v`.
- Codex and other agents must start from `desarrollo` unless explicitly instructed otherwise.
- Codex may implement changes only in `desarrollo`.
- If the active branch is not `desarrollo`, Codex must stop before implementation.
- Auxiliary branches may only be created with explicit user authorization, a documented purpose, an expiration/cleanup condition, and an audit record.
- Names such as `codex/*`, `feature/*`, `chore/*`, `fix/*`, or similar are not authorized by default.
- A request to implement, fix, or continue is not authorization to create a branch.
- `develop` receives changes only from `desarrollo`.
- `main` receives changes only from `develop`.
- No agent may commit directly to `develop` or `main`.
- No agent may push directly to `develop` or `main` outside an explicitly authorized promotion procedure.
- Codex may not promote branches without explicit authorization.
- No agent may push directly to `main`.
- No agent may use force push on shared branches.
- No agent may use `git push --force-with-lease`.
- No agent may rebase shared permanent branches.
- No agent may run `git reset --hard` or `git clean -fd` automatically on shared branches.
- No agent may delete remote branches without a prior audit.
- No agent may deploy or run remote migrations without explicit authorization.
- No agent may modify Railway, Supabase, secrets, or production/QA infrastructure without explicit authorization.
- No agent may modify security workflows to evade controls.
- No agent may mix unrelated functional changes inside a promotion.
- Every promotion must include validation evidence.
- Every change must include tests and evidence.
- Production hotfixes require explicit authorization and must be retrointegrated to `develop` and `desarrollo`.

These instructions do not authorize branches, promotions, deployments, or environment changes by themselves:

- Implement.
- Fix.
- Continue.
- Make the change.
- Review.
- Leave it working.
- Fix it urgently.
- Fix it in production.
- Update the system.
- Complete the task.

By default, these expressions authorize work only on `desarrollo`.

## Technical controls

Repository controls are implemented through:

- `npm run governance:guard`: verifies that implementation work is happening on `desarrollo`.
- `npm run governance:ci`: validates GitHub PR/push branch flow.
- `npm run governance:no-aux`: detects unauthorized auxiliary branches.
- `scripts/branch-workflow.js`: blocks promotion commands unless `APEXOS_PROMOTION_AUTH` contains the exact authorization token for that flow.
- `.github/workflows/ci.yml`: runs the governance guard before normal validation.

Promotion authorization tokens are not secrets and must not be configured permanently:

- `AUTORIZO_PROMOVER_DESARROLLO_A_DEVELOP`
- `AUTORIZO_PROMOVER_DEVELOP_A_MAIN`

They must be provided only for the specific authorized command execution.

## Production incident flow

Production incidents follow the same route:

```text
main read-only investigation
-> fix in desarrollo
-> promotion to develop
-> QA certification
-> authorized promotion to main
```

No emergency authorizes direct commits to `main`, direct commits to `develop`, deployments, or remote migrations.

## Promotion checklist

Before promoting `desarrollo` to `develop`:

- `desarrollo` is clean.
- `desarrollo` contains current `develop` and `main` work.
- Typecheck, lint, build, Prisma validation, API tests, web tests, and relevant offline tests were executed or explicitly documented as blocked/preexisting.
- Secret detection was executed with the available tooling.
- No environment-specific files, logs, generated files, secrets, or infrastructure drift are included.

Before promoting `develop` to `main`:

- `develop` is synchronized with remote.
- QA validation is approved.
- CI is green or its failures are documented and accepted by an authorized reviewer.
- Migration, security, and infrastructure changes have specific review.
- Release approval is explicit.

## GitHub protections recommended

For `main`:

- Require pull requests.
- Require at least one approval.
- Require successful CI.
- Require branch to be up to date before merge.
- Block force push and branch deletion.
- Restrict merge permission.
- Require resolved conversations.
- Require specific review for migrations, infrastructure, and security.

For `develop`:

- Require pull requests or administrator-controlled promotion from `desarrollo`.
- Require CI and QA evidence.
- Block force push and branch deletion.
- Reject PRs from auxiliary branches unless they first land in `desarrollo`.

For `desarrollo`:

- Block force push and branch deletion.
- Run automated validation before accepting promoted work.
- Allow controlled work commits without destructive operations.

## Safe cleanup policy

An auxiliary branch can be deleted only after one condition is proven and documented:

- All valid work is integrated in `desarrollo`.
- Its content already exists in an authorized branch.
- Its content is explicitly discarded as obsolete, experimental, reverted, or incorrect.
- It has no relevant exclusive commits.

Ambiguous branches must remain and be listed in the audit report.
