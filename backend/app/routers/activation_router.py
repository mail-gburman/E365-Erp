from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..licensing import (
    activation_status,
    all_companies_status,
    apply_activation_code,
    preview_activation_code,
)
from ..schemas import ActivationApply, ActivationPreviewRead, ActivationStatusRead

router = APIRouter(prefix="/activation", tags=["Activation"])


@router.get("/status/{company_id}", response_model=ActivationStatusRead)
def get_status(company_id: int, db: Session = Depends(get_db)):
    """Return the current license status for a specific company."""
    try:
        return activation_status(db, company_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/all", response_model=List[ActivationStatusRead])
def get_all_statuses(db: Session = Depends(get_db)):
    """Return license status for all companies. Intended for super-admin overview."""
    return all_companies_status(db)


@router.post("/preview", response_model=ActivationPreviewRead)
def preview_license(payload: ActivationApply, db: Session = Depends(get_db)):
    """Preview an activation code without applying it."""
    try:
        return preview_activation_code(db, payload.company_id, payload.activation_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/apply", response_model=ActivationStatusRead)
def apply_license(payload: ActivationApply, db: Session = Depends(get_db)):
    """Apply an activation code for a company."""
    try:
        return apply_activation_code(db, payload.company_id, payload.activation_code)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
