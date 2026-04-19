import requests

class ERPClient:
    def __init__(self, base_url: str, token: str, timeout: int = 20):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.headers = {"Authorization": f"Bearer {token}"}

    def heartbeat(self, payload):
        return requests.post(f"{self.base_url}/api/integrations/tally/connectors/heartbeat", json=payload, headers=self.headers, timeout=self.timeout).json()

    def config(self):
        return requests.get(f"{self.base_url}/api/integrations/tally/connectors/me/config", headers=self.headers, timeout=self.timeout).json()

    def pending_jobs(self, limit=10):
        return requests.get(f"{self.base_url}/api/integrations/tally/jobs/pending", params={"limit": limit}, headers=self.headers, timeout=self.timeout).json()

    def claim(self, job_id):
        return requests.post(f"{self.base_url}/api/integrations/tally/jobs/{job_id}/claim", headers=self.headers, timeout=self.timeout).json()

    def result(self, job_id, payload):
        return requests.post(f"{self.base_url}/api/integrations/tally/jobs/{job_id}/result", json=payload, headers=self.headers, timeout=self.timeout).json()

    def fail(self, job_id, error, retryable=True, raw_response_excerpt=None):
        return requests.post(
            f"{self.base_url}/api/integrations/tally/jobs/{job_id}/fail",
            json={"error": error, "retryable": retryable, "raw_response_excerpt": raw_response_excerpt},
            headers=self.headers,
            timeout=self.timeout,
        ).json()
