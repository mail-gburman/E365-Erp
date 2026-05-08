import React, { useEffect, useState } from "react";
import { adminApi } from "../api";
import Card from "../components/Card";
import { BOOKING_PROFILES, getBookingProfile } from "../bookingProfiles";

const blank = {
  name: "",
  legal_name: "",
  contact_person: "",
  phone: "",
  email: "",
  city: "",
  state: "",
  country: "India",
  booking_type: "equipment",
  admin_username: "",
  admin_password: "",
  admin_full_name: "",
  admin_email: "",
  admin_phone: "",
};

export default function MasterCompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    adminApi.companies().then(setCompanies).catch((e) => setMsg(String(e.message || e)));
  }

  useEffect(() => { load(); }, []);

  async function createCompany(e) {
    e.preventDefault();
    setMsg("");
    setSaving(true);
    try {
      await adminApi.createCompany(form);
      setForm(blank);
      setMsg("Company and company admin created.");
      load();
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setSaving(false);
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

  function selectField(key, label, options) {
    return (
      <div className="fieldStack">
        <label className="fieldLabel">{label}</label>
        <select value={form[key] || ""} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}>
          {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
    );
  }

  async function updateBookingType(company, bookingType) {
    setMsg("");
    try {
      await adminApi.updateCompany(company.id, { booking_type: bookingType });
      setMsg(`Booking type updated for ${company.name}.`);
      load();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  return (
    <div className="page">
      <h1 className="pageTitle">E365 Master Companies</h1>
      {msg ? <div className="messageBar">{msg}</div> : null}

      <Card title="Add Company Tenant">
        <form className="formGrid tenantFormGrid" onSubmit={createCompany}>
          {field("name", "Company Name", { required: true })}
          {field("legal_name", "Legal Name")}
          {field("contact_person", "Contact Person")}
          {field("phone", "Phone")}
          {field("email", "Company Email", { type: "email" })}
          {field("city", "City")}
          {field("state", "State")}
          {field("country", "Country")}
          {selectField("booking_type", "Type of Booking", BOOKING_PROFILES)}
          {field("admin_username", "Admin Username", { required: true })}
          {field("admin_password", "Admin Password", { type: "password", required: true })}
          {field("admin_full_name", "Admin Full Name")}
          {field("admin_email", "Admin Email", { type: "email" })}
          {field("admin_phone", "Admin Phone")}
          <button className="primaryBtn full" type="submit" disabled={saving}>{saving ? "Creating..." : "Create Company + Admin Login"}</button>
        </form>
      </Card>

      <Card title="Companies">
        <table className="dataTable">
          <thead><tr><th>ID</th><th>Company</th><th>Booking Type</th><th>Contact</th><th>Email</th><th>Status</th></tr></thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company.id}>
                <td>{company.id}</td>
                <td><strong>{company.name}</strong><br /><span className="helperText">{company.legal_name || "-"}</span></td>
                <td>
                  <select value={company.booking_type || "equipment"} onChange={(e) => updateBookingType(company, e.target.value)}>
                    {BOOKING_PROFILES.map((profile) => (
                      <option key={profile.value} value={profile.value}>{profile.label}</option>
                    ))}
                  </select>
                  <div className="helperText">{getBookingProfile(company.booking_type).addLabel} · {getBookingProfile(company.booking_type).registryLabel}</div>
                </td>
                <td>{company.contact_person || "-"}</td>
                <td>{company.email || "-"}</td>
                <td>{company.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
