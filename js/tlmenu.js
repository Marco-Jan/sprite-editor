// ════════════════════════════════════════════════════════════════════
// TLMENU — Einstellungen der Timeline (Knopf ⚙ in der Timeline-Leiste)
// ════════════════════════════════════════════════════════════════════
// Position der Timeline, Zählung und Vorschaubilder der Kopfzeile, die Dauer
// des aktuellen Frames und alles zum Onion Skin. Am breiten Fenster ein
// kleines Fenster neben dem Knopf, am Handy ein Blatt von unten (styles.css).
//
// Die Werte stehen in state.tlOpts und gelten für alle Sprites (js/onion.js);
// die Dauer gehört zum Frame und läuft wie bisher über js/frames.js.
import { state } from './state.js';
import { renderEditor, renderAll } from './render.js';
import { saveState } from './storage.js';
import { defaultTlOpts } from './onion.js';
import { isMobileLayout, timelineZone, setTimelineZone } from './layout.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

const menu = () => $('tl-menu');

export function isTlMenuOpen() { return !!menu() && !menu().hidden; }

// Einstellung ändern: speichern und neu zeichnen. Onion betrifft nur die
// Zeichenfläche, die Kopfzeile die Timeline.
function set(fn, all = false) {
  fn(state.tlOpts);
  if (all) renderAll(); else renderEditor();
  saveState();
  syncTlMenu();
}

export function syncTlMenu() {
  const m = menu();
  if (!m || m.hidden) return;
  const o = state.tlOpts, on = o.onion;
  const press = (sel, test) => m.querySelectorAll(sel).forEach(b => {
    const v = test(/** @type {HTMLElement} */ (b));
    b.classList.toggle('is-active', v);
    b.setAttribute('aria-pressed', String(v));
  });
  // Die Position gibt es nur am breiten Fenster — am Handy ist die Timeline
  // immer unten.
  $('tm-pos').hidden = isMobileLayout();
  const z = timelineZone();
  press('[data-zone]', b => b.dataset.zone === z);
  press('[data-first]', b => Number(b.dataset.first) === o.firstFrame);
  press('[data-mode]', b => b.dataset.mode === on.mode);
  press('[data-front]', b => (b.dataset.front === '1') === on.front);
  $('tm-thumbs').checked = o.thumbs;
  $('tm-opacity').value = String(Math.round(on.opacity * 100));
  $('tm-opacity-val').textContent = Math.round(on.opacity * 100) + '%';
  $('tm-step').value = String(Math.round(on.step * 100));
  $('tm-step-val').textContent = Math.round(on.step * 100) + '%';
  $('tm-before').value = String(on.before);
  $('tm-after').value = String(on.after);
  $('tm-looptag').checked = on.loopTag;
  $('tm-layeronly').checked = on.layerOnly;
}

function place() {
  const m = menu(), btn = $('tl-settings');
  if (isMobileLayout() || !btn) { m.style.left = m.style.top = ''; return; }
  // Neben dem Knopf, ganz im Fenster — über der Timeline, wenn sie unten
  // steht, sonst darunter.
  const r = btn.getBoundingClientRect();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  const above = r.top - h - 6;
  m.style.top = (above >= 8 ? above : Math.min(innerHeight - h - 8, r.bottom + 6)) + 'px';
}

export function openTlMenu() {
  const m = menu();
  if (!m) return;
  m.hidden = false;
  $('tl-settings')?.setAttribute('aria-expanded', 'true');
  syncTlMenu();
  place();
}

export function closeTlMenu() {
  const m = menu();
  if (!m || m.hidden) return;
  m.hidden = true;
  $('tl-settings')?.setAttribute('aria-expanded', 'false');
}

export function initTlMenu() {
  const m = menu();
  if (!m) return;
  $('tl-settings').addEventListener('click', () => (isTlMenuOpen() ? closeTlMenu() : openTlMenu()));
  $('tl-menu-close').addEventListener('click', closeTlMenu);

  m.querySelectorAll('[data-zone]').forEach(b => b.addEventListener('click', () => {
    setTimelineZone(/** @type {HTMLElement} */ (b).dataset.zone);
    syncTlMenu();
    place();
  }));
  m.querySelectorAll('[data-first]').forEach(b => b.addEventListener('click', () =>
    set(o => { o.firstFrame = Number(/** @type {HTMLElement} */ (b).dataset.first); }, true)));
  m.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () =>
    set(o => { o.onion.mode = /** @type {HTMLElement} */ (b).dataset.mode === 'color' ? 'color' : 'tint'; })));
  m.querySelectorAll('[data-front]').forEach(b => b.addEventListener('click', () =>
    set(o => { o.onion.front = /** @type {HTMLElement} */ (b).dataset.front === '1'; })));
  $('tm-thumbs').addEventListener('change', e => set(o => { o.thumbs = e.target.checked; }, true));
  $('tm-opacity').addEventListener('input', e => set(o => { o.onion.opacity = Number(e.target.value) / 100; }));
  $('tm-step').addEventListener('input', e => set(o => { o.onion.step = Number(e.target.value) / 100; }));
  $('tm-before').addEventListener('change', e => set(o => { o.onion.before = Number(e.target.value); }));
  $('tm-after').addEventListener('change', e => set(o => { o.onion.after = Number(e.target.value); }));
  $('tm-looptag').addEventListener('change', e => set(o => { o.onion.loopTag = e.target.checked; }));
  $('tm-layeronly').addEventListener('change', e => set(o => { o.onion.layerOnly = e.target.checked; }));
  // Zurücksetzen gilt dem Onion Skin — Kopfzeile und Position bleiben.
  $('tm-reset').addEventListener('click', () => set(o => { o.onion = defaultTlOpts().onion; }));

  // Schließen: Esc, oder ein Klick daneben.
  m.addEventListener('keydown', e => {
    e.stopPropagation();   // Tippen in der Dauer soll keine Werkzeuge wechseln
    if (e.key === 'Escape') { closeTlMenu(); $('tl-settings')?.focus(); }
  });
  document.addEventListener('pointerdown', e => {
    if (!isTlMenuOpen()) return;
    const t = /** @type {HTMLElement} */ (e.target);
    if (!m.contains(t) && !t.closest?.('#tl-settings')) closeTlMenu();
  }, true);
  window.addEventListener('resize', () => { if (isTlMenuOpen()) place(); });
}
