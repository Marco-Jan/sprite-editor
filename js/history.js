// ════════════════════════════════════════════════════════════════════
// HISTORY — Undo/Redo für Grid-Mutationen
// ════════════════════════════════════════════════════════════════════
// Ein Eintrag deckt einen kompletten "Strich" ab (pointerdown→pointerup),
// nicht einzelne Pixel. Snapshot bei beginStroke(), Vergleich bei
// commitStroke() — nur bei echter Änderung wird gespeichert.
// Persistenz: bewusst nur in-memory (wie bei jedem Design-Tool).
// Mit im Eintrag steckt die Palette des Sprites — so ist auch "Sprite
// umfärben" (andere Palette zuweisen) ein normaler Undo-Schritt.
import { state, sprites } from './state.js';
import { dc } from './data.js';

const MAX_HISTORY = 50;

const undoStack = [];
const redoStack = [];
let pendingSnapshot = null;

// Von app.js verdrahtet — Button-States updaten / nach Restore re-rendern.
export const historyCallbacks = {
  onChange:  () => {},
  onRestore: () => {},
};

function gridOf(id) {
  return sprites[id]?.grid || null;
}

function setGridOf(id, grid) {
  if (sprites[id]) sprites[id].grid = grid;
}

function gridsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let y = 0; y < a.length; y++) {
    if (a[y].length !== b[y].length) return false;
    for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) return false;
  }
  return true;
}

// Snapshot vor Beginn einer Mutation. Mehrfachaufrufe während eines laufenden
// Strichs sind no-op — der erste gewinnt.
export function beginStroke() {
  if (pendingSnapshot) return;
  const id = state.curSprite;
  const grid = gridOf(id);
  if (!grid) return;
  pendingSnapshot = { id, before: dc(grid), palBefore: sprites[id].palette };
}

// Abschluss: nur bei echter Änderung landet ein Eintrag im Undo-Stack.
export function commitStroke() {
  if (!pendingSnapshot) return;
  const { id, before, palBefore } = pendingSnapshot;
  const after = gridOf(id);
  const palAfter = sprites[id]?.palette;
  if (after && (!gridsEqual(before, after) || palBefore !== palAfter)) {
    undoStack.push({ id, before, after: dc(after), palBefore, palAfter });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    historyCallbacks.onChange();
  }
  pendingSnapshot = null;
}

// Convenience für One-Shot-Ops (Fill, Import, Leeren, Effekte).
export function recordOp(fn) {
  beginStroke();
  fn();
  commitStroke();
}

// Wie recordOp(), aber für einen bestimmten Sprite: wenn aus der Sprite-Liste
// heraus ein gerade NICHT aktiver Sprite geändert wird, liegt der Snapshot von
// beginStroke() am falschen Grid.
export function recordOpOn(id, fn) {
  const grid = gridOf(id);
  if (!grid) { fn(); return; }
  const before = dc(grid);
  fn();
  const after = gridOf(id);
  if (!after || gridsEqual(before, after)) return;
  undoStack.push({ id, before, after: dc(after) });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  historyCallbacks.onChange();
}

function restore(entry, which) {
  // Der Sprite kann inzwischen gelöscht worden sein — Eintrag dann verwerfen.
  if (!sprites[entry.id]) return false;
  setGridOf(entry.id, dc(entry[which]));
  const pal = which === 'before' ? entry.palBefore : entry.palAfter;
  if (pal) sprites[entry.id].palette = pal;
  // Ansicht auf den betroffenen Sprite wechseln, sonst sieht man die Wirkung nicht.
  if (state.curSprite !== entry.id) state.curSprite = entry.id;
  return true;
}

export function undo() {
  while (undoStack.length) {
    pendingSnapshot = null; // unfertigen Strich verwerfen
    const entry = undoStack.pop();
    if (restore(entry, 'before')) {
      redoStack.push(entry);
      historyCallbacks.onChange();
      historyCallbacks.onRestore();
      return true;
    }
  }
  historyCallbacks.onChange();
  return false;
}

export function redo() {
  while (redoStack.length) {
    pendingSnapshot = null;
    const entry = redoStack.pop();
    if (restore(entry, 'after')) {
      undoStack.push(entry);
      historyCallbacks.onChange();
      historyCallbacks.onRestore();
      return true;
    }
  }
  historyCallbacks.onChange();
  return false;
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  pendingSnapshot = null;
  historyCallbacks.onChange();
}
