from .config import Config
from .erp_client import ERPClient
from .file_exporter import FileExporter
from .local_store import LocalStore
from .poller import Poller
from .tally_http_client import TallyHTTPClient

def main():
    cfg = Config()
    if not cfg.connector_token:
        raise SystemExit("CONNECTOR_TOKEN is required. Register a connector from the ERP first.")
    print("E365 Tally Connector")
    print(f"ERP: {cfg.erp_base_url}")
    print(f"Tally: {cfg.tally_url}")
    print(f"Mode: {cfg.mode}")
    print(f"Export folder: {cfg.export_folder}")
    erp = ERPClient(cfg.erp_base_url, cfg.connector_token, timeout=cfg.timeout_seconds)
    tally = TallyHTTPClient(cfg.tally_url, timeout=cfg.timeout_seconds)
    exporter = FileExporter(cfg.export_folder)
    store = LocalStore(cfg.sqlite_path)
    Poller(cfg, erp, tally, exporter, store).run_forever()

if __name__ == "__main__":
    main()
