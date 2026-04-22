/**
 * Precios de venta y coste por artículo de reparación/tuneo.
 * - Partes chasis (carrocería): coste 15$/ud (documento).
 * - Partes esenciales: coste 40$/ud (documento).
 * - Cambio / swap motor: % valor vehículo (16%).
 * - Piezas performance: 1ª unidad = % valor vehículo (15% por defecto); 2ª y siguientes = 200 $/ud (fijo).
 * - Piezas custom: 1ª ud. = % valor (5,15% por defecto); 2ª+ = 100 $/ud (fijo).
 * - Piezas cosmetic: 1ª ud. = % valor (5,08% por defecto); 2ª+ = 50 $/ud (fijo). Pintura camaleónica: 5000 $ (piezas-tuning.js).
 * - Full tuning: % valor vehículo (40%).
 * - Kit de limpieza: coste compra ($), precio aplicado en reparación/tuneo ($), precio venta individual fuera de servicio ($).
 * - Copa Pistón: coste, precio en reparación/tuneo, venta individual (tienda).
 * - Kit de reparación (venta suelta / con servicio en taller): coste, precio en reparación/tuneo y precio venta individual en tienda (el kit policial sustitutivo sigue usando CONFIG.kitReparacionPrecio).
 */
(function (global) {
  var STORAGE = 'benny_precios_piezas';

  var DEFAULTS = {
    chasis: { coste: 15, precioVenta: 30 },
    esenciales: { coste: 40, precioVenta: 65 },
    swapMotor: { coste: 0, precioVentaPorcentaje: 16 },
    performance: { coste: 0, precioVentaPorcentaje: 15, precioUnidadAdicional: 200 },
    cosmetic: { coste: 0, precioVentaPorcentaje: 5.08, precioUnidadAdicional: 50 },
    custom: { coste: 0, precioVentaPorcentaje: 5.15, precioUnidadAdicional: 100 },
    fullTuning: { coste: 0, precioVentaPorcentaje: 40 },
    kitLimpieza: { coste: 25, precioEnServicio: 50, precioVentaIndividual: 75 },
    copaPiston: { coste: 100, precioEnServicio: 200, precioVentaIndividual: 200 },
    kitReparacionVenta: { coste: 350, precioEnServicio: 650, precioVentaIndividual: 650 }
  };

  function cloneDefaults() {
    return {
      chasis: { ...DEFAULTS.chasis },
      esenciales: { ...DEFAULTS.esenciales },
      swapMotor: { ...DEFAULTS.swapMotor },
      performance: { ...DEFAULTS.performance },
      cosmetic: { ...DEFAULTS.cosmetic },
      custom: { ...DEFAULTS.custom },
      fullTuning: { ...DEFAULTS.fullTuning },
      kitLimpieza: { ...DEFAULTS.kitLimpieza },
      copaPiston: { ...DEFAULTS.copaPiston },
      kitReparacionVenta: { ...DEFAULTS.kitReparacionVenta }
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
          precioVentaPorcentaje: typeof obj.performance?.precioVentaPorcentaje === 'number' ? obj.performance.precioVentaPorcentaje : DEFAULTS.performance.precioVentaPorcentaje,
          precioUnidadAdicional: typeof obj.performance?.precioUnidadAdicional === 'number' ? obj.performance.precioUnidadAdicional : DEFAULTS.performance.precioUnidadAdicional
        },
        cosmetic: {
          coste: typeof obj.cosmetic?.coste === 'number' ? obj.cosmetic.coste : DEFAULTS.cosmetic.coste,
          precioVentaPorcentaje: typeof obj.cosmetic?.precioVentaPorcentaje === 'number' ? obj.cosmetic.precioVentaPorcentaje : DEFAULTS.cosmetic.precioVentaPorcentaje,
          precioUnidadAdicional: typeof obj.cosmetic?.precioUnidadAdicional === 'number' ? obj.cosmetic.precioUnidadAdicional : DEFAULTS.cosmetic.precioUnidadAdicional
        },
        custom: {
          coste: typeof obj.custom?.coste === 'number' ? obj.custom.coste : DEFAULTS.custom.coste,
          precioVentaPorcentaje: typeof obj.custom?.precioVentaPorcentaje === 'number' ? obj.custom.precioVentaPorcentaje : DEFAULTS.custom.precioVentaPorcentaje,
          precioUnidadAdicional: typeof obj.custom?.precioUnidadAdicional === 'number' ? obj.custom.precioUnidadAdicional : DEFAULTS.custom.precioUnidadAdicional
        },
        fullTuning: {
          coste: typeof obj.fullTuning?.coste === 'number' ? obj.fullTuning.coste : DEFAULTS.fullTuning.coste,
          precioVentaPorcentaje: typeof obj.fullTuning?.precioVentaPorcentaje === 'number' ? obj.fullTuning.precioVentaPorcentaje : DEFAULTS.fullTuning.precioVentaPorcentaje
        },
        kitLimpieza: (function () {
          var kl = obj.kitLimpieza || {};
          var coste = typeof kl.coste === 'number' ? kl.coste : DEFAULTS.kitLimpieza.coste;
          var enServ =
            typeof kl.precioEnServicio === 'number'
              ? kl.precioEnServicio
              : typeof kl.precioVenta === 'number'
                ? kl.precioVenta
                : DEFAULTS.kitLimpieza.precioEnServicio;
          var indiv =
            typeof kl.precioVentaIndividual === 'number'
              ? kl.precioVentaIndividual
              : DEFAULTS.kitLimpieza.precioVentaIndividual;
          return { coste: coste, precioEnServicio: enServ, precioVentaIndividual: indiv };
        })(),
        copaPiston: (function () {
          var cp = obj.copaPiston || {};
          var coste = typeof cp.coste === 'number' ? cp.coste : DEFAULTS.copaPiston.coste;
          var enServ = typeof cp.precioEnServicio === 'number' ? cp.precioEnServicio : DEFAULTS.copaPiston.precioEnServicio;
          var indiv = typeof cp.precioVentaIndividual === 'number' ? cp.precioVentaIndividual : DEFAULTS.copaPiston.precioVentaIndividual;
          return { coste: coste, precioEnServicio: enServ, precioVentaIndividual: indiv };
        })(),
        kitReparacionVenta: (function () {
          var kr = obj.kitReparacionVenta || {};
          var coste = typeof kr.coste === 'number' ? kr.coste : DEFAULTS.kitReparacionVenta.coste;
          var indiv = typeof kr.precioVentaIndividual === 'number' ? kr.precioVentaIndividual : DEFAULTS.kitReparacionVenta.precioVentaIndividual;
          var enServ =
            typeof kr.precioEnServicio === 'number' ? kr.precioEnServicio : indiv;
          return { coste: coste, precioEnServicio: enServ, precioVentaIndividual: indiv };
        })()
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
    return p.performance && typeof p.performance.precioVentaPorcentaje === 'number' ? p.performance.precioVentaPorcentaje : 15;
  }

  function getPrecioUnidadAdicionalPerformance() {
    var p = getPreciosPiezas();
    var v = p.performance && typeof p.performance.precioUnidadAdicional === 'number' ? p.performance.precioUnidadAdicional : DEFAULTS.performance.precioUnidadAdicional;
    return v >= 0 ? v : 200;
  }

  /**
   * Performance por cantidad: 1ª ud. = % del valor del vehículo; cada ud. adicional (2ª, 3ª…) suma precio fijo (200 $ por defecto).
   */
  function getPrecioVentaPerformance(valorVehiculo, numPiezas) {
    if (typeof valorVehiculo !== 'number' || valorVehiculo <= 0) return 0;
    var n = typeof numPiezas === 'number' ? numPiezas : 0;
    if (n <= 0) return 0;
    var pct = getPrecioVentaPerformancePorcentaje();
    var primera = Math.floor(valorVehiculo * (pct / 100));
    var extraUds = Math.max(0, n - 1);
    var precioExtraUd = getPrecioUnidadAdicionalPerformance();
    return primera + extraUds * precioExtraUd;
  }

  function getPrecioVentaCosmeticPorcentaje() {
    var p = getPreciosPiezas();
    return p.cosmetic && typeof p.cosmetic.precioVentaPorcentaje === 'number' ? p.cosmetic.precioVentaPorcentaje : 5.08;
  }

  function getPrecioUnidadAdicionalCosmetic() {
    var p = getPreciosPiezas();
    var v = p.cosmetic && typeof p.cosmetic.precioUnidadAdicional === 'number' ? p.cosmetic.precioUnidadAdicional : DEFAULTS.cosmetic.precioUnidadAdicional;
    return v >= 0 ? v : 50;
  }

  function getPrecioVentaCustomPorcentaje() {
    var p = getPreciosPiezas();
    return p.custom && typeof p.custom.precioVentaPorcentaje === 'number' ? p.custom.precioVentaPorcentaje : 5.15;
  }

  function getPrecioUnidadAdicionalCustom() {
    var p = getPreciosPiezas();
    var v = p.custom && typeof p.custom.precioUnidadAdicional === 'number' ? p.custom.precioUnidadAdicional : DEFAULTS.custom.precioUnidadAdicional;
    return v >= 0 ? v : 100;
  }

  /** Custom por cantidad: 1ª ud. = % del valor del vehículo; 2ª+ = precio fijo por ud. (100 $ por defecto). */
  function getPrecioVentaCustom(valorVehiculo, numPiezas) {
    if (typeof valorVehiculo !== 'number' || valorVehiculo <= 0) return 0;
    var n = typeof numPiezas === 'number' ? numPiezas : 0;
    if (n <= 0) return 0;
    var pct = getPrecioVentaCustomPorcentaje();
    var primera = Math.floor(valorVehiculo * (pct / 100));
    var extraUds = Math.max(0, n - 1);
    return primera + extraUds * getPrecioUnidadAdicionalCustom();
  }

  /** Cosmetic por cantidad: 1ª ud. = % del valor del vehículo; 2ª+ = precio fijo por ud. (50 $ por defecto). */
  function getPrecioVentaCosmetic(valorVehiculo, numPiezas) {
    if (typeof valorVehiculo !== 'number' || valorVehiculo <= 0) return 0;
    var n = typeof numPiezas === 'number' ? numPiezas : 0;
    if (n <= 0) return 0;
    var pct = getPrecioVentaCosmeticPorcentaje();
    var primera = Math.floor(valorVehiculo * (pct / 100));
    var extraUds = Math.max(0, n - 1);
    return primera + extraUds * getPrecioUnidadAdicionalCosmetic();
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

  function getCosteKitLimpieza() {
    var p = getPreciosPiezas();
    return p.kitLimpieza && typeof p.kitLimpieza.coste === 'number' ? p.kitLimpieza.coste : DEFAULTS.kitLimpieza.coste;
  }

  /** Importe que se factura al cliente si marca el kit en una reparación o tuneo. */
  function getPrecioVentaKitLimpieza() {
    var p = getPreciosPiezas();
    var kl = p.kitLimpieza || {};
    if (typeof kl.precioEnServicio === 'number') return kl.precioEnServicio;
    if (typeof kl.precioVenta === 'number') return kl.precioVenta;
    return DEFAULTS.kitLimpieza.precioEnServicio;
  }

  /** Precio de venta al público si se vende el kit suelto (fuera de reparación/tuneo). */
  function getPrecioVentaKitLimpiezaIndividual() {
    var p = getPreciosPiezas();
    var kl = p.kitLimpieza || {};
    if (typeof kl.precioVentaIndividual === 'number') return kl.precioVentaIndividual;
    return DEFAULTS.kitLimpieza.precioVentaIndividual;
  }

  function getCosteCopaPiston() {
    var p = getPreciosPiezas();
    return p.copaPiston && typeof p.copaPiston.coste === 'number' ? p.copaPiston.coste : DEFAULTS.copaPiston.coste;
  }

  function getPrecioVentaCopaPiston() {
    var p = getPreciosPiezas();
    var cp = p.copaPiston || {};
    if (typeof cp.precioEnServicio === 'number') return cp.precioEnServicio;
    return DEFAULTS.copaPiston.precioEnServicio;
  }

  function getPrecioVentaCopaPistonIndividual() {
    var p = getPreciosPiezas();
    var cp = p.copaPiston || {};
    if (typeof cp.precioVentaIndividual === 'number') return cp.precioVentaIndividual;
    return DEFAULTS.copaPiston.precioVentaIndividual;
  }

  function getCosteKitReparacionVenta() {
    var p = getPreciosPiezas();
    return p.kitReparacionVenta && typeof p.kitReparacionVenta.coste === 'number' ? p.kitReparacionVenta.coste : DEFAULTS.kitReparacionVenta.coste;
  }

  function getPrecioVentaKitReparacionIndividual() {
    var p = getPreciosPiezas();
    var kr = p.kitReparacionVenta || {};
    if (typeof kr.precioVentaIndividual === 'number') return kr.precioVentaIndividual;
    if (typeof global.CONFIG !== 'undefined' && typeof global.CONFIG.kitReparacionPrecio === 'number') return global.CONFIG.kitReparacionPrecio;
    return DEFAULTS.kitReparacionVenta.precioVentaIndividual;
  }

  /** Precio al cliente si vende kit de reparación junto a una reparación o tuneo (no es el kit policial sustitutivo). */
  function getPrecioVentaKitReparacionEnServicio() {
    var p = getPreciosPiezas();
    var kr = p.kitReparacionVenta || {};
    if (typeof kr.precioEnServicio === 'number') return kr.precioEnServicio;
    if (typeof kr.precioVentaIndividual === 'number') return kr.precioVentaIndividual;
    if (typeof global.CONFIG !== 'undefined' && typeof global.CONFIG.kitReparacionPrecio === 'number') return global.CONFIG.kitReparacionPrecio;
    return DEFAULTS.kitReparacionVenta.precioEnServicio;
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
      getPrecioUnidadAdicionalPerformance: getPrecioUnidadAdicionalPerformance,
      getPrecioVentaPerformance: getPrecioVentaPerformance,
      getPrecioVentaCosmeticPorcentaje: getPrecioVentaCosmeticPorcentaje,
      getPrecioUnidadAdicionalCosmetic: getPrecioUnidadAdicionalCosmetic,
      getPrecioVentaCosmetic: getPrecioVentaCosmetic,
      getPrecioVentaCustomPorcentaje: getPrecioVentaCustomPorcentaje,
      getPrecioUnidadAdicionalCustom: getPrecioUnidadAdicionalCustom,
      getPrecioVentaCustom: getPrecioVentaCustom,
      getPrecioVentaFullTuningPorcentaje: getPrecioVentaFullTuningPorcentaje,
      getPrecioVentaFullTuning: getPrecioVentaFullTuning,
      getCosteKitLimpieza: getCosteKitLimpieza,
      getPrecioVentaKitLimpieza: getPrecioVentaKitLimpieza,
      getPrecioVentaKitLimpiezaIndividual: getPrecioVentaKitLimpiezaIndividual,
      getCosteCopaPiston: getCosteCopaPiston,
      getPrecioVentaCopaPiston: getPrecioVentaCopaPiston,
      getPrecioVentaCopaPistonIndividual: getPrecioVentaCopaPistonIndividual,
      getCosteKitReparacionVenta: getCosteKitReparacionVenta,
      getPrecioVentaKitReparacionIndividual: getPrecioVentaKitReparacionIndividual,
      getPrecioVentaKitReparacionEnServicio: getPrecioVentaKitReparacionEnServicio
    };
  } else {
    global.getPreciosPiezas = getPreciosPiezas;
    global.savePreciosPiezas = savePreciosPiezas;
    global.getPrecioVentaChasis = getPrecioVentaChasis;
    global.getPrecioVentaEsenciales = getPrecioVentaEsenciales;
    global.getPrecioVentaSwapMotorPorcentaje = getPrecioVentaSwapMotorPorcentaje;
    global.getPrecioVentaSwapMotor = getPrecioVentaSwapMotor;
    global.getPrecioVentaPerformancePorcentaje = getPrecioVentaPerformancePorcentaje;
    global.getPrecioUnidadAdicionalPerformance = getPrecioUnidadAdicionalPerformance;
    global.getPrecioVentaPerformance = getPrecioVentaPerformance;
    global.getPrecioVentaCosmeticPorcentaje = getPrecioVentaCosmeticPorcentaje;
    global.getPrecioUnidadAdicionalCosmetic = getPrecioUnidadAdicionalCosmetic;
    global.getPrecioVentaCosmetic = getPrecioVentaCosmetic;
    global.getPrecioVentaCustomPorcentaje = getPrecioVentaCustomPorcentaje;
    global.getPrecioUnidadAdicionalCustom = getPrecioUnidadAdicionalCustom;
    global.getPrecioVentaCustom = getPrecioVentaCustom;
    global.getPrecioVentaFullTuningPorcentaje = getPrecioVentaFullTuningPorcentaje;
    global.getPrecioVentaFullTuning = getPrecioVentaFullTuning;
    global.getCosteKitLimpieza = getCosteKitLimpieza;
    global.getPrecioVentaKitLimpieza = getPrecioVentaKitLimpieza;
    global.getPrecioVentaKitLimpiezaIndividual = getPrecioVentaKitLimpiezaIndividual;
    global.getCosteCopaPiston = getCosteCopaPiston;
    global.getPrecioVentaCopaPiston = getPrecioVentaCopaPiston;
    global.getPrecioVentaCopaPistonIndividual = getPrecioVentaCopaPistonIndividual;
    global.getCosteKitReparacionVenta = getCosteKitReparacionVenta;
    global.getPrecioVentaKitReparacionIndividual = getPrecioVentaKitReparacionIndividual;
    global.getPrecioVentaKitReparacionEnServicio = getPrecioVentaKitReparacionEnServicio;
  }
})(typeof window !== 'undefined' ? window : this);
