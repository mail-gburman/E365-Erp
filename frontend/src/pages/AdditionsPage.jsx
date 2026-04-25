
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import Card from "../components/Card";
import InfoHint from "../components/InfoHint";
import AutocompleteInput from "../components/AutocompleteInput";
import LocationAutocomplete from "../components/LocationAutocomplete";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { api, systemApi } from "../api";
import { validateStatutory } from "../utils/statutory";
import PhoneInput, { CountryCodeSelect } from "../components/PhoneInput";

const blankWarehouse = { code:"", name:"", city:"", address:"", manager_name:"", contact_no:"" };
const blankVendor = { vendor_code:"", name:"", vendor_type:"service", city:"", contact_person:"", phone:"", email:"", gst_number:"", pan_number:"", notes:"" };
const blankClient = { name:"", industry_type:"", billing_address:"", gst_number:"", pan_number:"", notes:"", contacts:[{contact_name:"", designation:"", email:"", phone_country_code:"+91", phone_number:"", is_primary:true}] };
const blankEquipmentMaster = { equipment_code:"", name:"", category:"Camera", item_type:"device", brand:"", model_no:"", mandatory_accessory_codes:"", optional_accessory_codes:"", notes:"" };
const blankInventory = { asset_code:"", name:"", category:"Camera", item_type:"device", serial_number:"", parent_item_id:"", warehouse_id:"", owner_type:"inhouse", vendor_id:"", status:"available", location_text:"", warranty_expiry:"", service_due:"", service_status:"not_in_service", statutory_tag:"", notes:"", equipment_master_id:"", vendor_available_from:"", vendor_available_until:"", qty_in_stock:"" };
const blankCrew = { employee_code:"", full_name:"", role:"", manpower_type:"inhouse", vendor_id:"", home_station:"", phone:"", address:"", aadhar_number:"", pan_number:"", blood_group:"", emergency_contact:"", emergency_contact_phone:"", id_proof_type:"Aadhaar", id_proof_number:"", status:"available" };
const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const ID_PROOF_TYPES = ["Aadhaar", "PAN", "Passport", "Driving License", "Voter ID", "Others"];
const blankIdProof = () => ({ key: `${Date.now()}-${Math.random().toString(16).slice(2)}`, type: "Aadhaar", number: "", description: "", front: null, back: null });

function StatutoryField({ type, value, onChange, placeholder }) {
  const [verifying, setVerifying] = useState(false);
  const [serverResult, setServerResult] = useState(null);
  const localResult = validateStatutory(type, value);
  const needsServerCheck = type === "Aadhaar" || type === "GST";

  async function verify() {
    if (!value || localResult?.valid === false) return;
    setVerifying(true);
    try {
      const res = await api.verifyId(type, value);
      setServerResult(res);
    } catch { setServerResult({ valid: false, message: "Verification service unavailable" }); }
    finally { setVerifying(false); }
  }

  const result = serverResult || localResult;
  const showBadge = value && result && result.valid !== null;

  return (
    <div>
      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
        <input
          value={value}
          onChange={e => { onChange(e.target.value.toUpperCase()); setServerResult(null); }}
          placeholder={placeholder}
          style={{ flex:1 }}
          maxLength={type === "Aadhaar" ? 12 : type === "PAN" ? 10 : type === "GST" ? 15 : type === "Voter ID" ? 10 : type === "Passport" ? 8 : 20}
        />
        {needsServerCheck && value && localResult?.valid !== false && (
          <button type="button" className="ghostBtn compactBtn" onClick={verify} disabled={verifying} style={{ whiteSpace:"nowrap", fontSize:11 }}>
            {verifying ? "..." : "Verify ✓"}
          </button>
        )}
      </div>
      {showBadge && (
        <span style={{ display:"block", marginTop:3, fontSize:11,
          color: result.valid ? "#4ade80" : "#f87171",
          background: result.valid ? "#052e16" : "#450a0a",
          borderRadius:4, padding:"2px 8px" }}>
          {result.valid ? "✓" : "✗"} {result.message}
        </span>
      )}
    </div>
  );
}

const documentSlots = {
  client: [
    { key: "gst", label: "Client GST Certificate" },
    { key: "pan", label: "Client PAN" },
    { key: "agreement", label: "Client Agreement / Work Order" },
    { key: "address", label: "Billing Address Proof" },
  ],
  vendor: [
    { key: "gst", label: "Vendor GST Certificate" },
    { key: "pan", label: "Vendor PAN" },
    { key: "agreement", label: "Vendor Agreement / Rate Card" },
    { key: "bank", label: "Bank Details / Cancelled Cheque" },
    { key: "registration", label: "MSME / Company Registration" },
  ],
  inventory: [
    { key: "purchase_invoice", label: "Purchase Invoice" },
    { key: "warranty", label: "Warranty Card / Certificate" },
    { key: "insurance", label: "Insurance Copy" },
    { key: "asset_register", label: "Asset Register / Ownership Proof" },
    { key: "calibration", label: "Calibration / Service Certificate" },
  ],
  warehouse: [
    { key: "lease", label: "Lease / Ownership Proof" },
    { key: "utility", label: "Utility Bill / Address Proof" },
    { key: "noc", label: "Fire / Safety NOC" },
  ],
};

function DocumentUploadFields({ entityType, files, onChange, inputKey }) {
  const slots = documentSlots[entityType] || [];
  if (!slots.length) return null;
  return (
    <div className="full documentUploadPanel">
      <strong>Statutory / Supporting Documents</strong>
      <p className="helperText">Optional uploads. These will appear under System Document Library in the matching tab.</p>
      <div className="documentSlotGrid">
        {slots.map(slot => (
          <div className="documentUploadBox" key={slot.key}>
            <label className="fieldLabel">{slot.label}</label>
            <input
              key={`${entityType}-${slot.key}-${inputKey}`}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
              onChange={e => onChange(slot.key, e.target.files?.[0] || null)}
            />
            <span className="helperText">{files?.[slot.key]?.name || "No file selected."}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BulkUploadModal({ report, onClose }) {
  if (!report) return null;
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e)=>e.stopPropagation()}>
        <h3>Bulk Upload Status</h3>
        <p>This popup shows row accepted, row rejected, duplicate code warning, missing mandatory column warning, and parser/import errors where applicable.</p>
        <p><strong>Imported:</strong> {report.count || 0}</p>
        <div className="grid2">
          <div>
            <h4>Row Accepted</h4>
            <div className="tableWrap miniTable">
              <table>
                <thead><tr><th>Sheet</th><th>Row</th><th>Code</th><th>Name</th></tr></thead>
                <tbody>
                  {(report.accepted || []).map((r, idx) => (
                    <tr key={idx}><td>{r.sheet}</td><td>{r.row}</td><td>{r.code || "-"}</td><td>{r.name || "-"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h4>Row Rejected</h4>
            <div className="tableWrap miniTable">
              <table>
                <thead><tr><th>Sheet</th><th>Row</th><th>Reason for rejection</th></tr></thead>
                <tbody>
                  {(report.rejected || []).map((r, idx) => (
                    <tr key={idx}><td>{r.sheet}</td><td>{r.row}</td><td>{r.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <button className="primaryBtn" type="button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function SmartUploadPanel({ onDone }) {
  const [file, setFile] = useState(null);
  const [entityOverride, setEntityOverride] = useState("");
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [scanning, setScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stage, setStage] = useState("");
  const [report, setReport] = useState(null);

  const doPreview = async (f, eo) => {
    setScanning(true); setPreview(null); setReport(null); setStage("Scanning file...");
    try {
      const res = await api.smartUploadPreview(f, eo || undefined);
      if (!res.ok) { setStage(res.error || "Could not parse file."); setScanning(false); return; }
      setPreview(res);
      // Build initial mapping from auto-detected
      const m = {};
      for (const [field, info] of Object.entries(res.mapping || {})) {
        m[field] = info.col_index;
      }
      setMapping(m);
      setStage(`Detected ${res.total_rows} rows as "${res.detected_entity_type}". Review mapping below.`);
    } catch (e) { setStage(String(e.message || e)); }
    setScanning(false);
  };

  const handleFile = async (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f); setPreview(null); setReport(null); setStage("");
    if (f) doPreview(f, entityOverride);
  };

  const handleEntityChange = (val) => {
    setEntityOverride(val);
    if (file) doPreview(file, val);
  };

  const setFieldMapping = (field, colIdx) => {
    setMapping(prev => {
      const next = { ...prev };
      if (colIdx === "" || colIdx === undefined) { delete next[field]; return next; }
      // Unmap any other field pointing to same col
      for (const k of Object.keys(next)) {
        if (next[k] === Number(colIdx)) delete next[k];
      }
      next[field] = Number(colIdx);
      return next;
    });
  };

  const doImport = async () => {
    if (!file || !preview) return;
    setImporting(true); setStage("Importing...");
    try {
      const res = await api.smartUploadImport(file, preview.detected_entity_type, mapping);
      setReport(res);
      setStage(res.ok !== false ? `Imported ${res.count} rows.` : "Import failed.");
      if (onDone) onDone();
    } catch (e) { setStage(String(e.message || e)); }
    setImporting(false);
  };

  const confBadge = (score) => {
    if (score >= 85) return <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 11 }}>HIGH</span>;
    if (score >= 65) return <span style={{ color: "#facc15", fontWeight: 700, fontSize: 11 }}>MED</span>;
    return <span style={{ color: "#f87171", fontWeight: 700, fontSize: 11 }}>LOW</span>;
  };

  return (
    <div>
      <div style={{ marginBottom: 12, color: "var(--muted)", fontSize: 13 }}>
        Upload any file — Excel, CSV, PDF, Word, or even an image. The system will auto-detect columns and map them. You can review and adjust the mapping before importing.
      </div>

      <div className="formGrid">
        <label className="fieldLabel">Entity Type (optional — auto-detected)</label>
        <select value={entityOverride} onChange={e => handleEntityChange(e.target.value)}>
          <option value="">Auto Detect</option>
          <option value="inventory">Inventory</option>
          <option value="crew">Crew / Manpower</option>
          <option value="clients">Clients</option>
          <option value="vendors">Vendors</option>
          <option value="warehouses">Warehouses</option>
        </select>
        <input type="file" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.doc,.jpg,.jpeg,.png,.bmp,.tiff,.tif" onChange={handleFile} />
      </div>

      {scanning && <div style={{ marginTop: 12, color: "var(--muted)" }}>Scanning file...</div>}
      {stage && <div className="messageBar" style={{ marginTop: 12 }}>{stage}</div>}

      {preview && !report && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Column Mapping — {preview.detected_entity_type}</h3>
          <div className="tableWrap" style={{ marginBottom: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>System Field</th>
                  <th>Required</th>
                  <th>Mapped To Column</th>
                  <th>Confidence</th>
                  <th>Reassign</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.available_fields || {}).map(([field, info]) => {
                  const autoMap = preview.mapping?.[field];
                  const currentCol = mapping[field];
                  const isAssigned = currentCol !== undefined;
                  return (
                    <tr key={field} style={info.required && !isAssigned ? { background: "rgba(248,113,113,.1)" } : {}}>
                      <td style={{ fontWeight: 600 }}>{info.label}</td>
                      <td>{info.required ? <span style={{ color: "#f87171" }}>Yes</span> : "No"}</td>
                      <td>{isAssigned ? <span style={{ color: "#4ade80" }}>{preview.headers[currentCol]}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                      <td>{autoMap ? confBadge(autoMap.confidence) : "—"}</td>
                      <td>
                        <select value={currentCol ?? ""} onChange={e => setFieldMapping(field, e.target.value)} style={{ fontSize: 12, padding: "4px 6px" }}>
                          <option value="">— Skip —</option>
                          {preview.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(preview.unmapped_columns || []).length > 0 && (
            <div style={{ marginBottom: 12, padding: 10, background: "rgba(250,204,21,.08)", border: "1px solid rgba(250,204,21,.3)", borderRadius: 8 }}>
              <strong style={{ fontSize: 12 }}>Unmapped source columns:</strong>{" "}
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{preview.unmapped_columns.map(c => c.header).join(", ")}</span>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Use the dropdowns above to assign these to system fields if needed.</div>
            </div>
          )}

          <h4 style={{ marginBottom: 6 }}>Data Preview (first {Math.min(preview.sample_rows?.length || 0, 5)} rows)</h4>
          <div className="tableWrap miniTable" style={{ marginBottom: 12, maxHeight: 220, overflow: "auto" }}>
            <table>
              <thead><tr>{preview.headers.map((h, i) => <th key={i} style={{ fontSize: 11 }}>{h}</th>)}</tr></thead>
              <tbody>
                {(preview.sample_rows || []).slice(0, 5).map((row, ri) => (
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ fontSize: 11 }}>{cell || "—"}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="primaryBtn" onClick={doImport} disabled={importing}>{importing ? "Importing..." : `Confirm & Import ${preview.total_rows} Rows`}</button>
        </div>
      )}

      {report && (
        <div style={{ marginTop: 16 }}>
          <h3>Import Results</h3>
          <p><strong>Imported:</strong> {report.count || 0} rows</p>
          <div className="grid2">
            <div>
              <h4 style={{ color: "#4ade80" }}>Accepted ({(report.accepted || []).length})</h4>
              <div className="tableWrap miniTable" style={{ maxHeight: 200, overflow: "auto" }}>
                <table>
                  <thead><tr><th>Row</th><th>Name</th><th>Code</th></tr></thead>
                  <tbody>{(report.accepted || []).map((r, i) => <tr key={i}><td>{r.row}</td><td>{r.name}</td><td>{r.code}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 style={{ color: "#f87171" }}>Rejected ({(report.rejected || []).length})</h4>
              <div className="tableWrap miniTable" style={{ maxHeight: 200, overflow: "auto" }}>
                <table>
                  <thead><tr><th>Row</th><th>Reason</th></tr></thead>
                  <tbody>{(report.rejected || []).map((r, i) => <tr key={i}><td>{r.row}</td><td>{r.reason}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
          <button className="ghostBtn" style={{ marginTop: 12 }} onClick={() => { setFile(null); setPreview(null); setReport(null); setStage(""); }}>Upload Another</button>
        </div>
      )}
    </div>
  );
}

export default function AdditionsPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [clients, setClients] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [equipmentMaster, setEquipmentMaster] = useState([]);
  const [crewList, setCrewList] = useState([]);
  const [message, setMessage] = useState("");
  const [warehouseForm, setWarehouseForm] = useState(blankWarehouse);
  const [vendorForm, setVendorForm] = useState(blankVendor);
  const [clientForm, setClientForm] = useState(blankClient);
  const [equipmentMasterForm, setEquipmentMasterForm] = useState(blankEquipmentMaster);
  const [inventoryForm, setInventoryForm] = useState(blankInventory);
  const [crewForm, setCrewForm] = useState(blankCrew);
  const [entityDocFiles, setEntityDocFiles] = useState({ client: {}, vendor: {}, inventory: {}, warehouse: {} });
  const [entityDocInputKey, setEntityDocInputKey] = useState(0);
  const [crewIdProofs, setCrewIdProofs] = useState([blankIdProof()]);
  const [crewDocInputKey, setCrewDocInputKey] = useState(0);
  const [bulkEntity, setBulkEntity] = useState("inventory");
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkStage, setBulkStage] = useState("");
  const [bulkReport, setBulkReport] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkLive, setBulkLive] = useState(null);
  const [inventoryQuickSearch, setInventoryQuickSearch] = useState("");

  const [editId, setEditId] = useState(null); // non-null when editing existing record
  const isEditing = editId !== null;
  const [inventoryImageFiles, setInventoryImageFiles] = useState([]);
  const [equipMasterImageFiles, setEquipMasterImageFiles] = useState([]);

  const [addTab, setAddTab] = useState("equipment_master"); // sub-menu tab — equipment_master first
  const [masterTab, setMasterTab] = useState("equipmentMaster");
  const [selectedId, setSelectedId] = useState(null);
  const [masterSearch, setMasterSearch] = useState("");
  const filteredInventoryQuick = useSearch(inventory, inventoryQuickSearch);
  const inventoryQuickPg = usePagination(filteredInventoryQuick, 10);

  const location = useLocation();

  const load = () => {
    api.warehouses().then(setWarehouses);
    api.vendors().then(setVendors);
    api.clients().then(setClients);
    api.inventory().then(setInventory);
    api.equipmentMaster().then(setEquipmentMaster);
    api.crew().then(setCrewList);
  };
  useEffect(() => { load(); }, []);

  // Pre-fill form when navigated from Master Registry Edit button
  useEffect(() => {
    const { editItem, editTab } = location.state || {};
    if (!editItem || !editTab) return;
    setAddTab(editTab);
    setEditId(editItem.id);
    setMessage("");
    if (editTab === "inventory") {
      setInventoryForm({ ...blankInventory, ...editItem,
        parent_item_id: editItem.parent_item_id ?? "",
        warehouse_id: editItem.warehouse_id ?? "",
        vendor_id: editItem.vendor_id ?? "",
        equipment_master_id: editItem.equipment_master_id ?? "",
        warranty_expiry: editItem.warranty_expiry ?? "",
        service_due: editItem.service_due ?? "",
        vendor_available_from: editItem.vendor_available_from ?? "",
        vendor_available_until: editItem.vendor_available_until ?? "",
        qty_in_stock: editItem.qty_in_stock ?? "",
      });
    } else if (editTab === "crew") {
      setCrewForm({ ...blankCrew, ...editItem, vendor_id: editItem.vendor_id ?? "" });
    } else if (editTab === "vendor") {
      setVendorForm({ ...blankVendor, ...editItem });
    } else if (editTab === "client") {
      setClientForm({ ...blankClient, ...editItem, contacts: editItem.contacts?.length ? editItem.contacts : blankClient.contacts });
    } else if (editTab === "warehouse") {
      setWarehouseForm({ ...blankWarehouse, ...editItem });
    } else if (editTab === "equipment_master") {
      setEquipmentMasterForm({ ...blankEquipmentMaster, ...editItem });
    }
    window.scrollTo(0, 0);
  }, [location.state]); // eslint-disable-line

  const setContact = (idx, key, value) => {
    const contacts = [...clientForm.contacts];
    contacts[idx] = { ...contacts[idx], [key]: value };
    setClientForm({ ...clientForm, contacts });
  };
  const addContact = () => setClientForm({ ...clientForm, contacts: [...clientForm.contacts, {contact_name:"", designation:"", email:"", phone_country_code:"+91", phone_number:"", is_primary:false}] });

  const setEntityDocFile = (entityType, key, file) => {
    setEntityDocFiles(prev => ({ ...prev, [entityType]: { ...(prev[entityType] || {}), [key]: file } }));
  };

  async function uploadEntityDocuments(entityType, entityId, label) {
    const slots = documentSlots[entityType] || [];
    const files = entityDocFiles[entityType] || {};
    let uploaded = 0;
    for (const slot of slots) {
      const file = files[slot.key];
      if (!file) continue;
      const fd = new FormData();
      fd.append("entity_type", entityType);
      fd.append("entity_id", String(entityId));
      fd.append("document_name", slot.label);
      fd.append("notes", `${label || entityType} · ${slot.label}`);
      fd.append("file", file);
      await systemApi.uploadDocument(fd);
      uploaded += 1;
    }
    if (uploaded) {
      setEntityDocFiles(prev => ({ ...prev, [entityType]: {} }));
      setEntityDocInputKey(key => key + 1);
    }
    return uploaded;
  }

  function clearEdit() { setEditId(null); window.history.replaceState({}, ""); setInventoryImageFiles([]); setEquipMasterImageFiles([]); }

  async function saveWarehouse(e){ e.preventDefault(); try {
    if (isEditing) { await api.updateWarehouse(editId, warehouseForm); setMessage("Warehouse updated."); clearEdit(); }
    else { const created = await api.createWarehouse(warehouseForm); await uploadEntityDocuments("warehouse", created.id, warehouseForm.name); setWarehouseForm(blankWarehouse); setMessage("Warehouse added."); }
    load(); } catch(e){ setMessage(String(e.message||e)); } }

  async function saveVendor(e){ e.preventDefault(); try {
    if (isEditing) { await api.updateVendor(editId, vendorForm); setMessage("Vendor updated."); clearEdit(); }
    else { const created = await api.createVendor(vendorForm); await uploadEntityDocuments("vendor", created.id, vendorForm.name); setVendorForm(blankVendor); setMessage("Vendor added."); }
    load(); } catch(e){ setMessage(String(e.message||e)); } }

  async function saveClient(e){ e.preventDefault(); try {
    if (isEditing) { await api.updateClient(editId, clientForm); setMessage("Client updated."); clearEdit(); }
    else { const created = await api.createClient(clientForm); await uploadEntityDocuments("client", created.id, clientForm.name); setClientForm(blankClient); setMessage("Client added with contacts."); }
    load(); } catch(e){ setMessage(String(e.message||e)); } }

  async function uploadImages(entityType, entityId, imageFiles) {
    for (const img of imageFiles) {
      const fd = new FormData();
      fd.append("entity_type", entityType);
      fd.append("entity_id", String(entityId));
      fd.append("document_name", `Photo - ${img.name}`);
      fd.append("notes", `${entityType} photo`);
      fd.append("file", img);
      await systemApi.uploadDocument(fd);
    }
  }

  async function saveEquipmentMaster(e){ e.preventDefault(); try {
    if (isEditing) {
      await api.updateEquipmentMaster(editId, equipmentMasterForm);
      if (equipMasterImageFiles.length) { await uploadImages("equipment_master", editId, equipMasterImageFiles); setEquipMasterImageFiles([]); }
      setMessage("Equipment master updated."); clearEdit();
    } else {
      const created = await api.createEquipmentMaster(equipmentMasterForm);
      if (equipMasterImageFiles.length) { await uploadImages("equipment_master", created.id, equipMasterImageFiles); setEquipMasterImageFiles([]); }
      setEquipmentMasterForm(blankEquipmentMaster); setMessage("Equipment master added.");
    }
    load(); } catch(e){ setMessage(String(e.message||e)); } }
  async function saveInventory(e){
    e.preventDefault();
    const payload = {
      ...inventoryForm,
      parent_item_id: inventoryForm.parent_item_id ? Number(inventoryForm.parent_item_id) : null,
      warehouse_id: inventoryForm.warehouse_id ? Number(inventoryForm.warehouse_id) : null,
      vendor_id: inventoryForm.vendor_id ? Number(inventoryForm.vendor_id) : null,
      equipment_master_id: inventoryForm.equipment_master_id ? Number(inventoryForm.equipment_master_id) : null,
      warranty_expiry: inventoryForm.warranty_expiry || null,
      service_due: inventoryForm.service_due || null,
      vendor_available_from: inventoryForm.vendor_available_from || null,
      vendor_available_until: inventoryForm.vendor_available_until || null,
      qty_in_stock: inventoryForm.qty_in_stock ? Number(inventoryForm.qty_in_stock) : null,
      service_status: (inventoryForm.owner_type === "inhouse" && inventoryForm.item_type !== "consumable")
        ? inventoryForm.service_status : "not_in_service",
    };
    try {
      if (isEditing) {
        await api.updateInventory(editId, payload);
        if (inventoryImageFiles.length) { await uploadImages("inventory", editId, inventoryImageFiles); setInventoryImageFiles([]); }
        setMessage("Inventory item updated.");
        clearEdit();
      } else {
        const created = await api.createInventory(payload);
        const uploaded = await uploadEntityDocuments("inventory", created.id, inventoryForm.name);
        if (inventoryImageFiles.length) { await uploadImages("inventory", created.id, inventoryImageFiles); setInventoryImageFiles([]); }
        setInventoryForm(blankInventory);
        setMessage(uploaded ? `Inventory item added with ${uploaded} document(s).` : "Inventory item added.");
      }
      load();
    } catch(e){ setMessage(String(e.message||e)); }
  }
  const updateCrewIdProof = (key, patch) => {
    setCrewIdProofs(rows => rows.map(row => row.key === key ? { ...row, ...patch } : row));
  };
  const addCrewIdProof = () => setCrewIdProofs(rows => [...rows, blankIdProof()]);
  const removeCrewIdProof = (key) => setCrewIdProofs(rows => rows.length > 1 ? rows.filter(row => row.key !== key) : rows);

  async function uploadCrewDocument(crewId, proof, side, file) {
    if (!file) return;
    const fd = new FormData();
    fd.append("entity_type", "crew");
    fd.append("entity_id", String(crewId));
    const proofLabel = proof.type === "Others" ? (proof.description || "Others") : proof.type;
    fd.append("document_name", `${proofLabel} ${proof.number ? `(${proof.number}) ` : ""}- ${side === "front" ? "Front / First Page" : "Back / Last Page"}`);
    fd.append("notes", `${crewForm.full_name || "Crew"} ${proof.type} ${side === "front" ? "front/first page" : "back/last page"}`);
    fd.append("file", file);
    await systemApi.uploadDocument(fd);
  }

  async function saveCrew(e){
    e.preventDefault();
    try {
      // ── Edit mode: update only, no mandatory ID proof re-upload ──
      if (isEditing) {
        await api.updateCrew(editId, {
          ...crewForm,
          vendor_id: crewForm.vendor_id ? Number(crewForm.vendor_id) : null,
        });
        setMessage("Crew updated.");
        clearEdit();
        load();
        return;
      }
      // ── Create mode: require at least one ID proof document ──
      const validProofs = crewIdProofs.filter(row => row.type || row.number || row.front || row.back);
      const uploadedFiles = validProofs.flatMap(row => [row.front, row.back]).filter(Boolean);
      if (!uploadedFiles.length) {
        setMessage("Upload at least one ID proof document page before saving crew.");
        return;
      }
      const primaryProof = validProofs[0] || {};
      const created = await api.createCrew({
        ...crewForm,
        id_proof_type: primaryProof.type || crewForm.id_proof_type,
        id_proof_number: primaryProof.number || crewForm.id_proof_number,
        id_proofs: validProofs.map(row => ({ type: row.type, number: row.number, description: row.description || "" })),
        vendor_id: crewForm.vendor_id ? Number(crewForm.vendor_id) : null,
        home_station: crewForm.home_station || "Not specified",
      });
      for (const proof of validProofs) {
        await uploadCrewDocument(created.id, proof, "front", proof.front);
        await uploadCrewDocument(created.id, proof, "back", proof.back);
      }
      setCrewForm(blankCrew);
      setCrewIdProofs([blankIdProof()]);
      setCrewDocInputKey(key => key + 1);
      setMessage(`Crew added with ${uploadedFiles.length} ID proof document page(s).`);
      load();
    } catch(e){ setMessage(String(e.message||e)); }
  }

  async function doBulkUpload(e){
    e.preventDefault();
    if (!bulkFile) return;
    try {
      setBulkUploading(true);
      setBulkReport(null);
      setBulkLive({ progress_pct: 0, processed_items: 0, total_items: bulkPreview?.detected_total || 0 });
      setBulkStage(`Starting import${bulkPreview?.detected_total ? ` for ${bulkPreview.detected_total} detected rows` : ""}…`);

      const start = await api.bulkUploadStart(bulkEntity, bulkFile);
      const jobId = start.job_id;

      const poll = async () => {
        try {
          const s = await api.bulkUploadStatus(jobId);
          setBulkLive(s);
          const total = s.total_items || 0;
          const done = s.processed_items || 0;
          const currentIndex = s.current_index || done || 0;
          const pct = typeof s.progress_pct === "number" ? s.progress_pct : 0;
          let stageText = s.message || "Preparing rows";
          if (s.current_item && currentIndex > 0 && done < total) {
            stageText = `Adding ${s.current_item}${total ? ` · ${currentIndex} out of ${total} items` : ""}${typeof s.progress_pct === "number" ? ` · ${pct}%` : ""}`;
          } else if (total) {
            stageText = `${done} out of ${total} items completed${typeof s.progress_pct === "number" ? ` · ${pct}%` : ""}`;
          }
          setBulkStage(stageText);

          if (s.done) {
            setBulkUploading(false);
            setBulkStage(s.message || (s.ok ? "Import completed." : "Import failed."));
            setBulkReport({ count: s.accepted_count || 0, accepted: s.accepted || [], rejected: s.rejected || [], ok: s.ok });
            setMessage(s.ok ? `Bulk upload done. Imported ${s.accepted_count || 0} rows.` : (s.message || "Import failed."));
            setBulkFile(null);
            load();
            return;
          }
          setTimeout(poll, 400);
        } catch (err) {
          setBulkUploading(false);
          setBulkStage("");
          setMessage(String(err.message || err));
        }
      };

      poll();
    } catch(e){
      setBulkUploading(false);
      setBulkStage("");
      setMessage(String(e.message||e));
    }
  }

  const masterData = useMemo(() => {
    const map = {
      inventory,
      crew: crewList,
      clients,
      vendors,
      warehouses,
      equipmentMaster,
    };
    const rows = map[masterTab] || [];
    const q = masterSearch.trim().toLowerCase();
    return rows.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
  }, [masterTab, masterSearch, inventory, crewList, clients, vendors, warehouses, equipmentMaster]);

  const selectedItem = useMemo(() => masterData.find(x => String(x.id) === String(selectedId)) || masterData[0] || null, [masterData, selectedId]);

  useEffect(() => {
    if (masterData.length && !masterData.find(x => String(x.id) === String(selectedId))) {
      setSelectedId(masterData[0].id);
    }
  }, [masterData, selectedId]);

  const addTabs = [
    { key: "equipment_master", label: "Equipment Master" },
    { key: "inventory", label: "Inventory / Asset" },
    { key: "crew", label: "Crew / Manpower" },
    { key: "client", label: "Client" },
    { key: "vendor", label: "Vendor" },
    { key: "warehouse", label: "Warehouse" },
    { key: "bulk", label: "Bulk Upload" },
  ];

  return (
    <div className="page additionsPage">
      <h1 className="pageTitle">Additions</h1>
      {message ? <div className="messageBar">{message} <button className="dismissBtn" onClick={()=>setMessage("")}>Dismiss</button></div> : <div className="helperText">Use the sub-menu below to add individual entities, or use Bulk Upload for batch imports.</div>}

      {/* ──── SUB-MENU TABS ──── */}
      <div className="subMenuTabs">
        {addTabs.map(t => (
          <button key={t.key} className={`subMenuTab ${addTab === t.key ? "subMenuTabActive" : ""}`} onClick={() => setAddTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ──── EQUIPMENT MASTER ──── */}
      {addTab === "equipment_master" && <Card title="Equipment Master">
          <form className="formGrid additionsDetailGrid" onSubmit={saveEquipmentMaster}>
            <div className="fieldPair">
              <label className="fieldLabel">Equipment Code <InfoHint text="Master code for the equipment type. Can be auto-generated or follow your own nomenclature." /></label>
              <input placeholder="Equipment Code (optional auto)" value={equipmentMasterForm.equipment_code} onChange={e=>setEquipmentMasterForm({...equipmentMasterForm, equipment_code:e.target.value})} />
            </div>
            <div className="fieldPair">
              <label className="fieldLabel">Name <InfoHint text="Example: Sony FX9 Camera Body, V-Mount Battery Set, Canon CN-E 70-200mm." /></label>
              <input placeholder="Name" value={equipmentMasterForm.name} onChange={e=>setEquipmentMasterForm({...equipmentMasterForm, name:e.target.value})} required />
            </div>
            <div className="fieldPair">
              <label className="fieldLabel">Category</label>
              <AutocompleteInput value={equipmentMasterForm.category} onChange={v=>setEquipmentMasterForm({...equipmentMasterForm, category:v})} suggestions={[...new Set(equipmentMaster.map(e=>e.category).filter(Boolean))]} placeholder="Category" />
            </div>
            <div className="fieldPair">
              <label className="fieldLabel">Item Type</label>
              <select value={equipmentMasterForm.item_type} onChange={e=>setEquipmentMasterForm({...equipmentMasterForm, item_type:e.target.value})}>
                <option value="device">Device — standalone bookable unit (camera, lens, monitor)</option>
                <option value="accessory">Accessory — travels with device (battery, charger, card)</option>
                <option value="kit">Kit — named group that auto-expands in booking</option>
                <option value="bundle">Bundle — pre-packaged multi-device set</option>
                <option value="third_party_equipment">Third-Party — rented from vendor, not owned</option>
                <option value="consumable">Consumable — stock item (tape, gel, gaffer)</option>
              </select>
            </div>
            {["kit","bundle"].includes(equipmentMasterForm.item_type) && (
              <p className="helperText full" style={{marginTop:0}}>For kits/bundles: add mandatory/optional accessory codes below so the system auto-validates or pre-selects accessories whenever this kit is booked.</p>
            )}
            <div className="fieldPair">
              <label className="fieldLabel">Brand</label>
              <input placeholder="Brand" value={equipmentMasterForm.brand} onChange={e=>setEquipmentMasterForm({...equipmentMasterForm, brand:e.target.value})} />
            </div>
            <div className="fieldPair">
              <label className="fieldLabel">Model No</label>
              <input placeholder="Model No" value={equipmentMasterForm.model_no} onChange={e=>setEquipmentMasterForm({...equipmentMasterForm, model_no:e.target.value})} />
            </div>
            <div className="fieldPair full">
              <label className="fieldLabel">Mandatory Accessory Codes <InfoHint text="Comma-separated accessory equipment master codes required whenever this equipment is booked. Example: EQM-01010, EQM-01011." /></label>
              <input placeholder="Mandatory Accessory Codes (comma separated)" value={equipmentMasterForm.mandatory_accessory_codes} onChange={e=>setEquipmentMasterForm({...equipmentMasterForm, mandatory_accessory_codes:e.target.value})} />
            </div>
            <div className="fieldPair full">
              <label className="fieldLabel">Optional Accessory Codes <InfoHint text="Comma-separated accessory equipment master codes suggested but not compulsory." /></label>
              <input placeholder="Optional Accessory Codes (comma separated)" value={equipmentMasterForm.optional_accessory_codes} onChange={e=>setEquipmentMasterForm({...equipmentMasterForm, optional_accessory_codes:e.target.value})} />
            </div>
            <div className="fieldPair full">
              <label className="fieldLabel">Notes</label>
              <textarea placeholder="Notes" value={equipmentMasterForm.notes} onChange={e=>setEquipmentMasterForm({...equipmentMasterForm, notes:e.target.value})}></textarea>
            </div>
            <div className="fieldPair full">
              <label className="fieldLabel">Equipment Photos <span className="helperText" style={{fontWeight:400}}>(optional, multiple)</span></label>
              <input type="file" accept="image/*" multiple onChange={e => setEquipMasterImageFiles(Array.from(e.target.files))} />
              <span className="helperText">{equipMasterImageFiles.length ? `${equipMasterImageFiles.length} image(s) selected` : "No images selected."}</span>
            </div>
            <button className="full primaryBtn" type="submit">{isEditing ? "Update Equipment Master" : "Save Equipment Master"}</button>
          </form>
        </Card>}

      {/* ──── INVENTORY / ASSET ──── */}
      {addTab === "inventory" && <Card title="Inventory / Asset">
          <form className="formGrid additionsDetailGrid" onSubmit={saveInventory}>

            {/* ── Identity ── */}
            <div className="fieldPair">
              <label className="fieldLabel">Asset Code <InfoHint text="Your internal tag (e.g. KPS/CAM/FX9-01). Leave blank to auto-generate." /></label>
              <input placeholder="Asset Code (optional auto)" value={inventoryForm.asset_code} onChange={e=>setInventoryForm({...inventoryForm, asset_code:e.target.value})} />
            </div>
            <div className="fieldPair">
              <label className="fieldLabel">Serial Number <InfoHint text="Manufacturer serial number printed on the device. Leave blank for accessories or consumables without a serial." /></label>
              <input placeholder="Serial Number" value={inventoryForm.serial_number} onChange={e=>setInventoryForm({...inventoryForm, serial_number:e.target.value})} />
            </div>
            <div className="fieldPair">
              <label className="fieldLabel">Name <InfoHint text="Descriptive name, e.g. Sony FX9 Camera Body or V-Mount Battery 98Wh." /></label>
              <AutocompleteInput value={inventoryForm.name} onChange={v=>setInventoryForm({...inventoryForm, name:v})} suggestions={[...new Set(inventory.map(i=>i.name))]} placeholder="Name" required />
            </div>
            <div className="fieldPair">
              <label className="fieldLabel">Category <InfoHint text="Group similar items — Camera, Lens, Battery, Audio, Lighting, etc." /></label>
              <AutocompleteInput value={inventoryForm.category} onChange={v=>setInventoryForm({...inventoryForm, category:v})} suggestions={[...new Set(inventory.map(i=>i.category).filter(Boolean))]} placeholder="Category" />
            </div>

            {/* ── Classification ── */}
            <div className="fieldPair">
              <label className="fieldLabel">Item Type <InfoHint text="device = standalone bookable unit. accessory = always accompanies a device (battery, card, charger). kit = named collection of devices/accessories (e.g. ENG Camera Kit). bundle = pre-packaged multi-device set. third_party_equipment = rented from vendor — NOT a company asset. consumable = stock-depleted item (tape, gaffer tape, ink)." /></label>
              <select value={inventoryForm.item_type} onChange={e=>setInventoryForm({...inventoryForm, item_type:e.target.value, qty_in_stock: e.target.value === "consumable" ? (inventoryForm.qty_in_stock || "1") : inventoryForm.qty_in_stock, owner_type: e.target.value === "third_party_equipment" ? "third_party" : inventoryForm.owner_type})}>
                <option value="device">Device — standalone bookable unit</option>
                <option value="accessory">Accessory — travels with a device</option>
                <option value="kit">Kit — named collection (auto-expands in booking)</option>
                <option value="bundle">Bundle — pre-packaged multi-device set</option>
                <option value="third_party_equipment">Third-Party Equipment — rented from vendor</option>
                <option value="consumable">Consumable — stock-depleted item</option>
              </select>
            </div>

            {/* Consumable qty */}
            {inventoryForm.item_type === "consumable" && <>
              <div className="fieldPair">
                <label className="fieldLabel">Quantity in Stock <InfoHint text="Current stock count. Reduces on each booking." /></label>
                <input type="number" min="0" placeholder="e.g. 10" value={inventoryForm.qty_in_stock} onChange={e=>setInventoryForm({...inventoryForm, qty_in_stock:e.target.value})} />
              </div>
            </>}

            {/* Kit/Bundle parent */}
            {["kit","bundle"].includes(inventoryForm.item_type) && <>
              <label className="fieldLabel full">Child Items <InfoHint text="Add individual items and set this kit as their Parent Item. All children auto-added when kit is booked." /></label>
              <p className="helperText full" style={{marginTop:0}}>Save this kit first, then open each child item in Master Registry and set its Parent Item to this kit.</p>
            </>}

            {/* Accessory / device: link to parent kit */}
            {["device","accessory"].includes(inventoryForm.item_type) && <>
              <div className="fieldPair">
                <label className="fieldLabel">Part of Kit / Bundle <InfoHint text="Optional. Select the parent kit this item belongs to. It will auto-include in booking when the kit is selected." /></label>
                <select value={inventoryForm.parent_item_id} onChange={e=>setInventoryForm({...inventoryForm, parent_item_id:e.target.value})}>
                  <option value="">Not part of a kit</option>
                  {inventory.filter(i => ["kit","bundle"].includes(i.item_type)).map(i => <option key={i.id} value={i.id}>{i.asset_code} — {i.name}</option>)}
                </select>
              </div>
            </>}

            {/* ── Equipment Master Link ── */}
            <div className="fieldPair">
              <label className="fieldLabel">Link Equipment Master <InfoHint text="Attach to a master spec to inherit mandatory/optional accessory rules. Enables auto-accessory enforcement in booking." /></label>
              <select value={inventoryForm.equipment_master_id} onChange={e=>setInventoryForm({...inventoryForm, equipment_master_id:e.target.value})}>
                <option value="">No master link</option>
                {equipmentMaster.map(m => <option key={m.id} value={m.id}>{m.equipment_code} — {m.name}</option>)}
              </select>
            </div>

            {/* ── Ownership ── */}
            <div className="fieldPair">
              <label className="fieldLabel">Ownership <InfoHint text="Inhouse = company-owned asset (appears in asset register). Third-Party = rented from vendor — not your asset, will not appear in depreciation / statutory." /></label>
              <select value={inventoryForm.owner_type} onChange={e=>setInventoryForm({...inventoryForm, owner_type:e.target.value})}>
                <option value="inhouse">Inhouse — company owned</option>
                <option value="third_party">Third-Party — rented from vendor</option>
              </select>
            </div>
            <div className="fieldPair">
              <label className="fieldLabel">Vendor <InfoHint text="Required for third-party items. Identifies which vendor the item is rented from." /></label>
              <select value={inventoryForm.vendor_id} onChange={e=>setInventoryForm({...inventoryForm, vendor_id:e.target.value})}>
                <option value="">No vendor / inhouse</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>

            {/* Third-party rental window */}
            {inventoryForm.owner_type === "third_party" && <>
              <div className="fieldPair">
                <label className="fieldLabel">Vendor Available From <InfoHint text="Date from which this rented item is available. System will block bookings before this date." /></label>
                <input type="date" value={inventoryForm.vendor_available_from} onChange={e=>setInventoryForm({...inventoryForm, vendor_available_from:e.target.value})} />
              </div>
              <div className="fieldPair">
                <label className="fieldLabel">Vendor Available Until <InfoHint text="Last date this rented item is available. System will block bookings after this date." /></label>
                <input type="date" value={inventoryForm.vendor_available_until} onChange={e=>setInventoryForm({...inventoryForm, vendor_available_until:e.target.value})} />
              </div>
            </>}

            {/* ── Storage ── */}
            <div className="fieldPair">
              <label className="fieldLabel">Warehouse <InfoHint text="Home warehouse where this item is stored when not on shoot." /></label>
              <select value={inventoryForm.warehouse_id} onChange={e=>setInventoryForm({...inventoryForm, warehouse_id:e.target.value})}>
                <option value="">Select Warehouse</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} — {w.city}</option>)}
              </select>
            </div>
            <div className="fieldPair">
              <label className="fieldLabel">Storage Location <InfoHint text="Specific city, shelf, or bay within the warehouse." /></label>
              <LocationAutocomplete value={inventoryForm.location_text} onChange={v=>setInventoryForm({...inventoryForm, location_text:v})} extraSuggestions={[...new Set(inventory.map(i=>i.location_text).filter(Boolean))]} placeholder="Location (Indian city/locality)" />
            </div>

            {/* ── Operational Status ── */}
            <div className="fieldPair">
              <label className="fieldLabel">Operational Status <InfoHint text="Available = ready to book. Decommissioned = permanently retired / written off — will not appear in booking. The service section will set this automatically when an item is marked completely damaged." /></label>
              <select value={inventoryForm.status} onChange={e=>setInventoryForm({...inventoryForm, status:e.target.value})}>
                <option value="available">Available — ready for booking</option>
                <option value="decommissioned">Decommissioned — permanently retired / written off</option>
                <option value="inactive">Inactive — temporarily out of use</option>
              </select>
            </div>

            {/* ── Condition & Service ── (only for inhouse, not consumables) */}
            {inventoryForm.owner_type === "inhouse" && inventoryForm.item_type !== "consumable" && <>
              <div className="fieldPair">
                <label className="fieldLabel">Condition <InfoHint text="Current working condition. The service section sets 'In Service' when a job opens and 'Completely Damaged' when permanently retired. Use 'Needs Service' to flag for the service team." /></label>
                <select value={inventoryForm.service_status} onChange={e=>setInventoryForm({...inventoryForm, service_status:e.target.value})}>
                  <option value="not_in_service">Good — no service needed</option>
                  <option value="ok">Good — recently serviced</option>
                  <option value="needs_service">Needs Service — flag for service team</option>
                  <option value="completely_damaged">Completely Damaged / Decommissioned</option>
                </select>
              </div>
              <div className="fieldPair">
                <label className="fieldLabel">Warranty Expiry <InfoHint text="Manufacturer warranty end date. System will warn when approaching expiry." /></label>
                <input type="date" value={inventoryForm.warranty_expiry} onChange={e=>setInventoryForm({...inventoryForm, warranty_expiry:e.target.value})} />
              </div>
              <div className="fieldPair">
                <label className="fieldLabel">Next Service Due <InfoHint text="Scheduled date for next preventive maintenance or calibration." /></label>
                <input type="date" value={inventoryForm.service_due} onChange={e=>setInventoryForm({...inventoryForm, service_due:e.target.value})} />
              </div>
              <div className="fieldPair">
                <label className="fieldLabel">Statutory Tag / Asset Register <InfoHint text="Your asset register number, depreciation ledger code, or statutory ID for accounting." /></label>
                <input placeholder="Statutory Tag / Asset Register" value={inventoryForm.statutory_tag} onChange={e=>setInventoryForm({...inventoryForm, statutory_tag:e.target.value})} />
              </div>
            </>}

            <div className="fieldPair full">
              <label className="fieldLabel">Notes</label>
              <textarea placeholder="Notes (optional)" value={inventoryForm.notes} onChange={e=>setInventoryForm({...inventoryForm, notes:e.target.value})}></textarea>
            </div>
            <div className="fieldPair full">
              <label className="fieldLabel">Asset Photos <span className="helperText" style={{fontWeight:400}}>(optional, multiple)</span></label>
              <input type="file" accept="image/*" multiple onChange={e => setInventoryImageFiles(Array.from(e.target.files))} />
              <span className="helperText">{inventoryImageFiles.length ? `${inventoryImageFiles.length} image(s) selected` : "No images selected."}</span>
            </div>
            {inventoryForm.owner_type === "inhouse" && <DocumentUploadFields entityType="inventory" files={entityDocFiles.inventory} inputKey={entityDocInputKey} onChange={(key, file) => setEntityDocFile("inventory", key, file)} />}
            <button className="full primaryBtn" type="submit">{isEditing ? "Update Inventory Item" : "Save Inventory Item"}</button>
          </form>
          <div className="helperText" style={{marginTop:12}}>Quick View — see <strong>Master Registry</strong> for full details.</div>
          <div className="listToolbar" style={{marginTop:8}}>
            <SearchBar value={inventoryQuickSearch} onChange={value => { setInventoryQuickSearch(value); inventoryQuickPg.setPage(1); }} suggestions={buildSuggestions(inventory)} placeholder="Search quick inventory by asset code, serial, name, type, status..." />
          </div>
          <div className="tableWrap miniTable" style={{marginTop:8}}>
            <table>
              <thead><tr><th>Asset Code</th><th>Serial No</th><th>Name</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>{inventoryQuickPg.pageData.map(i => <tr key={i.id}><td>{i.asset_code}</td><td>{i.serial_number || "-"}</td><td>{i.name}</td><td>{i.item_type}</td><td>{i.status}</td></tr>)}</tbody>
            </table>
          </div>
          <Pagination total={inventoryQuickPg.total} page={inventoryQuickPg.page} pageSize={inventoryQuickPg.pageSize} onPageChange={inventoryQuickPg.setPage} onPageSizeChange={inventoryQuickPg.setPageSize} />
        </Card>}

      {/* ──── CLIENT ──── */}
      {addTab === "client" && <Card title="Add Client">
          <form className="formGrid" onSubmit={saveClient}>
            <input placeholder="Client Name" value={clientForm.name} onChange={e=>setClientForm({...clientForm, name:e.target.value})} required />
            <input placeholder="Industry Type" value={clientForm.industry_type} onChange={e=>setClientForm({...clientForm, industry_type:e.target.value})} />
            <StatutoryField type="GST" value={clientForm.gst_number} onChange={v=>setClientForm({...clientForm, gst_number:v})} placeholder="GST Number (15 chars)" />
            <StatutoryField type="PAN" value={clientForm.pan_number || ""} onChange={v=>setClientForm({...clientForm, pan_number:v})} placeholder="PAN Number (AAAAA9999A)" />
            <LocationAutocomplete value={clientForm.billing_address || ""} onChange={v=>setClientForm({...clientForm, billing_address:v})} placeholder="Billing Address (location)" />
            <textarea className="full" placeholder="Notes" value={clientForm.notes} onChange={e=>setClientForm({...clientForm, notes:e.target.value})}></textarea>
            <div className="full"><strong>Contacts</strong></div>
            {clientForm.contacts.map((c, idx) => (
              <div key={idx} className="contactGrid full">
                <input placeholder="Contact Name" value={c.contact_name} onChange={e=>setContact(idx,"contact_name",e.target.value)} />
                <input placeholder="Designation" value={c.designation} onChange={e=>setContact(idx,"designation",e.target.value)} />
                <input placeholder="Email" value={c.email} onChange={e=>setContact(idx,"email",e.target.value)} />
                <CountryCodeSelect value={c.phone_country_code} onChange={v=>setContact(idx,"phone_country_code",v)} />
                <input placeholder="Phone Number" value={c.phone_number} onChange={e=>setContact(idx,"phone_number",e.target.value)} />
                <label className="checkCard"><input type="checkbox" checked={c.is_primary} onChange={e=>setContact(idx,"is_primary",e.target.checked)} /><span>Primary</span></label>
              </div>
            ))}
            <button type="button" className="ghostBtn full" onClick={addContact}>Add Another Contact</button>
            <DocumentUploadFields entityType="client" files={entityDocFiles.client} inputKey={entityDocInputKey} onChange={(key, file) => setEntityDocFile("client", key, file)} />
            <button className="primaryBtn full" type="submit">{isEditing ? "Update Client" : "Save Client"}</button>
          </form>
        </Card>}

      {/* ──── VENDOR ──── */}
      {addTab === "vendor" && <Card title="Add Vendor">
          <form className="formGrid" onSubmit={saveVendor}>
            <input placeholder="Vendor Code (optional auto)" value={vendorForm.vendor_code} onChange={e=>setVendorForm({...vendorForm, vendor_code:e.target.value})} />
            <input placeholder="Vendor Name" value={vendorForm.name} onChange={e=>setVendorForm({...vendorForm, name:e.target.value})} required />
            <select value={vendorForm.vendor_type} onChange={e=>setVendorForm({...vendorForm, vendor_type:e.target.value})}><option>service</option><option>equipment</option><option>crew</option><option>logistics</option><option>procurement</option></select>
            <LocationAutocomplete value={vendorForm.city || ""} onChange={v=>setVendorForm({...vendorForm, city:v})} placeholder="City (location)" />
            <input placeholder="Contact Person" value={vendorForm.contact_person} onChange={e=>setVendorForm({...vendorForm, contact_person:e.target.value})} />
            <PhoneInput value={vendorForm.phone} onChange={v=>setVendorForm({...vendorForm, phone:v})} placeholder="Phone" />
            <input placeholder="Email" value={vendorForm.email} onChange={e=>setVendorForm({...vendorForm, email:e.target.value})} />
            <StatutoryField type="GST" value={vendorForm.gst_number} onChange={v=>setVendorForm({...vendorForm, gst_number:v})} placeholder="GST Number (15 chars)" />
            <StatutoryField type="PAN" value={vendorForm.pan_number || ""} onChange={v=>setVendorForm({...vendorForm, pan_number:v})} placeholder="PAN Number (AAAAA9999A)" />
            <textarea className="full" placeholder="Notes" value={vendorForm.notes} onChange={e=>setVendorForm({...vendorForm, notes:e.target.value})}></textarea>
            <DocumentUploadFields entityType="vendor" files={entityDocFiles.vendor} inputKey={entityDocInputKey} onChange={(key, file) => setEntityDocFile("vendor", key, file)} />
            <button className="primaryBtn full" type="submit">{isEditing ? "Update Vendor" : "Save Vendor"}</button>
          </form>
        </Card>}

      {/* ──── CREW / MANPOWER ──── */}
      {addTab === "crew" && <Card title="Add Crew / Manpower">
          <form className="formGrid" onSubmit={saveCrew}>
            <input placeholder="Employee Code (optional auto)" value={crewForm.employee_code} onChange={e=>setCrewForm({...crewForm, employee_code:e.target.value})} />
            <input placeholder="Full Name" value={crewForm.full_name} onChange={e=>setCrewForm({...crewForm, full_name:e.target.value})} required />
            <AutocompleteInput value={crewForm.role} onChange={v=>setCrewForm({...crewForm, role:v})} suggestions={[...new Set(crewList.map(c=>c.role).filter(Boolean))]} placeholder="Role" required />
            <select value={crewForm.manpower_type} onChange={e=>setCrewForm({...crewForm, manpower_type:e.target.value})}><option>inhouse</option><option>external</option><option>contractual</option><option>freelance</option></select>
            <select value={crewForm.vendor_id} onChange={e=>setCrewForm({...crewForm, vendor_id:e.target.value})}><option value="">Vendor (optional)</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
            <LocationAutocomplete value={crewForm.home_station} onChange={v=>setCrewForm({...crewForm, home_station:v})} placeholder="Home Station (location)" />
            <PhoneInput value={crewForm.phone} onChange={v=>setCrewForm({...crewForm, phone:v})} placeholder="Phone" />
            <input placeholder="Address" value={crewForm.address} onChange={e=>setCrewForm({...crewForm, address:e.target.value})} />
            <StatutoryField type="Aadhaar" value={crewForm.aadhar_number} onChange={v=>setCrewForm({...crewForm, aadhar_number:v})} placeholder="Aadhaar Number (12 digits)" />
            <StatutoryField type="PAN" value={crewForm.pan_number || ""} onChange={v=>setCrewForm({...crewForm, pan_number:v})} placeholder="PAN Number (AAAAA9999A)" />
            <select value={crewForm.blood_group} onChange={e=>setCrewForm({...crewForm, blood_group:e.target.value})}>
              <option value="">Blood Group (optional)</option>
              {BLOOD_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
            <div style={{gridColumn:"1/-1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <input placeholder="Emergency Contact Name" value={crewForm.emergency_contact || ""} onChange={e=>setCrewForm({...crewForm, emergency_contact:e.target.value})} />
              <PhoneInput value={crewForm.emergency_contact_phone || ""} onChange={v=>setCrewForm({...crewForm, emergency_contact_phone:v})} placeholder="Emergency Contact Phone" />
            </div>
            <div className="full documentUploadPanel">
              <strong>ID Proofs</strong>
              <p className="helperText">Add one or more ID proofs. At least one uploaded page is required.</p>
              <div className="documentSlotGrid">
                {crewIdProofs.map((proof, index) => (
                  <div className="documentUploadBox" key={proof.key}>
                    <label className="fieldLabel">ID Proof {index + 1}</label>
                    <select value={proof.type} onChange={e=>updateCrewIdProof(proof.key, { type: e.target.value, number: "", description: "" })}>
                      {ID_PROOF_TYPES.map(type => <option key={type}>{type}</option>)}
                    </select>
                    {proof.type === "Others" && (
                      <input placeholder="Describe document type (e.g. Company ID, ration card...)" value={proof.description || ""}
                        onChange={e=>updateCrewIdProof(proof.key, { description: e.target.value })} style={{ marginTop:4 }} />
                    )}
                    {proof.type !== "Others" ? (
                      <StatutoryField
                        type={proof.type}
                        value={proof.number}
                        onChange={v=>updateCrewIdProof(proof.key, { number: v })}
                        placeholder={`${proof.type} Number`}
                      />
                    ) : (
                      <input placeholder="ID / Reference Number (optional)" value={proof.number || ""}
                        onChange={e=>updateCrewIdProof(proof.key, { number: e.target.value })} style={{ marginTop:4 }} />
                    )}
                    <label className="fieldLabel" style={{marginTop:6}}>{proof.type === "Others" ? (proof.description || "Document") : proof.type} Front / First Page</label>
                    <input key={`front-${proof.key}-${crewDocInputKey}`} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={e=>updateCrewIdProof(proof.key, { front: e.target.files?.[0] || null })} />
                    <span className="helperText">{proof.front ? proof.front.name : "Upload front side or first page."}</span>
                    <label className="fieldLabel">{proof.type === "Others" ? (proof.description || "Document") : proof.type} Back / Last Page</label>
                    <input key={`back-${proof.key}-${crewDocInputKey}`} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={e=>updateCrewIdProof(proof.key, { back: e.target.files?.[0] || null })} />
                    <span className="helperText">{proof.back ? proof.back.name : "Upload back side or last page if applicable."}</span>
                    {crewIdProofs.length > 1 ? <button type="button" className="ghostBtn compactBtn" onClick={() => removeCrewIdProof(proof.key)}>Remove Proof</button> : null}
                  </div>
                ))}
              </div>
              <button type="button" className="ghostBtn compactBtn" onClick={addCrewIdProof}>Add Another ID Proof</button>
            </div>
            <button className="primaryBtn full" type="submit">{isEditing ? "Update Crew" : "Save Crew"}</button>
          </form>
        </Card>}

      {/* ──── WAREHOUSE ──── */}
      {addTab === "warehouse" && <Card title="Add Warehouse">
          <form className="formGrid" onSubmit={saveWarehouse}>
            <input placeholder="Warehouse Code" value={warehouseForm.code} onChange={e=>setWarehouseForm({...warehouseForm, code:e.target.value})} required />
            <input placeholder="Warehouse Name" value={warehouseForm.name} onChange={e=>setWarehouseForm({...warehouseForm, name:e.target.value})} required />
            <LocationAutocomplete value={warehouseForm.city} onChange={v=>setWarehouseForm({...warehouseForm, city:v})} placeholder="City (location)" required />
            <input placeholder="Address" value={warehouseForm.address} onChange={e=>setWarehouseForm({...warehouseForm, address:e.target.value})} />
            <input placeholder="Manager Name" value={warehouseForm.manager_name} onChange={e=>setWarehouseForm({...warehouseForm, manager_name:e.target.value})} />
            <input placeholder="Contact No" value={warehouseForm.contact_no} onChange={e=>setWarehouseForm({...warehouseForm, contact_no:e.target.value})} />
            <DocumentUploadFields entityType="warehouse" files={entityDocFiles.warehouse} inputKey={entityDocInputKey} onChange={(key, file) => setEntityDocFile("warehouse", key, file)} />
            <button className="primaryBtn full" type="submit">{isEditing ? "Update Warehouse" : "Save Warehouse"}</button>
          </form>
        </Card>}

      {/* ──── BULK UPLOAD ──── */}
      {addTab === "bulk" && <>
        <Card title="Smart Upload (Any Format)">
          <SmartUploadPanel onDone={load} />
        </Card>
        <Card title="Legacy Upload (Excel Only)">
          <form className="formGrid" onSubmit={doBulkUpload}>
            <label className="fieldLabel">Entity Type</label>
            <select value={bulkEntity} onChange={e=>setBulkEntity(e.target.value)}>
              <option value="inventory">Inventory</option><option value="clients">Clients</option><option value="crew">Crew</option><option value="vendors">Vendors</option><option value="warehouses">Warehouses</option>
            </select>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={async e=>{
              const f = e.target.files?.[0] || null; setBulkFile(f); setBulkPreview(null);
              if (f) { try { setBulkStage("Scanning…"); const preview = await api.bulkUploadPreview(bulkEntity, f); setBulkPreview(preview); setBulkStage(preview?.ok ? `Detected ${preview.detected_total || 0} rows.` : (preview?.reason || "Could not scan.")); } catch(err) { setBulkStage(String(err.message || err)); } }
            }} required />
            <button className="full primaryBtn" type="submit">Upload File</button>
            {bulkPreview ? (<div className="full previewBox"><div><strong>Detected rows:</strong> {bulkPreview.detected_total || 0}</div>{(bulkPreview.sample_items || []).length ? <ul className="sampleList">{(bulkPreview.sample_items || []).slice(0, 5).map((x, idx) => <li key={idx}>{x.sheet} · row {x.row} · {x.name}</li>)}</ul> : null}</div>) : null}
          </form>
          {bulkUploading ? (<div className="statusWrap"><div className="progressWrap realProgress"><div className="progressBar" style={{width: `${bulkLive?.progress_pct || 0}%`}}></div><span>{bulkLive?.progress_pct || 0}%</span></div><div className="statusText">{bulkStage}</div></div>) : null}
        </Card>
      </>}

      <BulkUploadModal report={bulkReport} onClose={() => setBulkReport(null)} />
    </div>
  );
}
