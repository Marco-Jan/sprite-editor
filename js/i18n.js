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
export function colorLabel(i) { return t(`color.label.${i}`); }

// Kurzform für enge Stellen (Quick-Palette, Statuszeile).
export function colorLabelShort(i) { return t(`color.short.${i}`); }

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
    btn.setAttribute('aria-pressed', String(on));
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

    // ── Sprite-Panel ──
    'sp.title':       'Sprites',
    'sp.new':         '+ New sprite',
    'sp.search':      'Search sprites…',
    'sp.layer':       'Layer',
    'sp.refTitle':    'A second sprite as a semi-transparent reference — you keep editing the active one',
    'sp.refToggle':   'Show / hide the layer',
    'sp.refOpacity':  'Layer opacity',
    'sp.refFront':    'in front',
    'sp.refFrontTitle': 'Put the layer above the active sprite',
    'sp.refSwap':     'Swap',
    'sp.refSwapTitle': 'Swap the layer and the active sprite',
    'sp.refNote':     'Copy with <b>Ctrl+C</b> here and <b>Ctrl+V</b> in the other sprite.',

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
    'tool.strength':    'Strength',
    'tool.tolerance':   'Tolerance',
    'tool.shapeFill':   'Filled',
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
    'pal.title':        'Colors',
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
    'pal.fromImage':    'Image → palette',
    'pal.fromImageTitle': 'Turn the colors of the current image into an editable palette',

    // ── Schablone ──
    'tpl.title':        'Stencil',
    'tpl.opacity':      'Opacity',
    'tpl.size':         'Size',
    'tpl.center':       'Center',
    'tpl.clear':        'Remove',
    'tpl.trace':        'To palette',
    'tpl.traceTitle':   'Snap the stencil colors onto the current palette',
    'tpl.traceRaw':     'Raw colors',
    'tpl.traceRawTitle': 'Take the stencil colors as free pixels — photo-realistic',
    'tpl.reduce':       'Reduce to',
    'tpl.colors':       'colors',
    'tpl.apply':        'Apply',
    'tpl.applyTitle':   'Sample the stencil and reduce its colors to N dominant tones (median cut)',

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
    'img.width':        'Width in pixels',
    'img.height':       'Height in pixels',
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

    // ── Modal: Import ──
    'mod.impTitle':     'Import a sprite',
    'mod.impIntro':     'Pick a file or paste text — the editor reads <b>every format it also writes</b>. The format is recognised from the content, the file extension does not matter.',
    'mod.impIntro2':    'TypeScript, JavaScript, JSON, Python and C header carry the color numbers along and come back unchanged. SVG, CSS and the text grid know no numbers — there the picture stays the same but the colors are renumbered.',
    'mod.impFile':      'Choose a file',
    'mod.impPh':        'Paste here — for example:\n\nexport const HERO: number[][] = [\n  [0,1,2],\n];\n\n… or an SVG, a box-shadow block, a C header\nor a text grid.',
    'mod.impUsePal':    'Take the palette from the file and assign it to the sprite',
    'mod.impCurrent':   'Into current sprite',
    'mod.impCurrentTitle': 'Overwrites the grid of the current sprite',
    'mod.impNew':       'As a new sprite',

    // ── Bestätigungs-Toast ──
    'mod.confirmCancel': 'Cancel',
    'mod.confirmOk':     'Delete',

    // ── Hilfe-Modal ──
    'help.title':   'Help',
    'help.close':   'Close',
    'help.intro':   'A pixel editor with a photo stencil. Draw freehand — or trace a photo as a <b>stencil</b> and have it turned into a clean sprite automatically.',

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
      + '<div><b>Fill</b> — the connected area of the same value.</div>'
      + '<div><b>Eraser</b> — sets pixels back to transparent.</div>'
      + '<div><b>Magic wand</b> — erases a connected <i>similar</i> area; <i>tolerance</i> decides how much deviation still counts.</div>'
      + '<div><b>Line · Rectangle · Ellipse</b> — drag it open, the preview shows the result, letting go draws it. <i>Filled</i> switches between outline and area.</div>'
      + '<div><b>Marquee · Lasso · Color select</b> — three ways to the same thing: an area you move as a whole.</div>',

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

    'help.h.layer': 'Layer — working with two sprites',
    'help.layer': ''
      + '<div>Below the sprite list you can show a <b>second sprite as a layer</b>: semi-transparent, aligned to the top left, with its own palette.</div>'
      + '<div>Only the active sprite is ever edited — the layer is pure reference. <b>👁</b> hides it, the slider sets the opacity, <b>behind/in front</b> puts it under or over the image (handy for tracing outlines).</div>'
      + '<div><b>Swap</b> exchanges the roles: the layer becomes the one you edit, the previous sprite becomes the layer.</div>'
      + '<div>Moving parts across: select in one sprite and press <span class="kbd">Ctrl</span>+<span class="kbd">C</span>, switch to the other, <span class="kbd">Ctrl</span>+<span class="kbd">V</span>. What you paste floats and can be pushed into place before it settles.</div>',

    'help.h.stencil': 'Stencil',
    'help.stencil': ''
      + '<div>Load an image, move it with <span class="kbd">Shift</span>+left-drag, set opacity and size with the sliders.</div>'
      + '<div>Hold <span class="kbd">Shift</span> → the stencil comes fully to the front.</div>'
      + '<div><span class="kbd">Shift</span>+right-click → stencil eyedropper (the exact color from the image).</div>'
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
      + '<div><b>Import</b> reads <code>number[][]</code> from text or file — TypeScript, JavaScript and JSON. A palette block that comes with it is created as a palette of your own and assigned.</div>'
      + '<div>The <b>code box</b> produces the export in the chosen <b>format</b>. Free eyedropper colors are kept as indices above the palette — with TS, JS and JSON the round trip is lossless.</div>'
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
      + '<div><b>PNG / PDF</b> export with transparency; with <i>color key</i> the palette is rendered into the image.</div>'
      + '<div><b>Spritesheet</b> packs all sprites into equally sized cells and drops a JSON atlas with names and coordinates next to it — engines read that straight away.</div>'
      + '<div><b>Save project / Open</b> writes all sprites and palettes into one JSON file.</div>',

    'help.h.keys': 'Keyboard shortcuts',
    'help.keys': ''
      + '<div class="sc-row"><b>Click</b><span>Draw</span></div>'
      + '<div class="sc-row"><b>Right-click</b><span>Erase (hold for continuous)</span></div>'
      + '<div class="sc-row"><b>Alt + click</b><span>Eyedropper on the grid</span></div>'
      + '<div class="sc-row"><b>Hold Shift</b><span>Stencil to the front</span></div>'
      + '<div class="sc-row"><b>Shift + left + drag</b><span>Move the stencil</span></div>'
      + '<div class="sc-row"><b>Shift + right-click</b><span>Stencil eyedropper</span></div>'
      + '<div class="sc-row"><b>0 – 9</b><span>Pick a color index</span></div>'
      + '<div class="sc-row"><b>P B S F E W</b><span>Pencil · Brush · Spray · Fill · Eraser · Magic wand</span></div>'
      + '<div class="sc-row"><b>I R O</b><span>Line · Rectangle · Ellipse</span></div>'
      + '<div class="sc-row"><b>A L K</b><span>Marquee · Lasso · Color select</span></div>'
      + '<div class="sc-row"><b>Ctrl + mouse wheel</b><span>Zoom</span></div>'
      + '<div class="sc-row"><b>Drag inside the selection</b><span>Cut the area out and move it</span></div>'
      + '<div class="sc-row"><b>Alt + drag</b><span>Move a copy (the original stays)</span></div>'
      + '<div class="sc-row"><b>Arrow keys</b><span>Nudge the selection pixel by pixel</span></div>'
      + '<div class="sc-row"><b>Ctrl + A / C / X / V</b><span>All · Copy · Cut · Paste</span></div>'
      + '<div class="sc-row"><b>Del</b><span>Erase the selection</span></div>'
      + '<div class="sc-row"><b>Enter</b><span>Apply the rotation</span></div>'
      + '<div class="sc-row"><b>Ctrl + Z</b><span>Undo</span></div>'
      + '<div class="sc-row"><b>Ctrl + Y</b><span>Redo</span></div>'
      + '<div class="sc-row"><b>Esc</b><span>Deselect, close a dialog or leave full screen</span></div>',
  },
};

// ════════════════════════════════════════════════════════════════════
// MSG — Laufzeit-Texte (alles, was JS erzeugt)
// ════════════════════════════════════════════════════════════════════
const MSG = {
  de: {
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
    'pal.hint.custom':     'Swatch anklicken zum Ändern — das Bild färbt sich live um.',
    'pal.hint.builtin':    'Eingebaute Paletten sind schreibgeschützt. „Kopie bearbeiten“ macht sie änderbar.',
    'pal.swatchTitle':     'Farbe ändern',
    'pal.groupBuiltin':    'Eingebaut',
    'pal.groupCustom':     'Eigene',
    'pal.quickTitle':      '{i} — {label}{extra}  (Taste {i})',
    'pal.currentErase':    'Radieren (Index 0)',
    'pal.currentFree':     'Freie Farbe',
    'pal.currentIndex':    'Index {i} — {label}',
    'pal.transparent':     'transparent',
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
    'pal.forked':          'Palette „{name}“ angelegt — die Farb-Swatches rechts sind jetzt änderbar.',
    'pal.deleted_one':     'Palette gelöscht — {n} Sprite auf „{fallback}“ gesetzt.',
    'pal.deleted_other':   'Palette gelöscht — {n} Sprites auf „{fallback}“ gesetzt.',
    'pal.confirmDelete':   'Palette „{name}“ wirklich löschen?{extra}',
    'pal.usedBy_one':      ' {n} Sprite nutzt sie gerade.',
    'pal.usedBy_other':    ' {n} Sprites nutzen sie gerade.',
    'pal.fromImage':       'Palette „{name}“ erstellt — {n} Farben. Rechts direkt editierbar, das Bild färbt sich live um.',

    // Sprites
    'sprite.confirmDelete': 'Sprite „{name}“ wirklich löschen?',
    'sprite.created':       '„{name}“ angelegt.',
    'sprite.needName':      'Bitte einen Namen eingeben.',
    'sprite.needSize':      'Breite und Höhe müssen zwischen 1 und 256 liegen.',
    'sprite.emptyGrid':     '— Leeres Grid —',
    'sprite.option':        '{name} ({w}×{h})',
    'sprite.confirmClear':  'Alle Pixel dieses Sprites löschen?',
    'sprite.clearOk':       'Leeren',

    // Ebene
    'ref.none':      'keine',
    'ref.noSecond':  'kein zweiter Sprite',
    'ref.front':     'davor',
    'ref.behind':    'dahinter',
    'ref.on':        'Ebene: „{name}“ liegt {pos}',
    'ref.posFront':  'darüber',
    'ref.posBehind': 'darunter',
    'ref.off':       'Ebene aus',
    'ref.swapped':   'Getauscht — „{now}“ wird bearbeitet, „{before}“ liegt als Ebene',

    // Vollbild
    'full.enter':      '⤢ Vollbild',
    'full.enterTitle': 'Vollbild (Esc zum Schließen)',
    'full.exit':       '⤡ Beenden',
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
    'mod.sizeInvalid':  'Breite und Höhe müssen zwischen 1 und 256 liegen.',

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
    'reason.tooBig':    'über 256 Pixel',

    // Aufräumen
    'cln.bgRemoved':   'Hintergrund entfernt — {n} Pixel.',
    'cln.bgNone':      'Nichts entfernt — Toleranz erhöhen?',
    'cln.despeckled':  'Geglättet — {n} Pixel angepasst.',
    'cln.despeckleNone': 'Nichts zu glätten gefunden.',
    'cln.outlined':    'Outline gezeichnet — {n} Pixel.',
    'cln.outlineNone': 'Keine Outline nötig — Sprite leer?',

    // Schablone
    'tpl.needSprite':  'Erst einen Sprite anlegen.',
    'tpl.needTpl':     'Erst eine Schablone laden.',
    'tpl.sampleFail':  'Schablone konnte nicht abgetastet werden.',
    'tpl.noColors':    'Keine Farben in der Schablone gefunden.',
    'tpl.traced':      'Schablone übernommen — {n} Pixel ({mode}).',
    'tpl.tracedNone':  'Keine Pixel geändert — Schablone über dem Grid positionieren?',
    'tpl.modePalette': 'Palette',
    'tpl.modeRaw':     'Rohfarben',
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
    'file.saveFailed':   'Speichern fehlgeschlagen — localStorage voll? (Limit ~5 MB)',
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
    'exp.sheetSaved':    'Spritesheet mit {n} Sprites gespeichert — „{png}“ und „{json}“{where}',
    'exp.sheetDownload': ' (im Download-Ordner).',
    'exp.sheetIn':       ' in „{dir}“.',
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
  },

  en: {
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
    'pal.hint.custom':     'Click a swatch to change it — the image recolors live.',
    'pal.hint.builtin':    'Built-in palettes are read-only. “Edit a copy” makes an editable one.',
    'pal.swatchTitle':     'Change the color',
    'pal.groupBuiltin':    'Built-in',
    'pal.groupCustom':     'Custom',
    'pal.quickTitle':      '{i} — {label}{extra}  (key {i})',
    'pal.currentErase':    'Erase (index 0)',
    'pal.currentFree':     'Free color',
    'pal.currentIndex':    'Index {i} — {label}',
    'pal.transparent':     'transparent',
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
    'pal.forked':          'Palette “{name}” created — the color swatches on the right can now be edited.',
    'pal.deleted_one':     'Palette deleted — {n} sprite set to “{fallback}”.',
    'pal.deleted_other':   'Palette deleted — {n} sprites set to “{fallback}”.',
    'pal.confirmDelete':   'Really delete the palette “{name}”?{extra}',
    'pal.usedBy_one':      ' {n} sprite is using it right now.',
    'pal.usedBy_other':    ' {n} sprites are using it right now.',
    'pal.fromImage':       'Palette “{name}” created — {n} colors. Editable on the right, the image recolors live.',

    'sprite.confirmDelete': 'Really delete the sprite “{name}”?',
    'sprite.created':       '“{name}” created.',
    'sprite.needName':      'Please enter a name.',
    'sprite.needSize':      'Width and height must be between 1 and 256.',
    'sprite.emptyGrid':     '— Empty grid —',
    'sprite.option':        '{name} ({w}×{h})',
    'sprite.confirmClear':  'Erase every pixel of this sprite?',
    'sprite.clearOk':       'Clear',

    'ref.none':      'none',
    'ref.noSecond':  'no second sprite',
    'ref.front':     'in front',
    'ref.behind':    'behind',
    'ref.on':        'Layer: “{name}” sits {pos}',
    'ref.posFront':  'above',
    'ref.posBehind': 'below',
    'ref.off':       'Layer off',
    'ref.swapped':   'Swapped — “{now}” is being edited, “{before}” is now the layer',

    'full.enter':      '⤢ Full screen',
    'full.enterTitle': 'Full screen (Esc to leave)',
    'full.exit':       '⤡ Leave',
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
    'mod.sizeInvalid':  'Width and height must be between 1 and 256.',

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
    'reason.tooBig':    'over 256 pixels',

    'cln.bgRemoved':   'Background removed — {n} pixels.',
    'cln.bgNone':      'Nothing removed — raise the tolerance?',
    'cln.despeckled':  'Despeckled — {n} pixels adjusted.',
    'cln.despeckleNone': 'Nothing found to despeckle.',
    'cln.outlined':    'Outline drawn — {n} pixels.',
    'cln.outlineNone': 'No outline needed — is the sprite empty?',

    'tpl.needSprite':  'Create a sprite first.',
    'tpl.needTpl':     'Load a stencil first.',
    'tpl.sampleFail':  'The stencil could not be sampled.',
    'tpl.noColors':    'No colors found in the stencil.',
    'tpl.traced':      'Stencil applied — {n} pixels ({mode}).',
    'tpl.tracedNone':  'No pixels changed — is the stencil placed over the grid?',
    'tpl.modePalette': 'palette',
    'tpl.modeRaw':     'raw colors',
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
    'file.saveFailed':   'Saving failed — is localStorage full? (limit ~5 MB)',
    'file.badProject':   'Invalid file — that is not a sprite project.',
    'file.readFailed':   'The file could not be read.',
    'file.clipboardOff': 'Clipboard not available — the text is selected, copy it with Ctrl+C.',
    'file.copied':       '✓ Copied',
    'file.saveAs':       'Save .{ext}',
    'file.saveAsTitle':  'Save as a {label} file',

    'exp.legendTitle':   'Palette — {n} colors',
    'exp.legendSorted':  'Palette — {n} colors (sorted by hue)',
    'exp.noSprites':     'No sprites to pack together.',
    'exp.sheetSaved':    'Spritesheet with {n} sprites saved — “{png}” and “{json}”{where}',
    'exp.sheetDownload': ' (in the downloads folder).',
    'exp.sheetIn':       ' in “{dir}”.',
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
    'game.err.region':     'region “{name}” does not lie fully inside the image.',
  },
};

// ── Österreichisch ──────────────────────────────────────────────────
// Nachtraeglich eingehaengt, damit die Tabellen oben unberuehrt bleiben.
STATIC.at = STATIC_AT;
MSG.at = MSG_AT;
