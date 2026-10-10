// ════════════════════════════════════════════════════════════════════
// TABS — Reiter der geöffneten Sprites über der Zeichenfläche
// ════════════════════════════════════════════════════════════════════
// Wie in Grafikprogrammen üblich: ein Reiter je geöffnetem Sprite. Klick
// wechselt, × oder Mittelklick schließt den Reiter (der Sprite bleibt im
// Projekt), Doppelklick benennt um, Ziehen ordnet, + legt einen neuen an.
// Die Rechnung steht in js/tablist.js; hier nur DOM und Verdrahtung.
//
// state.openTabs hält die Reihenfolge und wird mitgespeichert. Was den
// aktiven Sprite wechselt (Sprites-Panel, neu, duplizieren, Undo), öffnet
// seinen Reiter von selbst — renderTabs() gleicht bei jedem renderAll() ab.
import { state, sprites } from './state.js';
import { renderCallbacks } from './render.js';
import { selectSprite } from './sprites.js';
import { saveState } from './storage.js';
import { syncTabs, closeTab, moveTab } from './tablist.js';
import { t } from './i18n.js';
import { iconSvg } from './icons.js';

const $ = id => document.getElementById(id);
let dragId = null;

/** Reiter an den Projektstand anpassen (ohne zu zeichnen). */
export function syncOpenTabs() {
  state.openTabs = syncTabs(state.openTabs, Object.keys(sprites), state.curSprite);
  return state.openTabs;
}

function close(id) {
  const r = closeTab(syncOpenTabs(), id, state.curSprite);
  state.openTabs = r.tabs;
  if (r.cur && r.cur !== state.curSprite) selectSprite(r.cur); // zeichnet und speichert
  else { renderTabs(); saveState(); }
}

export function renderTabs() {
  const bar = $('sprite-tabs');
  if (!bar) return;
  const tabs = syncOpenTabs();
  const list = bar.querySelector('.tab-list');
  list.replaceChildren();
  const closable = tabs.length > 1;
  bar.classList.toggle('is-single', !closable); // Handy: Zeile erst ab zwei (CSS)
  for (const id of tabs) {
    const sp = sprites[id];
    const active = id === state.curSprite;
    const tab = document.createElement('div');
    tab.className = 'sprite-tab' + (active ? ' is-active' : '');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.draggable = true;
    tab.dataset.id = id;
    tab.title = t('list.cardTitle', { name: sp.name, w: sp.grid[0].length, h: sp.grid.length, palette: sp.palette });

    const name = document.createElement('span');
    name.className = 'tab-name';
    name.textContent = sp.name;
    tab.append(name);

    if (closable) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'tab-close';
      x.title = t('tabs.close');
      x.setAttribute('aria-label', t('tabs.close'));
      x.innerHTML = iconSvg('close');
      x.addEventListener('click', e => { e.stopPropagation(); close(id); });
      tab.append(x);
    }
    list.append(tab);
  }
  showActive(list);
}

/** Breite des weichen Rands (styles.css, .tab-list.is-cut-*). */
const FADE = 28;

/** Den aktiven Reiter ganz in den sichtbaren Teil der Reihe holen — nur
 *  seitlich, die Seite selbst scrollt dabei nicht mit (anders als
 *  scrollIntoView). @param {HTMLElement} list */
function showActive(list) {
  const a = list.querySelector('.is-active');
  if (a) {
    // Abstand zum weichen Rand, wo daneben noch Reiter kommen.
    const l = list.getBoundingClientRect(), r = a.getBoundingClientRect();
    const left = l.left + (a.previousElementSibling ? FADE : 0);
    const right = l.right - (a.nextElementSibling ? FADE : 0);
    if (r.left < left) list.scrollLeft -= left - r.left;
    else if (r.right > right) list.scrollLeft += Math.min(r.right - right, r.left - left);
  }
  markOverflow(list);
}

/** Passen nicht alle Reiter hin, laufen sie am Rand weich aus, statt hart
 *  abgeschnitten zu sein (styles.css: .tab-list.is-cut-start/-end).
 *  @param {HTMLElement} list */
function markOverflow(list) {
  const max = list.scrollWidth - list.clientWidth;
  list.classList.toggle('is-cut-start', list.scrollLeft > 1);
  list.classList.toggle('is-cut-end', list.scrollLeft < max - 1);
}

export function initTabs() {
  const bar = $('sprite-tabs');
  if (!bar) return;
  const list = bar.querySelector('.tab-list');
  const tabOf = e => /** @type {HTMLElement} */ (e.target).closest('.sprite-tab');

  list.addEventListener('click', e => {
    const tab = tabOf(e);
    if (tab) selectSprite(tab.dataset.id);
  });
  // Mittelklick schließt — wie im Browser. pointerdown verhindert das
  // Auto-Scrollen, das Windows beim Mittelklick sonst startet.
  list.addEventListener('pointerdown', e => { if (e.button === 1 && tabOf(e)) e.preventDefault(); });
  list.addEventListener('auxclick', e => {
    const tab = tabOf(e);
    if (tab && e.button === 1) { e.preventDefault(); close(tab.dataset.id); }
  });
  list.addEventListener('dblclick', e => {
    const tab = tabOf(e);
    if (tab && !/** @type {HTMLElement} */ (e.target).closest('.tab-close')) renderCallbacks.onRenameSprite(tab.dataset.id);
  });
  // Pfeiltasten wechseln zwischen den Reitern (Tastatur-Bedienung).
  list.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const tabs = syncOpenTabs();
    const i = tabs.indexOf(state.curSprite) + (e.key === 'ArrowRight' ? 1 : -1);
    if (i < 0 || i >= tabs.length) return;
    e.preventDefault();
    selectSprite(tabs[i]);
    list.querySelector('.is-active')?.focus();
  });

  // Ziehen ordnet. Die Marke zeigt, vor welchem Reiter er landet.
  const clearMarks = () => list.querySelectorAll('.is-drop-before, .is-drop-after')
    .forEach(el => el.classList.remove('is-drop-before', 'is-drop-after'));
  const dropTarget = e => {
    const tab = tabOf(e);
    if (!tab || tab.dataset.id === dragId) return null;
    const r = tab.getBoundingClientRect();
    return { tab, after: e.clientX > r.left + r.width / 2 };
  };
  list.addEventListener('dragstart', e => {
    const tab = tabOf(e);
    if (!tab) return;
    dragId = tab.dataset.id;
    tab.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  list.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault();
    clearMarks();
    const d = dropTarget(e);
    if (d) d.tab.classList.add(d.after ? 'is-drop-after' : 'is-drop-before');
  });
  list.addEventListener('dragleave', e => { if (!list.contains(/** @type {Node} */ (e.relatedTarget))) clearMarks(); });
  list.addEventListener('drop', e => {
    if (!dragId) return;
    e.preventDefault();
    const d = dropTarget(e);
    if (d) {
      const next = d.after ? /** @type {HTMLElement} */ (d.tab.nextElementSibling)?.dataset.id ?? null : d.tab.dataset.id;
      state.openTabs = moveTab(syncOpenTabs(), dragId, next);
      saveState();
    }
    dragId = null;
    renderTabs();
  });
  list.addEventListener('dragend', () => { dragId = null; clearMarks(); renderTabs(); });

  // Mausrad scrollt die Reiter seitlich, wenn sie nicht alle hinpassen.
  list.addEventListener('wheel', e => {
    if (list.scrollWidth <= list.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    list.scrollLeft += e.deltaY;
  }, { passive: false });

  list.addEventListener('scroll', () => markOverflow(list), { passive: true });
  // Wird die Reihe schmaler (Fenster zusammenschieben, Panel aufziehen),
  // bleibt der aktive Reiter sichtbar.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => showActive(list)).observe(list);

  $('tab-new-btn').addEventListener('click', () => $('new-sprite-btn').click());
  renderCallbacks.onRenderTabs = renderTabs;
}
