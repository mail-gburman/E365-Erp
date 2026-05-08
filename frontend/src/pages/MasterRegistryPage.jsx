
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { api, systemApi } from "../api";
import { getBookingType } from "../auth";
import { getBookingProfile } from "../bookingProfiles";

// Tab order matches AdditionsPage — equipment_master first, then inventory
const TABS = [
  { key: "equipmentMaster", label: "Equipment Master", addTab: "equipment_master", entityType: "equipment_master" },
  { key: "inventory",       label: "Inventory",        addTab: "inventory",        entityType: "inventory" },
  { key: "crew",            label: "Crew",             addTab: "crew",             entityType: "crew" },
  { key: "clients",         label: "Clients",          addTab: "client",           entityType: "client" },
  { key: "vendors",         label: "Vendors",          addTab: "vendor",           entityType: "vendor" },
  { key: "warehouses",      label: "Warehouses",       addTab: "warehouse",        entityType: "warehouse" },
];

// Fields managed entirely by the booking/service workflow — hide from the detail view
// so users don't see confusing auto-managed values like "reserved", "on_shoot"
const HIDDEN_FIELDS = {
  inventory: new Set(["status"]),   // service_status is shown; booking-status is not relevant here
  crew:      new Set(["status"]),   // same — crew availability is managed by booking system
};

const IMAGE_EXTS = new Set(["jpg","jpeg","png","webp","gif","bmp","heic","heif","avif"]);
function isImage(path) {
  if (!path) return false;
  const ext = path.split(".").pop().toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function itemLabel(tab, item) {
  if (tab === "inventory") {
    let badge = "";
    if (item.service_status === "in_service") badge = " · In Service";
    else if (item.service_status === "completely_damaged" || item.status === "decommissioned") badge = " · Decommissioned";
    else if (item.status === "inactive") badge = " · Inactive";
    return `${item.asset_code} · ${item.name}${badge}`;
  }
  if (tab === "crew") {
    let badge = (item.status === "inactive" || item.status === "decommissioned") ? " · Inactive" : "";
    return `${item.employee_code} · ${item.full_name}${badge}`;
  }
  if (tab === "clients")         return `${item.client_code} · ${item.name}`;
  if (tab === "vendors")         return `${item.vendor_code} · ${item.name}`;
  if (tab === "warehouses")      return `${item.code} · ${item.name}`;
  if (tab === "equipmentMaster") return `${item.equipment_code} · ${item.name}`;
  return String(item.id);
}

export default function MasterRegistryPage() {
  const navigate = useNavigate();
  const bookingProfile = getBookingProfile(getBookingType());
  const tabs = useMemo(() => TABS.filter((tab) => tab.key !== "warehouses" || bookingProfile.features.warehouse !== false).map((tab) => {
    if (tab.key === "equipmentMaster") return { ...tab, label: bookingProfile.value === "equipment" ? tab.label : `${bookingProfile.resourceLabel} Master` };
    if (tab.key === "inventory") return { ...tab, label: bookingProfile.registryLabel.replace(" Registry", "") };
    if (tab.key === "vendors") return { ...tab, label: bookingProfile.vendorsLabel };
    if (tab.key === "warehouses" && bookingProfile.value === "venue") return { ...tab, label: "Venue Clusters" };
    return tab;
  }), [bookingProfile]);
  const [warehouses, setWarehouses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [clients, setClients] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [equipmentMaster, setEquipmentMaster] = useState([]);
  const [crewList, setCrewList] = useState([]);
  const [masterTab, setMasterTab] = useState("equipmentMaster");
  const [selectedId, setSelectedId] = useState(null);
  const [masterSearch, setMasterSearch] = useState("");
  const [entityDocs, setEntityDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);

  useEffect(() => {
    api.warehouses().then(setWarehouses);
    api.vendors().then(setVendors);
    api.clients().then(setClients);
    api.inventory().then(setInventory);
    api.equipmentMaster().then(setEquipmentMaster);
    api.crew().then(setCrewList);
  }, []);

  const masterData = useMemo(() => {
    const map = { inventory, crew: crewList, clients, vendors, warehouses, equipmentMaster };
    return map[masterTab] || [];
  }, [masterTab, inventory, crewList, clients, vendors, warehouses, equipmentMaster]);

  const filteredMasterData = useSearch(masterData, masterSearch);
  const pg = usePagination(filteredMasterData, 25);

  const selectedItem = useMemo(
    () => filteredMasterData.find(x => String(x.id) === String(selectedId)) || filteredMasterData[0] || null,
    [filteredMasterData, selectedId]
  );

  useEffect(() => {
    if (filteredMasterData.length && !filteredMasterData.find(x => String(x.id) === String(selectedId))) {
      setSelectedId(filteredMasterData[0]?.id ?? null);
    }
  }, [filteredMasterData, selectedId]);

  // Fetch documents/images for selected item
  const loadDocs = useCallback(async (tab, itemId) => {
    if (!itemId) { setEntityDocs([]); return; }
    const tabObj = tabs.find(t => t.key === tab);
    if (!tabObj) { setEntityDocs([]); return; }
    setDocsLoading(true);
    try {
      const docs = await systemApi.documentsByEntity(tabObj.entityType, itemId);
      setEntityDocs(Array.isArray(docs) ? docs : []);
    } catch { setEntityDocs([]); }
    setDocsLoading(false);
  }, [tabs]);

  useEffect(() => {
    loadDocs(masterTab, selectedItem?.id);
  }, [masterTab, selectedItem?.id, loadDocs]);

  function handleEdit(item) {
    const tab = tabs.find(t => t.key === masterTab);
    navigate("/additions", { state: { editItem: item, editTab: tab?.addTab || masterTab } });
  }

  const images = entityDocs.filter(d => isImage(d.file_path));
  const otherDocs = entityDocs.filter(d => !isImage(d.file_path));
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001";

  return (
    <div className="page">
      <h1 className="pageTitle">{bookingProfile.registryLabel}</h1>
      <Card title={`${bookingProfile.registryLabel} / Crew / Clients / ${bookingProfile.vendorsLabel}`}>
        <div className="tabRow">
          {tabs.map(t => (
            <button key={t.key} type="button"
              className={masterTab === t.key ? "tabBtn activeTab" : "tabBtn"}
              onClick={() => { setMasterTab(t.key); setSelectedId(null); setMasterSearch(""); pg.setPage(1); }}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="masterRegistry">
          <div className="masterListPane">
            <SearchBar
              value={masterSearch}
              onChange={value => { setMasterSearch(value); pg.setPage(1); }}
              suggestions={buildSuggestions(masterData)}
              placeholder={`Search by name, code, serial, phone…`}
            />
            <div style={{ fontSize: 11, color: "var(--muted)", padding: "4px 0" }}>
              {filteredMasterData.length} items found
            </div>
            <div className="masterList">
              {pg.pageData.map(item => (
                <div
                  key={item.id}
                  className={String(selectedItem?.id) === String(item.id) ? "masterListItem activeMaster" : "masterListItem"}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="masterListLabel">{itemLabel(masterTab, item)}</span>
                  <button
                    type="button"
                    className="compactBtn ghostBtn masterEditBtn"
                    onClick={e => { e.stopPropagation(); handleEdit(item); }}
                  >
                    ✏️ Edit
                  </button>
                </div>
              ))}
            </div>
            <Pagination
              total={pg.total} page={pg.page} pageSize={pg.pageSize}
              onPageChange={pg.setPage} onPageSizeChange={pg.setPageSize}
            />
          </div>
          <div className="masterDetailPane">
            {selectedItem ? (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <button className="primaryBtn compactBtn" onClick={() => handleEdit(selectedItem)}>✏️ Edit this record</button>
                </div>

                {/* ── Images ── */}
                {docsLoading ? (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Loading media…</div>
                ) : images.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Photos</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {images.map(doc => (
                        <a key={doc.id} href={`${API_BASE}/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer"
                          title={doc.document_name || doc.file_path}>
                          <img
                            src={`${API_BASE}/documents/${doc.id}/download`}
                            alt={doc.document_name || "photo"}
                            style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", cursor: "pointer" }}
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Supporting Documents ── */}
                {otherDocs.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".06em" }}>Documents</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {otherDocs.map(doc => (
                        <a key={doc.id} href={`${API_BASE}/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                          📎 {doc.document_name || doc.file_path?.split("/").pop() || "Document"}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="detailGrid">
                  {Object.entries(selectedItem)
                    .filter(([k]) => {
                      if (HIDDEN_FIELDS[masterTab]?.has(k)) return false;
                      if (!bookingProfile.features.warehouse && ["warehouse_id", "location_text"].includes(k)) return false;
                      if (!bookingProfile.features.warranty && ["warranty_expiry"].includes(k)) return false;
                      if (!bookingProfile.features.maintenance && ["service_due", "service_status", "statutory_tag"].includes(k)) return false;
                      if (!bookingProfile.features.accessories && ["equipment_master_id", "parent_item_id", "mandatory_accessory_codes", "optional_accessory_codes"].includes(k)) return false;
                      return true;
                    })
                    .map(([k, v]) => (
                      <div key={k} className="detailCard">
                        <div className="detailKey">{k}</div>
                        <div className="detailVal">{String(v ?? "-")}</div>
                      </div>
                    ))}
                </div>
              </>
            ) : <div className="helperText">No records available.</div>}
          </div>
        </div>
      </Card>
    </div>
  );
}
