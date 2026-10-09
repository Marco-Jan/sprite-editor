// Tests für js/light.js (Kantenlicht und Schlagschatten).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightGrid, dropShadowGrid, paletteStep, shiftHex } from '../js/light.js';

// Palette mit einer Farbfamilie Grün in drei Stufen und Grau.
const PAL = { 1: '#2E7D32', 2: '#4CAF50', 3: '#A5D6A7', 4: '#808080', 5: '#FFFFFF', 6: '#000000' };

const block = (v, w = 5, h = 5, pad = 1) => Array.from({ length: h + 2 * pad }, (_, y) =>
  Array.from({ length: w + 2 * pad }, (_, x) =>
    x >= pad && y >= pad && x < w + pad && y < h + pad ? v : 0));

const FROM_TOP_LEFT = { dx: -1, dy: -1 };

test('Palette: nächste hellere/dunklere Farbe derselben Familie', () => {
  assert.equal(paletteStep(PAL, 2, +1, 0.15), 3);
  assert.equal(paletteStep(PAL, 2, -1, 0.15), 1);
  // Grau springt nicht ins Grün, sondern zu Weiß/Schwarz.
  assert.equal(paletteStep(PAL, 4, +1, 0.15), 5);
  assert.equal(paletteStep(PAL, 4, -1, 0.15), 6);
  // Hellste Farbe der Familie hat nach oben nur noch Weiß.
  assert.equal(paletteStep(PAL, 3, +1, 0.15), 5);
});

test('Kantenlicht: Lichtseite heller, Gegenseite dunkler, Inneres bleibt', () => {
  const g = block(2);
  const r = lightGrid(g, PAL, FROM_TOP_LEFT);
  // oben links (Ecke) und oberer/linker Rand → hell
  assert.equal(g[1][1], 3);
  assert.equal(g[1][3], 3);
  assert.equal(g[3][1], 3);
  // unten rechts → dunkel
  assert.equal(g[5][5], 1);
  assert.equal(g[5][3], 1);
  assert.equal(g[3][5], 1);
  // Mitte unverändert
  assert.equal(g[3][3], 2);
  assert.ok(r.lit > 0 && r.shaded > 0);
  // Transparentes bleibt transparent
  assert.equal(g[0][0], 0);
});

test('Kantenlicht: Breite 2 erfasst auch die zweite Reihe', () => {
  const g = block(2, 6, 6);
  lightGrid(g, PAL, { dx: 0, dy: -1 }, { width: 2 });
  assert.equal(g[1][3], 3);
  assert.equal(g[2][3], 3);
  assert.equal(g[3][3], 2);
  assert.equal(g[5][3], 1);
  assert.equal(g[6][3], 1);
});

test('1-Pixel-Linie (Leere auf beiden Seiten) bleibt unverändert', () => {
  const g = [[0, 0, 0], [0, 2, 0], [0, 0, 0]];
  const r = lightGrid(g, PAL, FROM_TOP_LEFT);
  assert.equal(g[1][1], 2);
  assert.deepEqual(r, { lit: 0, shaded: 0 });
});

test('nur Licht bzw. nur Schatten', () => {
  const a = block(2);
  lightGrid(a, PAL, FROM_TOP_LEFT, { shadow: false });
  assert.equal(a[1][1], 3);
  assert.equal(a[5][5], 2);
  const b = block(2);
  lightGrid(b, PAL, FROM_TOP_LEFT, { highlight: false });
  assert.equal(b[1][1], 2);
  assert.equal(b[5][5], 1);
});

test('ohne passende Palettenfarbe: unverändert, mit allowHex freie Farbe', () => {
  const pal = { 1: '#4CAF50' };
  const a = block(1);
  lightGrid(a, pal, FROM_TOP_LEFT);
  assert.equal(a[1][1], 1);
  const b = block(1);
  lightGrid(b, pal, FROM_TOP_LEFT, { allowHex: true });
  assert.match(b[1][1], /^#[0-9a-f]{6}$/);
});

test('freie Farben werden direkt aufgehellt/abgedunkelt', () => {
  const g = block('#4caf50');
  lightGrid(g, PAL, FROM_TOP_LEFT, { amount: 0.2 });
  const lum = h => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
  assert.ok(lum(g[1][1]) > lum('#4caf50'));
  assert.ok(lum(g[5][5]) < lum('#4caf50'));
  assert.equal(g[3][3], '#4caf50');
});

test('shiftHex: Grau bleibt grau', () => {
  const h = shiftHex('#808080', +1, 0.2);
  assert.equal(h.slice(1, 3), h.slice(3, 5));
  assert.equal(h.slice(3, 5), h.slice(5, 7));
});

test('Auswahl: nur Pixel innerhalb werden verändert', () => {
  const g = block(2);
  lightGrid(g, PAL, FROM_TOP_LEFT, { inside: (x) => x <= 3 });
  assert.equal(g[1][1], 3);
  assert.equal(g[5][5], 2);
});

test('Schlagschatten fällt von der Lampe weg, nur in leere Zellen', () => {
  const g = [
    [0, 0, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const n = dropShadowGrid(g, FROM_TOP_LEFT, 6, 1);
  assert.equal(n, 1);
  assert.equal(g[2][2], 6);
  assert.equal(g[1][1], 2);
});

test('Schlagschatten: Abstand 2 malt eine durchgehende Spur', () => {
  const g = Array.from({ length: 5 }, () => Array(5).fill(0));
  g[1][1] = 2;
  dropShadowGrid(g, { dx: 0, dy: -1 }, 6, 2);
  assert.equal(g[2][1], 6);
  assert.equal(g[3][1], 6);
  assert.equal(g[4][1], 0);
});

test('ohne Richtung passiert nichts', () => {
  const g = block(2);
  assert.deepEqual(lightGrid(g, PAL, { dx: 0, dy: 0 }), { lit: 0, shaded: 0 });
  assert.equal(dropShadowGrid(g, { dx: 0, dy: 0 }, 6), 0);
});
