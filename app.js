import { requireAuth, logout } from "./auth.js";
requireAuth();
document.getElementById("btnLogout").onclick = logout;

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

// Neue Buttons sauber ergänzen, ohne HTML umzubauen
const actionsEl = document.querySelector("header .actions");

const btnSatellite = document.createElement("button");
btnSatellite.id = "btnSatellite";
btnSatellite.textContent = "Satellit";

const btnTracks = document.createElement("button");
btnTracks.id = "btnTracks";
btnTracks.textContent = "Fahrspuren";

if (actionsEl) {
  actionsEl.insertBefore(btnSatellite, btnInfoTiles);
  actionsEl.insertBefore(btnTracks, btnInfoTiles);
}

// ================== KARTE ==================
const map = L.map("map", { preferCanvas: true });

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
    betrieb: selBetrieb.value || "",
    frucht: selFrucht.value || "",
    infoTilesOn,
    isSatelliteOn,
    tracksOn,
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

// ================== POSITION ==================
let myPosMarker = null;
let myPosCircle = null;
let myPosWatchId = null;
let myPosActive = false;

function showPosition(lat, lng, accuracy) {
  if (!myPosMarker) {
    myPosMarker = L.circleMarker([lat, lng], {
      radius: 7,
      weight: 2,
      fillOpacity: 0.8
    }).addTo(map);
  } else {
    myPosMarker.setLatLng([lat, lng]);
  }

  if (!myPosCircle) {
    myPosCircle = L.circle([lat, lng], {
      radius: accuracy || 20,
      weight: 1,
      fillOpacity: 0.08
    }).addTo(map);
  } else {
    myPosCircle.setLatLng([lat, lng]);
    myPosCircle.setRadius(accuracy || 20);
  }

  map.panTo([lat, lng], { animate: false });
}

function stopPositionTracking() {
  if (myPosWatchId != null) {
    navigator.geolocation.clearWatch(myPosWatchId);
    myPosWatchId = null;
  }
  myPosActive = false;
  btnLocate.classList.remove("primary");
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

  myPosWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      showPosition(latitude, longitude, accuracy);
      myPosActive = true;
      btnLocate.classList.add("primary");
    },
    (err) => {
      alert("Position nicht verfügbar: " + err.message);
      stopPositionTracking();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
  );
};

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
      style: () => ({
        color: "#ff9800",
        weight: 2,
        opacity: 0.9
      }),
      interactive: false,
      renderer: L.canvas()
    }).addTo(map);

    if (typeof tracksLayer.bringToFront === "function") {
      tracksLayer.bringToFront();
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

// ================== FILTER ==================
function applyFilters() {
  const jahr = selJahr.value ? Number(selJahr.value) : null;
  const betrieb = selBetrieb.value || null;
  const frucht = selFrucht.value || null;

  let rows = liste;

  // Only active (not inaktiv)
  rows = rows.filter(r => String(r.inaktiv ?? "0").trim() !== "1");

  if (jahr != null) rows = rows.filter(r => Number(r.jahr) === jahr);
  if (betrieb) rows = rows.filter(r => (r.betrieb_name || "") === betrieb);
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

  if (umrisseLayer) {
    const allowed = new Set(rows.map(r => String(r.schlag_id)));
    umrisseLayer.eachLayer(layer => {
      const sid = String(layer.feature?.properties?.schlag_id ?? "");
      const isIn = allowed.has(sid);
      layer.setStyle({ weight: 2, fillOpacity: isIn ? 0.35 : 0.0, opacity: 0.9 });
    });
  }

  rebuildInfoTiles(rows);
}

// ================== UMRISSE ==================
async function loadUmrisseForYear(jahr) {
  const geo = await loadJSON(`./data/umrisse_${jahr}.geojson`);
  if (umrisseLayer) map.removeLayer(umrisseLayer);

  umrisseLayer = L.geoJSON(geo, {
    style: () => ({ weight: 2, fillOpacity: 0.2, opacity: 0.9 }),
    onEachFeature: (feature, layer) => {
      const inaktiv = String(feature?.properties?.inaktiv ?? "0").trim() === "1";

      if (inaktiv) {
        layer.setStyle({ weight: 1, fillOpacity: 0.0, opacity: 0.15 });
      }

      layer.on("click", () => {
        if (inaktiv) return;
        const sid = String(feature.properties?.schlag_id ?? "");
        const row = liste.find(
          r =>
            Number(r.inaktiv || 0) !== 1 &&
            String(r.schlag_id) === sid &&
            Number(r.jahr) === Number(jahr)
        );
        if (row) openSchlag(row);
      });

      const n = feature.properties?.name_sl || "Schlag";
      const ha = feature.properties?.ha_calc;
      layer.bindPopup(`<b>${n}</b><br>${(ha != null) ? Number(ha).toFixed(2) : "–"} ha`);
    }
  }).addTo(map);

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

    const fr = uniq(base.map(r => r.frucht_kurz)).sort((a, b) => (a || "").localeCompare(b || ""));
    fillSelect(selFrucht, fr, "Alle Früchte");
  }

  const st = loadState();
  if (st?.jahr && years.map(String).includes(String(st.jahr))) {
    selJahr.value = String(st.jahr);
  }

  refreshDependent();

  if (st?.betrieb && [...selBetrieb.options].some(o => o.value === st.betrieb)) {
    selBetrieb.value = st.betrieb;
  }
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
        .filter(r => !selBetrieb.value || (r.betrieb_name || "") === selBetrieb.value)
        .filter(r => !selFrucht.value || (r.frucht_kurz || "") === selFrucht.value)
    );
    saveState();
  });
}

init().catch(err => {
  console.error(err);
  alert("Fehler beim Laden der Daten: " + (err?.message || err));
});