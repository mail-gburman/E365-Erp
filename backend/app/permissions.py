import json
from fastapi import Depends, HTTPException
from .auth import get_current_user

DOCUMENT_PERMISSION_KEYS = {
    "vendor": "uploads.vendor_documents_tab",
    "client": "uploads.client_documents_tab",
    "inventory": "uploads.inventory_documents_tab",
    "warehouse": "uploads.warehouse_documents_tab",
    "manpower": "uploads.manpower_documents_tab",
    "crew": "uploads.manpower_documents_tab",
    "job_card": "uploads.job_card_pdfs",
    "challan": "uploads.road_challan_pdfs",
    "manpower_pdf": "uploads.manpower_pdfs",
    "gate_pass": "uploads.gate_pass_pdfs",
    "invoice": "uploads.invoice_pdfs",
    "service": "uploads.service_pdfs",
    "paper": "uploads.papers_pdfs",
    "other": "uploads.uploaded_statutory_documents",
}

DOCUMENT_FIELD_KEYS = set(DOCUMENT_PERMISSION_KEYS.values())

# All module keys — mirrors frontend PERMISSION_GROUPS
_ALL_MODULES = [
    "dashboard", "calendar", "audit",
    "projects", "bookings", "resources", "job_cards", "planned_shoots",
    "masters", "equipment_master", "accessories_master", "warehouses",
    "clients", "vendors", "manpower",
    "dispatch", "returns", "damages", "qc", "papers",
    "services", "procurement", "accounts",
    "users", "roles", "profile", "system", "uploads",
]
_ALL_ACTIONS = ["view", "add", "edit", "delete", "download", "export", "approve"]


def _role(config: dict) -> dict:
    """Build a flat module-level permission dict from {module: [actions]} config."""
    result = {}
    for module in _ALL_MODULES:
        allowed = config.get(module, config.get("*", []))
        result[module] = {action: (action in allowed) for action in _ALL_ACTIONS}
    return result


ROLE_DEFAULTS = {
    "super_admin": _role({"*": _ALL_ACTIONS}),

    # ── admin: everything on ──────────────────────────────────────────────
    "admin": _role({"*": _ALL_ACTIONS}),

    # ── producer: project/booking oversight + exports ─────────────────────
    "producer": _role({
        "dashboard":      ["view", "export"],
        "calendar":       ["view", "add", "edit", "export"],
        "audit":          ["view", "export"],
        "projects":       ["view", "add", "edit", "export", "approve"],
        "bookings":       ["view", "add", "edit", "export", "approve"],
        "resources":      ["view", "add", "edit"],
        "job_cards":      ["view", "add", "edit", "export"],
        "planned_shoots": ["view", "edit", "approve"],
        "clients":        ["view", "add", "edit"],
        "uploads":        ["view", "add", "download", "export"],
        "profile":        ["view", "edit"],
    }),

    # ── operations: field-ops, no master write, no accounts write ─────────
    "operations": _role({
        "dashboard":      ["view"],
        "calendar":       ["view", "add", "edit", "export"],
        "audit":          ["view"],
        "projects":       ["view", "add", "edit"],
        "bookings":       ["view", "add", "edit", "export"],
        "resources":      ["view", "add", "edit"],
        "job_cards":      ["view", "add", "edit", "export"],
        "planned_shoots": ["view", "edit", "approve"],
        "masters":        ["view"],
        "equipment_master": ["view"],
        "accessories_master": ["view"],
        "warehouses":     ["view"],
        "clients":        ["view", "add", "edit"],
        "vendors":        ["view"],
        "manpower":       ["view", "add", "edit"],
        "dispatch":       ["view", "add", "edit"],
        "returns":        ["view", "add", "edit"],
        "damages":        ["view", "add", "edit"],
        "qc":             ["view", "add", "edit"],
        "papers":         ["view", "add", "edit", "export"],
        "services":       ["view", "add", "edit"],
        "accounts":       ["view"],
        "uploads":        ["view", "add", "download"],
        "profile":        ["view", "edit"],
    }),

    # ── store: warehouse, inventory, dispatch/return/QC ───────────────────
    "store": _role({
        "dashboard":          ["view"],
        "calendar":           ["view"],
        "bookings":           ["view"],
        "resources":          ["view", "add", "edit"],
        "job_cards":          ["view", "export"],
        "masters":            ["view", "add", "edit"],
        "equipment_master":   ["view", "add", "edit"],
        "accessories_master": ["view", "add", "edit"],
        "warehouses":         ["view", "add", "edit"],
        "manpower":           ["view"],
        "dispatch":           ["view", "add", "edit"],
        "returns":            ["view", "add", "edit"],
        "damages":            ["view", "add", "edit"],
        "qc":                 ["view", "add", "edit"],
        "papers":             ["view", "export"],
        "uploads":            ["view", "add", "download"],
        "profile":            ["view", "edit"],
    }),

    # ── accounts: billing, procurement, invoice management ────────────────
    "accounts": _role({
        "dashboard":   ["view", "export"],
        "calendar":    ["view"],
        "audit":       ["view", "export"],
        "projects":    ["view", "export"],
        "bookings":    ["view", "export"],
        "job_cards":   ["view", "export"],
        "clients":     ["view", "add", "edit"],
        "vendors":     ["view", "add", "edit"],
        "procurement": ["view", "add", "edit", "approve", "export"],
        "accounts":    ["view", "add", "edit", "export", "approve"],
        "papers":      ["view", "export"],
        "uploads":     ["view", "download", "export"],
        "profile":     ["view", "edit"],
    }),

    # ── qc: quality control, service, returns, damages ────────────────────
    "qc": _role({
        "dashboard":          ["view"],
        "calendar":           ["view"],
        "bookings":           ["view"],
        "resources":          ["view"],
        "equipment_master":   ["view", "edit"],
        "accessories_master": ["view", "edit"],
        "dispatch":           ["view"],
        "returns":            ["view", "add", "edit"],
        "damages":            ["view", "add", "edit"],
        "qc":                 ["view", "add", "edit", "approve", "export"],
        "papers":             ["view", "add", "edit", "export"],
        "services":           ["view", "add", "edit"],
        "uploads":            ["view", "add", "download"],
        "profile":            ["view", "edit"],
    }),

    # ── viewer: read-only across all non-sensitive modules ────────────────
    "viewer": _role({
        "dashboard":          ["view"],
        "calendar":           ["view"],
        "projects":           ["view"],
        "bookings":           ["view"],
        "resources":          ["view"],
        "job_cards":          ["view"],
        "masters":            ["view"],
        "equipment_master":   ["view"],
        "accessories_master": ["view"],
        "warehouses":         ["view"],
        "clients":            ["view"],
        "vendors":            ["view"],
        "manpower":           ["view"],
        "papers":             ["view"],
        "uploads":            ["view"],
        "profile":            ["view", "edit"],
    }),
}


def resolved_permissions(user) -> dict:
    """Return the effective permissions for a user (custom JSON or role default)."""
    try:
        if user.permissions_json:
            return json.loads(user.permissions_json)
    except Exception:
        pass
    return ROLE_DEFAULTS.get(user.role, {})


def require_permission(module: str, action: str):
    def dep(current_user=Depends(get_current_user)):
        if current_user.role in {"admin", "super_admin"}:
            return current_user
        if not resolved_permissions(current_user).get(module, {}).get(action, False):
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: {module}.{action}",
            )
        return current_user
    return dep


def _has_document_specific_permissions(perms: dict) -> bool:
    return any(key in perms for key in DOCUMENT_FIELD_KEYS)


def has_document_permission(user, document_type: str, action: str) -> bool:
    if user.role in {"admin", "super_admin"}:
        return True
    perms = resolved_permissions(user)
    document_key = DOCUMENT_PERMISSION_KEYS.get(document_type or "other", DOCUMENT_PERMISSION_KEYS["other"])
    if _has_document_specific_permissions(perms):
        return bool(perms.get(document_key, {}).get(action, False))
    return bool(perms.get("uploads", {}).get(action, False))


def assert_document_permission(user, document_type: str, action: str):
    if not has_document_permission(user, document_type, action):
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: documents.{document_type}.{action}",
        )


def require_document_permission(document_type: str, action: str):
    def dep(current_user=Depends(get_current_user)):
        assert_document_permission(current_user, document_type, action)
        return current_user
    return dep
