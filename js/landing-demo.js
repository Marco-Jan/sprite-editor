// ════════════════════════════════════════════════════════════════════
// LANDING-DEMO — das kleine Raster zum Ausprobieren auf der Startseite
// ════════════════════════════════════════════════════════════════════
// Abschnitt 01: Farbe wählen, klicken oder ziehen (Rechtsklick radiert).
// Abschnitt 02: dasselbe Bild mit einer anderen Palette — wie im Editor
// merkt sich das Bild nur die Nummern, die Palette macht die Farben.
// Klassisches Skript ohne Module, wie landing-i18n.js. Speichert nichts —
// „Im Editor weitermalen“ trägt das Bild im Link mit (siehe syncCta).
(function () {
  'use strict';
  var N = 16;
  var board = /** @type {HTMLCanvasElement|null} */ (document.getElementById('try-canvas'));
  var preview = /** @type {HTMLCanvasElement|null} */ (document.getElementById('try-preview'));
  if (!board || !preview) return;

  // Nummer → Rolle: 1 Kontur · 2 Schatten · 3 Grund · 4 Licht · 5 Glanz
  var PALETTES = {
    wald:  ['#1b2a1e', '#2f5a33', '#5d9642', '#9cc75a', '#e8f5b0'],
    abend: ['#24142e', '#6b3f6a', '#c26b56', '#f0a35e', '#ffe1a8'],
    eis:   ['#14213d', '#2d4870', '#6ea8fe', '#a9d1ff', '#f2f8ff'],
    grau:  ['#141414', '#4a4a4a', '#8a8a8a', '#c4c4c4', '#ffffff'],
  };
  var pal = 'eis';

  // Beispiel: Bitty, das Maskottchen (js/bitty.js) — Kontur, Schatten, Licht, Augen.
  var SAMPLE = window.Bitty ? window.Bitty.FRAMES.idle : [];
  var cells = new Uint8Array(N * N);
  function loadSample() {
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var c = SAMPLE[y] ? SAMPLE[y].charAt(x) : '.';
      cells[y * N + x] = c === '.' ? 0 : Number(c);
    }
  }
  loadSample();

  var color = 3, erasing = false;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function drawGrid(cv, cell, lines) {
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var size = N * cell;
    cv.width = size; cv.height = size;
    // Schachbrett = transparent
    var a = css('--surface-3') || '#1d2c4a', b = css('--surface-4') || '#283a5c';
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var v = cells[y * N + x];
      ctx.fillStyle = v ? PALETTES[pal][v - 1] : ((x + y) % 2 ? a : b);
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
    if (lines) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 1; i < N; i++) {
        ctx.moveTo(i * cell + 0.5, 0); ctx.lineTo(i * cell + 0.5, size);
        ctx.moveTo(0, i * cell + 0.5); ctx.lineTo(size, i * cell + 0.5);
      }
      ctx.stroke();
    }
  }

  function render() {
    drawGrid(board, 24, true);
    drawGrid(preview, 12, false);
    syncSwatches();
    syncCta();
  }

  // ── Farben (Abschnitt 01) ──
  var swBox = document.getElementById('try-swatches');
  var swatches = [];
  if (swBox) {
    for (var i = 1; i <= 5; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'try-sw';
      b.dataset.c = String(i);
      b.setAttribute('aria-label', String(i));
      b.addEventListener('click', function (e) {
        color = Number(/** @type {HTMLElement} */ (e.currentTarget).dataset.c);
        setErase(false);
        syncSwatches();
      });
      swBox.appendChild(b);
      swatches.push(b);
    }
  }
  function syncSwatches() {
    for (var i = 0; i < swatches.length; i++) {
      swatches[i].style.background = PALETTES[pal][i];
      swatches[i].setAttribute('aria-pressed', String(!erasing && color === i + 1));
    }
  }

  var eraseBtn = document.getElementById('try-erase');
  function setErase(on) {
    erasing = on;
    if (eraseBtn) eraseBtn.setAttribute('aria-pressed', String(on));
    syncSwatches();
  }
  if (eraseBtn) eraseBtn.addEventListener('click', function () { setErase(!erasing); });
  var clearBtn = document.getElementById('try-clear');
  if (clearBtn) clearBtn.addEventListener('click', function () { cells.fill(0); render(); });
  var sampleBtn = document.getElementById('try-sample');
  if (sampleBtn) sampleBtn.addEventListener('click', function () { loadSample(); render(); });

  // ── Malen ──
  var down = false, rightBtn = false, last = -1;
  function cellAt(e) {
    var r = board.getBoundingClientRect();
    var x = Math.floor(((e.clientX - r.left) / r.width) * N);
    var y = Math.floor(((e.clientY - r.top) / r.height) * N);
    return x < 0 || y < 0 || x >= N || y >= N ? -1 : y * N + x;
  }
  function paint(e) {
    var i = cellAt(e);
    if (i < 0 || i === last) return;
    last = i;
    cells[i] = erasing || rightBtn ? 0 : color;
    render();
  }
  board.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    down = true; rightBtn = e.button === 2; last = -1;
    try { board.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
    paint(e);
  });
  board.addEventListener('pointermove', function (e) { if (down) paint(e); });
  var up = function () { down = false; last = -1; };
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', up);
  board.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ── Paletten (Abschnitt 02) ──
  var palBtns = document.querySelectorAll('.pal-btn');
  for (var p = 0; p < palBtns.length; p++) {
    var btn = /** @type {HTMLElement} */ (palBtns[p]);
    var chips = btn.querySelector('.pal-chips');
    var colors = PALETTES[btn.dataset.pal || ''] || [];
    if (chips) for (var k = 0; k < colors.length; k++) {
      var c = document.createElement('i');
      c.style.background = colors[k];
      chips.appendChild(c);
    }
    btn.addEventListener('click', function (e) {
      pal = /** @type {HTMLElement} */ (e.currentTarget).dataset.pal || pal;
      syncPal();
      render();
      if (bitty) { bitty.setPalette(PALETTES[pal]); bitty.hop(); }
    });
  }
  function syncPal() {
    for (var i = 0; i < palBtns.length; i++) {
      palBtns[i].setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (palBtns[i]).dataset.pal === pal));
    }
  }

  // ── „Im Editor weitermalen“ nimmt das Bild mit ──
  // Im Hash, nicht im Speicher: editor.html#start=eis.14213d,…,f2f8ff.0011…
  // (Palettenname, ihre 5 Farben, dann 16×16 Ziffern 0–5 Zeile für Zeile).
  // Der Editor legt daraus einen Sprite an (app.js, takeStartDrawing).
  var cta = /** @type {HTMLAnchorElement|null} */ (document.querySelector('#malen a[href^="editor.html"]'));
  function syncCta() {
    if (!cta) return;
    var empty = true;
    for (var i = 0; i < cells.length; i++) if (cells[i]) { empty = false; break; }
    cta.href = empty ? 'editor.html' : 'editor.html#start=' + pal + '.' +
      PALETTES[pal].join(',').replace(/#/g, '') + '.' + Array.prototype.join.call(cells, '');
  }

  // ── Bitty neben dem Raster: trägt die gewählte Palette, hüpft bei Klick ──
  var bittyEl = /** @type {HTMLCanvasElement|null} */ (document.getElementById('bitty-hi'));
  var bitty = bittyEl && window.Bitty ? window.Bitty.mount(bittyEl, { palette: PALETTES[pal] }) : null;
  if (bitty) bittyEl.addEventListener('click', function () { bitty.hop(); });

  syncPal();
  render();
})();
