import time
from datetime import datetime
from .xml_builder import build_for_job
from .status_reporter import parse_success

class Poller:
    def __init__(self, config, erp, tally, exporter, store):
        self.config = config
        self.erp = erp
        self.tally = tally
        self.exporter = exporter
        self.store = store

    def process_once(self):
        reachable = self.tally.ping()
        self.erp.heartbeat({"machine_name": None, "tally_reachable": reachable, "company_name": self.config.tally_company_name})
        jobs = self.erp.pending_jobs(limit=5)
        for pending in jobs:
            claimed = self.erp.claim(pending["id"])
            xml = build_for_job(claimed, self.config.tally_company_name)
            if self.config.mode == "file_import" or (self.config.mode == "hybrid" and not reachable):
                path = self.exporter.write_pending(claimed, xml)
                self.store.upsert(claimed["id"], "generated_for_import", request_path=path)
                self.erp.result(claimed["id"], {"status": "generated_for_import", "normalized_message": "TALLY_IMPORT_GENERATED", "raw_request_path_optional": str(path)})
                continue
            try:
                response = self.tally.post_xml(xml)
                status = parse_success(response)
                self.store.upsert(claimed["id"], status["status"])
                self.erp.result(claimed["id"], status)
            except Exception as exc:
                self.store.upsert(claimed["id"], "failed", last_error=str(exc))
                self.erp.fail(claimed["id"], f"TALLY_HTTP_UNREACHABLE: {exc}", retryable=True)

    def run_forever(self):
        while True:
            try:
                self.process_once()
            except Exception as exc:
                print(f"[{datetime.now().isoformat()}] connector error: {exc}")
            time.sleep(self.config.poll_seconds)
