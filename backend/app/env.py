import os
from pathlib import Path


def load_env() -> None:
    candidates = [
        Path.cwd() / ".env",
        Path(__file__).resolve().parents[2] / ".env",
    ]
    seen = set()
    for path in candidates:
        if path in seen or not path.exists():
            continue
        seen.add(path)
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)
