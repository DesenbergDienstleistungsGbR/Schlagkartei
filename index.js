import { requireAuth, logout } from "./auth.js";
requireAuth();

const yearSel = document.getElementById("yearSel");
const firmaSel = document.getElementById("firmaSel");
const fruchtSel = document.getElementById("fruchtSel");
const schlagList = document.getElementById("schlagList");
const countBadge = document.getElementById("countBadge");
document.getElementById("logoutBtn").addEventListener("click", logout);

let DATA = [];
const OVERRIDE_KEY = "mitteleinsatz_data_override_v1";
function loadOverride(){
  try{ const raw = localStorage.getItem(OVERRIDE_KEY); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
}
function saveOverride(data){ localStorage.setItem(OVERRIDE_KEY, JSON.stringify(data)); }
function clearOverride(){ localStorage.removeItem(OVERRIDE_KEY); }
async function loadData(){
  const ov = loadOverride();
  if (ov && Array.isArray(ov) && ov.length) return ov;
  const res = await fetch("./data.json", { cache: "no-store" });
  return await res.json();
}


function uniqSorted(arr) {
  const s = new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ""));
  return Array.from(s).sort((a,b) => String(a).localeCompare(String(b), "de", {numeric:true, sensitivity:"base"}));
}

function setOptions(sel, values, placeholder="Bitte wählen…") {
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = placeholder;
  sel.appendChild(opt0);
  for (const v of values) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }
}

function filterRows() {
  const y = yearSel.value, f = firmaSel.value, fr = fruchtSel.value;
  return DATA.filter(r =>
    (!y || String(r["E_Jahr"]) === y) &&
    (!f || String(r["Firma"]) === f) &&
    (!fr || String(r["Frucht"]) === fr)
  );
}

function renderSchlaege() {
  const y = yearSel.value, f = firmaSel.value, fr = fruchtSel.value;
  schlagList.innerHTML = "";
  if (!y || !f || !fr) {
    countBadge.textContent = "0 Schläge";
    return;
  }
  const rows = filterRows();
  const schlaege = uniqSorted(rows.map(r => r["Schlag"]));
  countBadge.textContent = `${schlaege.length} Schläge`;

  for (const s of schlaege) {
    const rowsFor = rows.filter(r => String(r["Schlag"]) === String(s));
    const cnt = rowsFor.length;
    const fl = rowsFor.reduce((a,r) => a + (Number(String(r["bearbeitete Fläche"] ?? "").replace(",", ".")) || 0), 0);

    const li = document.createElement("li");
    const a = document.createElement("a");
    const qs = new URLSearchParams({ year: y, firma: f, frucht: fr, schlag: String(s) });
    a.href = `detail.html?${qs.toString()}`;

    const title = document.createElement("div");
    title.textContent = String(s);

    const meta = document.createElement("div");
    meta.className = "muted small";
    meta.textContent = `${cnt} Datensätze` + (fl ? ` • Fläche Σ ${fl.toFixed(2)} ha` : "");

    a.appendChild(title);
    a.appendChild(meta);

    li.appendChild(a);
    schlagList.appendChild(li);
  }
}

async function init() {
  DATA = await loadData();

  setOptions(yearSel, uniqSorted(DATA.map(r => r["E_Jahr"])));
  setOptions(firmaSel, uniqSorted(DATA.map(r => r["Firma"])));
  setOptions(fruchtSel, uniqSorted(DATA.map(r => r["Frucht"])));

  yearSel.addEventListener("change", renderSchlaege);
  firmaSel.addEventListener("change", renderSchlaege);
  fruchtSel.addEventListener("change", renderSchlaege);

// Excel import (client-side)
  const excelFile = document.getElementById("excelFile");
  const importBtn = document.getElementById("importBtn");
  const downloadJsonBtn = document.getElementById("downloadJsonBtn");
  const clearOverrideBtn = document.getElementById("clearOverrideBtn");
  const importStatus = document.getElementById("importStatus");

  function setStatus(t){ if(importStatus) importStatus.textContent = t || ""; }

  function normalizeValue(v){
    if (v === undefined) return null;
    if (v === null) return null;
    if (typeof v === "number" && (!isFinite(v) || Number.isNaN(v))) return null;
    if (v instanceof Date) {
      const yyyy = v.getFullYear();
      const mm = String(v.getMonth()+1).padStart(2,"0");
      const dd = String(v.getDate()).padStart(2,"0");
      return `${yyyy}-${mm}-${dd}`;
    }
    return v;
  }

  function sheetToRecords(ws){
    const arr = window.XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
    return arr.map(row => {
      const out = {};
      for (const [k,val] of Object.entries(row)){
        out[String(k).trim()] = normalizeValue(val);
      }
      return out;
    });
  }

  async function importExcel(){
    const f = excelFile?.files?.[0];
    if (!f){ setStatus("Bitte zuerst eine Excel-Datei auswählen."); return; }
    if (!window.XLSX){ setStatus("Excel-Library (XLSX) konnte nicht geladen werden. Bitte Seite neu laden."); return; }

    setStatus("Lese Excel…");
    const buf = await f.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: "array" });
    const first = wb.SheetNames[0];
    const ws = wb.Sheets[first];
    const recs = sheetToRecords(ws);

    if (!Array.isArray(recs) || recs.length === 0){
      setStatus("Keine Daten gefunden (leeres Blatt?).");
      return;
    }

    saveOverride(recs);
    DATA = recs;

    // rebuild dropdowns from new data
    setOptions(yearSel, uniqSorted(DATA.map(r => r["E_Jahr"])));
    setOptions(firmaSel, uniqSorted(DATA.map(r => r["Firma"])));
    setOptions(fruchtSel, uniqSorted(DATA.map(r => r["Frucht"])));

    yearSel.value = "";
    firmaSel.value = "";
    fruchtSel.value = "";
    renderSchlaege();

    setStatus(`Import ok: ${recs.length} Zeilen aus "${f.name}". (Nur in deinem Browser gespeichert)`);
  }

  function downloadDataJson(){
    const ov = loadOverride();
    if (!ov){ setStatus("Kein importierter Datensatz vorhanden. Erst Excel importieren."); return; }
    const blob = new Blob([JSON.stringify(ov)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("data.json heruntergeladen. Diese Datei kannst du ins GitHub-Repo hochladen (ersetzen).");
  }

  function resetOverride(){
    clearOverride();
    setStatus("Import zurückgesetzt. Es werden wieder die Daten aus data.json genutzt.");
    location.reload();
  }

  importBtn?.addEventListener("click", importExcel);
  downloadJsonBtn?.addEventListener("click", downloadDataJson);
  clearOverrideBtn?.addEventListener("click", resetOverride);

  const hasOv = loadOverride();
  if (hasOv) setStatus(`Hinweis: Es ist ein Excel-Import aktiv (${hasOv.length} Zeilen).`);

  renderSchlaege();
}

init();
// --- Map (Leaflet) ---
let MAP = null;
let GEO = null; // GeoJSON FeatureCollection
let LAYER = null;
const mapHint = document.getElementById("mapHint");

function setMapHint(t){ if(mapHint) mapHint.textContent = t || ""; }

async function loadGeo() {
  const res = await fetch("./schlaege.geojson", { cache: "no-store" });
  if (!res.ok) throw new Error("schlaege.geojson nicht gefunden (Status " + res.status + ")");
  return await res.json();
}

function normalizeName(s){
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove accents
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")         // unify separators
    .replace(/\s+/g, " ")
    .trim();
}

function getSchlagNameFromFeature(feat){
  const p = feat?.properties || {};
  return p.sl_name ?? p.SL_NAME ?? p.schlag ?? p.SCHLAG ?? p.name ?? p.NAME ?? "";
}

function initMapOnce() {
  if (MAP) return;
  MAP = L.map("map", { preferCanvas: true });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap"
  }).addTo(MAP);
  MAP.setView([53.2, 9.0], 11); // fallback
}

function computeCounts(rows){
  // Build normalized count + representative Excel name
  const counts = new Map();      // norm -> count
  const repName = new Map();     // norm -> original Excel name
  for (const r of rows){
    const raw = String(r["Schlag"] ?? "").trim();
    if (!raw) continue;
    const n = normalizeName(raw);
    counts.set(n, (counts.get(n) || 0) + 1);
    if (!repName.has(n)) repName.set(n, raw);
  }
  return { counts, repName };
}

function updateMap(rows){
  if (!MAP || !GEO) return;

  const { counts, repName } = computeCounts(rows);

  const y = yearSel.value, f = firmaSel.value, fr = fruchtSel.value;
  const strict = !!(y && f && fr);

  if (LAYER) { LAYER.remove(); LAYER = null; }

  const feats = (GEO.features || []);

  const features = feats.filter(feat => {
    const s = String(getSchlagNameFromFeature(feat) ?? "").trim();
    if (!s) return false;
    if (!strict) return true;
    const n = normalizeName(s);
    return counts.has(n);
  });

  const shown = new Set(features.map(feat => normalizeName(getSchlagNameFromFeature(feat))));
  const maxCnt = Math.max(1, ...Array.from(counts.values()));

  function style(feat){
    const s = String(getSchlagNameFromFeature(feat)).trim();
    const n = normalizeName(s);
    const c = counts.get(n) || 0;
    const w = 1 + (c > 0 ? 2 : 0);
    return {
      weight: w,
      opacity: 0.9,
      fillOpacity: c > 0 ? Math.min(0.65, 0.15 + (c / maxCnt) * 0.5) : 0.06
    };
  }

  function onEachFeature(feat, layer){
    const polyName = String(getSchlagNameFromFeature(feat)).trim();
    const n = normalizeName(polyName);
    const c = counts.get(n) || 0;
    layer.bindPopup(`<b>${polyName || "?"}</b><br/>Datensätze: ${c}`);
    layer.on("click", () => {
      if (!(yearSel.value && firmaSel.value && fruchtSel.value)) return;
      const excelName = repName.get(n) || polyName; // best effort
      const qs = new URLSearchParams({
        year: yearSel.value,
        firma: firmaSel.value,
        frucht: fruchtSel.value,
        schlag: excelName
      });
      window.location.href = `detail.html?${qs.toString()}`;
    });
  }

  LAYER = L.geoJSON({ type: "FeatureCollection", features }, { style, onEachFeature }).addTo(MAP);

  try{
    const b = LAYER.getBounds();
    if (b.isValid()) MAP.fitBounds(b.pad(0.15));
  }catch(e){}

  if (!strict){
    setMapHint("Hinweis: Wähle Erntejahr, Firma und Frucht – dann werden auf der Karte nur die passenden Schläge hervorgehoben und Klick öffnet die Detailseite.");
  } else {
    setMapHint(`Karte: ${shown.size} Schläge passend zur Auswahl.`);
  }
}

// Hook into existing logic: whenever the Schlagliste neu gerendert wird, update the map too
const _oldRenderSchlaege = renderSchlaege;
renderSchlaege = function(){
  _oldRenderSchlaege();
  updateMap(filterRows());
};

(async () => {
  try{
    initMapOnce();
    GEO = await loadGeo();
    updateMap(filterRows());
  }catch(e){
    initMapOnce();
    setMapHint("Karte konnte nicht geladen werden: " + (e?.message || e));
  }
})();
