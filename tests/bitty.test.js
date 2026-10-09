// Tests für Bitty, das Maskottchen (js/bitty.js).
//
// Die Frames sind von Hand geschriebene Zeichenreihen. Ein Zeichen zu viel
// verschiebt die halbe Figur — und tools/make_icons.py baut aus IDLE alle
// Logos. Also: jeder Frame 16 × 16, nur '.' und die Palettennummern 1–5.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';

// bitty.js ist ein Browser-Skript und hängt sich an window.
globalThis.window = /** @type {any} */ ({ matchMedia: () => ({ matches: false }) });
await import('../js/bitty.js');
const { FRAMES, PALETTE } = globalThis.window.Bitty;

test('jeder Frame ist 16 × 16 und kennt nur gültige Farben', () => {
  for (const [name, rows] of Object.entries(FRAMES)) {
    assert.equal(rows.length, 16, `${name}: ${rows.length} Zeilen`);
    rows.forEach((r, y) => {
      assert.equal(r.length, 16, `${name}, Zeile ${y}: ${r.length} Zeichen`);
      assert.match(r, /^[.1-5]+$/, `${name}, Zeile ${y}: unbekanntes Zeichen`);
    });
  }
  assert.equal(PALETTE.length, 5);
});

test('Blinzeln und Dösen schließen wirklich die Augen', () => {
  const eyes = rows => rows.join('').split('').filter((c, i) => c === '1' && rows[Math.floor(i / 16)].indexOf('3') >= 0).length;
  assert.ok(eyes(FRAMES.blink) < eyes(FRAMES.idle));
  assert.ok(eyes(FRAMES.doze) < eyes(FRAMES.squish));
});
