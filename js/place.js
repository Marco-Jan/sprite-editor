// ════════════════════════════════════════════════════════════════════
// PLACE — wo ein Panel oder eine Leiste sitzt, als EIN Wert
// ════════════════════════════════════════════════════════════════════
// Dieses Modul kennt kein DOM. Es beantwortet nur Fragen über Plätze:
// wohin fällt etwas, wenn man es hier loslässt; wo landet es, wenn man den
// Pin drückt; was ist noch ein gültiger gespeicherter Platz.
//
// Warum eigenes Modul: vorher stand „auf welcher Seite sitzt das?" an vier
// Stellen gleichzeitig — im DOM (`dataset.side`), im gespeicherten Zustand,
// in einer Tabelle `homeSide` und im Aufrufargument. Zwei Codepfade lasen sie
// in unterschiedlicher Reihenfolge, und genau dort entstand der Fehler
// „rechts angepinnt, links gelandet". Jetzt gibt es einen Wert, und nur
// layout.js zeichnet ihn ins DOM — gelesen wird er dort nie wieder.
//
// Ein Platz ist immer genau eine dieser vier Formen:
//
//   { kind: 'dock',   side }   Icon im Dock, öffnet sich als Schublade
//   { kind: 'pinned', side }   feste Spalte neben der Zeichenfläche
//   { kind: 'zone',   zone }   Leisten-Zone rund um die Zeichenfläche
//   { kind: 'float',  geom }   schwebendes Fenster
//
// Panels benutzen dock/pinned/float, Leisten dock/zone/float. „Seitlich
// angepinnt" heißt beim Panel `pinned`, bei der Leiste `zone` links/rechts —
// für den Nutzer ist es dasselbe, darum beantwortet `isPinned()` beides.

/**
 * @typedef {'left'|'right'} Side
 * @typedef {'top'|'bottom'|'left'|'right'} Zone
 * @typedef {{x:number, y:number, w:number, h:number}} Geom
 * @typedef {{kind:'dock', side:Side}} DockPlace
 * @typedef {{kind:'pinned', side:Side}} PinnedPlace
 * @typedef {{kind:'zone', zone:Zone}} ZonePlace
 * @typedef {{kind:'float', geom:Geom}} FloatPlace
 * @typedef {DockPlace|PinnedPlace|ZonePlace|FloatPlace} Place
 * @typedef {'panel'|'bar'} Kind
 */

export const SIDES = ['left', 'right'];
export const ZONES = ['top', 'bottom', 'left', 'right'];

// Wie weit neben einer Seitenleiste ein Drop noch zu ihr zählt, und wie nah
// am Rand der Zeichenfläche eine Leiste andockt.
//
// Panels greifen weit (40 px): neben der Spalte gibt es für sie nichts
// anderes. Leisten greifen nur knapp (4 px), weil direkt daneben ihre
// Seiten-Zone beginnt — mit 40 px käme man dort nie hin.
export const SIDE_REACH = 40;
export const BAR_SIDE_REACH = 4;
export const ZONE_REACH = 44;

const isSide = v => SIDES.includes(v);
const isZone = v => ZONES.includes(v);

// ── Bauen ───────────────────────────────────────────────────────────
// Immer über diese vier Funktionen — sie sind die einzige Stelle, an der ein
// Platz entsteht, und prüfen dabei gleich, dass Seite und Zone es auch gibt.
/** @param {any} side @returns {DockPlace} */
export const dock = side => ({ kind: 'dock', side: isSide(side) ? side : 'right' });
/** @param {any} side @returns {PinnedPlace} */
export const pinned = side => ({ kind: 'pinned', side: isSide(side) ? side : 'right' });
/** @param {any} z @returns {ZonePlace} */
export const zone = z => ({ kind: 'zone', zone: isZone(z) ? z : 'top' });
/** @param {any} geom @returns {FloatPlace} */
export const float = geom => ({ kind: 'float', geom: { ...geom } });

// ── Fragen ──────────────────────────────────────────────────────────
export const isFloat = p => p?.kind === 'float';

// „Seitlich angepinnt" aus Sicht des Nutzers: beim Panel die feste Spalte,
// bei der Leiste die linke oder rechte Zone. Dieselbe Geste, dasselbe Gefühl.
export const isPinned = p =>
  p?.kind === 'pinned' || (p?.kind === 'zone' && (p.zone === 'left' || p.zone === 'right'));

// Auf welcher Seite sitzt der Platz? null, wenn die Frage nicht passt
// (oben/unten angedockt oder schwebend).
export function sideOf(p) {
  if (p?.kind === 'dock' || p?.kind === 'pinned') return p.side;
  if (p?.kind === 'zone' && isSide(p.zone)) return p.zone;
  return null;
}

// Zwei Plätze gleich? (Geometrie zählt beim Schweben nicht mit — ein
// verschobenes Fenster schwebt immer noch.)
export function same(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'zone') return a.zone === b.zone;
  if (a.kind === 'float') return true;
  return a.side === b.side;
}

// ── Übergänge ───────────────────────────────────────────────────────
// Alle Knöpfe und Gesten gehen durch diese drei Funktionen. Dadurch gilt
// für Panel und Leiste dieselbe Regel; früher hatte jedes seine eigene.

/**
 * Pin drücken.
 * @param {Place} place   wo es gerade sitzt
 * @param {object} [ctx]
 * @param {Kind}   [ctx.kind]    'panel' | 'bar' (Standard: 'panel')
 * @param {Place}  [ctx.origin]  wo es vor dem Anpinnen saß — dorthin zurück
 * @param {Place}  [ctx.home]    Rückfall, wenn kein Ursprung bekannt ist
 * @param {Side}   [ctx.nearSide] nähere Hälfte (zählt nur beim Schweben)
 * @param {Side}   [ctx.lastSide] zuletzt benutzte Seite
 * @returns {Place}
 */
export function togglePin(place, { kind = 'panel', origin, home, nearSide, lastSide } = {}) {
  // Schon angepinnt → zurück, woher es kam. Ohne bekannten Ursprung an den
  // angestammten Platz (Panel: ins Dock, Leiste: oben bzw. unten).
  if (isPinned(place)) {
    const back = origin && !isPinned(origin) ? origin : home;
    const target = back ? clone(back) : dock(sideOf(place) || 'right');
    // Die Seite, auf der es gerade steht, gewinnt: gelöst wird dort, wo man
    // es sieht. Zurück geht nur die Art des Platzes, nicht die Seite — sonst
    // springt ein nach links gezogenes Panel beim Lösen wieder nach rechts.
    const side = sideOf(place);
    if (side && (target.kind === 'dock' || target.kind === 'pinned')) target.side = side;
    return target;
  }
  // Sonst anpinnen. Beim Schweben entscheidet die nähere Hälfte, sonst die
  // Seite, auf der es ohnehin schon liegt.
  const side = (isFloat(place) ? nearSide : sideOf(place)) || lastSide || nearSide || 'left';
  return kind === 'bar' ? zone(side) : pinned(side);
}

/**
 * Lösen-Knopf: schwebend machen, und aus dem Schweben zurück zum Ursprung.
 * @param {Place} place
 * @param {object} ctx
 * @param {Geom}  [ctx.geom]    Geometrie fürs Fenster
 * @param {Place} [ctx.origin]  wo es vor dem Lösen saß
 * @param {Place} [ctx.home]
 * @returns {Place}
 */
export function toggleFloat(place, { geom, origin, home } = {}) {
  if (isFloat(place)) {
    const back = origin && !isFloat(origin) ? origin : home;
    return back ? clone(back) : dock('right');
  }
  return float(geom || { x: 80, y: 60, w: 320, h: 420 });
}

/**
 * Wohin fällt etwas, das bei (x, y) losgelassen wird?
 *
 * Reine Geometrie — die Rechtecke kommen von außen, damit diese Funktion
 * ohne Browser prüfbar bleibt.
 *
 * @param {object} opts
 * @param {Kind}   opts.kind
 * @param {number} opts.x
 * @param {number} opts.y
 * @param {{railLeft:DOMRectLike, railRight:DOMRectLike, body:DOMRectLike,
 *          zoneTop?:DOMRectLike|null, zoneBottom?:DOMRectLike|null,
 *          zoneLeftW?:number, zoneRightW?:number}} opts.rects
 * @param {boolean} [opts.wasPinned]  ein angepinntes Panel bleibt angepinnt
 * @returns {Place|null}   null = da gehört es nirgendwo hin (bleibt schwebend)
 *
 * @typedef {{left:number, right:number, top:number, bottom:number}} DOMRectLike
 */
export function dropTarget({ kind, x, y, rects, wasPinned = false }) {
  const { railLeft, railRight } = rects;

  // Über einer Seitenleiste (plus Griffweite daneben): dorthin.
  const reach = kind === 'bar' ? BAR_SIDE_REACH : SIDE_REACH;
  const side = x < railLeft.right + reach ? 'left'
    : x > railRight.left - reach ? 'right'
    : null;
  if (side) {
    if (kind === 'panel') return wasPinned ? pinned(side) : dock(side);
    return dock(side);
  }
  if (kind === 'panel') return null;   // Panels docken nur an den Spalten an

  // Leisten: die vier Zonen rund um die Zeichenfläche.
  const { body } = rects;
  if (x < body.left || x > body.right) return null;
  const top = rects.zoneTop || { top: body.top, bottom: body.top };
  const bottom = rects.zoneBottom || { top: body.bottom, bottom: body.bottom };
  if (y >= top.top - 12 && y <= top.bottom + ZONE_REACH) return zone('top');
  if (y >= bottom.top - ZONE_REACH && y <= bottom.bottom + 40) return zone('bottom');
  if (y > body.top && y < body.bottom) {
    if (x < body.left + ZONE_REACH + (rects.zoneLeftW || 0)) return zone('left');
    if (x > body.right - ZONE_REACH - (rects.zoneRightW || 0)) return zone('right');
  }
  return null;
}

// Welche Hälfte der Zeichenfläche? Entscheidet, wohin ein schwebendes
// Fenster anpinnt.
export const nearerSide = (centerX, wsLeft, wsWidth) =>
  (centerX < wsLeft + wsWidth / 2 ? 'left' : 'right');

// ── Speichern und Lesen ─────────────────────────────────────────────
// Ein gespeicherter Platz kommt aus dem localStorage und ist damit fremder
// Text: eine kaputte oder veraltete Form darf die Oberfläche nicht lahmlegen,
// sondern fällt auf den angestammten Platz zurück.

/**
 * @param {unknown} raw
 * @param {Kind} kind
 * @returns {Place|null}
 */
export function fromJSON(raw, kind) {
  if (!raw || typeof raw !== 'object') return null;
  const r = /** @type {any} */ (raw);
  switch (r.kind) {
    case 'dock':   return isSide(r.side) ? dock(r.side) : null;
    case 'pinned': return kind === 'panel' && isSide(r.side) ? pinned(r.side) : null;
    case 'zone':   return kind === 'bar' && isZone(r.zone) ? zone(r.zone) : null;
    case 'float': {
      const g = r.geom;
      if (!g || typeof g !== 'object') return null;
      const n = v => (Number.isFinite(v) ? v : 0);
      return float({ x: n(g.x), y: n(g.y), w: n(g.w), h: n(g.h) });
    }
    default: return null;
  }
}

/** Platz → reiner Wert fürs Speichern. @param {Place} p @returns {Place} */
export const toJSON = p => clone(p);

/** @param {Place} p @returns {Place} */
const clone = p => (p.kind === 'float' ? float(p.geom) : { ...p });

// ── Handy ───────────────────────────────────────────────────────────
// Am schmalen Fenster gibt es weder Spalten noch schwebende Fenster. Statt
// die gespeicherte Anordnung zu überschreiben, rechnet diese Funktion sie
// für die Anzeige um — zurück am breiten Fenster steht alles wie vorher.
/**
 * @param {Place} place
 * @param {Kind} kind
 * @param {{pinnedBelow?:boolean, side?:Side}} [opts]
 * @returns {Place}
 */
export function forMobile(place, kind, { pinnedBelow = true, side } = {}) {
  if (kind === 'bar') return pinnedBelow ? zone('bottom') : dock(side || sideOf(place) || 'right');
  return dock(side || sideOf(place) || 'right');
}
