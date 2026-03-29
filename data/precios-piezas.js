/**
 * Precios de venta y coste por artículo de reparación/tuneo.
 * - Partes chasis (carrocería): coste 15$/ud (documento).
 * - Partes esenciales: coste 40$/ud (documento).
 * - Cambio / swap motor: % valor vehículo (16%).
 * - Piezas performance: % valor vehículo por pieza (16%).
 * - Piezas custom: % valor vehículo por pieza (6%).
 * - Piezas cosmetic: % valor vehículo por pieza (5%). Pintura camaleónica: fija 5000 $ (piezas-tuning.js).
 * - Full tuning: % valor vehículo (40%).
 */
(function (global) {
  var STORAGE = 'benny_precios_piezas';

  var DEFAULTS = {
    chasis: { coste: 15, precioVenta: 30 },
    esenciales: { coste: 40, precioVenta: 65 },
    swapMotor: { coste: 0, precioVentaPorcentaje: 16 },
    performance: { coste: 0, precioVentaPorcentaje: 16 },
    cosmetic: { coste: 0, precioVentaPorcentaje: 5 },
    custom: { coste: 0, precioVentaPorcentaje: 6 },
    fullTuning: { coste: 0, precioVentaPorcentaje: 40 }
  };

  function cloneDefaults() {
    return {
      chasis: { ...DEFAULTS.chasis },
      esenciales: { ...DEFAULTS.esenciales },
      swapMotor: { ...DEFAULTS.swapMotor },
      performance: { ...DEFAULTS.performance },
      cosmetic: { ...DEFAULTS.cosmetic },
      custom: { ...DEFAULTS.custom },
      fullTuning: { ...DEFAULTS.fullTuning }
    };
  }

  function getPreciosPiezas() {
    try {
      var raw = localStorage.getItem(STORAGE);
      if (!raw) return cloneDefaults();
      var obj = JSON.parse(raw);
      return {
        chasis: {
          coste: typeof obj.chasis?.coste === 'number' ? obj.chasis.coste : DEFAULTS.chasis.coste,
          precioVenta: typeof obj.chasis?.precioVenta === 'number' ? obj.chasis.precioVenta : DEFAULTS.chasis.precioVenta
        },
        esenciales: {
          coste: typeof obj.esenciales?.coste === 'number' ? obj.esenciales.coste : DEFAULTS.esenciales.coste,
          precioVenta: typeof obj.esenciales?.precioVenta === 'number' ? obj.esenciales.precioVenta : DEFAULTS.esenciales.precioVenta
        },
        swapMotor: {
          coste: typeof obj.swapMotor?.coste === 'number' ? obj.swapMotor.coste : DEFAULTS.swapMotor.coste,
          precioVentaPorcentaje: typeof obj.swapMotor?.precioVentaPorcentaje === 'number' ? obj.swapMotor.precioVentaPorcentaje : DEFAULTS.swapMotor.precioVentaPorcentaje
        },
        performance: {
          coste: typeof obj.performance?.coste === 'number' ? obj.performance.coste : DEFAULTS.performance.coste,
          precioVentaPorcentaje: typeof obj.performance?.precioVentaPorcentaje === 'number' ? obj.performance.precioVentaPorcentaje : DEFAULTS.performance.precioVentaPorcentaje
        },
        cosmetic: {
          coste: typeof obj.cosmetic?.coste === 'number' ? obj.cosmetic.coste : DEFAULTS.cosmetic.coste,
          precioVentaPorcentaje: typeof obj.cosmetic?.precioVentaPorcentaje === 'number' ? obj.cosmetic.precioVentaPorcentaje : DEFAULTS.cosmetic.precioVentaPorcentaje
        },
        custom: {
          coste: typeof obj.custom?.coste === 'number' ? obj.custom.coste : DEFAULTS.custom.coste,
          precioVentaPorcentaje: typeof obj.custom?.precioVentaPorcentaje === 'number' ? obj.custom.precioVentaPorcentaje : DEFAULTS.custom.precioVentaPorcentaje
        },
        fullTuning: {
          coste: typeof obj.fullTuning?.coste === 'number' ? obj.fullTuning.coste : DEFAULTS.fullTuning.coste,
          precioVentaPorcentaje: typeof obj.fullTuning?.precioVentaPorcentaje === 'number' ? obj.fullTuning.precioVentaPorcentaje : DEFAULTS.fullTuning.precioVentaPorcentaje
        }
      };
    } catch (e) { return cloneDefaults(); }
  }

  function savePreciosPiezas(obj) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(obj || getPreciosPiezas()));
    } catch (e) {}
  }

  function getPrecioVentaChasis() {
    var p = getPreciosPiezas();
    return p.chasis && typeof p.chasis.precioVenta === 'number' ? p.chasis.precioVenta : 30;
  }

  function getPrecioVentaEsenciales() {
    var p = getPreciosPiezas();
    return p.esenciales && typeof p.esenciales.precioVenta === 'number' ? p.esenciales.precioVenta : 65;
  }

  /** Porcentaje del valor del vehículo para cambio / swap motor (p. ej. 16). */
  function getPrecioVentaSwapMotorPorcentaje() {
    var p = getPreciosPiezas();
    return p.swapMotor && typeof p.swapMotor.precioVentaPorcentaje === 'number' ? p.swapMotor.precioVentaPorcentaje : 16;
  }

  /** Precio de venta swap motor = porcentaje % del valor total del vehículo. */
  function getPrecioVentaSwapMotor(valorVehiculo) {
    if (typeof valorVehiculo !== 'number' || valorVehiculo <= 0) return 0;
    var pct = getPrecioVentaSwapMotorPorcentaje();
    return Math.floor(valorVehiculo * (pct / 100));
  }

  function getPrecioVentaPerformancePorcentaje() {
    var p = getPreciosPiezas();
    return p.performance && typeof p.performance.precioVentaPorcentaje === 'number' ? p.performance.precioVentaPorcentaje : 16;
  }

  /** Precio venta piezas performance = % valor vehículo por pieza (total = valor * (pct/100) * numPiezas). */
  function getPrecioVentaPerformance(valorVehiculo, numPiezas) {
    if (typeof valorVehiculo !== 'number' || valorVehiculo <= 0) return 0;
    var n = typeof numPiezas === 'number' ? numPiezas : 0;
    if (n <= 0) return 0;
    var pct = getPrecioVentaPerformancePorcentaje();
    return Math.floor(valorVehiculo * (pct / 100) * n);
  }

  function getPrecioVentaCosmeticPorcentaje() {
    var p = getPreciosPiezas();
    return p.cosmetic && typeof p.cosmetic.precioVentaPorcentaje === 'number' ? p.cosmetic.precioVentaPorcentaje : 5;
  }

  function getPrecioVentaCustomPorcentaje() {
    var p = getPreciosPiezas();
    return p.custom && typeof p.custom.precioVentaPorcentaje === 'number' ? p.custom.precioVentaPorcentaje : 6;
  }

  /** Precio venta piezas custom = % valor vehículo por pieza. */
  function getPrecioVentaCustom(valorVehiculo, numPiezas) {
    if (typeof valorVehiculo !== 'number' || valorVehiculo <= 0) return 0;
    var n = typeof numPiezas === 'number' ? numPiezas : 0;
    if (n <= 0) return 0;
    var pct = getPrecioVentaCustomPorcentaje();
    return Math.floor(valorVehiculo * (pct / 100) * n);
  }

  /** Precio venta piezas cosmetic = % valor vehículo por pieza (total = valor * (pct/100) * numPiezas). */
  function getPrecioVentaCosmetic(valorVehiculo, numPiezas) {
    if (typeof valorVehiculo !== 'number' || valorVehiculo <= 0) return 0;
    var n = typeof numPiezas === 'number' ? numPiezas : 0;
    if (n <= 0) return 0;
    var pct = getPrecioVentaCosmeticPorcentaje();
    return Math.floor(valorVehiculo * (pct / 100) * n);
  }

  function getPrecioVentaFullTuningPorcentaje() {
    var p = getPreciosPiezas();
    return p.fullTuning && typeof p.fullTuning.precioVentaPorcentaje === 'number' ? p.fullTuning.precioVentaPorcentaje : 40;
  }

  /** Precio de venta full tuning = % del valor total del vehículo (p. ej. 40%). */
  function getPrecioVentaFullTuning(valorVehiculo) {
    if (typeof valorVehiculo !== 'number' || valorVehiculo <= 0) return 0;
    var pct = getPrecioVentaFullTuningPorcentaje();
    return Math.floor(valorVehiculo * (pct / 100));
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getPreciosPiezas: getPreciosPiezas,
      savePreciosPiezas: savePreciosPiezas,
      getPrecioVentaChasis: getPrecioVentaChasis,
      getPrecioVentaEsenciales: getPrecioVentaEsenciales,
      getPrecioVentaSwapMotorPorcentaje: getPrecioVentaSwapMotorPorcentaje,
      getPrecioVentaSwapMotor: getPrecioVentaSwapMotor,
      getPrecioVentaPerformancePorcentaje: getPrecioVentaPerformancePorcentaje,
      getPrecioVentaPerformance: getPrecioVentaPerformance,
      getPrecioVentaCosmeticPorcentaje: getPrecioVentaCosmeticPorcentaje,
      getPrecioVentaCosmetic: getPrecioVentaCosmetic,
      getPrecioVentaCustomPorcentaje: getPrecioVentaCustomPorcentaje,
      getPrecioVentaCustom: getPrecioVentaCustom,
      getPrecioVentaFullTuningPorcentaje: getPrecioVentaFullTuningPorcentaje,
      getPrecioVentaFullTuning: getPrecioVentaFullTuning
    };
  } else {
    global.getPreciosPiezas = getPreciosPiezas;
    global.savePreciosPiezas = savePreciosPiezas;
    global.getPrecioVentaChasis = getPrecioVentaChasis;
    global.getPrecioVentaEsenciales = getPrecioVentaEsenciales;
    global.getPrecioVentaSwapMotorPorcentaje = getPrecioVentaSwapMotorPorcentaje;
    global.getPrecioVentaSwapMotor = getPrecioVentaSwapMotor;
    global.getPrecioVentaPerformancePorcentaje = getPrecioVentaPerformancePorcentaje;
    global.getPrecioVentaPerformance = getPrecioVentaPerformance;
    global.getPrecioVentaCosmeticPorcentaje = getPrecioVentaCosmeticPorcentaje;
    global.getPrecioVentaCosmetic = getPrecioVentaCosmetic;
    global.getPrecioVentaCustomPorcentaje = getPrecioVentaCustomPorcentaje;
    global.getPrecioVentaCustom = getPrecioVentaCustom;
    global.getPrecioVentaFullTuningPorcentaje = getPrecioVentaFullTuningPorcentaje;
    global.getPrecioVentaFullTuning = getPrecioVentaFullTuning;
  }
})(typeof window !== 'undefined' ? window : this);
