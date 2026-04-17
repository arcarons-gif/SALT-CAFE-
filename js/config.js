/**
 * Configuración de la app SALTLAB Calculator.
 * URL del backend: si la defines aquí, los usuarios no tendrán que escribirla.
 *
 * Comprueba que API_URL_PRODUCCION coincida EXACTAMENTE con la URL pública de tu servicio
 * (Render, etc.), sin barra final. Si apunta a otro host o a un servicio apagado, la sync
 * de usuarios fallará (consola: POST /api/users falló). En GitHub Pages la app debe servirse
 * por HTTPS; el backend también debe ser HTTPS (Render lo es) para evitar contenido mixto.
 */

/** Backend cuando la app se abre en local (mismo PC). Para que todos compartan la misma BBDD, apuntamos también al backend público. */
var API_URL_LOCAL = 'https://salt-cafe.onrender.com';

/**
 * Backend cuando la app se abre desde GitHub Pages (cualquier *.github.io).
 * Debe ser la URL que te da el panel del hosting (ej. https://tu-api.onrender.com).
 */
var API_URL_PRODUCCION = 'https://salt-cafe.onrender.com';

if (typeof window !== 'undefined') {
  var esProduccion = /github\.io/i.test(window.location.hostname || '');
  window.SALTLAB_API_URL = esProduccion ? (window.SALTLAB_API_URL_PRODUCCION || API_URL_PRODUCCION) : API_URL_LOCAL;
}

/** Webhook de Discord para enviar el resumen financiero (economía). */
window.SALTLAB_DISCORD_WEBHOOK_ECONOMIA = 'https://discord.com/api/webhooks/1481047431893225643/iltdNmW066Xr4lEV8Uaf9Bb4VZzYZvlLmvbNEmt0lNCs0NusYH9Uor-Bd5gI5TUxG67l';
