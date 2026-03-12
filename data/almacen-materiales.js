/**
 * Materiales del almacén: recuperados de reparaciones y control de existencias.
 * Tipos fijos según inventario del taller (ACERO, ALUMINIO, COBRE, etc.).
 */
(function (global) {
  var STORAGE_ALMACEN = 'benny_almacen_materiales';
  var STORAGE_MOVIMIENTOS = 'benny_almacen_movimientos';

  /** Tipos de material recuperados en reparaciones (según captura: ACERO, ALUMINIO, COBRE, etc.) */
  var TIPOS_MATERIAL_ALMACEN = [
    { id: 'acero', nombre: 'ACERO', unidad: 'ud' },
    { id: 'aluminio', nombre: 'ALUMINIO', unidad: 'ud' },
    { id: 'cobre', nombre: 'COBRE', unidad: 'ud' },
    { id: 'laton', nombre: 'LATÓN', unidad: 'ud' },
    { id: 'chatarra_e', nombre: 'CHATARRA ELECTRÓNICA', unidad: 'ud' },
    { id: 'goma', nombre: 'GOMA', unidad: 'ud' },
    { id: 'plastico', nombre: 'PLÁSTICO', unidad: 'ud' },
    { id: 'aceite_sint', nombre: 'ACEITE SINTÉTICO', unidad: 'ud' },
    { id: 'fibra_carbono', nombre: 'FIBRA DE CARBONO', unidad: 'ud' },
    { id: 'acid', nombre: 'ÁCIDO', unidad: 'g' }
  ];

  /** Valores iniciales de stock: todo a 0 para partir de cero. */
  var SEED_STOCK = {
    acero: 0,
    aluminio: 0,
    cobre: 0,
    laton: 0,
    chatarra_e: 0,
    goma: 0,
    plastico: 0,
    aceite_sint: 0,
    fibra_carbono: 0,
    acid: 0
  };

  function getAlmacenMateriales() {
    try {
      var raw = localStorage.getItem(STORAGE_ALMACEN);
      if (!raw) return Object.assign({}, SEED_STOCK);
      var obj = JSON.parse(raw);
      var out = {};
      TIPOS_MATERIAL_ALMACEN.forEach(function (t) {
        out[t.id] = typeof obj[t.id] === 'number' ? obj[t.id] : (SEED_STOCK[t.id] != null ? SEED_STOCK[t.id] : 0);
      });
      return out;
    } catch (e) { return Object.assign({}, SEED_STOCK); }
  }

  function saveAlmacenMateriales(obj) {
    try {
      localStorage.setItem(STORAGE_ALMACEN, JSON.stringify(obj || {}));
    } catch (e) {}
  }

  /**
   * Añade cantidades al almacén (materiales recuperados).
   * movimiento: { acero?: number, aluminio?: number, ... } y opcionalmente fecha, origen (ej. id reparación), registradoPor
   */
  function addMaterialesAlmacen(movimiento, opts) {
    opts = opts || {};
    var stock = getAlmacenMateriales();
    var session = typeof getSession === 'function' ? getSession() : null;
    var now = new Date().toISOString();
    TIPOS_MATERIAL_ALMACEN.forEach(function (t) {
      var q = movimiento[t.id];
      if (typeof q === 'number' && q > 0) {
        stock[t.id] = (stock[t.id] || 0) + q;
      }
    });
    saveAlmacenMateriales(stock);
    var mov = {
      id: 'mov-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      fecha: opts.fecha || now,
      cantidades: movimiento,
      origen: opts.origen || 'manual',
      registradoPor: (opts.registradoPor || (session && (session.nombre || session.username)) || '')
    };
    var list = getMovimientosAlmacen();
    list.unshift(mov);
    try {
      localStorage.setItem(STORAGE_MOVIMIENTOS, JSON.stringify(list.slice(0, 500)));
    } catch (e) {}
    if (typeof window !== 'undefined' && window.backendApi && typeof window.backendApi.mergeAlmacen === 'function') {
      window.backendApi.mergeAlmacen(movimiento);
    }
    return stock;
  }

  function getMovimientosAlmacen() {
    try {
      var raw = localStorage.getItem(STORAGE_MOVIMIENTOS);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function getTotalMateriales() {
    var stock = getAlmacenMateriales();
    return Object.keys(stock).reduce(function (sum, id) { return sum + (stock[id] || 0); }, 0);
  }

  /**
   * Pone la cantidad de un material a cero (local y servidor).
   * Envía el delta negativo al backend para que el servidor también quede a 0.
   */
  function setStockMaterialCero(id) {
    var stock = getAlmacenMateriales();
    if (!TIPOS_MATERIAL_ALMACEN.some(function (t) { return t.id === id; })) return stock;
    var valorActual = typeof stock[id] === 'number' ? stock[id] : 0;
    stock[id] = 0;
    saveAlmacenMateriales(stock);
    if (valorActual !== 0 && typeof window !== 'undefined' && window.backendApi && typeof window.backendApi.mergeAlmacen === 'function') {
      var mov = {};
      mov[id] = -valorActual;
      window.backendApi.mergeAlmacen(mov);
    }
    return getAlmacenMateriales();
  }

  /**
   * Aplica aportaciones y retiradas a un material. Nuevo stock = actual + aportaciones - retiradas (mínimo 0).
   */
  function aplicarAportacionesRetiradas(id, aportaciones, retiradas) {
    var stock = getAlmacenMateriales();
    if (!TIPOS_MATERIAL_ALMACEN.some(function (t) { return t.id === id; })) return stock;
    var a = typeof aportaciones === 'number' ? aportaciones : 0;
    var r = typeof retiradas === 'number' ? retiradas : 0;
    var delta = a - r;
    stock[id] = Math.max(0, (stock[id] || 0) + delta);
    saveAlmacenMateriales(stock);
    if (delta !== 0 && typeof window !== 'undefined' && window.backendApi && typeof window.backendApi.mergeAlmacen === 'function') {
      var mov = {};
      mov[id] = delta;
      window.backendApi.mergeAlmacen(mov);
    }
    return getAlmacenMateriales();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      TIPOS_MATERIAL_ALMACEN: TIPOS_MATERIAL_ALMACEN,
      getAlmacenMateriales: getAlmacenMateriales,
      saveAlmacenMateriales: saveAlmacenMateriales,
      addMaterialesAlmacen: addMaterialesAlmacen,
      getMovimientosAlmacen: getMovimientosAlmacen,
      getTotalMateriales: getTotalMateriales,
      setStockMaterialCero: setStockMaterialCero,
      aplicarAportacionesRetiradas: aplicarAportacionesRetiradas
    };
  } else {
    global.TIPOS_MATERIAL_ALMACEN = TIPOS_MATERIAL_ALMACEN;
    global.getAlmacenMateriales = getAlmacenMateriales;
    global.saveAlmacenMateriales = saveAlmacenMateriales;
    global.addMaterialesAlmacen = addMaterialesAlmacen;
    global.getMovimientosAlmacen = getMovimientosAlmacen;
    global.getTotalMateriales = getTotalMateriales;
    global.setStockMaterialCero = setStockMaterialCero;
    global.aplicarAportacionesRetiradas = aplicarAportacionesRetiradas;
  }
})(typeof window !== 'undefined' ? window : this);
