from datetime import date, datetime
from html import escape

def _date(value) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y%m%d")
    if isinstance(value, date):
        return value.strftime("%Y%m%d")
    if isinstance(value, str):
        return value.replace("-", "")[:8]
    return datetime.utcnow().strftime("%Y%m%d")

def _amount(value) -> str:
    return f"{float(value or 0):.2f}"

def envelope(body: str, company_name: str | None = None) -> str:
    company = f"<SVCURRENTCOMPANY>{escape(company_name)}</SVCURRENTCOMPANY>" if company_name else ""
    return f"""<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES>{company}</STATICVARIABLES></REQUESTDESC>
<REQUESTDATA>{body}</REQUESTDATA></IMPORTDATA></BODY>
</ENVELOPE>"""

def build_sales_voucher_xml(invoice: dict, mapping: dict, company_name: str | None) -> str:
    voucher_type = mapping.get("voucher_type") or "Sales"
    customer = mapping.get("client_ledger") or invoice.get("client_name") or "Sundry Debtors"
    sales_ledger = mapping.get("sales_ledger") or "Sales"
    tax_ledger = mapping.get("tax_ledger") or "Output GST"
    roundoff_ledger = mapping.get("roundoff_ledger") or "Round Off"
    invoice_no = invoice.get("invoice_number") or invoice.get("source_document_no")
    total = float(invoice.get("total_amount") or 0)
    tax = float(invoice.get("tax_amount") or 0)
    subtotal = float(invoice.get("subtotal_amount") or 0)
    lines = [
        f"<ALLLEDGERENTRIES.LIST><LEDGERNAME>{escape(customer)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-{_amount(total)}</AMOUNT></ALLLEDGERENTRIES.LIST>",
        f"<ALLLEDGERENTRIES.LIST><LEDGERNAME>{escape(sales_ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{_amount(subtotal)}</AMOUNT></ALLLEDGERENTRIES.LIST>",
    ]
    if tax:
        lines.append(f"<ALLLEDGERENTRIES.LIST><LEDGERNAME>{escape(tax_ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{_amount(tax)}</AMOUNT></ALLLEDGERENTRIES.LIST>")
    if invoice.get("round_off_amount"):
        lines.append(f"<ALLLEDGERENTRIES.LIST><LEDGERNAME>{escape(roundoff_ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{_amount(invoice.get('round_off_amount'))}</AMOUNT></ALLLEDGERENTRIES.LIST>")
    body = f"""<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="{escape(voucher_type)}" ACTION="Create" OBJVIEW="Invoice Voucher View">
<DATE>{_date(invoice.get("invoice_date") or invoice.get("created_at"))}</DATE>
<VOUCHERTYPENAME>{escape(voucher_type)}</VOUCHERTYPENAME>
<VOUCHERNUMBER>{escape(invoice_no)}</VOUCHERNUMBER>
<REFERENCE>{escape(invoice_no)}</REFERENCE>
<PARTYLEDGERNAME>{escape(customer)}</PARTYLEDGERNAME>
<NARRATION>{escape(invoice.get("narration") or f"ERP invoice {invoice_no}")}</NARRATION>
{''.join(lines)}
</VOUCHER></TALLYMESSAGE>"""
    return envelope(body, company_name)

def build_receipt_voucher_xml(receipt: dict, mapping: dict, company_name: str | None) -> str:
    voucher_type = mapping.get("voucher_type") or "Receipt"
    customer = mapping.get("client_ledger") or receipt.get("client_name") or "Sundry Debtors"
    receipt_ledger = mapping.get("receipt_ledger") or receipt.get("payment_mode") or "Bank"
    ref = receipt.get("reference") or receipt.get("invoice_number")
    amount = float(receipt.get("amount") or 0)
    body = f"""<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="{escape(voucher_type)}" ACTION="Create">
<DATE>{_date(receipt.get("payment_date"))}</DATE>
<VOUCHERTYPENAME>{escape(voucher_type)}</VOUCHERTYPENAME>
<REFERENCE>{escape(ref)}</REFERENCE>
<NARRATION>{escape(receipt.get("details") or f"ERP receipt against {ref}")}</NARRATION>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>{escape(receipt_ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-{_amount(amount)}</AMOUNT></ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST><LEDGERNAME>{escape(customer)}</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>{_amount(amount)}</AMOUNT><BILLALLOCATIONS.LIST><NAME>{escape(ref)}</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>{_amount(amount)}</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST>
</VOUCHER></TALLYMESSAGE>"""
    return envelope(body, company_name)

def build_ledger_master_xml(customer: dict, mapping: dict, company_name: str | None) -> str:
    name = mapping.get("client_ledger") or customer.get("name")
    body = f"""<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="{escape(name)}" ACTION="Create">
<NAME>{escape(name)}</NAME><PARENT>Sundry Debtors</PARENT><ISBILLWISEON>Yes</ISBILLWISEON>
</LEDGER></TALLYMESSAGE>"""
    return envelope(body, company_name)

def build_query_voucher_xml(reference_no: str, company_name: str | None) -> str:
    company = f"<SVCURRENTCOMPANY>{escape(company_name)}</SVCURRENTCOMPANY>" if company_name else ""
    return f"""<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA>
<REQUESTDESC><REPORTNAME>Voucher Register</REPORTNAME><STATICVARIABLES>{company}<SVFROMDATE>20000101</SVFROMDATE><SVTODATE>20991231</SVTODATE></STATICVARIABLES></REQUESTDESC>
<REQUESTDATA><REFERENCE>{escape(reference_no)}</REFERENCE></REQUESTDATA></EXPORTDATA></BODY></ENVELOPE>"""

def build_outstanding_query_xml(ledger_name: str, company_name: str | None) -> str:
    company = f"<SVCURRENTCOMPANY>{escape(company_name)}</SVCURRENTCOMPANY>" if company_name else ""
    return f"""<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA>
<REQUESTDESC><REPORTNAME>Bills Receivable</REPORTNAME><STATICVARIABLES>{company}<LEDGERNAME>{escape(ledger_name)}</LEDGERNAME></STATICVARIABLES></REQUESTDESC>
</EXPORTDATA></BODY></ENVELOPE>"""
