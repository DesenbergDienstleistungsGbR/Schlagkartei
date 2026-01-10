import { requireAuth, logout } from "./auth.js";
requireAuth();

const yearSel = document.getElementById("yearSel");
const firmaSel = document.getElementById("firmaSel");
const fruchtSel = document.getElementById("fruchtSel");
const schlagList = document.getElementById("schlagList");
const countBadge = document.getElementById("countBadge");
document.getElementById("logoutBtn").addEventListener("click", logout);

let DATA = [];

function uniqSorted(arr) {
  const s = new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ""));
  return Array.from(s).sort((a,b) => String(a).localeCompare(String(b), "de", {numeric:true, sensitivity:"base"}));
}

function setOptions(sel, values, placeholder="Bitte wählen…") {
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

function filterRows() {
  const y = yearSel.value, f = firmaSel.value, fr = fruchtSel.value;
  return DATA.filter(r =>
    (!y || String(r["E_Jahr"]) === y) &&
    (!f || String(r["Firma"]) === f) &&
    (!fr || String(r["Frucht"]) === fr)
  );
}

function renderSchlaege() {
  const y = yearSel.value, f = firmaSel.value, fr = fruchtSel.value;
  schlagList.innerHTML = "";
  if (!y || !f || !fr) {
    countBadge.textContent = "0 Schläge";
    return;
  }
  const rows = filterRows();
  const schlaege = uniqSorted(rows.map(r => r["Schlag"]));
  countBadge.textContent = `${schlaege.length} Schläge`;

  for (const s of schlaege) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    const qs = new URLSearchParams({ year: y, firma: f, frucht: fr, schlag: String(s) });
    a.href = `detail.html?${qs.toString()}`;
    a.textContent = String(s);
    li.appendChild(a);
    schlagList.appendChild(li);
  }
}

async function init() {
  const res = await fetch("./data.json", { cache: "no-store" });
  DATA = await res.json();

  setOptions(yearSel, uniqSorted(DATA.map(r => r["E_Jahr"])));
  setOptions(firmaSel, uniqSorted(DATA.map(r => r["Firma"])));
  setOptions(fruchtSel, uniqSorted(DATA.map(r => r["Frucht"])));

  yearSel.addEventListener("change", renderSchlaege);
  firmaSel.addEventListener("change", renderSchlaege);
  fruchtSel.addEventListener("change", renderSchlaege);

  renderSchlaege();
}

init();
