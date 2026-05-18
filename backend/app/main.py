import os
import traceback
from sqlalchemy import inspect, text
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .env import load_env

load_env()

from .database import Base, clear_current_company_id, configure_tenant_scoping, engine, SessionLocal
from . import models
from .seed import seed_db
from .routers import auth_router, masters, projects, bookings, service_jobs, papers, dashboard, admin_router, system_router, audit_router, accounts, tally
from .routers import quotes as quotes_router
from .routers import activation_router

configure_tenant_scoping(models)

app = FastAPI(title="Eventory API", version="9.1.0")

@app.middleware("http")
async def tenant_context_middleware(request: Request, call_next):
    clear_current_company_id()
    try:
        return await call_next(request)
    finally:
        clear_current_company_id()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return clean JSON instead of 500 HTML."""
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
    )

_raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5175,http://127.0.0.1:5175,http://localhost:5173,http://127.0.0.1:5173")
origins = [x.strip() for x in _raw_origins.split(",") if x.strip()]
# Allow all vercel.app preview URLs automatically
allow_origin_regex = r"https://.*\.vercel\.app"
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=allow_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

def _migrate_project_events_nullable():
    if engine.dialect.name != "sqlite":
        return
    insp = inspect(engine)
    if "project_events" not in insp.get_table_names():
        return
    cols = {c["name"]: c for c in insp.get_columns("project_events")}
    if cols.get("shoot_start", {}).get("nullable") and cols.get("block_start", {}).get("nullable") and cols.get("block_end", {}).get("nullable"):
        return
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS project_events_new (
                id INTEGER PRIMARY KEY,
                created_at DATETIME,
                title VARCHAR NOT NULL,
                show_type VARCHAR NOT NULL,
                client_id INTEGER,
                venue VARCHAR NOT NULL,
                origin_warehouse_id INTEGER,
                shoot_start DATETIME,
                shoot_end DATETIME,
                setup_date DATE,
                off_days INTEGER DEFAULT 0,
                expected_start_date DATE,
                expected_end_date DATE,
                setup_days INTEGER DEFAULT 0,
                block_start DATETIME,
                block_end DATETIME,
                status VARCHAR DEFAULT 'draft',
                notes TEXT,
                FOREIGN KEY(client_id) REFERENCES clients (id),
                FOREIGN KEY(origin_warehouse_id) REFERENCES warehouses (id)
            )
        """))
        conn.execute(text("""
            INSERT INTO project_events_new (
                id, created_at, title, show_type, client_id, venue, origin_warehouse_id, shoot_start, shoot_end,
                setup_date, off_days, expected_start_date, expected_end_date, setup_days, block_start, block_end, status, notes
            )
            SELECT
                id, created_at, title, show_type, client_id, venue, origin_warehouse_id, shoot_start, shoot_end,
                setup_date, off_days, expected_start_date, expected_end_date, setup_days, block_start, block_end, status, notes
            FROM project_events
        """))
        conn.execute(text("DROP TABLE project_events"))
        conn.execute(text("ALTER TABLE project_events_new RENAME TO project_events"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()

_migrate_project_events_nullable()

def _migrate_event_bookings_identity_columns():
    if engine.dialect.name != "sqlite":
        return
    insp = inspect(engine)
    if "event_bookings" not in insp.get_table_names():
        return
    cols = {c["name"]: c for c in insp.get_columns("event_bookings")}
    needs_nullable_job_card = not cols.get("job_card_id", {}).get("nullable", True)
    needs_booking_code_index = "booking_code" in cols and not any(idx.get("name") == "ix_event_bookings_booking_code" for idx in insp.get_indexes("event_bookings"))
    if not needs_nullable_job_card and not needs_booking_code_index:
        return
    with engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        if needs_nullable_job_card:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS event_bookings_new (
                    id INTEGER PRIMARY KEY,
                    created_at DATETIME,
                    booking_code VARCHAR,
                    job_card_id VARCHAR,
                    project_id INTEGER NOT NULL,
                    parent_booking_id INTEGER,
                    destination VARCHAR NOT NULL,
                    status VARCHAR,
                    cancellation_reason TEXT,
                    remarks TEXT,
                    is_conflict BOOLEAN,
                    transport_mode VARCHAR,
                    awb_number VARCHAR,
                    contact_person_name VARCHAR,
                    contact_person_mobile VARCHAR,
                    contact_person_aadhar VARCHAR,
                    booking_contacts_json TEXT,
                    call_time DATETIME,
                    packup_time DATETIME,
                    is_demo BOOLEAN,
                    billing_amount FLOAT DEFAULT 0.0,
                    FOREIGN KEY(project_id) REFERENCES project_events (id),
                    FOREIGN KEY(parent_booking_id) REFERENCES event_bookings (id)
                )
            """))
            conn.execute(text("""
                INSERT INTO event_bookings_new (
                    id, created_at, booking_code, job_card_id, project_id, parent_booking_id,
                    destination, status, cancellation_reason, remarks, is_conflict,
                    transport_mode, awb_number, contact_person_name, contact_person_mobile,
                    contact_person_aadhar, booking_contacts_json, call_time, packup_time,
                    is_demo, billing_amount
                )
                SELECT
                    id, created_at, booking_code, job_card_id, project_id, parent_booking_id,
                    destination, status, cancellation_reason, remarks, is_conflict,
                    transport_mode, awb_number, contact_person_name, contact_person_mobile,
                    contact_person_aadhar, booking_contacts_json, call_time, packup_time,
                    is_demo, billing_amount
                FROM event_bookings
            """))
            conn.execute(text("DROP TABLE event_bookings"))
            conn.execute(text("ALTER TABLE event_bookings_new RENAME TO event_bookings"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_event_bookings_job_card_id ON event_bookings (job_card_id)"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_event_bookings_booking_code ON event_bookings (booking_code)"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        conn.commit()

# Migrate: add missing columns to existing tables that create_all won't touch
_MIGRATIONS = [
    ("users", "company_id", "INTEGER"),
    ("companies", "legal_name", "VARCHAR"),
    ("companies", "status", "VARCHAR DEFAULT 'active'"),
    ("companies", "contact_person", "VARCHAR"),
    ("companies", "phone", "VARCHAR"),
    ("companies", "email", "VARCHAR"),
    ("companies", "website", "VARCHAR"),
    ("companies", "gst_number", "VARCHAR"),
    ("companies", "pan_number", "VARCHAR"),
    ("companies", "billing_address", "TEXT"),
    ("companies", "registered_address", "TEXT"),
    ("companies", "city", "VARCHAR"),
    ("companies", "state", "VARCHAR"),
    ("companies", "country", "VARCHAR"),
    ("companies", "logo_path", "VARCHAR"),
    ("companies", "theme_option", "VARCHAR DEFAULT 'auto'"),
    ("companies", "booking_type", "VARCHAR DEFAULT 'equipment'"),
    ("companies", "notes", "TEXT"),
    ("chain_of_custody", "created_at", "DATETIME"),
    ("statutory_documents", "created_at", "DATETIME"),
    ("event_bookings", "billing_amount", "FLOAT DEFAULT 0.0"),
    ("event_bookings", "booking_code", "VARCHAR"),
    # New fields
    ("inventory_items", "serial_number", "VARCHAR"),
    ("inventory_items", "is_demo", "BOOLEAN DEFAULT 0"),
    ("crew_members", "address", "TEXT"),
    ("crew_members", "aadhar_number", "VARCHAR"),
    ("crew_members", "id_proofs_json", "TEXT"),
    ("crew_members", "is_demo", "BOOLEAN DEFAULT 0"),
    ("project_events", "shoot_end", "DATETIME"),
    ("project_events", "setup_date", "DATE"),
    ("project_events", "off_days", "INTEGER DEFAULT 0"),
    ("project_events", "expected_start_date", "DATE"),
    ("project_events", "expected_end_date", "DATE"),
    ("project_events", "is_demo", "BOOLEAN DEFAULT 0"),
    ("event_bookings", "job_card_id", "VARCHAR"),
    ("event_bookings", "parent_booking_id", "INTEGER"),
    ("event_bookings", "cancellation_reason", "TEXT"),
    ("event_bookings", "transport_mode", "VARCHAR"),
    ("event_bookings", "awb_number", "VARCHAR"),
    ("event_bookings", "contact_person_name", "VARCHAR"),
    ("event_bookings", "contact_person_mobile", "VARCHAR"),
    ("event_bookings", "contact_person_aadhar", "VARCHAR"),
    ("event_bookings", "booking_contacts_json", "TEXT"),
    ("event_bookings", "call_time", "DATETIME"),
    ("event_bookings", "is_demo", "BOOLEAN DEFAULT 0"),
    ("clients", "is_demo", "BOOLEAN DEFAULT 0"),
    ("service_jobs", "is_demo", "BOOLEAN DEFAULT 0"),
    ("outbound_papers", "is_demo", "BOOLEAN DEFAULT 0"),
    ("procurement_orders", "is_demo", "BOOLEAN DEFAULT 0"),
    ("statutory_documents", "is_demo", "BOOLEAN DEFAULT 0"),
    ("users", "full_name", "VARCHAR"),
    ("users", "phone", "VARCHAR"),
    ("users", "email", "VARCHAR"),
    ("outbound_papers", "signature_name", "VARCHAR"),
    ("service_jobs", "source_booking_id", "INTEGER"),
    ("service_jobs", "source_damage_id", "INTEGER"),
    ("account_invoices", "off_days_payable", "BOOLEAN DEFAULT 0"),
    ("account_invoices", "amount_received", "FLOAT DEFAULT 0.0"),
    ("account_invoices", "payment_received_at", "DATE"),
    ("account_invoices", "payment_mode", "VARCHAR"),
    ("account_invoices", "payment_details", "TEXT"),
    ("account_invoices", "payment_committed_date", "DATE"),
    ("procurement_orders", "bill_amount", "FLOAT DEFAULT 0.0"),
    ("procurement_orders", "paid_amount", "FLOAT DEFAULT 0.0"),
    ("procurement_orders", "payment_date", "DATE"),
    ("procurement_orders", "payment_mode", "VARCHAR"),
    ("procurement_orders", "payment_details", "TEXT"),
    ("service_jobs", "service_bill_amount", "FLOAT DEFAULT 0.0"),
    ("service_jobs", "service_paid_amount", "FLOAT DEFAULT 0.0"),
    ("service_jobs", "service_payment_date", "DATE"),
    ("service_jobs", "service_payment_mode", "VARCHAR"),
    ("service_jobs", "transport_mode", "VARCHAR"),
    ("service_jobs", "courier_partner", "VARCHAR"),
    ("service_jobs", "awb_number", "VARCHAR"),
    ("service_jobs", "contact_person_name", "VARCHAR"),
    ("service_jobs", "contact_person_mobile", "VARCHAR"),
    ("service_jobs", "alternate_contact_name", "VARCHAR"),
    ("service_jobs", "alternate_contact_mobile", "VARCHAR"),
    ("service_jobs", "contact_email", "VARCHAR"),
    ("service_jobs", "pickup_address", "TEXT"),
    ("service_jobs", "delivery_address", "TEXT"),
    ("service_jobs", "package_count", "INTEGER DEFAULT 1"),
    ("service_jobs", "declared_value", "FLOAT"),
    ("service_jobs", "package_notes", "TEXT"),
    ("service_jobs", "service_payment_details", "TEXT"),
    # 0006 — inventory extensions
    ("inventory_items", "vendor_available_from", "DATE"),
    ("inventory_items", "vendor_available_until", "DATE"),
    ("inventory_items", "qty_in_stock", "INTEGER"),
    # 0007 — session management
    ("users", "max_sessions", "INTEGER DEFAULT 5"),
    ("user_sessions", "device_id", "VARCHAR"),
    # 0008 — role presets timestamps
    ("role_presets", "updated_at", "DATETIME"),
    # 0009 — per-company license installation_id
    ("companies", "installation_id", "VARCHAR"),
]
_TENANT_TABLES = [
    "warehouses", "vendors", "clients", "client_contacts", "inventory_items",
    "equipment_master", "crew_members", "project_events", "project_dates",
    "event_bookings", "booking_equipment", "booking_crew", "account_invoices",
    "account_ledger_payments", "tally_connectors", "tally_sync_jobs",
    "tally_mappings", "tally_sync_results", "service_jobs",
    "service_job_attachments", "outbound_papers", "damage_logs",
    "partial_returns", "chain_of_custody", "gate_passes", "return_qc",
    "procurement_orders", "kit_accessory_rules", "statutory_documents",
    "audit_logs", "quotations", "quotation_items",
]
_MIGRATIONS.extend((table_name, "company_id", "INTEGER") for table_name in _TENANT_TABLES)
with engine.connect() as conn:
    insp = inspect(engine)
    for table_name, col_name, col_type in _MIGRATIONS:
        if table_name in insp.get_table_names():
            existing_cols = [c["name"] for c in insp.get_columns(table_name)]
            if col_name not in existing_cols:
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
                conn.commit()

    insp = inspect(engine)
    if "companies" in insp.get_table_names():
        row = conn.execute(text("SELECT id FROM companies ORDER BY id ASC LIMIT 1")).first()
        if not row:
            conn.execute(text("""
                INSERT INTO companies (created_at, name, legal_name, status, country, theme_option, booking_type)
                VALUES (CURRENT_TIMESTAMP, 'E365 Demo Event Company', 'E365 Demo Event Company', 'active', 'India', 'auto', 'equipment')
            """))
            conn.commit()
            row = conn.execute(text("SELECT id FROM companies ORDER BY id ASC LIMIT 1")).first()
        default_company_id = row[0] if row else None
        if default_company_id:
            for table_name in _TENANT_TABLES:
                if table_name in insp.get_table_names():
                    existing_cols = [c["name"] for c in insp.get_columns(table_name)]
                    if "company_id" in existing_cols:
                        conn.execute(text(f"UPDATE {table_name} SET company_id = :company_id WHERE company_id IS NULL"), {"company_id": default_company_id})
            if "users" in insp.get_table_names():
                conn.execute(text("UPDATE users SET company_id = :company_id WHERE company_id IS NULL AND role != 'super_admin'"), {"company_id": default_company_id})
                conn.execute(text("""
                    UPDATE users
                    SET company_id = :company_id
                    WHERE role != 'super_admin'
                      AND company_id IS NOT NULL
                      AND company_id NOT IN (SELECT id FROM companies)
                """), {"company_id": default_company_id})
            conn.commit()

_migrate_event_bookings_identity_columns()

db = SessionLocal()
try:
    seed_db(db)
finally:
    db.close()


def _normalize_booking_identity_columns():
    db = SessionLocal()
    try:
        from .codegen import next_booking_code, next_job_card_id, next_supplementary_job_card_id

        bookings = db.query(models.EventBooking).order_by(models.EventBooking.id.asc()).all()
        changed = False
        root_job_cards: dict[int, str] = {}

        for booking in bookings:
            if not getattr(booking, "booking_code", None):
                booking.booking_code = next_booking_code(db)
                db.flush()
                changed = True

        for booking in bookings:
            if booking.parent_booking and (booking.status or "").lower() != (booking.parent_booking.status or "").lower():
                booking.status = booking.parent_booking.status
                changed = True

        for booking in bookings:
            effective_status = (booking.status or "").lower()
            if effective_status == "planned" and booking.job_card_id:
                booking.job_card_id = None
                changed = True

        for booking in bookings:
            effective_status = (booking.status or "").lower()
            if effective_status not in {"confirmed", "dispatched", "returned", "closed", "completed"}:
                continue
            if booking.parent_booking_id:
                root = booking
                while root.parent_booking_id and root.parent_booking:
                    root = root.parent_booking
                if not root.job_card_id:
                    root.job_card_id = root_job_cards.get(root.id) or next_job_card_id(db)
                    root_job_cards[root.id] = root.job_card_id
                    changed = True
                if not booking.job_card_id:
                    booking.job_card_id = next_supplementary_job_card_id(db, root.job_card_id)
                    changed = True
            elif not booking.job_card_id:
                booking.job_card_id = next_job_card_id(db)
                root_job_cards[booking.id] = booking.job_card_id
                changed = True

        if changed:
            db.commit()
    finally:
        db.close()


_normalize_booking_identity_columns()

app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(masters.router)
app.include_router(projects.router)
app.include_router(bookings.router)
app.include_router(service_jobs.router)
app.include_router(papers.router)
app.include_router(dashboard.router)
app.include_router(accounts.router)
app.include_router(tally.integration_router)
app.include_router(tally.accounts_tally_router)
app.include_router(system_router.router)
app.include_router(audit_router.router)
app.include_router(quotes_router.router)
app.include_router(activation_router.router)

@app.get("/")
def root():
    return {"message": "Eventory API running", "version": "9.1.0"}
