import { requireAuth, logout } from "./auth.js";
requireAuth();
document.getElementById("btnLogout").onclick = logout;
console.log("Schlagkartei app.js Master: Gewässer, Farben, Position-Follow geladen", new Date().toISOString());

const selJahr = document.getElementById("selJahr");
const selBetrieb = document.getElementById("selBetrieb");
const selFrucht = document.getElementById("selFrucht");
const listEl = document.getElementById("list");
const kpiCount = document.getElementById("kpiCount");
const kpiHa = document.getElementById("kpiHa");
const listHint = document.getElementById("listHint");
const btnLocate = document.getElementById("btnLocate");
const btnInfoTiles = document.getElementById("btnInfoTiles");
const btnPanel = document.getElementById("btnPanel");
const sheet = document.getElementById("sheet");
const sheetHandle = document.getElementById("sheetHandle");

// Mehrfachauswahl fuer Betriebe: leer = alle Betriebe anzeigen.
const selectedBetriebe = new Set();
let betriebeMultiEl = null;

// Zusatz-Buttons sauber ergänzen, ohne Duplikate zu erzeugen.
// Falls index.html schon Buttons mit diesen IDs enthält, werden genau diese verwendet.
const actionsEl = document.querySelector("header .actions");

function getOrCreateHeaderButton(id, label, beforeEl = btnInfoTiles) {
  let button = document.getElementById(id);
  if (button) {
    button.textContent = button.textContent || label;
    button.type = "button";
    return button;
  }

  button = document.createElement("button");
  button.id = id;
  button.textContent = label;
  button.type = "button";

  if (actionsEl) {
    actionsEl.insertBefore(button, beforeEl || null);
  }

  return button;
}

const btnSatellite = getOrCreateHeaderButton("btnSatellite", "Satellit");
const btnTracks = getOrCreateHeaderButton("btnTracks", "Fahrspuren");
const btnWater = getOrCreateHeaderButton("btnWater", "Gewässer aus");

// ================== KARTE ==================
const map = L.map("map", { preferCanvas: true });

// Eigene Leaflet-Panes: Gewässer/Fahrspuren liegen sichtbar unten,
// nehmen aber keine Klicks an. Schläge liegen oben und bleiben anklickbar.
map.createPane("nonInteractivePane");
map.getPane("nonInteractivePane").style.zIndex = 410;
map.getPane("nonInteractivePane").style.pointerEvents = "none";

map.createPane("fieldsPane");
map.getPane("fieldsPane").style.zIndex = 650;
map.getPane("fieldsPane").style.pointerEvents = "auto";

const nonInteractiveRenderer = L.canvas({ pane: "nonInteractivePane" });
const fieldsRenderer = L.svg({ pane: "fieldsPane" });

const streetLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  { maxZoom: 19 }
).addTo(map);

const satelliteLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 19 }
);

let isSatelliteOn = false;

// ---- State persistence ----
const STATE_KEY = "schlagkartei_state_v1";
function saveState() {
  const st = {
    jahr: selJahr.value || "",
    // Rueckwaertskompatibel: betrieb bleibt erhalten, neu ist betriebe[].
    betrieb: getSelectedBetriebe()[0] || selBetrieb.value || "",
    betriebe: getSelectedBetriebe(),
    frucht: selFrucht.value || "",
    infoTilesOn,
    isSatelliteOn,
    tracksOn,
    waterDistance: (typeof waterDistance !== "undefined" ? waterDistance : 0),
    map: { c: map.getCenter(), z: map.getZoom() }
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(st));
}
function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "null");
  } catch {
    return null;
  }
}

let liste = [];
let umrisseLayer = null;
let umrisseShadowLayer = null;

// ================== POSITION ==================
let myPosMarker = null;
let myPosCircle = null;
let myPosWatchId = null;
let myPosActive = false;
let myPosFollow = false;
let myLastPosition = null;
let internalPositionMove = false;

const btnBackToPosition = getOrCreateHeaderButton("btnBackToPosition", "📍 Zur Position", btnInfoTiles);
btnBackToPosition.style.display = "none";

function updatePositionButtons() {
  btnLocate.classList.toggle("primary", myPosActive);
  btnLocate.textContent = myPosActive ? "📍 Position an" : "📍 Meine Position";
  btnBackToPosition.style.display = (myPosActive && !myPosFollow) ? "inline-block" : "none";
}

function centerOnLastPosition(zoomToPosition = false) {
  if (!myLastPosition) return;

  myPosFollow = true;
  updatePositionButtons();

  internalPositionMove = true;
  const currentZoom = map.getZoom();
  const targetZoom = zoomToPosition ? Math.max(currentZoom || 0, 17) : currentZoom;
  map.setView([myLastPosition.lat, myLastPosition.lng], targetZoom, { animate: true });
  setTimeout(() => { internalPositionMove = false; }, 700);
}

function showPosition(lat, lng, accuracy) {
  myLastPosition = { lat, lng, accuracy };

  if (!myPosMarker) {
    myPosMarker = L.circleMarker([lat, lng], {
      radius: 7,
      weight: 3,
      color: "#0057d9",
      fillColor: "#ffffff",
      fillOpacity: 1
    }).addTo(map);
  } else {
    myPosMarker.setLatLng([lat, lng]);
  }

  if (!myPosCircle) {
    myPosCircle = L.circle([lat, lng], {
      radius: accuracy || 20,
      color: "#0057d9",
      weight: 1,
      fillColor: "#0057d9",
      fillOpacity: 0.08
    }).addTo(map);
  } else {
    myPosCircle.setLatLng([lat, lng]);
    myPosCircle.setRadius(accuracy || 20);
  }

  // Standortpunkt wird immer aktualisiert.
  // Die Karte folgt nur, solange der Nutzer nicht selbst gewischt/gezoomt hat.
  if (myPosFollow) {
    internalPositionMove = true;
    map.panTo([lat, lng], { animate: false });
    setTimeout(() => { internalPositionMove = false; }, 300);
  }
}

function stopPositionTracking() {
  if (myPosWatchId != null) {
    navigator.geolocation.clearWatch(myPosWatchId);
    myPosWatchId = null;
  }
  myPosActive = false;
  myPosFollow = false;
  updatePositionButtons();
}

btnLocate.onclick = () => {
  if (!navigator.geolocation) {
    alert("Geolocation wird nicht unterstützt.");
    return;
  }

  if (myPosActive) {
    stopPositionTracking();
    return;
  }

  myPosActive = true;
  myPosFollow = true;
  updatePositionButtons();

  myPosWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      showPosition(latitude, longitude, accuracy);
    },
    (err) => {
      alert("Position nicht verfügbar: " + err.message);
      stopPositionTracking();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
  );
};

btnBackToPosition.onclick = () => {
  centerOnLastPosition(true);
};

map.on("dragstart zoomstart", () => {
  if (!myPosActive || internalPositionMove) return;
  myPosFollow = false;
  updatePositionButtons();
});

updatePositionButtons();

// ================== INFOKACHELN ==================
const INFO_MIN_ZOOM = 14;
let infoTilesOn = false;
let infoTilesLayer = L.layerGroup().addTo(map);

function clearInfoTiles() {
  infoTilesLayer.clearLayers();
}

function rebuildInfoTiles(rows) {
  clearInfoTiles();
  if (!infoTilesOn || !umrisseLayer) return;
  if (map.getZoom() < INFO_MIN_ZOOM) return;

  const bounds = map.getBounds();
  const allowed = new Set(rows.map(r => String(r.schlag_id)));

  umrisseLayer.eachLayer(layer => {
    const sid = String(layer.feature?.properties?.schlag_id ?? "");
    if (!allowed.has(sid)) return;

    const center = layer.getBounds().getCenter();
    if (!bounds.contains(center)) return;

    const name = layer.feature?.properties?.name_sl || "Schlag";
    const ha = layer.feature?.properties?.ha_calc;

    const html = `
      <div class="infotile">
        <div class="n">${name}</div>
        <div class="h">${(ha != null && !Number.isNaN(Number(ha))) ? Number(ha).toFixed(2) : "–"} ha</div>
      </div>`;

    infoTilesLayer.addLayer(L.marker(center, {
      interactive: false,
      icon: L.divIcon({ className: "", html, iconSize: null })
    }));
  });
}

btnInfoTiles.onclick = () => {
  infoTilesOn = !infoTilesOn;
  btnInfoTiles.classList.toggle("primary", infoTilesOn);
  applyFilters();
  saveState();
};

// ================== MOBILE FILTER PANEL ==================
if (btnPanel && sheet) btnPanel.onclick = () => sheet.classList.toggle("open");
if (sheetHandle && sheet) sheetHandle.onclick = () => sheet.classList.toggle("open");

// ================== HILFSFUNKTIONEN ==================
function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return "–";
  return Number(n).toFixed(d);
}

async function loadJSON(p, useNoStore = true) {
  const r = await fetch(p, { cache: useNoStore ? "no-store" : "default" });
  if (!r.ok) throw new Error("Fetch failed: " + p);
  return r.json();
}

function uniq(a) {
  return [...new Set(a)].filter(v => v != null);
}

function fillSelect(s, vals, all) {
  s.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = all;
  s.appendChild(o0);

  vals.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    s.appendChild(o);
  });
}

function getSelectedBetriebe() {
  return Array.from(selectedBetriebe);
}

function rowMatchesSelectedBetriebe(row) {
  if (!selectedBetriebe.size) return true;
  return selectedBetriebe.has(row.betrieb_name || "");
}

function renderBetriebMulti(vals) {
  if (!betriebeMultiEl) {
    betriebeMultiEl = document.createElement("div");
    betriebeMultiEl.id = "betriebMulti";
    betriebeMultiEl.style.display = "flex";
    betriebeMultiEl.style.flexDirection = "column";
    betriebeMultiEl.style.gap = "6px";
    betriebeMultiEl.style.marginTop = "6px";

    if (selBetrieb && selBetrieb.parentNode) {
      selBetrieb.insertAdjacentElement("afterend", betriebeMultiEl);
      selBetrieb.style.display = "none";
    }
  }

  const allowed = new Set(vals);
  for (const b of Array.from(selectedBetriebe)) {
    if (!allowed.has(b)) selectedBetriebe.delete(b);
  }

  betriebeMultiEl.innerHTML = "";

  const makeButton = (label, active, onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "space-between";
    btn.style.gap = "10px";
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "12px";
    btn.style.border = active ? "1px solid #111" : "1px solid var(--border)";
    btn.style.background = active ? "#f3f3f3" : "white";
    btn.innerHTML = `<span>${label}</span><span aria-hidden="true">${active ? "●" : "○"}</span>`;
    btn.onclick = onClick;
    return btn;
  };

  betriebeMultiEl.appendChild(makeButton("Alle Betriebe", selectedBetriebe.size === 0, () => {
    selectedBetriebe.clear();
    renderBetriebMulti(vals);
    applyFilters();
    saveState();
  }));

  vals.forEach(betrieb => {
    const active = selectedBetriebe.has(betrieb);
    betriebeMultiEl.appendChild(makeButton(betrieb, active, () => {
      if (selectedBetriebe.has(betrieb)) selectedBetriebe.delete(betrieb);
      else selectedBetriebe.add(betrieb);
      selBetrieb.value = selectedBetriebe.size === 1 ? Array.from(selectedBetriebe)[0] : "";
      renderBetriebMulti(vals);
      applyFilters();
      saveState();
    }));
  });
}

function openSchlag(r) {
  saveState();
  const params = new URLSearchParams({
    jahr: String(r.jahr),
    schlag_id: String(r.schlag_id ?? ""),
    name: String(r.name_sl ?? "")
  });
  window.location.href = `./schlag.html?${params.toString()}`;
}

// ================== FAHRSPUREN ==================
let tracksLayer = null;
let tracksOn = false;
let tracksCache = null;

async function ensureTracksLoaded() {
  if (tracksCache) return tracksCache;

  const url = "./data/fahrspuren.geojson";
  const res = await fetch(url, { cache: "default" });

  if (!res.ok) {
    throw new Error(`Fahrspuren nicht gefunden: ${url}`);
  }

  const data = await res.json();
  tracksCache = data;
  return data;
}

async function setTracksVisible(visible) {
  if (tracksLayer) {
    map.removeLayer(tracksLayer);
    tracksLayer = null;
  }

  tracksOn = visible;
  btnTracks.classList.toggle("primary", tracksOn);

  if (!visible) {
    saveState();
    return;
  }

  try {
    const data = await ensureTracksLoaded();

    tracksLayer = L.geoJSON(data, {
      pane: "nonInteractivePane",
      style: () => ({
        color: "#ff9800",
        weight: 2,
        opacity: 0.9
      }),
      interactive: false,
      bubblingMouseEvents: false,
      renderer: nonInteractiveRenderer
    }).addTo(map);

    // 🔥 FIX: Fahrspuren nach hinten, Schläge nach vorne
    if (typeof tracksLayer.bringToBack === "function") {
      tracksLayer.bringToBack();
    }
    if (typeof umrisseLayer?.bringToFront === "function") {
      umrisseLayer.bringToFront();
    }

  } catch (err) {
    console.warn(err);
    tracksOn = false;
    btnTracks.classList.remove("primary");
  }

  saveState();
}

btnTracks.onclick = async () => {
  await setTracksVisible(!tracksOn);
};

// ================== GEWÄSSER-PUFFER ==================
let waterLayer = null;
let waterCache = null;
let waterDistance = 0; // 0 = aus, sonst 5 / 10 / 20
const WATER_DISTANCES = [0, 5, 10, 20];

function updateWaterButton(extraText = "") {
  if (!btnWater) return;
  const base = waterDistance ? `Gewässer ${waterDistance} m` : "Gewässer aus";
  btnWater.textContent = extraText ? `${base} ${extraText}` : base;
  btnWater.classList.toggle("primary", !!waterDistance);
}

async function ensureWaterLoaded() {
  if (waterCache) return waterCache;

  const url = "./data/gewaesser_puffer.geojson";
  console.log("Lade Gewässer-Puffer:", url);
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Gewässer-Puffer nicht gefunden oder nicht ladbar: ${url} (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (!data || !Array.isArray(data.features)) {
    throw new Error("Gewässer-Puffer-Datei ist kein gültiges GeoJSON FeatureCollection.");
  }

  console.log("Gewässer-Puffer geladen, Features:", data.features.length);
  waterCache = data;
  return data;
}

async function setWaterDistance(distance) {
  if (waterLayer) {
    map.removeLayer(waterLayer);
    waterLayer = null;
  }

  waterDistance = Number(distance) || 0;
  console.log("Setze Gewässer-Abstand:", waterDistance);
  updateWaterButton(waterDistance ? "lädt..." : "");

  if (!waterDistance) {
    updateWaterButton();
    saveState();
    return;
  }

  try {
    const data = await ensureWaterLoaded();
    const selectedFeatures = (data.features || []).filter(f => Number(f.properties?.abstand) === waterDistance);
    console.log(`Gewässer ${waterDistance} m Features:`, selectedFeatures.length);

    if (!selectedFeatures.length) {
      throw new Error(`In gewaesser_puffer.geojson gibt es keine Features mit abstand = ${waterDistance}.`);
    }

    const selected = {
      type: "FeatureCollection",
      features: selectedFeatures
    };

    waterLayer = L.geoJSON(selected, {
      pane: "nonInteractivePane",
      style: () => ({
        // Gewuenscht: Gewaesser/Puffer klar blau darstellen.
        color: "#0066CC",
        weight: 2,
        opacity: 0.95,
        fillColor: "#1E90FF",
        fillOpacity: 0.28
      }),
      interactive: false,
      bubblingMouseEvents: false,
      renderer: nonInteractiveRenderer
    }).addTo(map);

    if (typeof waterLayer.bringToBack === "function") {
      waterLayer.bringToBack();
    }
    if (typeof tracksLayer?.bringToBack === "function") {
      tracksLayer.bringToBack();
    }
    if (typeof umrisseLayer?.bringToFront === "function") {
      umrisseLayer.bringToFront();
    }

    updateWaterButton();
  } catch (err) {
    console.error("Gewässer-Layer konnte nicht geladen werden:", err);
    alert("Gewässer-Layer konnte nicht geladen werden. Bitte prüfen: docs/data/gewaesser_puffer.geojson\n\n" + (err?.message || err));
    waterDistance = 0;
    updateWaterButton();
  }

  saveState();
}

function handleWaterButtonClick(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  console.log("Gewässer-Button geklickt");
  const currentIndex = WATER_DISTANCES.indexOf(waterDistance);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % WATER_DISTANCES.length : 1;
  setWaterDistance(WATER_DISTANCES[nextIndex]);
}

if (btnWater) {
  btnWater.type = "button";
  btnWater.addEventListener("click", handleWaterButtonClick);
  window.__testGewaesserButton = handleWaterButtonClick;
  console.log("Gewässer-Button initialisiert:", btnWater);
}

// ================== SATELLIT ==================
function setSatelliteVisible(visible) {
  if (visible === isSatelliteOn) return;

  if (visible) {
    if (map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
    if (!map.hasLayer(satelliteLayer)) satelliteLayer.addTo(map);
  } else {
    if (map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
    if (!map.hasLayer(streetLayer)) streetLayer.addTo(map);
  }

  isSatelliteOn = visible;
  btnSatellite.classList.toggle("primary", isSatelliteOn);
  saveState();
}

btnSatellite.onclick = () => {
  setSatelliteVisible(!isSatelliteOn);
};


// ================== FARBEN / SCHLAGDARSTELLUNG ==================
// Umrisse bleiben immer sichtbar. Flaechen werden nur gefuellt,
// wenn eine Frucht im Filter ausgewaehlt ist.
const FRUCHT_FILL_COLORS = [
  "#FFF176", // gelb
  "#4DD0E1", // cyan
  "#CE93D8", // violett
  "#A5D6A7", // hellgruen
  "#FFCC80", // orange hell
  "#90CAF9", // hellblau
  "#F48FB1", // rosa
  "#DCE775"  // limette
];

function colorForFrucht(value) {
  const key = String(value || "offen");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return FRUCHT_FILL_COLORS[Math.abs(hash) % FRUCHT_FILL_COLORS.length];
}

// ================== FILTER ==================
function applyFilters() {
  const jahr = selJahr.value ? Number(selJahr.value) : null;
  const frucht = selFrucht.value || null;

  let rows = liste;

  // Only active (not inaktiv)
  rows = rows.filter(r => String(r.inaktiv ?? "0").trim() !== "1");

  if (jahr != null) rows = rows.filter(r => Number(r.jahr) === jahr);
  rows = rows.filter(rowMatchesSelectedBetriebe);
  if (frucht) rows = rows.filter(r => (r.frucht_kurz || "") === frucht);

  kpiCount.textContent = rows.length.toString();
  const sumHa = rows.reduce((a, r) => a + (Number(r.ha_calc) || 0), 0);
  kpiHa.textContent = fmt(sumHa, 2);

  listEl.innerHTML = "";
  rows
    .sort((a, b) => (a.name_sl || "").localeCompare(b.name_sl || ""))
    .forEach(r => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `<div class="t">${r.name_sl}</div><div class="s">${fmt(r.ha_calc, 2)} ha · ${(r.frucht_kurz || "–")} · ${(r.betrieb_name || "–")}</div>`;
      div.onclick = () => openSchlag(r);
      listEl.appendChild(div);
    });

  listHint.textContent = rows.length ? "" : "Keine Schläge für die aktuelle Auswahl.";

  const allowed = new Set(rows.map(r => String(r.schlag_id)));
  const rowBySchlag = new Map(rows.map(r => [String(r.schlag_id), r]));
  const fruchtIstGewaehlt = Boolean(frucht);
  // Auswahl = aktive Filterauswahl in Betrieb oder Frucht.
  // Ohne aktive Auswahl bleiben alle sichtbaren Schlagumrisse hellgelb.
  const hatAktiveAuswahl = selectedBetriebe.size > 0 || Boolean(frucht);

  if (umrisseLayer) {
    umrisseLayer.eachLayer(layer => {
      const sid = String(layer.feature?.properties?.schlag_id ?? "");
      const row = rowBySchlag.get(sid);
      const isIn = allowed.has(sid);
      const isSelected = hatAktiveAuswahl && isIn;

      layer.setStyle({
        // Gewuenscht: normale Schlagumrisse hellgelb, ausgewaehlte Schlaege weiss.
        color: isSelected ? "#FFFFFF" : "#FFF176",
        weight: isSelected ? 3.4 : 2.3,
        opacity: isIn ? 1.0 : 0.45,
        fillColor: (isIn && fruchtIstGewaehlt) ? colorForFrucht(row?.frucht_kurz || frucht) : "#FFF176",
        fillOpacity: (isIn && fruchtIstGewaehlt) ? 0.35 : 0
      });
    });
  }
  if (umrisseShadowLayer) {
    umrisseShadowLayer.eachLayer(layer => {
      const sid = String(layer.feature?.properties?.schlag_id ?? "");
      const isIn = allowed.has(sid);
      const isSelected = hatAktiveAuswahl && isIn;

      layer.setStyle({
        // Dunkler Unterstrich macht den weissen Auswahlumriss auch auf hellen Karten sichtbar.
        color: isSelected ? "#202020" : "#5F4B00",
        weight: isSelected ? 5.2 : 4.2,
        opacity: isIn ? 0.70 : 0.35,
        fillOpacity: 0
      });
    });
  }

  rebuildInfoTiles(rows);
}

// ================== UMRISSE ==================
async function loadUmrisseForYear(jahr) {
  const geo = await loadJSON(`./data/umrisse_${jahr}.geojson`);
  if (umrisseLayer) map.removeLayer(umrisseLayer);
  if (umrisseShadowLayer) map.removeLayer(umrisseShadowLayer);

  // Schlaggrenzen: immer sichtbarer Hellgelb/Ocker-Umriss.
  // Die Flaechenfuellung wird erst bei ausgewaehlter Frucht im Filter gesetzt.
  umrisseShadowLayer = L.geoJSON(geo, {
    pane: "fieldsPane",
    interactive: false,
    renderer: fieldsRenderer,
    style: () => ({
      color: "#5F4B00",
      weight: 4.2,
      opacity: 0.70,
      fillOpacity: 0
    })
  }).addTo(map);

  umrisseLayer = L.geoJSON(geo, {
    pane: "fieldsPane",
    interactive: true,
    renderer: fieldsRenderer,
    style: () => ({
      color: "#FFF176",
      weight: 2.3,
      opacity: 1.0,
      fillColor: "#FFF176",
      fillOpacity: 0
    }),

    onEachFeature: (feature, layer) => {
      const inaktiv = String(feature?.properties?.inaktiv ?? "0").trim() === "1";

      if (inaktiv) {
        layer.setStyle({ color: "#E0E0E0", weight: 1.2, fillOpacity: 0.0, opacity: 0.35 });
      }

      layer.on("click", () => {
        if (inaktiv) return;

        const sid = String(feature.properties?.schlag_id ?? "");

        const row = liste.find(r =>
          Number(r.inaktiv || 0) !== 1 &&
          String(r.schlag_id) === sid &&
          Number(r.jahr) === Number(jahr)
        );

        if (row) {
          openSchlag(row);
        }
      });

      const n = feature.properties?.name_sl || "Schlag";
      const ha = feature.properties?.ha_calc;

      layer.bindPopup(
        `<b>${n}</b><br>${(ha != null) ? Number(ha).toFixed(2) : "–"} ha`
      );
    }
  }).addTo(map);

  // 🔥 WICHTIG: sorgt dafür, dass Schläge über Fahrspuren/Gewässer-Puffern liegen
  if (typeof waterLayer?.bringToBack === "function") {
    waterLayer.bringToBack();
  }
  if (typeof tracksLayer?.bringToBack === "function") {
    tracksLayer.bringToBack();
  }
  if (typeof umrisseShadowLayer?.bringToFront === "function") {
    umrisseShadowLayer.bringToFront();
  }
  if (typeof umrisseLayer.bringToFront === "function") {
    umrisseLayer.bringToFront();
  }

  try {
    map.fitBounds(umrisseLayer.getBounds(), { padding: [20, 20] });
  } catch {}
}
// ================== INIT ==================
async function init() {
  liste = await loadJSON("./data/liste.json");
  const years = uniq(liste.map(r => Number(r.jahr))).sort((a, b) => a - b);

  fillSelect(selJahr, years.map(String), "Alle Jahre");
  if (years.length) selJahr.value = String(years[years.length - 1]);

  function refreshDependent() {
    const jahr = selJahr.value ? Number(selJahr.value) : null;
    let base = liste.filter(r => Number(r.inaktiv || 0) !== 1);
    if (jahr != null) base = base.filter(r => Number(r.jahr) === jahr);

    const bet = uniq(base.map(r => r.betrieb_name)).sort((a, b) => (a || "").localeCompare(b || ""));
    fillSelect(selBetrieb, bet, "Alle Betriebe");
    renderBetriebMulti(bet);

    const fr = uniq(base.map(r => r.frucht_kurz)).sort((a, b) => (a || "").localeCompare(b || ""));
    fillSelect(selFrucht, fr, "Alle Früchte");
  }

  const st = loadState();
  if (st?.jahr && years.map(String).includes(String(st.jahr))) {
    selJahr.value = String(st.jahr);
  }

  refreshDependent();

  if (Array.isArray(st?.betriebe)) {
    st.betriebe.forEach(b => {
      if ([...selBetrieb.options].some(o => o.value === b)) selectedBetriebe.add(b);
    });
  } else if (st?.betrieb && [...selBetrieb.options].some(o => o.value === st.betrieb)) {
    selectedBetriebe.add(st.betrieb);
  }
  renderBetriebMulti(uniq(liste
    .filter(r => Number(r.inaktiv || 0) !== 1)
    .filter(r => !selJahr.value || Number(r.jahr) === Number(selJahr.value))
    .map(r => r.betrieb_name))
    .sort((a, b) => (a || "").localeCompare(b || "")));
  selBetrieb.value = selectedBetriebe.size === 1 ? Array.from(selectedBetriebe)[0] : "";

  if (st?.frucht && [...selFrucht.options].some(o => o.value === st.frucht)) {
    selFrucht.value = st.frucht;
  }

  infoTilesOn = !!st?.infoTilesOn;
  btnInfoTiles.classList.toggle("primary", infoTilesOn);

  await loadUmrisseForYear(Number(selJahr.value));
  applyFilters();

  if (st?.map?.c && st?.map?.z) {
    map.setView([st.map.c.lat, st.map.c.lng], st.map.z);
  }

  if (st?.isSatelliteOn) {
    setSatelliteVisible(true);
  }

  if (st?.waterDistance) {
    await setWaterDistance(st.waterDistance);
  } else {
    updateWaterButton();
  }

  if (st?.tracksOn) {
    await setTracksVisible(true);
  }

  selJahr.onchange = async () => {
    refreshDependent();
    await loadUmrisseForYear(Number(selJahr.value));
    applyFilters();

    if (tracksOn) {
      await setTracksVisible(true);
    } else {
      saveState();
    }
  };

  selBetrieb.onchange = () => {
    selectedBetriebe.clear();
    if (selBetrieb.value) selectedBetriebe.add(selBetrieb.value);
    const vals = [...selBetrieb.options].map(o => o.value).filter(Boolean);
    renderBetriebMulti(vals);
    applyFilters();
    saveState();
  };

  selFrucht.onchange = () => {
    applyFilters();
    saveState();
  };

  map.on("moveend zoomend", () => {
    rebuildInfoTiles(
      liste
        .filter(r => String(r.inaktiv ?? "0").trim() !== "1")
        .filter(r => !selJahr.value || Number(r.jahr) === Number(selJahr.value))
        .filter(rowMatchesSelectedBetriebe)
        .filter(r => !selFrucht.value || (r.frucht_kurz || "") === selFrucht.value)
    );
    saveState();
  });
}

init().catch(err => {
  console.error(err);
  alert("Fehler beim Laden der Daten: " + (err?.message || err));
});