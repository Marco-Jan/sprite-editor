// ════════════════════════════════════════════════════════════════════
// SELECTION — Auswahl: aufziehen, lassoen, ausschneiden, verschieben
// ════════════════════════════════════════════════════════════════════
// Eine Auswahl besteht aus zwei Teilen:
//   rect — die Bounding-Box in Grid-Zellen
//   mask — null bei einem vollen Rechteck, sonst boolean[h][w] relativ
//          zu rect: so trägt dieselbe Mechanik auch Freihandformen.
// Alles, was Zellen liest, leert oder stempelt, respektiert die Maske.
//
// Ablauf beim Verschieben:
//   pointerdown  → Zellen aus dem Grid heben (selection.float), Quelle leeren
//   pointermove  → nur selection.rect wandert; gezeichnet wird aus float
//   pointerup    → float ins Grid stempeln, ein Undo-Eintrag für die Geste
// Gestempelt werden nur nicht-transparente Zellen: ein verschobener Block
// löscht also nicht mit seinen leeren Rändern, was darunter liegt.
import { state, selection, getGrid, getSprite, getPal, clearSelection } from './state.js';
import { renderEditor, renderSpriteList, updateOutput, cellFromEventClamped } from './render.js';
import { saveState } from './storage.js';
import { beginStroke, commitStroke, recordOp } from './history.js';
import { magicWandRegion } from './spritefx.js';

// Zwischenablage — modul-lokal, überlebt Sprite-Wechsel, aber keinen Reload.
let clipboard = null; // { cells, mask } | null

// ────────────────────────────────────────────────────────────────────
// Rechteck- und Masken-Helfer
// ────────────────────────────────────────────────────────────────────
function gridSize() {
  const g = getGrid();
  return { W: g[0].length, H: g.length };
}

// Gehört die Zelle (relativ zur Bounding-Box) zur Auswahl?
function inMask(mask, x, y) {
  return !mask || !!mask[y]?.[x];
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

// Zellen der Auswahl kopieren. Alles außerhalb von Maske oder Grid wird 0.
function readSel(grid, r, mask) {
  const { W, H } = gridSize();
  const out = [];
  for (let y = 0; y < r.h; y++) {
    const row = [];
    for (let x = 0; x < r.w; x++) {
      const gx = r.x + x, gy = r.y + y;
      const ok = inMask(mask, x, y) && gx >= 0 && gy >= 0 && gx < W && gy < H;
      row.push(ok ? grid[gy][gx] : 0);
    }
    out.push(row);
  }
  return out;
}

// Auswahl im Grid auf transparent setzen. Gibt die Zahl geleerter Pixel zurück.
function clearSel(grid, r, mask) {
  const { W, H } = gridSize();
  let n = 0;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (!inMask(mask, x, y)) continue;
    const gx = r.x + x, gy = r.y + y;
    if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
    if (grid[gy][gx] !== 0) { grid[gy][gx] = 0; n++; }
  }
  return n;
}

// Zellen ins Grid stempeln — transparente Zellen lassen den Untergrund stehen.
// Die Maske steckt hier schon drin: außerhalb von ihr sind die Zellen 0.
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

// Zahl der tatsächlich ausgewählten Zellen (für die Statuszeile).
function maskCount(r, mask) {
  if (!mask) return r.w * r.h;
  let n = 0;
  for (const row of mask) for (const v of row) if (v) n++;
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
// LASSO — gezeichnete Linie zu einer Maske machen
// ────────────────────────────────────────────────────────────────────
// Statt Polygon-Mathematik: die gezogene Spur markieren, den Rest von außen
// fluten und alles nehmen, was das Wasser nicht erreicht hat. Das kommt auch
// mit überkreuzten und krakeligen Zügen zurecht und schließt die Linie selbst
// immer mit ein.
function rasterizePath(path) {
  const { W, H } = gridSize();
  const edge = Array.from({ length: H }, () => new Array(W).fill(false));
  const mark = (x, y) => { if (x >= 0 && y >= 0 && x < W && y < H) edge[y][x] = true; };

  // Bresenham zwischen zwei Stützpunkten — der Zeiger springt bei schnellen
  // Bewegungen über Zellen hinweg, die Linie muss trotzdem dicht sein.
  const line = (a, b) => {
    let x0 = a.x, y0 = a.y;
    const x1 = b.x, y1 = b.y;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      mark(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  for (let i = 1; i < path.length; i++) line(path[i - 1], path[i]);
  if (path.length > 1) line(path[path.length - 1], path[0]); // Form schließen
  else mark(path[0].x, path[0].y);

  // Vom Rand her fluten — was übrig bleibt, liegt innerhalb der Spur.
  const outside = Array.from({ length: H }, () => new Array(W).fill(false));
  const stack = [];
  for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1]);
  for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (outside[y][x] || edge[y][x]) continue;
    outside[y][x] = true;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // Bounding-Box über alles, was drin ist.
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!edge[y][x] && outside[y][x]) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;

  const rect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  const mask = [];
  for (let y = 0; y < rect.h; y++) {
    const row = [];
    for (let x = 0; x < rect.w; x++) {
      const gx = minX + x, gy = minY + y;
      row.push(edge[gy][gx] || !outside[gy][gx]);
    }
    mask.push(row);
  }
  return { rect, mask };
}

// ────────────────────────────────────────────────────────────────────
// Zeiger-Aktionen
// ────────────────────────────────────────────────────────────────────

// Rechteck aufziehen.
export function startMarquee(e) {
  const c = cellFromEventClamped(e);
  selection.float = null;
  selection.mask = null;
  selection.path = null;
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

// Freihandform ziehen.
export function startLasso(e) {
  selection.float = null;
  selection.mask = null;
  selection.rect = null;
  selection.anchor = null;
  selection.path = [cellFromEventClamped(e)];
  selection.mode = 'lasso';
  renderEditor();
}

export function updateLasso(e) {
  if (selection.mode !== 'lasso' || !selection.path) return;
  const c = cellFromEventClamped(e);
  const last = selection.path[selection.path.length - 1];
  if (last.x === c.x && last.y === c.y) return; // gleiche Zelle → nichts Neues
  selection.path.push(c);
  renderEditor();
}

// Auswahl anfassen. `copy = true` (Alt) lässt die Quelle stehen.
export function startMove(e, copy) {
  const r = selection.rect;
  if (!r || !getSprite()) return;
  const c = cellFromEventClamped(e);
  const grid = getGrid();

  beginStroke(); // Snapshot vor dem Ausschneiden — Drop committet die ganze Geste
  selection.float = readSel(grid, r, selection.mask);
  if (!copy) clearSel(grid, r, selection.mask);
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

// pointerup — Block absetzen bzw. Aufziehen/Lassoen abschließen.
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

  if (selection.mode === 'lasso') {
    const path = selection.path || [];
    selection.mode = null;
    selection.path = null;
    const res = path.length ? rasterizePath(path) : null;
    // Ein einzelner Klick ist keine Form → das gilt als abwählen.
    if (!res || path.length < 2) clearSelection();
    else { selection.rect = res.rect; selection.mask = res.mask; }
    renderEditor();
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
// FARBAUSWAHL — zusammenhängende ähnliche Fläche wählen
// ────────────────────────────────────────────────────────────────────
// Derselbe Bereich, den der Zauberstab löschen würde — nur dass er hier zur
// Auswahl wird und man ihn danach verschieben, kopieren oder umfärben kann.
// Die Toleranz kommt aus demselben Regler.
export function selectByColor(e) {
  const c = cellFromEventClamped(e);
  const grid = getGrid();
  const { hit, count } = magicWandRegion(grid, getPal(), c.x, c.y, state.wandTolerance);
  if (!count) { clearSelection(); renderEditor(); return 0; }

  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < hit.length; y++) for (let x = 0; x < hit[y].length; x++) {
    if (!hit[y][x]) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const rect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  const mask = [];
  for (let y = 0; y < rect.h; y++) {
    const row = [];
    for (let x = 0; x < rect.w; x++) row.push(hit[minY + y][minX + x]);
    mask.push(row);
  }

  selection.float = null;
  selection.path = null;
  selection.mode = null;
  selection.rect = rect;
  selection.mask = mask;
  renderEditor();
  return count;
}

// ────────────────────────────────────────────────────────────────────
// Auswahl einfärben — alle gewählten Pixel auf die aktuelle Farbe
// ────────────────────────────────────────────────────────────────────
export function fillSelection() {
  const r = selection.rect;
  if (!r) return 0;
  const grid = getGrid();
  const { W, H } = gridSize();
  let n = 0;
  recordOp(() => {
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      if (!inMask(selection.mask, x, y)) continue;
      const gx = r.x + x, gy = r.y + y;
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      if (grid[gy][gx] !== state.curColor) { grid[gy][gx] = state.curColor; n++; }
    }
  });
  afterChange();
  return n;
}

// ────────────────────────────────────────────────────────────────────
// Befehle (Tastatur / Werkzeugleiste)
// ────────────────────────────────────────────────────────────────────
export function selectAll() {
  const { W, H } = gridSize();
  selection.float = null;
  selection.mask = null;
  selection.path = null;
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
    const cells = readSel(grid, r, selection.mask);
    clearSel(grid, r, selection.mask);
    setRectPos(r, r.x + dx, r.y + dy);
    stampCells(grid, cells, r.x, r.y);
  });
  afterChange();
  return true;
}

// Die Form wandert mit in die Zwischenablage — eingefügt wird wieder genau sie.
export function copySelection() {
  if (!selection.rect) return 0;
  clipboard = {
    cells: readSel(getGrid(), selection.rect, selection.mask),
    mask: selection.mask ? selection.mask.map(row => [...row]) : null,
  };
  return maskCount(selection.rect, selection.mask);
}

export function cutSelection() {
  if (!selection.rect) return 0;
  copySelection();
  let n = 0;
  recordOp(() => { n = clearSel(getGrid(), selection.rect, selection.mask); });
  afterChange();
  return n;
}

export function deleteSelection() {
  if (!selection.rect) return 0;
  let n = 0;
  recordOp(() => { n = clearSel(getGrid(), selection.rect, selection.mask); });
  afterChange();
  return n;
}

export function hasClipboard() { return !!clipboard; }

// Einfügen an der Ecke der aktuellen Auswahl, sonst links oben. Das
// Eingefügte wird zur neuen Auswahl und ist damit sofort verschiebbar.
export function pasteClipboard() {
  if (!clipboard || !getSprite()) return 0;
  const { W, H } = gridSize();
  const h = clipboard.cells.length, w = clipboard.cells[0].length;
  const x = Math.max(0, Math.min(W - w, selection.rect ? selection.rect.x : 0));
  const y = Math.max(0, Math.min(H - h, selection.rect ? selection.rect.y : 0));

  let n = 0;
  recordOp(() => { n = stampCells(getGrid(), clipboard.cells, x, y); });
  selection.float = null;
  selection.path = null;
  selection.mode = null;
  selection.rect = { x, y, w, h };
  selection.mask = clipboard.mask ? clipboard.mask.map(row => [...row]) : null;
  afterChange();
  return n;
}

// Text für die Statuszeile.
export function selectionInfo(prefix = '') {
  if (selection.mode === 'lasso') {
    return `${prefix || 'Form ziehen'} — ${(selection.path || []).length} Stützpunkte, Loslassen schließt die Form`;
  }
  const r = selection.rect;
  if (!r) return 'Keine Auswahl';
  const head = `${prefix}${prefix ? ' — ' : ''}Auswahl ${r.w}×${r.h} bei (${r.x}, ${r.y})`;
  return selection.mask ? `${head} · ${maskCount(r, selection.mask)} Pixel` : head;
}
