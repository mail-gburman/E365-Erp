import { getToken, clearSessionSync } from "./auth";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function parse(res) {
  if (res.status === 401) {
    clearSessionSync();
    throw new Error("Session expired or token invalid. Please login again.");
  }
  if (!res.ok) throw new Error(await res.text());
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}
function headers(isForm=false) {
  const h = {};
  const token = getToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (!isForm) h["Content-Type"] = "application/json";
  return h;
}
async function get(path) {
  return fetch(`${API_BASE}${path}`, { headers: headers(true) }).then(parse);
}
async function post(path, body) {
  return fetch(`${API_BASE}${path}`, { method: "POST", headers: headers(false), body: JSON.stringify(body) }).then(parse);
}
export async function login(username, password) {
  const fd = new URLSearchParams();
  fd.set("username", username);
  fd.set("password", password);
  return fetch(`${API_BASE}/auth/login`, { method: "POST", headers: headers(true), body: fd }).then(parse);
}
export const api = {
  me: () => get("/auth/me"),
  updateMe: async (p) => {
    const res = await fetch(`${API_BASE}/auth/me`, { method: "PUT", headers: headers(false), body: JSON.stringify(p) });
    return parse(res);
  },
  dashboard: (rangeStart, rangeEnd) => {
    let path = "/dashboard";
    if (rangeStart && rangeEnd) path += `?range_start=${rangeStart}&range_end=${rangeEnd}`;
    return get(path);
  },
  warehouses: () => get("/warehouses"),
  createWarehouse: (p) => post("/warehouses", p),
  bulkUploadPreview: async (entityType, file) => {
    const fd = new FormData();
    fd.append("entity_type", entityType);
    fd.append("file", file);
    const res = await fetch(`${API_BASE}/bulk-upload-preview`, {
      method: "POST",
      headers: headers(true),
      body: fd,
    });
    return await parse(res);
  },

  bulkUploadStart: async (entityType, file) => {
    const fd = new FormData();
    fd.append("entity_type", entityType);
    fd.append("file", file);
    const res = await fetch(`${API_BASE}/bulk-upload-start`, {
      method: "POST",
      headers: headers(true),
      body: fd,
    });
    return await parse(res);
  },
  bulkUploadStatus: (jobId) => get(`/bulk-upload-status/${jobId}`),
  bulkUpload: async (entityType, file) => {
    const fd = new FormData();
    fd.append("entity_type", entityType);
    fd.append("file", file);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      const res = await fetch(`${API_BASE}/bulk-upload`, {
        method: "POST",
        headers: headers(true),
        body: fd,
        signal: controller.signal,
      });
      return await parse(res);
    } catch (e) {
      if (e?.name === "AbortError") {
        throw new Error("Import timed out while waiting for backend response. The workbook may be too large or the backend may be stuck parsing it.");
      }
      throw new Error("Could not reach the backend import endpoint. Check whether the backend is still running and whether the import route crashed.");
    } finally {
      clearTimeout(timer);
    }
  },
  vendors: () => get("/vendors"),
  clients: () => get("/clients"),
  createClient: (p) => post("/clients", p),
  createVendor: (p) => post("/vendors", p),
  equipmentMaster: () => get("/equipment-master"),
  createEquipmentMaster: (p) => post("/equipment-master", p),
  inventory: () => get("/inventory"),
  createInventory: (p) => post("/inventory", p),
  crew: () => get("/crew"),
  createCrew: (p) => post("/crew", p),
  procurement: () => get("/procurement"),
  createProcurement: (p) => post("/procurement", p),
  projects: () => get("/projects/"),
  createProject: (p) => post("/projects/", p),
  updateProject: (id, p) => fetch(`${API_BASE}/projects/${id}`, { method: "PUT", headers: headers(false), body: JSON.stringify(p) }).then(parse),
  bookings: () => get("/bookings/"),
  resourceSearch: (q, resourceType, options = {}) => {
    const params = new URLSearchParams({
      q: q || "",
      resource_type: resourceType,
    });
    if (options.project_id) params.set("project_id", String(options.project_id));
    if (options.block_start) params.set("block_start", options.block_start);
    if (options.block_end) params.set("block_end", options.block_end);
    return get(`/bookings/resource-search?${params.toString()}`);
  },
  requiredAccessories: (equipmentIds) => get(`/bookings/required-accessories?equipment_ids=${encodeURIComponent((equipmentIds||[]).join(","))}`),
  bookingDetails: () => get("/bookings/details"),
  qcList: () => get("/bookings/qc"),
  gatePasses: () => get("/bookings/gate-passes"),
  gatePassDetails: () => get("/bookings/gate-passes/details"),
  partialReturns: () => get("/bookings/partial-returns"),
  custody: () => get("/bookings/custody"),
  createBooking: (p) => post("/bookings/", p),
  createSupplementaryBooking: (id, p) => post(`/bookings/${id}/supplementary`, p),
  confirmBooking: (id) => post(`/bookings/${id}/confirm`, {}),
  dispatchBooking: (id) => post(`/bookings/${id}/dispatch`, {}),
  returnBooking: (id) => post(`/bookings/${id}/return`, {}),
  completeBooking: (id, p = {}) => post(`/bookings/${id}/complete`, p),
  updateBooking: (id, p) => fetch(`${API_BASE}/bookings/${id}`, { method: "PUT", headers: headers(false), body: JSON.stringify(p) }).then(parse),
  cancelBooking: (id, reason) => post(`/bookings/${id}/cancel`, { cancellation_reason: reason || "" }),
  damages: () => get("/bookings/damages"),
  createDamage: (p) => post("/bookings/damages", p),
  uploadDamagePhoto: async (damageId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API_BASE}/bookings/damages/${damageId}/upload-photo`, { method: "POST", headers: headers(true), body: fd });
    return parse(res);
  },
  createQC: (p) => post("/bookings/qc", p),
  createPartialReturn: (p) => post("/bookings/partial-return", p),
  serviceJobs: () => get("/service-jobs/"),
  serviceJobDetails: () => get("/service-jobs/details"),
  createServiceJob: (p) => post("/service-jobs/", p),
  completeServiceJob: (id, notes) => post(`/service-jobs/${id}/complete${notes ? `?notes=${encodeURIComponent(notes)}` : ""}`, {}),
  foreverDamagedServiceJob: (id, notes) => post(`/service-jobs/${id}/forever-damaged${notes ? `?notes=${encodeURIComponent(notes)}` : ""}`, {}),
  uploadServiceAttachments: async (jobId, files, caption = "") => {
    const fd = new FormData();
    Array.from(files || []).forEach(file => fd.append("files", file));
    fd.append("caption", caption || "");
    const res = await fetch(`${API_BASE}/service-jobs/${jobId}/attachments`, { method: "POST", headers: headers(true), body: fd });
    return parse(res);
  },
  deleteServiceAttachment: async (attachmentId) => {
    const res = await fetch(`${API_BASE}/service-jobs/attachments/${attachmentId}`, { method: "DELETE", headers: headers(true) });
    return parse(res);
  },
  serviceAttachmentUrl: (attachmentId) => `${API_BASE}/service-jobs/attachments/${attachmentId}/download`,
  papers: () => get("/papers/"),
  createPaper: (p) => post("/papers/", p),
  paperPdfUrl: (id) => `${API_BASE}/papers/${id}/pdf`,
  servicePdfUrl: (id) => `${API_BASE}/service-jobs/${id}/pdf`,
  gatePassPdfUrl: (id) => `${API_BASE}/bookings/gate-passes/${id}/pdf`,
  jobCardPdfUrl: (id) => `${API_BASE}/bookings/${id}/job-card-pdf`,
  roadChallanPdfUrl: (id) => `${API_BASE}/bookings/${id}/road-challan-pdf`,
  manpowerPdfUrl: (id) => `${API_BASE}/bookings/${id}/manpower-pdf`,
  calendarDaySummaryPdfUrl: (dateStr) => `${API_BASE}/bookings/calendar-day-summary-pdf?target_date=${encodeURIComponent(dateStr)}`,
  serviceDeclarationPdfUrl: (id) => `${API_BASE}/service-jobs/${id}/declaration-pdf`,
  serviceAddressLabelPdfUrl: (id) => `${API_BASE}/service-jobs/${id}/address-label-pdf`,
  accountsBookings: () => get("/accounts/bookings"),
  accountEstimate: (bookingId, offDaysPayable = false) => get(`/accounts/estimate/${bookingId}?off_days_payable=${offDaysPayable ? "true" : "false"}`),
  accountInvoices: () => get("/accounts/invoices"),
  accountInvoicePdfUrl: (id) => `${API_BASE}/accounts/invoices/${id}/pdf`,
  accountsLedger: () => get("/accounts/ledger"),
  recordLedgerPayment: (p) => post("/accounts/ledger-payments", p),
  recordBarter: (p) => post("/accounts/barter", p),
  verifyId: (idType, value) => get(`/verify-id/${encodeURIComponent(idType)}?value=${encodeURIComponent(value)}`),
  pushInvoiceToTally: (id) => post(`/api/accounts/${id}/push-to-tally`, {}),
  resyncInvoiceToTally: (id) => post(`/api/accounts/${id}/resync-tally`, {}),
  pushReceiptToTally: (id) => post(`/api/accounts/${id}/push-receipt-to-tally`, {}),
  tallyStatus: (id) => get(`/api/accounts/${id}/tally-status`),
  tallyHistory: (id) => get(`/api/accounts/${id}/tally-history`),
  tallyMappings: () => get("/api/integrations/tally/mappings"),
  saveTallyMapping: (p) => post("/api/integrations/tally/mappings", p),
  testTallyConnection: () => post("/api/integrations/tally/test-connection", {}),
  saveAccountInvoice: (p) => post("/accounts/invoices", p),
  updateAccountInvoice: (id, p) => fetch(`${API_BASE}/accounts/invoices/${id}`, { method: "PUT", headers: headers(false), body: JSON.stringify(p) }).then(parse),

  smartUploadPreview: async (file, entityType) => {
    const fd = new FormData();
    fd.append("file", file);
    if (entityType) fd.append("entity_type", entityType);
    const res = await fetch(`${API_BASE}/smart-upload/preview`, { method: "POST", headers: headers(true), body: fd });
    return await parse(res);
  },

  smartUploadImport: async (file, entityType, mapping) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entity_type", entityType);
    fd.append("mapping", JSON.stringify(mapping));
    const res = await fetch(`${API_BASE}/smart-upload/import`, { method: "POST", headers: headers(true), body: fd });
    return await parse(res);
  },

  // ── Quotes ────────────────────────────────────────────────────────────────
  listQuotes: (params = {}) => get(`/quotes?${new URLSearchParams(params).toString()}`),
  getQuote: (id) => get(`/quotes/${id}`),
  createQuote: (p) => post("/quotes", p),
  updateQuote: (id, p) => fetch(`${API_BASE}/quotes/${id}`, { method: "PUT", headers: headers(false), body: JSON.stringify(p) }).then(parse),
  setQuoteStatus: (id, status) => post(`/quotes/${id}/status?status=${encodeURIComponent(status)}`, {}),
  convertQuote: (id) => post(`/quotes/${id}/convert`, {}),
  deleteQuote: (id) => fetch(`${API_BASE}/quotes/${id}`, { method: "DELETE", headers: headers(false) }).then(r => { if (!r.ok && r.status !== 204) return r.json().then(e => Promise.reject(e)); }),
  quotePdfUrl: (id) => `${API_BASE}/quotes/${id}/pdf`,
};

export async function serverLogout() {
  /** Revoke the current session on the server. Fire-and-forget — never throws. */
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: "POST", headers: headers(true) });
  } catch (_) { /* ignore — token may already be expired */ }
}

export const adminApi = {
  users: () => get("/admin/users"),
  demoDatasetStatus: () => get("/admin/demo-dataset"),
  loadDemoDataset: () => post("/admin/demo-dataset/load", {}),
  removeDemoDataset: async () => {
    const res = await fetch(`${API_BASE}/admin/demo-dataset`, { method: "DELETE", headers: headers(true) });
    return parse(res);
  },
  createUser: (p) => post("/admin/users", p),
  updateUser: async (id, p) => {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, { method: "PUT", headers: headers(false), body: JSON.stringify(p) });
    return parse(res);
  },
  deleteUser: async (id) => {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, { method: "DELETE", headers: headers(true) });
    return parse(res);
  },
  // Role presets
  presets: () => get("/admin/presets"),
  createPreset: (p) => post("/admin/presets", p),
  updatePreset: async (id, p) => {
    const res = await fetch(`${API_BASE}/admin/presets/${id}`, { method: "PUT", headers: headers(false), body: JSON.stringify(p) });
    return parse(res);
  },
  deletePreset: async (id) => {
    const res = await fetch(`${API_BASE}/admin/presets/${id}`, { method: "DELETE", headers: headers(true) });
    return parse(res);
  },
  resetPreset: async (id) => {
    const res = await fetch(`${API_BASE}/admin/presets/${id}/reset`, { method: "POST", headers: headers(true) });
    return parse(res);
  },
  // Session management
  sessions: () => get("/admin/sessions"),
  revokeSession: async (id) => {
    const res = await fetch(`${API_BASE}/admin/sessions/${id}`, { method: "DELETE", headers: headers(true) });
    return parse(res);
  },
  revokeUserSessions: async (userId) => {
    const res = await fetch(`${API_BASE}/admin/sessions/user/${userId}`, { method: "DELETE", headers: headers(true) });
    return parse(res);
  },
};

export const systemApi = {
  health: () => get("/health"),
  auditLogs: () => get("/audit-logs"),
  documents: () => get("/documents"),
  documentLibrary: () => get("/system/document-library"),
  uploadDocument: async (formData) => {
    const res = await fetch(`${API_BASE}/documents`, { method: "POST", headers: headers(true), body: formData });
    return parse(res);
  },
  downloadDocumentUrl: (id) => `${API_BASE}/documents/${id}/download`,
  documentLibraryUrl: (path) => `${API_BASE}${path}`,
  backup: () => post("/backup", {}),
  restore: () => post("/restore", {}),
  tallyConnectors: () => get("/api/integrations/tally/connectors/status"),
  registerTallyConnector: (p) => post("/api/integrations/tally/connectors/register", p),
  testTallyConnection: () => post("/api/integrations/tally/test-connection", {}),
  syncTally: () => post("/api/integrations/tally/sync-all", {}),
  tallyDemoStatus: () => get("/system/tally-demo/status"),
  saveTallyEnv: (p) => post("/system/tally-demo/env", p),
  startMockTally: () => post("/system/tally-demo/mock/start", {}),
  stopMockTally: () => post("/system/tally-demo/mock/stop", {}),
  startTallyConnector: (p) => post("/system/tally-demo/connector/start", p),
  stopTallyConnector: () => post("/system/tally-demo/connector/stop", {}),
};

export const auditApi = {
  query: (params) => {
    const qs = new URLSearchParams(params).toString();
    return get(`/audit/query?${qs}`);
  },
  exportPdfUrl: (params) => `${API_BASE}/audit/export/pdf?${new URLSearchParams(params).toString()}`,
  exportZipUrl: (params) => `${API_BASE}/audit/export/zip?${new URLSearchParams(params).toString()}`,
  resetAll: () => post("/audit/reset-all", {}),
};

const activeDownloads = new Set();

export async function viewAuthorized(url, title = "KPS PDF") {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (res.status === 401) throw new Error("Session expired or token invalid. Please login again.");
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const obj = URL.createObjectURL(blob);
  const wrapper = URL.createObjectURL(new Blob([
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>html,body{margin:0;height:100%;background:#111;}iframe{border:0;width:100%;height:100%;}</style></head><body><iframe src="${obj}" title="${title}"></iframe></body></html>`
  ], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = wrapper;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.click();
  setTimeout(() => URL.revokeObjectURL(obj), 15000);
  setTimeout(() => URL.revokeObjectURL(wrapper), 15000);
}

export async function forceDownloadAuthorized(url, filename) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (res.status === 401) throw new Error("Session expired or token invalid. Please login again.");
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const obj = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = obj;
  a.download = filename || "download";
  a.click();
  setTimeout(() => URL.revokeObjectURL(obj), 15000);
}

export async function downloadAuthorized(url, filename) {
  const downloadKey = `${url}::${filename || ""}`;
  if (activeDownloads.has(downloadKey)) return;
  activeDownloads.add(downloadKey);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  try {
    if (res.status === 401) throw new Error("Session expired or token invalid. Please login again.");
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const isPdf = (res.headers.get("content-type") || "").includes("pdf") || String(filename || "").toLowerCase().endsWith(".pdf");
    const a = document.createElement("a");
    let wrapper = null;
    if (isPdf) {
      wrapper = URL.createObjectURL(new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${filename || "KPS PDF"}</title><style>html,body{margin:0;height:100%;background:#111;}iframe{border:0;width:100%;height:100%;}</style></head><body><iframe src="${obj}" title="${filename || "KPS PDF"}"></iframe></body></html>`], { type: "text/html" }));
      a.href = wrapper;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else {
      a.href = obj;
      a.download = filename;
    }
    a.click();
    setTimeout(() => URL.revokeObjectURL(obj), 15000);
    if (wrapper) setTimeout(() => URL.revokeObjectURL(wrapper), 15000);
  } finally {
    setTimeout(() => activeDownloads.delete(downloadKey), 800);
  }
}


export async function fetchBlobUrlAuthorized(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (res.status === 401) throw new Error("Session expired or token invalid. Please login again.");
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
