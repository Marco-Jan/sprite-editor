// ════════════════════════════════════════════════════════════════════
// HELPER — Bitty als kleiner Helfer im Editor
// ════════════════════════════════════════════════════════════════════
// Bitty (js/bitty.js) sitzt rechts in der Kopfzeile.
//
//   Touren Beim allerersten Start zeigt er in ein paar Sprechblasen, wo
//          was ist. Dazu Themen-Touren (Animation, Ebenen, Kacheln,
//          Foto → Sprite) über Hilfe → „Touren mit Bitty“ oder die Suche.
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
import { state, getSprite, createSprite } from './state.js';
import { renderCallbacks } from './render.js';

const KEY = 'spritebit_bitty';
// Tipps: abwechselnd zur Bedienung (bitty.tip.*) und zum Handwerk
// Pixel-Art (bitty.art.*), damit nicht erst zehnmal Tastenkürzel kommen.
const APP_TIPS = 11, ART_TIPS = 10;
const TIPS = [];
for (let i = 1; i <= Math.max(APP_TIPS, ART_TIPS); i++) {
  if (i <= APP_TIPS) TIPS.push(`bitty.tip.${i}`);
  if (i <= ART_TIPS) TIPS.push(`bitty.art.${i}`);
}
const TIP_COUNT = TIPS.length;

// Touren: je Schritt ein Ziel (erstes sichtbares gewinnt) und ein Text.
// `panel` klappt dieses Panel vorher auf; ist das Ziel darin gerade
// versteckt (z. B. Knöpfe, die erst mit einem Bild erscheinen), zeigt die
// Blase aufs Panel. Ohne Ziel zeigt sie auf Bitty selbst.
// „start“ ist die Erste-Schritte-Tour, die anderen gibt es auf Wunsch.
/** @type {Record<string, { sel: string[], key: string, panel?: string }[]>} */
const TOURS = {
  start: [
    { sel: ['#toolbar'], key: 'bitty.tour.tools' },
    { sel: ['#quick-palette', '[data-panel="palette"]'], key: 'bitty.tour.colors' },
    { sel: ['#stage-body'], key: 'bitty.tour.canvas' },
    { sel: ['#timeline'], key: 'bitty.tour.timeline' },
    { sel: ['[data-panel="output"]', '.dock-btn[data-target="output"]'], key: 'bitty.tour.export' },
    { sel: [], key: 'bitty.tour.end' },
  ],
  anim: [
    { sel: ['#tl-frames', '#timeline'], key: 'bitty.t.anim.1' },
    { sel: ['#tl-dup', '#tl-add'], key: 'bitty.t.anim.2' },
    { sel: ['#tl-onion'], key: 'bitty.t.anim.3' },
    { sel: ['#tl-play'], key: 'bitty.t.anim.4' },
    { sel: ['#tl-fps-field'], key: 'bitty.t.anim.5' },
    { sel: ['#tl-tag'], key: 'bitty.t.anim.6' },
    { sel: ['#export-gif-btn'], panel: 'output', key: 'bitty.t.anim.7' },
  ],
  layers: [
    { sel: ['#layer-list'], panel: 'layers', key: 'bitty.t.layers.1' },
    { sel: ['#ly-add'], panel: 'layers', key: 'bitty.t.layers.2' },
    { sel: ['#ly-opacity'], panel: 'layers', key: 'bitty.t.layers.3' },
    { sel: ['#ly-mask-add', '#ly-mask-edit'], panel: 'layers', key: 'bitty.t.layers.4' },
    { sel: ['#ly-merge'], panel: 'layers', key: 'bitty.t.layers.5' },
  ],
  tiles: [
    { sel: ['#tile-new'], panel: 'tiles', key: 'bitty.t.tiles.1' },
    { sel: ['#tile-convert'], panel: 'tiles', key: 'bitty.t.tiles.2' },
    { sel: ['#tile-mode-tiles'], panel: 'tiles', key: 'bitty.t.tiles.3' },
    { sel: ['#tile-godot'], panel: 'tiles', key: 'bitty.t.tiles.4' },
  ],
  photo: [
    { sel: ['label[for="template-file"]'], panel: 'template', key: 'bitty.t.photo.1' },
    { sel: ['#template-trace-quant', '#template-trace'], panel: 'template', key: 'bitty.t.photo.2' },
    { sel: ['#palette-from-image-btn'], panel: 'palette', key: 'bitty.t.photo.3' },
    { sel: ['#bg-remove-btn'], panel: 'cleanup', key: 'bitty.t.photo.4' },
    { sel: ['#despeckle-btn', '#outline-btn'], panel: 'cleanup', key: 'bitty.t.photo.5' },
  ],
};
const TOPICS = ['anim', 'layers', 'tiles', 'photo'];

/** @type {{ tour: boolean, tip: number, quiet: boolean, hints?: boolean, off?: Record<string, boolean> }} */
let prefs = { tour: false, tip: 0, quiet: false, hints: true, off: {} };
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
  // Ohne Zähler: wie viele Tipps es gibt, ist nicht das Thema. Pixel-Art-
  // Tipps bekommen eine kleine Überschrift, sie sind eine andere Sorte.
  const key = TIPS[i];
  say(t(key), actions, {
    autoClose: auto, search: true, focus: !auto,
    step: key.startsWith('bitty.art.') ? t('bitty.artLabel') : '',
  });
}

// ── Suche ──────────────────────────────────────────────────────────
// Was sich finden lässt, wird bei jedem Tippen frisch aus der Seite
// gelesen: so ist es immer in der eingestellten Sprache und kennt auch
// Panels, die erst später angelegt wurden. Es sind nur ein paar hundert
// kurze Texte.

// Gesucht wird in allen Sprachen zugleich (i18nVariants): auf Deutsch
// findet „layer“ die „Ebenen“ — angezeigt wird aber, was auf dem
// Bildschirm steht.

/** @typedef {{ kind: 'help'|'tool'|'panel'|'menu'|'action'|'tour'|'tip', label: string, names: string, sub: string, text: string, el: HTMLElement | null, danger?: boolean, tour?: string, tip?: number }} Entry */

// Was Bitty nie selbst drückt, sondern nur zeigt: alles, was löscht oder
// zurücksetzt. Lieber einmal zu vorsichtig.
const DANGER = /del|clear|reset|remove|delete/i;

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
  // Touren — Stichwörter stehen in beiden Sprachen im Text (bitty.tourWords.*)
  for (const n of ['lesson', 'start', ...TOPICS]) {
    out.push({ kind: 'tour', label: t(`bitty.tourName.${n}`), names: '', sub: '', text: t(`bitty.tourWords.${n}`), el: null, tour: n });
  }
  // Tipps — vor allem die zum Handwerk („schatten“, „kontur“)
  TIPS.forEach((key, k) => {
    const txt = t(key);
    out.push({ kind: 'tip', label: txt.length > 60 ? txt.slice(0, 57) + ' …' : txt, names: '', sub: '', text: txt, el: null, tip: k + 1 });
  });
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
    if (label) out.push({ kind: 'menu', label, names: allLangs(span), sub: clean(titleEl?.textContent), text: allLangs(titleEl), el, danger: DANGER.test(el.id) });
  });
  // Knöpfe in Panels, Timeline, Werkzeugleiste und über der Fläche — als
  // Befehle: Enter drückt sie (außer den gefährlichen).
  document.querySelectorAll('.panel button[id], #timeline button[id], #stage-head button[id], #toolbar button[id]').forEach(el => {
    if (el.dataset.tool || el.id === 'bitty-btn') return;
    const label = clean(el.querySelector('.btn-label')?.textContent || el.textContent) || clean(el.title || el.getAttribute('aria-label'));
    if (label.length < 2) return;
    const where = el.closest('.panel')?.querySelector('.panel-title');
    const names = [el, ...el.querySelectorAll('[data-i18n]')].map(n => allLangs(n)).join(' ');
    out.push({
      kind: 'action', label, el, danger: DANGER.test(el.id),
      names: `${names} ${allLangs(el, 'title')} ${allLangs(el, 'aria-label')}`,
      sub: clean(where?.textContent) || (label !== clean(el.title) ? clean(el.title) : ''),
      text: el.title || '',
    });
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
  // Dasselbe gibt es oft zweimal (Menüpunkt und Knopf „Rückgängig“) — einmal reicht.
  const seen = new Set();
  hits = /** @type {Entry[]} */ (search(q, collect(), 20))
    .filter(h => { const k = h.label.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 8);
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

/** Hilfe öffnen, zur Stelle scrollen und sie kurz blau umranden. */
export function openHelpAt(target) {
  const el = typeof target === 'string' ? document.querySelector(`#help-modal-overlay ${target}`) : target;
  hide();
  document.getElementById('help-btn')?.click();
  if (el) requestAnimationFrame(() => { el.scrollIntoView({ block: 'center' }); flash(el); });
}

// Zum Treffer hinführen.
function go(h) {
  const back = query.value;
  if (h.kind === 'help') { openHelpAt(h.el); return; }
  if (h.kind === 'tour') { if (h.tour === 'lesson') startLesson(); else startTour(h.tour); return; }
  // Tipp: Suchfeld leeren, sonst stünden weiter die Treffer statt des Tipps da.
  if (h.kind === 'tip') { prefs.tip = h.tip; query.value = ''; showTip(false, false); return; }
  const disabled = /** @type {HTMLButtonElement} */ (h.el).disabled;
  // Befehl ausführen: Werkzeug wählen, Knopf drücken, Menüpunkt auslösen.
  if ((h.kind === 'tool' || h.kind === 'action' || h.kind === 'menu') && !h.danger && !disabled) {
    hide();
    h.el.click();
    if (visible(h.el)) flash(h.el);
    return;
  }
  if (h.kind === 'menu') {
    // Gefährlich (z. B. „Alles zurücksetzen“): nur das Menü aufklappen und zeigen.
    hide();
    const menu = h.el.closest('.mb-menu');
    const title = menu?.querySelector('.mb-title');
    if (title && menu.querySelector('.mb-drop')?.hidden) title.click();
    requestAnimationFrame(() => { h.el.focus(); flash(h.el); });
    return;
  }
  // Panel oder ein Knopf, den Bitty nicht drückt: hinführen und zeigen.
  const panel = h.kind === 'panel' ? h.el : h.el.closest('.panel');
  if (panel && !visible(panel)) {
    // Panel liegt im Dock: Schublade aufmachen
    document.querySelector(`.dock-btn[data-target="${panel.dataset.dock || panel.dataset.panel}"]`)?.click();
  }
  const msg = h.kind === 'panel' ? t('bitty.foundPanel', { name: h.label })
    : disabled ? t('bitty.disabled', { name: h.label })
    : t('bitty.danger', { name: h.label });
  requestAnimationFrame(() => {
    setTarget(visible(h.el) ? h.el : null);
    say(msg, [
      { label: t('bitty.ok'), primary: true, onClick: hide },
      { label: t('bitty.back'), onClick: () => { showTip(false, false); query.value = back; renderResults(); } },
    ]);
  });
}

/** Strg+K: Bitty mit Suchfeld öffnen, von überall. */
export function openSearch() {
  if (!bubble || inTour()) return;
  if (isOpen() && !bubble.querySelector('.bitty-search').hidden) { query.focus(); query.select(); return; }
  showTip(false, false);
}

function onSearchKey(e) {
  if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); sel = (sel + 1) % hits.length; markSel(); }
  else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); sel = (sel - 1 + hits.length) % hits.length; markSel(); }
  else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); go(hits[sel]); }
}

// ── Hinweise in Sackgassen ─────────────────────────────────────────
// Man malt und sieht nichts — weil die Ebene ausgeblendet ist, die Farbe
// durchsichtig, die Maske dran … Dann meldet sich Bitty mit dem Grund und
// einem Knopf, der es behebt. Jeder Hinweis höchstens einmal pro Besuch;
// „Nicht mehr zeigen“ schaltet ihn für immer ab, Hilfe → „Hinweise von
// Bitty“ alle. Die Statuszeile sagt es weiterhin jedes Mal.
const shownHints = new Set();

/**
 * @param {string} id      fester Name des Hinweises (für „nicht mehr zeigen“)
 * @param {string} text
 * @param {{ label: string, run: () => void } | null} [fix]
 * @param {HTMLElement | null} [spot]  was blau umrandet wird (z. B. die Ebene)
 */
export function hint(id, text, fix = null, spot = null) {
  if (!bubble || prefs.hints === false || prefs.off?.[id] || shownHints.has(id)) return;
  if (inTour() || (isOpen() && document.activeElement === query)) return; // nicht dazwischenreden
  shownHints.add(id);
  /** @type {{ label: string, primary?: boolean, onClick: () => void }[]} */
  const actions = [];
  if (fix) actions.push({ label: fix.label, primary: true, onClick: () => { hide(); fix.run(); } });
  actions.push({ label: t('bitty.hintOff'), onClick: () => { prefs.off = { ...prefs.off, [id]: true }; savePrefs(); hide(); } });
  setTarget(spot && visible(spot) ? spot : null);
  say(text, actions, { autoClose: true });
  // Ausgelöst von einem Klick auf die Fläche — derselbe Klick kommt gleich
  // noch beim Dokument an und darf die Blase nicht als „daneben“ schließen.
  justShown = true;
  window.setTimeout(() => { justShown = false; }, 0);
}
let justShown = false;

function syncHintsItem() {
  document.getElementById('bitty-hints-btn')?.setAttribute('aria-checked', String(prefs.hints !== false));
}

// ── Lektion zum Mitmachen ──────────────────────────────────────────
// „Dein erster animierter Sprite“: Bitty gibt eine Aufgabe und schaut
// selbst nach, ob sie erledigt ist (alle 300 ms, nur solange die Lektion
// läuft). Kein Raten über Klicks — gezählt wird, was im Bild steht.
// `start` merkt sich den Stand beim Beginn eines Schritts, `done` vergleicht.

// Gemalte Pixel im Frame f (alle Ebenen)
function pixels(f) {
  const sp = getSprite();
  let n = 0;
  for (const g of sp?.frames[f]?.cels || []) for (const row of g) for (const v of row) if (v !== 0) n++;
  return n;
}
const frameKey = f => JSON.stringify(getSprite()?.frames[f]?.cels || null);

let gifClicked = false;

/** @type {{ key: string, sel: string[], start?: () => any, done: (c: any) => boolean }[]} */
const LESSON = [
  { key: 'bitty.l.1', sel: ['[data-tool="pencil"]'], start: () => pixels(getSprite().frame), done: n => pixels(getSprite().frame) >= n + 8 },
  { key: 'bitty.l.2', sel: ['[data-tool="fill"]'], start: () => pixels(getSprite().frame), done: n => state.tool === 'fill' && pixels(getSprite().frame) > n },
  { key: 'bitty.l.3', sel: ['#tl-dup', '#tl-add'], start: () => getSprite().frames.length, done: n => getSprite().frames.length > n },
  // Erst wenn sich im aktuellen Frame etwas getan hat UND er sich vom
  // Nachbarn unterscheidet — ein leerer Frame per + zählt noch nicht.
  { key: 'bitty.l.4', sel: ['#tl-frames', '#timeline'], start: () => frameKey(getSprite().frame), done: k => {
    const sp = getSprite();
    return sp.frames.length > 1 && frameKey(sp.frame) !== k && frameKey(sp.frame) !== frameKey(sp.frame === 0 ? 1 : 0);
  } },
  { key: 'bitty.l.5', sel: ['#tl-play'], done: () => !!state.playing },
  { key: 'bitty.l.6', sel: ['#export-gif-btn'], start: () => { gifClicked = false; }, done: () => gifClicked },
];

let lessonTimer = 0;

function stopLesson() { clearInterval(lessonTimer); lessonTimer = 0; }

function lessonStep(i) {
  stopLesson();
  if (i >= LESSON.length) {
    setTarget(null);
    say(t('bitty.l.done'), [{ label: t('bitty.done'), primary: true, onClick: endTour }], { tour: true });
    bitty?.hop();
    return;
  }
  const s = LESSON[i];
  const panel = openPanelFor(s);
  const ctx = s.start ? s.start() : null;
  const actions = [
    { label: t('bitty.l.skip'), onClick: () => lessonStep(i + 1) },
    { label: t('bitty.l.quit'), onClick: endTour },
  ];
  requestAnimationFrame(() => {
    setTarget(findTarget(s.sel) || (panel && visible(panel) ? panel : null));
    say(t(s.key), actions, { tour: true, step: t('bitty.l.stepOf', { n: i + 1, total: LESSON.length }) });
  });
  lessonTimer = window.setInterval(() => {
    if (!getSprite() || !s.done(ctx)) return;
    stopLesson();
    // Geschafft: kurz loben, dann weiter.
    setTarget(null);
    say(t(`bitty.l.yay.${(i % 3) + 1}`), [], { tour: true, step: t('bitty.l.stepOf', { n: i + 1, total: LESSON.length }) });
    window.setTimeout(() => { if (inTour()) lessonStep(i + 1); }, 1100);
  }, 300);
}

export function startLesson() {
  setTarget(null);
  say(t('bitty.l.hello'), [
    {
      label: t('bitty.show'), primary: true, onClick: () => {
        // Frischer, kleiner Sprite — das eigene Bild bleibt, wie es ist.
        const id = createSprite({ name: t('bitty.l.name'), size: 16 });
        renderCallbacks.onSelectSprite(id);
        lessonStep(0);
      },
    },
    { label: t('bitty.later'), onClick: endTour },
  ], { tour: true });
}

// ── Tour ───────────────────────────────────────────────────────────
function endTour() {
  stopLesson();
  prefs.tour = true;
  savePrefs();
  hide();
}

// Panel, in dem ein Tour-Ziel steckt, aufklappen (falls es im Dock liegt).
function openPanelFor(s) {
  const first = s.sel.map(q => document.querySelector(q)).find(Boolean);
  const panel = s.panel ? document.querySelector(`.panel[data-panel="${s.panel}"]`) : first?.closest('.panel[data-panel]');
  if (panel && !visible(panel)) {
    document.querySelector(`.dock-btn[data-target="${panel.dataset.dock || panel.dataset.panel}"]`)?.click();
  }
  return panel;
}

function tourStep(name, i) {
  const steps = TOURS[name];
  const s = steps[i];
  const panel = s.sel.length ? openPanelFor(s) : null;
  // „start“ endet mit einem Schritt ohne Ziel (Verabschiedung); die
  // Themen-Touren enden mit ihrem letzten echten Schritt.
  const counted = name === 'start' ? steps.length - 1 : steps.length;
  const last = i === steps.length - 1;
  /** @type {{ label: string, primary?: boolean, onClick: () => void }[]} */
  const actions = last
    ? [{ label: t('bitty.done'), primary: true, onClick: endTour }]
    : [
        { label: t('bitty.next'), primary: true, onClick: () => tourStep(name, i + 1) },
        { label: t('bitty.skip'), onClick: endTour },
      ];
  if (i > 0 && !last) actions.splice(1, 0, { label: t('bitty.back'), onClick: () => tourStep(name, i - 1) });
  // Am Ende der Erste-Schritte-Tour: die Themen-Touren anbieten.
  if (name === 'start' && last) actions.push({ label: t('bitty.moreTours'), onClick: chooseTour });
  // Das Panel klappt gerade erst auf — Ziel einen Frame später suchen.
  requestAnimationFrame(() => {
    setTarget(findTarget(s.sel) || (panel && visible(panel) ? panel : null));
    say(t(s.key), actions, { tour: true, step: name === 'start' && last ? '' : t('bitty.stepOf', { n: Math.min(i + 1, counted), total: counted }) });
  });
}

export function startTour(name = 'start') {
  setTarget(null);
  if (name !== 'start') { tourStep(name, 0); return; }
  say(t('bitty.hello'), [
    { label: t('bitty.show'), primary: true, onClick: () => tourStep('start', 0) },
    { label: t('bitty.later'), onClick: endTour },
  ], { tour: true });
}

/** Welche Tour? — Hilfe → „Touren mit Bitty“ und am Ende der ersten Tour. */
function chooseTour() {
  setTarget(null);
  say(t('bitty.whichTour'), [
    { label: t('bitty.tourName.lesson'), primary: true, onClick: startLesson },
    { label: t('bitty.tourName.start'), onClick: () => tourStep('start', 0) },
    ...TOPICS.map(n => ({ label: t(`bitty.tourName.${n}`), onClick: () => tourStep(n, 0) })),
    { label: t('bitty.close'), onClick: endTour },
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
  document.getElementById('bitty-tour-btn')?.addEventListener('click', chooseTour);
  // Lektion, letzter Schritt: wurde ein GIF exportiert?
  document.getElementById('export-gif-btn')?.addEventListener('click', () => { gifClicked = true; });
  document.getElementById('bitty-hints-btn')?.addEventListener('click', () => {
    prefs.hints = prefs.hints === false;
    if (prefs.hints) prefs.off = {}; // wieder an = alle wieder an
    savePrefs();
    syncHintsItem();
  });
  syncHintsItem();

  document.addEventListener('pointerdown', e => {
    if (!isOpen() || inTour() || justShown) return;
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
