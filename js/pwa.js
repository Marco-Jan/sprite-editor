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
})();
