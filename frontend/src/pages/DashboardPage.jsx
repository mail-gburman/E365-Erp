import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { api } from "../api";
import { getBookingType } from "../auth";
import { getBookingProfile } from "../bookingProfiles";

function Metric({ big, label, sub, onClick }) {
  return (
    <div className="metric" onClick={onClick} style={onClick ? { cursor: "pointer", transition: "transform .15s" } : {}}>
      <div className="metricBig">{big}</div>
      <div className="metricLabel">{label}</div>
      {sub ? <div className="metricSub">{sub}</div> : null}
      {onClick && <div style={{ fontSize: 10, color: "rgba(229,9,47,.6)", marginTop: 6, fontWeight: 700 }}>CLICK TO VIEW</div>}
    </div>
  );
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function countWarrantyExpiringSoon(items = []) {
  const now = new Date();
  const week = new Date(now);
  week.setDate(now.getDate() + 7);
  return items.filter((item) => item.warranty_expiry && new Date(item.warranty_expiry) <= week).length;
}

function CollapsibleCell({ value }) {
  const text = Array.isArray(value) ? value.join(", ") : String(value ?? "-");
  const looksLong = text.length > 48 || text.includes(",") || text.includes("\n");
  const [open, setOpen] = useState(false);
  if (!looksLong) return <span>{text}</span>;
  const compact = text.split(",").slice(0, 2).join(", ").trim();
  const hiddenCount = Math.max(text.split(",").length - 2, 0);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ whiteSpace: open ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {open ? text : `${compact}${hiddenCount > 0 ? `, +${hiddenCount} more` : ""}`}
      </div>
      <button
        type="button"
        className="ghostBtn compactBtn"
        style={{ marginTop: 6, padding: "2px 8px", fontSize: 11 }}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? "Collapse" : "Expand"}
      </button>
    </div>
  );
}

function DrilldownModal({ title, items, columns, actions = [], onClose }) {
  const [search, setSearch] = useState("");
  const rows = items || [];
  const filteredRows = useSearch(rows, search);
  const pg = usePagination(filteredRows, 10);
  if (!items) return null;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>{title}</h2>
          <button className="ghostBtn modalCloseBtn" onClick={onClose}>Close</button>
        </div>
        <div className="listToolbar">
          <SearchBar value={search} onChange={value => { setSearch(value); pg.setPage(1); }} suggestions={buildSuggestions(rows)} placeholder="Search this summary by name, number, job card, status..." />
          <span className="helperText">{filteredRows.length} row(s)</span>
        </div>
        <div className="tableWrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {pg.pageData.length === 0 && <tr><td colSpan={columns.length} style={{ textAlign: "center", color: "var(--muted)" }}>No items</td></tr>}
              {pg.pageData.map((row, i) => (
                <tr key={i}>{columns.map((c, ci) => <td key={ci}><CollapsibleCell value={row[ci]} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={pg.total} page={pg.page} pageSize={pg.pageSize} onPageChange={pg.setPage} onPageSizeChange={pg.setPageSize} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          {actions.map((action) => (
            <button
              key={action.label}
              className={action.primary ? "primaryBtn" : "ghostBtn"}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
          <button className="ghostBtn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const bookingProfile = getBookingProfile(getBookingType());
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const navigate = useNavigate();
  const today = new Date();
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [activeQuick, setActiveQuick] = useState("");
  const [drilldown, setDrilldown] = useState(null); // { title, items, columns }

  const openDrilldown = useCallback((title, columns, items, path) => {
    setDrilldown({
      title,
      columns,
      items,
      actions: path ? [{
        label: "Go to Page",
        primary: true,
        onClick: () => {
          setDrilldown(null);
          navigate(path);
        },
      }] : [],
    });
  }, [navigate]);

  const loadData = useCallback(async (rs, re) => {
    const supportsServiceJobs = Boolean(bookingProfile.features.serviceJobs);
    const labels = ["dashboard", "inventory", "crew", "projects", "bookings", "service jobs"];
    const results = await Promise.allSettled([
      api.dashboard(rs || undefined, re || undefined),
      api.inventory(),
      api.crew(),
      api.projects(),
      api.bookingDetails(),
      supportsServiceJobs ? api.serviceJobDetails() : Promise.resolve([]),
    ]);

    const valueAt = (index, fallback) => results[index].status === "fulfilled" ? results[index].value : fallback;
    const failed = results.map((result, index) => result.status === "rejected" ? labels[index] : null).filter(Boolean);

    const dashboard = valueAt(0, {});
    const inventory = valueAt(1, []);
    const crew = valueAt(2, []);
    const projects = valueAt(3, []);
    const bookings = valueAt(4, []);
    const serviceJobs = valueAt(5, []);

    const activeProjects = projects.filter((project) => ["planned", "confirmed"].includes(project.status)).length;
    const activeBookings = bookings.filter((booking) => ["confirmed", "dispatched"].includes(booking.status));
    const deployedCrewIds = new Set(activeBookings.flatMap((booking) => (booking.crew || []).map((member) => member.id)));
    const activeEquipmentIds = new Set(activeBookings.flatMap((booking) => (booking.equipment || []).map((item) => item.id)));
    const fallback = {
      total_inventory: dashboard.total_inventory ?? inventory.length ?? 0,
      total_crew: dashboard.total_crew ?? crew.length ?? 0,
      active_shoots: dashboard.active_shoots ?? activeProjects ?? 0,
      warranty_expiring_soon: dashboard.warranty_expiring_soon ?? (inventory.length ? countWarrantyExpiringSoon(inventory) : 0),
      personnel_deployed: dashboard.personnel_deployed ?? deployedCrewIds.size ?? 0,
      personnel_availability: dashboard.personnel_availability ?? (crew.length ? Math.max(crew.length - deployedCrewIds.size, 0) : 0),
      equipment_in_service: dashboard.equipment_in_service ?? (supportsServiceJobs && serviceJobs.length ? serviceJobs.filter((job) => job.status === "in_service").length : 0),
      equipment_utilization: dashboard.equipment_utilization ?? (inventory.length ? Math.round((activeEquipmentIds.size / inventory.length) * 10000) / 100 : 0),
      third_party_equipment: dashboard.third_party_equipment ?? (inventory.length ? inventory.filter((item) => item.owner_type === "third_party").length : 0),
      third_party_active: dashboard.third_party_active ?? (inventory.length ? inventory.filter((item) => item.owner_type === "third_party" && ["reserved", "on_shoot"].includes(item.status)).length : 0),
      external_crew: dashboard.external_crew ?? (crew.length ? crew.filter((member) => ["external", "contractual", "freelance"].includes(member.manpower_type)).length : 0),
      scheduling_conflicts: dashboard.scheduling_conflicts ?? 0,
      equipment_conflicts: dashboard.equipment_conflicts ?? 0,
      crew_conflicts: dashboard.crew_conflicts ?? 0,
    };

    const merged = {
      ...dashboard,
      ...fallback,
    };
    merged.chart = {
      labels: ["Utilization", bookingProfile.features.warranty ? "Warranty Soon" : "Compliance", bookingProfile.features.serviceJobs ? "In Service" : "Holds", "Conflicts"],
      values: [
        merged.equipment_utilization || 0,
        bookingProfile.features.warranty ? (merged.warranty_expiring_soon || 0) : 0,
        bookingProfile.features.serviceJobs ? (merged.equipment_in_service || 0) : 0,
        merged.scheduling_conflicts || 0,
      ],
    };
    setData(merged);
    const visibleFailures = failed.filter((name) => !["dashboard", "bookings", "projects"].includes(name) && (supportsServiceJobs || name !== "service jobs"));
    setLoadError(visibleFailures.length ? `Some live panels could not refresh: ${visibleFailures.join(", ")}` : "");
  }, [bookingProfile.features.serviceJobs, bookingProfile.features.warranty]);

  useEffect(() => { loadData(); }, [loadData]);

  const applyRange = (rs, re, label) => {
    setRangeStart(rs);
    setRangeEnd(re);
    setActiveQuick(label);
    loadData(rs, re);
  };

  const quickRanges = [
    { label: "Today", fn: () => { const d = fmtDate(today); applyRange(d, d, "Today"); }},
    { label: "This Week", fn: () => {
      const start = new Date(today); start.setDate(today.getDate() - today.getDay());
      const end = new Date(start); end.setDate(start.getDate() + 6);
      applyRange(fmtDate(start), fmtDate(end), "This Week");
    }},
    { label: "This Month", fn: () => {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      applyRange(fmtDate(s), fmtDate(e), "This Month");
    }},
    { label: "Next 30 Days", fn: () => {
      const e = new Date(today); e.setDate(today.getDate() + 30);
      applyRange(fmtDate(today), fmtDate(e), "Next 30 Days");
    }},
    { label: "Clear", fn: () => { setRangeStart(""); setRangeEnd(""); setActiveQuick(""); loadData("", ""); }},
  ];

  // Drilldown loaders
  const drillEquipUtil = async () => {
    try {
      const inv = await api.inventory();
      const active = inv.filter(i => i.status === "reserved" || i.status === "on_shoot");
      openDrilldown(
        `${bookingProfile.utilizationLabel} — ${active.length} active of ${inv.length}`,
        [`${bookingProfile.resourceLabel} Code`, "Name", "Category", "Status", "Location"],
        active.map(i => [i.asset_code, i.name, i.category, i.status, i.location_text || "-"]),
        "/registry"
      );
    } catch (e) { console.error(e); }
  };

  const drillWarranty = async () => {
    if (!bookingProfile.features.warranty) {
      return openDrilldown(
        `${bookingProfile.complianceLabel}`,
        ["Workflow Check"],
        [["Contracts, permits, riders, menus, IDs, or compliance documents should be tracked in Company Documents / Papers based on this company type."]],
        "/operations"
      );
    }
    try {
      const inv = await api.inventory();
      const now = new Date();
      const week = new Date(now); week.setDate(now.getDate() + 7);
      const expiring = inv.filter(i => i.warranty_expiry && new Date(i.warranty_expiry) <= week);
      openDrilldown(
        `${bookingProfile.complianceLabel} — ${expiring.length} items`,
        [`${bookingProfile.resourceLabel} Code`, "Name", "Warranty Expiry", "Status"],
        expiring.map(i => [i.asset_code, i.name, i.warranty_expiry, i.status]),
        "/registry"
      );
    } catch (e) { console.error(e); }
  };

  const drillActiveEvents = async () => {
    try {
      const [projects, bookings] = await Promise.all([api.projects(), api.bookingDetails()]);
      const activeProjects = projects.filter((project) => ["planned", "confirmed"].includes(project.status));
      openDrilldown(
        `Active Events — ${activeProjects.length} projects`,
        ["Project", "Status", "Event Window", "Booking Status", "Job Cards"],
        activeProjects.map((project) => {
          const linkedBookings = bookings.filter((booking) => booking.project_id === project.id);
          const bookingStatuses = [...new Set(linkedBookings.map((booking) => booking.status))].join(", ") || "No booking";
          const jobCards = linkedBookings.map((booking) => booking.job_card_id).join(", ") || "—";
          const windowText = [project.block_start || project.expected_start_date || project.shoot_start, project.block_end || project.expected_end_date || project.shoot_end]
            .filter(Boolean)
            .join(" to ") || "Dates pending";
          return [project.title, project.status, windowText, bookingStatuses, jobCards];
        }),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillPersonnel = async () => {
    try {
      const payload = await api.dashboardAvailablePersonnel();
      const avail = payload.rows || [];
      openDrilldown(
        `Available Personnel — ${payload.count ?? avail.length} of ${payload.total ?? avail.length}`,
        ["Employee Code", "Name", "Role", "Type", "Station"],
        avail.map(c => [c.employee_code, c.name, c.role, c.type, c.station]),
        "/registry"
      );
    } catch (e) { console.error(e); }
  };

  const drillService = async () => {
    if (!bookingProfile.features.serviceJobs) {
      return openDrilldown(
        `${bookingProfile.serviceLabel}`,
        ["Workflow Check"],
        [["No repair/service workflow for this booking type. Use availability, contracts, documents, and booking holds instead."]],
        "/bookings"
      );
    }
    try {
      const jobs = await api.serviceJobDetails();
      const active = jobs.filter(j => j.status === "in_service");
      openDrilldown(
        `${bookingProfile.serviceLabel} — ${active.length} items`,
        ["Job No.", bookingProfile.resourceLabel, "Vendor", "Sent Date", "Expected Return"],
        active.map(j => [j.job_number, `${j.asset_code} - ${j.inventory_name}`, j.vendor_name, j.sent_date, j.expected_return_date || "-"]),
        "/services"
      );
    } catch (e) { console.error(e); }
  };

  const drillConflicts = async () => {
    try {
      const payload = await api.dashboardConflicts();
      const conflicts = (payload.rows || []).map((row) => [row.job_card, row.project, row.destination, row.status, row.issue]);
      openDrilldown(
        `Scheduling Conflicts — ${payload.count ?? conflicts.length} total`,
        ["Job Card", "Project", "Destination", "Status", "Issue"],
        conflicts,
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillEquipmentConflicts = async () => {
    try {
      const payload = await api.dashboardConflicts();
      const rows = (payload.rows || []).filter(r => r.issue === "Equipment overlap");
      openDrilldown(
        `${bookingProfile.conflictLabel} — ${data?.equipment_conflicts ?? 0} conflict${(data?.equipment_conflicts ?? 0) === 1 ? "" : "s"}`,
        ["Job Card", "Project", "Destination", "Status", "Issue"],
        rows.map(r => [r.job_card, r.project, r.destination, r.status, r.issue]),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillCrewConflicts = async () => {
    try {
      const payload = await api.dashboardConflicts();
      const rows = (payload.rows || []).filter(r => r.issue === "Crew overlap");
      openDrilldown(
        `Crew Conflicts — ${data?.crew_conflicts ?? 0} conflict${(data?.crew_conflicts ?? 0) === 1 ? "" : "s"}`,
        ["Job Card", "Project", "Destination", "Status", "Issue"],
        rows.map(r => [r.job_card, r.project, r.destination, r.status, r.issue]),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  // Helper: does [blockStart, blockEnd] overlap with [rs, re] range strings (YYYY-MM-DD)?
  const inRange = (blockStart, blockEnd, rs, re) => {
    if (!blockStart || !blockEnd || !rs || !re) return false;
    return new Date(blockStart) <= new Date(re + "T23:59:59") && new Date(blockEnd) >= new Date(rs + "T00:00:00");
  };

  const drillRangeBookings = async () => {
    try {
      const bookings = await api.bookingDetails();
      const filtered = bookings.filter((b) => inRange(b.block_start, b.block_end, rangeStart, rangeEnd));
      openDrilldown(
        `Bookings in Selected Range — ${data?.range_bookings ?? 0}`,
        ["Job Card", "Project", "Destination", "Status"],
        filtered.map((booking) => [
          booking.job_card_id,
          booking.project_title || `Project #${booking.project_id}`,
          booking.destination,
          booking.status,
        ]),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillRangeProjects = async () => {
    try {
      const projects = await api.projects();
      const filtered = projects.filter((p) => inRange(
        p.block_start || p.expected_start_date || p.shoot_start,
        p.block_end || p.expected_end_date || p.shoot_end,
        rangeStart, rangeEnd
      ));
      openDrilldown(
        `Projects in Selected Range — ${data?.range_projects ?? 0}`,
        ["Project", "Status", "Venue", "Window"],
        filtered.map((project) => [
          project.title,
          project.status,
          project.venue,
          [project.block_start || project.expected_start_date || project.shoot_start, project.block_end || project.expected_end_date || project.shoot_end].filter(Boolean).join(" to ") || "Dates pending",
        ]),
        "/calendar"
      );
    } catch (e) { console.error(e); }
  };

  const drillRangeDispatched = async () => {
    try {
      const bookings = await api.bookingDetails();
      const filtered = bookings.filter((b) => b.status === "dispatched" && inRange(b.block_start, b.block_end, rangeStart, rangeEnd));
      openDrilldown(
        `Dispatched in Selected Range — ${data?.range_dispatched ?? 0}`,
        ["Job Card", "Project", "Destination", "Status"],
        filtered.map((booking) => [
          booking.job_card_id,
          booking.project_title || `Project #${booking.project_id}`,
          booking.destination,
          booking.status,
        ]),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillRangeReturns = async () => {
    try {
      const bookings = await api.bookingDetails();
      const filtered = bookings.filter((b) => ["returned", "cancelled"].includes(b.status) && inRange(b.block_start, b.block_end, rangeStart, rangeEnd));
      openDrilldown(
        `Returned / Cancelled in Selected Range — ${data?.range_returned ?? 0} / ${data?.range_cancelled ?? 0}`,
        ["Job Card", "Project", "Destination", "Status"],
        filtered.map((booking) => [
          booking.job_card_id,
          booking.project_title || `Project #${booking.project_id}`,
          booking.destination,
          booking.status,
        ]),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillReturnsDueToday = async () => {
    try {
      const bookings = await api.bookingDetails();
      const todayStr = fmtDate(new Date());
      const due = bookings.filter((b) =>
        ["confirmed", "dispatched"].includes(b.status) &&
        b.block_end && b.block_end.substring(0, 10) === todayStr
      );
      openDrilldown(
        `${bookingProfile.returnLabel} — ${bookingProfile.features.returns ? (data?.returns_due_today ?? 0) : 0}`,
        ["Job Card", "Project", "Destination", "Status", "Due Date"],
        due.map((booking) => [
          booking.job_card_id,
          booking.project_title || `Project #${booking.project_id}`,
          booking.destination,
          booking.status,
          booking.block_end ? booking.block_end.substring(0, 10) : "-",
        ]),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillOverdueReturns = async () => {
    try {
      const bookings = await api.bookingDetails();
      const now = new Date();
      const overdue = bookings.filter((b) =>
        ["confirmed", "dispatched"].includes(b.status) &&
        b.block_end && new Date(b.block_end) < now
      );
      openDrilldown(
        `Overdue Returns — ${data?.overdue_returns ?? 0}`,
        ["Job Card", "Project", "Destination", "Status", "Was Due"],
        overdue.map((booking) => [
          booking.job_card_id,
          booking.project_title || `Project #${booking.project_id}`,
          booking.destination,
          booking.status,
          booking.block_end ? booking.block_end.substring(0, 10) : "-",
        ]),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillThirdPartyEquipment = async () => {
    try {
      const inv = await api.inventory();
      const thirdParty = inv.filter((item) => item.owner_type === "third_party");
      openDrilldown(
        `${bookingProfile.thirdPartyLabel} — ${thirdParty.length} items`,
        [`${bookingProfile.resourceLabel} Code`, "Name", "Category", "Status", "Location"],
        thirdParty.map((item) => [item.asset_code, item.name, item.category, item.status, item.location_text || "-"]),
        "/registry"
      );
    } catch (e) { console.error(e); }
  };

  const drillThirdPartyActive = async () => {
    try {
      const inv = await api.inventory();
      const activeThirdParty = inv.filter((item) => item.owner_type === "third_party" && ["reserved", "on_shoot"].includes(item.status));
      openDrilldown(
        `Third-Party Active / On Event — ${activeThirdParty.length} items`,
        [`${bookingProfile.resourceLabel} Code`, "Name", "Category", "Status", "Location"],
        activeThirdParty.map((item) => [item.asset_code, item.name, item.category, item.status, item.location_text || "-"]),
        "/registry"
      );
    } catch (e) { console.error(e); }
  };

  const drillExternalCrew = async () => {
    try {
      const crew = await api.crew();
      const external = crew.filter((member) => ["external", "contractual", "freelance"].includes(member.manpower_type));
      openDrilldown(
        `External Crew — ${external.length} members`,
        ["Employee Code", "Name", "Role", "Type", "Station"],
        external.map((member) => [member.employee_code, member.full_name, member.role, member.manpower_type, member.home_station]),
        "/registry"
      );
    } catch (e) { console.error(e); }
  };

  const drillAlert = async (alertText) => {
    const lower = String(alertText || "").toLowerCase();
    if (lower.includes("warranty")) return drillWarranty();
    if (lower.includes("service")) return drillService();
    if (lower.includes("conflict")) return drillConflicts();
    if (lower.includes("return") || lower.includes("overdue")) return drillOverdueReturns();
    return openDrilldown("Alert Detail", ["Alert"], [[alertText]], null);
  };

  const vals = data?.chart?.values || [];

  return (
    <div className="page">
      <h1 className="pageTitle">Analytics & Reports Dashboard</h1>
      {loadError ? <div className="messageBar">Dashboard data could not be loaded fully: {loadError}</div> : null}

      {/* Date Range Filter */}
      <Card title="Date Range Filter">
        <div className="dateRangeRow">
          <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
          <span style={{ color: "var(--muted)", fontSize: 13 }}>to</span>
          <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
          <button className="primaryBtn" style={{ padding: "10px 18px", fontSize: 13 }} onClick={() => { if (rangeStart && rangeEnd) { setActiveQuick("custom"); loadData(rangeStart, rangeEnd); } }}>Apply</button>
          {quickRanges.map(q => (
            <button key={q.label} className={`dateQuickBtn ${activeQuick === q.label ? "dateQuickBtnActive" : ""}`} onClick={q.fn}>{q.label}</button>
          ))}
        </div>
        {(rangeStart && rangeEnd && data) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginTop: 10 }}>
            <div className="detailCard" style={{ cursor: "pointer" }} onClick={drillRangeBookings}><div className="detailKey">Bookings in Range</div><div className="detailVal" style={{ fontSize: 28, fontWeight: 900 }}>{data.range_bookings ?? 0}</div></div>
            <div className="detailCard" style={{ cursor: "pointer" }} onClick={drillRangeProjects}><div className="detailKey">Projects in Range</div><div className="detailVal" style={{ fontSize: 28, fontWeight: 900 }}>{data.range_projects ?? 0}</div></div>
            <div className="detailCard" style={{ cursor: "pointer" }} onClick={drillRangeDispatched}><div className="detailKey">Dispatched</div><div className="detailVal" style={{ fontSize: 28, fontWeight: 900, color: "#60a5fa" }}>{data.range_dispatched ?? 0}</div></div>
            <div className="detailCard" style={{ cursor: "pointer" }} onClick={drillRangeReturns}><div className="detailKey">Returned / Cancelled</div><div className="detailVal" style={{ fontSize: 28, fontWeight: 900 }}>{data.range_returned ?? 0} / <span style={{ color: "#f87171" }}>{data.range_cancelled ?? 0}</span></div></div>
          </div>
        )}
      </Card>

      <div className="analyticsGrid">
        <Metric big={`${data?.equipment_utilization ?? 0}%`} label={bookingProfile.utilizationLabel} sub={`${data?.total_inventory ?? 0} total ${bookingProfile.resourcePlural.toLowerCase()}`} onClick={drillEquipUtil} />
        <Metric big={bookingProfile.features.warranty ? (data?.warranty_expiring_soon ?? 0) : 0} label={bookingProfile.complianceLabel} sub={bookingProfile.features.warranty ? "within 7 days" : "documents / approvals"} onClick={drillWarranty} />
        <Metric big={data?.active_shoots ?? 0} label="Active Events" sub="planned + confirmed" onClick={drillActiveEvents} />
        <Metric big={data?.personnel_availability ?? 0} label="Personnel Available" sub={`${data?.personnel_deployed ?? 0} deployed · ${data?.total_crew ?? 0} total`} onClick={drillPersonnel} />
        <Metric big={bookingProfile.features.serviceJobs ? (data?.equipment_in_service ?? 0) : 0} label={bookingProfile.serviceLabel} sub={bookingProfile.features.serviceJobs ? "under repair / maintenance" : "availability / booking hold"} onClick={drillService} />
        <Metric big={data?.scheduling_conflicts ?? 0} label="Scheduling Conflicts" sub={`${bookingProfile.resourceLabel.toLowerCase()} + crew`} onClick={drillConflicts} />
      </div>

      <div className="grid2">
        <Card title="Conflict & Returns">
          <div className="statRow">
            <div style={{ cursor: "pointer" }} onClick={drillEquipmentConflicts}><strong>{data?.equipment_conflicts ?? 0}</strong><span>{bookingProfile.conflictLabel}</span></div>
            <div style={{ cursor: "pointer" }} onClick={drillCrewConflicts}><strong>{data?.crew_conflicts ?? 0}</strong><span>Crew conflicts</span></div>
            {bookingProfile.features.returns ? (
              <div style={{ cursor: "pointer" }} onClick={drillReturnsDueToday}><strong>{data?.returns_due_today ?? 0}</strong><span>{bookingProfile.returnLabel}</span></div>
            ) : (
              <div><strong>{bookingProfile.features.contractTracking ? "Docs" : "Follow-up"}</strong><span>{bookingProfile.returnLabel}</span></div>
            )}
          </div>
          {data?.overdue_returns > 0 && (
            <div className="messageBar" style={{marginTop:12, cursor: "pointer"}} onClick={drillOverdueReturns}>
              <span>{data.overdue_returns} overdue return(s)! Check bookings immediately.</span>
            </div>
          )}
        </Card>
        <Card title="Third-Party & External Resources">
          <div className="statRow">
            <div style={{ cursor: "pointer" }} onClick={drillThirdPartyEquipment}><strong>{data?.third_party_equipment ?? 0}</strong><span>{bookingProfile.thirdPartyLabel}</span></div>
            <div style={{ cursor: "pointer" }} onClick={drillThirdPartyActive}><strong>{data?.third_party_active ?? 0}</strong><span>3P Active / On Event</span></div>
            <div style={{ cursor: "pointer" }} onClick={drillExternalCrew}><strong>{data?.external_crew ?? 0}</strong><span>External Crew</span></div>
          </div>
        </Card>
      </div>

      <div className="grid2">
        <Card title="Dashboard Chart">
          <div className="chartBars">
            {(data?.chart?.labels || []).map((label, idx) => (
              <div key={label} className="barItem" style={{ cursor: "pointer" }} onClick={() => {
                if (label === "Utilization") drillEquipUtil();
                else if (label === "Warranty Soon" || label === "Compliance") drillWarranty();
                else if (label === "In Service" || label === "Holds") drillService();
                else if (label === "Conflicts") drillConflicts();
              }}>
                <div className="barFill" style={{ height: `${Math.min(Number(vals[idx] || 0), 100)}%` }}></div>
                <div className="barLabel">{label}<br/><strong>{vals[idx] ?? 0}</strong></div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Flags & Alerts">
          <ul className="alertList">
            {(data?.alerts || []).length ? data.alerts.map((x, i) => <li key={i} style={{ cursor: "pointer" }} onClick={() => {
              drillAlert(x);
            }}>{x}</li>) : <li style={{color:"#4ade80"}}>No active alerts - all systems operational</li>}
          </ul>
        </Card>
      </div>

      {drilldown && <DrilldownModal title={drilldown.title} items={drilldown.items} columns={drilldown.columns} actions={drilldown.actions} onClose={() => setDrilldown(null)} />}
    </div>
  );
}
