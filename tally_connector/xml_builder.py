from backend.app.integrations.tally.xml_builder import build_sales_voucher_xml, build_receipt_voucher_xml, build_query_voucher_xml, build_outstanding_query_xml

def build_for_job(job, company_name):
    payload = job["payload"]
    mapping = payload.get("mapping") or {}
    if job["job_type"] == "receipt":
        return build_receipt_voucher_xml(payload, mapping, company_name)
    return build_sales_voucher_xml(payload, mapping, company_name)
