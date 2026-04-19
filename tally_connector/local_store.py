import sqlite3
from pathlib import Path

class LocalStore:
    def __init__(self, path: Path):
        self.path = path
        self.conn = sqlite3.connect(path)
        self.conn.execute("""CREATE TABLE IF NOT EXISTS job_log (
            job_id INTEGER PRIMARY KEY,
            status TEXT,
            request_path TEXT,
            response_path TEXT,
            last_error TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")
        self.conn.commit()

    def upsert(self, job_id, status, request_path=None, response_path=None, last_error=None):
        self.conn.execute("""
            INSERT INTO job_log(job_id,status,request_path,response_path,last_error) VALUES(?,?,?,?,?)
            ON CONFLICT(job_id) DO UPDATE SET status=excluded.status, request_path=excluded.request_path,
            response_path=excluded.response_path, last_error=excluded.last_error, updated_at=CURRENT_TIMESTAMP
        """, (job_id, status, str(request_path or ""), str(response_path or ""), last_error))
        self.conn.commit()
