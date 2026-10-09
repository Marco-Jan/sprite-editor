// Tests für die Werkzeuggröße per Alt + rechter Maustaste (js/sizedrag.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draggedSize, clampSize, SIZED_TOOLS, MAX_SIZE } from '../js/sizedrag.js';

test('Größe folgt dem Mausweg, eine Stufe je 6 px', () => {
  assert.equal(draggedSize(3, 0), 3);
  assert.equal(draggedSize(3, 12), 5);
  assert.equal(draggedSize(3, 2), 3, 'unter einer halben Stufe bleibt es');
  assert.equal(draggedSize(3, -6), 2);
});

test('Größe bleibt zwischen 1 und 64', () => {
  assert.equal(MAX_SIZE, 64);
  assert.equal(draggedSize(3, -500), 1);
  assert.equal(draggedSize(3, 5000), 64);
  assert.equal(draggedSize(10, 60), 20, 'auch über 9 hinaus');
});

test('eingetippte Größe wird begrenzt und gerundet', () => {
  assert.equal(clampSize('12'), 12);
  assert.equal(clampSize(7.6), 8);
  assert.equal(clampSize(0), 1);
  assert.equal(clampSize(999), 64);
  assert.equal(clampSize('abc'), 1);
});

test('nur Pinsel, Spray und Radierer haben eine Größe', () => {
  assert.deepEqual(SIZED_TOOLS, ['brush', 'spray', 'eraser']);
});
