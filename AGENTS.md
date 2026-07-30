# Agent repository rules

This repository uses one controlled promotion path:

```text
desarrollo -> develop -> main
```

Rules for Codex and any automated agent:

- Start all normal work from `desarrollo`.
- Do not create a new branch unless the user gives explicit authorization for that branch.
- Implement new features and bug fixes first in `desarrollo`.
- Use `develop` only for QA integration promoted from `desarrollo`.
- Use `main` only for production releases promoted from `develop`.
- Do not push directly to `main`.
- Do not push, merge, deploy, run remote migrations, delete branches, modify infrastructure, or use force push without explicit independent authorization.
- Treat absence of authorization as prohibition.
- Do not skip validations to finish a delivery.
- Preserve traceability. Do not squash or rewrite shared history without explicit authorization.
- Keep generated files, local logs, secrets, and environment-specific artifacts out of commits.
- Emergency production fixes require explicit authorization and must be retrointegrated to `develop` and `desarrollo`.

Before proposing any promotion, attach validation evidence and confirm that the target follows:

```text
desarrollo -> develop -> main
```
