/**
 * BBDD de clientes/vehículos por matrícula.
 * - Lookup por matrícula para rellenar calculadora.
 * - Nuevos registros de mecánicos van a pendientes de aprobación.
 * - Admins ven/editan tabla y aprueban pendientes.
 * - Al registrar servicio se actualizan: interacciones, fechas, total invertido.
 */
const CLIENTES_BBDD_STORAGE = 'benny_clientes_bbdd';
const PENDIENTES_STORAGE = 'benny_clientes_pendientes';
const CLIENTES_FOTOS_STORAGE = 'benny_clientes_fotos';

function generateIdCliente() {
  return 'CLI-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function getClientesFotos() {
  try {
    const raw = localStorage.getItem(CLIENTES_FOTOS_STORAGE);
    const obj = raw ? JSON.parse(raw) : {};
    return typeof obj === 'object' && obj !== null ? obj : {};
  } catch (e) {
    return {};
  }
}

function saveClientesFotos(obj) {
  try {
    localStorage.setItem(CLIENTES_FOTOS_STORAGE, JSON.stringify(obj || {}));
  } catch (e) {}
}

/** Fotos de un vehículo por matrícula: array de URLs o data URLs */
function getFotosByMatricula(matricula) {
  const mat = normalizarMatricula(matricula);
  if (!mat) return [];
  const fotos = getClientesFotos();
  const arr = fotos[mat];
  return Array.isArray(arr) ? arr : [];
}

function addFotoMatricula(matricula, url) {
  const mat = normalizarMatricula(matricula);
  if (!mat) return [];
  const fotos = getClientesFotos();
  if (!fotos[mat]) fotos[mat] = [];
  fotos[mat].push(url);
  saveClientesFotos(fotos);
  return fotos[mat];
}

function removeFotoMatricula(matricula, index) {
  const mat = normalizarMatricula(matricula);
  if (!mat) return [];
  const fotos = getClientesFotos();
  if (!Array.isArray(fotos[mat])) return [];
  fotos[mat].splice(index, 1);
  if (fotos[mat].length === 0) delete fotos[mat];
  saveClientesFotos(fotos);
  return fotos[mat] || [];
}

function getClientesBBDD() {
  try {
    const raw = localStorage.getItem(CLIENTES_BBDD_STORAGE);
    const arr = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(arr) ? arr : [];
    let changed = false;
    list.forEach(function (r) {
      if (!(r.idCliente && r.idCliente.toString().trim())) {
        r.idCliente = generateIdCliente();
        changed = true;
      }
    });
    if (changed) saveClientesBBDD(list);
    return list;
  } catch (e) {
    console.warn('getClientesBBDD', e);
    return [];
  }
}

function saveClientesBBDD(arr) {
  try {
    const list = Array.isArray(arr) ? arr : [];
    localStorage.setItem(CLIENTES_BBDD_STORAGE, JSON.stringify(list));
  } catch (e) {
    console.warn('saveClientesBBDD', e);
  }
}

function normalizarMatricula(mat) {
  return (mat || '').trim().toUpperCase();
}

/** Busca en la BBDD principal por matrícula */
function getClienteByMatricula(matricula) {
  const mat = normalizarMatricula(matricula);
  if (!mat) return null;
  const list = getClientesBBDD();
  return list.find(r => normalizarMatricula(r.matricula) === mat) || null;
}

/** Todos los vehículos/registros de un mismo cliente (por idCliente) */
function getClientesByClienteId(idCliente) {
  if (!idCliente) return [];
  const list = getClientesBBDD();
  return list.filter(r => (r.idCliente || '').toString() === (idCliente || '').toString());
}

/** Convierte registro BBDD al formato que usa la calculadora (modelo, nombreIC, convenio, placaServicio) */
function clienteToRegistro(cliente) {
  if (!cliente) return null;
  return {
    matricula: cliente.matricula,
    modelo: cliente.codigoVehiculo || cliente.modelo,
    nombreIC: cliente.nombreVehiculo || cliente.nombreIC,
    convenio: cliente.convenio || 'N/A',
    placaServicio: cliente.placaPolicial || cliente.placaServicio || '',
  };
}

/** Añade o actualiza cliente en la BBDD (solo admins o aprobación) */
function addOrUpdateClienteBBDD(data) {
  const list = getClientesBBDD();
  const mat = normalizarMatricula(data.matricula);
  if (!mat) return null;
  const idx = list.findIndex(r => normalizarMatricula(r.matricula) === mat);
  const existing = idx >= 0 ? list[idx] : null;
  const idCliente = (data.idCliente || existing?.idCliente || '').toString().trim() || generateIdCliente();
  const moroso = data.moroso !== undefined ? !!data.moroso : (existing && existing.moroso !== undefined ? !!existing.moroso : false);
  const vetado = data.vetado !== undefined ? !!data.vetado : (existing && existing.vetado !== undefined ? !!existing.vetado : false);
  const prepago = data.prepago !== undefined ? !!data.prepago : (existing && existing.prepago !== undefined ? !!existing.prepago : false);
  const record = {
    idCliente,
    matricula: (data.matricula || '').trim(),
    nombreRegistrador: (data.nombreRegistrador ?? existing?.nombreRegistrador ?? '').toString().trim(),
    telefonoCliente: (data.telefonoCliente ?? existing?.telefonoCliente ?? '').toString().trim(),
    nombrePropietario: (data.nombrePropietario ?? existing?.nombrePropietario ?? '').toString().trim(),
    placaPolicial: (data.placaPolicial ?? data.placaServicio ?? existing?.placaPolicial ?? '').toString().trim() || '-',
    marca: (data.marca ?? existing?.marca ?? '').toString().trim(),
    codigoVehiculo: (data.codigoVehiculo ?? data.modelo ?? existing?.codigoVehiculo ?? '').toString().trim(),
    nombreVehiculo: (data.nombreVehiculo ?? data.nombreIC ?? existing?.nombreVehiculo ?? '').toString().trim(),
    categoria: (data.categoria ?? existing?.categoria ?? '').toString().trim(),
    convenio: (data.convenio ?? existing?.convenio ?? '').toString().trim() || '',
    numeroSocioLSCM: (data.numeroSocioLSCM ?? existing?.numeroSocioLSCM ?? '').toString().trim(),
    observaciones: (data.observaciones ?? existing?.observaciones ?? '').toString().trim(),
    moroso,
    vetado,
    prepago,
    fechaPrimeraInteraccion: data.fechaPrimeraInteraccion ?? existing?.fechaPrimeraInteraccion ?? null,
    fechaUltimaActualizacion: data.fechaUltimaActualizacion ?? existing?.fechaUltimaActualizacion ?? null,
    interacciones: typeof data.interacciones === 'number' ? data.interacciones : (parseInt(data.interacciones, 10) ?? existing?.interacciones ?? 0),
    totalInvertido: typeof data.totalInvertido === 'number' ? data.totalInvertido : (parseFloat(data.totalInvertido) || existing?.totalInvertido || 0),
  };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record };
    list.forEach(function (r, i) {
      if (r.idCliente === idCliente && i !== idx) {
        list[i] = { ...list[i], moroso: moroso, vetado: vetado, prepago: prepago };
      }
    });
  } else {
    list.push(record);
  }
  saveClientesBBDD(list);
  return record;
}

/** Actualiza estadísticas del cliente al registrar un servicio. Opcional: nombreRegistrador (quien registró). */
function actualizarClienteAlRegistrarServicio(matricula, importe, nombreRegistrador) {
  const mat = normalizarMatricula(matricula);
  if (!mat) return;
  const list = getClientesBBDD();
  const idx = list.findIndex(r => normalizarMatricula(r.matricula) === mat);
  const now = new Date().toISOString();
  if (idx >= 0) {
    list[idx].interacciones = (list[idx].interacciones || 0) + 1;
    list[idx].fechaUltimaActualizacion = now;
    if (!list[idx].fechaPrimeraInteraccion) list[idx].fechaPrimeraInteraccion = now;
    list[idx].totalInvertido = (list[idx].totalInvertido || 0) + (importe || 0);
    if (nombreRegistrador && !list[idx].nombreRegistrador) list[idx].nombreRegistrador = nombreRegistrador;
    saveClientesBBDD(list);
  }
}

// ——— Pendientes de aprobación ———

function getPendientes() {
  try {
    const raw = localStorage.getItem(PENDIENTES_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendientes(arr) {
  localStorage.setItem(PENDIENTES_STORAGE, JSON.stringify(arr));
}

function addPendiente(data, usuarioRegistro) {
  const list = getPendientes();
  const id = 'pend-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const record = {
    id,
    matricula: (data.matricula || '').trim(),
    nombrePropietario: (data.nombrePropietario || '').toString().trim(),
    telefonoCliente: (data.telefonoCliente || '').toString().trim(),
    placaPolicial: (data.placaPolicial != null ? data.placaPolicial : (data.placaServicio || '')).toString().trim() || '-',
    codigoVehiculo: (data.codigoVehiculo != null ? data.codigoVehiculo : (data.modelo || '')).toString().trim(),
    nombreVehiculo: (data.nombreVehiculo != null ? data.nombreVehiculo : (data.nombreIC || '')).toString().trim(),
    categoria: (data.categoria || '').toString().trim(),
    convenio: (data.convenio || '').toString().trim() || '',
    usuarioRegistro: usuarioRegistro || '',
    fechaSolicitud: new Date().toISOString(),
  };
  list.push(record);
  savePendientes(list);
  return record;
}

function aprobarPendiente(id) {
  const list = getPendientes();
  const idx = list.findIndex(p => p.id === id);
  if (idx < 0) return null;
  const pend = list[idx];
  addOrUpdateClienteBBDD({
    matricula: pend.matricula,
    nombreRegistrador: pend.usuarioRegistro || '',
    telefonoCliente: pend.telefonoCliente || '',
    nombrePropietario: pend.nombrePropietario || '',
    placaPolicial: pend.placaPolicial,
    codigoVehiculo: pend.codigoVehiculo,
    nombreVehiculo: pend.nombreVehiculo,
    categoria: pend.categoria,
    convenio: pend.convenio,
    interacciones: 0,
    totalInvertido: 0,
  });
  list.splice(idx, 1);
  savePendientes(list);
  return pend;
}

function rechazarPendiente(id) {
  const list = getPendientes();
  const idx = list.findIndex(p => p.id === id);
  if (idx < 0) return null;
  const pend = list[idx];
  list.splice(idx, 1);
  savePendientes(list);
  return pend;
}

function actualizarPendiente(id, data) {
  const list = getPendientes();
  const idx = list.findIndex(p => p.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...data };
  savePendientes(list);
  return list[idx];
}

/** Si la BBDD está vacía, rellena con los datos del repositorio (clientes-seed.js) */
function seedClientesBBDDIfEmpty() {
  try {
    var list = getClientesBBDD();
    if (!Array.isArray(list)) list = [];
    if (list.length > 0) return;
    var seed = typeof CLIENTES_SEED !== 'undefined' && Array.isArray(CLIENTES_SEED) ? CLIENTES_SEED : [];
    if (seed.length === 0) return;
    var arr = [];
    for (var i = 0; i < seed.length; i++) {
      var r = seed[i];
      var mat = (r.matricula || '').toString().trim();
      if (!mat) continue;
      arr.push({
        idCliente: generateIdCliente(),
        matricula: mat,
        nombreRegistrador: (r.nombreRegistrador || '').toString().trim(),
        telefonoCliente: (r.telefonoCliente || '').toString().trim(),
        nombrePropietario: (r.nombrePropietario || '').toString().trim(),
        placaPolicial: (r.placaPolicial != null && r.placaPolicial !== '') ? String(r.placaPolicial).trim() : '-',
        codigoVehiculo: (r.codigoVehiculo || '').toString().trim(),
        nombreVehiculo: (r.nombreVehiculo || '').toString().trim(),
        categoria: (r.categoria || '').toString().trim(),
        convenio: (r.convenio || '').toString().trim(),
        fechaPrimeraInteraccion: null,
        fechaUltimaActualizacion: null,
        interacciones: 0,
        totalInvertido: 0,
      });
    }
    if (arr.length > 0) {
      saveClientesBBDD(arr);
    }
  } catch (e) { console.warn('seedClientesBBDDIfEmpty', e); }
}

if (typeof getClientesBBDD === 'function' && typeof saveClientesBBDD === 'function') {
  seedClientesBBDDIfEmpty();
  ensureVehiculosSavannahDavies();
}

/** Asegura que los vehículos de Savannah Davies existan en la BBDD (para reparaciones/tuneos por matrícula). */
function ensureVehiculosSavannahDavies() {
  var vehiculos = [
    { matricula: 'VOBN5712', codigoVehiculo: 'primo', nombreVehiculo: 'Primo', categoria: 'Sedans', nombrePropietario: 'Savannah Davies' },
    { matricula: 'SAVP001', codigoVehiculo: 'previon', nombreVehiculo: 'Previon', categoria: 'Coupes', nombrePropietario: 'Savannah Davies' },
    { matricula: 'SAVW001', codigoVehiculo: 'l35', nombreVehiculo: 'Walton L35', categoria: 'Todoterrenos', nombrePropietario: 'Savannah Davies' },
  ];
  for (var i = 0; i < vehiculos.length; i++) {
    if (!getClienteByMatricula(vehiculos[i].matricula)) {
      addOrUpdateClienteBBDD({
        matricula: vehiculos[i].matricula,
        placaPolicial: '-',
        codigoVehiculo: vehiculos[i].codigoVehiculo,
        nombreVehiculo: vehiculos[i].nombreVehiculo,
        categoria: vehiculos[i].categoria,
        convenio: '',
        nombrePropietario: vehiculos[i].nombrePropietario,
      });
    }
  }
}
