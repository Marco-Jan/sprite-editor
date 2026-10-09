// ════════════════════════════════════════════════════════════════════
// LANDING-FX — Abschnitte blenden beim Hineinscrollen sanft ein
// ════════════════════════════════════════════════════════════════════
// Klassisches Skript. Versteckt wird nur, was dieses Skript selbst wieder
// zeigt: ohne JavaScript, ohne IntersectionObserver oder mit "Bewegung
// reduzieren" bleibt alles einfach sichtbar.
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var items = document.querySelectorAll('.band > *, .band--flush > *');
  if (!items.length) return;
  document.documentElement.classList.add('fx-ready');

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('fx-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  items.forEach(function (el) { io.observe(el); });
})();

// Anleitung zur Desktop-App (<details class="dl-help">): schwebt als Box —
// ein Klick daneben oder Esc schließt sie wieder.
(function () {
  var boxes = /** @type {NodeListOf<HTMLDetailsElement>} */ (document.querySelectorAll('details.dl-help'));
  if (!boxes.length) return;
  document.addEventListener('click', function (e) {
    var t = /** @type {Node} */ (e.target);
    boxes.forEach(function (d) { if (d.open && !d.contains(t)) d.open = false; });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    boxes.forEach(function (d) {
      if (!d.open) return;
      d.open = false;
      var sum = d.querySelector('summary');
      if (sum) sum.focus();
    });
  });
})();

// Aufgelöste Kante unter den Kulissen (<div class="drip"><canvas>): die
// Wiese zerfällt nach unten Pixel für Pixel in die Seite. Ein fester
// Zufall je Breite, damit die Kante beim Neuladen gleich aussieht und sich
// beim Größerziehen nur dort ändert, wo neue Spalten dazukommen.
(function () {
  var PX = 6; // Bildschirm-Pixel je Kanten-Pixel
  var edges = document.querySelectorAll('.drip');
  if (!edges.length) return;

  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function draw(el) {
    var cv = /** @type {HTMLCanvasElement} */ (el.querySelector('canvas'));
    if (!cv) return;
    var w = Math.max(1, Math.ceil(el.clientWidth / PX));
    var h = Math.max(1, Math.round(el.clientHeight / PX));
    cv.width = w;
    cv.height = h;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var color = getComputedStyle(el).getPropertyValue('--drip').trim() || '#10261f';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, 1);
    for (var x = 0; x < w; x++) {
      var r = rng(x * 2654435761 + 97);
      for (var y = 1; y < h; y++) {
        // oben fast geschlossen, nach unten immer seltener und blasser
        var p = Math.pow(1 - y / h, 2.4);
        if (r() < p) {
          ctx.globalAlpha = 0.3 + 0.7 * p;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function all() { for (var i = 0; i < edges.length; i++) draw(edges[i]); }
  var t = 0;
  window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(all, 120); });
  all();
})();
