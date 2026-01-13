import { requireAuth, logout } from "./auth_v3.js";

let PLAN = null;
let GEO = null;
let map = null;
let geoLayer = null;
let selectedKeys = new Set();

const selYear = document.getElementById("selYear");
const selCrop = document.getElementById("selPlanCrop");
const btnAssign = document.getElementById("btnAssign") || document.getElementById("btnApply");
const btnExport = document.getElementById("btnExportPlan");
const btnImport = document.getElementById("btnImportPlan");
const fileImport = document.getElementById("fileImportPlan");
const listEl = document.getElementById("planList");
const infoEl = document.getElementById("planInfo");
const btnLogout = document.getElementById("btnLogout");
const btnClearSel = document.getElementById("btnClearSel");
const chipSelected = document.getElementById("chipSelected");
const chipPlanned = document.getElementById("chipPlanned");
const chipGeoMissing = document.getElementById("chipGeoMissing");
const geoMissingListEl = document.getElementById("geoMissingList");
const btnDownloadGeoWithArea = document.getElementById("btnDownloadGeoWithArea");


// --- Flächenberechnung aus GeoJSON (WGS84) ---
const _EARTH_RADIUS = 6378137; // Meter (WGS84)

function _ringAreaMeters2(coords) {
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
  return m2 / 10000;
}

function normalizeName(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/[^a-z0-9]+/g,"");
}

function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== "").map(v => String(v).trim())))
    .sort((a,b)=>a.localeCompare(b,"de"));
}

async function loadPlan() {
  const r = await fetch("./anbau_plan.json", { cache: "no-store" });
  PLAN = await r.json();
  if (!PLAN.plan) PLAN.plan = {};
  if (!Array.isArray(PLAN.years)) PLAN.years = Object.keys(PLAN.plan).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!Array.isArray(PLAN.crops)) {
    const crops = [];
    for (const arr of Object.values(PLAN.plan)) for (const u of (arr||[])) crops.push(u?.crop);
    PLAN.crops = uniqSorted(crops);
  }
}

async function loadGeo() {
  const r = await fetch("./schlaege.geojson", { cache: "no-store" });
  GEO = await r.json();
}

function setOptions(selectEl, values, firstLabel=null, firstValue="") {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  if (firstLabel !== null) {
    const o = document.createElement("option");
    o.value = firstValue;
    o.textContent = firstLabel;
    selectEl.appendChild(o);
  }
  for (const v of values) {
    const o = document.createElement("option");
    o.value = String(v);
    o.textContent = String(v);
    selectEl.appendChild(o);
  }
}

function ensureYear(y) {
  const ys = new Set((PLAN.years||[]).map(n=>String(n)));
  if (!ys.has(String(y))) PLAN.years = [...(PLAN.years||[]), Number(y)].filter(Number.isFinite).sort((a,b)=>a-b);
  if (!PLAN.plan[String(y)]) PLAN.plan[String(y)] = [];
}

function getYearArr() {
  const y = String(selYear?.value || "");
  ensureYear(y);
  return PLAN.plan[y];
}

function getCropForLabel(label, year) {
  const y = String(year);
  const arr = PLAN.plan?.[y] || [];
  const k = normalizeName(label);
  const hit = arr.find(u => normalizeName(u?.label) === k);
  return hit?.crop || "";
}

function upsertEntry(label, crop) {
  const arr = getYearArr();
  const k = normalizeName(label);
  let hit = arr.find(u => normalizeName(u?.label) === k);
  if (!hit) {
    hit = { field_id: ("F" + k.slice(0,18)).toUpperCase(), label: label, crop: crop };
    arr.push(hit);
  } else {
    hit.crop = crop;
  }
}

function renderList() {
  const arr = getYearArr();
  const sorted = [...arr].sort((a,b)=>String(a.label).localeCompare(String(b.label),"de"));
  listEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const u of sorted) {
    const key = normalizeName(u.label);
    const row = document.createElement("div");
    row.className = "plan-row";
    row.innerHTML = `
      <label class="plan-row-inner">
        <input type="checkbox" ${selectedKeys.has(key) ? "checked": ""} data-key="${key}">
        <span class="plan-label">${u.label}</span>
        <span class="plan-crop">${u.crop || ""}</span>
      </label>
    `;
    frag.appendChild(row);
  }
  listEl.appendChild(frag);

  listEl.querySelectorAll("input[type=checkbox][data-key]").forEach(cb => {
    cb.onchange = () => {
      const k = cb.dataset.key;
      if (cb.checked) selectedKeys.add(k);
      else selectedKeys.delete(k);
      updateMapStyles();
      updateInfo();
    };
  });

  updateInfo();
}

function updateInfo() {
  const y = String(selYear.value);
  const arr = getYearArr();
  const selCount = selectedKeys.size;
  const plannedCount = arr.filter(u => String(u?.crop || "").trim() !== "").length;
  infoEl.textContent = `Jahr ${y}: ${arr.length} Einträge • ausgewählt: ${selCount}`;
  if (chipSelected) chipSelected.textContent = `Ausgewählt: ${selCount}`;
  if (chipPlanned) chipPlanned.textContent = `Mit Planung: ${plannedCount}`;
}

function cropToColor(crop) {
  const palette = ["#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"];
  const s = String(crop||"");
  let h = 0;
  for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function updateMapStyles() {
  if (!geoLayer) return;
  const y = String(selYear.value);

  geoLayer.eachLayer(layer => {
    const name = String(layer.feature?.properties?.sl_name || layer.feature?.properties?.name || "");
    const key = normalizeName(name);
    const crop = getCropForLabel(name, y);
    const isSel = selectedKeys.has(key);
    const color = crop ? cropToColor(crop) : "#cccccc";

    layer.setStyle({
      color: isSel ? "#000000" : "#555555",
      weight: isSel ? 2 : 1,
      fillColor: color,
      fillOpacity: isSel ? 0.65 : 0.35,
      opacity: 1
    });

    layer.unbindTooltip();
    layer.bindTooltip(`${name}${crop ? " • " + crop : ""}`, { sticky: true });
  });
}

function initMap() {
  map = L.map("mapPlan", { preferCanvas: true }).setView([51.66, 9.40], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  geoLayer = L.geoJSON(GEO, {
    style: () => ({ color: "#555555", weight: 1, fillColor: "#cccccc", fillOpacity: 0.35 }),
    onEachFeature: (feature, layer) => {
      const name = String(feature?.properties?.sl_name || feature?.properties?.name || "");
      layer.on("click", () => {
        const k = normalizeName(name);
        if (!k) return;
        if (selectedKeys.has(k)) selectedKeys.delete(k);
        else selectedKeys.add(k);
        const cb = listEl.querySelector(`input[data-key="${k}"]`);
        if (cb) cb.checked = selectedKeys.has(k);
        updateMapStyles();
        updateInfo();
      });
    }
  }).addTo(map);

  try { map.fitBounds(geoLayer.getBounds(), { padding: [20,20] }); } catch {}
  updateMapStyles();
}

function clearSelection() {
  selectedKeys.clear();
  renderList();
  updateMapStyles();
}

function wireEvents() {
  if (btnClearSel) btnClearSel.onclick = clearSelection;
  if (btnDownloadGeoWithArea) btnDownloadGeoWithArea.onclick = downloadGeoJsonWithArea;

  selYear.onchange = () => clearSelection();

  if (btnAssign) btnAssign.onclick = () => {
    const crop = String(selCrop.value || "").trim();
    if (!crop) { alert("Bitte Frucht wählen."); return; }
    if (selectedKeys.size === 0) { alert("Bitte zuerst Schläge auswählen (Karte oder Liste)."); return; }

    if (!PLAN.crops.includes(crop)) {
      PLAN.crops.push(crop);
      PLAN.crops = uniqSorted(PLAN.crops);
      setOptions(selCrop, PLAN.crops, "Frucht wählen…", "");
      selCrop.value = crop;
    }

    for (const k of Array.from(selectedKeys)) {
      let label = null;
      if (GEO?.features) {
        const f = GEO.features.find(feat => normalizeName(feat?.properties?.sl_name || feat?.properties?.name || "") === k);
        if (f) label = String(f.properties?.sl_name || f.properties?.name || "");
      }
      if (!label) label = k;
      upsertEntry(label, crop);
    }

    clearSelection();
  };

  btnExport.onclick = () => {
    PLAN.years = uniqSorted((PLAN.years||[]).map(String)).map(Number).sort((a,b)=>a-b);
    const blob = new Blob([JSON.stringify(PLAN, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "anbau_plan.json";
    a.click();
    alert("Export erstellt. Bitte die heruntergeladene anbau_plan.json im Repo ersetzen und committen.");
  };

  btnImport.onclick = () => fileImport.click();

  fileImport.onchange = async () => {
    const f = fileImport.files?.[0];
    if (!f) return;
    try {
      const txt = await f.text();
      const obj = JSON.parse(txt);
      PLAN = obj;
      if (!PLAN.plan) PLAN.plan = {};
      if (!Array.isArray(PLAN.crops)) PLAN.crops = [];
      if (!Array.isArray(PLAN.years)) PLAN.years = Object.keys(PLAN.plan).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);

      setOptions(selYear, PLAN.years);
      setOptions(selCrop, PLAN.crops, "Frucht wählen…", "");
      if (PLAN.years.length) selYear.value = String(PLAN.years[0]);
      clearSelection();
      updateInfo();
      alert("Importiert. Nicht vergessen: Exportieren und im Repo committen.");
    } catch (e) {
      console.error(e);
      alert("Import fehlgeschlagen (keine gültige JSON).");
    } finally {
      fileImport.value = "";
    }
  };

  if (btnLogout) btnLogout.onclick = () => { logout(); location.href = "login.html"; };
}



function computeGeoMissingAreas() {
  // returns array of {name, ha}
  const out = [];
  for (const f of (GEO?.features || [])) {
    const props = f.properties || {};
    const a = props.area_ha;
    const name = String(props.sl_name || props.name || "");
    if (!(typeof a === "number" && isFinite(a))) {
      const ha = geojsonAreaHa(f.geometry);
      if (typeof ha === "number" && isFinite(ha)) out.push({ name, ha });
    }
  }
  out.sort((x,y)=>String(x.name).localeCompare(String(y.name),"de"));
  return out;
}

function renderGeoMissingList() {
  if (!geoMissingListEl) return;
  const missing = computeGeoMissingAreas();
  if (chipGeoMissing) chipGeoMissing.textContent = `ohne area_ha: ${missing.length}`;

  if (missing.length === 0) {
    geoMissingListEl.innerHTML = '<div class="muted">Alle Polygone haben area_ha (oder konnten berechnet werden).</div>';
    return;
  }

  const rows = missing.slice(0, 400).map(m => {
    const ha2 = (Math.round(m.ha * 100) / 100).toFixed(2);
    return `<div class="geo-miss-row"><span class="geo-miss-name">${m.name || "(ohne Name)"}</span><span class="geo-miss-ha">${ha2} ha</span></div>`;
  }).join("");

  const note = missing.length > 400 ? `<div class="muted" style="margin-top:6px;">(gekürzt: ${missing.length} Einträge)</div>` : "";
  geoMissingListEl.innerHTML = rows + note;
}

function downloadGeoJsonWithArea() {
  // clone and enrich: set properties.area_ha when missing
  const clone = JSON.parse(JSON.stringify(GEO));
  for (const f of (clone?.features || [])) {
    if (!f.properties) f.properties = {};
    const a = f.properties.area_ha;
    if (!(typeof a === "number" && isFinite(a))) {
      const ha = geojsonAreaHa(f.geometry);
      if (typeof ha === "number" && isFinite(ha)) {
        // keep full precision; display rounding is separate
        f.properties.area_ha = ha;
      }
    }
  }
  const blob = new Blob([JSON.stringify(clone, null, 2)], { type: "application/geo+json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "schlaege_mit_area_ha.geojson";
  a.click();
}


async function init() {
  await requireAuth();
  await Promise.all([loadPlan(), loadGeo()]);

  setOptions(selYear, PLAN.years);
  setOptions(selCrop, PLAN.crops, "Frucht wählen…", "");

  if (PLAN.years.length) selYear.value = String(PLAN.years[0]);

  renderList();
  initMap();
  renderGeoMissingList();
  wireEvents();
}

init();
