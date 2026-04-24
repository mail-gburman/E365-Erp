import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getPermissions, getRole, getUsername } from "../auth";
import { api, adminApi, auditApi } from "../api";
import PhoneInput from "./PhoneInput";

const blankProfile = { full_name: "", phone: "", email: "", password: "" };

function ProfileModal({ open, onClose, profile, form, setForm, onSave, saving }) {
  if (!open) return null;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard profileModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>User Profile</h2>
          <button className="ghostBtn modalCloseBtn" onClick={onClose}>Close</button>
        </div>
        <div className="profileSummaryCard">
          <div className="profileAvatarLarge">{(profile?.full_name || profile?.username || "U").slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="profileName">{profile?.full_name || profile?.username}</div>
            <div className="profileMeta">{profile?.username} · {profile?.role}</div>
          </div>
        </div>
        <div className="formGrid" style={{ marginTop: 14 }}>
          <label className="fieldLabel">Full Name</label>
          <input value={form.full_name} onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))} placeholder="Full name" />
          <label className="fieldLabel">Phone</label>
          <PhoneInput value={form.phone} onChange={v => setForm(prev => ({ ...prev, phone: v }))} placeholder="Phone number" />
          <label className="fieldLabel">Email</label>
          <input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="name@example.com" />
          <label className="fieldLabel">Role</label>
          <input value={profile?.role || ""} readOnly />
          <label className="fieldLabel full">Change Password</label>
          <input className="full" type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Leave blank to keep current password" />
        </div>
        <div className="modalFooter" style={{ marginTop: 16 }}>
          <button className="ghostBtn" type="button" onClick={onClose}>Cancel</button>
          <button className="primaryBtn" type="button" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save Profile"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const role = getRole();
  const permissions = getPermissions();
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(blankProfile);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [demoState, setDemoState] = useState({ installed: false, counts: {} });
  const [demoLoading, setDemoLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    api.me().then((user) => {
      setProfile(user);
      setProfileForm({
        full_name: user.full_name || "",
        phone: user.phone || "",
        email: user.email || "",
        password: "",
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (role !== "admin") return;
    adminApi.demoDatasetStatus().then(setDemoState).catch(() => {});
  }, [role]);

  const canSeeAccounts = role === "admin" || role === "accounts" || Boolean(permissions?.accounts?.view);
  const links = useMemo(() => ([
    ["/", "Dashboard"],
    ["/additions", "Additions"],
    ["/registry", "Master Registry"],
    ["/bookings", "Booking"],
    ["/calendar", "Calendar"],
    ["/operations", "Papers & QC"],
    ["/services", "Service Jobs"],
    ["/vendors", "Vendors & Procurement"],
    ["/accounts", "Accounts"],
    ["/audit", "Audit & Exports"],
    ["/admin", "Admin Users"],
    ["/system", "System"],
  ].filter(([href]) => {
    if (href === "/admin") return role === "admin";
    if (href === "/accounts") return canSeeAccounts;
    return true;
  })), [canSeeAccounts, role]);

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const updated = await api.updateMe(profileForm);
      setProfile(updated);
      setProfileForm({
        full_name: updated.full_name || "",
        phone: updated.phone || "",
        email: updated.email || "",
        password: "",
      });
      setProfileModalOpen(false);
    } catch (e) {
      alert(String(e.message || e));
    }
    setSavingProfile(false);
  }

  async function handleEraseAll() {
    if (!confirm("Erase all data and reseed the system?")) return;
    if (!confirm("Final confirmation: this cannot be undone.")) return;
    try {
      await auditApi.resetAll();
      alert("All data erased and reseeded successfully. The page will reload.");
      window.location.reload();
    } catch (e) {
      alert("Failed to erase data: " + (e.message || e));
    }
  }

  async function handleLoadDemo() {
    if (!confirm("Load fresh demo dataset on top of your current items, manpower, and master data?")) return;
    setDemoLoading(true);
    try {
      const result = await adminApi.loadDemoDataset();
      setDemoState(result);
      alert("Demo dataset loaded successfully.");
      window.location.reload();
    } catch (e) {
      alert("Failed to load demo dataset: " + (e.message || e));
    }
    setDemoLoading(false);
  }

  async function handleRemoveDemo() {
    if (!confirm("Remove only the demo dataset and keep your current imported masters and live records?")) return;
    if (!confirm("Final confirmation: demo projects, bookings, papers, and demo-only records will be removed.")) return;
    setDemoLoading(true);
    try {
      const result = await adminApi.removeDemoDataset();
      setDemoState(result);
      alert(result.message || "Demo dataset removed.");
      window.location.reload();
    } catch (e) {
      alert("Failed to remove demo dataset: " + (e.message || e));
    }
    setDemoLoading(false);
  }

  const pageTitle = links.find(([href]) => href === location.pathname)?.[1] || "KPS ERP";

  return (
    <div className={`shell${sidebarOpen ? " sidebarOpen" : ""}${sidebarCollapsed ? " sidebarCollapsed" : ""}`}>
      {/* Mobile hamburger */}
      <button className="hamburgerBtn" onClick={() => setSidebarOpen(p => !p)} aria-label="Menu">&#9776;</button>
      <div className="sidebarOverlay" onClick={() => setSidebarOpen(false)} />
      <aside className="sidebar">
        <div className="sidebarInner">
          {/* Desktop collapse toggle */}
          <button className="sidebarCollapseBtn" onClick={() => setSidebarCollapsed(p => !p)} title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}>
            {sidebarCollapsed ? "▶" : "◀"}
          </button>
          <div className="brand">
            <img src="/logo.png" alt="Kaleidoscope" className="brandLogo" />
            {!sidebarCollapsed && (
              <div>
                <div className="brandTitle">Kaleidoscope</div>
                <div className="brandSub">ERP Enterprise</div>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="brandMeta">
              <div>KALEIDOSCOPE PRODUCTIONS AND SERVICES LLP</div>
              <div>{profile?.full_name || getUsername()} · {role}</div>
            </div>
          )}
          <nav className="nav">
            {links.map(([href, label]) => (
              <Link
                key={href}
                to={href}
                className={location.pathname === href ? "navLink active" : "navLink"}
                onClick={() => setSidebarOpen(false)}
                data-label={label}
              >
                {sidebarCollapsed ? label.slice(0, 2) : label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>
      <main className="main">
        <div className="topBar">
          <div className="topBarTitle">{pageTitle}</div>
          <div className="profileMenuWrap">
            <button className="profileMenuBtn" type="button" onClick={() => setProfileMenuOpen((prev) => !prev)}>
              <span className="profileAvatar">{(profile?.full_name || profile?.username || "U").slice(0, 1).toUpperCase()}</span>
              <span className="profileBtnText">
                <strong>{profile?.full_name || getUsername()}</strong>
                <span>{role}</span>
              </span>
            </button>
            {profileMenuOpen && (
              <div className="profileDropdown">
                <button className="profileDropdownItem" type="button" onClick={() => { setProfileMenuOpen(false); setProfileModalOpen(true); }}>View / Modify Profile</button>
                {role === "admin" ? <div className="profileDropdownMeta">Demo dataset: {demoState.installed ? "installed" : "not installed"}</div> : null}
                {role === "admin" ? <button className="profileDropdownItem" type="button" disabled={demoLoading} onClick={() => { setProfileMenuOpen(false); handleLoadDemo(); }}>{demoLoading ? "Working..." : "Load Fresh Demo Data"}</button> : null}
                {role === "admin" ? <button className="profileDropdownItem" type="button" disabled={demoLoading || !demoState.installed} onClick={() => { setProfileMenuOpen(false); handleRemoveDemo(); }}>Remove Demo Data</button> : null}
                {role === "admin" ? <button className="profileDropdownItem dangerText" type="button" onClick={() => { setProfileMenuOpen(false); handleEraseAll(); }}>Erase All Data</button> : null}
                <button className="profileDropdownItem" type="button" onClick={async () => { setProfileMenuOpen(false); await clearSession(); navigate("/login"); }}>Logout</button>
              </div>
            )}
          </div>
        </div>
        {children}
      </main>
      <ProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        profile={profile}
        form={profileForm}
        setForm={setProfileForm}
        onSave={handleSaveProfile}
        saving={savingProfile}
      />
    </div>
  );
}
