// ════════════════════════════════════════════════════════════════════
// APP — Haupt-Entry: Init + Event-Bindings + Wiring zwischen Modulen
// ════════════════════════════════════════════════════════════════════
import {
  state, sprites, customPalettes,
  getGrid, getSprite, getPal, getMaxIdx, getPaletteName,
  createSprite, uniquePaletteName,
} from './state.js';
import { COLOR_LABELS_SHORT, DEFAULT_PALETTE } from './data.js';
import { showConfirmToast, showInfoToast } from './toast.js';
import {
  renderAll, renderEditor, renderSpriteList, syncColorActive, updateOutput,
  cellFromEvent, cellToColor, paintCell, paintBrush, paintSpray, floodFill,
  fillPaletteSelect, renderCallbacks, tsIdentifier,
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
import {
  beginStroke, commitStroke, recordOp, undo, redo,
  canUndo, canRedo, clearHistory, historyCallbacks,
} from './history.js';

const $ = id => document.getElementById(id);

// ────────────────────────────────────────────────────────────────────
// Render-Callbacks (vermeidet Zirkularimporte render <-> Feature-Module)
// ────────────────────────────────────────────────────────────────────
renderCallbacks.onSave             = saveState;
renderCallbacks.onSelectSprite     = selectSprite;
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
historyCallbacks.onRestore = () => { renderAll(); saveState(); };

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

function setTool(tool) {
  state.tool = tool;
  updateToolUI();
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
  const isWand  = state.tool === 'wand';
  $('brush-size-group').hidden = !hasSize;
  $('strength-group').hidden   = !hasSize;
  $('tolerance-group').hidden  = !isWand;
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

function initCanvasEvents() {
  const canvas = $('editor-canvas');
  const infoBar = $('info-bar');
  const info = msg => { infoBar.textContent = msg; };

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

    updateBrushCursor(e);

    const c = cellFromEvent(e);
    if (!c) return;
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
    if (state.isDrawing || state.isErasing) commitStroke();
    state.isDrawing = false;
    state.isErasing = false;
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('pointerleave', () => { $('brush-cursor').hidden = true; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

// ────────────────────────────────────────────────────────────────────
// Tastatur
// ────────────────────────────────────────────────────────────────────
const TOOL_KEYS = { p: 'pencil', b: 'brush', s: 'spray', f: 'fill', e: 'eraser', w: 'wand' };

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
      if (document.body.classList.contains('editor-fullscreen')) { exitFullscreen(); return; }
    }
    if (e.key === 'Alt') $('editor-canvas-wrap').classList.add('is-eyedrop');

    // Undo/Redo — auch bei Fokus außerhalb von Formularfeldern.
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
    }

    if (isTypingTarget(e.target) || anyModalOpen()) return;

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

  $('undo-btn').addEventListener('click', () => undo());
  $('redo-btn').addEventListener('click', () => redo());

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

  window.addEventListener('beforeunload', forceSaveBeforeUnload);
}

// ────────────────────────────────────────────────────────────────────
// Code-Panel: kopieren, .ts speichern, Grid leeren
// ────────────────────────────────────────────────────────────────────
function initOutputPanel() {
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

  $('save-ts-btn').addEventListener('click', async () => {
    const sp = getSprite();
    if (!sp) return;
    const filename = `${tsIdentifier(sp.name)}.ts`;
    const blob = new Blob([$('output-textarea').value], { type: 'text/plain;charset=utf-8' });
    const result = await saveBlob(blob, filename);
    showInfoToast(result.fallback
      ? `„${filename}“ wurde heruntergeladen (Standard-Download-Ordner).`
      : `„${filename}“ gespeichert${result.dir ? ` in „${result.dir}“` : ''}.`);
  });

  $('clear-grid-btn').addEventListener('click', () => {
    if (!getSprite()) return;
    showConfirmToast('Alle Pixel dieses Sprites löschen?', () => {
      recordOp(clearCurrentGrid);
      renderAll();
      saveState();
    }, 'Leeren');
  });
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
