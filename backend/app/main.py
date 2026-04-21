import os
import traceback
from sqlalchemy import inspect, text
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .database import Base, engine, SessionLocal
from .seed import seed_db
from .routers import auth_router, masters, projects, bookings, service_jobs, papers, dashboard, admin_router, system_router, audit_router, accounts, tally
from .routers import quotes as quotes_router

app = FastAPI(title="KPS ERP Enterprise API", version="9.0.0")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return clean JSON instead of 500 HTML."""
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
    )

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in origins if x.strip()],
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

# Migrate: add missing columns to existing tables that create_all won't touch
_MIGRATIONS = [
    ("chain_of_custody", "created_at", "DATETIME"),
    ("statutory_documents", "created_at", "DATETIME"),
    ("event_bookings", "billing_amount", "FLOAT DEFAULT 0.0"),
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
]
with engine.connect() as conn:
    insp = inspect(engine)
    for table_name, col_name, col_type in _MIGRATIONS:
        if table_name in insp.get_table_names():
            existing_cols = [c["name"] for c in insp.get_columns(table_name)]
            if col_name not in existing_cols:
                conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
                conn.commit()

db = SessionLocal()
try:
    seed_db(db)
finally:
    db.close()

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

@app.get("/")
def root():
    return {"message": "KPS ERP Enterprise API running", "version": "8.9.9"}
