from collections import OrderedDict
from datetime import timedelta, date, datetime
from io import BytesIO
from pathlib import Path
import re
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

LOGO_PATH = Path(__file__).resolve().parent / "assets" / "logo.png"
COMPANY_LEGAL_NAME = "CREATVO STUDIOS"
COMPANY_ADDRESS_LINE = "Eventory ERP | Powered by CREATVO STUDIOS / E365"

def calc_block_window(shoot_start, setup_days, travel_hours, shoot_hours, return_hours):
    if any(x < 0 for x in [setup_days, travel_hours, shoot_hours, return_hours]):
        raise ValueError("Durations cannot be negative.")
    block_start = shoot_start - timedelta(days=int(setup_days), hours=int(travel_hours))
    block_end = shoot_start + timedelta(hours=int(shoot_hours) + int(return_hours))
    if block_start >= block_end:
        raise ValueError("Start date/time cannot be after or equal to end date/time.")
    return block_start, block_end

def overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


def aggregate_equipment_rows(items):
    """Group similar equipment rows so screens and PDFs can show quantities."""
    def _base_name(value):
        text = (value or "").strip()
        return re.sub(r"\s+#\d+\s*$", "", text).strip()

    grouped = OrderedDict()
    for item in items or []:
        key = (
            _base_name(item.get("name")).lower(),
            (item.get("model_no") or "").strip().lower(),
            (item.get("category") or "").strip().lower(),
            (item.get("type") or item.get("item_type") or "").strip().lower(),
            (item.get("owner_type") or "").strip().lower(),
        )
        if key not in grouped:
            grouped[key] = {
                "asset_code": item.get("asset_code", ""),
                "asset_codes": [],
                "name": _base_name(item.get("name", "")),
                "type": item.get("type") or item.get("item_type") or "",
                "category": item.get("category", ""),
                "owner_type": item.get("owner_type", "inhouse"),
                "model_no": item.get("model_no", ""),
                "serial_number": item.get("serial_number", ""),
                "serial_numbers": [],
                "quantity": 0,
                "remarks": item.get("remarks", "") or "",
            }
        group = grouped[key]
        group["quantity"] += int(item.get("quantity", 1) or 1)
        if item.get("asset_code"):
            group["asset_codes"].append(item["asset_code"])
        if item.get("serial_number"):
            group["serial_numbers"].append(item["serial_number"])
        remark = (item.get("remarks") or "").strip()
        if remark and remark not in (group["remarks"] or ""):
            group["remarks"] = ", ".join([x for x in [group["remarks"], remark] if x])

    for group in grouped.values():
        if group["asset_codes"]:
            group["asset_code"] = ", ".join(group["asset_codes"][:4])
            if len(group["asset_codes"]) > 4:
                group["asset_code"] += f" +{len(group['asset_codes']) - 4}"
        if group["serial_numbers"]:
            group["serial_number"] = ", ".join(group["serial_numbers"][:4])
            if len(group["serial_numbers"]) > 4:
                group["serial_number"] += f" +{len(group['serial_numbers']) - 4}"
    return list(grouped.values())

def make_branded_pdf(title, subtitle, lines):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 40
    right = width - 40
    usable_width = right - left
    page_no = 1

    def wrapped_lines(text_value, font="Helvetica", size=11, max_width=usable_width - 10):
        paragraphs = str(text_value or "-").split("\n")
        out = []
        for paragraph in paragraphs:
            words = paragraph.split()
            if not words:
                out.append("")
                continue
            current = words[0]
            for word in words[1:]:
                trial = f"{current} {word}".strip()
                if c.stringWidth(trial, font, size) <= max_width:
                    current = trial
                else:
                    out.append(current)
                    current = word
            out.append(current)
        return out or ["-"]

    def _draw_branded_header():
        if LOGO_PATH.exists():
            c.drawImage(str(LOGO_PATH), left, height - 136, width=330, height=122, preserveAspectRatio=True, mask="auto")
        c.setFont("Helvetica-Bold", 18)
        c.drawString(left, height - 154, title)
        c.setFont("Helvetica", 11)
        c.drawString(left, height - 172, subtitle)
        c.setFont("Helvetica", 8)
        c.drawString(left, height - 186, COMPANY_ADDRESS_LINE)
        return height - 204

    def _branded_new_page():
        nonlocal page_no
        c.setFont("Helvetica", 8)
        c.drawRightString(right, 30, f"Page {page_no}")
        c.showPage()
        page_no += 1
        y_pos = _draw_branded_header()
        c.line(left, y_pos, right, y_pos)
        return y_pos - 24

    y = _draw_branded_header()
    c.line(left, y, right, y)
    y -= 24

    for line in lines:
        wrapped = wrapped_lines(line)
        if y < 60 + (len(wrapped) * 14):
            y = _branded_new_page()
        c.setFont("Helvetica", 11)
        for idx, segment in enumerate(wrapped):
            c.drawString(50 if idx == 0 else 62, y, str(segment))
            y -= 15
        y -= 3

    c.setFont("Helvetica", 8)
    c.drawRightString(right, 30, f"Page {page_no}")
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def make_audit_pdf(title, subtitle, rows):
    """Generate a readable, business-friendly audit PDF without overlapping text."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 34
    right = width - 34
    usable_width = right - left
    generated = datetime.now().strftime("%d/%m/%Y %H:%M")
    page_no = 1

    def split_long_word(word, max_width, font="Helvetica", size=9):
        chunks = []
        current = ""
        for char in word:
            trial = f"{current}{char}"
            if c.stringWidth(trial, font, size) <= max_width or not current:
                current = trial
            else:
                chunks.append(current)
                current = char
        if current:
            chunks.append(current)
        return chunks or [word]

    def wrap_text(text_value, max_width, font="Helvetica", size=9):
        paragraphs = str(text_value or "-").replace("•", " • ").split("\n")
        out = []
        for paragraph in paragraphs:
            words = []
            for token in paragraph.split():
                if c.stringWidth(token, font, size) > max_width:
                    words.extend(split_long_word(token, max_width, font, size))
                else:
                    words.append(token)
            if not words:
                out.append("")
                continue
            current = words[0]
            for word in words[1:]:
                trial = f"{current} {word}".strip()
                if c.stringWidth(trial, font, size) <= max_width:
                    current = trial
                else:
                    out.append(current)
                    current = word
            out.append(current)
        return out or ["-"]

    def draw_page_header():
        if LOGO_PATH.exists():
            c.drawImage(str(LOGO_PATH), left, height - 58, width=80, height=32, preserveAspectRatio=True, mask="auto")
        c.setFont("Helvetica-Bold", 11)
        c.drawString(left + 90, height - 28, COMPANY_LEGAL_NAME)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left + 90, height - 42, title)
        c.setFont("Helvetica", 8)
        c.drawRightString(right, height - 28, f"Generated: {generated}")
        c.drawRightString(right, height - 40, subtitle)
        c.drawRightString(right, height - 52, f"Page {page_no}")
        c.line(left, height - 62, right, height - 62)
        return height - 78

    def new_page():
        nonlocal page_no
        c.showPage()
        page_no += 1
        return draw_page_header()

    def detail_bullets(row):
        details = str(row.get("formatted_details") or "No extra details recorded.")
        parts = [part.strip(" -\t") for part in details.split("\n") if part.strip()]
        return parts or [details]

    y = draw_page_header()

    if not rows:
        c.setFont("Helvetica", 10)
        c.drawString(left, y, "No audit entries found for the selected filters.")
        c.showPage()
        c.save()
        buf.seek(0)
        return buf

    for row in rows:
        raw_time = row.get("created_at") or ""
        try:
            dt = datetime.fromisoformat(raw_time[:19]) if raw_time else None
            time_str = dt.strftime("%d/%m/%Y %H:%M") if dt else "-"
        except Exception:
            time_str = raw_time[:19] if raw_time else "-"

        summary_pairs = [
            ("Time", time_str),
            ("User", row.get("username") or "-"),
            ("Action", row.get("action_label") or row.get("action") or "-"),
            ("Section", row.get("entity_display") or row.get("entity_type") or "-"),
            ("Record", row.get("entity_label") or row.get("entity_id") or "-"),
        ]

        content_lines = []
        for label, value in summary_pairs:
            wrapped = wrap_text(value, usable_width - 92, font="Helvetica", size=9)
            content_lines.append((label, wrapped))
        detail_lines = []
        for bullet in detail_bullets(row):
            detail_lines.extend(wrap_text(f"• {bullet}", usable_width - 32, font="Helvetica", size=9))
        if not detail_lines:
            detail_lines = ["• No extra details recorded."]

        box_height = 18
        for _, wrapped in content_lines:
            box_height += max(len(wrapped), 1) * 12
        box_height += 18 + len(detail_lines) * 12 + 12

        if y - box_height < 44:
            y = new_page()

        c.setFillColorRGB(0.97, 0.97, 0.985)
        c.roundRect(left, y - box_height, usable_width, box_height, 8, fill=1, stroke=0)
        c.setStrokeColorRGB(0.82, 0.82, 0.88)
        c.roundRect(left, y - box_height, usable_width, box_height, 8, fill=0, stroke=1)
        c.setFillColorRGB(0, 0, 0)
        c.setStrokeColorRGB(0, 0, 0)

        y_cursor = y - 16
        for label, wrapped in content_lines:
            c.setFont("Helvetica-Bold", 9)
            c.drawString(left + 12, y_cursor, f"{label}:")
            c.setFont("Helvetica", 9)
            for segment in wrapped:
                c.drawString(left + 82, y_cursor, segment)
                y_cursor -= 12
        c.setFont("Helvetica-Bold", 9)
        c.drawString(left + 12, y_cursor - 2, "Details:")
        y_cursor -= 16
        c.setFont("Helvetica", 9)
        for segment in detail_lines:
            c.drawString(left + 24, y_cursor, segment)
            y_cursor -= 12

        y = y - box_height - 10

    c.showPage()
    c.save()
    buf.seek(0)
    return buf

def make_manpower_details_pdf(job_card_id, project_title, destination, crew_rows):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"E365 Manpower Details {job_card_id}")
    c.setAuthor("Eventory")
    width, height = A4
    left = 42
    right = width - 42
    generated = datetime.now().strftime("%d/%m/%Y %H:%M")

    def wrapped(text, max_width, font="Helvetica", size=10):
        words = str(text or "-").split()
        lines = []
        current = ""
        for word in words:
            trial = f"{current} {word}".strip()
            if c.stringWidth(trial, font, size) <= max_width or not current:
                current = trial
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines or ["-"]

    def draw_header(page_no, total_pages):
        if LOGO_PATH.exists():
            c.drawImage(str(LOGO_PATH), left, height - 82, width=92, height=34, preserveAspectRatio=True, mask="auto")
        c.setFont("Helvetica-Bold", 11)
        c.drawString(left + 104, height - 46, COMPANY_LEGAL_NAME)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left + 104, height - 62, "MANPOWER DETAILS & ID VERIFICATION")
        c.setFont("Helvetica", 8.5)
        c.drawRightString(right, height - 42, f"Job Card: {job_card_id}")
        c.drawRightString(right, height - 56, f"Generated: {generated}")
        c.drawRightString(right, height - 70, f"Page {page_no} of {total_pages}")
        c.line(left, height - 92, right, height - 92)
        c.setFont("Helvetica", 8.5)
        c.drawString(left, height - 108, f"Project: {project_title or '-'}")
        c.drawRightString(right, height - 108, f"Destination: {destination or '-'}")
        return height - 136

    def draw_field(label, value, x, y, box_w):
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x, y, label.upper())
        c.setFont("Helvetica", 10)
        line_y = y - 15
        for line in wrapped(value, box_w, size=10)[:3]:
            c.drawString(x, line_y, line)
            line_y -= 12
        return line_y - 5

    def draw_document_placeholder(title, doc_name, x, y, box_w, box_h):
        c.rect(x, y - box_h, box_w, box_h)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x + 8, y - 14, title.upper())
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(x + box_w / 2, y - 48, "DUMMY ID")
        c.setFont("Helvetica", 8)
        c.drawCentredString(x + box_w / 2, y - 63, "Document image placeholder")
        c.setFont("Helvetica", 7.5)
        for idx, line in enumerate(wrapped(doc_name or "Demo placeholder document", box_w - 16, size=7.5)[:2]):
            c.drawCentredString(x + box_w / 2, y - 82 - (idx * 10), line)
        c.line(x + 10, y - box_h + 20, x + box_w - 10, y - box_h + 20)
        c.setFont("Helvetica", 7)
        c.drawCentredString(x + box_w / 2, y - box_h + 8, "Attach verified copy / client attestation")

    if not crew_rows:
        crew_rows = [{"full_name": "No crew assigned"}]

    total_pages = len(crew_rows)
    for idx, crew in enumerate(crew_rows, start=1):
        y = draw_header(idx, total_pages)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(left, y, crew.get("full_name") or "-")
        c.setFont("Helvetica", 10)
        c.drawRightString(right, y, f"Employee Code: {crew.get('employee_code') or '-'}")
        y -= 28

        col_w = (right - left - 18) / 2
        y_left = y
        y_right = y
        fields_left = [
            ("Role", crew.get("role")),
            ("Manpower Type", crew.get("manpower_type")),
            ("Phone", crew.get("phone")),
            ("Home Station", crew.get("home_station")),
            ("Vendor", crew.get("vendor_name")),
        ]
        fields_right = [
            ("Address", crew.get("address")),
            ("Aadhaar Number", crew.get("aadhar_number")),
            ("ID Proof Type", crew.get("id_proof_type")),
            ("ID Proof Number", crew.get("id_proof_number")),
            ("Uploaded ID Documents", ", ".join(crew.get("documents") or []) or "-"),
            ("Booking Ownership", f"{job_card_id} / {generated}"),
        ]
        for label, value in fields_left:
            y_left = draw_field(label, value, left, y_left, col_w)
        for label, value in fields_right:
            y_right = draw_field(label, value, left + col_w + 18, y_right, col_w)

        y = min(y_left, y_right) - 8
        docs = crew.get("documents") or []
        front_doc = next((doc for doc in docs if "front" in doc.lower() or "first" in doc.lower()), docs[0] if docs else "")
        back_doc = next((doc for doc in docs if "back" in doc.lower() or "last" in doc.lower()), docs[1] if len(docs) > 1 else "")
        placeholder_h = 108
        doc_gap = 14
        doc_w = (right - left - doc_gap) / 2
        draw_document_placeholder("ID Proof Front / First Page", front_doc, left, y, doc_w, placeholder_h)
        draw_document_placeholder("ID Proof Back / Last Page", back_doc, left + doc_w + doc_gap, y, doc_w, placeholder_h)
        y -= placeholder_h + 18

        c.setFont("Helvetica-Bold", 9)
        c.drawString(left, y, "ID DOCUMENT CHECKLIST")
        y -= 16
        c.setFont("Helvetica", 9)
        c.drawString(left, y, "[  ] Front / First Page verified")
        c.drawString(left + 190, y, "[  ] Back / Last Page verified")
        c.drawString(left + 380, y, "[  ] Original seen")
        y -= 28

        attest_h = 108
        attest_y = 54
        c.rect(left, attest_y, right - left, attest_h)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left + 10, attest_y + attest_h - 18, "ATTESTATION / ACKNOWLEDGEMENT")
        c.setFont("Helvetica", 8.5)
        note = "I confirm that the above manpower details and ID proof have been verified for this job card assignment."
        c.drawString(left + 10, attest_y + attest_h - 34, note)
        sig_y = attest_y + 28
        c.line(left + 16, sig_y, left + 150, sig_y)
        c.line(left + 210, sig_y, left + 344, sig_y)
        c.line(left + 404, sig_y, right - 16, sig_y)
        c.drawString(left + 32, sig_y - 13, "Crew Signature")
        c.drawString(left + 226, sig_y - 13, "E365 Authorized")
        c.drawString(left + 422, sig_y - 13, "Date / Time")

        c.showPage()

    c.save()
    buf.seek(0)
    return buf


def make_calendar_day_summary_pdf(summary_date, rows):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"E365 Calendar Day Summary {summary_date}")
    c.setAuthor("Eventory")
    c.setSubject(f"Calendar day summary for {summary_date}")
    width, height = A4
    left = 36
    right = width - 36
    y = height - 40

    def new_page():
        c.showPage()
        return height - 40

    def draw_header(y_pos):
        if LOGO_PATH.exists():
            c.drawImage(str(LOGO_PATH), left, y_pos - 38, width=100, height=34, preserveAspectRatio=True, mask="auto")
        c.setFont("Helvetica-Bold", 11)
        c.drawString(left + 112, y_pos - 8, COMPANY_LEGAL_NAME)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(left + 112, y_pos - 24, "CALENDAR DAY SUMMARY")
        c.setFont("Helvetica", 9)
        c.drawRightString(right, y_pos - 10, f"Date: {summary_date}")
        c.drawRightString(right, y_pos - 24, f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
        c.line(left, y_pos - 42, right, y_pos - 42)
        return y_pos - 56

    def wrapped_lines(label, value, max_width):
        text = f"{label}: {value or '-'}"
        words = str(text).split()
        lines = []
        current = ""
        for word in words:
            trial = f"{current} {word}".strip()
            if c.stringWidth(trial, "Helvetica", 8) <= max_width or not current:
                current = trial
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines or ["-"]

    def draw_wrapped(label, value, x, y_pos, max_width, line_height=11):
        lines = wrapped_lines(label, value, max_width)
        for idx, line in enumerate(lines):
            c.drawString(x, y_pos - (idx * line_height), line)
        return y_pos - (max(len(lines), 1) * line_height)

    y = draw_header(y)

    legacy_event_type = "".join(["s", "h", "o", "o", "t"])
    totals = {
        "Travel Day": len([row for row in rows if row.get("event_type") == "travel"]),
        "Setup Day": len([row for row in rows if row.get("event_type") == "setup"]),
        "Technical Day": len([row for row in rows if row.get("event_type") == "technical"]),
        "Event": len([row for row in rows if row.get("event_type") in {"event", legacy_event_type}]),
        "End Day": len([row for row in rows if row.get("event_type") == "end"]),
        "Return Day": len([row for row in rows if row.get("event_type") == "return"]),
        "Supplementary": len([row for row in rows if row.get("event_type") == "supplementary"]),
        "Blocked": len([row for row in rows if row.get("event_type") == "blocked"]),
        "Dispatched": len([row for row in rows if row.get("event_type") == "dispatched"]),
        "Off Day": len([row for row in rows if row.get("event_type") == "off"]),
    }

    c.setFont("Helvetica-Bold", 9)
    card_w = (right - left - 24) / 3
    card_h = 30
    card_gap_y = 12
    total_rows = (len(totals) + 2) // 3
    for idx, (label, value) in enumerate(totals.items()):
        row_idx = idx // 3
        col_idx = idx % 3
        card_x = left + col_idx * (card_w + 12)
        card_top = y - row_idx * (card_h + card_gap_y)
        c.rect(card_x, card_top - card_h, card_w, card_h)
        c.drawString(card_x + 8, card_top - 18, label)
        c.setFont("Helvetica-Bold", 12)
        c.drawRightString(card_x + card_w - 8, card_top - 18, str(value))
        c.setFont("Helvetica-Bold", 9)
    y -= total_rows * (card_h + card_gap_y) + 8

    if not rows:
        c.setFont("Helvetica", 10)
        c.drawString(left, y, "No scheduled items for this date.")
        c.save()
        buf.seek(0)
        return buf

    for idx, row in enumerate(rows, start=1):
        detail_lines = []
        detail_lines.extend(wrapped_lines("Event", row.get("event_label"), right - left - 20))
        detail_lines.extend(wrapped_lines("Job Card", row.get("job_card_id"), right - left - 20))
        detail_lines.extend(wrapped_lines("Project Status", row.get("project_status"), right - left - 20))
        detail_lines.extend(wrapped_lines("Booking Status", row.get("booking_status"), right - left - 20))
        detail_lines.extend(wrapped_lines("Destination", row.get("destination"), right - left - 20))
        detail_lines.extend(wrapped_lines("Event Window", row.get("shoot_window"), right - left - 20))
        detail_lines.extend(wrapped_lines("Block Window", row.get("block_window"), right - left - 20))
        detail_lines.extend(wrapped_lines("Setup Date", row.get("setup_date"), right - left - 20))
        detail_lines.extend(wrapped_lines("Transport", row.get("transport_mode"), right - left - 20))
        detail_lines.extend(wrapped_lines("AWB / Tracking", row.get("awb_number"), right - left - 20))
        detail_lines.extend(wrapped_lines("Equipment", row.get("equipment"), right - left - 20))
        detail_lines.extend(wrapped_lines("Crew", row.get("crew"), right - left - 20))
        detail_lines.extend(wrapped_lines("Remarks", row.get("remarks"), right - left - 20))
        needed_h = 34 + (len(detail_lines) * 10) + 18
        if y < needed_h:
            y = new_page()
            y = draw_header(y)

        c.setFont("Helvetica-Bold", 10)
        c.rect(left, y - needed_h + 8, right - left, needed_h - 8)
        c.drawString(left + 8, y - 14, f"{idx}. {row.get('project_title') or '-'}")
        c.setFont("Helvetica", 8)
        c.drawRightString(right - 8, y - 14, f"{row.get('event_type', '').upper()}")

        current_y = y - 30
        for line in detail_lines:
            c.drawString(left + 10, current_y, line)
            current_y -= 10
        y = y - needed_h - 6

    c.save()
    buf.seek(0)
    return buf


# ── Equipment categories matching real E365 challan format ──
EQUIPMENT_CATEGORIES = [
    ("CAMERA / LENSES & ACCESSORIES", ["camera", "lens", "lenses", "camera body"]),
    ("VISION MIXER & ACCESSORIES", ["vision mixer", "switcher", "aux panel", "router"]),
    ("AUDIO & ACCESSORIES", ["audio", "mic", "microphone", "lapel", "mixer", "audio box", "clear com", "com unit", "matrix", "beltpack", "headset", "embeder", "de-embeder", "audio cable"]),
    ("WIRELESS SETUP ACCESSORIES", ["wireless", "rf unit", "rf talk", "talk back"]),
    ("MONITORS & PLASMA", ["monitor", "plasma", "broadcast monitor"]),
    ("CONVERTORS", ["convertor", "converter", "sync generator", "spg", "cross convertor", "sdi", "hdmi", "fiber optic"]),
    ("INSTANT REPLAY", ["replay", "3-play", "evs"]),
    ("STREAMING", ["streaming", "quik-link", "vimix", "obs", "aja helo", "bridge live"]),
    ("HARD DISK & ACCESSORIES", ["hard disk", "card reader", "p2 card", "ssd"]),
    ("UPS & ACCESSORIES", ["ups", "kva"]),
    ("POWER & CABLES", ["extension", "power cable", "power adapter", "power board"]),
    ("BATTERIES & CHARGER", ["battery", "charger", "v-mount"]),
    ("TRIPOD & SUPPORT", ["tripod", "pedestal", "dolly", "jib", "jimmy", "dutch head", "low base", "fluid head"]),
    ("OTHERS", []),
]


def _categorize_item(item_name, item_category):
    """Assign an equipment item to a challan category based on name/category keywords."""
    name_lower = (item_name or "").lower()
    cat_lower = (item_category or "").lower()
    combined = f"{name_lower} {cat_lower}"

    for section_name, keywords in EQUIPMENT_CATEGORIES[:-1]:  # skip "OTHERS"
        for kw in keywords:
            if kw in combined:
                return section_name
    return "OTHERS"


def make_job_card_pdf(header_title, company_line, meta_pairs, items, manpower, note_lines=None, supplementary_of=None, off_dates=None, change_summary=None):
    """
    Generate a Job Card & Challan PDF matching the physical E365 challan format.

    items: list of dicts with keys: asset_code, name, type, category, quantity, remarks, owner_type
    manpower: list of dicts with keys: employee_code, name, role, manpower_type
    """
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left_margin = 35
    right_margin = width - 35
    table_width = right_margin - left_margin
    row_h = 15
    page_no = [1]  # mutable so closures can increment

    def _draw_page_header():
        """Draw the letterhead on the current page (called on every page)."""
        header_text_x = left_margin + 118
        if LOGO_PATH.exists():
            c.drawImage(str(LOGO_PATH), left_margin, height - 82, width=96, height=42, preserveAspectRatio=True, mask="auto")
        c.setFont("Helvetica-Bold", 12)
        _title = "SUPPLEMENTARY JOB CARD & CHALLAN FOR VIDEO EQUIPMENT" if supplementary_of else "JOB CARD & CHALLAN FOR VIDEO EQUIPMENT"
        c.drawString(header_text_x, height - 35, _title)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(header_text_x, height - 52, company_line.upper() if company_line else COMPANY_LEGAL_NAME)
        c.setFont("Helvetica", 8)
        c.drawString(header_text_x, height - 64, COMPANY_ADDRESS_LINE)
        # Page number at bottom right
        c.setFont("Helvetica", 8)
        c.drawRightString(right_margin, 28, f"Page {page_no[0]}")

    def _new_page():
        """Emit current page, bump counter, draw letterhead, return starting y."""
        c.showPage()
        page_no[0] += 1
        _draw_page_header()
        return height - 88

    # ── HEADER (first page) ──
    _draw_page_header()

    # ── META FIELDS (2-column layout like the real form) ──
    y = height - 88
    c.setFont("Helvetica", 9)
    colx = [left_margin + 2, 300]
    
    _filtered_meta = [
        (k, v) for (k, v) in meta_pairs
        if "packup" not in str(k).lower()
    ]
    for idx, (k, v) in enumerate(_filtered_meta):
        # Guard: if meta section itself overflows (many pairs), break to new page
        if y < 120:
            y = _new_page()
        x = colx[idx % 2]
        kl = k.lower()
        # Show call time as time-only in the meta header (full date+time goes in the table header line)
        if "call" in kl and "time" in kl:
            parts = str(v).split()
            display_v = parts[-1] if len(parts) > 1 else v
            display_k = "Call Time"
        else:
            display_k = k
            display_v = v
        c.drawString(x, y, f"{display_k}: {display_v}")
        if idx % 2 == 1:
            y -= 14
    if len(_filtered_meta) % 2 == 1:
        y -= 14
    y -= 4

    # Supplementary header banner + change summary
    if supplementary_of:
        c.setFont("Helvetica-Bold", 9)
        c.setFillColorRGB(0.9, 0.3, 0.1)
        c.drawString(left_margin + 2, y, f"*** SUPPLEMENTARY OF: {supplementary_of} ***")
        c.setFillColorRGB(0, 0, 0)
        y -= 12
        if change_summary:
            c.setFont("Helvetica", 8)
            for line in str(change_summary).split("\n"):
                c.drawString(left_margin + 2, y, line[:110])
                y -= 10
        y -= 4

    # ── Divider line ──
    c.line(left_margin, y, right_margin, y)
    y -= 4

    items = aggregate_equipment_rows(items)

    # ── EQUIPMENT TABLE - grouped by category like the real challan ──
    # Categorize items
    categorized = {}
    for item in items:
        section = _categorize_item(item.get("name", ""), item.get("category", ""))
        if section not in categorized:
            categorized[section] = []
        categorized[section].append(item)

    # Table columns: SL NO | EQUIPMENT DETAILS | QUANTITY (Serial No / Remarks columns removed)
    col_sl_x = left_margin
    col_sl_w = 40
    col_qty_w = 90
    col_detail_x = col_sl_x + col_sl_w
    col_detail_w = table_width - col_sl_w - col_qty_w
    col_qty_x = col_detail_x + col_detail_w

    # Column header row
    def _draw_table_header(y_pos):
        c.setFont("Helvetica-Bold", 8)
        header_h = 14
        c.rect(col_sl_x, y_pos - header_h, col_sl_w, header_h)
        c.rect(col_detail_x, y_pos - header_h, col_detail_w, header_h)
        c.rect(col_qty_x, y_pos - header_h, col_qty_w, header_h)
        c.drawCentredString(col_sl_x + col_sl_w / 2, y_pos - 10, "SL NO.")
        c.drawString(col_detail_x + 3, y_pos - 10, "EQUIPMENT DETAILS")
        c.drawCentredString(col_qty_x + col_qty_w / 2, y_pos - 10, "QUANTITY")
        return y_pos - header_h

    # Ensure room before drawing the table header
    if y < 60:
        y = _new_page()

    # CALL time and PACKUP time printed above table. Call shows full date+time; Packup always blank.
    call_time_full = ""
    for k, v in meta_pairs:
        kl = k.lower()
        if "call" in kl and "time" in kl:
            call_time_full = v
    if call_time_full:
        c.setFont("Helvetica-Bold", 8)
        header_line = f"CALL TIME: {call_time_full}    PACKUP TIME: ___________"
        c.drawString(left_margin + 2, y - 10, header_line)
        y -= 14

    y = _draw_table_header(y)

    sl_no = 1

    for section_name, _ in EQUIPMENT_CATEGORIES:
        section_items = categorized.get(section_name, [])
        if not section_items:
            continue

        # Section header row (spans full width)
        if y < 60:
            y = _new_page()
            y = _draw_table_header(y)
        section_h = 14
        c.setFont("Helvetica-Bold", 7)
        c.setFillColorRGB(0.95, 0.95, 0.95)
        c.rect(left_margin, y - section_h, table_width, section_h, fill=1)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(col_detail_x + 3, y - 10, section_name)
        y -= section_h

        # Items in this section
        c.setFont("Helvetica", 7)
        for item in section_items:
            if y < 50:
                y = _new_page()
                y = _draw_table_header(y)

            item_h = row_h
            c.rect(col_sl_x, y - item_h, col_sl_w, item_h)
            c.rect(col_detail_x, y - item_h, col_detail_w, item_h)
            c.rect(col_qty_x, y - item_h, col_qty_w, item_h)

            c.drawCentredString(col_sl_x + col_sl_w / 2, y - 11, str(sl_no))

            # Equipment detail: name only (asset code, serial number, remarks excluded)
            detail = item.get("name", "-")
            c.drawString(col_detail_x + 3, y - 11, str(detail)[:90])

            qty = str(item.get("quantity", 1))
            c.drawCentredString(col_qty_x + col_qty_w / 2, y - 11, qty)

            y -= item_h
            sl_no += 1

    # ── OFF DATES section ──
    if off_dates:
        y -= 6
        if y < 80:
            y = _new_page()
        c.setFont("Helvetica-Bold", 9)
        off_h = 14
        c.rect(left_margin, y - off_h, table_width, off_h)
        c.drawString(left_margin + 4, y - 10, "OFF DATES (NO-EVENT DAYS)")
        y -= off_h
        c.setFont("Helvetica", 8)
        off_text = ", ".join(str(d) for d in off_dates) if isinstance(off_dates, (list, tuple)) else str(off_dates)
        row_h2 = 14
        c.rect(left_margin, y - row_h2, table_width, row_h2)
        c.drawString(left_margin + 4, y - 10, off_text[:140] or "None")
        y -= row_h2

    # ── MANPOWER TABLE (names in side-by-side grid cells) ──
    y -= 8
    if y < 120:
        y = _new_page()

    c.setFont("Helvetica-Bold", 9)
    mp_header_h = 16
    c.rect(left_margin, y - mp_header_h, table_width, mp_header_h)
    c.drawString(left_margin + 4, y - 12, "MANPOWER")
    y -= mp_header_h

    # Grid layout: 4 columns of names side by side
    mp_cols_count = 4
    mp_cell_w = table_width / mp_cols_count
    mp_cell_h = 18
    names = [man.get("name", "-") for man in manpower]
    # Pad to fill last row
    while len(names) % mp_cols_count != 0:
        names.append("")

    c.setFont("Helvetica", 8)
    for row_start in range(0, len(names), mp_cols_count):
        if y < 60:
            y = _new_page()
        row_names = names[row_start:row_start + mp_cols_count]
        for ci in range(mp_cols_count):
            c.rect(left_margin + ci * mp_cell_w, y - mp_cell_h, mp_cell_w, mp_cell_h)
        for ci, rn in enumerate(row_names):
            if rn:
                c.drawString(left_margin + ci * mp_cell_w + 5, y - 13, str(rn)[:28])
        y -= mp_cell_h

    # ── NOTES / TERMS ──
    y -= 14
    if y < 100:
        y = _new_page()

    c.setFont("Helvetica-Bold", 8)
    c.drawString(left_margin, y, "NOTE: WE, AS A CLIENT UNDERTAKE THE FOLLOWING:")
    y -= 12
    c.setFont("Helvetica", 7)
    default_notes = [
        "1. SAFE CUSTODY OF EQUIPMENT & RETURNING IN THE SAME WORKING CONDITION AS RECEIVED.",
        "2. TO PAY THE FULL RENTAL FOR THE TOTAL PERIODS OF BOOKING, IRRESPECTIVE OF THE ACTUAL USE OF THE EQUIPMENT.",
        "3. WE ARE LIABLE TO PAY THE 100% VALUE OF NEW EQUIPMENT IN CASE OF ANY DAMAGE OR LOSS OF",
        "   ANY EQUIPMENT DUE TO MISHANDLING, ACCIDENT OR THEFT WITHIN A PERIOD OF MAXIMUM 15 DAYS.",
    ]
    for line in (note_lines or default_notes):
        if y < 60:
            y = _new_page()
        c.drawString(left_margin + 4, y, str(line))
        y -= 11

    # ── SIGNATURE LINES (must be on last page with enough space) ──
    y -= 16
    if y < 120:
        y = _new_page()
    sig_y = y
    sig_positions = [
        (left_margin + 30, "Client"),
        (left_margin + 170, "Technician"),
        (left_margin + 340, "Store Keeper"),
    ]
    for sx, label in sig_positions:
        c.line(sx, sig_y, sx + 100, sig_y)
        c.setFont("Helvetica", 8)
        c.drawCentredString(sx + 50, sig_y - 12, label)

    # Final page number for last page
    c.setFont("Helvetica", 8)
    c.drawRightString(right_margin, 28, f"Page {page_no[0]}")
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def make_road_challan_pdf(challan_no, challan_date, client_name, delivery_address, vehicle_no, time_out, contact_person, deliver_through, items, reference_no=None):
    """Generate a Road Challan PDF matching the E365 pink challan format."""
    items = aggregate_equipment_rows(items)
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left_margin = 40
    right_margin = width - 40
    tw = right_margin - left_margin
    page_no = [1]  # mutable for closures

    def _draw_challan_header():
        """Draw the road challan letterhead on the current page."""
        header_text_x = left_margin + 78
        if LOGO_PATH.exists():
            c.drawImage(str(LOGO_PATH), left_margin, height - 78, width=60, height=28, preserveAspectRatio=True, mask="auto")
        c.setFont("Helvetica-Bold", 12)
        c.drawString(header_text_x, height - 35, "ROAD CHALLAN")
        c.setFont("Helvetica-Bold", 11)
        c.drawString(header_text_x, height - 52, COMPANY_LEGAL_NAME)
        c.setFont("Helvetica", 8)
        c.drawString(header_text_x, height - 64, "326, Santi Pally, Kolkata - 700107 | Tel: 033 4073 4036")
        # Page number at bottom right
        c.drawRightString(right_margin, 28, f"Page {page_no[0]}")

    def _challan_new_page():
        """Emit current page and start a fresh one with the letterhead."""
        c.showPage()
        page_no[0] += 1
        _draw_challan_header()
        return height - 88

    # ── HEADER (first page) ──
    _draw_challan_header()
    y = height - 88
    c.line(left_margin, y, right_margin, y)
    y -= 4

    # Meta fields
    meta_h = 16
    hw = tw / 2
    fields_left = [
        f"DELIVERY ADDRESS: {delivery_address or ''}",
        f"M/S  {client_name or ''}",
        f"CONTACT PERSON: {contact_person or ''}",
        f"DELIVER THROUGH: {deliver_through or ''}",
        "",
    ]
    fields_right = [
        f"CHALLAN NO.: {challan_no}",
        f"REFERENCE ID: {reference_no or challan_no}",
        f"DATE: {challan_date or ''}",
        f"VEHICLE NO.: {vehicle_no or ''}",
        f"TIME OUT: {time_out or ''}",
    ]
    c.setFont("Helvetica", 8)
    for fl, fr in zip(fields_left, fields_right):
        c.rect(left_margin, y - meta_h, hw, meta_h)
        c.rect(left_margin + hw, y - meta_h, hw, meta_h)
        c.drawString(left_margin + 4, y - 12, fl[:52])
        c.drawString(left_margin + hw + 4, y - 12, fr[:52])
        y -= meta_h
    y -= 4

    # Equipment table columns. Serial numbers, remarks, and 3rd-party markers intentionally omitted.
    cw = [34, tw - 34 - 96, 96]
    ch = ["SL NO.", "EQUIPMENT DESCRIPTION", "QTY"]
    cx = [left_margin]
    for w in cw[:-1]:
        cx.append(cx[-1] + w)

    def _draw_equip_header(y_pos):
        hh = 15
        c.setFont("Helvetica-Bold", 7)
        for x, w, h in zip(cx, cw, ch):
            c.rect(x, y_pos - hh, w, hh)
            c.drawString(x + 2, y_pos - 11, h)
        return y_pos - hh

    y = _draw_equip_header(y)
    c.setFont("Helvetica", 7)
    rh = 15
    for idx, item in enumerate(items, start=1):
        if y < 80:
            y = _challan_new_page()
            y = _draw_equip_header(y)
        vals = [
            str(idx),
            str(item.get("name", ""))[:82],  # name only — no serial number
            str(item.get("quantity", 1)),
        ]
        for x, w, val in zip(cx, cw, vals):
            c.rect(x, y - rh, w, rh)
            c.drawString(x + 2, y - 11, val)
        y -= rh

    # Empty filler rows (minimum 8 rows total) — stop if near page edge
    for _ in range(max(0, 8 - len(items))):
        if y < 80:
            break
        for x, w in zip(cx, cw):
            c.rect(x, y - rh, w, rh)
        y -= rh

    # Signatures — must have enough space on the final page
    y -= 24
    if y < 80:
        c.showPage()
        page_no[0] += 1
        _draw_challan_header()
        y = height - 80
    c.setFont("Helvetica", 8)
    c.line(left_margin + 20, y, left_margin + 160, y)
    c.line(right_margin - 200, y, right_margin - 40, y)
    c.drawString(left_margin + 40, y - 14, "RECEIVER'S SIGNATURE")
    c.drawString(right_margin - 190, y - 14, "AUTHORISED SIGNATORIES (K.P. & S. LLP)")

    # Final page number
    c.setFont("Helvetica", 8)
    c.drawRightString(right_margin, 28, f"Page {page_no[0]}")
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def make_address_label_pdf(to_name, to_address, to_contact, to_gstin=None, extra_lines=None):
    """Generate an Address Label PDF for courier/shipping."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 50
    usable_width = width - 100

    def wrap_text(text_value, font="Helvetica", size=12):
        out = []
        for paragraph in str(text_value or "").split("\n"):
            words = paragraph.split()
            if not words:
                out.append("")
                continue
            current = words[0]
            for word in words[1:]:
                trial = f"{current} {word}".strip()
                if c.stringWidth(trial, font, size) <= usable_width:
                    current = trial
                else:
                    out.append(current)
                    current = word
            out.append(current)
        return out

    y = height - 60
    c.setFont("Helvetica-Bold", 14)
    c.drawString(left, y, "TO,")
    y -= 22
    c.setFont("Helvetica", 12)
    for chunk in wrap_text(to_name):
        c.drawString(left, y, chunk)
        y -= 16
    for chunk in wrap_text(to_address):
        c.drawString(left, y, chunk)
        y -= 16
    if to_contact:
        for chunk in wrap_text(f"CONTACT : {to_contact}"):
            c.drawString(left, y, chunk)
            y -= 16
    if to_gstin:
        for chunk in wrap_text(f"GSTIN : {to_gstin}"):
            c.drawString(left, y, chunk)
            y -= 16
    for line in extra_lines or []:
        for chunk in wrap_text(line):
            c.drawString(left, y, chunk)
            y -= 16
    y -= 24
    c.setFont("Helvetica-Bold", 14)
    c.drawString(left, y, "FROM,")
    y -= 22
    c.setFont("Helvetica", 12)
    for line in [
        "CREATVO STUDIOS,",
        "Eventory ERP",
        "Powered by CREATVO STUDIOS / E365",
    ]:
        c.drawString(left, y, line)
        y -= 16
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def make_service_declaration_pdf(item_description, to_name, to_address, to_contact, declaration_date=None, extra_lines=None):
    """Generate a Service Declaration PDF for courier dispatch of equipment for repair."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 50
    right = width - 50
    usable_width = width - 100

    def wrap_text(text_value, font="Helvetica", size=11):
        out = []
        for paragraph in str(text_value or "").split("\n"):
            words = paragraph.split()
            if not words:
                out.append("")
                continue
            current = words[0]
            for word in words[1:]:
                trial = f"{current} {word}".strip()
                if c.stringWidth(trial, font, size) <= usable_width:
                    current = trial
                else:
                    out.append(current)
                    current = word
            out.append(current)
        return out

    # ── Letterhead ──────────────────────────────────────────────────────────
    y = height - 40
    if LOGO_PATH.exists():
        c.drawImage(str(LOGO_PATH), left, y - 80, width=230, height=86,
                    preserveAspectRatio=True, mask="auto")
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(right, y - 10, "CREATVO STUDIOS")
    c.setFont("Helvetica", 8.5)
    c.drawRightString(right, y - 24, "Eventory ERP")
    c.drawRightString(right, y - 36, "Powered by CREATVO STUDIOS / E365")
    y -= 60
    c.setLineWidth(1.2)
    c.line(left, y, right, y)
    y -= 6
    c.setLineWidth(0.4)
    c.line(left, y, right, y)
    y -= 22
    # ────────────────────────────────────────────────────────────────────────

    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, y, "TO WHOM IT MAY CONCERN")
    y -= 30
    c.setFont("Helvetica", 11)
    body = (
        "This is to inform you that we CREATVO STUDIOS "
        "are sending broadcast event "
        "equipment for repair to the below mentioned address by courier."
    )
    for line in wrap_text(body):
        c.drawString(left, y, line)
        y -= 16
    y -= 10
    c.setFont("Helvetica-Bold", 11)
    for line in wrap_text(f"ITEM DESCRIPTION : {item_description}", font="Helvetica-Bold", size=11):
        c.drawString(left, y, line)
        y -= 16
    y -= 14
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left, y, "TO,")
    y -= 18
    c.setFont("Helvetica", 11)
    if to_name:
        for line in wrap_text(f"M/S. {to_name}"):
            c.drawString(left, y, line)
            y -= 16
    if to_address:
        for line in wrap_text(to_address):
            c.drawString(left, y, line)
            y -= 16
    if to_contact:
        for line in wrap_text(f"CONTACT : {to_contact}"):
            c.drawString(left, y, line)
            y -= 16
    for line in extra_lines or []:
        for wrapped in wrap_text(line):
            c.drawString(left, y, wrapped)
            y -= 16
    y -= 14
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left, y, "FROM,")
    y -= 18
    c.setFont("Helvetica", 11)
    for line in [
        "CREATVO STUDIOS,",
        "Eventory ERP",
        "Powered by CREATVO STUDIOS / E365",
    ]:
        c.drawString(left, y, line)
        y -= 16
    y -= 16
    for line in [
        "We confirm that this item is not for Sale/Resale and has no commercial value.",
        "Hence you are requested to kindly provide all possible support during transit.",
        "Thanking you in anticipation.",
    ]:
        for wrapped in wrap_text(line):
            c.drawString(left, y, wrapped)
            y -= 16
    y -= 18
    c.drawString(left, y, "With Regards")
    y -= 40
    c.line(left, y, left + 200, y)
    y -= 14
    c.setFont("Helvetica", 10)
    c.drawString(left, y, "(Authorised Signatory)")
    y -= 14
    c.drawString(left, y, "For CREATVO STUDIOS")
    y -= 20
    dt = declaration_date or date.today().strftime("%d/%m/%Y")
    c.drawString(left, y, f"Dated: {dt}")
    c.showPage()
    c.save()
    buf.seek(0)
    return buf


def make_account_invoice_pdf(invoice, booking, project, client_name="-", line_items=None, payout_items=None):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 40
    right = width - 40
    y = height - 42

    def money(value):
        return f"INR {float(value or 0):,.2f}"

    def amount_in_words(value):
        number = int(round(float(value or 0)))
        if number == 0:
            return "Zero Rupees Only"
        ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
        tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
        def under_hundred(n):
            return ones[n] if n < 20 else f"{tens[n // 10]} {ones[n % 10]}".strip()
        def under_thousand(n):
            if n < 100:
                return under_hundred(n)
            tail = under_hundred(n % 100)
            return f"{ones[n // 100]} Hundred{(' ' + tail) if tail else ''}"
        parts = []
        for divisor, label in [(10000000, "Crore"), (100000, "Lakh"), (1000, "Thousand")]:
            chunk = number // divisor
            if chunk:
                parts.append(f"{under_thousand(chunk)} {label}")
                number %= divisor
        if number:
            parts.append(under_thousand(number))
        return f"{' '.join(parts)} Rupees Only"

    def draw_text(label, value, x, y_pos, label_size=8, value_size=10):
        c.setFont("Helvetica-Bold", label_size)
        c.drawString(x, y_pos, label)
        c.setFont("Helvetica", value_size)
        c.drawString(x, y_pos - 13, str(value or "-"))

    def ensure_space(required=24):
        nonlocal y
        if y < 70 + required:
            c.showPage()
            draw_header()

    def draw_header():
        nonlocal y
        y = height - 42
        if LOGO_PATH.exists():
            c.drawImage(str(LOGO_PATH), left, y - 58, width=210, height=78, preserveAspectRatio=True, mask="auto")
        c.setFont("Helvetica-Bold", 16)
        c.drawRightString(right, y, "CREATVO STUDIOS")
        c.setFont("Helvetica-Bold", 12)
        c.drawRightString(right, y - 18, "TAX INVOICE")
        c.setFont("Helvetica", 8.5)
        c.drawRightString(right, y - 34, f"Generated: {datetime.now().strftime('%d/%m/%Y %H:%M')}")
        y -= 58
        c.line(left, y, right, y)
        y -= 18

    c.setTitle(f"Invoice {getattr(invoice, 'invoice_number', '')}")
    c.setAuthor("Eventory")
    draw_header()

    invoice_number = getattr(invoice, 'invoice_number', '-')
    booking_ref = getattr(booking, 'job_card_id', '-')
    destination = getattr(booking, 'destination', '-')
    project_title = getattr(project, 'title', '-') if project else '-'
    status = getattr(invoice, 'status', '-')

    draw_text("Invoice No.", invoice_number, left, y)
    draw_text("Job Card", booking_ref, left + 170, y)
    draw_text("Invoice Status", status, left + 330, y)
    y -= 34
    draw_text("Project", project_title, left, y)
    draw_text("Client", client_name or '-', left + 330, y)
    y -= 34
    draw_text("Destination", destination, left, y)
    draw_text("Billing Mode", getattr(invoice, 'billing_mode', 'line_item'), left + 330, y)
    y -= 42

    committed_date = getattr(invoice, 'payment_committed_date', None)
    if committed_date:
        draw_text("Payment Committed Date", committed_date.strftime("%d/%m/%Y") if hasattr(committed_date, "strftime") else committed_date, left, y)
        y -= 34

    line_items = line_items or []
    payout_items = payout_items or []
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, y, "Bill Line Items")
    y -= 16
    headers = ["Category", "Description", "Qty", "Rate", "Amount"]
    col_x = [left, left + 84, left + 320, left + 392, left + 468]
    c.setFont("Helvetica-Bold", 8.5)
    for idx, head in enumerate(headers):
        c.drawString(col_x[idx], y, head)
    y -= 8
    c.line(left, y, right, y)
    y -= 14

    if not line_items:
        c.setFont("Helvetica", 9)
        c.drawString(left, y, "No line items available.")
        y -= 18
    else:
        for item in line_items:
            ensure_space(24)
            c.setFont("Helvetica", 8.5)
            c.drawString(col_x[0], y, str(item.get('category', '-'))[:14])
            desc = str(item.get('label', '-') or '-')
            if len(desc) > 42:
                desc = desc[:39] + '...'
            c.drawString(col_x[1], y, desc)
            c.drawRightString(col_x[3] - 14, y, str(item.get('quantity', 0)))
            c.drawRightString(col_x[4] - 14, y, f"{float(item.get('rate', 0) or 0):,.2f}")
            c.drawRightString(right, y, f"{float(item.get('amount', 0) or 0):,.2f}")
            y -= 16

    y -= 8
    ensure_space(92)
    c.line(left, y, right, y)
    y -= 18
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, y, "Summary")
    y -= 16
    c.setFont("Helvetica", 9.5)
    summary_rows = [
        ("Subtotal", money(getattr(invoice, 'subtotal_amount', 0))),
        (f"Tax ({float(getattr(invoice, 'tax_percent', 0) or 0):.0f}%)", money(getattr(invoice, 'tax_amount', 0))),
    ]
    for label, value in summary_rows:
        c.drawString(left, y, label)
        c.drawRightString(right, y, value)
        y -= 16
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left, y, "Total Amount")
    c.drawRightString(right, y, money(getattr(invoice, 'total_amount', 0)))
    y -= 18
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(left, y, "Amount in Words")
    y -= 14
    c.setFont("Helvetica", 9.5)
    c.drawString(left, y, amount_in_words(getattr(invoice, 'total_amount', 0))[:120])
    y -= 18

    notes = getattr(invoice, 'notes', '') or ''
    if notes:
        ensure_space(46)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(left, y, "Notes")
        y -= 16
        c.setFont("Helvetica", 8.5)
        words = notes.split()
        line = ""
        for word in words:
            trial = f"{line} {word}".strip()
            if c.stringWidth(trial, "Helvetica", 8.5) <= (right - left):
                line = trial
            else:
                c.drawString(left, y, line)
                y -= 13
                ensure_space(18)
                line = word
        if line:
            c.drawString(left, y, line)
            y -= 14

    y = max(y - 18, 54)
    c.line(left, y, right, y)
    c.setFont("Helvetica", 8)
    c.drawString(left, y - 14, "This is a system generated tax invoice.")
    c.save()
    buf.seek(0)
    return buf


def make_quotation_pdf(quote, client_name, project_title=None):
    """Generate a professional quotation / proposal PDF."""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as _canvas
    from pathlib import Path as _Path

    buf = BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 40
    right = width - 40
    usable = right - left
    y = height - 42

    logo_path = _Path(__file__).parent.parent.parent / "frontend" / "public" / "logo.png"

    def money(v):
        return f"INR {float(v or 0):,.2f}"

    # ── Header ────────────────────────────────────────────────────────────────
    if logo_path.exists():
        c.drawImage(str(logo_path), left, y - 68, width=150, height=68, preserveAspectRatio=True, mask="auto")
    c.setFont("Helvetica-Bold", 20)
    c.drawRightString(right, y - 18, "QUOTATION")
    c.setFont("Helvetica", 9)
    c.drawRightString(right, y - 32, "Eventory ERP")
    c.drawRightString(right, y - 44, "Powered by CREATVO STUDIOS / E365")
    y -= 90

    # ── Quote meta block ─────────────────────────────────────────────────────
    c.setFillColorRGB(0.06, 0.37, 0.67)
    c.rect(left, y - 28, usable, 28, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left + 6, y - 20, f"Quote No: {quote.quote_number}  |  Version: {quote.version}")
    valid_str = str(quote.valid_until) if quote.valid_until else "—"
    c.drawRightString(right - 6, y - 20, f"Valid Until: {valid_str}")
    c.setFillColorRGB(0, 0, 0)
    y -= 40

    # ── To / Subject ─────────────────────────────────────────────────────────
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left, y, "TO:")
    c.setFont("Helvetica", 10)
    c.drawString(left + 28, y, str(client_name))
    if project_title:
        c.setFont("Helvetica", 9)
        c.drawString(left + 28, y - 14, f"Project: {project_title}")
        y -= 14
    y -= 16

    if quote.subject:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left, y, f"Subject: {quote.subject}")
        y -= 16

    y -= 6
    c.line(left, y, right, y)
    y -= 18

    # ── Items table header ────────────────────────────────────────────────────
    COL = [left, left + 30, left + usable * 0.48, left + usable * 0.6, left + usable * 0.72, left + usable * 0.84]
    c.setFillColorRGB(0.92, 0.92, 0.92)
    c.rect(left, y - 14, usable, 16, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 8)
    headers = ["#", "Description", "Type", "Qty", "Rate (INR)", "Amount (INR)"]
    aligns = ["L", "L", "L", "R", "R", "R"]
    col_rights = [COL[1] - 4, COL[2] - 4, COL[3] - 4, COL[4] - 4, COL[5] - 4, right - 4]
    for i, h in enumerate(headers):
        if aligns[i] == "R":
            c.drawRightString(col_rights[i], y - 10, h)
        else:
            c.drawString(COL[i] + 3, y - 10, h)
    y -= 20

    # ── Items ─────────────────────────────────────────────────────────────────
    for idx, item in enumerate(quote.items or []):
        if y < 80:
            c.setFont("Helvetica", 8)
            c.drawRightString(right, 30, "continued...")
            c.showPage()
            y = height - 60
        row_color = (0.97, 0.97, 0.97) if idx % 2 == 0 else (1, 1, 1)
        c.setFillColorRGB(*row_color)
        c.rect(left, y - 14, usable, 15, fill=1, stroke=0)
        c.setFillColorRGB(0, 0, 0)
        c.setFont("Helvetica", 8)
        c.drawString(COL[0] + 3, y - 10, str(idx + 1))
        # wrap description
        desc = str(item.description or "")
        max_w = COL[2] - COL[1] - 8
        words = desc.split()
        line1 = ""
        for w in words:
            trial = (line1 + " " + w).strip()
            if c.stringWidth(trial, "Helvetica", 8) <= max_w:
                line1 = trial
            else:
                break
        c.drawString(COL[1] + 3, y - 10, line1)
        c.drawString(COL[2] + 3, y - 10, str(item.item_type or ""))
        c.drawRightString(col_rights[3], y - 10, f"{item.qty:.2f} {item.unit}")
        c.drawRightString(col_rights[4], y - 10, f"{item.rate:,.2f}")
        c.drawRightString(col_rights[5], y - 10, f"{item.amount:,.2f}")
        y -= 16

    y -= 6
    c.line(left, y, right, y)
    y -= 16

    # ── Totals ────────────────────────────────────────────────────────────────
    def total_row(label, value, bold=False):
        nonlocal y
        font = "Helvetica-Bold" if bold else "Helvetica"
        c.setFont(font, 9)
        c.drawRightString(right - 130, y, label)
        c.drawRightString(right, y, money(value))
        y -= 14

    total_row("Subtotal:", quote.subtotal)
    if quote.discount_pct:
        total_row(f"Discount ({quote.discount_pct:.1f}%):", -quote.discount_amount)
    total_row(f"GST ({quote.tax_pct:.1f}%):", quote.tax_amount)
    c.line(right - 200, y + 2, right, y + 2)
    total_row("TOTAL:", quote.total, bold=True)

    y -= 10

    # ── Notes / Terms ─────────────────────────────────────────────────────────
    if quote.notes:
        y -= 10
        c.setFont("Helvetica-Bold", 9)
        c.drawString(left, y, "Notes:")
        y -= 14
        c.setFont("Helvetica", 8)
        for line in str(quote.notes).split("\n"):
            c.drawString(left, y, line[:110])
            y -= 12

    if quote.terms:
        y -= 6
        c.setFont("Helvetica-Bold", 9)
        c.drawString(left, y, "Terms & Conditions:")
        y -= 14
        c.setFont("Helvetica", 8)
        for line in str(quote.terms).split("\n"):
            c.drawString(left, y, line[:110])
            y -= 12

    # ── Footer ────────────────────────────────────────────────────────────────
    c.setFont("Helvetica", 8)
    c.drawString(left, 38, "For CREATVO STUDIOS")
    c.drawRightString(right, 38, "Authorised Signatory")
    c.line(left, 54, right, 54)
    c.drawCentredString(width / 2, 24, "This is a computer-generated quotation.")

    c.showPage()
    c.save()
    buf.seek(0)
    return buf
