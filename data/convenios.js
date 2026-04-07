/**
 * Convenios (empresas y % descuento) - Salt Lab Cafe
 * Almacenamiento en localStorage. El admin puede ajustar desde el panel.
 * Incluye listado de empleados por empresa y placa | empleado para aplicar el convenio independientemente del vehículo.
 */
const CONVENIOS_STORAGE = 'benny_convenios';

/** Solo N/A por defecto: el resto de convenios se dan de alta con documento firmado adjunto. */
const CONVENIOS_DEFAULT = [
  { id: 'conv-na', nombre: 'N/A', descuento: 0, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
];

/** Quita adjuntos en base64 del convenio y deja solo registro ligero (empresa, %, nombre de fichero opcional). */
function normalizarConvenioSinAdjuntoDataUrl(c) {
  if (!c || typeof c !== 'object') return c;
  const o = { ...c };
  const hadData = o.acuerdoArchivoDataUrl && String(o.acuerdoArchivoDataUrl).indexOf('data:') === 0;
  if (hadData) {
    o.registroDocumentoFirmado = true;
    if (!o.documentoAcuerdo || typeof o.documentoAcuerdo !== 'object') o.documentoAcuerdo = {};
    if (!String(o.documentoAcuerdo.titulo || '').trim()) {
      o.documentoAcuerdo = { ...o.documentoAcuerdo, titulo: 'Documento subido' };
    }
  }
  delete o.acuerdoArchivoDataUrl;
  return o;
}

function normalizarListaConveniosSinAdjuntosDataUrl(list) {
  if (!Array.isArray(list)) return list;
  return list.map(normalizarConvenioSinAdjuntoDataUrl);
}

/** Convenio con registro de documento firmado, PDF en datos (legado), o archivo en carpeta acuerdos. */
function convenioTieneAcuerdoAlmacenado(c) {
  if (!c) return false;
  if (c.registroDocumentoFirmado === true) return true;
  if (c.acuerdoArchivoDataUrl && String(c.acuerdoArchivoDataUrl).indexOf('data:') === 0) return true;
  return !!(c.acuerdoArchivo && String(c.acuerdoArchivo).trim());
}

/** Empleado | Empresa: para aplicar el convenio por persona independientemente del vehículo */
const CONVENIOS_EMPLEADOS_DEFAULT = [
  { empleado: 'Alexander Moretti', empresa: 'Departamento de Justicia' },
  { empleado: 'Arthur Brown', empresa: 'Departamento de Justicia' },
  { empleado: 'Blue Liberty', empresa: 'Departamento de Justicia' },
  { empleado: 'Borja Fiser', empresa: 'Departamento de Justicia' },
  { empleado: 'Brishen Salazar', empresa: 'Departamento de Justicia' },
  { empleado: 'Daimon Blackwood', empresa: 'Departamento de Justicia' },
  { empleado: 'Pol Albeloa', empresa: 'Departamento de Justicia' },
  { empleado: 'Purificacion Aguirre', empresa: 'Departamento de Justicia' },
];

/** Placa | Empleado: para aplicar convenio por placa de servicio (p. ej. SAPD/SAED) */
const CONVENIOS_PLACAS_DEFAULT = [
  { placa: '801', empleado: 'Hugo Martinez' },
  { placa: '804', empleado: 'Elias Collins' },
  { placa: '805', empleado: 'Danny Jimenez' },
  { placa: '806', empleado: 'Fernando Peña' },
  { placa: '807', empleado: 'Gabriella Orsini' },
  { placa: '810', empleado: 'James Brooke' },
  { placa: '811', empleado: 'Cole Maddox' },
  { placa: '814', empleado: 'Pepe Domingo' },
  { placa: '815', empleado: 'Adrian Blackwood' },
  { placa: '816', empleado: 'Carla Miso' },
  { placa: '817', empleado: 'Ren Kobayashi' },
  { placa: '818', empleado: 'Hayato Morie' },
  { placa: '819', empleado: 'Manuel Rodriguez' },
  { placa: '823', empleado: 'Erik Kowalski' },
  { placa: '826', empleado: 'Denver Moretti' },
  { placa: '837', empleado: 'Godofredo Martinez' },
  { placa: '844', empleado: 'David Garcia' },
  { placa: '848', empleado: 'Jose Rodriguez' },
  { placa: '855', empleado: 'Cassandra Gomez' },
  { placa: '861', empleado: 'Hannah Backer' },
  { placa: '861', empleado: 'Sophie Becker' },
  { placa: '876', empleado: 'Natasha Lewis' },
  { placa: '877', empleado: 'Rafael Jimenez' },
  { placa: '888', empleado: 'Micaela Bonaccio' },
  { placa: '899', empleado: 'Marcus Escobar' },
  { placa: '701', empleado: 'James Oconner' },
  { placa: '702', empleado: 'Mario Marquez' },
  { placa: '703', empleado: 'Adrian West' },
  { placa: '704', empleado: 'Pau Manresa' },
  { placa: '705', empleado: 'Ramoncin Torrente' },
  { placa: '706', empleado: 'David Diaz' },
  { placa: '707', empleado: 'Carmela Cartones' },
  { placa: '708', empleado: 'Liam Dixson' },
  { placa: '713', empleado: 'Elisabeth Garcia' },
  { placa: '714', empleado: 'Karim Blanc' },
  { placa: '715', empleado: 'Daviana Hoyos' },
  { placa: '717', empleado: 'Matteo Messina' },
];

/** Devuelve convenios visibles para el usuario (oculta privados si no tiene permiso) */
function getConveniosVisibles(puedeVerPrivados) {
  const list = getConvenios();
  if (puedeVerPrivados) return list;
  return list.filter(c => !c.privado);
}

function getConvenios() {
  try {
    const raw = localStorage.getItem(CONVENIOS_STORAGE);
    let list = !raw ? JSON.parse(JSON.stringify(CONVENIOS_DEFAULT)) : JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) {
      var soloNa = JSON.parse(JSON.stringify(CONVENIOS_DEFAULT));
      try { localStorage.setItem(CONVENIOS_STORAGE, JSON.stringify(soloNa)); } catch (e) {}
      return soloNa;
    }
    list = list.map(c => ({ ...c, privado: c.privado === true }));
    if (raw && raw.indexOf('"acuerdoArchivoDataUrl"') !== -1) {
      list = normalizarListaConveniosSinAdjuntosDataUrl(list);
      try {
        localStorage.setItem(CONVENIOS_STORAGE, JSON.stringify(list));
      } catch (e) { /* ignore */ }
    }
    return list;
  } catch {
    return JSON.parse(JSON.stringify(CONVENIOS_DEFAULT));
  }
}

/** @returns {boolean} false si falla (p. ej. cuota excedida) */
function saveConvenios(convenios) {
  try {
    const toSave = normalizarListaConveniosSinAdjuntosDataUrl(convenios);
    localStorage.setItem(CONVENIOS_STORAGE, JSON.stringify(toSave));
    if (typeof window !== 'undefined') {
      window._conveniosTrustLocalMembershipUntil = Date.now() + 20000;
      setTimeout(function () {
        try {
          var api = window.backendApi;
          var getDatos = window.getDatosCompletosParaExportar;
          var getSess = window.getSession;
          var hasPerm = window.hasPermission;
          if (!api || typeof api.saveRepoExport !== 'function' || typeof getDatos !== 'function') return;
          var s = typeof getSess === 'function' ? getSess() : null;
          if (!s || typeof hasPerm !== 'function' || !hasPerm(s, 'gestionarUsuarios')) return;
          var payload = getDatos();
          if (payload && typeof payload === 'object') api.saveRepoExport(payload);
        } catch (e2) { /* ignore */ }
      }, 0);
    }
    return true;
  } catch (e) {
    var quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
    var msg = quota
      ? 'No se pudieron guardar los convenios: el almacenamiento del navegador está lleno. Los PDF/imágenes guardados en el convenio ocupan mucho espacio; elimina o sustituye documentos antiguos en convenios que ya no necesites, o exporta datos y limpia desde el panel de administración.'
      : 'No se pudieron guardar los convenios: ' + (e && e.message ? e.message : 'error desconocido');
    if (typeof alert === 'function') alert(msg);
    return false;
  }
}

function generateConvenioId() {
  return 'conv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

/** Devuelve el listado empleado | empresa (para mostrar en gestión de convenios) */
function getConveniosEmpleados() {
  try {
    const raw = localStorage.getItem('benny_convenios_empleados');
    if (raw) {
      var list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (e) {}
  var def = JSON.parse(JSON.stringify(CONVENIOS_EMPLEADOS_DEFAULT));
  try { localStorage.setItem('benny_convenios_empleados', JSON.stringify(def)); } catch (e) {}
  return def;
}

/** Devuelve el listado placa | empleado */
function getConveniosPlacas() {
  try {
    const raw = localStorage.getItem('benny_convenios_placas');
    if (raw) {
      var list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (e) {}
  var def = JSON.parse(JSON.stringify(CONVENIOS_PLACAS_DEFAULT));
  try { localStorage.setItem('benny_convenios_placas', JSON.stringify(def)); } catch (e) {}
  return def;
}

/** Obtiene la empresa (nombre convenio) por nombre de empleado */
function getEmpresaByEmpleado(nombreEmpleado) {
  const nombre = (nombreEmpleado || '').toString().trim().toLowerCase();
  if (!nombre) return null;
  const list = getConveniosEmpleados();
  const found = list.find(e => (e.empleado || '').toString().trim().toLowerCase() === nombre);
  return found ? (found.empresa || null) : null;
}

/** Obtiene el empleado por placa de servicio */
function getEmpleadoByPlaca(placa) {
  const p = (placa || '').toString().trim();
  if (!p) return null;
  const list = getConveniosPlacas();
  const found = list.find(e => (e.placa || '').toString().trim() === p);
  return found ? (found.empleado || null) : null;
}

/** Base URL para logos de convenios (repositorio input/CONTENT/Logos/convenios) */
const CONVENIOS_LOGOS_BASE = 'input/CONTENT/Logos/convenios/';
/** Base URL para archivos de acuerdo (mismo repositorio, subcarpeta acuerdos) */
const CONVENIOS_ACUERDOS_BASE = 'input/CONTENT/Logos/convenios/acuerdos/';
/** Base URL para convenios firmados guardados en repositorio (acuerdos/firmados) */
const CONVENIOS_ACUERDOS_FIRMADOS_BASE = CONVENIOS_ACUERDOS_BASE + 'firmados/';
/** Base URL para firmas (subcarpeta firmas: firmas.txt + imágenes .png por nombre) */
const CONVENIOS_FIRMAS_BASE = 'input/CONTENT/Logos/convenios/firmas/';
if (typeof window !== 'undefined') {
  window.CONVENIOS_LOGOS_BASE = CONVENIOS_LOGOS_BASE;
  window.CONVENIOS_ACUERDOS_BASE = CONVENIOS_ACUERDOS_BASE;
  window.CONVENIOS_ACUERDOS_FIRMADOS_BASE = CONVENIOS_ACUERDOS_FIRMADOS_BASE;
  window.CONVENIOS_FIRMAS_BASE = CONVENIOS_FIRMAS_BASE;
  window.convenioTieneAcuerdoAlmacenado = convenioTieneAcuerdoAlmacenado;
  window.normalizarListaConveniosSinAdjuntosDataUrl = normalizarListaConveniosSinAdjuntosDataUrl;
}
let _conveniosLogosMap = {};
let _conveniosLogosFontMap = {};

/** Normaliza nombre para emparejar convenio con nombre de archivo de logo (sin extensión). */
function normalizeConvenioNameForLogo(str) {
  if (str == null) return '';
  return (str + '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/** Devuelve la URL del logo para un convenio si existe en el listado y coincide el nombre; si no, null. */
function getLogoUrlForConvenio(nombreConvenio) {
  const key = normalizeConvenioNameForLogo(nombreConvenio);
  const filename = _conveniosLogosMap[key];
  if (!filename) return null;
  return CONVENIOS_LOGOS_BASE + encodeURIComponent(filename);
}

/** Devuelve la familia de fuente asociada al convenio (desde listado-fuentes-convenios.txt); si no hay, null (se usará la por defecto). */
function getFontForConvenio(nombreConvenio) {
  const key = normalizeConvenioNameForLogo(nombreConvenio);
  return _conveniosLogosFontMap[key] || null;
}

/** Carga el listado de logos y opcionalmente el de fuentes; al terminar llama a cb. */
function cargarListadoLogosConvenios(cb) {
  const url = CONVENIOS_LOGOS_BASE + 'listado-logos-convenios.txt';
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function () {
    _conveniosLogosMap = {};
    if (xhr.status === 200 && xhr.responseText) {
      const lineas = xhr.responseText.split(/\r?\n/).map(l => (l || '').trim()).filter(Boolean);
      lineas.forEach(nombre => {
        if (nombre.indexOf('#') === 0) return;
        const filename = nombre.replace(/^\s*-\s*/, '').trim();
        if (!filename || filename.indexOf('/') !== -1 || filename.indexOf('..') !== -1) return;
        const sinExt = filename.replace(/\.[^.]+$/, '');
        const key = normalizeConvenioNameForLogo(sinExt);
        if (key) _conveniosLogosMap[key] = filename;
      });
    }
    cargarListadoFuentesConvenios(cb);
  };
  xhr.onerror = function () { cargarListadoFuentesConvenios(cb); };
  xhr.send();
}

/** Carga listado-fuentes-convenios.txt (clave|fuente) y rellena _conveniosLogosFontMap. */
function cargarListadoFuentesConvenios(cb) {
  _conveniosLogosFontMap = {};
  const url = CONVENIOS_LOGOS_BASE + 'listado-fuentes-convenios.txt';
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function () {
    if (xhr.status === 200 && xhr.responseText) {
      const lineas = xhr.responseText.split(/\r?\n/).map(l => (l || '').trim()).filter(Boolean);
      lineas.forEach(line => {
        if (line.indexOf('#') === 0) return;
        const idx = line.indexOf('|');
        if (idx === -1) return;
        const key = normalizeConvenioNameForLogo(line.slice(0, idx).trim());
        const font = line.slice(idx + 1).trim();
        if (key && font) _conveniosLogosFontMap[key] = font;
      });
    }
    if (typeof cb === 'function') cb();
  };
  xhr.onerror = function () { if (typeof cb === 'function') cb(); };
  xhr.send();
}
