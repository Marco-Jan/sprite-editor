// Tests für die Migration alter Projektstände (js/migrate.js).
//
// Diese Datei läuft über Daten, die jemand vor Jahren gezeichnet hat. Geht
// sie schief, ist die Arbeit weg — und zwar still, weil der Editor danach
// einfach "leer" aussieht. Deshalb wird hier geprüft, dass sie mit allem
// zurechtkommt, was ein alter Speicherstand enthalten kann.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateV1 } from '../js/migrate.js';

/** Minimaler v1-Stand mit einem selbst gemalten Sprite. */
const v1 = (extra = {}) => ({
  grids: {
    custom_1: [[1, 0], [0, 2]],
  },
  customMeta: {
    custom_1: { palType: 'neutral', name: 'Mein Sprite' },
  },
  customPalettes: {
    neutral: { leer: { 1: '#ff0000', 2: '#00ff00' } },
  },
  ui: { curType: 'custom_1' },
  ...extra,
});

test('ein eigener Sprite übersteht die Migration', () => {
  const { payload } = migrateV1(v1());
  const ids = Object.keys(payload.sprites);
  assert.equal(ids.length, 1);
  const sp = payload.sprites[ids[0]];
  assert.ok(sp.frames || sp.grid, 'das Bild muss ankommen');
  assert.equal(payload.version, 2);
});

test('der Name aus den alten Metadaten bleibt erhalten', () => {
  const { payload } = migrateV1(v1());
  const sp = Object.values(payload.sprites)[0];
  assert.equal(sp.name, 'Mein Sprite');
});

test('bearbeitete Beispiel-Sprites gehen nicht verloren', () => {
  // Hund und Katze waren in v1 immer dabei. Unverändert fliegen sie raus
  // (erkannt an einer Prüfsumme der Original-Bilder, siehe migrate.js) —
  // wer sie aber angemalt hat, muss sie wiederfinden.
  const { payload } = migrateV1({
    grids: { dog: { normal: [[7, 7], [7, 7]] }, custom_1: [[1]] },
    customMeta: { custom_1: { palType: 'neutral', name: 'Eigen' } },
    customPalettes: {},
    ui: {},
  });
  const namen = Object.values(payload.sprites).map(s => s.name);
  assert.ok(namen.includes('Eigen'), 'der eigene Sprite fehlt');
  assert.equal(namen.length, 2, 'der bearbeitete Hund muss mitkommen');
});

test('ein leerer oder unsinniger Stand ergibt ein leeres Projekt, keinen Absturz', () => {
  for (const bad of [{}, { grids: null }, { grids: {}, customMeta: null }, { grids: { x: null } }]) {
    const r = migrateV1(bad);
    assert.equal(typeof r.payload, 'object');
    assert.equal(r.payload.version, 2);
  }
});

test('eigene Paletten wandern mit und behalten ihre Farben', () => {
  const { payload } = migrateV1(v1());
  const pals = payload.customPalettes || {};
  const alle = Object.values(pals);
  assert.ok(alle.length >= 1, 'die eigene Palette fehlt');
  const flat = JSON.stringify(alle);
  assert.ok(flat.includes('#ff0000'), 'Farbe 1 ist verloren gegangen');
  assert.ok(flat.includes('#00ff00'), 'Farbe 2 ist verloren gegangen');
});

test('gleich benannte Paletten aus verschiedenen Töpfen überschreiben sich nicht', () => {
  const { payload } = migrateV1({
    grids: { custom_1: [[1]] },
    customMeta: { custom_1: { palType: 'dog', name: 'A' } },
    customPalettes: {
      dog: { rot: { 1: '#ff0000' } },
      cat: { rot: { 1: '#0000ff' } },
    },
    ui: {},
  });
  const pals = payload.customPalettes || {};
  assert.equal(Object.keys(pals).length, 2, 'beide „rot" müssen überleben');
});

test('die Migration meldet, was sie getan hat', () => {
  const r = migrateV1(v1());
  assert.ok('note' in r, 'ohne Hinweis weiß der Nutzer nicht, was passiert ist');
});
