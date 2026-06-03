// ════════════════════════════════════════════════════════════════════
// APP — Haupt-Entry: Init + Event-Bindings + Wiring zwischen Modulen
// ════════════════════════════════════════════════════════════════════
import { state, grids, customMeta, getGrid, getMaxIdx, getPal } from './state.js';
import { showConfirmToast, showInfoToast } from './toast.js';
import { ORIG, dc, COLOR_LABELS } from './data.js';
import {
  renderAll, renderEditor, renderOverview, syncColorActive,
  cellFromEvent, paintCell, paintBrush, paintSpray, floodFill, renderCallbacks,
} from './render.js';
import {
  saveState, loadState, clearStorage, forceSaveBeforeUnload,
  saveToFile, loadFromFile,
} from './storage.js';
import { addCustomTypeButton, initNewSpriteModal, deleteCustomSprite } from './sprites.js';
import { openPaletteModal, deleteCustomPalette, initPaletteModal } from './palettes.js';
import {
  initTemplate, tplLoaded, tplHasOffscreen,
  startTplDrag, tplDragging, updateTplDrag, endTplDrag, getTplOffset,
  doTemplatePipette,
} from './template.js';
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
  document.getElementById('brush-size-wrap').style.display = hasSize     ? '' : 'none';
  document.getElementById('tool-sliders').style.display    = hasStrength ? '' : 'none';
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
function initCanvasEvents() {
  const canvas = document.getElementById('editor-canvas');
  const infoBar = document.getElementById('info-bar');

  canvas.addEventListener('mousedown', e => {
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
    state.isDrawing = true;
    beginStroke();
    const c = cellFromEvent(e);
    if (c) applyTool(c.x, c.y);
  });

  canvas.addEventListener('mousemove', e => {
    // Schablone-Drag hat Vorrang
    if (tplDragging()) {
      updateTplDrag(e);
      const o = getTplOffset();
      infoBar.textContent = `Schablone verschieben: x=${o.x}px y=${o.y}px`;
      return;
    }

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

  window.addEventListener('mouseup', () => {
    if (tplDragging()) endTplDrag();
    if (state.isDrawing || state.isErasing) commitStroke();
    state.isDrawing = false;
    state.isErasing = false;
  });

  // Browser-Kontextmenü unterdrücken — Rechtsklick-Logik läuft via mousedown
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

// ────────────────────────────────────────────────────────────────────
// Globale Tastatur: Alt-Cursor-Hint, Zahlentasten 0–9 = Farbwechsel
// ────────────────────────────────────────────────────────────────────
function initKeyboardEvents() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('editor-fullscreen')) {
      exitFullscreen();
      return;
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
    const toolKeys = { p: 'pencil', b: 'brush', s: 'spray', f: 'fill', e: 'eraser' };
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

  // Copy-Button
  document.getElementById('copy-btn').addEventListener('click', () => {
    const ta = document.getElementById('output-textarea');
    navigator.clipboard.writeText(ta.value).then(() => {
      const btn = document.getElementById('copy-btn');
      btn.textContent = '✅ Kopiert!'; btn.classList.add('ok');
      setTimeout(() => { btn.textContent = '📋 Kopieren'; btn.classList.remove('ok'); }, 2000);
    });
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
  // quick-palette als erste Spalte in #main-layout verschieben
  const ml = document.getElementById('main-layout');
  ml.insertBefore(document.getElementById('quick-palette'), ml.firstChild);
}

function exitFullscreen() {
  document.body.classList.remove('editor-fullscreen');
  document.getElementById('fullscreen-btn').textContent = '⛶ Vollbild';
  // quick-palette zurück in #editor-wrap vor den Canvas-Bereich
  const canvasArea = document.getElementById('editor-canvas-area');
  canvasArea.parentElement.insertBefore(document.getElementById('quick-palette'), canvasArea);
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

  const scToggle = document.getElementById('shortcuts-toggle');
  const scBar    = document.getElementById('shortcuts-bar');
  scToggle.addEventListener('click', () => {
    const collapsed = scBar.classList.toggle('collapsed');
    scToggle.textContent = collapsed ? '▼' : '▲';
    saveState();
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
      document.querySelectorAll('.brush-sz').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  const strengthSlider = document.getElementById('strength-slider');
  const strengthVal    = document.getElementById('strength-val');
  strengthSlider.addEventListener('input', () => {
    state.brushStrength = Number(strengthSlider.value);
    strengthVal.textContent = strengthSlider.value + '%';
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
