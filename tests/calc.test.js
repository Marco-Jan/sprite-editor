// Tests für das Rechnen in Zahlenfeldern (js/calc.js).
//
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalCalc } from '../js/calc.js';

test('Zahlen und die vier Grundrechenarten', () => {
  assert.equal(evalCalc('24'), 24);
  assert.equal(evalCalc('24 * 4'), 96);
  assert.equal(evalCalc('64 / 2'), 32);
  assert.equal(evalCalc('16 + 8'), 24);
  assert.equal(evalCalc('100 - 36'), 64);
});

test('Punkt vor Strich, Klammern, Vorzeichen', () => {
  assert.equal(evalCalc('2 + 3 * 4'), 14);
  assert.equal(evalCalc('(2 + 3) * 4'), 20);
  assert.equal(evalCalc('-4 + 10'), 6);
  assert.equal(evalCalc('2 * -3'), -6);
});

test('x und × als Mal, : als geteilt, Komma als Dezimalzeichen', () => {
  assert.equal(evalCalc('24x4'), 96);
  assert.equal(evalCalc('24 × 4'), 96);
  assert.equal(evalCalc('96 : 4'), 24);
  assert.equal(evalCalc('1,5 * 16'), 24);
});

test('Unsinn und Division durch 0 ergeben null — es wird nie Code ausgeführt', () => {
  assert.equal(evalCalc(''), null);
  assert.equal(evalCalc('abc'), null);
  assert.equal(evalCalc('2 +'), null);
  assert.equal(evalCalc('(2 + 3'), null);
  assert.equal(evalCalc('4 / 0'), null);
  assert.equal(evalCalc('alert(1)'), null);
  assert.equal(evalCalc('24 * 4 ; 1'), null);
});
