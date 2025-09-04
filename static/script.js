/* Data Cleaner - Frontend logic */
const uploadForm = document.getElementById('upload-form');
const statusEl = document.getElementById('status');

const actionsCard = document.getElementById('actions');
const statsCard = document.getElementById('stats');
const tableCard = document.getElementById('table-card');

const dupCols = document.getElementById('dup-cols');
const previewDupesBtn = document.getElementById('preview-dupes');
const removeDupesBtn = document.getElementById('remove-dupes');

const fillCol = document.getElementById('fill-col');
const fillValue = document.getElementById('fill-value');
const fillMissingBtn = document.getElementById('fill-missing');

const downloadBtn = document.getElementById('download-btn');
const downloadFormat = document.getElementById('download-format');

const statRows = document.getElementById('stat-rows');
const statCols = document.getElementById('stat-cols');
const statMissing = document.getElementById('stat-missing');
const statDupes = document.getElementById('stat-dupes');

const tableWrapper = document.getElementById('table-wrapper');
const saveBtn = document.getElementById('save-btn');
const refreshBtn = document.getElementById('refresh-btn');

let currentColumns = []; // header names
let currentData = [];    // array of objects

function setStatus(msg, ok=true){
  statusEl.textContent = msg;
  statusEl.style.color = ok ? '#047857' : '#b91c1c';
}

function showUI(){
  actionsCard.classList.remove('hidden');
  statsCard.classList.remove('hidden');
  tableCard.classList.remove('hidden');
}

function populateColumnSelectors(cols){
  dupCols.innerHTML = '';
  fillCol.innerHTML = '<option value="">All Columns</option>';
  cols.forEach(c=>{
    const opt = document.createElement('option'); opt.value=c; opt.textContent=c;
    dupCols.appendChild(opt);
    const opt2 = document.createElement('option'); opt2.value=c; opt2.textContent=c;
    fillCol.appendChild(opt2);
  });
}

/* build editable table from data (array of objects) */
function buildTable(data, columns){
  currentData = data;
  currentColumns = columns;

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  columns.forEach(h=>{
    const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
  });
  trh.appendChild(document.createElement('th')).textContent = 'Actions';
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  data.forEach((rowObj, rIdx) => {
    const tr = document.createElement('tr');
    columns.forEach(col=>{
      const td = document.createElement('td');
      td.contentEditable = 'true';
      td.dataset.col = col;
      td.dataset.row = rIdx;
      const val = rowObj[col] === null || rowObj[col] === undefined ? '' : String(rowObj[col]);
      td.textContent = val;
      tr.appendChild(td);
    });

    const actionTd = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger';
    deleteBtn.style.padding = '6px';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', ()=>{
      // remove from data and re-render
      currentData.splice(rIdx,1);
      renderCurrent();
    });
    actionTd.appendChild(deleteBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrapper.innerHTML = '';
  tableWrapper.appendChild(table);
}

/* render currentData/currentColumns */
function renderCurrent(){
  buildTable(currentData, currentColumns);
  updateStatsUI();
  populateColumnSelectors(currentColumns);
  showUI();
}

function updateStatsUI(){
  fetch('/get-stats')
    .then(r=>r.json())
    .then(j=>{
      if(j.error){ setStatus(j.error,false); return; }
      statRows.textContent = j.rows;
      statCols.textContent = j.cols;
      statMissing.textContent = j.missing_values;
      statDupes.textContent = j.duplicates;
    }).catch(e=>{
      console.warn(e);
    });
}

/* upload handler */
uploadForm.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const fileInput = document.getElementById('file');
  if(!fileInput.files.length){ setStatus('Choose a file first', false); return; }
  setStatus('Uploading...');
  const fd = new FormData(); fd.append('file', fileInput.files[0]);

  try{
    const res = await fetch('/upload', { method:'POST', body: fd });
    const j = await res.json();
    if(!res.ok){ setStatus(j.error||'Upload failed', false); return; }

    // server returns { columns, data, stats }
    renderCurrentDataFromServer(j);
    setStatus('File uploaded successfully');
  }catch(err){
    setStatus(err.message||'Upload error', false);
  }
});

function renderCurrentDataFromServer(payload){
  currentColumns = payload.columns;
  currentData = payload.data;
  buildTable(currentData, currentColumns);
  updateStatsUI();
  populateColumnSelectors(currentColumns);
  showUI();
}

/* Save edits: read table cells and send updated data */
saveBtn.addEventListener('click', async ()=>{
  // read table cells into array of objects
  const rows = Array.from(tableWrapper.querySelectorAll('tbody tr'));
  const newData = rows.map(tr => {
    const obj = {};
    Array.from(tr.querySelectorAll('td')).forEach(td=>{
      if(td.dataset && td.dataset.col){
        obj[td.dataset.col] = td.textContent;
      }
    });
    return obj;
  });

  try{
    const res = await fetch('/update-data', {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({data:newData})
    });
    const j = await res.json();
    if(!res.ok){ setStatus(j.error||'Save failed', false); return; }
    setStatus(j.message);
    // refresh stats and server state
    updateStatsUI();
  }catch(e){ setStatus(e.message||'Save error', false); }
});

/* Refresh (reload server data and render) */
refreshBtn.addEventListener('click', async ()=>{
  try{
    const res = await fetch('/get-data');
    const j = await res.json();
    if(!res.ok){ setStatus(j.error||'Failed to fetch', false); return; }
    renderCurrentDataFromServer(j);
  }catch(e){ setStatus(e.message||'Refresh error', false); }
});

/* Preview duplicates (simulate) */
previewDupesBtn.addEventListener('click', async ()=>{
  const selected = Array.from(dupCols.selectedOptions).map(o=>o.value);
  try{
    const res = await fetch('/remove-duplicates', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ simulate: true, subset: selected.length?selected:null })
    });
    const j = await res.json();
    if(!res.ok){ setStatus(j.error||'Preview failed', false); return; }
    alert(`Duplicates that would be removed: ${j.duplicates_found}`);
  }catch(e){ setStatus(e.message||'Error', false); }
});

/* Remove duplicates (apply) */
removeDupesBtn.addEventListener('click', async ()=>{
  const selected = Array.from(dupCols.selectedOptions).map(o=>o.value);
  try{
    const res = await fetch('/remove-duplicates', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ subset: selected.length?selected:null })
    });
    const j = await res.json();
    if(!res.ok){ setStatus(j.error||'Remove failed', false); return; }
    // j returns updated columns & data
    renderCurrentDataFromServer(j);
    setStatus('Duplicates removed');
  }catch(e){ setStatus(e.message||'Error', false); }
});

/* Fill missing values */
fillMissingBtn.addEventListener('click', async ()=>{
  const column = fillCol.value || null;
  const value = fillValue.value || '';
  try{
    const res = await fetch('/fill-missing', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ column: column, value: value })
    });
    const j = await res.json();
    if(!res.ok){ setStatus(j.error||'Fill failed', false); return; }
    renderCurrentDataFromServer(j);
    setStatus('Missing values filled');
  }catch(e){ setStatus(e.message||'Error', false); }
});

/* Download */
downloadBtn.addEventListener('click', ()=>{
  const fmt = downloadFormat.value || 'csv';
  window.location = `/download?format=${encodeURIComponent(fmt)}`;
});

/* on load, try to fetch existing data (if reloading after run) */
window.addEventListener('DOMContentLoaded', async ()=>{
  try{
    const res = await fetch('/get-data');
    if(!res.ok) return;
    const j = await res.json();
    if(j && j.data) renderCurrentDataFromServer(j);
  }catch(e){}
});
