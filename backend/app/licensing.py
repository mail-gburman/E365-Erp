"""
Per-company license activation system for E365 ERP.

Uses Ed25519-signed activation codes in the format:
    EVTLIC1.<base64url-payload>.<base64url-signature>

Use license_issuer.py on your local machine to generate codes.
Each Company gets its own installation_id (EVENT-XXXXXXXXXXXX format) and its
own ledger of LicenseActivation rows that stack for renewals.
"""
import base64
import hashlib
import json
import os
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from sqlalchemy.orm import Session

from . import models

LICENSE_CODE_PREFIX = "EVTLIC1"
IST = ZoneInfo("Asia/Kolkata")
_PUBLIC_KEY_BUNDLED = Path(__file__).resolve().parent / "assets" / "license_public_key.pem"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _env_flag(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "")).strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def is_license_enforced() -> bool:
    return _env_flag("LICENSE_ENFORCED", False)


def _today_ist() -> date:
    return datetime.now(IST).date()


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode())


def _parse_datetime(value) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    if not text:
        raise ValueError("Missing datetime value.")
    return datetime.fromisoformat(text)


def _parse_date(value) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value or "").strip()
    if not text:
        raise ValueError("Missing date value.")
    return date.fromisoformat(text)


def _load_public_key() -> Ed25519PublicKey | None:
    pem = os.getenv("LICENSE_PUBLIC_KEY", "").strip()
    pem_path = os.getenv("LICENSE_PUBLIC_KEY_PATH", "").strip()
    if not pem and pem_path:
        with open(pem_path, "r", encoding="utf-8") as fh:
            pem = fh.read().strip()
    if not pem and _PUBLIC_KEY_BUNDLED.exists():
        pem = _PUBLIC_KEY_BUNDLED.read_text(encoding="utf-8").strip()
    if not pem:
        return None
    key = serialization.load_pem_public_key(pem.encode())
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError("LICENSE_PUBLIC_KEY must be an Ed25519 public key.")
    return key


# ---------------------------------------------------------------------------
# Installation ID — stored on the Company row
# ---------------------------------------------------------------------------

def ensure_installation_id(db: Session, company_id: int) -> str:
    """Return or create a stable installation_id for this company."""
    row = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not row:
        raise ValueError(f"Company {company_id} not found.")
    if row.installation_id:
        return row.installation_id
    installation_id = f"EVENT-{uuid.uuid4().hex[:12].upper()}"
    row.installation_id = installation_id
    db.commit()
    return installation_id


def get_installation_id(db: Session, company_id: int) -> str:
    return ensure_installation_id(db, company_id)


# ---------------------------------------------------------------------------
# Code verification
# ---------------------------------------------------------------------------

def verify_activation_code(code: str) -> dict:
    public_key = _load_public_key()
    if not public_key:
        raise ValueError("License verification key is not configured on this server.")
    parts = str(code or "").strip().split(".")
    if len(parts) != 3 or parts[0] != LICENSE_CODE_PREFIX:
        raise ValueError("Invalid activation code format.")
    payload_bytes = _b64url_decode(parts[1])
    signature = _b64url_decode(parts[2])
    try:
        public_key.verify(signature, payload_bytes)
    except InvalidSignature as exc:
        raise ValueError("Activation code signature is invalid.") from exc
    payload = json.loads(payload_bytes.decode())
    required = ["license_id", "installation_id", "client_name", "valid_from", "valid_until", "issued_at"]
    missing = [k for k in required if not payload.get(k)]
    if missing:
        raise ValueError("Activation code is missing required fields: " + ", ".join(missing))
    _parse_datetime(payload["issued_at"])
    valid_from = _parse_date(payload["valid_from"])
    valid_until = _parse_date(payload["valid_until"])
    # Deactivation codes have validity_days=0 and valid_from==valid_until — skip the window check
    if not payload.get("deactivate") and valid_until < valid_from:
        raise ValueError("Activation code validity window is invalid.")
    return payload


# ---------------------------------------------------------------------------
# Ledger integrity verification
# ---------------------------------------------------------------------------

def _verified_payload_from_row(row: models.LicenseActivation) -> tuple[dict | None, str | None]:
    code = str(row.activation_code or "").strip()
    if not code:
        return None, "Stored activation proof is missing. Please reactivate this installation."
    try:
        payload = verify_activation_code(code)
    except ValueError as exc:
        return None, str(exc)
    if hashlib.sha256(code.encode()).hexdigest() != row.activation_code_hash:
        return None, "Stored activation proof does not match this license record."
    checks = (
        str(payload["license_id"]) == str(row.license_id),
        str(payload["installation_id"]) == str(row.installation_id),
        str(payload["client_name"]) == str(row.client_name),
        _parse_date(payload["valid_from"]) == row.valid_from,
        _parse_date(payload["valid_until"]) == row.valid_until,
    )
    if not all(checks):
        return None, "Stored license details were changed outside the signed activation proof."
    return payload, None


def _verified_license_ledger(
    db: Session, company_id: int, installation_id: str
) -> tuple[list[tuple[models.LicenseActivation, dict]], str | None]:
    rows = (
        db.query(models.LicenseActivation)
        .filter(
            models.LicenseActivation.company_id == company_id,
            models.LicenseActivation.installation_id == installation_id,
            models.LicenseActivation.is_active == True,
        )
        .order_by(models.LicenseActivation.activated_at.asc(), models.LicenseActivation.id.asc())
        .all()
    )
    ledger = []
    seen_license_ids: set[str] = set()
    seen_code_hashes: set[str] = set()
    for row in rows:
        payload, error = _verified_payload_from_row(row)
        if error:
            return [], error
        if row.license_id in seen_license_ids or row.activation_code_hash in seen_code_hashes:
            return [], "Duplicate activation proof was found in the license ledger."
        seen_license_ids.add(row.license_id)
        seen_code_hashes.add(row.activation_code_hash)
        ledger.append((row, payload))
    return ledger, None


def _serialize_license_ledger(ledger: list[tuple[models.LicenseActivation, dict]]) -> dict | None:
    if not ledger:
        return None
    today = _today_ist()
    first_row, first_payload = ledger[0]
    latest_row, latest_payload = ledger[-1]
    valid_from = _parse_date(first_payload["valid_from"])
    total_days = 0
    for _, payload in ledger:
        payload_from = _parse_date(payload["valid_from"])
        payload_until = _parse_date(payload["valid_until"])
        total_days += int(payload.get("validity_days") or ((payload_until - payload_from).days + 1))
    valid_until = valid_from + timedelta(days=total_days - 1)
    return {
        "license_id": latest_payload.get("license_id") or latest_row.license_id,
        "installation_id": latest_payload.get("installation_id") or latest_row.installation_id,
        "client_name": latest_payload.get("client_name") or latest_row.client_name,
        "contact_name": latest_payload.get("contact_name") or latest_row.contact_name,
        "contact_email": latest_payload.get("contact_email") or latest_row.contact_email,
        "contact_phone": latest_payload.get("contact_phone") or latest_row.contact_phone,
        "plan_name": latest_payload.get("plan_name") or latest_row.plan_name,
        "issued_by": latest_payload.get("issued_by") or latest_row.issued_by,
        "issued_at": _parse_datetime(latest_payload["issued_at"]).replace(tzinfo=None),
        "valid_from": valid_from,
        "valid_until": valid_until,
        "validity_days": total_days,
        "days_remaining": max((valid_until - today).days + 1, 0),
        "activated_at": latest_row.activated_at,
        "is_active": True,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def activation_status(db: Session, company_id: int) -> dict:
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise ValueError(f"Company {company_id} not found.")

    installation_id = ensure_installation_id(db, company_id)
    enforced = is_license_enforced()
    today = _today_ist()

    config_error = None
    try:
        configured = bool(_load_public_key())
    except Exception as exc:
        configured = False
        config_error = str(exc)

    license_payload = None
    ledger = []
    if configured:
        ledger, ledger_error = _verified_license_ledger(db, company_id, installation_id)
    else:
        ledger_error = None

    # Always compute license_payload from ledger when available (for UI display)
    if ledger and not ledger_error:
        license_payload = _serialize_license_ledger(ledger)

    if not enforced:
        valid, reason, detail = True, "licensing_disabled", config_error
    elif not configured:
        valid, reason, detail = False, "public_key_missing", config_error
    elif ledger_error:
        valid, reason, detail = False, "activation_tampered", ledger_error
    elif not ledger:
        valid, reason, detail = False, "not_activated", None
    else:
        detail = None
        valid_from = _parse_date(license_payload["valid_from"])
        valid_until = _parse_date(license_payload["valid_until"])
        if valid_until < today:
            valid, reason = False, "expired"
        elif valid_from > today:
            valid, reason = False, "not_yet_valid"
        else:
            valid, reason = True, "active"

    return {
        "company_id": company_id,
        "company_name": company.name,
        "enforced": enforced,
        "configured": configured,
        "installation_id": installation_id,
        "activated": bool(ledger),
        "valid": valid,
        "reason": reason,
        "detail": detail,
        "license": license_payload,
        "server_date": today,
    }


def all_companies_status(db: Session) -> list[dict]:
    """Return activation status for every company. Super-admin overview."""
    companies = db.query(models.Company).order_by(models.Company.id.asc()).all()
    results = []
    for company in companies:
        try:
            results.append(activation_status(db, company.id))
        except Exception as exc:
            results.append({
                "company_id": company.id,
                "company_name": company.name,
                "enforced": is_license_enforced(),
                "configured": False,
                "installation_id": company.installation_id or "",
                "activated": False,
                "valid": False,
                "reason": "error",
                "detail": str(exc),
                "license": None,
                "server_date": _today_ist(),
            })
    return results


def require_valid_license(db: Session, company_id: int) -> dict:
    status = activation_status(db, company_id)
    if status["enforced"] and not status["valid"]:
        from fastapi import HTTPException
        from fastapi.encoders import jsonable_encoder
        raise HTTPException(
            status_code=403,
            detail={
                "message": _friendly_license_message(status),
                "code": "license_required",
                "activation": jsonable_encoder(status),
            },
        )
    return status





def _friendly_license_message(status: dict) -> str:
    reason = status.get("reason")
    if reason == "expired":
        return "License validity expired. Please contact support to renew."
    if reason == "activation_tampered":
        return "License verification failed. Please reactivate this installation."
    if reason == "public_key_missing":
        return "License verification key is not configured on this server."
    return "This installation requires activation before it can be used."


def preview_activation_code(db: Session, company_id: int, code: str) -> dict:
    payload = verify_activation_code(code)
    installation_id = ensure_installation_id(db, company_id)
    if payload["installation_id"] != installation_id:
        raise ValueError(
            f"This activation code was issued for a different installation "
            f"({payload['installation_id']}), not this company's ID ({installation_id})."
        )
    valid_from = _parse_date(payload["valid_from"])
    valid_until = _parse_date(payload["valid_until"])
    license_id = str(payload["license_id"])
    code_hash = hashlib.sha256(code.strip().encode()).hexdigest()
    is_deactivation = bool(payload.get("deactivate"))

    if db.query(models.LicenseActivation).filter(models.LicenseActivation.activation_code_hash == code_hash).first():
        raise ValueError("This activation code has already been used.")
    if not is_deactivation and (
        db.query(models.LicenseActivation)
        .filter(
            models.LicenseActivation.company_id == company_id,
            models.LicenseActivation.license_id == license_id,
        )
        .first()
    ):
        raise ValueError("This license has already been activated for this company.")
    return {
        "license_id": license_id,
        "installation_id": installation_id,
        "client_name": str(payload["client_name"]),
        "contact_name": payload.get("contact_name"),
        "contact_email": payload.get("contact_email"),
        "contact_phone": payload.get("contact_phone"),
        "plan_name": payload.get("plan_name") or "standard",
        "issued_by": payload.get("issued_by"),
        "issued_at": _parse_datetime(payload["issued_at"]).replace(tzinfo=None),
        "valid_from": valid_from,
        "valid_until": valid_until,
        "validity_days": int(payload["validity_days"]) if payload.get("validity_days") is not None else ((valid_until - valid_from).days + 1),
        "deactivate": is_deactivation,
    }


def apply_activation_code(db: Session, company_id: int, code: str) -> dict:
    preview = preview_activation_code(db, company_id, code)
    payload = verify_activation_code(code)
    code_hash = hashlib.sha256(code.strip().encode()).hexdigest()
    now = datetime.now(UTC).replace(tzinfo=None)

    if preview.get("deactivate"):
        # Force-deactivate: mark all existing active licenses inactive
        (
            db.query(models.LicenseActivation)
            .filter(
                models.LicenseActivation.company_id == company_id,
                models.LicenseActivation.is_active == True,
            )
            .update({"is_active": False}, synchronize_session=False)
        )
        # Record the deactivation event as an audit row (is_active=False)
        db.add(models.LicenseActivation(
            company_id=company_id,
            license_id=preview["license_id"],
            installation_id=preview["installation_id"],
            client_name=preview["client_name"],
            contact_name=preview["contact_name"],
            contact_email=preview["contact_email"],
            contact_phone=preview["contact_phone"],
            plan_name="deactivated",
            issued_by=preview["issued_by"],
            issued_at=preview["issued_at"],
            valid_from=preview["valid_from"],
            valid_until=preview["valid_until"],
            activation_code=code.strip(),
            activation_code_hash=code_hash,
            payload_json=json.dumps(payload, sort_keys=True),
            activated_at=now,
            is_active=False,
        ))
        db.commit()
        return activation_status(db, company_id)

    db.add(models.LicenseActivation(
        company_id=company_id,
        license_id=preview["license_id"],
        installation_id=preview["installation_id"],
        client_name=preview["client_name"],
        contact_name=preview["contact_name"],
        contact_email=preview["contact_email"],
        contact_phone=preview["contact_phone"],
        plan_name=preview["plan_name"],
        issued_by=preview["issued_by"],
        issued_at=preview["issued_at"],
        valid_from=preview["valid_from"],
        valid_until=preview["valid_until"],
        activation_code=code.strip(),
        activation_code_hash=code_hash,
        payload_json=json.dumps(payload, sort_keys=True),
        activated_at=now,
        is_active=True,
    ))
    db.commit()
    return activation_status(db, company_id)
