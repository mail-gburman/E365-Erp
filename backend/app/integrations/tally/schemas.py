from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class ConnectorRegister(BaseModel):
    connector_name: str = Field(default="E365 Local Tally Connector")
    machine_name: Optional[str] = None
    tally_host: str = "127.0.0.1"
    tally_port: int = 9000
    company_name: Optional[str] = None
    import_mode: str = "hybrid"  # live_http/file_import/hybrid
    odbc_enabled: bool = False


class ConnectorHeartbeat(BaseModel):
    machine_name: Optional[str] = None
    tally_reachable: Optional[bool] = None
    company_name: Optional[str] = None


class TallyJobResult(BaseModel):
    status: str
    normalized_message: Optional[str] = None
    raw_response_excerpt: Optional[str] = None
    tally_voucher_number: Optional[str] = None
    tally_master_id_optional: Optional[str] = None
    tally_reference: Optional[str] = None
    raw_request_path_optional: Optional[str] = None
    raw_response_path_optional: Optional[str] = None
    outstanding_amount: Optional[float] = None
    payment_status: Optional[str] = None


class TallyJobFail(BaseModel):
    error: str
    retryable: bool = True
    raw_response_excerpt: Optional[str] = None


class TallyMappingPayload(BaseModel):
    mapping_type: str
    erp_key: str
    erp_label: Optional[str] = None
    tally_name: str
    tally_guid_optional: Optional[str] = None
    is_active: bool = True
    metadata_json: Optional[str] = None


class ImportConfirmation(BaseModel):
    job_id: int
    tally_voucher_number: Optional[str] = None
    notes: Optional[str] = None
