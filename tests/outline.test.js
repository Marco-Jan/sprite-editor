// Tests für die Outline außen / innen / beides (js/spritefx.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outlineGrid } from '../js/spritefx.js';

const blank = (W, H) => Array.from({ length: H }, () => Array(W).fill(0));
// 3×3-Block in der Mitte eines 7×7-Bilds
const block = () => {
  const g = blank(7, 7);
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) g[y][x] = 1;
  return g;
};

test('außen: nur 4er-Nachbarn, Dicke = Durchläufe', () => {
  const g = blank(7, 7);
  g[3][3] = 1;
  assert.equal(outlineGrid(g, 3, 1), 4);
  assert.equal(g[2][3], 3);
  assert.equal(g[2][2], 0, 'nur 4er-Nachbarn');
  const h = blank(7, 7);
  h[3][3] = 1;
  assert.equal(outlineGrid(h, 3, 2, 'outside'), 4 + 8);
});

test('innen: Randpixel umfärben, die Figur wächst nicht', () => {
  const g = block();
  assert.equal(outlineGrid(g, 3, 1, 'inside'), 8);
  assert.equal(g[3][3], 1, 'Mitte bleibt');
  assert.equal(g[2][2], 3);
  assert.equal(g[1][3], 0, 'außen bleibt leer');
  const h = block();
  assert.equal(outlineGrid(h, 3, 2, 'inside'), 9, 'zweiter Durchlauf erreicht die Mitte');
});

test('innen: schon gleich gefärbte Pixel zählen nicht, Bildrand ist keine Kante', () => {
  const g = block();
  g[2][2] = 3;
  assert.equal(outlineGrid(g, 3, 1, 'inside'), 7);
  const full = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
  assert.equal(outlineGrid(full, 3, 1, 'inside'), 0);
});

test('beides: innen und außen', () => {
  const g = block();
  assert.equal(outlineGrid(g, 3, 1, 'both'), 8 + 12);
  assert.equal(g[3][3], 1);
  assert.equal(g[2][2], 3);
  assert.equal(g[1][3], 3);
});
