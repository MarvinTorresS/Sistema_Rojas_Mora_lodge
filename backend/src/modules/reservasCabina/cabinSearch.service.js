'use strict';

// Logica de negocio de la BUSQUEDA de reservas de cabina por huesped
// (HU-018, Sprint 3). Igual que el resto del modulo: no sabe de
// HTTP; recibe datos ya validados en su forma y lanza DomainError cuando
// una regla de negocio falla.
const { Op } = require('sequelize');
const {
  Booking, Resource, CabinDetail, Customer,
} = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { toHotelDate, countNights, calculateStayCost } = require('./cabinStay.util');
const { getRecordedStayTotals } = require('./cabinBilling.service');
const { MODIFIABLE_STATUSES } = require('./cabinBookingUpdate.util');
const {
  DEFAULT_PAGE_SIZE, EMPTY_SEARCH_MESSAGE, NO_RESULTS_MESSAGE, normalizeSearchTerm, escapeLike,
} = require('./cabinSearch.util');

const CABIN_RESOURCE_TYPE = 'cabin';
const SEARCH_TERM_REQUIRED_CODE = 'SEARCH_TERM_REQUIRED';

// Una fila del resultado. Trae todo lo que necesita la pantalla, INCLUIDOS
// los datos de contacto y el numero de acompanantes: son los que HU-019
// precarga en el formulario de modificar, asi no hace falta otra consulta.
function toSearchItem(booking, total) {
  const checkInDate = toHotelDate(booking.startDatetime);
  const checkOutDate = toHotelDate(booking.endDatetime);
  return {
    bookingId: booking.bookingId,
    status: booking.status,
    isModifiable: MODIFIABLE_STATUSES.includes(booking.status),
    cabin: {
      resourceId: booking.resource.resourceId,
      name: booking.resource.name,
      capacity: booking.resource.cabinDetail ? booking.resource.cabinDetail.capacity : null,
    },
    guest: {
      customerId: booking.customer.customerId,
      fullName: booking.customer.fullName,
      identificationNumber: booking.customer.identificationNumber,
      phone: booking.customer.phone,
      email: booking.customer.email,
    },
    partySize: booking.partySize,
    companions: Math.max((booking.partySize || 1) - 1, 0),
    stay: { checkInDate, checkOutDate, nights: countNights(checkInDate, checkOutDate) },
    // Tarifa total de la estadia: la ultima registrada. Si la reserva es
    // anterior a ese registro, se calcula con la tarifa actual (isEstimated).
    totalAmount: total.totalAmount,
    isTotalEstimated: total.isEstimated,
  };
}

// Total de cada reserva de la pagina, con una sola consulta a la auditoria.
async function totalsFor(rows) {
  const fallbacks = new Map(rows.map((booking) => [booking.bookingId, calculateStayCost({
    nights: countNights(toHotelDate(booking.startDatetime), toHotelDate(booking.endDatetime)),
    pricePerNight: booking.resource.cabinDetail ? booking.resource.cabinDetail.pricePerNight : 0,
  })]));
  return getRecordedStayTotals({ fallbacks });
}

// GET /api/cabin-bookings/search?q=
//
// CA-1: devuelve UNICAMENTE las reservas cuyo huesped coincide, por
//       nombre o por identificacion, con coincidencia parcial. LIKE de
//       MySQL no distingue mayusculas/minusculas con el collation que usa
//       el proyecto (utf8mb4_*_ci), igual que la busqueda de HU-127.
// CA-2: sin coincidencias responde 200 con lista vacia y el mensaje del
//       criterio en meta.message (no es un error). El criterio buscado se
//       devuelve en meta.query para que la pantalla lo mantenga.
//
// Incluye reservas de TODOS los estados: ubicar la informacion de
// hospedaje de un huesped incluye su historial (finalizadas, canceladas).
async function searchCabinBookings({ q, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const term = normalizeSearchTerm(q);
  if (!term) {
    throw new DomainError(EMPTY_SEARCH_MESSAGE, 422, { code: SEARCH_TERM_REQUIRED_CODE });
  }
  const currentPage = Number(page);
  const size = Number(pageSize);
  const like = `%${escapeLike(term)}%`;
  // La cedula se guarda solo con numeros: "6-0495-0088" tambien debe encontrarla.
  const digitsOnly = term.replace(/[\s-]/g, '');
  const idLike = /^\d+$/.test(digitsOnly) && digitsOnly !== term ? `%${digitsOnly}%` : null;

  const { rows, count } = await Booking.findAndCountAll({
    include: [
      {
        model: Resource,
        as: 'resource',
        required: true,
        where: { resourceType: CABIN_RESOURCE_TYPE },
        include: [{ model: CabinDetail, as: 'cabinDetail', required: false }],
      },
      {
        model: Customer,
        as: 'customer',
        required: true,
        where: {
          [Op.or]: [
            { fullName: { [Op.like]: like } },
            { identificationNumber: { [Op.like]: like } },
            ...(idLike ? [{ identificationNumber: { [Op.like]: idLike } }] : []),
          ],
        },
      },
    ],
    distinct: true,
    // Las estadias mas recientes primero; el id desempata para que la
    // paginacion sea estable.
    order: [['startDatetime', 'DESC'], ['bookingId', 'DESC']],
    limit: size,
    offset: (currentPage - 1) * size,
  });

  const totals = await totalsFor(rows);
  return {
    items: rows.map((booking) => toSearchItem(booking, totals.get(booking.bookingId))),
    page: currentPage,
    pageSize: size,
    total: count,
    totalPages: Math.ceil(count / size),
    query: term,
    message: count === 0 ? NO_RESULTS_MESSAGE : null,
  };
}

module.exports = {
  SEARCH_TERM_REQUIRED_CODE,
  searchCabinBookings,
};
