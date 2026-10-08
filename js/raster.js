// ════════════════════════════════════════════════════════════════════
// RASTER — Bilder als Ganzes zeichnen statt Pixel für Pixel
// ════════════════════════════════════════════════════════════════════
// Ein fillRect je Pixel ist bei 24×24 egal, bei 1024×1024 sind es eine
// Million Aufrufe je Strich. Hier wird ein Grid stattdessen einmal in ein
// ImageData in Sprite-Größe geschrieben und dann skaliert hingemalt — mit
// harten Kanten (imageSmoothingEnabled = false).
//
// Dazu die Grenze der Zeichenfläche: Browser lehnen riesige Canvas ab (iOS
// ab ~16 Mio. Pixel Fläche). renderScale() wählt darum die Auflösung, mit
// der gezeichnet wird; auf die Zoomstufe gebracht wird per CSS.
import { cellToColor } from './data.js';

const MAX_AREA = 16_000_000;   // Canvas-Fläche, die auch iOS noch annimmt
const MAX_DIM = 8192;          // längste Kante

// Ab dieser Pixelzahl je Bild gilt ein Sprite als groß: dann wird mit
// Zwischenspeichern und Verzögerungen gearbeitet, die bei kleinen Sprites
// nur unnötig wären (render.js, app.js).
export const BIG_PIXELS = 256 * 256;

/** Bildschirm-Pixel je Sprite-Pixel, mit denen der Canvas gezeichnet wird. */
export function renderScale(W, H, cs) {
  return Math.max(1, Math.min(cs,
    Math.floor(Math.sqrt(MAX_AREA / (W * H))),
    Math.floor(MAX_DIM / Math.max(W, H))));
}

// Hex → [r, g, b], einmal gerechnet.
const rgbCache = new Map();
export function rgbOf(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const h = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
    v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    rgbCache.set(hex, v);
  }
  return v;
}

// Wiederverwendete Zwischen-Canvas — je Zweck einer, damit nichts kollidiert.
const pool = new Map();
function scratch(key, w, h) {
  let c = pool.get(key);
  if (!c) { c = document.createElement('canvas'); pool.set(key, c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

/**
 * Grid in ein Canvas in Sprite-Größe schreiben (1 Canvas-Pixel = 1 Sprite-Pixel).
 * @param {HTMLCanvasElement} cv
 * @param {any[][]} grid
 * @param {Record<number,string>} pal
 * @param {number[]|null} [tint]  [r,g,b] statt der echten Farben
 */
export function gridToCanvas(cv, grid, pal, tint = null) {
  const H = grid.length, W = grid[0]?.length || 0;
  if (!W || !H) return cv;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const row = grid[y];
    for (let x = 0; x < W; x++) {
      const v = row[x];
      if (v === 0) continue;
      const hex = cellToColor(v, pal);
      if (!hex) continue;
      const [r, g, b] = tint || rgbOf(hex);
      const o = (y * W + x) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Grid skaliert auf ctx malen: linke obere Ecke bei Sprite-Pixel (dx, dy),
 * r Canvas-Pixel je Sprite-Pixel. Was außerhalb liegt, schneidet der Canvas ab.
 */
export function paintGrid(ctx, grid, pal, dx, dy, r, { alpha = 1, tint = null, key = 'grid' } = {}) {
  if (!grid.length || !grid[0]?.length) return;
  const cv = gridToCanvas(scratch(key, grid[0].length, grid.length), grid, pal, tint);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(cv, dx * r, dy * r, cv.width * r, cv.height * r);
  ctx.restore();
}

/**
 * Wie paintGrid, aber für ein Bild, das schon fertig in einem Canvas in
 * Sprite-Größe steht (Zwischenspeicher der Ebenen, render.js).
 */
export function paintCanvas(ctx, cv, r, alpha = 1) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(cv, 0, 0, cv.width * r, cv.height * r);
  ctx.restore();
}

/**
 * Eine Maske malen: jedes Sprite-Pixel, für das test(x, y) gilt, in einer
 * Farbe (r, g, b, a mit a 0–255).
 */
/** @param {number[]} color  [r, g, b, a] */
export function paintMask(ctx, W, H, r, test, color) {
  const [cr, cg, cb, ca] = color;
  const cv = scratch('mask', W, H);
  const c2 = cv.getContext('2d');
  const img = c2.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!test(x, y)) continue;
    const o = (y * W + x) * 4;
    d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = ca;
  }
  c2.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, 0, 0, W * r, H * r);
  ctx.restore();
}

// Schachbrett in Sprite-Größe — ändert sich nur mit Maßen und Farben.
let checkerKey = '';
export function paintChecker(ctx, W, H, r, c1, c2) {
  const cv = scratch('checker', W, H);
  const key = `${W}x${H}:${c1}:${c2}`;
  if (key !== checkerKey) {
    const x2 = cv.getContext('2d');
    const img = x2.createImageData(W, H);
    const d = img.data;
    const a = rgbOf(c1), b = rgbOf(c2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [cr, cg, cb] = (x + y) % 2 === 0 ? a : b;
      const o = (y * W + x) * 4;
      d[o] = cr; d[o + 1] = cg; d[o + 2] = cb; d[o + 3] = 255;
    }
    x2.putImageData(img, 0, 0);
    checkerKey = key;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, 0, 0, W * r, H * r);
  ctx.restore();
}

/**
 * Kleines Vorschaubild: ein eigenes Canvas in Sprite-Größe, per CSS auf
 * `box` Pixel gebracht (längste Kante). Für Listen und Panels.
 */
export function thumbCanvas(grid, pal, box) {
  const cv = gridToCanvas(document.createElement('canvas'), grid, pal);
  const k = box / Math.max(cv.width, cv.height);
  cv.style.width = Math.max(1, Math.round(cv.width * k)) + 'px';
  cv.style.height = Math.max(1, Math.round(cv.height * k)) + 'px';
  cv.style.imageRendering = 'pixelated';
  cv.style.display = 'block';
  return cv;
}
