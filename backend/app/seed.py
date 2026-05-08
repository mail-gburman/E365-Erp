from datetime import datetime, date, timedelta
import json
from sqlalchemy.orm import Session
from . import models
from .auth import hash_password
from .permissions import ROLE_DEFAULTS
from .utils import calc_block_window

_BUILTIN_PRESET_NAMES = ["super_admin", "admin", "producer", "operations", "store", "accounts", "qc", "viewer"]

_BUILTIN_DESCRIPTIONS = {
    "super_admin": "E365 master access for SaaS company onboarding",
    "admin":      "Full access to all modules and actions",
    "producer":   "Project & booking oversight, approvals, exports — no master edits",
    "operations": "End-to-end field ops: bookings, dispatch, returns, QC, papers",
    "store":      "Warehouse, inventory management, dispatch/returns, QC",
    "accounts":   "Billing, invoicing, procurement and financial approvals",
    "qc":         "Quality control, service jobs, damage reporting, returns",
    "viewer":     "Read-only access across all non-sensitive modules",
}


def seed_builtin_presets(db: Session):
    """Ensure all built-in role presets exist in the DB. Safe to call repeatedly."""
    for name in _BUILTIN_PRESET_NAMES:
        existing = db.query(models.RolePreset).filter(models.RolePreset.name == name).first()
        if not existing:
            db.add(models.RolePreset(
                name=name,
                description=_BUILTIN_DESCRIPTIONS.get(name, ""),
                permissions_json=json.dumps(ROLE_DEFAULTS.get(name, {})),
                is_builtin=True,
                created_by="system",
            ))
    db.commit()


def seed_db(db: Session):
    seed_builtin_presets(db)

    default_company = db.query(models.Company).filter(models.Company.name == "E365 Demo Event Company").first()
    if not default_company:
        default_company = models.Company(
            name="E365 Demo Event Company",
            legal_name="E365 Demo Event Company",
            contact_person="Company Admin",
            email="admin@e365.demo",
            country="India",
            status="active",
        )
        db.add(default_company)
        db.commit()
        db.refresh(default_company)

    if not db.query(models.User).filter(models.User.username == "e365").first():
        db.add(models.User(
            username="e365",
            password_hash=hash_password("e365master123"),
            role="super_admin",
            full_name="E365 Master Admin",
            email="master@e365erp.com",
            permissions_json=json.dumps(ROLE_DEFAULTS["super_admin"]),
            company_id=None,
        ))
        db.commit()

    default_users = [
        ("admin", "admin123", "admin"),
        ("operations", "ops123", "operations"),
        ("store", "store123", "store"),
    ]
    for username, password, role in default_users:
        if not db.query(models.User).filter(models.User.username == username).first():
            db.add(models.User(
                username=username,
                password_hash=hash_password(password),
                role=role,
                company_id=default_company.id,
                permissions_json=json.dumps(ROLE_DEFAULTS[role]),
            ))
    for user in db.query(models.User).filter(models.User.role != "super_admin", models.User.company_id.is_(None)).all():
        user.company_id = default_company.id
    db.commit()

    # Business/reference seed should still run after a reset that preserves users.
    if db.query(models.Warehouse).first():
        return

    # ── WAREHOUSES ──
    warehouses = [
        models.Warehouse(code="WH-KOL-MAIN", name="E365 Main Warehouse - Kolkata", city="Kolkata", address="Topsia Industrial Area, EM Bypass", manager_name="S. Ghosh", contact_no="9000000101"),
        models.Warehouse(code="WH-KOL-SL", name="E365 Salt Lake Facility", city="Kolkata", address="Salt Lake Sector V, IT Hub", manager_name="Arindam Roy", contact_no="9000000102"),
        models.Warehouse(code="WH-KOL-TOLLY", name="E365 Tollygunge Studio Store", city="Kolkata", address="Tollygunge Circular Road", manager_name="Bikash Dey", contact_no="9000000103"),
        models.Warehouse(code="WH-MUM-MAIN", name="E365 Mumbai Transit Store", city="Mumbai", address="Goregaon Film City Area", manager_name="R. Mehta", contact_no="9000000201"),
        models.Warehouse(code="WH-MUM-AND", name="E365 Andheri Facility", city="Mumbai", address="Andheri West, Link Road", manager_name="Ramesh Nair", contact_no="9000000202"),
    ]
    db.add_all(warehouses)

    # ── VENDORS ──
    vendors = [
        models.Vendor(vendor_code="VEN-00001", name="LuminaryStagecraft", vendor_type="service", city="Kolkata", contact_person="Rahul Sharma", phone="9000000301", email="service@luminary.example", gst_number="19ABCDE1234F1Z1", notes="Primary stage lighting service and maintenance partner"),
        models.Vendor(vendor_code="VEN-00002", name="SoundVision Rentals", vendor_type="equipment", city="Mumbai", contact_person="Amit Patil", phone="9000000302", email="rentals@soundvision.example", gst_number="27ABCDE1234F1Z1", notes="Third-party audio and LED screen rental – Mumbai"),
        models.Vendor(vendor_code="VEN-00003", name="StageCrew Partners", vendor_type="crew", city="Kolkata", contact_person="Nina Sen", phone="9000000303", email="hire@stagecrew.example", notes="External crew supply for events"),
        models.Vendor(vendor_code="VEN-00004", name="LED Display Solutions", vendor_type="equipment", city="Delhi", contact_person="Vikram Malhotra", phone="9000000304", email="info@leddisplay.example", gst_number="07XYZAB5678C1Z2", notes="LED screen and video processor rental – Delhi / Mumbai"),
        models.Vendor(vendor_code="VEN-00005", name="Shakti Event Logistics", vendor_type="logistics", city="Mumbai", contact_person="Pradeep Nair", phone="9000000305", email="ops@shaktilogistics.example", notes="Equipment transport and event logistics – Pan India"),
        models.Vendor(vendor_code="VEN-00006", name="AudioSync Services", vendor_type="service", city="Kolkata", contact_person="Debjit Das", phone="9000000306", email="fix@audiosync.example", notes="Audio equipment repair, calibration, and PAT testing"),
        models.Vendor(vendor_code="VEN-00007", name="PowerGen Rentals", vendor_type="equipment", city="Kolkata", contact_person="Tarun Basu", phone="9000000307", notes="DG sets, UPS, and power distribution rental"),
        models.Vendor(vendor_code="VEN-00008", name="StageHands Connect", vendor_type="crew", city="Mumbai", contact_person="Sneha Joshi", phone="9000000308", email="book@stagehands.example", notes="Freelance lighting technicians, riggers, and stage crew"),
    ]
    db.add_all(vendors)
    db.commit()

    # ── CLIENTS ──
    clients_data = [
        ("CLI-00001", "Prestige Event Productions", "Corporate Events", "BKC Corporate Park, Mumbai 400051", "27PREST1111A1Z1"),
        ("CLI-00002", "Star Productions Mumbai", "Entertainment", "Film City Complex, Goregaon, Mumbai 400065", "27STARP2222B1Z2"),
        ("CLI-00003", "Doordarshan National Events", "Government Events", "Mandi House, New Delhi 110001", "07DDNAT3333C1Z3"),
        ("CLI-00004", "Bengal Cultural Society", "Cultural Events", "Eden Gardens Complex, Kolkata 700021", "19BCULT4444D1Z4"),
        ("CLI-00005", "Zee Sangeet Events", "Entertainment", "Rashbehari Avenue, Kolkata 700029", "19ZESAN5555E1Z5"),
        ("CLI-00006", "Colors TV Live Events", "Television", "EM Bypass, Kolkata 700107", None),
        ("CLI-00007", "IPL Fan Experience", "Sports Events", "BCCI HQ, Mumbai 400021", "27IPLFN6666F1Z6"),
    ]
    for code, name, ind, addr, gst in clients_data:
        db.add(models.Client(client_code=code, name=name, industry_type=ind, billing_address=addr, gst_number=gst))
    db.commit()

    # Client contacts
    cl1 = db.query(models.Client).filter(models.Client.client_code == "CLI-00001").first()
    cl2 = db.query(models.Client).filter(models.Client.client_code == "CLI-00002").first()
    cl4 = db.query(models.Client).filter(models.Client.client_code == "CLI-00004").first()
    db.add_all([
        models.ClientContact(client_id=cl1.id, contact_name="Sourav Das", designation="Event Producer", email="sourav@prestige.example", phone_country_code="+91", phone_number="9876543210", is_primary=True),
        models.ClientContact(client_id=cl1.id, contact_name="Rina Paul", designation="Accounts Manager", email="accounts@prestige.example", phone_country_code="+91", phone_number="9123456780", is_primary=False),
        models.ClientContact(client_id=cl2.id, contact_name="Manish Kapoor", designation="Show Director", email="manish@star.example", phone_country_code="+91", phone_number="9876000111", is_primary=True),
        models.ClientContact(client_id=cl4.id, contact_name="Arup Banerjee", designation="Festival Director", email="arup@bengalcultural.example", phone_country_code="+91", phone_number="9876000222", is_primary=True),
    ])
    db.commit()

    # ── EQUIPMENT MASTER ──
    eq_masters = [
        # Stage Lighting
        ("EQM-01000", "Martin MAC Aura XB Moving Head", "LIGHTING", "device", "Martin", "MAC Aura XB", "EQM-01020,EQM-01030", "EQM-01021"),
        ("EQM-01001", "Chauvet Strike 4 LED Blinder", "LIGHTING", "device", "Chauvet", "Strike 4", "", ""),
        ("EQM-01002", "Elation Platinum Spot 5R Pro", "LIGHTING", "device", "Elation", "Platinum Spot 5R Pro", "EQM-01030", ""),
        ("EQM-01003", "ADJ Vizi Beam Z19 Moving Head", "LIGHTING", "device", "ADJ", "Vizi Beam Z19", "EQM-01030", ""),
        ("EQM-01004", "Varytec Power Commander 12ch Dimmer", "DIMMER", "device", "Varytec", "PC-2412", "", ""),
        ("EQM-01005", "Antari HZ-400 Haze Machine", "EFFECTS", "device", "Antari", "HZ-400", "", ""),
        # Audio
        ("EQM-01006", 'JBL SRX815P Powered Speaker 15"', "SPEAKER", "device", "JBL", "SRX815P", "EQM-01031", ""),
        ("EQM-01007", 'JBL SRX818SP Powered Subwoofer 18"', "SUBWOOFER", "device", "JBL", "SRX818SP", "EQM-01031", ""),
        ("EQM-01008", "Crown XTi 4002 Power Amplifier", "AMPLIFIER", "device", "Crown", "XTi 4002", "EQM-01031", ""),
        ("EQM-01009", "Allen & Heath SQ-6 Digital Mixer", "MIXER", "device", "Allen & Heath", "SQ-6", "", ""),
        ("EQM-01010", "Shure QLXD4 Wireless Receiver", "WIRELESS AUDIO", "device", "Shure", "QLXD4", "EQM-01031", ""),
        ("EQM-01011", "Shure SM58 Wired Dynamic Microphone", "MICROPHONE", "accessory", "Shure", "SM58", "", ""),
        # Rigging / Support
        ("EQM-01020", "Prolyte H30V Truss Section 3m", "TRUSS", "accessory", "Prolyte", "H30V 3m", "", ""),
        ("EQM-01021", "Crank Stand 1 Ton Heavy-Duty", "STAND", "accessory", "Global Truss", "ST-180", "", ""),
        ("EQM-01030", "DMX Cable 5-Pin 15m", "CABLE", "accessory", "Neutrik", "DMX-5P-15M", "", ""),
        ("EQM-01031", "XLR Audio Cable 15m", "CABLE", "accessory", "Neutrik", "XLR-15M", "", ""),
        # Mixers
        ("EQM-01032", "Yamaha QL5 Digital Mixer 32-ch", "MIXER", "device", "Yamaha", "QL5", "", ""),
        # LED Screens
        ("EQM-01033", "Absen PL3.9 Indoor LED Panel 500x500mm", "LED PANEL", "device", "Absen", "PL3.9", "", ""),
        ("EQM-01034", "Chauvet P4.8 Outdoor LED Panel 500x500mm", "LED PANEL", "device", "Chauvet Professional", "P4.8 Outdoor", "", ""),
        ("EQM-01035", "Power Extension Board 32A", "POWER", "accessory", "Generic", "EXT-32A", "", ""),
        ("EQM-01036", "Novastar VX4S LED Video Processor", "LED CONTROLLER", "device", "Novastar", "VX4S", "", ""),
    ]
    for code, name, cat, itype, brand, model, mand, opt in eq_masters:
        db.add(models.EquipmentMaster(equipment_code=code, name=name, category=cat, item_type=itype, brand=brand, model_no=model, mandatory_accessory_codes=mand or None, optional_accessory_codes=opt or None))
    db.commit()

    # ── INVENTORY ITEMS ──
    w1 = warehouses[0]  # Kolkata Main
    w2 = warehouses[3]  # Mumbai Main
    v2 = vendors[1]     # SoundVision Rentals
    v4 = vendors[3]     # LED Display Solutions

    inv_items = [
        # Stage Moving Heads – Martin MAC Aura XB
        ("E365/LGT/MAC-01", "Martin MAC Aura XB Moving Head #1", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay A", "EQM-01000"),
        ("E365/LGT/MAC-02", "Martin MAC Aura XB Moving Head #2", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay A", "EQM-01000"),
        ("E365/LGT/MAC-03", "Martin MAC Aura XB Moving Head #3", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay A", "EQM-01000"),
        ("E365/LGT/MAC-04", "Martin MAC Aura XB Moving Head #4", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay B", "EQM-01000"),
        ("E365/LGT/MAC-05", "Martin MAC Aura XB Moving Head #5", "LIGHTING", "device", w2.id, "inhouse", None, "Mumbai Rack A", "EQM-01000"),
        ("E365/LGT/MAC-06", "Martin MAC Aura XB Moving Head #6", "LIGHTING", "device", w2.id, "inhouse", None, "Mumbai Rack A", "EQM-01000"),
        # Blinders – Chauvet Strike 4
        ("E365/LGT/STK-01", "Chauvet Strike 4 LED Blinder #1", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay B", "EQM-01001"),
        ("E365/LGT/STK-02", "Chauvet Strike 4 LED Blinder #2", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay B", "EQM-01001"),
        ("E365/LGT/STK-03", "Chauvet Strike 4 LED Blinder #3", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay B", "EQM-01001"),
        ("E365/LGT/STK-04", "Chauvet Strike 4 LED Blinder #4", "LIGHTING", "device", w2.id, "inhouse", None, "Mumbai Rack B", "EQM-01001"),
        # Spots – Elation Platinum 5R
        ("E365/LGT/EPT-01", "Elation Platinum Spot 5R Pro #1", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay C", "EQM-01002"),
        ("E365/LGT/EPT-02", "Elation Platinum Spot 5R Pro #2", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay C", "EQM-01002"),
        # Beams – ADJ Vizi Beam Z19
        ("E365/LGT/ADJ-01", "ADJ Vizi Beam Z19 Moving Head #1", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay C", "EQM-01003"),
        ("E365/LGT/ADJ-02", "ADJ Vizi Beam Z19 Moving Head #2", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay C", "EQM-01003"),
        ("E365/LGT/ADJ-03", "ADJ Vizi Beam Z19 Moving Head #3", "LIGHTING", "device", w1.id, "inhouse", None, "Lighting Bay C", "EQM-01003"),
        ("E365/LGT/ADJ-04", "ADJ Vizi Beam Z19 Moving Head #4", "LIGHTING", "device", w2.id, "inhouse", None, "Mumbai Rack B", "EQM-01003"),
        # Dimmer Racks
        ("E365/LGT/DIM-01", "Varytec Power Commander 12ch Dimmer #1", "DIMMER", "device", w1.id, "inhouse", None, "Power Bay", "EQM-01004"),
        ("E365/LGT/DIM-02", "Varytec Power Commander 12ch Dimmer #2", "DIMMER", "device", w1.id, "inhouse", None, "Power Bay", "EQM-01004"),
        # Haze Machines
        ("E365/LGT/HAZ-01", "Antari HZ-400 Haze Machine #1", "EFFECTS", "device", w1.id, "inhouse", None, "Effects Bay", "EQM-01005"),
        ("E365/LGT/HAZ-02", "Antari HZ-400 Haze Machine #2", "EFFECTS", "device", w2.id, "inhouse", None, "Mumbai Effects", "EQM-01005"),
        # Powered Speakers – JBL SRX815P
        ("E365/AUD/JBL-01", "JBL SRX815P Powered Speaker #1", "SPEAKER", "device", w1.id, "inhouse", None, "Audio Bay A", "EQM-01006"),
        ("E365/AUD/JBL-02", "JBL SRX815P Powered Speaker #2", "SPEAKER", "device", w1.id, "inhouse", None, "Audio Bay A", "EQM-01006"),
        ("E365/AUD/JBL-03", "JBL SRX815P Powered Speaker #3", "SPEAKER", "device", w1.id, "inhouse", None, "Audio Bay A", "EQM-01006"),
        ("E365/AUD/JBL-04", "JBL SRX815P Powered Speaker #4", "SPEAKER", "device", w2.id, "inhouse", None, "Mumbai Audio", "EQM-01006"),
        ("E365/AUD/JBL-05", "JBL SRX815P Powered Speaker #5", "SPEAKER", "device", w2.id, "inhouse", None, "Mumbai Audio", "EQM-01006"),
        ("E365/AUD/JBL-06", "JBL SRX815P Powered Speaker #6", "SPEAKER", "device", w2.id, "inhouse", None, "Mumbai Audio", "EQM-01006"),
        # Subwoofers – JBL SRX818SP
        ("E365/AUD/SUB-01", "JBL SRX818SP Powered Subwoofer #1", "SUBWOOFER", "device", w1.id, "inhouse", None, "Audio Bay B", "EQM-01007"),
        ("E365/AUD/SUB-02", "JBL SRX818SP Powered Subwoofer #2", "SUBWOOFER", "device", w1.id, "inhouse", None, "Audio Bay B", "EQM-01007"),
        ("E365/AUD/SUB-03", "JBL SRX818SP Powered Subwoofer #3", "SUBWOOFER", "device", w2.id, "inhouse", None, "Mumbai Audio", "EQM-01007"),
        ("E365/AUD/SUB-04", "JBL SRX818SP Powered Subwoofer #4", "SUBWOOFER", "device", w2.id, "inhouse", None, "Mumbai Audio", "EQM-01007"),
        # Power Amplifiers – Crown XTi 4002
        ("E365/AUD/AMP-01", "Crown XTi 4002 Power Amplifier #1", "AMPLIFIER", "device", w1.id, "inhouse", None, "Audio Bay C", "EQM-01008"),
        ("E365/AUD/AMP-02", "Crown XTi 4002 Power Amplifier #2", "AMPLIFIER", "device", w1.id, "inhouse", None, "Audio Bay C", "EQM-01008"),
        # Mixers
        ("E365/AUD/MXA-01", "Allen & Heath SQ-6 Digital Mixer #1", "MIXER", "device", w1.id, "inhouse", None, "Mixer Bay", "EQM-01009"),
        ("E365/AUD/MXY-01", "Yamaha QL5 Digital Mixer #1", "MIXER", "device", w1.id, "inhouse", None, "Mixer Bay", "EQM-01032"),
        # Wireless Receivers – Shure QLXD4
        ("E365/AUD/WLS-01", "Shure QLXD4 Wireless Receiver #1", "WIRELESS AUDIO", "device", w1.id, "inhouse", None, "Audio Bay D", "EQM-01010"),
        ("E365/AUD/WLS-02", "Shure QLXD4 Wireless Receiver #2", "WIRELESS AUDIO", "device", w1.id, "inhouse", None, "Audio Bay D", "EQM-01010"),
        ("E365/AUD/WLS-03", "Shure QLXD4 Wireless Receiver #3", "WIRELESS AUDIO", "device", w1.id, "inhouse", None, "Audio Bay D", "EQM-01010"),
        ("E365/AUD/WLS-04", "Shure QLXD4 Wireless Receiver #4", "WIRELESS AUDIO", "device", w2.id, "inhouse", None, "Mumbai Wireless", "EQM-01010"),
        # Indoor LED Panels – Absen PL3.9
        ("E365/LED/PNL-01", "Absen PL3.9 Indoor LED Panel #1", "LED PANEL", "device", w1.id, "inhouse", None, "LED Bay", "EQM-01033"),
        ("E365/LED/PNL-02", "Absen PL3.9 Indoor LED Panel #2", "LED PANEL", "device", w1.id, "inhouse", None, "LED Bay", "EQM-01033"),
        ("E365/LED/PNL-03", "Absen PL3.9 Indoor LED Panel #3", "LED PANEL", "device", w1.id, "inhouse", None, "LED Bay", "EQM-01033"),
        ("E365/LED/PNL-04", "Absen PL3.9 Indoor LED Panel #4", "LED PANEL", "device", w1.id, "inhouse", None, "LED Bay", "EQM-01033"),
        ("E365/LED/PNL-05", "Absen PL3.9 Indoor LED Panel #5", "LED PANEL", "device", w1.id, "inhouse", None, "LED Bay", "EQM-01033"),
        ("E365/LED/PNL-06", "Absen PL3.9 Indoor LED Panel #6", "LED PANEL", "device", w2.id, "inhouse", None, "Mumbai LED", "EQM-01033"),
        ("E365/LED/PNL-07", "Absen PL3.9 Indoor LED Panel #7", "LED PANEL", "device", w2.id, "inhouse", None, "Mumbai LED", "EQM-01033"),
        ("E365/LED/PNL-08", "Absen PL3.9 Indoor LED Panel #8", "LED PANEL", "device", w2.id, "inhouse", None, "Mumbai LED", "EQM-01033"),
        # Outdoor LED Panels – Chauvet P4.8
        ("E365/LED/OUT-01", "Chauvet P4.8 Outdoor LED Panel #1", "LED PANEL", "device", w1.id, "inhouse", None, "LED Outdoor Bay", "EQM-01034"),
        ("E365/LED/OUT-02", "Chauvet P4.8 Outdoor LED Panel #2", "LED PANEL", "device", w1.id, "inhouse", None, "LED Outdoor Bay", "EQM-01034"),
        ("E365/LED/OUT-03", "Chauvet P4.8 Outdoor LED Panel #3", "LED PANEL", "device", w1.id, "inhouse", None, "LED Outdoor Bay", "EQM-01034"),
        ("E365/LED/OUT-04", "Chauvet P4.8 Outdoor LED Panel #4", "LED PANEL", "device", w2.id, "inhouse", None, "Mumbai Outdoor", "EQM-01034"),
        ("E365/LED/OUT-05", "Chauvet P4.8 Outdoor LED Panel #5", "LED PANEL", "device", w2.id, "inhouse", None, "Mumbai Outdoor", "EQM-01034"),
        ("E365/LED/OUT-06", "Chauvet P4.8 Outdoor LED Panel #6", "LED PANEL", "device", w2.id, "inhouse", None, "Mumbai Outdoor", "EQM-01034"),
        # LED Processor
        ("E365/LED/CTL-01", "Novastar VX4S LED Video Processor #1", "LED CONTROLLER", "device", w1.id, "inhouse", None, "LED Control Bay", "EQM-01036"),
        # Truss – Prolyte H30V
        ("E365/TRS/H30-01", "Prolyte H30V Truss Section 3m #1", "TRUSS", "accessory", w1.id, "inhouse", None, "Truss Store", "EQM-01020"),
        ("E365/TRS/H30-02", "Prolyte H30V Truss Section 3m #2", "TRUSS", "accessory", w1.id, "inhouse", None, "Truss Store", "EQM-01020"),
        ("E365/TRS/H30-03", "Prolyte H30V Truss Section 3m #3", "TRUSS", "accessory", w1.id, "inhouse", None, "Truss Store", "EQM-01020"),
        ("E365/TRS/H30-04", "Prolyte H30V Truss Section 3m #4", "TRUSS", "accessory", w2.id, "inhouse", None, "Mumbai Truss", "EQM-01020"),
        # Crank Stands
        ("E365/STD/CRN-01", "Crank Stand 1 Ton Heavy-Duty #1", "STAND", "accessory", w1.id, "inhouse", None, "Stand Bay", "EQM-01021"),
        ("E365/STD/CRN-02", "Crank Stand 1 Ton Heavy-Duty #2", "STAND", "accessory", w1.id, "inhouse", None, "Stand Bay", "EQM-01021"),
        # DMX Cables
        ("E365/CBL/DMX-01", "DMX Cable 5-Pin 15m #1", "CABLE", "accessory", w1.id, "inhouse", None, "Cable Bay", "EQM-01030"),
        ("E365/CBL/DMX-02", "DMX Cable 5-Pin 15m #2", "CABLE", "accessory", w1.id, "inhouse", None, "Cable Bay", "EQM-01030"),
        ("E365/CBL/DMX-03", "DMX Cable 5-Pin 15m #3", "CABLE", "accessory", w1.id, "inhouse", None, "Cable Bay", "EQM-01030"),
        ("E365/CBL/DMX-04", "DMX Cable 5-Pin 15m #4", "CABLE", "accessory", w2.id, "inhouse", None, "Mumbai Cables", "EQM-01030"),
        # XLR Cables
        ("E365/CBL/XLR-01", "XLR Audio Cable 15m #1", "CABLE", "accessory", w1.id, "inhouse", None, "Cable Bay", "EQM-01031"),
        ("E365/CBL/XLR-02", "XLR Audio Cable 15m #2", "CABLE", "accessory", w1.id, "inhouse", None, "Cable Bay", "EQM-01031"),
        ("E365/CBL/XLR-03", "XLR Audio Cable 15m #3", "CABLE", "accessory", w2.id, "inhouse", None, "Mumbai Cables", "EQM-01031"),
        # Power Extensions
        ("E365/PWR/EXT-01", "Power Extension Board 32A #1", "POWER", "accessory", w1.id, "inhouse", None, "Power Bay", "EQM-01035"),
        ("E365/PWR/EXT-02", "Power Extension Board 32A #2", "POWER", "accessory", w1.id, "inhouse", None, "Power Bay", "EQM-01035"),
        ("E365/PWR/EXT-03", "Power Extension Board 32A #3", "POWER", "accessory", w2.id, "inhouse", None, "Mumbai Power", "EQM-01035"),
        # Third-party equipment
        ("3P/LGT/ASTERA-01", "Astera AX1 PixelBar Tube Set (8pcs)", "LIGHTING", "third_party_equipment", w2.id, "third_party", v2.id, "Vendor Premises – Mumbai", None),
        ("3P/LGT/ROBE-01", "Robe Pointe Moving Head Package (6pcs)", "LIGHTING", "third_party_equipment", w1.id, "third_party", v2.id, "Kolkata – Vendor Store", None),
        ("3P/AUD/DB-01", "dB Technologies DVA T4 Line Array Set", "SPEAKER", "third_party_equipment", w2.id, "third_party", v2.id, "Vendor Premises – Mumbai", None),
        ("3P/AUD/SENN-01", "Sennheiser EW 500 G4 Wireless Set (4ch)", "WIRELESS AUDIO", "third_party_equipment", w1.id, "third_party", v2.id, "Kolkata – Audio Rental", None),
        ("3P/LED/ADJ-01", "ADJ Jolt Panel FX2 LED Effect Set (8pcs)", "LED PANEL", "third_party_equipment", w2.id, "third_party", v4.id, "Vendor Premises – Mumbai", None),
    ]

    for idx, (asset, name, cat, itype, wh_id, owner, vid, loc, eqm_code) in enumerate(inv_items, start=1):
        em = db.query(models.EquipmentMaster).filter(models.EquipmentMaster.equipment_code == eqm_code).first() if eqm_code else None
        status = "available"
        service_status = "ok"
        if asset == "E365/LED/PNL-03":
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
        ("EMP-00001", "Arjun Sen", "Lighting Director", "inhouse", None, "Kolkata", "9000000501", "Aadhaar", "XXXX-1001"),
        ("EMP-00002", "Ritika Bose", "Production Coordinator", "contractual", 3, "Kolkata", "9000000502", "PAN", "ABCDE1002X"),
        ("EMP-00003", "Neha Kapoor", "Sound Engineer (FOH)", "external", 3, "Kolkata", "9000000503", "Aadhaar", "XXXX-1003"),
        ("EMP-00004", "Rahul Ghosh", "Lighting Technician", "inhouse", None, "Kolkata", "9000000504", "Aadhaar", "XXXX-1004"),
        ("EMP-00005", "Sohini Dutta", "LED Video Technician", "inhouse", None, "Kolkata", "9000000505", "Voter ID", "VOT-2005"),
        ("EMP-00006", "Anirban Saha", "Audio Technician", "contractual", 6, "Kolkata", "9000000506", "Aadhaar", "XXXX-1006"),
        ("EMP-00007", "Pritha Roy", "Stage Manager", "inhouse", None, "Kolkata", "9000000507", "PAN", "FGHIJ1007K"),
        ("EMP-00008", "Ritwick De", "Rigger", "freelance", None, "Mumbai", "9000000508", "Passport", "P1234508"),
        ("EMP-00009", "Monalisa Sen", "Event Coordinator", "external", 3, "Kolkata", "9000000509", "Aadhaar", "XXXX-1009"),
        ("EMP-00010", "Vikash Kumar", "Lighting Programmer", "inhouse", None, "Kolkata", "9000000510", None, None),
        ("EMP-00011", "Debashish Mukherjee", "Production Driver", "inhouse", None, "Kolkata", "9000000511", "DL", "WB-DL-2011"),
        ("EMP-00012", "Tanmay Ghosh", "Rigger / Grip", "freelance", None, "Mumbai", "9000000512", None, None),
        ("EMP-00013", "Sangeeta Chatterjee", "Hospitality Coordinator", "external", 8, "Mumbai", "9000000513", None, None),
        ("EMP-00014", "Kamal Halder", "Power Technician", "inhouse", None, "Kolkata", "9000000514", "Aadhaar", "XXXX-1014"),
        ("EMP-00015", "Ranjit Mondal", "Audio Technician", "inhouse", None, "Kolkata", "9000000515", "Aadhaar", "XXXX-1015"),
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
        ("Filmfare Awards Night – East 2026", "Event", "CLI-00002", "Science City Auditorium, Kolkata", w1.id, datetime(2026, 4, 12, 17, 0), 2, 4, 6, 3, "planned"),
        ("ITC Bengaluru Corporate Conclave 2026", "Event", "CLI-00001", "ITC Gardenia, Bengaluru", w2.id, datetime(2026, 4, 18, 10, 0), 1, 6, 8, 2, "planned"),
        ("Doordarshan Republic Day Cultural Show", "Event", "CLI-00003", "Kartavya Path, New Delhi", w1.id, datetime(2026, 1, 26, 10, 0), 2, 12, 6, 4, "planned"),
        ("Bengal Utsav 2026 – Cultural Festival", "Event", "CLI-00004", "Salt Lake Stadium, Kolkata", w1.id, datetime(2026, 4, 25, 17, 0), 2, 2, 5, 2, "planned"),
        ("Zee Bangla Puraskar Night 2026", "TV Show", "CLI-00005", "Kolkata Convention Centre, Kolkata", w1.id, datetime(2026, 5, 5, 19, 0), 0, 1, 4, 2, "confirmed"),
        ("Colors Bangla Eid Live Special", "TV Show", "CLI-00006", "Colors Studio, EM Bypass, Kolkata", w1.id, datetime(2026, 5, 10, 20, 0), 0, 1, 3, 1, "planned"),
        ("IPL 2026 Fan Park – Eden Gardens Kolkata", "Event", "CLI-00007", "Eden Gardens Fan Zone, Kolkata", w1.id, datetime(2026, 4, 20, 16, 0), 1, 3, 5, 2, "planned"),
    ]
    projects = []
    for title, stype, cli_code, venue, wh_id, event_start, setup, travel, event_hours, ret, status in project_data:
        client = db.query(models.Client).filter(models.Client.client_code == cli_code).first()
        block_start, block_end = calc_block_window(event_start, setup, travel, event_hours, ret)
        shoot_end_dt = datetime(event_start.year, event_start.month, event_start.day, event_start.hour + event_hours, event_start.minute) if event_start else None
        setup_dt = (event_start - timedelta(days=setup)).date() if setup else None
        expected_s = (event_start - timedelta(days=setup + 1)).date()
        expected_e = (event_start + timedelta(hours=event_hours + ret)).date()
        p = models.ProjectEvent(title=title, show_type=stype, client_id=client.id if client else None, venue=venue, origin_warehouse_id=wh_id, shoot_start=event_start, shoot_end=shoot_end_dt, setup_date=setup_dt, off_days=0, expected_start_date=expected_s, expected_end_date=expected_e, setup_days=setup, block_start=block_start, block_end=block_end, status=status, notes=f"Seed project – {title}")
        db.add(p)
        projects.append(p)
    db.commit()

    # ── BOOKINGS ──
    c1 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00001").first()
    c2 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00002").first()
    c4 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00004").first()
    c5 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00005").first()
    c6 = db.query(models.CrewMember).filter(models.CrewMember.employee_code == "EMP-00006").first()

    i_mac1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/LGT/MAC-01").first()
    i_mac2 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/LGT/MAC-02").first()
    i_sub1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/AUD/SUB-01").first()
    i_sub2 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/AUD/SUB-02").first()
    i_dmx1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/CBL/DMX-01").first()
    i_trs1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/TRS/H30-01").first()
    i_spk1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/AUD/JBL-01").first()
    i_mxy1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/AUD/MXY-01").first()
    i_led1 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/LED/PNL-01").first()
    i_led2 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/LED/PNL-02").first()

    # Booking 1 – planned (Filmfare Awards: main stage lighting + audio)
    b1 = models.EventBooking(project_id=projects[0].id, booking_code="BK-00001", job_card_id=None, destination="Science City Auditorium, Kolkata", status="planned", transport_mode="company_vehicle", contact_person_name="Arjun Sen", contact_person_mobile="9000000501", remarks="Main stage lighting and audio rig for Filmfare Awards Night")
    db.add(b1)
    db.commit()
    db.add_all([
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_mac1.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_mac2.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_sub1.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_sub2.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_dmx1.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_trs1.id),
        models.BookingEquipment(booking_id=b1.id, inventory_item_id=i_spk1.id),
        models.BookingCrew(booking_id=b1.id, crew_member_id=c1.id),
        models.BookingCrew(booking_id=b1.id, crew_member_id=c4.id),
        models.BookingCrew(booking_id=b1.id, crew_member_id=c6.id),
    ])
    for item in [i_mac1, i_mac2, i_sub1, i_sub2, i_dmx1, i_trs1, i_spk1]:
        item.status = "reserved"
    for crew in [c1, c4, c6]:
        crew.status = "blocked"

    # Booking 2 – planned (Bengal Utsav: LED screen + mixer)
    b2 = models.EventBooking(project_id=projects[3].id, booking_code="BK-00002", job_card_id=None, destination="Salt Lake Stadium, Kolkata", status="planned", transport_mode="hired", contact_person_name="Ritika Bose", contact_person_mobile="9000000502", remarks="LED screen installation and Yamaha QL5 setup for Bengal Utsav festival")
    db.add(b2)
    db.commit()
    db.add_all([
        models.BookingEquipment(booking_id=b2.id, inventory_item_id=i_mxy1.id),
        models.BookingEquipment(booking_id=b2.id, inventory_item_id=i_led1.id),
        models.BookingEquipment(booking_id=b2.id, inventory_item_id=i_led2.id),
        models.BookingCrew(booking_id=b2.id, crew_member_id=c2.id),
        models.BookingCrew(booking_id=b2.id, crew_member_id=c5.id),
    ])
    i_mxy1.status = "reserved"
    i_led1.status = "reserved"
    i_led2.status = "reserved"
    c2.status = "blocked"
    c5.status = "blocked"

    # Gate passes
    db.add(models.GatePass(gate_pass_number="GATE-00001", booking_id=b1.id, pass_type="gate_out", approved_by="System Auto", status="issued", remarks="Seed gate out – Filmfare Awards Night"))
    db.add(models.GatePass(gate_pass_number="GATE-00002", booking_id=b2.id, pass_type="gate_out", approved_by="System Auto", status="issued", remarks="Seed gate out – Bengal Utsav"))

    # ── SERVICE JOBS ──
    i_led3 = db.query(models.InventoryItem).filter(models.InventoryItem.asset_code == "E365/LED/PNL-03").first()
    db.add(models.ServiceJob(job_number="SRV-00001", inventory_item_id=i_led3.id, vendor_id=vendors[0].id, vendor_name="LuminaryStagecraft", sent_date=date(2026, 4, 5), expected_return_date=date(2026, 4, 12), status="in_service", problem_reported="Pixel cluster damage – LED panel dropped during transit", remarks="Under warranty repair"))

    # ── PROCUREMENT ORDERS ──
    db.add_all([
        models.ProcurementOrder(po_number="PO-10001", procurement_code="PROC-00001", item_name="Robe Pointe Moving Head Package Rental (6pcs)", item_type="equipment", quantity=6, vendor_id=vendors[1].id, status="ordered", expected_date=date(2026, 4, 15), notes="Additional movers for Filmfare Awards – backup units"),
        models.ProcurementOrder(po_number="PO-10002", procurement_code="PROC-00002", item_name="JBL SRX815P Powered Speaker x4", item_type="equipment", quantity=4, vendor_id=vendors[1].id, status="requested", expected_date=date(2026, 5, 1), notes="Stock replenishment for Mumbai facility"),
        models.ProcurementOrder(po_number="PO-10003", procurement_code="PROC-00003", item_name="Freelance Lighting Technician for Filmfare Awards (2 days)", item_type="manpower", quantity=2, vendor_id=vendors[7].id, status="ordered", expected_date=date(2026, 4, 10), notes="2 technicians for 2-day setup and show"),
    ])

    # ── PAPERS ──
    db.add(models.OutboundPaper(paper_number="PAP-00001", paper_type="Event Dispatch", reference_name="Filmfare Awards Night – East 2026", destination="Science City Auditorium, Kolkata", issued_by="Store Admin", issue_status="ready", related_booking_id=b1.id, signature_name="S. Ghosh", remarks="Full lighting and audio rig dispatch"))
    db.add(models.OutboundPaper(paper_number="PAP-00002", paper_type="Equipment Gate Pass", reference_name="Bengal Utsav 2026 – Cultural Festival", destination="Salt Lake Stadium, Kolkata", issued_by="Operations", issue_status="draft", related_booking_id=b2.id, signature_name="Arindam Roy"))

    db.commit()
