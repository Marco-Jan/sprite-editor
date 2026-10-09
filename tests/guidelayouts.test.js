// Tests für eigene Hilfslinien-Layouts (js/guidelayouts.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayouts, makeLayout, upsertLayout, fitLayout, evenLines } from '../js/guidelayouts.js';

const G = { h: [8, 16], v: [12], heads: 4, top: 2, bottom: 30 };

test('Linien gleichmäßig verteilen: n Linien = n + 1 gleiche Teile', () => {
  assert.deepEqual(evenLines(1, 24), [12]);
  assert.deepEqual(evenLines(3, 24), [6, 12, 18]);
  assert.deepEqual(evenLines(4, 30), [6, 12, 18, 24]);
  assert.deepEqual(evenLines(2, 10), [3, 7], 'gerundet');
  assert.deepEqual(evenLines(0, 24), []);
  assert.equal(evenLines(100, 8).length, 7, 'höchstens eine je Pixelgrenze');
  assert.deepEqual(evenLines(-3, 24), []);
});

test('gleiche Größe: genau dieselben Linien', () => {
  const l = makeLayout(' Figur ', G, 24, 32);
  assert.equal(l.name, 'Figur');
  assert.deepEqual(fitLayout(l, 24, 32), G);
});

test('andere Größe: Linien wandern anteilig mit', () => {
  const l = makeLayout('Figur', G, 24, 32);
  assert.deepEqual(fitLayout(l, 48, 64), { h: [16, 32], v: [24], heads: 4, top: 4, bottom: 60 });
  assert.deepEqual(fitLayout(l, 12, 16), { h: [4, 8], v: [6], heads: 4, top: 1, bottom: 15 });
});

test('gleicher Name ersetzt, neuer kommt hinten dran', () => {
  let list = upsertLayout([], makeLayout('A', G, 24, 32));
  list = upsertLayout(list, makeLayout('B', G, 24, 32));
  list = upsertLayout(list, makeLayout('A', { h: [], v: [], heads: 0 }, 16, 16));
  assert.deepEqual(list.map(l => [l.name, l.width]), [['A', 16], ['B', 24]]);
});

test('Speicher prüfen: ohne Name, ohne Größe oder doppelt fällt weg', () => {
  const list = normalizeLayouts([
    { name: 'A', width: 24, height: 32, guides: G },
    { name: '', width: 24, height: 32, guides: G },
    { name: 'B', width: 0, height: 32 },
    { name: 'A', width: 8, height: 8, guides: G },
    'Unsinn',
  ]);
  assert.deepEqual(list.map(l => l.name), ['A']);
  assert.deepEqual(normalizeLayouts(null), []);
});
