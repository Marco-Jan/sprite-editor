// Tests für das Einrasten mit Umschalt (js/lock.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapDir, project, snapEnd } from '../js/lock.js';

test('Richtung erst ab ein paar Pixeln', () => {
  assert.equal(snapDir(0, 0), null);
  assert.equal(snapDir(1, 1), null);
  assert.equal(snapDir(2, 1), null, 'erst ab 3 Pixeln — sonst rastet ein Wackler ein');
  assert.deepEqual(snapDir(5, 1), [1, 0], 'fast waagerecht → waagerecht');
  assert.deepEqual(snapDir(-1, -6), [0, -1], 'fast senkrecht nach oben');
  assert.deepEqual(snapDir(4, 5), [1, 1], 'schräg → 45°');
  assert.deepEqual(snapDir(-3, 3), [-1, 1]);
});

test('Punkte landen auf der eingerasteten Linie', () => {
  const s = { x: 10, y: 10 };
  assert.deepEqual(project(s, [1, 0], { x: 17, y: 13 }), { x: 17, y: 10 }, 'waagerecht: y bleibt');
  assert.deepEqual(project(s, [0, 1], { x: 12, y: 4 }), { x: 10, y: 4 }, 'senkrecht: x bleibt, auch rückwärts');
  assert.deepEqual(project(s, [1, 1], { x: 15, y: 13 }), { x: 14, y: 14 }, 'diagonal');
  assert.deepEqual(project(s, [1, -1], { x: 13, y: 7 }), { x: 13, y: 7 });
});

test('Linie mit Umschalt: Endpunkt rastet ein', () => {
  const s = { x: 0, y: 0 };
  assert.deepEqual(snapEnd(s, { x: 9, y: 2 }), { x: 9, y: 0 });
  assert.deepEqual(snapEnd(s, { x: 6, y: 7 }), { x: 7, y: 7 });
  assert.deepEqual(snapEnd(s, { x: 2, y: 1 }), { x: 2, y: 1 }, 'zu kurz: wie gezogen');
});
