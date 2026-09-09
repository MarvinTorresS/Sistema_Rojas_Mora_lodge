'use strict';

// Se registra despues de todas las rutas: si ninguna coincidio, la
// peticion cae aqui y respondemos 404 en formato JSON consistente en
// vez de dejar que Express devuelva su pagina HTML por defecto.
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    error: {
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    },
  });
}

module.exports = notFoundHandler;
