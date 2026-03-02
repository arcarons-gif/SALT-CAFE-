/**
 * Registro TUNNINGS: fotos antes/después de tuneos.
 * Visible para todos los usuarios; solo administradores pueden eliminar fotos.
 */
(function (global) {
  const TUNNINGS_STORAGE = 'benny_tunnings';

  function getTunnings() {
    try {
      const raw = localStorage.getItem(TUNNINGS_STORAGE);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveTunnings(arr) {
    try {
      localStorage.setItem(TUNNINGS_STORAGE, JSON.stringify(arr));
    } catch (e) {}
  }

  /** Añade un registro de tuneo con fotos antes/después. */
  function addTunning(entry) {
    const list = getTunnings();
    const id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    const item = {
      id: id,
      matricula: entry.matricula || '',
      modelo: entry.modelo || '',
      fecha: entry.fecha || new Date().toISOString(),
      usuario: entry.usuario || '',
      fotoAntes: entry.fotoAntes || '',
      fotoDespues: entry.fotoDespues || '',
      importe: entry.importe,
      modificacion: entry.modificacion || 'Tuneo',
    };
    list.unshift(item);
    saveTunnings(list);
    return id;
  }

  /** Elimina un registro por id. Solo debe llamarse si el usuario es admin. */
  function removeTunning(id) {
    const list = getTunnings().filter(function (t) { return t.id !== id; });
    saveTunnings(list);
  }

  global.getTunnings = getTunnings;
  global.addTunning = addTunning;
  global.removeTunning = removeTunning;
  global.TUNNINGS_STORAGE = TUNNINGS_STORAGE;
})(typeof window !== 'undefined' ? window : this);
