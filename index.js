import { requireAuth, logout } from "./auth.js";
requireAuth();

const yearSel = document.getElementById("yearSel");
const betriebSel = document.getElementById("betriebSel");
const fruchtSel = document.getElementById("fruchtSel");
const qEl = document.getElementById("q");
const schlagList = document.getElementById("schlagList");
const listSummary = document.getElementById("listSummary");
const countBadge = document.getElementById("countBadge");
document.getElementById("logoutBtn").addEventListener("click", logout);

const ALL="__ALL__";

let DATA = [];
let GEO = null;

function uniq(arr){
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ""))).sort((a,b)=>String(a).localeCompare(String(b),'de'));
}

function setOptions(sel, values, allLabel){
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = ALL;
  optAll.textContent = allLabel;
  sel.appendChild(optAll);
  for (const v of values){
    const o = document.createElement("option");
    o.value = String(v);
    o.textContent = String(v);
    sel.appendChild(o);
  }
}

function asNum(x){
  const n = Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fmtHa(v){
  if (v === null || v === undefined) return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return "–";
  return `${n.toFixed(2)} ha`;
}

const map = L.map("map");
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let layer = null;

function rebuild(){
  const y = yearSel.value;
  const b = betriebSel.value;
  const f = fruchtSel.value;
  const q = (qEl.value || "").trim().toLowerCase();

  let rows = DATA.slice();
  if (y !== ALL) rows = rows.filter(r => String(r.Jahr ?? "") === String(y));
  if (b !== ALL) rows = rows.filter(r => String(r.Betrieb ?? "") === String(b));
  if (f !== ALL) rows = rows.filter(r => String(r.Frucht ?? "") === String(f));
  if (q) rows = rows.filter(r => String(r.Schlag ?? "").toLowerCase().includes(q) || String(r.Nummer ?? "").toLowerCase().includes(q));

  // list
  schlagList.innerHTML = "";
  const totalArea = rows.reduce((a,r)=>a + asNum(r.Flaeche_ha), 0);
  listSummary.textContent = `Schläge: ${rows.length} • Summe Flächen: ${totalArea.toFixed(2)} ha`;
  countBadge.textContent = `${rows.length} Schläge`;

  for (const r of rows){
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `detail.html?id=${encodeURIComponent(r.id)}`;
    a.className = "rowlink";

    const left = document.createElement("div");
    left.className = "col";
    const t = document.createElement("div");
    t.className = "title";
    t.textContent = r.Schlag || r.id;
    const sub = document.createElement("div");
    sub.className = "muted small";
    const parts = [];
    if (r.Nummer) parts.push(`Nr. ${r.Nummer}`);
    if (r.Frucht) parts.push(`Frucht: ${r.Frucht}`);
    if (r.Betrieb) parts.push(`Betrieb: ${r.Betrieb}`);
    if (r.Jahr) parts.push(`Jahr: ${r.Jahr}`);
    sub.textContent = parts.join(" • ");
    left.appendChild(t);
    left.appendChild(sub);

    const right = document.createElement("div");
    right.className = "right";
    right.textContent = fmtHa(r.Flaeche_ha);

    a.appendChild(left);
    a.appendChild(right);
    li.appendChild(a);
    schlagList.appendChild(li);
  }

  // map layer
  if (!GEO) return;
  if (layer) layer.remove();

  const ids = new Set(rows.map(r => String(r.id)));
  layer = L.geoJSON(GEO, {
    filter: (feat) => ids.has(String(feat?.properties?.id)),
    onEachFeature: (feat, lyr) => {
      const p = feat.properties || {};
      lyr.bindPopup(`<b>${p.Schlag ?? p.id ?? "Schlag"}</b><br/>${p.Nummer ? "Nr. "+p.Nummer+"<br/>":""}${p.Frucht ? "Frucht: "+p.Frucht+"<br/>":""}${p.Betrieb ? "Betrieb: "+p.Betrieb+"<br/>":""}${p.Jahr ? "Jahr: "+p.Jahr+"<br/>":""}${p.Flaeche_ha ? "Fläche: "+Number(p.Flaeche_ha).toFixed(2)+" ha":""}<br/><a href="detail.html?id=${encodeURIComponent(p.id)}">Details öffnen</a>`);
      lyr.on("click", () => { window.location.href = `detail.html?id=${encodeURIComponent(p.id)}`; });
    }
  }).addTo(map);

  try{
    const b = layer.getBounds();
    if (b.isValid()) map.fitBounds(b.pad(0.1));
  }catch(e){}
}

async function init(){
  const [data, geo] = await Promise.all([
    fetch("data.json").then(r=>r.json()),
    fetch("schlaege.geojson").then(r=>r.json())
  ]);
  DATA = data;

  // normalize missing
  for (const r of DATA){
    if (r.Jahr === undefined) r.Jahr = null;
    if (r.Frucht === undefined) r.Frucht = null;
    if (r.Betrieb === undefined) r.Betrieb = null;
    if (r.Flaeche_ha !== null && r.Flaeche_ha !== undefined) r.Flaeche_ha = Number(r.Flaeche_ha);
  }

  GEO = geo;

  const years = uniq(DATA.map(r=>r.Jahr)).sort((a,b)=>Number(a)-Number(b));
  setOptions(yearSel, years, "Alle Jahre");

  setOptions(betriebSel, uniq(DATA.map(r=>r.Betrieb)), "Alle Betriebe");
  setOptions(fruchtSel, uniq(DATA.map(r=>r.Frucht)), "Alle Früchte");

  yearSel.addEventListener("change", rebuild);
  betriebSel.addEventListener("change", rebuild);
  fruchtSel.addEventListener("change", rebuild);
  qEl.addEventListener("input", rebuild);

  rebuild();
}
init();
