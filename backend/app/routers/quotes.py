"""Quotation / Proposal module — Tier_V_01"""
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas
from ..audit import audit
from ..utils import make_quotation_pdf

router = APIRouter(prefix="/quotes", tags=["Quotes"])


def _calc_totals(subtotal: float, discount_pct: float, tax_pct: float):
    discount = round(subtotal * discount_pct / 100, 2)
    after_disc = subtotal - discount
    tax = round(after_disc * tax_pct / 100, 2)
    total = round(after_disc + tax, 2)
    return discount, tax, total


def _next_quote_number(db: Session) -> str:
    last = db.query(models.Quotation).order_by(models.Quotation.id.desc()).first()
    seq = (last.id + 1) if last else 1
    return f"QT-{seq:05d}"


def _serialize(q: models.Quotation) -> dict:
    d = schemas.QuotationRead.model_validate(q).model_dump()
    d["client_name"] = q.client.name if q.client else None
    d["project_title"] = q.project_event.title if q.project_event else None
    return d


@router.get("")
def list_quotes(
    client_id: int = Query(None),
    status: str = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(models.Quotation)
    if client_id:
        q = q.filter(models.Quotation.client_id == client_id)
    if status:
        q = q.filter(models.Quotation.status == status)
    quotes = q.order_by(models.Quotation.id.desc()).all()
    return [_serialize(qt) for qt in quotes]


@router.post("", status_code=201)
def create_quote(
    payload: schemas.QuotationCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    client = db.query(models.Client).filter(models.Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(404, "Client not found")

    subtotal = round(sum(i.qty * i.rate for i in payload.items), 2)
    discount, tax, total = _calc_totals(subtotal, payload.discount_pct, payload.tax_pct)

    quote = models.Quotation(
        quote_number=_next_quote_number(db),
        client_id=payload.client_id,
        project_event_id=payload.project_event_id,
        subject=payload.subject,
        valid_until=payload.valid_until,
        notes=payload.notes,
        terms=payload.terms,
        discount_pct=payload.discount_pct,
        tax_pct=payload.tax_pct,
        subtotal=subtotal,
        discount_amount=discount,
        tax_amount=tax,
        total=total,
        created_by=user.username,
        updated_by=user.username,
    )
    db.add(quote)
    db.flush()

    for idx, it in enumerate(payload.items):
        db.add(models.QuotationItem(
            quotation_id=quote.id,
            sort_order=it.sort_order or idx,
            description=it.description,
            item_type=it.item_type,
            hsn_code=it.hsn_code,
            qty=it.qty,
            unit=it.unit,
            rate=it.rate,
            amount=round(it.qty * it.rate, 2),
        ))

    db.commit()
    db.refresh(quote)
    audit(db, user.username, "create", "quotation", str(quote.id), {"quote_number": quote.quote_number})
    return _serialize(quote)


@router.get("/{quote_id}")
def get_quote(quote_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(models.Quotation).filter(models.Quotation.id == quote_id).first()
    if not q:
        raise HTTPException(404, "Quote not found")
    return _serialize(q)


@router.put("/{quote_id}")
def update_quote(
    quote_id: int,
    payload: schemas.QuotationUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(models.Quotation).filter(models.Quotation.id == quote_id).first()
    if not q:
        raise HTTPException(404, "Quote not found")
    if q.status in ("accepted", "converted"):
        raise HTTPException(400, f"Cannot edit a {q.status} quote")

    if payload.subject is not None:
        q.subject = payload.subject
    if payload.valid_until is not None:
        q.valid_until = payload.valid_until
    if payload.notes is not None:
        q.notes = payload.notes
    if payload.terms is not None:
        q.terms = payload.terms
    if payload.discount_pct is not None:
        q.discount_pct = payload.discount_pct
    if payload.tax_pct is not None:
        q.tax_pct = payload.tax_pct

    if payload.items is not None:
        for old in q.items:
            db.delete(old)
        db.flush()
        for idx, it in enumerate(payload.items):
            db.add(models.QuotationItem(
                quotation_id=q.id,
                sort_order=it.sort_order or idx,
                description=it.description,
                item_type=it.item_type,
                hsn_code=it.hsn_code,
                qty=it.qty,
                unit=it.unit,
                rate=it.rate,
                amount=round(it.qty * it.rate, 2),
            ))
        db.flush()
        db.refresh(q)

    q.subtotal = round(sum(i.qty * i.rate for i in q.items), 2)
    q.discount_amount, q.tax_amount, q.total = _calc_totals(q.subtotal, q.discount_pct, q.tax_pct)
    q.version += 1
    q.updated_at = datetime.utcnow()
    q.updated_by = user.username
    db.commit()
    db.refresh(q)
    audit(db, user.username, "update", "quotation", str(q.id), {"version": q.version})
    return _serialize(q)


@router.post("/{quote_id}/status")
def set_quote_status(
    quote_id: int,
    status: str = Query(..., description="draft/sent/accepted/rejected/expired"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(models.Quotation).filter(models.Quotation.id == quote_id).first()
    if not q:
        raise HTTPException(404, "Quote not found")
    allowed = {"draft", "sent", "accepted", "rejected", "expired"}
    if status not in allowed:
        raise HTTPException(400, f"Invalid status. Must be one of: {allowed}")
    if q.status == "converted":
        raise HTTPException(400, "Cannot change status of a converted quote")
    q.status = status
    q.updated_at = datetime.utcnow()
    q.updated_by = user.username
    db.commit()
    db.refresh(q)
    audit(db, user.username, "status_change", "quotation", str(q.id), {"status": status})
    return _serialize(q)


@router.post("/{quote_id}/convert")
def convert_to_booking(
    quote_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Mark a quote as converted (booking must be created separately in Bookings page)."""
    q = db.query(models.Quotation).filter(models.Quotation.id == quote_id).first()
    if not q:
        raise HTTPException(404, "Quote not found")
    if q.status not in ("accepted", "sent"):
        raise HTTPException(400, "Quote must be accepted or sent before converting")
    q.status = "converted"
    q.updated_at = datetime.utcnow()
    q.updated_by = user.username
    db.commit()
    db.refresh(q)
    audit(db, user.username, "convert", "quotation", str(q.id), {"quote_number": q.quote_number})
    return _serialize(q)


@router.delete("/{quote_id}", status_code=204)
def delete_quote(quote_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(models.Quotation).filter(models.Quotation.id == quote_id).first()
    if not q:
        raise HTTPException(404, "Quote not found")
    if q.status == "converted":
        raise HTTPException(400, "Cannot delete a converted quote")
    db.delete(q)
    db.commit()
    audit(db, user.username, "delete", "quotation", str(quote_id), {})


@router.get("/{quote_id}/pdf")
def download_quote_pdf(
    quote_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(models.Quotation).filter(models.Quotation.id == quote_id).first()
    if not q:
        raise HTTPException(404, "Quote not found")
    client_name = q.client.name if q.client else "—"
    project_title = q.project_event.title if q.project_event else None
    buf = make_quotation_pdf(q, client_name, project_title)
    filename = f"{q.quote_number}_v{q.version}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
