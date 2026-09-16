'use strict';

// Error de dominio con codigo HTTP adjunto, compartido por todos los
// modulos que reservan un recurso (cancha, salon, cabana, mesa). El
// controller de cada modulo lee `error.statusCode` para decidir la
// respuesta (404/409/422), sin tener que repetir esa decision en cada
// catch.
//
// Antes vivia declarada DENTRO de reservasCancha.service.js. Se extrae
// aqui en el Sprint 2 porque reservasSalon.service.js necesita
// exactamente la misma clase para HU-013: sin este archivo, la unica
// forma de tenerla habria sido copiar y pegar las mismas 7 lineas en
// cada modulo nuevo (cabana, restaurante, ...), duplicando el mismo
// contrato de errores en cada uno.
class DomainError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
  }
}

module.exports = { DomainError };
