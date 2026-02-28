/**
 * Benny's Original Motor Works - Calculadora Genesis Community V3
 * Lógica de cálculo de costes de reparación y tuneo + Control de usuarios
 */

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
};

// Estado (servicios: siempre sincronizar con localStorage al cargar)
let vehiculoActual = null;
function getRegistroServicios() {
  try {
    const raw = localStorage.getItem('benny_servicios');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}
function saveRegistroServicios(arr) {
  try {
    const list = Array.isArray(arr) ? arr : [];
    localStorage.setItem('benny_servicios', JSON.stringify(list));
  } catch (e) {
    console.warn('saveRegistroServicios', e);
  }
}
let registroServicios = getRegistroServicios();
const CREDENTIALS_STORAGE = 'benny_remember_credentials';
const LOGIN_USUARIOS_STORAGE = 'benny_login_usuarios';
const LOGIN_USUARIOS_MAX = 10;
const PENDING_USER_UPDATES_STORAGE = 'benny_pending_user_updates';

const PANTALLAS_SECUNDARIAS_IDS = ['pantallaFichajes', 'pantallaGestion', 'pantallaOrganigrama', 'pantallaRegistroClientes', 'pantallaResultadosCalculadora', 'pantallaFichaTrabajador'];

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
  try { localStorage.setItem(MEDIA_PENDING_STORAGE, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch (e) {}
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
  try { localStorage.setItem(MEDIA_APPROVED_STORAGE, JSON.stringify(Array.isArray(arr) ? arr : [])); } catch (e) {}
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
  PANTALLAS_SECUNDARIAS_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (appBody) appBody.style.display = 'flex';
  if (principal) principal.style.display = 'block';
  actualizarLedFichaje();
  if (typeof paso !== 'undefined') {
    if (paso === 'calculadora' && matriculaActual) renderStatsVehiculo(matriculaActual);
    else if (paso === 'inicio') requestAnimationFrame(function () { renderStatsVehiculo(''); });
  }
}

function ocultarAppBodyMostrarSecundaria(pantallaId) {
  const appBody = document.getElementById('appBody');
  const pantalla = document.getElementById(pantallaId);
  if (appBody) appBody.style.display = 'none';
  if (pantalla) pantalla.style.display = 'flex';
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

// Elementos DOM (matricula = paso 1; matriculaCalc = paso 2 readonly)
const el = {
  modelo: document.getElementById('modelo'),
  categoria: document.getElementById('categoria'),
  nombreIC: document.getElementById('nombreIC'),
  nombreModelo: document.getElementById('nombreModelo'),
  fullTuning: document.getElementById('fullTuning'),
  fullTuningPrecio: document.getElementById('fullTuningPrecio'),
  tuneMotor: document.getElementById('tuneMotor'),
  piezasPerformance: document.getElementById('piezasPerformance'),
  piezasCustom: document.getElementById('piezasCustom'),
  piezasCosmetic: document.getElementById('piezasCosmetic'),
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
  const btnAdmin = document.getElementById('btnAdminPanel');
  if (btnAdmin) btnAdmin.style.display = (hasPermission(user, 'gestionarUsuarios') || hasPermission(user, 'gestionarEquipo') || hasPermission(user, 'gestionarCompras')) ? '' : 'none';
  const btnRegistroClientes = document.getElementById('btnRegistroClientes');
  if (btnRegistroClientes) btnRegistroClientes.style.display = '';
  var puedeGestionarClientes = hasPermission(user, 'gestionarRegistroClientes');
  document.querySelectorAll('.registro-clientes-tab[data-tab="bbdd"], .registro-clientes-tab[data-tab="vetados"], .registro-clientes-tab[data-tab="pendientes"]').forEach(function (t) {
    t.style.display = puedeGestionarClientes ? '' : 'none';
  });
  const btnFichaTrabajador = document.getElementById('btnFichaTrabajador');
  if (btnFichaTrabajador) btnFichaTrabajador.style.display = hasPermission(user, 'gestionarUsuarios') ? 'none' : '';
  const btnMiHistorial = document.getElementById('btnMiHistorial');
  if (btnMiHistorial) btnMiHistorial.style.display = hasPermission(user, 'gestionarUsuarios') ? 'none' : '';
  const btnSubirVideo = document.getElementById('btnSubirVideo');
  if (btnSubirVideo) btnSubirVideo.style.display = user ? '' : 'none';
  const btnNormativas = document.getElementById('btnNormativas');
  if (btnNormativas) btnNormativas.style.display = user ? '' : 'none';
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
  const servicios = getRegistroServicios().slice(0, 10);
  if (servicios.length === 0) {
    list.innerHTML = '<li class="no-ultimas">No hay reparaciones ni tuneos recientes.</li>';
    return;
  }
  list.innerHTML = servicios.map(s => {
    const fecha = s.fecha ? new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const tipo = (s.tipo || '').toLowerCase();
    const label = tipo === 'reparación' ? 'Rep.' : tipo === 'tuneo' ? 'Tuneo' : (s.tipo || '—');
    const mat = (s.matricula || '—').toString();
    const imp = s.importe != null ? s.importe.toLocaleString('es-ES') + ' €' : '—';
    return '<li><span>' + escapeHtml(mat) + ' · ' + escapeHtml(label) + ' · ' + imp + '</span><span class="ultimas-rep-fecha">' + escapeHtml(fecha) + '</span></li>';
  }).join('');
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
  if (!hasLeidoTodasNormativas(user.id)) {
    var ls2 = document.getElementById('loginScreen');
    var ns = document.getElementById('normativasScreen');
    var app = document.getElementById('appContent');
    if (ls2) ls2.style.display = 'none';
    if (ns) ns.style.display = 'flex';
    if (app) app.style.display = 'none';
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
  if (!hasLeidoTodasNormativas(currentSession.id)) {
    document.getElementById('normativasScreen').style.display = 'flex';
    document.getElementById('appContent').style.display = 'none';
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
  const centerName = document.getElementById('headerUserNameText');
  if (centerName) centerName.textContent = (u && (u.nombre || u.username)) || '';
  if (u) aplicarPermisos(u);
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
}

function manejarLogout() {
  logout();
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appContent').style.display = 'none';
  document.getElementById('cambioPasswordScreen').style.display = 'none';
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
  if (typeof ensureSeedUsers === 'function') {
    ensureSeedUsers().then(function () {
      arranqueAuthContinuar();
    });
  } else {
    arranqueAuthContinuar();
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
  var ticketWrap = document.getElementById('loginTicketWrap');
  var ticketNumeroEl = document.getElementById('loginTicketNumero');
  var DISCORD_CREDENCIALES_URL = 'https://discord.com/channels/1476281294932676832/1476281295880323176';
  if (btnOlvidaste && ticketWrap && ticketNumeroEl) {
    btnOlvidaste.addEventListener('click', function () {
      var now = new Date();
      var y = now.getFullYear();
      var m = String(now.getMonth() + 1).padStart(2, '0');
      var d = String(now.getDate()).padStart(2, '0');
      var h = String(now.getHours()).padStart(2, '0');
      var min = String(now.getMinutes()).padStart(2, '0');
      var rnd = Math.random().toString(36).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4);
      var ticketId = 'SALT-' + y + m + d + '-' + h + min + '-' + rnd;
      ticketNumeroEl.textContent = ticketId;
      ticketWrap.style.display = 'block';
      window.open(DISCORD_CREDENCIALES_URL, '_blank', 'noopener,noreferrer');
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
  if (!hasPermission(session, 'gestionarUsuarios') && !hasPermission(session, 'gestionarEquipo') && !hasPermission(session, 'gestionarCompras')) return;
  const btnAdmin = document.getElementById('btnAdminPanel');
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
      var visible = (t === 'usuarios' && puedeUsuarios) || (t === 'convenios' && puedeConvenios) || (t === 'economia' && puedeEconomia) || (t === 'solicitudes-graficas' && puedeSolicitudes) || (t === 'reset' && puedeReset);
      tab.style.display = visible ? '' : 'none';
    });
    document.querySelectorAll('.gestion-card').forEach(function (card) {
      var t = card.dataset.tab;
      var visible = (t === 'usuarios' && puedeUsuarios) || (t === 'convenios' && puedeConvenios) || (t === 'economia' && puedeEconomia) || (t === 'solicitudes-graficas' && puedeSolicitudes) || (t === 'organigrama' && puedeOrganigrama) || (t === 'reset' && puedeReset);
      card.style.display = visible ? '' : 'none';
    });
    document.querySelectorAll('.economia-tab').forEach(function (tab) {
      var t = tab.dataset.economiaTab;
      var soloAdmin = (t === 'gastos' || t === 'previsiones' || t === 'piezas' || t === 'financiera');
      tab.style.display = (soloAdmin && !hasPermission(s, 'gestionarUsuarios')) ? 'none' : '';
    });
  }

  var gestionMenuEl = document.getElementById('gestionMenu');
  var gestionContenidoEl = document.getElementById('gestionContenido');
  var gestionContenidoTituloEl = document.getElementById('gestionContenidoTitulo');
  var titulosGestion = { usuarios: 'Empleados', convenios: 'Convenios', economia: 'Economía', 'solicitudes-graficas': 'Solicitudes', reset: 'Reset / Limpiar datos' };

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

  document.querySelectorAll('.gestion-card').forEach(function(card) {
    card.addEventListener('click', function() {
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
  document.getElementById('btnNuevoConvenio')?.addEventListener('click', () => abrirFormConvenio());

  document.getElementById('modalConvenioClose')?.addEventListener('click', () => document.getElementById('modalConvenio').classList.remove('active'));
  document.getElementById('modalConvenio')?.addEventListener('click', e => { if (e.target === document.getElementById('modalConvenio')) document.getElementById('modalConvenio').classList.remove('active'); });
  document.getElementById('formConvenio')?.addEventListener('submit', guardarConvenio);
  modalUsuarioClose?.addEventListener('click', () => modalUsuario.classList.remove('active'));
  modalUsuario?.addEventListener('click', e => { if (e.target === modalUsuario) modalUsuario.classList.remove('active'); });
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
      localStorage.setItem('benny_economia_inventario', '[]');
      localStorage.setItem('benny_economia_gastos', '[]');
      localStorage.setItem('benny_economia_previsiones', '{}');
      localStorage.setItem('benny_economia_limites_stock', '{}');
      localStorage.setItem('benny_economia_reparto_beneficios', '');
    } catch (e) {}
  }
  if (seccion === 'clientes' || seccion === 'todo') {
    try {
      localStorage.setItem('benny_clientes_bbdd', '[]');
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

function vincularResetDatos() {
  document.querySelectorAll('.btn-reset-section').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var seccion = this.getAttribute('data-reset');
      if (seccion && typeof ejecutarReset === 'function') ejecutarReset(seccion);
    });
  });
}

// ========== ECONOMÍA (compras, inventario, gastos, previsiones, almacén) ==========
function mostrarSubpanelEconomia(subtab) {
  var tabs = ['resumen', 'compras', 'inventario', 'limites', 'gastos', 'previsiones', 'historial', 'entregas', 'almacen', 'piezas', 'financiera'];
  tabs.forEach(function (t) {
    var id = t === 'resumen' ? 'economiaResumen' : 'economia' + (t.charAt(0).toUpperCase() + t.slice(1));
    var el = document.getElementById(id);
    if (el) el.style.display = t === subtab ? '' : 'none';
  });
  document.querySelectorAll('.economia-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.economiaTab === subtab); });
  if (subtab === 'resumen') renderEconomiaResumen();
  if (subtab === 'compras') renderComprasPendientes();
  if (subtab === 'inventario') renderInventario();
  if (subtab === 'limites') renderLimitesStock();
  if (subtab === 'gastos') renderGastos();
  if (subtab === 'previsiones') renderPrevisiones();
  if (subtab === 'historial') renderHistorialPedidos();
  if (subtab === 'entregas') renderEntregasMaterial();
  if (subtab === 'almacen') renderAlmacenMateriales();
  if (subtab === 'piezas') renderPreciosPiezas();
  if (subtab === 'financiera') renderEconomiaFinanciera();
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
      var q = stock[t.id] != null ? stock[t.id] : 0;
      tr.innerHTML = '<td>' + escapeHtml(t.nombre) + '</td><td>' + escapeHtml(t.unidad) + '</td><td>' + Number(q).toLocaleString('es-ES') + '</td>';
      tbody.appendChild(tr);
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

function renderInventario() {
  var tbody = document.getElementById('listaInventario');
  if (!tbody || typeof getInventario !== 'function') return;
  var list = getInventario();
  var q = (document.getElementById('filtroEconomiaInventario') && document.getElementById('filtroEconomiaInventario').value) || '';
  if (q) {
    q = q.trim().toLowerCase();
    var catMap = (typeof CATEGORIA_INVENTARIO !== 'undefined' ? CATEGORIA_INVENTARIO : []).reduce(function (o, c) { o[c.id] = ((c.grupo ? c.grupo + ' ' : '') + (c.nombre || c.id)).toLowerCase(); return o; }, {});
    list = list.filter(function (i) {
      var conceptoLabel = (catMap[i.categoria] || '') || (i.nombre || '');
      var texto = [(i.solicitante || ''), (i.nombre || ''), conceptoLabel].join(' ').toLowerCase();
      return texto.indexOf(q) !== -1;
    });
  }
  var categorias = (typeof CATEGORIA_INVENTARIO !== 'undefined' ? CATEGORIA_INVENTARIO : []).reduce(function (o, c) { o[c.id] = (c.grupo ? c.grupo + ' · ' : '') + (c.nombre || c.id); return o; }, {});
  tbody.innerHTML = '';
  list.forEach(function (i) {
    var tr = document.createElement('tr');
    var ult = i.ultimaActualizacion ? new Date(i.ultimaActualizacion).toLocaleDateString('es-ES') : '—';
    var conceptoLabel = categorias[i.categoria] || i.nombre || '—';
    var sobreMax = (i.stockMaximo != null && i.stockMaximo > 0 && (i.cantidad || 0) >= i.stockMaximo);
    var bajoMin = (i.stockMinimo != null && i.stockMinimo > 0 && (i.cantidad || 0) <= i.stockMinimo);
    var alerta = bajoMin ? ' <span class="economia-alerta-badge economia-alerta-bajo">Bajo</span>' : (sobreMax ? ' <span class="economia-alerta-badge economia-alerta-alto">Alto</span>' : '');
    var cantPedir = (i.cantidadAPedir != null && i.cantidadAPedir !== '') ? Number(i.cantidadAPedir) : '—';
    var maxLabel = (i.stockMaximo != null && i.stockMaximo !== '') ? Number(i.stockMaximo) : '—';
    tr.innerHTML = '<td>' + escapeHtml(i.solicitante || '—') + '</td><td>' + escapeHtml(conceptoLabel) + alerta + '</td><td>' + cantPedir + '</td><td>' + (i.cantidad || 0) + ' ' + (i.unidad || 'ud') + '</td><td>' + (i.stockMinimo || 0) + '</td><td>' + maxLabel + '</td><td>' + escapeHtml(ult) + '</td><td><button type="button" class="btn btn-outline btn-sm btn-edit-inv" data-id="' + escapeHtmlAttr(i.id) + '">Editar</button> <button type="button" class="btn btn-outline btn-sm btn-del-inv" data-id="' + escapeHtmlAttr(i.id) + '">Eliminar</button></td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-edit-inv').forEach(function (btn) { btn.addEventListener('click', function () { abrirModalInventario(btn.getAttribute('data-id')); }); });
  tbody.querySelectorAll('.btn-del-inv').forEach(function (btn) { btn.addEventListener('click', function () { var id = btn.getAttribute('data-id'); if (id && confirm('¿Eliminar?')) { if (typeof removeInventarioItem === 'function') removeInventarioItem(id); renderInventario(); renderEconomiaResumen(); } }); });
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
    var i = getInventario().find(function (x) { return x.id === id; });
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
  document.querySelectorAll('.economia-tab').forEach(function (tab) {
    tab.addEventListener('click', function () { mostrarSubpanelEconomia(tab.dataset.economiaTab); });
  });
  var btnReparto = document.getElementById('btnGuardarRepartoBeneficios');
  if (btnReparto) btnReparto.addEventListener('click', function () {
    var ta = document.getElementById('economiaRepartoBeneficios');
    if (ta) try { localStorage.setItem(REPARTO_BENEFICIOS_STORAGE, (ta.value || '').trim()); alert('Reparto de beneficios guardado.'); } catch (e) { alert('No se pudo guardar.'); }
  });
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
  if (filtroCompras) { filtroCompras.addEventListener('input', renderComprasPendientes); filtroCompras.addEventListener('change', renderComprasPendientes); }
  if (filtroInv) { filtroInv.addEventListener('input', renderInventario); filtroInv.addEventListener('change', renderInventario); }
  if (filtroGastos) { filtroGastos.addEventListener('input', renderGastos); filtroGastos.addEventListener('change', renderGastos); }
  var filtroHistorial = document.getElementById('filtroHistorialTipo');
  if (filtroHistorial) { filtroHistorial.addEventListener('change', function () { if (typeof renderHistorialPedidos === 'function') renderHistorialPedidos(); }); }
  var filtroHistorialCat = document.getElementById('filtroHistorialCategoria');
  if (filtroHistorialCat) { filtroHistorialCat.addEventListener('change', function () { if (typeof renderHistorialPedidos === 'function') renderHistorialPedidos(); }); }
  var filtroEntregas = document.getElementById('filtroEntregasMaterial');
  if (filtroEntregas) { filtroEntregas.addEventListener('input', function () { if (typeof renderEntregasMaterial === 'function') renderEntregasMaterial(); }); filtroEntregas.addEventListener('change', function () { if (typeof renderEntregasMaterial === 'function') renderEntregasMaterial(); }); }
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
    addEntregaMaterial({
      fecha: (document.getElementById('entregaFecha') && document.getElementById('entregaFecha').value) || new Date().toISOString(),
      trabajadorId: partsT[0] || '',
      trabajadorNombre: partsT[1] || (selTrab && selTrab.selectedOptions[0] ? selTrab.selectedOptions[0].textContent : ''),
      materialConcepto: partsM[0] || '',
      materialLabel: partsM[1] || (selMat && selMat.selectedOptions[0] ? selMat.selectedOptions[0].textContent : ''),
      cantidad: parseFloat(document.getElementById('entregaCantidad') && document.getElementById('entregaCantidad').value) || 1,
      unidad: (document.getElementById('entregaUnidad') && document.getElementById('entregaUnidad').value) || 'ud',
      entregadoPorId: session ? (session.id || session.username || '') : '',
      entregadoPorNombre: session ? (session.nombre || session.username || '') : (document.getElementById('entregaEntregadoPor') && document.getElementById('entregaEntregadoPor').value) || ''
    });
    document.getElementById('modalEntregaMaterial').classList.remove('active');
    if (typeof renderEntregasMaterial === 'function') renderEntregasMaterial();
    if (window._entregaDesdeFichaUserId && typeof renderMaterialEntregadoEnFicha === 'function') {
      renderMaterialEntregadoEnFicha(window._entregaDesdeFichaUserId);
      window._entregaDesdeFichaUserId = null;
    }
  });
  var btnRegistrarEntregaDesdeFicha = document.getElementById('btnRegistrarEntregaDesdeFicha');
  if (btnRegistrarEntregaDesdeFicha) btnRegistrarEntregaDesdeFicha.addEventListener('click', function () {
    var modalUsuario = document.getElementById('modalUsuario');
    var userId = modalUsuario && modalUsuario.getAttribute('data-usuario-ficha-id');
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
      if (id && typeof getInventario === 'function') {
        var existing = getInventario().find(function (x) { return x.id === id; });
        if (existing) { stockMinVal = existing.stockMinimo != null ? existing.stockMinimo : 0; stockMaxVal = existing.stockMaximo != null ? existing.stockMaximo : null; }
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
}
function escapeHtmlAttr(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
  if (progressWrap) progressWrap.style.display = obligatorio ? 'block' : 'none';
  if (footer) footer.style.display = 'none';
  if (subtitle) subtitle.textContent = obligatorio ? 'Es obligatorio leer todas las páginas de cada documento antes de acceder al taller.' : 'Consulta las normativas del taller.';
  if (btnCerrar) btnCerrar.style.display = obligatorio ? 'none' : 'block';
  renderNormativasList();
  showNormativasList();
  if (!window._normativasUiBound) {
    bindNormativasContinuar();
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarNormativasConsulta);
    window._normativasUiBound = true;
  }
}

function showNormativasList() {
  document.getElementById('normativasListWrap').style.display = '';
  document.getElementById('normativasReaderWrap').style.display = 'none';
  document.getElementById('normativasFooter').style.display = _normativasObligatorio && hasLeidoTodasNormativas(_normativasUserId) ? 'block' : 'none';
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
  if (footer && _normativasObligatorio) footer.style.display = hasLeidoTodasNormativas(_normativasUserId) ? 'block' : 'none';
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

  function mostrarPanelRegistro(tab) {
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
    if (tab === 'bbdd') renderTablaClientesBBDD();
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
      card.innerHTML = '<div class="ficha-cliente-card-nombre">' + escapeHtml(r.matricula || '—') + '</div><div class="ficha-cliente-card-meta">' + escapeHtml(marcaModelo) + '</div><div class="ficha-cliente-card-vehiculos">Ver ficha</div>';
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
      return '<li class="lista-vetados-item">' + escapeHtml(c.nombrePropietario) + ' · ' + escapeHtml(c.matricula) + ' <button type="button" class="btn btn-outline btn-sm btn-ver-ficha-vetado" data-id="' + escapeHtmlAttr(c.idCliente) + '">Ver ficha</button></li>';
    }).join('');
    listMor.innerHTML = morosos.length === 0 ? '<li class="lista-vetados-empty">Ningún cliente moroso.</li>' : morosos.map(function (c) {
      return '<li class="lista-vetados-item">' + escapeHtml(c.nombrePropietario) + ' · ' + escapeHtml(c.matricula) + ' <button type="button" class="btn btn-outline btn-sm btn-ver-ficha-vetado" data-id="' + escapeHtmlAttr(c.idCliente) + '">Ver ficha</button></li>';
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
          else localStorage.setItem('benny_clientes_bbdd', JSON.stringify(arr));
        } catch (e) { console.warn('renderTablaClientesBBDD seed', e); }
        list = typeof getClientesBBDD === 'function' ? getClientesBBDD() : arr;
      }
    }
    if (!Array.isArray(list)) list = [];
    var filtroBBDD = (document.getElementById('filtroTablaBBDD') && document.getElementById('filtroTablaBBDD').value) || '';
    list = list.filter(function (c) { return cumpleFiltroCliente(c, filtroBBDD); });
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
      var tr = document.createElement('tr');
      tr.setAttribute('data-mat', (cli.matricula || '').trim());
      tr.innerHTML = '<td>' + escapeHtml(idCliente) + '</td><td>' + escapeHtml(cli.matricula) + '</td><td>' + escapeHtml(cli.nombreRegistrador || '—') + '</td><td>' + escapeHtml(cli.telefonoCliente || '—') + '</td><td>' + escapeHtml(cli.nombrePropietario || '—') + '</td><td>' + escapeHtml(cli.numeroSocioLSCM || '—') + '</td><td>' + escapeHtml(cli.placaPolicial || '—') + '</td><td>' + escapeHtml(cli.codigoVehiculo || '—') + '</td><td>' + escapeHtml(cli.nombreVehiculo || '—') + '</td><td>' + escapeHtml(cli.categoria || '—') + '</td><td>' + escapeHtml(cli.convenio || '—') + '</td><td class="col-estado">' + estadoBadges + '</td><td>' + f1 + '</td><td>' + f2 + '</td><td>' + (cli.interacciones ?? 0) + '</td><td>' + (cli.totalInvertido ?? 0).toLocaleString('es-ES') + ' €</td><td><button type="button" class="btn btn-outline btn-sm btn-ver-ficha" data-id="' + escapeHtml(idCliente) + '" title="Ver ficha">Ficha</button> <button type="button" class="btn btn-outline btn-sm btn-editar-cliente" data-mat="' + escapeHtml(cli.matricula) + '">Editar</button></td>';
      fragment.appendChild(tr);
    }
    tbody.innerHTML = '';
    tbody.appendChild(fragment);
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

  function abrirModalEditarCliente(cli) {
    if (!cli) return;
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
    setVal('editarClienteCodigo', cli.codigoVehiculo || '');
    setVal('editarClienteNombre', cli.nombreVehiculo || '');
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
      });
      card.querySelector('.btn-rechazar-pendiente')?.addEventListener('click', function() {
        const id = this.dataset.pendId;
        if (typeof rechazarPendiente === 'function') { rechazarPendiente(id); }
        renderPendientesRegistro();
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
      const nombre = (first.nombrePropietario || '').trim() || (first.matricula || 'Sin nombre');
      const telefono = (first.telefonoCliente || '').trim() || '—';
      const card = document.createElement('div');
      card.className = 'ficha-cliente-card';
      card.innerHTML = '<div class="ficha-cliente-card-nombre">' + escapeHtml(nombre) + '</div><div class="ficha-cliente-card-meta">' + escapeHtml(telefono) + ' · ' + escapeHtml(id) + '</div><div class="ficha-cliente-card-vehiculos">' + rows.length + ' vehículo(s)</div>';
      card.addEventListener('click', function () {
        if (typeof abrirModalFichaCliente === 'function') abrirModalFichaCliente(id);
      });
      cont.appendChild(card);
    });
    if (ids.length === 0) cont.innerHTML = '<p class="no-fichas">' + (filtroFichas ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes registrados.') + '</p>';
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
    headerEl.innerHTML = '<div class="ficha-header-row"><strong>ID:</strong> ' + escapeHtml(idCliente) + '</div>' +
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
      div.innerHTML = '<h4 class="ficha-vehiculo-mat">' + escapeHtml(mat) + ' — ' + marcaModeloLabel + '</h4>' +
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
  if (filtroFichasEl) filtroFichasEl.addEventListener('input', function () { if (typeof renderFichasClientes === 'function') renderFichasClientes(); });
  if (filtroFichasEl) filtroFichasEl.addEventListener('change', function () { if (typeof renderFichasClientes === 'function') renderFichasClientes(); });
  if (filtroBBDDEl) filtroBBDDEl.addEventListener('input', function () { renderTablaClientesBBDD(); });
  if (filtroBBDDEl) filtroBBDDEl.addEventListener('change', function () { renderTablaClientesBBDD(); });
  if (filtroPendEl) filtroPendEl.addEventListener('input', function () { renderPendientesRegistro(); });
  if (filtroPendEl) filtroPendEl.addEventListener('change', function () { renderPendientesRegistro(); });

  document.getElementById('modalEditarClienteClose')?.addEventListener('click', () => document.getElementById('modalEditarCliente').classList.remove('active'));
  document.getElementById('modalEditarCliente')?.addEventListener('click', e => { if (e.target?.id === 'modalEditarCliente') document.getElementById('modalEditarCliente').classList.remove('active'); });
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
    const matOriginal = document.getElementById('editarClienteMatriculaOriginal').value;
    const session = typeof getSession === 'function' ? getSession() : null;
    const isAdmin = session && typeof hasPermission === 'function' && hasPermission(session, 'gestionarRegistroClientes');
    const data = {
      idCliente: document.getElementById('editarClienteIdCliente').value.trim(),
      matricula: document.getElementById('editarClienteMatricula').value.trim(),
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
    if (isAdmin) {
      data.placaPolicial = document.getElementById('editarClientePlaca').value.trim() || '-';
      data.codigoVehiculo = document.getElementById('editarClienteCodigo').value.trim();
      data.nombreVehiculo = document.getElementById('editarClienteNombre').value.trim();
      data.categoria = document.getElementById('editarClienteCategoria').value.trim();
      data.convenio = document.getElementById('editarClienteConvenio').value.trim();
      data.fechaPrimeraInteraccion = document.getElementById('editarClienteFechaPrimera').value || null;
      data.fechaUltimaActualizacion = document.getElementById('editarClienteFechaUltima').value || null;
      data.interacciones = parseInt(document.getElementById('editarClienteInteracciones').value, 10) || 0;
      data.totalInvertido = parseFloat(document.getElementById('editarClienteTotal').value) || 0;
    }
    if (typeof getClientesBBDD === 'function' && typeof addOrUpdateClienteBBDD === 'function') {
      const list = getClientesBBDD();
      const idx = list.findIndex(c => (c.matricula || '').trim().toUpperCase() === (matOriginal || '').trim().toUpperCase());
      const existing = idx >= 0 ? list[idx] : null;
      if (existing && data.matricula.toUpperCase() !== matOriginal.trim().toUpperCase()) {
        list.splice(idx, 1);
        localStorage.setItem('benny_clientes_bbdd', JSON.stringify(list));
      }
      addOrUpdateClienteBBDD({ ...existing, ...data });
    }
    document.getElementById('modalEditarCliente').classList.remove('active');
    renderTablaClientesBBDD();
    if (typeof renderFichasClientes === 'function') renderFichasClientes();
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
        modalUsuario.classList.remove('active');
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
    if (modalUsuario) modalUsuario.classList.remove('active');
    renderListaUsuarios();
    renderAprobacionesPendientes();
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
  const minimo = HORAS_MINIMAS_SEMANA;
  const pct = Math.min(100, (horas / minimo) * 100);
  const bar = document.getElementById('barHorasSemana');
  const textHoras = document.getElementById('textHorasSemana');
  if (bar) bar.style.width = pct + '%';
  if (textHoras) textHoras.textContent = horas.toFixed(1) + 'h / ' + minimo + 'h mín.';

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
    eventos.push({ type: 'entrada', date: f.entrada, userId: f.userId, nombre: nombre });
    if (f.salida) eventos.push({ type: 'salida', date: f.salida, userId: f.userId, nombre: nombre });
  });
  eventos.sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });
  return eventos;
}

function renderListaFichajesReciente(userId, listId) {
  const list = document.getElementById(listId || 'listaFichajesReciente');
  if (!list) return;
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
    return '<div class="fichaje-item ' + (ev.type === 'entrada' ? 'fichaje-item-entrada' : 'fichaje-item-salida') + '">' + icon + '<span class="fichaje-card-nombre">' + escapeHtml(nombreUpper) + '</span><span class="fichaje-card-fecha">' + escapeHtml(dateStr) + '</span><span class="fichaje-card-hora">' + escapeHtml(timeStr) + '</span></div>';
  }).join('');
}

function renderTablaRendimiento() {
  const wrap = document.getElementById('tablaRendimiento');
  if (!wrap) return;
  const rows = getRendimientoEmpleados();
  wrap.innerHTML = '<table><thead><tr><th>Trabajador</th><th>Horas/sem</th><th>Servicios (hoy/sem/total)</th><th>Facturado total</th><th>Indicadores</th></tr></thead><tbody>' +
    rows.map(r => '<tr><td>' + escapeHtml(r.nombre) + '</td><td>' + r.horas.toFixed(1) + 'h</td><td>' + r.hoy + ' / ' + r.semana + ' / ' + r.total + '</td><td>$' + (r.totalBilled || 0).toLocaleString('es-ES') + '</td><td>' + (r.alertas.length ? '<span class="alerta">' + r.alertas.join(' · ') + '</span>' : '<span class="ok">OK</span>') + '</td></tr>').join('') +
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
    if (userId) {
      renderFichajesDashboard(userId);
      renderListaFichajesReciente(userId);
    }
    actualizarLedFichaje();
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
    ocultarAppBodyMostrarSecundaria('pantallaFichajes');
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
      if (cerrarUltimoFichaje(session.username, now)) {
        renderListaFichajesReciente(session.username);
        renderFichajesDashboard(session.username);
        actualizarEstadoBotonEntrada();
        if (typeof actualizarLedFichaje === 'function') actualizarLedFichaje();
        alert('Salida registrada a las ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.');
      } else {
        alert('No puedes fichar salida sin una entrada previa. Pulsa primero «Entrada» cuando empieces el turno.');
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
        const reps = getReparacionesByUser()[uid] || { hoy: 0, semana: 0, total: 0 };
        statsWrap.innerHTML = '<div class="fichajes-stats"><div class="stat-card"><span class="stat-label">Horas esta semana</span><span class="stat-value">' + horas.toFixed(1) + 'h</span></div><div class="stat-card"><span class="stat-label">Servicios (hoy / semana / total)</span><span class="stat-value">' + reps.hoy + ' / ' + reps.semana + ' / ' + reps.total + '</span></div></div>';
      }
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
      else { removePendingUserUpdate(pid); renderListaUsuarios(); }
    });
  });
  cont.querySelectorAll('.btn-rechazar-pend').forEach(btn => {
    btn.addEventListener('click', function() {
      removePendingUserUpdate(this.dataset.pendId);
      renderAprobacionesPendientes();
    });
  });
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
  users.forEach(u => {
    const div = document.createElement('div');
    div.className = 'usuario-item';
    const puedeEliminar = hasPermission(session, 'gestionarUsuarios');
    div.innerHTML = `
      <div class="usuario-item-info">
        <span>${escapeHtml(u.nombre || u.username)}</span>
        <span class="rol">${escapeHtml(u.username)} · ${escapeHtml(u.rol)}${u.activo ? '' : ' (inactivo)'}</span>
      </div>
      <div class="usuario-item-actions">
        <button type="button" class="btn btn-outline" data-edit="${escapeHtmlAttr(u.id)}">Editar</button>
        ${puedeEliminar ? '<button type="button" class="btn btn-outline btn-danger" data-delete="' + escapeHtmlAttr(u.id) + '" title="Eliminar empleado">Eliminar</button>' : ''}
      </div>
    `;
    div.querySelector('[data-edit]').addEventListener('click', () => abrirFormUsuario(u.id));
    const btnDelete = div.querySelector('[data-delete]');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        const nombre = (u.nombre || u.username);
        if (!confirm('¿Eliminar al empleado "' + nombre + '"? Esta acción no se puede deshacer.')) return;
        const res = typeof deleteUser === 'function' ? deleteUser(u.id) : { error: 'No disponible' };
        if (res && res.error) {
          alert(res.error);
          return;
        }
        renderListaUsuarios();
        if (typeof renderOrganigrama === 'function' && document.getElementById('pantallaOrganigrama') && document.getElementById('pantallaOrganigrama').style.display === 'flex') {
          renderOrganigrama('organigramaContainer', !!window._organigramaEditMode);
        }
      });
    }
    lista.appendChild(div);
  });
}

function abrirFormUsuario(userId) {
  const modal = document.getElementById('modalUsuario');
  const titulo = document.getElementById('modalUsuarioTitulo');
  const form = document.getElementById('formUsuario');
  const fieldPassword = document.getElementById('fieldPassword');
  const fieldPasswordActual = document.getElementById('fieldPasswordActual');
  const fieldActivo = document.getElementById('fieldActivo');
  const permisosDiv = document.getElementById('permisosCheckboxes');
  if (!modal || !titulo || !form || !fieldPassword || !permisosDiv) return;

  if (userId) {
    const users = getUsers();
    const u = users.find(x => x.id === userId);
    if (!u) return;
    titulo.textContent = 'Editar usuario';
    document.getElementById('usuarioId').value = u.id;
    document.getElementById('usuarioUsername').value = u.username;
    document.getElementById('usuarioUsername').readOnly = true;
    document.getElementById('usuarioNombre').value = u.nombre || '';
    document.getElementById('usuarioPassword').value = '';
    document.getElementById('usuarioPassword').placeholder = 'Dejar vacío para no cambiar';
    if (fieldPasswordActual) {
      fieldPasswordActual.style.display = 'block';
      document.getElementById('usuarioPasswordActual').value = '••••••••';
      document.getElementById('usuarioPasswordActual').placeholder = 'Almacenada de forma segura. Escribe la nueva abajo para cambiarla.';
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
    if (hintAdmin) hintAdmin.style.display = esAdmin ? 'block' : 'none';
    if (passInput) {
      passInput.type = 'text';
      passInput.placeholder = esAdmin ? 'Escribe la nueva contraseña (mín. 4 caracteres). Vacío = no cambiar' : 'Dejar vacío para no cambiar';
    }
    if (toggleBtn) toggleBtn.style.display = 'none';
  } else {
    titulo.textContent = 'Nuevo usuario';
    form.reset();
    document.getElementById('usuarioId').value = '';
    document.getElementById('usuarioUsername').readOnly = false;
    document.getElementById('usuarioFechaAlta').value = new Date().toISOString().slice(0, 10);
    document.getElementById('usuarioPassword').required = true;
    document.getElementById('usuarioPassword').type = 'password';
    document.getElementById('usuarioPassword').placeholder = 'Mínimo 4 caracteres';
    var toggleBtnNew = fieldPassword ? fieldPassword.querySelector('.btn-password-toggle') : null;
    if (toggleBtnNew) toggleBtnNew.style.display = '';
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
  Object.entries(PERMISOS).forEach(([key, label]) => {
    if (key === 'gestionarUsuarios' && document.getElementById('usuarioRol').value === 'admin') return;
    const div = document.createElement('div');
    div.className = 'permiso-item';
    const uEdit = userId ? getUsers().find(x => x.id === userId) : null;
  const val = uEdit ? (uEdit.permisos?.[key] ?? (uEdit.rol === 'admin')) : (key !== 'gestionarUsuarios' && key !== 'gestionarCompras');
    div.innerHTML = `<label><input type="checkbox" id="perm_${key}" ${val ? 'checked' : ''}> ${label}</label>`;
    permisosDiv.appendChild(div);
  });

  if (userId && ['admin', 'responsableMecanicos'].includes(getUsers().find(x => x.id === userId)?.rol)) {
    const div = document.createElement('div');
    div.className = 'permiso-item';
    div.innerHTML = `<label><input type="checkbox" id="perm_gestionarUsuarios" checked disabled> ${PERMISOS.gestionarUsuarios}</label>`;
    permisosDiv.appendChild(div);
  }

  fieldActivo.style.display = userId ? '' : 'none';

  var seccionMaterial = document.getElementById('usuarioSeccionMaterialEntregado');
  if (seccionMaterial) {
    if (userId) {
      var uEdit = getUsers().find(function (x) { return x.id === userId; });
      var session = getSession();
      var puedeVerEntregas = session && (hasPermission(session, 'gestionarUsuarios') || (uEdit && (uEdit.responsable || '').toString().trim() === (session.username || '').toString().trim()));
      seccionMaterial.style.display = puedeVerEntregas ? 'block' : 'none';
      if (puedeVerEntregas && typeof renderMaterialEntregadoEnFicha === 'function') renderMaterialEntregadoEnFicha(userId);
      if (modal) modal.setAttribute('data-usuario-ficha-id', userId);
    } else {
      seccionMaterial.style.display = 'none';
      if (modal) modal.removeAttribute('data-usuario-ficha-id');
    }
  }

  modal.classList.add('active');
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
  const panelConvenios = document.getElementById('panelConvenios');
  const panelEconomia = document.getElementById('panelEconomia');
  const panelSolicitudes = document.getElementById('panelSolicitudesGraficas');
  const panelReset = document.getElementById('panelReset');
  if (panelUsuarios) panelUsuarios.style.display = tab === 'usuarios' ? '' : 'none';
  if (panelConvenios) panelConvenios.style.display = tab === 'convenios' ? '' : 'none';
  if (panelEconomia) {
    panelEconomia.style.display = tab === 'economia' ? '' : 'none';
    if (tab === 'economia') mostrarSubpanelEconomia('resumen');
  }
  if (panelSolicitudes) {
    panelSolicitudes.style.display = tab === 'solicitudes-graficas' ? '' : 'none';
    if (tab === 'solicitudes-graficas') renderSolicitudesGraficas();
  }
  if (panelReset) panelReset.style.display = tab === 'reset' ? '' : 'none';
}

function renderListaConvenios() {
  const tbody = document.getElementById('listaConvenios');
  if (!tbody) return;
  const convenios = getConvenios();
  tbody.innerHTML = '';
  convenios.forEach(c => {
    const tr = document.createElement('tr');
    const fechaStr = c.fechaAcuerdo ? new Date(c.fechaAcuerdo).toLocaleDateString('es-ES') : '—';
    tr.innerHTML = `
      <td>${escapeHtml(c.nombre)}</td>
      <td>${c.descuento}%</td>
      <td>${c.privado ? 'Sí' : '—'}</td>
      <td>${fechaStr}</td>
      <td>${escapeHtml(c.acordadoPorTaller || '—')}</td>
      <td>${escapeHtml(c.acordadoPorEmpresa || '—')}</td>
      <td><button type="button" class="btn btn-outline btn-sm" data-edit-convenio="${c.id}">Editar</button></td>
    `;
    tr.querySelector('[data-edit-convenio]').addEventListener('click', () => abrirFormConvenio(c.id));
    tbody.appendChild(tr);
  });
}

function escapeHtml(s) {
  if (s == null) return '—';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function abrirFormConvenio(convenioId) {
  const modal = document.getElementById('modalConvenio');
  const titulo = document.getElementById('modalConvenioTitulo');
  const form = document.getElementById('formConvenio');
  if (convenioId) {
    const convenios = getConvenios();
    const c = convenios.find(x => x.id === convenioId);
    if (!c) return;
    titulo.textContent = 'Editar convenio';
    document.getElementById('convenioId').value = c.id;
    document.getElementById('convenioNombre').value = c.nombre || '';
    document.getElementById('convenioDescuento').value = c.descuento || 0;
    document.getElementById('convenioFechaAcuerdo').value = c.fechaAcuerdo ? c.fechaAcuerdo.slice(0, 10) : '';
    document.getElementById('convenioAcordadoTaller').value = c.acordadoPorTaller || '';
    document.getElementById('convenioAcordadoEmpresa').value = c.acordadoPorEmpresa || '';
    const privEl = document.getElementById('convenioPrivado');
    if (privEl) privEl.checked = !!c.privado;
  } else {
    titulo.textContent = 'Nuevo convenio';
    form.reset();
    document.getElementById('convenioId').value = '';
    document.getElementById('convenioFechaAcuerdo').value = new Date().toISOString().slice(0, 10);
    const privEl = document.getElementById('convenioPrivado');
    if (privEl) privEl.checked = false;
  }
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

  if (id) {
    const idx = convenios.findIndex(c => c.id === id);
    if (idx === -1) return;
    convenios[idx].nombre = nombre;
    convenios[idx].descuento = descuento;
    convenios[idx].fechaAcuerdo = fechaAcuerdo;
    convenios[idx].acordadoPorTaller = acordadoPorTaller;
    convenios[idx].acordadoPorEmpresa = acordadoPorEmpresa;
    convenios[idx].privado = privado;
  } else {
    if (convenios.some(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      alert('Ya existe un convenio con esa empresa.');
      return;
    }
    convenios.push({
      id: generateConvenioId(),
      nombre,
      descuento,
      fechaAcuerdo,
      acordadoPorTaller,
      acordadoPorEmpresa,
      privado,
    });
  }
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
    document.getElementById('fichaHorasHoy').textContent = (getHorasHoy(uid) || 0).toFixed(1) + ' h';
    document.getElementById('fichaHorasSemana').textContent = (typeof getHorasSemana === 'function' ? getHorasSemana(uid, new Date()) : 0).toFixed(1) + ' h';
    document.getElementById('fichaHorasMes').textContent = (getHorasMes(uid) || 0).toFixed(1) + ' h';
    document.getElementById('fichaHorasTotal').textContent = (getHorasTotal(uid) || 0).toFixed(1) + ' h';
    const servicios = getRegistroServicios();
    const totalCobrado = servicios.filter(s => (s.userId || s.empleado) === uid).reduce((sum, s) => sum + (s.importe || 0), 0);
    document.getElementById('fichaTotalCobrado').textContent = totalCobrado.toLocaleString('es-ES') + ' €';
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
  [buscar, tipo, desde, hasta].forEach(el => { if (el) el.addEventListener('input', renderLista); if (el) el.addEventListener('change', renderLista); });
}

// Contenido en bucle: vídeos aprobados por admin + archivos de input/CONTENT
const CONTENT_LOOP_BASE = 'input/CONTENT/';
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
  vincularFichaTrabajador();
  vincularMiHistorial();
  vincularResultadosCalculadora();
  vincularIndicadoresHistorial();
  vincularPasswordToggle();
  mostrarPaso('inicio');
  actualizarVista();
  initContentLoop();
  initScrollbarVisible();
  // Refresco de indicadores al cargar (por si el panel se pinta después)
  requestAnimationFrame(function () { renderStatsVehiculo(''); });
  // Si otro empleado/tab registra, actualizar indicadores
  window.addEventListener('storage', function (e) {
    if (e.key === 'benny_servicios' && typeof paso !== 'undefined' && paso === 'inicio') {
      requestAnimationFrame(function () { renderStatsVehiculo(''); });
    }
  });
  // Al volver a la pestaña, refrescar indicadores por si hubo registros en otra pestaña
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && typeof paso !== 'undefined' && paso === 'inicio') {
      registroServicios = getRegistroServicios();
      requestAnimationFrame(function () { renderStatsVehiculo(''); });
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

function cargarVehiculos() {
  const ordenados = [...VEHICULOS_DB].sort((a, b) => (a.nombreIC || a.modelo || '').localeCompare(b.nombreIC || b.modelo || '', 'es'));
  el.modelo.innerHTML = '';
  const nuevoSelect = document.getElementById('nuevoVehiculoModelo');
  if (nuevoSelect) nuevoSelect.innerHTML = '';
  ordenados.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.modelo;
    opt.textContent = v.nombreIC;
    el.modelo.appendChild(opt);
    if (nuevoSelect) {
      const o = document.createElement('option');
      o.value = v.modelo;
      o.textContent = v.nombreIC;
      nuevoSelect.appendChild(o);
    }
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
  cambiarModelo();
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
    const v = document.getElementById('contentLoopVideo');
    if (v) v.play().catch(function() {});
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
    if (el.matricula) el.matricula.value = '';
    cargarMatriculasGuardadas();
    renderUltimasReparaciones();
  }
  if (paso === 'calculadora' && matriculaActual) {
    renderStatsVehiculo(matriculaActual);
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
  if (el.modelo) {
    el.modelo.value = reg.modelo || '';
    cambiarModelo();
  }
  if (el.nombreIC) el.nombreIC.value = reg.nombreIC || (vehiculoActual ? vehiculoActual.nombreIC : '');
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
      tipoServicio = tipos[i];
      document.getElementById('nuevoVehiculoWrap').style.display = 'none';
      if (!matriculaActual || !matriculaActual.trim()) {
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
        document.getElementById('nuevoVehiculoWrap').style.display = 'block';
        const nvConvenio = document.getElementById('nuevoVehiculoConvenio');
        if (nvConvenio && nvConvenio.options.length === 0) {
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
      }
    });
  }

  if (btnGuardarNuevo) {
    btnGuardarNuevo.addEventListener('click', () => {
      const modelo = document.getElementById('nuevoVehiculoModelo').value;
      if (!modelo) {
        alert('Selecciona un modelo del catálogo.');
        return;
      }
      const nombreIC = (document.getElementById('nuevoVehiculoNombreIC').value || '').trim();
      const convenio = (document.getElementById('nuevoVehiculoConvenio').value || '').trim() || 'N/A';
      const placaServicio = (document.getElementById('nuevoVehiculoPlacaServicio').value || '').trim();
      const v = VEHICULOS_DB.find(x => x.modelo === modelo);
      const categoria = v ? v.categoria : '';
      const session = getSession();
      const puedeGestionarBBDD = hasPermission(session, 'gestionarRegistroClientes');
      const dataCliente = {
        matricula: matriculaActual,
        placaPolicial: placaServicio || '-',
        codigoVehiculo: modelo,
        nombreVehiculo: nombreIC || (v ? v.nombreIC : ''),
        categoria,
        convenio,
      };
      if (puedeGestionarBBDD && typeof addOrUpdateClienteBBDD === 'function') {
        addOrUpdateClienteBBDD({ ...dataCliente, interacciones: 0, totalInvertido: 0 });
      } else if (typeof addPendiente === 'function') {
        addPendiente(dataCliente, session ? (session.nombre || session.username) : '');
      }
      if (typeof guardarVehiculoRegistro === 'function') {
        guardarVehiculoRegistro({
          matricula: matriculaActual,
          modelo,
          nombreIC: nombreIC || (v ? v.nombreIC : ''),
          convenio,
          placaServicio,
        });
      }
      const reg = { matricula: matriculaActual, modelo, nombreIC: nombreIC || (v ? v.nombreIC : ''), convenio, placaServicio };
      aplicarRegistroACalculadora(reg);
      if (el.matriculaCalc) el.matriculaCalc.value = matriculaActual;
      document.getElementById('nuevoVehiculoWrap').style.display = 'none';
      guardarMatricula(matriculaActual);
      cargarMatriculasGuardadas();
      mostrarPaso('inicio');
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

function calcularPrecios() {
  const desc = parseFloat(el.descuentoPorcentaje.value) || 0;
  const base = vehiculoActual ? vehiculoActual.precioBase : (CONFIG.baseReparacionSinModelo || 50000);

  let motor = 0, performance = 0, custom = 0, cosmetic = 0;

  if (vehiculoActual) {
    var numPerf = parseInt(el.piezasPerformance?.value, 10) || 0;
    var numCosm = parseInt(el.piezasCosmetic?.value, 10) || 0;
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
      performance = typeof getPrecioVentaPerformance === 'function' ? getPrecioVentaPerformance(base, numPerf) : Math.floor(base * CONFIG.factorPiezaTuneo * numPerf);
      custom = Math.floor(base * CONFIG.factorPiezaTuneo * (parseInt(el.piezasCustom?.value, 10) || 0));
      cosmetic = typeof getPrecioVentaCosmetic === 'function' ? getPrecioVentaCosmetic(base, numCosm) : Math.floor(base * CONFIG.factorPiezaTuneo * numCosm);
    }
  }

  const usarKit = document.getElementById('usarKitReparacion');
  const kitActivo = usarKit && usarKit.checked && (el.reparacion && el.reparacion.checked);

  let reparacion = 0;
  if (el.reparacion && el.reparacion.checked) {
    var precioChasis = typeof getPrecioVentaChasis === 'function' ? getPrecioVentaChasis() : 30;
    var precioEsenciales = typeof getPrecioVentaEsenciales === 'function' ? getPrecioVentaEsenciales() : 65;
    if (kitActivo) {
      reparacion = 10 * precioChasis + 6 * precioEsenciales;
    } else {
      const ch = parseInt(el.partesChasis?.value, 10) || 0;
      const es = parseInt(el.partesEsenciales?.value, 10) || 0;
      reparacion = ch * precioChasis + es * precioEsenciales;
    }
  }

  let kitReparacion = 0;
  if (kitActivo) kitReparacion = CONFIG.kitReparacionPrecio || 650;

  const subtotal = motor + performance + custom + cosmetic + reparacion + kitReparacion;
  const descuentoEfectivo = kitActivo ? 0 : desc;
  const total = Math.floor(subtotal * (1 - descuentoEfectivo / 100));

  return {
    motor, performance, custom, cosmetic, reparacion,
    kitReparacion, subtotal, total, descuento: descuentoEfectivo,
    kitActivo: !!kitActivo,
  };
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
  if ((rep || tuneoRep) && !vehiculoActual && el.modelo && typeof VEHICULOS_DB !== 'undefined') {
    var akuma = VEHICULOS_DB.find(function (v) { return (v.modelo || '').toLowerCase() === 'akuma'; });
    if (akuma && el.modelo.options && Array.prototype.some.call(el.modelo.options, function (o) { return (o.value || '').toLowerCase() === 'akuma'; })) {
      el.modelo.value = akuma.modelo;
      cambiarModelo();
      return;
    }
  }
  const p = calcularPrecios();
  const matricula = (matriculaActual || (el.matriculaCalc && el.matriculaCalc.value) || (el.matricula && el.matricula.value) || '').trim() || '-';
  const modelo = vehiculoActual?.nombreIC || '-';
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
  el.presupuestoPerformance.textContent = '$' + p.performance.toLocaleString('es-ES');
  el.presupuestoCustom.textContent = '$' + p.custom.toLocaleString('es-ES');
  el.presupuestoCosmetic.textContent = '$' + p.cosmetic.toLocaleString('es-ES');
  if (rep || tuneoRep) {
    const base = vehiculoActual ? vehiculoActual.precioBase : (CONFIG.baseReparacionSinModelo || 50000);
    var ch = parseInt(el.partesChasis?.value, 10) || 0;
    var es = parseInt(el.partesEsenciales?.value, 10) || 0;
    if (p.kitActivo) { ch = 10; es = 6; }
    const costCh = Math.floor(base * CONFIG.factorChasis * ch);
    const costEs = Math.floor(base * CONFIG.factorEsencial * es);
    if (v.presupuestoChasis) v.presupuestoChasis.textContent = '$' + costCh.toLocaleString('es-ES') + (p.kitActivo ? ' (todo)' : '');
    if (v.presupuestoEsenciales) v.presupuestoEsenciales.textContent = '$' + costEs.toLocaleString('es-ES') + (p.kitActivo ? ' (todo)' : '');
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

  const tieneTuneo = p.motor > 0 || p.performance > 0 || p.custom > 0 || p.cosmetic > 0 || el.fullTuning.checked;
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
    lineas.push('Matrícula: ' + (document.getElementById('tplMatricula')?.textContent || '-'));
    lineas.push('Modelo: ' + (document.getElementById('tplModelo')?.textContent || '-'));
    lineas.push('Modificación: ' + (document.getElementById('tplModTuneo')?.textContent || '-'));
    lineas.push('Importe: ' + (document.getElementById('tplImporteTuneo')?.textContent || '-'));
    lineas.push('Empleado: ' + (document.getElementById('tplEmpleado')?.textContent || '-'));
    lineas.push('Convenio: ' + (document.getElementById('tplConvenio')?.textContent || '-'));
  }
  if (reparacion) {
    if (lineas.length) lineas.push('');
    lineas.push('--- REPARACIÓN ---');
    lineas.push('Matrícula: ' + (document.getElementById('tplMatriculaRep')?.textContent || '-'));
    lineas.push('Modelo: ' + (document.getElementById('tplModeloRep')?.textContent || '-'));
    lineas.push('Modificación: Reparación');
    lineas.push('Importe: ' + (document.getElementById('tplImporteRep')?.textContent || '-'));
    lineas.push('Empleado: ' + (document.getElementById('tplEmpleadoRep')?.textContent || '-'));
    lineas.push('Convenio: ' + (document.getElementById('tplConvenioRep')?.textContent || '-'));
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
  if (el.piezasPerformance) el.piezasPerformance.value = '0';
  if (el.piezasCustom) el.piezasCustom.value = '0';
  if (el.piezasCosmetic) el.piezasCosmetic.value = '0';
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
  if (el.piezasPerformance) el.piezasPerformance.value = '0';
  if (el.piezasCustom) el.piezasCustom.value = '0';
  if (el.piezasCosmetic) el.piezasCosmetic.value = '0';
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
  if (el.piezasPerformance) el.piezasPerformance.value = '0';
  if (el.piezasCustom) el.piezasCustom.value = '0';
  if (el.piezasCosmetic) el.piezasCosmetic.value = '0';
  aplicarDeshabilitarPiezasPorFullTuning();
  if (el.reparacion) el.reparacion.checked = (tipoServicio === 'reparacion' || tipoServicio === 'tuneoReparacion');
  if (el.partesChasis) el.partesChasis.value = '0';
  if (el.partesEsenciales) el.partesEsenciales.value = '0';
  var ckKit = document.getElementById('usarKitReparacion');
  if (ckKit) ckKit.checked = false;
  actualizarVista();
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

/** Envía el registro de reparación/tuneo al webhook de Discord. No bloquea la UI. */
function enviarRegistroServicioADiscord(servicio) {
  var url = (typeof CONFIG !== 'undefined' && CONFIG.discordWebhookUrl) ? CONFIG.discordWebhookUrl : '';
  if (!url || !servicio) return;
  var esReparacion = (servicio.tipo || '').toUpperCase().indexOf('REPARAC') !== -1;
  var title = esReparacion ? 'Reparación registrada' : 'Tuneo registrado';
  var color = esReparacion ? 0x2ecc71 : 0xf1c40f; // verde / amarillo
  var fields = [
    { name: 'Matrícula', value: (servicio.matricula || '—').toString(), inline: true },
    { name: 'Modelo', value: (servicio.modelo || '—').toString(), inline: true },
    { name: 'Importe', value: '$' + (servicio.importe || 0).toLocaleString('es-ES'), inline: true },
    { name: 'Empleado', value: (servicio.empleado || '—').toString(), inline: true },
    { name: 'Convenio', value: (servicio.convenio || '—').toString(), inline: true },
    { name: 'Fecha', value: servicio.fecha ? new Date(servicio.fecha).toLocaleString('es-ES') : '—', inline: true },
  ];
  if (servicio.modificacion) fields.push({ name: 'Tipo / Modificación', value: servicio.modificacion.toString(), inline: false });
  if (servicio.descuento != null && servicio.descuento > 0) fields.push({ name: 'Descuento', value: servicio.descuento + '%', inline: true });
  if (esReparacion && (servicio.partesChasis > 0 || servicio.partesEsenciales > 0)) {
    fields.push({ name: 'Partes chasis', value: String(servicio.partesChasis || 0), inline: true });
    fields.push({ name: 'Partes esenciales', value: String(servicio.partesEsenciales || 0), inline: true });
  }
  var body = JSON.stringify({
    embeds: [{
      title: title,
      color: color,
      fields: fields,
      timestamp: servicio.fecha || new Date().toISOString(),
    }],
  });
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }).catch(function () {});
}

function registrarTuneo() {
  const p = calcularPrecios();
  const tieneTuneo = p.motor > 0 || p.performance > 0 || p.custom > 0 || p.cosmetic > 0 || el.fullTuning.checked;
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
  const modLabel = el.fullTuning?.checked ? 'Full Tuning' : (el.reparacion?.checked ? 'Reparación + Tuneo' : 'Tuneo');
  const servicio = {
    tipo: 'TUNEO',
    fecha: new Date().toISOString(),
    matricula: mat,
    modelo: vehiculoActual?.nombreIC || '-',
    modificacion: modLabel,
    importe: p.total,
    empleado: el.mecanico.value || 'BASE',
    convenio: el.negocios.value,
    descuento: p.descuento,
    userId: session ? session.username : null,
  };
  registroServicios.unshift(servicio);
  saveRegistroServicios(registroServicios);
  if (typeof enviarRegistroServicioADiscord === 'function') enviarRegistroServicioADiscord(servicio);
  var nombreReg = (typeof getSession === 'function' && getSession()) ? (getSession().nombre || getSession().username || '') : '';
  if (typeof actualizarClienteAlRegistrarServicio === 'function') actualizarClienteAlRegistrarServicio(mat, p.total, nombreReg);
  cargarMatriculasGuardadas();
  actualizarModalRegistro();
  renderStatsVehiculo(mat);
  renderStatsVehiculo(''); // actualizar también estadísticas generales del taller (por si se ve el panel)
  renderListaResultadosCalculadora();
  abrirPantallaResultadosCalculadora();
  alert('Tuneo registrado correctamente.');
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
  var partesChasisReg = 0;
  var partesEsencialesReg = 0;
  if (p.kitActivo) {
    partesChasisReg = 10;
    partesEsencialesReg = 6;
  } else {
    partesChasisReg = parseInt(el.partesChasis?.value, 10) || 0;
    partesEsencialesReg = parseInt(el.partesEsenciales?.value, 10) || 0;
  }
  const servicio = {
    tipo: 'REPARACIÓN',
    fecha: new Date().toISOString(),
    matricula: mat,
    modelo: vehiculoActual?.nombreIC || '-',
    modificacion: p.kitActivo ? 'Reparación (kit)' : 'Reparación',
    importe: p.total,
    empleado: el.mecanico.value || 'BASE',
    convenio: el.negocios.value,
    descuento: p.descuento,
    userId: session ? session.username : null,
    partesChasis: partesChasisReg,
    partesEsenciales: partesEsencialesReg,
    partesServicio: 0,
    kitReparacion: p.kitActivo || false,
  };
  registroServicios.unshift(servicio);
  saveRegistroServicios(registroServicios);
  if (typeof enviarRegistroServicioADiscord === 'function') enviarRegistroServicioADiscord(servicio);
  var nombreReg = (typeof getSession === 'function' && getSession()) ? (getSession().nombre || getSession().username || '') : '';
  if (typeof actualizarClienteAlRegistrarServicio === 'function') actualizarClienteAlRegistrarServicio(mat, p.total, nombreReg);
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
    return `
      <div class="resultado-calculadora-card" data-result-index="${i}">
        <h4 class="resultado-calculadora-titulo">${escapeHtml(titulo)}</h4>
        <p><strong>Matrícula:</strong> ${escapeHtml(s.matricula)}</p>
        <p><strong>Modelo:</strong> ${escapeHtml(s.modelo)}</p>
        <p><strong>Modificación:</strong> ${escapeHtml(s.modificacion || s.tipo)}</p>
        <p><strong>Importe:</strong> ${(s.importe || 0).toLocaleString('es-ES')}$</p>
        <p><strong>Descuento aplicado:</strong> ${descuentoPct}%</p>
        <p><strong>Convenio:</strong> ${escapeHtml(s.convenio || '—')}</p>
        <p><strong>Empleado que realizó el servicio:</strong> ${escapeHtml(s.empleado || '—')}</p>
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
      const texto = [
        titulo,
        'Matrícula: ' + (s.matricula || '—'),
        'Modelo: ' + (s.modelo || '—'),
        'Modificación: ' + (s.modificacion || s.tipo || '—'),
        'Importe: ' + (s.importe != null ? s.importe.toLocaleString('es-ES') + '$' : '—'),
        'Descuento aplicado: ' + descuentoPct + '%',
        'Convenio: ' + (s.convenio || '—'),
        'Empleado: ' + (s.empleado || '—'),
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

function vincularResultadosCalculadora() {
  const btn = document.getElementById('btnResultadosCalculadora');
  const pantalla = document.getElementById('pantallaResultadosCalculadora');
  const btnHome = document.getElementById('btnResultadosHome');
  const principal = document.getElementById('pantallaPrincipal');
  if (btn) btn.addEventListener('click', () => { renderListaResultadosCalculadora(); abrirPantallaResultadosCalculadora(); });
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
  [el.piezasPerformance, el.piezasCustom, el.piezasCosmetic].forEach(sel => {
    if (!sel) return;
    sel.disabled = deshabilitar;
    if (deshabilitar) sel.value = '0';
  });
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
  [el.piezasPerformance, el.piezasCustom, el.piezasCosmetic,
   el.partesChasis, el.partesEsenciales,
   el.descuentoPorcentaje].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', actualizarVistaDebounced);
    inp.addEventListener('change', actualizarVistaDebounced);
  });
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
  el.btnRegistrarTuneo.addEventListener('click', registrarTuneo);
  el.btnRegistrarReparacion.addEventListener('click', registrarReparacion);
  el.btnReset.addEventListener('click', limpiarUnidadesCalculadora);
  el.modalClose.addEventListener('click', () => el.modalRegistro.classList.remove('active'));
  el.btnLimpiarRegistro.addEventListener('click', limpiarRegistro);
  el.modalRegistro.addEventListener('click', e => {
    if (e.target === el.modalRegistro) el.modalRegistro.classList.remove('active');
  });
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
