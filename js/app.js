// ════════════════════════════════════════════════════════════════════
// APP — Haupt-Entry: Init + Event-Bindings + Wiring zwischen Modulen
// ════════════════════════════════════════════════════════════════════
import {
  state, sprites, customPalettes, selection,
  getGrid, getSprite, getPal, getMaxIdx, getPaletteName, listSprites,
  createSprite, uniquePaletteName, clearSelection, isInSelection,
} from './state.js';
import { COLOR_LABELS_SHORT, DEFAULT_PALETTE } from './data.js';
import { showConfirmToast, showInfoToast } from './toast.js';
import {
  renderAll, renderEditor, renderSpriteList, syncColorActive, updateOutput,
  cellFromEvent, cellFromEventClamped, cellToColor, paintCell, paintBrush, paintSpray, floodFill,
  fillPaletteSelect, renderCallbacks, shapeCells, commitShape,
} from './render.js';
import {
  saveState, loadState, clearStorage, forceSaveBeforeUnload, saveToFile, loadFromFile,
} from './storage.js';
import { supportsFsAccess, pickSaveDirectory, getStoredDirName, saveBlob } from './filesystem.js';
import {
  initNewSpriteModal, initRenameModal, openRenameModal,
  selectSprite, deleteSprite, duplicateSprite, createDefaultSprite, clearCurrentGrid,
} from './sprites.js';
import {
  openPaletteModal, initPaletteModal, deleteCustomPalette,
  applyPaletteToCurrentSprite, forkCurrentPalette, createPaletteFromImport,
} from './palettes.js';
import {
  initTemplate, tplLoaded, tplHasOffscreen,
  startTplDrag, tplDragging, updateTplDrag, endTplDrag, getTplOffset,
  doTemplatePipette, sampleTemplateGrid,
} from './template.js';
import {
  medianCut, nearestColor, rgbToHex, hexToRgb,
  despeckleGrid, outlineGrid, magicWandDelete, autoRemoveBackground,
} from './spritefx.js';
import { initExport } from './export.js';
import { parseTsSprite } from './tsimport.js';
import { CODE_FORMATS, getFormat, codeFilename } from './codegen.js';
import {
  beginStroke, commitStroke, recordOp, undo, redo,
  canUndo, canRedo, clearHistory, historyCallbacks,
} from './history.js';
import {
  startMarquee, updateMarquee, startLasso, updateLasso, startMove, updateMove,
  endSelectionPointer, selectByColor, fillSelection, commitFloat, isFloating,
  selectAll, deselect, nudgeSelection, selectionInfo,
  copySelection, cutSelection, pasteClipboard, deleteSelection, hasClipboard,
} from './selection.js';
import {
  flip, rotate90, trimToContent, centerContent, resizeCanvas, scaleSprite, scopeLabel,
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
  renderRefSelect(); // der neue aktive Sprite fällt als Ebene raus
};
renderCallbacks.onRenameSprite     = openRenameModal;
renderCallbacks.onDuplicateSprite  = duplicateSprite;
renderCallbacks.onOpenPaletteModal = openPaletteModal;
renderCallbacks.onEditPalette      = openPaletteModal;
renderCallbacks.onImageToPalette   = imageToPalette;

renderCallbacks.onDeleteSprite = id => {
  const name = sprites[id]?.name || id;
  showConfirmToast(`Sprite „${name}“ wirklich löschen?`, () => deleteSprite(id));
};

renderCallbacks.onDeletePalette = name => {
  const used = Object.values(sprites).filter(s => s.palette === name).length;
  const extra = used ? ` ${used} Sprite${used === 1 ? '' : 's'} nutzen sie gerade.` : '';
  showConfirmToast(`Palette „${name}“ wirklich löschen?${extra}`, () => deleteCustomPalette(name));
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
historyCallbacks.onRestore = () => { clearSelection(); renderAll(); saveState(); };

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
  if (!getSprite()) { showInfoToast('Erst einen Sprite anlegen.'); return; }
  if (!tplLoaded() || !tplHasOffscreen()) { showInfoToast('Erst eine Schablone laden.'); return; }

  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const sampled = sampleTemplateGrid(W, H);
  if (!sampled) { showInfoToast('Schablone konnte nicht abgetastet werden.'); return; }

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
    if (!qpal.length) { showInfoToast('Keine Farben in der Schablone gefunden.'); return; }
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
  const lbl = mode === 'palette' ? 'Palette' : mode === 'quantize' ? `${qpal.length} Farben` : 'Rohfarben';
  showInfoToast(painted
    ? `Schablone übernommen — ${painted} Pixel (${lbl}).`
    : 'Keine Pixel geändert — Schablone über dem Grid positionieren?');
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

function imageToPalette() {
  const sp = getSprite();
  if (!sp) { showInfoToast('Erst einen Sprite anlegen.'); return; }

  const grid = sp.grid;
  const pal  = getPal(); // aktuelle (alte) Palette zum Auflösen der Indizes
  const cap  = getMaxIdx();
  const H = grid.length, W = grid[0].length;

  const px = [];
  const distinct = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const hex = cellToColor(grid[y][x], pal);
    if (!hex) continue;
    distinct.add(hex.toLowerCase());
    px.push(hexToRgb(hex));
  }
  if (!px.length) {
    showInfoToast('Das Bild ist leer — erst malen oder eine Schablone übernehmen.');
    return;
  }

  // ≤ Kapazität → Farben 1:1, sonst auf dominante Töne reduzieren.
  const colors = distinct.size <= cap ? [...distinct].map(hexToRgb) : medianCut(px, cap);
  // Hell → dunkel sortieren, damit Index 1 der hellste Ton ist.
  const lum = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  colors.sort((a, b) => lum(b) - lum(a));

  const name = uniquePaletteName('foto');
  const palObj = {};
  colors.forEach((c, i) => { palObj[i + 1] = rgbToHex(c.r, c.g, c.b); });
  customPalettes[name] = palObj;

  // Grid auf die neuen Indizes umschreiben.
  recordOp(() => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const hex = cellToColor(grid[y][x], pal);
      grid[y][x] = hex ? nearestRgbIndex(hexToRgb(hex), colors) : 0;
    }
  });

  sp.palette = name;
  renderAll();
  saveState();
  showInfoToast(`Palette „${name}“ erstellt — ${colors.length} Farben. Rechts direkt editierbar, das Bild färbt sich live um.`);
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
  if (!isSelectTool(tool) && isSelectTool(state.tool)) clearSelection();
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
    ? 'Symmetrie aus'
    : `Symmetrie: ${state.mirror === 'both' ? 'beide Achsen' : state.mirror === 'x' ? 'senkrechte Achse' : 'waagerechte Achse'}`);
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

const SHAPE_LABELS = { line: 'Linie', rect: 'Rechteck', ellipse: 'Ellipse' };

// Statuszeile unter dem Canvas.
function info(msg) {
  const el = $('info-bar');
  if (el) el.textContent = msg;
}

function initCanvasEvents() {
  const canvas = $('editor-canvas');

  canvas.addEventListener('pointerdown', e => {
    // Pointer einfangen → move/up feuern weiter, auch außerhalb des Canvas.
    try { canvas.setPointerCapture(e.pointerId); } catch {}

    // ── Rechtsklick ──
    if (e.button === 2) {
      e.preventDefault();
      if (e.shiftKey && tplLoaded() && tplHasOffscreen()) {
        const r = doTemplatePipette(e);
        if (r.status === 'outside')          info('Schablone: außerhalb des Bildes geklickt');
        else if (r.status === 'transparent') info('Schablone: transparenter Bereich');
        else                                 info(`Schablonen-Pipette: ${r.hex}`);
      } else {
        commitFloat(); // sonst radiert man in ein Loch, unter dem noch etwas hängt
        state.isErasing = true;
        beginStroke();
        eraseAt(e);
      }
      return;
    }

    if (e.button !== 0) return; // Mittelklick ignorieren
    e.preventDefault();

    // ── Shift+Links mit Schablone = verschieben ──
    if (e.shiftKey && tplLoaded()) { startTplDrag(e); return; }

    // ── Auswahl anfassen (vor der Pipette, damit Alt+Ziehen kopiert) ──
    if (isSelectTool(state.tool)) {
      const c = cellFromEventClamped(e);
      if (isInSelection(c.x, c.y)) {
        startMove(e, e.altKey);
        info(selectionInfo(e.altKey ? 'Kopie ziehen' : 'Verschieben'));
        return;
      }
    }

    // ── Alt+Links = Pipette auf das Grid ──
    if (e.altKey) {
      const c = cellFromEvent(e);
      if (c) {
        state.curColor = getGrid()[c.y][c.x];
        syncColorActive();
        const v = state.curColor;
        info(typeof v === 'string'
          ? `Pipette: freie Farbe ${v}`
          : `Pipette: Index ${v} — ${COLOR_LABELS_SHORT[v] || ''}`);
      }
      return;
    }

    // ── Auswahl aufziehen / lassoen / nach Farbe wählen ──
    if (state.tool === 'select') {
      startMarquee(e);
      info(selectionInfo('Aufziehen'));
      return;
    }
    if (state.tool === 'lasso') {
      startLasso(e);
      info('Form umfahren — Loslassen schließt sie');
      return;
    }
    if (state.tool === 'magic') {
      const n = selectByColor(e);
      updateSelectionUI();
      info(n ? `Farbauswahl: ${n} Pixel${selection.rect ? ' · ' + selectionInfo() : ''}`
             : 'Farbauswahl: nichts getroffen — Toleranz erhöhen?');
      return;
    }

    // ── Formen: Startpunkt merken, gezeichnet wird beim Loslassen ──
    if (isShapeTool(state.tool)) {
      const c = cellFromEventClamped(e);
      shapeStart = c;
      state.shape.color = state.curColor;
      state.shape.cells = shapeCells(state.tool, c, c);
      renderEditor();
      info(`${SHAPE_LABELS[state.tool]} ziehen — Start (${c.x}, ${c.y})`);
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
        info(removed ? `Zauberstab: ${removed} Pixel gelöscht` : 'Zauberstab: nichts gelöscht — Toleranz erhöhen?');
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
      info(`Schablone verschieben: x=${o.x}px y=${o.y}px`);
      return;
    }

    if (selection.mode === 'marquee') { updateMarquee(e); info(selectionInfo('Aufziehen')); return; }
    if (selection.mode === 'lasso')   { updateLasso(e);   info(selectionInfo()); return; }
    if (selection.mode === 'move')    { updateMove(e);    info(selectionInfo('Verschieben')); return; }

    if (shapeStart) {
      const c = cellFromEventClamped(e);
      state.shape.cells = shapeCells(state.tool, shapeStart, c);
      renderEditor();
      const w = Math.abs(c.x - shapeStart.x) + 1, h = Math.abs(c.y - shapeStart.y) + 1;
      info(`${SHAPE_LABELS[state.tool]} ${w}×${h} — ${state.shape.cells.length} Pixel`);
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
    const val = typeof cur === 'string' ? cur : `Index ${cur}`;
    info(e.altKey
      ? `Pipette — (${c.x}, ${c.y}) · ${val}`
      : `(${c.x}, ${c.y}) · ${val}`
        + (state.isDrawing ? ' → malen' : '')
        + (state.isErasing ? ' → löschen' : ''));
    if (state.isDrawing && !e.altKey) applyTool(c.x, c.y);
    if (state.isErasing) eraseAt(e);
  });

  const endPointer = () => {
    if (tplDragging()) endTplDrag();
    if (shapeStart) {
      shapeStart = null;
      let n = 0;
      recordOp(() => { n = commitShape(); });
      info(n ? `${n} Pixel gezeichnet` : 'Nichts gezeichnet');
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
  $('editor-canvas-area').addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 1 : -1;
    const next = Math.max(2, Math.min(40, state.cellSize + step));
    if (next === state.cellSize) return;
    state.cellSize = next;
    $('cell-size').value = next;
    $('cell-size-val').textContent = next + 'px';
    renderEditor();
    saveState();
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
      if (isRotating()) { stopRotating(false); info('Drehung verworfen'); return; }
      if (shapeStart || state.shape.cells.length) {
        shapeStart = null;
        state.shape.cells = [];
        renderEditor();
        info('Form verworfen');
        return;
      }
      if (deselect()) { updateSelectionUI(); info('Auswahl aufgehoben'); return; }
      if (document.body.classList.contains('editor-fullscreen')) { exitFullscreen(); return; }
    }
    if (e.key === 'Alt') $('editor-canvas-wrap').classList.add('is-eyedrop');

    // Undo/Redo — auch bei Fokus außerhalb von Formularfeldern.
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); stopRotating(false); commitFloat(); undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); stopRotating(false); commitFloat(); redo(); return; }
    }

    if (e.key === 'Enter' && isRotating() && !isTypingTarget(e.target)) {
      stopRotating(true);
      info('Drehung übernommen');
      return;
    }

    if (isTypingTarget(e.target) || anyModalOpen()) return;

    // ── Auswahl: Zwischenablage ──
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'a') {
        e.preventDefault();
        setTool('select'); selectAll(); updateSelectionUI();
        info(selectionInfo('Alles gewählt'));
      } else if (k === 'c' && selection.rect) {
        e.preventDefault();
        info(`${copySelection()} Pixel in die Zwischenablage kopiert`);
        updateSelectionUI();
      } else if (k === 'x' && selection.rect) {
        e.preventDefault();
        info(`Ausgeschnitten — ${cutSelection()} Pixel. Mit Strg+V wieder einfügen.`);
        updateSelectionUI();
      } else if (k === 'v') {
        e.preventDefault();
        if (!hasClipboard()) info('Zwischenablage ist leer — erst kopieren oder ausschneiden.');
        else {
          setTool('select');
          info(`Eingefügt — ${pasteClipboard()} Pixel. Zum Verschieben hineinziehen.`);
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
        info(selectionInfo('Verschoben'));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        info(`Auswahl geleert — ${deleteSelection()} Pixel`);
        return;
      }
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
function initPanels() {
  document.querySelectorAll('[data-panel] .panel-toggle').forEach(btn => {
    const panel = btn.closest('[data-panel]');
    const sync = () => {
      const collapsed = panel.classList.contains('collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
      btn.title = collapsed ? 'Aufklappen' : 'Zuklappen';
    };
    btn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      sync();
      saveState();
    });
    sync();
  });
}

// ────────────────────────────────────────────────────────────────────
// Vollbild
// ────────────────────────────────────────────────────────────────────
function enterFullscreen() {
  document.body.classList.add('editor-fullscreen');
  $('fullscreen-btn').textContent = '⤡ Beenden';
  $('fullscreen-btn').title = 'Vollbild verlassen (Esc)';
}

function exitFullscreen() {
  document.body.classList.remove('editor-fullscreen');
  $('fullscreen-btn').textContent = '⤢ Vollbild';
  $('fullscreen-btn').title = 'Vollbild (Esc zum Schließen)';
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

  const selAction = (id, fn) => $(id).addEventListener('click', () => { fn(); updateSelectionUI(); });
  selAction('sel-all-btn',    () => { selectAll(); info(selectionInfo('Alles gewählt')); });
  selAction('sel-cut-btn',    () => { info(`Ausgeschnitten — ${cutSelection()} Pixel`); });
  selAction('sel-copy-btn',   () => { info(`${copySelection()} Pixel kopiert`); });
  selAction('sel-paste-btn',  () => { info(`Eingefügt — ${pasteClipboard()} Pixel. Zum Verschieben hineinziehen.`); });
  selAction('sel-delete-btn', () => { info(`Auswahl geleert — ${deleteSelection()} Pixel`); });
  selAction('sel-fill-btn',   () => { info(`Auswahl gefüllt — ${fillSelection()} Pixel`); });
  selAction('sel-none-btn',   () => { deselect(); info('Auswahl aufgehoben'); });

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
function initPalettePanel() {
  const sel = $('palette-select');
  sel.addEventListener('change', () => {
    if (sel.value) applyPaletteToCurrentSprite(sel.value);
  });

  const search = $('palette-search');
  search.addEventListener('input', () => fillPaletteSelect(sel, getPaletteName(), search.value));

  $('palette-add-btn').addEventListener('click', () => openPaletteModal());
  $('palette-fork-btn').addEventListener('click', forkCurrentPalette);
  $('palette-edit-btn').addEventListener('click', () => openPaletteModal(getPaletteName()));
  $('palette-del-btn').addEventListener('click', () => renderCallbacks.onDeletePalette(getPaletteName()));
  $('palette-from-image-btn').addEventListener('click', imageToPalette);

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
// Referenz-Ebene — zweiter Sprite als Vorlage
// ────────────────────────────────────────────────────────────────────
// Bearbeitet wird immer nur der aktive Sprite. Die Ebene liegt bloß darunter
// (oder darüber) und hilft beim Abpausen und beim Übertragen von Teilen.
function renderRefSelect() {
  const sel = $('ref-select');
  if (!sel) return;
  const others = listSprites().filter(sp => sp.id !== state.curSprite);

  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = others.length ? 'keine' : 'kein zweiter Sprite';
  sel.appendChild(none);

  for (const sp of others) {
    const o = document.createElement('option');
    o.value = sp.id;
    o.textContent = `${sp.name} (${sp.grid[0].length}×${sp.grid.length})`;
    if (sp.id === state.refSprite) o.selected = true;
    sel.appendChild(o);
  }
  sel.disabled = !others.length;

  const active = !!state.refSprite && state.refSprite !== state.curSprite;
  $('ref-controls').hidden = !active;
  $('ref-note').hidden = !active;
  $('ref-visible-btn').classList.toggle('is-off', !state.refVisible);
  $('ref-visible-btn').setAttribute('aria-pressed', String(state.refVisible));
  $('ref-front-btn').classList.toggle('is-active', state.refFront);
  $('ref-front-btn').setAttribute('aria-pressed', String(state.refFront));
  $('ref-front-btn').textContent = state.refFront ? 'davor' : 'dahinter';
  $('ref-opacity').value = Math.round(state.refOpacity * 100);
}

function initRefLayer() {
  $('ref-select').addEventListener('change', () => {
    state.refSprite = $('ref-select').value || null;
    renderRefSelect();
    renderEditor();
    saveState();
    const sp = state.refSprite ? sprites[state.refSprite] : null;
    info(sp ? `Ebene: „${sp.name}“ liegt ${state.refFront ? 'darüber' : 'darunter'}` : 'Ebene aus');
  });

  $('ref-visible-btn').addEventListener('click', () => {
    state.refVisible = !state.refVisible;
    renderRefSelect();
    renderEditor();
    saveState();
  });

  $('ref-front-btn').addEventListener('click', () => {
    state.refFront = !state.refFront;
    renderRefSelect();
    renderEditor();
    saveState();
  });

  $('ref-opacity').addEventListener('input', () => {
    state.refOpacity = Number($('ref-opacity').value) / 100;
    renderEditor();
  });
  $('ref-opacity').addEventListener('change', saveState);

  // Rollentausch: der bearbeitete Sprite wird zur Ebene und umgekehrt.
  // Damit lässt sich zwischen zwei Sprites hin- und herarbeiten.
  $('ref-swap-btn').addEventListener('click', () => {
    const other = state.refSprite;
    if (!other || !sprites[other]) return;
    stopRotating(true);
    commitFloat();
    const previous = state.curSprite;
    state.refSprite = previous;
    selectSprite(other);
    renderRefSelect();
    info(`Getauscht — „${sprites[other].name}“ wird bearbeitet, „${sprites[previous].name}“ liegt als Ebene`);
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
      info(`${r.scope} um ${deg}° gedreht — ${r.w}×${r.h}` +
        (r.scope === 'Sprite' ? ' · Ecken außerhalb der Fläche fallen weg' : ' · Übernehmen oder Verwerfen'));
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
    if (scope) info(`${scope} gedreht — übernommen`);
    reset();
    updateSelectionUI();
  });
  $('rotate-cancel-btn').addEventListener('click', () => {
    if (cancelFreeRotate()) info('Drehung verworfen');
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
    if (scope) info(`${scope} waagerecht gespiegelt`);
    syncImagePanel();
  });
  $('flip-v-btn').addEventListener('click', () => {
    const scope = flip('v');
    if (scope) info(`${scope} senkrecht gespiegelt`);
    syncImagePanel();
  });
  $('rotate-btn').addEventListener('click', () => {
    const scope = rotate90();
    if (scope) info(`${scope} um 90° gedreht`);
    syncImagePanel();
  });

  $('trim-btn').addEventListener('click', () => {
    const r = trimToContent();
    if (!r) return;
    showInfoToast(r.ok ? `Zugeschnitten auf ${r.w}×${r.h}.` : `Nicht zugeschnitten — ${r.reason}.`);
    syncImagePanel();
  });
  $('center-btn').addEventListener('click', () => {
    const r = centerContent();
    if (!r) return;
    showInfoToast(r.ok ? 'Inhalt mittig gesetzt.' : `Nicht verschoben — ${r.reason}.`);
  });

  $('resize-btn').addEventListener('click', () => {
    const w = Number($('resize-w').value);
    const h = Number($('resize-h').value);
    const anchor = $('resize-anchor').value;
    const apply = () => {
      const r = resizeCanvas(w, h, anchor);
      if (!r) return;
      showInfoToast(r.ok
        ? `Größe jetzt ${r.w}×${r.h}${r.lost ? ` — ${r.lost} Pixel abgeschnitten` : ''}.`
        : `Größe unverändert — ${r.reason}.`);
      syncImagePanel();
    };
    // Verkleinern kann Pixel kosten — vorher fragen.
    const sp = getSprite();
    if (sp && (w < sp.grid[0].length || h < sp.grid.length)) {
      showConfirmToast('Kleiner machen? Was nicht mehr hineinpasst, wird abgeschnitten.', apply, 'Ändern');
    } else apply();
  });

  $('scale-up-btn').addEventListener('click', () => {
    const r = scaleSprite(2);
    if (r) showInfoToast(r.ok ? `Auf ${r.w}×${r.h} vergrößert.` : `Nicht skaliert — ${r.reason}.`);
    syncImagePanel();
  });
  $('scale-down-btn').addEventListener('click', () => {
    showConfirmToast('Halbieren? Jedes zweite Pixel fällt weg.', () => {
      const r = scaleSprite(0.5);
      if (r) showInfoToast(r.ok ? `Auf ${r.w}×${r.h} verkleinert.` : `Nicht skaliert — ${r.reason}.`);
      syncImagePanel();
    }, 'Halbieren');
  });
}

// ────────────────────────────────────────────────────────────────────
// Aufräumen-Panel
// ────────────────────────────────────────────────────────────────────
function initCleanupPanel() {
  $('bg-remove-btn').addEventListener('click', () => {
    const tol = Number($('bg-tolerance').value) || 25;
    let n = 0;
    recordOp(() => { n = autoRemoveBackground(getGrid(), getPal(), tol); });
    if (n) renderAll();
    showInfoToast(n ? `Hintergrund entfernt — ${n} Pixel.` : 'Nichts entfernt — Toleranz erhöhen?');
  });

  $('despeckle-btn').addEventListener('click', () => {
    let n = 0;
    recordOp(() => { n = despeckleGrid(getGrid()); });
    if (n) renderAll();
    showInfoToast(n ? `Geglättet — ${n} Pixel angepasst.` : 'Nichts zu glätten gefunden.');
  });

  $('outline-btn').addEventListener('click', () => {
    const col = $('outline-color').value;
    const th  = Number($('outline-thickness').value) || 1;
    let n = 0;
    recordOp(() => { n = outlineGrid(getGrid(), col, th); });
    if (n) renderAll();
    showInfoToast(n ? `Outline gezeichnet — ${n} Pixel.` : 'Keine Outline nötig — Sprite leer?');
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
function initTopbar() {
  const saveDirBtn = $('save-dir-btn');
  if (!supportsFsAccess()) {
    saveDirBtn.hidden = true; // Browser ohne API → Download-Fallback
  } else {
    const refresh = name => {
      saveDirBtn.title = name
        ? `Speicherort: ${name} — klicken zum Ändern`
        : 'Speicherort für PNG/PDF/Dateien wählen — wird gemerkt';
      saveDirBtn.classList.toggle('is-set', !!name);
    };
    getStoredDirName().then(refresh);
    saveDirBtn.addEventListener('click', async () => {
      const dir = await pickSaveDirectory();
      if (dir) {
        refresh(dir.name);
        showInfoToast(`Speicherort gesetzt: „${dir.name}“. PNG, PDF und Dateien landen ab jetzt hier.`);
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
    showConfirmToast('Alles zurücksetzen? Sprites und eigene Paletten gehen verloren.',
      clearStorage, 'Zurücksetzen');
  });

  const help = $('help-modal-overlay');
  $('help-btn').addEventListener('click', () => help.classList.add('open'));
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
    try {
      await navigator.clipboard.writeText(ta.value);
    } catch {
      // Clipboard-API kann blockiert sein (kein HTTPS o.ä.) — Auswahl als Fallback.
      ta.select();
      showInfoToast('Zwischenablage nicht verfügbar — Text ist markiert, mit Strg+C kopieren.');
      return;
    }
    const label = btn.textContent;
    btn.textContent = '✓ Kopiert';
    btn.classList.add('is-ok');
    setTimeout(() => { btn.textContent = label; btn.classList.remove('is-ok'); }, 1600);
  });

  $('save-code-btn').addEventListener('click', async () => {
    if (!getSprite()) return;
    const fmt = getFormat(state.outputFormat);
    const filename = codeFilename(state.outputFormat);
    const blob = new Blob([$('output-textarea').value], { type: `${fmt.mime};charset=utf-8` });
    const result = await saveBlob(blob, filename);
    showInfoToast(result.fallback
      ? `„${filename}“ wurde heruntergeladen (Standard-Download-Ordner).`
      : `„${filename}“ gespeichert${result.dir ? ` in „${result.dir}“` : ''}.`);
  });

  $('clear-grid-btn').addEventListener('click', () => {
    if (!getSprite()) return;
    stopRotating(false);
    commitFloat();
    showConfirmToast('Alle Pixel dieses Sprites löschen?', () => {
      recordOp(clearCurrentGrid);
      renderAll();
      saveState();
    }, 'Leeren');
  });
}

// ────────────────────────────────────────────────────────────────────
// Ausgabeformat des Code-Felds
// ────────────────────────────────────────────────────────────────────
const FORMAT_HINTS = {
  ts:   'number[][] mit Typen — der Klassiker für TypeScript-Projekte.',
  js:   'Dasselbe ohne Typen, als ES-Modul.',
  json: 'Sprachneutral — für eigene Pipelines, Engines und Tools.',
  svg:  'Fertige Vektorgrafik: skaliert verlustfrei, direkt einbindbar.',
  css:  'Ein einziges Element, per box-shadow gepixelt — braucht kein Bild.',
  c:    'Palette + Indizes als uint8-Array — für Mikrocontroller und LED-Matrizen.',
  py:   'Dict + Liste — für Pygame, Pillow oder eigene Skripte.',
  txt:  'Zeichenraster mit Legende — gut für Diffs, Doku und schnelles Draufschauen.',
};

function syncFormatUI() {
  const fmt = getFormat(state.outputFormat);
  $('save-code-btn').textContent = `.${fmt.ext} speichern`;
  $('save-code-btn').title = `Als ${fmt.label}-Datei speichern`;

  // Die Palette-Option gibt es nur, wo sie etwas ändert — bei SVG, CSS und
  // Text stecken die Farben ohnehin direkt im Ergebnis.
  $('include-palette-label').hidden = !fmt.palOption;

  const hint = FORMAT_HINTS[state.outputFormat] || '';
  $('output-format-hint').textContent = fmt.reimport
    ? `${hint} Lässt sich wieder importieren.`
    : hint;
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

    const parts = [`${r.stats.w}×${r.stats.h} Pixel`];
    if (r.stats.paletteCount) parts.push(`Palette mit ${r.stats.paletteCount} Farben`);
    else parts.push('keine Palette gefunden');
    if (r.stats.restored) parts.push(`${r.stats.restored} freie Farb-Pixel wiederhergestellt`);
    if (r.name) parts.push(`Name „${r.name}“`);
    okEl.textContent = 'Erkannt: ' + parts.join(' · ')
      + (r.stats.unknown.length
        ? ` — Achtung: Index ${r.stats.unknown.join(', ')} kommt im Grid vor, fehlt aber in der Palette.`
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
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  ta.addEventListener('input', preview);

  // Datei einlesen → landet im Textfeld, dann läuft der normale Weg.
  $('import-file-btn').addEventListener('click', () => fileInp.click());
  fileInp.addEventListener('change', e => {
    const file = e.target.files[0];
    fileInp.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { ta.value = ev.target.result; preview(); };
    reader.onerror = () => setError('Datei konnte nicht gelesen werden.');
    reader.readAsText(file);
  });

  // Gemeinsamer Pfad für "in aktuellen Sprite" und "als neuen Sprite".
  const doImport = asNew => {
    const r = preview();
    if (!r) { if (!ta.value.trim()) setError('Nichts eingefügt.'); return; }

    // Palette anlegen (falls gewünscht und vorhanden).
    let palName = null;
    if (usePal.checked && r.palette) {
      palName = createPaletteFromImport(r.palette, r.name ? r.name.toLowerCase() : 'import');
    }

    if (asNew || !getSprite()) {
      const id = createSprite({
        name: r.name || 'Import',
        palette: palName || getSprite()?.palette || DEFAULT_PALETTE,
        grid: r.grid,
      });
      state.curSprite = id;
      clearHistory(); // frischer Sprite → alte Undo-Einträge sind bedeutungslos
    } else {
      const sp = getSprite();
      recordOp(() => { sp.grid = r.grid; });
      if (palName) sp.palette = palName;
    }

    close();
    renderAll();
    saveState();
    showInfoToast(palName
      ? `Import fertig — Palette „${palName}“ übernommen und zugewiesen.`
      : 'Import fertig. (Keine Palette im Text gefunden — Farben bleiben wie eingestellt.)');
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
  renderRefSelect();
  updateToolUI();
}

// ────────────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────────────
function init() {
  const loaded = loadState();

  // Leeres Projekt (erster Start oder Migration hat nichts gerettet) →
  // ein Sprite anlegen, damit der Editor nie ins Leere zeigt.
  if (!Object.keys(sprites).length) createDefaultSprite();
  if (!state.curSprite) state.curSprite = Object.keys(sprites)[0];

  initPanels();
  initTopbar();
  initToolbar();
  initPalettePanel();
  initRefLayer();
  initImagePanel();
  initRotateSlider();
  initCleanupPanel();
  initTemplate();
  initTemplatePanel();
  initNewSpriteModal();
  initRenameModal();
  initPaletteModal();
  initExport();
  initOutputPanel();
  initImport();
  initCanvasEvents();
  initKeyboardEvents();

  $('sprite-search').addEventListener('input', renderSpriteList);

  syncUiFromState();
  renderAll();
  syncHistoryButtons();

  if (loaded.fullscreen) enterFullscreen();
  if (loaded.note) showInfoToast(loaded.note);
}

init();
