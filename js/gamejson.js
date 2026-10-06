// ════════════════════════════════════════════════════════════════════
// GAMEJSON — "JSON (Spiel)": flaches Datenformat für Spiele-Engines
// ════════════════════════════════════════════════════════════════════
// Gedacht für Engines, die Sprites als Zellraster einlesen (z. B. eine
// Falling-Sand-Simulation in C#). Anders als das Editor-JSON:
//   - `data` ist EIN flaches Array, Index = y * width + x
//   - `palette` ist eine dichte Liste, Index 0 immer transparent/"empty"
//   - Farben als #rrggbbaa, jede Farbe trägt einen Material-Namen
//   - `version` steht drin, damit spätere Änderungen erkennbar sind
//
// Bewusst ohne DOM, State oder i18n — die Datei läuft so auch unter Node
// (tests/gamejson.test.js). Fehler kommen als GameJsonError mit `code` und
// `params`; den Text für die Oberfläche baut der Aufrufer über i18n.
//
// Die C#-Gegenseite steht in docs/csharp-loader.md.

export const GAME_JSON_VERSION = 1;

// Die EINE Stelle, an der die Materialien stehen. Reihenfolge = Reihenfolge
// in der Auswahl im Editor. Neue Materialien einfach hinten anhängen.
//   none  — kein Material zugewiesen (Default für Farben ohne Angabe)
//   empty — leer/transparent, gehört fest zu Index 0
export const MATERIALS = ['none', 'empty', 'sand', 'water', 'stone', 'ice', 'steam', 'metal', 'wood'];

export const DEFAULT_MATERIAL = 'none';
export const EMPTY_COLOR = '#00000000';

export class GameJsonError extends Error {
  constructor(code, params, message) {
    super(message);
    this.name = 'GameJsonError';
    this.code = code;
    this.params = params || {};
  }
}

// Sprite-Name → snake_case-Bezeichner ("Berg Hintergrund" → "berg_hintergrund").
// Umlaute schreibt der Aufrufer vorher aus, falls gewünscht.
export function gameName(name) {
  const s = String(name || 'sprite')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || 'sprite';
}

// '#abc' | '#aabbcc' | '#aabbccdd' → '#aabbccdd' (klein, Alpha am Ende).
// Alles andere ist ein Fehler — eine falsche Farbe soll nicht still
// zu Schwarz werden.
export function toRgba(hex) {
  const h = String(hex || '').trim().toLowerCase();
  if (/^#[0-9a-f]{8}$/.test(h)) return h;
  if (/^#[0-9a-f]{6}$/.test(h)) return h + 'ff';
  if (/^#[0-9a-f]{3}$/.test(h)) return '#' + [...h.slice(1)].map(c => c + c).join('') + 'ff';
  throw new GameJsonError('badColor', { color: hex }, `Ungültige Farbe: ${hex}`);
}

// ────────────────────────────────────────────────────────────────────
// Aufbauen
// ────────────────────────────────────────────────────────────────────
// idxGrid  — number[][] in [y][x]
// colors   — Array der Farben ab Index 1: colors[0] gehört zu Index 1 usw.
//            Index 0 wird immer als transparent/"empty" vorangestellt.
// materials — { [index]: 'sand', … } — fehlende Einträge werden "none"
// sprites  — optionale Atlas-Ausschnitte { name: { x, y, w, h, frames } }
// durations — optional: Dauer je Frame in ms, alle Ausschnitte der Reihe nach
export function buildGameSprite({ name, idxGrid, colors, materials = {}, sprites = null, durations = null }) {
  const height = idxGrid.length;
  const width = height ? idxGrid[0].length : 0;

  const palette = [{ color: EMPTY_COLOR, material: 'empty' }];
  colors.forEach((hex, k) => {
    const m = materials[k + 1];
    palette.push({ color: toRgba(hex), material: MATERIALS.includes(m) ? m : DEFAULT_MATERIAL });
  });

  const data = [];
  for (const row of idxGrid) for (const v of row) data.push(v);

  const out = { version: GAME_JSON_VERSION, name: gameName(name), width, height, palette, data };
  if (sprites && Object.keys(sprites).length) {
    out.sprites = {};
    for (const [key, r] of Object.entries(sprites)) {
      out.sprites[key] = { x: r.x, y: r.y, w: r.w, h: r.h, frames: r.frames ?? 1 };
    }
    if (durations && durations.length) out.durations = [...durations];
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Prüfen — wirft beim ersten Fehler, korrigiert nichts
// ────────────────────────────────────────────────────────────────────
const isInt = (v) => Number.isInteger(v);

export function validateGameSprite(obj) {
  const fail = (code, params, msg) => { throw new GameJsonError(code, params, msg); };

  if (obj.version !== GAME_JSON_VERSION) {
    fail('version', { version: obj.version }, `Unbekannte Version ${obj.version}`);
  }
  const { width, height, palette, data } = obj;
  if (!isInt(width) || !isInt(height) || width < 1 || height < 1) {
    fail('size', { w: width, h: height }, `Ungültige Größe ${width}×${height}`);
  }
  if (!Array.isArray(palette) || palette.length < 1) {
    fail('noPalette', {}, 'Die Palette ist leer');
  }
  if (palette[0].color !== EMPTY_COLOR) {
    fail('zeroOpaque', { color: palette[0].color }, `Index 0 muss transparent (${EMPTY_COLOR}) sein, ist aber ${palette[0].color}`);
  }
  palette.forEach((p, i) => {
    if (!/^#[0-9a-f]{8}$/.test(p.color)) fail('badColor', { color: p.color, i }, `Palette[${i}]: ungültige Farbe ${p.color}`);
    if (!MATERIALS.includes(p.material)) fail('badMaterial', { material: p.material, i }, `Palette[${i}]: unbekanntes Material „${p.material}“`);
  });
  if (!Array.isArray(data) || data.length !== width * height) {
    const len = Array.isArray(data) ? data.length : 0;
    fail('length', { len, w: width, h: height, expected: width * height },
      `data hat ${len} Werte, erwartet sind width × height = ${width} × ${height} = ${width * height}`);
  }
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!isInt(v) || v < 0 || v >= palette.length) {
      fail('index', { value: v, x: i % width, y: Math.floor(i / width), max: palette.length - 1 },
        `Pixel (${i % width}, ${Math.floor(i / width)}) hat Index ${v}, gültig ist 0 bis ${palette.length - 1}`);
    }
  }
  if (obj.sprites) {
    for (const [key, r] of Object.entries(obj.sprites)) {
      const frames = r.frames ?? 1;
      const ok = [r.x, r.y, r.w, r.h, frames].every(isInt)
        && r.x >= 0 && r.y >= 0 && r.w >= 1 && r.h >= 1 && frames >= 1
        && r.x + r.w * frames <= width && r.y + r.h <= height;
      if (!ok) fail('region', { name: key }, `Ausschnitt „${key}“ liegt nicht vollständig im Bild`);
    }
  }
  // durations: eine Dauer (ms) je Frame, alle Ausschnitte der Reihe nach.
  if (obj.durations !== undefined) {
    const need = obj.sprites ? Object.values(obj.sprites).reduce((n, r) => n + (r.frames ?? 1), 0) : 1;
    const d = obj.durations;
    if (!Array.isArray(d) || d.length !== need || !d.every(v => isInt(v) && v >= 1 && v <= 60000)) {
      fail('durations', { need }, `durations braucht ${need} ganze Zahlen (ms)`);
    }
  }
  return obj;
}

// ────────────────────────────────────────────────────────────────────
// Schreiben — Einrückung 2, `data` mit einer Zeile pro Bildzeile
// ────────────────────────────────────────────────────────────────────
export function formatGameSprite(obj) {
  const s = JSON.stringify;
  const lines = [
    '{',
    `  "version": ${obj.version},`,
    `  "name": ${s(obj.name)},`,
    `  "width": ${obj.width},`,
    `  "height": ${obj.height},`,
    '  "palette": [',
    obj.palette.map(p => `    { "color": ${s(p.color)}, "material": ${s(p.material)} }`).join(',\n'),
    '  ],',
    '  "data": [',
  ];
  const rows = [];
  for (let y = 0; y < obj.height; y++) {
    rows.push('    ' + obj.data.slice(y * obj.width, (y + 1) * obj.width).join(', '));
  }
  lines.push(rows.join(',\n'));
  if (obj.sprites) {
    lines.push('  ],', '  "sprites": {');
    lines.push(Object.entries(obj.sprites).map(([k, r]) =>
      `    ${s(k)}: { "x": ${r.x}, "y": ${r.y}, "w": ${r.w}, "h": ${r.h}, "frames": ${r.frames} }`).join(',\n'));
    if (obj.durations) {
      lines.push('  },', `  "durations": [${obj.durations.join(', ')}]`);
    } else {
      lines.push('  }');
    }
  } else {
    lines.push('  ]');
  }
  lines.push('}');
  return lines.join('\n') + '\n';
}

// Alles in einem: bauen, prüfen, formatieren.
export function gameJson(input) {
  return formatGameSprite(validateGameSprite(buildGameSprite(input)));
}
