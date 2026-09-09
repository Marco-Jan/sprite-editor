// ════════════════════════════════════════════════════════════════════
// SPRITEFX — Bild→Sprite-Helfer: Quantisierung, Glätten, Outline, Zauberstab
// ════════════════════════════════════════════════════════════════════
// Reine Funktionen auf dem Grid (0 | Palette-Index | "#RRGGBB"). Mutieren das
// übergebene Grid in-place (Aufrufer wrappt in recordOp + renderAll).
import { cellToColor } from './render.js';

// ── Farb-Helfer ──────────────────────────────────────────────────────
export function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b]
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}
function cellRgb(cell, pal) {
  const c = cellToColor(cell, pal); // löst Index→Hex auf, gibt null bei transparent
  return c ? hexToRgb(c) : null;
}
function dist2(a, b) {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

// ── Median-Cut Quantisierung ─────────────────────────────────────────
// pixels: Array von {r,g,b}; gibt bis zu maxColors repräsentative {r,g,b}.
export function medianCut(pixels, maxColors) {
  if (!pixels.length || maxColors < 1) return [];

  const ranges = bk => {
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (const p of bk) {
      if (p.r < rmin) rmin = p.r; if (p.r > rmax) rmax = p.r;
      if (p.g < gmin) gmin = p.g; if (p.g > gmax) gmax = p.g;
      if (p.b < bmin) bmin = p.b; if (p.b > bmax) bmax = p.b;
    }
    return { r: rmax - rmin, g: gmax - gmin, b: bmax - bmin };
  };

  let buckets = [pixels.slice()];
  while (buckets.length < maxColors) {
    let bi = -1, best = -1, chan = 'r';
    buckets.forEach((bk, i) => {
      if (bk.length < 2) return;
      const rg = ranges(bk);
      const m = Math.max(rg.r, rg.g, rg.b);
      if (m > best) {
        best = m; bi = i;
        chan = (rg.r >= rg.g && rg.r >= rg.b) ? 'r' : (rg.g >= rg.b ? 'g' : 'b');
      }
    });
    if (bi < 0) break; // nichts mehr teilbar
    const bk = buckets[bi];
    bk.sort((a, b) => a[chan] - b[chan]);
    const mid = bk.length >> 1;
    buckets.splice(bi, 1, bk.slice(0, mid), bk.slice(mid));
  }

  return buckets.filter(b => b.length).map(bk => {
    let r = 0, g = 0, b = 0;
    for (const p of bk) { r += p.r; g += p.g; b += p.b; }
    const n = bk.length;
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  });
}

// Nächste Farbe aus einer {r,g,b}-Palette.
export function nearestColor(rgb, palette) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = dist2(rgb, palette[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return palette[best];
}

// ── Glätten / Despeckle (Majority-Filter, 8er-Nachbarschaft) ─────────
// Einzelne Streupixel verschwinden: liegt ein Pixel "allein", wird es auf die
// Mehrheitsfarbe seiner Nachbarn gesetzt. Gibt die Anzahl geänderter Zellen.
export function despeckleGrid(grid) {
  const H = grid.length, W = grid[0].length;
  const src = grid.map(r => r.slice()); // Snapshot — keine Kaskade in einem Durchlauf
  let changed = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const counts = new Map(); // key -> { val, count }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const v = src[ny][nx], k = String(v);
          const e = counts.get(k);
          if (e) e.count++; else counts.set(k, { val: v, count: 1 });
        }
      }
      let topVal = null, topCount = 0;
      for (const e of counts.values()) if (e.count > topCount) { topCount = e.count; topVal = e.val; }
      if (topCount >= 5 && String(topVal) !== String(src[y][x])) {
        grid[y][x] = topVal; changed++;
      }
    }
  }
  return changed;
}

// ── Outline um nicht-transparente Pixel ──────────────────────────────
// Setzt transparente Zellen, die an gefüllte grenzen (4er-Nachbarschaft), auf
// colorVal. `thickness` Durchläufe = dickere Kante. Gibt Anzahl neuer Pixel.
export function outlineGrid(grid, colorVal, thickness) {
  const H = grid.length, W = grid[0].length;
  let added = 0;
  for (let t = 0; t < thickness; t++) {
    const toFill = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x] !== 0) continue;
        if ((x > 0 && grid[y][x - 1] !== 0) || (x < W - 1 && grid[y][x + 1] !== 0) ||
            (y > 0 && grid[y - 1][x] !== 0) || (y < H - 1 && grid[y + 1][x] !== 0)) {
          toFill.push([x, y]);
        }
      }
    }
    if (!toFill.length) break;
    for (const [x, y] of toFill) { grid[y][x] = colorVal; added++; }
  }
  return added;
}

// ── Zauberstab: zusammenhängende ähnliche Farbe löschen ──────────────
// Flood-Fill ab (sx,sy) über 4er-Nachbarn, deren Farbe innerhalb der Toleranz
// (0-100 %) zur Startfarbe liegt → auf transparent (0). Gibt gelöschte Anzahl.
// Zusammenhängende Fläche ähnlicher Farbe ab (sx,sy) einsammeln.
// Gibt boolean[H][W] zurück — die Grundlage für Zauberstab UND Farbauswahl.
export function magicWandRegion(grid, pal, sx, sy, tolerancePct) {
  const H = grid.length, W = grid[0].length;
  const start = cellRgb(grid[sy][sx], pal);
  const startTransparent = start === null;
  const linear = (tolerancePct / 100) * Math.sqrt(3 * 255 * 255);
  const tol2 = linear * linear;

  const seen = Array.from({ length: H }, () => new Array(W).fill(false));
  const hit  = Array.from({ length: H }, () => new Array(W).fill(false));
  const stack = [[sx, sy]];
  let count = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H || seen[y][x]) continue;
    seen[y][x] = true;
    const rgb = cellRgb(grid[y][x], pal);
    if (startTransparent) {
      if (rgb !== null) continue;            // nur weitere transparente Zellen
    } else {
      if (rgb === null) continue;            // transparente Zellen stoppen
      if (dist2(rgb, start) > tol2) continue; // zu unterschiedlich → stoppen
    }
    hit[y][x] = true;
    count++;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return { hit, count };
}

export function magicWandDelete(grid, pal, sx, sy, tolerancePct) {
  const { hit } = magicWandRegion(grid, pal, sx, sy, tolerancePct);
  let removed = 0;
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
    if (hit[y][x] && grid[y][x] !== 0) { grid[y][x] = 0; removed++; }
  }
  return removed;
}

// ── Auto-Hintergrund: vom Rand her ähnliche Flächen löschen ──────────
// Annahme: Hintergrund = was am Bildrand hängt. Flutet von allen Randzellen
// nach innen und löscht Zellen, solange der Farbunterschied zur jeweils
// gerade besuchten Zelle innerhalb der Toleranz bleibt (folgt Verläufen,
// stoppt am Farbsprung zum Motiv). Gibt gelöschte Anzahl.
export function autoRemoveBackground(grid, pal, tolerancePct) {
  const H = grid.length, W = grid[0].length;
  const linear = (tolerancePct / 100) * Math.sqrt(3 * 255 * 255);
  const tol2 = linear * linear;

  const seen = Array.from({ length: H }, () => new Array(W).fill(false));
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push([x, 0], [x, H - 1]); }
  for (let y = 0; y < H; y++) { stack.push([0, y], [W - 1, y]); }

  let removed = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H || seen[y][x]) continue;
    seen[y][x] = true;
    const cur = cellRgb(grid[y][x], pal); // Originalfarbe vor dem Löschen
    if (grid[y][x] !== 0) { grid[y][x] = 0; removed++; }

    const nbrs = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of nbrs) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny][nx]) continue;
      const nb = cellRgb(grid[ny][nx], pal);
      let ok;
      if (cur === null)      ok = (nb === null);          // transparent → nur weiter transparent
      else if (nb === null)  ok = true;                   // bereits leer → einfach weiter
      else                   ok = dist2(cur, nb) <= tol2; // ähnlich genug → Hintergrund
      if (ok) stack.push([nx, ny]);
    }
  }
  return removed;
}
