import React, { useEffect, useState, useMemo } from "react";
import Card from "../components/Card";
import AutocompleteInput from "../components/AutocompleteInput";
import Pagination, { usePagination } from "../components/Pagination";
import { auditApi, forceDownloadAuthorized } from "../api";
import { getBookingType } from "../auth";
import { getBookingProfile } from "../bookingProfiles";

function renderReadableDetails(details) {
  if (!details || details === "-") return <span>-</span>;
  const parts = String(details)
    .split(/\n+/)
    .map(part => part.replace(/^•\s*/, "").trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return <span style={{ whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" }}>{details}</span>;
  }
  return (
    <ul className="auditDetailList">
      {parts.map((part, idx) => <li key={`${part}-${idx}`}>{part}</li>)}
    </ul>
  );
}

export default function AuditPage() {
  const bookingProfile = getBookingProfile(getBookingType());
  const supportsServiceJobs = Boolean(bookingProfile.features.serviceJobs);
  const supportsReturns = Boolean(bookingProfile.features.returns);
  const [filters, setFilters] = useState({ range_key: "7d", category: "all", start_date: "", end_date: "", username: "", action: "" });
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState("");
  const [subSearch, setSubSearch] = useState("");
  const [subEntity, setSubEntity] = useState("");
  const [subAction, setSubAction] = useState("");

  const load = () => auditApi.query(filters).then(setRows).catch(err => setMessage(String(err.message || err)));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!supportsServiceJobs && filters.category === "services") {
      setFilters((prev) => ({ ...prev, category: "all" }));
      setSubSearch("");
      setSubEntity("");
      setSubAction("");
    }
  }, [filters.category, supportsServiceJobs]);

  const filteredRows = useMemo(() => {
    let data = rows;
    if (subSearch) {
      const q = subSearch.toLowerCase();
      data = data.filter(r =>
        (r.search_text || "").toLowerCase().includes(q) ||
        (r.formatted_details || "").toLowerCase().includes(q) ||
        (r.entity_label || "").toLowerCase().includes(q) ||
        (r.entity_id || "").toLowerCase().includes(q) ||
        (r.entity_type || "").toLowerCase().includes(q) ||
        (r.username || "").toLowerCase().includes(q)
      );
    }
    if (subEntity) data = data.filter(r => r.entity_type === subEntity);
    if (subAction) data = data.filter(r => r.action === subAction);
    return data;
  }, [rows, subSearch, subEntity, subAction]);

  const pg = usePagination(filteredRows, 25);
  const uniqueUsers = useMemo(() => [...new Set(rows.map(r => r.username).filter(Boolean))].sort(), [rows]);
  const uniqueEntities = useMemo(() => [...new Set(rows.map(r => r.entity_type).filter(Boolean))].sort(), [rows]);
  const uniqueActions = useMemo(() => [...new Set(rows.map(r => r.action).filter(Boolean))].sort(), [rows]);
  const uniqueSuggestions = useMemo(() => {
    const all = new Set();
    rows.forEach(r => {
      if (r.entity_label) all.add(r.entity_label);
      if (r.formatted_details) all.add(r.formatted_details);
      if (r.entity_type) all.add(r.entity_type);
      if (r.username) all.add(r.username);
      if (r.search_text) all.add(r.search_text);
    });
    return Array.from(all).slice(0, 100);
  }, [rows]);

  async function doPdf() {
    try {
      setExporting("pdf");
      const params = {
        ...filters,
        search: subSearch,
        sub_entity: subEntity,
        sub_action: subAction,
        screen_count: String(filteredRows.length || rows.length || 0),
      };
      await forceDownloadAuthorized(auditApi.exportPdfUrl(params), "audit_export.pdf");
      setMessage("Audit PDF downloaded. The layout is now wrapped for clean printing and saving.");
    } catch (e) {
      setMessage(String(e.message || e));
    } finally {
      setExporting("");
    }
  }

  async function doZip() {
    try {
      setExporting("zip");
      const params = {
        ...filters,
        search: subSearch,
        sub_entity: subEntity,
        sub_action: subAction,
        screen_count: String(filteredRows.length || rows.length || 0),
      };
      await forceDownloadAuthorized(auditApi.exportZipUrl(params), "audit_export.zip");
      setMessage("Audit ZIP downloaded.");
    } catch (e) {
      setMessage(String(e.message || e));
    } finally {
      setExporting("");
    }
  }

  const categoryHints = {
    bookings: `Search by client, project, destination, booking ID${supportsReturns ? ", returns" : ""}...`,
    equipment: `Search by code, ${bookingProfile.resourceLabel.toLowerCase()} name, serial / reference number...`,
    manpower: "Search by crew name, employee code, role...",
    services: `Search by job number, vendor, ${bookingProfile.resourceLabel.toLowerCase()} name...`,
    papers: `Search by paper number, reference name, ${bookingProfile.documents.gatePass.toLowerCase()}...`,
    users: "Search by username or user action...",
    additions: "Search by name, code, entity added...",
    documents: "Search by document name...",
    all: "Search across all audit entries...",
  };

  return (
    <div className="page">
      <h1 className="pageTitle">Audit & Activity Exports</h1>
      {message ? <div className="messageBar">{message} <button className="dismissBtn" onClick={() => setMessage("")}>Dismiss</button></div> : null}

      <div className="grid2">
        <Card title="Filters">
          <div className="formGrid">
            <select value={filters.range_key} onChange={e => setFilters({ ...filters, range_key: e.target.value })}>
              <option value="1d">1 day</option><option value="2d">2 days</option><option value="7d">7 days</option><option value="30d">1 month</option><option value="90d">90 days</option><option value="custom">Custom range</option><option value="all">All time</option>
            </select>
            <select value={filters.category} onChange={e => { setFilters({ ...filters, category: e.target.value }); setSubSearch(""); setSubEntity(""); setSubAction(""); }}>
              <option value="all">All activity</option>
              <option value="bookings">{supportsReturns ? "Bookings / QC / Returns" : "Bookings / Activity"}</option>
              <option value="equipment">{bookingProfile.resourceLabel} / Registry</option>
              <option value="manpower">Manpower / Crew</option>
              {supportsServiceJobs && <option value="services">{bookingProfile.serviceNavLabel}</option>}
              <option value="papers">Papers / {bookingProfile.documents.gatePass}</option>
              <option value="additions">All New Additions</option>
              <option value="users">Users</option>
              <option value="documents">Documents</option>
            </select>
            <label className="fieldLabel">User</label>
            <select value={filters.username} onChange={e => setFilters({ ...filters, username: e.target.value })}>
              <option value="">All users</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            {filters.range_key === "custom" ? <>
              <input type="date" value={filters.start_date} onChange={e => setFilters({ ...filters, start_date: e.target.value })} />
              <input type="date" value={filters.end_date} onChange={e => setFilters({ ...filters, end_date: e.target.value })} />
            </> : null}
          </div>
          <div className="actionCell" style={{ marginTop: 12 }}>
            <button className="primaryBtn" onClick={load}>Apply</button>
            <button className="ghostBtn" onClick={doPdf} disabled={exporting !== ""}>{exporting === "pdf" ? "Preparing PDF..." : "Download PDF"}</button>
            <button className="ghostBtn" onClick={doZip} disabled={exporting !== ""}>{exporting === "zip" ? "Preparing ZIP..." : "Download ZIP"}</button>
          </div>
        </Card>
        <Card title="Export Scope">
          <ul className="alertList">
            <li>Audit rows follow the same range, category, user, and on-screen search you have applied.</li>
            <li>PDF now uses simple business language instead of raw JSON or technical brackets.</li>
            <li>Long text now wraps inside the audit box so it does not spill outside while printing or saving.</li>
            <li>ZIP now keeps only readable audit details for management sharing.</li>
          </ul>
        </Card>
      </div>

      <Card title={`Activity View — ${filters.category === "all" ? "All" : filters.category}`}>
        <div className="auditSubFilters">
          <AutocompleteInput
            placeholder={categoryHints[filters.category] || "Search..."}
            value={subSearch}
            onChange={(value) => { setSubSearch(value); pg.setPage(1); }}
            suggestions={uniqueSuggestions}
            className="auditSearchInput"
          />
          <select value={subEntity} onChange={e => { setSubEntity(e.target.value); pg.setPage(1); }}>
            <option value="">All entity types</option>
            {uniqueEntities.map(et => <option key={et} value={et}>{et}</option>)}
          </select>
          <select value={subAction} onChange={e => { setSubAction(e.target.value); pg.setPage(1); }}>
            <option value="">All actions</option>
            {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {(subSearch || subEntity || subAction) && (
            <button className="ghostBtn" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => { setSubSearch(""); setSubEntity(""); setSubAction(""); }}>Clear</button>
          )}
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{filteredRows.length} results</span>
        </div>

        <div className="tableWrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Label</th><th>Details</th></tr></thead>
            <tbody>
              {pg.pageData.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize: 11, whiteSpace: "nowrap" }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                  <td>{r.username}</td>
                  <td><span className={`badge ${r.action === "create" || r.action === "bulk_upload" || r.action === "smart_upload" ? "badgeOptional" : r.action === "delete" || r.action === "cancel" ? "badgeMandatory" : ""}`}>{r.action_label || r.action}</span></td>
                  <td>{r.entity_display || r.entity_type}</td>
                  <td style={{ fontSize: 12, maxWidth: 260 }}>{r.entity_label || r.entity_id || "-"}</td>
                  <td style={{ fontSize: 11, maxWidth: 420, whiteSpace: "normal", wordBreak: "break-word" }}>{renderReadableDetails(r.formatted_details || r.details_json)}</td>
                </tr>
              ))}
              {pg.pageData.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)" }}>No matching audit entries</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination total={pg.total} page={pg.page} pageSize={pg.pageSize} onPageChange={pg.setPage} onPageSizeChange={pg.setPageSize} />
      </Card>
    </div>
  );
}
