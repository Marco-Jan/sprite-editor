// ════════════════════════════════════════════════════════════════════
// LIGHT — Lichtquelle: Kantenlicht und Schlagschatten per Knopfdruck
// ════════════════════════════════════════════════════════════════════
// Ein 2D-Sprite kennt seine Form nicht. Darum wird hier nicht "echt"
// beleuchtet, sondern so, wie man es in Pixel-Art von Hand macht:
//
//   Kantenlicht — Pixel, an deren Lichtseite (in Richtung der Lampe)
//   innerhalb von `width` Schritten Leere liegt, werden heller; Pixel mit
//   Leere auf der abgewandten Seite dunkler. Liegt auf BEIDEN Seiten Leere
//   (eine 1-Pixel-Linie), bleibt der Pixel, wie er ist.
//
//   Schlagschatten — eine Kopie der Silhouette, von der Lampe weg versetzt,
//   nur in bisher leere Zellen gemalt.
//
// Farben: Palette-Pixel (Nummer) bekommen eine hellere/dunklere Farbe
// derselben Farbfamilie aus der Palette — der Sprite bleibt in seiner
// Palette. Gibt es keine passende, bleibt der Pixel unverändert, außer
// `allowHex` ist an: dann wird die berechnete Farbe als "#rrggbb" gesetzt.
// Freie Farben ("#rrggbb") werden immer direkt berechnet, mit dem üblichen
// Kniff: Licht etwas wärmer, Schatten etwas kühler.
//
// Reine Rechnung auf dem Grid, ohne DOM — läuft unter Node
// (tests/light.test.js). Mutiert das Grid; der Aufrufer wrappt in recordOp.

/** Richtung, AUS der das Licht kommt: dx, dy ∈ {-1, 0, 1}; y wächst nach unten. */
/** @typedef {{dx: number, dy: number}} LightDir */

const GRAY_SAT = 0.15;   // darunter gilt eine Farbe als Grau (wie palorder.js)
const HUE_FAMILY = 40;   // so weit darf der Farbton einer Abstufung abweichen
const HUE_SHIFT = 12;    // Licht wärmer, Schatten kühler (nur freie Farben)

// ── Farb-Helfer ──────────────────────────────────────────────────────
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** @typedef {[number, number, number]} Rgb */
/** @returns {Rgb} */
function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
/** @param {Rgb} rgb */
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
/** @param {Rgb} rgb */
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
/** @returns {Rgb} */
function hslToRgb({ h, s, l }) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Farbe um `amount` (0..1 Helligkeit) heller (sign +1) oder dunkler (-1).
 * Licht wandert dabei leicht Richtung Gelb (60°), Schatten Richtung Blau (240°).
 */
export function shiftHex(hex, sign, amount) {
  const c = rgbToHsl(hexToRgb(hex));
  const l = Math.max(0, Math.min(1, c.l + sign * amount));
  let h = c.h;
  if (c.s >= GRAY_SAT) {
    const goal = sign > 0 ? 60 : 240;
    const d = ((goal - h + 540) % 360) - 180; // kürzester Weg zum Ziel-Farbton
    h += Math.sign(d) * Math.min(Math.abs(d), HUE_SHIFT);
  }
  return rgbToHex(hslToRgb({ h, s: c.s, l }));
}

/**
 * Hellere/dunklere Palettenfarbe derselben Familie, möglichst nah an der
 * Wunschfarbe. null = keine passende da.
 * @param {Record<number, string>} pal
 */
export function paletteStep(pal, index, sign, amount) {
  const base = pal[index];
  if (!isHex(base)) return null;
  const bc = rgbToHsl(hexToRgb(base));
  const goal = hexToRgb(shiftHex(base, sign, amount));
  let best = null, bd = Infinity;
  for (const k of Object.keys(pal)) {
    const i = Number(k);
    const hex = pal[i];
    if (i === index || !isHex(hex) || hex.toLowerCase() === base.toLowerCase()) continue;
    const c = rgbToHsl(hexToRgb(hex));
    if (sign > 0 ? c.l <= bc.l + 0.02 : c.l >= bc.l - 0.02) continue;
    // Gleiche Familie: Grau zu Grau, Farbe zu ähnlichem Farbton. Ganz helle
    // bzw. ganz dunkle Töne (fast Weiß/Schwarz) passen zu allem.
    const extreme = sign > 0 ? c.l > 0.92 : c.l < 0.08;
    const family = bc.s < GRAY_SAT ? c.s < GRAY_SAT
      : c.s >= GRAY_SAT && hueDist(c.h, bc.h) <= HUE_FAMILY;
    if (!family && !extreme) continue;
    const d = dist2(hexToRgb(hex), goal) + (extreme && !family ? 4000 : 0);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ── Kantenlicht ──────────────────────────────────────────────────────
/**
 * @param {any[][]} grid  0 | Palette-Nummer | "#rrggbb"
 * @param {Record<number, string>} pal
 * @param {LightDir} dir
 * @param {{width?: number, amount?: number, highlight?: boolean, shadow?: boolean,
 *          allowHex?: boolean, inside?: (x: number, y: number) => boolean}} [opts]
 * @returns {{lit: number, shaded: number}}
 */
export function lightGrid(grid, pal, dir, opts = {}) {
  const { width = 1, amount = 0.15, highlight = true, shadow = true, allowHex = false } = opts;
  const inside = opts.inside || (() => true);
  const H = grid.length, W = grid[0].length;
  const src = grid.map(r => r.slice());
  const empty = (x, y) => x < 0 || y < 0 || x >= W || y >= H || !src[y][x];
  // Leere innerhalb von `width` Schritten in Richtung (sx, sy)?
  const open = (x, y, sx, sy) => {
    for (let k = 1; k <= width; k++) if (empty(x + sx * k, y + sy * k)) return true;
    return false;
  };
  const shifted = (v, sign) => {
    if (isHex(v)) return shiftHex(v, sign, amount);
    if (typeof v === 'number') {
      const i = paletteStep(pal, v, sign, amount);
      if (i != null) return i;
      if (allowHex && isHex(pal[v])) return shiftHex(pal[v], sign, amount);
    }
    return v;
  };
  let lit = 0, shaded = 0;
  if (!dir.dx && !dir.dy) return { lit, shaded };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = src[y][x];
      if (!v || !inside(x, y)) continue;
      const toLight = open(x, y, dir.dx, dir.dy);
      const away = open(x, y, -dir.dx, -dir.dy);
      if (toLight === away) continue;
      const sign = toLight ? 1 : -1;
      if (sign > 0 ? !highlight : !shadow) continue;
      const nv = shifted(v, sign);
      if (nv === v) continue;
      grid[y][x] = nv;
      if (sign > 0) lit++; else shaded++;
    }
  }
  return { lit, shaded };
}

// ── Schlagschatten ───────────────────────────────────────────────────
/**
 * Silhouette um `distance` von der Lampe weg versetzt in leere Zellen malen.
 * @param {any[][]} grid
 * @param {LightDir} dir
 * @param {any} value  Schattenfarbe (Palette-Nummer oder "#rrggbb")
 * @param {number} [distance]
 * @param {(x: number, y: number) => boolean} [inside]
 * @returns {number} gemalte Pixel
 */
export function dropShadowGrid(grid, dir, value, distance = 1, inside = () => true) {
  const H = grid.length, W = grid[0].length;
  if ((!dir.dx && !dir.dy) || !value) return 0;
  const src = grid.map(r => r.slice());
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (src[y][x] || !inside(x, y)) continue;
      // Wirft ein Pixel zwischen 1 und `distance` Schritten zur Lampe hin hierher Schatten?
      for (let k = 1; k <= distance; k++) {
        const sx = x + dir.dx * k, sy = y + dir.dy * k;
        if (sx >= 0 && sy >= 0 && sx < W && sy < H && src[sy][sx] && inside(sx, sy)) {
          grid[y][x] = value; n++;
          break;
        }
      }
    }
  }
  return n;
}
