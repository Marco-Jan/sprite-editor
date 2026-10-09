// Tests für das Skalieren einer Auswahl mit Anfassern (js/scale.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dragHandle, scaleGrid, handlePos } from '../js/scale.js';

const R = { x: 2, y: 3, w: 4, h: 2 };

test('Ecke unten rechts: Breite und Höhe, oben links bleibt stehen', () => {
  assert.deepEqual(dragHandle(R, 'se', 10, 7), { x: 2, y: 3, w: 8, h: 4 });
});

test('Kante: nur eine Richtung', () => {
  assert.deepEqual(dragHandle(R, 'e', 9, 99), { x: 2, y: 3, w: 7, h: 2 });
  assert.deepEqual(dragHandle(R, 'n', 99, 1), { x: 2, y: 1, w: 4, h: 4 });
});

test('nie kleiner als 1 × 1 und kein Umklappen', () => {
  assert.deepEqual(dragHandle(R, 'se', -5, -5), { x: 2, y: 3, w: 1, h: 1 });
  assert.deepEqual(dragHandle(R, 'nw', 50, 50), { x: 5, y: 4, w: 1, h: 1 });
});

test('mit Umschalt bleibt das Seitenverhältnis', () => {
  // 4 × 2 an der Ecke auf doppelte Breite gezogen → 8 × 4
  assert.deepEqual(dragHandle(R, 'se', 10, 5, true), { x: 2, y: 3, w: 8, h: 4 });
  // Kante rechts: die Höhe wächst mit, mittig
  assert.deepEqual(dragHandle(R, 'e', 10, 0, true), { x: 2, y: 2, w: 8, h: 4 });
  // Ecke oben links: unten rechts bleibt stehen
  assert.deepEqual(dragHandle(R, 'nw', -2, 1, true), { x: -2, y: 1, w: 8, h: 4 });
  // stärker nach oben als zur Seite gezogen: die Höhe bestimmt
  assert.deepEqual(dragHandle(R, 'nw', -2, 0, true), { x: -4, y: 0, w: 10, h: 5 });
});

test('nächster Nachbar: verdoppeln und halbieren ohne Mischfarben', () => {
  const g = [[1, 2], [3, 4]];
  assert.deepEqual(scaleGrid(g, 4, 4), [[1, 1, 2, 2], [1, 1, 2, 2], [3, 3, 4, 4], [3, 3, 4, 4]]);
  assert.deepEqual(scaleGrid(scaleGrid(g, 4, 4), 2, 2), g, 'zurück ergibt das Original');
  assert.deepEqual(scaleGrid([[1, 2, 3]], 1, 1), [[2]]);
  assert.deepEqual(scaleGrid([[true, false]], 4, 1), [[true, true, false, false]], 'auch Masken');
});

test('Lage der Anfasser', () => {
  assert.deepEqual(handlePos(R, 'nw'), { x: 2, y: 3 });
  assert.deepEqual(handlePos(R, 'e'), { x: 6, y: 4 });
  assert.deepEqual(handlePos(R, 's'), { x: 4, y: 5 });
});
