/**
 * Sistema de autenticación y control de usuarios - SALTLAB Calculator
 * Almacenamiento local (localStorage). Para producción con backend, sustituir por API.
 */

const AUTH_STORAGE = 'benny_users';
const SESSION_STORAGE = 'benny_session';
const PASSWORD_PREDETERMINADA = '1234';
const ADMIN_RESET_FLAG = 'benny_admin_reset_1234';
/** Al migrar a v2, se sustituye la lista de usuarios por solo estos tres. */
const USUARIOS_PREDEFINIDOS_MIGRATION = 'benny_usuarios_predefinidos_v2';
/** Una vez: sincroniza contraseñas de admin y Savannah con las del seed (admin 7264; Savannah 1196). */
const SYNC_SEED_PASSWORDS_MIGRATION = 'benny_sync_seed_passwords_v2';
const MAX_USUARIOS = 100;
/** Una vez: quitar obligación de cambiar contraseña en primer acceso para todos salvo admin (login solo admin con password). */
const MIGRATE_NO_CAMBIAR_PASSWORD_OBLIGATORIO_NO_ADMIN = 'benny_no_cambiar_password_obligatorio_no_admin_v1';

/**
 * Solo estos logins se vuelven a crear solos si faltan (cuentas de sistema).
 * ETHAN está en SEED_USERS para la migración inicial; un admin puede borrarlo.
 */
const USERNAMES_SEED_SIEMPRE_RECREAR = ['admin', 'savannah', 'tyrone'];

/** Únicos usuarios predefinidos. Instalaciones nuevas: admin, Savannah, Tyrone y ETHAN. */
const SEED_USERS = [
  { username: 'admin', nombre: 'Administrador', password: '7264', rol: 'admin' },
  { username: 'Savannah', nombre: 'Savannah', password: '1196', rol: 'admin' },
  { username: 'Tyrone', nombre: 'Tyrone', password: '1234', rol: 'admin' },
  {
    username: 'ETHAN',
    nombre: 'ETHAN',
    password: 'saltlab-ethan-bootstrap-interno-no-usar',
    rol: 'mecanico',
    cambiarPasswordObligatorio: true,
    primerAccesoSinPassword: true,
  },
];

/** Usuarios cuya contraseña no puede ser cambiada (admin y Savannah). */
const USUARIOS_CONTRASENA_BLOQUEADA = ['admin', 'savannah'];
function isUsuarioContrasenaProtegida(username) {
  const u = (username || '').toString().trim().toLowerCase();
  return USUARIOS_CONTRASENA_BLOQUEADA.includes(u);
}

// Permisos disponibles
const PERMISOS = {
  verCalculadora: 'Usar la calculadora',
  verPresupuesto: 'Ver presupuesto y descuentos',
  registrarTuneo: 'Registrar tuneos',
  registrarReparacion: 'Registrar reparaciones',
  verRegistroServicios: 'Ver registro de servicios',
  limpiarRegistro: 'Limpiar registro de servicios',
  verOrganigrama: 'Ver organigrama',
  gestionarUsuarios: 'Gestionar usuarios (admin)',
  gestionarEquipo: 'Gestionar mi equipo (solo usuarios a mi cargo)',
  noRequiereAprobacionAdmin: 'No requiere aprobación admin (cambios por responsable se aplican directo)',
  gestionarRegistroClientes: 'Ver y editar BBDD de clientes / Aprobar altas',
  verConveniosPrivados: 'Ver convenios privados (máximos responsables)',
  gestionarCompras: 'Compras y existencias (compras, inventario; solo admin por defecto, se puede otorgar a empleados)',
  exentoTestNormativas: 'Exento del test de normativas (no obligatorio hacer el test de comprensión)',
  gestionarClubLscm: 'Gestionar club de socios LSCM (altas, vehículos vinculados a BBDD clientes)',
};

/** Permisos por defecto para mecánicos/peones si no se envía objeto (p. ej. autoregistro). Incluye presupuesto y descuentos. */
var DEFAULT_PERMISOS_MECANICO_CALCULADORA = {
  verCalculadora: true,
  verPresupuesto: true,
  registrarTuneo: true,
  registrarReparacion: true,
  verRegistroServicios: true,
  verOrganigrama: true,
};

var ADMIN_PERMISOS_FULL = {
  verCalculadora: true,
  verPresupuesto: true,
  registrarTuneo: true,
  registrarReparacion: true,
  verRegistroServicios: true,
  limpiarRegistro: true,
  verOrganigrama: true,
  gestionarUsuarios: true,
  gestionarEquipo: true,
  noRequiereAprobacionAdmin: true,
  gestionarRegistroClientes: true,
  verConveniosPrivados: true,
  gestionarCompras: true,
  exentoTestNormativas: false,
  gestionarClubLscm: false,
};

function createDefaultAdmin(passwordHash, salt) {
  return {
    id: 'admin-default',
    username: 'admin',
    passwordHash,
    salt,
    nombre: 'Administrador',
    rol: 'admin',
    permisos: Object.assign({}, ADMIN_PERMISOS_FULL),
    activo: true,
    cambiarPasswordObligatorio: false,
    creadoPor: 'system',
    fechaCreacion: new Date().toISOString(),
    fechaAlta: new Date().toISOString().slice(0, 10),
    responsable: null,
    puesto: 'Administrador',
    salario: null,
    fotoPerfil: null,
    equipo: [],
    fotosFicha: [],
    fondoFichaIndex: null,
  };
}

function buildSeedAdminUser(seed, passwordHash, salt) {
  const id = seed.username.toLowerCase() === 'admin' ? 'admin-default' : 'u-seed-' + (seed.username || '').replace(/\s+/g, '-');
  const base = {
    id,
    username: seed.username,
    passwordHash,
    salt,
    nombre: seed.nombre || seed.username,
    rol: seed.rol || 'admin',
    permisos: seed.rol === 'admin' ? Object.assign({}, ADMIN_PERMISOS_FULL) : {},
    activo: true,
    cambiarPasswordObligatorio: seed.cambiarPasswordObligatorio === true,
    primerAccesoSinPassword: seed.primerAccesoSinPassword === true,
    creadoPor: 'system',
    fechaCreacion: new Date().toISOString(),
    fechaAlta: new Date().toISOString().slice(0, 10),
    responsable: null,
    puesto: seed.username === 'admin' ? 'Administrador' : '',
    salario: null,
    fotoPerfil: null,
    equipo: [],
    fotosFicha: [],
    fondoFichaIndex: null,
  };
  if ((seed.username || '').toString().trim().toLowerCase() === 'savannah') {
    base.vehiculos = [
      { matricula: 'VOBN5712', codigoVehiculo: 'primo', nombreVehiculo: 'Primo', categoria: 'Sedans' },
      { matricula: 'SAVP001', codigoVehiculo: 'previon', nombreVehiculo: 'Previon', categoria: 'Coupes' },
      { matricula: 'SAVW001', codigoVehiculo: 'l35', nombreVehiculo: 'Walton L35', categoria: 'Todoterrenos' },
    ];
  }
  return base;
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPassword(password, storedHash, salt) {
  const hash = await hashPassword(password, salt);
  return hash === storedHash;
}

let _cachedUsers = null;
function getUsers() {
  if (_cachedUsers !== null) return _cachedUsers;
  try {
    const data = localStorage.getItem(AUTH_STORAGE);
    if (!data) return (_cachedUsers = []);
    const users = JSON.parse(data);
    _cachedUsers = Array.isArray(users) ? users : [];
    return _cachedUsers;
  } catch {
    return (_cachedUsers = []);
  }
}
function invalidateUsersCache() {
  _cachedUsers = null;
}
if (typeof window !== 'undefined') window.invalidateUsersCache = invalidateUsersCache;

const USERS_REMOVED_IDS_KEY = 'benny_users_removed_ids';
const USERS_REMOVED_USERNAMES_KEY = 'benny_users_removed_usernames';
/** Una vez: elimina «Gerald J» del registro y evita que vuelva desde copias del servidor antiguas. */
const PURGE_GERALD_J_MIGRATION = 'benny_purge_gerald_j_v1';
/** Una vez: empleados no admin con permisos vacíos reciben permisos mínimos de calculadora (incl. verPresupuesto). */
const MIGRATE_PERMISOS_MECANICO_VACIOS = 'benny_migrate_mecanico_permisos_calc_v1';

function trackUserDeletedFromDirectory(userId, username) {
  if (userId) {
    try {
      var raw = localStorage.getItem(USERS_REMOVED_IDS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      if (arr.indexOf(userId) === -1) arr.push(userId);
      localStorage.setItem(USERS_REMOVED_IDS_KEY, JSON.stringify(arr));
    } catch (_) {}
  }
  var un = (username || '').toString().trim().toLowerCase();
  if (!un) return;
  try {
    var rawN = localStorage.getItem(USERS_REMOVED_USERNAMES_KEY);
    var arrN = rawN ? JSON.parse(rawN) : [];
    if (!Array.isArray(arrN)) arrN = [];
    if (arrN.indexOf(un) === -1) arrN.push(un);
    localStorage.setItem(USERS_REMOVED_USERNAMES_KEY, JSON.stringify(arrN));
  } catch (_) {}
}

function clearUsersRemovedIds() {
  try {
    localStorage.removeItem(USERS_REMOVED_IDS_KEY);
    localStorage.removeItem(USERS_REMOVED_USERNAMES_KEY);
  } catch (_) {}
}

/**
 * Fusiona la lista del servidor con la local: por id gana la copia con fecha más reciente;
 * excluye ids borrados en este dispositivo hasta que un POST al servidor confirme el guardado.
 *
 * Si un id está en local pero el servidor ya no lo devuelve: solo se conserva como “alta pendiente”
 * cuando su marca temporal es >= la actividad más reciente del servidor. Así un borrado hecho en
 * otro PC no reaparece al fusionar con una copia local obsoleta.
 */
function mergeUsersFromServer(serverList) {
  if (!Array.isArray(serverList)) return [];
  var localRaw = localStorage.getItem(AUTH_STORAGE);
  var localList = [];
  try {
    localList = localRaw ? JSON.parse(localRaw) : [];
  } catch (_) {
    localList = [];
  }
  if (!Array.isArray(localList)) localList = [];
  var removed = [];
  try {
    var removedRaw = localStorage.getItem(USERS_REMOVED_IDS_KEY);
    removed = removedRaw ? JSON.parse(removedRaw) : [];
  } catch (_) {
    removed = [];
  }
  if (!Array.isArray(removed)) removed = [];
  var removedSet = {};
  removed.forEach(function (id) {
    if (id) removedSet[id] = true;
  });
  var removedNames = [];
  try {
    var rn = localStorage.getItem(USERS_REMOVED_USERNAMES_KEY);
    removedNames = rn ? JSON.parse(rn) : [];
  } catch (_) {
    removedNames = [];
  }
  if (!Array.isArray(removedNames)) removedNames = [];
  var removedNamesSet = {};
  removedNames.forEach(function (n) {
    if (n) removedNamesSet[(n || '').toString().trim().toLowerCase()] = true;
  });

  function ts(u) {
    if (!u) return 0;
    var t = u.fechaActualizacion || u.fechaCreacion || '';
    if (t) {
      var ms = new Date(t).getTime();
      if (!isNaN(ms)) return ms;
    }
    if (u.fechaAlta && String(u.fechaAlta).trim()) {
      var d = new Date(String(u.fechaAlta).trim().slice(0, 10) + 'T12:00:00');
      var n = d.getTime();
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }
  var byId = {};
  var serverMaxTs = 0;
  serverList.forEach(function (u) {
    if (!u || !u.id) return;
    byId[u.id] = u;
    serverMaxTs = Math.max(serverMaxTs, ts(u));
  });
  localList.forEach(function (u) {
    if (!u || !u.id) return;
    var ex = byId[u.id];
    if (!ex) {
      var tLocal = ts(u);
      var pendienteSync = !!u.pendienteSync;
      // Sin ninguna fecha en el servidor (datos muy antiguos): conservar altas locales como antes.
      // También conservar altas/ediciones locales pendientes de confirmar en backend para que no
      // desaparezcan por desfase de reloj entre cliente y servidor.
      if (pendienteSync || serverMaxTs === 0 || tLocal >= serverMaxTs) {
        byId[u.id] = u;
      }
      return;
    }
    byId[u.id] = ts(u) >= ts(ex) ? u : ex;
  });
  var merged = Object.keys(byId)
    .map(function (k) {
      return byId[k];
    })
    .filter(function (u) {
      if (!u) return false;
      if (removedSet[u.id]) return false;
      var nu = (u.username || '').toString().trim().toLowerCase();
      if (nu && removedNamesSet[nu]) return false;
      return true;
    });

  /**
   * Quitar tombstones solo cuando el servidor ya no devuelve ese id.
   * Antes se limpiaba toda la lista tras POST; si el GET siguiente aún traía datos viejos,
   * el usuario borrado volvía a aparecer al fusionar.
   */
  try {
    var serverIds = {};
    serverList.forEach(function (u) {
      if (u && u.id) serverIds[u.id] = true;
    });
    var nextRemoved = removed.filter(function (rid) {
      return rid && serverIds[rid];
    });
    if (nextRemoved.length !== removed.length) {
      localStorage.setItem(USERS_REMOVED_IDS_KEY, JSON.stringify(nextRemoved));
    }
  } catch (_) {}

  try {
    var serverNames = {};
    serverList.forEach(function (u) {
      if (u && u.username) serverNames[(u.username || '').toString().trim().toLowerCase()] = true;
    });
    var nextRemovedNames = removedNames.filter(function (name) {
      return name && serverNames[name];
    });
    if (nextRemovedNames.length !== removedNames.length) {
      localStorage.setItem(USERS_REMOVED_USERNAMES_KEY, JSON.stringify(nextRemovedNames));
    }
  } catch (_) {}

  return merged;
}

if (typeof window !== 'undefined') {
  window.clearUsersRemovedIds = clearUsersRemovedIds;
  window.mergeUsersFromServer = mergeUsersFromServer;
}

/**
 * Migración inicial: carga todos los SEED_USERS una vez.
 * Después solo se recrean si faltan admin, Savannah o Tyrone (USERNAMES_SEED_SIEMPRE_RECREAR).
 */
function loginRequiereContrasenaObligatoria(username) {
  return (username || '').toString().trim().toLowerCase() === 'admin';
}

/** Solo `admin` puede quedar con cambio de contraseña obligatorio tras login; el resto entra sin ese bloqueo. */
function aplicarPoliticaCambioPasswordLogin(user, safeUser) {
  if (!user || !safeUser) return;
  if (!loginRequiereContrasenaObligatoria(user.username)) {
    safeUser.cambiarPasswordObligatorio = false;
  } else {
    safeUser.cambiarPasswordObligatorio = !!user.cambiarPasswordObligatorio;
  }
}

async function ensureSeedUsers() {
  if (!localStorage.getItem(USUARIOS_PREDEFINIDOS_MIGRATION)) {
    const users = [];
    for (const seed of SEED_USERS) {
      const salt = crypto.randomUUID() + Date.now();
      const passwordHash = await hashPassword(seed.password, salt);
      users.push(buildSeedAdminUser(seed, passwordHash, salt));
    }
    saveUsers(users);
    localStorage.setItem(USUARIOS_PREDEFINIDOS_MIGRATION, '1');
    return;
  }
  let users = getUsers();
  let changed = false;
  for (const seed of SEED_USERS) {
    const seedName = (seed.username || '').toString().trim().toLowerCase();
    if (!USERNAMES_SEED_SIEMPRE_RECREAR.some(function (n) {
      return n.toLowerCase() === seedName;
    })) {
      continue;
    }
    const exists = users.some(function (u) {
      return (u.username || '').toString().trim().toLowerCase() === (seed.username || '').toString().trim().toLowerCase();
    });
    if (exists) continue;
    const salt = crypto.randomUUID() + Date.now();
    const passwordHash = await hashPassword(seed.password, salt);
    users.push(buildSeedAdminUser(seed, passwordHash, salt));
    changed = true;
  }
  if (changed) saveUsers(users);
  // Migración: Savannah debe tener vehiculos en su ficha
  users = getUsers();
  var savannah = users.find(function (u) { return (u.username || '').toString().trim().toLowerCase() === 'savannah'; });
  if (savannah && (!Array.isArray(savannah.vehiculos) || savannah.vehiculos.length === 0)) {
    savannah.vehiculos = [
      { matricula: 'VOBN5712', codigoVehiculo: 'primo', nombreVehiculo: 'Primo', categoria: 'Sedans' },
      { matricula: 'SAVP001', codigoVehiculo: 'previon', nombreVehiculo: 'Previon', categoria: 'Coupes' },
      { matricula: 'SAVW001', codigoVehiculo: 'l35', nombreVehiculo: 'Walton L35', categoria: 'Todoterrenos' },
    ];
    saveUsers(users);
  }
  // Sincronizar contraseñas de admin y Savannah con el seed (una sola vez)
  if (!localStorage.getItem(SYNC_SEED_PASSWORDS_MIGRATION)) {
    users = getUsers();
    var toSync = SEED_USERS.filter(function (s) {
      var u = (s.username || '').toString().trim().toLowerCase();
      return u === 'admin' || u === 'savannah';
    });
    await Promise.all(toSync.map(function (seed) {
      var existing = users.find(function (u) {
        return (u.username || '').toString().trim().toLowerCase() === (seed.username || '').toString().trim().toLowerCase();
      });
      if (!existing) return Promise.resolve();
      var salt = crypto.randomUUID() + Date.now();
      return hashPassword(seed.password, salt).then(function (hash) {
        existing.passwordHash = hash;
        existing.salt = salt;
      });
    }));
    saveUsers(users);
    localStorage.setItem(SYNC_SEED_PASSWORDS_MIGRATION, '1');
  }
  if (!localStorage.getItem(PURGE_GERALD_J_MIGRATION)) {
    var gu = getUsers();
    gu.forEach(function (u) {
      if ((u.username || '').toString().trim().toLowerCase() === 'gerald j') {
        trackUserDeletedFromDirectory(u.id, u.username);
      }
    });
    gu = gu.filter(function (u) {
      return (u.username || '').toString().trim().toLowerCase() !== 'gerald j';
    });
    trackUserDeletedFromDirectory(null, 'Gerald J');
    saveUsers(gu);
    localStorage.setItem(PURGE_GERALD_J_MIGRATION, '1');
  }
  if (!localStorage.getItem(MIGRATE_PERMISOS_MECANICO_VACIOS)) {
    var rolesMigrar = { mecanico: 1, peon: 1, enpracticas: 1, responsablemecanicos: 1 };
    var listaU = getUsers();
    var hubo = false;
    listaU.forEach(function (u) {
      if (!u || (u.rol || '').toString().trim().toLowerCase() === 'admin') return;
      if (!rolesMigrar[(u.rol || '').toString().trim().toLowerCase()]) return;
      var p = u.permisos;
      if (p && typeof p === 'object' && Object.keys(p).length > 0) return;
      u.permisos = Object.assign({}, DEFAULT_PERMISOS_MECANICO_CALCULADORA);
      hubo = true;
    });
    if (hubo) saveUsers(listaU);
    localStorage.setItem(MIGRATE_PERMISOS_MECANICO_VACIOS, '1');
  }
  if (!localStorage.getItem(MIGRATE_NO_CAMBIAR_PASSWORD_OBLIGATORIO_NO_ADMIN)) {
    var listaPwd = getUsers();
    var huboPwd = false;
    listaPwd.forEach(function (u) {
      if (!u) return;
      if ((u.username || '').toString().trim().toLowerCase() === 'admin') return;
      if (u.cambiarPasswordObligatorio === true) {
        u.cambiarPasswordObligatorio = false;
        huboPwd = true;
      }
    });
    if (huboPwd) saveUsers(listaPwd);
    localStorage.setItem(MIGRATE_NO_CAMBIAR_PASSWORD_OBLIGATORIO_NO_ADMIN, '1');
  }
}

function saveUsers(users) {
  var list = Array.isArray(users) ? users : [];
  _cachedUsers = list;
  localStorage.setItem(AUTH_STORAGE, JSON.stringify(list));
  try {
    if (typeof window !== 'undefined' && window.backendApi && typeof window.backendApi.syncUsersToServer === 'function') {
      if (window.backendApi.getBaseUrl && window.backendApi.getBaseUrl()) {
        window.backendApi.syncUsersToServer(list);
      }
    }
  } catch (_) {}
}

function getSession() {
  try {
    const data = sessionStorage.getItem(SESSION_STORAGE);
    if (!data) return null;
    const session = JSON.parse(data);
    // Sesiones guardadas antes del fix podían tener cambiarPasswordObligatorio=true para no-admin.
    if (session && !loginRequiereContrasenaObligatoria(session.username) && session.cambiarPasswordObligatorio) {
      session.cambiarPasswordObligatorio = false;
      try {
        sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(session));
      } catch (_) {}
    }
    return session;
  } catch {
    return null;
  }
}

function setSession(user) {
  const { passwordHash, salt, ...safeUser } = user;
  sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(safeUser));
}

function clearSession() {
  sessionStorage.removeItem(SESSION_STORAGE);
}

async function login(username, password) {
  const userTrim = (username || '').toString().trim().toLowerCase();
  const passTrim = (password || '').toString().trim();

  let users = getUsers();
  const saltBootstrap = 'benny-genesis-v3';

  // Bootstrap: primera vez sin usuarios (p. ej. sin migración), crear admin con la contraseña introducida
  if (users.length === 0 && userTrim === 'admin' && passTrim.length >= 4) {
    const passwordHash = await hashPassword(passTrim, saltBootstrap);
    const admin = createDefaultAdmin(passwordHash, saltBootstrap);
    users = [admin];
    saveUsers(users);
    setSession(admin);
    return { id: admin.id, username: admin.username, nombre: admin.nombre, rol: admin.rol, permisos: admin.permisos, cambiarPasswordObligatorio: true };
  }

  const user = users.find(u => (u.username || '').toString().trim().toLowerCase() === userTrim && u.activo !== false);
  if (!user) return null;
  if (user.primerAccesoSinPassword === true && passTrim === '') {
    const { passwordHash, salt, ...safeUser } = user;
    aplicarPoliticaCambioPasswordLogin(user, safeUser);
    // Persistir en sesión los mismos flags que devolvemos (no usar `user` en bruto: traía cambiarPasswordObligatorio del servidor).
    setSession(Object.assign({}, user, safeUser));
    return safeUser;
  }
  if (!loginRequiereContrasenaObligatoria(user.username) && passTrim === '') {
    const { passwordHash, salt, ...safeUser } = user;
    aplicarPoliticaCambioPasswordLogin(user, safeUser);
    setSession(Object.assign({}, user, safeUser));
    return safeUser;
  }
  const valid = await verifyPassword(passTrim, user.passwordHash, user.salt || saltBootstrap);
  if (!valid) return null;
  const { passwordHash, salt, ...safeUser } = user;
  aplicarPoliticaCambioPasswordLogin(user, safeUser);
  setSession(Object.assign({}, user, safeUser));
  return safeUser;
}

function logout() {
  clearSession();
}

/** Comprueba si el nombre de usuario ya está registrado (BBDD de usuarios). excludeUserId opcional para edición */
function isUsernameTaken(username, excludeUserId) {
  const u = (username || '').toString().trim().toLowerCase();
  if (!u) return false;
  const users = getUsers();
  return users.some(function (x) {
    if (excludeUserId && x.id === excludeUserId) return false;
    return (x.username || '').toString().trim().toLowerCase() === u;
  });
}

async function createUser(userData, createdBy) {
  const usernameTrim = (userData.username || '').toString().trim();
  if (!usernameTrim) return { error: 'El nombre de usuario es obligatorio' };
  if (isUsernameTaken(usernameTrim)) {
    return { error: 'Ese nombre de usuario ya está registrado. Elige otro.' };
  }
  const users = getUsers();
  if (users.length >= MAX_USUARIOS) {
    return { error: 'Se alcanzó el límite máximo de usuarios (100).' };
  }
  const passwordInicial = userData.password != null && String(userData.password).length > 0
    ? String(userData.password)
    : '';
  const salt = crypto.randomUUID() + Date.now();
  const passwordHash = await hashPassword(passwordInicial, salt);
  const esAutoregistro = createdBy === 'self';
  const rol = userData.rol || 'mecanico';
  var permisosIn = userData.permisos;
  var permisos;
  if (rol === 'admin') {
    permisos = Object.assign({}, ADMIN_PERMISOS_FULL);
  } else if (permisosIn && typeof permisosIn === 'object' && Object.keys(permisosIn).length > 0) {
    permisos = permisosIn;
  } else {
    permisos = Object.assign({}, DEFAULT_PERMISOS_MECANICO_CALCULADORA);
  }
  const newUser = {
    id: 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    username: usernameTrim,
    passwordHash,
    salt,
    nombre: (userData.nombre || userData.username).trim(),
    rol: rol,
    permisos: permisos,
    activo: true,
    cambiarPasswordObligatorio: false,
    primerAccesoSinPassword: passwordInicial.length === 0,
    creadoPor: createdBy,
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString(),
    fechaAlta: (userData.fechaAlta || new Date().toISOString().slice(0, 10)),
    responsable: (userData.responsable || '').trim() || null,
    puesto: (userData.puesto || '').trim() || '',
    salario: userData.salario != null ? Number(userData.salario) : null,
    fotoPerfil: userData.fotoPerfil || null,
    equipo: Array.isArray(userData.equipo) ? userData.equipo : (userData.equipo ? [] : []),
    fotosFicha: Array.isArray(userData.fotosFicha) ? userData.fotosFicha : [],
    fondoFichaIndex: userData.fondoFichaIndex != null ? Number(userData.fondoFichaIndex) : null,
    idClienteBBDD: (userData.idClienteBBDD && String(userData.idClienteBBDD).trim()) ? String(userData.idClienteBBDD).trim() : null,
    pendienteSync: true,
  };
  if (!newUser.equipo) newUser.equipo = [];
  if (!newUser.fotosFicha) newUser.fotosFicha = [];
  users.push(newUser);
  saveUsers(users);
  // Si hay backend configurado, exigir persistencia real en servidor.
  // Si falla, revertimos la alta local para no dejar estado inconsistente.
  try {
    if (
      typeof window !== 'undefined' &&
      window.backendApi &&
      typeof window.backendApi.getBaseUrl === 'function' &&
      window.backendApi.getBaseUrl() &&
      typeof window.backendApi.syncUsersToServer === 'function'
    ) {
      var synced = await window.backendApi.syncUsersToServer(users);
      if (!synced) {
        var rollback = getUsers().filter(function (u) { return u && u.id !== newUser.id; });
        saveUsers(rollback);
        return { error: 'No se pudo guardar el usuario en el servidor. Revisa la conexión e inténtalo de nuevo.' };
      }
    }
  } catch (_) {
    var rollback2 = getUsers().filter(function (u) { return u && u.id !== newUser.id; });
    saveUsers(rollback2);
    return { error: 'No se pudo guardar el usuario en el servidor. Revisa la conexión e inténtalo de nuevo.' };
  }
  return { user: { ...newUser, passwordHash: undefined, salt: undefined } };
}

async function updateUser(userId, userData, updatedBy) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { error: 'Usuario no encontrado' };
  const existing = users[idx];
  if (isUsuarioContrasenaProtegida(existing.username) && userData.password && userData.password.length >= 4) {
    delete userData.password;
  }
  if (userData.username !== undefined) {
    const usernameTrim = (userData.username || '').toString().trim();
    if (!usernameTrim) return { error: 'El nombre de usuario no puede estar vacío' };
    if (usernameTrim.toLowerCase() !== (existing.username || '').toString().trim().toLowerCase() && isUsernameTaken(usernameTrim, userId)) {
      return { error: 'Ese nombre de usuario ya está registrado. Elige otro.' };
    }
    users[idx].username = usernameTrim;
  }
  if (userData.nombre) users[idx].nombre = userData.nombre.trim();
  if (userData.rol) {
    users[idx].rol = userData.rol;
    if (userData.rol === 'admin') users[idx].permisos = Object.assign({}, ADMIN_PERMISOS_FULL);
  }
  if (userData.permisos !== undefined && users[idx].rol !== 'admin') users[idx].permisos = userData.permisos;
  if (userData.activo !== undefined) users[idx].activo = userData.activo;
  if (userData.fechaAlta !== undefined) users[idx].fechaAlta = userData.fechaAlta;
  if (userData.responsable !== undefined) users[idx].responsable = userData.responsable || null;
  if (userData.puesto !== undefined) users[idx].puesto = (userData.puesto || '').trim() || '';
  if (userData.salario !== undefined) users[idx].salario = userData.salario != null ? Number(userData.salario) : null;
  if (userData.fotoPerfil !== undefined) users[idx].fotoPerfil = userData.fotoPerfil || null;
  if (userData.equipo !== undefined) users[idx].equipo = Array.isArray(userData.equipo) ? userData.equipo : [];
  if (userData.fotosFicha !== undefined) users[idx].fotosFicha = Array.isArray(userData.fotosFicha) ? userData.fotosFicha : [];
  if (userData.fondoFichaIndex !== undefined) users[idx].fondoFichaIndex = userData.fondoFichaIndex != null ? Number(userData.fondoFichaIndex) : null;
  if (userData.vehiculos !== undefined) users[idx].vehiculos = Array.isArray(userData.vehiculos) ? userData.vehiculos : [];
  if (userData.idClienteBBDD !== undefined) {
    var idcB = (userData.idClienteBBDD || '').toString().trim();
    users[idx].idClienteBBDD = idcB || null;
  }
  if (userData.password && userData.password.length >= 4 && !isUsuarioContrasenaProtegida(users[idx].username)) {
    const salt = crypto.randomUUID() + Date.now();
    users[idx].passwordHash = await hashPassword(userData.password, salt);
    users[idx].salt = salt;
    users[idx].cambiarPasswordObligatorio = false;
    users[idx].primerAccesoSinPassword = false;
  }
  users[idx].actualizadoPor = updatedBy;
  users[idx].fechaActualizacion = new Date().toISOString();
  saveUsers(users);
  return { user: users[idx] };
}

/**
 * Elimina un usuario por id. No permite eliminar al último admin.
 * @returns { { ok?: boolean, error?: string } }
 */
function isRolAdmin(rol) {
  return (rol || '').toString().trim().toLowerCase() === 'admin';
}

function deleteUser(userId) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { error: 'Usuario no encontrado' };
  const user = users[idx];
  if (isRolAdmin(user.rol)) {
    const admins = users.filter(u => isRolAdmin(u.rol));
    if (admins.length <= 1) return { error: 'No se puede eliminar al único administrador' };
  }
  users.splice(idx, 1);
  trackUserDeletedFromDirectory(userId, user.username);
  saveUsers(users);
  try {
    const sess = getSession();
    if (sess && sess.id === userId) clearSession();
  } catch (_) {}
  return { ok: true };
}

async function cambiarPassword(userId, nuevaPassword) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { error: 'Usuario no encontrado' };
  if (isUsuarioContrasenaProtegida(users[idx].username)) {
    return { error: 'No está permitido cambiar la contraseña de este usuario.' };
  }
  if (!nuevaPassword || nuevaPassword.length < 4) {
    return { error: 'La contraseña debe tener al menos 4 caracteres' };
  }
  const salt = crypto.randomUUID() + Date.now();
  users[idx].passwordHash = await hashPassword(nuevaPassword, salt);
  users[idx].salt = salt;
  users[idx].cambiarPasswordObligatorio = false;
  users[idx].primerAccesoSinPassword = false;
  saveUsers(users);
  return { ok: true };
}

/** Cambiar contraseña de cualquier usuario (solo administrador). No aplica restricción de usuarios protegidos. */
async function cambiarPasswordPorAdmin(userId, nuevaPassword) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { error: 'Usuario no encontrado' };
  if (!nuevaPassword || nuevaPassword.length < 4) {
    return { error: 'La contraseña debe tener al menos 4 caracteres' };
  }
  const salt = crypto.randomUUID() + Date.now();
  users[idx].passwordHash = await hashPassword(nuevaPassword, salt);
  users[idx].salt = salt;
  users[idx].cambiarPasswordObligatorio = false;
  users[idx].primerAccesoSinPassword = false;
  saveUsers(users);
  return { ok: true };
}

/** Recuperar contraseña (olvidé mi contraseña): actualiza la contraseña del usuario por nombre de usuario en la BBDD */
async function resetPasswordPorUsuario(username, nuevaPassword) {
  const u = (username || '').toString().trim();
  if (!u) return { error: 'Indica tu nombre de usuario' };
  if (isUsuarioContrasenaProtegida(u)) {
    return { error: 'No está permitido cambiar la contraseña de este usuario.' };
  }
  const users = getUsers();
  const idx = users.findIndex(x => (x.username || '').toString().trim().toLowerCase() === u.toLowerCase());
  if (idx === -1) return { error: 'No existe ningún usuario con ese nombre' };
  if (!nuevaPassword || nuevaPassword.length < 4) {
    return { error: 'La contraseña debe tener al menos 4 caracteres' };
  }
  const salt = crypto.randomUUID() + Date.now();
  users[idx].passwordHash = await hashPassword(nuevaPassword, salt);
  users[idx].salt = salt;
  users[idx].cambiarPasswordObligatorio = false;
  users[idx].primerAccesoSinPassword = false;
  saveUsers(users);
  return { ok: true };
}

/** El rol 'admin' convierte al usuario en administrador (todos los permisos). */
function hasPermission(user, permiso) {
  if (!user) return false;
  if (user.rol === 'admin') return true;
  return !!user.permisos?.[permiso];
}
