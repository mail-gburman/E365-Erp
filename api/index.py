from backend.app.main import app as fastapi_app


class StripApiPrefix:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            path = scope.get("path", "")
            if path == "/api":
                scope = {**scope, "path": "/"}
            elif path.startswith("/api/"):
                scope = {**scope, "path": path[4:]}
        await self.app(scope, receive, send)


app = StripApiPrefix(fastapi_app)
