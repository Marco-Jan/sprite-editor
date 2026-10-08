// ════════════════════════════════════════════════════════════════════
// LAYERS — Ebenen: anlegen, ordnen, ein-/ausblenden, sperren, Deckkraft
// ════════════════════════════════════════════════════════════════════
// Jede Ebene hat in jedem Frame ihr eigenes Bild (state.js: frames[].cels).
// Gemalt wird immer in die aktive Ebene — über sp.grid, die Werkzeuge
// wissen davon nichts. Angezeigt und exportiert wird, was man sieht: alle
// sichtbaren Ebenen übereinander (flatGrid).
//
// Die Liste im Panel zeigt die oberste Ebene oben. Alle Änderungen laufen
// durch recordOp() und sind Undo-Schritte; nur das Wählen der aktiven Ebene
// ist keine Änderung.
import { getSprite, getPaletteByName, clearSelection, defaultLayer, blankLike } from './state.js';
import { dc, cellToColor } from './data.js';
import { renderAll, renderEditor, renderCallbacks } from './render.js';
import { recordOp, beginStroke, commitStroke } from './history.js';
import { commitFloat } from './selection.js';
import { saveState } from './storage.js';
import { stop as stopPlayback } from './frames.js';
import { showInfoToast } from './toast.js';
import { iconSvg } from './icons.js';
import { t } from './i18n.js';

/** @type {(id: string) => any} */
const $ = id => document.getElementById(id);
const THUMB = 28;

function leave() {
  stopPlayback();
  commitFloat();
  clearSelection();
}

// Struktur ändern (neu, löschen, zusammenführen, verschieben).
function edit(fn) {
  const sp = getSprite();
  if (!sp) return;
  leave();
  recordOp(() => fn(sp));
  renderAll();
  saveState();
}

// Nur Eigenschaften (sichtbar, gesperrt, Name) — die Auswahl bleibt.
function meta(fn) {
  const sp = getSprite();
  if (!sp) return;
  recordOp(() => fn(sp));
  renderAll();
  saveState();
}

// Freier Name "Ebene N".
function freshName(sp) {
  const taken = new Set(sp.layers.map(l => l.name));
  let n = sp.layers.length + 1;
  while (taken.has(t('ly.name', { n }))) n++;
  return n;
}

export function setActiveLayer(i) {
  const sp = getSprite();
  if (!sp || i === sp.layer || i < 0 || i >= sp.layers.length) return;
  leave();
  sp.layer = i;
  renderAll();
  saveState();
}

export function addLayer() {
  edit(sp => {
    const at = sp.layer + 1;
    sp.layers.splice(at, 0, defaultLayer(freshName(sp)));
    sp.frames.forEach(f => f.cels.splice(at, 0, blankLike(f.cels[0])));
    sp.layer = at;
  });
}

export function duplicateLayer() {
  edit(sp => {
    const at = sp.layer + 1;
    const src = sp.layers[sp.layer];
    sp.layers.splice(at, 0, { ...src, name: t('ly.copyName', { name: src.name }) });
    // Verknüpfte Zellen der Vorlage sind in der Kopie wieder verknüpft.
    const memo = new Map();
    sp.frames.forEach(f => {
      const g = f.cels[sp.layer];
      if (!memo.has(g)) memo.set(g, dc(g));
      f.cels.splice(at, 0, memo.get(g));
    });
    sp.layer = at;
  });
}

export function deleteLayer() {
  const sp = getSprite();
  if (!sp) return;
  if (sp.layers.length < 2) { showInfoToast(t('ly.lastLayer')); return; }
  edit(s => {
    s.layers.splice(s.layer, 1);
    s.frames.forEach(f => f.cels.splice(s.layer, 1));
    s.layer = Math.min(s.layer, s.layers.length - 1);
  });
}

// Aktive Ebene in die darunter einrechnen — in jedem Frame. Mit voller
// Deckkraft überschreibt sie einfach; halbdurchsichtig wird über einer
// Farbe gemischt (freie Farbe), über leerem Grund bleibt sie deckend.
export function mergeDown() {
  const sp = getSprite();
  if (!sp) return;
  if (sp.layer === 0) { showInfoToast(t('ly.nothingBelow')); return; }
  edit(s => {
    const top = s.layer, below = top - 1;
    const a = s.layers[top].opacity;
    const pal = getPaletteByName(s.palette);
    // Verknüpfte Zellen: dasselbe Paar (oben, unten) ergibt dasselbe neue,
    // wieder geteilte Bild. Ein geteiltes Bild unten, über dem in jedem
    // Frame etwas anderes liegt, wird dagegen je Frame eigenständig.
    const done = new Map();
    for (const f of s.frames) {
      const src = f.cels[top];
      const pair = done.get(src) || new Map();
      done.set(src, pair);
      if (pair.has(f.cels[below])) { f.cels[below] = pair.get(f.cels[below]); f.cels.splice(top, 1); continue; }
      const dst = dc(f.cels[below]);
      pair.set(f.cels[below], dst);
      f.cels[below] = dst;
      for (let y = 0; y < dst.length; y++) for (let x = 0; x < dst[y].length; x++) {
        const v = src[y][x];
        if (v === 0) continue;
        if (a >= 1 || dst[y][x] === 0) { dst[y][x] = a >= 1 ? v : (cellToColor(v, pal) || '#000000').toLowerCase(); continue; }
        const tc = cellToColor(v, pal), bc = cellToColor(dst[y][x], pal);
        if (!tc || !bc) { dst[y][x] = v; continue; }
        const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
        const mix = i => Math.round(ch(bc, i) * (1 - a) + ch(tc, i) * a).toString(16).padStart(2, '0');
        dst[y][x] = '#' + mix(0) + mix(1) + mix(2);
      }
      f.cels.splice(top, 1);
    }
    s.layers.splice(top, 1);
    s.layer = below;
  });
}

export function moveLayer(from, to) {
  const sp = getSprite();
  if (!sp || from === to || to < 0 || to >= sp.layers.length) return;
  edit(s => {
    const [l] = s.layers.splice(from, 1);
    s.layers.splice(to, 0, l);
    s.frames.forEach(f => { const [c] = f.cels.splice(from, 1); f.cels.splice(to, 0, c); });
    s.layer = to;
  });
}

export function toggleVisible(i) { meta(sp => { sp.layers[i].visible = !sp.layers[i].visible; }); }
export function toggleLocked(i) { meta(sp => { sp.layers[i].locked = !sp.layers[i].locked; }); }
// Durchgehend: neue Frames verknüpfen hier mit dem vorigen (state.js newFrameCels).
export function toggleContinuous(i) { meta(sp => { sp.layers[i].continuous = !sp.layers[i].continuous; }); }

export function renameLayer(i, name) {
  const n = String(name || '').trim();
  const sp = getSprite();
  if (!sp || !n || n === sp.layers[i]?.name) { renderLayers(); return; }
  meta(s => { s.layers[i].name = n; });
}

// ────────────────────────────────────────────────────────────────────
// Panel
// ────────────────────────────────────────────────────────────────────
function drawThumb(cv, grid, pal) {
  const H = grid.length, W = grid[0].length;
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
    const k = THUMB / Math.max(W, H);
    cv.style.width = Math.max(1, Math.round(W * k)) + 'px';
    cv.style.height = Math.max(1, Math.round(H * k)) + 'px';
  }
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fill = cellToColor(grid[y][x], pal);
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, 1, 1); }
  }
}

function makeRow() {
  const row = document.createElement('div');
  row.className = 'ly-row';
  row.setAttribute('role', 'option');
  row.innerHTML = '<button type="button" class="icon-btn ly-eye"></button>'
    + '<button type="button" class="icon-btn ly-lock"></button>'
    + '<span class="ly-thumb"><canvas></canvas></span>'
    + '<span class="ly-name"></span>'
    + '<span class="ly-op"></span>';
  row.querySelector('.ly-eye').addEventListener('click', e => { e.stopPropagation(); toggleVisible(Number(row.dataset.i)); });
  row.querySelector('.ly-lock').addEventListener('click', e => { e.stopPropagation(); toggleLocked(Number(row.dataset.i)); });
  row.querySelector('.ly-name').addEventListener('dblclick', e => { e.stopPropagation(); startRename(row); });
  initRowDrag(row);
  return row;
}

function startRename(row) {
  const i = Number(row.dataset.i);
  const span = row.querySelector('.ly-name');
  const inp = document.createElement('input');
  inp.className = 'input input--sm ly-rename';
  inp.value = getSprite().layers[i].name;
  span.replaceWith(inp);
  inp.focus();
  inp.select();
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    if (ok) renameLayer(i, inp.value); else renderLayers();
  };
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  inp.addEventListener('blur', () => finish(true));
}

export function renderLayers() {
  const list = $('layer-list');
  const sp = getSprite();
  if (!list) return;
  if (!sp) { list.innerHTML = ''; return; }
  const n = sp.layers.length;
  // Eine offene Umbenennung nicht mitten im Tippen wegwerfen.
  if (list.querySelector('.ly-rename')) return;
  list.innerHTML = '';
  const pal = getPaletteByName(sp.palette);
  // Oberste Ebene oben.
  for (let i = n - 1; i >= 0; i--) {
    const L = sp.layers[i];
    const row = makeRow();
    row.dataset.i = String(i);
    row.classList.toggle('is-active', i === sp.layer);
    row.classList.toggle('is-hidden', !L.visible);
    row.setAttribute('aria-selected', String(i === sp.layer));
    const eye = row.querySelector('.ly-eye'), lock = row.querySelector('.ly-lock');
    eye.innerHTML = iconSvg(L.visible ? 'eye' : 'eyeOff');
    eye.title = t(L.visible ? 'ly.hide' : 'ly.show');
    eye.setAttribute('aria-pressed', String(L.visible));
    lock.innerHTML = iconSvg(L.locked ? 'lock' : 'unlock');
    lock.title = t(L.locked ? 'ly.unlock' : 'ly.lock');
    lock.setAttribute('aria-pressed', String(L.locked));
    lock.classList.toggle('is-on', L.locked);
    row.querySelector('.ly-name').textContent = L.name;
    row.querySelector('.ly-op').textContent = L.opacity < 1 ? Math.round(L.opacity * 100) + '%' : '';
    row.title = t('ly.rowTitle', { name: L.name });
    drawThumb(row.querySelector('canvas'), sp.frames[sp.frame].cels[i], pal);
    list.append(row);
  }

  const L = sp.layers[sp.layer];
  const op = $('ly-opacity');
  if (document.activeElement !== op) op.value = Math.round(L.opacity * 100);
  $('ly-opacity-val').textContent = Math.round(L.opacity * 100) + '%';
  $('ly-del').disabled = n < 2;
  $('ly-merge').disabled = sp.layer === 0;
}

// Beim Zeichnen nur das Vorschaubild der aktiven Ebene auffrischen.
function refreshActiveThumb() {
  const sp = getSprite();
  const row = sp && $('layer-list')?.querySelector(`.ly-row[data-i="${sp.layer}"] canvas`);
  if (row) drawThumb(row, sp.grid, getPaletteByName(sp.palette));
}

// Ziehen sortiert um, ein Klick wählt die Ebene. Die Liste steht auf dem
// Kopf (oben = oberste Ebene), darum wird die Zielposition umgerechnet.
function initRowDrag(row) {
  row.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, input')) return;
    const list = $('layer-list');
    const from = Number(row.dataset.i);
    const sy = e.clientY;
    let dragging = false, slot = null;

    const move = ev => {
      const d = ev.clientY - sy;
      if (!dragging) {
        if (Math.abs(d) < 6) return;
        dragging = true;
        row.classList.add('is-dragging');
        try { row.setPointerCapture(ev.pointerId); } catch {}
      }
      ev.preventDefault();
      row.style.transform = `translateY(${d}px)`;
      // Position in der Anzeige (0 = oben) → Ebenen-Index (0 = unten).
      const rows = [...list.children].filter(r => r !== row);
      let pos = 0;
      rows.forEach((r, k) => {
        const b = r.getBoundingClientRect();
        if (ev.clientY > b.top + b.height / 2) pos = k + 1;
      });
      slot = rows.length - pos;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!dragging) { setActiveLayer(from); return; }
      row.classList.remove('is-dragging');
      row.style.transform = '';
      if (slot != null) moveLayer(from, slot);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

export function initLayers() {
  $('ly-add').addEventListener('click', addLayer);
  $('ly-dup').addEventListener('click', duplicateLayer);
  $('ly-del').addEventListener('click', deleteLayer);
  $('ly-merge').addEventListener('click', mergeDown);

  // Deckkraft: live zeigen, als EIN Undo-Schritt festhalten.
  const op = $('ly-opacity');
  let dragging = false;
  const begin = () => { if (!dragging) { dragging = true; beginStroke(); } };
  op.addEventListener('pointerdown', begin);
  op.addEventListener('keydown', begin);
  op.addEventListener('input', () => {
    const sp = getSprite();
    if (!sp) return;
    begin();
    sp.layers[sp.layer].opacity = Number(op.value) / 100;
    $('ly-opacity-val').textContent = op.value + '%';
    renderEditor();
  });
  op.addEventListener('change', () => {
    dragging = false;
    commitStroke();
    renderAll();
    saveState();
  });

  renderCallbacks.onRenderLayers = renderLayers;
  const prev = renderCallbacks.onEditorRendered;
  renderCallbacks.onEditorRendered = () => { prev(); refreshActiveThumb(); };
}
