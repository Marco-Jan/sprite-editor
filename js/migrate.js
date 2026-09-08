// ════════════════════════════════════════════════════════════════════
// MIGRATE — altes Hund/Katze-Schema (v1) → generisches Sprite-Schema (v2)
// ════════════════════════════════════════════════════════════════════
// v1 sah so aus:
//   grids:          { dog: {normal,happy,sad}, cat: {…}, custom_X: [[…]] }
//   customMeta:     { custom_X: { palType: 'dog'|'cat'|'neutral', name } }
//   customPalettes: { dog: {…}, cat: {…}, neutral: {…} }
//   ui:             { curType, curState, curVariant, … }
//
// v2 kennt nur noch flache Sprites mit eigener Palette. Diese Datei läuft
// genau einmal pro Save und darf danach theoretisch weg — sie bleibt, damit
// alte Projekt-JSONs auch später noch geladen werden können.

import { DEFAULT_PALETTE, completePalette } from './data.js';

// Die alten Built-in-Sprites werden NICHT übernommen — es sei denn, sie wurden
// bearbeitet. Erkennung über eine Prüfsumme der Original-Grids: stimmt sie
// überein, war der Sprite unverändert und fliegt raus.
const ORIG_HASHES = {
  dog_normal: '1v8vm30',
  dog_happy:  '1wphx8p',
  dog_sad:    '2y7n67',
  cat_normal: '1mgjg20',
  cat_happy:  '1iz4nm6',
  cat_sad:    '101t8nc',
};

function hash(str) {
  let x = 5381;
  for (let i = 0; i < str.length; i++) x = ((x * 33) ^ str.charCodeAt(i)) >>> 0;
  return x.toString(36);
}

// Alte Palettennamen → neue. Hund und Katze hatten je ein "black", deshalb
// werden beide unterschiedlich aufgelöst.
const PALETTE_MAP = {
  dog: { golden: 'golden', brown: 'braun', black: 'kohle', cream: 'creme' },
  cat: { grey: 'schiefer', orange: 'orange', black: 'tinte', white: 'schnee' },
  neutral: { leer: 'graustufen' },
};

function isPlainGrid(g) {
  return Array.isArray(g) && g.length > 0 && Array.isArray(g[0]);
}

export function migrateV1(old) {
  const sprites = {};
  const customPalettes = {};
  const notes = [];

  // ── 1. Eigene Paletten aus den drei Tierart-Töpfen in einen flachen
  //       Namensraum ziehen. Bei Namenskollision bekommt der spätere Eintrag
  //       ein Suffix, damit nichts still überschrieben wird.
  const paletteRename = {}; // 'dog:rot' → 'rot' | 'rot_2'
  const oldCustom = old.customPalettes || {};
  for (const type of ['dog', 'cat', 'neutral']) {
    for (const [name, pal] of Object.entries(oldCustom[type] || {})) {
      let target = name;
      let i = 2;
      while (customPalettes[target]) target = `${name}_${i++}`;
      customPalettes[target] = completePalette(pal);
      paletteRename[`${type}:${name}`] = target;
    }
  }

  // Alten (Typ, Variante) → neuen Palettennamen auflösen.
  const resolvePalette = (type, variant) => {
    if (!variant) return DEFAULT_PALETTE;
    const t = type === 'cat' || type === 'neutral' ? type : 'dog';
    return paletteRename[`${t}:${variant}`]
        || PALETTE_MAP[t]?.[variant]
        || DEFAULT_PALETTE;
  };

  const uiVariant = old.ui?.curVariant;

  // ── 2. Custom-Sprites übernehmen ──
  const meta = old.customMeta || {};
  const grids = old.grids || {};
  for (const [key, grid] of Object.entries(grids)) {
    if (!key.startsWith('custom_') || !isPlainGrid(grid)) continue;
    const m = meta[key] || {};
    const id = key.replace(/^custom_/, '') || key;
    sprites[id] = {
      name: m.name || id,
      palette: resolvePalette(m.palType || 'dog', uiVariant),
      grid,
    };
  }

  // ── 3. Eingebaute dog/cat-Sprites: nur die bearbeiteten retten ──
  let rescued = 0;
  for (const type of ['dog', 'cat']) {
    const byState = grids[type];
    if (!byState || typeof byState !== 'object') continue;
    for (const [st, grid] of Object.entries(byState)) {
      if (!isPlainGrid(grid)) continue;
      const key = `${type}_${st}`;
      if (ORIG_HASHES[key] && hash(JSON.stringify(grid)) === ORIG_HASHES[key]) continue; // unverändert
      let id = key;
      let i = 2;
      while (sprites[id]) id = `${key}_${i++}`;
      sprites[id] = {
        name: key,
        palette: resolvePalette(type, uiVariant),
        grid,
      };
      rescued++;
    }
  }

  if (rescued) {
    notes.push(`${rescued} bearbeitete${rescued === 1 ? 'r' : ''} Alt-Sprite${rescued === 1 ? '' : 's'} übernommen`);
  }
  const palCount = Object.keys(customPalettes).length;
  if (palCount) notes.push(`${palCount} eigene Palette${palCount === 1 ? '' : 'n'} übernommen`);

  // ── 4. Aktiven Sprite bestimmen ──
  const oldType = old.ui?.curType || '';
  let curSprite = null;
  if (oldType.startsWith('custom_')) {
    const id = oldType.replace(/^custom_/, '');
    if (sprites[id]) curSprite = id;
  } else if (oldType) {
    const key = `${oldType}_${old.ui?.curState || 'normal'}`;
    if (sprites[key]) curSprite = key;
  }
  if (!curSprite) curSprite = Object.keys(sprites)[0] || null;

  return {
    payload: {
      version: 2,
      sprites,
      customPalettes,
      ui: {
        curSprite,
        curColor: old.ui?.curColor ?? 1,
        cellSize: old.ui?.cellSize ?? 16,
        editorBg: old.ui?.editorBg ?? 'dark',
        fullscreen: !!old.ui?.fullscreen,
        panels: null, // Panel-Keys haben sich geändert → Defaults nehmen
      },
    },
    note: notes.length
      ? `Projekt auf das neue, motiv-freie Palettensystem umgestellt — ${notes.join(', ')}. Unveränderte Hund/Katze-Vorlagen wurden entfernt.`
      : null,
  };
}
