from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import (
    authenticate_user, create_access_token, get_current_user,
    hash_password, parse_user_agent, oauth2_scheme, SECRET_KEY, ALGORITHM,
)
from ..audit import audit
from ..schemas import TokenResponse, UserRead, UserProfileUpdate
from .. import models
from jose import jwt, JWTError

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = authenticate_user(db, username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token, jti, expires_at = create_access_token({"sub": user.username, "role": user.role})

    # Parse client info
    ua_string = request.headers.get("user-agent", "")
    ua_info = parse_user_agent(ua_string)
    ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or request.headers.get("x-real-ip", "")
        or (request.client.host if request.client else "unknown")
    )

    # Enforce max concurrent sessions (0 = unlimited)
    max_s = user.max_sessions if user.max_sessions is not None else 5
    if max_s > 0:
        now = datetime.utcnow()
        active_sessions = (
            db.query(models.UserSession)
            .filter(
                models.UserSession.user_id == user.id,
                models.UserSession.is_active == True,
                models.UserSession.expires_at > now,
            )
            .order_by(models.UserSession.login_at.asc())
            .all()
        )
        # Revoke oldest sessions if at/over the limit
        while len(active_sessions) >= max_s:
            oldest = active_sessions.pop(0)
            oldest.is_active = False

    # Create new session record
    session = models.UserSession(
        user_id=user.id,
        token_jti=jti,
        ip_address=ip,
        user_agent_raw=ua_string[:512] if ua_string else None,
        os=ua_info["os"],
        browser=ua_info["browser"],
        device_type=ua_info["device_type"],
        login_at=datetime.utcnow(),
        last_active_at=datetime.utcnow(),
        expires_at=expires_at.replace(tzinfo=None),  # store as UTC naive
        is_active=True,
    )
    db.add(session)
    audit(db, user.username, "login", "session", details={"ip": ip, "os": ua_info["os"], "browser": ua_info["browser"]})
    db.commit()

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "permissions_json": user.permissions_json,
    }


@router.post("/logout")
def logout(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Revoke the current session server-side. Always returns ok."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        jti = payload.get("jti")
        username = payload.get("sub")
        if jti:
            session = db.query(models.UserSession).filter(
                models.UserSession.token_jti == jti
            ).first()
            if session:
                session.is_active = False
                audit(db, username or "unknown", "logout", "session", entity_id=session.id)
                db.commit()
    except Exception:
        pass  # token already invalid — silently succeed
    return {"ok": True}


@router.get("/me", response_model=UserRead)
def me(current_user=Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserRead)
def update_me(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    if password:
        current_user.password_hash = hash_password(password)
    for key, value in data.items():
        setattr(current_user, key, value)
    audit(
        db, current_user.username, "update", "user_profile",
        entity_id=current_user.id,
        details={k: ("***" if k == "password" else v) for k, v in payload.model_dump(exclude_none=True).items()},
    )
    db.commit()
    db.refresh(current_user)
    return current_user
