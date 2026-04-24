from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, model_validator

class RolePresetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permissions_json: str

class RolePresetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions_json: Optional[str] = None

class RolePresetRead(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    permissions_json: str
    is_builtin: bool
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str
    permissions_json: Optional[str] = None

class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    permissions_json: Optional[str] = None
    is_active: bool = True
    max_sessions: int = 5  # 0 = unlimited

class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    permissions_json: Optional[str] = None
    is_active: Optional[bool] = None
    max_sessions: Optional[int] = None

class UserAdminRead(BaseModel):
    id: int
    username: str
    role: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    permissions_json: Optional[str] = None
    is_active: bool
    max_sessions: int = 5
    class Config:
        from_attributes = True

class UserSessionRead(BaseModel):
    id: int
    user_id: int
    username: Optional[str] = None   # populated from join
    ip_address: Optional[str] = None
    os: Optional[str] = None
    browser: Optional[str] = None
    device_type: Optional[str] = None
    login_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active: bool
    class Config:
        from_attributes = True

class UserRead(BaseModel):
    id: int
    username: str
    role: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True
    class Config:
        from_attributes = True

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    class Config:
        from_attributes = True

class WarehouseBase(BaseModel):
    code: str
    name: str
    city: str
    address: Optional[str] = None
    manager_name: Optional[str] = None
    contact_no: Optional[str] = None

class WarehouseCreate(WarehouseBase): pass
class WarehouseRead(WarehouseBase):
    id: int
    class Config:
        from_attributes = True

class VendorBase(BaseModel):
    vendor_code: Optional[str] = None
    name: str
    vendor_type: str
    city: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    notes: Optional[str] = None

class VendorCreate(VendorBase): pass
class VendorUpdate(BaseModel):
    name: Optional[str] = None
    vendor_type: Optional[str] = None
    city: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    notes: Optional[str] = None
class VendorRead(VendorBase):
    id: int
    vendor_code: str
    class Config:
        from_attributes = True


class EquipmentMasterBase(BaseModel):
    equipment_code: Optional[str] = None
    name: str
    category: str
    item_type: str = "device"
    brand: Optional[str] = None
    model_no: Optional[str] = None
    notes: Optional[str] = None

class EquipmentMasterCreate(EquipmentMasterBase): pass
class EquipmentMasterRead(EquipmentMasterBase):
    id: int
    equipment_code: str
    class Config:
        from_attributes = True


class ClientContactBase(BaseModel):
    contact_name: str
    designation: Optional[str] = None
    email: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    is_primary: bool = False

class ClientContactCreate(ClientContactBase): pass
class ClientContactRead(ClientContactBase):
    id: int
    class Config:
        from_attributes = True

class ClientBase(BaseModel):
    name: str
    industry_type: Optional[str] = None
    billing_address: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    notes: Optional[str] = None

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    industry_type: Optional[str] = None
    billing_address: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    notes: Optional[str] = None

class ClientCreate(ClientBase):
    contacts: list[ClientContactCreate] = []

class ClientRead(ClientBase):
    id: int
    client_code: str
    contacts: list[ClientContactRead] = []
    class Config:
        from_attributes = True

class InventoryBase(BaseModel):
    asset_code: Optional[str] = None
    name: str
    category: str
    item_type: str = "device"
    serial_number: Optional[str] = None
    parent_item_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    owner_type: str = "inhouse"
    vendor_id: Optional[int] = None
    status: str = "available"
    location_text: Optional[str] = None
    warranty_expiry: Optional[date] = None
    service_due: Optional[date] = None
    service_status: str = "not_in_service"
    statutory_tag: Optional[str] = None
    notes: Optional[str] = None
    equipment_master_id: Optional[int] = None
    vendor_available_from: Optional[date] = None
    vendor_available_until: Optional[date] = None
    qty_in_stock: Optional[int] = None

class InventoryCreate(InventoryBase): pass
class InventoryUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    item_type: Optional[str] = None
    serial_number: Optional[str] = None
    parent_item_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    owner_type: Optional[str] = None
    vendor_id: Optional[int] = None
    status: Optional[str] = None
    location_text: Optional[str] = None
    warranty_expiry: Optional[date] = None
    service_due: Optional[date] = None
    service_status: Optional[str] = None
    statutory_tag: Optional[str] = None
    notes: Optional[str] = None
    equipment_master_id: Optional[int] = None
    vendor_available_from: Optional[date] = None
    vendor_available_until: Optional[date] = None
    qty_in_stock: Optional[int] = None
class InventoryRead(InventoryBase):
    id: int
    product_code: str
    class Config:
        from_attributes = True

class CrewBase(BaseModel):
    employee_code: Optional[str] = None
    full_name: str
    role: str
    manpower_type: str = "inhouse"
    vendor_id: Optional[int] = None
    home_station: str
    phone: Optional[str] = None
    address: Optional[str] = None
    aadhar_number: Optional[str] = None
    pan_number: Optional[str] = None
    blood_group: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    id_proof_type: Optional[str] = None
    id_proof_number: Optional[str] = None
    id_proofs: List[dict] = Field(default_factory=list)  # list of {type, number, file_url?}
    status: str = "available"

class CrewCreate(CrewBase): pass
class CrewUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    manpower_type: Optional[str] = None
    vendor_id: Optional[int] = None
    home_station: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    aadhar_number: Optional[str] = None
    pan_number: Optional[str] = None
    blood_group: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    id_proof_type: Optional[str] = None
    id_proof_number: Optional[str] = None
    id_proofs: Optional[List[dict]] = None
    status: Optional[str] = None
class CrewRead(CrewBase):
    id: int
    class Config:
        from_attributes = True

class ProjectDateRead(BaseModel):
    date_type: str
    date_value: date
    class Config:
        from_attributes = True

class ProjectBase(BaseModel):
    title: str
    show_type: str
    client_id: Optional[int] = None
    venue: str
    origin_warehouse_id: Optional[int] = None
    shoot_start: Optional[datetime] = None
    shoot_end: Optional[datetime] = None
    setup_date: Optional[date] = None
    off_days: int = 0
    expected_start_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    setup_days: int = 0
    status: str = "draft"
    notes: Optional[str] = None
    dates: List[dict] = Field(default_factory=list)  # List of {"date_type": "start_date", "date_value": "2023-01-01"}

    @field_validator("setup_days", "off_days")
    @classmethod
    def non_negative(cls, v):
        if v < 0:
            raise ValueError("Durations cannot be negative.")
        return v

class ProjectCreate(ProjectBase): pass
class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    show_type: Optional[str] = None
    client_id: Optional[int] = None
    venue: Optional[str] = None
    origin_warehouse_id: Optional[int] = None
    shoot_start: Optional[datetime] = None
    shoot_end: Optional[datetime] = None
    setup_date: Optional[date] = None
    off_days: Optional[int] = None
    expected_start_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    setup_days: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    dates: Optional[List[dict]] = None
class ProjectRead(ProjectBase):
    id: int
    dates: List[ProjectDateRead] = Field(default_factory=list)
    block_start: Optional[datetime] = None
    block_end: Optional[datetime] = None
    class Config:
        from_attributes = True


class BookingContact(BaseModel):
    name: str
    mobile: Optional[str] = None
    aadhar: Optional[str] = None

class BookingCreate(BaseModel):
    project_id: int
    destination: str
    status: str = "planned"
    equipment_ids: List[int] = Field(default_factory=list)
    crew_ids: List[int] = Field(default_factory=list)
    accessory_ids: List[int] = Field(default_factory=list)
    remarks: Optional[str] = None
    parent_booking_id: Optional[int] = None
    transport_mode: Optional[str] = None
    awb_number: Optional[str] = None
    contact_person_name: Optional[str] = None
    contact_person_mobile: Optional[str] = None
    contact_person_aadhar: Optional[str] = None
    contacts: List[BookingContact] = Field(default_factory=list)
    call_time: Optional[datetime] = None
    packup_time: Optional[datetime] = None

    @model_validator(mode="after")
    def check_any_resources(self):
        if not self.equipment_ids and not self.crew_ids and not self.accessory_ids:
            raise ValueError("At least one equipment, accessory, or crew member must be selected.")
        return self

class BookingRead(BaseModel):
    id: int
    booking_code: Optional[str] = None
    job_card_id: Optional[str] = None
    project_id: int
    parent_booking_id: Optional[int] = None
    destination: str
    status: str
    cancellation_reason: Optional[str] = None
    remarks: Optional[str] = None
    is_conflict: bool
    transport_mode: Optional[str] = None
    awb_number: Optional[str] = None
    contact_person_name: Optional[str] = None
    contact_person_mobile: Optional[str] = None
    contact_person_aadhar: Optional[str] = None
    contacts: List[BookingContact] = Field(default_factory=list)
    call_time: Optional[datetime] = None
    packup_time: Optional[datetime] = None
    class Config:
        from_attributes = True

class AccountInvoicePayload(BaseModel):
    booking_id: int
    billing_mode: str = "line_item"
    status: str = "draft"
    package_amount: float = 0
    equipment_amount: float = 0
    manpower_amount: float = 0
    logistics_amount: float = 0
    other_amount: float = 0
    discount_amount: float = 0
    tax_percent: float = 18
    manpower_payout_amount: float = 0
    off_days_payable: bool = False
    amount_received: float = 0
    payment_received_at: Optional[date] = None
    payment_mode: Optional[str] = None
    payment_details: Optional[str] = None
    payment_committed_date: Optional[date] = None
    line_items: List[dict] = Field(default_factory=list)
    payout_items: List[dict] = Field(default_factory=list)
    notes: Optional[str] = None

class AccountInvoiceRead(BaseModel):
    id: int
    invoice_number: str
    booking_id: int
    billing_mode: str
    status: str
    package_amount: float = 0
    equipment_amount: float = 0
    manpower_amount: float = 0
    logistics_amount: float = 0
    other_amount: float = 0
    discount_amount: float = 0
    tax_percent: float = 18
    subtotal_amount: float = 0
    tax_amount: float = 0
    total_amount: float = 0
    manpower_payout_amount: float = 0
    net_margin_amount: float = 0
    off_days_payable: bool = False
    amount_received: float = 0
    payment_received_at: Optional[date] = None
    payment_mode: Optional[str] = None
    payment_details: Optional[str] = None
    payment_committed_date: Optional[date] = None
    line_items_json: Optional[str] = None
    payout_json: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    class Config:
        from_attributes = True

class AccountLedgerPaymentPayload(BaseModel):
    entry_type: str
    reference: str
    amount: float
    payment_date: Optional[date] = None
    payment_mode: Optional[str] = None
    details: Optional[str] = None

class ServiceJobBase(BaseModel):
    job_number: Optional[str] = None
    inventory_item_id: int
    vendor_id: Optional[int] = None
    vendor_name: str
    sent_date: date
    expected_return_date: Optional[date] = None
    actual_return_date: Optional[date] = None
    status: str = "in_service"
    transport_mode: Optional[str] = None
    courier_partner: Optional[str] = None
    awb_number: Optional[str] = None
    contact_person_name: Optional[str] = None
    contact_person_mobile: Optional[str] = None
    alternate_contact_name: Optional[str] = None
    alternate_contact_mobile: Optional[str] = None
    contact_email: Optional[str] = None
    pickup_address: Optional[str] = None
    delivery_address: Optional[str] = None
    package_count: int = 1
    declared_value: Optional[float] = None
    package_notes: Optional[str] = None
    problem_reported: Optional[str] = None
    remarks: Optional[str] = None
    source_booking_id: Optional[int] = None
    source_damage_id: Optional[int] = None
    service_bill_amount: float = 0
    service_paid_amount: float = 0
    service_payment_date: Optional[date] = None
    service_payment_mode: Optional[str] = None
    service_payment_details: Optional[str] = None

class ServiceJobCreate(ServiceJobBase): pass

class ServiceJobAttachmentRead(BaseModel):
    id: int
    service_job_id: int
    file_name: str
    caption: Optional[str] = None
    uploaded_by: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ServiceJobRead(ServiceJobBase):
    id: int
    attachments: list[ServiceJobAttachmentRead] = []
    class Config:
        from_attributes = True

class OutboundPaperBase(BaseModel):
    paper_number: str
    paper_type: str
    reference_name: str
    destination: str
    issued_by: str
    issue_status: str = "draft"
    related_booking_id: Optional[int] = None
    related_service_job_id: Optional[int] = None
    remarks: Optional[str] = None
    signature_name: Optional[str] = None

class OutboundPaperCreate(OutboundPaperBase): pass
class OutboundPaperRead(OutboundPaperBase):
    id: int
    class Config:
        from_attributes = True

class ReturnQCCreate(BaseModel):
    booking_id: int
    checked_by: str
    all_items_returned: bool = True
    damage_found: bool = False
    cleaning_required: bool = False
    remarks: Optional[str] = None

class ReturnQCRead(ReturnQCCreate):
    id: int
    class Config:
        from_attributes = True

class DamageLogCreate(BaseModel):
    booking_id: int
    inventory_item_id: int
    damage_description: str
    severity: str = "minor"
    reported_by: str
    stage: str = "return"  # dispatch or return
    auto_create_service_job: bool = False

class DamageLogRead(BaseModel):
    id: int
    booking_id: int
    inventory_item_id: int
    damage_description: str
    severity: str
    photo_path: Optional[str] = None
    reported_by: str
    auto_service_job_id: Optional[int] = None
    stage: str
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class ProcurementBase(BaseModel):
    po_number: Optional[str] = None
    item_name: str
    item_type: str
    quantity: int = 1
    vendor_id: Optional[int] = None
    status: str = "requested"
    expected_date: Optional[date] = None
    notes: Optional[str] = None
    bill_amount: float = 0
    paid_amount: float = 0
    payment_date: Optional[date] = None
    payment_mode: Optional[str] = None
    payment_details: Optional[str] = None

class ProcurementCreate(ProcurementBase): pass
class ProcurementRead(ProcurementBase):
    id: int
    procurement_code: str
    class Config:
        from_attributes = True


class GatePassBase(BaseModel):
    booking_id: int
    pass_type: str = "gate_out"
    approved_by: str
    status: str = "issued"
    remarks: Optional[str] = None

class GatePassCreate(GatePassBase): pass
class GatePassRead(GatePassBase):
    id: int
    gate_pass_number: str
    class Config:
        from_attributes = True


class PartialReturnCreate(BaseModel):
    booking_id: int
    inventory_item_ids: list[int]
    returned_by: str
    condition_status: str = "good"
    notes: Optional[str] = None

class PartialReturnRead(BaseModel):
    id: int
    booking_id: int
    inventory_item_id: int
    returned_by: str
    condition_status: str
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class ChainOfCustodyRead(BaseModel):
    id: int
    booking_id: Optional[int] = None
    inventory_item_id: Optional[int] = None
    crew_member_id: Optional[int] = None
    event_type: str
    from_person: Optional[str] = None
    to_person: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True


class StatutoryDocumentRead(BaseModel):
    id: int
    entity_type: str
    entity_id: int
    document_name: str
    file_path: str
    uploaded_by: str
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class AuditLogRead(BaseModel):
    id: int
    created_at: datetime
    username: str
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    details_json: Optional[str] = None
    class Config:
        from_attributes = True


# ── Quotation schemas ────────────────────────────────────────────────────────

class QuotationItemCreate(BaseModel):
    description: str
    item_type: str = "equipment"
    hsn_code: Optional[str] = None
    qty: float = 1.0
    unit: str = "days"
    rate: float = 0.0
    sort_order: int = 0

class QuotationItemRead(QuotationItemCreate):
    id: int
    amount: float
    class Config:
        from_attributes = True

class QuotationCreate(BaseModel):
    client_id: int
    project_event_id: Optional[int] = None
    subject: Optional[str] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    discount_pct: float = 0.0
    tax_pct: float = 18.0
    items: List[QuotationItemCreate] = []

class QuotationUpdate(BaseModel):
    subject: Optional[str] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    discount_pct: Optional[float] = None
    tax_pct: Optional[float] = None
    items: Optional[List[QuotationItemCreate]] = None

class QuotationRead(BaseModel):
    id: int
    created_at: datetime
    updated_at: datetime
    quote_number: str
    version: int
    client_id: int
    project_event_id: Optional[int] = None
    converted_booking_id: Optional[int] = None
    status: str
    subject: Optional[str] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    discount_pct: float
    tax_pct: float
    subtotal: float
    discount_amount: float
    tax_amount: float
    total: float
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    items: List[QuotationItemRead] = []
    client_name: Optional[str] = None
    project_title: Optional[str] = None
    class Config:
        from_attributes = True
