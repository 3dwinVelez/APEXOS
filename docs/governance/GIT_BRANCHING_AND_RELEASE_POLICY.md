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

Required containment after retrointegration:

```text
main <= develop <= desarrollo
```

## Authorization rule

Absence of authorization means prohibition.

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

- Codex and other agents must start from `desarrollo` unless explicitly instructed otherwise.
- Auxiliary branches may only be created with explicit user authorization, a documented purpose, and an expiration/cleanup condition.
- `develop` receives changes only from `desarrollo`.
- `main` receives changes only from `develop`.
- No agent may push directly to `main`.
- No agent may use force push on shared branches.
- No agent may delete remote branches without a prior audit.
- No agent may deploy or run remote migrations without explicit authorization.
- Every promotion must include validation evidence.
- Production hotfixes require explicit authorization and must be retrointegrated to `develop` and `desarrollo`.

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
