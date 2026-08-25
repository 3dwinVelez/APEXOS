# Agent repository rules

This repository uses one controlled promotion path:

```text
desarrollo -> develop -> main
```

Rules for Codex and any automated agent:

- Before modifying any file, Codex must execute `git rev-parse --show-toplevel`, `git branch --show-current`, `git status --short`, and `git remote -v`.
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
- Do not push directly to `develop`.
- Do not push, merge, deploy, run remote migrations, delete branches, modify infrastructure, modify secrets, modify Railway/Supabase, or use force push without explicit independent authorization.
- Do not use `git push --force-with-lease`, rebase permanent shared branches, run `git reset --hard`, or run `git clean -fd` automatically.
- Treat absence of authorization as prohibition.
- Do not skip validations to finish a delivery.
- Every change must include tests and evidence.
- An agent is not authorized to push or promote a change presented as complete unless a versioned certification script exercises the full requested flow and its manifest passes `npm run qa:approval:evidence -- <manifest>`.
- Unit tests, lint, type checks, builds, API success responses, or code review alone never constitute complete certification.
- A failed, pending, partial, simulated-only, or unexecuted end-to-end certification blocks publication and promotion. The agent must state the block explicitly and may not claim the incident is resolved.
- Every promotion to `main` must pass `docs/CHANGE_APPROVAL_QA_POLICY.md` and `npm run qa:approval:evidence -- <manifest>` with explicit functional QA approval. Automated checks alone never authorize `main`.
- Every promotion must be scoped against the current target commit. Before `develop` or `main`, a versioned scope manifest must pass `npm run qa:promotion:scope -- <scope-manifest> <candidate-ref> <target-ref>`.
- Every new scope manifest must use `scope_schema_version: 2`, declare `change_intent.modules`, and enumerate the exact `A`, `M`, or `D` entry for every file in `expected_changes`. Broad directory permission never substitutes this exact inventory.
- Branch-wide merges are forbidden when their net diff contains files, modules, migrations, deletions, or generated evidence outside the approved scope manifest. An agent must isolate or reconstruct the punctual commits first.
- Before accepting work from another machine, compare its candidate against the current remote target, not against that machine's local baseline. A mismatch between the exact inventory and the net diff blocks the merge even when every path matches an allowed directory.
- A commit whose subject names one module but whose diff changes another module must be split or reconstructed before promotion. Commit messages, prior QA, urgency, or authorship never authorize hidden cross-module changes.
- A fix for one function must certify both that function and every protected capability named in the scope manifest. For Services, starting orders, administrative correction, RBAC and tenant isolation are protected together.
- A rollback or recovery may never use an old tree snapshot as the new branch baseline. Recover only the reviewed commits or file hunks on top of the current target baseline so later fixes remain present.
- Any deletion requires an explicit `allowed_deletions` entry in the scope manifest. Empty or implicit deletion authorization is prohibited.
- Preserve traceability. Do not squash or rewrite shared history without explicit authorization.
- Keep generated files, local logs, secrets, and environment-specific artifacts out of commits.
- Emergency production fixes require explicit authorization and must be retrointegrated to `develop` and `desarrollo`.

Ningun agente, desarrollador, administrador o automatizacion puede saltarse el flujo `desarrollo -> develop -> main`.

Una urgencia productiva modifica la prioridad del cambio, pero nunca modifica el flujo de ramas, las pruebas ni las autorizaciones requeridas.

La ausencia de autorizacion expresa debe interpretarse como prohibicion.

Generic task wording such as "implementa", "corrige", "continua", "haz el cambio", "dejalo funcionando", "corrigelo urgentemente", "corrigelo en produccion", "actualiza el sistema" or "completa la tarea" authorizes only work on `desarrollo`.

Before proposing any promotion, attach validation evidence and confirm that the target follows:

```text
desarrollo -> develop -> main
```
