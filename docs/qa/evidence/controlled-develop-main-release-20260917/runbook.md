# Controlled develop to main release runbook

## Fixed inputs

- Production baseline: `main@0abda8c41168642f99da0831e15f940b98232a12`.
- Functional candidate included by this preparation: `57a406e51b3a88509fa6e0390d6ca105966eed1d`.
- Promotion path: `desarrollo -> develop -> main`.
- Deletions authorized: none.

## History preservation

The production branch must be integrated by a normal pull-request merge with `main` as the first parent. Never reset, force-push, rebase or replace `main` with the tree of `develop`. Immediately before each gate, fetch the remote references and repeat the exact scope validation. A change to either reference invalidates prior approval.

## QA entry gate

1. Validate the exact inventory with `npm run qa:promotion:scope -- <manifest> <candidate> origin/main`.
2. Run dependency, migration-safety, lint, type, build, unit and integration checks.
3. Deploy the exact `develop` SHA to QA.
4. Record the deployed SHA and verify it from the running artifact.
5. Take and verify a recoverable QA database backup before applying migrations.

## Database execution

1. Audit the QA schema before mutation.
2. Compare migration history and apply only pending migrations in chronological order; never replay the historical directory as a blind batch.
3. Reject destructive SQL or unexplained drift.
4. Audit the schema again and execute integrity, RLS, grants, tenant-isolation, concurrency and application-connectivity tests.
5. Record every migration actually applied and its result in sanitized evidence.

## Functional certification

QA must exercise authenticated browser and API flows for the protected module families: admin, inventory, purchases, sales, invoicing, accounts receivable, accounting, projects, services, HR, transport and brain. The evidence must include NYVORA authorized, unauthorized and other-tenant users; persistence after reload; invalid and delayed responses; platform regression; schema alignment; security and performance.

No local result, HTTP 200 response or existing certificate for an earlier commit constitutes QA approval for this release.

## Production gate and recovery

Only after the exact QA manifest passes `qa:approval:evidence` and the refreshed scope passes `qa:promotion:scope`, merge through a reviewed PR. After deployment, run non-destructive schema, connectivity, NYVORA and transversal smoke checks. On data-integrity, tenant-isolation, schema, critical functional or connectivity failure, stop further publication and create a traceable controlled revert toward `0abda8c`; use a verified backup only when recovery of affected data is objectively required. Never disable RLS as rollback.
