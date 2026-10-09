// ════════════════════════════════════════════════════════════════════
// DOCK — Seitenleisten als Icon-Spalte, Kopfzeile als Menü
// ════════════════════════════════════════════════════════════════════
// Beide Seitenleisten sind eine schmale Spalte mit einem Icon pro Panel. Ein Klick schiebt das Panel als Schublade über die
// Zeichenfläche, ein zweiter Klick, das × im Panel-Kopf oder Esc schließt
// sie wieder. Es ist immer höchstens eine Schublade offen.
//
// Unter 1280 px wandern außerdem die Knöpfe der Kopfzeile in ein Menü
// hinter dem ☰-Knopf (styles.css, Abschnitt 12).
//
// Die Panels selbst bleiben im HTML, wo sie sind — nur CSS (styles.css,
// Abschnitt 11) macht aus ihnen Schubladen. Alles mit [data-dock] kann im
// Dock sitzen: die Panels und, wenn man sie dorthin zieht, auch Werkzeug-
// leiste und Farbzeile (layout.js meldet sie über addDockItem an).
import { t, onLangChange } from './i18n.js';
import { iconSvg } from './icons.js';


let openPanel = null;
const MOBILE_Q = window.matchMedia('(max-width: 1100px)');
const docks = [];

export function closeDrawer() { show(null); }
export function openDrawer(panel) { show(panel); }

export function dockButtonFor(id) {
  return docks.find(d => d.panel.dataset.dock === id)?.btn || null;
}

// Dock-Icons in beiden Spalten wieder in die Panel-Reihenfolge bringen.
export function sortDock(order) {
  document.querySelectorAll('.rail-dock').forEach(dock => {
    [...dock.children]
      .sort((a, b) => order.indexOf(/** @type {HTMLElement} */ (a).dataset.target) - order.indexOf(/** @type {HTMLElement} */ (b).dataset.target))
      .forEach(b => dock.append(b));
  });
}

function show(panel) {
  // Ein "Gast" (siehe unten) geht zurück in seine Leiste.
  document.querySelectorAll('[data-dock].is-guest').forEach(p => {
    p.classList.remove('is-guest', 'is-shown');
    p.closest('.rail').append(p);
    // Zurück in die Schublade: Leisten stehen dort wieder senkrecht.
    if (p.classList.contains('is-bar-drawer') && !MOBILE_Q.matches) p.classList.add('is-vertical');
  });
  openPanel = panel;
  document.querySelectorAll('.rail > [data-dock]').forEach(p => p.classList.toggle('is-shown', p === panel));
  // Hat die Seite schon angepinnte Panels, öffnet sich das Panel als Gast
  // unten in derselben Spalte statt als Schublade daneben.
  const rail = panel?.closest('.rail');
  const pins = rail?.querySelector('.rail-pins');
  if (pins && rail.classList.contains('has-pins')) {
    pins.append(panel);
    panel.classList.add('is-guest');
    // In der breiten Panel-Spalte liegt eine Leiste wie ein Panel, nicht senkrecht.
    panel.classList.remove('is-vertical');
    panel.scrollIntoView({ block: 'nearest' });
  }
  document.querySelectorAll('.dock-btn').forEach(b => {
    const on = !!panel && b.dataset.target === panel.dataset.dock;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-expanded', String(on));
  });
}

function relabel() {
  docks.forEach(({ btn, panel }) => {
    const name = panel.dataset.dockLabel ? t(panel.dataset.dockLabel)
      : panel.querySelector('.panel-title')?.textContent.trim() || panel.dataset.dock;
    btn.title = name;
    btn.setAttribute('aria-label', name);
  });
  document.querySelectorAll('.dock-close').forEach(b => {
    b.title = t('help.close');
    b.setAttribute('aria-label', t('help.close'));
  });
}

function makeDockButton(el, id, icon, dock) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dock-btn';
  btn.dataset.target = id;
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = iconSvg(icon) || iconSvg('sprites');
  btn.addEventListener('click', () => {
    // Angepinnt, in einer Zone oder schwebend: keine Schublade, sondern
    // zeigen. `data-mode` ist die Art des Platzes, die layout.js ins DOM
    // schreibt ('dock' | 'pinned' | 'zone' | 'float') — nur gelesen, nie gesetzt.
    const mode = el.dataset.mode;
    if (mode && mode !== 'dock') { show(null); el.dispatchEvent(new CustomEvent('panel-focus')); return; }
    show(openPanel === el ? null : el);
  });
  dock.append(btn);
  docks.push({ btn, panel: el });
  return btn;
}

// Weitere Dock-Einträge (Werkzeugleiste, Farbzeile) — Name über i18n-Schlüssel.
export function addDockItem(el, id, icon, labelKey, side) {
  el.dataset.dock = id;
  el.dataset.dockLabel = labelKey;
  const btn = makeDockButton(el, id, icon, document.querySelector(`#rail-${side} .rail-dock`));
  relabel();
  return btn;
}

export function initDock() {
  document.querySelectorAll('.rail').forEach(rail => {
    const dock = document.createElement('nav');
    dock.className = 'rail-dock';
    rail.prepend(dock);

    rail.querySelectorAll(':scope > [data-panel]').forEach(panel => {
      panel.dataset.dock = panel.dataset.panel;
      makeDockButton(panel, panel.dataset.panel, panel.dataset.panel, dock);

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'icon-btn dock-close';
      close.innerHTML = iconSvg('close');
      close.addEventListener('click', () => show(null));
      panel.querySelector('.panel-head').append(close);
    });
  });

  relabel();
  onLangChange(relabel);

  // Klick irgendwo anders schließt ein offenes, nicht angepinntes Panel.
  // Dialoge und Hinweise, die aus dem Panel heraus geöffnet wurden, zählen
  // dabei nicht als "woanders" — ebenso die Options-Zeile der Werkzeug-
  // leiste, die auf dem Handy über deren Schublade schwebt (layout.js).
  document.addEventListener('pointerdown', e => {
    if (!openPanel || openPanel.contains(e.target)) return;
    if (/** @type {HTMLElement} */ (e.target).closest('.dock-btn, .modal-overlay, #confirm-toast, #info-toast, #tool-opts')) return;
    show(null);
  });

  // Esc schließt zuerst Menü bzw. Schublade — außer ein Dialog ist offen,
  // der gehört dann dem normalen Esc-Handler in app.js.
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || document.querySelector('.modal-overlay.open')) return;
    if (openPanel) { e.stopPropagation(); show(null); }
  }, true);
}
