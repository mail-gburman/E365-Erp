import os
import json
import uuid
from datetime import date
from datetime import datetime
from collections import Counter, defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from ..database import get_db
from ..auth import require_roles, get_current_user
from ..booking_profiles import feature_enabled_for_user
from ..permissions import require_document_permission
from .. import models, schemas
from ..utils import aggregate_equipment_rows, overlaps, make_branded_pdf, make_job_card_pdf, make_road_challan_pdf, make_calendar_day_summary_pdf, make_manpower_details_pdf
from ..codegen import next_booking_code, next_gate_pass_number, next_job_card_id, next_supplementary_job_card_id, next_service_job_number
from ..audit import audit

router = APIRouter(prefix="/bookings", tags=["Bookings"], dependencies=[Depends(require_roles("admin", "operations", "store"))])

ACTIVE_STATUSES = ["confirmed", "dispatched"]
CREATE_BOOKING_STATUSES = {"planned", "confirmed"}

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/tmp/e365_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

def _required_optional_for_items(db: Session, equipment_ids: list[int]):
    required_counts = Counter()
    optional_counts = Counter()
    for inv_id in equipment_ids:
        inv = db.query(models.InventoryItem).filter(models.InventoryItem.id == inv_id).first()
        if not inv or not inv.equipment_master:
            continue
        if inv.equipment_master.mandatory_accessory_codes:
            for code in [x.strip() for x in inv.equipment_master.mandatory_accessory_codes.split(",") if x.strip()]:
                required_counts[code] += 1
        if inv.equipment_master.optional_accessory_codes:
            for code in [x.strip() for x in inv.equipment_master.optional_accessory_codes.split(",") if x.strip()]:
                optional_counts[code] += 1
    return sorted(required_counts.keys()), sorted(optional_counts.keys()), dict(required_counts), dict(optional_counts)


def _window_from_request(db: Session, project_id: int | None = None, block_start: str | None = None, block_end: str | None = None):
    if project_id:
        project = db.query(models.ProjectEvent).filter(models.ProjectEvent.id == project_id).first()
        if project and project.block_start and project.block_end:
            return project.block_start, project.block_end
        return None, None
    if block_start and block_end:
        return datetime.fromisoformat(block_start), datetime.fromisoformat(block_end)
    return None, None


def _inventory_status_for_window(db: Session, item: models.InventoryItem, block_start, block_end):
    if item.status in ["servicing", "inactive", "cancelled"] or item.service_status == "in_service":
        return "unavailable"
    if not block_start or not block_end:
        return "available"
    # Third-party: check vendor rental window
    if item.owner_type == "third_party":
        avail_from = item.vendor_available_from
        avail_until = item.vendor_available_until
        if avail_from or avail_until:
            from datetime import datetime as _dt
            bs_date = block_start.date() if hasattr(block_start, "date") else block_start
            be_date = block_end.date() if hasattr(block_end, "date") else block_end
            if avail_from and bs_date < avail_from:
                return "unavailable"
            if avail_until and be_date > avail_until:
                return "unavailable"
    existing = db.query(models.BookingEquipment).join(models.EventBooking).join(models.ProjectEvent).filter(
        models.BookingEquipment.inventory_item_id == item.id,
        models.EventBooking.status.in_(ACTIVE_STATUSES)
    ).all()
    for row in existing:
        if row.booking and row.booking.project and overlaps(block_start, block_end, row.booking.project.block_start, row.booking.project.block_end):
            return "blocked_for_selected_dates"
    planned = db.query(models.BookingEquipment).join(models.EventBooking).join(models.ProjectEvent).filter(
        models.BookingEquipment.inventory_item_id == item.id,
        models.EventBooking.status == "planned"
    ).all()
    for row in planned:
        if row.booking and row.booking.project and overlaps(block_start, block_end, row.booking.project.block_start, row.booking.project.block_end):
            return "planned_for_selected_dates"
    return "available"


def _crew_status_for_window(db: Session, person: models.CrewMember, block_start, block_end):
    if person.status in ["inactive", "cancelled"]:
        return "unavailable"
    if not block_start or not block_end:
        return "available"
    existing = db.query(models.BookingCrew).join(models.EventBooking).join(models.ProjectEvent).filter(
        models.BookingCrew.crew_member_id == person.id,
        models.EventBooking.status.in_(ACTIVE_STATUSES)
    ).all()
    for row in existing:
        if row.booking and row.booking.project and overlaps(block_start, block_end, row.booking.project.block_start, row.booking.project.block_end):
            return "blocked_for_selected_dates"
    planned = db.query(models.BookingCrew).join(models.EventBooking).join(models.ProjectEvent).filter(
        models.BookingCrew.crew_member_id == person.id,
        models.EventBooking.status == "planned"
    ).all()
    for row in planned:
        if row.booking and row.booking.project and overlaps(block_start, block_end, row.booking.project.block_start, row.booking.project.block_end):
            return "planned_for_selected_dates"
    return "available"


def _booking_equipment_rows(booking: models.EventBooking):
    rows = []
    for link in booking.equipment:
        inv = link.inventory_item
        if not inv:
            continue
        rows.append({
            "asset_code": inv.asset_code,
            "name": inv.name,
            "type": inv.item_type,
            "category": inv.category,
            "owner_type": inv.owner_type,
            "serial_number": inv.serial_number or "",
            "model_no": inv.equipment_master.model_no if inv.equipment_master and inv.equipment_master.model_no else "",
            "quantity": 1,
            "remarks": inv.notes or "",
        })
    return rows


def _normalize_contacts(contacts, fallback_name=None, fallback_mobile=None, fallback_aadhar=None):
    normalized = []
    for row in contacts or []:
        if hasattr(row, "model_dump"):
            row = row.model_dump()
        name = (row.get("name") or "").strip()
        mobile = (row.get("mobile") or "").strip() or None
        aadhar = (row.get("aadhar") or "").strip() or None
        if not name:
            continue
        normalized.append({"name": name, "mobile": mobile, "aadhar": aadhar})
    if not normalized and fallback_name:
        normalized.append({
            "name": fallback_name,
            "mobile": fallback_mobile or None,
            "aadhar": fallback_aadhar or None,
        })
    return normalized


def _booking_contacts(booking: models.EventBooking):
    if booking.booking_contacts_json:
        try:
            parsed = json.loads(booking.booking_contacts_json)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
    return _normalize_contacts([], booking.contact_person_name, booking.contact_person_mobile, booking.contact_person_aadhar)


def _root_job_card_id(booking: models.EventBooking):
    current = booking
    while current and current.parent_booking:
        current = current.parent_booking
    return current.job_card_id if current else booking.job_card_id


def _display_booking_identity(booking: models.EventBooking):
    return booking.job_card_id or booking.booking_code or f"BOOKING-{booking.id}"


def _ensure_booking_identity(db: Session, booking: models.EventBooking):
    if not booking.booking_code:
        booking.booking_code = next_booking_code(db)
        db.flush()
    if booking.parent_booking_id:
        root = booking
        while root.parent_booking_id and root.parent_booking:
            root = root.parent_booking
        if not root.booking_code:
            root.booking_code = next_booking_code(db)
            db.flush()
        if not root.job_card_id:
            root.job_card_id = next_job_card_id(db)
            db.flush()
        if not booking.job_card_id:
            booking.job_card_id = next_supplementary_job_card_id(db, root.job_card_id)
            db.flush()
    elif not booking.job_card_id:
        booking.job_card_id = next_job_card_id(db)
        db.flush()


def _log_custody(db: Session, booking_id, inventory_item_id, crew_member_id, event_type, from_person=None, to_person=None, location=None, notes=None):
    db.add(models.ChainOfCustody(
        booking_id=booking_id,
        inventory_item_id=inventory_item_id,
        crew_member_id=crew_member_id,
        event_type=event_type,
        from_person=from_person,
        to_person=to_person,
        location=location,
        notes=notes,
    ))


DOC_ALLOWED_STATUSES = {"confirmed", "dispatched", "returned", "closed", "completed"}
RETURN_ACCOUNTED_CONDITIONS = {"good", "damaged", "missing", "incomplete"}


def _ensure_document_allowed(booking: models.EventBooking):
    effective_status = (booking.status or "").lower()
    if booking.job_card_id:
        return
    if effective_status not in DOC_ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Documents are available only after booking confirmation.")


def _confirm_booking_resources(db: Session, booking: models.EventBooking, exclude_booking_ids: set[int] | None = None):
    exclude_booking_ids = exclude_booking_ids or {booking.id}
    project = booking.project
    if not project or not project.block_start or not project.block_end:
        raise HTTPException(status_code=400, detail="Set project dates before confirming this booking.")
    _ensure_booking_identity(db, booking)

    for link in booking.equipment:
        item = link.inventory_item
        if not item:
            continue
        if item.status in ["servicing", "inactive", "cancelled"] or item.service_status == "in_service":
                raise HTTPException(status_code=400, detail=f"{item.asset_code} cannot be confirmed because it is under service or inactive.")
        existing = db.query(models.BookingEquipment).join(models.EventBooking).join(models.ProjectEvent).filter(
            models.BookingEquipment.inventory_item_id == item.id,
            ~models.EventBooking.id.in_(exclude_booking_ids),
            models.EventBooking.status.in_(ACTIVE_STATUSES)
        ).all()
        for row in existing:
            if row.booking and row.booking.project and overlaps(project.block_start, project.block_end, row.booking.project.block_start, row.booking.project.block_end):
                raise HTTPException(status_code=400, detail=f"Equipment conflict for {item.asset_code} ({item.name}).")

    for link in booking.crew:
        person = link.crew_member
        if not person:
            continue
        if person.status in ["inactive", "cancelled"]:
            raise HTTPException(status_code=400, detail=f"{person.full_name} cannot be confirmed (status: {person.status}).")
        existing = db.query(models.BookingCrew).join(models.EventBooking).join(models.ProjectEvent).filter(
            models.BookingCrew.crew_member_id == person.id,
            ~models.EventBooking.id.in_(exclude_booking_ids),
            models.EventBooking.status.in_(ACTIVE_STATUSES)
        ).all()
        for row in existing:
            if row.booking and row.booking.project and overlaps(project.block_start, project.block_end, row.booking.project.block_start, row.booking.project.block_end):
                raise HTTPException(status_code=400, detail=f"Crew conflict for {person.full_name} ({person.employee_code}).")

    booking.status = "confirmed"
    for link in booking.equipment:
        if link.inventory_item:
            link.inventory_item.status = "reserved"
            _log_custody(db, booking.id, link.inventory_item_id, None, "assign", from_person="Store", to_person=booking.destination, location=project.venue, notes=f"Confirmed booking for {_display_booking_identity(booking)}")
    for link in booking.crew:
        if link.crew_member:
            link.crew_member.status = "blocked"
            _log_custody(db, booking.id, None, link.crew_member_id, "assign", from_person="Office", to_person=booking.destination, location=project.venue, notes=f"Assigned for confirmed booking {_display_booking_identity(booking)}")

    exists = db.query(models.GatePass).filter(models.GatePass.booking_id == booking.id).first()
    if not exists:
        db.add(models.GatePass(
            gate_pass_number=next_gate_pass_number(db),
            booking_id=booking.id,
            pass_type="gate_out",
            approved_by="System Auto",
            status="issued",
            remarks="Auto-generated at booking confirmation"
        ))


def _partial_return_rows(db: Session, booking_id: int) -> list[models.PartialReturn]:
    return db.query(models.PartialReturn).filter(
        models.PartialReturn.booking_id == booking_id
    ).order_by(models.PartialReturn.id.asc()).all()


def _partial_return_map(db: Session, booking_id: int) -> dict[int, models.PartialReturn]:
    """Backward-compatible latest return lookup by inventory item.

    Do not use this for quantity/parity checks because the same inventory item can
    appear more than once in a booking when the UI groups rows as quantity.
    """
    rows = _partial_return_rows(db, booking_id)
    return {row.inventory_item_id: row for row in rows}


def _booking_completion_check(db: Session, booking: models.EventBooking) -> dict:
    """Return/accounting parity for booking closure.

    Important: the same inventory_item_id can appear multiple times in booking_equipment
    when the user selected the same type/row as an incremental quantity. A single
    partial-return row must account for only one booked occurrence, not every duplicate
    row with the same inventory_item_id. This is why we consume return rows one-by-one.
    """
    booked_links = [row for row in booking.equipment if row.inventory_item]
    returned_by_item: dict[int, list[models.PartialReturn]] = defaultdict(list)
    for ret in _partial_return_rows(db, booking.id):
        if (ret.condition_status or "").lower() in RETURN_ACCOUNTED_CONDITIONS:
            returned_by_item[ret.inventory_item_id].append(ret)

    used_return_count = Counter()
    missing = []
    accounted = []
    missing_summary = Counter()

    for link in booked_links:
        item = link.inventory_item
        returns_for_item = returned_by_item.get(item.id, [])
        used_idx = used_return_count[item.id]
        if used_idx < len(returns_for_item):
            ret = returns_for_item[used_idx]
            used_return_count[item.id] += 1
            accounted.append({
                "id": item.id,
                "booking_equipment_id": link.id,
                "partial_return_id": ret.id,
                "asset_code": item.asset_code,
                "name": item.name,
                "condition_status": ret.condition_status,
            })
        else:
            missing.append({
                "id": item.id,
                "booking_equipment_id": link.id,
                "asset_code": item.asset_code,
                "name": item.name,
            })
            missing_summary[(item.id, item.asset_code or "", item.name or "Item")] += 1

    missing_summary_rows = [
        {"id": item_id, "asset_code": asset_code, "name": name, "quantity": qty}
        for (item_id, asset_code, name), qty in missing_summary.items()
    ]
    pending_count = len(missing)
    return {
        "ok": pending_count == 0,
        "missing_items": missing,
        "missing_summary": missing_summary_rows,
        "pending_count": pending_count,
        "accounted_items": accounted,
        "total_items": len(booked_links),
        "accounted_count": len(accounted),
    }


@router.get("/")
def list_bookings(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(models.EventBooking)
    if current_user.company_id:
        query = query.filter(models.EventBooking.company_id == current_user.company_id)
    return query.order_by(models.EventBooking.id.desc()).all()

@router.get("/resource-search")
def resource_search(
    q: str = Query(""),
    resource_type: str = Query("inventory"),
    item_types: str | None = Query(None),
    project_id: int | None = Query(None),
    block_start: str | None = Query(None),
    block_end: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    q = (q or "").strip().lower()
    req_block_start, req_block_end = _window_from_request(db, project_id, block_start, block_end)
    if resource_type == "crew":
        query = db.query(models.CrewMember).order_by(models.CrewMember.full_name.asc())
        if current_user.company_id:
            query = query.filter(models.CrewMember.company_id == current_user.company_id)
        if q:
            query = query.filter(
                or_(
                    models.CrewMember.employee_code.ilike(f"%{q}%"),
                    models.CrewMember.full_name.ilike(f"%{q}%"),
                    models.CrewMember.role.ilike(f"%{q}%"),
                )
            )
        rows = query.limit(200).all()
        payload = []
        for r in rows:
            status = _crew_status_for_window(db, r, req_block_start, req_block_end)
            display_status = "planned" if status == "planned_for_selected_dates" else status
            payload.append({"id": r.id, "label": f"{r.employee_code} · {r.full_name} · {r.role} · {r.manpower_type} · {display_status}", "status": status, "manpower_type": r.manpower_type})
        return payload

    item_type = None if resource_type == "inventory" else resource_type
    query = db.query(models.InventoryItem).order_by(models.InventoryItem.name.asc())
    if current_user.company_id:
        query = query.filter(models.InventoryItem.company_id == current_user.company_id)
    if item_type:
        query = query.filter(models.InventoryItem.item_type == item_type)
    elif item_types:
        allowed_types = [x.strip() for x in item_types.split(",") if x.strip()]
        if allowed_types:
            query = query.filter(models.InventoryItem.item_type.in_(allowed_types))
    if q:
        query = query.filter(
            or_(
                models.InventoryItem.asset_code.ilike(f"%{q}%"),
                models.InventoryItem.name.ilike(f"%{q}%"),
                models.InventoryItem.category.ilike(f"%{q}%"),
                models.InventoryItem.serial_number.ilike(f"%{q}%"),
            )
        )
    rows = query.limit(200).all()
    payload = []
    for r in rows:
        status = _inventory_status_for_window(db, r, req_block_start, req_block_end)
        display_status = "planned" if status == "planned_for_selected_dates" else status
        payload.append({"id": r.id, "label": f"{r.asset_code} · {r.name}{(' · S/N: ' + r.serial_number) if r.serial_number else ''} · {r.item_type} · {r.owner_type} · {display_status}", "status": status, "item_type": r.item_type, "owner_type": r.owner_type})
    return payload

@router.get("/required-accessories")
def required_accessories(equipment_ids: str = Query(""), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    ids = [int(x) for x in equipment_ids.split(",") if x.strip().isdigit()]
    required_codes, optional_codes, required_counts, optional_counts = _required_optional_for_items(db, ids)
    available_required = []
    available_optional = []
    for code in required_codes:
        matches = db.query(models.InventoryItem).join(models.EquipmentMaster, isouter=True).filter(
            (models.EquipmentMaster.equipment_code == code) | (models.InventoryItem.asset_code == code) | (models.InventoryItem.name.ilike(f"%{code}%"))
        )
        if current_user.company_id:
            matches = matches.filter(models.InventoryItem.company_id == current_user.company_id)
        matches = matches.all()
        available_required.extend([{"id": m.id, "asset_code": m.asset_code, "name": m.name} for m in matches])
    for code in optional_codes:
        matches = db.query(models.InventoryItem).join(models.EquipmentMaster, isouter=True).filter(
            (models.EquipmentMaster.equipment_code == code) | (models.InventoryItem.asset_code == code) | (models.InventoryItem.name.ilike(f"%{code}%"))
        )
        if current_user.company_id:
            matches = matches.filter(models.InventoryItem.company_id == current_user.company_id)
        matches = matches.all()
        available_optional.extend([{"id": m.id, "asset_code": m.asset_code, "name": m.name} for m in matches])
    return {"required_codes": required_codes, "optional_codes": optional_codes, "required_counts": required_counts, "optional_counts": optional_counts, "required_matches": available_required, "optional_matches": available_optional}

@router.get("/details")
def list_booking_details(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.project).joinedload(models.ProjectEvent.dates),
        joinedload(models.EventBooking.equipment).joinedload(models.BookingEquipment.inventory_item),
        joinedload(models.EventBooking.crew).joinedload(models.BookingCrew.crew_member),
    )
    if current_user.company_id:
        query = query.filter(models.EventBooking.company_id == current_user.company_id)
    rows = query.order_by(models.EventBooking.id.desc()).all()
    out = []
    for b in rows:
        equipment_rows = _booking_equipment_rows(b)
        project_dates = []
        if b.project:
            for row in b.project.dates or []:
                project_dates.append({
                    "type": {"start_date": "shoot_date", "end_date": "end_day"}.get(row.date_type, row.date_type),
                    "date": row.date_value.isoformat() if row.date_value else None,
                })
        equipment_items = [
            {
                "booking_equipment_id": x.id,
                "id": x.inventory_item.id,
                "asset_code": x.inventory_item.asset_code,
                "name": x.inventory_item.name,
                "serial_number": x.inventory_item.serial_number,
                "item_type": x.inventory_item.item_type,
                "owner_type": x.inventory_item.owner_type,
            }
            for x in b.equipment if x.inventory_item
        ]
        # Get damage logs for this booking
        damages = db.query(models.DamageLog).filter(models.DamageLog.booking_id == b.id).all()
        partial_returns = db.query(models.PartialReturn).filter(models.PartialReturn.booking_id == b.id).all()
        out.append({
            "id": b.id,
            "booking_code": b.booking_code,
            "job_card_id": b.job_card_id,
            "project_id": b.project_id,
            "parent_booking_id": b.parent_booking_id,
            "project_title": b.project.title if b.project else None,
            "block_start": b.project.block_start.isoformat() if b.project and b.project.block_start else None,
            "block_end": b.project.block_end.isoformat() if b.project and b.project.block_end else None,
            "destination": b.destination,
            "status": b.status,
            "cancellation_reason": b.cancellation_reason,
            "remarks": b.remarks,
            "transport_mode": b.transport_mode,
            "awb_number": b.awb_number,
            "contact_person_name": b.contact_person_name,
            "contact_person_mobile": b.contact_person_mobile,
            "contact_person_aadhar": b.contact_person_aadhar,
            "contacts": _booking_contacts(b),
            "call_time": b.call_time.isoformat() if b.call_time else None,
            "packup_time": b.packup_time.isoformat() if b.packup_time else None,
            "reference_job_card_id": _root_job_card_id(b),
            "job_card_pdf_url": f"/bookings/{b.id}/job-card-pdf",
            "dates": project_dates,
            "equipment": [item for item in equipment_items if item["item_type"] != "accessory"],
            "accessories": [item for item in equipment_items if item["item_type"] == "accessory"],
            "equipment_summary": aggregate_equipment_rows(equipment_rows),
            "crew": [{"id": x.crew_member.id, "employee_code": x.crew_member.employee_code, "name": x.crew_member.full_name, "role": x.crew_member.role, "manpower_type": x.crew_member.manpower_type} for x in b.crew if x.crew_member],
            "damages": [{"id": d.id, "inventory_item_id": d.inventory_item_id, "description": d.damage_description, "severity": d.severity, "photo_path": d.photo_path, "reported_by": d.reported_by, "stage": d.stage, "auto_service_job_id": d.auto_service_job_id} for d in damages],
            "partial_returns": [{"id": r.id, "inventory_item_id": r.inventory_item_id, "returned_by": r.returned_by, "condition_status": r.condition_status, "notes": r.notes, "created_at": r.created_at.isoformat() if r.created_at else None} for r in partial_returns],
            "completion_check": _booking_completion_check(db, b),
        })
    return out


def _calendar_summary_rows_for_date(db: Session, target_day: date):
    projects = db.query(models.ProjectEvent).options(
        joinedload(models.ProjectEvent.dates),
    ).all()
    bookings = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.project),
        joinedload(models.EventBooking.equipment).joinedload(models.BookingEquipment.inventory_item),
        joinedload(models.EventBooking.crew).joinedload(models.BookingCrew.crew_member),
    ).all()

    bookings_by_project = {}
    for booking in bookings:
        bookings_by_project.setdefault(booking.project_id, []).append(booking)

    rows = []
    row_lookup = {}
    for project in projects:
        block_start = project.block_start.date() if project.block_start else None
        block_end = project.block_end.date() if project.block_end else None
        dates_by_type = {}
        for row in project.dates or []:
            alias = {
                "start_date": "shoot_date",
                "end_date": "end_day",
            }.get(row.date_type, row.date_type)
            dates_by_type.setdefault(alias, []).append(row.date_value)
        travel_dates = sorted(dates_by_type.get("travel_day", []))
        setup_dates = sorted(dates_by_type.get("setup_date", []))
        technical_dates = sorted(dates_by_type.get("technical_date", []))
        shoot_dates = sorted(dates_by_type.get("shoot_date", []))
        end_dates = sorted(dates_by_type.get("end_day", []))
        return_dates = sorted(dates_by_type.get("return_day", []))
        setup_date = min(setup_dates + technical_dates, default=project.setup_date)
        shoot_start = project.shoot_start.date() if project.shoot_start else (min(shoot_dates, default=project.expected_start_date or block_start or project.setup_date))
        shoot_end = project.shoot_end.date() if project.shoot_end else (max(end_dates, default=project.expected_end_date or shoot_start or block_end))
        return_day = max(return_dates, default=block_end)
        explicit_event_dates = set()

        if not shoot_start and not block_start and not block_end:
            continue

        project_bookings = bookings_by_project.get(project.id, [])
        primary_booking = next((booking for booking in project_bookings if not booking.parent_booking_id), project_bookings[0] if project_bookings else None)

        def add_row(event_type, booking=None, label_override=None):
            booking = booking or primary_booking
            key = (project.id, booking.id if booking else None, event_type, label_override or event_type)
            merged_key = (project.id, booking.id if booking else None)
            is_supplementary = bool(booking and booking.parent_booking_id)
            parent_ref = _root_job_card_id(booking) if is_supplementary else None
            equipment = aggregate_equipment_rows(_booking_equipment_rows(booking)) if booking else []
            crew = [{"name": x.crew_member.full_name} for x in booking.crew if x.crew_member] if booking else []
            if merged_key not in row_lookup:
                row_lookup[merged_key] = {
                    "event_types": [],
                    "event_labels": [],
                    "event_type": event_type,
                    "event_label": label_override or event_type,
                    "project_title": project.title,
                    "booking_code": booking.booking_code if booking else "-",
                    "job_card_id": booking.job_card_id if booking else "-",
                    "project_status": project.status or "-",
                    "booking_status": f"Supplementary to {parent_ref}" if is_supplementary else (booking.status if booking else project.status or "-"),
                    "destination": booking.destination if booking else project.venue,
                    "transport_mode": booking.transport_mode if booking else "-",
                    "awb_number": booking.awb_number if booking else "-",
                    "setup_date": project.setup_date.isoformat() if project.setup_date else "-",
                    "shoot_window": " to ".join([x for x in [
                        project.shoot_start.strftime("%d/%m/%Y %H:%M") if project.shoot_start else None,
                        project.shoot_end.strftime("%d/%m/%Y %H:%M") if project.shoot_end else None,
                    ] if x]) or "-",
                    "block_window": " to ".join([x for x in [
                        project.block_start.strftime("%d/%m/%Y %H:%M") if project.block_start else None,
                        project.block_end.strftime("%d/%m/%Y %H:%M") if project.block_end else None,
                    ] if x]) or "-",
                    "equipment": ", ".join([f"{item['name']} x{item['quantity']}" for item in equipment]) or "-",
                    "crew": ", ".join([member["name"] for member in crew]) or "-",
                    "remarks": (booking.remarks if booking and booking.remarks else project.notes) or "-",
                }
                rows.append(row_lookup[merged_key])
            row = row_lookup[merged_key]
            if event_type not in row["event_types"]:
                row["event_types"].append(event_type)
            label_text = label_override or event_type
            if label_text not in row["event_labels"]:
                row["event_labels"].append(label_text)
            row["event_type"] = row["event_types"][0]
            row["event_label"] = ", ".join(row["event_labels"])

        if target_day in travel_dates:
            explicit_event_dates.add(target_day)
            add_row("travel", primary_booking, "Travel Day")
        if target_day in setup_dates or (not setup_dates and setup_date == target_day):
            explicit_event_dates.add(target_day)
            add_row("setup", primary_booking, "Setup Day")
        if target_day in technical_dates:
            explicit_event_dates.add(target_day)
            add_row("technical", primary_booking, "Technical Day")
        if target_day in shoot_dates or (not shoot_dates and shoot_start == target_day):
            explicit_event_dates.add(target_day)
            add_row("event", primary_booking, "Event Day")
        if target_day in end_dates or (not end_dates and shoot_end == target_day):
            explicit_event_dates.add(target_day)
            add_row("end", primary_booking, "End Day")
        if target_day in return_dates or (not return_dates and return_day == target_day):
            explicit_event_dates.add(target_day)
            add_row("return", primary_booking, "Return Day")

        for project_date in project.dates or []:
            normalized_type = {"start_date": "shoot_date", "end_date": "end_day"}.get(project_date.date_type, project_date.date_type)
            if normalized_type == "off_day" and project_date.date_value == target_day:
                explicit_event_dates.add(target_day)
                add_row("off", primary_booking, "Off Day")

        overlay_start = block_start or shoot_start
        overlay_end = block_end or shoot_end or shoot_start
        if overlay_start and overlay_end:
            for booking in project_bookings:
                if booking.parent_booking_id and target_day in explicit_event_dates:
                    add_row("supplementary", booking, f"Supplementary to {_root_job_card_id(booking)}")
                    continue
                if booking.status in ["planned", "confirmed", "blocked", "dispatched"] and overlay_start <= target_day <= overlay_end:
                    if target_day not in explicit_event_dates:
                        add_row(booking.status, booking, booking.status.title())

    type_order = {"travel": 0, "setup": 1, "technical": 2, "event": 3, "end": 4, "return": 5, "off": 6, "supplementary": 7, "planned": 8, "confirmed": 9, "blocked": 10, "dispatched": 11}
    rows.sort(key=lambda row: (
        type_order.get(row["event_type"], 99),
        row["project_title"],
        row.get("job_card_id") or row.get("booking_code") or "",
    ))
    return rows


@router.get("/calendar-day-summary-pdf")
def calendar_day_summary_pdf(target_date: str = Query(...), db: Session = Depends(get_db)):
    try:
        parsed_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date. Use YYYY-MM-DD.")
    pdf = make_calendar_day_summary_pdf(
        parsed_date.strftime("%d/%m/%Y"),
        _calendar_summary_rows_for_date(db, parsed_date),
    )
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="E365_calendar_day_summary_{parsed_date.isoformat()}.pdf"'},
    )

@router.get("/qc", response_model=list[schemas.ReturnQCRead])
def list_qc(db: Session = Depends(get_db)):
    return db.query(models.ReturnQC).order_by(models.ReturnQC.id.desc()).all()

@router.get("/gate-passes", response_model=list[schemas.GatePassRead])
def list_gate_passes(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(models.GatePass).join(models.EventBooking)
    if current_user.company_id:
        query = query.filter(models.EventBooking.company_id == current_user.company_id)
    return query.order_by(models.GatePass.id.desc()).all()

@router.get("/gate-passes/details")
def list_gate_pass_details(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    query = db.query(models.GatePass).join(models.EventBooking)
    if current_user.company_id:
        query = query.filter(models.EventBooking.company_id == current_user.company_id)
    rows = query.order_by(models.GatePass.id.desc()).all()
    out = []
    for g in rows:
        booking = g.booking
        equipment = []
        manpower = []
        project_title = None
        destination = None
        if booking:
            project_title = booking.project.title if booking.project else None
            destination = booking.destination
            equipment = [{"id": x.inventory_item.id, "asset_code": x.inventory_item.asset_code, "name": x.inventory_item.name} for x in booking.equipment if x.inventory_item]
            manpower = [{"id": x.crew_member.id, "name": x.crew_member.full_name, "role": x.crew_member.role} for x in booking.crew if x.crew_member]
        out.append({"id": g.id,"gate_pass_number": g.gate_pass_number,"booking_id": g.booking_id,"pass_type": g.pass_type,"approved_by": g.approved_by,"status": g.status,"remarks": g.remarks,"project_title": project_title,"destination": destination,"equipment": equipment,"equipment_summary": aggregate_equipment_rows([{"asset_code": x["asset_code"], "name": x["name"], "quantity": 1} for x in equipment]),"manpower": manpower})
    return out

@router.get("/gate-passes/{gate_pass_id}/pdf", dependencies=[Depends(require_document_permission("gate_pass", "download"))])
def gate_pass_pdf(gate_pass_id: int, db: Session = Depends(get_db)):
    gp = db.query(models.GatePass).filter(models.GatePass.id == gate_pass_id).first()
    if not gp:
        raise HTTPException(status_code=404, detail="Gate pass not found.")
    booking = gp.booking
    if booking:
        _ensure_document_allowed(booking)
    project_title = booking.project.title if booking and booking.project else "-"
    destination = booking.destination if booking else "-"
    equipment = aggregate_equipment_rows(_booking_equipment_rows(booking)) if booking else []
    manpower = [{"name": x.crew_member.full_name} for x in booking.crew if booking and x.crew_member]
    pdf = make_job_card_pdf(
        "JOB CARD & CHALLAN FOR VIDEO EQUIPMENT",
        "CREATVO STUDIOS",
        [
            ("M/s", project_title),
            ("Programme", project_title),
            ("Date", booking.project.shoot_start.strftime("%d/%m/%Y") if booking and booking.project and booking.project.shoot_start else "-"),
            ("Location", destination),
            ("Gate Pass No", gp.gate_pass_number),
            ("Pickup", booking.project.shoot_start.strftime("%d/%m/%Y %H:%M") if booking and booking.project and booking.project.shoot_start else "-"),
        ],
        equipment,
        manpower,
        ["Client to keep custody of equipment and return in same working condition as received."]
    )
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="gatepass_{gp.gate_pass_number}.pdf"'})

@router.get("/{booking_id}/job-card-pdf", dependencies=[Depends(require_document_permission("job_card", "download"))])
def booking_job_card_pdf(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.project),
        joinedload(models.EventBooking.equipment).joinedload(models.BookingEquipment.inventory_item),
        joinedload(models.EventBooking.crew).joinedload(models.BookingCrew.crew_member),
    ).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    _ensure_document_allowed(booking)
    items = aggregate_equipment_rows([r for r in _booking_equipment_rows(booking) if r.get("owner_type") != "third_party"])
    # Job Card — Only Manpower name in boxes
    manpower = [{"name": x.crew_member.full_name} for x in booking.crew if x.crew_member]
    project = booking.project
    meta = [
        ("Job Card ID", booking.job_card_id),
        ("Reference ID", _root_job_card_id(booking)),
        ("M/s", project.client.name if project and project.client else (project.title if project else "-")),
        ("Programme", project.title if project else "-"),
        ("Date", project.shoot_start.strftime("%d/%m/%Y") if project and project.shoot_start else "-"),
        ("Location", booking.destination or "-"),
        ("Call Date/Time", booking.call_time.strftime("%d/%m/%Y %H:%M") if booking.call_time else "-"),
        ("Packup Date/Time", booking.packup_time.strftime("%d/%m/%Y %H:%M") if booking.packup_time else "-"),
    ]
    if booking.transport_mode:
        meta.append(("Transport Mode", booking.transport_mode))
    if booking.awb_number:
        meta.append(("AWB / Tracking", booking.awb_number))
    if booking.contact_person_name:
        meta.append(("Contact Person", booking.contact_person_name))
    if booking.contact_person_mobile:
        meta.append(("Contact Mobile", booking.contact_person_mobile))
    extra_contacts = _booking_contacts(booking)[1:]
    if extra_contacts:
        meta.append(("Additional Contacts", ", ".join([c["name"] for c in extra_contacts])))

    # Off dates: from project.dates where date_type == 'off_day'
    off_dates = []
    try:
        if project and project.dates:
            off_dates = [d.date_value.strftime("%d/%m/%Y") for d in project.dates if d.date_type == "off_day"]
    except Exception:
        off_dates = []

    # Supplementary detection: parent_booking_id set => this is a supplementary job card
    supplementary_of = None
    change_summary = None
    if booking.parent_booking_id:
        parent = db.query(models.EventBooking).filter(models.EventBooking.id == booking.parent_booking_id).first()
        if parent:
            supplementary_of = parent.job_card_id
            change_summary = booking.remarks or "Supplementary issued for date/scope changes."

    pdf = make_job_card_pdf(
        "JOB CARD & CHALLAN FOR VIDEO EQUIPMENT",
        "CREATVO STUDIOS",
        meta,
        items,
        manpower,
        [
            "Client undertakes safe custody of equipment and same-condition return.",
            "Any damage / loss due to mishandling may be chargeable as per company policy.",
        ],
        supplementary_of=supplementary_of,
        off_dates=off_dates,
        change_summary=change_summary,
    )
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="jobcard_{booking.job_card_id}.pdf"'})


@router.get("/{booking_id}/road-challan-pdf", dependencies=[Depends(require_document_permission("challan", "download"))])
def booking_road_challan_pdf(booking_id: int, db: Session = Depends(get_db)):
    """Generate Road Challan PDF for a booking."""
    booking = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.project).joinedload(models.ProjectEvent.client),
        joinedload(models.EventBooking.equipment).joinedload(models.BookingEquipment.inventory_item).joinedload(models.InventoryItem.equipment_master),
    ).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    _ensure_document_allowed(booking)
    project = booking.project
    client_name = project.client.name if project and project.client else (project.title if project else "-")
    challan_date = project.shoot_start.strftime("%d/%m/%Y") if project and project.shoot_start else date.today().strftime("%d/%m/%Y")
    items = aggregate_equipment_rows([r for r in _booking_equipment_rows(booking) if r.get("owner_type") != "third_party"])
    pdf = make_road_challan_pdf(
        challan_no=booking.job_card_id or f"RC-{booking.id}",
        challan_date=challan_date,
        client_name=client_name,
        delivery_address=booking.destination or "",
        vehicle_no="",
        time_out=booking.packup_time.strftime("%H:%M") if booking.packup_time else "",
        contact_person=booking.contact_person_name or "",
        deliver_through=booking.contact_person_name or "",
        items=items,
        reference_no=_root_job_card_id(booking),
    )
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="challan_{booking.job_card_id}.pdf"'})


@router.get("/{booking_id}/manpower-pdf", dependencies=[Depends(require_document_permission("manpower_pdf", "download"))])
def booking_manpower_pdf(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.project),
        joinedload(models.EventBooking.crew).joinedload(models.BookingCrew.crew_member).joinedload(models.CrewMember.vendor),
    ).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    _ensure_document_allowed(booking)
    crew_ids = [row.crew_member_id for row in booking.crew if row.crew_member_id]
    docs_by_crew = {crew_id: [] for crew_id in crew_ids}
    if crew_ids:
        docs = db.query(models.StatutoryDocument).filter(
            models.StatutoryDocument.entity_type == "crew",
            models.StatutoryDocument.entity_id.in_(crew_ids),
        ).order_by(models.StatutoryDocument.created_at.asc()).all()
        for doc in docs:
            docs_by_crew.setdefault(doc.entity_id, []).append(doc.document_name)
    crew_rows = []
    for row in booking.crew:
        member = row.crew_member
        if not member:
            continue
        crew_rows.append({
            "employee_code": member.employee_code,
            "full_name": member.full_name,
            "role": member.role,
            "manpower_type": member.manpower_type,
            "vendor_name": member.vendor.name if member.vendor else "-",
            "home_station": member.home_station,
            "phone": member.phone,
            "address": member.address,
            "aadhar_number": member.aadhar_number,
            "id_proof_type": member.id_proof_type,
            "id_proof_number": member.id_proof_number,
            "documents": docs_by_crew.get(member.id, []),
        })
    pdf = make_manpower_details_pdf(
        job_card_id=booking.job_card_id,
        project_title=booking.project.title if booking.project else "-",
        destination=booking.destination,
        crew_rows=crew_rows,
    )
    safe_job_card = (booking.job_card_id or str(booking.id)).replace("/", "-")
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="manpower_{safe_job_card}.pdf"'})


@router.post("/", response_model=schemas.BookingRead)
def create_booking(payload: schemas.BookingCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project = db.query(models.ProjectEvent).filter(models.ProjectEvent.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found.")
    if project.status == "cancelled":
        raise HTTPException(status_code=400, detail="Cannot create a booking for a cancelled project.")
    if not payload.destination.strip():
        raise HTTPException(status_code=400, detail="Destination is required.")
    booking_status = payload.status if payload.status in CREATE_BOOKING_STATUSES else "planned"
    parent = None
    if payload.parent_booking_id:
        parent = db.query(models.EventBooking).filter(models.EventBooking.id == payload.parent_booking_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent booking not found.")
        booking_status = parent.status or "planned"
    family_exclude_ids = {payload.parent_booking_id} if payload.parent_booking_id else set()
    if parent:
        root_parent_id = parent.parent_booking_id or parent.id
        family_exclude_ids.update(row.id for row in db.query(models.EventBooking.id).filter(
            (models.EventBooking.id == root_parent_id) | (models.EventBooking.parent_booking_id == root_parent_id)
        ).all())
    locks_resources = booking_status == "confirmed"

    equipment_only = list(dict.fromkeys(payload.equipment_ids))
    accessory_only = list(dict.fromkeys(payload.accessory_ids))
    crew_ids = list(dict.fromkeys(payload.crew_ids))

    # Expand kits/bundles: auto-add all child items (parent_item_id = kit.id)
    expanded_equipment = list(equipment_only)
    for eq_id in equipment_only:
        parent = db.query(models.InventoryItem).filter(models.InventoryItem.id == eq_id).first()
        if parent and parent.item_type in ("kit", "bundle"):
            children = db.query(models.InventoryItem).filter(
                models.InventoryItem.parent_item_id == parent.id,
                models.InventoryItem.status.notin_(["inactive", "cancelled", "servicing"])
            ).all()
            for child in children:
                if child.id not in expanded_equipment:
                    if child.item_type == "accessory":
                        if child.id not in accessory_only:
                            accessory_only.append(child.id)
                    else:
                        expanded_equipment.append(child.id)
    equipment_only = list(dict.fromkeys(expanded_equipment))
    merged_ids = list(dict.fromkeys(equipment_only + accessory_only))

    if accessory_only and not equipment_only:
        raise HTTPException(status_code=400, detail="Accessory-only booking is not allowed. Select at least one main device/kit/bundle/third-party equipment.")

    if not project.block_start or not project.block_end:
        raise HTTPException(status_code=400, detail="Set project dates first before checking resource availability.")

    required_codes, optional_codes, required_counts, optional_counts = _required_optional_for_items(db, equipment_only)
    selected_accessory_master_codes = Counter()
    for aid in accessory_only:
        a = db.query(models.InventoryItem).filter(models.InventoryItem.id == aid).first()
        if a and a.equipment_master:
            selected_accessory_master_codes[a.equipment_master.equipment_code] += 1
    missing = [f"{code} x{required_counts[code]}" for code in required_codes if selected_accessory_master_codes.get(code, 0) < required_counts[code]]
    if missing:
        raise HTTPException(status_code=400, detail=f"Mandatory accessories are missing for selected equipment: {', '.join(missing)}")

    for inv_id in merged_ids:
        item = db.query(models.InventoryItem).filter(models.InventoryItem.id == inv_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Inventory item {inv_id} not found.")
        if item.status in ["servicing", "inactive", "cancelled"] or item.service_status == "in_service":
            raise HTTPException(status_code=400, detail=f"{item.asset_code} cannot be booked because it is under service or inactive.")
        # Third-party: enforce vendor rental window
        if item.owner_type == "third_party" and (item.vendor_available_from or item.vendor_available_until):
            bs = project.block_start.date() if project.block_start else None
            be = project.block_end.date() if project.block_end else None
            if bs and item.vendor_available_from and bs < item.vendor_available_from:
                raise HTTPException(status_code=400, detail=f"{item.name} is a third-party item only available from {item.vendor_available_from}. Your booking starts {bs}.")
            if be and item.vendor_available_until and be > item.vendor_available_until:
                raise HTTPException(status_code=400, detail=f"{item.name} is a third-party item only available until {item.vendor_available_until}. Your booking ends {be}.")
        if locks_resources:
            existing = db.query(models.BookingEquipment).join(models.EventBooking).join(models.ProjectEvent).filter(
                models.BookingEquipment.inventory_item_id == inv_id,
                models.EventBooking.status.in_(ACTIVE_STATUSES),
                ~models.EventBooking.id.in_(family_exclude_ids or {-1})
            ).all()
            for e in existing:
                if e.booking and e.booking.project and overlaps(project.block_start, project.block_end, e.booking.project.block_start, e.booking.project.block_end):
                    raise HTTPException(status_code=400, detail=f"Equipment conflict for {item.asset_code} ({item.name}).")

    for crew_id in crew_ids:
        person = db.query(models.CrewMember).filter(models.CrewMember.id == crew_id).first()
        if not person:
            raise HTTPException(status_code=404, detail=f"Crew member {crew_id} not found.")
        if person.status in ["inactive", "cancelled"]:
            raise HTTPException(status_code=400, detail=f"{person.full_name} cannot be assigned (status: {person.status}).")
        if locks_resources:
            existing = db.query(models.BookingCrew).join(models.EventBooking).join(models.ProjectEvent).filter(
                models.BookingCrew.crew_member_id == crew_id,
                models.EventBooking.status.in_(ACTIVE_STATUSES),
                ~models.EventBooking.id.in_(family_exclude_ids or {-1})
            ).all()
            for e in existing:
                if e.booking and e.booking.project and overlaps(project.block_start, project.block_end, e.booking.project.block_start, e.booking.project.block_end):
                    raise HTTPException(status_code=400, detail=f"Crew conflict for {person.full_name} ({person.employee_code}).")

    contacts = _normalize_contacts(payload.contacts, payload.contact_person_name, payload.contact_person_mobile, payload.contact_person_aadhar)
    primary_contact = contacts[0] if contacts else {"name": payload.contact_person_name, "mobile": payload.contact_person_mobile, "aadhar": payload.contact_person_aadhar}

    try:
        booking = models.EventBooking(
            booking_code=next_booking_code(db),
            job_card_id=None,
            project_id=payload.project_id,
            parent_booking_id=payload.parent_booking_id,
            destination=payload.destination,
            status=booking_status,
            remarks=payload.remarks or "",
            transport_mode=payload.transport_mode,
            awb_number=payload.awb_number,
            contact_person_name=primary_contact.get("name"),
            contact_person_mobile=primary_contact.get("mobile"),
            contact_person_aadhar=primary_contact.get("aadhar"),
            booking_contacts_json=json.dumps(contacts, default=str) if contacts else None,
            call_time=payload.call_time,
            packup_time=payload.packup_time,
        )
        db.add(booking)
        db.flush()
        if booking_status in {"confirmed", "dispatched"}:
            _ensure_booking_identity(db, booking)

        for inv_id in merged_ids:
            db.add(models.BookingEquipment(booking_id=booking.id, inventory_item_id=inv_id))
            item = db.query(models.InventoryItem).filter(models.InventoryItem.id == inv_id).first()
            if locks_resources:
                item.status = "reserved"
                _log_custody(db, booking.id, inv_id, None, "assign", from_person="Store", to_person=booking.destination, location=project.venue, notes=f"Confirmed booking for {_display_booking_identity(booking)}")

        for crew_id in crew_ids:
            db.add(models.BookingCrew(booking_id=booking.id, crew_member_id=crew_id))
            person = db.query(models.CrewMember).filter(models.CrewMember.id == crew_id).first()
            if locks_resources:
                person.status = "blocked"
                _log_custody(db, booking.id, None, crew_id, "assign", from_person="Office", to_person=booking.destination, location=project.venue, notes=f"Assigned for confirmed booking {_display_booking_identity(booking)}")

        if locks_resources:
            db.add(models.GatePass(
                gate_pass_number=next_gate_pass_number(db),
                booking_id=booking.id,
                pass_type="gate_out",
                approved_by="System Auto",
                status="issued",
                remarks="Auto-generated at confirmed booking creation"
            ))

        audit(db, current_user.username, "create", "booking", entity_id=booking.id, details={"booking_code": booking.booking_code, "job_card_id": booking.job_card_id, "destination": booking.destination, "reference_job_card_id": _root_job_card_id(booking), "contacts": contacts})
        db.commit()
        db.refresh(booking)
        return booking
    except Exception:
        db.rollback()
        raise

@router.put("/{booking_id}", response_model=schemas.BookingRead)
def update_booking(booking_id: int, payload: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Modify a booking anytime — update destination, transport, remarks, contacts."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can edit bookings after creation.")
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status == "dispatched":
        locked_fields = {"destination", "transport_mode", "awb_number", "contact_person_name", "contact_person_mobile", "contact_person_aadhar", "call_time", "packup_time", "contacts"}
        if any(field in payload for field in locked_fields):
            raise HTTPException(status_code=400, detail="Operational booking fields are locked after dispatch. Return or re-issue the booking before editing them.")
    updatable = ["destination", "remarks", "transport_mode", "awb_number",
                 "contact_person_name", "contact_person_mobile", "contact_person_aadhar",
                 "call_time", "packup_time"]
    for key in updatable:
        if key in payload:
            setattr(booking, key, payload[key])
    if "contacts" in payload:
        contacts = _normalize_contacts(payload.get("contacts"), payload.get("contact_person_name", booking.contact_person_name), payload.get("contact_person_mobile", booking.contact_person_mobile), payload.get("contact_person_aadhar", booking.contact_person_aadhar))
        primary_contact = contacts[0] if contacts else None
        booking.booking_contacts_json = json.dumps(contacts, default=str) if contacts else None
        booking.contact_person_name = primary_contact.get("name") if primary_contact else booking.contact_person_name
        booking.contact_person_mobile = primary_contact.get("mobile") if primary_contact else booking.contact_person_mobile
        booking.contact_person_aadhar = primary_contact.get("aadhar") if primary_contact else booking.contact_person_aadhar
    audit(db, current_user.username, "update", "booking", entity_id=booking.id, details=payload)
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/confirm", response_model=schemas.BookingRead)
def confirm_booking(booking_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can confirm planned bookings.")
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status not in ["planned", "blocked"]:
        raise HTTPException(status_code=400, detail=f"Cannot confirm a booking with status '{booking.status}'.")
    family_ids = {booking.id, *[
        row.id for row in db.query(models.EventBooking.id).filter(models.EventBooking.parent_booking_id == booking.id).all()
    ]}
    _confirm_booking_resources(db, booking, family_ids)
    for child in db.query(models.EventBooking).filter(models.EventBooking.parent_booking_id == booking.id).all():
        if child.status in ["planned", "blocked"]:
            _confirm_booking_resources(db, child, family_ids)
    audit(db, current_user.username, "confirm", "booking", entity_id=booking.id, details={"booking_code": booking.booking_code, "job_card_id": booking.job_card_id})
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/{booking_id}/dispatch", response_model=schemas.BookingRead)
def dispatch_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status != "confirmed":
        raise HTTPException(status_code=400, detail=f"Cannot dispatch a booking with status '{booking.status}'. Only confirmed bookings can be dispatched.")
    booking.status = "dispatched"
    for item in booking.equipment:
        if item.inventory_item:
            item.inventory_item.status = "on_shoot"
            _log_custody(db, booking.id, item.inventory_item_id, None, "gate_out", from_person="Store", to_person=booking.destination)
    for crew in booking.crew:
        if crew.crew_member:
            crew.crew_member.status = "on_shoot"
            _log_custody(db, booking.id, None, crew.crew_member_id, "gate_out", from_person="Office", to_person=booking.destination)
    # Cascade status to supplementary bookings
    for child in db.query(models.EventBooking).filter(models.EventBooking.parent_booking_id == booking_id).all():
        if child.status == "confirmed":
            child.status = "dispatched"
    db.commit()
    db.refresh(booking)
    return booking

@router.post("/{booking_id}/return", response_model=schemas.BookingRead)
def mark_returned(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status != "dispatched":
        raise HTTPException(status_code=400, detail=f"Cannot return a booking with status '{booking.status}'. Booking must be dispatched first.")
    check = _booking_completion_check(db, booking)
    if not check["ok"]:
        raise HTTPException(status_code=400, detail={"message": "Cannot close booking. Some items are not returned/accounted for.", **check})
    qc = db.query(models.ReturnQC).filter(models.ReturnQC.booking_id == booking_id).first()
    if not qc:
        raise HTTPException(status_code=400, detail="Return QC is required before marking a booking returned.")
    booking.status = "returned"
    returns_by_item: dict[int, list[models.PartialReturn]] = defaultdict(list)
    for ret in _partial_return_rows(db, booking.id):
        returns_by_item[ret.inventory_item_id].append(ret)
    used_return_count = Counter()
    for item in booking.equipment:
        inv = item.inventory_item
        if not inv:
            continue
        ret_rows = returns_by_item.get(inv.id, [])
        used_idx = used_return_count[inv.id]
        ret = ret_rows[used_idx] if used_idx < len(ret_rows) else None
        used_return_count[inv.id] += 1
        condition = ((ret.condition_status if ret else "good") or "good").lower()
        if condition == "good" and inv.service_status != "in_service" and inv.status not in {"missing", "damaged"}:
            inv.status = "available"
        elif condition == "missing":
            inv.status = "missing"
        elif condition in {"damaged", "incomplete"} and inv.service_status != "in_service" and inv.status != "missing":
            inv.status = "damaged"
        _log_custody(db, booking.id, item.inventory_item_id, None, "gate_in", from_person=booking.destination, to_person="Store", notes=f"Closure condition: {condition}")
    for crew in booking.crew:
        if crew.crew_member:
            crew.crew_member.status = "available"
            _log_custody(db, booking.id, None, crew.crew_member_id, "gate_in", from_person=booking.destination, to_person="Office", notes="Returned after event")
    db.add(models.GatePass(
        gate_pass_number=next_gate_pass_number(db),
        booking_id=booking.id,
        pass_type="gate_in",
        approved_by=qc.checked_by,
        status="issued",
        remarks="Auto-generated on return closure"
    ))
    # Cascade status to supplementary bookings
    for child in db.query(models.EventBooking).filter(models.EventBooking.parent_booking_id == booking_id).all():
        if child.status in ("confirmed", "dispatched"):
            child.status = "returned"
    db.commit()
    db.refresh(booking)
    return booking

@router.post("/{booking_id}/cancel", response_model=schemas.BookingRead)
def cancel_booking(booking_id: int, payload: dict = {}, db: Session = Depends(get_db)):
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status in ["returned", "cancelled"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel a booking with status '{booking.status}'.")
    reason = payload.get("cancellation_reason", "").strip() if isinstance(payload, dict) else ""
    if not reason:
        raise HTTPException(status_code=400, detail="Cancellation reason is required.")
    booking.status = "cancelled"
    booking.cancellation_reason = reason
    for item in booking.equipment:
        if item.inventory_item and item.inventory_item.service_status != "in_service":
            item.inventory_item.status = "available"
            _log_custody(db, booking.id, item.inventory_item_id, None, "cancel", notes=f"Booking cancelled: {reason}")
    for crew in booking.crew:
        if crew.crew_member:
            crew.crew_member.status = "available"
            _log_custody(db, booking.id, None, crew.crew_member_id, "cancel", notes=f"Booking cancelled: {reason}")
    db.commit()
    db.refresh(booking)
    return booking

@router.get("/partial-returns", response_model=list[schemas.PartialReturnRead])
def list_partial_returns(db: Session = Depends(get_db)):
    return db.query(models.PartialReturn).order_by(models.PartialReturn.id.desc()).all()

@router.get("/custody")
def list_custody(db: Session = Depends(get_db)):
    rows = db.query(models.ChainOfCustody).order_by(models.ChainOfCustody.id.desc()).all()
    return [{
        "id": r.id,
        "booking_id": r.booking_id,
        "inventory_item_id": r.inventory_item_id,
        "crew_member_id": r.crew_member_id,
        "event_type": r.event_type,
        "from_person": r.from_person,
        "to_person": r.to_person,
        "location": r.location,
        "notes": r.notes,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]

@router.post("/partial-return")
def create_partial_return(payload: schemas.PartialReturnCreate, db: Session = Depends(get_db)):
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status != "dispatched":
        raise HTTPException(status_code=400, detail=f"Partial return is allowed only after dispatch. Current status: '{booking.status}'.")
    if payload.condition_status not in RETURN_ACCOUNTED_CONDITIONS:
        raise HTTPException(status_code=400, detail="Condition must be one of: good, damaged, missing, incomplete.")
    if not payload.inventory_item_ids:
        raise HTTPException(status_code=400, detail="Select at least one item to return/account for.")

    booked_counts = Counter(x.inventory_item_id for x in booking.equipment if x.inventory_item_id)
    existing_counts = Counter(
        row.inventory_item_id
        for row in _partial_return_rows(db, booking.id)
        if (row.condition_status or "").lower() in RETURN_ACCOUNTED_CONDITIONS
    )
    incoming_counts = Counter(payload.inventory_item_ids)

    for inv_id, incoming_qty in incoming_counts.items():
        booked_qty = booked_counts.get(inv_id, 0)
        if booked_qty <= 0:
            raise HTTPException(status_code=400, detail=f"Inventory item {inv_id} is not part of this booking.")
        pending_qty = booked_qty - existing_counts.get(inv_id, 0)
        if incoming_qty > pending_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Inventory item {inv_id} has only {pending_qty} pending quantity to return/account for.",
            )

    touched_ids = set()
    for inv_id in payload.inventory_item_ids:
        touched_ids.add(inv_id)
        db.add(models.PartialReturn(
            booking_id=payload.booking_id,
            inventory_item_id=inv_id,
            returned_by=payload.returned_by,
            condition_status=payload.condition_status,
            notes=payload.notes,
        ))
        _log_custody(db, payload.booking_id, inv_id, None, "partial_return", from_person=booking.destination, to_person="Store", notes=f"Partial return by {payload.returned_by}, condition: {payload.condition_status}. {payload.notes or ''}".strip())

    db.flush()

    # Only release/update the physical item status after all booked occurrences for
    # that inventory item have been accounted for. This prevents duplicate quantity
    # rows from making the asset available too early.
    for inv_id in touched_ids:
        item = db.query(models.InventoryItem).filter(models.InventoryItem.id == inv_id).first()
        if not item:
            continue
        returns_for_item = db.query(models.PartialReturn).filter(
            models.PartialReturn.booking_id == payload.booking_id,
            models.PartialReturn.inventory_item_id == inv_id,
        ).all()
        if len(returns_for_item) < booked_counts.get(inv_id, 0):
            continue
        conditions = {(row.condition_status or "good").lower() for row in returns_for_item}
        if "missing" in conditions:
            item.status = "missing"
        elif conditions.intersection({"damaged", "incomplete"}) and item.service_status != "in_service":
            item.status = "damaged"
        elif item.service_status != "in_service":
            item.status = "available"

    db.commit()
    return {"ok": True, **_booking_completion_check(db, booking)}


@router.post("/{booking_id}/complete")
def complete_booking(booking_id: int, payload: dict = {}, db: Session = Depends(get_db)):
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status != "dispatched":
        raise HTTPException(status_code=400, detail=f"Complete Booking is allowed only after dispatch. Current status: '{booking.status}'.")
    check = _booking_completion_check(db, booking)
    if not check["ok"]:
        raise HTTPException(status_code=400, detail={"message": "Cannot complete booking. Return/account for every booked item first.", **check})
    qc = db.query(models.ReturnQC).filter(models.ReturnQC.booking_id == booking.id).first()
    if not qc:
        db.add(models.ReturnQC(
            booking_id=booking.id,
            checked_by=(payload.get("checked_by") if isinstance(payload, dict) else None) or "Accounts / Store Closure",
            all_items_returned=True,
            damage_found=any(item.get("condition_status") in {"damaged", "missing", "incomplete"} for item in check["accounted_items"]),
            cleaning_required=False,
            remarks=(payload.get("remarks") if isinstance(payload, dict) else None) or "Auto QC created by Complete Booking parity check.",
        ))
        db.flush()
    booking.status = "returned"
    returns_by_item: dict[int, list[models.PartialReturn]] = defaultdict(list)
    for ret in _partial_return_rows(db, booking.id):
        returns_by_item[ret.inventory_item_id].append(ret)
    used_return_count = Counter()
    for link in booking.equipment:
        inv = link.inventory_item
        if not inv:
            continue
        ret_rows = returns_by_item.get(inv.id, [])
        used_idx = used_return_count[inv.id]
        ret = ret_rows[used_idx] if used_idx < len(ret_rows) else None
        used_return_count[inv.id] += 1
        condition = ((ret.condition_status if ret else "good") or "good").lower()
        if condition == "good" and inv.service_status != "in_service" and inv.status not in {"missing", "damaged"}:
            inv.status = "available"
        elif condition == "missing":
            inv.status = "missing"
        elif condition in {"damaged", "incomplete"} and inv.service_status != "in_service" and inv.status != "missing":
            inv.status = "damaged"
        _log_custody(db, booking.id, inv.id, None, "gate_in", from_person=booking.destination, to_person="Store", notes=f"Booking completed. Condition: {condition}")
    for crew in booking.crew:
        if crew.crew_member:
            crew.crew_member.status = "available"
            _log_custody(db, booking.id, None, crew.crew_member_id, "gate_in", from_person=booking.destination, to_person="Office", notes="Booking completed.")
    db.add(models.GatePass(
        gate_pass_number=next_gate_pass_number(db),
        booking_id=booking.id,
        pass_type="gate_in",
        approved_by="System Parity Check",
        status="issued",
        remarks="Auto-generated on complete booking closure"
    ))
    # Cascade status to supplementary bookings
    for child in db.query(models.EventBooking).filter(models.EventBooking.parent_booking_id == booking_id).all():
        if child.status in ("confirmed", "dispatched"):
            child.status = "returned"
    db.commit()
    db.refresh(booking)
    return {"ok": True, "booking_id": booking.id, "status": booking.status, **check}

@router.post("/qc", response_model=schemas.ReturnQCRead)
def create_qc(payload: schemas.ReturnQCCreate, db: Session = Depends(get_db)):
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    existing = db.query(models.ReturnQC).filter(models.ReturnQC.booking_id == payload.booking_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="QC already exists for this booking.")
    item = models.ReturnQC(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

# ─── DAMAGE LOG ENDPOINTS ───
@router.get("/damages", response_model=list[schemas.DamageLogRead])
def list_damages(db: Session = Depends(get_db)):
    return db.query(models.DamageLog).order_by(models.DamageLog.id.desc()).all()

@router.post("/damages", response_model=schemas.DamageLogRead)
def create_damage(payload: schemas.DamageLogCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.status not in {"dispatched", "returned"}:
        raise HTTPException(status_code=400, detail="Damage/missing can be logged only after dispatch.")
    inv = db.query(models.InventoryItem).filter(models.InventoryItem.id == payload.inventory_item_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory item not found.")

    damage = models.DamageLog(
        booking_id=payload.booking_id,
        inventory_item_id=payload.inventory_item_id,
        damage_description=payload.damage_description,
        severity=payload.severity,
        reported_by=payload.reported_by,
        stage=payload.stage,
    )
    db.add(damage)
    db.commit()
    db.refresh(damage)

    # Auto-create repair/service job only for booking verticals that support it.
    if payload.auto_create_service_job:
        if not feature_enabled_for_user(current_user, "serviceJobs"):
            raise HTTPException(status_code=400, detail="Repair/service jobs are not used for this company's booking type.")
        sj = models.ServiceJob(
            job_number=next_service_job_number(db),
            inventory_item_id=payload.inventory_item_id,
            vendor_name="To Be Assigned",
            sent_date=date.today(),
            status="in_service",
            problem_reported=f"Damage from booking {booking.job_card_id}: {payload.damage_description}",
            source_booking_id=payload.booking_id,
            source_damage_id=damage.id,
        )
        db.add(sj)
        inv.status = "servicing"
        inv.service_status = "in_service"
        db.commit()
        db.refresh(sj)
        damage.auto_service_job_id = sj.id
        db.commit()
        db.refresh(damage)

    audit(db, current_user.username, "create", "damage_log", entity_id=damage.id,
          details={"booking_id": payload.booking_id, "item": inv.asset_code, "description": payload.damage_description, "severity": payload.severity})
    db.commit()
    return damage

@router.post("/damages/{damage_id}/upload-photo")
async def upload_damage_photo(damage_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    damage = db.query(models.DamageLog).filter(models.DamageLog.id == damage_id).first()
    if not damage:
        raise HTTPException(status_code=404, detail="Damage log not found.")
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    filename = f"damage_{damage_id}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    damage.photo_path = filename
    db.commit()
    return {"ok": True, "photo_path": filename}


@router.post("/{booking_id}/supplementary")
def create_supplementary_booking(booking_id: int, payload: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """
    Create a supplementary job card for date/scope changes on a confirmed booking.
    Payload: { "date_tags": [{date,type}], "added_dates": [...], "removed_dates": [...], "notes": "...", "equipment_ids": [...], "accessory_ids": [...], "crew_ids": [...] }
    Detects conflicts before creating the supplementary card.
    """
    parent = db.query(models.EventBooking).filter(models.EventBooking.id == booking_id).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent booking not found.")
    if (parent.status or "").lower() not in {"confirmed", "dispatched"}:
        raise HTTPException(status_code=400, detail="Supplementary booking can be created only after parent booking confirmation.")
    _ensure_booking_identity(db, parent)
    date_tags = payload.get("date_tags") or []
    old_dates = []
    if parent.project:
        old_dates = [
            {"date": row.date_value.isoformat(), "type": {"start_date": "shoot_date", "end_date": "end_day"}.get(row.date_type, row.date_type)}
            for row in parent.project.dates or []
            if row.date_value
        ]
    old_shoot_dates = {row["date"] for row in old_dates if row["type"] == "shoot_date"}
    new_shoot_dates = {row.get("date") for row in date_tags if row.get("type") == "shoot_date"} if date_tags else set(payload.get("added_dates") or [])
    off_dates = {row.get("date") for row in date_tags if row.get("type") == "off_day"} if date_tags else set(payload.get("removed_dates") or [])
    added = payload.get("added_dates") or sorted([d for d in new_shoot_dates if d and d not in old_shoot_dates])
    removed = payload.get("removed_dates") or sorted([d for d in (old_shoot_dates - new_shoot_dates) | off_dates if d])
    equipment_ids = payload.get("equipment_ids") or []
    accessory_ids = payload.get("accessory_ids") or []
    if not equipment_ids and not accessory_ids:
        equipment_ids = [x.inventory_item_id for x in parent.equipment]
    else:
        equipment_ids = list(dict.fromkeys([*equipment_ids, *accessory_ids]))
    crew_ids = payload.get("crew_ids") or [x.crew_member_id for x in parent.crew]
    notes = payload.get("notes") or ""
    project = parent.project

    root_parent_id = parent.parent_booking_id or parent.id
    family_ids = [
        row.id for row in db.query(models.EventBooking.id).filter(
            (models.EventBooking.id == root_parent_id) | (models.EventBooking.parent_booking_id == root_parent_id)
        ).all()
    ]
    check_dates = sorted({*added, *[row.get("date") for row in date_tags if row.get("date")]})

    # Conflict check: item status first (servicing / inactive / forever_damaged cannot appear in any new booking)
    conflicts = []
    for inv_id in equipment_ids:
        inv_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == inv_id).first()
        if inv_item and (inv_item.status in ["servicing", "inactive", "cancelled"] or inv_item.service_status in ["in_service", "forever_damaged"]):
            conflicts.append({
                "date": "all_dates",
                "inventory_item_id": inv_id,
                "reason": f"Item unavailable — status: {inv_item.status}, service: {inv_item.service_status}",
                "conflict_booking_id": None,
            })

    for crew_id in crew_ids:
        person = db.query(models.CrewMember).filter(models.CrewMember.id == crew_id).first()
        if person and person.status in ["inactive", "cancelled"]:
            conflicts.append({
                "date": "all_dates",
                "crew_member_id": crew_id,
                "reason": f"Manpower unavailable — status: {person.status}",
                "conflict_booking_id": None,
            })

    added_dates = []
    removed_dates = []
    for dstr in added:
        try:
            d = datetime.fromisoformat(dstr).date() if isinstance(dstr, str) else dstr
        except Exception:
            continue
        added_dates.append(d)
    for dstr in check_dates:
        try:
            d = datetime.fromisoformat(dstr).date() if isinstance(dstr, str) else dstr
        except Exception:
            continue
        for inv_id in equipment_ids:
            hit = db.query(models.BookingEquipment).join(models.EventBooking).join(models.ProjectEvent).filter(
                models.BookingEquipment.inventory_item_id == inv_id,
                models.EventBooking.status.in_(ACTIVE_STATUSES),
                ~models.EventBooking.id.in_(family_ids),
                models.ProjectEvent.shoot_start <= datetime.combine(d, datetime.max.time()),
                models.ProjectEvent.shoot_end >= datetime.combine(d, datetime.min.time()),
            ).first()
            if hit:
                conflicts.append({"date": str(d), "inventory_item_id": inv_id, "conflict_booking_id": hit.booking_id, "reason": "Equipment already booked"})
        for crew_id in crew_ids:
            hit = db.query(models.BookingCrew).join(models.EventBooking).join(models.ProjectEvent).filter(
                models.BookingCrew.crew_member_id == crew_id,
                models.EventBooking.status.in_(ACTIVE_STATUSES),
                ~models.EventBooking.id.in_(family_ids),
                models.ProjectEvent.shoot_start <= datetime.combine(d, datetime.max.time()),
                models.ProjectEvent.shoot_end >= datetime.combine(d, datetime.min.time()),
            ).first()
            if hit:
                conflicts.append({"date": str(d), "crew_member_id": crew_id, "conflict_booking_id": hit.booking_id, "reason": "Manpower already booked"})
    for dstr in removed:
        try:
            d = datetime.fromisoformat(dstr).date() if isinstance(dstr, str) else dstr
        except Exception:
            continue
        removed_dates.append(d)

    if conflicts:
        raise HTTPException(status_code=409, detail={"message": "Conflicts found. Supplementary card not created.", "conflicts": conflicts})

    if project:
        existing_dates = {(row.date_type, row.date_value) for row in project.dates or []}
        if date_tags:
            for row in list(project.dates or []):
                db.delete(row)
            parsed_dates = []
            for row in date_tags:
                try:
                    d = datetime.fromisoformat(row.get("date")).date()
                except Exception:
                    continue
                date_type = row.get("type") or "shoot_date"
                db.add(models.ProjectDate(project_id=project.id, date_type=date_type, date_value=d))
                parsed_dates.append(d)
            if parsed_dates:
                project.block_start = datetime.combine(min(parsed_dates), datetime.min.time())
                project.block_end = datetime.combine(max(parsed_dates), datetime.max.time())
                active_dates = [d for d in parsed_dates if d not in off_dates]
                if active_dates:
                    project.shoot_start = datetime.combine(min(active_dates), datetime.min.time())
                    project.shoot_end = datetime.combine(max(active_dates), datetime.max.time())
                    project.expected_start_date = min(active_dates)
                    project.expected_end_date = max(active_dates)
        else:
            for d in added_dates:
                if ("shoot_date", d) not in existing_dates and ("start_date", d) not in existing_dates:
                    db.add(models.ProjectDate(project_id=project.id, date_type="shoot_date", date_value=d))
                    existing_dates.add(("shoot_date", d))
            for d in removed_dates:
                for row in list(project.dates or []):
                    normalized_type = {"start_date": "shoot_date", "end_date": "end_day"}.get(row.date_type, row.date_type)
                    if normalized_type in {"shoot_date", "end_day"} and row.date_value == d:
                        db.delete(row)
                if ("off_day", d) not in existing_dates:
                    db.add(models.ProjectDate(project_id=project.id, date_type="off_day", date_value=d))
                    existing_dates.add(("off_day", d))

    # Create supplementary booking record
    inherited_status = parent.status or "planned"
    supp = models.EventBooking(
        booking_code=next_booking_code(db),
        job_card_id=None,
        project_id=parent.project_id,
        parent_booking_id=parent.id,
        destination=parent.destination,
        status=inherited_status,
        remarks=f"Supplementary. Added: {added}. Removed: {removed}. {notes}".strip(),
        is_conflict=bool(conflicts),
        transport_mode=parent.transport_mode,
        contact_person_name=parent.contact_person_name,
        contact_person_mobile=parent.contact_person_mobile,
    )
    db.add(supp)
    db.flush()
    if inherited_status in {"confirmed", "dispatched"}:
        _ensure_booking_identity(db, supp)
    for inv_id in equipment_ids:
        db.add(models.BookingEquipment(booking_id=supp.id, inventory_item_id=inv_id))
        item = db.query(models.InventoryItem).filter(models.InventoryItem.id == inv_id).first()
        if item and inherited_status == "confirmed":
            item.status = "reserved"
            _log_custody(db, supp.id, inv_id, None, "assign", from_person="Store", to_person=supp.destination, location=project.venue if project else None, notes=f"Supplementary confirmed booking for {_display_booking_identity(supp)}")
        elif item and inherited_status == "dispatched":
            item.status = "on_shoot"
            _log_custody(db, supp.id, inv_id, None, "gate_out", from_person="Store", to_person=supp.destination, location=project.venue if project else None, notes=f"Supplementary dispatched booking for {_display_booking_identity(supp)}")
    for c_id in crew_ids:
        db.add(models.BookingCrew(booking_id=supp.id, crew_member_id=c_id))
        person = db.query(models.CrewMember).filter(models.CrewMember.id == c_id).first()
        if person and inherited_status == "confirmed":
            person.status = "blocked"
            _log_custody(db, supp.id, None, c_id, "assign", from_person="Office", to_person=supp.destination, location=project.venue if project else None, notes=f"Supplementary confirmed booking for {_display_booking_identity(supp)}")
        elif person and inherited_status == "dispatched":
            person.status = "on_shoot"
            _log_custody(db, supp.id, None, c_id, "gate_out", from_person="Office", to_person=supp.destination, location=project.venue if project else None, notes=f"Supplementary dispatched booking for {_display_booking_identity(supp)}")
    audit(db, current_user.username, "create", "booking", entity_id=supp.id, details={
        "booking_code": supp.booking_code, "supplementary_of": parent.job_card_id, "added_dates": added, "removed_dates": removed, "conflicts": conflicts,
    })
    db.commit()
    db.refresh(supp)
    return {"ok": True, "supplementary_booking_id": supp.id, "booking_code": supp.booking_code, "job_card_id": supp.job_card_id, "conflicts": conflicts}
