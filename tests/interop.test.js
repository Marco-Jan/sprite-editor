// Austausch mit der Desktop-App (spritebit-rs) — beide lesen und schreiben
// dieselben Sprite-Dateien (.bitty, JSON).
//
// In tests/interop/ liegen zwei Beispieldateien, in BEIDEN Repos gleich:
//   web-sprite.bitty      schreibt diese Web-Version (Test 1 prüft das)
//   desktop-sprite.bitty  schreibt die Desktop-App (crates/spritebit-core/tests/interop.rs)
// Jede Seite liest die Datei der anderen und prüft denselben Inhalt (expectSample).
//
// Ändert sich das Format absichtlich:
//   UPDATE_INTEROP=1 npm test         schreibt web-sprite.bitty neu
//   python tools/sync_interop.py      gleicht beide Repos ab (deploy.py prüft das)
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { addSpritesFromPayload, spritePayload } from '../js/storage.js';
import { sprites, customPalettes, paletteColorNames, paletteMaterials, makeSprite } from '../js/state.js';

const dir = new URL('./interop/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));

// ── Der Beispiel-Sprite (genauso in interop.rs) ─────────────────────
// 6 × 4 Pixel, Palette „interop“ mit Namen und einem Material, zwei Ebenen:
//   „Hinten“ (durchgehend): Boden in Zeile 3, ein Glanzpunkt oben links —
//                           Frame 2 und 3 sind mit Frame 1 verknüpft
//   „Vorn“ (gesperrt, halb durchsichtig): ein Punkt, der nach rechts wandert;
//                           in Frame 3 zusätzlich eine freie Farbe #abcdef
// Frame 2 dauert 200 ms, ein Tag „lauf“ über alle drei Frames, Ping-Pong.
const W = 6, H = 4;
const PAL = { 1: '#1b2a1e', 2: '#2f5a33', 3: '#5d9642', 4: '#9cc75a', 5: '#e8f5b0' };
const NAMES = { 1: 'Kontur', 3: 'Grund' };
const MATS = { 3: 'stone' };
const blank = () => Array.from({ length: H }, () => Array(W).fill(0));

function buildSample() {
  const back = blank();
  back[3].fill(3);
  back[0][0] = 5;
  const front = f => {
    const g = blank();
    g[1][f + 1] = 1;
    if (f === 2) g[3][5] = '#abcdef';
    return g;
  };
  const sp = makeSprite({
    name: 'held', palette: 'interop', fps: 12,
    frames: [0, 1, 2].map(f => ({ cels: [f ? { link: 0 } : back, front(f)], dur: f === 1 ? 200 : 0 })),
    layers: [
      { name: 'Hinten', continuous: true },
      { name: 'Vorn', locked: true, opacity: 0.5 },
    ],
    tags: [{ name: 'lauf', from: 0, to: 2, color: '#e5534b', dir: 'pingpong' }],
  });
  sprites.held = sp;
  customPalettes.interop = { ...PAL };
  paletteColorNames.interop = { ...NAMES };
  paletteMaterials.interop = { ...MATS };
  return sp;
}

// Was beide Seiten aus der Datei der anderen herauslesen müssen.
function expectSample(sp, palName) {
  assert.equal(sp.name, 'held');
  assert.equal(sp.fps, 12);
  assert.equal(sp.frames.length, 3);
  assert.deepEqual(sp.frames.map(f => f.dur), [0, 200, 0], 'Dauer je Frame');
  assert.deepEqual(sp.layers.map(l => [l.name, l.visible, l.locked, l.opacity, l.continuous]),
    [['Hinten', true, false, 1, true], ['Vorn', true, true, 0.5, false]], 'Ebenen');
  const cel = (f, l) => sp.frames[f].cels[l];
  assert.equal(cel(0, 0)[0].length, W);
  assert.equal(cel(0, 0).length, H);
  assert.ok(cel(1, 0) === cel(0, 0) && cel(2, 0) === cel(0, 0), 'Frame 2 und 3 mit Frame 1 verknüpft');
  assert.ok(cel(1, 1) !== cel(0, 1), 'vordere Ebene nicht verknüpft');
  assert.deepEqual(cel(0, 0)[3], [3, 3, 3, 3, 3, 3]);
  assert.equal(cel(0, 0)[0][0], 5);
  for (let f = 0; f < 3; f++) assert.equal(cel(f, 1)[1][f + 1], 1, `Punkt in Frame ${f + 1}`);
  assert.equal(String(cel(2, 1)[3][5]).toLowerCase(), '#abcdef', 'freie Farbe');
  assert.equal(cel(1, 1)[3][5], 0);
  assert.deepEqual(sp.tags.map(g => [g.name, g.from, g.to, g.color, g.dir]), [['lauf', 0, 2, '#e5534b', 'pingpong']]);
  assert.deepEqual({ ...customPalettes[palName] }, PAL, 'Palettenfarben');
  assert.deepEqual({ ...paletteColorNames[palName] }, NAMES, 'Farbnamen');
  assert.deepEqual({ ...paletteMaterials[palName] }, MATS, 'Materialien');
}

test('Web schreibt Sprite-Dateien wie tests/interop/web-sprite.bitty', () => {
  buildSample();
  const payload = JSON.parse(JSON.stringify(spritePayload('held')));
  if (process.env.UPDATE_INTEROP) {
    writeFileSync(new URL('web-sprite.bitty', dir), JSON.stringify(payload, null, 2) + '\n');
  }
  assert.deepEqual(payload, read('web-sprite.bitty'),
    'Format geändert? Absichtlich: UPDATE_INTEROP=1 npm test, dann python tools/sync_interop.py');
});

test('Web liest die eigene Beispieldatei wieder', () => {
  const [id] = addSpritesFromPayload(read('web-sprite.bitty'));
  assert.ok(id);
  expectSample(sprites[id], sprites[id].palette);
});

test('Web liest die Sprite-Datei der Desktop-App', () => {
  const [id] = addSpritesFromPayload(read('desktop-sprite.bitty'));
  assert.ok(id, 'Sprite übernommen');
  expectSample(sprites[id], sprites[id].palette);
});
