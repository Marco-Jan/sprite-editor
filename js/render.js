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
} from './state.js';
import { COLOR_LABELS } from './data.js';

// Callbacks die von app.js gesetzt werden, weil renderPalette/Overview/QuickPalette
// Buttons erzeugen, die Aktionen aus anderen Modulen triggern (z.B. Save, Modal öffnen).
// Vermeidet Zirkularimporte zwischen render <-> sprites/palettes/storage.
export const renderCallbacks = {
  onSave: () => {},                   // wird mit saveState verdrahtet
  onOpenPaletteModal: () => {},       // ohne Args = create-Mode
  onEditPalette: (type, variant) => {},
  onDeletePalette: (type, variant) => {},
  onDeleteSprite: (key) => {},        // Custom-Sprite löschen (mit Toast-Bestätigung)
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
// OVERVIEW — Thumbnail-Grid + aufklappbares Sprites-Panel
// ────────────────────────────────────────────────────────────────────
let overviewInitialized = false;

export function ensureGroupExpanded(key) {
  state.openGroupKey = key;
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

  // ── Reihe der Thumbnail-Cards ──
  const cardsRow = document.createElement('div');
  cardsRow.className = 'overview-group-cards';

  groups.forEach(({ key, label, items }) => {
    const thumbItem = items.find(it =>
      it.type === state.curType &&
      (it.type.startsWith('custom_') || it.st === state.curState) &&
      it.variant === state.curVariant
    ) || items[0];

    const thumbGrid = thumbItem.type.startsWith('custom_')
      ? grids[thumbItem.type] : grids[thumbItem.type][thumbItem.st];
    const thumbPal  = getPal(thumbItem.type, thumbItem.variant);
    const maxDim    = Math.max(thumbGrid.length, thumbGrid[0].length);
    const thumbScale = Math.max(1, Math.min(3, Math.floor(56 / maxDim)));

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
    card.innerHTML =
      `<div class="group-thumb chk">${svgSprite(thumbGrid, thumbPal, thumbScale)}</div>`
      + `<div class="sprite-group-name">${label}</div>`;
    card.addEventListener('click', () => {
      state.openGroupKey = isOpen ? null : key;
      renderOverview();
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
  });

  container.appendChild(cardsRow);

  // ── Aufgeklapptes Sprites-Panel ──
  if (state.openGroupKey) {
    const openGroup = groups.find(g => g.key === state.openGroupKey);
    if (openGroup) {
      const panel = document.createElement('div');
      panel.className = 'overview-expanded';

      openGroup.items.forEach(({ type: t, st, variant, label: lbl }) => {
        const g = t.startsWith('custom_') ? grids[t] : grids[t][st];
        const p = getPal(t, variant);
        const maxDim   = Math.max(g.length, g[0].length);
        const cardScale = Math.max(1, Math.min(6, Math.floor(72 / maxDim)));

        const card = document.createElement('div');
        const isSel = t === state.curType &&
          (t.startsWith('custom_') || st === state.curState) &&
          variant === state.curVariant;
        card.className = 'sprite-card' + (isSel ? ' selected' : '');
        card.innerHTML = `<div class="chk">${svgSprite(g, p, cardScale)}</div><div class="sprite-card-label">${lbl}</div>`;
        card.onclick = () => {
          state.curType = t;
          if (!t.startsWith('custom_')) state.curState = st;
          state.curVariant = variant;
          syncButtons(); renderAll();
        };
        panel.appendChild(card);
      });

      container.appendChild(panel);
    }
  }
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
  const variants = getVariants(state.curType);
  const pal = getPal(state.curType, state.curVariant);

  // Variant-Buttons (Built-in + Custom mit Edit/Delete-X)
  const vbtns = document.getElementById('variant-btns');
  vbtns.innerHTML = '';
  variants.forEach(v => {
    const isCustom = isCustomVariant(state.curType, v);
    const b = document.createElement('button');
    b.className = 'btn' + (v === state.curVariant ? ' active' : '') + (isCustom ? ' custom-pal' : '');

    const label = document.createElement('span');
    label.textContent = v;
    b.appendChild(label);

    if (isCustom) {
      const edit = document.createElement('span');
      edit.className = 'pal-edit-x';
      edit.textContent = '✎';
      edit.title = 'Palette bearbeiten';
      edit.addEventListener('click', e => {
        e.stopPropagation();
        renderCallbacks.onEditPalette(state.curType, v);
      });
      b.appendChild(edit);

      const x = document.createElement('span');
      x.className = 'pal-del-x';
      x.textContent = '×';
      x.title = 'Palette löschen';
      x.addEventListener('click', e => {
        e.stopPropagation();
        renderCallbacks.onDeletePalette(state.curType, v);
      });
      b.appendChild(x);
    }

    b.onclick = () => {
      state.curVariant = v;
      renderPalette(); renderQuickPalette(); renderEditor(); renderOverview();
      renderCallbacks.onSave();
    };
    vbtns.appendChild(b);
  });

  // "+ Palette" Button am Ende
  const addBtn = document.createElement('button');
  addBtn.id = 'palette-add-btn';
  addBtn.className = 'btn';
  addBtn.style.cssText = 'background:#1a3a1a;color:#80c080;border-color:#2a5a2a';
  addBtn.textContent = '+ Palette';
  addBtn.onclick = () => renderCallbacks.onOpenPaletteModal();
  vbtns.appendChild(addBtn);

  document.getElementById('variant-label').textContent = 'Variante: ' + state.curVariant;

  // Ausführliche Farbliste mit Labels
  const maxIdx = getMaxIdx();
  const items = document.getElementById('palette-items');
  items.innerHTML = '';
  for (let i = 0; i <= maxIdx; i++) {
    const color = pal[i];
    const item = document.createElement('div');
    item.className = 'color-item' + (i === state.curColor ? ' active' : '');
    item.dataset.idx = i;
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' transp' : '');
    if (i !== 0 && color) sw.style.background = color;
    const lbl = document.createElement('div');
    lbl.style.overflow = 'hidden';
    lbl.innerHTML = `<div style="display:flex;align-items:center;gap:4px"><span class="color-idx">${i}</span><span class="color-name">${COLOR_LABELS[i] || ''}</span></div>${i !== 0 && color ? `<div class="color-hex">${color}</div>` : ''}`;
    item.appendChild(sw); item.appendChild(lbl);
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
