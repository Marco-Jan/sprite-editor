// ════════════════════════════════════════════════════════════════════
// TS-IMPORT — TypeScript-/JS-Sprite-Dateien einlesen (Grid + Palette)
// ════════════════════════════════════════════════════════════════════
// Gegenstück zu updateOutput() in render.js. Erwartet Text in der Form:
//
//   export const HELD_PALETTE: Record<number, string> = {
//     1: '#F5D98A', 2: '#E8B84B', 10: '#a3b1c2',
//   };
//   export const HELD: number[][] = [
//     [0,1,2],
//     …
//   ];
//
// Beides ist optional-kombinierbar: nur ein Array geht auch, nur mit Palette
// wird es aber erst verlustfrei. Indizes oberhalb von MAX_IDX gehören zu
// freien Farben und werden beim Import wieder zu "#rrggbb"-Pixeln.
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
  const re = /(?:^|[{,\s])(\d{1,3})\s*:\s*['"]\s*(#?[0-9a-fA-F]{3,8})\s*['"]/g;
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
  const p = text.match(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)_PALETTE\b/);
  return p ? p[1] : null;
}

// ────────────────────────────────────────────────────────────────────
// Öffentliche Parse-Funktion
// ────────────────────────────────────────────────────────────────────
// Rückgabe:
//   { ok: true,  grid, palette, freeColors, name, stats }
//   { ok: false, error }
export function parseTsSprite(text) {
  if (!text || !text.trim()) return { ok: false, error: 'Nichts eingefügt.' };

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
    },
  };
}
