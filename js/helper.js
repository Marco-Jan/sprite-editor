// ════════════════════════════════════════════════════════════════════
// HELPER — Bitty als kleiner Helfer im Editor
// ════════════════════════════════════════════════════════════════════
// Bitty (js/bitty.js) sitzt rechts in der Kopfzeile.
//
//   Tour   Beim allerersten Start zeigt er in ein paar Sprechblasen, wo
//          was ist. Jederzeit wieder über Hilfe → „Tour mit Bitty“.
//   Tipps  Ein Klick auf ihn zeigt den nächsten Tipp. Von selbst meldet
//          er sich höchstens einmal pro Besuch — und gar nicht mehr, wenn
//          man „Nicht von selbst“ wählt.
//
// Die Sprechblase blockiert nichts: man kann daneben weitermalen. Esc
// oder ein Klick daneben schließt sie (die Tour nur über ihre Knöpfe).
import { t } from './i18n.js';

const KEY = 'spritebit_bitty';
const TIP_COUNT = 10;

// Tour: Ziel (erstes sichtbares gewinnt) und Text. Ohne Ziel zeigt die
// Blase auf Bitty selbst.
const TOUR = [
  { sel: ['#toolbar'], key: 'bitty.tour.tools' },
  { sel: ['#quick-palette', '[data-panel="palette"]'], key: 'bitty.tour.colors' },
  { sel: ['#stage-body'], key: 'bitty.tour.canvas' },
  { sel: ['#timeline'], key: 'bitty.tour.timeline' },
  { sel: ['[data-panel="output"]', '.dock-btn[data-target="output"]'], key: 'bitty.tour.export' },
  { sel: [], key: 'bitty.tour.end' },
];

/** @type {{ tour: boolean, tip: number, quiet: boolean }} */
let prefs = { tour: false, tip: 0, quiet: false };
function loadPrefs() {
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* privates Fenster */ }
}
function savePrefs() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* egal */ }
}

let btn = null, bubble = null, bitty = null, target = null;
let closeTimer = 0;

// ── Sprechblase ────────────────────────────────────────────────────
function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden';
}

function findTarget(sels) {
  for (const s of sels) {
    const el = document.querySelector(s);
    if (visible(el)) return el;
  }
  return null;
}

// Blase unter (oder über) das Ziel setzen, waagerecht ins Bild geklemmt.
function place() {
  if (!bubble || bubble.hidden) return;
  const anchor = target || btn;
  const a = anchor.getBoundingClientRect();
  const b = bubble.getBoundingClientRect();
  const pad = 8, gap = 10;
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  // Große Ziele (die Zeichenfläche): Blase in ihre obere Ecke statt darunter.
  const big = a.height > vh * 0.5;
  let top = big ? a.top + gap : a.bottom + gap;
  let below = true;
  if (!big && top + b.height > vh - pad) { top = a.top - gap - b.height; below = false; }
  top = Math.max(pad, Math.min(top, vh - pad - b.height));
  const cx = a.left + a.width / 2;
  const left = Math.max(pad, Math.min(cx - b.width / 2, vw - pad - b.width));
  bubble.style.top = `${Math.round(top)}px`;
  bubble.style.left = `${Math.round(left)}px`;
  // Zipfel zeigt aufs Ziel
  bubble.style.setProperty('--tail-x', `${Math.round(Math.max(16, Math.min(cx - left, b.width - 16)))}px`);
  bubble.classList.toggle('is-above', !below);
  bubble.classList.toggle('no-tail', big);
}

function setTarget(el) {
  document.querySelectorAll('.bitty-spot').forEach(e => e.classList.remove('bitty-spot'));
  target = el;
  if (el) el.classList.add('bitty-spot');
}

/**
 * Blase zeigen.
 * @param {string} text
 * @param {{ label: string, primary?: boolean, onClick: () => void }[]} actions
 * @param {{ tour?: boolean, step?: string, autoClose?: boolean }} [opts]
 */
function say(text, actions, opts = {}) {
  clearTimeout(closeTimer);
  bubble.querySelector('.bitty-text').textContent = text;
  const stepEl = bubble.querySelector('.bitty-step');
  stepEl.textContent = opts.step || '';
  stepEl.hidden = !opts.step;
  const row = bubble.querySelector('.bitty-actions');
  row.replaceChildren(...actions.map(a => {
    const b = document.createElement('button');
    b.type = 'button';
    // Ruhige Knöpfe — keine Signalfarben in der Blase.
    b.className = 'btn' + (a.primary ? ' is-active' : '');
    b.textContent = a.label;
    b.addEventListener('click', a.onClick);
    return b;
  }));
  bubble.classList.toggle('is-tour', !!opts.tour);
  bubble.hidden = false;
  place();
  btn.setAttribute('aria-expanded', 'true');
  bitty?.hop();
  if (opts.autoClose) closeTimer = window.setTimeout(hide, Math.min(14000, Math.max(6000, text.length * 70)));
}

function hide() {
  clearTimeout(closeTimer);
  if (!bubble || bubble.hidden) return;
  bubble.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  setTarget(null);
}

const isOpen = () => bubble && !bubble.hidden;
const inTour = () => isOpen() && bubble.classList.contains('is-tour');

// ── Tipps ──────────────────────────────────────────────────────────
function showTip(auto = false) {
  setTarget(null);
  const i = ((prefs.tip % TIP_COUNT) + TIP_COUNT) % TIP_COUNT;
  prefs.tip = i + 1;
  savePrefs();
  /** @type {{ label: string, primary?: boolean, onClick: () => void }[]} */
  const actions = [{ label: t('bitty.next'), primary: true, onClick: () => showTip() }];
  if (auto) actions.push({ label: t('bitty.quiet'), onClick: () => { prefs.quiet = true; savePrefs(); hide(); } });
  else actions.push({ label: t('bitty.close'), onClick: hide });
  say(t(`bitty.tip.${i + 1}`), actions, { step: t('bitty.tipOf', { n: i + 1, total: TIP_COUNT }), autoClose: auto });
}

// ── Tour ───────────────────────────────────────────────────────────
function endTour() {
  prefs.tour = true;
  savePrefs();
  hide();
}

function tourStep(i) {
  const s = TOUR[i];
  setTarget(findTarget(s.sel));
  const last = i === TOUR.length - 1;
  /** @type {{ label: string, primary?: boolean, onClick: () => void }[]} */
  const actions = last
    ? [{ label: t('bitty.done'), primary: true, onClick: endTour }]
    : [
        { label: t('bitty.next'), primary: true, onClick: () => tourStep(i + 1) },
        { label: t('bitty.skip'), onClick: endTour },
      ];
  if (i > 0 && !last) actions.splice(1, 0, { label: t('bitty.back'), onClick: () => tourStep(i - 1) });
  say(t(s.key), actions, { tour: true, step: last ? '' : t('bitty.stepOf', { n: i + 1, total: TOUR.length - 1 }) });
}

export function startTour() {
  setTarget(null);
  say(t('bitty.hello'), [
    { label: t('bitty.show'), primary: true, onClick: () => tourStep(0) },
    { label: t('bitty.later'), onClick: endTour },
  ], { tour: true });
}

// Erst loslegen, wenn keine Rückfrage (Toast) mehr offen ist.
function whenCalm(fn) {
  const toast = document.getElementById('confirm-toast');
  if (toast?.classList.contains('visible')) { window.setTimeout(() => whenCalm(fn), 600); return; }
  fn();
}

// ── Aufbau ─────────────────────────────────────────────────────────
export function initHelper() {
  btn = document.getElementById('bitty-btn');
  if (!btn || !window.Bitty) return;
  loadPrefs();
  bitty = window.Bitty.mount(/** @type {HTMLCanvasElement} */ (btn.querySelector('canvas')));

  bubble = document.createElement('div');
  bubble.className = 'bitty-bubble';
  bubble.id = 'bitty-bubble';
  bubble.setAttribute('role', 'dialog');
  bubble.setAttribute('aria-live', 'polite');
  bubble.setAttribute('aria-label', 'Bitty');
  bubble.hidden = true;
  bubble.innerHTML = '<p class="bitty-step"></p><p class="bitty-text"></p><div class="bitty-actions"></div>';
  document.body.appendChild(bubble);
  btn.setAttribute('aria-controls', bubble.id);

  btn.addEventListener('click', () => {
    if (inTour()) return;           // die Tour läuft über ihre Knöpfe
    if (isOpen()) hide(); else showTip();
  });
  document.getElementById('bitty-tour-btn')?.addEventListener('click', startTour);

  document.addEventListener('pointerdown', e => {
    if (!isOpen() || inTour()) return;
    const el = /** @type {HTMLElement} */ (e.target);
    if (!el.closest('#bitty-bubble, #bitty-btn')) hide();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) {
      e.stopPropagation();
      if (inTour()) endTour(); else hide();
    }
  }, true);
  window.addEventListener('resize', place);

  // Erster Besuch: Tour. Sonst ab und zu ein Tipp von selbst.
  if (!prefs.tour) window.setTimeout(() => whenCalm(startTour), 900);
  else if (!prefs.quiet) window.setTimeout(() => whenCalm(() => { if (!isOpen()) showTip(true); }), 20000);
}

// Sprachwechsel: offene Blase schließen, sie stünde in der alten Sprache da.
export function relabelHelper() { if (isOpen() && !inTour()) hide(); }
