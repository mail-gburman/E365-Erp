import React, { useEffect, useState, useMemo } from "react";
import Card from "../components/Card";
import { api, downloadAuthorized } from "../api";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const COLOR_MAP = {
  travel:    { bg: "rgba(251,113,133,.22)", border: "#fb7185", label: "Travel Day" },
  setup:     { bg: "rgba(251,191,36,.25)", border: "#fbbf24", label: "Setup Day" },
  technical: { bg: "rgba(56,189,248,.25)", border: "#38bdf8", label: "Technical Day" },
  shoot:     { bg: "rgba(34,197,94,.25)",  border: "#4ade80", label: "Shoot Day" },
  off:       { bg: "rgba(156,163,175,.2)", border: "#9ca3af", label: "Off Day" },
  end:       { bg: "rgba(248,113,113,.22)", border: "#f87171", label: "End Day" },
  return:    { bg: "rgba(168,85,247,.25)", border: "#c084fc", label: "Return Day" },
  supplementary:{ bg: "rgba(244,114,182,.22)", border: "#f472b6", label: "Supplementary" },
  planned:   { bg: "rgba(148,163,184,.18)", border: "#94a3b8", label: "Planned" },
  confirmed: { bg: "rgba(34,197,94,.16)", border: "#22c55e", label: "Confirmed" },
  blocked:   { bg: "rgba(229,9,47,.15)",   border: "#e5092f", label: "Blocked" },
  dispatched:{ bg: "rgba(59,130,246,.25)", border: "#60a5fa", label: "Dispatched" },
};

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function startDay(y, m) { return new Date(y, m, 1).getDay(); }
function fmt(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function parseDate(s) { if (!s) return null; const p = s.split(/[-T ]/); return new Date(Number(p[0]), Number(p[1])-1, Number(p[2])); }
function prettyDate(s) {
  if (!s) return "—";
  const d = parseDate(s);
  return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : s;
}
function prettyDateTime(s) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function toInputDate(value) {
  return value ? fmt(value) : "";
}
function inDateRange(dateStr, startStr, endStr) {
  if (!startStr && !endStr) return true;
  if (startStr && dateStr < startStr) return false;
  if (endStr && dateStr > endStr) return false;
  return true;
}
function summarizeEquipment(items = []) {
  const baseName = (value = "") => value.replace(/\s+#\d+\s*$/, "").trim();
  const grouped = items.reduce((acc, item) => {
    const key = baseName(item.name || item.asset_code || "Equipment");
    if (!acc[key]) acc[key] = { count: 0, serials: [] };
    acc[key].count += item.quantity || 1;
    if (item.serial_number) acc[key].serials.push(item.serial_number);
    return acc;
  }, {});
  return Object.entries(grouped).map(([name, meta]) => `${name} x${meta.count}${meta.serials.length ? ` (${meta.serials.join(", ")})` : ""}`).join(", ");
}
function summarizeCrew(crew = []) {
  return (crew || []).map((member) => member.name || member.full_name || member.employee_code).filter(Boolean).join(", ");
}
function buildDaySummaryRows(events = []) {
  const grouped = new Map();
  events.forEach((ev, index) => {
    const { booking = {}, project = {} } = ev.detail || {};
    const key = `${ev.date}-${booking.id || project.id || index}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        types: [],
        labels: [],
        booking,
        project,
        jobCard: booking.job_card_id || "—",
        projectTitle: project.title || "—",
        projectStatus: project.status || booking.status || "—",
        bookingStatus: booking.status || "—",
        destination: booking.destination || project.venue || "—",
        transport: booking.transport_mode || "—",
        awb: booking.awb_number || "—",
        shootWindow: [prettyDateTime(project.shoot_start), prettyDateTime(project.shoot_end)].join(" to "),
        blockWindow: [prettyDateTime(project.block_start), prettyDateTime(project.block_end)].join(" to "),
        setupDate: prettyDate(project.setup_date),
        equipment: summarizeEquipment(booking.equipment_summary || booking.equipment || []),
        crew: summarizeCrew(booking.crew || []),
        remarks: booking.remarks || project.notes || "—",
      });
    }
    const row = grouped.get(key);
    if (!row.types.includes(ev.type)) row.types.push(ev.type);
    if (!row.labels.includes(ev.label)) row.labels.push(ev.label);
  });
  return Array.from(grouped.values()).map((row) => ({
    ...row,
    type: row.types[0] || "shoot",
    typeLabel: row.types.map((type) => COLOR_MAP[type]?.label || type).join(", "),
    label: row.labels.join(" | "),
  }));
}
async function downloadDaySummaryPdf(dateStr) {
  await downloadAuthorized(api.calendarDaySummaryPdfUrl(dateStr), `KPS_calendar_day_summary_${dateStr}.pdf`);
}

function buildCalendarEvents(bookings, projects) {
  const eventMap = new Map();
  function pushEvent(event) {
    const eventKey = [
      event.date,
      event.detail?.project?.id || "project",
      event.detail?.booking?.id || "booking",
    ].join("|");
    if (!eventMap.has(eventKey)) {
      eventMap.set(eventKey, { ...event, types: [] });
    }
    const existing = eventMap.get(eventKey);
    if (!existing.types.includes(event.type)) existing.types.push(event.type);
    existing.type = existing.types[0];
    existing.label = `${event.detail?.booking?.job_card_id || event.detail?.project?.title || "PROJECT"} — ${existing.types.map((type) => COLOR_MAP[type]?.label || type).join(", ")}`;
  }
  const bookingsByProject = (bookings || []).reduce((acc, booking) => {
    if (!acc[booking.project_id]) acc[booking.project_id] = [];
    acc[booking.project_id].push(booking);
    return acc;
  }, {});

  for (const proj of (projects || [])) {
    const dateTags = (proj.dates || []).reduce((acc, row) => {
      const type = ({ start_date: "shoot_date", end_date: "end_day" }[row.date_type] || row.date_type);
      if (!acc[type]) acc[type] = [];
      acc[type].push(row.date_value);
      return acc;
    }, {});
    const blockStart = parseDate(proj.block_start);
    const blockEnd = parseDate(proj.block_end);
    const expectedStart = parseDate(dateTags.shoot_date?.[0] || proj.expected_start_date);
    const expectedEnd = parseDate((dateTags.end_day || []).slice(-1)[0] || proj.expected_end_date);
    const travelDates = (dateTags.travel_day || []).map(parseDate).filter(Boolean);
    const setupDates = (dateTags.setup_date || []).map(parseDate).filter(Boolean);
    const technicalDates = (dateTags.technical_date || []).map(parseDate).filter(Boolean);
    const shootDates = (dateTags.shoot_date || []).map(parseDate).filter(Boolean);
    const endDates = (dateTags.end_day || []).map(parseDate).filter(Boolean);
    const offDates = (dateTags.off_day || []).map(parseDate).filter(Boolean);
    const returnDates = (dateTags.return_day || []).map(parseDate).filter(Boolean);
    const setupDate = setupDates[0] || technicalDates[0] || parseDate(proj.setup_date);
    const returnDay = parseDate((dateTags.return_day || []).slice(-1)[0]) || blockEnd;
    const shootStart = parseDate(proj.shoot_start) || expectedStart || blockStart || setupDate;
    const shootEnd = parseDate(proj.shoot_end) || expectedEnd || shootStart || returnDay || blockEnd;
    if (!shootStart && !blockStart && !blockEnd) continue;

    const projectBookings = bookingsByProject[proj.id] || [];
    const primaryBooking = projectBookings.find((booking) => !booking.parent_booking_id) || projectBookings[0] || {
      id: `project-${proj.id}`,
      job_card_id: null,
      project_id: proj.id,
      destination: proj.venue,
      status: proj.status,
      equipment: [],
      equipment_summary: [],
      crew: [],
      remarks: proj.notes,
      transport_mode: null,
      awb_number: null,
    };
    const label = `${primaryBooking.job_card_id || proj.status?.toUpperCase() || "PROJECT"} — ${proj.title}`;
    const detail = { booking: primaryBooking, project: proj };
    const explicitDates = new Set();

    const pushExplicit = (dateObj, type) => {
      const dateStr = fmt(dateObj);
      explicitDates.add(dateStr);
      pushEvent({ date: dateStr, type, label, detail });
    };

    travelDates.forEach((d) => pushExplicit(d, "travel"));
    setupDates.forEach((d) => pushExplicit(d, "setup"));
    technicalDates.forEach((d) => pushExplicit(d, "technical"));
    shootDates.forEach((d) => pushExplicit(d, "shoot"));
    endDates.forEach((d) => pushExplicit(d, "end"));
    returnDates.forEach((d) => pushExplicit(d, "return"));
    offDates.forEach((d) => pushExplicit(d, "off"));

    if (!setupDates.length && setupDate) {
      pushExplicit(setupDate, "setup");
    }
    if (!shootDates.length && shootStart) {
      pushExplicit(shootStart, "shoot");
    }
    if (!endDates.length && expectedEnd) {
      pushExplicit(expectedEnd, "end");
    }
    if (!returnDates.length && returnDay) {
      pushExplicit(returnDay, "return");
    }
    // Status overlay
    const overlayStart = new Date(blockStart || shootStart);
    const overlayEnd = new Date(returnDay || blockEnd || shootEnd || shootStart);
    for (const booking of projectBookings) {
      const bookingDetail = { booking, project: proj };
      if (booking.parent_booking_id) {
        const parentRef = booking.reference_job_card_id || booking.job_card_id?.replace(/-S\d+$/, "") || "parent";
        for (const dateStr of explicitDates) {
          pushEvent({ date: dateStr, type: "supplementary", label: `${booking.job_card_id} — Supplementary to ${parentRef}`, detail: bookingDetail });
        }
        continue;
      }
      if (booking.status === "dispatched" || booking.status === "blocked" || booking.status === "confirmed" || booking.status === "planned") {
        const overlayType = ["planned", "confirmed", "blocked", "dispatched"].includes(booking.status) ? booking.status : "blocked";
        let d = new Date(overlayStart);
        while (d <= overlayEnd) {
          const dateStr = fmt(d);
          if (!explicitDates.has(dateStr)) {
            pushEvent({ date: dateStr, type: overlayType, label: `${overlayType.toUpperCase()}: ${booking.job_card_id || proj.title}`, detail: bookingDetail });
          }
          d.setDate(d.getDate() + 1);
        }
      }
    }
  }
  return Array.from(eventMap.values()).sort((a, b) => a.date.localeCompare(b.date) || String(a.label).localeCompare(String(b.label)));
}

function EventChip({ ev, onClick }) {
  const c = COLOR_MAP[ev.type] || COLOR_MAP.shoot;
  return (
    <div
      className="calChip"
      style={{ background: c.bg, borderLeft: `3px solid ${c.border}`, cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(ev);
      }}
      title={ev.label}
    >
      <span className="calChipText">{ev.label}</span>
    </div>
  );
}

function DetailModal({ ev, onClose }) {
  if (!ev) return null;
  const { booking: b, project: p } = ev.detail;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>{b.job_card_id || `Booking #${b.id}`}</h2>
          <button className="ghostBtn modalCloseBtn" onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="detailCard"><div className="detailKey">Project</div><div className="detailVal">{p.title}</div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="detailCard"><div className="detailKey">Status</div><div className="detailVal"><span className={`statusBadge status-${b.status}`}>{b.status}</span></div></div>
            <div className="detailCard"><div className="detailKey">Destination</div><div className="detailVal">{b.destination}</div></div>
            <div className="detailCard"><div className="detailKey">Shoot Start</div><div className="detailVal">{p.shoot_start}</div></div>
            <div className="detailCard"><div className="detailKey">Shoot End</div><div className="detailVal">{p.shoot_end || "—"}</div></div>
            <div className="detailCard"><div className="detailKey">Setup Date</div><div className="detailVal">{p.setup_date || "—"}</div></div>
            <div className="detailCard"><div className="detailKey">Off Days</div><div className="detailVal">{p.off_days ?? 0}</div></div>
            <div className="detailCard"><div className="detailKey">Transport</div><div className="detailVal">{b.transport_mode || "—"}</div></div>
            <div className="detailCard"><div className="detailKey">AWB</div><div className="detailVal">{b.awb_number || "—"}</div></div>
          </div>
          {b.equipment && b.equipment.length > 0 && (
            <div className="detailCard">
              <div className="detailKey">Equipment ({b.equipment.length})</div>
              <div className="detailVal">{summarizeEquipment(b.equipment_summary || b.equipment)}</div>
            </div>
          )}
          {b.crew && b.crew.length > 0 && (
            <div className="detailCard">
              <div className="detailKey">Crew ({b.crew.length})</div>
              <div className="detailVal">{b.crew.map(c => c.name).join(", ")}</div>
            </div>
          )}
          {b.remarks && (
            <div className="detailCard"><div className="detailKey">Remarks</div><div className="detailVal">{b.remarks}</div></div>
          )}
        </div>
      </div>
    </div>
  );
}

function DaySummaryModal({ dateStr, events, onClose }) {
  if (!dateStr) return null;
  const rows = buildDaySummaryRows(events);
  const totals = {
    travel: rows.filter((row) => row.type === "travel").length,
    setup: rows.filter((row) => row.type === "setup").length,
    technical: rows.filter((row) => row.type === "technical").length,
    shoot: rows.filter((row) => row.type === "shoot").length,
    end: rows.filter((row) => row.type === "end").length,
    return: rows.filter((row) => row.type === "return").length,
    supplementary: rows.filter((row) => row.type === "supplementary").length,
    planned: rows.filter((row) => row.type === "planned").length,
    confirmed: rows.filter((row) => row.type === "confirmed").length,
    blocked: rows.filter((row) => row.type === "blocked").length,
    dispatched: rows.filter((row) => row.type === "dispatched").length,
    off: rows.filter((row) => row.type === "off").length,
  };
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>{prettyDate(dateStr)} Summary</h2>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="primaryBtn modalCloseBtn" onClick={() => downloadDaySummaryPdf(dateStr)}>Download PDF</button>
            <button className="primaryBtn modalCloseBtn" onClick={onClose}>Close</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(9, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
          <div className="detailCard"><div className="detailKey">Total Items</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{rows.length}</div></div>
          <div className="detailCard"><div className="detailKey">Travel Day</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.travel}</div></div>
          <div className="detailCard"><div className="detailKey">Setup Day</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.setup}</div></div>
          <div className="detailCard"><div className="detailKey">Technical Day</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.technical}</div></div>
          <div className="detailCard"><div className="detailKey">Shoot</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.shoot}</div></div>
          <div className="detailCard"><div className="detailKey">End Day</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.end}</div></div>
          <div className="detailCard"><div className="detailKey">Return Day</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.return}</div></div>
          <div className="detailCard"><div className="detailKey">Supplementary</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.supplementary}</div></div>
          <div className="detailCard"><div className="detailKey">Off Day</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.off}</div></div>
          <div className="detailCard"><div className="detailKey">Planned</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.planned}</div></div>
          <div className="detailCard"><div className="detailKey">Confirmed</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.confirmed}</div></div>
          <div className="detailCard"><div className="detailKey">Blocked</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.blocked}</div></div>
          <div className="detailCard"><div className="detailKey">Dispatched</div><div className="detailVal" style={{ fontSize: 22, fontWeight: 800 }}>{totals.dispatched}</div></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {rows.length === 0 ? (
            <div className="detailCard"><div className="detailVal">No visible calendar entries for this date.</div></div>
          ) : rows.map((row) => (
            <div key={row.id} className="detailCard">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{row.projectTitle}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className={`statusBadge status-${row.bookingStatus}`}>{row.bookingStatus}</span>
                  <span className={`statusBadge status-${row.projectStatus}`}>{row.projectStatus}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                <div className="detailCard"><div className="detailKey">Event Type</div><div className="detailVal">{row.typeLabel}</div></div>
                <div className="detailCard"><div className="detailKey">Job Card</div><div className="detailVal">{row.jobCard}</div></div>
                <div className="detailCard"><div className="detailKey">Destination</div><div className="detailVal">{row.destination}</div></div>
                <div className="detailCard"><div className="detailKey">Shoot Window</div><div className="detailVal">{row.shootWindow}</div></div>
                <div className="detailCard"><div className="detailKey">Block Window</div><div className="detailVal">{row.blockWindow}</div></div>
                <div className="detailCard"><div className="detailKey">Setup Date</div><div className="detailVal">{row.setupDate}</div></div>
                <div className="detailCard"><div className="detailKey">Transport</div><div className="detailVal">{row.transport}</div></div>
                <div className="detailCard"><div className="detailKey">AWB / Tracking</div><div className="detailVal">{row.awb}</div></div>
                <div className="detailCard"><div className="detailKey">Calendar Label</div><div className="detailVal">{row.label}</div></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div className="detailCard"><div className="detailKey">Equipment</div><div className="detailVal">{row.equipment || "—"}</div></div>
                <div className="detailCard"><div className="detailKey">Crew</div><div className="detailVal">{row.crew || "—"}</div></div>
              </div>
              <div className="detailCard" style={{ marginTop: 10 }}>
                <div className="detailKey">Remarks / Notes</div>
                <div className="detailVal">{row.remarks}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [bookings, setBookings] = useState([]);
  const [projects, setProjects] = useState([]);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedEv, setSelectedEv] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [visibleTypes, setVisibleTypes] = useState(() => Object.keys(COLOR_MAP));
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [calSearch, setCalSearch] = useState("");

  useEffect(() => {
    api.bookingDetails().then(setBookings).catch(console.error);
    api.projects().then(setProjects).catch(console.error);
  }, []);

  const events = useMemo(() => buildCalendarEvents(bookings, projects), [bookings, projects]);

  const days = daysInMonth(year, month);
  const start = startDay(year, month);
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  const evByDate = useMemo(() => {
    const q = calSearch.trim().toLowerCase();
    const map = {};
    for (const ev of events) {
      if (!visibleTypes.includes(ev.type)) continue;
      if (!inDateRange(ev.date, rangeStart, rangeEnd)) continue;
      if (q) {
        const { booking: b = {}, project: p = {} } = ev.detail || {};
        const searchable = [
          ev.label,
          p.title,
          b.job_card_id,
          b.destination,
          p.venue,
          b.status,
          p.status,
          summarizeEquipment(b.equipment_summary || b.equipment || []),
          summarizeCrew(b.crew || []),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!searchable.includes(q)) continue;
      }
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [events, visibleTypes, rangeStart, rangeEnd, calSearch]);
  const visibleEventCount = useMemo(() => Object.values(evByDate).reduce((sum, dayEvents) => sum + dayEvents.length, 0), [evByDate]);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };
  const applyRange = () => {
    const target = parseDate(rangeStart || rangeEnd);
    if (target) {
      setYear(target.getFullYear());
      setMonth(target.getMonth());
    }
  };
  const clearRange = () => {
    setRangeStart("");
    setRangeEnd("");
  };

  const clearAllFilters = () => {
    setRangeStart("");
    setRangeEnd("");
    setCalSearch("");
    setVisibleTypes(Object.keys(COLOR_MAP));
  };

  const toggleType = (t) => setVisibleTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  return (
    <div className="page">
      <h1 className="pageTitle">Calendar View</h1>

      {/* Legend / Filter */}
      <Card title="Filter by Event Type">
        {(() => {
          const SHOOT_KEYS = ["travel", "setup", "technical", "shoot", "off", "end", "return"];
          const BOOKING_KEYS = ["planned", "confirmed", "blocked", "dispatched", "supplementary"];
          const renderGroup = (keys) => (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {keys.map(key => {
                const val = COLOR_MAP[key];
                if (!val) return null;
                return (
                  <button
                    key={key}
                    className="calLegendBtn"
                    style={{
                      background: visibleTypes.includes(key) ? val.bg : "rgba(255,255,255,.03)",
                      borderColor: visibleTypes.includes(key) ? val.border : "var(--line)",
                      color: visibleTypes.includes(key) ? "#fff" : "var(--muted)",
                    }}
                    onClick={() => toggleType(key)}
                  >
                    <span className="calLegendDot" style={{ background: val.border }} />
                    {val.label}
                  </button>
                );
              })}
            </div>
          );
          return (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
                  Shoot Events
                </div>
                {renderGroup(SHOOT_KEYS)}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
                  Booking Events
                </div>
                {renderGroup(BOOKING_KEYS)}
              </div>
            </>
          );
        })()}
      </Card>

      {/* Month Navigation */}
      <Card>
        <div className="dateRangeRow" style={{ marginBottom: 12 }}>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          <span style={{ color: "var(--muted)", fontSize: 13 }}>to</span>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          <button className="primaryBtn" style={{ padding: "10px 18px", fontSize: 13 }} onClick={applyRange}>Jump / Filter</button>
          <button className="ghostBtn" style={{ padding: "10px 18px", fontSize: 13 }} onClick={clearRange}>Clear</button>
          <span className="helperText">Choose one date or a full range to jump the calendar and filter visible entries.</span>
        </div>
        <div className="calSearchRow">
          <input
            className="calSearchInput"
            type="text"
            placeholder="Search events — project, job card, destination, equipment, crew, status..."
            value={calSearch}
            onChange={(e) => setCalSearch(e.target.value)}
          />
          <span className="calSearchCount">{visibleEventCount} event{visibleEventCount !== 1 ? "s" : ""} matching</span>
          <button className="clearAllBtn" onClick={clearAllFilters}>Clear All Filters</button>
        </div>
        {visibleEventCount === 0 ? (
          <div className="messageBar" style={{ marginBottom: 16 }}>
            No visible calendar entries for the current month and selected filters/range.
          </div>
        ) : null}
        <div className="calNav">
          <button className="ghostBtn" onClick={prevMonth}>&larr; Prev</button>
          <button className="ghostBtn" onClick={goToday}>Today</button>
          <h2 className="calMonthTitle">{MONTH_NAMES[month]} {year}</h2>
          <button className="ghostBtn" onClick={nextMonth}>Next &rarr;</button>
        </div>

        {/* Calendar Grid */}
        <div className="calGrid">
          {DAY_NAMES.map(d => <div key={d} className="calDayHeader">{d}</div>)}
          {cells.map((day, idx) => {
            const dateStr = day ? `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}` : null;
            const dayEvents = dateStr ? (evByDate[dateStr] || []) : [];
            const isToday = day && year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
            const isInRange = dateStr ? inDateRange(dateStr, rangeStart, rangeEnd) : false;
            return (
              <div
                key={idx}
                className={`calCell ${day ? "" : "calCellEmpty"} ${isToday ? "calCellToday" : ""} ${day && (rangeStart || rangeEnd) && isInRange ? "calCellRangeActive" : ""}`}
                style={day ? { cursor: "pointer" } : undefined}
                onClick={() => day && setSelectedDay({ dateStr, events: dayEvents })}
              >
                {day && <div className="calDate">{day}</div>}
                <div className="calEvents">
                  {dayEvents.slice(0, 3).map((ev, i) => <EventChip key={i} ev={ev} onClick={setSelectedEv} />)}
                  {dayEvents.length > 3 && <div className="calMore">+{dayEvents.length - 3} more</div>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {selectedEv && <DetailModal ev={selectedEv} onClose={() => setSelectedEv(null)} />}
      {selectedDay && <DaySummaryModal dateStr={selectedDay.dateStr} events={selectedDay.events} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}
