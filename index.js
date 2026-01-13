
import { requireAuth, logout } from "./auth.js";

const ALL_FIRMS_VALUE = "__ALL__";
const ALL_CROPS_VALUE = "__ALL__";
const PLAN_KEY = "schlagkartei_plan_v1";
const ALL_PLANNED_VALUE = "__ALL__";
const NONE_PLANNED_VALUE = "__NONE__";


let DATA = [];
let PLAN_JSON = null; // aus anbau_plan.json
let PLAN_BY_YEAR = new Map(); // year(string)-> Map(normLabel->crop)

let GEO = null;

const selYear = document.getElementById("selYear");
const selFirm = document.getElementById("selFirm");
const selCrop = document.getElementById("selCrop");
const selPlanned = document.getElementById("selPlanned");
const fieldList = document.getElementById("fieldList");
const kpiCount = document.getElementById("kpiCount");
const kpiHa = document.getElementById("kpiHa");
const statusEl = document.getElementById("status");
const btnToggleAll = document.getElementById("btnToggleAll");

document.getElementById("btnLogout").onclick = () => logout();


function normalizeName(s) {
  // Robust für Matching (Umlaute, Sonderzeichen, Leerzeichen)
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
}

function loadPlan() {
  // Kompatibilität: früher localStorage. Jetzt primär aus anbau_plan.json.
  // Wenn PLAN_JSON nicht geladen wurde, fällt das System auf 'keine Planung' zurück.
}

function getPlannedCropFor(fieldLabel, year) {
  const y = String(year ?? selYear.value ?? "");
  const m = PLAN_BY_YEAR.get(y);
  if (!m) return "";
  return m.get(normalizeName(fieldLabel)) || "";
}

function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== "")))
    .sort((a,b)=> String(a).localeCompare(String(b), "de"));
}

function setOptions(sel, values) {
  sel.innerHTML = "";
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = String(v);
    sel.appendChild(opt);
  }
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
  const firm = selFirm.value || ALL_FIRMS_VALUE;
  const crop = selCrop.value || ALL_CROPS_VALUE;
    const planned = selPlanned.value || ALL_PLANNED_VALUE;
  return { year, firm, crop, planned };
}

function filteredData() {
  const { year, firm, crop } = getCurrentFilters();
  return DATA.filter(r => {
    if (year !== null && Number(r["E_Jahr"]) !== year) return false;
    if (firm !== ALL_FIRMS_VALUE && String(r["Firma"]) !== firm) return false;
    if (crop !== ALL_CROPS_VALUE && String(r["Frucht"]) !== crop) return false;
    return true;
  });
}

function fieldsFromData(rows) {
  const map = new Map();
  for (const r of rows) {
    const s = String(r["Schlag"] ?? "").trim();
    if (!s) continue;
    if (!map.has(s)) map.set(s, { name: s, count: 0 });
    map.get(s).count++;
  }
  return Array.from(map.values()).sort((a,b)=>a.name.localeCompare(b.name,"de"));
}

let map, geoLayer, popupLayer;
let showAllPopups = false;


// --- Flächenberechnung aus GeoJSON (WGS84) ---
// Fallback, wenn properties.area_ha fehlt.
// Berechnet geodätische Fläche auf Kugel (nahe genug für Feldgrößen).
const _EARTH_RADIUS = 6378137; // Meter (WGS84)

function _ringAreaMeters2(coords) {
  // coords: [[lng,lat], ...] (geschlossen oder offen)
  if (!coords || coords.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const p1 = coords[i];
    const p2 = coords[j];
    const lon1 = (p1[0] * Math.PI) / 180;
    const lon2 = (p2[0] * Math.PI) / 180;
    const lat1 = (p1[1] * Math.PI) / 180;
    const lat2 = (p2[1] * Math.PI) / 180;
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = (area * _EARTH_RADIUS * _EARTH_RADIUS) / 2;
  return Math.abs(area);
}

function _polygonAreaMeters2(polyCoords) {
  // polyCoords: [outerRing, holeRing1, ...]
  if (!polyCoords || !polyCoords.length) return 0;
  let area = _ringAreaMeters2(polyCoords[0]);
  for (let i = 1; i < polyCoords.length; i++) area -= _ringAreaMeters2(polyCoords[i]);
  return Math.max(0, area);
}

function geojsonAreaHa(geometry) {
  if (!geometry) return null;
  const t = geometry.type;
  let m2 = 0;

  if (t === "Polygon") {
    m2 = _polygonAreaMeters2(geometry.coordinates);
  } else if (t === "MultiPolygon") {
    for (const poly of geometry.coordinates) m2 += _polygonAreaMeters2(poly);
  } else {
    return null;
  }
  return m2 / 10000; // ha
}

function calcAreaHaForField(fieldName) {
  if (!GEO || !GEO.features) return null;
  const key = normalizeName(fieldName);

  const feats = GEO.features.filter(ft => {
    const p = ft.properties || {};
    const k = p.sl_name_norm ? String(p.sl_name_norm) : normalizeName(p.sl_name || p.name || "");
    return k === key;
  });
  if (!feats.length) return null;

  // Sum area_ha if present, sonst aus Polygon berechnen
  let sum = 0;
  let ok = false;

  for (const ft of feats) {
    const a = ft.properties?.area_ha;
    if (typeof a === "number" && isFinite(a)) { sum += a; ok = true; }
    else {
      const ha = geojsonAreaHa(ft.geometry);
      if (typeof ha === "number" && isFinite(ha)) { sum += ha; ok = true; }
    }
  }
  return ok ? sum : null;
}

function updateKpis(fields) {
  kpiCount.textContent = String(fields.length);
  let sum = 0;
  let ok = false;
  for (const f of fields) {
    const ha = calcAreaHaForField(f.name);
    if (ha !== null) { sum += ha; ok = true; }
  }
  kpiHa.textContent = ok ? sum.toFixed(2) : "0.00";
}

function renderFieldList(fields, year) {
  fieldList.innerHTML = "";
  for (const f of fields) {
    const ha = calcAreaHaForField(f.name);
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <div><b>${f.name}</b></div>
      <div class="small">${f.count} Datensätze ${ha !== null ? "• " + ha.toFixed(2) + " ha" : ""}${(() => { const p = getPlannedCropFor(f.name, year); return p ? " • Plan: " + p : ""; })()}</div>
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

function refreshUI() {
  const { year, planned } = getCurrentFilters();
  const rows = filteredData();
  let fields = fieldsFromData(rows);

  // Planung-Filter auf Feldebene anwenden
  if (planned && planned !== ALL_PLANNED_VALUE) {
    fields = fields.filter(f => {
      const p = getPlannedCropFor(f.name, year);
      if (planned === NONE_PLANNED_VALUE) return !p;
      return p === planned;
    });
  }

  renderFieldList(fields, year);
  updateKpis(fields);
  updateMap(fields.map(x=>x.name));
}

function buildDropdowns() {
  const years = (PLAN_JSON?.years && Array.isArray(PLAN_JSON.years) && PLAN_JSON.years.length)
    ? [...PLAN_JSON.years].sort((a,b)=>Number(a)-Number(b))
    : uniqSorted(DATA.map(r => r["E_Jahr"])).sort((a,b)=>Number(a)-Number(b));
  setOptions(selYear, years);

  // Firma & Frucht initial
  setOptionsWithFirst(selFirm, uniqSorted(DATA.map(r => r["Firma"])), "Alle Firmen", ALL_FIRMS_VALUE);
  setOptionsWithFirst(selCrop, uniqSorted(DATA.map(r => r["Frucht"])), "Alle Früchte", ALL_CROPS_VALUE);

  // Geplante Frucht: (Alle) / (ohne Planung) / konkrete Frucht
  const cropsForPlan = (PLAN_JSON?.crops && Array.isArray(PLAN_JSON.crops) && PLAN_JSON.crops.length)
    ? [...PLAN_JSON.crops]
    : uniqSorted(DATA.map(r => r["Frucht"]));
  setOptionsWithFirst(selPlanned, cropsForPlan, "Alle (Planung)", ALL_PLANNED_VALUE);
  const optNone = document.createElement("option");
  optNone.value = NONE_PLANNED_VALUE;
  optNone.textContent = "Nur ohne Planung";
  selPlanned.appendChild(optNone);

  // Default: first year
  if (years.length) selYear.value = String(years[0]);
  selFirm.value = ALL_FIRMS_VALUE;
  selCrop.value = ALL_CROPS_VALUE;
  selPlanned.value = ALL_PLANNED_VALUE;
}

function initMap() {
  map = L.map("map");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  popupLayer = L.layerGroup().addTo(map);

  fetch("./schlaege.geojson")
    .then(r => r.json())
    .then(g => {
      GEO = g;
      geoLayer = L.geoJSON(GEO, {
        style: { weight: 1, fillOpacity: 0.25 },
        onEachFeature: (feature, layer) => {
          const name = feature?.properties?.sl_name || feature?.properties?.name || "";
          layer.bindTooltip(String(name), { sticky: true });
          layer.on("click", () => {
            if (name) {
              const { year, firm, crop } = getCurrentFilters();
              const params = new URLSearchParams();
              if (year !== null) params.set("year", String(year));
              if (firm) params.set("firm", firm);
              if (crop) params.set("crop", crop);
              params.set("field", name);
              window.location.href = "detail.html?" + params.toString();
            }
          });
        }
      }).addTo(map);

      try { map.fitBounds(geoLayer.getBounds(), { padding:[20,20] }); } catch {}
      refreshUI();
    })
    .catch(err => {
      console.error(err);
      statusEl.textContent = "GeoJSON konnte nicht geladen werden.";
    });

  btnToggleAll.onclick = () => {
    showAllPopups = !showAllPopups;
    refreshUI();
  };
}

function updateMap(activeFieldNames) {
  if (!geoLayer || !GEO) return;
  const active = new Set(activeFieldNames.map(s => String(s).toLowerCase()));
  popupLayer.clearLayers();

  geoLayer.eachLayer(layer => {
    const name = String(layer.feature?.properties?.sl_name || "").toLowerCase();
    const isOn = active.has(name);
    layer.setStyle({ fillOpacity: isOn ? 0.45 : 0.05, opacity: isOn ? 1.0 : 0.3 });

    if (showAllPopups && layer.getBounds) {
      const c = layer.getBounds().getCenter();
      L.marker(c, { opacity: 0.0 }).bindTooltip(layer.feature?.properties?.sl_name || "", { permanent:true, direction:"center", className:"badge" })
        .addTo(popupLayer)
        .openTooltip();
    }
  });
}

async function loadDataFromJson() {
  const r = await fetch("./data.json", { cache: "no-store" });
  DATA = await r.json();
}

async function loadPlanFromJson() {
  try {
    const r = await fetch("./anbau_plan.json", { cache: "no-store" });
    PLAN_JSON = await r.json();
    PLAN_BY_YEAR = new Map();
    const planObj = PLAN_JSON?.plan || {};
    for (const [y, arr] of Object.entries(planObj)) {
      const m = new Map();
      for (const u of (arr || [])) {
        const k = normalizeName(u?.label);
        if (k) m.set(k, String(u?.crop || ""));
      }
      PLAN_BY_YEAR.set(String(y), m);
    }
  } catch (e) {
    console.warn("anbau_plan.json konnte nicht geladen werden.", e);
    PLAN_JSON = null;
    PLAN_BY_YEAR = new Map();
  }
}

function wireEvents() {
  selYear.onchange = () => refreshUI();
  selFirm.onchange = () => refreshUI();
  selCrop.onchange = () => refreshUI();
  selPlanned.onchange = () => refreshUI();
}

function setupExcelImport() {
  const inp = document.getElementById("excelFile");
  const msg = document.getElementById("importMsg");
  let lastJson = null;

  document.getElementById("btnUseExcel").onclick = async () => {
    const f = inp.files?.[0];
    if (!f) { msg.textContent = "Bitte Excel auswählen."; return; }
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    // Runde Werte
    const roundKeys = ["Menge/ha","gesN ha","NH4 ha","P ha","K ha","S pro ha"];
    for (const r of rows) {
      for (const k of roundKeys) {
        if (r[k] !== null && r[k] !== undefined && r[k] !== "") {
          const n = Number(r[k]);
          r[k] = Number.isFinite(n) ? Math.round(n*100)/100 : null;
        }
      }
    }
    DATA = rows;
    lastJson = JSON.stringify(DATA, null, 0);
    msg.textContent = `Excel geladen: ${rows.length} Datensätze.`;
    buildDropdowns();
    refreshUI();
  };

  document.getElementById("btnDownloadJson").onclick = () => {
    const txt = lastJson || JSON.stringify(DATA, null, 0);
    const blob = new Blob([txt], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.json";
    a.click();
  };
}

async function init() {
  await requireAuth();
  await loadDataFromJson();
  await loadPlanFromJson();
  buildDropdowns();
  wireEvents();
  initMap();
  setupExcelImport();
  refreshUI();
}

init();
