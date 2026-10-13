'use strict';

// Middleware de error centralizado (4 parametros: Express lo reconoce
// como manejador de errores por esa firma, sin importar el nombre).
// Cada controlador puede simplemente hacer `next(error)` y este es el
// unico lugar del sistema que decide como se ve una respuesta de error,
// en vez de que cada ruta construya su propio formato.
function errorHandler(error, req, res, _next) {
  const status = error.statusCode || 500;

  // En desarrollo se expone el detalle del error para depurar mas rapido;
  // en produccion se oculta para no filtrar detalles internos del sistema.
  const isDev = process.env.NODE_ENV === 'development';

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: {
      message: error.message || 'Error interno del servidor',
      // code y details solo existen en DomainError que los declaran
      // (ver domainError.util.js). `details` usa la misma clave que
      // las respuestas 422 de los validators, para que el frontend
      // lea siempre el mismo lugar.
      ...(error.code !== undefined && { code: error.code }),
      ...(error.details !== undefined && { details: error.details }),
      ...(isDev && { stack: error.stack }),
    },
  });
}

module.exports = errorHandler;
