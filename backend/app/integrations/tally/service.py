import hashlib
import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session, joinedload
from ... import models
from .mapping import get_mapping_dict

def payload_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()

def invoice_payload(db: Session, invoice: models.AccountInvoice) -> dict:
    booking = invoice.booking
    project = booking.project if booking else None
    client = project.client if project and project.client else None
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_date": invoice.created_at.date().isoformat() if invoice.created_at else None,
        "source_document_no": invoice.invoice_number,
        "job_card_id": booking.job_card_id if booking else None,
        "client_id": client.id if client else None,
        "client_name": client.name if client else "-",
        "project_title": project.title if project else "-",
        "subtotal_amount": invoice.subtotal_amount or 0,
        "tax_amount": invoice.tax_amount or 0,
        "total_amount": invoice.total_amount or 0,
        "line_items": json.loads(invoice.line_items_json or "[]"),
        "narration": invoice.notes or f"KPS ERP invoice {invoice.invoice_number}",
        "mapping": get_mapping_dict(db, "default", {"client_id": client.id if client else None, "client_name": client.name if client else None}),
    }

def receipt_payload(db: Session, invoice: models.AccountInvoice) -> dict:
    payload = invoice_payload(db, invoice)
    payload.update({
        "amount": invoice.amount_received or 0,
        "payment_date": invoice.payment_received_at.isoformat() if invoice.payment_received_at else None,
        "payment_mode": invoice.payment_mode,
        "details": invoice.payment_details,
        "reference": invoice.invoice_number,
    })
    return payload

def latest_status(db: Session, invoice_id: int) -> dict:
    job = db.query(models.TallySyncJob).filter(
        models.TallySyncJob.source_document_type == "account_invoice",
        models.TallySyncJob.source_document_id == invoice_id,
    ).order_by(models.TallySyncJob.id.desc()).first()
    if not job:
        return {"status": "not_synced", "voucher_number": None, "last_sync_time": None, "outstanding_amount": None, "payment_status": None, "last_error": None}
    result = db.query(models.TallySyncResult).filter(models.TallySyncResult.sync_job_id == job.id).order_by(models.TallySyncResult.id.desc()).first()
    return {
        "job_id": job.id,
        "status": job.status,
        "voucher_number": result.tally_voucher_number if result else None,
        "voucher_type": job.job_type,
        "last_sync_time": (job.processed_at or job.updated_at or job.created_at).isoformat() if (job.processed_at or job.updated_at or job.created_at) else None,
        "outstanding_amount": result.outstanding_amount if result else None,
        "payment_status": result.payment_status if result else None,
        "last_error": job.last_error,
        "raw_response_excerpt": job.raw_response_excerpt,
    }

def create_sync_job(db: Session, invoice: models.AccountInvoice, job_type: str, created_by: str, force: bool = False) -> models.TallySyncJob:
    payload = invoice_payload(db, invoice) if job_type == "invoice" else receipt_payload(db, invoice)
    phash = payload_hash(payload)
    if not force:
        existing = db.query(models.TallySyncJob).filter(
            models.TallySyncJob.source_document_type == "account_invoice",
            models.TallySyncJob.source_document_id == invoice.id,
            models.TallySyncJob.job_type == job_type,
            models.TallySyncJob.payload_hash == phash,
            models.TallySyncJob.status.in_(["pending", "picked", "processing", "success", "generated_for_import"]),
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
        payload_hash=phash,
        status="pending",
        created_by=created_by,
        next_attempt_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

def claim_job(db: Session, job_id: int, connector: models.TallyConnector) -> models.TallySyncJob:
    job = db.query(models.TallySyncJob).filter(models.TallySyncJob.id == job_id).first()
    if not job or job.status != "pending":
        raise ValueError("Job is not available for claim.")
    job.status = "picked"
    job.connector_id = connector.id
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job

def mark_failed(db: Session, job: models.TallySyncJob, message: str, retryable: bool = True):
    job.retry_count = int(job.retry_count or 0) + 1
    job.last_error = message
    job.status = "pending" if retryable and job.retry_count < 5 else "failed"
    job.next_attempt_at = datetime.utcnow() + timedelta(seconds=min(300, 30 * (2 ** max(0, job.retry_count - 1))))
    job.updated_at = datetime.utcnow()
    db.commit()

def load_invoice(db: Session, invoice_id: int) -> models.AccountInvoice | None:
    return db.query(models.AccountInvoice).options(
        joinedload(models.AccountInvoice.booking).joinedload(models.EventBooking.project).joinedload(models.ProjectEvent.client)
    ).filter(models.AccountInvoice.id == invoice_id).first()
