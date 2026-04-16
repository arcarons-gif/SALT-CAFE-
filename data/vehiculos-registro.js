/**
 * Registro de vehículos por matrícula (asociación matrícula → modelo, convenio, etc.)
 * Si el vehículo no está, el trabajador lo da de alta y queda guardado.
 */
const REGISTRO_VEHICULOS_STORAGE = 'benny_vehiculos_registro';

function getRegistroVehiculos() {
  try {
    const raw = localStorage.getItem(REGISTRO_VEHICULOS_STORAGE);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRegistroVehiculos(arr) {
  const list = Array.isArray(arr) ? arr : [];
  localStorage.setItem(REGISTRO_VEHICULOS_STORAGE, JSON.stringify(list));
  if (typeof window !== 'undefined' && window.backendApi && typeof window.backendApi.syncVehiculosRegistroToServer === 'function') {
    window.backendApi.syncVehiculosRegistroToServer(list);
  }
}

function claveMatriculaRegistro(mat) {
  return (mat || '').toString().trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
}

/** Fusiona registro vehículos: servidor + local (misma matrícula unificada). */
function mergeListasVehiculosRegistro(desdeServidor, locales) {
  const map = new Map();
  (Array.isArray(desdeServidor) ? desdeServidor : []).forEach(function (r) {
    const k = claveMatriculaRegistro(r && r.matricula);
    if (k) map.set(k, Object.assign({}, r));
  });
  (Array.isArray(locales) ? locales : []).forEach(function (r) {
    const k = claveMatriculaRegistro(r && r.matricula);
    if (!k) return;
    const prev = map.get(k) || {};
    map.set(k, Object.assign({}, prev, r));
  });
  return Array.from(map.values());
}

/** Busca por matrícula (misma lógica que BBDD clientes: ignora espacios y guiones) */
function getVehiculoByMatricula(matricula) {
  const mat = claveMatriculaRegistro(matricula);
  if (!mat) return null;
  const list = getRegistroVehiculos();
  return list.find(r => claveMatriculaRegistro(r.matricula) === mat) || null;
}

/** Añade o actualiza un vehículo en el registro. modelo = id del modelo en VEHICULOS_DB */
function guardarVehiculoRegistro(data) {
  const list = getRegistroVehiculos();
  const mat = claveMatriculaRegistro(data.matricula);
  if (!mat) return null;
  const idx = list.findIndex(r => claveMatriculaRegistro(r.matricula) === mat);
  const record = {
    matricula: data.matricula.trim(),
    modelo: data.modelo,
    nombreIC: (data.nombreIC || '').trim() || data.nombreIC,
    convenio: (data.convenio != null && String(data.convenio).trim() !== '') ? String(data.convenio).trim() : '',
    placaServicio: (data.placaServicio || '').trim() || '',
  };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record };
  } else {
    list.push(record);
  }
  saveRegistroVehiculos(list);
  return record;
}

if (typeof window !== 'undefined') {
  window.mergeListasVehiculosRegistro = mergeListasVehiculosRegistro;
}
