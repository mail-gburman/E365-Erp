# Vercel Deploy

This repo deploys as one Vercel Services project:

- Frontend service: Vite app from `frontend/`, mounted at `/`
- Backend service: FastAPI app from `api/index.py`, mounted at `/api`
- Local dev API path: `/api`, proxied by Vite to `http://localhost:8000`

## Vercel settings

Use default project import. Set framework to **Services** if Vercel asks.

`vercel.json` defines `experimentalServices`, so Vercel should show:

- `frontend` -> `frontend`, route `/`, framework `vite`
- `backend` -> `api/index.py`, route `/api`, framework `fastapi`

## Environment

Root `.env` is intentionally committed for this project.

Current default:

- `VITE_API_BASE_URL=/api`
- `DATABASE_URL=sqlite:////tmp/e365_erp_enterprise.db`

SQLite on Vercel is writable only in `/tmp` and is not durable. For real production data, replace `DATABASE_URL` with Postgres, for example:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DB?sslmode=require
```
