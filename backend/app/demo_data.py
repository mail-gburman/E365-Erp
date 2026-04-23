from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta
from pathlib import Path

from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from . import models
from .audit import audit


ASSET_PLACEHOLDER = Path(__file__).resolve().parent / "assets" / "demo_id_document_placeholder.pdf"


def _query_one(db: Session, model, **filters):
    return db.query(model).filter_by(**filters).first()


def _has_column(model, column_name: str):
    return hasattr(model, column_name)


def _ensure(db: Session, model, lookup: dict, values: dict | None = None):
    row = _query_one(db, model, **lookup)
    if row:
        if values:
            for key, value in values.items():
                setattr(row, key, value)
        return row, False
    payload = dict(lookup)
    payload.update(values or {})
    row = model(**payload)
    db.add(row)
    db.flush()
    return row, True


def _refresh_inventory_statuses(db: Session):
    active_booking_statuses = {"confirmed", "dispatched"}
    for item in db.query(models.InventoryItem).all():
        active_booking_rows = db.query(models.BookingEquipment).join(models.EventBooking).filter(
            models.BookingEquipment.inventory_item_id == item.id,
            models.EventBooking.status.in_(active_booking_statuses),
        ).all()
        has_dispatched = any(row.booking and row.booking.status == "dispatched" for row in active_booking_rows)
        has_blocked = any(row.booking and row.booking.status == "confirmed" for row in active_booking_rows)
        active_service = db.query(models.ServiceJob).filter(
            models.ServiceJob.inventory_item_id == item.id,
            models.ServiceJob.status == "in_service",
        ).first()
        if active_service:
            item.service_status = "in_service"
            item.status = "servicing"
        else:
            if item.service_status == "in_service":
                item.service_status = "not_in_service"
            if has_dispatched:
                item.status = "on_shoot"
            elif has_blocked:
                item.status = "reserved"
            elif item.status not in {"inactive", "cancelled"}:
                item.status = "available"


def _refresh_crew_statuses(db: Session):
    active_booking_statuses = {"confirmed", "dispatched"}
    for person in db.query(models.CrewMember).all():
        active_booking = db.query(models.BookingCrew).join(models.EventBooking).filter(
            models.BookingCrew.crew_member_id == person.id,
            models.EventBooking.status.in_(active_booking_statuses),
        ).first()
        if person.status not in {"inactive", "cancelled"}:
            person.status = "blocked" if active_booking else "available"


def demo_dataset_status(db: Session):
    demo_counts = {
        "clients": db.query(models.Client).filter(getattr(models.Client, "is_demo", False) == True).count() if _has_column(models.Client, "is_demo") else 0,
        "inventory": db.query(models.InventoryItem).filter(getattr(models.InventoryItem, "is_demo", False) == True).count() if _has_column(models.InventoryItem, "is_demo") else 0,
        "crew": db.query(models.CrewMember).filter(getattr(models.CrewMember, "is_demo", False) == True).count() if _has_column(models.CrewMember, "is_demo") else 0,
        "projects": db.query(models.ProjectEvent).filter(getattr(models.ProjectEvent, "is_demo", False) == True).count() if _has_column(models.ProjectEvent, "is_demo") else 0,
        "bookings": db.query(models.EventBooking).filter(getattr(models.EventBooking, "is_demo", False) == True).count() if _has_column(models.EventBooking, "is_demo") else 0,
        "service_jobs": db.query(models.ServiceJob).filter(getattr(models.ServiceJob, "is_demo", False) == True).count() if _has_column(models.ServiceJob, "is_demo") else 0,
        "papers": db.query(models.OutboundPaper).filter(getattr(models.OutboundPaper, "is_demo", False) == True).count() if _has_column(models.OutboundPaper, "is_demo") else 0,
        "procurement_orders": db.query(models.ProcurementOrder).filter(getattr(models.ProcurementOrder, "is_demo", False) == True).count() if _has_column(models.ProcurementOrder, "is_demo") else 0,
        "documents": db.query(models.StatutoryDocument).filter(getattr(models.StatutoryDocument, "is_demo", False) == True).count() if _has_column(models.StatutoryDocument, "is_demo") else 0,
    }
    return {
        "installed": any(demo_counts.values()),
        "counts": demo_counts,
    }


def _project_window(start_day: date, end_day: date):
    return datetime.combine(start_day, time(0, 0)), datetime.combine(end_day, time(23, 59, 59))


def _ensure_project_date(db: Session, project_id: int, date_type: str, date_value: date):
    row = db.query(models.ProjectDate).filter_by(project_id=project_id, date_type=date_type, date_value=date_value).first()
    if not row:
        db.add(models.ProjectDate(project_id=project_id, date_type=date_type, date_value=date_value))


def _ensure_booking_equipment(db: Session, booking_id: int, item_id: int):
    row = db.query(models.BookingEquipment).filter_by(booking_id=booking_id, inventory_item_id=item_id).first()
    if not row:
        db.add(models.BookingEquipment(booking_id=booking_id, inventory_item_id=item_id))


def _ensure_booking_crew(db: Session, booking_id: int, crew_id: int):
    row = db.query(models.BookingCrew).filter_by(booking_id=booking_id, crew_member_id=crew_id).first()
    if not row:
        db.add(models.BookingCrew(booking_id=booking_id, crew_member_id=crew_id))


def _ensure_custody(db: Session, booking_id: int | None, inventory_item_id: int | None, crew_member_id: int | None, event_type: str, from_person: str | None, to_person: str | None, location: str | None, notes: str | None):
    row = db.query(models.ChainOfCustody).filter_by(
        booking_id=booking_id,
        inventory_item_id=inventory_item_id,
        crew_member_id=crew_member_id,
        event_type=event_type,
        notes=notes,
    ).first()
    if not row:
        db.add(models.ChainOfCustody(
            booking_id=booking_id,
            inventory_item_id=inventory_item_id,
            crew_member_id=crew_member_id,
            event_type=event_type,
            from_person=from_person,
            to_person=to_person,
            location=location,
            notes=notes,
        ))


def _ensure_document(db: Session, entity_type: str, entity_id: int, document_name: str, uploaded_by: str, notes: str):
    row = db.query(models.StatutoryDocument).filter_by(entity_type=entity_type, entity_id=entity_id, document_name=document_name).first()
    if not row:
        db.add(models.StatutoryDocument(
            entity_type=entity_type,
            entity_id=entity_id,
            document_name=document_name,
            file_path=str(ASSET_PLACEHOLDER),
            uploaded_by=uploaded_by,
            notes=notes,
            is_demo=True,
        ))
    else:
        row.file_path = str(ASSET_PLACEHOLDER)
        row.notes = notes
        row.is_demo = True


def _ensure_placeholder_document_file():
    ASSET_PLACEHOLDER.parent.mkdir(parents=True, exist_ok=True)
    if ASSET_PLACEHOLDER.exists():
        return
    pdf = canvas.Canvas(str(ASSET_PLACEHOLDER), pagesize=A4)
    width, height = A4
    pdf.setTitle("KPS Demo ID Document Placeholder")
    pdf.setAuthor("KPS Productions and Services LLP")
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawCentredString(width / 2, height - 90, "KPS DEMO ID DOCUMENT")
    pdf.setFont("Helvetica", 12)
    pdf.drawCentredString(width / 2, height - 118, "Placeholder file for client demonstrations")
    pdf.rect(90, 170, width - 180, height - 340)
    pdf.setFont("Helvetica-Bold", 28)
    pdf.drawCentredString(width / 2, height / 2 + 35, "DUMMY DOCUMENT")
    pdf.setFont("Helvetica", 11)
    pdf.drawCentredString(width / 2, height / 2 + 8, "No real personal document is stored in demo mode.")
    pdf.drawCentredString(width / 2, height / 2 - 14, "Replace with uploaded front/back ID proof in production.")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(110, 205, "Demo fields: Name, phone, ID proof type, ID proof number, job card ownership.")
    pdf.drawString(110, 188, "Verification: Front page, back page, original seen, authorized attestation.")
    pdf.showPage()
    pdf.save()


def _ensure_booking_crew_documents(db: Session, booking: models.EventBooking, uploaded_by: str = "operations"):
    rows = db.query(models.BookingCrew).filter(models.BookingCrew.booking_id == booking.id).all()
    for row in rows:
        person = row.crew_member
        if not person:
            continue
        proof_type = person.id_proof_type or "ID Proof"
        for side in ["Front / First Page", "Back / Last Page"]:
            _ensure_document(
                db,
                "crew",
                person.id,
                f"{booking.job_card_id} - {proof_type} {side}",
                uploaded_by,
                f"Demo placeholder {side.lower()} for {person.full_name} on {booking.job_card_id}.",
            )


def ensure_demo_data(db: Session):
    _ensure_placeholder_document_file()

    # User profiles for profile-menu demonstration
    for username, full_name, phone, email in [
        ("admin", "Admin User", "+91-9000000001", "admin@kpsstudios.demo"),
        ("operations", "Operations Lead", "+91-9000000002", "operations@kpsstudios.demo"),
        ("store", "Store Controller", "+91-9000000003", "store@kpsstudios.demo"),
    ]:
        user = _query_one(db, models.User, username=username)
        if user:
            user.full_name = user.full_name or full_name
            user.phone = user.phone or phone
            user.email = user.email or email

    warehouse_main = _query_one(db, models.Warehouse, code="WH-KOL-MAIN")
    warehouse_mumbai = _query_one(db, models.Warehouse, code="WH-MUM-MAIN")
    vendor_service = _query_one(db, models.Vendor, vendor_code="VEN-00001")
    vendor_equipment = _query_one(db, models.Vendor, vendor_code="VEN-00002")
    vendor_crew = _query_one(db, models.Vendor, vendor_code="VEN-00003")
    if not warehouse_main or not warehouse_mumbai or not vendor_service or not vendor_equipment or not vendor_crew:
        raise RuntimeError("Base seed data is missing. Run the standard seed first.")

    # Demo clients with multiple contacts
    demo_client_a, created_a = _ensure(
        db,
        models.Client,
        {"client_code": "CLI-90001"},
        {
            "name": "Apex Corporate Media",
            "industry_type": "Corporate Events",
            "billing_address": "BKC Corporate Park, Mumbai",
            "gst_number": "27APEXC9000A1Z9",
            "notes": "Demo client for corporate summit, dispatch, and supplementary workflow.",
            "is_demo": True,
        },
    )
    demo_client_b, created_b = _ensure(
        db,
        models.Client,
        {"client_code": "CLI-90002"},
        {
            "name": "Northstar Documentary Unit",
            "industry_type": "Documentary",
            "billing_address": "Sector 62, Noida",
            "gst_number": "09NSTAR9000B1Z8",
            "notes": "Demo client for return QC, damage, service, and cancellation workflow.",
            "is_demo": True,
        },
    )
    for client, contacts in [
        (demo_client_a, [
            {"contact_name": "Nisha Kapoor", "designation": "Executive Producer", "email": "nisha@apex.demo", "phone_country_code": "+91", "phone_number": "9810001001", "is_primary": True},
            {"contact_name": "Harsh Vyas", "designation": "Accounts", "email": "accounts@apex.demo", "phone_country_code": "+91", "phone_number": "9810001002", "is_primary": False},
            {"contact_name": "Mukul Jain", "designation": "Tech Manager", "email": "tech@apex.demo", "phone_country_code": "+91", "phone_number": "9810001003", "is_primary": False},
        ]),
        (demo_client_b, [
            {"contact_name": "Reema Dutt", "designation": "Line Producer", "email": "reema@northstar.demo", "phone_country_code": "+91", "phone_number": "9820002001", "is_primary": True},
            {"contact_name": "Kabir Sharma", "designation": "Field Director", "email": "kabir@northstar.demo", "phone_country_code": "+91", "phone_number": "9820002002", "is_primary": False},
        ]),
    ]:
        for contact in contacts:
            _ensure(db, models.ClientContact, {"client_id": client.id, "contact_name": contact["contact_name"]}, contact)

    # Extra inventory types for demo filters
    eqm_fx9 = _query_one(db, models.EquipmentMaster, equipment_code="EQM-01000")
    eqm_halo = _query_one(db, models.EquipmentMaster, equipment_code="EQM-01032")

    # Kit parent items
    kit_eng = _ensure(
        db, models.InventoryItem, {"asset_code": "KPS/KIT/ENG-01"},
        {
            "product_code": "PRD-900001", "name": "ENG Camera Kit", "category": "CAMERA KIT",
            "item_type": "kit", "warehouse_id": warehouse_main.id, "owner_type": "inhouse",
            "status": "available", "location_text": "Kolkata – Bay A",
            "service_status": "not_in_service", "warranty_expiry": date(2027, 6, 30),
            "statutory_tag": "KPS/KIT/ENG-01",
            "equipment_master_id": eqm_fx9.id if eqm_fx9 else None,
            "notes": "ENG Kit: FX9 body + V-mount battery + charger. Auto-expands in booking.", "is_demo": True,
        },
    )[0]

    bundle_stream = _ensure(
        db, models.InventoryItem, {"asset_code": "KPS/BND/STREAM-01"},
        {
            "product_code": "PRD-900002", "name": "Corporate Streaming Bundle", "category": "STREAMING",
            "item_type": "bundle", "warehouse_id": warehouse_main.id, "owner_type": "inhouse",
            "status": "available", "location_text": "Kolkata – Bay B",
            "service_status": "not_in_service", "warranty_expiry": date(2027, 3, 31),
            "statutory_tag": "KPS/BND/STREAM-01",
            "equipment_master_id": eqm_halo.id if eqm_halo else None,
            "notes": "Streaming bundle: encoder + switcher + PTZ cam. Auto-expands in booking.", "is_demo": True,
        },
    )[0]

    # Consumables with qty_in_stock
    for asset_code, product_code, name, category, qty, notes in [
        ("KPS/CON/GAFF-01", "PRD-900003", "Gaffer Tape (Box of 12)", "CONSUMABLE", 12, "Heavy-duty gaffer tape, black."),
        ("KPS/CON/CF-01", "PRD-900010", "CFexpress Card Type B 512GB", "MEMORY CARD", 6, "CFexpress B cards for FX9 / FX6."),
        ("KPS/CON/BATT-AA-01", "PRD-900011", "AA Batteries (Pack of 24)", "CONSUMABLE", 20, "For wireless mics and remotes."),
    ]:
        _ensure(
            db, models.InventoryItem, {"asset_code": asset_code},
            {
                "product_code": product_code, "name": name, "category": category,
                "item_type": "consumable", "warehouse_id": warehouse_main.id, "owner_type": "inhouse",
                "status": "available", "location_text": "Kolkata – Consumables Shelf",
                "service_status": "not_in_service", "qty_in_stock": qty,
                "notes": f"Demo consumable — {notes}", "is_demo": True,
            },
        )

    # Third-party equipment WITH rental windows
    for asset_code, product_code, name, category, avail_from, avail_until, notes in [
        ("3P/LGT/ASTERA-01", "PRD-900004", "Astera Tube Light Set (8pcs)", "LIGHTING",
         date(2026, 4, 20), date(2026, 5, 15), "Rented from Filmlite India for April–May shoots."),
        ("3P/CAM/MOVI-01", "PRD-900005", "DJI Ronin 4D Gimbal Rental", "GIMBAL",
         date(2026, 4, 25), date(2026, 5, 10), "Rented from CineGear Mumbai. Available only Apr 25 – May 10."),
        ("3P/AUD/SENN-01", "PRD-900006", "Sennheiser MKH 8050 + Boom Rental", "AUDIO",
         date(2026, 4, 21), date(2026, 6, 30), "Rented from Sound Solutions Kolkata. Long-term rental."),
    ]:
        _ensure(
            db, models.InventoryItem, {"asset_code": asset_code},
            {
                "product_code": product_code, "name": name, "category": category,
                "item_type": "third_party_equipment", "warehouse_id": warehouse_mumbai.id,
                "owner_type": "third_party", "vendor_id": vendor_equipment.id,
                "status": "available", "location_text": "Mumbai – Vendor Premises",
                "service_status": "not_in_service",
                "vendor_available_from": avail_from,
                "vendor_available_until": avail_until,
                "notes": f"Demo 3rd-party — {notes}", "is_demo": True,
            },
        )

    # Kit child items linked to kit_eng
    cam_body = _query_one(db, models.InventoryItem, asset_code="KPS/CAM/FX9-03")
    bat_vm = _query_one(db, models.InventoryItem, asset_code="KPS/BAT/VM-03")
    charger = _query_one(db, models.InventoryItem, asset_code="KPS/CHR/02")
    if cam_body and not cam_body.parent_item_id:
        cam_body.parent_item_id = kit_eng.id
    if bat_vm and not bat_vm.parent_item_id:
        bat_vm.parent_item_id = kit_eng.id
    if charger and not charger.parent_item_id:
        charger.parent_item_id = kit_eng.id

    demo_crew, _ = _ensure(
        db,
        models.CrewMember,
        {"employee_code": "EMP-90001"},
        {
            "full_name": "Samarjit Pal",
            "role": "Data Wrangler",
            "manpower_type": "freelance",
            "vendor_id": vendor_crew.id,
            "home_station": "Kolkata",
            "phone": "9830009001",
            "address": "Demo Crew Housing, Topsia, Kolkata",
            "aadhar_number": "9001-0000-0001",
            "id_proof_type": "Aadhaar",
            "id_proof_number": "9001-0000-0001",
            "status": "available",
            "is_demo": True,
        },
    )

    # Demo projects
    draft_start = None
    draft_end = None
    planned_day = date(2026, 4, 28)
    confirmed_day = date(2026, 4, 30)
    returned_day = date(2026, 4, 8)
    cancelled_day = date(2026, 5, 2)

    project_specs = [
        {
            "title": "Demo Draft Product Film Prep",
            "client": demo_client_a,
            "warehouse_id": warehouse_main.id,
            "venue": "Kolkata Studio Floor 2",
            "show_type": "Event",
            "status": "draft",
            "shoot_start": draft_start,
            "shoot_end": draft_end,
            "block_start": None,
            "block_end": None,
            "dates": [],
            "notes": "Draft project with no dates yet for pre-sales and planning demonstration.",
        },
        {
            "title": "Demo Planned Brand Launch",
            "client": demo_client_a,
            "warehouse_id": warehouse_main.id,
            "venue": "JW Marriott Ballroom, Kolkata",
            "show_type": "Event",
            "status": "planned",
            "shoot_start": datetime(2026, 4, 28, 10, 0),
            "shoot_end": datetime(2026, 4, 28, 22, 0),
            "block_start": datetime(2026, 4, 27, 0, 0),
            "block_end": datetime(2026, 4, 29, 23, 59, 59),
            "dates": [
                ("setup_date", planned_day - timedelta(days=1)),
                ("technical_date", planned_day - timedelta(days=1)),
                ("start_date", planned_day),
                ("end_date", planned_day),
                ("off_day", planned_day + timedelta(days=1)),
            ],
            "notes": "Planned project with supplementary booking and multiple contacts.",
        },
        {
            "title": "Demo Confirmed Leadership Summit",
            "client": demo_client_a,
            "warehouse_id": warehouse_mumbai.id,
            "venue": "Jio Convention Centre, Mumbai",
            "show_type": "Event",
            "status": "confirmed",
            "shoot_start": datetime(2026, 4, 30, 8, 0),
            "shoot_end": datetime(2026, 4, 30, 20, 0),
            "block_start": datetime(2026, 4, 29, 0, 0),
            "block_end": datetime(2026, 5, 1, 23, 59, 59),
            "dates": [
                ("setup_date", confirmed_day - timedelta(days=1)),
                ("technical_date", confirmed_day - timedelta(days=1)),
                ("start_date", confirmed_day),
                ("end_date", confirmed_day),
            ],
            "notes": "Confirmed project for dispatched and partial-return demo.",
        },
        {
            "title": "Demo Returned Wildlife Documentary",
            "client": demo_client_b,
            "warehouse_id": warehouse_main.id,
            "venue": "Sundarbans Field Unit",
            "show_type": "Reality Show",
            "status": "confirmed",
            "shoot_start": datetime(2026, 4, 8, 5, 30),
            "shoot_end": datetime(2026, 4, 8, 18, 0),
            "block_start": datetime(2026, 4, 7, 0, 0),
            "block_end": datetime(2026, 4, 9, 23, 59, 59),
            "dates": [
                ("setup_date", returned_day - timedelta(days=1)),
                ("start_date", returned_day),
                ("end_date", returned_day),
            ],
            "notes": "Returned project with QC, damage, and service workflow.",
        },
        {
            "title": "Demo Cancelled Awards Recce",
            "client": demo_client_b,
            "warehouse_id": warehouse_main.id,
            "venue": "Science City, Kolkata",
            "show_type": "Event",
            "status": "cancelled",
            "shoot_start": datetime(2026, 5, 2, 9, 0),
            "shoot_end": datetime(2026, 5, 2, 14, 0),
            "block_start": datetime(2026, 5, 1, 0, 0),
            "block_end": datetime(2026, 5, 2, 23, 59, 59),
            "dates": [
                ("technical_date", cancelled_day - timedelta(days=1)),
                ("start_date", cancelled_day),
                ("end_date", cancelled_day),
            ],
            "notes": "Cancelled project for reconfirmation and audit demonstration.",
        },
    ]

    projects = {}
    for spec in project_specs:
        project, created = _ensure(
            db,
            models.ProjectEvent,
            {"title": spec["title"]},
            {
                "show_type": spec["show_type"],
                "client_id": spec["client"].id,
                "venue": spec["venue"],
                "origin_warehouse_id": spec["warehouse_id"],
                "shoot_start": spec["shoot_start"],
                "shoot_end": spec["shoot_end"],
                "setup_date": min([d[1] for d in spec["dates"] if d[0] in {"setup_date", "technical_date"}], default=None),
                "off_days": len([d for d in spec["dates"] if d[0] == "off_day"]),
                "expected_start_date": min([d[1] for d in spec["dates"] if d[0] == "start_date"], default=None),
                "expected_end_date": max([d[1] for d in spec["dates"] if d[0] == "end_date"], default=None),
                "setup_days": 1 if spec["dates"] else 0,
                "block_start": spec["block_start"],
                "block_end": spec["block_end"],
                "status": spec["status"],
                "notes": spec["notes"],
                "is_demo": True,
            },
        )
        if created:
            db.flush()
        for date_type, date_value in spec["dates"]:
            _ensure_project_date(db, project.id, date_type, date_value)
        projects[spec["title"]] = project

    # Resource lookups
    assets = {
        code: _query_one(db, models.InventoryItem, asset_code=code)
        for code in [
            "KPS/CAM/FX9-03", "KPS/CAM/FX9-04", "KPS/CAM/HDC-01", "KPS/CAM/HDC-02",
            "KPS/BAT/VM-03", "KPS/BAT/VM-04", "KPS/CHR/02", "KPS/CHR/03",
            "KPS/TRI/S18-02", "KPS/WLS/BOLT-01", "KPS/COM/BP-01", "KPS/SSD/T7-01",
            "KPS/PWR/EXT-01", "KPS/PWR/EXT-02", "KPS/AUD/XLR-02", "KPS/RPL/3P-01",
            "KPS/CNV/FS-01", "KPS/STR/HELO-01", "3P/CAM/RED-01", "3P/CAM/ARRI-01",
            "KPS/KIT/ENG-01", "KPS/BND/STREAM-01",
            "3P/LGT/ASTERA-01", "3P/CAM/MOVI-01", "3P/AUD/SENN-01",
            "KPS/CON/GAFF-01", "KPS/CON/CF-01",
        ]
    }
    crew = {
        code: _query_one(db, models.CrewMember, employee_code=code)
        for code in ["EMP-00003", "EMP-00007", "EMP-00008", "EMP-00009", "EMP-00010", "EMP-00011", "EMP-00014", "EMP-00015", "EMP-90001"]
    }

    # Kit accessory rule
    if assets["KPS/KIT/ENG-01"] and assets["KPS/BAT/VM-03"]:
        _ensure(
            db,
            models.KitAccessoryRule,
            {"parent_item_id": assets["KPS/KIT/ENG-01"].id, "accessory_item_id": assets["KPS/BAT/VM-03"].id},
            {"is_mandatory": True},
        )

    def booking_contacts(*rows):
        return json.dumps([{"name": name, "mobile": mobile, "aadhar": aadhar} for name, mobile, aadhar in rows], default=str)

    # Planned parent booking
    parent_booking, _ = _ensure(
        db,
        models.EventBooking,
        {"job_card_id": "JC-90001"},
        {
            "project_id": projects["Demo Planned Brand Launch"].id,
            "destination": "JW Marriott Ballroom, Kolkata",
            "status": "planned",
            "remarks": "Primary planned booking for launch show.",
            "transport_mode": "company_vehicle",
            "awb_number": "KPS-DEMO-LAUNCH-01",
            "contact_person_name": "Nisha Kapoor",
            "contact_person_mobile": "9810001001",
            "contact_person_aadhar": "XXXX-9001",
            "booking_contacts_json": booking_contacts(
                ("Nisha Kapoor", "9810001001", "XXXX-9001"),
                ("Mukul Jain", "9810001003", "XXXX-9003"),
            ),
            "call_time": datetime(2026, 4, 28, 7, 0),
            "packup_time": datetime(2026, 4, 28, 5, 30),
            "is_demo": True,
        },
    )
    for asset_code in ["KPS/CAM/FX9-03", "KPS/BAT/VM-03", "KPS/CHR/02", "KPS/TRI/S18-02", "KPS/SSD/T7-01", "KPS/KIT/ENG-01"]:
        item = assets[asset_code]
        if item:
            _ensure_booking_equipment(db, parent_booking.id, item.id)
            item.status = "reserved"
            _ensure_custody(db, parent_booking.id, item.id, None, "assign", "Store", "JW Marriott Ballroom, Kolkata", "Kolkata Warehouse", "Demo planned assignment")
    for crew_code in ["EMP-00007", "EMP-00010"]:
        person = crew[crew_code]
        if person:
            _ensure_booking_crew(db, parent_booking.id, person.id)
            person.status = "blocked"
            _ensure_custody(db, parent_booking.id, None, person.id, "assign", "Office", "JW Marriott Ballroom, Kolkata", "Kolkata Warehouse", "Demo planned crew assignment")
    _ensure(db, models.GatePass, {"gate_pass_number": "GATE-90001"}, {"booking_id": parent_booking.id, "pass_type": "gate_out", "approved_by": "System Auto", "status": "issued", "remarks": "Demo planned booking gate pass"})

    supplementary_booking, _ = _ensure(
        db,
        models.EventBooking,
        {"job_card_id": "JC-90001-S1"},
        {
            "project_id": projects["Demo Planned Brand Launch"].id,
            "parent_booking_id": parent_booking.id,
            "destination": "JW Marriott Ballroom, Kolkata",
            "status": "planned",
            "remarks": "Supplementary add-on for extra power and wireless video.",
            "transport_mode": "company_vehicle",
            "awb_number": "KPS-DEMO-LAUNCH-S1",
            "contact_person_name": "Mukul Jain",
            "contact_person_mobile": "9810001003",
            "contact_person_aadhar": "XXXX-9003",
            "booking_contacts_json": booking_contacts(("Mukul Jain", "9810001003", "XXXX-9003")),
            "call_time": datetime(2026, 4, 28, 11, 0),
            "packup_time": datetime(2026, 4, 28, 10, 0),
            "is_demo": True,
        },
    )
    for asset_code in ["KPS/WLS/BOLT-01", "KPS/PWR/EXT-01"]:
        item = assets[asset_code]
        if item:
            _ensure_booking_equipment(db, supplementary_booking.id, item.id)
            item.status = "reserved"
            _ensure_custody(db, supplementary_booking.id, item.id, None, "assign", "Store", "JW Marriott Ballroom, Kolkata", "Kolkata Warehouse", "Demo supplementary assignment")

    dispatched_booking, _ = _ensure(
        db,
        models.EventBooking,
        {"job_card_id": "JC-90002"},
        {
            "project_id": projects["Demo Confirmed Leadership Summit"].id,
            "destination": "Jio Convention Centre, Mumbai",
            "status": "dispatched",
            "remarks": "Dispatched summit package with partial-return history.",
            "transport_mode": "courier",
            "awb_number": "AWB-DEMO-90002",
            "contact_person_name": "Harsh Vyas",
            "contact_person_mobile": "9810001002",
            "contact_person_aadhar": "XXXX-9002",
            "booking_contacts_json": booking_contacts(("Harsh Vyas", "9810001002", "XXXX-9002")),
            "call_time": datetime(2026, 4, 30, 6, 30),
            "packup_time": datetime(2026, 4, 30, 4, 0),
            "is_demo": True,
        },
    )
    for asset_code in ["KPS/CAM/HDC-01", "KPS/CAM/HDC-02", "KPS/BAT/VM-04", "KPS/CHR/03", "KPS/COM/BP-01", "KPS/BND/STREAM-01", "3P/LGT/ASTERA-01"]:
        item = assets[asset_code]
        if item:
            _ensure_booking_equipment(db, dispatched_booking.id, item.id)
            item.status = "on_shoot"
            _ensure_custody(db, dispatched_booking.id, item.id, None, "gate_out", "KPS Store", "Jio Convention Centre, Mumbai", "Mumbai Transit", "Demo dispatched gate out")
    for crew_code in ["EMP-00011", "EMP-00014", "EMP-90001"]:
        person = crew[crew_code]
        if person:
            _ensure_booking_crew(db, dispatched_booking.id, person.id)
            person.status = "blocked"
            _ensure_custody(db, dispatched_booking.id, None, person.id, "handover", "Office", "Jio Convention Centre, Mumbai", "Mumbai Transit", "Demo dispatched crew handover")
    _ensure(db, models.GatePass, {"gate_pass_number": "GATE-90002"}, {"booking_id": dispatched_booking.id, "pass_type": "gate_out", "approved_by": "Operations Lead", "status": "issued", "remarks": "Demo dispatched gate out"})
    if assets["KPS/COM/BP-01"]:
        _ensure(
            db,
            models.PartialReturn,
            {"booking_id": dispatched_booking.id, "inventory_item_id": assets["KPS/COM/BP-01"].id},
            {"returned_by": "Store Runner", "condition_status": "good", "notes": "Returned early after comms desk wrap."},
        )
        assets["KPS/COM/BP-01"].status = "available"
        _ensure_custody(db, dispatched_booking.id, assets["KPS/COM/BP-01"].id, None, "partial_return", "Jio Convention Centre, Mumbai", "Store", "Mumbai Transit", "Demo partial return")

    returned_booking, _ = _ensure(
        db,
        models.EventBooking,
        {"job_card_id": "JC-90003"},
        {
            "project_id": projects["Demo Returned Wildlife Documentary"].id,
            "destination": "Sundarbans Field Unit",
            "status": "returned",
            "remarks": "Returned documentary package with damage and service closure.",
            "transport_mode": "self",
            "awb_number": "FIELD-DEMO-90003",
            "contact_person_name": "Reema Dutt",
            "contact_person_mobile": "9820002001",
            "contact_person_aadhar": "XXXX-9201",
            "booking_contacts_json": booking_contacts(
                ("Reema Dutt", "9820002001", "XXXX-9201"),
                ("Kabir Sharma", "9820002002", "XXXX-9202"),
            ),
            "call_time": datetime(2026, 4, 8, 4, 30),
            "packup_time": datetime(2026, 4, 8, 3, 30),
            "is_demo": True,
        },
    )
    for asset_code in ["3P/CAM/RED-01", "KPS/AUD/XLR-02", "KPS/RPL/3P-01", "KPS/CNV/FS-01", "KPS/STR/HELO-01"]:
        item = assets[asset_code]
        if item:
            _ensure_booking_equipment(db, returned_booking.id, item.id)
            item.status = "available"
            _ensure_custody(db, returned_booking.id, item.id, None, "gate_in", "Sundarbans Field Unit", "Store", "Kolkata Warehouse", "Demo returned gate in")
    for crew_code in ["EMP-00003", "EMP-00008"]:
        person = crew[crew_code]
        if person:
            _ensure_booking_crew(db, returned_booking.id, person.id)
            person.status = "available"
            _ensure_custody(db, returned_booking.id, None, person.id, "gate_in", "Sundarbans Field Unit", "Office", "Kolkata Warehouse", "Demo returned crew")
    _ensure(db, models.GatePass, {"gate_pass_number": "GATE-90003-OUT"}, {"booking_id": returned_booking.id, "pass_type": "gate_out", "approved_by": "System Auto", "status": "issued", "remarks": "Demo documentary dispatch"})
    _ensure(db, models.GatePass, {"gate_pass_number": "GATE-90003-IN"}, {"booking_id": returned_booking.id, "pass_type": "gate_in", "approved_by": "Store Controller", "status": "closed", "remarks": "Demo documentary return"})
    _ensure(db, models.ReturnQC, {"booking_id": returned_booking.id}, {"checked_by": "Store QC", "all_items_returned": True, "damage_found": True, "cleaning_required": True, "remarks": "Minor connector damage on replay unit. Cleaning completed."})

    service_completed, _ = _ensure(
        db,
        models.ServiceJob,
        {"job_number": "SRV-90001"},
        {
            "inventory_item_id": assets["KPS/RPL/3P-01"].id if assets["KPS/RPL/3P-01"] else 1,
            "vendor_id": vendor_service.id,
            "vendor_name": vendor_service.name,
            "sent_date": date(2026, 4, 9),
            "expected_return_date": date(2026, 4, 12),
            "actual_return_date": date(2026, 4, 11),
            "status": "completed",
            "problem_reported": "Playback output intermittently dropping frames.",
            "remarks": "Completed demo service closure from return damage log.",
            "source_booking_id": returned_booking.id,
            "is_demo": True,
        },
    )
    if assets["KPS/RPL/3P-01"]:
        assets["KPS/RPL/3P-01"].service_status = "not_in_service"
    _ensure(
        db,
        models.DamageLog,
        {"booking_id": returned_booking.id, "inventory_item_id": assets["KPS/RPL/3P-01"].id if assets["KPS/RPL/3P-01"] else 1, "stage": "return"},
        {
            "damage_description": "Playback feed flicker observed during return QC.",
            "severity": "minor",
            "photo_path": None,
            "reported_by": "Store QC",
            "auto_service_job_id": service_completed.id,
        },
    )

    cancelled_booking, _ = _ensure(
        db,
        models.EventBooking,
        {"job_card_id": "JC-90004"},
        {
            "project_id": projects["Demo Cancelled Awards Recce"].id,
            "destination": "Science City, Kolkata",
            "status": "cancelled",
            "cancellation_reason": "Client postponed recce after venue permissions changed.",
            "remarks": "Cancelled before dispatch for audit and cancellation workflow demo.",
            "transport_mode": "hired",
            "awb_number": "CANCEL-DEMO-90004",
            "contact_person_name": "Kabir Sharma",
            "contact_person_mobile": "9820002002",
            "contact_person_aadhar": "XXXX-9202",
            "booking_contacts_json": booking_contacts(("Kabir Sharma", "9820002002", "XXXX-9202")),
            "call_time": datetime(2026, 5, 2, 7, 30),
            "packup_time": datetime(2026, 5, 2, 6, 30),
            "is_demo": True,
        },
    )
    for asset_code in ["3P/CAM/ARRI-01", "KPS/PWR/EXT-02"]:
        item = assets[asset_code]
        if item:
            _ensure_booking_equipment(db, cancelled_booking.id, item.id)
            item.status = "available"
            _ensure_custody(db, cancelled_booking.id, item.id, None, "cancel", "Store", "Store", "Kolkata Warehouse", "Demo cancelled release")
    for crew_code in ["EMP-00009", "EMP-00015"]:
        person = crew[crew_code]
        if person:
            _ensure_booking_crew(db, cancelled_booking.id, person.id)
            person.status = "available"
            _ensure_custody(db, cancelled_booking.id, None, person.id, "cancel", "Office", "Office", "Kolkata Warehouse", "Demo cancelled crew release")

    # More service/procurement/papers coverage
    _ensure(
        db,
        models.ServiceJob,
        {"job_number": "SRV-90002"},
        {
            "inventory_item_id": assets["KPS/CNV/FS-01"].id if assets["KPS/CNV/FS-01"] else 1,
            "vendor_id": vendor_service.id,
            "vendor_name": vendor_service.name,
            "sent_date": date(2026, 4, 14),
            "expected_return_date": date(2026, 4, 19),
            "actual_return_date": None,
            "status": "in_service",
            "problem_reported": "SDI lock unstable under load.",
            "remarks": "Active demo service job.",
            "source_booking_id": dispatched_booking.id,
            "is_demo": True,
        },
    )
    _ensure(
        db,
        models.ServiceJob,
        {"job_number": "SRV-90003"},
        {
            "inventory_item_id": assets["KPS/STR/HELO-01"].id if assets["KPS/STR/HELO-01"] else 1,
            "vendor_id": vendor_service.id,
            "vendor_name": vendor_service.name,
            "sent_date": date(2026, 4, 16),
            "expected_return_date": date(2026, 4, 21),
            "actual_return_date": None,
            "status": "cancelled",
            "problem_reported": "Preventive service not required after inspection.",
            "remarks": "Cancelled demo service job.",
            "source_booking_id": dispatched_booking.id,
            "is_demo": True,
        },
    )

    for paper_number, values in [
        ("PAP-90001", {"paper_type": "Shoot Dispatch", "reference_name": projects["Demo Planned Brand Launch"].title, "destination": "JW Marriott Ballroom, Kolkata", "issued_by": "Operations Lead", "issue_status": "ready", "related_booking_id": parent_booking.id, "related_service_job_id": None, "remarks": "Parent booking dispatch papers", "signature_name": "Operations Lead"}),
        ("PAP-90002", {"paper_type": "Supplementary Challan", "reference_name": supplementary_booking.job_card_id, "destination": "JW Marriott Ballroom, Kolkata", "issued_by": "Store Controller", "issue_status": "issued", "related_booking_id": supplementary_booking.id, "related_service_job_id": None, "remarks": "Supplementary power and wireless add-on", "signature_name": "Store Controller"}),
        ("PAP-90003", {"paper_type": "Service Declaration", "reference_name": "SRV-90002", "destination": vendor_service.city or "Kolkata", "issued_by": "Store Controller", "issue_status": "draft", "related_booking_id": None, "related_service_job_id": _query_one(db, models.ServiceJob, job_number="SRV-90002").id, "remarks": "Sent with converter unit", "signature_name": "Store Controller"}),
    ]:
        _ensure(db, models.OutboundPaper, {"paper_number": paper_number}, {**values, "is_demo": True})

    for po_number, procurement_code, item_name, item_type, quantity, vendor_id, status, expected_date, notes in [
        ("PO-90001", "PROC-90001", "Executive webcast bundle", "equipment", 1, vendor_equipment.id, "requested", date(2026, 4, 25), "Requested for overflow ballroom feed."),
        ("PO-90002", "PROC-90002", "Wireless intercom add-on sets", "accessory", 4, vendor_equipment.id, "ordered", date(2026, 4, 27), "Ordered for summit breakaway rooms."),
        ("PO-90003", "PROC-90003", "Freelance DIT support", "manpower", 1, vendor_crew.id, "received", date(2026, 4, 29), "Received and assigned for summit."),
        ("PO-90004", "PROC-90004", "Venue utility consumables", "consumable", 12, vendor_equipment.id, "cancelled", date(2026, 5, 1), "Cancelled after venue supplied consumables."),
    ]:
        _ensure(
            db,
            models.ProcurementOrder,
            {"po_number": po_number},
            {
                "procurement_code": procurement_code,
                "item_name": item_name,
                "item_type": item_type,
                "quantity": quantity,
                "vendor_id": vendor_id,
                "status": status,
                "expected_date": expected_date,
                "notes": notes,
                "is_demo": True,
            },
        )

    # Statutory documents for download/demo
    _ensure_document(db, "client", demo_client_a.id, "Client GST Copy", "admin", "Demo statutory client document")
    _ensure_document(db, "inventory", assets["KPS/CAM/HDC-01"].id if assets["KPS/CAM/HDC-01"] else 1, "Equipment Insurance Copy", "store", "Demo inventory document")
    _ensure_document(db, "crew", demo_crew.id, "Freelancer ID Proof", "operations", "Demo crew document")
    _ensure_document(db, "vendor", vendor_service.id, "Vendor Service Agreement", "admin", "Demo vendor compliance document")
    for demo_booking in [parent_booking, supplementary_booking, dispatched_booking, returned_booking, cancelled_booking]:
        _ensure_booking_crew_documents(db, demo_booking)

    # ── Demo: Kit auto-expansion booking (ENG Kit → children auto-added) ──
    kit_demo_project, _ = _ensure(
        db, models.ProjectEvent, {"title": "Demo Reality Show – ENG Kit Booking"},
        {
            "show_type": "Reality Show", "client_id": demo_client_b.id,
            "venue": "Eco Park, Kolkata", "origin_warehouse_id": warehouse_main.id,
            "shoot_start": datetime(2026, 5, 5, 8, 0), "shoot_end": datetime(2026, 5, 5, 20, 0),
            "block_start": datetime(2026, 5, 4, 0, 0), "block_end": datetime(2026, 5, 6, 23, 59, 59),
            "status": "planned",
            "notes": "Demo: ENG Camera Kit booked as a single unit. Children (camera, battery, charger) auto-linked.",
            "is_demo": True,
        },
    )
    for dt, dv in [("setup_date", date(2026, 5, 4)), ("start_date", date(2026, 5, 5)), ("end_date", date(2026, 5, 5))]:
        _ensure_project_date(db, kit_demo_project.id, dt, dv)

    kit_booking, _ = _ensure(
        db, models.EventBooking, {"job_card_id": "JC-90005"},
        {
            "project_id": kit_demo_project.id, "destination": "Eco Park, Kolkata",
            "status": "planned", "remarks": "ENG Kit booked — auto-expands to FX9 body + battery + charger.",
            "transport_mode": "company_vehicle", "awb_number": "KPS-DEMO-KIT-01",
            "contact_person_name": "Reema Dutt", "contact_person_mobile": "9820002001",
            "call_time": datetime(2026, 5, 5, 7, 0), "packup_time": datetime(2026, 5, 5, 21, 0),
            "is_demo": True,
        },
    )
    # Add kit parent + its children to booking (demonstrating auto-expansion)
    for code in ["KPS/KIT/ENG-01", "KPS/CAM/FX9-03", "KPS/BAT/VM-03", "KPS/CHR/02"]:
        item = assets.get(code)
        if item:
            _ensure_booking_equipment(db, kit_booking.id, item.id)
    for code in ["EMP-00007"]:
        person = crew.get(code)
        if person:
            _ensure_booking_crew(db, kit_booking.id, person.id)

    # ── Demo: Third-party vendor window booking (Astera lights, within window) ──
    tp_demo_project, _ = _ensure(
        db, models.ProjectEvent, {"title": "Demo Corporate Event – Third-Party Lighting"},
        {
            "show_type": "Event", "client_id": demo_client_a.id,
            "venue": "ITC Sonar, Kolkata", "origin_warehouse_id": warehouse_main.id,
            "shoot_start": datetime(2026, 5, 2, 10, 0), "shoot_end": datetime(2026, 5, 2, 22, 0),
            "block_start": datetime(2026, 5, 1, 0, 0), "block_end": datetime(2026, 5, 3, 23, 59, 59),
            "status": "confirmed",
            "notes": "Demo: Astera Tube Lights (3rd-party) rented for this event. Available Apr 20 – May 15.",
            "is_demo": True,
        },
    )
    for dt, dv in [("setup_date", date(2026, 5, 1)), ("start_date", date(2026, 5, 2)), ("end_date", date(2026, 5, 2))]:
        _ensure_project_date(db, tp_demo_project.id, dt, dv)

    tp_booking, _ = _ensure(
        db, models.EventBooking, {"job_card_id": "JC-90006"},
        {
            "project_id": tp_demo_project.id, "destination": "ITC Sonar, Kolkata",
            "status": "confirmed", "remarks": "Astera tubes rented from Filmlite India. Vendor window: Apr 20 – May 15.",
            "transport_mode": "vendor_transport", "awb_number": "ASTERA-DEMO-90006",
            "contact_person_name": "Nisha Kapoor", "contact_person_mobile": "9810001001",
            "call_time": datetime(2026, 5, 2, 8, 0), "packup_time": datetime(2026, 5, 2, 23, 30),
            "is_demo": True,
        },
    )
    for code in ["KPS/CAM/FX9-04", "3P/LGT/ASTERA-01", "3P/AUD/SENN-01"]:
        item = assets.get(code)
        if item:
            _ensure_booking_equipment(db, tp_booking.id, item.id)
            item.status = "reserved"
    for code in ["EMP-00010", "EMP-00014"]:
        person = crew.get(code)
        if person:
            _ensure_booking_crew(db, tp_booking.id, person.id)
            person.status = "blocked"
    _ensure(db, models.GatePass, {"gate_pass_number": "GATE-90006"}, {
        "booking_id": tp_booking.id, "pass_type": "gate_out", "approved_by": "System Auto",
        "status": "issued", "remarks": "Demo third-party lighting booking gate pass"
    })

    # ── Demo: Consumable usage ──
    if assets.get("KPS/CON/GAFF-01"):
        _ensure_booking_equipment(db, returned_booking.id, assets["KPS/CON/GAFF-01"].id)
    if assets.get("KPS/CON/CF-01"):
        _ensure_booking_equipment(db, dispatched_booking.id, assets["KPS/CON/CF-01"].id)

    # Statutory documents for new items
    if assets.get("3P/LGT/ASTERA-01"):
        _ensure_document(db, "inventory", assets["3P/LGT/ASTERA-01"].id, "Vendor Rental Agreement", "store", "Demo 3rd-party rental agreement — Astera lights")
    if assets.get("KPS/KIT/ENG-01"):
        _ensure_document(db, "inventory", assets["KPS/KIT/ENG-01"].id, "Kit Asset Register", "store", "Demo ENG Kit statutory registration")

    audit(db, "admin", "seed", "demo_data", details={
        "message": "Demo dataset ensured for client presentation",
        "clients": ["CLI-90001", "CLI-90002"],
        "projects": [spec["title"] for spec in project_specs],
        "bookings": ["JC-90001", "JC-90001-S1", "JC-90002", "JC-90003", "JC-90004", "JC-90005", "JC-90006"],
    })
    db.commit()


def remove_demo_data(db: Session):
    demo_booking_ids = [row.id for row in db.query(models.EventBooking.id).filter(models.EventBooking.is_demo == True).all()]
    demo_project_ids = [row.id for row in db.query(models.ProjectEvent.id).filter(models.ProjectEvent.is_demo == True).all()]
    demo_service_ids = [row.id for row in db.query(models.ServiceJob.id).filter(models.ServiceJob.is_demo == True).all()]
    demo_client_ids = [row.id for row in db.query(models.Client.id).filter(models.Client.is_demo == True).all()]
    demo_inventory_ids = [row.id for row in db.query(models.InventoryItem.id).filter(models.InventoryItem.is_demo == True).all()]
    demo_crew_ids = [row.id for row in db.query(models.CrewMember.id).filter(models.CrewMember.is_demo == True).all()]

    if not any([demo_booking_ids, demo_project_ids, demo_service_ids, demo_client_ids, demo_inventory_ids, demo_crew_ids]):
        return {"ok": True, "removed": False, "message": "No demo dataset found."}

    if demo_service_ids:
        db.query(models.DamageLog).filter(models.DamageLog.auto_service_job_id.in_(demo_service_ids)).delete(synchronize_session=False)
    if demo_booking_ids:
        db.query(models.DamageLog).filter(models.DamageLog.booking_id.in_(demo_booking_ids)).delete(synchronize_session=False)
        db.query(models.ReturnQC).filter(models.ReturnQC.booking_id.in_(demo_booking_ids)).delete(synchronize_session=False)
        db.query(models.PartialReturn).filter(models.PartialReturn.booking_id.in_(demo_booking_ids)).delete(synchronize_session=False)
        db.query(models.ChainOfCustody).filter(models.ChainOfCustody.booking_id.in_(demo_booking_ids)).delete(synchronize_session=False)
        db.query(models.GatePass).filter(models.GatePass.booking_id.in_(demo_booking_ids)).delete(synchronize_session=False)
        db.query(models.BookingEquipment).filter(models.BookingEquipment.booking_id.in_(demo_booking_ids)).delete(synchronize_session=False)
        db.query(models.BookingCrew).filter(models.BookingCrew.booking_id.in_(demo_booking_ids)).delete(synchronize_session=False)
    if demo_project_ids:
        db.query(models.ProjectDate).filter(models.ProjectDate.project_id.in_(demo_project_ids)).delete(synchronize_session=False)

    db.query(models.OutboundPaper).filter(models.OutboundPaper.is_demo == True).delete(synchronize_session=False)
    db.query(models.ServiceJob).filter(models.ServiceJob.is_demo == True).delete(synchronize_session=False)
    db.query(models.EventBooking).filter(models.EventBooking.is_demo == True).delete(synchronize_session=False)
    db.query(models.ProjectEvent).filter(models.ProjectEvent.is_demo == True).delete(synchronize_session=False)
    db.query(models.ProcurementOrder).filter(models.ProcurementOrder.is_demo == True).delete(synchronize_session=False)
    db.query(models.StatutoryDocument).filter(models.StatutoryDocument.is_demo == True).delete(synchronize_session=False)
    db.query(models.ClientContact).filter(models.ClientContact.client_id.in_(demo_client_ids)).delete(synchronize_session=False)
    db.query(models.Client).filter(models.Client.is_demo == True).delete(synchronize_session=False)
    db.query(models.InventoryItem).filter(models.InventoryItem.is_demo == True).delete(synchronize_session=False)
    db.query(models.CrewMember).filter(models.CrewMember.is_demo == True).delete(synchronize_session=False)

    _refresh_inventory_statuses(db)
    _refresh_crew_statuses(db)
    return {"ok": True, "removed": True, "message": "Demo dataset removed."}


def main():
    from .database import SessionLocal

    db = SessionLocal()
    try:
        ensure_demo_data(db)
        print("Demo dataset ensured.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
