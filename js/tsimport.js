// ════════════════════════════════════════════════════════════════════
// IMPORT — Sprite-Dateien einlesen, alle Ausgabeformate als Eingabe
// ════════════════════════════════════════════════════════════════════
// Gegenstück zu codegen.js: was der Editor schreiben kann, liest er auch
// wieder ein. Das Format wird am Inhalt erkannt, nicht an der Dateiendung —
// so klappt auch Einfügen aus der Zwischenablage.
//
//   Array-Formate  TypeScript, JavaScript, JSON, Python
//                  → number[][] plus optionaler Palettenblock, verlustfrei
//   SVG            → <rect>-Liste, auch mit zusammengefassten Läufen
//   CSS            → box-shadow-Liste
//   C-Header       → #define _WIDTH/_HEIGHT, _PALETTE[] und flaches _DATA[]
//   Text-Raster    → ein Zeichen pro Pixel plus Legende
//
// Bei den Array-Formaten bleiben die Indizes erhalten: Werte oberhalb von
// MAX_IDX gehören zu freien Farben und werden wieder zu "#rrggbb"-Pixeln.
// Die vier bildhaften Formate kennen keine Indizes, dort werden die Farben
// in der Reihenfolge ihres Auftretens neu durchnummeriert (siehe
// gridFromColors) — inhaltlich gleich, die Nummern können sich verschieben.
import { MAX_IDX } from './data.js';

// ── Hex normalisieren: #abc → #aabbcc, Großbuchstaben → klein ──
function normalizeHex(h) {
  let s = String(h).trim();
  if (s[0] !== '#') s = '#' + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  if (/^#[0-9a-fA-F]{8}$/.test(s)) s = s.slice(0, 7); // Alpha abschneiden
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

// ── Das erste balancierte [[ … ]] im Text finden und auswerten ──
function extractGrid(text) {
  const start = text.search(/\[\s*\[/);
  if (start === -1) return null;

  let depth = 0, end = -1, inStr = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;

  const src = text.slice(start, end + 1);
  // Nur Zahlen, Hex-Strings, Klammern, Kommas und Whitespace zulassen — damit
  // hier garantiert kein fremder Code ausgeführt wird.
  if (!/^[\s\[\],0-9'"#a-fA-F_-]*$/.test(src)) return null;

  let arr;
  try {
    arr = JSON.parse(src.replace(/'/g, '"').replace(/,(\s*[\]}])/g, '$1'));
  } catch {
    return null;
  }
  if (!Array.isArray(arr) || !arr.length || !Array.isArray(arr[0])) return null;

  // Rechteckig machen + Zellen validieren.
  const width = Math.max(...arr.map(r => (Array.isArray(r) ? r.length : 0)));
  if (!width) return null;
  const grid = [];
  for (const row of arr) {
    if (!Array.isArray(row)) return null;
    const out = [];
    for (let x = 0; x < width; x++) {
      const v = row[x];
      if (v === undefined) { out.push(0); continue; }
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) { out.push(v); continue; }
      const hex = typeof v === 'string' ? normalizeHex(v) : null;
      if (hex) { out.push(hex); continue; }
      return null;
    }
    grid.push(out);
  }
  return grid;
}

// ── Alle "index: '#hex'"-Paare im Text einsammeln ──
// Im Grid-Array gibt es keine Doppelpunkte, deshalb ist ein globaler Scan
// gefahrlos und robuster als das Zerlegen des Objekt-Literals.
function extractPalette(text) {
  const out = {};
  // Der Index darf auch in Anführungszeichen stehen — so liest der Parser
  // den JSON-Export ("1": "#aabbcc") genauso wie den TS-Block (1: '#aabbcc').
  const re = /(?:^|[{,\s])['"]?(\d{1,3})['"]?\s*:\s*['"]\s*(#?[0-9a-fA-F]{3,8})\s*['"]/g;
  let m;
  while ((m = re.exec(text))) {
    const idx = Number(m[1]);
    const hex = normalizeHex(m[2]);
    if (hex && idx >= 1 && idx <= 999 && out[idx] === undefined) out[idx] = hex;
  }
  return Object.keys(out).length ? out : null;
}

// ── Namen der Grid-Konstante finden ──
function extractName(text) {
  // Bevorzugt die Deklaration, die auf ein Array zeigt.
  const m = text.match(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*\[/);
  if (m) return m[1];
  // JSON-Export: { "name": "Held", … }
  const j = text.match(/["']name["']\s*:\s*["']([^"']+)["']/);
  if (j) return j[1];
  const p = text.match(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)_PALETTE\b/);
  return p ? p[1] : null;
}

// ════════════════════════════════════════════════════════════════════
// Formate ohne Indizes: SVG, CSS, C-Header, Text-Raster
// ════════════════════════════════════════════════════════════════════

// Farbraster ("#rrggbb" | null) → Grid + Palette.
// Die ersten MAX_IDX Farben bekommen die Indizes 1..9, alles darüber bleibt
// als freie Hex-Farbe stehen — genauso hält es der Editor selbst.
function gridFromColors(colors, w, h) {
  const order = [];
  const index = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colors[y][x];
      if (c && !index.has(c)) { index.set(c, order.push(c)); }
    }
  }
  const palette = {};
  for (const [hex, i] of index) if (i <= MAX_IDX) palette[i] = hex;

  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const c = colors[y][x];
      if (!c) { row.push(0); continue; }
      const i = index.get(c);
      row.push(i <= MAX_IDX ? i : c);   // darüber: freie Farbe
    }
    grid.push(row);
  }
  return { grid, palette: Object.keys(palette).length ? palette : null };
}

function emptyColors(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill(null));
}

// ── SVG ─────────────────────────────────────────────────────────────
// Gelesen wird die viewBox für die Maße und jedes <rect>. Rechtecke dürfen
// breiter als ein Feld sein: unser eigener Export fasst waagerechte Läufe
// gleicher Farbe zusammen.
function parseSvg(text) {
  const vb = text.match(/viewBox\s*=\s*["']\s*0\s+0\s+([\d.]+)\s+([\d.]+)/i);
  const rects = [...text.matchAll(/<rect\b[^>]*>/gi)].map(m => m[0]);
  if (!rects.length) return { ok: false, error: 'SVG erkannt, aber kein <rect> darin gefunden.' };

  const attr = (tag, name) => {
    const m = tag.match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)', 'i'));
    return m ? m[1].trim() : null;
  };

  const items = [];
  let maxX = 0, maxY = 0;
  for (const tag of rects) {
    const fill = normalizeHex(attr(tag, 'fill') || '');
    if (!fill) continue;                       // none, url(...), currentColor
    const x = Math.round(Number(attr(tag, 'x') || 0));
    const y = Math.round(Number(attr(tag, 'y') || 0));
    const w = Math.max(1, Math.round(Number(attr(tag, 'width') || 1)));
    const h = Math.max(1, Math.round(Number(attr(tag, 'height') || 1)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    items.push({ x, y, w, h, fill });
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  if (!items.length) return { ok: false, error: 'SVG erkannt, aber kein <rect> mit Füllfarbe gefunden.' };

  const W = Math.max(1, vb ? Math.round(Number(vb[1])) : maxX);
  const H = Math.max(1, vb ? Math.round(Number(vb[2])) : maxY);
  if (W > 512 || H > 512) return { ok: false, error: `SVG ist ${W}×${H} groß — das Raster wäre zu fein.` };

  const colors = emptyColors(W, H);
  for (const r of items) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x >= 0 && y >= 0 && x < W && y < H) colors[y][x] = r.fill;
      }
    }
  }
  return { ok: true, ...gridFromColors(colors, W, H) };
}

// ── CSS box-shadow ──────────────────────────────────────────────────
// Jeder Schatten ist ein Pixel: "12px 3px 0 #aabbcc". Der Unschärfe-Wert
// darf fehlen, wie ihn viele von Hand geschriebene Sprites weglassen.
function parseCss(text) {
  const block = text.match(/box-shadow\s*:([\s\S]*?);/i);
  if (!block) return { ok: false, error: 'Kein box-shadow-Block gefunden.' };

  // Nach den beiden Versaetzen duerfen Unschaerfe und Spreizung folgen —
  // mit oder ohne Einheit. Unser eigener Export schreibt dort eine nackte 0.
  const re = /(-?\d+)px\s+(-?\d+)px(?:\s+-?\d+(?:px)?){0,2}\s*(#[0-9a-fA-F]{3,8})/g;
  const pts = [];
  let m, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  while ((m = re.exec(block[1]))) {
    const hex = normalizeHex(m[3]);
    if (!hex) continue;
    const x = Number(m[1]), y = Number(m[2]);
    pts.push({ x, y, hex });
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!pts.length) return { ok: false, error: 'box-shadow gefunden, aber keine Pixel darin gelesen.' };

  const W = maxX - minX + 1, H = maxY - minY + 1;
  if (W > 512 || H > 512) return { ok: false, error: `Das ergäbe ${W}×${H} Pixel — zu groß.` };

  const colors = emptyColors(W, H);
  for (const p of pts) colors[p.y - minY][p.x - minX] = p.hex;
  return { ok: true, ...gridFromColors(colors, W, H) };
}

// ── C-Header ────────────────────────────────────────────────────────
// Erwartet Breite und Höhe als #define, eine Palette aus 0xRRGGBB-Werten
// und ein flaches Indexfeld. Index 0 bleibt transparent.
function parseCHeader(text) {
  const wm = text.match(/#define\s+\w*_?WIDTH\s+(\d+)/i);
  const hm = text.match(/#define\s+\w*_?HEIGHT\s+(\d+)/i);
  if (!wm || !hm) return { ok: false, error: 'C-Header ohne _WIDTH und _HEIGHT — Maße unbekannt.' };
  const W = Number(wm[1]), H = Number(hm[1]);
  if (!W || !H || W > 512 || H > 512) return { ok: false, error: `Maße ${W}×${H} sind nicht brauchbar.` };

  const palBlock = text.match(/_PALETTE\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\}/i);
  const palette = {};
  const free = {};   // Indizes oberhalb der Palette = freie Farben
  if (palBlock) {
    const vals = [...palBlock[1].matchAll(/0x([0-9a-fA-F]{6})/g)].map(m => '#' + m[1].toLowerCase());
    // Feld 0 ist der Transparenz-Platzhalter des Exports.
    vals.forEach((hex, i) => {
      if (i < 1) return;
      if (i <= MAX_IDX) palette[i] = hex;
      else free[i] = hex;
    });
  }

  const dataBlock = text.match(/_DATA\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\}/i);
  if (!dataBlock) return { ok: false, error: 'C-Header ohne _DATA-Feld — keine Pixel gefunden.' };
  const flat = [...dataBlock[1].matchAll(/\d+/g)].map(m => Number(m[0]));
  if (flat.length < W * H) {
    return { ok: false, error: `_DATA hat ${flat.length} Werte, für ${W}×${H} braucht es ${W * H}.` };
  }

  const grid = [];
  for (let y = 0; y < H; y++) {
    grid.push(flat.slice(y * W, y * W + W).map(v => (free[v] !== undefined ? free[v] : v)));
  }
  return { ok: true, grid, palette: Object.keys(palette).length ? palette : null };
}

// ── Text-Raster ─────────────────────────────────────────────────────
// Ein Zeichen pro Pixel, '.' ist transparent. Die Legende darunter ordnet
// jedem Zeichen eine Farbe zu; ohne Legende bleiben die Indizes trotzdem.
const TXT_CHARS = '.123456789abcdefghijklmnopqrstuvwxyz';

function parseTextRaster(text) {
  const lines = text.split(/\r?\n/);

  // Legende: "  a = #a3b1c2  (Index 10)"
  const legend = new Map();
  for (const l of lines) {
    const m = l.match(/^\s*(\S)\s*=\s*(#[0-9a-fA-F]{3,8})/);
    if (m && TXT_CHARS.includes(m[1])) {
      const hex = normalizeHex(m[2]);
      if (hex) legend.set(m[1], hex);
    }
  }

  // Der Rasterblock: mehrere aufeinanderfolgende Zeilen gleicher Länge,
  // die nur aus Rasterzeichen bestehen und mindestens ein '.' oder eine
  // Ziffer enthalten. Der laengste solche Block gewinnt.
  const isRow = l => l.length >= 2 && /^[.0-9a-z]+$/.test(l) && /[.1-9]/.test(l);
  let best = null, cur = [];
  const flush = () => {
    if (cur.length >= 2 && (!best || cur.length > best.length)) best = cur;
    cur = [];
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (isRow(l) && (!cur.length || l.length === cur[0].length)) cur.push(l);
    else flush();
  }
  flush();
  if (!best) return { ok: false, error: 'Kein Zeichenraster gefunden (gleich lange Zeilen aus . und 1-9).' };

  const H = best.length, W = best[0].length;
  if (W > 512 || H > 512) return { ok: false, error: `Raster ist ${W}×${H} — zu groß.` };

  const grid = [];
  const palette = {};
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      const ch = best[y][x];
      const idx = TXT_CHARS.indexOf(ch);
      if (idx <= 0) { row.push(0); continue; }        // '.' oder unbekannt
      const hex = legend.get(ch);
      if (idx <= MAX_IDX) {
        row.push(idx);
        if (hex) palette[idx] = hex;
      } else {
        row.push(hex || 0);                            // ohne Legende verloren
      }
    }
    grid.push(row);
  }
  return { ok: true, grid, palette: Object.keys(palette).length ? palette : null };
}

// ── Format am Inhalt erkennen ───────────────────────────────────────
// Reihenfolge zaehlt: die Array-Formate zuletzt, weil ein C-Header ebenfalls
// geschweifte Bloecke voller Zahlen enthaelt.
function detectFormat(text) {
  if (/<svg[\s>]/i.test(text) && /<rect\b/i.test(text)) return 'svg';
  if (/box-shadow\s*:/i.test(text)) return 'css';
  if (/#define\s+\w*_?(WIDTH|HEIGHT)\b/i.test(text) || /\b(uint8_t|uint32_t)\b/.test(text)) return 'c';
  if (/\[\s*\[/.test(text)) return 'array';
  return 'txt';
}

// ────────────────────────────────────────────────────────────────────
// Öffentliche Parse-Funktion
// ────────────────────────────────────────────────────────────────────
// Rückgabe:
//   { ok: true,  grid, palette, freeColors, name, stats }
//   { ok: false, error }
const FORMAT_LABEL = {
  svg: 'SVG', css: 'CSS', c: 'C-Header', txt: 'Text-Raster', array: 'Array',
};

export function parseTsSprite(text) {
  if (!text || !text.trim()) return { ok: false, error: 'Nichts eingefügt.' };

  // Die vier bildhaften Formate haben ihren eigenen Weg; sie liefern Grid
  // und Palette bereits fertig und brauchen die Index-Wiederherstellung
  // unten nicht.
  const fmt = detectFormat(text);
  if (fmt !== 'array') {
    const parse = { svg: parseSvg, css: parseCss, c: parseCHeader, txt: parseTextRaster }[fmt];
    const r = parse(text);
    if (!r.ok) return r;
    const unknown = new Set();
    if (r.palette) {
      const known = new Set([0, ...Object.keys(r.palette).map(Number)]);
      for (const row of r.grid) for (const c of row) {
        if (typeof c === 'number' && !known.has(c)) unknown.add(c);
      }
    }
    return {
      ok: true,
      grid: r.grid,
      palette: r.palette,
      name: extractName(text),
      stats: {
        w: r.grid[0].length,
        h: r.grid.length,
        paletteCount: r.palette ? Object.keys(r.palette).length : 0,
        restored: 0,
        unknown: [...unknown].sort((a, b) => a - b),
        format: FORMAT_LABEL[fmt],
      },
    };
  }

  const grid = extractGrid(text);
  if (!grid) {
    return { ok: false, error: 'Kein gültiges number[][]-Array gefunden. Erwartet wird [[0,1,…], …].' };
  }

  const all = extractPalette(text);
  let palette = null;   // Indizes 1..MAX_IDX → gehen in eine Palette
  let freeColors = null; // Indizes > MAX_IDX → werden zu Roh-Pixeln im Grid
  if (all) {
    palette = {};
    freeColors = {};
    for (const [k, hex] of Object.entries(all)) {
      const i = Number(k);
      if (i <= MAX_IDX) palette[i] = hex;
      else freeColors[i] = hex;
    }
    if (!Object.keys(palette).length) palette = null;
    if (!Object.keys(freeColors).length) freeColors = null;
  }

  // Freie Farben zurück ins Grid schreiben (verlustfreier Round-Trip).
  let restored = 0;
  if (freeColors) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const v = grid[y][x];
        if (typeof v === 'number' && freeColors[v]) { grid[y][x] = freeColors[v]; restored++; }
      }
    }
  }

  // Indizes, die weder Palette noch freie Farbe kennen — Hinweis wert.
  const known = new Set([0, ...(palette ? Object.keys(palette).map(Number) : [])]);
  const unknown = new Set();
  if (palette) {
    for (const row of grid) for (const c of row) {
      if (typeof c === 'number' && !known.has(c)) unknown.add(c);
    }
  }

  return {
    ok: true,
    grid,
    palette,
    name: extractName(text),
    stats: {
      w: grid[0].length,
      h: grid.length,
      paletteCount: palette ? Object.keys(palette).length : 0,
      restored,
      unknown: [...unknown].sort((a, b) => a - b),
      format: 'Array',
    },
  };
}
