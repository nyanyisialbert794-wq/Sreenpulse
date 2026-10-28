const API = 'https://api.tvmaze.com';
const $ = (id) => document.getElementById(id);
let currentQuery = 'popular';
let page = 0;
let currentShows = [];
let loading = false;
let toastTimer;

function cleanText(html='') {
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || el.innerText || '').replace(/\s+/g, ' ').trim();
}
function escapeHtml(value='') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function dateLabel(date) {
  if (!date) return 'Release date TBA';
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
}
function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>toast.classList.remove('show'),3000);
}
function setUpdated() {
  $('lastUpdated').textContent = `TV data refreshed ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
}
function posterFor(show) {
  return show.image?.medium || show.image?.original || '';
}
function cardMarkup(show) {
  const image = posterFor(show);
  const genres = (show.genres || []).slice(0,2).map(g=>`<span class="genre">${escapeHtml(g)}</span>`).join('');
  const rating = show.rating?.average ? `<span class="rating">★ ${escapeHtml(show.rating.average)}</span>` : '';
  const premiered = show.premiered ? new Date(`${show.premiered}T12:00:00`).getFullYear() : (show.status || 'TV show');
  const summary = cleanText(show.summary || 'Summary not available yet. Open the source page to learn more about this show.');
  return `<article class="show-card">
    <div class="poster">${image ? `<img loading="lazy" src="${escapeHtml(image)}" alt="${escapeHtml(show.name)} poster" onerror="this.remove()">` : `<div class="poster-placeholder">SP</div>`}${rating}</div>
    <div class="card-body"><h3 class="card-title">${escapeHtml(show.name || 'Untitled show')}</h3>
    <div class="card-meta">${escapeHtml(String(premiered))}${show.network?.name ? ' · '+escapeHtml(show.network.name) : show.webChannel?.name ? ' · '+escapeHtml(show.webChannel.name) : ''}</div>
    <div class="genres">${genres || '<span class="genre">TV</span>'}</div>
    <p class="card-summary">${escapeHtml(summary || 'Discover cast, episodes and more details.')}</p>
    <a class="card-link" href="${escapeHtml(show.url || 'https://www.tvmaze.com/')}" target="_blank" rel="noopener noreferrer">VIEW SHOW DETAILS ↗</a></div></article>`;
}
function renderShows(shows, append=false) {
  const grid = $('showGrid');
  if (!append) grid.innerHTML = '';
  if (!shows.length && !append) {
    grid.innerHTML = '<div class="schedule-empty">No shows found. Try a different search.</div>'; return;
  }
  grid.insertAdjacentHTML('beforeend', shows.map(cardMarkup).join(''));
}
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Data source returned ${res.status}`);
  return res.json();
}
async function loadPopular(append=false) {
  if (loading) return;
  loading = true;
  if (!append) $('showGrid').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  $('resultNote').textContent = 'Fetching show recommendations…';
  try {
    // TVmaze search is used for broad discovery because the API does not expose a universal popularity endpoint.
    const terms = ['stranger things','the last of us','the bear','silo','slow horses','only murders in the building','severance','the rookie','abbott elementary','the boys','doctor who','the good place','arcane','one piece','foundation','the office'];
    const start = page * 4;
    const selected = terms.slice(start, start+4);
    const lists = await Promise.all(selected.map(term=>getJson(`${API}/search/shows?q=${encodeURIComponent(term)}`).catch(()=>[])));
    const shows = lists.map(list=>list[0]?.show).filter(Boolean);
    const seen = new Set(currentShows.map(s=>s.id));
    const unique = shows.filter(s=>!seen.has(s.id));
    currentShows = append ? currentShows.concat(unique) : unique;
    renderShows(unique, append);
    $('resultNote').textContent = 'Curated discovery picks · Show details and images supplied by TVmaze';
    setUpdated();
  } catch (err) {
    if (!append) $('showGrid').innerHTML = `<div class="schedule-empty">Couldn't reach the live TV data source. Check your connection and try again. <button class="button button-ghost" onclick="location.reload()">Retry</button></div>`;
    $('resultNote').textContent = 'Live data is temporarily unavailable.';
  } finally { loading = false; }
}
async function searchShows(query, label=query) {
  currentQuery = query; page = 0; currentShows = [];
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('selected',c.dataset.query===query));
  $('resultNote').textContent = `Searching for “${label}”…`;
  $('showGrid').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  try {
    let shows = [];
    if (query === 'popular') {
      await loadPopular(false); return;
    } else {
      const results = await getJson(`${API}/search/shows?q=${encodeURIComponent(query)}`);
      shows = results.map(r=>r.show).filter(Boolean);
    }
    currentShows = shows;
    renderShows(shows);
    $('resultNote').textContent = `${shows.length} result${shows.length===1?'':'s'} for “${label}” · Results from TVmaze`;
    setUpdated();
  } catch (e) {
    $('showGrid').innerHTML = '<div class="schedule-empty">Search is unavailable right now. Please try again shortly.</div>';
    $('resultNote').textContent = 'Could not complete search.';
  }
}
async function loadSchedule() {
  const country = $('countrySelect').value;
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  $('scheduleDate').textContent = today.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  $('scheduleList').innerHTML = '<div class="schedule-empty">Loading episodes…</div>';
  try {
    const eps = await getJson(`${API}/schedule?country=${encodeURIComponent(country)}&date=${date}`);
    const items = eps.filter(e=>e.show).sort((a,b)=>(a.airtime||'').localeCompare(b.airtime||'')).slice(0,35);
    if (!items.length) {
      $('scheduleList').innerHTML = '<div class="schedule-empty">No episodes found for this date and country. Try another country or check back later.</div>'; return;
    }
    $('scheduleList').innerHTML = items.map(ep=>{
      const image = ep.show.image?.medium || '';
      const time = ep.airtime || 'TBA';
      const epCode = [ep.season ? `S${String(ep.season).padStart(2,'0')}` : '',ep.number ? `E${String(ep.number).padStart(2,'0')}` : ''].filter(Boolean).join('');
      const title = ep.name || 'Episode title TBA';
      return `<article class="schedule-item"><div class="episode-time">${escapeHtml(time)}</div>${image?`<img class="episode-thumb" loading="lazy" src="${escapeHtml(image)}" alt="" onerror="this.style.visibility='hidden'">`:'<div class="episode-thumb"></div>'}<div><div class="episode-name">${escapeHtml(ep.show.name)}${epCode?' · '+escapeHtml(epCode):''}</div><div class="episode-details">${escapeHtml(title)}${ep.runtime?' · '+escapeHtml(String(ep.runtime))+' min':''}</div></div><a class="episode-link" href="${escapeHtml(ep.url || ep.show.url || 'https://www.tvmaze.com/')}" target="_blank" rel="noopener noreferrer">DETAILS ↗</a></article>`;
    }).join('');
    setUpdated();
  } catch(e) {
    $('scheduleList').innerHTML = '<div class="schedule-empty">Could not load the schedule right now. Try again in a moment.</div>';
  }
}
$('searchForm').addEventListener('submit', e=>{
  e.preventDefault(); const q=$('searchInput').value.trim();
  if (q) searchShows(q);
});
document.querySelectorAll('.chip').forEach(chip=>chip.addEventListener('click',()=>{
  const q=chip.dataset.query;
  if (q==='popular') searchShows('popular','Popular picks');
  else searchShows(q,chip.textContent.trim());
}));
$('loadMore').addEventListener('click',()=>{
  if (currentQuery !== 'popular') { showToast('Search for a topic to explore more matching shows.'); return; }
  page++; loadPopular(true);
});
$('countrySelect').addEventListener('change',loadSchedule);
$('themeToggle').addEventListener('click',()=>{
  document.body.classList.toggle('light-mode');
  const light=document.body.classList.contains('light-mode');
  $('themeToggle').textContent=light?'☾':'☼';
  $('themeToggle').setAttribute('aria-label',light?'Switch to dark mode':'Switch to light mode');
});
$('year').textContent=new Date().getFullYear();
loadPopular(false);
loadSchedule();
