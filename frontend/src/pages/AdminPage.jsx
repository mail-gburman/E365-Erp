import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { adminApi, systemApi } from "../api";
import { getRole } from "../auth";

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

const MODULES = PERMISSION_GROUPS.flatMap(group => group.modules);
const MODULE_KEYS = MODULES.flatMap(module => [module.key, ...module.fields.map(field => fieldPermissionKey(module.key, field))]);
const ROLE_NAMES = ["admin", "producer", "operations", "store", "accounts", "qc", "viewer"];

function fieldPermissionKey(moduleKey, field) {
  return `${moduleKey}.${field.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function makeActionSet(enabledActions = []) {
  return Object.fromEntries(ACTIONS.map(action => [action, enabledActions.includes(action)]));
}

function allPermissions(value) {
  return Object.fromEntries(MODULE_KEYS.map(key => [key, Object.fromEntries(ACTIONS.map(action => [action, value]))]));
}

function buildPreset(config = {}) {
  const base = allPermissions(false);
  for (const [moduleKey, actions] of Object.entries(config)) {
    if (moduleKey === "*") {
      MODULE_KEYS.forEach(key => { base[key] = makeActionSet(actions); });
    } else {
      MODULE_KEYS.filter(key => key === moduleKey || key.startsWith(`${moduleKey}.`)).forEach(key => {
        base[key] = makeActionSet(actions);
      });
    }
  }
  return base;
}

const ROLE_PRESETS = {
  admin: allPermissions(true),
  producer: buildPreset({
    dashboard: ["view", "export"],
    calendar: ["view", "add", "edit", "export"],
    projects: ["view", "add", "edit", "export", "approve"],
    bookings: ["view", "add", "edit", "export", "approve"],
    resources: ["view", "add", "edit"],
    job_cards: ["view", "add", "edit", "export"],
    planned_shoots: ["view", "edit", "approve"],
    clients: ["view", "add", "edit"],
    uploads: ["view", "add", "download", "export"],
    audit: ["view", "export"],
  }),
  operations: buildPreset({
    dashboard: ["view"],
    calendar: ["view", "add", "edit", "export"],
    projects: ["view", "add", "edit"],
    bookings: ["view", "add", "edit", "export"],
    resources: ["view", "add", "edit"],
    job_cards: ["view", "add", "edit", "export"],
    planned_shoots: ["view", "edit", "approve"],
    masters: ["view"],
    equipment_master: ["view"],
    accessories_master: ["view"],
    warehouses: ["view"],
    clients: ["view", "add", "edit"],
    vendors: ["view"],
    manpower: ["view", "add", "edit"],
    dispatch: ["view", "add", "edit"],
    returns: ["view", "add", "edit"],
    damages: ["view", "add", "edit"],
    qc: ["view", "add", "edit"],
    papers: ["view", "add", "edit", "export"],
    services: ["view", "add", "edit"],
    uploads: ["view", "add", "download"],
    audit: ["view"],
  }),
  store: buildPreset({
    dashboard: ["view"],
    calendar: ["view"],
    bookings: ["view"],
    resources: ["view", "add", "edit"],
    job_cards: ["view", "export"],
    masters: ["view", "add", "edit"],
    equipment_master: ["view", "add", "edit"],
    accessories_master: ["view", "add", "edit"],
    warehouses: ["view", "add", "edit"],
    manpower: ["view"],
    dispatch: ["view", "add", "edit"],
    returns: ["view", "add", "edit"],
    damages: ["view", "add", "edit"],
    qc: ["view", "add", "edit"],
    papers: ["view", "export"],
    uploads: ["view", "add", "download"],
  }),
  accounts: buildPreset({
    dashboard: ["view", "export"],
    calendar: ["view"],
    projects: ["view", "export"],
    bookings: ["view", "export"],
    job_cards: ["view", "export"],
    clients: ["view", "add", "edit"],
    vendors: ["view", "add", "edit"],
    procurement: ["view", "add", "edit", "approve", "export"],
    accounts: ["view", "add", "export"],
    papers: ["view", "export"],
    uploads: ["view", "download", "export"],
    audit: ["view", "export"],
  }),
  qc: buildPreset({
    dashboard: ["view"],
    calendar: ["view"],
    bookings: ["view"],
    resources: ["view"],
    equipment_master: ["view", "edit"],
    accessories_master: ["view", "edit"],
    dispatch: ["view"],
    returns: ["view", "add", "edit"],
    damages: ["view", "add", "edit"],
    qc: ["view", "add", "edit", "approve", "export"],
    papers: ["view", "add", "edit", "export"],
    services: ["view", "add", "edit"],
    uploads: ["view", "add", "download"],
  }),
  viewer: buildPreset({
    dashboard: ["view"],
    calendar: ["view"],
    projects: ["view"],
    bookings: ["view"],
    resources: ["view"],
    job_cards: ["view"],
    masters: ["view"],
    equipment_master: ["view"],
    accessories_master: ["view"],
    warehouses: ["view"],
    clients: ["view"],
    vendors: ["view"],
    manpower: ["view"],
    papers: ["view"],
    uploads: ["view"],
  }),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyPerms() {
  return allPermissions(false);
}

function normalizePerms(input) {
  const out = emptyPerms();
  if (!input || typeof input !== "object") return out;
  MODULE_KEYS.forEach(key => {
    if (input[key] && typeof input[key] === "object") {
      ACTIONS.forEach(action => {
        out[key][action] = !!input[key][action];
      });
    }
  });
  return out;
}

function parsePerms(json) {
  try {
    return normalizePerms(typeof json === "string" ? JSON.parse(json) : json);
  } catch {
    return emptyPerms();
  }
}

function countPerms(perms) {
  return MODULE_KEYS.reduce((sum, key) => sum + ACTIONS.filter(action => perms[key]?.[action]).length, 0);
}

function RolePresetBar({ currentRole, onApply }) {
  return (
    <div className="savedRolesPanel">
      <div className="savedRolesTitle">Saved Role Templates</div>
      <div className="helperText">Copy a saved role first, then edit every sub-module permission below for that user.</div>
      <div className="presetRow">
        {ROLE_NAMES.map(role => (
          <button
            key={role}
            type="button"
            className={`presetBtn ${currentRole === role ? "presetActive" : ""}`}
            onClick={() => onApply(role)}
          >
            Copy {role.charAt(0).toUpperCase() + role.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PermissionGrid({ perms, onChange }) {
  const [openGroups, setOpenGroups] = useState({});
  const [openModules, setOpenModules] = useState({});

  function setPermission(moduleKey, action, value) {
    onChange({ ...perms, [moduleKey]: { ...perms[moduleKey], [action]: value } });
  }

  function togglePermission(moduleKey, action) {
    setPermission(moduleKey, action, !perms[moduleKey]?.[action]);
  }

  function setModule(moduleKey, value) {
    const next = clone(perms);
    MODULE_KEYS.filter(key => key === moduleKey || key.startsWith(`${moduleKey}.`)).forEach(key => {
      next[key] = Object.fromEntries(ACTIONS.map(action => [action, value]));
    });
    onChange(next);
  }

  function setGroup(group, value) {
    const next = clone(perms);
    group.modules.forEach(module => {
      next[module.key] = Object.fromEntries(ACTIONS.map(action => [action, value]));
      module.fields.forEach(field => {
        next[fieldPermissionKey(module.key, field)] = Object.fromEntries(ACTIONS.map(action => [action, value]));
      });
    });
    onChange(next);
  }

  function setGroupFields(group, value) {
    setOpenModules(current => {
      const next = { ...current };
      group.modules.forEach(module => { next[module.key] = value; });
      return next;
    });
  }

  return (
    <div className="permMatrix">
      {PERMISSION_GROUPS.map(group => {
        const groupKeys = group.modules.flatMap(module => [module.key, ...module.fields.map(field => fieldPermissionKey(module.key, field))]);
        const groupTotal = groupKeys.length * ACTIONS.length;
        const groupActive = groupKeys.reduce((sum, key) => sum + ACTIONS.filter(action => perms[key]?.[action]).length, 0);
        const groupOpen = openGroups[group.title];
        return (
          <div key={group.title} className="permGroup">
            <div className="permGroupHeader">
              <button
                type="button"
                className="permExpandBtn"
                onClick={() => setOpenGroups(open => ({ ...open, [group.title]: !groupOpen }))}
              >
                {groupOpen ? "-" : "+"}
              </button>
              <strong>{group.title}</strong>
              <span className="helperText">{groupActive}/{groupTotal} permissions on</span>
              {groupOpen ? <button type="button" className="presetBtn" onClick={() => setGroupFields(group, true)}>Expand Fields</button> : null}
              {groupOpen ? <button type="button" className="presetBtn" onClick={() => setGroupFields(group, false)}>Collapse Fields</button> : null}
              <button type="button" className="presetBtn" onClick={() => setGroup(group, true)}>Allow Group</button>
              <button type="button" className="presetBtn" onClick={() => setGroup(group, false)}>Clear Group</button>
            </div>
            {groupOpen ? (
              <div className="permGrid widePermGrid">
                <div className="permGridHeader widePermHeader">
                  <div className="permSectionLabel">Sub-module / field scope</div>
                  {ACTIONS.map(action => <div key={action} className="permActionLabel">{action}</div>)}
                  <div className="permActionLabel">All</div>
                </div>
                {group.modules.map(module => {
                  const allOn = ACTIONS.every(action => perms[module.key]?.[action]);
                  const moduleFieldsOpen = !!openModules[module.key];
                  return (
                    <React.Fragment key={module.key}>
                      <div className="permGridRow widePermRow">
                        <div className="permSectionName">
                          <div className="permModuleTitle">
                            <button
                              type="button"
                              className="permExpandBtn"
                              onClick={() => setOpenModules(current => ({ ...current, [module.key]: !moduleFieldsOpen }))}
                            >
                              {moduleFieldsOpen ? "-" : "+"}
                            </button>
                            <strong>{module.label}</strong>
                          </div>
                          <span>{module.fields.length} field permissions. {moduleFieldsOpen ? "Click - to collapse." : "Click + to expand."}</span>
                        </div>
                        {ACTIONS.map(action => (
                          <div key={action} className="permToggleCell">
                            <button
                              type="button"
                              className={`permToggle ${perms[module.key]?.[action] ? "permOn" : "permOff"}`}
                              onClick={() => togglePermission(module.key, action)}
                            >
                              {perms[module.key]?.[action] ? "ON" : "OFF"}
                            </button>
                          </div>
                        ))}
                        <div className="permToggleCell">
                          <button
                            type="button"
                            className={`permToggle permToggleAll ${allOn ? "permOn" : "permOff"}`}
                            onClick={() => setModule(module.key, !allOn)}
                          >
                            {allOn ? "ALL" : "NONE"}
                          </button>
                        </div>
                      </div>
                      {moduleFieldsOpen ? module.fields.map(field => {
                        const key = fieldPermissionKey(module.key, field);
                        const fieldAllOn = ACTIONS.every(action => perms[key]?.[action]);
                        return (
                          <div key={key} className="permGridRow widePermRow permFieldRow">
                            <div className="permSectionName">
                              <strong>{field}</strong>
                              <span>{module.label} field permission</span>
                            </div>
                            {ACTIONS.map(action => (
                              <div key={action} className="permToggleCell">
                                <button
                                  type="button"
                                  className={`permToggle ${perms[key]?.[action] ? "permOn" : "permOff"}`}
                                  onClick={() => togglePermission(key, action)}
                                >
                                  {perms[key]?.[action] ? "ON" : "OFF"}
                                </button>
                              </div>
                            ))}
                            <div className="permToggleCell">
                              <button
                                type="button"
                                className={`permToggle permToggleAll ${fieldAllOn ? "permOn" : "permOff"}`}
                                onClick={() => setModule(key, !fieldAllOn)}
                              >
                                {fieldAllOn ? "ALL" : "NONE"}
                              </button>
                            </div>
                          </div>
                        );
                      }) : null}
                    </React.Fragment>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function EditUserModal({ open, user, onClose, onSave }) {
  const [form, setForm] = useState({ password: "", role: "operations", is_active: true, perms: emptyPerms() });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      setForm({
        password: "",
        role: user.role || "operations",
        is_active: user.is_active,
        perms: parsePerms(user.permissions_json),
      });
    }
  }, [open, user]);

  function applyPreset(role) {
    setForm(current => ({ ...current, role, perms: clone(ROLE_PRESETS[role] || emptyPerms()) }));
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      role: form.role,
      is_active: form.is_active,
      permissions_json: JSON.stringify(form.perms),
    };
    if (form.password.trim()) payload.password = form.password;
    try {
      await onSave(user.id, payload);
    } finally {
      setSaving(false);
    }
  }

  if (!open || !user) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard editUserModal" onClick={event => event.stopPropagation()}>
        <div className="modalHeader">
          <h2>Edit User: {user.username}</h2>
          <button className="ghostBtn modalCloseBtn" type="button" onClick={onClose}>Close</button>
        </div>

        <div className="editUserForm">
          <div className="editUserRow">
            <div>
              <label className="fieldLabel">New Password (leave blank to keep)</label>
              <input type="password" placeholder="New password..." value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} />
            </div>
            <div>
              <label className="fieldLabel">Role Label</label>
              <select value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>
                {ROLE_NAMES.map(role => <option key={role}>{role}</option>)}
              </select>
            </div>
            <div>
              <label className="qcCheckLabel" style={{ marginTop: 22 }}>
                <input type="checkbox" checked={form.is_active} onChange={event => setForm({ ...form, is_active: event.target.checked })} />
                <span>Active</span>
              </label>
            </div>
          </div>

          <RolePresetBar currentRole={form.role} onApply={applyPreset} />
          <PermissionGrid perms={form.perms} onChange={perms => setForm({ ...form, perms })} />
        </div>

        <div className="modalFooter">
          <button className="ghostBtn" type="button" onClick={onClose}>Cancel</button>
          <button className="primaryBtn" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [message, setMessage] = useState("");
  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    role: "operations",
    is_active: true,
    perms: clone(ROLE_PRESETS.operations),
  });
  const [editUser, setEditUser] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");

  const searchedUsers = useSearch(users, userSearch);
  const searchedAuditLogs = useSearch(auditLogs, auditSearch);
  const userPg = usePagination(searchedUsers, 10);
  const auditPg = usePagination(searchedAuditLogs, 25);

  function load() {
    adminApi.users().then(setUsers).catch(error => setMessage(String(error.message || error)));
    systemApi.auditLogs().then(setAuditLogs).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  if (getRole() !== "admin") {
    return <div className="page"><div className="messageBar">Only admin can manage users.</div></div>;
  }

  function applyCreatePreset(role) {
    setCreateForm(current => ({ ...current, role, perms: clone(ROLE_PRESETS[role] || emptyPerms()) }));
  }

  async function save(event) {
    event.preventDefault();
    if (!createForm.username.trim() || !createForm.password.trim()) {
      setMessage("Username and password required.");
      return;
    }
    try {
      await adminApi.createUser({
        username: createForm.username.trim(),
        password: createForm.password,
        role: createForm.role,
        is_active: createForm.is_active,
        permissions_json: JSON.stringify(createForm.perms),
      });
      setCreateForm({
        username: "",
        password: "",
        role: "operations",
        is_active: true,
        perms: clone(ROLE_PRESETS.operations),
      });
      setMessage("User created successfully.");
      load();
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  async function handleEditSave(id, payload) {
    try {
      await adminApi.updateUser(id, payload);
      setMessage("User updated successfully.");
      setEditOpen(false);
      load();
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  async function toggleActive(user) {
    try {
      await adminApi.updateUser(user.id, { is_active: !user.is_active });
      load();
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  async function remove(user) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await adminApi.deleteUser(user.id);
      setMessage(`User "${user.username}" deleted.`);
      load();
    } catch (error) {
      setMessage(String(error.message || error));
    }
  }

  return (
    <div className="page">
      <h1 className="pageTitle">Admin User Management</h1>
      {message ? (
        <div className="messageBar">
          {message}
          <button
            type="button"
            style={{ float: "right", background: "none", border: "none", color: "#fff", cursor: "pointer" }}
            onClick={() => setMessage("")}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <Card title="Create New User">
        <form onSubmit={save}>
          <div className="createUserTopRow">
            <div>
              <label className="fieldLabel">Username</label>
              <input placeholder="Username" value={createForm.username} onChange={event => setCreateForm({ ...createForm, username: event.target.value })} required />
            </div>
            <div>
              <label className="fieldLabel">Password</label>
              <input placeholder="Password" type="password" value={createForm.password} onChange={event => setCreateForm({ ...createForm, password: event.target.value })} required />
            </div>
            <div>
              <label className="fieldLabel">Role Label</label>
              <select value={createForm.role} onChange={event => setCreateForm({ ...createForm, role: event.target.value })}>
                {ROLE_NAMES.map(role => <option key={role}>{role}</option>)}
              </select>
            </div>
            <div>
              <label className="qcCheckLabel" style={{ marginTop: 22 }}>
                <input type="checkbox" checked={createForm.is_active} onChange={event => setCreateForm({ ...createForm, is_active: event.target.checked })} />
                <span>Active</span>
              </label>
            </div>
          </div>

          <RolePresetBar currentRole={createForm.role} onApply={applyCreatePreset} />
          <PermissionGrid perms={createForm.perms} onChange={perms => setCreateForm({ ...createForm, perms })} />

          <div style={{ marginTop: 16 }}>
            <button className="primaryBtn" type="submit">Create User</button>
          </div>
        </form>
      </Card>

      <Card title="Existing Users">
        <div className="listToolbar">
          <SearchBar value={userSearch} onChange={value => { setUserSearch(value); userPg.setPage(1); }} suggestions={buildSuggestions(users)} placeholder="Search users by username, role, status, permissions..." />
          <span className="helperText">{searchedUsers.length} user(s)</span>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Permissions Summary</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {userPg.pageData.map(user => {
                const perms = parsePerms(user.permissions_json);
                const activeCount = countPerms(perms);
                const totalCount = MODULE_KEYS.length * ACTIONS.length;
                return (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td><strong>{user.username}</strong></td>
                    <td><span className={`roleBadge role-${user.role}`}>{user.role}</span></td>
                    <td>
                      <span className={`statusBadge ${user.is_active ? "status-returned" : "status-cancelled"}`}>
                        {user.is_active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      <div className="permSummaryBar">
                        <div className="permSummaryFill" style={{ width: `${totalCount ? (activeCount / totalCount) * 100 : 0}%` }} />
                      </div>
                      <span className="helperText">{activeCount}/{totalCount} permissions</span>
                    </td>
                    <td className="actionCell">
                      <button className="ghostBtn compactBtn" type="button" onClick={() => { setEditUser(user); setEditOpen(true); }}>Edit</button>
                      <button className="ghostBtn compactBtn" type="button" onClick={() => toggleActive(user)}>
                        {user.is_active ? "Disable" : "Enable"}
                      </button>
                      <button className="dangerBtn compactBtn" type="button" onClick={() => remove(user)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination total={userPg.total} page={userPg.page} pageSize={userPg.pageSize} onPageChange={userPg.setPage} onPageSizeChange={userPg.setPageSize} />
      </Card>

      <Card title="Audit Logs">
        <div className="listToolbar">
          <SearchBar value={auditSearch} onChange={value => { setAuditSearch(value); auditPg.setPage(1); }} suggestions={buildSuggestions(auditLogs)} placeholder="Search audit by user, action, entity, ID, details..." />
          <span className="helperText">{searchedAuditLogs.length} audit row(s)</span>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>ID</th><th>User</th><th>Action</th><th>Entity</th><th>Entity ID</th></tr></thead>
            <tbody>
              {auditPg.pageData.map(log => (
                <tr key={log.id}>
                  <td>{log.id}</td>
                  <td>{log.username}</td>
                  <td>{log.action}</td>
                  <td>{log.entity_type}</td>
                  <td>{log.entity_id || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={auditPg.total} page={auditPg.page} pageSize={auditPg.pageSize} onPageChange={auditPg.setPage} onPageSizeChange={auditPg.setPageSize} />
      </Card>

      <EditUserModal open={editOpen} user={editUser} onClose={() => setEditOpen(false)} onSave={handleEditSave} />
    </div>
  );
}
