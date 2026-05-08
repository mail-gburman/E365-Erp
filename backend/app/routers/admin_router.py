from datetime import datetime
from pathlib import Path
import os
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import require_roles, hash_password, get_current_user
from ..audit import audit
from ..booking_profiles import VALID_BOOKING_TYPES
from .. import models, schemas
from ..demo_data import ensure_demo_data, remove_demo_data, demo_dataset_status

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_roles("admin", "super_admin"))])
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/tmp/e365_uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _require_super_admin(current_user):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only e365 master admin can do this.")


def _current_company_or_404(db: Session, current_user):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="No company linked to this user.")
    company = db.query(models.Company).filter(models.Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found.")
    return company


def _clean_company_booking_type(data: dict):
    if "booking_type" not in data or data.get("booking_type") is None:
        return
    if data["booking_type"] not in VALID_BOOKING_TYPES:
        raise HTTPException(status_code=400, detail=f"Booking type must be one of: {', '.join(sorted(VALID_BOOKING_TYPES))}.")


@router.get("/booking-profiles", response_model=list[schemas.BookingTypeProfileRead])
def list_booking_profiles(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role not in {"super_admin", "admin"}:
        raise HTTPException(status_code=403, detail="Only admins can view booking profiles.")
    return db.query(models.BookingTypeProfile).order_by(models.BookingTypeProfile.booking_type.asc()).all()


@router.get("/companies", response_model=list[schemas.CompanyRead])
def list_companies(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_super_admin(current_user)
    return db.query(models.Company).order_by(models.Company.id.desc()).all()


@router.post("/companies", response_model=schemas.CompanyRead)
def create_company(payload: schemas.CompanyCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_super_admin(current_user)
    if db.query(models.Company).filter(models.Company.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Company name already exists.")
    if db.query(models.User).filter(models.User.username == payload.admin_username).first():
        raise HTTPException(status_code=400, detail="Admin username already exists.")

    company_data = payload.model_dump(exclude={"admin_username", "admin_password", "admin_full_name", "admin_email", "admin_phone"})
    _clean_company_booking_type(company_data)
    company = models.Company(**company_data)
    db.add(company)
    db.flush()
    admin_user = models.User(
        username=payload.admin_username,
        password_hash=hash_password(payload.admin_password),
        role="admin",
        company_id=company.id,
        full_name=payload.admin_full_name or payload.admin_username,
        phone=payload.admin_phone,
        email=payload.admin_email,
        permissions_json=None,
        is_active=True,
    )
    db.add(admin_user)
    audit(db, current_user.username, "create", "company", entity_id=company.id, details={"company": company.name, "admin": admin_user.username})
    db.commit()
    db.refresh(company)
    return company


@router.put("/companies/{company_id}", response_model=schemas.CompanyRead)
def update_company(company_id: int, payload: schemas.CompanyUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _require_super_admin(current_user)
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found.")
    data = payload.model_dump(exclude_unset=True)
    _clean_company_booking_type(data)
    for k, v in data.items():
        setattr(company, k, v)
    audit(db, current_user.username, "update", "company", entity_id=company_id, details=data)
    db.commit()
    db.refresh(company)
    return company


@router.get("/company-profile", response_model=schemas.CompanyRead)
def company_profile(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return _current_company_or_404(db, current_user)


@router.put("/company-profile", response_model=schemas.CompanyRead)
def update_company_profile(payload: schemas.CompanyUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    company = _current_company_or_404(db, current_user)
    data = payload.model_dump(exclude_unset=True)
    data.pop("status", None)
    data.pop("booking_type", None)
    for k, v in data.items():
        setattr(company, k, v)
    audit(db, current_user.username, "update", "company_profile", entity_id=company.id, details=data)
    db.commit()
    db.refresh(company)
    return company


@router.post("/company-profile/logo", response_model=schemas.CompanyRead)
async def upload_company_logo(file: UploadFile = File(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    company = _current_company_or_404(db, current_user)
    safe_name = f"company_{company.id}_logo_{int(datetime.utcnow().timestamp())}_{Path(file.filename).name}"
    target = UPLOAD_DIR / safe_name
    with open(target, "wb") as f:
        f.write(await file.read())
    company.logo_path = str(target)
    audit(db, current_user.username, "upload", "company_logo", entity_id=company.id)
    db.commit()
    db.refresh(company)
    return company


@router.get("/company-profile/logo")
def download_company_logo(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    company = _current_company_or_404(db, current_user)
    if not company.logo_path or not Path(company.logo_path).is_file():
        raise HTTPException(status_code=404, detail="Logo not uploaded.")
    return FileResponse(company.logo_path, filename=Path(company.logo_path).name)


@router.get("/company-profile/documents", response_model=list[schemas.CompanyDocumentRead])
def list_company_documents(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    company = _current_company_or_404(db, current_user)
    return db.query(models.CompanyDocument).filter(models.CompanyDocument.company_id == company.id).order_by(models.CompanyDocument.id.desc()).all()


@router.post("/company-profile/documents", response_model=schemas.CompanyDocumentRead)
async def upload_company_document(
    document_name: str = Form(...),
    notes: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    company = _current_company_or_404(db, current_user)
    safe_name = f"company_{company.id}_doc_{int(datetime.utcnow().timestamp())}_{Path(file.filename).name}"
    target = UPLOAD_DIR / safe_name
    with open(target, "wb") as f:
        f.write(await file.read())
    doc = models.CompanyDocument(company_id=company.id, document_name=document_name, notes=notes or None, file_path=str(target), uploaded_by=current_user.username)
    db.add(doc)
    audit(db, current_user.username, "upload", "company_document", entity_id=company.id, details={"document_name": document_name})
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/company-profile/documents/{document_id}/download")
def download_company_document(document_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    company = _current_company_or_404(db, current_user)
    doc = db.query(models.CompanyDocument).filter(models.CompanyDocument.id == document_id, models.CompanyDocument.company_id == company.id).first()
    if not doc or not Path(doc.file_path).is_file():
        raise HTTPException(status_code=404, detail="Document not found.")
    return FileResponse(doc.file_path, filename=Path(doc.file_path).name)

@router.get("/users", response_model=list[schemas.UserAdminRead])
def list_users(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    q = db.query(models.User).order_by(models.User.id.asc())
    if current_user.role != "super_admin":
        q = q.filter(models.User.company_id == current_user.company_id)
    return q.all()

@router.post("/users", response_model=schemas.UserAdminRead)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists.")
    company_id = payload.company_id if current_user.role == "super_admin" else current_user.company_id
    if payload.role == "super_admin" and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only e365 master admin can create master users.")
    if payload.role != "super_admin" and not company_id:
        raise HTTPException(status_code=400, detail="Company is required.")
    item = models.User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
        company_id=None if payload.role == "super_admin" else company_id,
        full_name=payload.full_name,
        phone=payload.phone,
        email=payload.email,
        permissions_json=payload.permissions_json,
        is_active=payload.is_active,
    )
    db.add(item)
    audit(db, current_user.username, "create", "user", details={"username": payload.username, "role": payload.role})
    db.commit()
    db.refresh(item)
    return item

@router.put("/users/{user_id}", response_model=schemas.UserAdminRead)
def update_user(user_id: int, payload: schemas.UserUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    q = db.query(models.User).filter(models.User.id == user_id)
    if current_user.role != "super_admin":
        q = q.filter(models.User.company_id == current_user.company_id)
    item = q.first()
    if not item:
        raise HTTPException(status_code=404, detail="User not found.")
    data = payload.model_dump(exclude_unset=True)
    if current_user.role != "super_admin":
        data.pop("company_id", None)
        if data.get("role") == "super_admin":
            raise HTTPException(status_code=403, detail="Only e365 master admin can assign master role.")
    if "password" in data and data["password"]:
        item.password_hash = hash_password(data.pop("password"))
    for k, v in data.items():
        setattr(item, k, v)
    audit(db, current_user.username, "update", "user", entity_id=user_id, details=data)
    db.commit()
    db.refresh(item)
    return item

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    q = db.query(models.User).filter(models.User.id == user_id)
    if current_user.role != "super_admin":
        q = q.filter(models.User.company_id == current_user.company_id)
    item = q.first()
    if not item:
        raise HTTPException(status_code=404, detail="User not found.")
    if item.username == "admin":
        raise HTTPException(status_code=400, detail="Default admin cannot be deleted.")
    db.delete(item)
    audit(db, current_user.username, "delete", "user", entity_id=user_id, details={"username": item.username})
    db.commit()
    return {"ok": True}


# ── Role Preset CRUD ────────────────────────────────────────────────────────

@router.get("/presets", response_model=list[schemas.RolePresetRead])
def list_presets(db: Session = Depends(get_db)):
    return db.query(models.RolePreset).order_by(models.RolePreset.is_builtin.desc(), models.RolePreset.name).all()


@router.post("/presets", response_model=schemas.RolePresetRead)
def create_preset(payload: schemas.RolePresetCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if db.query(models.RolePreset).filter(models.RolePreset.name == payload.name).first():
        raise HTTPException(status_code=400, detail="A preset with this name already exists.")
    preset = models.RolePreset(
        name=payload.name,
        description=payload.description,
        permissions_json=payload.permissions_json,
        is_builtin=False,
        created_by=current_user.username,
    )
    db.add(preset)
    audit(db, current_user.username, "create", "role_preset", details={"name": payload.name})
    db.commit()
    db.refresh(preset)
    return preset


@router.put("/presets/{preset_id}", response_model=schemas.RolePresetRead)
def update_preset(preset_id: int, payload: schemas.RolePresetUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    preset = db.query(models.RolePreset).filter(models.RolePreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found.")
    data = payload.model_dump(exclude_unset=True)
    # Built-in presets: allow permissions_json updates but name is locked
    if preset.is_builtin and "name" in data and data["name"] != preset.name:
        raise HTTPException(status_code=400, detail="Built-in preset names cannot be changed.")
    if "name" in data:
        existing = db.query(models.RolePreset).filter(models.RolePreset.name == data["name"], models.RolePreset.id != preset_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="A preset with this name already exists.")
    for k, v in data.items():
        setattr(preset, k, v)
    preset.updated_at = datetime.utcnow()
    audit(db, current_user.username, "update", "role_preset", entity_id=preset_id, details={"name": preset.name, "builtin": preset.is_builtin})
    db.commit()
    db.refresh(preset)
    return preset


@router.post("/presets/{preset_id}/reset")
def reset_builtin_preset(preset_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Reset a built-in preset back to its original default permissions."""
    from ..permissions import ROLE_DEFAULTS
    import json
    preset = db.query(models.RolePreset).filter(models.RolePreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found.")
    if not preset.is_builtin:
        raise HTTPException(status_code=400, detail="Only built-in presets can be reset.")
    original = ROLE_DEFAULTS.get(preset.name)
    if not original:
        raise HTTPException(status_code=400, detail=f"No default found for built-in preset '{preset.name}'.")
    preset.permissions_json = json.dumps(original)
    preset.updated_at = datetime.utcnow()
    audit(db, current_user.username, "reset", "role_preset", entity_id=preset_id, details={"name": preset.name})
    db.commit()
    db.refresh(preset)
    return preset


@router.delete("/presets/{preset_id}")
def delete_preset(preset_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    preset = db.query(models.RolePreset).filter(models.RolePreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found.")
    if preset.is_builtin:
        raise HTTPException(status_code=400, detail="Built-in presets cannot be deleted. Edit them instead.")
    audit(db, current_user.username, "delete", "role_preset", entity_id=preset_id, details={"name": preset.name})
    db.delete(preset)
    db.commit()
    return {"ok": True}


# ── Session management ──────────────────────────────────────────────────────

@router.get("/sessions", response_model=list[schemas.UserSessionRead])
def list_sessions(db: Session = Depends(get_db)):
    """Return all sessions (active + recently expired) newest first."""
    now = datetime.utcnow()
    sessions = (
        db.query(models.UserSession)
        .order_by(models.UserSession.login_at.desc())
        .limit(500)
        .all()
    )
    result = []
    for s in sessions:
        item = schemas.UserSessionRead.model_validate(s)
        item.username = s.user.username if s.user else None
        result.append(item)
    return result


@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Revoke a specific session by ID."""
    session = db.query(models.UserSession).filter(models.UserSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    session.is_active = False
    audit(db, current_user.username, "revoke", "session", entity_id=session_id,
          details={"target_user_id": session.user_id})
    db.commit()
    return {"ok": True}


@router.delete("/sessions/user/{user_id}")
def revoke_user_sessions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Revoke ALL active sessions for a specific user."""
    updated = (
        db.query(models.UserSession)
        .filter(models.UserSession.user_id == user_id, models.UserSession.is_active == True)
        .update({"is_active": False}, synchronize_session=False)
    )
    audit(db, current_user.username, "revoke_all", "session",
          details={"target_user_id": user_id, "count": updated})
    db.commit()
    return {"ok": True, "revoked": updated}


@router.delete("/sessions/expired/cleanup")
def cleanup_expired_sessions(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Remove session records older than 30 days."""
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=30)
    deleted = (
        db.query(models.UserSession)
        .filter(models.UserSession.login_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"ok": True, "deleted": deleted}


# ── Demo dataset ────────────────────────────────────────────────────────────

@router.get("/demo-dataset")
def get_demo_dataset_status(db: Session = Depends(get_db)):
    return demo_dataset_status(db)


@router.post("/demo-dataset/load")
def load_demo_dataset(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    ensure_demo_data(db)
    audit(db, current_user.username, "create", "demo_data", details={"message": "Demo dataset loaded"})
    db.commit()
    return {"ok": True, **demo_dataset_status(db)}


@router.delete("/demo-dataset")
def delete_demo_dataset(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    result = remove_demo_data(db)
    audit(db, current_user.username, "delete", "demo_data", details={"message": result["message"]})
    db.commit()
    return result | demo_dataset_status(db)
