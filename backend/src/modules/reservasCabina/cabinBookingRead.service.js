'use strict';

// Consulta y representación compartidas por HU-017 y HU-018.
const { Booking, Resource, CabinDetail, Customer } = require('../../models');
const { toHotelDate, countNights, calculateStayCost } = require('./cabinStay.util');
const { getRecordedStayTotals } = require('./cabinBilling.service');
const { MODIFIABLE_STATUSES } = require('./cabinBookingUpdate.util');
const { DEFAULT_PAGE_SIZE } = require('./cabinSearch.util');
const CABIN_RESOURCE_TYPE = 'cabin';

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

async function readCabinBookings({ page = 1, pageSize = DEFAULT_PAGE_SIZE, customerWhere } = {}) {
  const currentPage = Number(page);
  const size = Number(pageSize);
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
        where: customerWhere,
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
  };
}

module.exports = { readCabinBookings };
