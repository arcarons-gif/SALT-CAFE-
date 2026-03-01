/**
 * Cliente API para sincronizar con el backend de SALTLAB Calculator.
 * Si el servidor está disponible, usuarios y fichajes se leen/escriben allí
 * y se hace polling para ver cambios de otros dispositivos.
 */
(function () {
  const AUTH_STORAGE = 'benny_users';
  const FICHAJES_STORAGE = 'benny_fichajes';
  const API_URL_STORAGE = 'saltlab_api_url';
  const POLL_INTERVAL_MS = 25000;
  const DEFAULT_API_URL = 'http://localhost:3001';

  function getStoredApiUrl() {
    try {
      var url = (localStorage.getItem(API_URL_STORAGE) || '').trim();
      return url || null;
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
    return DEFAULT_API_URL;
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

  async function isAvailable() {
    try {
      const r = await fetch(getBaseUrl() + '/api/health', { method: 'GET' });
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

  var pollTimer = null;

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (!(await isAvailable())) return;
      const usersChanged = await fetchAndApplyUsers();
      const fichajesChanged = await fetchAndApplyFichajes();
      if (usersChanged || fichajesChanged) {
        window.dispatchEvent(new CustomEvent('benny-backend-sync', { detail: { users: usersChanged, fichajes: fichajesChanged } }));
      }
    }, POLL_INTERVAL_MS);
  }

  async function init() {
    if (!(await isAvailable())) return false;
    await fetchAndApplyUsers();
    await fetchAndApplyFichajes();
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

  // Envolver saveFichajes
  var originalSaveFichajes = window.saveFichajes;
  if (typeof originalSaveFichajes === 'function') {
    window.saveFichajes = function (arr) {
      originalSaveFichajes(arr);
      syncFichajesToServer(arr);
    };
  }

  window.backendApi = {
    getBaseUrl,
    getApiUrl,
    setApiUrl,
    getStoredApiUrl,
    isAvailable,
    fetchAndApplyUsers,
    fetchAndApplyFichajes,
    syncUsersToServer,
    syncFichajesToServer,
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
