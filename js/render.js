// ════════════════════════════════════════════════════════════════════
// RENDER — alle DOM-/Canvas-Render-Funktionen
// ════════════════════════════════════════════════════════════════════
// Liest aus state, schreibt ins DOM. Event-Bindings für statische Elemente
// leben in app.js; nur Handler an dynamisch erzeugten Elementen (Sprite-Karten,
// Farb-Swatches) werden hier gesetzt und rufen dann renderCallbacks auf.
import {
  state, sprites, customPalettes,
  getGrid, getSprite, getPal, getPaletteName, getMaxIdx,
  getAllPaletteOptions, isCustomPalette, listSprites, getPaletteByName,
} from './state.js';
import { COLOR_LABELS, COLOR_LABELS_SHORT, PALETTE_GROUP_SPLIT } from './data.js';

// Callbacks, die app.js verdrahtet — vermeidet Zirkularimporte zwischen
// render und den Feature-Modulen (sprites/palettes/storage).
export const renderCallbacks = {
  onSave:            () => {},
  onSelectSprite:    (_id) => {},
  onRenameSprite:    (_id) => {},
  onDeleteSprite:    (_id) => {},
  onDuplicateSprite: (_id) => {},
  onOpenPaletteModal:() => {},
  onEditPalette:     (_name) => {},
  onDeletePalette:   (_name) => {},
  onImageToPalette:  () => {},
};

// ────────────────────────────────────────────────────────────────────
// Eine Grid-Zelle → CSS-Farbe (oder null = nichts zeichnen).
//   0          → transparent
//   1-9        → Palette-Index
//   "#RRGGBB"  → freie Farbe (Pipette / Rohfarben-Trace)
// ────────────────────────────────────────────────────────────────────
export function cellToColor(c, palette) {
  if (c === 0) return null;
  if (typeof c === 'string' && c[0] === '#') return c;
  return palette[c] || null;
}

// SVG-String für eine Sprite-Vorschau (Thumbnails in der Sprite-Liste).
export function svgSprite(grid, palette, scale) {
  const H = grid.length, W = grid[0].length;
  let r = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fill = cellToColor(grid[y][x], palette);
    if (fill) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W * scale}" height="${H * scale}" `
       + `style="image-rendering:pixelated;display:block" xmlns="http://www.w3.org/2000/svg">${r}</svg>`;
}

// HTML-Escaping für Nutzer-Eingaben (Sprite-/Palettennamen landen im innerHTML).
function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ────────────────────────────────────────────────────────────────────
// SPRITE-LISTE (linke Spalte)
// ────────────────────────────────────────────────────────────────────
export function renderSpriteList() {
  const list = document.getElementById('sprite-list');
  if (!list) return;
  list.innerHTML = '';

  const q = (document.getElementById('sprite-search')?.value || '').trim().toLowerCase();
  const all = listSprites();
  const shown = q ? all.filter(s => s.name.toLowerCase().includes(q)) : all;

  const countEl = document.getElementById('sprite-count');
  if (countEl) countEl.textContent = all.length ? String(all.length) : '';

  // Suchfeld erst einblenden, wenn die Liste lang genug ist, um Suchen zu
  // rechtfertigen — sonst ist es nur Rauschen. Bei aktivem Filter bleibt es da.
  const searchEl = document.getElementById('sprite-search');
  if (searchEl) searchEl.hidden = all.length < 6 && !q;

  if (!all.length) {
    list.innerHTML = '<p class="empty-note">Noch keine Sprites. Leg oben einen an.</p>';
    return;
  }
  if (!shown.length) {
    list.innerHTML = `<p class="empty-note">Kein Sprite passt zu „${esc(q)}“.</p>`;
    return;
  }

  shown.forEach(sp => {
    const card = document.createElement('div');
    card.className = 'sprite-card' + (sp.id === state.curSprite ? ' is-active' : '');
    card.tabIndex = 0;
    card.title = `${sp.name} — ${sp.grid[0].length}×${sp.grid.length}, Palette „${sp.palette}“`;

    const thumb = document.createElement('div');
    thumb.className = 'sprite-thumb';
    thumb.innerHTML = svgSprite(sp.grid, getPaletteFor(sp), 40 / Math.max(sp.grid.length, sp.grid[0].length));

    const meta = document.createElement('div');
    meta.className = 'sprite-meta';
    meta.innerHTML =
      `<span class="sprite-name">${esc(sp.name)}</span>` +
      `<span class="sprite-sub">${sp.grid[0].length}×${sp.grid.length} · ${esc(sp.palette)}</span>`;

    const acts = document.createElement('div');
    acts.className = 'sprite-acts';
    acts.appendChild(iconBtn('✎', 'Umbenennen', e => { e.stopPropagation(); renderCallbacks.onRenameSprite(sp.id); }));
    acts.appendChild(iconBtn('⧉', 'Duplizieren', e => { e.stopPropagation(); renderCallbacks.onDuplicateSprite(sp.id); }));
    acts.appendChild(iconBtn('×', 'Löschen', e => { e.stopPropagation(); renderCallbacks.onDeleteSprite(sp.id); }, 'is-danger'));

    card.append(thumb, meta, acts);
    card.addEventListener('click', () => renderCallbacks.onSelectSprite(sp.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderCallbacks.onSelectSprite(sp.id); }
    });
    list.appendChild(card);
  });
}

function iconBtn(label, title, onClick, extraClass = '') {
  const b = document.createElement('button');
  b.className = 'icon-btn ' + extraClass;
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}

// Palette eines beliebigen Sprite-Datensatzes (nicht nur des aktiven).
function getPaletteFor(sp) {
  return getPaletteByName(sp.palette);
}

// ────────────────────────────────────────────────────────────────────
// EDITOR-CANVAS
// ────────────────────────────────────────────────────────────────────
export function renderEditor() {
  const canvas = document.getElementById('editor-canvas');
  if (!canvas) return;
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const cs = state.cellSize;

  canvas.width  = W * cs;
  canvas.height = H * cs;
  const ctx = canvas.getContext('2d');
  const pal = getPal();

  // Schachbrett-Hintergrund (zeigt Transparenz an)
  const [bg1, bg2] = state.editorBg === 'bw' ? ['#ffffff', '#d8d8d8'] : ['#20202c', '#2a2a38'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ctx.fillStyle = (x + y) % 2 === 0 ? bg1 : bg2;
    ctx.fillRect(x * cs, y * cs, cs, cs);
  }

  // Pixel
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fill = cellToColor(grid[y][x], pal);
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x * cs, y * cs, cs, cs); }
  }

  // Grid-Linien — bei sehr kleinen Zellen weglassen, sonst wird alles Raster.
  if (cs >= 6) {
    ctx.strokeStyle = state.editorBg === 'bw' ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x++) { ctx.moveTo(x * cs + 0.5, 0); ctx.lineTo(x * cs + 0.5, H * cs); }
    for (let y = 0; y <= H; y++) { ctx.moveTo(0, y * cs + 0.5); ctx.lineTo(W * cs, y * cs + 0.5); }
    ctx.stroke();
  }

  updateStageTitle();
}

// Sprite-Name + Maße über dem Canvas.
export function updateStageTitle() {
  const sp = getSprite();
  const nameEl = document.getElementById('stage-title');
  const dimEl  = document.getElementById('stage-dims');
  if (nameEl) nameEl.textContent = sp ? sp.name : 'Kein Sprite';
  if (dimEl) {
    dimEl.textContent = sp ? `${sp.grid[0].length}×${sp.grid.length} · ${sp.palette}` : '';
  }
  const docTitle = document.getElementById('doc-title');
  if (docTitle) docTitle.textContent = sp ? sp.name : '';
}

// Maus-/Touch-Event → Grid-Zelle (oder null wenn außerhalb)
export function cellFromEvent(e) {
  const canvas = document.getElementById('editor-canvas');
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / state.cellSize);
  const y = Math.floor((e.clientY - r.top) / state.cellSize);
  const g = getGrid();
  if (x < 0 || y < 0 || x >= g[0].length || y >= g.length) return null;
  return { x, y };
}

// ────────────────────────────────────────────────────────────────────
// MAL-OPERATIONEN
// ────────────────────────────────────────────────────────────────────
// Nach einer Änderung: Canvas + abhängige Anzeigen auffrischen.
function afterPaint() {
  renderEditor();
  renderSpriteList();
  updateOutput();
  renderCallbacks.onSave();
}

export function paintCell(x, y) {
  const g = getGrid();
  if (g[y][x] === state.curColor) return;
  g[y][x] = state.curColor;
  afterPaint();
}

export function paintBrush(x, y) {
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const lo = -Math.floor((state.brushSize - 1) / 2);
  const hi =  Math.floor(state.brushSize / 2);
  const threshold = state.brushStrength / 100;
  let changed = false;
  for (let dy = lo; dy <= hi; dy++) {
    for (let dx = lo; dx <= hi; dx++) {
      if (threshold < 1 && Math.random() > threshold) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && grid[ny][nx] !== state.curColor) {
        grid[ny][nx] = state.curColor;
        changed = true;
      }
    }
  }
  if (changed) afterPaint();
}

export function paintSpray(x, y) {
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const r = state.brushSize;
  const count = Math.max(1, Math.round(state.brushStrength / 10));
  let changed = false;
  for (let i = 0; i < count; i++) {
    let dx, dy;
    do {
      dx = (Math.random() * 2 - 1) * r;
      dy = (Math.random() * 2 - 1) * r;
    } while (dx * dx + dy * dy > r * r);
    const nx = x + Math.round(dx), ny = y + Math.round(dy);
    if (nx >= 0 && ny >= 0 && nx < W && ny < H && grid[ny][nx] !== state.curColor) {
      grid[ny][nx] = state.curColor;
      changed = true;
    }
  }
  if (changed) afterPaint();
}

export function floodFill(startX, startY) {
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  const target = grid[startY][startX];
  const fill = state.curColor;
  if (target === fill) return;
  const stack = [[startX, startY]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H || grid[y][x] !== target) continue;
    grid[y][x] = fill;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  afterPaint();
}

// ────────────────────────────────────────────────────────────────────
// QUICK-PALETTE — Swatch-Leiste über dem Canvas
// ────────────────────────────────────────────────────────────────────
export function renderQuickPalette() {
  const qp = document.getElementById('quick-palette');
  if (!qp) return;
  const pal = getPal();
  const maxIdx = getMaxIdx();
  qp.innerHTML = '';

  for (let i = 0; i <= maxIdx; i++) {
    const color = pal[i];
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'qp-swatch' + (i === state.curColor ? ' is-active' : '') + (i === 0 ? ' is-transparent' : '');
    el.title = `${i} — ${COLOR_LABELS_SHORT[i] || ''}${color && i !== 0 ? ' · ' + color : ''}  (Taste ${i})`;
    if (i !== 0) el.style.background = color || 'var(--surface-3)';

    const idx = document.createElement('span');
    idx.className = 'qp-idx';
    idx.textContent = i;
    el.appendChild(idx);

    el.addEventListener('click', () => { state.curColor = i; syncColorActive(); });
    qp.appendChild(el);

    if (i === PALETTE_GROUP_SPLIT) {
      const sep = document.createElement('span');
      sep.className = 'qp-sep';
      qp.appendChild(sep);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// AKTUELLE FARBE (Kopf des Farb-Panels)
// ────────────────────────────────────────────────────────────────────
export function updateCurrentColorIndicator() {
  const sw  = document.querySelector('#current-color .cc-swatch');
  const hex = document.querySelector('#current-color .cc-hex');
  const lbl = document.querySelector('#current-color .cc-label');
  if (!sw || !hex) return;

  if (state.curColor === 0) {
    sw.style.background = '';
    sw.classList.add('is-transparent');
    hex.textContent = 'transparent';
    if (lbl) lbl.textContent = 'Radieren (Index 0)';
    return;
  }
  sw.classList.remove('is-transparent');

  if (typeof state.curColor === 'string' && state.curColor[0] === '#') {
    sw.style.background = state.curColor;
    hex.textContent = state.curColor;
    if (lbl) lbl.textContent = 'Freie Farbe';
  } else {
    const color = getPal()[state.curColor] || '#888888';
    sw.style.background = color;
    hex.textContent = color;
    if (lbl) lbl.textContent = `Index ${state.curColor} — ${COLOR_LABELS_SHORT[state.curColor] || ''}`;
  }
}

// Aktiv-Markierung ohne Full-Re-Render.
export function syncColorActive() {
  const isHex = typeof state.curColor === 'string';
  document.querySelectorAll('.qp-swatch').forEach((el, i) =>
    el.classList.toggle('is-active', !isHex && i === state.curColor));
  document.querySelectorAll('.color-item').forEach(el =>
    el.classList.toggle('is-active', !isHex && Number(el.dataset.idx) === state.curColor));
  updateCurrentColorIndicator();
}

// ────────────────────────────────────────────────────────────────────
// FARB-PANEL (rechte Spalte)
// ────────────────────────────────────────────────────────────────────

// Das Paletten-Dropdown befüllen. `filter` blendet Optionen aus, deren Name
// den Suchtext nicht enthält.
export function fillPaletteSelect(sel, selectedName, filter = '') {
  if (!sel) return;
  sel.innerHTML = '';
  const q = filter.trim().toLowerCase();
  const opts = getAllPaletteOptions().filter(o => !q || o.name.toLowerCase().includes(q));

  const groups = [
    { label: 'Eingebaut', items: opts.filter(o => !o.isCustom) },
    { label: 'Eigene',    items: opts.filter(o => o.isCustom) },
  ];
  for (const g of groups) {
    if (!g.items.length) continue;
    const og = document.createElement('optgroup');
    og.label = g.label;
    g.items.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.name;
      opt.textContent = o.name;
      if (o.name === selectedName) opt.selected = true;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  }
  // Ausgewählte Palette ist wegfiltert → trotzdem als Wert halten.
  if (selectedName && !opts.some(o => o.name === selectedName)) sel.value = '';
}

export function renderPalette() {
  const pal     = getPal();
  const palName = getPaletteName();
  const maxIdx  = getMaxIdx();

  const sel = document.getElementById('palette-select');
  const search = document.getElementById('palette-search');
  fillPaletteSelect(sel, palName, search?.value || '');
  if (search) search.hidden = getAllPaletteOptions().length <= 12 && !search.value;

  // Bearbeiten/Löschen gibt es nur für eigene Paletten.
  const custom = isCustomPalette(palName);
  document.getElementById('palette-edit-btn')?.toggleAttribute('hidden', !custom);
  document.getElementById('palette-del-btn')?.toggleAttribute('hidden', !custom);

  const badge = document.getElementById('palette-origin');
  if (badge) {
    badge.textContent = custom ? 'eigene' : 'eingebaut';
    badge.className = 'badge ' + (custom ? 'badge--custom' : 'badge--builtin');
  }

  const hint = document.getElementById('palette-hint');
  if (hint) {
    hint.textContent = custom
      ? 'Swatch anklicken zum Ändern — das Bild färbt sich live um.'
      : 'Eingebaute Paletten sind schreibgeschützt. „Kopie bearbeiten“ macht sie änderbar.';
  }
  document.getElementById('palette-fork-btn')?.toggleAttribute('hidden', custom);

  // Farbliste
  const items = document.getElementById('palette-items');
  if (!items) return;
  items.innerHTML = '';

  for (let i = 0; i <= maxIdx; i++) {
    const color = pal[i];
    const item = document.createElement('div');
    item.className = 'color-item'
      + (i === state.curColor ? ' is-active' : '')
      + (custom && i !== 0 ? ' is-editable' : '');
    item.dataset.idx = i;

    const sw = document.createElement('span');
    sw.className = 'color-swatch' + (i === 0 ? ' is-transparent' : '');
    if (i !== 0 && color) sw.style.background = color;

    const text = document.createElement('span');
    text.className = 'color-text';
    text.innerHTML =
      `<span class="color-line"><span class="color-idx">${i}</span>` +
      `<span class="color-name">${COLOR_LABELS[i] || ''}</span></span>` +
      (i !== 0 && color ? `<span class="color-hex">${color}</span>` : '');

    item.append(sw, text);

    if (custom && i !== 0) {
      // Verstecktes <input type="color"> — Klick auf den Swatch öffnet es.
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.className = 'hidden-color-input';
      picker.value = color || '#888888';
      sw.title = 'Farbe ändern';
      sw.addEventListener('click', e => {
        e.stopPropagation();
        picker.value = getPal()[i] || '#888888';
        picker.click();
      });
      picker.addEventListener('input', () => {
        const target = customPalettes[getPaletteName()];
        if (!target) return;
        target[i] = picker.value;
        sw.style.background = picker.value;
        const hexEl = item.querySelector('.color-hex');
        if (hexEl) hexEl.textContent = picker.value;
        renderEditor(); renderQuickPalette(); renderSpriteList(); updateCurrentColorIndicator();
        renderCallbacks.onSave();
      });
      item.appendChild(picker);
    }

    item.addEventListener('click', () => { state.curColor = i; syncColorActive(); });
    items.appendChild(item);

    if (i === PALETTE_GROUP_SPLIT) {
      const sep = document.createElement('div');
      sep.className = 'color-sep';
      items.appendChild(sep);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// OUTPUT — TypeScript-Array-Generator
// ────────────────────────────────────────────────────────────────────
// Erzeugt einen selbstbeschreibenden Block: optional Palette, dann das Grid.
// Freie Hex-Pixel bekommen Indizes oberhalb der Palette, damit der Export
// verlustfrei bleibt und wieder importiert werden kann.
export function updateOutput() {
  const ta = document.getElementById('output-textarea');
  if (!ta) return;
  const sp = getSprite();
  if (!sp) { ta.value = ''; return; }

  const grid = sp.grid;
  const name = tsIdentifier(sp.name);
  const pal = getPal();
  const maxIdx = getMaxIdx();
  const includePalette = document.getElementById('export-include-palette')?.checked;

  const rawMap = new Map(); // '#rrggbb' → Index oberhalb der Palette
  let nextIdx = maxIdx + 1;
  for (const row of grid) for (const c of row) {
    if (typeof c === 'string') {
      const key = c.toLowerCase();
      if (!rawMap.has(key)) rawMap.set(key, nextIdx++);
    }
  }
  const hasRaw = rawMap.size > 0;

  const rows = grid.map(row => '  [' + row.map(c =>
    typeof c === 'string' ? rawMap.get(c.toLowerCase()) : c
  ).join(',') + ']').join(',\n');

  // Palette-Block: bei freien Farben zwingend (sonst sind die Indizes wertlos),
  // sonst nur wenn "Farben mitkopieren" aktiv ist.
  let palBlock = '';
  if (hasRaw || includePalette) {
    const usedIdx = new Set();
    for (const row of grid) for (const c of row) {
      if (typeof c === 'number' && c >= 1) usedIdx.add(c);
    }
    const entries = [];
    for (let i = 1; i <= maxIdx; i++) {
      if (pal[i] && (hasRaw ? usedIdx.has(i) : true)) entries.push(`  ${i}: '${pal[i]}',`);
    }
    for (const [hex, idx] of rawMap) entries.push(`  ${idx}: '${hex}',`);
    palBlock = `// Palette „${sp.palette}“\n`
             + `export const ${name}_PALETTE: Record<number, string> = {\n${entries.join('\n')}\n};\n\n`;
  }

  const note = hasRaw
    ? `// ${rawMap.size} freie Farben wurden als Palette-Indizes ${maxIdx + 1}+ gesichert (verlustfrei)\n`
    : '';

  ta.value = `${note}${palBlock}export const ${name}: number[][] = [\n${rows},\n];`;
}

// Sprite-Name → gültiger TS-Bezeichner (SCREAMING_SNAKE, nie mit Ziffer beginnend).
export function tsIdentifier(name) {
  let id = String(name || 'SPRITE')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  if (!id) id = 'SPRITE';
  if (/^[0-9]/.test(id)) id = 'S_' + id;
  return id;
}

// ────────────────────────────────────────────────────────────────────
// Full Re-Render
// ────────────────────────────────────────────────────────────────────
export function renderAll() {
  renderSpriteList();
  renderEditor();
  renderPalette();
  renderQuickPalette();
  updateOutput();
  updateCurrentColorIndicator();
}
