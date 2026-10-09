// ════════════════════════════════════════════════════════════════════
// CALC — Rechnen in Zahlenfeldern: „24 * 4“ statt im Kopf
// ════════════════════════════════════════════════════════════════════
// Für die Felder mit Sprite-Größen (Neuer Sprite, Größe ändern, Leinwand).
// Erlaubt sind Zahlen (auch mit Komma), + − * / und Klammern; x und × gelten
// als Mal ("24x4"), : als geteilt. Ein kleiner eigener Rechner statt eval —
// es wird nie Code ausgeführt.
//
// Reine Rechnung ohne DOM — läuft unter Node (tests/calc.test.js).
// Die Desktop-Version rechnet genauso (spritebit-rs, calc.rs).

/**
 * Ausdruck ausrechnen.
 * @param {string} text
 * @returns {number|null} null = kein gültiger Ausdruck (oder durch 0 geteilt)
 */
export function evalCalc(text) {
  const src = String(text ?? '').replace(/,/g, '.').replace(/[x×]/gi, '*').replace(/:/g, '/').replace(/−/g, '-');
  let i = 0;
  const peek = () => { while (src[i] === ' ' || src[i] === '\t') i++; return src[i]; };

  function number() {
    peek();
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i));
    if (!m) throw new Error('Zahl erwartet');
    i += m[0].length;
    return Number(m[0]);
  }
  function factor() {
    const c = peek();
    if (c === '-') { i++; return -factor(); }
    if (c === '+') { i++; return factor(); }
    if (c === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error(') fehlt');
      i++;
      return v;
    }
    return number();
  }
  function term() {
    let v = factor();
    for (;;) {
      const c = peek();
      if (c === '*') { i++; v *= factor(); } else if (c === '/') { i++; v /= factor(); } else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      const c = peek();
      if (c === '+') { i++; v += term(); } else if (c === '-') { i++; v -= term(); } else return v;
    }
  }

  try {
    if (!src.trim()) return null;
    const v = expr();
    if (peek() !== undefined) return null; // Rest, den keiner versteht
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Inhalt eines Eingabefelds als ganze Zahl — und das Ergebnis gleich ins
 * Feld schreiben, damit man sieht, was gerechnet wurde. NaN = ungültig.
 * @param {HTMLInputElement} inp
 */
export function calcInput(inp) {
  const v = evalCalc(inp.value);
  if (v === null) return NaN;
  const n = Math.round(v);
  inp.value = String(n);
  return n;
}
