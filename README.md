# APEX OS 2.0

APEX OS 2.0 is a new, independent ERP SaaS repository built from DOC-01 to DOC-10.

This repo intentionally does not import, connect to, or modify APEX 1.0. The first milestone follows Bloque 0 and the foundation of Bloque 1:

- Fastify API with JWT, CORS, rate limits, multipart and websocket plugins.
- Prisma universal schema with tenant-first business models.
- Auth registration and login for tenant bootstrap.
- BullMQ-backed audit and BRAIN jobs.
- Python FastAPI BRAIN service skeleton.
- Next.js App Router shell, onboarding and dashboard placeholder.

## Local Start

```powershell
copy .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis minio
npm install
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run prisma:migrate
npm run dev
```

In another terminal:

```powershell
cd services/brain
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

