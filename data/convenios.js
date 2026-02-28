/**
 * Convenios (empresas y % descuento) - Salt Lab Cafe
 * Almacenamiento en localStorage. El admin puede ajustar desde el panel.
 * Cada convenio registra fecha de acuerdo y firmantes por ambas partes.
 */
const CONVENIOS_STORAGE = 'benny_convenios';

const CONVENIOS_DEFAULT = [
  { id: 'conv-na', nombre: 'N/A', descuento: 0, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-1', nombre: "BENNY's Original Motor Works", descuento: 20, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-2', nombre: 'SAPD', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-3', nombre: 'SAED', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-4', nombre: 'Badulaque central', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-5', nombre: 'Black Wheels Saloon', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-6', nombre: 'Burger Shot', descuento: 5, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-7', nombre: 'BurgerShot', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-8', nombre: 'Café de madera', descuento: 5, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-9', nombre: 'Departamento de Justicia', descuento: 5, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-10', nombre: "Hunter's", descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-11', nombre: 'Import Garage', descuento: 10, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-12', nombre: 'L.S. Airlines', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-13', nombre: 'Megamall', descuento: 5, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-14', nombre: 'Pizzería Venecia', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-15', nombre: 'Ruta 68', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-16', nombre: 'Skyline Vibes', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-17', nombre: 'Sushi Bar', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-18', nombre: 'Taller Wheels', descuento: 5, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-19', nombre: 'Vanilla Unicorn', descuento: 15, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-20', nombre: 'Weazel News', descuento: 10, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
  { id: 'conv-21', nombre: 'Woodford', descuento: 10, fechaAcuerdo: null, acordadoPorTaller: '', acordadoPorEmpresa: '', privado: false },
];

/** Devuelve convenios visibles para el usuario (oculta privados si no tiene permiso) */
function getConveniosVisibles(puedeVerPrivados) {
  const list = getConvenios();
  if (puedeVerPrivados) return list;
  return list.filter(c => !c.privado);
}

function getConvenios() {
  try {
    const raw = localStorage.getItem(CONVENIOS_STORAGE);
    let list = !raw ? JSON.parse(JSON.stringify(CONVENIOS_DEFAULT)) : JSON.parse(raw);
    list = list.map(c => ({ ...c, privado: c.privado === true }));
    return list;
  } catch {
    return JSON.parse(JSON.stringify(CONVENIOS_DEFAULT));
  }
}

function saveConvenios(convenios) {
  localStorage.setItem(CONVENIOS_STORAGE, JSON.stringify(convenios));
}

function generateConvenioId() {
  return 'conv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

