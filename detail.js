// detail page: show filtered rows for selected year/firma/frucht/schlag
let DATA = [];
const params = new URLSearchParams(location.search);
const sel = {
  year: params.get('year') || '',
  firma: params.get('firma') || '',
  frucht: params.get('frucht') || '',
  schlag: params.get('schlag') || ''
};

const elTitle = document.getElementById('title');
const elSub = document.getElementById('subtitle');
const elStatus = document.getElementById('status');
const elRows = document.getElementById('rows');
const elQ = document.getElementById('q');
const elExport = document.getElementById('export');
const thead = document.getElementById('thead');
const tbody = document.getElementById('tbody');

function rowMatches(r, q){
  if (sel.year && String(r.E_Jahr) !== sel.year) return false;
  if (sel.firma && String(r.Firma) !== sel.firma) return false;
  if (sel.frucht && String(r.Frucht) !== sel.frucht) return false;
  if (sel.schlag && String(r.Schlag) !== sel.schlag) return false;

  if (q){
    const hay = Object.values(r).map(v => v==null ? '' : String(v)).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function makeHeader(cols){
  thead.innerHTML = '';
  const tr = document.createElement('tr');
  cols.forEach(c=>{
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
}

function renderTable(rows){
  tbody.innerHTML = '';
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  makeHeader(cols);
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    cols.forEach(c=>{
      const td = document.createElement('td');
      const v = r[c];
      td.textContent = (v === null || v === undefined) ? '' : String(v);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function toCSV(rows){
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (s) => {
    const str = (s==null) ? '' : String(s);
    if (/[",\n;]/.test(str)) return '"' + str.replaceAll('"','""') + '"';
    return str;
  };
  const lines = [];
  lines.push(cols.map(esc).join(';'));
  rows.forEach(r=>{
    lines.push(cols.map(c => esc(r[c])).join(';'));
  });
  return lines.join('\n');
}

function update(){
  const q = (elQ.value || '').trim().toLowerCase();
  const rows = DATA.filter(r=>rowMatches(r,q));
  elRows.textContent = `${rows.length} Zeilen`;
  elStatus.textContent = rows.length ? '' : 'Keine Daten für diese Auswahl.';
  renderTable(rows);
  return rows;
}

async function init(){
  elTitle.textContent = `Schlag: ${sel.schlag || '(nicht gewählt)'}`;
  const bits = [];
  if (sel.year) bits.push(`Erntejahr: ${sel.year}`);
  if (sel.firma) bits.push(`Firma: ${sel.firma}`);
  if (sel.frucht) bits.push(`Frucht: ${sel.frucht}`);
  elSub.textContent = bits.join(' · ');

  elStatus.textContent = 'Lade Daten…';
  const res = await fetch('data.json', {cache:'no-store'});
  DATA = await res.json();
  elStatus.textContent = '';

  let latestRows = update();
  elQ.addEventListener('input', ()=>{ latestRows = update(); });

  elExport.addEventListener('click', ()=>{
    const csv = toCSV(latestRows);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (sel.schlag || 'schlag').replaceAll(/[^a-z0-9_-]+/gi,'_');
    a.href = url;
    a.download = `mitteleinsatz_${safe}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

init().catch(err=>{
  console.error(err);
  elStatus.textContent = 'Fehler beim Laden der Daten. Prüfe, ob data.json erreichbar ist.';
});
