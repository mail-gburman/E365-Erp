
import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import Pagination, { usePagination } from "../components/Pagination";
import SearchBar, { buildSuggestions, useSearch } from "../components/SearchBar";
import { api } from "../api";

export default function MasterRegistryPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [clients, setClients] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [equipmentMaster, setEquipmentMaster] = useState([]);
  const [crewList, setCrewList] = useState([]);
  const [masterTab, setMasterTab] = useState("inventory");
  const [selectedId, setSelectedId] = useState(null);
  const [masterSearch, setMasterSearch] = useState("");

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

  const selectedItem = useMemo(() => filteredMasterData.find(x => String(x.id) === String(selectedId)) || filteredMasterData[0] || null, [filteredMasterData, selectedId]);
  useEffect(() => {
    if (filteredMasterData.length && !filteredMasterData.find(x => String(x.id) === String(selectedId))) {
      setSelectedId(filteredMasterData[0].id);
    }
  }, [filteredMasterData, selectedId]);

  return (
    <div className="page">
      <h1 className="pageTitle">Master Registry</h1>
      <Card title="All Inventory / Crew / Clients / Vendors / Warehouses / Equipment Masters">
        <div className="tabRow">
          {["inventory","crew","clients","vendors","warehouses","equipmentMaster"].map(t => (
            <button key={t} type="button" className={masterTab===t ? "tabBtn activeTab" : "tabBtn"} onClick={() => { setMasterTab(t); setSelectedId(null); setMasterSearch(""); pg.setPage(1); }}>{t}</button>
          ))}
        </div>
        <div className="masterRegistry">
          <div className="masterListPane">
            <SearchBar value={masterSearch} onChange={value=>{setMasterSearch(value);pg.setPage(1);}} suggestions={buildSuggestions(masterData)} placeholder={`Search ${masterTab} by name, code, serial, phone, GST...`} />
            <div style={{fontSize:11,color:"var(--muted)",padding:"4px 0"}}>{filteredMasterData.length} items found</div>
            <div className="masterList">
              {pg.pageData.map(item => (
                <button key={item.id} type="button" className={String(selectedItem?.id)===String(item.id) ? "masterListItem activeMaster" : "masterListItem"} onClick={() => setSelectedId(item.id)}>
                  {masterTab==="inventory" ? `${item.asset_code} · ${item.name} · ${item.status}` : null}
                  {masterTab==="crew" ? `${item.employee_code} · ${item.full_name} · ${item.status}` : null}
                  {masterTab==="clients" ? `${item.client_code} · ${item.name}` : null}
                  {masterTab==="vendors" ? `${item.vendor_code} · ${item.name}` : null}
                  {masterTab==="warehouses" ? `${item.code} · ${item.name}` : null}
                  {masterTab==="equipmentMaster" ? `${item.equipment_code} · ${item.name}` : null}
                </button>
              ))}
            </div>
            <Pagination total={pg.total} page={pg.page} pageSize={pg.pageSize} onPageChange={pg.setPage} onPageSizeChange={pg.setPageSize} />
          </div>
          <div className="masterDetailPane">
            {selectedItem ? (
              <div className="detailGrid">
                {Object.entries(selectedItem).map(([k,v]) => (
                  <div key={k} className="detailCard">
                    <div className="detailKey">{k}</div>
                    <div className="detailVal">{String(v ?? "-")}</div>
                  </div>
                ))}
              </div>
            ) : <div className="helperText">No records available.</div>}
          </div>
        </div>
      </Card>
    </div>
  );
}
