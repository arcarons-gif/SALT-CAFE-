/**
 * Matrículas e imágenes de placas desde input/CONTENT/PLATES.
 * - matriculas.txt: una matrícula por línea; se muestran aleatoriamente (placeholder, etc.).
 * - listado-placas.txt: nombres de archivos de imagen (uno por línea); se elige una al azar como diseño de placa.
 *   Si no existe o está vacío, se usan los tres estilos por defecto (yankton, europe, sport).
 */
(function (global) {
  var PLATES_BASE = 'input/CONTENT/PLATES/';

  var MATRICULAS_EJEMPLO = [
    'HRUA9940',
    'ABC1234',
    'LSMD2025',
    'TUNE001',
    'REP7890',
    'SALT01',
    'CAFE42',
    'LSCM99',
    'GTARP1',
    'BENNY7'
  ];

  /** Estilos de placa por defecto (solo si no hay imágenes en el repo) */
  var PLATE_STYLES = ['matricula-plate-yankton', 'matricula-plate-europe', 'matricula-plate-sport'];

  /** Lista de URLs de imágenes de placas cargadas desde listado-placas.txt */
  var _plateImagesList = [];

  function getMatriculaAleatoria() {
    if (!MATRICULAS_EJEMPLO || MATRICULAS_EJEMPLO.length === 0) return 'HRUA9940';
    return MATRICULAS_EJEMPLO[Math.floor(Math.random() * MATRICULAS_EJEMPLO.length)];
  }

  /** Devuelve un estilo de placa aleatorio (clase CSS). Solo se usa si no hay imágenes en el repo. */
  function getPlateStyleAleatorio() {
    if (!PLATE_STYLES || PLATE_STYLES.length === 0) return 'matricula-plate-yankton';
    return PLATE_STYLES[Math.floor(Math.random() * PLATE_STYLES.length)];
  }

  /** Devuelve la URL de una imagen de placa aleatoria del repositorio PLATES, o null si no hay listado. */
  function getPlateImageAleatorio() {
    if (!_plateImagesList || _plateImagesList.length === 0) return null;
    return _plateImagesList[Math.floor(Math.random() * _plateImagesList.length)];
  }

  /** Devuelve si hay imágenes de placas cargadas desde el repo. */
  function hasPlateImagesFromRepo() {
    return _plateImagesList && _plateImagesList.length > 0;
  }

  function setMatriculasEjemplo(lista) {
    if (Array.isArray(lista) && lista.length > 0) {
      MATRICULAS_EJEMPLO = lista.map(function (m) { return (m || '').toString().trim(); }).filter(Boolean);
    }
  }

  /** Carga matrículas desde input/CONTENT/PLATES/matriculas.txt (una por línea). */
  function cargarMatriculasDesdePlates(cb) {
    var url = PLATES_BASE + 'matriculas.txt';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function () {
      if (xhr.status === 200 && xhr.responseText) {
        var lineas = xhr.responseText.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        if (lineas.length > 0) {
          setMatriculasEjemplo(lineas);
          if (typeof cb === 'function') cb(true);
        }
      }
      if (typeof cb === 'function') cb(false);
    };
    xhr.onerror = function () { if (typeof cb === 'function') cb(false); };
    xhr.send();
  }

  /** Carga listado de imágenes desde input/CONTENT/PLATES/listado-placas.txt (un nombre de archivo por línea). */
  function cargarListadoPlacas(cb) {
    var url = PLATES_BASE + 'listado-placas.txt';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onload = function () {
      _plateImagesList = [];
      if (xhr.status === 200 && xhr.responseText) {
        var lineas = xhr.responseText.split(/\r?\n/).map(function (l) { return (l || '').trim(); }).filter(Boolean);
        lineas.forEach(function (nombre) {
          if (nombre.indexOf('#') === 0) return;
          if (nombre.indexOf('/') === -1 && nombre.indexOf('..') === -1) {
            _plateImagesList.push(PLATES_BASE + nombre);
          }
        });
      }
      if (typeof cb === 'function') cb(_plateImagesList.length > 0);
    };
    xhr.onerror = function () { if (typeof cb === 'function') cb(false); };
    xhr.send();
  }

  global.PLATES_BASE = PLATES_BASE;
  global.MATRICULAS_EJEMPLO = MATRICULAS_EJEMPLO;
  global.PLATE_STYLES = PLATE_STYLES;
  global.getMatriculaAleatoria = getMatriculaAleatoria;
  global.getPlateStyleAleatorio = getPlateStyleAleatorio;
  global.getPlateImageAleatorio = getPlateImageAleatorio;
  global.hasPlateImagesFromRepo = hasPlateImagesFromRepo;
  global.setMatriculasEjemplo = setMatriculasEjemplo;
  global.cargarMatriculasDesdePlates = cargarMatriculasDesdePlates;
  global.cargarListadoPlacas = cargarListadoPlacas;
})(typeof window !== 'undefined' ? window : this);
