'use strict';

// Utilidades de deteccion de solapamiento de horario sobre la tabla
// generica `bookings` (y sobre `resource_blocks`), compartidas por
// cualquier modulo que reserve un recurso: cancha, salon, cabana o
// mesa. Antes de este archivo, reservasCancha.service.js tenia su
// propia copia de ACTIVE_BOOKING_STATUSES y armaba el mismo filtro de
// Sequelize a mano en 4 lugares distintos (crear y modificar, contra
// reservas y contra bloqueos); reservasSalon.service.js necesitaba
// exactamente la misma logica para HU-013, asi que quedarse con la
// copia habria significado un tercer lugar donde corregir el mismo
// bug el dia que aparezca uno.
const { Op } = require('sequelize');

// Estados de Booking que cuentan como "ocupando" el horario de un
// recurso, sin importar el area: una reserva 'cancelled' o 'rejected'
// ya libero el horario y no debe bloquear una reserva nueva.
const ACTIVE_BOOKING_STATUSES = ['pending', 'active', 'checked_in'];

// Clausula `where` de Sequelize para encontrar OTRAS reservas que se
// solapan con el intervalo [start, end). Formula estandar de
// interseccion de intervalos (dos rangos se solapan si el inicio de
// uno es anterior al fin del otro, en ambos sentidos), expresada
// directamente como filtro de Sequelize porque asi es como los
// modulos la necesitan (contra Booking.findOne/findAndCountAll), no
// como funcion pura sobre dos Date sueltos.
//
// NOTA para quien venga de leer reservasCancha.service.js de versiones
// anteriores: esta funcion reemplaza a `rangesOverlap(aStart, aEnd,
// bStart, bEnd)`, que quedaba declarada y exportada en ese archivo
// pero nunca se llamaba desde ningun lado (cada consulta armaba su
// propio filtro Op.lt/Op.gt a mano). Era codigo muerto; se elimino al
// hacer este refactor y se dejo una sola version, la que si se usa.
//
// excludeBookingId es opcional: se usa al MODIFICAR una reserva
// existente (HU-005, HU-014), para no comparar la reserva contra si
// misma.
function buildBookingOverlapWhere({ start, end, excludeBookingId } = {}) {
  const where = {
    status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
    startDatetime: { [Op.lt]: end },
    endDatetime: { [Op.gt]: start },
  };
  if (excludeBookingId) {
    where.bookingId = { [Op.ne]: excludeBookingId };
  }
  return where;
}

// Igual que arriba, pero contra ResourceBlock (bloqueos de
// mantenimiento o uso interno), que usa `isActive` en vez de `status`.
function buildBlockOverlapWhere({ start, end } = {}) {
  return {
    isActive: true,
    startDatetime: { [Op.lt]: end },
    endDatetime: { [Op.gt]: start },
  };
}

module.exports = {
  ACTIVE_BOOKING_STATUSES,
  buildBookingOverlapWhere,
  buildBlockOverlapWhere,
};
