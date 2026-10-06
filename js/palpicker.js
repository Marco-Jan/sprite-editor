// ════════════════════════════════════════════════════════════════════
// PALPICKER — Paletten-Auswahl mit Suche, Filter und klappbaren Gruppen
// ════════════════════════════════════════════════════════════════════
// Ersetzt das schlichte <select> an zwei Stellen: im Paletten-Panel und im
// "Neuer Sprite"-Dialog. Ein <select> kann weder Gruppen einklappen noch
// Farben zeigen — hier hat jede Palette eine Zeile mit Name, Farbstreifen
// und Anzahl.
//
//   const picker = createPalettePicker(host, { onSelect, activeName });
//   picker.render('golden');   // neu aufbauen, 'golden' als gewählt markieren
//
// Suchtext und Filter gehören zur einzelnen Auswahl; welche Gruppen
// eingeklappt sind, merkt sich der Browser für alle gemeinsam.
import { getAllPaletteOptions, getPaletteByName } from './state.js';
import { paletteSize } from './data.js';
import { t, tn } from './i18n.js';

const FOLD_KEY = 'spritebit_palette_groups';
const STRIP_MAX = 16;   // so viele Farben zeigt der Streifen höchstens

function loadFolded() {
  try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch { return {}; }
}
function saveFolded(f) {
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(f)); } catch {}
}

function strip(pal) {
  const n = paletteSize(pal);
  const step = Math.max(1, n / STRIP_MAX);
  let html = '';
  for (let k = 0; k < Math.min(n, STRIP_MAX); k++) {
    const c = pal[Math.floor(1 + k * step)] || 'transparent';
    html += `<i style="background:${c}"></i>`;
  }
  return html;
}

export function createPalettePicker(host, { onSelect, activeName = () => null }) {
  let selected = null;
  let query = '';
  let filter = 'all';   // 'all' | 'builtin' | 'custom'

  host.classList.add('pp');
  host.innerHTML = `
    <div class="pp-tools">
      <input type="search" class="input input--sm pp-search" autocomplete="off">
      <div class="pp-filter" role="group">
        <button type="button" class="pp-chip" data-filter="all"></button>
        <button type="button" class="pp-chip" data-filter="builtin"></button>
        <button type="button" class="pp-chip" data-filter="custom"></button>
      </div>
    </div>
    <div class="pp-list" role="listbox"></div>`;
  const search = host.querySelector('.pp-search');
  const list = host.querySelector('.pp-list');

  search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); build(); });
  host.querySelector('.pp-filter').addEventListener('click', e => {
    const f = e.target.closest('[data-filter]')?.dataset.filter;
    if (f) { filter = f; build(); }
  });
  list.addEventListener('click', e => {
    const head = e.target.closest('.pp-group-head');
    if (head) {
      const folded = loadFolded();
      folded[head.dataset.group] = !folded[head.dataset.group];
      saveFolded(folded);
      build();
      return;
    }
    const item = e.target.closest('.pp-item');
    if (item) { selected = item.dataset.name; build(); onSelect(selected); }
  });

  function build() {
    search.placeholder = t('pp.search');
    host.querySelectorAll('.pp-chip').forEach(c => {
      c.textContent = t({ all: 'pp.all', builtin: 'pal.groupBuiltin', custom: 'pal.groupCustom' }[c.dataset.filter]);
      c.setAttribute('aria-pressed', String(c.dataset.filter === filter));
    });

    const opts = getAllPaletteOptions().filter(o => !query || o.name.toLowerCase().includes(query));
    const groups = [
      { id: 'builtin', label: t('pal.groupBuiltin'), items: opts.filter(o => !o.isCustom) },
      { id: 'custom',  label: t('pal.groupCustom'),  items: opts.filter(o => o.isCustom) },
    ].filter(g => filter === 'all' || filter === g.id);

    const folded = loadFolded();
    const active = activeName();
    let html = '';
    let shown = 0;
    for (const g of groups) {
      if (!g.items.length) continue;
      shown += g.items.length;
      // Beim Suchen sind Gruppen immer offen — sonst findet man nichts.
      const open = query || !folded[g.id];
      html += `<section class="pp-group">
        <button type="button" class="pp-group-head" data-group="${g.id}" aria-expanded="${!!open}">
          <span class="pp-caret" aria-hidden="true"></span>${g.label}<span class="pp-count">${g.items.length}</span>
        </button>`;
      if (open) {
        html += '<div class="pp-items">';
        for (const o of g.items) {
          const pal = getPaletteByName(o.name);
          const n = paletteSize(pal);
          const sel = o.name === selected;
          html += `<button type="button" role="option" class="pp-item${sel ? ' is-selected' : ''}"
              data-name="${o.name}" aria-selected="${sel}" title="${tn('pp.colors', n)}">
            <span class="pp-name">${o.name}</span>
            ${o.name === active ? `<span class="pp-active" title="${t('pp.activeTitle')}">${t('pp.active')}</span>` : ''}
            <span class="pp-strip" aria-hidden="true">${strip(pal)}</span>
            <span class="pp-size">${n}</span>
          </button>`;
        }
        html += '</div>';
      }
      html += '</section>';
    }
    list.innerHTML = shown ? html : `<p class="pp-none">${t('pp.none')}</p>`;
    list.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  }

  return {
    render(name) { selected = name; build(); },
    get value() { return selected; },
  };
}
