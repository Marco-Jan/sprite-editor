// Tests für die Übergabe vom Probier-Raster der Startseite (js/fromstart.js).
//
// landing-demo.js schreibt das Bild in den Link, der Editor liest es hier.
// Kaputte oder fremde Hashes dürfen nichts anlegen.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStartHash } from '../js/fromstart.js';

const PAL = '14213d,2d4870,6ea8fe,a9d1ff,f2f8ff';
const cells = (n, f) => Array.from({ length: n * n }, (_, i) => f(i)).join('');

test('16×16 mit Palette wird gelesen', () => {
  const r = parseStartHash('#start=eis.' + PAL + '.' + cells(16, i => i % 6));
  assert.ok(r);
  assert.equal(r.name, 'eis');
  assert.deepEqual(r.palette, { 1: '#14213d', 2: '#2d4870', 3: '#6ea8fe', 4: '#a9d1ff', 5: '#f2f8ff' });
  assert.equal(r.grid.length, 16);
  assert.equal(r.grid[0].length, 16);
  assert.deepEqual(r.grid[0].slice(0, 7), [0, 1, 2, 3, 4, 5, 0]);
});

test('aus der Skizzen-Demo: Kennzeichen „.skizze“', () => {
  const r = parseStartHash('#start=eis.' + PAL + '.' + cells(32, i => i % 6) + '.skizze');
  assert.ok(r);
  assert.equal(r.sketch, true);
  assert.equal(r.grid.length, 32);
  assert.equal(parseStartHash('#start=eis.' + PAL + '.' + cells(4, () => 1))?.sketch, false);
});

test('ohne # geht auch', () => {
  assert.ok(parseStartHash('start=eis.' + PAL + '.' + cells(4, () => 1)));
});

test('kaputte Hashes ergeben null', () => {
  assert.equal(parseStartHash(''), null);
  assert.equal(parseStartHash('#foo=1'), null);
  // nicht quadratisch
  assert.equal(parseStartHash('#start=eis.' + PAL + '.' + '0'.repeat(10)), null);
  // Index 6 hat keine Farbe
  assert.equal(parseStartHash('#start=eis.' + PAL + '.' + cells(4, () => 6)), null);
  // keine Farbe
  assert.equal(parseStartHash('#start=eis..' + cells(4, () => 0)), null);
  // Farbe kein Hex
  assert.equal(parseStartHash('#start=eis.zzzzzz.' + cells(4, () => 1)), null);
});
