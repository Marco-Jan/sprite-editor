// Tests für das Sprite-Modell in js/state.js — Frames, Ebenen, Dauer.
//
// Das ist die Datenstruktur, an der alles hängt: ein Fehler hier zerstört
// Bilder, die jemand gezeichnet hat. Darum steht hier nicht nur der
// Normalfall, sondern auch das, was bei Projektdateien aus fremder Hand
// ankommen kann — zu wenige Ebenen, fehlende Dauer, ungültige Werte.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyGrid, blankLike, makeSprite, flatGrid, frameDuration,
  allGrids, mapFrames, normalizeLayer, makeSpriteId, sprites,
  DEFAULT_FPS, MAX_FPS,
} from '../js/state.js';

const grid = rows => rows.map(r => [...r]);

/** Sprite mit einer Ebene und `n` Frames. */
const simple = (n = 1, cell = 1) => makeSprite({
  name: 'Test',
  palette: 'graustufen',
  frames: Array.from({ length: n }, () => ({ grid: [[cell, 0], [0, cell]] })),
});

// ── Raster ──────────────────────────────────────────────────────────
test('emptyGrid liefert ein quadratisches Raster aus Nullen', () => {
  const g = emptyGrid(3);
  assert.equal(g.length, 3);
  assert.equal(g[0].length, 3);
  assert.ok(g.every(row => row.every(c => c === 0)));
});

test('blankLike behält die Maße und leert den Inhalt', () => {
  const g = blankLike(grid([[1, 2, 3], [4, 5, 6]]));
  assert.deepEqual(g, [[0, 0, 0], [0, 0, 0]]);
});

// ── Sprite bauen ────────────────────────────────────────────────────
test('makeSprite legt zu jedem Frame dieselbe Zahl Ebenen an', () => {
  // Zweiter Frame bringt zwei Ebenen mit, der erste nur eine: der erste
  // muss aufgefüllt werden, sonst zeigt die Timeline Löcher.
  const sp = makeSprite({
    name: 'A', palette: 'graustufen',
    frames: [{ cels: [[[1]]] }, { cels: [[[1]], [[2]]] }],
  });
  assert.equal(sp.frames[0].cels.length, 2);
  assert.equal(sp.frames[1].cels.length, 2);
  assert.deepEqual(sp.frames[0].cels[1], [[0]], 'aufgefüllte Ebene ist leer');
  assert.equal(sp.layers.length, 2);
});

test('makeSprite hält fps in seinen Grenzen', () => {
  assert.equal(makeSprite({ name: 'A', palette: 'graustufen', frames: [{ grid: [[0]] }], fps: 0 }).fps, DEFAULT_FPS);
  assert.equal(makeSprite({ name: 'A', palette: 'graustufen', frames: [{ grid: [[0]] }], fps: 999 }).fps, MAX_FPS);
  assert.equal(makeSprite({ name: 'A', palette: 'graustufen', frames: [{ grid: [[0]] }], fps: 12 }).fps, 12);
});

test('der aktive Frame kann nicht außerhalb liegen', () => {
  const sp = makeSprite({ name: 'A', palette: 'graustufen', frames: [{ grid: [[0]] }], frame: 7 });
  assert.equal(sp.frame, 0);
});

test('makeSpriteId hängt eine Zahl an, statt einen Namen zu überschreiben', () => {
  delete sprites.held;
  delete sprites.held_2;
  assert.equal(makeSpriteId('Held'), 'Held');
  sprites.Held = {};
  assert.equal(makeSpriteId('Held'), 'Held_2');
  delete sprites.Held;
});

// ── Ebenen zusammenfügen ────────────────────────────────────────────
test('flatGrid legt sichtbare Ebenen übereinander, oberste gewinnt', () => {
  const sp = makeSprite({
    name: 'A', palette: 'graustufen',
    frames: [{ cels: [[[1, 1]], [[0, 2]]] }],
  });
  assert.deepEqual(flatGrid(sp, 0), [[1, 2]]);
});

test('eine ausgeblendete Ebene zählt nicht mit', () => {
  const sp = makeSprite({
    name: 'A', palette: 'graustufen',
    frames: [{ cels: [[[1, 1]], [[0, 2]]] }],
    layers: [{ name: 'unten', visible: true }, { name: 'oben', visible: false }],
  });
  assert.deepEqual(flatGrid(sp, 0), [[1, 1]]);
});

test('allGrids erreicht jede Ebene in jedem Frame', () => {
  const sp = makeSprite({
    name: 'A', palette: 'graustufen',
    frames: [{ cels: [[[1]], [[2]]] }, { cels: [[[3]], [[4]]] }],
  });
  assert.equal(allGrids(sp).length, 4);
});

test('mapFrames fasst jede Ebene an, nicht nur die aktive', () => {
  const sp = makeSprite({
    name: 'A', palette: 'graustufen',
    frames: [{ cels: [[[1]], [[2]]] }],
  });
  mapFrames(sp, g => g.map(row => row.map(c => c + 10)));
  assert.deepEqual(sp.frames[0].cels[0], [[11]]);
  assert.deepEqual(sp.frames[0].cels[1], [[12]]);
});

// ── Dauer ───────────────────────────────────────────────────────────
test('ohne eigene Dauer gilt die Bildrate des Sprites', () => {
  const sp = simple(2);
  sp.fps = 10;
  assert.equal(frameDuration(sp, 0), 100);
});

test('eine eigene Dauer schlägt die Bildrate', () => {
  const sp = simple(2);
  sp.fps = 10;
  sp.frames[1].dur = 450;
  assert.equal(frameDuration(sp, 0), 100);
  assert.equal(frameDuration(sp, 1), 450);
});

// ── Ebenen aus fremden Dateien ──────────────────────────────────────
test('normalizeLayer macht aus Unsinn eine brauchbare Ebene', () => {
  const l = normalizeLayer(null, 3);
  assert.equal(typeof l.name, 'string');
  assert.equal(l.visible, true);
  assert.equal(l.locked, false);
  assert.equal(l.opacity, 1, 'Deckkraft läuft von 0 bis 1, nicht in Prozent');

  const weird = normalizeLayer({ name: 42, visible: 'ja', opacity: 900 }, 1);
  assert.equal(typeof weird.name, 'string');
  assert.equal(weird.visible, true);
  assert.equal(weird.opacity, 1, 'zu große Werte werden gekappt');
  assert.equal(normalizeLayer({ opacity: -5 }, 1).opacity, 0);
  assert.equal(normalizeLayer({ opacity: 'dunkel' }, 1).opacity, 1, 'Unsinn → voll sichtbar');
});
