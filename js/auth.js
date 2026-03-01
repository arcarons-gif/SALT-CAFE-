/**
 * Sistema de autenticación y control de usuarios - Benny's Original Motor Works
 * Almacenamiento local (localStorage). Para producción con backend, sustituir por API.
 */

const AUTH_STORAGE = 'benny_users';
const SESSION_STORAGE = 'benny_session';
const PASSWORD_PREDETERMINADA = '1234';
const ADMIN_RESET_FLAG = 'benny_admin_reset_1234';

/** Usuarios de prueba que se crean automáticamente si no existen (contraseña: 1234) */
const SEED_USERS = [
  { username: 'juan', nombre: 'Juan', password: '1234' },
  { username: 'tyrone', nombre: 'Tyrone Carter', password: '1234' },
  { username: 'pepa', nombre: 'Pepa Pig', password: '1234' },
];

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
};

function createDefaultAdmin(passwordHash, salt) {
  return {
    id: 'admin-default',
    username: 'admin',
    passwordHash,
    salt,
    nombre: 'Administrador',
    rol: 'admin',
    permisos: {
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
    },
    activo: true,
    cambiarPasswordObligatorio: true,
    creadoPor: 'system',
    fechaCreacion: new Date().toISOString(),
    fechaAlta: new Date().toISOString().slice(0, 10),
    responsable: null,
    puesto: 'Administrador',
    salario: null,
    fotoPerfil: null,
    equipo: [],
  };
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

function getUsers() {
  try {
    const data = localStorage.getItem(AUTH_STORAGE);
    if (!data) return [];
    const users = JSON.parse(data);
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

/**
 * Crea los usuarios de prueba (Juan, Tyrone, Pepa Pig) si no existen.
 * Contraseña para los tres: 1234
 */
async function ensureSeedUsers() {
  let users = getUsers();
  let changed = false;
  for (const seed of SEED_USERS) {
    const exists = users.some(function (u) {
      return (u.username || '').toString().trim().toLowerCase() === seed.username.toLowerCase();
    });
    if (exists) continue;
    const salt = crypto.randomUUID() + Date.now();
    const passwordHash = await hashPassword(seed.password, salt);
    users.push({
      id: 'u-seed-' + seed.username,
      username: seed.username,
      passwordHash: passwordHash,
      salt: salt,
      nombre: seed.nombre,
      rol: 'mecanico',
      permisos: {},
      activo: true,
      cambiarPasswordObligatorio: true,
      creadoPor: 'system',
      fechaCreacion: new Date().toISOString(),
      fechaAlta: new Date().toISOString().slice(0, 10),
      responsable: null,
      puesto: '',
      salario: null,
      fotoPerfil: null,
      equipo: [],
    });
    changed = true;
  }
  if (changed) saveUsers(users);
}

function saveUsers(users) {
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
  const esAdminDefault = userTrim === 'admin' && passTrim === PASSWORD_PREDETERMINADA;

  let users = getUsers();
  const saltBootstrap = 'benny-genesis-v3';

  // Reseteo único: forzar contraseña del admin a 1234 para que el acceso funcione
  if (!localStorage.getItem(ADMIN_RESET_FLAG)) {
    var adminUser = users.find(function (u) { return (u.username || '').toString().trim().toLowerCase() === 'admin'; });
    if (adminUser) {
      adminUser.passwordHash = await hashPassword(PASSWORD_PREDETERMINADA, adminUser.salt || saltBootstrap);
      adminUser.salt = adminUser.salt || saltBootstrap;
      adminUser.activo = true;
      saveUsers(users);
    }
    localStorage.setItem(ADMIN_RESET_FLAG, '1');
  }

  // Bootstrap: primera vez, crear admin (admin / 1234)
  if (users.length === 0 && esAdminDefault) {
    const passwordHash = await hashPassword(passTrim, saltBootstrap);
    const admin = createDefaultAdmin(passwordHash, saltBootstrap);
    users = [admin];
    saveUsers(users);
    setSession(admin);
    return { id: admin.id, username: admin.username, nombre: admin.nombre, rol: admin.rol, permisos: admin.permisos, cambiarPasswordObligatorio: true };
  }

  // Siempre que pongas admin / 7264: crear o resetear admin y permitir entrada
  if (esAdminDefault) {
    let adminExistente = users.find(u => (u.username || '').toString().trim().toLowerCase() === 'admin');
    if (!adminExistente) {
      const passwordHash = await hashPassword(passTrim, saltBootstrap);
      adminExistente = createDefaultAdmin(passwordHash, saltBootstrap);
      users.push(adminExistente);
      saveUsers(users);
    } else {
      const passwordHash = await hashPassword(passTrim, adminExistente.salt || saltBootstrap);
      adminExistente.passwordHash = passwordHash;
      adminExistente.salt = adminExistente.salt || saltBootstrap;
      adminExistente.activo = true;
      saveUsers(users);
    }
    setSession(adminExistente);
    const { passwordHash: _, salt: __, ...safeUser } = adminExistente;
    return { ...safeUser, cambiarPasswordObligatorio: !!adminExistente.cambiarPasswordObligatorio };
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
  const newUser = {
    id: 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    username: usernameTrim,
    passwordHash,
    salt,
    nombre: (userData.nombre || userData.username).trim(),
    rol: userData.rol || 'mecanico',
    permisos: userData.permisos || {},
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
  };
  if (!newUser.equipo) newUser.equipo = [];
  users.push(newUser);
  saveUsers(users);
  return { user: { ...newUser, passwordHash: undefined, salt: undefined } };
}

async function updateUser(userId, userData, updatedBy) {
  const users = getUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return { error: 'Usuario no encontrado' };
  const existing = users[idx];
  if (userData.username !== undefined) {
    const usernameTrim = (userData.username || '').toString().trim();
    if (!usernameTrim) return { error: 'El nombre de usuario no puede estar vacío' };
    if (usernameTrim.toLowerCase() !== (existing.username || '').toString().trim().toLowerCase() && isUsernameTaken(usernameTrim, userId)) {
      return { error: 'Ese nombre de usuario ya está registrado. Elige otro.' };
    }
    users[idx].username = usernameTrim;
  }
  if (userData.nombre) users[idx].nombre = userData.nombre.trim();
  if (userData.rol) users[idx].rol = userData.rol;
  if (userData.permisos !== undefined) users[idx].permisos = userData.permisos;
  if (userData.activo !== undefined) users[idx].activo = userData.activo;
  if (userData.fechaAlta !== undefined) users[idx].fechaAlta = userData.fechaAlta;
  if (userData.responsable !== undefined) users[idx].responsable = userData.responsable || null;
  if (userData.puesto !== undefined) users[idx].puesto = (userData.puesto || '').trim() || '';
  if (userData.salario !== undefined) users[idx].salario = userData.salario != null ? Number(userData.salario) : null;
  if (userData.fotoPerfil !== undefined) users[idx].fotoPerfil = userData.fotoPerfil || null;
  if (userData.equipo !== undefined) users[idx].equipo = Array.isArray(userData.equipo) ? userData.equipo : [];
  if (userData.password && userData.password.length >= 4) {
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

function hasPermission(user, permiso) {
  if (!user) return false;
  if (user.rol === 'admin') return true;
  return !!user.permisos?.[permiso];
}
