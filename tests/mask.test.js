// Tests für Ebenenmasken (js/mask.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankMask, copyMask, maskedCel, encodeMask, decodeMask, bakeMask, layerForSave } from '../js/mask.js';

const G = [[1, 2, 3], [4, 5, 6]];

test('neue Maske: alles sichtbar, Bild unverändert', () => {
  const L = { mask: blankMask(3, 2) };
  assert.deepEqual(maskedCel(L, G), G);
});

test('ausgeblendete Pixel werden 0 — jeder Wert ungleich 0 blendet aus', () => {
  const L = { mask: blankMask(3, 2) };
  L.mask.hide[0][1] = 7;          // mit Farbe 7 „gemalt“
  L.mask.hide[1][2] = '#ff0000';  // freie Farbe genauso
  assert.deepEqual(maskedCel(L, G), [[1, 0, 3], [4, 5, 0]]);
  assert.deepEqual(G, [[1, 2, 3], [4, 5, 6]], 'Original bleibt');
});

test('ausgeschaltete Maske wirkt nicht, ohne Maske kommt dasselbe Bild', () => {
  const L = { mask: { on: false, hide: [[1, 1, 1], [1, 1, 1]] } };
  assert.equal(maskedCel(L, G), G);
  assert.equal(maskedCel({ mask: null }, G), G);
});

test('Lauflängen hin und zurück', () => {
  const m = { on: true, hide: [[0, 0, 5], [5, 0, 0]] };
  const e = encodeMask(m);
  assert.deepEqual(e, { on: true, runs: [2, 2, 2] });
  assert.deepEqual(decodeMask(e, 3, 2), { on: true, hide: [[0, 0, 1], [1, 0, 0]] });
  assert.deepEqual(encodeMask({ on: false, hide: [[1, 1]] }), { on: false, runs: [0, 2] }, 'beginnt immer mit sichtbar');
});

test('falsche Größe oder kaputte Daten: keine Maske', () => {
  assert.equal(decodeMask({ on: true, runs: [5] }, 3, 2), null);
  assert.equal(decodeMask({ on: true, hide: [[0, 0]] }, 3, 2), null);
  assert.equal(decodeMask({ runs: [-1, 7] }, 3, 2), null);
  assert.equal(decodeMask(null, 3, 2), null);
});

test('anwenden löscht die ausgeblendeten Pixel', () => {
  assert.deepEqual(bakeMask(G, [[0, 1, 0], [0, 0, 1]]), [[1, 0, 3], [4, 5, 0]]);
});

test('Kopie ist unabhängig, Speicherform ohne Raster', () => {
  const m = { on: true, hide: [[0, 1]] };
  const c = copyMask(m);
  c.hide[0][0] = 1;
  assert.equal(m.hide[0][0], 0);
  assert.deepEqual(layerForSave({ name: 'x', mask: m }).mask, { on: true, runs: [1, 1] });
  assert.deepEqual(layerForSave({ name: 'y', mask: null }), { name: 'y', mask: null });
});
