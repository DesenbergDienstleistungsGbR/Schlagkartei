import { requireAuth, logout } from "./auth.js";
requireAuth();
document.getElementById("logoutBtn").addEventListener("click", logout);

function getParam(name){
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}
function esc(s){
  return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function fmtHa(v){
  if (v === null || v === undefined) return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return "–";
  return `${n.toFixed(2)} ha`;
}

const id = getParam("id");
const titleEl = document.getElementById("title");
const metaTbl = document.getElementById("metaTbl");

const map = L.map("map");
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

async function init(){
  const [data, geo] = await Promise.all([
    fetch("data.json").then(r=>r.json()),
    fetch("schlaege.geojson").then(r=>r.json())
  ]);

  const row = data.find(r => String(r.id) === String(id));
  if (!row){
    titleEl.textContent = "Schlag nicht gefunden";
    metaTbl.innerHTML = `<tr><td>Hinweis</td><td>Kein Eintrag mit id=${esc(id)}</td></tr>`;
    map.setView([51,10], 6);
    return;
  }

  titleEl.textContent = row.Schlag || row.id;

  const fields = [
    ["ID", row.id],
    ["Nummer", row.Nummer || "–"],
    ["Betrieb", row.Betrieb || "–"],
    ["Frucht", row.Frucht || "–"],
    ["Jahr", row.Jahr || "–"],
    ["Fläche", fmtHa(row.Flaeche_ha)]
  ];
  metaTbl.innerHTML = fields.map(([k,v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");

  const feat = (geo.features || []).find(f => String(f?.properties?.id) === String(id));
  if (feat){
    const layer = L.geoJSON(feat).addTo(map);
    const b = layer.getBounds();
    if (b.isValid()) map.fitBounds(b.pad(0.15));
  }else{
    map.setView([51,10], 6);
  }
}
init();
