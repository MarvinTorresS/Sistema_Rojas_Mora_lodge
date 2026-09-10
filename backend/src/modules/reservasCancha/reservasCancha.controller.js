'use strict';

// Traductor entre HTTP y la capa de servicio. Deliberadamente "tonto":
// no valida forma (eso ya lo hizo el validator) ni decide reglas de
// negocio (eso lo hace el service) — solo lee la peticion, llama al
// service, y traduce el resultado (o el error) a una respuesta HTTP.
const reservasCanchaService = require('./reservasCancha.service');

// POST /api/field-bookings — HU-001.
async function createBooking(req, res, next) {
  try {
    const booking = await reservasCanchaService.createFieldBooking(req.body);
    return res.status(201).json({ data: booking });
  } catch (error) {
    // DomainError ya trae su propio statusCode (404/409/422, segun el
    // criterio de aceptacion que fallo); cualquier otro error
    // inesperado sigue de largo hacia el errorHandler global, que lo
    // registra como 500.
    return next(error);
  }
}

// GET /api/field-bookings — HU-002.
// Lee los filtros opcionales del query string (date, status, page,
// pageSize), ya validados en su forma por listBookingsRules, y delega
// TODA la logica al service. Responde 200 con { data, meta }: `data` es
// el arreglo de reservas (vacio si no hay, CA-2) y `meta` la info de
// paginacion para que el frontend pueda pintar "pagina 1 de N".
async function listBookings(req, res, next) {
  try {
    const result = await reservasCanchaService.listFieldBookings(req.query);
    return res.json({
      data: result.items,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createBooking,
  listBookings,

  // TODO (Kendall — HU-003): searchBookings(req, res, next)
  // TODO (Alison — HU-004): filterBookingsByStatus(req, res, next)
  // TODO (Kendall — HU-005): updateBooking(req, res, next)
  // TODO (Alison — HU-006): cancelBooking(req, res, next)
  // Mismo patron que createBooking: leer req, llamar a la funcion del
  // service correspondiente (ver los TODO en reservasCancha.service.js)
  // y traducir el resultado a status HTTP. No agregar logica de negocio
  // aqui.
};
