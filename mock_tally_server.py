from http.server import BaseHTTPRequestHandler, HTTPServer
import time

class MockTallyHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8", errors="ignore")
        lower = body.lower()
        if "simulate_timeout" in lower:
            time.sleep(30)
        if "missingledger" in lower:
            response = "<RESPONSE><LINEERROR>Ledger not found</LINEERROR></RESPONSE>"
        elif "duplicate" in lower:
            response = "<RESPONSE><LINEERROR>Duplicate voucher exists</LINEERROR></RESPONSE>"
        else:
            response = "<RESPONSE><CREATED>1</CREATED><LASTVCHID>MOCK-001</LASTVCHID></RESPONSE>"
        self.send_response(200)
        self.send_header("Content-Type", "text/xml")
        self.end_headers()
        self.wfile.write(response.encode("utf-8"))

if __name__ == "__main__":
    print("Mock Tally server on http://127.0.0.1:9000")
    HTTPServer(("127.0.0.1", 9000), MockTallyHandler).serve_forever()
