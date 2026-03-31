/**
 * Catálogo oficial nº socio LSCM → nombre (referencia interna del club).
 * No sustituye la BBDD: sirve de etiqueta y ayuda al vincular clientes.
 */
var LSCM_CATALOGO_SOCIOS = {
  '0001': 'Tyrone',
  '0002': 'Savannah',
  '0003': 'PB HB',
  '0004': 'Tommy',
  '0005': 'Alvaro',
  '0006': 'Ethan',
  '0007': 'Raul',
  '0008': 'David',
  '0009': 'Lolo',
  '0010': 'Lidia',
  '0011': 'Tai',
  '0012': 'Matth',
  '0013': 'Edgar',
  '0014': '',
  '0015': 'Alexandra',
  '0016': 'Karim',
  '0017': 'Orion',
  '0018': '',
  '0019': '',
  '0020': 'John',
};

function normalizeNumSocioLscmKey(num) {
  var s = (num == null ? '' : String(num)).trim();
  if (!s) return '';
  var n = parseInt(s, 10);
  if (isNaN(n)) return s;
  return String(n).padStart(4, '0');
}

function getLscmCatalogoNombrePorNumero(num) {
  var k = normalizeNumSocioLscmKey(num);
  if (!k) return '';
  if (!LSCM_CATALOGO_SOCIOS.hasOwnProperty(k)) return '';
  return (LSCM_CATALOGO_SOCIOS[k] || '').toString().trim();
}

/**
 * Crea en BBDD y en el registro del club las entradas del catálogo oficial que aún no existan
 * (misma lista 0001–0020 que pasaste como referencia). Idempotente: no duplica por nº de socio.
 */
function ensureCatalogSociosInBBDDAndRegistry() {
  if (typeof window === 'undefined') return;
  if (typeof LSCM_CATALOGO_SOCIOS === 'undefined') return;
  var getReg = window.getLscmSociosRegistry;
  var getBBDD = window.getClientesBBDD;
  var addBBDD = window.addOrUpdateClienteBBDD;
  var genId = window.generateIdCliente;
  var addSocio = window.addLscmSocioEntry;
  var norm = window.normalizeNumSocioLscmKey;
  if (!getReg || !getBBDD || !addBBDD || !genId || !addSocio || !norm) return;

  var keys = Object.keys(LSCM_CATALOGO_SOCIOS).sort();
  keys.forEach(function (k) {
    var reg = getReg();
    var numPadded = norm(k);
    if (!numPadded) return;

    var yaEnRegistro = reg.some(function (s) {
      return norm(s.numSocio) === numPadded || (s.numSocio || '').toString().trim() === numPadded;
    });
    if (yaEnRegistro) return;

    var list = getBBDD();
    var rowBBDD = list.find(function (r) {
      return norm(r.numeroSocioLSCM) === numPadded;
    });

    if (rowBBDD && rowBBDD.idCliente) {
      var idc = rowBBDD.idCliente.toString().trim();
      if (reg.some(function (s) { return (s.idCliente || '').toString().trim() === idc; })) return;
      var rLink = addSocio(idc, numPadded);
      if (rLink.error) console.warn('ensureCatalogSociosInBBDDAndRegistry', numPadded, rLink.error);
      return;
    }

    var nombre = (LSCM_CATALOGO_SOCIOS[k] || '').toString().trim() || ('Socio ' + numPadded);
    var idCliente = genId();
    var matPlaceholder = 'LSCM-' + numPadded;
    addBBDD({
      idCliente: idCliente,
      matricula: matPlaceholder,
      nombrePropietario: nombre,
      telefonoCliente: '',
      placaPolicial: '-',
      numeroSocioLSCM: numPadded,
      interacciones: 0,
      totalInvertido: 0,
    });
    var rNew = addSocio(idCliente, numPadded);
    if (rNew.error) console.warn('ensureCatalogSociosInBBDDAndRegistry', numPadded, rNew.error);
  });
}

if (typeof window !== 'undefined') {
  window.LSCM_CATALOGO_SOCIOS = LSCM_CATALOGO_SOCIOS;
  window.normalizeNumSocioLscmKey = normalizeNumSocioLscmKey;
  window.getLscmCatalogoNombrePorNumero = getLscmCatalogoNombrePorNumero;
  window.ensureCatalogSociosInBBDDAndRegistry = ensureCatalogSociosInBBDDAndRegistry;
  try {
    ensureCatalogSociosInBBDDAndRegistry();
  } catch (e) {
    console.warn('ensureCatalogSociosInBBDDAndRegistry', e);
  }
}
