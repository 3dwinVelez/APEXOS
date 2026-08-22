## Flow Gate

Target branch:

- [ ] `develop`, from `desarrollo`
- [ ] `main`, from `develop`

This PR does not bypass the mandatory flow:

```text
desarrollo -> develop -> main
```

## Authorization

- [ ] This promotion/change has explicit authorization.
- [ ] This PR does not include direct implementation work on `develop` or `main`.
- [ ] This PR does not include unrelated functional changes.
- [ ] No force push, history rewrite, remote migration, Railway/Supabase change, secret change, or deployment is included unless explicitly authorized and documented below.

Authorization evidence:

```text
Add approver, date, scope, and exact authorization text.
```

## Validation Evidence

Commands executed:

```text
npm run governance:ci
npm run prisma:validate
npm --workspace apps/web run typecheck
npm run qa:deterministic-validation
```

Results:

```text
Add result summary and links/files for evidence.
```

## QA Verdict

- [ ] Approved for QA integration (`desarrollo` -> `develop`)
- [ ] Approved for production release (`develop` -> `main`)
- [ ] Not approved

Verdict:

```text
Add QA owner, date, scope validated, residual risks, and rollback plan when targeting main.
```
