// Tests für Bittys Stichwortsuche (js/search.js).
//
// Gesucht wird schnell und schlampig getippt: klein, ohne Umlaute, halbe
// Wörter, mal ein Buchstabe zu viel. Das soll trotzdem finden — aber
// Unsinn soll nicht alles finden.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, search } from '../js/search.js';

const E = [
  { label: 'Lasso', text: 'Lasso (L) umfährt eine freie Form' },
  { label: 'Onion Skin', text: 'lässt die Nachbar-Frames durchscheinen' },
  { label: 'Farbpaletten', text: 'Eine Palette bildet Index → Farbe ab' },
  { label: 'Füllen', text: 'Flood-Fill (F)' },
  { label: 'Export', text: 'PNG, GIF, Spritesheet' },
  { label: 'Animation — Frames', text: 'Mehrere Frames: Strg+Klick einzeln' },
];
const labels = (q) => search(q, E).map(e => e.label);

test('normalize: klein, ohne Umlaute und Satzzeichen', () => {
  assert.equal(normalize('Füllen & Färben!'), 'fullen farben');
  assert.equal(normalize('Größe'), 'grosse');
});

test('Umlaute egal', () => {
  assert.deepEqual(labels('fullen'), ['Füllen']);
  assert.deepEqual(labels('Füllen'), ['Füllen']);
});

test('Wortanfang reicht', () => {
  assert.deepEqual(labels('anim'), ['Animation — Frames']);
});

test('ein Tippfehler wird verziehen', () => {
  assert.deepEqual(labels('lassso'), ['Lasso']);
  assert.deepEqual(labels('exprot'), ['Export']);
});

test('Treffer im Namen vor Treffern im Text', () => {
  // „frames“ steht im Namen von „Animation — Frames“, bei Onion Skin nur im Text
  assert.deepEqual(labels('frames'), ['Animation — Frames', 'Onion Skin']);
});

test('alle Suchwörter müssen passen', () => {
  assert.deepEqual(labels('onion frames'), ['Onion Skin']);
  assert.deepEqual(labels('onion lasso'), []);
});

test('andere Sprache: findet über names, zeigt label', () => {
  const entries = [
    { label: 'Ebenen', names: 'Layers', text: 'Jede Ebene … Each layer …' },
    { label: 'Hilfslinien', names: 'Guides', text: 'Nur zum Zeichnen' },
  ];
  assert.deepEqual(search('layer', entries).map(e => e.label), ['Ebenen']);
  assert.deepEqual(search('guides', entries).map(e => e.label), ['Hilfslinien']);
});

test('leer oder Unsinn findet nichts', () => {
  assert.deepEqual(labels(''), []);
  assert.deepEqual(labels('   '), []);
  assert.deepEqual(labels('xyzzy'), []);
});
