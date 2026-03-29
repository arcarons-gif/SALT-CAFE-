/**
 * Piezas de tuneo y sus costes de compra (según input/CONTENT/ALMACEN/precios piezas tuning.txt).
 * Categorías: kits, performance, cosmetics, custom.
 * Precio de venta al cliente: kits = coste×2 o override en localStorage; performance/custom/cosmetics = % valor vehículo (data/precios-piezas.js); pintura camaleónica = 5000 $ fijos.
 */
(function (global) {
  var CATEGORIAS_TUNEO = [
    { id: 'kits', nombre: 'Kits' },
    { id: 'performance', nombre: 'Performance' },
    { id: 'cosmetics', nombre: 'Cosmetics' },
    { id: 'custom', nombre: 'Custom' }
  ];

  var PIEZAS_TUNING = {
    kits: [
      { id: 'nos_10_disparos', nombre: 'NOS 10 Disparos (1lb)', coste: 7500 },
      { id: 'botella_nos_vacia', nombre: 'Botella NOS vacía (1lb)', coste: 2000 },
      { id: 'tinte_purga_nos', nombre: 'Tinte de purga NOS', coste: 12500 }
    ],
    performance: [
      { id: 'motor_vehiculo', nombre: 'Motor de vehículo', coste: 200 },
      { id: 'frenos_vehiculo', nombre: 'Frenos de vehículo', coste: 1100 },
      { id: 'transmision_vehiculo', nombre: 'Transmisión de vehículo', coste: 100 },
      { id: 'suspension_vehiculo', nombre: 'Suspensión de vehículo', coste: 100 },
      { id: 'blindaje_vehiculo', nombre: 'Blindaje de vehículo', coste: 100 },
      { id: 'turbo_vehiculo', nombre: 'Turbo de vehículo', coste: 100 }
    ],
    cosmetics: [
      { id: 'escape_vehiculo', nombre: 'Escape de vehículo', coste: 25 },
      { id: 'extras_vehiculo', nombre: 'Extras de vehículo', coste: 25 },
      { id: 'exterior_vehiculo', nombre: 'Exterior de vehículo', coste: 25 },
      { id: 'interior_vehiculo', nombre: 'Interior de vehículo', coste: 25 },
      { id: 'guardabarros_vehiculo', nombre: 'Guardabarros de vehículo', coste: 25 },
      { id: 'chasis_vehiculo', nombre: 'Chasis de vehículo', coste: 25 },
      { id: 'parachoques_delantero', nombre: 'Parachoques Delantero', coste: 25 },
      { id: 'parrilla_vehiculo', nombre: 'Parrilla de vehículo', coste: 25 },
      { id: 'capo_vehiculo', nombre: 'Capó de vehículo', coste: 25 },
      { id: 'bocina_vehiculo', nombre: 'Bocina de vehículo', coste: 25 },
      { id: 'luces_vehiculo', nombre: 'Luces de vehículo', coste: 25 },
      { id: 'vinilo_vehiculo', nombre: 'Vinilo de vehículo', coste: 25 },
      { id: 'neon_vehiculo', nombre: 'Neón de vehículo', coste: 25 },
      { id: 'matricula_vehiculo', nombre: 'Matrícula de vehículo', coste: 25 },
      { id: 'parachoques_trasero', nombre: 'Parachoques trasero', coste: 25 },
      { id: 'pintura_vehiculo', nombre: 'Pintura de vehículo', coste: 25 },
      { id: 'pintura_camaleonica', nombre: 'Pintura camaleónica', coste: 2500 },
      { id: 'llanta_vehiculo', nombre: 'Llanta de vehículo', coste: 25 },
      { id: 'techo_vehiculo', nombre: 'Techo de vehículo', coste: 25 },
      { id: 'aleron_vehiculo', nombre: 'Alerón de vehículo', coste: 25 },
      { id: 'humo_neumaticos', nombre: 'Humo de neumáticos', coste: 25 },
      { id: 'tinte_ventanas', nombre: 'Tinte de ventanas', coste: 25 }
    ],
    custom: [
      { id: 'neumaticos_drift', nombre: 'Neumáticos de drift', coste: 50 },
      { id: 'neumaticos_serie', nombre: 'Neumáticos de serie', coste: 50 }
    ]
  };

  function getPiezasPorCategoria(categoriaId) {
    return (PIEZAS_TUNING[categoriaId] || []).slice();
  }

  function getPiezaById(categoriaId, piezaId) {
    var list = PIEZAS_TUNING[categoriaId] || [];
    return list.find(function (p) { return p.id === piezaId; }) || null;
  }

  var STORAGE_PRECIOS_TUNEO = 'benny_precios_piezas_tuneo';

  /** Obtiene coste y precio de venta por pieza. { [piezaId]: { coste, precioVenta } }. Por defecto precioVenta = coste * 2. */
  function getPreciosPiezasTuneo() {
    try {
      var raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_PRECIOS_TUNEO) : null;
      var obj = raw ? JSON.parse(raw) : {};
      return obj;
    } catch (e) { return {}; }
  }

  function savePreciosPiezasTuneo(data) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_PRECIOS_TUNEO, JSON.stringify(data || {}));
    } catch (e) {}
  }

  var PRECIO_FIJO_PINTURA_CAMALEONICA = 5000;

  /**
   * Precio de venta al cliente. performance / custom / cosmetics: % del valor del vehículo por pieza (config en Precios piezas).
   * kits: override localStorage o coste×2. pintura_camaleonica: 5000 $ siempre.
   * @param {string} categoriaId
   * @param {string} piezaId
   * @param {number} [valorVehiculo] precioBase del vehículo seleccionado
   */
  function getPrecioVentaPiezaTuneo(categoriaId, piezaId, valorVehiculo) {
    var pieza = getPiezaById(categoriaId, piezaId);
    if (!pieza) return 0;
    if (piezaId === 'pintura_camaleonica') return PRECIO_FIJO_PINTURA_CAMALEONICA;
    var base = typeof valorVehiculo === 'number' && valorVehiculo > 0 ? valorVehiculo : 0;
    if (base > 0 && categoriaId === 'performance' && typeof global.getPrecioVentaPerformancePorcentaje === 'function') {
      var pp = global.getPrecioVentaPerformancePorcentaje();
      return Math.floor(base * (pp / 100));
    }
    if (base > 0 && categoriaId === 'custom' && typeof global.getPrecioVentaCustomPorcentaje === 'function') {
      var pc = global.getPrecioVentaCustomPorcentaje();
      return Math.floor(base * (pc / 100));
    }
    if (base > 0 && categoriaId === 'cosmetics' && typeof global.getPrecioVentaCosmeticPorcentaje === 'function') {
      var pco = global.getPrecioVentaCosmeticPorcentaje();
      return Math.floor(base * (pco / 100));
    }
    var coste = typeof pieza.coste === 'number' ? pieza.coste : 0;
    var precios = getPreciosPiezasTuneo();
    var p = precios[piezaId];
    if (p && typeof p.precioVenta === 'number' && p.precioVenta >= 0) return p.precioVenta;
    return coste * 2;
  }

  if (typeof global !== 'undefined') {
    global.CATEGORIAS_TUNEO = CATEGORIAS_TUNEO;
    global.PIEZAS_TUNING = PIEZAS_TUNING;
    global.getPiezasPorCategoria = getPiezasPorCategoria;
    global.getPiezaById = getPiezaById;
    global.getPreciosPiezasTuneo = getPreciosPiezasTuneo;
    global.savePreciosPiezasTuneo = savePreciosPiezasTuneo;
    global.getPrecioVentaPiezaTuneo = getPrecioVentaPiezaTuneo;
  }
})(typeof window !== 'undefined' ? window : this);
