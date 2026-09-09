// ════════════════════════════════════════════════════════════════════
// TRANSFORM — spiegeln, drehen, zuschneiden, zentrieren, Größe ändern
// ════════════════════════════════════════════════════════════════════
// Zwei Wirkungsbereiche, eine Bedienung: gibt es eine Auswahl, trifft die
// Aktion nur sie — sonst den ganzen Sprite. Das ist die Konvention aus jedem
// Bildbearbeiter und spart einen Haufen Knöpfe.
//
// Auf einer Auswahl wird NICHT im Grid gerechnet: der Inhalt wird angehoben
// (siehe selection.js) und alle Drehungen und Spiegelungen passieren am
// schwebenden Puffer. Sonst läse jede weitere Drehung den Untergrund mit und
// würde ihn beim nächsten Schritt ausstanzen.
//
// Aktionen auf dem ganzen Sprite laufen durch recordOp() und sind damit ein
// einzelner Undo-Schritt — auch wenn dabei das Grid komplett getauscht wird:
// history.js vergleicht die Grids als Ganzes.
import { selection, getSprite, clearSelection } from './state.js';
import { renderAll, renderEditor } from './render.js';
import { saveState } from './storage.js';
import { recordOp, beginStroke, commitStroke } from './history.js';
import { ensureFloating, commitFloat } from './selection.js';

// ────────────────────────────────────────────────────────────────────
// Kleine Helfer
// ────────────────────────────────────────────────────────────────────
function emptyRows(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill(0));
}

function hasSelection() {
  return !!selection.rect;
}

// ── Reine 2D-Array-Operationen ──────────────────────────────────────
const flipRowsH = a => a.map(row => [...row].reverse());
const flipRowsV = a => [...a].reverse();

// 90° im Uhrzeigersinn: aus h×w wird w×h.
function rotateRows(a) {
  const h = a.length, w = a[0].length;
  const out = emptyRows(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x][h - 1 - y] = a[y][x];
  return out;
}

// Nach der Änderung: alles neu zeichnen und sichern.
function done() {
  renderAll();
  saveState();
}

// ────────────────────────────────────────────────────────────────────
// Spiegeln
// ────────────────────────────────────────────────────────────────────
export function flip(axis) {
  const sp = getSprite();
  if (!sp) return null;
  const flipFn = axis === 'h' ? flipRowsH : flipRowsV;

  if (hasSelection()) {
    ensureFloating();
    selection.float = flipFn(selection.float);
    // Die Form spiegelt mit, sonst passt der Rahmen nicht mehr zum Inhalt.
    if (selection.mask) selection.mask = flipFn(selection.mask);
    done();
    return 'Auswahl';
  }

  recordOp(() => { sp.grid = flipFn(sp.grid); });
  done();
  return 'Sprite';
}

// ────────────────────────────────────────────────────────────────────
// Drehen (90° im Uhrzeigersinn)
// ────────────────────────────────────────────────────────────────────
export function rotate90() {
  const sp = getSprite();
  if (!sp) return null;

  if (hasSelection()) {
    ensureFloating();
    const r = selection.rect;
    const cells = rotateRows(selection.float);
    const newMask = selection.mask ? rotateRows(selection.mask).map(row => row.map(Boolean)) : null;

    // Um die Mitte drehen, damit die Auswahl nicht wegspringt.
    const H = sp.grid.length, W = sp.grid[0].length;
    const nw = r.h, nh = r.w;
    let nx = Math.round(r.x + (r.w - nw) / 2);
    let ny = Math.round(r.y + (r.h - nh) / 2);
    nx = Math.max(1 - nw, Math.min(W - 1, nx));
    ny = Math.max(1 - nh, Math.min(H - 1, ny));

    selection.rect = { x: nx, y: ny, w: nw, h: nh };
    selection.mask = newMask;
    selection.float = cells;
    done();
    return 'Auswahl';
  }

  commitFloat(); // erst absetzen, sonst verfällt der Inhalt beim Abwählen
  recordOp(() => { sp.grid = rotateRows(sp.grid); });
  clearSelection();
  done();
  return 'Sprite';
}

// ────────────────────────────────────────────────────────────────────
// Freie Drehung um einen beliebigen Winkel
// ────────────────────────────────────────────────────────────────────
// Gedreht wird per Rückwärts-Abbildung: für jedes Zielpixel wird gefragt,
// welches Quellpixel dort landet (Nearest Neighbor). Das ist die Methode für
// Pixel-Art — es wird nichts gemischt, jede Zelle behält ihren Palette-Index.
//
// Jede Vorschau rechnet vom UNBERÜHRTEN Original in `live`. Würde man den
// Winkel schrittweise auf das schon gedrehte Ergebnis anwenden, wäre die Form
// nach dreimal Ziehen am Regler Matsch.
let live = null; // { scope, cells, mask, rect } | null

// Zellen (und Maske) um `deg` Grad im Uhrzeigersinn drehen.
// grow = true: das Ergebnis bekommt die Bounding-Box der gedrehten Form, es
// geht also nichts verloren. grow = false: Größe bleibt, Ecken fallen weg.
export function rotateCells(cells, mask, deg, grow = true) {
  const h = cells.length, w = cells[0].length;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);

  const nw = grow ? Math.max(1, Math.ceil(Math.abs(w * cos) + Math.abs(h * sin))) : w;
  const nh = grow ? Math.max(1, Math.ceil(Math.abs(w * sin) + Math.abs(h * cos))) : h;

  const scx = w / 2, scy = h / 2;    // Mitte der Quelle
  const dcx = nw / 2, dcy = nh / 2;  // Mitte des Ziels

  const outCells = emptyRows(nw, nh);
  const outMask = Array.from({ length: nh }, () => new Array(nw).fill(false));

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      // Von der Zielmitte aus zurückdrehen → Quellkoordinate
      const dx = x + 0.5 - dcx, dy = y + 0.5 - dcy;
      const sx = Math.floor(dx * cos + dy * sin + scx);
      const sy = Math.floor(-dx * sin + dy * cos + scy);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      if (mask && !mask[sy][sx]) continue;
      outCells[y][x] = cells[sy][sx];
      outMask[y][x] = true;
    }
  }
  return { cells: outCells, mask: outMask, w: nw, h: nh };
}

export function isRotating() { return !!live; }

// Original sichern. Bei einer Auswahl schwebt der Inhalt dafür sowieso schon.
export function beginFreeRotate() {
  if (live) return true;
  const sp = getSprite();
  if (!sp) return false;

  if (hasSelection()) {
    ensureFloating();
    live = {
      scope: 'Auswahl',
      cells: selection.float.map(row => [...row]),
      mask: selection.mask ? selection.mask.map(row => [...row]) : null,
      rect: { ...selection.rect },
    };
  } else {
    beginStroke(); // ganzer Sprite: eigener Undo-Schritt für die Dreh-Sitzung
    live = {
      scope: 'Sprite',
      cells: sp.grid.map(row => [...row]),
      mask: null,
      rect: { x: 0, y: 0, w: sp.grid[0].length, h: sp.grid.length },
    };
  }
  return true;
}

// Vorschau auf den Winkel setzen — immer vom Original gerechnet.
export function previewFreeRotate(deg) {
  if (!live) return null;
  const sp = getSprite();
  if (!sp) return null;

  if (live.scope === 'Auswahl') {
    const rot = rotateCells(live.cells, live.mask, deg, true);
    // Um die Mitte der ursprünglichen Auswahl drehen.
    const H = sp.grid.length, W = sp.grid[0].length;
    const cx = live.rect.x + live.rect.w / 2;
    const cy = live.rect.y + live.rect.h / 2;
    const nx = Math.max(1 - rot.w, Math.min(W - 1, Math.round(cx - rot.w / 2)));
    const ny = Math.max(1 - rot.h, Math.min(H - 1, Math.round(cy - rot.h / 2)));

    selection.rect = { x: nx, y: ny, w: rot.w, h: rot.h };
    selection.mask = rot.mask;
    selection.float = rot.cells; // schwebt weiter, das Grid bleibt unberührt
    renderEditor();
    return { scope: 'Auswahl', w: rot.w, h: rot.h };
  }

  // Ganzer Sprite: Größe bleibt, damit ein 24×24-Sprite 24×24 bleibt.
  const rot = rotateCells(live.cells, null, deg, false);
  sp.grid = rot.cells;
  renderEditor();
  return { scope: 'Sprite', w: rot.w, h: rot.h };
}

// Winkel festschreiben. Bei einer Auswahl schwebt das Ergebnis weiter —
// abgesetzt wird es wie immer beim Abwählen.
export function applyFreeRotate() {
  if (!live) return null;
  const scope = live.scope;
  live = null;
  if (scope === 'Sprite') commitStroke();
  done();
  return scope;
}

// Zurück auf Anfang — Original wieder einsetzen.
export function cancelFreeRotate() {
  if (!live) return false;
  const sp = getSprite();
  if (sp) {
    if (live.scope === 'Auswahl') {
      selection.rect = { ...live.rect };
      selection.mask = live.mask ? live.mask.map(row => [...row]) : null;
      selection.float = live.cells.map(row => [...row]);
    } else {
      sp.grid = live.cells.map(row => [...row]);
      commitStroke(); // Grid ist wieder wie vorher → landet nicht im Undo-Stack
    }
  }
  live = null;
  done();
  return true;
}

// ────────────────────────────────────────────────────────────────────
// Inhalts-Rechteck (alles, was nicht transparent ist)
// ────────────────────────────────────────────────────────────────────
export function contentBounds(grid) {
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    if (grid[y][x] === 0) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ────────────────────────────────────────────────────────────────────
// Auf den Inhalt zuschneiden
// ────────────────────────────────────────────────────────────────────
export function trimToContent() {
  const sp = getSprite();
  if (!sp) return null;
  commitFloat(); // was noch in der Luft hängt, gehört ins Bild
  const b = contentBounds(sp.grid);
  if (!b) return { ok: false, reason: 'leer' };
  if (b.w === sp.grid[0].length && b.h === sp.grid.length) return { ok: false, reason: 'nichts abzuschneiden' };

  recordOp(() => {
    sp.grid = Array.from({ length: b.h }, (_, y) =>
      Array.from({ length: b.w }, (_, x) => sp.grid[b.y + y][b.x + x]));
  });
  clearSelection();
  done();
  return { ok: true, w: b.w, h: b.h };
}

// ────────────────────────────────────────────────────────────────────
// Inhalt mittig setzen
// ────────────────────────────────────────────────────────────────────
export function centerContent() {
  const sp = getSprite();
  if (!sp) return null;
  commitFloat(); // was noch in der Luft hängt, gehört ins Bild
  const b = contentBounds(sp.grid);
  if (!b) return { ok: false, reason: 'leer' };

  const H = sp.grid.length, W = sp.grid[0].length;
  const dx = Math.round((W - b.w) / 2) - b.x;
  const dy = Math.round((H - b.h) / 2) - b.y;
  if (!dx && !dy) return { ok: false, reason: 'schon mittig' };

  recordOp(() => {
    const out = emptyRows(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = sp.grid[y][x];
      if (v === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) out[ny][nx] = v;
    }
    sp.grid = out;
  });
  clearSelection();
  done();
  return { ok: true, dx, dy };
}

// ────────────────────────────────────────────────────────────────────
// Bildgröße ändern (Leinwand, nicht skalieren)
// ────────────────────────────────────────────────────────────────────
// anchor: 'topleft' | 'center' — wohin der alte Inhalt in der neuen Fläche
// rutscht. Was nicht mehr hineinpasst, fällt weg.
export function resizeCanvas(newW, newH, anchor = 'center') {
  const sp = getSprite();
  if (!sp) return null;
  commitFloat();
  const W = sp.grid[0].length, H = sp.grid.length;
  newW = Math.max(1, Math.min(256, Math.round(newW) || W));
  newH = Math.max(1, Math.min(256, Math.round(newH) || H));
  if (newW === W && newH === H) return { ok: false, reason: 'unverändert' };

  const dx = anchor === 'center' ? Math.round((newW - W) / 2) : 0;
  const dy = anchor === 'center' ? Math.round((newH - H) / 2) : 0;

  let lost = 0;
  recordOp(() => {
    const out = emptyRows(newW, newH);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = sp.grid[y][x];
      if (v === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < newW && ny < newH) out[ny][nx] = v;
      else lost++;
    }
    sp.grid = out;
  });
  clearSelection();
  done();
  return { ok: true, w: newW, h: newH, lost };
}

// ────────────────────────────────────────────────────────────────────
// Bild skalieren (Nearest Neighbor — Pixel bleiben Pixel)
// ────────────────────────────────────────────────────────────────────
export function scaleSprite(factor) {
  const sp = getSprite();
  if (!sp) return null;
  commitFloat();
  const W = sp.grid[0].length, H = sp.grid.length;
  const newW = Math.round(W * factor), newH = Math.round(H * factor);
  if (newW < 1 || newH < 1) return { ok: false, reason: 'zu klein' };
  if (newW > 256 || newH > 256) return { ok: false, reason: 'über 256 Pixel' };

  recordOp(() => {
    sp.grid = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) =>
        sp.grid[Math.min(H - 1, Math.floor(y / factor))][Math.min(W - 1, Math.floor(x / factor))]));
  });
  clearSelection();
  done();
  return { ok: true, w: newW, h: newH };
}

// Für die Statuszeile: worauf würde eine Aktion gerade wirken?
export function scopeLabel() {
  return hasSelection() ? 'Auswahl' : 'Sprite';
}
