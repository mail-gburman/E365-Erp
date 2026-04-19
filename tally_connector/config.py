import os
from dataclasses import dataclass
from pathlib import Path

@dataclass
class Config:
    erp_base_url: str = os.getenv("ERP_BASE_URL", "https://your-cloud-erp.example.com")
    connector_token: str = os.getenv("CONNECTOR_TOKEN", "")
    tally_host: str = os.getenv("TALLY_HOST", "127.0.0.1")
    tally_port: int = int(os.getenv("TALLY_PORT", "9000"))
    tally_company_name: str = os.getenv("TALLY_COMPANY_NAME", "")
    mode: str = os.getenv("TALLY_MODE", "hybrid")
    export_folder: Path = Path(os.getenv("TALLY_EXPORT_FOLDER", "exports"))
    poll_seconds: int = int(os.getenv("POLL_SECONDS", "45"))
    timeout_seconds: int = int(os.getenv("TIMEOUT_SECONDS", "20"))
    sqlite_path: Path = Path(os.getenv("CONNECTOR_SQLITE", "tally_connector.sqlite3"))

    @property
    def tally_url(self) -> str:
        return f"http://{self.tally_host}:{self.tally_port}"
