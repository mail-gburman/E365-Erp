from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import joinedload

from ... import models
from .mapping import mapping_dict

ACTIVE_STATUSES = {"pending", "processing", "generated_for_import", "success"}


def _iso(value):
    return value.isoformat() if value else None


def load_invoice(db, invoice_id: int):
    return db.query(models.AccountInvoice).options(
        joinedload(models.AccountInvoice.booking)
            .joinedload(models.EventBooking.project)
            .joinedload(models.ProjectEvent.client),
        joinedload(models.AccountInvoice.booking)
            .joinedload(models.EventBooking.equipment)
            .joinedload(models.BookingEquipment.inventory_item),
    ).filter(models.AccountInvoice.id == invoice_id).first()


def _safe_json(raw: str | None, default):
    try:
        return json.loads(raw or "")
    except Exception:
        return default


def _invoice_payload(db, invoice: models.AccountInvoice, job_type: str) -> dict[str, Any]:
    booking = invoice.booking
    project = booking.project if booking else None
    client = project.client if project and project.client else None
    line_items = _safe_json(invoice.line_items_json, [])
    payout_items = _safe_json(invoice.payout_json, [])
    equipment = []
    if booking:
        for row in booking.equipment or []:
            item = row.inventory_item
            if item:
                equipment.append({
                    "name": item.name,
                    "asset_code": item.asset_code,
                    "product_code": item.product_code,
                    "serial_number": item.serial_number,
                    "category": item.category,
                    "item_type": item.item_type,
                })
    received = float(invoice.amount_received or 0)
    total = float(invoice.total_amount or 0)
    payload = {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "job_type": job_type,
        "date": _iso(invoice.created_at),
        "booking_id": invoice.booking_id,
        "job_card_id": booking.job_card_id if booking else None,
        "booking_status": booking.status if booking else None,
        "project_title": project.title if project else None,
        "client_name": client.name if client else "Client",
        "client_gst_number": getattr(client, "gst_number", None) if client else None,
        "client_billing_address": getattr(client, "billing_address", None) if client else None,
        "billing_mode": invoice.billing_mode,
        "invoice_status": invoice.status,
        "package_amount": float(invoice.package_amount or 0),
        "equipment_amount": float(invoice.equipment_amount or 0),
        "manpower_amount": float(invoice.manpower_amount or 0),
        "logistics_amount": float(invoice.logistics_amount or 0),
        "other_amount": float(invoice.other_amount or 0),
        "discount_amount": float(invoice.discount_amount or 0),
        "subtotal_amount": float(invoice.subtotal_amount or 0),
        "tax_percent": float(invoice.tax_percent or 0),
        "tax_amount": float(invoice.tax_amount or 0),
        "total_amount": total,
        "amount_received": received,
        "amount_due": round(total - received, 2),
        "payment_mode": invoice.payment_mode,
        "payment_details": invoice.payment_details,
        "payment_received_at": _iso(invoice.payment_received_at),
        "notes": invoice.notes,
        "line_items": line_items,
        "payout_items": payout_items,
        "equipment": equipment,
        "mapping": mapping_dict(db),
    }
    if job_type == "receipt":
        payload["receipt_amount"] = received
        payload["receipt_date"] = _iso(invoice.payment_received_at) or _iso(datetime.utcnow())
    return payload


def _payload_hash(job_type: str, payload: dict[str, Any]) -> str:
    raw = json.dumps({"job_type": job_type, "payload": payload}, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def create_sync_job(db, invoice: models.AccountInvoice, job_type: str, username: str, force: bool = False):
    payload = _invoice_payload(db, invoice, job_type)
    digest = _payload_hash(job_type, payload)
    if not force:
        existing = db.query(models.TallySyncJob).filter(
            models.TallySyncJob.source_document_type == "account_invoice",
            models.TallySyncJob.source_document_id == invoice.id,
            models.TallySyncJob.job_type == job_type,
            models.TallySyncJob.payload_hash == digest,
            models.TallySyncJob.status.in_(ACTIVE_STATUSES),
        ).order_by(models.TallySyncJob.id.desc()).first()
        if existing:
            return existing
    job = models.TallySyncJob(
        org_id="default",
        job_type=job_type,
        source_document_type="account_invoice",
        source_document_id=invoice.id,
        source_document_no=invoice.invoice_number,
        payload_json=json.dumps(payload, default=str),
        payload_hash=digest,
        status="pending",
        retry_count=0,
        created_by=username,
        next_attempt_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def claim_job(db, job_id: int, connector: models.TallyConnector):
    job = db.query(models.TallySyncJob).filter(models.TallySyncJob.id == job_id).first()
    if not job:
        raise ValueError("Sync job not found.")
    if job.status not in {"pending", "failed"}:
        raise ValueError(f"Sync job is already {job.status}.")
    if job.next_attempt_at and job.next_attempt_at > datetime.utcnow():
        raise ValueError("Sync job is not ready for retry yet.")
    job.status = "processing"
    job.connector_id = connector.id
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job


def mark_failed(db, job: models.TallySyncJob, error: str, retryable: bool = True):
    job.retry_count = int(job.retry_count or 0) + 1
    job.last_error = error
    job.updated_at = datetime.utcnow()
    job.processed_at = datetime.utcnow()
    if retryable and job.retry_count < 5:
        job.status = "pending"
        job.next_attempt_at = datetime.utcnow() + timedelta(minutes=min(30, 2 ** job.retry_count))
    else:
        job.status = "failed"
        job.next_attempt_at = None
    db.commit()
    db.refresh(job)
    return job


def latest_status(db, invoice_id: int) -> dict[str, Any]:
    invoice = db.query(models.AccountInvoice).filter(models.AccountInvoice.id == invoice_id).first()
    if not invoice:
        return {"status": "not_found", "message": "Invoice not found."}
    job = db.query(models.TallySyncJob).filter(
        models.TallySyncJob.source_document_type == "account_invoice",
        models.TallySyncJob.source_document_id == invoice_id,
    ).order_by(models.TallySyncJob.id.desc()).first()
    if not job:
        return {"status": "not_synced", "invoice_id": invoice_id, "invoice_number": invoice.invoice_number}
    result = db.query(models.TallySyncResult).filter(
        models.TallySyncResult.sync_job_id == job.id,
    ).order_by(models.TallySyncResult.id.desc()).first()
    return {
        "status": job.status,
        "job_id": job.id,
        "job_type": job.job_type,
        "invoice_id": invoice_id,
        "invoice_number": invoice.invoice_number,
        "retry_count": job.retry_count,
        "last_error": job.last_error,
        "voucher_number": result.tally_voucher_number if result else None,
        "message": result.normalized_message if result else None,
        "processed_at": _iso(job.processed_at),
        "updated_at": _iso(job.updated_at),
    }
