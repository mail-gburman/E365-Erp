import requests

class TallyHTTPClient:
    def __init__(self, url: str, timeout: int = 20):
        self.url = url
        self.timeout = timeout

    def ping(self):
        try:
            res = requests.post(self.url, data="<ENVELOPE></ENVELOPE>", timeout=5)
            return res.status_code < 500
        except Exception:
            return False

    def post_xml(self, xml: str):
        res = requests.post(self.url, data=xml.encode("utf-8"), headers={"Content-Type": "text/xml"}, timeout=self.timeout)
        res.raise_for_status()
        return res.text
