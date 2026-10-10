/* ══════════════════════════════════════════════════════════════════
   SITE-LINKS — alle Adressen nach draussen an einer Stelle
   ══════════════════════════════════════════════════════════════════
   Startseite (Hero-Knoepfe, Fuss) und Footer lesen ihre Links von hier.
   Ein leerer Eintrag heisst "gibt es noch nicht": Elemente mit
   data-link="<name>" verschwinden dann, der Download-Knopf zeigt "bald".
   Sobald es Discord & Co. gibt, hier eintragen — sonst nichts aendern.

   download: Die Desktop-App (spritebit-rs) liegt als GitHub-Release; der
   Link auf "latest/download/<datei>" zeigt immer auf die neueste Fassung.
   Klassisches Script, kein Modul — wie landing-i18n.js.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LINKS = {
    org:       'https://github.com/spritebit',
    github:    'https://github.com/spritebit/sprite-editor',
    githubRs:  'https://github.com/spritebit/spritebit-rs',   // Quellcode der Desktop-App
    download:  'https://github.com/spritebit/spritebit-rs/releases/latest/download/spritebit-windows-x64.zip',
    releases:  'https://github.com/spritebit/spritebit-rs/releases',
    // Unterstützen: fließt in ein Code-Signatur-Zertifikat (Windows warnt dann nicht mehr).
    donate:    'https://ko-fi.com/baloou',
    discord:   '',
    youtube:   '',
    instagram: '',
    tiktok:    '',
    reddit:    '',
  };
  // Versionen an den Knöpfen ("Editor öffnen", "Desktop-App laden").
  // Schreibt tools/deploy.py: web = package.json, desktop = neueste
  // veröffentlichte Release (höchster v…-Tag von spritebit-rs).
  var VERSIONS = {
    web:     '3.2.22',
    desktop: '1.1.19',
  };

  // Abgeleitete Adressen
  if (LINKS.github) {
    LINKS.license = LINKS.github + '/blob/main/LICENSE';
    LINKS.issues  = LINKS.github + '/issues';
  }

  // Früher merkte sich die Startseite die geladene Desktop-Version für einen
  // Update-Hinweis. Die App meldet Updates inzwischen selbst — alten Eintrag wegräumen.
  try { localStorage.removeItem('spritebit_desktop_downloaded'); } catch (e) {}

  function apply() {
    var els = document.querySelectorAll('[data-link]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var url = LINKS[el.getAttribute('data-link')];
      // In Listen verschwindet der ganze Punkt, sonst bliebe eine Luecke.
      var item = el.parentElement && el.parentElement.tagName === 'LI' ? el.parentElement : null;
      if (item) item.hidden = !url;
      if (url) { el.setAttribute('href', url); el.hidden = false; }
      else if (el.hasAttribute('data-link-soon')) {
        // Bleibt sichtbar, aber als "kommt bald" — ohne Ziel.
        el.removeAttribute('href');
        el.setAttribute('aria-disabled', 'true');
        el.classList.add('is-soon');
      } else el.hidden = true;
    }
    // Umschalten zwischen "bald" und "fertig" in Knoepfen mit zwei Beschriftungen.
    var swaps = document.querySelectorAll('[data-link-state]');
    for (var j = 0; j < swaps.length; j++) {
      var s = swaps[j];
      var ready = !!LINKS[s.getAttribute('data-link-state')];
      s.querySelector('[data-when="ready"]').hidden = !ready;
      s.querySelector('[data-when="soon"]').hidden = ready;
    }
    // Versions-Schilder an den Knöpfen
    var vers = document.querySelectorAll('[data-version]');
    for (var v = 0; v < vers.length; v++) {
      var num = VERSIONS[vers[v].getAttribute('data-version')];
      vers[v].textContent = num ? 'v' + num : '';
      vers[v].hidden = !num;
    }
    // Spalten, in denen kein einziger Link uebrig ist, zeigen ihren Hinweis.
    var groups = document.querySelectorAll('[data-link-group]');
    for (var k = 0; k < groups.length; k++) {
      var g = groups[k];
      var any = g.querySelector('[data-link]:not([hidden])');
      var empty = g.querySelector('[data-when="empty"]');
      if (empty) empty.hidden = !!any;
    }
  }

  window.SITE_LINKS = LINKS;
  window.SITE_VERSIONS = VERSIONS;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
