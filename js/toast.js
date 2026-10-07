// ════════════════════════════════════════════════════════════════════
// TOAST — Rückfrage und Hinweis (ersetzt window.confirm / window.alert)
// ════════════════════════════════════════════════════════════════════
// Zwei Fälle, die früher gleich aussahen und deshalb verwechselt wurden:
//
//   Rückfrage  verlangt eine Antwort. Legt sich mittig über die Seite,
//              dunkelt den Rest ab, nimmt den Fokus. Enter bestätigt,
//              Esc bricht ab. Wer sie übersieht, wartet sonst auf etwas,
//              das nie passiert.
//   Hinweis    ist nur eine Meldung. Bleibt unten, blockiert nichts und
//              geht nach ein paar Sekunden von selbst.
//
// Die Tastatur wird in der Capture-Phase abgefangen und dort gestoppt:
// solange eine Rückfrage offen ist, dürfen die Werkzeug-Kürzel aus app.js
// nicht mitfeuern.
import { t } from './i18n.js';

let _cleanup = null;

// Wie lange ein Hinweis stehen bleibt. Längere Texte brauchen länger —
// grob nach Lesegeschwindigkeit, aber mit Ober- und Untergrenze.
function readingTime(msg) {
  return Math.min(11000, Math.max(3500, msg.length * 55));
}

function _show(msg, okLabel, isConfirm, onConfirm) {
  if (_cleanup) _cleanup();

  const toast    = document.getElementById('confirm-toast');
  const msgEl    = document.getElementById('confirm-toast-msg');
  const cancelEl = document.getElementById('confirm-toast-cancel');
  const okEl     = document.getElementById('confirm-toast-ok');
  if (!toast) return;

  msgEl.textContent = msg;
  okEl.textContent  = okLabel;
  cancelEl.hidden   = !isConfirm;
  okEl.classList.toggle('btn--danger', isConfirm);
  okEl.classList.toggle('btn--primary', !isConfirm);

  toast.classList.remove('is-confirm', 'is-info');
  toast.classList.add('visible', isConfirm ? 'is-confirm' : 'is-info');
  toast.setAttribute('role', isConfirm ? 'alertdialog' : 'status');
  if (isConfirm) toast.setAttribute('aria-modal', 'true');
  else toast.removeAttribute('aria-modal');

  // Fokus zurückgeben, wo er war — sonst springt er nach dem Schließen
  // an den Seitenanfang.
  const previous = document.activeElement;
  let timer = null;

  function close() {
    clearTimeout(timer);
    toast.classList.remove('visible', 'is-confirm', 'is-info');
    cancelEl.removeEventListener('click', onCancel);
    okEl.removeEventListener('click', onOk);
    document.removeEventListener('keydown', onKey, true);
    toast.removeEventListener('pointerdown', onBackdrop);
    cancelEl.hidden = false;
    _cleanup = null;
    const prevEl = /** @type {HTMLElement} */ (previous);
    if (prevEl && prevEl.focus) {
      try { prevEl.focus(); } catch { /* Element ist weg — egal */ }
    }
  }

  function onCancel() { close(); }
  function onOk() { close(); if (onConfirm) onConfirm(); }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (!isConfirm) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onOk();
      return;
    }
    // Solange die Rückfrage steht, gehört die Tastatur ihr allein.
    // Tab darf durchrutschen, damit man zwischen den Knöpfen wechseln kann.
    if (e.key !== 'Tab') e.stopPropagation();
  }

  // Klick auf den abgedunkelten Rand bricht ab — wie bei den anderen Dialogen.
  function onBackdrop(e) {
    if (isConfirm && e.target === toast) close();
  }

  cancelEl.addEventListener('click', onCancel);
  okEl.addEventListener('click', onOk);
  document.addEventListener('keydown', onKey, true);
  toast.addEventListener('pointerdown', onBackdrop);
  _cleanup = close;

  if (isConfirm) {
    // Der bestätigende Knopf bekommt den Fokus: Enter genügt, und
    // Tastaturnutzer landen nicht irgendwo.
    okEl.focus();
  } else {
    timer = setTimeout(close, readingTime(msg));
  }
}

// Bestätigung mit Abbrechen — onConfirm läuft nur bei Zustimmung.
export function showConfirmToast(msg, onConfirm, okLabel = null) {
  _show(msg, okLabel || t('list.delete'), true, onConfirm);
}

// Reine Meldung — verschwindet von selbst.
export function showInfoToast(msg) {
  _show(msg, 'OK', false, null);
}
