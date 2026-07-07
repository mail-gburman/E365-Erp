import React, { useEffect, useMemo, useState } from "react";
import { activationApi } from "../api";
import { getCompanyId, getRole } from "../auth";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusBadge({ s }) {
  if (!s.enforced) return <span className="badge badgeGray">Licensing Off</span>;
  if (s.reason === "active") return <span className="badge badgeGreen">Active</span>;
  if (s.reason === "expired") return <span className="badge badgeRed">Expired</span>;
  if (s.reason === "deactivated") return <span className="badge badgeRed">Deactivated</span>;
  if (s.reason === "not_activated") return <span className="badge badgeOrange">Not Activated</span>;
  if (s.reason === "activation_tampered") return <span className="badge badgeRed">Tampered</span>;
  if (s.reason === "not_yet_valid") return <span className="badge badgeOrange">Not Yet Valid</span>;
  if (s.reason === "public_key_missing") return <span className="badge badgeRed">Key Missing</span>;
  return <span className="badge badgeRed">Invalid</span>;
}

/* ── Success popup shown after a code is applied ── */
function SuccessPopup({ status, onClose }) {
  const lic = status?.license;
  const isDeactivated = status?.reason === "not_activated" || status?.reason === "deactivated" || (!lic && status?.activated === false);
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div
        className="modalCard profileModal"
        style={{ maxWidth: 480, textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 56, marginBottom: 8 }}>{isDeactivated ? "🔒" : "✅"}</div>
        <h2 style={{ marginBottom: 4 }}>{isDeactivated ? "License Deactivated" : "Activation Successful"}</h2>
        <p style={{ color: "var(--readable-muted, #6b7280)", marginBottom: 20 }}>
          {isDeactivated
            ? <>License for <strong>{status?.company_name}</strong> has been <strong style={{ color: "var(--e365-pink, #dc2626)" }}>immediately revoked</strong>.</>
            : <>License has been applied to <strong>{status?.company_name}</strong>.</>}
        </p>

        {lic && !isDeactivated && (
          <div className="messageBar" style={{ textAlign: "left", marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 13 }}>
              <span style={{ color: "var(--readable-muted, #6b7280)" }}>Client</span>
              <strong>{lic.client_name}</strong>
              <span style={{ color: "var(--readable-muted, #6b7280)" }}>Plan</span>
              <span>{lic.plan_name || "-"}</span>
              <span style={{ color: "var(--readable-muted, #6b7280)" }}>Valid from</span>
              <span>{formatDate(lic.valid_from)}</span>
              <span style={{ color: "var(--readable-muted, #6b7280)" }}>Valid until</span>
              <span>{formatDate(lic.valid_until)}</span>
              <span style={{ color: "var(--readable-muted, #6b7280)" }}>Validity</span>
              <span>{lic.validity_days} day(s)</span>
              <span style={{ color: "var(--readable-muted, #6b7280)" }}>Days left</span>
              <strong style={{ color: "var(--e365-teal, #16a34a)" }}>{lic.days_remaining}</strong>
              <span style={{ color: "var(--readable-muted, #6b7280)", fontSize: 11 }}>License ID</span>
              <span style={{ fontSize: 11 }}>{lic.license_id}</span>
            </div>
          </div>
        )}

        <button className="primaryBtn" style={{ width: "100%" }} onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/* ── Modal: paste & apply code for one company ── */
function ActivationModal({ companyStatus, onClose, onSuccess }) {
  const [activationCode, setActivationCode] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const statusText = useMemo(() => {
    if (!companyStatus) return "";
    if (!companyStatus.enforced) return "Licensing is currently disabled for this environment.";
    if (companyStatus.reason === "active") return "This company has an active license.";
    if (companyStatus.reason === "expired") return "License has expired. Paste a renewal code below.";
    if (companyStatus.reason === "activation_tampered") return "Stored license data was modified. Reactivation required.";
    if (companyStatus.reason === "public_key_missing") return "License verification key is not configured on this server.";
    return "Paste an activation code below to activate this company.";
  }, [companyStatus]);

  async function handlePreview() {
    setBusy("preview");
    setError("");
    setPreview(null);
    try {
      setPreview(await activationApi.preview(companyStatus.company_id, activationCode.trim()));
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy("");
    }
  }

  async function handleApply(e) {
    e.preventDefault();
    setBusy("apply");
    setError("");
    try {
      const next = await activationApi.apply(companyStatus.company_id, activationCode.trim());
      if (onSuccess) onSuccess(next);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div
        className="modalCard profileModal"
        style={{ maxWidth: 600 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <h2>License — {companyStatus.company_name}</h2>
          <button className="ghostBtn modalCloseBtn" type="button" onClick={onClose}>Close</button>
        </div>

        <div style={{ padding: "0 4px" }}>
          <p style={{ color: "var(--readable-muted, #6b7280)", marginBottom: 14 }}>{statusText}</p>

          {/* Installation ID */}
          <div className="messageBar" style={{ textAlign: "left", marginBottom: 14 }}>
            <strong style={{ display: "block", marginBottom: 4 }}>Installation ID</strong>
            <code style={{ fontSize: 13, userSelect: "all", letterSpacing: "0.03em" }}>
              {companyStatus.installation_id}
            </code>
            <div style={{ fontSize: 11, color: "var(--readable-muted, #6b7280)", marginTop: 4 }}>
              Share this ID with your license provider to generate an activation code.
            </div>
          </div>

          {/* Current license */}
          {companyStatus.license && (
            <div className="messageBar" style={{ textAlign: "left", marginBottom: 14 }}>
              <strong>{companyStatus.license.client_name}</strong>
              <div style={{ marginTop: 4, fontSize: 13 }}>
                Valid: {formatDate(companyStatus.license.valid_from)} — {formatDate(companyStatus.license.valid_until)}<br />
                Days remaining: <strong>{companyStatus.license.days_remaining}</strong> &nbsp;·&nbsp; Plan: {companyStatus.license.plan_name || "-"}
              </div>
              <div style={{ fontSize: 11, color: "var(--readable-muted, #6b7280)", marginTop: 4 }}>
                {companyStatus.license.license_id}
              </div>
            </div>
          )}

          {/* Code input */}
          <form onSubmit={handleApply}>
            <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
              Paste Activation Code
            </label>
            <textarea
              value={activationCode}
              onChange={(e) => { setActivationCode(e.target.value); setPreview(null); setError(""); }}
              placeholder="EVTLIC1.eyJ…"
              rows={5}
              style={{
                width: "100%",
                borderRadius: 10,
                padding: 10,
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button
                className="ghostBtn"
                type="button"
                onClick={handlePreview}
                disabled={Boolean(busy) || !activationCode.trim()}
                style={{ flex: 1 }}
              >
                {busy === "preview" ? "Checking…" : "Preview Code"}
              </button>
              <button
                className="primaryBtn"
                type="submit"
                disabled={Boolean(busy) || !activationCode.trim()}
                style={{
                  flex: 1,
                  ...(preview?.deactivate ? { background: "var(--e365-pink, #dc2626)", borderColor: "var(--e365-pink, #dc2626)" } : {}),
                }}
              >
                {busy === "apply" ? (preview?.deactivate ? "Deactivating…" : "Activating…") : (preview?.deactivate ? "Deactivate Now" : "Activate")}
              </button>
            </div>
          </form>

          {/* Preview result */}
          {preview && preview.deactivate && (
            <div className="messageBar" style={{
              textAlign: "left", marginTop: 14,
              borderLeft: "4px solid var(--e365-pink, #dc2626)",
              background: "rgba(220,38,38,0.07)",
            }}>
              <strong style={{ color: "var(--e365-pink, #dc2626)" }}>⚠️ DEACTIVATION CODE</strong>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--readable, #111)" }}>
                Applying this code will <strong>immediately revoke all active licenses</strong> for{" "}
                <strong>{companyStatus.company_name}</strong>. This cannot be undone without a new activation code.
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--readable-muted, #6b7280)" }}>
                Issued by: {preview.issued_by || "-"} &nbsp;·&nbsp; License ID: {preview.license_id}
              </div>
            </div>
          )}
          {preview && !preview.deactivate && (
            <div className="messageBar" style={{ textAlign: "left", marginTop: 14 }}>
              <strong>✓ Code looks valid — {preview.client_name}</strong>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px" }}>
                  <span style={{ color: "var(--readable-muted, #6b7280)" }}>Plan</span><span>{preview.plan_name || "-"}</span>
                  <span style={{ color: "var(--readable-muted, #6b7280)" }}>Valid from</span><span>{formatDate(preview.valid_from)}</span>
                  <span style={{ color: "var(--readable-muted, #6b7280)" }}>Valid until</span><span>{formatDate(preview.valid_until)}</span>
                  <span style={{ color: "var(--readable-muted, #6b7280)" }}>Validity</span><span>{preview.validity_days} day(s)</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="messageBar" style={{ marginTop: 12, color: "var(--e365-pink, #dc2626)" }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Company row in the list ── */
function CompanyRow({ s, onManage }) {
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{s.company_name}</div>
          <div style={{ fontSize: 12, color: "var(--readable-muted, #6b7280)", marginTop: 2 }}>
            <code style={{ fontSize: 11 }}>{s.installation_id || "—"}</code>
          </div>
          {s.license && (
            <div style={{ fontSize: 12, color: "var(--readable-muted, #6b7280)", marginTop: 4 }}>
              {s.license.client_name} &nbsp;·&nbsp; till {formatDate(s.license.valid_until)} &nbsp;·&nbsp;
              <strong style={{ color: s.license.days_remaining <= 7 ? "var(--e365-pink, #dc2626)" : "inherit" }}>
                {s.license.days_remaining}d left
              </strong>
            </div>
          )}
          {s.detail && (
            <div style={{ fontSize: 12, color: "var(--e365-pink, #dc2626)", marginTop: 4 }}>{s.detail}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <StatusBadge s={s} />
          <button className="ghostBtn" style={{ fontSize: 12 }} onClick={() => onManage(s)}>
            Manage
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function ActivationPage() {
  const role = getRole();
  const isSuperAdmin = role === "super_admin";
  const companyId = getCompanyId();

  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);       // companyStatus object → manage modal
  const [successData, setSuccessData] = useState(null); // applied status → success popup
  const [filter, setFilter] = useState("all");    // "all" | "active" | "expired" | "not_activated"

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (isSuperAdmin) {
        setStatuses(await activationApi.getAll());
      } else if (companyId) {
        setStatuses([await activationApi.getStatus(companyId)]);
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSuccess(newStatus) {
    setModal(null);
    setSuccessData(newStatus);
    await load();
  }

  const summary = useMemo(() => {
    if (!isSuperAdmin) return null;
    return {
      total: statuses.length,
      active: statuses.filter((s) => s.reason === "active").length,
      expired: statuses.filter((s) => s.reason === "expired").length,
      unactivated: statuses.filter((s) => s.reason === "not_activated").length,
    };
  }, [statuses, isSuperAdmin]);

  const visibleStatuses = useMemo(() => {
    if (filter === "active") return statuses.filter((s) => s.reason === "active");
    if (filter === "expired") return statuses.filter((s) => s.reason === "expired");
    if (filter === "not_activated") return statuses.filter((s) => s.reason === "not_activated");
    return statuses;
  }, [statuses, filter]);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 860 }}>
      <h1 style={{ marginBottom: 4 }}>License Activation</h1>
      <p style={{ color: "var(--readable-muted, #6b7280)", marginBottom: 24 }}>
        {isSuperAdmin
          ? "Manage software activation for all companies in this installation."
          : "View and manage the license for your company."}
      </p>

      {loading && <div className="messageBar">Loading…</div>}
      {error && <div className="messageBar" style={{ color: "var(--e365-pink, #dc2626)" }}>{error}</div>}

      {!loading && summary && (
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { key: "all",           label: "All Companies", value: summary.total,       accent: "var(--accent, #6366f1)" },
            { key: "active",        label: "Active",        value: summary.active,      accent: "#16a34a" },
            { key: "expired",       label: "Expired",       value: summary.expired,     accent: "#dc2626" },
            { key: "not_activated", label: "Not Activated", value: summary.unactivated, accent: "#d97706" },
          ].filter((c) => c.key === "all" || c.value > 0).map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(active ? "all" : c.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: `1.5px solid ${active ? c.accent : "var(--border, #e5e7eb)"}`,
                  background: active ? `${c.accent}18` : "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 500,
                  color: active ? c.accent : "var(--readable-muted, #6b7280)",
                  transition: "all 0.15s",
                  opacity: filter !== "all" && !active ? 0.5 : 1,
                }}
              >
                <span style={{
                  background: active ? c.accent : "var(--border, #d1d5db)",
                  color: active ? "#fff" : "var(--readable-muted, #6b7280)",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 7px",
                  minWidth: 20,
                  textAlign: "center",
                }}>
                  {c.value}
                </span>
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {!loading && visibleStatuses.map((s) => (
        <CompanyRow key={s.company_id} s={s} onManage={setModal} />
      ))}

      {!loading && !error && visibleStatuses.length === 0 && (
        <div className="messageBar">
          {filter === "all" ? "No companies found." : `No companies with status "${filter.replace("_", " ")}".`}
        </div>
      )}

      {/* Manage / paste code modal */}
      {modal && (
        <ActivationModal
          companyStatus={modal}
          onClose={() => setModal(null)}
          onSuccess={handleSuccess}
        />
      )}

      {/* Success popup */}
      {successData && (
        <SuccessPopup
          status={successData}
          onClose={() => setSuccessData(null)}
        />
      )}
    </div>
  );
}
