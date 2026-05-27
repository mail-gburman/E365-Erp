from datetime import date, timedelta, datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..auth import get_current_user
from ..booking_profiles import feature_enabled_for_user
from .. import models
from ..utils import overlaps
from ..permissions import require_permission

router = APIRouter(prefix="/dashboard", tags=["Dashboard"], dependencies=[Depends(require_permission("bookings","view"))])

ACTIVE_BOOKING_STATUSES = ["confirmed", "dispatched"]


def _active_bookings(db: Session, company_id: int | None = None):
    q = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.project),
        joinedload(models.EventBooking.equipment),
        joinedload(models.EventBooking.crew),
    ).filter(models.EventBooking.status.in_(ACTIVE_BOOKING_STATUSES))
    if company_id:
        q = q.filter(models.EventBooking.company_id == company_id)
    return q.all()


def _booking_conflict_rows(bookings):
    rows = []
    equipment_conflicts = 0
    crew_conflicts = 0
    for i in range(len(bookings)):
        for j in range(i + 1, len(bookings)):
            a, b = bookings[i], bookings[j]
            if not a.project or not b.project:
                continue
            if not overlaps(a.project.block_start, a.project.block_end, b.project.block_start, b.project.block_end):
                continue
            aset = {x.inventory_item_id for x in a.equipment}
            bset = {x.inventory_item_id for x in b.equipment}
            cset = {x.crew_member_id for x in a.crew}
            dset = {x.crew_member_id for x in b.crew}
            pair_label = f"{a.job_card_id or a.booking_code} ↔ {b.job_card_id or b.booking_code}"
            project_label = f"{a.project.title if a.project else '-'} / {b.project.title if b.project else '-'}"
            destination_label = " / ".join([x for x in [a.destination, b.destination] if x]) or "—"
            status_label = f"{a.status} / {b.status}"
            if aset & bset:
                equipment_conflicts += 1
                rows.append({
                    "job_card": pair_label,
                    "project": project_label,
                    "destination": destination_label,
                    "status": status_label,
                    "issue": "Equipment overlap",
                })
            if cset & dset:
                crew_conflicts += 1
                rows.append({
                    "job_card": pair_label,
                    "project": project_label,
                    "destination": destination_label,
                    "status": status_label,
                    "issue": "Crew overlap",
                })
    return rows, equipment_conflicts, crew_conflicts

@router.get("")
def dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    range_start: Optional[str] = Query(None),
    range_end: Optional[str] = Query(None),
):
    today = date.today()
    week_out = today + timedelta(days=7)
    cid = current_user.company_id  # None for super-admin → no tenant filter

    def _scope(q, model):
        """Apply company filter when a tenant user is logged in."""
        if cid:
            q = q.filter(model.company_id == cid)
        return q

    inventory_total = _scope(db.query(models.InventoryItem), models.InventoryItem).count()
    active_items = _scope(
        db.query(models.InventoryItem).filter(models.InventoryItem.status.in_(["reserved", "on_shoot"])),
        models.InventoryItem
    ).count()
    crew_total = _scope(db.query(models.CrewMember), models.CrewMember).count()
    active_projects = _scope(
        db.query(models.ProjectEvent).filter(models.ProjectEvent.status.in_(["planned", "confirmed"])),
        models.ProjectEvent
    ).count()
    supports_service_jobs = feature_enabled_for_user(current_user, "serviceJobs")
    supports_warranty = feature_enabled_for_user(current_user, "warranty")
    supports_returns = feature_enabled_for_user(current_user, "returns")
    in_service = _scope(db.query(models.ServiceJob).filter(models.ServiceJob.status == "in_service"), models.ServiceJob).count() if supports_service_jobs else 0
    warranty_soon = _scope(
        db.query(models.InventoryItem).filter(models.InventoryItem.warranty_expiry != None, models.InventoryItem.warranty_expiry <= week_out),
        models.InventoryItem
    ).count() if supports_warranty else 0

    # Third-party equipment stats
    third_party_total = _scope(
        db.query(models.InventoryItem).filter(models.InventoryItem.owner_type == "third_party"),
        models.InventoryItem
    ).count()
    third_party_active = _scope(
        db.query(models.InventoryItem).filter(
            models.InventoryItem.owner_type == "third_party",
            models.InventoryItem.status.in_(["reserved", "on_shoot"])
        ),
        models.InventoryItem
    ).count()

    # External crew stats
    external_crew = _scope(
        db.query(models.CrewMember).filter(models.CrewMember.manpower_type.in_(["external", "contractual", "freelance"])),
        models.CrewMember
    ).count()
    external_deployed = _scope(
        db.query(models.CrewMember).filter(
            models.CrewMember.manpower_type.in_(["external", "contractual", "freelance"]),
            models.CrewMember.status.in_(["blocked", "on_shoot"])
        ),
        models.CrewMember
    ).count()

    return_due_today = 0
    overdue_returns = 0

    bookings = _active_bookings(db, company_id=cid)
    deployed_crew_ids = {row.crew_member_id for booking in bookings for row in booking.crew}
    crew_deployed = len(deployed_crew_ids)
    now_dt = datetime.now()
    for b in bookings:
        if not b.project:
            continue
        if supports_returns and b.project.block_end.date() == today:
            return_due_today += 1
        if supports_returns and b.project.block_end < now_dt:
            overdue_returns += 1

    conflict_rows, equipment_conflicts, crew_conflicts = _booking_conflict_rows(bookings)

    utilization = round((active_items / inventory_total) * 100, 2) if inventory_total else 0
    alerts = []
    if overdue_returns:
        alerts.append(f"{overdue_returns} overdue return(s)")
    if return_due_today:
        alerts.append(f"{return_due_today} return(s) due today")
    if in_service:
        alerts.append(f"{in_service} item(s) under service")
    if warranty_soon:
        alerts.append(f"{warranty_soon} warranty expiry within 7 days")
    if equipment_conflicts:
        alerts.append(f"{equipment_conflicts} equipment scheduling conflict(s)")
    if crew_conflicts:
        alerts.append(f"{crew_conflicts} crew scheduling conflict(s)")

    # Date-range filtered stats
    range_bookings = 0
    range_projects = 0
    range_dispatched = 0
    range_returned = 0
    range_cancelled = 0
    if range_start and range_end:
        try:
            rs = datetime.strptime(range_start, "%Y-%m-%d")
            re_ = datetime.strptime(range_end, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
            bk_q = db.query(models.EventBooking).options(joinedload(models.EventBooking.project))
            if cid:
                bk_q = bk_q.filter(models.EventBooking.company_id == cid)
            all_bookings_in_range = bk_q.all()
            for bk in all_bookings_in_range:
                if bk.project and overlaps(bk.project.block_start, bk.project.block_end, rs, re_):
                    range_bookings += 1
                    if bk.status == "dispatched": range_dispatched += 1
                    elif bk.status == "returned": range_returned += 1
                    elif bk.status == "cancelled": range_cancelled += 1
            pe_q = db.query(models.ProjectEvent).filter(
                models.ProjectEvent.block_start <= re_,
                models.ProjectEvent.block_end >= rs,
            )
            if cid:
                pe_q = pe_q.filter(models.ProjectEvent.company_id == cid)
            range_projects = pe_q.count()
        except Exception:
            pass

    return {
        "equipment_utilization": utilization,
        "warranty_expiring_soon": warranty_soon,
        "active_shoots": active_projects,
        "personnel_availability": max(crew_total - crew_deployed, 0),
        "personnel_deployed": crew_deployed,
        "equipment_in_service": in_service,
        "scheduling_conflicts": len(conflict_rows),
        "equipment_conflicts": equipment_conflicts,
        "crew_conflicts": crew_conflicts,
        "total_inventory": inventory_total,
        "total_crew": crew_total,
        "returns_due_today": return_due_today,
        "overdue_returns": overdue_returns,
        "third_party_equipment": third_party_total,
        "third_party_active": third_party_active,
        "external_crew": external_crew,
        "external_crew_deployed": external_deployed,
        "alerts": alerts,
        "chart": {
            "labels": ["Utilization", "Warranty Soon", "In Service", "Conflicts"],
            "values": [utilization, warranty_soon, in_service, len(conflict_rows)]
        },
        "range_bookings": range_bookings,
        "range_projects": range_projects,
        "range_dispatched": range_dispatched,
        "range_returned": range_returned,
        "range_cancelled": range_cancelled,
    }


@router.get("/snapshot")
def dashboard_snapshot(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    range_start: Optional[str] = Query(None),
    range_end: Optional[str] = Query(None),
):
    return dashboard(db=db, current_user=current_user, range_start=range_start, range_end=range_end)


@router.get("/conflicts")
def dashboard_conflicts(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    cid = current_user.company_id
    rows, equipment_conflicts, crew_conflicts = _booking_conflict_rows(_active_bookings(db, company_id=cid))
    return {
        "count": len(rows),
        "equipment_conflicts": equipment_conflicts,
        "crew_conflicts": crew_conflicts,
        "rows": rows,
    }


@router.get("/available-personnel")
def dashboard_available_personnel(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    cid = current_user.company_id
    active_bookings = _active_bookings(db, company_id=cid)
    deployed_ids = {row.crew_member_id for booking in active_bookings for row in booking.crew}
    crew_q = db.query(models.CrewMember).order_by(models.CrewMember.employee_code.asc())
    if cid:
        crew_q = crew_q.filter(models.CrewMember.company_id == cid)
    crew = crew_q.all()
    rows = [
        {
            "employee_code": member.employee_code,
            "name": member.full_name,
            "role": member.role,
            "type": member.manpower_type,
            "station": member.home_station,
        }
        for member in crew
        if member.id not in deployed_ids
    ]
    return {
        "count": len(rows),
        "total": len(crew),
        "rows": rows,
    }
