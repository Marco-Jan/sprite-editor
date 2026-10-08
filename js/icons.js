// ════════════════════════════════════════════════════════════════════
// ICONS — Linien-Icons (SVG, 24×24-Raster), überall im Editor
// ════════════════════════════════════════════════════════════════════
// Ein Icon ist der Inhalt eines SVG: Linien mit runden Enden, gezeichnet in
// currentColor. Die Icons folgen also Hover, Aktiv- und Gefahr-Zuständen
// der Knöpfe von selbst. Flächen (Punkte, Füllungen) setzen fill selbst.
//
// Im HTML: <span class="ico" data-icon="save"></span> — applyIcons() füllt
// das SVG ein. Im JS: iconSvg('save') liefert den Markup-String.

const DASH = 'stroke-dasharray="3 3"';
const DOT = 'fill="currentColor" stroke="none"';

export const ICONS = {
  // ── Malwerkzeuge ──
  pencil:  '<path d="M17 3l4 4L8 20H4v-4z"/><path d="M14 6l4 4"/>',
  brush:   '<path d="M21 3l-8.5 8.5"/><path d="M9.5 12.5a3 3 0 0 1 3 3c0 2.8-2.7 5.5-8.5 5.5 1.2-1.5 1.5-3 1.5-4.5a4 4 0 0 1 4-4z"/>',
  spray:   '<rect x="5" y="10" width="8" height="11" rx="2"/><path d="M7 10V7h4v3"/><path d="M16 6h.01M19 4h.01M19 8h.01M22 6h.01"/>',
  fill:    '<path d="M4.5 11.5l7-7 8 8-7 7a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8z"/><path d="M4 12.5h15.5"/><path d="M21.5 15.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z"/>',
  eraser:  '<path d="M7 21l-3.5-3.5a2 2 0 0 1 0-2.8L13.7 4.5a2 2 0 0 1 2.8 0l3 3a2 2 0 0 1 0 2.8L9 21z"/><path d="M7 21h14"/><path d="M8.5 9.5l6 6"/>',
  wand:    '<path d="M3 21l10-10"/><path d="M16 3v2M16 11v2M20 8h2M10 8h2M19 5l1.5-1.5M19 11l1.5 1.5M13 5l-1.5-1.5"/>',
  // ── Formen ──
  line:    '<path d="M5 19L19 5"/>',
  rect:    '<rect x="3" y="5" width="18" height="14" rx="1.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  // ── Auswahl ──
  // Hand: Ansicht schieben, ohne zu zeichnen.
  hand:    '<path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  select:  `<rect x="4" y="4" width="16" height="16" rx="1" ${DASH}/>`,
  lasso:   '<path d="M7 21.5a4 4 0 0 1-2-3.5"/><path d="M4 14.5A6.5 6.5 0 0 1 2.5 10.5c0-4.1 4.3-7.5 9.5-7.5s9.5 3.4 9.5 7.5S17.2 18 12 18a11 11 0 0 1-4.5-1"/><circle cx="5.5" cy="16" r="2"/>',
  magic:   `<circle cx="12" cy="12" r="9" ${DASH}/><path d="M12 7.5s3 3.3 3 5.3a3 3 0 0 1-6 0c0-2 3-5.3 3-5.3z"/>`,
  selAll:  `<rect x="4" y="4" width="16" height="16" rx="1" ${DASH}/><rect x="8" y="8" width="8" height="8" rx="1" ${DOT} opacity=".45"/>`,
  cut:     '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  copy:    '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 4.5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h.5"/>',
  paste:   '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  trash:   '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  deselect:`<rect x="4" y="4" width="16" height="16" rx="1" ${DASH}/><path d="M9 9l6 6M15 9l-6 6"/>`,
  // ── Bühne ──
  mirrorX: '<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M8 8l-4 4 4 4M4 12h5M16 8l4 4-4 4M20 12h-5"/>',
  mirrorY: '<path d="M3 12h18" stroke-dasharray="2 3"/><path d="M8 8l4-4 4 4M12 4v5M8 16l4 4 4-4M12 20v-5"/>',
  undo:    '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo:    '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  expand:  '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  shrink:  '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  // ── Kopfzeile ──
  menu:    '<path d="M4 6h16M4 12h16M4 18h16"/>',
  help:    '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  folder:  '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  save:    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  open:    '<path d="M6 14l1.5-2.9A2 2 0 0 1 9.2 10H20a2 2 0 0 1 1.9 2.5l-1.5 6A2 2 0 0 1 18.5 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H18a2 2 0 0 1 2 2v2"/>',
  install: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  reset:   '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/>',
  // ── Kleinkram ──
  picker:  '<path d="M2 22l1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="M15 6l3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4z"/>',
  pin:     '<path d="M12 17v5"/><path d="M8 3h8M9 3v7.5l-2.6 2.9A1.5 1.5 0 0 0 7.5 16h9a1.5 1.5 0 0 0 1.1-2.6L15 10.5V3"/>',
  float:   '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  grip:    `<g ${DOT}><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/></g>`,
  spot:    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  tools:   '<path d="M4 20l1-4 9-9 3 3-9 9z"/><circle cx="17.5" cy="17.5" r="3.5"/><rect x="3" y="3" width="6" height="6" rx="1"/>',
  // Farbzeile: die Malerpalette — die Zeile zeigt die Farben, mit denen gerade
  // gemalt wird. Das Panel zum Verwalten der Paletten traegt dafuer die drei
  // Kreise (icon `palette`).
  colors:  `<path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3A1.7 1.7 0 0 1 12 22z"/><g ${DOT}><circle cx="7.5" cy="11" r="1.4"/><circle cx="10" cy="6.5" r="1.4"/><circle cx="15" cy="6.5" r="1.4"/></g>`,
  // Verknüpfte Zellen: Kettenglied — und dasselbe auseinandergezogen.
  link:    '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  unlink:  '<path d="M15 9.5l2.2-2.2a3.5 3.5 0 0 0-5-5L10 4.5"/><path d="M9 14.5l-2.2 2.2a3.5 3.5 0 0 0 5 5L14 19.5"/><path d="M3 3l3 3M18 18l3 3M3 9h3M15 21v-3"/>',
  // Durchgehende Ebene (Aseprite): zwei verbundene Punkte — oder getrennt.
  contOn:  '<circle cx="6" cy="12" r="3.2"/><circle cx="18" cy="12" r="3.2"/><path d="M9.2 12h5.6"/>',
  contOff: '<circle cx="6" cy="12" r="3.2"/><circle cx="18" cy="12" r="3.2"/>',
  // Frame-Tag: ein Anhänger-Etikett.
  tag:     '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  eye:     '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  close:   '<path d="M18 6L6 18M6 6l12 12"/>',
  play:    '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/>',
  pause:   '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  // Ein Frame weiter (prev/next) gegen ganz an den Anfang bzw. ans Ende
  // (first/last): ein Dreieck gegen zwei, der Balken steht bei beiden.
  prev:    '<path d="M18 5l-9 7 9 7z"/><path d="M6 5v14"/>',
  first:   '<path d="M13 6l-5 6 5 6z"/><path d="M20 6l-5 6 5 6z"/><path d="M4 5v14"/>',
  last:    '<path d="M11 6l5 6-5 6z"/><path d="M4 6l5 6-5 6z"/><path d="M20 5v14"/>',
  next:    '<path d="M6 5l9 7-9 7z"/><path d="M18 5v14"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  onion:   '<rect x="2" y="6" width="11" height="11" rx="2" stroke-dasharray="2 2.5"/><rect x="7" y="4" width="11" height="11" rx="2" opacity=".55"/><rect x="11" y="9" width="11" height="11" rx="2"/>',
  frames:  '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 6v12M12 6v12M17 6v12"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  // ── Panels (Dock) ──
  sprites: '<path d="M5 21V10a7 7 0 0 1 14 0v11l-2.33-2-2.34 2L12 19l-2.33 2-2.34-2z"/><path d="M9.5 10.5h.01M14.5 10.5h.01"/>',
  guides:  '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M15 3v18" stroke-dasharray="2 2"/><circle cx="9" cy="15" r="2.5"/>',
  layers:  '<path d="M12 2L2 7l10 5 10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/>',
  eyeOff:  '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lock:    '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock:  '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  mergeDown:'<path d="M12 3v10M8 9l4 4 4-4"/><path d="M4 17h16M4 21h16"/>',
  // Export, nicht Code: Pfeil, der aus einer Ablage heraus zeigt. Die
  // Chevrons davor liessen das Panel wie einen Code-Editor aussehen.
  output:  '<path d="M12 3v11M8.5 6.5L12 3l3.5 3.5"/><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  // Paletten-Panel: drei sich ueberlappende Kreise — das Zeichen fuers Mischen
  // von Farben.
  palette: '<circle cx="9" cy="9.5" r="4.8"/><circle cx="15" cy="9.5" r="4.8"/><circle cx="12" cy="14.8" r="4.8"/>',
  template:'<rect x="7" y="3" width="14" height="14" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h12"/><path d="M21 13l-4-4-6 6"/>',
  image:   '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  // Vorschau: ein Bild im Bild — das Ganze und der Ausschnitt darin.
  preview: '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="7" y="9" width="7" height="6" rx="1" stroke-dasharray="2 2"/>',
  cleanup: '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 14v4M17 16h4M5 2v3M3.5 3.5h3"/>',
};

export function iconSvg(name) {
  const body = ICONS[name];
  if (!body) return '';
  return `<svg class="ui-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    if (el.firstElementChild?.classList.contains('ui-ico')) return;
    el.insertAdjacentHTML('afterbegin', iconSvg(el.dataset.icon));
  });
}
