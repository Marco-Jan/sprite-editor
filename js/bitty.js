// ════════════════════════════════════════════════════════════════════
// BITTY — das Maskottchen: ein kleiner Schleim aus 16 × 16 Pixeln
// ════════════════════════════════════════════════════════════════════
// Klassisches Skript ohne Module, damit Startseite (landing-demo.js) und
// Editor (helper.js) dieselbe Figur benutzen. Legt window.Bitty an.
//
// Bitty steht nicht still: er atmet (Stand ↔ zusammengesackt), blinzelt
// ab und zu und hüpft, wenn er etwas zu sagen hat. Bei „Bewegung
// reduzieren“ bleibt er im Stand. Im versteckten Tab ruht er.
(function () {
  'use strict';

  // Nummer → Rolle: 1 Kontur · 2 Schatten · 3 Grund · 4 Licht · 5 Glanz
  var PALETTE = ['#14213d', '#2d4870', '#6ea8fe', '#a9d1ff', '#f2f8ff'];
  var _ = '................';

  var IDLE = [
    _,
    _,
    '.....111111.....',
    '...1133333311...',
    '..133333333331..',
    '..134433333331..',
    '.13455433333331.',
    '.13344333333331.',
    '.13331331333331.',
    '.13331331333331.',
    '.13333333333331.',
    '.12333333333321.',
    '.12223333332221.',
    '..122222222221..',
    '...1111111111...',
    _,
  ];
  // ausgeatmet: eine Zeile flacher, der Boden bleibt, wo er ist
  var SQUISH = [_].concat(IDLE.slice(0, 10), IDLE.slice(11));
  var FRAMES = {
    idle: IDLE,
    squish: SQUISH,
    // dösend: ausgeatmet und Augen halb zu (beim Schlafen im Wechsel mit „blink“)
    doze: SQUISH.slice(0, 9).concat(['.13333333333331.'], SQUISH.slice(10)),
    // Augen halb zu: die obere Augenzeile wird Körper
    blink: IDLE.slice(0, 8).concat(['.13333333333331.'], IDLE.slice(9)),
    // in der Luft: zwei Pixel höher
    hop: IDLE.slice(2).concat([_, _]),
  };

  var still = false;
  try { still = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* alt */ }

  /** Ein Frame auf eine 16×16-Leinwand malen (CSS skaliert sie hoch). */
  function draw(canvas, name, palette) {
    var rows = FRAMES[name] || IDLE;
    var pal = palette || PALETTE;
    var n = rows.length;
    if (canvas.width !== n) { canvas.width = n; canvas.height = n; }
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, n, n);
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var c = rows[y].charAt(x);
      if (c === '.') continue;
      ctx.fillStyle = pal[Number(c) - 1];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  /**
   * Bitty auf einer Leinwand zum Leben erwecken.
   * @param {HTMLCanvasElement} canvas
   * @param {{ palette?: string[] }} [opts]
   */
  function mount(canvas, opts) {
    var palette = (opts && opts.palette) || PALETTE;
    var timer = 0, blinkAt = 0, busy = false, up = true, stopped = false, asleep = false;

    function show(name) { draw(canvas, name, palette); }

    // Atmen: Stand und ausgeatmet im Wechsel, dazwischen mal ein Blinzeln.
    function tick() {
      if (stopped) return;
      if (busy || document.hidden) { timer = window.setTimeout(tick, 400); return; }
      // Schlafen: Augen zu, langsam atmen, kein Blinzeln.
      if (asleep) {
        up = !up;
        show(up ? 'blink' : 'doze');
        timer = window.setTimeout(tick, 1600);
        return;
      }
      var now = Date.now();
      if (now >= blinkAt) {
        blinkAt = now + 2500 + Math.random() * 3500;
        show('blink');
        timer = window.setTimeout(tick, 140);
        return;
      }
      up = !up;
      show(up ? 'idle' : 'squish');
      timer = window.setTimeout(tick, up ? 900 : 600);
    }

    // Abfolge abspielen: [[frame, ms], …], danach weiter atmen.
    function play(seq) {
      if (still || stopped) return;
      busy = true;
      var i = 0;
      (function step() {
        if (stopped) return;
        if (i >= seq.length) { busy = false; up = true; show('idle'); return; }
        show(seq[i][0]);
        window.setTimeout(step, seq[i][1]);
        i++;
      })();
    }

    show('idle');
    if (!still) { blinkAt = Date.now() + 1500; timer = window.setTimeout(tick, 900); }

    return {
      hop: function () { play([['squish', 90], ['hop', 170], ['squish', 90], ['idle', 120], ['hop', 140], ['idle', 0]]); },
      setPalette: function (p) { palette = p || PALETTE; if (!busy) show(up ? 'idle' : 'squish'); },
      // Einschlafen bzw. aufwachen. Bei „Bewegung reduzieren“ nur die Augen.
      sleep: function (on) {
        if (asleep === !!on) return;
        asleep = !!on;
        if (still) { show(asleep ? 'blink' : 'idle'); return; }
        if (!asleep) this.hop();
      },
      isAsleep: function () { return asleep; },
      stop: function () { stopped = true; window.clearTimeout(timer); },
    };
  }

  window.Bitty = { PALETTE: PALETTE, FRAMES: FRAMES, draw: draw, mount: mount };
})();
