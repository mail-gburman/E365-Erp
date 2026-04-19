import json
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session
from .. import models
from ..auth import get_current_user, hash_password, verify_password
from ..database import get_db
from ..permissions import require_permission
from ..integrations.tally import schemas as tally_schemas
from ..integrations.tally.audit import audit_tally
from ..integrations.tally.mapping import ensure_default_mappings, serialize_mapping
from ..integrations.tally.service import create_sync_job, latest_status, load_invoice, claim_job, mark_failed
from ..integrations.tally.status import normalize_result_status

integration_router = APIRouter(prefix="/api/integrations/tally", tags=["Tally Integration"])
accounts_tally_router = APIRouter(prefix="/api/accounts", tags=["Tally Accounts"])

def _connector_from_auth(db: Session, authorization: str | None) -> models.TallyConnector:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Connector token required.")
    token = authorization.split(" ", 1)[1].strip()
    for connector in db.query(models.TallyConnector).filter(models.TallyConnector.polling_enabled == True).all():  # noqa: E712
        if verify_password(token, connector.connector_token_hash):
            connector.last_seen_at = datetime.utcnow()
            connector.updated_at = datetime.utcnow()
            db.commit()
            return connector
    raise HTTPException(status_code=401, detail="Invalid connector token.")

@integration_router.post("/connectors/register")
def register_connector(payload: tally_schemas.ConnectorRegister, db: Session = Depends(get_db), current_user=Depends(require_permission("accounts", "add"))):
    token = secrets.token_urlsafe(32)
    connector = models.TallyConnector(
        org_id="default",
        connector_name=payload.connector_name,
        connector_token_hash=hash_password(token),
        machine_name=payload.machine_name,
        tally_host=payload.tally_host,
        tally_port=payload.tally_port,
        company_name=payload.company_name,
        import_mode=payload.import_mode,
        odbc_enabled=payload.odbc_enabled,
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)
    audit_tally(db, current_user.username, "register_connector", connector.id, {"connector_name": payload.connector_name})
    return {"connector_id": connector.id, "connector_token": token, "message": "Store this token only on the local connector machine. It is not shown again."}

@integration_router.post("/connectors/heartbeat")
def connector_heartbeat(payload: tally_schemas.ConnectorHeartbeat, authorization: str | None = Header(None), db: Session = Depends(get_db)):
    connector = _connector_from_auth(db, authorization)
    connector.machine_name = payload.machine_name or connector.machine_name
    connector.company_name = payload.company_name or connector.company_name
    connector.last_seen_at = datetime.utcnow()
    connector.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "connector_id": connector.id, "polling_enabled": connector.polling_enabled}

@integration_router.get("/connectors/me/config")
def connector_config(authorization: str | None = Header(None), db: Session = Depends(get_db)):
    connector = _connector_from_auth(db, authorization)
    return {
        "connector_id": connector.id,
        "connector_name": connector.connector_name,
        "tally_host": connector.tally_host,
        "tally_port": connector.tally_port,
        "company_name": connector.company_name,
        "import_mode": connector.import_mode,
        "odbc_enabled": connector.odbc_enabled,
        "polling_enabled": connector.polling_enabled,
    }

@integration_router.get("/connectors/status", dependencies=[Depends(require_permission("accounts", "view"))])
def connector_status(db: Session = Depends(get_db)):
    rows = db.query(models.TallyConnector).order_by(models.TallyConnector.id.desc()).all()
    return [{
        "id": row.id,
        "connector_name": row.connector_name,
        "polling_enabled": row.polling_enabled,
        "last_seen_at": row.last_seen_at.isoformat() if row.last_seen_at else None,
        "machine_name": row.machine_name,
        "tally_host": row.tally_host,
        "tally_port": row.tally_port,
        "company_name": row.company_name,
        "import_mode": row.import_mode,
        "odbc_enabled": row.odbc_enabled,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    } for row in rows]

@integration_router.get("/jobs/pending")
def pending_jobs(limit: int = Query(20, ge=1, le=50), authorization: str | None = Header(None), db: Session = Depends(get_db)):
    connector = _connector_from_auth(db, authorization)
    jobs = db.query(models.TallySyncJob).filter(
        models.TallySyncJob.status == "pending",
        (models.TallySyncJob.next_attempt_at == None) | (models.TallySyncJob.next_attempt_at <= datetime.utcnow()),  # noqa: E711
    ).order_by(models.TallySyncJob.id.asc()).limit(limit).all()
    return [{"id": job.id, "job_type": job.job_type, "source_document_no": job.source_document_no, "payload": json.loads(job.payload_json), "retry_count": job.retry_count, "import_mode": connector.import_mode} for job in jobs]

@integration_router.post("/jobs/{job_id}/claim")
def claim(job_id: int, authorization: str | None = Header(None), db: Session = Depends(get_db)):
    connector = _connector_from_auth(db, authorization)
    try:
        job = claim_job(db, job_id, connector)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {"id": job.id, "status": job.status, "payload": json.loads(job.payload_json)}

@integration_router.post("/jobs/{job_id}/result")
def job_result(job_id: int, payload: tally_schemas.TallyJobResult, authorization: str | None = Header(None), db: Session = Depends(get_db)):
    connector = _connector_from_auth(db, authorization)
    job = db.query(models.TallySyncJob).filter(models.TallySyncJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Sync job not found.")
    status = normalize_result_status(payload.status)
    job.status = status
    job.connector_id = connector.id
    job.raw_response_excerpt = payload.raw_response_excerpt
    job.last_error = None if status in {"success", "generated_for_import"} else payload.normalized_message
    job.processed_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    db.add(models.TallySyncResult(
        sync_job_id=job.id,
        tally_voucher_number=payload.tally_voucher_number,
        tally_master_id_optional=payload.tally_master_id_optional,
        tally_reference=payload.tally_reference,
        status=status,
        normalized_message=payload.normalized_message,
        raw_request_path_optional=payload.raw_request_path_optional,
        raw_response_path_optional=payload.raw_response_path_optional,
        outstanding_amount=payload.outstanding_amount,
        payment_status=payload.payment_status,
    ))
    db.commit()
    return {"ok": True, "status": status}

@integration_router.post("/jobs/{job_id}/fail")
def job_fail(job_id: int, payload: tally_schemas.TallyJobFail, authorization: str | None = Header(None), db: Session = Depends(get_db)):
    _connector_from_auth(db, authorization)
    job = db.query(models.TallySyncJob).filter(models.TallySyncJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Sync job not found.")
    job.raw_response_excerpt = payload.raw_response_excerpt
    mark_failed(db, job, payload.error, retryable=payload.retryable)
    return {"ok": True, "status": job.status, "retry_count": job.retry_count}

@integration_router.get("/mappings", dependencies=[Depends(require_permission("accounts", "view"))])
def mappings(db: Session = Depends(get_db)):
    ensure_default_mappings(db)
    return [serialize_mapping(row) for row in db.query(models.TallyMapping).order_by(models.TallyMapping.mapping_type, models.TallyMapping.erp_label).all()]

@integration_router.post("/mappings")
def create_mapping(payload: tally_schemas.TallyMappingPayload, db: Session = Depends(get_db), current_user=Depends(require_permission("accounts", "add"))):
    row = models.TallyMapping(org_id="default", **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    audit_tally(db, current_user.username, "create_mapping", row.id, payload.model_dump())
    return serialize_mapping(row)

@integration_router.put("/mappings/{mapping_id}")
def update_mapping(mapping_id: int, payload: tally_schemas.TallyMappingPayload, db: Session = Depends(get_db), current_user=Depends(require_permission("accounts", "edit"))):
    row = db.query(models.TallyMapping).filter(models.TallyMapping.id == mapping_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mapping not found.")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    audit_tally(db, current_user.username, "update_mapping", row.id, payload.model_dump())
    return serialize_mapping(row)

@integration_router.post("/test-connection", dependencies=[Depends(require_permission("accounts", "view"))])
def test_connection(db: Session = Depends(get_db)):
    connector = db.query(models.TallyConnector).order_by(models.TallyConnector.id.desc()).first()
    if not connector:
        return {
            "ok": False,
            "message": "No local Tally connector has registered yet. Install and start the connector on the machine running Tally, then retry.",
        }
    if not connector.last_seen_at:
        return {
            "ok": False,
            "connector": connector.connector_name,
            "machine_name": connector.machine_name,
            "tally_host": connector.tally_host,
            "tally_port": connector.tally_port,
            "mode": connector.import_mode,
            "last_seen_at": None,
            "message": f"Connector '{connector.connector_name}' is registered but has never sent a heartbeat. Make sure the connector service is running on {connector.machine_name or 'the target machine'}.",
        }
    stale_threshold_minutes = 10
    age_seconds = (datetime.utcnow() - connector.last_seen_at).total_seconds()
    is_stale = age_seconds > stale_threshold_minutes * 60
    status_msg = (
        f"Connector '{connector.connector_name}' on {connector.machine_name or 'unknown machine'} "
        f"last seen {int(age_seconds // 60)} minute(s) ago — appears offline. "
        f"Check that the connector service is running and can reach {connector.tally_host}:{connector.tally_port}."
        if is_stale else
        f"Connector '{connector.connector_name}' on {connector.machine_name or 'unknown machine'} is live "
        f"(last heartbeat {int(age_seconds)} second(s) ago, mode: {connector.import_mode})."
    )
    return {
        "ok": not is_stale,
        "connector": connector.connector_name,
        "machine_name": connector.machine_name,
        "tally_host": connector.tally_host,
        "tally_port": connector.tally_port,
        "last_seen_at": connector.last_seen_at.isoformat() if connector.last_seen_at else None,
        "mode": connector.import_mode,
        "stale": is_stale,
        "message": status_msg,
    }

@integration_router.post("/sync-all")
def sync_all_invoices(db: Session = Depends(get_db), current_user=Depends(require_permission("accounts", "add"))):
    connector = db.query(models.TallyConnector).order_by(models.TallyConnector.id.desc()).first()
    if not connector or not connector.last_seen_at:
        return {"ok": False, "message": "No live Tally connector heartbeat found. Start the connector, then sync again.", "queued": 0}
    invoices = db.query(models.AccountInvoice).filter(models.AccountInvoice.status != "cancelled").order_by(models.AccountInvoice.id.asc()).all()
    queued = 0
    existing = 0
    for invoice in invoices:
        job = create_sync_job(db, invoice, "invoice", current_user.username, force=False)
        if job.status == "pending":
            queued += 1
        else:
            existing += 1
    audit_tally(db, current_user.username, "sync_all_invoices", connector.id, {"queued": queued, "existing": existing})
    return {"ok": True, "message": f"Tally sync queued {queued} invoice(s). {existing} already had an active/synced job.", "queued": queued, "existing": existing}

@integration_router.post("/import-confirmation")
def import_confirmation(payload: tally_schemas.ImportConfirmation, db: Session = Depends(get_db), current_user=Depends(require_permission("accounts", "edit"))):
    job = db.query(models.TallySyncJob).filter(models.TallySyncJob.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Sync job not found.")
    job.status = "success"
    job.processed_at = datetime.utcnow()
    db.add(models.TallySyncResult(sync_job_id=job.id, tally_voucher_number=payload.tally_voucher_number, tally_reference=job.source_document_no, status="success", normalized_message=payload.notes or "Manual Tally import confirmed."))
    db.commit()
    audit_tally(db, current_user.username, "confirm_file_import", job.id, {"voucher": payload.tally_voucher_number})
    return {"ok": True, "status": "success"}

@accounts_tally_router.post("/{invoice_id}/push-to-tally")
def push_to_tally(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(require_permission("accounts", "add"))):
    invoice = load_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    job = create_sync_job(db, invoice, "invoice", current_user.username, force=False)
    audit_tally(db, current_user.username, "push_invoice_to_tally", job.id, {"invoice_id": invoice_id})
    return {"job_id": job.id, "status": job.status}

@accounts_tally_router.post("/{invoice_id}/resync-tally")
def resync_tally(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(require_permission("accounts", "edit"))):
    invoice = load_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    job = create_sync_job(db, invoice, "invoice", current_user.username, force=True)
    audit_tally(db, current_user.username, "resync_invoice_to_tally", job.id, {"invoice_id": invoice_id})
    return {"job_id": job.id, "status": job.status}

@accounts_tally_router.post("/{invoice_id}/push-receipt-to-tally")
def push_receipt_to_tally(invoice_id: int, db: Session = Depends(get_db), current_user=Depends(require_permission("accounts", "add"))):
    invoice = load_invoice(db, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    if not invoice.amount_received:
        raise HTTPException(status_code=400, detail="Record a receipt amount before pushing a receipt voucher.")
    job = create_sync_job(db, invoice, "receipt", current_user.username, force=True)
    audit_tally(db, current_user.username, "push_receipt_to_tally", job.id, {"invoice_id": invoice_id, "amount": invoice.amount_received})
    return {"job_id": job.id, "status": job.status}

@accounts_tally_router.get("/{invoice_id}/tally-status", dependencies=[Depends(require_permission("accounts", "view"))])
def tally_status(invoice_id: int, db: Session = Depends(get_db)):
    return latest_status(db, invoice_id)

@accounts_tally_router.get("/{invoice_id}/tally-history", dependencies=[Depends(require_permission("accounts", "view"))])
def tally_history(invoice_id: int, db: Session = Depends(get_db)):
    jobs = db.query(models.TallySyncJob).filter(
        models.TallySyncJob.source_document_type == "account_invoice",
        models.TallySyncJob.source_document_id == invoice_id,
    ).order_by(models.TallySyncJob.id.desc()).all()
    out = []
    for job in jobs:
        results = db.query(models.TallySyncResult).filter(models.TallySyncResult.sync_job_id == job.id).order_by(models.TallySyncResult.id.desc()).all()
        out.append({
            "id": job.id,
            "job_type": job.job_type,
            "status": job.status,
            "retry_count": job.retry_count,
            "last_error": job.last_error,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "processed_at": job.processed_at.isoformat() if job.processed_at else None,
            "results": [{"status": r.status, "voucher_number": r.tally_voucher_number, "message": r.normalized_message, "created_at": r.created_at.isoformat() if r.created_at else None} for r in results],
        })
    return out
