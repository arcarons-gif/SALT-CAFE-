/**
 * SALTLAB Calculator - Calculadora Genesis Community V3
 * Lógica de cálculo de costes de reparación y tuneo + Control de usuarios
 */

/** Debounce: ejecuta fn tras ms desde la última llamada (para búsquedas/filtros). */
function debounce(fn, ms) {
  var t = null;
  return function () {
    var self = this, args = arguments;
    if (t) clearTimeout(t);
    t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
  };
}

// Factores de precio (ajusta según tu Excel)
const CONFIG = {
  factorPiezaTuneo: 0.0015,      // precioBase * factor por pieza (Motor, Perf, Custom, Cosmetic)
  factorChasis: 0.00125,         // precioBase * factor por parte chasis
  factorEsencial: 0.00125,       // precioBase * factor por parte esencial
  factorServicio: 0.0016,        // precioBase * factor por parte servicio
  /** Base usada para calcular reparación cuando no hay modelo seleccionado (solo reparación) */
  baseReparacionSinModelo: 50000,
  /** Precio del kit de reparación (solo policías/EMS) */
  kitReparacionPrecio: 650,
  /** Webhook Discord: cada registro de reparación/tuneo se envía a este canal */
  discordWebhookUrl: 'https://discord.com/api/webhooks/1477415887605731449/bV0MEE81JWF0YEVZ5RRZv1dBtGV9g7evSqTcNVuImswTJ4eu5sFeXlQB4Ek3QvMHffW5',
  /** Webhook Discord: resultado de fichaje (salida) con horas y acumuladas */
  discordWebhookFichajes: 'https://discord.com/api/webhooks/1480963729481797693/P5VHPrywjMlEuS9xsSR0sr4PnGodDEelziPuN_fWNMS1S4p17oxMSrShFsbuUsNh5rLn',
};

// Estado (servicios: cache en memoria para evitar parse repetido; se invalida al guardar o al sincronizar)
let vehiculoActual = null;
const SERVICIOS_MAX = 1000;
let _cachedServicios = null;
function getRegistroServicios() {
  if (_cachedServicios !== null) return _cachedServicios;
  try {
    const raw = localStorage.getItem('benny_servicios');
    const arr = raw ? JSON.parse(raw) : [];
    _cachedServicios = Array.isArray(arr) ? arr : [];
    return _cachedServicios;
  } catch (e) {
    return [];
  }
}
function invalidateServiciosCache() {
  _cachedServicios = null;
}
if (typeof window !== 'undefined') window.invalidateServiciosCache = invalidateServiciosCache;
function saveRegistroServicios(arr) {
  try {
    let list = Array.isArray(arr) ? arr : [];
    if (list.length > SERVICIOS_MAX) {
      list = list.slice().sort(function (a, b) { return new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime(); }).slice(0, SERVICIOS_MAX);
    }
    _cachedServicios = list;
    localStorage.setItem('benny_servicios', JSON.stringify(list));
    if (window.backendApi && typeof window.backendApi.syncServiciosToServer === 'function') {
      window.backendApi.syncServiciosToServer(list);
    }
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  } catch (e) {
    console.warn('saveRegistroServicios', e);
  }
}

const BANDEJA_ENTRADA_STORAGE = 'benny_bandeja_entrada';
var _cachedBandejaEntrada = null;
function getBandejaEntradaAll() {
  if (_cachedBandejaEntrada !== null) return _cachedBandejaEntrada;
  try {
    var raw = localStorage.getItem(BANDEJA_ENTRADA_STORAGE);
    var data = raw ? JSON.parse(raw) : {};
    _cachedBandejaEntrada = typeof data === 'object' && data !== null ? data : {};
    return _cachedBandejaEntrada;
  } catch (e) {
    return (_cachedBandejaEntrada = {});
  }
}
function getBandejaEntrada(username) {
  const all = getBandejaEntradaAll();
  const list = all[username];
  return Array.isArray(list) ? list : [];
}
const BANDEJA_ENTRADA_MAX = 80;
function addAvisoBandejaEntrada(username, aviso) {
  if (!username) return;
  const all = getBandejaEntradaAll();
  const list = getBandejaEntrada(username);
  list.unshift({
    id: 'aviso_' + Date.now() + '_' + Math.random().toString(36).slice(2),
    fecha: new Date().toISOString(),
    completado: false,
    ...aviso,
  });
  if (list.length > BANDEJA_ENTRADA_MAX) list.length = BANDEJA_ENTRADA_MAX;
  all[username] = list;
  _cachedBandejaEntrada = all;
  try {
    localStorage.setItem(BANDEJA_ENTRADA_STORAGE, JSON.stringify(all));
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  } catch (e) {
    console.warn('addAvisoBandejaEntrada', e);
  }
}

function updateAvisoBandejaEntrada(username, avisoId, updates) {
  if (!username || !avisoId) return;
  const all = getBandejaEntradaAll();
  const list = getBandejaEntrada(username);
  const idx = list.findIndex(function (a) { return a.id === avisoId; });
  if (idx === -1) return;
  list[idx] = Object.assign({}, list[idx], updates);
  all[username] = list;
  _cachedBandejaEntrada = all;
  try {
    localStorage.setItem(BANDEJA_ENTRADA_STORAGE, JSON.stringify(all));
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  } catch (e) {
    console.warn('updateAvisoBandejaEntrada', e);
  }
}

let registroServicios = getRegistroServicios();
const CREDENTIALS_STORAGE = 'benny_remember_credentials';
const LOGIN_USUARIOS_STORAGE = 'benny_login_usuarios';
const LOGIN_USUARIOS_MAX = 10;
const PENDING_USER_UPDATES_STORAGE = 'benny_pending_user_updates';
const PREFERENCIAS_STORAGE_PREFIX = 'benny_preferencias_';

var PREFERENCIAS_DEFAULT = {
  accentColor: '#d4af37',
  fontFamily: 'default',
  fontSize: 'medium',
  theme: 'dark',
  highContrast: false,
  backgroundType: 'none',
  backgroundImage: null,
  backgroundGradient: 'warm',
  backgroundOpacity: 0.5,
  compactNav: false,
  borderRadius: 'default',
  reducedMotion: false,
  cardStyle: 'default'
};

function getPreferenciasStorageKey() {
  var session = typeof getSession === 'function' ? getSession() : null;
  return session && (session.id || session.username) ? PREFERENCIAS_STORAGE_PREFIX + (session.id || session.username) : null;
}

function getPreferenciasUsuario() {
  var key = getPreferenciasStorageKey();
  if (!key) return Object.assign({}, PREFERENCIAS_DEFAULT);
  try {
    var raw = localStorage.getItem(key);
    var parsed = raw ? JSON.parse(raw) : {};
    return Object.assign({}, PREFERENCIAS_DEFAULT, parsed);
  } catch (e) { return Object.assign({}, PREFERENCIAS_DEFAULT); }
}

function savePreferenciasUsuario(prefs) {
  var key = getPreferenciasStorageKey();
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify(prefs)); } catch (e) {}
}

function applyPreferencias(prefs) {
  if (!prefs) prefs = getPreferenciasUsuario();
  var root = document.documentElement;
  var accent = (prefs.accentColor && prefs.accentColor !== 'default') ? prefs.accentColor : '#d4af37';
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-hover', prefs.accentColor ? (prefs.accentColor === 'default' ? '#e0c04a' : accent) : '#e0c04a');
  var accentSoft = accent + '30';
  if (accent.length === 7) {
    var r = parseInt(accent.slice(1, 3), 16), g = parseInt(accent.slice(3, 5), 16), b = parseInt(accent.slice(5, 7), 16);
    accentSoft = 'rgba(' + r + ',' + g + ',' + b + ',0.18)';
  }
  root.style.setProperty('--accent-soft', accentSoft);
  var fontMap = { default: "'Plus Jakarta Sans', -apple-system, sans-serif", inter: "'Inter', sans-serif", outfit: "'Outfit', sans-serif", roboto: "'Roboto', sans-serif", system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
  root.style.setProperty('--font', fontMap[prefs.fontFamily] || fontMap.default);
  var sizeMap = { small: '0.9375rem', medium: '1rem', large: '1.0625rem' };
  root.style.setProperty('--font-size-base', sizeMap[prefs.fontSize] || sizeMap.medium);
  document.body.classList.remove('personalizacion-size-small', 'personalizacion-size-medium', 'personalizacion-size-large');
  document.body.classList.add('personalizacion-size-' + (prefs.fontSize || 'medium'));
  document.body.classList.toggle('personalizacion-compact-nav', !!prefs.compactNav);
  document.body.classList.remove('personalizacion-radius-default', 'personalizacion-radius-rounded', 'personalizacion-radius-sharp');
  document.body.classList.add('personalizacion-radius-' + (prefs.borderRadius || 'default'));
  document.body.classList.toggle('personalizacion-reduced-motion', !!prefs.reducedMotion);
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add('theme-' + (prefs.theme === 'light' ? 'light' : 'dark'));
  document.body.classList.toggle('personalizacion-high-contrast', !!prefs.highContrast);
  document.body.classList.remove('personalizacion-cards-default', 'personalizacion-cards-flat', 'personalizacion-cards-elevated');
  document.body.classList.add('personalizacion-cards-' + (prefs.cardStyle || 'default'));
  var bgWrap = document.getElementById('personalizacionBackgroundWrap');
  if (!bgWrap) {
    bgWrap = document.createElement('div');
    bgWrap.id = 'personalizacionBackgroundWrap';
    bgWrap.className = 'personalizacion-background-wrap';
    bgWrap.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(bgWrap, document.body.firstChild);
  }
  var opacity = prefs.backgroundOpacity != null ? Number(prefs.backgroundOpacity) : 0.5;
  if (opacity > 1) opacity = opacity / 100;
  bgWrap.style.opacity = (prefs.backgroundType === 'image' && prefs.backgroundImage) ? String(opacity) : '1';
  bgWrap.className = 'personalizacion-background-wrap personalizacion-bg-' + (prefs.backgroundType || 'none');
  if (prefs.backgroundType === 'image' && prefs.backgroundImage) {
    bgWrap.style.backgroundImage = 'url(' + prefs.backgroundImage + ')';
    bgWrap.style.backgroundSize = 'cover';
    bgWrap.style.backgroundPosition = 'center';
  } else if (prefs.backgroundType === 'gradient') {
    bgWrap.style.backgroundImage = '';
    var gradMap = {
      warm: 'linear-gradient(135deg, #1a0f0a 0%, #2d1810 50%, #1a1a1a 100%)',
      cool: 'linear-gradient(135deg, #0a0f1a 0%, #0d1525 50%, #1a1d22 100%)',
      ocean: 'linear-gradient(135deg, #0a1418 0%, #0d2028 40%, #1a2528 100%)',
      dark: 'linear-gradient(180deg, #0c0c0c 0%, #1a1a1a 100%)',
      minimal: 'linear-gradient(180deg, #1a1d22 0%, #252a32 100%)'
    };
    bgWrap.style.background = gradMap[prefs.backgroundGradient] || gradMap.warm;
  } else {
    bgWrap.style.backgroundImage = '';
    bgWrap.style.background = '';
  }
}

const PANTALLAS_SECUNDARIAS_IDS = ['pantallaFichajes', 'pantallaGestion', 'pantallaOrganigrama', 'pantallaRegistroClientes', 'pantallaVacantes', 'pantallaBandejaEntrada', 'pantallaResultadosCalculadora', 'pantallaTunnings', 'pantallaFichaTrabajador', 'pantallaFichaEmpleado', 'pantallaPersonalizacion', 'pantallaMaterialesRecuperados'];

const MEDIA_PENDING_STORAGE = 'benny_media_pending';
const MEDIA_APPROVED_STORAGE = 'benny_media_approved';
const MEDIA_MAX_DATAURL_MB = 4;

function getPendingMedia() {
  try {
    const raw = localStorage.getItem(MEDIA_PENDING_STORAGE);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function savePendingMedia(arr) {
  try {
    localStorage.setItem(MEDIA_PENDING_STORAGE, JSON.stringify(Array.isArray(arr) ? arr : []));
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  } catch (e) {}
}
function addPendingMedia(item) {
  const list = getPendingMedia();
  const id = 'med-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  list.unshift({ id, submittedAt: new Date().toISOString(), type: 'video', ...item });
  savePendingMedia(list);
  return id;
}
function removePendingMedia(id) {
  const list = getPendingMedia().filter(function (m) { return m.id !== id; });
  savePendingMedia(list);
}

function getApprovedMedia() {
  try {
    const raw = localStorage.getItem(MEDIA_APPROVED_STORAGE);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}
function saveApprovedMedia(arr) {
  try {
    localStorage.setItem(MEDIA_APPROVED_STORAGE, JSON.stringify(Array.isArray(arr) ? arr : []));
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  } catch (e) {}
}
function addApprovedMedia(src) {
  const list = getApprovedMedia();
  list.push({ src: src, addedAt: new Date().toISOString() });
  saveApprovedMedia(list);
}
function removeApprovedMedia(index) {
  const list = getApprovedMedia();
  list.splice(index, 1);
  saveApprovedMedia(list);
}

/** Normativas: lectura obligatoria para nuevos usuarios */
const NORMATIVAS_LEIDAS_STORAGE = 'benny_normativas_leidas';

function getNormativasLeidas(userId) {
  try {
    var raw = localStorage.getItem(NORMATIVAS_LEIDAS_STORAGE);
    var obj = raw ? JSON.parse(raw) : {};
    return obj[userId] || {};
  } catch (e) { return {}; }
}

function setNormativaPaginaLeida(userId, docId, pageIndex) {
  try {
    var obj = JSON.parse(localStorage.getItem(NORMATIVAS_LEIDAS_STORAGE) || '{}');
    if (!obj[userId]) obj[userId] = {};
    if (!obj[userId][docId]) obj[userId][docId] = [];
    while (obj[userId][docId].length <= pageIndex) obj[userId][docId].push(false);
    obj[userId][docId][pageIndex] = true;
    localStorage.setItem(NORMATIVAS_LEIDAS_STORAGE, JSON.stringify(obj));
  } catch (e) {}
}

function hasLeidoTodasNormativas(userId) {
  if (!userId || typeof getNormativasConPages !== 'function') return true;
  var docs = getNormativasConPages();
  var leidas = getNormativasLeidas(userId);
  for (var d = 0; d < docs.length; d++) {
    var doc = docs[d];
    var pages = doc.pages || [];
    var read = leidas[doc.id] || [];
    for (var p = 0; p < pages.length; p++) {
      if (!read[p]) return false;
    }
  }
  return true;
}

/** Test ABC de comprensión (normativas + instrucciones): almacén por usuario */
const NORMATIVAS_TEST_STORAGE = 'benny_normativas_test_pasado';

function hasPasadoTestNormativas(userId) {
  if (!userId) return false;
  var users = typeof getUsers === 'function' ? getUsers() : [];
  var user = users.find(function (u) { return u.id === userId; });
  if (user && typeof hasPermission === 'function' && hasPermission(user, 'exentoTestNormativas')) return true;
  try {
    var obj = JSON.parse(localStorage.getItem(NORMATIVAS_TEST_STORAGE) || '{}');
    return !!obj[userId];
  } catch (e) { return false; }
}

function setTestNormativasPasado(userId) {
  if (!userId) return;
  try {
    var obj = JSON.parse(localStorage.getItem(NORMATIVAS_TEST_STORAGE) || '{}');
    obj[userId] = true;
    localStorage.setItem(NORMATIVAS_TEST_STORAGE, JSON.stringify(obj));
  } catch (e) {}
}

/** Registro de resultados del test (para admin en Solicitudes) */
const NORMATIVAS_TEST_REGISTRO_STORAGE = 'benny_normativas_test_registro';
const NORMATIVAS_TEST_REGISTRO_MAX = 500;

function getRegistroTestNormativas() {
  try {
    var raw = localStorage.getItem(NORMATIVAS_TEST_REGISTRO_STORAGE);
    var arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function addRegistroTestNormativas(entrada) {
  try {
    var arr = getRegistroTestNormativas();
    arr.unshift(entrada);
    if (arr.length > NORMATIVAS_TEST_REGISTRO_MAX) arr.length = NORMATIVAS_TEST_REGISTRO_MAX;
    localStorage.setItem(NORMATIVAS_TEST_REGISTRO_STORAGE, JSON.stringify(arr));
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  } catch (e) {}
}

/** Banco de preguntas tipo ABC (opción correcta por índice 0, 1 o 2). Se eligen 5 al azar y se barajan opciones para cada usuario. */
var TEST_NORMATIVAS_BANCO = [
  { pregunta: 'Para poder usar los botones Reparación, Tuneo o Tuneo + Reparación en la calculadora, ¿qué debes hacer primero?', opciones: ['Leer las normativas', 'Fichar entrada', 'Introducir la matrícula'], correcta: 1 },
  { pregunta: 'Si introduces una matrícula que no está registrada, ¿qué ocurre?', opciones: ['No se puede continuar', 'Rellenas la ficha del vehículo/cliente, guardas y continúas con el servicio elegido', 'Hay que volver a la pantalla principal'], correcta: 1 },
  { pregunta: 'En los tuneos de vehículos importados, según la normativa, ¿se puede aplicar descuento?', opciones: ['Sí, el que indique el encargado', 'No, no se puede aplicar ningún descuento', 'Solo el jefe puede aplicarlo'], correcta: 1 },
  { pregunta: '¿Se pueden hacer reparaciones o tuneos gratuitos a compañeros o amigos?', opciones: ['Sí, si son del taller', 'No; se cobra siempre, aplicando descuentos si corresponden', 'Solo los fines de semana'], correcta: 1 },
  { pregunta: 'Cuando terminas de configurar el presupuesto en la calculadora, ¿qué debes hacer para registrar el servicio?', opciones: ['Cerrar la calculadora', 'Pulsar REGISTRAR TUNEO o REGISTRAR REPARACION según el tipo de servicio', 'Dejar la ficha para el encargado'], correcta: 1 },
  { pregunta: 'Según la normativa interna, ¿qué debe hacer el mecánico al finalizar un servicio?', opciones: ['Dejar las herramientas en el vehículo', 'Dirigirse al almacén, guardar materiales recuperados y registrar el estado con una foto', 'Cerrar la calculadora'], correcta: 1 },
  { pregunta: '¿Cuál es el flujo correcto en la calculadora?', opciones: ['Matrícula → Elegir servicio → Calculadora', 'Elegir servicio → Matrícula → Calculadora', 'Calculadora → Matrícula → Registrar'], correcta: 1 },
  { pregunta: 'En el taller, según normativa, ¿se puede portar colores o símbolos de bandas estando de servicio?', opciones: ['Sí, si es discreto', 'No; el taller es un espacio neutral', 'Solo fuera del local'], correcta: 1 },
  { pregunta: 'El indicador "No fichado" / "Fichado" en la barra superior sirve para:', opciones: ['Ver el estado; hay que ir a Fichajes para fichar', 'Fichar entrada o salida con un clic sin ir a la pestaña Fichajes', 'Cambiar de usuario'], correcta: 1 },
  { pregunta: 'Si el servicio es solo Tuneo, ¿qué botón debes pulsar al final?', opciones: ['REGISTRAR REPARACION', 'REGISTRAR TUNEO', 'HOME'], correcta: 1 }
];

/** Test actual mostrado (5 preguntas aleatorias con opciones barajadas). Se rellena al mostrar el test. */
var _normativasTestActual = [];

function shuffleArray(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/** Devuelve 5 preguntas aleatorias del banco, cada una con sus opciones barajadas y correcta actualizado. */
function getTestNormativasAleatorio() {
  var banco = (typeof TEST_NORMATIVAS_BANCO !== 'undefined' && Array.isArray(TEST_NORMATIVAS_BANCO)) ? TEST_NORMATIVAS_BANCO : [];
  var indices = banco.map(function (_, i) { return i; });
  shuffleArray(indices);
  var numPreguntas = Math.min(5, banco.length);
  var seleccion = [];
  for (var s = 0; s < numPreguntas; s++) {
    var q = banco[indices[s]];
    var opcionesConIdx = q.opciones.map(function (txt, idx) { return { txt: txt, idx: idx }; });
    var barajadas = shuffleArray(opcionesConIdx);
    var nuevaCorrecta = barajadas.findIndex(function (o) { return o.idx === q.correcta; });
    seleccion.push({
      pregunta: q.pregunta,
      opciones: barajadas.map(function (o) { return o.txt; }),
      correcta: nuevaCorrecta
    });
  }
  return seleccion;
}

/** Fuentes para el bucle de contenido: primero aprobadas por admin, luego archivos de CONTENT */
function getContentLoopSources() {
  const approved = getApprovedMedia();
  const files = typeof CONTENT_LOOP_FILES !== 'undefined' && Array.isArray(CONTENT_LOOP_FILES) ? CONTENT_LOOP_FILES : ['video.mp4'];
  const list = [];
  approved.forEach(function (a) { if (a && a.src) list.push({ type: 'url', src: a.src }); });
  files.forEach(function (f) { if (f && /\.(mp4|webm|mov|ogg)$/i.test(f)) list.push({ type: 'path', path: f }); });
  return list.length ? list : [{ type: 'path', path: 'video.mp4' }];
}

/** Debounce: ejecuta fn tras ms de inactividad; devuelve función cancelable */
function debounce(fn, ms) {
  let t = null;
  return function debounced() {
    if (t) clearTimeout(t);
    const args = arguments;
    const self = this;
    t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
  };
}

function cerrarTodasPantallasSecundarias() {
  const appBody = document.getElementById('appBody');
  const principal = document.getElementById('pantallaPrincipal');
  const appContent = document.getElementById('appContent');
  PANTALLAS_SECUNDARIAS_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (appBody) appBody.style.display = 'flex';
  if (principal) principal.style.display = 'block';
  if (appContent) appContent.classList.remove('pantalla-secundaria-visible', 'ficha-empleado-abierta', 'gestion-visible');
  actualizarLedFichaje();
  if (typeof paso !== 'undefined') {
    if (paso === 'calculadora' && matriculaActual) renderStatsVehiculo(matriculaActual);
    else if (paso === 'inicio') requestAnimationFrame(function () { renderStatsVehiculo(''); });
  }
}

function ocultarAppBodyMostrarSecundaria(pantallaId) {
  const appBody = document.getElementById('appBody');
  const pantalla = document.getElementById(pantallaId);
  const appContent = document.getElementById('appContent');
  if (appBody) appBody.style.display = 'none';
  if (pantalla) pantalla.style.display = 'flex';
  if (appContent) {
    appContent.classList.add('pantalla-secundaria-visible');
    if (pantallaId === 'pantallaGestion') appContent.classList.add('gestion-visible');
  }
}

function getPendingUserUpdates() {
  try {
    const raw = localStorage.getItem(PENDING_USER_UPDATES_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function savePendingUserUpdates(arr) {
  localStorage.setItem(PENDING_USER_UPDATES_STORAGE, JSON.stringify(arr));
}
function addPendingUserUpdate(item) {
  const list = getPendingUserUpdates();
  list.push({ ...item, id: 'pend-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) });
  savePendingUserUpdates(list);
}
function removePendingUserUpdate(id) {
  const list = getPendingUserUpdates().filter(p => p.id !== id);
  savePendingUserUpdates(list);
}
let tipoServicio = null;   // 'reparacion' | 'tuneo' | 'tuneoReparacion'
let matriculaActual = '';
var _plateStyleIndex = 0;

// Elementos DOM (matricula = paso 1; matriculaCalc = paso 2 readonly)
const el = {
  modelo: document.getElementById('modelo'),
  categoria: document.getElementById('categoria'),
  nombreIC: document.getElementById('nombreIC'),
  nombreModelo: document.getElementById('nombreModelo'),
  fullTuning: document.getElementById('fullTuning'),
  fullTuningPrecio: document.getElementById('fullTuningPrecio'),
  tuneMotor: document.getElementById('tuneMotor'),
  reparacion: document.getElementById('reparacion'),
  partesChasis: document.getElementById('partesChasis'),
  partesEsenciales: document.getElementById('partesEsenciales'),
  precioReparacion: document.getElementById('precioReparacion'),
  mecanico: document.getElementById('mecanico'),
  matricula: document.getElementById('matricula'),
  matriculaCalc: document.getElementById('matriculaCalc'),
  matriculaCalcDisplay: document.getElementById('matriculaCalcDisplay'),
  matriculaCalcModelo: document.getElementById('matriculaCalcModelo'),
  presupuestoMotor: document.getElementById('presupuestoMotor'),
  presupuestoKits: document.getElementById('presupuestoKits'),
  presupuestoPerformance: document.getElementById('presupuestoPerformance'),
  presupuestoCustom: document.getElementById('presupuestoCustom'),
  presupuestoCosmetic: document.getElementById('presupuestoCosmetic'),
  precioTotal: document.getElementById('precioTotal'),
  descuentoPorcentaje: document.getElementById('descuentoPorcentaje'),
  negocios: document.getElementById('negocios'),
  plantillaTuneos: document.getElementById('plantillaTuneos'),
  plantillaReparaciones: document.getElementById('plantillaReparaciones'),
  btnRegistrarTuneo: document.getElementById('btnRegistrarTuneo'),
  btnRegistrarReparacion: document.getElementById('btnRegistrarReparacion'),
  btnReset: document.getElementById('btnReset'),
  btnLimpiarRegistro: document.getElementById('btnLimpiarRegistro'),
  modalRegistro: document.getElementById('modalRegistro'),
  modalClose: document.getElementById('modalClose'),
  listaServicios: document.getElementById('listaServicios'),
  imgVehiculo: document.getElementById('imgVehiculo'),
  vehiculoImagenPlaceholder: document.getElementById('vehiculoImagenPlaceholder'),
};

// ========== AUTENTICACIÓN Y ARRANQUE ==========
function aplicarPermisos(user) {
  document.querySelectorAll('[data-permiso]').forEach(el => {
    const perm = el.getAttribute('data-permiso');
    if (!hasPermission(user, perm)) el.classList.add('sin-permiso');
    else el.classList.remove('sin-permiso');
  });
  const btnFichajes = document.getElementById('btnFichajes');
  if (btnFichajes) btnFichajes.style.display = user ? '' : 'none';
  const btnAdmin = document.getElementById('btnAdminPanel');
  if (btnAdmin) btnAdmin.style.display = user ? '' : 'none';
  const btnSubirVideo = document.getElementById('btnSubirVideo');
  if (btnSubirVideo) btnSubirVideo.style.display = user ? '' : 'none';
  const btnResultados = document.getElementById('btnResultadosCalculadora');
  if (btnResultados) btnResultados.style.display = user ? '' : 'none';
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.style.display = user ? '' : 'none';
  const btnBandejaEntrada = document.getElementById('btnBandejaEntrada');
  const esAdminBandeja = user && hasPermission(user, 'gestionarUsuarios');
  if (btnBandejaEntrada) btnBandejaEntrada.style.display = user && !esAdminBandeja ? '' : 'none';
  var puedeGestionarClientes = hasPermission(user, 'gestionarRegistroClientes');
  document.querySelectorAll('.registro-clientes-tab[data-tab="bbdd"], .registro-clientes-tab[data-tab="vetados"], .registro-clientes-tab[data-tab="pendientes"]').forEach(function (t) {
    t.style.display = puedeGestionarClientes ? '' : 'none';
  });
  var esAdmin = hasPermission(user, 'gestionarUsuarios');
  document.querySelectorAll('.gestion-card-nav').forEach(function (card) {
    var nav = card.getAttribute('data-gestion-nav');
    if (nav === 'ficha' || nav === 'historial') card.style.display = esAdmin ? 'none' : '';
    else if (nav === 'vacantes') card.style.display = esAdmin ? '' : 'none';
    else card.style.display = '';
  });
  const cambiarUsuarioWrap = document.getElementById('cambiarUsuarioWrap');
  if (cambiarUsuarioWrap) cambiarUsuarioWrap.style.display = hasPermission(user, 'gestionarUsuarios') ? '' : 'none';
  actualizarDescuentoSuperior();
}

function actualizarDescuentoSuperior() {
  const wrap = document.getElementById('wrapDescuentoSuperior');
  const texto = document.getElementById('descuentoSuperiorTexto');
  const editable = document.getElementById('descuentoSuperiorEditable');
  if (!wrap || !texto || !editable) return;
  const puedeEditar = hasPermission(getSession(), 'gestionarUsuarios');
  const desc = (el.descuentoPorcentaje && el.descuentoPorcentaje.value) || '0';
  const neg = (el.negocios && el.negocios.value) || 'N/A';
  texto.textContent = desc + '% · ' + (neg || 'N/A');
  texto.style.display = puedeEditar ? 'none' : '';
  editable.style.display = puedeEditar ? 'flex' : 'none';
}

function actualizarVisibilidadPlacaServicio() {
  const wrap = document.getElementById('wrapPlacaServicio');
  const placa = document.getElementById('placaServicio');
  if (!wrap || !placa) return;
  var mat = (matriculaActual || (el.matriculaCalc && el.matriculaCalc.value) || '').trim();
  var esPolicia = false;
  if (mat && typeof getClienteByMatricula === 'function') {
    var cliente = getClienteByMatricula(mat);
    if (cliente) {
      var pp = (cliente.placaPolicial || cliente.placaServicio || '').toString().trim();
      esPolicia = pp !== '' && pp !== '-';
      if (esPolicia) placa.value = pp;
    }
  }
  if (!esPolicia) placa.value = '';
  wrap.style.display = esPolicia ? '' : 'none';
}

function actualizarVisibilidadRegistroServicios() {
  actualizarVisibilidadPlacaServicio();
}

var calendarHeaderInterval = null;
function actualizarCalendarioHeader() {
  const dateLabel = document.getElementById('calendarDateLabel');
  const timeLabel = document.getElementById('calendarToday');
  if (!dateLabel && !timeLabel) return;
  const now = new Date();
  if (dateLabel) {
    dateLabel.textContent = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (timeLabel) {
    timeLabel.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  if (!calendarHeaderInterval) {
    calendarHeaderInterval = setInterval(function() {
      const wrap = document.getElementById('headerCalendarWrap');
      if (!wrap || wrap.style.display === 'none') return;
      const n = new Date();
      const dl = document.getElementById('calendarDateLabel');
      const tl = document.getElementById('calendarToday');
      if (dl) dl.textContent = n.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
      if (tl) tl.textContent = n.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }, 60000);
  }
}

function _normalizaTipo(tipo) {
  const t = (tipo || '').toUpperCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return t;
}

/** Estadísticas generales del taller (todos los clientes que han pasado por el taller) */
function getStatsGeneralesTaller() {
  const servicios = getRegistroServicios();
  const reparaciones = servicios.filter(s => _normalizaTipo(s.tipo) === 'REPARACION' || (s.tipo || '').toUpperCase().indexOf('REPARAC') !== -1);
  const tuneos = servicios.filter(s => _normalizaTipo(s.tipo) === 'TUNEO' || (s.tipo || '').toUpperCase().indexOf('TUNEO') !== -1);
  const dinero = servicios.reduce((sum, s) => sum + (Number(s.importe) || 0), 0);
  const totalPiezas = reparaciones.reduce((sum, s) => sum + (Number(s.partesChasis) || 0) + (Number(s.partesEsenciales) || 0) + (Number(s.partesServicio) || 0), 0);
  const byMecanico = {};
  reparaciones.forEach(s => {
    const m = s.empleado || s.userId || '—';
    byMecanico[m] = (byMecanico[m] || 0) + 1;
  });
  let mecanicoTop = '—';
  if (Object.keys(byMecanico).length) {
    const topKey = Object.entries(byMecanico).sort((a, b) => b[1] - a[1])[0][0];
    const users = typeof getUsers === 'function' ? getUsers() : [];
    const u = users.find(x => (x.username || x.id) === topKey);
    mecanicoTop = u ? (u.nombre || u.username || topKey) : topKey;
  }
  return {
    totalReparaciones: reparaciones.length,
    mecanicoTop,
    dineroGenerado: dinero,
    totalPiezas,
    totalTuneos: tuneos.length,
  };
}

/** Estadísticas de un vehículo por matrícula (solo esa matrícula) */
function getStatsPorMatricula(matricula) {
  const mat = (matricula || '').trim().toUpperCase();
  if (!mat) return { totalReparaciones: 0, mecanicoTop: '—', dineroGenerado: 0, totalPiezas: 0, totalTuneos: 0 };
  const raw = getRegistroServicios();
  const servicios = raw.filter(s => (s.matricula || '').trim().toUpperCase() === mat);
  const reparaciones = servicios.filter(s => _normalizaTipo(s.tipo) === 'REPARACION' || (s.tipo || '').toUpperCase().indexOf('REPARAC') !== -1);
  const tuneos = servicios.filter(s => _normalizaTipo(s.tipo) === 'TUNEO' || (s.tipo || '').toUpperCase().indexOf('TUNEO') !== -1);
  const dinero = servicios.reduce((sum, s) => sum + (Number(s.importe) || 0), 0);
  const totalPiezas = reparaciones.reduce((sum, s) => sum + (Number(s.partesChasis) || 0) + (Number(s.partesEsenciales) || 0) + (Number(s.partesServicio) || 0), 0);
  const byMecanico = {};
  reparaciones.forEach(s => {
    const m = s.empleado || s.userId || '—';
    byMecanico[m] = (byMecanico[m] || 0) + 1;
  });
  let mecanicoTop = '—';
  if (Object.keys(byMecanico).length) {
    const topKey = Object.entries(byMecanico).sort((a, b) => b[1] - a[1])[0][0];
    const users = typeof getUsers === 'function' ? getUsers() : [];
    const u = users.find(x => (x.username || x.id) === topKey);
    mecanicoTop = u ? (u.nombre || u.username || topKey) : topKey;
  }
  return {
    totalReparaciones: reparaciones.length,
    mecanicoTop,
    dineroGenerado: dinero,
    totalPiezas,
    totalTuneos: tuneos.length,
  };
}

var _cacheStatsEl = null;
function _getStatsEl() {
  if (_cacheStatsEl) return _cacheStatsEl;
  _cacheStatsEl = {
    rep: document.getElementById('statTotalReparaciones'),
    mec: document.getElementById('statMecanicoTop'),
    din: document.getElementById('statDineroGenerado'),
    pie: document.getElementById('statPiezasAplicadas'),
    tun: document.getElementById('statTuneosTotal'),
    titulo: document.getElementById('asideStatsWrap'),
  };
  return _cacheStatsEl;
}
function renderStatsVehiculo(matricula) {
  const s = (matricula && (matricula || '').trim()) ? getStatsPorMatricula(matricula) : getStatsGeneralesTaller();
  const c = _getStatsEl();
  if (c.rep) c.rep.textContent = s.totalReparaciones;
  if (c.mec) c.mec.textContent = s.mecanicoTop;
  if (c.din) c.din.textContent = s.dineroGenerado > 0 ? '$' + s.dineroGenerado.toLocaleString('es-ES') : '—';
  if (c.pie) c.pie.textContent = s.totalPiezas;
  if (c.tun) c.tun.textContent = s.totalTuneos;
  if (c.titulo) {
    const h3 = c.titulo.querySelector('.aside-stats-title');
    if (h3) h3.textContent = (matricula && (matricula || '').trim()) ? 'Estadísticas del vehículo' : 'Estadísticas del taller';
  }
}

/** Servicios para el historial del indicador. Sin matrícula = todo el taller. */
function getServiciosParaHistorialIndicador(matricula, statType) {
  const mat = (matricula || '').trim().toUpperCase();
  const raw = getRegistroServicios();
  const servicios = mat ? raw.filter(s => (s.matricula || '').trim().toUpperCase() === mat) : raw;
  const esReparacion = s => _normalizaTipo(s.tipo) === 'REPARACION' || (s.tipo || '').toUpperCase().indexOf('REPARAC') !== -1;
  const esTuneo = s => _normalizaTipo(s.tipo) === 'TUNEO' || (s.tipo || '').toUpperCase().indexOf('TUNEO') !== -1;
  switch (statType) {
    case 'reparaciones': return servicios.filter(esReparacion).slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    case 'tuneos': return servicios.filter(esTuneo).slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    case 'dinero': return servicios.slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    case 'piezas': return servicios.filter(esReparacion).slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    case 'mecanico': return servicios.filter(esReparacion).slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    default: return servicios.slice().sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  }
}

function abrirModalHistorialIndicador(statType) {
  const matricula = (matriculaActual || (el.matriculaCalc && el.matriculaCalc.value) || (el.matricula && el.matricula.value) || '').trim();
  const titulos = { reparaciones: 'Histórico: Reparaciones totales', mecanico: 'Histórico: Reparaciones (mecánico)', dinero: 'Histórico: Facturación', piezas: 'Histórico: Piezas aplicadas', tuneos: 'Histórico: Tuneos realizados' };
  const modal = document.getElementById('modalHistorialIndicador');
  const titulo = document.getElementById('modalHistorialIndicadorTitulo');
  const matriculaEl = document.getElementById('modalHistorialIndicadorMatricula');
  const lista = document.getElementById('modalHistorialIndicadorLista');
  if (!modal || !lista) return;
  titulo.textContent = titulos[statType] || 'Histórico';
  matriculaEl.textContent = matricula ? 'Matrícula: ' + matricula : 'Estadísticas del taller (todos los registros)';
  const items = getServiciosParaHistorialIndicador(matricula, statType);
  if (items.length === 0) {
    lista.innerHTML = '<li class="no-items">No hay registros para este indicador.</li>';
  } else {
    lista.innerHTML = items.map(s => {
      const fecha = s.fecha ? new Date(s.fecha).toLocaleString('es-ES') : '—';
      const tipo = (s.tipo || '—').toString();
      const importe = s.importe != null ? s.importe.toLocaleString('es-ES') + ' €' : '—';
      const empleado = s.empleado || s.userId || '—';
      const piezas = statType === 'piezas' ? ' Chasis: ' + (Number(s.partesChasis) || 0) + ', Esenciales: ' + (Number(s.partesEsenciales) || 0) : '';
      return '<li><strong>' + escapeHtml(tipo) + '</strong> · ' + escapeHtml(empleado) + ' · ' + importe + piezas + '<br><small>' + escapeHtml(fecha) + '</small></li>';
    }).join('');
  }
  modal.classList.add('active');
}

function vincularIndicadoresHistorial() {
  document.querySelectorAll('.stat-mini-card-clickable').forEach(card => {
    if (card.dataset.historialBound) return;
    card.dataset.historialBound = '1';
    card.addEventListener('click', function() {
      const stat = this.dataset.stat;
      if (stat) abrirModalHistorialIndicador(stat);
    });
    card.style.cursor = 'pointer';
  });
  const modal = document.getElementById('modalHistorialIndicador');
  const closeBtn = document.getElementById('modalHistorialIndicadorClose');
  const backdrop = document.getElementById('modalHistorialIndicadorBackdrop');
  if (closeBtn && !closeBtn.dataset.historialBound) {
    closeBtn.dataset.historialBound = '1';
    closeBtn.addEventListener('click', () => modal && modal.classList.remove('active'));
  }
  if (backdrop && !backdrop.dataset.historialBound) {
    backdrop.dataset.historialBound = '1';
    backdrop.addEventListener('click', () => modal && modal.classList.remove('active'));
  }
}

function renderUltimasReparaciones() {
  const list = document.getElementById('ultimasReparacionesList');
  if (!list) return;
  const todos = getRegistroServicios()
    .slice()
    .sort(function (a, b) { return new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime(); });
  const servicios = todos.slice(0, 50);
  const users = typeof getUsers === 'function' ? getUsers() : [];
  function nombreEmpleado(s) {
    const uid = (s.empleado || s.userId || '').toString().trim();
    if (!uid) return '—';
    const u = users.find(function (x) { return (x.username || x.id || '') === uid; });
    return u ? (u.nombre || u.username || uid) : uid;
  }
  if (servicios.length === 0) {
    list.innerHTML = '<li class="no-ultimas">No hay reparaciones ni tuneos recientes.</li>';
    return;
  }
  list.innerHTML = servicios.map((s, i) => {
    const fechaHora = s.fecha ? new Date(s.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const placaHtml = typeof buildMatriculaPlateHtml === 'function' ? buildMatriculaPlateHtml(s.matricula || '—') : '<span>' + escapeHtml((s.matricula || '—').toString()) + '</span>';
    const valorFactura = s.importe != null ? s.importe.toLocaleString('es-ES') + ' €' : '—';
    const empleado = nombreEmpleado(s);
    return '<li class="ultimas-rep-item-clickable" data-ultimas-index="' + i + '" role="button" tabindex="0" title="Clic para ver resumen">' +
      '<span class="ultimas-rep-placa">' + placaHtml + '</span>' +
      '<span class="ultimas-rep-valor">' + escapeHtml(valorFactura) + '</span>' +
      '<span class="ultimas-rep-fecha">' + escapeHtml(fechaHora) + '</span>' +
      '<span class="ultimas-rep-empleado">' + escapeHtml(empleado) + '</span>' +
      '</li>';
  }).join('');
  if (!list.dataset.ultimasBound) {
    list.dataset.ultimasBound = '1';
    list.addEventListener('click', function (e) {
      var li = e.target && e.target.closest('.ultimas-rep-item-clickable');
      if (!li) return;
      var idx = parseInt(li.getAttribute('data-ultimas-index'), 10);
      if (isNaN(idx)) return;
      var ordenados = getRegistroServicios().slice().sort(function (a, b) { return new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime(); });
      if (ordenados[idx]) mostrarResumenReparacion(ordenados[idx]);
    });
    list.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var li = e.target && e.target.closest('.ultimas-rep-item-clickable');
      if (!li) return;
      e.preventDefault();
      li.click();
    });
  }
}

function mostrarResumenReparacion(s) {
  var modal = document.getElementById('modalResumenReparacion');
  var titulo = document.getElementById('modalResumenReparacionTitulo');
  var body = document.getElementById('modalResumenReparacionBody');
  var btnClose = document.getElementById('modalResumenReparacionClose');
  var backdrop = document.getElementById('modalResumenReparacionBackdrop');
  if (!modal || !body) return;
  var tipo = (s.tipo || '').toUpperCase();
  var tipoLabel = tipo.indexOf('REPARAC') !== -1 ? 'Reparación' : tipo.indexOf('TUNEO') !== -1 ? 'Tuneo' : (s.tipo || '—');
  if (titulo) titulo.textContent = 'Resumen: ' + tipoLabel;
  var fecha = s.fecha ? new Date(s.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  var rows = [
    { label: 'Matrícula', value: (s.matricula || '—').toString() },
    { label: 'Tipo', value: tipoLabel },
    { label: 'Fecha', value: fecha },
    { label: 'Modelo', value: (s.modelo || '—').toString() },
    { label: 'Modificación', value: (s.modificacion || '—').toString() },
    { label: 'Importe', value: s.importe != null ? s.importe.toLocaleString('es-ES') + ' €' : '—' },
    { label: 'Empleado', value: (s.empleado || s.userId || '—').toString() },
    { label: 'Convenio', value: (s.convenio || '—').toString() }
  ];
  if (s.descuento != null && s.descuento > 0) rows.push({ label: 'Descuento', value: s.descuento + '%' });
  if (s.partesChasis != null || s.partesEsenciales != null || s.kitReparacion) {
    if (s.kitReparacion) rows.push({ label: 'Kit reparación', value: 'Sí' });
    if (s.partesChasis != null) {
      var valorChasis = String(s.partesChasis);
      if (Array.isArray(s.piezasChasisDesglose) && s.piezasChasisDesglose.length) {
        var nombresChasis = typeof TIPOS_PIEZAS_CHASIS !== 'undefined' ? TIPOS_PIEZAS_CHASIS : [];
        var countsCh = {};
        s.piezasChasisDesglose.forEach(function (id) { countsCh[id] = (countsCh[id] || 0) + 1; });
        valorChasis = Object.keys(countsCh).map(function (id) {
          var n = nombresChasis.find(function (t) { return t.id === id; });
          return (countsCh[id] || 0) + ' ' + (n ? n.nombre : id);
        }).join(', ');
      }
      rows.push({ label: 'Partes chasis', value: valorChasis });
    }
    if (s.partesEsenciales != null) {
      var valorEsenciales = String(s.partesEsenciales);
      if (Array.isArray(s.piezasEsencialesDesglose) && s.piezasEsencialesDesglose.length) {
        var nombresEs = typeof TIPOS_PIEZAS_ESENCIALES !== 'undefined' ? TIPOS_PIEZAS_ESENCIALES : [];
        var countsEs = {};
        s.piezasEsencialesDesglose.forEach(function (id) { countsEs[id] = (countsEs[id] || 0) + 1; });
        valorEsenciales = Object.keys(countsEs).map(function (id) {
          var n = nombresEs.find(function (t) { return t.id === id; });
          return (countsEs[id] || 0) + ' ' + (n ? n.nombre : id);
        }).join(', ');
      }
      rows.push({ label: 'Partes esenciales', value: valorEsenciales });
    }
  }
  body.innerHTML = '<div class="resumen-reparacion-filas">' + rows.map(function (r) {
    return '<div class="resumen-reparacion-row"><span class="resumen-reparacion-label">' + escapeHtml(r.label) + '</span><span class="resumen-reparacion-value">' + escapeHtml(r.value) + '</span></div>';
  }).join('') + '</div>';
  var onEscape = function (e) {
    if (e.key === 'Escape') cerrarResumen();
  };
  function cerrarResumen() {
    modal.style.display = 'none';
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', onEscape);
  }
  if (backdrop && !backdrop.dataset.resumenBound) {
    backdrop.dataset.resumenBound = '1';
    backdrop.addEventListener('click', cerrarResumen);
  }
  if (btnClose) btnClose.onclick = cerrarResumen;
  document.addEventListener('keydown', onEscape);
  modal.style.display = 'flex';
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

async function manejarLogin(e) {
  e.preventDefault();
  const userInp = document.getElementById('loginUsername');
  const passInp = document.getElementById('loginPassword');
  if (!userInp || !passInp) return;
  const username = (userInp.value || '').trim();
  const password = passInp.value || '';
  const recordar = document.getElementById('loginRecordar')?.checked;
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.textContent = '';
  const user = await login(username, password);
  if (!user) {
    if (errEl) errEl.textContent = 'Usuario o contraseña incorrectos.';
    return;
  }
  if (recordar) {
    try {
      localStorage.setItem(CREDENTIALS_STORAGE, JSON.stringify({ username, password }));
    } catch (err) {}
  } else {
    try {
      localStorage.removeItem(CREDENTIALS_STORAGE);
    } catch (err) {}
  }
  try {
    let list = JSON.parse(localStorage.getItem(LOGIN_USUARIOS_STORAGE) || '[]');
    list = list.filter(x => x.username !== username);
    list.unshift({ username, password: recordar ? password : '' });
    list = list.slice(0, LOGIN_USUARIOS_MAX);
    localStorage.setItem(LOGIN_USUARIOS_STORAGE, JSON.stringify(list));
  } catch (err) {}
  if (user.cambiarPasswordObligatorio) {
    var ls = document.getElementById('loginScreen');
    var cs = document.getElementById('cambioPasswordScreen');
    var cf = document.getElementById('cambioPasswordForm');
    if (ls) ls.style.display = 'none';
    if (cs) cs.style.display = 'flex';
    if (cf) cf.addEventListener('submit', manejarCambioPassword);
    return;
  }
  if (!hasLeidoTodasNormativas(user.id) || !hasPasadoTestNormativas(user.id)) {
    var ls2 = document.getElementById('loginScreen');
    var ns = document.getElementById('normativasScreen');
    var app = document.getElementById('appContent');
    if (ls2) ls2.style.display = 'none';
    if (ns) ns.style.display = 'flex';
    if (app) app.style.display = 'none';
    if (typeof mostrarChatbotWrap === 'function') mostrarChatbotWrap(false);
    setSession(user);
    if (typeof initNormativasPantalla === 'function') initNormativasPantalla(user.id, true);
    return;
  }
  entrarApp(user);
}

async function manejarCambioPassword(e) {
  e.preventDefault();
  const nuevaInp = document.getElementById('nuevaPassword');
  const repetirInp = document.getElementById('repetirPassword');
  if (!nuevaInp || !repetirInp) return;
  const nueva = (nuevaInp.value || '').trim();
  const repetir = (repetirInp.value || '').trim();
  const errEl = document.getElementById('cambioPasswordError');
  if (errEl) errEl.textContent = '';
  if (nueva.length < 4) {
    if (errEl) errEl.textContent = 'La contraseña debe tener al menos 4 caracteres.';
    return;
  }
  if (nueva !== repetir) {
    if (errEl) errEl.textContent = 'Las contraseñas no coinciden.';
    return;
  }
  const session = getSession();
  const res = await cambiarPassword(session.id, nueva);
  if (res.error) {
    if (errEl) errEl.textContent = res.error;
    return;
  }
  const users = getUsers();
  const userActualizado = users.find(u => u.id === session.id);
  if (userActualizado) setSession(userActualizado);
  const cambioScreen = document.getElementById('cambioPasswordScreen');
  const cambioForm = document.getElementById('cambioPasswordForm');
  if (cambioScreen) cambioScreen.style.display = 'none';
  if (cambioForm) { cambioForm.reset(); cambioForm.removeEventListener('submit', manejarCambioPassword); }
  const currentSession = getSession();
  if (!hasLeidoTodasNormativas(currentSession.id) || !hasPasadoTestNormativas(currentSession.id)) {
  document.getElementById('normativasScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
  if (typeof mostrarChatbotWrap === 'function') mostrarChatbotWrap(false);
  initNormativasPantalla(currentSession.id, true);
  return;
}
  entrarApp(getSession());
}

function entrarApp(user) {
  const u = user || getSession();
  var ls = document.getElementById('loginScreen');
  var cs = document.getElementById('cambioPasswordScreen');
  var app = document.getElementById('appContent');
  if (ls) ls.style.display = 'none';
  if (cs) cs.style.display = 'none';
  if (app) app.style.display = 'block';
  mostrarChatbotWrap(true);
  if (typeof vincularChatbot === 'function') vincularChatbot();
  const centerName = document.getElementById('headerUserNameText');
  if (centerName) centerName.textContent = (u && (u.nombre || u.username)) || '';
  if (u) aplicarPermisos(u);
  applyPreferencias(getPreferenciasUsuario());
  el.mecanico.value = u.nombre || u.username;
  init();
  vincularAdmin();
  vincularOrganigrama();
  vincularFichajes();
  actualizarLedFichaje();
}

function actualizarLedFichaje() {
  const wrap = document.getElementById('ledFichajeWrap');
  const bulb = document.getElementById('ledFichajeBulb');
  const text = document.getElementById('ledFichajeText');
  if (!wrap || !bulb || !text) return;
  const session = getSession();
  const fichado = session && typeof hasEntradaAbierta === 'function' && hasEntradaAbierta(session.username);
  wrap.classList.toggle('led-fichado', !!fichado);
  wrap.classList.toggle('led-no-fichado', !fichado);
  bulb.classList.toggle('led-on', !!fichado);
  bulb.classList.toggle('led-off', !fichado);
  text.textContent = fichado ? 'Fichado' : 'No fichado';
  wrap.setAttribute('title', fichado ? 'Clic para fichar salida' : 'Clic para fichar entrada');
  actualizarBotonesTipoServicioPorFichaje();
}

/** Fichaje obligatorio: deshabilita Reparación / Tuneo / Tuneo+Rep si el usuario no ha fichado entrada */
function actualizarBotonesTipoServicioPorFichaje() {
  const session = getSession();
  const fichado = session && typeof hasEntradaAbierta === 'function' && hasEntradaAbierta(session.username);
  const btns = [
    document.getElementById('btnTipoReparacion'),
    document.getElementById('btnTipoTuneo'),
    document.getElementById('btnTipoTuneoReparacion'),
  ];
  const msg = 'Debes fichar entrada para usar la calculadora. Ve a Fichajes y pulsa «Fichar entrada».';
  btns.forEach(function (btn) {
    if (!btn) return;
    btn.disabled = !fichado;
    btn.setAttribute('title', fichado ? '' : msg);
    btn.classList.toggle('btn-deshabilitado-sin-fichaje', !fichado);
  });
}

function manejarLogout() {
  var session = getSession();
  if (session && typeof hasEntradaAbierta === 'function' && hasEntradaAbierta(session.username)) {
    if (typeof limpiarEntradasAbiertasAntiguas === 'function') limpiarEntradasAbiertasAntiguas();
    var cerrado = typeof cerrarUltimoFichaje === 'function' ? cerrarUltimoFichaje(session.username, new Date().toISOString()) : null;
    if (cerrado && typeof enviarRegistroFichajeADiscord === 'function') enviarRegistroFichajeADiscord(cerrado, session);
  }
  logout();
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
  document.getElementById('cambioPasswordScreen').style.display = 'none';
  if (typeof mostrarChatbotWrap === 'function') mostrarChatbotWrap(false);
  rellenarLoginUsuariosRecientes();
  const saved = (() => { try { return JSON.parse(localStorage.getItem(CREDENTIALS_STORAGE) || 'null'); } catch { return null; } })();
  if (!saved) {
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  }
  document.getElementById('loginError').textContent = '';
}

function aplicarVisibilidadHintLogin() {
  // Hint de credenciales eliminado; se usa el enlace "¿Olvidaste las credenciales?"
}

function getLoginUsuarios() {
  try {
    return JSON.parse(localStorage.getItem(LOGIN_USUARIOS_STORAGE) || '[]');
  } catch {
    return [];
  }
}

function cargarCredencialesGuardadas() {
  try {
    const raw = localStorage.getItem(CREDENTIALS_STORAGE);
    if (!raw) return;
    const { username, password } = JSON.parse(raw);
    const u = document.getElementById('loginUsername');
    const p = document.getElementById('loginPassword');
    const cb = document.getElementById('loginRecordar');
    if (u && username) u.value = username;
    if (p && password) p.value = password;
    if (cb) cb.checked = true;
  } catch (err) {}
}

function rellenarLoginUsuariosRecientes() {
  const sel = document.getElementById('loginUsuariosRecientes');
  if (!sel) return;
  const list = getLoginUsuarios();
  sel.innerHTML = '<option value="">— Elegir usuario —</option>';
  list.forEach((item, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = item.username;
    sel.appendChild(opt);
  });
}

function vincularLoginUsuariosRecientes() {
  const sel = document.getElementById('loginUsuariosRecientes');
  if (!sel) return;
  sel.addEventListener('change', function() {
    const idx = this.value;
    if (idx === '') return;
    const list = getLoginUsuarios();
    const item = list[parseInt(idx, 10)];
    if (!item) return;
    const u = document.getElementById('loginUsername');
    const p = document.getElementById('loginPassword');
    if (u) u.value = item.username || '';
    if (p) p.value = item.password || '';
  });
}

function arranqueAuth() {
  function continuar() {
    var el = document.getElementById('loginConectando');
    if (el) el.style.display = 'none';
    arranqueAuthContinuar();
  }
  function trasBackend() {
    if (window.backendApi && window.backendApi.getStoredApiUrl()) {
      var el = document.getElementById('loginConectando');
      if (el) el.style.display = 'block';
      var done = false;
      function seguir() { if (!done) { done = true; continuar(); } }
      var timeoutId = setTimeout(seguir, 15000);
      window.backendApi.init().then(function () { clearTimeout(timeoutId); seguir(); }).catch(function () { clearTimeout(timeoutId); seguir(); });
    } else {
      continuar();
    }
  }
  if (typeof ensureSeedUsers === 'function') {
    ensureSeedUsers().then(trasBackend).catch(function () { trasBackend(); });
  } else {
    trasBackend();
  }
}

function arranqueAuthContinuar() {
  const session = getSession();
  aplicarVisibilidadHintLogin();
  if (session) {
    var loginScreen = document.getElementById('loginScreen');
    var cambioScreen = document.getElementById('cambioPasswordScreen');
    var cambioForm = document.getElementById('cambioPasswordForm');
    var appContent = document.getElementById('appContent');
    if (session.cambiarPasswordObligatorio) {
      if (loginScreen) loginScreen.style.display = 'none';
      if (cambioScreen) cambioScreen.style.display = 'flex';
      if (cambioForm) cambioForm.addEventListener('submit', manejarCambioPassword);
      return;
    }
  if (loginScreen) loginScreen.style.display = 'none';
  if (cambioScreen) cambioScreen.style.display = 'none';
  if (appContent) appContent.style.display = 'block';
  if (typeof mostrarChatbotWrap === 'function') mostrarChatbotWrap(true);
  if (typeof vincularChatbot === 'function') vincularChatbot();
  const centerName = document.getElementById('headerUserNameText');
  if (centerName) centerName.textContent = session.nombre || session.username;
  aplicarPermisos(session);
  init();
  vincularAdmin();
  vincularOrganigrama();
  vincularFichajes();
  actualizarLedFichaje();
  } else {
    var loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'flex';
    rellenarLoginUsuariosRecientes();
    cargarCredencialesGuardadas();
    var loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', manejarLogin);
  }
  vincularLoginUsuariosRecientes();
  var btnDemo = document.getElementById('loginDemo');
  if (btnDemo) {
    btnDemo.addEventListener('click', function () {
      var permisos = {};
      if (typeof PERMISOS === 'object') { Object.keys(PERMISOS).forEach(function (k) { permisos[k] = true; }); }
      var demoUser = { id: 'demo', username: 'demo', nombre: 'Demo', rol: 'admin', cambiarPasswordObligatorio: false, permisos: permisos };
      setSession(demoUser);
      var ls = document.getElementById('loginScreen');
      var ns = document.getElementById('normativasScreen');
      var app = document.getElementById('appContent');
      if (ls) ls.style.display = 'none';
      if (ns) ns.style.display = 'flex';
      if (app) app.style.display = 'none';
      if (typeof initNormativasPantalla === 'function') initNormativasPantalla('demo', true);
    });
  }
  var btnConfigurarServidor = document.getElementById('loginConfigurarServidor');
  var panelServidor = document.getElementById('loginServidorPanel');
  var inputServidorUrl = document.getElementById('loginServidorUrl');
  var btnServidorGuardar = document.getElementById('loginServidorGuardar');
  var estadoServidor = document.getElementById('loginServidorEstado');
  if (btnConfigurarServidor && panelServidor) {
    btnConfigurarServidor.addEventListener('click', function () {
      var visible = panelServidor.style.display !== 'none';
      panelServidor.style.display = visible ? 'none' : 'block';
      if (!visible && inputServidorUrl && window.backendApi) {
        inputServidorUrl.value = window.backendApi.getApiUrl() || '';
      }
      if (estadoServidor) estadoServidor.textContent = '';
    });
  }
  if (btnServidorGuardar && inputServidorUrl && estadoServidor && window.backendApi) {
    btnServidorGuardar.addEventListener('click', function () {
      var url = (inputServidorUrl.value || '').trim();
      if (!url) {
        estadoServidor.textContent = 'Escribe la URL del servidor.';
        estadoServidor.style.color = 'var(--text-muted)';
        return;
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
      window.backendApi.setApiUrl(url);
      estadoServidor.textContent = 'Guardado. Conectando...';
      estadoServidor.style.color = 'var(--accent, #d4af37)';
      window.backendApi.init().then(function (ok) {
        estadoServidor.textContent = ok ? 'Conectado al servidor.' : 'No se pudo conectar. Comprueba la URL y que el servidor esté en marcha.';
        estadoServidor.style.color = ok ? 'var(--success, #22c55e)' : 'var(--danger, #dc3545)';
      });
    });
  }

  var btnCrearUsuario = document.getElementById('loginCrearUsuario');
  var modalCrearUsuario = document.getElementById('modalCrearUsuario');
  var modalCrearUsuarioClose = document.getElementById('modalCrearUsuarioClose');
  var modalCrearUsuarioBackdrop = document.getElementById('modalCrearUsuarioBackdrop');
  if (btnCrearUsuario && modalCrearUsuario) {
    btnCrearUsuario.addEventListener('click', function () {
      modalCrearUsuario.classList.add('active');
      var formCrear = document.getElementById('formCrearUsuario');
      if (formCrear) formCrear.reset();
      var errCrear = document.getElementById('crearUsuarioError');
      if (errCrear) errCrear.style.display = 'none';
      var confirmErrCrear = document.getElementById('crearUsuarioPasswordConfirmError');
      if (confirmErrCrear) confirmErrCrear.style.display = 'none';
    });
  }
  if (modalCrearUsuarioClose) modalCrearUsuarioClose.addEventListener('click', function () { modalCrearUsuario.classList.remove('active'); });
  if (modalCrearUsuarioBackdrop) modalCrearUsuarioBackdrop.addEventListener('click', function () { modalCrearUsuario.classList.remove('active'); });
  var formCrearUsuario = document.getElementById('formCrearUsuario');
  if (formCrearUsuario) {
    formCrearUsuario.addEventListener('submit', async function (e) {
      e.preventDefault();
      var username = (document.getElementById('crearUsuarioUsername').value || '').trim();
      var nombre = (document.getElementById('crearUsuarioNombre').value || '').trim();
      var password = (document.getElementById('crearUsuarioPassword').value || '').trim();
      var passwordConfirm = (document.getElementById('crearUsuarioPasswordConfirm').value || '').trim();
      var errEl = document.getElementById('crearUsuarioError');
      var confirmErrEl = document.getElementById('crearUsuarioPasswordConfirmError');
      if (errEl) errEl.style.display = 'none';
      if (confirmErrEl) confirmErrEl.style.display = 'none';
      if (password.length < 4) {
        if (errEl) { errEl.textContent = 'La contraseña debe tener al menos 4 caracteres.'; errEl.style.display = 'block'; }
        return;
      }
      if (password !== passwordConfirm) {
        if (confirmErrEl) { confirmErrEl.textContent = 'La contraseña y la confirmación no coinciden.'; confirmErrEl.style.display = 'block'; }
        if (errEl) { errEl.textContent = 'La contraseña y la confirmación no coinciden.'; errEl.style.display = 'block'; }
        return;
      }
      if (!username) {
        if (errEl) { errEl.textContent = 'El usuario es obligatorio.'; errEl.style.display = 'block'; }
        return;
      }
      var data = { username: username, nombre: nombre || username, password: password, rol: 'mecanico', permisos: {}, fechaAlta: new Date().toISOString().slice(0, 10) };
      if (typeof createUser !== 'function') {
        if (errEl) { errEl.textContent = 'No se puede crear usuario en este momento.'; errEl.style.display = 'block'; }
        return;
      }
      var res = await createUser(data, 'self');
      if (res && res.error) {
        if (errEl) { errEl.textContent = res.error; errEl.style.display = 'block'; }
        return;
      }
      if (modalCrearUsuario) modalCrearUsuario.classList.remove('active');
      alert('Usuario creado correctamente. Ya puedes iniciar sesión.');
    });
  }
  var btnOlvidaste = document.getElementById('loginOlvidasteCredenciales');
  var modalRecuperarPassword = document.getElementById('modalRecuperarPassword');
  var modalRecuperarPasswordClose = document.getElementById('modalRecuperarPasswordClose');
  var modalRecuperarPasswordBackdrop = document.getElementById('modalRecuperarPasswordBackdrop');
  if (btnOlvidaste && modalRecuperarPassword) {
    btnOlvidaste.addEventListener('click', function () {
      modalRecuperarPassword.classList.add('active');
      document.getElementById('formRecuperarPassword').reset();
      document.getElementById('recuperarPasswordError').style.display = 'none';
      document.getElementById('recuperarPasswordConfirmarError').style.display = 'none';
    });
  }
  if (modalRecuperarPasswordClose) modalRecuperarPasswordClose.addEventListener('click', function () { modalRecuperarPassword.classList.remove('active'); });
  if (modalRecuperarPasswordBackdrop) modalRecuperarPasswordBackdrop.addEventListener('click', function () { modalRecuperarPassword.classList.remove('active'); });
  var formRecuperarPassword = document.getElementById('formRecuperarPassword');
  if (formRecuperarPassword) {
    formRecuperarPassword.addEventListener('submit', async function (e) {
      e.preventDefault();
      var username = (document.getElementById('recuperarPasswordUsername').value || '').trim();
      var nueva = (document.getElementById('recuperarPasswordNueva').value || '').trim();
      var confirmar = (document.getElementById('recuperarPasswordConfirmar').value || '').trim();
      var errEl = document.getElementById('recuperarPasswordError');
      var confirmErrEl = document.getElementById('recuperarPasswordConfirmarError');
      if (errEl) errEl.style.display = 'none';
      if (confirmErrEl) confirmErrEl.style.display = 'none';
      if (nueva.length < 4) {
        if (errEl) { errEl.textContent = 'La contraseña debe tener al menos 4 caracteres.'; errEl.style.display = 'block'; }
        return;
      }
      if (nueva !== confirmar) {
        if (confirmErrEl) { confirmErrEl.textContent = 'Las contraseñas no coinciden.'; confirmErrEl.style.display = 'block'; }
        if (errEl) { errEl.textContent = 'Las contraseñas no coinciden.'; errEl.style.display = 'block'; }
        return;
      }
      if (!username) {
        if (errEl) { errEl.textContent = 'Indica tu nombre de usuario.'; errEl.style.display = 'block'; }
        return;
      }
      if (typeof isUsuarioContrasenaProtegida === 'function' && isUsuarioContrasenaProtegida(username)) {
        if (errEl) { errEl.textContent = 'No está permitido cambiar la contraseña de este usuario.'; errEl.style.display = 'block'; }
        return;
      }
      var res = typeof resetPasswordPorUsuario === 'function' ? await resetPasswordPorUsuario(username, nueva) : { error: 'No disponible' };
      if (res.error) {
        if (errEl) { errEl.textContent = res.error; errEl.style.display = 'block'; }
        return;
      }
      modalRecuperarPassword.classList.remove('active');
      alert('Contraseña actualizada. Ya puedes iniciar sesión con tu usuario y la nueva contraseña.');
    });
  }
  var btnLogout = document.getElementById('btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', () => {
    manejarLogout();
    aplicarVisibilidadHintLogin();
  });
}

// ========== PANEL ADMIN (pantalla completa) ==========
function vincularAdmin() {
  const session = getSession();
  const btnAdmin = document.getElementById('btnAdminPanel');
  if (!btnAdmin) return;
  const pantallaPrincipal = document.getElementById('pantallaPrincipal');
  const pantallaGestion = document.getElementById('pantallaGestion');
  const btnGestionHome = document.getElementById('btnGestionHome');
  const modalUsuario = document.getElementById('modalUsuario');
  const modalUsuarioClose = document.getElementById('modalUsuarioClose');
  const formUsuario = document.getElementById('formUsuario');
  const btnNuevoUsuario = document.getElementById('btnNuevoUsuario');

  function aplicarVisibilidadTabsGestion() {
    var s = getSession();
    var puedeUsuarios = hasPermission(s, 'gestionarUsuarios') || hasPermission(s, 'gestionarEquipo');
    var puedeConvenios = hasPermission(s, 'gestionarUsuarios');
    var puedeEconomia = hasPermission(s, 'gestionarUsuarios') || hasPermission(s, 'gestionarCompras');
    var puedeSolicitudes = hasPermission(s, 'gestionarUsuarios');
    var puedeOrganigrama = hasPermission(s, 'verOrganigrama');
    var puedeReset = hasPermission(s, 'gestionarUsuarios');
    document.querySelectorAll('.admin-tab').forEach(function (tab) {
      var t = tab.dataset.tab;
      var visible = (t === 'usuarios' && puedeUsuarios) || (t === 'convenios' && puedeConvenios) || (t === 'economia' && puedeEconomia) || (t === 'stock' && puedeEconomia) || (t === 'solicitudes-graficas' && puedeSolicitudes) || (t === 'reset' && puedeReset);
      tab.style.display = visible ? '' : 'none';
    });
    document.querySelectorAll('.gestion-card').forEach(function (card) {
      if (card.getAttribute('data-gestion-nav')) return;
      var t = card.dataset.tab;
      var visible = (t === 'usuarios' && puedeUsuarios) || (t === 'usuarios-tabla' && puedeUsuarios) || (t === 'convenios' && puedeConvenios) || (t === 'economia' && puedeEconomia) || (t === 'stock' && puedeEconomia) || (t === 'solicitudes-graficas' && puedeSolicitudes) || (t === 'organigrama' && puedeOrganigrama) || (t === 'reset' && puedeReset) || (t === 'indicadores' && puedeUsuarios);
      card.style.display = visible ? '' : 'none';
    });
    var economiaTabsEl = document.getElementById('economiaTabs');
    if (economiaTabsEl) economiaTabsEl.querySelectorAll('.economia-tab').forEach(function (tab) {
      var t = tab.dataset.economiaTab;
      var soloAdmin = (t === 'gastos' || t === 'previsiones' || t === 'financiera');
      tab.style.display = (soloAdmin && !hasPermission(s, 'gestionarUsuarios')) ? 'none' : '';
    });
    document.querySelectorAll('.stock-tab').forEach(function (tab) {
      var t = tab.dataset.stockTab;
      var soloAdmin = (t === 'piezas');
      tab.style.display = (soloAdmin && !hasPermission(s, 'gestionarUsuarios')) ? 'none' : '';
    });
  }

  var gestionMenuEl = document.getElementById('gestionMenu');
  var gestionContenidoEl = document.getElementById('gestionContenido');
  var gestionContenidoTituloEl = document.getElementById('gestionContenidoTitulo');
  var titulosGestion = { usuarios: 'Empleados', 'usuarios-tabla': 'Usuarios', convenios: 'Convenios', economia: 'Economía', stock: 'Stock', 'solicitudes-graficas': 'Solicitudes', organigrama: 'Organigrama', reset: 'Reset / Limpiar datos', indicadores: 'Indicadores' };

  function abrirPantallaGestion() {
    cerrarTodasPantallasSecundarias();
    aplicarVisibilidadTabsGestion();
    renderListaUsuarios();
    if (gestionMenuEl) gestionMenuEl.style.display = '';
    if (gestionContenidoEl) gestionContenidoEl.style.display = 'none';
    ocultarAppBodyMostrarSecundaria('pantallaGestion');
  }

  function irAGestionMenu() {
    if (gestionMenuEl) gestionMenuEl.style.display = '';
    if (gestionContenidoEl) gestionContenidoEl.style.display = 'none';
  }

  function irAGestionPanel(tab) {
    if (gestionMenuEl) gestionMenuEl.style.display = 'none';
    if (gestionContenidoEl) gestionContenidoEl.style.display = 'flex';
    if (gestionContenidoTituloEl && titulosGestion[tab]) gestionContenidoTituloEl.textContent = titulosGestion[tab];
    mostrarPanelAdmin(tab);
    if (tab === 'convenios') renderListaConvenios();
  }

  function volverPantallaPrincipalDesdeGestion() {
    cerrarTodasPantallasSecundarias();
  }

  btnAdmin?.addEventListener('click', function(e) {
    e.preventDefault();
    abrirPantallaGestion();
  });
  btnGestionHome?.addEventListener('click', function(e) {
    e.preventDefault();
    volverPantallaPrincipalDesdeGestion();
  });

  document.getElementById('btnGestionVolverMenu')?.addEventListener('click', function() {
    irAGestionMenu();
  });

  var gestionNavToBtn = { ficha: 'btnFichaTrabajador', historial: 'btnMiHistorial', normativas: 'btnNormativas', clientes: 'btnRegistroClientes', tunnings: 'btnTunnings', personalizacion: 'btnPersonalizacion' };
  document.querySelectorAll('.gestion-card').forEach(function(card) {
    card.addEventListener('click', function() {
      var nav = card.getAttribute('data-gestion-nav');
      if (nav === 'vacantes') {
        if (typeof abrirPantallaVacantes === 'function') abrirPantallaVacantes();
        return;
      }
      if (nav === 'materiales-recuperados') {
        if (typeof abrirPantallaMaterialesRecuperados === 'function') abrirPantallaMaterialesRecuperados();
        return;
      }
      if (nav && gestionNavToBtn[nav]) {
        var btn = document.getElementById(gestionNavToBtn[nav]);
        if (btn) btn.click();
        return;
      }
      var t = card.getAttribute('data-tab');
      if (!t) return;
      if (t === 'organigrama') {
        if (typeof abrirPantallaOrganigrama === 'function') abrirPantallaOrganigrama();
        return;
      }
      irAGestionPanel(t);
    });
  });

  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab;
      mostrarPanelAdmin(t);
      if (t === 'convenios') renderListaConvenios();
    });
  });

  btnNuevoUsuario?.addEventListener('click', () => abrirFormUsuario());
  document.getElementById('btnAnadirUsuarioTabla')?.addEventListener('click', function () {
    if (typeof abrirFormUsuario === 'function') abrirFormUsuario();
  });
  document.getElementById('btnNuevoConvenio')?.addEventListener('click', () => abrirFormConvenio());
  (function vincularConveniosTabs() {
    var tabEmpresas = document.getElementById('conveniosTabEmpresas');
    var tabEmpleadosPlacas = document.getElementById('conveniosTabEmpleadosPlacas');
    var panelEmpresas = document.getElementById('conveniosPanelEmpresas');
    var panelEmpleadosPlacas = document.getElementById('conveniosPanelEmpleadosPlacas');
    function showConveniosTab(which) {
      document.querySelectorAll('.convenios-tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-convenios-tab') === which); });
      if (panelEmpresas) panelEmpresas.style.display = which === 'empresas' ? '' : 'none';
      if (panelEmpleadosPlacas) panelEmpleadosPlacas.style.display = which === 'empleados-placas' ? '' : 'none';
      if (which === 'empleados-placas' && typeof renderConveniosEmpleadosYPlacas === 'function') renderConveniosEmpleadosYPlacas();
    }
    if (tabEmpresas) tabEmpresas.addEventListener('click', function () { showConveniosTab('empresas'); });
    if (tabEmpleadosPlacas) tabEmpleadosPlacas.addEventListener('click', function () { showConveniosTab('empleados-placas'); });
  })();
  if (typeof vincularIndicadoresPanel === 'function') vincularIndicadoresPanel();
  (function () {
    var modalPw = document.getElementById('modalCambiarPassword');
    if (!modalPw) return;
    document.getElementById('modalCambiarPasswordClose')?.addEventListener('click', cerrarModalCambiarPassword);
    document.getElementById('modalCambiarPasswordBackdrop')?.addEventListener('click', cerrarModalCambiarPassword);
    document.getElementById('modalCambiarPasswordCancelar')?.addEventListener('click', cerrarModalCambiarPassword);
    document.getElementById('modalCambiarPasswordAceptar')?.addEventListener('click', function () {
      var userId = (document.getElementById('cambiarPasswordUserId') && document.getElementById('cambiarPasswordUserId').value) || '';
      var nueva = (document.getElementById('cambiarPasswordNueva') && document.getElementById('cambiarPasswordNueva').value) || '';
      var confirmar = (document.getElementById('cambiarPasswordConfirmar') && document.getElementById('cambiarPasswordConfirmar').value) || '';
      var errEl = document.getElementById('modalCambiarPasswordError');
      if (!userId) { if (errEl) { errEl.textContent = 'Usuario no indicado.'; errEl.style.display = 'block'; } return; }
      if (nueva.length < 4) { if (errEl) { errEl.textContent = 'La contraseña debe tener al menos 4 caracteres.'; errEl.style.display = 'block'; } return; }
      if (nueva !== confirmar) { if (errEl) { errEl.textContent = 'Las contraseñas no coinciden.'; errEl.style.display = 'block'; } return; }
      if (typeof cambiarPassword !== 'function') { if (errEl) { errEl.textContent = 'No disponible.'; errEl.style.display = 'block'; } return; }
      cambiarPassword(userId, nueva).then(function (result) {
        if (result && result.error) {
          if (errEl) { errEl.textContent = result.error; errEl.style.display = 'block'; }
          return;
        }
        cerrarModalCambiarPassword();
        if (typeof renderTablaUsuarios === 'function') renderTablaUsuarios();
      }).catch(function (e) {
        if (errEl) { errEl.textContent = (e && e.message) || 'Error al cambiar la contraseña.'; errEl.style.display = 'block'; }
      });
    });
  })();

  document.getElementById('modalConvenioClose')?.addEventListener('click', () => document.getElementById('modalConvenio').classList.remove('active'));
  document.getElementById('modalConvenio')?.addEventListener('click', e => { if (e.target === document.getElementById('modalConvenio')) document.getElementById('modalConvenio').classList.remove('active'); });
  document.getElementById('formConvenio')?.addEventListener('submit', guardarConvenio);
  document.querySelectorAll('.convenio-descuento-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var n = this.getAttribute('data-descuento');
      var input = document.getElementById('convenioDescuento');
      if (input) input.value = n;
      if (typeof syncConvenioDescuentoButtons === 'function') syncConvenioDescuentoButtons();
    });
  });
  (function () {
    var fileInput = document.getElementById('convenioAcuerdoArchivoFile');
    var nombreInput = document.getElementById('convenioAcuerdoArchivoNombre');
    var actualEl = document.getElementById('convenioAcuerdoActual');
    var quitarBtn = document.getElementById('convenioAcuerdoQuitar');
    var maxSize = 1024 * 1024;
    if (fileInput) fileInput.addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      if (f.size > maxSize) { alert('El archivo no debe superar 1 MB.'); this.value = ''; return; }
      var reader = new FileReader();
      reader.onload = function () {
        _convenioPendingAcuerdoDataUrl = reader.result;
        _convenioPendingAcuerdoNombre = f.name;
        if (actualEl) { actualEl.textContent = 'Nuevo archivo: ' + f.name; actualEl.style.display = 'block'; }
        if (quitarBtn) quitarBtn.style.display = 'inline-block';
        if (nombreInput) nombreInput.value = '';
      };
      reader.readAsDataURL(f);
    });
    if (quitarBtn) quitarBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      _convenioAcuerdoQuitado = true;
      _convenioPendingAcuerdoDataUrl = null;
      _convenioPendingAcuerdoNombre = null;
      if (fileInput) fileInput.value = '';
      if (nombreInput) nombreInput.value = '';
      if (actualEl) { actualEl.style.display = 'none'; actualEl.textContent = ''; }
      quitarBtn.style.display = 'none';
    });
  })();
  modalUsuarioClose?.addEventListener('click', () => modalUsuario.classList.remove('active'));
  modalUsuario?.addEventListener('click', e => { if (e.target === modalUsuario) modalUsuario.classList.remove('active'); });
  document.getElementById('btnFichaEmpleadoHome')?.addEventListener('click', function () { cerrarTodasPantallasSecundarias(); });
  document.getElementById('btnEliminarEmpleadoFicha')?.addEventListener('click', function () {
    var id = document.getElementById('usuarioId') && document.getElementById('usuarioId').value;
    if (!id) return;
    var users = typeof getUsers === 'function' ? getUsers() : [];
    var u = users.find(function (x) { return x.id === id; });
    var nombre = (u && (u.nombre || u.username)) || id;
    if (!confirm('¿Eliminar al empleado "' + nombre + '"? Esta acción no se puede deshacer.')) return;
    var res = typeof deleteUser === 'function' ? deleteUser(id) : { error: 'No disponible' };
    if (res && res.error) { alert(res.error); return; }
    cerrarTodasPantallasSecundarias();
    if (typeof renderListaUsuarios === 'function') renderListaUsuarios();
    if (typeof renderTablaUsuarios === 'function') renderTablaUsuarios();
    if (typeof renderOrganigrama === 'function' && document.getElementById('pantallaOrganigrama') && document.getElementById('pantallaOrganigrama').style.display === 'flex') {
      renderOrganigrama('organigramaContainer', !!window._organigramaEditMode);
    }
  });
  var btnFotoGaleria = document.getElementById('btnFichaEmpleadoFotoGaleria');
  if (btnFotoGaleria) {
    btnFotoGaleria.addEventListener('click', function () {
      var id = document.getElementById('usuarioId') && document.getElementById('usuarioId').value;
      if (id && typeof openGaleriaFotosEmpleado === 'function') openGaleriaFotosEmpleado(id);
    });
  }
  var btnFichaAbrirGaleria = document.getElementById('btnFichaEmpleadoAbrirGaleria');
  if (btnFichaAbrirGaleria) {
    btnFichaAbrirGaleria.addEventListener('click', function () {
      var id = document.getElementById('usuarioId') && document.getElementById('usuarioId').value;
      if (id && typeof openGaleriaFotosEmpleado === 'function') openGaleriaFotosEmpleado(id);
    });
  }
  var modalGaleriaClose = document.getElementById('modalGaleriaFotosEmpleadoClose');
  var modalGaleriaBackdrop = document.getElementById('modalGaleriaFotosEmpleadoBackdrop');
  if (modalGaleriaClose) modalGaleriaClose.addEventListener('click', function () { if (typeof cerrarGaleriaFotosEmpleado === 'function') cerrarGaleriaFotosEmpleado(); });
  if (modalGaleriaBackdrop) modalGaleriaBackdrop.addEventListener('click', function () { if (typeof cerrarGaleriaFotosEmpleado === 'function') cerrarGaleriaFotosEmpleado(); });
  var modalGaleriaVehClose = document.getElementById('modalGaleriaFotosVehiculoClose');
  var modalGaleriaVehBackdrop = document.getElementById('modalGaleriaFotosVehiculoBackdrop');
  if (modalGaleriaVehClose) modalGaleriaVehClose.addEventListener('click', function () { if (typeof cerrarGaleriaFotosVehiculo === 'function') cerrarGaleriaFotosVehiculo(); });
  if (modalGaleriaVehBackdrop) modalGaleriaVehBackdrop.addEventListener('click', function () { if (typeof cerrarGaleriaFotosVehiculo === 'function') cerrarGaleriaFotosVehiculo(); });
  var btnGaleriaVehAnadir = document.getElementById('btnGaleriaFotosVehiculoAnadir');
  var inputGaleriaVehFoto = document.getElementById('galeriaFotosVehiculoInput');
  if (btnGaleriaVehAnadir && inputGaleriaVehFoto) {
    btnGaleriaVehAnadir.addEventListener('click', function () { inputGaleriaVehFoto.value = ''; inputGaleriaVehFoto.click(); });
    inputGaleriaVehFoto.addEventListener('change', function () {
      var files = this.files;
      if (!files || files.length === 0) return;
      var modal = document.getElementById('modalGaleriaFotosVehiculo');
      var mat = modal && modal.dataset.galeriaMatricula;
      var uid = modal && modal.dataset.galeriaUserId;
      if (!mat) return;
      var fotos = typeof getFotosByMatricula === 'function' ? getFotosByMatricula(mat) : [];
      fotos = fotos.slice();
      var readNext = function (i) {
        if (i >= files.length) {
          if (typeof setFotosMatricula === 'function') setFotosMatricula(mat, fotos);
          if (typeof renderGaleriaFotosVehiculo === 'function') renderGaleriaFotosVehiculo(mat);
          if (uid && typeof renderFichaEmpleadoVehiculos === 'function') renderFichaEmpleadoVehiculos(uid);
          inputGaleriaVehFoto.value = '';
          return;
        }
        var file = files[i];
        if (!file.type.startsWith('image/')) { readNext(i + 1); return; }
        var reader = new FileReader();
        reader.onload = function () { fotos.push(reader.result); readNext(i + 1); };
        reader.readAsDataURL(file);
      };
      readNext(0);
    });
  }
  var btnGaleriaAnadir = document.getElementById('btnGaleriaFotosEmpleadoAnadir');
  var inputGaleriaFoto = document.getElementById('galeriaFotosEmpleadoInput');
  if (btnGaleriaAnadir && inputGaleriaFoto) {
    btnGaleriaAnadir.addEventListener('click', function () { inputGaleriaFoto.value = ''; inputGaleriaFoto.click(); });
    inputGaleriaFoto.addEventListener('change', function () {
      var files = this.files;
      if (!files || files.length === 0) return;
      var modal = document.getElementById('modalGaleriaFotosEmpleado');
      var id = modal && modal.dataset.galeriaUserId;
      if (!id) return;
      var users = getUsers();
      var u = users.find(function (x) { return x.id === id; });
      var fotos = (u && Array.isArray(u.fotosFicha)) ? u.fotosFicha.slice() : [];
      var session = getSession();
      if (!session || typeof updateUser !== 'function') return;
      var readNext = function (i) {
        if (i >= files.length) {
          updateUser(id, { fotosFicha: fotos }, session.username).then(function () {
            if (typeof renderGaleriaFotosEmpleado === 'function') renderGaleriaFotosEmpleado(id);
          }).catch(function () {});
          inputGaleriaFoto.value = '';
          return;
        }
        var file = files[i];
        if (!file.type.startsWith('image/')) { readNext(i + 1); return; }
        var reader = new FileReader();
        reader.onload = function () { fotos.push(reader.result); readNext(i + 1); };
        reader.readAsDataURL(file);
      };
      readNext(0);
    });
  }
  var btnFichaAnadirFoto = document.getElementById('btnFichaEmpleadoAnadirFoto');
  var inputFichaFoto = document.getElementById('fichaEmpleadoFotoInput');
  if (btnFichaAnadirFoto && inputFichaFoto) {
    btnFichaAnadirFoto.addEventListener('click', function () { inputFichaFoto.click(); });
    inputFichaFoto.addEventListener('change', function () {
      var files = this.files;
      if (!files || files.length === 0) return;
      var id = document.getElementById('usuarioId').value;
      if (!id) return;
      var users = getUsers();
      var u = users.find(function (x) { return x.id === id; });
      var fotos = (u && Array.isArray(u.fotosFicha)) ? u.fotosFicha.slice() : [];
      var session = getSession();
      if (!session || typeof updateUser !== 'function') return;
      var readNext = function (i) {
        if (i >= files.length) {
          updateUser(id, { fotosFicha: fotos }, session.username).then(function () {
            if (typeof renderFichaEmpleadoFotos === 'function') renderFichaEmpleadoFotos(id);
            if (typeof aplicarFondoFichaEmpleado === 'function') aplicarFondoFichaEmpleado(id);
          }).catch(function () {});
          inputFichaFoto.value = '';
          return;
        }
        var file = files[i];
        if (!file.type.startsWith('image/')) { readNext(i + 1); return; }
        var reader = new FileReader();
        reader.onload = function () {
          fotos.push(reader.result);
          readNext(i + 1);
        };
        reader.readAsDataURL(file);
      };
      readNext(0);
    });
  }
  vincularEconomia();
  vincularResetDatos();
}

function ejecutarReset(seccion) {
  var session = typeof getSession === 'function' ? getSession() : null;
  if (!session || !hasPermission(session, 'gestionarUsuarios')) {
    alert('Solo un administrador puede resetear datos.');
    return;
  }
  var mensajes = {
    fichajes: '¿Vaciar todos los fichajes (entradas/salidas)?',
    reparaciones: '¿Eliminar todas las reparaciones y servicios registrados?',
    economia: '¿Vaciar compras, inventario, gastos, previsiones, límites de stock y reparto de beneficios?',
    clientes: '¿Vaciar BBDD de clientes, pendientes de aprobación y fotos de vehículos?',
    media: '¿Eliminar todos los vídeos pendientes y aprobados?',
    todo: '¿Resetear TODOS los datos de prueba (fichajes, reparaciones, economía, clientes, media)? No se tocan usuarios ni convenios.'
  };
  if (!mensajes[seccion] || !confirm(mensajes[seccion])) return;
  if (seccion === 'fichajes' || seccion === 'todo') {
    try { localStorage.setItem('benny_fichajes', '[]'); } catch (e) {}
  }
  if (seccion === 'reparaciones' || seccion === 'todo') {
    if (typeof saveRegistroServicios === 'function') saveRegistroServicios([]);
  }
  if (seccion === 'economia' || seccion === 'todo') {
    try {
      localStorage.setItem('benny_economia_compras', '[]');
      localStorage.setItem('benny_economia_inventario', '{}');
      localStorage.setItem('benny_economia_gastos', '[]');
      localStorage.setItem('benny_economia_previsiones', '{}');
      localStorage.setItem('benny_economia_limites_stock', '{}');
      localStorage.setItem('benny_economia_reparto_beneficios', '');
      if (typeof window.invalidateEconomiaCaches === 'function') window.invalidateEconomiaCaches();
    } catch (e) {}
  }
  if (seccion === 'clientes' || seccion === 'todo') {
    try {
      localStorage.setItem('benny_clientes_bbdd', '[]');
      if (typeof window.invalidateClientesBBDDCache === 'function') window.invalidateClientesBBDDCache();
      localStorage.setItem('benny_clientes_pendientes', '[]');
      localStorage.setItem('benny_clientes_fotos', '{}');
    } catch (e) {}
  }
  if (seccion === 'media' || seccion === 'todo') {
    try {
      localStorage.setItem(MEDIA_PENDING_STORAGE, '[]');
      localStorage.setItem(MEDIA_APPROVED_STORAGE, '[]');
    } catch (e) {}
  }
  if (seccion === 'todo') {
    try { localStorage.setItem('benny_tunnings', '[]'); } catch (e) {}
  }
  if (typeof renderMainDashboard === 'function') renderMainDashboard();
  if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
  if (typeof renderTablaClientesBBDD === 'function') renderTablaClientesBBDD();
  if (typeof renderFichasClientes === 'function') renderFichasClientes();
  if (typeof renderPendientesRegistro === 'function') renderPendientesRegistro();
  if (typeof renderSolicitudesGraficas === 'function') renderSolicitudesGraficas();
  var sessionUser = typeof getSession === 'function' ? getSession() : null;
  if (sessionUser && typeof renderFichajesDashboard === 'function') renderFichajesDashboard(sessionUser.username);
  alert('Datos reseteados.');
}

/** Recopila todos los datos de la app para exportar al repositorio */
function getDatosCompletosParaExportar() {
  function get(key, def) {
    try {
      var raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : def;
    } catch (e) { return def; }
  }
  var out = {
    users: typeof getUsers === 'function' ? getUsers() : get('benny_users', []),
    fichajes: typeof getFichajes === 'function' ? getFichajes() : get('benny_fichajes', []),
    servicios: typeof getRegistroServicios === 'function' ? getRegistroServicios() : get('benny_servicios', []),
    repartoBeneficios: (function () { try { return localStorage.getItem('benny_economia_reparto_beneficios') || ''; } catch (e) { return ''; } })()
  };
  var keys = [
    ['clientesBBDD', 'benny_clientes_bbdd', []], ['clientesPendientes', 'benny_clientes_pendientes', []], ['clientesFotos', 'benny_clientes_fotos', {}],
    ['economiaCompras', 'benny_economia_compras', []], ['economiaInventario', 'benny_economia_inventario', {}], ['economiaInventarioCostes', 'benny_economia_inventario_costes', {}], ['economiaGastos', 'benny_economia_gastos', []],
    ['economiaPrevisiones', 'benny_economia_previsiones', {}], ['economiaLimitesStock', 'benny_economia_limites_stock', {}],
    ['tunnings', 'benny_tunnings', []], ['mediaPending', 'benny_media_pending', []], ['mediaApproved', 'benny_media_approved', []],
    ['vacantes', 'benny_vacantes_solicitudes', []], ['bandejaEntrada', 'benny_bandeja_entrada', {}], ['normativasTestRegistro', 'benny_normativas_test_registro', []],
    ['organigrama', 'benny_organigrama', null], ['convenios', 'benny_convenios', []], ['conveniosEmpleados', 'benny_convenios_empleados', []], ['conveniosPlacas', 'benny_convenios_placas', []],
    ['almacenMateriales', 'benny_almacen_materiales', {}], ['almacenMovimientos', 'benny_almacen_movimientos', []],
    ['preciosPiezas', 'benny_precios_piezas', null], ['stockPiezasReparacion', 'benny_stock_piezas_reparacion', null],
    ['matriculas', 'benny_matriculas', []], ['vehiculosRegistro', 'benny_vehiculos_registro', []], ['entregasMaterial', 'benny_entregas_material', []],
    ['preciosPiezasTuneo', 'benny_precios_piezas_tuneo', {}]
  ];
  for (var i = 0; i < keys.length; i++) out[keys[i][0]] = get(keys[i][1], keys[i][2]);
  out._exportadoAt = new Date().toISOString();
  return out;
}

/** Mapeo export key -> [localStorage key, esString] para aplicar datos del servidor */
var DATOS_COMPLETOS_STORAGE_MAP = [
  ['users', 'benny_users', false],
  ['fichajes', 'benny_fichajes', false],
  ['servicios', 'benny_servicios', false],
  ['repartoBeneficios', 'benny_economia_reparto_beneficios', true],
  ['clientesBBDD', 'benny_clientes_bbdd', false],
  ['clientesPendientes', 'benny_clientes_pendientes', false],
  ['clientesFotos', 'benny_clientes_fotos', false],
  ['economiaCompras', 'benny_economia_compras', false],
  ['economiaInventario', 'benny_economia_inventario', false],
  ['economiaInventarioCostes', 'benny_economia_inventario_costes', false],
  ['economiaGastos', 'benny_economia_gastos', false],
  ['economiaPrevisiones', 'benny_economia_previsiones', false],
  ['economiaLimitesStock', 'benny_economia_limites_stock', false],
  ['tunnings', 'benny_tunnings', false],
  ['mediaPending', 'benny_media_pending', false],
  ['mediaApproved', 'benny_media_approved', false],
  ['vacantes', 'benny_vacantes_solicitudes', false],
  ['bandejaEntrada', 'benny_bandeja_entrada', false],
  ['normativasTestRegistro', 'benny_normativas_test_registro', false],
  ['organigrama', 'benny_organigrama', false],
  ['convenios', 'benny_convenios', false],
  ['conveniosEmpleados', 'benny_convenios_empleados', false],
  ['conveniosPlacas', 'benny_convenios_placas', false],
  ['almacenMateriales', 'benny_almacen_materiales', false],
  ['almacenMovimientos', 'benny_almacen_movimientos', false],
  ['preciosPiezas', 'benny_precios_piezas', false],
  ['stockPiezasReparacion', 'benny_stock_piezas_reparacion', false],
  ['matriculas', 'benny_matriculas', false],
  ['vehiculosRegistro', 'benny_vehiculos_registro', false],
  ['entregasMaterial', 'benny_entregas_material', false],
  ['preciosPiezasTuneo', 'benny_precios_piezas_tuneo', false]
];

/** Aplica el payload de datos completos del servidor a localStorage y invalida cachés (sincronización total) */
function aplicarDatosCompletosFromServer(payload) {
  if (!payload || typeof payload !== 'object') return;
  var i, key, storageKey, isString, val;
  var keysProtegerSiVacios = { convenios: 1, conveniosEmpleados: 1, conveniosPlacas: 1, servicios: 1 };
  for (i = 0; i < DATOS_COMPLETOS_STORAGE_MAP.length; i++) {
    key = DATOS_COMPLETOS_STORAGE_MAP[i][0];
    storageKey = DATOS_COMPLETOS_STORAGE_MAP[i][1];
    isString = DATOS_COMPLETOS_STORAGE_MAP[i][2];
    if (!payload.hasOwnProperty(key)) continue;
    val = payload[key];
    if (keysProtegerSiVacios[key] && Array.isArray(val) && val.length === 0) continue;
    try {
      if (isString) localStorage.setItem(storageKey, typeof val === 'string' ? val : '');
      else localStorage.setItem(storageKey, JSON.stringify(val !== undefined && val !== null ? val : []));
    } catch (e) { /* ignore */ }
  }
  if (typeof window.invalidateUsersCache === 'function') window.invalidateUsersCache();
  if (typeof window.invalidateFichajesCache === 'function') window.invalidateFichajesCache();
  if (typeof window.invalidateServiciosCache === 'function') window.invalidateServiciosCache();
  if (typeof window.invalidateClientesBBDDCache === 'function') window.invalidateClientesBBDDCache();
  if (typeof window.invalidateEconomiaCaches === 'function') window.invalidateEconomiaCaches();
  registroServicios = typeof getRegistroServicios === 'function' ? getRegistroServicios() : [];
}
if (typeof window !== 'undefined') {
  window.aplicarDatosCompletosFromServer = aplicarDatosCompletosFromServer;
  window.getDatosCompletosParaExportar = getDatosCompletosParaExportar;
}

/** Descarga un JSON como archivo para guardar en server/data/ del repositorio */
function descargarJsonParaRepositorio(nombreArchivo, datos) {
  var json = typeof datos === 'string' ? datos : JSON.stringify(datos, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Temporizador para exportación automática al repo (debounce) */
var _exportacionRepositorioTimer = null;
var EXPORTACION_REPO_DEBOUNCE_MS = 2000;

function programarExportacionRepositorio() {
  if (_exportacionRepositorioTimer) clearTimeout(_exportacionRepositorioTimer);
  _exportacionRepositorioTimer = setTimeout(function () {
    _exportacionRepositorioTimer = null;
    var session = typeof getSession === 'function' ? getSession() : null;
    if (session && hasPermission(session, 'gestionarUsuarios')) exportarDatosParaRepositorio('todo');
  }, EXPORTACION_REPO_DEBOUNCE_MS);
}

var EXPORT_REPO_MAP = { users: ['getUsers', 'users.json'], fichajes: ['getFichajes', 'fichajes.json'], servicios: ['getRegistroServicios', 'servicios.json'] };

function exportarDatosParaRepositorio(tipo) {
  var session = typeof getSession === 'function' ? getSession() : null;
  if (!session || !hasPermission(session, 'gestionarUsuarios')) return;
  var api = window.backendApi;
  var guardarEnServidor = api && api.getBaseUrl && api.getBaseUrl();
  if (tipo === 'todo') {
    exportarDatosParaRepositorio('users');
    setTimeout(function () { exportarDatosParaRepositorio('fichajes'); }, 300);
    setTimeout(function () { exportarDatosParaRepositorio('servicios'); }, 600);
    setTimeout(function () {
      var datos = getDatosCompletosParaExportar();
      if (!guardarEnServidor) descargarJsonParaRepositorio('saltlab-datos-completos.json', datos);
      else if (typeof api.saveRepoExport === 'function') api.saveRepoExport(datos);
    }, 900);
    return;
  }
  var cfg = EXPORT_REPO_MAP[tipo];
  if (cfg && typeof window[cfg[0]] === 'function') {
    var payload = window[cfg[0]]();
    if (guardarEnServidor) {
      if (tipo === 'users') api.syncUsersToServer(payload);
      else if (tipo === 'fichajes') api.syncFichajesToServer(payload);
      else if (tipo === 'servicios') api.syncServiciosToServer(payload);
    } else {
      descargarJsonParaRepositorio(cfg[1], payload);
    }
  }
}

function vincularResetDatos() {
  document.querySelectorAll('.btn-reset-section').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var seccion = this.getAttribute('data-reset');
      if (seccion && typeof ejecutarReset === 'function') ejecutarReset(seccion);
    });
  });
  var exportBtns = { btnExportUsersJson: 'users', btnExportFichajesJson: 'fichajes', btnExportServiciosJson: 'servicios', btnExportTodoRepo: 'todo' };
  Object.keys(exportBtns).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function () { exportarDatosParaRepositorio(exportBtns[id]); });
  });

  // Exportación automática al repo: al guardar cualquier dato se programan las descargas (solo admin)
  (function () {
    var trigger = function () { if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio(); };
    function wrap(name) {
      var orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = function () { var r = orig.apply(this, arguments); trigger(); return r; };
    }
    var wrapNames = ['saveUsers', 'saveFichajes', 'saveComprasPendientes', 'saveInventario', 'saveGastos', 'saveLimitesStock', 'setPrevisionMes', 'saveAlmacenMateriales', 'addMaterialesAlmacen', 'saveStockPiezasReparacion', 'savePreciosPiezas', 'saveClientesBBDD', 'saveClientesFotos', 'savePendientes', 'saveConvenios', 'saveOrganigrama', 'addTunning', 'removeTunning', 'saveEntregasMaterial', 'saveRegistroVehiculos', 'savePreciosPiezasTuneo'];
    for (var i = 0; i < wrapNames.length; i++) wrap(wrapNames[i]);
  })();
}

// ========== ECONOMÍA (compras, inventario, gastos, previsiones, almacén) ==========
var ECONOMIA_SUBTABS = ['resumen', 'gastos', 'previsiones', 'historial', 'entregas', 'financiera'];
var STOCK_SUBTABS = ['compras', 'inventario', 'limites', 'almacen', 'piezas'];

function mostrarSubpanelEconomia(subtab) {
  ECONOMIA_SUBTABS.forEach(function (t) {
    var id = t === 'resumen' ? 'economiaResumen' : 'economia' + (t.charAt(0).toUpperCase() + t.slice(1));
    var el = document.getElementById(id);
    if (el) el.style.display = t === subtab ? '' : 'none';
  });
  STOCK_SUBTABS.forEach(function (t) {
    var id = 'economia' + (t.charAt(0).toUpperCase() + t.slice(1));
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var economiaTabsEl = document.getElementById('economiaTabs');
  if (economiaTabsEl) economiaTabsEl.querySelectorAll('.economia-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.economiaTab === subtab); });
  if (subtab === 'resumen') renderEconomiaResumen();
  if (subtab === 'gastos') renderGastos();
  if (subtab === 'previsiones') renderPrevisiones();
  if (subtab === 'historial') renderHistorialPedidos();
  if (subtab === 'entregas') renderEntregasMaterial();
  if (subtab === 'financiera') renderEconomiaFinanciera();
}

function mostrarSubpanelStock(subtab) {
  ECONOMIA_SUBTABS.forEach(function (t) {
    var id = t === 'resumen' ? 'economiaResumen' : 'economia' + (t.charAt(0).toUpperCase() + t.slice(1));
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  STOCK_SUBTABS.forEach(function (t) {
    var id = 'economia' + (t.charAt(0).toUpperCase() + t.slice(1));
    var el = document.getElementById(id);
    if (el) el.style.display = t === subtab ? '' : 'none';
  });
  document.querySelectorAll('.stock-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.stockTab === subtab); });
  if (subtab === 'compras') renderComprasPendientes();
  if (subtab === 'inventario') renderInventario();
  if (subtab === 'limites') renderLimitesStock();
  if (subtab === 'almacen') renderAlmacenMateriales();
  if (subtab === 'piezas') renderPreciosPiezas();
}

var REPARTO_BENEFICIOS_STORAGE = 'benny_economia_reparto_beneficios';

function getIngresosTotales() {
  var servicios = typeof getRegistroServicios === 'function' ? getRegistroServicios() : [];
  return servicios.reduce(function (sum, s) { return sum + (parseFloat(s.importe) || 0); }, 0);
}

function getCostesTotales() {
  var compras = typeof getComprasPendientes === 'function' ? getComprasPendientes() : [];
  return compras.filter(function (c) { return (c.estado || '').toLowerCase() === 'recibido'; }).reduce(function (sum, c) {
    return sum + ((parseFloat(c.importeEstimado) || 0) * (parseFloat(c.cantidad) || 1));
  }, 0);
}

function getGastosTotales() {
  var gastos = typeof getGastos === 'function' ? getGastos() : [];
  return gastos.reduce(function (sum, g) { return sum + (parseFloat(g.importe) || 0); }, 0);
}

function getResumenFinancieroTexto() {
  var ingresos = getIngresosTotales();
  var costes = getCostesTotales();
  var gastos = getGastosTotales();
  var ebita = ingresos - costes - gastos;
  var fecha = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  return '📊 **Resumen financiero — SALTLAB Calculator**\n' +
    'Fecha: ' + fecha + '\n\n' +
    '• **Ingresos** (facturado reparaciones/tuneos): ' + ingresos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €\n' +
    '• **Costes** (compras recibidas): ' + costes.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €\n' +
    '• **Gastos** (alquiler, salarios, etc.): ' + gastos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €\n' +
    '• **EBITA taller**: ' + ebita.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function enviarEntregaADiscord(datos) {
  var apiBase = (typeof window.SALTLAB_API_URL !== 'undefined' && window.SALTLAB_API_URL) ? (window.SALTLAB_API_URL + '').replace(/\/$/, '') : '';
  if (!apiBase) return;
  var quien = (datos.entregadoPorNombre || '—').toString().trim();
  var material = (datos.materialLabel || datos.materialConcepto || '—').toString().trim();
  var trabajador = (datos.trabajadorNombre || '—').toString().trim();
  var cantidad = datos.cantidad != null ? Number(datos.cantidad) : 1;
  var unidad = (datos.unidad || 'ud').toString().trim();
  var fecha = datos.fecha ? (function () {
    try { return new Date(datos.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return datos.fecha; }
  })() : '—';
  var content = '🔧 **Entrega de herramientas**\n' +
    '**Entregado por:** ' + quien + '\n' +
    '**Material:** ' + material + '\n' +
    '**Cantidad:** ' + cantidad + ' ' + unidad + '\n' +
    '**Entregado a:** ' + trabajador + '\n' +
    '**Fecha:** ' + fecha;
  fetch(apiBase + '/api/discord-entregas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content })
  }).catch(function () {});
}

function enviarRegistroDiscord() {
  var apiBase = (typeof window.SALTLAB_API_URL !== 'undefined' && window.SALTLAB_API_URL) ? (window.SALTLAB_API_URL + '').replace(/\/$/, '') : '';
  if (!apiBase) {
    alert('No está configurada la URL del backend (SALTLAB_API_URL). Necesitas el servidor en marcha para enviar a Discord.');
    return;
  }
  var btns = document.querySelectorAll('.btn-enviar-registro-discord');
  btns.forEach(function (b) { b.disabled = true; b.textContent = 'Enviando…'; });
  var content = getResumenFinancieroTexto();
  var url = apiBase + '/api/discord-economia';
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content })
  }).then(function (r) {
    if (r.ok) {
      alert('Registro enviado al canal de Discord.');
    } else {
      return r.json().then(function (data) {
        throw new Error(data.error || 'Error ' + r.status);
      }).catch(function () { throw new Error('Error ' + r.status); });
    }
  }).catch(function (e) {
    alert('No se pudo enviar al Discord. ¿Está el servidor (backend) en marcha? ' + (e.message || e));
  }).finally(function () {
    btns.forEach(function (b) { b.disabled = false; b.textContent = 'Enviar registro al canal de Discord'; });
  });
}

function renderEconomiaFinanciera() {
  var container = document.getElementById('economiaFinancieraResumen');
  var textarea = document.getElementById('economiaRepartoBeneficios');
  if (!container) return;
  var ingresos = getIngresosTotales();
  var costes = getCostesTotales();
  var gastos = getGastosTotales();
  var ebita = ingresos - costes - gastos;
  container.innerHTML = '<div class="economia-financiera-grid">' +
    '<div class="economia-financiera-card economia-financiera-ingresos"><span class="economia-financiera-label">Ingresos</span><span class="economia-financiera-value">' + ingresos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €</span><span class="economia-financiera-hint">Total facturado (reparaciones y tuneos)</span></div>' +
    '<div class="economia-financiera-card economia-financiera-costes"><span class="economia-financiera-label">Costes</span><span class="economia-financiera-value">' + costes.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €</span><span class="economia-financiera-hint">Compras recibidas</span></div>' +
    '<div class="economia-financiera-card economia-financiera-gastos"><span class="economia-financiera-label">Gastos</span><span class="economia-financiera-value">' + gastos.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €</span><span class="economia-financiera-hint">Gastos registrados (alquiler, salarios, etc.)</span></div>' +
    '<div class="economia-financiera-card economia-financiera-ebita"><span class="economia-financiera-label">EBITA taller</span><span class="economia-financiera-value">' + ebita.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €</span><span class="economia-financiera-hint">Ingresos − Costes − Gastos</span></div>' +
    '</div>';
  if (textarea) {
    try { textarea.value = localStorage.getItem(REPARTO_BENEFICIOS_STORAGE) || ''; } catch (e) {}
  }
}

function getGastosPorMesesUltimos12() {
  var now = new Date();
  var datos = [];
  for (var i = 11; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var anio = d.getFullYear();
    var mes = d.getMonth() + 1;
    var total = typeof getTotalGastosPorMes === 'function' ? getTotalGastosPorMes(anio, mes) : 0;
    datos.push({ anio: anio, mes: mes, total: total, label: d.toLocaleDateString('es-ES', { month: '2-digit', year: '2-digit' }) });
  }
  return datos;
}

function getGastosPorMesesUltimosN(n) {
  n = Math.max(1, parseInt(n, 10) || 12);
  var now = new Date();
  var datos = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var anio = d.getFullYear();
    var mes = d.getMonth() + 1;
    var total = typeof getTotalGastosPorMes === 'function' ? getTotalGastosPorMes(anio, mes) : 0;
    datos.push({ anio: anio, mes: mes, total: total, label: d.toLocaleDateString('es-ES', { month: '2-digit', year: '2-digit' }) });
  }
  return datos;
}

// ——— Indicadores (panel admin): usan todos los servicios del taller, sincronizados por backend ———
function getServiciosEnPeriodo(periodoMeses) {
  var servicios = typeof getRegistroServicios === 'function' ? getRegistroServicios() : [];
  var n = Math.max(1, parseInt(periodoMeses, 10) || 12);
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - n);
  cutoff.setHours(0, 0, 0, 0);
  return servicios.filter(function (s) {
    if (!s.fecha) return false;
    var d = new Date(s.fecha);
    return d >= cutoff;
  });
}

function getIngresosPorMesFromServicios(servicios, periodoMeses) {
  var byMonth = {};
  servicios.forEach(function (s) {
    if (!s.fecha) return;
    var d = new Date(s.fecha);
    var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!byMonth[key]) byMonth[key] = { total: 0, label: d.toLocaleDateString('es-ES', { month: '2-digit', year: '2-digit' }) };
    byMonth[key].total += parseFloat(s.importe) || 0;
  });
  var n = Math.max(1, parseInt(periodoMeses, 10) || 12);
  var now = new Date();
  var result = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    result.push({ key: key, total: byMonth[key] ? byMonth[key].total : 0, label: d.toLocaleDateString('es-ES', { month: '2-digit', year: '2-digit' }) });
  }
  return result;
}

function getRepTuneoPorMesFromServicios(servicios, periodoMeses) {
  var byMonth = {};
  servicios.forEach(function (s) {
    if (!s.fecha) return;
    var d = new Date(s.fecha);
    var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!byMonth[key]) byMonth[key] = { rep: 0, tuneo: 0, label: d.toLocaleDateString('es-ES', { month: '2-digit', year: '2-digit' }) };
    var t = (s.tipo || '').toLowerCase();
    if (t.indexOf('reparac') !== -1) byMonth[key].rep++;
    else if (t.indexOf('tuneo') !== -1) byMonth[key].tuneo++;
  });
  var n = Math.max(1, parseInt(periodoMeses, 10) || 12);
  var now = new Date();
  var result = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var m = byMonth[key] || { rep: 0, tuneo: 0, label: d.toLocaleDateString('es-ES', { month: '2-digit', year: '2-digit' }) };
    result.push({ key: key, rep: m.rep, tuneo: m.tuneo, label: m.label });
  }
  return result;
}

function getServiciosPorEmpleadoFromServicios(servicios) {
  var byEmp = {};
  servicios.forEach(function (s) {
    var emp = (s.empleado || s.userId || '—').toString().trim() || '—';
    if (!byEmp[emp]) byEmp[emp] = { count: 0, ingresos: 0 };
    byEmp[emp].count++;
    byEmp[emp].ingresos += parseFloat(s.importe) || 0;
  });
  return Object.keys(byEmp).map(function (e) { return { empleado: e, count: byEmp[e].count, ingresos: byEmp[e].ingresos }; }).sort(function (a, b) { return b.count - a.count; });
}

function renderIndicadoresChartLine(containerId, datos, valueKey, color) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!datos || datos.length === 0) {
    container.innerHTML = '<p class="indicadores-chart-empty">Sin datos para el periodo seleccionado.</p>';
    return;
  }
  var values = datos.map(function (d) { return d[valueKey] != null ? Number(d[valueKey]) : 0; });
  var maxVal = Math.max(1, Math.max.apply(null, values));
  var padding = { top: 20, right: 20, bottom: 32, left: 48 };
  var w = Math.max(280, (container.parentElement && container.parentElement.offsetWidth) || 400) - padding.left - padding.right;
  var h = 180;
  var xs = datos.length > 1 ? w / (datos.length - 1) : w;
  var scaleY = maxVal > 0 ? h / maxVal : 1;
  var points = datos.map(function (d, i) {
    var x = padding.left + i * xs;
    var y = padding.top + h - (d[valueKey] != null ? Number(d[valueKey]) : 0) * scaleY;
    return x + ',' + y;
  }).join(' ');
  var pathLine = 'M ' + points.replace(/ /g, ' L ');
  var pathArea = pathLine + ' L ' + (padding.left + (datos.length - 1) * xs) + ',' + (padding.top + h) + ' L ' + padding.left + ',' + (padding.top + h) + ' Z';
  var gridLines = [];
  for (var g = 0; g <= 5; g++) {
    var gy = padding.top + h - (h * g / 5);
    gridLines.push('<line x1="' + padding.left + '" y1="' + gy + '" x2="' + (padding.left + w) + '" y2="' + gy + '" class="economia-chart-grid"/>');
  }
  var yLabels = [];
  for (var l = 0; l <= 5; l++) {
    var val = Math.round(maxVal * (5 - l) / 5);
    var ly = padding.top + h * l / 5;
    yLabels.push('<text x="' + (padding.left - 6) + '" y="' + (ly + 4) + '" class="economia-chart-axis">' + val.toLocaleString('es-ES') + '</text>');
  }
  var xLabels = datos.map(function (d, i) {
    var x = padding.left + i * xs;
    return '<text x="' + x + '" y="' + (padding.top + h + 22) + '" class="economia-chart-axis economia-chart-axis-x">' + (d.label || '') + '</text>';
  }).join('');
  var circles = datos.map(function (d, i) {
    var x = padding.left + i * xs;
    var y = padding.top + h - (d[valueKey] != null ? Number(d[valueKey]) : 0) * scaleY;
    return '<circle cx="' + x + '" cy="' + y + '" r="4" class="economia-chart-dot"/>';
  }).join('');
  var fillColor = color || 'var(--accent, #d4af37)';
  container.innerHTML = '<svg class="economia-chart-svg indicadores-chart-svg" viewBox="0 0 ' + (padding.left + w + padding.right) + ' ' + (padding.top + h + padding.bottom) + '" preserveAspectRatio="xMidYMid meet">' +
    '<path d="' + pathArea + '" class="economia-chart-area" style="fill:' + fillColor + ';opacity:0.2"/>' +
    gridLines.join('') +
    '<path d="' + pathLine + '" class="economia-chart-line" style="stroke:' + fillColor + '" fill="none"/>' +
    circles +
    yLabels.join('') + xLabels +
    '</svg>';
}

function renderIndicadoresChartRepTuneo(containerId, datos) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!datos || datos.length === 0) {
    container.innerHTML = '<p class="indicadores-chart-empty">Sin datos para el periodo seleccionado.</p>';
    return;
  }
  var maxVal = Math.max(1, Math.max.apply(null, datos.map(function (d) { return d.rep + d.tuneo; })));
  var padding = { top: 20, right: 20, bottom: 32, left: 48 };
  var w = Math.max(280, (container.parentElement && container.parentElement.offsetWidth) || 400) - padding.left - padding.right;
  var h = 180;
  var barW = Math.max(4, (w / datos.length) * 0.35);
  var gap = (w / datos.length - barW) / 2;
  var scaleY = maxVal > 0 ? h / maxVal : 1;
  var bars = [];
  datos.forEach(function (d, i) {
    var x0 = padding.left + i * (w / datos.length) + gap;
    var hRep = d.rep * scaleY;
    var hTuneo = d.tuneo * scaleY;
    bars.push('<rect x="' + x0 + '" y="' + (padding.top + h - hRep) + '" width="' + (barW / 2) + '" height="' + hRep + '" class="indicadores-bar" style="fill:#e11d48"/>');
    bars.push('<rect x="' + (x0 + barW / 2) + '" y="' + (padding.top + h - hTuneo) + '" width="' + (barW / 2) + '" height="' + hTuneo + '" class="indicadores-bar" style="fill:#22c55e"/>');
  });
  var xLabels = datos.map(function (d, i) {
    var x = padding.left + (i + 0.5) * (w / datos.length);
    return '<text x="' + x + '" y="' + (padding.top + h + 22) + '" class="economia-chart-axis economia-chart-axis-x">' + (d.label || '') + '</text>';
  }).join('');
  container.innerHTML = '<svg class="economia-chart-svg indicadores-chart-svg" viewBox="0 0 ' + (padding.left + w + padding.right) + ' ' + (padding.top + h + padding.bottom) + '" preserveAspectRatio="xMidYMid meet">' +
    bars.join('') + xLabels +
    '<text x="' + (padding.left + w + 8) + '" y="' + (padding.top + 12) + '" class="economia-chart-axis" style="fill:#e11d48">Rep.</text>' +
    '<text x="' + (padding.left + w + 8) + '" y="' + (padding.top + 28) + '" class="economia-chart-axis" style="fill:#22c55e">Tuneo</text>' +
    '</svg>';
}

function renderIndicadoresChartBarras(containerId, items, labelKey, valueKey, color) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="indicadores-chart-empty">Sin datos para el periodo seleccionado.</p>';
    return;
  }
  var maxVal = Math.max(1, Math.max.apply(null, items.map(function (d) { return Number(d[valueKey]) || 0; })));
  var padding = { top: 20, right: 20, bottom: 40, left: 80 };
  var w = Math.max(280, (container.parentElement && container.parentElement.offsetWidth) || 400) - padding.left - padding.right;
  var h = 180;
  var barH = Math.max(8, (h / items.length) * 0.7);
  var gap = (h / items.length - barH) / 2;
  var scaleX = maxVal > 0 ? (w / maxVal) : 1;
  var bars = [];
  var labels = [];
  items.forEach(function (d, i) {
    var val = Number(d[valueKey]) || 0;
    var barW = val * scaleX;
    var y0 = padding.top + i * (h / items.length) + gap;
    bars.push('<rect x="' + padding.left + '" y="' + y0 + '" width="' + barW + '" height="' + barH + '" class="indicadores-bar" style="fill:' + (color || 'var(--accent)') + '"/>');
    labels.push('<text x="' + (padding.left - 6) + '" y="' + (y0 + barH / 2 + 4) + '" class="economia-chart-axis" text-anchor="end">' + escapeHtml(String(d[labelKey] || '—').substring(0, 12)) + '</text>');
  });
  container.innerHTML = '<svg class="economia-chart-svg indicadores-chart-svg" viewBox="0 0 ' + (padding.left + w + padding.right) + ' ' + (padding.top + h + padding.bottom) + '" preserveAspectRatio="xMidYMid meet">' +
    bars.join('') + labels.join('') +
    '</svg>';
}

function renderIndicadoresPanel() {
  var periodo = (document.getElementById('indicadoresPeriodo') && document.getElementById('indicadoresPeriodo').value) || '12';
  var incluirRep = document.getElementById('indicadoresIncluirRep');
  var incluirTuneo = document.getElementById('indicadoresIncluirTuneo');
  var incluirIngresos = document.getElementById('indicadoresIncluirIngresos');
  var incluirEmpleados = document.getElementById('indicadoresIncluirEmpleados');
  var chkIngresos = document.getElementById('indicadoresChartIngresos');
  var chkRepTuneo = document.getElementById('indicadoresChartRepTuneo');
  var chkEmpleados = document.getElementById('indicadoresChartEmpleados');
  var chkGastos = document.getElementById('indicadoresChartGastos');

  var servicios = getServiciosEnPeriodo(periodo);
  var incluirRepVal = incluirRep && incluirRep.checked;
  var incluirTuneoVal = incluirTuneo && incluirTuneo.checked;
  var serviciosFiltrados = servicios.filter(function (s) {
    var t = (s.tipo || '').toLowerCase();
    if (t.indexOf('reparac') !== -1) return incluirRepVal;
    if (t.indexOf('tuneo') !== -1) return incluirTuneoVal;
    return true;
  });

  var totalIngresos = serviciosFiltrados.reduce(function (sum, s) { return sum + (parseFloat(s.importe) || 0); }, 0);
  var totalRep = serviciosFiltrados.filter(function (s) { return (s.tipo || '').toLowerCase().indexOf('reparac') !== -1; }).length;
  var totalTuneo = serviciosFiltrados.filter(function (s) { return (s.tipo || '').toLowerCase().indexOf('tuneo') !== -1; }).length;
  var porEmpleado = getServiciosPorEmpleadoFromServicios(serviciosFiltrados);
  var empleadoTop = porEmpleado.length > 0 ? porEmpleado[0].empleado : '—';

  var kpisEl = document.getElementById('indicadoresKpis');
  if (kpisEl) {
    kpisEl.innerHTML = '<div class="indicadores-kpi"><span class="indicadores-kpi-label">Total ingresos</span><span class="indicadores-kpi-value">' + totalIngresos.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</span></div>' +
      '<div class="indicadores-kpi"><span class="indicadores-kpi-label">Reparaciones</span><span class="indicadores-kpi-value">' + totalRep + '</span></div>' +
      '<div class="indicadores-kpi"><span class="indicadores-kpi-label">Tuneos</span><span class="indicadores-kpi-value">' + totalTuneo + '</span></div>' +
      '<div class="indicadores-kpi"><span class="indicadores-kpi-label">Empleado con más servicios</span><span class="indicadores-kpi-value">' + escapeHtml(empleadoTop) + '</span></div>';
  }

  var ingresosPorMes = incluirIngresos && incluirIngresos.checked ? getIngresosPorMesFromServicios(serviciosFiltrados, periodo) : [];
  var repTuneoPorMes = getRepTuneoPorMesFromServicios(serviciosFiltrados, periodo);
  var gastosDatos = getGastosPorMesesUltimosN(periodo);

  var wrapIngresos = document.getElementById('indicadoresChartIngresosWrap');
  var wrapRepTuneo = document.getElementById('indicadoresChartRepTuneoWrap');
  var wrapEmpleados = document.getElementById('indicadoresChartEmpleadosWrap');
  var wrapGastos = document.getElementById('indicadoresChartGastosWrap');

  if (wrapIngresos) wrapIngresos.style.display = (chkIngresos && chkIngresos.checked) ? '' : 'none';
  if (wrapRepTuneo) wrapRepTuneo.style.display = (chkRepTuneo && chkRepTuneo.checked) ? '' : 'none';
  if (wrapEmpleados) wrapEmpleados.style.display = (chkEmpleados && chkEmpleados.checked && incluirEmpleados && incluirEmpleados.checked) ? '' : 'none';
  if (wrapGastos) wrapGastos.style.display = (chkGastos && chkGastos.checked) ? '' : 'none';

  if (chkIngresos && chkIngresos.checked) renderIndicadoresChartLine('indicadoresChartIngresosContainer', ingresosPorMes, 'total', '#22c55e');
  if (chkRepTuneo && chkRepTuneo.checked) renderIndicadoresChartRepTuneo('indicadoresChartRepTuneoContainer', repTuneoPorMes);
  if (chkEmpleados && chkEmpleados.checked && incluirEmpleados && incluirEmpleados.checked) renderIndicadoresChartBarras('indicadoresChartEmpleadosContainer', porEmpleado.slice(0, 10), 'empleado', 'count', '#3b82f6');
  if (chkGastos && chkGastos.checked) renderIndicadoresChartLine('indicadoresChartGastosContainer', gastosDatos, 'total', '#e11d48');
}

function vincularIndicadoresPanel() {
  var btn = document.getElementById('indicadoresGenerar');
  if (btn) btn.addEventListener('click', function () { if (typeof renderIndicadoresPanel === 'function') renderIndicadoresPanel(); });
}

function renderEconomiaChartInto(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var datos = getGastosPorMesesUltimos12();
  var maxVal = Math.max(1, Math.max.apply(null, datos.map(function (d) { return d.total; })));
  var padding = { top: 20, right: 20, bottom: 32, left: 48 };
  var w = Math.max(320, (container.parentElement && container.parentElement.offsetWidth) || 400) - padding.left - padding.right;
  var h = 200;
  var xs = w / Math.max(1, datos.length - 1);
  var scaleY = maxVal > 0 ? (h / maxVal) : 1;
  var points = datos.map(function (d, i) {
    var x = padding.left + i * xs;
    var y = padding.top + h - d.total * scaleY;
    return x + ',' + y;
  }).join(' ');
  var pathLine = 'M ' + points.replace(/ /g, ' L ');
  var pathArea = pathLine + ' L ' + (padding.left + (datos.length - 1) * xs) + ',' + (padding.top + h) + ' L ' + padding.left + ',' + (padding.top + h) + ' Z';
  var gridLines = [];
  for (var g = 0; g <= 5; g++) {
    var gy = padding.top + h - (h * g / 5);
    gridLines.push('<line x1="' + padding.left + '" y1="' + gy + '" x2="' + (padding.left + w) + '" y2="' + gy + '" class="economia-chart-grid"/>');
  }
  var yLabels = [];
  for (var l = 0; l <= 5; l++) {
    var val = Math.round(maxVal * (5 - l) / 5);
    var ly = padding.top + h * l / 5;
    yLabels.push('<text x="' + (padding.left - 6) + '" y="' + (ly + 4) + '" class="economia-chart-axis">' + val.toLocaleString('es-ES') + '</text>');
  }
  var xLabels = datos.map(function (d, i) {
    var x = padding.left + i * xs;
    return '<text x="' + x + '" y="' + (padding.top + h + 22) + '" class="economia-chart-axis economia-chart-axis-x">' + d.label + '</text>';
  }).join('');
  var circles = datos.map(function (d, i) {
    var x = padding.left + i * xs;
    var y = padding.top + h - d.total * scaleY;
    return '<circle cx="' + x + '" cy="' + y + '" r="4" class="economia-chart-dot"/>';
  }).join('');
  container.innerHTML = '<svg class="economia-chart-svg" viewBox="0 0 ' + (padding.left + w + padding.right) + ' ' + (padding.top + h + padding.bottom) + '" preserveAspectRatio="xMidYMid meet">' +
    '<path d="' + pathArea + '" class="economia-chart-area"/>' +
    gridLines.join('') +
    '<path d="' + pathLine + '" class="economia-chart-line" fill="none"/>' +
    circles +
    yLabels.join('') + xLabels +
    '</svg>';
}

function renderEconomiaChart() {
  renderEconomiaChartInto('economiaChartContainer');
}

var DASHBOARD_STATS_COLORS = [
  '#b01a1a',
  '#d4af37',
  '#2d7a4f',
  '#008080',
  '#6366f1'
];

function renderMainDashboardStatsLines() {
  var container = document.getElementById('mainDashboardStatsLinesInner');
  if (!container) return;
  var s = typeof getStatsGeneralesTaller === 'function' ? getStatsGeneralesTaller() : { totalReparaciones: 0, mecanicoTop: '—', dineroGenerado: 0, totalPiezas: 0, totalTuneos: 0 };
  var dineroEscala = Math.max(1, Math.floor(s.dineroGenerado / 10000));
  var maxVal = Math.max(1, s.totalReparaciones, s.totalPiezas, s.totalTuneos, dineroEscala);
  var rows = [
    { label: 'Reparaciones totales', value: s.totalReparaciones, num: s.totalReparaciones, color: DASHBOARD_STATS_COLORS[0] },
    { label: 'Mecánico que más reparó', value: s.mecanicoTop, num: 1, color: DASHBOARD_STATS_COLORS[1], noBar: true },
    { label: 'Generado para el taller', value: s.dineroGenerado > 0 ? '$' + s.dineroGenerado.toLocaleString('es-ES') : '—', num: dineroEscala, color: DASHBOARD_STATS_COLORS[2], noBar: true },
    { label: 'Total piezas aplicadas', value: s.totalPiezas, num: s.totalPiezas, color: DASHBOARD_STATS_COLORS[3] },
    { label: 'Tuneos realizados', value: s.totalTuneos, num: s.totalTuneos, color: DASHBOARD_STATS_COLORS[4] }
  ];
  var html = '';
  rows.forEach(function (r, idx) {
    var pct = r.isText ? 100 : Math.min(100, (r.num / maxVal) * 100);
    var valueClass = 'dashboard-stat-line-value' + (idx === 2 ? ' stat-money' : '');
    var lineClass = 'dashboard-stat-line' + (r.noBar ? ' dashboard-stat-line-no-bar' : '');
    html += '<div class="' + lineClass + '" style="--stat-color:' + r.color + '">';
    html += '<span class="dashboard-stat-line-label">' + escapeHtml(r.label) + '</span>';
    if (!r.noBar) {
      html += '<div class="dashboard-stat-line-bar-wrap"><div class="dashboard-stat-line-bar" style="width:' + pct + '%"></div></div>';
    }
    html += '<span class="' + valueClass + '">' + (typeof r.value === 'number' ? r.value : escapeHtml(String(r.value))) + '</span>';
    html += '</div>';
  });
  container.innerHTML = html || '<p class="dashboard-stats-empty">Sin datos</p>';
}

function renderMainDashboard() {
  var bar = document.getElementById('mainDashboardBar');
  if (!bar) return;
  var comprasPend = typeof getNecesidadesReposicion === 'function' ? getNecesidadesReposicion().length : 0;
  var empleados = typeof getUsers === 'function' ? getUsers().filter(function (u) { return u.activo !== false; }).length : 0;
  var now = new Date();
  var gastosMes = typeof getTotalGastosPorMes === 'function' ? getTotalGastosPorMes(now.getFullYear(), now.getMonth() + 1) : 0;
  var totalMat = typeof getTotalMateriales === 'function' ? getTotalMateriales() : 0;
  var kpiMateriales = document.getElementById('mainKpiMaterialesValor');
  var kpiMaterialesWrap = document.getElementById('mainKpiTotalMateriales');
  var kpiCompras = document.getElementById('mainKpiCompras');
  var kpiEmpleados = document.getElementById('mainKpiEmpleados');
  var kpiGastos = document.getElementById('mainKpiGastos');
  if (kpiMateriales) kpiMateriales.textContent = totalMat.toLocaleString('es-ES');
  if (kpiMaterialesWrap) {
    kpiMaterialesWrap.style.cursor = 'pointer';
    kpiMaterialesWrap.title = 'Clic para ver detalle por tipo de material';
    kpiMaterialesWrap.onclick = function () {
      if (typeof renderDetalleMaterialesAlmacenModal === 'function') renderDetalleMaterialesAlmacenModal();
      var modal = document.getElementById('modalDetalleMaterialesAlmacen');
      if (modal) modal.classList.add('active');
    };
  }
  if (kpiCompras) kpiCompras.textContent = comprasPend;
  if (kpiEmpleados) kpiEmpleados.textContent = empleados;
  if (kpiGastos) kpiGastos.textContent = gastosMes.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
  renderEconomiaChartInto('mainEconomiaChartContainer');
  renderMainDashboardStatsLines();
}

function renderEconomiaResumen() {
  var dashboardBar = document.getElementById('economiaDashboardBar');
  if (dashboardBar) {
    var comprasPend = typeof getNecesidadesReposicion === 'function' ? getNecesidadesReposicion().length : 0;
    var empleados = typeof getUsers === 'function' ? getUsers().filter(function (u) { return u.activo !== false; }).length : 0;
    var now = new Date();
    var gastosMes = typeof getTotalGastosPorMes === 'function' ? getTotalGastosPorMes(now.getFullYear(), now.getMonth() + 1) : 0;
    var totalMat = typeof getTotalMateriales === 'function' ? getTotalMateriales() : 0;
    var kpiCompras = document.getElementById('economiaKpiCompras');
    var kpiEmpleados = document.getElementById('economiaKpiEmpleados');
    var kpiGastos = document.getElementById('economiaKpiGastos');
    var kpiMateriales = document.getElementById('economiaKpiMaterialesValor');
    var kpiMaterialesWrap = document.getElementById('economiaKpiTotalMateriales');
    if (kpiCompras) kpiCompras.textContent = comprasPend;
    if (kpiEmpleados) kpiEmpleados.textContent = empleados;
    if (kpiGastos) kpiGastos.textContent = gastosMes.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
    if (kpiMateriales) kpiMateriales.textContent = totalMat.toLocaleString('es-ES');
    if (kpiMaterialesWrap) {
      kpiMaterialesWrap.style.cursor = 'pointer';
      kpiMaterialesWrap.title = 'Ver detalle por tipo de material';
      kpiMaterialesWrap.onclick = function () {
        if (typeof renderDetalleMaterialesAlmacenModal === 'function') renderDetalleMaterialesAlmacenModal();
        var modal = document.getElementById('modalDetalleMaterialesAlmacen');
        if (modal) modal.classList.add('active');
      };
    }
  }
  renderEconomiaChart();
  var cardsEl = document.getElementById('economiaResumenCards');
  var alertasEl = document.getElementById('economiaResumenAlertas');
  if (!cardsEl) return;
  var compras = typeof getComprasPendientes === 'function' ? getComprasPendientes() : [];
  var pendientes = compras.filter(function (c) { return (c.estado || 'pendiente') !== 'recibido'; });
  var totalComprasEst = pendientes.reduce(function (s, c) { return s + (c.importeEstimado || 0) * (c.cantidad || 1); }, 0);
  var now = new Date();
  var anio = now.getFullYear();
  var mes = now.getMonth() + 1;
  var gastosMes = typeof getTotalGastosPorMes === 'function' ? getTotalGastosPorMes(anio, mes) : 0;
  var previsionMes = typeof getPrevisionMes === 'function' ? getPrevisionMes(anio, mes) : {};
  var totalPrevisionMes = 0;
  if (typeof CATEGORIA_GASTO !== 'undefined' && Array.isArray(CATEGORIA_GASTO)) {
    CATEGORIA_GASTO.forEach(function (cat) { totalPrevisionMes += parseFloat(previsionMes[cat.id] || 0) || 0; });
  }
  var alertas = typeof getInventarioAlertaBajoStock === 'function' ? getInventarioAlertaBajoStock() : [];
  cardsEl.innerHTML =
    '<div class="economia-card"><div class="economia-card-value">' + (pendientes.length) + '</div><div class="economia-card-label">Compras pendientes</div></div>' +
    '<div class="economia-card"><div class="economia-card-value">' + totalComprasEst.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</div><div class="economia-card-label">Importe estimado compras</div></div>' +
    '<div class="economia-card"><div class="economia-card-value">' + totalPrevisionMes.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</div><div class="economia-card-label">Previsión del mes</div></div>' +
    '<div class="economia-card economia-card-real"><div class="economia-card-value">' + gastosMes.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</div><div class="economia-card-label">Gasto real del mes</div></div>';
  if (alertasEl) {
    var partes = [];
    if (totalPrevisionMes > 0 || gastosMes > 0) {
      var diff = gastosMes - totalPrevisionMes;
      var diffText = diff === 0 ? 'Previsión y gasto real coinciden.' : (diff > 0 ? 'Gasto real +' + diff.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' € sobre previsión.' : 'Gasto real ' + diff.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' € (por debajo de la previsión).');
      partes.push('<p class="economia-comparativa"><strong>Previsión vs real:</strong> ' + diffText + '</p>');
    }
    if (alertas.length === 0 && partes.length === 0) { alertasEl.innerHTML = '<p class="economia-sin-alertas">Sin alertas de stock bajo.</p>'; }
    else if (alertas.length > 0) {
      partes.push('<h4>Alertas de stock bajo</h4><ul class="economia-alertas-list">' + alertas.map(function (a) {
        return '<li><strong>' + escapeHtml(a.nombre) + '</strong> — ' + (a.cantidad || 0) + ' ' + (a.unidad || 'ud') + ' (mín. ' + (a.stockMinimo || 0) + ')</li>';
      }).join('') + '</ul>');
      alertasEl.innerHTML = partes.join('');
    } else { alertasEl.innerHTML = partes.join(''); }
  }
}

function renderComprasPendientes() {
  var listNeces = document.getElementById('listaNecesidadesReposicion');
  if (listNeces && typeof getNecesidadesReposicion === 'function') {
    var necesidades = getNecesidadesReposicion();
    if (necesidades.length === 0) {
      listNeces.innerHTML = '<li class="economia-necesidades-empty">Ningún producto por debajo del mínimo. Define mínimos en <strong>Límites de stock</strong>.</li>';
    } else {
      listNeces.innerHTML = necesidades.map(function (n) {
        return '<li><strong>' + escapeHtml(n.conceptoLabel) + '</strong> — Actual: ' + n.cantidadActual + ', Mín: ' + n.stockMinimo + (n.stockMaximo != null ? ', Máx: ' + n.stockMaximo : '') + ' → <em>Comprar ' + n.cantidadAComprar + ' ' + (n.unidad || 'ud') + '</em></li>';
      }).join('');
    }
  }
  var tbody = document.getElementById('listaComprasPendientes');
  if (!tbody || typeof getComprasPendientes !== 'function') return;
  var list = getComprasPendientes();
  var q = (document.getElementById('filtroEconomiaCompras') && document.getElementById('filtroEconomiaCompras').value) || '';
  if (q) {
    q = q.trim().toLowerCase();
    list = list.filter(function (c) {
      var catStr = typeof getCategoriaInventarioLabel === 'function' ? getCategoriaInventarioLabel(c.categoria) : (c.categoria || '');
      var texto = [c.concepto, catStr, (typeof ESTADO_COMPRA !== 'undefined' ? (ESTADO_COMPRA.find(function (x) { return x.id === c.estado; }) || {}).nombre : '')].join(' ').toLowerCase();
      return texto.indexOf(q) !== -1;
    });
  }
  var categorias = (typeof CATEGORIA_INVENTARIO !== 'undefined' ? CATEGORIA_INVENTARIO : []).reduce(function (o, c) { o[c.id] = (c.grupo ? c.grupo + ' · ' : '') + (c.nombre || c.id); return o; }, {});
  var estados = (typeof ESTADO_COMPRA !== 'undefined' ? ESTADO_COMPRA : []).reduce(function (o, c) { o[c.id] = c.nombre; return o; }, {});
  tbody.innerHTML = '';
  list.forEach(function (c) {
    var tr = document.createElement('tr');
    var fecha = c.fecha ? new Date(c.fecha).toLocaleDateString('es-ES') : '—';
    var importe = ((c.importeEstimado || 0) * (c.cantidad || 1)).toFixed(2);
    tr.innerHTML = '<td>' + escapeHtml(fecha) + '</td><td>' + escapeHtml(c.concepto || '—') + '</td><td>' + escapeHtml(categorias[c.categoria] || c.categoria) + '</td><td>' + (c.cantidad || 0) + ' ' + (c.unidad || '') + '</td><td>' + importe + ' €</td><td>' + escapeHtml(estados[c.estado] || c.estado) + '</td><td><button type="button" class="btn btn-outline btn-sm btn-edit-compra" data-id="' + escapeHtmlAttr(c.id) + '">Editar</button> <button type="button" class="btn btn-outline btn-sm btn-del-compra" data-id="' + escapeHtmlAttr(c.id) + '">Eliminar</button></td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-edit-compra').forEach(function (btn) { btn.addEventListener('click', function () { abrirModalCompra(this.getAttribute('data-id')); }); });
  tbody.querySelectorAll('.btn-del-compra').forEach(function (btn) { btn.addEventListener('click', function () { var id = btn.getAttribute('data-id'); if (id && confirm('¿Eliminar esta compra?')) { if (typeof removeCompra === 'function') removeCompra(id); renderComprasPendientes(); renderEconomiaResumen(); } }); });
}

function renderHistorialPedidos() {
  var tbody = document.getElementById('listaHistorialPedidos');
  var filtroTipo = document.getElementById('filtroHistorialTipo');
  var filtroCategoria = document.getElementById('filtroHistorialCategoria');
  if (!tbody || typeof getComprasPendientes !== 'function') return;
  var list = getComprasPendientes();
  var tipoVal = (filtroTipo && filtroTipo.value) ? filtroTipo.value.trim() : '';
  if (tipoVal) list = list.filter(function (c) { return (c.estado || 'pendiente') === tipoVal; });
  var catVal = (filtroCategoria && filtroCategoria.value) ? filtroCategoria.value.trim() : '';
  if (catVal) {
    var catIdToGroup = (typeof CATEGORIA_INVENTARIO !== 'undefined' ? CATEGORIA_INVENTARIO : []).reduce(function (o, cat) { o[cat.id] = cat.grupo || ''; return o; }, {});
    list = list.filter(function (c) { return (catIdToGroup[c.categoria] || '') === catVal; });
  }
  var categorias = (typeof CATEGORIA_INVENTARIO !== 'undefined' ? CATEGORIA_INVENTARIO : []).reduce(function (o, c) { o[c.id] = (c.grupo ? c.grupo + ' · ' : '') + (c.nombre || c.id); return o; }, {});
  var estados = (typeof ESTADO_COMPRA !== 'undefined' ? ESTADO_COMPRA : []).reduce(function (o, c) { o[c.id] = c.nombre; return o; }, {});
  tbody.innerHTML = '';
  list.forEach(function (c) {
    var tr = document.createElement('tr');
    var fecha = c.fecha ? new Date(c.fecha).toLocaleDateString('es-ES') : '—';
    var importe = ((c.importeEstimado || 0) * (c.cantidad || 1)).toFixed(2);
    tr.innerHTML = '<td>' + escapeHtml(fecha) + '</td><td>' + escapeHtml(c.concepto || '—') + '</td><td>' + escapeHtml(categorias[c.categoria] || c.categoria) + '</td><td>' + (c.cantidad || 0) + ' ' + (c.unidad || '') + '</td><td>' + importe + ' €</td><td>' + escapeHtml(estados[c.estado] || c.estado) + '</td><td><button type="button" class="btn btn-outline btn-sm btn-ver-pedido" data-id="' + escapeHtmlAttr(c.id) + '">Ver</button></td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-ver-pedido').forEach(function (btn) {
    btn.addEventListener('click', function () { abrirModalDetallePedido(this.getAttribute('data-id')); });
  });
}

function abrirModalDetallePedido(id) {
  var modal = document.getElementById('modalDetallePedido');
  var contenido = document.getElementById('detallePedidoContenido');
  if (!modal || !contenido || !id || typeof getComprasPendientes !== 'function') return;
  var compras = getComprasPendientes();
  var c = compras.find(function (x) { return x.id === id; });
  if (!c) return;
  var categorias = (typeof CATEGORIA_INVENTARIO !== 'undefined' ? CATEGORIA_INVENTARIO : []).reduce(function (o, c) { o[c.id] = (c.grupo ? c.grupo + ' · ' : '') + (c.nombre || c.id); return o; }, {});
  var estados = (typeof ESTADO_COMPRA !== 'undefined' ? ESTADO_COMPRA : []).reduce(function (o, e) { o[e.id] = e.nombre; return o; }, {});
  var fecha = c.fecha ? new Date(c.fecha).toLocaleString('es-ES') : '—';
  var importeTotal = ((c.importeEstimado || 0) * (c.cantidad || 1)).toFixed(2);
  contenido.innerHTML =
    '<div class="detalle-pedido-row"><strong>Fecha:</strong> ' + escapeHtml(fecha) + '</div>' +
    '<div class="detalle-pedido-row"><strong>Concepto:</strong> ' + escapeHtml(c.concepto || '—') + '</div>' +
    '<div class="detalle-pedido-row"><strong>Categoría:</strong> ' + escapeHtml(categorias[c.categoria] || c.categoria) + '</div>' +
    '<div class="detalle-pedido-row"><strong>Cantidad:</strong> ' + (c.cantidad || 0) + ' ' + (c.unidad || 'ud') + '</div>' +
    '<div class="detalle-pedido-row"><strong>Importe unit. estimado:</strong> ' + (c.importeEstimado || 0).toFixed(2) + ' €</div>' +
    '<div class="detalle-pedido-row"><strong>Importe total est.:</strong> ' + importeTotal + ' €</div>' +
    '<div class="detalle-pedido-row"><strong>Solicitado por:</strong> ' + escapeHtml(c.solicitadoPor || '—') + '</div>' +
    '<div class="detalle-pedido-row"><strong>Estado:</strong> ' + escapeHtml(estados[c.estado] || c.estado) + '</div>' +
    (c.notas ? '<div class="detalle-pedido-row"><strong>Notas:</strong> ' + escapeHtml(c.notas) + '</div>' : '');
  modal.setAttribute('data-detalle-compra-id', id);
  modal.classList.add('active');
}

function repetirCompra(id) {
  if (!id || typeof getComprasPendientes !== 'function' || typeof addCompra !== 'function') return;
  var compras = getComprasPendientes();
  var c = compras.find(function (x) { return x.id === id; });
  if (!c) return;
  addCompra({
    concepto: c.concepto,
    categoria: c.categoria,
    cantidad: c.cantidad,
    unidad: c.unidad,
    importeEstimado: c.importeEstimado,
    solicitadoPor: c.solicitadoPor,
    notas: c.notas
  });
  var modal = document.getElementById('modalDetallePedido');
  if (modal) modal.classList.remove('active');
  if (typeof renderComprasPendientes === 'function') renderComprasPendientes();
  if (typeof renderHistorialPedidos === 'function') renderHistorialPedidos();
  if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
  alert('Pedido duplicado. Se ha creado un nuevo pedido con estado Pendiente.');
}

function renderEntregasMaterial() {
  var tbody = document.getElementById('listaEntregasMaterial');
  if (!tbody) return;
  if (typeof getEntregasMaterial !== 'function') {
    tbody.innerHTML = '<tr><td colspan="7" class="economia-empty-hint">Sin datos de entregas.</td></tr>';
    return;
  }
  var list = getEntregasMaterial();
  var q = (document.getElementById('filtroEntregasMaterial') && document.getElementById('filtroEntregasMaterial').value) || '';
  if (q) {
    q = q.trim().toLowerCase();
    list = list.filter(function (e) {
      var texto = [(e.trabajadorNombre || ''), (e.materialLabel || ''), (e.materialConcepto || ''), (e.entregadoPorNombre || '')].join(' ').toLowerCase();
      return texto.indexOf(q) !== -1;
    });
  }
  tbody.innerHTML = '';
  list.forEach(function (e) {
    var tr = document.createElement('tr');
    var fecha = e.fecha ? new Date(e.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    tr.innerHTML = '<td>' + escapeHtml(fecha) + '</td><td>' + escapeHtml(e.trabajadorNombre || '—') + '</td><td>' + escapeHtml(e.materialLabel || e.materialConcepto || '—') + '</td><td>' + (e.cantidad || 0) + '</td><td>' + escapeHtml(e.unidad || 'ud') + '</td><td>' + escapeHtml(e.entregadoPorNombre || '—') + '</td><td></td>';
    tbody.appendChild(tr);
  });
  if (list.length === 0) tbody.innerHTML = '<tr><td colspan="7" class="economia-empty-hint">No hay entregas registradas.</td></tr>';
}

function renderAlmacenMateriales() {
  if (typeof getAlmacenMateriales !== 'function' || typeof TIPOS_MATERIAL_ALMACEN === 'undefined') return;
  var tbody = document.getElementById('listaAlmacenMateriales');
  var tbodyMov = document.getElementById('listaAlmacenMovimientos');
  var stock = getAlmacenMateriales();
  if (tbody) {
    tbody.innerHTML = '';
    TIPOS_MATERIAL_ALMACEN.forEach(function (t) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-almacen-material-id', t.id);
      var q = stock[t.id] != null ? stock[t.id] : 0;
      tr.innerHTML =
        '<td>' + escapeHtml(t.nombre) + '</td>' +
        '<td>' + escapeHtml(t.unidad) + '</td>' +
        '<td class="almacen-detalle-cant almacen-cantidad-actual">' + Number(q).toLocaleString('es-ES') + '</td>' +
        '<td><input type="number" class="almacen-input-aportaciones" min="0" step="1" value="0" data-material-id="' + escapeHtmlAttr(t.id) + '" placeholder="0" inputmode="numeric" aria-label="Aportaciones ' + escapeHtmlAttr(t.nombre) + '"></td>' +
        '<td><input type="number" class="almacen-input-retiradas" min="0" step="1" value="0" data-material-id="' + escapeHtmlAttr(t.id) + '" placeholder="0" inputmode="numeric" aria-label="Retiradas ' + escapeHtmlAttr(t.nombre) + '"></td>' +
        '<td class="almacen-acciones-cel">' +
          '<button type="button" class="btn btn-outline btn-sm almacen-btn-aplicar" data-material-id="' + escapeHtmlAttr(t.id) + '" title="Aplicar aportaciones y retiradas">Aplicar</button> ' +
          '<button type="button" class="btn btn-outline btn-sm almacen-btn-reset" data-material-id="' + escapeHtmlAttr(t.id) + '" title="Poner cantidad a cero">Reset</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('.almacen-btn-aplicar').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-material-id');
        if (!id) return;
        var row = btn.closest('tr');
        var inpA = row ? row.querySelector('.almacen-input-aportaciones') : null;
        var inpR = row ? row.querySelector('.almacen-input-retiradas') : null;
        var a = inpA ? parseFloat(inpA.value) || 0 : 0;
        var r = inpR ? parseFloat(inpR.value) || 0 : 0;
        if (a === 0 && r === 0) return;
        if (typeof aplicarAportacionesRetiradas === 'function') aplicarAportacionesRetiradas(id, a, r);
        if (inpA) inpA.value = '0';
        if (inpR) inpR.value = '0';
        var stockCell = row ? row.querySelector('.almacen-cantidad-actual') : null;
        if (stockCell && typeof getAlmacenMateriales === 'function') {
          var st = getAlmacenMateriales();
          stockCell.textContent = (st[id] != null ? Number(st[id]) : 0).toLocaleString('es-ES');
        }
        if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
      });
    });
    tbody.querySelectorAll('.almacen-btn-reset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-material-id');
        if (!id || !confirm('¿Poner la cantidad de este material a cero?')) return;
        var row = btn.closest('tr');
        if (typeof setStockMaterialCero === 'function') setStockMaterialCero(id);
        var stockCell = row ? row.querySelector('.almacen-cantidad-actual') : null;
        if (stockCell) stockCell.textContent = '0';
        if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
      });
    });
  }
  if (tbodyMov && typeof getMovimientosAlmacen === 'function') {
    var movs = getMovimientosAlmacen().slice(0, 100);
    tbodyMov.innerHTML = '';
    movs.forEach(function (m) {
      var tr = document.createElement('tr');
      var fecha = m.fecha ? new Date(m.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      var detalle = [];
      if (m.cantidades && typeof m.cantidades === 'object') {
        TIPOS_MATERIAL_ALMACEN.forEach(function (t) {
          if (m.cantidades[t.id] > 0) detalle.push(t.nombre + ': +' + m.cantidades[t.id]);
        });
      }
      tr.innerHTML = '<td>' + escapeHtml(fecha) + '</td><td>' + escapeHtml(detalle.join(', ') || '—') + '</td><td>' + escapeHtml(m.registradoPor || '—') + '</td>';
      tbodyMov.appendChild(tr);
    });
    if (movs.length === 0) tbodyMov.innerHTML = '<tr><td colspan="3" class="economia-empty-hint">Aún no hay entradas en el registro. Usa «Registrar materiales recuperados» para añadir cantidades.</td></tr>';
  }
}

function renderPreciosPiezas() {
  var tbody = document.getElementById('listaPreciosPiezas');
  if (!tbody || typeof getPreciosPiezas !== 'function' || typeof savePreciosPiezas !== 'function') return;
  var precios = getPreciosPiezas();
  var filas = [
    { id: 'chasis', nombre: 'Partes del chasis (carrocería)', tipo: 'euro', data: precios.chasis, ventaDefault: 30 },
    { id: 'esenciales', nombre: 'Partes esenciales', tipo: 'euro', data: precios.esenciales, ventaDefault: 65 },
    { id: 'swapMotor', nombre: 'Swap motor', tipo: 'porcentaje', data: precios.swapMotor, ventaDefault: 25 },
    { id: 'performance', nombre: 'Piezas performance', tipo: 'porcentaje', data: precios.performance, ventaDefault: 5 },
    { id: 'cosmetic', nombre: 'Piezas cosmetic', tipo: 'porcentaje', data: precios.cosmetic, ventaDefault: 5 },
    { id: 'fullTuning', nombre: 'Full tuning', tipo: 'porcentaje', data: precios.fullTuning, ventaDefault: 40 }
  ];
  tbody.innerHTML = '';
  filas.forEach(function (f) {
    var coste = f.data.coste != null ? f.data.coste : 0;
    var tr = document.createElement('tr');
    tr.setAttribute('data-pieza', f.id);
    if (f.tipo === 'porcentaje') {
      var pct = (f.data.precioVentaPorcentaje != null ? f.data.precioVentaPorcentaje : f.ventaDefault);
      tr.innerHTML =
        '<td>' + escapeHtml(f.nombre) + '</td>' +
        '<td><input type="number" class="input-pieza-coste" min="0" step="0.01" value="' + coste + '" data-pieza="' + escapeHtmlAttr(f.id) + '"></td>' +
        '<td class="economia-piezas-venta-cell"><input type="number" class="input-pieza-venta-pct" min="0" max="100" step="0.5" value="' + pct + '" data-pieza="' + escapeHtmlAttr(f.id) + '"> <span class="economia-piezas-venta-sufijo">% valor veh.</span></td>' +
        '<td class="economia-piezas-margen-eur">Variable</td>' +
        '<td class="economia-piezas-margen-pct">—</td>' +
        '<td><button type="button" class="btn btn-outline btn-sm btn-guardar-pieza" data-pieza="' + escapeHtmlAttr(f.id) + '">Guardar</button></td>';
    } else {
      var venta = f.data.precioVenta != null ? f.data.precioVenta : f.ventaDefault;
      var margenEur = venta - coste;
      var margenPct = coste > 0 ? ((margenEur / coste) * 100).toFixed(1) + '%' : '—';
      tr.innerHTML =
        '<td>' + escapeHtml(f.nombre) + '</td>' +
        '<td><input type="number" class="input-pieza-coste" min="0" step="0.01" value="' + coste + '" data-pieza="' + escapeHtmlAttr(f.id) + '"></td>' +
        '<td><input type="number" class="input-pieza-venta" min="0" step="0.01" value="' + venta + '" data-pieza="' + escapeHtmlAttr(f.id) + '"> €/ud</td>' +
        '<td class="economia-piezas-margen-eur">' + margenEur.toFixed(2) + ' €</td>' +
        '<td class="economia-piezas-margen-pct">' + margenPct + '</td>' +
        '<td><button type="button" class="btn btn-outline btn-sm btn-guardar-pieza" data-pieza="' + escapeHtmlAttr(f.id) + '">Guardar</button></td>';
    }
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.input-pieza-coste, .input-pieza-venta').forEach(function (inp) {
    inp.addEventListener('input', function () {
      var row = inp.closest('tr');
      if (!row || row.querySelector('.input-pieza-venta-pct')) return;
      var costeInp = row.querySelector('.input-pieza-coste');
      var ventaInp = row.querySelector('.input-pieza-venta');
      var coste = parseFloat(costeInp && costeInp.value) || 0;
      var venta = parseFloat(ventaInp && ventaInp.value) || 0;
      var margenEur = venta - coste;
      var margenPct = coste > 0 ? ((margenEur / coste) * 100).toFixed(1) + '%' : '—';
      var margenEurEl = row.querySelector('.economia-piezas-margen-eur');
      var margenPctEl = row.querySelector('.economia-piezas-margen-pct');
      if (margenEurEl) margenEurEl.textContent = margenEur.toFixed(2) + ' €';
      if (margenPctEl) margenPctEl.textContent = margenPct;
    });
  });
  tbody.querySelectorAll('.btn-guardar-pieza').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-pieza');
      var row = btn.closest('tr');
      if (!id || !row) return;
      var costeInp = row.querySelector('.input-pieza-coste');
      var coste = parseFloat(costeInp && costeInp.value) || 0;
      var preciosActual = getPreciosPiezas();
      if (id === 'chasis') {
        var ventaInp = row.querySelector('.input-pieza-venta');
        var venta = parseFloat(ventaInp && ventaInp.value) || 30;
        preciosActual.chasis = { coste: coste, precioVenta: venta };
      } else if (id === 'esenciales') {
        var ventaInp = row.querySelector('.input-pieza-venta');
        var venta = parseFloat(ventaInp && ventaInp.value) || 65;
        preciosActual.esenciales = { coste: coste, precioVenta: venta };
      } else if (id === 'swapMotor') {
        var pctInp = row.querySelector('.input-pieza-venta-pct');
        var pct = parseFloat(pctInp && pctInp.value) || 25;
        preciosActual.swapMotor = { coste: coste, precioVentaPorcentaje: pct };
      } else if (id === 'performance') {
        var pctInp = row.querySelector('.input-pieza-venta-pct');
        var pct = parseFloat(pctInp && pctInp.value) || 5;
        preciosActual.performance = { coste: coste, precioVentaPorcentaje: pct };
      } else if (id === 'cosmetic') {
        var pctInp = row.querySelector('.input-pieza-venta-pct');
        var pct = parseFloat(pctInp && pctInp.value) || 5;
        preciosActual.cosmetic = { coste: coste, precioVentaPorcentaje: pct };
      } else if (id === 'fullTuning') {
        var pctInp = row.querySelector('.input-pieza-venta-pct');
        var pct = parseFloat(pctInp && pctInp.value) || 40;
        preciosActual.fullTuning = { coste: coste, precioVentaPorcentaje: pct };
      }
      savePreciosPiezas(preciosActual);
      renderPreciosPiezas();
    });
  });
  var tbodyTuneo = document.getElementById('listaPreciosPiezasTuneo');
  if (tbodyTuneo && typeof PIEZAS_TUNING === 'object' && typeof CATEGORIAS_TUNEO !== 'undefined' && typeof getPreciosPiezasTuneo === 'function' && typeof savePreciosPiezasTuneo === 'function') {
    var preciosTuneo = getPreciosPiezasTuneo();
    tbodyTuneo.innerHTML = '';
    CATEGORIAS_TUNEO.forEach(function (cat) {
      var piezas = PIEZAS_TUNING[cat.id] || [];
      piezas.forEach(function (p) {
        var stored = preciosTuneo[p.id] || {};
        var costeVal = stored.coste != null ? stored.coste : (p.coste != null ? p.coste : 0);
        var ventaVal = stored.precioVenta != null ? stored.precioVenta : (p.coste != null ? p.coste * 2 : 0);
        var margenEur = ventaVal - costeVal;
        var margenPct = costeVal > 0 ? ((margenEur / costeVal) * 100).toFixed(1) + '%' : '—';
        var tr = document.createElement('tr');
        tr.setAttribute('data-pieza-id', p.id || '');
        tr.innerHTML =
          '<td>' + escapeHtml(cat.nombre) + '</td>' +
          '<td>' + escapeHtml(p.nombre || p.id) + '</td>' +
          '<td><input type="number" class="input-pieza-tuneo-coste" min="0" step="1" value="' + costeVal + '" data-pieza-id="' + escapeHtmlAttr(p.id) + '"></td>' +
          '<td><input type="number" class="input-pieza-tuneo-venta" min="0" step="1" value="' + ventaVal + '" data-pieza-id="' + escapeHtmlAttr(p.id) + '"></td>' +
          '<td class="economia-piezas-margen-eur">' + margenEur.toFixed(2) + ' $</td>' +
          '<td class="economia-piezas-margen-pct">' + margenPct + '</td>' +
          '<td><button type="button" class="btn btn-outline btn-sm btn-guardar-pieza-tuneo" data-pieza-id="' + escapeHtmlAttr(p.id) + '">Guardar</button></td>';
        tbodyTuneo.appendChild(tr);
      });
    });
    tbodyTuneo.querySelectorAll('.input-pieza-tuneo-coste, .input-pieza-tuneo-venta').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var row = inp.closest('tr');
        if (!row) return;
        var costeInp = row.querySelector('.input-pieza-tuneo-coste');
        var ventaInp = row.querySelector('.input-pieza-tuneo-venta');
        var coste = parseFloat(costeInp && costeInp.value) || 0;
        var venta = parseFloat(ventaInp && ventaInp.value) || 0;
        var margenEur = venta - coste;
        var margenPct = coste > 0 ? ((margenEur / coste) * 100).toFixed(1) + '%' : '—';
        var margenEurEl = row.querySelector('.economia-piezas-margen-eur');
        var margenPctEl = row.querySelector('.economia-piezas-margen-pct');
        if (margenEurEl) margenEurEl.textContent = margenEur.toFixed(2) + ' $';
        if (margenPctEl) margenPctEl.textContent = margenPct;
      });
    });
    tbodyTuneo.querySelectorAll('.btn-guardar-pieza-tuneo').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-pieza-id');
        if (!id) return;
        var row = btn.closest('tr');
        var costeInp = row && row.querySelector('.input-pieza-tuneo-coste');
        var ventaInp = row && row.querySelector('.input-pieza-tuneo-venta');
        var coste = parseFloat(costeInp && costeInp.value) || 0;
        var venta = parseFloat(ventaInp && ventaInp.value) || 0;
        var precios = getPreciosPiezasTuneo();
        precios[id] = { coste: coste, precioVenta: venta };
        savePreciosPiezasTuneo(precios);
        renderPreciosPiezas();
      });
    });
  }
  var tbodyMaq = document.getElementById('listaPreciosMaquinaria');
  if (tbodyMaq) {
    var maquinaria = [
      { nombre: 'tablet de tuning', coste: 1500 },
      { nombre: 'Grúa de motor', coste: 800 },
      { nombre: 'máquina de diagnosis', coste: 1000 }
    ];
    tbodyMaq.innerHTML = '';
    maquinaria.forEach(function (m) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + escapeHtml(m.nombre) + '</td><td>' + (m.coste != null ? Number(m.coste).toLocaleString('es-ES') + ' $' : '0') + '</td>';
      tbodyMaq.appendChild(tr);
    });
  }
}

function renderDetalleMaterialesAlmacenModal() {
  var cont = document.getElementById('detalleMaterialesAlmacenLista');
  if (!cont || typeof getAlmacenMateriales !== 'function' || typeof TIPOS_MATERIAL_ALMACEN === 'undefined') return;
  var stock = getAlmacenMateriales();
  var total = 0;
  var rows = TIPOS_MATERIAL_ALMACEN.map(function (t) {
    var q = stock[t.id] != null ? stock[t.id] : 0;
    total += q;
    return '<tr><td>' + escapeHtml(t.nombre) + '</td><td>' + escapeHtml(t.unidad) + '</td><td class="almacen-detalle-cant">' + Number(q).toLocaleString('es-ES') + '</td></tr>';
  }).join('');
  cont.innerHTML = '<table class="economia-table almacen-detalle-table"><thead><tr><th>Material</th><th>Unidad</th><th>Cantidad</th></tr></thead><tbody>' + rows + '</tbody></table><p class="almacen-detalle-total"><strong>Total unidades:</strong> ' + total.toLocaleString('es-ES') + '</p>';
}

function renderFormRegistrarMaterialesRecuperados() {
  var form = document.getElementById('formRegistrarMaterialesRecuperados');
  if (!form || typeof TIPOS_MATERIAL_ALMACEN === 'undefined') return;
  form.innerHTML = '';
  TIPOS_MATERIAL_ALMACEN.forEach(function (t) {
    var div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = '<label>' + escapeHtml(t.nombre) + ' (' + escapeHtml(t.unidad) + ')</label><input type="number" id="almacen_q_' + escapeHtmlAttr(t.id) + '" min="0" step="1" value="0" data-material-id="' + escapeHtmlAttr(t.id) + '">';
    form.appendChild(div);
  });
}

function renderFormMaterialesRecuperadosEmpleado() {
  var wrap = document.getElementById('formMaterialesRecuperadosEmpleadoWrap');
  if (!wrap || typeof TIPOS_MATERIAL_ALMACEN === 'undefined') return;
  wrap.innerHTML = '';
  var form = document.createElement('form');
  form.id = 'formMaterialesRecuperadosEmpleado';
  form.className = 'form-almacen-materiales materiales-recuperados-form';
  TIPOS_MATERIAL_ALMACEN.forEach(function (t) {
    var div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = '<label>' + escapeHtml(t.nombre) + ' (' + escapeHtml(t.unidad) + ')</label><input type="number" id="materialesRecup_q_' + escapeHtmlAttr(t.id) + '" min="0" step="1" value="0" data-material-id="' + escapeHtmlAttr(t.id) + '">';
    form.appendChild(div);
  });
  wrap.appendChild(form);
}

function getMaterialesRecuperadosFormData() {
  var session = typeof getSession === 'function' ? getSession() : null;
  var empleadoNombre = session ? (session.nombre || session.username || '') : '';
  var movimiento = {};
  if (typeof TIPOS_MATERIAL_ALMACEN !== 'undefined') {
    TIPOS_MATERIAL_ALMACEN.forEach(function (t) {
      var inp = document.getElementById('materialesRecup_q_' + t.id);
      var val = inp ? parseFloat(inp.value) : 0;
      if (val > 0) movimiento[t.id] = val;
    });
  }
  return { movimiento: movimiento, empleadoNombre: empleadoNombre };
}

function abrirPantallaMaterialesRecuperados() {
  cerrarTodasPantallasSecundarias();
  if (typeof renderFormMaterialesRecuperadosEmpleado === 'function') renderFormMaterialesRecuperadosEmpleado();
  if (typeof ocultarAppBodyMostrarSecundaria === 'function') ocultarAppBodyMostrarSecundaria('pantallaMaterialesRecuperados');
}

function enviarMaterialesRecuperadosADiscord(datos) {
  var apiBase = (window.backendApi && typeof window.backendApi.getBaseUrl === 'function') ? window.backendApi.getBaseUrl() : '';
  if (!apiBase && typeof window.SALTLAB_API_URL !== 'undefined' && window.SALTLAB_API_URL) apiBase = (window.SALTLAB_API_URL + '').replace(/\/$/, '');
  if (!apiBase) {
    alert('No está configurada la URL del backend. Necesitas el servidor en marcha para enviar a Discord.');
    return;
  }
  var empleado = (datos.empleadoNombre || '—').toString().trim();
  var lineas = [];
  if (typeof TIPOS_MATERIAL_ALMACEN !== 'undefined' && datos.movimiento && Object.keys(datos.movimiento).length > 0) {
    TIPOS_MATERIAL_ALMACEN.forEach(function (t) {
      var q = datos.movimiento[t.id];
      if (typeof q === 'number' && q > 0) lineas.push(t.nombre + ': ' + q + ' ' + (t.unidad || 'ud'));
    });
  }
  if (lineas.length === 0) {
    alert('Indica al menos una cantidad mayor que 0.');
    return;
  }
  var fecha = new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  var content = '📦 **Materiales recuperados**\n**Empleado:** ' + empleado + '\n**Fecha:** ' + fecha + '\n\n' + lineas.join('\n');
  var btn = document.getElementById('btnMaterialesRecupGuardarRegistro');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  fetch(apiBase + '/api/discord-materiales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content })
  }).then(function (r) {
    if (r.ok) alert('Registro enviado al canal de Discord.');
    else return r.json().then(function (data) { throw new Error(data.error || 'Error ' + r.status); }).catch(function () { throw new Error('Error ' + r.status); });
  }).catch(function (e) {
    alert('No se pudo enviar al Discord. ¿Está el servidor en marcha? ' + (e.message || e));
  }).finally(function () {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar registro'; }
  });
}

/** Ruta base e imágenes de piezas (input/CONTENT/ALMACEN/fotospiezas). conceptoId -> nombre de archivo. */
var INVENTARIO_FOTOS_PIEZAS_BASE = 'input/CONTENT/ALMACEN/fotospiezas/';
var INVENTARIO_FOTOS_PIEZAS_MAP = {
  carroceria_puerta: 'puerta.png', carroceria_capo: 'capó.png', carroceria_maletero: 'maletero.png', carroceria_cristal: 'ventana.png',
  esenciales_bomba_direccion: 'bomba de direccion.png', esenciales_inyector: 'inyector.png', esenciales_alternador: 'alternador.png',
  esenciales_radiador: 'radiador.png', esenciales_transmision: 'transmision.png', esenciales_frenos: 'frenos.png',
  maquinaria_tablet_tuneo: 'tablet de tunning.png', maquinaria_maquina_diagnosis: 'herramienta de diagnosis.png', maquinaria_grua_motor: 'grúa de motor.png'
};

/** Coste por unidad desde BBDD: CARROCERÍA = chasis, COMPONENTES ESENCIALES = esenciales (precios piezas reparación). */
function getCosteInventarioDesdeBBDD(conceptoId) {
  var cat = typeof CATEGORIA_INVENTARIO !== 'undefined' && CATEGORIA_INVENTARIO ? CATEGORIA_INVENTARIO.find(function (c) { return c.id === conceptoId; }) : null;
  if (!cat || !cat.grupo) return 0;
  var precios = typeof getPreciosPiezas === 'function' ? getPreciosPiezas() : null;
  if (!precios) return cat.grupo === 'CARROCERÍA' ? 15 : cat.grupo === 'COMPONENTES ESENCIALES' ? 40 : 0;
  if (cat.grupo === 'CARROCERÍA') return (precios.chasis && typeof precios.chasis.coste === 'number') ? precios.chasis.coste : 15;
  if (cat.grupo === 'COMPONENTES ESENCIALES') return (precios.esenciales && typeof precios.esenciales.coste === 'number') ? precios.esenciales.coste : 40;
  return 0;
}

function tieneCosteEnBBDD(conceptoId) {
  return getCosteInventarioDesdeBBDD(conceptoId) > 0;
}

/** Coste efectivo: primero el guardado por el usuario (si no hay en BBDD), luego el de la BBDD. */
function getCosteEfectivoInventarioConcepto(conceptoId) {
  var stored = typeof getCosteInventarioConcepto === 'function' ? getCosteInventarioConcepto(conceptoId) : 0;
  if (stored > 0) return stored;
  return getCosteInventarioDesdeBBDD(conceptoId);
}

function registrarGastoEntradaStock(conceptoId, cantidad) {
  if (!conceptoId || cantidad <= 0 || typeof addGasto !== 'function') return;
  var costeUnit = getCosteEfectivoInventarioConcepto(conceptoId);
  if (costeUnit <= 0) return;
  var importeTotal = Math.round(cantidad * costeUnit * 100) / 100;
  var label = typeof getCategoriaInventarioLabel === 'function' ? getCategoriaInventarioLabel(conceptoId) : conceptoId;
  addGasto({
    categoria: 'material_taller',
    concepto: 'Stock: ' + label + ' (+' + cantidad + ' ud)',
    importe: importeTotal,
    fecha: new Date().toISOString().slice(0, 10),
    registradoPor: '',
    notas: 'Entrada de inventario'
  });
}

function renderInventario() {
  var wrap = document.getElementById('inventarioPorGrupos');
  if (!wrap || typeof getInventario !== 'function' || typeof CATEGORIA_INVENTARIO === 'undefined') return;
  var active = document.activeElement;
  if (active && wrap.contains(active) && (active.classList.contains('inventario-input-add') || active.classList.contains('inventario-input-remove') || active.classList.contains('inventario-input-coste'))) return;
  var stock = getInventario();
  var limites = typeof getLimitesStock === 'function' ? getLimitesStock() : {};
  var q = (document.getElementById('filtroEconomiaInventario') && document.getElementById('filtroEconomiaInventario').value) || '';
  q = q.trim().toLowerCase();
  var categorias = CATEGORIA_INVENTARIO.filter(function (c) {
    if (!q) return true;
    var texto = ((c.grupo || '') + ' ' + (c.nombre || '') + ' ' + (c.id || '')).toLowerCase();
    return texto.indexOf(q) !== -1;
  });
  var porGrupo = {};
  categorias.forEach(function (c) {
    var g = c.grupo || 'Otros';
    if (!porGrupo[g]) porGrupo[g] = [];
    porGrupo[g].push(c);
  });
  var gruposOrden = ['VARIOS', 'CARROCERÍA', 'COMPONENTES ESENCIALES', 'TUNING', 'MAQUINARIA'];
  var restantes = Object.keys(porGrupo).filter(function (g) { return gruposOrden.indexOf(g) === -1; });
  var valoresInputs = {};
  wrap.querySelectorAll('tr.inventario-ficha-pieza').forEach(function (tr) {
    var id = tr.querySelector('.inventario-input-add');
    if (id) id = id.getAttribute('data-concepto');
    if (!id) return;
    var addIn = tr.querySelector('.inventario-input-add');
    var removeIn = tr.querySelector('.inventario-input-remove');
    var addVal = addIn && addIn.value !== '' ? addIn.value : null;
    var removeVal = removeIn && removeIn.value !== '' ? removeIn.value : null;
    if (addVal != null || removeVal != null) valoresInputs[id] = { add: addVal, remove: removeVal };
  });
  wrap.innerHTML = '';
  gruposOrden.concat(restantes).forEach(function (grupoNombre) {
    var items = porGrupo[grupoNombre];
    if (!items || !items.length) return;
    var slug = (grupoNombre || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'otros';
    var ficha = document.createElement('div');
    ficha.className = 'inventario-ficha inventario-ficha-neon inventario-ficha-' + slug;
    var tableHtml = '<div class="inventario-ficha-titulo">' + escapeHtml(grupoNombre) + '</div><div class="inventario-ficha-tabla-wrap scrollbar-on-scroll"><table class="inventario-ficha-tabla"><thead><tr><th>Concepto</th><th>Coste/ud (€)</th><th>Stock</th><th class="inventario-th-acciones"></th></tr></thead><tbody></tbody></table></div>';
    ficha.innerHTML = tableHtml;
    var tbody = ficha.querySelector('.inventario-ficha-tabla tbody');
    items.forEach(function (c) {
      var id = c.id;
      var cant = (stock[id] != null && !isNaN(parseFloat(stock[id]))) ? parseFloat(stock[id]) : 0;
      var costeBBDD = tieneCosteEnBBDD(id);
      var costeUd = getCosteEfectivoInventarioConcepto(id);
      var costeCell = costeBBDD
        ? '<span class="inventario-coste-bbdd">' + (costeUd > 0 ? costeUd : '—') + ' €</span>'
        : '<input type="number" class="inventario-input-coste" data-concepto="' + escapeHtmlAttr(id) + '" min="0" step="0.01" value="' + (costeUd > 0 ? costeUd : '') + '" placeholder="—" title="Sin precio en BBDD: indica coste/ud para el reporte de gastos">';
      var lim = limites[id] || {};
      var min = (lim.stockMinimo != null) ? parseFloat(lim.stockMinimo) : '';
      var bajoMin = min > 0 && cant <= min;
      var alerta = bajoMin ? ' <span class="economia-alerta-badge economia-alerta-bajo">Bajo stock</span>' : '';
      var imgSrc = INVENTARIO_FOTOS_PIEZAS_MAP[id] ? (INVENTARIO_FOTOS_PIEZAS_BASE + encodeURIComponent(INVENTARIO_FOTOS_PIEZAS_MAP[id])) : '';
      var imgHtml = imgSrc ? '<img class="inventario-pieza-logo" src="' + escapeHtmlAttr(imgSrc) + '" alt="" title="' + escapeHtmlAttr(c.nombre || id) + '" onerror="this.style.display=\'none\'">' : '<span class="inventario-pieza-logo-placeholder"></span>';
      var tr = document.createElement('tr');
      tr.className = 'inventario-ficha-pieza';
      tr.innerHTML =
        '<td class="inventario-td-concepto">' + imgHtml + '<span class="inventario-td-concepto-texto">' + escapeHtml(c.nombre || id) + alerta + '</span></td>' +
        '<td class="inventario-td-coste">' + costeCell + '</td>' +
        '<td class="inventario-td-stock">' + cant + ' ud</td>' +
        '<td class="inventario-td-acciones">' +
        '<input type="number" class="inventario-input-add" data-concepto="' + escapeHtmlAttr(id) + '" min="1" step="1" value="1" title="Cantidad a añadir" inputmode="numeric">' +
        '<button type="button" class="inventario-btn-round inventario-btn-add" data-concepto="' + escapeHtmlAttr(id) + '" title="Sumar al stock" aria-label="Añadir">+</button>' +
        '<input type="number" class="inventario-input-remove" data-concepto="' + escapeHtmlAttr(id) + '" min="1" step="1" value="1" title="Cantidad a retirar" inputmode="numeric">' +
        '<button type="button" class="inventario-btn-round inventario-btn-remove" data-concepto="' + escapeHtmlAttr(id) + '" title="Restar del stock" aria-label="Retirar">−</button>' +
        '</td>';
      tbody.appendChild(tr);
    });
    wrap.appendChild(ficha);
  });
  wrap.querySelectorAll('.inventario-input-add').forEach(function (addIn) {
    var id = addIn.getAttribute('data-concepto');
    if (!id || !valoresInputs[id]) return;
    var v = valoresInputs[id];
    if (v.add != null) addIn.value = v.add;
  });
  wrap.querySelectorAll('.inventario-input-remove').forEach(function (removeIn) {
    var id = removeIn.getAttribute('data-concepto');
    if (!id || !valoresInputs[id]) return;
    var v = valoresInputs[id];
    if (v.remove != null) removeIn.value = v.remove;
  });
  wrap.querySelectorAll('.inventario-input-coste').forEach(function (costeInp) {
    costeInp.addEventListener('change', function () {
      var id = costeInp.getAttribute('data-concepto');
      if (!id || typeof getCostesInventario !== 'function' || typeof saveCostesInventario !== 'function') return;
      var obj = getCostesInventario();
      var v = costeInp.value !== '' ? (parseFloat(costeInp.value) || 0) : 0;
      if (v > 0) obj[id] = v; else delete obj[id];
      saveCostesInventario(obj);
    });
  });
  wrap.querySelectorAll('.inventario-btn-add').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-concepto');
      var row = btn.closest('tr');
      var input = row ? row.querySelector('.inventario-input-add') : null;
      var n = input && input.value !== '' ? (parseInt(input.value, 10) || 1) : 1;
      if (!id || typeof addStock !== 'function') return;
      addStock(id, n);
      if (n > 0) registrarGastoEntradaStock(id, n);
      var stockCell = row ? row.querySelector('.inventario-td-stock') : null;
      if (stockCell && typeof getStock === 'function') stockCell.textContent = getStock(id) + ' ud';
      if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
      if (typeof renderLimitesStock === 'function') renderLimitesStock();
    });
  });
  wrap.querySelectorAll('.inventario-btn-remove').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-concepto');
      var row = btn.closest('tr');
      var input = row ? row.querySelector('.inventario-input-remove') : null;
      var n = input && input.value !== '' ? (parseInt(input.value, 10) || 1) : 1;
      if (!id || typeof removeStock !== 'function') return;
      var actual = typeof getStock === 'function' ? getStock(id) : 0;
      if (n > actual) n = actual;
      if (n <= 0) return;
      removeStock(id, n);
      var stockCell = row ? row.querySelector('.inventario-td-stock') : null;
      if (stockCell && typeof getStock === 'function') stockCell.textContent = getStock(id) + ' ud';
      if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
      if (typeof renderLimitesStock === 'function') renderLimitesStock();
    });
  });
  wrap.querySelectorAll('.inventario-input-add').forEach(function (addIn) {
    addIn.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var id = addIn.getAttribute('data-concepto');
      var row = addIn.closest('tr');
      var n = addIn.value !== '' ? (parseInt(addIn.value, 10) || 1) : 1;
      if (!id || typeof addStock !== 'function') return;
      addStock(id, n);
      if (n > 0) registrarGastoEntradaStock(id, n);
      var stockCell = row ? row.querySelector('.inventario-td-stock') : null;
      if (stockCell && typeof getStock === 'function') stockCell.textContent = getStock(id) + ' ud';
      if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
      if (typeof renderLimitesStock === 'function') renderLimitesStock();
      addIn.value = '1';
      addIn.blur();
    });
  });
  wrap.querySelectorAll('.inventario-input-remove').forEach(function (removeIn) {
    removeIn.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var id = removeIn.getAttribute('data-concepto');
      var row = removeIn.closest('tr');
      var n = removeIn.value !== '' ? (parseInt(removeIn.value, 10) || 1) : 1;
      if (!id || typeof removeStock !== 'function') return;
      var actual = typeof getStock === 'function' ? getStock(id) : 0;
      if (n > actual) n = actual;
      if (n <= 0) { removeIn.blur(); return; }
      removeStock(id, n);
      var stockCell = row ? row.querySelector('.inventario-td-stock') : null;
      if (stockCell && typeof getStock === 'function') stockCell.textContent = getStock(id) + ' ud';
      if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
      if (typeof renderLimitesStock === 'function') renderLimitesStock();
      removeIn.value = '1';
      removeIn.blur();
    });
  });
}

function renderLimitesStock() {
  var tbody = document.getElementById('listaLimitesStock');
  if (!tbody || typeof CATEGORIA_INVENTARIO === 'undefined') return;
  var limites = typeof getLimitesStock === 'function' ? getLimitesStock() : {};
  var stockActual = typeof getStockActualPorConcepto === 'function' ? getStockActualPorConcepto() : {};
  tbody.innerHTML = '';
  CATEGORIA_INVENTARIO.forEach(function (c) {
    var id = c.id;
    var lim = limites[id] || {};
    var min = lim.stockMinimo != null ? lim.stockMinimo : '';
    var max = lim.stockMaximo != null && lim.stockMaximo !== '' ? lim.stockMaximo : '';
    var actual = (stockActual[id] != null ? stockActual[id] : 0);
    var label = (c.grupo ? c.grupo + ' · ' : '') + (c.nombre || id);
    var tr = document.createElement('tr');
    tr.innerHTML = '<td>' + escapeHtml(label) + '</td><td class="economia-limites-actual">' + actual + '</td>' +
      '<td><input type="number" class="input-limite-min" data-concepto="' + escapeHtmlAttr(id) + '" min="0" step="1" value="' + (min !== '' ? min : '') + '" placeholder="0"></td>' +
      '<td><input type="number" class="input-limite-max" data-concepto="' + escapeHtmlAttr(id) + '" min="0" step="1" value="' + (max !== '' ? max : '') + '" placeholder="Sin límite"></td>' +
      '<td><button type="button" class="btn btn-outline btn-sm btn-guardar-limite" data-concepto="' + escapeHtmlAttr(id) + '">Guardar</button></td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-guardar-limite').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var conceptoId = btn.getAttribute('data-concepto');
      var row = btn.closest('tr');
      if (!row) return;
      var minInput = row.querySelector('.input-limite-min');
      var maxInput = row.querySelector('.input-limite-max');
      var minVal = minInput && minInput.value !== '' ? parseFloat(minInput.value) : 0;
      var maxVal = maxInput && maxInput.value !== '' ? parseFloat(maxInput.value) : null;
      if (typeof setLimiteStock === 'function') setLimiteStock(conceptoId, { stockMinimo: minVal, stockMaximo: maxVal });
      if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
      if (typeof renderMainDashboard === 'function') renderMainDashboard();
    });
  });
}

function renderGastos() {
  var tbody = document.getElementById('listaGastos');
  if (!tbody || typeof getGastos !== 'function') return;
  var list = getGastos();
  var q = (document.getElementById('filtroEconomiaGastos') && document.getElementById('filtroEconomiaGastos').value) || '';
  if (q) {
    q = q.trim().toLowerCase();
    var catMap = (typeof CATEGORIA_GASTO !== 'undefined' ? CATEGORIA_GASTO : []).reduce(function (o, c) { o[c.id] = c.nombre; return o; }, {});
    list = list.filter(function (g) {
      var texto = [g.concepto, (catMap[g.categoria] || ''), (g.registradoPor || '')].join(' ').toLowerCase();
      return texto.indexOf(q) !== -1;
    });
  }
  var categorias = (typeof CATEGORIA_GASTO !== 'undefined' ? CATEGORIA_GASTO : []).reduce(function (o, c) { o[c.id] = c.nombre; return o; }, {});
  tbody.innerHTML = '';
  list.slice(0, 500).forEach(function (g) {
    var tr = document.createElement('tr');
    var fecha = g.fecha ? new Date(g.fecha).toLocaleDateString('es-ES') : '—';
    tr.innerHTML = '<td>' + escapeHtml(fecha) + '</td><td>' + escapeHtml(categorias[g.categoria] || g.categoria) + '</td><td>' + escapeHtml(g.concepto || '—') + '</td><td>' + (g.importe || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</td><td>' + escapeHtml(g.registradoPor || '—') + '</td><td><button type="button" class="btn btn-outline btn-sm btn-edit-gasto" data-id="' + escapeHtmlAttr(g.id) + '">Editar</button> <button type="button" class="btn btn-outline btn-sm btn-del-gasto" data-id="' + escapeHtmlAttr(g.id) + '">Eliminar</button></td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-edit-gasto').forEach(function (btn) { btn.addEventListener('click', function () { abrirModalGasto(btn.getAttribute('data-id')); }); });
  tbody.querySelectorAll('.btn-del-gasto').forEach(function (btn) { btn.addEventListener('click', function () { var id = btn.getAttribute('data-id'); if (id && confirm('¿Eliminar este gasto?')) { if (typeof removeGasto === 'function') removeGasto(id); renderGastos(); renderEconomiaResumen(); } }); });
}

function renderPrevisiones() {
  var wrap = document.getElementById('economiaPrevisionesContenido');
  var inputMes = document.getElementById('economiaPrevisionMes');
  if (!wrap) return;
  var anio = new Date().getFullYear();
  var mes = new Date().getMonth() + 1;
  if (inputMes && inputMes.value) {
    var parts = inputMes.value.split('-');
    if (parts.length === 2) { anio = parseInt(parts[0], 10); mes = parseInt(parts[1], 10); }
  } else if (inputMes) { inputMes.value = anio + '-' + (mes < 10 ? '0' + mes : mes); }
  var prev = typeof getPrevisionMes === 'function' ? getPrevisionMes(anio, mes) : {};
  var real = typeof getTotalGastosPorMes === 'function' ? getTotalGastosPorMes(anio, mes) : 0;
  var categorias = typeof CATEGORIA_GASTO !== 'undefined' ? CATEGORIA_GASTO : [];
  var totalPrev = 0;
  categorias.forEach(function (cat) { totalPrev += parseFloat(prev[cat.id] || 0) || 0; });
  var html = '<div class="economia-prevision-resumen"><p>Total previsto: <strong>' + totalPrev.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</strong> · Real del mes: <strong>' + real.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</strong></p></div>';
  html += '<table class="economia-table"><thead><tr><th>Categoría</th><th>Previsto (€)</th><th>Real (€)</th></tr></thead><tbody>';
  var gastosByCat = {};
  if (typeof getGastosPorMes === 'function') {
    (getGastosPorMes(anio, mes) || []).forEach(function (g) { gastosByCat[g.categoria] = (gastosByCat[g.categoria] || 0) + (g.importe || 0); });
  }
  categorias.forEach(function (cat) {
    var p = parseFloat(prev[cat.id] || 0) || 0;
    var r = gastosByCat[cat.id] || 0;
    html += '<tr><td>' + escapeHtml(cat.nombre) + '</td><td><input type="number" class="economia-input-prevision" data-cat="' + escapeHtmlAttr(cat.id) + '" value="' + p + '" min="0" step="0.01" placeholder="0"></td><td>' + r.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €</td></tr>';
  });
  html += '</tbody></table><button type="button" class="btn btn-register" id="btnGuardarPrevision">Guardar previsión</button>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.economia-input-prevision').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var cat = inp.getAttribute('data-cat');
      var val = parseFloat(inp.value) || 0;
      var p = typeof getPrevisionMes === 'function' ? getPrevisionMes(anio, mes) : {};
      p[cat] = val;
      if (typeof setPrevisionMes === 'function') setPrevisionMes(anio, mes, p);
    });
  });
  var btnGuardar = document.getElementById('btnGuardarPrevision');
  if (btnGuardar) btnGuardar.addEventListener('click', function () {
    var p = {};
    wrap.querySelectorAll('.economia-input-prevision').forEach(function (inp) { p[inp.getAttribute('data-cat')] = parseFloat(inp.value) || 0; });
    if (typeof setPrevisionMes === 'function') setPrevisionMes(anio, mes, p);
    renderPrevisiones();
  });
}

function abrirModalCompra(id) {
  var modal = document.getElementById('modalCompra');
  var titulo = document.getElementById('modalCompraTitulo');
  var form = document.getElementById('formCompra');
  if (!modal || !form) return;
  var selCat = document.getElementById('compraCategoria');
  var selEst = document.getElementById('compraEstado');
  if (selCat && typeof CATEGORIA_INVENTARIO !== 'undefined') {
    var byGrupo = {};
    CATEGORIA_INVENTARIO.forEach(function (c) {
      var g = (c.grupo || 'Otros').toString();
      if (!byGrupo[g]) byGrupo[g] = [];
      byGrupo[g].push(c);
    });
    var ordenGrupos = ['VARIOS', 'CARROCERÍA', 'COMPONENTES ESENCIALES', 'TUNING', 'MAQUINARIA', 'Otros'];
    var html = '';
    ordenGrupos.forEach(function (g) {
      if (!byGrupo[g]) return;
      html += '<optgroup label="' + escapeHtmlAttr(g) + '">';
      byGrupo[g].forEach(function (c) { html += '<option value="' + escapeHtmlAttr(c.id) + '">' + escapeHtml(c.nombre || c.id) + '</option>'; });
      html += '</optgroup>';
    });
    selCat.innerHTML = html || CATEGORIA_INVENTARIO.map(function (c) { return '<option value="' + escapeHtmlAttr(c.id) + '">' + escapeHtml((c.grupo ? c.grupo + ' · ' : '') + (c.nombre || c.id)) + '</option>'; }).join('');
  }
  if (selEst && typeof ESTADO_COMPRA !== 'undefined') { selEst.innerHTML = ESTADO_COMPRA.map(function (e) { return '<option value="' + e.id + '">' + escapeHtml(e.nombre) + '</option>'; }).join(''); }
  if (id && typeof getComprasPendientes === 'function') {
    var c = getComprasPendientes().find(function (x) { return x.id === id; });
    if (c) {
      titulo.textContent = 'Editar compra';
      document.getElementById('compraId').value = c.id;
      document.getElementById('compraConcepto').value = c.concepto || '';
      var catVal = c.categoria || 'varios_comida';
      if (selCat && !CATEGORIA_INVENTARIO.some(function (x) { return x.id === catVal; })) catVal = (CATEGORIA_INVENTARIO[0] && CATEGORIA_INVENTARIO[0].id) || 'varios_comida';
      document.getElementById('compraCategoria').value = catVal;
      document.getElementById('compraCantidad').value = c.cantidad || 1;
      document.getElementById('compraUnidad').value = c.unidad || 'ud';
      document.getElementById('compraImporteEstimado').value = c.importeEstimado || 0;
      document.getElementById('compraSolicitadoPor').value = c.solicitadoPor || '';
      document.getElementById('compraEstado').value = c.estado || 'pendiente';
      document.getElementById('compraNotas').value = c.notas || '';
      modal.classList.add('active');
      return;
    }
  }
  titulo.textContent = 'Nueva compra';
  form.reset();
  document.getElementById('compraId').value = '';
  document.getElementById('compraCategoria').value = (typeof CATEGORIA_INVENTARIO !== 'undefined' && CATEGORIA_INVENTARIO[0]) ? CATEGORIA_INVENTARIO[0].id : 'varios_comida';
  document.getElementById('compraEstado').value = 'pendiente';
  document.getElementById('compraCantidad').value = 1;
  document.getElementById('compraUnidad').value = 'ud';
  modal.classList.add('active');
}

var GRUPOS_INVENTARIO = ['VARIOS', 'CARROCERÍA', 'COMPONENTES ESENCIALES', 'TUNING', 'MAQUINARIA'];

function getConceptosPorGrupo(grupo) {
  if (typeof CATEGORIA_INVENTARIO === 'undefined') return [];
  return (CATEGORIA_INVENTARIO || []).filter(function (c) { return (c.grupo || '') === grupo; });
}

function rellenarInventarioConcepto(grupo) {
  var sel = document.getElementById('inventarioConcepto');
  if (!sel) return;
  var items = getConceptosPorGrupo(grupo);
  sel.innerHTML = items.length ? items.map(function (c) { return '<option value="' + escapeHtmlAttr(c.id) + '">' + escapeHtml(c.nombre || c.id) + '</option>'; }).join('') : '<option value="">— Sin conceptos —</option>';
  sel.disabled = !items.length;
  if (items.length) sel.value = items[0].id;
}

function abrirModalInventario(id) {
  var modal = document.getElementById('modalInventario');
  var titulo = document.getElementById('modalInventarioTitulo');
  var form = document.getElementById('formInventario');
  var selGrupo = document.getElementById('inventarioCategoriaGrupo');
  if (!modal || !form || !selGrupo) return;
  if (typeof CATEGORIA_INVENTARIO !== 'undefined') {
    selGrupo.innerHTML = '<option value="">— Selecciona categoría —</option>' + GRUPOS_INVENTARIO.map(function (g) { return '<option value="' + escapeHtmlAttr(g) + '">' + escapeHtml(g) + '</option>'; }).join('');
  }
  if (id && typeof getInventario === 'function') {
    var inv = getInventario();
    var i = Array.isArray(inv) ? inv.find(function (x) { return x.id === id; }) : null;
    if (i) {
      titulo.textContent = 'Editar pedido';
      document.getElementById('inventarioId').value = i.id;
      document.getElementById('inventarioSolicitante').value = i.solicitante || '';
      var catInvVal = i.categoria || '';
      var grupo = '';
      if (typeof CATEGORIA_INVENTARIO !== 'undefined' && catInvVal) {
        var found = CATEGORIA_INVENTARIO.find(function (x) { return x.id === catInvVal; });
        grupo = found ? (found.grupo || '') : (GRUPOS_INVENTARIO[0] || '');
      }
      if (!grupo) grupo = GRUPOS_INVENTARIO[0] || 'VARIOS';
      selGrupo.value = grupo;
      rellenarInventarioConcepto(grupo);
      var selConcepto = document.getElementById('inventarioConcepto');
      if (selConcepto && CATEGORIA_INVENTARIO.some(function (x) { return x.id === catInvVal; })) selConcepto.value = catInvVal;
      document.getElementById('inventarioCantidadAPedir').value = (i.cantidadAPedir != null ? i.cantidadAPedir : 1);
      document.getElementById('inventarioCantidad').value = i.cantidad || 0;
      document.getElementById('inventarioUnidad').value = i.unidad || 'ud';
      document.getElementById('inventarioStockMinimo').value = i.stockMinimo || 0;
      var stockMaxEl = document.getElementById('inventarioStockMaximo');
      if (stockMaxEl) stockMaxEl.value = (i.stockMaximo != null && i.stockMaximo !== '') ? i.stockMaximo : '';
      document.getElementById('inventarioNotas').value = i.notas || '';
      aplicarPermisosStockInventario(false);
      modal.classList.add('active');
      return;
    }
  }
  titulo.textContent = 'Nuevo pedido';
  form.reset();
  document.getElementById('inventarioId').value = '';
  selGrupo.value = GRUPOS_INVENTARIO[0] || 'VARIOS';
  rellenarInventarioConcepto(selGrupo.value);
  document.getElementById('inventarioUnidad').value = 'ud';
  var capEl = document.getElementById('inventarioCantidadAPedir');
  if (capEl) capEl.value = 1;
  var stockMaxEl = document.getElementById('inventarioStockMaximo');
  if (stockMaxEl) stockMaxEl.value = '';
  var session = typeof getSession === 'function' ? getSession() : null;
  if (session) document.getElementById('inventarioSolicitante').value = session.nombre || session.username || '';
  aplicarPermisosStockInventario(true);
  modal.classList.add('active');
}

function aplicarPermisosStockInventario(esNuevo) {
  var session = typeof getSession === 'function' ? getSession() : null;
  var puedeEditarStock = session && (typeof hasPermission === 'function' && hasPermission(session, 'gestionarUsuarios'));
  var minEl = document.getElementById('inventarioStockMinimo');
  var maxEl = document.getElementById('inventarioStockMaximo');
  var hint = document.getElementById('hintStockLimites');
  if (minEl) minEl.readOnly = !puedeEditarStock;
  if (maxEl) {
    maxEl.readOnly = !puedeEditarStock;
    if (esNuevo && !puedeEditarStock) maxEl.value = '';
  }
  if (hint) hint.style.display = puedeEditarStock ? 'none' : '';
}

function abrirModalGasto(id) {
  var modal = document.getElementById('modalGasto');
  var titulo = document.getElementById('modalGastoTitulo');
  var form = document.getElementById('formGasto');
  if (!modal || !form) return;
  var selCat = document.getElementById('gastoCategoria');
  if (selCat && typeof CATEGORIA_GASTO !== 'undefined') { selCat.innerHTML = CATEGORIA_GASTO.map(function (c) { return '<option value="' + c.id + '">' + escapeHtml(c.nombre) + '</option>'; }).join(''); }
  if (id && typeof getGastos === 'function') {
    var g = getGastos().find(function (x) { return x.id === id; });
    if (g) {
      titulo.textContent = 'Editar gasto';
      document.getElementById('gastoId').value = g.id;
      document.getElementById('gastoFecha').value = (g.fecha || '').toString().slice(0, 10);
      document.getElementById('gastoCategoria').value = g.categoria || 'otros';
      document.getElementById('gastoConcepto').value = g.concepto || '';
      document.getElementById('gastoImporte').value = g.importe || 0;
      document.getElementById('gastoRecurrente').checked = !!g.recurrente;
      document.getElementById('gastoRegistradoPor').value = g.registradoPor || '';
      document.getElementById('gastoNotas').value = g.notas || '';
      modal.classList.add('active');
      return;
    }
  }
  titulo.textContent = 'Registrar gasto';
  form.reset();
  document.getElementById('gastoId').value = '';
  document.getElementById('gastoFecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('gastoCategoria').value = 'otros';
  var session = typeof getSession === 'function' ? getSession() : null;
  if (session) document.getElementById('gastoRegistradoPor').value = session.nombre || session.username || '';
  modal.classList.add('active');
}

function vincularEconomia() {
  var economiaTabsEl = document.getElementById('economiaTabs');
  if (economiaTabsEl) economiaTabsEl.querySelectorAll('.economia-tab').forEach(function (tab) {
    tab.addEventListener('click', function () { mostrarSubpanelEconomia(tab.dataset.economiaTab); });
  });
  document.querySelectorAll('.stock-tab').forEach(function (tab) {
    tab.addEventListener('click', function () { mostrarSubpanelStock(tab.dataset.stockTab); });
  });
  var btnReparto = document.getElementById('btnGuardarRepartoBeneficios');
  if (btnReparto) btnReparto.addEventListener('click', function () {
    var ta = document.getElementById('economiaRepartoBeneficios');
    if (ta) try {
      localStorage.setItem(REPARTO_BENEFICIOS_STORAGE, (ta.value || '').trim());
      if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
      alert('Reparto de beneficios guardado.');
    } catch (e) { alert('No se pudo guardar.'); }
  });
  var panelEconomia = document.getElementById('panelEconomia');
  if (panelEconomia && !panelEconomia.dataset.discordBtnBound) {
    panelEconomia.dataset.discordBtnBound = '1';
    panelEconomia.addEventListener('click', function (ev) {
      var el = ev.target;
      var btn = el.closest && el.closest('.btn-enviar-registro-discord');
      if (btn) {
        ev.preventDefault();
        enviarRegistroDiscord();
      }
    });
  }
  var btnCompra = document.getElementById('btnNuevaCompra');
  var btnInv = document.getElementById('btnNuevoInventario');
  var btnGasto = document.getElementById('btnNuevoGasto');
  if (btnCompra) btnCompra.addEventListener('click', function () { abrirModalCompra(); });
  if (btnInv) btnInv.addEventListener('click', function () { abrirModalInventario(); });
  var selGrupoInv = document.getElementById('inventarioCategoriaGrupo');
  if (selGrupoInv) selGrupoInv.addEventListener('change', function () { rellenarInventarioConcepto(this.value); });
  if (btnGasto) btnGasto.addEventListener('click', function () { abrirModalGasto(); });
  var filtroCompras = document.getElementById('filtroEconomiaCompras');
  var filtroInv = document.getElementById('filtroEconomiaInventario');
  var filtroGastos = document.getElementById('filtroEconomiaGastos');
  var debounceEconomia = 200;
  if (filtroCompras) { filtroCompras.addEventListener('input', debounce(renderComprasPendientes, debounceEconomia)); filtroCompras.addEventListener('change', renderComprasPendientes); }
  if (filtroInv) { filtroInv.addEventListener('input', debounce(renderInventario, debounceEconomia)); filtroInv.addEventListener('change', renderInventario); }
  if (filtroGastos) { filtroGastos.addEventListener('input', debounce(renderGastos, debounceEconomia)); filtroGastos.addEventListener('change', renderGastos); }
  var filtroHistorial = document.getElementById('filtroHistorialTipo');
  if (filtroHistorial) { filtroHistorial.addEventListener('change', function () { if (typeof renderHistorialPedidos === 'function') renderHistorialPedidos(); }); }
  var filtroHistorialCat = document.getElementById('filtroHistorialCategoria');
  if (filtroHistorialCat) { filtroHistorialCat.addEventListener('change', function () { if (typeof renderHistorialPedidos === 'function') renderHistorialPedidos(); }); }
  var filtroEntregas = document.getElementById('filtroEntregasMaterial');
  if (filtroEntregas) {
    var debouncedEntregas = debounce(function () { if (typeof renderEntregasMaterial === 'function') renderEntregasMaterial(); }, 180);
    filtroEntregas.addEventListener('input', debouncedEntregas);
    filtroEntregas.addEventListener('change', function () { if (typeof renderEntregasMaterial === 'function') renderEntregasMaterial(); });
  }
  var btnEntrega = document.getElementById('btnNuevaEntregaMaterial');
  if (btnEntrega) btnEntrega.addEventListener('click', function () {
    var modal = document.getElementById('modalEntregaMaterial');
    var selTrab = document.getElementById('entregaTrabajador');
    var selMat = document.getElementById('entregaMaterial');
    var fechaEl = document.getElementById('entregaFecha');
    var porEl = document.getElementById('entregaEntregadoPor');
    if (selTrab) {
      selTrab.innerHTML = '<option value="">— Selecciona trabajador —</option>';
      var users = typeof getUsers === 'function' ? getUsers().filter(function (u) { return u.activo !== false; }) : [];
      users.forEach(function (u) {
        var opt = document.createElement('option');
        opt.value = (u.id || '') + '|' + (u.nombre || u.username || '');
        opt.textContent = (u.nombre || u.username || u.id || '—');
        selTrab.appendChild(opt);
      });
    }
    if (selMat) {
      selMat.innerHTML = '<option value="">— Selecciona material —</option>';
      var cats = typeof CATEGORIA_INVENTARIO !== 'undefined' ? CATEGORIA_INVENTARIO : [];
      cats.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = (c.id || '') + '|' + ((c.grupo ? c.grupo + ' · ' : '') + (c.nombre || c.id));
        opt.textContent = (c.grupo ? c.grupo + ' · ' : '') + (c.nombre || c.id);
        selMat.appendChild(opt);
      });
    }
    if (fechaEl) { var n = new Date(); fechaEl.value = n.toISOString().slice(0, 16); }
    var session = typeof getSession === 'function' ? getSession() : null;
    if (porEl) porEl.value = session ? (session.nombre || session.username || '') : '';
    if (modal) modal.classList.add('active');
  });
  var formEntrega = document.getElementById('formEntregaMaterial');
  if (formEntrega && typeof addEntregaMaterial === 'function') formEntrega.addEventListener('submit', function (e) {
    e.preventDefault();
    var selTrab = document.getElementById('entregaTrabajador');
    var selMat = document.getElementById('entregaMaterial');
    var partsT = (selTrab && selTrab.value) ? selTrab.value.split('|') : [];
    var partsM = (selMat && selMat.value) ? selMat.value.split('|') : [];
    var session = typeof getSession === 'function' ? getSession() : null;
    var item = {
      fecha: (document.getElementById('entregaFecha') && document.getElementById('entregaFecha').value) || new Date().toISOString(),
      trabajadorId: partsT[0] || '',
      trabajadorNombre: partsT[1] || (selTrab && selTrab.selectedOptions[0] ? selTrab.selectedOptions[0].textContent : ''),
      materialConcepto: partsM[0] || '',
      materialLabel: partsM[1] || (selMat && selMat.selectedOptions[0] ? selMat.selectedOptions[0].textContent : ''),
      cantidad: parseFloat(document.getElementById('entregaCantidad') && document.getElementById('entregaCantidad').value) || 1,
      unidad: (document.getElementById('entregaUnidad') && document.getElementById('entregaUnidad').value) || 'ud',
      entregadoPorId: session ? (session.id || session.username || '') : '',
      entregadoPorNombre: session ? (session.nombre || session.username || '') : (document.getElementById('entregaEntregadoPor') && document.getElementById('entregaEntregadoPor').value) || ''
    };
    addEntregaMaterial(item);
    if (typeof enviarEntregaADiscord === 'function') enviarEntregaADiscord(item);
    document.getElementById('modalEntregaMaterial').classList.remove('active');
    if (typeof renderEntregasMaterial === 'function') renderEntregasMaterial();
    if (window._entregaDesdeFichaUserId && typeof renderMaterialEntregadoEnFicha === 'function') {
      renderMaterialEntregadoEnFicha(window._entregaDesdeFichaUserId);
      window._entregaDesdeFichaUserId = null;
    }
  });
  var btnRegistrarEntregaDesdeFicha = document.getElementById('btnRegistrarEntregaDesdeFicha');
  if (btnRegistrarEntregaDesdeFicha) btnRegistrarEntregaDesdeFicha.addEventListener('click', function () {
    var pantallaFicha = document.getElementById('pantallaFichaEmpleado');
    var userId = pantallaFicha && pantallaFicha.dataset && pantallaFicha.dataset.userId ? pantallaFicha.dataset.userId : null;
    if (!userId || typeof getUsers !== 'function') return;
    var users = getUsers().filter(function (u) { return u.activo !== false; });
    var u = users.find(function (x) { return x.id === userId; });
    if (!u) return;
    var modalEntrega = document.getElementById('modalEntregaMaterial');
    var selTrab = document.getElementById('entregaTrabajador');
    var selMat = document.getElementById('entregaMaterial');
    var fechaEl = document.getElementById('entregaFecha');
    var porEl = document.getElementById('entregaEntregadoPor');
    if (selTrab) {
      selTrab.innerHTML = '';
      users.forEach(function (us) {
        var opt = document.createElement('option');
        opt.value = (us.id || '') + '|' + (us.nombre || us.username || '');
        opt.textContent = us.nombre || us.username || us.id || '—';
        if ((us.id || '') === (u.id || '')) opt.selected = true;
        selTrab.appendChild(opt);
      });
    }
    if (selMat) {
      selMat.innerHTML = '<option value="">— Selecciona material —</option>';
      var cats = typeof CATEGORIA_INVENTARIO !== 'undefined' ? CATEGORIA_INVENTARIO : [];
      cats.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = (c.id || '') + '|' + ((c.grupo ? c.grupo + ' · ' : '') + (c.nombre || c.id));
        opt.textContent = (c.grupo ? c.grupo + ' · ' : '') + (c.nombre || c.id);
        selMat.appendChild(opt);
      });
    }
    if (fechaEl) { var n = new Date(); fechaEl.value = n.toISOString().slice(0, 16); }
    var session = typeof getSession === 'function' ? getSession() : null;
    if (porEl) porEl.value = session ? (session.nombre || session.username || '') : '';
    window._entregaDesdeFichaUserId = userId;
    if (modalEntrega) modalEntrega.classList.add('active');
  });
  document.getElementById('modalEntregaMaterialClose')?.addEventListener('click', function () { document.getElementById('modalEntregaMaterial').classList.remove('active'); });
  document.getElementById('modalEntregaMaterialBackdrop')?.addEventListener('click', function () { document.getElementById('modalEntregaMaterial').classList.remove('active'); });
  document.getElementById('modalDetalleMaterialesAlmacenClose')?.addEventListener('click', function () { document.getElementById('modalDetalleMaterialesAlmacen').classList.remove('active'); });
  document.getElementById('modalDetalleMaterialesAlmacenBackdrop')?.addEventListener('click', function () { document.getElementById('modalDetalleMaterialesAlmacen').classList.remove('active'); });
  document.getElementById('modalRegistrarMaterialesRecuperadosClose')?.addEventListener('click', function () { document.getElementById('modalRegistrarMaterialesRecuperados').classList.remove('active'); });
  document.getElementById('modalRegistrarMaterialesRecuperadosBackdrop')?.addEventListener('click', function () { document.getElementById('modalRegistrarMaterialesRecuperados').classList.remove('active'); });
  var btnRegistrarMat = document.getElementById('btnRegistrarMaterialesRecuperados');
  if (btnRegistrarMat) btnRegistrarMat.addEventListener('click', function () {
    if (typeof renderFormRegistrarMaterialesRecuperados === 'function') renderFormRegistrarMaterialesRecuperados();
    document.getElementById('modalRegistrarMaterialesRecuperados').classList.add('active');
  });
  var btnAlmacenTodoCero = document.getElementById('btnAlmacenPonerTodoCero');
  if (btnAlmacenTodoCero && typeof setStockMaterialCero === 'function' && typeof TIPOS_MATERIAL_ALMACEN !== 'undefined') {
    btnAlmacenTodoCero.addEventListener('click', function () {
      if (!confirm('¿Poner todas las cantidades del almacén a 0? Esto no se puede deshacer.')) return;
      TIPOS_MATERIAL_ALMACEN.forEach(function (t) { setStockMaterialCero(t.id); });
      if (typeof renderAlmacenMateriales === 'function') renderAlmacenMateriales();
      if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
    });
  }
  var formRegistrarMat = document.getElementById('formRegistrarMaterialesRecuperados');
  if (formRegistrarMat && typeof addMaterialesAlmacen === 'function') formRegistrarMat.addEventListener('submit', function (e) {
    e.preventDefault();
    var movimiento = {};
    if (typeof TIPOS_MATERIAL_ALMACEN !== 'undefined') {
      TIPOS_MATERIAL_ALMACEN.forEach(function (t) {
        var inp = document.getElementById('almacen_q_' + t.id);
        var val = inp ? parseFloat(inp.value) : 0;
        if (val > 0) movimiento[t.id] = val;
      });
    }
    if (Object.keys(movimiento).length === 0) { alert('Indica al menos una cantidad mayor que 0.'); return; }
    addMaterialesAlmacen(movimiento);
    document.getElementById('modalRegistrarMaterialesRecuperados').classList.remove('active');
    if (typeof renderAlmacenMateriales === 'function') renderAlmacenMateriales();
    if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
    alert('Materiales registrados en el almacén.');
  });
  var btnMaterialesRecupHome = document.getElementById('btnMaterialesRecuperadosHome');
  if (btnMaterialesRecupHome) btnMaterialesRecupHome.addEventListener('click', function () { if (typeof cerrarTodasPantallasSecundarias === 'function') cerrarTodasPantallasSecundarias(); });
  var btnMaterialesRecupGuardarRegistro = document.getElementById('btnMaterialesRecupGuardarRegistro');
  if (btnMaterialesRecupGuardarRegistro) btnMaterialesRecupGuardarRegistro.addEventListener('click', function () {
    var datos = typeof getMaterialesRecuperadosFormData === 'function' ? getMaterialesRecuperadosFormData() : { movimiento: {}, empleadoNombre: '' };
    if (Object.keys(datos.movimiento).length === 0) { alert('Indica al menos una cantidad mayor que 0.'); return; }
    if (typeof addMaterialesAlmacen === 'function') addMaterialesAlmacen(datos.movimiento);
    if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
    if (typeof renderAlmacenMateriales === 'function') renderAlmacenMateriales();
    if (typeof enviarMaterialesRecuperadosADiscord === 'function') enviarMaterialesRecuperadosADiscord(datos);
  });
  var formCompra = document.getElementById('formCompra');
  if (formCompra) formCompra.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('compraId').value;
    var session = typeof getSession === 'function' ? getSession() : null;
    var data = {
      concepto: document.getElementById('compraConcepto').value,
      categoria: document.getElementById('compraCategoria').value,
      cantidad: parseFloat(document.getElementById('compraCantidad').value) || 1,
      unidad: document.getElementById('compraUnidad').value || 'ud',
      importeEstimado: parseFloat(document.getElementById('compraImporteEstimado').value) || 0,
      solicitadoPor: document.getElementById('compraSolicitadoPor').value || (session && (session.nombre || session.username)) || '',
      estado: document.getElementById('compraEstado').value || 'pendiente',
      notas: document.getElementById('compraNotas').value
    };
    if (id) { if (typeof updateCompra === 'function') updateCompra(id, data); } else { if (typeof addCompra === 'function') addCompra(data); }
    document.getElementById('modalCompra').classList.remove('active');
    renderComprasPendientes();
    if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
  });
  document.getElementById('modalCompraClose')?.addEventListener('click', function () { document.getElementById('modalCompra').classList.remove('active'); });
  document.getElementById('modalCompraBackdrop')?.addEventListener('click', function () { document.getElementById('modalCompra').classList.remove('active'); });
  document.getElementById('modalDetallePedidoClose')?.addEventListener('click', function () { document.getElementById('modalDetallePedido').classList.remove('active'); });
  document.getElementById('modalDetallePedidoBackdrop')?.addEventListener('click', function () { document.getElementById('modalDetallePedido').classList.remove('active'); });
  document.getElementById('btnRepetirCompra')?.addEventListener('click', function () {
    var modal = document.getElementById('modalDetallePedido');
    var id = modal && modal.getAttribute('data-detalle-compra-id');
    if (id && typeof repetirCompra === 'function') repetirCompra(id);
  });
  var formInv = document.getElementById('formInventario');
  if (formInv) formInv.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('inventarioId').value;
    var conceptoEl = document.getElementById('inventarioConcepto');
    var session = typeof getSession === 'function' ? getSession() : null;
    var puedeEditarStock = session && (typeof hasPermission === 'function' && hasPermission(session, 'gestionarUsuarios'));
    var stockMinVal = parseFloat(document.getElementById('inventarioStockMinimo').value);
    var stockMaxRaw = document.getElementById('inventarioStockMaximo').value;
    var stockMaxVal = (stockMaxRaw === '' || stockMaxRaw === null || stockMaxRaw === undefined) ? null : (parseFloat(stockMaxRaw) || null);
    if (!puedeEditarStock) {
      var inv = typeof getInventario === 'function' ? getInventario() : null;
      var conceptoId = (conceptoEl && conceptoEl.value) || '';
      if (Array.isArray(inv) && id) {
        var existing = inv.find(function (x) { return x.id === id; });
        if (existing) { stockMinVal = existing.stockMinimo != null ? existing.stockMinimo : 0; stockMaxVal = existing.stockMaximo != null ? existing.stockMaximo : null; }
        else { stockMinVal = 0; stockMaxVal = null; }
      } else if (conceptoId && typeof getLimitesStock === 'function') {
        var lim = getLimitesStock()[conceptoId];
        if (lim) { stockMinVal = lim.stockMinimo != null ? lim.stockMinimo : 0; stockMaxVal = lim.stockMaximo != null ? lim.stockMaximo : null; }
        else { stockMinVal = 0; stockMaxVal = null; }
      } else {
        stockMinVal = 0;
        stockMaxVal = null;
      }
    }
    var data = {
      solicitante: (document.getElementById('inventarioSolicitante') && document.getElementById('inventarioSolicitante').value) || '',
      categoria: (conceptoEl && conceptoEl.value) || '',
      cantidadAPedir: parseFloat(document.getElementById('inventarioCantidadAPedir').value) || 1,
      cantidad: parseFloat(document.getElementById('inventarioCantidad').value) || 0,
      unidad: (document.getElementById('inventarioUnidad') && document.getElementById('inventarioUnidad').value) || 'ud',
      stockMinimo: isNaN(stockMinVal) ? 0 : stockMinVal,
      stockMaximo: stockMaxVal,
      notas: (document.getElementById('inventarioNotas') && document.getElementById('inventarioNotas').value) || ''
    };
    if (id) { if (typeof updateInventarioItem === 'function') updateInventarioItem(id, data); } else { if (typeof addInventarioItem === 'function') addInventarioItem(data); }
    document.getElementById('modalInventario').classList.remove('active');
    renderInventario();
    if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
  });
  document.getElementById('modalInventarioClose')?.addEventListener('click', function () { document.getElementById('modalInventario').classList.remove('active'); });
  document.getElementById('modalInventarioBackdrop')?.addEventListener('click', function () { document.getElementById('modalInventario').classList.remove('active'); });
  var formGasto = document.getElementById('formGasto');
  if (formGasto) formGasto.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = document.getElementById('gastoId').value;
    var data = {
      fecha: document.getElementById('gastoFecha').value,
      categoria: document.getElementById('gastoCategoria').value,
      concepto: document.getElementById('gastoConcepto').value,
      importe: parseFloat(document.getElementById('gastoImporte').value) || 0,
      recurrente: document.getElementById('gastoRecurrente').checked,
      registradoPor: document.getElementById('gastoRegistradoPor').value,
      notas: document.getElementById('gastoNotas').value
    };
    if (id) { if (typeof updateGasto === 'function') updateGasto(id, data); } else { if (typeof addGasto === 'function') addGasto(data); }
    document.getElementById('modalGasto').classList.remove('active');
    renderGastos();
    if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
  });
  document.getElementById('modalGastoClose')?.addEventListener('click', function () { document.getElementById('modalGasto').classList.remove('active'); });
  document.getElementById('modalGastoBackdrop')?.addEventListener('click', function () { document.getElementById('modalGasto').classList.remove('active'); });
  var inputPrevisionMes = document.getElementById('economiaPrevisionMes');
  if (inputPrevisionMes) inputPrevisionMes.addEventListener('change', function () { renderPrevisiones(); });
}

// ========== SUBIR VIDEO (todos los usuarios → bandeja admin) ==========
function vincularSubirVideo() {
  const btn = document.getElementById('btnSubirVideo');
  const modal = document.getElementById('modalSubirVideo');
  const form = document.getElementById('formSubirVideo');
  const inputUrl = document.getElementById('subirVideoUrl');
  const inputFile = document.getElementById('subirVideoFile');
  const errEl = document.getElementById('subirVideoError');
  if (!btn || !modal || !form) return;

  function hideError() { if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; } }
  function showError(msg) { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } }

  btn.addEventListener('click', function () {
    hideError();
    if (inputUrl) inputUrl.value = '';
    if (inputFile) inputFile.value = '';
    modal.classList.add('active');
  });
  document.getElementById('modalSubirVideoClose')?.addEventListener('click', function () { modal.classList.remove('active'); hideError(); });
  document.getElementById('modalSubirVideoBackdrop')?.addEventListener('click', function () { modal.classList.remove('active'); hideError(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError();
    const session = getSession();
    if (!session) { showError('Debes estar identificado.'); return; }
    const url = (inputUrl && inputUrl.value) ? inputUrl.value.trim() : '';
    const file = (inputFile && inputFile.files && inputFile.files[0]) ? inputFile.files[0] : null;
    if (!url && !file) { showError('Indica una URL o selecciona un archivo de vídeo.'); return; }

    const submittedBy = (session.nombre || session.username || 'Usuario').trim();

    if (url) {
      addPendingMedia({ submittedBy, url: url });
      modal.classList.remove('active');
      form.reset();
      return;
    }

    const reader = new FileReader();
    const maxBytes = MEDIA_MAX_DATAURL_MB * 1024 * 1024;
    if (file.size > maxBytes) { showError('El archivo es demasiado grande (máx. ' + MEDIA_MAX_DATAURL_MB + ' MB). Usa una URL en su lugar.'); return; }
    reader.onload = function () {
      const dataUrl = reader.result;
      addPendingMedia({ submittedBy, dataUrl: dataUrl, fileName: file.name });
      modal.classList.remove('active');
      form.reset();
    };
    reader.onerror = function () { showError('No se pudo leer el archivo.'); };
    reader.readAsDataURL(file);
  });
}

function abrirModalVerVideoSolicitud(item) {
  var modal = document.getElementById('modalVerVideoSolicitud');
  var player = document.getElementById('modalVerVideoSolicitudPlayer');
  var info = document.getElementById('modalVerVideoSolicitudInfo');
  if (!modal || !player || !info) return;
  var src = item.dataUrl || item.url || '';
  var fecha = item.submittedAt ? new Date(item.submittedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  info.textContent = 'Enviado por ' + (item.submittedBy || '—') + ' · ' + fecha + (item.fileName ? ' · ' + item.fileName : '');
  modal.setAttribute('data-sol-id', item.id || '');
  player.src = src;
  player.load();
  modal.classList.add('active');
}

function cerrarModalVerVideoSolicitud() {
  var modal = document.getElementById('modalVerVideoSolicitud');
  var player = document.getElementById('modalVerVideoSolicitudPlayer');
  if (modal) modal.classList.remove('active');
  if (player) { player.pause(); player.removeAttribute('src'); }
}

function vincularModalVerVideoSolicitud() {
  var modal = document.getElementById('modalVerVideoSolicitud');
  var closeBtn = document.getElementById('modalVerVideoSolicitudClose');
  var backdrop = document.getElementById('modalVerVideoSolicitudBackdrop');
  var btnAprobar = document.getElementById('modalVerVideoSolicitudAprobar');
  var btnRechazar = document.getElementById('modalVerVideoSolicitudRechazar');
  if (closeBtn) closeBtn.addEventListener('click', cerrarModalVerVideoSolicitud);
  if (backdrop) backdrop.addEventListener('click', cerrarModalVerVideoSolicitud);
  if (btnAprobar) btnAprobar.addEventListener('click', function () {
    var id = modal && modal.getAttribute('data-sol-id');
    if (!id) return;
    var item = getPendingMedia().find(function (m) { return m.id === id; });
    if (!item) return;
    var src = item.dataUrl || item.url;
    if (src) {
      addApprovedMedia(src);
      removePendingMedia(id);
      initContentLoop();
      renderSolicitudesGraficas();
    }
    cerrarModalVerVideoSolicitud();
  });
  if (btnRechazar) btnRechazar.addEventListener('click', function () {
    var id = modal && modal.getAttribute('data-sol-id');
    if (id) {
      removePendingMedia(id);
      renderSolicitudesGraficas();
    }
    cerrarModalVerVideoSolicitud();
  });
}

function renderSolicitudesGraficas() {
  const listEl = document.getElementById('solicitudesGraficasLista');
  const emptyEl = document.getElementById('solicitudesGraficasVacio');
  if (!listEl) return;
  const pending = getPendingMedia();
  if (pending.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  const fragment = document.createDocumentFragment();
  pending.forEach(function (item) {
    const card = document.createElement('div');
    card.className = 'solicitud-grafica-card';
    card.setAttribute('data-sol-id', item.id);
    const fecha = item.submittedAt ? new Date(item.submittedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    let previewHtml;
    if (item.dataUrl) {
      previewHtml = '<video class="solicitud-grafica-preview-video" muted preload="metadata" playsinline></video>';
    } else if (item.url) {
      previewHtml = '<p class="solicitud-grafica-preview-url"><a href="' + escapeHtmlAttr(item.url) + '" target="_blank" rel="noopener">Ver enlace</a></p>';
    } else {
      previewHtml = '<p class="solicitud-grafica-preview-url">—</p>';
    }
    card.innerHTML =
      '<div class="solicitud-grafica-preview">' + previewHtml + '</div>' +
      '<div class="solicitud-grafica-info">' +
        '<span class="solicitud-grafica-user">' + escapeHtml(item.submittedBy || '—') + '</span>' +
        '<span class="solicitud-grafica-date">' + escapeHtml(fecha) + '</span>' +
        (item.fileName ? '<span class="solicitud-grafica-filename">' + escapeHtml(item.fileName) + '</span>' : '') +
      '</div>' +
      '<div class="solicitud-grafica-actions">' +
        '<button type="button" class="btn btn-outline btn-sm btn-sol-ver-video" data-sol-id="' + escapeHtmlAttr(item.id) + '" title="Abrir y reproducir vídeo">Ver vídeo</button>' +
        '<button type="button" class="btn btn-outline btn-sm btn-sol-aprobar" data-sol-id="' + escapeHtmlAttr(item.id) + '">Aprobar</button>' +
        '<button type="button" class="btn btn-outline btn-sm btn-sol-rechazar" data-sol-id="' + escapeHtmlAttr(item.id) + '">Rechazar</button>' +
      '</div>';
    if (item.dataUrl) {
      var video = card.querySelector('.solicitud-grafica-preview-video');
      if (video) video.src = item.dataUrl;
    }
    fragment.appendChild(card);
  });
  listEl.innerHTML = '';
  listEl.appendChild(fragment);

  listEl.querySelectorAll('.btn-sol-ver-video').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-sol-id');
      var item = getPendingMedia().find(function (m) { return m.id === id; });
      if (!item) return;
      abrirModalVerVideoSolicitud(item);
    });
  });
  listEl.querySelectorAll('.btn-sol-aprobar').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-sol-id');
      const item = getPendingMedia().find(function (m) { return m.id === id; });
      if (!item) return;
      const src = item.dataUrl || item.url;
      if (src) {
        addApprovedMedia(src);
        removePendingMedia(id);
        initContentLoop();
        renderSolicitudesGraficas();
      }
    });
  });
  listEl.querySelectorAll('.btn-sol-rechazar').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-sol-id');
      removePendingMedia(id);
      renderSolicitudesGraficas();
    });
  });
  if (typeof renderRegistroTestNormativas === 'function') renderRegistroTestNormativas();
}

function renderRegistroTestNormativas() {
  var listEl = document.getElementById('registroTestNormativasLista');
  var emptyEl = document.getElementById('registroTestNormativasVacio');
  if (!listEl) return;
  var registros = getRegistroTestNormativas();
  if (registros.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  var html = '<table class="registro-test-normativas-tabla"><thead><tr><th>Usuario</th><th>Fecha y hora</th><th>Resultado</th></tr></thead><tbody>';
  registros.forEach(function (r) {
    var fechaStr = r.fecha ? new Date(r.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    var resultado = r.aprobado ? 'Aprobado' : 'No aprobado';
    var clase = r.aprobado ? 'resultado-aprobado' : 'resultado-no-aprobado';
    html += '<tr><td>' + escapeHtml(r.userNombre || r.userId || '—') + '</td><td>' + escapeHtml(fechaStr) + '</td><td class="' + clase + '">' + escapeHtml(resultado) + '</td></tr>';
  });
  html += '</tbody></table>';
  listEl.innerHTML = html;
}

function escapeHtmlAttr(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Genera HTML de una placa para tablas/listas: imagen de placa + número centrado, o solo número en marco simple. */
function buildMatriculaPlateHtml(matricula) {
  var mat = (matricula || '—').toString().trim();
  var useImage = typeof hasPlateImagesFromRepo === 'function' && hasPlateImagesFromRepo();
  var imgUrl = useImage && typeof getPlateImageAleatorio === 'function' ? getPlateImageAleatorio() : null;
  if (imgUrl) {
    var srcEscaped = String(imgUrl).replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return '<div class="matricula-plate-photo-wrap matricula-plate-mini" aria-label="Matrícula ' + escapeHtmlAttr(mat) + '">' +
      '<img src="' + srcEscaped + '" alt="" class="matricula-plate-photo-img" onerror="this.style.display=\'none\';this.parentElement.classList.add(\'matricula-plate-no-img\');">' +
      '<span class="matricula-plate-number-overlay">' + escapeHtml(mat) + '</span></div>';
  }
  return '<div class="matricula-plate-mini-simple" aria-label="Matrícula ' + escapeHtmlAttr(mat) + '">' +
    '<span class="matricula-plate-display">' + escapeHtml(mat) + '</span></div>';
}

// ========== NORMATIVAS (lectura obligatoria / consulta) ==========
var _normativasUserId = null;
var _normativasObligatorio = false;
var _normativasDocIndex = -1;
var _normativasPageIndex = 0;

function initNormativasPantalla(userId, obligatorio) {
  _normativasUserId = userId;
  _normativasObligatorio = !!obligatorio;
  var progressWrap = document.getElementById('normativasProgressWrap');
  var footer = document.getElementById('normativasFooter');
  var subtitle = document.getElementById('normativasSubtitle');
  var btnCerrar = document.getElementById('normativasBtnCerrar');
  var formularioWrap = document.querySelector('.normativas-formulario-mecanicos-wrap');
  if (progressWrap) progressWrap.style.display = obligatorio ? 'block' : 'none';
  if (footer) footer.style.display = 'none';
  if (subtitle) subtitle.textContent = obligatorio ? 'Es obligatorio leer todas las páginas de cada documento antes de acceder al taller.' : 'Consulta las normativas del taller.';
  if (btnCerrar) btnCerrar.style.display = obligatorio ? 'none' : 'block';
  if (formularioWrap) formularioWrap.style.display = obligatorio ? 'none' : '';
  renderNormativasList();
  showNormativasList();
  if (!window._normativasUiBound) {
    bindNormativasContinuar();
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarNormativasConsulta);
    var linkForm = document.getElementById('normativasFormularioLink');
    var btnCopiarForm = document.getElementById('normativasFormularioCopiar');
    if (linkForm) linkForm.href = (window.location.href.replace(/\/[^/]*$/, '/') || window.location.origin + '/') + 'formulario-mecanicos.html';
    if (btnCopiarForm) {
      btnCopiarForm.addEventListener('click', function () {
        var url = (linkForm && linkForm.href) ? linkForm.href : (window.location.href.replace(/\/[^/]*$/, '/') || window.location.origin + '/') + 'formulario-mecanicos.html';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { if (typeof alert === 'function') alert('Enlace copiado al portapapeles. Puedes compartirlo.'); }).catch(function () { window.prompt('Copia este enlace:', url); });
        } else {
          window.prompt('Copia este enlace:', url);
        }
      });
    }
    window._normativasUiBound = true;
  }
}

function showNormativasList() {
  document.getElementById('normativasListWrap').style.display = '';
  document.getElementById('normativasReaderWrap').style.display = 'none';
  var leidoTodo = hasLeidoTodasNormativas(_normativasUserId);
  var testPasado = hasPasadoTestNormativas(_normativasUserId);
  var testWrap = document.getElementById('normativasTestWrap');
  var footer = document.getElementById('normativasFooter');
  if (testWrap) testWrap.style.display = (_normativasObligatorio && leidoTodo && !testPasado) ? 'block' : 'none';
  if (footer) footer.style.display = (_normativasObligatorio && leidoTodo && testPasado) ? 'block' : 'none';
  if (testWrap && testWrap.style.display === 'block') {
    _normativasTestActual = typeof getTestNormativasAleatorio === 'function' ? getTestNormativasAleatorio() : [];
    renderNormativasTestPreguntas();
  }
  actualizarNormativasProgress();
}

function showNormativasReader() {
  document.getElementById('normativasListWrap').style.display = 'none';
  document.getElementById('normativasReaderWrap').style.display = '';
  actualizarNormativasProgress();
}

function renderNormativasList() {
  var list = document.getElementById('normativasList');
  if (!list || typeof getNormativasConPages !== 'function') return;
  var docs = getNormativasConPages();
  var leidas = getNormativasLeidas(_normativasUserId);
  list.innerHTML = '';
  docs.forEach(function (doc, idx) {
    var pagesRead = (leidas[doc.id] || []).filter(Boolean).length;
    var total = (doc.pages || []).length;
    var completo = total > 0 && pagesRead >= total;
    var li = document.createElement('li');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-doc' + (completo ? ' doc-leido' : '');
    btn.setAttribute('data-doc-index', String(idx));
    btn.textContent = doc.title + (completo ? ' ✓' : ' (' + pagesRead + '/' + total + ')');
    btn.addEventListener('click', function () {
      _normativasDocIndex = parseInt(this.getAttribute('data-doc-index'), 10);
      _normativasPageIndex = 0;
      openNormativasDoc();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function openNormativasDoc() {
  if (typeof getNormativasConPages !== 'function') return;
  var docs = getNormativasConPages();
  var doc = docs[_normativasDocIndex];
  if (!doc || !doc.pages || !doc.pages.length) return;
  document.getElementById('normativasReaderTitle').textContent = doc.title;
  _normativasPageIndex = Math.min(_normativasPageIndex, doc.pages.length - 1);
  renderNormativasPage();
  showNormativasReader();
}

function renderNormativasPage() {
  var docs = getNormativasConPages();
  var doc = docs[_normativasDocIndex];
  if (!doc || !doc.pages) return;
  var pages = doc.pages;
  var pageNum = _normativasPageIndex + 1;
  var total = pages.length;
  document.getElementById('normativasReaderPage').textContent = 'Página ' + pageNum + ' de ' + total;
  var content = document.getElementById('normativasReaderContent');
  content.textContent = pages[_normativasPageIndex] || '';
  content.scrollTop = 0;
  document.getElementById('normativasReaderPrev').disabled = _normativasPageIndex <= 0;
  document.getElementById('normativasReaderNext').textContent = _normativasPageIndex >= total - 1 ? 'Cerrar documento' : 'Siguiente';
  setNormativaPaginaLeida(_normativasUserId, doc.id, _normativasPageIndex);
}

function actualizarNormativasProgress() {
  var progressWrap = document.getElementById('normativasProgressWrap');
  var progressText = document.getElementById('normativasProgressText');
  var footer = document.getElementById('normativasFooter');
  if (!progressText || !_normativasUserId) return;
  var docs = getNormativasConPages();
  var leidas = getNormativasLeidas(_normativasUserId);
  var totalPages = 0;
  var readPages = 0;
  docs.forEach(function (d) {
    var p = (d.pages || []).length;
    totalPages += p;
    readPages += (leidas[d.id] || []).filter(Boolean).length;
  });
  progressText.textContent = 'Has leído ' + readPages + ' de ' + totalPages + ' páginas.';
  if (footer && _normativasObligatorio) {
    var leidoTodo = hasLeidoTodasNormativas(_normativasUserId);
    var testPasado = hasPasadoTestNormativas(_normativasUserId);
    footer.style.display = (leidoTodo && testPasado) ? 'block' : 'none';
  }
  var testWrap = document.getElementById('normativasTestWrap');
  if (testWrap && _normativasObligatorio) {
    var leidoTodo2 = hasLeidoTodasNormativas(_normativasUserId);
    var testPasado2 = hasPasadoTestNormativas(_normativasUserId);
    testWrap.style.display = (leidoTodo2 && !testPasado2) ? 'block' : 'none';
  }
}

function renderNormativasTestPreguntas() {
  var container = document.getElementById('normativasTestPreguntas');
  var msgEl = document.getElementById('normativasTestMensaje');
  var preguntas = Array.isArray(_normativasTestActual) && _normativasTestActual.length ? _normativasTestActual : [];
  if (!container) return;
  if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; msgEl.className = 'normativas-test-mensaje'; }
  container.innerHTML = '';
  preguntas.forEach(function (q, i) {
    var block = document.createElement('div');
    block.className = 'normativas-test-pregunta';
    var label = document.createElement('label');
    label.textContent = (i + 1) + '. ' + q.pregunta;
    block.appendChild(label);
    var opts = document.createElement('div');
    opts.className = 'normativas-test-opciones';
    (q.opciones || []).forEach(function (opt, j) {
      var wrap = document.createElement('label');
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'normativas-q' + i;
      radio.value = String(j);
      wrap.appendChild(radio);
      wrap.appendChild(document.createTextNode(opt));
      opts.appendChild(wrap);
    });
    block.appendChild(opts);
    container.appendChild(block);
  });
}

function bindNormativasContinuar() {
  var back = document.getElementById('normativasReaderBack');
  var prev = document.getElementById('normativasReaderPrev');
  var next = document.getElementById('normativasReaderNext');
  var continuar = document.getElementById('normativasBtnContinuar');
  if (back) back.addEventListener('click', function () {
    renderNormativasList();
    showNormativasList();
  });
  if (prev) prev.addEventListener('click', function () {
    if (_normativasPageIndex > 0) {
      _normativasPageIndex--;
      renderNormativasPage();
    }
  });
  if (next) next.addEventListener('click', function () {
    var docs = getNormativasConPages();
    var doc = docs[_normativasDocIndex];
    var total = (doc && doc.pages) ? doc.pages.length : 0;
    if (_normativasPageIndex < total - 1) {
      _normativasPageIndex++;
      renderNormativasPage();
    } else {
      renderNormativasList();
      showNormativasList();
    }
  });
  if (continuar) continuar.addEventListener('click', function () {
    document.getElementById('normativasScreen').style.display = 'none';
    document.getElementById('appContent').style.display = 'block';
    entrarApp(getSession());
    init();
    vincularAdmin();
    vincularOrganigrama();
    vincularFichajes();
    actualizarLedFichaje();
  });

  var testForm = document.getElementById('normativasTestForm');
  var testMsg = document.getElementById('normativasTestMensaje');
  if (testForm) testForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!_normativasUserId || !Array.isArray(_normativasTestActual) || !_normativasTestActual.length) return;
    var fallos = 0;
    _normativasTestActual.forEach(function (q, i) {
      var radio = document.querySelector('input[name="normativas-q' + i + '"]:checked');
      var val = radio ? parseInt(radio.value, 10) : -1;
      if (val !== q.correcta) fallos++;
    });
    var userNombre = (typeof getSession === 'function' && getSession()) ? (getSession().nombre || getSession().username || _normativasUserId) : _normativasUserId;
    addRegistroTestNormativas({ userId: _normativasUserId, userNombre: userNombre, fecha: new Date().toISOString(), aprobado: fallos === 0 });
    if (testMsg) {
      testMsg.style.display = 'block';
      if (fallos > 0) {
        testMsg.className = 'normativas-test-mensaje error';
        testMsg.textContent = 'Has fallado ' + fallos + ' pregunta(s). Revisa las normativas e instrucciones y vuelve a intentar.';
      } else {
        testMsg.className = 'normativas-test-mensaje ok';
        testMsg.textContent = '¡Correcto! Has superado el test. Puedes continuar al taller.';
        setTestNormativasPasado(_normativasUserId);
        document.getElementById('normativasTestWrap').style.display = 'none';
        var footer = document.getElementById('normativasFooter');
        if (footer) footer.style.display = 'block';
      }
    }
  });
}

function vincularNormativas() {
  var btn = document.getElementById('btnNormativas');
  if (!btn || btn.dataset.normativasBound) return;
  btn.dataset.normativasBound = '1';
  btn.addEventListener('click', function () {
    var session = getSession();
    if (!session) return;
    _normativasUserId = session.id;
    _normativasObligatorio = false;
    document.getElementById('normativasScreen').style.display = 'flex';
    document.getElementById('appContent').style.display = 'none';
    if (typeof mostrarChatbotWrap === 'function') mostrarChatbotWrap(false);
    document.getElementById('normativasProgressWrap').style.display = 'none';
    document.getElementById('normativasFooter').style.display = 'none';
    var subtitle = document.getElementById('normativasSubtitle');
    if (subtitle) subtitle.textContent = 'Consulta las normativas del taller.';
    var btnCerrar = document.getElementById('normativasBtnCerrar');
    if (btnCerrar) btnCerrar.style.display = 'block';
    initNormativasPantalla(session.id, false);
  });
}

// Cerrar normativas desde consulta (botón Volver al listado puede volver; necesitamos un "Cerrar" que cierre la pantalla cuando estamos en modo consulta)
function cerrarNormativasConsulta() {
  if (!_normativasObligatorio) {
    document.getElementById('normativasScreen').style.display = 'none';
    document.getElementById('appContent').style.display = 'block';
    if (typeof mostrarChatbotWrap === 'function') mostrarChatbotWrap(true);
  }
}

// ========== VACANTES (solicitudes de trabajo, solo administradores) ==========
var VACANTES_STORAGE = 'benny_vacantes_solicitudes';

function getSolicitudesVacantes() {
  try {
    var list = JSON.parse(localStorage.getItem(VACANTES_STORAGE) || '[]');
    var legacy = JSON.parse(localStorage.getItem('benny_formulario_mecanicos') || '[]');
    if (legacy.length > 0) {
      legacy.forEach(function (s) {
        if (!s.id) { s.id = (s.fecha || Date.now()) + '-' + Math.random().toString(36).slice(2, 10); s.estado = 'pendiente'; }
        list.push(s);
      });
      localStorage.removeItem('benny_formulario_mecanicos');
      saveSolicitudesVacantes(list);
    }
    return list;
  } catch (e) {
    return [];
  }
}

function saveSolicitudesVacantes(list) {
  try {
    localStorage.setItem(VACANTES_STORAGE, JSON.stringify(list));
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  } catch (e) {}
}

function updateSolicitudVacante(id, updates) {
  var list = getSolicitudesVacantes();
  var idx = list.findIndex(function (s) { return s.id === id; });
  if (idx < 0) return;
  list[idx] = Object.assign({}, list[idx], updates);
  saveSolicitudesVacantes(list);
}

function renderListaVacantes() {
  var listEl = document.getElementById('listaVacantes');
  var emptyEl = document.getElementById('vacantesEmpty');
  if (!listEl) return;
  var list = getSolicitudesVacantes();
  var filtroEstado = (document.getElementById('filtroVacantesEstado') && document.getElementById('filtroVacantesEstado').value) || '';
  var filtroBuscar = (document.getElementById('filtroVacantesBuscar') && document.getElementById('filtroVacantesBuscar').value || '').trim().toLowerCase();
  if (filtroEstado) list = list.filter(function (s) { return (s.estado || 'pendiente') === filtroEstado; });
  if (filtroBuscar) list = list.filter(function (s) {
    var texto = [(s.nombre || ''), (s.contacto || ''), (s.motivacion || '')].join(' ').toLowerCase();
    return texto.indexOf(filtroBuscar) !== -1;
  });
  list.sort(function (a, b) { return new Date(b.fecha || 0) - new Date(a.fecha || 0); });
  if (emptyEl) emptyEl.style.display = list.length === 0 ? 'block' : 'none';
  listEl.innerHTML = '';
  list.forEach(function (s) {
    var card = document.createElement('div');
    card.className = 'vacante-card';
    card.setAttribute('data-vacante-id', (s.id || '').toString());
    var estado = s.estado || 'pendiente';
    var estadoLabel = estado === 'pendiente' ? 'Pendiente' : estado === 'aprobada' ? 'Aprobada' : 'Denegada';
    var fechaStr = s.fecha ? new Date(s.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    card.innerHTML = '<div class="vacante-card-info">' +
      '<div class="vacante-card-nombre">' + escapeHtml(s.nombre || '—') + '</div>' +
      '<div class="vacante-card-meta">' + escapeHtml(s.contacto || '') + ' · ' + fechaStr + '</div>' +
      '</div>' +
      '<span class="vacante-card-badge ' + escapeHtmlAttr(estado) + '">' + escapeHtml(estadoLabel) + '</span>' +
      '<button type="button" class="btn btn-outline btn-sm btn-ver-vacante" data-id="' + escapeHtmlAttr(s.id) + '">Ver solicitud</button>';
    listEl.appendChild(card);
  });
  listEl.querySelectorAll('.btn-ver-vacante').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-id');
      if (id && typeof openModalVacanteSolicitud === 'function') openModalVacanteSolicitud(id);
    });
  });
}

function openModalVacanteSolicitud(id) {
  var list = getSolicitudesVacantes();
  var s = list.find(function (x) { return x.id === id; });
  if (!s) return;
  var modal = document.getElementById('modalVacanteSolicitud');
  var nombreEl = document.getElementById('modalVacanteNombre');
  var contenidoEl = document.getElementById('modalVacanteContenido');
  var checkRevisado = document.getElementById('modalVacanteHeRevisado');
  var accionesWrap = document.getElementById('modalVacanteAcciones');
  var estadoEl = document.getElementById('modalVacanteEstado');
  if (!modal || !contenidoEl) return;
  if (nombreEl) nombreEl.textContent = s.nombre || '—';
  var estado = s.estado || 'pendiente';
  var labels = {
    experiencia_rp: { menos_1: 'Menos de 1 mes', '1_3': '1–3 meses', '3_6': '3–6 meses', '6_12': '6–12 meses', mas_1: 'Más de 1 año' },
    experiencia_mecanico: { no: 'No, primera vez', otro_servidor: 'Sí, en otro servidor', este_servidor: 'Sí, en este servidor' },
    normativas: { si: 'Sí, las he leído', parcial: 'Parcialmente', no: 'Aún no' }
  };
  var secciones = [
    { titulo: 'Datos personaje (IC)', texto: s.nombre || '—' },
    { titulo: 'Contacto (OOC)', texto: s.contacto || '—' },
    { titulo: 'Experiencia en roleplay / vehículos', texto: (labels.experiencia_rp && labels.experiencia_rp[s.experiencia_rp]) || s.experiencia_rp || '—' },
    { titulo: 'Experiencia como mecánico', texto: (labels.experiencia_mecanico && labels.experiencia_mecanico[s.experiencia_mecanico]) || s.experiencia_mecanico || '—' },
    { titulo: 'Normativas del taller', texto: (labels.normativas && labels.normativas[s.normativas]) || s.normativas || '—' },
    { titulo: 'Disponibilidad horaria', texto: s.disponibilidad || '—' },
    { titulo: 'Motivación', texto: s.motivacion || '—' },
    { titulo: 'Descripción del personaje', texto: s.descripcion || '—' },
    { titulo: 'Convenios (SAPD, etc.)', texto: s.convenios || '—' },
    { titulo: 'Otro', texto: s.otro || '—' }
  ];
  contenidoEl.innerHTML = secciones.map(function (sec) {
    return '<div class="vacante-seccion"><h4>' + escapeHtml(sec.titulo) + '</h4><p>' + escapeHtml(sec.texto) + '</p></div>';
  }).join('');
  if (checkRevisado) { checkRevisado.checked = false; }
  var revisadoWrap = modal.querySelector('.vacante-solicitud-revisado-wrap');
  if (revisadoWrap) revisadoWrap.style.display = estado === 'pendiente' ? '' : 'none';
  if (estado === 'pendiente') {
    if (accionesWrap) { accionesWrap.style.display = 'none'; }
    if (estadoEl) { estadoEl.textContent = ''; estadoEl.style.display = 'none'; }
  } else {
    if (accionesWrap) accionesWrap.style.display = 'none';
    if (estadoEl) {
      estadoEl.style.display = 'block';
      estadoEl.textContent = 'Estado: ' + (estado === 'aprobada' ? 'Aprobada' : 'Denegada') + (s.fechaRevision ? ' · ' + new Date(s.fechaRevision).toLocaleString('es-ES') : '') + (s.revisadoPor ? ' · ' + s.revisadoPor : '');
    }
  }
  function toggleAcciones() {
    if (estado !== 'pendiente') return;
    if (accionesWrap) accionesWrap.style.display = checkRevisado && checkRevisado.checked ? 'flex' : 'none';
  }
  if (checkRevisado) {
    checkRevisado.onchange = toggleAcciones;
    toggleAcciones();
  }
  modal.setAttribute('data-vacante-id', id);
  modal.classList.add('active');
  document.getElementById('modalVacanteSolicitudClose').onclick = function () { modal.classList.remove('active'); };
  document.getElementById('modalVacanteSolicitudBackdrop').onclick = function () { modal.classList.remove('active'); };
  var btnAprobar = document.getElementById('modalVacanteAprobar');
  var btnDenegar = document.getElementById('modalVacanteDenegar');
  var session = getSession();
  var revisadoPor = session ? (session.nombre || session.username) : '';
  if (btnAprobar && estado === 'pendiente') {
    btnAprobar.onclick = function () {
      if (!checkRevisado || !checkRevisado.checked) return;
      updateSolicitudVacante(id, { estado: 'aprobada', fechaRevision: new Date().toISOString(), revisadoPor: revisadoPor });
      modal.classList.remove('active');
      renderListaVacantes();
    };
  }
  if (btnDenegar && estado === 'pendiente') {
    btnDenegar.onclick = function () {
      if (!checkRevisado || !checkRevisado.checked) return;
      updateSolicitudVacante(id, { estado: 'denegada', fechaRevision: new Date().toISOString(), revisadoPor: revisadoPor });
      modal.classList.remove('active');
      renderListaVacantes();
    };
  }
}

function abrirPantallaVacantes() {
  if (typeof cerrarTodasPantallasSecundarias === 'function') cerrarTodasPantallasSecundarias();
  if (typeof ocultarAppBodyMostrarSecundaria === 'function') ocultarAppBodyMostrarSecundaria('pantallaVacantes');
  if (typeof renderListaVacantes === 'function') renderListaVacantes();
}

function vincularVacantes() {
  var btnVacantes = document.getElementById('btnVacantes');
  var pantalla = document.getElementById('pantallaVacantes');
  var btnHome = document.getElementById('btnVacantesHome');
  var filtroEstado = document.getElementById('filtroVacantesEstado');
  var filtroBuscar = document.getElementById('filtroVacantesBuscar');
  if (!pantalla) return;
  window.abrirPantallaVacantes = abrirPantallaVacantes;
  if (btnVacantes) btnVacantes.addEventListener('click', function (e) {
    e.preventDefault();
    abrirPantallaVacantes();
  });
  if (btnHome) btnHome.addEventListener('click', function () { if (typeof irAPantallaPrincipal === 'function') irAPantallaPrincipal(); });
  if (filtroEstado) { filtroEstado.addEventListener('change', renderListaVacantes); filtroEstado.addEventListener('input', renderListaVacantes); }
  if (filtroBuscar) {
    filtroBuscar.addEventListener('input', debounce(renderListaVacantes, 180));
    filtroBuscar.addEventListener('change', renderListaVacantes);
  }
}

// ========== CHATBOT NORMATIVAS E INSTRUCCIONES ==========
var _chatbotBound = false;

/** Construye chunks buscables a partir de normativas + instrucciones (solo contenido oficial) */
function getChatbotChunks() {
  if (typeof getNormativas !== 'function') return [];
  var docs = getNormativas();
  var chunks = [];
  docs.forEach(function (doc) {
    var text = (doc.content || '').replace(/\r\n/g, '\n').trim();
    if (!text) return;
    var parts = text.split(/\n---\s*\n/);
    if (parts.length <= 1) parts = text.split(/\n\n+/);
    parts.forEach(function (p) {
      p = p.trim();
      if (p.length > 40) chunks.push({ source: doc.title || doc.id, text: p });
    });
  });
  return chunks;
}

/** Normaliza texto para búsqueda: minúsculas, sin acentos opcionales, palabras */
function normalizarParaBusqueda(s) {
  if (typeof s !== 'string') return '';
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(function (w) { return w.length >= 2; });
}

/** Puntúa un chunk por coincidencias de palabras de la pregunta */
function puntuarChunk(chunk, palabras) {
  var texto = (chunk.text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  var count = 0;
  palabras.forEach(function (pal) {
    if (texto.indexOf(pal) !== -1) count++;
  });
  return count;
}

/** Responde solo con contenido de normativas e instrucciones; si no hay match, mensaje acotado */
function getRespuestaChatbotNormativas(pregunta) {
  var msgFueraTema = 'Solo puedo responder sobre normativas del taller e instrucciones de la calculadora. Reformula tu pregunta usando términos como: fichaje, descuento, reparación, tuneo, matrícula, almacén, convenio, SAPD, importados, etc.';
  var t = (pregunta || '').trim();
  if (t.length < 2) return msgFueraTema;
  var palabras = normalizarParaBusqueda(t);
  if (palabras.length === 0) return msgFueraTema;
  var chunks = getChatbotChunks();
  if (chunks.length === 0) return 'No hay normativas cargadas. Consulta el menú Normativas.';
  var scored = chunks.map(function (c) { return { chunk: c, score: puntuarChunk(c, palabras) }; });
  scored.sort(function (a, b) { return b.score - a.score; });
  var top = scored.filter(function (x) { return x.score > 0; }).slice(0, 3);
  if (top.length === 0) return msgFueraTema;
  var maxLen = 1100;
  var out = [];
  var len = 0;
  for (var i = 0; i < top.length && len < maxLen; i++) {
    var frag = top[i].chunk.text;
    if (len + frag.length > maxLen) frag = frag.substring(0, maxLen - len - 20) + '…';
    out.push(frag);
    len += frag.length;
  }
  return (out.join('\n\n—\n\n')).trim();
}

function vincularChatbot() {
  var wrap = document.getElementById('chatbotWrap');
  var toggle = document.getElementById('chatbotToggle');
  var panel = document.getElementById('chatbotPanel');
  var closeBtn = document.getElementById('chatbotClose');
  var messages = document.getElementById('chatbotMessages');
  var input = document.getElementById('chatbotInput');
  var sendBtn = document.getElementById('chatbotSend');
  if (!wrap || !toggle || !panel || !messages || !input || !sendBtn) return;
  if (_chatbotBound) return;
  _chatbotBound = true;

  function appendMsg(text, isUser) {
    var div = document.createElement('div');
    div.className = 'chatbot-msg ' + (isUser ? 'user' : 'bot');
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function openPanel() {
    panel.style.display = 'flex';
    if (messages.children.length === 0) {
      appendMsg('Hola. Pregunta solo sobre normativas del taller o uso de la calculadora. Ej: "¿Cómo fichar entrada?", "¿Descuento en tuneo importados?"', false);
    }
    input.focus();
  }

  function closePanel() {
    panel.style.display = 'none';
  }

  toggle.addEventListener('click', function () {
    if (panel.style.display === 'none' || !panel.style.display) openPanel(); else closePanel();
  });
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  sendBtn.addEventListener('click', enviarChatbot);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); enviarChatbot(); }
  });

  function enviarChatbot() {
    var text = (input.value || '').trim();
    if (!text) return;
    input.value = '';
    appendMsg(text, true);
    var respuesta = getRespuestaChatbotNormativas(text);
    appendMsg(respuesta, false);
  }
}

function mostrarChatbotWrap(mostrar) {
  var wrap = document.getElementById('chatbotWrap');
  if (wrap) wrap.style.display = mostrar ? 'block' : 'none';
  if (!mostrar) {
    var panel = document.getElementById('chatbotPanel');
    if (panel) panel.style.display = 'none';
  }
}

// ========== REGISTRO DE CLIENTES (BBDD + pendientes) ==========
function vincularRegistroClientes() {
  const btnRegistro = document.getElementById('btnRegistroClientes');
  const pantallaPrincipal = document.getElementById('pantallaPrincipal');
  const pantallaRegistro = document.getElementById('pantallaRegistroClientes');
  const btnHome = document.getElementById('btnRegistroClientesHome');
  if (!pantallaRegistro || !btnRegistro) return;

  function getIdClienteEmpleado(session) {
    return session && session.username ? 'EMP-' + session.username : null;
  }
  window.getIdClienteEmpleado = getIdClienteEmpleado;

  function updateBadgePendientesRegistro() {
    var badge = document.getElementById('badgePendientesRegistro');
    if (!badge) return;
    var n = typeof getPendientes === 'function' ? getPendientes().length : 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.style.display = n > 0 ? 'inline-flex' : 'none';
    badge.setAttribute('aria-hidden', n === 0 ? 'true' : 'false');
  }
  window.updateBadgePendientesRegistro = updateBadgePendientesRegistro;

  function renderUltimasEntradasClientes() {
    var listEl = document.getElementById('listaUltimasEntradasClientes');
    if (!listEl || typeof getClientesBBDD !== 'function') return;
    var list = getClientesBBDD();
    var LIMITE = 20;
    var ordenados = list.slice().filter(function (r) {
      return (r.fechaUltimaActualizacion || r.fechaPrimeraInteraccion || '').toString().trim();
    }).sort(function (a, b) {
      var da = a.fechaUltimaActualizacion || a.fechaPrimeraInteraccion || '';
      var db = b.fechaUltimaActualizacion || b.fechaPrimeraInteraccion || '';
      return db.localeCompare(da);
    });
    var sinFecha = list.filter(function (r) {
      return !(r.fechaUltimaActualizacion || r.fechaPrimeraInteraccion || '').toString().trim();
    });
    var todos = ordenados.concat(sinFecha).slice(0, LIMITE);
    listEl.innerHTML = '';
    if (todos.length === 0) {
      listEl.innerHTML = '<li class="ultimas-entradas-clientes-empty">No hay entradas registradas aún.</li>';
      return;
    }
    todos.forEach(function (cli) {
      var li = document.createElement('li');
      li.className = 'ultimas-entradas-clientes-item';
      var fecha = (cli.fechaUltimaActualizacion || cli.fechaPrimeraInteraccion || '');
      var fechaStr = fecha ? new Date(fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      var total = typeof cli.totalInvertido === 'number' ? cli.totalInvertido : (parseFloat(cli.totalInvertido) || 0);
      var totalStr = total > 0 ? total.toLocaleString('es-ES') + ' €' : '—';
      var matriculaCell = typeof buildMatriculaPlateHtml === 'function' ? buildMatriculaPlateHtml(cli.matricula || '—') : escapeHtml(cli.matricula || '—');
      li.innerHTML = '<span class="ultimas-entradas-clientes-matricula">' + matriculaCell + '</span><span class="ultimas-entradas-clientes-propietario">' + escapeHtml(cli.nombrePropietario || '—') + '</span><span class="ultimas-entradas-clientes-fecha">' + escapeHtml(fechaStr) + '</span><span class="ultimas-entradas-clientes-total">' + totalStr + '</span>';
      li.setAttribute('data-id-cliente', (cli.idCliente || '').toString());
      li.addEventListener('click', function () {
        var id = li.getAttribute('data-id-cliente');
        if (id && typeof abrirModalFichaCliente === 'function') abrirModalFichaCliente(id);
      });
      listEl.appendChild(li);
    });
  }
  window.renderUltimasEntradasClientes = renderUltimasEntradasClientes;

  function mostrarPanelRegistro(tab) {
    updateBadgePendientesRegistro();
    if (typeof renderUltimasEntradasClientes === 'function') renderUltimasEntradasClientes();
    document.querySelectorAll('.registro-clientes-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    var panelMificha = document.getElementById('panelRegistroClientesMificha');
    var panelFichas = document.getElementById('panelRegistroClientesFichas');
    var panelBBDD = document.getElementById('panelRegistroClientesBBDD');
    var panelVetados = document.getElementById('panelRegistroClientesVetados');
    var panelPend = document.getElementById('panelRegistroClientesPendientes');
    if (panelMificha) panelMificha.style.display = tab === 'mificha' ? '' : 'none';
    if (panelFichas) panelFichas.style.display = tab === 'fichas' ? '' : 'none';
    if (panelBBDD) panelBBDD.style.display = tab === 'bbdd' ? '' : 'none';
    if (panelVetados) panelVetados.style.display = tab === 'vetados' ? '' : 'none';
    if (panelPend) panelPend.style.display = tab === 'pendientes' ? '' : 'none';
    if (tab === 'mificha' && typeof renderMiFicha === 'function') renderMiFicha();
    if (tab === 'fichas' && typeof renderFichasClientes === 'function') renderFichasClientes();
    if (tab === 'bbdd') {
      fillFilterDropdownsBBDD();
      renderColumnasPanelBBDD();
      renderTablaClientesBBDD();
    }
    if (tab === 'vetados') renderListaVetados();
    if (tab === 'pendientes') renderPendientesRegistro();
  }

  function renderMiFicha() {
    var cont = document.getElementById('listaMiFichaVehiculos');
    if (!cont || typeof getClientesByClienteId !== 'function') return;
    var session = typeof getSession === 'function' ? getSession() : null;
    var idCliente = getIdClienteEmpleado(session);
    if (!idCliente) {
      cont.innerHTML = '<p class="mi-ficha-empty">Inicia sesión para gestionar tus vehículos.</p>';
      return;
    }
    var rows = getClientesByClienteId(idCliente);
    cont.innerHTML = '';
    rows.forEach(function (r) {
      var card = document.createElement('div');
      card.className = 'ficha-cliente-card';
      var marcaModelo = [r.marca, r.nombreVehiculo || r.codigoVehiculo].filter(Boolean).join(' · ') || '—';
      card.innerHTML = '<div class="ficha-cliente-card-placa">' + (typeof buildMatriculaPlateHtml === 'function' ? buildMatriculaPlateHtml(r.matricula || '—') : escapeHtml(r.matricula || '—')) + '</div><div class="ficha-cliente-card-meta">' + escapeHtml(marcaModelo) + '</div><div class="ficha-cliente-card-vehiculos">Ver ficha</div>';
      card.addEventListener('click', function () {
        if (typeof abrirModalFichaCliente === 'function') abrirModalFichaCliente(idCliente);
      });
      cont.appendChild(card);
    });
    if (rows.length === 0) {
      cont.innerHTML = '<p class="mi-ficha-empty">Aún no tienes vehículos. Pulsa <strong>+ Añadir mi vehículo</strong> para dar de alta marca, modelo, matrícula y fotos.</p>';
    }
  }
  window.renderMiFicha = renderMiFicha;

  function renderListaVetados() {
    var listVet = document.getElementById('listaVetados');
    var listMor = document.getElementById('listaMorosos');
    if (!listVet || !listMor || typeof getClientesBBDD !== 'function') return;
    var list = getClientesBBDD();
    var seenVet = {};
    var seenMor = {};
    var vetados = [];
    var morosos = [];
    list.forEach(function (r) {
      var id = (r.idCliente || '').toString();
      if (r.vetado && id && !seenVet[id]) {
        seenVet[id] = true;
        vetados.push({ idCliente: id, nombrePropietario: r.nombrePropietario || '—', matricula: r.matricula || '—', telefonoCliente: r.telefonoCliente || '—' });
      }
      if (r.moroso && id && !seenMor[id]) {
        seenMor[id] = true;
        morosos.push({ idCliente: id, nombrePropietario: r.nombrePropietario || '—', matricula: r.matricula || '—', telefonoCliente: r.telefonoCliente || '—' });
      }
    });
    listVet.innerHTML = vetados.length === 0 ? '<li class="lista-vetados-empty">Ningún cliente vetado.</li>' : vetados.map(function (c) {
      var placa = typeof buildMatriculaPlateHtml === 'function' ? buildMatriculaPlateHtml(c.matricula) : escapeHtml(c.matricula);
      return '<li class="lista-vetados-item">' + escapeHtml(c.nombrePropietario) + ' <span class="lista-vetados-placa">' + placa + '</span> <button type="button" class="btn btn-outline btn-sm btn-ver-ficha-vetado" data-id="' + escapeHtmlAttr(c.idCliente) + '">Ver ficha</button></li>';
    }).join('');
    listMor.innerHTML = morosos.length === 0 ? '<li class="lista-vetados-empty">Ningún cliente moroso.</li>' : morosos.map(function (c) {
      var placa = typeof buildMatriculaPlateHtml === 'function' ? buildMatriculaPlateHtml(c.matricula) : escapeHtml(c.matricula);
      return '<li class="lista-vetados-item">' + escapeHtml(c.nombrePropietario) + ' <span class="lista-vetados-placa">' + placa + '</span> <button type="button" class="btn btn-outline btn-sm btn-ver-ficha-vetado" data-id="' + escapeHtmlAttr(c.idCliente) + '">Ver ficha</button></li>';
    }).join('');
    listVet.querySelectorAll('.btn-ver-ficha-vetado').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (id && typeof abrirModalFichaCliente === 'function') abrirModalFichaCliente(id);
      });
    });
    listMor.querySelectorAll('.btn-ver-ficha-vetado').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (id && typeof abrirModalFichaCliente === 'function') abrirModalFichaCliente(id);
      });
    });
  }

  function textoClienteParaBusqueda(cli) {
    if (!cli) return '';
    var s = [cli.idCliente, cli.matricula, cli.nombreRegistrador, cli.telefonoCliente, cli.nombrePropietario, cli.numeroSocioLSCM, cli.placaPolicial, cli.codigoVehiculo, cli.nombreVehiculo, cli.categoria, cli.convenio].join(' ');
    return (s || '').toLowerCase().trim();
  }
  function cumpleFiltroCliente(cli, q) {
    if (!q || !(q = (q + '').trim().toLowerCase())) return true;
    return textoClienteParaBusqueda(cli).indexOf(q) !== -1;
  }

  var BBDD_COLUMNS = [
    { id: 'idCliente', label: 'ID cliente' },
    { id: 'matricula', label: 'Matrícula' },
    { id: 'nombreRegistrador', label: 'Nombre quien registró' },
    { id: 'telefonoCliente', label: 'Teléfono cliente' },
    { id: 'nombrePropietario', label: 'Nombre propietario' },
    { id: 'numeroSocioLSCM', label: 'Nº socio LSCM' },
    { id: 'placaPolicial', label: 'Placa policial' },
    { id: 'codigoVehiculo', label: 'Código vehículo' },
    { id: 'nombreVehiculo', label: 'Nombre vehículo' },
    { id: 'categoria', label: 'Categoría' },
    { id: 'convenio', label: 'Convenio' },
    { id: 'estado', label: 'Estado' },
    { id: 'fechaPrimera', label: '1ª interacción' },
    { id: 'fechaUltima', label: 'Últ. actualización' },
    { id: 'interacciones', label: 'Interacciones' },
    { id: 'totalInvertido', label: 'Total invertido' },
    { id: 'acciones', label: 'Acciones' }
  ];
  var BBDD_VISIBLE_STORAGE = 'benny_bbdd_visible_columns';

  function getBBDDVisibleColumns() {
    try {
      var raw = localStorage.getItem(BBDD_VISIBLE_STORAGE);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch (e) {}
    return BBDD_COLUMNS.map(function (c) { return c.id; });
  }

  function setBBDDVisibleColumns(ids) {
    try {
      localStorage.setItem(BBDD_VISIBLE_STORAGE, JSON.stringify(ids));
    } catch (e) {}
  }

  function applyBBDDColumnVisibility(table) {
    if (!table) return;
    var visible = getBBDDVisibleColumns();
    BBDD_COLUMNS.forEach(function (col) {
      table.classList.toggle('bbdd-hide-col-' + col.id, visible.indexOf(col.id) === -1);
    });
  }

  function getFiltrosBBDD() {
    var convenio = (document.getElementById('filtroBBDDConvenio') && document.getElementById('filtroBBDDConvenio').value) || '';
    var categoria = (document.getElementById('filtroBBDDCategoria') && document.getElementById('filtroBBDDCategoria').value) || '';
    var estado = (document.getElementById('filtroBBDDEstado') && document.getElementById('filtroBBDDEstado').value) || '';
    return { convenio: convenio, categoria: categoria, estado: estado };
  }

  function cumpleFiltrosAdicionales(cli, filtros) {
    if (!filtros) return true;
    if (filtros.convenio && (cli.convenio || '').trim() !== filtros.convenio) return false;
    if (filtros.categoria && (cli.categoria || '').trim() !== filtros.categoria) return false;
    if (filtros.estado === 'moroso' && !cli.moroso) return false;
    if (filtros.estado === 'vetado' && !cli.vetado) return false;
    if (filtros.estado === 'ok' && (cli.moroso || cli.vetado)) return false;
    return true;
  }

  function fillFilterDropdownsBBDD() {
    var list = typeof getClientesBBDD === 'function' ? getClientesBBDD() : [];
    if (!Array.isArray(list)) list = [];
    var convenios = {};
    var categorias = {};
    list.forEach(function (c) {
      var conv = (c.convenio || '').trim();
      if (conv) convenios[conv] = true;
      var cat = (c.categoria || '').trim();
      if (cat) categorias[cat] = true;
    });
    var selConv = document.getElementById('filtroBBDDConvenio');
    var selCat = document.getElementById('filtroBBDDCategoria');
    if (selConv) {
      var opts = ['<option value="">Todos</option>'];
      Object.keys(convenios).sort().forEach(function (c) { opts.push('<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'); });
      selConv.innerHTML = opts.join('');
      selConv.value = getFiltrosBBDD().convenio || '';
    }
    if (selCat) {
      var optsCat = ['<option value="">Todas</option>'];
      Object.keys(categorias).sort().forEach(function (c) { optsCat.push('<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'); });
      selCat.innerHTML = optsCat.join('');
      selCat.value = getFiltrosBBDD().categoria || '';
    }
  }

  function renderColumnasPanelBBDD() {
    var cont = document.getElementById('panelColumnasBBDDLista');
    if (!cont) return;
    var visible = getBBDDVisibleColumns();
    cont.innerHTML = BBDD_COLUMNS.map(function (col) {
      var checked = visible.indexOf(col.id) !== -1 ? ' checked' : '';
      return '<label><input type="checkbox" data-col="' + escapeHtml(col.id) + '"' + checked + '> ' + escapeHtml(col.label) + '</label>';
    }).join('');
    cont.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var visible = getBBDDVisibleColumns();
        if (cb.checked) {
          if (visible.indexOf(cb.dataset.col) === -1) visible.push(cb.dataset.col);
        } else {
          visible = visible.filter(function (id) { return id !== cb.dataset.col; });
        }
        setBBDDVisibleColumns(visible);
        var table = document.getElementById('tablaClientesBBDD');
        if (table) applyBBDDColumnVisibility(table);
      });
    });
  }

  function renderTablaClientesBBDD() {
    const tbody = document.getElementById('listaClientesBBDD');
    if (!tbody) return;
    let list = [];
    if (typeof getClientesBBDD === 'function') list = getClientesBBDD();
    if (!Array.isArray(list)) list = [];
    if (list.length === 0 && typeof seedClientesBBDDIfEmpty === 'function') seedClientesBBDDIfEmpty();
    if (typeof getClientesBBDD === 'function') list = getClientesBBDD();
    if (!Array.isArray(list)) list = [];
    if (list.length === 0 && typeof CLIENTES_SEED !== 'undefined' && Array.isArray(CLIENTES_SEED)) {
      const arr = CLIENTES_SEED.filter(r => (r.matricula || '').toString().trim()).map(r => ({
        matricula: (r.matricula || '').toString().trim(),
        placaPolicial: (r.placaPolicial != null && r.placaPolicial !== '') ? String(r.placaPolicial).trim() : '-',
        codigoVehiculo: (r.codigoVehiculo || '').toString().trim(),
        nombreVehiculo: (r.nombreVehiculo || '').toString().trim(),
        categoria: (r.categoria || '').toString().trim(),
        convenio: (r.convenio || '').toString().trim(),
        fechaPrimeraInteraccion: null,
        fechaUltimaActualizacion: null,
        interacciones: 0,
        totalInvertido: 0
      }));
      if (arr.length > 0) {
        try {
          if (typeof saveClientesBBDD === 'function') saveClientesBBDD(arr);
          else { localStorage.setItem('benny_clientes_bbdd', JSON.stringify(arr)); if (typeof window.invalidateClientesBBDDCache === 'function') window.invalidateClientesBBDDCache(); }
        } catch (e) { console.warn('renderTablaClientesBBDD seed', e); }
        list = typeof getClientesBBDD === 'function' ? getClientesBBDD() : arr;
      }
    }
    if (!Array.isArray(list)) list = [];
    var filtroBBDD = (document.getElementById('filtroTablaBBDD') && document.getElementById('filtroTablaBBDD').value) || '';
    var filtros = getFiltrosBBDD();
    list = list.filter(function (c) { return cumpleFiltroCliente(c, filtroBBDD) && cumpleFiltrosAdicionales(c, filtros); });
    var fragment = document.createDocumentFragment();
    var normalizar = function (m) { return (m || '').trim().toUpperCase(); };
    for (var i = 0; i < list.length; i++) {
      var cli = list[i];
      var f1 = cli.fechaPrimeraInteraccion ? new Date(cli.fechaPrimeraInteraccion).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      var f2 = cli.fechaUltimaActualizacion ? new Date(cli.fechaUltimaActualizacion).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
      var idCliente = (cli.idCliente || '').toString() || '—';
      var estadoBadges = '';
      if (cli.moroso) estadoBadges += '<span class="badge badge-moroso">Moroso</span> ';
      if (cli.vetado) estadoBadges += '<span class="badge badge-vetado">Vetado</span>';
      if (!estadoBadges) estadoBadges = '—';
      var matriculaCell = typeof buildMatriculaPlateHtml === 'function' ? buildMatriculaPlateHtml(cli.matricula || '') : escapeHtml(cli.matricula || '—');
      var accionesCell = '<button type="button" class="btn btn-outline btn-sm btn-ver-ficha" data-id="' + escapeHtml(idCliente) + '" title="Ver ficha">Ficha</button> <button type="button" class="btn btn-outline btn-sm btn-editar-cliente" data-mat="' + escapeHtml(cli.matricula) + '">Editar</button>';
      var tr = document.createElement('tr');
      tr.setAttribute('data-mat', (cli.matricula || '').trim());
      tr.innerHTML = '<td data-col="idCliente">' + escapeHtml(idCliente) + '</td><td data-col="matricula" class="col-matricula-cell">' + matriculaCell + '</td><td data-col="nombreRegistrador">' + escapeHtml(cli.nombreRegistrador || '—') + '</td><td data-col="telefonoCliente">' + escapeHtml(cli.telefonoCliente || '—') + '</td><td data-col="nombrePropietario">' + escapeHtml(cli.nombrePropietario || '—') + '</td><td data-col="numeroSocioLSCM">' + escapeHtml(cli.numeroSocioLSCM || '—') + '</td><td data-col="placaPolicial">' + escapeHtml(cli.placaPolicial || '—') + '</td><td data-col="codigoVehiculo">' + escapeHtml(cli.codigoVehiculo || '—') + '</td><td data-col="nombreVehiculo">' + escapeHtml(cli.nombreVehiculo || '—') + '</td><td data-col="categoria">' + escapeHtml(cli.categoria || '—') + '</td><td data-col="convenio">' + escapeHtml(cli.convenio || '—') + '</td><td data-col="estado" class="col-estado">' + estadoBadges + '</td><td data-col="fechaPrimera">' + f1 + '</td><td data-col="fechaUltima">' + f2 + '</td><td data-col="interacciones">' + (cli.interacciones ?? 0) + '</td><td data-col="totalInvertido">' + (cli.totalInvertido ?? 0).toLocaleString('es-ES') + ' €</td><td data-col="acciones">' + accionesCell + '</td>';
      fragment.appendChild(tr);
    }
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
    var table = document.getElementById('tablaClientesBBDD');
    if (table) applyBBDDColumnVisibility(table);
    if (!tbody.dataset.delegationBound) {
      tbody.dataset.delegationBound = '1';
      tbody.addEventListener('click', function (e) {
        var btnEdit = e.target.closest('.btn-editar-cliente');
        if (btnEdit) {
          var mat = (btnEdit.getAttribute('data-mat') || '').trim();
          var list = typeof getClientesBBDD === 'function' ? getClientesBBDD() : [];
          var cli = list.find(function (c) { return normalizar(c.matricula) === normalizar(mat); });
          if (cli) abrirModalEditarCliente(cli);
          return;
        }
        var btnFicha = e.target.closest('.btn-ver-ficha');
        if (btnFicha) {
          var id = btnFicha.getAttribute('data-id');
          if (id && typeof abrirModalFichaCliente === 'function') abrirModalFichaCliente(id);
        }
      });
    }
  }

  function fillEditarClienteModeloSelect(cli) {
    var sel = document.getElementById('editarClienteModeloVehiculo');
    if (!sel || typeof VEHICULOS_DB === 'undefined') return;
    var codigo = (cli && (cli.codigoVehiculo || '').toString().trim()) || '';
    var nombre = (cli && (cli.nombreVehiculo || '').toString().trim()) || '';
    sel.innerHTML = '<option value="">— Seleccionar modelo —</option>';
    var ordenados = VEHICULOS_DB.slice().sort(function (a, b) { return (a.nombreIC || a.modelo || '').localeCompare(b.nombreIC || b.modelo || '', 'es'); });
    var seleccionado = null;
    ordenados.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v.modelo || '';
      opt.textContent = v.nombreIC || v.modelo || '';
      opt.dataset.categoria = (v.categoria || '').toString();
      sel.appendChild(opt);
      if ((codigo && (v.modelo || '').toString().toLowerCase() === codigo.toLowerCase()) || (nombre && (v.nombreIC || v.modelo || '').toString().toLowerCase() === nombre.toLowerCase())) seleccionado = v.modelo;
    });
    if (codigo && !seleccionado) {
      var optActual = document.createElement('option');
      optActual.value = codigo;
      optActual.textContent = '[Actual] ' + (nombre || codigo);
      optActual.dataset.nombre = nombre || codigo;
      optActual.dataset.categoria = (cli && (cli.categoria || '').toString().trim()) || '';
      sel.appendChild(optActual);
      seleccionado = codigo;
    }
    sel.value = seleccionado || '';
  }

  function abrirModalEditarCliente(cli) {
    cli = cli || {};
    var tituloEl = document.getElementById('modalEditarClienteTitulo');
    if (tituloEl) tituloEl.textContent = (cli.idCliente && (cli.idCliente + '').trim()) || (cli.matricula && (cli.matricula + '').trim()) ? 'Editar cliente' : 'Añadir cliente';
    var setVal = function (id, val) { var el = document.getElementById(id); if (el) el.value = val != null ? val : ''; };
    setVal('editarClienteMatriculaOriginal', cli.matricula || '');
    setVal('editarClienteIdCliente', cli.idCliente || '');
    setVal('editarClienteMatricula', cli.matricula || '');
    setVal('editarClienteNombreRegistrador', cli.nombreRegistrador || '');
    setVal('editarClienteTelefono', cli.telefonoCliente || '');
    setVal('editarClienteNombrePropietario', cli.nombrePropietario || '');
    setVal('editarClienteNumeroSocioLSCM', cli.numeroSocioLSCM || '');
    setVal('editarClientePlaca', cli.placaPolicial || '');
    setVal('editarClienteMarca', cli.marca || '');
    fillEditarClienteModeloSelect(cli);
    setVal('editarClienteCategoria', cli.categoria || '');
    setVal('editarClienteConvenio', cli.convenio || '');
    var fp = cli.fechaPrimeraInteraccion ? String(cli.fechaPrimeraInteraccion).slice(0, 16) : '';
    var fu = cli.fechaUltimaActualizacion ? String(cli.fechaUltimaActualizacion).slice(0, 16) : '';
    setVal('editarClienteFechaPrimera', fp);
    setVal('editarClienteFechaUltima', fu);
    setVal('editarClienteInteracciones', cli.interacciones ?? 0);
    setVal('editarClienteTotal', cli.totalInvertido ?? 0);
    setVal('editarClienteObservaciones', cli.observaciones || '');
    var morosoEl = document.getElementById('editarClienteMoroso');
    var vetadoEl = document.getElementById('editarClienteVetado');
    var prepagoEl = document.getElementById('editarClientePrepago');
    if (morosoEl) morosoEl.checked = !!(cli.moroso);
    if (vetadoEl) vetadoEl.checked = !!(cli.vetado);
    if (prepagoEl) prepagoEl.checked = !!(cli.prepago);
    var session = typeof getSession === 'function' ? getSession() : null;
    var isAdmin = session && typeof hasPermission === 'function' && hasPermission(session, 'gestionarRegistroClientes');
    var form = document.getElementById('formEditarCliente');
    if (form) form.querySelectorAll('.field-admin-only').forEach(function (f) { f.style.display = isAdmin ? '' : 'none'; });
    var modal = document.getElementById('modalEditarCliente');
    if (modal) modal.classList.add('active');
  }

  function abrirModalNuevoCliente() {
    abrirModalEditarCliente({});
  }

  function renderPendientesRegistro() {
    const cont = document.getElementById('listaPendientesRegistro');
    if (!cont || typeof getPendientes !== 'function') return;
    let list = getPendientes();
    var filtroPend = (document.getElementById('filtroPendientes') && document.getElementById('filtroPendientes').value) || '';
    if (filtroPend) {
      var q = filtroPend.trim().toLowerCase();
      list = list.filter(function (p) {
        var s = [p.matricula, p.nombrePropietario, p.telefonoCliente, p.codigoVehiculo, p.nombreVehiculo, p.usuarioRegistro].join(' ').toLowerCase();
        return s.indexOf(q) !== -1;
      });
    }
    cont.innerHTML = '';
    list.forEach(p => {
      const card = document.createElement('div');
      card.className = 'pendiente-item';
      const fechaSol = p.fechaSolicitud ? new Date(p.fechaSolicitud).toLocaleString('es-ES') : '—';
      card.innerHTML = `
        <div class="pendiente-item-header">
          <strong>${escapeHtml(p.matricula)}</strong>
          <span class="pendiente-item-usuario">Registrado por: ${escapeHtml(p.usuarioRegistro || '—')} · ${fechaSol}</span>
        </div>
        <div class="pendiente-item-fields">
          <div class="field"><label>Matrícula</label><input type="text" data-pend-id="${p.id}" data-field="matricula" value="${escapeHtml(p.matricula || '')}"></div>
          <div class="field"><label>Nombre propietario</label><input type="text" data-pend-id="${p.id}" data-field="nombrePropietario" value="${escapeHtml(p.nombrePropietario || '')}" placeholder="Dueño del vehículo"></div>
          <div class="field"><label>Teléfono cliente</label><input type="tel" data-pend-id="${p.id}" data-field="telefonoCliente" value="${escapeHtml(p.telefonoCliente || '')}" placeholder="Ej: 612 345 678"></div>
          <div class="field"><label>Placa policial</label><input type="text" data-pend-id="${p.id}" data-field="placaPolicial" value="${escapeHtml(p.placaPolicial || '')}"></div>
          <div class="field"><label>Código vehículo</label><input type="text" data-pend-id="${p.id}" data-field="codigoVehiculo" value="${escapeHtml(p.codigoVehiculo || '')}"></div>
          <div class="field"><label>Nombre vehículo</label><input type="text" data-pend-id="${p.id}" data-field="nombreVehiculo" value="${escapeHtml(p.nombreVehiculo || '')}"></div>
          <div class="field"><label>Categoría</label><input type="text" data-pend-id="${p.id}" data-field="categoria" value="${escapeHtml(p.categoria || '')}"></div>
          <div class="field"><label>Convenio</label><input type="text" data-pend-id="${p.id}" data-field="convenio" value="${escapeHtml(p.convenio || '')}"></div>
        </div>
        <div class="pendiente-item-actions">
          <button type="button" class="btn btn-outline btn-aprobar-pendiente" data-pend-id="${p.id}">Aprobar</button>
          <button type="button" class="btn btn-outline btn-rechazar-pendiente" data-pend-id="${p.id}">Rechazar</button>
        </div>
      `;
      card.querySelectorAll('input[data-pend-id]').forEach(inp => {
        inp.addEventListener('change', function() {
          if (typeof actualizarPendiente === 'function') {
            const id = this.dataset.pendId;
            const field = this.dataset.field;
            const pendientes = getPendientes();
            const pend = pendientes.find(x => x.id === id);
            if (pend) actualizarPendiente(id, { [field]: this.value });
          }
        });
      });
      card.querySelector('.btn-aprobar-pendiente')?.addEventListener('click', function() {
        const id = this.dataset.pendId;
        const inputs = card.querySelectorAll('input[data-pend-id="' + id + '"]');
        const data = {};
        inputs.forEach(inp => { data[inp.dataset.field] = inp.value; });
        if (typeof actualizarPendiente === 'function') actualizarPendiente(id, data);
        if (typeof aprobarPendiente === 'function') aprobarPendiente(id);
        renderPendientesRegistro();
        renderTablaClientesBBDD();
        if (typeof renderFichasClientes === 'function') renderFichasClientes();
        if (typeof renderUltimasEntradasClientes === 'function') renderUltimasEntradasClientes();
        if (typeof updateBadgePendientesRegistro === 'function') updateBadgePendientesRegistro();
      });
      card.querySelector('.btn-rechazar-pendiente')?.addEventListener('click', function() {
        const id = this.dataset.pendId;
        if (typeof rechazarPendiente === 'function') { rechazarPendiente(id); }
        renderPendientesRegistro();
        if (typeof renderFichasClientes === 'function') renderFichasClientes();
        if (typeof updateBadgePendientesRegistro === 'function') updateBadgePendientesRegistro();
      });
      cont.appendChild(card);
    });
    if (list.length === 0) cont.innerHTML = '<p class="no-pendientes">' + (filtroPend ? 'Ninguna solicitud coincide con la búsqueda.' : 'No hay solicitudes pendientes.') + '</p>';
  }

  function renderFichasClientes() {
    const cont = document.getElementById('listaFichasClientes');
    if (!cont || typeof getClientesBBDD !== 'function' || typeof getClientesByClienteId !== 'function') return;
    let list = getClientesBBDD();
    if (!Array.isArray(list)) list = [];
    if (list.length === 0 && typeof seedClientesBBDDIfEmpty === 'function') {
      seedClientesBBDDIfEmpty();
      list = getClientesBBDD();
      if (!Array.isArray(list)) list = [];
    }
    var filtroFichas = (document.getElementById('filtroFichasClientes') && document.getElementById('filtroFichasClientes').value) || '';
    if (filtroFichas) list = list.filter(function (c) { return cumpleFiltroCliente(c, filtroFichas); });
    const byId = {};
    list.forEach(function (r) {
      const id = (r.idCliente || r.matricula || '').toString().trim();
      if (!id) return;
      if (!byId[id]) byId[id] = [];
      byId[id].push(r);
    });
    const ids = Object.keys(byId);
    cont.innerHTML = '';
    ids.forEach(function (id) {
      const rows = byId[id];
      const first = rows[0];
      const matricula = (first.matricula || '').trim() || '—';
      const telefono = (first.telefonoCliente || '').trim() || '—';
      const modeloCategoria = ((first.nombreVehiculo || first.codigoVehiculo || '').toString().trim() || '—') + ' - ' + ((first.categoria || '').toString().trim() || '—');
      const placaHtml = typeof buildMatriculaPlateHtml === 'function' ? buildMatriculaPlateHtml(matricula) : escapeHtml(matricula);
      const card = document.createElement('div');
      card.className = 'ficha-cliente-card';
      card.innerHTML = '<div class="ficha-cliente-card-placa">' + placaHtml + '</div><div class="ficha-cliente-card-meta">' + escapeHtml(telefono) + ' · ' + escapeHtml(modeloCategoria) + '</div><div class="ficha-cliente-card-vehiculos">' + rows.length + ' vehículo(s)</div>';
      card.addEventListener('click', function () {
        if (typeof abrirModalFichaCliente === 'function') abrirModalFichaCliente(id);
      });
      cont.appendChild(card);
    });

    var pendientes = typeof getPendientes === 'function' ? getPendientes() : [];
    if (filtroFichas && pendientes.length > 0) {
      var q = filtroFichas.trim().toLowerCase();
      pendientes = pendientes.filter(function (p) {
        return ((p.matricula || '').toLowerCase().indexOf(q) !== -1) ||
          ((p.nombrePropietario || '').toLowerCase().indexOf(q) !== -1) ||
          ((p.telefonoCliente || '').toLowerCase().indexOf(q) !== -1) ||
          ((p.id || '').toLowerCase().indexOf(q) !== -1);
      });
    }
    pendientes.forEach(function (p) {
      const matricula = (p.matricula || '').trim() || '—';
      const telefono = (p.telefonoCliente || '').trim() || '—';
      const modeloCategoriaP = ((p.nombreVehiculo || p.codigoVehiculo || '').toString().trim() || '—') + ' - ' + ((p.categoria || '').toString().trim() || '—');
      const placaHtml = typeof buildMatriculaPlateHtml === 'function' ? buildMatriculaPlateHtml(matricula) : escapeHtml(matricula);
      const card = document.createElement('div');
      card.className = 'ficha-cliente-card ficha-cliente-card-pendiente';
      card.setAttribute('data-pendiente-id', p.id || '');
      card.innerHTML = '<div class="ficha-cliente-card-placa">' + placaHtml + '</div><div class="ficha-cliente-card-meta">' + escapeHtml(telefono) + ' · ' + escapeHtml(modeloCategoriaP) + '</div><div class="ficha-cliente-card-vehiculos">1 vehículo(s) <span class="ficha-cliente-pendiente-badge">Pendiente de aprobación</span></div>';
      card.addEventListener('click', function () {
        alert('Solicitud pendiente de aprobación. Un administrador debe aprobarla para que el cliente quede registrado en la base de datos.');
      });
      cont.appendChild(card);
    });

    if (ids.length === 0 && pendientes.length === 0) cont.innerHTML = '<p class="no-fichas">' + (filtroFichas ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes registrados.') + '</p>';
  }
  window.renderFichasClientes = renderFichasClientes;

  function abrirModalFichaCliente(idCliente) {
    const modal = document.getElementById('modalFichaCliente');
    const headerEl = document.getElementById('fichaClienteHeader');
    const extraEl = document.getElementById('fichaClienteExtra');
    const vehiculosEl = document.getElementById('fichaClienteVehiculos');
    if (!modal || !headerEl || !vehiculosEl || typeof getClientesByClienteId !== 'function') return;
    const rows = getClientesByClienteId(idCliente);
    if (rows.length === 0) return;
    const first = rows[0];
    const session = typeof getSession === 'function' ? getSession() : null;
    const isAdmin = session && typeof hasPermission === 'function' && hasPermission(session, 'gestionarRegistroClientes');
    const puedeEditarNombre = true;
    const servicios = typeof getRegistroServicios === 'function' ? getRegistroServicios() : [];
    var estadoFicha = '';
    if (first.moroso) estadoFicha += '<span class="badge badge-moroso">Moroso</span> ';
    if (first.vetado) estadoFicha += '<span class="badge badge-vetado">Vetado</span>';
    if (!estadoFicha) estadoFicha = '—';
    var prepagoChecked = !!(first.prepago);
    var modeloCategoria = ((first.nombreVehiculo || first.codigoVehiculo || '').toString().trim() || '—') + ' - ' + ((first.categoria || '').toString().trim() || '—');
    headerEl.innerHTML = '<div class="ficha-header-row"><strong>Modelo - Categoría:</strong> ' + escapeHtml(modeloCategoria) + '</div>' +
      '<div class="ficha-header-row ficha-header-nombre-wrap"><strong>Nombre propietario:</strong> <span id="fichaNombrePropietario">' + escapeHtml(first.nombrePropietario || '—') + '</span>' +
      (puedeEditarNombre ? ' <button type="button" class="btn btn-outline btn-sm btn-editar-nombre-ficha" id="btnEditarNombreFicha">Editar</button>' : '') + '</div>' +
      '<div class="ficha-header-row"><strong>Teléfono:</strong> <span id="fichaTelefonoCliente">' + escapeHtml(first.telefonoCliente || '—') + '</span></div>' +
      '<div class="ficha-header-row"><strong>Nº socio LSCM:</strong> ' + escapeHtml(first.numeroSocioLSCM || '—') + '</div>' +
      '<div class="ficha-header-row"><strong>Convenio:</strong> ' + escapeHtml(first.convenio || '—') + '</div>' +
      '<div class="ficha-header-row ficha-header-estado"><strong>Estado:</strong> ' + estadoFicha + '</div>' +
      '<div class="ficha-header-row ficha-header-prepago"><label class="ficha-prepago-label"><input type="checkbox" id="fichaClientePrepago" ' + (prepagoChecked ? ' checked' : '') + '> Solicitar prepago</label></div>';
    if (extraEl) {
      var obs = (first.observaciones || '').trim();
      extraEl.innerHTML = obs ? '<div class="ficha-cliente-observaciones"><strong>Observaciones</strong><p class="ficha-observaciones-texto">' + escapeHtml(obs) + '</p></div>' : '';
    }
    vehiculosEl.innerHTML = '';
    rows.forEach(function (r) {
      const mat = (r.matricula || '').trim();
      const serviciosMat = servicios.filter(function (s) { return (s.matricula || '').trim().toUpperCase() === mat.toUpperCase(); });
      const fotos = typeof getFotosByMatricula === 'function' ? getFotosByMatricula(mat) : [];
      const div = document.createElement('div');
      div.className = 'ficha-vehiculo-block';
      div.setAttribute('data-mat', mat);
      var fotosHtml = '';
      if (Array.isArray(fotos) && fotos.length > 0) {
        fotos.forEach(function (url, i) {
          fotosHtml += '<div class="ficha-foto-wrap"><img src="' + escapeHtml(url) + '" alt="Foto" class="ficha-foto-img"><button type="button" class="btn btn-sm ficha-foto-remove" data-mat="' + escapeHtml(mat) + '" data-index="' + i + '">×</button></div>';
        });
      }
      fotosHtml += '<div class="ficha-foto-add-wrap"><input type="file" accept="image/*" class="ficha-foto-input" data-mat="' + escapeHtml(mat) + '" id="fotoInput' + escapeHtml(mat) + '"><label for="fotoInput' + escapeHtml(mat) + '" class="btn btn-outline btn-sm">+ Añadir foto</label></div>';
      var serviciosHtml = serviciosMat.length === 0 ? '<p class="no-reparaciones">Sin reparaciones registradas.</p>' : '<ul class="ficha-servicios-list">' + serviciosMat.slice(0, 20).map(function (s) {
        const fecha = s.fecha ? new Date(s.fecha).toLocaleString('es-ES') : '—';
        const tipo = (s.tipo || 'Servicio').toString();
        const importe = (s.importe != null ? s.importe.toLocaleString('es-ES') + ' €' : '—');
        const empleado = (s.empleado || s.userId || '—').toString();
        return '<li>' + escapeHtml(tipo) + ' · ' + importe + ' · ' + escapeHtml(empleado) + ' · ' + escapeHtml(fecha) + '</li>';
      }).join('') + '</ul>';
      var marcaModeloLabel = (r.marca ? escapeHtml(r.marca) + ' · ' : '') + escapeHtml(r.nombreVehiculo || r.codigoVehiculo || '—');
      var placaHtml = typeof buildMatriculaPlateHtml === 'function' ? buildMatriculaPlateHtml(mat) : escapeHtml(mat);
      div.innerHTML = '<div class="ficha-vehiculo-mat-wrap">' + placaHtml + ' <span class="ficha-vehiculo-mat-label">' + marcaModeloLabel + '</span></div>' +
        '<div class="ficha-vehiculo-reparaciones"><strong>Reparaciones / tuneos</strong>' + serviciosHtml + '</div>' +
        '<div class="ficha-vehiculo-fotos"><strong>Fotos del vehículo</strong><div class="ficha-fotos-list">' + fotosHtml + '</div></div>' +
        '<button type="button" class="btn btn-outline btn-sm btn-quitar-vehiculo-ficha" data-mat="' + escapeHtml(mat) + '">Quitar vehículo</button>';
      vehiculosEl.appendChild(div);
    });
    modal.classList.add('active');
    modal.setAttribute('data-ficha-id', idCliente);
    vehiculosEl.querySelectorAll('.ficha-foto-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var m = this.getAttribute('data-mat');
        var i = parseInt(this.getAttribute('data-index'), 10);
        if (typeof removeFotoMatricula === 'function') removeFotoMatricula(m, i);
        abrirModalFichaCliente(idCliente);
      });
    });
    vehiculosEl.querySelectorAll('.ficha-foto-input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var file = this.files && this.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var m = inp.getAttribute('data-mat');
          if (typeof addFotoMatricula === 'function') addFotoMatricula(m, reader.result);
          abrirModalFichaCliente(idCliente);
        };
        reader.readAsDataURL(file);
        this.value = '';
      });
    });
    var btnEditarNombre = document.getElementById('btnEditarNombreFicha');
    if (btnEditarNombre) {
      btnEditarNombre.addEventListener('click', function () {
        var nom = prompt('Nombre del propietario:', document.getElementById('fichaNombrePropietario').textContent);
        if (nom === null) return;
        rows.forEach(function (r) {
          if (typeof addOrUpdateClienteBBDD === 'function') addOrUpdateClienteBBDD({ ...r, nombrePropietario: nom });
        });
        document.getElementById('fichaNombrePropietario').textContent = nom;
      });
    }
    var fichaPrepagoEl = document.getElementById('fichaClientePrepago');
    if (fichaPrepagoEl && typeof addOrUpdateClienteBBDD === 'function') {
      fichaPrepagoEl.addEventListener('change', function () {
        addOrUpdateClienteBBDD({ ...rows[0], prepago: this.checked });
      });
    }
    vehiculosEl.querySelectorAll('.btn-quitar-vehiculo-ficha').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var m = this.getAttribute('data-mat');
        if (!confirm('¿Quitar el vehículo ' + m + ' de la ficha de este cliente?')) return;
        var list = typeof getClientesBBDD === 'function' ? getClientesBBDD() : [];
        var idx = list.findIndex(function (c) { return (c.matricula || '').trim().toUpperCase() === (m || '').toUpperCase(); });
        if (idx >= 0) { list.splice(idx, 1); if (typeof saveClientesBBDD === 'function') saveClientesBBDD(list); }
        abrirModalFichaCliente(idCliente);
      });
    });
  }
  window.abrirModalFichaCliente = abrirModalFichaCliente;

  btnRegistro.addEventListener('click', function(e) {
    e.preventDefault();
    cerrarTodasPantallasSecundarias();
    mostrarPanelRegistro('mificha');
    ocultarAppBodyMostrarSecundaria('pantallaRegistroClientes');
  });
  btnHome?.addEventListener('click', function(e) {
    e.preventDefault();
    cerrarTodasPantallasSecundarias();
  });
  document.querySelectorAll('.registro-clientes-tab').forEach(tab => {
    tab.addEventListener('click', () => mostrarPanelRegistro(tab.dataset.tab));
  });

  var filtroFichasEl = document.getElementById('filtroFichasClientes');
  var filtroBBDDEl = document.getElementById('filtroTablaBBDD');
  var filtroPendEl = document.getElementById('filtroPendientes');
  if (filtroFichasEl) {
    var debouncedFichas = debounce(function () { if (typeof renderFichasClientes === 'function') renderFichasClientes(); }, 180);
    filtroFichasEl.addEventListener('input', debouncedFichas);
    filtroFichasEl.addEventListener('change', function () { if (typeof renderFichasClientes === 'function') renderFichasClientes(); });
  }
  if (filtroBBDDEl) {
    var debounceBBDD;
    filtroBBDDEl.addEventListener('input', function () {
      clearTimeout(debounceBBDD);
      debounceBBDD = setTimeout(function () { renderTablaClientesBBDD(); }, 180);
    });
    filtroBBDDEl.addEventListener('change', function () { renderTablaClientesBBDD(); });
  }
  (function () {
    var btnFiltros = document.getElementById('btnFiltrosBBDD');
    var panelFiltros = document.getElementById('panelFiltrosBBDD');
    var btnColumnas = document.getElementById('btnColumnasBBDD');
    var panelColumnas = document.getElementById('panelColumnasBBDD');
    function closeDropdowns() {
      if (panelFiltros) { panelFiltros.setAttribute('aria-hidden', 'true'); panelFiltros.classList.remove('open'); }
      if (panelColumnas) { panelColumnas.setAttribute('aria-hidden', 'true'); panelColumnas.classList.remove('open'); }
    }
    function openFiltros() {
      closeDropdowns();
      if (panelFiltros) { panelFiltros.setAttribute('aria-hidden', 'false'); panelFiltros.classList.add('open'); }
    }
    function openColumnas() {
      closeDropdowns();
      if (panelColumnas) {
        if (typeof renderColumnasPanelBBDD === 'function') renderColumnasPanelBBDD();
        panelColumnas.setAttribute('aria-hidden', 'false');
        panelColumnas.classList.add('open');
      }
    }
    if (btnFiltros && panelFiltros) {
      btnFiltros.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var isOpen = panelFiltros.classList.contains('open') || panelFiltros.getAttribute('aria-hidden') === 'false';
        if (isOpen) closeDropdowns(); else openFiltros();
      });
    }
    if (btnColumnas && panelColumnas) {
      btnColumnas.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var isOpen = panelColumnas.classList.contains('open') || panelColumnas.getAttribute('aria-hidden') === 'false';
        if (isOpen) closeDropdowns(); else openColumnas();
      });
    }
    if (panelFiltros) panelFiltros.addEventListener('click', function (e) { e.stopPropagation(); });
    if (panelColumnas) panelColumnas.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function (e) {
      if (!panelFiltros || !panelColumnas) return;
      if (panelFiltros.contains(e.target) || panelColumnas.contains(e.target)) return;
      if (btnFiltros && btnFiltros.contains(e.target)) return;
      if (btnColumnas && btnColumnas.contains(e.target)) return;
      closeDropdowns();
    });
    var selConv = document.getElementById('filtroBBDDConvenio');
    var selCat = document.getElementById('filtroBBDDCategoria');
    var selEst = document.getElementById('filtroBBDDEstado');
    if (selConv) selConv.addEventListener('change', function () { renderTablaClientesBBDD(); });
    if (selCat) selCat.addEventListener('change', function () { renderTablaClientesBBDD(); });
    if (selEst) selEst.addEventListener('change', function () { renderTablaClientesBBDD(); });
    var btnLimpiar = document.getElementById('btnLimpiarFiltrosBBDD');
    if (btnLimpiar) btnLimpiar.addEventListener('click', function () {
      if (selConv) selConv.value = '';
      if (selCat) selCat.value = '';
      if (selEst) selEst.value = '';
      renderTablaClientesBBDD();
      closeDropdowns();
    });
    var btnColumnasTodas = document.getElementById('btnColumnasBBDDTodas');
    if (btnColumnasTodas) btnColumnasTodas.addEventListener('click', function () {
      setBBDDVisibleColumns(BBDD_COLUMNS.map(function (c) { return c.id; }));
      renderColumnasPanelBBDD();
      var table = document.getElementById('tablaClientesBBDD');
      if (table) applyBBDDColumnVisibility(table);
    });
  })();
  if (filtroPendEl) {
    var debouncedPend = debounce(renderPendientesRegistro, 180);
    filtroPendEl.addEventListener('input', debouncedPend);
    filtroPendEl.addEventListener('change', function () { renderPendientesRegistro(); });
  }

  document.getElementById('modalEditarClienteClose')?.addEventListener('click', () => document.getElementById('modalEditarCliente').classList.remove('active'));
  document.getElementById('modalEditarCliente')?.addEventListener('click', e => { if (e.target?.id === 'modalEditarCliente') document.getElementById('modalEditarCliente').classList.remove('active'); });
  document.getElementById('editarClienteModeloVehiculo')?.addEventListener('change', function () {
    var opt = this.options[this.selectedIndex];
    var catEl = document.getElementById('editarClienteCategoria');
    if (catEl && opt && opt.dataset && opt.dataset.categoria !== undefined && typeof getSession === 'function' && typeof hasPermission === 'function') {
      var session = getSession();
      if (session && hasPermission(session, 'gestionarRegistroClientes')) catEl.value = opt.dataset.categoria || '';
    }
  });
  document.getElementById('modalFichaClienteClose')?.addEventListener('click', function () { document.getElementById('modalFichaCliente').classList.remove('active'); });
  document.getElementById('modalFichaCliente')?.addEventListener('click', function (e) { if (e.target && e.target.id === 'modalFichaCliente') e.target.classList.remove('active'); });
  document.getElementById('fichaClienteBtnEditar')?.addEventListener('click', function () {
    var modal = document.getElementById('modalFichaCliente');
    var idCliente = modal && modal.getAttribute('data-ficha-id');
    if (!idCliente || typeof getClientesByClienteId !== 'function' || typeof abrirModalEditarCliente !== 'function') return;
    var rows = getClientesByClienteId(idCliente);
    if (!rows || rows.length === 0) return;
    modal.classList.remove('active');
    abrirModalEditarCliente(rows[0]);
    document.getElementById('modalEditarCliente').classList.add('active');
  });
  document.getElementById('fichaClienteBtnAddVehiculo')?.addEventListener('click', function () {
    var modal = document.getElementById('modalFichaCliente');
    var idCliente = modal && modal.getAttribute('data-ficha-id');
    if (!idCliente || typeof getClientesByClienteId !== 'function') return;
    var rows = getClientesByClienteId(idCliente);
    var first = rows[0];
    var mat = prompt('Matrícula del nuevo vehículo para este cliente:');
    if (!mat || !mat.trim()) return;
    if (typeof addOrUpdateClienteBBDD === 'function') addOrUpdateClienteBBDD({ idCliente: idCliente, matricula: mat.trim(), nombrePropietario: first.nombrePropietario, telefonoCliente: first.telefonoCliente });
    if (typeof abrirModalFichaCliente === 'function') abrirModalFichaCliente(idCliente);
  });

  document.getElementById('btnAnadirClienteFichas')?.addEventListener('click', function () {
    if (typeof abrirModalNuevoCliente === 'function') abrirModalNuevoCliente();
  });
  document.getElementById('btnAnadirClienteBBDD')?.addEventListener('click', function () {
    if (typeof abrirModalNuevoCliente === 'function') abrirModalNuevoCliente();
  });
  document.getElementById('btnAnadirMiVehiculo')?.addEventListener('click', function () {
    var modal = document.getElementById('modalAnadirMiVehiculo');
    if (modal) {
      document.getElementById('miVehiculoMatricula').value = '';
      document.getElementById('miVehiculoMarca').value = '';
      document.getElementById('miVehiculoModelo').value = '';
      document.getElementById('miVehiculoCodigo').value = '';
      var fotosEl = document.getElementById('miVehiculoFotos');
      if (fotosEl) fotosEl.value = '';
      modal.classList.add('active');
    }
  });
  document.getElementById('modalAnadirMiVehiculoClose')?.addEventListener('click', function () { document.getElementById('modalAnadirMiVehiculo').classList.remove('active'); });
  document.getElementById('modalAnadirMiVehiculo')?.addEventListener('click', function (e) { if (e.target && e.target.id === 'modalAnadirMiVehiculo') e.target.classList.remove('active'); });
  document.getElementById('formAnadirMiVehiculo')?.addEventListener('submit', function (e) {
    e.preventDefault();
    var session = typeof getSession === 'function' ? getSession() : null;
    if (!session || !session.username) { alert('Debes iniciar sesión.'); return; }
    var matricula = (document.getElementById('miVehiculoMatricula') && document.getElementById('miVehiculoMatricula').value || '').trim();
    var marca = (document.getElementById('miVehiculoMarca') && document.getElementById('miVehiculoMarca').value || '').trim();
    var modelo = (document.getElementById('miVehiculoModelo') && document.getElementById('miVehiculoModelo').value || '').trim();
    var codigo = (document.getElementById('miVehiculoCodigo') && document.getElementById('miVehiculoCodigo').value || '').trim();
    if (!matricula) { alert('Indica la matrícula.'); return; }
    var idCliente = getIdClienteEmpleado(session);
    if (!idCliente || typeof addOrUpdateClienteBBDD !== 'function') return;
    addOrUpdateClienteBBDD({
      idCliente: idCliente,
      matricula: matricula,
      marca: marca,
      nombreVehiculo: modelo,
      codigoVehiculo: codigo,
      nombrePropietario: session.nombre || session.username,
      nombreRegistrador: session.username
    });
    var fotosInput = document.getElementById('miVehiculoFotos');
    if (fotosInput && fotosInput.files && fotosInput.files.length > 0 && typeof addFotoMatricula === 'function') {
      var files = Array.prototype.slice.call(fotosInput.files);
      var done = 0;
      files.forEach(function (file) {
        var reader = new FileReader();
        reader.onload = function () {
          addFotoMatricula(matricula, reader.result);
          done++;
          if (done === files.length) { document.getElementById('modalAnadirMiVehiculo').classList.remove('active'); if (typeof renderMiFicha === 'function') renderMiFicha(); }
        };
        reader.readAsDataURL(file);
      });
    } else {
      document.getElementById('modalAnadirMiVehiculo').classList.remove('active');
      if (typeof renderMiFicha === 'function') renderMiFicha();
    }
  });
  document.getElementById('formEditarCliente')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const matOriginal = (document.getElementById('editarClienteMatriculaOriginal') && document.getElementById('editarClienteMatriculaOriginal').value) || '';
    const matricula = (document.getElementById('editarClienteMatricula') && document.getElementById('editarClienteMatricula').value || '').trim();
    if (!matricula) {
      alert('La matrícula es obligatoria para guardar el cliente.');
      return;
    }
    const session = typeof getSession === 'function' ? getSession() : null;
    const isAdmin = session && typeof hasPermission === 'function' && hasPermission(session, 'gestionarRegistroClientes');
    const data = {
      idCliente: document.getElementById('editarClienteIdCliente').value.trim(),
      matricula: matricula,
      nombreRegistrador: document.getElementById('editarClienteNombreRegistrador').value.trim(),
      telefonoCliente: document.getElementById('editarClienteTelefono').value.trim(),
      nombrePropietario: document.getElementById('editarClienteNombrePropietario').value.trim(),
      numeroSocioLSCM: document.getElementById('editarClienteNumeroSocioLSCM').value.trim(),
      observaciones: document.getElementById('editarClienteObservaciones').value.trim(),
      moroso: document.getElementById('editarClienteMoroso') ? document.getElementById('editarClienteMoroso').checked : false,
      vetado: document.getElementById('editarClienteVetado') ? document.getElementById('editarClienteVetado').checked : false,
      prepago: document.getElementById('editarClientePrepago') ? document.getElementById('editarClientePrepago').checked : false,
      marca: (document.getElementById('editarClienteMarca') && document.getElementById('editarClienteMarca').value) ? document.getElementById('editarClienteMarca').value.trim() : '',
    };
    var selModelo = document.getElementById('editarClienteModeloVehiculo');
    var valorModelo = selModelo ? selModelo.value.trim() : '';
    var veh = typeof VEHICULOS_DB !== 'undefined' && valorModelo ? VEHICULOS_DB.find(function (x) { return (x.modelo || '').toString() === valorModelo; }) : null;
    if (veh) {
      data.codigoVehiculo = veh.modelo || '';
      data.nombreVehiculo = veh.nombreIC || veh.modelo || '';
    } else if (valorModelo && selModelo && selModelo.options[selModelo.selectedIndex]) {
      var opt = selModelo.options[selModelo.selectedIndex];
      data.codigoVehiculo = valorModelo;
      data.nombreVehiculo = (opt.dataset && opt.dataset.nombre) ? opt.dataset.nombre : (opt.textContent || '').replace(/^\[Actual\]\s*/, '').trim() || valorModelo;
    } else {
      data.codigoVehiculo = '';
      data.nombreVehiculo = '';
    }
    if (isAdmin) {
      data.placaPolicial = document.getElementById('editarClientePlaca').value.trim() || '-';
      data.categoria = (document.getElementById('editarClienteCategoria') && document.getElementById('editarClienteCategoria').value) ? document.getElementById('editarClienteCategoria').value.trim() : (veh ? (veh.categoria || '') : '');
      data.convenio = document.getElementById('editarClienteConvenio').value.trim() || '';
      data.fechaPrimeraInteraccion = document.getElementById('editarClienteFechaPrimera').value || null;
      data.fechaUltimaActualizacion = document.getElementById('editarClienteFechaUltima').value || null;
      data.interacciones = parseInt(document.getElementById('editarClienteInteracciones').value, 10) || 0;
      data.totalInvertido = parseFloat(document.getElementById('editarClienteTotal').value) || 0;
    } else {
      data.placaPolicial = (document.getElementById('editarClientePlaca') && document.getElementById('editarClientePlaca').value) ? document.getElementById('editarClientePlaca').value.trim() || '-' : '-';
      data.categoria = (document.getElementById('editarClienteCategoria') && document.getElementById('editarClienteCategoria').value) ? document.getElementById('editarClienteCategoria').value.trim() : '';
      data.convenio = (document.getElementById('editarClienteConvenio') && document.getElementById('editarClienteConvenio').value) ? document.getElementById('editarClienteConvenio').value.trim() : '';
    }
    const list = typeof getClientesBBDD === 'function' ? getClientesBBDD() : [];
    const idx = list.findIndex(function (c) { return (c.matricula || '').trim().toUpperCase() === (matOriginal || '').trim().toUpperCase(); });
    const existing = idx >= 0 ? list[idx] : null;
    const isNewClient = !existing;

    if (isNewClient && !isAdmin && typeof addPendiente === 'function') {
      addPendiente(data, session ? (session.nombre || session.username || '') : '');
      document.getElementById('modalEditarCliente').classList.remove('active');
      alert('Su solicitud ha sido procesada y queda pendiente en la visualización de esta pantalla. Un administrador debe aprobarla para que el cliente quede registrado en la base de datos.');
      if (typeof updateBadgePendientesRegistro === 'function') updateBadgePendientesRegistro();
      if (typeof renderTablaClientesBBDD === 'function') renderTablaClientesBBDD();
      if (typeof renderFichasClientes === 'function') renderFichasClientes();
      return;
    }

    if (typeof getClientesBBDD === 'function' && typeof addOrUpdateClienteBBDD === 'function') {
      if (existing && data.matricula.toUpperCase() !== (matOriginal || '').trim().toUpperCase()) {
        list.splice(idx, 1);
        try { localStorage.setItem('benny_clientes_bbdd', JSON.stringify(list)); if (typeof window.invalidateClientesBBDDCache === 'function') window.invalidateClientesBBDDCache(); } catch (err) {}
      }
      addOrUpdateClienteBBDD({ ...existing, ...data });
    }
    document.getElementById('modalEditarCliente').classList.remove('active');
    renderTablaClientesBBDD();
    if (typeof renderFichasClientes === 'function') renderFichasClientes();
    if (typeof renderUltimasEntradasClientes === 'function') renderUltimasEntradasClientes();
  });

  formUsuario?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('usuarioId').value;
    const rol = document.getElementById('usuarioRol').value;
    var passwordVal = (document.getElementById('usuarioPassword') && document.getElementById('usuarioPassword').value) ? String(document.getElementById('usuarioPassword').value).trim() : '';
    var confirmVal = (document.getElementById('usuarioPasswordConfirm') && document.getElementById('usuarioPasswordConfirm').value) ? String(document.getElementById('usuarioPasswordConfirm').value).trim() : '';
    if (!id) {
      if (!passwordVal) {
        alert('La contraseña es obligatoria para nuevos usuarios.');
        return;
      }
      if (passwordVal.length < 4) {
        alert('La contraseña debe tener al menos 4 caracteres.');
        return;
      }
      if (passwordVal !== confirmVal) {
        var errEl = document.getElementById('usuarioPasswordConfirmError');
        if (errEl) { errEl.textContent = 'La contraseña y la confirmación no coinciden.'; errEl.style.display = 'block'; }
        alert('La contraseña y la confirmación no coinciden.');
        return;
      }
      var errElClear = document.getElementById('usuarioPasswordConfirmError');
      if (errElClear) { errElClear.style.display = 'none'; errElClear.textContent = ''; }
    }
    const data = {
      username: document.getElementById('usuarioUsername').value.trim(),
      nombre: document.getElementById('usuarioNombre').value.trim(),
      password: passwordVal,
      rol,
      permisos: {},
      activo: document.getElementById('usuarioActivo').checked,
    };
    if (id && typeof isUsuarioContrasenaProtegida === 'function') {
      var userEdit = getUsers().find(function (x) { return x.id === id; });
      if (userEdit && isUsuarioContrasenaProtegida(userEdit.username)) delete data.password;
    }
    if (rol === 'admin') {
      Object.keys(PERMISOS).forEach(k => { data.permisos[k] = true; });
    } else if (rol === 'responsableMecanicos') {
      Object.keys(PERMISOS).forEach(k => {
        const cb = document.getElementById('perm_' + k);
        data.permisos[k] = cb ? cb.checked : (k === 'gestionarEquipo' || k === 'verOrganigrama');
      });
    } else {
      Object.keys(PERMISOS).forEach(k => {
        const cb = document.getElementById('perm_' + k);
        if (cb) data.permisos[k] = cb.checked;
      });
    }
    data.fechaAlta = document.getElementById('usuarioFechaAlta').value || (id ? undefined : new Date().toISOString().slice(0, 10));
    data.responsable = document.getElementById('usuarioResponsable').value.trim() || null;
    data.puesto = document.getElementById('usuarioPuesto').value.trim() || '';
    data.salario = document.getElementById('usuarioSalario').value !== '' ? parseFloat(document.getElementById('usuarioSalario').value) : null;
    const equipoEl = document.getElementById('usuarioEquipo');
    if (equipoEl && equipoEl.offsetParent !== null) {
      data.equipo = (equipoEl.value || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    const session = getSession();
    if (id && hasPermission(session, 'gestionarEquipo') && !hasPermission(session, 'gestionarUsuarios')) {
      const target = getUsers().find(u => u.id === id);
      if (target && !hasPermission(target, 'noRequiereAprobacionAdmin')) {
        addPendingUserUpdate({ targetId: id, data, requestedBy: session.username, fecha: new Date().toISOString() });
        cerrarFichaEmpleadoSiAbierta();
        renderListaUsuarios();
        alert('Cambios enviados. Un administrador debe aprobarlos.');
        return;
      }
    }
    let res;
    if (id) {
      res = await updateUser(id, data, session.username);
    } else {
      data.password = passwordVal || '1234';
      res = await createUser(data, session.username);
    }
    if (res.error) {
      alert(res.error);
      return;
    }
    cerrarFichaEmpleadoSiAbierta();
    renderListaUsuarios();
    if (typeof renderTablaUsuarios === 'function') renderTablaUsuarios();
    renderAprobacionesPendientes();
    if (typeof renderMainDashboard === 'function') renderMainDashboard();
    if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
    if (typeof renderOrganigrama === 'function' && document.getElementById('pantallaOrganigrama')?.style.display === 'flex') {
      renderOrganigrama('organigramaContainer', !!window._organigramaEditMode);
    }
  });
}

// ========== ORGANIGRAMA (pantalla completa) ==========
window._organigramaEditMode = false;

function abrirPantallaOrganigrama() {
  const pantallaOrganigrama = document.getElementById('pantallaOrganigrama');
  const btnAddNivel = document.getElementById('btnAddNivelOrganigrama');
  const btnToggle = document.getElementById('btnOrganigramaToggleVerEditar');
  if (!pantallaOrganigrama) return;
  const session = getSession();
  const canEdit = hasPermission(session, 'gestionarUsuarios');
  window._organigramaEditMode = false;
  if (typeof renderOrganigrama === 'function') {
    renderOrganigrama('organigramaContainer', false);
  }
  if (btnToggle) {
    btnToggle.style.display = canEdit ? '' : 'none';
    btnToggle.classList.toggle('org-mode-edit', false);
    var lbl = document.getElementById('organigramaToggleLabel');
    if (lbl) lbl.textContent = 'Editar';
  }
  if (btnAddNivel) btnAddNivel.style.display = 'none';
  if (typeof hideOrganigramaToolbar === 'function') hideOrganigramaToolbar();
  var previewPlaceholder = document.getElementById('organigramaFichaPreviewPlaceholder');
  var previewContent = document.getElementById('organigramaFichaPreviewContent');
  if (previewPlaceholder) { previewPlaceholder.style.display = ''; previewPlaceholder.textContent = 'Selecciona un empleado para ver su ficha.'; }
  if (previewContent) previewContent.style.display = 'none';
  cerrarTodasPantallasSecundarias();
  ocultarAppBodyMostrarSecundaria('pantallaOrganigrama');
}

function toggleOrganigramaVerEditar() {
  if (!hasPermission(getSession(), 'gestionarUsuarios')) return;
  window._organigramaEditMode = !window._organigramaEditMode;
  var btnToggle = document.getElementById('btnOrganigramaToggleVerEditar');
  var lbl = document.getElementById('organigramaToggleLabel');
  var btnAddNivel = document.getElementById('btnAddNivelOrganigrama');
  if (btnToggle) btnToggle.classList.toggle('org-mode-edit', window._organigramaEditMode);
  if (lbl) lbl.textContent = window._organigramaEditMode ? 'Ver' : 'Editar';
  if (btnAddNivel) btnAddNivel.style.display = window._organigramaEditMode ? '' : 'none';
  if (!window._organigramaEditMode && typeof hideOrganigramaToolbar === 'function') hideOrganigramaToolbar();
  if (typeof renderOrganigrama === 'function') {
    renderOrganigrama('organigramaContainer', window._organigramaEditMode);
  }
}

function vincularOrganigrama() {
  const pantallaOrganigrama = document.getElementById('pantallaOrganigrama');
  const btnOrganigramaHome = document.getElementById('btnOrganigramaHome');
  const btnAddNivel = document.getElementById('btnAddNivelOrganigrama');
  const btnToggle = document.getElementById('btnOrganigramaToggleVerEditar');
  const toolbarEditar = document.getElementById('orgToolbarEditar');
  const toolbarAddChild = document.getElementById('orgToolbarAddChild');
  const toolbarEliminar = document.getElementById('orgToolbarEliminar');
  if (!pantallaOrganigrama) return;

  if (btnOrganigramaHome) {
    btnOrganigramaHome.addEventListener('click', function(e) {
      e.preventDefault();
      cerrarTodasPantallasSecundarias();
    });
  }
  if (btnAddNivel) btnAddNivel.addEventListener('click', () => añadirNivelRaiz());
  if (btnToggle) btnToggle.addEventListener('click', function(e) { e.preventDefault(); toggleOrganigramaVerEditar(); });

  function getToolbarSelected() {
    var bar = document.getElementById('orgToolbarSeleccion');
    return bar ? { id: bar.dataset.selectedId || '', username: bar.dataset.selectedUsername || '' } : { id: '', username: '' };
  }
  if (toolbarEditar) {
    toolbarEditar.addEventListener('click', function() {
      var sel = getToolbarSelected();
      if (sel.id && typeof abrirFormUsuario === 'function') abrirFormUsuario(sel.id);
    });
  }
  if (toolbarAddChild) {
    toolbarAddChild.addEventListener('click', function() {
      var sel = getToolbarSelected();
      if (typeof abrirFormUsuarioNuevoConResponsable === 'function') abrirFormUsuarioNuevoConResponsable(sel.username || '');
    });
  }
  if (toolbarEliminar) {
    toolbarEliminar.addEventListener('click', function() {
      var sel = getToolbarSelected();
      if (!sel.id) return;
      if (!confirm('¿Desactivar a este usuario en el organigrama? (Seguirá en Gestión de usuarios como inactivo)')) return;
      var session = getSession();
      if (typeof updateUser === 'function' && session) {
        updateUser(sel.id, { activo: false }, session.username).then(function(res) {
          if (res && res.error) alert(res.error);
          else if (typeof renderOrganigrama === 'function') renderOrganigrama('organigramaContainer', true);
          if (typeof hideOrganigramaToolbar === 'function') hideOrganigramaToolbar();
        }).catch(function() {
          if (typeof renderOrganigrama === 'function') renderOrganigrama('organigramaContainer', true);
          if (typeof hideOrganigramaToolbar === 'function') hideOrganigramaToolbar();
        });
      }
    });
  }
  var orgPreviewBtnEditar = document.getElementById('orgPreviewBtnEditar');
  if (orgPreviewBtnEditar) {
    orgPreviewBtnEditar.addEventListener('click', function() {
      var panel = document.getElementById('organigramaFichaPreview');
      var userId = panel && panel.dataset && panel.dataset.userId ? panel.dataset.userId : null;
      if (userId && typeof abrirFormUsuario === 'function') abrirFormUsuario(userId);
    });
  }
}

// ========== FICHAJES ==========
function getReparacionesByUser() {
  const servicios = getRegistroServicios();
  const now = new Date();
  const { inicio: inicioSemana, fin: finSemana } = getSemanaLimites(now);
  const hoyInicio = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const hoyFin = new Date(hoyInicio.getTime() + 24 * 60 * 60 * 1000 - 1);
  const byUser = {};
  servicios.forEach(s => {
    const uid = s.userId || s.empleado || '_';
    if (!byUser[uid]) byUser[uid] = { hoy: 0, semana: 0, total: 0, totalBilled: 0, conImporteCero: 0 };
    byUser[uid].total++;
    byUser[uid].totalBilled += (s.importe || 0);
    if (s.importe == null || s.importe === 0) byUser[uid].conImporteCero = (byUser[uid].conImporteCero || 0) + 1;
    const t = new Date(s.fecha).getTime();
    if (t >= hoyInicio.getTime() && t < hoyFin.getTime()) byUser[uid].hoy++;
    if (t >= inicioSemana.getTime() && t <= finSemana.getTime()) byUser[uid].semana++;
  });
  return byUser;
}

/** Datos por empleado para vista manager: horas, servicios, facturación, alertas */
function getRendimientoEmpleados() {
  const users = getUsers().filter(u => u.activo !== false);
  const reps = getReparacionesByUser();
  const result = [];
  users.forEach(u => {
    const uid = u.username;
    const r = reps[uid] || { hoy: 0, semana: 0, total: 0, totalBilled: 0, conImporteCero: 0 };
    const horas = getHorasSemana(uid, new Date());
    const alertas = [];
    if (horas < HORAS_MINIMAS_SEMANA) alertas.push('Pocas horas (' + horas.toFixed(1) + 'h < ' + HORAS_MINIMAS_SEMANA + 'h)');
    if (r.semana < 2 && r.total > 0) alertas.push('Pocas reparaciones esta semana');
    if (r.conImporteCero > 0) alertas.push(r.conImporteCero + ' servicio(s) con importe 0');
    const importeMedio = r.total > 0 ? r.totalBilled / r.total : 0;
    if (r.total > 2 && importeMedio < 100) alertas.push('Importe medio muy bajo');
    result.push({
      username: uid,
      nombre: u.nombre || uid,
      horas,
      hoy: r.hoy,
      semana: r.semana,
      total: r.total,
      totalBilled: r.totalBilled,
      alertas,
    });
  });
  return result;
}

function renderFichajesDashboard(userId) {
  const horas = getHorasSemana(userId, new Date());
  const minimo = typeof HORAS_MINIMAS_SEMANA !== 'undefined' ? HORAS_MINIMAS_SEMANA : 5;
  const pct = Math.min(100, (horas / minimo) * 100);
  const bar = document.getElementById('barHorasSemana');
  const textHoras = document.getElementById('textHorasSemana');
  const textMinimo = document.getElementById('textHorasMinimo');
  if (bar) bar.style.width = pct + '%';
  if (textHoras) textHoras.textContent = horas.toFixed(1) + ' h';
  if (textMinimo) textMinimo.textContent = minimo + ' h';

  const msRestante = getMsHastaFinSemana(new Date());
  const textHasta = document.getElementById('textHastaSemana');
  if (textHasta) {
    const d = Math.floor(msRestante / (24 * 60 * 60 * 1000));
    const h = Math.floor((msRestante % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const m = Math.floor((msRestante % (60 * 60 * 1000)) / (60 * 1000));
    textHasta.textContent = d + 'd ' + h + 'h ' + m + 'm';
  }

  const reps = getReparacionesByUser();
  const myRep = reps[userId] || { hoy: 0, semana: 0, total: 0 };
  const repHoy = document.getElementById('repHoy');
  const repSemana = document.getElementById('repSemana');
  const repTotal = document.getElementById('repTotal');
  if (repHoy) repHoy.textContent = myRep.hoy;
  if (repSemana) repSemana.textContent = myRep.semana;
  if (repTotal) repTotal.textContent = myRep.total;

  const users = getUsers();
  const rankingList = document.getElementById('rankingList');
  if (!rankingList) return;
  const sorted = users
    .filter(u => u.activo !== false)
    .map(u => ({ user: u, semana: (reps[u.username] || {}).semana || 0 }))
    .sort((a, b) => b.semana - a.semana);
  rankingList.innerHTML = '';
  sorted.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'ranking-item' + (item.user.username === userId ? ' ranking-item-me' : '');
    div.innerHTML = '<span class="ranking-pos">#' + (idx + 1) + '</span><span class="ranking-nombre">' + (item.user.nombre || item.user.username) + '</span><span class="ranking-total">' + item.semana + '</span>';
    rankingList.appendChild(div);
  });
}

/** Convierte fichajes en lista cronológica de eventos (entrada/salida) ordenada por fecha descendente */
function getFichajesComoEventos(userId) {
  const fichajes = (userId ? getFichajesByUser(userId) : getFichajes()).slice(0, 80);
  const users = typeof getUsers === 'function' ? getUsers() : [];
  const eventos = [];
  fichajes.forEach(function (f) {
    var nombre = (users.find(function (u) { return (u.username || '') === (f.userId || ''); }) || {}).nombre || f.userId || '—';
    var dEntrada = new Date(f.entrada);
    eventos.push({ type: 'entrada', date: f.entrada, userId: f.userId, nombre: nombre, fichajeId: f.id });
    if (f.salida) eventos.push({ type: 'salida', date: f.salida, userId: f.userId, nombre: nombre });
  });
  eventos.sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });
  return eventos;
}

function renderListaFichajesReciente(userId, listId) {
  const list = document.getElementById(listId || 'listaFichajesReciente');
  if (!list) return;
  list.setAttribute('data-fichajes-user-id', (userId || '').toString());
  list.setAttribute('data-fichajes-list-id', (listId || 'listaFichajesReciente').toString());
  const eventos = getFichajesComoEventos(userId);
  if (eventos.length === 0) {
    list.innerHTML = '<p class="no-fichajes">Sin fichajes recientes.</p>';
    return;
  }
  const iconEntrada = '<span class="fichaje-card-icon fichaje-card-icon-entrada" aria-label="Entrada"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>';
  const iconSalida = '<span class="fichaje-card-icon fichaje-card-icon-salida" aria-label="Salida"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg></span>';
  list.innerHTML = eventos.map(function (ev) {
    const d = new Date(ev.date);
    const dateStr = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
    const icon = ev.type === 'entrada' ? iconEntrada : iconSalida;
    const nombreUpper = (ev.nombre || '—').toString().toUpperCase();
    const btnEditar = (ev.type === 'entrada' && ev.fichajeId) ? '<button type="button" class="btn btn-sm fichaje-editar-entrada-btn" data-fichaje-id="' + escapeHtmlAttr(ev.fichajeId) + '" data-date-iso="' + escapeHtmlAttr(ev.date) + '" title="Editar hora de entrada">Editar</button>' : '';
    return '<div class="fichaje-item ' + (ev.type === 'entrada' ? 'fichaje-item-entrada' : 'fichaje-item-salida') + '" data-fichaje-id="' + (ev.fichajeId ? escapeHtmlAttr(ev.fichajeId) : '') + '">' + icon + '<span class="fichaje-card-nombre">' + escapeHtml(nombreUpper) + '</span><span class="fichaje-card-fecha">' + escapeHtml(dateStr) + '</span><span class="fichaje-card-hora">' + escapeHtml(timeStr) + '</span>' + btnEditar + '</div>';
  }).join('');
}

function renderTablaRendimiento() {
  const wrap = document.getElementById('tablaRendimiento');
  if (!wrap) return;
  const rows = getRendimientoEmpleados();
  const minimo = typeof HORAS_MINIMAS_SEMANA !== 'undefined' ? HORAS_MINIMAS_SEMANA : 5;
  wrap.innerHTML = '<table><thead><tr><th>Trabajador</th><th>Mín. semana</th><th>Acumulado semana</th><th>Servicios (hoy/sem/total)</th><th>Facturado total</th><th>Indicadores</th></tr></thead><tbody>' +
    rows.map(r => '<tr><td>' + escapeHtml(r.nombre) + '</td><td>' + minimo + ' h</td><td>' + r.horas.toFixed(1) + ' h</td><td>' + r.hoy + ' / ' + r.semana + ' / ' + r.total + '</td><td>$' + (r.totalBilled || 0).toLocaleString('es-ES') + '</td><td>' + (r.alertas.length ? '<span class="alerta">' + r.alertas.join(' · ') + '</span>' : '<span class="ok">OK</span>') + '</td></tr>').join('') +
    '</tbody></table>';
}

function vincularFichajes() {
  const pantallaPrincipal = document.getElementById('pantallaPrincipal');
  const pantallaFichajes = document.getElementById('pantallaFichajes');
  const btnOpen = document.getElementById('btnFichajes');
  const btnHome = document.getElementById('btnFichajesHome');
  const btnEntrada = document.getElementById('btnFicharEntrada');
  const btnSalida = document.getElementById('btnFicharSalida');
  const btnManual = document.getElementById('btnFichajeManual');
  if (!pantallaFichajes || !btnOpen) return;

  function actualizarEstadoBotonEntrada() {
    const session = getSession();
    if (!btnEntrada || !session) return;
    const abierta = typeof hasEntradaAbierta === 'function' && hasEntradaAbierta(session.username);
    btnEntrada.disabled = !!abierta;
    btnEntrada.setAttribute('aria-disabled', abierta ? 'true' : 'false');
    btnEntrada.title = abierta ? 'Ya tienes una entrada registrada. Ficha salida antes de volver a entrar.' : 'Registrar entrada';
  }

  function abrirPantallaFichajes() {
    cerrarTodasPantallasSecundarias();
    limpiarEntradasAbiertasAntiguas();
    const session = getSession();
    const userId = session ? session.username : null;
    const isAdmin = hasPermission(session, 'gestionarUsuarios');
    actualizarEstadoBotonEntrada();
    const tabTodos = document.getElementById('tabFichajesTodos');
    const tabRend = document.getElementById('tabRendimiento');
    if (tabTodos) tabTodos.style.display = isAdmin ? '' : 'none';
    if (tabRend) tabRend.style.display = isAdmin ? '' : 'none';
    document.querySelectorAll('.fichajes-tab').forEach(t => t.classList.remove('active'));
    const tabMi = document.querySelector('.fichajes-tab[data-fichajes-tab="mi-fichaje"]');
    if (tabMi) tabMi.classList.add('active');
    document.getElementById('panelMiFichaje').style.display = 'block';
    document.getElementById('panelFichajesTodos').style.display = 'none';
    document.getElementById('panelRendimiento').style.display = 'none';
    function pintarFichajes() {
      if (userId) {
        renderFichajesDashboard(userId);
        renderListaFichajesReciente(userId);
      }
      actualizarLedFichaje();
      var rankingSection = document.getElementById('rankingSectionFichajes');
      if (rankingSection) rankingSection.style.display = isAdmin ? '' : 'none';
      var hintSoloPropio = document.getElementById('fichajesHintSoloPropio');
      if (hintSoloPropio) hintSoloPropio.style.display = isAdmin ? 'none' : 'block';
      if (isAdmin) {
        const sel = document.getElementById('selectFichajesEmpleado');
        if (sel) {
          sel.innerHTML = '';
          getUsers().filter(u => u.activo !== false).forEach(u => {
            const o = document.createElement('option');
            o.value = u.username;
            o.textContent = u.nombre || u.username;
            sel.appendChild(o);
          });
          sel.dispatchEvent(new Event('change'));
        }
        renderTablaRendimiento();
      }
    }
    if (window.backendApi && typeof window.backendApi.fetchAndApplyFichajes === 'function') {
      window.backendApi.fetchAndApplyFichajes().then(function () {
        pintarFichajes();
        ocultarAppBodyMostrarSecundaria('pantallaFichajes');
      }).catch(function () {
        pintarFichajes();
        ocultarAppBodyMostrarSecundaria('pantallaFichajes');
      });
    } else {
      pintarFichajes();
      ocultarAppBodyMostrarSecundaria('pantallaFichajes');
    }
  }

  function volverPantallaPrincipal() {
    cerrarTodasPantallasSecundarias();
  }

  btnOpen.addEventListener('click', function(e) {
    e.preventDefault();
    abrirPantallaFichajes();
  });
  if (btnHome) {
    btnHome.addEventListener('click', function(e) {
      e.preventDefault();
      volverPantallaPrincipal();
    });
  }

  if (btnEntrada) {
    btnEntrada.addEventListener('click', () => {
      const session = getSession();
      if (!session) return;
      limpiarEntradasAbiertasAntiguas();
      if (typeof hasEntradaAbierta === 'function' && hasEntradaAbierta(session.username)) {
        alert('Ya tienes una entrada registrada. Ficha salida antes de registrar otra entrada.');
        return;
      }
      const now = new Date();
      const nowIso = now.toISOString();
      addFichaje(session.username, nowIso, null);
      const entradaManual = document.getElementById('fichajeEntrada');
      if (entradaManual) {
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        entradaManual.value = y + '-' + m + '-' + d + 'T' + h + ':' + min;
      }
      renderListaFichajesReciente(session.username);
      renderFichajesDashboard(session.username);
      actualizarEstadoBotonEntrada();
      if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
      alert('Entrada registrada a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.');
    });
  }
  if (btnSalida) {
    btnSalida.addEventListener('click', () => {
      const session = getSession();
      if (!session) return;
      limpiarEntradasAbiertasAntiguas();
      const now = new Date().toISOString();
      const fichajeCerrado = cerrarUltimoFichaje(session.username, now);
      if (fichajeCerrado) {
        renderListaFichajesReciente(session.username);
        renderFichajesDashboard(session.username);
        actualizarEstadoBotonEntrada();
        if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
        if (typeof enviarRegistroFichajeADiscord === 'function') enviarRegistroFichajeADiscord(fichajeCerrado, session);
        alert('Salida registrada a las ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.');
      } else {
        alert('No puedes fichar salida sin una entrada previa. Pulsa primero «Entrada» cuando empieces el turno.');
      }
    });
  }

  var ledFichajeWrap = document.getElementById('ledFichajeWrap');
  if (ledFichajeWrap && !ledFichajeWrap.dataset.fichajeLedBound) {
    ledFichajeWrap.dataset.fichajeLedBound = '1';
    var fichajeLedProcesando = false;
    ledFichajeWrap.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (fichajeLedProcesando) return;
      var session = getSession();
      if (!session) return;
      var userId = session.username || session.id || '';
      if (!userId) return;
      fichajeLedProcesando = true;
      setTimeout(function () { fichajeLedProcesando = false; }, 600);
      limpiarEntradasAbiertasAntiguas();
      var abierta = typeof hasEntradaAbierta === 'function' && hasEntradaAbierta(userId);
      if (abierta) {
        var now = new Date().toISOString();
        var fichajeCerrado = typeof cerrarUltimoFichaje === 'function' ? cerrarUltimoFichaje(userId, now) : null;
        if (fichajeCerrado) {
          renderListaFichajesReciente(userId);
          renderFichajesDashboard(userId);
          actualizarEstadoBotonEntrada();
          if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
          if (typeof enviarRegistroFichajeADiscord === 'function') enviarRegistroFichajeADiscord(fichajeCerrado, session);
          alert('Salida registrada a las ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.');
        } else {
          alert('No puedes fichar salida sin una entrada previa.');
        }
      } else {
        var now = new Date();
        var nowIso = now.toISOString();
        if (typeof addFichaje === 'function') addFichaje(userId, nowIso, null);
        var entradaManual = document.getElementById('fichajeEntrada');
        if (entradaManual) {
          var y = now.getFullYear();
          var m = String(now.getMonth() + 1).padStart(2, '0');
          var d = String(now.getDate()).padStart(2, '0');
          var h = String(now.getHours()).padStart(2, '0');
          var min = String(now.getMinutes()).padStart(2, '0');
          entradaManual.value = y + '-' + m + '-' + d + 'T' + h + ':' + min;
        }
        renderListaFichajesReciente(userId);
        renderFichajesDashboard(userId);
        actualizarEstadoBotonEntrada();
        if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
        alert('Entrada registrada a las ' + now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.');
      }
    });
  }

  document.querySelectorAll('.fichajes-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.fichajesTab;
      document.querySelectorAll('.fichajes-tab').forEach(x => x.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panelMiFichaje').style.display = t === 'mi-fichaje' ? 'block' : 'none';
      document.getElementById('panelFichajesTodos').style.display = t === 'todos' ? 'block' : 'none';
      document.getElementById('panelRendimiento').style.display = t === 'rendimiento' ? 'block' : 'none';
      if (t === 'todos') document.getElementById('selectFichajesEmpleado').dispatchEvent(new Event('change'));
      if (t === 'rendimiento') renderTablaRendimiento();
    });
  });

  const selEmpleado = document.getElementById('selectFichajesEmpleado');
  if (selEmpleado) {
    selEmpleado.addEventListener('change', () => {
      const uid = selEmpleado.value;
      if (!uid) return;
      renderListaFichajesReciente(uid, 'listaFichajesEmpleado');
      const statsWrap = document.getElementById('statsFichajesEmpleado');
      if (statsWrap) {
        const horas = getHorasSemana(uid, new Date());
        const minimo = typeof HORAS_MINIMAS_SEMANA !== 'undefined' ? HORAS_MINIMAS_SEMANA : 5;
        const reps = getReparacionesByUser()[uid] || { hoy: 0, semana: 0, total: 0 };
        statsWrap.innerHTML = '<div class="fichajes-stats">' +
          '<div class="stat-card"><span class="stat-label">Mínimo a realizar esta semana</span><span class="stat-value">' + minimo + ' h</span></div>' +
          '<div class="stat-card"><span class="stat-label">Acumulado total esta semana</span><span class="stat-value">' + horas.toFixed(1) + ' h</span></div>' +
          '<div class="stat-card"><span class="stat-label">Servicios (hoy / semana / total)</span><span class="stat-value">' + reps.hoy + ' / ' + reps.semana + ' / ' + reps.total + '</span></div></div>';
      }
    });
  }

  if (pantallaFichajes && !pantallaFichajes.dataset.fichajeEditarBound) {
    pantallaFichajes.dataset.fichajeEditarBound = '1';
    pantallaFichajes.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest('.fichaje-editar-entrada-btn');
      if (!btn) return;
      e.preventDefault();
      var fichajeId = btn.getAttribute('data-fichaje-id');
      var dateIso = btn.getAttribute('data-date-iso');
      if (!fichajeId || typeof updateFichajeEntrada !== 'function') return;
      var list = btn.closest('.lista-fichajes-reciente');
      if (!list) return;
      var userId = list.getAttribute('data-fichajes-user-id') || '';
      var listId = list.getAttribute('data-fichajes-list-id') || 'listaFichajesReciente';
      var item = btn.closest('.fichaje-item');
      if (!item) return;
      var horaSpan = item.querySelector('.fichaje-card-hora');
      if (!horaSpan) return;
      var d = new Date(dateIso);
      var isoForInput = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      var wrap = document.createElement('span');
      wrap.className = 'fichaje-edit-entrada-wrap';
      var input = document.createElement('input');
      input.type = 'datetime-local';
      input.value = isoForInput;
      input.className = 'fichaje-edit-entrada-input';
      var guardar = document.createElement('button');
      guardar.type = 'button';
      guardar.className = 'btn btn-sm';
      guardar.textContent = 'Guardar';
      var cancelar = document.createElement('button');
      cancelar.type = 'button';
      cancelar.className = 'btn btn-sm btn-outline';
      cancelar.textContent = 'Cancelar';
      wrap.appendChild(input);
      wrap.appendChild(guardar);
      wrap.appendChild(cancelar);
      horaSpan.style.display = 'none';
      btn.style.display = 'none';
      item.insertBefore(wrap, horaSpan.nextSibling);
      input.focus();
      function quitarEditor() {
        wrap.remove();
        horaSpan.style.display = '';
        btn.style.display = '';
      }
      guardar.addEventListener('click', function () {
        var val = input.value;
        if (!val) return;
        var nuevaEntrada = new Date(val);
        if (isNaN(nuevaEntrada.getTime())) return;
        if (updateFichajeEntrada(fichajeId, nuevaEntrada.toISOString())) {
          if (typeof invalidateFichajesCache === 'function') invalidateFichajesCache();
          renderListaFichajesReciente(userId, listId);
          if (typeof renderFichajesDashboard === 'function' && userId) renderFichajesDashboard(userId);
          if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
        }
        quitarEditor();
      });
      cancelar.addEventListener('click', quitarEditor);
    });
  }

  if (btnManual) {
    btnManual.addEventListener('click', () => {
      const session = getSession();
      if (!session) return;
      const entradaEl = document.getElementById('fichajeEntrada');
      const salidaEl = document.getElementById('fichajeSalida');
      const e = entradaEl?.value;
      const s = salidaEl?.value;
      if (!e || !s) {
        alert('Indica entrada y salida.');
        return;
      }
      const entDate = new Date(e);
      const salDate = new Date(s);
      if (salDate <= entDate) {
        alert('La salida debe ser posterior a la entrada.');
        return;
      }
      limpiarEntradasAbiertasAntiguas();
      if (typeof hasEntradaAbierta === 'function' && hasEntradaAbierta(session.username)) {
        alert('Ya tienes una entrada sin salida. Registra primero la salida del turno actual (botón Salida) antes de añadir un fichaje manual completo.');
        return;
      }
      addFichaje(session.username, entDate.toISOString(), salDate.toISOString());
      if (entradaEl) entradaEl.value = '';
      if (salidaEl) salidaEl.value = '';
      renderListaFichajesReciente(session.username);
      renderFichajesDashboard(session.username);
      actualizarEstadoBotonEntrada();
      alert('Fichaje registrado.');
    });
  }
}

function renderAprobacionesPendientes() {
  const wrap = document.getElementById('aprobacionesPendientesWrap');
  const cont = document.getElementById('aprobacionesPendientesLista');
  if (!wrap || !cont) return;
  const session = getSession();
  if (!hasPermission(session, 'gestionarUsuarios')) { wrap.style.display = 'none'; return; }
  const pending = getPendingUserUpdates();
  if (pending.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const users = getUsers();
  cont.innerHTML = pending.map(p => {
    const target = users.find(u => u.id === p.targetId);
    const targetName = target ? (target.nombre || target.username) : p.targetId;
    const fecha = p.fecha ? new Date(p.fecha).toLocaleString('es-ES') : '';
    return '<div class="pendiente-user-item"><span>' + escapeHtml(targetName) + '</span> — solicitado por ' + escapeHtml(p.requestedBy || '') + ' · ' + fecha + ' <button type="button" class="btn btn-outline btn-sm btn-aprobar-pend" data-pend-id="' + escapeHtml(p.id) + '">Aprobar</button> <button type="button" class="btn btn-outline btn-sm btn-rechazar-pend" data-pend-id="' + escapeHtml(p.id) + '">Rechazar</button></div>';
  }).join('');
  cont.querySelectorAll('.btn-aprobar-pend').forEach(btn => {
    btn.addEventListener('click', async function() {
      const pid = this.dataset.pendId;
      const p = getPendingUserUpdates().find(x => x.id === pid);
      if (!p) return;
      const res = await updateUser(p.targetId, p.data, session.username);
      if (res.error) alert(res.error);
      else {
        removePendingUserUpdate(pid);
        renderListaUsuarios();
        if (typeof renderMainDashboard === 'function') renderMainDashboard();
        if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
      }
    });
  });
  cont.querySelectorAll('.btn-rechazar-pend').forEach(btn => {
    btn.addEventListener('click', function() {
      removePendingUserUpdate(this.dataset.pendId);
      renderAprobacionesPendientes();
    });
  });
}

var EMPLEADOS_NIVEL_LABELS = { 0: 'Dirección', 1: 'Responsables', 2: 'Equipo', 3: 'Operativos' };
function getEmpleadoNivelLabel(nivel) {
  return EMPLEADOS_NIVEL_LABELS[nivel] || ('Nivel ' + nivel);
}

function renderListaUsuarios() {
  const lista = document.getElementById('listaUsuarios');
  if (!lista) return;
  const session = getSession();
  let users = getUsers();
  if (hasPermission(session, 'gestionarEquipo') && !hasPermission(session, 'gestionarUsuarios')) {
    const me = users.find(u => u.id === session.id || u.username === session.username);
    const equipoIds = (me && me.equipo) ? me.equipo : [];
    users = users.filter(u => equipoIds.indexOf(u.id) !== -1);
  }
  const btnNuevo = document.getElementById('btnNuevoUsuario');
  if (btnNuevo) btnNuevo.style.display = hasPermission(session, 'gestionarUsuarios') ? '' : 'none';
  lista.innerHTML = '';
  if (hasPermission(session, 'gestionarEquipo') && !hasPermission(session, 'gestionarUsuarios') && users.length > 0) {
    const hint = document.createElement('p');
    hint.className = 'admin-hint-equipo';
    hint.textContent = 'Vista de tu equipo. Los cambios pueden requerir aprobación de un administrador.';
    lista.appendChild(hint);
  }
  if (hasPermission(session, 'gestionarUsuarios')) renderAprobacionesPendientes();

  var organigrama = typeof getOrganigrama === 'function' ? getOrganigrama() : null;
  var nodes = (organigrama && organigrama.nodes) ? organigrama.nodes : [];
  var nivelByUserId = {};
  nodes.forEach(function (n) {
    if (n.id != null) nivelByUserId[n.id] = n.nivel != null ? n.nivel : 0;
  });
  var byNivel = {};
  users.forEach(function (u) {
    var niv = nivelByUserId[u.id] != null ? nivelByUserId[u.id] : 2;
    if (!byNivel[niv]) byNivel[niv] = [];
    byNivel[niv].push(u);
  });
  var nivelesOrdenados = Object.keys(byNivel).map(Number).sort(function (a, b) { return a - b; });

  function buildFichaCard(u) {
    var users = getUsers();
    var responsable = (u.responsable && users.find(function (r) { return r.username === u.responsable; }))
      ? (users.find(function (r) { return r.username === u.responsable; }).nombre || u.responsable) : (u.responsable || '—');
    var uid = u.username || u.id;
    var horasSemana, totalCobrado;
    if (esUsuarioAdminParaTotales(u) && typeof getTotalesTaller === 'function') {
      var totales = getTotalesTaller();
      horasSemana = totales.horasSemana;
      totalCobrado = totales.totalCobrado;
    } else {
      horasSemana = typeof getHorasSemana === 'function' ? getHorasSemana(uid, new Date()) : 0;
      var servicios = getRegistroServicios();
      totalCobrado = servicios.filter(function (s) { return (s.userId || s.empleado) === uid; }).reduce(function (sum, s) { return sum + (s.importe || 0); }, 0);
    }
    var fechaAlta = u.fechaAlta ? new Date(u.fechaAlta).toLocaleDateString('es-ES') : (u.fechaCreacion ? new Date(u.fechaCreacion).toLocaleDateString('es-ES') : '—');
    var foto = (u.fotoPerfil || '').trim();
    var fotoHtml = (foto && (foto.startsWith('http') || foto.startsWith('data:')))
      ? '<div class="empleado-ficha-foto"><img src="' + escapeHtml(foto) + '" alt="" onerror="this.parentElement.classList.add(\'foto-error\')"></div>'
      : '<div class="empleado-ficha-foto empleado-ficha-iniciales"><span>' + escapeHtml((u.nombre || u.username || '?').substring(0, 2).toUpperCase()) + '</span></div>';
    var puedeEliminar = hasPermission(session, 'gestionarUsuarios');
    var inactivo = u.activo === false ? ' empleado-ficha-inactivo' : '';
    return '<div class="empleado-ficha-card' + inactivo + '" data-user-id="' + escapeHtmlAttr(u.id) + '">' +
      fotoHtml +
      '<div class="empleado-ficha-body">' +
      '<h4 class="empleado-ficha-nombre">' + escapeHtml(u.nombre || u.username) + '</h4>' +
      '<p class="empleado-ficha-rol">' + escapeHtml(u.puesto || u.rol || '—') + '</p>' +
      '<div class="empleado-ficha-datos">' +
      '<div class="empleado-ficha-row"><span class="empleado-ficha-label">Responsable</span><span>' + escapeHtml(responsable) + '</span></div>' +
      '<div class="empleado-ficha-row"><span class="empleado-ficha-label">Puesto</span><span>' + escapeHtml(u.puesto || '—') + '</span></div>' +
      '<div class="empleado-ficha-row"><span class="empleado-ficha-label">Fecha alta</span><span>' + escapeHtml(fechaAlta) + '</span></div>' +
      '<div class="empleado-ficha-row"><span class="empleado-ficha-label">Horas esta semana</span><span>' + (horasSemana || 0).toFixed(1) + ' h</span></div>' +
      '<div class="empleado-ficha-row"><span class="empleado-ficha-label">Total cobrado</span><span>' + totalCobrado.toLocaleString('es-ES') + ' €</span></div>' +
      '</div>' +
      '<div class="empleado-ficha-actions">' +
      '<button type="button" class="btn btn-outline btn-sm btn-editar-ficha" data-edit="' + escapeHtmlAttr(u.id) + '">Editar</button>' +
      '<button type="button" class="btn btn-outline btn-sm btn-vehiculos-ficha" data-user-id="' + escapeHtmlAttr(u.id) + '" title="Ver vehículos del empleado">Vehículos</button>' +
      '</div></div></div>';
  }

  var wrap = document.createElement('div');
  wrap.className = 'empleados-niveles-wrap';
  nivelesOrdenados.forEach(function (nivel) {
    var list = byNivel[nivel];
    if (!list || list.length === 0) return;
    var titulo = getEmpleadoNivelLabel(nivel);
    var section = document.createElement('div');
    section.className = 'empleados-nivel-bloque nivel-' + nivel;
    section.innerHTML = '<h3 class="empleados-nivel-titulo">' + escapeHtml(titulo) + '</h3><div class="empleados-fichas-grid">' +
      list.map(buildFichaCard).join('') + '</div>';
    wrap.appendChild(section);
  });
  lista.appendChild(wrap);

  lista.querySelectorAll('.btn-editar-ficha').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = this.getAttribute('data-edit');
      if (id) abrirFormUsuario(id);
    });
  });
  lista.querySelectorAll('.btn-vehiculos-ficha').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = this.getAttribute('data-user-id');
      if (!id) return;
      abrirFormUsuario(id);
      requestAnimationFrame(function () {
        var seccion = document.getElementById('usuarioSeccionVehiculos');
        if (seccion) {
          seccion.style.display = 'block';
          if (typeof renderFichaEmpleadoVehiculos === 'function') renderFichaEmpleadoVehiculos(id);
          seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  });
}

function cerrarFichaEmpleadoSiAbierta() {
  var pantalla = document.getElementById('pantallaFichaEmpleado');
  if (pantalla && pantalla.style.display === 'flex') cerrarTodasPantallasSecundarias();
}

/** Iconos SVG por permiso para la ficha del empleado */
var PERMISO_ICONS = {
  verCalculadora: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>',
  verPresupuesto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  registrarTuneo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  registrarReparacion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  verRegistroServicios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
  limpiarRegistro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  verOrganigrama: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="8" x2="9" y2="16"/><line x1="12" y1="8" x2="15" y2="16"/></svg>',
  gestionarUsuarios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  gestionarEquipo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
  noRequiereAprobacionAdmin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  gestionarRegistroClientes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
  verConveniosPrivados: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  gestionarCompras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  exentoTestNormativas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/></svg>'
};

function abrirFormUsuario(userId) {
  const pantalla = document.getElementById('pantallaFichaEmpleado');
  const titulo = document.getElementById('fichaEmpleadoTitulo');
  const subtitulo = document.getElementById('fichaEmpleadoSubtitulo');
  const form = document.getElementById('formUsuario');
  const fieldPassword = document.getElementById('fieldPassword');
  const fieldPasswordActual = document.getElementById('fieldPasswordActual');
  const fieldActivo = document.getElementById('fieldActivo');
  const permisosDiv = document.getElementById('permisosCheckboxes');
  if (!form || !fieldPassword || !permisosDiv) return;

  if (userId) {
    const users = getUsers();
    const u = users.find(x => x.id === userId);
    if (!u) return;
    if (titulo) titulo.textContent = (u.nombre || u.username) || 'Editar usuario';
    if (subtitulo) subtitulo.textContent = (u.username || '') + (u.puesto ? ' · ' + u.puesto : '');
    var fotoWrap = document.getElementById('fichaEmpleadoFotoWrap');
    var fotoImg = document.getElementById('fichaEmpleadoFotoImg');
    var fotoIniciales = document.getElementById('fichaEmpleadoFotoIniciales');
    if (fotoImg && fotoIniciales) {
      if (u.fotoPerfil && (u.fotoPerfil.startsWith('http') || u.fotoPerfil.startsWith('data:'))) {
        fotoImg.src = u.fotoPerfil;
        fotoImg.style.display = 'block';
        fotoIniciales.style.display = 'none';
      } else {
        fotoImg.src = '';
        fotoImg.style.display = 'none';
        fotoIniciales.style.display = '';
        fotoIniciales.textContent = (u.nombre || u.username || '?').substring(0, 2).toUpperCase();
      }
    }
    document.getElementById('usuarioId').value = u.id;
    document.getElementById('usuarioUsername').value = u.username;
    document.getElementById('usuarioUsername').readOnly = true;
    document.getElementById('usuarioNombre').value = u.nombre || '';
    document.getElementById('usuarioPassword').value = '';
    document.getElementById('usuarioPassword').placeholder = 'Dejar vacío para no cambiar';
    if (fieldPasswordActual) {
      fieldPasswordActual.style.display = 'block';
      document.getElementById('usuarioPasswordActual').value = '••••••••';
      document.getElementById('usuarioPasswordActual').placeholder = 'Almacenada de forma segura.';
    }
    var fieldPasswordConfirmEdit = document.getElementById('fieldPasswordConfirm');
    if (fieldPasswordConfirmEdit) fieldPasswordConfirmEdit.style.display = 'none';
    var confirmInputEdit = document.getElementById('usuarioPasswordConfirm');
    if (confirmInputEdit) confirmInputEdit.required = false;
    const rolVal = (u.rol || 'mecanico');
    document.getElementById('usuarioRol').value = ['peon', 'enPracticas', 'mecanico', 'responsableMecanicos', 'admin'].includes(rolVal) ? rolVal : 'mecanico';
    document.getElementById('usuarioActivo').checked = u.activo;
    document.getElementById('usuarioFechaAlta').value = u.fechaAlta ? u.fechaAlta.toString().slice(0, 10) : '';
    document.getElementById('usuarioResponsable').value = u.responsable || '';
    document.getElementById('usuarioPuesto').value = u.puesto || '';
    document.getElementById('usuarioSalario').value = u.salario != null ? u.salario : '';
    const fieldEquipo = document.getElementById('fieldEquipo');
    const usuarioEquipo = document.getElementById('usuarioEquipo');
    if (fieldEquipo && usuarioEquipo) {
      fieldEquipo.style.display = hasPermission(getSession(), 'gestionarUsuarios') ? '' : 'none';
      usuarioEquipo.value = (u.equipo && u.equipo.length) ? u.equipo.join(', ') : '';
    }
    var labelEdit = fieldPassword.querySelector('label');
    if (labelEdit) labelEdit.textContent = 'Nueva contraseña (opcional)';
    var session = getSession();
    var esAdmin = session && hasPermission(session, 'gestionarUsuarios');
    var hintAdmin = document.getElementById('hintPasswordAdmin');
    var passInput = document.getElementById('usuarioPassword');
    var toggleBtn = fieldPassword ? fieldPassword.querySelector('.btn-password-toggle') : null;
    var fieldPasswordConfirmRef = document.getElementById('fieldPasswordConfirm');
    var contrasenaBloqueada = typeof isUsuarioContrasenaProtegida === 'function' && isUsuarioContrasenaProtegida(u.username);
    if (contrasenaBloqueada) {
      if (fieldPassword) fieldPassword.style.display = 'none';
      if (fieldPasswordConfirmRef) fieldPasswordConfirmRef.style.display = 'none';
      var hintBloqueada = document.getElementById('hintPasswordBloqueada');
      if (hintBloqueada) { hintBloqueada.style.display = 'block'; hintBloqueada.textContent = 'La contraseña de este usuario no se puede modificar.'; }
    } else {
      if (fieldPassword) fieldPassword.style.display = '';
      if (fieldPasswordConfirmRef) fieldPasswordConfirmRef.style.display = 'none';
      var hintBloqueadaOff = document.getElementById('hintPasswordBloqueada');
      if (hintBloqueadaOff) hintBloqueadaOff.style.display = 'none';
      if (hintAdmin) hintAdmin.style.display = esAdmin ? 'block' : 'none';
      if (passInput) {
        passInput.type = 'text';
        passInput.placeholder = esAdmin ? 'Escribe la nueva contraseña (mín. 4 caracteres). Vacío = no cambiar' : 'Dejar vacío para no cambiar';
      }
      if (toggleBtn) toggleBtn.style.display = 'none';
    }
  } else {
    if (titulo) titulo.textContent = 'Nuevo usuario';
    if (subtitulo) subtitulo.textContent = 'Crear credenciales y permisos';
    var hintBloqueadaNew = document.getElementById('hintPasswordBloqueada');
    if (hintBloqueadaNew) hintBloqueadaNew.style.display = 'none';
    var fotoInicialesNew = document.getElementById('fichaEmpleadoFotoIniciales');
    var fotoImgNew = document.getElementById('fichaEmpleadoFotoImg');
    if (fotoInicialesNew) { fotoInicialesNew.style.display = ''; fotoInicialesNew.textContent = '+'; }
    if (fotoImgNew) { fotoImgNew.style.display = 'none'; fotoImgNew.src = ''; }
    form.reset();
    document.getElementById('usuarioId').value = '';
    document.getElementById('usuarioUsername').readOnly = false;
    document.getElementById('usuarioFechaAlta').value = new Date().toISOString().slice(0, 10);
    document.getElementById('usuarioPassword').required = true;
    document.getElementById('usuarioPassword').type = 'text';
    document.getElementById('usuarioPassword').placeholder = 'Mínimo 4 caracteres';
    var toggleBtnNew = fieldPassword ? fieldPassword.querySelector('.btn-password-toggle') : null;
    if (toggleBtnNew) toggleBtnNew.style.display = 'none';
    var fieldPasswordConfirm = document.getElementById('fieldPasswordConfirm');
    if (fieldPasswordConfirm) {
      fieldPasswordConfirm.style.display = 'block';
      var confirmInput = document.getElementById('usuarioPasswordConfirm');
      if (confirmInput) { confirmInput.value = ''; confirmInput.required = true; }
      var confirmErr = document.getElementById('usuarioPasswordConfirmError');
      if (confirmErr) { confirmErr.style.display = 'none'; confirmErr.textContent = ''; }
    }
    if (fieldPasswordActual) fieldPasswordActual.style.display = 'none';
    var labelNew = fieldPassword.querySelector('label');
    if (labelNew) labelNew.textContent = 'Contraseña';
    var hintAdminNew = document.getElementById('hintPasswordAdmin');
    if (hintAdminNew) hintAdminNew.style.display = (getSession() && hasPermission(getSession(), 'gestionarUsuarios')) ? 'block' : 'none';
    const fieldEquipoNew = document.getElementById('fieldEquipo');
    if (fieldEquipoNew) fieldEquipoNew.style.display = hasPermission(getSession(), 'gestionarUsuarios') ? '' : 'none';
    const usuarioEquipoNew = document.getElementById('usuarioEquipo');
    if (usuarioEquipoNew) usuarioEquipoNew.value = '';
  }

  permisosDiv.innerHTML = '';
  var defaultIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  Object.entries(PERMISOS).forEach(([key, label]) => {
    if (key === 'gestionarUsuarios' && document.getElementById('usuarioRol').value === 'admin') return;
    var uEdit = userId ? getUsers().find(function (x) { return x.id === userId; }) : null;
    var val = uEdit ? (uEdit.permisos && uEdit.permisos[key] !== undefined ? uEdit.permisos[key] : (uEdit.rol === 'admin')) : (key !== 'gestionarUsuarios' && key !== 'gestionarCompras');
    var iconSvg = (PERMISO_ICONS && PERMISO_ICONS[key]) || defaultIcon;
    var div = document.createElement('div');
    div.className = 'permiso-card' + (val ? ' permiso-activo' : '');
    div.setAttribute('data-permiso', key);
    div.innerHTML = '<div class="permiso-card-icon">' + iconSvg + '</div><label class="permiso-card-label"><input type="checkbox" id="perm_' + key + '" ' + (val ? 'checked' : '') + '> ' + escapeHtml(label) + '</label>';
    permisosDiv.appendChild(div);
    div.querySelector('input').addEventListener('change', function () { div.classList.toggle('permiso-activo', this.checked); });
  });

  if (userId && ['admin', 'responsableMecanicos'].includes((getUsers().find(function (x) { return x.id === userId; }) || {}).rol)) {
    var iconSvgAdmin = (PERMISO_ICONS && PERMISO_ICONS.gestionarUsuarios) || defaultIcon;
    var div = document.createElement('div');
    div.className = 'permiso-card permiso-activo';
    div.setAttribute('data-permiso', 'gestionarUsuarios');
    div.innerHTML = '<div class="permiso-card-icon">' + iconSvgAdmin + '</div><label class="permiso-card-label"><input type="checkbox" id="perm_gestionarUsuarios" checked disabled> ' + escapeHtml(PERMISOS.gestionarUsuarios) + '</label>';
    permisosDiv.appendChild(div);
  }

  fieldActivo.style.display = userId ? '' : 'none';

  var wrapEliminar = document.getElementById('wrapFichaEliminar');
  if (wrapEliminar) {
    var session = getSession();
    var puedeEliminar = session && typeof hasPermission === 'function' && hasPermission(session, 'gestionarUsuarios');
    wrapEliminar.style.display = (userId && puedeEliminar) ? 'block' : 'none';
  }

  var seccionMaterial = document.getElementById('usuarioSeccionMaterialEntregado');
  if (seccionMaterial) {
    if (userId) {
      var uEdit = getUsers().find(function (x) { return x.id === userId; });
      var session = getSession();
      var puedeVerEntregas = session && (hasPermission(session, 'gestionarUsuarios') || (uEdit && (uEdit.responsable || '').toString().trim() === (session.username || '').toString().trim()));
      seccionMaterial.style.display = puedeVerEntregas ? 'block' : 'none';
      if (puedeVerEntregas && typeof renderMaterialEntregadoEnFicha === 'function') renderMaterialEntregadoEnFicha(userId);
    } else {
      seccionMaterial.style.display = 'none';
    }
  }
  var seccionVehiculos = document.getElementById('usuarioSeccionVehiculos');
  if (seccionVehiculos) {
    if (userId) {
      var uEditV = getUsers().find(function (x) { return x.id === userId; });
      var vehiculos = (uEditV && Array.isArray(uEditV.vehiculos)) ? uEditV.vehiculos : [];
      seccionVehiculos.style.display = vehiculos.length > 0 ? 'block' : 'none';
      if (vehiculos.length > 0 && typeof renderFichaEmpleadoVehiculos === 'function') renderFichaEmpleadoVehiculos(userId);
    } else {
      seccionVehiculos.style.display = 'none';
    }
  }
  if (pantalla) {
    pantalla.dataset.userId = userId || '';
    if (userId) {
      renderFichaEmpleadoFotos(userId);
      aplicarFondoFichaEmpleado(userId);
    } else {
      var seccionFotos = document.getElementById('fichaSeccionFotos');
      if (seccionFotos) seccionFotos.style.display = 'none';
      aplicarFondoFichaEmpleado(null);
    }
    cerrarTodasPantallasSecundarias();
    ocultarAppBodyMostrarSecundaria('pantallaFichaEmpleado');
  }
}

function aplicarFondoFichaEmpleado(userId) {
  var wrap = document.getElementById('fichaEmpleadoFondoWrap');
  var imgEl = document.getElementById('fichaEmpleadoFondoImg');
  var pantalla = document.getElementById('pantallaFichaEmpleado');
  if (!wrap || !imgEl || !pantalla) return;
  if (!userId) {
    wrap.style.display = 'none';
    imgEl.style.backgroundImage = '';
    pantalla.classList.remove('ficha-empleado-con-fondo');
    return;
  }
  var users = getUsers();
  var u = users.find(function (x) { return x.id === userId; });
  if (!u || !Array.isArray(u.fotosFicha) || u.fotosFicha.length === 0) {
    wrap.style.display = 'none';
    imgEl.style.backgroundImage = '';
    pantalla.classList.remove('ficha-empleado-con-fondo');
    return;
  }
  var idx = u.fondoFichaIndex != null ? Math.max(0, Math.min(Number(u.fondoFichaIndex), u.fotosFicha.length - 1)) : 0;
  var url = u.fotosFicha[idx];
  if (!url || !(url.startsWith('data:') || url.startsWith('http'))) {
    wrap.style.display = 'none';
    imgEl.style.backgroundImage = '';
    pantalla.classList.remove('ficha-empleado-con-fondo');
    return;
  }
  imgEl.style.backgroundImage = 'url(' + url + ')';
  wrap.style.display = 'block';
  pantalla.classList.add('ficha-empleado-con-fondo');
}

function renderFichaEmpleadoFotos(userId) {
  var seccionFotos = document.getElementById('fichaSeccionFotos');
  var lista = document.getElementById('fichaEmpleadoFotosLista');
  if (!seccionFotos || !lista) return;
  seccionFotos.style.display = 'block';
  var users = getUsers();
  var u = users.find(function (x) { return x.id === userId; });
  var fotos = (u && Array.isArray(u.fotosFicha)) ? u.fotosFicha : [];
  if (fotos.length === 0) {
    lista.innerHTML = '<p class="ficha-fotos-empty">Aún no hay fotos. Pulsa «Añadir foto» para subir una.</p>';
    return;
  }
  var idxFondo = (u && u.fondoFichaIndex != null) ? Math.max(0, Math.min(Number(u.fondoFichaIndex), fotos.length - 1)) : 0;
  lista.innerHTML = fotos.map(function (url, i) {
    var esFondo = i === idxFondo;
    return '<div class="ficha-foto-item" data-index="' + i + '">' +
      '<div class="ficha-foto-thumb" data-url-index="' + i + '"></div>' +
      '<div class="ficha-foto-actions">' +
      '<button type="button" class="btn btn-outline btn-sm ficha-foto-btn-fondo' + (esFondo ? ' active' : '') + '" data-index="' + i + '" title="Usar como fondo de pantalla">' + (esFondo ? '✓ Fondo' : 'Usar como fondo') + '</button>' +
      '<button type="button" class="btn btn-outline btn-sm btn-danger ficha-foto-btn-quitar" data-index="' + i + '" title="Quitar foto">Quitar</button>' +
      '</div></div>';
  }).join('');
  lista.querySelectorAll('.ficha-foto-thumb').forEach(function (el) {
    var i = parseInt(el.getAttribute('data-url-index'), 10);
    if (fotos[i]) el.style.backgroundImage = 'url(' + fotos[i] + ')';
  });
  lista.querySelectorAll('.ficha-foto-btn-fondo').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = document.getElementById('usuarioId').value;
      if (!id) return;
      var idx = parseInt(this.getAttribute('data-index'), 10);
      var session = getSession();
      if (typeof updateUser !== 'function' || !session) return;
      updateUser(id, { fondoFichaIndex: idx }, session.username).then(function () {
        renderFichaEmpleadoFotos(id);
        aplicarFondoFichaEmpleado(id);
      }).catch(function () {});
    });
  });
  lista.querySelectorAll('.ficha-foto-btn-quitar').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = document.getElementById('usuarioId').value;
      if (!id) return;
      var idx = parseInt(this.getAttribute('data-index'), 10);
      var users = getUsers();
      var u = users.find(function (x) { return x.id === id; });
      if (!u || !Array.isArray(u.fotosFicha)) return;
      var fotos = u.fotosFicha.slice();
      fotos.splice(idx, 1);
      var newFondo = u.fondoFichaIndex != null ? Number(u.fondoFichaIndex) : 0;
      if (newFondo >= fotos.length) newFondo = fotos.length > 0 ? 0 : null;
      else if (idx < newFondo) newFondo = newFondo - 1;
      var session = getSession();
      if (typeof updateUser !== 'function' || !session) return;
      var payload = { fotosFicha: fotos, fondoFichaIndex: newFondo };
      if (u.fotoPerfil && fotos.indexOf(u.fotoPerfil) === -1) payload.fotoPerfil = fotos.length > 0 ? fotos[0] : null;
      updateUser(id, payload, session.username).then(function () {
        renderFichaEmpleadoFotos(id);
        aplicarFondoFichaEmpleado(id);
        if (typeof renderGaleriaFotosEmpleado === 'function') renderGaleriaFotosEmpleado(id);
      }).catch(function () {});
    });
  });
}

/** Abre el modal de galería de fotos del empleado (preview, miniatura, registro reparación, eliminar). */
function openGaleriaFotosEmpleado(userId) {
  var id = (userId || (document.getElementById('usuarioId') && document.getElementById('usuarioId').value) || '').toString().trim();
  if (!id) return;
  var modal = document.getElementById('modalGaleriaFotosEmpleado');
  var titulo = document.getElementById('modalGaleriaFotosEmpleadoTitulo');
  if (titulo) {
    var users = getUsers();
    var u = users.find(function (x) { return x.id === id; });
    titulo.textContent = u ? ('Galería de fotos · ' + (u.nombre || u.username || 'Empleado')) : 'Galería de fotos';
  }
  if (modal) {
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.dataset.galeriaUserId = id;
  }
  if (typeof renderGaleriaFotosEmpleado === 'function') renderGaleriaFotosEmpleado(id);
}

/** Rellena la rejilla del modal galería y enlaza acciones: foto principal, fondo, eliminar. */
function renderGaleriaFotosEmpleado(userId) {
  var grid = document.getElementById('galeriaFotosEmpleadoGrid');
  if (!grid) return;
  var users = getUsers();
  var u = users.find(function (x) { return x.id === userId; });
  var fotos = (u && Array.isArray(u.fotosFicha)) ? u.fotosFicha : [];
  var fotoPerfil = (u && u.fotoPerfil) ? u.fotoPerfil : '';
  var idxFondo = (u && u.fondoFichaIndex != null) ? Math.max(0, Math.min(Number(u.fondoFichaIndex), fotos.length - 1)) : 0;

  if (fotos.length === 0) {
    grid.innerHTML = '<p class="galeria-fotos-empleado-empty">Aún no hay fotos. Usa «Añadir foto» para subir imágenes.</p>';
    return;
  }

  grid.innerHTML = fotos.map(function (url, i) {
    var esPrincipal = (url === fotoPerfil) || (!fotoPerfil && i === 0);
    var esFondo = i === idxFondo;
    var safeUrl = (url || '').indexOf('"') === -1 ? url : (url || '').replace(/"/g, '%22');
    return '<div class="galeria-foto-card" data-index="' + i + '">' +
      '<div class="galeria-foto-card-thumb" style="background-image:url(' + safeUrl + ')"></div>' +
      '<div class="galeria-foto-card-actions">' +
      '<button type="button" class="btn btn-outline btn-sm galeria-foto-card-btn-principal' + (esPrincipal ? ' active' : '') + '" data-index="' + i + '" title="Previsualización, miniatura en ficha y registro de reparación">' + (esPrincipal ? '✓ Foto principal' : 'Foto principal') + '</button>' +
      '<button type="button" class="btn btn-outline btn-sm galeria-foto-card-btn-fondo' + (esFondo ? ' active' : '') + '" data-index="' + i + '" title="Fondo de pantalla de la ficha">' + (esFondo ? '✓ Fondo' : 'Fondo') + '</button>' +
      '<button type="button" class="btn btn-outline btn-sm btn-danger galeria-foto-card-btn-eliminar" data-index="' + i + '" title="Eliminar">Eliminar</button>' +
      '</div></div>';
  }).join('');

  grid.querySelectorAll('.galeria-foto-card-btn-principal').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = grid.closest('.modal') && grid.closest('.modal').dataset.galeriaUserId;
      if (!id) return;
      var idx = parseInt(this.getAttribute('data-index'), 10);
      var users = getUsers();
      var u = users.find(function (x) { return x.id === id; });
      var url = (u && Array.isArray(u.fotosFicha) && u.fotosFicha[idx]) ? u.fotosFicha[idx] : '';
      if (!url) return;
      var session = getSession();
      if (typeof updateUser !== 'function' || !session) return;
      updateUser(id, { fotoPerfil: url }, session.username).then(function () {
        if (typeof renderGaleriaFotosEmpleado === 'function') renderGaleriaFotosEmpleado(id);
        var fotoImg = document.getElementById('fichaEmpleadoFotoImg');
        var fotoIniciales = document.getElementById('fichaEmpleadoFotoIniciales');
        if (fotoImg && fotoIniciales) {
          fotoImg.src = url;
          fotoImg.style.display = 'block';
          fotoIniciales.style.display = 'none';
        }
        if (typeof renderListaUsuarios === 'function') renderListaUsuarios();
        if (typeof renderOrganigramaFichaPreview === 'function') renderOrganigramaFichaPreview(id);
      }).catch(function () {});
    });
  });

  grid.querySelectorAll('.galeria-foto-card-btn-fondo').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = grid.closest('.modal') && grid.closest('.modal').dataset.galeriaUserId;
      if (!id) return;
      var idx = parseInt(this.getAttribute('data-index'), 10);
      var session = getSession();
      if (typeof updateUser !== 'function' || !session) return;
      updateUser(id, { fondoFichaIndex: idx }, session.username).then(function () {
        if (typeof renderGaleriaFotosEmpleado === 'function') renderGaleriaFotosEmpleado(id);
        if (typeof aplicarFondoFichaEmpleado === 'function') aplicarFondoFichaEmpleado(id);
      }).catch(function () {});
    });
  });

  grid.querySelectorAll('.galeria-foto-card-btn-eliminar').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = grid.closest('.modal') && grid.closest('.modal').dataset.galeriaUserId;
      if (!id) return;
      var idx = parseInt(this.getAttribute('data-index'), 10);
      var users = getUsers();
      var u = users.find(function (x) { return x.id === id; });
      if (!u || !Array.isArray(u.fotosFicha)) return;
      var fotos = u.fotosFicha.slice();
      var urlEliminada = fotos[idx];
      fotos.splice(idx, 1);
      var newFondo = u.fondoFichaIndex != null ? Number(u.fondoFichaIndex) : 0;
      if (newFondo >= fotos.length) newFondo = fotos.length > 0 ? 0 : null;
      else if (idx < newFondo) newFondo = newFondo - 1;
      var newPrincipal = u.fotoPerfil;
      if (urlEliminada === u.fotoPerfil) newPrincipal = fotos.length > 0 ? fotos[0] : null;
      var session = getSession();
      if (typeof updateUser !== 'function' || !session) return;
      updateUser(id, { fotosFicha: fotos, fondoFichaIndex: newFondo, fotoPerfil: newPrincipal }, session.username).then(function () {
        if (typeof renderGaleriaFotosEmpleado === 'function') renderGaleriaFotosEmpleado(id);
        if (typeof renderFichaEmpleadoFotos === 'function') renderFichaEmpleadoFotos(id);
        if (typeof aplicarFondoFichaEmpleado === 'function') aplicarFondoFichaEmpleado(id);
        var fotoImg = document.getElementById('fichaEmpleadoFotoImg');
        var fotoIniciales = document.getElementById('fichaEmpleadoFotoIniciales');
        if (fotoImg && fotoIniciales) {
          if (newPrincipal) { fotoImg.src = newPrincipal; fotoImg.style.display = 'block'; fotoIniciales.style.display = 'none'; }
          else { fotoImg.src = ''; fotoImg.style.display = 'none'; fotoIniciales.style.display = ''; fotoIniciales.textContent = (u.nombre || u.username || '?').substring(0, 2).toUpperCase(); }
        }
        if (typeof renderListaUsuarios === 'function') renderListaUsuarios();
      }).catch(function () {});
    });
  });
}

function cerrarGaleriaFotosEmpleado() {
  var modal = document.getElementById('modalGaleriaFotosEmpleado');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}

/** Abre la galería de fotos de un vehículo (por matrícula). */
function openGaleriaFotosVehiculo(matricula, userId) {
  var mat = (matricula || '').toString().trim();
  if (!mat) return;
  var modal = document.getElementById('modalGaleriaFotosVehiculo');
  var titulo = document.getElementById('modalGaleriaFotosVehiculoTitulo');
  if (titulo) titulo.textContent = 'Galería de fotos · ' + mat;
  if (modal) {
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.dataset.galeriaMatricula = mat;
    modal.dataset.galeriaUserId = userId || '';
  }
  if (typeof renderGaleriaFotosVehiculo === 'function') renderGaleriaFotosVehiculo(mat);
}

/** Rellena la rejilla de la galería de fotos del vehículo: portada, eliminar. */
function renderGaleriaFotosVehiculo(matricula) {
  var grid = document.getElementById('galeriaFotosVehiculoGrid');
  if (!grid) return;
  var mat = (matricula || '').toString().trim();
  var fotos = typeof getFotosByMatricula === 'function' ? getFotosByMatricula(mat) : [];
  var modal = grid.closest('.modal');
  var currentMat = modal && modal.dataset.galeriaMatricula;

  if ((currentMat && currentMat !== mat) || !mat) return;
  if (fotos.length === 0) {
    grid.innerHTML = '<p class="galeria-fotos-empleado-empty">Aún no hay fotos. Usa «Añadir foto» para subir imágenes.</p>';
    return;
  }

  grid.innerHTML = fotos.map(function (url, i) {
    var esPortada = i === 0;
    var safeUrl = (url || '').indexOf('"') === -1 ? url : (url || '').replace(/"/g, '%22');
    return '<div class="galeria-foto-card" data-index="' + i + '">' +
      '<div class="galeria-foto-card-thumb" style="background-image:url(' + safeUrl + ')"></div>' +
      '<div class="galeria-foto-card-actions">' +
      '<button type="button" class="btn btn-outline btn-sm galeria-foto-card-btn-fondo' + (esPortada ? ' active' : '') + '" data-index="' + i + '" title="Usar como portada (preview)">' + (esPortada ? '✓ Portada' : 'Portada') + '</button>' +
      '<button type="button" class="btn btn-outline btn-sm btn-danger galeria-foto-card-btn-eliminar" data-index="' + i + '" title="Eliminar">Eliminar</button>' +
      '</div></div>';
  }).join('');

  grid.querySelectorAll('.galeria-foto-card-btn-fondo').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var m = modal && modal.dataset.galeriaMatricula;
      if (!m) return;
      var idx = parseInt(this.getAttribute('data-index'), 10);
      var fotosArr = typeof getFotosByMatricula === 'function' ? getFotosByMatricula(m) : [];
      if (idx < 0 || idx >= fotosArr.length) return;
      var url = fotosArr[idx];
      var nuevo = [url].concat(fotosArr.slice(0, idx), fotosArr.slice(idx + 1));
      if (typeof setFotosMatricula === 'function') setFotosMatricula(m, nuevo);
      if (typeof renderGaleriaFotosVehiculo === 'function') renderGaleriaFotosVehiculo(m);
      var uid = modal.dataset.galeriaUserId;
      if (uid && typeof renderFichaEmpleadoVehiculos === 'function') renderFichaEmpleadoVehiculos(uid);
    });
  });

  grid.querySelectorAll('.galeria-foto-card-btn-eliminar').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var m = modal && modal.dataset.galeriaMatricula;
      if (!m) return;
      var idx = parseInt(this.getAttribute('data-index'), 10);
      if (typeof removeFotoMatricula !== 'function') return;
      removeFotoMatricula(m, idx);
      if (typeof renderGaleriaFotosVehiculo === 'function') renderGaleriaFotosVehiculo(m);
      var uid = modal.dataset.galeriaUserId;
      if (uid && typeof renderFichaEmpleadoVehiculos === 'function') renderFichaEmpleadoVehiculos(uid);
    });
  });
}

function cerrarGaleriaFotosVehiculo() {
  var modal = document.getElementById('modalGaleriaFotosVehiculo');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}


function renderMaterialEntregadoEnFicha(userId) {
  var cont = document.getElementById('listaMaterialEntregadoFicha');
  if (!cont || !userId || typeof getEntregasMaterial !== 'function') return;
  var users = typeof getUsers === 'function' ? getUsers() : [];
  var u = users.find(function (x) { return x.id === userId; });
  if (!u) { cont.innerHTML = ''; return; }
  var list = getEntregasMaterial().filter(function (e) { return (e.trabajadorId || '').toString() === (u.id || '').toString() || (e.trabajadorId || '') === (u.username || ''); });
  if (list.length === 0) {
    cont.innerHTML = '<p class="usuario-material-entregado-empty">Ninguna entrega registrada.</p>';
    return;
  }
  cont.innerHTML = '<table class="economia-table usuario-material-table"><thead><tr><th>Fecha</th><th>Material</th><th>Cantidad</th><th>Unidad</th><th>Entregado por</th></tr></thead><tbody></tbody></table>';
  var tbody = cont.querySelector('tbody');
  list.forEach(function (e) {
    var tr = document.createElement('tr');
    var fecha = e.fecha ? new Date(e.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    tr.innerHTML = '<td>' + escapeHtml(fecha) + '</td><td>' + escapeHtml(e.materialLabel || e.materialConcepto || '—') + '</td><td>' + (e.cantidad || 0) + '</td><td>' + escapeHtml(e.unidad || 'ud') + '</td><td>' + escapeHtml(e.entregadoPorNombre || '—') + '</td>';
    tbody.appendChild(tr);
  });
}

function renderFichaEmpleadoVehiculos(userId) {
  var cont = document.getElementById('fichaEmpleadoVehiculosLista');
  if (!cont || !userId) return;
  var users = typeof getUsers === 'function' ? getUsers() : [];
  var u = users.find(function (x) { return x.id === userId; });
  var vehiculos = (u && Array.isArray(u.vehiculos)) ? u.vehiculos : [];
  if (vehiculos.length === 0) {
    cont.innerHTML = '<p class="ficha-vehiculos-empty">Este empleado no tiene vehículos asociados.</p>';
    return;
  }
  cont.setAttribute('data-user-id', userId);
  var servicios = typeof getRegistroServicios === 'function' ? getRegistroServicios() : [];
  var imgBase = typeof FIVEM_IMG_BASE !== 'undefined' ? FIVEM_IMG_BASE : 'https://docs.fivem.net/vehicles/';
  cont.innerHTML = vehiculos.map(function (v, idx) {
    var codigo = (v.codigoVehiculo || '').toString().trim() || 'primo';
    var imgUrl = imgBase + codigo + '.webp';
    var nombre = (v.nombreVehiculo || v.codigoVehiculo || '—').toString().trim();
    var matricula = (v.matricula || '—').toString().trim();
    var matNorm = matricula.toUpperCase();
    var fotos = typeof getFotosByMatricula === 'function' ? getFotosByMatricula(matricula) : [];
    var serviciosMat = servicios.filter(function (s) { return (s.matricula || '').trim().toUpperCase() === matNorm; });
    var serviciosOrdenados = serviciosMat.slice().sort(function (a, b) { return new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime(); });
    var previewUrl = Array.isArray(fotos) && fotos.length > 0 ? fotos[0] : '';
    var previewHtml = previewUrl
      ? '<div class="ficha-vehiculo-foto-preview" style="background-image:url(' + escapeHtml(previewUrl) + ')"></div>'
      : '<div class="ficha-vehiculo-foto-preview ficha-vehiculo-foto-placeholder">Sin foto</div>';
    var inputId = 'fichaVehiculoFoto_' + userId.replace(/\W/g, '_') + '_' + idx;
    var reparacionesHtml = serviciosOrdenados.length === 0
      ? '<p class="ficha-vehiculo-reparaciones-empty">Sin reparaciones</p>'
      : '<ul class="ficha-vehiculo-reparaciones-list">' + serviciosOrdenados.slice(0, 20).map(function (s) {
        var fecha = s.fecha ? new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
        var tipo = (s.tipo || 'Servicio').toString();
        var importe = s.importe != null ? s.importe.toLocaleString('es-ES') + ' €' : '—';
        return '<li>' + escapeHtml(tipo) + ' · ' + importe + ' · ' + escapeHtml(fecha) + '</li>';
      }).join('') + '</ul>';
    return '<article class="ficha-vehiculo-card" data-matricula="' + escapeHtml(matricula) + '">' +
      '<div class="ficha-vehiculo-img-wrap"><img src="' + escapeHtml(imgUrl) + '" alt="" class="ficha-vehiculo-img" onerror="this.style.background=\'var(--bg-elevated)\';this.onerror=null;this.src=\'\';"></div>' +
      '<div class="ficha-vehiculo-body">' +
      '<div class="ficha-vehiculo-top">' +
      '<span class="ficha-vehiculo-modelo">' + escapeHtml(nombre) + '</span>' +
      '<span class="ficha-vehiculo-matricula">' + escapeHtml(matricula) + '</span>' +
      '</div>' +
      '<div class="ficha-vehiculo-content">' +
      '<div class="ficha-vehiculo-fotos-block">' +
      '<strong class="ficha-vehiculo-block-title">Fotos del vehículo</strong>' +
      '<div class="ficha-vehiculo-foto-preview-wrap">' + previewHtml + '</div>' +
      '<div class="ficha-vehiculo-foto-botones">' +
      '<button type="button" class="btn btn-outline btn-sm ficha-vehiculo-btn-galeria" data-matricula="' + escapeHtmlAttr(matricula) + '" title="Abrir galería de fotos del vehículo">Galería</button>' +
      '<input type="file" accept="image/*" id="' + inputId + '" class="ficha-vehiculo-foto-input hidden" data-matricula="' + escapeHtml(matricula) + '">' +
      '<button type="button" class="btn btn-outline btn-sm ficha-vehiculo-foto-add-btn" data-input-id="' + escapeHtmlAttr(inputId) + '">+ Añadir foto</button>' +
      '</div>' +
      '</div>' +
      '<div class="ficha-vehiculo-reparaciones-block">' +
      '<strong class="ficha-vehiculo-block-title">Historial reparaciones</strong>' +
      '<div class="ficha-vehiculo-reparaciones-scroll">' + reparacionesHtml + '</div>' +
      '</div>' +
      '</div></div></article>';
  }).join('');

  cont.querySelectorAll('.ficha-vehiculo-foto-input').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      var mat = this.getAttribute('data-matricula');
      var uid = cont.getAttribute('data-user-id');
      reader.onload = function () {
        if (typeof addFotoMatricula === 'function') addFotoMatricula(mat, reader.result);
        if (uid && typeof renderFichaEmpleadoVehiculos === 'function') renderFichaEmpleadoVehiculos(uid);
        if (typeof renderGaleriaFotosVehiculo === 'function') renderGaleriaFotosVehiculo(mat);
      };
      reader.readAsDataURL(file);
      this.value = '';
    });
  });
  cont.querySelectorAll('.ficha-vehiculo-foto-add-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = this.getAttribute('data-input-id');
      var input = id ? document.getElementById(id) : null;
      if (input) { input.value = ''; input.click(); }
    });
  });
  cont.querySelectorAll('.ficha-vehiculo-btn-galeria').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mat = this.getAttribute('data-matricula');
      if (mat && typeof openGaleriaFotosVehiculo === 'function') openGaleriaFotosVehiculo(mat, cont.getAttribute('data-user-id'));
    });
  });
}

/** Abre el formulario de nuevo usuario con el responsable pre-rellenado (p. ej. desde organigrama "+") */
function abrirFormUsuarioNuevoConResponsable(responsableUsername) {
  abrirFormUsuario(null);
  if (responsableUsername && typeof responsableUsername === 'string') {
    const respEl = document.getElementById('usuarioResponsable');
    if (respEl) respEl.value = responsableUsername.trim();
  }
}

function mostrarPanelAdmin(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const panelUsuarios = document.getElementById('panelUsuarios');
  const panelUsuariosTabla = document.getElementById('panelUsuariosTabla');
  const panelConvenios = document.getElementById('panelConvenios');
  const panelEconomia = document.getElementById('panelEconomia');
  const economiaTabs = document.getElementById('economiaTabs');
  const stockTabs = document.getElementById('stockTabs');
  const panelSolicitudes = document.getElementById('panelSolicitudesGraficas');
  const panelReset = document.getElementById('panelReset');
  if (panelUsuarios) panelUsuarios.style.display = tab === 'usuarios' ? '' : 'none';
  if (panelUsuariosTabla) {
    panelUsuariosTabla.style.display = tab === 'usuarios-tabla' ? '' : 'none';
    if (tab === 'usuarios-tabla' && typeof renderTablaUsuarios === 'function') renderTablaUsuarios();
  }
  if (panelConvenios) panelConvenios.style.display = tab === 'convenios' ? '' : 'none';
  if (panelEconomia) {
    panelEconomia.style.display = (tab === 'economia' || tab === 'stock') ? '' : 'none';
    if (tab === 'economia') {
      if (economiaTabs) economiaTabs.style.display = '';
      if (stockTabs) stockTabs.style.display = 'none';
      mostrarSubpanelEconomia('resumen');
    } else if (tab === 'stock') {
      if (economiaTabs) economiaTabs.style.display = 'none';
      if (stockTabs) stockTabs.style.display = '';
      mostrarSubpanelStock('compras');
    }
  }
  if (panelSolicitudes) {
    panelSolicitudes.style.display = tab === 'solicitudes-graficas' ? '' : 'none';
    if (tab === 'solicitudes-graficas') renderSolicitudesGraficas();
  }
  if (panelReset) panelReset.style.display = tab === 'reset' ? '' : 'none';
  const panelIndicadores = document.getElementById('panelIndicadores');
  if (panelIndicadores) {
    panelIndicadores.style.display = tab === 'indicadores' ? '' : 'none';
    if (tab === 'indicadores' && typeof renderIndicadoresPanel === 'function') renderIndicadoresPanel();
  }
}

function renderTablaUsuarios() {
  const tbody = document.getElementById('listaUsuariosTabla');
  if (!tbody) return;
  const users = typeof getUsers === 'function' ? getUsers() : [];
  tbody.innerHTML = '';
  users.forEach(function (u) {
    const tr = document.createElement('tr');
    const username = (u.username || '').toString().trim() || '—';
    const nombre = (u.nombre || '').toString().trim() || '—';
    const rol = (u.rol || 'mecanico').toString();
    const puedeCambiarPassword = typeof isUsuarioContrasenaProtegida === 'function' ? !isUsuarioContrasenaProtegida(username) : true;
    const btnCambiarHtml = puedeCambiarPassword
      ? '<button type="button" class="btn btn-outline btn-sm btn-cambiar-password" data-user-id="' + escapeHtml(u.id) + '" data-username="' + escapeHtml(username) + '">Cambiar contraseña</button>'
      : '<span class="btn btn-outline btn-sm btn-disabled" title="No se puede cambiar la contraseña de este usuario">Cambiar contraseña</span>';
    tr.innerHTML = '<td>' + escapeHtml(username) + '</td><td>' + escapeHtml(nombre) + '</td><td>••••</td><td>' + escapeHtml(rol) + '</td><td>' + btnCambiarHtml + ' <button type="button" class="btn btn-outline btn-sm btn-editar-usuario-tabla" data-user-id="' + escapeHtml(u.id) + '">Editar</button></td>';
    var btnCambiar = tr.querySelector('.btn-cambiar-password');
    if (btnCambiar) btnCambiar.addEventListener('click', function () {
      var id = this.getAttribute('data-user-id');
      var uname = this.getAttribute('data-username');
      if (typeof abrirModalCambiarPassword === 'function') abrirModalCambiarPassword(id, uname);
    });
    tr.querySelector('.btn-editar-usuario-tabla').addEventListener('click', function () {
      var id = this.getAttribute('data-user-id');
      if (typeof abrirFormUsuario === 'function') abrirFormUsuario(id);
    });
    tbody.appendChild(tr);
  });
}

function abrirModalCambiarPassword(userId, username) {
  if (typeof isUsuarioContrasenaProtegida === 'function' && isUsuarioContrasenaProtegida(username)) {
    alert('No está permitido cambiar la contraseña de este usuario.');
    return;
  }
  var modal = document.getElementById('modalCambiarPassword');
  if (!modal) return;
  document.getElementById('cambiarPasswordUserId').value = userId || '';
  var userEl = document.getElementById('modalCambiarPasswordUsuario');
  if (userEl) userEl.textContent = 'Usuario: ' + (username || '—');
  document.getElementById('cambiarPasswordNueva').value = '';
  document.getElementById('cambiarPasswordConfirmar').value = '';
  var errEl = document.getElementById('modalCambiarPasswordError');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function cerrarModalCambiarPassword() {
  var modal = document.getElementById('modalCambiarPassword');
  if (modal) { modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); }
}

function buildConveniosFichas() {
  const grid = document.getElementById('conveniosFichasGrid');
  if (!grid) return;
  const convenios = getConvenios();
  grid.innerHTML = '';
  convenios.forEach(function (c) {
    const logoUrl = typeof getLogoUrlForConvenio === 'function' ? getLogoUrlForConvenio(c.nombre) : null;
    const fontName = typeof getFontForConvenio === 'function' ? getFontForConvenio(c.nombre) : null;
    const fontFamily = fontName
      ? (fontName.indexOf(' ') >= 0 ? "'" + fontName.replace(/'/g, "\\'") + "', " : fontName + ", ") + "sans-serif"
      : '';
    const fechaStr = c.fechaAcuerdo ? new Date(c.fechaAcuerdo).toLocaleDateString('es-ES') : '—';
    const inicial = escapeHtml((c.nombre || 'N/A').charAt(0));
    const card = document.createElement('div');
    card.className = 'convenio-ficha';
    card.setAttribute('data-convenio-id', c.id);
    card.innerHTML =
      '<div class="convenio-ficha-inner">' +
      '<div class="convenio-ficha-logo-wrap">' +
      (logoUrl
        ? '<img class="convenio-ficha-logo" src="' + escapeHtmlAttr(logoUrl) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';var s=this.nextElementSibling;if(s)s.style.display=\'flex\'">' +
          '<span class="convenio-ficha-logo-placeholder" style="display:none">' + inicial + '</span>'
        : '<span class="convenio-ficha-logo-placeholder">' + inicial + '</span>') +
      '</div>' +
      '<div class="convenio-ficha-overlay">' +
      '<h5 class="convenio-ficha-nombre">' + escapeHtml(c.nombre) + '</h5>' +
      '<p class="convenio-ficha-descuento">Descuento: <strong>' + (c.descuento || 0) + '%</strong></p>' +
      (c.privado ? '<p class="convenio-ficha-privado">Privado</p>' : '') +
      '<p class="convenio-ficha-fecha">Fecha acordado: ' + escapeHtml(fechaStr) + '</p>' +
      (c.acordadoPorTaller ? '<p class="convenio-ficha-acordado">Taller: ' + escapeHtml(c.acordadoPorTaller) + '</p>' : '') +
      (c.acordadoPorEmpresa ? '<p class="convenio-ficha-acordado">Empresa: ' + escapeHtml(c.acordadoPorEmpresa) + '</p>' : '') +
      (function () { var url = ''; var label = 'Ver acuerdo'; var base = (typeof window !== 'undefined' && window.CONVENIOS_ACUERDOS_BASE) || 'input/CONTENT/Logos/convenios/acuerdos/'; if (c.acuerdoArchivoDataUrl) { url = c.acuerdoArchivoDataUrl; label = c.acuerdoArchivoNombre ? 'Ver acuerdo (' + c.acuerdoArchivoNombre + ')' : 'Ver acuerdo'; } else if (c.acuerdoArchivo) { url = base + encodeURIComponent(c.acuerdoArchivo); } if (url) return '<p class="convenio-ficha-acuerdo">Acuerdo: <a href="' + escapeHtmlAttr(url) + '" target="_blank" rel="noopener" class="convenio-ficha-acuerdo-link" onclick="event.stopPropagation();event.preventDefault();window.open(this.href)">' + escapeHtml(label) + '</a></p>'; return '<p class="convenio-ficha-acuerdo">Acuerdo: —</p>'; })() +
      '</div></div>';
    if (fontFamily) {
      var overlay = card.querySelector('.convenio-ficha-overlay');
      if (overlay) overlay.style.fontFamily = fontFamily;
    }
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('title', 'Clic para editar convenio');
    card.addEventListener('click', function () { abrirFormConvenio(c.id); });
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirFormConvenio(c.id); } });
    grid.appendChild(card);
  });
}

function renderListaConvenios() {
  var grid = document.getElementById('conveniosFichasGrid');
  if (grid) {
    if (typeof cargarListadoLogosConvenios === 'function') {
      cargarListadoLogosConvenios(function () {
        buildConveniosFichas();
      });
    } else {
      buildConveniosFichas();
    }
  }
  if (typeof renderConveniosEmpleadosYPlacas === 'function') renderConveniosEmpleadosYPlacas();
}

function renderConveniosEmpleadosYPlacas() {
  if (typeof getConveniosEmpleados !== 'function' || typeof getConveniosPlacas !== 'function') return;
  var tbodyEmp = document.getElementById('listaConveniosEmpleados');
  var tbodyPlacas1 = document.getElementById('listaConveniosPlacas1');
  var tbodyPlacas2 = document.getElementById('listaConveniosPlacas2');
  if (tbodyEmp) {
    var empleados = getConveniosEmpleados();
    tbodyEmp.innerHTML = empleados.map(function (e) {
      return '<tr><td>' + escapeHtml(e.empleado || '—') + '</td><td>' + escapeHtml(e.empresa || '—') + '</td></tr>';
    }).join('');
  }
  if (tbodyPlacas1 && tbodyPlacas2) {
    var placas = getConveniosPlacas();
    var placas8 = placas.filter(function (p) {
      var n = parseInt((p.placa || '').trim(), 10);
      return n >= 801 && n <= 899;
    });
    var placas7 = placas.filter(function (p) {
      var n = parseInt((p.placa || '').trim(), 10);
      return n >= 701 && n <= 717;
    });
    tbodyPlacas1.innerHTML = placas8.map(function (p) {
      return '<tr><td>' + escapeHtml(p.placa || '—') + '</td><td>' + escapeHtml(p.empleado || '—') + '</td></tr>';
    }).join('');
    tbodyPlacas2.innerHTML = placas7.map(function (p) {
      return '<tr><td>' + escapeHtml(p.placa || '—') + '</td><td>' + escapeHtml(p.empleado || '—') + '</td></tr>';
    }).join('');
  }
}

function escapeHtml(s) {
  if (s == null) return '—';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

var _convenioPendingAcuerdoDataUrl = null;
var _convenioPendingAcuerdoNombre = null;
var _convenioAcuerdoQuitado = false;

function syncConvenioDescuentoButtons() {
  var input = document.getElementById('convenioDescuento');
  var val = input ? parseInt(input.value, 10) : 5;
  if (isNaN(val) || [0, 5, 10, 15, 20].indexOf(val) === -1) val = 5;
  if (input) input.value = val;
  document.querySelectorAll('.convenio-descuento-btn').forEach(function (btn) {
    var n = parseInt(btn.getAttribute('data-descuento'), 10);
    btn.classList.toggle('active', n === val);
    btn.setAttribute('aria-pressed', n === val ? 'true' : 'false');
  });
}

function abrirFormConvenio(convenioId) {
  const modal = document.getElementById('modalConvenio');
  const titulo = document.getElementById('modalConvenioTitulo');
  const form = document.getElementById('formConvenio');
  const fileInput = document.getElementById('convenioAcuerdoArchivoFile');
  const nombreInput = document.getElementById('convenioAcuerdoArchivoNombre');
  const actualEl = document.getElementById('convenioAcuerdoActual');
  const quitarBtn = document.getElementById('convenioAcuerdoQuitar');
  _convenioPendingAcuerdoDataUrl = null;
  _convenioPendingAcuerdoNombre = null;
  _convenioAcuerdoQuitado = false;
  if (fileInput) fileInput.value = '';
  if (nombreInput) nombreInput.value = '';
  if (actualEl) { actualEl.style.display = 'none'; actualEl.textContent = ''; }
  if (quitarBtn) quitarBtn.style.display = 'none';
  var descuentosPermitidos = [0, 5, 10, 15, 20];
  function normalizarDescuento(val) {
    var n = parseInt(val, 10);
    if (isNaN(n) || n < 0) n = 5;
    if (descuentosPermitidos.indexOf(n) !== -1) return n;
    if (n <= 2) return 0;
    if (n <= 7) return 5;
    if (n <= 12) return 10;
    if (n <= 17) return 15;
    return 20;
  }
  if (convenioId) {
    const convenios = getConvenios();
    const c = convenios.find(x => x.id === convenioId);
    if (!c) return;
    titulo.textContent = 'Editar convenio';
    document.getElementById('convenioId').value = c.id;
    document.getElementById('convenioNombre').value = c.nombre || '';
    document.getElementById('convenioDescuento').value = normalizarDescuento(c.descuento);
    document.getElementById('convenioFechaAcuerdo').value = c.fechaAcuerdo ? c.fechaAcuerdo.slice(0, 10) : '';
    document.getElementById('convenioAcordadoTaller').value = c.acordadoPorTaller || '';
    document.getElementById('convenioAcordadoEmpresa').value = c.acordadoPorEmpresa || '';
    const privEl = document.getElementById('convenioPrivado');
    if (privEl) privEl.checked = !!c.privado;
    if (c.acuerdoArchivoDataUrl) {
      if (actualEl) { actualEl.textContent = 'Documento actual: ' + (c.acuerdoArchivoNombre || 'acuerdo'); actualEl.style.display = 'block'; }
      if (quitarBtn) quitarBtn.style.display = 'inline-block';
      if (nombreInput) nombreInput.placeholder = 'Dejar vacío para mantener el actual';
    } else if (c.acuerdoArchivo) {
      if (nombreInput) nombreInput.value = c.acuerdoArchivo;
    }
  } else {
    titulo.textContent = 'Nuevo convenio';
    form.reset();
    document.getElementById('convenioId').value = '';
    document.getElementById('convenioDescuento').value = 5;
    document.getElementById('convenioFechaAcuerdo').value = new Date().toISOString().slice(0, 10);
    const privEl = document.getElementById('convenioPrivado');
    if (privEl) privEl.checked = false;
  }
  if (typeof syncConvenioDescuentoButtons === 'function') syncConvenioDescuentoButtons();
  modal.classList.add('active');
}

function guardarConvenio(e) {
  e.preventDefault();
  const id = document.getElementById('convenioId').value;
  const convenios = getConvenios();
  const nombre = document.getElementById('convenioNombre').value.trim();
  const descuento = parseInt(document.getElementById('convenioDescuento').value, 10) || 0;
  const fechaAcuerdo = document.getElementById('convenioFechaAcuerdo').value || null;
  const acordadoPorTaller = document.getElementById('convenioAcordadoTaller').value.trim();
  const acordadoPorEmpresa = document.getElementById('convenioAcordadoEmpresa').value.trim();
  const privado = document.getElementById('convenioPrivado') ? document.getElementById('convenioPrivado').checked : false;
  const acuerdoNombreRepo = (document.getElementById('convenioAcuerdoArchivoNombre') && document.getElementById('convenioAcuerdoArchivoNombre').value.trim()) || '';
  var acuerdoDataUrl = _convenioPendingAcuerdoDataUrl;
  var acuerdoNombre = _convenioPendingAcuerdoNombre;
  if (_convenioAcuerdoQuitado) { acuerdoDataUrl = null; acuerdoNombre = null; }

  if (id) {
    const idx = convenios.findIndex(c => c.id === id);
    if (idx === -1) return;
    convenios[idx].nombre = nombre;
    convenios[idx].descuento = descuento;
    convenios[idx].fechaAcuerdo = fechaAcuerdo;
    convenios[idx].acordadoPorTaller = acordadoPorTaller;
    convenios[idx].acordadoPorEmpresa = acordadoPorEmpresa;
    convenios[idx].privado = privado;
    if (_convenioAcuerdoQuitado) {
      convenios[idx].acuerdoArchivoDataUrl = undefined;
      convenios[idx].acuerdoArchivoNombre = undefined;
      convenios[idx].acuerdoArchivo = undefined;
    } else if (acuerdoDataUrl) {
      convenios[idx].acuerdoArchivoDataUrl = acuerdoDataUrl;
      convenios[idx].acuerdoArchivoNombre = acuerdoNombre || null;
      convenios[idx].acuerdoArchivo = undefined;
    } else if (acuerdoNombreRepo) {
      convenios[idx].acuerdoArchivo = acuerdoNombreRepo;
      convenios[idx].acuerdoArchivoDataUrl = undefined;
      convenios[idx].acuerdoArchivoNombre = undefined;
    }
  } else {
    if (convenios.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      alert('Ya existe un convenio con esa empresa.');
      return;
    }
    var nuevo = {
      id: generateConvenioId(),
      nombre,
      descuento,
      fechaAcuerdo,
      acordadoPorTaller,
      acordadoPorEmpresa,
      privado,
    };
    if (acuerdoDataUrl) { nuevo.acuerdoArchivoDataUrl = acuerdoDataUrl; nuevo.acuerdoArchivoNombre = acuerdoNombre || null; }
    else if (acuerdoNombreRepo) nuevo.acuerdoArchivo = acuerdoNombreRepo;
    convenios.push(nuevo);
  }
  _convenioPendingAcuerdoDataUrl = null;
  _convenioPendingAcuerdoNombre = null;
  _convenioAcuerdoQuitado = false;
  saveConvenios(convenios);
  document.getElementById('modalConvenio').classList.remove('active');
  renderListaConvenios();
  cargarConvenios();
}

// ========== FICHA TRABAJADOR (no admin) ==========
function getHorasHoy(userId) {
  const list = typeof getFichajesByUser === 'function' ? getFichajesByUser(userId) : [];
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);
  const hoyFin = new Date(hoyInicio.getTime() + 24 * 60 * 60 * 1000 - 1);
  let totalMs = 0;
  list.forEach(f => {
    if (!f.salida || !f.entrada) return;
    const e = new Date(f.entrada).getTime();
    const s = new Date(f.salida).getTime();
    const start = Math.max(e, hoyInicio.getTime());
    const end = Math.min(s, hoyFin.getTime());
    if (end > start) totalMs += end - start;
  });
  return totalMs / (1000 * 60 * 60);
}

function getHorasMes(userId) {
  const now = new Date();
  const mesInicio = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const mesFin = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const list = typeof getFichajesByUser === 'function' ? getFichajesByUser(userId) : [];
  let totalMs = 0;
  list.forEach(f => {
    if (!f.salida || !f.entrada) return;
    const e = new Date(f.entrada).getTime();
    const s = new Date(f.salida).getTime();
    const start = Math.max(e, mesInicio.getTime());
    const end = Math.min(s, mesFin.getTime());
    if (end > start) totalMs += end - start;
  });
  return totalMs / (1000 * 60 * 60);
}

function getHorasTotal(userId) {
  const list = typeof getFichajesByUser === 'function' ? getFichajesByUser(userId) : [];
  let totalMs = 0;
  list.forEach(f => {
    if (!f.salida || !f.entrada) return;
    totalMs += new Date(f.salida).getTime() - new Date(f.entrada).getTime();
  });
  return totalMs / (1000 * 60 * 60);
}

/** True solo para el usuario administrador principal: en su ficha se muestran los totales del taller, no los suyos propios */
function esUsuarioAdminParaTotales(user) {
  if (!user) return false;
  var username = (user.username || '').toString().toLowerCase();
  var rol = (user.rol || '').toString().toLowerCase();
  return rol === 'admin' && username === 'admin';
}

/** Totales globales del taller (para mostrar en la ficha del administrador) */
function getTotalesTaller() {
  const users = typeof getUsers === 'function' ? getUsers() : [];
  let horasHoy = 0, horasSemana = 0, horasMes = 0, horasTotal = 0;
  users.forEach(u => {
    const uid = u.username || u.id;
    if (typeof getHorasHoy === 'function') horasHoy += getHorasHoy(uid) || 0;
    if (typeof getHorasSemana === 'function') horasSemana += getHorasSemana(uid, new Date()) || 0;
    if (typeof getHorasMes === 'function') horasMes += getHorasMes(uid) || 0;
    if (typeof getHorasTotal === 'function') horasTotal += getHorasTotal(uid) || 0;
  });
  const servicios = getRegistroServicios();
  const totalCobrado = servicios.reduce((sum, s) => sum + (s.importe || 0), 0);
  return { horasHoy, horasSemana, horasMes, horasTotal, totalCobrado };
}

/** Rellena el panel de previsualización de ficha en el organigrama (empleado seleccionado) */
window.renderOrganigramaFichaPreview = function(userId) {
  const panel = document.getElementById('organigramaFichaPreview');
  const placeholder = document.getElementById('organigramaFichaPreviewPlaceholder');
  const content = document.getElementById('organigramaFichaPreviewContent');
  if (!panel || !content) return;
  if (panel.dataset) panel.dataset.userId = userId || '';
  const users = typeof getUsers === 'function' ? getUsers() : [];
  const user = users.find(u => u.id === userId || (u.username && u.username === userId));
  if (!user) {
    if (placeholder) { placeholder.style.display = ''; placeholder.textContent = 'Empleado no encontrado.'; }
    content.style.display = 'none';
    return;
  }
  const responsable = (user.responsable && users.find(u => u.username === user.responsable))
    ? (users.find(u => u.username === user.responsable).nombre || user.responsable) : (user.responsable || '—');
  const uid = user.username || user.id;
  let horasSemana, totalCobrado;
  if (esUsuarioAdminParaTotales(user) && typeof getTotalesTaller === 'function') {
    const totales = getTotalesTaller();
    horasSemana = totales.horasSemana;
    totalCobrado = totales.totalCobrado;
  } else {
    horasSemana = typeof getHorasSemana === 'function' ? getHorasSemana(uid, new Date()) : 0;
    const servicios = getRegistroServicios();
    totalCobrado = servicios.filter(s => (s.userId || s.empleado) === uid).reduce((sum, s) => sum + (s.importe || 0), 0);
  }

  const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text || '—'; };
  setEl('orgPreviewNombre', user.nombre || user.username);
  setEl('orgPreviewRol', user.puesto || user.rol || '—');
  setEl('orgPreviewResponsable', responsable);
  setEl('orgPreviewPuesto', user.puesto || '—');
  setEl('orgPreviewFechaAlta', user.fechaAlta ? new Date(user.fechaAlta).toLocaleDateString('es-ES') : (user.fechaCreacion ? new Date(user.fechaCreacion).toLocaleDateString('es-ES') : '—'));
  setEl('orgPreviewHorasSemana', (horasSemana || 0).toFixed(1) + ' h');
  setEl('orgPreviewTotalCobrado', totalCobrado.toLocaleString('es-ES') + ' €');

  const img = document.getElementById('orgPreviewFotoImg');
  const placeholderFoto = document.getElementById('orgPreviewFotoPlaceholder');
  if (user.fotoPerfil && (user.fotoPerfil.startsWith('http') || user.fotoPerfil.startsWith('data:'))) {
    if (img) { img.src = user.fotoPerfil; img.style.display = 'block'; img.alt = user.nombre || ''; }
    if (placeholderFoto) placeholderFoto.style.display = 'none';
  } else {
    if (img) { img.src = ''; img.style.display = 'none'; }
    if (placeholderFoto) {
      placeholderFoto.style.display = '';
      placeholderFoto.textContent = (user.nombre || user.username || '?').substring(0, 2).toUpperCase();
    }
  }
  if (placeholder) placeholder.style.display = 'none';
  content.style.display = 'block';
  var btnEditar = document.getElementById('orgPreviewBtnEditar');
  if (btnEditar) btnEditar.style.display = (typeof getSession === 'function' && getSession() && typeof hasPermission === 'function' && hasPermission(getSession(), 'gestionarUsuarios')) ? '' : 'none';
};

function vincularFichaTrabajador() {
  const btn = document.getElementById('btnFichaTrabajador');
  const pantalla = document.getElementById('pantallaFichaTrabajador');
  const btnHome = document.getElementById('btnFichaTrabajadorHome');
  if (!btn || !pantalla) return;

  function renderFicha() {
    const session = getSession();
    if (!session) return;
    const users = getUsers();
    const user = users.find(u => u.id === session.id || u.username === session.username) || session;
    const responsable = (user.responsable && users.find(u => u.username === user.responsable)) ? users.find(u => u.username === user.responsable).nombre || user.responsable : (user.responsable || '—');
    document.getElementById('fichaNombre').textContent = user.nombre || user.username;
    document.getElementById('fichaFechaAlta').textContent = user.fechaAlta ? new Date(user.fechaAlta).toLocaleDateString('es-ES') : (user.fechaCreacion ? new Date(user.fechaCreacion).toLocaleDateString('es-ES') : '—');
    document.getElementById('fichaResponsable').textContent = responsable;
    document.getElementById('fichaPuesto').textContent = user.puesto || '—';
    document.getElementById('fichaSalario').textContent = user.salario != null ? user.salario + ' €' : '—';
    const uid = session.username;
    let horasHoyVal, horasSemanaVal, horasMesVal, horasTotalVal, totalCobradoVal;
    if (esUsuarioAdminParaTotales(user) && typeof getTotalesTaller === 'function') {
      const totales = getTotalesTaller();
      horasHoyVal = totales.horasHoy;
      horasSemanaVal = totales.horasSemana;
      horasMesVal = totales.horasMes;
      horasTotalVal = totales.horasTotal;
      totalCobradoVal = totales.totalCobrado;
    } else {
      horasHoyVal = getHorasHoy(uid) || 0;
      horasSemanaVal = typeof getHorasSemana === 'function' ? getHorasSemana(uid, new Date()) : 0;
      horasMesVal = getHorasMes(uid) || 0;
      horasTotalVal = getHorasTotal(uid) || 0;
      const servicios = getRegistroServicios();
      totalCobradoVal = servicios.filter(s => (s.userId || s.empleado) === uid).reduce((sum, s) => sum + (s.importe || 0), 0);
    }
    document.getElementById('fichaHorasHoy').textContent = (horasHoyVal || 0).toFixed(1) + ' h';
    document.getElementById('fichaHorasSemana').textContent = (horasSemanaVal || 0).toFixed(1) + ' h';
    document.getElementById('fichaHorasMes').textContent = (horasMesVal || 0).toFixed(1) + ' h';
    document.getElementById('fichaHorasTotal').textContent = (horasTotalVal || 0).toFixed(1) + ' h';
    document.getElementById('fichaTotalCobrado').textContent = (totalCobradoVal || 0).toLocaleString('es-ES') + ' €';
    const img = document.getElementById('fichaFotoImg');
    const placeholder = document.getElementById('fichaFotoPlaceholder');
    if (user.fotoPerfil) {
      img.src = user.fotoPerfil;
      img.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    } else {
      img.src = '';
      img.style.display = 'none';
      if (placeholder) placeholder.style.display = '';
    }
    var contMat = document.getElementById('fichaTrabajadorMaterialEntregado');
    if (contMat && typeof getEntregasMaterial === 'function') {
      var entregas = getEntregasMaterial().filter(function (e) { return (e.trabajadorId || '').toString() === (user.id || '').toString() || (e.trabajadorId || '') === (user.username || ''); });
      if (entregas.length === 0) contMat.innerHTML = '<p class="ficha-material-empty">Ninguna entrega registrada.</p>';
      else contMat.innerHTML = '<table class="economia-table ficha-material-table"><thead><tr><th>Fecha</th><th>Material</th><th>Cantidad</th><th>Unidad</th><th>Entregado por</th></tr></thead><tbody>' + entregas.map(function (e) {
        var fecha = e.fecha ? new Date(e.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
        return '<tr><td>' + escapeHtml(fecha) + '</td><td>' + escapeHtml(e.materialLabel || e.materialConcepto || '—') + '</td><td>' + (e.cantidad || 0) + '</td><td>' + escapeHtml(e.unidad || 'ud') + '</td><td>' + escapeHtml(e.entregadoPorNombre || '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
  }

  btn.addEventListener('click', function() {
    cerrarTodasPantallasSecundarias();
    renderFicha();
    ocultarAppBodyMostrarSecundaria('pantallaFichaTrabajador');
  });
  if (btnHome) btnHome.addEventListener('click', () => cerrarTodasPantallasSecundarias());

  const fotoInput = document.getElementById('fichaFotoInput');
  const btnFichaSubirFoto = document.getElementById('btnFichaSubirFoto');
  if (btnFichaSubirFoto) btnFichaSubirFoto.addEventListener('click', () => fotoInput && fotoInput.click());
  if (fotoInput) {
    fotoInput.addEventListener('change', function() {
      const file = this.files && this.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = function() {
        const session = getSession();
        if (!session) return;
        const dataUrl = reader.result;
        if (typeof updateUser === 'function') {
          updateUser(session.id, { fotoPerfil: dataUrl }, session.username).then(() => {
            renderFicha();
          }).catch(() => {});
        }
      };
      reader.readAsDataURL(file);
      this.value = '';
    });
  }
}

// ========== MI HISTORIAL (reparaciones/tuneos del usuario, con filtros) ==========
function getServiciosDelUsuario(userId) {
  const list = getRegistroServicios();
  return list.filter(s => (s.userId || s.empleado) === userId);
}

function vincularMiHistorial() {
  const btn = document.getElementById('btnMiHistorial');
  const modal = document.getElementById('modalMiHistorial');
  const lista = document.getElementById('listaMiHistorial');
  const buscar = document.getElementById('miHistorialBuscar');
  const tipo = document.getElementById('miHistorialTipo');
  const desde = document.getElementById('miHistorialDesde');
  const hasta = document.getElementById('miHistorialHasta');
  if (!btn || !modal || !lista) return;

  function renderLista() {
    const session = getSession();
    const uid = session ? session.username : null;
    let items = uid ? getServiciosDelUsuario(uid) : [];
    const q = (buscar && buscar.value || '').trim().toLowerCase();
    if (q) items = items.filter(s => (s.matricula || '').toLowerCase().includes(q) || (s.modelo || '').toLowerCase().includes(q) || (s.convenio || '').toLowerCase().includes(q));
    if (tipo && tipo.value) items = items.filter(s => s.tipo === tipo.value);
    if (desde && desde.value) items = items.filter(s => new Date(s.fecha) >= new Date(desde.value));
    if (hasta && hasta.value) items = items.filter(s => new Date(s.fecha).toDateString() <= new Date(hasta.value).toDateString());
    items = items.slice(0, 500);
    lista.innerHTML = items.length === 0 ? '<p class="no-servicios">No hay registros con los filtros indicados.</p>' : items.map(s => '<div class="servicio-item"><strong>' + escapeHtml(s.tipo) + '</strong> — ' + escapeHtml(s.matricula) + ' (' + escapeHtml(s.modelo) + ') — ' + (s.importe != null ? s.importe.toLocaleString('es-ES') + ' €' : '—') + '<br><small>' + escapeHtml(s.empleado || s.userId || '') + ' · ' + escapeHtml(s.convenio || '') + ' · ' + new Date(s.fecha).toLocaleString('es-ES') + '</small></div>').join('');
  }

  btn.addEventListener('click', function() {
    if (buscar) buscar.value = '';
    if (tipo) tipo.value = '';
    if (desde) desde.value = '';
    if (hasta) hasta.value = '';
    renderLista();
    modal.classList.add('active');
  });
  var modalMiHistorialClose = document.getElementById('modalMiHistorialClose');
  if (modalMiHistorialClose) modalMiHistorialClose.addEventListener('click', () => modal.classList.remove('active'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
  var debouncedLista = debounce(renderLista, 180);
  [buscar, tipo, desde, hasta].forEach(function (el) {
    if (el) { el.addEventListener('input', debouncedLista); el.addEventListener('change', renderLista); }
  });
}

// Contenido en bucle: vídeos aprobados por admin + archivos de input/CONTENT/Tapes
const CONTENT_LOOP_BASE = 'input/CONTENT/Tapes/';
function initContentLoop() {
  const wrap = document.getElementById('contentLoopWrap');
  const videoEl = document.getElementById('contentLoopVideo');
  if (!wrap || !videoEl) return;
  const fallback = document.getElementById('contentLoopFallback');
  const playOverlay = document.getElementById('contentLoopPlayOverlay');
  function showFallback(msg) {
    if (videoEl) videoEl.style.display = 'none';
    if (fallback) {
      fallback.style.display = 'flex';
      if (msg) {
        var txt = fallback.querySelector('.content-loop-fallback-text');
        if (txt) txt.textContent = msg;
      }
    }
    if (playOverlay) playOverlay.style.display = 'none';
  }
  function hideFallbackAndOverlay() {
    if (fallback) fallback.style.display = 'none';
    if (playOverlay) playOverlay.style.display = 'none';
  }
  var loadTimeoutId = null;
  function clearLoadTimeout() {
    if (loadTimeoutId) { clearTimeout(loadTimeoutId); loadTimeoutId = null; }
  }
  if (!videoEl.dataset.contentLoopListeners) {
    videoEl.dataset.contentLoopListeners = '1';
    videoEl.addEventListener('error', function () {
      clearLoadTimeout();
      showFallback();
    });
    videoEl.addEventListener('loadeddata', function () {
      clearLoadTimeout();
      hideFallbackAndOverlay();
    });
  }
  const sources = getContentLoopSources();
  if (sources.length === 0) {
    showFallback();
    return;
  }
  function showPlayOverlay() {
    if (fallback) fallback.style.display = 'none';
    if (videoEl) videoEl.style.display = '';
    if (playOverlay) playOverlay.style.display = 'flex';
  }
  function tryPlay() {
    if (!videoEl) return;
    hideFallbackAndOverlay();
    videoEl.play().then(function () {
      if (playOverlay) playOverlay.style.display = 'none';
    }).catch(function () { showPlayOverlay(); });
  }
  if (playOverlay) playOverlay.onclick = function () { tryPlay(); };
  // Mostrar overlay mientras carga para que ningún usuario vea pantalla negra (p. ej. Safari)
  function showOverlayUntilReady() {
    if (fallback) fallback.style.display = 'none';
    if (videoEl) videoEl.style.display = '';
    if (playOverlay) {
      playOverlay.style.display = 'flex';
      var txt = playOverlay.querySelector('.content-loop-play-overlay-text');
      if (txt) txt.textContent = 'Reproducir';
    }
  }
  var LOAD_TIMEOUT_MS = 10000;
  function setLoadTimeout() {
    clearLoadTimeout();
    loadTimeoutId = setTimeout(function () {
      loadTimeoutId = null;
      if (videoEl && videoEl.readyState < 2) {
        showPlayOverlay();
        var txt = playOverlay && playOverlay.querySelector('.content-loop-play-overlay-text');
        if (txt) txt.textContent = 'Clic para reproducir (el vídeo tardó en cargar)';
      }
    }, LOAD_TIMEOUT_MS);
  }
  if (sources.length === 1) {
    var item = sources[0];
    var src = item.type === 'url' ? item.src : CONTENT_LOOP_BASE + (item.path || 'video.mp4');
    var firstSource = videoEl.querySelector('source');
    if (firstSource) firstSource.setAttribute('src', src); else { videoEl.innerHTML = '<source src="' + src + '" type="video/mp4">'; }
    videoEl.style.display = '';
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    showOverlayUntilReady();
    setLoadTimeout();
    videoEl.load();
    videoEl.play().then(function () { clearLoadTimeout(); hideFallbackAndOverlay(); }).catch(function () { clearLoadTimeout(); showPlayOverlay(); });
    return;
  }
  var idx = 0;
  function playNext() {
    var item = sources[idx % sources.length];
    idx += 1;
    var src = item.type === 'url' ? item.src : CONTENT_LOOP_BASE + (item.path || '');
    videoEl.style.display = '';
    if (fallback) fallback.style.display = 'none';
    var mime = 'mp4';
    if (item.type === 'path' && item.path) {
      var ext = (item.path.match(/\.(\w+)$/i) || [])[1] || 'mp4';
      mime = ext.toLowerCase() === 'webm' ? 'webm' : ext.toLowerCase() === 'ogg' ? 'ogg' : ext.toLowerCase() === 'mov' ? 'quicktime' : 'mp4';
    }
    videoEl.innerHTML = '<source src="' + src + '" type="video/' + mime + '">';
    videoEl.loop = false;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.onended = playNext;
    showOverlayUntilReady();
    setLoadTimeout();
    videoEl.load();
    videoEl.play().then(function () { clearLoadTimeout(); hideFallbackAndOverlay(); }).catch(function () { clearLoadTimeout(); showPlayOverlay(); setTimeout(playNext, 500); });
  }
  playNext();
}

/** Banner de vídeo en bucle en la pantalla Gestión (input/CONTENT/Tapes) */
function initGestionBannerLoop() {
  const wrap = document.getElementById('gestionBannerWrap');
  const videoEl = document.getElementById('gestionBannerVideo');
  const fallback = document.getElementById('gestionBannerFallback');
  if (!wrap || !videoEl) return;
  function showFallback() {
    if (videoEl) videoEl.style.display = 'none';
    if (fallback) fallback.style.display = 'flex';
  }
  function hideFallback() {
    if (fallback) fallback.style.display = 'none';
    if (videoEl) videoEl.style.display = '';
  }
  var sources = getContentLoopSources();
  if (!sources || sources.length === 0) {
    showFallback();
    return;
  }
  if (!videoEl.dataset.gestionBannerListeners) {
    videoEl.dataset.gestionBannerListeners = '1';
    videoEl.addEventListener('error', showFallback);
    videoEl.addEventListener('loadeddata', hideFallback);
  }
  if (sources.length === 1) {
    var item = sources[0];
    var src = item.type === 'url' ? item.src : CONTENT_LOOP_BASE + (item.path || 'video.mp4');
    var firstSource = videoEl.querySelector('source');
    if (firstSource) firstSource.setAttribute('src', src); else videoEl.innerHTML = '<source src="' + src + '" type="video/mp4">';
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.style.display = '';
    hideFallback();
    videoEl.load();
    videoEl.play().catch(showFallback);
    return;
  }
  var idx = 0;
  function playNext() {
    var item = sources[idx % sources.length];
    idx += 1;
    var src = item.type === 'url' ? item.src : CONTENT_LOOP_BASE + (item.path || '');
    var mime = 'mp4';
    if (item.type === 'path' && item.path) {
      var ext = (item.path.match(/\.(\w+)$/i) || [])[1] || 'mp4';
      mime = ext.toLowerCase() === 'webm' ? 'webm' : ext.toLowerCase() === 'ogg' ? 'ogg' : ext.toLowerCase() === 'mov' ? 'quicktime' : 'mp4';
    }
    videoEl.innerHTML = '<source src="' + src + '" type="video/' + mime + '">';
    videoEl.loop = false;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.onended = playNext;
    videoEl.style.display = '';
    hideFallback();
    videoEl.load();
    videoEl.play().catch(showFallback);
  }
  playNext();
}

function initWatermarks() {
  const container = document.getElementById('watermarkContainer');
  if (!container) return;
  container.innerHTML = '';
  const count = 22;
  const sizes = [36, 42, 48, 52];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'watermark-item';
    const size = sizes[Math.floor(Math.random() * sizes.length)];
    const left = 5 + Math.random() * 90;
    const top = 5 + Math.random() * 90;
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.left = left + '%';
    el.style.top = top + '%';
    el.style.opacity = 0.03 + Math.random() * 0.04;
    container.appendChild(el);
  }
}

/** Scrollbar visible solo al hacer scroll en todas las pantallas: oculta por defecto, se muestra al desplazar */
function initScrollbarVisible() {
  var SCROLLBAR_HIDE_MS = 1200;
  var selector = '.pantalla-principal, .pantalla-secundaria-body, .calculator .panel, .normativas-screen-inner, .normativas-reader-content, .org-modal-body, .modal-body, .paso-calculadora, .pantalla-principal-layout .calculator, .pantalla-fichajes-body, .fichajes-body, .lista-mi-historial, .aside-stats-wrap, .lista-historial-indicador';
  function onScroll() {
    var el = this;
    if (el._scrollbarHideTimer) clearTimeout(el._scrollbarHideTimer);
    el.classList.add('show-scrollbar');
    el._scrollbarHideTimer = setTimeout(function () {
      el.classList.remove('show-scrollbar');
      el._scrollbarHideTimer = null;
    }, SCROLLBAR_HIDE_MS);
  }
  document.querySelectorAll(selector).forEach(function (el) {
    if (el._scrollbarListener) return;
    el.classList.add('scrollbar-on-scroll');
    el._scrollbarListener = true;
    el.addEventListener('scroll', onScroll, { passive: true });
  });
}

// Inicialización (calculadora)
function vincularPasswordToggle() {
  if (window._passwordToggleBound) return;
  window._passwordToggleBound = true;
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('.btn-password-toggle');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var id = btn.getAttribute('data-password-target');
    var input = id ? document.getElementById(id) : null;
    if (!input) return;
    var visible = (input.getAttribute('type') || input.type) === 'text';
    var newType = visible ? 'password' : 'text';
    input.blur();
    input.setAttribute('type', newType);
    try { input.type = newType; } catch (err) {}
    btn.classList.toggle('is-visible', !visible);
    btn.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
  }, true);
}

function vincularCambiarUsuario() {
  var btn = document.getElementById('btnCambiarUsuario');
  var dropdown = document.getElementById('cambiarUsuarioDropdown');
  var lista = document.getElementById('cambiarUsuarioLista');
  if (!btn || !dropdown || !lista) return;
  if (btn.dataset.cambiarUsuarioBound) return;
  btn.dataset.cambiarUsuarioBound = '1';

  function cerrarDropdown() {
    dropdown.style.display = 'none';
    dropdown.classList.remove('open');
  }

  function abrirDropdown() {
    var users = typeof getUsers === 'function' ? getUsers().filter(function (u) { return u.activo !== false; }) : [];
    var current = getSession();
    lista.innerHTML = '';
    users.forEach(function (u) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'cambiar-usuario-item';
      item.textContent = (u.nombre || u.username) + (u.rol ? ' · ' + u.rol : '');
      item.dataset.userId = u.id || u.username || '';
      if (current && (current.id || current.username || '') === (u.id || u.username || '')) item.classList.add('cambiar-usuario-item-actual');
      item.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        actualizarSesionYVista(u);
        cerrarDropdown();
      });
      lista.appendChild(item);
    });
    var sep = document.createElement('div');
    sep.className = 'cambiar-usuario-separator';
    sep.setAttribute('aria-hidden', 'true');
    lista.appendChild(sep);
    var btnPrefs = document.createElement('button');
    btnPrefs.type = 'button';
    btnPrefs.className = 'cambiar-usuario-item cambiar-usuario-item-personalizacion';
    btnPrefs.textContent = '⚙ Personalizar experiencia';
    btnPrefs.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); abrirPantallaPersonalizacion(); });
    lista.appendChild(btnPrefs);
    dropdown.style.display = 'block';
    dropdown.classList.add('open');
  }

  function actualizarSesionYVista(user) {
    setSession(user);
    var headerUserNameText = document.getElementById('headerUserNameText');
    if (headerUserNameText) headerUserNameText.textContent = user.nombre || user.username;
    if (el.mecanico) el.mecanico.value = user.nombre || user.username;
    aplicarPermisos(user);
    actualizarLedFichaje();
    if (typeof applyPreferencias === 'function') applyPreferencias(getPreferenciasUsuario());
    actualizarVista();
  }

  function abrirPantallaPersonalizacion() {
    cerrarDropdown();
    var btnPersonalizacion = document.getElementById('btnPersonalizacion');
    if (btnPersonalizacion) btnPersonalizacion.click();
  }

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (dropdown.classList.contains('open') || dropdown.style.display === 'block') {
      cerrarDropdown();
      return;
    }
    abrirDropdown();
  });

  document.addEventListener('click', function (e) {
    if (!dropdown.classList.contains('open')) return;
    if (btn.contains(e.target) || dropdown.contains(e.target)) return;
    cerrarDropdown();
  });
}

function vincularPersonalizacion() {
  var btnAbrir = document.getElementById('btnPersonalizacion');
  var pantalla = document.getElementById('pantallaPersonalizacion');
  var btnHome = document.getElementById('btnPersonalizacionHome');
  var form = document.getElementById('formPersonalizacion');
  var bgType = document.getElementById('personalizacionBackgroundType');
  var gradientWrap = document.getElementById('personalizacionGradientWrap');
  var imageWrap = document.getElementById('personalizacionImageWrap');
  var btnSubirFondo = document.getElementById('btnPersonalizacionSubirFondo');
  var inputFondo = document.getElementById('personalizacionBackgroundImage');
  var btnQuitarFondo = document.getElementById('btnPersonalizacionQuitarFondo');
  var btnRestaurar = document.getElementById('btnPersonalizacionRestaurar');
  if (!pantalla || !form) return;

  function rellenarFormulario(prefs) {
    prefs = prefs || getPreferenciasUsuario();
    var accent = prefs.accentColor || '#d4af37';
    if (accent === 'default') accent = '#d4af37';
    var radios = form.querySelectorAll('input[name="accentColor"]');
    radios.forEach(function (r) {
      r.checked = (r.value === accent || (r.value === 'default' && accent === '#d4af37'));
    });
    var customColor = document.getElementById('personalizacionAccentCustom');
    if (customColor) customColor.value = accent;
    var themeSel = document.getElementById('personalizacionTheme');
    if (themeSel) themeSel.value = prefs.theme || 'dark';
    var fontSel = document.getElementById('personalizacionFontFamily');
    if (fontSel) fontSel.value = prefs.fontFamily || 'default';
    var sizeRadios = form.querySelectorAll('input[name="fontSize"]');
    sizeRadios.forEach(function (r) { r.checked = (r.value === (prefs.fontSize || 'medium')); });
    if (bgType) bgType.value = prefs.backgroundType || 'none';
    toggleBackgroundSubwraps();
    var gradSel = document.getElementById('personalizacionGradient');
    if (gradSel) gradSel.value = prefs.backgroundGradient || 'warm';
    if (btnQuitarFondo) btnQuitarFondo.style.display = (prefs.backgroundType === 'image' && prefs.backgroundImage) ? '' : 'none';
    var opacitySel = document.getElementById('personalizacionBackgroundOpacity');
    if (opacitySel) opacitySel.value = String(prefs.backgroundOpacity != null ? prefs.backgroundOpacity : 0.5);
    var cardStyleSel = document.getElementById('personalizacionCardStyle');
    if (cardStyleSel) cardStyleSel.value = prefs.cardStyle || 'default';
    var compactCb = document.getElementById('personalizacionCompactNav');
    if (compactCb) compactCb.checked = !!prefs.compactNav;
    var highContrastCb = document.getElementById('personalizacionHighContrast');
    if (highContrastCb) highContrastCb.checked = !!prefs.highContrast;
    var motionCb = document.getElementById('personalizacionReducedMotion');
    if (motionCb) motionCb.checked = !!prefs.reducedMotion;
    var radiusSel = document.getElementById('personalizacionBorderRadius');
    if (radiusSel) radiusSel.value = prefs.borderRadius || 'default';
    var apiUrlInput = document.getElementById('personalizacionApiUrl');
    if (apiUrlInput && typeof window.backendApi !== 'undefined' && window.backendApi.getApiUrl) {
      apiUrlInput.value = window.backendApi.getApiUrl() || '';
    }
  }

  function toggleBackgroundSubwraps() {
    var t = bgType ? bgType.value : 'none';
    if (gradientWrap) gradientWrap.style.display = (t === 'gradient') ? 'block' : 'none';
    if (imageWrap) imageWrap.style.display = (t === 'image') ? 'block' : 'none';
  }

  if (bgType) bgType.addEventListener('change', toggleBackgroundSubwraps);

  if (btnAbrir) btnAbrir.addEventListener('click', function () {
    cerrarTodasPantallasSecundarias();
    var dropdown = document.getElementById('cambiarUsuarioDropdown');
    if (dropdown) dropdown.style.display = 'none';
    rellenarFormulario();
    if (typeof ocultarAppBodyMostrarSecundaria === 'function') ocultarAppBodyMostrarSecundaria('pantallaPersonalizacion');
    else { pantalla.style.display = 'flex'; document.getElementById('appBody').style.display = 'none'; }
  });

  if (btnHome) btnHome.addEventListener('click', function () {
    if (typeof cerrarTodasPantallasSecundarias === 'function') cerrarTodasPantallasSecundarias();
    else { pantalla.style.display = 'none'; document.getElementById('appBody').style.display = 'flex'; }
  });

  var btnGuardarApiUrl = document.getElementById('btnPersonalizacionGuardarApiUrl');
  var apiUrlEstado = document.getElementById('personalizacionApiUrlEstado');
  if (btnGuardarApiUrl && typeof window.backendApi !== 'undefined') {
    btnGuardarApiUrl.addEventListener('click', function () {
      var input = document.getElementById('personalizacionApiUrl');
      var url = (input && input.value) ? input.value.trim() : '';
      if (!url) {
        if (apiUrlEstado) { apiUrlEstado.textContent = 'Escribe la URL del servidor.'; apiUrlEstado.style.color = 'var(--text-muted)'; }
        return;
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
      window.backendApi.setApiUrl(url);
      if (apiUrlEstado) { apiUrlEstado.textContent = 'Guardado. Conectando...'; apiUrlEstado.style.color = 'var(--accent, #d4af37)'; }
      window.backendApi.init().then(function (ok) {
        if (apiUrlEstado) {
          apiUrlEstado.textContent = ok ? 'Conectado al servidor.' : 'No se pudo conectar. Comprueba la URL y que el servidor esté en marcha.';
          apiUrlEstado.style.color = ok ? 'var(--success, #22c55e)' : 'var(--danger, #dc3545)';
        }
        if (ok && typeof actualizarVista === 'function') actualizarVista();
      });
    });
  }

  if (btnSubirFondo && inputFondo) {
    btnSubirFondo.addEventListener('click', function () { inputFondo.click(); });
    inputFondo.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function () {
        var prefs = getPreferenciasUsuario();
        prefs.backgroundType = 'image';
        prefs.backgroundImage = reader.result;
        savePreferenciasUsuario(prefs);
        applyPreferencias(prefs);
        rellenarFormulario(prefs);
        if (btnQuitarFondo) btnQuitarFondo.style.display = '';
        if (bgType) bgType.value = 'image';
        toggleBackgroundSubwraps();
      };
      reader.readAsDataURL(file);
      this.value = '';
    });
  }

  if (btnQuitarFondo) btnQuitarFondo.addEventListener('click', function () {
    var prefs = getPreferenciasUsuario();
    prefs.backgroundType = 'none';
    prefs.backgroundImage = null;
    savePreferenciasUsuario(prefs);
    applyPreferencias(prefs);
    rellenarFormulario(prefs);
    btnQuitarFondo.style.display = 'none';
    if (bgType) bgType.value = 'none';
    toggleBackgroundSubwraps();
  });

  if (btnRestaurar) btnRestaurar.addEventListener('click', function () {
    var prefs = Object.assign({}, PREFERENCIAS_DEFAULT);
    savePreferenciasUsuario(prefs);
    applyPreferencias(prefs);
    rellenarFormulario(prefs);
    if (btnQuitarFondo) btnQuitarFondo.style.display = 'none';
    if (bgType) bgType.value = 'none';
    toggleBackgroundSubwraps();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var accentRadio = form.querySelector('input[name="accentColor"]:checked');
    var accent = (accentRadio && accentRadio.value !== 'default') ? accentRadio.value : document.getElementById('personalizacionAccentCustom').value;
    var opacityEl = document.getElementById('personalizacionBackgroundOpacity');
    var opacityVal = opacityEl ? parseFloat(opacityEl.value) : 0.5;
    var prefs = {
      accentColor: accent,
      fontFamily: document.getElementById('personalizacionFontFamily').value || 'default',
      fontSize: (form.querySelector('input[name="fontSize"]:checked') || {}).value || 'medium',
      theme: (document.getElementById('personalizacionTheme') || {}).value || 'dark',
      highContrast: document.getElementById('personalizacionHighContrast').checked,
      backgroundType: bgType ? bgType.value : 'none',
      backgroundImage: getPreferenciasUsuario().backgroundImage || null,
      backgroundGradient: (document.getElementById('personalizacionGradient') || {}).value || 'warm',
      backgroundOpacity: opacityVal,
      compactNav: document.getElementById('personalizacionCompactNav').checked,
      borderRadius: (document.getElementById('personalizacionBorderRadius') || {}).value || 'default',
      reducedMotion: document.getElementById('personalizacionReducedMotion').checked,
      cardStyle: (document.getElementById('personalizacionCardStyle') || {}).value || 'default'
    };
    savePreferenciasUsuario(prefs);
    applyPreferencias(prefs);
    if (typeof cerrarTodasPantallasSecundarias === 'function') cerrarTodasPantallasSecundarias();
    else { pantalla.style.display = 'none'; document.getElementById('appBody').style.display = 'flex'; }
  });

  form.querySelectorAll('input[name="accentColor"]').forEach(function (r) {
    r.addEventListener('change', function () {
      if (this.value !== 'default') document.getElementById('personalizacionAccentCustom').value = this.value;
    });
  });
  var customColorEl = document.getElementById('personalizacionAccentCustom');
  if (customColorEl) customColorEl.addEventListener('input', function () {
    form.querySelectorAll('input[name="accentColor"]').forEach(function (r) { r.checked = false; });
  });
}

function init() {
  initWatermarks();
  registroServicios = getRegistroServicios();
  if (typeof seedClientesBBDDIfEmpty === 'function') seedClientesBBDDIfEmpty();
  cargarConvenios();
  cargarVehiculos();
  cargarMatriculasGuardadas();
  vincularPasos();
  vincularEventos();
  vincularRegistroClientes();
  vincularSubirVideo();
  vincularModalVerVideoSolicitud();
  vincularNormativas();
  vincularVacantes();
  vincularBandejaEntrada();
  vincularFichaTrabajador();
  vincularMiHistorial();
  vincularResultadosCalculadora();
  vincularModalFotosTuneo();
  vincularTunnings();
  vincularIndicadoresHistorial();
  vincularPasswordToggle();
  vincularCambiarUsuario();
  vincularPersonalizacion();
  if (typeof cargarMatriculasDesdePlates === 'function') cargarMatriculasDesdePlates();
  if (typeof cargarListadoPlacas === 'function') {
    cargarListadoPlacas(function () {
      if (typeof aplicarEstiloPlacaActual === 'function') aplicarEstiloPlacaActual();
      if (typeof renderUltimasReparaciones === 'function') renderUltimasReparaciones();
    });
  }
  mostrarPaso('inicio');
  actualizarVista();
  initContentLoop();
  initGestionBannerLoop();
  initScrollbarVisible();
  // Refresco de indicadores al cargar (por si el panel se pinta después)
  requestAnimationFrame(function () { renderStatsVehiculo(''); });
  // Sincronización entre pestañas del mismo navegador: cuando otra pestaña cambia localStorage,
  // actualizar la vista. Con backend API, entre ordenadores se sincroniza por polling.
  function refrescarVistaPorUsuariosSync() {
    var session = getSession();
    if (session && typeof getUsers === 'function') {
      var users = getUsers();
      var currentId = session.id || session.username;
      var updated = users.find(function (u) { return (u.id || u.username) === currentId; });
      if (updated) setSession(updated);
    }
    session = getSession();
    aplicarPermisos(session);
    var headerUserNameText = document.getElementById('headerUserNameText');
    if (headerUserNameText && session) headerUserNameText.textContent = (session.nombre || session.username) || '';
    var dropdown = document.getElementById('cambiarUsuarioDropdown');
    if (dropdown && dropdown.classList.contains('open')) dropdown.style.display = 'none';
    if (dropdown) dropdown.classList.remove('open');
    var pantallaGestion = document.getElementById('pantallaGestion');
    if (pantallaGestion && pantallaGestion.style.display !== 'none' && typeof renderListaUsuarios === 'function') {
      renderListaUsuarios();
    }
    if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
    // Actualizar KPIs de empleados en dashboard principal y economía
    if (typeof renderMainDashboard === 'function') renderMainDashboard();
    if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
  }

  window.addEventListener('storage', function (e) {
    if (e.key === 'benny_servicios' && typeof paso !== 'undefined' && paso === 'inicio') {
      requestAnimationFrame(function () { renderStatsVehiculo(''); });
    }
    if (e.key === 'benny_users') {
      requestAnimationFrame(refrescarVistaPorUsuariosSync);
    }
  });

  // Sincronización desde el backend (otros dispositivos): polling actualiza localStorage y dispara este evento
  window.addEventListener('benny-backend-sync', function (e) {
    var detail = (e && e.detail) || {};
    requestAnimationFrame(function () {
      if (detail.fullSync) {
        // Sincronización total: refrescar toda la vista para que todos vean exactamente lo mismo
        registroServicios = typeof getRegistroServicios === 'function' ? getRegistroServicios() : [];
        if (typeof paso !== 'undefined') {
          if (paso === 'inicio') {
            if (typeof renderUltimasReparaciones === 'function') renderUltimasReparaciones();
            if (typeof renderMainDashboard === 'function') renderMainDashboard();
            if (typeof renderStatsVehiculo === 'function') renderStatsVehiculo('');
          }
          if (typeof actualizarVista === 'function') actualizarVista();
        }
        refrescarVistaPorUsuariosSync();
        var session = getSession();
        if (session && typeof renderListaFichajesReciente === 'function') renderListaFichajesReciente(session.username);
        if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
        // Economía y stock
        if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
        if (typeof renderInventario === 'function') renderInventario();
        if (typeof renderComprasPendientes === 'function') renderComprasPendientes();
        if (typeof renderAlmacenMateriales === 'function') renderAlmacenMateriales();
        if (typeof renderGastos === 'function') renderGastos();
        if (typeof renderLimitesStock === 'function') renderLimitesStock();
        if (typeof renderHistorialPedidos === 'function') renderHistorialPedidos();
        if (typeof renderEntregasMaterial === 'function') renderEntregasMaterial();
        if (typeof renderPrevisiones === 'function') renderPrevisiones();
        if (typeof renderEconomiaFinanciera === 'function') renderEconomiaFinanciera();
        // Gestión, convenios, organigrama
        if (typeof renderListaConvenios === 'function') renderListaConvenios();
        if (typeof renderConveniosEmpleadosYPlacas === 'function') renderConveniosEmpleadosYPlacas();
        if (typeof renderOrganigrama === 'function') renderOrganigrama('organigramaContainer', !!window._organigramaEditMode);
        if (typeof renderListaUsuarios === 'function') renderListaUsuarios();
        if (typeof renderAprobacionesPendientes === 'function') renderAprobacionesPendientes();
        if (typeof renderIndicadoresPanel === 'function') renderIndicadoresPanel();
        // Clientes, vacantes, bandeja, resultados
        if (typeof renderTablaClientesBBDD === 'function') renderTablaClientesBBDD();
        if (typeof renderFichasClientes === 'function') renderFichasClientes();
        if (typeof renderListaVetados === 'function') renderListaVetados();
        if (typeof renderPendientesRegistro === 'function') renderPendientesRegistro();
        if (typeof renderListaVacantes === 'function') renderListaVacantes();
        if (typeof renderListaBandejaEntrada === 'function') renderListaBandejaEntrada();
        if (typeof renderListaResultadosCalculadora === 'function') renderListaResultadosCalculadora();
        if (typeof renderTunningsGallery === 'function') renderTunningsGallery();
        if (typeof renderRegistroTestNormativas === 'function') renderRegistroTestNormativas();
        window.dispatchEvent(new CustomEvent('benny-full-sync-done'));
        return;
      }
      if (detail.users) refrescarVistaPorUsuariosSync();
      if (detail.fichajes) {
        var session = getSession();
        if (session && typeof renderListaFichajesReciente === 'function') renderListaFichajesReciente(session.username);
        if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
      }
      if (detail.servicios) {
        if (typeof invalidateServiciosCache === 'function') invalidateServiciosCache();
        if (typeof paso !== 'undefined' && paso === 'inicio') {
          registroServicios = getRegistroServicios();
          if (typeof renderUltimasReparaciones === 'function') renderUltimasReparaciones();
          if (typeof renderMainDashboard === 'function') renderMainDashboard();
          if (typeof renderStatsVehiculo === 'function') renderStatsVehiculo('');
        }
      }
    });
  });
  // Al volver a la pestaña, refrescar todos los datos desde el backend
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    var api = window.backendApi;
    if (!api) return;
    if (api.fetchDatosCompletos && typeof window.aplicarDatosCompletosFromServer === 'function') {
      api.fetchDatosCompletos().then(function (full) {
        if (full) {
          window.aplicarDatosCompletosFromServer(full);
          window.dispatchEvent(new CustomEvent('benny-backend-sync', { detail: { fullSync: true } }));
        } else if (api.fetchAndApplyFichajes && api.fetchAndApplyServicios) {
          Promise.all([api.fetchAndApplyFichajes(), api.fetchAndApplyServicios()]).then(function () {
            if (typeof invalidateServiciosCache === 'function') invalidateServiciosCache();
            registroServicios = getRegistroServicios();
            var session = getSession();
            if (session && typeof renderListaFichajesReciente === 'function') renderListaFichajesReciente(session.username);
            if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
            if (typeof paso !== 'undefined' && paso === 'inicio') {
              if (typeof renderUltimasReparaciones === 'function') renderUltimasReparaciones();
              if (typeof renderMainDashboard === 'function') renderMainDashboard();
              if (typeof renderStatsVehiculo === 'function') renderStatsVehiculo('');
            }
          }).catch(function () {});
        }
      }).catch(function () {});
    } else if (api.fetchAndApplyFichajes && api.fetchAndApplyServicios) {
      Promise.all([api.fetchAndApplyFichajes(), api.fetchAndApplyServicios()]).then(function () {
        if (typeof invalidateServiciosCache === 'function') invalidateServiciosCache();
        registroServicios = getRegistroServicios();
        var session = getSession();
        if (session && typeof renderListaFichajesReciente === 'function') renderListaFichajesReciente(session.username);
        if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
        if (typeof paso !== 'undefined' && paso === 'inicio') {
          if (typeof renderUltimasReparaciones === 'function') renderUltimasReparaciones();
          if (typeof renderMainDashboard === 'function') renderMainDashboard();
          if (typeof renderStatsVehiculo === 'function') renderStatsVehiculo('');
        }
      }).catch(function () {});
    } else if (typeof paso !== 'undefined' && paso === 'inicio') {
      registroServicios = getRegistroServicios();
      requestAnimationFrame(function () { if (typeof renderStatsVehiculo === 'function') renderStatsVehiculo(''); });
    }
  });
}

function cargarConvenios() {
  el.negocios.innerHTML = '';
  const session = getSession();
  const puedeVerPrivados = hasPermission(session, 'verConveniosPrivados');
  let convenios = typeof getConveniosVisibles === 'function' ? getConveniosVisibles(puedeVerPrivados) : (typeof getConvenios === 'function' ? getConvenios() : [{ nombre: 'N/A', descuento: 0 }]);
  convenios = [...convenios].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  convenios.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.nombre;
    opt.textContent = c.descuento > 0 ? `${c.nombre} (${c.descuento}%)` : c.nombre;
    opt.dataset.descuento = String(c.descuento);
    el.negocios.appendChild(opt);
  });
}

/** Devuelve lista única de nombres de modelo para autocompletado: VEHICULOS_DB + nombres en BBDD clientes */
function getNombresModeloParaAutocompletado() {
  const set = new Set();
  if (typeof VEHICULOS_DB !== 'undefined') {
    VEHICULOS_DB.forEach(function (v) {
      if (v.modelo) set.add(String(v.modelo).trim());
      if (v.nombreIC) set.add(String(v.nombreIC).trim());
    });
  }
  if (typeof getClientesBBDD === 'function') {
    try {
      getClientesBBDD().forEach(function (c) {
        if (c.nombreVehiculo && String(c.nombreVehiculo).trim()) set.add(String(c.nombreVehiculo).trim());
        if (c.codigoVehiculo && String(c.codigoVehiculo).trim()) set.add(String(c.codigoVehiculo).trim());
      });
    } catch (e) {}
  }
  return Array.from(set).filter(Boolean).sort(function (a, b) { return a.localeCompare(b, 'es'); });
}

function fillNuevoVehiculoModeloDatalist() {
  const list = document.getElementById('nuevoVehiculoModeloList');
  if (!list) return;
  list.innerHTML = '';
  getNombresModeloParaAutocompletado().forEach(function (nombre) {
    const o = document.createElement('option');
    o.value = nombre;
    list.appendChild(o);
  });
}

function cargarVehiculos() {
  const ordenados = [...VEHICULOS_DB].sort((a, b) => (a.nombreIC || a.modelo || '').localeCompare(b.nombreIC || b.modelo || '', 'es'));
  el.modelo.innerHTML = '';
  ordenados.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.modelo;
    opt.textContent = v.nombreIC;
    el.modelo.appendChild(opt);
  });
  const nombreICList = document.getElementById('nombreICList');
  if (nombreICList) {
    nombreICList.innerHTML = '';
    ordenados.forEach(v => {
      const o = document.createElement('option');
      o.value = v.nombreIC || v.modelo || '';
      nombreICList.appendChild(o);
    });
  }
  fillNuevoVehiculoModeloDatalist();
  cambiarModelo();
}

/** Colores por estilo (banner y body) para forzar con inline y que siempre se vea el cambio. */
var _plateStyleThemes = [
  { name: 'matricula-plate-yankton', bannerBg: 'linear-gradient(180deg, #9b1f1f 0%, #b82424 30%, #a01c1c 100%)', bannerColor: '#fff', bodyBg: 'linear-gradient(180deg, #a01c1c 0%, #8b1919 50%, #7a1515 100%)', inputColor: '#fff' },
  { name: 'matricula-plate-europe', bannerBg: 'linear-gradient(180deg, #003399 0%, #0044bb 50%, #002d80 100%)', bannerColor: '#fff', bodyBg: 'linear-gradient(180deg, #002d80 0%, #002060 50%, #001a50 100%)', inputColor: '#fff' },
  { name: 'matricula-plate-sport', bannerBg: 'linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)', bannerColor: '#ffcc00', bodyBg: 'linear-gradient(180deg, #2a2a2a 0%, #1f1f1f 100%)', inputColor: '#ffcc00' }
];

/** Aplica un estilo de placa: si hay imágenes en input/CONTENT/PLATES/listado-placas.txt, una aleatoria; si no, rota entre Yankton/Europe/Sport. Placeholder desde matriculas.txt. */
function aplicarEstiloPlacaAleatorio() {
  var useImage = typeof hasPlateImagesFromRepo === 'function' && hasPlateImagesFromRepo();
  var imgUrl = useImage && typeof getPlateImageAleatorio === 'function' ? getPlateImageAleatorio() : null;
  var ejemplosFallback = ['HRUA9940', 'ABC1234', 'LSMD2025', 'TUNE001', 'REP7890', 'SALT01', 'CAFE42', 'LSCM99', 'GTARP1', 'BENNY7'];
  var placeholder = typeof getMatriculaAleatoria === 'function' ? getMatriculaAleatoria() : ejemplosFallback[Math.floor(Math.random() * ejemplosFallback.length)];

  function applyToWrap(wrap) {
    if (!wrap) return;
    var base = (wrap.getAttribute('class') || '').replace(/\s*matricula-plate-(yankton|europe|sport|from-repo)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (imgUrl) {
      wrap.setAttribute('class', (base + ' matricula-plate-from-repo').trim());
      wrap.style.backgroundImage = 'url("' + imgUrl.replace(/"/g, '%22') + '")';
      wrap.style.backgroundSize = 'contain';
      wrap.style.backgroundPosition = 'center';
      var banner = wrap.querySelector('.matricula-plate-banner');
      var body = wrap.querySelector('.matricula-plate-body');
      if (banner) { banner.style.background = 'transparent'; banner.style.color = '#fff'; }
      if (body) { body.style.background = 'transparent'; body.style.color = ''; }
      var input = wrap.querySelector('.matricula-plate-input');
      if (input) { input.style.color = '#1a1a1a'; input.style.setProperty('--placeholder-color', 'rgba(0,0,0,0.4)'); }
    } else {
      _plateStyleIndex = (_plateStyleIndex + 1) % _plateStyleThemes.length;
      var theme = _plateStyleThemes[_plateStyleIndex];
      wrap.setAttribute('class', (base + ' ' + theme.name).trim());
      wrap.style.backgroundImage = '';
      wrap.style.backgroundSize = '';
      wrap.style.backgroundPosition = '';
      var banner = wrap.querySelector('.matricula-plate-banner');
      var body = wrap.querySelector('.matricula-plate-body');
      if (banner) { banner.style.background = theme.bannerBg; banner.style.color = theme.bannerColor; }
      if (body) { body.style.background = theme.bodyBg; body.style.color = theme.inputColor || ''; }
      var input = wrap.querySelector('.matricula-plate-input');
      if (input) { input.style.color = theme.inputColor || ''; input.style.setProperty('--placeholder-color', theme.inputColor === '#ffcc00' ? 'rgba(255,204,0,0.6)' : ''); }
    }
  }
  var wrapPaso = document.getElementById('matriculaPlateWrap');
  if (wrapPaso) applyToWrap(wrapPaso);
  document.querySelectorAll('.matricula-plate-wrap').forEach(applyToWrap);
  var inputMat = document.getElementById('matricula');
  if (inputMat) inputMat.setAttribute('placeholder', placeholder);
}

/** Reaplica el estilo de placa actual: imagen aleatoria del repo PLATES si hay listado; si no, el tema actual (Yankton/Europe/Sport). */
function aplicarEstiloPlacaActual() {
  var useImage = typeof hasPlateImagesFromRepo === 'function' && hasPlateImagesFromRepo();
  var imgUrl = useImage && typeof getPlateImageAleatorio === 'function' ? getPlateImageAleatorio() : null;
  var theme = _plateStyleThemes[_plateStyleIndex % _plateStyleThemes.length];
  var wraps = document.querySelectorAll('.matricula-plate-wrap');
  wraps.forEach(function (wrap) {
    var base = (wrap.getAttribute('class') || '').replace(/\s*matricula-plate-(yankton|europe|sport|from-repo)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (imgUrl) {
      wrap.setAttribute('class', (base + ' matricula-plate-from-repo').trim());
      wrap.style.backgroundImage = 'url("' + imgUrl.replace(/"/g, '%22') + '")';
      wrap.style.backgroundSize = 'contain';
      wrap.style.backgroundPosition = 'center';
      wrap.style.backgroundRepeat = 'no-repeat';
      var banner = wrap.querySelector('.matricula-plate-banner');
      var body = wrap.querySelector('.matricula-plate-body');
      if (banner) { banner.style.background = 'transparent'; banner.style.color = '#fff'; }
      if (body) { body.style.background = 'transparent'; body.style.color = ''; }
      var input = wrap.querySelector('.matricula-plate-input');
      if (input) { input.style.color = '#1a1a1a'; input.style.setProperty('--placeholder-color', 'rgba(0,0,0,0.4)'); }
    } else {
      wrap.setAttribute('class', (base + ' ' + theme.name).trim());
      wrap.style.backgroundImage = '';
      wrap.style.backgroundSize = '';
      wrap.style.backgroundPosition = '';
      var banner = wrap.querySelector('.matricula-plate-banner');
      var body = wrap.querySelector('.matricula-plate-body');
      if (banner) { banner.style.background = theme.bannerBg; banner.style.color = theme.bannerColor; }
      if (body) { body.style.background = theme.bodyBg; if (theme.inputColor) body.style.color = theme.inputColor; else body.style.color = ''; }
      var input = wrap.querySelector('.matricula-plate-input');
      if (input && theme.inputColor) input.style.color = theme.inputColor; else if (input) input.style.color = '';
    }
  });
}

function mostrarPaso(paso) {
  document.getElementById('pasoInicio').style.display = paso === 'inicio' ? 'block' : 'none';
  document.getElementById('pasoMatricula').style.display = paso === 'matricula' ? 'block' : 'none';
  document.getElementById('pasoCalculadora').style.display = paso === 'calculadora' ? 'block' : 'none';
  const headerMinimal = document.getElementById('headerCalcMinimal');
  const navSidebar = document.getElementById('navSidebar');
  const headerUserNameCenter = document.getElementById('headerUserNameCenter');
  const headerUserNameText = document.getElementById('headerUserNameText');
  if (headerMinimal) headerMinimal.style.display = paso === 'calculadora' ? 'flex' : 'none';
  const headerExtra = document.getElementById('headerExtra');
  if (headerExtra) headerExtra.style.display = 'flex';
  if (navSidebar) navSidebar.style.display = paso === 'calculadora' ? 'none' : 'flex';
  if (headerUserNameCenter) headerUserNameCenter.style.display = 'block';
  if (headerUserNameText) {
    const session = getSession();
    headerUserNameText.textContent = session ? (session.nombre || session.username) : '';
  }
  const contentLoopWrap = document.getElementById('contentLoopWrap');
  if (contentLoopWrap) {
    contentLoopWrap.style.display = paso === 'inicio' ? 'flex' : 'none';
    if (paso === 'inicio' && typeof initContentLoop === 'function') initContentLoop();
  }
  const layoutPrincipal = document.getElementById('pantallaPrincipalLayout');
  if (layoutPrincipal) {
    layoutPrincipal.classList.toggle('layout-calculadora-full', paso === 'calculadora');
    layoutPrincipal.classList.toggle('layout-paso-centro', paso === 'matricula');
  }
  const calendarWrap = document.getElementById('headerCalendarWrap');
  if (calendarWrap) calendarWrap.style.display = paso !== 'calculadora' ? 'flex' : 'none';
  if (paso !== 'calculadora') actualizarCalendarioHeader();
  if (paso === 'inicio') {
    renderUltimasReparaciones();
    renderMainDashboard();
    requestAnimationFrame(function () {
      renderStatsVehiculo('');
    });
  }
  const ultimasWrap = document.getElementById('ultimasReparacionesWrap');
  if (ultimasWrap) ultimasWrap.style.display = paso === 'inicio' ? '' : 'none';
  var mainDashboardWrap = document.getElementById('mainDashboardWrap');
  if (mainDashboardWrap) mainDashboardWrap.style.display = paso === 'inicio' ? '' : 'none';
  if (paso === 'matricula') {
    document.getElementById('nuevoVehiculoWrap').style.display = 'none';
    var conj = document.querySelector('#pasoMatricula .paso-matricula-conjunto');
    if (conj) conj.style.display = '';
    if (el.matricula) el.matricula.value = '';
    cargarMatriculasGuardadas();
    renderUltimasReparaciones();
    aplicarEstiloPlacaAleatorio();
    setTimeout(function () { aplicarEstiloPlacaActual(); }, 150);
  }
  if (paso === 'calculadora') {
    aplicarEstiloPlacaAleatorio();
    if (matriculaActual) renderStatsVehiculo(matriculaActual);
  }
}

function aplicarVisibilidadPorTipo() {
  const rep = tipoServicio === 'reparacion';
  const tuneo = tipoServicio === 'tuneo' || tipoServicio === 'tuneoReparacion';
  const tuneoRep = tipoServicio === 'tuneoReparacion';
  const wrapV = document.getElementById('wrapVehicleSection');
  const wrapR = document.getElementById('wrapRepairSection');
  const wrapPT = document.getElementById('wrapPlantillaTuneo');
  const wrapPR = document.getElementById('wrapPlantillaReparacion');
  const wrapKit = document.getElementById('wrapUsarKit');
  const wrapTuneoRepTitulo = document.getElementById('wrapTuneoReparacionTitulo');
  if (wrapTuneoRepTitulo) wrapTuneoRepTitulo.style.display = tuneoRep ? 'block' : 'none';
  if (wrapV) wrapV.style.display = tuneo ? 'block' : 'none';
  if (wrapR) wrapR.style.display = rep || tuneoRep ? 'block' : 'none';
  if (wrapPT) wrapPT.style.display = tuneo ? 'block' : 'none';
  if (wrapPR) wrapPR.style.display = rep || tuneoRep ? 'block' : 'none';
  if (wrapKit) wrapKit.style.display = 'none';
  if (el.reparacion) el.reparacion.checked = rep || tuneoRep;
}

function aplicarRegistroACalculadora(reg) {
  if (!reg) return;
  if (el.modelo && (reg.modelo || '').trim()) {
    var modeloVal = (reg.modelo || '').trim();
    var hasOption = false;
    for (var i = 0; i < el.modelo.options.length; i++) {
      if ((el.modelo.options[i].value || '').trim() === modeloVal) { hasOption = true; break; }
    }
    if (!hasOption) {
      var opt = document.createElement('option');
      opt.value = modeloVal;
      opt.textContent = reg.nombreIC || modeloVal;
      el.modelo.appendChild(opt);
    }
    el.modelo.value = modeloVal;
    cambiarModelo();
  }
  if (el.nombreIC) el.nombreIC.value = reg.nombreIC || (vehiculoActual ? vehiculoActual.nombreIC : '') || (reg.modelo || '');
  var placaVal = (reg.placaServicio || (reg.placaPolicial && reg.placaPolicial !== '-' ? reg.placaPolicial : '') || '').toString().trim();
  var esPolicia = placaVal !== '' && placaVal !== '-';
  if (el.negocios) {
    var convenioAUsar = reg.convenio || 'N/A';
    if (esPolicia && typeof getConvenios === 'function') {
      var convenios = getConvenios();
      var sapd = convenios.find(function (c) { return (c.nombre || '').toUpperCase() === 'SAPD'; });
      if (sapd) convenioAUsar = sapd.nombre;
    }
    var opts = el.negocios.options;
    for (var i = 0; i < opts.length; i++) {
      var optVal = (opts[i].value || '').trim();
      if (optVal === convenioAUsar.trim()) {
        el.negocios.selectedIndex = i;
        var d = parseInt(opts[i].dataset.descuento, 10);
        if (!isNaN(d)) el.descuentoPorcentaje.value = d;
        break;
      }
    }
  }
  var placa = document.getElementById('placaServicio');
  if (placa) placa.value = esPolicia ? placaVal : '';
  actualizarVisibilidadPlacaServicio();
  actualizarVisibilidadRegistroServicios();
}

function vincularPasos() {
  const btnRep = document.getElementById('btnTipoReparacion');
  const btnTuneo = document.getElementById('btnTipoTuneo');
  const btnTuneoRep = document.getElementById('btnTipoTuneoReparacion');
  const btnVolverInicio = document.getElementById('btnVolverPasoInicio');
  const btnContinuar = document.getElementById('btnContinuarMatricula');
  const btnGuardarNuevo = document.getElementById('btnGuardarNuevoVehiculo');
  const btnVolverMat = document.getElementById('btnVolverMatricula');

  [btnRep, btnTuneo, btnTuneoRep].forEach((btn, i) => {
    if (!btn) return;
    const tipos = ['reparacion', 'tuneo', 'tuneoReparacion'];
    btn.addEventListener('click', () => {
      const session = getSession();
      const fichado = session && typeof hasEntradaAbierta === 'function' && hasEntradaAbierta(session.username);
      if (!fichado) {
        alert('Debes fichar entrada para usar la calculadora. Ve a Fichajes y pulsa «Fichar entrada».');
        return;
      }
      tipoServicio = tipos[i];
      document.getElementById('nuevoVehiculoWrap').style.display = 'none';
      if (!matriculaActual || !matriculaActual.trim()) {
        aplicarEstiloPlacaAleatorio();
        mostrarPaso('matricula');
        return;
      }
      let reg = null;
      if (typeof getClienteByMatricula === 'function') {
        const cliente = getClienteByMatricula(matriculaActual);
        if (cliente) reg = typeof clienteToRegistro === 'function' ? clienteToRegistro(cliente) : null;
      }
      if (!reg && typeof getVehiculoByMatricula === 'function') reg = getVehiculoByMatricula(matriculaActual);
      if (reg) {
        aplicarRegistroACalculadora(reg);
        if (el.matriculaCalc) el.matriculaCalc.value = matriculaActual;
      }
      document.getElementById('pasoCalculadoraTitulo').textContent =
        tipoServicio === 'reparacion' ? 'Reparación' : tipoServicio === 'tuneo' ? 'Tuneo' : 'Tuneo + Reparación';
      document.getElementById('pasoCalcMatricula').textContent = matriculaActual;
      aplicarVisibilidadPorTipo();
      mostrarPaso('calculadora');
      actualizarVisibilidadPlacaServicio();
      actualizarVista();
    });
  });

  if (btnVolverInicio) btnVolverInicio.addEventListener('click', () => { tipoServicio = null; matriculaActual = ''; mostrarPaso('inicio'); document.getElementById('nuevoVehiculoWrap').style.display = 'none'; });

  if (btnContinuar) {
    btnContinuar.addEventListener('click', () => {
      const mat = (el.matricula && el.matricula.value || '').trim();
      if (!mat) {
        alert('Introduce la matrícula.');
        return;
      }
      let reg = null;
      if (typeof getClienteByMatricula === 'function') {
        const cliente = getClienteByMatricula(mat);
        if (cliente) reg = typeof clienteToRegistro === 'function' ? clienteToRegistro(cliente) : null;
      }
      if (!reg && typeof getVehiculoByMatricula === 'function') reg = getVehiculoByMatricula(mat);
      if (reg) {
        matriculaActual = reg.matricula || mat;
        aplicarRegistroACalculadora(reg);
        if (el.matriculaCalc) el.matriculaCalc.value = matriculaActual;
        if (tipoServicio) {
          document.getElementById('pasoCalculadoraTitulo').textContent =
            tipoServicio === 'reparacion' ? 'Reparación' : tipoServicio === 'tuneo' ? 'Tuneo' : 'Tuneo + Reparación';
          document.getElementById('pasoCalcMatricula').textContent = matriculaActual;
          aplicarVisibilidadPorTipo();
          mostrarPaso('calculadora');
          actualizarVisibilidadPlacaServicio();
          actualizarVista();
        } else {
          mostrarPaso('inicio');
        }
      } else {
        matriculaActual = mat.toUpperCase();
        var pasoMatriculaConjunto = document.querySelector('#pasoMatricula .paso-matricula-conjunto');
        if (pasoMatriculaConjunto) pasoMatriculaConjunto.style.display = 'none';
        document.getElementById('nuevoVehiculoWrap').style.display = 'block';
        const nvConvenio = document.getElementById('nuevoVehiculoConvenio');
        if (nvConvenio && nvConvenio.options.length === 0) {
          var optConvVac = document.createElement('option');
          optConvVac.value = '';
          optConvVac.textContent = '— Selecciona convenio —';
          nvConvenio.appendChild(optConvVac);
          const session = getSession();
          let convenios = typeof getConveniosVisibles === 'function' ? getConveniosVisibles(hasPermission(session, 'verConveniosPrivados')) : (typeof getConvenios === 'function' ? getConvenios() : []);
          convenios = [...convenios].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
          convenios.forEach(c => {
            const o = document.createElement('option');
            o.value = c.nombre;
            o.textContent = c.descuento > 0 ? c.nombre + ' (' + c.descuento + '%)' : c.nombre;
            nvConvenio.appendChild(o);
          });
        }
        fillNuevoVehiculoModeloDatalist();
        var inputModelo = document.getElementById('nuevoVehiculoModeloNombre');
        if (inputModelo) inputModelo.value = '';
        if (nvConvenio) nvConvenio.value = '';
        document.getElementById('nuevoVehiculoPlacaServicio').value = '';
      }
    });
  }

  if (btnGuardarNuevo) {
    btnGuardarNuevo.addEventListener('click', () => {
      const inputModeloNombre = document.getElementById('nuevoVehiculoModeloNombre');
      const modeloNombre = (inputModeloNombre && inputModeloNombre.value || '').trim();
      if (!modeloNombre) {
        alert('Escribe el nombre del modelo del vehículo.');
        return;
      }
      const convenio = (document.getElementById('nuevoVehiculoConvenio').value || '').trim() || 'N/A';
      const placaServicio = (document.getElementById('nuevoVehiculoPlacaServicio').value || '').trim();
      const v = typeof VEHICULOS_DB !== 'undefined' && VEHICULOS_DB.find(function (x) {
        return (x.modelo && String(x.modelo).toLowerCase() === modeloNombre.toLowerCase()) ||
          (x.nombreIC && String(x.nombreIC).toLowerCase() === modeloNombre.toLowerCase());
      });
      const modelo = v ? v.modelo : modeloNombre;
      const nombreIC = v ? (v.nombreIC || modeloNombre) : modeloNombre;
      const categoria = v ? v.categoria : '';
      const session = getSession();
      const puedeGestionarBBDD = hasPermission(session, 'gestionarRegistroClientes');
      const dataCliente = {
        matricula: matriculaActual,
        placaPolicial: placaServicio || '-',
        codigoVehiculo: modelo,
        nombreVehiculo: nombreIC,
        categoria,
        convenio,
      };
      if (puedeGestionarBBDD && typeof addOrUpdateClienteBBDD === 'function') {
        addOrUpdateClienteBBDD({ ...dataCliente, interacciones: 0, totalInvertido: 0 });
      } else if (typeof addPendiente === 'function') {
        addPendiente(dataCliente, session ? (session.nombre || session.username) : '');
        if (typeof updateBadgePendientesRegistro === 'function') updateBadgePendientesRegistro();
      }
      if (typeof guardarVehiculoRegistro === 'function') {
        guardarVehiculoRegistro({
          matricula: matriculaActual,
          modelo: modelo,
          nombreIC: nombreIC,
          convenio,
          placaServicio,
        });
      }
      const reg = { matricula: matriculaActual, modelo: modelo, nombreIC: nombreIC, convenio, placaServicio };
      aplicarRegistroACalculadora(reg);
      if (el.matriculaCalc) el.matriculaCalc.value = matriculaActual;
      document.getElementById('nuevoVehiculoWrap').style.display = 'none';
      var pasoMatriculaConjunto = document.querySelector('#pasoMatricula .paso-matricula-conjunto');
      if (pasoMatriculaConjunto) pasoMatriculaConjunto.style.display = '';
      guardarMatricula(matriculaActual);
      cargarMatriculasGuardadas();
      if (tipoServicio) {
        document.getElementById('pasoCalculadoraTitulo').textContent =
          tipoServicio === 'reparacion' ? 'Reparación' : tipoServicio === 'tuneo' ? 'Tuneo' : 'Tuneo + Reparación';
        document.getElementById('pasoCalcMatricula').textContent = matriculaActual;
        aplicarVisibilidadPorTipo();
        mostrarPaso('calculadora');
        actualizarVisibilidadPlacaServicio();
        actualizarVista();
      } else {
        mostrarPaso('inicio');
      }
    });
  }

  var btnVolverNuevoVehiculo = document.getElementById('btnVolverNuevoVehiculo');
  if (btnVolverNuevoVehiculo) {
    btnVolverNuevoVehiculo.addEventListener('click', function () {
      document.getElementById('nuevoVehiculoWrap').style.display = 'none';
      var pasoMatriculaConjunto = document.querySelector('#pasoMatricula .paso-matricula-conjunto');
      if (pasoMatriculaConjunto) pasoMatriculaConjunto.style.display = '';
    });
  }

  if (btnVolverMat) btnVolverMat.addEventListener('click', irAPantallaPrincipal);
  const btnHeaderVolver = document.getElementById('btnHeaderVolver');
  if (btnHeaderVolver) btnHeaderVolver.addEventListener('click', irAPantallaPrincipal);
  const btnCopiar = document.getElementById('btnCopiarRegistro');
  if (btnCopiar) btnCopiar.addEventListener('click', copiarRegistroCalculadora);
}

function cargarMatriculasGuardadas() {
  const desdeStorage = JSON.parse(localStorage.getItem('benny_matriculas') || '[]');
  const desdeBBDD = typeof getClientesBBDD === 'function' ? getClientesBBDD().map(c => (c.matricula || '').trim()).filter(Boolean) : [];
  const matriculas = [...new Set([...desdeBBDD, ...desdeStorage])];
  const datalist = document.getElementById('matriculaList');
  if (!datalist) return;
  datalist.innerHTML = '';
  matriculas.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    datalist.appendChild(opt);
  });
}

function guardarMatricula(mat) {
  if (!mat) return;
  let matriculas = JSON.parse(localStorage.getItem('benny_matriculas') || '[]');
  if (!matriculas.includes(mat)) {
    matriculas.unshift(mat);
    matriculas = matriculas.slice(0, 50);
    localStorage.setItem('benny_matriculas', JSON.stringify(matriculas));
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  }
}

function cambiarModelo() {
  const modelo = el.modelo.value;
  vehiculoActual = VEHICULOS_DB.find(v => v.modelo === modelo) || null;
  if (vehiculoActual) {
    el.categoria.value = vehiculoActual.categoria;
    el.nombreModelo.textContent = vehiculoActual.nombreIC;
    el.nombreIC.placeholder = vehiculoActual.nombreIC;
    var ftPrecio = typeof getPrecioVentaFullTuning === 'function' ? getPrecioVentaFullTuning(vehiculoActual.precioBase) : (vehiculoActual.fullTuningPrecio || 0);
    el.fullTuningPrecio.textContent = '$' + ftPrecio.toLocaleString('es-ES');
    actualizarImagenVehiculo(vehiculoActual.imagenUrl);
  } else {
    el.categoria.value = '';
    el.nombreModelo.textContent = '-';
    el.fullTuningPrecio.textContent = '$0';
    actualizarImagenVehiculo('');
  }
  actualizarVista();
}

function actualizarImagenVehiculo(url) {
  const img = el.imgVehiculo;
  const placeholder = el.vehiculoImagenPlaceholder;
  const fallbackText = vehiculoActual ? (vehiculoActual.nombreIC || 'Sin foto') : 'Selecciona un modelo';
  if (url && url.startsWith('http')) {
    img.src = url;
    img.style.display = 'block';
    placeholder.style.display = 'none';
    img.onerror = () => {
      img.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.querySelector('span').textContent = 'Sin imagen · ' + (vehiculoActual?.nombreIC || '');
    };
  } else {
    img.src = '';
    img.style.display = 'none';
    placeholder.style.display = 'flex';
    placeholder.querySelector('span').textContent = vehiculoActual ? 'Sin foto · ' + (vehiculoActual.nombreIC || '') : 'Selecciona un modelo';
  }
}

/** Margen de venta sobre coste de piezas de tuneo (2 = 100% margen). */
var MARGEN_VENTA_PIEZAS_TUNEO = 2;

/** Devuelve las piezas de tuneo seleccionadas por categoría (checkboxes). Suma precio de venta (lo que se cobra al cliente). */
function getSelectedPiezasTuneo() {
  var result = { kits: 0, performance: 0, custom: 0, cosmetics: 0, totalCoste: 0, piezas: [] };
  if (typeof PIEZAS_TUNING === 'undefined' || typeof getPiezaById !== 'function') return result;
  var container = document.getElementById('tuningPiezasPorCategoria');
  if (!container) return result;
  var getPrecioVenta = typeof getPrecioVentaPiezaTuneo === 'function' ? getPrecioVentaPiezaTuneo : function () { return 0; };
  var checkboxes = container.querySelectorAll('.tuning-pieza-checkbox:checked');
  checkboxes.forEach(function (cb) {
    var cat = cb.getAttribute('data-categoria');
    var piezaId = (cb.getAttribute('data-pieza-id') || '').trim();
    if (!cat || !piezaId) return;
    var pieza = getPiezaById(cat, piezaId);
    if (!pieza) return;
    var precioVenta = getPrecioVenta(cat, piezaId);
    result[cat] = (result[cat] || 0) + precioVenta;
    result.totalCoste += (typeof pieza.coste === 'number' ? pieza.coste : 0);
    result.piezas.push({ categoria: cat, piezaId: pieza.id, nombre: pieza.nombre, coste: pieza.coste, precioVenta: precioVenta });
  });
  return result;
}

function renderTuningPiezasPorCategoria() {
  var container = document.getElementById('tuningPiezasPorCategoria');
  if (!container || typeof CATEGORIAS_TUNEO === 'undefined' || typeof PIEZAS_TUNING === 'undefined') return;
  container.innerHTML = '';
  CATEGORIAS_TUNEO.forEach(function (cat) {
    var catId = cat.id;
    var piezas = PIEZAS_TUNING[catId] || [];
    var block = document.createElement('div');
    block.className = 'tuning-categoria-block';
    block.setAttribute('data-categoria', catId);
    var titulo = document.createElement('div');
    titulo.className = 'tuning-categoria-titulo';
    titulo.textContent = cat.nombre;
    var listWrap = document.createElement('div');
    listWrap.className = 'tuning-categoria-piezas-list tuning-categoria-checkboxes';
    piezas.forEach(function (p) {
      var label = document.createElement('label');
      label.className = 'tuning-pieza-checkbox-field checkbox-field';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'tuning-pieza-checkbox';
      cb.setAttribute('data-categoria', catId);
      cb.setAttribute('data-pieza-id', p.id || '');
      cb.addEventListener('change', function () { if (typeof actualizarVistaDebounced === 'function') actualizarVistaDebounced(); });
      var span = document.createElement('span');
      span.className = 'tuning-pieza-checkbox-label';
      span.textContent = p.nombre || p.id;
      label.appendChild(cb);
      label.appendChild(span);
      listWrap.appendChild(label);
    });
    block.appendChild(titulo);
    block.appendChild(listWrap);
    container.appendChild(block);
  });
}

function clearTuningPiezasLists() {
  var container = document.getElementById('tuningPiezasPorCategoria');
  if (!container) return;
  container.querySelectorAll('.tuning-pieza-checkbox').forEach(function (cb) { cb.checked = false; });
}

function calcularPrecios() {
  const desc = parseFloat(el.descuentoPorcentaje.value) || 0;
  const base = vehiculoActual ? vehiculoActual.precioBase : (CONFIG.baseReparacionSinModelo || 50000);

  let motor = 0, kits = 0, performance = 0, custom = 0, cosmetic = 0;

  if (vehiculoActual) {
    if (el.fullTuning.checked) {
      const fullTuningTotal = typeof getPrecioVentaFullTuning === 'function' ? getPrecioVentaFullTuning(base) : Math.floor(base * 0.4);
      const cuarta = Math.floor(fullTuningTotal / 4);
      motor = cuarta;
      performance = cuarta;
      custom = cuarta;
      cosmetic = fullTuningTotal - cuarta * 3;
      if (el.tuneMotor.checked) motor += Math.floor(base * CONFIG.factorPiezaTuneo);
    } else {
      if (el.tuneMotor.checked) motor = Math.floor(base * CONFIG.factorPiezaTuneo);
      var sel = getSelectedPiezasTuneo();
      kits = sel.kits || 0;
      performance = sel.performance || 0;
      custom = sel.custom || 0;
      cosmetic = sel.cosmetics || 0;
    }
  }

  const usarKit = document.getElementById('usarKitReparacion');
  const kitActivo = usarKit && usarKit.checked && (el.reparacion && el.reparacion.checked);

  let reparacion = 0;
  if (el.reparacion && el.reparacion.checked) {
    if (kitActivo) {
      reparacion = 0;
    } else {
      var precioChasis = typeof getPrecioVentaChasis === 'function' ? getPrecioVentaChasis() : 30;
      var precioEsenciales = typeof getPrecioVentaEsenciales === 'function' ? getPrecioVentaEsenciales() : 65;
      const ch = parseInt(el.partesChasis?.value, 10) || 0;
      const es = parseInt(el.partesEsenciales?.value, 10) || 0;
      reparacion = ch * precioChasis + es * precioEsenciales;
    }
  }

  let kitReparacion = 0;
  if (kitActivo) kitReparacion = CONFIG.kitReparacionPrecio || 650;

  const subtotal = motor + kits + performance + custom + cosmetic + reparacion + kitReparacion;
  const descuentoEfectivo = kitActivo ? 0 : desc;
  const total = Math.floor(subtotal * (1 - descuentoEfectivo / 100));

  return {
    motor, kits, performance, custom, cosmetic, reparacion,
    kitReparacion, subtotal, total, descuento: descuentoEfectivo,
    kitActivo: !!kitActivo,
  };
}

function renderDesglosePiezasReparacion(kitActivo) {
  var wrapChasis = document.getElementById('desglosePartesChasisWrap');
  var listChasis = document.getElementById('desglosePartesChasisList');
  var wrapEsenciales = document.getElementById('desglosePartesEsencialesWrap');
  var listEsenciales = document.getElementById('desglosePartesEsencialesList');
  if (!listChasis || !listEsenciales) return;
  var tiposChasis = typeof TIPOS_PIEZAS_CHASIS !== 'undefined' ? TIPOS_PIEZAS_CHASIS : [];
  var tiposEsenciales = typeof TIPOS_PIEZAS_ESENCIALES !== 'undefined' ? TIPOS_PIEZAS_ESENCIALES : [];
  if (kitActivo) {
    if (wrapChasis) wrapChasis.style.display = 'none';
    if (wrapEsenciales) wrapEsenciales.style.display = 'none';
    listChasis.innerHTML = '';
    listEsenciales.innerHTML = '';
    return;
  }
  var numChasis = parseInt(el.partesChasis && el.partesChasis.value, 10) || 0;
  var numEsenciales = parseInt(el.partesEsenciales && el.partesEsenciales.value, 10) || 0;
  if (numChasis > 0 && wrapChasis && listChasis) {
    wrapChasis.style.display = 'block';
    listChasis.innerHTML = '';
    for (var i = 0; i < numChasis; i++) {
      var sel = document.createElement('select');
      sel.className = 'input-piezas-select desglose-piezas-select';
      sel.setAttribute('data-desglose-index', String(i));
      sel.setAttribute('data-desglose-tipo', 'chasis');
      sel.innerHTML = '<option value="">— Seleccionar tipo —</option>' + tiposChasis.map(function (t) {
        return '<option value="' + (t.id || '').replace(/"/g, '&quot;') + '">' + (t.nombre || t.id) + '</option>';
      }).join('');
      var label = document.createElement('label');
      label.className = 'desglose-piezas-item-label';
      label.textContent = 'Pieza chasis ' + (i + 1) + ':';
      var div = document.createElement('div');
      div.className = 'desglose-piezas-item';
      div.appendChild(label);
      div.appendChild(sel);
      listChasis.appendChild(div);
    }
  } else {
    if (wrapChasis) wrapChasis.style.display = 'none';
    listChasis.innerHTML = '';
  }
  if (numEsenciales > 0 && wrapEsenciales && listEsenciales) {
    wrapEsenciales.style.display = 'block';
    listEsenciales.innerHTML = '';
    for (var j = 0; j < numEsenciales; j++) {
      var selE = document.createElement('select');
      selE.className = 'input-piezas-select desglose-piezas-select';
      selE.setAttribute('data-desglose-index', String(j));
      selE.setAttribute('data-desglose-tipo', 'esenciales');
      selE.innerHTML = '<option value="">— Seleccionar tipo —</option>' + tiposEsenciales.map(function (t) {
        return '<option value="' + (t.id || '').replace(/"/g, '&quot;') + '">' + (t.nombre || t.id) + '</option>';
      }).join('');
      var labelE = document.createElement('label');
      labelE.className = 'desglose-piezas-item-label';
      labelE.textContent = 'Pieza esencial ' + (j + 1) + ':';
      var divE = document.createElement('div');
      divE.className = 'desglose-piezas-item';
      divE.appendChild(labelE);
      divE.appendChild(selE);
      listEsenciales.appendChild(divE);
    }
  } else {
    if (wrapEsenciales) wrapEsenciales.style.display = 'none';
    listEsenciales.innerHTML = '';
  }
}

var _cacheVistaEl = null;
function _getVistaEl() {
  if (_cacheVistaEl) return _cacheVistaEl;
  _cacheVistaEl = {
    wrapTuneo: document.getElementById('wrapPresupuestoTuneo'),
    wrapRep: document.getElementById('wrapPresupuestoReparacion'),
    presupuestoChasis: document.getElementById('presupuestoChasis'),
    presupuestoEsenciales: document.getElementById('presupuestoEsenciales'),
    tplMatricula: document.getElementById('tplMatricula'),
    tplModelo: document.getElementById('tplModelo'),
    tplModTuneo: document.getElementById('tplModTuneo'),
    tplImporteTuneo: document.getElementById('tplImporteTuneo'),
    tplEmpleado: document.getElementById('tplEmpleado'),
    tplConvenio: document.getElementById('tplConvenio'),
    tplMatriculaRep: document.getElementById('tplMatriculaRep'),
    tplModeloRep: document.getElementById('tplModeloRep'),
    tplImporteRep: document.getElementById('tplImporteRep'),
    tplEmpleadoRep: document.getElementById('tplEmpleadoRep'),
    tplConvenioRep: document.getElementById('tplConvenioRep'),
  };
  return _cacheVistaEl;
}
function actualizarVista() {
  aplicarDeshabilitarPiezasPorFullTuning();
  var rep = tipoServicio === 'reparacion';
  var tuneoRep = tipoServicio === 'tuneoReparacion';
  const p = calcularPrecios();
  const matricula = (matriculaActual || (el.matriculaCalc && el.matriculaCalc.value) || (el.matricula && el.matricula.value) || '').trim() || '-';
  const modelo = typeof getModeloDisplayParaRegistro === 'function' ? getModeloDisplayParaRegistro(matricula !== '-' ? matricula : '') : (vehiculoActual?.nombreIC || '-');
  var session = getSession();
  if (el.mecanico) el.mecanico.value = session ? (session.nombre || session.username || '') : 'BASE';
  const mecanico = el.mecanico.value || 'BASE';
  if (el.matriculaCalc) el.matriculaCalc.value = matricula !== '-' ? matricula : '';
  if (el.matriculaCalcDisplay) el.matriculaCalcDisplay.textContent = matricula !== '-' ? matricula : '—';
  if (el.matriculaCalcModelo) el.matriculaCalcModelo.textContent = modelo !== '-' ? ' · ' + modelo : '';
  const neg = (el.negocios && el.negocios.value) ? el.negocios.value : 'N/A';
  const desc = (p && p.descuento != null && !isNaN(Number(p.descuento))) ? Number(p.descuento) : 0;
  const convenio = neg === 'N/A' ? 'N/A (' + desc + '%)' : neg + ' (' + desc + '%)';

  rep = tipoServicio === 'reparacion';
  const tuneo = tipoServicio === 'tuneo' || tipoServicio === 'tuneoReparacion';
  tuneoRep = tipoServicio === 'tuneoReparacion';
  const v = _getVistaEl();
  if (v.wrapTuneo) v.wrapTuneo.style.display = (tuneo || tuneoRep) ? '' : 'none';
  if (v.wrapRep) v.wrapRep.style.display = (rep || tuneoRep) ? '' : 'none';

  el.presupuestoMotor.textContent = '$' + p.motor.toLocaleString('es-ES');
  if (el.presupuestoKits) el.presupuestoKits.textContent = '$' + (p.kits || 0).toLocaleString('es-ES');
  el.presupuestoPerformance.textContent = '$' + p.performance.toLocaleString('es-ES');
  el.presupuestoCustom.textContent = '$' + p.custom.toLocaleString('es-ES');
  el.presupuestoCosmetic.textContent = '$' + p.cosmetic.toLocaleString('es-ES');
  if (rep || tuneoRep) {
    var ch = parseInt(el.partesChasis?.value, 10) || 0;
    var es = parseInt(el.partesEsenciales?.value, 10) || 0;
    if (p.kitActivo) {
      if (v.presupuestoChasis) v.presupuestoChasis.textContent = 'Incluido en kit';
      if (v.presupuestoEsenciales) v.presupuestoEsenciales.textContent = 'Incluido en kit';
    } else {
      /* Mismo cálculo que calcularPrecios(): cantidad × precio por pieza, para que el resumen coincida con el total */
      var precioChasis = typeof getPrecioVentaChasis === 'function' ? getPrecioVentaChasis() : 30;
      var precioEsenciales = typeof getPrecioVentaEsenciales === 'function' ? getPrecioVentaEsenciales() : 65;
      const costCh = ch * precioChasis;
      const costEs = es * precioEsenciales;
      if (v.presupuestoChasis) v.presupuestoChasis.textContent = '$' + costCh.toLocaleString('es-ES');
      if (v.presupuestoEsenciales) v.presupuestoEsenciales.textContent = '$' + costEs.toLocaleString('es-ES');
    }
  } else {
    if (v.presupuestoChasis) v.presupuestoChasis.textContent = '$0';
    if (v.presupuestoEsenciales) v.presupuestoEsenciales.textContent = '$0';
  }
  el.precioTotal.textContent = '$' + p.total.toLocaleString('es-ES');
  el.precioReparacion.textContent = '$' + (el.reparacion.checked ? p.reparacion.toLocaleString('es-ES') : '0');

  var presupuestoDescuento = document.getElementById('presupuestoDescuento');
  var wrapPresupuestoSubtotal = document.getElementById('wrapPresupuestoSubtotal');
  var presupuestoSubtotal = document.getElementById('presupuestoSubtotal');
  var descuentoEuros = (p.subtotal != null && p.total != null && desc > 0) ? (p.subtotal - p.total) : 0;
  var kitActivoVista = !!(p.kitActivo);
  if (presupuestoDescuento) {
    if (kitActivoVista) {
      presupuestoDescuento.textContent = 'No aplicado (kit reparación)';
    } else if (desc > 0) {
      presupuestoDescuento.textContent = desc + '% · ' + (neg || 'N/A') + ' · -' + descuentoEuros.toLocaleString('es-ES') + '€';
    } else {
      presupuestoDescuento.textContent = '0% · N/A';
    }
  }
  if (wrapPresupuestoSubtotal) wrapPresupuestoSubtotal.style.display = !kitActivoVista && desc > 0 ? '' : 'none';
  if (presupuestoSubtotal) presupuestoSubtotal.textContent = !kitActivoVista && desc > 0 ? '$' + (p.subtotal || 0).toLocaleString('es-ES') : '$0';

  var wrapRepairParts = document.getElementById('wrapRepairParts');
  if (wrapRepairParts) wrapRepairParts.style.display = kitActivoVista ? 'none' : '';
  if (typeof renderDesglosePiezasReparacion === 'function') renderDesglosePiezasReparacion(p.kitActivo);

  var wrapPresupuestoKit = document.getElementById('wrapPresupuestoKit');
  var presupuestoKit = document.getElementById('presupuestoKit');
  var kitAmount = (p.kitReparacion != null && p.kitReparacion > 0) ? p.kitReparacion : 0;
  if (wrapPresupuestoKit) wrapPresupuestoKit.style.display = kitAmount > 0 ? '' : 'none';
  if (presupuestoKit) presupuestoKit.textContent = kitAmount > 0 ? '$' + kitAmount.toLocaleString('es-ES') : '$0';

  var esPolicia = false;
  if ((rep || tuneoRep) && matricula !== '-') {
    if (typeof getClienteByMatricula === 'function') {
      var cli = getClienteByMatricula(matricula);
      if (cli) {
        var pp = (cli.placaPolicial || cli.placaServicio || '').toString().trim();
        esPolicia = pp !== '' && pp !== '-';
      }
    }
  }
  var wrapUsarKit = document.getElementById('wrapUsarKit');
  if (wrapUsarKit) wrapUsarKit.style.display = (rep || tuneoRep) && esPolicia ? 'block' : 'none';
  if (!esPolicia) {
    var ck = document.getElementById('usarKitReparacion');
    if (ck) ck.checked = false;
  }

  actualizarDescuentoSuperior();
  actualizarVisibilidadRegistroServicios();
  renderStatsVehiculo(matricula !== '-' ? matricula : '');

  const tieneTuneo = p.motor > 0 || (p.kits || 0) > 0 || p.performance > 0 || p.custom > 0 || p.cosmetic > 0 || el.fullTuning.checked;
  const modTuneo = el.reparacion.checked && tieneTuneo ? '+ Reparación' : (tieneTuneo ? 'Tuning' : '-');

  if (v.tplMatricula) v.tplMatricula.textContent = matricula;
  if (v.tplModelo) v.tplModelo.textContent = modelo;
  if (v.tplModTuneo) v.tplModTuneo.textContent = modTuneo;
  if (v.tplImporteTuneo) v.tplImporteTuneo.textContent = p.total > 0 ? p.total + '$' : '-';
  if (v.tplEmpleado) v.tplEmpleado.textContent = mecanico;
  if (v.tplConvenio) v.tplConvenio.textContent = convenio;
  if (v.tplMatriculaRep) v.tplMatriculaRep.textContent = matricula;
  if (v.tplModeloRep) v.tplModeloRep.textContent = modelo;
  if (v.tplImporteRep) v.tplImporteRep.textContent = p.reparacion > 0 ? p.total + '$' : '-';
  if (v.tplEmpleadoRep) v.tplEmpleadoRep.textContent = mecanico;
  if (v.tplConvenioRep) v.tplConvenioRep.textContent = convenio;
}
var actualizarVistaDebounced = debounce(actualizarVista, 80);

/** Devuelve el texto del registro actual de la calculadora para copiar al portapapeles */
function getTextoRegistroCalculadora() {
  const lineas = [];
  const tuneo = tipoServicio === 'tuneo' || tipoServicio === 'tuneoReparacion';
  const reparacion = tipoServicio === 'reparacion' || tipoServicio === 'tuneoReparacion';
  if (tuneo) {
    lineas.push('--- TUNEO ---');
    lineas.push('Matricula: ' + (document.getElementById('tplMatricula')?.textContent || '-'));
    lineas.push('Modelo: ' + (document.getElementById('tplModelo')?.textContent || '-'));
    lineas.push('Modificación: ' + (document.getElementById('tplModTuneo')?.textContent || '-'));
    lineas.push('Importe: ' + (document.getElementById('tplImporteTuneo')?.textContent || '-'));
    lineas.push('Empleado que realizo el servicio: ' + (document.getElementById('tplEmpleado')?.textContent || '-'));
    lineas.push('Convenio y descuento: ' + (document.getElementById('tplConvenio')?.textContent || '-'));
  }
  if (reparacion) {
    if (lineas.length) lineas.push('');
    lineas.push('--- REPARACIÓN ---');
    lineas.push('Matricula: ' + (document.getElementById('tplMatriculaRep')?.textContent || '-'));
    lineas.push('Modelo: ' + (document.getElementById('tplModeloRep')?.textContent || '-'));
    lineas.push('Modificación: Reparación');
    lineas.push('Importe: ' + (document.getElementById('tplImporteRep')?.textContent || '-'));
    lineas.push('Empleado que realizo el servicio: ' + (document.getElementById('tplEmpleadoRep')?.textContent || '-'));
    lineas.push('Convenio y descuento: ' + (document.getElementById('tplConvenioRep')?.textContent || '-'));
  }
  if (lineas.length === 0) lineas.push('Sin datos de registro.');
  return lineas.join('\n');
}

function copiarRegistroCalculadora() {
  const texto = getTextoRegistroCalculadora();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(texto).then(() => {
      const btn = document.getElementById('btnCopiarRegistro');
      if (btn) { const t = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(() => { btn.textContent = t; }, 1500); }
    }).catch(() => { fallbackCopiar(texto); });
  } else fallbackCopiar(texto);
}

function fallbackCopiar(texto) {
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); alert('Registro copiado al portapapeles.'); } catch (e) { alert('No se pudo copiar.'); }
  document.body.removeChild(ta);
}

function resetear() {
  tipoServicio = null;
  matriculaActual = '';
  mostrarPaso('matricula');
  el.modelo.selectedIndex = 0;
  cambiarModelo();
  el.nombreIC.value = '';
  el.fullTuning.checked = false;
  el.tuneMotor.checked = false;
  if (typeof clearTuningPiezasLists === 'function') clearTuningPiezasLists();
  aplicarDeshabilitarPiezasPorFullTuning();
  el.reparacion.checked = false;
  if (el.partesChasis) el.partesChasis.value = '0';
  if (el.partesEsenciales) el.partesEsenciales.value = '0';
  el.descuentoPorcentaje.value = '0';
  if (el.negocios.options.length) el.negocios.selectedIndex = 0;
  actualizarVista();
}

/** Ir a pantalla principal (inicio) y resetear para atender a un nuevo cliente. No se puede retroceder tras registrar. */
function irAPantallaPrincipal() {
  cerrarTodasPantallasSecundarias();
  tipoServicio = null;
  matriculaActual = '';
  const nv = document.getElementById('nuevoVehiculoWrap');
  if (nv) nv.style.display = 'none';
  if (el.matricula) el.matricula.value = '';
  el.modelo.selectedIndex = 0;
  cambiarModelo();
  el.nombreIC.value = '';
  el.fullTuning.checked = false;
  el.tuneMotor.checked = false;
  if (typeof clearTuningPiezasLists === 'function') clearTuningPiezasLists();
  aplicarDeshabilitarPiezasPorFullTuning();
  el.reparacion.checked = false;
  if (el.partesChasis) el.partesChasis.value = '0';
  if (el.partesEsenciales) el.partesEsenciales.value = '0';
  el.descuentoPorcentaje.value = '0';
  if (el.negocios && el.negocios.options.length) el.negocios.selectedIndex = 0;
  actualizarVista();
  mostrarPaso('inicio');
}

function limpiarUnidadesCalculadora() {
  el.fullTuning.checked = false;
  el.tuneMotor.checked = false;
  if (typeof clearTuningPiezasLists === 'function') clearTuningPiezasLists();
  aplicarDeshabilitarPiezasPorFullTuning();
  if (el.reparacion) el.reparacion.checked = (tipoServicio === 'reparacion' || tipoServicio === 'tuneoReparacion');
  if (el.partesChasis) el.partesChasis.value = '0';
  if (el.partesEsenciales) el.partesEsenciales.value = '0';
  var ckKit = document.getElementById('usarKitReparacion');
  if (ckKit) ckKit.checked = false;
  actualizarVista();
}

/** Devuelve el nombre del modelo a mostrar en el registro de reparación/tuneo y en Discord (el mismo que BBDD). Prioridad: formulario, cliente BBDD, registro vehículos, vehiculoActual. */
function getModeloDisplayParaRegistro(matricula) {
  var mat = (matricula || '').trim();
  var desdeForm = (el.nombreIC && (el.nombreIC.value || '').trim()) || '';
  if (desdeForm) return desdeForm;
  if (mat && typeof getClienteByMatricula === 'function') {
    var cli = getClienteByMatricula(mat);
    if (cli && (cli.nombreVehiculo || '').trim()) return (cli.nombreVehiculo || '').trim();
  }
  if (mat && typeof getVehiculoByMatricula === 'function') {
    var reg = getVehiculoByMatricula(mat);
    if (reg && (reg.nombreIC || '').trim()) return (reg.nombreIC || '').trim();
  }
  if (vehiculoActual && (vehiculoActual.nombreIC || '').trim()) return (vehiculoActual.nombreIC || '').trim();
  return '-';
}

/** Asegura que la matrícula esté en la BBDD de clientes; si no existe, la añade con los datos del formulario */
function ensureClienteEnBBDDSiFalta(matricula) {
  const mat = (matricula || '').trim();
  if (!mat || typeof getClienteByMatricula !== 'function' || typeof addOrUpdateClienteBBDD !== 'function') return;
  if (getClienteByMatricula(mat)) return;
  const placaEl = document.getElementById('placaServicio');
  const placaVal = (placaEl && (placaEl.value || '').trim()) || '-';
  const session = typeof getSession === 'function' ? getSession() : null;
  const nombreRegistrador = session ? (session.nombre || session.username || '') : '';
  const data = {
    matricula: mat,
    nombreRegistrador: nombreRegistrador,
    modelo: (el.modelo && el.modelo.value) || (vehiculoActual && vehiculoActual.codigo) || '',
    nombreIC: (el.nombreIC && el.nombreIC.value) || (vehiculoActual && vehiculoActual.nombreIC) || '',
    convenio: (el.negocios && el.negocios.value) || '',
    placaServicio: placaVal !== '-' ? placaVal : '',
    placaPolicial: placaVal,
    codigoVehiculo: (el.modelo && el.modelo.value) || (vehiculoActual && vehiculoActual.codigo) || '',
    nombreVehiculo: (el.nombreIC && el.nombreIC.value) || (vehiculoActual && vehiculoActual.nombreIC) || '',
    categoria: (vehiculoActual && vehiculoActual.categoria) || '',
  };
  addOrUpdateClienteBBDD(data);
}

/** Formatea ms en "X horas y Y minutos" (ej. "1 horas y 10 minutos"). */
function formatHorasYMinutos(ms) {
  if (ms == null || ms < 0) return '0 horas y 0 minutos';
  var totalMin = Math.floor(ms / 60000);
  var h = Math.floor(totalMin / 60);
  var m = totalMin % 60;
  return h + ' horas y ' + m + ' minutos';
}

/** Envía el resultado de fichaje (al fichar salida) al webhook de Discord. Semana: lunes 00:00 a domingo 23:59. */
function enviarRegistroFichajeADiscord(fichaje, session) {
  var url = (typeof CONFIG !== 'undefined' && CONFIG.discordWebhookFichajes) ? CONFIG.discordWebhookFichajes : '';
  if (!url || !fichaje || !fichaje.entrada || !fichaje.salida) return;
  var nombreIC = (session && (session.nombre || session.username)) ? (session.nombre || session.username) : (fichaje.userId || '—');
  var dEntrada = new Date(fichaje.entrada);
  var dSalida = new Date(fichaje.salida);
  var horaEntrada = String(dEntrada.getHours()).padStart(2, '0') + ':' + String(dEntrada.getMinutes()).padStart(2, '0');
  var horaSalida = String(dSalida.getHours()).padStart(2, '0') + ':' + String(dSalida.getMinutes()).padStart(2, '0');
  var msTurno = dSalida.getTime() - dEntrada.getTime();
  var horasTotalTurno = formatHorasYMinutos(msTurno);
  var horasSemanaDecimal = typeof getHorasSemana === 'function' ? getHorasSemana(fichaje.userId, dSalida) : 0;
  var totalMinSemana = Math.round(horasSemanaDecimal * 60);
  var horasAcumuladas = formatHorasYMinutos(totalMinSemana * 60000);
  var texto = '**Resultado fichaje**\n' +
    '- Nombre IC: ' + nombreIC + '\n' +
    '- Hora de Entrada: ' + horaEntrada + '\n' +
    '- Hora de Salida: ' + horaSalida + '\n' +
    '- Horas total: ' + horasTotalTurno + '\n' +
    '- Horas totales acumuladas: ' + horasAcumuladas;
  var body = JSON.stringify({ content: texto });
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }).catch(function () {});
}

/** Envía el registro de reparación/tuneo al webhook de Discord. Mismo formato que la plantilla. */
function enviarRegistroServicioADiscord(servicio) {
  var url = (typeof CONFIG !== 'undefined' && CONFIG.discordWebhookUrl) ? CONFIG.discordWebhookUrl : '';
  if (!url || !servicio) return;
  var mod = (servicio.modificacion || ((servicio.tipo || '').toUpperCase().indexOf('REPARAC') !== -1 ? 'Reparación' : '-')).toString();
  var importeVal = servicio.importe != null ? (typeof servicio.importe === 'number' ? servicio.importe : parseFloat(servicio.importe) || 0) : 0;
  var importeStr = importeVal > 0 ? importeVal.toLocaleString('es-ES') + '$' : '-';
  var content = 'Matricula: ' + (servicio.matricula || '-') + '\n' +
    'Modelo: ' + (servicio.modelo || '-') + '\n' +
    'Modificación: ' + (mod || '-') + '\n' +
    'Importe: ' + importeStr + '\n' +
    'Empleado que realizo el servicio: ' + (servicio.empleado || '-') + '\n' +
    'Convenio y descuento: ' + (servicio.convenio || '-');
  var body = JSON.stringify({ content: content });
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }).catch(function () {});
}

/** Abre el modal de fotos antes/después para registrar un tuneo. */
function abrirModalFotosTuneo() {
  const p = calcularPrecios();
  const tieneTuneo = p.motor > 0 || (p.kits || 0) > 0 || p.performance > 0 || p.custom > 0 || p.cosmetic > 0 || el.fullTuning.checked;
  if (!tieneTuneo) {
    alert('No hay ningún tuneo seleccionado.');
    return;
  }
  const mat = (matriculaActual || (el.matriculaCalc && el.matriculaCalc.value) || (el.matricula && el.matricula.value) || '').trim();
  if (!mat) {
    alert('Introduce la matrícula del vehículo.');
    return;
  }
  var inputAntes = document.getElementById('tuneoFotoAntes');
  var inputDespues = document.getElementById('tuneoFotoDespues');
  var checkConfirmo = document.getElementById('tuneoConfirmoFotosVehiculo');
  if (inputAntes) inputAntes.value = '';
  if (inputDespues) inputDespues.value = '';
  if (checkConfirmo) checkConfirmo.checked = false;
  var previewAntes = document.getElementById('tuneoPreviewAntes');
  var previewDespues = document.getElementById('tuneoPreviewDespues');
  if (previewAntes) previewAntes.innerHTML = '';
  if (previewDespues) previewDespues.innerHTML = '';
  var modal = document.getElementById('modalFotosTuneo');
  if (modal) modal.classList.add('active');
}

/** Vincula el modal de fotos del tuneo: envío, cancelar y preview. */
function vincularModalFotosTuneo() {
  var modal = document.getElementById('modalFotosTuneo');
  var btnCancelar = document.getElementById('modalFotosTuneoCancelar');
  var btnEnviar = document.getElementById('modalFotosTuneoEnviar');
  var inputAntes = document.getElementById('tuneoFotoAntes');
  var inputDespues = document.getElementById('tuneoFotoDespues');
  var checkConfirmo = document.getElementById('tuneoConfirmoFotosVehiculo');
  var previewAntes = document.getElementById('tuneoPreviewAntes');
  var previewDespues = document.getElementById('tuneoPreviewDespues');

  function cerrarModal() {
    if (modal) modal.classList.remove('active');
  }
  function leerArchivoComoBase64(file, cb) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      cb('');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () { cb(reader.result || ''); };
    reader.onerror = function () { cb(''); };
    reader.readAsDataURL(file);
  }
  if (inputAntes) {
    inputAntes.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!previewAntes) return;
      previewAntes.innerHTML = '';
      if (file && file.type && file.type.indexOf('image/') === 0) {
        var img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = 'Antes';
        img.className = 'tuneo-foto-preview-img';
        img.onload = function () { URL.revokeObjectURL(img.src); };
        previewAntes.appendChild(img);
      }
    });
  }
  if (inputDespues) {
    inputDespues.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!previewDespues) return;
      previewDespues.innerHTML = '';
      if (file && file.type && file.type.indexOf('image/') === 0) {
        var img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.alt = 'Después';
        img.className = 'tuneo-foto-preview-img';
        img.onload = function () { URL.revokeObjectURL(img.src); };
        previewDespues.appendChild(img);
      }
    });
  }
  if (btnEnviar) {
    btnEnviar.addEventListener('click', function () {
      var fileAntes = inputAntes && inputAntes.files && inputAntes.files[0];
      var fileDespues = inputDespues && inputDespues.files && inputDespues.files[0];
      if (!fileAntes || !fileDespues) {
        alert('Para registrar con fotos debes subir la foto ANTES y la foto DESPUÉS del tuneo. Usa «Registrar sin fotos» si no quieres subirlas ahora.');
        return;
      }
      if (fileAntes.type.indexOf('image/') !== 0 || fileDespues.type.indexOf('image/') !== 0) {
        alert('Solo se permiten imágenes (JPG, PNG, etc.).');
        return;
      }
      if (!checkConfirmo || !checkConfirmo.checked) {
        alert('Debes confirmar que las fotos son del vehículo tuneado.');
        return;
      }
      leerArchivoComoBase64(fileAntes, function (base64Antes) {
        leerArchivoComoBase64(fileDespues, function (base64Despues) {
          if (!base64Antes || !base64Despues) {
            alert('No se pudieron leer las imágenes.');
            return;
          }
          registrarTuneo(base64Antes, base64Despues);
          cerrarModal();
        });
      });
    });
  }
  var btnSinFotos = document.getElementById('modalFotosTuneoSinFotos');
  if (btnSinFotos) {
    btnSinFotos.addEventListener('click', function () {
      registrarTuneo(null, null);
      cerrarModal();
    });
  }
  if (btnCancelar) btnCancelar.addEventListener('click', cerrarModal);
  if (modal) {
    var closeBtn = document.getElementById('modalFotosTuneoClose');
    var backdrop = document.getElementById('modalFotosTuneoBackdrop');
    if (closeBtn) closeBtn.addEventListener('click', cerrarModal);
    if (backdrop) backdrop.addEventListener('click', cerrarModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) cerrarModal();
    });
  }
}

/**
 * Registra el tuneo. Si se pasan fotoAntes y fotoDespues (base64), se guardan en TUNNINGS.
 * @param {string} [fotoAntes] - Base64 de la foto antes del tuneo
 * @param {string} [fotoDespues] - Base64 de la foto después del tuneo
 */
function registrarTuneo(fotoAntes, fotoDespues) {
  const p = calcularPrecios();
  const tieneTuneo = p.motor > 0 || (p.kits || 0) > 0 || p.performance > 0 || p.custom > 0 || p.cosmetic > 0 || el.fullTuning.checked;
  if (!tieneTuneo) {
    alert('No hay ningún tuneo seleccionado.');
    return;
  }
  const mat = (matriculaActual || (el.matriculaCalc && el.matriculaCalc.value) || (el.matricula && el.matricula.value) || '').trim();
  if (!mat) {
    alert('Introduce la matrícula del vehículo.');
    return;
  }
  guardarMatricula(mat);
  ensureClienteEnBBDDSiFalta(mat);
  const session = getSession();
  const nombreRegistrador = session ? (session.nombre || session.username || '') : '';
  if (el.mecanico) el.mecanico.value = nombreRegistrador || '—';
  const modLabel = el.fullTuning?.checked ? 'Full Tuning' : (el.reparacion?.checked ? 'Reparación + Tuneo' : 'Tuneo');
  var piezasSel = typeof getSelectedPiezasTuneo === 'function' ? getSelectedPiezasTuneo() : {};
  var piezasTuneo = piezasSel.piezas || [];
  if (piezasTuneo.length > 0) {
    var resultTuneo = comprobarStockTuneo(piezasTuneo);
    if (!resultTuneo || !resultTuneo.ok) {
      alert(resultTuneo && resultTuneo.error ? resultTuneo.error : 'No hay stock suficiente de piezas de tuning. Añade existencias en Economía > Inventario.');
      return;
    }
  }
  const modeloDisplay = typeof getModeloDisplayParaRegistro === 'function' ? getModeloDisplayParaRegistro(mat) : (vehiculoActual?.nombreIC || '-');
  const servicio = {
    tipo: 'TUNEO',
    fecha: new Date().toISOString(),
    matricula: mat,
    modelo: modeloDisplay,
    modificacion: modLabel,
    importe: p.total,
    empleado: nombreRegistrador || el.mecanico?.value || '—',
    convenio: el.negocios.value,
    descuento: p.descuento,
    userId: session ? session.username : null,
    piezasTuneo: piezasTuneo,
  };
  registroServicios.unshift(servicio);
  saveRegistroServicios(registroServicios);
  if (piezasTuneo.length > 0 && typeof restarStockTuneo === 'function') restarStockTuneo(piezasTuneo);
  if (typeof renderInventario === 'function') renderInventario();
  if (typeof renderLimitesStock === 'function') renderLimitesStock();
  if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
  if (typeof enviarRegistroServicioADiscord === 'function') enviarRegistroServicioADiscord(servicio);
  if (typeof actualizarClienteAlRegistrarServicio === 'function') actualizarClienteAlRegistrarServicio(mat, p.total, nombreRegistrador);
  if (fotoAntes && fotoDespues && typeof addTunning === 'function') {
    addTunning({
      matricula: mat,
      modelo: servicio.modelo,
      fecha: servicio.fecha,
      usuario: nombreRegistrador || (session ? session.username : ''),
      fotoAntes: fotoAntes,
      fotoDespues: fotoDespues,
      importe: p.total,
      modificacion: modLabel,
    });
  }
  cargarMatriculasGuardadas();
  actualizarModalRegistro();
  renderStatsVehiculo(mat);
  renderStatsVehiculo('');
  renderListaResultadosCalculadora();
  abrirPantallaResultadosCalculadora();
  alert('Tuneo registrado correctamente.');
}

/** Mapeo de IDs de piezas reparación (chasis/esenciales) a conceptoId del inventario economía (control único de existencias). */
var MAPEO_PIEZAS_REPARACION_A_INVENTARIO = {
  chasis: { capo: 'carroceria_capo', maletero: 'carroceria_maletero', puerta: 'carroceria_puerta', rueda: 'esenciales_rueda', ventana: 'carroceria_cristal' },
  esenciales: { transmision: 'esenciales_transmision', bomba_direccion: 'esenciales_bomba_direccion', alternador: 'esenciales_alternador', inyector: 'esenciales_inyector', frenos: 'esenciales_frenos', radiador: 'esenciales_radiador', celulas_bateria: 'esenciales_otro', motor_electrico: 'esenciales_otro' }
};

/** Comprueba si hay stock suficiente en inventario (economía) para las piezas de la reparación. Devuelve { ok: true } o { ok: false, error: string }. */
function comprobarStockReparacion(chasisDesglose, esencialesDesglose) {
  if (typeof getStock !== 'function') return { ok: true };
  var mapCh = MAPEO_PIEZAS_REPARACION_A_INVENTARIO.chasis || {};
  var mapEs = MAPEO_PIEZAS_REPARACION_A_INVENTARIO.esenciales || {};
  var nombres = { chasis: { capo: 'Capó', maletero: 'Maletero', puerta: 'Puerta', rueda: 'Rueda', ventana: 'Cristal' }, esenciales: { transmision: 'Transmisión', bomba_direccion: 'Bomba de dirección', alternador: 'Alternador', inyector: 'Inyector', frenos: 'Frenos', radiador: 'Radiador', celulas_bateria: 'Células de batería', motor_electrico: 'Motor eléctrico' } };
  chasisDesglose = Array.isArray(chasisDesglose) ? chasisDesglose : [];
  esencialesDesglose = Array.isArray(esencialesDesglose) ? esencialesDesglose : [];
  var i, id, conceptoId, stock, nombre;
  for (i = 0; i < chasisDesglose.length; i++) {
    id = chasisDesglose[i];
    conceptoId = mapCh[id] || 'carroceria_otro';
    stock = getStock(conceptoId);
    if (stock < 1) {
      nombre = (nombres.chasis && nombres.chasis[id]) ? nombres.chasis[id] : id;
      return { ok: false, error: 'Stock insuficiente de "' + nombre + '" (carrocería). Ve a Economía > Inventario para añadir existencias.' };
    }
  }
  for (i = 0; i < esencialesDesglose.length; i++) {
    id = esencialesDesglose[i];
    conceptoId = mapEs[id] || 'esenciales_otro';
    stock = getStock(conceptoId);
    if (stock < 1) {
      nombre = (nombres.esenciales && nombres.esenciales[id]) ? nombres.esenciales[id] : id;
      return { ok: false, error: 'Stock insuficiente de "' + nombre + '" (componentes esenciales). Ve a Economía > Inventario para añadir existencias.' };
    }
  }
  return { ok: true };
}

/** Resta del inventario (economía) las piezas usadas en la reparación. Solo llamar después de comprobarStockReparacion(). */
function restarStockReparacion(chasisDesglose, esencialesDesglose) {
  if (typeof removeStock !== 'function') return;
  var mapCh = MAPEO_PIEZAS_REPARACION_A_INVENTARIO.chasis || {};
  var mapEs = MAPEO_PIEZAS_REPARACION_A_INVENTARIO.esenciales || {};
  chasisDesglose = Array.isArray(chasisDesglose) ? chasisDesglose : [];
  esencialesDesglose = Array.isArray(esencialesDesglose) ? esencialesDesglose : [];
  var i;
  for (i = 0; i < chasisDesglose.length; i++) removeStock(mapCh[chasisDesglose[i]] || 'carroceria_otro', 1);
  for (i = 0; i < esencialesDesglose.length; i++) removeStock(mapEs[esencialesDesglose[i]] || 'esenciales_otro', 1);
}

/** Mapeo piezaId de tuneo (PIEZAS_TUNING) a conceptoId inventario economía (TUNING). El resto usa tuning_otro. */
var MAPEO_PIEZAS_TUNEO_A_INVENTARIO = {
  pintura_vehiculo: 'tuning_pintura', aleron_vehiculo: 'tuning_aleron', llanta_vehiculo: 'tuning_llantas', luces_vehiculo: 'tuning_luces',
  parachoques_delantero: 'tuning_parachoque', parachoques_trasero: 'tuning_parachoque', faldon_lateral: 'tuning_aletas', neon_vehiculo: 'tuning_luces'
};

function conceptoInventarioParaPiezaTuneo(piezaId) {
  return MAPEO_PIEZAS_TUNEO_A_INVENTARIO[piezaId] || 'tuning_otro';
}

/** Comprueba stock en inventario para las piezas de tuneo seleccionadas. Devuelve { ok: true } o { ok: false, error: string }. */
function comprobarStockTuneo(piezas) {
  if (typeof getStock !== 'function' || !Array.isArray(piezas) || !piezas.length) return { ok: true };
  var requerido = {};
  piezas.forEach(function (p) {
    var cid = conceptoInventarioParaPiezaTuneo(p.piezaId || p.id);
    requerido[cid] = (requerido[cid] || 0) + 1;
  });
  var cid, stock;
  for (cid in requerido) {
    if (!requerido.hasOwnProperty(cid)) continue;
    stock = getStock(cid);
    if (stock < (requerido[cid] || 0)) return { ok: false, error: 'Stock insuficiente de piezas de tuning. Ve a Economía > Inventario para añadir existencias (Tuning).' };
  }
  return { ok: true };
}

/** Resta del inventario las piezas de tuneo usadas (1 ud por pieza). */
function restarStockTuneo(piezas) {
  if (typeof removeStock !== 'function' || !Array.isArray(piezas)) return;
  piezas.forEach(function (p) {
    removeStock(conceptoInventarioParaPiezaTuneo(p.piezaId || p.id), 1);
  });
}

function registrarReparacion() {
  const p = calcularPrecios();
  if (!el.reparacion.checked || p.reparacion === 0) {
    alert('No hay reparación seleccionada o no hay partes a reparar.');
    return;
  }
  const mat = (matriculaActual || (el.matriculaCalc && el.matriculaCalc.value) || (el.matricula && el.matricula.value) || '').trim();
  if (!mat) {
    alert('Introduce la matrícula del vehículo.');
    return;
  }
  guardarMatricula(mat);
  ensureClienteEnBBDDSiFalta(mat);
  const session = getSession();
  const nombreRegistradorRep = session ? (session.nombre || session.username || '') : '';
  if (el.mecanico) el.mecanico.value = nombreRegistradorRep || '—';
  var partesChasisReg = 0;
  var partesEsencialesReg = 0;
  var piezasChasisDesglose = [];
  var piezasEsencialesDesglose = [];
  if (p.kitActivo) {
    partesChasisReg = 20;
    partesEsencialesReg = 6;
  } else {
    partesChasisReg = parseInt(el.partesChasis?.value, 10) || 0;
    partesEsencialesReg = parseInt(el.partesEsenciales?.value, 10) || 0;
    if (partesChasisReg > 0 || partesEsencialesReg > 0) {
      var selectsChasis = document.querySelectorAll('.desglose-piezas-select[data-desglose-tipo="chasis"]');
      var selectsEsenciales = document.querySelectorAll('.desglose-piezas-select[data-desglose-tipo="esenciales"]');
      var idx;
      for (idx = 0; idx < selectsChasis.length; idx++) {
        var val = (selectsChasis[idx].value || '').trim();
        if (!val) {
          alert('Indica el tipo de cada pieza de chasis utilizada (pieza ' + (idx + 1) + ').');
          return;
        }
        piezasChasisDesglose.push(val);
      }
      for (idx = 0; idx < selectsEsenciales.length; idx++) {
        var valE = (selectsEsenciales[idx].value || '').trim();
        if (!valE) {
          alert('Indica el tipo de cada pieza esencial utilizada (pieza ' + (idx + 1) + ').');
          return;
        }
        piezasEsencialesDesglose.push(valE);
      }
      var result = comprobarStockReparacion(piezasChasisDesglose, piezasEsencialesDesglose);
      if (!result || !result.ok) {
        alert(result && result.error ? result.error : 'No hay stock suficiente para las piezas indicadas. Añade existencias en Economía > Inventario.');
        return;
      }
      restarStockReparacion(piezasChasisDesglose, piezasEsencialesDesglose);
    }
  }
  const modeloDisplayRep = typeof getModeloDisplayParaRegistro === 'function' ? getModeloDisplayParaRegistro(mat) : (vehiculoActual?.nombreIC || '-');
  const servicio = {
    tipo: 'REPARACIÓN',
    fecha: new Date().toISOString(),
    matricula: mat,
    modelo: modeloDisplayRep,
    modificacion: p.kitActivo ? 'Reparación (kit)' : 'Reparación',
    importe: p.total,
    empleado: nombreRegistradorRep || el.mecanico?.value || '—',
    convenio: el.negocios.value,
    descuento: p.descuento,
    userId: session ? session.username : null,
    partesChasis: partesChasisReg,
    partesEsenciales: partesEsencialesReg,
    partesServicio: 0,
    kitReparacion: p.kitActivo || false,
    piezasChasisDesglose: piezasChasisDesglose,
    piezasEsencialesDesglose: piezasEsencialesDesglose,
  };
  registroServicios.unshift(servicio);
  saveRegistroServicios(registroServicios);
  if (typeof renderInventario === 'function') renderInventario();
  if (typeof renderLimitesStock === 'function') renderLimitesStock();
  if (typeof renderEconomiaResumen === 'function') renderEconomiaResumen();
  if (typeof enviarRegistroServicioADiscord === 'function') enviarRegistroServicioADiscord(servicio);
  if (typeof actualizarClienteAlRegistrarServicio === 'function') actualizarClienteAlRegistrarServicio(mat, p.total, nombreRegistradorRep);
  if (session && typeof hasPermission === 'function' && !hasPermission(session, 'gestionarUsuarios')) {
    addAvisoBandejaEntrada(session.username, {
      tipo: 'reparacion_registrada',
      mensaje: 'Tienes pendiente colgar las fotos de este tuneo',
      matricula: mat,
      modelo: servicio.modelo,
      importe: p.total,
      modificacion: servicio.modificacion || 'Reparación',
    });
  }
  cargarMatriculasGuardadas();
  actualizarModalRegistro();
  renderStatsVehiculo(mat);
  renderStatsVehiculo(''); // actualizar también estadísticas generales del taller
  renderListaResultadosCalculadora();
  abrirPantallaResultadosCalculadora();
  alert('Reparación registrada correctamente.');
  if (typeof renderFormRegistrarMaterialesRecuperados === 'function' && confirm('¿Registrar materiales recuperados en el almacén?')) {
    renderFormRegistrarMaterialesRecuperados();
    var modal = document.getElementById('modalRegistrarMaterialesRecuperados');
    if (modal) modal.classList.add('active');
  }
}

function actualizarModalRegistro() {
  el.listaServicios.innerHTML = '';
  if (registroServicios.length === 0) {
    el.listaServicios.innerHTML = '<p class="no-servicios">No hay servicios registrados.</p>';
    return;
  }
  registroServicios.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'servicio-item';
    const descPct = s.descuento != null ? s.descuento : 0;
    div.innerHTML = `
      <strong>${s.tipo}</strong> - ${s.matricula} (${s.modelo}) - $${(s.importe || 0).toLocaleString('es-ES')} · Descuento: ${descPct}%
      <br><small>${s.empleado} · ${s.convenio} · ${new Date(s.fecha).toLocaleString('es-ES')}</small>
    `;
    el.listaServicios.appendChild(div);
  });
}

function getResultadoCalculadoraTitulo(s) {
  if (s.tipo === 'REPARACIÓN') return '🛠️ PLANTILLA REPARACIÓN';
  if ((s.modificacion || '').indexOf('Reparación + Tuneo') !== -1 || (s.modificacion || '').indexOf('+ Reparación') !== -1) return '🛠️ REPARACIÓN & TUNEO';
  return '🚗 PLANTILLA TUNEO';
}

function nombreEmpleadoRegistro(s) {
  const uid = (s.userId || s.empleado || '').toString().trim();
  if (!uid) return (s.empleado || '—').toString();
  const users = typeof getUsers === 'function' ? getUsers() : [];
  const u = users.find(function (x) { return (x.username || x.id || '') === uid; });
  return u ? (u.nombre || u.username || uid) : (s.empleado || uid || '—');
}

function renderListaResultadosCalculadora() {
  const cont = document.getElementById('listaResultadosCalculadora');
  if (!cont) return;
  if (registroServicios.length === 0) {
    cont.innerHTML = '<p class="no-servicios">No hay registros aún.</p>';
    return;
  }
  cont.innerHTML = registroServicios.map((s, i) => {
    const titulo = getResultadoCalculadoraTitulo(s);
    const hora = s.fecha ? new Date(s.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—';
    const descuentoPct = s.descuento != null ? Number(s.descuento) : 0;
    const empleadoNombre = nombreEmpleadoRegistro(s);
    return `
      <div class="resultado-calculadora-card" data-result-index="${i}">
        <h4 class="resultado-calculadora-titulo">${escapeHtml(titulo)}</h4>
        <p><strong>Matrícula:</strong> ${escapeHtml(s.matricula)}</p>
        <p><strong>Modelo:</strong> ${escapeHtml(s.modelo)}</p>
        <p><strong>Modificación:</strong> ${escapeHtml(s.modificacion || s.tipo)}</p>
        <p><strong>Importe:</strong> ${(s.importe || 0).toLocaleString('es-ES')}$</p>
        <p><strong>Descuento aplicado:</strong> ${descuentoPct}%</p>
        <p><strong>Convenio:</strong> ${escapeHtml(s.convenio || '—')}</p>
        <p><strong>Registrado por:</strong> ${escapeHtml(empleadoNombre)}</p>
        <p class="resultado-calculadora-hora">— ${hora}</p>
        <button type="button" class="btn btn-copy-register btn-copiar-resultado" data-index="${i}" title="Copiar este registro">📋 Copiar registro</button>
      </div>
    `;
  }).join('');

  cont.querySelectorAll('.btn-copiar-resultado').forEach(btn => {
    btn.addEventListener('click', function () {
      const idx = parseInt(this.getAttribute('data-index'), 10);
      const list = getRegistroServicios();
      const s = list[idx];
      if (!s) return;
      const titulo = getResultadoCalculadoraTitulo(s);
      const hora = s.fecha ? new Date(s.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—';
      const descuentoPct = s.descuento != null ? Number(s.descuento) : 0;
      const empleadoNombre = nombreEmpleadoRegistro(s);
      const texto = [
        titulo,
        'Matrícula: ' + (s.matricula || '—'),
        'Modelo: ' + (s.modelo || '—'),
        'Modificación: ' + (s.modificacion || s.tipo || '—'),
        'Importe: ' + (s.importe != null ? s.importe.toLocaleString('es-ES') + '$' : '—'),
        'Descuento aplicado: ' + descuentoPct + '%',
        'Convenio: ' + (s.convenio || '—'),
        'Registrado por: ' + empleadoNombre,
        hora !== '—' ? hora : '',
      ].filter(Boolean).join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(() => {
          const t = this.textContent;
          this.textContent = '✓ Copiado';
          const that = this;
          setTimeout(() => { that.textContent = t; }, 1500);
        }).catch(() => { fallbackCopiar(texto); });
      } else { fallbackCopiar(texto); }
    });
  });
}

function abrirPantallaResultadosCalculadora() {
  const pantalla = document.getElementById('pantallaResultadosCalculadora');
  if (!pantalla) return;
  cerrarTodasPantallasSecundarias();
  renderListaResultadosCalculadora();
  ocultarAppBodyMostrarSecundaria('pantallaResultadosCalculadora');
}

var _avisoBandejaActual = null;

function abrirModalAvisoFotosTuneo(aviso) {
  _avisoBandejaActual = aviso || null;
  var resumen = document.getElementById('modalAvisoFotosTuneoResumen');
  if (resumen && aviso) {
    resumen.innerHTML =
      '<p><strong>Matrícula:</strong> ' + escapeHtml(aviso.matricula || '—') + '</p>' +
      '<p><strong>Modelo:</strong> ' + escapeHtml(aviso.modelo || '—') + '</p>' +
      '<p><strong>Importe:</strong> ' + (aviso.importe != null ? (aviso.importe).toLocaleString('es-ES') + '€' : '—') + '</p>' +
      '<p><strong>Modificación:</strong> ' + escapeHtml(aviso.modificacion || 'Reparación') + '</p>';
  }
  var inputAntes = document.getElementById('avisoFotoAntes');
  var inputDespues = document.getElementById('avisoFotoDespues');
  var check = document.getElementById('avisoConfirmoFotosVehiculo');
  if (inputAntes) inputAntes.value = '';
  if (inputDespues) inputDespues.value = '';
  if (check) check.checked = false;
  var prevAntes = document.getElementById('avisoPreviewAntes');
  var prevDespues = document.getElementById('avisoPreviewDespues');
  if (prevAntes) prevAntes.innerHTML = '';
  if (prevDespues) prevDespues.innerHTML = '';
  var modal = document.getElementById('modalAvisoFotosTuneo');
  if (modal) modal.classList.add('active');
}

function cerrarModalAvisoFotosTuneo() {
  _avisoBandejaActual = null;
  var modal = document.getElementById('modalAvisoFotosTuneo');
  if (modal) modal.classList.remove('active');
}

function renderListaBandejaEntrada() {
  const cont = document.getElementById('listaBandejaEntrada');
  if (!cont) return;
  const session = typeof getSession === 'function' ? getSession() : null;
  const username = session ? session.username : null;
  const avisos = username && typeof getBandejaEntrada === 'function' ? getBandejaEntrada(username) : [];
  if (avisos.length === 0) {
    cont.innerHTML = '<p class="bandeja-entrada-empty">No tienes avisos. Al registrar una reparación se añadirá un aviso aquí.</p>';
    return;
  }
  cont.innerHTML = avisos.map(function (a) {
    const fechaStr = a.fecha ? new Date(a.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    const detalle = a.tipo === 'reparacion_registrada'
      ? (a.matricula || '') + (a.modelo ? ' · ' + a.modelo : '') + (a.importe != null ? ' — ' + (a.importe).toLocaleString('es-ES') + '€' : '')
      : (a.mensaje || '');
    const completado = !!a.completado;
    const clickable = !completado ? ' bandeja-entrada-item-clickable' : '';
    const completadoBadge = completado ? ' <span class="bandeja-entrada-completado">Completado</span>' : '';
    return (
      '<div class="bandeja-entrada-item' + clickable + '" data-id="' + escapeHtmlAttr(a.id || '') + '" data-completado="' + (completado ? '1' : '0') + '">' +
        '<div class="bandeja-entrada-item-header">' +
          '<span class="bandeja-entrada-item-tipo">' + escapeHtml(a.mensaje || 'Aviso') + completadoBadge + '</span>' +
          '<span class="bandeja-entrada-item-fecha">' + escapeHtml(fechaStr) + '</span>' +
        '</div>' +
        '<div class="bandeja-entrada-item-body">' + escapeHtml(detalle) + '</div>' +
      '</div>'
    );
  }).join('');

  cont.querySelectorAll('.bandeja-entrada-item-clickable').forEach(function (item) {
    var avisoId = item.getAttribute('data-id');
    if (!avisoId || !username) return;
    var avisosList = getBandejaEntrada(username);
    var aviso = avisosList.find(function (a) { return a.id === avisoId; });
    if (!aviso || aviso.completado) return;
    item.addEventListener('click', function () {
      abrirModalAvisoFotosTuneo(aviso);
    });
  });
}

function vincularModalAvisoFotosTuneo() {
  var modal = document.getElementById('modalAvisoFotosTuneo');
  var btnCancelar = document.getElementById('modalAvisoFotosTuneoCancelar');
  var btnEnviar = document.getElementById('modalAvisoFotosTuneoEnviar');
  var inputAntes = document.getElementById('avisoFotoAntes');
  var inputDespues = document.getElementById('avisoFotoDespues');
  var check = document.getElementById('avisoConfirmoFotosVehiculo');
  var previewAntes = document.getElementById('avisoPreviewAntes');
  var previewDespues = document.getElementById('avisoPreviewDespues');

  function leerArchivoComoBase64(file, cb) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) { cb(''); return; }
    var reader = new FileReader();
    reader.onload = function () { cb(reader.result || ''); };
    reader.onerror = function () { cb(''); };
    reader.readAsDataURL(file);
  }

  if (inputAntes) inputAntes.addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!previewAntes) return;
    previewAntes.innerHTML = '';
    if (file && file.type && file.type.indexOf('image/') === 0) {
      var img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = 'Antes';
      img.className = 'tuneo-foto-preview-img';
      img.onload = function () { URL.revokeObjectURL(img.src); };
      previewAntes.appendChild(img);
    }
  });
  if (inputDespues) inputDespues.addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!previewDespues) return;
    previewDespues.innerHTML = '';
    if (file && file.type && file.type.indexOf('image/') === 0) {
      var img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = 'Después';
      img.className = 'tuneo-foto-preview-img';
      img.onload = function () { URL.revokeObjectURL(img.src); };
      previewDespues.appendChild(img);
    }
  });

  if (btnEnviar) btnEnviar.addEventListener('click', function () {
    var aviso = _avisoBandejaActual;
    if (!aviso) { cerrarModalAvisoFotosTuneo(); return; }
    var fileAntes = inputAntes && inputAntes.files && inputAntes.files[0];
    var fileDespues = inputDespues && inputDespues.files && inputDespues.files[0];
    if (!fileAntes || !fileDespues) {
      alert('Debes subir la foto ANTES y la foto DESPUÉS del tuneo.');
      return;
    }
    if (fileAntes.type.indexOf('image/') !== 0 || fileDespues.type.indexOf('image/') !== 0) {
      alert('Solo se permiten imágenes (JPG, PNG, etc.).');
      return;
    }
    if (!check || !check.checked) {
      alert('Debes confirmar que las fotos son del vehículo.');
      return;
    }
    leerArchivoComoBase64(fileAntes, function (base64Antes) {
      leerArchivoComoBase64(fileDespues, function (base64Despues) {
        if (!base64Antes || !base64Despues) {
          alert('No se pudieron leer las imágenes.');
          return;
        }
        var session = typeof getSession === 'function' ? getSession() : null;
        var nombreReg = session ? (session.nombre || session.username || '') : '';
        if (typeof addTunning === 'function') {
          addTunning({
            matricula: aviso.matricula || '',
            modelo: aviso.modelo || '',
            fecha: aviso.fecha || new Date().toISOString(),
            usuario: nombreReg,
            fotoAntes: base64Antes,
            fotoDespues: base64Despues,
            importe: aviso.importe,
            modificacion: aviso.modificacion || 'Reparación',
          });
        }
        if (session && session.username && typeof updateAvisoBandejaEntrada === 'function') {
          updateAvisoBandejaEntrada(session.username, aviso.id, { completado: true });
        }
        cerrarModalAvisoFotosTuneo();
        if (typeof renderListaBandejaEntrada === 'function') renderListaBandejaEntrada();
        if (typeof renderTunningsGallery === 'function') renderTunningsGallery();
        alert('Fotos subidas correctamente. El aviso se ha marcado como completado.');
      });
    });
  });

  if (btnCancelar) btnCancelar.addEventListener('click', cerrarModalAvisoFotosTuneo);
  var closeBtn = document.getElementById('modalAvisoFotosTuneoClose');
  var backdrop = document.getElementById('modalAvisoFotosTuneoBackdrop');
  if (closeBtn) closeBtn.addEventListener('click', cerrarModalAvisoFotosTuneo);
  if (backdrop) backdrop.addEventListener('click', cerrarModalAvisoFotosTuneo);
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) cerrarModalAvisoFotosTuneo(); });
}

function vincularBandejaEntrada() {
  const btn = document.getElementById('btnBandejaEntrada');
  const btnHome = document.getElementById('btnBandejaEntradaHome');
  if (btn) btn.addEventListener('click', function () {
    if (typeof renderListaBandejaEntrada === 'function') renderListaBandejaEntrada();
    if (typeof cerrarTodasPantallasSecundarias === 'function') cerrarTodasPantallasSecundarias();
    if (typeof ocultarAppBodyMostrarSecundaria === 'function') ocultarAppBodyMostrarSecundaria('pantallaBandejaEntrada');
  });
  if (btnHome) btnHome.addEventListener('click', irAPantallaPrincipal);
  vincularModalAvisoFotosTuneo();
}

function vincularResultadosCalculadora() {
  const btn = document.getElementById('btnResultadosCalculadora');
  const pantalla = document.getElementById('pantallaResultadosCalculadora');
  const btnHome = document.getElementById('btnResultadosHome');
  const principal = document.getElementById('pantallaPrincipal');
  if (btn) btn.addEventListener('click', () => { renderListaResultadosCalculadora(); abrirPantallaResultadosCalculadora(); });
  if (btnHome) btnHome.addEventListener('click', irAPantallaPrincipal);
}

function renderTunningsGallery() {
  var lista = document.getElementById('listaTunnings');
  if (!lista) return;
  var tunnings = typeof getTunnings === 'function' ? getTunnings() : [];
  var session = typeof getSession === 'function' ? getSession() : null;
  var puedeEliminar = session && typeof hasPermission === 'function' && hasPermission(session, 'gestionarUsuarios');
  if (tunnings.length === 0) {
    lista.innerHTML = '<p class="no-tunnings">Aún no hay fotos de tuneos. Al registrar un tuneo se piden fotos antes y después.</p>';
    return;
  }
  lista.innerHTML = tunnings.map(function (t) {
    var fechaStr = t.fecha ? new Date(t.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    var btnEliminar = puedeEliminar ? '<button type="button" class="btn btn-outline btn-sm btn-eliminar-tunning" data-id="' + escapeHtmlAttr(t.id) + '" title="Eliminar (solo admin)">Eliminar</button>' : '';
    return (
      '<div class="tunning-card" data-id="' + escapeHtmlAttr(t.id) + '">' +
        '<div class="tunning-card-header">' +
          '<span class="tunning-card-matricula">' + escapeHtml(t.matricula || '—') + '</span> ' +
          '<span class="tunning-card-modelo">' + escapeHtml(t.modelo || '') + '</span> · ' +
          '<span class="tunning-card-fecha">' + escapeHtml(fechaStr) + '</span> · ' +
          escapeHtml(t.usuario || '') +
          (btnEliminar ? ' · ' + btnEliminar : '') +
        '</div>' +
        '<div class="tunning-card-fotos">' +
          '<div class="tunning-foto-wrap"><span class="tunning-foto-label">Antes</span><img src="' + escapeHtmlAttr(t.fotoAntes || '') + '" alt="Antes" class="tunning-foto-img"></div>' +
          '<div class="tunning-foto-wrap"><span class="tunning-foto-label">Después</span><img src="' + escapeHtmlAttr(t.fotoDespues || '') + '" alt="Después" class="tunning-foto-img"></div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
  lista.querySelectorAll('.btn-eliminar-tunning').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = this.getAttribute('data-id');
      if (!id || !confirm('¿Eliminar esta entrada de Tunnings?')) return;
      if (typeof removeTunning === 'function') removeTunning(id);
      renderTunningsGallery();
    });
  });
}

function vincularTunnings() {
  var btn = document.getElementById('btnTunnings');
  var btnHome = document.getElementById('btnTunningsHome');
  if (btn) btn.addEventListener('click', function () {
    if (typeof renderTunningsGallery === 'function') renderTunningsGallery();
    if (typeof ocultarAppBodyMostrarSecundaria === 'function') ocultarAppBodyMostrarSecundaria('pantallaTunnings');
  });
  if (btnHome) btnHome.addEventListener('click', irAPantallaPrincipal);
}

function limpiarRegistro() {
  if (confirm('¿Borrar todo el registro de servicios?')) {
    registroServicios = [];
    saveRegistroServicios([]);
    actualizarModalRegistro();
  }
}

function aplicarDeshabilitarPiezasPorFullTuning() {
  if (!el.fullTuning) return;
  const deshabilitar = el.fullTuning.checked;
  var wrap = document.getElementById('tuningPiezasPorCategoria');
  if (wrap) {
    wrap.classList.toggle('tuning-piezas-disabled', deshabilitar);
    wrap.querySelectorAll('.tuning-pieza-checkbox').forEach(function (el) { el.disabled = deshabilitar; });
    if (deshabilitar && typeof clearTuningPiezasLists === 'function') clearTuningPiezasLists();
  }
}

function vincularEventos() {
  el.modelo.addEventListener('change', cambiarModelo);
  [el.fullTuning, el.reparacion, el.tuneMotor].forEach(cb => {
    if (!cb) return;
    cb.addEventListener('change', () => {
      aplicarDeshabilitarPiezasPorFullTuning();
      actualizarVista();
    });
  });
  var usarKitRep = document.getElementById('usarKitReparacion');
  if (usarKitRep) usarKitRep.addEventListener('change', actualizarVista);
  [el.partesChasis, el.partesEsenciales, el.descuentoPorcentaje].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', actualizarVistaDebounced);
    inp.addEventListener('change', actualizarVistaDebounced);
  });
  var tuningWrap = document.getElementById('tuningPiezasPorCategoria');
  if (tuningWrap) tuningWrap.addEventListener('change', function () { actualizarVistaDebounced(); });
  const placaServicio = document.getElementById('placaServicio');
  if (placaServicio) {
    placaServicio.addEventListener('input', () => { actualizarVisibilidadPlacaServicio(); actualizarVisibilidadRegistroServicios(); });
    placaServicio.addEventListener('change', () => { actualizarVisibilidadPlacaServicio(); actualizarVisibilidadRegistroServicios(); });
  }
  el.negocios.addEventListener('change', () => {
    const opt = el.negocios.options[el.negocios.selectedIndex];
    const desc = parseInt(opt?.dataset?.descuento, 10);
    if (!isNaN(desc)) el.descuentoPorcentaje.value = desc;
    actualizarDescuentoSuperior();
    actualizarVista();
  });
  el.negocios.addEventListener('input', actualizarVistaDebounced);
  if (el.descuentoPorcentaje) el.descuentoPorcentaje.addEventListener('input', actualizarDescuentoSuperior);
  if (el.descuentoPorcentaje) el.descuentoPorcentaje.addEventListener('change', actualizarDescuentoSuperior);
  el.btnRegistrarTuneo.addEventListener('click', abrirModalFotosTuneo);
  el.btnRegistrarReparacion.addEventListener('click', registrarReparacion);
  el.btnReset.addEventListener('click', limpiarUnidadesCalculadora);
  el.modalClose.addEventListener('click', () => el.modalRegistro.classList.remove('active'));
  el.btnLimpiarRegistro.addEventListener('click', limpiarRegistro);
  el.modalRegistro.addEventListener('click', e => {
    if (e.target === el.modalRegistro) el.modalRegistro.classList.remove('active');
  });
  if (typeof renderTuningPiezasPorCategoria === 'function') renderTuningPiezasPorCategoria();
}

// Arranque: comprobar sesión y mostrar login o app
function onReady() {
  vincularPasswordToggle();
  arranqueAuth();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onReady);
} else {
  onReady();
}
