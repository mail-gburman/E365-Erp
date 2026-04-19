import json
from collections import Counter, defaultdict
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..auth import get_current_user
from ..permissions import require_document_permission, require_permission, resolved_permissions
from .. import models, schemas
from ..audit import audit
from ..utils import aggregate_equipment_rows, make_account_invoice_pdf

router = APIRouter(prefix="/accounts", tags=["Accounts"])

DAY_LABELS = {
    "travel_day": "Travel Day",
    "setup_date": "Setup Day",
    "technical_date": "Technical Day",
    "shoot_date": "Shoot Day",
    "off_day": "Off Day",
    "end_day": "Packup / End Day",
    "return_day": "Return Day",
}

DAY_DEFAULT_RATES = {
    "travel_day": 3500,
    "setup_date": 4500,
    "technical_date": 4500,
    "shoot_date": 12000,
    "off_day": 2500,
    "end_day": 6000,
    "return_day": 3500,
}


def _can(user, action: str) -> bool:
    if user.role == "admin":
        return True
    return bool(resolved_permissions(user).get("accounts", {}).get(action))


def _invoice_number(db: Session) -> str:
    last = db.query(models.AccountInvoice).order_by(models.AccountInvoice.id.desc()).first()
    return f"INV-{(last.id + 1) if last else 1:05d}"


def _normalized_project_dates(project: models.ProjectEvent) -> dict[str, list[date]]:
    dates: dict[str, list[date]] = {key: [] for key in DAY_LABELS}
    aliases = {"start_date": "shoot_date", "end_date": "end_day"}
    for row in project.dates or []:
        key = aliases.get(row.date_type, row.date_type)
        if key in dates and row.date_value not in dates[key]:
            dates[key].append(row.date_value)
    if project.setup_date and not dates["setup_date"]:
        dates["setup_date"].append(project.setup_date)
    if project.shoot_start and not dates["shoot_date"]:
        dates["shoot_date"].append(project.shoot_start.date())
    if project.shoot_end and not dates["end_day"]:
        dates["end_day"].append(project.shoot_end.date())
    if project.block_start and not dates["travel_day"]:
        dates["travel_day"].append(project.block_start.date())
    if project.block_end and not dates["return_day"]:
        dates["return_day"].append(project.block_end.date())
    return {key: sorted(values) for key, values in dates.items()}


def _booking_equipment_summary(bookings: list[models.EventBooking]) -> list[dict]:
    rows = []
    for booking in bookings:
        for row in booking.equipment:
            item = row.inventory_item
            if item:
                rows.append({
                    "id": item.id,
                    "name": item.name,
                    "asset_code": item.asset_code,
                    "serial_number": item.serial_number,
                    "item_type": item.item_type,
                    "owner_type": item.owner_type,
                    "job_card_id": booking.job_card_id,
                })
    return aggregate_equipment_rows(rows)


def _root_booking(db: Session, booking: models.EventBooking) -> models.EventBooking:
    if booking.parent_booking_id:
        parent = db.query(models.EventBooking).filter(models.EventBooking.id == booking.parent_booking_id).first()
        return parent or booking
    return booking


def _booking_group(db: Session, booking: models.EventBooking) -> list[models.EventBooking]:
    root = _root_booking(db, booking)
    children = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.equipment).joinedload(models.BookingEquipment.inventory_item),
        joinedload(models.EventBooking.crew).joinedload(models.BookingCrew.crew_member),
    ).filter(models.EventBooking.parent_booking_id == root.id).order_by(models.EventBooking.id.asc()).all()
    return [root] + children


def _estimate_for_booking(db: Session, booking: models.EventBooking, off_days_payable: bool = False) -> dict:
    booking = _root_booking(db, booking)
    project = booking.project
    if not project:
        raise HTTPException(status_code=400, detail="Booking has no linked project.")

    related_bookings = _booking_group(db, booking)
    dates = _normalized_project_dates(project)
    supplementary_cards = [b.job_card_id for b in related_bookings if b.id != booking.id]
    equipment_summary = _booking_equipment_summary(related_bookings)
    equipment_qty = sum(int(item.get("quantity") or 0) for item in equipment_summary)
    accessory_qty = sum(int(item.get("quantity") or 0) for item in equipment_summary if "access" in (item.get("item_type") or "").lower())
    main_equipment_qty = max(equipment_qty - accessory_qty, 0)
    crew_rows = []
    seen_crew_ids = set()
    for related in related_bookings:
        for row in related.crew:
            if row.crew_member and row.crew_member.id not in seen_crew_ids:
                crew_rows.append(row.crew_member)
                seen_crew_ids.add(row.crew_member.id)
    distinct_calendar_days = sorted({day for values in dates.values() for day in values})
    off_day_dates = set(dates["off_day"])
    payout_calendar_days = [
        day for day in distinct_calendar_days
        if off_days_payable or day not in off_day_dates
    ]
    manpower_days = len(payout_calendar_days)

    line_items = []
    day_amount = 0.0
    for key, label in DAY_LABELS.items():
        qty = len(dates[key])
        if not qty:
            continue
        rate = DAY_DEFAULT_RATES[key]
        amount = float(qty * rate)
        day_amount += amount
        line_items.append({
            "category": "day",
            "label": label,
            "date_type": key,
            "quantity": qty,
            "rate": rate,
            "amount": amount,
            "dates": [d.isoformat() for d in dates[key]],
        })

    equipment_rate = 1800
    accessory_rate = 350
    equipment_amount = float((main_equipment_qty * equipment_rate + accessory_qty * accessory_rate) * max(1, len(dates["shoot_date"]) + len(dates["technical_date"])))
    if equipment_qty:
        line_items.append({
            "category": "equipment",
            "label": "Equipment rental",
            "quantity": equipment_qty,
            "rate": equipment_rate,
            "amount": equipment_amount,
            "details": equipment_summary,
        })

    manpower_payout_items = []
    manpower_bill_amount = 0.0
    manpower_payout_amount = 0.0
    role_counts = Counter(member.role or "Crew" for member in crew_rows)
    for role, count in role_counts.items():
        bill_rate = 4500 if "dop" in role.lower() or "camera" in role.lower() else 3200
        payout_rate = 3000 if "dop" in role.lower() or "camera" in role.lower() else 2200
        qty = count * max(1, manpower_days)
        bill_amount = float(qty * bill_rate)
        payout_amount = float(qty * payout_rate)
        manpower_bill_amount += bill_amount
        manpower_payout_amount += payout_amount
        line_items.append({
            "category": "manpower",
            "label": f"Manpower - {role}",
            "quantity": qty,
            "rate": bill_rate,
            "amount": bill_amount,
        })
        manpower_payout_items.append({
            "role": role,
            "crew_count": count,
            "days": manpower_days,
            "payout_rate": payout_rate,
            "amount": payout_amount,
        })

    logistics_amount = float((len(dates["travel_day"]) + len(dates["return_day"])) * 2500)
    if logistics_amount:
        line_items.append({
            "category": "logistics",
            "label": "Logistics / vehicle movement",
            "quantity": len(dates["travel_day"]) + len(dates["return_day"]),
            "rate": 2500,
            "amount": logistics_amount,
        })

    subtotal = day_amount + equipment_amount + manpower_bill_amount + logistics_amount
    tax = round(subtotal * 0.18, 2)
    total = round(subtotal + tax, 2)
    return {
        "booking_id": booking.id,
        "job_card_id": booking.job_card_id,
        "supplementary_job_cards": supplementary_cards,
        "project_title": project.title,
        "client_name": project.client.name if project.client else "-",
        "destination": booking.destination,
        "booking_status": booking.status,
        "project_status": project.status,
        "billing_days": {key: {"label": DAY_LABELS[key], "count": len(values), "dates": [d.isoformat() for d in values]} for key, values in dates.items()},
        "activity_billing_units": sum(len(values) for values in dates.values()),
        "distinct_calendar_days": len(distinct_calendar_days),
        "distinct_calendar_dates": [d.isoformat() for d in distinct_calendar_days],
        "off_days_payable": off_days_payable,
        "manpower_payout_days": manpower_days,
        "manpower_payout_dates": [d.isoformat() for d in payout_calendar_days],
        "equipment_summary": equipment_summary,
        "crew": [{"id": member.id, "name": member.full_name, "role": member.role, "manpower_type": member.manpower_type} for member in crew_rows],
        "line_items": line_items,
        "payout_items": manpower_payout_items,
        "equipment_amount": round(equipment_amount + day_amount, 2),
        "manpower_amount": round(manpower_bill_amount, 2),
        "logistics_amount": round(logistics_amount, 2),
        "manpower_payout_amount": round(manpower_payout_amount, 2),
        "subtotal_amount": round(subtotal, 2),
        "tax_amount": tax,
        "total_amount": total,
        "net_margin_amount": round(subtotal - manpower_payout_amount, 2),
    }


def _serialize_invoice(invoice: models.AccountInvoice) -> dict:
    subtotal = float(invoice.subtotal_amount or 0)
    payout = float(invoice.manpower_payout_amount or 0)
    received = float(invoice.amount_received or 0)
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "booking_id": invoice.booking_id,
        "billing_mode": invoice.billing_mode,
        "status": invoice.status,
        "package_amount": invoice.package_amount or 0,
        "equipment_amount": invoice.equipment_amount or 0,
        "manpower_amount": invoice.manpower_amount or 0,
        "logistics_amount": invoice.logistics_amount or 0,
        "other_amount": invoice.other_amount or 0,
        "discount_amount": invoice.discount_amount or 0,
        "tax_percent": invoice.tax_percent or 0,
        "subtotal_amount": invoice.subtotal_amount or 0,
        "tax_amount": invoice.tax_amount or 0,
        "total_amount": invoice.total_amount or 0,
        "manpower_payout_amount": invoice.manpower_payout_amount or 0,
        "net_margin_amount": round(subtotal - payout, 2),
        "off_days_payable": bool(invoice.off_days_payable),
        "amount_received": received,
        "amount_due": round(float(invoice.total_amount or 0) - received, 2),
        "payment_received_at": invoice.payment_received_at.isoformat() if invoice.payment_received_at else None,
        "payment_mode": invoice.payment_mode,
        "payment_details": invoice.payment_details,
        "payment_committed_date": invoice.payment_committed_date.isoformat() if invoice.payment_committed_date else None,
        "line_items": json.loads(invoice.line_items_json or "[]"),
        "payout_items": json.loads(invoice.payout_json or "[]"),
        "notes": invoice.notes,
        "created_by": invoice.created_by,
        "updated_by": invoice.updated_by,
        "tally_status": _tally_status_for_invoice(invoice),
    }


def _tally_status_for_invoice(invoice: models.AccountInvoice) -> dict:
    try:
        job = sorted(
            [job for job in getattr(invoice, "_tally_jobs", [])],
            key=lambda item: item.id,
            reverse=True,
        )[0]
    except Exception:
        return {"status": "not_synced", "voucher_number": None, "last_sync_time": None, "last_error": None}
    result = getattr(job, "_latest_tally_result", None)
    return {
        "status": job.status,
        "voucher_number": result.tally_voucher_number if result else None,
        "last_sync_time": (job.processed_at or job.updated_at or job.created_at).isoformat() if (job.processed_at or job.updated_at or job.created_at) else None,
        "last_error": job.last_error,
    }


def _apply_invoice_payload(invoice: models.AccountInvoice, payload: schemas.AccountInvoicePayload, username: str):
    line_items = payload.line_items or []
    line_total = sum(float(item.get("amount") or 0) for item in line_items)
    if payload.billing_mode == "package":
        subtotal = float(payload.package_amount or 0) + float(payload.other_amount or 0)
    elif payload.billing_mode == "line_item":
        # STRICT: line-item billing MUST sum from line items only. Ignore package_amount entirely.
        subtotal = line_total + float(payload.other_amount or 0)
    else:
        subtotal = (line_total or float(payload.equipment_amount + payload.manpower_amount + payload.logistics_amount)) + float(payload.other_amount or 0)
    subtotal = max(0.0, subtotal - float(payload.discount_amount or 0))
    tax_amount = round(subtotal * (float(payload.tax_percent or 0) / 100), 2)
    total = round(subtotal + tax_amount, 2)
    payout = float(payload.manpower_payout_amount or 0)
    invoice.updated_at = datetime.utcnow()
    invoice.updated_by = username
    invoice.billing_mode = payload.billing_mode
    invoice.status = payload.status
    invoice.package_amount = float(payload.package_amount or 0)
    invoice.equipment_amount = float(payload.equipment_amount or 0)
    invoice.manpower_amount = float(payload.manpower_amount or 0)
    invoice.logistics_amount = float(payload.logistics_amount or 0)
    invoice.other_amount = float(payload.other_amount or 0)
    invoice.discount_amount = float(payload.discount_amount or 0)
    invoice.tax_percent = float(payload.tax_percent or 0)
    invoice.subtotal_amount = round(subtotal, 2)
    invoice.tax_amount = tax_amount
    invoice.total_amount = total
    invoice.manpower_payout_amount = payout
    invoice.net_margin_amount = round(subtotal - payout, 2)
    invoice.off_days_payable = bool(payload.off_days_payable)
    invoice.amount_received = float(payload.amount_received or 0)
    invoice.payment_received_at = payload.payment_received_at
    invoice.payment_mode = payload.payment_mode
    invoice.payment_details = payload.payment_details
    invoice.payment_committed_date = payload.payment_committed_date
    invoice.line_items_json = json.dumps(line_items, default=str)
    invoice.payout_json = json.dumps(payload.payout_items or [], default=str)
    invoice.notes = payload.notes


@router.get("/bookings", dependencies=[Depends(require_permission("accounts", "view"))])
def billable_bookings(db: Session = Depends(get_db)):
    bookings = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.project).joinedload(models.ProjectEvent.client),
        joinedload(models.EventBooking.project).joinedload(models.ProjectEvent.dates),
    ).filter(models.EventBooking.parent_booking_id.is_(None)).order_by(models.EventBooking.id.desc()).all()
    invoices = {i.booking_id: i for i in db.query(models.AccountInvoice).all()}
    if invoices:
        invoice_ids = [invoice.id for invoice in invoices.values()]
        jobs = db.query(models.TallySyncJob).filter(
            models.TallySyncJob.source_document_type == "account_invoice",
            models.TallySyncJob.source_document_id.in_(invoice_ids),
        ).order_by(models.TallySyncJob.id.desc()).all()
        results = db.query(models.TallySyncResult).filter(models.TallySyncResult.sync_job_id.in_([job.id for job in jobs] or [0])).order_by(models.TallySyncResult.id.desc()).all()
        result_by_job = {}
        for result in results:
            result_by_job.setdefault(result.sync_job_id, result)
        jobs_by_invoice = {}
        for job in jobs:
            job._latest_tally_result = result_by_job.get(job.id)
            jobs_by_invoice.setdefault(job.source_document_id, []).append(job)
        for invoice in invoices.values():
            invoice._tally_jobs = jobs_by_invoice.get(invoice.id, [])
    out = []
    for booking in bookings:
        project = booking.project
        supplementary_cards = [
            row.job_card_id for row in db.query(models.EventBooking.job_card_id)
            .filter(models.EventBooking.parent_booking_id == booking.id)
            .order_by(models.EventBooking.id.asc())
            .all()
        ]
        invoice = invoices.get(booking.id)
        out.append({
            "id": booking.id,
            "job_card_id": booking.job_card_id,
            "supplementary_job_cards": supplementary_cards,
            "project_title": project.title if project else "-",
            "client_name": project.client.name if project and project.client else "-",
            "status": booking.status,
            "project_status": project.status if project else "-",
            "destination": booking.destination,
            "invoice": _serialize_invoice(invoice) if invoice else None,
        })
    return out


@router.get("/estimate/{booking_id}", dependencies=[Depends(require_permission("accounts", "view"))])
def estimate_booking(booking_id: int, off_days_payable: bool = Query(False), db: Session = Depends(get_db)):
    booking = db.query(models.EventBooking).options(
        joinedload(models.EventBooking.project).joinedload(models.ProjectEvent.client),
        joinedload(models.EventBooking.project).joinedload(models.ProjectEvent.dates),
        joinedload(models.EventBooking.equipment).joinedload(models.BookingEquipment.inventory_item),
        joinedload(models.EventBooking.crew).joinedload(models.BookingCrew.crew_member),
    ).filter(models.EventBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    booking = _root_booking(db, booking)
    invoice = db.query(models.AccountInvoice).filter(models.AccountInvoice.booking_id == booking.id).first()
    if invoice:
        off_days_payable = bool(invoice.off_days_payable)
    estimate = _estimate_for_booking(db, booking, off_days_payable=off_days_payable)
    estimate["invoice"] = _serialize_invoice(invoice) if invoice else None
    return estimate


@router.get("/invoices", dependencies=[Depends(require_permission("accounts", "view"))])
def list_invoices(db: Session = Depends(get_db)):
    return [_serialize_invoice(invoice) for invoice in db.query(models.AccountInvoice).order_by(models.AccountInvoice.id.desc()).all()]


def _procurement_bill_amount(row: models.ProcurementOrder) -> float:
    if row.bill_amount:
        return float(row.bill_amount or 0)
    base = {"equipment": 12000, "accessory": 1500, "manpower": 5000, "consumable": 800}.get(row.item_type, 1000)
    return float(base * max(1, row.quantity or 1)) if row.status != "cancelled" else 0.0


def _service_bill_amount(row: models.ServiceJob) -> float:
    if row.service_bill_amount:
        return float(row.service_bill_amount or 0)
    if row.status == "cancelled":
        return 0.0
    return 3500.0 if row.status == "completed" else 2500.0


def _ledger_payment_index(db: Session) -> dict[str, dict]:
    grouped: dict[str, dict] = defaultdict(lambda: {"paid": 0.0, "latest_date": None, "latest_mode": "-", "details": "-"})
    payments = db.query(models.AccountLedgerPayment).order_by(models.AccountLedgerPayment.created_at.asc()).all()
    for payment in payments:
        key = f"{payment.entry_type}:{payment.reference}"
        grouped[key]["paid"] += float(payment.amount or 0)
        grouped[key]["latest_date"] = payment.payment_date.isoformat() if payment.payment_date else None
        grouped[key]["latest_mode"] = payment.payment_mode or "-"
        grouped[key]["details"] = payment.details or "-"
    return grouped


@router.get("/ledger", dependencies=[Depends(require_permission("accounts", "view"))])
def accounts_ledger(db: Session = Depends(get_db)):
    payments = _ledger_payment_index(db)
    invoices = db.query(models.AccountInvoice).options(
        joinedload(models.AccountInvoice.booking).joinedload(models.EventBooking.project).joinedload(models.ProjectEvent.client)
    ).order_by(models.AccountInvoice.id.desc()).all()
    client_rows = []
    manpower_rows = []
    for invoice in invoices:
        serialized = _serialize_invoice(invoice)
        booking = invoice.booking
        project = booking.project if booking else None
        client = project.client if project and project.client else None
        client_rows.append({
            "invoice_number": invoice.invoice_number,
            "job_card_id": booking.job_card_id if booking else "-",
            "client_name": client.name if client else "-",
            "total_amount": invoice.total_amount or 0,
            "amount_received": serialized["amount_received"],
            "amount_due": serialized["amount_due"],
            "payment_mode": invoice.payment_mode or "-",
            "payment_received_at": serialized["payment_received_at"],
            "payment_committed_date": serialized["payment_committed_date"],
            "details": invoice.payment_details or invoice.notes or "-",
            "status": invoice.status,
        })
        for payout in json.loads(invoice.payout_json or "[]"):
            due = float(payout.get("amount") or 0)
            pay_key = f"manpower:{invoice.invoice_number}|{payout.get('role') or 'Crew'}"
            paid = float(payments.get(pay_key, {}).get("paid") or 0)
            manpower_rows.append({
                "invoice_number": invoice.invoice_number,
                "job_card_id": booking.job_card_id if booking else "-",
                "role": payout.get("role") or "Crew",
                "reference": f"{invoice.invoice_number}|{payout.get('role') or 'Crew'}",
                "crew_count": payout.get("crew_count") or 0,
                "days": payout.get("days") or 0,
                "amount_due": due,
                "amount_paid": paid,
                "balance_due": round(due - paid, 2),
                "payment_mode": payments.get(pay_key, {}).get("latest_mode") or "-",
                "payment_date": payments.get(pay_key, {}).get("latest_date"),
                "details": payments.get(pay_key, {}).get("details") or "Internal payout pending entry",
            })

    vendor_rows = []
    for row in db.query(models.ProcurementOrder).options(joinedload(models.ProcurementOrder.vendor)).order_by(models.ProcurementOrder.id.desc()).all():
        bill = _procurement_bill_amount(row)
        paid = float(row.paid_amount or 0)
        vendor_rows.append({
            "reference": row.po_number,
            "vendor_name": row.vendor.name if row.vendor else "-",
            "category": row.item_type,
            "status": row.status,
            "bill_amount": bill,
            "paid_amount": paid,
            "due_amount": round(bill - paid, 2),
            "payment_mode": row.payment_mode or "-",
            "payment_date": row.payment_date.isoformat() if row.payment_date else None,
            "details": row.payment_details or row.notes or "-",
        })

    service_rows = []
    for row in db.query(models.ServiceJob).options(joinedload(models.ServiceJob.vendor)).order_by(models.ServiceJob.id.desc()).all():
        bill = _service_bill_amount(row)
        paid = float(row.service_paid_amount or 0)
        service_rows.append({
            "reference": row.job_number,
            "vendor_name": row.vendor_name or (row.vendor.name if row.vendor else "-"),
            "status": row.status,
            "bill_amount": bill,
            "paid_amount": paid,
            "due_amount": round(bill - paid, 2),
            "payment_mode": row.service_payment_mode or "-",
            "payment_date": row.service_payment_date.isoformat() if row.service_payment_date else None,
            "details": row.service_payment_details or row.remarks or row.problem_reported or "-",
        })

    total_receivable = sum(row["total_amount"] for row in client_rows)
    total_received = sum(row["amount_received"] for row in client_rows)
    manpower_due = sum(row["amount_due"] for row in manpower_rows)
    manpower_paid = sum(row["amount_paid"] for row in manpower_rows)
    manpower_balance = manpower_due - manpower_paid
    vendor_due = sum(row["due_amount"] for row in vendor_rows)
    service_due = sum(row["due_amount"] for row in service_rows)
    return {
        "summary": {
            "client_total_billed": round(total_receivable, 2),
            "client_received": round(total_received, 2),
            "client_due": round(total_receivable - total_received, 2),
            "manpower_due": round(manpower_balance, 2),
            "vendor_due": round(vendor_due, 2),
            "service_due": round(service_due, 2),
            "net_cash_position": round(total_received - manpower_balance - vendor_due - service_due, 2),
        },
        "client_receivables": client_rows,
        "manpower_payouts": manpower_rows,
        "vendor_bills": vendor_rows,
        "service_bills": service_rows,
    }


@router.post("/barter", dependencies=[Depends(require_permission("accounts", "add"))])
def record_barter(payload: dict, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """
    Offset client dues with vendor dues (or vice versa) when the same party plays both roles.
    Creates two balancing AccountLedgerPayment entries.
    Payload: { client_reference, vendor_reference, amount, notes }
    """
    try:
        amount = float(payload.get("amount") or 0)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid amount for barter.")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Barter amount must be positive.")
    client_ref = payload.get("client_reference") or payload.get("client_id")
    vendor_ref = payload.get("vendor_reference") or payload.get("vendor_id")
    if not client_ref or not vendor_ref:
        raise HTTPException(status_code=400, detail="Both client_reference and vendor_reference are required.")
    notes = payload.get("notes") or "Barter offset"
    today = date.today()
    invoice = db.query(models.AccountInvoice).filter(models.AccountInvoice.invoice_number == str(client_ref)).first()
    if invoice:
        invoice.amount_received = float(invoice.amount_received or 0) + amount
        invoice.payment_received_at = today
        invoice.payment_mode = "barter"
        invoice.payment_details = f"Barter with vendor {vendor_ref}: {notes}"
        if invoice.amount_received >= float(invoice.total_amount or 0):
            invoice.status = "paid"
    vendor_bill = db.query(models.ProcurementOrder).filter(models.ProcurementOrder.po_number == str(vendor_ref)).first()
    if vendor_bill:
        vendor_bill.paid_amount = float(vendor_bill.paid_amount or 0) + amount
        vendor_bill.payment_date = today
        vendor_bill.payment_mode = "barter"
        vendor_bill.payment_details = f"Barter with client {client_ref}: {notes}"
    credit_client = models.AccountLedgerPayment(
        entry_type="client", reference=str(client_ref), amount=amount,
        payment_date=today, payment_mode="barter", details=f"Barter with vendor {vendor_ref}: {notes}",
        created_by=current_user.username,
    )
    credit_vendor = models.AccountLedgerPayment(
        entry_type="vendor", reference=str(vendor_ref), amount=amount,
        payment_date=today, payment_mode="barter", details=f"Barter with client {client_ref}: {notes}",
        created_by=current_user.username,
    )
    db.add(credit_client)
    db.add(credit_vendor)
    audit(db, current_user.username, "barter", "account_ledger", entity_id=f"{client_ref}↔{vendor_ref}", details={"amount": amount, "notes": notes})
    db.commit()
    return {"ok": True, "amount": amount, "client_reference": client_ref, "vendor_reference": vendor_ref}


@router.post("/ledger-payments", dependencies=[Depends(require_permission("accounts", "add"))])
def record_ledger_payment(payload: schemas.AccountLedgerPaymentPayload, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if payload.entry_type not in {"client", "manpower", "vendor", "service"}:
        raise HTTPException(status_code=400, detail="Invalid ledger payment type.")
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")

    if payload.entry_type == "client":
        invoice = db.query(models.AccountInvoice).filter(models.AccountInvoice.invoice_number == payload.reference).first()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found.")
        invoice.amount_received = float(invoice.amount_received or 0) + amount
        invoice.payment_received_at = payload.payment_date
        invoice.payment_mode = payload.payment_mode
        invoice.payment_details = payload.details
        if invoice.amount_received >= float(invoice.total_amount or 0):
            invoice.status = "paid"
    elif payload.entry_type == "vendor":
        po = db.query(models.ProcurementOrder).filter(models.ProcurementOrder.po_number == payload.reference).first()
        if not po:
            raise HTTPException(status_code=404, detail="Vendor bill reference not found.")
        po.paid_amount = float(po.paid_amount or 0) + amount
        po.payment_date = payload.payment_date
        po.payment_mode = payload.payment_mode
        po.payment_details = payload.details
    elif payload.entry_type == "service":
        service = db.query(models.ServiceJob).filter(models.ServiceJob.job_number == payload.reference).first()
        if not service:
            raise HTTPException(status_code=404, detail="Service bill reference not found.")
        service.service_paid_amount = float(service.service_paid_amount or 0) + amount
        service.service_payment_date = payload.payment_date
        service.service_payment_mode = payload.payment_mode
        service.service_payment_details = payload.details

    payment = models.AccountLedgerPayment(
        entry_type=payload.entry_type,
        reference=payload.reference,
        amount=amount,
        payment_date=payload.payment_date,
        payment_mode=payload.payment_mode,
        details=payload.details,
        created_by=current_user.username,
    )
    db.add(payment)
    audit(db, current_user.username, "record_payment", "account_ledger", entity_id=payload.reference, details={"type": payload.entry_type, "amount": amount})
    db.commit()
    return accounts_ledger(db)


@router.post("/invoices")
def save_invoice(payload: schemas.AccountInvoicePayload, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not _can(current_user, "add"):
        raise HTTPException(status_code=403, detail="Permission denied for accounts.add")
    booking = db.query(models.EventBooking).filter(models.EventBooking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    booking = _root_booking(db, booking)
    payload.booking_id = booking.id
    invoice = db.query(models.AccountInvoice).filter(models.AccountInvoice.booking_id == booking.id).first()
    if invoice and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can modify an existing bill.")
    if not invoice:
        invoice = models.AccountInvoice(invoice_number=_invoice_number(db), booking_id=payload.booking_id, created_by=current_user.username)
        db.add(invoice)
    _apply_invoice_payload(invoice, payload, current_user.username)
    audit(db, current_user.username, "upsert", "account_invoice", entity_id=payload.booking_id, details={"billing_mode": payload.billing_mode, "total": invoice.total_amount})
    db.commit()
    db.refresh(invoice)
    return _serialize_invoice(invoice)


@router.put("/invoices/{invoice_id}")
def update_invoice(invoice_id: int, payload: schemas.AccountInvoicePayload, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can modify bills.")
    invoice = db.query(models.AccountInvoice).filter(models.AccountInvoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    _apply_invoice_payload(invoice, payload, current_user.username)
    audit(db, current_user.username, "update", "account_invoice", entity_id=invoice.id, details={"billing_mode": payload.billing_mode, "total": invoice.total_amount})
    db.commit()
    db.refresh(invoice)
    return _serialize_invoice(invoice)


@router.get("/invoices/{invoice_id}/pdf", dependencies=[Depends(require_permission("accounts", "view")), Depends(require_document_permission("invoice", "download"))])
def invoice_pdf(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(models.AccountInvoice).options(
        joinedload(models.AccountInvoice.booking).joinedload(models.EventBooking.project).joinedload(models.ProjectEvent.client)
    ).filter(models.AccountInvoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    booking = invoice.booking
    project = booking.project if booking else None
    client_name = project.client.name if project and project.client else "-"
    pdf = make_account_invoice_pdf(
        invoice,
        booking,
        project,
        client_name=client_name,
        line_items=json.loads(invoice.line_items_json or "[]"),
        payout_items=json.loads(invoice.payout_json or "[]"),
    )
    safe_name = (invoice.invoice_number or f"invoice_{invoice.id}").replace("/", "-")
    return StreamingResponse(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'})
