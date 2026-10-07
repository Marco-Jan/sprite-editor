// ════════════════════════════════════════════════════════════════════
// LEGAL — Sprache auf Impressum und Datenschutz
// ════════════════════════════════════════════════════════════════════
// Beide Seiten tragen eine deutsche und eine englische Fassung. Gezeigt wird
// die Sprache, die Startseite und Editor gespeichert haben ('at' → Deutsch,
// eine eigene österreichische Fassung gibt es für Rechtstexte nicht).
// Klassisches Skript, kein Modul — ohne JavaScript bleibt es Deutsch.
(function () {
  'use strict';
  var KEY = 'sprite_editor_lang';
  var TITLES = {
    de: { impressum: 'Impressum — spritebit', datenschutz: 'Datenschutz — spritebit' },
    en: { impressum: 'Legal notice — spritebit', datenschutz: 'Privacy policy — spritebit' },
  };

  function pick() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) {}
    if (v === 'en') return 'en';
    if (v === 'de' || v === 'at') return 'de';
    return (navigator.language || 'de').toLowerCase().indexOf('de') === 0 ? 'de' : 'en';
  }

  function apply(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-legal-lang]').forEach(function (el) {
      el.hidden = el.getAttribute('data-legal-lang') !== lang;
    });
    document.querySelectorAll('[data-set-lang]').forEach(function (a) {
      a.setAttribute('aria-current', a.getAttribute('data-set-lang') === lang ? 'true' : 'false');
    });
    var page = /datenschutz/.test(location.pathname) ? 'datenschutz' : 'impressum';
    document.title = TITLES[lang][page];
  }

  document.addEventListener('click', function (e) {
    var a = /** @type {HTMLElement} */ (e.target).closest('[data-set-lang]');
    if (!a) return;
    e.preventDefault();
    var lang = a.getAttribute('data-set-lang');
    try { localStorage.setItem(KEY, lang); } catch (err) {}
    apply(lang);
  });

  apply(pick());
})();
