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

  // "Als App installieren": Knöpfe mit [data-install] erscheinen, wenn der
  // Browser die Installation anbietet (Chrome, Edge). Apple-Geräte kennen
  // das Ereignis nicht — dort installiert man von Hand über das Teilen-Menü
  // bzw. "Zum Dock hinzufügen". Der Knopf zeigt dann eine Anleitung.
  // Firefox kann gar nicht installieren, dort bleibt er unsichtbar.
  var offer = null;
  function show(on) {
    document.querySelectorAll('[data-install]').forEach(function (b) { b.hidden = !on; });
  }

  var ua = navigator.userAgent;
  var IOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var MAC_SAFARI = !IOS && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(ua);
  var STANDALONE = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  var APPLE = (IOS || MAC_SAFARI) && !STANDALONE;

  if (APPLE) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { show(true); });
    else show(true);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    offer = e;
    show(true);
  });
  window.addEventListener('appinstalled', function () { offer = null; show(false); });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-install]')) return;
    if (offer) {
      offer.prompt();
      offer.userChoice.then(function () { offer = null; show(false); }, function () {});
    } else if (APPLE) {
      openGuide();
    }
  });

  // ── Anleitung für Apple-Geräte ────────────────────────────────────
  var SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

  var TEXT = {
    de: {
      title: 'spritebit auf den Home-Bildschirm',
      lead: 'Auf Apple-Geräten installiert man Web-Apps von Hand — so geht’s:',
      ios: ['Tippe auf <b>Teilen</b> ' + SHARE + ' — beim iPhone unten, beim iPad oben in der Leiste.',
            'Scrolle etwas nach unten und wähle <b>Zum Home-Bildschirm</b> ' + PLUS + '.',
            'Tippe oben rechts auf <b>Hinzufügen</b>.'],
      mac: ['Klicke in der Menüleiste auf <b>Ablage</b>.',
            'Wähle <b>Zum Dock hinzufügen …</b> (ab macOS Sonoma).',
            'Bestätige mit <b>Hinzufügen</b>.'],
      after: 'Danach startet spritebit wie eine eigene App — auch ohne Internet.',
      ok: 'Verstanden',
    },
    at: {
      title: 'spritebit auf’n Home-Bildschirm',
      lead: 'Auf Apple-Gerät installiert ma Web-Apps händisch — so geht’s:',
      ios: ['Tipp auf <b>Teilen</b> ' + SHARE + ' — beim iPhone untn, beim iPad obn in da Leistn.',
            'Scroll a bissl obe und wähl <b>Zum Home-Bildschirm</b> ' + PLUS + '.',
            'Tipp obn rechts auf <b>Hinzufügen</b>.'],
      mac: ['Klick in da Menüleistn auf <b>Ablage</b>.',
            'Wähl <b>Zum Dock hinzufügen …</b> (ab macOS Sonoma).',
            'Bestätig mit <b>Hinzufügen</b>.'],
      after: 'Danoch startet spritebit wia a eigene App — a ohne Internet.',
      ok: 'Passt',
    },
    en: {
      title: 'Add spritebit to your Home Screen',
      lead: 'On Apple devices web apps are installed by hand — here’s how:',
      ios: ['Tap <b>Share</b> ' + SHARE + ' — at the bottom on iPhone, in the top bar on iPad.',
            'Scroll down a little and choose <b>Add to Home Screen</b> ' + PLUS + '.',
            'Tap <b>Add</b> in the top right corner.'],
      mac: ['Click <b>File</b> in the menu bar.',
            'Choose <b>Add to Dock…</b> (macOS Sonoma or later).',
            'Confirm with <b>Add</b>.'],
      after: 'From then on spritebit starts like an app of its own — offline too.',
      ok: 'Got it',
    },
  };

  var CSS = ''
    + '.ios-guide{position:fixed;inset:0;z-index:2000;display:flex;align-items:flex-end;justify-content:center;padding:16px;background:rgba(0,0,0,.55)}'
    + '@media (min-width:600px){.ios-guide{align-items:center}}'
    + '.ios-guide-box{width:100%;max-width:400px;padding:20px;border:1px solid var(--line-strong,#3d3d47);border-radius:14px;background:var(--surface-1,#1a1a1e);color:var(--text,#e6e6ea);font:15px/1.5 var(--font,system-ui,sans-serif);box-shadow:0 20px 60px rgba(0,0,0,.55)}'
    + '.ios-guide h2{margin:0 0 6px;font-size:18px}'
    + '.ios-guide p{margin:0 0 12px;color:var(--text-muted,#9a9aa6)}'
    + '.ios-guide ol{margin:0 0 12px;padding-left:22px}'
    + '.ios-guide li{margin:0 0 8px}'
    + '.ios-guide li svg{display:inline-block;vertical-align:-3px;color:var(--accent,#6ea8fe)}'
    + '.ios-guide button{display:block;width:100%;padding:10px;border:0;border-radius:10px;background:var(--accent,#6ea8fe);color:#0d1420;font:600 15px var(--font,system-ui,sans-serif);cursor:pointer}';

  function openGuide() {
    if (document.querySelector('.ios-guide')) return;
    if (!document.getElementById('ios-guide-css')) {
      var st = document.createElement('style');
      st.id = 'ios-guide-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var lang = (document.documentElement.getAttribute('data-lang') || document.documentElement.lang || 'de').slice(0, 2);
    var tx = TEXT[lang] || TEXT.de;
    var steps = IOS ? tx.ios : tx.mac;

    var wrap = document.createElement('div');
    wrap.className = 'ios-guide';
    wrap.innerHTML = '<div class="ios-guide-box" role="dialog" aria-modal="true" aria-labelledby="ios-guide-title">'
      + '<h2 id="ios-guide-title">' + tx.title + '</h2>'
      + '<p>' + tx.lead + '</p>'
      + '<ol>' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>'
      + '<p>' + tx.after + '</p>'
      + '<button type="button">' + tx.ok + '</button>'
      + '</div>';
    function close() {
      wrap.remove();
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    wrap.addEventListener('click', function (e) { if (e.target === wrap || e.target.closest('button')) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    wrap.querySelector('button').focus();
  }
})();
