/**
 * Registro del club LSCM: socios vinculados a idCliente de la BBDD (misma ficha que clientes).
 * El nº de socio se replica en numeroSocioLSCM de todas las filas del cliente en clientes-bbdd.
 */
const LSCM_SOCIOS_STORAGE = 'benny_lscm_socios';

let _cachedLscmSocios = null;

function getLscmSociosRegistry() {
  if (_cachedLscmSocios !== null) return _cachedLscmSocios;
  try {
    const raw = localStorage.getItem(LSCM_SOCIOS_STORAGE);
    const arr = raw ? JSON.parse(raw) : [];
    _cachedLscmSocios = Array.isArray(arr) ? arr : [];
    return _cachedLscmSocios;
  } catch {
    return (_cachedLscmSocios = []);
  }
}

function invalidateLscmSociosCache() {
  _cachedLscmSocios = null;
}

function saveLscmSociosRegistry(arr) {
  try {
    const list = Array.isArray(arr) ? arr : [];
    _cachedLscmSocios = list;
    localStorage.setItem(LSCM_SOCIOS_STORAGE, JSON.stringify(list));
    if (typeof programarExportacionRepositorio === 'function') programarExportacionRepositorio();
  } catch (e) {
    console.warn('saveLscmSociosRegistry', e);
  }
}

function mergeLscmSociosFromServer(serverList) {
  if (!Array.isArray(serverList)) serverList = [];
  let local = [];
  try {
    local = JSON.parse(localStorage.getItem(LSCM_SOCIOS_STORAGE) || '[]');
  } catch (_) {
    local = [];
  }
  if (!Array.isArray(local)) local = [];
  const byCliente = {};
  serverList.forEach(function (s) {
    if (!s || !s.idCliente) return;
    const idc = (s.idCliente || '').toString().trim();
    if (idc) byCliente[idc] = Object.assign({}, s, { idCliente: idc });
  });
  local.forEach(function (s) {
    if (!s || !s.idCliente) return;
    const idc = (s.idCliente || '').toString().trim();
    if (idc && !byCliente[idc]) byCliente[idc] = Object.assign({}, s, { idCliente: idc });
  });
  return Object.values(byCliente).sort(function (a, b) {
    return (a.numSocio || '').toString().localeCompare((b.numSocio || '').toString(), undefined, { numeric: true });
  });
}

function getNumeroSocioLscmParaCliente(idCliente) {
  var idc = (idCliente || '').toString().trim();
  if (!idc) return '';
  var reg = getLscmSociosRegistry().find(function (s) {
    return (s.idCliente || '').toString().trim() === idc;
  });
  if (reg && (reg.numSocio || '').toString().trim()) return (reg.numSocio || '').toString().trim();
  if (typeof getClientesByClienteId === 'function') {
    var rows = getClientesByClienteId(idc);
    for (var i = 0; i < rows.length; i++) {
      var n = (rows[i].numeroSocioLSCM || '').toString().trim();
      if (n) return n;
    }
  }
  return '';
}

function isIdClienteSocioLscm(idCliente) {
  return !!getNumeroSocioLscmParaCliente(idCliente);
}

function getNombreClienteBBDD(idCliente) {
  if (!idCliente || typeof getClientesByClienteId !== 'function') return '';
  const rows = getClientesByClienteId(idCliente);
  if (!rows.length) return '';
  return (rows[0].nombrePropietario || '').toString().trim();
}

function refrescarNumerosLscmEnTodasLasFilasBBDD() {
  getLscmSociosRegistry().forEach(function (s) {
    if (s && s.idCliente && s.numSocio) aplicarNumeroSocioATodasLasFilas(s.idCliente, s.numSocio);
  });
}

function aplicarNumeroSocioATodasLasFilas(idCliente, numSocio) {
  if (!idCliente || typeof getClientesBBDD !== 'function' || typeof saveClientesBBDD !== 'function') return;
  const list = getClientesBBDD();
  const idc = (idCliente || '').toString().trim();
  const num = (numSocio || '').toString().trim();
  let changed = false;
  list.forEach(function (r) {
    if ((r.idCliente || '').toString().trim() !== idc) return;
    r.numeroSocioLSCM = num;
    changed = true;
  });
  if (changed) saveClientesBBDD(list);
}

function getIdClientesYaSocios() {
  const set = {};
  getLscmSociosRegistry().forEach(function (s) {
    if (s && s.idCliente) set[(s.idCliente || '').toString().trim()] = true;
  });
  return set;
}

function addLscmSocioEntry(idCliente, numSocio) {
  const idc = (idCliente || '').toString().trim();
  const num = (numSocio || '').toString().trim();
  if (!idc || !num) return { error: 'Indica cliente y número de socio.' };
  const reg = getLscmSociosRegistry().slice();
  if (reg.some(function (s) { return (s.idCliente || '').toString().trim() === idc; })) {
    return { error: 'Este cliente ya está registrado como socio.' };
  }
  if (reg.some(function (s) { return (s.numSocio || '').toString().trim() === num; })) {
    return { error: 'Ya existe otro socio con ese número.' };
  }
  const id = 'lscm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  reg.push({ id: id, idCliente: idc, numSocio: num });
  saveLscmSociosRegistry(reg);
  aplicarNumeroSocioATodasLasFilas(idc, num);
  return { ok: true, id: id };
}

function removeLscmSocioEntry(lscmId) {
  const reg = getLscmSociosRegistry().slice();
  const idx = reg.findIndex(function (s) { return s.id === lscmId; });
  if (idx < 0) return false;
  const idc = (reg[idx].idCliente || '').toString().trim();
  reg.splice(idx, 1);
  saveLscmSociosRegistry(reg);
  aplicarNumeroSocioATodasLasFilas(idc, '');
  return true;
}

function updateLscmSocioNumero(lscmId, numSocioNuevo) {
  const num = (numSocioNuevo || '').toString().trim();
  if (!num) return { error: 'El número de socio no puede estar vacío.' };
  const reg = getLscmSociosRegistry().slice();
  const idx = reg.findIndex(function (s) { return s.id === lscmId; });
  if (idx < 0) return { error: 'Socio no encontrado.' };
  if (reg.some(function (s, i) { return i !== idx && (s.numSocio || '').toString().trim() === num; })) {
    return { error: 'Ya existe otro socio con ese número.' };
  }
  const idc = (reg[idx].idCliente || '').toString().trim();
  reg[idx] = Object.assign({}, reg[idx], { numSocio: num });
  saveLscmSociosRegistry(reg);
  aplicarNumeroSocioATodasLasFilas(idc, num);
  return { ok: true };
}

function updateNombrePropietarioClienteBBDD(idCliente, nombre) {
  if (!idCliente || typeof getClientesBBDD !== 'function' || typeof saveClientesBBDD !== 'function') return;
  const idc = (idCliente || '').toString().trim();
  const nom = (nombre || '').toString().trim();
  const list = getClientesBBDD();
  let changed = false;
  list.forEach(function (r) {
    if ((r.idCliente || '').toString().trim() !== idc) return;
    r.nombrePropietario = nom;
    changed = true;
  });
  if (changed) saveClientesBBDD(list);
}

function addVehiculoSocioBBDD(idCliente, matricula, extras) {
  if (!idCliente || !matricula || typeof addOrUpdateClienteBBDD !== 'function') return { error: 'Falta matrícula o BBDD no disponible.' };
  const idc = (idCliente || '').toString().trim();
  const socio = getLscmSociosRegistry().find(function (s) { return (s.idCliente || '').toString().trim() === idc; });
  const numSocio = socio ? (socio.numSocio || '').toString().trim() : '';
  const rows = typeof getClientesByClienteId === 'function' ? getClientesByClienteId(idc) : [];
  const baseNombre = (extras && extras.nombrePropietario) || getNombreClienteBBDD(idc) || '';
  const ref = rows[0] || {};
  addOrUpdateClienteBBDD({
    matricula: matricula,
    idCliente: idc,
    nombrePropietario: baseNombre || ref.nombrePropietario || '',
    telefonoCliente: (extras && extras.telefonoCliente) || ref.telefonoCliente || '',
    placaPolicial: ref.placaPolicial || '-',
    codigoVehiculo: (extras && extras.codigoVehiculo) || ref.codigoVehiculo || '',
    nombreVehiculo: (extras && extras.nombreVehiculo) || ref.nombreVehiculo || '',
    categoria: ref.categoria || '',
    convenio: ref.convenio || '',
    numeroSocioLSCM: numSocio,
  });
  return { ok: true };
}

if (typeof window !== 'undefined') {
  window.invalidateLscmSociosCache = invalidateLscmSociosCache;
  window.getIdClientesYaSocios = getIdClientesYaSocios;
  window.getLscmSociosRegistry = getLscmSociosRegistry;
  window.saveLscmSociosRegistry = saveLscmSociosRegistry;
  window.mergeLscmSociosFromServer = mergeLscmSociosFromServer;
  window.addLscmSocioEntry = addLscmSocioEntry;
  window.removeLscmSocioEntry = removeLscmSocioEntry;
  window.updateLscmSocioNumero = updateLscmSocioNumero;
  window.updateNombrePropietarioClienteBBDD = updateNombrePropietarioClienteBBDD;
  window.addVehiculoSocioBBDD = addVehiculoSocioBBDD;
  window.refrescarNumerosLscmEnTodasLasFilasBBDD = refrescarNumerosLscmEnTodasLasFilasBBDD;
  window.getNombreClienteBBDD = getNombreClienteBBDD;
  window.getNumeroSocioLscmParaCliente = getNumeroSocioLscmParaCliente;
  window.isIdClienteSocioLscm = isIdClienteSocioLscm;
}
