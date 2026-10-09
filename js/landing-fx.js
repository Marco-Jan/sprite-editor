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
