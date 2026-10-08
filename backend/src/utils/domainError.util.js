'use strict';

// Error de dominio con codigo HTTP adjunto, compartido por todos los
// modulos que reservan un recurso (cancha, salon, cabina, mesa). El
// controller de cada modulo lee `error.statusCode` para decidir la
// respuesta (404/409/422), sin tener que repetir esa decision en cada
// catch.
//
// Antes vivia declarada DENTRO de reservasCancha.service.js. Se extrae
// aqui en el Sprint 2 porque reservasSalon.service.js necesita
// exactamente la misma clase para HU-013: sin este archivo, la unica
// forma de tenerla habria sido copiar y pegar las mismas 7 lineas en
// cada modulo nuevo (cabina, restaurante, ...), duplicando el mismo
// contrato de errores en cada uno.
class DomainError extends Error {
  // `extra` es OPCIONAL y existe para los casos en que el mensaje solo
  // no alcanza para que el frontend reaccione (Sprint 3, HU-016):
  //   - code:    identificador estable y legible por maquina (ej.
  //              'GUEST_ALREADY_EXISTS'). El frontend decide con el
  //              `code`, nunca comparando el texto del mensaje, que
  //              es para humanos y puede cambiar de redaccion.
  //   - details: datos adicionales (ej. cabinas alternativas).
  // Los llamados existentes `new DomainError(msg, status)` siguen
  // funcionando igual: es un cambio compatible hacia atras.
  constructor(message, statusCode, extra = {}) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
    if (extra.code !== undefined) this.code = extra.code;
    if (extra.details !== undefined) this.details = extra.details;
  }
}

module.exports = { DomainError };
