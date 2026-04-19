def parse_success(response_text: str) -> dict:
    text = response_text or ""
    lowered = text.lower()
    if "<created>1</created>" in lowered or "<altered>1</altered>" in lowered or "created" in lowered:
        return {"status": "success", "normalized_message": "Voucher accepted by Tally.", "raw_response_excerpt": text[:1000]}
    if "duplicate" in lowered or "already exists" in lowered:
        return {"status": "failed", "normalized_message": "TALLY_DUPLICATE_VOUCHER: Voucher already exists.", "raw_response_excerpt": text[:1000]}
    if "ledger" in lowered and ("not" in lowered or "missing" in lowered):
        return {"status": "failed", "normalized_message": "TALLY_LEDGER_NOT_FOUND: Required ledger is missing.", "raw_response_excerpt": text[:1000]}
    return {"status": "needs_review", "normalized_message": "Tally response needs review.", "raw_response_excerpt": text[:1000]}
