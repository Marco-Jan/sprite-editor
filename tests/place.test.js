// Tests für js/place.js — das Platz-Modell hinter Panels und Leisten.
//
// Hier stehen die Fälle, die in der Oberfläche schon einmal schiefgegangen
// sind. Sie liefen bisher nur über „von Hand im Browser nachklicken", und
// genau deshalb sind sie zurückgekommen.
//
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dock, pinned, zone, float,
  isPinned, sideOf, same, togglePin, toggleFloat, dropTarget,
  nearerSide, fromJSON, forMobile,
} from '../js/place.js';

// Rechtecke wie im Editor: zwei Spalten links und rechts, Bühne dazwischen.
const RECTS = {
  railLeft:  { left: 0,    right: 48,   top: 0, bottom: 800 },
  railRight: { left: 1200, right: 1248, top: 0, bottom: 800 },
  body:      { left: 48,   right: 1200, top: 100, bottom: 760 },
  zoneTop:   { top: 100,   bottom: 140 },
  zoneBottom:{ top: 700,   bottom: 760 },
  zoneLeftW: 0,
  zoneRightW: 0,
};

// ── Grundbegriffe ───────────────────────────────────────────────────
test('„angepinnt" heißt für Panel und Leiste dasselbe', () => {
  assert.equal(isPinned(pinned('left')), true);
  assert.equal(isPinned(zone('right')), true);    // Leiste seitlich = angepinnt
  assert.equal(isPinned(zone('top')), false);     // oben angedockt ist nicht angepinnt
  assert.equal(isPinned(dock('left')), false);
  assert.equal(isPinned(float({ x: 0, y: 0, w: 1, h: 1 })), false);
});

test('sideOf liefert die Seite, wo die Frage passt', () => {
  assert.equal(sideOf(dock('right')), 'right');
  assert.equal(sideOf(pinned('left')), 'left');
  assert.equal(sideOf(zone('right')), 'right');
  assert.equal(sideOf(zone('top')), null);
  assert.equal(sideOf(float({ x: 0, y: 0, w: 1, h: 1 })), null);
});

// ── Der Fehler, der diese Tests ausgelöst hat ───────────────────────
test('ein Panel aus der rechten Spalte pinnt rechts an, nicht links', () => {
  const p = togglePin(dock('right'), { kind: 'panel' });
  assert.deepEqual(p, pinned('right'));
});

test('rechts angepinnt → lösen → wieder rechts ins Dock', () => {
  const origin = dock('right');
  const p = togglePin(pinned('right'), { kind: 'panel', origin });
  assert.deepEqual(p, dock('right'));
});

test('eine Leiste aus dem Dock geht beim Lösen ins Dock zurück, nicht nach oben', () => {
  const origin = dock('left');
  const p = togglePin(zone('left'), { kind: 'bar', origin, home: zone('top') });
  assert.deepEqual(p, dock('left'));
});

test('eine Leiste von oben geht beim Lösen nach oben zurück', () => {
  const origin = zone('top');
  const p = togglePin(zone('right'), { kind: 'bar', origin, home: zone('bottom') });
  assert.deepEqual(p, zone('top'));
});

test('beim Lösen gewinnt die Seite, auf der es gerade steht', () => {
  // Rechts angepinnt, dann nach links gezogen: Lösen führt ins linke Dock,
  // nicht zurück nach rechts.
  const p = togglePin(pinned('left'), { kind: 'panel', origin: dock('right') });
  assert.deepEqual(p, dock('left'));
});

test('ohne bekannten Ursprung gilt der angestammte Platz', () => {
  assert.deepEqual(togglePin(zone('left'), { kind: 'bar', home: zone('bottom') }), zone('bottom'));
  assert.deepEqual(togglePin(pinned('left'), { kind: 'panel', home: dock('left') }), dock('left'));
});

test('ein angepinnter Ursprung wird nicht als Rückweg genommen', () => {
  // Sonst bliebe der Pin wirkungslos: angepinnt → „zurück" → wieder angepinnt.
  const p = togglePin(pinned('left'), { kind: 'panel', origin: pinned('left'), home: dock('left') });
  assert.deepEqual(p, dock('left'));
});

// ── Anpinnen aus dem Schweben ───────────────────────────────────────
test('ein schwebendes Fenster pinnt an der näheren Hälfte an', () => {
  const f = float({ x: 900, y: 50, w: 300, h: 400 });
  assert.deepEqual(togglePin(f, { kind: 'panel', nearSide: 'right' }), pinned('right'));
  assert.deepEqual(togglePin(f, { kind: 'bar', nearSide: 'left' }), zone('left'));
});

test('nearerSide entscheidet nach der Mitte der Bühne', () => {
  assert.equal(nearerSide(100, 0, 1000), 'left');
  assert.equal(nearerSide(900, 0, 1000), 'right');
});

// ── Lösen ───────────────────────────────────────────────────────────
test('Lösen und wieder andocken führt zum Ursprung zurück', () => {
  const geom = { x: 10, y: 20, w: 300, h: 200 };
  const f = toggleFloat(zone('top'), { geom });
  assert.equal(f.kind, 'float');
  assert.deepEqual(f.geom, geom);
  assert.deepEqual(toggleFloat(f, { origin: zone('top') }), zone('top'));
});

test('schwebender Ursprung wird beim Andocken übergangen', () => {
  const f = float({ x: 0, y: 0, w: 10, h: 10 });
  assert.deepEqual(toggleFloat(f, { origin: f, home: dock('left') }), dock('left'));
});

// ── Ziehen und Loslassen ────────────────────────────────────────────
test('über der linken Spalte landet alles in deren Dock', () => {
  assert.deepEqual(dropTarget({ kind: 'panel', x: 20, y: 300, rects: RECTS }), dock('left'));
  assert.deepEqual(dropTarget({ kind: 'bar', x: 20, y: 300, rects: RECTS }), dock('left'));
});

test('ein angepinntes Panel bleibt angepinnt, wenn man es an die Spalte zieht', () => {
  const p = dropTarget({ kind: 'panel', x: 1230, y: 300, rects: RECTS, wasPinned: true });
  assert.deepEqual(p, pinned('right'));
});

test('ein nicht angepinntes Panel wird zur Schublade', () => {
  const p = dropTarget({ kind: 'panel', x: 1230, y: 300, rects: RECTS, wasPinned: false });
  assert.deepEqual(p, dock('right'));
});

test('mitten über der Zeichenfläche gehört ein Panel nirgendwohin', () => {
  assert.equal(dropTarget({ kind: 'panel', x: 600, y: 400, rects: RECTS }), null);
});

test('Leisten finden die vier Zonen um die Zeichenfläche', () => {
  assert.deepEqual(dropTarget({ kind: 'bar', x: 600, y: 120, rects: RECTS }), zone('top'));
  assert.deepEqual(dropTarget({ kind: 'bar', x: 600, y: 740, rects: RECTS }), zone('bottom'));
  assert.deepEqual(dropTarget({ kind: 'bar', x: 70,  y: 400, rects: RECTS }), zone('left'));
  assert.deepEqual(dropTarget({ kind: 'bar', x: 1180, y: 400, rects: RECTS }), zone('right'));
  assert.equal(dropTarget({ kind: 'bar', x: 600, y: 400, rects: RECTS }), null);
});

// ── Gespeicherte Anordnung ──────────────────────────────────────────
test('kaputt gespeicherte Plätze werden verworfen statt angewendet', () => {
  for (const bad of [null, undefined, 42, 'links', {}, { kind: 'nirgends' }, { kind: 'dock' },
                     { kind: 'dock', side: 'oben' }, { kind: 'zone', zone: 'schräg' }]) {
    assert.equal(fromJSON(bad, 'panel'), null, `${JSON.stringify(bad)} sollte verworfen werden`);
  }
});

test('Plätze, die es für diese Art nicht gibt, werden verworfen', () => {
  assert.equal(fromJSON({ kind: 'zone', zone: 'top' }, 'panel'), null);   // Panels haben keine Zonen
  assert.equal(fromJSON({ kind: 'pinned', side: 'left' }, 'bar'), null);  // Leisten keine Pin-Spalte
  assert.deepEqual(fromJSON({ kind: 'zone', zone: 'top' }, 'bar'), zone('top'));
  assert.deepEqual(fromJSON({ kind: 'pinned', side: 'left' }, 'panel'), pinned('left'));
});

test('ein schwebender Platz übersteht unsinnige Zahlen', () => {
  const p = fromJSON({ kind: 'float', geom: { x: 'viel', y: null, w: 300, h: 200 } }, 'panel');
  assert.deepEqual(p, float({ x: 0, y: 0, w: 300, h: 200 }));
});

// ── Handy ───────────────────────────────────────────────────────────
test('am Handy gibt es nur Dock und die Leiste unten', () => {
  assert.deepEqual(forMobile(pinned('left'), 'panel'), dock('left'));
  assert.deepEqual(forMobile(float({ x: 0, y: 0, w: 1, h: 1 }), 'panel', { side: 'right' }), dock('right'));
  assert.deepEqual(forMobile(zone('top'), 'bar'), zone('bottom'));
  assert.deepEqual(forMobile(zone('top'), 'bar', { pinnedBelow: false, side: 'left' }), dock('left'));
});

// ── Vergleich ───────────────────────────────────────────────────────
test('same vergleicht den Platz, nicht die Fensterposition', () => {
  assert.equal(same(dock('left'), dock('left')), true);
  assert.equal(same(dock('left'), dock('right')), false);
  assert.equal(same(zone('top'), zone('top')), true);
  assert.equal(same(float({ x: 0, y: 0, w: 1, h: 1 }), float({ x: 99, y: 99, w: 1, h: 1 })), true);
  assert.equal(same(pinned('left'), dock('left')), false);
});

test('ohne jeden Hinweis pinnt eine Leiste links an', () => {
  // Eine Leiste von oben hat keine Seite, und die nähere Hälfte zählt nur
  // fürs schwebende Fenster — dann ist links der ruhige Vorschlag.
  assert.deepEqual(togglePin(zone('top'), { kind: 'bar' }), zone('left'));
  assert.deepEqual(togglePin(zone('top'), { kind: 'bar', lastSide: 'right' }), zone('right'));
});
