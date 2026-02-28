import { requireAuth, logout } from "./auth.js";
requireAuth();
document.getElementById("btnLogout").onclick = logout;

const params=new URLSearchParams(window.location.search);
const jahr=Number(params.get("jahr")||"");
const sl_nr=params.get("sl_nr")||"";
const name=params.get("name")||"";

function norm(s){
  return String(s||"")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

document.getElementById("btnBack").onclick=()=>window.location.href="./index.html";
document.getElementById("title").textContent=`Schlag: ${name} (${jahr||""})`;

const selArt=document.getElementById("selArt");
const tbody=document.getElementById("tbody");
const hint=document.getElementById("hint");
const kpiN=document.getElementById("kpiN");
const kpiNH4=document.getElementById("kpiNH4");
const kpiP=document.getElementById("kpiP");
const kpiK=document.getElementById("kpiK");
const kpiS=document.getElementById("kpiS");

let rowsAll=[];
function fmt(n,d=2){ if(n==null||isNaN(n)) return "–"; return Number(n).toFixed(d); }
async function loadJSON(p){ const r=await fetch(p, { cache:"no-store" }); if(!r.ok) throw new Error("Fetch failed: "+p); return r.json(); }
function uniq(a){ return [...new Set(a)].filter(v=>v!=null && String(v).trim()!==""); }
function fillSelect(s,vals,all){ s.innerHTML=""; const o0=document.createElement("option"); o0.value=""; o0.textContent=all; s.appendChild(o0);
  vals.forEach(v=>{ const o=document.createElement("option"); o.value=v; o.textContent=v; s.appendChild(o); });
}
function apply(){
  const art=selArt.value||null;
  let rows=rowsAll;
  if(art) rows=rows.filter(r=>(r.art||"")===art);

  const sum=(k)=>rows.reduce((a,r)=>a+(Number(r[k])||0),0);
  kpiN.textContent=fmt(sum("gesN_ha"),2);
  kpiNH4.textContent=fmt(sum("NH4_ha"),2);
  kpiP.textContent=fmt(sum("P_ha"),2);
  kpiK.textContent=fmt(sum("K_ha"),2);
  kpiS.textContent=fmt(sum("S_ha"),2);

  tbody.innerHTML="";
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${r.datum||""}</td><td>${fmt(r.bearbeitete_flaeche,4)}</td><td>${r.artikel||""}</td>
      <td>${fmt(r.menge_ha,4)}</td><td>${r.einheit||""}</td><td>${r.art||""}</td><td>${r.frucht||""}</td>
      <td>${r.e_jahr||""}</td><td>${fmt(r.gesN_ha,2)}</td><td>${fmt(r.NH4_ha,2)}</td><td>${fmt(r.P_ha,2)}</td>
      <td>${fmt(r.K_ha,2)}</td><td>${fmt(r.S_ha,2)}</td><td>${r.firma||""}</td><td>${r.wasserschutzgeb||""}</td>`;
    tbody.appendChild(tr);
  });
  hint.textContent=rows.length?`${rows.length} Datensätze`:"Keine Datensätze.";
}
async function init(){
  const all=await loadJSON("./data/mitteleinsatz.json");
  const match = (r)=>norm(r.schlag)===norm(name);
  rowsAll=all.filter(r=>match(r) && Number(r.e_jahr)===Number(jahr));
  
  const arts=uniq(rowsAll.map(r=>r.art)).sort((a,b)=>String(a).localeCompare(String(b)));
  fillSelect(selArt, arts, "Alle Arten");
  apply();
  selArt.onchange=apply;
}
init().catch(err=>{ console.error(err); alert("Fehler beim Laden der Details: " + (err?.message || err)); });
