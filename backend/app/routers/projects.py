from datetime import datetime, time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from ..permissions import require_permission
from .. import models, schemas
from ..audit import audit

router = APIRouter(prefix="/projects", tags=["Projects"])

EDITABLE_PROJECT_STATUSES = {"draft", "planned", "confirmed", "cancelled"}
DATE_TYPE_ALIASES = {
    "travel_day": "travel_day",
    "start_date": "shoot_date",
    "shoot_date": "shoot_date",
    "end_date": "end_day",
    "end_day": "end_day",
    "setup_date": "setup_date",
    "technical_date": "technical_date",
    "off_day": "off_day",
    "return_day": "return_day",
}


def _as_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if hasattr(value, "year") and hasattr(value, "month") and hasattr(value, "day"):
        return value
    return datetime.fromisoformat(str(value)).date()


def _normalize_dates(dates):
    normalized = []
    for row in dates or []:
        date_value = _as_date(row.get("date_value"))
        date_type = DATE_TYPE_ALIASES.get((row.get("date_type") or "").strip(), (row.get("date_type") or "").strip())
        if not date_value or not date_type:
            continue
        normalized.append({"date_type": date_type, "date_value": date_value})
    return normalized


def _project_window(shoot_start, shoot_end, dates):
    selected_dates = [row["date_value"] for row in dates]
    block_start = shoot_start
    block_end = shoot_end or shoot_start
    if selected_dates:
        earliest = min(selected_dates)
        latest = max(selected_dates)
        earliest_dt = datetime.combine(earliest, time.min)
        latest_dt = datetime.combine(latest, time.max)
        block_start = min([value for value in [block_start, earliest_dt] if value is not None], default=earliest_dt)
        block_end = max([value for value in [block_end, latest_dt] if value is not None], default=latest_dt)
    return block_start, block_end


def _apply_project_date_fields(item, dates):
    dates_by_type = {}
    for row in dates:
        dates_by_type.setdefault(row["date_type"], []).append(row["date_value"])
    item.setup_date = min(dates_by_type.get("setup_date", []) + dates_by_type.get("technical_date", []), default=item.setup_date)
    item.off_days = len(dates_by_type.get("off_day", []))
    item.expected_start_date = min(dates_by_type.get("shoot_date", []), default=item.expected_start_date)
    item.expected_end_date = max(dates_by_type.get("end_day", []), default=item.expected_end_date)
    overall_start = min(
        dates_by_type.get("travel_day", []) + dates_by_type.get("setup_date", []) + dates_by_type.get("technical_date", []) + dates_by_type.get("shoot_date", []),
        default=item.expected_start_date,
    )
    overall_end = max(
        dates_by_type.get("return_day", []) + dates_by_type.get("end_day", []) + dates_by_type.get("shoot_date", []),
        default=item.expected_end_date,
    )
    item.shoot_start = datetime.combine(overall_start, time.min) if overall_start else item.shoot_start
    item.shoot_end = datetime.combine(overall_end, time.max) if overall_end else item.shoot_end
    item.block_start, item.block_end = _project_window(item.shoot_start, item.shoot_end, dates)

@router.get("/", response_model=list[schemas.ProjectRead], dependencies=[Depends(require_permission("bookings","view"))])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.ProjectEvent).order_by(models.ProjectEvent.shoot_start.desc()).all()

@router.post("/", response_model=schemas.ProjectRead, dependencies=[Depends(require_permission("bookings","add"))])
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    normalized_dates = _normalize_dates(payload.dates)
    status = payload.status if payload.status in EDITABLE_PROJECT_STATUSES else "planned"
    if status != "draft" and not payload.shoot_start and not normalized_dates:
        raise HTTPException(status_code=400, detail="Project dates are required before planning or confirming a project.")
    item = models.ProjectEvent(
        title=payload.title,
        show_type=payload.show_type,
        client_id=payload.client_id,
        venue=payload.venue,
        origin_warehouse_id=payload.origin_warehouse_id,
        shoot_start=payload.shoot_start,
        shoot_end=payload.shoot_end,
        setup_date=payload.setup_date,
        off_days=payload.off_days,
        expected_start_date=payload.expected_start_date,
        expected_end_date=payload.expected_end_date,
        setup_days=payload.setup_days,
        status=status,
        notes=payload.notes,
        block_start=payload.shoot_start,
        block_end=payload.shoot_end or payload.shoot_start,
    )
    _apply_project_date_fields(item, normalized_dates)
    db.add(item)
    db.flush()
    for d in normalized_dates:
        db.add(models.ProjectDate(project_id=item.id, date_type=d["date_type"], date_value=d["date_value"]))
    audit(db, current_user.username, "create", "project", details=payload.model_dump())
    db.commit()
    db.refresh(item)
    return item

@router.put("/{project_id}", response_model=schemas.ProjectRead, dependencies=[Depends(require_permission("bookings", "edit"))])
def update_project(project_id: int, payload: schemas.ProjectUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    item = db.query(models.ProjectEvent).filter(models.ProjectEvent.id == project_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Project not found.")
    data = payload.model_dump(exclude_unset=True)
    dates_data = data.pop("dates", None)
    if "status" in data and data["status"] not in EDITABLE_PROJECT_STATUSES:
        data["status"] = item.status
    for k, v in data.items():
        setattr(item, k, v)
    current_dates = [{"date_type": row.date_type, "date_value": row.date_value} for row in item.dates]
    normalized_dates = _normalize_dates(dates_data) if dates_data is not None else current_dates
    next_status = data.get("status", item.status)
    next_shoot_start = data.get("shoot_start", item.shoot_start)
    if next_status != "draft" and not next_shoot_start and not normalized_dates:
        raise HTTPException(status_code=400, detail="Project dates are required before planning or confirming a project.")
    _apply_project_date_fields(item, normalized_dates)
    if dates_data is not None:
        db.query(models.ProjectDate).filter(models.ProjectDate.project_id == project_id).delete()
        for d in normalized_dates:
            db.add(models.ProjectDate(project_id=project_id, date_type=d["date_type"], date_value=d["date_value"]))
    audit(db, current_user.username, "update", "project", entity_id=project_id, details=data)
    if data.get("status") == "confirmed":
        from .bookings import _confirm_booking_resources

        top_level_bookings = db.query(models.EventBooking).filter(
            models.EventBooking.project_id == project_id,
            models.EventBooking.parent_booking_id == None,
        ).all()
        for booking in top_level_bookings:
            if (booking.status or "").lower() in {"planned", "blocked"}:
                family_ids = {booking.id, *[
                    row.id for row in db.query(models.EventBooking.id).filter(models.EventBooking.parent_booking_id == booking.id).all()
                ]}
                _confirm_booking_resources(db, booking, family_ids)
                for child in db.query(models.EventBooking).filter(models.EventBooking.parent_booking_id == booking.id).all():
                    if (child.status or "").lower() in {"planned", "blocked"}:
                        _confirm_booking_resources(db, child, family_ids)
    db.commit()
    db.refresh(item)
    return item
