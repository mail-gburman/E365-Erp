from __future__ import annotations

from datetime import datetime
from xml.sax.saxutils import escape


def _x(value) -> str:
    return escape("" if value is None else str(value), {"'": "&apos;", '"': "&quot;"})


def _amount(value) -> str:
    try:
        return f"{float(value or 0):.2f}"
    except Exception:
        return "0.00"


def _date(value=None) -> str:
    if not value:
        return datetime.now().strftime("%Y%m%d")
    text = str(value)
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).strftime("%Y%m%d")
    except Exception:
        return text[:10].replace("-", "") if len(text) >= 10 else datetime.now().strftime("%Y%m%d")


def _ledger(mapping: dict, key: str, default: str) -> str:
    return mapping.get(key) or default


def _envelope(body: str) -> str:
    return f"""<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY><IMPORTDATA>
<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>
<REQUESTDATA>{body}</REQUESTDATA>
</IMPORTDATA></BODY>
</ENVELOPE>"""


def build_sales_voucher_xml(payload: dict, mapping: dict | None = None, company_name: str | None = None) -> str:
    mapping = mapping or payload.get("mapping") or {}
    party = payload.get("client_name") or "Client"
    voucher_type = _ledger(mapping, "sales", "Sales")
    sales_ledger = _ledger(mapping, "sales_income", "Sales")
    debtor_ledger = party
    total = _amount(payload.get("total_amount"))
    subtotal = _amount(payload.get("subtotal_amount"))
    tax_amount = float(payload.get("tax_amount") or 0)
    invoice_no = payload.get("invoice_number") or payload.get("invoice_id") or "E365-INVOICE"
    narration = payload.get("notes") or f"E365 invoice {invoice_no} for {payload.get('project_title') or payload.get('job_card_id') or ''}"
    ledger_entries = f"""
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>{_x(debtor_ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-{total}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>{_x(sales_ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{subtotal}</AMOUNT>
</ALLLEDGERENTRIES.LIST>"""
    if tax_amount:
        tax_ledger = _ledger(mapping, "cgst", "CGST") if not payload.get("client_gst_number") else _ledger(mapping, "igst", "IGST")
        ledger_entries += f"""
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>{_x(tax_ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{_amount(tax_amount)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>"""
    voucher = f"""
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="{_x(voucher_type)}" ACTION="Create" OBJVIEW="Invoice Voucher View">
<DATE>{_date(payload.get('date'))}</DATE>
<VOUCHERTYPENAME>{_x(voucher_type)}</VOUCHERTYPENAME>
<VOUCHERNUMBER>{_x(invoice_no)}</VOUCHERNUMBER>
<REFERENCE>{_x(invoice_no)}</REFERENCE>
<PARTYLEDGERNAME>{_x(party)}</PARTYLEDGERNAME>
<NARRATION>{_x(narration)}</NARRATION>
{ledger_entries}
</VOUCHER>
</TALLYMESSAGE>"""
    return _envelope(voucher)


def build_receipt_voucher_xml(payload: dict, mapping: dict | None = None, company_name: str | None = None) -> str:
    mapping = mapping or payload.get("mapping") or {}
    party = payload.get("client_name") or "Client"
    voucher_type = _ledger(mapping, "receipt", "Receipt")
    cash_or_bank = _ledger(mapping, "bank", "Bank Accounts") if (payload.get("payment_mode") or "").lower() not in {"cash"} else _ledger(mapping, "cash", "Cash")
    amount = _amount(payload.get("receipt_amount") or payload.get("amount_received"))
    invoice_no = payload.get("invoice_number") or "E365-RECEIPT"
    voucher = f"""
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="{_x(voucher_type)}" ACTION="Create">
<DATE>{_date(payload.get('receipt_date') or payload.get('payment_received_at'))}</DATE>
<VOUCHERTYPENAME>{_x(voucher_type)}</VOUCHERTYPENAME>
<VOUCHERNUMBER>{_x(invoice_no)}-RCPT</VOUCHERNUMBER>
<REFERENCE>{_x(invoice_no)}</REFERENCE>
<PARTYLEDGERNAME>{_x(party)}</PARTYLEDGERNAME>
<NARRATION>{_x('Receipt against ' + str(invoice_no))}</NARRATION>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>{_x(cash_or_bank)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-{amount}</AMOUNT></ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>{_x(party)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{amount}</AMOUNT></ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>"""
    return _envelope(voucher)


def build_query_voucher_xml(voucher_number: str) -> str:
    return f"""<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Object</TYPE><SUBTYPE>Voucher</SUBTYPE><ID TYPE="Name">{_x(voucher_number)}</ID></HEADER><BODY><DESC><FETCHLIST><FETCH>VoucherNumber</FETCH><FETCH>MasterID</FETCH></FETCHLIST></DESC></BODY></ENVELOPE>"""


def build_outstanding_query_xml(party_name: str) -> str:
    return f"""<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>Bills Receivable</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><LEDGERNAME>{_x(party_name)}</LEDGERNAME></STATICVARIABLES></DESC></BODY></ENVELOPE>"""
