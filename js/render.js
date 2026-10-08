// ════════════════════════════════════════════════════════════════════
// RENDER — alle DOM-/Canvas-Render-Funktionen
// ════════════════════════════════════════════════════════════════════
// Liest aus state, schreibt ins DOM. Event-Bindings für statische Elemente
// leben in app.js; nur Handler an dynamisch erzeugten Elementen (Sprite-Karten,
// Farb-Swatches) werden hier gesetzt und rufen dann renderCallbacks auf.
import {
  state, sprites, customPalettes, paletteMaterials, selection,
  getGrid, getSprite, getPal, getPaletteName, getMaxIdx, getPreviewName,
  getAllPaletteOptions, isCustomPalette, listSprites, getPaletteByName, allGrids, flatGrid, thumbGrid,
} from './state.js';
import { PALETTE_GROUP_SPLIT, MAX_COLORS, cellToColor, paletteSize } from './data.js';
import { onionFrames } from './onion.js';
import { renderScale, paintGrid, paintCanvas, gridToCanvas, paintMask, paintChecker, thumbCanvas, rgbOf, BIG_PIXELS } from './raster.js';
import { t, tn, colorLabel, colorLabelShort } from './i18n.js';
import { buildCode, tsIdentifier, getFormat } from './codegen.js';
import { MATERIALS, DEFAULT_MATERIAL, GameJsonError } from './gamejson.js';
import { iconSvg } from './icons.js';
import { showInfoToast } from './toast.js';
import { createPalettePicker } from './palpicker.js';

// Weiterreichen, damit bestehende Importe aus render.js gültig bleiben.
export { cellToColor, tsIdentifier };

// Callbacks, die app.js verdrahtet — vermeidet Zirkularimporte zwischen
// render und den Feature-Modulen (sprites/palettes/storage).
export const renderCallbacks = {
  onSave:            () => {},
  onSelectSprite:    (_id) => {},
  onRenameSprite:    (_id) => {},
  onResizeSprite:    (_id) => {},
  onDeleteSprite:    (_id) => {},
  onDuplicateSprite: (_id) => {},
  onOpenPaletteModal:() => {},
  onEditPalette:     (_name) => {},
  onDeletePalette:   (_name) => {},
  onImageToPalette:  () => {},
  onPreviewPalette:  (_name) => {},
  // Felder im Bild-Panel an die Maße des aktiven Sprites angleichen.
  onSyncImagePanel:  () => {},
  // Timeline (frames.js): ganz neu zeichnen bzw. nur den aktuellen Frame.
  onRenderTimeline:  () => {},
  // Wie viele Frames gerade markiert sind — der Export beschriftet sich danach.
  onFrameSelection:  (_n) => {},
  onRenderLayers:    () => {},
  // Hilfslinien (guides.js) — zeichnet über Gitter und Auswahl.
  onDrawOverlay:     (_ctx, _W, _H, _cs) => {},
  onGuideInfo:       (_msg) => {},
  onRenderGuides:    () => {},
  onEditorRendered:  () => {},
};

// HTML-Escaping für Nutzer-Eingaben (Sprite-/Palettennamen landen im innerHTML).
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ────────────────────────────────────────────────────────────────────
// SPRITE-LISTE (linke Spalte)
// ────────────────────────────────────────────────────────────────────
export function renderSpriteList() {
  const list = document.getElementById('sprite-list');
  if (!list) return;
  list.innerHTML = '';

  const q = (/** @type {HTMLInputElement} */ (document.getElementById('sprite-search'))?.value || '').trim().toLowerCase();
  const all = listSprites();
  const shown = q ? all.filter(s => s.name.toLowerCase().includes(q)) : all;

  const countEl = document.getElementById('sprite-count');
  if (countEl) countEl.textContent = all.length ? String(all.length) : '';

  // Suchfeld erst einblenden, wenn die Liste lang genug ist, um Suchen zu
  // rechtfertigen — sonst ist es nur Rauschen. Bei aktivem Filter bleibt es da.
  const searchEl = /** @type {HTMLInputElement} */ (document.getElementById('sprite-search'));
  if (searchEl) searchEl.hidden = all.length < 6 && !q;

  if (!all.length) {
    list.innerHTML = `<p class="empty-note">${esc(t('list.empty'))}</p>`;
    return;
  }
  if (!shown.length) {
    list.innerHTML = `<p class="empty-note">${esc(t('list.noMatch', { q }))}</p>`;
    return;
  }

  shown.forEach(sp => {
    const card = document.createElement('div');
    card.className = 'sprite-card' + (sp.id === state.curSprite ? ' is-active' : '');
    card.tabIndex = 0;
    card.title = t('list.cardTitle', { name: sp.name, w: sp.grid[0].length, h: sp.grid.length, palette: sp.palette });

    const thumb = document.createElement('div');
    thumb.className = 'sprite-thumb';
    thumb.append(thumbCanvas(thumbGrid(sp, sp.frame, 80), getPaletteFor(sp), 40));

    const meta = document.createElement('div');
    meta.className = 'sprite-meta';
    meta.innerHTML =
      `<span class="sprite-name">${esc(sp.name)}</span>` +
      `<span class="sprite-sub">${sp.grid[0].length}×${sp.grid.length}`
      + (sp.frames.length > 1 ? ` · ${tn('list.frames', sp.frames.length)}` : '')
      + ` · ${esc(sp.palette)}</span>`;

    const acts = document.createElement('div');
    acts.className = 'sprite-acts';
    acts.appendChild(iconBtn('pencil', t('list.rename'), e => { e.stopPropagation(); renderCallbacks.onRenameSprite(sp.id); }));
    acts.appendChild(iconBtn('expand', t('list.resize'), e => { e.stopPropagation(); renderCallbacks.onResizeSprite(sp.id); }));
    acts.appendChild(iconBtn('copy', t('list.duplicate'), e => { e.stopPropagation(); renderCallbacks.onDuplicateSprite(sp.id); }));
    acts.appendChild(iconBtn('close', t('list.delete'), e => { e.stopPropagation(); renderCallbacks.onDeleteSprite(sp.id); }, 'is-danger'));

    card.append(thumb, meta, acts);
    card.addEventListener('click', () => renderCallbacks.onSelectSprite(sp.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderCallbacks.onSelectSprite(sp.id); }
    });
    list.appendChild(card);
  });
}

function iconBtn(icon, title, onClick, extraClass = '') {
  const b = document.createElement('button');
  b.className = 'icon-btn ' + extraClass;
  b.type = 'button';
  b.innerHTML = iconSvg(icon);
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}

// Palette eines beliebigen Sprite-Datensatzes (nicht nur des aktiven).
function getPaletteFor(sp) {
  return getPaletteByName(sp.palette);
}

// ────────────────────────────────────────────────────────────────────
// EDITOR-CANVAS
// ────────────────────────────────────────────────────────────────────
// Zwischenspeicher für Ebenen bei großen Sprites: Bild-Objekt → fertiges
// Canvas. Gemalt wird immer nur in die aktive Ebene (über sp.grid); die
// anderen ändern sich nur durch Aktionen, die danach renderAll() rufen —
// das leert den Speicher. Die aktive Ebene wird nie zwischengespeichert.
const layerCache = new Map();
const LAYER_CACHE_MAX = 24;
function cachedLayer(g, pal) {
  let cv = layerCache.get(g);
  if (!cv) {
    if (layerCache.size >= LAYER_CACHE_MAX) layerCache.clear();
    cv = gridToCanvas(document.createElement('canvas'), g, pal);
    layerCache.set(g, cv);
  }
  return cv;
}

// Was nach jedem Zeichnen der Fläche mitläuft (Bildchen in Timeline,
// Ebenen-Panel, Vorschau). Bei großen Sprites erst nach einer kurzen Pause —
// sonst rechnet jede Bewegung eines Strichs drei weitere Millionen Pixel.
let lateTimer = null;
function afterEditorRendered(big) {
  clearTimeout(lateTimer);
  if (!big) { renderCallbacks.onEditorRendered(); return; }
  lateTimer = setTimeout(() => renderCallbacks.onEditorRendered(), 150);
}

export function renderEditor() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('editor-canvas'));
  if (!canvas) return;
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const cs = state.cellSize;
  // Gezeichnet wird mit r Canvas-Pixeln je Sprite-Pixel, angezeigt mit cs
  // (CSS). Bei kleinen Sprites ist r = cs; bei großen deckelt raster.js die
  // Auflösung, sonst lehnt der Browser die Fläche ab. Alles, was unten mit
  // Koordinaten zeichnet, rechnet darum mit r.
  const r = renderScale(W, H, cs);
  // Nur bei neuer Größe neu anlegen — das Zuweisen allein kostet schon.
  if (canvas.width !== W * r || canvas.height !== H * r) {
    canvas.width = W * r;
    canvas.height = H * r;
  }
  canvas.style.width = W * cs + 'px';
  canvas.style.height = H * cs + 'px';
  const ctx = canvas.getContext('2d');
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const pal = getPal();

  // Schachbrett-Hintergrund (zeigt Transparenz an)
  const [bg1, bg2] = state.editorBg === 'bw' ? ['#ffffff', '#d8d8d8'] : ['#20202c', '#2a2a38'];
  paintChecker(ctx, W, H, r, bg1, bg2);

  // Onion Skin: Nachbar-Frames unter dem aktuellen — oder darüber (s. u.)
  if (!state.tlOpts.onion.front) drawOnion(ctx, W, H, r);

  // Pixel — alle sichtbaren Ebenen von unten nach oben, je mit ihrer Deckkraft
  const sp = getSprite();
  const big = W * H > BIG_PIXELS;
  if (sp) {
    sp.layers.forEach((L, li) => {
      if (!L.visible || L.opacity <= 0) return;
      const g = sp.frames[sp.frame].cels[li];
      if (big && li !== sp.layer) paintCanvas(ctx, cachedLayer(g, pal), r, L.opacity);
      else paintGrid(ctx, g, pal, 0, 0, r, { alpha: L.opacity, key: 'layer' });
    });
  }

  if (state.tlOpts.onion.front) drawOnion(ctx, W, H, r);

  // Formen-Vorschau (Linie, Rechteck, Ellipse) waehrend des Ziehens
  if (state.shape.cells.length) {
    const fill = cellToColor(state.shape.color, pal);
    // Transparent als Vorschau: helle Schraffur statt "unsichtbar".
    const col = fill ? [...rgbOf(fill), 255] : [242, 139, 130, 90];
    const cells = state.shape.cells;
    if (cells.length > 2000) {
      // Große Formen (gefülltes Rechteck über 1024 px) als ein Bild.
      const on = new Set(cells.map(([x, y]) => y * W + x));
      paintMask(ctx, W, H, r, (x, y) => on.has(y * W + x), col);
    } else {
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${col[3] / 255})`;
      for (const [sx, sy] of cells) {
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) ctx.fillRect(sx * r, sy * r, r, r);
      }
    }
  }

  // Schwebender Auswahl-Block — liegt über dem Grid, weil er beim Ziehen
  // gerade nicht im Grid steht (dort ist die Quelle schon leer). Was über
  // den Rand ragt, schneidet der Canvas ab (es wird beim Absetzen verworfen).
  if (selection.float && selection.rect) {
    paintGrid(ctx, selection.float, pal, selection.rect.x, selection.rect.y, r, { key: 'float' });
  }

  if (state.showColor) drawColorSpotlight(ctx, grid, pal, W, H, r);

  // Grid-Linien liegen als CSS-Ebene über dem Canvas (#editor-gridlines):
  // so bleiben sie 1 px dünn, auch wenn der Canvas gröber gezeichnet ist.
  // Bei sehr kleinen Zellen weg, sonst wird alles Raster.
  const lines = document.getElementById('editor-gridlines');
  if (lines) {
    lines.hidden = cs < 6;
    lines.style.width = W * cs + 'px';
    lines.style.height = H * cs + 'px';
    lines.style.setProperty('--cell', cs + 'px');
    lines.classList.toggle('is-light', state.editorBg === 'bw');
  }

  if (selection.rect) drawSelectionFrame(ctx, selection.rect, selection.mask, r);
  if (selection.path) drawLassoPath(ctx, selection.path, r);
  if (state.mirror !== 'off') drawMirrorGuides(ctx, W, H, r);
  renderCallbacks.onDrawOverlay(ctx, W, H, r);

  updateStageTitle();
  afterEditorRendered(big);
}

// Onion Skin: Nachbar-Frames scheinen durch — davor rot, danach blau
// getönt (nur die Form, damit man sie vom aktuellen Frame unterscheidet)
// oder in ihren echten Farben. Wie viele, wie stark, ob nur die aktive
// Ebene und ob vor oder hinter dem Bild, steht im Timeline-Menü
// (js/onion.js). Beim Abspielen aus, sonst flackert es.
function drawOnion(ctx, W, H, cs) {
  const sp = getSprite();
  if (!state.onion || state.playing || !sp || sp.frames.length < 2) return;
  const o = state.tlOpts.onion;
  const pal = getPal();
  for (const { frame, side, alpha } of onionFrames(sp, sp.frame, state.tlOpts).reverse()) {
    const g = o.layerOnly ? sp.frames[frame].cels[sp.layer] : flatGrid(sp, frame);
    if (!g) continue;
    const tint = o.mode === 'color' ? null : side === 'before' ? [255, 96, 96] : [96, 156, 255];
    paintGrid(ctx, g, pal, 0, 0, cs, { alpha, tint, key: 'onion' });
  }
}

// "Farbe zeigen": alles, was NICHT die aktuelle Farbe hat, wird abgedunkelt.
// Verglichen wird die tatsächliche Farbe, nicht der Index — eine freie Farbe
// mit demselben Hex zählt also mit. Bei Transparent (0) leuchten die leeren
// Stellen.
export function currentColorHex() {
  const c = state.curColor;
  if (c === 0) return null;
  if (typeof c === 'string') return c.toLowerCase();
  return (getPal()[c] || '').toLowerCase() || null;
}

export function countCurrentColor() {
  const grid = getGrid(), pal = getPal(), want = currentColorHex();
  let n = 0;
  for (const row of grid) for (const c of row) {
    const hex = cellToColor(c, pal);
    if ((hex ? hex.toLowerCase() : null) === want) n++;
  }
  return n;
}

function drawColorSpotlight(ctx, grid, pal, W, H, cs) {
  const want = currentColorHex();
  const col = state.editorBg === 'bw' ? [255, 255, 255, 209] : [8, 8, 12, 204];
  paintMask(ctx, W, H, cs, (x, y) => {
    const hex = cellToColor(grid[y][x], pal);
    return (hex ? hex.toLowerCase() : null) !== want;
  }, col);
}

// Auswahlrahmen — laeuft an den Kanten der Maske entlang, nicht stumpf um die
// Bounding-Box: bei einer Lasso-Form sieht man dadurch die echte Kontur.
// Schwarze Volllinie mit weisser Strichlinie darueber, damit der Rahmen auf
// hellem wie dunklem Untergrund sichtbar bleibt ("laufende Ameisen").
function drawSelectionFrame(ctx, r, mask, cs) {
  const inside = (x, y) => {
    const mx = x - r.x, my = y - r.y;
    if (mx < 0 || my < 0 || mx >= r.w || my >= r.h) return false;
    return !mask || !!mask[my][mx];
  };

  ctx.save();
  ctx.beginPath();
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!inside(x, y)) continue;
      const px = x * cs + 0.5, py = y * cs + 0.5, s = cs;
      if (!inside(x, y - 1)) { ctx.moveTo(px, py);         ctx.lineTo(px + s, py); }
      if (!inside(x, y + 1)) { ctx.moveTo(px, py + s);     ctx.lineTo(px + s, py + s); }
      if (!inside(x - 1, y)) { ctx.moveTo(px, py);         ctx.lineTo(px, py + s); }
      if (!inside(x + 1, y)) { ctx.moveTo(px + s, py);     ctx.lineTo(px + s, py + s); }
    }
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();
  ctx.restore();
}

// Die Lasso-Spur waehrend des Ziehens — durch die Zellmitten.
function drawLassoPath(ctx, path, cs) {
  if (path.length < 2) return;
  ctx.save();
  ctx.beginPath();
  path.forEach((p, i) => {
    const x = p.x * cs + cs / 2, y = p.y * cs + cs / 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = '#6ea8fe';
  ctx.stroke();
  ctx.restore();
}

// Spiegelachsen sichtbar machen, solange der Symmetrie-Modus laeuft.
function drawMirrorGuides(ctx, W, H, cs) {
  ctx.save();
  ctx.setLineDash([2, 3]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(110,168,254,0.55)';
  ctx.beginPath();
  if (state.mirror === 'x' || state.mirror === 'both') {
    const x = (W / 2) * cs;
    ctx.moveTo(x, 0); ctx.lineTo(x, H * cs);
  }
  if (state.mirror === 'y' || state.mirror === 'both') {
    const y = (H / 2) * cs;
    ctx.moveTo(0, y); ctx.lineTo(W * cs, y);
  }
  ctx.stroke();
  ctx.restore();
}

// Sprite-Name + Maße über dem Canvas.
export function updateStageTitle() {
  const sp = getSprite();
  const nameEl = document.getElementById('stage-title');
  const dimEl  = document.getElementById('stage-dims');
  if (nameEl) nameEl.textContent = sp ? sp.name : t('list.noSprite');
  if (dimEl) {
    dimEl.textContent = sp
      ? `${sp.grid[0].length}×${sp.grid.length}`
        + (sp.frames.length > 1 ? ` · ${t('tl.frameOf', { i: sp.frame + 1, n: sp.frames.length })}` : '')
        + ` · ${sp.palette}`
      : '';
  }
  const docTitle = document.getElementById('doc-title');
  if (docTitle) docTitle.textContent = sp ? sp.name : '';
}

// Maus-/Touch-Event → Grid-Zelle (oder null wenn außerhalb)
export function cellFromEvent(e) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('editor-canvas'));
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / state.cellSize);
  const y = Math.floor((e.clientY - r.top) / state.cellSize);
  const g = getGrid();
  if (x < 0 || y < 0 || x >= g[0].length || y >= g.length) return null;
  return { x, y };
}

// Wie cellFromEvent, aber ohne null: Werte außerhalb werden auf den Rand
// gezogen. Für Aktionen, die über den Rand hinaus ziehen dürfen (Auswahl).
export function cellFromEventClamped(e) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('editor-canvas'));
  const r = canvas.getBoundingClientRect();
  const g = getGrid();
  const W = g[0].length, H = g.length;
  const clamp = (v, max) => Math.max(0, Math.min(max, v));
  return {
    x: clamp(Math.floor((e.clientX - r.left) / state.cellSize), W - 1),
    y: clamp(Math.floor((e.clientY - r.top) / state.cellSize), H - 1),
  };
}

// ────────────────────────────────────────────────────────────────────
// MAL-OPERATIONEN
// ────────────────────────────────────────────────────────────────────
// Nach einer Änderung: Canvas + abhängige Anzeigen auffrischen.
function afterPaint() {
  renderEditor();
  renderSpriteList();
  updateOutput();
  renderCallbacks.onSave();
}

// ── Symmetrie ────────────────────────────────────────────────────────
// Alle Mal-Operationen laufen durch mirrored(): der Punkt selbst plus seine
// Spiegelbilder an der senkrechten und/oder waagerechten Mittelachse.
// Ohne Symmetrie ist das genau ein Punkt, es kostet also nichts.
export function mirrored(x, y) {
  const g = getGrid();
  const W = g[0].length, H = g.length;
  const pts = [[x, y]];
  const mx = W - 1 - x, my = H - 1 - y;
  if (state.mirror === 'x' || state.mirror === 'both') pts.push([mx, y]);
  if (state.mirror === 'y' || state.mirror === 'both') pts.push([x, my]);
  if (state.mirror === 'both') pts.push([mx, my]);
  // Auf der Achse fallen Punkt und Spiegelbild zusammen — Duplikate raus.
  return pts.filter(([px, py], i) =>
    pts.findIndex(([qx, qy]) => qx === px && qy === py) === i);
}

// Eine Zelle setzen, ohne zu rendern. Gibt zurück, ob sich etwas geändert hat.
function setCell(g, x, y, value) {
  const H = g.length, W = g[0].length;
  if (x < 0 || y < 0 || x >= W || y >= H || g[y][x] === value) return false;
  g[y][x] = value;
  return true;
}

export function paintCell(x, y) {
  const g = getGrid();
  let changed = false;
  for (const [px, py] of mirrored(x, y)) changed = setCell(g, px, py, state.curColor) || changed;
  if (changed) afterPaint();
}

export function paintBrush(x, y) {
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const lo = -Math.floor((state.brushSize - 1) / 2);
  const hi =  Math.floor(state.brushSize / 2);
  const threshold = state.brushStrength / 100;
  let changed = false;
  for (let dy = lo; dy <= hi; dy++) {
    for (let dx = lo; dx <= hi; dx++) {
      if (threshold < 1 && Math.random() > threshold) continue;
      for (const [px, py] of mirrored(x + dx, y + dy)) {
        changed = setCell(grid, px, py, state.curColor) || changed;
      }
    }
  }
  if (changed) afterPaint();
}

export function paintSpray(x, y) {
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const r = state.brushSize;
  const count = Math.max(1, Math.round(state.brushStrength / 10));
  let changed = false;
  for (let i = 0; i < count; i++) {
    let dx, dy;
    do {
      dx = (Math.random() * 2 - 1) * r;
      dy = (Math.random() * 2 - 1) * r;
    } while (dx * dx + dy * dy > r * r);
    for (const [px, py] of mirrored(x + Math.round(dx), y + Math.round(dy))) {
      changed = setCell(grid, px, py, state.curColor) || changed;
    }
  }
  if (changed) afterPaint();
}

export function floodFill(startX, startY) {
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const fill = state.curColor;
  // Bei Symmetrie startet die Füllung an jedem Spiegelpunkt einmal.
  for (const [sx, sy] of mirrored(startX, startY)) {
    const target = grid[sy]?.[sx];
    if (target === undefined || target === fill) continue;
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= W || y >= H || grid[y][x] !== target) continue;
      grid[y][x] = fill;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
  afterPaint();
}

// ────────────────────────────────────────────────────────────────────
// FORMEN — Linie, Rechteck, Ellipse
// ────────────────────────────────────────────────────────────────────
// Alle drei liefern nur eine Zellliste; gezeichnet wird sie als Vorschau
// (state.shape) und beim Loslassen einmal ins Grid gestempelt.
function lineCells(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}

function rectCells(x0, y0, x1, y1, filled) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const out = [];
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
    if (filled || y === ay || y === by || x === ax || x === bx) out.push([x, y]);
  }
  return out;
}

// Ellipse zeilenweise: fuer jede Zeile die waagerechte Spanne ausrechnen.
// Die Kontur entsteht danach aus der gefuellten Form — jede Zelle mit einem
// leeren Nachbarn gehoert dazu. Das ist einfacher als Spannen-Vergleiche und
// laesst die Kappen oben und unten nicht aufreissen.
function ellipseCells(x0, y0, x1, y1, filled) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const cx = (ax + bx) / 2, cy = (ay + by) / 2;
  const rx = (bx - ax) / 2 + 0.5, ry = (by - ay) / 2 + 0.5;

  const inside = new Set();
  const all = [];
  for (let y = ay; y <= by; y++) {
    const norm = (y - cy) / ry;
    const t = 1 - norm * norm;
    if (t < 0) continue;
    const half = rx * Math.sqrt(t);
    const sx = Math.ceil(cx - half), ex = Math.floor(cx + half);
    for (let x = sx; x <= ex; x++) { inside.add(x + ',' + y); all.push([x, y]); }
  }
  if (filled) return all;

  const has = (x, y) => inside.has(x + ',' + y);
  return all.filter(([x, y]) =>
    !has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1));
}

// Zellen der aktuell gezogenen Form — inklusive Spiegelbildern, ohne Duplikate.
export function shapeCells(tool, a, b) {
  const base = tool === 'line' ? lineCells(a.x, a.y, b.x, b.y)
             : tool === 'rect' ? rectCells(a.x, a.y, b.x, b.y, state.shapeFill)
             : ellipseCells(a.x, a.y, b.x, b.y, state.shapeFill);

  const seen = new Set();
  const out = [];
  for (const [x, y] of base) {
    for (const [px, py] of mirrored(x, y)) {
      const key = px + ',' + py;
      if (!seen.has(key)) { seen.add(key); out.push([px, py]); }
    }
  }
  return out;
}

// Vorschau ins Grid übernehmen. Gibt die Zahl geänderter Pixel zurück.
export function commitShape() {
  const grid = getGrid();
  let n = 0;
  for (const [x, y] of state.shape.cells) {
    if (setCell(grid, x, y, state.shape.color)) n++;
  }
  state.shape.cells = [];
  if (n) afterPaint(); else renderEditor();
  return n;
}

// ────────────────────────────────────────────────────────────────────
// QUICK-PALETTE — Swatch-Leiste über dem Canvas
// ────────────────────────────────────────────────────────────────────
// 0–9 groß (dafür gibt es Tasten), danach bis QP_SMALL kleine Felder; was
// darüber liegt, zeigt das Paletten-Panel (Knopf "+N").
const QP_SMALL = 32;

export function renderQuickPalette() {
  const qp = document.getElementById('quick-palette');
  if (!qp) return;
  const pal = getPal();
  const maxIdx = getMaxIdx();
  qp.innerHTML = '';

  for (let i = 0; i <= Math.min(9, maxIdx); i++) {
    const color = pal[i];
    const el = document.createElement('button');
    el.type = 'button';
    el.dataset.idx = String(i);
    el.className = 'qp-swatch' + (i === state.curColor ? ' is-active' : '') + (i === 0 ? ' is-transparent' : '');
    el.title = t('pal.quickTitle', { i, label: colorLabelShort(i), extra: color && i !== 0 ? ' · ' + color : '' });
    if (i !== 0) el.style.background = color || 'var(--surface-3)';

    const idx = document.createElement('span');
    idx.className = 'qp-idx';
    idx.textContent = String(i);
    el.appendChild(idx);

    el.addEventListener('click', () => { state.curColor = i; syncColorActive(); });
    qp.appendChild(el);

    if (i === PALETTE_GROUP_SPLIT) {
      const sep = document.createElement('span');
      sep.className = 'qp-sep';
      qp.appendChild(sep);
    }
  }

  if (maxIdx > 9) {
    const more = document.createElement('div');
    more.className = 'qp-more';
    const last = Math.min(maxIdx, 9 + QP_SMALL);
    for (let i = 10; i <= last; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.idx = String(i);
      el.className = 'qp-mini' + (i === state.curColor ? ' is-active' : '');
      el.style.background = pal[i] || 'var(--surface-3)';
      el.title = t('pal.miniTitle', { i, hex: pal[i] || '—' });
      el.setAttribute('aria-label', el.title);
      el.addEventListener('click', () => { state.curColor = i; syncColorActive(); });
      more.appendChild(el);
    }
    qp.appendChild(more);
    if (maxIdx > last) {
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'btn qp-all';
      all.textContent = t('pal.moreCount', { n: maxIdx - last });
      all.title = t('pal.moreTitle', { n: maxIdx });
      // Das ganze Raster steht im Paletten-Panel — dort die Sprite-Palette zeigen.
      all.addEventListener('click', () => {
        state.palPreview = null;
        renderPalette();
        document.querySelector('.dock-btn[data-target="palette"]')?.click();
      });
      qp.appendChild(all);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// AKTUELLE FARBE (Kopf des Farb-Panels)
// ────────────────────────────────────────────────────────────────────
export function updateCurrentColorIndicator() {
  const sw  = document.querySelector('#current-color .cc-swatch');
  const hex = document.querySelector('#current-color .cc-hex');
  const lbl = document.querySelector('#current-color .cc-label');
  if (!sw || !hex) return;

  if (state.curColor === 0) {
    sw.style.background = '';
    sw.classList.add('is-transparent');
    hex.textContent = t('pal.transparent');
    if (lbl) lbl.textContent = t('pal.currentErase');
    return;
  }
  sw.classList.remove('is-transparent');

  if (typeof state.curColor === 'string' && state.curColor[0] === '#') {
    sw.style.background = state.curColor;
    hex.textContent = state.curColor;
    if (lbl) lbl.textContent = t('pal.currentFree');
  } else {
    const color = getPal()[state.curColor] || '#888888';
    sw.style.background = color;
    hex.textContent = color;
    if (lbl) lbl.textContent = t('pal.currentIndex', { i: state.curColor, label: colorLabelShort(state.curColor) });
  }
}

// Aktiv-Markierung ohne Full-Re-Render.
export function syncColorActive() {
  const isHex = typeof state.curColor === 'string';
  document.querySelectorAll('.qp-swatch, .qp-mini').forEach(el =>
    el.classList.toggle('is-active', !isHex && Number(el.dataset.idx) === state.curColor));
  syncPaletteGridActive();
  syncFreeColorsActive();
  updateCurrentColorIndicator();
  if (state.showColor) renderEditor();
}

// ────────────────────────────────────────────────────────────────────
// BILDFARBEN — freie Farben im Sprite (Pixel mit eigenem Hex statt Index)
// ────────────────────────────────────────────────────────────────────
// Entstehen beim Abpausen mit Rohfarben/N Farben und über die Pipette.
// Gespeichert und exportiert werden sie ohnehin; hier werden sie sichtbar
// und wieder anwählbar. Sortiert nach Häufigkeit.
// Über alle Frames — "in die Palette aufnehmen" färbt auch alle Frames um.
function collectFreeColors() {
  const sp = getSprite();
  const counts = new Map();
  if (!sp) return [];
  for (const row of allGrids(sp).flat()) for (const c of row) {
    if (typeof c === 'string' && c[0] === '#') {
      const k = c.toLowerCase();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

// Bei Fotos können es Tausende sein. Darum: Zählen bei jeder Änderung,
// die Liste selbst aber nur aufbauen, wenn sie offen ist — und höchstens
// FC_MAX Felder, die häufigsten zuerst.
const FC_MAX = 400;
let freeColorCache = [];

// Die häufigsten freien Farben stehen direkt in der Farbzeile.
const FC_INLINE = 12;

function freeSwatch(hex, n, cls) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.dataset.hex = hex;
  b.style.background = hex;
  b.title = t('fc.swatch', { hex, n });
  b.setAttribute('aria-label', b.title);
  b.addEventListener('click', () => { state.curColor = hex; syncColorActive(); });
  return b;
}

export function renderFreeColors() {
  const box = document.getElementById('free-colors');
  if (!box) return;
  const colors = freeColorCache = collectFreeColors();
  box.hidden = !colors.length;
  if (!colors.length) return;

  const inline = document.getElementById('free-colors-top');
  inline.innerHTML = '';
  for (const [hex, n] of colors.slice(0, FC_INLINE)) inline.appendChild(freeSwatch(hex, n, 'qp-mini fc-swatch'));

  document.getElementById('free-colors-count').textContent = t('fc.count', { n: colors.length });
  const top = colors.slice(0, 3).map(([hex]) => hex);
  while (top.length < 3) top.push(top[top.length - 1]);
  box.querySelector('.fc-preview').style.background =
    `linear-gradient(90deg, ${top[0]} 0 34%, ${top[1]} 34% 67%, ${top[2]} 67%)`;

  if (!document.getElementById('free-colors-list').hidden) renderFreeColorsList();
  syncFreeColorsActive();
}

export function renderFreeColorsList() {
  const colors = freeColorCache;
  const list = document.getElementById('free-colors-list');
  list.innerHTML = '';
  const head = document.createElement('p');
  head.className = 'fc-head';
  head.textContent = t('fc.head', { n: colors.length });
  const grid = document.createElement('div');
  grid.className = 'fc-grid';
  for (const [hex, n] of colors.slice(0, FC_MAX)) grid.appendChild(freeSwatch(hex, n, 'fc-swatch'));
  list.append(head, grid);
  if (colors.length > FC_MAX) {
    const more = document.createElement('p');
    more.className = 'fc-head fc-more';
    more.textContent = t('fc.more', { n: colors.length - FC_MAX });
    list.append(more);
  }

  // Aufnehmen geht, solange alles in 255 Plätze passt — sonst erst reduzieren.
  const room = MAX_COLORS - getMaxIdx();
  const acts = document.createElement('div');
  acts.className = 'fc-actions';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn--primary';
  add.textContent = t('fc.toPalette');
  add.title = t('fc.toPaletteTitle');
  add.dataset.action = 'to-palette';
  add.disabled = colors.length > room;
  const reduce = document.createElement('button');
  reduce.type = 'button';
  reduce.className = 'btn';
  reduce.textContent = t('fc.reduce');
  reduce.dataset.action = 'reduce';
  acts.append(add, reduce);
  list.append(acts);
  if (add.disabled) {
    const note = document.createElement('p');
    note.className = 'fc-head fc-more';
    note.textContent = t('fc.tooMany', { n: colors.length, max: room });
    list.append(note);
  }
  syncFreeColorsActive();
}

function syncFreeColorsActive() {
  const cur = typeof state.curColor === 'string' ? state.curColor.toLowerCase() : null;
  let hit = false;
  document.querySelectorAll('.fc-swatch').forEach(el => {
    const on = el.dataset.hex === cur;
    if (on) hit = true;
    el.classList.toggle('is-active', on);
  });
  document.getElementById('free-colors-btn')?.classList.toggle('is-active', hit);
}

// ────────────────────────────────────────────────────────────────────
// FARB-PANEL (rechte Spalte)
// ────────────────────────────────────────────────────────────────────

// Paletten-Auswahl im Panel (js/palpicker.js) — einmal anlegen, dann nur neu
// aufbauen. Auswählen ruft renderCallbacks.onPreviewPalette (app.js).
let panelPicker = null;

export function renderPalette() {
  const spName   = getPaletteName();
  const name     = getPreviewName();
  const pal      = getPaletteByName(name);
  const size     = paletteSize(pal);
  const isSprite = name === spName;
  const custom   = isCustomPalette(name);

  const host = document.getElementById('palette-browser');
  if (host && !panelPicker) {
    panelPicker = createPalettePicker(host, {
      onSelect: n => renderCallbacks.onPreviewPalette(n),
      activeName: () => getPaletteName(),
    });
  }
  panelPicker?.render(name);

  // Bearbeiten/Löschen gibt es nur für eigene Paletten — gilt der ANGEZEIGTEN.
  document.getElementById('palette-edit-btn')?.toggleAttribute('hidden', !custom);
  document.getElementById('palette-del-btn')?.toggleAttribute('hidden', !custom);
  document.getElementById('palette-fork-btn')?.toggleAttribute('hidden', custom);

  const badge = document.getElementById('palette-origin');
  if (badge) {
    badge.textContent = custom ? t('pal.origin.custom') : t('pal.origin.builtin');
    badge.className = 'badge ' + (custom ? 'badge--custom' : 'badge--builtin');
  }

  // Vorschau oder die Palette des Sprites? Nur bei einer Vorschau gibt es
  // die zwei Knöpfe zum Zuweisen.
  const status = document.getElementById('palette-status');
  if (status) {
    status.textContent = isSprite
      ? tn('pal.statusActive', size)
      : tn('pal.statusPreview', size, { name: spName });
    status.classList.toggle('is-preview', !isSprite);
  }
  document.getElementById('palette-assign-row')?.toggleAttribute('hidden', isSprite);

  const hint = document.getElementById('palette-hint');
  if (hint) hint.textContent = custom ? t('pal.hint.custom') : t('pal.hint.builtin');

  // Raster: 8 Spalten bei kleinen Paletten, 16 ab 16 Farben (16×16 = 256).
  const items = document.getElementById('palette-items');
  if (!items) return;
  items.innerHTML = '';
  items.style.setProperty('--cols', size + 1 > 16 ? '16' : '8');
  items.dataset.palette = name;

  for (let i = 0; i <= size; i++) {
    const color = pal[i];
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'pal-sw' + (i === 0 ? ' is-transparent' : '');
    sw.dataset.idx = String(i);
    if (i !== 0) sw.style.background = color || 'var(--surface-3)';
    sw.title = i === 0 ? colorLabel(0)
      : t('pal.swInfo', { i, label: colorLabel(i), hex: color || '—' })
        + '\n' + t(custom ? 'pal.swEdit' : 'pal.swPick');
    if (i === PALETTE_GROUP_SPLIT + 1 && size > PALETTE_GROUP_SPLIT) sw.classList.add('is-group');

    // Klick: damit malen. Aus der Sprite-Palette als Index, aus einer
    // Vorschau als freie Farbe — die Zeichnung ändert sich dadurch nie.
    sw.addEventListener('click', () => {
      state.curColor = i === 0 ? 0 : isSprite ? i : (color || '#888888');
      syncColorActive();
    });
    // Doppelklick: Farbe ändern (nur eigene Paletten).
    sw.addEventListener('dblclick', () => {
      if (i === 0) return;
      if (!custom) { showInfoToast(t('pal.hint.builtin')); return; }
      editPaletteColor(name, i);
    });
    items.appendChild(sw);
  }
  syncPaletteGridActive();
}

// Ein unsichtbarer Farbwähler für alle Felder des Rasters.
let _palPicker = null;
function editPaletteColor(name, i) {
  if (!_palPicker) {
    _palPicker = document.createElement('input');
    _palPicker.type = 'color';
    _palPicker.className = 'hidden-color-input';
    document.body.appendChild(_palPicker);
    _palPicker.addEventListener('input', () => {
      const { name: n, idx } = _palPicker.dataset;
      const target = customPalettes[n];
      if (!target) return;
      target[idx] = _palPicker.value;
      const sw = document.querySelector(`#palette-items[data-palette="${n}"] .pal-sw[data-idx="${idx}"]`);
      if (sw) sw.style.background = _palPicker.value;
      if (n === getPaletteName()) {
        renderEditor(); renderQuickPalette(); renderSpriteList(); updateCurrentColorIndicator();
        renderMaterials(); updateOutput();
      }
      syncPaletteGridActive();
      renderCallbacks.onSave();
    });
  }
  _palPicker.dataset.name = name;
  _palPicker.dataset.idx = i;
  _palPicker.value = customPalettes[name]?.[i] || '#888888';
  _palPicker.click();
}

// Markierung im Raster + Zeile darunter, welche Farbe gerade gewählt ist.
function syncPaletteGridActive() {
  const items = document.getElementById('palette-items');
  if (!items) return;
  const name = items.dataset.palette;
  const pal = getPaletteByName(name);
  const isSprite = name === getPaletteName();
  const c = state.curColor;
  const hex = typeof c === 'string' ? c.toLowerCase() : null;
  let hit = null;
  items.querySelectorAll('.pal-sw').forEach(sw => {
    const i = Number(sw.dataset.idx);
    const on = isSprite ? (typeof c === 'number' && c === i)
      : (i === 0 ? c === 0 : !!hex && pal[i]?.toLowerCase() === hex);
    sw.classList.toggle('is-active', on);
    if (on && hit === null) hit = i;
  });
  const info = document.getElementById('palette-pick-info');
  if (!info) return;
  if (hit === null || hit === 0) { info.textContent = hit === 0 ? colorLabel(0) : ''; return; }
  info.textContent = t('pal.swInfo', { i: hit, label: colorLabel(hit), hex: pal[hit] || '—' });
}

// ────────────────────────────────────────────────────────────────────
// OUTPUT — Code-Feld füllen (das Format liefert codegen.js)
// ────────────────────────────────────────────────────────────────────
// Scheitert die Validierung (JSON (Spiel)), steht die Meldung im Feld und
// in data-error — Kopieren und Speichern weigern sich dann (app.js).
export function updateOutput() {
  // Hängt wie der Code am Inhalt des Rasters — darum hier mit aufgefrischt.
  renderFreeColors();
  const ta = /** @type {HTMLTextAreaElement} */ (document.getElementById('output-textarea'));
  if (!ta) return;
  delete ta.dataset.error;
  delete ta.dataset.lazy;
  const sp = getSprite();
  if (!sp) { ta.value = ''; return; }
  // Große Sprites: der Code wäre Megabytes Text, bei jedem Neuzeichnen neu
  // gebaut. Dann erst beim Kopieren oder Speichern (currentCode).
  const cells = sp.grid.length * sp.grid[0].length * sp.frames.length;
  if (cells > LIVE_CODE_MAX) {
    ta.dataset.lazy = '1';
    ta.value = t('out.tooBigLive', { n: cells.toLocaleString() });
    return;
  }
  const r = currentCode();
  if (r.error) ta.dataset.error = r.error;
  ta.value = r.error || r.code;
}

// Bis zu so vielen Pixeln (alle Frames) steht der Code live im Feld.
const LIVE_CODE_MAX = 300_000;

/** Code des aktuellen Sprites im gewählten Format — oder die Fehlermeldung. */
export function currentCode() {
  const includePalette = /** @type {HTMLInputElement} */ (document.getElementById('export-include-palette'))?.checked;
  try {
    return { code: buildCode(state.outputFormat, includePalette), error: null };
  } catch (e) {
    if (!(e instanceof GameJsonError)) throw e;
    return { code: '', error: t('game.exportFailed', { reason: t(`game.err.${e.code}`, e.params) }) };
  }
}

// ────────────────────────────────────────────────────────────────────
// MATERIALIEN — eine Auswahl pro Palettenfarbe, nur bei "JSON (Spiel)"
// ────────────────────────────────────────────────────────────────────
// Gespeichert pro Palettenname in paletteMaterials, also auch für die
// eingebauten Paletten. Index 0 ist fest "empty" und taucht nicht auf.
export function renderMaterials() {
  const box = document.getElementById('material-box');
  if (!box) return;
  const show = !!getFormat(state.outputFormat).materials && !!getSprite();
  box.hidden = !show;
  if (!show) return;

  const palName = getPaletteName();
  const pal = getPal();
  const mats = paletteMaterials[palName] || {};
  box.innerHTML = `<div class="material-head">${esc(t('game.materials', { name: palName }))}</div>`;

  const list = document.createElement('div');
  list.className = 'material-rows';
  for (let i = 1; i <= getMaxIdx(); i++) {
    const row = document.createElement('label');
    row.className = 'material-row';
    row.innerHTML =
      `<span class="pal-idx">${i}</span>` +
      `<span class="material-swatch" style="background:${esc(pal[i] || 'transparent')}"></span>`;
    const sel = document.createElement('select');
    sel.className = 'input input--sm';
    sel.setAttribute('aria-label', t('game.materialAria', { i }));
    for (const m of MATERIALS) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    }
    sel.value = mats[i] || DEFAULT_MATERIAL;
    sel.addEventListener('change', () => {
      const target = paletteMaterials[palName] || (paletteMaterials[palName] = {});
      if (sel.value === DEFAULT_MATERIAL) delete target[i]; else target[i] = sel.value;
      if (!Object.keys(target).length) delete paletteMaterials[palName];
      updateOutput();
      renderCallbacks.onSave();
    });
    row.appendChild(sel);
    list.appendChild(row);
  }
  box.appendChild(list);
  const note = document.createElement('p');
  note.className = 'field-note';
  note.textContent = t('game.materialNote');
  box.appendChild(note);
}

// ────────────────────────────────────────────────────────────────────
// Full Re-Render
// ────────────────────────────────────────────────────────────────────
export function renderAll() {
  layerCache.clear();   // Struktur, Palette oder andere Ebenen können sich geändert haben
  renderSpriteList();
  renderEditor();
  renderPalette();
  renderQuickPalette();
  renderMaterials();
  updateOutput();
  updateCurrentColorIndicator();
  renderCallbacks.onSyncImagePanel();
  renderCallbacks.onRenderTimeline();
  renderCallbacks.onRenderLayers();
  renderCallbacks.onRenderGuides();
}
