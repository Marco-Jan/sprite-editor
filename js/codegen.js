// ════════════════════════════════════════════════════════════════════
// CODEGEN — den aktuellen Sprite in verschiedene Textformate gießen
// ════════════════════════════════════════════════════════════════════
// Alle Formate arbeiten auf derselben Vorbereitung (siehe prepare()):
// Palette-Indizes bleiben Indizes, freie Hex-Pixel bekommen Indizes
// oberhalb der Palette. Damit ist jedes Format in sich geschlossen —
// wer den Text kopiert, hat auch die Farben dabei.
//
// Animationen: jedes Format trägt ALLE Frames samt Dauer — die Array-
// Sprachen als number[][][], SVG und CSS als laufende Animation, C als
// [Frames][Pixel], das Text-Raster als Blöcke untereinander. Mit nur einem
// Frame bleibt jede Ausgabe genau wie vor den Frames.
//
// Alle Formate kommen auch wieder herein — tsimport.js erkennt sie am
// Inhalt. TypeScript, JavaScript, JSON, JSON (Spiel), Python und C-Header
// behalten dabei ihre Farb-Nummern; SVG, CSS und Text-Raster kennen keine
// Indizes, dort werden die Farben beim Import neu durchnummeriert.
import { getSprite, getPal, getMaxIdx, getPalMaterials, flatGrid, frameDuration } from './state.js';
import { cellToColor } from './data.js';
import { gameJson, gameName } from './gamejson.js';
import { t, tn } from './i18n.js';

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
// idxFrames — reines number[][] je Frame (freie Farben als Index maxIdx+1, …)
// idxGrid   — der erste Frame (bei nur einem Frame: das Bild)
// n         — Anzahl Frames; durations — Dauer je Frame in ms
// entries   — [[index, '#hex'], …] aller tatsächlich benutzten Farben
// colorAt   — (x, y, frame = 0) → '#hex' | null
function prepare() {
  const sp = getSprite();
  if (!sp) return null;

  // Exportiert wird, was man sieht: alle sichtbaren Ebenen zusammengefügt.
  const frames = sp.frames.map((_, i) => flatGrid(sp, i));
  const grid = frames[0];
  const pal = getPal();
  const maxIdx = getMaxIdx();
  const H = grid.length, W = grid[0].length;

  // Freie Hex-Pixel auf Indizes oberhalb der Palette abbilden — über alle
  // Frames, damit eine Farbe überall dieselbe Nummer hat.
  const rawMap = new Map();
  let next = maxIdx + 1;
  for (const g of frames) for (const row of g) for (const c of row) {
    if (typeof c === 'string') {
      const key = c.toLowerCase();
      if (!rawMap.has(key)) rawMap.set(key, next++);
    }
  }

  const idxFrames = frames.map(g => g.map(row => row.map(c =>
    typeof c === 'string' ? rawMap.get(c.toLowerCase()) : c)));
  const idxGrid = idxFrames[0];

  const usedIdx = new Set();
  for (const g of idxFrames) for (const row of g) for (const c of row) if (c >= 1) usedIdx.add(c);

  const entries = [];
  for (let i = 1; i <= maxIdx; i++) if (pal[i] && usedIdx.has(i)) entries.push([i, pal[i].toLowerCase()]);
  for (const [hex, i] of rawMap) if (usedIdx.has(i)) entries.push([i, hex]);

  // Alles klein — sonst mischen sich Paletten-Hex (gross) und
  // Pipetten-Hex (klein) im selben Export.
  const colorAt = (x, y, f = 0) => {
    const c = cellToColor(frames[f][y][x], pal);
    return c ? c.toLowerCase() : null;
  };

  const n = frames.length;
  const durations = frames.map((_, i) => frameDuration(sp, i));
  return {
    sp, name: sp.name, id: tsIdentifier(sp.name), grid, idxGrid, idxFrames, n, durations, fps: sp.fps,
    entries, colorAt, W, H, maxIdx, hasRaw: rawMap.size > 0,
  };
}

// Mehrere Frames als Liste von Grids — "[\n  [ … ],\n  [ … ],\n]".
// Bewusst ohne Kommentare zwischen den Klammern: der Import lässt dort nur
// Zahlen und Farben zu.
function frameRows(idxFrames, indent = '  ') {
  return idxFrames.map(g => `${indent}[\n${rows(g, indent + '  ')},\n${indent}]`).join(',\n');
}

// Zeilen des Grids als "  [0,1,2]," — für alle Array-Sprachen gleich.
function rows(idxGrid, indent = '  ') {
  return idxGrid.map(r => `${indent}[${r.join(',')}]`).join(',\n');
}

// ────────────────────────────────────────────────────────────────────
// TypeScript / JavaScript
// ────────────────────────────────────────────────────────────────────
function buildJsLike(d, withPalette, typed) {
  // Nur für TypeScript: die Typannotationen. Bewusst NICHT `t` genannt —
  // das ist die Übersetzungsfunktion, sonst überdeckt der Helfer sie und
  // der rohe Schlüssel `gen.palette` landet als Kommentar in der Datei.
  const ty = (x) => (typed ? x : '');
  // Freie Farben ZWINGEN den Palettenblock — ohne ihn wären die Indizes wertlos.
  const wantPal = withPalette || d.hasRaw;

  let out = '';
  if (d.hasRaw) {
    const n = d.entries.filter(([i]) => i > d.maxIdx).length;
    out += tn('gen.freeSaved', n, { from: d.maxIdx + 1 }) + '\n';
  }
  if (wantPal) {
    out += t('gen.palette', { name: d.sp.palette }) + '\n'
         + `export const ${d.id}_PALETTE${ty(': Record<number, string>')} = {\n`
         + d.entries.map(([i, hex]) => `  ${i}: '${hex}',`).join('\n')
         + '\n};\n\n';
  }
  if (d.n === 1) {
    out += `export const ${d.id}${ty(': number[][]')} = [\n${rows(d.idxGrid)},\n];`;
    return out;
  }
  out += t('gen.framesJs', { n: d.n, id: d.id }) + '\n'
    + `export const ${d.id}_DURATIONS${ty(': number[]')} = [${d.durations.join(', ')}];\n\n`
    + `export const ${d.id}${ty(': number[][][]')} = [\n${frameRows(d.idxFrames)},\n];`;
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
    + (d.n === 1
      ? `  "colors": {\n${pal}\n  },\n`
        + `  "grid": [\n${rows(d.idxGrid, '    ')}\n  ]\n`
      : `  "fps": ${d.fps},\n`
        + `  "durations": [${d.durations.join(', ')}],\n`
        + `  "colors": {\n${pal}\n  },\n`
        + `  "frames": [\n${frameRows(d.idxFrames, '    ')}\n  ]\n`)
    + '}';
}

// ────────────────────────────────────────────────────────────────────
// JSON (Spiel) — flaches data-Array + Palette mit Materialien
// ────────────────────────────────────────────────────────────────────
// Die Palette kommt immer VOLLSTÄNDIG mit (0..maxIdx), damit dieselbe
// Palette in jedem Sprite dieselben Indizes hat. Freie Farben folgen dahinter
// mit ihren Indizes maxIdx+1, … — Material "none", sie haben keinen Slot.
// Validierungsfehler fliegen als GameJsonError nach oben (updateOutput).
// Mehrere Frames liegen als Streifen nebeneinander in `data`; der Atlas
// (`sprites`) nennt Ausschnitt und Anzahl, `durations` die Dauer je Frame.
function buildGame(d) {
  const pal = getPal();
  const colors = [];
  for (let i = 1; i <= d.maxIdx; i++) colors.push(pal[i]);
  for (const [, hex] of d.entries.filter(([i]) => i > d.maxIdx).sort((a, b) => a[0] - b[0])) colors.push(hex);
  const name = deumlaut(d.name);
  if (d.n === 1) return gameJson({ name, idxGrid: d.idxGrid, colors, materials: getPalMaterials() });
  const strip = d.idxGrid.map((_, y) => d.idxFrames.flatMap(g => g[y]));
  return gameJson({
    name, idxGrid: strip, colors, materials: getPalMaterials(),
    sprites: { [gameName(name)]: { x: 0, y: 0, w: d.W, h: d.H, frames: d.n } },
    durations: d.durations,
  });
}

// ────────────────────────────────────────────────────────────────────
// SVG — direkt verwendbar, skaliert verlustfrei
// ────────────────────────────────────────────────────────────────────
// Waagerechte Läufe gleicher Farbe werden zu einem Rechteck zusammengefasst:
// spart bei großen Flächen locker 80 % der Dateigröße.
function svgRects(d, f, indent) {
  const parts = [];
  for (let y = 0; y < d.H; y++) {
    let x = 0;
    while (x < d.W) {
      const col = d.colorAt(x, y, f);
      if (!col) { x++; continue; }
      let len = 1;
      while (x + len < d.W && d.colorAt(x + len, y, f) === col) len++;
      parts.push(`${indent}<rect x="${x}" y="${y}" width="${len}" height="1" fill="${col}"/>`);
      x += len;
    }
  }
  return parts;
}

// Prozentwert für Keyframes, auf zwei Stellen.
const pct = v => Math.round(v * 10000) / 100;

// Mehrere Frames: je Frame eine Gruppe, die per CSS-Animation genau in
// ihrem Zeitfenster sichtbar ist. Ohne CSS (manche Viewer) bleibt Frame 1
// stehen — die anderen sind per Attribut versteckt.
function buildSvg(d) {
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.W} ${d.H}" `
    + `width="${d.W * 8}" height="${d.H * 8}" shape-rendering="crispEdges">\n`;
  if (d.n === 1) {
    return `<!-- ${d.name} — ${d.W}×${d.H} -->\n` + open + svgRects(d, 0, '  ').join('\n') + '\n</svg>';
  }
  const cls = slug(d.name);
  const total = d.durations.reduce((a, b) => a + b, 0);
  const styles = [], groups = [];
  let at = 0;
  d.durations.forEach((ms, i) => {
    const a = pct(at / total), b = pct((at + ms) / total);
    at += ms;
    const name = `${cls}-f${i + 1}`;
    const steps = [];
    if (a > 0) steps.push('0%{visibility:hidden}');
    steps.push(`${a}%{visibility:visible}`);
    steps.push(b < 100 ? `${b}%{visibility:hidden}` : '100%{visibility:visible}');
    styles.push(`    .${name}{animation:${name} ${total}ms step-end infinite}`
      + `@keyframes ${name}{${steps.join('')}}`);
    groups.push(`  <g class="${name}" data-ms="${ms}"${i ? ' visibility="hidden"' : ''}>\n`
      + svgRects(d, i, '    ').join('\n') + '\n  </g>');
  });
  return `<!-- ${d.name} — ${d.W}×${d.H} · ${d.n} Frames, ${total} ms -->\n` + open
    + `  <style>\n${styles.join('\n')}\n  </style>\n`
    + groups.join('\n') + '\n</svg>';
}

// ────────────────────────────────────────────────────────────────────
// CSS — Pixel-Art als box-shadow auf einem einzigen Element
// ────────────────────────────────────────────────────────────────────
function cssShadows(d, f, indent) {
  const shadows = [];
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) {
    const col = d.colorAt(x, y, f);
    if (col) shadows.push(`${indent}${x}px ${y}px 0 ${col}`);
  }
  return shadows.length ? '\n' + shadows.join(',\n') : ' none';
}

// Mehrere Frames: Frame 1 steht am Element, die Animation schaltet per
// step-end hart von Frame zu Frame — nichts wird überblendet.
function buildCss(d) {
  const cls = slug(d.name);
  const total = d.durations.reduce((a, b) => a + b, 0);
  let out = t('gen.cssUsage', { name: d.name, w: d.W, h: d.H, cls }) + '\n'
    + t('gen.cssHint') + '\n'
    + (d.n > 1 ? t('gen.cssAnim', { n: d.n, ms: total }) + '\n' : '')
    + `.${cls} {\n`
    + '  --px: 8;\n'
    + '  width: 1px;\n'
    + '  height: 1px;\n'
    + '  transform: scale(var(--px));\n'
    + '  transform-origin: 0 0;\n'
    + `  margin: 0 ${(d.W - 1)}px ${(d.H - 1)}px 0; ${t('gen.cssMargin')}\n`
    + (d.n > 1 ? `  animation: ${cls}-anim ${total}ms step-end infinite;\n` : '')
    + '  box-shadow:' + cssShadows(d, 0, '    ') + ';\n}';
  if (d.n === 1) return out;
  let at = 0;
  const keys = d.durations.map((ms, i) => {
    const k = `  ${pct(at / total)}% { box-shadow:${cssShadows(d, i, '      ')}; }`;
    at += ms;
    return k;
  });
  return out + `\n@keyframes ${cls}-anim {\n${keys.join('\n')}\n}`;
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
  const body = (g, ind) => g.map(r => ind + r.map(v => String(v).padStart(2, ' ')).join(', ') + ',').join('\n');
  // Ein Byte reicht für 255 Farben + Transparent. Volle Palette plus freie
  // Farben kann darüber gehen — dann zwei Byte pro Pixel.
  const cell = maxUsed > 255 ? 'uint16_t' : 'uint8_t';

  // Mehrere Frames: _DATA[Frames][Pixel] plus _FRAMES und _DURATIONS (ms).
  const data = d.n === 1
    ? `static const ${cell} ${d.id}_DATA[${d.W * d.H}] = {\n${body(d.idxGrid, '  ')}\n};\n\n`
    : `#define ${d.id}_FRAMES ${d.n}\n\n`
      + `static const uint16_t ${d.id}_DURATIONS[${d.n}] = { ${d.durations.join(', ')} };\n\n`
      + `static const ${cell} ${d.id}_DATA[${d.n}][${d.W * d.H}] = {\n`
      + d.idxFrames.map(g => `  {\n${body(g, '    ')}\n  },`).join('\n')
      + '\n};\n\n';

  return t('gen.cHead', { name: d.name, w: d.W, h: d.H, n: d.entries.length }) + '\n'
    + t('gen.cNote') + '\n'
    + (d.n > 1 ? t('gen.framesC', { n: d.n, id: d.id }) + '\n' : '')
    + `#ifndef ${guard}\n#define ${guard}\n\n`
    + '#include <stdint.h>\n\n'
    + `#define ${d.id}_WIDTH  ${d.W}\n`
    + `#define ${d.id}_HEIGHT ${d.H}\n\n`
    + `static const uint32_t ${d.id}_PALETTE[${palArr.length}] = {\n  `
    + palArr.join(', ') + '\n};\n\n'
    + data
    + `#endif // ${guard}\n`;
}

// ────────────────────────────────────────────────────────────────────
// Python — Pygame, Pillow, Skripte
// ────────────────────────────────────────────────────────────────────
function buildPython(d) {
  const pal = d.entries.map(([i, hex]) => `    ${i}: "${hex}",`).join('\n');
  const body = (g, ind) => g.map(r => `${ind}[${r.join(', ')}],`).join('\n');
  const head = t('gen.pyHead', { name: d.name, w: d.W, h: d.H }) + '\n';
  if (d.n === 1) {
    return head
      + `${d.id}_PALETTE = {\n${pal}\n}\n\n`
      + `${d.id} = [\n${body(d.idxGrid, '    ')}\n]\n`;
  }
  return head + t('gen.framesPy', { n: d.n, id: d.id }) + '\n'
    + `${d.id}_PALETTE = {\n${pal}\n}\n\n`
    + `${d.id}_DURATIONS = [${d.durations.join(', ')}]\n\n`
    + `${d.id} = [\n` + d.idxFrames.map(g => `    [\n${body(g, '        ')}\n    ],`).join('\n') + '\n]\n';
}

// ────────────────────────────────────────────────────────────────────
// Text-Raster — zum Draufschauen, für Diffs und zum Weiterreichen
// ────────────────────────────────────────────────────────────────────
const TXT_CHARS = '.123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Mehrere Frames: Blöcke untereinander, jeder mit "Frame N · ms"-Zeile.
// Die Zeile bleibt in jeder Sprache gleich — der Import erkennt sie daran.
function buildText(d) {
  const raster = g => g.map(r => r.map(v => TXT_CHARS[v] || '?').join('')).join('\n');
  const legend = d.entries.map(([i, hex]) => `  ${TXT_CHARS[i] || '?'} = ${hex}  (Index ${i})`).join('\n');
  const body = d.n === 1
    ? raster(d.idxGrid)
    : d.idxFrames.map((g, i) => `Frame ${i + 1} · ${d.durations[i]} ms\n${raster(g)}`).join('\n\n');
  return `${d.name} — ${d.W}×${d.H}${d.n > 1 ? ` · ${d.n} Frames` : ''}\n\n${body}\n\n`
    + `${t('gen.txtLegend')}\n${legend}\n`;
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
  game: { label: 'JSON (Spiel)',      ext: 'json', mime: 'application/json', reimport: true,  palOption: false, upper: false,
          materials: true, fileBase: (name) => gameName(deumlaut(name)),
          build: buildGame },
  svg: { label: 'SVG-Bild',          ext: 'svg',  mime: 'image/svg+xml',  reimport: true,  palOption: false, upper: false,
          build: buildSvg },
  css:  { label: 'CSS (box-shadow)',  ext: 'css',  mime: 'text/css',       reimport: true,  palOption: false, upper: false,
          build: buildCss },
  c:    { label: 'C-Header (uint8)',  ext: 'h',    mime: 'text/plain',     reimport: true,  palOption: false, upper: true,
          build: buildCHeader },
  py:   { label: 'Python',            ext: 'py',   mime: 'text/x-python',  reimport: true,  palOption: false, upper: true,
          build: buildPython },
  txt:  { label: 'Text-Raster',       ext: 'txt',  mime: 'text/plain',     reimport: true,  palOption: false, upper: false,
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
  const base = fmt.fileBase ? fmt.fileBase(sp?.name) : (fmt.upper ? tsIdentifier(sp?.name) : slug(sp?.name));
  return `${base}.${fmt.ext}`;
}
