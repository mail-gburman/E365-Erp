import os
from datetime import date
from pathlib import Path
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..auth import get_current_user
from ..booking_profiles import feature_enabled_for_user
from ..permissions import require_document_permission, require_permission
from .. import models, schemas
from ..utils import make_branded_pdf, make_service_declaration_pdf, make_address_label_pdf
from ..codegen import next_service_job_number
from ..audit import audit

router = APIRouter(prefix="/service-jobs", tags=["Service Jobs"])
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/tmp/e365_uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _coalesce(*values):
    for value in values:
        if value not in (None, "", []):
            return value
    return None


def _vendor_address(vendor):
    if not vendor:
        return None
    lines = [getattr(vendor, "address", None), getattr(vendor, "city", None)]
    return "\n".join([str(line).strip() for line in lines if line]) or None


def _attachment_payload(att):
    return {
        "id": att.id,
        "file_name": att.file_name,
        "caption": att.caption,
        "uploaded_by": att.uploaded_by,
        "created_at": att.created_at.isoformat() if att.created_at else None,
        "download_url": f"/service-jobs/attachments/{att.id}/download",
    }


def _service_jobs_enabled(current_user):
    return feature_enabled_for_user(current_user, "serviceJobs")


def _reject_if_not_service_profile(current_user):
    if not _service_jobs_enabled(current_user):
        raise HTTPException(status_code=400, detail="Repair/service jobs are not used for this company's booking type.")


@router.get("/", response_model=list[schemas.ServiceJobRead], dependencies=[Depends(require_permission("services","view"))])
def list_service_jobs(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not _service_jobs_enabled(current_user):
        return []
    return db.query(models.ServiceJob).order_by(models.ServiceJob.id.desc()).all()


@router.get("/details", dependencies=[Depends(require_permission("services","view"))])
def list_service_job_details(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not _service_jobs_enabled(current_user):
        return []
    rows = db.query(models.ServiceJob).order_by(models.ServiceJob.id.desc()).all()
    return [{
        "id": r.id,
        "job_number": r.job_number,
        "inventory_item_id": r.inventory_item_id,
        "inventory_name": r.inventory_item.name if r.inventory_item else None,
        "asset_code": r.inventory_item.asset_code if r.inventory_item else None,
        "vendor_name": r.vendor_name,
        "status": r.status,
        "sent_date": str(r.sent_date),
        "expected_return_date": str(r.expected_return_date) if r.expected_return_date else None,
        "actual_return_date": str(r.actual_return_date) if r.actual_return_date else None,
        "transport_mode": r.transport_mode,
        "courier_partner": r.courier_partner,
        "awb_number": r.awb_number,
        "contact_person_name": r.contact_person_name,
        "contact_person_mobile": r.contact_person_mobile,
        "alternate_contact_name": r.alternate_contact_name,
        "alternate_contact_mobile": r.alternate_contact_mobile,
        "contact_email": r.contact_email,
        "pickup_address": r.pickup_address,
        "delivery_address": r.delivery_address,
        "package_count": r.package_count,
        "declared_value": r.declared_value,
        "package_notes": r.package_notes,
        "problem_reported": r.problem_reported,
        "remarks": r.remarks,
        "source_booking_id": r.source_booking_id,
        "source_damage_id": r.source_damage_id,
        "attachments": [_attachment_payload(att) for att in (r.attachments or [])],
    } for r in rows]


@router.post("/", response_model=schemas.ServiceJobRead, dependencies=[Depends(require_permission("services","add"))])
def create_service_job(payload: schemas.ServiceJobCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    _reject_if_not_service_profile(current_user)
    inv = db.query(models.InventoryItem).filter(models.InventoryItem.id == payload.inventory_item_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory item not found.")
    if inv.service_status == "in_service":
        raise HTTPException(status_code=400, detail=f"{inv.asset_code} is already under service.")
    active_booking = db.query(models.BookingEquipment).join(models.EventBooking).filter(
        models.BookingEquipment.inventory_item_id == payload.inventory_item_id,
        models.EventBooking.status.in_(["confirmed", "dispatched"])
    ).first()
    if active_booking:
        allow_return_service = False
        if payload.source_booking_id and active_booking.booking_id == payload.source_booking_id:
            partial = db.query(models.PartialReturn).filter(
                models.PartialReturn.booking_id == payload.source_booking_id,
                models.PartialReturn.inventory_item_id == payload.inventory_item_id,
                models.PartialReturn.condition_status.in_(["damaged", "incomplete"]),
            ).first()
            allow_return_service = bool(partial)
        if not allow_return_service:
            raise HTTPException(status_code=400, detail="Cannot open a service job for equipment that is in an active booking unless it has been partially returned as damaged/incomplete.")
    inv.status = "servicing"
    inv.service_status = "in_service"
    data = payload.model_dump()
    if not data.get("job_number"):
        data["job_number"] = next_service_job_number(db)
    if not data.get("transport_mode"):
        data["transport_mode"] = "hand_delivery"
    item = models.ServiceJob(**data)
    db.add(item)
    audit(db, current_user.username, "create", "service_job", details=data)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{job_id}/complete", response_model=schemas.ServiceJobRead, dependencies=[Depends(require_permission("services","edit"))])
def complete_service_job(job_id: int, notes: str | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    item = db.query(models.ServiceJob).filter(models.ServiceJob.id == job_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Service job not found.")
    if item.status != "in_service":
        raise HTTPException(status_code=400, detail=f"Cannot complete a service job with status '{item.status}'.")
    item.status = "completed"
    item.actual_return_date = date.today()
    if notes:
        item.remarks = (item.remarks + "\n" if item.remarks else "") + f"[completion] {notes}"
    if item.inventory_item:
        item.inventory_item.status = "available"
        item.inventory_item.service_status = "ok"
    audit(db, current_user.username, "complete", "service_job", entity_id=job_id, details={"notes": notes})
    db.commit()
    db.refresh(item)
    return item


@router.post("/{job_id}/forever-damaged", response_model=schemas.ServiceJobRead, dependencies=[Depends(require_permission("services","edit"))])
def mark_forever_damaged(job_id: int, notes: str | None = None, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    item = db.query(models.ServiceJob).filter(models.ServiceJob.id == job_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Service job not found.")
    if item.status not in ["in_service"]:
        raise HTTPException(status_code=400, detail=f"Cannot mark forever damaged with status '{item.status}'.")
    item.status = "forever_damaged"
    if notes:
        item.remarks = (item.remarks + "\n" if item.remarks else "") + f"[forever_damaged] {notes}"
    if item.inventory_item:
        item.inventory_item.status = "inactive"
        item.inventory_item.service_status = "forever_damaged"
    audit(db, current_user.username, "forever_damaged", "service_job", entity_id=job_id, details={"notes": notes})
    db.commit()
    db.refresh(item)
    return item


@router.post("/{job_id}/attachments", dependencies=[Depends(require_permission("services", "edit"))])
async def upload_service_attachments(
    job_id: int,
    files: list[UploadFile] = File(...),
    caption: str = Form(""),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    job = db.query(models.ServiceJob).filter(models.ServiceJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Service job not found.")
    saved = []
    for file in files:
        content_type = (file.content_type or "").lower()
        ext = Path(file.filename or "").suffix.lower()
        if not (content_type.startswith("image/") or ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}):
            raise HTTPException(status_code=400, detail="Only image files are allowed in service damage photos.")
        safe_name = f"service_{job_id}_{uuid.uuid4().hex[:10]}{ext or '.jpg'}"
        target = UPLOAD_DIR / safe_name
        with open(target, "wb") as handle:
            handle.write(await file.read())
        row = models.ServiceJobAttachment(
            service_job_id=job_id,
            file_name=file.filename or safe_name,
            file_path=str(target),
            caption=caption or None,
            uploaded_by=current_user.username,
        )
        db.add(row)
        saved.append(row)
    audit(db, current_user.username, "upload", "service_job", entity_id=job_id, details={
        "job_number": job.job_number,
        "message": f"{len(saved)} damage photo(s) attached",
        "note": caption or None,
    })
    db.commit()
    return {"ok": True, "count": len(saved)}


@router.get("/{job_id}/attachments", dependencies=[Depends(require_permission("services", "view"))])
def list_service_attachments(job_id: int, db: Session = Depends(get_db)):
    job = db.query(models.ServiceJob).filter(models.ServiceJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Service job not found.")
    return [_attachment_payload(att) for att in (job.attachments or [])]


@router.get("/attachments/{attachment_id}/download", dependencies=[Depends(require_permission("services", "view"))])
def download_service_attachment(attachment_id: int, db: Session = Depends(get_db)):
    row = db.query(models.ServiceJobAttachment).filter(models.ServiceJobAttachment.id == attachment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    file_path = Path(row.file_path or "")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file is missing on disk.")
    return FileResponse(str(file_path), filename=row.file_name)


@router.delete("/attachments/{attachment_id}", dependencies=[Depends(require_permission("services", "edit"))])
def delete_service_attachment(attachment_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    row = db.query(models.ServiceJobAttachment).filter(models.ServiceJobAttachment.id == attachment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    job_id = row.service_job_id
    file_path = Path(row.file_path)
    db.delete(row)
    audit(db, current_user.username, "delete", "service_job", entity_id=job_id, details={"message": "A damage photo was removed."})
    db.commit()
    try:
        if file_path.exists():
            file_path.unlink()
    except Exception:
        pass
    return {"ok": True}


@router.get("/{job_id}/pdf", dependencies=[Depends(require_document_permission("service", "download"))])
def download_service_pdf(job_id: int, db: Session = Depends(get_db)):
    item = db.query(models.ServiceJob).options(
        joinedload(models.ServiceJob.vendor),
        joinedload(models.ServiceJob.inventory_item),
        joinedload(models.ServiceJob.attachments),
    ).filter(models.ServiceJob.id == job_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Service job not found.")
    vendor = item.vendor
    inv = item.inventory_item
    inv_label = f"{inv.asset_code} - {inv.name}" if inv else "(equipment record unavailable)"
    try:
        declared_value_str = f"INR {float(item.declared_value):,.2f}" if item.declared_value is not None else "-"
    except Exception:
        declared_value_str = str(item.declared_value or "-")
    sent_date_str = item.sent_date.strftime("%d/%m/%Y") if getattr(item, "sent_date", None) else "-"
    expected_ret_str = item.expected_return_date.strftime("%d/%m/%Y") if getattr(item, "expected_return_date", None) else "-"
    actual_ret_str = item.actual_return_date.strftime("%d/%m/%Y") if getattr(item, "actual_return_date", None) else "-"
    pdf = make_branded_pdf(
        "Eventory - Service Outbound Paper",
        "Equipment servicing movement document",
        [
            f"Job Number: {item.job_number}",
            f"Inventory: {inv_label}",
            f"Vendor: {item.vendor_name}",
            f"Transport Mode: {item.transport_mode or '-'}",
            f"Courier / Logistics Partner: {item.courier_partner or '-'}",
            f"AWB / Docket Number: {item.awb_number or '-'}",
            f"Primary Contact: {_coalesce(item.contact_person_name, vendor.name if vendor else None) or '-'}",
            f"Primary Mobile: {_coalesce(item.contact_person_mobile, vendor.phone if vendor else None) or '-'}",
            f"Alternate Contact: {item.alternate_contact_name or '-'}",
            f"Alternate Mobile: {item.alternate_contact_mobile or '-'}",
            f"Email: {item.contact_email or '-'}",
            f"Pickup Address: {item.pickup_address or 'CREATVO STUDIOS Office'}",
            f"Delivery Address: {_coalesce(item.delivery_address, _vendor_address(vendor)) or '-'}",
            f"Sent Date: {sent_date_str}",
            f"Expected Return: {expected_ret_str}",
            f"Actual Return: {actual_ret_str}",
            f"Package Count: {item.package_count or 1}",
            f"Declared Value: {declared_value_str}",
            f"Package Notes: {item.package_notes or '-'}",
            f"Damage Photos Attached: {len(item.attachments or [])}",
            f"Status: {item.status}",
            f"Problem Reported: {item.problem_reported or '-'}",
            f"Remarks: {item.remarks or '-'}",
        ],
    )
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="service_{item.job_number}.pdf"'})


@router.get("/{job_id}/declaration-pdf", dependencies=[Depends(require_document_permission("service", "download"))])
def service_declaration_pdf(job_id: int, db: Session = Depends(get_db)):
    item = db.query(models.ServiceJob).options(
        joinedload(models.ServiceJob.vendor),
        joinedload(models.ServiceJob.inventory_item),
        joinedload(models.ServiceJob.attachments),
    ).filter(models.ServiceJob.id == job_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Service job not found.")
    inv = item.inventory_item
    item_desc = f"{item.package_count or 1} package(s) containing {inv.name}" if inv else "Equipment"
    if inv and inv.serial_number:
        item_desc += f", S/N. {inv.serial_number}"
    if item.declared_value is not None:
        try:
            item_desc += f", declared value INR {float(item.declared_value):,.2f}"
        except Exception:
            item_desc += f", declared value INR {item.declared_value}"
    if item.attachments:
        item_desc += f", with {len(item.attachments)} damage photo(s) on record"
    vendor = item.vendor
    to_name = _coalesce(item.contact_person_name, item.vendor_name, vendor.name if vendor else None, "CREATVO STUDIOS Inhouse Service")
    to_address = _coalesce(item.delivery_address, _vendor_address(vendor), "CREATVO STUDIOS")
    to_contact_parts = [
        _coalesce(item.contact_person_mobile, vendor.phone if vendor else None),
        item.contact_email,
    ]
    to_contact = " | ".join([str(x) for x in to_contact_parts if x])
    decl_date = item.sent_date.strftime("%d/%m/%Y") if item.sent_date else None
    extra_lines = [
        f"Transport mode: {item.transport_mode or '-'}",
        f"Courier partner: {item.courier_partner or '-'}",
        f"AWB / Docket No.: {item.awb_number or '-'}",
        f"Package notes: {item.package_notes or '-'}",
    ]
    pdf = make_service_declaration_pdf(item_desc, to_name, to_address, to_contact, decl_date, extra_lines=extra_lines)
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="declaration_{item.job_number}.pdf"'})


@router.get("/{job_id}/address-label-pdf", dependencies=[Depends(require_document_permission("service", "download"))])
def service_address_label_pdf(job_id: int, db: Session = Depends(get_db)):
    item = db.query(models.ServiceJob).options(
        joinedload(models.ServiceJob.vendor),
        joinedload(models.ServiceJob.inventory_item),
    ).filter(models.ServiceJob.id == job_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Service job not found.")
    vendor = item.vendor
    vendor_name = _coalesce(item.vendor_name, vendor.name if vendor else None, "CREATVO STUDIOS Inhouse Service")
    contact_name = item.contact_person_name or None
    to_name = vendor_name if not contact_name else f"{vendor_name}\nAttn: {contact_name}"
    to_address = _coalesce(item.delivery_address, _vendor_address(vendor), "CREATVO STUDIOS")
    to_contact_parts = [item.contact_person_mobile, item.alternate_contact_mobile, item.contact_email, vendor.phone if vendor else None]
    to_contact = " | ".join([str(x) for x in to_contact_parts if x])
    to_gstin = vendor.gst_number if vendor else None
    extra_lines = [
        f"Mode: {item.transport_mode or '-'}",
        f"Courier: {item.courier_partner or '-'}",
        f"AWB: {item.awb_number or '-'}",
        f"Packages: {item.package_count or 1}",
    ]
    pdf = make_address_label_pdf(to_name, to_address, to_contact, to_gstin, extra_lines=extra_lines)
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="address_{item.job_number}.pdf"'})
