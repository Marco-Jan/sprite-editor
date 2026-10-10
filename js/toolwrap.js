// ════════════════════════════════════════════════════════════════════
// TOOLWRAP — wann die Einstellungen der Werkzeugleiste umbrechen
// ════════════════════════════════════════════════════════════════════
// Am Rechner beginnt die zweite Zeile der Werkzeugleiste mit Symmetrie
// (styles.css, .tool-break). Brechen aber schon die Werkzeuge selbst um,
// machte dieser feste Umbruch eine dritte Zeile auf, obwohl in der zweiten
// noch Platz ist. Dann fällt er weg: Symmetrie und die Einstellungen laufen
// hinter den umgebrochenen Werkzeugen weiter (#toolbar.is-tools-wrapped).
//
// Die Werkzeuge stehen vor dem Umbruch — ob sie umbrechen, hängt also nicht
// davon ab, ob er gilt. Kein Hin- und Herspringen.
//
// Neu gerechnet wird, wenn sich die Leiste in der Größe ändert (Fenster,
// Andocken) und nach einem Sprachwechsel — da werden die Beschriftungen
// anders breit, ohne dass die Leiste es immer wird.
import { onLangChange } from './i18n.js';

export function initToolWrap() {
  const bar = document.getElementById('toolbar');
  if (!bar || typeof ResizeObserver === 'undefined') return;
  const sync = () => {
    /** @type {HTMLElement[]} */
    const groups = [];
    for (const el of bar.children) {
      if (el.classList.contains('tool-break')) break;
      if (el.classList.contains('tool-group') && /** @type {HTMLElement} */ (el).offsetParent) groups.push(/** @type {HTMLElement} */ (el));
    }
    const wrapped = groups.length > 1 && groups[groups.length - 1].offsetTop > groups[0].offsetTop + 2;
    bar.classList.toggle('is-tools-wrapped', wrapped);
  };
  new ResizeObserver(sync).observe(bar);
  onLangChange(() => requestAnimationFrame(sync));
  sync();
}
