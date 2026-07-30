# Local desarrollo startup

Use this launcher for daily local work:

```powershell
scripts\windows\start-apexos-desarrollo.bat
```

The launcher prepares only the local `desarrollo` environment.

It does:

- Detect the repository root.
- Require Git, Node.js, and npm.
- Stop if the worktree has uncommitted changes.
- Switch safely to `desarrollo` only when the worktree is clean.
- Fetch `origin` and update only by fast-forward.
- Block divergent local/remote branch states.
- Require local `.env`.
- Block QA/PROD markers in local environment files.
- Run `npm ci` only when dependencies are missing or `package-lock.json` changed.
- Run Prisma validate and web TypeScript checks.
- Start local infrastructure and local API/web terminals unless `-CheckOnly` or `-NoStart` is used.

It never:

- Creates branches.
- Commits.
- Pushes.
- Uses force checkout, reset, clean, merge, or rebase.
- Deploys.
- Runs remote migrations.
- Connects intentionally to Railway, Supabase QA, or Supabase PROD.
- Prints secrets.
- Overwrites `.env`.

Useful checks:

```powershell
scripts\windows\start-apexos-desarrollo.bat -CheckOnly -NoInstall -NoStart
scripts\windows\start-apexos-desarrollo.ps1 -CheckOnly -NoStart
```

Expected local services:

| Service | URL |
| --- | --- |
| API | `http://localhost:3000` |
| Web | `http://localhost:3001` |
| Database | Local PostgreSQL or Docker local service |

If the launcher reports `BLOQUEADO`, fix the listed condition manually and run it again. It intentionally fails closed.
