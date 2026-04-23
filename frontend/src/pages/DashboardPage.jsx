import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { api } from "../api";

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
    const labels = ["dashboard", "inventory", "crew", "projects", "bookings", "service jobs"];
    const results = await Promise.allSettled([
      api.dashboard(rs || undefined, re || undefined),
      api.inventory(),
      api.crew(),
      api.projects(),
      api.bookingDetails(),
      api.serviceJobDetails(),
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
      total_inventory: inventory.length || dashboard.total_inventory || 0,
      total_crew: crew.length || dashboard.total_crew || 0,
      active_shoots: activeProjects || dashboard.active_shoots || 0,
      warranty_expiring_soon: inventory.length ? countWarrantyExpiringSoon(inventory) : (dashboard.warranty_expiring_soon || 0),
      personnel_deployed: deployedCrewIds.size || dashboard.personnel_deployed || 0,
      personnel_availability: crew.length ? Math.max(crew.length - deployedCrewIds.size, 0) : (dashboard.personnel_availability || 0),
      equipment_in_service: serviceJobs.length ? serviceJobs.filter((job) => job.status === "in_service").length : (dashboard.equipment_in_service || 0),
      equipment_utilization: inventory.length ? Math.round((activeEquipmentIds.size / inventory.length) * 10000) / 100 : (dashboard.equipment_utilization || 0),
      third_party_equipment: inventory.length ? inventory.filter((item) => item.owner_type === "third_party").length : (dashboard.third_party_equipment || 0),
      third_party_active: inventory.length ? inventory.filter((item) => item.owner_type === "third_party" && ["reserved", "on_shoot"].includes(item.status)).length : (dashboard.third_party_active || 0),
      external_crew: crew.length ? crew.filter((member) => ["external", "contractual", "freelance"].includes(member.manpower_type)).length : (dashboard.external_crew || 0),
    };

    const merged = {
      ...dashboard,
      ...fallback,
    };
    merged.chart = {
      labels: ["Utilization", "Warranty Soon", "In Service", "Conflicts"],
      values: [
        merged.equipment_utilization || 0,
        merged.warranty_expiring_soon || 0,
        merged.equipment_in_service || 0,
        merged.scheduling_conflicts || 0,
      ],
    };
    setData(merged);
    const visibleFailures = failed.filter((name) => !["dashboard", "bookings", "projects"].includes(name));
    setLoadError(visibleFailures.length ? `Some live panels could not refresh: ${visibleFailures.join(", ")}` : "");
  }, []);

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
        `Equipment Utilization — ${active.length} active of ${inv.length}`,
        ["Asset Code", "Name", "Category", "Status", "Location"],
        active.map(i => [i.asset_code, i.name, i.category, i.status, i.location_text || "-"]),
        "/registry"
      );
    } catch (e) { console.error(e); }
  };

  const drillWarranty = async () => {
    try {
      const inv = await api.inventory();
      const now = new Date();
      const week = new Date(now); week.setDate(now.getDate() + 7);
      const expiring = inv.filter(i => i.warranty_expiry && new Date(i.warranty_expiry) <= week);
      openDrilldown(
        `Warranty Expiring Soon — ${expiring.length} items`,
        ["Asset Code", "Name", "Warranty Expiry", "Status"],
        expiring.map(i => [i.asset_code, i.name, i.warranty_expiry, i.status]),
        "/registry"
      );
    } catch (e) { console.error(e); }
  };

  const drillActiveShoots = async () => {
    try {
      const [projects, bookings] = await Promise.all([api.projects(), api.bookingDetails()]);
      const activeProjects = projects.filter((project) => ["planned", "confirmed"].includes(project.status));
      openDrilldown(
        `Active Shoots — ${activeProjects.length} projects`,
        ["Project", "Status", "Shoot Window", "Booking Status", "Job Cards"],
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
      const crew = await api.crew();
      const avail = crew.filter(c => c.status === "available");
      openDrilldown(
        `Available Personnel — ${avail.length} of ${crew.length}`,
        ["Employee Code", "Name", "Role", "Type", "Station"],
        avail.map(c => [c.employee_code, c.full_name, c.role, c.manpower_type, c.home_station]),
        "/registry"
      );
    } catch (e) { console.error(e); }
  };

  const drillService = async () => {
    try {
      const jobs = await api.serviceJobDetails();
      const active = jobs.filter(j => j.status === "in_service");
      openDrilldown(
        `Equipment in Service — ${active.length} items`,
        ["Job No.", "Equipment", "Vendor", "Sent Date", "Expected Return"],
        active.map(j => [j.job_number, `${j.asset_code} - ${j.inventory_name}`, j.vendor_name, j.sent_date, j.expected_return_date || "-"]),
        "/services"
      );
    } catch (e) { console.error(e); }
  };

  const drillConflicts = async () => {
    try {
      const bookings = await api.bookingDetails();
      const conflicts = bookings.filter((booking) => booking.is_conflict);
      openDrilldown(
        `Scheduling Conflicts — ${conflicts.length} booking${conflicts.length === 1 ? "" : "s"}`,
        ["Job Card", "Project", "Destination", "Status", "Issue"],
        conflicts.map((booking) => [
          booking.job_card_id,
          booking.project_title || `Project #${booking.project_id}`,
          booking.destination,
          booking.status,
          "Equipment or crew overlap detected",
        ]),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillRangeBookings = async () => {
    try {
      const bookings = await api.bookingDetails();
      openDrilldown(
        `Bookings in Selected Range — ${data?.range_bookings ?? 0}`,
        ["Job Card", "Project", "Destination", "Status"],
        bookings.map((booking) => [
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
      openDrilldown(
        `Projects in Selected Range — ${data?.range_projects ?? 0}`,
        ["Project", "Status", "Venue", "Window"],
        projects.map((project) => [
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
      const dispatched = bookings.filter((booking) => booking.status === "dispatched");
      openDrilldown(
        `Dispatched in Selected Range — ${data?.range_dispatched ?? 0}`,
        ["Job Card", "Project", "Destination", "Status"],
        dispatched.map((booking) => [
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
      const finished = bookings.filter((booking) => ["returned", "cancelled"].includes(booking.status));
      openDrilldown(
        `Returned / Cancelled in Selected Range — ${data?.range_returned ?? 0} / ${data?.range_cancelled ?? 0}`,
        ["Job Card", "Project", "Destination", "Status"],
        finished.map((booking) => [
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
      const due = bookings.filter((booking) => booking.status === "dispatched");
      openDrilldown(
        `Returns Due Today — ${data?.returns_due_today ?? 0}`,
        ["Job Card", "Project", "Destination", "Status"],
        due.map((booking) => [
          booking.job_card_id,
          booking.project_title || `Project #${booking.project_id}`,
          booking.destination,
          booking.status,
        ]),
        "/bookings"
      );
    } catch (e) { console.error(e); }
  };

  const drillOverdueReturns = async () => {
    try {
      const bookings = await api.bookingDetails();
      const overdue = bookings.filter((booking) => booking.status === "dispatched");
      openDrilldown(
        `Overdue Returns — ${data?.overdue_returns ?? 0}`,
        ["Job Card", "Project", "Destination", "Status"],
        overdue.map((booking) => [
          booking.job_card_id,
          booking.project_title || `Project #${booking.project_id}`,
          booking.destination,
          booking.status,
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
        `Third-Party Equipment — ${thirdParty.length} items`,
        ["Asset Code", "Name", "Category", "Status", "Location"],
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
        `Third-Party Active / On Shoot — ${activeThirdParty.length} items`,
        ["Asset Code", "Name", "Category", "Status", "Location"],
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
        <Metric big={`${data?.equipment_utilization ?? 0}%`} label="Equipment Utilization" sub={`${data?.total_inventory ?? 0} total items`} onClick={drillEquipUtil} />
        <Metric big={data?.warranty_expiring_soon ?? 0} label="Warranty Expiring Soon" sub="within 7 days" onClick={drillWarranty} />
        <Metric big={data?.active_shoots ?? 0} label="Active Shoots" sub="planned + confirmed" onClick={drillActiveShoots} />
        <Metric big={data?.personnel_availability ?? 0} label="Personnel Available" sub={`${data?.personnel_deployed ?? 0} deployed · ${data?.total_crew ?? 0} total`} onClick={drillPersonnel} />
        <Metric big={data?.equipment_in_service ?? 0} label="Equipment in Service" sub="under repair / maintenance" onClick={drillService} />
        <Metric big={data?.scheduling_conflicts ?? 0} label="Scheduling Conflicts" sub="equipment + crew" onClick={drillConflicts} />
      </div>

      <div className="grid2">
        <Card title="Conflict & Returns">
          <div className="statRow">
            <div style={{ cursor: "pointer" }} onClick={drillConflicts}><strong>{data?.equipment_conflicts ?? 0}</strong><span>Equipment conflicts</span></div>
            <div style={{ cursor: "pointer" }} onClick={drillConflicts}><strong>{data?.crew_conflicts ?? 0}</strong><span>Crew conflicts</span></div>
            <div style={{ cursor: "pointer" }} onClick={drillReturnsDueToday}><strong>{data?.returns_due_today ?? 0}</strong><span>Returns due today</span></div>
          </div>
          {data?.overdue_returns > 0 && (
            <div className="messageBar" style={{marginTop:12, cursor: "pointer"}} onClick={drillOverdueReturns}>
              <span>{data.overdue_returns} overdue return(s)! Check bookings immediately.</span>
            </div>
          )}
        </Card>
        <Card title="Third-Party & External Resources">
          <div className="statRow">
            <div style={{ cursor: "pointer" }} onClick={drillThirdPartyEquipment}><strong>{data?.third_party_equipment ?? 0}</strong><span>3rd Party Equipment</span></div>
            <div style={{ cursor: "pointer" }} onClick={drillThirdPartyActive}><strong>{data?.third_party_active ?? 0}</strong><span>3P Active / On Shoot</span></div>
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
                else if (label === "Warranty Soon") drillWarranty();
                else if (label === "In Service") drillService();
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
