// ════════════════════════════════════════════════════════════════════
// PWA — meldet den Service Worker an (Offline-Modus, siehe sw.js)
// ════════════════════════════════════════════════════════════════════
// Klassisches Skript, kein Modul: läuft auf Startseite und Editor gleich.
// Über file:// gibt es keine Service Worker, dann passiert hier nichts.
(function () {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });

  // "Als App installieren": Knöpfe mit [data-install] erscheinen nur, wenn
  // der Browser die Installation anbietet (Chrome, Edge). Firefox und Safari
  // kennen das Ereignis nicht — dort bleiben sie unsichtbar.
  var offer = null;
  function show(on) {
    document.querySelectorAll('[data-install]').forEach(function (b) { b.hidden = !on; });
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    offer = e;
    show(true);
  });
  window.addEventListener('appinstalled', function () { offer = null; show(false); });
  document.addEventListener('click', function (e) {
    if (!offer || !e.target.closest('[data-install]')) return;
    offer.prompt();
    offer.userChoice.then(function () { offer = null; show(false); }, function () {});
  });
})();
