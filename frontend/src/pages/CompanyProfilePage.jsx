import React, { useRef, useState, useEffect } from "react";

const PRESET_COLORS = [
  "#3D0B1A", // E365 Burgundy (default)
  "#1A7B8A", // E365 Teal
  "#E8196B", // E365 Pink
  "#1e3a5f", // Navy
  "#1a472a", // Forest Green
  "#4a1942", // Deep Purple
  "#7c2d12", // Burnt Orange
  "#0f4c75", // Ocean Blue
  "#374151", // Slate
  "#0d3349", // Midnight
];

const BLANK = {
  company_name: "",
  tagline: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  phone: "",
  email: "",
  website: "",
  gst_number: "",
  pan_number: "",
  cin_number: "",
  bank_name: "",
  bank_account: "",
  bank_ifsc: "",
  bank_branch: "",
  primary_color: "#3D0B1A",
};

function applyTheme(color) {
  document.documentElement.style.setProperty("--primary", color);
  localStorage.setItem("e365_company_primary", color);
}

export default function CompanyProfilePage() {
  const [form, setForm] = useState(BLANK);
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [docs, setDocs] = useState([]);
  const [activeTab, setActiveTab] = useState("basic");
  const logoInputRef = useRef();
  const docInputRef = useRef();

  // Load saved company profile from localStorage (until backend API is wired)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("e365_company_profile");
      if (stored) {
        const parsed = JSON.parse(stored);
        setForm((p) => ({ ...p, ...parsed }));
        if (parsed.primary_color) applyTheme(parsed.primary_color);
      }
      const storedDocs = localStorage.getItem("e365_company_docs");
      if (storedDocs) setDocs(JSON.parse(storedDocs));
      const storedLogo = localStorage.getItem("e365_company_logo");
      if (storedLogo) setLogoPreview(storedLogo);
    } catch {}
  }, []);

  function handleField(e) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  }

  function handleColorPreset(color) {
    setForm((p) => ({ ...p, primary_color: color }));
    applyTheme(color);
  }

  function handleColorInput(e) {
    const color = e.target.value;
    setForm((p) => ({ ...p, primary_color: color }));
    applyTheme(color);
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setLogoPreview(ev.target.result);
      localStorage.setItem("e365_company_logo", ev.target.result);
    };
    reader.readAsDataURL(file);
  }

  function handleDocAdd(e) {
    const files = Array.from(e.target.files || []);
    const newDocs = files.map((f) => ({ name: f.name, size: f.size, type: f.type, added: new Date().toISOString() }));
    const updated = [...docs, ...newDocs];
    setDocs(updated);
    localStorage.setItem("e365_company_docs", JSON.stringify(updated));
  }

  function handleDocRemove(idx) {
    const updated = docs.filter((_, i) => i !== idx);
    setDocs(updated);
    localStorage.setItem("e365_company_docs", JSON.stringify(updated));
  }

  function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      localStorage.setItem("e365_company_profile", JSON.stringify(form));
      applyTheme(form.primary_color);
      setSaved("Company profile saved successfully.");
      setSaving(false);
      setTimeout(() => setSaved(null), 3000);
    }, 600);
  }

  const tabs = [
    { id: "basic", label: "Basic Info" },
    { id: "contact", label: "Contact & Address" },
    { id: "legal", label: "Legal & Tax" },
    { id: "banking", label: "Banking" },
    { id: "brand", label: "Brand & Theme" },
    { id: "documents", label: "Documents" },
  ];

  return (
    <div className="page companyProfilePage">
      <div className="topBarTitle" style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Company Profile</div>
      <p className="helperText" style={{ marginBottom: 12 }}>
        Configure your company details, branding, and documents. These appear on invoices, reports, and PDFs.
      </p>

      {/* Brand preview banner */}
      <div className="companyBrandPreview">
        {logoPreview
          ? <img src={logoPreview} alt="Logo" className="companyBrandPreviewLogo" />
          : <div className="companyBrandPreviewLogo" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "var(--primary)" }}>
              {(form.company_name || "E").slice(0, 1).toUpperCase()}
            </div>
        }
        <div>
          <div className="companyBrandPreviewName">{form.company_name || "Your Company Name"}</div>
          <div className="companyBrandPreviewSub">{form.tagline || "Tagline · GST: " + (form.gst_number || "—")}</div>
          <div className="themePreviewBar" style={{ width: 200, marginTop: 8 }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="subMenuTabs" style={{ marginBottom: 0 }}>
        {tabs.map((t) => (
          <button key={t.id} className={`subMenuTab${activeTab === t.id ? " subMenuTabActive" : ""}`} type="button" onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave}>
        <div className="card">
          {/* ── BASIC INFO ── */}
          {activeTab === "basic" && (
            <div className="formGrid">
              <div className="full">
                <label className="fieldLabel">Company Name</label>
                <input name="company_name" value={form.company_name} onChange={handleField} placeholder="Acme Events Pvt. Ltd." className="full" style={{ marginTop: 4 }} />
              </div>
              <div className="full">
                <label className="fieldLabel">Tagline / Slogan</label>
                <input name="tagline" value={form.tagline} onChange={handleField} placeholder="Innovate. Experience. Celebrate." className="full" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">Company Logo</label>
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 12 }}>
                  {logoPreview && <img src={logoPreview} alt="Logo" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "contain", border: "1px solid var(--line)", background: "#fff", padding: 4 }} />}
                  <button type="button" className="ghostBtn" onClick={() => logoInputRef.current?.click()}>
                    {logoPreview ? "Change Logo" : "Upload Logo"}
                  </button>
                  {logoPreview && <button type="button" className="ghostBtn" style={{ color: "#dc2626" }} onClick={() => { setLogoPreview(null); setLogoFile(null); localStorage.removeItem("e365_company_logo"); }}>Remove</button>}
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoChange} />
                </div>
                <div className="helperText" style={{ marginTop: 6 }}>PNG, JPG, or SVG · Max 2 MB · Displayed on invoices & sidebar</div>
              </div>
              <div>
                <label className="fieldLabel">Industry / Type</label>
                <select name="industry" value={form.industry || ""} onChange={handleField} style={{ width: "100%", marginTop: 4, background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 11, padding: "10px 11px", fontSize: 12 }}>
                  <option value="">Select industry</option>
                  <option>Event Management</option>
                  <option>Wedding & Celebrations</option>
                  <option>Corporate Events</option>
                  <option>Film & Production</option>
                  <option>Hospitality</option>
                  <option>Entertainment</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
          )}

          {/* ── CONTACT & ADDRESS ── */}
          {activeTab === "contact" && (
            <div className="formGrid">
              <div>
                <label className="fieldLabel">Phone</label>
                <input name="phone" value={form.phone} onChange={handleField} placeholder="+91 98765 43210" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">Email</label>
                <input name="email" type="email" value={form.email} onChange={handleField} placeholder="hello@company.com" style={{ marginTop: 4 }} />
              </div>
              <div className="full">
                <label className="fieldLabel">Website</label>
                <input name="website" value={form.website} onChange={handleField} placeholder="https://yourcompany.com" style={{ marginTop: 4 }} />
              </div>
              <div className="full">
                <label className="fieldLabel">Address Line</label>
                <input name="address" value={form.address} onChange={handleField} placeholder="123, Business Park, Sector 5" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">City</label>
                <input name="city" value={form.city} onChange={handleField} placeholder="Mumbai" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">State</label>
                <input name="state" value={form.state} onChange={handleField} placeholder="Maharashtra" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">Pincode</label>
                <input name="pincode" value={form.pincode} onChange={handleField} placeholder="400001" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">Country</label>
                <input name="country" value={form.country} onChange={handleField} placeholder="India" style={{ marginTop: 4 }} />
              </div>
            </div>
          )}

          {/* ── LEGAL & TAX ── */}
          {activeTab === "legal" && (
            <div className="formGrid">
              <div>
                <label className="fieldLabel">GST Number</label>
                <input name="gst_number" value={form.gst_number} onChange={handleField} placeholder="27AABCU9603R1ZX" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">PAN Number</label>
                <input name="pan_number" value={form.pan_number} onChange={handleField} placeholder="AABCU9603R" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">CIN Number</label>
                <input name="cin_number" value={form.cin_number} onChange={handleField} placeholder="U74999MH2020PTC123456" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">MSME / Udyam No.</label>
                <input name="msme_number" value={form.msme_number || ""} onChange={handleField} placeholder="UDYAM-MH-00-0000000" style={{ marginTop: 4 }} />
              </div>
              <div className="full">
                <label className="fieldLabel">Registered Address (if different from above)</label>
                <textarea name="reg_address" value={form.reg_address || ""} onChange={handleField} placeholder="Registered office address as per incorporation" rows={3} style={{ marginTop: 4, width: "100%", background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 11, padding: "10px 11px", fontSize: 12, resize: "vertical", color: "var(--text)" }} />
              </div>
            </div>
          )}

          {/* ── BANKING ── */}
          {activeTab === "banking" && (
            <div className="formGrid">
              <div>
                <label className="fieldLabel">Bank Name</label>
                <input name="bank_name" value={form.bank_name} onChange={handleField} placeholder="HDFC Bank" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">Account Number</label>
                <input name="bank_account" value={form.bank_account} onChange={handleField} placeholder="50200012345678" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">IFSC Code</label>
                <input name="bank_ifsc" value={form.bank_ifsc} onChange={handleField} placeholder="HDFC0001234" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">Branch</label>
                <input name="bank_branch" value={form.bank_branch} onChange={handleField} placeholder="Andheri West, Mumbai" style={{ marginTop: 4 }} />
              </div>
              <div>
                <label className="fieldLabel">Account Type</label>
                <select name="bank_account_type" value={form.bank_account_type || "Current"} onChange={handleField} style={{ width: "100%", marginTop: 4, background: "var(--panel2)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 11, padding: "10px 11px", fontSize: 12 }}>
                  <option>Current</option>
                  <option>Savings</option>
                  <option>OD / Overdraft</option>
                </select>
              </div>
              <div>
                <label className="fieldLabel">UPI ID (optional)</label>
                <input name="upi_id" value={form.upi_id || ""} onChange={handleField} placeholder="yourcompany@hdfcbank" style={{ marginTop: 4 }} />
              </div>
            </div>
          )}

          {/* ── BRAND & THEME ── */}
          {activeTab === "brand" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <div className="fieldLabel" style={{ marginBottom: 8 }}>Primary Brand Color</div>
                <p className="helperText" style={{ marginBottom: 12 }}>This color is applied to the sidebar, buttons, and accents throughout the ERP. Your team sees this on every screen.</p>
                <div className="colorSwatchRow">
                  {PRESET_COLORS.map((c) => (
                    <div
                      key={c}
                      className={`colorSwatch${form.primary_color === c ? " colorSwatchActive" : ""}`}
                      style={{ background: c }}
                      title={c}
                      onClick={() => handleColorPreset(c)}
                    />
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4 }}>
                    <input type="color" className="colorPickerInput" value={form.primary_color} onChange={handleColorInput} title="Custom color" />
                    <span className="helperText">Custom</span>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div className="fieldLabel" style={{ marginBottom: 6 }}>Live Preview</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ padding: "8px 16px", borderRadius: 9, background: form.primary_color, color: "#fff", fontWeight: 700, fontSize: 12 }}>Primary Button</div>
                    <div style={{ padding: "8px 16px", borderRadius: 9, background: `color-mix(in srgb, ${form.primary_color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${form.primary_color} 30%, transparent)`, color: form.primary_color, fontWeight: 700, fontSize: 12 }}>Subtle Chip</div>
                    <div style={{ width: 120, height: 36, borderRadius: 9, background: form.primary_color, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#fff", fontSize: 11, fontWeight: 700 }}>
                      <span>E365</span>
                    </div>
                  </div>
                  <div className="themePreviewBar" style={{ marginTop: 14, maxWidth: 400, background: `linear-gradient(90deg, ${form.primary_color}, #1A7B8A, #E8196B)` }} />
                </div>
              </div>

              <div>
                <div className="fieldLabel" style={{ marginBottom: 6 }}>Current Hex Value</div>
                <input
                  value={form.primary_color}
                  onChange={(e) => { setForm((p) => ({ ...p, primary_color: e.target.value })); if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) applyTheme(e.target.value); }}
                  placeholder="#3D0B1A"
                  style={{ width: 160, background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 11, padding: "10px 11px", fontSize: 13, color: "var(--text)" }}
                />
              </div>
            </div>
          )}

          {/* ── DOCUMENTS ── */}
          {activeTab === "documents" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p className="helperText">Upload company documents such as GST certificate, incorporation certificate, PAN card, trade licence, etc.</p>
              <button type="button" className="ghostBtn" style={{ alignSelf: "flex-start" }} onClick={() => docInputRef.current?.click()}>
                + Add Documents
              </button>
              <input ref={docInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style={{ display: "none" }} onChange={handleDocAdd} />
              {docs.length === 0
                ? <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No documents uploaded yet</div>
                : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {docs.map((doc, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: 12, background: "var(--panel2)", border: "1px solid var(--line)" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{doc.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                            {(doc.size / 1024).toFixed(1)} KB · {new Date(doc.added).toLocaleDateString()}
                          </div>
                        </div>
                        <button type="button" className="removeItemBtn" onClick={() => handleDocRemove(idx)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )}
        </div>

        {/* Save bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
          <button className="primaryBtn" type="submit" disabled={saving} style={{ padding: "11px 22px", fontSize: 13 }}>
            {saving ? "Saving…" : "Save Company Profile"}
          </button>
          {saved && <div className="messageBar success" style={{ flex: 1 }}>{saved}</div>}
        </div>
      </form>
    </div>
  );
}
