/**
 * SALTLAB Calculator - Sistema de notificaciones toast
 * Mensajes de feedback sin bloquear la interfaz (sustituye alert() en flujos clave).
 */
(function () {
  const TOAST_DURATION_MS = 3500;
  const TOAST_MAX = 5;

  function getContainer() {
    var id = 'saltlab-toast-container';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'saltlab-toast-container';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      document.body.appendChild(el);
    }
    return el;
  }

  function dismiss(toastEl) {
    if (!toastEl || !toastEl.parentNode) return;
    toastEl.classList.add('saltlab-toast-out');
    setTimeout(function () {
      if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl);
    }, 300);
  }

  /**
   * Muestra una notificación toast.
   * @param {string} message - Texto a mostrar
   * @param {'success'|'error'|'info'} type - Tipo (success=verde, error=rojo, info=neutro)
   * @param {number} durationMs - Duración en ms (0 = no auto-cerrar)
   */
  function showToast(message, type, durationMs) {
    if (!message) return;
    type = type || 'info';
    durationMs = durationMs != null ? durationMs : TOAST_DURATION_MS;

    var container = getContainer();
    var toasts = container.querySelectorAll('.saltlab-toast');
    while (toasts.length >= TOAST_MAX) {
      if (toasts[0]) dismiss(toasts[0]);
      toasts = container.querySelectorAll('.saltlab-toast');
    }

    var toast = document.createElement('div');
    toast.className = 'saltlab-toast saltlab-toast--' + type;
    toast.setAttribute('role', 'alert');

    var icon = '';
    if (type === 'success') icon = '✓';
    else if (type === 'error') icon = '✕';
    else icon = 'ℹ';

    toast.innerHTML = '<span class="saltlab-toast-icon" aria-hidden="true">' + icon + '</span>' +
      '<span class="saltlab-toast-message">' + escapeHtmlToast(String(message)) + '</span>' +
      '<button type="button" class="saltlab-toast-close" aria-label="Cerrar">&times;</button>';

    function escapeHtmlToast(s) {
      var div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    }

    var closeBtn = toast.querySelector('.saltlab-toast-close');
    closeBtn.addEventListener('click', function () { dismiss(toast); });

    container.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('saltlab-toast-visible'); });

    if (durationMs > 0) {
      var t = setTimeout(function () { dismiss(toast); }, durationMs);
      toast._toastTimeout = t;
    }
  }

  window.showToast = showToast;
})();
