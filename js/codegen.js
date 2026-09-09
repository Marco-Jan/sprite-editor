// ════════════════════════════════════════════════════════════════════
// CODEGEN — den aktuellen Sprite in verschiedene Textformate gießen
// ════════════════════════════════════════════════════════════════════
// Alle Formate arbeiten auf derselben Vorbereitung (siehe prepare()):
// Palette-Indizes bleiben Indizes, freie Hex-Pixel bekommen Indizes
// oberhalb der Palette. Damit ist jedes Format in sich geschlossen —
// wer den Text kopiert, hat auch die Farben dabei.
//
// Zurück in den Editor kommen TypeScript, JavaScript und JSON (der Parser
// in tsimport.js liest alle drei). Die übrigen Formate sind Einbahnstraßen
// für die Weiterverwendung außerhalb.
import { getSprite, getPal, getMaxIdx } from './state.js';
import { cellToColor } from './data.js';

// Umlaute und ß ausschreiben, statt sie zu Unterstrichen zu zerlegen —
// „Held Grün“ soll HELD_GRUEN heißen und nicht HELD_GR_N.
const TRANSLIT = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'å': 'a', 'æ': 'ae', 'ø': 'oe' };

function deumlaut(name) {
  return String(name || '')
    .replace(/[äöüßåæø]/gi, c => {
      const rep = TRANSLIT[c.toLowerCase()] || c;
      return c === c.toUpperCase() ? rep.toUpperCase() : rep;
    })
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // e-Akzent wird zu e
}

// Sprite-Name → gültiger Bezeichner (SCREAMING_SNAKE, nie mit Ziffer beginnend).
export function tsIdentifier(name) {
  let id = deumlaut(name || 'SPRITE')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  if (!id) id = 'SPRITE';
  if (/^[0-9]/.test(id)) id = 'S_' + id;
  return id;
}

// Sprite-Name → Dateiname-tauglicher Kleinbuchstaben-Slug.
function slug(name) {
  const s = deumlaut(name || 'sprite')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'sprite';
}

// ────────────────────────────────────────────────────────────────────
// Gemeinsame Vorbereitung
// ────────────────────────────────────────────────────────────────────
// idxGrid   — reines number[][] (freie Farben als Index maxIdx+1, +2, …)
// entries   — [[index, '#hex'], …] aller tatsächlich benutzten Farben
// colorAt   — (x,y) → '#hex' | null
function prepare() {
  const sp = getSprite();
  if (!sp) return null;

  const grid = sp.grid;
  const pal = getPal();
  const maxIdx = getMaxIdx();
  const H = grid.length, W = grid[0].length;

  // Freie Hex-Pixel auf Indizes oberhalb der Palette abbilden.
  const rawMap = new Map();
  let next = maxIdx + 1;
  for (const row of grid) for (const c of row) {
    if (typeof c === 'string') {
      const key = c.toLowerCase();
      if (!rawMap.has(key)) rawMap.set(key, next++);
    }
  }

  const idxGrid = grid.map(row => row.map(c =>
    typeof c === 'string' ? rawMap.get(c.toLowerCase()) : c));

  const usedIdx = new Set();
  for (const row of idxGrid) for (const c of row) if (c >= 1) usedIdx.add(c);

  const entries = [];
  for (let i = 1; i <= maxIdx; i++) if (pal[i] && usedIdx.has(i)) entries.push([i, pal[i].toLowerCase()]);
  for (const [hex, i] of rawMap) if (usedIdx.has(i)) entries.push([i, hex]);

  // Alles klein — sonst mischen sich Paletten-Hex (gross) und
  // Pipetten-Hex (klein) im selben Export.
  const colorAt = (x, y) => {
    const c = cellToColor(grid[y][x], pal);
    return c ? c.toLowerCase() : null;
  };

  return { sp, name: sp.name, id: tsIdentifier(sp.name), grid, idxGrid, entries, colorAt, W, H, maxIdx, hasRaw: rawMap.size > 0 };
}

// Zeilen des Grids als "  [0,1,2]," — für alle Array-Sprachen gleich.
function rows(idxGrid, indent = '  ') {
  return idxGrid.map(r => `${indent}[${r.join(',')}]`).join(',\n');
}

// ────────────────────────────────────────────────────────────────────
// TypeScript / JavaScript
// ────────────────────────────────────────────────────────────────────
function buildJsLike(d, withPalette, typed) {
  const t = (x) => (typed ? x : '');
  // Freie Farben ZWINGEN den Palettenblock — ohne ihn wären die Indizes wertlos.
  const wantPal = withPalette || d.hasRaw;

  let out = '';
  if (d.hasRaw) {
    const n = d.entries.filter(([i]) => i > d.maxIdx).length;
    out += `// ${n} freie ${n === 1 ? 'Farbe wurde' : 'Farben wurden'} als `
         + `${n === 1 ? 'Index' : 'Indizes'} ${d.maxIdx + 1}+ gesichert (verlustfrei)\n`;
  }
  if (wantPal) {
    out += `// Palette „${d.sp.palette}“\n`
         + `export const ${d.id}_PALETTE${t(': Record<number, string>')} = {\n`
         + d.entries.map(([i, hex]) => `  ${i}: '${hex}',`).join('\n')
         + '\n};\n\n';
  }
  out += `export const ${d.id}${t(': number[][]')} = [\n${rows(d.idxGrid)},\n];`;
  return out;
}

// ────────────────────────────────────────────────────────────────────
// JSON — sprachneutral, geht wieder zurück in den Editor
// ────────────────────────────────────────────────────────────────────
function buildJson(d) {
  const pal = d.entries.map(([i, hex]) => `    "${i}": "${hex}"`).join(',\n');
  return '{\n'
    + `  "name": "${d.name.replace(/["\\]/g, '\\$&')}",\n`
    + `  "palette": "${d.sp.palette}",\n`
    + `  "width": ${d.W},\n`
    + `  "height": ${d.H},\n`
    + `  "colors": {\n${pal}\n  },\n`
    + `  "grid": [\n${rows(d.idxGrid, '    ')}\n  ]\n`
    + '}';
}

// ────────────────────────────────────────────────────────────────────
// SVG — direkt verwendbar, skaliert verlustfrei
// ────────────────────────────────────────────────────────────────────
// Waagerechte Läufe gleicher Farbe werden zu einem Rechteck zusammengefasst:
// spart bei großen Flächen locker 80 % der Dateigröße.
function buildSvg(d) {
  const parts = [];
  for (let y = 0; y < d.H; y++) {
    let x = 0;
    while (x < d.W) {
      const col = d.colorAt(x, y);
      if (!col) { x++; continue; }
      let len = 1;
      while (x + len < d.W && d.colorAt(x + len, y) === col) len++;
      parts.push(`  <rect x="${x}" y="${y}" width="${len}" height="1" fill="${col}"/>`);
      x += len;
    }
  }
  return `<!-- ${d.name} — ${d.W}×${d.H} -->\n`
    + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.W} ${d.H}" `
    + `width="${d.W * 8}" height="${d.H * 8}" shape-rendering="crispEdges">\n`
    + parts.join('\n')
    + '\n</svg>';
}

// ────────────────────────────────────────────────────────────────────
// CSS — Pixel-Art als box-shadow auf einem einzigen Element
// ────────────────────────────────────────────────────────────────────
function buildCss(d) {
  const shadows = [];
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) {
    const col = d.colorAt(x, y);
    if (col) shadows.push(`    ${x}px ${y}px 0 ${col}`);
  }
  const cls = slug(d.name);
  return `/* ${d.name} — ${d.W}×${d.H}. Benutzung: <div class="${cls}"></div>\n`
    + `   Ein einziges 1×1-Element, hochskaliert. --px stellt die Pixelgröße. */\n`
    + `.${cls} {\n`
    + '  --px: 8;\n'
    + '  width: 1px;\n'
    + '  height: 1px;\n'
    + '  transform: scale(var(--px));\n'
    + '  transform-origin: 0 0;\n'
    + `  margin: 0 ${(d.W - 1)}px ${(d.H - 1)}px 0; /* Platz für die Skalierung */\n`
    + '  box-shadow:\n'
    + shadows.join(',\n')
    + ';\n}';
}

// ────────────────────────────────────────────────────────────────────
// C-Header — Mikrocontroller, LED-Matrix, Embedded
// ────────────────────────────────────────────────────────────────────
function buildCHeader(d) {
  const guard = d.id + '_H';
  const maxUsed = d.entries.length ? Math.max(...d.entries.map(([i]) => i)) : 0;
  const palArr = [];
  for (let i = 0; i <= maxUsed; i++) {
    const hit = d.entries.find(([idx]) => idx === i);
    palArr.push(hit ? `0x${hit[1].slice(1).toUpperCase()}` : '0x000000');
  }
  const body = d.idxGrid.map(r => '  ' + r.map(v => String(v).padStart(2, ' ')).join(', ') + ',').join('\n');

  return `// ${d.name} — ${d.W}×${d.H}, ${d.entries.length} Farben\n`
    + `// Index 0 ist transparent; Farben als 0xRRGGBB.\n`
    + `#ifndef ${guard}\n#define ${guard}\n\n`
    + '#include <stdint.h>\n\n'
    + `#define ${d.id}_WIDTH  ${d.W}\n`
    + `#define ${d.id}_HEIGHT ${d.H}\n\n`
    + `static const uint32_t ${d.id}_PALETTE[${palArr.length}] = {\n  `
    + palArr.join(', ') + '\n};\n\n'
    + `static const uint8_t ${d.id}_DATA[${d.W * d.H}] = {\n${body}\n};\n\n`
    + `#endif // ${guard}\n`;
}

// ────────────────────────────────────────────────────────────────────
// Python — Pygame, Pillow, Skripte
// ────────────────────────────────────────────────────────────────────
function buildPython(d) {
  const pal = d.entries.map(([i, hex]) => `    ${i}: "${hex}",`).join('\n');
  const body = d.idxGrid.map(r => `    [${r.join(', ')}],`).join('\n');
  return `# ${d.name} — ${d.W}×${d.H}. Index 0 ist transparent.\n`
    + `${d.id}_PALETTE = {\n${pal}\n}\n\n`
    + `${d.id} = [\n${body}\n]\n`;
}

// ────────────────────────────────────────────────────────────────────
// Text-Raster — zum Draufschauen, für Diffs und zum Weiterreichen
// ────────────────────────────────────────────────────────────────────
const TXT_CHARS = '.123456789abcdefghijklmnopqrstuvwxyz';

function buildText(d) {
  const body = d.idxGrid.map(r => r.map(v => TXT_CHARS[v] || '?').join('')).join('\n');
  const legend = d.entries.map(([i, hex]) => `  ${TXT_CHARS[i] || '?'} = ${hex}  (Index ${i})`).join('\n');
  return `${d.name} — ${d.W}×${d.H}\n\n${body}\n\n`
    + `Legende ('.' = transparent):\n${legend}\n`;
}

// ────────────────────────────────────────────────────────────────────
// Format-Register
// ────────────────────────────────────────────────────────────────────
// reimport: Kann der Import diesen Text wieder einlesen?
// palOption: Reagiert das Format auf "Palette in den Code schreiben"?
export const CODE_FORMATS = {
  ts:   { label: 'TypeScript',        ext: 'ts',   mime: 'text/plain',     reimport: true,  palOption: true,  upper: true,
          build: (d, p) => buildJsLike(d, p, true) },
  js:   { label: 'JavaScript (ESM)',  ext: 'js',   mime: 'text/javascript', reimport: true, palOption: true,  upper: true,
          build: (d, p) => buildJsLike(d, p, false) },
  json: { label: 'JSON',              ext: 'json', mime: 'application/json', reimport: true, palOption: false, upper: false,
          build: buildJson },
  svg:  { label: 'SVG-Bild',          ext: 'svg',  mime: 'image/svg+xml',  reimport: false, palOption: false, upper: false,
          build: buildSvg },
  css:  { label: 'CSS (box-shadow)',  ext: 'css',  mime: 'text/css',       reimport: false, palOption: false, upper: false,
          build: buildCss },
  c:    { label: 'C-Header (uint8)',  ext: 'h',    mime: 'text/plain',     reimport: false, palOption: false, upper: true,
          build: buildCHeader },
  py:   { label: 'Python',            ext: 'py',   mime: 'text/x-python',  reimport: false, palOption: false, upper: true,
          build: buildPython },
  txt:  { label: 'Text-Raster',       ext: 'txt',  mime: 'text/plain',     reimport: false, palOption: false, upper: false,
          build: buildText },
};

export const DEFAULT_FORMAT = 'ts';

export function getFormat(key) {
  return CODE_FORMATS[key] || CODE_FORMATS[DEFAULT_FORMAT];
}

// Der eigentliche Einstiegspunkt: Text für das gewählte Format.
export function buildCode(formatKey, includePalette) {
  const d = prepare();
  if (!d) return '';
  return getFormat(formatKey).build(d, !!includePalette);
}

// Dateiname passend zum Format — Code-Sprachen bekommen den Bezeichner,
// Assets einen Kleinbuchstaben-Slug.
export function codeFilename(formatKey) {
  const sp = getSprite();
  const fmt = getFormat(formatKey);
  const base = fmt.upper ? tsIdentifier(sp?.name) : slug(sp?.name);
  return `${base}.${fmt.ext}`;
}
