# Agent repository rules

This repository uses one controlled promotion path:

```text
desarrollo -> develop -> main
```

Rules for Codex and any automated agent:

- Before modifying any file, Codex must execute `git branch --show-current` and `git status --short`.
- Start all normal work from `desarrollo`.
- Codex may implement changes only in `desarrollo`.
- If the active branch is not `desarrollo`, Codex must stop unless the user explicitly authorized a non-implementation inspection.
- Do not create a new branch unless the user gives explicit authorization for that branch.
- Names such as `codex/*`, `feature/*`, `chore/*`, `fix/*`, or similar are not authorized by default.
- A request to implement, fix, or continue is not authorization to create a branch.
- Implement new features and bug fixes first in `desarrollo`.
- Use `develop` only for QA integration promoted from `desarrollo`.
- Use `main` only for production releases promoted from `develop`.
- Do not promote branches without explicit authorization.
- Do not push directly to `main`.
- Do not push, merge, deploy, run remote migrations, delete branches, modify infrastructure, or use force push without explicit independent authorization.
- Treat absence of authorization as prohibition.
- Do not skip validations to finish a delivery.
- Every change must include tests and evidence.
- Preserve traceability. Do not squash or rewrite shared history without explicit authorization.
- Keep generated files, local logs, secrets, and environment-specific artifacts out of commits.
- Emergency production fixes require explicit authorization and must be retrointegrated to `develop` and `desarrollo`.

Before proposing any promotion, attach validation evidence and confirm that the target follows:

```text
desarrollo -> develop -> main
```
