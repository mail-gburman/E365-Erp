import React, { useEffect, useState } from "react";
import { adminApi, downloadAuthorized, fetchBlobUrlAuthorized } from "../api";
import Card from "../components/Card";
import { getBookingProfile } from "../bookingProfiles";

const blankProfile = {
  name: "",
  legal_name: "",
  contact_person: "",
  phone: "",
  email: "",
  website: "",
  gst_number: "",
  pan_number: "",
  billing_address: "",
  registered_address: "",
  city: "",
  state: "",
  country: "India",
  theme_option: "auto",
  booking_type: "equipment",
  notes: "",
};

const THEME_OPTIONS = [
  { key: "auto", name: "Auto Logo", desc: "Closest match from uploaded logo colors." },
  { key: "classic", name: "Classic", desc: "Deep professional version of logo colors." },
  { key: "bold", name: "Bold", desc: "High contrast, stronger sidebar and buttons." },
  { key: "soft", name: "Soft", desc: "Lighter, calmer version for daily use." },
];

export default function CompanyProfilePage() {
  const [form, setForm] = useState(blankProfile);
  const [docs, setDocs] = useState([]);
  const [docName, setDocName] = useState("");
  const [docNotes, setDocNotes] = useState("");
  const [docFile, setDocFile] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [logoVersion, setLogoVersion] = useState(Date.now());
  const [logoUrl, setLogoUrl] = useState("");

  function load() {
    adminApi.companyProfile().then((row) => setForm({ ...blankProfile, ...row })).catch((e) => setMsg(String(e.message || e)));
    adminApi.companyDocuments().then(setDocs).catch(() => {});
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let live = true;
    let objectUrl = "";
    async function loadLogo() {
      if (!form.logo_path) {
        setLogoUrl("");
        return;
      }
      try {
        objectUrl = await fetchBlobUrlAuthorized(`${adminApi.companyLogoUrl()}?v=${logoVersion}`);
        if (live) setLogoUrl(objectUrl);
      } catch (_) {
        if (live) setLogoUrl("");
      }
    }
    loadLogo();
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [form.logo_path, logoVersion]);

  async function saveProfile(e) {
    e.preventDefault();
    setMsg("");
    try {
      await adminApi.updateCompanyProfile(form);
      setMsg("Company profile saved.");
      window.dispatchEvent(new Event("company-brand-updated"));
      load();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  async function uploadLogo() {
    if (!logoFile || logoUploading) return;
    setMsg("");
    setLogoUploading(true);
    try {
      await adminApi.uploadCompanyLogo(logoFile);
      setLogoFile(null);
      setLogoVersion(Date.now());
      setMsg("Logo uploaded.");
      window.dispatchEvent(new Event("company-brand-updated"));
      load();
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setLogoUploading(false);
    }
  }

  async function uploadDocument(e) {
    e.preventDefault();
    if (!docName.trim() || !docFile) {
      setMsg("Document name and file are required.");
      return;
    }
    setMsg("");
    try {
      await adminApi.uploadCompanyDocument(docName.trim(), docFile, docNotes);
      setDocName("");
      setDocNotes("");
      setDocFile(null);
      setMsg("Document uploaded.");
      load();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  function field(key, label, props = {}) {
    return (
      <div className="fieldStack">
        <label className="fieldLabel">{label}</label>
        <input value={form[key] || ""} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))} {...props} />
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="pageTitle">Company Profile</h1>
      {msg ? <div className="messageBar">{msg}</div> : null}

      <Card title="Company Details">
        <form className="formGrid" onSubmit={saveProfile}>
          {field("name", "Company Name")}
          {field("legal_name", "Legal Name")}
          {field("contact_person", "Contact Person")}
          {field("phone", "Phone")}
          {field("email", "Email", { type: "email" })}
          {field("website", "Website")}
          {field("gst_number", "GST Number")}
          {field("pan_number", "PAN Number")}
          {field("city", "City")}
          {field("state", "State")}
          {field("country", "Country")}
          <div className="fieldStack">
            <label className="fieldLabel">Booking Type</label>
            <input value={getBookingProfile(form.booking_type).label} readOnly disabled />
          </div>
          <div className="fieldStack full">
            <label className="fieldLabel">Billing Address</label>
            <textarea value={form.billing_address || ""} onChange={(e) => setForm((p) => ({ ...p, billing_address: e.target.value }))} rows={3} />
          </div>
          <div className="fieldStack full">
            <label className="fieldLabel">Registered Address</label>
            <textarea value={form.registered_address || ""} onChange={(e) => setForm((p) => ({ ...p, registered_address: e.target.value }))} rows={3} />
          </div>
          <div className="fieldStack full">
            <label className="fieldLabel">Notes</label>
            <textarea value={form.notes || ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} />
          </div>
          <button className="primaryBtn full" type="submit">Save Company Profile</button>
        </form>
      </Card>

      <div className="grid2">
        <Card title="Company Logo">
          <div className="companyLogoPanel">
            {logoUrl ? <img src={logoUrl} alt="Company logo" /> : <div className="emptyState">No logo uploaded</div>}
          </div>
          <div className="inlineActions">
            <input type="file" accept="image/*" disabled={logoUploading} onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
            <button className="primaryBtn uploadLogoBtn" type="button" disabled={!logoFile || logoUploading} onClick={uploadLogo}>
              {logoUploading ? "Uploading Logo..." : "Upload Logo"}
            </button>
          </div>
          {logoUploading ? (
            <div className="statusWrap logoUploadStatus" role="status" aria-live="polite">
              <div className="spinnerLine" />
              <div className="statusText">Uploading logo... please wait. Theme will update after upload.</div>
            </div>
          ) : null}
        </Card>

        <Card title="Theme Options">
          <div className="themeOptionGrid">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={form.theme_option === opt.key ? "themeOptionCard themeOptionActive" : "themeOptionCard"}
                onClick={() => setForm((p) => ({ ...p, theme_option: opt.key }))}
              >
                <span className={`themeSwatches themeSwatches-${opt.key}`}>
                  <i /><i /><i /><i />
                </span>
                <strong>{opt.name}</strong>
                <small>{opt.desc}</small>
              </button>
            ))}
          </div>
          <p className="helperText">Save Company Profile after selecting. Theme applies to this company's ERP.</p>
        </Card>

        <Card title="Company Documents">
          <form className="formGrid" onSubmit={uploadDocument}>
            <div className="fieldStack">
              <label className="fieldLabel">Document Name</label>
              <input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="GST certificate, agreement, PAN..." />
            </div>
            <div className="fieldStack">
              <label className="fieldLabel">File</label>
              <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
            </div>
            <div className="fieldStack full">
              <label className="fieldLabel">Notes</label>
              <input value={docNotes} onChange={(e) => setDocNotes(e.target.value)} />
            </div>
            <button className="primaryBtn full" type="submit">Upload Document</button>
          </form>
          <table className="dataTable" style={{ marginTop: 14 }}>
            <thead><tr><th>Name</th><th>Uploaded By</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.document_name}</td>
                  <td>{doc.uploaded_by}</td>
                  <td>{doc.created_at ? doc.created_at.slice(0, 10) : "-"}</td>
                  <td><button className="ghostBtn compactBtn" type="button" onClick={() => downloadAuthorized(adminApi.companyDocumentUrl(doc.id), doc.document_name)}>Download</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
