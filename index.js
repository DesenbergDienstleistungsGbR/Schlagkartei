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
