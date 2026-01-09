let DATA = [];
let FILTERED = [];
let HEADERS = [];
let page = 1;

const els = {
  year: document.getElementById('filterYear'),
  owner: document.getElementById('filterOwner'),
  crop: document.getElementById('filterCrop'),
  field: document.getElementById('filterField'),
  text: document.getElementById('filterText'),
  status: document.getElementById('status'),
  tableHead: document.querySelector('#dataTable thead'),
  tableBody: document.querySelector('#dataTable tbody'),
  btnReset: document.getElementById('btnReset'),
  btnExport: document.getElementById('btnExport'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  pageInfo: document.getElementById('pageInfo'),
  pageSize: document.getElementById('pageSize'),
};

function uniqSorted(arr){
  const set = new Set(arr.filter(v => v !== null && v !== undefined && v !== ''));
  const out = Array.from(set);
  // numeric sort when possible
  out.sort((a,b) => {
    const na = Number(a), nb = Number(b);
    const aIsNum = !Number.isNaN(na) && String(a).trim() !== '';
    const bIsNum = !Number.isNaN(nb) && String(b).trim() !== '';
    if (aIsNum && bIsNum) return na - nb;
    return String(a).localeCompare(String(b), 'de');
  });
  return out;
}

function fillSelect(selectEl, values, labelAll='Alle'){
  selectEl.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = '';
  optAll.textContent = labelAll;
  selectEl.appendChild(optAll);
  for(const v of values){
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = String(v);
    selectEl.appendChild(o);
  }
}

function getFilters(){
  return {
    c3: els.year.value || null,
    betrieb: els.owner.value || null,
    c26: els.crop.value || null,
    c6: els.field.value || null,
    text: (els.text.value || '').trim().toLowerCase(),
  };
}

function applyFilters(){
  const f = getFilters();
  FILTERED = DATA.filter(r => {
    if (f.c3 && String(r.c3) !== f.c3) return false;
    if (f.betrieb && String(r.betrieb) !== f.betrieb) return false;
    if (f.c26 && String(r.c26) !== f.c26) return false;
    if (f.c6 && String(r.c6) !== f.c6) return false;
    if (f.text){
      // naive freitextsuche über die wichtigsten textfelder + gesamte zeile als fallback
      const hay = [
        r.c6, r.c26, r.c10, r.c5, r.c7, r.c8, r.c9, r.indikation
      ].map(x => (x ?? '')).join(' | ').toLowerCase();
      if (!hay.includes(f.text)){
        // fallback: prüfen ob im json-string der zeile enthalten
        if (!JSON.stringify(r).toLowerCase().includes(f.text)) return false;
      }
    }
    return true;
  });

  page = 1;
  render();
}

function renderTableHeader(){
  els.tableHead.innerHTML = '';
  const tr = document.createElement('tr');
  for(const h of HEADERS){
    const th = document.createElement('th');
    th.textContent = h;
    tr.appendChild(th);
  }
  els.tableHead.appendChild(tr);
}

function formatCell(v){
  if (v === null || v === undefined) return '';
  return String(v);
}

function render(){
  const ps = Number(els.pageSize.value || 200);
  const total = FILTERED.length;
  const totalPages = Math.max(1, Math.ceil(total / ps));
  page = Math.min(page, totalPages);

  const start = (page - 1) * ps;
  const end = Math.min(start + ps, total);
  const slice = FILTERED.slice(start, end);

  els.tableBody.innerHTML = '';
  const frag = document.createDocumentFragment();
  for(const r of slice){
    const tr = document.createElement('tr');
    for(const h of HEADERS){
      const td = document.createElement('td');
      td.textContent = formatCell(r[h]);
      tr.appendChild(td);
    }
    frag.appendChild(tr);
  }
  els.tableBody.appendChild(frag);

  els.status.textContent = `Treffer: ${total.toLocaleString('de-DE')} (zeige ${start+1}-${end})`;
  els.pageInfo.textContent = `Seite ${page} / ${totalPages}`;
  els.btnPrev.disabled = page <= 1;
  els.btnNext.disabled = page >= totalPages;
}

function resetFilters(){
  els.year.value = '';
  els.owner.value = '';
  els.crop.value = '';
  els.field.value = '';
  els.text.value = '';
  applyFilters();
}

function toCSV(rows, headers){
  const esc = (s) => {
    const str = String(s ?? '');
    if (/["\n\r;,]/.test(str)) return '"' + str.replaceAll('"', '""') + '"';
    return str;
  };
  const lines = [];
  lines.push(headers.map(esc).join(';'));
  for(const r of rows){
    lines.push(headers.map(h => esc(r[h])).join(';'));
  }
  return lines.join('\n');
}

function exportCSV(){
  // export all filtered rows (might be big)
  const csv = toCSV(FILTERED, HEADERS);
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0,19).replaceAll(':','-');
  a.download = `mitteleinsatz_export_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function init(){
  els.status.textContent = 'Lade data.json …';
  const res = await fetch('data.json', {cache:'no-store'});
  DATA = await res.json();
  if (!DATA.length){
    els.status.textContent = 'Keine Daten gefunden.';
    return;
  }

  HEADERS = Object.keys(DATA[0]);
  renderTableHeader();

  fillSelect(els.year, uniqSorted(DATA.map(r => r.c3)));
  fillSelect(els.owner, uniqSorted(DATA.map(r => r.betrieb)));
  fillSelect(els.crop, uniqSorted(DATA.map(r => r.c26)));
  fillSelect(els.field, uniqSorted(DATA.map(r => r.c6)));

  // initial
  FILTERED = DATA.slice();
  render();

  // events
  for(const el of [els.year, els.owner, els.crop, els.field]){
    el.addEventListener('change', applyFilters);
  }
  els.text.addEventListener('input', () => {
    // debounce
    clearTimeout(window.__t);
    window.__t = setTimeout(applyFilters, 250);
  });

  els.pageSize.addEventListener('change', () => { page = 1; render(); });
  els.btnPrev.addEventListener('click', () => { page -= 1; render(); });
  els.btnNext.addEventListener('click', () => { page += 1; render(); });
  els.btnReset.addEventListener('click', resetFilters);
  els.btnExport.addEventListener('click', exportCSV);
}

init().catch(err => {
  console.error(err);
  els.status.textContent = 'Fehler beim Laden – siehe Konsole.';
});
