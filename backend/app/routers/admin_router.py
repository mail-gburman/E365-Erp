from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import require_roles, hash_password, get_current_user
from ..audit import audit
from .. import models, schemas
from ..demo_data import ensure_demo_data, remove_demo_data, demo_dataset_status

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_roles("admin"))])

@router.get("/users", response_model=list[schemas.UserAdminRead])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.id.asc()).all()

@router.post("/users", response_model=schemas.UserAdminRead)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    existing = db.query(models.User).filter(models.User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists.")
    item = models.User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
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
    item = db.query(models.User).filter(models.User.id == user_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="User not found.")
    data = payload.model_dump(exclude_unset=True)
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
    item = db.query(models.User).filter(models.User.id == user_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="User not found.")
    if item.username == "admin":
        raise HTTPException(status_code=400, detail="Default admin cannot be deleted.")
    db.delete(item)
    audit(db, current_user.username, "delete", "user", entity_id=user_id, details={"username": item.username})
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
