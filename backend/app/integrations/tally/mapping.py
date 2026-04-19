import json
from sqlalchemy.orm import Session
from ... import models

DEFAULT_MAPPINGS = [
    ("voucher_type", "sales", "Sales"),
    ("voucher_type", "receipt", "Receipt"),
    ("sales_ledger", "default", "Sales"),
    ("tax_ledger", "default", "Output GST"),
    ("receipt_ledger", "default", "Bank"),
    ("roundoff_ledger", "default", "Round Off"),
]

def ensure_default_mappings(db: Session, org_id: str = "default"):
    for mapping_type, key, tally_name in DEFAULT_MAPPINGS:
        exists = db.query(models.TallyMapping).filter(
            models.TallyMapping.org_id == org_id,
            models.TallyMapping.mapping_type == mapping_type,
            models.TallyMapping.erp_key == key,
        ).first()
        if not exists:
            db.add(models.TallyMapping(
                org_id=org_id,
                mapping_type=mapping_type,
                erp_key=key,
                erp_label=key.title(),
                tally_name=tally_name,
                is_active=True,
                metadata_json="{}",
            ))
    db.commit()

def get_mapping_dict(db: Session, org_id: str, invoice_payload: dict | None = None) -> dict:
    ensure_default_mappings(db, org_id)
    rows = db.query(models.TallyMapping).filter(
        models.TallyMapping.org_id == org_id,
        models.TallyMapping.is_active == True,  # noqa: E712
    ).all()
    mapped = {}
    for row in rows:
        if row.mapping_type == "client_ledger" and invoice_payload and row.erp_key == str(invoice_payload.get("client_id") or invoice_payload.get("client_name")):
            mapped["client_ledger"] = row.tally_name
        elif row.mapping_type == "voucher_type":
            mapped[f"{row.erp_key}_voucher_type"] = row.tally_name
        else:
            mapped[row.mapping_type] = row.tally_name
    if invoice_payload and "client_ledger" not in mapped:
        mapped["client_ledger"] = invoice_payload.get("client_name") or "Sundry Debtors"
    return mapped

def serialize_mapping(row: models.TallyMapping) -> dict:
    return {
        "id": row.id,
        "org_id": row.org_id,
        "mapping_type": row.mapping_type,
        "erp_key": row.erp_key,
        "erp_label": row.erp_label,
        "tally_name": row.tally_name,
        "tally_guid_optional": row.tally_guid_optional,
        "is_active": bool(row.is_active),
        "metadata": json.loads(row.metadata_json or "{}"),
    }
