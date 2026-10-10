// ════════════════════════════════════════════════════════════════════
// MENUBAR — Menüleiste oben: Datei, Bearbeiten, Ansicht, Hilfe
// ════════════════════════════════════════════════════════════════════
// Verhält sich wie in jedem Programm: ein Klick auf einen Titel klappt sein
// Menü auf; ist eins offen, wechselt schon das Überfahren eines anderen
// Titels. Pfeiltasten wandern durch Einträge und Menüs, Enter wählt, Esc und
// ein Klick daneben schließen.
//
// Die Einträge selbst tun nichts Eigenes:
//   id="…"          app.js hängt die Aktion daran (wie früher an die Knöpfe)
//   data-click="#x" klickt einen vorhandenen Knopf (Undo, Vollbild, …)
//   data-open="p"   öffnet das Panel p (Dock-Knopf)
//   data-mirror="#x" Häkchen spiegelt den Zustand des Knopfs #x (.is-active)
// Untermenüs: .mb-sub mit Kopf (.mb-subtitle) und Liste (.mb-subdrop); sie
// gehen beim Überfahren auf, per Klick (Touch) oder mit Pfeil rechts.
// Die Sprachen hängen an i18n.js (.lang-switch [data-lang]).

/** @type {(sel: string) => any} */
const q = sel => document.querySelector(sel);

let openMenu = null;   // das .mb-menu, das gerade offen ist

const titleOf = m => m.querySelector('.mb-title');
const dropOf = m => m.querySelector('.mb-drop');
const usable = i => !i.hidden && !i.disabled;
// Einträge der obersten Ebene — die in Untermenüs zählen nicht mit.
const itemsOf = m => [...dropOf(m).querySelectorAll('.mb-item')].filter(i => usable(i) && !i.closest('.mb-subdrop'));
const subItemsOf = sub => [...sub.querySelectorAll('.mb-subdrop .mb-item')].filter(usable);
const menus = () => [...document.querySelectorAll('#menubar .mb-menu')];

function syncChecks(m) {
  // Häkchen aus dem Zustand der gespiegelten Knöpfe; ausgegraut, was der
  // gespiegelte Knopf gerade nicht kann (Rückgängig ohne Verlauf).
  dropOf(m).querySelectorAll('[data-mirror]').forEach(i => {
    i.setAttribute('aria-checked', String(!!q(i.dataset.mirror)?.classList.contains('is-active')));
  });
  dropOf(m).querySelectorAll('[data-click]').forEach(i => {
    const src = q(i.dataset.click);
    i.disabled = !!src?.disabled;
  });
}

// Ein aufgeklapptes Menü ganz ins Bild schieben (8 px Abstand zum Rand) —
// am Handy ragte „Ansicht“ sonst links hinaus.
function keepInView(drop) {
  drop.style.transform = '';
  const r = drop.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, pad = 8;
  let dx = 0;
  if (r.right > vw - pad) dx = vw - pad - r.right;
  if (r.left + dx < pad) dx = pad - r.left;
  if (dx) drop.style.transform = `translateX(${Math.round(dx)}px)`;
}

function openSub(sub, focus = false) {
  closeSubs(sub);
  sub.classList.add('is-open');
  sub.querySelector('.mb-subtitle').setAttribute('aria-expanded', 'true');
  // Rechts kein Platz: nach links aufklappen.
  const list = sub.querySelector('.mb-subdrop');
  list.classList.remove('mb-subdrop--left');
  if (list.getBoundingClientRect().right > document.documentElement.clientWidth - 8) list.classList.add('mb-subdrop--left');
  if (focus) subItemsOf(sub)[0]?.focus();
}

function closeSubs(except = null) {
  document.querySelectorAll('#menubar .mb-sub.is-open').forEach(sub => {
    if (sub === except) return;
    sub.classList.remove('is-open');
    sub.querySelector('.mb-subtitle').setAttribute('aria-expanded', 'false');
  });
}

function open(m, focus = false) {
  if (openMenu && openMenu !== m) close();
  openMenu = m;
  syncChecks(m);
  dropOf(m).hidden = false;
  keepInView(dropOf(m));
  titleOf(m).setAttribute('aria-expanded', 'true');
  titleOf(m).classList.add('is-open');
  if (focus) itemsOf(m)[0]?.focus();
}

export function close() {
  if (!openMenu) return;
  closeSubs();
  dropOf(openMenu).hidden = true;
  titleOf(openMenu).setAttribute('aria-expanded', 'false');
  titleOf(openMenu).classList.remove('is-open');
  openMenu = null;
}

function step(dir) {
  const all = menus();
  const k = all.indexOf(openMenu);
  const next = all[(k + dir + all.length) % all.length];
  open(next, true);
  titleOf(next).focus({ preventScroll: true });
  itemsOf(next)[0]?.focus();
}

function run(item) {
  close();
  if (item.dataset.click) q(item.dataset.click)?.click();
  // Panel öffnen: über seinen Dock-Knopf — der weiß, ob es Schublade,
  // angepinnt oder schwebend ist.
  else if (item.dataset.open) q(`.dock-btn[data-target="${item.dataset.open}"]`)?.click();
}

export function initMenubar() {
  const bar = q('#menubar');
  if (!bar) return;

  for (const m of menus()) {
    const t = titleOf(m);
    t.addEventListener('click', e => {
      e.stopPropagation();
      if (openMenu === m) close(); else open(m);
    });
    // Ist schon ein Menü offen, folgt es der Maus von Titel zu Titel.
    t.addEventListener('pointerenter', e => {
      if (openMenu && openMenu !== m && e.pointerType === 'mouse') open(m);
    });
    t.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(m, true); }
    });

    const drop = dropOf(m);
    // Einträge mit eigener Aktion (id, Sprachen, Links) laufen über ihren
    // eigenen Klick-Handler; hier wird danach nur zugeklappt.
    drop.addEventListener('click', e => {
      const item = /** @type {HTMLButtonElement} */ (/** @type {HTMLElement} */ (e.target).closest('.mb-item'));
      if (!item || item.disabled) return;
      // Kopf eines Untermenüs: auf- und zuklappen (Touch), Menü bleibt offen.
      if (item.classList.contains('mb-subtitle')) {
        const sub = item.closest('.mb-sub');
        if (sub.classList.contains('is-open')) closeSubs(); else openSub(sub, e.detail === 0);
        return;
      }
      if (item.dataset.click || item.dataset.open) run(item);
      else close();
    });
    // Maus: Untermenü folgt dem Zeiger; ein anderer Eintrag schließt es.
    drop.addEventListener('pointerover', e => {
      if (e.pointerType !== 'mouse') return;
      const el = /** @type {HTMLElement} */ (e.target);
      const sub = el.closest('.mb-sub');
      if (sub) { if (!sub.classList.contains('is-open')) openSub(sub); }
      else if (el.closest('.mb-item')) closeSubs();
    });
    drop.addEventListener('keydown', e => {
      const active = /** @type {HTMLElement} */ (document.activeElement);
      const sub = active?.closest('.mb-sub');
      if (sub && active.closest('.mb-subdrop')) {
        // Im Untermenü: hoch/runter darin, links zurück zum Kopf.
        const items = subItemsOf(sub);
        const k = items.indexOf(/** @type {any} */ (active));
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(k + 1) % items.length]?.focus(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); items[(k - 1 + items.length) % items.length]?.focus(); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); closeSubs(); sub.querySelector('.mb-subtitle').focus(); return; }
      } else if (sub && e.key === 'ArrowRight') {
        e.preventDefault(); openSub(sub, true); return;
      }
      const items = itemsOf(m);
      const k = items.indexOf(/** @type {any} */ (document.activeElement));
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(k + 1) % items.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(k - 1 + items.length) % items.length]?.focus(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
      else if (e.key === 'Tab') close();
    });
  }

  // Esc schließt das Menü — vor allen anderen Esc-Handlern (Auswahl, Vollbild).
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !openMenu) return;
    e.stopPropagation();
    e.preventDefault();
    // Erst ein offenes Untermenü schließen, dann das Menü.
    const sub = document.querySelector('#menubar .mb-sub.is-open');
    if (sub) { closeSubs(); sub.querySelector('.mb-subtitle').focus(); return; }
    const t = titleOf(openMenu);
    close();
    t.focus();
  }, true);
  document.addEventListener('pointerdown', e => {
    if (openMenu && !/** @type {HTMLElement} */ (e.target).closest('#menubar')) close();
  });
  window.addEventListener('resize', close);
}
