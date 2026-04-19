import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import InfoHint from "../components/InfoHint";
import AutocompleteInput from "../components/AutocompleteInput";
import LocationAutocomplete from "../components/LocationAutocomplete";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import DatePicker from "../components/DatePicker";
import { api, downloadAuthorized } from "../api";

const blankProject = { title:"", show_type:"Reality Show", client_id:"", venue:"", origin_warehouse_id:"", shoot_start:"", shoot_end:"", status:"planned", notes:"", dates:[] };
const blankContact = { name:"", mobile:"", aadhar:"" };
const blankClientContact = { contact_name:"", designation:"", email:"", phone_country_code:"+91", phone_number:"", is_primary:false };

function groupEquipment(items = []) {
  const baseName = (value = "") => value.replace(/\s+#\d+\s*$/, "").trim();
  return Object.values(items.reduce((acc, item) => {
    const normalizedName = baseName(item.name || "");
    const key = `${normalizedName}__${item.item_type || ""}__${item.owner_type || ""}`;
    if (!acc[key]) {
      acc[key] = { name: normalizedName || item.name, count: 0, serials: [], ownerType: item.owner_type };
    }
    acc[key].count += 1;
    if (item.serial_number) acc[key].serials.push(item.serial_number);
    return acc;
  }, {}));
}

function formatEquipmentSummary(items = []) {
  const grouped = groupEquipment(items);
  if (!grouped.length) return "-";
  return grouped.map((item) => `${item.name} x${item.count}`).join(", ");
}

function pluralizeCount(count, singular, plural) {
  const resolvedPlural = plural || (singular.endsWith("y") ? `${singular.slice(0, -1)}ies` : `${singular}s`);
  return `${count} ${count === 1 ? singular : resolvedPlural}`;
}

function deriveShootWindow(selectedDates = []) {
  const travelDate = selectedDates.find((entry) => entry.type === "travel_day")?.date || "";
  const setupDate = selectedDates.find((entry) => entry.type === "setup_date")?.date || "";
  const technicalDate = selectedDates.find((entry) => entry.type === "technical_date")?.date || "";
  const shootDate = selectedDates.find((entry) => entry.type === "shoot_date")?.date || "";
  const endDay = selectedDates.find((entry) => entry.type === "end_day")?.date || "";
  const returnDay = selectedDates.find((entry) => entry.type === "return_day")?.date || "";
  const startDate = travelDate || setupDate || technicalDate || shootDate || endDay || returnDay || "";
  const endDate = returnDay || endDay || shootDate || technicalDate || setupDate || startDate;
  return {
    shoot_start: startDate ? `${startDate}T00:00` : "",
    shoot_end: endDate ? `${endDate}T23:59` : "",
  };
}

function displayDateOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function extractTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  const match = String(value).match(/T(\d{2}:\d{2})/);
  return match ? match[1] : String(value).slice(11, 16);
}

function composeDateTime(dateValue, timeValue, endOfDay = false) {
  if (!dateValue || !timeValue) return null;
  const normalizedTime = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
  return `${dateValue}T${normalizedTime}${endOfDay ? "" : ""}`;
}

function formatProjectDates(project) {
  const entries = [];
  if (project.shoot_start) entries.push(`Project Start: ${displayDateOnly(project.shoot_start)}`);
  if (project.shoot_end) entries.push(`Project End: ${displayDateOnly(project.shoot_end)}`);
  if (project.setup_date) entries.push(`Setup Day: ${project.setup_date}`);
  if (project.expected_start_date) entries.push(`Shoot Day: ${project.expected_start_date}`);
  if (project.expected_end_date) entries.push(`End Day: ${project.expected_end_date}`);
  if (project.off_days) entries.push(`Off Days: ${project.off_days}`);
  return entries.join(" | ") || "-";
}

function rangesOverlap(a, b) {
  return a?.block_start && a?.block_end && b?.block_start && b?.block_end
    ? a.block_start < b.block_end && b.block_start < a.block_end
    : false;
}

function ConfirmActionModal({ open, title, message, confirmLabel = "Confirm", tone = "primary", onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h2>{title}</h2>
        <p className="helperText" style={{ marginTop: 12 }}>{message}</p>
        <div className="modalFooter" style={{ marginTop: 16 }}>
          <button className="ghostBtn" type="button" onClick={onClose}>Go Back</button>
          <button className={tone === "danger" ? "dangerBtn" : "primaryBtn"} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function QuickProjectModal({ open, onClose, onSave, saving, clientSuggestions = [] }) {
  const [form, setForm] = useState({
    title: "",
    client_name: "",
    venue: "",
    show_type: "Reality Show",
    contacts: [{ ...blankClientContact, is_primary: true }],
  });

  useEffect(() => {
    if (open) {
      setForm({
        title: "",
        client_name: "",
        venue: "",
        show_type: "Reality Show",
        contacts: [{ ...blankClientContact, is_primary: true }],
      });
    }
  }, [open]);

  if (!open) return null;

  function setContact(index, key, value) {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact, i) => i === index ? { ...contact, [key]: value } : contact),
    }));
  }

  function addContact() {
    setForm((prev) => ({ ...prev, contacts: [...prev.contacts, { ...blankClientContact }] }));
  }

  function removeContact(index) {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.length === 1 ? prev.contacts : prev.contacts.filter((_, i) => i !== index),
    }));
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>Create Project</h2>
          <button className="ghostBtn modalCloseBtn" onClick={onClose}>Close</button>
        </div>
        <p className="helperText">Create a project with client name and multiple contact persons, then continue the booking.</p>
        <div className="formGrid" style={{ marginTop: 14 }}>
          <label className="fieldLabel">Project Name</label>
          <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Project / programme name" />
          <label className="fieldLabel">Client Name</label>
          <AutocompleteInput value={form.client_name} onChange={(value) => setForm((prev) => ({ ...prev, client_name: value }))} suggestions={clientSuggestions} placeholder="Client name" />
          <label className="fieldLabel">Show Type</label>
          <select value={form.show_type} onChange={(e) => setForm((prev) => ({ ...prev, show_type: e.target.value }))}><option>Reality Show</option><option>TV Show</option><option>TV Serial</option><option>Sports</option><option>Event</option></select>
          <label className="fieldLabel">Venue</label>
          <input value={form.venue} onChange={(e) => setForm((prev) => ({ ...prev, venue: e.target.value }))} placeholder="Venue / location" />
          <div className="full">
            <label className="fieldLabel">Client Contacts</label>
            <div className="stackForms">
              {form.contacts.map((contact, index) => (
                <div key={`quick-project-contact-${index}`} className="contactGrid">
                  <input value={contact.contact_name} onChange={(e) => setContact(index, "contact_name", e.target.value)} placeholder="Contact name" />
                  <input value={contact.designation} onChange={(e) => setContact(index, "designation", e.target.value)} placeholder="Designation" />
                  <input value={contact.email} onChange={(e) => setContact(index, "email", e.target.value)} placeholder="Email" />
                  <input value={contact.phone_country_code} onChange={(e) => setContact(index, "phone_country_code", e.target.value)} placeholder="Country code" />
                  <input value={contact.phone_number} onChange={(e) => setContact(index, "phone_number", e.target.value)} placeholder="Phone number" />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label className="checkCard" style={{ flex: 1 }}>
                      <input type="checkbox" checked={contact.is_primary} onChange={(e) => setContact(index, "is_primary", e.target.checked)} />
                      <span>Primary</span>
                    </label>
                    <button type="button" className="ghostBtn compactBtn" onClick={() => removeContact(index)}>Remove</button>
                  </div>
                </div>
              ))}
              <button type="button" className="ghostBtn compactBtn" onClick={addContact}>Add Contact</button>
            </div>
          </div>
        </div>
        <div className="modalFooter" style={{ marginTop: 16 }}>
          <button className="ghostBtn" type="button" onClick={onClose}>Cancel</button>
          <button
            className="primaryBtn"
            type="button"
            disabled={saving}
            onClick={() => onSave(form)}
          >
            {saving ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── SEARCH POPUP MODAL ───────── */
function SearchModal({ open, onClose, title, resourceType, onConfirmItems, availabilityParams }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [staged, setStaged] = useState([]);

  useEffect(() => {
    if (!open) return;
    setQ(""); setStaged([]); setResults([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      api.resourceSearch(q, resourceType, availabilityParams || {}).then(setResults);
    }, 200);
    return () => clearTimeout(timer);
  }, [q, resourceType, open, availabilityParams]);

  function toggleStage(item) {
    setStaged(prev =>
      prev.find(x => x.id === item.id)
        ? prev.filter(x => x.id !== item.id)
        : [...prev, item]
    );
  }

  function handleConfirm() {
    onConfirmItems(staged);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard searchModal" onClick={e => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>{title}</h2>
          <div className="searchModalHeaderActions">
            <span className="helperText">{staged.length} selected</span>
            <button className="ghostBtn modalCloseBtn" onClick={onClose}>Close</button>
          </div>
        </div>
        <input className="searchModalInput" autoFocus placeholder={`Search ${title.toLowerCase()}...`} value={q} onChange={e => setQ(e.target.value)} />
        <div className="searchModalResults">
          {results.length === 0 && <p className="helperText" style={{ padding: 12 }}>No results. Try a different search.</p>}
          {results.map(r => {
            const isSelected = staged.find(x => x.id === r.id);
            const isAvailable = r.status === "available";
            const isPlanned = r.status === "planned_for_selected_dates";
            const canSelect = isAvailable || isPlanned;
            return (
              <div key={r.id} className={`searchModalRow ${isSelected ? "searchModalRowSelected" : ""} ${!canSelect ? "searchModalRowDisabled" : ""}`} onClick={() => canSelect && toggleStage(r)}>
                <div className="searchModalRowInfo">
                  <span className="searchModalLabel">{r.label}</span>
                  {r.owner_type === "third_party" && <span className="badge badgeThirdParty">3rd Party</span>}
                  {r.manpower_type && r.manpower_type !== "inhouse" && <span className="badge badgeExternal">{r.manpower_type}</span>}
                  {isPlanned && <span className="badge badgeOptional">Planned on selected dates</span>}
                </div>
                <div className="searchModalRowAction">
                  {!canSelect && <span className="badge badgeUnavail">{r.status}</span>}
                  {canSelect && <button type="button" className={`selectIndicator ${isSelected ? "selectIndicatorActive" : ""}`} onClick={(e) => { e.stopPropagation(); toggleStage(r); }}>{isSelected ? "Selected" : "Select"}</button>}
                </div>
              </div>
            );
          })}
        </div>
        {staged.length > 0 && (
          <div className="stagedSection">
            <strong>{staged.length} item(s) selected:</strong>
            <div className="selectedChips" style={{ marginTop: 6 }}>
              {staged.map(r => (
                <span className="chip" key={r.id}>
                  {r.label.split(" · ")[1] || r.label.split(" · ")[0]}
                  <button type="button" onClick={() => toggleStage(r)}>x</button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="modalFooter">
          <button className="ghostBtn" type="button" onClick={onClose}>Cancel</button>
          <button className="primaryBtn" type="button" onClick={handleConfirm} disabled={staged.length === 0}>Confirm {staged.length} Item(s)</button>
        </div>
      </div>
    </div>
  );
}

/* ───────── CONFIRM BOOKING MODAL ───────── */
function ConfirmBookingModal({ open, onClose, onConfirm, project, destination, equipment, accessories, crew, requiredInfo, referenceId, contacts }) {
  if (!open) return null;
  const missingMandatory = (requiredInfo.required_codes || []).filter(code => {
    return !accessories.find(a => (a.label || "").toLowerCase().includes(code.toLowerCase()));
  });
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard confirmModal" onClick={e => e.stopPropagation()}>
        <h2>Confirm Booking</h2>
        <p className="helperText">Review all selected resources before creating the booking.</p>
        <div className="confirmSection"><h3>Project: {project || "-"}</h3><h3>Destination: {destination || "-"}</h3>{referenceId ? <h4>Reference ID: {referenceId}</h4> : null}</div>
        {contacts?.length > 0 && (<div className="confirmSection"><h4>Contacts</h4><div className="confirmItemList">{contacts.map((contact, index) => (<div key={`${contact.name}-${index}`} className="confirmItem"><span>{contact.name}{contact.mobile ? ` · ${contact.mobile}` : ""}{contact.aadhar ? ` · ${contact.aadhar}` : ""}</span></div>))}</div></div>)}
        {equipment.length > 0 && (<div className="confirmSection"><h4>Main Equipment ({equipment.length})</h4><div className="confirmItemList">{equipment.map(e => (<div key={e.id} className="confirmItem"><span>{e.label}</span>{e.owner_type === "third_party" && <span className="badge badgeThirdParty">3rd Party</span>}</div>))}</div></div>)}
        {accessories.length > 0 && (<div className="confirmSection"><h4>Accessories ({accessories.length})</h4><div className="confirmItemList">{accessories.map(e => (<div key={e.id} className="confirmItem"><span>{e.label}</span></div>))}</div></div>)}
        {requiredInfo.required_codes?.length > 0 && (<div className="confirmSection"><h4>Mandatory Accessory Check</h4>{missingMandatory.length > 0 ? <p style={{color:"#fca5a5"}}>Missing mandatory: {missingMandatory.join(", ")}</p> : <p style={{color:"#86efac"}}>All mandatory accessories included.</p>}</div>)}
        {crew.length > 0 && (<div className="confirmSection"><h4>Manpower ({crew.length})</h4><div className="confirmItemList">{crew.map(c => (<div key={c.id} className="confirmItem"><span>{c.label}</span>{c.manpower_type && c.manpower_type !== "inhouse" && <span className="badge badgeExternal">{c.manpower_type}</span>}</div>))}</div></div>)}
        <div className="modalFooter">
          <button className="ghostBtn" type="button" onClick={onClose}>Go Back & Edit</button>
          <button className="primaryBtn" type="button" onClick={onConfirm}>Create Booking</button>
        </div>
      </div>
    </div>
  );
}

/* ───────── CANCEL REASON MODAL ───────── */
function CancelReasonModal({ open, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  if (!open) return null;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={e => e.stopPropagation()} style={{maxWidth:480}}>
        <h2>Cancellation Reason</h2>
        <p className="helperText">Please provide a reason for cancelling this booking.</p>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for cancellation..." rows={3} style={{width:"100%",marginTop:12}} required />
        <div className="modalFooter" style={{marginTop:12}}>
          <button className="ghostBtn" onClick={onClose}>Go Back</button>
          <button className="dangerBtn" onClick={() => { onConfirm(reason); setReason(""); }} disabled={!reason.trim()}>Confirm Cancellation</button>
        </div>
      </div>
    </div>
  );
}

/* ───────── DAMAGE LOG MODAL ───────── */
function DamageLogModal({ open, onClose, booking, onSave }) {
  const [itemId, setItemId] = useState("");
  const [desc, setDesc] = useState("");
  const [severity, setSeverity] = useState("minor");
  const [reportedBy, setReportedBy] = useState("Store QC");
  const [stage, setStage] = useState("return");
  const [autoService, setAutoService] = useState(true);
  const [photoFile, setPhotoFile] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!open || !booking) return null;

  async function submit() {
    if (!itemId || !desc.trim()) return;
    setSaving(true);
    try {
      const result = await api.createDamage({
        booking_id: booking.id,
        inventory_item_id: Number(itemId),
        damage_description: desc,
        severity,
        reported_by: reportedBy,
        stage,
        auto_create_service_job: autoService,
      });
      if (photoFile && result.id) {
        await api.uploadDamagePhoto(result.id, photoFile);
      }
      onSave();
      onClose();
      setItemId(""); setDesc(""); setSeverity("minor"); setPhotoFile(null);
    } catch (e) {
      alert(String(e.message || e));
    }
    setSaving(false);
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={e => e.stopPropagation()} style={{maxWidth:560}}>
        <div className="modalHeader"><h2>Log Damage - {booking.job_card_id}</h2><button className="ghostBtn modalCloseBtn" onClick={onClose}>Close</button></div>
        <div className="formGrid" style={{marginTop:12}}>
          <label className="fieldLabel">Damaged Item</label>
          <select value={itemId} onChange={e => setItemId(e.target.value)} required>
            <option value="">Select equipment</option>
            {(booking.equipment || []).map(eq => <option key={eq.id} value={eq.id}>{eq.asset_code} - {eq.name}</option>)}
          </select>
          <label className="fieldLabel">Damage Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the damage..." rows={3} required />
          <label className="fieldLabel">Severity</label>
          <select value={severity} onChange={e => setSeverity(e.target.value)}>
            <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
          </select>
          <label className="fieldLabel">Stage</label>
          <select value={stage} onChange={e => setStage(e.target.value)}>
            <option value="dispatch">Dispatch</option><option value="return">Return</option>
          </select>
          <label className="fieldLabel">Reported By</label>
          <input value={reportedBy} onChange={e => setReportedBy(e.target.value)} />
          <label className="fieldLabel">Photo Evidence</label>
          <input type="file" accept="image/*" onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
          <label className="checkCard full">
            <input type="checkbox" checked={autoService} onChange={e => setAutoService(e.target.checked)} />
            <span>Auto-create Service Job for this damage</span>
          </label>
        </div>
        <div className="modalFooter" style={{marginTop:12}}>
          <button className="ghostBtn" onClick={onClose}>Cancel</button>
          <button className="primaryBtn" onClick={submit} disabled={saving || !itemId || !desc.trim()}>{saving ? "Saving..." : "Log Damage"}</button>
        </div>
      </div>
    </div>
  );
}

/* ───────── EDIT BOOKING MODAL ───────── */
function EditBookingModal({ open, onClose, booking, project, onConfirmSave }) {
  const [form, setForm] = useState({});
  const [contacts, setContacts] = useState([blankContact]);
  const projectDates = useMemo(() => {
    const map = {};
    (project?.dates || []).forEach((row) => {
      const type = ({ start_date: "shoot_date", end_date: "end_day" }[row.date_type] || row.date_type);
      if (!map[type]) map[type] = [];
      map[type].push(row.date_value);
    });
    return map;
  }, [project]);
  const travelDate = projectDates.travel_day?.[0] || "";
  const returnDate = projectDates.return_day?.slice(-1)[0] || displayDateOnly(project?.shoot_end);
  useEffect(() => {
    if (booking) {
      setForm({
        destination: booking.destination || "",
        remarks: booking.remarks || "",
        transport_mode: booking.transport_mode || "",
        awb_number: booking.awb_number || "",
        contact_person_name: booking.contact_person_name || "",
        contact_person_mobile: booking.contact_person_mobile || "",
        contact_person_aadhar: booking.contact_person_aadhar || "",
        call_time: extractTimeValue(booking.call_time),
        pickup_time: extractTimeValue(booking.pickup_time),
        packup_time: extractTimeValue(booking.packup_time),
      });
      const normalized = booking.contacts?.length ? booking.contacts : [{ name: booking.contact_person_name || "", mobile: booking.contact_person_mobile || "", aadhar: booking.contact_person_aadhar || "" }];
      setContacts(normalized);
    }
  }, [booking]);

  if (!open || !booking) return null;

  function updateContact(index, key, value) {
    setContacts((prev) => prev.map((contact, i) => i === index ? { ...contact, [key]: value } : contact));
  }

  function addContact() {
    setContacts((prev) => [...prev, { ...blankContact }]);
  }

  function removeContact(index) {
    setContacts((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  function save() {
    onConfirmSave(async () => {
      try {
        await api.updateBooking(booking.id, {
          ...form,
          contacts,
          call_time: composeDateTime(travelDate, form.call_time),
          pickup_time: composeDateTime(travelDate, form.pickup_time),
          packup_time: composeDateTime(returnDate, form.packup_time),
        });
        onClose();
      } catch (e) { alert(String(e.message || e)); }
    }, booking);
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={e => e.stopPropagation()} style={{maxWidth:560}}>
        <div className="modalHeader"><h2>Edit Booking - {booking.job_card_id}</h2><button className="ghostBtn modalCloseBtn" onClick={onClose}>Close</button></div>
        <div className="formGrid" style={{marginTop:12}}>
          <label className="fieldLabel">Destination</label>
          <LocationAutocomplete value={form.destination || ""} onChange={v => setForm({...form, destination: v})} placeholder="Search Indian location..." />
          <label className="fieldLabel">Transport Mode</label>
          <select value={form.transport_mode} onChange={e => setForm({...form, transport_mode: e.target.value})}>
            <option value="">Select</option><option value="company_vehicle">Company Vehicle</option><option value="hired">Hired Vehicle</option><option value="courier">Courier</option><option value="self">Self</option>
          </select>
          <label className="fieldLabel">AWB / Tracking Number</label>
          <input value={form.awb_number} onChange={e => setForm({...form, awb_number: e.target.value})} placeholder="AWB or tracking number" />
          <label className="fieldLabel">Contact Person</label>
          <input value={form.contact_person_name} onChange={e => setForm({...form, contact_person_name: e.target.value})} placeholder="Name" />
          <label className="fieldLabel">Contact Mobile</label>
          <input value={form.contact_person_mobile} onChange={e => setForm({...form, contact_person_mobile: e.target.value})} placeholder="+91..." />
          <label className="fieldLabel">Contact Aadhar</label>
          <input value={form.contact_person_aadhar} onChange={e => setForm({...form, contact_person_aadhar: e.target.value})} placeholder="Aadhar number" />
          <div className="full">
            <label className="fieldLabel">Booking Contacts</label>
            <div className="stackForms">
              {contacts.map((contact, index) => (
                <div className="contactGrid" key={`edit-contact-${index}`}>
                  <input value={contact.name || ""} onChange={(e) => updateContact(index, "name", e.target.value)} placeholder="Contact name" />
                  <input value={contact.mobile || ""} onChange={(e) => updateContact(index, "mobile", e.target.value)} placeholder="Mobile" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={contact.aadhar || ""} onChange={(e) => updateContact(index, "aadhar", e.target.value)} placeholder="Aadhar" />
                    <button type="button" className="ghostBtn compactBtn" onClick={() => removeContact(index)}>Remove</button>
                  </div>
                </div>
              ))}
              <button type="button" className="ghostBtn compactBtn" onClick={addContact}>Add Contact</button>
            </div>
          </div>
          <label className="fieldLabel">Call Time {travelDate ? `(${travelDate})` : ""}</label>
          <input type="time" value={form.call_time || ""} onChange={e => setForm({...form, call_time: e.target.value})} />
          <label className="fieldLabel">Pickup Time {travelDate ? `(${travelDate})` : ""}</label>
          <input type="time" value={form.pickup_time || ""} onChange={e => setForm({...form, pickup_time: e.target.value})} />
          <label className="fieldLabel">Packup Time {returnDate ? `(${returnDate})` : ""}</label>
          <input type="time" value={form.packup_time || ""} onChange={e => setForm({...form, packup_time: e.target.value})} />
          <label className="fieldLabel full">Remarks</label>
          <textarea className="full" value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} placeholder="Remarks" />
        </div>
        <div className="modalFooter" style={{marginTop:12}}>
          <button className="ghostBtn" onClick={onClose}>Cancel</button>
          <button className="primaryBtn" onClick={save}>Review Save</button>
        </div>
      </div>
    </div>
  );
}

/* ───────── SELECTED ITEMS BLOCK ───────── */
function SelectedBlock({ title, items, onAddMore, onRemove, badgeField, badgeValues, infoText, availableCount = 0, availabilityMode = "overall" }) {
  return (
    <div className="selectedBlock">
      <div className="selectedBlockHeader">
        <strong>{title} ({items.length}{availableCount === null ? " selected" : ` of ${availableCount} selected`}) <InfoHint text={infoText} /></strong>
        <button type="button" className="addMoreBtn" onClick={onAddMore}>+ Add More</button>
      </div>
      <p className="helperText" style={{margin:"8px 0"}}>{availableCount === null ? "Select project dates first to check availability." : availabilityMode === "selected_dates" ? `${availableCount} available for selected dates` : `${availableCount} total in system. Select dates to check conflicts.`}</p>
      {items.length === 0 && <p className="helperText" style={{margin:"8px 0"}}>No items selected yet. Click "Add More" to search and add.</p>}
      {items.length > 0 && (
        <div className="selectedItemsGrid">
          {items.map(r => (
            <div className="selectedItemCard" key={r.id}>
              <div className="selectedItemInfo">
                <span className="selectedItemName">{r.label.split(" · ").slice(0,2).join(" · ")}</span>
                {badgeField && badgeValues && badgeValues.includes(r[badgeField]) && <span className="badge badgeThirdParty">{r[badgeField] === "third_party" ? "3rd Party" : r[badgeField]}</span>}
              </div>
              <button type="button" className="removeItemBtn" onClick={() => onRemove(r.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ═════════ MAIN BOOKINGS PAGE ═════════ */
export default function BookingsPage() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [crew, setCrew] = useState([]);
  const [bookingDetails, setBookingDetails] = useState([]);
  const [bookingSearch, setBookingSearch] = useState("");
  const [plannedSearch, setPlannedSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("");
  const [message, setMessage] = useState("");
  const [projectForm, setProjectForm] = useState(blankProject);
  const [projectMode, setProjectMode] = useState("existing");
  const [existingBookingMode, setExistingBookingMode] = useState("normal");
  const [selectedDates, setSelectedDates] = useState([]);
  const [bookingProjectId, setBookingProjectId] = useState("");
  const [destination, setDestination] = useState("");
  const [bookingStatus, setBookingStatus] = useState("planned");
  const [equipmentSelected, setEquipmentSelected] = useState([]);
  const [accessorySelected, setAccessorySelected] = useState([]);
  const [crewSelected, setCrewSelected] = useState([]);
  const [requiredInfo, setRequiredInfo] = useState({ required_codes: [], optional_codes: [], required_matches: [], optional_matches: [] });
  const [remarks, setRemarks] = useState("");
  const [transportMode, setTransportMode] = useState("");
  const [awbNumber, setAwbNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [contactAadhar, setContactAadhar] = useState("");
  const [contacts, setContacts] = useState([{ ...blankContact }]);
  const [callTime, setCallTime] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [packupTime, setPackupTime] = useState("");
  const [parentBookingId, setParentBookingId] = useState("");

  // Booking tab navigation
  const [bookingTab, setBookingTab] = useState("new"); // "new" | "modify" | "planned" | "all"

  // Modify Booking tab state
  const [modifyShootBooking, setModifyShootBooking] = useState(null);
  const [modifyDates, setModifyDates] = useState([]);
  const [modifyEquipment, setModifyEquipment] = useState([]);
  const [modifyAccessories, setModifyAccessories] = useState([]);
  const [modifyCrew, setModifyCrew] = useState([]);
  const [modifyNotes, setModifyNotes] = useState("");
  const [modifyResult, setModifyResult] = useState(null);
  const [modifySaving, setModifySaving] = useState(false);
  const [modifyEquipModal, setModifyEquipModal] = useState(false);
  const [modifyAccModal, setModifyAccModal] = useState(false);
  const [modifyCrewModal, setModifyCrewModal] = useState(false);

  // Modal states
  const [equipModal, setEquipModal] = useState(false);
  const [accModal, setAccModal] = useState(false);
  const [crewModal, setCrewModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelBookingId, setCancelBookingId] = useState(null);
  const [damageModal, setDamageModal] = useState(false);
  const [damageBooking, setDamageBooking] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [editBooking, setEditBooking] = useState(null);
  const [plannedShoots, setPlannedShoots] = useState([]);
  const [plannedSelected, setPlannedSelected] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);
  const [quickProjectOpen, setQuickProjectOpen] = useState(false);
  const [quickProjectSaving, setQuickProjectSaving] = useState(false);

  async function doJobCardDownload(id, jobCardId) {
    try {
      await downloadAuthorized(api.jobCardPdfUrl(id), `jobcard_${jobCardId || id}.pdf`);
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  const load = () => {
    api.projects().then((x)=>{ 
      setProjects(x); 
      setPlannedShoots(x.filter(p => p.status === "planned"));
    });
    api.clients().then(setClients);
    api.warehouses().then(setWarehouses);
    api.inventory().then(setInventory);
    api.crew().then(setCrew);
    api.bookingDetails().then(setBookingDetails);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (equipmentSelected.length) api.requiredAccessories(equipmentSelected.map(x => x.id)).then(setRequiredInfo);
    else setRequiredInfo({ required_codes: [], optional_codes: [], required_matches: [], optional_matches: [] });
  }, [equipmentSelected]);

  const activeBookingsByProject = useMemo(() => {
    return bookingDetails.reduce((acc, booking) => {
      if (["cancelled", "returned"].includes(booking.status)) return acc;
      if (!acc[booking.project_id]) acc[booking.project_id] = [];
      acc[booking.project_id].push(booking);
      return acc;
    }, {});
  }, [bookingDetails]);

  const projectSummaries = useMemo(() => {
    return projects.reduce((acc, project) => {
      const projectBookings = activeBookingsByProject[project.id] || [];
      const equipment = projectBookings.flatMap((booking) => booking.equipment || []);
      const accessories = projectBookings.flatMap((booking) => booking.accessories || []);
      const crew = projectBookings.flatMap((booking) => booking.crew || []);
      acc[project.id] = {
        bookingCount: projectBookings.length,
        equipment,
        accessories,
        crew,
        equipmentCount: equipment.length,
        accessoryCount: accessories.length,
        crewCount: crew.length,
        equipmentSummary: formatEquipmentSummary(equipment),
      };
      return acc;
    }, {});
  }, [projects, activeBookingsByProject]);

  const availabilityWindow = useMemo(() => {
    if (projectMode === "existing") {
      return null;
    }
    const datedEntries = selectedDates.map((entry) => entry.date).filter(Boolean).sort();
    if (datedEntries.length) {
      return {
        block_start: `${datedEntries[0]}T00:00:00`,
        block_end: `${datedEntries[datedEntries.length - 1]}T23:59:59`,
      };
    }
    return null;
  }, [projectMode, selectedDates]);

  const currentProject = useMemo(
    () => projects.find((item) => String(item.id) === String(bookingProjectId)) || null,
    [projects, bookingProjectId]
  );
  const currentProjectDates = useMemo(() => {
    const map = {};
    (currentProject?.dates || []).forEach((row) => {
      const type = ({ start_date: "shoot_date", end_date: "end_day" }[row.date_type] || row.date_type);
      if (!map[type]) map[type] = [];
      map[type].push(row.date_value);
    });
    return map;
  }, [currentProject]);
  const travelDay = useMemo(
    () => (projectMode === "new"
      ? selectedDates.find((entry) => entry.type === "travel_day")?.date
      : currentProjectDates.travel_day?.[0]) || "",
    [projectMode, selectedDates, currentProjectDates]
  );
  const returnDay = useMemo(
    () => (projectMode === "new"
      ? selectedDates.find((entry) => entry.type === "return_day")?.date
      : currentProjectDates.return_day?.slice(-1)[0]) || displayDateOnly(currentProject?.shoot_end),
    [projectMode, selectedDates, currentProjectDates, currentProject]
  );

  const clientFilteredProjects = useMemo(() => {
    if (projectMode !== "existing") return projects;
    if (!projectForm.client_id) return projects;
    return projects.filter((project) => String(project.client_id || "") === String(projectForm.client_id));
  }, [projects, projectMode, projectForm.client_id]);

  const supplementaryChoices = useMemo(() => {
    if (!bookingDetails.length) return [];
    return bookingDetails.filter((booking) => {
      if (!projectForm.client_id) return true;
      const project = projects.find((item) => item.id === booking.project_id);
      return String(project?.client_id || "") === String(projectForm.client_id);
    });
  }, [bookingDetails, projectForm.client_id, projects]);

  const availableCounts = useMemo(() => {
    const activeInventory = inventory.filter((item) => !["inactive", "cancelled"].includes(item.status));
    const bookableInventory = activeInventory.filter((item) => item.status !== "servicing" && item.service_status !== "in_service");
    const overall = {
      equipment: activeInventory.filter((item) => ["device", "kit", "bundle", "third_party_equipment"].includes(item.item_type)).length,
      accessories: activeInventory.filter((item) => item.item_type === "accessory").length,
      manpower: crew.filter((person) => !["inactive", "cancelled"].includes(person.status)).length,
      mode: "overall",
    };
    if (!availabilityWindow?.block_start || !availabilityWindow?.block_end) {
      return overall;
    }
    const activeBookings = bookingDetails.filter((booking) => ["confirmed", "blocked", "dispatched"].includes(booking.status));
    const overlapsWindow = (booking) => {
      const project = projects.find((item) => item.id === booking.project_id);
      return project?.block_start && project?.block_end && rangesOverlap(
        { block_start: availabilityWindow.block_start, block_end: availabilityWindow.block_end },
        project
      );
    };
    const blockedInventoryIds = new Set(activeBookings.filter(overlapsWindow).flatMap((booking) => (booking.equipment || []).map((item) => item.id)));
    const blockedCrewIds = new Set(activeBookings.filter(overlapsWindow).flatMap((booking) => (booking.crew || []).map((member) => member.id)));
    return {
      equipment: bookableInventory.filter((item) => ["device", "kit", "bundle", "third_party_equipment"].includes(item.item_type) && !blockedInventoryIds.has(item.id)).length,
      accessories: bookableInventory.filter((item) => item.item_type === "accessory" && !blockedInventoryIds.has(item.id)).length,
      manpower: crew.filter((person) => !["inactive", "cancelled"].includes(person.status) && !blockedCrewIds.has(person.id)).length,
      mode: "selected_dates",
    };
  }, [inventory, crew, availabilityWindow, bookingDetails, projects]);

  useEffect(() => {
    if (projectMode !== "new") return;
    const derived = deriveShootWindow(selectedDates);
    setProjectForm((prev) => {
      if (prev.shoot_start === derived.shoot_start && prev.shoot_end === derived.shoot_end) {
        return prev;
      }
      return {
        ...prev,
        shoot_start: derived.shoot_start,
        shoot_end: derived.shoot_end,
      };
    });
  }, [projectMode, selectedDates]);

  function normalizedContacts() {
    const cleaned = contacts.map((contact) => ({
      name: (contact.name || "").trim(),
      mobile: (contact.mobile || "").trim(),
      aadhar: (contact.aadhar || "").trim(),
    })).filter((contact) => contact.name);
    if (cleaned.length) return cleaned;
    if (contactName.trim()) {
      return [{ name: contactName.trim(), mobile: contactMobile.trim(), aadhar: contactAadhar.trim() }];
    }
    return [];
  }

  function updateContact(index, key, value) {
    setContacts((prev) => prev.map((contact, i) => i === index ? { ...contact, [key]: value } : contact));
  }

  function addContact() {
    setContacts((prev) => [...prev, { ...blankContact }]);
  }

  function removeContact(index) {
    setContacts((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  function buildProjectPayload() {
    return {
      ...projectForm,
      client_id: projectForm.client_id ? Number(projectForm.client_id) : null,
      origin_warehouse_id: projectForm.origin_warehouse_id ? Number(projectForm.origin_warehouse_id) : null,
      shoot_end: projectForm.shoot_end || null,
      setup_days: 0,
      off_days: 0,
      setup_date: null,
      expected_start_date: null,
      expected_end_date: null,
      dates: selectedDates.map(d => ({ date_type: d.type, date_value: d.date })),
    };
  }

  async function handleQuickProjectCreate(form) {
    if (!form.title.trim() || !form.client_name.trim() || !form.venue.trim()) {
      setMessage("Enter project name, client name, and venue to create a project.");
      return;
    }
    setQuickProjectSaving(true);
    try {
      const existingClient = clients.find((client) => client.name.trim().toLowerCase() === form.client_name.trim().toLowerCase());
      const contacts = form.contacts
        .map((contact) => ({
          ...contact,
          contact_name: (contact.contact_name || "").trim(),
          designation: (contact.designation || "").trim(),
          email: (contact.email || "").trim(),
          phone_country_code: (contact.phone_country_code || "").trim() || "+91",
          phone_number: (contact.phone_number || "").trim(),
        }))
        .filter((contact) => contact.contact_name);
      const client = existingClient || await api.createClient({
        name: form.client_name.trim(),
        industry_type: "",
        billing_address: form.venue.trim(),
        gst_number: "",
        notes: "",
        contacts: contacts.length ? contacts : [{ ...blankClientContact, contact_name: form.client_name.trim(), is_primary: true }],
      });
      const project = await api.createProject({
        title: form.title.trim(),
        show_type: form.show_type,
        client_id: client.id,
        venue: form.venue.trim(),
        origin_warehouse_id: null,
        shoot_start: null,
        shoot_end: null,
        setup_date: null,
        off_days: 0,
        expected_start_date: null,
        expected_end_date: null,
        setup_days: 0,
        status: "draft",
        notes: "",
        dates: [],
      });
      setProjectForm((prev) => ({ ...prev, client_id: String(client.id) }));
      setBookingProjectId(String(project.id));
      setQuickProjectOpen(false);
      setMessage(`Project ${project.title} created and selected for booking.`);
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
    setQuickProjectSaving(false);
  }

  function handleReviewBooking(e) {
    e.preventDefault();
    if (projectMode === "existing" && !bookingProjectId) { setMessage("Select a project."); return; }
    if (projectMode === "new") {
      if (!projectForm.title.trim() || !projectForm.venue.trim()) {
        setMessage("Enter the project title and venue before reviewing.");
        return;
      }
    }
    if (projectMode === "new" && (!availabilityWindow?.block_start || !availabilityWindow?.block_end)) {
      setMessage("Select project dates before reviewing the booking.");
      return;
    }
    if (!destination.trim()) { setMessage("Destination is required."); return; }
    if (!equipmentSelected.length && !accessorySelected.length && !crewSelected.length) {
      setMessage("Add at least one equipment, accessory, or crew member."); return;
    }
    setConfirmModal(true);
  }

  async function submitBooking() {
    try {
      let resolvedProjectId = Number(bookingProjectId);
      if (projectMode === "new") {
        const createdProject = await api.createProject(buildProjectPayload());
        resolvedProjectId = createdProject.id;
      }
      await api.createBooking({
        project_id: resolvedProjectId,
        destination,
        status: bookingStatus,
        equipment_ids: equipmentSelected.map(x => x.id),
        accessory_ids: accessorySelected.map(x => x.id),
        crew_ids: crewSelected.map(x => x.id),
        remarks,
        parent_booking_id: parentBookingId ? Number(parentBookingId) : null,
        transport_mode: transportMode || null,
        awb_number: awbNumber || null,
        contact_person_name: contactName || null,
        contact_person_mobile: contactMobile || null,
        contact_person_aadhar: contactAadhar || null,
        contacts: normalizedContacts(),
        call_time: composeDateTime(travelDay, callTime),
        pickup_time: composeDateTime(travelDay, pickupTime),
        packup_time: composeDateTime(returnDay, packupTime),
      });
      setMessage(projectMode === "new" ? "Project and booking created together. Job card & challan are ready." : "Booking created. Job card & challan available for download.");
      setProjectMode("existing");
      setExistingBookingMode("normal");
      setProjectForm(blankProject);
      setSelectedDates([]);
      setDestination(""); setBookingStatus("planned"); setEquipmentSelected([]); setAccessorySelected([]); setCrewSelected([]);
      setRemarks(""); setTransportMode(""); setAwbNumber(""); setContactName(""); setContactMobile(""); setContactAadhar(""); setContacts([{ ...blankContact }]); setCallTime(""); setPickupTime(""); setParentBookingId("");
      setConfirmModal(false);
      load();
    } catch (e) { setMessage(String(e.message || e)); setConfirmModal(false); }
  }

  function addEquipment(items) {
    setEquipmentSelected(prev => { const existing = new Set(prev.map(x => x.id)); return [...prev, ...items.filter(x => !existing.has(x.id))]; });
  }
  function addAccessories(items) {
    setAccessorySelected(prev => { const existing = new Set(prev.map(x => x.id)); return [...prev, ...items.filter(x => !existing.has(x.id))]; });
  }
  function addCrew(items) {
    setCrewSelected(prev => { const existing = new Set(prev.map(x => x.id)); return [...prev, ...items.filter(x => !existing.has(x.id))]; });
  }

  async function doDispatch(id) { try { await api.dispatchBooking(id); setMessage("Booking dispatched."); load(); } catch(e){ setMessage(String(e.message||e)); } }

  // Return QC modal state
  const [returnQCModal, setReturnQCModal] = useState(false);
  const [returnBookingId, setReturnBookingId] = useState(null);
  const [qcForm, setQcForm] = useState({ checked_by: "Store QC", all_items_returned: true, damage_found: false, cleaning_required: false, remarks: "" });
  const [qcSubmitting, setQcSubmitting] = useState(false);

  function openReturnQC(bookingId) {
    setReturnBookingId(bookingId);
    setQcForm({ checked_by: "Store QC", all_items_returned: true, damage_found: false, cleaning_required: false, remarks: "" });
    setReturnQCModal(true);
  }

  async function submitReturnQC() {
    if (!qcForm.checked_by.trim()) { setMessage("Checked By is required."); return; }
    setQcSubmitting(true);
    try {
      await api.createQC({ booking_id: returnBookingId, ...qcForm });
      await api.returnBooking(returnBookingId);
      setMessage("QC completed and booking marked returned.");
      setReturnQCModal(false);
      load();
    } catch (e) { setMessage(String(e.message || e)); }
    setQcSubmitting(false);
  }

  async function doCancel(reason) {
    try {
      await api.cancelBooking(cancelBookingId, reason);
      setMessage("Booking cancelled.");
      setCancelModal(false);
      setCancelBookingId(null);
      load();
    } catch(e){ setMessage(String(e.message||e)); }
  }

  async function confirmPlanned(ids) {
    const candidateProjects = projects.filter(p => ids.includes(p.id));
    const comparisonProjects = projects.filter(p => p.status === "confirmed" && !ids.includes(p.id));
    const seenConflicts = [];

    for (const candidate of candidateProjects) {
      const candidateEquipmentIds = new Set((projectSummaries[candidate.id]?.equipment || []).map(item => item.id));
      if (!candidateEquipmentIds.size) continue;

      for (const confirmed of comparisonProjects) {
        if (!rangesOverlap(candidate, confirmed)) continue;
        const confirmedEquipmentIds = new Set((projectSummaries[confirmed.id]?.equipment || []).map(item => item.id));
        const conflictIds = [...candidateEquipmentIds].filter(id => confirmedEquipmentIds.has(id));
        if (conflictIds.length) {
          const labels = (projectSummaries[candidate.id]?.equipment || [])
            .filter(item => conflictIds.includes(item.id))
            .map(item => item.name)
            .filter(Boolean);
          seenConflicts.push(`${candidate.title} conflicts with ${confirmed.title} on ${[...new Set(labels)].join(", ")}`);
        }
      }
    }

    for (let i = 0; i < candidateProjects.length; i += 1) {
      for (let j = i + 1; j < candidateProjects.length; j += 1) {
        const left = candidateProjects[i];
        const right = candidateProjects[j];
        if (!rangesOverlap(left, right)) continue;
        const leftIds = new Set((projectSummaries[left.id]?.equipment || []).map(item => item.id));
        const rightIds = new Set((projectSummaries[right.id]?.equipment || []).map(item => item.id));
        const conflictIds = [...leftIds].filter(id => rightIds.has(id));
        if (conflictIds.length) {
          const labels = (projectSummaries[left.id]?.equipment || [])
            .filter(item => conflictIds.includes(item.id))
            .map(item => item.name)
            .filter(Boolean);
          seenConflicts.push(`${left.title} conflicts with ${right.title} on ${[...new Set(labels)].join(", ")}`);
        }
      }
    }

    if (seenConflicts.length) {
      setMessage(seenConflicts[0]);
      return;
    }
    try {
      for (const id of ids) {
        await api.updateProject(id, { status: "confirmed" });
      }
      setMessage(`${ids.length} shoot(s) confirmed.`);
      setPlannedSelected([]);
      load();
    } catch (e) { setMessage(String(e.message || e)); }
  }

  async function cancelPlanned(ids) {
    try {
      for (const id of ids) {
        await api.updateProject(id, { status: "cancelled" });
      }
      setMessage(`${ids.length} shoot(s) cancelled.`);
      setPlannedSelected([]);
      load();
    } catch (e) { setMessage(String(e.message || e)); }
  }

  function requestConfirmPlanned(ids) {
    setConfirmAction({
      title: "Confirm Planned Shoots",
      message: `Reconfirm confirmation for ${ids.length} planned shoot${ids.length > 1 ? "s" : ""}. Equipment conflicts will be checked before final confirmation.`,
      confirmLabel: "Confirm Shoots",
      tone: "primary",
      onConfirm: async () => {
        setConfirmAction(null);
        await confirmPlanned(ids);
      },
    });
  }

  function requestCancelPlanned(ids) {
    setConfirmAction({
      title: "Cancel Planned Shoots",
      message: `Reconfirm cancellation for ${ids.length} planned shoot${ids.length > 1 ? "s" : ""}. This will stop further booking on those projects.`,
      confirmLabel: "Cancel Shoots",
      tone: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        await cancelPlanned(ids);
      },
    });
  }

  function requestEditBooking(saveFn, booking) {
    setConfirmAction({
      title: "Save Booking Changes",
      message: `Reconfirm the edit for ${booking.job_card_id}. The booking details and contact list will be updated.`,
      confirmLabel: "Save Changes",
      tone: "primary",
      onConfirm: async () => {
        setConfirmAction(null);
        await saveFn();
        load();
      },
    });
  }

  // Retrieve from old booking
  function prefillFromBooking(b) {
    const oldEquipment = (b.equipment || []).map((item) => ({
      ...item,
      label: `${item.asset_code || item.id} · ${item.name || "Equipment"}`,
    }));
    const oldAccessories = oldEquipment.filter((item) => item.item_type === "accessory");
    const oldMainEquipment = oldEquipment.filter((item) => item.item_type !== "accessory");
    const oldCrew = (b.crew || []).map((item) => ({
      ...item,
      label: `${item.name || item.id}${item.role ? ` · ${item.role}` : ""}`,
    }));
    setProjectMode("existing");
    setExistingBookingMode("supplementary");
    setBookingProjectId(String(b.project_id));
    setDestination(b.destination);
    setRemarks(`Supplementary for ${b.reference_job_card_id || b.job_card_id}`);
    setParentBookingId(String(b.id));
    setTransportMode(b.transport_mode || "");
    setAwbNumber(b.awb_number || "");
    setContactName(b.contact_person_name || "");
    setContactMobile(b.contact_person_mobile || "");
    setContactAadhar(b.contact_person_aadhar || "");
    setContacts(b.contacts?.length ? b.contacts : [{ name: b.contact_person_name || "", mobile: b.contact_person_mobile || "", aadhar: b.contact_person_aadhar || "" }]);
    setCallTime(extractTimeValue(b.call_time));
    setPickupTime(extractTimeValue(b.pickup_time));
    setPackupTime(extractTimeValue(b.packup_time));
    setEquipmentSelected(oldMainEquipment);
    setAccessorySelected(oldAccessories);
    setCrewSelected(oldCrew);
    setMessage(`Pre-filled from ${b.job_card_id}: ${oldMainEquipment.length} equipment, ${oldAccessories.length} accessories, ${oldCrew.length} manpower. Modify items before creating supplementary job card.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openModifyShoot(b) {
    const normalizeInventory = (item) => ({
      ...item,
      label: item.label || `${item.asset_code || item.id} · ${item.name || "Item"} · ${item.item_type || ""} · ${item.owner_type || ""}`,
    });
    const normalizeCrew = (item) => ({
      ...item,
      label: item.label || `${item.employee_code || item.id} · ${item.name || item.full_name || "Crew"} · ${item.role || ""} · ${item.manpower_type || ""}`,
    });
    setModifyShootBooking(b);
    setModifyDates((b.dates || []).filter((row) => row.date && row.type));
    setModifyEquipment((b.equipment || []).map(normalizeInventory));
    setModifyAccessories((b.accessories || []).map(normalizeInventory));
    setModifyCrew((b.crew || []).map(normalizeCrew));
    setModifyNotes("");
    setModifyResult(null);
    setBookingTab("modify");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function modifyWindow() {
    const dates = modifyDates.map((entry) => entry.date).filter(Boolean).sort();
    if (!dates.length) return undefined;
    return { block_start: `${dates[0]}T00:00:00`, block_end: `${dates[dates.length - 1]}T23:59:59` };
  }

  function addModifyEquipment(items) {
    setModifyEquipment(prev => { const existing = new Set(prev.map(x => x.id)); return [...prev, ...items.filter(x => !existing.has(x.id))]; });
  }

  function addModifyAccessories(items) {
    setModifyAccessories(prev => { const existing = new Set(prev.map(x => x.id)); return [...prev, ...items.filter(x => !existing.has(x.id))]; });
  }

  function addModifyCrew(items) {
    setModifyCrew(prev => { const existing = new Set(prev.map(x => x.id)); return [...prev, ...items.filter(x => !existing.has(x.id))]; });
  }

  async function submitModifyShoot() {
    if (!modifyShootBooking) return;
    const originalShootDates = new Set(
      (modifyShootBooking.dates || []).filter(d => d.type === "shoot_date").map(d => d.date)
    );
    const added_dates = modifyDates
      .filter(d => d.type === "shoot_date" && !originalShootDates.has(d.date))
      .map(d => d.date);
    const finalActiveSet = new Set(
      modifyDates.filter(d => d.type !== "off_day").map(d => d.date)
    );
    const removedByAbsence = [...originalShootDates].filter(d => !finalActiveSet.has(d));
    const removedByOffDay = modifyDates.filter(d => d.type === "off_day").map(d => d.date);
    const removed_dates = [...new Set([...removedByAbsence, ...removedByOffDay])];
    const originalEquipment = new Set((modifyShootBooking.equipment || []).map(item => item.id));
    const originalAccessories = new Set((modifyShootBooking.accessories || []).map(item => item.id));
    const originalCrew = new Set((modifyShootBooking.crew || []).map(item => item.id));
    const changedResources =
      modifyEquipment.length !== originalEquipment.size ||
      modifyAccessories.length !== originalAccessories.size ||
      modifyCrew.length !== originalCrew.size ||
      modifyEquipment.some(item => !originalEquipment.has(item.id)) ||
      modifyAccessories.some(item => !originalAccessories.has(item.id)) ||
      modifyCrew.some(item => !originalCrew.has(item.id));
    if (!added_dates.length && !removed_dates.length && !changedResources) {
      alert("No changes detected. Change dates, equipment, accessories, manpower, or notes.");
      return;
    }
    setModifySaving(true);
    try {
      const result = await api.createSupplementaryBooking(modifyShootBooking.id, {
        date_tags: modifyDates,
        added_dates,
        removed_dates,
        notes: modifyNotes,
        equipment_ids: modifyEquipment.map(e => e.id),
        accessory_ids: modifyAccessories.map(e => e.id),
        crew_ids: modifyCrew.map(c => c.id),
      });
      setModifyResult(result);
      setMessage(`Supplementary ${result.job_card_id} created.${result.conflicts?.length ? ` ${result.conflicts.length} conflict(s).` : ""}`);
      load();
    } catch (e) {
      setModifyResult(null);
      setMessage(String(e.message || e));
    } finally {
      setModifySaving(false);
    }
  }

  const selectedProjectTitle = projectMode === "new" ? projectForm.title || "-" : (projects.find(p => String(p.id) === String(bookingProjectId))?.title || "-");
  const clientNameSuggestions = useMemo(() => [...new Set(clients.map((client) => client.name).filter(Boolean))], [clients]);

  function openResourceModal(type) {
    if (type === "equipment") setEquipModal(true);
    if (type === "accessory") setAccModal(true);
    if (type === "crew") setCrewModal(true);
  }

  const filteredBookings = useMemo(() => {
    let data = bookingDetails;
    if (bookingStatusFilter) data = data.filter(b => b.status === bookingStatusFilter);
    if (bookingSearch) {
      const q = bookingSearch.toLowerCase();
      data = data.filter(b =>
        (b.job_card_id || "").toLowerCase().includes(q) ||
        (b.project_title || "").toLowerCase().includes(q) ||
        (b.destination || "").toLowerCase().includes(q) ||
        (b.transport_mode || "").toLowerCase().includes(q) ||
        (b.equipment || []).some(x => (x.asset_code || "").toLowerCase().includes(q) || (x.name || "").toLowerCase().includes(q)) ||
        (b.crew || []).some(x => (x.name || "").toLowerCase().includes(q))
      );
    }
    return data;
  }, [bookingDetails, bookingSearch, bookingStatusFilter]);
  const bkPg = usePagination(filteredBookings, 10);
  const filteredPlannedShoots = useSearch(plannedShoots, plannedSearch);
  const plannedPg = usePagination(filteredPlannedShoots, 10);

  return (
    <div className="page">
      <h1 className="pageTitle">Booking Section</h1>
      {message ? <div className="messageBar">{message} <button className="dismissBtn" onClick={()=>setMessage("")}>Dismiss</button></div> : null}

      <div className="bookingTabBar">
        {[["new","New Booking"],["modify","Modify Booking"],["planned","Planned Booking"],["all","All Bookings"]].map(([key,label])=>(
          <button key={key} type="button" className={`bookingTabBtn${bookingTab===key?" active":""}`} onClick={()=>setBookingTab(key)}>{label}</button>
        ))}
      </div>

      {bookingTab === "new" && <>
      <div className="grid2">
        <Card title="Combined Project + Booking Flow">
          <ul className="alertList">
            <li><strong>One flow</strong>: Choose an existing project or create a new project and its first booking together.</li>
            <li><strong>Supplementary items</strong>: Pick a parent booking to issue a supplementary job card and challan linked to the original reference ID.</li>
            <li><strong>Multiple contacts</strong>: Add as many booking contacts as needed; the first one remains the primary contact on papers.</li>
            <li><strong>Reconfirmation</strong>: Planned shoot status changes and booking edits now require one more confirmation popup before they are saved.</li>
          </ul>
        </Card>

        <Card title="Blocking Logic Guide">
          <ul className="alertList">
            <li><strong>Project Dates</strong>: Tag explicit setup, technical, shoot, off, end, and return days in one calendar.</li>
            <li><strong>Colored Calendar</strong>: A date can carry multiple tags, so setup and technical markers can live on the same day.</li>
            <li><strong>Mandatory Accessories</strong>: System checks before booking.</li>
            <li>After booking, a <strong>Job Card</strong> with unique ID is generated.</li>
            <li><strong>Supplementary Job Cards</strong>: Modify anytime — new card trails parent ID.</li>
            <li><strong>Retrieve from Old Booking</strong>: Click "Copy" on any existing booking to pre-fill.</li>
          </ul>
        </Card>
      </div>

      {/* ──── CREATE BOOKING ──── */}
      <Card title="Create Project + Booking">
        <form onSubmit={handleReviewBooking}>
          <div className="formGrid">
            <label className="fieldLabel">Flow</label>
            <select value={projectMode} onChange={e => {
              const value = e.target.value;
              setProjectMode(value);
              if (value === "new") {
                setExistingBookingMode("normal");
                setParentBookingId("");
                setBookingProjectId("");
              }
            }}>
              <option value="existing">Use Existing Project</option>
              <option value="new">Create New Project + Booking</option>
            </select>
            <label className="fieldLabel">Client</label>
            <select value={projectForm.client_id} onChange={e=>setProjectForm({...projectForm, client_id:e.target.value})}>
              <option value="">Select Client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.client_code} - {c.name}</option>)}
            </select>
            {projectMode === "existing" ? <>
            <label className="fieldLabel">Booking Type</label>
            <select value={existingBookingMode} onChange={e => {
              const value = e.target.value;
              setExistingBookingMode(value);
              if (value !== "supplementary") setParentBookingId("");
            }}>
              <option value="normal">New Booking / First Job Card</option>
              <option value="supplementary">Supplementary</option>
            </select>
            {existingBookingMode === "supplementary" ? <>
            <label className="fieldLabel">Supplementary Against</label>
            <select value={parentBookingId} onChange={e=>{
              const value = e.target.value;
              setParentBookingId(value);
              if (value) {
                const parent = bookingDetails.find((booking) => String(booking.id) === String(value));
                if (parent) {
                  setBookingProjectId(String(parent.project_id));
                }
              }
            }}>
              <option value="">Select original job card</option>
              {supplementaryChoices.map(b => <option key={b.id} value={b.id}>{b.job_card_id} - {b.project_title}</option>)}
            </select>
            <div className="helperText full">
              {supplementaryChoices.length
                ? "Supplementary job cards follow the parent ID, like JC-00001-S1, and the road challan uses the same aligned additional ID."
                : "Create the first booking/job card first. Supplementary booking becomes available after that."}
            </div>
            </> : null}
            <label className="fieldLabel">Project</label>
            <select value={bookingProjectId} onChange={e=>setBookingProjectId(e.target.value)}>
              <option value="">Select Project</option>
              {clientFilteredProjects.map(p => <option key={p.id} value={p.id}>{p.title} ({p.status})</option>)}
            </select>
            <div className="full" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className="ghostBtn compactBtn" onClick={() => setQuickProjectOpen(true)}>Create Project</button>
              {!clientFilteredProjects.length ? <span className="helperText">No project found for this client yet. Create one here.</span> : null}
            </div>
            </> : <>
            <label className="fieldLabel">Project Title</label>
            <input placeholder="Example: IPL Match Day 4" value={projectForm.title} onChange={e=>setProjectForm({...projectForm, title:e.target.value})} required={projectMode === "new"} />
            <label className="fieldLabel">Show Type</label>
            <select value={projectForm.show_type} onChange={e=>setProjectForm({...projectForm, show_type:e.target.value})}><option>Reality Show</option><option>TV Show</option><option>TV Serial</option><option>Sports</option><option>Event</option></select>
            <label className="fieldLabel">Venue / Location</label>
            <LocationAutocomplete value={projectForm.venue} onChange={v=>setProjectForm({...projectForm, venue:v})} extraSuggestions={[...new Set(projects.map(p => p.venue).filter(Boolean))]} placeholder="Search Indian location..." required={projectMode === "new"} />
            <label className="fieldLabel">Dispatch Warehouse</label>
            <select value={projectForm.origin_warehouse_id} onChange={e=>setProjectForm({...projectForm, origin_warehouse_id:e.target.value})}><option value="">Select Warehouse</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            <label className="fieldLabel">Project Start</label>
            <input type="text" value={displayDateOnly(projectForm.shoot_start)} readOnly disabled required={projectMode === "new"} />
            <label className="fieldLabel">Project End</label>
            <input type="text" value={displayDateOnly(projectForm.shoot_end)} readOnly disabled />
            <label className="fieldLabel">Shoot Status</label>
            <select value={projectForm.status} onChange={e=>setProjectForm({...projectForm, status:e.target.value})}><option>planned</option><option>confirmed</option></select>
            <label className="fieldLabel full">Project Notes</label>
            <textarea className="full" placeholder="Project notes" value={projectForm.notes} onChange={e=>setProjectForm({...projectForm, notes:e.target.value})}></textarea>
            <div className="full">
              <label className="fieldLabel">Project Dates</label>
              <DatePicker selectedDates={selectedDates} onChange={setSelectedDates} dateTypes={['travel_day', 'setup_date', 'technical_date', 'shoot_date', 'off_day', 'end_day', 'return_day']} />
              <p className="helperText" style={{ marginTop: 8 }}>Use Travel Day, Setup Day, Technical Day, Shoot Day, Off Day, End Day, and Return Day below. The top project window auto-runs from setup through return, while blocking still includes travel day.</p>
            </div>
            </>}
            <label className="fieldLabel">Destination</label>
            <LocationAutocomplete value={destination} onChange={setDestination} extraSuggestions={[...new Set(bookingDetails.map(b => b.destination).filter(Boolean))]} placeholder="Search Indian location..." required />
            <label className="fieldLabel">Booking Status</label>
            <select value={bookingStatus} onChange={e=>setBookingStatus(e.target.value)}>
              <option value="planned">Planned</option>
              <option value="confirmed">Confirmed</option>
            </select>
            <label className="fieldLabel">Transport Mode</label>
            <select value={transportMode} onChange={e=>setTransportMode(e.target.value)}>
              <option value="">Select</option><option value="company_vehicle">Company Vehicle</option><option value="hired">Hired Vehicle</option><option value="courier">Courier</option><option value="self">Self</option>
            </select>
            <label className="fieldLabel">AWB / Tracking Number</label>
            <input value={awbNumber} onChange={e=>setAwbNumber(e.target.value)} placeholder="Air waybill or tracking number" />
            <label className="fieldLabel">Contact Person Name</label>
            <input value={contactName} onChange={e=>setContactName(e.target.value)} placeholder="Contact person name" />
            <label className="fieldLabel">Contact Mobile</label>
            <input value={contactMobile} onChange={e=>setContactMobile(e.target.value)} placeholder="+91..." />
            <label className="fieldLabel">Contact Aadhar</label>
            <input value={contactAadhar} onChange={e=>setContactAadhar(e.target.value)} placeholder="Linked Aadhar number" />
            <div className="full">
              <label className="fieldLabel">Additional Contacts</label>
              <div className="stackForms">
                {contacts.map((contact, index) => (
                  <div className="contactGrid" key={`contact-${index}`}>
                    <input value={contact.name} onChange={(e) => updateContact(index, "name", e.target.value)} placeholder="Contact name" />
                    <input value={contact.mobile} onChange={(e) => updateContact(index, "mobile", e.target.value)} placeholder="Mobile" />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={contact.aadhar} onChange={(e) => updateContact(index, "aadhar", e.target.value)} placeholder="Aadhar" />
                      <button type="button" className="ghostBtn compactBtn" onClick={() => removeContact(index)}>Remove</button>
                    </div>
                  </div>
                ))}
                <button type="button" className="ghostBtn compactBtn" onClick={addContact}>Add Contact</button>
              </div>
            </div>
            <label className="fieldLabel">Call Time {travelDay ? `(${travelDay})` : ""}</label>
            <input type="time" value={callTime} onChange={e=>setCallTime(e.target.value)} />
            <label className="fieldLabel">Pickup Time {travelDay ? `(${travelDay})` : ""}</label>
            <input type="time" value={pickupTime} onChange={e=>setPickupTime(e.target.value)} />
            <label className="fieldLabel">Packup Time {returnDay ? `(${returnDay})` : ""}</label>
            <input type="time" value={packupTime} onChange={e=>setPackupTime(e.target.value)} />
            <label className="fieldLabel full">Remarks</label>
            <textarea className="full" placeholder="Remarks / special instructions" value={remarks} onChange={e=>setRemarks(e.target.value)}></textarea>
          </div>
          {parentBookingId ? (
            <div className="accessoryHint">
              <strong>Supplementary Flow:</strong> extra selected items will create a supplementary job card and challan with reference to {bookingDetails.find(b => String(b.id) === String(parentBookingId))?.reference_job_card_id || bookingDetails.find(b => String(b.id) === String(parentBookingId))?.job_card_id || parentBookingId}.
            </div>
          ) : null}

          <div className="bookingResourceGrid">
            <SelectedBlock title="Main Equipment" items={equipmentSelected} availableCount={availableCounts.equipment} availabilityMode={availableCounts.mode} onAddMore={() => openResourceModal("equipment")} onRemove={id => setEquipmentSelected(prev => prev.filter(x => x.id !== id))} badgeField="owner_type" badgeValues={["third_party"]} infoText="Main devices, kits, bundles, or third-party equipment from vendors." />
            <SelectedBlock title="Accessories" items={accessorySelected} availableCount={availableCounts.accessories} availabilityMode={availableCounts.mode} onAddMore={() => openResourceModal("accessory")} onRemove={id => setAccessorySelected(prev => prev.filter(x => x.id !== id))} infoText="Batteries, chargers, cables, adapters." />
            <SelectedBlock title="Manpower" items={crewSelected} availableCount={availableCounts.manpower} availabilityMode={availableCounts.mode} onAddMore={() => openResourceModal("crew")} onRemove={id => setCrewSelected(prev => prev.filter(x => x.id !== id))} badgeField="manpower_type" badgeValues={["external", "contractual", "freelance"]} infoText="Inhouse crew, contractual, freelance, or external vendor manpower." />
          </div>

          {requiredInfo.required_codes.length > 0 && (
            <div className="accessoryHint">
              <strong>Mandatory Accessories Required: </strong>
              {requiredInfo.required_codes.map(code => <span key={code} className="badge badgeMandatory">{code}</span>)}
              {requiredInfo.optional_codes.length > 0 && (<><strong style={{marginLeft:12}}>Optional: </strong>{requiredInfo.optional_codes.map(code => <span key={code} className="badge badgeOptional">{code}</span>)}</>)}
            </div>
          )}
          <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <button className="primaryBtn" type="submit">{projectMode === "new" ? "Review Project + Booking" : "Review Booking"}</button>
          </div>
        </form>
      </Card>
      </>}

      {/* ──── MODIFY BOOKING TAB ──── */}
      {bookingTab === "modify" && (
        <Card title="Modify Booking">
          <div className="formGrid">
            <label className="fieldLabel">Select Job Card to Modify</label>
            <select value={modifyShootBooking?.id || ""} onChange={e => {
              const b = bookingDetails.find(x => String(x.id) === e.target.value);
              if (b) openModifyShoot(b);
            }}>
              <option value="">Select confirmed job card</option>
              {bookingDetails.filter(b => ["confirmed","blocked","dispatched"].includes(b.status) && !b.parent_booking_id).map(b => (
                <option key={b.id} value={b.id}>{b.job_card_id} — {b.project_title}</option>
              ))}
            </select>

            {modifyShootBooking && (<>
              <div className="full">
                <label className="fieldLabel" style={{marginBottom:8,display:"block"}}>Shoot Dates — use Off Day to remove existing dates, add new Shoot Day dates</label>
                <DatePicker selectedDates={modifyDates} onChange={setModifyDates}
                  dateTypes={["travel_day","setup_date","technical_date","shoot_date","off_day","end_day","return_day"]} />
              </div>

              <div className="full">
                <strong style={{fontSize:13}}>Equipment ({modifyEquipment.length})</strong>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                  {modifyEquipment.map(e => (
                    <span key={e.id} style={{display:"inline-flex",alignItems:"center",gap:4}}>
                      <span className="badge">{e.name||e.label}</span>
                      <button type="button" className="dangerBtn compactBtn" style={{padding:"1px 6px",fontSize:11}}
                        onClick={()=>setModifyEquipment(prev=>prev.filter(x=>x.id!==e.id))}>✕</button>
                    </span>
                  ))}
                </div>
                <button type="button" className="ghostBtn compactBtn" style={{marginTop:8}} onClick={()=>setModifyEquipModal(true)}>+ Add Equipment</button>
              </div>

              <div className="full">
                <strong style={{fontSize:13}}>Accessories ({modifyAccessories.length})</strong>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                  {modifyAccessories.map(a => (
                    <span key={a.id} style={{display:"inline-flex",alignItems:"center",gap:4}}>
                      <span className="badge badgeOptional">{a.name||a.label}</span>
                      <button type="button" className="dangerBtn compactBtn" style={{padding:"1px 6px",fontSize:11}}
                        onClick={()=>setModifyAccessories(prev=>prev.filter(x=>x.id!==a.id))}>✕</button>
                    </span>
                  ))}
                </div>
                <button type="button" className="ghostBtn compactBtn" style={{marginTop:8}} onClick={()=>setModifyAccModal(true)}>+ Add Accessory</button>
              </div>

              <div className="full">
                <strong style={{fontSize:13}}>Manpower ({modifyCrew.length})</strong>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                  {modifyCrew.map(c => (
                    <span key={c.id} style={{display:"inline-flex",alignItems:"center",gap:4}}>
                      <span className="badge">{c.name||c.label}{c.role?` (${c.role})`:""}</span>
                      <button type="button" className="dangerBtn compactBtn" style={{padding:"1px 6px",fontSize:11}}
                        onClick={()=>setModifyCrew(prev=>prev.filter(x=>x.id!==c.id))}>✕</button>
                    </span>
                  ))}
                </div>
                <button type="button" className="ghostBtn compactBtn" style={{marginTop:8}} onClick={()=>setModifyCrewModal(true)}>+ Add Manpower</button>
              </div>

              <label className="fieldLabel full">Notes</label>
              <textarea className="full" rows={2} value={modifyNotes} onChange={e=>setModifyNotes(e.target.value)}
                placeholder="e.g. Client removed 18th, added 20th as extra shoot day" />

              {modifyResult && (
                <div className="full" style={{background:modifyResult.conflicts?.length?"#fff3cd":"#d4edda",border:"1px solid",borderColor:modifyResult.conflicts?.length?"#ffc107":"#28a745",borderRadius:6,padding:"10px 14px",fontSize:13}}>
                  <strong>Supplementary created: {modifyResult.job_card_id}</strong>
                  {modifyResult.conflicts?.length > 0 && (
                    <div style={{marginTop:6}}>
                      <strong style={{color:"#856404"}}>Conflicts ({modifyResult.conflicts.length}):</strong>
                      <ul style={{margin:"4px 0 0 16px",padding:0}}>
                        {modifyResult.conflicts.map((c,i)=><li key={i} style={{fontSize:12}}>{c.date} — item #{c.inventory_item_id}: {c.reason||"conflict"}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <button type="button" className="primaryBtn full" onClick={submitModifyShoot} disabled={modifySaving}>
                {modifySaving ? "Saving..." : "Create Supplementary Modification"}
              </button>
            </>)}
          </div>
        </Card>
      )}

      {/* ──── PLANNED SHOOTS MANAGEMENT ──── */}
      {bookingTab === "planned" && <Card title="Planned Shoots Management">
        <p className="helperText">Select planned shoots to confirm or cancel in bulk. Ensure no equipment conflicts before confirming.</p>
        <div className="listToolbar">
          <SearchBar value={plannedSearch} onChange={value => { setPlannedSearch(value); plannedPg.setPage(1); }} suggestions={buildSuggestions(plannedShoots)} placeholder="Search planned shoots by project, date, equipment, crew..." />
          <span className="helperText">{filteredPlannedShoots.length} planned shoot(s)</span>
        </div>
        <div className="tableWrap" style={{marginTop:12}}>
          <table>
            <thead><tr><th><input type="checkbox" onChange={e => {
              const checked = e.target.checked;
              setPlannedSelected(checked ? filteredPlannedShoots.map(p => p.id) : []);
            }} /></th><th>Project</th><th>Dates</th><th>Equipment</th><th>Accessories</th><th>Manpower</th><th>Actions</th></tr></thead>
            <tbody>
              {plannedPg.pageData.map(p => (
                <tr key={p.id}>
                  <td><input type="checkbox" checked={plannedSelected.includes(p.id)} onChange={e => {
                    setPlannedSelected(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id));
                  }} /></td>
                  <td>{p.title}</td>
                  <td style={{fontSize:12}}>{formatProjectDates(p)}</td>
                  <td style={{fontSize:12}}>
                    {projectSummaries[p.id]?.equipmentCount
                      ? pluralizeCount(projectSummaries[p.id].equipmentCount, "item")
                      : (projectSummaries[p.id]?.bookingCount ? "No equipment linked" : "No linked booking yet")}
                    <div style={{color:"#999", marginTop:4}}>{projectSummaries[p.id]?.equipmentSummary || "-"}</div>
                  </td>
                  <td>
                    {pluralizeCount(projectSummaries[p.id]?.accessoryCount || 0, "accessory")}
                  </td>
                  <td>{pluralizeCount(projectSummaries[p.id]?.crewCount || 0, "member")}</td>
                  <td>
                    <div className="plannedShootActionGroup">
                      <button type="button" className="primaryBtn compactBtn plannedShootActionBtn" onClick={() => requestConfirmPlanned([p.id])}>Confirm</button>
                      <button type="button" className="dangerBtn compactBtn plannedShootActionBtn" onClick={() => requestCancelPlanned([p.id])}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination total={plannedPg.total} page={plannedPg.page} pageSize={plannedPg.pageSize} onPageChange={plannedPg.setPage} onPageSizeChange={plannedPg.setPageSize} />
        </div>
        {plannedSelected.length > 0 && (
          <div className="plannedShootBulkActions" style={{marginTop:12}}>
            <button type="button" className="primaryBtn compactBtn plannedShootBulkBtn" onClick={() => requestConfirmPlanned(plannedSelected)}>Confirm Selected ({plannedSelected.length})</button>
            <button type="button" className="dangerBtn compactBtn plannedShootBulkBtn" onClick={() => requestCancelPlanned(plannedSelected)}>Cancel Selected ({plannedSelected.length})</button>
          </div>
        )}
      </Card>}

      {/* ──── BOOKINGS TABLE ──── */}
      {bookingTab === "all" && <Card title="All Bookings">
        <div className="auditSubFilters" style={{marginBottom:10}}>
          <SearchBar value={bookingSearch} onChange={value=>{setBookingSearch(value);bkPg.setPage(1);}} suggestions={buildSuggestions(bookingDetails)} placeholder="Search bookings by job card, project, destination, equipment, crew..." />
          <select value={bookingStatusFilter} onChange={e=>{setBookingStatusFilter(e.target.value);bkPg.setPage(1);}}>
            <option value="">All statuses</option><option value="planned">Planned</option><option value="confirmed">Confirmed</option><option value="blocked">Blocked</option><option value="dispatched">Dispatched</option><option value="returned">Returned</option><option value="cancelled">Cancelled</option>
          </select>
          <span style={{fontSize:11,color:"var(--muted)"}}>{filteredBookings.length} bookings</span>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Job Card ID</th><th>Project</th><th>Destination</th><th>Transport</th><th>Equipment</th><th>Crew</th><th>Status</th><th>Damages</th><th>Downloadable Documents</th><th>Actions</th></tr></thead>
            <tbody>
              {bkPg.pageData.map(b => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.job_card_id}</strong>
                    {b.parent_booking_id ? <span className="badge badgeOptional" style={{marginLeft:4,fontSize:10}}>Supplementary</span> : null}
                    {b.parent_booking_id ? <div style={{fontSize:11,color:"#999"}}>Ref: {b.reference_job_card_id}</div> : null}
                  </td>
                  <td>{b.project_title}</td>
                  <td>{b.destination}</td>
                  <td>
                    {b.transport_mode ? <span className="badge">{b.transport_mode}</span> : "-"}
                    {b.awb_number ? <div style={{fontSize:11,color:"#999"}}>AWB: {b.awb_number}</div> : null}
                    {b.call_time ? <div style={{fontSize:11,color:"#999"}}>Call: {new Date(b.call_time).toLocaleString()}</div> : null}
                    {b.pickup_time ? <div style={{fontSize:11,color:"#999"}}>Pickup: {new Date(b.pickup_time).toLocaleString()}</div> : null}
                    {b.packup_time ? <div style={{fontSize:11,color:"#999"}}>Packup: {new Date(b.packup_time).toLocaleString()}</div> : null}
                  </td>
                  <td>
                    {(b.equipment_summary || groupEquipment(b.equipment)).map((item) => (
                      <div key={`${item.name}-${item.ownerType || item.owner_type || ""}`} style={{fontSize:12,marginBottom:2}}>
                        {item.name} (x{item.count || item.quantity})
                        {(item.serials || item.serial_numbers || []).length > 0 && <span style={{color:"#999",marginLeft:4}}>S/N: {(item.serials || item.serial_numbers).join(", ")}</span>}
                        {(item.ownerType || item.owner_type) === "third_party" && <span className="badge badgeThirdParty" style={{marginLeft:4,fontSize:10}}>3P</span>}
                      </div>
                    ))}
                    {(!b.equipment_summary || b.equipment_summary.length === 0) && b.equipment.length === 0 && "-"}
                  </td>
                  <td>
                    {b.crew.map(x => (
                      <div key={x.id} style={{fontSize:12,marginBottom:2}}>
                        {x.name}
                        {x.manpower_type && x.manpower_type !== "inhouse" && <span className="badge badgeExternal" style={{marginLeft:4,fontSize:10}}>{x.manpower_type}</span>}
                      </div>
                    ))}
                    {b.crew.length === 0 && "-"}
                  </td>
                  <td>
                    <span className={`statusBadge status-${b.status}`}>{b.status}</span>
                    {b.cancellation_reason && <div style={{fontSize:11,color:"#fca5a5",marginTop:2}}>Reason: {b.cancellation_reason}</div>}
                  </td>
                  <td>
                    {(b.damages || []).length > 0 ? (
                      <div>{b.damages.map(d => <div key={d.id} style={{fontSize:11,marginBottom:2}}><span className={`badge ${d.severity === "critical" ? "badgeMandatory" : d.severity === "major" ? "badgeThirdParty" : "badgeOptional"}`}>{d.severity}</span> {d.description.slice(0,30)}</div>)}</div>
                    ) : <span style={{color:"#4ade80",fontSize:12}}>None</span>}
                  </td>
                  <td className="pdfCell">
                    <div className="documentDownloadCell">
                      <button type="button" className="downloadBtn compactBtn" onClick={()=>doJobCardDownload(b.id, b.job_card_id)}>Job Card</button>
                      <button type="button" className="downloadBtn compactBtn" onClick={async()=>{ try { await downloadAuthorized(api.roadChallanPdfUrl(b.id), `challan_${b.job_card_id || b.id}.pdf`); } catch(e){ setMessage(String(e.message||e)); } }}>Challan</button>
                      <button type="button" className="downloadBtn compactBtn" onClick={async()=>{ try { await downloadAuthorized(api.manpowerPdfUrl(b.id), `manpower_${b.job_card_id || b.id}.pdf`); } catch(e){ setMessage(String(e.message||e)); } }}>Manpower</button>
                    </div>
                  </td>
                  <td className="actionCell">
                    <div className="actionButtonGroup">
                      {(b.status === "confirmed" || b.status === "blocked") && <button className="primaryBtn compactBtn" onClick={()=>doDispatch(b.id)}>Dispatch</button>}
                      {(b.status === "confirmed" || b.status === "blocked" || b.status === "dispatched") && <button className="ghostBtn compactBtn" onClick={()=>openReturnQC(b.id)}>Return</button>}
                      <button className="ghostBtn compactBtn" onClick={()=>{setDamageBooking(b);setDamageModal(true);}}>Damage</button>
                      <button className="ghostBtn compactBtn" onClick={()=>{setEditBooking(b);setEditModal(true);}}>Edit</button>
                      <button className="ghostBtn compactBtn" onClick={()=>prefillFromBooking(b)}>Supplementary</button>
                      {["confirmed","blocked","dispatched"].includes(b.status) && !b.parent_booking_id && <button className="ghostBtn compactBtn" onClick={()=>openModifyShoot(b)}>Modify Shoot</button>}
                      {b.status !== "returned" && b.status !== "cancelled" && <button className="dangerBtn compactBtn" onClick={()=>{setCancelBookingId(b.id);setCancelModal(true);}}>Cancel</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={bkPg.total} page={bkPg.page} pageSize={bkPg.pageSize} onPageChange={bkPg.setPage} onPageSizeChange={bkPg.setPageSize} />
      </Card>}

      {/* ──── MODALS ──── */}
      <SearchModal open={equipModal} onClose={() => setEquipModal(false)} title="Search Equipment (Devices / Kits / 3rd Party)" resourceType="inventory" availabilityParams={availabilityWindow || undefined} onConfirmItems={addEquipment} />
      <SearchModal open={accModal} onClose={() => setAccModal(false)} title="Search Accessories" resourceType="accessory" availabilityParams={availabilityWindow || undefined} onConfirmItems={addAccessories} />
      <SearchModal open={crewModal} onClose={() => setCrewModal(false)} title="Search Manpower" resourceType="crew" availabilityParams={availabilityWindow || undefined} onConfirmItems={addCrew} />
      <SearchModal open={modifyEquipModal} onClose={() => setModifyEquipModal(false)} title="Search Equipment (Modify)" resourceType="inventory" availabilityParams={modifyWindow()} onConfirmItems={addModifyEquipment} />
      <SearchModal open={modifyAccModal} onClose={() => setModifyAccModal(false)} title="Search Accessories (Modify)" resourceType="accessory" availabilityParams={modifyWindow()} onConfirmItems={addModifyAccessories} />
      <SearchModal open={modifyCrewModal} onClose={() => setModifyCrewModal(false)} title="Search Manpower (Modify)" resourceType="crew" availabilityParams={modifyWindow()} onConfirmItems={addModifyCrew} />
      <CancelReasonModal open={cancelModal} onClose={() => setCancelModal(false)} onConfirm={doCancel} />
      <DamageLogModal open={damageModal} onClose={() => setDamageModal(false)} booking={damageBooking} onSave={load} />
      <EditBookingModal open={editModal} onClose={() => setEditModal(false)} booking={editBooking} project={projects.find((item) => item.id === editBooking?.project_id)} onConfirmSave={requestEditBooking} />
      <ConfirmActionModal
        open={!!confirmAction}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel}
        tone={confirmAction?.tone}
        onConfirm={confirmAction?.onConfirm}
        onClose={() => setConfirmAction(null)}
      />

      {/* ──── RETURN QC MODAL ──── */}
      {returnQCModal && (
        <div className="modalOverlay" onClick={() => setReturnQCModal(false)}>
          <div className="modalCard qcModal" onClick={e => e.stopPropagation()}>
            <div className="modalHeader"><h2>Return QC - Booking #{returnBookingId}</h2><button className="ghostBtn modalCloseBtn" onClick={() => setReturnQCModal(false)}>Close</button></div>
            <p className="helperText">Complete the quality check before marking this booking as returned.</p>
            <div className="qcFormGrid">
              <label className="fieldLabel">Checked By</label>
              <input value={qcForm.checked_by} onChange={e => setQcForm({ ...qcForm, checked_by: e.target.value })} placeholder="Person performing QC" required />
              <div className="qcCheckRow">
                <label className="qcCheckLabel"><input type="checkbox" checked={qcForm.all_items_returned} onChange={e => setQcForm({ ...qcForm, all_items_returned: e.target.checked })} /><span>All Items Returned</span></label>
                <label className="qcCheckLabel"><input type="checkbox" checked={qcForm.damage_found} onChange={e => setQcForm({ ...qcForm, damage_found: e.target.checked })} /><span>Damage Found</span></label>
                <label className="qcCheckLabel"><input type="checkbox" checked={qcForm.cleaning_required} onChange={e => setQcForm({ ...qcForm, cleaning_required: e.target.checked })} /><span>Cleaning Required</span></label>
              </div>
              <label className="fieldLabel">Remarks</label>
              <textarea value={qcForm.remarks} onChange={e => setQcForm({ ...qcForm, remarks: e.target.value })} placeholder="Any notes about condition, missing items, damage..." rows={3} />
            </div>
            {qcForm.damage_found && <div className="qcWarning">Damage flagged. Use the "Damage" button to log per-item details.</div>}
            {!qcForm.all_items_returned && <div className="qcWarning">Not all items returned. Use Partial Return in Operations.</div>}
            <div className="modalFooter">
              <button className="ghostBtn" type="button" onClick={() => setReturnQCModal(false)}>Cancel</button>
              <button className="primaryBtn" type="button" onClick={submitReturnQC} disabled={qcSubmitting}>{qcSubmitting ? "Processing..." : "Complete QC & Return"}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmBookingModal open={confirmModal} onClose={() => setConfirmModal(false)} onConfirm={submitBooking} project={selectedProjectTitle} destination={destination} equipment={equipmentSelected} accessories={accessorySelected} crew={crewSelected} requiredInfo={requiredInfo} referenceId={parentBookingId ? bookingDetails.find(b => String(b.id) === String(parentBookingId))?.reference_job_card_id || bookingDetails.find(b => String(b.id) === String(parentBookingId))?.job_card_id : null} contacts={normalizedContacts()} />
      <QuickProjectModal open={quickProjectOpen} onClose={() => setQuickProjectOpen(false)} onSave={handleQuickProjectCreate} saving={quickProjectSaving} clientSuggestions={clientNameSuggestions} />

    </div>
  );
}
