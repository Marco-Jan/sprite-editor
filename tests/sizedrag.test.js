// Tests für die Werkzeuggröße per Alt + rechter Maustaste (js/sizedrag.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draggedSize, SIZED_TOOLS } from '../js/sizedrag.js';

test('Größe folgt dem Mausweg, eine Stufe je 12 px', () => {
  assert.equal(draggedSize(3, 0), 3);
  assert.equal(draggedSize(3, 24), 5);
  assert.equal(draggedSize(3, 5), 3, 'unter einer halben Stufe bleibt es');
  assert.equal(draggedSize(3, -12), 2);
});

test('Größe bleibt zwischen 1 und 9', () => {
  assert.equal(draggedSize(3, -500), 1);
  assert.equal(draggedSize(3, 500), 9);
});

test('nur Pinsel, Spray und Radierer haben eine Größe', () => {
  assert.deepEqual(SIZED_TOOLS, ['brush', 'spray', 'eraser']);
});
