from pathlib import Path
import datetime
import os
import subprocess
import sys
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user, require_roles
from ..permissions import assert_document_permission, has_document_permission, require_permission
from .. import models, schemas
from ..audit import audit

router = APIRouter(tags=["System"])
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/tmp/kps_uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
REPO_ROOT = Path(__file__).resolve().parents[3]
TALLY_CONNECTOR_DIR = REPO_ROOT / "tally_connector"
TALLY_ENV_PATH = TALLY_CONNECTOR_DIR / ".env"
DEMO_PROCESSES: dict[str, subprocess.Popen] = {}

TALLY_ENV_KEYS = [
    "ERP_BASE_URL",
    "CONNECTOR_TOKEN",
    "TALLY_HOST",
    "TALLY_PORT",
    "TALLY_COMPANY_NAME",
    "TALLY_MODE",
    "TALLY_EXPORT_FOLDER",
    "POLL_SECONDS",
    "TIMEOUT_SECONDS",
    "CONNECTOR_SQLITE",
]

def _process_status(name: str) -> dict:
    proc = DEMO_PROCESSES.get(name)
    if not proc:
        return {"running": False, "pid": None}
    code = proc.poll()
    if code is not None:
        DEMO_PROCESSES.pop(name, None)
        return {"running": False, "pid": None, "exit_code": code}
    return {"running": True, "pid": proc.pid}

def _stop_process(name: str) -> dict:
    proc = DEMO_PROCESSES.get(name)
    if not proc or proc.poll() is not None:
        DEMO_PROCESSES.pop(name, None)
        return {"running": False, "message": f"{name} is not running."}
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    DEMO_PROCESSES.pop(name, None)
    return {"running": False, "message": f"{name} stopped."}

def _env_payload_to_text(payload: dict) -> str:
    lines = []
    for key in TALLY_ENV_KEYS:
        value = str(payload.get(key) or "").strip()
        lines.append(f"{key}={value}")
    return "\n".join(lines) + "\n"

def _env_payload(payload: dict) -> dict:
    return {key: str(payload.get(key) or "").strip() for key in TALLY_ENV_KEYS}

@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": db_ok, "time": datetime.datetime.utcnow().isoformat() + "Z"}

@router.get("/audit-logs", response_model=list[schemas.AuditLogRead], dependencies=[Depends(require_permission("users","view"))])
def list_audit_logs(db: Session = Depends(get_db)):
    return db.query(models.AuditLog).order_by(models.AuditLog.id.desc()).limit(500).all()

def _uploaded_document_type(entity_type: str | None) -> str:
    doc_type = "manpower" if entity_type == "crew" else (entity_type or "other")
    return doc_type if doc_type in {"vendor", "client", "inventory", "warehouse", "manpower"} else "other"

@router.get("/documents", response_model=list[schemas.StatutoryDocumentRead])
def list_documents(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    rows = db.query(models.StatutoryDocument).order_by(models.StatutoryDocument.id.desc()).all()
    return [row for row in rows if has_document_permission(current_user, _uploaded_document_type(row.entity_type), "view")]

@router.post("/documents", dependencies=[Depends(require_permission("uploads","add"))])
async def upload_document(
    entity_type: str = Form(...),
    entity_id: int = Form(...),
    document_name: str = Form(...),
    notes: str = Form(""),
    file: UploadFile = File(...),
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    safe_name = f"{entity_type}_{entity_id}_{int(datetime.datetime.utcnow().timestamp())}_{file.filename}"
    target = UPLOAD_DIR / safe_name
    with open(target, "wb") as f:
        f.write(await file.read())
    row = models.StatutoryDocument(entity_type=entity_type, entity_id=entity_id, document_name=document_name, file_path=str(target), uploaded_by=current_user.username, notes=notes or None)
    db.add(row)
    audit(db, current_user.username, "upload", "statutory_document", details={"entity_type": entity_type, "entity_id": entity_id, "document_name": document_name})
    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id}

@router.get("/documents/{doc_id}/download")
def download_document(doc_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    row = db.query(models.StatutoryDocument).filter(models.StatutoryDocument.id == doc_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found.")
    assert_document_permission(current_user, _uploaded_document_type(row.entity_type), "download")
    file_path = Path(row.file_path or "")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document file is missing on disk.")
    return FileResponse(str(file_path), filename=file_path.name)

def _project_title(booking: models.EventBooking | None) -> str:
    return booking.project.title if booking and booking.project else "-"

def _doc_row(document_type: str, name: str, entity: str, download_url: str, created_at=None, source="generated") -> dict:
    return {
        "document_type": document_type,
        "name": name,
        "entity": entity,
        "download_url": download_url,
        "created_at": created_at.isoformat() if created_at else None,
        "source": source,
    }

@router.get("/system/document-library")
def document_library(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    rows = []
    type_labels = {
        "all": "All Documents",
        "vendor": "Vendor",
        "client": "Client",
        "manpower": "Manpower",
        "inventory": "Inventory",
        "warehouse": "Warehouse",
        "job_card": "Job Cards",
        "challan": "Road Challans",
        "manpower_pdf": "Manpower PDFs",
        "gate_pass": "Gate Passes",
        "invoice": "Invoices",
        "service": "Service PDFs",
        "paper": "Papers",
        "other": "Other",
    }

    for doc in db.query(models.StatutoryDocument).order_by(models.StatutoryDocument.id.desc()).all():
        doc_type = _uploaded_document_type(doc.entity_type)
        if doc_type not in type_labels:
            doc_type = "other"
        if not has_document_permission(current_user, doc_type, "view"):
            continue
        rows.append(_doc_row(
            doc_type,
            doc.document_name,
            f"{doc.entity_type} #{doc.entity_id}",
            f"/documents/{doc.id}/download",
            doc.created_at,
            source="uploaded",
        ))

    for booking in db.query(models.EventBooking).order_by(models.EventBooking.id.desc()).all():
        entity = f"{booking.job_card_id} · {_project_title(booking)}"
        if has_document_permission(current_user, "job_card", "view"):
            rows.append(_doc_row("job_card", f"Job Card {booking.job_card_id}", entity, f"/bookings/{booking.id}/job-card-pdf", booking.created_at))
        if has_document_permission(current_user, "challan", "view"):
            rows.append(_doc_row("challan", f"Road Challan {booking.job_card_id}", entity, f"/bookings/{booking.id}/road-challan-pdf", booking.created_at))
        if has_document_permission(current_user, "manpower_pdf", "view"):
            rows.append(_doc_row("manpower_pdf", f"Manpower PDF {booking.job_card_id}", entity, f"/bookings/{booking.id}/manpower-pdf", booking.created_at))

    for gate in db.query(models.GatePass).order_by(models.GatePass.id.desc()).all():
        if not has_document_permission(current_user, "gate_pass", "view"):
            continue
        rows.append(_doc_row(
            "gate_pass",
            f"Gate Pass {gate.gate_pass_number}",
            f"{gate.booking.job_card_id if gate.booking else '-'} · {gate.pass_type}",
            f"/bookings/gate-passes/{gate.id}/pdf",
            gate.created_at,
        ))

    for invoice in db.query(models.AccountInvoice).order_by(models.AccountInvoice.id.desc()).all():
        if not has_document_permission(current_user, "invoice", "view"):
            continue
        rows.append(_doc_row(
            "invoice",
            f"Invoice {invoice.invoice_number}",
            f"{invoice.booking.job_card_id if invoice.booking else '-'} · INR {invoice.total_amount or 0:,.2f}",
            f"/accounts/invoices/{invoice.id}/pdf",
            invoice.created_at,
        ))

    for job in db.query(models.ServiceJob).order_by(models.ServiceJob.id.desc()).all():
        if not has_document_permission(current_user, "service", "view"):
            continue
        entity = f"{job.job_number} · {job.vendor_name}"
        rows.append(_doc_row("service", f"Service PDF {job.job_number}", entity, f"/service-jobs/{job.id}/pdf", job.created_at))
        rows.append(_doc_row("service", f"Service Declaration {job.job_number}", entity, f"/service-jobs/{job.id}/declaration-pdf", job.created_at))
        rows.append(_doc_row("service", f"Service Address Label {job.job_number}", entity, f"/service-jobs/{job.id}/address-label-pdf", job.created_at))

    for paper in db.query(models.OutboundPaper).order_by(models.OutboundPaper.id.desc()).all():
        if not has_document_permission(current_user, "paper", "view"):
            continue
        rows.append(_doc_row(
            "paper",
            f"{paper.paper_type} {paper.paper_number}",
            f"{paper.reference_name} · {paper.destination}",
            f"/papers/{paper.id}/pdf",
            paper.created_at,
        ))

    counts = {"all": len(rows)}
    for row in rows:
        counts[row["document_type"]] = counts.get(row["document_type"], 0) + 1
    tabs = [{"key": key, "label": label, "count": counts.get(key, 0)} for key, label in type_labels.items() if key == "all" or counts.get(key, 0)]
    rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    return {"tabs": tabs, "documents": rows}

@router.post("/backup", dependencies=[Depends(require_roles("admin"))])
def trigger_backup(current_user = Depends(get_current_user)):
    return {"ok": True, "suggested_command": 'pg_dump -Fc "$DATABASE_URL" > backup.dump'}

@router.post("/restore", dependencies=[Depends(require_roles("admin"))])
def trigger_restore(current_user = Depends(get_current_user)):
    return {"ok": True, "suggested_command": 'pg_restore -d "$DATABASE_URL" backup.dump'}

@router.get("/system/tally-demo/status", dependencies=[Depends(require_roles("admin"))])
def tally_demo_status():
    return {
        "env_exists": TALLY_ENV_PATH.exists(),
        "env_path": str(TALLY_ENV_PATH),
        "mock_tally": _process_status("mock_tally"),
        "connector": _process_status("connector"),
    }

@router.post("/system/tally-demo/env", dependencies=[Depends(require_roles("admin"))])
def save_tally_demo_env(payload: dict = Body(...), current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    TALLY_CONNECTOR_DIR.mkdir(parents=True, exist_ok=True)
    TALLY_ENV_PATH.write_text(_env_payload_to_text(payload), encoding="utf-8")
    audit(db, current_user.username, "save_tally_connector_env", "system", details={"env_path": str(TALLY_ENV_PATH)})
    return {"ok": True, "env_path": str(TALLY_ENV_PATH), "message": "Connector .env saved/replaced."}

@router.post("/system/tally-demo/mock/start", dependencies=[Depends(require_roles("admin"))])
def start_mock_tally(current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    status = _process_status("mock_tally")
    if status["running"]:
        return {"ok": True, **status, "message": "Mock Tally server is already running."}
    proc = subprocess.Popen(
        [sys.executable, "mock_tally_server.py"],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    DEMO_PROCESSES["mock_tally"] = proc
    audit(db, current_user.username, "start_mock_tally", "system", details={"pid": proc.pid})
    return {"ok": True, "running": True, "pid": proc.pid, "message": "Mock Tally server started on 127.0.0.1:9000."}

@router.post("/system/tally-demo/mock/stop", dependencies=[Depends(require_roles("admin"))])
def stop_mock_tally(current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    result = _stop_process("mock_tally")
    audit(db, current_user.username, "stop_mock_tally", "system", details=result)
    return {"ok": True, **result}

@router.post("/system/tally-demo/connector/start", dependencies=[Depends(require_roles("admin"))])
def start_tally_connector(payload: dict = Body(default={}), current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    status = _process_status("connector")
    if status["running"]:
        return {"ok": True, **status, "message": "Local connector is already running."}
    if payload:
        TALLY_CONNECTOR_DIR.mkdir(parents=True, exist_ok=True)
        TALLY_ENV_PATH.write_text(_env_payload_to_text(payload), encoding="utf-8")
    if not TALLY_ENV_PATH.exists():
        raise HTTPException(status_code=400, detail="Save connector .env first.")
    env_values = {}
    for line in TALLY_ENV_PATH.read_text(encoding="utf-8").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            env_values[key.strip()] = value.strip()
    if not env_values.get("CONNECTOR_TOKEN"):
        raise HTTPException(status_code=400, detail="CONNECTOR_TOKEN is required before starting the connector.")
    env = os.environ.copy()
    env.update(_env_payload(env_values))
    proc = subprocess.Popen(
        [sys.executable, "-m", "tally_connector.main"],
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    DEMO_PROCESSES["connector"] = proc
    audit(db, current_user.username, "start_tally_connector", "system", details={"pid": proc.pid})
    return {"ok": True, "running": True, "pid": proc.pid, "message": "Local Tally connector started."}

@router.post("/system/tally-demo/connector/stop", dependencies=[Depends(require_roles("admin"))])
def stop_tally_connector(current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    result = _stop_process("connector")
    audit(db, current_user.username, "stop_tally_connector", "system", details=result)
    return {"ok": True, **result}
