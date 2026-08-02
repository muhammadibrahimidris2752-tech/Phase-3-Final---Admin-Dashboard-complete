/* ============================================================
   Search: recent-searches persistence + the search overlay's
   open/close/back/clear behaviour.

   Split out of ui.js (Phase 1) since search grew from a single
   slide-down input into its own small feature with persisted
   state. Reuses ui.js's togglePanel()/isPageActive() rather than
   duplicating that logic.

   toggleSearch(force) keeps its original name/signature on purpose —
   it's called two ways that both need to keep working: the header
   search icon (no argument — toggle open/closed) and showPage()
   force-closing search on navigation (toggleSearch(false)). Desktop
   still uses this exact function; the extra back/clear/recent-search
   UI it now also manages is CSS-hidden above the mobile breakpoint,
   so desktop's visible behaviour is unchanged.
   ================================================================ */
import { setState, isPageActive } from './store.js';
import { togglePanel, showPage, renderSearchResults } from './ui.js';

const RECENT_SEARCHES_KEY = 'khn_recent_searches_v1';
const MAX_RECENT_SEARCHES = 8;

function loadRecentSearches(){
  try {
    const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch(e){
    return [];
  }
}
function saveRecentSearches(list){
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch(e){
    // storage full or blocked — search still works for this session
  }
}
function addRecentSearch(term){
  const trimmed = term.trim();
  if(!trimmed) return;
  let list = loadRecentSearches().filter(t => t.toLowerCase() !== trimmed.toLowerCase());
  list.unshift(trimmed);
  saveRecentSearches(list.slice(0, MAX_RECENT_SEARCHES));
}
export function removeRecentSearch(term){
  saveRecentSearches(loadRecentSearches().filter(t => t !== term));
  renderRecentSearches();
}
export function useRecentSearch(term){
  const input = document.getElementById('searchInput');
  if(input) input.value = term;
  handleSearchInput();
}
export function renderRecentSearches(){
  const el = document.getElementById('recentSearchesList');
  if(!el) return;
  const input = document.getElementById('searchInput');
  const hasQuery = !!(input && input.value.trim());
  const list = loadRecentSearches();
  if(hasQuery || list.length === 0){
    el.innerHTML = '';
    return;
  }
  const escape = s => s.replace(/'/g, "\\'");
  el.innerHTML = `
    <div class="recent-searches-heading">Recent Searches</div>
    ${list.map(term => `
      <div class="recent-search-item">
        <button class="recent-search-term" onclick="useRecentSearch('${escape(term)}')">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          <span>${term}</span>
        </button>
        <button class="recent-search-remove" onclick="removeRecentSearch('${escape(term)}')" aria-label="Remove ${term}">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('')}
  `;
}

export function openSearchOverlay(){
  document.getElementById('siteHeader').classList.add('search-mode');
  document.body.classList.add('search-active');
  document.body.classList.remove('has-query');
  togglePanel('searchBar', true);
  renderRecentSearches();
  renderSearchResults('');
  setTimeout(()=>{ const inp=document.getElementById('searchInput'); if(inp) inp.focus(); }, 150);
}
export function closeSearchOverlay(){
  const input = document.getElementById('searchInput');
  if(input && input.value.trim()) addRecentSearch(input.value);
  document.getElementById('siteHeader').classList.remove('search-mode');
  document.body.classList.remove('search-active', 'has-query');
  togglePanel('searchBar', false);
  if(input) input.value = '';
  setState({ search: '' });
  renderSearchResults('');
}
/** Clears the text instantly without closing the overlay — the × next to the field. */
export function clearSearchInput(){
  const input = document.getElementById('searchInput');
  if(input) input.value = '';
  document.body.classList.remove('has-query');
  setState({ search: '' });
  renderRecentSearches();
  renderSearchResults('');
  if(input) input.focus();
}
export function toggleSearch(force){
  const panel = document.getElementById('searchBar');
  const isOpen = panel.classList.contains('open');
  const shouldOpen = typeof force === 'boolean' ? force : !isOpen;
  if(shouldOpen) openSearchOverlay(); else closeSearchOverlay();
}
export function handleSearchInput(){
  if(!isPageActive('catalog')) showPage('catalog');
  const value = document.getElementById('searchInput').value;
  document.body.classList.toggle('has-query', !!value.trim());
  setState({ search: value });
  renderRecentSearches();
  renderSearchResults(value);
}
