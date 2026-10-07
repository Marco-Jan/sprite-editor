// Tests für den GIF-Encoder (js/gif.js).
//
// Ein GIF ist eine Binärdatei ohne zweite Chance: stimmt ein Byte nicht,
// zeigt der Browser gar nichts oder ein kaputtes Bild — und man sieht beim
// Programmieren nicht, woran es lag. Darum wird hier die Struktur geprüft,
// nicht das Aussehen.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeGif } from '../js/gif.js';

const str = (b, i, n) => String.fromCharCode(...b.slice(i, i + n));
const u16 = (b, i) => b[i] | (b[i + 1] << 8);

/** Alle Graphic-Control-Blöcke (einer je Frame) finden. */
function gceBlocks(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) {
      out.push({ flags: bytes[i + 3], delay: u16(bytes, i + 4) });
    }
  }
  return out;
}

const twoFrames = () => encodeGif({
  width: 2, height: 2,
  colors: ['#ff0000', '#00ff00'],
  frames: [Uint8Array.from([0, 1, 1, 0]), Uint8Array.from([2, 0, 0, 2])],
  delays: [100, 250],
});

test('die Datei beginnt mit der GIF89a-Kennung und den Maßen', () => {
  const b = twoFrames();
  assert.equal(str(b, 0, 6), 'GIF89a');
  assert.equal(u16(b, 6), 2, 'Breite');
  assert.equal(u16(b, 8), 2, 'Höhe');
});

test('die Datei endet mit dem Schlusszeichen', () => {
  const b = twoFrames();
  assert.equal(b[b.length - 1], 0x3b);
});

test('die Animation läuft endlos (NETSCAPE2.0)', () => {
  const b = twoFrames();
  const text = str(b, 0, b.length);
  assert.ok(text.includes('NETSCAPE2.0'), 'Schleifen-Block fehlt');
});

test('jeder Frame bekommt einen eigenen Steuerblock', () => {
  assert.equal(gceBlocks(twoFrames()).length, 2);
});

test('Transparenz ist an und der Frame wird vorher gelöscht', () => {
  for (const g of gceBlocks(twoFrames())) {
    assert.equal(g.flags & 1, 1, 'Transparenz-Schalter');
    assert.equal((g.flags >> 2) & 7, 2, 'Disposal 2 — sonst bleiben Pixel stehen');
  }
});

test('die Dauer steht in Hundertstelsekunden', () => {
  const [a, b] = gceBlocks(twoFrames());
  assert.equal(a.delay, 10, '100 ms');
  assert.equal(b.delay, 25, '250 ms');
});

test('sehr kurze Frames bekommen mindestens 2/100 s', () => {
  // Viele Programme spielen 0 oder 1 als 1/10 s ab — dann läuft die
  // Animation plötzlich zehnmal zu langsam.
  const b = encodeGif({
    width: 1, height: 1, colors: ['#ffffff'],
    frames: [Uint8Array.from([1]), Uint8Array.from([1])],
    delays: [5, 0],
  });
  for (const g of gceBlocks(b)) assert.ok(g.delay >= 2, `Dauer ${g.delay} ist zu kurz`);
});

test('die Farbtabelle wird auf eine Zweierpotenz aufgefüllt', () => {
  // 2 Farben plus Transparent = 3 Einträge → Tabelle mit 4.
  const b = twoFrames();
  const bits = (b[10] & 0b111) + 1;      // Größe der globalen Tabelle
  assert.equal(1 << bits, 4);
  // Index 0 ist transparent und steht vor den echten Farben.
  const tableStart = 13;
  assert.deepEqual([...b.slice(tableStart + 3, tableStart + 6)], [0xff, 0x00, 0x00]);
  assert.deepEqual([...b.slice(tableStart + 6, tableStart + 9)], [0x00, 0xff, 0x00]);
});

test('ein einzelner Frame ergibt ebenfalls eine gültige Datei', () => {
  const b = encodeGif({
    width: 1, height: 1, colors: ['#123456'],
    frames: [Uint8Array.from([1])], delays: [100],
  });
  assert.equal(str(b, 0, 6), 'GIF89a');
  assert.equal(b[b.length - 1], 0x3b);
  assert.equal(gceBlocks(b).length, 1);
});
