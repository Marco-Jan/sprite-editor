// ════════════════════════════════════════════════════════════════════
// HISTORY — Undo/Redo für Grid-Mutationen
// ════════════════════════════════════════════════════════════════════
// Ein Eintrag deckt einen kompletten "Strich" ab (Mousedown→Mouseup), nicht
// einzelne Pixel. Snapshot wird bei beginStroke() genommen, beim commitStroke()
// gegen den aktuellen Grid verglichen — nur bei echter Änderung gespeichert.
// Persistenz: bewusst nur in-memory (wie bei jedem Design-Tool).
import { state, grids, getVariants } from './state.js';
import { dc } from './data.js';

const MAX_HISTORY = 50;

const undoStack = [];
const redoStack = [];

let pendingSnapshot = null;

// Wird von app.js verdrahtet — Button-States updaten / nach Restore re-rendern.
export const historyCallbacks = {
  onChange:  () => {},
  onRestore: () => {},
};

// Identifiziert, zu welchem Grid (Typ + ggf. State) ein Snapshot gehört.
// Custom-Sprites haben keinen State (st = null).
function gridKey() {
  return state.curType.startsWith('custom_')
    ? { type: state.curType, st: null }
    : { type: state.curType, st: state.curState };
}

function getGridAt(type, st) {
  return type.startsWith('custom_') ? grids[type] : grids[type][st];
}

function setGridAt(type, st, grid) {
  if (type.startsWith('custom_')) grids[type] = grid;
  else grids[type][st] = grid;
}

function gridsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let y = 0; y < a.length; y++) {
    if (a[y].length !== b[y].length) return false;
    for (let x = 0; x < a[y].length; x++) {
      if (a[y][x] !== b[y][x]) return false;
    }
  }
  return true;
}

// Snapshot vor Beginn einer Mutation. Mehrfachaufrufe (z.B. mousedown auf
// schon laufendem Stroke) sind no-op — der erste gewinnt.
export function beginStroke() {
  if (pendingSnapshot) return;
  const { type, st } = gridKey();
  pendingSnapshot = { type, st, before: dc(getGridAt(type, st)) };
}

// Abschluss: nur wenn sich tatsächlich etwas geändert hat, landet ein Eintrag
// im Undo-Stack. Redo wird gelöscht, sobald eine neue Aktion erfasst wird.
export function commitStroke() {
  if (!pendingSnapshot) return;
  const after = getGridAt(pendingSnapshot.type, pendingSnapshot.st);
  if (!gridsEqual(pendingSnapshot.before, after)) {
    undoStack.push({
      type: pendingSnapshot.type,
      st:   pendingSnapshot.st,
      before: pendingSnapshot.before,
      after:  dc(after),
    });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    historyCallbacks.onChange();
  }
  pendingSnapshot = null;
}

// Convenience für One-Shot-Ops (Fill, Import, Reset).
export function recordOp(fn) {
  beginStroke();
  fn();
  commitStroke();
}

export function undo() {
  if (!undoStack.length) return false;
  pendingSnapshot = null; // unfertigen Strich verwerfen
  const entry = undoStack.pop();
  setGridAt(entry.type, entry.st, dc(entry.before));
  redoStack.push(entry);
  switchViewTo(entry.type, entry.st);
  historyCallbacks.onChange();
  historyCallbacks.onRestore();
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  pendingSnapshot = null;
  const entry = redoStack.pop();
  setGridAt(entry.type, entry.st, dc(entry.after));
  undoStack.push(entry);
  switchViewTo(entry.type, entry.st);
  historyCallbacks.onChange();
  historyCallbacks.onRestore();
  return true;
}

// Wechselt die Editor-Ansicht zum betroffenen Sprite, sonst sieht der User
// die Undo/Redo-Wirkung nicht (Standardverhalten in Design-Tools).
function switchViewTo(type, st) {
  if (state.curType !== type) {
    state.curType = type;
    const vs = getVariants(type);
    if (!vs.includes(state.curVariant)) state.curVariant = vs[0];
  }
  if (st && state.curState !== st) state.curState = st;
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  pendingSnapshot = null;
  historyCallbacks.onChange();
}
