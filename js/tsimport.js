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
//   JSON (Spiel)   → flaches data-Array plus dichte #rrggbbaa-Palette
//
// Animationen kommen mit allen Frames und ihrer Dauer zurück: number[][][]
// mit _DURATIONS bzw. "frames"/"durations", SVG-Gruppen mit data-ms,
// CSS-@keyframes, C mit _FRAMES/_DURATIONS, Text-Blöcke mit "Frame N · ms"
// und der Atlas von JSON (Spiel). Jeder Parser liefert darum
// { frames: [grid, …], durations: [ms, …] | null, palette }.
//
// Bei den Array-Formaten bleiben die Indizes erhalten: alles bis MAX_COLORS
// (255) kommt in die Palette, nur Werte darüber werden wieder zu freien
// "#rrggbb"-Pixeln. Freie Farben aus einem Export landen so in der Palette —
// das Bild sieht gleich aus, die Farben sind danach bloß anwählbar.
// Die vier bildhaften Formate kennen keine Indizes, dort werden die Farben
// in der Reihenfolge ihres Auftretens neu durchnummeriert (siehe
// framesFromColors) — inhaltlich gleich, die Nummern können sich verschieben.
import { MAX_COLORS } from './data.js';
import { t } from './i18n.js';
import { validateGameSprite } from './gamejson.js';

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
// Ein number[][] ist ein Bild, ein number[][][] eine Folge von Frames.
// Rückgabe: [grid, …] (alle gleich groß) oder null.
function extractFrames(text) {
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
  const list = Array.isArray(arr[0][0]) ? arr : [arr];
  const grids = list.map(normalizeGrid);
  if (grids.some(g => !g)) return null;
  return padFrames(grids);
}

// Alle Frames auf dieselbe Größe bringen (die größte), leer aufgefüllt.
function padFrames(grids) {
  const H = Math.max(...grids.map(g => g.length));
  const W = Math.max(...grids.map(g => g[0].length));
  return grids.map(g => Array.from({ length: H }, (_, y) =>
    Array.from({ length: W }, (_, x) => g[y]?.[x] ?? 0)));
}

// Rechteckig machen + Zellen validieren.
function normalizeGrid(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
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

// ── Dauer je Frame: X_DURATIONS = [ … ] (TS/JS/Python) oder "durations": [ … ] ──
function extractDurations(text) {
  const m = text.match(/_DURATIONS\b[^=\n]*=\s*\[([\d\s,]+)\]/) || text.match(/["']durations["']\s*:\s*\[([\d\s,]+)\]/i);
  if (!m) return null;
  const list = m[1].split(',').map(s => Number(s.trim())).filter(v => Number.isFinite(v) && v > 0);
  return list.length ? list : null;
}

// Dauer-Liste nur behalten, wenn sie zu den Frames passt.
const fitDurations = (d, n) => (Array.isArray(d) && d.length === n && n > 1 ? d.map(v => Math.max(10, Math.round(v))) : null);

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
  // Bevorzugt die Deklaration, die auf ein Array zeigt — aber nicht die
  // Dauer-Liste einer Animation, die steht im Export vor dem Bild.
  const decl = [...text.matchAll(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*\[/g)]
    .map(m => m[1]).find(n => !/_DURATIONS$/.test(n));
  if (decl) return decl;
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
// Die ersten MAX_COLORS Farben bekommen die Indizes 1..255, alles darüber bleibt
// als freie Hex-Farbe stehen — genauso hält es der Editor selbst.
// Mehrere Frames teilen sich eine Nummerierung — dieselbe Farbe hat in
// jedem Frame denselben Index.
function framesFromColors(colorFrames, w, h) {
  const order = [];
  const index = new Map();
  for (const colors of colorFrames) for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colors[y][x];
      if (c && !index.has(c)) { index.set(c, order.push(c)); }
    }
  }
  const palette = {};
  for (const [hex, i] of index) if (i <= MAX_COLORS) palette[i] = hex;

  const frames = colorFrames.map(colors => {
    const grid = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const c = colors[y][x];
        if (!c) { row.push(0); continue; }
        const i = index.get(c);
        row.push(i <= MAX_COLORS ? i : c);   // darüber: freie Farbe
      }
      grid.push(row);
    }
    return grid;
  });
  return { frames, palette: Object.keys(palette).length ? palette : null };
}

function emptyColors(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill(null));
}

// ── SVG ─────────────────────────────────────────────────────────────
// Gelesen wird die viewBox für die Maße und jedes <rect>. Rechtecke dürfen
// breiter als ein Feld sein: unser eigener Export fasst waagerechte Läufe
// gleicher Farbe zusammen.
// Mehrere Frames: je Frame eine <g>-Gruppe mit Rechtecken (unser Export
// schreibt dazu data-ms mit der Dauer).
function parseSvg(text) {
  const vb = text.match(/viewBox\s*=\s*["']\s*0\s+0\s+([\d.]+)\s+([\d.]+)/i);
  const rects = [...text.matchAll(/<rect\b[^>]*>/gi)].map(m => m[0]);
  if (!rects.length) return { ok: false, error: t('imp.errSvgNoRect') };

  const groups = [...text.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g>/gi)].filter(m => /<rect\b/i.test(m[2]));
  const parts = groups.length >= 2
    ? groups.map(m => ({ rects: [...m[2].matchAll(/<rect\b[^>]*>/gi)].map(r => r[0]), ms: Number((m[1].match(/data-ms\s*=\s*["'](\d+)/i) || [])[1]) || 0 }))
    : [{ rects, ms: 0 }];

  const attr = (tag, name) => {
    const m = tag.match(new RegExp(name + '\\s*=\\s*["\']([^"\']*)', 'i'));
    return m ? m[1].trim() : null;
  };

  let maxX = 0, maxY = 0, any = false;
  const itemFrames = parts.map(part => {
    const items = [];
    for (const tag of part.rects) {
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
      any = true;
    }
    return items;
  });
  if (!any) return { ok: false, error: t('imp.errSvgNoFill') };

  const W = Math.max(1, vb ? Math.round(Number(vb[1])) : maxX);
  const H = Math.max(1, vb ? Math.round(Number(vb[2])) : maxY);
  if (W > 512 || H > 512) return { ok: false, error: t('imp.errSvgBig', { w: W, h: H }) };

  const colorFrames = itemFrames.map(items => {
    const colors = emptyColors(W, H);
    for (const r of items) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (x >= 0 && y >= 0 && x < W && y < H) colors[y][x] = r.fill;
        }
      }
    }
    return colors;
  });
  return { ok: true, ...framesFromColors(colorFrames, W, H), durations: parts.map(p => p.ms) };
}

// ── CSS box-shadow ──────────────────────────────────────────────────
// Jeder Schatten ist ein Pixel: "12px 3px 0 #aabbcc". Der Unschärfe-Wert
// darf fehlen, wie ihn viele von Hand geschriebene Sprites weglassen.
// Mehrere Frames: eine @keyframes-Regel mit einem box-shadow je Schritt.
// Die Dauer ergibt sich aus den Prozentwerten und der Animationsdauer.
function parseCss(text) {
  const block = text.match(/box-shadow\s*:([\s\S]*?);/i);
  if (!block) return { ok: false, error: t('imp.errCssNoBlock') };

  let blocks = [block[1]], durations = null;
  const kfAt = text.search(/@keyframes\b/i);
  if (kfAt >= 0) {
    const steps = [...text.slice(kfAt).matchAll(/([\d.]+)%\s*\{\s*box-shadow\s*:([\s\S]*?);\s*\}/gi)];
    if (steps.length >= 2) {
      blocks = steps.map(s => s[2]);
      const am = text.match(/animation\s*:[^;]*?\b([\d.]+)(ms|s)\b/i);
      if (am) {
        const total = Number(am[1]) * (am[2].toLowerCase() === 's' ? 1000 : 1);
        const p = steps.map(s => Number(s[1]));
        durations = p.map((v, i) => Math.round(((i + 1 < p.length ? p[i + 1] : 100) - v) / 100 * total));
      }
    }
  }

  // Nach den beiden Versaetzen duerfen Unschaerfe und Spreizung folgen —
  // mit oder ohne Einheit. Unser eigener Export schreibt dort eine nackte 0.
  const re = /(-?\d+)px\s+(-?\d+)px(?:\s+-?\d+(?:px)?){0,2}\s*(#[0-9a-fA-F]{3,8})/g;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ptFrames = blocks.map(b => {
    const pts = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(b))) {
      const hex = normalizeHex(m[3]);
      if (!hex) continue;
      const x = Number(m[1]), y = Number(m[2]);
      pts.push({ x, y, hex });
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return pts;
  });
  if (!ptFrames.some(p => p.length)) return { ok: false, error: t('imp.errCssNoPixel') };

  // Die Versätze zählen ab der linken oberen Ecke des Elements — leere
  // Ränder gehören also mit dazu. Unser Export schreibt die volle Größe
  // zusätzlich als margin (Breite-1, Höhe-1), sonst reicht das Bild bis
  // zum letzten Pixel. Nur negative Versätze verschieben den Ursprung.
  minX = Math.min(0, minX);
  minY = Math.min(0, minY);
  const mg = text.match(/margin\s*:\s*0\s+(\d+)px\s+(\d+)px\s+0/i);
  if (mg && minX === 0 && minY === 0) {
    maxX = Math.max(maxX, Number(mg[1]));
    maxY = Math.max(maxY, Number(mg[2]));
  }
  const W = maxX - minX + 1, H = maxY - minY + 1;
  if (W > 512 || H > 512) return { ok: false, error: t('imp.errCssBig', { w: W, h: H }) };

  const colorFrames = ptFrames.map(pts => {
    const colors = emptyColors(W, H);
    for (const p of pts) colors[p.y - minY][p.x - minX] = p.hex;
    return colors;
  });
  return { ok: true, ...framesFromColors(colorFrames, W, H), durations };
}

// ── C-Header ────────────────────────────────────────────────────────
// Erwartet Breite und Höhe als #define, eine Palette aus 0xRRGGBB-Werten
// und ein flaches Indexfeld. Index 0 bleibt transparent.
function parseCHeader(text) {
  const wm = text.match(/#define\s+\w*_?WIDTH\s+(\d+)/i);
  const hm = text.match(/#define\s+\w*_?HEIGHT\s+(\d+)/i);
  if (!wm || !hm) return { ok: false, error: t('imp.errCNoSize') };
  const W = Number(wm[1]), H = Number(hm[1]);
  if (!W || !H || W > 512 || H > 512) return { ok: false, error: t('imp.errCBadSize', { w: W, h: H }) };

  const palBlock = text.match(/_PALETTE\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\}/i);
  const palette = {};
  const free = {};   // Indizes oberhalb der Palette = freie Farben
  if (palBlock) {
    const vals = [...palBlock[1].matchAll(/0x([0-9a-fA-F]{6})/g)].map(m => '#' + m[1].toLowerCase());
    // Feld 0 ist der Transparenz-Platzhalter des Exports.
    vals.forEach((hex, i) => {
      if (i < 1) return;
      if (i <= MAX_COLORS) palette[i] = hex;
      else free[i] = hex;
    });
  }

  // Mehrere Frames: _DATA[Frames][Pixel] mit inneren Klammern, dazu
  // _FRAMES und _DURATIONS. Kommentare raus, sonst zählen ihre Ziffern mit.
  const dataBlock = text.match(/_DATA\s*(?:\[[^\]]*\]\s*)+=\s*\{([\s\S]*?)\}\s*;/i)
    || text.match(/_DATA\s*\[[^\]]*\]\s*=\s*\{([\s\S]*?)\}/i);
  if (!dataBlock) return { ok: false, error: t('imp.errCNoData') };
  const clean = dataBlock[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const flat = [...clean.matchAll(/\d+/g)].map(m => Number(m[0]));
  const fm = text.match(/#define\s+\w*_?FRAMES\s+(\d+)/i);
  const n = Math.max(1, Math.min(512, fm ? Number(fm[1]) : 1));
  if (flat.length < W * H * n) {
    return { ok: false, error: t('imp.errCShort', { have: flat.length, w: W, h: H * n, need: W * H * n }) };
  }

  const frames = [];
  for (let f = 0; f < n; f++) {
    const grid = [];
    for (let y = 0; y < H; y++) {
      const o = f * W * H + y * W;
      grid.push(flat.slice(o, o + W).map(v => (free[v] !== undefined ? free[v] : v)));
    }
    frames.push(grid);
  }
  const dm = text.match(/_DURATIONS\s*\[[^\]]*\]\s*=\s*\{([^}]*)\}/i);
  const durations = dm ? [...dm[1].matchAll(/\d+/g)].map(m => Number(m[0])) : null;
  return { ok: true, frames, durations, palette: Object.keys(palette).length ? palette : null };
}

// ── Text-Raster ─────────────────────────────────────────────────────
// Ein Zeichen pro Pixel, '.' ist transparent. Die Legende darunter ordnet
// jedem Zeichen eine Farbe zu; ohne Legende bleiben die Indizes trotzdem.
const TXT_CHARS = '.123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

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
  // Ziffer enthalten. Der laengste solche Block gewinnt — außer es gibt
  // Blöcke mit "Frame N · ms"-Zeile davor: das sind die Frames.
  const isRow = l => l.length >= 2 && /^[.0-9a-zA-Z]+$/.test(l) && /[.1-9]/.test(l);
  const blocks = [];
  let cur = [], header = null, pending = null;
  const flush = () => {
    if (cur.length >= 2) blocks.push({ rows: cur, header });
    cur = [];
    header = null;
  };
  for (const raw of lines) {
    const l = raw.trim();
    if (isRow(l) && (!cur.length || l.length === cur[0].length)) {
      if (!cur.length) { header = pending; pending = null; }
      cur.push(l);
      continue;
    }
    flush();
    const hm = l.match(/^Frame\s+\d+\b.*?(\d+)\s*ms\b/i);
    pending = hm ? Number(hm[1]) : (l ? null : pending);
  }
  flush();
  if (!blocks.length) return { ok: false, error: t('imp.errTxtNoGrid') };

  const framed = blocks.filter(b => b.header != null);
  const chosen = framed.length >= 2 ? framed : [blocks.reduce((a, b) => (b.rows.length > a.rows.length ? b : a))];
  const H = Math.max(...chosen.map(b => b.rows.length));
  const W = Math.max(...chosen.map(b => b.rows[0].length));
  if (W > 512 || H > 512) return { ok: false, error: t('imp.errTxtBig', { w: W, h: H }) };

  const palette = {};
  const frames = chosen.map(b => {
    const grid = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        const ch = b.rows[y]?.[x] ?? '.';
        const idx = TXT_CHARS.indexOf(ch);
        if (idx <= 0) { row.push(0); continue; }        // '.' oder unbekannt
        const hex = legend.get(ch);
        if (idx <= MAX_COLORS) {
          row.push(idx);
          if (hex) palette[idx] = hex;
        } else {
          row.push(hex || 0);                            // ohne Legende verloren
        }
      }
      grid.push(row);
    }
    return grid;
  });
  return {
    ok: true, frames,
    durations: chosen.length > 1 ? chosen.map(b => b.header) : null,
    palette: Object.keys(palette).length ? palette : null,
  };
}

// ── JSON (Spiel) ────────────────────────────────────────────────────
// Flaches data-Array (y · width + x), Palette als Liste mit Index 0 =
// transparent. Geprüft wird mit derselben Funktion wie beim Export. Die
// Indizes bleiben erhalten; was über MAX_COLORS liegt, wird wieder zur
// freien Farbe. Die Materialien kommen mit (ohne "none"/"empty") — der
// Import hängt sie an die neue Palette.
function readGameJson(text) {
  try {
    const obj = JSON.parse(text);
    return obj && typeof obj === 'object' && Array.isArray(obj.data) && Array.isArray(obj.palette)
      && 'width' in obj && 'height' in obj ? obj : null;
  } catch { return null; }
}

function parseGame(text) {
  const obj = readGameJson(text);
  try { validateGameSprite(obj); }
  catch (e) {
    const reason = e.code ? t('game.err.' + e.code, e.params) : e.message;
    return { ok: false, error: t('imp.errGame', { reason }) };
  }
  const hex = obj.palette.map(p => normalizeHex(p.color));
  const palette = {}, materials = {};
  for (let i = 1; i < hex.length && i <= MAX_COLORS; i++) {
    if (hex[i]) palette[i] = hex[i];
    const m = obj.palette[i].material;
    if (m && m !== 'none' && m !== 'empty') materials[i] = m;
  }
  const full = [];
  for (let y = 0; y < obj.height; y++) {
    full.push(obj.data.slice(y * obj.width, (y + 1) * obj.width)
      .map(v => (v > MAX_COLORS ? hex[v] : v)));
  }
  // Atlas: der erste Ausschnitt liefert die Frames (nebeneinander).
  let frames = [full], durations = null;
  const region = obj.sprites && Object.values(obj.sprites)[0];
  if (region) {
    const n = region.frames ?? 1;
    frames = Array.from({ length: n }, (_, f) =>
      Array.from({ length: region.h }, (_, y) =>
        full[region.y + y].slice(region.x + f * region.w, region.x + (f + 1) * region.w)));
    if (Array.isArray(obj.durations)) durations = obj.durations.slice(0, n);
  }
  return {
    ok: true, frames, durations,
    palette: Object.keys(palette).length ? palette : null,
    materials: Object.keys(materials).length ? materials : null,
  };
}

// ── Format am Inhalt erkennen ───────────────────────────────────────
// Reihenfolge zaehlt: die Array-Formate zuletzt, weil ein C-Header ebenfalls
// geschweifte Bloecke voller Zahlen enthaelt.
function detectFormat(text) {
  if (/^\s*\{/.test(text) && /"data"\s*:/.test(text) && readGameJson(text)) return 'game';
  if (/<svg[\s>]/i.test(text) && /<rect\b/i.test(text)) return 'svg';
  if (/box-shadow\s*:/i.test(text)) return 'css';
  if (/#define\s+\w*_?(WIDTH|HEIGHT)\b/i.test(text) || /\b(uint8_t|uint16_t|uint32_t)\b/.test(text)) return 'c';
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
  svg: 'SVG', css: 'CSS', c: 'C-Header', txt: 'Text-Raster', game: 'JSON (Spiel)', array: 'Array',
};

/**
 * Was beim Import herauskommt. Entweder `ok: false` mit einem Grund, den man
 * dem Nutzer zeigen kann — oder `ok: true` mit dem fertigen Sprite. Ohne
 * diese Beschreibung musste man sich bisher durch acht `return`-Stellen
 * lesen, um zu wissen, welche Felder es gibt.
 *
 * @typedef {object} ImportStats
 * @property {number} w
 * @property {number} h
 * @property {number} frames
 * @property {number} paletteCount
 * @property {number} restored          aus Rohfarben zurückgewonnene Indizes
 * @property {number[]} unknown         Indizes ohne Platz in der Palette
 * @property {string} format            Name des erkannten Formats
 *
 * @typedef {object} ImportResult
 * @property {boolean} ok
 * @property {string} [error]           Grund, wenn ok === false
 * @property {number[][]} [grid]        erster Frame
 * @property {number[][][]} [frames]    alle Frames
 * @property {number[]} [durations]     Dauer je Frame in ms
 * @property {Record<string, string>|null} [palette]
 * @property {Record<string, string>|null} [materials]
 * @property {string} [name]
 * @property {ImportStats} [stats]
 */

/**
 * Text (TypeScript-Array, SVG, CSS, C-Header, Textraster oder Spiel-JSON)
 * in ein Sprite verwandeln.
 * @param {string} text
 * @returns {ImportResult}
 */
export function parseTsSprite(text) {
  if (!text || !text.trim()) return { ok: false, error: t('imp.nothing') };

  // Die bildhaften Formate und JSON (Spiel) haben ihren eigenen Weg; sie
  // liefern Grid und Palette bereits fertig und brauchen die Index-
  // Wiederherstellung unten nicht.
  const fmt = detectFormat(text);
  if (fmt !== 'array') {
    const parse = { svg: parseSvg, css: parseCss, c: parseCHeader, txt: parseTextRaster, game: parseGame }[fmt];
    /** @type {ImportResult} */
    const r = parse(text);
    if (!r.ok) return r;
    const frames = r.frames || [r.grid];
    const unknown = new Set();
    if (r.palette) {
      const known = new Set([0, ...Object.keys(r.palette).map(Number)]);
      for (const g of frames) for (const row of g) for (const c of row) {
        if (typeof c === 'number' && !known.has(c)) unknown.add(c);
      }
    }
    return {
      ok: true,
      grid: frames[0],
      frames,
      durations: fitDurations(r.durations, frames.length),
      palette: r.palette,
      materials: r.materials || null,
      name: extractName(text),
      stats: {
        w: frames[0][0].length,
        h: frames[0].length,
        frames: frames.length,
        paletteCount: r.palette ? Object.keys(r.palette).length : 0,
        restored: 0,
        unknown: [...unknown].sort((a, b) => a - b),
        format: FORMAT_LABEL[fmt],
      },
    };
  }

  const frames = extractFrames(text);
  if (!frames) {
    return { ok: false, error: t('imp.errNoArray') };
  }
  const grid = frames[0];

  const all = extractPalette(text);
  let palette = null;   // Indizes 1..MAX_COLORS → gehen in eine Palette
  let freeColors = null; // Indizes > MAX_COLORS → werden zu Roh-Pixeln im Grid
  if (all) {
    palette = {};
    freeColors = {};
    for (const [k, hex] of Object.entries(all)) {
      const i = Number(k);
      if (i <= MAX_COLORS) palette[i] = hex;
      else freeColors[i] = hex;
    }
    if (!Object.keys(palette).length) palette = null;
    if (!Object.keys(freeColors).length) freeColors = null;
  }

  // Freie Farben zurück ins Grid schreiben (verlustfreier Round-Trip).
  let restored = 0;
  if (freeColors) {
    for (const g of frames) for (let y = 0; y < g.length; y++) {
      for (let x = 0; x < g[y].length; x++) {
        const v = g[y][x];
        if (typeof v === 'number' && freeColors[v]) { g[y][x] = freeColors[v]; restored++; }
      }
    }
  }

  // Indizes, die weder Palette noch freie Farbe kennen — Hinweis wert.
  const known = new Set([0, ...(palette ? Object.keys(palette).map(Number) : [])]);
  const unknown = new Set();
  if (palette) {
    for (const g of frames) for (const row of g) for (const c of row) {
      if (typeof c === 'number' && !known.has(c)) unknown.add(c);
    }
  }

  return {
    ok: true,
    grid,
    frames,
    durations: fitDurations(extractDurations(text), frames.length),
    palette,
    name: extractName(text),
    stats: {
      w: grid[0].length,
      h: grid.length,
      frames: frames.length,
      paletteCount: palette ? Object.keys(palette).length : 0,
      restored,
      unknown: [...unknown].sort((a, b) => a - b),
      format: 'Array',
    },
  };
}
