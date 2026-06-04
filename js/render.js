// ════════════════════════════════════════════════════════════════════
// RENDER — alle DOM-/Canvas-Render-Funktionen
// ════════════════════════════════════════════════════════════════════
// Liest aus state, schreibt ins DOM. Keine Event-Bindings, keine Mutationen
// am State (außer wo unvermeidbar — z.B. Klick-Handler die in render-Funktionen
// erzeugte Buttons brauchen, ändern state und triggern dann re-render via
// Callback aus app.js).
import {
  state, grids, customMeta, customPalettes,
  getGrid, getPal, getVariants, isCustomVariant, getMaxIdx, getCurrentPalType,
  getAllPaletteOptions, PAL_TYPE_LABELS,
} from './state.js';
import { COLOR_LABELS } from './data.js';
import { showInfoToast } from './toast.js';

// Ein <select> mit ALLEN Paletten füllen, gruppiert nach Tierart (optgroup).
// selType/selVariant markieren die aktuell gewählte Option. Optionaler `filter`
// blendet nur Paletten ein, deren Name (oder Tierart) den Suchtext enthält.
// Wird vom rechten Paletten-Dropdown und vom "Neuer Sprite"-Modal genutzt.
export function fillPaletteSelect(sel, selType, selVariant, filter = '') {
  sel.innerHTML = '';
  const q = filter.trim().toLowerCase();
  const byType = {};
  getAllPaletteOptions().forEach(o => {
    if (q
      && !o.variant.toLowerCase().includes(q)
      && !(PAL_TYPE_LABELS[o.type] || '').toLowerCase().includes(q)) return;
    (byType[o.type] = byType[o.type] || []).push(o);
  });
  for (const t of Object.keys(byType)) {
    const og = document.createElement('optgroup');
    og.label = PAL_TYPE_LABELS[t] || t;
    byType[t].forEach(o => {
      const opt = document.createElement('option');
      opt.value = `${o.type}:${o.variant}`;
      opt.textContent = o.isCustom ? `🎨 ${o.variant}` : o.variant;
      if (o.type === selType && o.variant === selVariant) opt.selected = true;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  }
}

// Callbacks die von app.js gesetzt werden, weil renderPalette/Overview/QuickPalette
// Buttons erzeugen, die Aktionen aus anderen Modulen triggern (z.B. Save, Modal öffnen).
// Vermeidet Zirkularimporte zwischen render <-> sprites/palettes/storage.
export const renderCallbacks = {
  onSave: () => {},                   // wird mit saveState verdrahtet
  onOpenPaletteModal: () => {},       // ohne Args = create-Mode
  onEditPalette: (type, variant) => {},
  onDeletePalette: (type, variant) => {},
  onDeleteSprite: (key) => {},        // Custom-Sprite löschen (mit Toast-Bestätigung)
  onImageToPalette: () => {},         // aktuelle Bildfarben → editierbare Custom-Palette
};

// ────────────────────────────────────────────────────────────────────
// Eine Grid-Zelle → CSS-Farbe (oder null = nichts zeichnen).
// Zellen können sein:
//   0           → transparent (nicht zeichnen)
//   1-9         → Palette-Index
//   "#RRGGBB"   → freie Farbe (von Schablone-Pipette)
// ────────────────────────────────────────────────────────────────────
export function cellToColor(c, palette) {
  if (c === 0) return null;
  if (typeof c === 'string' && c[0] === '#') return c;
  return palette[c] || null;
}

// SVG-String für eine Sprite-Preview (z.B. im Overview-Panel).
export function svgSprite(grid, palette, scale) {
  const H = grid.length, W = grid[0].length;
  let r = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fill = cellToColor(grid[y][x], palette);
    if (fill) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
  }
  return `<svg width="${W*scale}" height="${H*scale}" viewBox="0 0 ${W} ${H}" style="image-rendering:pixelated;display:block" xmlns="http://www.w3.org/2000/svg">${r}</svg>`;
}

// ────────────────────────────────────────────────────────────────────
// OVERVIEW — Namensliste der Sprites (Klick klappt auf, Doppelklick lädt)
// ────────────────────────────────────────────────────────────────────
let overviewInitialized = false;

export function ensureGroupExpanded(key) {
  state.openGroupKey = key;
}

// Ein konkretes Sprite in den Editor laden (Auswahl setzen + neu rendern).
function loadSprite({ type, st, variant }) {
  state.curType = type;
  if (!type.startsWith('custom_')) state.curState = st;
  state.curVariant = variant;
  syncButtons();
  renderAll();
}

// Aufgeklapptes Varianten-Panel einer Gruppe (reine Namensliste, Doppelklick lädt).
function buildExpandedPanel(items) {
  const panel = document.createElement('div');
  panel.className = 'overview-expanded';
  items.forEach(({ type: t, st, variant, label: lbl }) => {
    const card = document.createElement('div');
    const isSel = t === state.curType &&
      (t.startsWith('custom_') || st === state.curState) &&
      variant === state.curVariant;
    card.className = 'sprite-card' + (isSel ? ' selected' : '');
    card.title = 'Doppelklick: laden';
    card.innerHTML = `<div class="sprite-card-label">${lbl}</div>`;
    card.ondblclick = () => loadSprite({ type: t, st, variant });
    panel.appendChild(card);
  });
  return panel;
}

export function renderOverview() {
  const container = document.getElementById('overview-grid');
  container.innerHTML = '';

  if (!overviewInitialized) {
    overviewInitialized = true;
    // openGroupKey bleibt wie aus storage geladen (null = alle zu)
  }

  const stateEmoji = { normal: '😐', happy: '😊', sad: '😢' };
  const groups = [];

  // Dog
  {
    const items = [];
    ['normal', 'happy', 'sad'].forEach(s =>
      getVariants('dog').forEach(v =>
        items.push({ type: 'dog', st: s, variant: v, label: `${v}·${stateEmoji[s]}` })
      )
    );
    groups.push({ key: 'dog', label: '🐕 Hund', items });
  }

  // Cat
  {
    const items = [];
    ['normal', 'happy', 'sad'].forEach(s =>
      getVariants('cat').forEach(v =>
        items.push({ type: 'cat', st: s, variant: v, label: `${v}·${stateEmoji[s]}` })
      )
    );
    groups.push({ key: 'cat', label: '🐈 Katze', items });
  }

  // Custom sprites
  Object.keys(grids).forEach(k => {
    if (!k.startsWith('custom_')) return;
    const meta = customMeta[k] || {};
    const items = getVariants(k).map(v => ({ type: k, st: null, variant: v, label: `${meta.name || k}·${v}` }));
    groups.push({ key: k, label: `✨ ${meta.name || k}`, items });
  });

  // ── Namensliste der Gruppen (nur Name, kein Vorschaubild) ──
  const cardsRow = document.createElement('div');
  cardsRow.className = 'overview-group-cards';

  // Suchfilter (Suchfeld liegt außerhalb von #overview-grid, bleibt erhalten).
  const q = (document.getElementById('overview-search')?.value || '').trim().toLowerCase();
  const visibleGroups = q ? groups.filter(g => g.label.toLowerCase().includes(q)) : groups;

  visibleGroups.forEach(({ key, label, items }) => {
    // Repräsentatives Sprite der Gruppe (aktuelles, sonst erstes) — wird beim
    // Doppelklick geladen.
    const repItem = items.find(it =>
      it.type === state.curType &&
      (it.type.startsWith('custom_') || it.st === state.curState) &&
      it.variant === state.curVariant
    ) || items[0];

    const isOpen   = state.openGroupKey === key;
    const isActive = items.some(it =>
      it.type === state.curType &&
      (it.type.startsWith('custom_') || it.st === state.curState) &&
      it.variant === state.curVariant
    );

    const card = document.createElement('div');
    card.className = 'sprite-group-card'
      + (isOpen   ? ' open'   : '')
      + (isActive ? ' group-active' : '');
    card.title = 'Klick: auf-/zuklappen · Doppelklick: laden';
    // Bewusst nur der Name — kein Vorschaubild.
    card.innerHTML = `<div class="sprite-group-name">${label}</div>`;

    // Einzelklick = auf-/zuklappen, Doppelklick = Sprite laden. Der Timer
    // entkoppelt beide: ohne ihn würde der Klick-Handler die Karte sofort neu
    // rendern und das dblclick-Event auf dem zerstörten Element nie feuern.
    let clickTimer = null;
    card.addEventListener('click', () => {
      if (clickTimer) return;             // 2. Klick eines Doppelklicks
      clickTimer = setTimeout(() => {
        clickTimer = null;
        state.openGroupKey = isOpen ? null : key;
        renderOverview();
      }, 220);
    });
    card.addEventListener('dblclick', () => {
      clearTimeout(clickTimer); clickTimer = null;
      loadSprite(repItem);
    });

    // × Löschen-Button nur für Custom-Sprites
    if (key.startsWith('custom_')) {
      const del = document.createElement('button');
      del.className = 'group-card-del';
      del.textContent = '×';
      del.title = 'Sprite löschen';
      del.addEventListener('click', e => {
        e.stopPropagation();
        renderCallbacks.onDeleteSprite(key);
      });
      card.appendChild(del);
    }

    cardsRow.appendChild(card);

    // Varianten direkt unter dieser Zeile aufklappen (nicht am Listenende).
    if (state.openGroupKey === key) {
      cardsRow.appendChild(buildExpandedPanel(items));
    }
  });

  container.appendChild(cardsRow);
}

// ────────────────────────────────────────────────────────────────────
// EDITOR-CANVAS — die zoom-bare Pixel-Zeichenfläche
// ────────────────────────────────────────────────────────────────────
export function renderEditor() {
  const canvas = document.getElementById('editor-canvas');
  const grid = getGrid();
  const H = grid.length, W = grid[0].length;
  canvas.width  = W * state.cellSize;
  canvas.height = H * state.cellSize;
  const ctx = canvas.getContext('2d');
  const pal = getPal(state.curType, state.curVariant);

  // Schachbrett-Hintergrund je nach Modus
  const [bg1, bg2] = state.editorBg === 'bw'
    ? ['#ffffff', '#cccccc']
    : ['#222233', '#2d2d40'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ctx.fillStyle = (x + y) % 2 === 0 ? bg1 : bg2;
    ctx.fillRect(x * state.cellSize, y * state.cellSize, state.cellSize, state.cellSize);
  }
  // Pixel (Index ODER freier Hex)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fill = cellToColor(grid[y][x], pal);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x * state.cellSize, y * state.cellSize, state.cellSize, state.cellSize);
    }
  }
  // Grid-Linien (subtil)
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= W; x++) {
    ctx.beginPath(); ctx.moveTo(x * state.cellSize, 0); ctx.lineTo(x * state.cellSize, H * state.cellSize); ctx.stroke();
  }
  for (let y = 0; y <= H; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * state.cellSize); ctx.lineTo(W * state.cellSize, y * state.cellSize); ctx.stroke();
  }

  // Titel über dem Editor
  const name = state.curType.startsWith('custom_')
    ? (customMeta[state.curType]?.name || state.curType) + ` (${state.curVariant})`
    : `${state.curType.toUpperCase()}_${state.curState.toUpperCase()} (${state.curVariant})`;
  document.getElementById('editor-title').textContent = 'Editor — ' + name;
}

// Maus-Event → Grid-Zelle (oder null wenn außerhalb)
export function cellFromEvent(e) {
  const canvas = document.getElementById('editor-canvas');
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / state.cellSize);
  const y = Math.floor((e.clientY - r.top) / state.cellSize);
  const g = getGrid();
  if (x < 0 || y < 0 || x >= g[0].length || y >= g.length) return null;
  return { x, y };
}

// Zelle mit aktueller Farbe füllen (oder löschen wenn curColor=0)
export function paintCell(x, y) {
  const g = getGrid();
  if (g[y][x] === state.curColor) return;
  g[y][x] = state.curColor;
  renderEditor();
  renderOverview();
  updateOutput();
  renderCallbacks.onSave();
}

// ────────────────────────────────────────────────────────────────────
// QUICK-PALETTE — horizontale Swatch-Leiste über dem Canvas
// ────────────────────────────────────────────────────────────────────
export function renderQuickPalette() {
  const pal = getPal(state.curType, state.curVariant);
  const maxIdx = getMaxIdx();
  const qp = document.getElementById('quick-palette');
  qp.innerHTML = '';

  for (let i = 0; i <= maxIdx; i++) {
    const color = pal[i];
    const el = document.createElement('div');
    el.className = 'qp-swatch' + (i === state.curColor ? ' active' : '');
    el.title = `${i}: ${COLOR_LABELS[i] || ''}${color ? ' — ' + color : ''}`;

    if (i === 0) {
      // Transparenz als Schachbrett
      el.style.cssText = 'background-image:linear-gradient(45deg,#444 25%,transparent 25%),linear-gradient(-45deg,#444 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#444 75%),linear-gradient(-45deg,transparent 75%,#444 75%);background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0;background-color:#333;';
    } else if (color) {
      el.style.background = color;
    } else {
      el.style.background = '#282828';
    }

    const idx = document.createElement('span');
    idx.className = 'qp-idx';
    idx.textContent = i;
    el.appendChild(idx);

    el.addEventListener('click', () => { state.curColor = i; syncColorActive(); });
    qp.appendChild(el);

    if (i === 4) {
      // Trenner zwischen variablen Fell-Farben (1-4) und Detail-Farben (5+)
      const sep = document.createElement('div'); sep.className = 'qp-sep'; qp.appendChild(sep);
    }
  }

  const hint = document.createElement('span');
  hint.className = 'qp-hint';
  hint.textContent = 'Tasten 0–9 · Alt+Klick = Pipette';
  qp.appendChild(hint);
}

// Aktuelle Farbe (Palette-Index oder Hex-String) im Editor-Header darstellen
export function updateCurrentColorIndicator() {
  const sw  = document.querySelector('.cc-swatch');
  const hex = document.querySelector('.cc-hex');
  if (!sw || !hex) return;

  if (state.curColor === 0) {
    sw.style.background = '';
    sw.classList.add('transp');
    hex.textContent = 'transparent';
    return;
  }
  sw.classList.remove('transp');

  if (typeof state.curColor === 'string' && state.curColor[0] === '#') {
    sw.style.background = state.curColor;
    hex.textContent = state.curColor + ' (Pipette)';
  } else {
    const pal = getPal(state.curType, state.curVariant);
    const color = pal[state.curColor] || '#888';
    sw.style.background = color;
    hex.textContent = color + ' (Index ' + state.curColor + ')';
  }
}

// Active-Klasse auf Palette-Buttons setzen (ohne Full-Re-Render)
export function syncColorActive() {
  const isHex = typeof state.curColor === 'string';
  document.querySelectorAll('.qp-swatch').forEach((el, i) =>
    el.classList.toggle('active', !isHex && i === state.curColor));
  document.querySelectorAll('.color-item').forEach(el =>
    el.classList.toggle('active', !isHex && Number(el.dataset.idx) === state.curColor));
  updateCurrentColorIndicator();
}

// ────────────────────────────────────────────────────────────────────
// PALETTE-PANEL (rechts) — Variant-Buttons + ausführliche Farbliste
// ────────────────────────────────────────────────────────────────────
export function renderPalette() {
  const pal = getPal(state.curType, state.curVariant);

  // Variant-Auswahl als Dropdown (alle Paletten, gruppiert nach Tierart)
  const vbtns = document.getElementById('variant-btns');
  vbtns.innerHTML = '';

  const selRow = document.createElement('div');
  selRow.className = 'variant-row';

  const sel = document.createElement('select');
  sel.id = 'variant-select';
  sel.className = 'variant-select';
  // ALLE Paletten (alle Tierarten), gruppiert — aktuell genutzte ist markiert.
  fillPaletteSelect(sel, getCurrentPalType(), state.curVariant);

  // Suchfeld — nur wenn es viele Paletten gibt (sonst unnötig). Filtert die
  // Optionen des Dropdowns live, ohne das ganze Panel neu zu rendern.
  if (getAllPaletteOptions().length > 6) {
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'variant-search';
    search.placeholder = '🔍 Palette suchen…';
    search.autocomplete = 'off';
    search.oninput = () => fillPaletteSelect(sel, getCurrentPalType(), state.curVariant, search.value);
    vbtns.appendChild(search);
  }
  sel.onchange = () => {
    const [t, v] = sel.value.split(':');
    if (state.curType.startsWith('custom_')) {
      // Custom-Sprite übernimmt die Tierart der gewählten Palette
      customMeta[state.curType].palType = t;
      state.curVariant = v;
    } else if (t === getCurrentPalType()) {
      // Eingebautes dog/cat-Sprite: nur eigene Tierart-Paletten möglich
      state.curVariant = v;
    } else {
      showInfoToast('Eingebaute Hund/Katze-Sprites nutzen nur ihre eigene Tierart-Palette. ' +
        'Für freie Palettenwahl ein Custom-Sprite anlegen.');
      renderPalette(); // Auswahl zurücksetzen
      return;
    }
    renderPalette(); renderQuickPalette(); renderEditor(); renderOverview();
    renderCallbacks.onSave();
  };
  selRow.appendChild(sel);

  // ✎ Bearbeiten / × Löschen — nur für die aktuell gewählte eigene Palette
  if (isCustomVariant(state.curType, state.curVariant)) {
    const edit = document.createElement('button');
    edit.className = 'btn variant-act';
    edit.textContent = '✎';
    edit.title = 'Palette bearbeiten';
    edit.onclick = () => renderCallbacks.onEditPalette(state.curType, state.curVariant);
    selRow.appendChild(edit);

    const del = document.createElement('button');
    del.className = 'btn variant-act';
    del.textContent = '×';
    del.title = 'Palette löschen';
    del.onclick = () => renderCallbacks.onDeletePalette(state.curType, state.curVariant);
    selRow.appendChild(del);
  }

  vbtns.appendChild(selRow);

  // Aktionen darunter: neue Palette anlegen / Bildfarben übernehmen
  const actions = document.createElement('div');
  actions.className = 'variant-actions';

  const addBtn = document.createElement('button');
  addBtn.id = 'palette-add-btn';
  addBtn.className = 'btn';
  addBtn.style.cssText = 'background:#1a3a1a;color:#80c080;border-color:#2a5a2a';
  addBtn.textContent = '+ Palette';
  addBtn.title = 'Neue eigene Farbpalette erstellen und speichern';
  addBtn.onclick = () => renderCallbacks.onOpenPaletteModal();
  actions.appendChild(addBtn);

  // "🎨 Bild → Palette" — aktuelle Bildfarben in eine editierbare Custom-Palette
  // umwandeln (Pixel werden auf Indizes umgeschrieben). Macht reduzierte
  // Rohfarben rechts direkt editierbar und speicherbar.
  const img2pal = document.createElement('button');
  img2pal.id = 'palette-from-image-btn';
  img2pal.className = 'btn';
  img2pal.style.cssText = 'background:#1a2a3a;color:#80a0c0;border-color:#2a4060';
  img2pal.textContent = '🎨 Bild → Palette';
  img2pal.title = 'Die Farben des aktuellen Bildes als editierbare Palette übernehmen — danach rechts direkt änderbar';
  img2pal.onclick = () => renderCallbacks.onImageToPalette();
  actions.appendChild(img2pal);

  vbtns.appendChild(actions);

  document.getElementById('variant-label').textContent = 'Variante: ' + state.curVariant;

  // Ausführliche Farbliste mit Labels. Bei Custom-Paletten sind die Swatches
  // editierbar (Color-Picker) — eine Farbänderung färbt das Bild live um, weil
  // die Pixel die Palette per Index referenzieren.
  const maxIdx = getMaxIdx();
  const editable = isCustomVariant(state.curType, state.curVariant);
  const items = document.getElementById('palette-items');
  items.innerHTML = '';
  for (let i = 0; i <= maxIdx; i++) {
    const color = pal[i];
    const item = document.createElement('div');
    item.className = 'color-item' + (i === state.curColor ? ' active' : '')
      + (editable && i !== 0 ? ' editable' : '');
    item.dataset.idx = i;

    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' transp' : '');
    if (i !== 0 && color) sw.style.background = color;

    const lbl = document.createElement('div');
    lbl.style.overflow = 'hidden';
    lbl.innerHTML = `<div style="display:flex;align-items:center;gap:4px"><span class="color-idx">${i}</span><span class="color-name">${COLOR_LABELS[i] || ''}</span></div>${i !== 0 && color ? `<div class="color-hex">${color}</div>` : ''}`;
    item.appendChild(sw); item.appendChild(lbl);

    // Custom-Paletten: Swatch klickbar zum Editieren. Verstecktes Color-Input
    // (gleiches Muster wie der Haupt-Farbwähler) — eine Änderung färbt das Bild
    // live um, weil die Pixel die Palette per Index referenzieren.
    if (editable && i !== 0) {
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = color || '#888888';
      picker.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
      sw.title = 'Klicken zum Ändern — das Bild aktualisiert sich live';
      sw.style.cursor = 'pointer';
      sw.addEventListener('click', e => {
        e.stopPropagation();
        picker.value = (getPal(state.curType, state.curVariant)[i]) || '#888888';
        picker.click();
      });
      picker.addEventListener('input', () => {
        const t = getCurrentPalType();
        if (!customPalettes[t] || !customPalettes[t][state.curVariant]) return;
        customPalettes[t][state.curVariant][i] = picker.value;
        sw.style.background = picker.value;
        const hexEl = item.querySelector('.color-hex');
        if (hexEl) hexEl.textContent = picker.value;
        renderEditor(); renderQuickPalette(); renderOverview(); updateCurrentColorIndicator();
        renderCallbacks.onSave();
      });
      item.appendChild(picker);
    }

    item.onclick = () => { state.curColor = i; syncColorActive(); };
    items.appendChild(item);
  }
}

// ────────────────────────────────────────────────────────────────────
// OUTPUT — TypeScript-Array-Generator (für PetSprite.tsx)
// ────────────────────────────────────────────────────────────────────
export function updateOutput() {
  const grid = getGrid();
  const name = state.curType.startsWith('custom_')
    ? (customMeta[state.curType]?.name || state.curType).replace(/[^a-zA-Z0-9_]/g, '_')
    : `${state.curType.toUpperCase()}_${state.curState.toUpperCase()}`;

  const pal = getPal(state.curType, state.curVariant);
  const maxIdx = getMaxIdx();
  const includePalette = document.getElementById('export-include-palette')?.checked;

  // Raw-Hex-Pixel (freie Pipette-/Schablonen-Farben) erkennen. Sie passen nicht
  // direkt ins `number[][]`-Format → wir vergeben ihnen fortlaufende Indizes
  // oberhalb der Palette (maxIdx+1, +2, …) und legen sie im Palette-Block ab.
  // So bleibt der Export verlustfrei.
  const rawMap = new Map(); // '#rrggbb' (lowercase) → Index
  let nextIdx = maxIdx + 1;
  for (const row of grid) for (const c of row) {
    if (typeof c === 'string') {
      const key = c.toLowerCase();
      if (!rawMap.has(key)) rawMap.set(key, nextIdx++);
    }
  }
  const hasRaw = rawMap.size > 0;

  // Grid-Zeilen: Raw-Hex → zugewiesener Index, sonst Zahl unverändert.
  const rows = grid.map(row => '  [' + row.map(c =>
    typeof c === 'string' ? rawMap.get(c.toLowerCase()) : c
  ).join(',') + ']').join(',\n');

  // Palette-Block: bei Raw-Farben IMMER nötig (sonst sind die Indizes wertlos),
  // sonst nur wenn "Farben mitkopieren" aktiv ist.
  let palBlock = '';
  if (hasRaw || includePalette) {
    // Benutzte Palette-Indizes (für schlanken Block bei Raw-Sprites).
    const usedIdx = new Set();
    for (const row of grid) for (const c of row) {
      if (typeof c === 'number' && c >= 1) usedIdx.add(c);
    }
    const entries = [];
    for (let i = 1; i <= maxIdx; i++) {
      if (pal[i] && (hasRaw ? usedIdx.has(i) : true)) entries.push(`  ${i}: '${pal[i]}',`);
    }
    for (const [hex, idx] of rawMap) entries.push(`  ${idx}: '${hex}',`);
    palBlock = `const ${name}_PALETTE: Record<number, string> = {\n${entries.join('\n')}\n};\n\n`;
  }

  const note = hasRaw
    ? `// ✔ ${rawMap.size} freie Farben als Palette-Indizes ${maxIdx + 1}+ gespeichert (verlustfrei)\n`
    : '';

  document.getElementById('output-textarea').value =
    `${note}${palBlock}const ${name}: number[][] = [\n${rows},\n];`;
}

// Header-Buttons (Typ + State) als aktiv markieren
export function syncButtons() {
  document.querySelectorAll('#type-btns .btn').forEach(b =>
    b.classList.toggle('active', b.dataset.type === state.curType));
  document.querySelectorAll('#state-btns .btn').forEach(b =>
    b.classList.toggle('active', b.dataset.state === state.curState));
}

// ────────────────────────────────────────────────────────────────────
// TOOLS — Pinsel + Flood-Fill
// ────────────────────────────────────────────────────────────────────
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
  if (changed) { renderEditor(); renderOverview(); updateOutput(); renderCallbacks.onSave(); }
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
  if (changed) { renderEditor(); renderOverview(); updateOutput(); renderCallbacks.onSave(); }
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
  renderEditor(); renderOverview(); updateOutput(); renderCallbacks.onSave();
}

// Full Re-Render (nach jeder größeren State-Änderung)
export function renderAll() {
  renderOverview();
  renderEditor();
  renderPalette();
  renderQuickPalette();
  updateOutput();
  updateCurrentColorIndicator();
}
