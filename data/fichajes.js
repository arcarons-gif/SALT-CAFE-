/**
 * Registro de fichajes (entrada/salida) por usuario.
 * Semana: lunes 00:00 a domingo 23:59. Mínimo 5h/semana.
 */
const FICHAJES_STORAGE = 'benny_fichajes';
const FICHAJES_AJUSTES_STORAGE = 'benny_fichajes_ajustes_semana';
const HORAS_MINIMAS_SEMANA = 5;
const FRANJA_NOCTURNA_INICIO_HORA = 18;
const FRANJA_NOCTURNA_FIN_HORA = 6;
const HORAS_PRIMA_NOCTURNA_SEMANA = 5;
/** Entradas sin salida que lleven más de esta cantidad de horas se eliminan */
const HORAS_MAX_ENTRADA_ABIERTA = 5;

let _cachedFichajes = null;
function getFichajes() {
  if (_cachedFichajes !== null) return _cachedFichajes;
  try {
    const raw = localStorage.getItem(FICHAJES_STORAGE);
    const parsed = raw ? JSON.parse(raw) : [];
    _cachedFichajes = Array.isArray(parsed) ? parsed : [];
    return _cachedFichajes;
  } catch {
    return (_cachedFichajes = []);
  }
}
function invalidateFichajesCache() {
  _cachedFichajes = null;
}
if (typeof window !== 'undefined') window.invalidateFichajesCache = invalidateFichajesCache;

/**
 * Une fichajes del servidor con los locales (mismo id: prioriza el que tiene salida cerrada o el más reciente).
 */
function mergeFichajesFromServer(serverList) {
  if (!Array.isArray(serverList)) serverList = [];
  var local = [];
  try {
    local = JSON.parse(localStorage.getItem(FICHAJES_STORAGE) || '[]');
  } catch (_) {
    local = [];
  }
  if (!Array.isArray(local)) local = [];
  var byId = {};
  function prefer(a, b) {
    if (!a) return b;
    if (!b) return a;
    var aOpen = !a.salida;
    var bOpen = !b.salida;
    if (aOpen && !bOpen) return b;
    if (bOpen && !aOpen) return a;
    var ta = new Date(a.entrada || 0).getTime();
    var tb = new Date(b.entrada || 0).getTime();
    return tb >= ta ? b : a;
  }
  serverList.forEach(function (f) {
    if (!f || !f.id) return;
    byId[f.id] = Object.assign({}, f);
  });
  local.forEach(function (f) {
    if (!f || !f.id) return;
    if (!byId[f.id]) {
      byId[f.id] = Object.assign({}, f);
      return;
    }
    byId[f.id] = prefer(byId[f.id], f);
  });
  return Object.keys(byId).map(function (k) {
    return byId[k];
  });
}
if (typeof window !== 'undefined') window.mergeFichajesFromServer = mergeFichajesFromServer;

/** Elimina del almacenamiento las entradas abiertas (sin salida) con más de 5h */
function limpiarEntradasAbiertasAntiguas() {
  const list = getFichajes();
  const now = Date.now();
  const maxMs = HORAS_MAX_ENTRADA_ABIERTA * 60 * 60 * 1000;
  const filtrado = list.filter(f => {
    if (f.salida) return true;
    const ent = new Date(f.entrada).getTime();
    if (now - ent <= maxMs) return true;
    return false;
  });
  if (filtrado.length !== list.length) {
    saveFichajes(filtrado);
  }
}

function saveFichajes(arr) {
  const list = Array.isArray(arr) ? arr : [];
  _cachedFichajes = list;
  localStorage.setItem(FICHAJES_STORAGE, JSON.stringify(list));
  if (typeof window !== 'undefined' && window.backendApi && typeof window.backendApi.syncFichajesToServer === 'function') {
    window.backendApi.syncFichajesToServer(list);
  }
}

/** Añade un fichaje: { id, userId, entrada (ISO), salida (ISO o null) } */
function addFichaje(userId, entrada, salida) {
  const list = getFichajes();
  const id = 'fich-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  list.push({ id, userId, entrada, salida: salida || null });
  saveFichajes(list);
  return id;
}

/** Actualiza la hora de entrada de un fichaje por id. Devuelve true si se actualizó. */
function updateFichajeEntrada(fichajeId, nuevaEntradaISO) {
  if (!fichajeId || !nuevaEntradaISO) return false;
  const list = getFichajes();
  const idx = list.findIndex(f => (f.id || '') === fichajeId);
  if (idx < 0) return false;
  list[idx] = { ...list[idx], entrada: nuevaEntradaISO };
  saveFichajes(list);
  return true;
}

/** Cierra el último fichaje abierto del usuario (añade salida). Devuelve el fichaje cerrado o null. */
function cerrarUltimoFichaje(userId, salida) {
  const list = getFichajes();
  const idx = list.map((f, i) => [f, i]).filter(([f]) => f.userId === userId && !f.salida).pop();
  if (!idx) return null;
  const [f, i] = idx;
  const cerrado = { ...f, salida };
  list[i] = cerrado;
  saveFichajes(list);
  return cerrado;
}

/** Obtiene el inicio (lunes 00:00) y fin (domingo 23:59:59) de la semana de una fecha */
function getSemanaLimites(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diffLunes = day === 0 ? -6 : 1 - day;
  const lunes = new Date(d);
  lunes.setDate(d.getDate() + diffLunes);
  lunes.setHours(0, 0, 0, 0);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);
  return { inicio: lunes, fin: domingo };
}

function getSemanaClave(date) {
  var lim = getSemanaLimites(date);
  return lim.inicio.toISOString().slice(0, 10);
}

function getAjustesSemanaStorage() {
  try {
    var raw = localStorage.getItem(FICHAJES_AJUSTES_STORAGE);
    var obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch (_) {
    return {};
  }
}

function saveAjustesSemanaStorage(obj) {
  try {
    localStorage.setItem(FICHAJES_AJUSTES_STORAGE, JSON.stringify(obj || {}));
  } catch (_) {}
}

/**
 * Ajustes manuales semanales por usuario (acumulado normal/nocturno en horas).
 * Se usan como delta sobre las horas calculadas por fichajes.
 */
function getAjusteAcumuladosSemana(userId, date) {
  var uid = (userId || '').toString().trim();
  if (!uid) return { horas: 0, nocturnas: 0 };
  var semana = getSemanaClave(date || new Date());
  var map = getAjustesSemanaStorage();
  var row = map[uid] && map[uid][semana] ? map[uid][semana] : null;
  var horas = row && typeof row.horas === 'number' ? row.horas : 0;
  var nocturnas = row && typeof row.nocturnas === 'number' ? row.nocturnas : 0;
  return { horas: horas, nocturnas: nocturnas };
}

function setAjusteAcumuladosSemana(userId, date, horas, nocturnas) {
  var uid = (userId || '').toString().trim();
  if (!uid) return false;
  var semana = getSemanaClave(date || new Date());
  var map = getAjustesSemanaStorage();
  if (!map[uid] || typeof map[uid] !== 'object') map[uid] = {};
  var h = Number(horas);
  var n = Number(nocturnas);
  if (isNaN(h)) h = 0;
  if (isNaN(n)) n = 0;
  map[uid][semana] = { horas: h, nocturnas: n, updatedAt: new Date().toISOString() };
  saveAjustesSemanaStorage(map);
  return true;
}

/** Horas trabajadas en la semana que contiene la fecha (solo fichajes cerrados) */
function getHorasSemana(userId, date) {
  const { inicio, fin } = getSemanaLimites(date);
  const list = getFichajes().filter(
    f => f.userId === userId && f.salida && f.entrada
  );
  let totalMs = 0;
  list.forEach(f => {
    const e = new Date(f.entrada).getTime();
    const s = new Date(f.salida).getTime();
    if (s <= e) return;
    const start = Math.max(e, inicio.getTime());
    const end = Math.min(s, fin.getTime());
    if (end > start) totalMs += end - start;
  });
  var totalHoras = totalMs / (1000 * 60 * 60);
  var ajuste = getAjusteAcumuladosSemana(userId, date);
  return Math.max(0, totalHoras + (ajuste.horas || 0));
}

/**
 * Horas trabajadas en la franja nocturna semanal (18:00 -> 06:00 del día siguiente).
 * Se calcula por solape real de cada fichaje cerrado con esa franja.
 */
function getHorasNocturnasSemana(userId, date) {
  const { inicio, fin } = getSemanaLimites(date);
  const weekStartMs = inicio.getTime();
  const weekEndMs = fin.getTime();
  const list = getFichajes().filter(
    f => f.userId === userId && f.salida && f.entrada
  );
  let totalMs = 0;
  list.forEach(f => {
    const e = new Date(f.entrada).getTime();
    const s = new Date(f.salida).getTime();
    if (s <= e) return;
    const start = Math.max(e, weekStartMs);
    const end = Math.min(s, weekEndMs);
    if (end <= start) return;
    for (let dayMs = weekStartMs; dayMs <= weekEndMs; dayMs += 24 * 60 * 60 * 1000) {
      const nightStart = new Date(dayMs);
      nightStart.setHours(FRANJA_NOCTURNA_INICIO_HORA, 0, 0, 0);
      const nightEnd = new Date(dayMs + 24 * 60 * 60 * 1000);
      nightEnd.setHours(FRANJA_NOCTURNA_FIN_HORA, 0, 0, 0);
      const overlapStart = Math.max(start, nightStart.getTime());
      const overlapEnd = Math.min(end, nightEnd.getTime());
      if (overlapEnd > overlapStart) totalMs += overlapEnd - overlapStart;
    }
  });
  var totalHoras = totalMs / (1000 * 60 * 60);
  var ajuste = getAjusteAcumuladosSemana(userId, date);
  return Math.max(0, totalHoras + (ajuste.nocturnas || 0));
}

/** Milisegundos hasta el próximo lunes 00:00 */
function getMsHastaFinSemana(date) {
  const { inicio, fin } = getSemanaLimites(date);
  const now = date.getTime();
  const finMs = fin.getTime();
  if (now >= finMs) {
    const proxLunes = new Date(fin);
    proxLunes.setDate(proxLunes.getDate() + 1);
    proxLunes.setHours(0, 0, 0, 0);
    return proxLunes.getTime() - now;
  }
  return finMs - now;
}

function getFichajesByUser(userId) {
  return getFichajes().filter(f => f.userId === userId);
}

/** True si el usuario tiene al menos una entrada sin salida (turno abierto) */
function hasEntradaAbierta(userId) {
  return getFichajes().some(f => f.userId === userId && !f.salida);
}
