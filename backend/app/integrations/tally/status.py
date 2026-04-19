from __future__ import annotations


def normalize_result_status(status: str | None) -> str:
    value = (status or "").strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {
        "ok": "success",
        "done": "success",
        "synced": "success",
        "created": "success",
        "imported": "success",
        "generated": "generated_for_import",
        "file_generated": "generated_for_import",
        "queued_for_import": "generated_for_import",
        "error": "failed",
        "failure": "failed",
    }
    value = aliases.get(value, value)
    allowed = {"pending", "processing", "success", "generated_for_import", "failed", "cancelled"}
    return value if value in allowed else "failed"
