// Tests für Aseprite lesen/schreiben (js/aseprite.js).
//
//   npm test
//   ASE_SAMPLES=<ordner mit .aseprite-Dateien> npm test   (zusätzlich echte Dateien)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAse, writeAse, AseError } from '../js/aseprite.js';

const PAL = { 1: '#FF0000', 2: '#00FF00', 3: '#0000FF' };
const grid = (w, h) => Array.from({ length: h }, () => new Array(w).fill(0));

function sample() {
  const a0 = grid(12, 8), b0 = grid(12, 8), a1 = grid(12, 8);
  a0[1][1] = 1; a0[6][10] = 3; b0[4][4] = 2; a1[5][5] = 2;
  return {
    fps: 10,
    layers: [
      { name: 'Körper', visible: true, locked: false, opacity: 1, mask: null, tileset: null },
      { name: 'Augen', visible: false, locked: true, opacity: 0.5, mask: null, tileset: null },
    ],
    // Frame 1 teilt sich die Augen mit Frame 0 (verknüpft: dasselbe Array).
    frames: [{ cels: [a0, b0], dur: 0 }, { cels: [a1, b0], dur: 250 }],
    tags: [{ name: 'Laufen', from: 0, to: 1, color: '#0a141e', dir: 'pingpong' }],
  };
}

const spriteOf = p => Object.values(p.sprites)[0];
const resolve = frames => frames.map((f, i) => ({ ...f, cels: f.cels.map((c, l) => (c.link !== undefined ? frames[c.link].cels[l] : c)) }));

test('hin und zurück: Ebenen, Frames, Verknüpfung, Tags, Palette', async () => {
  const sp = sample();
  const bytes = await writeAse(sp, PAL);
  assert.equal(bytes[4] | (bytes[5] << 8), 0xA5E0);
  assert.equal(new DataView(bytes.buffer).getUint32(0, true), bytes.length, 'Dateigröße im Kopf');
  assert.equal(bytes[12], 8, 'indiziert');
  const p = await readAse(bytes, 'held');
  const s = spriteOf(p);
  assert.equal(p.kind, 'sprite');
  assert.deepEqual(p.customPalettes.held, PAL);
  assert.equal(s.palette, 'held');
  assert.deepEqual(s.layers.map(l => [l.name, l.visible, l.locked]), [['Körper', true, false], ['Augen', false, true]]);
  assert.ok(Math.abs(s.layers[1].opacity - 0.5) < 0.01);
  assert.deepEqual(s.frames[1].cels[1], { link: 0 }, 'verknüpfte Zelle bleibt verknüpft');
  const fr = resolve(s.frames);
  assert.deepEqual(fr[0].cels, sp.frames[0].cels);
  assert.deepEqual(fr[1].cels, sp.frames[1].cels);
  assert.equal(s.frames[1].dur, 250);
  assert.equal(s.fps, 10);
  assert.deepEqual(s.tags, sp.tags);
});

test('freie Farben → RGBA, und zurück als freie Farbe', async () => {
  const sp = sample();
  sp.frames[0].cels[0][7][0] = '#010203';
  const bytes = await writeAse(sp, PAL);
  assert.equal(bytes[12], 32, 'RGBA');
  const fr = resolve(spriteOf(await readAse(bytes, 'held')).frames);
  assert.equal(fr[0].cels[0][7][0], '#010203');
  assert.equal(fr[0].cels[0][1][1], 1, 'Palettenfarbe bleibt Nummer 1');
});

test('Maske wird eingerechnet', async () => {
  const sp = sample();
  const hide = grid(12, 8); hide[1][1] = 1;
  sp.layers[0].mask = { on: true, hide };
  const fr = resolve(spriteOf(await readAse(await writeAse(sp, PAL), 'held')).frames);
  assert.equal(fr[0].cels[0][1][1], 0);
  assert.equal(fr[0].cels[0][6][10], 3);
});

test('Tilemap-Ebene mit Tileset', async () => {
  const g = grid(16, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) g[y][x] = (x + y) % 2 ? 2 : 1;
  const tile = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => ((x + y) % 2 ? 2 : 1)));
  const sp = { fps: 8, tags: [], layers: [{ name: 'Level', visible: true, locked: false, opacity: 1, mask: null, tileset: { tw: 8, th: 8, tiles: [tile] } }], frames: [{ cels: [g] }] };
  const s = spriteOf(await readAse(await writeAse(sp, { 1: '#FFFFFF', 2: '#000000' }), 'level'));
  assert.equal(s.layers[0].tileset.tw, 8);
  assert.equal(s.layers[0].tileset.tiles.length, 1);
  assert.deepEqual(s.frames[0].cels[0], g);
});

test('Unsinn ist kein Absturz, sondern ein Fehler', async () => {
  await assert.rejects(readAse(new Uint8Array(10), 'x'), e => e instanceof AseError && e.code === 'notAse');
  const bytes = await writeAse(sample(), PAL);
  for (const cut of [130, 200, bytes.length >> 1, bytes.length - 3]) {
    try { await readAse(bytes.subarray(0, cut), 'x'); } catch (e) { assert.ok(e instanceof AseError || e instanceof TypeError, String(e)); }
  }
  const big = bytes.slice(); big[8] = 0; big[9] = 8; // Breite 2048
  await assert.rejects(readAse(big, 'x'), e => e.code === 'tooBig');
});

test('echte Aseprite-Dateien (ASE_SAMPLES)', { skip: !process.env.ASE_SAMPLES }, async () => {
  const dir = process.env.ASE_SAMPLES;
  const files = readdirSync(dir).filter(f => /\.(aseprite|ase)$/.test(f));
  assert.ok(files.length);
  for (const f of files) {
    const p = await readAse(readFileSync(join(dir, f)), f.replace(/\.\w+$/, ''));
    const s = spriteOf(p);
    const again = spriteOf(await readAse(await writeAse({ ...s, frames: resolve(s.frames) }, p.customPalettes[s.palette]), 'x'));
    assert.deepEqual(resolve(again.frames).map(fr => fr.cels), resolve(s.frames).map(fr => fr.cels), f);
  }
});
