/**
 * Backend API para SALTLAB Calculator.
 * Almacena usuarios y fichajes en archivos JSON (sin módulos nativos).
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

const dataDir = path.join(__dirname, 'data');
const usersPath = path.join(dataDir, 'users.json');
const fichajesPath = path.join(dataDir, 'fichajes.json');
const serviciosPath = path.join(dataDir, 'servicios.json');
const serviciosArchivoMensualPath = path.join(dataDir, 'servicios-archivo-mensual.json');
const vehiculosRegistroPath = path.join(dataDir, 'vehiculos-registro.json');
const USERS_MAX = 100;

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function readUsers() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(usersPath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    // Recuperación básica: si el archivo quedó con arrays JSON concatenados,
    // intentamos unirlos para no perder usuarios por un parse fallido.
    try {
      const raw = fs.readFileSync(usersPath, 'utf8');
      const chunks = String(raw).match(/\[[\s\S]*?\]/g);
      if (!chunks || chunks.length === 0) return [];
      const merged = [];
      chunks.forEach((c) => {
        try {
          const arr = JSON.parse(c);
          if (Array.isArray(arr)) merged.push(...arr);
        } catch (_) {}
      });
      const byIdOrUser = new Map();
      merged.forEach((u) => {
        if (!u || typeof u !== 'object') return;
        const key = (u.id && String(u.id).trim()) || ('user:' + (u.username || '').toString().trim().toLowerCase());
        if (!key || key === 'user:') return;
        byIdOrUser.set(key, u);
      });
      return Array.from(byIdOrUser.values());
    } catch (_) {
      return [];
    }
  }
}

function writeUsers(users) {
  ensureDataDir();
  fs.writeFileSync(usersPath, JSON.stringify(users), 'utf8');
}

function readFichajes() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(fichajesPath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeFichajes(fichajes) {
  ensureDataDir();
  fs.writeFileSync(fichajesPath, JSON.stringify(fichajes), 'utf8');
}

function readServicios() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(serviciosPath, 'utf8');
    const arr = JSON.parse(raw);
    const list = Array.isArray(arr) ? arr : [];
    // Asegurar id estable en cada servicio (para merge sin duplicar)
    return list.map((s, i) => {
      if (s && s.id) return s;
      const id = 'legacy-' + i + '-' + (s.fecha || '').slice(0, 19).replace(/[:.]/g, '') + '-' + (s.matricula || 'x').slice(0, 10);
      return { ...s, id };
    });
  } catch {
    return [];
  }
}

function writeServicios(servicios) {
  ensureDataDir();
  fs.writeFileSync(serviciosPath, JSON.stringify(servicios), 'utf8');
}

function readServiciosArchivoMensual() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(serviciosArchivoMensualPath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeServiciosArchivoMensual(rows) {
  ensureDataDir();
  fs.writeFileSync(serviciosArchivoMensualPath, JSON.stringify(rows), 'utf8');
}

function readVehiculosRegistro() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(vehiculosRegistroPath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeVehiculosRegistro(rows) {
  ensureDataDir();
  fs.writeFileSync(vehiculosRegistroPath, JSON.stringify(rows), 'utf8');
}

function claveMatriculaVehiculoRegistro(mat) {
  return (mat || '').toString().trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
}

function mergeVehiculosRegistro(existing, incoming) {
  const map = new Map();
  (Array.isArray(existing) ? existing : []).forEach((r) => {
    const k = claveMatriculaVehiculoRegistro(r && r.matricula);
    if (!k) return;
    map.set(k, { ...r });
  });
  (Array.isArray(incoming) ? incoming : []).forEach((r) => {
    const k = claveMatriculaVehiculoRegistro(r && r.matricula);
    if (!k) return;
    const prev = map.get(k) || {};
    map.set(k, { ...prev, ...r });
  });
  return Array.from(map.values());
}

/** Evita duplicar el mismo mes al sincronizar: gana la fila con más servicios (rep+tuneo), o mayor importe si empatan. */
function pickRicherArchivoMensualRow(a, b) {
  if (!a) return b;
  if (!b) return a;
  const sa = (parseInt(a.reparaciones, 10) || 0) + (parseInt(a.tuneos, 10) || 0);
  const sb = (parseInt(b.reparaciones, 10) || 0) + (parseInt(b.tuneos, 10) || 0);
  if (sb > sa) return { ...b };
  if (sa > sb) return { ...a };
  const ia = parseFloat(a.importeTotal) || 0;
  const ib = parseFloat(b.importeTotal) || 0;
  return ib >= ia ? { ...b } : { ...a };
}

/** Una fila por mes (YYYY-MM); al unir listas se elige una fila por mes (no se suman, para no duplicar archivos repetidos). */
function mergeArchivoMensual(existing, incoming) {
  const byMes = {};
  function addRow(row) {
    if (!row || !row.mes) return;
    const k = String(row.mes).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(k)) return;
    const norm = {
      mes: k,
      reparaciones: parseInt(row.reparaciones, 10) || 0,
      tuneos: parseInt(row.tuneos, 10) || 0,
      importeTotal: parseFloat(row.importeTotal) || 0,
      piezasChasis: parseInt(row.piezasChasis, 10) || 0,
      piezasEsenciales: parseInt(row.piezasEsenciales, 10) || 0,
      partesServicio: parseInt(row.partesServicio, 10) || 0,
      archivadoEn: row.archivadoEn || '',
    };
    byMes[k] = pickRicherArchivoMensualRow(byMes[k], norm);
  }
  (Array.isArray(existing) ? existing : []).forEach(addRow);
  (Array.isArray(incoming) ? incoming : []).forEach(addRow);
  return Object.keys(byMes)
    .sort()
    .map((k) => byMes[k]);
}

/** Fusiona servicios entrantes con los existentes (por id). No sobrescribe la lista del servidor, acumula/actualiza. */
function mergeServicios(existing, incoming) {
  const byId = new Map();
  existing.forEach(s => { byId.set(s.id, { ...s }); });
  incoming.forEach(s => {
    const id = s.id || ('new-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
    byId.set(id, { ...s, id });
  });
  const merged = Array.from(byId.values());
  merged.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  return merged;
}

/**
 * La app siempre envía la lista completa de usuarios tras crear/editar/borrar.
 * Un merge tipo unión impedía que los borrados llegaran al servidor (el usuario reaparecía al sincronizar).
 */
function normalizeUsersList(users) {
  if (!Array.isArray(users)) return [];
  return users
    .filter(u => u && (u.id || u.username))
    .slice(0, USERS_MAX);
}

/** Fusiona fichajes entrantes con los existentes (por id). */
function mergeFichajes(existing, incoming) {
  const byId = new Map();
  existing.forEach((f, i) => {
    const id = f.id || ('f-' + i + '-' + (f.entrada || '').slice(0, 19).replace(/[:.]/g, ''));
    byId.set(id, { id, userId: f.userId || f.user_id, entrada: f.entrada, salida: f.salida || null });
  });
  incoming.forEach(f => {
    const id = f.id || ('f-new-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9));
    const norm = { id, userId: f.userId || f.user_id, entrada: f.entrada, salida: f.salida || null };
    byId.set(id, norm);
  });
  return Array.from(byId.values());
}

/**
 * CORS: origin: true refleja el Origin de la petición (válido para GitHub Pages, Live Server, IP local).
 * Cualquier origen puede llamar a la API; no usamos cookies de sesión en el API (solo JSON).
 * Si en el navegador ves errores de CORS, suele ser: URL del API incorrecta, API caída, o mezcla http/https.
 */
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);
app.use(express.json({ limit: '2mb' }));

/** Registro breve de peticiones: en Render añade SALTLAB_LOG_HTTP=1 en Environment. */
if (process.env.SALTLAB_LOG_HTTP === '1') {
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      let extra = '';
      if (req.method === 'POST' && req.path === '/api/users' && req.body && Array.isArray(req.body.users)) {
        extra = ' body.users.length=' + req.body.users.length;
      }
      console.log(
        '[SALTLAB HTTP]',
        req.method,
        req.path,
        res.statusCode,
        Date.now() - started + 'ms',
        'origin=' + (req.headers.origin || '-'),
        extra
      );
    });
    next();
  });
}

// Raíz: página mínima para que el navegador no muestre "invalid response"
app.get('/', (req, res) => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>SALTLAB API</title></head>
    <body style="font-family:sans-serif;padding:2rem;max-width:600px;">
      <h1>SALTLAB Calculator – API</h1>
      <p>El servidor está en marcha. Esta es la API; la app se abre en otra URL.</p>
      <ul>
        <li><a href="/api/health">/api/health</a> – estado del servidor</li>
        <li>/api/users – GET (lista) / POST (reemplaza la lista con la enviada por el cliente; borrados sí se persisten)</li>
        <li>/api/fichajes – GET (lista) / POST (fusionar)</li>
        <li>/api/servicios – GET (lista) / POST (fusionar reparaciones/tuneos)</li>
        <li>/api/servicios-archivo-mensual – GET / POST (totales por mes archivados)</li>
        <li>/api/datos-completos – GET (todos los datos sincronizados)</li>
        <li>/api/repo-export – POST (guardar saltlab-datos-completos.json; almacén e inventario no se sobrescriben)</li>
        <li>/api/merge-almacen – POST (sumar movimiento al almacén; body: { movimiento: { acero?: number, ... } })</li>
        <li>/api/merge-inventario – POST (sumar/restar al inventario; body: { items: { "conceptoId": delta } })</li>
        <li>/api/merge-clientes-bbdd – POST (fusionar clientes por idCliente; body: { clientes: [...] })</li>
        <li>/api/discord-economia – POST (envía resumen financiero al webhook de Discord)</li>
        <li>/api/discord-entregas – POST (envía registro de entrega de herramientas al webhook de Discord)</li>
        <li>/api/discord-materiales – POST (envía registro de materiales recuperados al webhook de Discord)</li>
      </ul>
      <p><strong>Cómo usar:</strong> abre la app (index.html con Live Server o similar) en otro puerto; ella se conectará a <code>http://localhost:3001</code>.</p>
    </body></html>
  `);
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'saltlab-calculator-api' });
});

// ----- Usuarios -----
app.get('/api/users', (req, res) => {
  try {
    const users = readUsers();
    res.json(users);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const users = req.body.users;
    if (!Array.isArray(users)) {
      console.warn('[SALTLAB API] POST /api/users 400: body.users no es un array');
      return res.status(400).json({ error: 'Se espera { users: [...] }' });
    }
    if (users.length > USERS_MAX) {
      return res.status(400).json({ error: 'Se superó el máximo de usuarios permitido (100).' });
    }
    const next = normalizeUsersList(users);
    writeUsers(next);
    writeDatosCompletosMerge({ users: next });
    if (process.env.SALTLAB_LOG_HTTP === '1') {
      console.log('[SALTLAB API] POST /api/users guardado OK, usuarios=' + next.length);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[SALTLAB API] POST /api/users error:', e);
    res.status(500).json({ error: String(e.message) });
  }
});

// ----- Fichajes -----
app.get('/api/fichajes', (req, res) => {
  try {
    const list = readFichajes();
    const fichajes = list.map(f => ({
      id: f.id,
      userId: f.userId || f.user_id,
      entrada: f.entrada,
      salida: f.salida || null,
    }));
    res.json(fichajes);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/fichajes', (req, res) => {
  try {
    const fichajes = req.body.fichajes;
    if (!Array.isArray(fichajes)) {
      return res.status(400).json({ error: 'Se espera { fichajes: [...] }' });
    }
    const existing = readFichajes();
    const merged = mergeFichajes(existing, fichajes);
    writeFichajes(merged);
    writeDatosCompletosMerge({ fichajes: merged });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// ----- Servicios (reparaciones y tuneos) -----
app.get('/api/servicios', (req, res) => {
  try {
    const list = readServicios();
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/servicios', (req, res) => {
  try {
    const servicios = req.body.servicios;
    if (!Array.isArray(servicios)) {
      return res.status(400).json({ error: 'Se espera { servicios: [...] }' });
    }
    const existing = readServicios();
    const merged = mergeServicios(existing, servicios);
    writeServicios(merged);
    writeDatosCompletosMerge({ servicios: merged });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// ----- Archivo mensual (totales por mes; libera detalle en clientes) -----
app.get('/api/servicios-archivo-mensual', (req, res) => {
  try {
    res.json(readServiciosArchivoMensual());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// ----- Vehículos por matrícula (lookup rápido de modelo/convenio/placa) -----
app.get('/api/vehiculos-registro', (req, res) => {
  try {
    res.json(readVehiculosRegistro());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/vehiculos-registro', (req, res) => {
  try {
    const vehiculosRegistro = req.body.vehiculosRegistro;
    if (!Array.isArray(vehiculosRegistro)) {
      return res.status(400).json({ error: 'Se espera { vehiculosRegistro: [...] }' });
    }
    const existing = readVehiculosRegistro();
    const merged = mergeVehiculosRegistro(existing, vehiculosRegistro);
    writeVehiculosRegistro(merged);
    writeDatosCompletosMerge({ vehiculosRegistro: merged });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

app.post('/api/servicios-archivo-mensual', (req, res) => {
  try {
    const meses = req.body.meses;
    if (!Array.isArray(meses)) {
      return res.status(400).json({ error: 'Se espera { meses: [...] }' });
    }
    const existing = readServiciosArchivoMensual();
    const merged = mergeArchivoMensual(existing, meses);
    writeServiciosArchivoMensual(merged);
    writeDatosCompletosMerge({ serviciosArchivoMensual: merged });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

const datosCompletosPath = path.join(dataDir, 'saltlab-datos-completos.json');

function readDatosCompletos() {
  try {
    ensureDataDir();
    if (!fs.existsSync(datosCompletosPath)) return {};
    const raw = fs.readFileSync(datosCompletosPath, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch (e) {
    return {};
  }
}

function claveMatriculaDatosCompletos(m) {
  return (m || '').toString().trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
}

function claveClienteBBDDServer(c) {
  if (!c || typeof c !== 'object') return '';
  const mat = claveMatriculaDatosCompletos(c.matricula);
  if (mat) return `mat:${mat}`;
  const id = (c.idCliente || '').toString().trim();
  if (id) return `id:${id}`;
  return '';
}

/** Unifica clientes por matrícula (sin espacios/guiones) o idCliente; `encima` pisa campos de `base`. */
function mergeClientesBBDDArrays(base, encima) {
  const map = new Map();
  (Array.isArray(base) ? base : []).forEach((c) => {
    const k = claveClienteBBDDServer(c);
    if (k) map.set(k, { ...c });
  });
  (Array.isArray(encima) ? encima : []).forEach((c) => {
    const k = claveClienteBBDDServer(c);
    if (!k) return;
    const prev = map.get(k) || {};
    const merged = { ...prev, ...c };
    if (!(merged.idCliente && String(merged.idCliente).trim())) merged.idCliente = prev.idCliente || c.idCliente;
    map.set(k, merged);
  });
  return Array.from(map.values());
}

function mergeVehiculosRegistroArrays(base, encima) {
  const map = new Map();
  (Array.isArray(base) ? base : []).forEach((r) => {
    const k = claveMatriculaDatosCompletos(r && r.matricula);
    if (k) map.set(k, { ...r });
  });
  (Array.isArray(encima) ? encima : []).forEach((r) => {
    const k = claveMatriculaDatosCompletos(r && r.matricula);
    if (!k) return;
    const prev = map.get(k) || {};
    map.set(k, { ...prev, ...r });
  });
  return Array.from(map.values());
}

function writeDatosCompletosMerge(merge) {
  if (!merge || typeof merge !== 'object') return;
  try {
    const data = readDatosCompletos();
    if (merge.users !== undefined) data.users = merge.users;
    if (merge.fichajes !== undefined) data.fichajes = merge.fichajes;
    if (merge.servicios !== undefined) data.servicios = merge.servicios;
    if (merge.serviciosArchivoMensual !== undefined) data.serviciosArchivoMensual = merge.serviciosArchivoMensual;
    if (merge.vehiculosRegistro !== undefined) data.vehiculosRegistro = merge.vehiculosRegistro;
    data._exportadoAt = new Date().toISOString();
    ensureDataDir();
    fs.writeFileSync(datosCompletosPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('writeDatosCompletosMerge', e);
  }
}

// Obtener todos los datos sincronizados (para que todos los clientes vean lo mismo)
// users, fichajes y servicios siempre se leen de sus archivos (fuente de verdad), no de saltlab-datos-completos.json,
// para que no se devuelvan datos desactualizados si el export completo está desfasado.
app.get('/api/datos-completos', (req, res) => {
  try {
    let data = readDatosCompletos();
    if (Object.keys(data).length === 0) {
      data = {};
    }
    data.users = readUsers();
    data.fichajes = readFichajes();
    data.servicios = readServicios();
    data.serviciosArchivoMensual = readServiciosArchivoMensual();
    data.vehiculosRegistro = readVehiculosRegistro();
    data._exportadoAt = new Date().toISOString();
    res.json(data || {});
  } catch (e) {
    console.error(e);
    res.json({});
  }
});

// Guardar exportación completa en server/data/ (automatizar guardado en repo)
// almacenMateriales y economiaInventario NO se sobrescriben: solo se actualizan por merge (suma de todos)
app.post('/api/repo-export', (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Se espera un objeto JSON' });
    }
    const current = readDatosCompletos();
    const data = { ...incoming };
    if (current.almacenMateriales && typeof current.almacenMateriales === 'object') {
      data.almacenMateriales = current.almacenMateriales;
    } else {
      data.almacenMateriales = data.almacenMateriales || {};
    }
    if (current.economiaInventario && typeof current.economiaInventario === 'object') {
      data.economiaInventario = current.economiaInventario;
    } else {
      data.economiaInventario = data.economiaInventario || {};
    }
    const incCli = Array.isArray(incoming.clientesBBDD) ? incoming.clientesBBDD : [];
    const curCli = Array.isArray(current.clientesBBDD) ? current.clientesBBDD : [];
    data.clientesBBDD = mergeClientesBBDDArrays(curCli, incCli);
    const incVeh = Array.isArray(incoming.vehiculosRegistro) ? incoming.vehiculosRegistro : [];
    const curVeh = Array.isArray(current.vehiculosRegistro) ? current.vehiculosRegistro : [];
    data.vehiculosRegistro = mergeVehiculosRegistroArrays(curVeh, incVeh);
    data._exportadoAt = new Date().toISOString();
    ensureDataDir();
    fs.writeFileSync(datosCompletosPath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// Merge aditivo: sumar movimiento al almacén (todos los usuarios suman, no se sobrescribe)
app.post('/api/merge-almacen', (req, res) => {
  try {
    const movimiento = req.body.movimiento;
    if (!movimiento || typeof movimiento !== 'object') {
      return res.status(400).json({ error: 'Se espera { movimiento: { acero?: number, ... } }' });
    }
    const data = readDatosCompletos();
    if (!data.almacenMateriales) data.almacenMateriales = {};
    Object.keys(movimiento).forEach((key) => {
      const n = Number(movimiento[key]);
      if (!isNaN(n)) {
        data.almacenMateriales[key] = (data.almacenMateriales[key] || 0) + n;
      }
    });
    data._exportadoAt = new Date().toISOString();
    ensureDataDir();
    fs.writeFileSync(datosCompletosPath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// Merge aditivo: sumar (o restar) items al inventario por concepto
app.post('/api/merge-inventario', (req, res) => {
  try {
    const items = req.body.items;
    if (!items || typeof items !== 'object') {
      return res.status(400).json({ error: 'Se espera { items: { "conceptoId": delta, ... } }' });
    }
    const data = readDatosCompletos();
    if (!data.economiaInventario) data.economiaInventario = {};
    Object.keys(items).forEach((key) => {
      const n = Number(items[key]);
      if (!isNaN(n)) {
        const prev = data.economiaInventario[key] || 0;
        data.economiaInventario[key] = Math.max(0, prev + n);
      }
    });
    data._exportadoAt = new Date().toISOString();
    ensureDataDir();
    fs.writeFileSync(datosCompletosPath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// Merge BBDD clientes: upsert por idCliente (no se sobrescribe lo de otros usuarios)
app.post('/api/merge-clientes-bbdd', (req, res) => {
  try {
    const clientes = req.body.clientes;
    if (!Array.isArray(clientes)) {
      return res.status(400).json({ error: 'Se espera { clientes: [...] }' });
    }
    const data = readDatosCompletos();
    const cur = Array.isArray(data.clientesBBDD) ? data.clientesBBDD : [];
    data.clientesBBDD = mergeClientesBBDDArrays(cur, clientes);
    data._exportadoAt = new Date().toISOString();
    ensureDataDir();
    fs.writeFileSync(datosCompletosPath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// Envío a Discord (proxy para evitar CORS desde el navegador)
const DISCORD_WEBHOOK_ECONOMIA = process.env.DISCORD_WEBHOOK_ECONOMIA || 'https://discord.com/api/webhooks/1481047431893225643/iltdNmW066Xr4lEV8Uaf9Bb4VZzYZvlLmvbNEmt0lNCs0NusYH9Uor-Bd5gI5TUxG67l';
app.post('/api/discord-economia', (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content : '';
  if (!content.trim()) {
    return res.status(400).json({ error: 'Falta content en el body' });
  }
  try {
    const url = new URL(DISCORD_WEBHOOK_ECONOMIA);
    const body = JSON.stringify({ content: content });
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body, 'utf8')
      }
    };
    const proxyReq = https.request(opts, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
          res.json({ ok: true });
        } else {
          res.status(proxyRes.statusCode).json({ error: data || 'Discord error' });
        }
      });
    });
    proxyReq.on('error', (e) => {
      console.error('Discord webhook error:', e);
      res.status(500).json({ error: String(e.message) });
    });
    proxyReq.write(body);
    proxyReq.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// Webhook Discord: entregas de herramientas/material a trabajadores
const DISCORD_WEBHOOK_ENTREGAS = process.env.DISCORD_WEBHOOK_ENTREGAS || 'https://discord.com/api/webhooks/1481049256771977317/2zcTw1JHDHsDLyyO6WX0pKw1sr4-qXvKc30_0E79dSgeJ7K1dBw60pIsEKvu_A93SX6_';
app.post('/api/discord-entregas', (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content : '';
  if (!content.trim()) {
    return res.status(400).json({ error: 'Falta content en el body' });
  }
  try {
    const url = new URL(DISCORD_WEBHOOK_ENTREGAS);
    const body = JSON.stringify({ content: content });
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body, 'utf8')
      }
    };
    const proxyReq = https.request(opts, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
          res.json({ ok: true });
        } else {
          res.status(proxyRes.statusCode).json({ error: data || 'Discord error' });
        }
      });
    });
    proxyReq.on('error', (e) => {
      console.error('Discord webhook entregas error:', e);
      res.status(500).json({ error: String(e.message) });
    });
    proxyReq.write(body);
    proxyReq.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// Webhook Discord: materiales recuperados (registro por empleado)
const DISCORD_WEBHOOK_MATERIALES = process.env.DISCORD_WEBHOOK_MATERIALES || 'https://discord.com/api/webhooks/1481051583956648130/-f-hWDEk-Iw4RVY0x_vGTI1c3l9B9h7gvUW66X6ZZFd3_vbapfGa4y3K8kx_39IYEDks';
app.post('/api/discord-materiales', (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content : '';
  if (!content.trim()) {
    return res.status(400).json({ error: 'Falta content en el body' });
  }
  try {
    const url = new URL(DISCORD_WEBHOOK_MATERIALES);
    const body = JSON.stringify({ content: content });
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body, 'utf8')
      }
    };
    const proxyReq = https.request(opts, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
          res.json({ ok: true });
        } else {
          res.status(proxyRes.statusCode).json({ error: data || 'Discord error' });
        }
      });
    });
    proxyReq.on('error', (e) => {
      console.error('Discord webhook materiales error:', e);
      res.status(500).json({ error: String(e.message) });
    });
    proxyReq.write(body);
    proxyReq.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('SALTLAB Calculator API en http://localhost:' + PORT);
  console.log('CORS: reflejo de Origin activo (cualquier origen web). Diagnóstico HTTP: SALTLAB_LOG_HTTP=1');
});
