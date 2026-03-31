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

if (typeof window !== 'undefined') {
  window.LSCM_CATALOGO_SOCIOS = LSCM_CATALOGO_SOCIOS;
  window.normalizeNumSocioLscmKey = normalizeNumSocioLscmKey;
  window.getLscmCatalogoNombrePorNumero = getLscmCatalogoNombrePorNumero;
}
