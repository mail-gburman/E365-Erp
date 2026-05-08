import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import AutocompleteInput from "../components/AutocompleteInput";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions } from "../components/SearchBar";
import { api, downloadAuthorized, fetchBlobUrlAuthorized, viewAuthorized } from "../api";

const blank = {
  service_scope: "inhouse",
  job_number: "",
  inventory_item_id: "",
  vendor_id: "",
  vendor_name: "",
  sent_date: "",
  expected_return_date: "",
  actual_return_date: "",
  status: "in_service",
  transport_mode: "courier",
  courier_partner: "",
  awb_number: "",
  contact_person_name: "",
  contact_person_mobile: "",
  alternate_contact_name: "",
  alternate_contact_mobile: "",
  contact_email: "",
  pickup_address: "E365 Kolkata Office",
  delivery_address: "",
  package_count: 1,
  declared_value: "",
  package_notes: "",
  problem_reported: "",
  remarks: "",
};

function businessSummary(job) {
  const bits = [];
  if (job.transport_mode) bits.push(`Transport: ${job.transport_mode}`);
  if (job.courier_partner) bits.push(`Courier partner: ${job.courier_partner}`);
  if (job.awb_number) bits.push(`Tracking number: ${job.awb_number}`);
  if (job.contact_person_name || job.contact_person_mobile) bits.push(`Primary contact: ${[job.contact_person_name, job.contact_person_mobile].filter(Boolean).join(" / ")}`);
  if (job.alternate_contact_name || job.alternate_contact_mobile) bits.push(`Backup contact: ${[job.alternate_contact_name, job.alternate_contact_mobile].filter(Boolean).join(" / ")}`);
  if (job.contact_email) bits.push(`Email: ${job.contact_email}`);
  if (job.package_count) bits.push(`Packages: ${job.package_count}`);
  if (job.attachments?.length) bits.push(`Damage photos: ${job.attachments.length}`);
  return bits;
}

function AttachmentThumb({ attachment }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    fetchBlobUrlAuthorized(api.serviceAttachmentUrl(attachment.id))
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => setSrc(""));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  return (
    <div className="serviceAttachmentCard">
      {src ? <img src={src} alt={attachment.file_name} className="serviceAttachmentThumb" /> : <div className="serviceAttachmentFallback">Image</div>}
      <div className="serviceAttachmentMeta">
        <strong title={attachment.file_name}>{attachment.file_name}</strong>
        {attachment.caption ? <span>{attachment.caption}</span> : null}
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const [inventory, setInventory] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  const [svcSearch, setSvcSearch] = useState("");
  const [svcStatusFilter, setSvcStatusFilter] = useState("");
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoCaption, setPhotoCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionDialog, setActionDialog] = useState(null); // { type: "complete"|"forever_damaged", jobId, jobNumber }

  async function doServicePdfDownload(id, jobNumber) {
    try {
      await downloadAuthorized(api.servicePdfUrl(id), `service_${jobNumber || id}.pdf`);
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function doServicePdfView(id, jobNumber) {
    try {
      await viewAuthorized(api.servicePdfUrl(id), `service_${jobNumber || id}.pdf`);
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function doDeclarationPdfDownload(id, jobNumber) {
    try {
      await downloadAuthorized(api.serviceDeclarationPdfUrl(id), `declaration_${jobNumber || id}.pdf`);
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function doAddressLabelPdfDownload(id, jobNumber) {
    try {
      await downloadAuthorized(api.serviceAddressLabelPdfUrl(id), `address_label_${jobNumber || id}.pdf`);
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  const load = () => {
    api.inventory().then(setInventory);
    api.vendors().then(setVendors);
    api.serviceJobDetails().then(setJobs);
  };

  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      const isInhouse = form.service_scope === "inhouse";
      const created = await api.createServiceJob({
        ...form,
        service_scope: undefined,
        inventory_item_id: Number(form.inventory_item_id),
        vendor_id: isInhouse ? null : (form.vendor_id ? Number(form.vendor_id) : null),
        vendor_name: isInhouse ? "E365 Inhouse Service" : form.vendor_name,
        expected_return_date: form.expected_return_date || null,
        actual_return_date: form.actual_return_date || null,
        package_count: Number(form.package_count || 1),
        declared_value: form.declared_value === "" ? null : Number(form.declared_value),
        transport_mode: isInhouse ? "inhouse" : form.transport_mode,
        pickup_address: form.pickup_address || "E365 Kolkata Office",
        delivery_address: isInhouse ? "E365 Inhouse Service Desk" : form.delivery_address,
        awb_number: !isInhouse && form.transport_mode === "courier" ? form.awb_number : null,
        courier_partner: !isInhouse && form.transport_mode === "courier" ? form.courier_partner : null,
      });
      if (photoFiles.length) {
        await api.uploadServiceAttachments(created.id, photoFiles, photoCaption);
      }
      setForm(blank);
      setPhotoFiles([]);
      setPhotoCaption("");
      setMessage("Service job created with transport details, business contacts, and damage photos.");
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  const [actionNotes, setActionNotes] = useState("");

  async function confirmAction() {
    if (!actionDialog) return;
    const { type, jobId } = actionDialog;
    setActionDialog(null);
    try {
      if (type === "complete") {
        await api.completeServiceJob(jobId, actionNotes);
        setMessage("Service completed.");
      } else if (type === "forever_damaged") {
        await api.foreverDamagedServiceJob(jobId, actionNotes);
        setMessage("Marked as forever damaged. Inventory deactivated.");
      }
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    } finally {
      setActionNotes("");
    }
  }

  async function removeAttachment(id) {
    try {
      await api.deleteServiceAttachment(id);
      setMessage("Damage photo removed.");
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function addMorePhotos(jobId) {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/*";
    picker.multiple = true;
    picker.onchange = async () => {
      try {
        if (picker.files?.length) {
          await api.uploadServiceAttachments(jobId, picker.files, "Additional service damage photos");
          setMessage("More damage photos added.");
          load();
        }
      } catch (e) {
        setMessage(String(e.message || e));
      }
    };
    picker.click();
  }

  const filteredJobs = useMemo(() => {
    let data = jobs;
    if (svcStatusFilter) data = data.filter((j) => j.status === svcStatusFilter);
    if (svcSearch) {
      const q = svcSearch.toLowerCase();
      data = data.filter((j) =>
        (j.job_number || "").toLowerCase().includes(q) ||
        (j.inventory_name || "").toLowerCase().includes(q) ||
        (j.asset_code || "").toLowerCase().includes(q) ||
        (j.vendor_name || "").toLowerCase().includes(q) ||
        (j.transport_mode || "").toLowerCase().includes(q) ||
        (j.courier_partner || "").toLowerCase().includes(q) ||
        (j.awb_number || "").toLowerCase().includes(q) ||
        (j.contact_person_name || "").toLowerCase().includes(q) ||
        (j.contact_person_mobile || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [jobs, svcSearch, svcStatusFilter]);

  const svcPg = usePagination(filteredJobs, 10);
  const photoPreviewNames = useMemo(() => photoFiles.map((file) => file.name), [photoFiles]);

  return (
    <div className="page">
      <h1 className="pageTitle">Service Jobs</h1>
      {message ? <div className="messageBar">{message} <button className="dismissBtn" onClick={() => setMessage("")}>Dismiss</button></div> : null}

      <div className="grid2">
        <Card title="Create Service Job">
          <form className="formGrid" onSubmit={save}>
            <div className="full serviceSectionTitle">1. Basic Service Entry</div>
            <div className="full helperText serviceGuide">First choose inhouse or vendor service. Vendor dispatch fields appear only for vendor service.</div>
            <select className="full" value={form.service_scope} onChange={(e) => setForm({ ...form, service_scope: e.target.value })}>
              <option value="inhouse">Inhouse Service</option>
              <option value="vendor">Vendor / External Service</option>
            </select>
            <input placeholder="Job Number (optional auto)" value={form.job_number} onChange={(e) => setForm({ ...form, job_number: e.target.value })} />
            <select value={form.inventory_item_id} onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })} required>
              <option value="">Select Inventory</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.asset_code} - {i.name}</option>)}
            </select>
            {form.service_scope === "vendor" ? <>
            <select value={form.vendor_id} onChange={(e) => {
              const vid = e.target.value;
              const vendorObj = vendors.find((v) => String(v.id) === vid);
              setForm({
                ...form,
                vendor_id: vid,
                vendor_name: vendorObj ? vendorObj.name : form.vendor_name,
                contact_person_mobile: form.contact_person_mobile || vendorObj?.phone || "",
                delivery_address: form.delivery_address || [vendorObj?.address, vendorObj?.city].filter(Boolean).join(", "),
              });
            }}>
              <option value="">Select Vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_code} - {v.name}</option>)}
            </select>
            <AutocompleteInput value={form.vendor_name} onChange={(v) => setForm({ ...form, vendor_name: v })} suggestions={vendors.map((v) => v.name)} placeholder="Vendor Name" required={form.service_scope === "vendor"} />
            </> : <input value="E365 Inhouse Service" disabled />}
            <input type="date" value={form.sent_date} onChange={(e) => setForm({ ...form, sent_date: e.target.value })} required />
            <input type="date" value={form.expected_return_date} onChange={(e) => setForm({ ...form, expected_return_date: e.target.value })} />

            {form.service_scope === "vendor" ? <>
            <div className="full serviceSectionTitle">2. Dispatch / Transport Details</div>
            <div className="full helperText serviceGuide">Fill this like a courier desk entry. Example: mode = Courier, partner = Blue Dart, tracking number = 7839201.</div>
            <select value={form.transport_mode} onChange={(e) => setForm({ ...form, transport_mode: e.target.value })}>
              <option value="courier">Courier</option>
              <option value="hand_delivery">Hand Delivery</option>
              <option value="pickup_by_vendor">Pickup by Vendor</option>
              <option value="company_vehicle">Company Vehicle</option>
              <option value="other">Other</option>
            </select>
            <input placeholder="Courier / Logistics Partner" value={form.courier_partner} onChange={(e) => setForm({ ...form, courier_partner: e.target.value })} />
            <input placeholder="AWB / Docket / Tracking Number" value={form.awb_number} onChange={(e) => setForm({ ...form, awb_number: e.target.value })} />
            <input placeholder="Primary Contact Name" value={form.contact_person_name} onChange={(e) => setForm({ ...form, contact_person_name: e.target.value })} />
            <input placeholder="Primary Contact Mobile" value={form.contact_person_mobile} onChange={(e) => setForm({ ...form, contact_person_mobile: e.target.value })} />
            <input placeholder="Alternate Contact Name" value={form.alternate_contact_name} onChange={(e) => setForm({ ...form, alternate_contact_name: e.target.value })} />
            <input placeholder="Alternate Contact Mobile" value={form.alternate_contact_mobile} onChange={(e) => setForm({ ...form, alternate_contact_mobile: e.target.value })} />
            <input placeholder="Contact Email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            <textarea className="full" placeholder="Pickup Address / From Address" value={form.pickup_address} onChange={(e) => setForm({ ...form, pickup_address: e.target.value })}></textarea>
            <textarea className="full" placeholder="Delivery Address / Service Centre Address" value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}></textarea>
            <input type="number" min="1" placeholder="Package Count" value={form.package_count} onChange={(e) => setForm({ ...form, package_count: e.target.value })} />
            <input type="number" min="0" step="0.01" placeholder="Declared Value (optional)" value={form.declared_value} onChange={(e) => setForm({ ...form, declared_value: e.target.value })} />
            <textarea className="full" placeholder="Package Notes / Contents / Insurance Remarks" value={form.package_notes} onChange={(e) => setForm({ ...form, package_notes: e.target.value })}></textarea>
            </> : <>
            <div className="full serviceSectionTitle">2. Inhouse Details</div>
            <textarea className="full" placeholder="Internal service desk / technician notes" value={form.package_notes} onChange={(e) => setForm({ ...form, package_notes: e.target.value })}></textarea>
            </>}

            <div className="full serviceSectionTitle">3. Damage Photos</div>
            <div className="full helperText serviceGuide">Attach one or more photos so the workshop clearly sees the issue. Example: crack on body, bent pin, broken handle, scratched screen.</div>
            <label className="full uploadDropZone">
              <span>Choose damage photos</span>
              <input type="file" accept="image/*" multiple onChange={(e) => setPhotoFiles(Array.from(e.target.files || []))} />
            </label>
            <input className="full" placeholder="What do these photos show? Example: Front crack, loose HDMI port, dent on left side" value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} />
            <div className="full servicePhotoNameList">
              {photoPreviewNames.length ? photoPreviewNames.map((name) => <span key={name} className="badge">{name}</span>) : <span className="helperText">No damage photo selected yet.</span>}
            </div>

            <div className="full serviceSectionTitle">4. Problem / Internal Notes</div>
            <div className="full helperText serviceGuide">Write the fault in simple words. Example: “Camera not powering on”, “Audio crackling on output”, “Tripod leg lock broken”.</div>
            <textarea className="full" placeholder="Problem Reported" value={form.problem_reported} onChange={(e) => setForm({ ...form, problem_reported: e.target.value })}></textarea>
            <textarea className="full" placeholder="Internal Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })}></textarea>
            <button className="full primaryBtn" type="submit" disabled={saving}>{saving ? "Saving..." : "Create Service Job"}</button>
          </form>
        </Card>

        <Card title="Business Rules & User Guidance">
          <ul className="alertList">
            <li>Pick the exact equipment first so the service record does not get attached to the wrong item.</li>
            <li>Enter the vendor or service centre name exactly as your team knows it. This will show in PDFs and tracking sheets.</li>
            <li>If it is going by courier, fill the courier partner and tracking number so anyone can trace the package later.</li>
            <li>Use primary and backup contacts when the service centre has more than one person handling the job.</li>
            <li>Package count means how many boxes, bags, or cartons are being sent. Example: 2 cartons and 1 hard case = 3 packages.</li>
            <li>Declared value is useful for courier insurance or handover acknowledgement, especially for high-value equipment.</li>
            <li>Damage photos should show the actual issue clearly. Add close-up and full-item photos when possible.</li>
            <li>Completion brings the item back to available status. "Forever Damaged" permanently deactivates the item from inventory.</li>
          </ul>
        </Card>
      </div>

      <Card title="Service Jobs / Full View">
        <div className="auditSubFilters" style={{ marginBottom: 10 }}>
          <SearchBar value={svcSearch} onChange={(value) => { setSvcSearch(value); svcPg.setPage(1); }} suggestions={buildSuggestions(jobs)} placeholder="Search by job number, equipment, vendor, transport, tracking number, contact..." />
          <select value={svcStatusFilter} onChange={(e) => { setSvcStatusFilter(e.target.value); svcPg.setPage(1); }}>
            <option value="">All statuses</option>
            <option value="in_service">In Service</option>
            <option value="completed">Completed</option>
            <option value="forever_damaged">Forever Damaged</option>
          </select>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{filteredJobs.length} jobs</span>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Job</th><th>Inventory</th><th>Vendor</th><th>Dispatch / Contact Details</th><th>Damage Photos</th><th>Status</th><th>PDF</th><th>Action</th></tr></thead>
            <tbody>
              {svcPg.pageData.map((j) => (
                <tr key={j.id}>
                  <td>{j.job_number}</td>
                  <td>{j.inventory_name || j.inventory_item_id}</td>
                  <td>{j.vendor_name}</td>
                  <td style={{ maxWidth: 360, whiteSpace: "normal" }}>
                    <ul className="auditDetailList compactAuditList">
                      {businessSummary(j).map((line, idx) => <li key={`${j.id}-${idx}`}>{line}</li>)}
                      {!businessSummary(j).length && <li>-</li>}
                    </ul>
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    <div className="serviceAttachmentGrid">
                      {(j.attachments || []).slice(0, 4).map((att) => <AttachmentThumb key={att.id} attachment={att} />)}
                    </div>
                    {(j.attachments || []).length > 0 ? <div className="serviceAttachmentActions">{j.attachments.map((att) => <button key={`remove-${att.id}`} type="button" className="ghostBtn compactBtn" onClick={() => removeAttachment(att.id)}>Remove {att.file_name}</button>)}</div> : <span className="helperText">No photos</span>}
                    <div className="serviceAttachmentActions"><button type="button" className="ghostBtn compactBtn" onClick={() => addMorePhotos(j.id)}>Add more photos</button></div>
                  </td>
                  <td><span className={`statusBadge status-${j.status === "in_service" ? "dispatched" : j.status === "completed" ? "returned" : j.status === "forever_damaged" ? "inactive" : "cancelled"}`}>{j.status === "forever_damaged" ? "Forever Damaged" : j.status}</span></td>
                  <td className="pdfCell">
                    <div className="servicePdfActions">
                      <button type="button" className="downloadBtn compactBtn" onClick={() => doServicePdfView(j.id, j.job_number)}>View PDF</button>
                      <button type="button" className="downloadBtn compactBtn" onClick={() => doServicePdfDownload(j.id, j.job_number)}>Download</button>
                      <button type="button" className="downloadBtn compactBtn" onClick={() => doDeclarationPdfDownload(j.id, j.job_number)}>Declaration</button>
                      <button type="button" className="downloadBtn compactBtn" onClick={() => doAddressLabelPdfDownload(j.id, j.job_number)}>Address Label</button>
                    </div>
                  </td>
                  <td className="actionCell">
                    {j.status === "in_service" && <div className="serviceActionGroup">
                      <button className="primaryBtn compactBtn" onClick={() => { setActionNotes(""); setActionDialog({ type: "complete", jobId: j.id, jobNumber: j.job_number, actionAt: new Date() }); }}>Complete</button>
                      <button className="dangerBtn compactBtn" onClick={() => { setActionNotes(""); setActionDialog({ type: "forever_damaged", jobId: j.id, jobNumber: j.job_number, actionAt: new Date() }); }}>Forever Damaged</button>
                    </div>}
                    {j.status !== "in_service" && <span className="helperText">Done</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={svcPg.total} page={svcPg.page} pageSize={svcPg.pageSize} onPageChange={svcPg.setPage} onPageSizeChange={svcPg.setPageSize} />
      </Card>

      {actionDialog && (
        <div className="modalOverlay" onClick={() => setActionDialog(null)}>
          <div className="modalCard" style={{ width: "min(480px,95vw)" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>
              {actionDialog.type === "complete" ? "Complete Service Job" : "Mark as Forever Damaged"}
            </h3>
            <p className="helperText">Job: <strong>{actionDialog.jobNumber}</strong></p>
            {actionDialog.type === "forever_damaged" && (
              <p className="helperText" style={{ color: "#f87171" }}>This will permanently deactivate the inventory item.</p>
            )}
            <div style={{ marginTop: 12 }}>
              <label className="fieldLabel">Date / Time</label>
              <input value={(actionDialog.actionAt || new Date()).toLocaleString()} readOnly disabled style={{ width: "100%", marginTop: 6 }} />
              <label className="fieldLabel">Notes (optional)</label>
              <textarea
                className="full"
                placeholder={actionDialog.type === "complete" ? "What was done? Any parts replaced?" : "Reason for permanent damage?"}
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                rows={3}
                style={{ marginTop: 6 }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className={actionDialog.type === "complete" ? "primaryBtn" : "dangerBtn"} onClick={confirmAction}>
                {actionDialog.type === "complete" ? "Confirm Complete" : "Confirm Forever Damaged"}
              </button>
              <button className="ghostBtn" onClick={() => setActionDialog(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
