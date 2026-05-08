import React, { useEffect, useState } from "react";
import Card from "../components/Card";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { downloadAuthorized, systemApi } from "../api";
import { getCompanyName, getPermissions, getRole } from "../auth";

const DOCUMENT_PERMISSION_KEYS = {
  vendor: "uploads.vendor_documents_tab",
  client: "uploads.client_documents_tab",
  inventory: "uploads.inventory_documents_tab",
  warehouse: "uploads.warehouse_documents_tab",
  manpower: "uploads.manpower_documents_tab",
  job_card: "uploads.job_card_pdfs",
  challan: "uploads.road_challan_pdfs",
  manpower_pdf: "uploads.manpower_pdfs",
  gate_pass: "uploads.gate_pass_pdfs",
  invoice: "uploads.invoice_pdfs",
  service: "uploads.service_pdfs",
  paper: "uploads.papers_pdfs",
  other: "uploads.uploaded_statutory_documents",
};

const DOCUMENT_FIELD_KEYS = Object.values(DOCUMENT_PERMISSION_KEYS);

export default function SystemPage() {
  const companyName = getCompanyName() || "Company";
  const [health, setHealth] = useState(null);
  const [documentLibrary, setDocumentLibrary] = useState({ tabs: [], documents: [] });
  const [activeDocType, setActiveDocType] = useState("all");
  const [documentSearch, setDocumentSearch] = useState("");
  const [connectorSearch, setConnectorSearch] = useState("");
  const [tallyConnectors, setTallyConnectors] = useState([]);
  const [tallyTest, setTallyTest] = useState(null);
  const [tallySecret, setTallySecret] = useState(null);
  const [tallyDemoStatus, setTallyDemoStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [tallyForm, setTallyForm] = useState({
    connector_name: `${companyName} Office Tally Connector`,
    machine_name: "Office Tally PC",
    tally_host: "127.0.0.1",
    tally_port: 9000,
    company_name: "KALEIDOSCOPE PRODUCTIONS AND SERVICES LLP",
    import_mode: "hybrid",
    odbc_enabled: false,
  });
  const [tallyRuntime, setTallyRuntime] = useState({
    erp_base_url: "http://127.0.0.1:8001",
    connector_token: "",
    tally_host: "127.0.0.1",
    tally_port: 9000,
    tally_company_name: "KALEIDOSCOPE PRODUCTIONS AND SERVICES LLP",
    tally_mode: "hybrid",
    tally_export_folder: "exports",
    poll_seconds: 45,
    timeout_seconds: 20,
    connector_sqlite: "tally_connector.sqlite3",
  });
  const permissions = getPermissions();
  const hasDocumentSpecificPermissions = DOCUMENT_FIELD_KEYS.some(key => Object.prototype.hasOwnProperty.call(permissions || {}, key));
  function canUseDocumentType(documentType, action) {
    if (getRole() === "admin") return true;
    const key = DOCUMENT_PERMISSION_KEYS[documentType] || DOCUMENT_PERMISSION_KEYS.other;
    if (hasDocumentSpecificPermissions) return Boolean(permissions?.[key]?.[action]);
    return Boolean(permissions?.uploads?.[action]);
  }

  const load = () => {
    systemApi.health().then(setHealth).catch(err => setMessage(String(err.message || err)));
    systemApi.documentLibrary().then(setDocumentLibrary).catch(()=>{});
    systemApi.tallyConnectors().then(setTallyConnectors).catch(()=>{});
    systemApi.tallyDemoStatus().then(setTallyDemoStatus).catch(()=>{});
  };
  useEffect(() => { load(); }, []);

  async function backup() {
    try {
      const r = await systemApi.backup();
      setMessage(r.suggested_command || "Backup command generated.");
    } catch (e) { setMessage(String(e.message || e)); }
  }

  async function restore() {
    try {
      const r = await systemApi.restore();
      setMessage(r.suggested_command || "Restore command generated.");
    } catch (e) { setMessage(String(e.message || e)); }
  }

  async function downloadDocument(doc) {
    if (!canUseDocumentType(doc.document_type, "download")) {
      setMessage(`You do not have permission to download ${doc.document_type || "this"} documents.`);
      return;
    }
    try {
      const safeName = `${doc.name || "document"}`.replace(/[^\w.-]+/g, "_");
      await downloadAuthorized(systemApi.documentLibraryUrl(doc.download_url), safeName);
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function registerTallyConnector(e) {
    e.preventDefault();
    try {
      const res = await systemApi.registerTallyConnector({
        ...tallyForm,
        tally_port: Number(tallyForm.tally_port || 9000),
      });
      setTallySecret(res);
      setTallyRuntime(runtime => ({
        ...runtime,
        connector_token: res.connector_token,
        tally_host: tallyForm.tally_host,
        tally_port: tallyForm.tally_port,
        tally_company_name: tallyForm.company_name,
        tally_mode: tallyForm.import_mode,
      }));
      setMessage("Tally connector registered. Token injected below; Save / Replace .env will store it for the connector.");
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function testTallyConnector() {
    try {
      const res = await systemApi.testTallyConnection();
      setTallyTest(res);
      setMessage(res.ok ? "Tally connector heartbeat found." : (res.message || "No live connector heartbeat found."));
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  const runtimePayload = {
    ERP_BASE_URL: tallyRuntime.erp_base_url,
    CONNECTOR_TOKEN: tallyRuntime.connector_token,
    TALLY_HOST: tallyRuntime.tally_host,
    TALLY_PORT: String(tallyRuntime.tally_port || 9000),
    TALLY_COMPANY_NAME: tallyRuntime.tally_company_name,
    TALLY_MODE: tallyRuntime.tally_mode,
    TALLY_EXPORT_FOLDER: tallyRuntime.tally_export_folder,
    POLL_SECONDS: String(tallyRuntime.poll_seconds || 45),
    TIMEOUT_SECONDS: String(tallyRuntime.timeout_seconds || 20),
    CONNECTOR_SQLITE: tallyRuntime.connector_sqlite,
  };

  async function saveTallyEnv() {
    try {
      const res = await systemApi.saveTallyEnv(runtimePayload);
      setMessage(res.message || "Connector .env saved/replaced.");
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function startMockTally() {
    try {
      const res = await systemApi.startMockTally();
      setMessage(res.message || "Mock Tally server started.");
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function stopMockTally() {
    try {
      const res = await systemApi.stopMockTally();
      setMessage(res.message || "Mock Tally server stopped.");
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function startConnector() {
    try {
      const res = await systemApi.startTallyConnector(runtimePayload);
      setMessage(res.message || "Local Tally connector started.");
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  async function stopConnector() {
    try {
      const res = await systemApi.stopTallyConnector();
      setMessage(res.message || "Local Tally connector stopped.");
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  const allowedTabs = (documentLibrary.tabs || []).filter(tab => tab.key === "all" || canUseDocumentType(tab.key, "view"));
  const visibleDocuments = (documentLibrary.documents || []).filter(doc => (
    canUseDocumentType(doc.document_type, "view") && (activeDocType === "all" || doc.document_type === activeDocType)
  ));
  const searchedDocuments = useSearch(visibleDocuments, documentSearch);
  const searchedConnectors = useSearch(tallyConnectors, connectorSearch);
  const docPg = usePagination(searchedDocuments, 25);
  const connectorPg = usePagination(searchedConnectors, 10);

  async function syncTally() {
    try {
      const res = await systemApi.syncTally();
      setMessage(res.message || (res.ok ? "Tally sync queued successfully." : "Tally sync could not start."));
      load();
    } catch (e) {
      setMessage(String(e.message || e));
    }
  }

  return (
    <div className="page">
      <h1 className="pageTitle">System / Health / Documents</h1>
      {message ? <div className="messageBar">{message} <button className="dismissBtn" onClick={()=>setMessage("")}>Dismiss</button></div> : null}
      <div className="grid2">
        <Card title="Health">
          <div className="statRow">
            <div><strong>{health?.status || "..."}</strong><span>Status</span></div>
            <div><strong>{health?.database ? "OK" : "No"}</strong><span>Database</span></div>
            <div><strong>{health?.time || "-"}</strong><span>UTC Time</span></div>
          </div>
        </Card>
        <Card title="Backup / Restore">
          <div className="actionCell">
            <button onClick={backup}>Get Backup Command</button>
            {getRole() === "admin" ? <button onClick={restore}>Get Restore Command</button> : null}
          </div>
        </Card>
      </div>
      <Card title="Tally Connector / Connection Tester / Demo Mock">
        <div className="grid2">
          <div>
            <h3 className="sectionTitle">Register Local Connector</h3>
            <p className="helperText">Use this once per office Tally machine. The token is shown only once and must be pasted into the local connector environment.</p>
            <form className="formGrid" onSubmit={registerTallyConnector}>
              <input value={tallyForm.connector_name} onChange={e=>setTallyForm({...tallyForm, connector_name:e.target.value})} placeholder="Connector name" required />
              <input value={tallyForm.machine_name} onChange={e=>setTallyForm({...tallyForm, machine_name:e.target.value})} placeholder="Machine name" />
              <input value={tallyForm.tally_host} onChange={e=>setTallyForm({...tallyForm, tally_host:e.target.value})} placeholder="Tally host" />
              <input type="number" value={tallyForm.tally_port} onChange={e=>setTallyForm({...tallyForm, tally_port:e.target.value})} placeholder="Tally port" />
              <input className="full" value={tallyForm.company_name} onChange={e=>setTallyForm({...tallyForm, company_name:e.target.value})} placeholder="Tally company name" />
              <select value={tallyForm.import_mode} onChange={e=>setTallyForm({...tallyForm, import_mode:e.target.value})}>
                <option value="hybrid">hybrid</option>
                <option value="live_http">live_http</option>
                <option value="file_import">file_import</option>
              </select>
              <label className="qcCheckLabel">
                <input type="checkbox" checked={Boolean(tallyForm.odbc_enabled)} onChange={e=>setTallyForm({...tallyForm, odbc_enabled:e.target.checked})} />
                <span>Enable optional ODBC reads</span>
              </label>
              <button className="primaryBtn full" type="submit">Register Connector</button>
            </form>
            {tallySecret ? <div className="messageBar">
              Connector registered. Token has been injected into the runtime input below. Save/Replace .env to store it.
            </div> : null}
          </div>
          <div>
            <h3 className="sectionTitle">Connection Status</h3>
            <div className="actionCell">
              <button className="primaryBtn" type="button" onClick={testTallyConnector}>Test Connector Heartbeat</button>
              <button className="primaryBtn" type="button" onClick={syncTally}>Tally Sync</button>
              <button className="ghostBtn" type="button" onClick={load}>Refresh</button>
            </div>
            {tallyTest ? <div className="accountsSummaryGrid" style={{marginTop: 12}}>
              <div><span>Status</span><strong>{tallyTest.ok ? "Online" : "Offline"}</strong></div>
              <div><span>Connector</span><strong>{tallyTest.connector || "-"}</strong></div>
              <div><span>Last Seen</span><strong>{tallyTest.last_seen_at || "-"}</strong></div>
              <div><span>Mode</span><strong>{tallyTest.mode || "-"}</strong></div>
            </div> : null}
            <div className="tableWrap" style={{marginTop: 12}}>
              <div className="listToolbar">
                <SearchBar value={connectorSearch} onChange={value => { setConnectorSearch(value); connectorPg.setPage(1); }} suggestions={buildSuggestions(tallyConnectors)} placeholder="Search connector by name, machine, company, mode..." />
              </div>
              <table>
                <thead><tr><th>ID</th><th>Name</th><th>Machine</th><th>Tally</th><th>Company</th><th>Mode</th><th>Last Seen</th></tr></thead>
                <tbody>
                  {connectorPg.pageData.length === 0 ? <tr><td colSpan="7" className="helperText">No connector found.</td></tr> : connectorPg.pageData.map(c => (
                    <tr key={c.id}>
                      <td>{c.id}</td><td>{c.connector_name}</td><td>{c.machine_name || "-"}</td><td>{c.tally_host}:{c.tally_port}</td><td>{c.company_name || "-"}</td><td>{c.import_mode}</td><td>{c.last_seen_at || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination total={connectorPg.total} page={connectorPg.page} pageSize={connectorPg.pageSize} onPageChange={connectorPg.setPage} onPageSizeChange={connectorPg.setPageSize} />
            </div>
          </div>
        </div>
        <div className="grid2" style={{marginTop: 16}}>
          <div className="detailCard">
            <div className="detailKey">Local Connector Runtime Inputs</div>
            <p className="helperText">Save/Replace writes these values into <strong>{tallyDemoStatus?.env_path || "tally_connector/.env"}</strong>. Start Connector also saves the latest values before launching it.</p>
            <div className="formGrid" style={{marginTop: 10}}>
              <input value={tallyRuntime.erp_base_url} onChange={e=>setTallyRuntime({...tallyRuntime, erp_base_url:e.target.value})} placeholder="ERP_BASE_URL" />
              <input value={tallyRuntime.connector_token} onChange={e=>setTallyRuntime({...tallyRuntime, connector_token:e.target.value})} placeholder="CONNECTOR_TOKEN" />
              <input value={tallyRuntime.tally_host} onChange={e=>setTallyRuntime({...tallyRuntime, tally_host:e.target.value})} placeholder="TALLY_HOST" />
              <input type="number" value={tallyRuntime.tally_port} onChange={e=>setTallyRuntime({...tallyRuntime, tally_port:e.target.value})} placeholder="TALLY_PORT" />
              <input className="full" value={tallyRuntime.tally_company_name} onChange={e=>setTallyRuntime({...tallyRuntime, tally_company_name:e.target.value})} placeholder="TALLY_COMPANY_NAME" />
              <select value={tallyRuntime.tally_mode} onChange={e=>setTallyRuntime({...tallyRuntime, tally_mode:e.target.value})}>
                <option value="hybrid">hybrid</option>
                <option value="live_http">live_http</option>
                <option value="file_import">file_import</option>
              </select>
              <input value={tallyRuntime.tally_export_folder} onChange={e=>setTallyRuntime({...tallyRuntime, tally_export_folder:e.target.value})} placeholder="TALLY_EXPORT_FOLDER" />
              <input type="number" value={tallyRuntime.poll_seconds} onChange={e=>setTallyRuntime({...tallyRuntime, poll_seconds:e.target.value})} placeholder="POLL_SECONDS" />
              <input type="number" value={tallyRuntime.timeout_seconds} onChange={e=>setTallyRuntime({...tallyRuntime, timeout_seconds:e.target.value})} placeholder="TIMEOUT_SECONDS" />
              <input value={tallyRuntime.connector_sqlite} onChange={e=>setTallyRuntime({...tallyRuntime, connector_sqlite:e.target.value})} placeholder="CONNECTOR_SQLITE" />
            </div>
            <div className="actionCell" style={{marginTop: 12}}>
              <button className="primaryBtn" type="button" onClick={saveTallyEnv}>Save / Replace .env</button>
              <button className="primaryBtn" type="button" onClick={startConnector}>Start Connector</button>
              <button className="ghostBtn" type="button" onClick={stopConnector}>Stop Connector</button>
            </div>
          </div>
          <div className="detailCard">
            <div className="detailKey">Mock Tally Demo Server</div>
            <p className="helperText">Runs the bundled mock Tally HTTP server locally on port 9000 for demos without a real TallyPrime instance.</p>
            <div className="accountsSummaryGrid">
              <div><span>Mock Server</span><strong>{tallyDemoStatus?.mock_tally?.running ? "Running" : "Stopped"}</strong></div>
              <div><span>PID</span><strong>{tallyDemoStatus?.mock_tally?.pid || "-"}</strong></div>
              <div><span>Connector</span><strong>{tallyDemoStatus?.connector?.running ? "Running" : "Stopped"}</strong></div>
              <div><span>Connector PID</span><strong>{tallyDemoStatus?.connector?.pid || "-"}</strong></div>
            </div>
            <div className="actionCell" style={{marginTop: 12}}>
              <button className="primaryBtn" type="button" onClick={startMockTally}>Start Mock Tally</button>
              <button className="ghostBtn" type="button" onClick={stopMockTally}>Stop Mock Tally</button>
              <button className="downloadBtn" type="button" onClick={load}>Refresh Status</button>
            </div>
          </div>
        </div>
      </Card>
      <Card title="System Document Library">
        <div className="sectionJumpBar" style={{marginBottom: 16}}>
          {allowedTabs.map(tab => (
            <button key={tab.key} className={activeDocType === tab.key ? "activeSectionTab" : ""} type="button" onClick={() => setActiveDocType(tab.key)}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <div className="listToolbar">
          <SearchBar value={documentSearch} onChange={value => { setDocumentSearch(value); docPg.setPage(1); }} suggestions={buildSuggestions(visibleDocuments)} placeholder="Search documents by type, name, entity, job card, invoice number..." />
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Type</th><th>Name</th><th>Entity / Reference</th><th>Source</th><th>Created</th><th>Download</th></tr></thead>
            <tbody>
              {docPg.pageData.length === 0 ? <tr><td colSpan="6" className="helperText">No documents in this section.</td></tr> : docPg.pageData.map((d, index) => (
                <tr key={`${d.document_type}-${d.download_url}-${index}`}>
                  <td>{(documentLibrary.tabs || []).find(tab => tab.key === d.document_type)?.label || d.document_type}</td>
                  <td>{d.name}</td>
                  <td>{d.entity}</td>
                  <td>{d.source}</td>
                  <td>{d.created_at || "-"}</td>
                  <td><button className="downloadBtn compactBtn" type="button" disabled={!canUseDocumentType(d.document_type, "download")} onClick={() => downloadDocument(d)}>{canUseDocumentType(d.document_type, "download") ? "Download" : "No Access"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination total={docPg.total} page={docPg.page} pageSize={docPg.pageSize} onPageChange={docPg.setPage} onPageSizeChange={docPg.setPageSize} />
        </div>
      </Card>
    </div>
  );
}
