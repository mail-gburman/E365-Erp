import React, { useEffect, useState } from "react";
import Card from "../components/Card";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { adminApi, systemApi } from "../api";
import { getRole } from "../auth";

// ── Permission matrix constants ────────────────────────────────────────────

const ACTIONS = ["view", "add", "edit", "delete", "download", "export", "approve"];

const PERMISSION_GROUPS = [
  {
    title: "Dashboard & Reports",
    modules: [
      { key: "dashboard", label: "Dashboard", fields: ["Date filters", "Metric cards", "Click summaries", "Operational alerts"] },
      { key: "calendar", label: "Calendar", fields: ["Travel day", "Setup day", "Technical day", "Shoot day", "Off day", "End day", "Return day", "Day summary PDF"] },
      { key: "audit", label: "Audit & Exports", fields: ["Search textbox", "Entity filters", "Readable details", "PDF export", "ZIP export", "Reset audit"] },
    ],
  },
  {
    title: "Bookings & Projects",
    modules: [
      { key: "projects", label: "Projects", fields: ["Project title", "Client", "Venue", "Show type", "Project status", "Project dates", "Notes"] },
      { key: "bookings", label: "Bookings", fields: ["Job card", "Supplementary job card", "Destination", "Transport", "Contacts", "Call time", "Packup time", "Remarks"] },
      { key: "resources", label: "Booking Resources", fields: ["Main equipment", "Accessories", "Manpower", "Third-party items", "Availability checks", "Quantity changes"] },
      { key: "job_cards", label: "Job Cards & Challans", fields: ["Job card PDF", "Road challan PDF", "Supplementary reference", "Grouped item quantities"] },
      { key: "planned_shoots", label: "Planned Shoots", fields: ["Confirm shoots", "Cancel shoots", "Bulk action", "Conflict check", "Status approval"] },
    ],
  },
  {
    title: "Master Registry",
    modules: [
      { key: "masters", label: "Master Registry", fields: ["All master lists", "Import/export", "Global lookup tables"] },
      { key: "equipment_master", label: "Equipment", fields: ["Equipment name", "Serial number", "Category", "Warranty", "Availability", "Warehouse"] },
      { key: "accessories_master", label: "Accessories", fields: ["Accessory name", "Parent equipment type", "Stock quantity", "Compatibility"] },
      { key: "warehouses", label: "Warehouses", fields: ["Warehouse name", "Location", "Store keeper", "Stock movement"] },
      { key: "clients", label: "Clients", fields: ["Client name", "Company", "GST", "Contacts", "Billing details"] },
      { key: "vendors", label: "Vendors", fields: ["Vendor name", "Contact", "Procurement rates", "Third-party supply"] },
      { key: "manpower", label: "Manpower", fields: ["Crew name", "Department", "Phone", "Availability", "Deployment"] },
    ],
  },
  {
    title: "Operations",
    modules: [
      { key: "dispatch", label: "Dispatch", fields: ["Dispatch status", "AWB/tracking", "Warehouse release", "Transport handover"] },
      { key: "returns", label: "Returns", fields: ["Return check-in", "Packup time", "Missing items", "Closure notes"] },
      { key: "damages", label: "Damages", fields: ["Damage report", "Repair status", "Client liability", "Internal notes"] },
      { key: "qc", label: "QC", fields: ["QC checklist", "QC photos", "Pass/fail", "Technician remarks"] },
      { key: "papers", label: "Papers & QC", fields: ["Documents", "Papers", "QC records", "PDF download"] },
    ],
  },
  {
    title: "Services & Procurement",
    modules: [
      { key: "services", label: "Service Jobs", fields: ["Service ticket", "Assigned technician", "Costing", "Warranty claim"] },
      { key: "procurement", label: "Vendors & Procurement", fields: ["Purchase request", "Vendor quotes", "Approval", "Inbound stock"] },
      { key: "accounts", label: "Accounts", fields: ["Billable shoots", "Package billing", "Day-wise billing", "Manpower payouts", "Margins", "Invoice approval"] },
    ],
  },
  {
    title: "System & Administration",
    modules: [
      { key: "users", label: "Admin Users", fields: ["Create user", "Edit user", "Disable user", "Delete user", "Saved roles", "Permission matrix"] },
      { key: "roles", label: "Saved Roles", fields: ["Copy template", "Modify after copy", "Approve role policy"] },
      { key: "profile", label: "Profile", fields: ["View profile", "Modify profile", "Change password", "Logout"] },
      { key: "system", label: "System", fields: ["Backup", "Restore", "Health check", "Erase all data", "Demo dataset", "Tally connector", "Mock Tally server", "Connector env"] },
      { key: "uploads", label: "System Documents", fields: ["Excel import", "Document upload", "Document library", "Uploaded statutory documents", "Client documents tab", "Vendor documents tab", "Inventory documents tab", "Manpower documents tab", "Warehouse documents tab", "Job card PDFs", "Road challan PDFs", "Manpower PDFs", "Gate pass PDFs", "Invoice PDFs", "Service PDFs", "Papers PDFs", "Download uploaded files", "Download generated PDFs", "Smart mapping", "Bulk create"] },
    ],
  },
];

const MODULES = PERMISSION_GROUPS.flatMap(g => g.modules);
const MODULE_KEYS = MODULES.flatMap(m => [m.key, ...m.fields.map(f => fieldKey(m.key, f))]);
const ROLE_NAMES = ["admin", "producer", "operations", "store", "accounts", "qc", "viewer"];

function fieldKey(moduleKey, field) {
  return `${moduleKey}.${field.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}
function makeActionSet(enabled = []) {
  return Object.fromEntries(ACTIONS.map(a => [a, enabled.includes(a)]));
}
function allPerms(value) {
  return Object.fromEntries(MODULE_KEYS.map(k => [k, Object.fromEntries(ACTIONS.map(a => [a, value]))]));
}
function buildPreset(config = {}) {
  const base = allPerms(false);
  for (const [mk, actions] of Object.entries(config)) {
    if (mk === "*") MODULE_KEYS.forEach(k => { base[k] = makeActionSet(actions); });
    else MODULE_KEYS.filter(k => k === mk || k.startsWith(`${mk}.`)).forEach(k => { base[k] = makeActionSet(actions); });
  }
  return base;
}

// Built-in presets (frontend copy — matches backend ROLE_PRESETS)
const BUILTIN_PRESETS = {
  admin: allPerms(true),
  producer: buildPreset({ dashboard: ["view","export"], calendar: ["view","add","edit","export"], projects: ["view","add","edit","export","approve"], bookings: ["view","add","edit","export","approve"], resources: ["view","add","edit"], job_cards: ["view","add","edit","export"], planned_shoots: ["view","edit","approve"], clients: ["view","add","edit"], uploads: ["view","add","download","export"], audit: ["view","export"], profile: ["view","edit"] }),
  operations: buildPreset({ dashboard: ["view"], calendar: ["view","add","edit","export"], projects: ["view","add","edit"], bookings: ["view","add","edit","export"], resources: ["view","add","edit"], job_cards: ["view","add","edit","export"], planned_shoots: ["view","edit","approve"], masters: ["view"], equipment_master: ["view"], accessories_master: ["view"], warehouses: ["view"], clients: ["view","add","edit"], vendors: ["view"], manpower: ["view","add","edit"], dispatch: ["view","add","edit"], returns: ["view","add","edit"], damages: ["view","add","edit"], qc: ["view","add","edit"], papers: ["view","add","edit","export"], services: ["view","add","edit"], accounts: ["view"], uploads: ["view","add","download"], audit: ["view"], profile: ["view","edit"] }),
  store: buildPreset({ dashboard: ["view"], calendar: ["view"], bookings: ["view"], resources: ["view","add","edit"], job_cards: ["view","export"], masters: ["view","add","edit"], equipment_master: ["view","add","edit"], accessories_master: ["view","add","edit"], warehouses: ["view","add","edit"], manpower: ["view"], dispatch: ["view","add","edit"], returns: ["view","add","edit"], damages: ["view","add","edit"], qc: ["view","add","edit"], papers: ["view","export"], uploads: ["view","add","download"], profile: ["view","edit"] }),
  accounts: buildPreset({ dashboard: ["view","export"], calendar: ["view"], projects: ["view","export"], bookings: ["view","export"], job_cards: ["view","export"], clients: ["view","add","edit"], vendors: ["view","add","edit"], procurement: ["view","add","edit","approve","export"], accounts: ["view","add","edit","export","approve"], papers: ["view","export"], uploads: ["view","download","export"], audit: ["view","export"], profile: ["view","edit"] }),
  qc: buildPreset({ dashboard: ["view"], calendar: ["view"], bookings: ["view"], resources: ["view"], equipment_master: ["view","edit"], accessories_master: ["view","edit"], dispatch: ["view"], returns: ["view","add","edit"], damages: ["view","add","edit"], qc: ["view","add","edit","approve","export"], papers: ["view","add","edit","export"], services: ["view","add","edit"], uploads: ["view","add","download"], profile: ["view","edit"] }),
  viewer: buildPreset({ dashboard: ["view"], calendar: ["view"], projects: ["view"], bookings: ["view"], resources: ["view"], job_cards: ["view"], masters: ["view"], equipment_master: ["view"], accessories_master: ["view"], warehouses: ["view"], clients: ["view"], vendors: ["view"], manpower: ["view"], papers: ["view"], uploads: ["view"], profile: ["view","edit"] }),
};

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function emptyPerms() { return allPerms(false); }
function normalizePerms(input) {
  const out = emptyPerms();
  if (!input || typeof input !== "object") return out;
  MODULE_KEYS.forEach(k => {
    if (input[k] && typeof input[k] === "object") {
      // Explicit entry — use directly (covers both module-level and field-level keys)
      ACTIONS.forEach(a => { out[k][a] = !!input[k][a]; });
    } else if (k.includes(".")) {
      // Field key not explicitly stored → inherit from its parent module key
      // e.g. "masters.all_master_lists" inherits from "masters"
      const parent = k.split(".")[0];
      if (input[parent] && typeof input[parent] === "object") {
        ACTIONS.forEach(a => { out[k][a] = !!input[parent][a]; });
      }
    }
  });
  return out;
}
function parsePerms(json) {
  try { return normalizePerms(typeof json === "string" ? JSON.parse(json) : json); }
  catch { return emptyPerms(); }
}
function countPerms(perms) {
  return MODULE_KEYS.reduce((s, k) => s + ACTIONS.filter(a => perms[k]?.[a]).length, 0);
}

// ── Shared permission UI ────────────────────────────────────────────────────

function PermissionGrid({ perms, onChange }) {
  const [openGroups, setOpenGroups] = useState({});
  const [openModules, setOpenModules] = useState({});

  function togglePerm(mk, action) {
    onChange({ ...perms, [mk]: { ...perms[mk], [action]: !perms[mk]?.[action] } });
  }
  function setModule(mk, value) {
    const next = clone(perms);
    MODULE_KEYS.filter(k => k === mk || k.startsWith(`${mk}.`)).forEach(k => {
      next[k] = Object.fromEntries(ACTIONS.map(a => [a, value]));
    });
    onChange(next);
  }
  function setGroup(group, value) {
    const next = clone(perms);
    group.modules.forEach(m => {
      next[m.key] = Object.fromEntries(ACTIONS.map(a => [a, value]));
      m.fields.forEach(f => { next[fieldKey(m.key, f)] = Object.fromEntries(ACTIONS.map(a => [a, value])); });
    });
    onChange(next);
  }

  return (
    <div className="permMatrix">
      {PERMISSION_GROUPS.map(group => {
        const groupKeys = group.modules.flatMap(m => [m.key, ...m.fields.map(f => fieldKey(m.key, f))]);
        const groupActive = groupKeys.reduce((s, k) => s + ACTIONS.filter(a => perms[k]?.[a]).length, 0);
        const groupTotal = groupKeys.length * ACTIONS.length;
        const groupOpen = openGroups[group.title];
        return (
          <div key={group.title} className="permGroup">
            <div className="permGroupHeader">
              <button type="button" className="permExpandBtn" onClick={() => setOpenGroups(o => ({ ...o, [group.title]: !groupOpen }))}>{groupOpen ? "−" : "+"}</button>
              <strong>{group.title}</strong>
              <span className="helperText">{groupActive}/{groupTotal} on</span>
              {groupOpen && <button type="button" className="presetBtn" onClick={() => setOpenModules(o => { const n={...o}; group.modules.forEach(m=>{n[m.key]=true;}); return n; })}>Expand All</button>}
              {groupOpen && <button type="button" className="presetBtn" onClick={() => setOpenModules(o => { const n={...o}; group.modules.forEach(m=>{n[m.key]=false;}); return n; })}>Collapse All</button>}
              <button type="button" className="presetBtn" onClick={() => setGroup(group, true)}>Allow Group</button>
              <button type="button" className="presetBtn" onClick={() => setGroup(group, false)}>Clear Group</button>
            </div>
            {groupOpen && (
              <div className="permGrid widePermGrid">
                <div className="permGridHeader widePermHeader">
                  <div className="permSectionLabel">Sub-module / field</div>
                  {ACTIONS.map(a => <div key={a} className="permActionLabel">{a}</div>)}
                  <div className="permActionLabel">All</div>
                </div>
                {group.modules.map(module => {
                  const allOn = ACTIONS.every(a => perms[module.key]?.[a]);
                  const fieldsOpen = !!openModules[module.key];
                  return (
                    <React.Fragment key={module.key}>
                      <div className="permGridRow widePermRow">
                        <div className="permSectionName">
                          <div className="permModuleTitle">
                            <button type="button" className="permExpandBtn" onClick={() => setOpenModules(o => ({ ...o, [module.key]: !fieldsOpen }))}>{fieldsOpen ? "−" : "+"}</button>
                            <strong>{module.label}</strong>
                          </div>
                          <span>{module.fields.length} fields</span>
                        </div>
                        {ACTIONS.map(a => (
                          <div key={a} className="permToggleCell">
                            <button type="button" className={`permToggle ${perms[module.key]?.[a] ? "permOn" : "permOff"}`} onClick={() => togglePerm(module.key, a)}>
                              {perms[module.key]?.[a] ? "ON" : "OFF"}
                            </button>
                          </div>
                        ))}
                        <div className="permToggleCell">
                          <button type="button" className={`permToggle permToggleAll ${allOn ? "permOn" : "permOff"}`} onClick={() => setModule(module.key, !allOn)}>
                            {allOn ? "ALL" : "NONE"}
                          </button>
                        </div>
                      </div>
                      {fieldsOpen && module.fields.map(field => {
                        const k = fieldKey(module.key, field);
                        const fa = ACTIONS.every(a => perms[k]?.[a]);
                        return (
                          <div key={k} className="permGridRow widePermRow permFieldRow">
                            <div className="permSectionName"><strong>{field}</strong><span>{module.label}</span></div>
                            {ACTIONS.map(a => (
                              <div key={a} className="permToggleCell">
                                <button type="button" className={`permToggle ${perms[k]?.[a] ? "permOn" : "permOff"}`} onClick={() => togglePerm(k, a)}>
                                  {perms[k]?.[a] ? "ON" : "OFF"}
                                </button>
                              </div>
                            ))}
                            <div className="permToggleCell">
                              <button type="button" className={`permToggle permToggleAll ${fa ? "permOn" : "permOff"}`} onClick={() => setModule(k, !fa)}>
                                {fa ? "ALL" : "NONE"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function isSessionGone(session) {
  if (!session?.is_active) return true;
  if (session?.expires_at) {
    return new Date(session.expires_at + (session.expires_at.endsWith("Z") ? "" : "Z")) < new Date();
  }
  return false;
}

function SessionCapacityBar({ activeSessions, maxSessions }) {
  const unlimited = Number(maxSessions) === 0;
  const safeMax = unlimited ? Math.max(activeSessions, 5) : Math.max(Number(maxSessions) || 1, 1);
  const used = Math.min(activeSessions, safeMax);
  const pct = unlimited ? Math.min((activeSessions / safeMax) * 100, 100) : Math.min((activeSessions / safeMax) * 100, 100);

  return (
    <div style={{ minWidth: 120 }}>
      <div
        style={{
          position: "relative",
          height: 8,
          borderRadius: 999,
          overflow: "hidden",
          background: "#17191f",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, #16a34a 0%, #eab308 55%, #dc2626 100%)",
            opacity: 0.28,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: "linear-gradient(90deg, #22c55e 0%, #f59e0b 58%, #ef4444 100%)",
            borderRadius: 999,
            transition: "width 0.25s ease",
          }}
        />
        {!unlimited &&
          Array.from({ length: Math.max(safeMax - 1, 0) }, (_, idx) => (
            <span
              key={idx}
              style={{
                position: "absolute",
                left: `${((idx + 1) / safeMax) * 100}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: "rgba(255,255,255,0.42)",
              }}
            />
          ))}
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted,#888)", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{activeSessions} active</span>
        <span>{unlimited ? "∞ max" : `${used}/${safeMax}`}</span>
      </div>
    </div>
  );
}

function CompactSessionCapacityBar({ activeSessions, maxSessions }) {
  const unlimited = Number(maxSessions) === 0;
  const safeMax = unlimited ? Math.max(activeSessions, 5) : Math.max(Number(maxSessions) || 1, 1);
  const pct = Math.min((activeSessions / safeMax) * 100, 100);

  return (
    <div style={{ width: "100%", minWidth: 120 }}>
      <div
        style={{
          position: "relative",
          height: 10,
          borderRadius: 999,
          overflow: "hidden",
          background: "#17191f",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, #16a34a 0%, #eab308 55%, #dc2626 100%)", opacity: 0.28 }} />
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "linear-gradient(90deg, #22c55e 0%, #f59e0b 58%, #ef4444 100%)", borderRadius: 999 }} />
        {!unlimited &&
          Array.from({ length: Math.max(safeMax - 1, 0) }, (_, idx) => (
            <span
              key={idx}
              style={{
                position: "absolute",
                left: `${((idx + 1) / safeMax) * 100}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: "rgba(255,255,255,0.42)",
              }}
            />
          ))}
      </div>
      <div style={{ marginTop: 5, fontSize: 11, color: "var(--muted,#888)", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>{activeSessions} active</span>
        <span>{unlimited ? "∞ max" : `${activeSessions}/${safeMax}`}</span>
      </div>
    </div>
  );
}

const presetFieldWrapStyle = { minWidth: 0 };
const presetInputStyle = {
  width: "100%",
  minWidth: 0,
  background: "var(--panel2,#161616)",
  color: "var(--text,#fff)",
  border: "1px solid var(--line,rgba(255,255,255,.08))",
  borderRadius: 10,
  padding: "11px 12px",
  outline: "none",
  fontSize: 14,
  lineHeight: 1.35,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.02)",
};
const presetLabelStyle = {
  display: "block",
  margin: "0 0 6px 2px",
  fontSize: 11,
  color: "var(--muted,#b4b4b8)",
  lineHeight: 1.2,
};

// ── TAB 1: Role Presets ────────────────────────────────────────────────────

function PresetsTab() {
  const [presets, setPresets] = useState([]);
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingBuiltin, setEditingBuiltin] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", perms: emptyPerms() });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  function load() {
    adminApi.presets().then(setPresets).catch(e => setMsg(String(e.message || e)));
  }
  useEffect(() => { load(); }, []);

  function startCreate() {
    setForm({ name: "", description: "", perms: emptyPerms() });
    setCreating(true);
    setEditingId(null);
    setEditingBuiltin(false);
    setExpandedId(null);
  }

  function startEdit(preset) {
    setForm({ name: preset.name, description: preset.description || "", perms: parsePerms(preset.permissions_json) });
    setEditingId(preset.id);
    setEditingBuiltin(preset.is_builtin);
    setCreating(false);
    setExpandedId(null);
  }

  function applyBuiltin(roleName) {
    setForm(f => ({ ...f, perms: clone(BUILTIN_PRESETS[roleName] || emptyPerms()) }));
  }

  function cancel() { setCreating(false); setEditingId(null); setEditingBuiltin(false); }

  async function savePreset() {
    if (!form.name.trim()) { setMsg("Preset name is required."); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        permissions_json: JSON.stringify(form.perms),
      };
      if (editingId) await adminApi.updatePreset(editingId, payload);
      else await adminApi.createPreset(payload);
      setMsg(editingId ? "Preset updated." : "Preset created.");
      cancel(); load();
    } catch (e) { setMsg(String(e.message || e)); }
    finally { setSaving(false); }
  }

  async function resetBuiltin(preset) {
    if (!confirm(`Reset "${preset.name}" back to its original default permissions? All your edits will be lost.`)) return;
    try { await adminApi.resetPreset(preset.id); setMsg(`"${preset.name}" reset to defaults.`); load(); }
    catch (e) { setMsg(String(e.message || e)); }
  }

  async function deletePreset(preset) {
    if (!confirm(`Delete preset "${preset.name}"? This cannot be undone.`)) return;
    try { await adminApi.deletePreset(preset.id); setMsg("Preset deleted."); load(); }
    catch (e) { setMsg(String(e.message || e)); }
  }

  const total = MODULE_KEYS.length * ACTIONS.length;
  const editorTitle = editingBuiltin
    ? `Edit Built-in Preset: ${form.name.charAt(0).toUpperCase() + form.name.slice(1)}`
    : editingId
      ? "Edit Custom Preset"
      : "Create Custom Preset";

  function renderPresetEditor(inline = false) {
    return (
      <div style={inline ? { borderTop: "1px solid var(--border,#2a2d35)", padding: "14px 16px 18px" } : undefined}>
        {inline && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{editorTitle}</div>}
        {editingBuiltin && (
          <div style={{ background: "#1e3a5f22", border: "1px solid #2563eb44", borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 12, color: "#93c5fd" }}>
            ℹ️ You are editing a built-in preset. Name locked. Use <strong>Reset</strong> to restore defaults.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(320px,2fr)", gap: 12, marginBottom: 16 }}>
          <div style={presetFieldWrapStyle}>
            <label className="fieldLabel" style={presetLabelStyle}>Preset Name {!editingBuiltin && "*"}</label>
            <input
              placeholder="e.g. Floor Manager, Cameraman, Finance Lead…"
              value={form.name}
              disabled={editingBuiltin}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={editingBuiltin ? { ...presetInputStyle, opacity: 0.55, cursor: "not-allowed", background: "#2a2d33", color: "#d4d4d8" } : presetInputStyle}
            />
          </div>
          <div style={presetFieldWrapStyle}>
            <label className="fieldLabel" style={presetLabelStyle}>Description</label>
            <input
              placeholder="Short description of this role's responsibilities…"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={presetInputStyle}
            />
          </div>
        </div>

        <div className="savedRolesPanel">
          <div className="savedRolesTitle">Start from a built-in template</div>
          <div className="presetRow">
            {ROLE_NAMES.map(r => (
              <button key={r} type="button" className="presetBtn" onClick={() => applyBuiltin(r)}>
                Copy {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
            <button type="button" className="presetBtn" onClick={() => setForm(f => ({ ...f, perms: allPerms(false) }))}>Clear All</button>
            <button type="button" className="presetBtn" onClick={() => setForm(f => ({ ...f, perms: allPerms(true) }))}>Allow All</button>
          </div>
        </div>

        <PermissionGrid perms={form.perms} onChange={perms => setForm(f => ({ ...f, perms }))} />

        <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <button className="primaryBtn" type="button" onClick={savePreset} disabled={saving}>
            {saving ? "Saving…" : (editingId ? "Update Preset" : "Save Preset")}
          </button>
          <button className="ghostBtn" type="button" onClick={cancel}>Cancel</button>
          <span className="helperText" style={{ marginLeft: 8 }}>
            {countPerms(form.perms)}/{total} permissions enabled
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {msg && (
        <div className="messageBar" style={{ marginBottom: 12 }}>
          {msg}
          <button type="button" style={{ float:"right",background:"none",border:"none",color:"#fff",cursor:"pointer" }} onClick={() => setMsg("")}>✕</button>
        </div>
      )}

      {/* ── Top bar ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span className="helperText">{presets.length} role preset(s) · Built-in presets can be edited (use Reset to restore defaults)</span>
        {!creating && !editingId && (
          <button className="primaryBtn" type="button" onClick={startCreate}>+ Create Custom Preset</button>
        )}
      </div>

      {/* ── Preset cards ── */}
      <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
        {presets.map(preset => {
          const p = parsePerms(preset.permissions_json);
          const active = countPerms(p);
          const isExpanded = expandedId === preset.id;
          const isEditing = editingId === preset.id;

          return (
            <div key={preset.id} style={{ border: `1px solid ${isEditing ? "#e11d48" : "var(--border,#333)"}`, borderRadius: 10, overflow: "hidden", background: "var(--surface2,#1e2228)" }}>

              {/* Card header row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px 10px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{preset.name.charAt(0).toUpperCase() + preset.name.slice(1)}</strong>
                    {preset.is_builtin && (
                      <span style={{ fontSize: 10, background: "#1e3a5f", color: "#60a5fa", borderRadius: 99, padding: "2px 8px", fontWeight: 700, letterSpacing: "0.03em" }}>
                        BUILT-IN
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: "var(--muted,#777)" }}>{active}/{total} permissions</span>
                  </div>
                  {preset.description && (
                    <div style={{ fontSize: 12, color: "var(--muted,#888)", marginTop: 3 }}>{preset.description}</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="ghostBtn compactBtn" type="button" onClick={() => setExpandedId(isExpanded ? null : preset.id)}>
                    {isExpanded ? "Hide Matrix" : "View Matrix"}
                  </button>
                  {!isEditing && (
                    <button className="ghostBtn compactBtn" type="button" onClick={() => startEdit(preset)}>
                      Edit
                    </button>
                  )}
                  {preset.is_builtin && !isEditing && (
                    <button className="ghostBtn compactBtn" type="button" onClick={() => resetBuiltin(preset)}>
                      Reset
                    </button>
                  )}
                  {!preset.is_builtin && !isEditing && (
                    <button className="dangerBtn compactBtn" type="button" onClick={() => deletePreset(preset)}>
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Permission group bars — fixed grid, no overlap */}
              <div style={{ padding: "0 16px 14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "8px 12px" }}>
                  {PERMISSION_GROUPS.map(group => {
                    const gKeys = group.modules.flatMap(m => [m.key, ...m.fields.map(f => fieldKey(m.key, f))]);
                    const gActive = gKeys.reduce((s, k) => s + ACTIONS.filter(a => p[k]?.[a]).length, 0);
                    const gTotal = gKeys.length * ACTIONS.length;
                    const pct = gTotal ? Math.round(gActive / gTotal * 100) : 0;
                    const barColor = pct === 100 ? "#22c55e" : pct > 0 ? "#3b82f6" : "#2d3748";
                    return (
                      <div key={group.title}>
                        {/* Label */}
                        <div style={{ fontSize: 10, color: "var(--muted,#777)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {group.title}
                        </div>
                        {/* Bar track */}
                        <div style={{ height: 5, background: "#1a1d23", borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99, transition: "width 0.3s" }} />
                        </div>
                        {/* Pct label */}
                        <div style={{ fontSize: 10, color: pct === 100 ? "#22c55e" : pct > 0 ? "#60a5fa" : "var(--muted,#555)", marginTop: 3, fontWeight: pct > 0 ? 600 : 400 }}>
                          {pct}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Expanded matrix (read-only view) */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--border,#2a2d35)", padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, color: "var(--muted,#888)", marginBottom: 10 }}>
                    Read-only view. Click <strong>Edit</strong> above to modify this preset.
                  </div>
                  <PermissionGrid perms={p} onChange={() => {}} />
                </div>
              )}

              {isEditing && renderPresetEditor(true)}
            </div>
          );
        })}
      </div>

      {/* ── Create / Edit form ── */}
      {creating && <Card title={editorTitle}>{renderPresetEditor(false)}</Card>}
    </div>
  );
}

// ── TAB 2: Users (Create + List) ───────────────────────────────────────────

function EditUserModal({ open, user, presets, onClose, onSave }) {
  const [form, setForm] = useState({ password: "", role: "operations", is_active: true, perms: emptyPerms(), max_sessions: 5 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setForm({ password: "", role: user.role || "operations", is_active: user.is_active, perms: parsePerms(user.permissions_json), max_sessions: user.max_sessions ?? 5 });
    }
  }, [open, user]);

  function applyPreset(name) {
    // Try DB presets first, fallback to builtin
    const dbPreset = presets.find(p => p.name === name);
    const p = dbPreset ? parsePerms(dbPreset.permissions_json) : clone(BUILTIN_PRESETS[name] || emptyPerms());
    setForm(f => ({ ...f, role: name, perms: p }));
  }

  async function handleSave() {
    setSaving(true);
    const payload = { role: form.role, is_active: form.is_active, permissions_json: JSON.stringify(form.perms), max_sessions: Number(form.max_sessions) };
    if (form.password.trim()) payload.password = form.password;
    try { await onSave(user.id, payload); } finally { setSaving(false); }
  }

  if (!open || !user) return null;
  const allPresetNames = [...new Set([...ROLE_NAMES, ...presets.filter(p => !p.is_builtin).map(p => p.name)])];

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard editUserModal" onClick={e => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>Edit User: {user.username}</h2>
          <button className="ghostBtn modalCloseBtn" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="editUserForm">
          <div className="editUserRow">
            <div>
              <label className="fieldLabel">New Password (blank = keep)</label>
              <input type="password" placeholder="New password…" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <label className="fieldLabel">Role Label</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLE_NAMES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="fieldLabel">Max Simultaneous Logins</label>
              <select value={form.max_sessions} onChange={e => setForm(f => ({ ...f, max_sessions: Number(e.target.value) }))}>
                <option value={0}>Unlimited</option>
                {[1,2,3,4,5,8,10].map(n => <option key={n} value={n}>{n} session{n>1?"s":""}</option>)}
              </select>
            </div>
            <div>
              <label className="qcCheckLabel" style={{ marginTop: 22 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                <span>Active</span>
              </label>
            </div>
          </div>

          <div className="savedRolesPanel">
            <div className="savedRolesTitle">Apply a Role Preset</div>
            <div className="helperText">Copies all permissions from the selected preset into this user's matrix.</div>
            <div className="presetRow">
              {allPresetNames.map(name => (
                <button key={name} type="button" className={`presetBtn ${form.role === name ? "presetActive" : ""}`} onClick={() => applyPreset(name)}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <PermissionGrid perms={form.perms} onChange={perms => setForm(f => ({ ...f, perms }))} />
        </div>
        <div className="modalFooter">
          <button className="ghostBtn" type="button" onClick={onClose}>Cancel</button>
          <button className="primaryBtn" type="button" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [presets, setPresets] = useState([]);
  const [msg, setMsg] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [createForm, setCreateForm] = useState({ username: "", password: "", role: "operations", is_active: true, max_sessions: 5, perms: clone(BUILTIN_PRESETS.operations) });

  const searched = useSearch(users, userSearch);
  const pg = usePagination(searched, 10);

  function load() {
    adminApi.users().then(setUsers).catch(e => setMsg(String(e.message || e)));
    adminApi.sessions().then(setSessions).catch(() => {});
    adminApi.presets().then(setPresets).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function applyCreatePreset(name) {
    const dbPreset = presets.find(p => p.name === name);
    const p = dbPreset ? parsePerms(dbPreset.permissions_json) : clone(BUILTIN_PRESETS[name] || emptyPerms());
    setCreateForm(f => ({ ...f, role: name, perms: p }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!createForm.username.trim() || !createForm.password.trim()) { setMsg("Username and password required."); return; }
    try {
      await adminApi.createUser({ username: createForm.username.trim(), password: createForm.password, role: createForm.role, is_active: createForm.is_active, max_sessions: Number(createForm.max_sessions), permissions_json: JSON.stringify(createForm.perms) });
      setCreateForm({ username: "", password: "", role: "operations", is_active: true, max_sessions: 5, perms: clone(BUILTIN_PRESETS.operations) });
      setMsg("User created.");
      load();
    } catch (e) { setMsg(String(e.message || e)); }
  }

  async function handleEditSave(id, payload) {
    try { await adminApi.updateUser(id, payload); setMsg("User updated."); setEditOpen(false); load(); }
    catch (e) { setMsg(String(e.message || e)); }
  }

  async function toggleActive(user) {
    try { await adminApi.updateUser(user.id, { is_active: !user.is_active }); load(); }
    catch (e) { setMsg(String(e.message || e)); }
  }

  async function remove(user) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try { await adminApi.deleteUser(user.id); setMsg(`User "${user.username}" deleted.`); load(); }
    catch (e) { setMsg(String(e.message || e)); }
  }

  const total = MODULE_KEYS.length * ACTIONS.length;
  const allPresetNames = [...new Set([...ROLE_NAMES, ...presets.filter(p => !p.is_builtin).map(p => p.name)])];
  const activeSessionCountByUser = sessions.reduce((acc, session) => {
    if (!isSessionGone(session)) acc[session.user_id] = (acc[session.user_id] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {msg && <div className="messageBar" style={{ marginBottom: 12 }}>{msg}<button type="button" style={{ float:"right",background:"none",border:"none",color:"#fff",cursor:"pointer" }} onClick={() => setMsg("")}>✕</button></div>}

      <Card title="Create New User">
        <form onSubmit={handleCreate}>
          <div className="createUserTopRow">
            <div>
              <label className="fieldLabel">Username</label>
              <input placeholder="Username" value={createForm.username} onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))} required />
            </div>
            <div>
              <label className="fieldLabel">Password</label>
              <input type="password" placeholder="Password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <div>
              <label className="fieldLabel">Role Label</label>
              <select value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}>
                {ROLE_NAMES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="fieldLabel">Max Simultaneous Logins</label>
              <select value={createForm.max_sessions} onChange={e => setCreateForm(f => ({ ...f, max_sessions: Number(e.target.value) }))}>
                <option value={0}>Unlimited</option>
                {[1,2,3,4,5,8,10].map(n => <option key={n} value={n}>{n} session{n>1?"s":""}</option>)}
              </select>
            </div>
            <div>
              <label className="qcCheckLabel" style={{ marginTop: 22 }}>
                <input type="checkbox" checked={createForm.is_active} onChange={e => setCreateForm(f => ({ ...f, is_active: e.target.checked }))} />
                <span>Active</span>
              </label>
            </div>
          </div>

          <div className="savedRolesPanel">
            <div className="savedRolesTitle">Apply a Role Preset</div>
            <div className="helperText">Click a preset to load its full permission matrix below.</div>
            <div className="presetRow">
              {allPresetNames.map(name => (
                <button key={name} type="button" className={`presetBtn ${createForm.role === name ? "presetActive" : ""}`} onClick={() => applyCreatePreset(name)}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <PermissionGrid perms={createForm.perms} onChange={perms => setCreateForm(f => ({ ...f, perms }))} />
          <div style={{ marginTop: 16 }}>
            <button className="primaryBtn" type="submit">Create User</button>
          </div>
        </form>
      </Card>

      <Card title="Existing Users">
        <div className="listToolbar">
          <SearchBar value={userSearch} onChange={v => { setUserSearch(v); pg.setPage(1); }} suggestions={buildSuggestions(users)} placeholder="Search users…" />
          <span className="helperText">{searched.length} user(s)</span>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Username</th><th>Role</th><th>Session Capacity</th><th>Status</th><th>Permissions</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageData.map(user => {
                const p = parsePerms(user.permissions_json);
                const active = countPerms(p);
                const activeSessions = activeSessionCountByUser[user.id] || 0;
                return (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td><strong>{user.username}</strong></td>
                    <td><span className={`roleBadge role-${user.role}`}>{user.role}</span></td>
                    <td>
                      <SessionCapacityBar activeSessions={activeSessions} maxSessions={user.max_sessions ?? 5} />
                    </td>
                    <td><span className={`statusBadge ${user.is_active ? "status-returned" : "status-cancelled"}`}>{user.is_active ? "Active" : "Disabled"}</span></td>
                    <td>
                      <div className="permSummaryBar"><div className="permSummaryFill" style={{ width: `${total ? active/total*100 : 0}%` }} /></div>
                      <span className="helperText">{active}/{total}</span>
                    </td>
                    <td className="actionCell">
                      <button className="ghostBtn compactBtn" type="button" onClick={() => { setEditUser(user); setEditOpen(true); }}>Edit</button>
                      <button className="ghostBtn compactBtn" type="button" onClick={() => toggleActive(user)}>{user.is_active ? "Disable" : "Enable"}</button>
                      <button className="dangerBtn compactBtn" type="button" onClick={() => remove(user)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination total={pg.total} page={pg.page} pageSize={pg.pageSize} onPageChange={pg.setPage} onPageSizeChange={pg.setPageSize} />
      </Card>

      <EditUserModal open={editOpen} user={editUser} presets={presets} onClose={() => setEditOpen(false)} onSave={handleEditSave} />
    </div>
  );
}

// ── TAB 3: User Activity (Sessions + Audit) ────────────────────────────────

function ActivityTab() {
  const [sessions, setSessions] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const auditPg = usePagination(useSearch(auditLogs, auditSearch), 25);

  function loadSessions() {
    setLoading(true);
    adminApi.sessions()
      .then(data => { setSessions(data); setLoading(false); })
      .catch(e => { setMsg(String(e.message || e)); setLoading(false); });
  }
  function loadUsers() { adminApi.users().then(setUsers).catch(() => {}); }
  function loadAudit() { systemApi.auditLogs().then(setAuditLogs).catch(() => {}); }
  useEffect(() => { loadSessions(); loadAudit(); loadUsers(); }, []);

  async function revoke(id, label) {
    if (!confirm(`Revoke session for ${label}?`)) return;
    try { await adminApi.revokeSession(id); setMsg("Session revoked."); loadSessions(); }
    catch (e) { setMsg(String(e.message || e)); }
  }
  async function revokeAll(userId, username) {
    if (!confirm(`Revoke ALL active sessions for "${username}"?`)) return;
    try { const r = await adminApi.revokeUserSessions(userId); setMsg(`Revoked ${r.revoked} session(s) for ${username}.`); loadSessions(); }
    catch (e) { setMsg(String(e.message || e)); }
  }

  function fmt(iso) {
    if (!iso) return "–";
    return new Date(iso + (iso.endsWith("Z") ? "" : "Z")).toLocaleString();
  }
  function ago(iso) {
    if (!iso) return "–";
    const sec = Math.floor((Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z"))) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
    return `${Math.floor(sec/86400)}d ago`;
  }
  function deviceIcon(t) { return t === "Mobile" ? "📱" : t === "Tablet" ? "📟" : "💻"; }

  const filtered = sessions.filter(s => {
    const q = sessionSearch.toLowerCase();
    const matchQuery = !q || [s.username, s.ip_address, s.os, s.browser, s.device_type, s.device_id].some(v => (v || "").toLowerCase().includes(q));
    const matchUser = !selectedUserId || s.user_id === selectedUserId;
    return matchQuery && matchUser;
  });
  const active = filtered.filter(s => !isSessionGone(s));
  const inactive = filtered.filter(s => isSessionGone(s));

  // Per-user active count for summary chips
  const userById = users.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});
  const byUser = {};
  active.forEach(s => {
    if (!byUser[s.user_id]) {
      byUser[s.user_id] = {
        username: s.username,
        count: 0,
        maxSessions: userById[s.user_id]?.max_sessions ?? 5,
      };
    }
    byUser[s.user_id].count++;
  });
  return (
    <div>
      {msg && <div className="messageBar" style={{ marginBottom: 12 }}>{msg}<button type="button" style={{ float:"right",background:"none",border:"none",color:"#fff",cursor:"pointer" }} onClick={() => setMsg("")}>✕</button></div>}

      <Card title="Active Sessions">
        {/* Info banner */}
        <div style={{ background: "var(--surface2,#1e2228)", border: "1px solid #2563eb44", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--muted,#888)" }}>
          ℹ️ Sessions are tracked from the first login after this feature was deployed. If a user shows 0 sessions, they need to <strong style={{ color: "#93c5fd" }}>log out and log back in</strong> once to register their session.
        </div>

        {/* Per-user summary chips */}
        {Object.values(byUser).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {Object.entries(byUser).map(([uid, info]) => (
              <div
                key={uid}
                style={{
                  width: "100%",
                  background: Number(uid) === selectedUserId ? "rgba(229,9,47,.12)" : "var(--surface2,#23272e)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  display: "grid",
                  gridTemplateColumns: "minmax(120px,180px) minmax(90px,120px) minmax(220px,1fr) auto auto",
                  alignItems: "center",
                  gap: 14,
                  fontSize: 13,
                  border: Number(uid) === selectedUserId ? "1px solid rgba(229,9,47,.35)" : "1px solid rgba(255,255,255,.06)",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{info.username}</span>
                <span style={{ background: "#2563eb", color: "#fff", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, justifySelf: "start" }}>{info.count} active</span>
                <CompactSessionCapacityBar activeSessions={info.count} maxSessions={info.maxSessions} />
                <button
                  className="ghostBtn compactBtn"
                  type="button"
                  style={{ fontSize: 11, padding: "7px 12px", whiteSpace: "nowrap" }}
                  onClick={() => setSelectedUserId(Number(uid) === selectedUserId ? null : Number(uid))}
                >
                  {Number(uid) === selectedUserId ? "Selected" : "Select"}
                </button>
                <button
                  className="primaryBtn compactBtn"
                  type="button"
                  style={{ fontSize: 11, padding: "7px 12px", whiteSpace: "nowrap" }}
                  onClick={() => revokeAll(Number(uid), info.username)}
                >
                  Kick All
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="listToolbar" style={{ marginBottom: 12 }}>
          <SearchBar
            value={sessionSearch}
            onChange={v => setSessionSearch(v)}
            suggestions={buildSuggestions(sessions)}
            placeholder="Search by user, device ID, IP, OS, browser…"
          />
          <span className="helperText">{active.length} active · {inactive.length} expired/revoked</span>
          <button className="ghostBtn compactBtn" type="button" onClick={loadSessions}>↻ Refresh</button>
        </div>

        {loading ? <div className="helperText" style={{ padding: 16 }}>Loading…</div> : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>User</th><th>Device ID</th><th>IP Address</th><th>Device</th><th>OS</th><th>Browser</th><th>Logged In</th><th>Last Active</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                {active.length === 0 && inactive.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign:"center", color:"var(--muted,#888)", padding: 24 }}>No sessions found. Users need to log in once to register their session.</td></tr>
                )}
                {active.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.username || `uid:${s.user_id}`}</strong></td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.device_id || "–"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.ip_address || "–"}</td>
                    <td>{deviceIcon(s.device_type)} {s.device_type || "Desktop"}</td>
                    <td>{s.os || "–"}</td>
                    <td>{s.browser || "–"}</td>
                    <td style={{ fontSize: 12 }}>{fmt(s.login_at)}</td>
                    <td style={{ fontSize: 12 }}>{ago(s.last_active_at)}</td>
                    <td><span className="statusBadge status-returned">Active</span></td>
                    <td className="actionCell"><button className="dangerBtn compactBtn" type="button" onClick={() => revoke(s.id, s.username || `uid:${s.user_id}`)}>Revoke</button></td>
                  </tr>
                ))}
                {inactive.slice(0, 30).map(s => (
                  <tr key={s.id} style={{ opacity: 0.4 }}>
                    <td>{s.username || `uid:${s.user_id}`}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.device_id || "–"}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{s.ip_address || "–"}</td>
                    <td>{deviceIcon(s.device_type)} {s.device_type || "Desktop"}</td>
                    <td>{s.os || "–"}</td>
                    <td>{s.browser || "–"}</td>
                    <td style={{ fontSize: 12 }}>{fmt(s.login_at)}</td>
                    <td style={{ fontSize: 12 }}>{ago(s.last_active_at)}</td>
                    <td><span className="statusBadge status-cancelled">{s.is_active ? "Expired" : "Revoked"}</span></td>
                    <td>–</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Audit Log">
        <div className="listToolbar">
          <SearchBar value={auditSearch} onChange={v => { setAuditSearch(v); auditPg.setPage(1); }} suggestions={buildSuggestions(auditLogs)} placeholder="Search by user, action, entity…" />
          <span className="helperText">{auditLogs.length} entries</span>
          <button className="ghostBtn compactBtn" type="button" onClick={loadAudit}>↻ Refresh</button>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>ID</th><th>User</th><th>Action</th><th>Entity</th><th>Entity ID</th></tr></thead>
            <tbody>
              {auditPg.pageData.map(log => (
                <tr key={log.id}>
                  <td>{log.id}</td><td>{log.username}</td><td>{log.action}</td><td>{log.entity_type}</td><td>{log.entity_id || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={auditPg.total} page={auditPg.page} pageSize={auditPg.pageSize} onPageChange={auditPg.setPage} onPageSizeChange={auditPg.setPageSize} />
      </Card>
    </div>
  );
}

// ── Main AdminPage with tabs ────────────────────────────────────────────────

const TABS = [
  { key: "presets",   label: "Role Presets" },
  { key: "users",     label: "Users" },
  { key: "activity",  label: "User Activity" },
];

export default function AdminPage() {
  const [tab, setTab] = useState("presets");

  if (getRole() !== "admin") {
    return <div className="page"><div className="messageBar">Only admin can manage users.</div></div>;
  }

  return (
    <div className="page">
      <h1 className="pageTitle">Admin User Management</h1>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: "2px solid var(--border,#333)", marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 28px",
              background: "none",
              border: "none",
              borderBottom: tab === t.key ? "2px solid #e11d48" : "2px solid transparent",
              marginBottom: -2,
              cursor: "pointer",
              fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? "#f1f5f9" : "var(--muted,#888)",
              fontSize: 15,
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "presets"  && <PresetsTab />}
      {tab === "users"    && <UsersTab />}
      {tab === "activity" && <ActivityTab />}
    </div>
  );
}
