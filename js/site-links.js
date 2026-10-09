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
    web:     '3.1.9',
    desktop: '1.0.3',
  };

  // Abgeleitete Adressen
  if (LINKS.github) {
    LINKS.license = LINKS.github + '/blob/main/LICENSE';
    LINKS.issues  = LINKS.github + '/issues';
  }

  // ── Update-Hinweis für die Desktop-App ─────────────────────────────
  // Wer "Desktop-App laden" klickt, bekommt die Version in diesem Browser
  // gemerkt. Gibt es beim nächsten Besuch eine neuere, wird der Download
  // hervorgehoben und darunter steht "v1.0.0 → v1.0.1". Kein Server, kein
  // Konto — nur dieser Browser auf diesem Gerät weiß davon. Ohne Download
  // (oder ohne localStorage, etwa im privaten Fenster) gibt es keinen Hinweis.
  var DL_KEY = 'spritebit_desktop_downloaded';

  function cmpVersion(a, b) {
    var x = String(a).split('.'), y = String(b).split('.');
    for (var i = 0; i < 3; i++) {
      var d = (parseInt(x[i], 10) || 0) - (parseInt(y[i], 10) || 0);
      if (d) return d;
    }
    return 0;
  }
  function downloaded() {
    try { return localStorage.getItem(DL_KEY); } catch (e) { return null; }
  }
  function rememberDownload() {
    try { localStorage.setItem(DL_KEY, VERSIONS.desktop); } catch (e) {}
    showUpdate();
  }

  function showUpdate() {
    var have = downloaded();
    var newer = !!(have && VERSIONS.desktop && cmpVersion(VERSIONS.desktop, have) > 0);
    var dls = document.querySelectorAll('[data-link="download"]');
    for (var i = 0; i < dls.length; i++) dls[i].classList.toggle('has-update', newer);
    var notes = document.querySelectorAll('[data-dl-update]');
    for (var j = 0; j < notes.length; j++) {
      notes[j].hidden = !newer;
      if (!newer) continue;
      notes[j].querySelector('[data-dl-from]').textContent = 'v' + have;
      notes[j].querySelector('[data-dl-to]').textContent = 'v' + VERSIONS.desktop;
    }
  }

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
    // Download merken, Update-Hinweis zeigen
    var dls = document.querySelectorAll('[data-link="download"]');
    for (var d = 0; d < dls.length; d++) {
      dls[d].addEventListener('click', function () { if (LINKS.download) rememberDownload(); });
    }
    showUpdate();
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
