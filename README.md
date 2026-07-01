# APEX OS 2.0

APEX OS 2.0 is a new, independent ERP SaaS repository built from DOC-01 to DOC-10.

This repo intentionally does not import, connect to, or modify APEX 1.0. The first milestone follows Bloque 0 and the foundation of Bloque 1:

- Fastify API with JWT, CORS, rate limits, multipart and websocket plugins.
- Prisma universal schema with tenant-first business models.
- Auth registration and login for tenant bootstrap.
- BullMQ-backed audit and BRAIN jobs.
- Python FastAPI BRAIN service skeleton.
- Next.js App Router shell, onboarding and dashboard placeholder.

## Node.js Runtime

APEXOS/NYVORA uses Node.js 22 LTS as the official runtime. The root and workspace
`package.json` files declare `engines.node` as `22.x`, and the repository includes
`.nvmrc` and `.node-version` with `22`.

Install with nvm:

```powershell
nvm install 22
nvm use 22
node --version
```

Validate the active runtime before working:

```powershell
npm run doctor:node
```

The doctor fails when the active Node.js major version is not 22.

## Local Start

```powershell
copy .env.example .env
npm run setup:local
npm run start:local
```

Then open:

- Web: http://localhost:3001
- API health: http://localhost:3000/health
- BRAIN health: http://localhost:8000/health

Demo login:

```text
demo@apex.local
test1234
```

## Branch Workflow

Ramas activas del proyecto:

- `desarrollo`: trabajo local.
- `develop`: integracion validada.
- `main`: estable/produccion. Es la referencia directa para despliegues.

Comandos base:

```powershell
npm run workflow:status
npm run workflow:sync-desarrollo
npm run qa:deterministic-validation
npm run workflow:promote-develop
git switch develop
npm run workflow:promote-main
```

Guia detallada:

- `BRANCHING_WORKFLOW.md`

If you want to run the BRAIN service outside Docker instead:

```powershell
cd services/brain
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

