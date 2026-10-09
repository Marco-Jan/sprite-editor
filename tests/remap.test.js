// Tests für das Übertragen zwischen Paletten (js/remap.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remapCells, samePalette } from '../js/remap.js';

const GRAU = { 1: '#ffffff', 2: '#aaaaaa', 3: '#555555', 4: '#000000' };
const BUNT = { 1: '#000000', 2: '#ff0000', 3: '#00ff00', 4: '#aaaaaa' };

test('nach der Farbe übertragen: gleiche Farbe bekommt die Nummer im Ziel', () => {
  const r = remapCells([[0, 2, 4], [1, 3, 0]], GRAU, BUNT);
  assert.deepEqual(r.cells, [[0, 4, 1], [ '#ffffff', '#555555', 0]]);
  assert.equal(r.mapped, 2, 'Grau 2 → 4, Schwarz 4 → 1');
  assert.equal(r.free, 2, 'Weiß und Dunkelgrau gibt es im Ziel nicht');
});

test('freie Farben bleiben — oder werden zur Nummer, wenn es sie im Ziel gibt', () => {
  const r = remapCells([['#FF0000', '#123456']], GRAU, BUNT);
  assert.deepEqual(r.cells, [[2, '#123456']]);
});

test('gleiche Palette: nichts ändert sich', () => {
  const r = remapCells([[1, 2, 3]], GRAU, GRAU);
  assert.deepEqual(r.cells, [[1, 2, 3]]);
  assert.deepEqual([r.mapped, r.free], [0, 0]);
  assert.equal(samePalette(GRAU, { ...GRAU }), true);
  assert.equal(samePalette(GRAU, BUNT), false);
});
