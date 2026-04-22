from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from ..permissions import require_document_permission, require_permission
from .. import models, schemas
from ..utils import make_branded_pdf
from ..codegen import next_paper_number
from ..audit import audit

router = APIRouter(prefix="/papers", tags=["Papers"])

@router.get("/", response_model=list[schemas.OutboundPaperRead], dependencies=[Depends(require_permission("papers","view"))])
def list_papers(db: Session = Depends(get_db)):
    return db.query(models.OutboundPaper).order_by(models.OutboundPaper.id.desc()).all()

@router.post("/", response_model=schemas.OutboundPaperRead, dependencies=[Depends(require_permission("papers","add"))])
def create_paper(payload: schemas.OutboundPaperCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    data = payload.model_dump()
    if not data.get("paper_number"):
        data["paper_number"] = next_paper_number(db)
    item = models.OutboundPaper(**data)
    db.add(item); audit(db,current_user.username,"create","paper",details=data); db.commit(); db.refresh(item); return item

@router.get("/{paper_id}/pdf", dependencies=[Depends(require_document_permission("paper", "download"))])
def paper_pdf(paper_id: int, db: Session = Depends(get_db)):
    item = db.query(models.OutboundPaper).filter(models.OutboundPaper.id == paper_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Paper not found.")
    pdf = make_branded_pdf(
        "Kaleidoscope Productions - Outbound / Movement Paper",
        "Branded printable equipment and crew movement document",
        [
            f"Paper Number: {item.paper_number}",
            f"Paper Type: {item.paper_type}",
            f"Reference: {item.reference_name}",
            f"Destination: {item.destination}",
            f"Issued By: {item.issued_by}",
            f"Status: {item.issue_status}",
            f"Related Booking ID: {item.related_booking_id or '-'}",
            f"Related Service Job ID: {item.related_service_job_id or '-'}",
            f"Remarks: {item.remarks or '-'}",
        ],
    )
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="paper_{item.paper_number}.pdf"'})
