import re
from sqlalchemy import func
from . import models


def _next_number(db, model, field_name, prefix, width):
    """Extract the max numeric suffix from existing codes to avoid collisions after deletions."""
    col = getattr(model, field_name)
    vals = db.query(col).all()
    max_n = 0
    pat = re.compile(r"^" + re.escape(prefix) + r"(\d+)$")
    for (val,) in vals:
        if not val:
            continue
        m = pat.match(str(val))
        if m:
            max_n = max(max_n, int(m.group(1)))
    return max_n + 1


def next_vendor_code(db):
    return f"VEN-{_next_number(db, models.Vendor, 'vendor_code', 'VEN-', 5):05d}"

def next_client_code(db):
    return f"CLI-{_next_number(db, models.Client, 'client_code', 'CLI-', 5):05d}"

def next_product_code(db):
    return f"PRD-{_next_number(db, models.InventoryItem, 'product_code', 'PRD-', 6):06d}"

def next_asset_code(db):
    return f"AST-{_next_number(db, models.InventoryItem, 'asset_code', 'AST-', 6):06d}"

def next_employee_code(db):
    return f"EMP-{_next_number(db, models.CrewMember, 'employee_code', 'EMP-', 5):05d}"

def next_po_code(db):
    return f"PROC-{_next_number(db, models.ProcurementOrder, 'procurement_code', 'PROC-', 5):05d}"

def next_po_number(db):
    return f"PO-{_next_number(db, models.ProcurementOrder, 'po_number', 'PO-', 5):05d}"

def next_paper_number(db):
    return f"PAP-{_next_number(db, models.OutboundPaper, 'paper_number', 'PAP-', 5):05d}"

def next_service_job_number(db):
    return f"SRV-{_next_number(db, models.ServiceJob, 'job_number', 'SRV-', 5):05d}"

def next_equipment_master_code(db):
    return f"EQM-{_next_number(db, models.EquipmentMaster, 'equipment_code', 'EQM-', 5):05d}"

def next_gate_pass_number(db):
    return f"GATE-{_next_number(db, models.GatePass, 'gate_pass_number', 'GATE-', 5):05d}"

def next_booking_code(db):
    return f"BK-{_next_number(db, models.EventBooking, 'booking_code', 'BK-', 5):05d}"

def next_job_card_id(db):
    return f"JC-{_next_number(db, models.EventBooking, 'job_card_id', 'JC-', 5):05d}"

def next_supplementary_job_card_id(db, parent_job_card_id: str):
    """Generate supplementary ID like JC-00001-S1, JC-00001-S2, etc."""
    prefix = parent_job_card_id + "-S"
    col = models.EventBooking.job_card_id
    vals = db.query(col).filter(col.like(prefix + "%")).all()
    max_n = 0
    for (val,) in vals:
        if val:
            suffix = val.replace(prefix, "")
            try:
                max_n = max(max_n, int(suffix))
            except ValueError:
                pass
    return f"{prefix}{max_n + 1}"
