/**
 * Totales mensuales archivados de reparaciones/tuneos (detalle eliminado localmente para ahorrar espacio).
 * Clave única por mes: YYYY-MM. Sincronización con servidor por merge aditivo por mes.
 */
const SERVICIOS_ARCHIVO_STORAGE = 'benny_servicios_archivo_mensual';

let _cachedArchivo = null;

function getServiciosArchivoMensual() {
  if (_cachedArchivo !== null) return _cachedArchivo;
  try {
    const raw = localStorage.getItem(SERVICIOS_ARCHIVO_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    _cachedArchivo = Array.isArray(parsed) ? parsed : [];
    return _cachedArchivo;
  } catch {
    return (_cachedArchivo = []);
  }
}

function invalidateServiciosArchivoCache() {
  _cachedArchivo = null;
}

function setServiciosArchivoMensual(arr) {
  try {
    var list = Array.isArray(arr) ? arr.slice() : [];
    list.sort(function (a, b) {
      return (a.mes || '').localeCompare(b.mes || '');
    });
    _cachedArchivo = list;
    localStorage.setItem(SERVICIOS_ARCHIVO_STORAGE, JSON.stringify(list));
    if (window.backendApi && typeof window.backendApi.syncServiciosArchivoToServer === 'function') {
      window.backendApi.syncServiciosArchivoToServer(list);
    }
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  } catch (e) {
    console.warn('setServiciosArchivoMensual', e);
  }
}

function pickRicherArchivoRow(a, b) {
  if (!a) return b;
  if (!b) return a;
  var sa = (parseInt(a.reparaciones, 10) || 0) + (parseInt(a.tuneos, 10) || 0);
  var sb = (parseInt(b.reparaciones, 10) || 0) + (parseInt(b.tuneos, 10) || 0);
  if (sb > sa) return Object.assign({}, b);
  if (sa > sb) return Object.assign({}, a);
  var ia = parseFloat(a.importeTotal) || 0;
  var ib = parseFloat(b.importeTotal) || 0;
  return ib >= ia ? Object.assign({}, b) : Object.assign({}, a);
}

function mergeServiciosArchivoFromServer(serverList) {
  if (!Array.isArray(serverList)) serverList = [];
  var local = [];
  try {
    local = JSON.parse(localStorage.getItem(SERVICIOS_ARCHIVO_STORAGE) || '[]');
  } catch (_) {
    local = [];
  }
  if (!Array.isArray(local)) local = [];
  var byMes = {};
  function addRow(row) {
    if (!row || !row.mes) return;
    var k = String(row.mes).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(k)) return;
    var norm = {
      mes: k,
      reparaciones: parseInt(row.reparaciones, 10) || 0,
      tuneos: parseInt(row.tuneos, 10) || 0,
      importeTotal: parseFloat(row.importeTotal) || 0,
      piezasChasis: parseInt(row.piezasChasis, 10) || 0,
      piezasEsenciales: parseInt(row.piezasEsenciales, 10) || 0,
      partesServicio: parseInt(row.partesServicio, 10) || 0,
      archivadoEn: row.archivadoEn || '',
    };
    byMes[k] = pickRicherArchivoRow(byMes[k], norm);
  }
  serverList.forEach(addRow);
  local.forEach(addRow);
  return Object.keys(byMes)
    .sort()
    .map(function (k) {
      return byMes[k];
    });
}

function esMesCerradoServicio(mesKey) {
  if (!mesKey || typeof mesKey !== 'string') return false;
  var cur = new Date();
  var ck = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0');
  return mesKey < ck;
}

function getMapaServiciosArchivoPorMes() {
  var map = {};
  getServiciosArchivoMensual().forEach(function (a) {
    if (a && a.mes) map[String(a.mes).slice(0, 7)] = a;
  });
  return map;
}

if (typeof window !== 'undefined') {
  window.invalidateServiciosArchivoCache = invalidateServiciosArchivoCache;
  window.getServiciosArchivoMensual = getServiciosArchivoMensual;
  window.setServiciosArchivoMensual = setServiciosArchivoMensual;
  window.mergeServiciosArchivoFromServer = mergeServiciosArchivoFromServer;
  window.esMesCerradoServicio = esMesCerradoServicio;
  window.getMapaServiciosArchivoPorMes = getMapaServiciosArchivoPorMes;
}
