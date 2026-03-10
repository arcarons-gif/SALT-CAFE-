# SALTLAB Calculator – API (backend)

Servidor para sincronizar **usuarios** y **fichajes** entre varios dispositivos. La app web usa esta API cuando está disponible y hace polling para ver los cambios de otros.

## Requisitos

- Node.js 18+ (solo `node.exe` en el repo, o instalación completa con npm en la misma carpeta).

## Instalación y arranque

### Opción 1: Node del repositorio (p. ej. `G:\cursor\node.exe`)

1. **Tener Node + npm en esa carpeta.**  
   Si solo tienes `node.exe`, descarga el **zip** de Node (no el .msi) desde https://nodejs.org (p. ej. “Windows 64-bit” en “Prebuilt Installer” / “Binary”) y extrae el contenido en `G:\cursor` (o donde esté tu repo). Debe haber `node.exe`, `npm.cmd` y `npx.cmd` en la misma carpeta.

2. **Instalar dependencias y arrancar (una vez la primera, luego solo arrancar):**
   - **Recomendado** (evita el error “ejecución de scripts deshabilitada”): haz doble clic en **`install-and-run.cmd`** o en PowerShell:
     ```powershell
     cd g:\cursor\fivem\SALTLAB-calculator\server
     .\install-and-run.cmd
     ```
   - Si prefieres usar el .ps1: `.\install-and-run.ps1` (y si falla por política de ejecución, ejecuta antes: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`).
   La primera vez hace `npm install` y luego inicia el servidor. Las siguientes veces puedes usar **`run-server.cmd`** (doble clic o `.\run-server.cmd`) o `.\run-server.ps1`.

3. **Si tu Node está en otra ruta:**
   ```powershell
   $env:NODE_EXE = "G:\ruta\a\tu\node.exe"
   .\install-and-run.ps1
   ```

### Opción 2: Node instalado en el sistema (en el PATH)

```powershell
cd g:\cursor\fivem\SALTLAB-calculator\server
npm install
npm start
```

El servidor queda en **http://localhost:3001**.

## Uso desde la app

1. Sirve la app (por ejemplo con un servidor estático o desde tu PC).
2. La app intenta conectar a `http://localhost:3001` por defecto.
3. Para otro host/puerto, define antes de cargar la app:
   ```html
   <script>window.SALTLAB_API_URL = 'http://TU_IP:3001';</script>
   ```
4. En otros PCs de la red, pon la IP de este ordenador (ej. `http://192.168.1.10:3001`).

## Endpoints

- `GET /api/health` – Comprueba si el servidor está activo.
- `GET /api/users` – Lista de usuarios (array JSON).
- `POST /api/users` – Sustituir lista de usuarios. Body: `{ "users": [...] }`.
- `GET /api/fichajes` – Lista de fichajes.
- `POST /api/fichajes` – Sustituir lista de fichajes. Body: `{ "fichajes": [...] }`.

Los datos se guardan en JSON en `server/data/` (`users.json`, `fichajes.json`). No se requieren herramientas de compilación ni módulos nativos.

## Si `npm install` falla con errores de `gyp` o `better-sqlite3`

El proyecto **no** usa módulos nativos. Si ves ese error, suele ser por una instalación anterior. Haz una instalación limpia:

1. En la carpeta `server`, borra `node_modules` y `package-lock.json`.
2. Vuelve a ejecutar **`.\install-and-run.cmd`** o **`.\clean-install.cmd`** (en PowerShell/CMD hay que escribir `.\` delante del nombre del script).
