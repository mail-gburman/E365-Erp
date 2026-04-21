# Vercel Deploy

This repo deploys as one Vercel project:

- Frontend: Vite build from `frontend/`
- API: FastAPI serverless function at `/api`
- Local dev API path: `/api`, proxied by Vite to `http://localhost:8000`

## Vercel settings

Use default project import. `vercel.json` sets:

- Install: `npm install --prefix frontend`
- Build: `npm run build`
- Output: `frontend/dist`

## Environment

Root `.env` is intentionally committed for this project.

Current default:

- `VITE_API_BASE_URL=/api`
- `DATABASE_URL=sqlite:////tmp/kps_erp_enterprise.db`

SQLite on Vercel is writable only in `/tmp` and is not durable. For real production data, replace `DATABASE_URL` with Postgres, for example:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DB?sslmode=require
```
