// ════════════════════════════════════════════════════════════════════
// SELECTION — rechteckige Auswahl: ausschneiden, verschieben, kopieren
// ════════════════════════════════════════════════════════════════════
// Ablauf beim Verschieben:
//   pointerdown  → Zellen aus dem Grid heben (selection.float), Quelle leeren
//   pointermove  → nur selection.rect wandert; gezeichnet wird aus float
//   pointerup    → float ins Grid stempeln, ein Undo-Eintrag für die ganze Aktion
// Gestempelt werden nur nicht-transparente Zellen: ein verschobener Block
// löscht also nicht mit seinen leeren Rändern, was darunter liegt.
import { selection, getGrid, getSprite, clearSelection } from './state.js';
import { renderEditor, renderSpriteList, updateOutput, cellFromEventClamped } from './render.js';
import { saveState } from './storage.js';
import { beginStroke, commitStroke, recordOp } from './history.js';

// Zwischenablage — modul-lokal, überlebt Sprite-Wechsel, aber keinen Reload.
let clipboard = null; // 2D-Array | null

// ────────────────────────────────────────────────────────────────────
// Rechteck-Helfer
// ────────────────────────────────────────────────────────────────────
function gridSize() {
  const g = getGrid();
  return { W: g[0].length, H: g.length };
}

// Rechteck aus zwei Eckzellen (beide inklusive).
function rectFromCells(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

// Auswahl darf über den Rand hinausragen, aber nie ganz verschwinden —
// sonst hätte man einen unsichtbaren Block in der Hand.
function setRectPos(r, x, y) {
  const { W, H } = gridSize();
  r.x = Math.max(1 - r.w, Math.min(W - 1, x));
  r.y = Math.max(1 - r.h, Math.min(H - 1, y));
}

// Zellen eines Rechtecks kopieren. Was außerhalb liegt, wird transparent.
function readRect(grid, r) {
  const { W, H } = gridSize();
  const out = [];
  for (let y = 0; y < r.h; y++) {
    const row = [];
    for (let x = 0; x < r.w; x++) {
      const gx = r.x + x, gy = r.y + y;
      row.push(gx >= 0 && gy >= 0 && gx < W && gy < H ? grid[gy][gx] : 0);
    }
    out.push(row);
  }
  return out;
}

// Rechteck im Grid auf transparent setzen. Gibt die Zahl geleerter Pixel zurück.
function clearRect(grid, r) {
  const { W, H } = gridSize();
  let n = 0;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const gx = r.x + x, gy = r.y + y;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
    if (grid[gy][gx] !== 0) { grid[gy][gx] = 0; n++; }
  }
  return n;
}

// Zellen ins Grid stempeln — transparente Zellen lassen den Untergrund stehen.
function stampCells(grid, cells, ox, oy) {
  const { W, H } = gridSize();
  let n = 0;
  for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
    const v = cells[y][x];
    if (v === 0) continue;
    const gx = ox + x, gy = oy + y;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue; // über den Rand → verworfen
    if (grid[gy][gx] !== v) { grid[gy][gx] = v; n++; }
  }
  return n;
}

// Nach einer Grid-Änderung: Canvas, Thumbnail, Code-Feld, Speicherung.
function afterChange() {
  renderEditor();
  renderSpriteList();
  updateOutput();
  saveState();
}

// ────────────────────────────────────────────────────────────────────
// Zeiger-Aktionen
// ────────────────────────────────────────────────────────────────────

// Neue Auswahl aufziehen.
export function startMarquee(e) {
  const c = cellFromEventClamped(e);
  selection.float = null;
  selection.anchor = c;
  selection.rect = rectFromCells(c, c);
  selection.mode = 'marquee';
  renderEditor();
}

export function updateMarquee(e) {
  if (selection.mode !== 'marquee' || !selection.anchor) return;
  selection.rect = rectFromCells(selection.anchor, cellFromEventClamped(e));
  renderEditor();
}

// Auswahl anfassen. `copy = true` (Alt) lässt die Quelle stehen.
export function startMove(e, copy) {
  const r = selection.rect;
  if (!r || !getSprite()) return;
  const c = cellFromEventClamped(e);
  const grid = getGrid();

  beginStroke(); // Snapshot vor dem Ausschneiden — Drop committet die ganze Geste
  selection.float = readRect(grid, r);
  if (!copy) clearRect(grid, r);
  selection.grab = { dx: c.x - r.x, dy: c.y - r.y };
  selection.mode = 'move';
  afterChange();
}

export function updateMove(e) {
  if (selection.mode !== 'move' || !selection.rect) return;
  const c = cellFromEventClamped(e);
  setRectPos(selection.rect, c.x - selection.grab.dx, c.y - selection.grab.dy);
  renderEditor();
}

// pointerup — Block absetzen bzw. Aufziehen abschließen.
export function endSelectionPointer() {
  if (selection.mode === 'move') {
    stampCells(getGrid(), selection.float, selection.rect.x, selection.rect.y);
    selection.float = null;
    selection.grab = null;
    selection.mode = null;
    commitStroke(); // landet nur im Undo-Stack, wenn sich wirklich etwas geändert hat
    afterChange();
    return;
  }
  if (selection.mode === 'marquee') {
    selection.mode = null;
    selection.anchor = null;
    // Klick ohne Ziehen = abwählen (sonst hinge man an einer 1×1-Auswahl fest).
    if (selection.rect && selection.rect.w === 1 && selection.rect.h === 1) clearSelection();
    renderEditor();
  }
}

// ────────────────────────────────────────────────────────────────────
// Befehle (Tastatur / Werkzeugleiste)
// ────────────────────────────────────────────────────────────────────
export function selectAll() {
  const { W, H } = gridSize();
  selection.float = null;
  selection.rect = { x: 0, y: 0, w: W, h: H };
  selection.mode = null;
  renderEditor();
}

export function deselect() {
  if (!selection.rect) return false;
  clearSelection();
  renderEditor();
  return true;
}

// Auswahl um dx/dy Zellen versetzen (Pfeiltasten) — ein Undo-Schritt pro Druck.
export function nudgeSelection(dx, dy) {
  const r = selection.rect;
  if (!r) return false;
  const grid = getGrid();
  recordOp(() => {
    const cells = readRect(grid, r);
    clearRect(grid, r);
    setRectPos(r, r.x + dx, r.y + dy);
    stampCells(grid, cells, r.x, r.y);
  });
  afterChange();
  return true;
}

export function copySelection() {
  if (!selection.rect) return 0;
  clipboard = readRect(getGrid(), selection.rect);
  return selection.rect.w * selection.rect.h;
}

export function cutSelection() {
  if (!selection.rect) return 0;
  copySelection();
  let n = 0;
  recordOp(() => { n = clearRect(getGrid(), selection.rect); });
  afterChange();
  return n;
}

export function deleteSelection() {
  if (!selection.rect) return 0;
  let n = 0;
  recordOp(() => { n = clearRect(getGrid(), selection.rect); });
  afterChange();
  return n;
}

export function hasClipboard() { return !!clipboard; }

// Einfügen an der Ecke der aktuellen Auswahl, sonst links oben. Das
// Eingefügte wird zur neuen Auswahl und ist damit sofort verschiebbar.
export function pasteClipboard() {
  if (!clipboard || !getSprite()) return 0;
  const { W, H } = gridSize();
  const h = clipboard.length, w = clipboard[0].length;
  const x = Math.max(0, Math.min(W - w, selection.rect ? selection.rect.x : 0));
  const y = Math.max(0, Math.min(H - h, selection.rect ? selection.rect.y : 0));

  let n = 0;
  recordOp(() => { n = stampCells(getGrid(), clipboard, x, y); });
  selection.float = null;
  selection.mode = null;
  selection.rect = { x, y, w, h };
  afterChange();
  return n;
}

// Text für die Statuszeile.
export function selectionInfo(prefix = '') {
  const r = selection.rect;
  if (!r) return 'Keine Auswahl';
  return `${prefix}${prefix ? ' — ' : ''}Auswahl ${r.w}×${r.h} bei (${r.x}, ${r.y})`;
}
