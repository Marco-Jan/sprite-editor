// ════════════════════════════════════════════════════════════════════
// APP — Haupt-Entry: Init + Event-Bindings + Wiring zwischen Modulen
// ════════════════════════════════════════════════════════════════════
import {
  state, sprites, customPalettes, paletteMaterials, selection, allGrids, flatGrid, defaultLayer,
  getGrid, getSprite, getPal, getMaxIdx, getPaletteName, getPreviewName, listSprites,
  createSprite, uniquePaletteName, clearSelection, isInSelection,
} from './state.js';
import { DEFAULT_PALETTE, MAX_COLORS } from './data.js';
import {
  t, tn, colorLabelShort, applyStatic, initLangSwitch, onLangChange, getLang,
} from './i18n.js';
import { initDock } from './dock.js';
import { initLayout } from './layout.js';
import { applyIcons, iconSvg } from './icons.js';
import { showConfirmToast, showInfoToast } from './toast.js';
import {
  renderAll, renderEditor, renderSpriteList, syncColorActive, updateOutput, renderMaterials,
  renderFreeColorsList, countCurrentColor,
  cellFromEvent, cellFromEventClamped, cellToColor, paintCell, paintBrush, paintSpray, floodFill,
  renderCallbacks, shapeCells, commitShape,
} from './render.js';
import {
  saveState, loadState, clearStorage, forceSaveBeforeUnload, saveToFile, loadFromFile,
  backupInfo, downloadBackup, restoreBackup,
} from './storage.js';
import { supportsFsAccess, pickSaveDirectory, getStoredDirName, saveBlob } from './filesystem.js';
import {
  initNewSpriteModal, initRenameModal, openRenameModal, initSizeModal, openSizeModal,
  selectSprite, deleteSprite, duplicateSprite, createDefaultSprite, clearCurrentGrid,
} from './sprites.js';
import {
  openPaletteModal, initPaletteModal, deleteCustomPalette,
  previewPalette, assignPalette, forkPreviewPalette, addFreeColorsToPalette,
  createPaletteFromImport,
} from './palettes.js';
import {
  initTemplate, tplLoaded, tplHasOffscreen,
  startTplDrag, tplDragging, updateTplDrag, endTplDrag, getTplOffset,
  doTemplatePipette, sampleTemplateGrid,
  forgetTemplate,
} from './template.js';
import {
  medianCut, nearestColor, rgbToHex, hexToRgb,
  despeckleGrid, outlineGrid, magicWandDelete, autoRemoveBackground,
} from './spritefx.js';
import { initExport } from './export.js';
import { initFrames, togglePlay, nextFrame, prevFrame, isPlaying, stop as stopPlayback } from './frames.js';
import { initLayers } from './layers.js';
import { parseTsSprite } from './tsimport.js';
import { CODE_FORMATS, getFormat, codeFilename } from './codegen.js';
import {
  beginStroke, commitStroke, recordOp, undo, redo,
  canUndo, canRedo, clearHistory, historyCallbacks, undoDepth, rollbackTo,
} from './history.js';
import {
  startMarquee, updateMarquee, startLasso, updateLasso, startMove, updateMove,
  endSelectionPointer, selectByColor, fillSelection, commitFloat, isFloating,
  selectAll, deselect, nudgeSelection, selectionInfo,
  copySelection, cutSelection, pasteClipboard, deleteSelection, hasClipboard,
} from './selection.js';
import {
  flip, rotate90, trimToContent, centerContent, resizeCanvas, scaleSprite, scopeLabel, scopeLabelFor,
  beginFreeRotate, previewFreeRotate, applyFreeRotate, cancelFreeRotate, isRotating,
} from './transform.js';

const $ = id => document.getElementById(id);

// ────────────────────────────────────────────────────────────────────
// Render-Callbacks (vermeidet Zirkularimporte render <-> Feature-Module)
// ────────────────────────────────────────────────────────────────────
renderCallbacks.onSave             = saveState;
renderCallbacks.onSelectSprite     = id => {
  stopRotating(true);
  commitFloat();
  selectSprite(id);
};
renderCallbacks.onRenameSprite     = openRenameModal;
renderCallbacks.onResizeSprite     = openSizeModal;
renderCallbacks.onDuplicateSprite  = duplicateSprite;
renderCallbacks.onOpenPaletteModal = openPaletteModal;
renderCallbacks.onEditPalette      = openPaletteModal;
renderCallbacks.onImageToPalette   = openReduceModal;
renderCallbacks.onSyncImagePanel   = () => syncImagePanel();

renderCallbacks.onDeleteSprite = id => {
  const name = sprites[id]?.name || id;
  showConfirmToast(t('sprite.confirmDelete', { name }), () => deleteSprite(id));
};

renderCallbacks.onDeletePalette = name => {
  const used = Object.values(sprites).filter(s => s.palette === name).length;
  const extra = used ? tn('pal.usedBy', used) : '';
  showConfirmToast(t('pal.confirmDelete', { name, extra }), () => deleteCustomPalette(name));
};

// ────────────────────────────────────────────────────────────────────
// History → UI
// ────────────────────────────────────────────────────────────────────
function syncHistoryButtons() {
  const u = $('undo-btn'), r = $('redo-btn');
  if (u) u.disabled = !canUndo();
  if (r) r.disabled = !canRedo();
}
historyCallbacks.onChange = syncHistoryButtons;
// Nach einem Undo passt eine Auswahl nicht mehr zum Bild — weg damit. Ein
// schwebender Inhalt wurde vorher schon abgesetzt (siehe Undo-Bindings).
historyCallbacks.onRestore = () => { stopPlayback(); clearSelection(); renderAll(); saveState(); };

// ────────────────────────────────────────────────────────────────────
// SCHABLONE ÜBERNEHMEN — Auto-Trace ins Grid
// ────────────────────────────────────────────────────────────────────
// Palette-Index (1..maxIdx), dessen Farbe der RGB-Farbe am nächsten liegt.
function nearestPaletteIndex(c, pal, maxIdx) {
  let best = 1, bestD = Infinity;
  for (let i = 1; i <= maxIdx; i++) {
    const hex = pal[i];
    if (!hex) continue;
    const p = hexToRgb(hex);
    const d = (c.r - p.r) ** 2 + (c.g - p.g) ** 2 + (c.b - p.b) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const TRACE_ALPHA_MIN = 32; // darunter gilt ein Schablonen-Pixel als transparent

// mode 'palette'  → auf die aktuelle Palette einrasten (Export-tauglich)
// mode 'raw'      → freie Hex-Pixel (fotorealistisch)
// mode 'quantize' → per Median-Cut auf n dominante Töne reduzieren
function applyTemplateTrace(mode, n) {
  if (!getSprite()) { showInfoToast(t('tpl.needSprite')); return; }
  if (layerBlocked(true)) return;
  if (!tplLoaded() || !tplHasOffscreen()) { showInfoToast(t('tpl.needTpl')); return; }

  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const sampled = sampleTemplateGrid(W, H);
  if (!sampled) { showInfoToast(t('tpl.sampleFail')); return; }

  const pal = getPal();
  const maxIdx = getMaxIdx();

  let qpal = null;
  if (mode === 'quantize') {
    const px = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = sampled[y][x];
      if (c && c.a >= TRACE_ALPHA_MIN) px.push(c);
    }
    qpal = medianCut(px, Math.max(2, Math.min(64, n || 8)));
    if (!qpal.length) { showInfoToast(t('tpl.noColors')); return; }
  }

  let painted = 0;
  recordOp(() => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = sampled[y][x];
        if (!c || c.a < TRACE_ALPHA_MIN) continue; // außerhalb / transparent
        let val;
        if (mode === 'palette')       val = nearestPaletteIndex(c, pal, maxIdx);
        else if (mode === 'quantize') { const q = nearestColor(c, qpal); val = rgbToHex(q.r, q.g, q.b); }
        else                          val = rgbToHex(c.r, c.g, c.b);
        if (grid[y][x] !== val) { grid[y][x] = val; painted++; }
      }
    }
  });

  renderAll();
  const lbl = mode === 'palette' ? t('tpl.modePalette')
            : mode === 'quantize' ? t('tpl.modeQuant', { n: qpal.length })
            : t('tpl.modeRaw');
  showInfoToast(painted
    ? t('tpl.traced', { n: painted, mode: lbl })
    : t('tpl.tracedNone'));
}

// ────────────────────────────────────────────────────────────────────
// BILD → PALETTE — Bildfarben in eine editierbare eigene Palette überführen
// ────────────────────────────────────────────────────────────────────
function nearestRgbIndex(rgb, list) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const d = (rgb.r - p.r) ** 2 + (rgb.g - p.g) ** 2 + (rgb.b - p.b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best + 1;
}

// Dialog: wie viele Farben soll die Palette haben? Mit Vorher/Nachher-
// Vorschau; das Bild wird erst beim Bestätigen umgeschrieben.
let reduce = null;   // { px, distinct, colorsByCount }

function collectImageColors() {
  const sp = getSprite();
  if (!sp) return null;
  const pal = getPal();
  const counts = new Map();
  for (const row of allGrids(sp).flat()) for (const c of row) {
    const hex = cellToColor(c, pal);
    if (!hex) continue;
    const k = hex.toLowerCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  // Für den Median-Cut zählt jede Farbe so oft, wie sie vorkommt.
  const px = [];
  for (const [hex, n] of counts) { const rgb = hexToRgb(hex); for (let i = 0; i < n; i++) px.push(rgb); }
  return { px, distinct: [...counts.keys()] };
}

function reduceColors(count) {
  if (reduce.cache.has(count)) return reduce.cache.get(count);
  const colors = count >= reduce.distinct.length
    ? reduce.distinct.map(hexToRgb)
    : medianCut(reduce.px, count);
  // Hell → dunkel sortieren, damit Index 1 der hellste Ton ist.
  const lum = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  colors.sort((a, b) => lum(b) - lum(a));
  // Jede Bildfarbe einmal zuordnen statt jedes Pixel einzeln.
  const map = new Map(reduce.distinct.map(hex => [hex, nearestRgbIndex(hexToRgb(hex), colors)]));
  const res = { colors, map };
  reduce.cache.set(count, res);
  return res;
}

function drawReduceCanvas(canvas, colorOf) {
  const grid = getGrid(), pal = getPal();
  const H = grid.length, W = grid[0].length;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hex = cellToColor(grid[y][x], pal);
    if (!hex) continue;
    ctx.fillStyle = colorOf(hex.toLowerCase());
    ctx.fillRect(x, y, 1, 1);
  }
}

function renderReducePreview() {
  const count = Number($('reduce-count').value);
  const { colors, map } = reduceColors(count);
  const hexes = colors.map(c => rgbToHex(c.r, c.g, c.b));
  drawReduceCanvas($('reduce-after'), hex => hexes[map.get(hex) - 1]);
  $('reduce-after-cap').textContent = tn('red.after', colors.length);
  const sw = $('reduce-swatches');
  sw.innerHTML = '';
  sw.style.setProperty('--cols', colors.length > 16 ? 16 : 8);
  for (const hex of hexes) {
    const el = document.createElement('span');
    el.className = 'pal-sw';
    el.style.background = hex;
    el.title = hex;
    sw.appendChild(el);
  }
}

function openReduceModal() {
  if (!getSprite()) { showInfoToast(t('tpl.needSprite')); return; }
  const data = collectImageColors();
  if (!data || !data.px.length) { showInfoToast(t('tpl.imageEmpty')); return; }
  reduce = { ...data, cache: new Map() };
  const n = data.distinct.length;

  const sel = $('reduce-count');
  sel.innerHTML = '';
  const add = (value, label) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    sel.appendChild(o);
  };
  if (n <= MAX_COLORS) add(n, tn('red.all', n));
  for (const c of [255, 128, 64, 32, 16, 8, 4]) if (c < n) add(c, tn('red.count', c));
  sel.value = String(Math.min(n, MAX_COLORS));

  $('reduce-intro').textContent = tn('red.intro', n, { max: MAX_COLORS });
  drawReduceCanvas($('reduce-before'), hex => hex);
  renderReducePreview();
  $('reduce-modal-overlay').classList.add('open');
}

function applyReduce() {
  const sp = getSprite();
  if (!sp || !reduce) return;
  const { colors, map } = reduceColors(Number($('reduce-count').value));
  const pal = getPal();

  const name = uniquePaletteName('foto');
  const palObj = {};
  colors.forEach((c, i) => { palObj[i + 1] = rgbToHex(c.r, c.g, c.b); });
  customPalettes[name] = palObj;

  // Grid auf die neuen Indizes umschreiben — mit der Palette ein Undo-Schritt.
  recordOp(() => {
    for (const row of allGrids(sp).flat()) for (let x = 0; x < row.length; x++) {
      const hex = cellToColor(row[x], pal);
      row[x] = hex ? map.get(hex.toLowerCase()) : 0;
    }
    sp.palette = name;
  });

  $('reduce-modal-overlay').classList.remove('open');
  reduce = null;
  state.palPreview = null;
  if (typeof state.curColor !== 'number' || state.curColor > colors.length) state.curColor = 1;
  renderAll();
  saveState();
  showInfoToast(t('pal.fromImage', { name, n: colors.length }));
}

function initReduceModal() {
  const overlay = $('reduce-modal-overlay');
  const close = () => { overlay.classList.remove('open'); reduce = null; };
  $('reduce-count').addEventListener('change', renderReducePreview);
  $('reduce-cancel').addEventListener('click', close);
  $('reduce-apply').addEventListener('click', applyReduce);
  // Kein Schließen per Klick daneben — ein Fehlklick (oder Text markieren und
  // außerhalb loslassen) soll die Eingaben nicht verwerfen. Abbrechen oder Esc.
}

// ────────────────────────────────────────────────────────────────────
// Tool-Dispatch + UI-Sync
// ────────────────────────────────────────────────────────────────────
function applyTool(x, y) {
  if (state.tool === 'brush')  { paintBrush(x, y);  return; }
  if (state.tool === 'spray')  { paintSpray(x, y);  return; }
  if (state.tool === 'fill')   { floodFill(x, y);   return; }
  if (state.tool === 'eraser') {
    const prev = state.curColor;
    state.curColor = 0;
    paintBrush(x, y);
    state.curColor = prev;
    return;
  }
  paintCell(x, y); // pencil
}

// Werkzeug-Familien — bestimmen, welche Bedienelemente sichtbar sind und
// wie pointerdown reagiert.
const SELECT_TOOLS = ['select', 'lasso', 'magic'];
const SHAPE_TOOLS  = ['line', 'rect', 'ellipse'];
const isSelectTool = t => SELECT_TOOLS.includes(t);
const isShapeTool  = t => SHAPE_TOOLS.includes(t);

function setTool(tool) {
  stopRotating(true);
  // Schwebender Auswahl-Inhalt gehört ins Bild, bevor ein anderes Werkzeug
  // drankommt — sonst wäre er beim Abwählen weg.
  if (!isSelectTool(tool)) commitFloat();
  // Beim Wechsel weg von den Auswahl-Werkzeugen verschwindet auch die Auswahl —
  // ein Rahmen, den kein Werkzeug mehr anfassen kann, verwirrt nur.
  if (!isSelectTool(tool) && isSelectTool(state.tool)) { commitFloat(); clearSelection(); }
  // Eine halb gezogene Form gehoert zum alten Werkzeug.
  shapeStart = null;
  state.shape.cells = [];
  state.tool = tool;
  updateToolUI();
  renderEditor();
  saveState();
}

function updateToolUI() {
  document.querySelectorAll('.tool-btn').forEach(b => {
    const on = b.dataset.tool === state.tool;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('editor-canvas-wrap').dataset.tool = state.tool;

  const hasSize = ['brush', 'spray', 'eraser'].includes(state.tool);
  const needsTolerance = state.tool === 'wand' || state.tool === 'magic';
  $('brush-size-group').hidden = !hasSize;
  $('strength-group').hidden   = !hasSize;
  $('tolerance-group').hidden  = !needsTolerance;
  $('select-group').hidden     = !isSelectTool(state.tool);
  $('shape-group').hidden      = !isShapeTool(state.tool);
  if (!isSelectTool(state.tool)) $('editor-canvas-wrap').classList.remove('is-move');
  updateSelectionUI();
}

// Symmetrie-Knöpfe und Achsenzustand zusammenhalten.
function updateMirrorUI() {
  const x = state.mirror === 'x' || state.mirror === 'both';
  const y = state.mirror === 'y' || state.mirror === 'both';
  for (const [id, on] of [['mirror-x-btn', x], ['mirror-y-btn', y]]) {
    const b = $(id);
    if (!b) continue;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function toggleMirror(axis) {
  const x = state.mirror === 'x' || state.mirror === 'both';
  const y = state.mirror === 'y' || state.mirror === 'both';
  const nx = axis === 'x' ? !x : x;
  const ny = axis === 'y' ? !y : y;
  state.mirror = nx && ny ? 'both' : nx ? 'x' : ny ? 'y' : 'off';
  updateMirrorUI();
  renderEditor();
  saveState();
  info(state.mirror === 'off'
    ? t('info.mirrorOff')
    : t('info.mirrorOn', { axes: t(`axes.${state.mirror === 'both' ? 'both' : state.mirror}`) }));
}

// Auswahl-Buttons scharf schalten, je nachdem was gerade möglich ist.
function updateSelectionUI() {
  syncImagePanel();
  const has = !!selection.rect;
  ['sel-cut-btn', 'sel-copy-btn', 'sel-delete-btn', 'sel-none-btn', 'sel-fill-btn'].forEach(id => {
    const b = $(id);
    if (b) b.disabled = !has;
  });
  const paste = $('sel-paste-btn');
  if (paste) paste.disabled = !hasClipboard();
}

// ────────────────────────────────────────────────────────────────────
// Canvas-Events
// ────────────────────────────────────────────────────────────────────
function eraseAt(e) {
  const c = cellFromEvent(e);
  if (!c) return;
  const prev = state.curColor;
  state.curColor = 0;
  paintCell(c.x, c.y);
  state.curColor = prev;
}

// Größenvorschau am Mauszeiger — zeigt exakt die Reichweite des Werkzeugs.
function updateBrushCursor(e) {
  const el = $('brush-cursor');
  if (!el) return;
  const tool = state.tool;
  if (!['brush', 'spray', 'eraser'].includes(tool)) { el.hidden = true; return; }
  const c = cellFromEvent(e);
  if (!c) { el.hidden = true; return; }

  const cs = state.cellSize;
  let left, top, size, round;
  if (tool === 'spray') {
    const r = state.brushSize;
    left = (c.x - r) * cs; top = (c.y - r) * cs;
    size = (2 * r + 1) * cs; round = true;
  } else {
    const lo = -Math.floor((state.brushSize - 1) / 2);
    left = (c.x + lo) * cs; top = (c.y + lo) * cs;
    size = state.brushSize * cs; round = false;
  }
  el.className = 'tool-' + tool;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  el.style.borderRadius = round ? '50%' : '0';
  el.hidden = false;
}

// Startpunkt der gerade gezogenen Form (null = keine Form im Gange).
let shapeStart = null;

const shapeLabel = tool => t(`shape.${tool}`);

// Statuszeile unter dem Canvas.
function info(msg) {
  const el = $('info-bar');
  if (el) el.textContent = msg;
}

// In eine gesperrte oder ausgeblendete Ebene wird nicht gemalt — man sähe
// es nicht bzw. will es dort gerade nicht. Gibt true zurück, wenn blockiert.
// toast = true: für Knöpfe in Panels, dort sieht man die Statuszeile kaum.
function layerBlocked(toast = false) {
  const sp = getSprite();
  const L = sp?.layers[sp.layer];
  if (!L) return false;
  const msg = L.locked ? t('ly.lockedInfo', { name: L.name })
    : !L.visible ? t('ly.hiddenInfo', { name: L.name }) : null;
  if (!msg) return false;
  if (toast) showInfoToast(msg); else info(msg);
  return true;
}

// ────────────────────────────────────────────────────────────────────
// Ansicht: zoomen auf den Zeiger, verschieben mit Leertaste / mittlerer Taste
// ────────────────────────────────────────────────────────────────────
let panKeyHeld = false;

// Zoomt um `step` Pixel pro Zelle und hält dabei die Zelle unter dem Zeiger fest.
// `save` = false während einer laufenden Geste — gespeichert wird am Ende.
function zoomAt(step, clientX, clientY, save = true) {
  const next = Math.max(2, Math.min(40, state.cellSize + step));
  if (next === state.cellSize) return;
  const area = $('editor-canvas-area'), canvas = $('editor-canvas');
  const before = canvas.getBoundingClientRect();
  const fx = (clientX - before.left) / state.cellSize;   // Position in Zellen
  const fy = (clientY - before.top) / state.cellSize;
  state.cellSize = next;
  $('cell-size').value = next;
  $('cell-size-val').textContent = next + 'px';
  renderEditor();
  const after = canvas.getBoundingClientRect();
  area.scrollLeft += (after.left + fx * next) - clientX;
  area.scrollTop  += (after.top  + fy * next) - clientY;
  if (save) saveState();
}

function initPan() {
  const area = $('editor-canvas-area');
  const setHeld = on => {
    panKeyHeld = on;
    area.classList.toggle('is-pannable', on);
  };
  window.addEventListener('keydown', e => {
    if (e.code !== 'Space' || isTypingTarget(e.target) || document.querySelector('.modal-overlay.open')) return;
    e.preventDefault();          // sonst scrollt/klickt der Browser
    if (!e.repeat) setHeld(true);
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') setHeld(false); });
  window.addEventListener('blur', () => setHeld(false));

  area.addEventListener('pointerdown', e => {
    if (!(panKeyHeld || e.button === 1)) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, l0 = area.scrollLeft, t0 = area.scrollTop;
    area.classList.add('is-panning');
    try { area.setPointerCapture(e.pointerId); } catch {}
    const move = ev => {
      area.scrollLeft = l0 - (ev.clientX - sx);
      area.scrollTop  = t0 - (ev.clientY - sy);
    };
    const up = () => {
      area.classList.remove('is-panning');
      area.removeEventListener('pointermove', move);
      area.removeEventListener('pointerup', up);
      area.removeEventListener('pointercancel', up);
    };
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', up);
  });
  // Mittlere Taste: kein Auto-Scroll-Symbol des Browsers.
  area.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
}

// ── Finger: zwei zum Zoomen und Verschieben, einer neben dem Bild schiebt ──
// Der erste Finger hat beim Aufsetzen schon gemalt (oder gefüllt, eine Form
// begonnen …). Kommt kurz danach ein zweiter, war es eine Zoom-Geste — dann
// wird alles seit dem ersten Finger zurückgenommen. Läuft in der Capture-
// Phase vor den Canvas-Handlern, damit die Bewegung nicht weitermalt.
const PINCH_GRACE = 400;   // ms: so spät darf der zweite Finger kommen

function initPinch() {
  const area = $('editor-canvas-area');
  const pts = new Map();
  let pinch = null, slide = null;
  let depth0 = 0, t0 = 0;

  const two = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  area.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      depth0 = undoDepth();
      t0 = e.timeStamp;
      // Neben dem Bild: mit einem Finger verschieben.
      if (e.target === area || !e.target.closest('#editor-canvas')) {
        slide = { x: e.clientX, y: e.clientY, l: area.scrollLeft, t: area.scrollTop };
      }
      return;
    }
    if (pts.size !== 2) return;
    e.stopPropagation();
    e.preventDefault();
    slide = null;
    // Was der erste Finger begonnen hat, verwerfen.
    if (shapeStart) { shapeStart = null; state.shape.cells = []; }
    if (selection.mode) endSelectionPointer();
    if (e.timeStamp - t0 < PINCH_GRACE) rollbackTo(depth0);
    else if (state.isDrawing || state.isErasing) commitStroke();
    state.isDrawing = false;
    state.isErasing = false;
    renderAll();
    const g = two();
    pinch = { d0: g.d, c0: state.cellSize, x: g.x, y: g.y };
  }, true);

  area.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (slide) {
      area.scrollLeft = slide.l - (e.clientX - slide.x);
      area.scrollTop  = slide.t - (e.clientY - slide.y);
      return;
    }
    if (!pinch) return;
    e.stopPropagation();
    const g = two();
    const target = Math.round(pinch.c0 * g.d / pinch.d0);
    if (target !== state.cellSize) zoomAt(target - state.cellSize, g.x, g.y, false);
    area.scrollLeft -= g.x - pinch.x;
    area.scrollTop  -= g.y - pinch.y;
    pinch.x = g.x;
    pinch.y = g.y;
  }, true);

  const lift = e => {
    if (!pts.delete(e.pointerId)) return;
    if (pinch && pts.size < 2) { pinch = null; saveState(); }
    if (!pts.size) slide = null;
  };
  area.addEventListener('pointerup', lift, true);
  area.addEventListener('pointercancel', lift, true);
}

function initCanvasEvents() {
  const canvas = $('editor-canvas');

  canvas.addEventListener('pointerdown', e => {
    // Leertaste gehalten oder mittlere Taste: verschieben, nicht malen (initPan).
    if (panKeyHeld || e.button === 1) return;
    // Beim Abspielen wird nicht gemalt — der Tipp hält an.
    if (isPlaying()) { e.preventDefault(); stopPlayback(); return; }
    // Pointer einfangen → move/up feuern weiter, auch außerhalb des Canvas.
    try { canvas.setPointerCapture(e.pointerId); } catch {}

    // ── Rechtsklick ──
    if (e.button === 2) {
      e.preventDefault();
      // Schablonen-Kürzel liegen auf Shift+Alt — Shift allein scrollt seitlich.
      if (e.shiftKey && e.altKey && tplLoaded() && tplHasOffscreen()) {
        const r = doTemplatePipette(e);
        if (r.status === 'outside')          info(t('info.tplOutside'));
        else if (r.status === 'transparent') info(t('info.tplTransp'));
        else                                 info(t('info.tplPipette', { hex: r.hex }));
      } else {
        if (layerBlocked()) return;
        commitFloat(); // sonst radiert man in ein Loch, unter dem noch etwas hängt
        state.isErasing = true;
        beginStroke();
        eraseAt(e);
      }
      return;
    }

    if (e.button !== 0) return; // Mittelklick ignorieren
    e.preventDefault();

    // ── Shift+Alt+Links mit Schablone = verschieben ──
    if (e.shiftKey && e.altKey && tplLoaded()) { startTplDrag(e); return; }

    // ── Auswahl anfassen (vor der Pipette, damit Alt+Ziehen kopiert) ──
    if (isSelectTool(state.tool)) {
      const c = cellFromEventClamped(e);
      if (isInSelection(c.x, c.y)) {
        if (layerBlocked()) return;
        startMove(e, e.altKey);
        info(selectionInfo(t(e.altKey ? 'info.dragCopy' : 'info.move')));
        return;
      }
    }

    // ── Alt+Links = Pipette auf das Grid — greift, was man sieht ──
    if (e.altKey) {
      const c = cellFromEvent(e);
      if (c) {
        state.curColor = flatGrid(getSprite())[c.y][c.x];
        syncColorActive();
        const v = state.curColor;
        info(typeof v === 'string'
          ? t('info.pickFree', { hex: v })
          : t('info.pickIndex', { i: v, label: colorLabelShort(v) }));
      }
      return;
    }

    if (layerBlocked()) return;

    // ── Auswahl aufziehen / lassoen / nach Farbe wählen ──
    if (state.tool === 'select') {
      startMarquee(e);
      info(selectionInfo(t('info.marquee')));
      return;
    }
    if (state.tool === 'lasso') {
      startLasso(e);
      info(t('info.lassoStart'));
      return;
    }
    if (state.tool === 'magic') {
      const n = selectByColor(e);
      updateSelectionUI();
      info(n ? t('info.colorSel', { n, extra: selection.rect ? ' · ' + selectionInfo() : '' })
             : t('info.colorSelNone'));
      return;
    }

    // ── Formen: Startpunkt merken, gezeichnet wird beim Loslassen ──
    if (isShapeTool(state.tool)) {
      const c = cellFromEventClamped(e);
      shapeStart = c;
      state.shape.color = state.curColor;
      state.shape.cells = shapeCells(state.tool, c, c);
      renderEditor();
      info(t('info.shapeStart', { shape: shapeLabel(state.tool), x: c.x, y: c.y }));
      return;
    }

    // ── Ein-Klick-Werkzeuge ──
    if (state.tool === 'fill') {
      const c = cellFromEvent(e);
      if (c) recordOp(() => floodFill(c.x, c.y));
      return;
    }
    if (state.tool === 'wand') {
      const c = cellFromEvent(e);
      if (c) {
        let removed = 0;
        recordOp(() => { removed = magicWandDelete(getGrid(), getPal(), c.x, c.y, state.wandTolerance); });
        if (removed) renderAll();
        info(removed ? t('info.wandDeleted', { n: removed }) : t('info.wandNone'));
      }
      return;
    }

    state.isDrawing = true;
    beginStroke();
    const c = cellFromEvent(e);
    if (c) applyTool(c.x, c.y);
  });

  canvas.addEventListener('pointermove', e => {
    if (tplDragging()) {
      updateTplDrag(e);
      const o = getTplOffset();
      info(t('info.tplMove', { x: o.x, y: o.y }));
      return;
    }

    if (selection.mode === 'marquee') { updateMarquee(e); info(selectionInfo(t('info.marquee'))); return; }
    if (selection.mode === 'lasso')   { updateLasso(e);   info(selectionInfo()); return; }
    if (selection.mode === 'move')    { updateMove(e);    info(selectionInfo(t('info.move'))); return; }

    if (shapeStart) {
      const c = cellFromEventClamped(e);
      state.shape.cells = shapeCells(state.tool, shapeStart, c);
      renderEditor();
      const w = Math.abs(c.x - shapeStart.x) + 1, h = Math.abs(c.y - shapeStart.y) + 1;
      info(t('info.shapeDrag', { shape: shapeLabel(state.tool), w, h, n: state.shape.cells.length }));
      return;
    }

    updateBrushCursor(e);

    const c = cellFromEvent(e);
    if (!c) return;

    // Zeiger über der Auswahl → Verschiebe-Cursor.
    if (isSelectTool(state.tool)) {
      $('editor-canvas-wrap').classList.toggle('is-move', isInSelection(c.x, c.y));
    }
    const cur = getGrid()[c.y][c.x];
    const val = typeof cur === 'string' ? cur : t('info.index', { i: cur });
    info(e.altKey
      ? t('info.pipetteAt', { x: c.x, y: c.y, val })
      : t('info.at', { x: c.x, y: c.y, val })
        + (state.isDrawing ? t('info.suffixPaint') : '')
        + (state.isErasing ? t('info.suffixErase') : ''));
    if (state.isDrawing && !e.altKey) applyTool(c.x, c.y);
    if (state.isErasing) eraseAt(e);
  });

  const endPointer = () => {
    if (tplDragging()) endTplDrag();
    if (shapeStart) {
      shapeStart = null;
      let n = 0;
      recordOp(() => { n = commitShape(); });
      info(n ? t('info.drawn', { n }) : t('info.drawnNone'));
    }
    if (selection.mode) {
      endSelectionPointer();
      info(selectionInfo());
      updateSelectionUI();
    }
    if (state.isDrawing || state.isErasing) commitStroke();
    state.isDrawing = false;
    state.isErasing = false;
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('pointerleave', () => { $('brush-cursor').hidden = true; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // Strg + Mausrad zoomt — ohne Strg scrollt die Seite wie gewohnt weiter.
  // Mausrad: hoch/runter · Shift: links/rechts · Strg: Zoom auf den Zeiger.
  // Bewusst selbst gesteuert statt dem Browser überlassen — je nach Maus,
  // Treiber und System scrollt der sonst unterschiedlich oder gar nicht.
  const area = $('editor-canvas-area');
  area.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); return; }
    // Zeilen-Modus (manche Mäuse) in Pixel umrechnen.
    const k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? area.clientHeight : 1;
    if (e.shiftKey) area.scrollLeft += (e.deltaX || e.deltaY) * k;
    else { area.scrollTop += e.deltaY * k; area.scrollLeft += e.deltaX * k; }
  }, { passive: false });
}

// ────────────────────────────────────────────────────────────────────
// Tastatur
// ────────────────────────────────────────────────────────────────────
const TOOL_KEYS = {
  p: 'pencil', b: 'brush', s: 'spray', f: 'fill', e: 'eraser', w: 'wand',
  a: 'select', l: 'lasso', k: 'magic',
  i: 'line', r: 'rect', o: 'ellipse',
};

function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function anyModalOpen() {
  return !!document.querySelector('.modal-overlay.open');
}

function closeTopModal() {
  const open = [...document.querySelectorAll('.modal-overlay.open')].pop();
  if (open) { open.classList.remove('open'); return true; }
  return false;
}

function initKeyboardEvents() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (closeTopModal()) return;
      if (isPlaying()) { stopPlayback(); return; }
      if (isRotating()) { stopRotating(false); info(t('rot.discarded')); return; }
      if (shapeStart || state.shape.cells.length) {
        shapeStart = null;
        state.shape.cells = [];
        renderEditor();
        info(t('rot.shapeDrop'));
        return;
      }
      if (deselect()) { updateSelectionUI(); info(t('sel.dropped')); return; }
      if (document.body.classList.contains('editor-fullscreen')) { exitFullscreen(); return; }
    }
    // Alt allein = Pipette; Shift+Alt gehört der Schablone.
    if (e.key === 'Alt' && !e.shiftKey) $('editor-canvas-wrap').classList.add('is-eyedrop');
    if (e.key === 'Shift' && e.altKey) $('editor-canvas-wrap').classList.remove('is-eyedrop');

    // Undo/Redo — auch bei Fokus außerhalb von Formularfeldern.
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); stopRotating(false); commitFloat(); undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); stopRotating(false); commitFloat(); redo(); return; }
    }

    if (e.key === 'Enter' && isRotating() && !isTypingTarget(e.target)) {
      stopRotating(true);
      info(t('rot.applied'));
      return;
    }

    if (isTypingTarget(e.target) || anyModalOpen()) return;

    // ── Auswahl: Zwischenablage ──
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'a') {
        e.preventDefault();
        setTool('select'); selectAll(); updateSelectionUI();
        info(selectionInfo(t('sel.all')));
      } else if (k === 'c' && selection.rect) {
        e.preventDefault();
        info(t('sel.copied', { n: copySelection() }));
        updateSelectionUI();
      } else if (k === 'x' && selection.rect) {
        e.preventDefault();
        if (layerBlocked()) return;
        info(t('sel.cut', { n: cutSelection() }));
        updateSelectionUI();
      } else if (k === 'v') {
        e.preventDefault();
        if (layerBlocked()) return;
        if (!hasClipboard()) info(t('sel.clipEmpty'));
        else {
          setTool('select');
          info(t('sel.pasted', { n: pasteClipboard() }));
          updateSelectionUI();
        }
      }
      return; // andere Strg-Kombis gehören dem Browser
    }

    // ── Auswahl: verschieben / leeren ──
    if (selection.rect) {
      const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (step) {
        e.preventDefault();
        nudgeSelection(step[0], step[1]);
        info(selectionInfo(t('info.moved')));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (layerBlocked()) return;
        info(t('sel.erased', { n: deleteSelection() }));
        return;
      }
    }

    // ── Frames: , und . blättern, Enter spielt ab ──
    if (e.key === ',') { prevFrame(); return; }
    if (e.key === '.') { nextFrame(); return; }
    if (e.key === 'Enter' && !e.target.closest?.('button, a, select, [role="option"]')) {
      e.preventDefault();
      togglePlay();
      return;
    }

    if (e.key >= '0' && e.key <= '9') {
      const idx = Number(e.key);
      if (idx <= getMaxIdx()) { state.curColor = idx; syncColorActive(); }
      return;
    }
    const tool = TOOL_KEYS[e.key.toLowerCase()];
    if (tool) setTool(tool);
  });

  document.addEventListener('keyup', e => {
    if (e.key === 'Alt') $('editor-canvas-wrap').classList.remove('is-eyedrop');
  });
}

// ────────────────────────────────────────────────────────────────────
// Panels (auf-/zuklappen) — generisch über [data-panel]
// ────────────────────────────────────────────────────────────────────
const panelSyncs = [];

function initPanels() {
  document.querySelectorAll('[data-panel] .panel-toggle').forEach(btn => {
    const panel = btn.closest('[data-panel]');
    const sync = () => {
      const collapsed = panel.classList.contains('collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.title = t(collapsed ? 'panel.expand' : 'panel.collapse');
    };
    panelSyncs.push(sync);
    btn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      sync();
      saveState();
    });
    sync();
  });
}

function syncPanelTitles() { panelSyncs.forEach(fn => fn()); }

// ────────────────────────────────────────────────────────────────────
// Vollbild
// ────────────────────────────────────────────────────────────────────
function syncFullscreenBtn() {
  const btn = $('fullscreen-btn');
  if (!btn) return;
  const on = document.body.classList.contains('editor-fullscreen');
  btn.innerHTML = iconSvg(on ? 'shrink' : 'expand')
    + `<span class="btn-label">${t(on ? 'full.exit' : 'full.enter')}</span>`;
  btn.title       = t(on ? 'full.exitTitle' : 'full.enterTitle');
}

function enterFullscreen() {
  document.body.classList.add('editor-fullscreen');
  syncFullscreenBtn();
}

function exitFullscreen() {
  document.body.classList.remove('editor-fullscreen');
  syncFullscreenBtn();
}

// ────────────────────────────────────────────────────────────────────
// Werkzeugleiste
// ────────────────────────────────────────────────────────────────────
function initToolbar() {
  document.querySelectorAll('.tool-btn').forEach(btn =>
    btn.addEventListener('click', () => setTool(btn.dataset.tool)));

  $('mirror-x-btn').addEventListener('click', () => toggleMirror('x'));
  $('mirror-y-btn').addEventListener('click', () => toggleMirror('y'));

  $('shape-fill-btn').addEventListener('click', () => {
    state.shapeFill = !state.shapeFill;
    $('shape-fill-btn').classList.toggle('is-active', state.shapeFill);
    $('shape-fill-btn').setAttribute('aria-pressed', String(state.shapeFill));
    saveState();
  });

  const selAction = (id, fn, edits = true) => $(id).addEventListener('click', () => {
    if (edits && layerBlocked(true)) return;
    fn();
    updateSelectionUI();
  });
  selAction('sel-all-btn',    () => { selectAll(); info(selectionInfo(t('sel.all'))); }, false);
  selAction('sel-cut-btn',    () => { info(t('sel.cutShort',    { n: cutSelection() })); });
  selAction('sel-copy-btn',   () => { info(t('sel.copiedShort', { n: copySelection() })); }, false);
  selAction('sel-paste-btn',  () => { info(t('sel.pasted',      { n: pasteClipboard() })); });
  selAction('sel-delete-btn', () => { info(t('sel.erased',      { n: deleteSelection() })); });
  selAction('sel-fill-btn',   () => { info(t('sel.filled',      { n: fillSelection() })); });
  selAction('sel-none-btn',   () => { deselect(); info(t('sel.dropped')); }, false);

  document.querySelectorAll('.brush-sz').forEach(btn =>
    btn.addEventListener('click', () => {
      state.brushSize = Number(btn.dataset.size);
      document.querySelectorAll('.brush-sz').forEach(b =>
        b.classList.toggle('is-active', Number(b.dataset.size) === state.brushSize));
      saveState();
    }));

  const strength = $('strength-slider');
  strength.addEventListener('input', () => {
    state.brushStrength = Number(strength.value);
    $('strength-val').textContent = strength.value + '%';
  });
  strength.addEventListener('change', saveState);

  const tolerance = $('tolerance-slider');
  tolerance.addEventListener('input', () => {
    state.wandTolerance = Number(tolerance.value);
    $('tolerance-val').textContent = tolerance.value + '%';
  });
  tolerance.addEventListener('change', saveState);

  // Zoom
  const cell = $('cell-size');
  cell.addEventListener('input', () => {
    state.cellSize = Number(cell.value);
    $('cell-size-val').textContent = state.cellSize + 'px';
    renderEditor();
  });
  cell.addEventListener('change', saveState);

  // Hintergrund hell/dunkel
  const setBg = mode => {
    state.editorBg = mode;
    $('bg-dark-btn').classList.toggle('is-active', mode === 'dark');
    $('bg-bw-btn').classList.toggle('is-active', mode === 'bw');
    renderEditor();
    saveState();
  };
  $('bg-dark-btn').addEventListener('click', () => setBg('dark'));
  $('bg-bw-btn').addEventListener('click', () => setBg('bw'));

  $('undo-btn').addEventListener('click', () => { stopRotating(false); commitFloat(); undo(); });
  $('redo-btn').addEventListener('click', () => { stopRotating(false); commitFloat(); redo(); });

  $('fullscreen-btn').addEventListener('click', () => {
    if (document.body.classList.contains('editor-fullscreen')) exitFullscreen();
    else enterFullscreen();
  });
}

// ────────────────────────────────────────────────────────────────────
// Farb-Panel
// ────────────────────────────────────────────────────────────────────
// Bildfarben-Liste in der Farbzeile auf-/zuklappen.
function initFreeColors() {
  const btn = $('free-colors-btn'), list = $('free-colors-list');
  const setOpen = open => {
    list.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => {
    const open = list.hidden;
    if (open) renderFreeColorsList();
    setOpen(open);
  });
  // Knöpfe unten in der Liste: in die Palette aufnehmen / reduzieren.
  list.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    setOpen(false);
    if (action === 'to-palette') addFreeColorsToPalette();
    else if (action === 'reduce') openReduceModal();
  });
  document.addEventListener('pointerdown', e => {
    if (!list.hidden && !e.target.closest('#free-colors')) setOpen(false);
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); setOpen(false); }
  }, true);
}

// "Farbe zeigen": hebt die aktuelle Farbe auf der Zeichenfläche hervor.
function initShowColor() {
  const btn = $('show-color-btn');
  btn.addEventListener('click', () => {
    state.showColor = !state.showColor;
    btn.setAttribute('aria-pressed', String(state.showColor));
    btn.classList.toggle('is-active', state.showColor);
    renderEditor();
    if (state.showColor) info(tn('pal.showCount', countCurrentColor()));
  });
}

function initPalettePanel() {
  // Auswählen zeigt die Palette nur an — die Zeichnung bleibt unverändert.
  renderCallbacks.onPreviewPalette = previewPalette;

  $('palette-use-btn').addEventListener('click', () => assignPalette(getPreviewName(), { keepLook: true }));
  $('palette-recolor-btn').addEventListener('click', () => assignPalette(getPreviewName(), { keepLook: false }));
  $('palette-add-btn').addEventListener('click', () => openPaletteModal());
  $('palette-fork-btn').addEventListener('click', forkPreviewPalette);
  $('palette-edit-btn').addEventListener('click', () => openPaletteModal(getPreviewName()));
  $('palette-del-btn').addEventListener('click', () => renderCallbacks.onDeletePalette(getPreviewName()));
  $('palette-from-image-btn').addEventListener('click', openReduceModal);

  // Freier Farbwähler — Klick auf die aktuelle Farbe öffnet den Picker.
  const picker = $('free-color-picker');
  $('current-color').addEventListener('click', e => {
    if (e.target === picker) return;
    if (typeof state.curColor === 'string' && state.curColor[0] === '#') {
      picker.value = state.curColor;
    } else if (state.curColor !== 0) {
      picker.value = getPal()[state.curColor] || '#888888';
    }
    picker.click();
  });
  picker.addEventListener('input', () => {
    state.curColor = picker.value;
    syncColorActive();
  });
}

// ────────────────────────────────────────────────────────────────────
// Bild-Panel — spiegeln, drehen, zuschneiden, Größe
// ────────────────────────────────────────────────────────────────────
// Zeigt im Badge an, worauf die Aktionen gerade wirken, und hält die
// Größenfelder am aktuellen Sprite.
function syncImagePanel() {
  const badge = $('image-scope');
  if (badge) badge.textContent = scopeLabel();
  const sp = getSprite();
  const w = $('resize-w'), h = $('resize-h');
  if (sp && w && h && document.activeElement !== w && document.activeElement !== h) {
    w.value = sp.grid[0].length;
    h.value = sp.grid.length;
  }
}

// Regler für die freie Drehung. Die Sitzung beginnt beim ersten Zupfen und
// endet mit Übernehmen oder Verwerfen — dazwischen ist alles nur Vorschau.
function initRotateSlider() {
  const slider = $('rotate-free');
  const num = $('rotate-free-num');
  const actions = $('rotate-actions');

  const reset = () => {
    slider.value = 0;
    num.value = 0;
    actions.hidden = true;
  };

  const preview = deg => {
    if (!getSprite()) return;
    if (!isRotating() && !beginFreeRotate()) return;
    const r = previewFreeRotate(deg);
    actions.hidden = false;
    if (r) {
      info(t('rot.preview', { scope: scopeLabelFor(r.scope), deg, w: r.w, h: r.h }) +
        t(r.scope === 'Sprite' ? 'rot.lossHint' : 'rot.applyHint'));
    }
  };

  slider.addEventListener('input', () => {
    num.value = slider.value;
    preview(Number(slider.value));
  });
  num.addEventListener('change', () => {
    const deg = Math.max(-180, Math.min(180, Number(num.value) || 0));
    num.value = deg;
    slider.value = deg;
    preview(deg);
  });

  $('rotate-apply-btn').addEventListener('click', () => {
    const scope = applyFreeRotate();
    if (scope) info(t('rot.done', { scope: scopeLabelFor(scope) }));
    reset();
    updateSelectionUI();
  });
  $('rotate-cancel-btn').addEventListener('click', () => {
    if (cancelFreeRotate()) info(t('rot.discarded'));
    reset();
    updateSelectionUI();
  });

  // Von außen aufrufbar, wenn etwas anderes die Sitzung beendet.
  resetRotateUI = reset;
}

// Wird von initRotateSlider gesetzt — bricht eine laufende Dreh-Sitzung ab.
let resetRotateUI = () => {};

function stopRotating(applyIt) {
  if (!isRotating()) return;
  if (applyIt) applyFreeRotate(); else cancelFreeRotate();
  resetRotateUI();
}

function initImagePanel() {
  // Jede andere Bild-Aktion schreibt eine laufende Drehung erst fest.
  ['flip-h-btn', 'flip-v-btn', 'rotate-btn', 'trim-btn', 'center-btn',
   'resize-btn', 'scale-up-btn', 'scale-down-btn'].forEach(id =>
    $(id).addEventListener('click', () => stopRotating(true), true));

  $('flip-h-btn').addEventListener('click', () => {
    const scope = flip('h');
    if (scope) info(t('tf.flipH', { scope: scopeLabelFor(scope) }));
    syncImagePanel();
  });
  $('flip-v-btn').addEventListener('click', () => {
    const scope = flip('v');
    if (scope) info(t('tf.flipV', { scope: scopeLabelFor(scope) }));
    syncImagePanel();
  });
  $('rotate-btn').addEventListener('click', () => {
    const scope = rotate90();
    if (scope) info(t('tf.rot90', { scope: scopeLabelFor(scope) }));
    syncImagePanel();
  });

  $('trim-btn').addEventListener('click', () => {
    const r = trimToContent();
    if (!r) return;
    showInfoToast(r.ok ? t('tf.trimmed', { w: r.w, h: r.h })
                       : t('tf.trimFail', { reason: t(`reason.${r.reason}`) }));
    syncImagePanel();
  });
  $('center-btn').addEventListener('click', () => {
    const r = centerContent();
    if (!r) return;
    showInfoToast(r.ok ? t('tf.centered') : t('tf.centerFail', { reason: t(`reason.${r.reason}`) }));
  });

  $('resize-btn').addEventListener('click', () => {
    const w = Number($('resize-w').value);
    const h = Number($('resize-h').value);
    const anchor = $('resize-anchor').value;
    const apply = () => {
      const r = resizeCanvas(w, h, anchor);
      if (!r) return;
      showInfoToast(r.ok
        ? t('tf.resized', { w: r.w, h: r.h, lost: r.lost ? t('tf.resizeLost', { n: r.lost }) : '' })
        : t('tf.resizeFail', { reason: t(`reason.${r.reason}`) }));
      syncImagePanel();
    };
    // Verkleinern kann Pixel kosten — vorher fragen.
    const sp = getSprite();
    if (sp && (w < sp.grid[0].length || h < sp.grid.length)) {
      showConfirmToast(t('tf.confirmShrink'), apply, t('tf.shrinkOk'));
    } else apply();
  });

  $('scale-up-btn').addEventListener('click', () => {
    const r = scaleSprite(2);
    if (r) showInfoToast(r.ok ? t('tf.scaledUp', { w: r.w, h: r.h })
                              : t('tf.scaleFail', { reason: t(`reason.${r.reason}`) }));
    syncImagePanel();
  });
  $('scale-down-btn').addEventListener('click', () => {
    showConfirmToast(t('tf.confirmHalve'), () => {
      const r = scaleSprite(0.5);
      if (r) showInfoToast(r.ok ? t('tf.scaledDown', { w: r.w, h: r.h })
                                : t('tf.scaleFail', { reason: t(`reason.${r.reason}`) }));
      syncImagePanel();
    }, t('tf.halveOk'));
  });
}

// ────────────────────────────────────────────────────────────────────
// Aufräumen-Panel
// ────────────────────────────────────────────────────────────────────
function initCleanupPanel() {
  $('bg-remove-btn').addEventListener('click', () => {
    if (layerBlocked(true)) return;
    const tol = Number($('bg-tolerance').value) || 25;
    let n = 0;
    recordOp(() => { n = autoRemoveBackground(getGrid(), getPal(), tol); });
    if (n) renderAll();
    showInfoToast(n ? t('cln.bgRemoved', { n }) : t('cln.bgNone'));
  });

  $('despeckle-btn').addEventListener('click', () => {
    if (layerBlocked(true)) return;
    let n = 0;
    recordOp(() => { n = despeckleGrid(getGrid()); });
    if (n) renderAll();
    showInfoToast(n ? t('cln.despeckled', { n }) : t('cln.despeckleNone'));
  });

  $('outline-btn').addEventListener('click', () => {
    if (layerBlocked(true)) return;
    const col = $('outline-color').value;
    const th  = Number($('outline-thickness').value) || 1;
    let n = 0;
    recordOp(() => { n = outlineGrid(getGrid(), col, th); });
    if (n) renderAll();
    showInfoToast(n ? t('cln.outlined', { n }) : t('cln.outlineNone'));
  });
}

// ────────────────────────────────────────────────────────────────────
// Schablonen-Panel (die Trace-Buttons; der Rest lebt in template.js)
// ────────────────────────────────────────────────────────────────────
function initTemplatePanel() {
  $('template-trace').addEventListener('click', () => applyTemplateTrace('palette'));
  $('template-trace-raw').addEventListener('click', () => applyTemplateTrace('raw'));
  $('template-trace-quant').addEventListener('click', () => {
    applyTemplateTrace('quantize', Number($('trace-colors').value) || 8);
  });
}

// ────────────────────────────────────────────────────────────────────
// Kopfzeile: Projekt speichern/laden, Speicherort, Reset, Hilfe
// ────────────────────────────────────────────────────────────────────
// Wird von initTopbar gesetzt, sobald es den Knopf gibt.
let syncSaveDirBtn = () => {};

function initTopbar() {
  const saveDirBtn = $('save-dir-btn');
  if (!supportsFsAccess()) {
    saveDirBtn.hidden = true; // Browser ohne API → Download-Fallback
  } else {
    let dirName = null;
    const refresh = name => {
      dirName = name || null;
      saveDirBtn.title = dirName ? t('file.dirSet', { name: dirName }) : t('file.dirUnset');
      saveDirBtn.classList.toggle('is-set', !!dirName);
    };
    syncSaveDirBtn = () => refresh(dirName);
    getStoredDirName().then(refresh);
    saveDirBtn.addEventListener('click', async () => {
      const dir = await pickSaveDirectory();
      if (dir) {
        refresh(dir.name);
        showInfoToast(t('file.dirPicked', { name: dir.name }));
      }
    });
  }

  $('save-file-btn').addEventListener('click', saveToFile);

  const loadInput = $('load-file-input');
  $('load-file-btn').addEventListener('click', () => loadInput.click());
  loadInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadFromFile(file, msg => showInfoToast(msg));
    loadInput.value = '';
  });

  $('clear-storage-btn').addEventListener('click', () => {
    showConfirmToast(t('file.confirmReset'), () => { forgetTemplate(); clearStorage(); }, t('file.resetOk'));
  });

  const help = $('help-modal-overlay');
  $('help-btn').addEventListener('click', () => { syncBackupRows(); help.classList.add('open'); });
  help.addEventListener('click', e => {
    const b = e.target.closest('[data-backup]');
    if (!b) return;
    if (b.dataset.do === 'download') downloadBackup(b.dataset.backup);
    else showConfirmToast(t('help.backupConfirm'), () => restoreBackup(b.dataset.backup), t('help.backupRestore'));
  });
  $('help-close').addEventListener('click', () => help.classList.remove('open'));
  help.addEventListener('click', e => { if (e.target === help) help.classList.remove('open'); });

  window.addEventListener('beforeunload', () => {
    stopRotating(true);
    commitFloat(); // schwebender Inhalt darf nicht mit dem Tab verschwinden
    forceSaveBeforeUnload();
  });
}

// ────────────────────────────────────────────────────────────────────
// Code-Panel: kopieren, .ts speichern, Grid leeren
// ────────────────────────────────────────────────────────────────────
function initOutputPanel() {
  initFormatSelect();
  $('export-include-palette').addEventListener('change', () => { updateOutput(); saveState(); });

  $('copy-btn').addEventListener('click', async () => {
    const btn = $('copy-btn');
    const ta = $('output-textarea');
    if (ta.dataset.error) { showInfoToast(ta.dataset.error); return; }
    try {
      await navigator.clipboard.writeText(ta.value);
    } catch {
      // Clipboard-API kann blockiert sein (kein HTTPS o.ä.) — Auswahl als Fallback.
      ta.select();
      showInfoToast(t('file.clipboardOff'));
      return;
    }
    const label = btn.textContent;
    btn.textContent = t('file.copied');
    btn.classList.add('is-ok');
    setTimeout(() => { btn.textContent = label; btn.classList.remove('is-ok'); }, 1600);
  });

  $('save-code-btn').addEventListener('click', async () => {
    if (!getSprite()) return;
    if ($('output-textarea').dataset.error) { showInfoToast($('output-textarea').dataset.error); return; }
    const fmt = getFormat(state.outputFormat);
    const filename = codeFilename(state.outputFormat);
    const blob = new Blob([$('output-textarea').value], { type: `${fmt.mime};charset=utf-8` });
    const result = await saveBlob(blob, filename);
    showInfoToast(result.fallback
      ? t('file.downloaded', { name: filename })
      : (result.dir ? t('file.savedIn', { name: filename, dir: result.dir })
                    : t('file.saved', { name: filename })));
  });

  $('clear-grid-btn').addEventListener('click', () => {
    if (!getSprite() || layerBlocked(true)) return;
    stopRotating(false);
    commitFloat();
    showConfirmToast(t('sprite.confirmClear'), () => {
      recordOp(clearCurrentGrid);
      renderAll();
      saveState();
    }, t('sprite.clearOk'));
  });
}

// ────────────────────────────────────────────────────────────────────
// Ausgabeformat des Code-Felds
// ────────────────────────────────────────────────────────────────────
// Ein Satz je Format — die Texte selbst stehen zweisprachig in i18n.js.
function formatHint(key) { return t(`fmt.${key}`); }

function syncFormatUI() {
  const fmt = getFormat(state.outputFormat);
  renderMaterials();
  $('save-code-btn').textContent = t('file.saveAs', { ext: fmt.ext });
  $('save-code-btn').title = t('file.saveAsTitle', { label: fmt.label });

  // Die Palette-Option gibt es nur, wo sie etwas ändert — bei SVG, CSS und
  // Text stecken die Farben ohnehin direkt im Ergebnis.
  $('include-palette-label').hidden = !fmt.palOption;

  const hint = formatHint(state.outputFormat);
  $('output-format-hint').textContent = fmt.reimport ? t('fmt.reimport', { hint }) : hint;
}

function initFormatSelect() {
  const sel = $('output-format');
  for (const [key, fmt] of Object.entries(CODE_FORMATS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = fmt.label;
    sel.appendChild(opt);
  }
  sel.value = state.outputFormat;
  sel.addEventListener('change', () => {
    state.outputFormat = sel.value;
    syncFormatUI();
    updateOutput();
    saveState();
  });
  syncFormatUI();
}

// ────────────────────────────────────────────────────────────────────
// IMPORT — TypeScript-/JS-Sprite einlesen (Grid + Palette)
// ────────────────────────────────────────────────────────────────────
function initImport() {
  const overlay = $('import-modal-overlay');
  const ta      = $('import-textarea');
  const errEl   = $('import-error');
  const okEl    = $('import-preview');
  const fileInp = $('import-file-input');
  const usePal  = $('import-use-palette');

  const close = () => overlay.classList.remove('open');
  const setError = msg => {
    errEl.textContent = msg;
    errEl.hidden = !msg;
    if (msg) okEl.hidden = true;
  };

  // Live-Vorschau: sagt schon vor dem Laden, was erkannt wurde.
  const preview = () => {
    setError('');
    okEl.hidden = true;
    if (!ta.value.trim()) return null;
    const r = parseTsSprite(ta.value);
    if (!r.ok) { setError(r.error); return null; }

    const parts = [];
    if (r.stats.format && r.stats.format !== 'Array') parts.push(r.stats.format);
    parts.push(t('imp.size', { w: r.stats.w, h: r.stats.h }));
    if (r.stats.frames > 1) parts.push(tn('list.frames', r.stats.frames));
    if (r.stats.paletteCount) parts.push(t('imp.paletteWith', { n: r.stats.paletteCount }));
    else parts.push(t('imp.paletteNone'));
    if (r.stats.restored) parts.push(t('imp.restored', { n: r.stats.restored }));
    if (r.name) parts.push(t('imp.name', { name: r.name }));
    okEl.textContent = t('imp.detected') + parts.join(' · ')
      + (r.stats.unknown.length
        ? t('imp.unknown', { list: r.stats.unknown.join(', ') })
        : '');
    okEl.hidden = false;

    usePal.disabled = !r.stats.paletteCount;
    $('import-use-palette-label').classList.toggle('is-disabled', !r.stats.paletteCount);
    return r;
  };

  $('import-btn').addEventListener('click', () => {
    ta.value = '';
    setError('');
    okEl.hidden = true;
    usePal.checked = true;
    usePal.disabled = false;
    overlay.classList.add('open');
    ta.focus();
  });

  $('import-modal-cancel').addEventListener('click', close);
  // Kein Schließen per Klick daneben — ein Fehlklick (oder Text markieren und
  // außerhalb loslassen) soll die Eingaben nicht verwerfen. Abbrechen oder Esc.
  ta.addEventListener('input', preview);

  // Datei einlesen → landet im Textfeld, dann läuft der normale Weg.
  $('import-file-btn').addEventListener('click', () => fileInp.click());
  fileInp.addEventListener('change', e => {
    const file = e.target.files[0];
    fileInp.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { ta.value = ev.target.result; preview(); };
    reader.onerror = () => setError(t('file.readFailed'));
    reader.readAsText(file);
  });

  // Gemeinsamer Pfad für "in aktuellen Sprite" und "als neuen Sprite".
  const doImport = asNew => {
    const r = preview();
    if (!r) { if (!ta.value.trim()) setError(t('imp.nothing')); return; }

    // Palette anlegen (falls gewünscht und vorhanden).
    let palName = null;
    if (usePal.checked && r.palette) {
      palName = createPaletteFromImport(r.palette, r.name ? r.name.toLowerCase() : 'import');
      // JSON (Spiel): Materialien gehören zur Palette.
      if (palName && r.materials) paletteMaterials[palName] = { ...r.materials };
    }

    // Frames samt Dauer. Sind alle gleich lang, wird daraus die fps-Zahl.
    const durs = r.durations || [];
    const same = durs.length && durs.every(d => d === durs[0]);
    const fps = same ? Math.round(1000 / durs[0]) : undefined;
    const frames = (r.frames || [r.grid]).map((grid, i) => ({ grid, dur: same ? 0 : durs[i] || 0 }));

    stopPlayback();
    if (asNew || !getSprite()) {
      const id = createSprite({
        name: r.name || t('imp.fallbackName'),
        palette: palName || getSprite()?.palette || DEFAULT_PALETTE,
        frames,
        fps,
      });
      state.curSprite = id;
      clearHistory(); // frischer Sprite → alte Undo-Einträge sind bedeutungslos
    } else {
      // Ersetzt den ganzen Sprite — Frames UND Ebenen. Undo holt alles zurück.
      const sp = getSprite();
      recordOp(() => {
        sp.frames = frames.map(f => ({ cels: [f.grid], dur: f.dur }));
        sp.layers = [defaultLayer(1)];
        sp.layer = 0;
        sp.frame = 0;
        if (fps) sp.fps = Math.max(1, Math.min(60, fps));
        if (palName) sp.palette = palName;
      });
    }

    close();
    renderAll();
    saveState();
    showInfoToast(palName ? t('imp.doneWithPal', { name: palName }) : t('imp.donePlain'));
  };

  $('import-modal-current').addEventListener('click', () => doImport(false));
  $('import-modal-new').addEventListener('click', () => doImport(true));
}

// ────────────────────────────────────────────────────────────────────
// UI aus dem geladenen State initial synchronisieren
// ────────────────────────────────────────────────────────────────────
function syncUiFromState() {
  $('cell-size').value = state.cellSize;
  $('cell-size-val').textContent = state.cellSize + 'px';
  $('strength-slider').value = state.brushStrength;
  $('strength-val').textContent = state.brushStrength + '%';
  $('tolerance-slider').value = state.wandTolerance;
  $('tolerance-val').textContent = state.wandTolerance + '%';
  $('bg-dark-btn').classList.toggle('is-active', state.editorBg === 'dark');
  $('bg-bw-btn').classList.toggle('is-active', state.editorBg === 'bw');
  document.querySelectorAll('.brush-sz').forEach(b =>
    b.classList.toggle('is-active', Number(b.dataset.size) === state.brushSize));
  const fmtSel = $('output-format');
  if (fmtSel) { fmtSel.value = state.outputFormat; syncFormatUI(); }
  $('shape-fill-btn').classList.toggle('is-active', state.shapeFill);
  $('shape-fill-btn').setAttribute('aria-pressed', String(state.shapeFill));
  updateMirrorUI();
  syncImagePanel();
  updateToolUI();
}

// ────────────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────
// Sprachwechsel im laufenden Betrieb
// ────────────────────────────────────────────────────────────────────
// Das statische DOM hat i18n.js schon umgestellt; hier kommt alles nach,
// was JavaScript selbst schreibt. Der Sprite-Zustand wird dabei nicht
// angefasst — es wird nur neu beschriftet und neu gezeichnet.
function relabelUi() {
  syncPanelTitles();
  syncFullscreenBtn();
  syncFormatUI();
  syncSaveDirBtn();
  syncImagePanel();
  updateToolUI();
  renderAll();
  info(''); // die alte Statuszeile stünde sonst in der alten Sprache da
}

function init() {
  // Zuerst übersetzen: der Body ist so lange versteckt (siehe editor.html).
  applyStatic();
  initLangSwitch();
  onLangChange(relabelUi);

  const loaded = loadState();

  // Leeres Projekt (erster Start oder Migration hat nichts gerettet) →
  // ein Sprite anlegen, damit der Editor nie ins Leere zeigt.
  if (!Object.keys(sprites).length) createDefaultSprite();
  if (!state.curSprite) state.curSprite = Object.keys(sprites)[0];

  applyIcons();
  initPanels();
  initDock();
  initLayout();
  initTopbar();
  initToolbar();
  initPalettePanel();
  initFreeColors();
  initReduceModal();
  initShowColor();
  initImagePanel();
  initRotateSlider();
  initCleanupPanel();
  initTemplate();
  initTemplatePanel();
  initNewSpriteModal();
  initRenameModal();
  initSizeModal();
  initPaletteModal();
  initExport();
  initFrames();
  initLayers();   // nach initFrames: hängt sich an dessen Zeichen-Callback
  initOutputPanel();
  initImport();
  initCanvasEvents();
  initPan();
  initPinch();
  initKeyboardEvents();

  $('sprite-search').addEventListener('input', renderSpriteList);

  syncUiFromState();
  renderAll();
  syncHistoryButtons();

  if (loaded.fullscreen) enterFullscreen();
  if (loaded.note) showInfoToast(loaded.note);
  // Gespeicherter Stand war unlesbar: er liegt gesichert daneben und wird
  // nicht überschrieben. Gleich zum Herunterladen anbieten.
  if (loaded.rescued) showConfirmToast(t('store.rescued'), () => downloadBackup('rescue'), t('help.backupDownload'));
}

// Hilfe → Sicherung: Zeilen nur für vorhandene Sicherungen, mit Datum.
function syncBackupRows() {
  const info = backupInfo();
  const fmt = d => d.toLocaleString(getLang() === 'en' ? 'en-GB' : 'de-AT', { dateStyle: 'medium', timeStyle: 'short' });
  for (const k of ['backup', 'rescue']) {
    $(`backup-row-${k}`).hidden = !info[k];
    if (info[k]) $(`backup-label-${k}`).textContent = t(`help.backupLabel.${k}`, { date: fmt(info[k]) });
  }
  $('backup-none').hidden = !!(info.backup || info.rescue);
}

init();
