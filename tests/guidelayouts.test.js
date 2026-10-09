// Tests für eigene Hilfslinien-Layouts (js/guidelayouts.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLayouts, makeLayout, upsertLayout, fitLayout } from '../js/guidelayouts.js';

const G = { h: [8, 16], v: [12], heads: 4, top: 2, bottom: 30 };

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
