// ════════════════════════════════════════════════════════════════════
// LANDING-DEMO — das kleine Raster zum Ausprobieren auf der Startseite
// ════════════════════════════════════════════════════════════════════
// Abschnitt 01: Farbe wählen, klicken oder ziehen (Rechtsklick radiert).
// Abschnitt 02: aus einer Skizze (Beispiel oder eigenes Bild) wird
// Pixel-Art — Striche werden Kontur, geschlossene Flächen füllen sich.
// Die Paletten-Knöpfe dort färben beide Abschnitte (und Bitty) um.
// Klassisches Skript ohne Module, wie landing-i18n.js. Speichert nichts und
// lädt nichts hoch — „Im Editor weitermalen“ trägt das Bild im Link mit
// (siehe linkFor).
(function () {
  'use strict';
  var N = 16;
  var board = /** @type {HTMLCanvasElement|null} */ (document.getElementById('try-canvas'));
  if (!board) return;

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

  // ── Paletten (Abschnitt 02, gelten für beide) ──
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
      drawSketchOut();
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
  // (Palettenname, ihre 5 Farben, dann N×N Ziffern 0–5 Zeile für Zeile).
  // Der Editor legt daraus einen Sprite an (app.js, takeStartDrawing).
  function linkFor(px) {
    for (var i = 0; i < px.length; i++) {
      if (px[i]) return 'editor.html#start=' + pal + '.' + PALETTES[pal].join(',').replace(/#/g, '') + '.' + Array.prototype.join.call(px, '');
    }
    return 'editor.html';
  }
  var cta = /** @type {HTMLAnchorElement|null} */ (document.querySelector('#malen a[href^="editor.html"]'));
  function syncCta() {
    if (cta) cta.href = linkFor(cells);
  }

  // ── Skizze → Pixel-Art (Abschnitt 02) ──
  var srcCv = /** @type {HTMLCanvasElement|null} */ (document.getElementById('sketch-src'));
  var outCv = /** @type {HTMLCanvasElement|null} */ (document.getElementById('sketch-out'));
  var sketchCta = /** @type {HTMLAnchorElement|null} */ (document.getElementById('sketch-cta'));
  var PAPER = '#f4efe3';
  var size = 32;
  var source = /** @type {CanvasImageSource|null} */ (null);
  var srcW = 0, srcH = 0;
  var result = new Uint8Array(0);

  // Die Beispiel-Skizze: ein Pilz mit Punkten und Augen, mit Bleistift-
  // Zittern gezeichnet — Zufall mit festem Startwert, sieht immer gleich aus.
  function sampleSketch() {
    var W = 480, cv = document.createElement('canvas');
    cv.width = W; cv.height = W;
    var ctx = cv.getContext('2d');
    if (!ctx) return cv;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, W);
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }
    ctx.strokeStyle = 'rgba(52, 48, 44, 0.9)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Ein Strich zweimal, leicht versetzt — wie mit der Hand.
    function stroke(pts, w) {
      for (var pass = 0; pass < 2; pass++) {
        ctx.lineWidth = w + rnd() * 1.5;
        ctx.beginPath();
        for (var i = 0; i < pts.length; i++) {
          var x = pts[i][0] + rnd() * 3, y = pts[i][1] + rnd() * 3;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
    function arc(cx, cy, rx, ry, a0, a1) {
      var pts = [], n = 40;
      for (var i = 0; i <= n; i++) {
        var a = a0 + (a1 - a0) * i / n;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      }
      return pts;
    }
    stroke(arc(240, 236, 176, 150, Math.PI, 2 * Math.PI), 8);              // Hut oben
    stroke(arc(240, 226, 176, 26, 0, Math.PI), 8);                          // Hutrand
    stroke([[176, 250], [168, 330], [164, 404]], 8);                        // Stiel links
    stroke([[304, 250], [312, 330], [318, 404]], 8);                        // Stiel rechts
    stroke(arc(241, 404, 77, 18, 0, Math.PI), 8);                           // Stiel unten
    stroke(arc(170, 160, 30, 26, 0, 2 * Math.PI), 7);                       // Punkte
    stroke(arc(286, 124, 36, 30, 0, 2 * Math.PI), 7);
    stroke(arc(356, 196, 22, 20, 0, 2 * Math.PI), 7);
    ctx.fillStyle = 'rgba(52, 48, 44, 0.9)';
    [[214, 318], [268, 318]].forEach(function (e) {                         // Augen
      ctx.beginPath(); ctx.ellipse(e[0], e[1], 8, 12, 0, 0, 2 * Math.PI); ctx.fill();
    });
    return cv;
  }

  function setSource(img, w, h) {
    source = img; srcW = w; srcH = h;
    if (srcCv) {
      var ctx = srcCv.getContext('2d');
      if (ctx) {
        var S = srcCv.width;
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, S, S);
        var k = Math.min(S / w, S / h);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (S - w * k) / 2, (S - h * k) / 2, w * k, h * k);
      }
    }
    convert();
  }

  // Bild → size×size Nummern 0–5.
  // 1. Auf eine Arbeitsfläche, Helligkeit je Pixel; „Papier“ ist der helle,
  //    „Tinte“ der dunkle Rand der Verteilung.
  // 2. Auf den Bereich mit Tinte zuschneiden (quadratisch, etwas Rand).
  // 3. Je Zelle: wie viel davon Tinte ist. Viel → Kontur (1).
  // 4. Was vom Rand aus erreichbar ist, bleibt durchsichtig; eingeschlossene
  //    Flächen füllen sich (3), mit Licht oben links (4), Schatten unten
  //    rechts (2) und kleinen Inseln als Glanz (5).
  //    Ist fast alles Tinte (ein Foto statt einer Skizze), gibt es statt
  //    dessen fünf Helligkeitsstufen.
  function convert() {
    if (!source) return;
    var W = 256, work = document.createElement('canvas');
    work.width = W; work.height = W;
    var wc = work.getContext('2d', { willReadFrequently: true });
    if (!wc) return;
    wc.fillStyle = '#ffffff';
    wc.fillRect(0, 0, W, W);
    var k = Math.min(W / srcW, W / srcH);
    var dw = srcW * k, dh = srcH * k, ox = (W - dw) / 2, oy = (W - dh) / 2;
    wc.imageSmoothingQuality = 'high';
    wc.drawImage(source, ox, oy, dw, dh);
    var d = wc.getImageData(0, 0, W, W).data;
    var lum = new Float32Array(W * W), sorted = [];
    for (var i = 0; i < W * W; i++) {
      lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      var x0 = i % W, y0 = (i / W) | 0;
      if (x0 >= ox && x0 < ox + dw && y0 >= oy && y0 < oy + dh) sorted.push(lum[i]);
    }
    sorted.sort(function (a, b) { return a - b; });
    var paper = sorted[Math.floor(sorted.length * 0.9)] || 255;
    var inkL = sorted[Math.floor(sorted.length * 0.02)] || 0;
    var span = Math.max(24, paper - inkL);
    var cut = paper - span * 0.4;
    var minX = W, minY = W, maxX = -1, maxY = -1, inkN = 0;
    for (i = 0; i < W * W; i++) {
      if (lum[i] < cut) {
        inkN++;
        var x = i % W, y = (i / W) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    var photo = inkN > sorted.length * 0.45;
    if (maxX < 0 || photo) { minX = ox; minY = oy; maxX = ox + dw - 1; maxY = oy + dh - 1; }
    var side = Math.max(maxX - minX, maxY - minY) + 1;
    side = Math.min(W, Math.ceil(side * (photo ? 1 : 1.1)));
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var bx = cx - side / 2, by = cy - side / 2;
    var N = size, cell = side / N;
    // Innen oder außen? In voller Auflösung entscheiden — dort sind die
    // Striche durchgehend. Tinte um 2 px verdickt schließt kleine Lücken,
    // dann vom Rand aus über das Papier fluten.
    var fat = new Uint8Array(W * W), out = new Uint8Array(W * W), st = [];
    for (i = 0; i < W * W; i++) {
      if (lum[i] >= cut) continue;
      var ix = i % W, iy = (i / W) | 0;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        var qx = ix + dx, qy = iy + dy;
        if (qx >= 0 && qy >= 0 && qx < W && qy < W) fat[qy * W + qx] = 1;
      }
    }
    for (i = 0; i < W; i++) st.push(i, (W - 1) * W + i, i * W, i * W + W - 1);
    while (st.length) {
      var q = st.pop();
      if (out[q] || fat[q]) continue;
      out[q] = 1;
      var qx2 = q % W;
      if (qx2 > 0) st.push(q - 1);
      if (qx2 < W - 1) st.push(q + 1);
      if (q >= W) st.push(q - W);
      if (q < W * W - W) st.push(q + W);
    }
    var inside = new Uint8Array(N * N);
    var px = new Uint8Array(N * N);
    var line = new Uint8Array(N * N);
    var cover = new Float32Array(N * N);
    for (var gy = 0; gy < N; gy++) for (var gx = 0; gx < N; gx++) {
      var x1 = Math.floor(bx + gx * cell), x2 = Math.floor(bx + (gx + 1) * cell);
      var y1 = Math.floor(by + gy * cell), y2 = Math.floor(by + (gy + 1) * cell);
      var n = 0, ink = 0, sum = 0, inn = 0, onImg = 0;
      for (var yy = Math.max(0, y1); yy < Math.min(W, Math.max(y2, y1 + 1)); yy++) {
        for (var xx = Math.max(0, x1); xx < Math.min(W, Math.max(x2, x1 + 1)); xx++) {
          var l = lum[yy * W + xx];
          n++; sum += l;
          if (l < cut) ink++;
          if (!out[yy * W + xx]) inn++;
          if (xx >= ox && xx < ox + dw && yy >= oy && yy < oy + dh) onImg++;
        }
      }
      var j = gy * N + gx;
      inside[j] = n && inn / n > 0.5 ? 1 : 0;
      if (photo) {
        if (onImg * 2 < n) continue;                // Rand ums Foto: durchsichtig
        var t = n ? (sum / n - inkL) / span : 1;   // 0 dunkel … 1 hell
        px[j] = Math.max(1, Math.min(5, 1 + Math.floor(t * 5)));
      } else if (n) {
        cover[j] = ink / n;
      }
    }
    if (!photo) {
      // Kontur, wo ein Strich die Zelle gut füllt: gemessen an den am
      // dichtesten getroffenen Zellen — so bleibt die Linie bei 16 wie bei
      // 32 Pixeln etwa eine Zelle dick, egal wie breit der Stift war.
      var hits = [];
      for (j = 0; j < N * N; j++) if (cover[j] > 0.02) hits.push(cover[j]);
      hits.sort(function (a, b) { return a - b; });
      var peak = hits[Math.floor(hits.length * 0.9)] || 0;
      var need = Math.max(0.06, peak * 0.5);
      for (j = 0; j < N * N; j++) if (cover[j] >= need) { line[j] = 1; px[j] = 1; }
      fillInside(px, line, inside, N);
    }
    result = px;
    drawSketchOut();
  }

  // `inside`: Zellen innerhalb einer geschlossenen Kontur (convert).
  function fillInside(px, line, inside, N) {
    var outside = new Uint8Array(N * N), stack, i, j, x;
    for (i = 0; i < N * N; i++) outside[i] = inside[i] ? 0 : 1;
    // Kontur schließen: eine Innen-Zelle, die außen anstößt, wird Kontur —
    // sonst blitzen dort, wo die Linie zwischen zwei Zellen lag, Lücken auf.
    var edge = [];
    for (i = 0; i < N * N; i++) {
      if (outside[i] || line[i]) continue;
      x = i % N;
      if (x === 0 || x === N - 1 || i < N || i >= N * N - N ||
          (outside[i - 1] && !line[i - 1]) || (outside[i + 1] && !line[i + 1]) ||
          (outside[i - N] && !line[i - N]) || (outside[i + N] && !line[i + N])) edge.push(i);
    }
    for (i = 0; i < edge.length; i++) { line[edge[i]] = 1; px[edge[i]] = 1; }
    // Eingeschlossene Flächen einzeln — kleine werden Glanz.
    var region = new Int32Array(N * N).fill(-1), sizes = [], inner = 0;
    for (i = 0; i < N * N; i++) {
      if (outside[i] || line[i] || region[i] >= 0) continue;
      var id = sizes.length, count = 0;
      stack = [i];
      while (stack.length) {
        j = stack.pop();
        if (j < 0 || j >= N * N || outside[j] || line[j] || region[j] >= 0) continue;
        region[j] = id; count++;
        x = j % N;
        if (x > 0) stack.push(j - 1);
        if (x < N - 1) stack.push(j + 1);
        stack.push(j - N, j + N);
      }
      sizes.push(count);
      inner += count;
    }
    var isLine = function (j2, ok) { return ok && line[j2] === 1; };
    for (i = 0; i < N * N; i++) {
      if (region[i] < 0) continue;
      if (sizes[region[i]] < Math.max(2, inner * 0.06)) { px[i] = 5; continue; }
      x = i % N;
      var lit = isLine(i - N, i >= N) || isLine(i - 1, x > 0);
      var dark = isLine(i + N, i < N * N - N) || isLine(i + 1, x < N - 1);
      px[i] = lit && !dark ? 4 : dark && !lit ? 2 : 3;
    }
  }

  function drawSketchOut() {
    if (!outCv || !result.length) return;
    var N = size;
    outCv.width = N; outCv.height = N;
    var ctx = outCv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, N, N);
    for (var i = 0; i < N * N; i++) {
      if (!result[i]) continue;
      ctx.fillStyle = PALETTES[pal][result[i] - 1];
      ctx.fillRect(i % N, (i / N) | 0, 1, 1);
    }
    if (sketchCta) sketchCta.href = linkFor(result);
  }

  function loadSketchSample() {
    var cv = sampleSketch();
    setSource(cv, cv.width, cv.height);
  }

  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      setSource(img, img.naturalWidth || 1, img.naturalHeight || 1);
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { URL.revokeObjectURL(url); };
    img.src = url;
  }

  if (srcCv && outCv) {
    var fileInp = /** @type {HTMLInputElement|null} */ (document.getElementById('sketch-file'));
    if (fileInp) fileInp.addEventListener('change', function () {
      if (fileInp.files && fileInp.files[0]) loadFile(fileInp.files[0]);
      fileInp.value = '';
    });
    var sampleSk = document.getElementById('sketch-sample');
    if (sampleSk) sampleSk.addEventListener('click', loadSketchSample);
    var sizeBtns = document.querySelectorAll('.sketch-sizes [data-size]');
    for (var sb = 0; sb < sizeBtns.length; sb++) {
      sizeBtns[sb].addEventListener('click', function (e) {
        size = Number(/** @type {HTMLElement} */ (e.currentTarget).dataset.size) || 32;
        for (var q = 0; q < sizeBtns.length; q++) {
          sizeBtns[q].setAttribute('aria-pressed', String(Number(/** @type {HTMLElement} */ (sizeBtns[q]).dataset.size) === size));
        }
        convert();
      });
    }
    // Bild einfach auf den Abschnitt ziehen
    var zone = document.querySelector('.sketch');
    if (zone) {
      zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('is-drop'); });
      zone.addEventListener('dragleave', function () { zone.classList.remove('is-drop'); });
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        zone.classList.remove('is-drop');
        var dt = /** @type {DragEvent} */ (e).dataTransfer;
        if (dt && dt.files && dt.files[0]) loadFile(dt.files[0]);
      });
    }
    loadSketchSample();
  }

  // ── Bitty neben dem Raster: trägt die gewählte Palette, hüpft bei Klick ──
  var bittyEl = /** @type {HTMLCanvasElement|null} */ (document.getElementById('bitty-hi'));
  var bitty = bittyEl && window.Bitty ? window.Bitty.mount(bittyEl, { palette: PALETTES[pal] }) : null;
  if (bitty) bittyEl.addEventListener('click', function () { bitty.hop(); });

  syncPal();
  render();
})();
