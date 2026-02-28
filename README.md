# Benny's Original Motor Works - Calculadora Genesis Community V3

App web que replica la calculadora de costes de reparación y tuneo del taller de roleplay para FiveM, con sistema de usuarios y permisos.

## Uso

1. Abre `index.html` en tu navegador (doble clic o arrastrando al Chrome/Edge).
2. **Primera vez:** usuario `admin`, contraseña `1234`. Deberás cambiarla obligatoriamente en el primer acceso.
4. Selecciona modelo de vehículo, marca las opciones de tuneo/reparación y aplica descuentos.
5. Los precios se calculan al instante.
6. **REGISTRAR TUNEO** / **REGISTRAR REPARACION** guardan el servicio en el registro local.
7. **REGISTRO SERVICIOS** muestra el historial de servicios.
8. **RESET** limpia los campos para una nueva facturación.

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

- **Usuarios**: en `localStorage` (benny_users).
- **Registro de servicios**: en `localStorage` (persiste entre sesiones).
- **Matrículas usadas**: se guardan para autocompletar en el siguiente uso.

---

## Compartir la app online (para que un compañero pueda entrar)

La app es estática (solo HTML/CSS/JS). Para que alguien pueda abrirla por internet y hacer login, hay que **subir la carpeta del proyecto** a un hosting. Cada persona que abra la URL tendrá su propio “espacio” de datos (localStorage del navegador).

### Opción 1: Netlify Drop (rápido, sin cuenta obligatoria)

1. Entra en [https://app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrastra la carpeta **`benny-calculator`** completa (con `index.html`, `app.js`, `data/`, `js/`, `styles.css`, `assets/`, etc.) a la zona de “Deploy”.
3. Netlify te dará una URL tipo `https://nombre-random-123.netlify.app`. Esa es la URL que puedes pasar a tu compañero.

**Con cuenta Netlify:** puedes elegir un nombre (ej. `saltlab-calculadora.netlify.app`) en Site settings → Domain management.

### Opción 2: Vercel

1. Crea cuenta en [vercel.com](https://vercel.com).
2. Instala Vercel CLI: `npm i -g vercel` (o usa “Import Project” en la web con GitHub).
3. En la carpeta del proyecto ejecuta: `vercel` y sigue los pasos. La carpeta que contiene `index.html` debe ser la raíz del proyecto (por ejemplo `benny-calculator`).
4. Te darán una URL tipo `https://tu-proyecto.vercel.app`.

### Opción 3: GitHub Pages

1. Crea un repositorio en GitHub y sube todo el contenido de `benny-calculator` (la raíz del repo debe tener `index.html`).
2. En el repo: **Settings → Pages** → Source: “Deploy from a branch” → rama `main` (o `master`) → carpeta `/ (root)` → Save.
3. La app quedará en `https://tu-usuario.github.io/nombre-repo/`.

### Login cuando la app está online

- **Primera vez que alguien entra** en esa URL: no hay usuarios; la app crea el **admin por defecto** y, si aplica, usuarios de prueba.
- Tu compañero puede entrar con:
  - **Usuario:** `admin` · **Contraseña:** `1234` (luego le pedirá cambiarla), o
  - Usuarios de prueba: `juan` / `tyrone` / `pepa` con contraseña `1234` (si existen en tu versión).
- Los usuarios y el registro de servicios se guardan **en el navegador de quien usa la app**. Es decir: lo que haga tu compañero en su ordenador (login, reparaciones, etc.) queda en su navegador; lo que hagas tú en el tuyo, en el tuyo. No se comparte una base de datos entre dispositivos.
- Si quieres que todos compartan los mismos usuarios y datos (mismo login para todos), haría falta conectar la app a un **backend** (servidor + base de datos) y cambiar el sistema de login para usar esa API.

### Resumen

| Qué quieres | Cómo hacerlo |
|------------|----------------|
| Que tu compañero abra la app por internet y pueda hacer login | Sube la carpeta a Netlify Drop, Vercel o GitHub Pages y pásale la URL. Usará `admin` / `1234` (o usuarios de prueba) la primera vez. |
| Mismo usuario/datos para todos los dispositivos | Requiere backend (API + base de datos); la app actual solo usa `localStorage` por navegador. |
