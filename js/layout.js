// ════════════════════════════════════════════════════════════════════
// LAYOUT — Panels und Leisten anpinnen, lösen, verschieben, umsortieren
// ════════════════════════════════════════════════════════════════════
// Panels ([data-panel]) und die drei Leisten der Bühne (#toolbar, #color-bar,
// #timeline) sind hier dasselbe: ein Ding mit einem **Platz**. Was ein Platz
// ist und welcher Knopf wohin führt, steht in place.js — ohne DOM und darum
// mit Tests abgedeckt (tests/place.test.js).
//
// Die eine Regel dieses Moduls:
//
//   Der Platz steht in `layout.places[id]`. Das DOM wird daraus GEZEICHNET.
//   Keine Entscheidung liest ihn je aus dem DOM zurück.
//
// Vorher stand „auf welcher Seite sitzt das?" in `dataset.side`, im
// gespeicherten Zustand, in einer Tabelle `homeSide` und im Aufrufargument —
// mit zwei verschiedenen Vorrangregeln. Daher kamen Fehler wie „rechts
// angepinnt, links gelandet" und „aus dem Dock angepinnt, nach oben gelöst".
//
// `render()` ist die einzige Stelle, die Eltern-Element und Klassen setzt.
// `el.dataset.mode` schreibt sie als *Ausgabe* mit (dock.js und CSS lesen es);
// eine Quelle ist es nicht.
//
// Umsortieren geht überall per Ziehen: Panel-Kopf, Dock-Icon, Leisten-Griff.
// Die Anordnung ist eine Vorliebe dieses Browsers und liegt im localStorage,
// nicht im Projekt.
import { t, onLangChange } from './i18n.js';
import { iconSvg } from './icons.js';
import { closeDrawer, openDrawer, dockButtonFor, sortDock, addDockItem } from './dock.js';
import {
  dock, pinned, zone, float, isPinned, isFloat, sideOf, same,
  togglePin, toggleFloat, dropTarget, nearerSide, fromJSON, toJSON, forMobile,
} from './place.js';

/** @typedef {import('./place.js').Place} Place */
/** @typedef {import('./place.js').Side} Side */

const KEY = 'spritebit_layout';
const PIN_MIN = 200, PIN_MAX = 560;
const BARS = ['toolbar', 'color-bar', 'timeline'];
const BAR_DOCK = {
  'toolbar': ['tools', 'lay.toolbar'],
  'color-bar': ['colors', 'lay.colorbar'],
  'timeline': ['frames', 'lay.timeline'],
};
// Wo eine Leiste ohne gespeicherte Anordnung andockt.
const BAR_HOME = { 'toolbar': 'top', 'color-bar': 'top', 'timeline': 'bottom' };
// Handy: Panels nur als Schublade (von unten), Leisten waagerecht unter der
// Zeichenfläche. Die gespeicherte Anordnung bleibt unberührt.
const MOBILE = window.matchMedia('(max-width: 1100px)');

let ws, layer, hint;
let zTop = 40;

// Welche Art ist diese ID — Panel oder Leiste? Füllt initLayout().
/** @type {Record<string, 'panel'|'bar'>} */
const KIND = {};
// Seite, auf der ein Panel im HTML steht: der Platz, wenn nichts gespeichert ist.
/** @type {Record<string, Side>} */
const homeSide = {};

// ── Das Modell ──────────────────────────────────────────────────────
//   places   wo jedes Ding sitzt — die einzige Wahrheit
//   origins  wo es saß, bevor es angepinnt oder gelöst wurde (Rückweg)
//   geom     letzte Fenstergröße, auch während es angedockt ist
//   order    Reihenfolge der Panels und Dock-Icons
//   barOrder Reihenfolge der Leisten innerhalb einer Zone
// Handy — eigene Wahl, unabhängig von der Anordnung am Desktop:
//   mobilePins  je Leiste true = unten angepinnt (Standard), false = im Dock
//   mobileOrder Reihenfolge der Dock-Icons (leer = wie am Desktop)
//   mobileSide  je Icon 'left' | 'right' (fehlt = wie am Desktop)
let layout = {
  pinW: { left: 280, right: 300 },
  places: {}, origins: {}, geom: {}, lastSide: {},
  order: [], barOrder: [...BARS],
  mobilePins: {}, mobileOrder: [], mobileSide: {},
};

// Was gerade zu sehen ist. Am breiten Fenster ist das dasselbe wie
// `layout.places`; am Handy die umgerechnete Fassung — die gespeicherte
// Anordnung bleibt dabei unberührt, damit sie beim Zurückdrehen wieder da
// ist. Getrennt zu halten ist wichtig: sonst zeigt der Bildschirm das eine
// und die Knöpfe entscheiden nach dem anderen.
/** @type {Record<string, Place>} */
const shown = {};

let applying = false;    // applyAll() stellt die Anordnung gerade her

// Element-Helfer. Rueckgabe bewusst `any`: Felder wie .offsetWidth oder
// .dataset gehoeren zu den konkreten Element-Arten, und ein Cast an jeder
// Fundstelle waere mehr Laerm als Nutzen.
/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);
/** @type {(id: string) => any} */
const panelEl = id => document.querySelector(`[data-panel="${id}"]`);
/** @type {(id: string) => any} */
const elOf = id => (KIND[id] === 'bar' ? $(id) : panelEl(id));
/** @type {(side: string) => any} */
const railOf = side => $(side === 'left' ? 'rail-left' : 'rail-right');
/** @type {(side: string) => any} */
const pinsOf = side => railOf(side).querySelector('.rail-pins');
/** @type {(name: string) => any} */
const zoneOf = name => document.querySelector(`.bar-zone[data-zone="${name}"]`);

/** Angestammter Platz: wo etwas ohne gespeicherte Anordnung sitzt. */
const homeOf = id => (KIND[id] === 'bar' ? zone(BAR_HOME[id] || 'top') : dock(homeSide[id] || 'right'));

/** Der Platz, der gerade gilt — das, was man sieht. @returns {Place} */
const placeOf = id => shown[id] || layout.places[id] || homeOf(id);

/** Rückweg beim Lösen des Pins bzw. beim Andocken. @returns {Place} */
const originOf = id => layout.origins[id] || homeOf(id);

// Nur bekannte IDs übernehmen, fehlende hinten anhängen.
const mergeOrder = (saved, all) => [...(saved || []).filter(id => all.includes(id)), ...all.filter(id => !(saved || []).includes(id))];

// Ein Element in einer Reihenfolge vor `beforeId` setzen (null = ans Ende).
function moveInOrder(list, id, beforeId) {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  const j = beforeId ? list.indexOf(beforeId) : -1;
  if (j >= 0) list.splice(j, 0, id); else list.push(id);
}

// ── Speichern ───────────────────────────────────────────────────────
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch {}
}

function load() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return; }
  if (!raw || typeof raw !== 'object') return;
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  layout.pinW = { ...layout.pinW, ...obj(raw.pinW) };
  layout.order = mergeOrder(raw.order, layout.order);
  layout.barOrder = mergeOrder(raw.barOrder, BARS);
  layout.mobilePins = obj(raw.mobilePins);
  layout.mobileSide = obj(raw.mobileSide);
  layout.mobileOrder = Array.isArray(raw.mobileOrder) ? raw.mobileOrder : [];
  layout.geom = obj(raw.geom);
  layout.lastSide = obj(raw.lastSide);

  // Plätze lesen. Jeder einzelne wird geprüft; was nicht passt, fällt auf den
  // angestammten Platz zurück, statt die Oberfläche lahmzulegen.
  for (const [id, v] of Object.entries(obj(raw.places))) {
    const p = KIND[id] && fromJSON(v, KIND[id]);
    if (p) layout.places[id] = p;
  }
  for (const [id, v] of Object.entries(obj(raw.origins))) {
    const p = KIND[id] && fromJSON(v, KIND[id]);
    if (p) layout.origins[id] = p;
  }
  // Ältere Fassungen speicherten `items: { mode, side, zone, x, y, w, h }`.
  if (!raw.places && raw.items) migrateItems(obj(raw.items));
}

// Anordnung aus der Zeit vor dem Platz-Modell übernehmen, damit niemand sein
// eingerichtetes Fenster verliert.
function migrateItems(items) {
  for (const [id, st] of Object.entries(items)) {
    const kind = KIND[id];
    if (!kind || !st || typeof st !== 'object') continue;
    const side = st.side === 'left' || st.side === 'right' ? st.side : null;
    let p = null;
    if (st.mode === 'float') p = float({ x: st.x || 0, y: st.y || 0, w: st.w || 320, h: st.h || 420 });
    else if (st.mode === 'pinned' && kind === 'panel') p = pinned(side || homeSide[id] || 'right');
    else if (st.mode === 'drawer') p = dock(side || homeSide[id] || 'right');
    else if (kind === 'bar') p = zone(st.zone || BAR_HOME[id] || 'top');
    else p = dock(side || homeSide[id] || 'right');
    if (p) layout.places[id] = p;
    if (Number.isFinite(st.w)) layout.geom[id] = { x: st.x || 0, y: st.y || 0, w: st.w, h: st.h || 0 };
    // `unpinTo` war der Vorläufer von `origins`.
    if (st.unpinTo === 'drawer') layout.origins[id] = dock(side || 'right');
    else if (typeof st.unpinTo === 'string' && kind === 'bar') layout.origins[id] = zone(st.unpinTo);
  }
}

// ── Hilfen ──────────────────────────────────────────────────────────
const wsRect = () => ws.getBoundingClientRect();

function sortPanels(container) {
  const o = layout.order;
  const guests = [...container.querySelectorAll(':scope > [data-panel].is-guest')];
  [...container.querySelectorAll(':scope > [data-panel]:not(.is-guest)')]
    .sort((a, b) => o.indexOf(a.dataset.panel) - o.indexOf(b.dataset.panel))
    .forEach(p => container.append(p));
  guests.forEach(p => container.append(p));   // ein offener Gast bleibt unten
}

function syncRail(side) {
  const rail = railOf(side);
  const n = pinsOf(side).querySelectorAll(':scope > [data-panel]:not(.is-guest)').length;
  rail.classList.toggle('has-pins', n > 0);
  rail.style.setProperty('--pins-w', layout.pinW[side] + 'px');
}

// Handy: unten angepinnte Leisten stehen zwischen Zeichenfläche und Dock.
// Eine Schublade fährt als Blatt von unten hoch — ohne dieses Maß läge sie
// genau über den angepinnten Leisten und verdeckte sie.
function syncMobilePins() {
  const zoneEl = zoneOf('bottom');
  const h = MOBILE.matches && zoneEl && zoneEl.offsetParent !== null
    ? Math.round(zoneEl.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty('--mpins-h', h + 'px');
}

function bringToFront(el) { el.style.zIndex = String(++zTop); }

function clampFloat(el) {
  const r = wsRect();
  const w = el.offsetWidth;
  let x = parseFloat(el.style.left) || 0, y = parseFloat(el.style.top) || 0;
  x = Math.min(Math.max(0, x), Math.max(0, r.width - Math.min(w, 80)));
  y = Math.min(Math.max(0, y), Math.max(0, r.height - 36));
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

// Liegt dort schon ein Fenster, das neue um ein Stück versetzen.
function cascade(el, g) {
  const others = [...layer.querySelectorAll('.is-floating')].filter(o => o !== el);
  for (let i = 0; i < 12; i++) {
    const hit = others.some(o => Math.abs(parseFloat(o.style.left) - g.x) < 28 && Math.abs(parseFloat(o.style.top) - g.y) < 28);
    if (!hit) break;
    g.x += 32; g.y += 32;
  }
  return g;
}

function placeFloat(el, g) {
  if (g.cascade) g = cascade(el, { ...g });
  el.style.left = g.x + 'px';
  el.style.top = g.y + 'px';
  if (g.w) el.style.width = g.w + 'px';
  if (g.h) el.style.height = g.h + 'px';
  layer.append(el);
  bringToFront(el);
  clampFloat(el);
}

/** Fenstergröße für ein Ding, das noch nie geschwebt hat. */
function defaultGeom(id) {
  const g = layout.geom[id], r = wsRect();
  const w = g?.w || (KIND[id] === 'bar' ? 380 : 300);
  const h = g?.h || (KIND[id] === 'bar' ? 0 : 420);
  return { x: g?.x ?? Math.max(0, (r.width - w) / 2), y: g?.y ?? 40, w, h };
}

/** Geometrie eines Fensters merken — auch für später, wenn es angedockt ist. */
function rememberGeom(id, el) {
  layout.geom[id] = {
    x: Math.round(parseFloat(el.style.left) || 0),
    y: Math.round(parseFloat(el.style.top) || 0),
    w: el.offsetWidth, h: el.offsetHeight,
  };
  const p = placeOf(id);
  if (isFloat(p)) layout.places[id] = float(layout.geom[id]);
}

function clearFloatStyle(el) {
  for (const p of ['left', 'top', 'width', 'height', 'zIndex']) el.style[p] = '';
}

function showHint(h) {
  hint.hidden = !h;
  if (h) Object.assign(hint.style, { left: h.x + 'px', top: h.y + 'px', width: h.w + 'px', height: h.h + 'px' });
}

// Einfüge-Position in einer Liste von Elementen: vor dem ersten, dessen
// Mitte hinter dem Zeiger liegt. Liefert { before, line } — line ist die
// Lage der Einfügemarke (Bildschirmkoordinate).
function insertionPoint(els, pos, vertical) {
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const mid = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
    if (pos < mid) return { before: el, line: vertical ? r.top : r.left };
  }
  const last = els[els.length - 1]?.getBoundingClientRect();
  return { before: null, line: last ? (vertical ? last.bottom : last.right) : null };
}

// ════════════════════════════════════════════════════════════════════
// Platz setzen und zeichnen
// ════════════════════════════════════════════════════════════════════

/**
 * Der einzige Weg, einen Platz zu ändern.
 * @param {string} id
 * @param {Place} next
 * @param {{before?:string|null, geom?:object}} [opts]
 */
function setPlace(id, next, opts = {}) {
  const prev = placeOf(id);
  shown[id] = next;

  // Am Handy gilt eine eigene, nicht gespeicherte Anordnung (applyAll). Was
  // dort verschoben wird, darf die Anordnung am breiten Fenster nicht ändern.
  if (!MOBILE.matches) {
    // Ruhige Plätze (Dock, Zone) sind der Rückweg: von dort kommt man, dorthin
    // führen Pin und Andocken zurück. Angepinnt und schwebend zählen nicht —
    // sonst führte „zurück" wieder dorthin, wo man gerade weg will.
    if (!applying && !isPinned(prev) && !isFloat(prev) && !same(prev, next)) {
      layout.origins[id] = toJSON(prev);
    }
    if ('before' in opts) {
      const list = next.kind === 'zone' ? layout.barOrder : layout.order;
      moveInOrder(list, id, opts.before);
    }
    layout.places[id] = next;
    // Zuletzt benutzte Seite merken: beim nächsten Anpinnen ist sie der
    // Vorschlag, wenn der aktuelle Platz keine Seite hat (oben/unten).
    if (isPinned(next)) layout.lastSide[id] = sideOf(next);
  }
  render(id, opts.geom);
  if (!applying) save();
}

/**
 * Platz → DOM. Die einzige Stelle, die Eltern-Element und Klassen setzt.
 * @param {string} id
 * @param {object} [geom]  Geometrie für ein frisch gelöstes Fenster
 */
function render(id, geom) {
  const el = elOf(id);
  if (!el) return;
  const kind = KIND[id];
  const p = placeOf(id);
  const side = sideOf(p) || homeSide[id] || 'right';

  if (el.classList.contains('is-shown')) closeDrawer();
  el.classList.remove('is-shown', 'is-pinned', 'is-floating', 'is-vertical', 'is-bar-drawer');
  clearFloatStyle(el);

  // Das Dock-Icon zieht mit, sobald der Platz eine Seite hat.
  const btn = dockButtonFor(id);
  if (btn && sideOf(p)) railOf(side).querySelector('.rail-dock').append(btn);
  if (btn && kind === 'bar') btn.hidden = p.kind !== 'dock';

  switch (p.kind) {
    case 'pinned':
      pinsOf(side).append(el);
      sortPanels(pinsOf(side));
      el.classList.add('is-pinned');
      // Angepinnt und zugeklappt wäre eine leere Spalte — also aufklappen.
      if (el.classList.contains('collapsed')) {
        el.classList.remove('collapsed');
        el.querySelector('.panel-toggle')?.setAttribute('aria-expanded', 'true');
      }
      break;

    case 'float':
      el.classList.add('is-floating');
      placeFloat(el, geom || p.geom || defaultGeom(id));
      break;

    case 'zone':
      placeBar(id, p.zone);
      if (p.zone === 'left' || p.zone === 'right') el.classList.add('is-vertical');
      break;

    default:   // 'dock' — Icon im Dock, Inhalt als Schublade daneben
      railOf(side).append(el);
      if (kind === 'bar') {
        el.classList.add('is-bar-drawer');
        if (!MOBILE.matches) el.classList.add('is-vertical');
      } else {
        sortPanels(railOf(side));
      }
  }

  // Ausgabe fürs CSS und für dock.js — niemals zurückgelesen.
  el.dataset.mode = p.kind;
  if (sideOf(p)) el.dataset.side = side;

  sortDock(layout.order);
  if (p.kind === 'float') rememberGeom(id, el);
  syncRail('left');
  syncRail('right');
  syncButtons(el, id);
}

// Leiste in ihre Zone hängen, in der gespeicherten Reihenfolge.
function placeBar(id, zoneName) {
  const el = $(id);
  const z = zoneOf(zoneName);
  z.append(el);
  [...z.children].sort((a, b) => layout.barOrder.indexOf(a.id) - layout.barOrder.indexOf(b.id)).forEach(c => z.append(c));
}

// ── Knopf-Beschriftungen ────────────────────────────────────────────
// Panel und Leiste tragen dieselben zwei Knöpfe und dieselben Begriffe:
// die Pinnadel zeigt einen Zustand (seitlich angepinnt oder nicht), das
// Fenster-Symbol eine Handlung (lösen bzw. wieder andocken).
function syncButtons(el, id) {
  const p = placeOf(id);
  const pin = el.querySelector('.panel-pin, .bar-pin');
  const fl = el.querySelector('.panel-float, .bar-float');
  if (pin) {
    if (KIND[id] === 'bar' && MOBILE.matches) {
      // Am Handy heißt der Pin etwas anderes: unten festmachen oder ins Dock.
      const below = p.kind === 'zone';
      pin.setAttribute('aria-pressed', String(below));
      pin.title = t(below ? 'lay.mobileUnpin' : 'lay.mobilePin');
    } else {
      pin.setAttribute('aria-pressed', String(isPinned(p)));
      pin.title = t(isPinned(p) ? 'lay.unpin' : 'lay.pin');
    }
    pin.setAttribute('aria-label', pin.title);
  }
  if (fl) {
    fl.title = t(isFloat(p) ? 'lay.dockBar' : 'lay.float');
    fl.setAttribute('aria-label', fl.title);
  }
  const grip = el.querySelector('.bar-grip');
  if (grip) grip.title = t('lay.grip');
}

function headButton(cls, icon) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn ' + cls;
  b.innerHTML = iconSvg(icon);
  return b;
}

// ════════════════════════════════════════════════════════════════════
// Die drei Gesten: anpinnen, lösen, ziehen
// ════════════════════════════════════════════════════════════════════
// Alle drei gelten für Panels und Leisten gleich. Was dabei herauskommt,
// rechnet place.js aus — hier wird nur gemessen und gezeichnet.

/** Mitte des Elements → nähere Hälfte der Bühne. */
function nearSideOf(el) {
  const r = el.getBoundingClientRect(), w = wsRect();
  return nearerSide(r.left + r.width / 2, w.left, w.width);
}

function doTogglePin(id) {
  const el = elOf(id);
  // Handy: der Pin schaltet zwischen „unten angepinnt" und „im Dock".
  if (KIND[id] === 'bar' && MOBILE.matches) {
    layout.mobilePins[id] = placeOf(id).kind !== 'zone';
    save();
    closeDrawer();
    applyAll();
    return;
  }
  const cur = placeOf(id);
  const next = togglePin(cur, {
    kind: KIND[id],
    origin: originOf(id),
    home: homeOf(id),
    // Die nähere Hälfte zählt nur für ein schwebendes Fenster. Eine Leiste
    // von oben hat keine Seite — dann gilt die zuletzt benutzte, sonst links.
    nearSide: isFloat(cur) ? nearSideOf(el) : undefined,
    lastSide: layout.lastSide[id] || homeSide[id],
  });
  setPlace(id, next);
}

function doToggleFloat(id) {
  const el = elOf(id);
  const r = el.getBoundingClientRect(), w = wsRect();
  const geom = r.width
    ? { x: r.left - w.left + 24, y: r.top - w.top + 24,
        w: KIND[id] === 'bar' ? Math.min(r.width, 420) : r.width,
        h: KIND[id] === 'bar' ? 0 : Math.min(r.height, 460), cascade: true }
    : { ...defaultGeom(id), cascade: true };
  const next = toggleFloat(placeOf(id), { geom, origin: originOf(id), home: homeOf(id) });
  setPlace(id, next, { geom: next.kind === 'float' ? geom : undefined });
}

/**
 * Wohin fällt das Ding, das gerade am Zeiger hängt?
 * Liefert zusätzlich die Einfügemarke und die Reihenfolge-Position.
 * @returns {{place:Place, before:string|null, hint:object}|null}
 */
function targetAt(id, cx, cy, wasPinned) {
  const kind = KIND[id];
  const w = wsRect();
  const body = $('stage-body').getBoundingClientRect();
  const zr = name => { const z = zoneOf(name); return z.offsetHeight ? z.getBoundingClientRect() : null; };
  const place = dropTarget({
    kind, x: cx, y: cy, wasPinned,
    rects: {
      railLeft: railOf('left').getBoundingClientRect(),
      railRight: railOf('right').getBoundingClientRect(),
      body,
      zoneTop: zr('top'), zoneBottom: zr('bottom'),
      zoneLeftW: zoneOf('left').offsetWidth, zoneRightW: zoneOf('right').offsetWidth,
    },
  });
  if (!place) return null;

  // Einfügemarke: wo genau in der Reihe landet es?
  if (place.kind === 'zone') {
    const z = zoneOf(place.zone);
    const horizontal = place.zone === 'top' || place.zone === 'bottom';
    const others = [...z.children].filter(c => c.id !== id);
    const ip = insertionPoint(others, horizontal ? cy : cx, horizontal);
    const r = z.offsetWidth || z.offsetHeight ? z.getBoundingClientRect() : null;
    const hint = horizontal
      ? { x: body.left - w.left,
          y: (ip.line ?? (place.zone === 'top' ? (r ? r.bottom : body.top) : (r ? r.top : body.bottom - 4))) - w.top - 2,
          w: body.width, h: 4 }
      : { x: (ip.line ?? (place.zone === 'left' ? (r ? r.right : body.left + 4) : (r ? r.left : body.right - 4))) - w.left - 2,
          y: body.top - w.top, w: 4, h: body.height };
    return { place, before: ip.before?.id || null, hint };
  }

  const side = sideOf(place);
  if (place.kind === 'pinned') {
    const pins = [...pinsOf(side).querySelectorAll(':scope > [data-panel]:not(.is-guest)')].filter(p => p.dataset.panel !== id);
    const ip = insertionPoint(pins, cy, true);
    const rail = railOf(side).getBoundingClientRect();
    const col = railOf(side).classList.contains('has-pins') && pins.length
      ? pinsOf(side).getBoundingClientRect()
      : { left: side === 'left' ? rail.left + 48 : rail.right - 48 - layout.pinW[side], width: layout.pinW[side] };
    return { place, before: ip.before?.dataset.panel || null,
      hint: { x: col.left - w.left, y: (ip.line ?? w.top) - w.top - 2, w: col.width, h: 4 } };
  }

  // dock
  const dockEl = railOf(side).querySelector('.rail-dock');
  const btns = [...dockEl.children].filter(b => b.dataset.target !== id && !b.hidden);
  const ip = insertionPoint(btns, cy, true);
  const d = dockEl.getBoundingClientRect();
  return { place, before: ip.before?.dataset.target || null,
    hint: { x: d.left - w.left + 4, y: (ip.line ?? d.top + 8) - w.top - 2, w: d.width - 8, h: 4 } };
}

// ── Ziehen ──────────────────────────────────────────────────────────
// Erst ab ein paar Pixeln Bewegung wird gezogen — ein normaler Klick auf
// Knöpfe im Kopf bleibt ein Klick. `el` folgt dem Zeiger (oder `follow`).
/**
 * @param {Element} handle            woran gezogen wird
 * @param {any} el                    was dem Zeiger folgt (null = nur Geste)
 * @param {object} opts
 * @param {() => void} opts.lift      beim Anheben
 * @param {(cx:number, cy:number) => any} opts.target   Ziel unter dem Zeiger
 * @param {(tgt:any) => void} opts.drop                 beim Loslassen
 * @param {(cx:number, cy:number) => void} [opts.follow] eigene Bewegung
 * @param {boolean} [opts.mobile]     auch auf dem Handy ziehbar
 */
function makeDraggable(handle, el, { lift, follow, target, drop, mobile = false }) {
  handle.addEventListener('pointerdown', /** @param {PointerEvent} e */ e => {
    if (e.button !== 0 || (MOBILE.matches && !mobile)) return;
    if (el && /** @type {Element} */ (e.target).closest('button, input, select, a')) return;
    const sx = e.clientX, sy = e.clientY;
    // Auf dem Handy scrollt die Dock-Leiste waagerecht, und die Icons füllen
    // sie komplett aus. Ein Wisch muss darum scrollen dürfen: dort beginnt
    // das Ziehen erst nach kurzem Halten. Bewegt sich der Finger vorher,
    // geben wir die Geste frei und der Browser scrollt.
    const hold = MOBILE.matches && e.pointerType !== 'mouse';
    let dragging = false, armed = !hold, offX = 0, offY = 0, tgt = null, timer = 0;

    const step = (cx, cy) => {
      if (el) {
        const w = wsRect();
        el.style.left = (cx - w.left - offX) + 'px';
        el.style.top = (cy - w.top - offY) + 'px';
      }
      follow?.(cx, cy);
      tgt = target(cx, cy);
      showHint(tgt?.hint);
    };
    const begin = (cx, cy) => {
      dragging = true;
      lift();
      if (el) { const r = el.getBoundingClientRect(); offX = sx - r.left; offY = sy - r.top; }
      document.body.classList.add('is-dragging-ui');
      navigator.vibrate?.(10);
      step(cx, cy);
    };
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    const move = ev => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        if (!armed) { stop(); return; }   // Wischen statt Ziehen: scrollen lassen
        begin(ev.clientX, ev.clientY);
        ev.preventDefault();
        return;
      }
      ev.preventDefault();
      step(ev.clientX, ev.clientY);
    };
    const up = () => {
      stop();
      if (!dragging) return;
      document.body.classList.remove('is-dragging-ui');
      showHint(null);
      if (el) clampFloat(el);
      drop(tgt);
    };
    if (hold) timer = setTimeout(() => { armed = true; begin(sx, sy); }, 320);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

/**
 * Ziehen am Kopf bzw. am Griff: das Ding hängt am Zeiger und landet dort,
 * wo man es loslässt. Für Panels und Leisten derselbe Code.
 */
function initDrag(id, handle) {
  const el = elOf(id);
  let wasPinned = false;
  makeDraggable(handle, el, {
    lift: () => {
      wasPinned = isPinned(placeOf(id));
      if (isFloat(placeOf(id))) return;
      const r = el.getBoundingClientRect(), w = wsRect();
      setPlace(id, float({ x: r.left - w.left, y: r.top - w.top,
        w: KIND[id] === 'bar' ? Math.min(r.width, 420) : r.width,
        h: KIND[id] === 'bar' ? 0 : Math.min(r.height, 460) }));
    },
    target: (cx, cy) => targetAt(id, cx, cy, wasPinned),
    drop: tgt => {
      if (!tgt) { rememberGeom(id, el); save(); return; }   // nirgendwo: bleibt schwebend
      setPlace(id, tgt.place, { before: tgt.before });
      // Im Dock gelandet: einmal aufklappen, damit man sieht, wo es hin ist.
      if (tgt.place.kind === 'dock') openDrawer(el);
    },
  });
}

/** Dock-Icons ziehen: Seite und Reihenfolge ändern, Art des Platzes bleibt. */
function initDockDrag(id) {
  const btn = dockButtonFor(id);
  if (!btn) return;
  let ghost = null;
  // Der Klick direkt nach dem Ziehen gehört zum Ziehen, nicht zum Öffnen.
  const swallow = e => { e.stopImmediatePropagation(); e.preventDefault(); };
  makeDraggable(btn, null, {
    mobile: true,   // Dock-Icons lassen sich auch auf dem Handy ordnen
    lift: () => {
      ghost = btn.cloneNode(true);
      ghost.classList.add('dock-ghost');
      layer.append(ghost);
      btn.addEventListener('click', swallow, { capture: true });
    },
    follow: (cx, cy) => {
      const w = wsRect();
      Object.assign(ghost.style, { left: (cx - w.left - 18) + 'px', top: (cy - w.top - 18) + 'px' });
    },
    target: (cx, cy) => (MOBILE.matches ? mobileDockSlot(id, cx, cy) : targetAt(id, cx, cy, isPinned(placeOf(id)))),
    drop: tgt => {
      ghost?.remove();
      ghost = null;
      setTimeout(() => btn.removeEventListener('click', swallow, { capture: true }), 0);
      if (!tgt) return;
      if (MOBILE.matches) { mobileDockDrop(id, tgt); return; }
      // Ein angepinntes bleibt angepinnt, ein schwebendes schwebt weiter —
      // nur Seite und Reihe ändern sich.
      const cur = placeOf(id);
      const place = isFloat(cur) ? cur
        : isPinned(cur) && tgt.place.kind !== 'zone' ? pinned(sideOf(tgt.place) || sideOf(cur))
        : tgt.place;
      setPlace(id, place, { before: tgt.before });
    },
  });
}

// Handy: die beiden Docks liegen als eine waagerechte Leiste unten. Die
// linke Gruppe reicht bis zum Anfang der rechten.
function mobileDockSlot(id, cx, cy) {
  const w = wsRect();
  const L = railOf('left').getBoundingClientRect(), R = railOf('right').getBoundingClientRect();
  // Weit über der Leiste losgelassen → abbrechen.
  if (cy < Math.min(L.top, R.top) - 60) return null;
  const side = cx < R.left ? 'left' : 'right';
  const dockEl = railOf(side).querySelector('.rail-dock');
  const btns = [...dockEl.children].filter(b => b.dataset.target !== id && !b.hidden);
  const ip = insertionPoint(btns, cx, false);
  const d = dockEl.getBoundingClientRect();
  const x = ip.line ?? d.left + 8;
  return { side, before: ip.before?.dataset.target || null,
    hint: { x: x - w.left - 2, y: d.top - w.top + 6, w: 4, h: d.height - 12 } };
}

function mobileDockDrop(id, tgt) {
  layout.mobileSide = { ...layout.mobileSide, [id]: tgt.side };
  const order = mergeOrder(layout.mobileOrder, layout.order);
  moveInOrder(order, id, tgt.before);
  layout.mobileOrder = order;
  save();
  applyAll();
}

// ── Aufbau: Panels ──────────────────────────────────────────────────
function initPanel(el) {
  const id = el.dataset.panel;
  KIND[id] = 'panel';
  homeSide[id] = el.closest('#rail-left') ? 'left' : 'right';

  const head = el.querySelector('.panel-head');
  const close = head.querySelector('.dock-close');
  const fl = headButton('panel-float', 'float');
  const pin = headButton('panel-pin', 'pin');
  head.insertBefore(fl, close);
  head.insertBefore(pin, close);

  fl.addEventListener('click', () => doToggleFloat(id));
  pin.addEventListener('click', () => doTogglePin(id));
  // × am schwebenden Fenster: zurück, woher es kam.
  close.addEventListener('click', () => { if (isFloat(placeOf(id))) setPlace(id, originOf(id)); });

  // Klick aufs Dock-Icon eines angepinnten/schwebenden Panels: zeigen.
  el.addEventListener('panel-focus', () => {
    if (isFloat(placeOf(id))) bringToFront(el);
    el.scrollIntoView({ block: 'nearest' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
  });
  el.addEventListener('pointerdown', () => { if (isFloat(placeOf(id))) bringToFront(el); });

  initDrag(id, head);
}

// ── Aufbau: Leisten ─────────────────────────────────────────────────
function initBar(id) {
  const el = $(id);
  KIND[id] = 'bar';
  const handle = document.createElement('div');
  handle.className = 'bar-handle';
  const grip = document.createElement('span');
  grip.className = 'bar-grip';
  grip.innerHTML = iconSvg('grip');
  // Dieselben zwei Knöpfe wie im Panel-Kopf — und dieselbe Bedeutung.
  const fl = headButton('bar-float', 'float');
  const pin = headButton('bar-pin', 'pin');
  handle.append(grip, fl, pin);
  el.prepend(handle);

  fl.addEventListener('click', () => doToggleFloat(id));
  pin.addEventListener('click', () => doTogglePin(id));
  el.addEventListener('pointerdown', () => { if (isFloat(placeOf(id))) bringToFront(el); });
  el.addEventListener('panel-focus', () => { if (isFloat(placeOf(id))) bringToFront(el); });

  initDrag(id, grip);

  // Dock-Icon (nur sichtbar, solange die Leiste im Dock wohnt).
  const [icon, label] = BAR_DOCK[id];
  addDockItem(el, id, icon, label, 'right').hidden = true;
}

// ── Breite der angepinnten Spalte ───────────────────────────────────
function initPinResizer(side) {
  const grip = document.createElement('div');
  grip.className = 'pins-resizer';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'vertical');
  railOf(side).append(grip);
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    const sx = e.clientX, w0 = layout.pinW[side];
    document.body.classList.add('is-dragging-ui', 'is-resizing-ui');
    const move = ev => {
      const dx = ev.clientX - sx;
      layout.pinW[side] = Math.round(Math.min(PIN_MAX, Math.max(PIN_MIN, w0 + (side === 'left' ? dx : -dx))));
      syncRail(side);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-dragging-ui', 'is-resizing-ui');
      save();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

// ── Handy: Rand ausblenden, wo die Leiste weitergeht ────────────────
// Die Leisten scrollen waagerecht, ihre Scrollbalken sind versteckt. Ohne
// Hinweis sieht eine abgeschnittene Reihe aus wie eine volle — darum wird
// der Rand weich, solange dort noch etwas liegt. Rechts in der
// Werkzeugleiste übernimmt das der angeheftete Regler-Knopf.
function syncBarFade(el) {
  const rest = el.scrollWidth - el.clientWidth - el.scrollLeft;
  const rightCovered = el.id === 'toolbar' && optsBtn && !optsBtn.hidden;
  el.classList.toggle('is-more-l', MOBILE.matches && el.scrollLeft > 4);
  el.classList.toggle('is-more-r', MOBILE.matches && rest > 4 && !rightCovered);
}

// Die Icon-Spalten unten können genauso überlaufen wie die Leisten. Das
// Raster der Timeline nicht: links klebt dort die Ebenen-Spalte, ein
// Verlauf am Rand läge über den Namen.
const fadeEls = () => [...BARS.map(id => $(id)), ...document.querySelectorAll('.rail-dock')];

function initBarFades() {
  for (const el of fadeEls()) {
    el.addEventListener('scroll', () => syncBarFade(el), { passive: true });
    new ResizeObserver(() => syncBarFade(el)).observe(el);
  }
}

const syncAllBarFades = () => fadeEls().forEach(syncBarFade);

// ── Handy: Werkzeug-Optionen ────────────────────────────────────────
// In der einzeiligen Werkzeugleiste stehen auf dem Handy nur die Werkzeuge.
// Größe, Stärke usw. wandern in eine eigene Zeile darüber, die der
// Regler-Knopf oder ein zweiter Tipp aufs aktive Werkzeug aufklappt. Am
// breiten Fenster kommen sie an ihren Platz zurück (Platzhalter).
const OPT_IDS = ['brush-size-group', 'strength-group', 'tolerance-group', 'pixel-perfect-group', 'shape-group', 'select-group'];
let optsBox, optsBtn, optsMarks;
// Die Statuszeile liegt am Desktop unter den Leisten. Auf dem Handy ist
// jede Zeile Höhe zu schade dafür — sie wandert als schwebende Pille in die
// Zeichenfläche (CSS) und braucht dort keinen eigenen Platz.
let infoMark;

function setToolOpts(open) {
  optsBox.hidden = !open;
  optsBtn.classList.toggle('is-active', open);
  optsBtn.setAttribute('aria-expanded', String(open));
  if (open) placeToolOpts();
}

// Liegt die Werkzeugleiste im Dock, ist sie eine Schublade (position:
// fixed) — genau über dem Platz, an dem die Options-Zeile in der Bühne
// sitzt. Die Zeile läge dann unsichtbar dahinter; sie schwebt darum direkt
// über der Schublade.
const toolbarIsDrawer = () => MOBILE.matches && !!$('toolbar').closest('.rail');

function placeToolOpts() {
  const over = toolbarIsDrawer();
  optsBox.classList.toggle('is-over-drawer', over);
  optsBox.style.bottom = over ? `${window.innerHeight - $('toolbar').getBoundingClientRect().top}px` : '';
}

// Hat das aktive Werkzeug überhaupt Optionen? (app.js blendet die Gruppen
// je Werkzeug aus.)
const hasToolOpts = () => OPT_IDS.some(id => !$(id).hidden);

// Nach jedem Werkzeugwechsel aufrufen: ohne Optionen gibt es nichts
// aufzuklappen — dann verschwindet der Knopf, statt eine leere Zeile zu
// öffnen. `openIfAny` zieht die Zeile von selbst auf; das nutzt die Auswahl,
// deren Aktionen sonst genau dann versteckt wären, wenn man sie braucht.
export function refreshToolOpts(openIfAny = false) {
  if (!optsBtn) return;
  const any = hasToolOpts();
  optsBtn.hidden = !MOBILE.matches || !any;
  if (!MOBILE.matches) return;
  if (!any) setToolOpts(false);
  else if (openIfAny) setToolOpts(true);
  syncAllBarFades();
}

function initToolOpts() {
  const tb = $('toolbar');
  optsMarks = OPT_IDS.map(id => { const c = document.createComment(id); $(id).before(c); return c; });
  infoMark = document.createComment('info-bar');
  $('info-bar').before(infoMark);
  optsBox = document.createElement('div');
  optsBox.id = 'tool-opts';
  optsBtn = headButton('tool-opts-btn', 'sliders');
  optsBtn.setAttribute('aria-controls', 'tool-opts');
  tb.querySelector('.bar-handle').after(optsBtn);
  optsBtn.addEventListener('click', () => setToolOpts(optsBox.hidden));
  // Capture: vor app.js, solange das Werkzeug noch als aktiv markiert ist.
  tb.addEventListener('click', e => {
    const b = e.target.closest('.tool-btn[data-tool]');
    if (b && MOBILE.matches && b.classList.contains('is-active')) setToolOpts(optsBox.hidden);
  }, true);
  setToolOpts(false);
  // Schublade zu → Options-Zeile mit zu; sie gehört zur Leiste.
  new MutationObserver(() => {
    if (toolbarIsDrawer() && !$('toolbar').classList.contains('is-shown')) setToolOpts(false);
  }).observe(tb, { attributes: true, attributeFilter: ['class'] });
}

function syncToolOpts() {
  if (MOBILE.matches) {
    OPT_IDS.forEach(id => optsBox.append($(id)));
    // Der Knopf sitzt am rechten Ende der Leiste und klebt dort fest (CSS).
    $('toolbar').append(optsBtn);
    zoneOf('bottom').before(optsBox);
    $('stage-body').append($('info-bar'));
  } else {
    OPT_IDS.forEach((id, i) => optsMarks[i].after($(id)));
    $('toolbar').querySelector('.bar-handle').after(optsBtn);
    infoMark.after($('info-bar'));
    optsBox.remove();
    setToolOpts(false);
  }
  refreshToolOpts();
  syncAllBarFades();
}

function relabel() {
  optsBtn.title = t('lay.toolOpts');
  optsBtn.setAttribute('aria-label', optsBtn.title);
  for (const id of Object.keys(KIND)) {
    const el = elOf(id);
    if (el) syncButtons(el, id);
  }
  document.querySelectorAll('.pins-resizer').forEach(g => { /** @type {any} */ (g).title = t('lay.resize'); });
}

// ── Anordnung anwenden ──────────────────────────────────────────────
// Auf dem Handy abgewandelt: angepinnte und schwebende Panels werden
// Schubladen, Leisten wandern nach unten. Die Abwandlung wird nicht
// gespeichert — zurück am breiten Fenster steht alles wieder wie vorher.
function applyAll() {
  const mobile = MOBILE.matches;
  // Beim Herstellen wird kein Rückweg gemerkt und nicht gespeichert: sonst
  // überschriebe der Startplatz den gespeicherten Ursprung.
  applying = true;

  for (const id of Object.keys(KIND)) {
    if (!elOf(id)) continue;
    const saved = layout.places[id] || homeOf(id);
    shown[id] = mobile
      ? forMobile(saved, KIND[id], {
          pinnedBelow: KIND[id] === 'bar' && layout.mobilePins[id] !== false,
          side: layout.mobileSide[id] || sideOf(saved) || homeSide[id],
        })
      : saved;
    render(id);
  }

  applying = false;
  if (mobile && layout.mobileOrder.length) sortDock(mergeOrder(layout.mobileOrder, layout.order));
  syncToolOpts();
  syncRail('left');
  syncRail('right');
}

// Ob gerade das Handy-Layout gilt — damit app.js denselben Umbruchpunkt
// benutzt und nicht eine zweite Zahl pflegen muss.
export const isMobileLayout = () => MOBILE.matches;

// Für das Timeline-Menü (js/tlmenu.js): wo steht die Timeline, und dorthin.
export function timelineZone() {
  const p = placeOf('timeline');
  return p.kind === 'zone' ? p.zone : null;
}
export function setTimelineZone(z) { setPlace('timeline', zone(z)); }

export function initLayout() {
  ws = $('workspace');
  layer = document.createElement('div');
  layer.id = 'float-layer';
  hint = document.createElement('div');
  hint.className = 'drop-hint';
  hint.hidden = true;
  layer.append(hint);
  ws.append(layer);

  for (const side of ['left', 'right']) {
    const pins = document.createElement('div');
    pins.className = 'rail-pins';
    railOf(side).append(pins);
    initPinResizer(side);
  }

  layout.order = [...document.querySelectorAll('[data-panel]')].map(p => /** @type {any} */ (p).dataset.panel).concat(BARS);
  document.querySelectorAll('[data-panel]').forEach(initPanel);
  BARS.forEach(initBar);
  // Erst jetzt gibt es alle Dock-Icons — Ziehen daran hängt daran.
  Object.keys(KIND).forEach(initDockDrag);
  initToolOpts();
  initBarFades();

  load();          // braucht KIND: nur bekannte IDs und passende Plätze zählen
  applyAll();
  MOBILE.addEventListener('change', () => { applyAll(); syncMobilePins(); });
  relabel();
  onLangChange(relabel);

  // Fenstergröße merken, wenn der Nutzer sie mit dem Eck-Griff ändert.
  const ro = new ResizeObserver(entries => {
    let changed = false;
    for (const e of entries) {
      const target = /** @type {any} */ (e.target);
      if (!target.classList.contains('is-floating')) continue;
      rememberGeom(target.dataset.panel || target.id, target);
      changed = true;
    }
    if (changed) save();
  });
  document.querySelectorAll('[data-panel], #toolbar, #color-bar, #timeline').forEach(el => ro.observe(el));

  // Die Höhe der unten angepinnten Leisten ändert sich beim An- und Abpinnen,
  // beim Drehen und wenn eine Leiste selbst umbricht.
  syncMobilePins();
  new ResizeObserver(syncMobilePins).observe(zoneOf('bottom'));

  window.addEventListener('resize', () => {
    layer.querySelectorAll('.is-floating').forEach(clampFloat);
    syncAllBarFades();
    syncMobilePins();
  });
}
