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
