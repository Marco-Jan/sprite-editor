// ════════════════════════════════════════════════════════════════════
// HELPER — Bitty als kleiner Helfer im Editor
// ════════════════════════════════════════════════════════════════════
// Bitty (js/bitty.js) sitzt rechts in der Kopfzeile.
//
//   Tour   Beim allerersten Start zeigt er in ein paar Sprechblasen, wo
//          was ist. Jederzeit wieder über Hilfe → „Tour mit Bitty“.
//   Suche  Ein Klick auf ihn öffnet ein Suchfeld: findet Hilfe-Absätze,
//          Werkzeuge, Panels und Menüpunkte (js/search.js) und führt hin —
//          Hilfe aufschlagen, Panel aufklappen, aufs Werkzeug zeigen.
//   Tipps  Unter dem Suchfeld steht der nächste Tipp. Von selbst meldet
//          er sich höchstens einmal pro Besuch — und gar nicht mehr, wenn
//          man „Nicht von selbst“ wählt.
//
// Die Sprechblase blockiert nichts: man kann daneben weitermalen. Esc
// oder ein Klick daneben schließt sie (die Tour nur über ihre Knöpfe).
import { t, i18nVariants } from './i18n.js';
import { search } from './search.js';

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
 * @param {{ tour?: boolean, step?: string, autoClose?: boolean, search?: boolean, focus?: boolean }} [opts]
 */
function say(text, actions, opts = {}) {
  clearTimeout(closeTimer);
  // Suchfeld nur beim Klick auf Bitty (und seinen Tipps), nicht in der Tour.
  const box = bubble.querySelector('.bitty-search');
  box.hidden = !opts.search;
  if (!opts.search) query.value = '';
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
  renderResults();
  place();
  btn.setAttribute('aria-expanded', 'true');
  bitty?.hop();
  // Von selbst nie den Fokus nehmen — man malt vielleicht gerade.
  if (opts.search && opts.focus) query.focus({ preventScroll: true });
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
// prefs.tip = Nummer des zuletzt gezeigten Tipps (1…TIP_COUNT, 0 = keiner).
function showTip(auto = false, advance = true) {
  setTarget(null);
  if (advance || !prefs.tip) {
    prefs.tip = ((Math.max(0, prefs.tip | 0)) % TIP_COUNT) + 1;
    savePrefs();
  }
  const i = prefs.tip - 1;
  /** @type {{ label: string, primary?: boolean, onClick: () => void }[]} */
  const actions = [{ label: t('bitty.next'), primary: true, onClick: () => showTip() }];
  if (auto) actions.push({ label: t('bitty.quiet'), onClick: () => { prefs.quiet = true; savePrefs(); hide(); } });
  else actions.push({ label: t('bitty.close'), onClick: hide });
  // Ohne Zähler: wie viele Tipps es gibt, ist nicht das Thema.
  say(t(`bitty.tip.${i + 1}`), actions, { autoClose: auto, search: true, focus: !auto });
}

// ── Suche ──────────────────────────────────────────────────────────
// Was sich finden lässt, wird bei jedem Tippen frisch aus der Seite
// gelesen: so ist es immer in der eingestellten Sprache und kennt auch
// Panels, die erst später angelegt wurden. Es sind nur ein paar hundert
// kurze Texte.

// Gesucht wird in allen Sprachen zugleich (i18nVariants): auf Deutsch
// findet „layer“ die „Ebenen“ — angezeigt wird aber, was auf dem
// Bildschirm steht.

/** @typedef {{ kind: 'help'|'tool'|'panel'|'menu', label: string, names: string, sub: string, text: string, el: HTMLElement }} Entry */

let query = null, results = null, none = null;
/** @type {Entry[]} */
let hits = [];
let sel = 0;

const clean = s => (s || '').replace(/\s+/g, ' ').trim();

/** HTML-Schnipsel → DOM-Fragment (nur zum Lesen, wird nie eingehängt). */
function frag(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}

/** Text eines Elements in allen Sprachen, zu einem String verbunden. */
function allLangs(el, attr) {
  if (!el) return '';
  return i18nVariants(el, attr).map(v => (attr ? v : frag(v).textContent)).map(clean).join(' ');
}

// Eintrag der Hilfe → Name (fett gesetztes Stichwort, bei Kürzeln die Aktion)
function helpLabel(node) {
  if (node.classList.contains('sc-row')) return clean(node.querySelector('span')?.textContent);
  return clean(node.querySelector('b')?.textContent);
}

/** @returns {Entry[]} */
function collect() {
  /** @type {Entry[]} */
  const out = [];
  // Werkzeuge: Name und Tooltip (dort steht auch das Kürzel)
  document.querySelectorAll('#toolbar [data-tool]').forEach(el => {
    const nameEl = el.querySelector('.tool-name');
    const label = clean(nameEl?.textContent) || clean(el.title);
    out.push({ kind: 'tool', label, names: allLangs(nameEl), sub: clean(el.title), text: allLangs(el, 'title') || el.title, el });
  });
  // Panels
  document.querySelectorAll('.panel[data-panel]').forEach(el => {
    const titleEl = el.querySelector('.panel-title');
    const label = clean(titleEl?.textContent);
    if (label) out.push({ kind: 'panel', label, names: allLangs(titleEl), sub: '', text: '', el });
  });
  // Menü (ohne Sprachen und Links nach draußen)
  document.querySelectorAll('#menubar .mb-item').forEach(el => {
    if (el.tagName === 'A' || el.classList.contains('lang-btn') || el.hidden) return;
    const span = el.querySelector('span');
    const label = clean(span?.textContent);
    const titleEl = el.closest('.mb-menu')?.querySelector('.mb-title');
    if (label) out.push({ kind: 'menu', label, names: allLangs(span), sub: clean(titleEl?.textContent), text: allLangs(titleEl), el });
  });
  // Hilfe: jeder Absatz und jede Kürzel-Zeile, mit Abschnitt. Die anderen
  // Sprachen stehen je Block als HTML in STATIC — Absatz k dort gehört zu
  // Absatz k hier (nur wenn beide gleich viele haben).
  let section = '', sectionAll = '';
  const isItem = n => n.tagName === 'DIV' || n.tagName === 'LI';
  document.querySelectorAll('#help-modal-overlay .help-h, #help-modal-overlay .help-list, #help-modal-overlay .help-ol, #help-modal-overlay .help-shortcuts')
    .forEach(block => {
      if (block.classList.contains('help-h')) { section = clean(block.textContent); sectionAll = allLangs(block); return; }
      const items = /** @type {HTMLElement[]} */ ([...block.children].filter(isItem));
      const others = i18nVariants(block)
        .map(html => [...frag(html).children].filter(isItem))
        .filter(list => list.length === items.length);
      items.forEach((el, k) => {
        const full = clean(el.textContent);
        let label = helpLabel(el) || full;
        if (label.length > 60) label = label.slice(0, 57) + ' …';
        const sub = el.classList.contains('sc-row') ? `${section} · ${clean(el.querySelector('b')?.textContent)}` : section;
        const alt = others.map(list => list[k]);
        out.push({
          kind: 'help', label, sub, el,
          names: alt.map(helpLabel).join(' '),
          text: `${sectionAll || section} ${full} ${alt.map(a => clean(a.textContent)).join(' ')}`,
        });
      });
    });
  return out;
}

function renderResults() {
  const q = query.value.trim();
  const body = bubble.querySelector('.bitty-body');
  const searching = !bubble.querySelector('.bitty-search').hidden && !!q;
  body.hidden = searching;
  if (!searching) { results.hidden = true; none.hidden = true; hits = []; return; }
  clearTimeout(closeTimer); // wer tippt, liest — nicht mehr von selbst schließen
  hits = /** @type {Entry[]} */ (search(q, collect(), 8));
  sel = 0;
  none.hidden = hits.length > 0;
  none.textContent = t('bitty.noHits');
  results.hidden = !hits.length;
  results.replaceChildren(...hits.map((h, i) => {
    const li = document.createElement('li');
    li.className = 'bitty-hit';
    li.id = `bitty-hit-${i}`;
    li.setAttribute('role', 'option');
    const kind = document.createElement('span');
    kind.className = 'bitty-kind';
    kind.textContent = t(`bitty.kind.${h.kind}`);
    const name = document.createElement('span');
    name.className = 'bitty-hit-name';
    name.textContent = h.label;
    li.append(kind, name);
    if (h.sub && h.sub !== h.label) {
      const sub = document.createElement('span');
      sub.className = 'bitty-hit-sub';
      sub.textContent = h.sub;
      li.append(sub);
    }
    li.addEventListener('pointerenter', () => { sel = i; markSel(); });
    li.addEventListener('click', () => go(h));
    return li;
  }));
  markSel();
  place();
}

function markSel() {
  results.querySelectorAll('.bitty-hit').forEach((li, i) => li.setAttribute('aria-selected', String(i === sel)));
  if (hits.length) query.setAttribute('aria-activedescendant', `bitty-hit-${sel}`);
  else query.removeAttribute('aria-activedescendant');
  results.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

// Kurz blau umranden (Hilfe-Absatz, Menüpunkt) — die bleiben nicht offen.
function flash(el) {
  el.classList.add('bitty-flash');
  window.setTimeout(() => el.classList.remove('bitty-flash'), 2600);
}

// Zum Treffer hinführen.
function go(h) {
  const back = query.value;
  if (h.kind === 'help') {
    hide();
    document.getElementById('help-btn')?.click();
    requestAnimationFrame(() => { h.el.scrollIntoView({ block: 'center' }); flash(h.el); });
    return;
  }
  if (h.kind === 'menu') {
    hide();
    const menu = h.el.closest('.mb-menu');
    const title = menu?.querySelector('.mb-title');
    if (title && menu.querySelector('.mb-drop')?.hidden) title.click();
    requestAnimationFrame(() => { h.el.focus(); flash(h.el); });
    return;
  }
  // Werkzeug oder Panel: Bitty zeigt darauf, ein Knopf führt es aus.
  /** @type {{ label: string, primary?: boolean, onClick: () => void }[]} */
  const actions = [];
  if (h.kind === 'panel' && !visible(h.el)) {
    // Panel liegt im Dock: Schublade aufmachen
    document.querySelector(`.dock-btn[data-target="${h.el.dataset.dock || h.el.dataset.panel}"]`)?.click();
  }
  if (h.kind === 'tool') actions.push({ label: t('bitty.use'), primary: true, onClick: () => { h.el.click(); hide(); } });
  else actions.push({ label: t('bitty.ok'), primary: true, onClick: hide });
  actions.push({ label: t('bitty.back'), onClick: () => { showTip(false, false); query.value = back; renderResults(); } });
  requestAnimationFrame(() => {
    setTarget(visible(h.el) ? h.el : null);
    say(t(h.kind === 'tool' ? 'bitty.foundTool' : 'bitty.foundPanel', { name: h.label }), actions);
  });
}

function onSearchKey(e) {
  if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); sel = (sel + 1) % hits.length; markSel(); }
  else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); sel = (sel - 1 + hits.length) % hits.length; markSel(); }
  else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); go(hits[sel]); }
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
  bubble.innerHTML =
    '<div class="bitty-search" hidden>' +
      '<input type="search" class="input bitty-q" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="bitty-results">' +
      '<ul class="bitty-results" id="bitty-results" role="listbox" hidden></ul>' +
      '<p class="bitty-none" hidden></p>' +
    '</div>' +
    '<div class="bitty-body"><p class="bitty-step"></p><p class="bitty-text"></p><div class="bitty-actions"></div></div>';
  document.body.appendChild(bubble);
  btn.setAttribute('aria-controls', bubble.id);

  query = /** @type {HTMLInputElement} */ (bubble.querySelector('.bitty-q'));
  results = bubble.querySelector('.bitty-results');
  none = bubble.querySelector('.bitty-none');
  labelSearch();
  query.addEventListener('input', renderResults);
  query.addEventListener('keydown', onSearchKey);
  query.addEventListener('focus', () => clearTimeout(closeTimer));

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

function labelSearch() {
  query.placeholder = t('bitty.searchPh');
  query.setAttribute('aria-label', t('bitty.searchPh'));
}

// Sprachwechsel: offene Blase schließen, sie stünde in der alten Sprache da.
export function relabelHelper() {
  if (query) labelSearch();
  if (isOpen() && !inTour()) hide();
}
