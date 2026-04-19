from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import authenticate_user, create_access_token, get_current_user, hash_password
from ..audit import audit
from ..schemas import TokenResponse, UserRead, UserProfileUpdate

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/login", response_model=TokenResponse)
def login(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    user = authenticate_user(db, username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    token = create_access_token({"sub": user.username, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "permissions_json": user.permissions_json,
    }

@router.get("/me", response_model=UserRead)
def me(current_user = Depends(get_current_user)):
    return current_user

@router.put("/me", response_model=UserRead)
def update_me(payload: UserProfileUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    if password:
        current_user.password_hash = hash_password(password)
    for key, value in data.items():
        setattr(current_user, key, value)
    audit(db, current_user.username, "update", "user_profile", entity_id=current_user.id, details={k: ("***" if k == "password" else v) for k, v in payload.model_dump(exclude_none=True).items()})
    db.commit()
    db.refresh(current_user)
    return current_user
