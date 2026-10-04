// Tests für den Export "JSON (Spiel)" — laufen ohne Abhängigkeiten:
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  gameJson, buildGameSprite, validateGameSprite, formatGameSprite,
  GameJsonError, MATERIALS, toRgba, gameName,
} from '../js/gamejson.js';
import { BUILTIN_PALETTES, MAX_IDX } from '../js/data.js';

const SAMPLE = {
  name: 'Test Sprite',
  idxGrid: [
    [0, 1, 2],
    [2, 1, 0],
  ],
  colors: ['#C2B280', '#4A90D9'],
  materials: { 1: 'sand', 2: 'water' },
};

test('3×2-Sprite: Ausgabe exakt wie festgelegt', () => {
  const expected = [
    '{',
    '  "version": 1,',
    '  "name": "test_sprite",',
    '  "width": 3,',
    '  "height": 2,',
    '  "palette": [',
    '    { "color": "#00000000", "material": "empty" },',
    '    { "color": "#c2b280ff", "material": "sand" },',
    '    { "color": "#4a90d9ff", "material": "water" }',
    '  ],',
    '  "data": [',
    '    0, 1, 2,',
    '    2, 1, 0',
    '  ]',
    '}',
    '',
  ].join('\n');
  assert.equal(gameJson(SAMPLE), expected);
});

test('Roundtrip: Pixel (x, y) liegt bei y * width + x', () => {
  const parsed = JSON.parse(gameJson(SAMPLE));
  assert.equal(parsed.data.length, parsed.width * parsed.height);
  for (let y = 0; y < SAMPLE.idxGrid.length; y++) {
    for (let x = 0; x < SAMPLE.idxGrid[0].length; x++) {
      assert.equal(parsed.data[y * parsed.width + x], SAMPLE.idxGrid[y][x], `Pixel (${x}, ${y})`);
    }
  }
  // Der geparste Text besteht die Validierung unverändert.
  assert.doesNotThrow(() => validateGameSprite(parsed));
});

test('Fehlendes Material wird "none", Index 0 ist immer "empty"', () => {
  const obj = buildGameSprite({ ...SAMPLE, materials: { 2: 'water' } });
  assert.deepEqual(obj.palette.map(p => p.material), ['empty', 'none', 'water']);
  assert.ok(MATERIALS.includes('none') && MATERIALS.includes('empty'));
});

test('Fehler: data hat die falsche Länge', () => {
  const obj = buildGameSprite(SAMPLE);
  obj.data.pop();
  assert.throws(() => validateGameSprite(obj), (e) => e instanceof GameJsonError && e.code === 'length'
    && e.params.len === 5 && e.params.expected === 6);
});

test('Fehler: ungleich lange Zeilen fallen als falsche Länge auf', () => {
  assert.throws(() => gameJson({ ...SAMPLE, idxGrid: [[0, 1, 2], [2, 1]] }),
    (e) => e instanceof GameJsonError && e.code === 'length');
});

test('Fehler: Index außerhalb der Palette', () => {
  const grid = [[0, 1, 2], [2, 3, 0]];
  assert.throws(() => gameJson({ ...SAMPLE, idxGrid: grid }), (e) =>
    e instanceof GameJsonError && e.code === 'index' && e.params.x === 1 && e.params.y === 1 && e.params.value === 3);
});

test('Fehler: Index 0 nicht transparent, unbekanntes Material, leere Palette', () => {
  const opaque = buildGameSprite(SAMPLE);
  opaque.palette[0].color = '#000000ff';
  assert.throws(() => validateGameSprite(opaque), { code: 'zeroOpaque' });

  const badMat = buildGameSprite(SAMPLE);
  badMat.palette[1].material = 'lava';
  assert.throws(() => validateGameSprite(badMat), { code: 'badMaterial' });

  const empty = buildGameSprite(SAMPLE);
  empty.palette = [];
  assert.throws(() => validateGameSprite(empty), { code: 'noPalette' });
});

test('sprites-Ausschnitte: innerhalb ok, außerhalb Fehler', () => {
  const ok = buildGameSprite({ ...SAMPLE, sprites: { a: { x: 0, y: 0, w: 1, h: 2, frames: 3 } } });
  const text = formatGameSprite(validateGameSprite(ok));
  assert.deepEqual(JSON.parse(text).sprites, { a: { x: 0, y: 0, w: 1, h: 2, frames: 3 } });

  const defaultFrames = buildGameSprite({ ...SAMPLE, sprites: { a: { x: 2, y: 0, w: 1, h: 1 } } });
  assert.equal(defaultFrames.sprites.a.frames, 1);

  const out = buildGameSprite({ ...SAMPLE, sprites: { b: { x: 1, y: 0, w: 1, h: 1, frames: 3 } } });
  assert.throws(() => validateGameSprite(out), { code: 'region' });
});

test('Farben und Namen werden normalisiert', () => {
  assert.equal(toRgba('#ABC'), '#aabbccff');
  assert.equal(toRgba('#AABBCC'), '#aabbccff');
  assert.equal(toRgba('#11223344'), '#11223344');
  assert.throws(() => toRgba('rot'), { code: 'badColor' });
  assert.equal(gameName('BG Mountain'), 'bg_mountain');
  assert.equal(gameName('  '), 'sprite');
});

// Berg-Hintergrund 160×120: fast nur Nullen, ein paar Farbwerte —
// so wie er aus dem Editor käme (volle eingebaute Palette, Index 1–9).
function mountainGrid(W = 160, H = 120) {
  const grid = Array.from({ length: H }, () => Array(W).fill(0));
  for (let x = 0; x < W; x++) {
    const peak = Math.round(H * 0.45 + Math.abs(((x * 3) % 80) - 40) * 0.9);
    for (let y = peak; y < H; y++) grid[y][x] = y === peak ? 5 : (y < peak + 6 ? 2 : 3);
  }
  return grid;
}

test('Berg-Hintergrund: data.length === width * height', () => {
  const pal = BUILTIN_PALETTES.schiefer;
  const colors = [];
  for (let i = 1; i <= MAX_IDX; i++) colors.push(pal[i]);
  const text = gameJson({ name: 'bg_mountain', idxGrid: mountainGrid(), colors, materials: { 2: 'ice', 3: 'stone' } });
  const parsed = JSON.parse(text);
  assert.equal(parsed.width, 160);
  assert.equal(parsed.height, 120);
  assert.equal(parsed.data.length, parsed.width * parsed.height);
  assert.equal(parsed.palette.length, MAX_IDX + 1);
  // Eine Zeile pro Bildzeile im data-Block.
  const dataLines = text.split('\n').filter(l => /^ {4}\d/.test(l));
  assert.equal(dataLines.length, 120);
});
