ERROR_MAP = {
    "duplicate": "TALLY_DUPLICATE_VOUCHER",
    "already exists": "TALLY_DUPLICATE_VOUCHER",
    "ledger": "TALLY_LEDGER_NOT_FOUND",
    "company": "TALLY_COMPANY_MISMATCH",
    "period": "TALLY_INVALID_DATE_OR_PERIOD",
    "date": "TALLY_INVALID_DATE_OR_PERIOD",
    "xml": "TALLY_MALFORMED_XML",
    "unreachable": "TALLY_HTTP_UNREACHABLE",
    "timeout": "TALLY_HTTP_UNREACHABLE",
}

def normalize_tally_error(message: str | None) -> dict:
    text = (message or "").strip()
    lower = text.lower()
    for needle, code in ERROR_MAP.items():
        if needle in lower:
            return {"code": code, "message": text or code}
    if not text:
        return {"code": "TALLY_UNKNOWN_ERROR", "message": "Tally returned an unknown error."}
    return {"code": "TALLY_ERROR", "message": text}

def normalize_result_status(status: str | None) -> str:
    value = (status or "").lower()
    if value in {"success", "synced"}:
        return "success"
    if value in {"generated_for_import", "file_generated"}:
        return "generated_for_import"
    if value in {"needs_review"}:
        return "needs_review"
    return "failed"
