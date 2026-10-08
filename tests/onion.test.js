// Tests für Timeline-Einstellungen und Onion Skin (js/onion.js).
//
// Welche Nachbar-Frames durchscheinen, hängt an vier Einstellungen und am
// Tag, in dem man steht. Fehler hier sieht man nur als „irgendwie falscher
// Schatten" — darum werden die Fälle einzeln durchgezählt.
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTlOpts, defaultTlOpts, onionFrames, frameLabel, TL_DEFAULTS } from '../js/onion.js';

const sprite = (n, tags = []) => ({ frames: Array.from({ length: n }, () => ({})), tags });
const opts = onion => ({ ...defaultTlOpts(), onion: { ...TL_DEFAULTS.onion, ...onion } });
const frames = list => list.map(o => o.frame);

test('Vorgabe: je ein Frame davor und danach', () => {
  const r = onionFrames(sprite(5), 2, defaultTlOpts());
  assert.deepEqual(frames(r), [1, 3]);
  assert.deepEqual(r.map(o => o.side), ['before', 'after']);
});

test('mehr Frames, jeder weitere blasser', () => {
  const r = onionFrames(sprite(9), 4, opts({ before: 3, after: 2, opacity: 0.5, step: 0.5 }));
  assert.deepEqual(frames(r), [3, 5, 2, 6, 1]);
  assert.equal(r[0].alpha, 0.5);
  assert.equal(r[2].alpha, 0.25);
  assert.equal(r[4].alpha, 0.125);
});

test('am Rand der Animation ist Schluss', () => {
  assert.deepEqual(frames(onionFrames(sprite(3), 0, opts({ before: 2, after: 2 }))), [1, 2]);
});

test('0 davor heißt: nur danach', () => {
  assert.deepEqual(frames(onionFrames(sprite(5), 2, opts({ before: 0, after: 1 }))), [3]);
});

test('im Tag bleiben: am Ende geht es vorn weiter', () => {
  const sp = sprite(10, [{ from: 2, to: 5, name: 't', color: '#000000', dir: 'forward' }]);
  assert.deepEqual(frames(onionFrames(sp, 5, opts({ loopTag: true }))), [4, 2]);
  assert.deepEqual(frames(onionFrames(sp, 2, opts({ loopTag: true }))), [5, 3]);
});

test('im Tag bleiben zeigt keinen Frame doppelt und nie sich selbst', () => {
  const sp = sprite(10, [{ from: 2, to: 3, name: 't', color: '#000000', dir: 'forward' }]);
  assert.deepEqual(frames(onionFrames(sp, 2, opts({ loopTag: true, before: 3, after: 3 }))), [3]);
});

test('normalizeTlOpts: Unsinn wird Vorgabe, Grenzen halten', () => {
  const o = normalizeTlOpts({ firstFrame: 7, thumbs: 0, onion: { mode: 'x', opacity: 5, step: -1, before: 9, after: 'a', front: 1 } });
  assert.equal(o.firstFrame, 1);
  assert.equal(o.thumbs, true, 'nur ausdrücklich false schaltet aus');
  assert.equal(o.onion.mode, 'tint');
  assert.equal(o.onion.opacity, 0.9);
  assert.equal(o.onion.step, 0);
  assert.equal(o.onion.before, 3);
  assert.equal(o.onion.after, TL_DEFAULTS.onion.after);
  assert.equal(o.onion.front, true);
  assert.deepEqual(normalizeTlOpts(null), defaultTlOpts());
});

test('frameLabel zählt ab 0 oder 1', () => {
  assert.equal(frameLabel(0, { firstFrame: 0 }), 0);
  assert.equal(frameLabel(0, { firstFrame: 1 }), 1);
  assert.equal(frameLabel(4, null), 5);
});
