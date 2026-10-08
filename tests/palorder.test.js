// Tests für das Umsortieren einer Palette (js/palorder.js).
//
// Wird eine Farbe auf einen anderen Platz gezogen, ändern sich ihre Nummer
// UND alle Pixel, die sie benutzen — sonst wäre das Bild danach bunt
// vertauscht. Geprüft wird darum immer: vorher und nachher sieht man
// dasselbe.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  permFromOrder, invertPerm, isIdentity, moveColor, permutePalette, permuteMaterials,
  remapGrid, shadeOrder,
} from '../js/palorder.js';

const pal = { 0: null, 1: '#111111', 2: '#ff0000', 3: '#00ff00', 4: '#0000ff' };
const look = (g, p) => g.map(r => r.map(v => (typeof v === 'number' ? p[v] ?? null : v)));

test('moveColor: Platz 4 nach vorn auf Platz 1', () => {
  assert.deepEqual(moveColor(4, 4, 1), [4, 1, 2, 3]);
  assert.deepEqual(moveColor(4, 1, 3), [2, 3, 1, 4]);
});

test('permFromOrder und invertPerm', () => {
  const perm = permFromOrder([4, 1, 2, 3]);
  assert.deepEqual(perm, [0, 2, 3, 4, 1]);
  assert.deepEqual(invertPerm(perm), [0, 4, 1, 2, 3]);
  assert.ok(isIdentity(permFromOrder([1, 2, 3])));
  assert.ok(!isIdentity(perm));
});

test('nach dem Umsortieren sieht das Bild genauso aus', () => {
  const g = [[0, 1, 2], [3, 4, '#abcdef']];
  const before = look(g, pal);
  const perm = permFromOrder(moveColor(4, 4, 1));
  const p2 = permutePalette(pal, perm);
  remapGrid(g, perm);
  assert.deepEqual(look(g, p2), before);
  assert.equal(p2[1], '#0000ff', 'Blau steht jetzt vorn');
  assert.equal(g[1][2], '#abcdef', 'freie Farbe bleibt');
  assert.equal(g[0][0], 0, 'Transparent bleibt 0');
});

test('zurück mit der umgekehrten Permutation', () => {
  const g = [[1, 2, 3, 4]];
  const perm = permFromOrder([3, 4, 1, 2]);
  remapGrid(g, perm);
  remapGrid(g, invertPerm(perm));
  assert.deepEqual(g, [[1, 2, 3, 4]]);
  assert.deepEqual(permutePalette(permutePalette(pal, perm), invertPerm(perm)), pal);
});

test('Materialien wandern mit ihrer Farbe', () => {
  const perm = permFromOrder([2, 1, 3, 4]);
  assert.deepEqual(permuteMaterials({ 1: 'metal', 3: 'wood' }, perm), { 2: 'metal', 3: 'wood' });
  assert.equal(permuteMaterials(undefined, perm), undefined);
});

test('Nach Farbstufen: Grau zuerst, dann je Farbton von dunkel nach hell', () => {
  const p = {
    1: '#ff8080',   // helles Rot
    2: '#808080',   // Grau
    3: '#800000',   // dunkles Rot
    4: '#00a000',   // Grün
    5: '#000000',   // Schwarz
    6: '#ff0000',   // Rot
    7: '#80ff80',   // helles Grün
  };
  assert.deepEqual(shadeOrder(p, 7), [5, 2, 3, 6, 1, 4, 7]);
});

test('Rot knapp unter 360° gehört zu Rot, nicht ans Ende', () => {
  const p = { 1: '#ff0010', 2: '#00ff00', 3: '#ff1000' };
  const order = shadeOrder(p, 3);
  assert.deepEqual(order.slice(0, 2).sort(), [1, 3]);
});

test('Plätze ohne gültige Farbe bleiben hinten', () => {
  assert.deepEqual(shadeOrder({ 1: '#ffffff', 3: '#000000' }, 3), [3, 1, 2]);
});
