import json
from . import models

def audit(db, username: str, action: str, entity_type: str, entity_id=None, details=None):
    db.add(models.AuditLog(
        username=username,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        details_json=json.dumps(details or {}, default=str),
    ))
