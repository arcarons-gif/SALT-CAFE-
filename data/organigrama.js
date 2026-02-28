/**
 * Datos del organigrama - alimentado por usuarios (Gestión > Usuarios).
 * Puesto, responsable y rol se reflejan aquí; el salario es exclusivo de administradores y no se muestra.
 */
const ORGANIGRAMA_STORAGE = 'benny_organigrama';

const ORGANIGRAMA_DEFAULT = {
  nodes: [
    { id: 'org-1', nombre: 'Dueño', rol: 'Dueño del taller', nivel: 0, parentId: null, orden: 0, foto: '' },
    { id: 'org-2', nombre: 'Socio', rol: 'Socio', nivel: 0, parentId: null, orden: 1, foto: '' },
    { id: 'org-3', nombre: 'Responsable Taller A', rol: 'Responsable de mecánicos', nivel: 1, parentId: 'org-1', orden: 0, foto: '' },
    { id: 'org-4', nombre: 'Responsable Taller B', rol: 'Responsable de mecánicos', nivel: 1, parentId: 'org-2', orden: 1, foto: '' },
    { id: 'org-5', nombre: 'Mecánico 1', rol: 'Mecánico', nivel: 2, parentId: 'org-3', orden: 0, foto: '' },
    { id: 'org-6', nombre: 'Mecánico 2', rol: 'Mecánico', nivel: 2, parentId: 'org-3', orden: 1, foto: '' },
    { id: 'org-7', nombre: 'Mecánico 3', rol: 'Mecánico', nivel: 2, parentId: 'org-4', orden: 0, foto: '' },
    { id: 'org-8', nombre: 'Mecánico 4', rol: 'Mecánico', nivel: 2, parentId: 'org-4', orden: 1, foto: '' },
  ],
};

/** Construye los nodos del organigrama desde la lista de usuarios. Todos los ADMIN y Tyrone Carter en raíz; el resto según responsable. */
function buildOrganigramaFromUsers() {
  if (typeof getUsers !== 'function') return null;
  const users = getUsers().filter(u => u.activo !== false);
  if (users.length === 0) return null;
  const byUsername = {};
  const byNombre = {};
  users.forEach(u => {
    const un = (u.username || '').toLowerCase();
    const nom = (u.nombre || '').trim().toLowerCase();
    if (un) byUsername[un] = u;
    if (nom) byNombre[nom] = u;
  });
  /** Resuelve responsable (puede ser username o nombre completo) al usuario y devuelve su id */
  function resolveResponsableToParentId(responsableStr, excludeId) {
    const key = (responsableStr || '').trim().toLowerCase();
    if (!key) return null;
    let resp = byUsername[key] || byNombre[key];
    if (!resp) {
      resp = users.find(u => (u.nombre || '').trim().toLowerCase() === key || (u.username || '').toLowerCase() === key);
    }
    if (!resp) {
      resp = users.find(u => (u.nombre || '').toLowerCase().indexOf(key) !== -1 || (u.username || '').toLowerCase().indexOf(key) !== -1);
    }
    if (resp && resp.id && resp.id !== excludeId) return resp.id;
    return null;
  }

  const rolAdmin = (r) => (r || '').toLowerCase() === 'admin';
  const tyroneUser = users.find(u => {
    const nom = (u.nombre || '').toUpperCase();
    const user = (u.username || '').toLowerCase();
    return nom.indexOf('TYRONE') !== -1 || user.indexOf('tyrone') !== -1;
  });
  const adminIds = new Set(users.filter(u => rolAdmin(u.rol)).map(u => u.id));
  if (tyroneUser && tyroneUser.id) adminIds.add(tyroneUser.id);
  const defaultParentId = users.find(u => (u.username || '').toLowerCase() === 'admin')?.id || (tyroneUser ? tyroneUser.id : null);

  const nodes = [];
  users.forEach((u, idx) => {
    let parentId = null;
    const isTopRoot = adminIds.has(u.id);
    if (isTopRoot) {
      parentId = null;
    } else {
      if (u.responsable && (u.responsable || '').trim()) {
        parentId = resolveResponsableToParentId(u.responsable, u.id);
      }
      if (parentId == null && defaultParentId && defaultParentId !== u.id)
        parentId = defaultParentId;
    }

    const rolLabels = { admin: 'ADMIN', mecanico: 'Mecánico', responsableMecanicos: 'RESPONSABLE MECÁNICOS', enPracticas: 'EN PRÁCTICAS', peon: 'PEÓN' };
    const rolDisplay = (u.puesto && u.puesto.trim()) || rolLabels[u.rol] || (u.rol || '—');
    nodes.push({
      id: u.id,
      username: u.username,
      nombre: (u.nombre && u.nombre.trim()) || u.username || '—',
      rol: rolDisplay,
      parentId,
      nivel: 0,
      orden: idx,
      foto: (u.fotoPerfil && u.fotoPerfil.trim()) || '',
    });
  });

  function setNivel(node, n) {
    node.nivel = n;
    const children = nodes.filter(x => x.parentId === node.id);
    children.forEach((c, i) => { c.orden = i; setNivel(c, n + 1); });
  }
  const roots = nodes.filter(n => !n.parentId);
  const adminUser = users.find(u => (u.username || '').toLowerCase() === 'admin');
  roots.sort((a, b) => {
    if (adminUser && a.id === adminUser.id) return -1;
    if (adminUser && b.id === adminUser.id) return 1;
    if (tyroneUser && a.id === tyroneUser.id) return -1;
    if (tyroneUser && b.id === tyroneUser.id) return 1;
    const aAdmin = rolAdmin((users.find(u => u.id === a.id) || {}).rol);
    const bAdmin = rolAdmin((users.find(u => u.id === b.id) || {}).rol);
    if (aAdmin && !bAdmin) return -1;
    if (!aAdmin && bAdmin) return 1;
    return (a.orden || 0) - (b.orden || 0);
  });
  roots.forEach((r, i) => { r.orden = i; setNivel(r, 0); });
  return nodes;
}

function getOrganigrama() {
  const fromUsers = buildOrganigramaFromUsers();
  if (fromUsers && fromUsers.length > 0) {
    return { nodes: fromUsers };
  }
  try {
    const data = localStorage.getItem(ORGANIGRAMA_STORAGE);
    if (!data) return JSON.parse(JSON.stringify(ORGANIGRAMA_DEFAULT));
    return JSON.parse(data);
  } catch {
    return JSON.parse(JSON.stringify(ORGANIGRAMA_DEFAULT));
  }
}

function saveOrganigrama(organigrama) {
  localStorage.setItem(ORGANIGRAMA_STORAGE, JSON.stringify(organigrama));
}

function generateNodeId() {
  return 'org-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}
