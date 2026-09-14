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

// HU-003: conserva el contrato paginado de HU-002.
async function searchBookings(req, res, next) {
  try {
    const result = await reservasCanchaService.searchFieldBookings(req.query);
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

// GET /api/field-bookings/filter — HU-004.
async function filterBookingsByStatus(req, res, next) {
  try {
    const result = await reservasCanchaService.filterFieldBookingsByStatus(req.query);
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

// POST /api/field-bookings/:bookingId/cancel — HU-006.
async function cancelBooking(req, res, next) {
  try {
    const booking = await reservasCanchaService.cancelFieldBooking(req.params.bookingId, req.body);
    return res.json({ data: booking });
  } catch (error) {
    return next(error);
  }
}

async function updateBooking(req, res, next) {
  try {
    const booking = await reservasCanchaService.updateFieldBooking(req.params.bookingId, req.body);
    return res.json({ data: booking });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createBooking,
  listBookings,

  searchBookings,
  filterBookingsByStatus,
  updateBooking,
  cancelBooking,
};
