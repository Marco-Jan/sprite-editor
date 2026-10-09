// Tests für Füllen mit Grenzen aus einem Vorlagebild (js/fill.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillRegion } from '../js/fill.js';

const blank = (W, H) => Array.from({ length: H }, () => Array(W).fill(0));

test('ohne Vorlage: zusammenhängende Fläche im eigenen Bild', () => {
  const g = blank(4, 3);
  g[1] = [0, 5, 5, 5]; // Mauer
  assert.equal(fillRegion(g, g, 0, 0, 2), 9, 'um die Mauer herum: 4 + 1 + 4');
  assert.deepEqual(g, [[2, 2, 2, 2], [2, 5, 5, 5], [2, 2, 2, 2]]);
  assert.equal(fillRegion(g, g, 0, 0, 2), 0, 'schon gefüllt');
});

test('mit Vorlage: die Grenzen kommen von der Vorlage, gemalt wird ins leere Bild', () => {
  const ref = [
    [0, 0, 7, 0],
    [0, 0, 7, 0],
    [7, 7, 7, 0],
  ];
  const g = blank(4, 3);
  assert.equal(fillRegion(g, ref, 0, 0, 3), 4, 'nur das Feld links oben, die 7er sind die Grenze');
  assert.deepEqual(g, [[3, 3, 0, 0], [3, 3, 0, 0], [0, 0, 0, 0]]);
  assert.deepEqual(ref[0], [0, 0, 7, 0], 'die Vorlage bleibt unverändert');
  // Auf die Linie selbst geklickt: die Linie wird ausgemalt.
  const g2 = blank(4, 3);
  assert.equal(fillRegion(g2, ref, 2, 0, 1), 5);
  // Rechts ist das Feld offen nach unten: 3 Pixel.
  const g3 = blank(4, 3);
  assert.equal(fillRegion(g3, ref, 3, 0, 1), 3);
});

test('mit Vorlage: auch wenn das Bild an der Stelle schon die Farbe hat, wird weitergesucht', () => {
  const ref = [[0, 0, 0]];
  const g = [[4, 0, 0]];
  assert.equal(fillRegion(g, ref, 0, 0, 4), 2);
  assert.deepEqual(g, [[4, 4, 4]]);
});

test('außerhalb: nichts', () => {
  const g = blank(2, 2);
  assert.equal(fillRegion(g, g, 5, 0, 1), 0);
});
