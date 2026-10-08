// ════════════════════════════════════════════════════════════════════
// HISTORY — Undo/Redo für Grid-Mutationen
// ════════════════════════════════════════════════════════════════════
// Ein Eintrag deckt einen kompletten "Strich" ab (pointerdown→pointerup),
// nicht einzelne Pixel. Snapshot bei beginStroke(), Vergleich bei
// commitStroke() — nur bei echter Änderung wird gespeichert. Gesichert wird
// immer der ganze Sprite mit allen Frames (siehe snap).
// Persistenz: bewusst nur in-memory (wie bei jedem Design-Tool).
// Mit im Eintrag steckt die Palette des Sprites — so ist auch "Sprite
// umfärben" (andere Palette zuweisen) ein normaler Undo-Schritt.
import { state, sprites, copyFrames, linkSignature } from './state.js';
import { copyTags } from './tags.js';
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

// Ein Eintrag sichert den GANZEN Sprite: alle Frames samt Dauer, die fps,
// die Palette und welcher Frame zu sehen war. So sind auch Frame-Aktionen
// (anlegen, löschen, verschieben) und Änderungen über alle Frames (Größe,
// Palette umfärben) ein normaler Undo-Schritt. Gespeicherte Grids werden
// nie verändert — unveränderte Frames teilen sich darum ihre Kopie.
// Verknüpfte Zellen (dasselbe Bild in mehreren Frames) bleiben dabei
// verknüpft: ein geteiltes Bild wird nur einmal gesichert.
//
// Auch ÜBER Einträge hinweg wird geteilt: ein Bild, das so schon im letzten
// Eintrag steht, wird nicht noch einmal kopiert. Ohne das hielte jeder
// Undo-Schritt eine vollständige Kopie des Sprites — bei 1024×1024 mit
// mehreren Frames schnell Gigabytes. Ob geteilt werden darf, entscheidet
// immer der Vergleich der Pixel; `lastFrames` ist nur ein Vorschlag.
let lastFrames = null;   // { id, frames } — zuletzt gesicherter Stand

/**
 * Frames sichern und dabei Bilder aus `prev` wiederverwenden, wo die Pixel
 * gleich sind. Ein Bild aus `prev` steht dabei nur für EIN heutiges Bild —
 * sonst würden zwei getrennte Zellen mit gleichem Inhalt beim Undo zu einer
 * verknüpften.
 */
function shareFrames(frames, prev) {
  const memo = new Map(), taken = new Set();
  const keep = (g, b) => {
    if (memo.has(g)) return memo.get(g);
    const c = b && !taken.has(b) && gridsEqual(b, g) ? b : dc(g);
    taken.add(c);
    memo.set(g, c);
    return c;
  };
  return frames.map((f, i) => ({
    cels: f.cels.map((g, j) => keep(g, prev?.[i]?.cels[j])),
    dur: f.dur || 0,
  }));
}

function snap(id) {
  const sp = sprites[id];
  if (!sp) return null;
  const frames = shareFrames(sp.frames, lastFrames?.id === id ? lastFrames.frames : null);
  lastFrames = { id, frames };
  return {
    frames,
    layers: sp.layers.map(l => ({ ...l })),
    layer: sp.layer,
    frame: sp.frame,
    fps: sp.fps,
    palette: sp.palette,
    tags: copyTags(sp.tags),
  };
}

// Stand nach der Änderung — Bilder, die gleich geblieben sind, verweisen
// auf die Kopie im Vorher-Stand.
function snapAfter(id, before) {
  const sp = sprites[id];
  if (!sp) return null;
  const frames = shareFrames(sp.frames, before.frames);
  lastFrames = { id, frames };
  return {
    frames,
    layers: sp.layers.map(l => ({ ...l })),
    layer: sp.layer,
    frame: sp.frame,
    fps: sp.fps,
    palette: sp.palette,
    tags: copyTags(sp.tags),
  };
}

function gridsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let y = 0; y < a.length; y++) {
    if (a[y].length !== b[y].length) return false;
    for (let x = 0; x < a[y].length; x++) if (a[y][x] !== b[y][x]) return false;
  }
  return true;
}

// Welcher Frame und welche Ebene gerade aktiv sind, zählt nicht als Änderung.
function snapsEqual(a, b) {
  if (a.palette !== b.palette || a.fps !== b.fps || a.frames.length !== b.frames.length) return false;
  if (JSON.stringify(a.layers) !== JSON.stringify(b.layers)) return false;
  if (linkSignature(a.frames) !== linkSignature(b.frames)) return false;
  if (JSON.stringify(a.tags) !== JSON.stringify(b.tags)) return false;
  return a.frames.every((f, i) => f.dur === b.frames[i].dur
    && f.cels.length === b.frames[i].cels.length
    && f.cels.every((g, j) => gridsEqual(g, b.frames[i].cels[j])));
}

function push(entry) {
  undoStack.push(entry);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  historyCallbacks.onChange();
}

// Snapshot vor Beginn einer Mutation. Mehrfachaufrufe während eines laufenden
// Strichs sind no-op — der erste gewinnt.
export function beginStroke() {
  if (pendingSnapshot) return;
  const id = state.curSprite;
  const before = snap(id);
  if (!before) return;
  pendingSnapshot = { id, before };
}

// Abschluss: nur bei echter Änderung landet ein Eintrag im Undo-Stack.
export function commitStroke() {
  if (!pendingSnapshot) return;
  const { id, before } = pendingSnapshot;
  pendingSnapshot = null;
  const after = snapAfter(id, before);
  if (after && !snapsEqual(before, after)) push({ id, before, after });
}

// Convenience für One-Shot-Ops (Fill, Import, Leeren, Effekte).
export function recordOp(fn) {
  beginStroke();
  fn();
  commitStroke();
}

// Wie recordOp(), aber für einen bestimmten Sprite: wenn aus der Sprite-Liste
// heraus ein gerade NICHT aktiver Sprite geändert wird, liegt der Snapshot von
// beginStroke() am falschen Sprite.
export function recordOpOn(id, fn) {
  const before = snap(id);
  if (!before) { fn(); return; }
  fn();
  const after = snapAfter(id, before);
  if (after && !snapsEqual(before, after)) push({ id, before, after });
}

// Ein Undo-Schritt, der mehr umfasst als einen Sprite — z. B. die Palette
// umsortieren: Palette, Materialien und die Pixel aller Sprites mit dieser
// Palette ändern sich zusammen und müssen zusammen zurück. Die beiden
// Funktionen machen den Schritt rückgängig bzw. noch einmal; geben sie
// false zurück, wird der Eintrag übersprungen.
export function recordCustom({ undo: undoFn, redo: redoFn }) {
  pendingSnapshot = null;
  push({ custom: { undo: undoFn, redo: redoFn } });
}

function apply(id, st) {
  const sp = sprites[id];
  sp.frames = copyFrames(st.frames);
  sp.layers = st.layers.map(l => ({ ...l }));
  sp.layer = Math.min(st.layer, sp.layers.length - 1);
  sp.frame = Math.min(st.frame, sp.frames.length - 1);
  sp.fps = st.fps;
  sp.tags = copyTags(st.tags);
  if (st.palette) sp.palette = st.palette;
}

function restore(entry, which) {
  // Eigener Schritt (recordCustom): er weiß selbst, was zu tun ist.
  if (entry.custom) return entry.custom[which === 'before' ? 'undo' : 'redo']() !== false;
  // Der Sprite kann inzwischen gelöscht worden sein — Eintrag dann verwerfen.
  if (!sprites[entry.id]) return false;
  apply(entry.id, entry[which]);
  lastFrames = { id: entry.id, frames: entry[which].frames };
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

// Für Gesten, die sich erst im Nachhinein als Zoom statt Strich entpuppen
// (zwei Finger, js/app.js initPinch): alles seit `depth` zurücknehmen und
// einen laufenden Strich verwerfen — ohne Redo-Eintrag.
export function undoDepth() { return undoStack.length; }

export function rollbackTo(depth) {
  let any = false;
  if (pendingSnapshot) {
    if (sprites[pendingSnapshot.id]) apply(pendingSnapshot.id, pendingSnapshot.before);
    pendingSnapshot = null;
    any = true;
  }
  while (undoStack.length > depth) { restore(undoStack.pop(), 'before'); any = true; }
  if (any) { historyCallbacks.onChange(); historyCallbacks.onRestore(); }
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  pendingSnapshot = null;
  lastFrames = null;
  historyCallbacks.onChange();
}
