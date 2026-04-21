import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

DIST = Path(__file__).parent.parent / "frontend" / "dist"

from backend.app.main import app as backend_app

# Outer app: serves SPA + mounts backend at /api
main_app = FastAPI()

# Mount the backend at /api — FastAPI strips the prefix automatically
main_app.mount("/api", backend_app)

# Serve compiled React assets at /assets
if (DIST / "assets").exists():
    main_app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="fe_assets")

# Serve logo and other root-level static files
for static_file in ["logo.png", "favicon.ico"]:
    fp = DIST / static_file
    if fp.exists():
        def _make_handler(f=fp):
            async def handler():
                return FileResponse(str(f))
            handler.__name__ = f"static_{f.name.replace('.', '_')}"
            return handler
        main_app.get(f"/{static_file}")(_make_handler())

# SPA fallback: serve index.html for all unmatched routes
@main_app.get("/")
async def root():
    return FileResponse(str(DIST / "index.html"))

@main_app.get("/{path:path}")
async def spa_fallback(path: str):
    return FileResponse(str(DIST / "index.html"))

# Vercel looks for `app` at module level
app = main_app
