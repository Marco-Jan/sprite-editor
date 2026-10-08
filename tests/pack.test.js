// Tests für das kompakte Speicherformat (js/pack.js).
//
// Der Editor speichert in IndexedDB nicht mehr JSON-Zahlen, sondern Bytes.
// Was hier verloren geht, ist beim nächsten Start weg — darum wird jeder
// Sprite einmal gepackt, ausgepackt und durch dasselbe makeSprite geschickt,
// das auch beim Laden läuft. Danach muss alles genau so sein wie vorher.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSprite, linkSignature } from '../js/state.js';
import { packSprite, unpackSprite, packSum } from '../js/pack.js';

const roundTrip = sp => {
  const rec = structuredClone(packSprite(sp));   // wie IndexedDB es ablegt
  return makeSprite(unpackSprite(rec));
};

function sample() {
  const shared = [[1, 2, 0], [0, 3, 4]];
  return makeSprite({
    name: 'Held', palette: 'golden', fps: 12, frame: 1, layer: 1,
    frames: [
      { cels: [[[0, 0, 0], [0, 0, 5]], shared], dur: 0 },
      { cels: [[[9, '#abcdef', 0], [0, 0, 0]], shared], dur: 200 },
    ],
    layers: [{ name: 'Grund', continuous: true }, { name: 'Figur', opacity: 0.5, locked: true }],
    tags: [{ name: 'Lauf', from: 0, to: 1, dir: 'pingpong', color: '#4aa3df' }],
  });
}

test('Pixel, freie Farben und Dauer kommen unverändert zurück', () => {
  const a = sample(), b = roundTrip(a);
  assert.deepEqual(b.frames.map(f => f.cels), a.frames.map(f => f.cels));
  assert.deepEqual(b.frames.map(f => f.dur), [0, 200]);
  assert.equal(b.frames[1].cels[0][0][1], '#abcdef');
});

test('Ebenen, Tags, fps und Auswahl bleiben', () => {
  const a = sample(), b = roundTrip(a);
  assert.deepEqual(b.layers, a.layers);
  assert.deepEqual(b.tags, a.tags);
  assert.equal(b.fps, 12);
  assert.equal(b.frame, 1);
  assert.equal(b.layer, 1);
  assert.equal(b.palette, 'golden');
});

test('verknüpfte Zellen bleiben verknüpft — und nur die', () => {
  const a = sample(), b = roundTrip(a);
  assert.equal(b.frames[0].cels[1], b.frames[1].cels[1]);
  assert.notEqual(b.frames[0].cels[0], b.frames[1].cels[0]);
  assert.equal(linkSignature(b.frames), linkSignature(a.frames));
});

test('ein geteiltes Bild steht nur einmal im Speicher', () => {
  assert.equal(packSprite(sample()).images.length, 3);
});

test('nur Palette: ein Byte je Pixel; mit freien Farben zwei', () => {
  const rec = packSprite(sample());
  assert.ok(rec.images[0] instanceof Uint8Array);
  assert.ok(rec.images[2] instanceof Uint16Array);
});

test('die Prüfsumme ändert sich mit jedem Pixel und jeder Einstellung', () => {
  const a = sample();
  const s0 = packSum(packSprite(a));
  assert.equal(packSum(packSprite(a)), s0, 'gleich bleibt gleich');
  a.frames[0].cels[0][0][0] = 7;
  const s1 = packSum(packSprite(a));
  assert.notEqual(s1, s0);
  a.layers[0].name = 'anders';
  assert.notEqual(packSum(packSprite(a)), s1);
});

test('ein großer Sprite packt in Bytes viel kleiner als JSON', () => {
  const g = Array.from({ length: 128 }, (_, y) => Array.from({ length: 128 }, (_, x) => (x * y) % 17));
  const sp = makeSprite({ name: 'G', palette: 'golden', frames: [{ grid: g }] });
  const bytes = packSprite(sp).images[0].byteLength;
  const json = JSON.stringify(sp.frames[0].cels[0]).length;
  assert.equal(bytes, 128 * 128);
  assert.ok(bytes < json / 2, `${bytes} Bytes gegen ${json} Zeichen`);
});
