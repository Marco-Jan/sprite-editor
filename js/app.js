// ════════════════════════════════════════════════════════════════════
// APP — Haupt-Entry: Init + Event-Bindings + Wiring zwischen Modulen
// ════════════════════════════════════════════════════════════════════
import {
  state, grids, customMeta, customPalettes,
  getGrid, getMaxIdx, getPal, getVariants, getCurrentPalType,
} from './state.js';
import { showConfirmToast, showInfoToast } from './toast.js';
import { ORIG, dc, COLOR_LABELS } from './data.js';
import {
  renderAll, renderEditor, renderOverview, syncColorActive,
  cellFromEvent, cellToColor, paintCell, paintBrush, paintSpray, floodFill, renderCallbacks,
  updateOutput,
} from './render.js';
import {
  saveState, loadState, clearStorage, forceSaveBeforeUnload,
  saveToFile, loadFromFile,
} from './storage.js';
import { supportsFsAccess, pickSaveDirectory, getStoredDirName, saveBlob } from './filesystem.js';
import { addCustomTypeButton, initNewSpriteModal, deleteCustomSprite } from './sprites.js';
import { openPaletteModal, deleteCustomPalette, initPaletteModal } from './palettes.js';
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
import {
  beginStroke, commitStroke, recordOp, undo, redo,
  canUndo, canRedo, historyCallbacks,
} from './history.js';

// ────────────────────────────────────────────────────────────────────
// Render-Callbacks wiring (vermeidet Zirkularimporte render <-> features)
// ────────────────────────────────────────────────────────────────────
renderCallbacks.onSave = saveState;
renderCallbacks.onOpenPaletteModal = openPaletteModal;
renderCallbacks.onEditPalette = openPaletteModal;

renderCallbacks.onDeleteSprite = (key) => {
  const name = customMeta[key]?.name || key;
  showConfirmToast(`Sprite "${name}" wirklich löschen?`, () => deleteCustomSprite(key));
};

renderCallbacks.onDeletePalette = (type, variant) => {
  showConfirmToast(`Palette "${variant}" wirklich löschen?`, () => deleteCustomPalette(type, variant));
};

renderCallbacks.onImageToPalette = imageToPalette;

// ────────────────────────────────────────────────────────────────────
// History → UI: Button-State + Re-Render nach Undo/Redo
// ────────────────────────────────────────────────────────────────────
function syncHistoryButtons() {
  const u = document.getElementById('undo-btn');
  const r = document.getElementById('redo-btn');
  if (u) u.disabled = !canUndo();
  if (r) r.disabled = !canRedo();
}

// Wird nach jedem Undo/Redo aufgerufen — Sprite/State kann gewechselt haben.
function postHistoryAction() {
  // syncButtons() (Header-Aktiv-State) ist Teil von renderCallbacks im sprites-Modul;
  // hier reicht renderAll + saveState, weil renderAll auch Overview/Editor neu malt.
  renderAll();
  // Header-Type/State-Buttons aktiv setzen
  document.querySelectorAll('#type-btns .btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === state.curType));
  document.querySelectorAll('#state-btns .btn').forEach(b =>
    b.classList.toggle('active', b.dataset.state === state.curState));
  saveState();
}

historyCallbacks.onChange = syncHistoryButtons;

// ────────────────────────────────────────────────────────────────────
// SCHABLONE ÜBERNEHMEN — Auto-Trace ins Grid
// ────────────────────────────────────────────────────────────────────
// Findet den Palette-Index (1..maxIdx), dessen Farbe der RGB-Farbe c am
// nächsten liegt (euklidische Distanz im RGB-Raum).
function nearestPaletteIndex(c, pal, maxIdx) {
  let best = 1, bestD = Infinity;
  for (let i = 1; i <= maxIdx; i++) {
    const hex = pal[i];
    if (!hex) continue;
    const pr = parseInt(hex.slice(1, 3), 16);
    const pg = parseInt(hex.slice(3, 5), 16);
    const pb = parseInt(hex.slice(5, 7), 16);
    const d = (c.r - pr) ** 2 + (c.g - pg) ** 2 + (c.b - pb) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// mode 'palette'  → Farben auf aktuelle Palette einrasten (Export-tauglich)
// mode 'raw'      → freie Hex-Pixel (fotorealistisch, sehr viele Farben)
// mode 'quantize' → Farben per Median-Cut auf n dominante Töne reduzieren
// Pixel außerhalb der Schablone oder (fast) transparent bleiben unverändert.
const TRACE_ALPHA_MIN = 32; // Alpha-Schwelle: darunter gilt als transparent
function applyTemplateTrace(mode, n) {
  if (!tplLoaded() || !tplHasOffscreen()) {
    showInfoToast('Erst eine Schablone laden.');
    return;
  }
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const sampled = sampleTemplateGrid(W, H);
  if (!sampled) { showInfoToast('Schablone konnte nicht abgetastet werden.'); return; }

  const pal = getPal(state.curType, state.curVariant);
  const maxIdx = getMaxIdx();

  // Bei Quantisierung zuerst die reduzierte Palette aus allen opaken Pixeln bauen.
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
        if (!c || c.a < TRACE_ALPHA_MIN) continue; // außerhalb / transparent → unverändert
        let val;
        if (mode === 'palette')       val = nearestPaletteIndex(c, pal, maxIdx);
        else if (mode === 'quantize') { const q = nearestColor(c, qpal); val = rgbToHex(q.r, q.g, q.b); }
        else                          val = rgbToHex(c.r, c.g, c.b); // raw
        if (grid[y][x] !== val) { grid[y][x] = val; painted++; }
      }
    }
  });

  renderAll();
  const lbl = mode === 'palette' ? 'Palette'
            : mode === 'quantize' ? `${qpal.length} Farben` : 'Rohfarben';
  showInfoToast(
    painted
      ? `Schablone übernommen — ${painted} Pixel (${lbl}).`
      : 'Keine Pixel geändert — Schablone über dem Grid positionieren?'
  );
}

// ────────────────────────────────────────────────────────────────────
// BILD → PALETTE — aktuelle Bildfarben in eine editierbare Custom-Palette
// ────────────────────────────────────────────────────────────────────
// Eindeutigen Palette-Namen finden (foto, foto2, …) — kollidiert weder mit
// Built-in- noch mit bestehenden Custom-Varianten des Typs.
function uniquePaletteName(type, base) {
  const taken = new Set(getVariants(type));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(base + i)) i++;
  return base + i;
}

// Index (1-basiert) der nächstgelegenen Farbe aus einer {r,g,b}[]-Liste.
function nearestRgbIndex(rgb, list) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const d = (rgb.r - p.r) ** 2 + (rgb.g - p.g) ** 2 + (rgb.b - p.b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best + 1;
}

// Sammelt die Farben des aktuellen Bildes (Index→Hex aufgelöst, freie Hex direkt),
// legt daraus eine Custom-Palette an und schreibt das Grid auf deren Indizes um.
// Bei mehr Farben als die Palette fasst (maxIdx) wird per Median-Cut reduziert.
// Ergebnis: die Bildfarben stehen rechts und sind dort live editierbar.
function imageToPalette() {
  const grid = getGrid();
  const pal  = getPal(state.curType, state.curVariant); // aktuelle (alte) Palette zum Auflösen
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
    showInfoToast('Das Bild ist leer — erst eine Schablone übernehmen oder malen.');
    return;
  }

  // ≤ Kapazität → Farben 1:1 übernehmen, sonst auf dominante Töne reduzieren.
  let colors = distinct.size <= cap ? [...distinct].map(hexToRgb) : medianCut(px, cap);
  // Hell → dunkel sortieren, damit Index 1 der hellste Ton ist (wie bei den Fell-Tönen).
  const lum = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  colors.sort((a, b) => lum(b) - lum(a));

  // Custom-Palette anlegen (Indizes 1..N) — wird beim saveState mitgespeichert.
  const t = getCurrentPalType();
  const name = uniquePaletteName(state.curType, 'foto');
  const palObj = {};
  colors.forEach((c, i) => { palObj[i + 1] = rgbToHex(c.r, c.g, c.b); });
  customPalettes[t][name] = palObj;

  // Grid auf die neuen Indizes umschreiben (alte Farbe je Pixel → nächster Index).
  recordOp(() => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const hex = cellToColor(grid[y][x], pal);
      grid[y][x] = hex ? nearestRgbIndex(hexToRgb(hex), colors) : 0;
    }
  });

  state.curVariant = name;
  renderAll();
  saveState();
  showInfoToast(`Palette „${name}" erstellt — ${colors.length} Farben. Rechts direkt editierbar; das Bild aktualisiert sich live.`);
}

// ────────────────────────────────────────────────────────────────────
// Tool-Dispatch + UI-Sync
// ────────────────────────────────────────────────────────────────────
function applyTool(x, y) {
  if (state.tool === 'brush')  { paintBrush(x, y);  return; }
  if (state.tool === 'spray')  { paintSpray(x, y);  return; }
  if (state.tool === 'fill')   { floodFill(x, y);   return; }
  if (state.tool === 'eraser') {
    const prev = state.curColor; state.curColor = 0;
    paintBrush(x, y);
    state.curColor = prev; return;
  }
  paintCell(x, y); // pencil
}

function updateToolUI() {
  document.querySelectorAll('.tool-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tool === state.tool));
  document.getElementById('editor-canvas-wrap').dataset.tool = state.tool;

  const hasSize     = ['brush', 'spray', 'eraser'].includes(state.tool);
  const hasStrength = ['brush', 'spray', 'eraser'].includes(state.tool);
  const isWand      = state.tool === 'wand';
  document.getElementById('brush-size-wrap').style.display = hasSize ? '' : 'none';
  document.getElementById('tool-sliders').style.display    = (hasStrength || isWand) ? '' : 'none';
  document.getElementById('strength-row').style.display    = hasStrength ? '' : 'none';
  document.getElementById('tolerance-row').style.display   = isWand ? '' : 'none';
  // Vollbild-Leiste: Größe/Stärke nur bei Größe-Tools, Toleranz nur beim Zauberstab
  document.getElementById('fullscreen-size').classList.toggle('on', hasSize);
  document.getElementById('fullscreen-strength').classList.toggle('on', hasStrength);
  document.getElementById('fullscreen-tolerance').classList.toggle('on', isWand);
}

// ────────────────────────────────────────────────────────────────────
// Erase-Helper (Rechtsklick-Pfad — nutzt Brush-Größe)
// ────────────────────────────────────────────────────────────────────
function eraseAt(e) {
  const c = cellFromEvent(e); if (!c) return;
  const prev = state.curColor;
  state.curColor = 0;
  paintCell(c.x, c.y);
  state.curColor = prev;
}

// ────────────────────────────────────────────────────────────────────
// Canvas-Events: Malen / Löschen / Pipette / Schablone-Drag
// ────────────────────────────────────────────────────────────────────
// Pinsel-/Radierer-/Spray-Größenvorschau am Mauszeiger aktualisieren.
// Zeigt exakt die Reichweite, die paintBrush/paintSpray verwenden würden.
function updateBrushCursor(e) {
  const el = document.getElementById('brush-cursor');
  if (!el) return;
  const tool = state.tool;
  if (tool !== 'brush' && tool !== 'spray' && tool !== 'eraser') {
    el.style.display = 'none';
    return;
  }
  const c = cellFromEvent(e);
  if (!c) { el.style.display = 'none'; return; }
  const cs = state.cellSize;
  let left, top, size, round;
  if (tool === 'spray') {
    // Spray: Kreis mit Radius brushSize um die Zelle
    const r = state.brushSize;
    left = (c.x - r) * cs; top = (c.y - r) * cs;
    size = (2 * r + 1) * cs; round = true;
  } else {
    // Pinsel/Radierer: Quadrat brushSize×brushSize (gleicher Versatz wie paintBrush)
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
  el.style.display = 'block';
}

function initCanvasEvents() {
  const canvas = document.getElementById('editor-canvas');
  const infoBar = document.getElementById('info-bar');

  canvas.addEventListener('pointerdown', e => {
    // Pointer einfangen → move/up feuern weiter, auch wenn der Finger den
    // Canvas verlässt (wichtig für Touch).
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    // ── Rechtsklick ───────────────────────────────────────────
    if (e.button === 2) {
      e.preventDefault();
      if (e.shiftKey && tplLoaded() && tplHasOffscreen()) {
        // Shift+Rechts = Schablone-Pipette (exakter Hex)
        const r = doTemplatePipette(e);
        if (r.status === 'outside')      infoBar.textContent = 'Schablone: außerhalb des Bildes geklickt';
        else if (r.status === 'transparent') infoBar.textContent = 'Schablone: transparenter Bereich';
        else infoBar.textContent = `Schablone-Pipette: ${r.hex} (exakte Farbe, temporär aktiv)`;
      } else {
        // Plain Rechts = durchgehend löschen
        state.isErasing = true;
        beginStroke();
        eraseAt(e);
      }
      return;
    }

    // ── Mittelklick: ignorieren ───────────────────────────────
    if (e.button !== 0) return;
    e.preventDefault();

    // ── Shift+Links mit Schablone = Drag zum Verschieben ──────
    if (e.shiftKey && tplLoaded()) {
      startTplDrag(e);
      return;
    }

    // ── Alt+Links = Eyedropper auf Canvas-Pixel ───────────────
    if (e.altKey) {
      const c = cellFromEvent(e);
      if (c) {
        state.curColor = getGrid()[c.y][c.x];
        syncColorActive();
        infoBar.textContent = `Pipette: Index ${state.curColor} — ${COLOR_LABELS[state.curColor] || ''}`;
      }
      return;
    }

    // ── Default: Linksklick = aktuelles Tool ─────────────────
    if (state.tool === 'fill') {
      const c = cellFromEvent(e);
      if (c) recordOp(() => floodFill(c.x, c.y));
      return;
    }
    if (state.tool === 'wand') {
      const c = cellFromEvent(e);
      if (c) {
        let removed = 0;
        recordOp(() => {
          removed = magicWandDelete(getGrid(), getPal(state.curType, state.curVariant), c.x, c.y, state.wandTolerance);
        });
        if (removed) renderAll();
        infoBar.textContent = removed
          ? `Zauberstab: ${removed} Pixel gelöscht`
          : 'Zauberstab: nichts gelöscht — Toleranz erhöhen?';
      }
      return;
    }
    state.isDrawing = true;
    beginStroke();
    const c = cellFromEvent(e);
    if (c) applyTool(c.x, c.y);
  });

  canvas.addEventListener('pointermove', e => {
    // Schablone-Drag hat Vorrang
    if (tplDragging()) {
      updateTplDrag(e);
      const o = getTplOffset();
      infoBar.textContent = `Schablone verschieben: x=${o.x}px y=${o.y}px`;
      return;
    }

    updateBrushCursor(e); // Größenvorschau folgt der Maus

    const c = cellFromEvent(e);
    if (c) {
      const cur = getGrid()[c.y][c.x];
      infoBar.textContent = e.altKey
        ? `Pipette — (${c.x}, ${c.y}) · Index ${cur}`
        : `(${c.x}, ${c.y}) · Index: ${cur}`
          + (state.isDrawing ? ` → malen mit ${state.curColor}` : '')
          + (state.isErasing ? ` → löschen` : '');
      if (state.isDrawing && !e.altKey) applyTool(c.x, c.y);
      if (state.isErasing) eraseAt(e);
    }
  });

  const endPointer = () => {
    if (tplDragging()) endTplDrag();
    if (state.isDrawing || state.isErasing) commitStroke();
    state.isDrawing = false;
    state.isErasing = false;
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);

  // Größenvorschau ausblenden, sobald die Maus den Canvas verlässt
  canvas.addEventListener('pointerleave', () => {
    const el = document.getElementById('brush-cursor');
    if (el) el.style.display = 'none';
  });

  // Browser-Kontextmenü unterdrücken — Rechtsklick-Logik läuft via pointerdown
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

// ────────────────────────────────────────────────────────────────────
// Globale Tastatur: Alt-Cursor-Hint, Zahlentasten 0–9 = Farbwechsel
// ────────────────────────────────────────────────────────────────────
function initKeyboardEvents() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const help = document.getElementById('help-modal-overlay');
      if (help && help.classList.contains('open')) { help.classList.remove('open'); return; }
      if (document.body.classList.contains('editor-fullscreen')) { exitFullscreen(); return; }
    }
    if (e.key === 'Alt') {
      document.getElementById('editor-canvas-wrap').classList.add('eyedrop');
    }
    // Undo/Redo — funktionieren auch bei Fokus außerhalb von Form-Feldern.
    // Ctrl+Z = Undo, Ctrl+Y oder Ctrl+Shift+Z = Redo.
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undo()) postHistoryAction();
        return;
      }
      if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        if (redo()) postHistoryAction();
        return;
      }
    }
    // Number keys 0–9: Farbe per Index wechseln (außer bei Fokus in Form-Field)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key >= '0' && e.key <= '9') {
      const idx = Number(e.key);
      if (idx <= getMaxIdx()) {
        state.curColor = idx;
        syncColorActive();
      }
    }
    const toolKeys = { p: 'pencil', b: 'brush', s: 'spray', f: 'fill', e: 'eraser', w: 'wand' };
    const lk = e.key.toLowerCase();
    if (toolKeys[lk]) { state.tool = toolKeys[lk]; updateToolUI(); }
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'Alt') {
      document.getElementById('editor-canvas-wrap').classList.remove('eyedrop');
    }
  });
}

// ────────────────────────────────────────────────────────────────────
// Slider / Buttons / Output-Aktionen
// ────────────────────────────────────────────────────────────────────
function initControls() {
  // Cell-Size Slider
  document.getElementById('cell-size').addEventListener('input', e => {
    state.cellSize = Number(e.target.value);
    document.getElementById('cell-size-val').textContent = state.cellSize + 'px';
    renderEditor();
    saveState();
  });

  // "Farben mitkopieren"-Checkbox → Array-Output neu generieren
  document.getElementById('export-include-palette').addEventListener('change', updateOutput);

  // Copy-Button
  document.getElementById('copy-btn').addEventListener('click', () => {
    const ta = document.getElementById('output-textarea');
    navigator.clipboard.writeText(ta.value).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = '✅ Kopiert!'; btn.classList.add('ok');
      setTimeout(() => { btn.textContent = '📋 Kopieren'; btn.classList.remove('ok'); }, 2000);
    });
  });

  // TypeScript-Code als .ts-Datei speichern (enthält bei "Farben mitkopieren"
  // auch den Palette-Block). Geht in den gewählten Speicherort-Ordner.
  document.getElementById('save-ts-btn').addEventListener('click', async () => {
    const ta = document.getElementById('output-textarea');
    const base = state.curType.startsWith('custom_')
      ? (customMeta[state.curType]?.name || state.curType).replace(/[^a-zA-Z0-9_]/g, '_')
      : `${state.curType.toUpperCase()}_${state.curState.toUpperCase()}`;
    const filename = `${base}.ts`;
    const blob = new Blob([ta.value], { type: 'text/plain' });
    const result = await saveBlob(blob, filename);
    showInfoToast(result.fallback
      ? `„${filename}“ wurde heruntergeladen (Standard-Download-Ordner).`
      : `✅ „${filename}“ gespeichert${result.dir ? ` in „${result.dir}“` : ''}.`);
  });

  // Reset-Button (nur für Built-in Sprites — Custom haben keine Original-Quelle)
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (state.curType.startsWith('custom_')) {
      showInfoToast('Custom-Sprites können nicht zurückgesetzt werden (kein Original).');
      return;
    }
    showConfirmToast('Änderungen für diesen Sprite zurücksetzen?', () => {
      recordOp(() => {
        grids[state.curType][state.curState] = dc(ORIG[state.curType][state.curState]);
      });
      renderAll();
      saveState();
    }, 'Zurücksetzen');
  });

  // Undo / Redo Buttons
  document.getElementById('undo-btn').addEventListener('click', () => { if (undo()) postHistoryAction(); });
  document.getElementById('redo-btn').addEventListener('click', () => { if (redo()) postHistoryAction(); });

  // Speicherort wählen / merken (File System Access API)
  const saveDirBtn = document.getElementById('save-dir-btn');
  if (!supportsFsAccess()) {
    // Browser ohne API → Button ausblenden, es bleibt beim Download-Fallback
    saveDirBtn.style.display = 'none';
  } else {
    const refreshDirBtn = name => {
      saveDirBtn.title = name
        ? `Speicherort: ${name} — klicken zum Ändern`
        : 'Speicherort für PNG/PDF/Sprite-Dateien wählen — wird gemerkt';
    };
    getStoredDirName().then(refreshDirBtn);
    saveDirBtn.addEventListener('click', async () => {
      const dir = await pickSaveDirectory();
      if (dir) {
        refreshDirBtn(dir.name);
        showInfoToast(`Speicherort gesetzt: „${dir.name}“. PNG, PDF und Sprite-Dateien landen ab jetzt hier.`);
      }
    });
  }

  // Datei speichern / laden
  document.getElementById('save-file-btn').addEventListener('click', saveToFile);

  const loadFileInput = document.getElementById('load-file-input');
  document.getElementById('load-file-btn').addEventListener('click', () => loadFileInput.click());
  loadFileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    loadFromFile(file, msg => showInfoToast(msg));
    loadFileInput.value = '';
  });

  // Storage komplett wegwerfen
  document.getElementById('clear-storage-btn').addEventListener('click', () => {
    showConfirmToast(
      'Allen gespeicherten Fortschritt löschen? (Custom-Sprites + Edits gehen verloren.)',
      clearStorage,
      'Zurücksetzen',
    );
  });

  // Force-Save beim Tab-Schließen (Debouncer könnte noch pending sein)
  window.addEventListener('beforeunload', forceSaveBeforeUnload);
}

// ────────────────────────────────────────────────────────────────────
// TOOLS — Palette-Toggle + Tool-Buttons + Brush-Size
// ────────────────────────────────────────────────────────────────────
function enterFullscreen() {
  document.body.classList.add('editor-fullscreen');
  document.getElementById('fullscreen-btn').textContent = '✕ Vollbild';
  updateToolUI(); // aktives Tool in der Vollbild-Tool-Leiste markieren
}

function exitFullscreen() {
  document.body.classList.remove('editor-fullscreen');
  document.getElementById('fullscreen-btn').textContent = 'Vollbild';
}

function initTools() {
  // Vollbild-Button
  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    if (document.body.classList.contains('editor-fullscreen')) exitFullscreen();
    else enterFullscreen();
  });

  const ovToggle = document.getElementById('overview-toggle');
  const ovBody   = document.getElementById('overview-body');
  ovToggle.addEventListener('click', () => {
    const collapsed = ovBody.classList.toggle('collapsed');
    ovToggle.textContent = collapsed ? '▼' : '▲';
    saveState();
  });

  // Sprite-Suche: filtert die Übersicht-Liste live nach Namen.
  document.getElementById('overview-search')?.addEventListener('input', renderOverview);

  const outToggle = document.getElementById('output-toggle');
  const outBody   = document.getElementById('output-body');
  const outCaret  = outToggle.querySelector('.tab-caret');
  outToggle.addEventListener('click', () => {
    const collapsed = outBody.classList.toggle('collapsed');
    outToggle.classList.toggle('open', !collapsed);
    if (outCaret) outCaret.textContent = collapsed ? '▾' : '▴';
    saveState();
  });

  const toolsToggle = document.getElementById('tools-toggle');
  const toolsBody   = document.getElementById('tools-body');
  toolsToggle.addEventListener('click', () => {
    const collapsed = toolsBody.classList.toggle('collapsed');
    toolsToggle.textContent = collapsed ? '▼' : '▲';
    saveState();
  });

  const tplToggle = document.getElementById('template-toggle');
  const tplBody   = document.getElementById('template-body');
  tplToggle.addEventListener('click', () => {
    const collapsed = tplBody.classList.toggle('collapsed');
    tplToggle.textContent = collapsed ? '▼' : '▲';
    saveState();
  });

  document.getElementById('template-trace').addEventListener('click', () => applyTemplateTrace('palette'));
  document.getElementById('template-trace-raw').addEventListener('click', () => applyTemplateTrace('raw'));
  document.getElementById('template-trace-quant').addEventListener('click', () => {
    const n = Number(document.getElementById('trace-colors').value) || 8;
    applyTemplateTrace('quantize', n);
  });

  // Hilfe-Modal öffnen/schließen
  const helpOverlay = document.getElementById('help-modal-overlay');
  document.getElementById('help-btn').addEventListener('click', () => helpOverlay.classList.add('open'));
  document.getElementById('help-close').addEventListener('click', () => helpOverlay.classList.remove('open'));
  helpOverlay.addEventListener('click', e => {
    if (e.target === helpOverlay) helpOverlay.classList.remove('open');
  });

  document.getElementById('bg-dark-btn').addEventListener('click', () => {
    state.editorBg = 'dark';
    document.getElementById('bg-dark-btn').classList.add('active');
    document.getElementById('bg-bw-btn').classList.remove('active');
    renderEditor();
  });
  document.getElementById('bg-bw-btn').addEventListener('click', () => {
    state.editorBg = 'bw';
    document.getElementById('bg-bw-btn').classList.add('active');
    document.getElementById('bg-dark-btn').classList.remove('active');
    renderEditor();
  });

  const palToggle = document.getElementById('palette-toggle');
  const palBody   = document.getElementById('palette-body');
  palToggle.addEventListener('click', () => {
    const collapsed = palBody.classList.toggle('collapsed');
    palToggle.textContent = collapsed ? '▼' : '▲';
    saveState();
  });

  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => { state.tool = btn.dataset.tool; updateToolUI(); });
  });

  document.querySelectorAll('.brush-sz').forEach(btn => {
    btn.addEventListener('click', () => {
      state.brushSize = Number(btn.dataset.size);
      // Aktiv-Markierung nach Größe synchronisieren (es gibt zwei Button-Sätze:
      // rechtes Panel + Vollbild-Leiste).
      document.querySelectorAll('.brush-sz').forEach(b =>
        b.classList.toggle('active', Number(b.dataset.size) === state.brushSize));
    });
  });

  // Stärke- und Toleranz-Slider gibt es zweimal (rechtes Panel + Vollbild-Leiste);
  // beide Sätze schreiben in denselben State und halten sich gegenseitig synchron.
  const setStrength = v => {
    state.brushStrength = Number(v);
    document.querySelectorAll('.strength-input').forEach(s => { if (s.value !== String(v)) s.value = v; });
    document.querySelectorAll('.strength-val').forEach(el => { el.textContent = v + '%'; });
  };
  const setTolerance = v => {
    state.wandTolerance = Number(v);
    document.querySelectorAll('.tolerance-input').forEach(s => { if (s.value !== String(v)) s.value = v; });
    document.querySelectorAll('.tolerance-val').forEach(el => { el.textContent = v + '%'; });
  };
  document.querySelectorAll('.strength-input').forEach(s =>
    s.addEventListener('input', () => setStrength(s.value)));
  document.querySelectorAll('.tolerance-input').forEach(s =>
    s.addEventListener('input', () => setTolerance(s.value)));

  // ── Aufräumen-Sektion: Glätten + Outline ──
  const cleanupToggle = document.getElementById('cleanup-toggle');
  const cleanupBody   = document.getElementById('cleanup-body');
  cleanupToggle.addEventListener('click', () => {
    const collapsed = cleanupBody.classList.toggle('collapsed');
    cleanupToggle.textContent = collapsed ? '▼' : '▲';
    saveState();
  });

  document.getElementById('bg-remove-btn').addEventListener('click', () => {
    const tol = Number(document.getElementById('bg-tolerance').value) || 25;
    let n = 0;
    recordOp(() => { n = autoRemoveBackground(getGrid(), getPal(state.curType, state.curVariant), tol); });
    if (n) renderAll();
    showInfoToast(n ? `Hintergrund entfernt — ${n} Pixel.` : 'Nichts entfernt — Toleranz erhöhen?');
  });

  document.getElementById('despeckle-btn').addEventListener('click', () => {
    let n = 0;
    recordOp(() => { n = despeckleGrid(getGrid()); });
    if (n) renderAll();
    showInfoToast(n ? `Geglättet — ${n} Pixel angepasst.` : 'Nichts zu glätten gefunden.');
  });

  document.getElementById('outline-btn').addEventListener('click', () => {
    const col = document.getElementById('outline-color').value;
    const th  = Number(document.getElementById('outline-thickness').value) || 1;
    let n = 0;
    recordOp(() => { n = outlineGrid(getGrid(), col, th); });
    if (n) renderAll();
    showInfoToast(n ? `Outline gezeichnet — ${n} Pixel.` : 'Keine Outline nötig — Sprite leer?');
  });

  // Frei-Farbwähler — öffnet nativen Color-Picker beim Klick auf Current-Color
  const ccEl   = document.getElementById('current-color');
  const picker = document.getElementById('free-color-picker');
  ccEl.addEventListener('click', () => {
    if (typeof state.curColor === 'string' && state.curColor[0] === '#') {
      picker.value = state.curColor;
    } else if (state.curColor !== 0) {
      const pal = getPal(state.curType, state.curVariant);
      picker.value = pal[state.curColor] || '#888888';
    }
    picker.click();
  });
  picker.addEventListener('input', e => {
    state.curColor = e.target.value;
    syncColorActive();
  });

  updateToolUI();
}

// ────────────────────────────────────────────────────────────────────
// IMPORT — fertiges number[][] Array in den aktuellen Sprite laden
// ────────────────────────────────────────────────────────────────────
function parseArrayText(text) {
  // Export-Format hat '[\n  [' — Whitespace zwischen äußerem und innerem Bracket
  const start = text.search(/\[\s*\[/);
  if (start === -1) return null;
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  try {
    // eslint-disable-next-line no-new-func
    const arr = Function('return ' + text.slice(start, end + 1))();
    if (!Array.isArray(arr) || !arr.length || !Array.isArray(arr[0])) return null;
    for (const row of arr) for (const v of row) if (typeof v !== 'number') return null;
    return arr;
  } catch { return null; }
}

function initImport() {
  const overlay  = document.getElementById('import-modal-overlay');
  const openBtn  = document.getElementById('import-array-btn');
  const ta       = document.getElementById('import-textarea');
  const errEl    = document.getElementById('import-error');
  const cancelBtn= document.getElementById('import-modal-cancel');
  const loadBtn  = document.getElementById('import-modal-load');

  openBtn.addEventListener('click', () => {
    ta.value = '';
    errEl.style.display = 'none';
    overlay.style.display = 'flex';
    ta.focus();
  });

  cancelBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

  loadBtn.addEventListener('click', () => {
    const arr = parseArrayText(ta.value);
    if (!arr) {
      errEl.textContent = 'Kein gültiges number[][]-Array gefunden. Stell sicher dass das Format [[0,1,...], ...] vorliegt.';
      errEl.style.display = 'block';
      return;
    }

    // In aktuelles Grid schreiben
    recordOp(() => {
      if (state.curType.startsWith('custom_')) {
        grids[state.curType] = arr;
      } else {
        grids[state.curType][state.curState] = arr;
      }
    });

    overlay.style.display = 'none';
    renderAll();
    saveState();
  });
}

// ────────────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────────────
function init() {
  // 1. Storage laden (state + grids + customMeta + customPalettes wiederherstellen)
  loadState();

  // 2. Custom-Sprite-Buttons im Header aufbauen (nach Load!)
  Object.keys(customMeta).forEach(key => {
    addCustomTypeButton(key, customMeta[key].name || key);
  });

  // 3. Feature-Module initialisieren (Event-Bindings ihrer DOM-Elemente)
  initTemplate();
  initNewSpriteModal();
  initPaletteModal();
  initExport();
  initImport();
  initTools();
  initCanvasEvents();
  initKeyboardEvents();
  initControls();

  // 4. Initial-Render + History-Buttons (initial: beide disabled)
  renderAll();
  syncHistoryButtons();

  // 5. Vollbild-Zustand aus Storage wiederherstellen (nach renderAll, da quick-palette befüllt sein muss)
  try {
    const saved = JSON.parse(localStorage.getItem('wb_sprite_tester_v1'));
    if (saved?.ui?.fullscreen) enterFullscreen();
  } catch {}
}

init();
