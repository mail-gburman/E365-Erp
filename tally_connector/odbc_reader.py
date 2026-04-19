class ODBCReader:
    def __init__(self, *args, **kwargs):
        self.enabled = False

    def test(self):
        return {"ok": False, "message": "ODBC reads are optional and disabled by default."}
