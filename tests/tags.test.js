// Tests für Frame-Tags (js/tags.js).
//
// Ein Tag ist ein Bereich aus Frame-Nummern. Er muss beim Einfügen und
// Löschen von Frames mitwandern, sonst zeigt „Laufen" plötzlich auf den
// Sprung. Und das Abspielen in einer Richtung muss genau die Frames des
// Tags zeigen — Ping-Pong ohne die Enden doppelt.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTags, tagsInsert, tagsDelete, tagAt, tagFrames, nextPlayFrame, tagLanes, copyTags,
} from '../js/tags.js';

const tag = (from, to, dir = 'forward', name = 'T') => ({ name, from, to, color: '#e5534b', dir });

test('normalizeTags passt Bereiche ein und verwirft Kaputtes', () => {
  const out = normalizeTags([
    { name: ' Lauf ', from: 2, to: 9, dir: 'pingpong', color: '#ABCDEF' },
    { from: 5, to: 1 },                 // vertauscht
    { name: 'weg', from: 'x', to: 2 },  // keine Zahl
    { from: 20, to: 30 },               // ganz außerhalb
  ], 6);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { name: 'Lauf', from: 2, to: 5, color: '#abcdef', dir: 'pingpong' });
  assert.equal(out[1].from, 1);
  assert.equal(out[1].to, 5);
  assert.equal(out[1].dir, 'forward');
  assert.match(out[1].color, /^#[0-9a-f]{6}$/);
  assert.deepEqual(normalizeTags(null, 4), []);
});

test('einfügen vor einem Tag schiebt ihn, im Tag oder am Ende wächst er', () => {
  const t = [tag(2, 4)];
  tagsInsert(t, 1);                 // davor
  assert.deepEqual([t[0].from, t[0].to], [3, 5]);
  tagsInsert(t, 4);                 // mitten hinein
  assert.deepEqual([t[0].from, t[0].to], [3, 6]);
  tagsInsert(t, 7);                 // direkt hinter dem letzten
  assert.deepEqual([t[0].from, t[0].to], [3, 7]);
  tagsInsert(t, 9);                 // weiter weg
  assert.deepEqual([t[0].from, t[0].to], [3, 7]);
});

test('löschen schiebt nach, verkürzt, und ein leerer Tag verschwindet', () => {
  const t = [tag(2, 4, 'forward', 'a'), tag(6, 6, 'forward', 'b')];
  tagsDelete(t, [0]);               // davor
  assert.deepEqual([t[0].from, t[0].to], [1, 3]);
  tagsDelete(t, [2]);               // im ersten
  assert.deepEqual([t[0].from, t[0].to], [1, 2]);
  tagsDelete(t, [4]);               // der einzige Frame von b (6 → 5 → 4)
  assert.equal(t.length, 1);
  assert.equal(t[0].name, 'a');
});

test('mehrere Frames auf einmal löschen', () => {
  const t = [tag(3, 6)];
  tagsDelete(t, [1, 4, 5]);
  assert.deepEqual([t[0].from, t[0].to], [2, 3]);
});

test('tagAt nimmt den engsten Tag', () => {
  const t = [tag(0, 9, 'forward', 'groß'), tag(3, 4, 'forward', 'klein')];
  assert.equal(tagAt(t, 3).name, 'klein');
  assert.equal(tagAt(t, 7).name, 'groß');
  assert.equal(tagAt(t, 12), null);
});

test('Reihenfolge je Richtung', () => {
  assert.deepEqual(tagFrames(tag(2, 4)), [2, 3, 4]);
  assert.deepEqual(tagFrames(tag(2, 4, 'reverse')), [4, 3, 2]);
  assert.deepEqual(tagFrames(tag(2, 5, 'pingpong')), [2, 3, 4, 5, 4, 3]);
  assert.deepEqual(tagFrames(tag(2, 3, 'pingpong')), [2, 3]);
});

test('Abspielen bleibt im Tag und kennt Ping-Pong', () => {
  const g = tag(1, 3, 'pingpong');
  let p = { frame: 1, step: 0 };
  const seen = [];
  for (let k = 0; k < 6; k++) { p = nextPlayFrame(g, 10, p.frame, p.step); seen.push(p.frame); }
  assert.deepEqual(seen, [2, 3, 2, 1, 2, 3]);
});

test('Abspielen ohne Tag läuft über alle Frames', () => {
  assert.deepEqual(nextPlayFrame(null, 3, 2, 0), { frame: 0, step: 0 });
});

test('rückwärts fängt beim aktuellen Frame an', () => {
  const g = tag(0, 3, 'reverse');
  assert.equal(nextPlayFrame(g, 4, 2, 0).frame, 1);
  assert.equal(nextPlayFrame(g, 4, 0, 0).frame, 3);
});

test('überlappende Tags liegen auf eigenen Spuren', () => {
  assert.deepEqual(tagLanes([tag(0, 3), tag(2, 5), tag(4, 6), tag(7, 8)]), [0, 1, 0, 0]);
});

test('copyTags kopiert, statt zu teilen', () => {
  const a = [tag(0, 1)];
  const b = copyTags(a);
  b[0].to = 5;
  assert.equal(a[0].to, 1);
});
