import axios from 'axios';

/**
 * Instancia compartida de axios para todo el frontend.
 *
 * Centralizar esto acá evita que cada integrante configure su propia URL
 * base o sus propios headers por separado. Cada módulo debe importar esta
 * instancia en su propio archivo de servicio (ej. services/reservasCanchaService.js)
 * en vez de llamar a axios directamente o crear una instancia nueva.
 *
 * La URL base sale de la variable de entorno VITE_API_URL (ver .env.example
 * en la raíz del repo: VITE_API_URL=http://localhost:4000/api).
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// NOTA para HU-048 (inicio de sesión): cuando exista el token de
// autenticación, acá es donde se agrega el interceptor que lo adjunta a
// cada petición (api.interceptors.request.use(...)). Todavía no aplica.

export default api;
