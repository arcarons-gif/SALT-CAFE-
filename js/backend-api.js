/**
 * Cliente API para sincronizar con el backend de SALTLAB Calculator.
 * Si el servidor está disponible, usuarios y fichajes se leen/escriben allí
 * y se hace polling para ver cambios de otros dispositivos.
 */
(function () {
  const AUTH_STORAGE = 'benny_users';
  const FICHAJES_STORAGE = 'benny_fichajes';
  const SERVICIOS_STORAGE = 'benny_servicios';
  const SERVICIOS_ARCHIVO_STORAGE = 'benny_servicios_archivo_mensual';
  const VEHICULOS_REGISTRO_STORAGE = 'benny_vehiculos_registro';
  const API_URL_STORAGE = 'saltlab_api_url';
  const POLL_INTERVAL_MS = 3000;
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
        var merged = typeof mergeUsersFromServer === 'function' ? mergeUsersFromServer(users) : users;
        const next = JSON.stringify(merged);
        localStorage.setItem(AUTH_STORAGE, next);
        if (typeof window.invalidateUsersCache === 'function') window.invalidateUsersCache();
        // Si el merge añade/corrige usuarios respecto al servidor, re-subir para que el backend converja.
        if (JSON.stringify(users) !== next) {
          await syncUsersToServer(merged);
        }
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
      var list = Array.isArray(fichajes) ? fichajes : [];
      var prev = localStorage.getItem(FICHAJES_STORAGE);
      var merged = typeof window.mergeFichajesFromServer === 'function' ? window.mergeFichajesFromServer(list) : list;
      var next = JSON.stringify(merged);
      if (list.length === 0) {
        var localOnly = [];
        try {
          localOnly = JSON.parse(prev || '[]');
        } catch (_) {}
        if (localOnly.length > 0) await syncFichajesToServer(localOnly);
      }
      if (prev === next) return false;
      if (typeof window.saveFichajes === 'function') {
        window.saveFichajes(merged);
      } else {
        localStorage.setItem(FICHAJES_STORAGE, next);
        if (typeof window.invalidateFichajesCache === 'function') window.invalidateFichajesCache();
      }
      return true;
    } catch {
      return false;
    }
  }

  async function fetchAndApplyServicios() {
    try {
      const servicios = await fetchJson(getBaseUrl() + '/api/servicios');
      var list = Array.isArray(servicios) ? servicios : [];
      var prev = localStorage.getItem(SERVICIOS_STORAGE);
      var merged = typeof window.mergeServiciosFromServer === 'function' ? window.mergeServiciosFromServer(list) : list;
      var next = JSON.stringify(merged);
      if (list.length === 0) {
        var localOnly = [];
        try {
          localOnly = JSON.parse(prev || '[]');
        } catch (_) {}
        if (localOnly.length > 0) await syncServiciosToServer(localOnly);
      }
      if (prev === next) return false;
      if (typeof window.saveRegistroServicios === 'function') {
        window.saveRegistroServicios(merged);
      } else {
        localStorage.setItem(SERVICIOS_STORAGE, next);
        if (typeof window.invalidateServiciosCache === 'function') window.invalidateServiciosCache();
      }
      return true;
    } catch {
      return false;
    }
  }

  async function fetchAndApplyServiciosArchivo() {
    try {
      const meses = await fetchJson(getBaseUrl() + '/api/servicios-archivo-mensual');
      var list = Array.isArray(meses) ? meses : [];
      var prev = localStorage.getItem(SERVICIOS_ARCHIVO_STORAGE);
      var merged = typeof window.mergeServiciosArchivoFromServer === 'function' ? window.mergeServiciosArchivoFromServer(list) : list;
      var next = JSON.stringify(merged);
      if (list.length === 0) {
        var localOnly = [];
        try {
          localOnly = JSON.parse(prev || '[]');
        } catch (_) {}
        if (localOnly.length > 0) await syncServiciosArchivoToServer(localOnly);
      }
      if (prev === next) return false;
      try {
        localStorage.setItem(SERVICIOS_ARCHIVO_STORAGE, next);
        if (typeof window.invalidateServiciosArchivoCache === 'function') window.invalidateServiciosArchivoCache();
      } catch (_) {}
      return true;
    } catch {
      return false;
    }
  }

  async function fetchAndApplyVehiculosRegistro() {
    try {
      const vehiculosRegistro = await fetchJson(getBaseUrl() + '/api/vehiculos-registro');
      var list = Array.isArray(vehiculosRegistro) ? vehiculosRegistro : [];
      var prev = localStorage.getItem(VEHICULOS_REGISTRO_STORAGE);
      var merged = typeof window.mergeListasVehiculosRegistro === 'function'
        ? window.mergeListasVehiculosRegistro(list, (function () {
          try { return JSON.parse(prev || '[]'); } catch (_) { return []; }
        })())
        : list;
      var next = JSON.stringify(merged);
      if (list.length === 0) {
        var localOnly = [];
        try {
          localOnly = JSON.parse(prev || '[]');
        } catch (_) {}
        if (localOnly.length > 0) await syncVehiculosRegistroToServer(localOnly);
      }
      if (prev === next) return false;
      localStorage.setItem(VEHICULOS_REGISTRO_STORAGE, next);
      return true;
    } catch {
      return false;
    }
  }

  async function syncUsersToServer(users) {
    if (!Array.isArray(users)) return;
    try {
      var res = await fetch(getBaseUrl() + '/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users }),
      });
      // No llamar clearUsersRemovedIds aquí: si el GET del polling aún devuelve la lista antigua,
      // se pierde el tombstone y el usuario borrado reaparece. La poda de ids ocurre en mergeUsersFromServer
      // cuando el servidor ya no incluye ese usuario.
      if (!res.ok) {
        var base = getBaseUrl();
        var hint = res.status === 0 ? ' (red/CORS/bloqueo; revisa URL y que el servidor responda)' : '';
        console.warn(
          'SALTLAB API: POST /api/users falló',
          res.status,
          res.statusText || '',
          base ? '(' + base + ')' : '',
          hint
        );
      }
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

  async function syncServiciosArchivoToServer(meses) {
    if (!Array.isArray(meses)) return;
    try {
      await fetch(getBaseUrl() + '/api/servicios-archivo-mensual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meses }),
      });
    } catch (e) {
      console.warn('SALTLAB API: no se pudo sincronizar archivo mensual de servicios', e);
    }
  }

  async function syncVehiculosRegistroToServer(vehiculosRegistro) {
    if (!Array.isArray(vehiculosRegistro)) return;
    try {
      await fetch(getBaseUrl() + '/api/vehiculos-registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehiculosRegistro }),
      });
    } catch (e) {
      console.warn('SALTLAB API: no se pudo sincronizar registro de vehículos', e);
    }
  }

  /** Guarda el objeto de exportación completa en server/data/saltlab-datos-completos.json */
  async function saveRepoExport(data) {
    const base = getBaseUrl();
    if (!base) return;
    try {
      const res = await fetch(base + '/api/repo-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok && typeof window !== 'undefined') {
        window._conveniosTrustLocalMembershipUntil = 0;
      }
    } catch (e) {
      console.warn('SALTLAB API: no se pudo guardar exportación en server/data', e);
    }
  }

  /** Merge aditivo: sumar movimiento al almacén (no sobrescribe; todos suman al total) */
  async function mergeAlmacen(movimiento) {
    const base = getBaseUrl();
    if (!base || !movimiento || typeof movimiento !== 'object') return;
    try {
      await fetch(base + '/api/merge-almacen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimiento }),
      });
    } catch (e) {
      console.warn('SALTLAB API: no se pudo merge almacén', e);
    }
  }

  /** Merge aditivo: sumar (o restar con negativo) al inventario por conceptoId */
  async function mergeInventario(items) {
    const base = getBaseUrl();
    if (!base || !items || typeof items !== 'object') return;
    try {
      await fetch(base + '/api/merge-inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
    } catch (e) {
      console.warn('SALTLAB API: no se pudo merge inventario', e);
    }
  }

  /** Merge BBDD clientes: enviar clientes para upsert por idCliente (no sobrescribe lo de otros) */
  async function mergeClientesBBDD(clientes) {
    const base = getBaseUrl();
    if (!base || !Array.isArray(clientes)) return;
    try {
      await fetch(base + '/api/merge-clientes-bbdd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientes }),
      });
    } catch (e) {
      console.warn('SALTLAB API: no se pudo merge clientes BBDD', e);
    }
  }

  /** Obtiene todos los datos sincronizados del servidor (toda la app al momento) */
  async function fetchDatosCompletos() {
    var base = getBaseUrl();
    if (!base) return null;
    try {
      var data = await fetchJson(base + '/api/datos-completos');
      if (data && typeof data === 'object' && Object.keys(data).length > 0 && (Array.isArray(data.users) || data._exportadoAt || data.servicios)) {
        return data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function hasEconomyData(obj) {
    if (!obj || typeof obj !== 'object') return false;
    if (obj.economiaInventario && Object.keys(obj.economiaInventario).length > 0) return true;
    if (Array.isArray(obj.economiaCompras) && obj.economiaCompras.length > 0) return true;
    if (Array.isArray(obj.economiaGastos) && obj.economiaGastos.length > 0) return true;
    if (obj.almacenMateriales && typeof obj.almacenMateriales === 'object' && Object.keys(obj.almacenMateriales).length > 0) return true;
    return false;
  }

  var pollTimer = null;

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      if (!(await isAvailable(8000))) return;
      var full = await fetchDatosCompletos();
      if (full && typeof window.aplicarDatosCompletosFromServer === 'function') {
        if (!hasEconomyData(full) && typeof window.getDatosCompletosParaExportar === 'function') {
          var local = window.getDatosCompletosParaExportar();
          if (local && hasEconomyData(local)) {
            try {
              if (local.almacenMateriales && Object.keys(local.almacenMateriales).length > 0) {
                await mergeAlmacen(local.almacenMateriales);
              }
              if (local.economiaInventario && Object.keys(local.economiaInventario).length > 0) {
                await mergeInventario(local.economiaInventario);
              }
              full = await fetchDatosCompletos() || full;
            } catch (e) {}
          }
        }
        window.aplicarDatosCompletosFromServer(full);
        window.dispatchEvent(new CustomEvent('benny-backend-sync', { detail: { fullSync: true } }));
      } else {
        await fetchAndApplyUsers();
        await fetchAndApplyFichajes();
        await fetchAndApplyServicios();
        await fetchAndApplyServiciosArchivo();
        await fetchAndApplyVehiculosRegistro();
        window.dispatchEvent(new CustomEvent('benny-backend-sync', {
          detail: { users: true, fichajes: true, servicios: true, serviciosArchivo: true, vehiculosRegistro: true }
        }));
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
    var full = await fetchDatosCompletos();
    if (full && typeof window.aplicarDatosCompletosFromServer === 'function') {
      if (!hasEconomyData(full) && typeof window.getDatosCompletosParaExportar === 'function') {
        var local = window.getDatosCompletosParaExportar();
        if (local && hasEconomyData(local)) {
          try {
            if (local.almacenMateriales && Object.keys(local.almacenMateriales).length > 0) {
              await mergeAlmacen(local.almacenMateriales);
            }
            if (local.economiaInventario && Object.keys(local.economiaInventario).length > 0) {
              await mergeInventario(local.economiaInventario);
            }
            full = await fetchDatosCompletos() || full;
          } catch (e) {}
        }
      }
      window.aplicarDatosCompletosFromServer(full);
    } else {
      await fetchAndApplyUsers();
      await fetchAndApplyFichajes();
      await fetchAndApplyServicios();
      await fetchAndApplyServiciosArchivo();
      await fetchAndApplyVehiculosRegistro();
    }
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
    fetchAndApplyServiciosArchivo,
    fetchAndApplyVehiculosRegistro,
    fetchDatosCompletos,
    syncUsersToServer,
    syncFichajesToServer,
    syncServiciosToServer,
    syncServiciosArchivoToServer,
    syncVehiculosRegistroToServer,
    saveRepoExport,
    mergeAlmacen,
    mergeInventario,
    mergeClientesBBDD,
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
