# Cómo tener la app siempre disponible (sin depender de tu PC)

## Por qué no se puede “abrir el backend” al abrir el enlace

- **GitHub Pages** (donde está https://arcarons-gif.github.io/SALT-CAFE-/) solo sirve **archivos estáticos** (HTML, CSS, JS).
- No puede ejecutar Node.js ni arrancar ningún servidor. Al abrir el enlace, el navegador solo descarga el frontend.
- Para que **todos los usuarios vean los mismos datos al mismo tiempo**, el backend tiene que estar en un **servidor que esté siempre encendido en internet** (en la nube), no en tu ordenador.

## Solución: backend en la nube + frontend en GitHub Pages

1. **Frontend**: sigue en GitHub Pages (https://arcarons-gif.github.io/SALT-CAFE-/) — ya está.
2. **Backend**: lo despliegas en un servicio gratuito (por ejemplo **Render**). Ese backend estará siempre activo y guardará usuarios, fichajes, reparaciones, etc.
3. **Configuración**: el frontend que se abre desde GitHub Pages debe usar la URL de ese backend en la nube. Así, quien abra el enlace usará el mismo backend y los datos se sincronizarán para todos, aunque tu PC esté apagado.

---

## Pasos para desplegar el backend en Render (gratis)

### 1. Cuenta en Render

- Entra en [render.com](https://render.com) y crea una cuenta (con GitHub es rápido).

### 2. Nuevo Web Service

- En el panel: **New** → **Web Service**.
- Conecta el repositorio de GitHub donde está el proyecto (por ejemplo `SALT-CAFE-` o el que uses).
- Configura:
  - **Name**: p. ej. `saltlab-calculator-api`
  - **Root Directory**: `server` (solo se despliega la carpeta `server`)
  - **Runtime**: Node
  - **Build Command**: `npm install`
  - **Start Command**: `npm start`
- En **Plan** elige **Free**.
- Clic en **Create Web Service**.

### 3. Obtener la URL del backend

- Cuando termine el despliegue, Render te dará una URL como:
  `https://saltlab-calculator-api.onrender.com`
- Copia esa URL (será la de tu API).

### 4. Configurar el frontend para usar ese backend

En el repositorio, en **`js/config.js`** ya está preparado: si la app se carga desde `arcarons-gif.github.io`, usará la URL de producción. Solo tienes que poner la URL de tu backend en Render.

Abre **`js/config.js`** y actualiza la variable **`API_URL_PRODUCCION`** con la URL que te haya dado Render (sin barra final), por ejemplo:

```javascript
var API_URL_PRODUCCION = 'https://saltlab-calculator-api.onrender.com';
```

Sustituye por la URL real de tu Web Service en Render.

### 5. Subir los cambios y probar

- Haz commit y push de los cambios en `js/config.js`.
- Espera a que GitHub Pages se actualice (unos minutos).
- Abre https://arcarons-gif.github.io/SALT-CAFE-/ y comprueba que el mensaje de “Conectando con el servidor…” pasa a conectar con tu backend en Render.
- Prueba con otro usuario o en otra sesión: los datos (usuarios, fichajes, reparaciones) deberían verse igual para todos.

---

## Importante sobre el plan gratuito de Render

- El backend se “duerme” tras unos minutos sin peticiones. La **primera** vez que alguien entre puede tardar 30–50 segundos en responder; después va rápido.
- Los datos se guardan en archivos JSON dentro del servicio. En el plan gratuito, si Render reinicia el servicio, **podrían perderse** si no usas disco persistente. Para algo más serio conviene luego pasar a base de datos (p. ej. PostgreSQL en Render) o a un plan de pago con disco.

---

## Resumen

| Qué quieres | Cómo se hace |
|-------------|--------------|
| Que al abrir el enlace todos usen el mismo backend | Backend desplegado en Render (o similar) y frontend en GitHub Pages apuntando a esa URL. |
| Que no dependa de tu PC | El backend está en la nube (Render), no en tu ordenador. |
| Que los datos se actualicen para todos a la vez | El frontend en GitHub Pages ya sincroniza con ese backend; todos comparten los mismos usuarios, fichajes y servicios. |

No es posible que “al abrir el enlace se abra automáticamente el backend” en tu máquina: quien abre el enlace solo tiene el frontend en el navegador. La solución correcta es tener **un solo backend en internet** que todos usen, desplegado en un servicio como Render.
