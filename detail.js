import { requireAuth, logout } from "./auth.js";
requireAuth();

const yearSel = document.getElementById("yearSel");
const firmaSel = document.getElementById("firmaSel");
const fruchtSel = document.getElementById("fruchtSel");
const artSel = document.getElementById("artSel");
const schlagName = document.getElementById("schlagName");
const subtitle = document.getElementById("subtitle");
const theadRow = document.getElementById("theadRow");
const tbody = document.getElementById("tbody");
const search = document.getElementById("search");
const csvBtn = document.getElementById("csvBtn");
const kpis = document.getElementById("kpis");
const countInfo = document.getElementById("countInfo");

document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("backBtn").addEventListener("click", () => history.back());

let DATA = [];
let COLUMNS = [];

const ROUND_COLS = ["Menge/ha", "gesN ha", "NH4 ha", "P ha", "K ha", "S pro ha"];
const SUM_COLS = ["gesN ha", "NH4 ha", "P ha", "K ha", "S pro ha"];

function uniqSorted(arr) {
  const s = new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ""));
  return Array.from(s).sort((a,b) => String(a).localeCompare(String(b), "de", {numeric:true, sensitivity:"base"}));
}

function setOptions(sel, values, placeholder="Alle") {
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

function parseNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).replace(/\s+/g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function fmt2(v) {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v).trim();
  const n = parseNum(v);
  // If it was clearly non-numeric text, return as-is
  if (s !== "" && isNaN(Number(s.replace(",", ".")))) return s;
  return n.toFixed(2);
}

function getParams() {
  return new URLSearchParams(location.search);
}

function getFilters() {
  const params = getParams();
  const schlag = params.get("schlag") || "";
  return {
    year: yearSel.value || params.get("year") || "",
    firma: firmaSel.value || params.get("firma") || "",
    frucht: fruchtSel.value || params.get("frucht") || "",
    schlag,
    art: artSel.value || "",
    q: (search.value || "").toLowerCase().trim(),
  };
}

function rowMatches(r, f) {
  if (f.year && String(r["E_Jahr"]) !== f.year) return false;
  if (f.firma && String(r["Firma"]) !== f.firma) return false;
  if (f.frucht && String(r["Frucht"]) !== f.frucht) return false;
  if (f.schlag && String(r["Schlag"]) !== f.schlag) return false;
  if (f.art && String(r["Art"]) !== f.art) return false;
  if (f.q) {
    const hay = COLUMNS.map(c => r[c]).join(" ").toLowerCase();
    if (!hay.includes(f.q)) return false;
  }
  return true;
}

function buildHeader() {
  theadRow.innerHTML = "";
  for (const c of COLUMNS) {
    const th = document.createElement("th");
    th.textContent = c;
    theadRow.appendChild(th);
  }
}

function buildKpis(rows) {
  kpis.innerHTML = "";
  const sums = {};
  for (const c of SUM_COLS) sums[c] = 0;

  for (const r of rows) {
    for (const c of SUM_COLS) sums[c] += parseNum(r[c]);
  }

  for (const c of SUM_COLS) {
    const div = document.createElement("div");
    div.className = "kpi";
    const t = document.createElement("div");
    t.className = "muted small";
    t.textContent = `Summe ${c}`;
    const v = document.createElement("div");
    v.className = "v";
    v.textContent = sums[c].toFixed(2);
    div.appendChild(t);
    div.appendChild(v);
    kpis.appendChild(div);
  }
}

function render() {
  const f = getFilters();
  schlagName.textContent = f.schlag || "–";
  subtitle.textContent = `${f.year || "–"} • ${f.firma || "–"} • ${f.frucht || "–"}`;

  const rows = DATA.filter(r => rowMatches(r, f));

  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    for (const c of COLUMNS) {
      const td = document.createElement("td");
      td.textContent = ROUND_COLS.includes(c) ? fmt2(r[c]) : (r[c] ?? "");
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  buildKpis(rows);
  countInfo.textContent = `${rows.length} Datensätze angezeigt.`;
}

function toCsv(rows) {
  const esc = (s) => `"${String(s ?? "").replaceAll('"', '""')}"`;
  const lines = [];
  lines.push(COLUMNS.map(esc).join(";"));
  for (const r of rows) {
    const line = COLUMNS.map(c => esc(ROUND_COLS.includes(c) ? fmt2(r[c]) : (r[c] ?? ""))).join(";");
    lines.push(line);
  }
  return lines.join("\n");
}

function downloadCsv() {
  const f = getFilters();
  const rows = DATA.filter(r => rowMatches(r, f));
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mitteleinsatz_${f.year}_${f.firma}_${f.frucht}_${f.schlag}${f.art ? "_" + f.art : ""}.csv`.replaceAll(" ", "_");
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function init() {
  const res = await fetch("./data.json", { cache: "no-store" });
  DATA = await res.json();

  COLUMNS = Object.keys(DATA[0] || {});
  buildHeader();

  setOptions(yearSel, uniqSorted(DATA.map(r => r["E_Jahr"])), "Alle Erntejahre");
  setOptions(firmaSel, uniqSorted(DATA.map(r => r["Firma"])), "Alle Firmen");
  setOptions(fruchtSel, uniqSorted(DATA.map(r => r["Frucht"])), "Alle Früchte");

  const params = getParams();
  const schlag = params.get("schlag") || "";
  if (params.get("year")) yearSel.value = params.get("year");
  if (params.get("firma")) firmaSel.value = params.get("firma");
  if (params.get("frucht")) fruchtSel.value = params.get("frucht");

  function refreshArtOptions() {
    const f = getFilters();
    const base = DATA.filter(r =>
      (!f.year || String(r["E_Jahr"]) === f.year) &&
      (!f.firma || String(r["Firma"]) === f.firma) &&
      (!f.frucht || String(r["Frucht"]) === f.frucht) &&
      (!schlag || String(r["Schlag"]) === schlag)
    );
    const arts = uniqSorted(base.map(r => r["Art"]));
    const current = artSel.value;
    setOptions(artSel, arts, "Alle Arten");
    if (current) artSel.value = current;
  }

  yearSel.addEventListener("change", () => { refreshArtOptions(); render(); });
  firmaSel.addEventListener("change", () => { refreshArtOptions(); render(); });
  fruchtSel.addEventListener("change", () => { refreshArtOptions(); render(); });
  artSel.addEventListener("change", render);
  search.addEventListener("input", render);
  csvBtn.addEventListener("click", downloadCsv);

  schlagName.textContent = schlag || "–";

  refreshArtOptions();
  render();
}

init();
