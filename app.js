// index page: dropdowns (Erntejahr, Firma, Frucht) -> list of Schläge
let DATA = [];
const els = {
  year: document.getElementById('year'),
  firma: document.getElementById('firma'),
  frucht: document.getElementById('frucht'),
  list: document.getElementById('schlagList'),
  count: document.getElementById('count'),
  status: document.getElementById('status'),
  search: document.getElementById('schlagSearch')
};

function uniq(arr){
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ''))).sort((a,b)=>String(a).localeCompare(String(b), 'de'));
}

function setOptions(select, values, placeholder){
  select.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = placeholder;
  select.appendChild(opt0);

  values.forEach(v=>{
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = String(v);
    select.appendChild(o);
  });
}

function currentFilters(){
  return {
    year: els.year.value,
    firma: els.firma.value,
    frucht: els.frucht.value,
    q: (els.search.value || '').trim().toLowerCase()
  };
}

function filteredRows(){
  const f = currentFilters();
  return DATA.filter(r=>{
    if (f.year && String(r.E_Jahr) !== f.year) return false;
    if (f.firma && String(r.Firma) !== f.firma) return false;
    if (f.frucht && String(r.Frucht) !== f.frucht) return false;
    return true;
  });
}

function refreshSchlaege(){
  const f = currentFilters();
  const rows = filteredRows();
  let schlaege = uniq(rows.map(r=>r.Schlag));

  if (f.q){
    schlaege = schlaege.filter(s => String(s).toLowerCase().includes(f.q));
  }

  els.list.innerHTML = '';
  schlaege.forEach(s=>{
    const li = document.createElement('li');
    const a = document.createElement('a');
    const params = new URLSearchParams({
      year: f.year || '',
      firma: f.firma || '',
      frucht: f.frucht || '',
      schlag: String(s)
    });
    a.href = 'detail.html?' + params.toString();
    a.textContent = String(s);
    li.appendChild(a);
    els.list.appendChild(li);
  });

  els.count.textContent = `${schlaege.length} Schläge`;
  els.status.textContent = rows.length ? `${rows.length} Datensätze passen zur Auswahl.` : 'Keine Datensätze für diese Auswahl.';
}

function refreshDependentDropdowns(){
  // Make dropdowns dependent: changing one reduces available values for others
  const y = els.year.value, f = els.firma.value, fr = els.frucht.value;

  // compute possible values given current partial selections
  const base = DATA.filter(r=>{
    if (y && String(r.E_Jahr) !== y) return false;
    if (f && String(r.Firma) !== f) return false;
    if (fr && String(r.Frucht) !== fr) return false;
    return true;
  });

  const years = uniq(base.map(r=>r.E_Jahr));
  const firmas = uniq(base.map(r=>r.Firma));
  const fruechte = uniq(base.map(r=>r.Frucht));

  // Keep current selection if still available
  const keep = (sel, vals) => (sel && vals.includes(sel)) ? sel : '';

  const newYear = keep(y, years.map(String));
  const newFirma = keep(f, firmas.map(String));
  const newFrucht = keep(fr, fruechte.map(String));

  setOptions(els.year, years, 'Alle Erntejahre');
  setOptions(els.firma, firmas, 'Alle Firmen');
  setOptions(els.frucht, fruechte, 'Alle Früchte');

  els.year.value = newYear;
  els.firma.value = newFirma;
  els.frucht.value = newFrucht;
}

async function init(){
  els.status.textContent = 'Lade Daten…';
  const res = await fetch('data.json', {cache:'no-store'});
  DATA = await res.json();

  // initial options from full dataset
  setOptions(els.year, uniq(DATA.map(r=>r.E_Jahr)), 'Alle Erntejahre');
  setOptions(els.firma, uniq(DATA.map(r=>r.Firma)), 'Alle Firmen');
  setOptions(els.frucht, uniq(DATA.map(r=>r.Frucht)), 'Alle Früchte');

  els.status.textContent = '';

  const onChange = () => {
    refreshDependentDropdowns();
    refreshSchlaege();
  };

  els.year.addEventListener('change', onChange);
  els.firma.addEventListener('change', onChange);
  els.frucht.addEventListener('change', onChange);
  els.search.addEventListener('input', refreshSchlaege);

  refreshSchlaege();
}

init().catch(err=>{
  console.error(err);
  els.status.textContent = 'Fehler beim Laden der Daten. Prüfe, ob data.json erreichbar ist.';
});
