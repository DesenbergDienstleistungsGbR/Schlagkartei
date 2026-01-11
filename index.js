// Schlagkartei – Startseite
// Reines HTML/CSS/JS – GitHub Pages kompatibel

const PLAN_KEY = "schlagkartei_plan_v1";

const selYear = document.getElementById("selYear");
const selCrop = document.getElementById("selCrop");
const selFirm = document.getElementById("selFirm");
const selPlanned = document.getElementById("selPlanned");
const fieldList = document.getElementById("fieldList");
const kpiCount = document.getElementById("kpiCount");
const kpiHa = document.getElementById("kpiHa");
const btnToggleAll = document.getElementById("btnToggleAll");

const ALL_FIRMS_VALUE = "__ALL_FIRMS__";
const ALL_CROPS_VALUE = "__ALL_CROPS__";
const ALL_PLANNED_VALUE = "__ALL_PLANNED__";
const NONE_PLANNED_VALUE = "__NONE_PLANNED__";

let DATA = [];   // rows from data.json
let GEO = null;  // geojson
let map = null;
let geoLayer = null;
let popupLayer = null;
let showAllPopups = false;

// ---------- helpers ----------
function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
}

function fmt2(x) {
  const n = Number(x);
  if (!isFinite(n)) return "";
  return n.toFixed(2);
}

function loadPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === "object") ? obj : {};
  } catch {
    return {};
  }
}

function getPlannedCropFor(fieldName, year) {
  if (!year) return "";
  const plan = loadPlan();
  const y = plan[String(year)] || {};
  const key = normalizeName(fieldName);
  return y[key] || "";
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== "")))
    .map(v => String(v))
    .sort((a, b) => a.localeCompare(b, "de"));
}

function setOptionsWithFirst(sel, values, firstLabel, firstValue) {
  sel.innerHTML = "";
  const o0 = document.createElement("option");
  o0.textContent = firstLabel;
  o0.value = firstValue;
  sel.appendChild(o0);
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = String(v);
    sel.appendChild(opt);
  }
}

function getCurrentFilters() {
  const year = selYear.value ? Number(selYear.value) : null;
  const crop = selCrop.value === ALL_CROPS_VALUE ? "" : selCrop.value;
  const firm = selFirm.value === ALL_FIRMS_VALUE ? "" : selFirm.value;
  const planned = selPlanned.value || ALL_PLANNED_VALUE;
  return { year, crop, firm, planned };
}

// ---------- data loading ----------
async function loadDataFromJson() {
  const resp = await fetch("data.json", { cache: "no-store" });
  if (!resp.ok) throw new Error("Konnte data.json nicht laden");
  DATA = await resp.json();
}

async function loadGeoJson() {
  const resp = await fetch("schlaege.geojson", { cache: "no-store" });
  if (!resp.ok) throw new Error("Konnte schlaege.geojson nicht laden");
  GEO = await resp.json();
}

function buildDropdowns() {
  const years = uniqueSorted(DATA.map(r => r["Erntejahr"]));
  // years descending
  years.sort((a,b) => Number(b) - Number(a));
  setOptionsWithFirst(selYear, years, "Erntejahr wählen", "");

  setOptionsWithFirst(selFirm, uniqueSorted(DATA.map(r => r["Firma"])), "Alle Firmen", ALL_FIRMS_VALUE);
  setOptionsWithFirst(selCrop, uniqueSorted(DATA.map(r => r["Frucht"])), "Alle Früchte", ALL_CROPS_VALUE);

  // planned filter: built from all crops, plus "ohne"
  selPlanned.innerHTML = "";
  const oAll = document.createElement("option");
  oAll.value = ALL_PLANNED_VALUE;
  oAll.textContent = "Alle (Planung)";
  selPlanned.appendChild(oAll);

  const oNone = document.createElement("option");
  oNone.value = NONE_PLANNED_VALUE;
  oNone.textContent = "Nur ohne Planung";
  selPlanned.appendChild(oNone);

  for (const c of uniqueSorted(DATA.map(r => r["Frucht"]))) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    selPlanned.appendChild(opt);
  }

  // Defaults
  if (years.length) selYear.value = String(years[0]);
  selFirm.value = ALL_FIRMS_VALUE;
  selCrop.value = ALL_CROPS_VALUE;
  selPlanned.value = ALL_PLANNED_VALUE;
}

function filteredData() {
  const { year, crop, firm } = getCurrentFilters();
  return DATA.filter(r => {
    if (year !== null && Number(r["Erntejahr"]) !== year) return false;
    if (crop && String(r["Frucht"]) !== crop) return false;
    if (firm && String(r["Firma"]) !== firm) return false;
    return true;
  });
}

function fieldsFromData(rows) {
  const m = new Map();
  for (const r of rows) {
    const name = String(r["Schlag"] || "").trim();
    if (!name) continue;
    const cur = m.get(name) || { name, count: 0 };
    cur.count += 1;
    m.set(name, cur);
  }
  return Array.from(m.values()).sort((a,b) => a.name.localeCompare(b.name, "de"));
}

function calcAreaHaForField(fieldName) {
  if (!GEO?.features?.length) return null;
  const key = normalizeName(fieldName);

  let sum = 0;
  let ok = false;

  for (const ft of GEO.features) {
    const p = ft.properties || {};
    const k = p.sl_name_norm ? String(p.sl_name_norm) : normalizeName(p.sl_name || p.name || "");
    if (k !== key) continue;
    const a = p.area_ha;
    if (typeof a === "number" && isFinite(a)) { sum += a; ok = true; }
  }
  return ok ? sum : null;
}

// ---------- planning colors ----------
const PALETTE = [
  "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173"
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

function colorForPlannedCrop(plannedCrop) {
  if (!plannedCrop) return "#cfcfcf";
  const idx = hashString(String(plannedCrop)) % PALETTE.length;
  return PALETTE[idx];
}

// ---------- UI rendering ----------
function renderFieldList(fields, year) {
  fieldList.innerHTML = "";
  for (const f of fields) {
    const ha = calcAreaHaForField(f.name);
    const plan = getPlannedCropFor(f.name, year);
    const color = colorForPlannedCrop(plan);

    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center; justify-content:space-between;">
        <div><b>${f.name}</b></div>
        <div class="chip" style="background:${color};">${plan ? plan : "—"}</div>
      </div>
      <div class="small">
        ${f.count} Datensätze
        ${ha !== null ? " • " + fmt2(ha) + " ha" : " • Fläche fehlt"}
      </div>
    `;
    div.onclick = () => {
      const { year, firm, crop } = getCurrentFilters();
      const params = new URLSearchParams();
      if (year !== null) params.set("year", String(year));
      if (firm) params.set("firm", firm);
      if (crop) params.set("crop", crop);
      params.set("field", f.name);
      window.location.href = "detail.html?" + params.toString();
    };
    fieldList.appendChild(div);
  }
}

function updateKPIs(fields) {
  kpiCount.textContent = String(fields.length);

  let sum = 0;
  let ok = false;
  for (const f of fields) {
    const ha = calcAreaHaForField(f.name);
    if (typeof ha === "number" && isFinite(ha)) { sum += ha; ok = true; }
  }
  kpiHa.textContent = ok ? sum.toFixed(2) : "0.00";
}

function refreshUI() {
  const { year, planned } = getCurrentFilters();
  const rows = filteredData();
  let fields = fieldsFromData(rows);

  // Planung-Filter auf Feldebene anwenden
  if (planned && planned !== ALL_PLANNED_VALUE) {
    if (planned === NONE_PLANNED_VALUE) {
      fields = fields.filter(f => !getPlannedCropFor(f.name, year));
    } else {
      fields = fields.filter(f => getPlannedCropFor(f.name, year) === planned);
    }
  }

  renderFieldList(fields, year);
  updateKPIs(fields);
  refreshMap(fields, year);
}

// ---------- leaflet map ----------
function initMap() {
  map = L.map("map");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  popupLayer = L.layerGroup().addTo(map);

  geoLayer = L.geoJSON(GEO, {
    style: () => ({
      color: "#2b2b2b",
      weight: 1,
      fillOpacity: 0.15,
      opacity: 0.35,
      fillColor: "#cfcfcf"
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const name = p.sl_name || p.name || "";
      layer.on("click", () => {
        const { year, firm, crop } = getCurrentFilters();
        const params = new URLSearchParams();
        if (year !== null) params.set("year", String(year));
        if (firm) params.set("firm", firm);
        if (crop) params.set("crop", crop);
        params.set("field", String(name));
        window.location.href = "detail.html?" + params.toString();
      });
      if (name) layer.bindTooltip(String(name), { sticky: true });
    }
  }).addTo(map);

  // initial view
  try {
    map.fitBounds(geoLayer.getBounds(), { padding: [12, 12] });
  } catch {}
}

function refreshMap(fields, year) {
  if (!geoLayer) return;

  // Active keys are normalized names of fields that are currently in list
  const activeKeys = new Set(fields.map(f => normalizeName(f.name)));

  popupLayer.clearLayers();

  geoLayer.eachLayer(layer => {
    const p = layer.feature?.properties || {};
    const name = String(p.sl_name || p.name || "");
    const key = p.sl_name_norm ? String(p.sl_name_norm) : normalizeName(name);
    const isActive = activeKeys.has(key);

    const plan = getPlannedCropFor(name, year);
    const fillColor = colorForPlannedCrop(plan);

    layer.setStyle({
      fillColor: fillColor,
      fillOpacity: isActive ? 0.55 : 0.08,
      opacity: isActive ? 0.9 : 0.25,
      weight: isActive ? 1.5 : 1.0
    });

    if (showAllPopups && layer.getBounds) {
      const center = layer.getBounds().getCenter();
      const lbl = p.sl_name || p.name || "";
      if (lbl) {
        L.marker(center, { opacity: 0.0 })
          .bindTooltip(String(lbl), { permanent: true, direction: "center", className: "badge" })
          .addTo(popupLayer)
          .openTooltip();
      }
    }
  });
}

// ---------- events ----------
function wireEvents() {
  selYear.addEventListener("change", refreshUI);
  selCrop.addEventListener("change", refreshUI);
  selFirm.addEventListener("change", refreshUI);
  selPlanned.addEventListener("change", refreshUI);

  btnToggleAll?.addEventListener("click", () => {
    showAllPopups = !showAllPopups;
    refreshUI();
  });

  // cross-tab plan changes
  window.addEventListener("storage", (e) => {
    if (e.key === PLAN_KEY) refreshUI();
  });
}

// ---------- optional: excel import (existing UI) ----------
function setupExcelImport() {
  const fileInput = document.getElementById("excelFile");
  const btnParse = document.getElementById("btnParseExcel");
  const btnDownload = document.getElementById("btnDownloadJson");
  const importStatus = document.getElementById("importStatus");

  if (!fileInput || !btnParse || !btnDownload) return;

  // If the original project already shipped a XLSX import, keep it.
  // Here we only show a hint if not present (no hard dependency).
  try {
    if (typeof XLSX === "undefined") {
      importStatus.textContent = "Hinweis: XLSX-Library nicht geladen – Excel-Import ist deaktiviert.";
      btnParse.disabled = true;
      btnDownload.disabled = true;
      return;
    }
  } catch {}

  let parsed = null;

  btnParse.onclick = async () => {
    const f = fileInput.files?.[0];
    if (!f) { importStatus.textContent = "Bitte Excel-Datei wählen."; return; }
    importStatus.textContent = "Lese Excel…";

    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    parsed = rows;
    importStatus.textContent = `Gelesen: ${rows.length} Zeilen. (Hinweis: Export-Rundung/Mapping bitte wie im bestehenden Import umsetzen.)`;
    btnDownload.disabled = false;
  };

  btnDownload.onclick = () => {
    if (!parsed) return;
    const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.json";
    a.click();
  };
}

async function init() {
  requireAuth();
  await loadDataFromJson();
  await loadGeoJson();
  buildDropdowns();
  wireEvents();
  initMap();
  setupExcelImport();
  refreshUI();
}

init();
