
import { requireAuth, logout } from "./auth.js";

const tbl = document.getElementById("tbl");
const thead = tbl.querySelector("thead");
const tbody = tbl.querySelector("tbody");
const selArt = document.getElementById("selArt");

document.getElementById("btnLogout").onclick = () => logout();

function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== "")))
    .sort((a,b)=> String(a).localeCompare(String(b), "de"));
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

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function sumCol(rows, key) {
  let s = 0;
  for (const r of rows) s += num(r[key]);
  return s;
}

async function loadData() {
  const r = await fetch("./data.json", { cache: "no-store" });
  return await r.json();
}

function getParams() {
  const p = new URLSearchParams(location.search);
  return {
    year: p.get("year") ? Number(p.get("year")) : null,
    firm: p.get("firm"),
    crop: p.get("crop"),
    field: p.get("field") || ""
  };
}

function filterRows(all, params) {
  const ALL = "__ALL__";
  const firm = params.firm || ALL;
  const crop = params.crop || ALL;
  let rows = all.filter(r => String(r["Schlag"]||"") === params.field);
  if (params.year !== null) rows = rows.filter(r => Number(r["E_Jahr"]) === params.year);
  if (firm !== ALL) rows = rows.filter(r => String(r["Firma"]) === firm);
  if (crop !== ALL) rows = rows.filter(r => String(r["Frucht"]) === crop);

  const art = selArt.value || ALL;
  if (art !== ALL) rows = rows.filter(r => String(r["Art"]) === art);
  return rows;
}

function renderTable(rows) {
  const cols = ["Datum","bearbeitete Fläche","Artikel","Menge/ha","E","Art","Frucht","E_Jahr","gesN ha","NH4 ha","P ha","K ha","S pro ha","Firma","wasserschutzgeb"];
  thead.innerHTML = "<tr>" + cols.map(c=>`<th>${c}</th>`).join("") + "</tr>";
  tbody.innerHTML = rows.map(r => {
    return "<tr>" + cols.map(c => `<td>${r[c] ?? ""}</td>`).join("") + "</tr>";
  }).join("");
}

function updateSums(rows) {
  document.getElementById("sumGesN").textContent = sumCol(rows, "gesN ha").toFixed(2);
  document.getElementById("sumNH4").textContent = sumCol(rows, "NH4 ha").toFixed(2);
  document.getElementById("sumK").textContent = sumCol(rows, "K ha").toFixed(2);
  document.getElementById("sumS").textContent = sumCol(rows, "S pro ha").toFixed(2);
}

async function init() {
  requireAuth();
  const all = await loadData();
  const params = getParams();
  document.getElementById("title").textContent = `Schlag: ${params.field}`;
  document.getElementById("meta").textContent = `Filter: Jahr=${params.year ?? "—"}, Firma=${params.firm ?? "—"}, Frucht=${params.crop ?? "—"}`;

  // Arts dropdown based on field+filters (without art)
  const ALL = "__ALL__";
  let base = all.filter(r => String(r["Schlag"]||"") === params.field);
  if (params.year !== null) base = base.filter(r => Number(r["E_Jahr"]) === params.year);
  if ((params.firm||ALL) !== ALL) base = base.filter(r => String(r["Firma"]) === params.firm);
  if ((params.crop||ALL) !== ALL) base = base.filter(r => String(r["Frucht"]) === params.crop);

  setOptionsWithFirst(selArt, uniqSorted(base.map(r=>r["Art"])), "Alle Arten", ALL);

  const refresh = () => {
    const rows = filterRows(all, params);
    renderTable(rows);
    updateSums(rows);
  };
  selArt.onchange = refresh;
  refresh();
}

init();
