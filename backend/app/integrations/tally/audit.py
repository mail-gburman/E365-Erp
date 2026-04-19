from ...audit import audit

def audit_tally(db, username: str, action: str, entity_id=None, details=None):
    audit(db, username, action, "tally_sync", entity_id=entity_id, details=details or {})
