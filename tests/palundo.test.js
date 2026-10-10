// Tests für Undo bei Paletten-Änderungen (js/history.js recordPalettes,
// startPaletteEdit / endPaletteEdit).
//
// Paletten, Materialien, Farbnamen und welche Palette ein Sprite nutzt
// gehören in denselben Schritt — und Pixel nur, wenn sie sich mitändern.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordPalettes, startPaletteEdit, endPaletteEdit, undo, redo, clearHistory, canUndo } from '../js/history.js';
import { state, sprites, customPalettes, paletteColorNames, makeSprite } from '../js/state.js';

function setup() {
  clearHistory();
  for (const k of Object.keys(customPalettes)) delete customPalettes[k];
  customPalettes.meine = { 1: '#111111', 2: '#222222' };
  paletteColorNames.meine = { 1: 'Kontur' };
  sprites.s = makeSprite({ name: 's', palette: 'meine', frames: [{ cels: [[[1, 0], ['#abcdef', 2]]] }] });
  state.curSprite = 's';
  state.palPreview = null;
}

test('Farbe ändern und anhängen: ein Schritt, Undo und Redo', () => {
  setup();
  recordPalettes(() => {
    customPalettes.meine[1] = '#ff0000';
    customPalettes.meine[3] = '#00ff00';
    paletteColorNames.meine[3] = 'Neu';
  });
  assert.ok(canUndo());
  undo();
  assert.deepEqual(customPalettes.meine, { 1: '#111111', 2: '#222222' });
  assert.deepEqual(paletteColorNames.meine, { 1: 'Kontur' });
  redo();
  assert.equal(customPalettes.meine[1], '#ff0000');
  assert.equal(paletteColorNames.meine[3], 'Neu');
});

test('ohne Änderung kein Eintrag', () => {
  setup();
  recordPalettes(() => {});
  assert.equal(canUndo(), false);
});

test('Kopie anlegen und zuweisen: Undo stellt die alte Palette des Sprites her', () => {
  setup();
  recordPalettes(() => {
    customPalettes.meine_kopie = { ...customPalettes.meine };
    sprites.s.palette = 'meine_kopie';
  });
  undo();
  assert.equal(sprites.s.palette, 'meine');
  assert.equal(customPalettes.meine_kopie, undefined);
});

test('Farbe aufnehmen: Palette und Pixel zusammen zurück', () => {
  setup();
  recordPalettes(() => {
    customPalettes.meine[3] = '#abcdef';
    sprites.s.frames[0].cels[0][1][0] = 3;
  });
  assert.equal(sprites.s.frames[0].cels[0][1][0], 3);
  undo();
  assert.equal(customPalettes.meine[3], undefined);
  assert.equal(sprites.s.frames[0].cels[0][1][0], '#abcdef', 'Pixel wieder freie Farbe');
  redo();
  assert.equal(sprites.s.frames[0].cels[0][1][0], 3);
});

test('Farbwähler: ein Schritt je Öffnen, gemalte Pixel bleiben außen vor', () => {
  setup();
  const step = startPaletteEdit();
  customPalettes.meine[1] = '#330000';
  customPalettes.meine[1] = '#660000';   // Zwischenfarben beim Ziehen
  sprites.s.frames[0].cels[0][0][1] = 2;  // in der Zwischenzeit gemalt
  endPaletteEdit(step, { pixels: false });
  undo();
  assert.equal(customPalettes.meine[1], '#111111', 'zurück auf die Farbe vor dem Öffnen');
  assert.equal(sprites.s.frames[0].cels[0][0][1], 2, 'das Gemalte bleibt');
  assert.equal(canUndo(), false, 'nur ein Schritt');
});
