import React, { useEffect, useState, useCallback } from "react";
import { api, downloadAuthorized } from "../api";

const BLANK_ITEM = { description: "", item_type: "equipment", hsn_code: "", qty: 1, unit: "days", rate: 0, sort_order: 0 };
const ITEM_TYPES = ["equipment", "accessory", "crew", "logistics", "other"];
const STATUS_COLORS = { draft: "#888", sent: "#2a7dd1", accepted: "#27ae60", rejected: "#e74c3c", expired: "#b7860b", converted: "#6c3483" };
const VALID_TRANSITIONS = { draft: ["sent"], sent: ["accepted", "rejected", "expired"], accepted: ["rejected"], rejected: ["draft"], expired: ["draft"] };

function calcTotals(items, discPct, taxPct) {
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.rate) || 0), 0);
  const discount = subtotal * (discPct / 100);
  const afterDisc = subtotal - discount;
  const tax = afterDisc * (taxPct / 100);
  return { subtotal, discount, tax, total: afterDisc + tax };
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterClient, setFilterClient] = useState("");

  // form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    client_id: "", project_event_id: "", subject: "",
    valid_until: "", notes: "", terms: "",
    discount_pct: 0, tax_pct: 18, items: [{ ...BLANK_ITEM }],
  });
  const [saving, setSaving] = useState(false);

  // detail panel
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterClient) params.client_id = filterClient;
      const [qs, cs, ps] = await Promise.all([api.listQuotes(params), api.clients(), api.projects()]);
      setQuotes(qs);
      setClients(cs);
      setProjects(ps);
    } catch (e) { alert(String(e.detail || e)); }
    setLoading(false);
  }, [filterStatus, filterClient]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditingId(null);
    setForm({ client_id: "", project_event_id: "", subject: "", valid_until: "", notes: "", terms: "", discount_pct: 0, tax_pct: 18, items: [{ ...BLANK_ITEM }] });
    setShowForm(true);
    setSelected(null);
  }

  function openEdit(q) {
    setEditingId(q.id);
    setForm({
      client_id: String(q.client_id),
      project_event_id: q.project_event_id ? String(q.project_event_id) : "",
      subject: q.subject || "",
      valid_until: q.valid_until || "",
      notes: q.notes || "",
      terms: q.terms || "",
      discount_pct: q.discount_pct,
      tax_pct: q.tax_pct,
      items: q.items.length ? q.items.map(i => ({ ...i })) : [{ ...BLANK_ITEM }],
    });
    setShowForm(true);
    setSelected(null);
  }

  function setItem(idx, field, value) {
    setForm(prev => {
      const items = prev.items.map((it, i) => i === idx ? { ...it, [field]: value } : it);
      return { ...prev, items };
    });
  }

  function addItem() { setForm(prev => ({ ...prev, items: [...prev.items, { ...BLANK_ITEM }] })); }
  function removeItem(idx) { setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) })); }

  async function save() {
    if (!form.client_id) { alert("Select a client"); return; }
    setSaving(true);
    try {
      const payload = {
        client_id: parseInt(form.client_id),
        project_event_id: form.project_event_id ? parseInt(form.project_event_id) : null,
        subject: form.subject || null,
        valid_until: form.valid_until || null,
        notes: form.notes || null,
        terms: form.terms || null,
        discount_pct: parseFloat(form.discount_pct) || 0,
        tax_pct: parseFloat(form.tax_pct) || 18,
        items: form.items.map((it, i) => ({
          ...it, sort_order: i,
          qty: parseFloat(it.qty) || 0,
          rate: parseFloat(it.rate) || 0,
        })),
      };
      if (editingId) { await api.updateQuote(editingId, payload); }
      else { await api.createQuote(payload); }
      setShowForm(false);
      await load();
    } catch (e) { alert(String(e.detail || e)); }
    setSaving(false);
  }

  async function changeStatus(q, status) {
    if (!confirm(`Mark quote ${q.quote_number} as "${status}"?`)) return;
    try { await api.setQuoteStatus(q.id, status); await load(); setSelected(null); }
    catch (e) { alert(String(e.detail || e)); }
  }

  async function convertQuote(q) {
    if (!confirm(`Mark ${q.quote_number} as Converted? Create the booking from the Booking page.`)) return;
    try { await api.convertQuote(q.id); await load(); setSelected(null); }
    catch (e) { alert(String(e.detail || e)); }
  }

  async function deleteQuote(q) {
    if (!confirm(`Delete quote ${q.quote_number}? This cannot be undone.`)) return;
    try { await api.deleteQuote(q.id); await load(); setSelected(null); }
    catch (e) { alert(String(e.detail || e)); }
  }

  async function downloadPdf(q) {
    try { await downloadAuthorized(api.quotePdfUrl(q.id), `${q.quote_number}_v${q.version}.pdf`); }
    catch (e) { alert(String(e.detail || e)); }
  }

  const { subtotal, discount, tax, total } = calcTotals(form.items, form.discount_pct, form.tax_pct);

  if (loading) return <div className="pageCard"><p>Loading quotations...</p></div>;

  return (
    <div style={{ padding: "0 0 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 140 }}>
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ width: 200 }}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="primaryBtn" onClick={openNew} style={{ marginLeft: "auto" }}>+ New Quotation</button>
      </div>

      {/* Quote list */}
      <div className="tableWrap">
        <table className="dataTable">
          <thead>
            <tr>
              <th>Quote No.</th><th>Client</th><th>Subject</th><th>Version</th>
              <th>Valid Until</th><th>Total</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "#888" }}>No quotations found</td></tr>}
            {quotes.map(q => (
              <tr key={q.id} style={{ cursor: "pointer" }} onClick={() => setSelected(q)}>
                <td><strong>{q.quote_number}</strong></td>
                <td>{q.client_name}</td>
                <td>{q.subject || <span style={{ color: "#aaa" }}>—</span>}</td>
                <td>v{q.version}</td>
                <td>{q.valid_until || "—"}</td>
                <td>₹{Number(q.total).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                <td><span style={{ background: STATUS_COLORS[q.status] || "#888", color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>{q.status}</span></td>
                <td onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button className="ghostBtn" style={{ fontSize: 12 }} onClick={() => downloadPdf(q)}>PDF</button>
                  {q.status !== "converted" && <button className="ghostBtn" style={{ fontSize: 12 }} onClick={() => openEdit(q)}>Edit</button>}
                  {q.status !== "converted" && <button className="ghostBtn dangerText" style={{ fontSize: 12 }} onClick={() => deleteQuote(q)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="modalOverlay" onClick={() => setSelected(null)}>
          <div className="modalCard" style={{ maxWidth: 680, width: "96vw" }} onClick={e => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>{selected.quote_number} — v{selected.version}</h2>
              <button className="ghostBtn modalCloseBtn" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", marginBottom: 12 }}>
              <div><strong>Client:</strong> {selected.client_name}</div>
              <div><strong>Project:</strong> {selected.project_title || "—"}</div>
              <div><strong>Subject:</strong> {selected.subject || "—"}</div>
              <div><strong>Valid Until:</strong> {selected.valid_until || "—"}</div>
              <div><strong>Discount:</strong> {selected.discount_pct}%</div>
              <div><strong>GST:</strong> {selected.tax_pct}%</div>
              <div><strong>Subtotal:</strong> ₹{Number(selected.subtotal).toLocaleString("en-IN")}</div>
              <div><strong>Total:</strong> ₹{Number(selected.total).toLocaleString("en-IN")}</div>
            </div>
            <div className="tableWrap" style={{ marginBottom: 12 }}>
              <table className="dataTable" style={{ fontSize: 13 }}>
                <thead><tr><th>#</th><th>Description</th><th>Type</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr></thead>
                <tbody>
                  {(selected.items || []).map((it, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td><td>{it.description}</td><td>{it.item_type}</td>
                      <td>{it.qty}</td><td>{it.unit}</td>
                      <td>₹{Number(it.rate).toLocaleString("en-IN")}</td>
                      <td>₹{Number(it.amount).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selected.notes && <p style={{ fontSize: 13 }}><strong>Notes:</strong> {selected.notes}</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <button className="primaryBtn" onClick={() => downloadPdf(selected)}>Download PDF</button>
              {(VALID_TRANSITIONS[selected.status] || []).map(s => (
                <button key={s} className="ghostBtn" onClick={() => changeStatus(selected, s)}>Mark {s}</button>
              ))}
              {selected.status === "accepted" && (
                <button className="primaryBtn" style={{ background: "#6c3483" }} onClick={() => convertQuote(selected)}>Convert to Booking</button>
              )}
              {selected.status !== "converted" && (
                <button className="ghostBtn" onClick={() => { setSelected(null); openEdit(selected); }}>Edit</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className="modalOverlay" onClick={() => setShowForm(false)}>
          <div className="modalCard" style={{ maxWidth: 820, width: "96vw", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>{editingId ? "Edit Quotation" : "New Quotation"}</h2>
              <button className="ghostBtn modalCloseBtn" onClick={() => setShowForm(false)}>Close</button>
            </div>

            <div className="formGrid">
              <label className="fieldLabel">Client *</label>
              <select value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
                <option value="">— Select Client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <label className="fieldLabel">Project (optional)</label>
              <select value={form.project_event_id} onChange={e => setForm(p => ({ ...p, project_event_id: e.target.value }))}>
                <option value="">— None —</option>
                {projects.filter(p => !form.client_id || String(p.client_id) === String(form.client_id)).map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>

              <label className="fieldLabel">Subject</label>
              <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="e.g. Equipment Rental for Wedding Film" />

              <label className="fieldLabel">Valid Until</label>
              <input type="date" value={form.valid_until} onChange={e => setForm(p => ({ ...p, valid_until: e.target.value }))} />

              <label className="fieldLabel">Discount %</label>
              <input type="number" min={0} max={100} value={form.discount_pct} onChange={e => setForm(p => ({ ...p, discount_pct: e.target.value }))} />

              <label className="fieldLabel">GST %</label>
              <input type="number" min={0} max={28} value={form.tax_pct} onChange={e => setForm(p => ({ ...p, tax_pct: e.target.value }))} />

              <label className="fieldLabel full">Notes</label>
              <textarea className="full" rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Internal or client-facing notes" />

              <label className="fieldLabel full">Terms & Conditions</label>
              <textarea className="full" rows={3} value={form.terms} onChange={e => setForm(p => ({ ...p, terms: e.target.value }))} placeholder="Payment terms, validity, other conditions" />
            </div>

            {/* Line items */}
            <h3 style={{ marginTop: 18, marginBottom: 8 }}>Line Items</h3>
            <div className="tableWrap">
              <table className="dataTable" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Description</th><th>Type</th><th>HSN</th><th>Qty</th><th>Unit</th><th>Rate (₹)</th><th>Amount</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, idx) => (
                    <tr key={idx}>
                      <td><input value={it.description} onChange={e => setItem(idx, "description", e.target.value)} placeholder="Description" style={{ width: "100%" }} /></td>
                      <td>
                        <select value={it.item_type} onChange={e => setItem(idx, "item_type", e.target.value)}>
                          {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td><input value={it.hsn_code} onChange={e => setItem(idx, "hsn_code", e.target.value)} placeholder="HSN" style={{ width: 70 }} /></td>
                      <td><input type="number" min={0} value={it.qty} onChange={e => setItem(idx, "qty", e.target.value)} style={{ width: 60 }} /></td>
                      <td><input value={it.unit} onChange={e => setItem(idx, "unit", e.target.value)} style={{ width: 60 }} /></td>
                      <td><input type="number" min={0} value={it.rate} onChange={e => setItem(idx, "rate", e.target.value)} style={{ width: 90 }} /></td>
                      <td style={{ textAlign: "right" }}>₹{((parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                      <td><button className="ghostBtn dangerText" style={{ fontSize: 12 }} onClick={() => removeItem(idx)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="ghostBtn" style={{ marginTop: 8 }} onClick={addItem}>+ Add Line</button>

            {/* Totals preview */}
            <div style={{ textAlign: "right", marginTop: 12, lineHeight: 2, fontSize: 14 }}>
              <div>Subtotal: <strong>₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></div>
              {form.discount_pct > 0 && <div>Discount ({form.discount_pct}%): <strong>−₹{discount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></div>}
              <div>GST ({form.tax_pct}%): <strong>₹{tax.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></div>
              <div style={{ fontSize: 16 }}>Total: <strong>₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong></div>
            </div>

            <div className="modalFooter" style={{ marginTop: 16 }}>
              <button className="ghostBtn" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="primaryBtn" onClick={save} disabled={saving}>{saving ? "Saving..." : editingId ? "Update Quote" : "Create Quote"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
