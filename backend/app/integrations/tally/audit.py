from __future__ import annotations

from ...audit import audit


def audit_tally(db, username: str, action: str, entity_id=None, details=None):
    """Record Tally actions in the common audit log."""
    audit(db, username or "system", action, "tally", entity_id=entity_id, details=details or {})
