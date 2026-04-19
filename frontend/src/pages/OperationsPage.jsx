import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import AutocompleteInput from "../components/AutocompleteInput";
import LocationAutocomplete from "../components/LocationAutocomplete";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { api, downloadAuthorized } from "../api";

const blankPaper = { paper_number:"", paper_type:"Shoot Dispatch", reference_name:"", destination:"", issued_by:"Store Admin", issue_status:"draft", related_booking_id:"", related_service_job_id:"", remarks:"" };
const blankQc = { booking_id:"", checked_by:"Store QC", all_items_returned:true, damage_found:false, cleaning_required:false, remarks:"" };
const blankPartial = { booking_id:"", inventory_item_ids:[], returned_by:"Store Team", condition_status:"good", notes:"" };

function summarizeEquipment(items = []) {
  const baseName = (value = "") => value.replace(/\s+#\d+\s*$/, "").trim();
  const grouped = items.reduce((acc, item) => {
    const key = baseName(item.name || item.asset_code || "Equipment");
    acc[key] = (acc[key] || 0) + (item.quantity || 1);
    return acc;
  }, {});
  return Object.entries(grouped).map(([name, count]) => `${name} x${count}`).join(", ");
}

export default function OperationsPage() {
  const [papers, setPapers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [bookingDetails, setBookingDetails] = useState([]);
  const [services, setServices] = useState([]);
  const [qcList, setQcList] = useState([]);
  const [gatePasses, setGatePasses] = useState([]);
  const [gatePassDetails, setGatePassDetails] = useState([]);
  const [partialReturns, setPartialReturns] = useState([]);
  const [custody, setCustody] = useState([]);
  const [paperForm, setPaperForm] = useState(blankPaper);
  const [qcForm, setQcForm] = useState(blankQc);
  const [partialForm, setPartialForm] = useState(blankPartial);
  const [message, setMessage] = useState("");
  const [qcSearch, setQcSearch] = useState("");
  const [partialSearch, setPartialSearch] = useState("");
  const [gateSearch, setGateSearch] = useState("");
  const [custodySearch, setCustodySearch] = useState("");
  const [paperSearch, setPaperSearch] = useState("");

  const load = () => {
    api.papers().then(setPapers);
    api.bookings().then(setBookings);
    api.bookingDetails().then(setBookingDetails);
    api.serviceJobs().then(setServices);
    api.qcList().then(setQcList);
    api.gatePasses().then(setGatePasses);
    api.gatePassDetails().then(setGatePassDetails);
    api.partialReturns().then(setPartialReturns);
    api.custody().then(setCustody);
  };
  useEffect(() => { load(); }, []);

  function toggleItem(id) {
    setPartialForm(f => ({
      ...f,
      inventory_item_ids: f.inventory_item_ids.includes(id) ? f.inventory_item_ids.filter(x => x !== id) : [...f.inventory_item_ids, id]
    }));
  }

  async function doGatePassDownload(id, gatePassNo) {
    try { await downloadAuthorized(api.gatePassPdfUrl(id), `gatepass_${gatePassNo || id}.pdf`); } catch(e){ setMessage(String(e.message||e)); }
  }
  async function doPaperDownload(id, paperNo) {
    try { await downloadAuthorized(api.paperPdfUrl(id), `paper_${paperNo || id}.pdf`); } catch(e){ setMessage(String(e.message||e)); }
  }

  async function savePaper(e) {
    e.preventDefault();
    try {
      await api.createPaper({
        ...paperForm,
        related_booking_id: paperForm.related_booking_id ? Number(paperForm.related_booking_id) : null,
        related_service_job_id: paperForm.related_service_job_id ? Number(paperForm.related_service_job_id) : null,
      });
      setPaperForm(blankPaper);
      setMessage("Paper created.");
      load();
    } catch (e) { setMessage(String(e.message || e)); }
  }

  async function saveQc(e) {
    e.preventDefault();
    try {
      await api.createQC({ ...qcForm, booking_id: Number(qcForm.booking_id) });
      setQcForm(blankQc);
      setMessage("Return QC saved and visible below immediately.");
      load();
    } catch (e) { setMessage(String(e.message || e)); }
  }

  async function savePartial(e) {
    e.preventDefault();
    try {
      await api.createPartialReturn({ ...partialForm, booking_id: Number(partialForm.booking_id) });
      setPartialForm(blankPartial);
      setMessage("Partial return recorded.");
      load();
    } catch (e) { setMessage(String(e.message || e)); }
  }

  const filteredPapers = useSearch(papers, paperSearch);
  const filteredQc = useSearch(qcList, qcSearch);
  const filteredPartial = useSearch(partialReturns, partialSearch);
  const filteredGate = useSearch(gatePassDetails, gateSearch);
  const filteredCustody = useSearch(custody, custodySearch);
  const pgPapers = usePagination(filteredPapers, 10);
  const pgQc = usePagination(filteredQc, 10);
  const pgPartial = usePagination(filteredPartial, 10);
  const pgGate = usePagination(filteredGate, 10);
  const pgCustody = usePagination(filteredCustody, 10);
  const selectedBooking = bookingDetails.find(b => String(b.id) === String(partialForm.booking_id));

  return (
    <div className="page">
      <h1 className="pageTitle">Papers / Return QC / Gate Passes / Chain of Custody</h1>
      {message ? <div className="messageBar">{message} <button className="dismissBtn" onClick={()=>setMessage("")}>Dismiss</button></div> : null}

      <div className="grid2">
        <Card title="Create Branded Paper">
          <form className="formGrid" onSubmit={savePaper}>
            <input placeholder="Paper Number (optional auto)" value={paperForm.paper_number} onChange={e=>setPaperForm({...paperForm, paper_number:e.target.value})} />
            <select value={paperForm.paper_type} onChange={e=>setPaperForm({...paperForm, paper_type:e.target.value})}><option>Shoot Dispatch</option><option>Service Outbound</option><option>Equipment Gate Pass</option><option>Crew Movement</option><option>Return Acknowledgement</option></select>
            <AutocompleteInput value={paperForm.reference_name} onChange={v=>setPaperForm({...paperForm, reference_name:v})} suggestions={[...new Set(papers.map(p=>p.reference_name).filter(Boolean))]} placeholder="Reference Name" required />
            <LocationAutocomplete value={paperForm.destination} onChange={v=>setPaperForm({...paperForm, destination:v})} extraSuggestions={[...new Set([...papers.map(p=>p.destination), ...bookingDetails.map(b=>b.destination)].filter(Boolean))]} placeholder="Search Indian location..." required />
            <input placeholder="Issued By" value={paperForm.issued_by} onChange={e=>setPaperForm({...paperForm, issued_by:e.target.value})} />
            <select value={paperForm.issue_status} onChange={e=>setPaperForm({...paperForm, issue_status:e.target.value})}><option>draft</option><option>ready</option><option>approved</option></select>
            <select value={paperForm.related_booking_id} onChange={e=>setPaperForm({...paperForm, related_booking_id:e.target.value})}>
              <option value="">Related Booking</option>
              {bookings.map(b => <option key={b.id} value={b.id}>Booking #{b.id}</option>)}
            </select>
            <select value={paperForm.related_service_job_id} onChange={e=>setPaperForm({...paperForm, related_service_job_id:e.target.value})}>
              <option value="">Related Service Job</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.job_number}</option>)}
            </select>
            <textarea className="full" placeholder="Remarks" value={paperForm.remarks} onChange={e=>setPaperForm({...paperForm, remarks:e.target.value})}></textarea>
            <button className="full primaryBtn" type="submit">Save Paper</button>
          </form>
        </Card>

        <Card title="Return QC Checklist">
          <form className="formGrid" onSubmit={saveQc}>
            <select value={qcForm.booking_id} onChange={e=>setQcForm({...qcForm, booking_id:Number(e.target.value)})}>
              <option value="">Select Booking</option>
              {bookings.map(b => <option key={b.id} value={b.id}>Booking #{b.id}</option>)}
            </select>
            <input placeholder="Checked By" value={qcForm.checked_by} onChange={e=>setQcForm({...qcForm, checked_by:e.target.value})} required />
            <label className="checkCard"><input type="checkbox" checked={qcForm.all_items_returned} onChange={e=>setQcForm({...qcForm, all_items_returned:e.target.checked})} /><span>All items returned</span></label>
            <label className="checkCard"><input type="checkbox" checked={qcForm.damage_found} onChange={e=>setQcForm({...qcForm, damage_found:e.target.checked})} /><span>Damage found</span></label>
            <label className="checkCard"><input type="checkbox" checked={qcForm.cleaning_required} onChange={e=>setQcForm({...qcForm, cleaning_required:e.target.checked})} /><span>Cleaning required</span></label>
            <textarea className="full" placeholder="Remarks" value={qcForm.remarks} onChange={e=>setQcForm({...qcForm, remarks:e.target.value})}></textarea>
            <button className="full primaryBtn" type="submit">Save QC</button>
          </form>
        </Card>
      </div>

      <div className="grid2">
        <Card title="Partial Return">
          <form onSubmit={savePartial}>
            <div className="formGrid">
              <select value={partialForm.booking_id} onChange={e=>setPartialForm({...partialForm, booking_id:e.target.value, inventory_item_ids:[]})}>
                <option value="">Select Booking</option>
                {bookingDetails.map(b => <option key={b.id} value={b.id}>Booking #{b.id} - {b.project_title}</option>)}
              </select>
              <input placeholder="Returned By" value={partialForm.returned_by} onChange={e=>setPartialForm({...partialForm, returned_by:e.target.value})} />
              <select value={partialForm.condition_status} onChange={e=>setPartialForm({...partialForm, condition_status:e.target.value})}>
                <option>good</option><option>damaged</option><option>missing</option><option>incomplete</option>
              </select>
              <textarea className="full" placeholder="Notes" value={partialForm.notes} onChange={e=>setPartialForm({...partialForm, notes:e.target.value})}></textarea>
            </div>
            {selectedBooking ? (
              <div className="selectorBlock">
                <strong>Select returned items</strong>
                <div className="checkGrid">
                  {selectedBooking.equipment.map(i => (
                    <label key={i.id} className="checkCard">
                      <input type="checkbox" checked={partialForm.inventory_item_ids.includes(i.id)} onChange={()=>toggleItem(i.id)} />
                      <span>{i.asset_code} · {i.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <button className="primaryBtn" type="submit">Save Partial Return</button>
          </form>
        </Card>

        <Card title="Saved QC Entries">
          <div className="listToolbar">
            <SearchBar value={qcSearch} onChange={value => { setQcSearch(value); pgQc.setPage(1); }} suggestions={buildSuggestions(qcList)} placeholder="Search QC by booking, checker, damage, remarks..." />
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Booking</th><th>Checked By</th><th>Returned</th><th>Damage</th><th>Cleaning</th></tr></thead>
              <tbody>
                {pgQc.pageData.map(q => (
                  <tr key={q.id}>
                    <td>{q.booking_id}</td>
                    <td>{q.checked_by}</td>
                    <td>{q.all_items_returned ? "Yes" : "No"}</td>
                    <td>{q.damage_found ? "Yes" : "No"}</td>
                    <td>{q.cleaning_required ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={pgQc.total} page={pgQc.page} pageSize={pgQc.pageSize} onPageChange={pgQc.setPage} onPageSizeChange={pgQc.setPageSize} />
        </Card>
      </div>

      <div className="grid2">
        <Card title="Partial Returns List">
          <div className="listToolbar">
            <SearchBar value={partialSearch} onChange={value => { setPartialSearch(value); pgPartial.setPage(1); }} suggestions={buildSuggestions(partialReturns)} placeholder="Search partial returns by booking, item, returned by, condition..." />
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Booking</th><th>Item</th><th>Returned By</th><th>Condition</th></tr></thead>
              <tbody>
                {pgPartial.pageData.map(r => (
                  <tr key={r.id}>
                    <td>{r.booking_id}</td>
                    <td>{r.inventory_item_id}</td>
                    <td>{r.returned_by}</td>
                    <td>{r.condition_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={pgPartial.total} page={pgPartial.page} pageSize={pgPartial.pageSize} onPageChange={pgPartial.setPage} onPageSizeChange={pgPartial.setPageSize} />
        </Card>

        <Card title="Gate Passes">
          <div className="listToolbar">
            <SearchBar value={gateSearch} onChange={value => { setGateSearch(value); pgGate.setPage(1); }} suggestions={buildSuggestions(gatePassDetails)} placeholder="Search gate pass by number, booking, project, destination, type..." />
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Gate Pass</th><th>Booking</th><th>Type</th><th>Approved By</th><th>Status</th><th>Download</th></tr></thead>
              <tbody>
                {pgGate.pageData.map(g => (
                  <tr key={g.id}>
                    <td>{g.gate_pass_number}</td>
                    <td>{g.booking_id}</td>
                    <td>{g.pass_type}</td>
                    <td>{g.approved_by}</td>
                    <td>{g.status}</td>
                    <td className="pdfCell"><button type="button" className="downloadBtn compactBtn" onClick={()=>doGatePassDownload(g.id, g.gate_pass_number)}>Gate Pass PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={pgGate.total} page={pgGate.page} pageSize={pgGate.pageSize} onPageChange={pgGate.setPage} onPageSizeChange={pgGate.setPageSize} />
        </Card>
      </div>

      <Card title="Detailed Gate Pass View">
        <div className="listToolbar">
          <SearchBar value={gateSearch} onChange={value => { setGateSearch(value); pgGate.setPage(1); }} suggestions={buildSuggestions(gatePassDetails)} placeholder="Search detailed gate passes by project, destination, equipment, manpower..." />
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Gate Pass</th><th>Project</th><th>Destination</th><th>Equipment</th><th>Manpower</th><th>Type</th><th>Download</th></tr></thead>
            <tbody>
              {pgGate.pageData.map(g => (
                <tr key={g.id}>
                  <td>{g.gate_pass_number}</td>
                  <td>{g.project_title || "-"}</td>
                  <td>{g.destination || "-"}</td>
                  <td>{summarizeEquipment(g.equipment_summary || g.equipment) || "-"}</td>
                  <td>{(g.manpower || []).map(x => x.name).join(", ") || "-"}</td>
                  <td>{g.pass_type}</td>
                  <td className="pdfCell"><button type="button" className="downloadBtn compactBtn" onClick={()=>doGatePassDownload(g.id, g.gate_pass_number)}>Gate Pass PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={pgGate.total} page={pgGate.page} pageSize={pgGate.pageSize} onPageChange={pgGate.setPage} onPageSizeChange={pgGate.setPageSize} />
      </Card>

      <Card title="Chain of Custody Log">
        <div className="listToolbar">
          <SearchBar value={custodySearch} onChange={value => { setCustodySearch(value); pgCustody.setPage(1); }} suggestions={buildSuggestions(custody)} placeholder="Search custody by booking, item, crew, event, person, location..." />
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>ID</th><th>Booking</th><th>Item</th><th>Crew</th><th>Event</th><th>From</th><th>To</th><th>Location</th></tr></thead>
            <tbody>
              {pgCustody.pageData.map(c => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.booking_id || "-"}</td>
                  <td>{c.inventory_item_id || "-"}</td>
                  <td>{c.crew_member_id || "-"}</td>
                  <td>{c.event_type}</td>
                  <td>{c.from_person || "-"}</td>
                  <td>{c.to_person || "-"}</td>
                  <td>{c.location || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={pgCustody.total} page={pgCustody.page} pageSize={pgCustody.pageSize} onPageChange={pgCustody.setPage} onPageSizeChange={pgCustody.setPageSize} />
      </Card>

      <Card title="Downloadable Papers">
        <div className="listToolbar">
          <SearchBar value={paperSearch} onChange={value => { setPaperSearch(value); pgPapers.setPage(1); }} suggestions={buildSuggestions(papers)} placeholder="Search papers by number, type, reference, destination, status..." />
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Number</th><th>Type</th><th>Reference</th><th>Status</th><th>Download</th></tr></thead>
            <tbody>
              {pgPapers.pageData.map(p => (
                <tr key={p.id}>
                  <td>{p.paper_number}</td>
                  <td>{p.paper_type}</td>
                  <td>{p.reference_name}</td>
                  <td>{p.issue_status}</td>
                  <td className="pdfCell"><button type="button" className="downloadBtn compactBtn" onClick={()=>doPaperDownload(p.id, p.paper_number)}>Paper PDF</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={pgPapers.total} page={pgPapers.page} pageSize={pgPapers.pageSize} onPageChange={pgPapers.setPage} onPageSizeChange={pgPapers.setPageSize} />
      </Card>
    </div>
  );
}
