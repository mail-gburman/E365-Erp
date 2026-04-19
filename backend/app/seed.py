from datetime import datetime, date, timedelta
import json
from sqlalchemy.orm import Session
from . import models
from .auth import hash_password
from .permissions import ROLE_DEFAULTS
from .utils import calc_block_window
from .demo_data import ensure_demo_data

def seed_db(db: Session):
    if db.query(models.User).first():
        return

    # ── USERS ──
    users = [
        models.User(username="admin", password_hash=hash_password("admin123"), role="admin", permissions_json=json.dumps(ROLE_DEFAULTS["admin"])),
        models.User(username="operations", password_hash=hash_password("ops123"), role="operations", permissions_json=json.dumps(ROLE_DEFAULTS["operations"])),
        models.User(username="store", password_hash=hash_password("store123"), role="store", permissions_json=json.dumps(ROLE_DEFAULTS["store"])),
    ]
    db.add_all(users)

    # ── WAREHOUSES ──
    warehouses = [
        models.Warehouse(code="WH-KOL-MAIN", name="KPS Main Warehouse - Kolkata", city="Kolkata", address="Topsia Industrial Area, EM Bypass", manager_name="S. Ghosh", contact_no="9000000101"),
        models.Warehouse(code="WH-KOL-SL", name="KPS Salt Lake Facility", city="Kolkata", address="Salt Lake Sector V, IT Hub", manager_name="Arindam Roy", contact_no="9000000102"),
        models.Warehouse(code="WH-KOL-TOLLY", name="KPS Tollygunge Studio Store", city="Kolkata", address="Tollygunge Circular Road", manager_name="Bikash Dey", contact_no="9000000103"),
        models.Warehouse(code="WH-MUM-MAIN", name="KPS Mumbai Transit Store", city="Mumbai", address="Goregaon Film City Area", manager_name="R. Mehta", contact_no="9000000201"),
        models.Warehouse(code="WH-MUM-AND", name="KPS Andheri Facility", city="Mumbai", address="Andheri West, Link Road", manager_name="Ramesh Nair", contact_no="9000000202"),
    ]
    db.add_all(warehouses)

    # ── VENDORS ──
    vendors = [
        models.Vendor(vendor_code="VEN-00001", name="ProService Hub", vendor_type="service", city="Kolkata", contact_person="Rahul Sharma", phone="9000000301", email="service@proservice.example", gst_number="19ABCDE1234F1Z1", notes="Primary camera & lens service partner"),
        models.Vendor(vendor_code="VEN-00002", name="Third Eye Rentals", vendor_type="equipment", city="Mumbai", contact_person="Amit Patil", phone="9000000302", email="rentals@thirdeye.example", gst_number="27ABCDE1234F1Z1", notes="Third-party camera & OB van rental"),
        models.Vendor(vendor_code="VEN-00003", name="StageCrew Partners", vendor_type="crew", city="Kolkata", contact_person="Nina Sen", phone="9000000303", email="hire@stagecrew.example", notes="External crew supply for events"),
        models.Vendor(vendor_code="VEN-00004", name="BroadcastTech Solutions", vendor_type="equipment", city="Delhi", contact_person="Vikram Malhotra", phone="9000000304", email="info@broadcasttech.example", gst_number="07XYZAB5678C1Z2", notes="Vision mixer & switcher rental"),
        models.Vendor(vendor_code="VEN-00005", name="Cine Logistics India", vendor_type="logistics", city="Mumbai", contact_person="Pradeep Nair", phone="9000000305", email="ops@cinelogistics.example", notes="Equipment transport & logistics"),
        models.Vendor(vendor_code="VEN-00006", name="AudioCraft Studio", vendor_type="service", city="Kolkata", contact_person="Debjit Das", phone="9000000306", email="fix@audiocraft.example", notes="Audio equipment repair & calibration"),
        models.Vendor(vendor_code="VEN-00007", name="PowerGen Rentals", vendor_type="equipment", city="Kolkata", contact_person="Tarun Basu", phone="9000000307", notes="UPS, generator, and power equipment rental"),
        models.Vendor(vendor_code="VEN-00008", name="FreelanceConnect", vendor_type="crew", city="Mumbai", contact_person="Sneha Joshi", phone="9000000308", email="book@freelanceconnect.example", notes="Freelance camera operators & technicians"),
    ]
    db.add_all(vendors)
    db.commit()

    # ── CLIENTS ──
    clients_data = [
        ("CLI-00001", "Velocity Sports Broadcast", "Sports Broadcast", "12 Park Street, Kolkata 700016", "19AAAAA1111A1Z1"),
        ("CLI-00002", "Star Entertainment Network", "Entertainment", "Film City Complex, Mumbai 400065", "27BBBBB2222B1Z2"),
        ("CLI-00003", "DD National Productions", "Government Broadcast", "Mandi House, New Delhi 110001", "07CCCCC3333C1Z3"),
        ("CLI-00004", "Bengal Premier League", "Sports Event", "Eden Gardens, Kolkata 700021", "19DDDDD4444D1Z4"),
        ("CLI-00005", "Zee Bangla Events", "Entertainment", "Rashbehari Avenue, Kolkata 700029", "19EEEEE5555E1Z5"),
        ("CLI-00006", "Colors TV East", "Television", "EM Bypass, Kolkata 700107", None),
        ("CLI-00007", "IPL Media Rights", "Sports", "BCCI HQ, Mumbai 400021", "27FFFFF6666F1Z6"),
    ]
    for code, name, ind, addr, gst in clients_data:
        db.add(models.Client(client_code=code, name=name, industry_type=ind, billing_address=addr, gst_number=gst))
    db.commit()

    # Client contacts
    cl1 = db.query(models.Client).filter(models.Client.client_code == "CLI-00001").first()
    cl2 = db.query(models.Client).filter(models.Client.client_code == "CLI-00002").first()
    cl4 = db.query(models.Client).filter(models.Client.client_code == "CLI-00004").first()
    db.add_all([
        models.ClientContact(client_id=cl1.id, contact_name="Sourav Das", designation="Producer", email="sourav@velocity.example", phone_country_code="+91", phone_number="9876543210", is_primary=True),
        models.ClientContact(client_id=cl1.id, contact_name="Rina Paul", designation="Accounts Manager", email="accounts@velocity.example", phone_country_code="+91", phone_number="9123456780", is_primary=False),
        models.ClientContact(client_id=cl2.id, contact_name="Manish Kapoor", designation="Technical Director", email="manish@star.example", phone_country_code="+91", phone_number="9876000111", is_primary=True),
        models.ClientContact(client_id=cl4.id, contact_name="Arup Banerjee", designation="Event Manager", email="arup@bpl.example", phone_country_code="+91", phone_number="9876000222", is_primary=True),
    ])
    db.commit()

    # ── EQUIPMENT MASTER ──
    eq_masters = [
        ("EQM-01000", "Sony FX9 Camera Body", "CAMERA", "device", "Sony", "FX9", "EQM-01010,EQM-01011", "EQM-01020,EQM-01021"),
        ("EQM-01001", "Panasonic P2 HD Recorder", "RECORDER", "device", "Panasonic", "AJ-HPM200", "EQM-01011", "EQM-01030"),
        ("EQM-01002", "Fujinon HA42x9.7 Box Lens", "LENS", "device", "Fujinon", "HA42x9.7", "", "EQM-01020"),
        ("EQM-01003", "Canon CN-E 70-200mm Cine Lens", "LENS", "device", "Canon", "CN-E 70-200", "", ""),
        ("EQM-01004", "Sony HDC-4300 Studio Camera", "CAMERA", "device", "Sony", "HDC-4300", "EQM-01010,EQM-01011", ""),
        ("EQM-01005", "Blackmagic ATEM 4M/E", "VISION MIXER", "device", "Blackmagic", "ATEM 4M/E", "", ""),
        ("EQM-01006", "Sony LMD-A240 24\" Monitor", "MONITOR", "device", "Sony", "LMD-A240", "", ""),
        ("EQM-01007", "Sennheiser ew 100 G4 Wireless", "WIRELESS AUDIO", "device", "Sennheiser", "ew100 G4", "", ""),
        ("EQM-01008", "Newtek 3Play 3P2", "INSTANT REPLAY", "device", "Newtek", "3Play 3P2", "", ""),
        ("EQM-01009", "AJA FS-HDR Converter", "CONVERTOR", "device", "AJA", "FS-HDR", "", ""),
        ("EQM-01010", "V-Mount Battery Pack 150Wh", "BATTERY", "accessory", "IDX", "VMOUNT-150", "", ""),
        ("EQM-01011", "Dual Battery Charger", "CHARGER", "accessory", "IDX", "VL-2Plus", "", ""),
        ("EQM-01020", "Sachtler Video 18 S2 Tripod", "TRIPOD", "accessory", "Sachtler", "Video 18 S2", "", ""),
        ("EQM-01021", "Teradek Bolt 4K LT Wireless", "WIRELESS VIDEO", "accessory", "Teradek", "Bolt 4K LT", "", ""),
        ("EQM-01030", "Audio Harness XLR Kit", "AUDIO", "accessory", "Generic", "XLR-KIT", "", ""),
        ("EQM-01031", "Clear-Com Beltpack HS", "COMMUNICATION", "accessory", "Clear-Com", "RS-702", "", ""),
        ("EQM-01032", "AJA HELO Streaming Encoder", "STREAMING", "device", "AJA", "HELO", "", ""),
        ("EQM-01033", "SSD Recording Drive 2TB", "HARD DISK", "accessory", "Samsung", "T7-2TB", "", ""),
        ("EQM-01034", "3KVA UPS System", "UPS", "device", "APC", "SRT3000", "", ""),
        ("EQM-01035", "Power Extension Board 16A", "POWER", "accessory", "Generic", "EXT-16A", "", ""),
    ]
    for code, name, cat, itype, brand, model, mand, opt in eq_masters:
        db.add(models.EquipmentMaster(equipment_code=code, name=name, category=cat, item_type=itype, brand=brand, model_no=model, mandatory_accessory_codes=mand or None, optional_accessory_codes=opt or None))
    db.commit()

    # ── INVENTORY ITEMS ──
    w1 = warehouses[0]  # Kolkata Main
    w2 = warehouses[3]  # Mumbai Main
    v2 = vendors[1]     # Third Eye Rentals
    v4 = vendors[3]     # BroadcastTech

    inv_items = [
        # Cameras
        ("KPS/CAM/FX9-01", "Sony FX9 Camera Body #1", "CAMERA", "device", w1.id, "inhouse", None, "Shelf C1", "EQM-01000"),
        ("KPS/CAM/FX9-02", "Sony FX9 Camera Body #2", "CAMERA", "device", w1.id, "inhouse", None, "Shelf C1", "EQM-01000"),
        ("KPS/CAM/FX9-03", "Sony FX9 Camera Body #3", "CAMERA", "device", w1.id, "inhouse", None, "Shelf C2", "EQM-01000"),
        ("KPS/CAM/FX9-04", "Sony FX9 Camera Body #4", "CAMERA", "device", w2.id, "inhouse", None, "Mumbai Rack A", "EQM-01000"),
        ("KPS/CAM/HDC-01", "Sony HDC-4300 Studio Camera #1", "CAMERA", "device", w1.id, "inhouse", None, "Studio Bay", "EQM-01004"),
        ("KPS/CAM/HDC-02", "Sony HDC-4300 Studio Camera #2", "CAMERA", "device", w1.id, "inhouse", None, "Studio Bay", "EQM-01004"),
        ("3P/CAM/RED-01", "RED Komodo 6K Package", "CAMERA", "third_party_equipment", w2.id, "third_party", v2.id, "Mumbai Transit", None),
        ("3P/CAM/ARRI-01", "ARRI Amira Premium", "CAMERA", "third_party_equipment", w1.id, "third_party", v2.id, "Kolkata Store", None),
        # Recorders
        ("KPS/REC/P2-01", "Panasonic P2 HD Recorder #1", "RECORDER", "device", w1.id, "inhouse", None, "Rack R1", "EQM-01001"),
        ("KPS/REC/P2-02", "Panasonic P2 HD Recorder #2", "RECORDER", "device", w1.id, "inhouse", None, "Rack R1", "EQM-01001"),
        # Lenses
        ("KPS/LENS/42X-01", "Fujinon HA42x Box Lens #1", "LENS", "device", w1.id, "inhouse", None, "Lens Locker", "EQM-01002"),
        ("KPS/LENS/42X-02", "Fujinon HA42x Box Lens #2", "LENS", "device", w1.id, "inhouse", None, "Lens Locker", "EQM-01002"),
        ("KPS/LENS/CN-01", "Canon CN-E 70-200mm #1", "LENS", "device", w1.id, "inhouse", None, "Lens Locker", "EQM-01003"),
        # Vision Mixer
        ("KPS/VMX/ATEM-01", "Blackmagic ATEM 4M/E #1", "VISION MIXER", "device", w1.id, "inhouse", None, "OB Van Bay", "EQM-01005"),
        ("3P/VMX/KAHUNA-01", "Kahuna Vision Mixer", "VISION MIXER", "third_party_equipment", w1.id, "third_party", v4.id, "Rental Store", None),
        # Monitors
        ("KPS/MON/LMD-01", "Sony LMD-A240 Monitor #1", "MONITOR", "device", w1.id, "inhouse", None, "Monitor Rack", "EQM-01006"),
        ("KPS/MON/LMD-02", "Sony LMD-A240 Monitor #2", "MONITOR", "device", w1.id, "inhouse", None, "Monitor Rack", "EQM-01006"),
        ("KPS/MON/LMD-03", "Sony LMD-A240 Monitor #3", "MONITOR", "device", w2.id, "inhouse", None, "Mumbai Rack", "EQM-01006"),
        # Audio
        ("KPS/AUD/SENN-01", "Sennheiser ew100 G4 Wireless Mic #1", "WIRELESS AUDIO", "device", w1.id, "inhouse", None, "Audio Bay", "EQM-01007"),
        ("KPS/AUD/SENN-02", "Sennheiser ew100 G4 Wireless Mic #2", "WIRELESS AUDIO", "device", w1.id, "inhouse", None, "Audio Bay", "EQM-01007"),
        ("KPS/AUD/XLR-01", "Audio Harness XLR Kit #1", "AUDIO", "accessory", w1.id, "inhouse", None, "Accessory Bay", "EQM-01030"),
        ("KPS/AUD/XLR-02", "Audio Harness XLR Kit #2", "AUDIO", "accessory", w1.id, "inhouse", None, "Accessory Bay", "EQM-01030"),
        # Replay
        ("KPS/RPL/3P-01", "Newtek 3Play 3P2 #1", "INSTANT REPLAY", "device", w1.id, "inhouse", None, "OB Van", "EQM-01008"),
        # Converters
        ("KPS/CNV/FS-01", "AJA FS-HDR Converter #1", "CONVERTOR", "device", w1.id, "inhouse", None, "Rack C1", "EQM-01009"),
        ("KPS/CNV/FS-02", "AJA FS-HDR Converter #2", "CONVERTOR", "device", w1.id, "inhouse", None, "Rack C1", "EQM-01009"),
        # Streaming
        ("KPS/STR/HELO-01", "AJA HELO Streaming Encoder #1", "STREAMING", "device", w1.id, "inhouse", None, "Streaming Bay", "EQM-01032"),
        # Batteries
        ("KPS/BAT/VM-01", "V-Mount Battery Pack 150Wh #1", "BATTERY", "accessory", w1.id, "inhouse", None, "Battery Rack", "EQM-01010"),
        ("KPS/BAT/VM-02", "V-Mount Battery Pack 150Wh #2", "BATTERY", "accessory", w1.id, "inhouse", None, "Battery Rack", "EQM-01010"),
        ("KPS/BAT/VM-03", "V-Mount Battery Pack 150Wh #3", "BATTERY", "accessory", w1.id, "inhouse", None, "Battery Rack", "EQM-01010"),
        ("KPS/BAT/VM-04", "V-Mount Battery Pack 150Wh #4", "BATTERY", "accessory", w2.id, "inhouse", None, "Mumbai Battery", "EQM-01010"),
        # Chargers
        ("KPS/CHR/01", "Dual Battery Charger #1", "CHARGER", "accessory", w1.id, "inhouse", None, "Battery Rack", "EQM-01011"),
        ("KPS/CHR/02", "Dual Battery Charger #2", "CHARGER", "accessory", w1.id, "inhouse", None, "Battery Rack", "EQM-01011"),
        ("KPS/CHR/03", "Dual Battery Charger #3", "CHARGER", "accessory", w2.id, "inhouse", None, "Mumbai Battery", "EQM-01011"),
        # Tripods
        ("KPS/TRI/S18-01", "Sachtler Video 18 S2 Tripod #1", "TRIPOD", "accessory", w1.id, "inhouse", None, "Tripod Bay", "EQM-01020"),
        ("KPS/TRI/S18-02", "Sachtler Video 18 S2 Tripod #2", "TRIPOD", "accessory", w1.id, "inhouse", None, "Tripod Bay", "EQM-01020"),
        # Wireless Video
        ("KPS/WLS/BOLT-01", "Teradek Bolt 4K LT #1", "WIRELESS VIDEO", "accessory", w1.id, "inhouse", None, "Wireless Bay", "EQM-01021"),
        ("KPS/WLS/BOLT-02", "Teradek Bolt 4K LT #2", "WIRELESS VIDEO", "accessory", w1.id, "inhouse", None, "Wireless Bay", "EQM-01021"),
        # Communication
        ("KPS/COM/BP-01", "Clear-Com Beltpack HS #1", "COMMUNICATION", "accessory", w1.id, "inhouse", None, "Com Bay", "EQM-01031"),
        ("KPS/COM/BP-02", "Clear-Com Beltpack HS #2", "COMMUNICATION", "accessory", w1.id, "inhouse", None, "Com Bay", "EQM-01031"),
        # Hard disk
        ("KPS/SSD/T7-01", "SSD Recording Drive 2TB #1", "HARD DISK", "accessory", w1.id, "inhouse", None, "Storage", "EQM-01033"),
        ("KPS/SSD/T7-02", "SSD Recording Drive 2TB #2", "HARD DISK", "accessory", w1.id, "inhouse", None, "Storage", "EQM-01033"),
        # UPS
        ("KPS/UPS/3K-01", "3KVA UPS System #1", "UPS", "device", w1.id, "inhouse", None, "Power Bay", "EQM-01034"),
        # Power
        ("KPS/PWR/EXT-01", "Power Extension Board 16A #1", "POWER", "accessory", w1.id, "inhouse", None, "Power Bay", "EQM-01035"),
        ("KPS/PWR/EXT-02", "Power Extension Board 16A #2", "POWER", "accessory", w1.id, "inhouse", None, "Power Bay", "EQM-01035"),
        ("KPS/PWR/EXT-03", "Power Extension Board 16A #3", "POWER", "accessory", w1.id, "inhouse", None, "Power Bay", "EQM-01035"),
    ]

    for idx, (asset, name, cat, itype, wh_id, owner, vid, loc, eqm_code) in enumerate(inv_items, start=1):
        em = db.query(models.EquipmentMaster).filter(models.EquipmentMaster.equipment_code == eqm_code).first() if eqm_code else None
        status = "available"
        service_status = "ok"
        # Make one item in service
        if asset == "KPS/MON/LMD-03":
            status = "servicing"
            service_status = "in_service"
        sn = f"SN-{idx:06d}" if itype == "device" else None
        db.add(models.InventoryItem(
            asset_code=asset,
            product_code=f"PRD-{idx:06d}",
            serial_number=sn,
            name=name,
            category=cat,
            item_type=itype,
            equipment_master_id=em.id if em else None,
            warehouse_id=wh_id,
            owner_type=owner,
            vendor_id=vid,
            status=status,
            location_text=loc,
            warranty_expiry=date(2026, 6, 30) if idx % 3 == 0 else (date(2026, 4, 15) if idx % 7 == 0 else None),
            service_due=date(2026, 5, 1) if idx % 5 == 0 else None,
            service_status=service_status,
            statutory_tag=asset,
            notes=f"Seed data – {name}",
        ))
    db.commit()

    # ── CREW MEMBERS ──
    crew_data = [
        ("EMP-00001", "Arjun Sen", "Camera Chief", "inhouse", None, "Kolkata", "9000000501", "Aadhaar", "XXXX-1001"),
        ("EMP-00002", "Ritika Bose", "Production Coordinator", "contractual", 3, "Kolkata", "9000000502", "PAN", "ABCDE1002X"),
        ("EMP-00003", "Neha Kapoor", "Sound Engineer", "external", 3, "Kolkata", "9000000503", "Aadhaar", "XXXX-1003"),
        ("EMP-00004", "Rahul Ghosh", "Camera Operator", "inhouse", None, "Kolkata", "9000000504", "Aadhaar", "XXXX-1004"),
        ("EMP-00005", "Sohini Dutta", "Vision Mixer Operator", "inhouse", None, "Kolkata", "9000000505", "Voter ID", "VOT-2005"),
        ("EMP-00006", "Anirban Saha", "Audio Engineer", "contractual", 6, "Kolkata", "9000000506", "Aadhaar", "XXXX-1006"),
        ("EMP-00007", "Pritha Roy", "Technical Director", "inhouse", None, "Kolkata", "9000000507", "PAN", "FGHIJ1007K"),
        ("EMP-00008", "Ritwick De", "CCU Operator", "freelance", None, "Mumbai", "9000000508", "Passport", "P1234508"),
        ("EMP-00009", "Monalisa Sen", "Production Assistant", "external", 3, "Kolkata", "9000000509", "Aadhaar", "XXXX-1009"),
        ("EMP-00010", "Vikash Kumar", "Graphics Operator", "inhouse", None, "Kolkata", "9000000510", None, None),
        ("EMP-00011", "Debashish Mukherjee", "OB Van Driver", "inhouse", None, "Kolkata", "9000000511", "DL", "WB-DL-2011"),
        ("EMP-00012", "Tanmay Ghosh", "Rigger / Grip", "freelance", None, "Mumbai", "9000000512", None, None),
        ("EMP-00013", "Sangeeta Chatterjee", "Makeup Artist", "external", 8, "Mumbai", "9000000513", None, None),
        ("EMP-00014", "Kamal Halder", "Electrician / Power Tech", "inhouse", None, "Kolkata", "9000000514", "Aadhaar", "XXXX-1014"),
        ("EMP-00015", "Ranjit Mondal", "Camera Operator", "inhouse", None, "Kolkata", "9000000515", "Aadhaar", "XXXX-1015"),
    ]
    for code, name, role, mtype, vid_idx, station, phone, id_type, id_num in crew_data:
        vid = vendors[vid_idx - 1].id if vid_idx else None
        addr = f"{name}'s Address, {station}" if station else None
        aadhar = id_num if id_type == "Aadhaar" else None
        db.add(models.CrewMember(employee_code=code, full_name=name, role=role, manpower_type=mtype, vendor_id=vid, home_station=station, phone=phone, address=addr, aadhar_number=aadhar, id_proof_type=id_type, id_proof_number=id_num, status="available"))
    db.commit()

    # ── PROJECTS ──
    today = date.today()
    project_data = [
        ("Velocity Premier Cup – Match Day 1", "Sports", "CLI-00001", "Eden Gardens Broadcast Compound", w1.id, datetime(2026, 4, 12, 8, 0), 1, 4, 10, 3, "planned"),
        ("Star Entertainment Award Night", "Event", "CLI-00002", "Film City Auditorium, Mumbai", w2.id, datetime(2026, 4, 18, 14, 0), 2, 6, 5, 4, "planned"),
        ("DD National Independence Day Coverage", "Sports", "CLI-00003", "Red Fort Grounds, Delhi", w1.id, datetime(2026, 8, 15, 6, 0), 3, 12, 8, 6, "planned"),
        ("Bengal Premier League Opening Ceremony", "Sports", "CLI-00004", "Salt Lake Stadium", w1.id, datetime(2026, 4, 25, 16, 0), 1, 2, 4, 2, "planned"),
        ("Zee Bangla Sa Re Ga Ma Pa Shoot", "TV Show", "CLI-00005", "Zee Bangla Studio, Kolkata", w1.id, datetime(2026, 5, 5, 10, 0), 0, 1, 6, 2, "confirmed"),
        ("Colors Bangla Reality Show Episode 12", "Reality Show", "CLI-00006", "Colors Studio, EM Bypass", w1.id, datetime(2026, 5, 10, 9, 0), 0, 1, 8, 2, "planned"),
        ("IPL 2026 – KKR vs MI", "Sports", "CLI-00007", "Eden Gardens, Kolkata", w1.id, datetime(2026, 4, 20, 15, 0), 2, 3, 6, 4, "planned"),
    ]
    projects = []
    for title, stype, cli_code, venue, wh_id, shoot_start, setup, travel, shoot, ret, status in project_data:
        client = db.query(models.Client).filter(models.Client.client_code == cli_code).first()
        block_start, block_end = calc_block_window(shoot_start, setup, travel, shoot, ret)
        shoot_end_dt = datetime(shoot_start.year, shoot_start.month, shoot_start.day, shoot_start.hour + shoot, shoot_start.minute) if shoot_start else None
        setup_dt = (shoot_start - timedelta(days=setup)).date() if setup else None
        expected_s = (shoot_start - timedelta(days=setup + 1)).date()
        expected_e = (shoot_start + timedelta(hours=shoot + ret)).date()
        p = models.ProjectEvent(title=title, show_type=stype, client_id=client.id if client else None, venue=venue, origin_warehouse_id=wh_id, shoot_start=shoot_start, shoot_end=shoot_end_dt, setup_date=setup_dt, off_days=0, expected_start_date=expected_s, expected_end_date=expected_e, setup_days=setup, block_start=block_start, block_end=block_end, status=status, notes=f"Seed project – {title}")
        db.add(p)
        projects.append(p)
    db.commit()

    # ── BOOKINGS ──
    c1 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00001").first()
    c2 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00002").first()
    c4 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00004").first()
    c5 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00005").first()
    c6 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00006").first()

    i_fx9_1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/CAM/FX9-01").first()
    i_fx9_2 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/CAM/FX9-02").first()
    i_bat1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/BAT/VM-01").first()
    i_bat2 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/BAT/VM-02").first()
    i_chr1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/CHR/01").first()
    i_tri1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/TRI/S18-01").first()
    i_aud1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/AUD/SENN-01").first()
    i_atem = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/VMX/ATEM-01").first()
    i_mon1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/MON/LMD-01").first()
    i_mon2 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/MON/LMD-02").first()

    # Booking 1 - blocked
    b1 = models.EventBooking(project_id=projects[0].id, job_card_id="JC-00001", destination="Eden Gardens Broadcast Compound", status="blocked", transport_mode="company_vehicle", contact_person_name="Arjun Sen", contact_person_mobile="9000000501", remarks="Main camera + audio setup for Match Day 1")
    db.add(b1)
    db.commit()
    db.add_all([
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_fx9_1.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_fx9_2.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_bat1.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_bat2.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_chr1.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_tri1.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_aud1.id),
        models.BookingCrew(booking_id=b1.id, crew_member_id=c1.id),
        models.BookingCrew(booking_id=b1.id, crew_member_id=c4.id),
        models.BookingCrew(booking_id=b1.id, crew_member_id=c6.id),
    ])
    for item in [i_fx9_1, i_fx9_2, i_bat1, i_bat2, i_chr1, i_tri1, i_aud1]:
        item.status = "reserved"
    for crew in [c1, c4, c6]:
        crew.status = "blocked"

    # Booking 2 - blocked
    b2 = models.EventBooking(project_id=projects[3].id, job_card_id="JC-00002", destination="Salt Lake Stadium, Kolkata", status="blocked", transport_mode="hired", contact_person_name="Ritika Bose", contact_person_mobile="9000000502", remarks="BPL Opening – vision mixer + monitors")
    db.add(b2)
    db.commit()
    db.add_all([
        models.BookingEquipment(booking_id=b2.id, inventory_item_id=i_atem.id),
        models.BookingEquipment(booking_id=b2.id, inventory_item_id=i_mon1.id),
        models.BookingEquipment(booking_id=b2.id, inventory_item_id=i_mon2.id),
        models.BookingCrew(booking_id=b2.id, crew_member_id=c2.id),
        models.BookingCrew(booking_id=b2.id, crew_member_id=c5.id),
    ])
    i_atem.status = "reserved"
    i_mon1.status = "reserved"
    i_mon2.status = "reserved"
    c2.status = "blocked"
    c5.status = "blocked"

    # Gate passes
    db.add(models.GatePass(gate_pass_number="GATE-00001", booking_id=b1.id, pass_type="gate_out", approved_by="System Auto", status="issued", remarks="Seed gate out – Match Day 1"))
    db.add(models.GatePass(gate_pass_number="GATE-00002", booking_id=b2.id, pass_type="gate_out", approved_by="System Auto", status="issued", remarks="Seed gate out – BPL Opening"))

    # ── SERVICE JOBS ──
    i_mon3 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "KPS/MON/LMD-03").first()
    db.add(models.ServiceJob(job_number="SRV-00001", inventory_item_id=i_mon3.id, vendor_id=vendors[0].id, vendor_name="ProService Hub", sent_date=date(2026, 4, 5), expected_return_date=date(2026, 4, 12), status="in_service", problem_reported="Backlight flickering intermittently", remarks="Under warranty repair"))

    # ── PROCUREMENT ORDERS ──
    db.add_all([
        models.ProcurementOrder(po_number="PO-10001", procurement_code="PROC-00001", item_name="RED Komodo 6K Package Rental", item_type="equipment", quantity=1, vendor_id=vendors[1].id, status="ordered", expected_date=date(2026, 4, 15), notes="For IPL backup"),
        models.ProcurementOrder(po_number="PO-10002", procurement_code="PROC-00002", item_name="V-Mount Battery Pack 150Wh x4", item_type="accessory", quantity=4, vendor_id=vendors[6].id, status="requested", expected_date=date(2026, 5, 1), notes="Stock replenishment"),
        models.ProcurementOrder(po_number="PO-10003", procurement_code="PROC-00003", item_name="Freelance Camera Operator for IPL", item_type="manpower", quantity=2, vendor_id=vendors[7].id, status="ordered", expected_date=date(2026, 4, 18), notes="2 operators for 3 match days"),
    ])

    # ── PAPERS ──
    db.add(models.OutboundPaper(paper_number="PAP-00001", paper_type="Shoot Dispatch", reference_name="Velocity Premier Cup – Match Day 1", destination="Eden Gardens Broadcast Compound", issued_by="Store Admin", issue_status="ready", related_booking_id=b1.id, signature_name="S. Ghosh", remarks="Main dispatch with all equipment"))
    db.add(models.OutboundPaper(paper_number="PAP-00002", paper_type="Equipment Gate Pass", reference_name="BPL Opening Ceremony", destination="Salt Lake Stadium", issued_by="Operations", issue_status="draft", related_booking_id=b2.id, signature_name="Arindam Roy"))

    db.commit()
    ensure_demo_data(db)
