/**
 * Cliente API para sincronizar con el backend de SALTLAB Calculator.
 * Si el servidor está disponible, usuarios y fichajes se leen/escriben allí
 * y se hace polling para ver cambios de otros dispositivos.
 */
(function () {
  const AUTH_STORAGE = 'benny_users';
  const FICHAJES_STORAGE = 'benny_fichajes';
  const SERVICIOS_STORAGE = 'benny_servicios';
  const API_URL_STORAGE = 'saltlab_api_url';
  const POLL_INTERVAL_MS = 5000;
  const DEFAULT_API_URL = 'http://localhost:3001';

  function getStoredApiUrl() {
    try {
      var predefined = (typeof window.SALTLAB_API_URL !== 'undefined' && window.SALTLAB_API_URL) ? (window.SALTLAB_API_URL + '').trim() : '';
      var url = (localStorage.getItem(API_URL_STORAGE) || '').trim();
      // En producción (GitHub Pages): usar siempre la URL de config para que todos sincronicen,
      // salvo que el usuario haya puesto explícitamente otra URL válida (no localhost).
      var isProduction = typeof window !== 'undefined' && window.location && /github\.io/i.test((window.location.hostname || ''));
      if (isProduction && predefined) {
        if (!url || /localhost|127\.0\.0\.1/i.test(url)) return predefined;
      }
      if (url) return url;
      return predefined || null;
    } catch (_) {
      return null;
    }
  }

  function getBaseUrl() {
    var stored = getStoredApiUrl();
    if (stored) return stored.replace(/\/$/, '');
    if (typeof window.SALTLAB_API_URL !== 'undefined' && window.SALTLAB_API_URL) {
      return window.SALTLAB_API_URL.replace(/\/$/, '');
    }
    return '';
  }

  function setApiUrl(url) {
    var u = (url || '').trim();
    if (u) {
      localStorage.setItem(API_URL_STORAGE, u.replace(/\/$/, ''));
    } else {
      localStorage.removeItem(API_URL_STORAGE);
    }
  }

  function getApiUrl() {
    return getBaseUrl();
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options && options.headers) } });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  }

  async function isAvailable(timeoutMs) {
    var base = getBaseUrl();
    if (!base) return false;
    try {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var id = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 25000) : null;
      var opts = { method: 'GET' };
      if (ctrl) opts.signal = ctrl.signal;
      const r = await fetch(base + '/api/health', opts);
      if (id) clearTimeout(id);
      return r.ok;
    } catch {
      return false;
    }
  }

  async function fetchAndApplyUsers() {
    try {
      const users = await fetchJson(getBaseUrl() + '/api/users');
      if (users.length > 0) {
        const prev = localStorage.getItem(AUTH_STORAGE);
        const next = JSON.stringify(users);
        localStorage.setItem(AUTH_STORAGE, next);
        if (typeof window.invalidateUsersCache === 'function') window.invalidateUsersCache();
        return prev !== next;
      }
      var local = [];
      try {
        local = JSON.parse(localStorage.getItem(AUTH_STORAGE) || '[]');
      } catch (_) {}
      if (local.length > 0) {
        await syncUsersToServer(local);
      }
      return false;
    } catch {
      return false;
    }
  }

  async function fetchAndApplyFichajes() {
    try {
      const fichajes = await fetchJson(getBaseUrl() + '/api/fichajes');
      if (fichajes.length > 0) {
        const prev = localStorage.getItem(FICHAJES_STORAGE);
        const next = JSON.stringify(fichajes);
        localStorage.setItem(FICHAJES_STORAGE, next);
        if (typeof window.invalidateFichajesCache === 'function') window.invalidateFichajesCache();
        return prev !== next;
      }
      var local = [];
      try {
        local = JSON.parse(localStorage.getItem(FICHAJES_STORAGE) || '[]');
      } catch (_) {}
      if (local.length > 0) {
        await syncFichajesToServer(local);
      }
      return false;
    } catch {
      return false;
    }
  }

  async function fetchAndApplyServicios() {
    try {
      const servicios = await fetchJson(getBaseUrl() + '/api/servicios');
      if (servicios.length > 0) {
        const prev = localStorage.getItem(SERVICIOS_STORAGE);
        const next = JSON.stringify(servicios);
        localStorage.setItem(SERVICIOS_STORAGE, next);
        if (typeof window.invalidateServiciosCache === 'function') window.invalidateServiciosCache();
        return prev !== next;
      }
      var local = [];
      try {
        local = JSON.parse(localStorage.getItem(SERVICIOS_STORAGE) || '[]');
      } catch (_) {}
      if (local.length > 0) {
        await syncServiciosToServer(local);
      }
      return false;
    } catch {
      return false;
    }
  }

  async function syncUsersToServer(users) {
    if (!Array.isArray(users)) return;
    try {
      await fetch(getBaseUrl() + '/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users }),
      });
    } catch (e) {
      console.warn('SALTLAB API: no se pudo sincronizar usuarios', e);
    }
  }

  async function syncFichajesToServer(fichajes) {
    if (!Array.isArray(fichajes)) return;
    try {
      await fetch(getBaseUrl() + '/api/fichajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fichajes }),
      });
    } catch (e) {
      console.warn('SALTLAB API: no se pudo sincronizar fichajes', e);
    }
  }

  async function syncServiciosToServer(servicios) {
    if (!Array.isArray(servicios)) return;
    try {
      await fetch(getBaseUrl() + '/api/servicios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servicios }),
      });
    } catch (e) {
      console.warn('SALTLAB API: no se pudo sincronizar reparaciones/servicios', e);
    }
  }

  /** Guarda el objeto de exportación completa en server/data/saltlab-datos-completos.json */
  async function saveRepoExport(data) {
    const base = getBaseUrl();
    if (!base) return;
    try {
      await fetch(base + '/api/repo-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (e) {
      console.warn('SALTLAB API: no se pudo guardar exportación en server/data', e);
    }
  }

  var pollTimer = null;

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (!(await isAvailable())) return;
      const usersChanged = await fetchAndApplyUsers();
      const fichajesChanged = await fetchAndApplyFichajes();
      const serviciosChanged = await fetchAndApplyServicios();
      if (usersChanged || fichajesChanged || serviciosChanged) {
        window.dispatchEvent(new CustomEvent('benny-backend-sync', { detail: { users: usersChanged, fichajes: fichajesChanged, servicios: serviciosChanged } }));
      }
    }, POLL_INTERVAL_MS);
  }

  async function init() {
    if (!getStoredApiUrl()) return false;
    if (!(await isAvailable(25000))) {
      // En producción el backend (Render) puede estar "despertando"; reintentar una vez a los 8 s
      var isProd = typeof window !== 'undefined' && window.location && /github\.io/i.test((window.location.hostname || ''));
      if (isProd && typeof window !== 'undefined') {
        window._backendRetry = (window._backendRetry || 0) + 1;
        if (window._backendRetry <= 2) {
          setTimeout(function () {
            window.backendApi && window.backendApi.init().then(function (ok) {
              if (ok && typeof actualizarVista === 'function') actualizarVista();
            });
          }, 8000);
        }
      }
      return false;
    }
    window._backendRetry = 0;
    await fetchAndApplyUsers();
    await fetchAndApplyFichajes();
    await fetchAndApplyServicios();
    startPolling();
    return true;
  }

  // Envolver saveUsers para enviar al servidor después de guardar en localStorage
  var originalSaveUsers = window.saveUsers;
  if (typeof originalSaveUsers === 'function') {
    window.saveUsers = function (users) {
      originalSaveUsers(users);
      syncUsersToServer(users);
    };
  }

  // saveFichajes ya sincroniza con el servidor desde data/fichajes.js si backendApi está disponible

  window.backendApi = {
    getBaseUrl,
    getApiUrl,
    setApiUrl,
    getStoredApiUrl,
    isAvailable,
    fetchAndApplyUsers,
    fetchAndApplyFichajes,
    fetchAndApplyServicios,
    syncUsersToServer,
    syncFichajesToServer,
    syncServiciosToServer,
    saveRepoExport,
    init,
    startPolling,
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.backendApi.init().then(function (ok) {
      if (ok && typeof actualizarVista === 'function') {
        actualizarVista();
      }
    });
  });
})();
