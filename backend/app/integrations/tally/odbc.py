def test_odbc_connection(*args, **kwargs):
    return {"enabled": False, "ok": False, "message": "ODBC read support is optional and not configured."}

def fetch_outstanding(*args, **kwargs):
    return {"ok": False, "message": "ODBC outstanding read is not configured."}
