// ════════════════════════════════════════════════════════════════════
// LAYOUT — Panels und Leisten anpinnen, lösen, verschieben, umsortieren
// ════════════════════════════════════════════════════════════════════
// Panels ([data-panel]) kennen drei Zustände:
//   drawer  — Schublade hinter dem Icon im Dock (Standard, siehe dock.js)
//   pinned  — feste Spalte neben der Zeichenfläche, Breite per Griff ziehbar
//   float   — schwebendes Fenster, frei verschiebbar und in der Größe änderbar
// Angepinnt wird NUR über den Pin. Zieht man ein Panel an den Rand, wechselt
// es höchstens die Seite und den Platz in der Reihe — ein angepinntes bleibt
// angepinnt, alle anderen werden zur Schublade.
//
// Die zwei Leisten der Bühne (#toolbar, #color-bar) docken in einer von vier
// Zonen um die Zeichenfläche an (oben, links, rechts, unten), schweben, oder
// sitzen wie ein Panel als Icon im Dock (Modus drawer, senkrecht aufgeklappt).
// Auch ihre Reihenfolge innerhalb einer Zone lässt sich ziehen.
//
// Umsortieren geht überall per Ziehen: Panel-Kopf, Dock-Icon, Leisten-Griff.
// Die Anordnung ist eine Vorliebe dieses Browsers und liegt im localStorage,
// nicht im Projekt.
import { t, onLangChange } from './i18n.js';
import { iconSvg } from './icons.js';
import { closeDrawer, openDrawer, dockButtonFor, sortDock, addDockItem } from './dock.js';

const KEY = 'spritebit_layout';
const SIDE_REACH = 40;    // so weit neben der Leiste zählt ein Drop noch zur Seite
const ZONE_REACH = 44;    // so nah am Rand der Zeichenfläche dockt eine Leiste an
const PIN_MIN = 200, PIN_MAX = 560;
const BARS = ['toolbar', 'color-bar'];
const BAR_DOCK = { 'toolbar': ['tools', 'lay.toolbar'], 'color-bar': ['swatches', 'lay.colorbar'] };

let ws, layer, hint;
let zTop = 40;
let layout = { pinW: { left: 280, right: 300 }, items: {}, order: [], barOrder: [...BARS] };

const $ = id => document.getElementById(id);
const panelEl = id => document.querySelector(`[data-panel="${id}"]`);
const railOf = side => $(side === 'left' ? 'rail-left' : 'rail-right');
const pinsOf = side => railOf(side).querySelector('.rail-pins');
const zoneOf = name => document.querySelector(`.bar-zone[data-zone="${name}"]`);

// ── Speichern ───────────────────────────────────────────────────────
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return;
    layout.pinW = { ...layout.pinW, ...(raw.pinW || {}) };
    layout.items = raw.items || {};
    // Nur bekannte IDs übernehmen, fehlende hinten anhängen.
    const keep = (saved, all) => [...(saved || []).filter(id => all.includes(id)), ...all.filter(id => !(saved || []).includes(id))];
    layout.order = keep(raw.order, layout.order);
    layout.barOrder = keep(raw.barOrder, BARS);
  } catch {}
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch {}
}
const itemState = id => (layout.items[id] ||= {});

// Ein Element in einer Reihenfolge vor `beforeId` setzen (null = ans Ende).
function moveInOrder(list, id, beforeId) {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  const j = beforeId ? list.indexOf(beforeId) : -1;
  if (j >= 0) list.splice(j, 0, id); else list.push(id);
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

function defaultGeom(id) {
  const st = itemState(id), r = wsRect();
  const w = st.w || 300, h = st.h || 420;
  return { x: st.x ?? Math.max(0, (r.width - w) / 2), y: st.y ?? 40, w, h };
}

function rememberFloat(id, el) {
  Object.assign(itemState(id), {
    x: Math.round(parseFloat(el.style.left) || 0),
    y: Math.round(parseFloat(el.style.top) || 0),
    w: el.offsetWidth, h: el.offsetHeight,
  });
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

// ── Panels ──────────────────────────────────────────────────────────
// opts: side, before (Panel-ID, vor der es in der Reihe steht), geom
function setPanelMode(id, mode, opts = {}) {
  const el = panelEl(id);
  if (!el) return;
  const st = itemState(id);
  const side = opts.side || st.side || el.dataset.side;
  if ('before' in opts) moveInOrder(layout.order, id, opts.before);

  if (el.classList.contains('is-shown')) closeDrawer();
  el.classList.remove('is-shown', 'is-pinned', 'is-floating');
  clearFloatStyle(el);
  el.dataset.side = side;

  const btn = dockButtonFor(id);
  if (btn) railOf(side).querySelector('.rail-dock').append(btn);
  sortDock(layout.order);

  if (mode === 'pinned') {
    pinsOf(side).append(el);
    sortPanels(pinsOf(side));
    el.classList.add('is-pinned');
    // Angepinnt und zugeklappt wäre eine leere Spalte — also aufklappen.
    if (el.classList.contains('collapsed')) {
      el.classList.remove('collapsed');
      el.querySelector('.panel-toggle')?.setAttribute('aria-expanded', 'true');
    }
  } else if (mode === 'float') {
    el.classList.add('is-floating');
    placeFloat(el, opts.geom || defaultGeom(id));
  } else {
    mode = 'drawer';
    railOf(side).append(el);
    sortPanels(railOf(side));
  }

  el.dataset.mode = mode;
  Object.assign(st, { mode, side });
  if (mode === 'float') rememberFloat(id, el);
  syncRail('left');
  syncRail('right');
  syncHeadButtons(el);
  save();
}

function syncHeadButtons(el) {
  const pin = el.querySelector('.panel-pin');
  if (!pin) return;
  const pinned = el.dataset.mode === 'pinned';
  pin.setAttribute('aria-pressed', String(pinned));
  pin.title = t(pinned ? 'lay.unpin' : 'lay.pin');
  pin.setAttribute('aria-label', pin.title);
  const fl = el.querySelector('.panel-float');
  fl.title = t('lay.float');
  fl.setAttribute('aria-label', fl.title);
}

function headButton(cls, icon) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn ' + cls;
  b.innerHTML = iconSvg(icon);
  return b;
}

// Wohin fällt ein Panel, wenn man es bei (cx, cy) loslässt?
// → { side, pinned, before, hint } oder null (= schwebend lassen)
function panelTarget(id, cx, cy, wasPinned) {
  const w = wsRect();
  const L = railOf('left').getBoundingClientRect(), R = railOf('right').getBoundingClientRect();
  let side = null;
  if (cx < L.right + SIDE_REACH) side = 'left';
  else if (cx > R.left - SIDE_REACH) side = 'right';
  if (!side) return null;

  if (wasPinned) {
    const pins = [...pinsOf(side).querySelectorAll(':scope > [data-panel]:not(.is-guest)')].filter(p => p.dataset.panel !== id);
    const ip = insertionPoint(pins, cy, true);
    const col = (pinsOf(side).classList && railOf(side).classList.contains('has-pins') && pins.length)
      ? pinsOf(side).getBoundingClientRect()
      : { left: side === 'left' ? L.left + 48 : R.right - 48 - layout.pinW[side], width: layout.pinW[side] };
    const y = ip.line ?? w.top;
    return { side, pinned: true, before: ip.before?.dataset.panel || null,
      hint: { x: col.left - w.left, y: y - w.top - 2, w: col.width, h: 4 } };
  }
  return { ...dockSlot(id, side === 'left' ? -1e6 : 1e6, cy, 0), pinned: false };
}

function dropPanel(id, tgt) {
  if (!tgt) return false;
  if (tgt.pinned) { setPanelMode(id, 'pinned', { side: tgt.side, before: tgt.before }); return true; }
  setPanelMode(id, 'drawer', { side: tgt.side, before: tgt.before });
  openDrawer(panelEl(id));   // zeigen, wo es gelandet ist
  return true;
}

function initPanel(el) {
  const id = el.dataset.panel;
  el.dataset.side = el.closest('#rail-left') ? 'left' : 'right';
  el.dataset.mode = 'drawer';
  const head = el.querySelector('.panel-head');
  const close = head.querySelector('.dock-close');
  const fl = headButton('panel-float', 'float');
  const pin = headButton('panel-pin', 'pin');
  head.insertBefore(fl, close);
  head.insertBefore(pin, close);

  fl.addEventListener('click', () => {
    const r = el.getBoundingClientRect(), w = wsRect();
    const geom = r.width
      ? { x: r.left - w.left + 24, y: r.top - w.top + 24, w: r.width, h: Math.min(r.height, 460) }
      : null;
    setPanelMode(id, 'float', { geom: { ...(geom || defaultGeom(id)), cascade: true } });
  });
  pin.addEventListener('click', () => {
    if (el.dataset.mode === 'pinned') { setPanelMode(id, 'drawer'); return; }
    let side = el.dataset.side;
    if (el.dataset.mode === 'float') {
      const r = el.getBoundingClientRect(), w = wsRect();
      side = (r.left + r.width / 2) < (w.left + w.width / 2) ? 'left' : 'right';
    }
    setPanelMode(id, 'pinned', { side });
  });
  // × am schwebenden Fenster: zurück als (geschlossene) Schublade.
  close.addEventListener('click', () => { if (el.dataset.mode === 'float') setPanelMode(id, 'drawer'); });
  // Klick aufs Dock-Icon eines angepinnten/schwebenden Panels: zeigen.
  el.addEventListener('panel-focus', () => {
    if (el.dataset.mode === 'float') bringToFront(el);
    el.scrollIntoView({ block: 'nearest' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
  });
  el.addEventListener('pointerdown', () => { if (el.dataset.mode === 'float') bringToFront(el); });

  let wasPinned = false;
  makeDraggable(head, el, {
    lift: () => {
      wasPinned = el.dataset.mode === 'pinned';
      if (el.dataset.mode === 'float') return;
      const r = el.getBoundingClientRect(), w = wsRect();
      setPanelMode(id, 'float', { geom: { x: r.left - w.left, y: r.top - w.top, w: r.width, h: Math.min(r.height, 460) } });
    },
    target: (cx, cy) => panelTarget(id, cx, cy, wasPinned),
    drop: tgt => { if (!dropPanel(id, tgt)) { rememberFloat(id, el); save(); } },
  });
}

// Dock-Icons lassen sich ziehen: umsortieren oder auf die andere Seite.
// target/drop entscheiden, was mit dem dazugehörigen Element passiert.
function initDockDrag(id, { target, drop }) {
  const btn = dockButtonFor(id);
  if (!btn) return;
  let ghost = null;
  // Der Klick direkt nach dem Ziehen gehört zum Ziehen, nicht zum Öffnen.
  const swallow = e => { e.stopImmediatePropagation(); e.preventDefault(); };
  makeDraggable(btn, null, {
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
    target,
    drop: tgt => {
      ghost?.remove();
      ghost = null;
      setTimeout(() => btn.removeEventListener('click', swallow, { capture: true }), 0);
      if (tgt) drop(tgt);
    },
  });
}

function initPanelDockDrag(id) {
  initDockDrag(id, {
    target: (cx, cy) => panelTarget(id, cx, cy, panelEl(id).dataset.mode === 'pinned'),
    drop: tgt => {
      const el = panelEl(id);
      const mode = el.dataset.mode === 'pinned' ? 'pinned' : el.dataset.mode === 'float' ? 'float' : 'drawer';
      // Ein schwebendes Fenster bleibt schweben; nur Seite/Reihe ändern sich.
      setPanelMode(id, mode, { side: tgt.side, before: tgt.before, geom: mode === 'float' ? defaultGeom(id) : undefined });
    },
  });
}

// Liegt der Zeiger über einer Seitenleiste (plus `reach` daneben)?
// → { side, drawer, before, hint } für einen Platz in deren Dock.
function dockSlot(id, cx, cy, reach) {
  const w = wsRect();
  const L = railOf('left').getBoundingClientRect(), R = railOf('right').getBoundingClientRect();
  const side = cx < L.right + reach ? 'left' : cx > R.left - reach ? 'right' : null;
  if (!side) return null;
  const dock = railOf(side).querySelector('.rail-dock');
  const btns = [...dock.children].filter(b => b.dataset.target !== id && !b.hidden);
  const ip = insertionPoint(btns, cy, true);
  const d = dock.getBoundingClientRect();
  const y = ip.line ?? d.top + 8;
  return { side, drawer: true, before: ip.before?.dataset.target || null,
    hint: { x: d.left - w.left + 4, y: y - w.top - 2, w: d.width - 8, h: 4 } };
}

// ── Leisten (Werkzeuge, Farben) ─────────────────────────────────────
function placeBar(id, zone, before) {
  const el = $(id);
  moveInOrder(layout.barOrder, id, before);
  zoneOf(zone).append(el);
  // Alle Leisten der Zone in die gespeicherte Reihenfolge bringen.
  const z = zoneOf(zone);
  [...z.children].sort((a, b) => layout.barOrder.indexOf(a.id) - layout.barOrder.indexOf(b.id)).forEach(c => z.append(c));
}

function setBarMode(id, mode, opts = {}) {
  const el = $(id);
  const st = itemState(id);
  const btn = dockButtonFor(id);
  if (el.classList.contains('is-shown')) closeDrawer();
  el.classList.remove('is-floating', 'is-vertical', 'is-bar-drawer');
  clearFloatStyle(el);
  if (mode === 'float') {
    el.classList.add('is-floating');
    placeFloat(el, opts.geom || { x: st.x ?? 120, y: st.y ?? 60, w: st.w || 380, h: st.h || 0 });
    rememberFloat(id, el);
  } else if (mode === 'drawer') {
    // Als Icon im Dock: aufgeklappt wie ein Panel, senkrecht angeordnet.
    st.side = opts.side || st.side || 'right';
    if ('before' in opts) moveInOrder(layout.order, id, opts.before);
    railOf(st.side).append(el);
    if (btn) railOf(st.side).querySelector('.rail-dock').append(btn);
    el.classList.add('is-vertical', 'is-bar-drawer');
  } else {
    mode = 'docked';
    st.zone = opts.zone || st.zone || 'top';
    placeBar(id, st.zone, 'before' in opts ? opts.before : layout.barOrder[layout.barOrder.indexOf(id) + 1] ?? null);
    if (st.zone === 'left' || st.zone === 'right') el.classList.add('is-vertical');
  }
  // Das Dock-Icon gibt es nur, solange die Leiste im Dock wohnt.
  if (btn) btn.hidden = mode !== 'drawer';
  sortDock(layout.order);
  el.dataset.mode = mode;
  st.mode = mode;
  syncBarButton(el);
  save();
}

function syncBarButton(el) {
  const pin = el.querySelector('.bar-pin');
  const docked = el.dataset.mode !== 'float';
  pin.setAttribute('aria-pressed', String(docked));
  pin.title = t(docked ? 'lay.floatBar' : 'lay.dockBar');
  pin.setAttribute('aria-label', pin.title);
  el.querySelector('.bar-grip').title = t('lay.grip');
}

// Wohin fällt eine Leiste? → { zone, before, hint } oder null
function barTarget(id, cx, cy) {
  // Über einer Seitenleiste losgelassen → als Icon ins Dock.
  const slot = dockSlot(id, cx, cy, 4);
  if (slot) return slot;
  const w = wsRect();
  const body = $('stage-body').getBoundingClientRect();
  // Eine leere Zone ist unsichtbar und hat keine Größe — dann zählt die
  // Kante der Zeichenfläche.
  const edge = (name, fallback) => {
    const z = zoneOf(name);
    return z.offsetHeight ? z.getBoundingClientRect() : { top: fallback, bottom: fallback };
  };
  const top = edge('top', body.top);
  const bottom = edge('bottom', body.bottom);
  if (cx < body.left || cx > body.right) return null;
  let zone = null;
  if (cy >= top.top - 12 && cy <= top.bottom + ZONE_REACH) zone = 'top';
  else if (cy >= bottom.top - ZONE_REACH && cy <= bottom.bottom + 40) zone = 'bottom';
  else if (cy > body.top && cy < body.bottom && cx < body.left + ZONE_REACH + zoneOf('left').offsetWidth) zone = 'left';
  else if (cy > body.top && cy < body.bottom && cx > body.right - ZONE_REACH - zoneOf('right').offsetWidth) zone = 'right';
  if (!zone) return null;

  const z = zoneOf(zone);
  const vertical = zone === 'top' || zone === 'bottom';
  const others = [...z.children].filter(c => c.id !== id);
  const ip = insertionPoint(others, vertical ? cy : cx, vertical);
  // Leere Zonen sind unsichtbar (Größe 0) — dann markiert die Kante der
  // Zeichenfläche den Platz.
  const zr = z.offsetWidth || z.offsetHeight ? z.getBoundingClientRect() : null;
  let h;
  if (vertical) {
    const y = ip.line ?? (zone === 'top' ? (zr ? zr.bottom : body.top) : (zr ? zr.top : body.bottom - 4));
    h = { x: body.left - w.left, y: y - w.top - 2, w: body.width, h: 4 };
  } else {
    const x = ip.line ?? (zone === 'left' ? (zr ? zr.right : body.left + 4) : (zr ? zr.left : body.right - 4));
    h = { x: x - w.left - 2, y: body.top - w.top, w: 4, h: body.height };
  }
  return { zone, before: ip.before?.id || null, hint: h };
}

function initBar(id) {
  const el = $(id);
  el.dataset.mode = 'docked';
  const handle = document.createElement('div');
  handle.className = 'bar-handle';
  const grip = document.createElement('span');
  grip.className = 'bar-grip';
  grip.innerHTML = iconSvg('grip');
  const pin = headButton('bar-pin', 'pin');
  handle.append(grip, pin);
  el.prepend(handle);

  pin.addEventListener('click', () => {
    if (el.dataset.mode === 'float') { setBarMode(id, 'docked'); return; }
    const r = el.getBoundingClientRect(), w = wsRect();
    setBarMode(id, 'float', { geom: { x: r.left - w.left + 24, y: r.top - w.top + 24, w: Math.min(r.width, 420), cascade: true } });
  });
  el.addEventListener('pointerdown', () => { if (el.dataset.mode === 'float') bringToFront(el); });

  makeDraggable(grip, el, {
    lift: () => {
      if (el.dataset.mode === 'float') return;
      const r = el.getBoundingClientRect(), w = wsRect();
      setBarMode(id, 'float', { geom: { x: r.left - w.left, y: r.top - w.top, w: Math.min(r.width, 420) } });
    },
    target: (cx, cy) => barTarget(id, cx, cy),
    drop: tgt => {
      if (tgt?.drawer) { setBarMode(id, 'drawer', { side: tgt.side, before: tgt.before }); openDrawer(el); }
      else if (tgt) setBarMode(id, 'docked', { zone: tgt.zone, before: tgt.before });
      else { rememberFloat(id, el); save(); }
    },
  });

  // Dock-Icon (nur sichtbar im Modus drawer) — ziehbar wie die der Panels.
  const [icon, label] = BAR_DOCK[id];
  addDockItem(el, id, icon, label, 'right').hidden = true;
  el.addEventListener('panel-focus', () => { if (el.dataset.mode === 'float') bringToFront(el); });
  initDockDrag(id, {
    target: (cx, cy) => barTarget(id, cx, cy),
    drop: tgt => {
      if (tgt.drawer) setBarMode(id, 'drawer', { side: tgt.side, before: tgt.before });
      else setBarMode(id, 'docked', { zone: tgt.zone, before: tgt.before });
    },
  });
}

// ── Ziehen ──────────────────────────────────────────────────────────
// Erst ab ein paar Pixeln Bewegung wird gezogen — ein normaler Klick auf
// Knöpfe im Kopf bleibt ein Klick. `el` folgt dem Zeiger (oder `follow`).
function makeDraggable(handle, el, { lift, follow, target, drop }) {
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (el && e.target.closest('button, input, select, a')) return;
    const sx = e.clientX, sy = e.clientY;
    let dragging = false, offX = 0, offY = 0, tgt = null;

    const move = ev => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        dragging = true;
        lift();
        if (el) { const r = el.getBoundingClientRect(); offX = sx - r.left; offY = sy - r.top; }
        document.body.classList.add('is-dragging-ui');
      }
      ev.preventDefault();
      if (el) {
        const w = wsRect();
        el.style.left = (ev.clientX - w.left - offX) + 'px';
        el.style.top = (ev.clientY - w.top - offY) + 'px';
      }
      follow?.(ev.clientX, ev.clientY);
      tgt = target(ev.clientX, ev.clientY);
      showHint(tgt?.hint);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragging) return;
      document.body.classList.remove('is-dragging-ui');
      showHint(null);
      if (el) clampFloat(el);
      drop(tgt);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
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

function relabel() {
  document.querySelectorAll('[data-panel]').forEach(syncHeadButtons);
  BARS.forEach(id => syncBarButton($(id)));
  document.querySelectorAll('.pins-resizer').forEach(g => { g.title = t('lay.resize'); });
}

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

  layout.order = [...document.querySelectorAll('[data-panel]')].map(p => p.dataset.panel).concat(BARS);
  document.querySelectorAll('[data-panel]').forEach(initPanel);
  document.querySelectorAll('[data-panel]').forEach(p => initPanelDockDrag(p.dataset.panel));
  BARS.forEach(initBar);

  load();
  for (const id of layout.order.filter(id => panelEl(id))) {
    const st = layout.items[id] || {};
    setPanelMode(id, st.mode || 'drawer', { side: st.side || panelEl(id).dataset.side });
  }
  for (const id of [...layout.barOrder]) {
    const st = layout.items[id] || {};
    if (st.mode === 'float') setBarMode(id, 'float');
    else if (st.mode === 'drawer') setBarMode(id, 'drawer', { side: st.side });
    else setBarMode(id, 'docked', { zone: st.zone || 'top', before: null });
  }
  syncRail('left');
  syncRail('right');
  relabel();
  onLangChange(relabel);

  // Fenster gespeichert, wenn der Nutzer sie mit dem Eck-Griff vergrößert.
  const ro = new ResizeObserver(entries => {
    let changed = false;
    for (const { target } of entries) {
      if (!target.classList.contains('is-floating')) continue;
      rememberFloat(target.dataset.panel || target.id, target);
      changed = true;
    }
    if (changed) save();
  });
  document.querySelectorAll('[data-panel], #toolbar, #color-bar').forEach(el => ro.observe(el));
  window.addEventListener('resize', () => layer.querySelectorAll('.is-floating').forEach(clampFloat));
}
