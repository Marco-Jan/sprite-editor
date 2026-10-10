// ════════════════════════════════════════════════════════════════════
// WHATSNEW — Hilfe → „Was ist neu?“
// ════════════════════════════════════════════════════════════════════
// Der Editor aktualisiert sich im Browser von selbst (sw.js) — ein Band wie
// in der Desktop-App käme nie. Darum steht im Hilfe-Menü, was sich in den
// letzten Versionen geändert hat: aus notes/web.md (Format in js/notes.js).
import { parseNotes, notePoints } from './notes.js';
import { t, getLang, onLangChange } from './i18n.js';

/** So viele Versionen zeigt der Dialog. */
const SHOW = 5;

/** @type {import('./notes.js').NoteEntry[] | null} */
let entries = null;

async function load() {
  if (entries) return entries;
  const res = await fetch('notes/web.md', { cache: 'no-cache' });
  if (!res.ok) throw new Error(String(res.status));
  entries = parseNotes(await res.text());
  return entries;
}

/** @param {HTMLElement} body */
function render(body) {
  body.replaceChildren();
  if (!entries) return;
  const shown = entries.slice(0, SHOW).filter(e => notePoints(e, getLang()).length);
  if (!shown.length) {
    body.textContent = t('news.empty');
    return;
  }
  for (const e of shown) {
    const h = document.createElement('h3');
    h.className = 'news-version';
    h.textContent = t('news.version', { v: e.version });
    const ul = document.createElement('ul');
    ul.className = 'news-list';
    for (const p of notePoints(e, getLang())) {
      const li = document.createElement('li');
      li.textContent = p;
      ul.append(li);
    }
    body.append(h, ul);
  }
}

export function initWhatsNew() {
  const overlay = document.getElementById('news-modal-overlay');
  const body = document.getElementById('news-body');
  const btn = document.getElementById('news-btn');
  if (!overlay || !body || !btn) return;
  const close = () => overlay.classList.remove('open');
  document.getElementById('news-close')?.addEventListener('click', close);
  document.getElementById('news-ok')?.addEventListener('click', close);
  btn.addEventListener('click', async () => {
    overlay.classList.add('open');
    if (!entries) body.textContent = t('news.loading');
    try {
      await load();
      render(body);
    } catch {
      // Offline und nicht im Cache — selten, aber dann kein leerer Dialog.
      body.textContent = t('news.offline');
    }
  });
  onLangChange(() => { if (overlay.classList.contains('open')) render(body); });
}
