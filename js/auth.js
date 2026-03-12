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
/** Una vez: sincroniza contraseñas de admin y Savannah con las del seed (7264). */
const SYNC_SEED_PASSWORDS_MIGRATION = 'benny_sync_seed_passwords_v1';

/** Únicos usuarios predefinidos. Cualquier otro usuario se elimina en la migración. */
const SEED_USERS = [
  { username: 'admin', nombre: 'Administrador', password: '7264', rol: 'admin' },
  { username: 'Savannah', nombre: 'Savannah', password: '7264', rol: 'admin' },
  { username: 'Tyrone', nombre: 'Tyrone', password: '1234', rol: 'admin' },
  { username: 'Gerald J', nombre: 'Gerald J. Ford', password: '1234', rol: 'mecanico', cambiarPasswordObligatorio: true },
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

/**
 * Migración: deja solo los usuarios predefinidos (admin, Savannah, Tyrone) y elimina el resto.
 * Luego asegura que existan los tres con sus contraseñas.
 */
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
}

function saveUsers(users) {
  _cachedUsers = Array.isArray(users) ? users : null;
  localStorage.setItem(AUTH_STORAGE, JSON.stringify(users));
}

function getSession() {
  try {
    const data = sessionStorage.getItem(SESSION_STORAGE);
    if (!data) return null;
    return JSON.parse(data);
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
  const valid = await verifyPassword(passTrim, user.passwordHash, user.salt || saltBootstrap);
  if (!valid) return null;
  const { passwordHash, salt, ...safeUser } = user;
  setSession(user);
  safeUser.cambiarPasswordObligatorio = !!user.cambiarPasswordObligatorio;
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
  const passwordInicial = userData.password || PASSWORD_PREDETERMINADA;
  const salt = crypto.randomUUID() + Date.now();
  const passwordHash = await hashPassword(passwordInicial, salt);
  const esAutoregistro = createdBy === 'self';
  const rol = userData.rol || 'mecanico';
  const permisos = (rol === 'admin') ? Object.assign({}, ADMIN_PERMISOS_FULL) : (userData.permisos || {});
  const newUser = {
    id: 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    username: usernameTrim,
    passwordHash,
    salt,
    nombre: (userData.nombre || userData.username).trim(),
    rol: rol,
    permisos: permisos,
    activo: true,
    cambiarPasswordObligatorio: esAutoregistro ? false : true,
    creadoPor: createdBy,
    fechaCreacion: new Date().toISOString(),
    fechaAlta: (userData.fechaAlta || new Date().toISOString().slice(0, 10)),
    responsable: (userData.responsable || '').trim() || null,
    puesto: (userData.puesto || '').trim() || '',
    salario: userData.salario != null ? Number(userData.salario) : null,
    fotoPerfil: userData.fotoPerfil || null,
    equipo: Array.isArray(userData.equipo) ? userData.equipo : (userData.equipo ? [] : []),
    fotosFicha: Array.isArray(userData.fotosFicha) ? userData.fotosFicha : [],
    fondoFichaIndex: userData.fondoFichaIndex != null ? Number(userData.fondoFichaIndex) : null,
  };
  if (!newUser.equipo) newUser.equipo = [];
  if (!newUser.fotosFicha) newUser.fotosFicha = [];
  users.push(newUser);
  saveUsers(users);
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
  if (userData.password && userData.password.length >= 4 && !isUsuarioContrasenaProtegida(users[idx].username)) {
    const salt = crypto.randomUUID() + Date.now();
    users[idx].passwordHash = await hashPassword(userData.password, salt);
    users[idx].salt = salt;
    users[idx].cambiarPasswordObligatorio = false;
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
function deleteUser(userId) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { error: 'Usuario no encontrado' };
  const user = users[idx];
  if (user.rol === 'admin') {
    const admins = users.filter(u => u.rol === 'admin');
    if (admins.length <= 1) return { error: 'No se puede eliminar al único administrador' };
  }
  users.splice(idx, 1);
  saveUsers(users);
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
  saveUsers(users);
  return { ok: true };
}

/** El rol 'admin' convierte al usuario en administrador (todos los permisos). */
function hasPermission(user, permiso) {
  if (!user) return false;
  if (user.rol === 'admin') return true;
  return !!user.permisos?.[permiso];
}
