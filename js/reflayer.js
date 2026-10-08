// ════════════════════════════════════════════════════════════════════
// SPRITE-EBENEN — Teile aus anderen Sprites zu einer Figur zusammensetzen
// ════════════════════════════════════════════════════════════════════
// Das Modell steht in state.js (layer.ref, layer.at, layerGrid). Hier liegt
// die Bedienung:
//
//   hinzufügen   Auswahlfeld „+ Sprite" in Timeline und Ebenen-Panel
//   verschieben  auf der Zeichenfläche ziehen oder Pfeiltasten (app.js)
//   drehen       90° im Uhrzeigersinn — Pixel-Art verträgt keine anderen
//   spiegeln     waagerecht, senkrecht
//   Frame        welcher Frame des Teils gezeigt wird
//   öffnen       zum Teil wechseln, um daran weiterzumalen
//
// Alles wirkt auf den aktuellen Frame — oder, sind mehrere markiert
// (Strg/Shift in der Timeline), auf alle markierten. So bewegt man z. B.
// einen Arm in fünf Frames auf einmal um einen Pixel.
import {
  state, sprites, getSprite, clearSelection, blankLike, defaultPlace,
  isRefLayer, refersTo,
} from './state.js';
import { renderAll, renderEditor, renderCallbacks } from './render.js';
import { recordOp, beginStroke, commitStroke } from './history.js';
import { commitFloat } from './selection.js';
import { saveState } from './storage.js';
import { stop as stopPlayback, selectedFrameIndices } from './frames.js';
import { selectSprite } from './sprites.js';
import { t } from './i18n.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);

/** Die aktive Ebene, wenn sie eine Sprite-Ebene ist — sonst null. */
export function activeRefLayer() {
  const sp = getSprite();
  const L = sp?.layers[sp.layer];
  return isRefLayer(L) ? L : null;
}

// Welche Sprites lassen sich in den aktuellen einsetzen? Alle außer ihm
// selbst und denen, die ihn ihrerseits (über Ecken) zeigen.
export function refCandidates() {
  const cur = state.curSprite;
  if (!cur) return [];
  return Object.keys(sprites).filter(id => !refersTo(id, cur));
}

// ── Hinzufügen ──────────────────────────────────────────────────────
// Das Teil kommt über die aktive Ebene und steht in jedem Frame mittig.
export function addSpriteLayer(id) {
  const sp = getSprite();
  const src = sprites[id];
  if (!sp || !src || !refCandidates().includes(id)) return;
  stopPlayback();
  commitFloat();
  clearSelection();
  const H = sp.grid.length, W = sp.grid[0].length;
  const sh = src.grid.length, sw = src.grid[0].length;
  const at = () => ({ ...defaultPlace(), x: Math.floor((W - sw) / 2), y: Math.floor((H - sh) / 2) });
  recordOp(() => {
    const i = sp.layer + 1;
    sp.layers.splice(i, 0, {
      name: src.name, visible: true, locked: false, opacity: 1,
      ref: id, at: sp.frames.map(at),
    });
    sp.frames.forEach(f => f.cels.splice(i, 0, blankLike(f.cels[0])));
    sp.layer = i;
  });
  renderAll();
  saveState();
}

// ── Ändern ──────────────────────────────────────────────────────────
// fn(platz, frame) für jeden betroffenen Frame der aktiven Sprite-Ebene.
function eachPlace(fn) {
  const sp = getSprite();
  const L = activeRefLayer();
  if (!sp || !L) return;
  for (const i of selectedFrameIndices()) if (L.at[i]) fn(L.at[i], i);
}

function change(fn) {
  if (!activeRefLayer()) return;
  stopPlayback();
  recordOp(() => eachPlace(fn));
  renderAll();
  saveState();
}

export const nudgeRef = (dx, dy) => change(p => { p.x += dx; p.y += dy; });

// Drehen um die Mitte des Teils: sonst wanderte ein längliches Teil bei
// jeder Vierteldrehung zur Seite.
export function rotateRef() {
  const L = activeRefLayer();
  const src = L && sprites[L.ref];
  if (!src) return;
  const h = src.grid.length, w = src.grid[0].length;
  change(p => {
    const [cw, ch] = p.rot % 2 ? [h, w] : [w, h];   // Maße vor der Drehung
    p.x += Math.floor((cw - ch) / 2);
    p.y += Math.floor((ch - cw) / 2);
    p.rot = (p.rot + 1) % 4;
  });
}

// Gespiegelt wird so, wie man es sieht: bei gedrehtem Teil vertauschen sich
// waagerecht und senkrecht.
export const flipRef = axis => change(p => {
  const sideways = p.rot % 2 === 1;
  if ((axis === 'x') !== sideways) p.fx = !p.fx; else p.fy = !p.fy;
});

export const setRefPos = (x, y) => change(p => {
  if (Number.isFinite(x)) p.x = x;
  if (Number.isFinite(y)) p.y = y;
});

// Nummer 1-basiert, wie sie im Feld steht.
export function setRefFrame(n) {
  const L = activeRefLayer();
  const src = L && sprites[L.ref];
  if (!src) return;
  const f = Math.max(0, Math.min(src.frames.length - 1, Math.round(n) - 1));
  change(p => { p.f = f; });
}

// Zum Teil wechseln — dort wird gemalt. Zurück geht es über die
// Sprite-Liste; die Figur zeigt die Änderung beim nächsten Hinsehen.
export function openRefSprite(L = activeRefLayer()) {
  if (!L || !sprites[L.ref]) return;
  stopPlayback();
  selectSprite(L.ref);
}

// ── Ziehen auf der Zeichenfläche ────────────────────────────────────
// app.js ruft das beim Druck auf die Fläche, wenn die aktive Ebene eine
// Sprite-Ebene ist. `cellOf` rechnet einen Zeiger in eine Pixel-Position
// um. Ein Undo-Schritt für den ganzen Zug.
export function startRefDrag(e, cellOf) {
  if (!activeRefLayer()) return;
  const start = cellOf(e);
  const orig = new Map();
  eachPlace((p, i) => orig.set(i, { x: p.x, y: p.y }));
  beginStroke();
  let last = { dx: 0, dy: 0 };
  const move = ev => {
    const c = cellOf(ev);
    const dx = c.x - start.x, dy = c.y - start.y;
    if (dx === last.dx && dy === last.dy) return;
    last = { dx, dy };
    eachPlace((p, i) => { const o = orig.get(i); if (o) { p.x = o.x + dx; p.y = o.y + dy; } });
    renderEditor();
    syncRefPanel();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    commitStroke();
    renderAll();
    saveState();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// ── Bedienfelder ────────────────────────────────────────────────────
// Die Auswahlfelder „+ Sprite" (Timeline und Ebenen-Panel) zeigen jeweils
// die Sprites, die gerade passen.
function fillPicker(sel) {
  if (!sel || document.activeElement === sel) return;
  const ids = refCandidates();
  sel.innerHTML = '';
  const head = document.createElement('option');
  head.value = '';
  head.textContent = t(ids.length ? 'ref.add' : 'ref.none');
  sel.append(head);
  for (const id of ids) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = sprites[id].name;
    sel.append(o);
  }
  sel.value = '';
  sel.disabled = !ids.length;
}

// Das Feld im Ebenen-Panel: nur sichtbar, wenn die aktive Ebene eine
// Sprite-Ebene ist. Zeigt die Werte des aktuellen Frames.
export function syncRefPanel() {
  for (const id of ['tl-addref', 'ly-addref']) fillPicker($(id));
  const box = $('ref-props');
  if (!box) return;
  const sp = getSprite();
  const L = activeRefLayer();
  box.hidden = !L;
  if (!sp || !L) return;
  const src = sprites[L.ref];
  const p = L.at[sp.frame] || defaultPlace();
  $('ref-name').textContent = src ? src.name : t('ref.missing');
  $('ref-open').disabled = !src;
  const set = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
  set('ref-x', p.x);
  set('ref-y', p.y);
  set('ref-f', Math.min(p.f, (src?.frames.length || 1) - 1) + 1);
  $('ref-f').max = src?.frames.length || 1;
  $('ref-fn').textContent = '/ ' + (src?.frames.length || 1);
  $('ref-f').disabled = !src || src.frames.length < 2;
  const rot = $('ref-rot');
  rot.classList.toggle('is-active', p.rot !== 0);
  rot.title = t('ref.rotTitle', { deg: p.rot * 90 });
  $('ref-fx').classList.toggle('is-active', p.rot % 2 ? p.fy : p.fx);
  $('ref-fy').classList.toggle('is-active', p.rot % 2 ? p.fx : p.fy);
}

export function initRefLayers() {
  for (const id of ['tl-addref', 'ly-addref']) {
    const sel = $(id);
    if (!sel) continue;
    sel.addEventListener('change', () => {
      const v = sel.value;
      sel.blur();
      if (v) addSpriteLayer(v);
      syncRefPanel();
    });
    // Liste beim Aufklappen frisch füllen — Sprites kommen und gehen.
    sel.addEventListener('pointerdown', () => { if (document.activeElement !== sel) fillPicker(sel); });
  }
  const num = id => Number($(id).value);
  $('ref-x').addEventListener('change', () => setRefPos(num('ref-x'), NaN));
  $('ref-y').addEventListener('change', () => setRefPos(NaN, num('ref-y')));
  $('ref-f').addEventListener('change', () => setRefFrame(num('ref-f')));
  for (const id of ['ref-x', 'ref-y', 'ref-f']) {
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  }
  $('ref-rot').addEventListener('click', rotateRef);
  $('ref-fx').addEventListener('click', () => flipRef('x'));
  $('ref-fy').addEventListener('click', () => flipRef('y'));
  $('ref-open').addEventListener('click', () => openRefSprite());

  const prev = renderCallbacks.onRenderLayers;
  renderCallbacks.onRenderLayers = () => { prev(); syncRefPanel(); };
}
