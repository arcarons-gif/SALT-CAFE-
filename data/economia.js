/**
 * Economía del taller: compras pendientes, inventario, gastos y previsiones.
 * Acceso: solo administradores o usuarios con permiso "gestionarCompras" (el admin puede otorgarlo en la ficha del empleado).
 * Persistencia en localStorage.
 */
(function (global) {
  var STORAGE_COMPRAS = 'benny_economia_compras';
  var STORAGE_INVENTARIO = 'benny_economia_inventario';
  var STORAGE_GASTOS = 'benny_economia_gastos';
  var STORAGE_PREVISIONES = 'benny_economia_previsiones';
  var STORAGE_LIMITES_STOCK = 'benny_economia_limites_stock';
  var _cachedCompras = null, _cachedInventario = null, _cachedGastos = null;

  // Control riguroso de existencias. Categorías por grupo; los admin (o quien tenga permiso) pueden dar de alta cualquier producto en cualquiera.
  var CATEGORIA_INVENTARIO = [
    { id: 'varios_comida', grupo: 'VARIOS', nombre: 'Comida' },
    { id: 'varios_bebida', grupo: 'VARIOS', nombre: 'Bebida' },
    { id: 'carroceria_puerta', grupo: 'CARROCERÍA', nombre: 'Puerta' },
    { id: 'carroceria_capo', grupo: 'CARROCERÍA', nombre: 'Capó' },
    { id: 'carroceria_maletero', grupo: 'CARROCERÍA', nombre: 'Maletero' },
    { id: 'carroceria_cristal', grupo: 'CARROCERÍA', nombre: 'Cristal' },
    { id: 'esenciales_bomba_direccion', grupo: 'COMPONENTES ESENCIALES', nombre: 'Bomba de dirección' },
    { id: 'esenciales_inyector', grupo: 'COMPONENTES ESENCIALES', nombre: 'Inyector' },
    { id: 'esenciales_alternador', grupo: 'COMPONENTES ESENCIALES', nombre: 'Alternador' },
    { id: 'esenciales_radiador', grupo: 'COMPONENTES ESENCIALES', nombre: 'Radiador' },
    { id: 'esenciales_rueda', grupo: 'COMPONENTES ESENCIALES', nombre: 'Rueda' },
    { id: 'esenciales_transmision', grupo: 'COMPONENTES ESENCIALES', nombre: 'Transmisión' },
    { id: 'esenciales_frenos', grupo: 'COMPONENTES ESENCIALES', nombre: 'Frenos' },
    { id: 'tuning_pintura', grupo: 'TUNING', nombre: 'Pintura' },
    { id: 'tuning_aleron', grupo: 'TUNING', nombre: 'Alerón' },
    { id: 'tuning_aletas', grupo: 'TUNING', nombre: 'Aletas' },
    { id: 'tuning_parachoque', grupo: 'TUNING', nombre: 'Parachoques' },
    { id: 'tuning_llantas', grupo: 'TUNING', nombre: 'Llantas' },
    { id: 'tuning_luces', grupo: 'TUNING', nombre: 'Luces' },
    { id: 'maquinaria_tablet_tuneo', grupo: 'MAQUINARIA', nombre: 'Tablet tuneo' },
    { id: 'maquinaria_maquina_diagnosis', grupo: 'MAQUINARIA', nombre: 'Máquina diagnosis' },
    { id: 'maquinaria_grua_motor', grupo: 'MAQUINARIA', nombre: 'Grúa motor' },
    { id: 'varios_otro', grupo: 'VARIOS', nombre: 'Otro (comida/bebida)' },
    { id: 'carroceria_otro', grupo: 'CARROCERÍA', nombre: 'Otro (carrocería)' },
    { id: 'esenciales_otro', grupo: 'COMPONENTES ESENCIALES', nombre: 'Otro (componente)' },
    { id: 'tuning_otro', grupo: 'TUNING', nombre: 'Otro (tuning)' },
    { id: 'maquinaria_otro', grupo: 'MAQUINARIA', nombre: 'Otro (maquinaria)' }
  ];

  var CATEGORIA_GASTO = [
    { id: 'alquiler', nombre: 'Alquiler' },
    { id: 'salarios', nombre: 'Salarios' },
    { id: 'devoluciones_regalos', nombre: 'Devoluciones y regalos (cojín)' },
    { id: 'suministros', nombre: 'Suministros' },
    { id: 'reparaciones_mantenimiento', nombre: 'Reparaciones y mantenimiento' },
    { id: 'seguros', nombre: 'Seguros' },
    { id: 'impuestos', nombre: 'Impuestos' },
    { id: 'material_taller', nombre: 'Material de taller' },
    { id: 'otros', nombre: 'Otros' }
  ];

  var ESTADO_COMPRA = [
    { id: 'pendiente', nombre: 'Pendiente' },
    { id: 'encargado', nombre: 'Encargado' },
    { id: 'recibido', nombre: 'Recibido' }
  ];

  function getComprasPendientes() {
    if (_cachedCompras !== null) return _cachedCompras;
    try {
      var raw = localStorage.getItem(STORAGE_COMPRAS);
      var arr = raw ? JSON.parse(raw) : [];
      _cachedCompras = Array.isArray(arr) ? arr : [];
      return _cachedCompras;
    } catch (e) { return (_cachedCompras = []); }
  }

  function saveComprasPendientes(arr) {
    _cachedCompras = Array.isArray(arr) ? arr : [];
    try { localStorage.setItem(STORAGE_COMPRAS, JSON.stringify(_cachedCompras)); } catch (e) {}
  }

  function addCompra(item) {
    var list = getComprasPendientes();
    var id = 'comp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    list.unshift({
      id: id,
      fecha: new Date().toISOString(),
      concepto: (item.concepto || '').trim(),
      categoria: (item.categoria || 'piezas').trim(),
      cantidad: typeof item.cantidad === 'number' ? item.cantidad : (parseFloat(item.cantidad) || 1),
      unidad: (item.unidad || 'ud').trim(),
      importeEstimado: typeof item.importeEstimado === 'number' ? item.importeEstimado : (parseFloat(String(item.importeEstimado).replace(',', '.')) || 0),
      solicitadoPor: (item.solicitadoPor || '').trim(),
      estado: (item.estado || 'pendiente').trim(),
      notas: (item.notas || '').trim()
    });
    saveComprasPendientes(list);
    return id;
  }

  function updateCompra(id, data) {
    var list = getComprasPendientes();
    var idx = list.findIndex(function (c) { return c.id === id; });
    if (idx === -1) return;
    var c = list[idx];
    if (data.concepto !== undefined) c.concepto = String(data.concepto).trim();
    if (data.categoria !== undefined) c.categoria = data.categoria;
    if (data.cantidad !== undefined) c.cantidad = typeof data.cantidad === 'number' ? data.cantidad : parseFloat(data.cantidad) || 0;
    if (data.unidad !== undefined) c.unidad = String(data.unidad).trim();
    if (data.importeEstimado !== undefined) c.importeEstimado = typeof data.importeEstimado === 'number' ? data.importeEstimado : parseFloat(String(data.importeEstimado).replace(',', '.')) || 0;
    if (data.solicitadoPor !== undefined) c.solicitadoPor = String(data.solicitadoPor).trim();
    if (data.estado !== undefined) c.estado = data.estado;
    if (data.notas !== undefined) c.notas = String(data.notas).trim();
    saveComprasPendientes(list);
  }

  function removeCompra(id) {
    var list = getComprasPendientes().filter(function (c) { return c.id !== id; });
    saveComprasPendientes(list);
  }

  /** Inventario = existencias por pieza: { [conceptoId]: cantidad }. Migra desde array (legacy) si aplica. */
  function getInventario() {
    if (_cachedInventario !== null) return _cachedInventario;
    try {
      var raw = localStorage.getItem(STORAGE_INVENTARIO);
      if (!raw) { _cachedInventario = {}; return _cachedInventario; }
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        var obj = {};
        parsed.forEach(function (i) {
          var c = (i.categoria || '').trim();
          if (c) obj[c] = (obj[c] || 0) + (parseFloat(i.cantidad) || 0);
        });
        saveInventario(obj);
        _cachedInventario = obj;
        return _cachedInventario;
      }
      _cachedInventario = typeof parsed === 'object' && parsed !== null ? parsed : {};
      return _cachedInventario;
    } catch (e) { return (_cachedInventario = {}); }
  }

  function saveInventario(obj) {
    _cachedInventario = typeof obj === 'object' && obj !== null ? obj : {};
    try { localStorage.setItem(STORAGE_INVENTARIO, JSON.stringify(_cachedInventario)); } catch (e) {}
  }

  function getStock(conceptoId) {
    var inv = getInventario();
    return (inv[conceptoId] != null && !isNaN(parseFloat(inv[conceptoId]))) ? parseFloat(inv[conceptoId]) : 0;
  }

  function addStock(conceptoId, cantidad) {
    if (!conceptoId) return;
    var inv = getInventario();
    var n = typeof cantidad === 'number' ? cantidad : (parseFloat(cantidad) || 0);
    inv[conceptoId] = (inv[conceptoId] != null ? parseFloat(inv[conceptoId]) : 0) + n;
    saveInventario(inv);
  }

  function setStock(conceptoId, cantidad) {
    if (!conceptoId) return;
    var inv = getInventario();
    inv[conceptoId] = (cantidad != null && !isNaN(parseFloat(cantidad))) ? parseFloat(cantidad) : 0;
    saveInventario(inv);
  }

  /** Resta cantidad del stock (mínimo 0). No hace nada si conceptoId vacío o cantidad <= 0. */
  function removeStock(conceptoId, cantidad) {
    if (!conceptoId) return;
    var n = typeof cantidad === 'number' ? cantidad : (parseInt(cantidad, 10) || 0);
    if (n <= 0) return;
    var inv = getInventario();
    var actual = (inv[conceptoId] != null && !isNaN(parseFloat(inv[conceptoId]))) ? parseFloat(inv[conceptoId]) : 0;
    inv[conceptoId] = Math.max(0, actual - n);
    saveInventario(inv);
  }

  function addInventarioItem(item) {
    var cat = (item && item.categoria) ? String(item.categoria).trim() : '';
    if (cat) addStock(cat, item.cantidad != null ? item.cantidad : 0);
    return 'inv-' + Date.now();
  }

  function updateInventarioItem(id, data) {
    if (data && data.categoria != null && data.cantidad !== undefined) setStock(data.categoria, data.cantidad);
  }

  function removeInventarioItem(id) { /* Control por pieza: no-op */ }

  function getCategoriaInventarioLabel(catId) {
    if (!catId) return '';
    var c = (CATEGORIA_INVENTARIO || []).find(function (x) { return x.id === catId; });
    return c ? (c.grupo ? c.grupo + ' · ' + c.nombre : c.nombre) : catId;
  }

  function getInventarioAlertaBajoStock() {
    var stock = getInventario();
    var limites = getLimitesStock();
    var categorias = CATEGORIA_INVENTARIO || [];
    var out = [];
    categorias.forEach(function (c) {
      var id = c.id;
      var min = (limites[id] && limites[id].stockMinimo != null) ? parseFloat(limites[id].stockMinimo) : 0;
      var cant = parseFloat(stock[id]) || 0;
      if (min > 0 && cant <= min) {
        out.push({
          conceptoId: id,
          nombre: (c.grupo ? c.grupo + ' · ' : '') + (c.nombre || id),
          cantidad: cant,
          unidad: 'ud',
          stockMinimo: min
        });
      }
    });
    return out;
  }

  function getLimitesStock() {
    try {
      var raw = localStorage.getItem(STORAGE_LIMITES_STOCK);
      var obj = raw ? JSON.parse(raw) : {};
      return typeof obj === 'object' && obj !== null ? obj : {};
    } catch (e) { return {}; }
  }

  function saveLimitesStock(obj) {
    try { localStorage.setItem(STORAGE_LIMITES_STOCK, JSON.stringify(obj || {})); } catch (e) {}
  }

  function setLimiteStock(conceptoId, data) {
    var obj = getLimitesStock();
    if (!obj[conceptoId]) obj[conceptoId] = { stockMinimo: 0, stockMaximo: null };
    if (data.stockMinimo !== undefined) obj[conceptoId].stockMinimo = typeof data.stockMinimo === 'number' ? data.stockMinimo : parseFloat(data.stockMinimo) || 0;
    if (data.stockMaximo !== undefined) {
      var v = data.stockMaximo;
      obj[conceptoId].stockMaximo = (v === '' || v === null || v === undefined) ? null : (typeof v === 'number' ? v : parseFloat(v));
    }
    saveLimitesStock(obj);
  }

  function getStockActualPorConcepto() {
    return getInventario();
  }

  function getNecesidadesReposicion() {
    var limites = getLimitesStock();
    var stockActual = getStockActualPorConcepto();
    var categorias = CATEGORIA_INVENTARIO || [];
    var necesidades = [];
    categorias.forEach(function (c) {
      var id = c.id;
      var lim = limites[id];
      var min = lim && lim.stockMinimo != null ? parseFloat(lim.stockMinimo) : 0;
      if (min <= 0) return;
      var actual = parseFloat(stockActual[id]) || 0;
      if (actual > min) return;
      var max = (lim && lim.stockMaximo != null && lim.stockMaximo !== '') ? parseFloat(lim.stockMaximo) : null;
      var aComprar = max != null && max > actual ? Math.max(0, max - actual) : Math.max(0, min - actual);
      var label = (c.grupo ? c.grupo + ' · ' : '') + (c.nombre || id);
      necesidades.push({
        conceptoId: id,
        conceptoLabel: label,
        cantidadActual: actual,
        stockMinimo: min,
        stockMaximo: max,
        cantidadAComprar: aComprar,
        unidad: 'ud'
      });
    });
    return necesidades;
  }

  function getGastos() {
    if (_cachedGastos !== null) return _cachedGastos;
    try {
      var raw = localStorage.getItem(STORAGE_GASTOS);
      var arr = raw ? JSON.parse(raw) : [];
      _cachedGastos = Array.isArray(arr) ? arr : [];
      return _cachedGastos;
    } catch (e) { return (_cachedGastos = []); }
  }

  function saveGastos(arr) {
    _cachedGastos = Array.isArray(arr) ? arr : [];
    try { localStorage.setItem(STORAGE_GASTOS, JSON.stringify(_cachedGastos)); } catch (e) {}
  }

  function addGasto(item) {
    var list = getGastos();
    var id = 'gasto-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    list.unshift({
      id: id,
      fecha: (item.fecha || new Date().toISOString().slice(0, 10)),
      categoria: (item.categoria || 'otros').trim(),
      concepto: (item.concepto || '').trim(),
      importe: typeof item.importe === 'number' ? item.importe : (parseFloat(String(item.importe).replace(',', '.')) || 0),
      registradoPor: (item.registradoPor || '').trim(),
      recurrente: !!item.recurrente,
      notas: (item.notas || '').trim()
    });
    saveGastos(list);
    return id;
  }

  function updateGasto(id, data) {
    var list = getGastos();
    var idx = list.findIndex(function (g) { return g.id === id; });
    if (idx === -1) return;
    var g = list[idx];
    if (data.fecha !== undefined) g.fecha = data.fecha;
    if (data.categoria !== undefined) g.categoria = data.categoria;
    if (data.concepto !== undefined) g.concepto = String(data.concepto).trim();
    if (data.importe !== undefined) g.importe = typeof data.importe === 'number' ? data.importe : parseFloat(String(data.importe).replace(',', '.')) || 0;
    if (data.registradoPor !== undefined) g.registradoPor = String(data.registradoPor).trim();
    if (data.recurrente !== undefined) g.recurrente = !!data.recurrente;
    if (data.notas !== undefined) g.notas = String(data.notas).trim();
    saveGastos(list);
  }

  function removeGasto(id) {
    var list = getGastos().filter(function (g) { return g.id !== id; });
    saveGastos(list);
  }

  function getGastosPorMes(anio, mes) {
    var list = getGastos();
    return list.filter(function (g) {
      var d = g.fecha ? new Date(g.fecha) : null;
      if (!d || isNaN(d.getTime())) return false;
      return d.getFullYear() === anio && (d.getMonth() + 1) === mes;
    });
  }

  function getTotalGastosPorMes(anio, mes) {
    return getGastosPorMes(anio, mes).reduce(function (sum, g) { return sum + (g.importe || 0); }, 0);
  }

  function getPrevisiones() {
    try {
      var raw = localStorage.getItem(STORAGE_PREVISIONES);
      var obj = raw ? JSON.parse(raw) : {};
      return typeof obj === 'object' && obj !== null ? obj : {};
    } catch (e) { return {}; }
  }

  function savePrevisiones(obj) {
    try { localStorage.setItem(STORAGE_PREVISIONES, JSON.stringify(obj || {})); } catch (e) {}
  }

  function getPrevisionMes(anio, mes) {
    var key = anio + '-' + (mes < 10 ? '0' + mes : mes);
    var prev = getPrevisiones();
    return prev[key] || {};
  }

  function setPrevisionMes(anio, mes, porCategoria) {
    var key = anio + '-' + (mes < 10 ? '0' + mes : mes);
    var prev = getPrevisiones();
    prev[key] = porCategoria || {};
    savePrevisiones(prev);
  }

  function invalidateEconomiaCaches() {
    _cachedCompras = null;
    _cachedInventario = null;
    _cachedGastos = null;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getComprasPendientes: getComprasPendientes,
      saveComprasPendientes: saveComprasPendientes,
      addCompra: addCompra,
      updateCompra: updateCompra,
      removeCompra: removeCompra,
      getInventario: getInventario,
      saveInventario: saveInventario,
      getStock: getStock,
      addStock: addStock,
      setStock: setStock,
      removeStock: removeStock,
      addInventarioItem: addInventarioItem,
      updateInventarioItem: updateInventarioItem,
      removeInventarioItem: removeInventarioItem,
      getCategoriaInventarioLabel: getCategoriaInventarioLabel,
      getInventarioAlertaBajoStock: getInventarioAlertaBajoStock,
      getLimitesStock: getLimitesStock,
      saveLimitesStock: saveLimitesStock,
      setLimiteStock: setLimiteStock,
      getStockActualPorConcepto: getStockActualPorConcepto,
      getNecesidadesReposicion: getNecesidadesReposicion,
      getGastos: getGastos,
      saveGastos: saveGastos,
      addGasto: addGasto,
      updateGasto: updateGasto,
      removeGasto: removeGasto,
      getGastosPorMes: getGastosPorMes,
      getTotalGastosPorMes: getTotalGastosPorMes,
      getPrevisiones: getPrevisiones,
      getPrevisionMes: getPrevisionMes,
      setPrevisionMes: setPrevisionMes,
      CATEGORIA_INVENTARIO: CATEGORIA_INVENTARIO,
      CATEGORIA_GASTO: CATEGORIA_GASTO,
      ESTADO_COMPRA: ESTADO_COMPRA
    };
  } else {
    global.getComprasPendientes = getComprasPendientes;
    global.saveComprasPendientes = saveComprasPendientes;
    global.addCompra = addCompra;
    global.updateCompra = updateCompra;
    global.removeCompra = removeCompra;
    global.getInventario = getInventario;
    global.saveInventario = saveInventario;
    global.getStock = getStock;
    global.addStock = addStock;
    global.setStock = setStock;
    global.removeStock = removeStock;
    global.addInventarioItem = addInventarioItem;
    global.updateInventarioItem = updateInventarioItem;
    global.removeInventarioItem = removeInventarioItem;
    global.getCategoriaInventarioLabel = getCategoriaInventarioLabel;
    global.getInventarioAlertaBajoStock = getInventarioAlertaBajoStock;
    global.getLimitesStock = getLimitesStock;
    global.saveLimitesStock = saveLimitesStock;
    global.setLimiteStock = setLimiteStock;
    global.getStockActualPorConcepto = getStockActualPorConcepto;
    global.getNecesidadesReposicion = getNecesidadesReposicion;
    global.getGastos = getGastos;
    global.saveGastos = saveGastos;
    global.addGasto = addGasto;
    global.updateGasto = updateGasto;
    global.removeGasto = removeGasto;
    global.getGastosPorMes = getGastosPorMes;
    global.getTotalGastosPorMes = getTotalGastosPorMes;
    global.getPrevisiones = getPrevisiones;
    global.getPrevisionMes = getPrevisionMes;
    global.setPrevisionMes = setPrevisionMes;
    global.CATEGORIA_INVENTARIO = CATEGORIA_INVENTARIO;
    global.CATEGORIA_GASTO = CATEGORIA_GASTO;
    global.ESTADO_COMPRA = ESTADO_COMPRA;
    global.invalidateEconomiaCaches = invalidateEconomiaCaches;
  }
})(typeof window !== 'undefined' ? window : this);
