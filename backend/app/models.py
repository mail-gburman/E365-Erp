import json
from datetime import datetime
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Boolean, Float
from sqlalchemy.orm import declared_attr, relationship
from .database import Base


class TenantMixin:
    @declared_attr
    def company_id(cls):
        return Column(Integer, ForeignKey("companies.id"), index=True, nullable=True)

    @declared_attr
    def company(cls):
        return relationship("Company")


class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    name = Column(String, unique=True, index=True, nullable=False)
    legal_name = Column(String, nullable=True)
    status = Column(String, default="active", nullable=False)
    contact_person = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    website = Column(String, nullable=True)
    gst_number = Column(String, nullable=True)
    pan_number = Column(String, nullable=True)
    billing_address = Column(Text, nullable=True)
    registered_address = Column(Text, nullable=True)
    city = Column(String, nullable=True)
    state = Column(String, nullable=True)
    country = Column(String, default="India")
    logo_path = Column(String, nullable=True)
    theme_option = Column(String, default="auto", nullable=False)
    booking_type = Column(String, default="equipment", nullable=False)  # equipment / artist / venue / decor / catering / staffing
    notes = Column(Text, nullable=True)

    @property
    def booking_profile_label(self):
        from .booking_profiles import get_booking_profile
        return get_booking_profile(self.booking_type).get("label")

    @property
    def booking_features_json(self):
        from .booking_profiles import get_booking_profile, profile_json
        return profile_json(get_booking_profile(self.booking_type), "features")

    @property
    def booking_modules_json(self):
        from .booking_profiles import get_booking_profile, profile_json
        return profile_json(get_booking_profile(self.booking_type), "modules")


class BookingTypeProfile(Base):
    __tablename__ = "booking_type_profiles"
    id = Column(Integer, primary_key=True)
    booking_type = Column(String, unique=True, index=True, nullable=False)
    label = Column(String, nullable=False)
    service_label = Column(String, nullable=True)
    service_item_label = Column(String, nullable=True)
    features_json = Column(Text, nullable=False)
    modules_json = Column(Text, nullable=False)


class CompanyDocument(Base):
    __tablename__ = "company_documents"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    company_id = Column(Integer, ForeignKey("companies.id"), index=True, nullable=False)
    document_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    uploaded_by = Column(String, nullable=False)

    company = relationship("Company")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin / operations / store / producer / qc / viewer / accounts
    full_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), index=True, nullable=True)
    permissions_json = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    max_sessions = Column(Integer, default=5, nullable=False)  # 0 = unlimited

    company = relationship("Company")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")

    @property
    def company_name(self):
        return self.company.name if self.company else None


class RolePreset(Base):
    """Admin-managed named permission templates."""
    __tablename__ = "role_presets"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False, index=True)
    description = Column(String, nullable=True)
    permissions_json = Column(Text, nullable=False)
    is_builtin = Column(Boolean, default=False, nullable=False)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserSession(Base):
    """Tracks every active login session for auditing and concurrent-session control."""
    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_jti = Column(String, unique=True, index=True, nullable=False)  # JWT jti claim
    device_id = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent_raw = Column(Text, nullable=True)
    os = Column(String, nullable=True)
    browser = Column(String, nullable=True)
    device_type = Column(String, nullable=True)  # Desktop / Mobile / Tablet
    login_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_active_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    user = relationship("User", back_populates="sessions")

class Warehouse(TenantMixin, Base):
    __tablename__ = "warehouses"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    city = Column(String, nullable=False)
    address = Column(Text, nullable=True)
    manager_name = Column(String, nullable=True)
    contact_no = Column(String, nullable=True)

class Vendor(TenantMixin, Base):
    __tablename__ = "vendors"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    vendor_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    vendor_type = Column(String, nullable=False)  # service / equipment / crew / logistics / procurement
    city = Column(String, nullable=True)
    contact_person = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    gst_number = Column(String, nullable=True)
    pan_number = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

class Client(TenantMixin, Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    client_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    industry_type = Column(String, nullable=True)
    billing_address = Column(Text, nullable=True)
    gst_number = Column(String, nullable=True)
    pan_number = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    is_demo = Column(Boolean, default=False)

    contacts = relationship("ClientContact", back_populates="client", cascade="all, delete-orphan")

class ClientContact(TenantMixin, Base):
    __tablename__ = "client_contacts"
    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    contact_name = Column(String, nullable=False)
    designation = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone_country_code = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    is_primary = Column(Boolean, default=False)

    client = relationship("Client", back_populates="contacts")

class InventoryItem(TenantMixin, Base):
    __tablename__ = "inventory_items"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    asset_code = Column(String, unique=True, index=True, nullable=False)
    product_code = Column(String, unique=True, index=True, nullable=False)
    serial_number = Column(String, nullable=True)  # NEW: Serial No. of Device
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    item_type = Column(String, nullable=False, default="device")  # device/accessory/kit/bundle/third_party_equipment/consumable
    parent_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True)
    owner_type = Column(String, default="inhouse")  # inhouse/third_party
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    status = Column(String, default="available")  # available/reserved/on_shoot/servicing/cancelled/inactive
    location_text = Column(String, nullable=True)
    warranty_expiry = Column(Date, nullable=True)
    service_due = Column(Date, nullable=True)
    service_status = Column(String, default="not_in_service")
    statutory_tag = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    equipment_master_id = Column(Integer, ForeignKey("equipment_master.id"), nullable=True)
    # Third-party rental window — item is only available within these dates
    vendor_available_from = Column(Date, nullable=True)
    vendor_available_until = Column(Date, nullable=True)
    # Consumable stock tracking
    qty_in_stock = Column(Integer, nullable=True)
    is_demo = Column(Boolean, default=False)

    warehouse = relationship("Warehouse")
    vendor = relationship("Vendor")
    parent_item = relationship("InventoryItem", remote_side=[id], back_populates="children")
    children = relationship("InventoryItem", foreign_keys="InventoryItem.parent_item_id", back_populates="parent_item")
    equipment_master = relationship("EquipmentMaster")


class EquipmentMaster(TenantMixin, Base):
    __tablename__ = "equipment_master"
    id = Column(Integer, primary_key=True)
    equipment_code = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    item_type = Column(String, nullable=False, default="device")
    brand = Column(String, nullable=True)
    model_no = Column(String, nullable=True)
    mandatory_accessory_codes = Column(Text, nullable=True)
    optional_accessory_codes = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

class CrewMember(TenantMixin, Base):
    __tablename__ = "crew_members"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    employee_code = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    manpower_type = Column(String, default="inhouse")  # inhouse/external/contractual/freelance
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    home_station = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)  # NEW: Crew address field
    aadhar_number = Column(String, nullable=True)  # NEW: Aadhar linked
    id_proof_type = Column(String, nullable=True)
    id_proof_number = Column(String, nullable=True)
    pan_number = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)
    id_proofs_json = Column(Text, nullable=True)  # NEW: JSON list of {type, number, file_url?} supporting multiple ID proofs per crew

    @property
    def id_proofs(self):
        if not self.id_proofs_json:
            # Fallback: synthesize from legacy single id_proof columns
            if self.id_proof_type or self.id_proof_number:
                return [{"type": self.id_proof_type, "number": self.id_proof_number}]
            return []
        try:
            parsed = json.loads(self.id_proofs_json)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
        return []
    status = Column(String, default="available")
    is_demo = Column(Boolean, default=False)

    vendor = relationship("Vendor")

class ProjectEvent(TenantMixin, Base):
    __tablename__ = "project_events"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    title = Column(String, nullable=False)
    show_type = Column(String, nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    venue = Column(String, nullable=False)
    origin_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True)
    shoot_start = Column(DateTime, nullable=True)
    shoot_end = Column(DateTime, nullable=True)  # NEW: Event End datetime
    setup_date = Column(Date, nullable=True)  # NEW: Setup Date / Technical check
    off_days = Column(Integer, default=0)  # NEW: Off Days
    expected_start_date = Column(Date, nullable=True)  # NEW: Expected dates
    expected_end_date = Column(Date, nullable=True)  # NEW: Expected dates
    setup_days = Column(Integer, default=0)
    block_start = Column(DateTime, nullable=True)
    block_end = Column(DateTime, nullable=True)
    status = Column(String, default="draft")  # draft/planned/confirmed/cancelled
    notes = Column(Text, nullable=True)
    is_demo = Column(Boolean, default=False)

    origin_warehouse = relationship("Warehouse")
    client = relationship("Client")
    dates = relationship("ProjectDate", back_populates="project", cascade="all, delete-orphan")

class ProjectDate(TenantMixin, Base):
    __tablename__ = "project_dates"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("project_events.id"), nullable=False)
    date_type = Column(String, nullable=False)  # start_date, end_date, setup_date, technical_date, off_day
    date_value = Column(Date, nullable=False)

    project = relationship("ProjectEvent", back_populates="dates")

class EventBooking(TenantMixin, Base):
    __tablename__ = "event_bookings"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    booking_code = Column(String, unique=True, index=True, nullable=True)
    job_card_id = Column(String, unique=True, index=True, nullable=True)  # Issued only after confirmation
    project_id = Column(Integer, ForeignKey("project_events.id"), nullable=False)
    parent_booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=True)  # NEW: for supplementary bookings
    destination = Column(String, nullable=False)
    status = Column(String, default="planned")  # planned/confirmed/blocked/dispatched/returned/cancelled
    cancellation_reason = Column(Text, nullable=True)  # NEW: Cancellation reason
    remarks = Column(Text, nullable=True)
    is_conflict = Column(Boolean, default=False)
    # Transport info
    transport_mode = Column(String, nullable=True)  # NEW: company_vehicle / hired / courier / self
    awb_number = Column(String, nullable=True)  # NEW: Air Waybill / Tracking Number
    # Aadhar + Mobile linked with booking
    contact_person_name = Column(String, nullable=True)  # NEW
    contact_person_mobile = Column(String, nullable=True)  # NEW
    contact_person_aadhar = Column(String, nullable=True)  # NEW
    booking_contacts_json = Column(Text, nullable=True)
    # New fields
    call_time = Column(DateTime, nullable=True)
    packup_time = Column(DateTime, nullable=True)
    is_demo = Column(Boolean, default=False)

    project = relationship("ProjectEvent")
    parent_booking = relationship("EventBooking", remote_side=[id])
    equipment = relationship("BookingEquipment", back_populates="booking", cascade="all, delete-orphan")
    crew = relationship("BookingCrew", back_populates="booking", cascade="all, delete-orphan")

    @property
    def contacts(self):
        if self.booking_contacts_json:
            try:
                parsed = json.loads(self.booking_contacts_json)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass
        if self.contact_person_name:
            return [{
                "name": self.contact_person_name,
                "mobile": self.contact_person_mobile,
                "aadhar": self.contact_person_aadhar,
            }]
        return []

class BookingEquipment(TenantMixin, Base):
    __tablename__ = "booking_equipment"
    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=False)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)

    booking = relationship("EventBooking", back_populates="equipment")
    inventory_item = relationship("InventoryItem")

class BookingCrew(TenantMixin, Base):
    __tablename__ = "booking_crew"
    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=False)
    crew_member_id = Column(Integer, ForeignKey("crew_members.id"), nullable=False)

    booking = relationship("EventBooking", back_populates="crew")
    crew_member = relationship("CrewMember")

class AccountInvoice(TenantMixin, Base):
    __tablename__ = "account_invoices"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    invoice_number = Column(String, unique=True, index=True, nullable=False)
    booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=False)
    billing_mode = Column(String, default="line_item")  # line_item/package
    status = Column(String, default="draft")  # draft/approved/sent/paid/cancelled
    package_amount = Column(Float, default=0.0)
    equipment_amount = Column(Float, default=0.0)
    manpower_amount = Column(Float, default=0.0)
    logistics_amount = Column(Float, default=0.0)
    other_amount = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    tax_percent = Column(Float, default=18.0)
    subtotal_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    manpower_payout_amount = Column(Float, default=0.0)
    net_margin_amount = Column(Float, default=0.0)
    off_days_payable = Column(Boolean, default=False)
    amount_received = Column(Float, default=0.0)
    payment_received_at = Column(Date, nullable=True)
    payment_mode = Column(String, nullable=True)
    payment_details = Column(Text, nullable=True)
    payment_committed_date = Column(Date, nullable=True)
    line_items_json = Column(Text, nullable=True)
    payout_json = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)
    is_demo = Column(Boolean, default=False)

    booking = relationship("EventBooking")

class AccountLedgerPayment(TenantMixin, Base):
    __tablename__ = "account_ledger_payments"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    entry_type = Column(String, nullable=False)  # client/manpower/vendor/service
    reference = Column(String, nullable=False, index=True)
    amount = Column(Float, default=0.0)
    payment_date = Column(Date, nullable=True)
    payment_mode = Column(String, nullable=True)
    details = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)

class TallyConnector(TenantMixin, Base):
    __tablename__ = "tally_connectors"
    id = Column(Integer, primary_key=True)
    org_id = Column(String, default="default", index=True)
    connector_name = Column(String, nullable=False)
    connector_token_hash = Column(String, nullable=False)
    polling_enabled = Column(Boolean, default=True)
    last_seen_at = Column(DateTime, nullable=True)
    machine_name = Column(String, nullable=True)
    tally_host = Column(String, default="127.0.0.1")
    tally_port = Column(Integer, default=9000)
    company_name = Column(String, nullable=True)
    import_mode = Column(String, default="hybrid")  # live_http/file_import/hybrid
    odbc_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class TallySyncJob(TenantMixin, Base):
    __tablename__ = "tally_sync_jobs"
    id = Column(Integer, primary_key=True)
    org_id = Column(String, default="default", index=True)
    job_type = Column(String, nullable=False)  # invoice/receipt/credit_note/ledger_sync
    source_document_type = Column(String, nullable=False)
    source_document_id = Column(Integer, nullable=False)
    source_document_no = Column(String, nullable=False)
    payload_json = Column(Text, nullable=False)
    payload_hash = Column(String, index=True, nullable=False)
    status = Column(String, default="pending", index=True)
    retry_count = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)
    raw_response_excerpt = Column(Text, nullable=True)
    connector_id = Column(Integer, ForeignKey("tally_connectors.id"), nullable=True)
    next_attempt_at = Column(DateTime, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    connector = relationship("TallyConnector")

class TallyMapping(TenantMixin, Base):
    __tablename__ = "tally_mappings"
    id = Column(Integer, primary_key=True)
    org_id = Column(String, default="default", index=True)
    mapping_type = Column(String, nullable=False)
    erp_key = Column(String, nullable=False)
    erp_label = Column(String, nullable=True)
    tally_name = Column(String, nullable=False)
    tally_guid_optional = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    metadata_json = Column(Text, nullable=True)

class TallySyncResult(TenantMixin, Base):
    __tablename__ = "tally_sync_results"
    id = Column(Integer, primary_key=True)
    sync_job_id = Column(Integer, ForeignKey("tally_sync_jobs.id"), nullable=False)
    tally_voucher_number = Column(String, nullable=True)
    tally_master_id_optional = Column(String, nullable=True)
    tally_reference = Column(String, nullable=True)
    sync_direction = Column(String, default="erp_to_tally")
    status = Column(String, nullable=False)
    normalized_message = Column(Text, nullable=True)
    raw_request_path_optional = Column(String, nullable=True)
    raw_response_path_optional = Column(String, nullable=True)
    outstanding_amount = Column(Float, nullable=True)
    payment_status = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    sync_job = relationship("TallySyncJob")

class ServiceJob(TenantMixin, Base):
    __tablename__ = "service_jobs"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    job_number = Column(String, unique=True, index=True, nullable=False)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    vendor_name = Column(String, nullable=False)
    sent_date = Column(Date, nullable=False)
    expected_return_date = Column(Date, nullable=True)
    actual_return_date = Column(Date, nullable=True)
    status = Column(String, default="in_service")
    transport_mode = Column(String, nullable=True)
    courier_partner = Column(String, nullable=True)
    awb_number = Column(String, nullable=True)
    contact_person_name = Column(String, nullable=True)
    contact_person_mobile = Column(String, nullable=True)
    alternate_contact_name = Column(String, nullable=True)
    alternate_contact_mobile = Column(String, nullable=True)
    contact_email = Column(String, nullable=True)
    pickup_address = Column(Text, nullable=True)
    delivery_address = Column(Text, nullable=True)
    package_count = Column(Integer, default=1)
    declared_value = Column(Float, nullable=True)
    package_notes = Column(Text, nullable=True)
    problem_reported = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    service_bill_amount = Column(Float, default=0.0)
    service_paid_amount = Column(Float, default=0.0)
    service_payment_date = Column(Date, nullable=True)
    service_payment_mode = Column(String, nullable=True)
    service_payment_details = Column(Text, nullable=True)
    # Link to booking damage
    source_booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=True)  # NEW: auto-created from damage
    source_damage_id = Column(Integer, ForeignKey("damage_logs.id"), nullable=True)  # NEW
    is_demo = Column(Boolean, default=False)

    inventory_item = relationship("InventoryItem")
    vendor = relationship("Vendor")
    source_booking = relationship("EventBooking")
    attachments = relationship("ServiceJobAttachment", back_populates="service_job", cascade="all, delete-orphan", order_by="ServiceJobAttachment.created_at.desc()")


class ServiceJobAttachment(TenantMixin, Base):
    __tablename__ = "service_job_attachments"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    service_job_id = Column(Integer, ForeignKey("service_jobs.id"), nullable=False, index=True)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    caption = Column(Text, nullable=True)
    uploaded_by = Column(String, nullable=False)

    service_job = relationship("ServiceJob", back_populates="attachments")

class OutboundPaper(TenantMixin, Base):
    __tablename__ = "outbound_papers"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    paper_number = Column(String, unique=True, index=True, nullable=False)
    paper_type = Column(String, nullable=False)
    reference_name = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    issued_by = Column(String, nullable=False)
    issue_status = Column(String, default="draft")
    related_booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=True)
    related_service_job_id = Column(Integer, ForeignKey("service_jobs.id"), nullable=True)
    remarks = Column(Text, nullable=True)
    signature_name = Column(String, nullable=True)  # NEW: Signature required
    is_demo = Column(Boolean, default=False)

    related_booking = relationship("EventBooking")
    related_service_job = relationship("ServiceJob")


class DamageLog(TenantMixin, Base):
    """NEW: Per-item damage logging with photo upload support."""
    __tablename__ = "damage_logs"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=False)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    damage_description = Column(Text, nullable=False)
    severity = Column(String, default="minor")  # minor / major / critical
    photo_path = Column(String, nullable=True)  # path to uploaded damage photo
    reported_by = Column(String, nullable=False)
    auto_service_job_id = Column(Integer, ForeignKey("service_jobs.id"), nullable=True)  # auto-created service job
    stage = Column(String, default="dispatch")  # dispatch / return — when damage was logged

    booking = relationship("EventBooking")
    inventory_item = relationship("InventoryItem")
    auto_service_job = relationship("ServiceJob", foreign_keys=[auto_service_job_id])


class PartialReturn(TenantMixin, Base):
    __tablename__ = "partial_returns"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=False)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    returned_by = Column(String, nullable=False)
    condition_status = Column(String, default="good")  # good/damaged/missing/incomplete
    notes = Column(Text, nullable=True)

    booking = relationship("EventBooking")
    inventory_item = relationship("InventoryItem")

class ChainOfCustody(TenantMixin, Base):
    __tablename__ = "chain_of_custody"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True)
    crew_member_id = Column(Integer, ForeignKey("crew_members.id"), nullable=True)
    event_type = Column(String, nullable=False)  # assign/gate_out/handover/partial_return/gate_in/cancel
    from_person = Column(String, nullable=True)
    to_person = Column(String, nullable=True)
    location = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    booking = relationship("EventBooking")
    inventory_item = relationship("InventoryItem")
    crew_member = relationship("CrewMember")

class GatePass(TenantMixin, Base):
    __tablename__ = "gate_passes"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    gate_pass_number = Column(String, unique=True, index=True, nullable=False)
    booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=False)
    pass_type = Column(String, default="gate_out")  # gate_out/gate_in
    approved_by = Column(String, nullable=False)
    status = Column(String, default="issued")
    remarks = Column(Text, nullable=True)

    booking = relationship("EventBooking")

class ReturnQC(TenantMixin, Base):
    __tablename__ = "return_qc"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=False)
    checked_by = Column(String, nullable=False)
    all_items_returned = Column(Boolean, default=True)
    damage_found = Column(Boolean, default=False)
    cleaning_required = Column(Boolean, default=False)
    remarks = Column(Text, nullable=True)

    booking = relationship("EventBooking")

class ProcurementOrder(TenantMixin, Base):
    __tablename__ = "procurement_orders"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    po_number = Column(String, unique=True, index=True, nullable=False)
    procurement_code = Column(String, unique=True, index=True, nullable=False)
    item_name = Column(String, nullable=False)
    item_type = Column(String, nullable=False)  # equipment/accessory/consumable/manpower
    quantity = Column(Integer, default=1)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    status = Column(String, default="requested")  # requested/ordered/received/cancelled
    expected_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    bill_amount = Column(Float, default=0.0)
    paid_amount = Column(Float, default=0.0)
    payment_date = Column(Date, nullable=True)
    payment_mode = Column(String, nullable=True)
    payment_details = Column(Text, nullable=True)
    is_demo = Column(Boolean, default=False)

    vendor = relationship("Vendor")


class KitAccessoryRule(TenantMixin, Base):
    __tablename__ = "kit_accessory_rules"
    id = Column(Integer, primary_key=True)
    parent_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    accessory_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False)
    is_mandatory = Column(Boolean, default=True)

class StatutoryDocument(TenantMixin, Base):
    __tablename__ = "statutory_documents"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    entity_type = Column(String, nullable=False)  # vendor/client/inventory/crew/warehouse/booking/damage
    entity_id = Column(Integer, nullable=False)
    document_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    uploaded_by = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    is_demo = Column(Boolean, default=False)

class AuditLog(TenantMixin, Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    username = Column(String, nullable=False)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(String, nullable=True)
    details_json = Column(Text, nullable=True)


class Quotation(TenantMixin, Base):
    __tablename__ = "quotations"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    quote_number = Column(String, unique=True, index=True, nullable=False)
    version = Column(Integer, default=1)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    project_event_id = Column(Integer, ForeignKey("project_events.id"), nullable=True)
    converted_booking_id = Column(Integer, ForeignKey("event_bookings.id"), nullable=True)
    status = Column(String, default="draft")  # draft/sent/accepted/rejected/expired/converted
    valid_until = Column(Date, nullable=True)
    subject = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    terms = Column(Text, nullable=True)
    discount_pct = Column(Float, default=0.0)
    tax_pct = Column(Float, default=18.0)
    subtotal = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    tax_amount = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    created_by = Column(String, nullable=True)
    updated_by = Column(String, nullable=True)

    client = relationship("Client")
    project_event = relationship("ProjectEvent", foreign_keys=[project_event_id])
    converted_booking = relationship("EventBooking", foreign_keys=[converted_booking_id])
    items = relationship("QuotationItem", back_populates="quotation", cascade="all, delete-orphan", order_by="QuotationItem.id")


class QuotationItem(TenantMixin, Base):
    __tablename__ = "quotation_items"
    id = Column(Integer, primary_key=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False)
    sort_order = Column(Integer, default=0)
    description = Column(String, nullable=False)
    item_type = Column(String, default="equipment")  # equipment/accessory/crew/logistics/other
    hsn_code = Column(String, nullable=True)
    qty = Column(Float, default=1.0)
    unit = Column(String, default="days")
    rate = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)

    quotation = relationship("Quotation", back_populates="items")
