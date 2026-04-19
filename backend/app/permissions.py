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

ROLE_DEFAULTS = {
    "admin": {"masters":{"view":True,"add":True,"edit":True,"delete":True},"bookings":{"view":True,"add":True,"edit":True,"delete":True},"services":{"view":True,"add":True,"edit":True,"delete":True},"papers":{"view":True,"add":True,"edit":True,"delete":True},"qc":{"view":True,"add":True,"edit":True,"delete":True},"users":{"view":True,"add":True,"edit":True,"delete":True},"uploads":{"view":True,"add":True,"edit":True,"delete":True,"download":True,"export":True},"accounts":{"view":True,"add":True,"edit":True,"delete":True,"download":True,"export":True,"approve":True}},
    "operations": {"masters":{"view":True,"add":False,"edit":False,"delete":False},"bookings":{"view":True,"add":True,"edit":False,"delete":False},"services":{"view":True,"add":True,"edit":False,"delete":False},"papers":{"view":True,"add":True,"edit":False,"delete":False},"qc":{"view":True,"add":True,"edit":False,"delete":False},"users":{"view":False,"add":False,"edit":False,"delete":False},"uploads":{"view":True,"add":True,"edit":False,"delete":False,"download":True,"export":False},"accounts":{"view":True,"add":False,"edit":False,"delete":False,"download":False,"export":False,"approve":False}},
    "store": {"masters":{"view":True,"add":True,"edit":False,"delete":False},"bookings":{"view":True,"add":True,"edit":False,"delete":False},"services":{"view":True,"add":True,"edit":False,"delete":False},"papers":{"view":True,"add":True,"edit":False,"delete":False},"qc":{"view":True,"add":True,"edit":False,"delete":False},"users":{"view":False,"add":False,"edit":False,"delete":False},"uploads":{"view":True,"add":True,"edit":False,"delete":False,"download":True,"export":False},"accounts":{"view":False,"add":False,"edit":False,"delete":False,"download":False,"export":False,"approve":False}},
    "accounts": {"masters":{"view":True,"add":False,"edit":False,"delete":False},"bookings":{"view":True,"add":False,"edit":False,"delete":False},"services":{"view":True,"add":False,"edit":False,"delete":False},"papers":{"view":True,"add":False,"edit":False,"delete":False},"qc":{"view":False,"add":False,"edit":False,"delete":False},"users":{"view":False,"add":False,"edit":False,"delete":False},"uploads":{"view":True,"add":False,"edit":False,"delete":False,"download":True,"export":True},"accounts":{"view":True,"add":True,"edit":False,"delete":False,"download":True,"export":True,"approve":False}},
}

def resolved_permissions(user):
    try:
        if user.permissions_json:
            return json.loads(user.permissions_json)
    except Exception:
        pass
    return ROLE_DEFAULTS.get(user.role, {})

def require_permission(module: str, action: str):
    def dep(current_user = Depends(get_current_user)):
        if current_user.role == "admin":
            return current_user
        if not resolved_permissions(current_user).get(module, {}).get(action, False):
            raise HTTPException(status_code=403, detail=f"Permission denied for {module}.{action}")
        return current_user
    return dep

def _has_document_specific_permissions(perms: dict) -> bool:
    return any(key in perms for key in DOCUMENT_FIELD_KEYS)

def has_document_permission(user, document_type: str, action: str) -> bool:
    if user.role == "admin":
        return True
    perms = resolved_permissions(user)
    document_key = DOCUMENT_PERMISSION_KEYS.get(document_type or "other", DOCUMENT_PERMISSION_KEYS["other"])
    if _has_document_specific_permissions(perms):
        return bool(perms.get(document_key, {}).get(action, False))
    return bool(perms.get("uploads", {}).get(action, False))

def assert_document_permission(user, document_type: str, action: str):
    if not has_document_permission(user, document_type, action):
        raise HTTPException(status_code=403, detail=f"Permission denied for documents.{document_type}.{action}")

def require_document_permission(document_type: str, action: str):
    def dep(current_user = Depends(get_current_user)):
        assert_document_permission(current_user, document_type, action)
        return current_user
    return dep
