
// ===== DATA & CONSTANTS =====
const DATA = JSON.parse(document.getElementById('appdata').textContent);
const POIS = DATA.pois, TRACKS = DATA.tracks, DRIVES = DATA.drive_routes;
const STORE = 'madeira_pr_v11_4';
const CAL_START = DATA.calendar_start || '2026-06-22';
const CAL_END   = DATA.calendar_end   || '2026-07-05';

// ===== STATE =====
const DEFAULT_STATE = {
  base:   { name:'Pestana Promenade', lat:32.6389, lon:-16.9379, factor:1.2, start:CAL_START, end:CAL_END },
  style:  { prColor:'#2db370', prWeight:3, driveColor:'#4aa3ff', driveWeight:2, driveDash:'6,6', heatColor:'#ff7a18', heatWeight:7 },
  filter: { search:'', level:'all', plan:'all', region:'all', driveKmMax:0, driveMinMax:0, trailKmMax:0, totalKmMax:0, eleMax:0 },
  map:    { base:'osm', pins:true, tracks:true, drives:true, heat:false, parking:false, selectedPois:null },
  items:  {}
};
let state = loadState();
let currentTab = 'list';
let selectedId = null;
let mapInstance = null;
let mapLayers   = { markers:null, tracks:null, drives:null, heat:null, parking:null };
let mapBaseLayers = {};
let userMarker  = null;
let mapPanelOpen = false;

// ===== PERSISTENCE =====
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    return {
      ...structuredClone(DEFAULT_STATE), ...saved,
      base:   { ...DEFAULT_STATE.base,   ...(saved.base   || {}) },
      style:  { ...DEFAULT_STATE.style,  ...(saved.style  || {}) },
      filter: { ...DEFAULT_STATE.filter, ...(saved.filter || {}) },
      map:    { ...DEFAULT_STATE.map,    ...(saved.map    || {}) },
      items:  saved.items || {}
    };
  } catch(e) { return structuredClone(DEFAULT_STATE); }
}
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
function getItem(id) {
  if (!state.items[id]) state.items[id] = { fav:false, planned:false, done:false, status:'open', plannedAt:'', bookedAt:'', note:'' };
  return state.items[id];
}

// ===== HELPERS =====
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function fmtMin(m) { if (m==null||isNaN(m)) return 'k.A.'; m=Math.round(m); return m>=60 ? Math.floor(m/60)+'h'+(m%60?' '+m%60+'min':'') : m+' min'; }
function fmtKm(k)  { return k!=null ? parseFloat(k).toFixed(1).replace('.',',')+' km' : 'k.A.'; }
function levelClass(l) { l=(l||'').toLowerCase(); return l.includes('leicht')?'easy':l.includes('mittel')?'mid':l.includes('schwer')?'hard':'unknown'; }
function levelLabel(l) { l=(l||'').toLowerCase(); return l.includes('leicht')?'Leicht':l.includes('mittel')?'Mittel':l.includes('schwer')?'Schwer':'–'; }
function plannedMin(p) { return p.drive_min ? Math.round(p.drive_min*(state.base.factor||1.2)) : null; }
function routeUrl(p)   { return `https://www.google.com/maps/dir/?api=1&origin=${state.base.lat},${state.base.lon}&destination=${p.lat},${p.lon}&travelmode=driving`; }
// Instagram: use Google search for Reels since app deep-links don't trigger search reliably
function socialUrl(kind, p) {
  const q = encodeURIComponent(p.num + ' ' + p.name + ' Madeira');
  if (kind === 'ig')   return 'https://www.google.com/search?q=' + encodeURIComponent(p.num + ' ' + p.name + ' Madeira Reels site:instagram.com');
  if (kind === 'yt')   return 'https://www.youtube.com/results?search_query=' + q;
  return 'https://www.google.com/search?q=' + q;
}
function shuttleUrl(p) { return 'https://www.google.com/search?q=' + encodeURIComponent(p.num + ' ' + p.name + ' Madeira Shuttle Transfer'); }
function dateLabel(v) { if (!v) return ''; try { return new Date(v).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',hour:v.includes('T')?'2-digit':undefined,minute:v.includes('T')?'2-digit':undefined}); } catch(e){ return v; } }
function havKm(a,b) { if(!a||!b)return 0; const R=6371,tr=x=>x*Math.PI/180,dlat=tr(b[0]-a[0]),dlon=tr(b[1]-a[1]),s=Math.sin(dlat/2)**2+Math.cos(tr(a[0]))*Math.cos(tr(b[0]))*Math.sin(dlon/2)**2; return 2*R*Math.asin(Math.sqrt(s)); }
function oneWayGapKm(p) {
  const t = TRACKS[p.id];
  if (!t || !t.coords || t.coords.length < 2) return 0;
  return havKm(t.coords[0], t.coords[t.coords.length-1]);
}
function effectiveTrailKm(p) {
  const base = Number(p.dist_km || (TRACKS[p.id]?.dist_km) || 0);
  return oneWayGapKm(p) > 0.8 ? base * 2 : base;
}
function safeGain(t) {
  const g = trackGain(t);
  return { up: Number.isFinite(g.up) ? g.up : null, down: Number.isFinite(g.down) ? g.down : null };
}
function rangeLabel(v, suffix) { return !v || Number(v)===0 ? 'alle' : (String(v).replace('.',',') + ' ' + suffix); }
function withinVacation(v) {
  if (!v) return true;
  const d = v.slice(0,10), a = state.base.start || CAL_START, b = state.base.end || CAL_END;
  return d >= a && d <= b;
}

function toast(msg) { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function dateRange(a,b) { let out=[],d=new Date(a+'T00:00:00'),end=new Date(b+'T00:00:00'); while(d<=end){out.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1);} return out; }
function dlFile(name,content,type) { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

// ===== FILTER =====
function applyFilters() {
  const q = state.filter.search.toLowerCase().trim();
  return POIS.filter(p => {
    const it = getItem(p.id);
    if (q && !(p.num+' '+p.name+' '+p.region).toLowerCase().includes(q)) return false;
    if (state.filter.level !== 'all' && !(p.level||'').toLowerCase().includes(state.filter.level)) return false;
    if (state.filter.plan === 'fav'     && !it.fav) return false;
    if (state.filter.plan === 'planned' && !(it.planned||it.plannedAt||it.bookedAt)) return false;
    if (state.filter.plan === 'done'    && !it.done) return false;
    if (state.filter.plan === 'open'    && (it.done||it.planned||it.plannedAt||it.bookedAt)) return false;
    if (state.filter.region !== 'all'   && p.region !== state.filter.region) return false;
    if (state.filter.driveKmMax && Number(p.drive_km||0) > Number(state.filter.driveKmMax)) return false;
    if (state.filter.driveMinMax && Number(plannedMin(p)||0) > Number(state.filter.driveMinMax)) return false;
    if (state.filter.trailKmMax && Number(p.dist_km||0) > Number(state.filter.trailKmMax)) return false;
    if (state.filter.totalKmMax && Number(effectiveTrailKm(p)||0) > Number(state.filter.totalKmMax)) return false;
    if (state.filter.eleMax && Number(p.ele_m||0) > Number(state.filter.eleMax)) return false;
    return true;
  });
}
function filterCount() {
  let n=0;
  if (state.filter.level  !== 'all') n++;
  if (state.filter.plan   !== 'all') n++;
  if (state.filter.region !== 'all') n++;
  if (state.filter.search) n++;
  ['driveKmMax','driveMinMax','trailKmMax','totalKmMax','eleMax'].forEach(k => { if (Number(state.filter[k]||0)>0) n++; });
  return n;
}
function updateFilterBadge() {
  const n = filterCount();
  $('#filterBadge').textContent = n;
  $('#filterBadge').classList.toggle('hidden', n===0);
  $('#filterBtn').classList.toggle('has-filter', n>0);
}

// ===== STATS BAR =====
function renderStats() {
  let planned=0,done=0,fav=0;
  POIS.forEach(p=>{ const it=getItem(p.id); if(it.fav)fav++; if(it.planned||it.plannedAt||it.bookedAt)planned++; if(it.done)done++; });
  const filtered = applyFilters().length;
  const days = dateRange(state.base.start||CAL_START, state.base.end||CAL_END).length;
  $('#stats-bar').innerHTML =
    `<div class="stat-chip"><b>${filtered}</b> von ${POIS.length}</div>` +
    `<div class="stat-chip"><b>${fav}</b> ♥</div>` +
    `<div class="stat-chip${planned?' accent':''}"><b>${planned}</b> geplant</div>` +
    `<div class="stat-chip"><b>${done}</b> erledigt</div>` +
    `<div class="stat-chip"><b>${days}</b> Tage</div>`;
}

// ===== LIST =====
function renderList() {
  const arr = applyFilters();
  renderStats();
  if (!arr.length) {
    $('#list').innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>Keine Touren gefunden.</div>`;
    return;
  }
  $('#list').innerHTML = arr.map(cardHTML).join('');
  // bind click — use event delegation to avoid rebinding issues
  $('#list').querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => {
      const p = POIS.find(x => x.id === el.dataset.id);
      if (p) openDetail(p);
    });
  });
}

function cardHTML(p) {
  const it = getItem(p.id);
  const t  = TRACKS[p.id];
  const lc = levelClass(p.level);
  const tags = [
    it.fav ? `<span class="status-tag fav">♥ Favorit</span>` : '',
    (it.planned||it.plannedAt||it.bookedAt)
      ? `<span class="status-tag plan">📅 ${it.bookedAt?'Gebucht':'Geplant'}${dateLabel(it.bookedAt||it.plannedAt)?' · '+dateLabel(it.bookedAt||it.plannedAt):''}</span>` : '',
    it.done ? `<span class="status-tag done">✓ Erledigt</span>` : ''
  ].filter(Boolean).join('');

  let oneway = '';
  if (t && t.coords && t.coords.length > 1) {
    const dist = havKm(t.coords[0], t.coords[t.coords.length-1]);
    if (dist > 0.8) oneway = `<div class="oneway-warn">⚠ Einweg ~${dist.toFixed(1).replace('.',',')} km – Shuttle/Taxi einplanen</div>`;
  }

  return `<div class="card${selectedId===p.id?' selected':''}" data-id="${p.id}">
    <div class="card-top">
      <div class="card-badge ${lc}">${esc(p.num)}</div>
      <div class="card-info">
        <div class="card-title">${esc(p.name)}</div>
        <div class="card-meta">${esc(p.region)} · ${levelLabel(p.level)} · ${fmtKm(p.dist_km)}</div>
      </div>
    </div>
    ${tags ? `<div class="card-status-row">${tags}</div>` : ''}
    <div class="card-quick">
      <div class="quick-item"><div class="quick-label">Dauer</div><div class="quick-val">${fmtMin(p.dur_min)}</div></div>
      <div class="quick-item"><div class="quick-label">Anfahrt</div><div class="quick-val">${fmtMin(plannedMin(p))}</div></div>
      <div class="quick-item"><div class="quick-label">Höhe Δ</div><div class="quick-val">${p.ele_m!=null?p.ele_m+' m':'k.A.'}</div></div>
    </div>
    ${oneway}
  </div>`;
}

// ===== DETAIL SHEET =====
function openDetail(p) {
  selectedId = p.id;
  const it = getItem(p.id);
  const t  = TRACKS[p.id];
  const lc = levelClass(p.level);

  $('#detailNum').textContent  = p.num;
  $('#detailNum').className    = 'detail-num ' + lc;
  $('#detailName').textContent = p.name;
  $('#detailSub').textContent  = [p.region, levelLabel(p.level), p.hint].filter(Boolean).join(' · ');

  let html = '';

  // Status + personal toggles
  const st = it.status || 'open';
  html += `<div class="detail-section">
    <div class="detail-section-title">Status</div>
    <div class="status-lights">
      <button class="status-light open ${st==='open'?'active':''}" data-status="open" title="offen"></button>
      <button class="status-light limited ${st==='limited'?'active':''}" data-status="limited" title="eingeschränkt"></button>
      <button class="status-light closed ${st==='closed'?'active':''}" data-status="closed" title="geschlossen"></button>
    </div>
    <div class="toggle-row">
      <button class="action-btn${(it.planned||it.plannedAt||it.bookedAt)?' active-toggle':''}" data-toggle="planned">📅 Geplant</button>
      <button class="action-btn${it.done?' done-active':''}" data-toggle="done">✓ Erledigt</button>
      <button class="action-btn${it.fav?' fav-active':''}" data-toggle="fav">♥ Favorit</button>
    </div>
  </div>`;

  // Key facts
  html += `<div class="detail-section">
    <div class="detail-section-title">Kennwerte</div>
    <div class="facts-grid">
      <div class="fact-card"><label>Distanz</label><div>${fmtKm(p.dist_km)}</div></div>
      <div class="fact-card"><label>Dauer</label><div>${fmtMin(p.dur_min)}</div></div>
      <div class="fact-card"><label>Höhenunterschied</label><div>${p.ele_m!=null?p.ele_m+' m':'k.A.'}</div></div>
      <div class="fact-card"><label>Max / Min</label><div>${p.ele_high!=null?p.ele_high+' / '+p.ele_low+' m':'k.A.'}</div></div>
      <div class="fact-card"><label>GPX-Höhenmeter</label><div>${t&&t.profile?((safeGain(t).up!=null?'↗ '+safeGain(t).up+' m':'↗ k.A.')+' · '+(safeGain(t).down!=null?'↘ '+safeGain(t).down+' m':'↘ k.A.')):'k.A.'}</div></div>
      <div class="fact-card"><label>Anfahrt ab Hotel</label><div>${fmtKm(p.drive_km)} · ${fmtMin(plannedMin(p))}</div></div>
      <div class="fact-card"><label>Parkplatz / Gebühr</label><div>${esc(p.parking||'–')}${p.fee?' · €'+esc(p.fee):''}</div></div>
    </div>
  </div>`;

  // Elevation profile
  if (t && t.profile && t.profile.length > 2) {
    html += `<div class="detail-section"><div class="detail-section-title">Höhenprofil</div>${profileSVG(t)}</div>`;
  }

  // Links
  html += `<div class="detail-section">
    <div class="detail-section-title">Links & Infos</div>
    <div class="detail-actions">
      ${p.official_url ? `<a class="action-btn primary" href="${esc(p.official_url)}" target="_blank">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        Madeira.com</a>` : ''}
      <a class="action-btn" href="${esc(routeUrl(p))}" target="_blank">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        Route ab Hotel</a>
      <a class="action-btn" href="${esc(p.start_url||'https://maps.google.com/?q='+p.lat+','+p.lon)}" target="_blank">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Startpunkt</a>
      <a class="action-btn ig" href="${esc(socialUrl('ig',p))}" target="_blank">${igSVG()} Instagram</a>
      <a class="action-btn yt" href="${esc(socialUrl('yt',p))}" target="_blank">${ytSVG()} YouTube</a>
      <a class="action-btn goog" href="${esc(socialUrl('g',p))}" target="_blank">${googleSVG()} Google</a>
      <a class="action-btn" href="${esc(shuttleUrl(p))}" target="_blank">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
        Shuttle</a>
    </div>
  </div>`;

  // Planning
  const minDt = (state.base.start||CAL_START) + 'T00:00';
  const maxDt = (state.base.end||CAL_END) + 'T23:59';
  html += `<div class="detail-section">
    <div class="detail-section-title">Planung & Buchung</div>
    <div class="detail-fields two-col">
      <div class="detail-field"><label>Geplant am</label><input type="datetime-local" id="dPlannedAt" min="${minDt}" max="${maxDt}" value="${esc(it.plannedAt)}"></div>
      <div class="detail-field"><label>Gebuchter Slot ✓</label><input type="datetime-local" id="dBookedAt" min="${minDt}" max="${maxDt}" value="${esc(it.bookedAt)}"></div>
      <div class="detail-field full"><label>Notiz</label><textarea id="dNote" placeholder="Notizen zur Tour…">${esc(it.note)}</textarea></div>
    </div>
    <div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">
      <button class="action-btn primary" id="dSave">Speichern</button>
      <button class="action-btn danger-lite" id="dClearDates">Termine löschen</button>
      <button class="action-btn" id="dIcs">📅 ICS exportieren</button>
      <button class="action-btn" id="dMap">Auf Karte</button>
    </div>
  </div>`;

  $('#detailBody').innerHTML = html;
  openSheet('detailSheet');

  // Bind toggles
  $$('#detailBody [data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const it = getItem(p.id);
      const key = btn.dataset.toggle;
      if (key === 'planned') it.planned = !it.planned;
      else it[key] = !it[key];
      save(); openDetail(p); renderList();
    });
  });
  $$('#detailBody [data-status]').forEach(btn => {
    btn.addEventListener('click', () => { const it=getItem(p.id); it.status=btn.dataset.status; save(); openDetail(p); renderList(); if(currentTab==='map') drawMap(applyFilters()); });
  });

  $('#dSave')?.addEventListener('click', () => {
    const it = getItem(p.id);
    it.plannedAt = $('#dPlannedAt')?.value || '';
    it.bookedAt  = $('#dBookedAt')?.value  || '';
    it.note      = $('#dNote')?.value      || '';
    if (it.plannedAt && !withinVacation(it.plannedAt)) return toast('Geplant liegt außerhalb des Urlaubszeitraums');
    if (it.bookedAt && !withinVacation(it.bookedAt)) return toast('Slot liegt außerhalb des Urlaubszeitraums');
    if (it.plannedAt || it.bookedAt) it.planned = true;
    save(); toast('Gespeichert ✓'); openDetail(p); renderList(); renderCalendar();
  });
  $('#dClearDates')?.addEventListener('click', () => { const it=getItem(p.id); it.plannedAt=''; it.bookedAt=''; it.planned=false; save(); toast('Termine gelöscht'); openDetail(p); renderList(); renderCalendar(); });

  $('#dIcs')?.addEventListener('click', () => downloadIcs(p));
  $('#dMap')?.addEventListener('click', () => {
    closeSheet('detailSheet');
    switchTab('map');
    setTimeout(() => { initMap(); focusPR(p); }, 350);
  });
}

// ===== ELEVATION SVG =====
function trackGain(t) {
  if (!t || !t.profile || t.profile.length < 2) return {up:null, down:null};
  let up=0, down=0;
  for (let i=1;i<t.profile.length;i++) {
    const a=Number(t.profile[i-1][1]), b=Number(t.profile[i][1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const d=b-a;
    if (d>0) up+=d; else down+=Math.abs(d);
  }
  return {up:Math.round(up), down:Math.round(down)};
}

function profileSVG(t) {
  if (!t||!t.profile||t.profile.length<2) return '';
  const w=320,h=96,pad=10;
  const prof = t.profile.map(([x,y]) => [Number(x), Number(y)]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (prof.length < 2) return '<div class="oneway-warn">Kein belastbares Höhenprofil vorhanden.</div>';
  const xmax = prof[prof.length-1][0] || 1;
  const vals = prof.map(p=>p[1]);
  const ymin = Number.isFinite(Number(t.ele_min)) ? Number(t.ele_min) : Math.min(...vals);
  const ymax = Number.isFinite(Number(t.ele_max)) ? Number(t.ele_max) : Math.max(...vals);
  const rng  = ymax - ymin || 1;
  const pts  = prof.map(([x,y]) => [pad+x/xmax*(w-2*pad), h-pad-(y-ymin)/rng*(h-2*pad)]);
  const line = 'M'+pts.map(p=>p.join(',')).join(' L');
  const fill = line+` L${pts[pts.length-1][0]},${h-pad} L${pts[0][0]},${h-pad} Z`;
  return `<svg class="elevation-svg" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4cd98a" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#4cd98a" stop-opacity="0.02"/>
    </linearGradient></defs>
    <path d="${fill}" fill="url(#eg)"/>
    <path d="${line}" fill="none" stroke="#4cd98a" stroke-width="2" stroke-linejoin="round"/>
    <text x="${pad}" y="${h-2}" fill="#6a9478" font-size="9">${ymin} m</text>
    <text x="${w-pad}" y="${h-2}" fill="#6a9478" font-size="9" text-anchor="end">${ymax} m</text>
  </svg>`;
}

// ===== SOCIAL ICONS =====
function igSVG()     { return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#e1306c" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`; }
function ytSVG()     { return `<svg viewBox="0 0 24 24" width="15" height="15"><path fill="#ff0000" d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.95C18.88 4 12 4 12 4s-6.88 0-8.59.47A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon fill="white" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>`; }
function googleSVG() { return `<svg viewBox="0 0 24 24" width="15" height="15"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`; }

// ===== SHEET MANAGEMENT =====
function openSheet(id)  { document.getElementById(id).classList.add('open'); }
function closeSheet(id) { document.getElementById(id).classList.remove('open'); }

$('#filterBackdrop').addEventListener('click', () => closeSheet('filterSheet'));
$('#detailBackdrop').addEventListener('click', () => closeSheet('detailSheet'));
$('#detailClose').addEventListener('click',    () => closeSheet('detailSheet'));
let detailSwipeX=null; document.getElementById('detailSheet').addEventListener('touchstart', e=>{ detailSwipeX=e.touches[0].clientX; }, {passive:true}); document.getElementById('detailSheet').addEventListener('touchend', e=>{ if(detailSwipeX!==null && e.changedTouches[0].clientX-detailSwipeX>90) closeSheet('detailSheet'); detailSwipeX=null; }, {passive:true});

// ===== FILTER SHEET =====
$('#filterBtn').addEventListener('click', () => { syncFilterUI(); openSheet('filterSheet'); });

$('#filterReset').addEventListener('click', () => {
  state.filter = { search:'', level:'all', plan:'all', region:'all', driveKmMax:0, driveMinMax:0, trailKmMax:0, totalKmMax:0, eleMax:0 };
  $('#search').value = '';
  save(); syncFilterUI(); updateFilterBadge(); renderList();
  if (currentTab==='map') drawMap(applyFilters());
});

$('#filterApply').addEventListener('click', () => {
  closeSheet('filterSheet');
  renderList(); updateFilterBadge();
  if (currentTab==='map') drawMap(applyFilters());
});

function syncFilterUI() {
  $$('#levelPills  .pill-btn').forEach(b => b.classList.toggle('active', b.dataset.level   === state.filter.level));
  $$('#planPills   .pill-btn').forEach(b => b.classList.toggle('active', b.dataset.plan    === state.filter.plan));
  $$('#regionPills .pill-btn').forEach(b => b.classList.toggle('active', b.dataset.region  === state.filter.region));
  const map = [
    ['rDriveKm','driveKmMax','km','rDriveKmLabel'], ['rDriveMin','driveMinMax','min','rDriveMinLabel'],
    ['rTrailKm','trailKmMax','km','rTrailKmLabel'], ['rTotalKm','totalKmMax','km','rTotalKmLabel'], ['rEle','eleMax','m','rEleLabel']
  ];
  map.forEach(([id,key,suf,lid]) => { const el=$('#'+id), lab=$('#'+lid); if(el){el.value=state.filter[key]||0;} if(lab){lab.textContent=rangeLabel(state.filter[key]||0,suf);} });
}

$$('#levelPills  .pill-btn').forEach(b => b.addEventListener('click', () => { state.filter.level  = b.dataset.level;  state.map.selectedPois=null; save(); syncFilterUI(); }));
$$('#planPills   .pill-btn').forEach(b => b.addEventListener('click', () => { state.filter.plan   = b.dataset.plan;   state.map.selectedPois=null; save(); syncFilterUI(); }));
$$('#regionPills .pill-btn').forEach(b => b.addEventListener('click', () => { state.filter.region = b.dataset.region; state.map.selectedPois=null; save(); syncFilterUI(); }));

[['rDriveKm','driveKmMax','km','rDriveKmLabel'],['rDriveMin','driveMinMax','min','rDriveMinLabel'],['rTrailKm','trailKmMax','km','rTrailKmLabel'],['rTotalKm','totalKmMax','km','rTotalKmLabel'],['rEle','eleMax','m','rEleLabel']].forEach(([id,key,suf,lid])=>{
  document.addEventListener('input', e => {
    if (e.target && e.target.id === id) { state.filter[key] = Number(e.target.value||0); const lab=$('#'+lid); if(lab) lab.textContent = rangeLabel(state.filter[key],suf); save(); updateFilterBadge(); }
  });
});

// Search
$('#search').addEventListener('input', e => {
  state.filter.search = e.target.value;
  $('#searchClear').classList.toggle('hidden', !e.target.value);
  save(); renderList(); updateFilterBadge();
  if (currentTab==='map') drawMap(applyFilters());
});
$('#searchClear').addEventListener('click', () => {
  state.filter.search = ''; $('#search').value = '';
  $('#searchClear').classList.add('hidden');
  save(); renderList(); updateFilterBadge();
});

// ===== TAB BAR =====
// FIX: explicit per-button binding so nothing can fail silently
function switchTab(tab) {
  currentTab = tab;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  // Show/hide content panels
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === 'tab-' + tab);
  });

  // Show search only on list
  const sb = document.getElementById('searchbar');
  if (sb) sb.style.display = (tab === 'list') ? '' : 'none';

  if (tab === 'map') {
    setTimeout(() => { initMap(); if (mapInstance) { mapInstance.invalidateSize(); drawMap(applyFilters()); } }, 80);
    setTimeout(() => { if (mapInstance) { mapInstance.invalidateSize(); drawMap(applyFilters()); } }, 350);
  }
  if (tab === 'calendar') renderCalendar();
  if (tab === 'settings') renderSettings();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); switchTab(btn.dataset.tab); });
});

// ===== MAP =====
function initMap() {
  if (mapInstance) {
    // FIX: always force size recalculation when switching to map tab
    setTimeout(() => mapInstance.invalidateSize(), 200);
    return;
  }

  // FIX: make sure the map div is visible before L.map() runs
  const mapDiv = document.getElementById('map');
  if (!mapDiv) return;
  if (mapDiv.offsetWidth === 0 || mapDiv.offsetHeight === 0) {
    mapDiv.style.minHeight = '420px';
    setTimeout(initMap, 120);
    return;
  }
  if (typeof L === 'undefined') { toast('Kartenbibliothek konnte nicht geladen werden'); return; }

  mapInstance = L.map('map', { zoomControl:false }).setView([32.75,-16.95], 10);

  mapBaseLayers.osm  = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',     { attribution:'© OpenStreetMap', maxZoom:18 });
  mapBaseLayers.topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',        { attribution:'© OpenTopoMap',   maxZoom:17 });
  mapBaseLayers.sat  = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution:'© Esri', maxZoom:18 });

  const baseKey = state.map.base || 'osm';
  (mapBaseLayers[baseKey] || mapBaseLayers.osm).addTo(mapInstance);

  mapLayers.markers = L.layerGroup().addTo(mapInstance);
  mapLayers.tracks  = L.layerGroup().addTo(mapInstance);
  mapLayers.drives  = L.layerGroup().addTo(mapInstance);
  mapLayers.heat    = L.layerGroup().addTo(mapInstance);
  mapLayers.parking = L.layerGroup().addTo(mapInstance);
}

function drawMap(arr) {
  if (!mapInstance) return;
  arr = arr || applyFilters();
  if (state.map.selectedPois) arr = arr.filter(p => state.map.selectedPois.includes(p.id));
  Object.values(mapLayers).forEach(l => l.clearLayers());
  if (state.map.drives)  drawDrives(arr, false);
  if (state.map.heat)    drawDrives(arr, true);
  if (state.map.tracks)  drawTracks(arr);
  if (state.map.pins)    drawPins(arr);
  if (state.map.parking) drawParking(arr);
  fitAll();
}

function drawPins(arr) {
  arr.forEach(p => {
    if (p.lat == null) return;
    const it = getItem(p.id);
    const isSel = selectedId === p.id;
    const cls   = isSel ? 'pin pin-selected' : it.done ? 'pin pin-done' : (it.planned||it.plannedAt||it.bookedAt) ? 'pin pin-planned' : 'pin pin-default';
    const icon  = L.divIcon({ className:'', html:`<div class="${cls}">${esc(p.num.replace('PR ',''))}</div>`, iconSize: isSel?[38,28]:[32,22], iconAnchor: isSel?[19,14]:[16,11] });
    const m = L.marker([p.lat, p.lon], { icon, zIndexOffset: isSel?1000:10 }).addTo(mapLayers.markers);
    m.on('click', () => { selectedId = p.id; openDetail(p); });
  });
  // Hotel
  L.marker([state.base.lat, state.base.lon], {
    icon: L.divIcon({ className:'', html:'<div class="pin pin-hotel">🏨</div>', iconSize:[28,28], iconAnchor:[14,14] }),
    zIndexOffset: 500
  }).addTo(mapLayers.markers).bindPopup(esc(state.base.name));
}

function drawTracks(arr) {
  arr.forEach(p => {
    const t = TRACKS[p.id];
    if (!t||!t.coords) return;
    L.polyline(t.coords, { color: selectedId===p.id?'#ffb13b':state.style.prColor, weight: selectedId===p.id?5:state.style.prWeight, opacity:0.85 }).addTo(mapLayers.tracks);
  });
}

function drawDrives(arr, heat) {
  arr.forEach(p => {
    const d = DRIVES[p.id]; if (!d) return;
    const it = getItem(p.id);
    const color = heat ? state.style.heatColor : state.style.driveColor;
    const op    = heat ? (it.done?.6:(it.planned||it.plannedAt||it.bookedAt)?.45:.2) : .55;
    L.polyline(d.coords, { color, weight: heat?state.style.heatWeight:state.style.driveWeight, opacity:op, dashArray:heat?null:(state.style.driveDash||'6,6') }).addTo(heat?mapLayers.heat:mapLayers.drives);
  });
}

function drawParking(arr) {
  arr.forEach(p => {
    const d  = DRIVES[p.id];
    const pt = d ? d.end : (p.lat?[p.lat,p.lon]:null);
    if (!pt) return;
    L.marker(pt, { icon: L.divIcon({ className:'', html:'<div class="pin pin-parking">P</div>', iconSize:[20,20], iconAnchor:[10,10] }) })
      .addTo(mapLayers.parking).bindPopup(`<b>${esc(p.num)}</b> Parkplatz`);
  });
}

function fitAll() {
  try {
    const fg = L.featureGroup();
    Object.values(mapLayers).forEach(l => l.eachLayer(x => fg.addLayer(x)));
    if (fg.getLayers().length) mapInstance.fitBounds(fg.getBounds().pad(0.08));
  } catch(e) {}
}

function focusPR(p) {
  initMap();
  selectedId = p.id;
  let fg = L.featureGroup();
  if (TRACKS[p.id]) fg.addLayer(L.polyline(TRACKS[p.id].coords));
  if (DRIVES[p.id]) fg.addLayer(L.polyline(DRIVES[p.id].coords));
  if (p.lat) fg.addLayer(L.marker([p.lat, p.lon]));
  try { mapInstance.fitBounds(fg.getBounds().pad(0.15)); } catch(e) { if(p.lat) mapInstance.setView([p.lat,p.lon],13); }
  drawMap(applyFilters());
}

// Map control panel
$('#mapControlBtn').addEventListener('click', e => { e.stopPropagation(); toggleMapPanel(); });
document.getElementById('map').addEventListener('click', () => { if (mapPanelOpen) toggleMapPanel(); });

function toggleMapPanel() {
  mapPanelOpen = !mapPanelOpen;
  $('#mapPanel').classList.toggle('hidden', !mapPanelOpen);
  if (mapPanelOpen) renderMapPanel();
}

function renderMapPanel() {
  $('#ovPins').checked    = state.map.pins;
  $('#ovTracks').checked  = state.map.tracks;
  $('#ovDrives').checked  = state.map.drives;
  $('#ovHeat').checked    = state.map.heat;
  $('#ovParking').checked = state.map.parking;
  $$('#mapPanel [data-base]').forEach(b => b.classList.toggle('active', b.dataset.base === (state.map.base||'osm')));

  // POI checklist – show planned first, then all from filter
  const filteredArr = applyFilters();
  const showList = filteredArr.slice(0, 20);
  $('#mapPoiFilter').innerHTML = showList.map(p => {
    const it = getItem(p.id);
    const isPlan = it.planned||it.plannedAt||it.bookedAt;
    const checked = !state.map.selectedPois || state.map.selectedPois.includes(p.id);
    return `<label class="poi-filter-row${isPlan?' planned-item':''}">
      <input type="checkbox" data-poi="${p.id}" ${checked?'checked':''}>${esc(p.num)} ${esc(p.name)}
    </label>`;
  }).join('');

  $$('#mapPoiFilter input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    const allPois   = $$('#mapPoiFilter input[type=checkbox]').map(x=>x.dataset.poi);
    const checked   = $$('#mapPoiFilter input[type=checkbox]:checked').map(x=>x.dataset.poi);
    state.map.selectedPois = checked.length === allPois.length ? null : checked;
    save(); drawMap(applyFilters());
  }));
}

// Layer toggles
[['ovPins','pins'],['ovTracks','tracks'],['ovDrives','drives'],['ovHeat','heat'],['ovParking','parking']].forEach(([id,key]) => {
  document.getElementById(id)?.addEventListener('change', e => { state.map[key]=e.target.checked; save(); drawMap(applyFilters()); });
});

// Base layer pills in map panel
$$('#mapPanel [data-base]').forEach(b => b.addEventListener('click', () => {
  state.map.base = b.dataset.base;
  Object.values(mapBaseLayers).forEach(l => { try{ mapInstance.removeLayer(l); }catch(e){} });
  (mapBaseLayers[b.dataset.base]||mapBaseLayers.osm).addTo(mapInstance);
  $$('#mapPanel [data-base]').forEach(x => x.classList.toggle('active', x.dataset.base===b.dataset.base));
  save();
}));

// Locate
$('#locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return toast('Standort nicht verfügbar');
  navigator.geolocation.getCurrentPosition(pos => {
    const {latitude:lat, longitude:lon} = pos.coords;
    if (userMarker) mapInstance.removeLayer(userMarker);
    userMarker = L.marker([lat,lon]).addTo(mapInstance).bindPopup('Du bist hier').openPopup();
    mapInstance.setView([lat,lon],13);
  }, () => toast('Standortfreigabe prüfen'), {enableHighAccuracy:true,timeout:10000,maximumAge:30000});
});

// ===== CALENDAR =====
function renderCalendar() {
  const days  = dateRange(state.base.start||CAL_START, state.base.end||CAL_END);
  const today = new Date().toISOString().slice(0,10);
  let byDay = {};
  POIS.forEach(p => {
    const it   = getItem(p.id);
    const date = (it.bookedAt||it.plannedAt||'').slice(0,10);
    if (date) (byDay[date] = byDay[date]||[]).push({p,it});
  });

  let html = `<div class="cal-ics-all"><button class="cal-ics-btn" id="icsAll">📅 Alle ICS exportieren</button></div>`;

  days.forEach(d => {
    const date    = new Date(d+'T00:00:00');
    const dayName = date.toLocaleDateString('de-DE',{weekday:'long'});
    const dateStr = date.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});
    const isToday = d === today;
    const entries = byDay[d] || [];

    html += `<div class="cal-day${isToday?' today':''}">
      <div class="cal-day-header">
        <div><div class="cal-date-main">${dayName}</div><div class="cal-date-sub">${dateStr}</div></div>
        ${entries.length ? `<div class="cal-date-sub">${entries.length} Tour${entries.length>1?'en':''}</div>` : ''}
      </div>`;

    if (!entries.length) {
      html += `<div class="cal-day-free">Freier Tag</div>`;
    } else {
      entries.forEach(({p,it}) => {
        const raw  = it.bookedAt||it.plannedAt||'';
        const time = raw.includes('T') ? new Date(raw).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) : '';
        html += `<div class="cal-item" data-cal="${p.id}">
          <div class="cal-item-num">${esc(p.num)}</div>
          <div class="cal-item-name">${esc(p.name)}</div>
          ${time?`<div class="cal-item-time">${time}</div>`:''}
          <div class="cal-item-badge ${it.bookedAt?'booked':'planned'}">${it.bookedAt?'✓ Gebucht':'Geplant'}</div>
        </div>`;
      });
    }
    html += `</div>`;
  });

  $('#calendar').innerHTML = html;
  $$('.cal-item[data-cal]').forEach(el => {
    el.addEventListener('click', () => { const p=POIS.find(x=>x.id===el.dataset.cal); if(p) openDetail(p); });
  });
  $('#icsAll')?.addEventListener('click', downloadAllIcs);
}

// ===== ICS =====
function downloadIcs(p) {
  const it = getItem(p.id);
  const dt = it.bookedAt||it.plannedAt;
  if (!dt) return toast('Kein Termin eingetragen');
  const start = new Date(dt), end = new Date(start.getTime()+(p.dur_min||120)*60000);
  const pad = n => String(n).padStart(2,'0');
  const fmt = x => x.getUTCFullYear()+pad(x.getUTCMonth()+1)+pad(x.getUTCDate())+'T'+pad(x.getUTCHours())+pad(x.getUTCMinutes())+'00Z';
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Madeira PR Explorer//DE\r\nBEGIN:VEVENT\r\nUID:${p.id}@madeira-pr\r\nSUMMARY:${p.num} ${p.name}\r\nDTSTART:${fmt(start)}\r\nDTEND:${fmt(end)}\r\nDESCRIPTION:${[p.region,levelLabel(p.level),fmtKm(p.dist_km),fmtMin(p.dur_min)].filter(Boolean).join(' · ')}\r\nLOCATION:${p.lat},${p.lon}\r\nURL:${p.official_url||''}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  dlFile(p.id+'.ics', ics, 'text/calendar');
  toast('ICS exportiert');
}

function downloadAllIcs() {
  const events = POIS.filter(p=>{ const it=getItem(p.id); return it.bookedAt||it.plannedAt; });
  if (!events.length) return toast('Keine Termine eingetragen');
  const pad = n => String(n).padStart(2,'0');
  const fmt = x => x.getUTCFullYear()+pad(x.getUTCMonth()+1)+pad(x.getUTCDate())+'T'+pad(x.getUTCHours())+pad(x.getUTCMinutes())+'00Z';
  const vevent = events.map(p => {
    const it=getItem(p.id), start=new Date(it.bookedAt||it.plannedAt), end=new Date(start.getTime()+(p.dur_min||120)*60000);
    return `BEGIN:VEVENT\r\nUID:${p.id}@madeira-pr\r\nSUMMARY:${p.num} ${p.name}\r\nDTSTART:${fmt(start)}\r\nDTEND:${fmt(end)}\r\nLOCATION:${p.lat},${p.lon}\r\nURL:${p.official_url||''}\r\nEND:VEVENT`;
  }).join('\r\n');
  dlFile('madeira-touren.ics', `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Madeira PR Explorer//DE\r\n${vevent}\r\nEND:VCALENDAR`, 'text/calendar');
  toast(`${events.length} Termine exportiert`);
}

// ===== SETTINGS =====
function renderSettings() {
  const shareText = 'https://wa.me/?text=' + encodeURIComponent(
    '🏔 Madeira Wanderplan:\n' +
    POIS.filter(p=>{const it=getItem(p.id);return it.planned||it.bookedAt||it.fav;})
        .map(p=>{const it=getItem(p.id); return `${p.num}: ${it.bookedAt?'✓ '+dateLabel(it.bookedAt):it.plannedAt?'📅 '+dateLabel(it.plannedAt):'♥'} – ${p.name}`;})
        .join('\n')
  );

  $('#settings-body').innerHTML = `
    <div class="settings-section">
      <div class="settings-label">Urlaub</div>
      <div class="settings-group">
        <div class="settings-row"><label>Von</label><input type="date" id="sStart" value="${esc(state.base.start||CAL_START)}"></div>
        <div class="settings-row"><label>Bis</label><input type="date" id="sEnd"   value="${esc(state.base.end||CAL_END)}"></div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-label">Starthotel</div>
      <div class="settings-group">
        <div class="settings-row"><label>Name</label><input type="text" id="sName" value="${esc(state.base.name)}"></div>
        <div class="settings-row"><label>Breitengrad</label><input type="number" id="sLat" step="0.0001" value="${state.base.lat}"></div>
        <div class="settings-row"><label>Längengrad</label><input type="number" id="sLon" step="0.0001" value="${state.base.lon}"></div>
        <div class="settings-row"><label>Fahrtfaktor</label><input type="number" id="sFactor" step="0.1" min="1" max="3" value="${state.base.factor}"></div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-label">Kartendarstellung</div>
      <div class="settings-group">
        <div class="settings-row"><label>Track-Farbe</label><input type="color" id="sPrColor" value="${state.style.prColor}"></div>
        <div class="settings-row"><label>Track-Stärke</label><input type="number" id="sPrWeight" min="1" max="8" value="${state.style.prWeight}"></div>
        <div class="settings-row"><label>Anfahrt-Farbe</label><input type="color" id="sDriveColor" value="${state.style.driveColor}"></div>
        <div class="settings-row"><label>Anfahrt-Linienart</label><select id="sDriveDash"><option value="">durchgezogen</option><option value="6,6">gestrichelt</option><option value="2,8">gepunktet</option></select></div>
        <div class="settings-row"><label>Heatmap-Farbe</label><input type="color" id="sHeatColor" value="${state.style.heatColor}"></div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-label">Teilen</div>
      <div class="settings-group">
        <div style="padding:12px 14px;display:flex;flex-direction:column;gap:8px">
          <a class="settings-btn accent-btn" href="${esc(shareText)}" target="_blank">📤 Planungsstand per WhatsApp teilen</a>
          <button class="settings-btn" id="exportState">💾 Planungsstand als JSON exportieren</button>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-label">Daten</div>
      <div class="settings-group">
        <div style="padding:10px 14px">
          <button class="settings-btn danger" id="resetAll">⚠ Alle Markierungen zurücksetzen</button>
        </div>
      </div>
    </div>
    <div style="text-align:center;padding:20px 0 8px;font-size:11px;color:var(--text3)">
      Madeira PR Explorer v11.4 · ${POIS.length} Touren · ${Object.keys(TRACKS).length} GPX · ${Object.keys(DRIVES).length} Anfahrten
    </div>`;

  $('#sStart')?.addEventListener('change',  e => { state.base.start=e.target.value; save(); });
  $('#sEnd')?.addEventListener('change',    e => { state.base.end=e.target.value;   save(); });
  $('#sName')?.addEventListener('change',   e => { state.base.name=e.target.value;  save(); });
  $('#sLat')?.addEventListener('change',    e => { state.base.lat=parseFloat(e.target.value);   save(); });
  $('#sLon')?.addEventListener('change',    e => { state.base.lon=parseFloat(e.target.value);   save(); });
  $('#sFactor')?.addEventListener('change', e => { state.base.factor=parseFloat(e.target.value)||1.2; save(); });
  $('#sPrColor')?.addEventListener('input', e => { state.style.prColor=e.target.value;    save(); if(currentTab==='map') drawMap(applyFilters()); });
  $('#sPrWeight')?.addEventListener('input',e => { state.style.prWeight=+e.target.value;  save(); if(currentTab==='map') drawMap(applyFilters()); });
  $('#sDriveColor')?.addEventListener('input',e=>{ state.style.driveColor=e.target.value; save(); if(currentTab==='map') drawMap(applyFilters()); });
  $('#sDriveDash') && ($('#sDriveDash').value = state.style.driveDash || '6,6');
  $('#sDriveDash')?.addEventListener('change',e=>{ state.style.driveDash=e.target.value; save(); if(currentTab==='map') drawMap(applyFilters()); });
  $('#sHeatColor')?.addEventListener('input', e=>{ state.style.heatColor=e.target.value;  save(); if(currentTab==='map') drawMap(applyFilters()); });

  $('#exportState')?.addEventListener('click', () => {
    dlFile('madeira-plan-'+new Date().toISOString().slice(0,10)+'.json', JSON.stringify(state.items,null,2), 'application/json');
    toast('Exportiert');
  });
  $('#resetAll')?.addEventListener('click', () => {
    if (!confirm('Wirklich alle Markierungen löschen?')) return;
    state.items = {}; save(); renderList(); toast('Zurückgesetzt');
  });
}

// ===== INIT =====
renderList();
updateFilterBadge();
syncFilterUI();
window.addEventListener('resize', () => { if (mapInstance) setTimeout(()=>mapInstance.invalidateSize(),120); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

