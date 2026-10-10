// Tests für „Sprite hinzufügen“ (js/storage.js, addSpritesFromPayload).
//
// Sprites aus einer Datei kommen zum Projekt DAZU. Nichts darf dabei
// überschrieben werden: kein Sprite gleichen Namens, keine eigene Palette
// gleichen Namens, keine eingebaute Palette.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSpritesFromPayload } from '../js/storage.js';
import { sprites, customPalettes, getPaletteByName } from '../js/state.js';
import { DEFAULT_PALETTE } from '../js/data.js';

const grid = v => [[v, v], [v, v]];
const file = (name, palette, pals = {}) => ({
  version: 2, kind: 'sprite',
  sprites: { [name]: { name, palette, frames: [{ cels: [grid(1)] }] } },
  customPalettes: pals,
});

test('ein Sprite kommt dazu, gleicher Name bekommt eine Nummer', () => {
  const a = addSpritesFromPayload(file('held', DEFAULT_PALETTE));
  const b = addSpritesFromPayload(file('held', DEFAULT_PALETTE));
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.notEqual(a[0], b[0]);
  assert.equal(sprites[b[0]].name, 'held');
  assert.deepEqual(sprites[a[0]].grid, grid(1));
});

test('eigene Palette: gleich = wiederverwendet, anders = neuer Name', () => {
  const pal = { 1: '#ff0000', 2: '#00ff00' };
  const [x] = addSpritesFromPayload(file('rot', 'meine', { meine: pal }));
  assert.equal(sprites[x].palette, 'meine');
  const [y] = addSpritesFromPayload(file('rot2', 'meine', { meine: pal }));
  assert.equal(sprites[y].palette, 'meine', 'gleiche Farben → dieselbe Palette');
  const [z] = addSpritesFromPayload(file('blau', 'meine', { meine: { 1: '#0000ff' } }));
  assert.equal(sprites[z].palette, 'meine_2', 'andere Farben → eigener Name');
  assert.equal(customPalettes.meine[1], '#ff0000', 'die alte bleibt unverändert');
});

test('eine eingebaute Palette wird nie überschrieben', () => {
  const before = JSON.stringify(getPaletteByName(DEFAULT_PALETTE));
  const [id] = addSpritesFromPayload(file('x', DEFAULT_PALETTE, { [DEFAULT_PALETTE]: { 1: '#123456' } }));
  assert.equal(JSON.stringify(getPaletteByName(DEFAULT_PALETTE)), before);
  assert.notEqual(sprites[id].palette, DEFAULT_PALETTE);
});

test('Unbrauchbares ergibt nichts', () => {
  assert.deepEqual(addSpritesFromPayload(null), []);
  assert.deepEqual(addSpritesFromPayload({ sprites: { a: { name: 'a' } } }), []);
});
