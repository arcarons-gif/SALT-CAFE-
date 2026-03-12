# SALTLAB Calculator

App web de la calculadora del taller SALTLAB CAFE para FiveM: presupuestos de reparación y tuneo, fichajes, normativas, gestión de usuarios y organigrama, economía, clientes, almacén de materiales y personalización.

**Instrucciones completas:** [INSTRUCCIONES_USO.md](INSTRUCCIONES_USO.md)  
**Desplegar backend en la nube** (para que todos los usuarios compartan datos sin depender de tu PC): [DEPLIEGUE_BACKEND.md](DEPLIEGUE_BACKEND.md)

## Uso rápido

1. Abre `index.html` en tu navegador.
2. **Primera vez:** usuario `admin`, contraseña `1234` (deberás cambiarla en el primer acceso).
3. **Ficha entrada** (indicador en la barra superior o menú Fichajes).
4. Elige **Reparación**, **Tuneo** o **Tuneo + Reparación** → introduce **matrícula** → ajusta la calculadora.
5. **REGISTRAR TUNEO** o **REGISTRAR REPARACION** guarda el servicio.
6. **HOME** para otro servicio; **Salir** cierra sesión (y registra salida automática si tenías entrada abierta).

Otras funciones: **Mi ficha**, **Mi historial**, **Normativas**, **Resultados**, **Gestión** (usuarios, convenios, organigrama, economía, stock, **materiales recuperados**), **Clientes**, **Personalización**, y el **asistente de dudas** (chatbot) en la esquina inferior derecha.

## Base de datos de vehículos

Edita `data/vehiculos.js` para añadir o modificar vehículos:

```javascript
{
  modelo: 'spawn_name',    // nombre del spawn en FiveM
  nombreIC: 'Nombre IC',  // nombre in-game
  categoria: 'Coupes',    // Motos, Coupes, Sedan, SUV, Super...
  precioBase: 38000,      // valor del vehículo (para calcular precio por pieza)
  fullTuningPrecio: 15000,// precio fijo del full tuning para esta categoría
  imagenUrl: 'https://...' // enlace directo a la foto (OneDrive: clic derecho → Insertar → Vínculo, usa el enlace directo de descarga)
}
```

**Imágenes**: Para OneDrive/SharePoint, usa el enlace que termina en `?download=1` o sube las fotos a [Imgur](https://imgur.com) y pega el enlace directo (clic derecho en la imagen → "Copiar dirección de imagen").

## Convenios y descuentos

Edita `data/convenios.js` con el registro de negocios y sus descuentos. Al elegir un negocio, se aplica el % automáticamente:

```javascript
{ nombre: "Helmut's", descuento: 15 },
{ nombre: 'Otro Negocio', descuento: 10 },
```

## Factores de precio

En `app.js`, en el objeto `CONFIG`, puedes ajustar los factores para que coincidan con tu Excel:

- `factorPiezaTuneo` — precio por pieza de Motor/Performance/Custom/Cosmetic
- `factorChasis` — precio por parte del chasis
- `factorEsencial` — precio por parte esencial
- `factorServicio` — precio por parte de servicio

Los valores por defecto dan ~$47/pieza para un Previon de $38k (4+4 partes ≈ $323 con 15% descuento).

## Control de usuarios

- **Admin:** puede crear usuarios, asignar permisos y editar trabajadores.
- **Permisos:** Usar calculadora, Ver presupuesto, Registrar tuneos/reparaciones, Ver registro de servicios, Limpiar registro, Ver organigrama, Gestionar usuarios.
- **Alta de trabajadores:** Panel "Usuarios" (solo admin) → Nuevo usuario → asignar rol (Mecánico/Admin) y permisos.

### Organigrama

- **Trabajadores:** ven el organigrama como imagen estática (botón "Organigrama" en el header).
- **Administrador:** vista interactiva con edición: Editar datos (nombre/rol), Añadir subordinado, Añadir al mismo nivel, Eliminar nodo, Añadir nivel raíz.
- **Sesión:** Se cierra al cerrar el navegador. Los datos de usuarios se guardan en `localStorage`.
- **Contraseñas:** La predeterminada es `1234`. Todos los usuarios (admin y nuevos) deben cambiarla en el primer login.

## Datos guardados

- **En local (sin backend):** usuarios, registro de servicios y matrículas en `localStorage` del navegador.
- **Con backend en marcha:** la app sincroniza usuarios, fichajes y reparaciones con el servidor; todos los que usen la misma URL del backend ven los mismos datos.

### Evitar que se pierdan los datos al hacer push

Para que los datos queden en el repo y no se borren al hacer `git push`:

- **Guardado automático en `server/data/`:** (1) Servidor en ejecución (en la carpeta `server/`, p. ej. `node server.js` o `run-server.cmd`). (2) En la app, **Personalización** → **«URL del servidor API»** con la misma URL (ej. `http://localhost:3001`). Si ambos se cumplen, al guardar datos como admin se escriben solos en `server/data/`. Luego commit + push.
- **Sin servidor:** Gestión → Reset / Limpiar datos → Guardar datos en el repositorio → descargar los JSON y guardarlos manualmente en `server/data/`. Luego commit + push.

Más detalle en [server/README.md](server/README.md).

## Configuración del backend

En **`js/config.js`** puedes definir:

- **`API_URL_LOCAL`**: URL del backend cuando usas la app en tu red (ej. `http://192.168.0.63:3001`).
- **`API_URL_PRODUCCION`**: URL del backend cuando la app se abre desde GitHub Pages; así todos los que entren por el enlace público usan el mismo servidor en la nube.

Si despliegas el backend en Render (u otro servicio), edita `API_URL_PRODUCCION` con la URL que te den. Ver [DEPLIEGUE_BACKEND.md](DEPLIEGUE_BACKEND.md).

---

## Compartir la app online

### Opción A: Todos comparten los mismos datos (recomendado)

1. **Frontend** en GitHub Pages (o Netlify/Vercel): sube el proyecto y obtén una URL (ej. `https://tu-usuario.github.io/SALT-CAFE-/`).
2. **Backend** en la nube: despliega la carpeta `server` en [Render](https://render.com) (gratis). Ver **[DEPLIEGUE_BACKEND.md](DEPLIEGUE_BACKEND.md)**.
3. En **`js/config.js`** pon en **`API_URL_PRODUCCION`** la URL de tu backend en Render.
4. Quien abra el enlace del frontend usará ese backend: **usuarios, fichajes y reparaciones se sincronizan para todos**, aunque tu PC esté apagado.

### Opción B: Solo subir el frontend (cada uno con sus datos)

- Sube la carpeta del proyecto a [Netlify Drop](https://app.netlify.com/drop), [Vercel](https://vercel.com) o **GitHub Pages** (Settings → Pages → Deploy from branch).
- Cada persona que abra la URL tendrá su propio `localStorage` (no se comparten usuarios ni registros entre dispositivos).

### Resumen

| Qué quieres | Cómo hacerlo |
|------------|----------------|
| Que todos vean los mismos datos al abrir el enlace (sin depender de tu PC) | Despliega el backend en Render y configura `API_URL_PRODUCCION` en `js/config.js`. Ver [DEPLIEGUE_BACKEND.md](DEPLIEGUE_BACKEND.md). |
| Solo que alguien pueda abrir la app por internet | Sube el proyecto a GitHub Pages, Netlify o Vercel. Cada usuario tendrá sus datos en su navegador. |
