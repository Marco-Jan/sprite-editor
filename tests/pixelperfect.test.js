// Tests für Pixel-perfect (js/pixelperfect.js).
//
// Eine freihändig gezeichnete Treppe darf am Ende keine L-Ecken mehr haben;
// was vorher an der Ecke stand, kommt zurück. Gerade Linien bleiben, wie
// sie sind.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPixelPerfect, ppAdd } from '../js/pixelperfect.js';

const grid = (w, h) => Array.from({ length: h }, () => new Array(w).fill(0));
const painted = (g, v) => g.flatMap((row, y) => row.flatMap((c, x) => (c === v ? [[x, y]] : [])));

test('Treppe wird zur sauberen Diagonale', () => {
  const g = grid(6, 6);
  g[0][1] = 7; // stand schon da — muss zurückkommen
  const pp = createPixelPerfect();
  for (const [x, y] of [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]]) ppAdd(pp, g, x, y, 3);
  assert.deepEqual(painted(g, 3), [[0, 0], [1, 1], [2, 2], [3, 2]]);
  assert.equal(g[0][1], 7);
});

test('gerade Linien bleiben', () => {
  const g = grid(6, 1);
  const pp = createPixelPerfect();
  for (let x = 0; x < 6; x++) ppAdd(pp, g, x, 0, 1);
  assert.deepEqual(g[0], [1, 1, 1, 1, 1, 1]);
});

test('freie Farben und Symmetrie', () => {
  const g = grid(8, 4);
  const pp = createPixelPerfect();
  const mirror = (x, y) => [[x, y], [7 - x, y]];
  for (const [x, y] of [[0, 0], [1, 0], [1, 1]]) ppAdd(pp, g, x, y, '#abcdef', mirror);
  assert.equal(g[0][1], 0);
  assert.equal(g[0][6], 0, 'Spiegelbild der Ecke auch weg');
  assert.equal(g[1][6], '#abcdef');
});

test('derselbe Punkt zweimal zählt nicht', () => {
  const g = grid(3, 3);
  const pp = createPixelPerfect();
  assert.equal(ppAdd(pp, g, 1, 1, 2), true);
  assert.equal(ppAdd(pp, g, 1, 1, 2), false);
});
