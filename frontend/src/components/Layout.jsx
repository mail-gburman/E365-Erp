import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearSession, getBookingType, getCompanyName, getPermissions, getRole, getUsername } from "../auth";
import { api, adminApi, auditApi, fetchBlobUrlAuthorized } from "../api";
import PhoneInput from "./PhoneInput";
import { getBookingProfile } from "../bookingProfiles";

const blankProfile = { full_name: "", phone: "", email: "", password: "" };

const defaultBrandTheme = {
  primary: "#050505",
  secondary: "#ef5b8f",
  tertiary: "#45c9f5",
  blue: "#83e66f",
};

function buildThemeVariant(base = defaultBrandTheme, option = "auto") {
  if (option === "classic") {
    return {
      primary: shade(base.primary, -0.28),
      secondary: base.secondary,
      tertiary: base.tertiary,
      blue: base.blue,
    };
  }
  if (option === "bold") {
    return {
      primary: shade(base.primary, -0.48),
      secondary: shade(base.secondary || base.primary, -0.12),
      tertiary: shade(base.tertiary || base.primary, -0.22),
      blue: shade(base.blue || base.tertiary || base.primary, -0.18),
    };
  }
  if (option === "soft") {
    return {
      primary: shade(base.primary, 0.18),
      secondary: shade(base.secondary || base.primary, 0.32),
      tertiary: shade(base.tertiary || base.primary, 0.28),
      blue: shade(base.blue || base.tertiary || base.primary, 0.22),
    };
  }
  return base;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("")}`;
}

function shade(hex, amount) {
  const clean = hex.replace("#", "");
  const parts = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return rgbToHex(...parts.map((v) => Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)).join(", ");
}

async function extractThemeFromLogo(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 72;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return resolve(defaultBrandTheme);
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const buckets = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a < 90) continue;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max > 238 && min > 220) continue;
        const sat = max - min;
        if (max < 60 || sat < 45) continue;
        const key = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
        buckets.set(key, (buckets.get(key) || 0) + sat * 2 + max);
      }
      const top = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => {
        const [r, g, b] = key.split(",").map(Number);
        return rgbToHex(r, g, b);
      });
      const primary = top[0] || defaultBrandTheme.primary;
      resolve({
        primary,
        secondary: top[1] || shade(primary, 0.35),
        tertiary: top[2] || shade(primary, 0.55),
        blue: top[2] || top[1] || defaultBrandTheme.blue,
      });
    };
    img.onerror = () => resolve(defaultBrandTheme);
    img.src = src;
  });
}

function applyBrandTheme(theme = defaultBrandTheme) {
  const root = document.documentElement;
  const dark = shade(theme.primary, -0.45);
  const soft = shade(theme.primary, 0.86);
  root.style.setProperty("--e365-maroon", theme.primary);
  root.style.setProperty("--e365-maroon-2", dark);
  root.style.setProperty("--e365-pink", theme.secondary);
  root.style.setProperty("--e365-teal", theme.tertiary);
  root.style.setProperty("--e365-blue", theme.blue);
  root.style.setProperty("--accent", theme.primary);
  root.style.setProperty("--brand-primary", theme.primary);
  root.style.setProperty("--brand-primary-dark", dark);
  root.style.setProperty("--brand-secondary", theme.secondary);
  root.style.setProperty("--brand-tertiary", theme.tertiary);
  root.style.setProperty("--brand-soft", soft);
  root.style.setProperty("--brand-primary-rgb", hexToRgb(theme.primary));
  root.style.setProperty("--brand-secondary-rgb", hexToRgb(theme.secondary));
  root.style.setProperty("--brand-tertiary-rgb", hexToRgb(theme.tertiary));
}

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
  const [companyBrand, setCompanyBrand] = useState(null);
  const [tenantLogoUrl, setTenantLogoUrl] = useState("");

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

  useEffect(() => {
    let live = true;
    let objectUrl = "";
    async function loadCompanyBrand() {
      if (role === "super_admin") {
        setCompanyBrand(null);
        setTenantLogoUrl("");
        localStorage.removeItem("e365_booking_type");
        window.dispatchEvent(new Event("company-booking-type-updated"));
        applyBrandTheme(defaultBrandTheme);
        return;
      }
      try {
        const company = await adminApi.companyProfile();
        if (!live) return;
        setCompanyBrand(company);
        localStorage.setItem("e365_booking_type", company.booking_type || "equipment");
        window.dispatchEvent(new Event("company-booking-type-updated"));
        if (company.logo_path) {
          objectUrl = await fetchBlobUrlAuthorized(`${adminApi.companyLogoUrl()}?v=${Date.now()}`);
          if (!live) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          setTenantLogoUrl(objectUrl);
          const logoTheme = await extractThemeFromLogo(objectUrl);
          applyBrandTheme(buildThemeVariant(logoTheme, company.theme_option || "auto"));
        } else {
          setTenantLogoUrl("");
          applyBrandTheme(buildThemeVariant(defaultBrandTheme, company.theme_option || "auto"));
        }
      } catch (_) {
        if (live) applyBrandTheme(defaultBrandTheme);
      }
    }
    loadCompanyBrand();
    window.addEventListener("company-brand-updated", loadCompanyBrand);
    return () => {
      live = false;
      window.removeEventListener("company-brand-updated", loadCompanyBrand);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [role]);

  const canSeeAccounts = role === "admin" || role === "accounts" || Boolean(permissions?.accounts?.view);
  const bookingType = companyBrand?.booking_type || getBookingType();
  const bookingProfile = getBookingProfile(bookingType);
  const links = useMemo(() => {
    if (role === "super_admin") {
      return [
        ["/master-companies", "Companies", "🏢"],
        ["/admin", "Master Users", "👤"],
        ["/system", "System", "⚙️"],
      ];
    }
    return ([
    ["/company-profile", "Company Profile", "🏢"],
    ["/", "Dashboard", "📊"],
    ["/additions", bookingProfile.addLabel, "➕"],
    ["/registry", bookingProfile.registryLabel, "📋"],
    ["/bookings", "Booking", "📦"],
    ["/calendar", "Calendar", "🗓️"],
    ["/operations", bookingProfile.operationsLabel, "📄"],
    ...(bookingProfile.features.serviceJobs ? [["/services", bookingProfile.serviceNavLabel, "🔧"]] : []),
    ["/vendors", bookingProfile.vendorsLabel, "🏪"],
    ["/accounts", "Accounts", "💰"],
    ["/audit", "Audit & Exports", "📤"],
    ["/admin", "Admin Users", "👤"],
    ["/system", "System", "⚙️"],
  ].filter(([href]) => {
    if (href === "/admin") return role === "admin";
    if (href === "/accounts") return canSeeAccounts;
    return true;
  }));
  }, [bookingProfile.addLabel, bookingProfile.features.serviceJobs, bookingProfile.operationsLabel, bookingProfile.registryLabel, bookingProfile.serviceNavLabel, bookingProfile.vendorsLabel, canSeeAccounts, role]);

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
    if (!confirm("Erase all business data and reseed the system? User accounts, passwords, and login sessions will be kept.")) return;
    if (!confirm("Final confirmation: live records will be cleared, but user credential data will stay.")) return;
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

  const pageTitle = links.find(([href]) => href === location.pathname)?.[1] || "Eventory ERP";
  const workspaceName = companyBrand?.name || getCompanyName() || "Company Workspace";
  const brandLogo = role === "super_admin" ? "" : tenantLogoUrl;
  const brandTitle = role === "super_admin" ? "Master Console" : workspaceName;
  const brandSub = role === "super_admin" ? "" : "ERP";

  const shellClass = `shell ${role === "super_admin" ? "superAdminShell" : "tenantShell"}${sidebarOpen ? " sidebarOpen" : ""}${sidebarCollapsed ? " sidebarCollapsed" : ""}`;

  return (
    <div className={shellClass}>
      {/* Mobile hamburger */}
      <button className="hamburgerBtn" onClick={() => setSidebarOpen(p => !p)} aria-label="Menu">&#9776;</button>
      <div className="sidebarOverlay" onClick={() => setSidebarOpen(false)} />
      <aside className="sidebar">
        <div className="sidebarInner">
          {/* Collapse toggle — top right, above logo */}
          <button className="sidebarCollapseBtn" onClick={() => setSidebarCollapsed(p => !p)} title={sidebarCollapsed ? "Expand menu" : "Collapse menu"}>
            {sidebarCollapsed ? "▶" : "◀"}
          </button>
          <div className={role === "super_admin" ? "brand" : "brand tenantBrand"}>
            {brandLogo ? <img src={brandLogo} alt={brandTitle} className="brandLogo" /> : null}
            {!sidebarCollapsed && (
              <div className="brandText">
                <div className="brandTitle">{brandTitle}</div>
                {brandSub ? <div className="brandSub">{brandSub}</div> : null}
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="brandMeta">
              <div>{role === "super_admin" ? "Master Admin" : workspaceName}</div>
              <div>{profile?.full_name || getUsername()} · {role}</div>
            </div>
          )}
          <nav className="nav">
            {links.map(([href, label, icon]) => (
              <Link
                key={href}
                to={href}
                className={location.pathname === href ? "navLink active" : "navLink"}
                onClick={() => setSidebarOpen(false)}
                data-label={label}
              >
                <span className="navLinkIcon">{icon}</span>
                <span className="navLinkText">{label}</span>
              </Link>
            ))}
          </nav>
          {!sidebarCollapsed && (
            <div className="sidebarProductMark">
              <img src="/eventory-logo-invert.png?v=1" alt="Eventory" className="sidebarProductLogo" />
              <div className="brandPowered">Powered by CREATIVO / E365</div>
            </div>
          )}
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
                <button className="profileDropdownItem" type="button" onClick={async () => { setProfileMenuOpen(false); await clearSession(); navigate("/auth/login"); }}>Logout</button>
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
