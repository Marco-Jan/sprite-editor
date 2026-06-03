// ════════════════════════════════════════════════════════════════════
// TOAST — Confirm- und Info-Toast (ersetzt browser confirm/alert)
// ════════════════════════════════════════════════════════════════════
let _cleanup = null;

function _show(msg, okLabel, showCancel, onConfirm) {
  if (_cleanup) _cleanup();
  const toast    = document.getElementById('confirm-toast');
  const msgEl    = document.getElementById('confirm-toast-msg');
  const cancelEl = document.getElementById('confirm-toast-cancel');
  const okEl     = document.getElementById('confirm-toast-ok');

  msgEl.textContent        = msg;
  okEl.textContent         = okLabel;
  cancelEl.style.display   = showCancel ? '' : 'none';
  toast.classList.add('visible');

  function close() {
    toast.classList.remove('visible');
    cancelEl.removeEventListener('click', onCancel);
    okEl.removeEventListener('click', onOk);
    cancelEl.style.display = '';
    okEl.textContent       = 'Löschen';
    _cleanup = null;
  }
  function onCancel() { close(); }
  function onOk()     { close(); if (onConfirm) onConfirm(); }

  cancelEl.addEventListener('click', onCancel);
  okEl.addEventListener('click', onOk);
  _cleanup = close;
}

// Bestätigung mit Abbrechen-Button — onConfirm wird nur bei OK aufgerufen.
export function showConfirmToast(msg, onConfirm, okLabel = 'Löschen') {
  _show(msg, okLabel, true, onConfirm);
}

// Reine Info — nur OK-Button, kein Rückgabewert.
export function showInfoToast(msg) {
  _show(msg, 'OK', false, null);
}
