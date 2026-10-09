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
    'nav.aria':     'Pages',
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
    'hero.chips': '<li>Frames &amp; GIF</li><li>Layers</li><li>Tilemaps</li><li>Made for games</li><li>Works offline</li><li>No account</li>',

    's1.eyebrow':   '<span class="st-num">01</span> The first pixel',
    's1.h2': 'Just start painting.',
    's1.bitty': 'Hi, I’m <span class="bitty-name">Bitty</span>! That’s me in the grid as the example — go ahead and paint over me. I’ll help you out in the editor.',
    's1.lead': 'Pick a color, click, drag — that is exactly how the editor feels. Just with more tools, layers and a timeline for animations.',
    's1.artAlt':    "A pixel dog's face appearing cell by cell: the outline first, then fur, eyes and muzzle.",
    's1.caption':   'Pixel by pixel, just like in the editor',
    's1.demoCap':   'This is how the finished sprite leaves the editor. <span class="fc-dim">Example, trimmed to five rows.</span>',

    's2.eyebrow':   '<span class="st-num">02</span> Color',
    's2.h2':        'And then you tip the whole palette over.',
    's2.artAlt':    'The same staircase cycling through three palettes: cool blue-green, warm browns, forest green.',
    's2.swatchAria': 'Palette indices 0 to 5; index 0 is transparent.',
    's2.lead': 'The picture only remembers which color goes where — not which shade. Swap the palette and everything glows in new colors at once, without touching a single pixel.',
    's2.facts': '<li><span class="fact-key">17 palettes</span> are built in, you can add your own next to them.</li><li>The editor picks matching colors from a <span class="fact-key">photo</span>.</li><li>Great for <span class="fact-key">variants</span>: the same character in red, blue, green.</li>',

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

    's4.eyebrow': '<span class="st-num">03</span> Made for games',
    's4.h2':        'A sprite rarely comes alone.',
    's4.lead': 'A character, their dog, a bird, a whole level: animations, tiles and a template from a photo — everything for your game in one place.',
    's4.cards': '<li class="tool tool--anim"><h3>Animation</h3><div class="filmstrip" aria-hidden="true"><div class="film-frames"><span class="ff"><img src="assets/landing/bird-a.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-b.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-a.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-b.png" alt="" width="17" height="7"></span></div><div class="film-play"><img class="fp-a" src="assets/landing/bird-a.png" alt="" width="17" height="7"><img class="fp-b" src="assets/landing/bird-b.png" alt="" width="17" height="7"></div></div><p>Frames, layers and tags in one timeline — with onion skin and a pace of its own per frame.</p></li><li class="tool tool--tiles"><h3>Tiles</h3><div class="tilestrip" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><p>Paint a tile once, it changes everywhere — that is how levels and patterns come together. Exports straight to Godot.</p></li><li class="tool"><h3>Photo as a stencil</h3><p>Load a photo, lay it over the grid, boil it down to a few colors — the colors from the image become your palette.</p></li>',

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
    'hero.platforms':   'Free · no subscription · no account · open source (MIT license)',
    'hero.sizes':       'In the browser up to 1024 × 1024 pixels · in the desktop app up to 8192 × 8192',
    'donate.label':     'Support spritebit',
    'donate.foot':      '☕ Support spritebit (Ko-fi)',
    'donate.title':     'spritebit stays free either way. Donations go towards a code-signing certificate so Windows stops warning about the desktop app.',
    'dl.helpSummary':  'How to install the desktop app — and why Windows warns',
    'dl.helpSteps':    '<li><b>Download and unpack the ZIP</b> — right-click → “Extract all …”. Put the folder on your desktop or in “Documents”, not in “Program Files”: otherwise the app cannot update itself.</li><li><b>Double-click <code>spritebit.exe</code></b> — no installation needed.</li><li><b>Windows warns on the first start</b> (“Windows protected your PC”) because the app is not signed yet. Click <b>“More info”</b> and then <b>“Run anyway”</b> — you only need to do this once. The source code is open on GitHub.</li><li><b>Updates</b> are announced by the app itself: “Update now” downloads, checks and swaps it in one click.</li>',
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

    // ── Neue Seiten (2026-10): Funktionen, Export, Desktop-App, Ausprobieren ──
    'nav.features': 'Features',
    'nav.desktop': 'Desktop app',
    'nav.home': 'spritebit — home',
    'hero.installLink': 'How to install the desktop app →',
    's1.facts': '<li><span class="fact-key">Drag</span> paints a line, <span class="fact-key">right-click</span> erases.</li><li>Everything stays in your browser — <span class="fact-key">no account</span>, nothing is uploaded.</li><li>Further down you recolor this very picture.</li>',
    's1.cta': 'Keep painting in the editor',
    'demo.erase': 'Eraser',
    'demo.clear': 'Clear',
    'demo.sample': 'Example',
    'demo.pal.forest': 'Forest',
    'demo.pal.dusk': 'Dusk',
    'demo.pal.ice': 'Ice',
    'demo.pal.gray': 'Gray',
    'demo.canvasAlt': 'A small pixel grid to try out: pick a color, then click or drag.',
    'demo.tools': 'Colors and tools',
    'demo.previewAlt': 'Your picture from above in the chosen palette.',
    'demo.palettes': 'Palettes',
    'more.h2': 'Discover more',
    'more.fnH': 'Features',
    'more.fnP': 'Tools, layers, light, guides — everything the editor can do.',
    'more.exH': 'Export',
    'more.exP': 'Image, GIF, spritesheet, Godot or ready-made code for your project.',
    'more.dkH': 'Desktop app',
    'more.dkP': 'spritebit for Windows — bigger canvases, updates itself.',
    'fn.metaTitle': 'Features – spritebit',
    'fn.metaDesc': 'All spritebit tools: painting, shapes, selection, layers with masks, animation with a timeline, light, tiles for game levels and guides.',
    'fn.eyebrow': 'spritebit · Features',
    'fn.h1': 'Everything your hand needs.',
    'fn.lead': 'Undo per stroke, auto-save on the side and a key for every tool. Here is everything the editor can do.',
    'fn.toolsH': 'Tools',
    'fn.photoEyebrow': 'Photo → sprite',
    'fn.photoH': 'From a photo to a clean sprite.',
    'fn.photoSteps': '<li>Load a photo as a <b>stencil</b> and lay it over the grid.</li><li>Reduce it to <b>a few colors</b> — they become your palette.</li><li><b>Remove the background</b>, smooth it, draw an <b>outline</b>.</li><li>Refine the rest by hand with pencil and eraser.</li>',
    'ex.metaTitle': 'Export – spritebit',
    'ex.metaDesc': 'Export pixel art as PNG, PDF, GIF, a spritesheet with a JSON atlas, a Godot tilemap or as code: TypeScript, JavaScript, JSON, SVG, CSS, C header, Python and text.',
    'ex.eyebrow': 'spritebit · Export',
    'ex.h1': 'And then it may leave.',
    'ex.lead': 'As an image, as an animation, for Godot — or as ready-made code for your project. The colors always come along.',
    'ex.formatsH': 'Formats',
    'ex.codeEyebrow': 'For developers',
    'ex.codeH': 'This is how a sprite leaves the editor.',
    'dk.metaTitle': 'Desktop app for Windows – spritebit',
    'dk.metaDesc': 'spritebit as a free Windows program: pixel art on canvases up to 8192 × 8192, offline, no installation, updates with one click.',
    'dk.eyebrow': 'spritebit · Desktop app',
    'dk.h1': 'spritebit for Windows.',
    'dk.lead': 'The same tools as in the browser — as a program of its own, with large canvases and updates with one click.',
    'dk.platforms': 'Windows 10 and 11 · free · no installation needed',
    'dk.installEyebrow': 'Install',
    'dk.installH': 'Ready in a minute.',
    'dk.compareEyebrow': 'Browser or desktop?',
    'dk.compareH': 'Both can do almost everything.',
    'dk.colWeb': 'In the browser',
    'dk.colDesk': 'Desktop app',
    'dk.rowSize': 'Largest canvas',
    'dk.rowStart': 'Getting started',
    'dk.webStart': 'Open the page',
    'dk.deskStart': 'Unzip, start',
    'dk.rowOffline': 'Without internet',
    'dk.yes': 'Yes',
    'dk.rowUpdate': 'Updates',
    'dk.webUpdate': 'Automatically when opened',
    'dk.deskUpdate': '“Update now” in the app',
    'dk.rowFiles': 'Project files',
    'dk.same': 'The same in both',
    'dk.warnEyebrow': 'Why Windows warns',
    'dk.warnH': '“Windows protected your PC”',
    'dk.warnP': 'Windows warns about programs that do not (yet) have a purchased signing certificate. spritebit is open source — the source code is public on GitHub. Click <b>“More info”</b> and then <b>“Run anyway”</b>; you only need to do this once.',
    'dk.donate': 'Support the certificate (Ko-fi)',
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
    'nav.aria':     'Seitn',
    'nav.color':    'Farb',
    'nav.tools':    'Wergzeig',
    'nav.scene':    'Szene',
    'nav.open':     'Editor aufmochn',
    'nav.langLabel': 'Sproch',

    'hero.eyebrow': 'spritebit · Fang kloa an.',
    'hero.chips': '<li>Frames &amp; GIF</li><li>Ebenen</li><li>Tilemaps</li><li>Fia Spü</li><li>Rennt a offline</li><li>Ka Konto</li>',
    'hero.h1':      'Pixel Art Editor fia Sprites',
    'hero.lead':    'A laares Raster, a Handvoll Farben, und du moist los. Da Editor rennt komplett im Browser — ka Build, ka Konto, ka Cloud.',

    's1.eyebrow':   '<span class="st-num">01</span> Da erste Pixel',
    's1.h2': 'Moi afoch los.',
    's1.bitty': 'Servus, i bin da <span class="bitty-name">Bitty</span>! Im Raster siagst mi ois Beispiel — moi mi ruhig um. Im Editor hüf i da weida.',
    's1.lead': 'Farb aussuachn, klickn, ziagn — genau so fühlt si da Editor an. Nur mit mehr Wergzeig, Ebenen und ana Timeline fia Animationen.',
    's1.caption':   'Pixel für Pixel, wia im Editor',
    's1.demoCap':   'So verlasst da fertige Sprite den Editor. <span class="fc-dim">Beispiel, auf fünf Zeiln kürzt.</span>',

    's2.eyebrow':   '<span class="st-num">02</span> Farb',
    's2.h2':        'Und dann kippst d’Palettn um.',
    's2.lead': 'S’Buidl merkt si nur, wöche Farb wohin ghört — ned wöchn Ton. Tausch d’Palettn, und olles leicht sofort in neichn Farben, ohne dass d’a Pixel angreifst.',

    's3.eyebrow':   '<span class="st-num">03</span> Wergzeig',
    's3.h2':        'Olles, wos d’Hand braucht.',
    's3.lead':      'Undo greift pro Strich, Auto-Save rennt nebnbei, und für jedes Wergzeig gibt’s a Tastn. D’Maus muass d’Leistn ned suachn.',

    's4.eyebrow': '<span class="st-num">03</span> Fia Spü',
    's4.h2':        'A Sprite kummt selten alloa.',
    's4.lead': 'A Figur, ihr Hund, a Vogl, a ganzes Level: Animationen, Kacheln und a Vorlog aus an Foto — olles fia dei Spü an oan Ort.',
    's4.cards': '<li class="tool tool--anim"><h3>Animation</h3><div class="filmstrip" aria-hidden="true"><div class="film-frames"><span class="ff"><img src="assets/landing/bird-a.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-b.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-a.png" alt="" width="17" height="7"></span><span class="ff"><img src="assets/landing/bird-b.png" alt="" width="17" height="7"></span></div><div class="film-play"><img class="fp-a" src="assets/landing/bird-a.png" alt="" width="17" height="7"><img class="fp-b" src="assets/landing/bird-b.png" alt="" width="17" height="7"></div></div><p>Frames, Ebenen und Tags in ana Timeline — mit Onion Skin und a eigenem Tempo je Frame.</p></li><li class="tool tool--tiles"><h3>Kacheln</h3><div class="tilestrip" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><p>Oa Kachl anmoin, überoi gändert — so entstehn Levels und Muster. Außa direkt noch Godot.</p></li><li class="tool"><h3>A Foto ois Vorlog</h3><p>Foto lodn, drüberlegn, auf a poar Farben eindampfn — d’Farben aus dem Buidl werdn zu deina Palettn.</p></li>',

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
    'hero.platforms':   'Gratis · ka Abo · ka Konto · Open Source (MIT-Lizenz)',
    'hero.sizes':       'Im Browser bis 1024 × 1024 Pixel · in da Desktop-App bis 8192 × 8192',
    'donate.label':     'spritebit unterstützn',
    'donate.foot':      '☕ spritebit unterstützn (Ko-fi)',
    'donate.title':     'Gratis bleibt spritebit eh. Spendn gengan in a Code-Signatur-Zertifikat, damit Windows bei da Desktop-App nimma warnt.',
    'dl.helpSummary':  'So installierst de Desktop-App — und warum Windows warnt',
    'dl.helpSteps':    '<li><b>ZIP owalodn und auspackn</b> — Rechtsklick → „Alle extrahieren …“. Den Ordner z. B. aufn Desktop oder nach „Dokumente“ legn, ned nach „Programme“: sunst ko si de App ned söwa aktualisiern.</li><li><b><code>spritebit.exe</code> doppelklickn</b> — installiern muasst nix.</li><li><b>Windows warnt beim erstn Start</b> („Der Computer wurde durch Windows geschützt“), weil de App no ned signiert is. Auf <b>„Weitere Informationen“</b> und dann <b>„Trotzdem ausführen“</b> klickn — des braucht ma nur oamoi. Da Quellcode liegt offn auf GitHub.</li><li><b>Updates</b> meldet de App söwa: „Jetzt aktualisieren“ lodt, prüft und tauscht s’ mit oam Klick aus.</li>',
    'foot.tag':         'Pixel-Art-Editor fia Sprites — im Browser und ois Desktop-App. Open Source unta MIT-Lizenz.',
    'foot.releases':    'Olle Versionen',
    'foot.issues':      'Föhla meldn',
    'foot.communitySoon': 'De Kanäle kumman boid.',
    'foot.legal':       'Rechtlichs',

    // ── Neue Seiten (2026-10): Funktionen, Export, Desktop-App, Ausprobieren ──
    'nav.features': 'Funktionen',
    'nav.home': 'spritebit — Startseitn',
    'hero.installLink': 'So installierst d’Desktop-App →',
    's1.facts': '<li><span class="fact-key">Ziagn</span> moit durchgehend, <span class="fact-key">Rechtsklick</span> radiert.</li><li>Olles bleibt in deim Browser — <span class="fact-key">ka Konto</span>, nix wird aufeglodn.</li><li>Untn färbst genau des Buidl um.</li>',
    's1.cta': 'Im Editor weitamoin',
    'demo.clear': 'Ausleern',
    'demo.pal.dusk': 'Omd',
    'more.h2': 'Mehr entdeckn',
    'fn.h1': 'Olles, wos d’Hand braucht.',
    'ex.h1': 'Und dann derf’s geh.',
    'dk.installH': 'In ana Minutn startklar.',
    'dk.compareH': 'Beides kann fost olles.',
    'dk.webStart': 'Seitn aufmochn',
    'dk.yes': 'Jo',
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
