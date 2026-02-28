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
  localStorage.setItem(REGISTRO_VEHICULOS_STORAGE, JSON.stringify(arr));
}

/** Busca por matrícula (normalizada: trim, mayúsculas) */
function getVehiculoByMatricula(matricula) {
  const mat = (matricula || '').trim().toUpperCase();
  if (!mat) return null;
  const list = getRegistroVehiculos();
  return list.find(r => (r.matricula || '').trim().toUpperCase() === mat) || null;
}

/** Añade o actualiza un vehículo en el registro. modelo = id del modelo en VEHICULOS_DB */
function guardarVehiculoRegistro(data) {
  const list = getRegistroVehiculos();
  const mat = (data.matricula || '').trim().toUpperCase();
  if (!mat) return null;
  const idx = list.findIndex(r => (r.matricula || '').trim().toUpperCase() === mat);
  const record = {
    matricula: data.matricula.trim(),
    modelo: data.modelo,
    nombreIC: (data.nombreIC || '').trim() || data.nombreIC,
    convenio: data.convenio || 'N/A',
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
