// Tests für die Werkzeuggröße per Alt + rechter Maustaste (js/sizedrag.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draggedSize, clampSize, SIZED_TOOLS, MAX_SIZE, sliderToSize, sizeToSlider, SLIDER_STEPS } from '../js/sizedrag.js';

test('Größe folgt dem Mausweg, eine Stufe je 6 px', () => {
  assert.equal(draggedSize(3, 0), 3);
  assert.equal(draggedSize(3, 12), 5);
  assert.equal(draggedSize(3, 2), 3, 'unter einer halben Stufe bleibt es');
  assert.equal(draggedSize(3, -6), 2);
});

test('Größe bleibt zwischen 1 und 300', () => {
  assert.equal(MAX_SIZE, 300);
  assert.equal(draggedSize(3, -500), 1);
  assert.equal(draggedSize(3, 5000), 300);
  assert.equal(draggedSize(10, 60), 20, 'auch über 9 hinaus');
});

test('große Größen wachsen schneller als in Einerschritten', () => {
  assert.equal(draggedSize(100, 160), 200, 'alle 160 px doppelt');
  assert.equal(draggedSize(200, -160), 100, 'und halb so groß zurück');
  assert.ok(draggedSize(1, 900) >= 150, 'von 1 bis weit nach oben ohne meterlangen Weg');
});

test('Regler logarithmisch: kleine Größen treffbar, oben MAX_SIZE', () => {
  assert.equal(sliderToSize(0), 1);
  assert.equal(sliderToSize(SLIDER_STEPS), MAX_SIZE);
  for (const n of [1, 2, 5, 10, 64, 150, 300]) assert.equal(sliderToSize(sizeToSlider(n)), n, `hin und zurück: ${n}`);
  assert.ok(sizeToSlider(10) > SLIDER_STEPS * 0.35, '1–10 nehmen gut ein Drittel des Wegs ein');
});

test('eingetippte Größe wird begrenzt und gerundet', () => {
  assert.equal(clampSize('12'), 12);
  assert.equal(clampSize(7.6), 8);
  assert.equal(clampSize(0), 1);
  assert.equal(clampSize(999), 300);
  assert.equal(clampSize('abc'), 1);
});

test('nur Pinsel, Spray und Radierer haben eine Größe', () => {
  assert.deepEqual(SIZED_TOOLS, ['brush', 'spray', 'eraser']);
});
