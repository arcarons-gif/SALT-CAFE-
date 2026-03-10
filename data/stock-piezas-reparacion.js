/**
 * Stock de piezas del negocio vinculado a reparaciones.
 * Partes del chasis y esenciales según input/CONTENT/ALMACEN/piezas esenciales.txt (costes: chasis 15$, esenciales 40$).
 */
(function (global) {
  var STORAGE = 'benny_stock_piezas_reparacion';

  var TIPOS_PIEZAS_CHASIS = [
    { id: 'capo', nombre: 'Capó de vehículo' },
    { id: 'maletero', nombre: 'Maletero de vehículo' },
    { id: 'puerta', nombre: 'Puerta de vehículo' },
    { id: 'rueda', nombre: 'Rueda de vehículo' },
    { id: 'ventana', nombre: 'Ventana de vehículo' }
  ];

  var TIPOS_PIEZAS_ESENCIALES = [
    { id: 'transmision', nombre: 'Transmisión' },
    { id: 'bomba_direccion', nombre: 'Bomba de dirección' },
    { id: 'alternador', nombre: 'Alternador' },
    { id: 'inyector', nombre: 'Inyector' },
    { id: 'frenos', nombre: 'Frenos' },
    { id: 'radiador', nombre: 'Radiador' },
    { id: 'celulas_bateria', nombre: 'Células de batería' },
    { id: 'motor_electrico', nombre: 'Motor eléctrico' }
  ];

  var STOCK_DEFAULT_CHASIS = { capo: 20, maletero: 10, puerta: 20, rueda: 30, ventana: 40 };
  var STOCK_DEFAULT_ESENCIALES = { transmision: 20, bomba_direccion: 15, alternador: 15, inyector: 20, frenos: 25, radiador: 15, celulas_bateria: 15, motor_electrico: 10 };

  function getStockPiezasReparacion() {
    try {
      var raw = localStorage.getItem(STORAGE);
      if (!raw) {
        return {
          chasis: Object.assign({}, STOCK_DEFAULT_CHASIS),
          esenciales: Object.assign({}, STOCK_DEFAULT_ESENCIALES)
        };
      }
      var obj = JSON.parse(raw);
      var chasis = {};
      var esenciales = {};
      TIPOS_PIEZAS_CHASIS.forEach(function (t) {
        chasis[t.id] = typeof obj.chasis && typeof obj.chasis[t.id] === 'number' ? obj.chasis[t.id] : (STOCK_DEFAULT_CHASIS[t.id] != null ? STOCK_DEFAULT_CHASIS[t.id] : 0);
      });
      TIPOS_PIEZAS_ESENCIALES.forEach(function (t) {
        esenciales[t.id] = typeof obj.esenciales && typeof obj.esenciales[t.id] === 'number' ? obj.esenciales[t.id] : (STOCK_DEFAULT_ESENCIALES[t.id] != null ? STOCK_DEFAULT_ESENCIALES[t.id] : 0);
      });
      return { chasis: chasis, esenciales: esenciales };
    } catch (e) {
      return {
        chasis: Object.assign({}, STOCK_DEFAULT_CHASIS),
        esenciales: Object.assign({}, STOCK_DEFAULT_ESENCIALES)
      };
    }
  }

  function saveStockPiezasReparacion(data) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(data || getStockPiezasReparacion()));
    } catch (e) {}
  }

  /**
   * Resta del stock las piezas indicadas.
   * chasisDesglose: array de ids (ej. ['puerta','puerta','cristal','cristal','cristal','cristal'])
   * esencialesDesglose: array de ids
   * Devuelve { ok: true } o { ok: false, error: 'mensaje', tipo: 'chasis'|'esenciales', id: '...' }
   */
  function restarStockPiezas(chasisDesglose, esencialesDesglose) {
    chasisDesglose = Array.isArray(chasisDesglose) ? chasisDesglose : [];
    esencialesDesglose = Array.isArray(esencialesDesglose) ? esencialesDesglose : [];
    var stock = getStockPiezasReparacion();
    var ch = stock.chasis;
    var es = stock.esenciales;
    var i;
    for (i = 0; i < chasisDesglose.length; i++) {
      var idCh = chasisDesglose[i];
      if (ch[idCh] == null) ch[idCh] = 0;
      if (ch[idCh] < 1) return { ok: false, error: 'Stock insuficiente de "' + (TIPOS_PIEZAS_CHASIS.find(function (t) { return t.id === idCh; }) || {}).nombre + '" (chasis).', tipo: 'chasis', id: idCh };
      ch[idCh]--;
    }
    for (i = 0; i < esencialesDesglose.length; i++) {
      var idEs = esencialesDesglose[i];
      if (es[idEs] == null) es[idEs] = 0;
      if (es[idEs] < 1) return { ok: false, error: 'Stock insuficiente de "' + (TIPOS_PIEZAS_ESENCIALES.find(function (t) { return t.id === idEs; }) || {}).nombre + '" (esenciales).', tipo: 'esenciales', id: idEs };
      es[idEs]--;
    }
    saveStockPiezasReparacion({ chasis: ch, esenciales: es });
    return { ok: true };
  }

  if (typeof global !== 'undefined') {
    global.getStockPiezasReparacion = getStockPiezasReparacion;
    global.saveStockPiezasReparacion = saveStockPiezasReparacion;
    global.restarStockPiezas = restarStockPiezas;
    global.TIPOS_PIEZAS_CHASIS = TIPOS_PIEZAS_CHASIS;
    global.TIPOS_PIEZAS_ESENCIALES = TIPOS_PIEZAS_ESENCIALES;
  }
})(typeof window !== 'undefined' ? window : this);
