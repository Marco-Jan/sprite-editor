// ════════════════════════════════════════════════════════════════════
// SELECTION — Auswahl: aufziehen, lassoen, ausschneiden, verschieben
// ════════════════════════════════════════════════════════════════════
// Eine Auswahl besteht aus zwei Teilen:
//   rect — die Bounding-Box in Grid-Zellen
//   mask — null bei einem vollen Rechteck, sonst boolean[h][w] relativ
//          zu rect: so trägt dieselbe Mechanik auch Freihandformen.
//
// ── Der schwebende Inhalt ───────────────────────────────────────────
// Sobald eine Auswahl bewegt, gedreht oder gespiegelt wird, wird ihr Inhalt
// EINMAL aus dem Grid gehoben (selection.float) und die Quelle geleert.
// Ab da passiert alles nur noch am schwebenden Puffer; das Grid wird erst
// beim Absetzen wieder angefasst (commitFloat).
//
// Das ist nicht bloß hübsch, es ist notwendig: würde nach jeder Bewegung
// gestempelt und beim nächsten Mal neu aus dem Grid gelesen, läse man den
// Untergrund mit — die Auswahl würde bei jeder weiteren Drehung alles
// mitnehmen und ausstanzen, worüber sie gerade liegt.
//
// Abgesetzt wird automatisch, sobald man etwas anderes tut: neue Auswahl,
// Werkzeugwechsel, Abwählen, Sprite-Wechsel, Undo, Tab schließen.
//
// `selection.owner` hält fest, aus welchem Sprite der Inhalt stammt. Ohne das
// würde er in dem Sprite landen, der beim Absetzen gerade offen ist — beim
// Arbeiten mit einer Ebene also im falschen.
import { state, sprites, selection, getGrid, getSprite, getPal, clearSelection } from './state.js';
import { renderEditor, renderSpriteList, updateOutput, cellFromEventClamped } from './render.js';
import { saveState } from './storage.js';
import { beginStroke, commitStroke, recordOp } from './history.js';
import { magicWandRegion } from './spritefx.js';
import { t } from './i18n.js';

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

// Zellen der Auswahl aus dem Grid kopieren. Außerhalb von Maske oder Grid: 0.
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
// Die Maße kommen aus dem übergebenen Grid, nicht vom aktiven Sprite: beim
// Absetzen kann das ein anderer sein, und der darf andere Maße haben.
function stampCells(grid, cells, ox, oy) {
  const H = grid.length, W = grid[0].length;
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

function countCells(cells) {
  let n = 0;
  for (const row of cells) for (const v of row) if (v !== 0) n++;
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
// Schweben: anheben und absetzen
// ────────────────────────────────────────────────────────────────────
export function isFloating() { return !!selection.float; }

// Inhalt aus dem Grid heben, falls er noch drinsteckt.
// `copy = true` lässt das Original stehen.
export function ensureFloating(copy = false) {
  if (selection.float) return true;
  const r = selection.rect;
  if (!r || !getSprite()) return false;
  beginStroke(); // ein Undo-Schritt für die ganze Schwebe-Sitzung
  selection.float = readSel(getGrid(), r, selection.mask);
  selection.owner = state.curSprite;
  if (!copy) clearSel(getGrid(), r, selection.mask);
  afterChange();
  return true;
}

// Schwebenden Inhalt absetzen — immer in den Sprite, aus dem er kam, auch
// wenn inzwischen ein anderer offen ist.
export function commitFloat() {
  if (!selection.float) return false;
  const target = sprites[selection.owner];
  const cells = selection.float;
  const { x, y } = selection.rect;
  selection.float = null;
  selection.owner = null;

  // Ist der Quell-Sprite inzwischen gelöscht, gibt es nichts mehr zu füllen.
  if (target) stampCells(target.grid, cells, x, y);
  commitStroke();
  afterChange();
  return true;
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
  commitFloat(); // was noch schwebt, wird abgesetzt
  const c = cellFromEventClamped(e);
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
  commitFloat();
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

// Auswahl anfassen. `copy = true` (Alt) lässt eine Kopie zurück.
export function startMove(e, copy) {
  const r = selection.rect;
  if (!r || !getSprite()) return;

  if (selection.float) {
    // Hängt schon in der Luft: bei Alt eine Kopie an der aktuellen Stelle
    // liegen lassen, sonst einfach weiterziehen.
    if (copy) { stampCells(getGrid(), selection.float, r.x, r.y); afterChange(); }
  } else {
    ensureFloating(copy);
  }

  const c = cellFromEventClamped(e);
  selection.grab = { dx: c.x - r.x, dy: c.y - r.y };
  selection.mode = 'move';
  renderEditor();
}

export function updateMove(e) {
  if (selection.mode !== 'move' || !selection.rect) return;
  const c = cellFromEventClamped(e);
  setRectPos(selection.rect, c.x - selection.grab.dx, c.y - selection.grab.dy);
  renderEditor();
}

// pointerup — Ziehen beenden. Der Inhalt bleibt bewusst in der Luft:
// so lässt er sich weiter verschieben und drehen, ohne den Untergrund
// anzurühren. Abgesetzt wird beim Abwählen oder beim nächsten Werkzeug.
export function endSelectionPointer() {
  if (selection.mode === 'move') {
    selection.grab = null;
    selection.mode = null;
    renderEditor();
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
// Auswahl wird und man ihn danach verschieben, drehen oder umfärben kann.
// Die Toleranz kommt aus demselben Regler.
export function selectByColor(e) {
  commitFloat();
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
  let n = 0;

  // Schwebt der Inhalt, wird der Puffer eingefärbt — sonst das Grid.
  if (selection.float) {
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      if (!inMask(selection.mask, x, y)) continue;
      if (selection.float[y][x] !== state.curColor) { selection.float[y][x] = state.curColor; n++; }
    }
    afterChange();
    return n;
  }

  const grid = getGrid();
  const { W, H } = gridSize();
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
  commitFloat();
  const { W, H } = gridSize();
  selection.mask = null;
  selection.path = null;
  selection.rect = { x: 0, y: 0, w: W, h: H };
  selection.mode = null;
  renderEditor();
}

export function deselect() {
  if (!selection.rect) return false;
  commitFloat(); // erst absetzen, dann loslassen — sonst wäre der Inhalt weg
  clearSelection();
  renderEditor();
  return true;
}

// Auswahl um dx/dy Zellen versetzen (Pfeiltasten). Schwebt der Inhalt, ist
// das reines Verschieben des Puffers — kein Lesen, kein Stempeln.
export function nudgeSelection(dx, dy) {
  const r = selection.rect;
  if (!r) return false;
  ensureFloating();
  setRectPos(r, r.x + dx, r.y + dy);
  renderEditor();
  return true;
}

// Der Inhalt der Auswahl — aus der Luft oder aus dem Grid.
function currentCells() {
  if (selection.float) return selection.float.map(row => [...row]);
  return readSel(getGrid(), selection.rect, selection.mask);
}

// Die Form wandert mit in die Zwischenablage — eingefügt wird wieder genau sie.
export function copySelection() {
  if (!selection.rect) return 0;
  clipboard = {
    cells: currentCells(),
    mask: selection.mask ? selection.mask.map(row => [...row]) : null,
  };
  return maskCount(selection.rect, selection.mask);
}

export function cutSelection() {
  if (!selection.rect) return 0;
  copySelection();
  const n = countCells(clipboard.cells);

  if (selection.float) {
    // Hängt schon in der Luft — wegwerfen genügt, das Grid ist dort leer.
    selection.float = null;
    selection.owner = null;
    commitStroke();
  } else {
    recordOp(() => { clearSel(getGrid(), selection.rect, selection.mask); });
  }
  afterChange();
  return n;
}

export function deleteSelection() {
  if (!selection.rect) return 0;
  let n = 0;
  if (selection.float) {
    n = countCells(selection.float);
    selection.float = null;
    selection.owner = null;
    commitStroke();
  } else {
    recordOp(() => { n = clearSel(getGrid(), selection.rect, selection.mask); });
  }
  afterChange();
  return n;
}

export function hasClipboard() { return !!clipboard; }

// Einfügen an der Ecke der aktuellen Auswahl, sonst links oben. Das
// Eingefügte schwebt sofort — man kann es also erst hinschieben und dann
// absetzen, ohne dass unterwegs etwas überschrieben wird.
export function pasteClipboard() {
  if (!clipboard || !getSprite()) return 0;
  commitFloat();

  const { W, H } = gridSize();
  const h = clipboard.cells.length, w = clipboard.cells[0].length;
  const x = Math.max(0, Math.min(W - w, selection.rect ? selection.rect.x : 0));
  const y = Math.max(0, Math.min(H - h, selection.rect ? selection.rect.y : 0));

  beginStroke();
  selection.path = null;
  selection.mode = null;
  selection.rect = { x, y, w, h };
  selection.mask = clipboard.mask ? clipboard.mask.map(row => [...row]) : null;
  selection.float = clipboard.cells.map(row => [...row]);
  selection.owner = state.curSprite;
  afterChange();
  return countCells(selection.float);
}

// Text für die Statuszeile.
export function selectionInfo(prefix = '') {
  if (selection.mode === 'lasso') {
    return t('sel.lasso', {
      prefix: prefix || t('sel.lassoPrefix'),
      n: (selection.path || []).length,
    });
  }
  const r = selection.rect;
  if (!r) return t('sel.none');
  const head = t('sel.rect', {
    prefix: prefix ? `${prefix} — ` : '',
    w: r.w, h: r.h, x: r.x, y: r.y,
  });
  const count = selection.mask ? t('sel.pixels', { n: maskCount(r, selection.mask) }) : '';
  return head + count + (selection.float ? t('sel.floating') : '');
}
