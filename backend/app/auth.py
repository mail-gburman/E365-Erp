import os
import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .database import get_db
from . import models
from .env import load_env

load_env()

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
SECRET_KEY = os.getenv("JWT_SECRET", "dev_secret")
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60 * 12   # 12 hours

# ── password helpers ────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

# ── user-agent parser (no external deps) ───────────────────────────────────

def parse_user_agent(ua: str) -> dict:
    ua = ua or ""

    # OS
    if "Windows NT 10" in ua or "Windows NT 11" in ua:
        os_name = "Windows 10/11"
    elif "Windows NT 6.3" in ua:
        os_name = "Windows 8.1"
    elif "Windows NT 6.2" in ua:
        os_name = "Windows 8"
    elif "Windows NT 6.1" in ua:
        os_name = "Windows 7"
    elif "Windows" in ua:
        os_name = "Windows"
    elif "iPhone" in ua:
        os_name = "iOS (iPhone)"
    elif "iPad" in ua:
        os_name = "iOS (iPad)"
    elif "Android" in ua:
        os_name = "Android"
    elif "Mac OS X" in ua:
        os_name = "macOS"
    elif "Linux" in ua:
        os_name = "Linux"
    else:
        os_name = "Unknown"

    # Browser (order matters — Edge/Chrome share UA tokens)
    if "Edg/" in ua or "Edge/" in ua:
        browser = "Edge"
    elif "OPR/" in ua or "Opera/" in ua:
        browser = "Opera"
    elif "Chrome/" in ua:
        browser = "Chrome"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Safari/" in ua:
        browser = "Safari"
    elif "curl" in ua.lower():
        browser = "cURL"
    elif "python" in ua.lower():
        browser = "Python/Script"
    else:
        browser = "Unknown"

    # Device type
    if "Mobile" in ua:
        device_type = "Mobile"
    elif "iPad" in ua or "Tablet" in ua:
        device_type = "Tablet"
    else:
        device_type = "Desktop"

    return {"os": os_name, "browser": browser, "device_type": device_type}

# ── token creation ─────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_minutes: int = TOKEN_EXPIRE_MINUTES) -> tuple[str, str, datetime]:
    """Return (token, jti, expires_at)."""
    jti = str(uuid.uuid4())
    to_encode = data.copy()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": expires_at, "jti": jti})
    token = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return token, jti, expires_at

# ── authentication helpers ─────────────────────────────────────────────────

def authenticate_user(db: Session, username: str, password: str):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not user.is_active or not verify_password(password, user.password_hash):
        return None
    return user

# ── request-time session validation ───────────────────────────────────────

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        jti: str = payload.get("jti")
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or not user.is_active:
        raise credentials_exception

    # If token carries a jti, validate it against the session store
    if jti:
        now = datetime.utcnow()
        session = db.query(models.UserSession).filter(
            models.UserSession.token_jti == jti,
            models.UserSession.is_active == True,
            models.UserSession.expires_at > now,
        ).first()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session revoked or expired. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Lazily update last_active_at at most once every 5 minutes
        if (now - session.last_active_at).total_seconds() > 300:
            session.last_active_at = now
            db.commit()

    return user

# ── role-based guard ───────────────────────────────────────────────────────

def require_roles(*allowed_roles):
    def dep(current_user=Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient role permission.")
        return current_user
    return dep
