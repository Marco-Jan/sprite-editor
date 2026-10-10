// ════════════════════════════════════════════════════════════════════
// I18N — Sprachumschaltung Deutsch / Englisch (Editor + Laufzeit-Texte)
// ════════════════════════════════════════════════════════════════════
// Zwei Quellen, ein Schalter:
//
//   1. Statisches DOM — die deutschen Texte stehen weiter im HTML. Beim
//      ersten Lauf wird der deutsche Stand pro Element eingefroren
//      (snapshot), danach schaltet applyStatic() zwischen Snapshot (de)
//      und STATIC_EN (en) hin und her. Ohne JS bleibt die Seite deutsch
//      und vollständig lesbar.
//
//   2. Laufzeit-Texte — alles, was JS erzeugt (Statuszeile, Toasts,
//      Tooltips an dynamischen Elementen). Die stehen unten in MSG,
//      zweisprachig, und kommen über t() heraus.
//
// Die Sprache liegt unter einem EIGENEN localStorage-Key. Sie gehört
// bewusst nicht in den Projekt-Payload (wb_sprite_tester_v1) — sonst
// würde sie in exportierte Projektdateien wandern.

import { STATIC_AT, MSG_AT } from './i18n-at.js';

export const LANG_KEY = 'sprite_editor_lang';
// 'at' ist Deutsch mit Dialekt-Einschlag: alles, was in i18n-at.js fehlt,
// faellt ueber die Rueckfaelle unten automatisch auf 'de' zurueck.
const SUPPORTED = ['de', 'en', 'at'];
const SOURCE_LANG = 'de'; // Sprache, in der das HTML geschrieben ist

// ────────────────────────────────────────────────────────────────────
// Aktive Sprache
// ────────────────────────────────────────────────────────────────────
function stored() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return SUPPORTED.includes(v) ? v : null;
  } catch { return null; }
}

// Erster Besuch: Browsersprache raten. Eine einmal getroffene Wahl liegt
// im Storage und schlägt das Raten immer.
function detect() {
  const s = stored();
  if (s) return s;
  const nav = (navigator.language || navigator.userLanguage || 'de').toLowerCase();
  if (nav === 'de-at' || nav.startsWith('de-at')) return 'at';
  return nav.startsWith('de') ? 'de' : 'en';
}

let _lang = detect();
const _listeners = [];

export function getLang() { return _lang; }

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === _lang) return;
  _lang = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  applyStatic();
  syncSwitch();
  for (const fn of _listeners) { try { fn(lang); } catch (e) { console.warn(e); } }
}

// Callback für alles, was nach einem Wechsel neu gezeichnet werden muss.
export function onLangChange(fn) { _listeners.push(fn); }

// ────────────────────────────────────────────────────────────────────
// t() — Laufzeit-Texte
// ────────────────────────────────────────────────────────────────────
function fill(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}

export function t(key, params) {
  const table = MSG[_lang] || MSG.de;
  // Fehlt ein Eintrag, gilt Deutsch. Bei 'at' ist das der Normalfall und
  // kein Notnagel: uebersetzt wird nur, was wirklich anders klingt.
  const raw = table[key] !== undefined ? table[key] : (MSG.de[key] !== undefined ? MSG.de[key] : key);
  return fill(raw, params);
}

// Plural: sucht `key_one` bzw. `key_other`.
export function tn(key, n, params) {
  return t(`${key}${n === 1 ? '_one' : '_other'}`, { n, ...params });
}

// Palette-Index → Beschriftung (lang, für die Farbliste im Panel).
// Namen gibt es nur für 0–9 (Tonleiter, Kontur, Akzente); darüber "Farbe 12".
export function colorLabel(i) { return i > 9 ? t('color.labelN', { i }) : t(`color.label.${i}`); }

// Kurzform für enge Stellen (Quick-Palette, Statuszeile).
export function colorLabelShort(i) { return i > 9 ? t('color.labelN', { i }) : t(`color.short.${i}`); }

// ────────────────────────────────────────────────────────────────────
// Statisches DOM
// ────────────────────────────────────────────────────────────────────
// Pro Element wird der deutsche Ausgangszustand einmal gemerkt.
const _snap = new WeakMap();

function snapshot(el) {
  let s = _snap.get(el);
  if (s) return s;
  s = { text: el.textContent, html: el.innerHTML, attrs: {} };
  const spec = el.dataset.i18nAttr;
  if (spec) {
    for (const pair of spec.split(';')) {
      const i = pair.indexOf(':');
      if (i < 0) continue;
      const attr = pair.slice(0, i).trim();
      s.attrs[attr] = el.getAttribute(attr);
    }
  }
  _snap.set(el, s);
  return s;
}

function pick(key, fallback) {
  if (_lang === SOURCE_LANG) return fallback;
  const table = STATIC[_lang];
  // Kein Eintrag -> der deutsche Ausgangszustand aus dem HTML. Genau so
  // soll 'at' funktionieren.
  return table && table[key] !== undefined ? table[key] : fallback;
}

/**
 * Alle Sprachfassungen eines übersetzten Elements — für Bittys Suche, die
 * auf Deutsch auch „layer“ finden soll. Deutsch kommt aus dem Snapshot,
 * die anderen aus STATIC. Ohne `attr` der Text (bzw. das HTML bei
 * data-i18n-html), mit `attr` dieses Attribut.
 * @param {HTMLElement} el
 * @param {string} [attr]
 * @returns {string[]}
 */
export function i18nVariants(el, attr) {
  if (!el) return [];
  const s = snapshot(el);
  let key = null, de = null;
  if (attr) {
    for (const pair of (el.dataset.i18nAttr || '').split(';')) {
      const i = pair.indexOf(':');
      if (i > 0 && pair.slice(0, i).trim() === attr) { key = pair.slice(i + 1).trim(); de = s.attrs[attr]; }
    }
  } else if (el.dataset.i18nHtml) { key = el.dataset.i18nHtml; de = s.html; }
  else if (el.dataset.i18n) { key = el.dataset.i18n; de = s.text; }
  if (!key) return [];
  const out = [de];
  for (const table of Object.values(STATIC)) if (table[key] != null) out.push(table[key]);
  return out.filter(v => typeof v === 'string' && v);
}

const I18N_SELECTOR = '[data-i18n],[data-i18n-html],[data-i18n-attr]';

export function applyStatic(root = document) {
  root.querySelectorAll(I18N_SELECTOR).forEach(el => {
    const s = snapshot(el);
    if (el.dataset.i18n)     el.textContent = pick(el.dataset.i18n, s.text);
    if (el.dataset.i18nHtml) el.innerHTML   = pick(el.dataset.i18nHtml, s.html);
    const spec = el.dataset.i18nAttr;
    if (spec) {
      for (const pair of spec.split(';')) {
        const i = pair.indexOf(':');
        if (i < 0) continue;
        const attr = pair.slice(0, i).trim();
        const key  = pair.slice(i + 1).trim();
        const val  = pick(key, s.attrs[attr]);
        if (val != null) el.setAttribute(attr, val);
      }
    }
  });
  const html = document.documentElement;
  html.lang = _lang;
  html.dataset.lang = _lang;
  // Der Boot-Schnipsel im <head> versteckt den Body, bis hier übersetzt ist.
  html.removeAttribute('data-i18n-pending');
}

// ────────────────────────────────────────────────────────────────────
// Sprachumschalter
// ────────────────────────────────────────────────────────────────────
export function syncSwitch() {
  document.querySelectorAll('.lang-switch [data-lang]').forEach(btn => {
    const on = btn.dataset.lang === _lang;
    btn.classList.toggle('is-active', on);
    // In der Menüleiste ist die Sprache ein Auswahl-Eintrag mit Häkchen.
    btn.setAttribute(btn.getAttribute('role') === 'menuitemradio' ? 'aria-checked' : 'aria-pressed', String(on));
  });
}

// Verdrahtet einen bereits im HTML stehenden Umschalter.
export function initLangSwitch() {
  document.querySelectorAll('.lang-switch [data-lang]').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });
  syncSwitch();
}

// ════════════════════════════════════════════════════════════════════
// STATIC — englische Fassung des statischen Editor-DOMs
// ════════════════════════════════════════════════════════════════════
// Deutsch kommt aus dem HTML selbst (Snapshot), hier steht nur Englisch.
const STATIC = {
  en: {
    'tool.fillVisible':      'Edges: all layers',
    'tool.fillVisibleTitle': 'The edges of the fill come from all visible layers — the paint goes into the active one. That way you colour in a template that sits on a layer of its own, area by area.',

    'donate.menu':  'Support spritebit',
    'mb.tour':      'Tours with Bitty',
    'mb.saveSprite': 'Save sprite …',
    'mb.addSprite':  'Add sprite …',
    'mb.hints':     'Hints from Bitty',
    'mb.news':      "What's new?",
    'news.title':   "What's new?",
    'imp.helpLink': 'Which formats work?',
    'bitty.btn':    'Bitty — show a tip',
    'donate.title': 'spritebit stays free either way. Donations go towards a code-signing certificate so Windows stops warning about the desktop app.',

    'mod.bigHint': 'In the browser up to 1024 × 1024 pixels — the desktop app handles canvases up to 8192 × 8192.',

    'gd.even':      'Evenly',
    'gd.evenTitle': 'Type a number — the lines spread out evenly right away (4 lines = 5 equal parts). 0 removes them.',
    'gd.evenH':     'Number of horizontal lines',
    'gd.evenV':     'Number of vertical lines',
    'gd.evenHUnit': 'horizontal',
    'gd.evenVUnit': 'vertical',

    'gd.layouts':          'Own layouts',
    'gd.layoutsTitle':     'Saved guide layouts — they apply to all sprites',
    'gd.layoutApply':      'Apply',
    'gd.layoutApplyTitle': 'Put the lines and division of this layout on the sprite — scaled proportionally for another size',
    'gd.layoutDelTitle':   'Delete the chosen layout',
    'gd.layoutName':       'Name of the layout',
    'gd.layoutSave':       'Save',
    'gd.layoutSaveTitle':  'Save the current lines and division as a layout — the same name replaces it',

    // ── Kacheln ──
    'tile.title':          'Tiles',
    'tile.offNote':        'The active layer is not a tilemap. A tilemap is made of tiles of a fixed size — paint a tile and it changes everywhere it is placed. Good for game levels and patterns.',
    'tile.offMask':        'A mask is being edited — tiles are back once you are done.',
    'tile.size':           'Tile size',
    'tile.sizeW':          'Width of a tile',
    'tile.sizeH':          'Height of a tile',
    'tile.new':            'New tilemap layer',
    'tile.newTitle':       'Add a new, empty tilemap layer above the active one',
    'tile.convert':        'Convert active layer',
    'tile.convertTitle':   'Cut the active layer into tiles — identical spots become one tile',
    'tile.modeGroup':      'What the tools do',
    'tile.modePixel':      'Paint pixels',
    'tile.modePixelTitle': 'Paint tiles — a tile changes everywhere it is placed',
    'tile.modeTiles':      'Place tiles',
    'tile.modeTilesTitle': 'Place tiles from the list into the grid',
    'tile.autoLabel':      'New tiles',
    'tile.auto':           'Auto — create while painting',
    'tile.manual':         'Manual — only change existing ones',
    'tile.listLabel':      'Tiles',
    'tile.empty':          'No tiles yet — paint into an empty cell in “Paint pixels” mode (Auto).',
    'tile.prune':          'Remove unused',
    'tile.pruneTitle':     'Remove tiles that are not placed anywhere',
    'tile.unmap':          'Normal layer',
    'tile.unmapTitle':     'Back to a normal layer — the pixels stay, the tiles go',
    'tile.godot':          'Export for Godot',
    'tile.godotTitle':     'ZIP with tile image (PNG), Godot scene (.tscn with TileMapLayer) and JSON — unpack the folder into your Godot project (res://)',

    // ── Meta ──
    'meta.title':   'Editor — spritebit',
    'meta.desc':    'Pixel art editor with a photo stencil — draw sprites, build palettes, export as code or image. Runs entirely in the browser.',
    'meta.locale':  'en_US',
    'meta.ogTitle': 'Editor — spritebit',
    'meta.ogDesc':  'Pixel art editor with a photo stencil — draw, build palettes, export as code or image.',
    'meta.ogAlt':   'spritebit — a pixel staircase in green and blue next to the wordmark.',

    // ── Kopfzeile ──
    'tb.home':        'Back to the start page',
    'tb.saved':       'saved',
    'tb.menu':        'Menu',
    'tb.install':     'Install app',
    'tb.installTitle': 'Install spritebit as an app — it then starts like a program of its own, offline too',
    'help.h.backup':  'Backup',
    'help.backupIntro': 'Your work lives in this browser’s storage. spritebit also keeps the state from the start of a session — in case something is missing after an update. “Save project” is still the safest option.',
    'help.backupDownload': 'Download',
    'help.backupRestore':  'Restore',
    'help.backupNone':     'No backup yet.',
    'help.imprint':        'Legal notice',
    'help.privacy':        'Privacy policy',
    'fc.btnTitle':    'Colors in the sprite that have no slot in the palette',
    'pal.show':       'Show',
    'pal.showTitle':  'Shows where the current color appears in the image — everything else is dimmed',
    'tb.help':        'Help',
    'tb.helpTitle':   'Help & explanations',
    'tb.dir':         'Save folder',
    'tb.dirTitle':    'Pick a folder for saved files — it is remembered',
    'tb.save':        'Save project',
    'tb.saveTitle':   'Save the project as a JSON file',
    'tb.open':        'Open',
    'tb.openTitle':   'Load a project from a JSON file',
    'tb.reset':       'Reset',
    'tb.resetTitle':  'Reset everything',
    'tb.langLabel':   'Language',
    'mb.label': 'Menu',
    'fs.exit': 'Exit fullscreen',
    'fs.exitTitle': 'Exit fullscreen (Esc)',
    'fs.gripLeft': 'Show left bar',
    'fs.gripRight': 'Show right bar',
    'mb.file': 'File',
    'mb.newProject': 'New project …',
    'mb.new': 'New sprite …',
    'np.title': 'New project',
    'np.text': 'All sprites of this project are replaced by an empty one. Your own palettes and settings stay. The current state is kept for safety under Help → Backup.',
    'np.save': 'Save first',
    'np.ok': 'Start afresh',
    'mb.open': 'Open …',
    'mb.save': 'Save project',
    'mb.dir': 'Choose save folder …',
    'mb.export': 'Export …',
    'mb.install': 'Install app',
    'mb.reset': 'Reset everything …',
    'mb.edit': 'Edit',
    'mb.undo': 'Undo',
    'mb.redo': 'Redo',
    'mb.selAll': 'Select all',
    'mb.selNone': 'Deselect',
    'mb.view': 'View',
    'mb.fullscreen': 'Fullscreen',
    'mb.bg': 'Background',
    'mb.bgDark': 'Dark',
    'mb.bgLight': 'Light',
    'mb.lang': 'Language',
    'mb.help': 'Help',
    'mb.helpOpen': 'Help and shortcuts',
    'mb.home': 'Start page',
    'mb.imprint': 'Imprint',
    'mb.privacy': 'Privacy',
    'mb.kOpen': 'Ctrl+O',
    'mb.kSave': 'Ctrl+S',
    'mb.kUndo': 'Ctrl+Z',
    'mb.kRedo': 'Ctrl+Y',
    'mb.kSelAll': 'Ctrl+A',

    // ── Sprite-Panel ──
    'sp.title':       'Sprites',
    'sp.new':         '+ New sprite',
    'sp.search':      'Search sprites…',

    // ── Code & Export ──
    'out.title':        'Code & export',
    'out.format':       'Format',
    'out.copy':         'Copy',
    'out.import':       'Import…',
    'out.clear':        'Clear',
    'out.clearTitle':   'Erase every pixel of this sprite',
    'out.includePal':   'Write the palette into the code',
    'out.scale':        'Scale',
    'out.sheet':        'Spritesheet',
    'out.sheetTitle':   'All sprites in one image — plus a JSON atlas with names and coordinates',
    'out.legend':       'Color key in the image',
    'out.legendTitle':  'Embeds a color key into the image so the color values are not lost',

    // ── Bühne ──
    'stage.undo':       'Undo (Ctrl+Z)',
    // Hilfslinien-Panel (guides.js)
    'gd.title': 'Guides',
    'gd.showTitle': 'Show / hide all guides (G)',
    'gd.lockTitle': 'Locked, the lines cannot be moved — not even with the hand',
    'gd.free': 'Free lines',
    'gd.addH': '+ Horizontal',
    'gd.addHTitle': 'Put a horizontal line in the middle',
    'gd.addV': '+ Vertical',
    'gd.addVTitle': 'Put a vertical line in the middle',
    'gd.clear': 'Delete all',
    'gd.clearTitle': 'Remove all free lines of this sprite',
    'gd.figure': 'Figure — head heights',
    'gd.off': 'Off',
    'gd.h2': '2 heads — chibi',
    'gd.h3': '3 heads — small, cute',
    'gd.h4': '4 heads — compact game character',
    'gd.h6': '6 heads — comic, teenager',
    'gd.h8': '8 heads — classic, heroic',
    'gd.note': 'Drawing aid only — the lines never show up in an export. Drag lines with the hand (H): a head line moves the whole figure, dragging a free line out of the image deletes it. “Lock” holds them all in place.',
    // Ebenen-Panel (layers.js)
    'pv.title': 'Preview',
    'pv.scale': 'Pixel size',
    'pv.scaleTitle': 'How large one pixel is shown in the preview',
    'pv.fit': 'Fit',
    'ly.title': 'Layers',
    'ly.add': 'New layer above the active one',
    'ly.dup': 'Duplicate layer',
    'ly.merge': 'Merge down — in every frame',
    'mask.label': 'Mask',
    'mask.add': 'Add',
    'mask.addTitle': 'Add a mask — hides parts of the layer without deleting them',
    'mask.edit': 'Edit',
    'mask.editTitle': 'Edit the mask: painting hides, erasing reveals again',
    'mask.off': 'Turn the mask off (everything visible)',
    'mask.applyTitle': 'Apply the mask: hidden pixels are deleted, the mask goes away',
    'mask.delTitle': 'Delete the mask — everything visible again',
    'ly.mergeAll': 'Merge all visible layers — in every frame, light and shadow too; hidden ones stay',
    'ly.del': 'Delete layer',
    'ly.opacity': 'Opacity',
    'ly.note': 'Double-click the name to rename, drag to reorder. Export and preview show all visible layers on top of each other.',
    'tl.cels': 'Cels',
    'qp.sortTitle': 'Sort by shades — same hues side by side, dark to light. Pixels are renumbered, the image stays the same. By hand: drag a color onto another slot.',
    'tm.open': 'Timeline settings — position, header, duration, onion skin',
    'tm.title': 'Timeline',
    'tm.close': 'Close',
    'tm.pos': 'Position',
    'tm.top': 'Top',
    'tm.bottom': 'Bottom',
    'tm.left': 'Left',
    'tm.right': 'Right',
    'tm.header': 'Header',
    'tm.first': 'First frame',
    'tm.thumbs': 'Thumbnails',
    'tm.frame': 'Current frame',
    'tm.durNote': 'Leave empty = duration from FPS.',
    'tm.onion': 'Onion skin',
    'tm.mode': 'Display',
    'tm.tint': 'Red/blue',
    'tm.color': 'Colors',
    'tm.opacity': 'Opacity',
    'tm.step': 'Fade',
    'tm.stepTitle': 'How much fainter each farther frame gets',
    'tm.before': 'Frames before',
    'tm.after': 'after',
    'tm.loopTag': 'Loop within the tag',
    'tm.loopTagTitle': 'At the end of a tag its start shows through — for animations that loop',
    'tm.layerOnly': 'Active layer only',
    'tm.where': 'Position',
    'tm.behind': 'Behind the image',
    'tm.front': 'In front',
    'tm.reset': 'Reset',
    'exp.gifTags': 'GIF: one file per tag',
    'exp.gifTagsTitle': 'Instead of one GIF for everything: one per tag, in its direction — e.g. hero_walk.gif, hero_jump.gif',
    'tl.tag': 'New tag — names the selected frames, e.g. “Walk”',
    'tl.ccopy': 'Copy cels (Ctrl+C after a click in the timeline)',
    'tl.cpaste': 'Paste cels at the active cel (Ctrl+V)',
    'tl.cclear': 'Clear cels (Del)',
    'tl.clink': 'Link — the frames share one image per layer',
    'tl.cunlink': 'Unlink — every cel gets its own image',
    // Timeline (frames.js) und GIF-Export
    'tl.first': 'First frame (Home)',
    'tl.prev': 'Previous frame (,)',
    'tl.next': 'Next frame (.)',
    'tl.last': 'Last frame (End)',
    'tl.multi': 'Select several frames — tapping marks instead of switching',
    'tl.play': 'Play / pause (Enter)',
    'tl.frames': 'Frames',
    'tl.add': 'Insert an empty frame after this one',
    'tl.dup': 'Duplicate frame',
    'tl.del': 'Delete frame',
    'tl.go': 'Frame',
    'tl.goTitle': 'Jump to a frame — type its number',
    'tl.onion': 'Onion skin — show the previous (red) and next frame (blue) through',
    'tl.fps': 'FPS',
    'tl.dur': 'Duration',
    'tl.durTitle': 'How long this frame stays — empty = by FPS',
    'exp.gifTitle': 'Animation as GIF — all frames, loops forever',
    'stage.redo':       'Redo (Ctrl+Y)',
    'stage.bgGroup':    'Editor background',
    'stage.bgDark':     'Dark',
    'stage.bgDarkTitle': 'Dark background',
    'stage.bgLight':    'Light',
    'stage.bgLightTitle': 'Light background',
    'stage.zoom':       'Zoom',
    'stage.full':       '⤢ Full screen',
    'stage.fullTitle':  'Full screen (Esc to leave)',

    // ── Werkzeugleiste ──
    'tool.groupPaint':  'Drawing tools',
    'tool.pencil':      'Pencil',
    'tool.pencilTitle': 'Pencil — single pixels (P)',
    'tool.brush':       'Brush',
    'tool.brushTitle':  'Brush — an area; strength = density (B)',
    'tool.spray':       'Spray',
    'tool.sprayTitle':  'Spray — random pixels (S)',
    'tool.fill':        'Fill',
    'tool.fillTitle':   'Fill — flood fill (F)',
    'tool.eraser':      'Eraser',
    'tool.eraserTitle': 'Eraser (E)',
    'tool.wand':        'Magic wand',
    'tool.wandTitle':   'Magic wand — erase a similar area (W)',
    'tool.groupShapes': 'Shapes',
    'tool.line':        'Line',
    'tool.lineTitle':   'Drag a line (I)',
    'tool.rect':        'Rectangle',
    'tool.rectTitle':   'Drag a rectangle (R)',
    'tool.ellipse':     'Ellipse',
    'tool.ellipseTitle': 'Drag an ellipse (O)',
    'tool.groupSelect': 'Selection',
    'tool.groupView':   'View',
    'tool.pan':         'Hand',
    'tool.panTitle':    'Hand — move the view without drawing (H)',
    'tool.marquee':     'Marquee',
    'tool.marqueeTitle': 'Rectangular marquee — drag it open, cut, move (A)',
    'tool.lasso':       'Lasso',
    'tool.lassoTitle':  'Lasso — trace a shape freehand, it closes when you let go (L)',
    'tool.colorSel':    'Color select',
    'tool.colorSelTitle': 'Color select — pick a connected similar area; tolerance decides how much comes along (K)',
    'tool.mirror':      'Symmetry',
    'tool.mirrorX':     'Vertical axis — what appears on the left appears on the right',
    'tool.mirrorY':     'Horizontal axis — top and bottom mirrored',
    'tool.size':        'Size',
    'tool.sizeTitle':   'Size of brush, eraser and spray — or Alt + right-drag',
    'tool.strength':    'Strength',
    'tool.tolerance':   'Tolerance',
    'tool.shapeFill':   'Filled',
    'tool.pixelPerfect': 'Clean Stroke',
    'tool.pixelPerfectTitle': 'As in well-known pixel art tools: removes the doubled corner pixels at stair steps while drawing — clean 1-pixel lines (pencil, eraser at size 1)',
    'tool.shapeFillTitle': 'Draw rectangle and ellipse filled instead of outlined',
    'tool.selLabel':    'Selection',
    'tool.selAll':      'All',
    'tool.selAllTitle': 'Select all (Ctrl+A)',
    'tool.selCut':      'Cut',
    'tool.selCutTitle': 'Cut (Ctrl+X)',
    'tool.selCopy':     'Copy',
    'tool.selCopyTitle': 'Copy (Ctrl+C)',
    'tool.selPaste':    'Paste',
    'tool.selPasteTitle': 'Paste (Ctrl+V)',
    'tool.selFill':     'Fill',
    'tool.selFillTitle': 'Fill the selection with the current color',
    'tool.selDelete':   'Erase',
    'tool.selDeleteTitle': 'Erase the selection (Del)',
    'tool.selNone':     'Deselect',
    'tool.selNoneTitle': 'Drop the selection (Esc)',
    'tool.quickPal':    'Quick color picker',

    // ── Farb-Panel ──
    'pal.title':        'Palette',
    'pal.builtin':      'built-in',
    'pal.currentTitle': 'Click to open the free color picker',
    'pal.current':      'Current color',
    'pal.freePicker':   'Pick a free color',
    'pal.select':       'Choose a palette',
    'pal.edit':         'Edit the palette',
    'pal.del':          'Delete the palette',
    'pal.search':       'Search palettes…',
    'pal.add':          '+ Palette',
    'pal.addTitle':     'Create a new custom palette',
    'pal.fork':         'Edit a copy',
    'pal.forkTitle':    'Copy this built-in palette into a custom one — then it can be edited',
    'pal.fromImage':    'Image → palette …',
    'pal.fromImageTitle': 'Turn the colors of the current image into a palette — you choose how many',
    'pal.use':          'Use for sprite',
    'pal.useTitle':     'The sprite gets this palette — the drawing keeps its look',
    'pal.recolor':      'Recolor sprite',
    'pal.recolorTitle': 'Every pixel takes the colors of this palette — Ctrl+Z undoes it',
    'red.title':        'Image → palette',
    'red.colors':       'Colors in the palette',
    'red.before':       'Before',
    'red.apply':        'Create palette',

    // ── Schablone ──
    'tpl.title':        'Stencil',
    'tpl.opacity':      'Opacity',
    'tpl.size':         'Size',
    'tpl.center':       'Center',
    'tpl.clear':        'Remove',
    'tpl.traceHead':    'Copy onto the grid',
    'tpl.trace':        'Palette colors',
    'tpl.traceTitle':   'Copy the stencil onto the grid — each color becomes the closest color of your palette',
    'tpl.traceRaw':     'Original colors',
    'tpl.traceRawTitle': 'Copy the stencil onto the grid — with the exact colors from the image',
    'tpl.reduce':       'Reduce to',
    'tpl.colors':       'colors',
    'tpl.apply':        'Apply',
    'tpl.applyTitle':   'Copy the stencil onto the grid — reduced to this many main tones first',

    // ── Bild-Panel ──
    'img.title':        'Image',
    'img.note':         'With a selection, flip and rotate act only on it — otherwise on the whole sprite.',
    'img.flipH':        '↔ Flip',
    'img.flipHTitle':   'Flip horizontally',
    'img.flipV':        '↕ Flip',
    'img.flipVTitle':   'Flip vertically',
    'img.rot90Title':   'Rotate 90° clockwise',
    'img.rotFree':      'Free rotate',
    'img.rotFreeTitle': 'Any angle — with a selection, only the selection turns',
    'img.rotApply':     'Apply',
    'img.rotApplyTitle': 'Apply the angle (Enter)',
    'img.rotCancel':    'Discard',
    'img.rotCancelTitle': 'Back to 0° (Esc)',
    'img.trim':         'Trim',
    'img.trimTitle':    'Cut away the empty border all around',
    'img.center':       'Center',
    'img.centerTitle':  'Move the content to the middle',
    'img.size':         'Size',
    'img.width':        'Width in pixels — maths works too, e.g. 24 * 4',
    'img.height':       'Height in pixels — maths works too, e.g. 24 * 4',
    'img.anchorTitle':  'Where the old content ends up',
    'img.anchorCenter': 'centered',
    'img.anchorTopLeft': 'top left',
    'img.resize':       'Apply',
    'img.scale':        'Scale',
    'img.scaleUpTitle': 'Double the size (pixels stay hard)',
    'img.scaleDownTitle': 'Halve the size — detail is lost',

    // ── Aufräumen ──
    'cln.title':        'Cleanup',
    'cln.bg':           'Background',
    'cln.bgRemove':     'Remove background',
    'cln.bgRemoveTitle': 'Erase connected, similarly colored areas starting from the image border',
    'cln.despeckle':    'Despeckle',
    'cln.despeckleTitle': 'Set stray single pixels to the majority color of their neighbors',
    'cln.outline':      'Outline',
    'cln.outlineColor': 'Outline color',
    'cln.outlineThick': 'Edge thickness',
    'cln.outlineApply': 'Apply',

    // ── Reiter ──
    'tabs.label':       'Open sprites',
    'tabs.new':         'New sprite',

    // ── Licht ──
    'lgt.title':        'Light',
    'lgt.dir':          'Light source',
    'lgt.dirTitle':     'Where the light comes from',
    'lgt.dirNW':        'Light from the top left',
    'lgt.dirN':         'Light from above',
    'lgt.dirNE':        'Light from the top right',
    'lgt.dirW':         'Light from the left',
    'lgt.dirE':         'Light from the right',
    'lgt.dirSW':        'Light from the bottom left',
    'lgt.dirS':         'Light from below',
    'lgt.dirSE':        'Light from the bottom right',
    'lgt.amount':       'Strength',
    'lgt.width':        'Width',
    'lgt.widthTitle':   'How many pixels from the edge get lit or shaded',
    'lgt.highlight':    'Light edge (brighter)',
    'lgt.shadow':       'Shadow edge (darker)',
    'lgt.free':         'Allow colors outside the palette',
    'lgt.freeTitle':    'If the palette has no matching lighter or darker color, compute a free color — otherwise the pixel stays as it is',
    'lgt.commit':       'Apply as layer',
    'lgt.commitTitle':  'Adds light (and, if ticked, shadow) as separate layers — the original stays untouched. Afterwards every change here recomputes the layers right away',
    'lgt.previewNote':  'Preview — nothing in the image has changed yet.',
    'lgt.stale':        'The figure has changed since.',
    'lgt.redo':         'Recompute',
    'lgt.cast':         'Drop shadow',
    'lgt.castColor':    'Shadow color',
    'lgt.castDist':     'How far the shadow falls',

    // ── Modal: neuer Sprite ──
    'mod.newTitle':     'New sprite',
    'mod.name':         'Name',
    'mod.namePh':       'e.g. hero, tree, icon',
    'mod.palette':      'Color palette',
    'mod.size':         'Size',
    'mod.sizeCustom':   'custom size …',
    'mod.sizeCustomLabel': 'Width × height',
    'mod.template':     'Template <span class="form-note">(optional — a copy of an existing sprite)</span>',
    'mod.cancel':       'Cancel',
    'mod.create':       'Create',

    // ── Modal: umbenennen ──
    'mod.renameTitle':  'Rename sprite',
    'mod.renameSave':   'Save',

    // ── Modal: Grid-Größe ──
    'mod.sizeTitle':    'Change grid size',
    'mod.sizeWidth':    'Width',
    'mod.sizeHeight':   'Height',
    'mod.sizeAnchor':   'Anchor',
    'mod.sizeNote':     'Only the canvas grows or shrinks — the pixels keep their size. Anything that no longer fits is cut off.',
    'mod.sizeSave':     'Change',

    // ── Modal: Palette ──
    'mod.palTitle':     'New palette',
    'mod.palNamePh':    'e.g. neon, pastel, dark',
    'mod.palSource':    'Base <span class="form-note">(take over its colors)</span>',
    'mod.palColors':    'Colors',
    'mod.palAdd':       '+ Color',
    'mod.palRemove':    '− Last',

    // ── Modal: Import ──
    'mod.impTitle':     'Import a sprite',
    'mod.impIntro':     'Pick a file or paste text — the editor reads <b>every format it also writes</b>. The format is recognised from the content, the file extension does not matter.',
    'mod.impIntro2':    'TypeScript, JavaScript, JSON, JSON (game), Python and C header carry the color numbers along and come back unchanged. SVG, CSS and the text grid know no numbers — there the picture stays the same but the colors are renumbered.',
    'mod.impFile':      'Choose a file',
    'mod.impPh':        'Paste here — for example:\n\nexport const HERO: number[][] = [\n  [0,1,2],\n];\n\n… or an SVG, a box-shadow block, a C header\nor a text grid.',
    'mod.impUsePal':    'Take the palette from the file and assign it to the sprite',
    'mod.impCurrent':   'Into current sprite',
    'mod.impCurrentTitle': 'Replaces the current sprite with all its frames and layers — Ctrl+Z brings it back',
    'mod.impNew':       'As a new sprite',

    // ── Bestätigungs-Toast ──
    'mod.confirmCancel': 'Cancel',
    'mod.confirmOk':     'Delete',

    // ── Hilfe-Modal ──
    'help.title':   'Help',
    'help.close':   'Close',
    'help.intro':   'A pixel editor for sprites, animations and game levels. Draw freehand — with layers, frames, light and tiles — or trace a photo as a <b>stencil</b> and have it turned into a clean sprite automatically.',

    'help.h.workspace': 'Workspace: tabs and panels',
    'help.workspace': ''
      + '<div>The <b>tabs</b> above the drawing area show the open sprites — click to switch, <b>×</b> closes the tab (the sprite stays in the list), <b>+</b> creates a new one.</div>'
      + '<div>Every panel lives in the <b>dock</b> at the edge and opens as a drawer. In the panel head the <b>pin</b> fixes it in the column next to it, the <b>window</b> icon lets it float freely. Grab the head and drag to put it somewhere else.</div>'
      + '<div>Tools, color bar and timeline can be pinned the same way at the top, bottom or side — at the side they stack like panels.</div>'
      + '<div>Size fields can do maths: <code>24 * 4</code>, <code>24x4</code>, <code>(16+8)*2</code> or <code>96 : 4</code> — leaving the field puts the result in.</div>'
      + '<div><b>Fullscreen</b> hides everything but the drawing area; the handles at the edge bring the bars back.</div>',

    'help.h.light': 'Light and shadow',
    'help.light': ''
      + '<div>The <b>Light</b> panel: choose where the light comes from (8 directions), strength and width of the light and shadow edge — optionally with a <b>cast shadow</b> in its own color and distance.</div>'
      + '<div>While the panel is open the drawing area shows a <b>preview</b>. <b>Apply as layer</b> creates light and shadow as separate, locked layers above and below the figure — for all frames; the original stays untouched.</div>'
      + '<div>After that every change in the panel recomputes the layers right away. If you keep painting the figure, <b>Recompute</b> appears. Taking it away in places works with a mask on the light layer.</div>'
      + '<div><i>Allow colors outside the palette</i>: if no fitting lighter or darker palette color exists, a free color is computed.</div>',

    'help.h.tiles': 'Tiles (tilemaps)',
    'help.tiles': ''
      + '<div>For game levels and patterns: a <b>tilemap layer</b> is made of tiles of a fixed size (8–64 px). Each tile is stored once in the layer’s tileset — paint it and it changes <b>everywhere</b> it is placed, in other frames too.</div>'
      + '<div>The <b>Tiles</b> panel: <b>New tilemap layer</b> or <b>Convert active layer</b> (identical spots become one tile). A blue grid shows the tiles; the edge that fits no whole tile is darkened.</div>'
      + '<div><b>Paint pixels</b>: paint the tiles with every tool. <i>Auto</i> creates a new tile when you paint into an empty cell, <i>Manual</i> only changes existing ones.</div>'
      + '<div><b>Place tiles</b>: pick a tile in the list — the pencil then places it in the grid, eraser or right-click clears a cell, fill fills an area, <span class="kbd">Alt</span>+click picks the tile under the pointer.</div>'
      + '<div><b>Remove unused</b> tidies the tileset, <b>Normal layer</b> turns it back into an ordinary layer (the pixels stay).</div>'
      + '<div><b>Export for Godot</b>: tile image (PNG), a <code>.tscn</code> scene with one <code>TileMapLayer</code> per tilemap layer and a JSON for other engines. Put the folder into your Godot project and open the scene (Godot 4.3 or newer). The current frame is exported.</div>',

    'help.h.palettes': 'Color palettes',
    'help.palettes': ''
      + '<div>A palette maps <b>index → color</b>. <b>0</b> is always transparent, <b>1–9</b> are yours to fill.</div>'
      + '<div>Convention (not a rule): <b>1–4</b> a ramp from light to dark, <b>5</b> the outline, <b>6–9</b> accents.</div>'
      + '<div>Every sprite remembers its own palette. Changing a color recolors every pixel with that index at once.</div>'
      + '<div>Built-in palettes are read-only — <b>Edit a copy</b> turns one into an editable palette of your own.</div>',

    'help.h.tools': 'Tools',
    'help.tools': ''
      + '<div><b>Pencil</b> — single pixels.</div>'
      + '<div><b>Brush</b> — an area; <i>strength</i> = density, <i>size</i> = edge length.</div>'
      + '<div><b>Spray</b> — random pixels; <i>strength</i> = amount per event.</div>'
      + '<div><b>Size</b> 1–64 with the slider or number field; <span class="kbd">Alt</span> + right-drag changes it right on the drawing area. An outline shows what brush, eraser and spray are about to hit.</div>'
      + '<div><b>Clean Stroke</b> — with the pencil (and the eraser at size 1) the L-shaped corners of a freehand line disappear: clean 1-pixel lines as if placed by hand.</div>'
      + '<div><b>Fill</b> — the connected area of the same value. With <b>Edges: all layers</b> the area ends wherever something changes in the visible image — the paint still goes into the active layer. That way you colour in a template (e.g. outlines on a layer of their own) area by area without touching it.</div>'
      + '<div><b>Eraser</b> — sets pixels back to transparent.</div>'
      + '<div><b>Magic wand</b> — erases a connected <i>similar</i> area; <i>tolerance</i> decides how much deviation still counts.</div>'
      + '<div><b>Line · Rectangle · Ellipse</b> — drag it open, the preview shows the result, letting go draws it. <i>Filled</i> switches between outline and area. With <span class="kbd">Shift</span> the line snaps to 0°, 45° and 90°, rectangle and ellipse become square and circle.</div>'
      + '<div><b>Straight strokes</b>: hold <span class="kbd">Shift</span> and paint — the stroke goes only horizontal, vertical or at 45°. The direction locks after a few pixels and stays until you let go; pressed mid-stroke, the straight line starts there.</div>'
      + '<div><b>Marquee · Lasso · Color select</b> — three ways to the same thing: an area you move as a whole.</div>'
      + '<div><b>Hand</b> — moves the view only and changes nothing in the image; on a guide it drags the line. The same panning works any time by holding <span class="kbd">Space</span>.</div>',

    'help.h.mirror': 'Symmetry',
    'help.mirror': ''
      + '<div>The two buttons <b>↔</b> and <b>↕</b> in the toolbar mirror every stroke across the center axis — both together give four mirrored strokes.</div>'
      + '<div>Applies to pencil, brush, spray, fill and the shapes. The axes are shown as dashed lines.</div>',

    'help.h.selection': 'Selection: cut and move',
    'help.selection': ''
      + '<div><b>Marquee</b> (<span class="kbd">A</span>) drags a rectangle open.</div>'
      + '<div><b>Lasso</b> (<span class="kbd">L</span>) traces a free shape; letting go closes it and everything inside belongs to it — even with a wobbly line.</div>'
      + '<div><b>Color select</b> (<span class="kbd">K</span>) takes the connected similar area under the click; <i>tolerance</i> decides how much comes along.</div>'
      + '<div>Grab inside the selection and drag → the area is <b>cut out</b> and <b>floats</b>. It stays in the air until you set it down — until then you can move, rotate and flip it as often as you like without damaging anything underneath.</div>'
      + '<div>It is <b>set down</b> when you deselect (<span class="kbd">Esc</span>), on a new selection, when you switch tool or sprite — or automatically when the tab closes.</div>'
      + '<div><span class="kbd">Alt</span>+drag leaves the original in place — you move a <b>copy</b>.</div>'
      + '<div><b>Pasting into another sprite</b>: if it has a different palette, the <i>colours</i> are carried over — the paste looks like the original. Colours that are not there come in as free colours. <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">V</span> keeps the numbers instead (the new palette then recolours it).</div>'
      + '<div><b>Scale</b>: drag one of the eight handles on the frame — corners change width and height, edges only one; with <span class="kbd">Shift</span> the aspect ratio stays. Pixels stay sharp (nearest neighbour), and every size is computed from the original: shrinking and growing again loses nothing.</div>'
      + '<div>Fine work with the <b>arrow keys</b>: one pixel per press. <b>Fill</b> paints the whole selection in the current color.</div>'
      + '<div>Setting down only overwrites with filled pixels; transparent spots leave what is underneath alone.</div>'
      + '<div>Whatever is pushed past the edge is lost — <span class="kbd">Ctrl</span>+<span class="kbd">Z</span> brings it all back.</div>'
      + '<div>A click next to the selection (or <span class="kbd">Esc</span>) drops it.</div>',

    'help.h.image': 'Image',
    'help.image': ''
      + '<div><b>Flip</b> and <b>rotate</b> act on the selection if there is one — otherwise on the whole sprite. The badge in the panel says which.</div>'
      + '<div><b>Trim</b> cuts the empty border away, <b>Center</b> moves the content into the middle.</div>'
      + '<div><b>Size</b> changes the canvas without scaling; the anchor decides where the old content ends up.</div>'
      + '<div><b>×2 / ÷2</b> scales hard (nearest neighbor) — pixels stay pixels, halving drops every second one.</div>'
      + '<div><b>Free rotate</b> takes any angle. The slider shows a preview; <b>Apply</b> (<span class="kbd">Enter</span>) commits it, <b>Discard</b> (<span class="kbd">Esc</span>) goes back to 0°.</div>'
      + '<div>Every preview is computed from the <i>original</i>, not from the last rotated result — so pulling the slider three times does not smear the shape.</div>'
      + '<div>With a selection the frame grows along so nothing gets cut off. On the whole sprite the canvas stays the same size and corners outside it fall away.</div>',

    'help.h.guides': 'Guides',
    'help.guides': ''
      + '<div>The <b>Guides</b> panel in the dock — a drawing aid only, they never show up in an export. <span class="kbd">G</span> shows and hides them all.</div>'
      + '<div><b>Free lines</b>: “+ Horizontal” / “+ Vertical” puts a line in the middle, <b>Evenly</b> spreads a typed number of lines evenly right away (4 lines = 5 equal parts). With the <b>hand</b> tool (<span class="kbd">H</span>) you drag lines into place on the drawing area (always on a pixel edge); dragged out of the image, a line is deleted. <b>Lock</b> holds all lines in place.</div>'
      + '<div><b>Figure</b>: divides a figure into 2 (chibi), 3, 4, 6 or 8 head heights and marks chin, chest, hip, knee etc. plus the body axis. With the hand, top and bottom change its size, a head line in between moves the whole figure.</div>'
      + '<div><b>Own layouts</b>: save lines and division under a name and apply them to any sprite — for another size they are scaled proportionally. The same name replaces, × deletes. Layouts apply to all sprites.</div>'
      + '<div>The lines belong to the sprite and are saved with the project.</div>',
    'help.preview': ''
      + '<div>The <b>preview</b> panel always shows the <b>whole sprite</b>, however far you are zoomed in on the canvas — no grid, no guides, exactly what the export gives you.</div>'
      + '<div>It redraws with every stroke and plays the animation along. As a drawer it closes when you click the canvas — <b>pin it</b> (the pin in the panel head) and it stays open while you draw.</div>'
      + '<div><b>Pixel size</b>: <i>fit</i> uses the room the panel has; <b>1×</b> shows the sprite at its real size — the way it will look in a game.</div>',
    'help.h.layers': 'Layers',
    'help.layers': ''
      + '<div>Every sprite can have several <b>layers</b> — the <b>Layers</b> panel in the dock and the rows of the timeline. You always paint into the <b>active</b> layer; all visible ones are shown on top of each other, the top one in the list lies on top.</div>'
      + '<div>The <b>eye</b> hides, the <b>padlock</b> locks — nothing gets painted into a locked or hidden layer. The slider sets the <b>opacity</b>, double-click the name to rename, drag to reorder.</div>'
      + '<div><b>+</b> adds an empty layer, next to it duplicate, <b>merge down</b>, <b>merge all visible</b> and delete — each in every frame.</div>'
      + '<div><b>Mask</b>: hides parts of a layer without deleting them (for all frames). In <i>edit mask</i> mode every tool paints into the mask — painting hides, erasing reveals again, hidden parts show reddish. The mask can be switched off and on, <b>applied</b> (deletes the hidden pixels) or deleted.</div>'
      + '<div>Each layer has its own picture in every frame. What gets exported is what you see: all visible layers merged, masks included. Semi-transparent layers are mixed with the color below.</div>',
    'help.h.anim': 'Animation — frames',
    'help.anim': ''
      + '<div>Every sprite can have several <b>frames</b>. The <b>timeline</b> is a grid: one row per layer, one column per frame. Clicking a cel picks frame and layer; the frames in the header can be dragged. <b>+</b> inserts an empty frame, next to it duplicate and delete.</div>'
      + '<div>On the left of every row: eye, padlock and name of the layer, drag to reorder. <b>Continuous</b> makes new frames share the previous picture on this layer — good for backgrounds.</div>'
      + '<div><b>Cels</b>: <span class="kbd">Shift</span>+click or dragging spans a range; dragging inside the range moves the cels (<span class="kbd">Ctrl</span>: copies). Copy, paste and clear work with the buttons or with <span class="kbd">Ctrl</span>+<span class="kbd">C</span> / <span class="kbd">V</span> and <span class="kbd">Del</span>.</div>'
      + '<div><b>Link</b>: the selected frames share one picture per layer — paint in one and all of them change. <b>Unlink</b> gives every cel its own picture again.</div>'
      + '<div><b>Tags</b> name a section, e.g. “Walk”: select frames, then <b>New tag</b>. Clicking the tag sets name, frames and direction (forward, reverse, ping-pong) and plays it; GIFs can be exported per tag.</div>'
      + '<div>Several frames: <span class="kbd">Ctrl</span>+click picks single ones, <span class="kbd">Shift</span>+click a range. On a phone <b>Select several</b> turns on selection mode. The <b>frame</b> field jumps to a typed number.</div>'
      + '<div>▶ plays (<span class="kbd">Enter</span>), a tap on the area stops it. <b>FPS</b> applies to the whole sprite, <b>duration</b> lets single frames stay longer (e.g. a blink). <b>Onion skin</b> lets the neighboring frames show through; count, strength and display are in the timeline’s ⚙ menu — where you also set where the timeline docks.</div>'
      + '<div>Resizing, rotating, flipping, trimming and recoloring with a palette act on <b>all frames</b>. You always draw into the active cel.</div>'
      + '<div>Export: <b>GIF</b> loops the animation, the <b>spritesheet</b> lays the frames side by side, and every code format carries all frames with their duration.</div>',

    'help.h.stencil': 'Stencil',
    'help.stencil': ''
      + '<div>Load an image, move it with <span class="kbd">Shift</span>+<span class="kbd">Alt</span>+left-drag, set opacity and size with the sliders.</div>'
      + '<div>Hold <span class="kbd">Shift</span>+<span class="kbd">Alt</span> → the stencil comes fully to the front.</div>'
      + '<div><span class="kbd">Shift</span>+<span class="kbd">Alt</span>+right-click → stencil eyedropper (the exact color from the image).</div>'
      + '<div>Survives a reload.</div>',

    'help.h.photo': 'Photo → sprite',
    'help.photo': ''
      + '<li>Load the photo as a stencil and place it over the grid</li>'
      + '<li>Apply <b>Reduce to ~8 colors</b></li>'
      + '<li><b>Image → palette</b> — the colors become an editable palette</li>'
      + '<li><b>Remove background</b> (or the magic wand)</li>'
      + '<li><b>Despeckle</b>, then <b>Outline</b> on top</li>'
      + '<li>Clean up the rest by hand with pencil and eraser</li>',

    'help.h.io': 'Import & export',
    'help.io': ''
      + '<div><b>Import</b> reads every format the editor writes, from text or file — with all frames. A palette that comes with it is created as a palette of your own and assigned.</div>'
      + '<div>The <b>code box</b> produces the export in the chosen <b>format</b>, for animations with all frames. Free eyedropper colors are kept as indices above the palette — the round trip is lossless.</div>'
      + '<div class="help-formats">'
      +   '<div><b>TypeScript</b> / <b>JavaScript</b> — <code>number[][]</code> plus palette, with or without types.</div>'
      +   '<div><b>JSON</b> — language-neutral, for your own pipelines, engines and tools.</div>'
      +   '<div><b>JSON (game)</b> — a flat <code>data</code> array plus a palette with a material per color, versioned — for game engines (e.g. C#).</div>'
      +   '<div><b>SVG</b> — a ready vector graphic, scales losslessly; runs of the same color side by side are merged into one rectangle.</div>'
      +   '<div><b>CSS</b> — the sprite as a <code>box-shadow</code> on a single element, with no image file at all.</div>'
      +   '<div><b>C header</b> — <code>uint8</code> indices plus a <code>uint32</code> palette for microcontrollers and LED matrices.</div>'
      +   '<div><b>Python</b> — dict and list for Pygame, Pillow or your own scripts.</div>'
      +   '<div><b>Text grid</b> — one character per pixel with a key; handy for diffs and docs.</div>'
      + '</div>'
      + '<div><b>PNG / PDF</b> export the current frame with transparency; with <i>color key</i> the palette is rendered into the image. <b>GIF</b> holds the whole animation.</div>'
      + '<div>With <b>several frames selected</b> in the timeline (Ctrl/Shift+click), PNG and PDF save <b>one file per frame</b> — numbered <code>name_f01.png</code>, <code>name_f02.png</code> … The GIF then holds just those frames, so you can cut out a section without deleting anything.</div>'
      + '<div><b>Spritesheet</b> packs all sprites into equally sized cells — for animations one row per sprite with all its frames — and drops a JSON atlas with names, coordinates and duration next to it. Engines read that straight away.</div>'
      + '<div><b>Tiles</b>: “Export for Godot” in the Tiles panel writes tile image, scene and JSON (see Tiles).</div>'
      + '<div><b>Desktop app</b>: spritebit is also a program for Windows (download on the start page). It reads and writes the same project files.</div>'
      + '<div><b>Save project / Open</b> writes all sprites and palettes into one JSON file.</div>',

    'help.h.keys': 'Keyboard shortcuts',
    'help.keys': ''
      + '<div class="sc-row"><b>Click</b><span>Draw</span></div>'
      + '<div class="sc-row"><b>Right-click</b><span>Erase (hold for continuous)</span></div>'
      + '<div class="sc-row"><b>Alt + click</b><span>Eyedropper on the grid</span></div>'
      + '<div class="sc-row"><b>Shift + paint</b><span>Only horizontal, vertical or 45° · for shapes: snap, square, circle</span></div>'
      + '<div class="sc-row"><b>Alt + right-drag</b><span>Size of brush, eraser and spray</span></div>'
      + '<div class="sc-row"><b>Hold Shift + Alt</b><span>Stencil to the front</span></div>'
      + '<div class="sc-row"><b>Alt + click (place tiles)</b><span>Pick a tile</span></div>'
      + '<div class="sc-row"><b>Ctrl + C / V (in the timeline)</b><span>Copy / paste cels</span></div>'
      + '<div class="sc-row"><b>Shift + Alt + drag</b><span>Move the stencil</span></div>'
      + '<div class="sc-row"><b>Shift + Alt + right-click</b><span>Stencil eyedropper</span></div>'
      + '<div class="sc-row"><b>0 – 9</b><span>Pick a color index</span></div>'
      + '<div class="sc-row"><b>P B S F E W</b><span>Pencil · Brush · Spray · Fill · Eraser · Magic wand</span></div>'
      + '<div class="sc-row"><b>I R O</b><span>Line · Rectangle · Ellipse</span></div>'
      + '<div class="sc-row"><b>A L K</b><span>Marquee · Lasso · Color select</span></div>'
      + '<div class="sc-row"><b>H</b><span>Hand — move the view without drawing</span></div>'
      + '<div class="sc-row"><b>Mouse wheel</b><span>Scroll up / down</span></div>'
      + '<div class="sc-row"><b>Shift + mouse wheel</b><span>Scroll left / right</span></div>'
      + '<div class="sc-row"><b>Ctrl + mouse wheel</b><span>Zoom (towards the pointer)</span></div>'
      + '<div class="sc-row"><b>Space + drag</b><span>Pan the image (middle mouse button works too)</span></div>'
      + '<div class="sc-row"><b>Drag inside the selection</b><span>Cut the area out and move it</span></div>'
      + '<div class="sc-row"><b>Alt + drag</b><span>Move a copy (the original stays)</span></div>'
      + '<div class="sc-row"><b>Drag a handle</b><span>Scale the selection (Shift: keep aspect ratio)</span></div>'
      + '<div class="sc-row"><b>Arrow keys</b><span>Nudge the selection pixel by pixel</span></div>'
      + '<div class="sc-row"><b>Ctrl + A / C / X / V</b><span>All · Copy · Cut · Paste</span></div>'
      + '<div class="sc-row"><b>Ctrl + Shift + V</b><span>Paste with the numbers instead of the colours (other palette)</span></div>'
      + '<div class="sc-row"><b>Del</b><span>Erase the selection</span></div>'
      + '<div class="sc-row"><b>Enter</b><span>Apply the rotation · otherwise play / pause the animation</span></div>'
      + '<div class="sc-row"><b>Home / End</b><span>First / last frame</span></div>'
      + '<div class="sc-row"><b>, / .</b><span>Previous / next frame</span></div>'
      + '<div class="sc-row"><b>G</b><span>Guides on / off</span></div>'
      + '<div class="sc-row"><b>Two fingers</b><span>Zoom and pan (touch)</span></div>'
      + '<div class="sc-row"><b>Ctrl + Z</b><span>Undo</span></div>'
      + '<div class="sc-row"><b>Ctrl + Y</b><span>Redo</span></div>'
      + '<div class="sc-row"><b>Ctrl + S</b><span>Save project</span></div>'
      + '<div class="sc-row"><b>Ctrl + O</b><span>Open project</span></div>'
      + '<div class="sc-row"><b>F1</b><span>Help</span></div>'
      + '<div class="sc-row"><b>Esc</b><span>Deselect, close a dialog or leave full screen</span></div>',
  },
};

// ════════════════════════════════════════════════════════════════════
// MSG — Laufzeit-Texte (alles, was JS erzeugt)
// ════════════════════════════════════════════════════════════════════
const MSG = {
  de: {
    'tl.pasteFree':   'Zellen eingefügt mit den Farben des Originals — {n} Farben gibt es in dieser Palette nicht, sie sind als freie Farben drin.',
    'tl.pasteMapped': 'Zellen eingefügt mit den Farben des Originals — die Nummern wurden an diese Palette angepasst.',
    'sel.pasteFree':   'Eingefügt mit den Farben des Originals — {n} davon gibt es in dieser Palette nicht, sie sind als freie Farben drin (Bild → Palette holt sie in die Palette). Strg+Umschalt+V übernimmt stattdessen die Nummern.',
    'sel.pasteMapped': 'Eingefügt mit den Farben des Originals — {n} Farben haben in dieser Palette eine andere Nummer und wurden umgerechnet. Strg+Umschalt+V übernimmt stattdessen die Nummern.',
    'info.scale': 'Skalieren — Umschalt hält das Seitenverhältnis',
    'gd.layoutNone':     'noch keine gespeichert',
    'gd.layoutNeedName': 'Erst einen Namen für das Layout eingeben.',
    'gd.layoutSaved':    'Layout „{name}“ gespeichert — gilt für alle Sprites.',
    'gd.layoutReplaced': 'Layout „{name}“ ersetzt.',
    'gd.layoutApplied':  'Layout „{name}“ angewendet.',
    'gd.layoutScaled':   'Layout „{name}“ angewendet — von {w} × {h} auf diese Größe umgerechnet.',
    'gd.layoutDeleted':  'Layout „{name}“ gelöscht.',

    // ── Kacheln (tilemap.js) ──
    'tile.picked':      'Kachel {k} aufgenommen.',
    'tile.pickedEmpty': 'Hier liegt keine Kachel.',
    'tile.pick':        'Erst eine Kachel in der Liste wählen.',
    'tile.noneYet':     'Noch keine Kacheln — im Modus „Pixel malen“ in eine leere Zelle malen.',
    'tile.layerName':   'Tilemap {n}',
    'tile.converted':   'In Kacheln zerlegt: {n} verschiedene Kacheln.',
    'tile.unmapped':    'Wieder eine normale Ebene — die Pixel sind geblieben.',
    'tile.pruned':      '{n} unbenutzte Kacheln entfernt.',
    'tile.prunedNone':  'Alle Kacheln werden benutzt.',
    'tile.rest':        'Tilemap angelegt. Der Sprite ist kein Vielfaches von {tw} × {th} — der dunkle Rand gehört zu keiner Kachel.',
    'tile.created':     'Tilemap angelegt — einfach losmalen, jede bemalte Zelle wird eine Kachel.',
    'tile.exportNone':  'Keine Tilemap-Ebene mit Kacheln zum Exportieren.',
    'tile.exported':    '{name} gespeichert — den Ordner „{folder}“ ins Godot-Projekt entpacken und die .tscn öffnen.',
    'tile.exportedDl':  '(im Download-Ordner)',
    'tile.info':        '{tw} × {th} px · {n} Kacheln · Raster {cols} × {rows}',
    'tile.hintTiles':   'Stift setzt die gewählte Kachel, Radierer oder Rechtsklick leert, Füllen füllt, Alt + Klick nimmt eine Kachel auf.',
    'tile.hintAuto':    'Malen ändert die Kachel überall, wo sie liegt. Wer in eine leere Zelle malt, legt eine neue Kachel an.',
    'tile.hintManual':  'Malen ändert die Kachel überall, wo sie liegt. Leere Zellen bleiben leer — es entstehen keine neuen Kacheln.',
    'tile.item':        'Kachel {k} — zum Setzen wählen',
    'tile.blocked':     'Manuell: in leere Zellen wird nicht gemalt (dafür „Auto“ wählen).',

    // Palette-Beschriftungen
    'color.label.0': 'Transparent',
    'color.label.1': 'Ton 1 — hellster',
    'color.label.2': 'Ton 2',
    'color.label.3': 'Ton 3',
    'color.label.4': 'Ton 4 — dunkelster',
    'color.label.5': 'Outline / Kontur',
    'color.label.6': 'Akzent A',
    'color.label.7': 'Highlight',
    'color.label.8': 'Akzent B',
    'color.label.9': 'Akzent C',
    'color.short.0': 'Transparent',
    'color.short.1': 'Ton 1',
    'color.short.2': 'Ton 2',
    'color.short.3': 'Ton 3',
    'color.short.4': 'Ton 4',
    'color.short.5': 'Outline',
    'color.short.6': 'Akzent A',
    'color.short.7': 'Highlight',
    'color.short.8': 'Akzent B',
    'color.short.9': 'Akzent C',
    'color.labelN':  'Farbe {i}',

    // Wirkungsbereich
    'scope.sprite':    'Sprite',
    'scope.selection': 'Auswahl',

    // Werkzeug-/Formnamen in der Statuszeile
    'shape.line':    'Linie',
    'shape.rect':    'Rechteck',
    'shape.ellipse': 'Ellipse',

    // Sprite-Liste
    'list.empty':        'Noch keine Sprites. Leg oben einen an.',
    'list.noMatch':      'Kein Sprite passt zu „{q}“.',
    'list.cardTitle':    '{name} — {w}×{h}, Palette „{palette}“',
    'list.rename':       'Umbenennen',
    'list.resize':       'Grid-Größe ändern',
    'list.duplicate':    'Duplizieren',
    'list.delete':       'Löschen',
    'list.noSprite':     'Kein Sprite',
    'list.copySuffix':   ' Kopie',
    'list.defaultName':  'Sprite 1',
    'list.namePrefix':   'Sprite ',

    // Panels
    'panel.expand':   'Aufklappen',
    'panel.collapse': 'Zuklappen',

    // Farb-Panel
    'pal.origin.custom':   'eigene',
    'pal.origin.builtin':  'eingebaut',
    'pal.hint.custom':     'Doppelklick auf eine Farbe ändert sie — Bilder mit dieser Palette färben sich mit.',
    'pal.statusActive_one':    'Dein Sprite nutzt diese Palette · {n} Farbe',
    'pal.statusActive_other':  'Dein Sprite nutzt diese Palette · {n} Farben',
    'pal.statusPreview_one':   'Vorschau · {n} Farbe — dein Sprite nutzt „{name}“',
    'pal.statusPreview_other': 'Vorschau · {n} Farben — dein Sprite nutzt „{name}“',
    'pal.swInfo':          '{i} · {label} · {hex}',
    'pal.swEdit':          'Klick: damit malen · Doppelklick: Farbe ändern',
    'pal.swPick':          'Klick: damit malen',
    'pal.miniTitle':       '{i} · {hex}',
    'pal.moreCount':       '+{n}',
    'pal.moreTitle':       'Alle {n} Farben im Paletten-Panel zeigen',
    'pal.assigned':        'Dein Sprite nutzt jetzt „{name}“ — die Zeichnung sieht aus wie vorher.',
    'pal.assignedFree_one':   'Dein Sprite nutzt jetzt „{name}“. {n} Farbe gab es dort nicht — sie bleibt als Bildfarbe erhalten.',
    'pal.assignedFree_other': 'Dein Sprite nutzt jetzt „{name}“. {n} Farben gab es dort nicht — sie bleiben als Bildfarben erhalten.',
    'pal.recolored':       'Sprite mit „{name}“ umgefärbt — Strg+Z macht es rückgängig.',
    'pal.sizeCount_one':   '({n} Farbe)',
    'pal.sizeCount_other': '({n} Farben)',
    'fc.toPalette':        'In Palette aufnehmen',
    'fc.toPaletteTitle':   'Die Bildfarben hinten an die Palette hängen — dann sind sie wie jede Palettenfarbe anwählbar',
    'fc.reduce':           'Bild → Palette …',
    'fc.tooMany':          'Zu viele für die Palette: {n} Bildfarben, aber nur {max} freie Plätze. Mit „Bild → Palette …“ reduzieren.',
    'fc.added_one':        '{n} Farbe in „{name}“ aufgenommen.',
    'fc.added_other':      '{n} Farben in „{name}“ aufgenommen.',
    'red.all_one':         'Alle ({n}) — exakt',
    'red.all_other':       'Alle ({n}) — exakt',
    'red.count_one':       '{n} Farbe',
    'red.count_other':     '{n} Farben',
    'red.intro_one':       'Das Bild hat {n} Farbe. Eine Palette fasst bis zu {max}.',
    'red.intro_other':     'Das Bild hat {n} verschiedene Farben. Eine Palette fasst bis zu {max} — weniger Farben ergeben mehr Pixel-Art-Look.',
    'red.after_one':       'Nachher · {n} Farbe',
    'red.after_other':     'Nachher · {n} Farben',
    'pal.hint.builtin':    'Eingebaute Paletten sind schreibgeschützt. „Kopie bearbeiten“ macht sie änderbar.',
    'pal.swatchTitle':     'Farbe ändern',
    'pal.groupBuiltin':    'Eingebaut',
    'pal.groupCustom':     'Eigene',
    'pal.quickTitle':      '{i} — {label}{extra}  (Taste {i})',
    'pal.currentErase':    'Radieren (Index 0)',
    'pal.currentFree':     'Freie Farbe',
    'pal.currentIndex':    'Index {i} — {label}',
    'pal.transparent':     'transparent',
    'lay.pin':             'Anpinnen — fest neben der Zeichenfläche',
    'lay.unpin':           'Lösen — zurück an den vorherigen Platz',
    'lay.float':           'Als schwebendes Fenster lösen',
    'lay.floatBar':        'Leiste lösen — frei verschieben',
    'lay.dockBar':         'Wieder andocken',
    'lay.pinBar':          'Seitlich anpinnen — feste Spalte neben der Zeichenfläche',
    'lay.unpinBar':        'Lösen — zurück an den angestammten Platz',
    'lay.grip':            'Ziehen zum Verschieben',
    'lay.toolbar':         'Werkzeuge',
    'lay.mobilePin':       'Unten anpinnen — bleibt immer offen',
    'lay.mobileUnpin':     'Ins Dock legen — öffnet sich dann per Icon',
    'lay.colorbar':        'Farbzeile',
    'lay.timeline':        'Timeline',

    // Timeline (js/frames.js) — die Knopf-Titel stehen in STATIC
    'pv.info':      '{w}×{h} Pixel · {scale}× dargestellt',
    'tl.frameTitle': 'Frame {i} · {ms} ms — antippen zum Wählen, ziehen zum Verschieben, Strg/Shift wählt mehrere',
    'tl.frameOf':   'Frame {i}/{n}',
    'tl.lastFrame': 'Der letzte Frame bleibt — ein Sprite braucht mindestens einen.',
    'tl.multi':     'Mehrere Frames wählen — antippen markiert, statt zu wechseln',
    'tl.multiOff':  'Mehrfachauswahl beenden',
    'tl.delOne':    'Frame löschen',
    'tl.delMany':   '{n} markierte Frames löschen',
    'tl.layers':    'Ebenen',
    'tl.lyAdd':     'Neue Ebene über der aktiven',
    'tl.lyDup':     'Ebene duplizieren',
    'tl.lyDel':     'Ebene löschen',
    'out.tooBigLive': '// Der Sprite ist groß ({n} Pixel über alle Frames) — der Code wird erst beim Kopieren oder Speichern erzeugt.',
    'tg.defaultName': 'Tag {n}',
    'tg.barTitle':  '{name} · Frames {a}–{b} · {dir} — klicken zum Bearbeiten',
    'qp.sorted':        'Nach Farbstufen sortiert — das Bild ist gleich geblieben. Strg+Z macht es rückgängig.',
    'qp.alreadySorted': 'Die Palette ist schon nach Farbstufen sortiert.',
    'qp.forked':        'Eingebaute Paletten bleiben unverändert — der Sprite nutzt jetzt die umsortierte Kopie „{name}“.',
    'exp.gifTagsSaved': '{n} GIFs — eine je Tag.',
    'tg.name':      'Name des Tags',
    'tg.frames':    'Frames',
    'tg.dir':       'Richtung',
    'tg.dir.forward':  'Vorwärts',
    'tg.dir.reverse':  'Rückwärts',
    'tg.dir.pingpong': 'Ping-Pong',
    'tg.play':      'Abspielen',
    'tg.del':       'Löschen',
    'tg.done':      'Fertig',
    'tl.contOn':    'Durchgehend — neue Frames teilen sich hier das Bild des vorigen. Klick schaltet aus.',
    'tl.contOff':   'Nicht durchgehend — neue Frames sind hier leer. Klick: durchgehend (gut für Hintergründe).',
    'tl.celsCopied':  '{n} Zelle(n) kopiert — Strg+V fügt an der aktiven Zelle ein.',
    'tl.pasteNone':   'Hier passt nichts hin — die Zellen haben eine andere Größe.',
    'tl.linkNeedsTwo':'Zum Verknüpfen mehrere Frames wählen — Shift-Klick oder über die Zellen ziehen.',
    'tl.celTitle':  'Frame {i} · {name} — antippen wählt, Shift oder Ziehen spannt einen Bereich, Ziehen im Bereich verschiebt (Strg: kopiert)',

    // Hilfslinien (js/guides.js)
    'gd.chin':     'Kinn',
    'gd.chest':    'Brust',
    'gd.navel':    'Nabel',
    'gd.hip':      'Hüfte',
    'gd.crotch':   'Schritt',
    'gd.knee':     'Knie',
    'gd.lockBtn':          'Sperren',
    'gd.unlockBtn':        'Entsperren',
    'gd.removed':  'Hilfslinie entfernt.',

    // Ebenen (js/layers.js) — die Panel-Texte stehen im HTML bzw. in STATIC
    'ly.name':        'Ebene {n}',
    'ly.copyName':    '{name} Kopie',
    'ly.hide':        'Ausblenden',
    'ly.show':        'Einblenden',
    'ly.lock':        'Sperren — dann wird hier nicht gemalt',
    'ly.unlock':      'Entsperren',
    'ly.rowTitle':    '{name} — antippen wählt, ziehen ordnet, Doppelklick benennt um',
    'ly.lastLayer':   'Die letzte Ebene bleibt — ein Sprite braucht mindestens eine.',
    'ly.nothingBelow':'Unter der untersten Ebene liegt nichts zum Zusammenführen.',
    'ly.lockedInfo':  'Ebene „{name}“ ist gesperrt — erst entsperren (Schloss im Ebenen-Panel).',
    'ly.hiddenInfo':  'Ebene „{name}“ ist ausgeblendet — erst einblenden (Auge im Ebenen-Panel).',
    'list.frames_one':   '{n} Frame',
    'list.frames_other': '{n} Frames',
    'lay.resize':          'Ziehen ändert die Breite',
    'lay.toolOpts':        'Werkzeug-Optionen — oder das aktive Werkzeug nochmal antippen',
    'tpl.pick':            'Bild laden …',
    'tpl.pickOther':       'Anderes Bild laden …',
    'tpl.unnamed':         'Schablone',
    'tpl.restored':        'Aus dem letzten Besuch — bleibt in diesem Browser gespeichert, bis du sie entfernst.',
    'tpl.kept':            'Bleibt in diesem Browser gespeichert, bis du sie entfernst.',
    // Werden zur Laufzeit ueber t() geholt — sie muessen hier stehen, nicht
    // nur in STATIC (tests/i18n.test.js wacht darueber).
    'help.close':          'Schließen',
    'gd.hideBtn':          'Ausblenden',
    'gd.showBtn':          'Einblenden',
    'news.version':        'Version {v}',
    'news.loading':        'Wird geladen …',
    'news.empty':          'Zu den letzten Versionen gibt es noch keine Notizen.',
    'news.offline':        'Die Notizen ließen sich gerade nicht laden — bitte später noch einmal.',
    'help.backupRestore':  'Wiederherstellen',
    'help.backupDownload': 'Herunterladen',
    'store.rescued':       'Dein gespeicherter Stand ließ sich nicht laden. Er ist gesichert und wird nicht überschrieben — unter Hilfe → Sicherung kannst du ihn jederzeit holen.',
    'help.backupConfirm':  'Den aktuellen Stand durch diese Sicherung ersetzen? Der aktuelle Stand wird dabei selbst gesichert.',
    'help.backupLabel.backup': 'Stand vom {date}',
    'help.backupLabel.rescue': 'Geretteter Stand vom {date}',
    'pp.search':           'Palette suchen …',
    'pp.all':              'Alle',
    'pp.colors_one':       '{n} Farbe',
    'pp.colors_other':     '{n} Farben',
    'pp.active':           'aktiv',
    'pp.activeTitle':      'Diese Palette nutzt dein Sprite gerade',
    'pp.none':             'Keine Palette gefunden.',
    'fc.count':            '+{n} Bildfarben',
    'fc.head':             '{n} Farben ohne Paletten-Platz — nach Häufigkeit. Klick wählt die Farbe.',
    'fc.more':             '… und {n} weitere, seltener benutzte.',
    'pal.showCount_one':   'Hervorgehoben: {n} Pixel in dieser Farbe.',
    'pal.showCount_other': 'Hervorgehoben: {n} Pixel in dieser Farbe.',
    'fc.swatch':           '{hex} · {n} Pixel',
    'pal.optCurrent':      '— aktuelle Palette —',
    'pal.optCustomSuffix': '{name} (eigene)',
    'pal.colorAria':       'Farbe {i}',
    'pal.modalEdit':       'Palette „{name}“ bearbeiten',
    'pal.modalNew':        'Neue Palette',
    'pal.modalSave':       'Speichern',
    'pal.modalCreate':     'Erstellen',
    'pal.needName':        'Bitte einen Namen eingeben.',
    'pal.isBuiltin':       '„{name}“ ist eine eingebaute Palette — bitte einen anderen Namen wählen.',
    'pal.exists':          'Palette „{name}“ existiert schon — überschreiben?',
    'pal.overwrite':       'Überschreiben',
    'pal.forked':          'Palette „{name}“ angelegt — Doppelklick auf eine Farbe ändert sie.',
    'pal.deleted_one':     'Palette gelöscht — {n} Sprite auf „{fallback}“ gesetzt.',
    'pal.deleted_other':   'Palette gelöscht — {n} Sprites auf „{fallback}“ gesetzt.',
    'pal.confirmDelete':   'Palette „{name}“ wirklich löschen?{extra}',
    'pal.usedBy_one':      ' {n} Sprite nutzt sie gerade.',
    'pal.usedBy_other':    ' {n} Sprites nutzen sie gerade.',
    'pal.fromImage':       'Palette „{name}“ erstellt — {n} Farben. Strg+Z macht es rückgängig.',

    // Sprites
    'sprite.confirmDelete': 'Sprite „{name}“ wirklich löschen?',
    'sprite.created':       '„{name}“ angelegt.',
    'sprite.needName':      'Bitte einen Namen eingeben.',
    'sprite.needSize':      'Breite und Höhe müssen zwischen 1 und 1024 liegen — größer geht in der Desktop-App (bis 8192 × 8192).',
    'sprite.emptyGrid':     '— Leeres Grid —',
    'sprite.option':        '{name} ({w}×{h})',
    'sprite.confirmClear':  'Alle Pixel dieses Sprites löschen?',
    'sprite.clearOk':       'Leeren',

    // Vollbild
    'full.enter':      'Vollbild',
    'full.enterTitle': 'Vollbild (Esc zum Schließen)',
    'full.exit':       'Beenden',
    'full.exitTitle':  'Vollbild verlassen (Esc)',

    // Statuszeile — Malen
    'info.mirrorOff':   'Symmetrie aus',
    'info.mirrorOn':    'Symmetrie: {axes}',
    'axes.both':        'beide Achsen',
    'axes.x':           'senkrechte Achse',
    'axes.y':           'waagerechte Achse',
    'info.tplOutside':  'Schablone: außerhalb des Bildes geklickt',
    'info.tplTransp':   'Schablone: transparenter Bereich',
    'info.tplPipette':  'Schablonen-Pipette: {hex}',
    'info.tplMove':     'Schablone verschieben: x={x}px y={y}px',
    'info.dragCopy':    'Kopie ziehen',
    'info.move':        'Verschieben',
    'info.moved':       'Verschoben',
    'info.marquee':     'Aufziehen',
    'info.pickFree':    'Pipette: freie Farbe {hex}',
    'info.pickIndex':   'Pipette: Index {i} — {label}',
    'info.lassoStart':  'Form umfahren — Loslassen schließt sie',
    'info.colorSel':    'Farbauswahl: {n} Pixel{extra}',
    'info.colorSelNone': 'Farbauswahl: nichts getroffen — Toleranz erhöhen?',
    'info.shapeStart':  '{shape} ziehen — Start ({x}, {y})',
    'info.shapeDrag':   '{shape} {w}×{h} — {n} Pixel',
    'info.wandDeleted': 'Zauberstab: {n} Pixel gelöscht',
    'info.wandNone':    'Zauberstab: nichts gelöscht — Toleranz erhöhen?',
    'info.index':       'Index {i}',
    'info.pipetteAt':   'Pipette — ({x}, {y}) · {val}',
    'info.at':          '({x}, {y}) · {val}',
    'info.suffixPaint': ' → malen',
    'info.suffixErase': ' → löschen',
    'info.drawn':       '{n} Pixel gezeichnet',
    'info.drawnNone':   'Nichts gezeichnet',

    // Statuszeile — Auswahl
    'sel.none':        'Keine Auswahl',
    'sel.lasso':       '{prefix} — {n} Stützpunkte, Loslassen schließt die Form',
    'sel.lassoPrefix': 'Form ziehen',
    'sel.rect':        '{prefix}Auswahl {w}×{h} bei ({x}, {y})',
    'sel.pixels':      ' · {n} Pixel',
    'sel.floating':    ' · schwebt',
    'sel.all':         'Alles gewählt',
    'sel.dropped':     'Auswahl aufgehoben',
    'sel.copied':      '{n} Pixel in die Zwischenablage kopiert',
    'sel.copiedShort': '{n} Pixel kopiert',
    'sel.cut':         'Ausgeschnitten — {n} Pixel. Mit Strg+V wieder einfügen.',
    'sel.cutShort':    'Ausgeschnitten — {n} Pixel',
    'sel.clipEmpty':   'Zwischenablage ist leer — erst kopieren oder ausschneiden.',
    'sel.pasted':      'Eingefügt — {n} Pixel. Zum Verschieben hineinziehen.',
    'sel.erased':      'Auswahl geleert — {n} Pixel',
    'sel.filled':      'Auswahl gefüllt — {n} Pixel',

    // Drehen / Transformieren
    'rot.discarded':  'Drehung verworfen',
    'rot.applied':    'Drehung übernommen',
    'rot.shapeDrop':  'Form verworfen',
    'rot.preview':    '{scope} um {deg}° gedreht — {w}×{h}',
    'rot.lossHint':   ' · Ecken außerhalb der Fläche fallen weg',
    'rot.applyHint':  ' · Übernehmen oder Verwerfen',
    'rot.done':       '{scope} gedreht — übernommen',
    'tf.flipH':       '{scope} waagerecht gespiegelt',
    'tf.flipV':       '{scope} senkrecht gespiegelt',
    'tf.rot90':       '{scope} um 90° gedreht',
    'tf.trimmed':     'Zugeschnitten auf {w}×{h}.',
    'tf.trimFail':    'Nicht zugeschnitten — {reason}.',
    'tf.centered':    'Inhalt mittig gesetzt.',
    'tf.centerFail':  'Nicht verschoben — {reason}.',
    'mod.sizeCurrent':  '„{name}“ ist derzeit {w}×{h} Pixel.',
    'mod.sizeInvalid':  'Breite und Höhe müssen zwischen 1 und 1024 liegen — größer geht in der Desktop-App (bis 8192 × 8192).',

    'tf.resized':     'Größe jetzt {w}×{h}{lost}.',
    'tf.resizeLost':  ' — {n} Pixel abgeschnitten',
    'tf.resizeFail':  'Größe unverändert — {reason}.',
    'tf.confirmShrink': 'Kleiner machen? Was nicht mehr hineinpasst, wird abgeschnitten.',
    'tf.shrinkOk':    'Ändern',
    'tf.scaledUp':    'Auf {w}×{h} vergrößert.',
    'tf.scaledDown':  'Auf {w}×{h} verkleinert.',
    'tf.scaleFail':   'Nicht skaliert — {reason}.',
    'tf.confirmHalve': 'Halbieren? Jedes zweite Pixel fällt weg.',
    'tf.halveOk':     'Halbieren',
    'reason.empty':     'leer',
    'reason.nothing':   'nichts abzuschneiden',
    'reason.centered':  'schon mittig',
    'reason.unchanged': 'unverändert',
    'reason.tooSmall':  'zu klein',
    'reason.tooBig':    'über 1024 Pixel',

    // Aufräumen
    'cln.bgRemoved':   'Hintergrund entfernt — {n} Pixel.',
    'cln.bgNone':      'Nichts entfernt — Toleranz erhöhen?',
    'cln.despeckled':  'Geglättet — {n} Pixel angepasst.',
    'cln.despeckleNone': 'Nichts zu glätten gefunden.',
    'cln.outlined':    'Outline gezeichnet — {n} Pixel.',
    'cln.outlineNone': 'Keine Outline nötig — Sprite leer?',

    'info.size':       'Größe {n}',
    // Reiter
    'tabs.close':      'Reiter schließen (Mittelklick) — der Sprite bleibt im Projekt',

    // Licht
    'mask.editHint':   'Maske bearbeiten: Malen blendet aus, Radieren blendet wieder ein.',
    'mask.editStart':  'Maske bearbeiten',
    'mask.editStop':   'Maske fertig — wieder ins Bild malen',
    'mask.on':         'Maske einschalten',
    'mask.off':        'Maske ausschalten (alles sichtbar)',
    'ly.nothingToMerge': 'Zum Zusammenführen braucht es mindestens zwei sichtbare Ebenen.',
    'ly.mergedName':   'Zusammengeführt',
    'lgt.applyNew':    'Licht-Ebene anlegen',
    'lgt.applyUpdate': 'Licht neu berechnen',
    'lgt.castNew':     'Werfen',
    'lgt.castUpdate':  'Neu werfen',
    'lgt.layerLight':  'Licht · {name}',
    'lgt.layerShadow': 'Schatten · {name}',
    'lgt.statusOff':   'Wirkt auf „{name}“ — als eigene Ebene, das Original bleibt.',
    'lgt.statusOn':    'Licht für „{name}“ ist eine eigene Ebene — Änderungen hier rechnen sie neu.',
    'lgt.noBase':      'Keine Ebene, auf die das Licht wirken kann.',
    'lgt.done':        'Licht gesetzt — {lit} Pixel heller, {shaded} dunkler.',
    'lgt.none':        'Nichts beleuchtet — keine Kanten oder keine passenden Palettenfarben (Häkchen „Auch Farben außerhalb der Palette“?).',
    'lgt.castDone':    'Schlagschatten gemalt — {n} Pixel.',
    'lgt.castNone':    'Kein Platz für einen Schatten — Sprite leer oder Rand erreicht?',

    // Schablone
    'tpl.needSprite':  'Erst einen Sprite anlegen.',
    'tpl.needTpl':     'Erst eine Schablone laden.',
    'tpl.sampleFail':  'Schablone konnte nicht abgetastet werden.',
    'tpl.noColors':    'Keine Farben in der Schablone gefunden.',
    'tpl.traced':      'Schablone übernommen — {n} Pixel ({mode}).',
    'tpl.tracedNone':  'Keine Pixel geändert — Schablone über dem Grid positionieren?',
    'tpl.modePalette': 'Palettenfarben',
    'tpl.modeRaw':     'Originalfarben',
    'tpl.modeQuant':   '{n} Farben',
    'tpl.imageEmpty':  'Das Bild ist leer — erst malen oder eine Schablone übernehmen.',

    // Speichern / Dateien
    'file.dirSet':       'Speicherort: {name} — klicken zum Ändern',
    'file.dirUnset':     'Speicherort für PNG/PDF/Dateien wählen — wird gemerkt',
    'file.dirPicked':    'Speicherort gesetzt: „{name}“. PNG, PDF und Dateien landen ab jetzt hier.',
    'file.confirmReset': 'Alles zurücksetzen? Sprites und eigene Paletten gehen verloren.',
    'file.resetOk':      'Zurücksetzen',
    'file.downloaded':   '„{name}“ wurde heruntergeladen (Standard-Download-Ordner).',
    'file.downloadedTip': '„{name}“ wurde heruntergeladen (Standard-Download-Ordner). Tipp: Mit „Speicherort“ einen festen Ordner wählen.',
    'file.downloadedTipIcon': '„{name}“ wurde heruntergeladen (in den Standard-Download-Ordner). Tipp: Mit „📁 Speicherort“ einen festen Ordner wählen.',
    'file.savedIn':      '„{name}“ gespeichert in „{dir}“.',
    'file.saved':        '„{name}“ gespeichert.',
    'file.savedInOk':    '✅ „{name}“ gespeichert in „{dir}“.',
    'file.savedOk':      '✅ „{name}“ gespeichert.',
    'file.saveFailed':   'Speichern fehlgeschlagen — ist der Speicher des Browsers voll? „Projekt sichern“ schreibt eine Datei.',
    'file.badProject':   'Ungültige Datei — das ist kein Sprite-Projekt.',
    'file.readFailed':   'Datei konnte nicht gelesen werden.',
    'file.clipboardOff': 'Zwischenablage nicht verfügbar — Text ist markiert, mit Strg+C kopieren.',
    'file.copied':       '✓ Kopiert',
    'file.saveAs':       '.{ext} speichern',
    'file.saveAsTitle':  'Als {label}-Datei speichern',

    // Export
    'exp.legendTitle':   'Palette — {n} Farben',
    'exp.legendSorted':  'Palette — {n} Farben (nach Farbton sortiert)',
    'exp.noSprites':     'Keine Sprites zum Zusammenpacken.',
    'exp.gifTooMany':    'GIF fasst höchstens 255 Farben — dieser Sprite hat {n}. Erst mit „Bild → Palette …“ reduzieren.',
    'exp.sheetSaved':    'Spritesheet mit {n} Sprites gespeichert — „{png}“ und „{json}“{where}',
    'exp.sheetDownload': ' (im Download-Ordner).',
    'exp.sheetIn':       ' in „{dir}“.',
    'exp.framesNote':    '{n} Frames markiert — PNG und PDF speichern je eine Datei, das GIF enthält nur diese Frames.',
    'exp.framesSaved':   '{n} Frames gespeichert — von „{first}“ bis „{last}“{where}',
    'exp.framesDownload': ' (im Download-Ordner).',
    'exp.framesIn':      ' in „{dir}“.',
    'exp.framesZip':     '{n} Frames als „{name}“ gespeichert — ein Archiv, weil dein Browser keine Ordner wählen kann. Entpacken und fertig.',
    'exp.pdfMissing':    'PDF-Library noch nicht geladen — kurz warten und nochmal versuchen.',

    // Format-Hinweise unter dem Format-Dropdown
    'fmt.ts':   'number[][] mit Typen — der Klassiker für TypeScript-Projekte.',
    'fmt.js':   'Dasselbe ohne Typen, als ES-Modul.',
    'fmt.json': 'Sprachneutral — für eigene Pipelines, Engines und Tools.',
    'fmt.game': 'Flaches data-Array (y · width + x), Palette als #rrggbbaa mit Material je Farbe — für Spiele, z. B. in C#.',
    'fmt.svg':  'Fertige Vektorgrafik: skaliert verlustfrei, direkt einbindbar.',
    'fmt.css':  'Ein einziges Element, per box-shadow gepixelt — braucht kein Bild.',
    'fmt.c':    'Palette + Indizes als uint8-Array — für Mikrocontroller und LED-Matrizen.',
    'fmt.py':   'Dict + Liste — für Pygame, Pillow oder eigene Skripte.',
    'fmt.txt':  'Zeichenraster mit Legende — gut für Diffs, Doku und schnelles Draufschauen.',
    'fmt.reimport': '{hint} Lässt sich wieder importieren.',

    // Import
    'imp.detected':     'Erkannt: ',
    'imp.size':         '{w}×{h} Pixel',
    'imp.paletteWith':  'Palette mit {n} Farben',
    'imp.paletteNone':  'keine Palette gefunden',
    'imp.restored':     '{n} freie Farb-Pixel wiederhergestellt',
    'imp.name':         'Name „{name}“',
    'imp.unknown':      ' — Achtung: Index {list} kommt im Grid vor, fehlt aber in der Palette.',
    'imp.nothing':      'Nichts eingefügt.',
    'imp.doneWithPal':  'Import fertig — Palette „{name}“ übernommen und zugewiesen.',
    'imp.donePlain':    'Import fertig. (Keine Palette im Text gefunden — Farben bleiben wie eingestellt.)',
    'imp.fallbackName': 'Import',
    'file.spriteAdded':  'Sprite „{name}“ zum Projekt hinzugefügt.',
    'file.spritesAdded': '{n} Sprites zum Projekt hinzugefügt.',
    'start.ask':        'Dein Bild von der Startseite als neuen Sprite übernehmen?',
    'start.take':       'Übernehmen',
    'start.name':       'bitty',

    // Bitty, der Helfer (js/helper.js)
    'bitty.hello':      'Hi, ich bin Bitty! Soll ich dir kurz zeigen, wo hier was ist?',
    'bitty.show':       'Zeig her',
    'bitty.later':      'Nein danke',
    'bitty.next':       'Weiter',
    'bitty.back':       'Zurück',
    'bitty.skip':       'Tour beenden',
    'bitty.done':       'Los geht’s',
    'bitty.close':      'Schließen',
    'bitty.quiet':      'Nicht von selbst',
    'bitty.stepOf':     'Schritt {n} von {total}',
    'bitty.kind.tour':  'Tour',
    'bitty.kind.tip':   'Tipp',
    'bitty.tourName.lesson': 'Mitmachen: erster animierter Sprite',
    'bitty.tourWords.lesson': 'Lektion Mitmachen üben lernen Anfänger Tutorial erster animierter Sprite lesson tutorial beginner learn first animated',
    'bitty.l.hello':    'Lust auf eine Mini-Lektion? Wir machen zusammen einen kleinen animierten Sprite — in 6 Schritten. Ich lege dafür einen neuen 16 × 16-Sprite an, dein Bild bleibt, wie es ist.',
    'bitty.l.name':     'Meine erste Animation',
    'bitty.l.stepOf':   'Lektion · Schritt {n} von {total}',
    'bitty.l.skip':     'Überspringen',
    'bitty.l.quit':     'Lektion beenden',
    'bitty.l.1':        'Nimm den Stift und male eine kleine Figur — ein Umriss reicht. Ich schaue zu.',
    'bitty.l.2':        'Jetzt das Füllen-Werkzeug: wähle eine andere Farbe und klick in die Figur.',
    'bitty.l.3':        'Für eine Animation brauchst du einen zweiten Frame. Dupliziere diesen hier.',
    'bitty.l.4':        'Du bist jetzt im neuen Frame. Ändere etwas — Arm hoch, Augen zu, ein Pixel versetzt.',
    'bitty.l.5':        'Und jetzt abspielen! (Enter geht auch.)',
    'bitty.l.6':        'Zum Schluss als GIF exportieren — dann kannst du es überall zeigen.',
    'bitty.l.yay.1':    'Super!',
    'bitty.l.yay.2':    'Genau so!',
    'bitty.l.yay.3':    'Klasse!',
    'bitty.l.done':     'Geschafft — dein erster animierter Sprite! Jetzt kennst du das Wichtigste. Mehr findest du jederzeit, wenn du mich anklickst.',
    'bitty.moreTours':  'Mehr Touren',
    'bitty.whichTour':  'Welche Tour soll ich dir zeigen?',
    'bitty.tourName.start':  'Erste Schritte',
    'bitty.tourName.anim':   'Animation',
    'bitty.tourName.layers': 'Ebenen',
    'bitty.tourName.tiles':  'Kacheln',
    'bitty.tourName.photo':  'Foto → Sprite',
    'bitty.tourWords.start':  'Tour Einstieg Anfang erste Schritte Überblick getting started basics intro overview',
    'bitty.tourWords.anim':   'Tour Animation animieren Frames Timeline abspielen GIF animate',
    'bitty.tourWords.layers': 'Tour Ebenen Ebene Maske Deckkraft layers layer mask opacity',
    'bitty.tourWords.tiles':  'Tour Kacheln Tilemap Level Spiel Godot tiles tilemap game',
    'bitty.tourWords.photo':  'Tour Foto Bild Schablone Vorlage abpausen photo picture template trace',
    'bitty.t.anim.1':   'Das ist die Timeline: je Frame eine Spalte, je Ebene eine Zeile. Ein Klick auf eine Zelle wählt Frame und Ebene.',
    'bitty.t.anim.2':   'Der einfachste Weg zur Animation: Frame duplizieren und ein bisschen ändern. + fügt einen leeren Frame ein.',
    'bitty.t.anim.3':   'Onion Skin lässt die Nachbar-Frames durchscheinen — so siehst du, wohin sich etwas bewegt.',
    'bitty.t.anim.4':   'Abspielen (Enter). Ein Tipp auf die Fläche hält wieder an.',
    'bitty.t.anim.5':   'FPS bestimmt das Tempo. Einzelne Frames können länger stehen bleiben — z. B. für ein Blinzeln.',
    'bitty.t.anim.6':   'Tags benennen einen Abschnitt wie „Laufen“ oder „Springen“: Frames markieren, Tag anlegen.',
    'bitty.t.anim.7':   'Fertig? Als GIF exportieren — es läuft endlos. Mit Tags auch eine Datei je Tag.',
    'bitty.t.layers.1': 'Ebenen liegen übereinander, die oberste ist vorn. Auge blendet aus, Schloss sperrt.',
    'bitty.t.layers.2': 'Neue Ebene: z. B. Kontur und Farbe getrennt — dann kannst du eins ändern, ohne das andere zu treffen.',
    'bitty.t.layers.3': 'Deckkraft der aktiven Ebene — praktisch für Schatten oder eine Skizze zum Abpausen.',
    'bitty.t.layers.4': 'Eine Maske blendet Teile der Ebene aus, ohne etwas zu löschen. Malen blendet aus, Radieren wieder ein.',
    'bitty.t.layers.5': 'Zusammenführen legt die Ebene auf die darunter — in jedem Frame.',
    'bitty.t.tiles.1':  'Für Spiel-Levels: eine Tilemap-Ebene besteht aus Kacheln fester Größe. Hier legst du eine neue an.',
    'bitty.t.tiles.2':  'Oder du wandelst die aktive Ebene um — gleiche Stellen werden eine Kachel.',
    'bitty.t.tiles.3':  '„Kacheln setzen“: eine Kachel wählen und mit dem Stift ins Raster setzen. Malst du eine Kachel an, ändert sie sich überall.',
    'bitty.t.tiles.4':  'Für Godot exportieren: Kachelbild, Szene und JSON — den Ordner einfach ins Projekt legen.',
    'bitty.t.photo.1':  'Erst ein Foto als Schablone laden — es liegt halb durchsichtig über dem Raster.',
    'bitty.t.photo.2':  'Dann aufs Raster übernehmen, am besten auf wenige Farben reduziert (etwa 8).',
    'bitty.t.photo.3':  'Bild → Palette macht aus diesen Farben eine Palette, die du bearbeiten kannst.',
    'bitty.t.photo.4':  'Hintergrund entfernen — oder mit dem Zauberstab einzelne Flächen löschen.',
    'bitty.t.photo.5':  'Glätten räumt einzelne Pixel weg, eine Outline gibt Kontur. Den Rest machst du mit Stift und Radierer.',
    'bitty.hintOff':    'Nicht mehr zeigen',
    'bitty.h.locked':   'Die Ebene „{name}“ ist gesperrt — deshalb passiert beim Malen nichts.',
    'bitty.h.unlock':   'Entsperren',
    'bitty.h.hidden':   'Die Ebene „{name}“ ist ausgeblendet — du würdest blind malen.',
    'bitty.h.show':     'Einblenden',
    'bitty.h.opacity':  'Die Ebene „{name}“ hat 0 % Deckkraft — was du malst, bleibt unsichtbar.',
    'bitty.h.opacityFull': 'Auf 100 % stellen',
    'bitty.h.color0':   'Du malst mit Farbe 0 — die ist durchsichtig und wirkt wie ein Radierer.',
    'bitty.h.color1':   'Farbe 1 nehmen',
    'bitty.h.maskEdit': 'Du malst gerade in die Maske von „{name}“, nicht ins Bild. Absicht?',
    'bitty.h.leaveMask': 'Zurück zum Bild',
    'bitty.h.masked':   'Hier blendet die Maske von „{name}“ die Ebene aus — deshalb siehst du nichts.',
    'bitty.h.maskOff':  'Maske ausschalten',
    'bitty.searchPh':   'Suchen oder Befehl (z. B. Lasso, neue Ebene)',
    'bitty.kind.action': 'Befehl',
    'bitty.disabled':   '„{name}“ geht gerade nicht — hier ist es, für später.',
    'bitty.danger':     'Hier ist „{name}“. Das drücke ich lieber nicht für dich — es löscht etwas.',
    'bitty.m.export':   'Dein erster Export — jetzt ist es draußen in der Welt! Ich bin ein bisschen stolz.',
    'bitty.m.anim':     'Es bewegt sich! Deine erste Animation läuft.',
    'bitty.artLabel':   'Pixel-Art-Tipp',
    'bitty.art.1':      'Erst die Silhouette: füll deine Figur einfarbig aus. Erkennt man sie dann noch, stimmt die Form.',
    'bitty.art.2':      'Licht kommt am besten von einer Seite, meist oben links — und zwar überall im Bild gleich.',
    'bitty.art.3':      'Schatten nicht nur dunkler machen, sondern auch kühler (Richtung Blau/Violett); Licht wärmer (Richtung Gelb). Das wirkt lebendiger.',
    'bitty.art.4':      'Weniger Farben wirken geschlossener: 4–8 pro Sprite reichen oft. „Bild → Palette“ hilft beim Reduzieren.',
    'bitty.art.5':      'Saubere Linien steigen in gleichmäßigen Stufen (1-1-1 oder 2-2-2). Clean Stroke entfernt die doppelten Eckpixel.',
    'bitty.art.6':      'Vorsicht vor „Kissen-Schattierung“: Schatten ringsum am Rand macht alles flach. Schattiere von der Lichtrichtung weg.',
    'bitty.art.7':      'Die Kontur muss nicht schwarz sein — ein dunkler Ton der Füllfarbe wirkt weicher und passt besser.',
    'bitty.art.8':      'Den höchsten Kontrast hebst du dir für das Wichtigste auf, meist die Augen.',
    'bitty.art.9':      'Für eine Animation reichen oft 2–4 Frames. Ein Frame, der länger steht (Dauer), gibt Gewicht — z. B. beim Landen.',
    'bitty.art.10':     'Gleich breite Farbstreifen parallel zur Kontur („Banding“) wirken matschig. Versetz die Übergänge lieber.',
    'bitty.tip.11':     'Strg + K öffnet mich überall. Tipp „neue ebene“ oder „gif“ und drück Enter — ich führe es gleich aus.',
    'bitty.noHits':     'Dazu finde ich nichts — versuch ein anderes Wort.',
    'bitty.kind.help':  'Hilfe',
    'bitty.kind.tool':  'Werkzeug',
    'bitty.kind.panel': 'Panel',
    'bitty.kind.menu':  'Menü',
    'bitty.foundTool':  'Da ist es: {name}.',
    'bitty.foundPanel': 'Hier findest du „{name}“.',
    'bitty.use':        'Auswählen',
    'bitty.ok':         'Danke',
    'bitty.tour.tools':    'Das sind deine Werkzeuge: Stift, Pinsel, Füllen, Radierer und mehr. Fahr mit der Maus drüber, dann siehst du das Tastenkürzel.',
    'bitty.tour.colors':   'Hier sind deine Farben. Ein Klick wählt die Farbe, mit der du malst.',
    'bitty.tour.canvas':   'Und hier malst du. Rechtsklick löscht, Strg + Mausrad zoomt.',
    'bitty.tour.timeline': 'Die Timeline: Frames für Animationen und Ebenen übereinander. ▶ spielt die Animation ab.',
    'bitty.tour.export':   'Fertig? Unter „Code & Export“ speicherst du dein Bild als PNG, GIF, Spritesheet oder als Code.',
    'bitty.tour.end':      'Das war’s! Klick mich an, wenn du einen Tipp willst. Alle Kürzel findest du unter Hilfe (F1).',
    'bitty.tip.1':      'Leertaste halten und ziehen verschiebt das Bild — auch mit der mittleren Maustaste.',
    'bitty.tip.2':      'Strg + Mausrad zoomt genau dorthin, wo dein Mauszeiger steht.',
    'bitty.tip.3':      'Umschalt halten beim Malen: der Strich bleibt waagerecht, senkrecht oder im 45°-Winkel.',
    'bitty.tip.4':      'Alt + rechte Maustaste ziehen verstellt die Pinselgröße direkt auf der Fläche.',
    'bitty.tip.5':      'Dein Bild merkt sich Farbnummern, nicht Farben. Mit „Sprite umfärben“ im Palette-Panel bekommt es auf einen Schlag andere Farben.',
    'bitty.tip.6':      'Onion Skin in der Timeline lässt die Nachbar-Frames durchscheinen — praktisch beim Animieren.',
    'bitty.tip.7':      'Eine Auswahl mit Alt ziehen lässt das Original stehen — du verschiebst eine Kopie.',
    'bitty.tip.8':      'G blendet die Hilfslinien ein und aus. In Exporten tauchen sie nie auf.',
    'bitty.tip.9':      'Strg + S sichert dein ganzes Projekt als Datei — gut als Backup oder für einen anderen Rechner.',
    'bitty.tip.10':     'F1 öffnet die Hilfe mit allen Tastenkürzeln.',
    'imp.errSvgNoRect':  'SVG erkannt, aber kein <rect> darin gefunden.',
    'imp.errSvgNoFill':  'SVG erkannt, aber kein <rect> mit Füllfarbe gefunden.',
    'imp.errSvgBig':     'SVG ist {w}×{h} groß — das Raster wäre zu fein.',
    'imp.errCssNoBlock': 'Kein box-shadow-Block gefunden.',
    'imp.errCssNoPixel': 'box-shadow gefunden, aber keine Pixel darin gelesen.',
    'imp.errCssBig':     'Das ergäbe {w}×{h} Pixel — zu groß.',
    'imp.errCNoSize':    'C-Header ohne _WIDTH und _HEIGHT — Maße unbekannt.',
    'imp.errCBadSize':   'Maße {w}×{h} sind nicht brauchbar.',
    'imp.errCNoData':    'C-Header ohne _DATA-Feld — keine Pixel gefunden.',
    'imp.errCShort':     '_DATA hat {have} Werte, für {w}×{h} braucht es {need}.',
    'imp.errTxtNoGrid':  'Kein Zeichenraster gefunden (gleich lange Zeilen aus . und 1-9).',
    'imp.errTxtBig':     'Raster ist {w}×{h} — zu groß.',
    'imp.errNoArray':    'Kein gültiges number[][]-Array gefunden. Erwartet wird [[0,1,…], …].',
    'imp.errGame':       'JSON (Spiel) erkannt, aber {reason}',

    // Migration alter Projekte
    'mig.rescued_one':   '{n} bearbeiteter Alt-Sprite übernommen',
    'mig.rescued_other': '{n} bearbeitete Alt-Sprites übernommen',
    'mig.palettes_one':   '{n} eigene Palette übernommen',
    'mig.palettes_other': '{n} eigene Paletten übernommen',
    'mig.note': 'Projekt auf das neue, motiv-freie Palettensystem umgestellt — {notes}. Unveränderte Hund/Katze-Vorlagen wurden entfernt.',

    // Kommentare im erzeugten Code
    'gen.freeSaved_one':   '// {n} freie Farbe wurde als Index {from}+ gesichert (verlustfrei)',
    'gen.freeSaved_other': '// {n} freie Farben wurden als Indizes {from}+ gesichert (verlustfrei)',
    'gen.palette':      '// Palette „{name}“',
    'gen.cssUsage':     '/* {name} — {w}×{h}. Benutzung: <div class="{cls}"></div>',
    'gen.cssHint':      '   Ein einziges 1×1-Element, hochskaliert. --px stellt die Pixelgröße. */',
    'gen.cssMargin':    '/* Platz für die Skalierung */',
    'gen.cHead':        '// {name} — {w}×{h}, {n} Farben',
    'gen.cNote':        '// Index 0 ist transparent; Farben als 0xRRGGBB.',
    'gen.pyHead':       '# {name} — {w}×{h}. Index 0 ist transparent.',
    'gen.txtLegend':    "Legende ('.' = transparent):",
    'gen.framesJs':     '// Animation: {n} Frames — {id}[Frame][y][x], Dauer je Frame in ms: {id}_DURATIONS',
    'gen.framesPy':     '# Animation: {n} Frames — {id}[Frame][y][x], Dauer je Frame in ms: {id}_DURATIONS',
    'gen.framesC':      '// Animation: {n} Frames — {id}_DATA[Frame][y * WIDTH + x], Dauer in ms: {id}_DURATIONS',
    'gen.cssAnim':      '/* Animation: {n} Frames, {ms} ms pro Durchlauf, läuft endlos. */',

    // JSON (Spiel)
    'game.materials':      'Material je Farbe — Palette „{name}“',
    'game.materialAria':   'Material für Farbe {i}',
    'game.materialNote':   'Gilt für alle Sprites mit dieser Palette. Index 0 ist immer „empty“, freie Farben bekommen „none“.',
    'game.exportFailed':   'Export abgebrochen: {reason}',
    'game.err.version':    'unbekannte Version {version}.',
    'game.err.size':       'ungültige Größe {w}×{h}.',
    'game.err.noPalette':  'die Palette ist leer.',
    'game.err.zeroOpaque': 'Index 0 muss transparent sein, ist aber {color}.',
    'game.err.badColor':   'ungültige Farbe {color}.',
    'game.err.badMaterial':'unbekanntes Material „{material}“ bei Index {i}.',
    'game.err.length':     'data hat {len} Werte, erwartet sind {w} × {h} = {expected}.',
    'game.err.index':      'Pixel ({x}, {y}) hat Index {value}, gültig ist 0 bis {max}.',
    'game.err.region':     'Ausschnitt „{name}“ liegt nicht vollständig im Bild.',
    'game.err.durations':  'durations braucht {need} ganze Zahlen (ms), eine je Frame.',
  },

  en: {
    'tl.pasteFree':   'Cels pasted with the original colours — {n} colours are not in this palette and came in as free colours.',
    'tl.pasteMapped': 'Cels pasted with the original colours — the numbers were adjusted to this palette.',
    'sel.pasteFree':   'Pasted with the original colours — {n} of them are not in this palette and came in as free colours (Image → palette brings them in). Ctrl+Shift+V keeps the numbers instead.',
    'sel.pasteMapped': 'Pasted with the original colours — {n} colours have a different number in this palette and were converted. Ctrl+Shift+V keeps the numbers instead.',
    'info.scale': 'Scaling — Shift keeps the aspect ratio',
    'gd.layoutNone':     'none saved yet',
    'gd.layoutNeedName': 'Enter a name for the layout first.',
    'gd.layoutSaved':    'Layout “{name}” saved — it applies to all sprites.',
    'gd.layoutReplaced': 'Layout “{name}” replaced.',
    'gd.layoutApplied':  'Layout “{name}” applied.',
    'gd.layoutScaled':   'Layout “{name}” applied — scaled from {w} × {h} to this size.',
    'gd.layoutDeleted':  'Layout “{name}” deleted.',

    // ── Tiles (tilemap.js) ──
    'tile.picked':      'Picked tile {k}.',
    'tile.pickedEmpty': 'There is no tile here.',
    'tile.pick':        'Pick a tile from the list first.',
    'tile.noneYet':     'No tiles yet — paint into an empty cell in “Paint pixels” mode.',
    'tile.layerName':   'Tilemap {n}',
    'tile.converted':   'Cut into tiles: {n} different tiles.',
    'tile.unmapped':    'A normal layer again — the pixels stayed.',
    'tile.pruned':      'Removed {n} unused tiles.',
    'tile.prunedNone':  'All tiles are in use.',
    'tile.rest':        'Tilemap created. The sprite is not a multiple of {tw} × {th} — the dark edge belongs to no tile.',
    'tile.created':     'Tilemap created — just start painting, every painted cell becomes a tile.',
    'tile.exportNone':  'No tilemap layer with tiles to export.',
    'tile.exported':    '{name} saved — unpack the folder “{folder}” into your Godot project and open the .tscn.',
    'tile.exportedDl':  '(in your downloads folder)',
    'tile.info':        '{tw} × {th} px · {n} tiles · grid {cols} × {rows}',
    'tile.hintTiles':   'Pencil places the chosen tile, eraser or right-click clears, fill fills, Alt + click picks a tile.',
    'tile.hintAuto':    'Painting changes the tile everywhere it is placed. Painting into an empty cell creates a new tile.',
    'tile.hintManual':  'Painting changes the tile everywhere it is placed. Empty cells stay empty — no new tiles are created.',
    'tile.item':        'Tile {k} — pick to place',
    'tile.blocked':     'Manual: empty cells are not painted (choose “Auto” for that).',

    'color.label.0': 'Transparent',
    'color.label.1': 'Tone 1 — lightest',
    'color.label.2': 'Tone 2',
    'color.label.3': 'Tone 3',
    'color.label.4': 'Tone 4 — darkest',
    'color.label.5': 'Outline',
    'color.label.6': 'Accent A',
    'color.label.7': 'Highlight',
    'color.label.8': 'Accent B',
    'color.label.9': 'Accent C',
    'color.short.0': 'Transparent',
    'color.short.1': 'Tone 1',
    'color.short.2': 'Tone 2',
    'color.short.3': 'Tone 3',
    'color.short.4': 'Tone 4',
    'color.short.5': 'Outline',
    'color.short.6': 'Accent A',
    'color.short.7': 'Highlight',
    'color.short.8': 'Accent B',
    'color.short.9': 'Accent C',
    'color.labelN':  'Color {i}',

    'scope.sprite':    'Sprite',
    'scope.selection': 'Selection',

    'shape.line':    'Line',
    'shape.rect':    'Rectangle',
    'shape.ellipse': 'Ellipse',

    'list.empty':        'No sprites yet. Create one above.',
    'list.noMatch':      'No sprite matches “{q}”.',
    'list.cardTitle':    '{name} — {w}×{h}, palette “{palette}”',
    'list.rename':       'Rename',
    'list.resize':       'Change grid size',
    'list.duplicate':    'Duplicate',
    'list.delete':       'Delete',
    'list.noSprite':     'No sprite',
    'list.copySuffix':   ' copy',
    'list.defaultName':  'Sprite 1',
    'list.namePrefix':   'Sprite ',

    'panel.expand':   'Expand',
    'panel.collapse': 'Collapse',

    'pal.origin.custom':   'custom',
    'pal.origin.builtin':  'built-in',
    'pal.hint.custom':     'Double-click a color to change it — images using this palette recolor with it.',
    'pal.statusActive_one':    'Your sprite uses this palette · {n} color',
    'pal.statusActive_other':  'Your sprite uses this palette · {n} colors',
    'pal.statusPreview_one':   'Preview · {n} color — your sprite uses “{name}”',
    'pal.statusPreview_other': 'Preview · {n} colors — your sprite uses “{name}”',
    'pal.swInfo':          '{i} · {label} · {hex}',
    'pal.swEdit':          'Click: paint with it · Double-click: change the color',
    'pal.swPick':          'Click: paint with it',
    'pal.miniTitle':       '{i} · {hex}',
    'pal.moreCount':       '+{n}',
    'pal.moreTitle':       'Show all {n} colors in the palette panel',
    'pal.assigned':        'Your sprite now uses “{name}” — the drawing looks the same as before.',
    'pal.assignedFree_one':   'Your sprite now uses “{name}”. {n} color was not in it — it stays as an image color.',
    'pal.assignedFree_other': 'Your sprite now uses “{name}”. {n} colors were not in it — they stay as image colors.',
    'pal.recolored':       'Sprite recolored with “{name}” — Ctrl+Z undoes it.',
    'pal.sizeCount_one':   '({n} color)',
    'pal.sizeCount_other': '({n} colors)',
    'fc.toPalette':        'Add to palette',
    'fc.toPaletteTitle':   'Append the image colors to the palette — then they can be picked like any palette color',
    'fc.reduce':           'Image → palette …',
    'fc.tooMany':          'Too many for the palette: {n} image colors but only {max} free slots. Reduce them with “Image → palette …”.',
    'fc.added_one':        'Added {n} color to “{name}”.',
    'fc.added_other':      'Added {n} colors to “{name}”.',
    'red.all_one':         'All ({n}) — exact',
    'red.all_other':       'All ({n}) — exact',
    'red.count_one':       '{n} color',
    'red.count_other':     '{n} colors',
    'red.intro_one':       'The image has {n} color. A palette holds up to {max}.',
    'red.intro_other':     'The image has {n} different colors. A palette holds up to {max} — fewer colors give more of a pixel-art look.',
    'red.after_one':       'After · {n} color',
    'red.after_other':     'After · {n} colors',
    'pal.hint.builtin':    'Built-in palettes are read-only. “Edit a copy” makes an editable one.',
    'pal.swatchTitle':     'Change the color',
    'pal.groupBuiltin':    'Built-in',
    'pal.groupCustom':     'Custom',
    'pal.quickTitle':      '{i} — {label}{extra}  (key {i})',
    'pal.currentErase':    'Erase (index 0)',
    'pal.currentFree':     'Free color',
    'pal.currentIndex':    'Index {i} — {label}',
    'pal.transparent':     'transparent',
    'lay.pin':             'Pin — keep it next to the canvas',
    'lay.unpin':           'Unpin — back to where it came from',
    'lay.float':           'Detach as a floating window',
    'lay.floatBar':        'Detach bar — move it freely',
    'lay.dockBar':         'Dock it again',
    'lay.pinBar':          'Pin to the side — a fixed column next to the canvas',
    'lay.unpinBar':        'Unpin — back to its usual place',
    'lay.grip':            'Drag to move',
    'lay.toolbar':         'Tools',
    'lay.mobilePin':       'Pin to the bottom — stays open',
    'lay.mobileUnpin':     'Put into the dock — opens from its icon',
    'lay.colorbar':        'Color bar',
    'lay.timeline':        'Timeline',

    'pv.info':      '{w}×{h} pixels · shown at {scale}×',
    'tl.frameTitle': 'Frame {i} · {ms} ms — tap to select, drag to move, Ctrl/Shift picks several',
    'tl.frameOf':   'frame {i}/{n}',
    'tl.lastFrame': 'The last frame stays — a sprite needs at least one.',
    'tl.multi':     'Select several frames — tapping marks instead of switching',
    'tl.multiOff':  'Leave multi-select',
    'tl.delOne':    'Delete frame',
    'tl.delMany':   'Delete {n} selected frames',
    'tl.layers':    'Layers',
    'tl.lyAdd':     'New layer above the active one',
    'tl.lyDup':     'Duplicate layer',
    'tl.lyDel':     'Delete layer',
    'out.tooBigLive': '// The sprite is large ({n} pixels across all frames) — the code is built only when you copy or save it.',
    'tg.defaultName': 'Tag {n}',
    'tg.barTitle':  '{name} · frames {a}–{b} · {dir} — click to edit',
    'qp.sorted':        'Sorted by shades — the image stayed the same. Ctrl+Z undoes it.',
    'qp.alreadySorted': 'The palette is already sorted by shades.',
    'qp.forked':        'Built-in palettes stay unchanged — the sprite now uses the sorted copy “{name}”.',
    'exp.gifTagsSaved': '{n} GIFs — one per tag.',
    'tg.name':      'Tag name',
    'tg.frames':    'Frames',
    'tg.dir':       'Direction',
    'tg.dir.forward':  'Forward',
    'tg.dir.reverse':  'Reverse',
    'tg.dir.pingpong': 'Ping-pong',
    'tg.play':      'Play',
    'tg.del':       'Delete',
    'tg.done':      'Done',
    'tl.contOn':    'Continuous — new frames share the previous image here. Click to turn off.',
    'tl.contOff':   'Not continuous — new frames are empty here. Click: continuous (good for backgrounds).',
    'tl.celsCopied':  '{n} cel(s) copied — Ctrl+V pastes at the active cel.',
    'tl.pasteNone':   'Nothing fits here — the cels have a different size.',
    'tl.linkNeedsTwo':'To link, select several frames — Shift-click or drag across the cels.',
    'tl.celTitle':  'Frame {i} · {name} — tap to select, Shift or drag spans a range, dragging inside the range moves it (Ctrl: copies)',

    'gd.chin':     'chin',
    'gd.chest':    'chest',
    'gd.navel':    'navel',
    'gd.hip':      'hip',
    'gd.crotch':   'crotch',
    'gd.knee':     'knee',
    'gd.lockBtn':          'Lock',
    'gd.unlockBtn':        'Unlock',
    'gd.removed':  'Guide removed.',

    'ly.name':        'Layer {n}',
    'ly.copyName':    '{name} copy',
    'ly.hide':        'Hide',
    'ly.show':        'Show',
    'ly.lock':        'Lock — nothing gets painted here then',
    'ly.unlock':      'Unlock',
    'ly.rowTitle':    '{name} — tap to select, drag to reorder, double-click to rename',
    'ly.lastLayer':   'The last layer stays — a sprite needs at least one.',
    'ly.nothingBelow':'There is nothing below the bottom layer to merge into.',
    'ly.lockedInfo':  'Layer “{name}” is locked — unlock it first (padlock in the layers panel).',
    'ly.hiddenInfo':  'Layer “{name}” is hidden — show it first (eye in the layers panel).',
    'list.frames_one':   '{n} frame',
    'list.frames_other': '{n} frames',
    'lay.resize':          'Drag to change the width',
    'lay.toolOpts':        'Tool options — or tap the active tool again',
    'tpl.pick':            'Load image …',
    'tpl.pickOther':       'Load another image …',
    'tpl.unnamed':         'Stencil',
    'tpl.restored':        'From your last visit — stays saved in this browser until you remove it.',
    'tpl.kept':            'Stays saved in this browser until you remove it.',
    'help.close':          'Close',
    'gd.hideBtn':          'Hide',
    'gd.showBtn':          'Show',
    'news.version':        'Version {v}',
    'news.loading':        'Loading …',
    'news.empty':          'There are no notes for the latest versions yet.',
    'news.offline':        'The notes could not be loaded right now — please try again later.',
    'help.backupRestore':  'Restore',
    'help.backupDownload': 'Download',
    'store.rescued':       'Your saved work could not be loaded. It has been kept safe and will not be overwritten — get it any time under Help → Backup.',
    'help.backupConfirm':  'Replace the current state with this backup? The current state is backed up first.',
    'help.backupLabel.backup': 'State from {date}',
    'help.backupLabel.rescue': 'Rescued state from {date}',
    'pp.search':           'Search palettes …',
    'pp.all':              'All',
    'pp.colors_one':       '{n} color',
    'pp.colors_other':     '{n} colors',
    'pp.active':           'active',
    'pp.activeTitle':      'Your sprite uses this palette right now',
    'pp.none':             'No palette found.',
    'fc.count':            '+{n} image colors',
    'fc.head':             '{n} colors without a palette slot — most used first. Click to pick.',
    'fc.more':             '… and {n} more, used less often.',
    'pal.showCount_one':   'Highlighted: {n} pixel in this color.',
    'pal.showCount_other': 'Highlighted: {n} pixels in this color.',
    'fc.swatch':           '{hex} · {n} px',
    'pal.optCurrent':      '— current palette —',
    'pal.optCustomSuffix': '{name} (custom)',
    'pal.colorAria':       'Color {i}',
    'pal.modalEdit':       'Edit palette “{name}”',
    'pal.modalNew':        'New palette',
    'pal.modalSave':       'Save',
    'pal.modalCreate':     'Create',
    'pal.needName':        'Please enter a name.',
    'pal.isBuiltin':       '“{name}” is a built-in palette — please pick another name.',
    'pal.exists':          'Palette “{name}” already exists — overwrite it?',
    'pal.overwrite':       'Overwrite',
    'pal.forked':          'Palette “{name}” created — double-click a color to change it.',
    'pal.deleted_one':     'Palette deleted — {n} sprite set to “{fallback}”.',
    'pal.deleted_other':   'Palette deleted — {n} sprites set to “{fallback}”.',
    'pal.confirmDelete':   'Really delete the palette “{name}”?{extra}',
    'pal.usedBy_one':      ' {n} sprite is using it right now.',
    'pal.usedBy_other':    ' {n} sprites are using it right now.',
    'pal.fromImage':       'Palette “{name}” created — {n} colors. Ctrl+Z undoes it.',

    'sprite.confirmDelete': 'Really delete the sprite “{name}”?',
    'sprite.created':       '“{name}” created.',
    'sprite.needName':      'Please enter a name.',
    'sprite.needSize':      'Width and height must be between 1 and 1024 — bigger works in the desktop app (up to 8192 × 8192).',
    'sprite.emptyGrid':     '— Empty grid —',
    'sprite.option':        '{name} ({w}×{h})',
    'sprite.confirmClear':  'Erase every pixel of this sprite?',
    'sprite.clearOk':       'Clear',

    'full.enter':      'Full screen',
    'full.enterTitle': 'Full screen (Esc to leave)',
    'full.exit':       'Leave',
    'full.exitTitle':  'Leave full screen (Esc)',

    'info.mirrorOff':   'Symmetry off',
    'info.mirrorOn':    'Symmetry: {axes}',
    'axes.both':        'both axes',
    'axes.x':           'vertical axis',
    'axes.y':           'horizontal axis',
    'info.tplOutside':  'Stencil: clicked outside the image',
    'info.tplTransp':   'Stencil: transparent area',
    'info.tplPipette':  'Stencil eyedropper: {hex}',
    'info.tplMove':     'Moving the stencil: x={x}px y={y}px',
    'info.dragCopy':    'Dragging a copy',
    'info.move':        'Moving',
    'info.moved':       'Moved',
    'info.marquee':     'Dragging open',
    'info.pickFree':    'Eyedropper: free color {hex}',
    'info.pickIndex':   'Eyedropper: index {i} — {label}',
    'info.lassoStart':  'Trace the shape — letting go closes it',
    'info.colorSel':    'Color select: {n} pixels{extra}',
    'info.colorSelNone': 'Color select: nothing hit — raise the tolerance?',
    'info.shapeStart':  'Dragging {shape} — start ({x}, {y})',
    'info.shapeDrag':   '{shape} {w}×{h} — {n} pixels',
    'info.wandDeleted': 'Magic wand: {n} pixels erased',
    'info.wandNone':    'Magic wand: nothing erased — raise the tolerance?',
    'info.index':       'index {i}',
    'info.pipetteAt':   'Eyedropper — ({x}, {y}) · {val}',
    'info.at':          '({x}, {y}) · {val}',
    'info.suffixPaint': ' → drawing',
    'info.suffixErase': ' → erasing',
    'info.drawn':       '{n} pixels drawn',
    'info.drawnNone':   'Nothing drawn',

    'sel.none':        'No selection',
    'sel.lasso':       '{prefix} — {n} points, letting go closes the shape',
    'sel.lassoPrefix': 'Dragging a shape',
    'sel.rect':        '{prefix}selection {w}×{h} at ({x}, {y})',
    'sel.pixels':      ' · {n} pixels',
    'sel.floating':    ' · floating',
    'sel.all':         'Everything selected',
    'sel.dropped':     'Selection dropped',
    'sel.copied':      '{n} pixels copied to the clipboard',
    'sel.copiedShort': '{n} pixels copied',
    'sel.cut':         'Cut — {n} pixels. Paste them again with Ctrl+V.',
    'sel.cutShort':    'Cut — {n} pixels',
    'sel.clipEmpty':   'The clipboard is empty — copy or cut something first.',
    'sel.pasted':      'Pasted — {n} pixels. Drag inside to move them.',
    'sel.erased':      'Selection erased — {n} pixels',
    'sel.filled':      'Selection filled — {n} pixels',

    'rot.discarded':  'Rotation discarded',
    'rot.applied':    'Rotation applied',
    'rot.shapeDrop':  'Shape discarded',
    'rot.preview':    '{scope} rotated by {deg}° — {w}×{h}',
    'rot.lossHint':   ' · corners outside the canvas fall away',
    'rot.applyHint':  ' · apply or discard',
    'rot.done':       '{scope} rotated — applied',
    'tf.flipH':       '{scope} flipped horizontally',
    'tf.flipV':       '{scope} flipped vertically',
    'tf.rot90':       '{scope} rotated by 90°',
    'tf.trimmed':     'Trimmed to {w}×{h}.',
    'tf.trimFail':    'Not trimmed — {reason}.',
    'tf.centered':    'Content moved to the middle.',
    'tf.centerFail':  'Not moved — {reason}.',
    'mod.sizeCurrent':  '“{name}” is currently {w}×{h} pixels.',
    'mod.sizeInvalid':  'Width and height must be between 1 and 1024 — bigger works in the desktop app (up to 8192 × 8192).',

    'tf.resized':     'Size is now {w}×{h}{lost}.',
    'tf.resizeLost':  ' — {n} pixels cut off',
    'tf.resizeFail':  'Size unchanged — {reason}.',
    'tf.confirmShrink': 'Make it smaller? Whatever no longer fits gets cut off.',
    'tf.shrinkOk':    'Resize',
    'tf.scaledUp':    'Scaled up to {w}×{h}.',
    'tf.scaledDown':  'Scaled down to {w}×{h}.',
    'tf.scaleFail':   'Not scaled — {reason}.',
    'tf.confirmHalve': 'Halve it? Every second pixel falls away.',
    'tf.halveOk':     'Halve',
    'reason.empty':     'empty',
    'reason.nothing':   'nothing to trim',
    'reason.centered':  'already centered',
    'reason.unchanged': 'unchanged',
    'reason.tooSmall':  'too small',
    'reason.tooBig':    'over 1024 pixels',

    'cln.bgRemoved':   'Background removed — {n} pixels.',
    'cln.bgNone':      'Nothing removed — raise the tolerance?',
    'cln.despeckled':  'Despeckled — {n} pixels adjusted.',
    'cln.despeckleNone': 'Nothing found to despeckle.',
    'cln.outlined':    'Outline drawn — {n} pixels.',
    'cln.outlineNone': 'No outline needed — is the sprite empty?',

    'info.size':       'Size {n}',
    'tabs.close':      'Close tab (middle click) — the sprite stays in the project',

    'mask.editHint':   'Editing the mask: painting hides, erasing reveals again.',
    'mask.editStart':  'Edit mask',
    'mask.editStop':   'Done with the mask — paint into the image again',
    'mask.on':         'Turn the mask on',
    'mask.off':        'Turn the mask off (everything visible)',
    'ly.nothingToMerge': 'Merging needs at least two visible layers.',
    'ly.mergedName':   'Merged',
    'lgt.applyNew':    'Add light layer',
    'lgt.applyUpdate': 'Recompute light',
    'lgt.castNew':     'Cast',
    'lgt.castUpdate':  'Cast again',
    'lgt.layerLight':  'Light · {name}',
    'lgt.layerShadow': 'Shadow · {name}',
    'lgt.statusOff':   'Acts on “{name}” — as a separate layer, the original stays.',
    'lgt.statusOn':    'Light for “{name}” is a separate layer — changes here recompute it.',
    'lgt.noBase':      'No layer the light could act on.',
    'lgt.done':        'Light applied — {lit} pixels brighter, {shaded} darker.',
    'lgt.none':        'Nothing lit — no edges or no matching palette colors (tick “Allow colors outside the palette”?).',
    'lgt.castDone':    'Drop shadow painted — {n} pixels.',
    'lgt.castNone':    'No room for a shadow — sprite empty or at the border?',

    'tpl.needSprite':  'Create a sprite first.',
    'tpl.needTpl':     'Load a stencil first.',
    'tpl.sampleFail':  'The stencil could not be sampled.',
    'tpl.noColors':    'No colors found in the stencil.',
    'tpl.traced':      'Stencil applied — {n} pixels ({mode}).',
    'tpl.tracedNone':  'No pixels changed — is the stencil placed over the grid?',
    'tpl.modePalette': 'palette colors',
    'tpl.modeRaw':     'original colors',
    'tpl.modeQuant':   '{n} colors',
    'tpl.imageEmpty':  'The image is empty — draw something or apply a stencil first.',

    'file.dirSet':       'Save folder: {name} — click to change it',
    'file.dirUnset':     'Pick a folder for PNG/PDF/files — it is remembered',
    'file.dirPicked':    'Save folder set: “{name}”. PNG, PDF and files land here from now on.',
    'file.confirmReset': 'Reset everything? Sprites and custom palettes will be lost.',
    'file.resetOk':      'Reset',
    'file.downloaded':   '“{name}” was downloaded (default downloads folder).',
    'file.downloadedTip': '“{name}” was downloaded (default downloads folder). Tip: pick a fixed folder with “Save folder”.',
    'file.downloadedTipIcon': '“{name}” was downloaded (into the default downloads folder). Tip: pick a fixed folder with “📁 Save folder”.',
    'file.savedIn':      '“{name}” saved in “{dir}”.',
    'file.saved':        '“{name}” saved.',
    'file.savedInOk':    '✅ “{name}” saved in “{dir}”.',
    'file.savedOk':      '✅ “{name}” saved.',
    'file.saveFailed':   'Saving failed — is the browser storage full? “Save project” writes a file.',
    'file.badProject':   'Invalid file — that is not a sprite project.',
    'file.readFailed':   'The file could not be read.',
    'file.clipboardOff': 'Clipboard not available — the text is selected, copy it with Ctrl+C.',
    'file.copied':       '✓ Copied',
    'file.saveAs':       'Save .{ext}',
    'file.saveAsTitle':  'Save as a {label} file',

    'exp.legendTitle':   'Palette — {n} colors',
    'exp.legendSorted':  'Palette — {n} colors (sorted by hue)',
    'exp.noSprites':     'No sprites to pack together.',
    'exp.gifTooMany':    'GIF holds at most 255 colors — this sprite has {n}. Reduce them first with “Image → palette …”.',
    'exp.sheetSaved':    'Spritesheet with {n} sprites saved — “{png}” and “{json}”{where}',
    'exp.sheetDownload': ' (in the downloads folder).',
    'exp.sheetIn':       ' in “{dir}”.',
    'exp.framesNote':    '{n} frames selected — PNG and PDF save one file each, the GIF holds just these frames.',
    'exp.framesSaved':   '{n} frames saved — from “{first}” to “{last}”{where}',
    'exp.framesDownload': ' (in the downloads folder).',
    'exp.framesIn':      ' in “{dir}”.',
    'exp.framesZip':     'Saved {n} frames as “{name}” — one archive, because your browser cannot pick a folder. Unpack and you are done.',
    'exp.pdfMissing':    'The PDF library has not loaded yet — wait a moment and try again.',

    'fmt.ts':   'number[][] with types — the classic for TypeScript projects.',
    'fmt.js':   'The same without types, as an ES module.',
    'fmt.json': 'Language-neutral — for your own pipelines, engines and tools.',
    'fmt.game': 'Flat data array (y · width + x), palette as #rrggbbaa with a material per color — for games, e.g. in C#.',
    'fmt.svg':  'A ready vector graphic: scales losslessly, drops straight in.',
    'fmt.css':  'A single element, pixelled with box-shadow — needs no image.',
    'fmt.c':    'Palette + indices as a uint8 array — for microcontrollers and LED matrices.',
    'fmt.py':   'Dict + list — for Pygame, Pillow or your own scripts.',
    'fmt.txt':  'A character grid with a key — good for diffs, docs and a quick look.',
    'fmt.reimport': '{hint} Can be imported again.',

    'imp.detected':     'Recognised: ',
    'imp.size':         '{w}×{h} pixels',
    'imp.paletteWith':  'palette with {n} colors',
    'imp.paletteNone':  'no palette found',
    'imp.restored':     '{n} free color pixels restored',
    'imp.name':         'name “{name}”',
    'imp.unknown':      ' — careful: index {list} appears in the grid but is missing from the palette.',
    'imp.nothing':      'Nothing pasted.',
    'imp.doneWithPal':  'Import done — palette “{name}” taken over and assigned.',
    'imp.donePlain':    'Import done. (No palette found in the text — the colors stay as they are.)',
    'imp.fallbackName': 'Import',
    'file.spriteAdded':  'Sprite “{name}” added to the project.',
    'file.spritesAdded': '{n} sprites added to the project.',
    'start.ask':        'Take your drawing from the start page along as a new sprite?',
    'start.take':       'Take it',
    'start.name':       'bitty',

    'bitty.hello':      'Hi, I’m Bitty! Want me to show you around real quick?',
    'bitty.show':       'Show me',
    'bitty.later':      'No thanks',
    'bitty.next':       'Next',
    'bitty.back':       'Back',
    'bitty.skip':       'End tour',
    'bitty.done':       'Let’s go',
    'bitty.close':      'Close',
    'bitty.quiet':      'Not on your own',
    'bitty.stepOf':     'Step {n} of {total}',
    'bitty.kind.tour':  'Tour',
    'bitty.kind.tip':   'Tip',
    'bitty.tourName.lesson': 'Hands-on: first animated sprite',
    'bitty.tourWords.lesson': 'lesson tutorial beginner learn practice first animated sprite Lektion Mitmachen üben lernen Anfänger',
    'bitty.l.hello':    'Fancy a mini lesson? Let’s make a small animated sprite together — in 6 steps. I’ll create a new 16 × 16 sprite for it; your picture stays as it is.',
    'bitty.l.name':     'My first animation',
    'bitty.l.stepOf':   'Lesson · step {n} of {total}',
    'bitty.l.skip':     'Skip',
    'bitty.l.quit':     'End lesson',
    'bitty.l.1':        'Grab the pencil and draw a little figure — an outline is enough. I’m watching.',
    'bitty.l.2':        'Now the fill tool: pick another color and click inside your figure.',
    'bitty.l.3':        'An animation needs a second frame. Duplicate this one.',
    'bitty.l.4':        'You’re in the new frame now. Change something — arm up, eyes shut, a pixel moved.',
    'bitty.l.5':        'And now play it! (Enter works too.)',
    'bitty.l.6':        'Finally export it as a GIF — then you can show it anywhere.',
    'bitty.l.yay.1':    'Great!',
    'bitty.l.yay.2':    'Just like that!',
    'bitty.l.yay.3':    'Nice!',
    'bitty.l.done':     'Done — your first animated sprite! Now you know the essentials. Click me any time for more.',
    'bitty.moreTours':  'More tours',
    'bitty.whichTour':  'Which tour should I show you?',
    'bitty.tourName.start':  'Getting started',
    'bitty.tourName.anim':   'Animation',
    'bitty.tourName.layers': 'Layers',
    'bitty.tourName.tiles':  'Tiles',
    'bitty.tourName.photo':  'Photo → sprite',
    'bitty.tourWords.start':  'tour getting started basics intro overview Einstieg erste Schritte Überblick',
    'bitty.tourWords.anim':   'tour animation animate frames timeline play GIF animieren abspielen',
    'bitty.tourWords.layers': 'tour layers layer mask opacity Ebenen Ebene Maske Deckkraft',
    'bitty.tourWords.tiles':  'tour tiles tilemap level game Godot Kacheln Spiel',
    'bitty.tourWords.photo':  'tour photo picture template trace Foto Bild Schablone Vorlage abpausen',
    'bitty.t.anim.1':   'This is the timeline: one column per frame, one row per layer. Clicking a cell picks frame and layer.',
    'bitty.t.anim.2':   'The easiest way to animate: duplicate a frame and change it a little. + inserts an empty frame.',
    'bitty.t.anim.3':   'Onion skin shows the neighbouring frames through — so you can see where things move.',
    'bitty.t.anim.4':   'Play (Enter). A tap on the canvas stops it again.',
    'bitty.t.anim.5':   'FPS sets the speed. Single frames can stay longer — say, for a blink.',
    'bitty.t.anim.6':   'Tags name a section like “walk” or “jump”: select frames, then create a tag.',
    'bitty.t.anim.7':   'Done? Export as GIF — it loops forever. With tags, one file per tag too.',
    'bitty.t.layers.1': 'Layers sit on top of each other, the top one is in front. The eye hides, the padlock locks.',
    'bitty.t.layers.2': 'New layer: e.g. keep outline and colour apart — then you can change one without touching the other.',
    'bitty.t.layers.3': 'Opacity of the active layer — handy for shadows or a sketch to trace over.',
    'bitty.t.layers.4': 'A mask hides parts of the layer without deleting anything. Painting hides, erasing reveals.',
    'bitty.t.layers.5': 'Merging puts the layer onto the one below — in every frame.',
    'bitty.t.tiles.1':  'For game levels: a tilemap layer is made of fixed-size tiles. Create a new one here.',
    'bitty.t.tiles.2':  'Or convert the active layer — identical spots become one tile.',
    'bitty.t.tiles.3':  '“Place tiles”: pick a tile and stamp it into the grid with the pencil. Paint a tile and it changes everywhere.',
    'bitty.t.tiles.4':  'Export for Godot: tile image, scene and JSON — just drop the folder into your project.',
    'bitty.t.photo.1':  'First load a photo as a template — it sits half-transparent over the grid.',
    'bitty.t.photo.2':  'Then take it onto the grid, ideally reduced to a few colours (about 8).',
    'bitty.t.photo.3':  'Image → palette turns those colours into a palette you can edit.',
    'bitty.t.photo.4':  'Remove the background — or delete single areas with the magic wand.',
    'bitty.t.photo.5':  'Smoothing clears stray pixels, an outline adds a contour. Tidy the rest with pencil and eraser.',
    'bitty.hintOff':    'Don’t show again',
    'bitty.h.locked':   'The layer “{name}” is locked — that’s why painting does nothing.',
    'bitty.h.unlock':   'Unlock',
    'bitty.h.hidden':   'The layer “{name}” is hidden — you’d be painting blind.',
    'bitty.h.show':     'Show it',
    'bitty.h.opacity':  'The layer “{name}” is at 0 % opacity — whatever you paint stays invisible.',
    'bitty.h.opacityFull': 'Set to 100 %',
    'bitty.h.color0':   'You’re painting with color 0 — it’s transparent and works like an eraser.',
    'bitty.h.color1':   'Use color 1',
    'bitty.h.maskEdit': 'You’re painting into the mask of “{name}”, not the picture. On purpose?',
    'bitty.h.leaveMask': 'Back to the picture',
    'bitty.h.masked':   'The mask of “{name}” hides the layer right here — that’s why you see nothing.',
    'bitty.h.maskOff':  'Turn the mask off',
    'bitty.searchPh':   'Search or command (e.g. lasso, new layer)',
    'bitty.kind.action': 'Command',
    'bitty.disabled':   '“{name}” isn’t possible right now — here it is, for later.',
    'bitty.danger':     'Here’s “{name}”. I’d rather not press that for you — it deletes something.',
    'bitty.m.export':   'Your first export — now it’s out in the world! I’m a little proud.',
    'bitty.m.anim':     'It moves! Your first animation is running.',
    'bitty.artLabel':   'Pixel art tip',
    'bitty.art.1':      'Silhouette first: fill your figure in one color. If it’s still recognisable, the shape works.',
    'bitty.art.2':      'Light works best from one side, usually top left — and the same everywhere in the picture.',
    'bitty.art.3':      'Don’t just make shadows darker, make them cooler too (towards blue/purple); light warmer (towards yellow). It feels more alive.',
    'bitty.art.4':      'Fewer colors look more unified: 4–8 per sprite are often enough. “Image → palette” helps you cut down.',
    'bitty.art.5':      'Clean lines climb in even steps (1-1-1 or 2-2-2). Clean Stroke removes the doubled corner pixels.',
    'bitty.art.6':      'Watch out for “pillow shading”: shadow all around the edge makes everything flat. Shade away from the light.',
    'bitty.art.7':      'The outline doesn’t have to be black — a dark shade of the fill color looks softer and fits better.',
    'bitty.art.8':      'Save the strongest contrast for what matters most, usually the eyes.',
    'bitty.art.9':      'An animation often needs only 2–4 frames. A frame that stays longer (duration) adds weight — say, when landing.',
    'bitty.art.10':     'Equal-width color bands running along the outline (“banding”) look mushy. Stagger the transitions instead.',
    'bitty.tip.11':     'Ctrl + K opens me anywhere. Type “new layer” or “gif” and hit Enter — I’ll do it right away.',
    'bitty.noHits':     'I can’t find anything for that — try another word.',
    'bitty.kind.help':  'Help',
    'bitty.kind.tool':  'Tool',
    'bitty.kind.panel': 'Panel',
    'bitty.kind.menu':  'Menu',
    'bitty.foundTool':  'There it is: {name}.',
    'bitty.foundPanel': 'You’ll find “{name}” here.',
    'bitty.use':        'Select it',
    'bitty.ok':         'Thanks',
    'bitty.tour.tools':    'These are your tools: pencil, brush, fill, eraser and more. Hover over one to see its shortcut.',
    'bitty.tour.colors':   'Here are your colors. One click picks the color you paint with.',
    'bitty.tour.canvas':   'And this is where you draw. Right-click erases, Ctrl + mouse wheel zooms.',
    'bitty.tour.timeline': 'The timeline: frames for animations and layers on top of each other. ▶ plays the animation.',
    'bitty.tour.export':   'Done? Under “Code & export” you save your picture as PNG, GIF, sprite sheet or code.',
    'bitty.tour.end':      'That’s it! Click me whenever you want a tip. All shortcuts are under Help (F1).',
    'bitty.tip.1':      'Hold Space and drag to move the picture — the middle mouse button works too.',
    'bitty.tip.2':      'Ctrl + mouse wheel zooms right where your pointer is.',
    'bitty.tip.3':      'Hold Shift while painting: the stroke stays horizontal, vertical or at 45°.',
    'bitty.tip.4':      'Alt + dragging with the right mouse button changes the brush size right on the canvas.',
    'bitty.tip.5':      'Your picture remembers color numbers, not colors. “Recolor sprite” in the palette panel gives it new colors in one go.',
    'bitty.tip.6':      'Onion skin in the timeline shows the neighbouring frames through — handy when animating.',
    'bitty.tip.7':      'Drag a selection with Alt held and the original stays put — you move a copy.',
    'bitty.tip.8':      'G shows and hides the guides. They never end up in an export.',
    'bitty.tip.9':      'Ctrl + S saves your whole project as a file — good as a backup or for another computer.',
    'bitty.tip.10':     'F1 opens the help with every shortcut.',
    'imp.errSvgNoRect':  'SVG recognised, but no <rect> found inside it.',
    'imp.errSvgNoFill':  'SVG recognised, but no <rect> with a fill color.',
    'imp.errSvgBig':     'The SVG is {w}×{h} — that grid would be far too fine.',
    'imp.errCssNoBlock': 'No box-shadow block found.',
    'imp.errCssNoPixel': 'box-shadow found, but no pixels could be read from it.',
    'imp.errCssBig':     'That would be {w}×{h} pixels — too big.',
    'imp.errCNoSize':    'C header without _WIDTH and _HEIGHT — the size is unknown.',
    'imp.errCBadSize':   'The size {w}×{h} is not usable.',
    'imp.errCNoData':    'C header without a _DATA array — no pixels found.',
    'imp.errCShort':     '_DATA has {have} values, {w}×{h} needs {need}.',
    'imp.errTxtNoGrid':  'No character grid found (lines of equal length made of . and 1-9).',
    'imp.errTxtBig':     'The grid is {w}×{h} — too big.',
    'imp.errNoArray':    'No valid number[][] array found. Expected [[0,1,…], …].',
    'imp.errGame':       'JSON (game) recognised, but {reason}',

    'mig.rescued_one':   '{n} edited legacy sprite kept',
    'mig.rescued_other': '{n} edited legacy sprites kept',
    'mig.palettes_one':   '{n} custom palette kept',
    'mig.palettes_other': '{n} custom palettes kept',
    'mig.note': 'The project was moved to the new, motif-free palette system — {notes}. Untouched dog/cat templates were removed.',

    'gen.freeSaved_one':   '// {n} free color was saved as index {from}+ (lossless)',
    'gen.freeSaved_other': '// {n} free colors were saved as indices {from}+ (lossless)',
    'gen.palette':      '// palette “{name}”',
    'gen.cssUsage':     '/* {name} — {w}×{h}. Usage: <div class="{cls}"></div>',
    'gen.cssHint':      '   A single 1×1 element, scaled up. --px sets the pixel size. */',
    'gen.cssMargin':    '/* room for the scaling */',
    'gen.cHead':        '// {name} — {w}×{h}, {n} colors',
    'gen.cNote':        '// index 0 is transparent; colors as 0xRRGGBB.',
    'gen.pyHead':       '# {name} — {w}×{h}. Index 0 is transparent.',
    'gen.txtLegend':    "Key ('.' = transparent):",
    'gen.framesJs':     '// Animation: {n} frames — {id}[frame][y][x], duration per frame in ms: {id}_DURATIONS',
    'gen.framesPy':     '# Animation: {n} frames — {id}[frame][y][x], duration per frame in ms: {id}_DURATIONS',
    'gen.framesC':      '// Animation: {n} frames — {id}_DATA[frame][y * WIDTH + x], duration in ms: {id}_DURATIONS',
    'gen.cssAnim':      '/* Animation: {n} frames, {ms} ms per loop, runs forever. */',

    'game.materials':      'Material per color — palette “{name}”',
    'game.materialAria':   'Material for color {i}',
    'game.materialNote':   'Applies to every sprite using this palette. Index 0 is always “empty”, free colors get “none”.',
    'game.exportFailed':   'Export aborted: {reason}',
    'game.err.version':    'unknown version {version}.',
    'game.err.size':       'invalid size {w}×{h}.',
    'game.err.noPalette':  'the palette is empty.',
    'game.err.zeroOpaque': 'index 0 must be transparent but is {color}.',
    'game.err.badColor':   'invalid color {color}.',
    'game.err.badMaterial':'unknown material “{material}” at index {i}.',
    'game.err.length':     'data has {len} values, expected {w} × {h} = {expected}.',
    'game.err.index':      'pixel ({x}, {y}) has index {value}, valid is 0 to {max}.',
    'game.err.durations':  'durations needs {need} whole numbers (ms), one per frame.',
    'game.err.region':     'region “{name}” does not lie fully inside the image.',
  },
};

// ── Österreichisch ──────────────────────────────────────────────────
// Nachtraeglich eingehaengt, damit die Tabellen oben unberuehrt bleiben.
STATIC.at = STATIC_AT;
MSG.at = MSG_AT;
