from __future__ import annotations

import json
from ... import models

DEFAULT_MAPPINGS = [
    ("ledger", "client_receivables", "Client Receivables", "Sundry Debtors"),
    ("ledger", "sales_income", "Sales Income", "Sales"),
    ("ledger", "cgst", "CGST", "CGST"),
    ("ledger", "sgst", "SGST", "SGST"),
    ("ledger", "igst", "IGST", "IGST"),
    ("ledger", "round_off", "Round Off", "Round Off"),
    ("ledger", "cash", "Cash", "Cash"),
    ("ledger", "bank", "Bank", "Bank Accounts"),
    ("voucher_type", "sales", "Sales Voucher", "Sales"),
    ("voucher_type", "receipt", "Receipt Voucher", "Receipt"),
]


def ensure_default_mappings(db):
    existing = {
        (row.mapping_type, row.erp_key)
        for row in db.query(models.TallyMapping).all()
    }
    changed = False
    for mapping_type, erp_key, erp_label, tally_name in DEFAULT_MAPPINGS:
        if (mapping_type, erp_key) not in existing:
            db.add(models.TallyMapping(
                org_id="default",
                mapping_type=mapping_type,
                erp_key=erp_key,
                erp_label=erp_label,
                tally_name=tally_name,
                is_active=True,
            ))
            changed = True
    if changed:
        db.commit()


def mapping_dict(db) -> dict[str, str]:
    ensure_default_mappings(db)
    out = {}
    for row in db.query(models.TallyMapping).filter(models.TallyMapping.is_active == True).all():  # noqa: E712
        out[row.erp_key] = row.tally_name
    return out


def serialize_mapping(row: models.TallyMapping) -> dict:
    metadata = None
    if row.metadata_json:
        try:
            metadata = json.loads(row.metadata_json)
        except Exception:
            metadata = row.metadata_json
    return {
        "id": row.id,
        "mapping_type": row.mapping_type,
        "erp_key": row.erp_key,
        "erp_label": row.erp_label,
        "tally_name": row.tally_name,
        "tally_guid_optional": row.tally_guid_optional,
        "is_active": bool(row.is_active),
        "metadata": metadata,
    }
