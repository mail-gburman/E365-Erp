import json
from datetime import datetime, timedelta
from io import BytesIO, StringIO
import csv
import zipfile
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal, engine, Base
from ..auth import get_current_user, require_roles
from ..permissions import require_permission
from .. import models
from ..seed import seed_db
from ..utils import make_audit_pdf
from ..audit import audit

router = APIRouter(prefix="/audit", tags=["Audit"])

CATEGORY_MAP = {
    "all": None,
    "additions": ["warehouse", "vendor", "client", "inventory", "crew", "equipment_master", "procurement"],
    "papers": ["paper", "gate_pass"],
    "bookings": ["project", "booking", "partial_return", "qc"],
    "services": ["service_job"],
    "equipment": ["inventory", "equipment_master", "partial_return"],
    "manpower": ["crew"],
    "users": ["user"],
    "documents": ["statutory_document"],
}

DISPLAY_LABELS = {
    "entity_type": "Section",
    "entity_id": "Record ID",
    "job_number": "Service Job Number",
    "inventory_item_id": "Equipment",
    "vendor_name": "Vendor",
    "sent_date": "Sent On",
    "expected_return_date": "Expected Return",
    "actual_return_date": "Actual Return",
    "transport_mode": "Transport Mode",
    "courier_partner": "Courier Partner",
    "awb_number": "Tracking Number",
    "contact_person_name": "Primary Contact Name",
    "contact_person_mobile": "Primary Contact Mobile",
    "alternate_contact_name": "Backup Contact Name",
    "alternate_contact_mobile": "Backup Contact Mobile",
    "contact_email": "Contact Email",
    "pickup_address": "Pickup Address",
    "delivery_address": "Delivery Address",
    "package_count": "Number Of Packages",
    "declared_value": "Declared Value",
    "package_notes": "Package Notes",
    "problem_reported": "Problem Reported",
    "remarks": "Remarks",
    "service_bill_amount": "Service Bill Amount",
    "service_paid_amount": "Amount Paid",
    "service_payment_date": "Payment Date",
    "service_payment_mode": "Payment Mode",
    "service_payment_details": "Payment Notes",
    "billing_mode": "Billing Style",
    "count": "Rows Considered",
    "accepted": "Rows Accepted",
    "rejected": "Rows Rejected",
    "filename": "File Name",
    "message": "Summary",
    "type": "Type",
    "amount": "Amount",
    "is_active": "Active",
    "role": "User Role",
    "permissions_json": "Access Rights",
    "permissions": "Access Rights",
    "document_name": "Document Name",
    "source_damage_id": "Damage Reference",
    "source_booking_id": "Booking Reference",
    "note": "Note",
}

SECTION_LABELS = {
    "service_job": "Service Job",
    "account_invoice": "Invoice",
    "account_ledger": "Accounts",
    "demo_data": "Demo Data",
    "damage_log": "Damage Report",
    "user": "User",
    "booking": "Booking",
    "project": "Project",
    "paper": "Paper",
    "gate_pass": "Gate Pass",
    "inventory": "Equipment",
    "equipment_master": "Equipment Master",
    "crew": "Crew",
    "statutory_document": "Document",
}

ACTION_LABELS = {
    "create": "Created",
    "update": "Updated",
    "delete": "Deleted",
    "upload": "Uploaded",
    "smart_upload": "Imported",
    "bulk_upload": "Imported",
    "seed": "Loaded Demo Data",
    "complete": "Completed",
    "cancel": "Cancelled",
    "record_payment": "Payment Recorded",
    "upsert": "Saved",
    "existing": "Existing Record",
    "reset": "Reset",
}


def _range_dates(range_key, start_date, end_date):
    now = datetime.utcnow()
    if range_key == "1d": return now - timedelta(days=1), now
    if range_key == "2d": return now - timedelta(days=2), now
    if range_key == "7d": return now - timedelta(days=7), now
    if range_key == "30d": return now - timedelta(days=30), now
    if range_key == "90d": return now - timedelta(days=90), now
    if range_key == "custom":
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="Custom range requires start_date and end_date.")
        return datetime.fromisoformat(start_date), datetime.fromisoformat(end_date + "T23:59:59")
    return None, None


def _filtered_logs(db, range_key, category, start_date, end_date, username=None, action=None):
    q = db.query(models.AuditLog)
    start_dt, end_dt = _range_dates(range_key, start_date, end_date)
    if start_dt and end_dt:
        q = q.filter(models.AuditLog.created_at >= start_dt, models.AuditLog.created_at <= end_dt)
    entities = CATEGORY_MAP.get(category)
    if entities:
        q = q.filter(models.AuditLog.entity_type.in_(entities))
    if username:
        q = q.filter(models.AuditLog.username == username)
    if action:
        q = q.filter(models.AuditLog.action == action)
    return q.order_by(models.AuditLog.created_at.desc()).all()


def _fallback_rows(db, category):
    fallback = []
    if category in ["all", "additions", "equipment"]:
        for i in db.query(models.InventoryItem).order_by(models.InventoryItem.id.desc()).limit(100).all():
            fallback.append({"id": f"inventory-{i.id}", "created_at": i.created_at.isoformat() if getattr(i, "created_at", None) else None, "username": "seed/system", "action": "existing", "entity_type": "inventory", "entity_id": str(i.id), "details_json": i.name})
    if category in ["all", "additions", "manpower"]:
        for c in db.query(models.CrewMember).order_by(models.CrewMember.id.desc()).limit(100).all():
            fallback.append({"id": f"crew-{c.id}", "created_at": c.created_at.isoformat() if getattr(c, "created_at", None) else None, "username": "seed/system", "action": "existing", "entity_type": "crew", "entity_id": str(c.id), "details_json": c.full_name})
    if category in ["all", "bookings"]:
        for b in db.query(models.EventBooking).order_by(models.EventBooking.id.desc()).limit(100).all():
            fallback.append({"id": f"booking-{b.id}", "created_at": b.created_at.isoformat() if getattr(b, "created_at", None) else None, "username": "seed/system", "action": "existing", "entity_type": "booking", "entity_id": str(b.id), "details_json": b.destination})
    if category in ["all", "services"]:
        for s in db.query(models.ServiceJob).order_by(models.ServiceJob.id.desc()).limit(100).all():
            fallback.append({"id": f"service-{s.id}", "created_at": s.created_at.isoformat() if getattr(s, "created_at", None) else None, "username": "seed/system", "action": "existing", "entity_type": "service_job", "entity_id": str(s.id), "details_json": s.job_number})
    if category in ["all", "papers"]:
        for p in db.query(models.OutboundPaper).order_by(models.OutboundPaper.id.desc()).limit(100).all():
            fallback.append({"id": f"paper-{p.id}", "created_at": p.created_at.isoformat() if getattr(p, "created_at", None) else None, "username": "seed/system", "action": "existing", "entity_type": "paper", "entity_id": str(p.id), "details_json": p.paper_number})
        for g in db.query(models.GatePass).order_by(models.GatePass.id.desc()).limit(100).all():
            fallback.append({"id": f"gate-{g.id}", "created_at": g.created_at.isoformat() if getattr(g, "created_at", None) else None, "username": "seed/system", "action": "existing", "entity_type": "gate_pass", "entity_id": str(g.id), "details_json": g.gate_pass_number})
    return fallback


def _entity_label(db, entity_type, entity_id):
    if not entity_id:
        return None
    try:
        entity_num = int(entity_id)
    except Exception:
        entity_num = None

    if entity_type == "booking" and entity_num is not None:
        booking = db.query(models.EventBooking).filter(models.EventBooking.id == entity_num).first()
        if booking:
            project = booking.project.title if booking.project else "Booking"
            return f"{booking.job_card_id} · {project}"
    if entity_type == "project" and entity_num is not None:
        project = db.query(models.ProjectEvent).filter(models.ProjectEvent.id == entity_num).first()
        if project:
            client_name = project.client.name if project.client else None
            return " · ".join([x for x in [project.title, client_name, project.venue] if x])
    if entity_type in {"inventory", "equipment_master"} and entity_num is not None:
        item = db.query(models.InventoryItem).filter(models.InventoryItem.id == entity_num).first()
        if item:
            return f"{item.asset_code} · {item.name}"
        master = db.query(models.EquipmentMaster).filter(models.EquipmentMaster.id == entity_num).first()
        if master:
            return f"{master.equipment_code} · {master.name}"
    if entity_type == "crew" and entity_num is not None:
        crew = db.query(models.CrewMember).filter(models.CrewMember.id == entity_num).first()
        if crew:
            return f"{crew.employee_code} · {crew.full_name}"
    if entity_type == "service_job" and entity_num is not None:
        job = db.query(models.ServiceJob).filter(models.ServiceJob.id == entity_num).first()
        if job:
            equipment_name = job.inventory_item.name if job.inventory_item else None
            return " · ".join([x for x in [job.job_number, equipment_name, job.vendor_name] if x])
    if entity_type == "paper" and entity_num is not None:
        paper = db.query(models.OutboundPaper).filter(models.OutboundPaper.id == entity_num).first()
        if paper:
            return f"{paper.paper_number} · {paper.reference_name}"
    if entity_type == "gate_pass" and entity_num is not None:
        gate = db.query(models.GatePass).filter(models.GatePass.id == entity_num).first()
        if gate:
            project_name = gate.booking.project.title if gate.booking and gate.booking.project else None
            return " · ".join([x for x in [gate.gate_pass_number, project_name] if x])
    if entity_type == "client" and entity_num is not None:
        client = db.query(models.Client).filter(models.Client.id == entity_num).first()
        if client:
            return f"{client.client_code} · {client.name}"
    if entity_type == "vendor" and entity_num is not None:
        vendor = db.query(models.Vendor).filter(models.Vendor.id == entity_num).first()
        if vendor:
            return f"{vendor.vendor_code} · {vendor.name}"
    return None


def _normalized_key(key):
    return " ".join(str(key or "").strip().lower().replace("_", " ").replace("-", " ").split())

def _display_key(key):
    normalized = _normalized_key(key)
    direct = str(key or "").strip().lower()
    if direct in DISPLAY_LABELS:
        return DISPLAY_LABELS[direct]
    lookup_key = normalized.replace(" ", "_")
    if lookup_key in DISPLAY_LABELS:
        return DISPLAY_LABELS[lookup_key]
    return normalized.title() or "Details"


def _display_entity(entity_type):
    return SECTION_LABELS.get(entity_type, str(entity_type or "-").replace("_", " ").title())


def _format_money(value):
    try:
        return f"₹{float(value):,.2f}"
    except Exception:
        return str(value)


def _summarize_permissions(value):
    data = value
    if isinstance(value, str):
        try:
            data = json.loads(value)
        except Exception:
            cleaned = str(value).strip()
            return [cleaned[:180] + "..." if len(cleaned) > 180 else cleaned]
    if not isinstance(data, dict):
        return [str(value)]

    section_names = []
    for key, config in data.items():
        if not isinstance(config, dict):
            continue
        if not any(bool(v) for v in config.values()):
            continue
        section = key.split(".")[0].replace("_", " ").strip().title()
        if section and section not in section_names:
            section_names.append(section)

    if not section_names:
        return ["Access rights were reviewed."]

    if len(section_names) <= 8:
        return ["Access rights enabled for these sections: " + ", ".join(section_names) + "."]

    preview = ", ".join(section_names[:8])
    remaining = len(section_names) - 8
    return [f"Access rights enabled for these sections: {preview}, and {remaining} more sections."]


def _normalize_billing_style(value):
    text = str(value or "").strip().lower()
    mapping = {
        "line_item": "Item-wise billing",
        "package": "Package billing",
        "day_wise": "Day-wise billing",
    }
    return mapping.get(text, str(value))


def _value_lines(key, value):
    if value in (None, "", [], {}):
        return []
    key_lower = _normalized_key(key)
    if key_lower in {"permissions json", "permissions"}:
        return _summarize_permissions(value)
    if key_lower in {"service bill amount", "service paid amount", "declared value", "amount", "total", "subtotal amount", "tax amount", "total amount", "amount received", "bill amount", "paid amount"}:
        return [_format_money(value)]
    if key_lower == "billing mode":
        return [_normalize_billing_style(value)]
    if isinstance(value, bool):
        return ["Yes" if value else "No"]
    if isinstance(value, list):
        flattened = []
        for item in value:
            flattened.extend(_value_lines(key, item))
        return flattened
    if isinstance(value, dict):
        lines = []
        for sub_key, sub_value in value.items():
            for sub_line in _value_lines(sub_key, sub_value):
                lines.append(f"{_display_key(sub_key)}: {sub_line}")
        return lines
    text = str(value).strip()
    if text.startswith("{") or text.startswith("["):
        try:
            parsed = json.loads(text)
            return _value_lines(key, parsed)
        except Exception:
            pass
    return [text]


def _detail_items(details):
    if not details:
        return ["No extra details recorded."]
    data = details
    if isinstance(details, str):
        stripped = details.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            try:
                data = json.loads(stripped)
            except Exception:
                return [stripped]
        else:
            return [stripped]
    items = []
    if isinstance(data, dict):
        for key, value in data.items():
            key_lower = _normalized_key(key)
            for line in _value_lines(key, value):
                if key_lower in {"message", "summary"}:
                    items.append(line)
                else:
                    items.append(f"{_display_key(key)}: {line}")
    elif isinstance(data, list):
        for item in data:
            items.extend(_detail_items(item))
    else:
        items.append(str(data))
    return items or ["No extra details recorded."]


def _format_details(details):
    return "\n".join(_detail_items(details))


def _search_blob(row):
    values = [
        row.get("username"),
        row.get("action"),
        row.get("action_label"),
        row.get("entity_type"),
        row.get("entity_label"),
        row.get("formatted_details"),
    ]
    return " ".join(str(v) for v in values if v)


def _bulk_entity_labels(db, logs):
    """Preload entity labels in bulk per entity_type to avoid N+1 queries."""
    ids_by_type = {}
    for log in logs:
        if not log.entity_id:
            continue
        try:
            nid = int(log.entity_id)
        except Exception:
            continue
        ids_by_type.setdefault(log.entity_type, set()).add(nid)
    labels = {}
    model_map = {
        "booking": (models.EventBooking, lambda b: f"{b.job_card_id} · {b.project.title if b.project else 'Booking'}"),
        "project": (models.ProjectEvent, lambda p: " · ".join(x for x in [p.title, (p.client.name if p.client else None), p.venue] if x)),
        "inventory": (models.InventoryItem, lambda i: f"{i.asset_code} · {i.name}"),
        "equipment_master": (models.EquipmentMaster, lambda m: f"{m.equipment_code} · {m.name}"),
        "crew": (models.CrewMember, lambda c: f"{c.employee_code} · {c.full_name}"),
        "service_job": (models.ServiceJob, lambda j: " · ".join(x for x in [j.job_number, (j.inventory_item.name if j.inventory_item else None), j.vendor_name] if x)),
        "paper": (models.OutboundPaper, lambda p: f"{p.paper_number} · {p.reference_name}"),
        "gate_pass": (models.GatePass, lambda g: " · ".join(x for x in [g.gate_pass_number, (g.booking.project.title if g.booking and g.booking.project else None)] if x)),
        "client": (models.Client, lambda c: f"{c.client_code} · {c.name}"),
        "vendor": (models.Vendor, lambda v: f"{v.vendor_code} · {v.name}"),
    }
    for etype, ids in ids_by_type.items():
        cfg = model_map.get(etype)
        if not cfg or not ids:
            continue
        Model, fmt = cfg
        rows = db.query(Model).filter(Model.id.in_(ids)).all()
        for r in rows:
            try:
                labels[(etype, str(r.id))] = fmt(r)
            except Exception:
                pass
    return labels


def _resolved_rows(db, range_key, category, start_date, end_date, username=None, action=None, search=None, sub_entity=None, sub_action=None):
    logs = _filtered_logs(db, range_key, category, start_date, end_date, username, action)
    bulk_labels = _bulk_entity_labels(db, logs)
    data = []
    for x in logs:
        row = {"id": x.id, "created_at": x.created_at.isoformat() if x.created_at else None, "username": x.username, "action": x.action, "entity_type": x.entity_type, "entity_id": x.entity_id, "details_json": x.details_json}
        row["entity_label"] = bulk_labels.get((x.entity_type, str(x.entity_id))) or _entity_label(db, x.entity_type, x.entity_id)
        row["entity_display"] = _display_entity(x.entity_type)
        row["action_label"] = ACTION_LABELS.get(x.action, str(x.action or "-").replace("_", " ").title())
        row["formatted_details"] = _format_details(x.details_json)
        row["search_text"] = _search_blob(row)
        data.append(row)
    if not data:
        data = _fallback_rows(db, category)
        for row in data:
            row["entity_label"] = _entity_label(db, row.get("entity_type"), row.get("entity_id"))
            row["entity_display"] = _display_entity(row.get("entity_type"))
            row["action_label"] = ACTION_LABELS.get(row.get("action"), str(row.get("action") or "-").replace("_", " ").title())
            row["formatted_details"] = _format_details(row.get("details_json"))
            row["search_text"] = _search_blob(row)

    if sub_entity:
        data = [row for row in data if row.get("entity_type") == sub_entity]
    effective_action = sub_action or action
    if effective_action:
        data = [row for row in data if row.get("action") == effective_action]
    if search:
        q = str(search).lower().strip()
        data = [row for row in data if q in str(row.get("search_text") or "").lower() or q in str(row.get("formatted_details") or "").lower()]
    return data


@router.get("/query", dependencies=[Depends(require_roles("admin"))])
def audit_query(range_key: str = Query("7d"), category: str = Query("all"), start_date: str | None = None, end_date: str | None = None, username: str | None = None, action: str | None = None, db: Session = Depends(get_db)):
    return _resolved_rows(db, range_key, category, start_date, end_date, username, action)


@router.get("/export/pdf", dependencies=[Depends(require_roles("admin"))])
def audit_pdf(range_key: str = Query("7d"), category: str = Query("all"), start_date: str | None = None, end_date: str | None = None, username: str | None = None, action: str | None = None, search: str | None = None, sub_entity: str | None = None, sub_action: str | None = None, screen_count: str | None = None, db: Session = Depends(get_db)):
    rows = _resolved_rows(db, range_key, category, start_date, end_date, username, action, search, sub_entity, sub_action)
    if screen_count:
        try:
            rows = rows[: max(int(screen_count), 0)]
        except Exception:
            pass
    # Cap to 250 rows to keep download responsive even on very large audit sets
    rows_for_pdf = rows[:250]
    subtitle = f"Range: {range_key} | Category: {category} | {len(rows_for_pdf)} of {len(rows)} entries"
    pdf = make_audit_pdf("Audit & Activity Log", subtitle, rows_for_pdf)
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="audit_export.pdf"'})


def _add_csv(zf, name, headers, rows):
    s = StringIO()
    writer = csv.writer(s)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    zf.writestr(name, s.getvalue())


@router.get("/export/zip", dependencies=[Depends(require_permission("users","view"))])
def audit_zip(range_key: str = Query("7d"), category: str = Query("all"), start_date: str | None = None, end_date: str | None = None, username: str | None = None, action: str | None = None, search: str | None = None, sub_entity: str | None = None, sub_action: str | None = None, screen_count: str | None = None, db: Session = Depends(get_db)):
    rows = _resolved_rows(db, range_key, category, start_date, end_date, username, action, search, sub_entity, sub_action)
    if screen_count:
        try:
            rows = rows[: max(int(screen_count), 0)]
        except Exception:
            pass
    mem = BytesIO()
    with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as zf:
        _add_csv(zf, "audit_logs.csv", ["Time", "User", "Action", "Section", "Record", "Readable Details"], [[x.get("created_at"), x.get("username"), x.get("action_label"), x.get("entity_display"), x.get("entity_label") or x.get("entity_id"), x.get("formatted_details")] for x in rows])

        if category in ["all", "papers"]:
            papers = db.query(models.OutboundPaper).order_by(models.OutboundPaper.id.desc()).all()
            _add_csv(zf, "papers.csv", ["ID","Paper Number","Paper Type","Reference","Destination","Status"], [[p.id, p.paper_number, p.paper_type, p.reference_name, p.destination, p.issue_status] for p in papers])
            gates = db.query(models.GatePass).order_by(models.GatePass.id.desc()).all()
            _add_csv(zf, "gate_passes.csv", ["ID","Gate Pass Number","Booking ID","Pass Type","Approved By","Status"], [[g.id, g.gate_pass_number, g.booking_id, g.pass_type, g.approved_by, g.status] for g in gates])

        if category in ["all", "services"]:
            jobs = db.query(models.ServiceJob).order_by(models.ServiceJob.id.desc()).all()
            _add_csv(zf, "service_jobs.csv", ["ID","Job Number","Equipment ID","Vendor","Status"], [[j.id, j.job_number, j.inventory_item_id, j.vendor_name, j.status] for j in jobs])

        if category in ["all", "bookings"]:
            bookings = db.query(models.EventBooking).order_by(models.EventBooking.id.desc()).all()
            _add_csv(zf, "bookings.csv", ["ID","Project ID","Destination","Status","Remarks"], [[b.id, b.project_id, b.destination, b.status, b.remarks] for b in bookings])

        if category in ["all", "equipment"]:
            inv = db.query(models.InventoryItem).order_by(models.InventoryItem.id.desc()).all()
            _add_csv(zf, "equipment.csv", ["ID","Asset Code","Product Code","Name","Status","Type"], [[i.id, i.asset_code, i.product_code, i.name, i.status, i.item_type] for i in inv])

        if category in ["all", "manpower"]:
            crew = db.query(models.CrewMember).order_by(models.CrewMember.id.desc()).all()
            _add_csv(zf, "manpower.csv", ["ID","Employee Code","Full Name","Role","Status","Type"], [[c.id, c.employee_code, c.full_name, c.role, c.status, c.manpower_type] for c in crew])

    mem.seek(0)
    return StreamingResponse(mem, media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="audit_export.zip"'})


@router.post("/reset-all", dependencies=[Depends(require_roles("admin"))])
def reset_all(current_user = Depends(get_current_user)):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_session = SessionLocal()
    try:
        seed_db(seed_session)
        audit(seed_session, current_user.username, "reset", "system", details={"message": "All data erased and reseeded"})
        seed_session.commit()
    finally:
        seed_session.close()
    return {"ok": True}
