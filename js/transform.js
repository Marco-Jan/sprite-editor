// ════════════════════════════════════════════════════════════════════
// TRANSFORM — spiegeln, drehen, zuschneiden, zentrieren, Größe ändern
// ════════════════════════════════════════════════════════════════════
// Zwei Wirkungsbereiche, eine Bedienung: gibt es eine Auswahl, trifft die
// Aktion nur sie — sonst den ganzen Sprite. Das ist die Konvention aus jedem
// Bildbearbeiter und spart einen Haufen Knöpfe.
//
// Alles läuft durch recordOp(), ist also ein einzelner Undo-Schritt. Auch
// Aktionen, die das Grid komplett austauschen (drehen, zuschneiden, Größe),
// sind damit umkehrbar: history.js vergleicht die Grids als Ganzes.
import { selection, getSprite, clearSelection } from './state.js';
import { renderAll } from './render.js';
import { saveState } from './storage.js';
import { recordOp } from './history.js';

// ────────────────────────────────────────────────────────────────────
// Kleine Helfer
// ────────────────────────────────────────────────────────────────────
function emptyRows(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill(0));
}

function hasSelection() {
  return !!selection.rect;
}

// Zellen der Auswahl herausnehmen (außerhalb der Maske: 0).
function readSel(grid, r, mask) {
  const H = grid.length, W = grid[0].length;
  const out = [];
  for (let y = 0; y < r.h; y++) {
    const row = [];
    for (let x = 0; x < r.w; x++) {
      const gx = r.x + x, gy = r.y + y;
      const inMask = !mask || !!mask[y][x];
      row.push(inMask && gx >= 0 && gy >= 0 && gx < W && gy < H ? grid[gy][gx] : 0);
    }
    out.push(row);
  }
  return out;
}

function clearSel(grid, r, mask) {
  const H = grid.length, W = grid[0].length;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (mask && !mask[y][x]) continue;
    const gx = r.x + x, gy = r.y + y;
    if (gx >= 0 && gy >= 0 && gx < W && gy < H) grid[gy][gx] = 0;
  }
}

function stamp(grid, cells, ox, oy) {
  const H = grid.length, W = grid[0].length;
  for (let y = 0; y < cells.length; y++) for (let x = 0; x < cells[y].length; x++) {
    const v = cells[y][x];
    if (v === 0) continue;
    const gx = ox + x, gy = oy + y;
    if (gx >= 0 && gy >= 0 && gx < W && gy < H) grid[gy][gx] = v;
  }
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
    const r = selection.rect;
    recordOp(() => {
      const cells = flipFn(readSel(sp.grid, r, selection.mask));
      clearSel(sp.grid, r, selection.mask);
      stamp(sp.grid, cells, r.x, r.y);
    });
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
    const r = selection.rect;
    const cells = rotateRows(readSel(sp.grid, r, selection.mask));
    const newMask = selection.mask ? rotateRows(selection.mask).map(row => row.map(Boolean)) : null;

    // Um die Mitte drehen, damit die Auswahl nicht wegspringt, dann in
    // das Grid zurückholen.
    const H = sp.grid.length, W = sp.grid[0].length;
    const nw = r.h, nh = r.w;
    let nx = Math.round(r.x + (r.w - nw) / 2);
    let ny = Math.round(r.y + (r.h - nh) / 2);
    nx = Math.max(0, Math.min(W - Math.min(nw, W), nx));
    ny = Math.max(0, Math.min(H - Math.min(nh, H), ny));

    recordOp(() => {
      clearSel(sp.grid, r, selection.mask);
      stamp(sp.grid, cells, nx, ny);
    });
    selection.rect = { x: nx, y: ny, w: nw, h: nh };
    selection.mask = newMask;
    done();
    return 'Auswahl';
  }

  recordOp(() => { sp.grid = rotateRows(sp.grid); });
  clearSelection();
  done();
  return 'Sprite';
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

// ────────────────────────────────────────────────────────────────────
// Auswahl-Inhalt in einen neuen Sprite auslagern
// ────────────────────────────────────────────────────────────────────
// Braucht createSprite von außen (app.js reicht es herein), damit dieses
// Modul nicht die halbe Sprite-Verwaltung importieren muss.
export function selectionToCells() {
  const sp = getSprite();
  if (!sp || !selection.rect) return null;
  return readSel(sp.grid, selection.rect, selection.mask);
}

// Für die Statuszeile: worauf würde eine Aktion gerade wirken?
export function scopeLabel() {
  return hasSelection() ? 'Auswahl' : 'Sprite';
}
