# Por qué mi compañero no ve los cambios que yo hago en la web

Cuando entras en **https://arcarons-gif.github.io/SALT-CAFE-/** y creas usuarios, registras reparaciones, etc., esos datos tienen que guardarse en un **mismo sitio** al que todos accedan. Si no, cada uno ve solo lo que tiene en su propio navegador.

## Qué está pasando

- **GitHub Pages** (donde está la web) solo sirve archivos (HTML, CSS, JS). **No guarda datos**.
- Si **no hay backend en la nube** (o no está bien configurado), lo que tú guardas queda en **tu navegador** (localStorage). Tu compañero tiene **otro navegador**, así que ve **sus** datos, no los tuyos.
- Para que **todos vean lo mismo**, hace falta un **servidor API en internet** (por ejemplo en Render) que guarde usuarios, fichajes y reparaciones. La web en GitHub Pages debe estar configurada para usar **esa** URL.

## Qué hay que hacer

1. **Desplegar el backend en la nube** (una sola vez), por ejemplo en [Render](https://render.com), siguiendo [DEPLIEGUE_BACKEND.md](DEPLIEGUE_BACKEND.md). Así tendrás una URL tipo `https://saltlab-calculator-api.onrender.com`.
2. **Configurar la app** para que use esa URL cuando se abre desde GitHub Pages. En `js/config.js` está la variable `API_URL_PRODUCCION`; debe tener **exactamente** la URL de tu backend en Render.
3. **Subir el código** al repo (commit + push) para que GitHub Pages y quien clone el repo tengan esa configuración. Usa el script `subir-cambios.ps1` (Windows) o `subir-cambios.sh` (Mac/Linux).

Cuando eso esté hecho, tú y tu compañero, al abrir https://arcarons-gif.github.io/SALT-CAFE-/, estaréis usando el **mismo backend** y veréis los **mismos datos**.

## Resumen

| Situación | Resultado |
|-----------|-----------|
| Sin backend en la nube (o URL mal puesta) | Cada uno ve solo lo que guarda en su navegador. Tu compañero no ve tus cambios. |
| Backend desplegado en Render y `API_URL_PRODUCCION` en `js/config.js` apuntando a esa URL | Todos los que abran la web comparten los mismos datos. |

Si el backend en Render ya estaba creado pero “no se ven cambios”, comprueba que la URL en `js/config.js` sea la correcta y que hayas hecho **push** de ese archivo. Si el backend se ha reiniciado (plan gratuito), los datos guardados en archivos dentro del servicio pueden haberse borrado; para evitar pérdidas, más adelante se puede usar base de datos (p. ej. PostgreSQL en Render).
