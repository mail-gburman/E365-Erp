import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import AutocompleteInput from "../components/AutocompleteInput";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { api } from "../api";
import { getBookingType } from "../auth";
import { getBookingProfile } from "../bookingProfiles";

const blank = { po_number:"", item_name:"", item_type:"equipment", quantity:1, vendor_id:"", status:"requested", expected_date:"", notes:"" };

export default function VendorsPage() {
  const bookingProfile = getBookingProfile(getBookingType());
  const [vendors, setVendors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  const [orderSearch, setOrderSearch] = useState("");

  const searchableOrders = useMemo(() => orders.map(order => ({ ...order, vendor_name: (vendors.find(v => v.id === order.vendor_id) || {}).name || "" })), [orders, vendors]);
  const filteredOrders = useSearch(searchableOrders, orderSearch);
  const pgOrders = usePagination(filteredOrders, 10);
  const load = () => {
    api.vendors().then(setVendors);
    api.procurement().then(setOrders);
  };
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    try {
      await api.createProcurement({ ...form, vendor_id: form.vendor_id ? Number(form.vendor_id) : null, quantity: Number(form.quantity), expected_date: form.expected_date || null });
      setForm(blank);
      setMessage("Procurement order added.");
      load();
    } catch (e) { setMessage(String(e.message || e)); }
  }

  return (
    <div className="page">
      <h1 className="pageTitle">Vendors / Third-Party Procurement</h1>
      {message ? <div className="messageBar">{message} <button className="dismissBtn" onClick={()=>setMessage("")}>Dismiss</button></div> : null}
      <div className="grid2">
        <Card title="Create Procurement / Third-Party Request">
          <form className="formGrid" onSubmit={save}>
            <input placeholder="PO Number (optional - auto generated)" value={form.po_number} onChange={e=>setForm({...form, po_number:e.target.value})} />
            <AutocompleteInput value={form.item_name} onChange={v=>setForm({...form, item_name:v})} suggestions={[...new Set(orders.map(o=>o.item_name).filter(Boolean))]} placeholder="Item Name" required />
            <select value={form.item_type} onChange={e=>setForm({...form, item_type:e.target.value})}>
              {bookingProfile.itemTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              <option value="manpower">Manpower / Service Team</option>
            </select>
            <input type="number" placeholder="Quantity" value={form.quantity} onChange={e=>setForm({...form, quantity:e.target.value})} />
            <select value={form.vendor_id} onChange={e=>setForm({...form, vendor_id:e.target.value})}>
              <option value="">Vendor</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select value={form.status} onChange={e=>setForm({...form, status:e.target.value})}><option>requested</option><option>ordered</option><option>received</option><option>cancelled</option></select>
            <input type="date" value={form.expected_date} onChange={e=>setForm({...form, expected_date:e.target.value})} />
            <textarea className="full" placeholder="Notes" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})}></textarea>
            <button className="full primaryBtn" type="submit">Save Procurement</button>
          </form>
        </Card>
        <Card title="Third-Party Logic">
          <ul className="alertList">
            <li>Third-party {bookingProfile.resourceLabel.toLowerCase()} can be added in registry with owner type = third_party.</li>
            <li>External or contractual manpower can be mapped to a vendor.</li>
            <li>This company type uses {bookingProfile.thirdPartyLabel} as its external resource concept.</li>
            <li>Procurement status gives requested / ordered / received / cancelled flow.</li>
          </ul>
        </Card>
      </div>

      <Card title="Procurement Register">
        <div className="listToolbar">
          <SearchBar value={orderSearch} onChange={value => { setOrderSearch(value); pgOrders.setPage(1); }} suggestions={buildSuggestions(searchableOrders)} placeholder="Search PO, item, type, vendor, status..." />
          <span className="helperText">{filteredOrders.length} order(s)</span>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>PO</th><th>Item</th><th>Type</th><th>Qty</th><th>Vendor</th><th>Status</th></tr></thead>
            <tbody>
              {pgOrders.pageData.map(o => (
                <tr key={o.id}>
                  <td>{o.po_number}</td>
                  <td>{o.item_name}</td>
                  <td>{o.item_type}</td>
                  <td>{o.quantity}</td>
                  <td>{o.vendor_name || "-"}</td>
                  <td><span className={`statusBadge status-${o.status === "received" ? "returned" : o.status === "cancelled" ? "cancelled" : o.status === "ordered" ? "dispatched" : "blocked"}`}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={pgOrders.total} page={pgOrders.page} pageSize={pgOrders.pageSize} onPageChange={pgOrders.setPage} onPageSizeChange={pgOrders.setPageSize} />
      </Card>
    </div>
  );
}
