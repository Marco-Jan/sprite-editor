/* ══════════════════════════════════════════════════════════════════
   LANDING-I18N — Deutsch/Englisch für die Startseite
   ══════════════════════════════════════════════════════════════════
   Bewusst ein klassisches, synchrones Script (kein Modul): es läuft am
   Ende des <body>, also nach dem Parsen und vor dem ersten Anzeigen —
   damit nichts erst deutsch aufblitzt und dann umspringt.

   Ohne JavaScript passiert hier gar nichts: die Seite bleibt vollständig
   lesbar, eben auf Deutsch. Der Umschalter wird deshalb von hier aus
   eingefügt und steht ohne JS erst gar nicht da.

   Deutsch steht im HTML und wird beim ersten Lauf pro Element gemerkt;
   unten steht nur die englische Fassung.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LANG_KEY = 'sprite_editor_lang';
  // 'at' ist Deutsch mit Dialekt-Einschlag: was in AT fehlt, faellt auf
  // das deutsche HTML zurueck.
  var SUPPORTED = ['de', 'en', 'at'];
  var SOURCE_LANG = 'de';

  function stored() {
    try {
      var v = localStorage.getItem(LANG_KEY);
      return SUPPORTED.indexOf(v) >= 0 ? v : null;
    } catch (e) { return null; }
  }

  function detect() {
    var s = stored();
    if (s) return s;
    var nav = (navigator.language || 'de').toLowerCase();
    return nav.indexOf('de-at') === 0 ? 'at' : (nav.indexOf('de') === 0 ? 'de' : 'en');
  }

  var lang = detect();

  // ── Englische Fassung ─────────────────────────────────────────────
  var EN = {
    'meta.title':   'spritebit – pixel art editor online: sprites, animation & tilemaps',
    'meta.desc':    'A free pixel art editor for the browser and Windows: draw sprites, animate with layers and a timeline, build tilemaps for game levels and export as PNG, GIF, spritesheet, Godot scene or code. No account, everything stays local.',
    'meta.locale':  'en_US',
    'meta.ogTitle': 'spritebit – pixel art editor online: sprites, animation & tilemaps',
    'meta.ogDesc':  'From an empty grid to a finished sprite, an animation and a game level. Draw, animate, build tiles, export — all in the browser, nothing gets uploaded.',
    'meta.ogAlt':   'spritebit — a pixel staircase in green and blue next to the wordmark.',
    'meta.twDesc':  'Draw, animate, build tilemaps, export — all in the browser, nothing gets uploaded.',

    'nav.skip':     'Skip to content',
    'nav.aria':     'Sections',
    'nav.pixel':    'Pixel',
    'nav.color':    'Color',
    'nav.tools':    'Tools',
    'nav.scene':    'Scene',
    'nav.export':   'Export',
    'nav.open':     'Open the editor',
    'nav.langLabel': 'Language',

    'hero.eyebrow': 'spritebit · Start small.',
    'hero.h1':      'Pixel art editor for sprites',
    'hero.lead':    'An empty grid, a handful of colors, and off you go. The editor runs entirely in the browser — no build, no account, no cloud.',
    'hero.note':    'Your pixels stay in your browser’s storage, on your own machine. Nothing is uploaded — and once opened, the editor works offline too.',
    'hero.chips':   '<li>Frames &amp; GIF</li><li>Layers</li><li>Tilemaps</li><li>9 code formats</li><li>Works offline</li><li>No account</li>',

    's1.eyebrow':   '<span class="st-num">01</span> The first pixel',
    's1.h2':        'This is how a sprite grows.',
    's1.lead':      'Outline first, then the fur, then the eyes. A sprite grows cell by cell — and beside it grows the code you take away at the end.',
    's1.artAlt':    "A pixel dog's face appearing cell by cell: the outline first, then fur, eyes and muzzle.",
    's1.caption':   'Pixel by pixel, just like in the editor',
    's1.demoCap':   'This is how the finished sprite leaves the editor. <span class="fc-dim">Example, trimmed to five rows.</span>',

    's2.eyebrow':   '<span class="st-num">02</span> Color',
    's2.h2':        'And then you tip the whole palette over.',
    's2.artAlt':    'The same staircase cycling through three palettes: cool blue-green, warm browns, forest green.',
    's2.swatchAria': 'Palette indices 0 to 5; index 0 is transparent.',
    's2.lead':      'The grid stores nothing but the numbers. Change one color and every pixel with that index recolors at once — without you touching a single pixel.',
    's2.facts': ''
      + '<li><span class="fact-key">Index 0</span> is always transparent, up to <span class="fact-key">255 colors</span> per palette.</li>'
      + '<li><span class="fact-key">17 palettes</span> come built in, and you add your own beside them.</li>'
      + '<li><span class="fact-key">Every sprite</span> remembers its own palette.</li>',

    's3.eyebrow':   '<span class="st-num">03</span> Tools',
    's3.h2':        'Everything the hand needs.',
    's3.lead':      'Undo works per stroke, auto-save runs alongside, and every tool has a key. The mouse never has to hunt for the toolbar.',
    's3.tools': ''
      + '<li class="tool">'
      +   '<h3>Drawing</h3>'
      +   '<p class="keys-row"><kbd>P</kbd><kbd>B</kbd><kbd>S</kbd><kbd>F</kbd><kbd>E</kbd><kbd>W</kbd></p>'
      +   '<p>Pencil, brush, spray, fill, eraser, magic wand.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Shapes</h3>'
      +   '<p class="keys-row"><kbd>I</kbd><kbd>R</kbd><kbd>O</kbd></p>'
      +   '<p>Line, rectangle, ellipse — with a live preview, outlined or filled.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Symmetry</h3>'
      +   '<p class="keys-row"><kbd>↔</kbd><kbd>↕</kbd></p>'
      +   '<p>Two axes. Every stroke is mirrored as you draw it; both together give four.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Selection</h3>'
      +   '<p class="keys-row"><kbd>A</kbd><kbd>L</kbd><kbd>K</kbd></p>'
      +   '<p>Marquee, lasso, color select. The area is cut out and floats until you set it down.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Floating</h3>'
      +   '<p class="keys-row"><kbd>Alt</kbd><kbd>↑↓←→</kbd></p>'
      +   '<p>Move, rotate freely, flip, copy — what lies underneath stays intact.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Image</h3>'
      +   '<p class="keys-row"><kbd>Ctrl</kbd><kbd>Z</kbd></p>'
      +   '<p>Flip, rotate, trim to the content, center, resize the canvas, scale hard.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Animation</h3>'
      +   '<p class="keys-row"><kbd>,</kbd><kbd>.</kbd><kbd>Enter</kbd></p>'
      +   '<p>A timeline grid of layers and frames, tags, linked cels, onion skin — a pace of its own per frame.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Layers</h3>'
      +   '<p class="keys-row"><kbd>+</kbd><kbd>⧉</kbd><kbd>⤓</kbd></p>'
      +   '<p>Paint on top of each other, hide, lock, opacity, masks — what you see is what gets exported.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Guides</h3>'
      +   '<p class="keys-row"><kbd>G</kbd></p>'
      +   '<p>Free lines and figure proportions from chibi to hero, savable as your own layouts — never in the export.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Light</h3>'
      +   '<p class="keys-row"><kbd>↖</kbd><kbd>☀</kbd></p>'
      +   '<p>Pick a light source — edges and a cast shadow come as layers of their own and can be changed any time.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Tiles</h3>'
      +   '<p class="keys-row"><kbd>▦</kbd></p>'
      +   '<p>Tilemaps for game levels: paint a tile once, it changes everywhere. Out as a Godot scene.</p>'
      + '</li>',

    's4.eyebrow':   '<span class="st-num">04</span> Scene',
    's4.h2':        'A sprite rarely comes alone.',
    's4.lead':      'Sooner or later there are many: a character, their dog, a bird, a bush. The editor keeps them all side by side and helps bring them together.',
    's4.cards': ''
      + '<li class="tool">'
      +   '<h3>Photo as a stencil</h3>'
      +   '<p>Load a photo, lay it over the grid, boil it down to a few colors. The colors from the image become your palette.</p>'
      +   '<p class="tool-meta">Plus: remove the background, despeckle, draw an outline.</p>'
      + '</li>'
      + '<li class="tool tool--anim">'
      +   '<h3>Animation</h3>'
      +   '<div class="filmstrip" aria-hidden="true"><div class="film-frames"><span class="ff"><img src="assets/landing/bird-a.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-b.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-a.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-b.png" alt="" width="17" height="7"></span></div><div class="film-play"><img class="fp-a" src="assets/landing/bird-a.png" alt="" width="17" height="7"><img class="fp-b" src="assets/landing/bird-b.png" alt="" width="17" height="7"></div></div>'
      +   '<p>Frames in a timeline, onion skin, a pace of its own per frame.</p>'
      +   '<p class="tool-meta">Out as a GIF, a spritesheet or code.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>All together</h3>'
      +   '<p>All sprites go into one image, equally sized side by side — plus a list of where each one sits.</p>'
      +   '<p class="tool-meta">That way any engine reads them straight in.</p>'
      + '</li>',

    's5.eyebrow':   '<span class="st-num">05</span> Export',
    's5.h2':        'And then it may leave.',
    's5.lead':      'You can save it as an <b>image</b> — or as ready-made code for your project. Both in one click, and the colors always come along.',
    's5.imageFormats': ''
      + '<li class="fmt"><span class="fmt-ext">.png</span><h3>Image</h3><p>With a transparent background, enlarged 1× to 32×</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.pdf</span><h3>PDF</h3><p>For printing or passing on</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.gif</span><h3>Animation</h3><p>All frames as a GIF, loops forever</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.png</span><h3>Spritesheet</h3><p>All sprites and frames in one image, with a list of where each one sits</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.tscn</span><h3>Godot tilemap</h3><p>Tile image plus a scene with a TileMapLayer — open it straight in Godot 4</p></li>',
    's5.subLead':   'For developers the sprite also comes out as code — nine formats, each one usable on its own.',
    's5.codeFormats': ''
      + '<li class="fmt"><span class="fmt-ext">.ts</span><h3>TypeScript</h3><p>Number grid plus color list, fully typed</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.js</span><h3>JavaScript</h3><p>The same without types, importable straight away</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.json</span><h3>JSON</h3><p>Every language and every engine reads it</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.json</span><h3>JSON (game)</h3><p>A flat grid with a material per color — for game engines</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.svg</span><h3>SVG</h3><p>Stays sharp at any size, drops straight in</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.css</span><h3>CSS</h3><p>The sprite as pure CSS, with no image file at all</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.h</span><h3>C header</h3><p>For microcontrollers and LED matrices</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.py</span><h3>Python</h3><p>For Pygame, Pillow and your own scripts</p></li>'
      + '<li class="fmt"><span class="fmt-ext">.txt</span><h3>Text grid</h3><p>One character per pixel — just to look at</p></li>',
    's5.backH3':    'And back again',
    's5.backChips': ['TypeScript', 'JavaScript', 'JSON', 'JSON (game)', 'SVG', 'CSS', 'C header', 'Python', 'Text grid']
      .map(function (n) { return '<span class="chip-tag chip-tag--in">' + n + '</span>'; }).join(''),
    's5.backNote':  'All nine can be read back in as well — the picture comes back unchanged.',

    'end.h2':       'The grid is still empty.',
    'end.lead':     'No account, no server, no cost. The editor opens and waits for your first pixel.',
    'end.note':     'Once opened, everything works without internet — even the PDF export. Installed as a browser app, spritebit starts like a program of its own.',
    'end.install':  'Install as browser app',
    'end.installTitle': 'Installs the web version through your browser: its own window, an icon in the start menu, works offline. This is not the desktop app.',

    'scene.credit': '* The pixel art in the backdrops on this page is homemade — hand-pixeled, no additives.',
    'foot.imprint': 'Legal notice',
    'foot.privacy': 'Privacy',

    'hero.ctaWeb':      'Open in browser',
    'hero.ctaDownload': 'Desktop app for Windows',
    'hero.ctaDesktop':  'Desktop app',
    'hero.ctaGithub':   'Open source on GitHub',
    'dl.update':        'Update for your desktop app:',
    'hero.platforms':   'Free · no subscription · no account · open source (MIT license)',
    'hero.sizes':       'In the browser up to 1024 × 1024 pixels · in the desktop app up to 8192 × 8192',
    'hero.ctaDownloadTitle': 'The same features as a Windows program — with canvases up to 8192 × 8192 pixels (in the browser up to 1024 × 1024). Updates itself.',
    'soon':             'soon',
    'foot.tag':         'Pixel art editor for sprites — in the browser and as a desktop app. Open source under the MIT license.',
    'foot.aria':        'More pages',
    'foot.product':     'Product',
    'foot.download':    'Desktop app (Windows)',
    'foot.releases':    'All versions',
    'foot.oss':         'Open source',
    'foot.srcWeb':      'Source code (web)',
    'foot.srcDesktop':  'Source code (desktop)',
    'foot.license':     'MIT license',
    'foot.issues':      'Report a bug',
    'foot.community':   'Community',
    'foot.communitySoon': 'Channels coming soon.',
    'foot.legal':       'Legal',
    'foot.mit':         'Free software under the MIT license',
  };

  // ── Snapshot + Anwenden ───────────────────────────────────────────
  var snaps = [];   // parallel zur Elementliste
  var els = null;

  function collect() {
    els = document.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-attr]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var s = { text: el.textContent, html: el.innerHTML, attrs: {} };
      var spec = el.getAttribute('data-i18n-attr');
      if (spec) {
        var pairs = spec.split(';');
        for (var j = 0; j < pairs.length; j++) {
          var c = pairs[j].indexOf(':');
          if (c < 0) continue;
          var a = pairs[j].slice(0, c).trim();
          s.attrs[a] = el.getAttribute(a);
        }
      }
      snaps.push(s);
    }
  }


  // ── Oesterreichisch ───────────────────────────────────────────────
  // Nur die auffaelligen Stellen; der Rest bleibt der deutsche
  // Ausgangszustand aus dem HTML.
  var AT = {
    'meta.title':   'spritebit – Pixel Art Editor online: Sprites, Animation & Tilemaps',
    'meta.locale':  'de_AT',

    'nav.skip':     'Zum Inhalt springa',
    'nav.aria':     'Abschnitte',
    'nav.color':    'Farb',
    'nav.tools':    'Wergzeig',
    'nav.scene':    'Szene',
    'nav.open':     'Editor aufmochn',
    'nav.langLabel': 'Sproch',

    'hero.eyebrow': 'spritebit · Fang kloa an.',
    'hero.chips':   '<li>Frames &amp; GIF</li><li>Ebenen</li><li>Tilemaps</li><li>9 Code-Formate</li><li>Rennt a offline</li><li>Ka Konto</li>',
    'hero.h1':      'Pixel Art Editor fia Sprites',
    'hero.lead':    'A laares Raster, a Handvoll Farben, und du moist los. Da Editor rennt komplett im Browser — ka Build, ka Konto, ka Cloud.',
    'hero.note':    'Deine Pixel bleibn im Speicher vom Browser, auf deim Rechner. Es wird nix aufeglodn — und amoi offn, rennt da Editor a offline.',

    's1.eyebrow':   '<span class="st-num">01</span> Da erste Pixel',
    's1.h2':        'So entsteht a Sprite.',
    's1.lead':      'Zerst d’Umrandung, dann s’Föll, dann d’Augn. A Sprite entsteht Feld für Feld — und danebn wachst da Code mit, den du am End mitnimmst.',
    's1.caption':   'Pixel für Pixel, wia im Editor',
    's1.demoCap':   'So verlasst da fertige Sprite den Editor. <span class="fc-dim">Beispiel, auf fünf Zeiln kürzt.</span>',

    's2.eyebrow':   '<span class="st-num">02</span> Farb',
    's2.h2':        'Und dann kippst d’Palettn um.',
    's2.lead':      'S’Raster speichert nur d’Zahlen. Änderst a Farb, färbn sich olle Pixel mit dem Index glei mit um — ohne dass d’a Pixel angreifst.',

    's3.eyebrow':   '<span class="st-num">03</span> Wergzeig',
    's3.h2':        'Olles, wos d’Hand braucht.',
    's3.lead':      'Undo greift pro Strich, Auto-Save rennt nebnbei, und für jedes Wergzeig gibt’s a Tastn. D’Maus muass d’Leistn ned suachn.',

    's4.eyebrow':   '<span class="st-num">04</span> Szene',
    's4.h2':        'A Sprite kummt selten alloa.',
    's4.lead':      'Irgendwann san’s vüle: a Figur, ihr Hund, a Vogl, a Buschn. Da Editor hoit sie olle nebnanand und hüft, sie zammzbringa.',
    's4.cards': ''
      + '<li class="tool">'
      +   '<h3>A Foto ois Vorlog</h3>'
      +   '<p>Foto lodn, drüberlegn, auf a poar Farben eindampfn. D’Farben aus dem Buidl werdn zu deina Palettn.</p>'
      +   '<p class="tool-meta">Dazua: Hintagrund weg, glätten, Outline ziagn.</p>'
      + '</li>'
      + '<li class="tool tool--anim">'
      +   '<h3>Animation</h3>'
      +   '<div class="filmstrip" aria-hidden="true"><div class="film-frames"><span class="ff"><img src="assets/landing/bird-a.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-b.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-a.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-b.png" alt="" width="17" height="7"></span></div><div class="film-play"><img class="fp-a" src="assets/landing/bird-a.png" alt="" width="17" height="7"><img class="fp-b" src="assets/landing/bird-b.png" alt="" width="17" height="7"></div></div>'
      +   '<p>Frames in ana Timeline, Onion Skin, a eigenes Tempo je Frame.</p>'
      +   '<p class="tool-meta">Außa ois GIF, Spritesheet oder Code.</p>'
      + '</li>'
      + '<li class="tool">'
      +   '<h3>Olle zamm</h3>'
      +   '<p>Olle Sprites kemman in a Buidl, gleich groß nebnanand — und dazua a Listn, wo welcher hockt.</p>'
      +   '<p class="tool-meta">Damit liest a jede Engine des glei ein.</p>'
      + '</li>',

    's5.eyebrow':   '<span class="st-num">05</span> Export',
    's5.h2':        'Und dann derf’s geh.',
    's5.lead':      'Speichern kannst ois <b>Buidl</b> — oder ois fertign Code fürs Projekt. Beides mit oam Klick, d’Farben san immer dabei.',
    's5.subLead':   'Für Entwickler kummt da Sprite a ois Code außa — neun Formate, jedes für sich alloa brauchbar.',
    's5.backH3':    'Und wieder zruck',
    's5.backNote':  'Olle neun kannst a wieder einelesn — s’Buidl kummt unverändert zruck.',

    'end.h2':       'S’Raster is no laar.',
    'end.lead':     'Ka Konto, ka Server, kane Kostn. Da Editor geht auf und wart auf dein erstn Pixel.',
    'end.note':     'Amoi offn, rennt ois a ohne Internet — sogar da PDF-Export. Ois Browser-App installiert, startet spritebit wia a eigns Programm.',
    'end.install':  'Ois Browser-App installiern',

    'scene.credit': '* D’Pixel-Art in de Kulissn do is hausgmocht — händisch pixlt, ohne Zuasatzstoffe.',

    'hero.ctaWeb':      'Im Browser aufmochn',
    'hero.ctaDownload': 'Desktop-App fia Windows',
    'dl.update':        'A Update fia dei Desktop-App:',
    'hero.platforms':   'Gratis · ka Abo · ka Konto · Open Source (MIT-Lizenz)',
    'hero.sizes':       'Im Browser bis 1024 × 1024 Pixel · in da Desktop-App bis 8192 × 8192',
    'foot.tag':         'Pixel-Art-Editor fia Sprites — im Browser und ois Desktop-App. Open Source unta MIT-Lizenz.',
    'foot.releases':    'Olle Versionen',
    'foot.issues':      'Föhla meldn',
    'foot.communitySoon': 'De Kanäle kumman boid.',
    'foot.legal':       'Rechtlichs',
  };

  function pick(key, fallback) {
    if (lang === SOURCE_LANG) return fallback;
    var table = lang === 'at' ? AT : EN;
    // Kein Eintrag -> der deutsche Ausgangszustand aus dem HTML.
    return table[key] !== undefined ? table[key] : fallback;
  }

  function apply() {
    for (var i = 0; i < els.length; i++) {
      var el = els[i], s = snaps[i];
      var k = el.getAttribute('data-i18n');
      if (k) el.textContent = pick(k, s.text);
      var kh = el.getAttribute('data-i18n-html');
      if (kh) el.innerHTML = pick(kh, s.html);
      var spec = el.getAttribute('data-i18n-attr');
      if (spec) {
        var pairs = spec.split(';');
        for (var j = 0; j < pairs.length; j++) {
          var c = pairs[j].indexOf(':');
          if (c < 0) continue;
          var a = pairs[j].slice(0, c).trim();
          var key = pairs[j].slice(c + 1).trim();
          var v = pick(key, s.attrs[a]);
          if (v != null) el.setAttribute(a, v);
        }
      }
    }
    var html = document.documentElement;
    html.lang = lang;
    html.setAttribute('data-lang', lang);
    html.removeAttribute('data-i18n-pending');
    syncSwitch();
  }

  // ── Umschalter ────────────────────────────────────────────────────
  var switchEl = null;

  function buildSwitch() {
    var host = document.querySelector('.topbar-inner');
    if (!host) return;
    switchEl = document.createElement('div');
    switchEl.className = 'lang-switch';
    switchEl.setAttribute('role', 'group');
    switchEl.setAttribute('aria-label', 'Sprache / Language');
    ['de', 'at', 'en'].forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-btn';
      b.setAttribute('data-lang', code);
      b.lang = code;
      b.textContent = code.toUpperCase();
      // Auf schmalen Fenstern ist nur die Flagge sichtbar — dann traegt
      // das Label die Bedeutung.
      var name = code === 'de' ? 'Deutsch' : (code === 'at' ? 'Österreichisch' : 'English');
      b.title = name;
      b.setAttribute('aria-label', name);
      b.addEventListener('click', function () {
        if (code === lang) return;
        lang = code;
        try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
        apply();
      });
      switchEl.appendChild(b);
    });
    // Ganz rechts, nach dem Editor-Knopf.
    host.appendChild(switchEl);
  }

  function syncSwitch() {
    if (!switchEl) return;
    var btns = switchEl.querySelectorAll('[data-lang]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-lang') === lang;
      btns[i].classList.toggle('is-active', on);
      btns[i].setAttribute('aria-pressed', String(on));
    }
  }

  try {
    collect();
    buildSwitch();
    apply();
  } catch (e) {
    // Im Zweifel lieber deutsch als unsichtbar.
    document.documentElement.removeAttribute('data-i18n-pending');
    console.warn('Sprachumschaltung fehlgeschlagen', e);
  }
})();
