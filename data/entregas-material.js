/**
 * Registro de entregas de material a trabajadores.
 * Qué material, a quién, cuándo, cantidades y quién lo entregó.
 */
(function (global) {
  var STORAGE_ENTREGAS = 'benny_entregas_material';

  function getEntregasMaterial() {
    try {
      var raw = localStorage.getItem(STORAGE_ENTREGAS);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveEntregasMaterial(arr) {
    try {
      localStorage.setItem(STORAGE_ENTREGAS, JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch (e) {}
  }

  /**
   * Añade una entrega: { fecha, trabajadorId, trabajadorNombre, materialConcepto, materialLabel, cantidad, unidad, entregadoPorId, entregadoPorNombre }
   */
  function addEntregaMaterial(item) {
    var list = getEntregasMaterial();
    var id = 'ent-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    list.unshift({
      id: id,
      fecha: (item.fecha && item.fecha.trim()) ? item.fecha.trim() : new Date().toISOString(),
      trabajadorId: (item.trabajadorId || '').toString().trim(),
      trabajadorNombre: (item.trabajadorNombre || '').toString().trim(),
      materialConcepto: (item.materialConcepto || '').toString().trim(),
      materialLabel: (item.materialLabel || '').toString().trim(),
      cantidad: typeof item.cantidad === 'number' ? item.cantidad : (parseFloat(item.cantidad) || 1),
      unidad: (item.unidad || 'ud').toString().trim(),
      entregadoPorId: (item.entregadoPorId || '').toString().trim(),
      entregadoPorNombre: (item.entregadoPorNombre || '').toString().trim()
    });
    saveEntregasMaterial(list);
    return id;
  }

  function removeEntregaMaterial(id) {
    var list = getEntregasMaterial().filter(function (e) { return e.id !== id; });
    saveEntregasMaterial(list);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getEntregasMaterial: getEntregasMaterial,
      saveEntregasMaterial: saveEntregasMaterial,
      addEntregaMaterial: addEntregaMaterial,
      removeEntregaMaterial: removeEntregaMaterial
    };
  } else {
    global.getEntregasMaterial = getEntregasMaterial;
    global.saveEntregasMaterial = saveEntregasMaterial;
    global.addEntregaMaterial = addEntregaMaterial;
    global.removeEntregaMaterial = removeEntregaMaterial;
  }
})(typeof window !== 'undefined' ? window : this);
