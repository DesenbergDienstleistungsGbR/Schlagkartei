import { requireAuth, logout } from "./auth.js";

requireAuth();

// Planung wird clientseitig gespeichert (localStorage) und kann als JSON exportiert/importiert werden.
// Struktur:
// {
//   "2026": { "<field_key>": "Weizen", ... },
//   "2025": { ... }
// }
const PLAN_KEY = "schlagkartei_plan_v1";

const selYear = document.getElementById("selYear");
const selPlanCrop = document.getElementById("selPlanCrop");
const btnApply = document.getElementById("btnApply");
const btnClearSel = document.getElementById("btnClearSel");
const btnExportPlan = document.getElementById("btnExportPlan");
const btnImportPlan = document.getElementById("btnImportPlan");
const fileImportPlan = document.getElementById("fileImportPlan");
const btnExportGeo = document.getElementById("btnExportGeo");
const btnExportGeoAll = document.getElementById("btnExportGeoAll");
const missExcelList = document.getElementById("missExcelList");
const missGeoList = document.getElementById("missGeoList");
const missExcelCount = document.getElementById("missExcelCount");
const missGeoCount = document.getElementById("missGeoCount");
const selList = document.getElementById("selList");
const statusEl = document.getElementById("status");
const kpiSel = document.getElementById("kpiSel");
const kpiPlanned = document.getElementById("kpiPlanned");

document.getElementById("btnLogout").onclick = () => logout();

let DATA = [];
let GEO = null;

let map, geoLayer;

// Auswahl verwalten (fieldKey)
const selected = new Set();

function normalizeName(s) {
  // robuste Normalisierung (sollte zu sl_name_norm passen)
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== "")))
    .sort((a, b) => String(a).localeCompare(String(b), "de"));
}

function setOptions(sel, values, firstLabel = null, firstValue = null) {
  sel.innerHTML = "";
  if (firstLabel !== null) {
    const o0 = document.createElement("option");
    o0.textContent = firstLabel;
    o0.value = firstValue;
    sel.appendChild(o0);
  }
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = String(v);
    sel.appendChild(opt);
  }
}

function loadPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function savePlan(plan) {
  localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
}

function getPlanForYear(plan, year) {
  const y = String(year);
  if (!plan[y] || typeof plan[y] !== "object") plan[y] = {};
  return plan[y];
}

function downloadText(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function featureName(ft) {
  return ft?.properties?.sl_name || ft?.properties?.name || "";
}

function featureKey(ft) {
  return (
    ft?.properties?.sl_name_norm ||
    ft?.properties?.name_norm ||
    normalizeName(featureName(ft))
  );
}

function refreshKpis() {
  kpiSel.textContent = String(selected.size);
  const year = selYear.value;
  const plan = loadPlan();
  const yPlan = plan[String(year)] || {};
  let planned = 0;
  for (const k of Object.keys(yPlan)) {
    if (String(yPlan[k] ?? "").trim()) planned++;
  }
  kpiPlanned.textContent = String(planned);
}

function refreshSelectionList() {
  selList.innerHTML = "";
  const year = selYear.value;
  const plan = loadPlan();
  const yPlan = plan[String(year)] || {};

  const items = Array.from(selected);
  items.sort((a, b) => a.localeCompare(b, "de"));

  for (const key of items) {
    const name = keyToDisplayName(key) || key;
    const crop = yPlan[key] ? ` • <span class="badge">${escapeHtml(String(yPlan[key]))}</span>` : "";
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<div><b>${escapeHtml(name)}</b>${crop}</div><div class="small">Key: ${escapeHtml(key)}</div>`;
    div.onclick = () => {
      selected.delete(key);
      refreshUI();
    };
    selList.appendChild(div);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Map key -> Anzeige-Name (erstellt beim Laden)
const keyToName = new Map();
function keyToDisplayName(key) {
  return keyToName.get(key) || "";
}

function refreshMapStyles() {
  if (!geoLayer) return;
  geoLayer.eachLayer(layer => {
    const key = featureKey(layer.feature);
    const isSel = selected.has(key);
    layer.setStyle({
      weight: isSel ? 3 : 1,
      fillOpacity: isSel ? 0.55 : 0.15,
      opacity: isSel ? 1.0 : 0.6,
    });
  });
}

function refreshUI() {
  refreshSelectionList();
  refreshMapStyles();
  refreshKpis();
}

function initMap() {
  map = L.map("map");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  geoLayer = L.geoJSON(GEO, {
    style: { weight: 1, fillOpacity: 0.15 },
    onEachFeature: (feature, layer) => {
      const name = featureName(feature);
      const key = featureKey(feature);
      if (name && key && !keyToName.has(key)) keyToName.set(key, String(name));

      layer.bindTooltip(String(name), { sticky: true });
      layer.on("click", () => {
        if (!key) return;
        if (selected.has(key)) selected.delete(key);
        else selected.add(key);
        refreshUI();
      });
    },
  }).addTo(map);

  try {
    map.fitBounds(geoLayer.getBounds(), { padding: [20, 20] });
  } catch {}
}

async function loadData() {
  const r = await fetch("./data.json", { cache: "no-store" });
  DATA = await r.json();
}

async function loadGeo() {
  const r = await fetch("./schlaege.geojson", { cache: "no-store" });
  GEO = await r.json();
}

function buildDropdowns() {
  const years = uniqSorted(DATA.map(r => r["E_Jahr"]))
    .sort((a, b) => Number(a) - Number(b));
  setOptions(selYear, years);
  if (years.length) selYear.value = String(years[0]);

  const crops = uniqSorted(DATA.map(r => r["Frucht"]));
  setOptions(selPlanCrop, crops, "– bitte wählen –", "");
}

btnApply.onclick = () => {
  const year = selYear.value;
  const crop = selPlanCrop.value;
  if (!year) return;
  if (!crop) {
    statusEl.textContent = "Bitte zuerst eine geplante Frucht auswählen.";
    return;
  }
  if (!selected.size) {
    statusEl.textContent = "Bitte zuerst Schläge auf der Karte auswählen.";
    return;
  }

  const plan = loadPlan();
  const yPlan = getPlanForYear(plan, year);
  for (const key of selected) yPlan[key] = crop;
  savePlan(plan);
  statusEl.textContent = `Gespeichert: ${selected.size} Schlag/Schläge → ${crop} (${year})`;
  refreshUI();
};

btnClearSel.onclick = () => {
  selected.clear();
  refreshUI();
};

selYear.onchange = () => {
  // Auswahl bleibt bewusst bestehen (damit man schnell mehrere Jahre bearbeiten kann),
  // aber Anzeige der Zuordnung ändert sich.
  refreshUI();
};

btnExportPlan.onclick = () => {
  const plan = loadPlan();
  downloadText("planung.json", JSON.stringify(plan, null, 2));
};

btnImportPlan.onclick = () => fileImportPlan.click();

fileImportPlan.onchange = async () => {
  const f = fileImportPlan.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== "object") throw new Error("Ungültiges JSON");
    savePlan(obj);
    statusEl.textContent = "Planung importiert.";
    refreshUI();
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Import fehlgeschlagen (kein gültiges JSON).";
  } finally {
    fileImportPlan.value = "";
  }
};

btnExportGeo.onclick = () => {
  const year = selYear.value;
  if (!year) return;
  const plan = loadPlan();
  const yPlan = plan[String(year)] || {};

  // Deep copy (damit wir nicht die laufende GEO-Referenz mutieren)
  const out = JSON.parse(JSON.stringify(GEO));
  for (const ft of out.features || []) {
    const key = featureKey(ft);
    const crop = yPlan[key];
    if (!ft.properties) ft.properties = {};
    // Jahres-spezifisches Feld (mehrere Jahre in einer GeoJSON möglich)
    ft.properties[`plan_${year}`] = crop || "";
  }
  downloadText(`schlaege_plan_${year}.geojson`, JSON.stringify(out));
};

btnExportGeoAll.onclick = () => {
  const plan = loadPlan();
  const years = Object.keys(plan).filter(y => plan[y] && typeof plan[y] === "object");
  if (!years.length) {
    statusEl.textContent = "Keine Planung vorhanden (localStorage leer).";
    return;
  }

  const out = JSON.parse(JSON.stringify(GEO));
  for (const ft of out.features || []) {
    const key = featureKey(ft);
    if (!ft.properties) ft.properties = {};
    for (const y of years) {
      const crop = (plan[y] || {})[key] || "";
      ft.properties[`plan_${y}`] = crop;
    }
  }
  downloadText(`schlaege_plan_alle_jahre.geojson`, JSON.stringify(out));
};

async function main() {
  try {
    await loadData();
    await loadGeo();
    buildDropdowns();
    initMap();
    refreshUI();
    statusEl.textContent = "Tipp: Mehrere Polygone anklicken, dann oben Frucht wählen → Zuordnen.";
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Daten konnten nicht geladen werden.";
  }
}

main();
function renderMismatch() {
  if (!GEO || !GEO.features || !Array.isArray(DATA)) return;

  const excelKeys = new Set(DATA.map(r => normalizeName(r["Schlag"])));
  const geoKeys = new Set((GEO.features || []).map(ft => featureKey(ft)));

  const missExcel = Array.from(excelKeys).filter(k => k && !geoKeys.has(k)).sort();
  const missGeo = Array.from(geoKeys).filter(k => k && !excelKeys.has(k)).sort();

  missExcelCount.textContent = String(missExcel.length);
  missGeoCount.textContent = String(missGeo.length);

  missExcelList.innerHTML = "";
  for (const k of missExcel.slice(0, 300)) {
    const li = document.createElement("li");
    li.textContent = k;
    missExcelList.appendChild(li);
  }
  if (missExcel.length > 300) {
    const li = document.createElement("li");
    li.textContent = `… (+${missExcel.length - 300} weitere)`;
    missExcelList.appendChild(li);
  }

  missGeoList.innerHTML = "";
  for (const k of missGeo.slice(0, 300)) {
    const li = document.createElement("li");
    li.textContent = k;
    missGeoList.appendChild(li);
  }
  if (missGeo.length > 300) {
    const li = document.createElement("li");
    li.textContent = `… (+${missGeo.length - 300} weitere)`;
    missGeoList.appendChild(li);
  }
}


