from pathlib import Path

class FileExporter:
    def __init__(self, root: Path):
        self.root = root
        for name in ["pending", "success", "failed"]:
            (root / name).mkdir(parents=True, exist_ok=True)

    def write_pending(self, job, xml: str):
        safe_no = str(job.get("source_document_no") or job["id"]).replace("/", "-")
        filename = f"{job['job_type']}_{safe_no}_{job['id']}.xml"
        path = self.root / "pending" / filename
        path.write_text(xml, encoding="utf-8")
        return path
