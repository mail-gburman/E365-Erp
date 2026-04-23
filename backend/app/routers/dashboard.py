from datetime import date, timedelta, datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from .. import models
from ..utils import overlaps
from ..permissions import require_permission

router = APIRouter(prefix="/dashboard", tags=["Dashboard"], dependencies=[Depends(require_permission("bookings","view"))])

ACTIVE_BOOKING_STATUSES = ["confirmed", "dispatched"]

@router.get("")
def dashboard(
    db: Session = Depends(get_db),
    range_start: Optional[str] = Query(None),
    range_end: Optional[str] = Query(None),
):
    today = date.today()
    week_out = today + timedelta(days=7)

    inventory_total = db.query(models.InventoryItem).count()
    active_items = db.query(models.InventoryItem).filter(models.InventoryItem.status.in_(["reserved", "on_shoot"])).count()
    crew_total = db.query(models.CrewMember).count()
    crew_deployed = db.query(models.CrewMember).filter(models.CrewMember.status.in_(["blocked", "on_shoot"])).count()
    active_projects = db.query(models.ProjectEvent).filter(models.ProjectEvent.status.in_(["planned", "confirmed"])).count()
    in_service = db.query(models.InventoryItem).filter(models.InventoryItem.service_status == "in_service").count()
    warranty_soon = db.query(models.InventoryItem).filter(models.InventoryItem.warranty_expiry != None, models.InventoryItem.warranty_expiry <= week_out).count()

    # Third-party equipment stats
    third_party_total = db.query(models.InventoryItem).filter(models.InventoryItem.owner_type == "third_party").count()
    third_party_active = db.query(models.InventoryItem).filter(
        models.InventoryItem.owner_type == "third_party",
        models.InventoryItem.status.in_(["reserved", "on_shoot"])
    ).count()

    # External crew stats
    external_crew = db.query(models.CrewMember).filter(models.CrewMember.manpower_type.in_(["external", "contractual", "freelance"])).count()
    external_deployed = db.query(models.CrewMember).filter(
        models.CrewMember.manpower_type.in_(["external", "contractual", "freelance"]),
        models.CrewMember.status.in_(["blocked", "on_shoot"])
    ).count()

    return_due_today = 0
    overdue_returns = 0

    bookings = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.project)
    ).filter(models.EventBooking.status.in_(ACTIVE_BOOKING_STATUSES)).all()
    now_dt = datetime.now()
    for b in bookings:
        if not b.project:
            continue
        if b.project.block_end.date() == today:
            return_due_today += 1
        if b.project.block_end < now_dt:
            overdue_returns += 1

    # Conflict analytics over currently active bookings
    active_bookings = bookings  # reuse the already-loaded list
    equipment_conflicts = 0
    crew_conflicts = 0
    for i in range(len(active_bookings)):
        for j in range(i + 1, len(active_bookings)):
            a, b = active_bookings[i], active_bookings[j]
            if not a.project or not b.project:
                continue
            if overlaps(a.project.block_start, a.project.block_end, b.project.block_start, b.project.block_end):
                aset = {x.inventory_item_id for x in a.equipment}
                bset = {x.inventory_item_id for x in b.equipment}
                cset = {x.crew_member_id for x in a.crew}
                dset = {x.crew_member_id for x in b.crew}
                if aset & bset:
                    equipment_conflicts += 1
                if cset & dset:
                    crew_conflicts += 1

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
            all_bookings_in_range = db.query(models.EventBooking).options(
                joinedload(models.EventBooking.project)
            ).all()
            for bk in all_bookings_in_range:
                if bk.project and overlaps(bk.project.block_start, bk.project.block_end, rs, re_):
                    range_bookings += 1
                    if bk.status == "dispatched": range_dispatched += 1
                    elif bk.status == "returned": range_returned += 1
                    elif bk.status == "cancelled": range_cancelled += 1
            range_projects = db.query(models.ProjectEvent).filter(
                models.ProjectEvent.block_start <= re_,
                models.ProjectEvent.block_end >= rs,
            ).count()
        except Exception:
            pass

    return {
        "equipment_utilization": utilization,
        "warranty_expiring_soon": warranty_soon,
        "active_shoots": active_projects,
        "personnel_availability": max(crew_total - crew_deployed, 0),
        "personnel_deployed": crew_deployed,
        "equipment_in_service": in_service,
        "scheduling_conflicts": equipment_conflicts + crew_conflicts,
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
            "values": [utilization, warranty_soon, in_service, equipment_conflicts + crew_conflicts]
        },
        "range_bookings": range_bookings,
        "range_projects": range_projects,
        "range_dispatched": range_dispatched,
        "range_returned": range_returned,
        "range_cancelled": range_cancelled,
    }
