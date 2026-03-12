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
    return [];
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
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeServicios(servicios) {
  ensureDataDir();
  fs.writeFileSync(serviciosPath, JSON.stringify(servicios), 'utf8');
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

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
        <li>/api/users – GET (lista) / POST (guardar)</li>
        <li>/api/fichajes – GET (lista) / POST (guardar)</li>
        <li>/api/servicios – GET (lista) / POST (guardar reparaciones/tuneos)</li>
        <li>/api/repo-export – POST (guardar saltlab-datos-completos.json en server/data/)</li>
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
      return res.status(400).json({ error: 'Se espera { users: [...] }' });
    }
    writeUsers(users);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
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
    const normalized = fichajes.map(f => ({
      id: f.id,
      userId: f.userId || f.user_id,
      entrada: f.entrada,
      salida: f.salida || null,
    }));
    writeFichajes(normalized);
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
    writeServicios(servicios);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message) });
  }
});

// Guardar exportación completa en server/data/ (automatizar guardado en repo)
app.post('/api/repo-export', (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Se espera un objeto JSON' });
    }
    ensureDataDir();
    const outPath = path.join(dataDir, 'saltlab-datos-completos.json');
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
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
});
