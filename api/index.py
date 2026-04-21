import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.main import app as _fastapi_app
from starlette.types import ASGIApp, Receive, Scope, Send


class StripApiPrefix:
    """Strip /api prefix that Vercel routing prepends before FastAPI sees the path."""

    def __init__(self, inner: ASGIApp, prefix: str = "/api"):
        self.inner = inner
        self.prefix = prefix.rstrip("/")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] in ("http", "websocket"):
            path: str = scope.get("path", "")
            if path.startswith(self.prefix):
                stripped = path[len(self.prefix):] or "/"
                scope = {**scope, "path": stripped}
                raw: bytes = scope.get("raw_path", b"")
                if raw.startswith(self.prefix.encode()):
                    scope["raw_path"] = raw[len(self.prefix):] or b"/"
        await self.inner(scope, receive, send)


# Vercel looks for `app` at module level
app = StripApiPrefix(_fastapi_app, "/api")
