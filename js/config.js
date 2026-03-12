/**
 * Configuración de la app SALTLAB Calculator.
 * URL del backend: si la defines aquí, los usuarios no tendrán que escribirla.
 * Cambia la IP/puerto si tu servidor está en otra máquina.
 */

/** Backend cuando la app se abre en local (mismo PC). Usa localhost:3001 si el servidor corre en esta máquina; si está en otro PC de la red, pon su IP (ej. http://192.168.0.63:3001). */
var API_URL_LOCAL = 'http://localhost:3001';

/**
 * Backend cuando la app se abre desde GitHub Pages (production).
 * Sustituye por la URL de tu backend en Render (ej. https://saltlab-calculator-api.onrender.com).
 * Así todos los que abran https://arcarons-gif.github.io/SALT-CAFE-/ usarán el mismo backend
 * y los datos se sincronizarán aunque tu PC esté apagado.
 */
var API_URL_PRODUCCION = 'https://saltlab-calculator-api.onrender.com';

if (typeof window !== 'undefined') {
  var esProduccion = /arcarons-gif\.github\.io|github\.io/i.test(window.location.hostname || '');
  window.SALTLAB_API_URL = esProduccion ? (window.SALTLAB_API_URL_PRODUCCION || API_URL_PRODUCCION) : API_URL_LOCAL;
}

/** Webhook de Discord para enviar el resumen financiero (economía). */
window.SALTLAB_DISCORD_WEBHOOK_ECONOMIA = 'https://discord.com/api/webhooks/1481047431893225643/iltdNmW066Xr4lEV8Uaf9Bb4VZzYZvlLmvbNEmt0lNCs0NusYH9Uor-Bd5gI5TUxG67l';
