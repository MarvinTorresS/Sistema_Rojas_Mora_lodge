'use strict';

// Logica de negocio de HU-001 a HU-006 (modulo de reservas de cancha
// sintetica). Esta capa NO sabe nada de HTTP (nunca ve `req` ni `res`):
// recibe datos ya validados en su FORMA por el validator, y devuelve
// datos o lanza errores con un `statusCode` adjunto. Eso permite
// probarla con Jest llamando las funciones directo, sin levantar un
// servidor Express (ver tests/unit/).
const { Op } = require('sequelize');
const { Booking, Resource, ResourceBlock, Customer } = require('../../models');

// CA-4 "Reserva con demasiada anticipacion": limite de dias hacia el
// futuro para poder registrar una reserva. Definido como constante (no
// un numero suelto en medio del codigo/"magic number") para que sea
// facil de encontrar y ajustar si el negocio cambia la politica.
const MAX_ADVANCE_BOOKING_DAYS = 30;

// Tipo de recurso que atiende este modulo. Resource es una tabla
// generica que tambien sirve para cabana/salon/mesa (ver
// resource.model.js); este modulo solo debe operar sobre canchas.
const FIELD_RESOURCE_TYPE = 'field';

// Estados de Booking que cuentan como "ocupando" el horario para efectos
// de deteccion de conflicto. Una reserva 'cancelled' o 'rejected' ya
// libero el horario y no debe bloquear una reserva nueva.
const ACTIVE_BOOKING_STATUSES = ['pending', 'active', 'checked_in'];

// Error de dominio con codigo HTTP adjunto. El controller lee
// `error.statusCode` para decidir la respuesta, sin tener que repetir
// esa decision (¿es 404? ¿409? ¿422?) en cada catch.
class DomainError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'DomainError';
    this.statusCode = statusCode;
  }
}

// Determina si dos intervalos de tiempo [aStart, aEnd) y [bStart, bEnd)
// se solapan. Formula estandar de interseccion de intervalos: se
// solapan si el inicio de uno es anterior al fin del otro, en ambos
// sentidos. Se usa tanto para chocar contra otras reservas como contra
// bloqueos (mantenimiento).
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

// Busca (o crea) el Customer a partir de los datos sueltos que manda el
// formulario (nombre + telefono). El personal de recepcion no siempre
// tiene de antemano el customerId: HU-001 dice "registrar una reserva
// nueva", no "elegir un cliente ya existente". Se busca primero por
// telefono (mas estable que el nombre) para no duplicar clientes que ya
// existen en el sistema.
async function findOrCreateCustomer({ customerName, customerPhone }) {
  const [customer] = await Customer.findOrCreate({
    where: { phone: customerPhone },
    defaults: { fullName: customerName, phone: customerPhone },
  });
  return customer;
}

// HU-001 — Registrar una nueva reserva de cancha sintetica.
// Orquesta, en orden, los criterios de aceptacion CA-2, CA-4 y CA-5
// antes de crear el registro (CA-1). CA-3 ya se resolvio en la capa de
// validator.
async function createFieldBooking(payload) {
  const { resourceId, customerName, customerPhone, startDatetime, endDatetime } = payload;

  const start = new Date(startDatetime);
  const end = new Date(endDatetime);

  if (end <= start) {
    throw new DomainError('La hora de fin debe ser posterior a la hora de inicio.', 422);
  }

  // No se puede registrar una reserva en un horario que ya paso.
  if (start < new Date()) {
    throw new DomainError('No se pueden registrar reservas en una fecha u hora que ya paso.', 422);
  }

  // El recurso debe existir y ser efectivamente una cancha: este
  // modulo no debe poder reservar, por error, una cabana o un salon.
  const resource = await Resource.findOne({
    where: { resourceId, resourceType: FIELD_RESOURCE_TYPE },
  });
  if (!resource) {
    throw new DomainError('La cancha indicada no existe.', 404);
  }
  if (resource.status !== 'available') {
    throw new DomainError('La cancha no esta disponible actualmente (mantenimiento o inactiva).', 409);
  }

  // CA-4: Reserva con demasiada anticipacion.
  const maxAllowedDate = new Date();
  maxAllowedDate.setDate(maxAllowedDate.getDate() + MAX_ADVANCE_BOOKING_DAYS);
  if (start > maxAllowedDate) {
    throw new DomainError(
      `No se pueden registrar reservas con mas de ${MAX_ADVANCE_BOOKING_DAYS} dias de anticipacion.`,
      422,
    );
  }

  // CA-2: Conflicto de horario — contra otras reservas activas de ESTE
  // recurso y contra bloqueos vigentes (mantenimiento, uso interno).
  const overlappingBooking = await Booking.findOne({
    where: {
      resourceId,
      status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      startDatetime: { [Op.lt]: end },
      endDatetime: { [Op.gt]: start },
    },
  });
  if (overlappingBooking) {
    throw new DomainError('Ya existe una reserva en ese horario para esta cancha.', 409);
  }

  const overlappingBlock = await ResourceBlock.findOne({
    where: {
      resourceId,
      isActive: true,
      startDatetime: { [Op.lt]: end },
      endDatetime: { [Op.gt]: start },
    },
  });
  if (overlappingBlock) {
    throw new DomainError(`La cancha esta bloqueada en ese horario (${overlappingBlock.reason}).`, 409);
  }

  const customer = await findOrCreateCustomer({ customerName, customerPhone });

  // CA-5: Reserva superpuesta del MISMO cliente, sin importar el
  // recurso (no puede estar, a la vez, jugando en la cancha y con otra
  // reserva que se cruce en el tiempo).
  const overlappingForCustomer = await Booking.findOne({
    where: {
      customerId: customer.customerId,
      status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      startDatetime: { [Op.lt]: end },
      endDatetime: { [Op.gt]: start },
    },
  });
  if (overlappingForCustomer) {
    throw new DomainError('Este cliente ya tiene otra reserva que se cruza con ese horario.', 409);
  }

  // CA-1: Registro exitoso. originChannel = 'staff' porque HU-001 es
  // "Como un Administrador o Recepcionista..." (ver matriz): la reserva
  // nace activa, a diferencia del canal web que nace 'pending'.
  const booking = await Booking.create({
    resourceId,
    customerId: customer.customerId,
    originChannel: 'staff',
    startDatetime: start,
    endDatetime: end,
    status: 'active',
  });

  return booking;
}

module.exports = {
  DomainError,
  MAX_ADVANCE_BOOKING_DAYS,
  rangesOverlap,
  createFieldBooking,

  // TODO (Wagner — HU-002, CA-1/CA-2/CA-3): listFieldBookings(filters)
  // Listado paginado de reservas de esta cancha. CA-3 "Acceso sin
  // permisos" probablemente se resuelve con un middleware de
  // autenticacion/roles en la capa de routes, no aqui.

  // TODO (Kendall — HU-003, CA-1/CA-2): searchFieldBookings({ customerName, phone, date })
  // Busqueda por cliente, telefono o fecha exacta.

  // TODO (Alison — HU-004, CA-1/CA-2): filterFieldBookingsByStatus(status)
  // Reutiliza el mismo modelo Booking.status ('pending'|'active'|...).

  // TODO (Kendall — HU-005, CA-1..CA-5): updateFieldBooking(bookingId, changes)
  // Ojo con CA-4 "Modificacion de reserva ya confirmada (origen web)":
  // probablemente exige una regla distinta segun originChannel.

  // TODO (Alison — HU-006, CA-1..CA-6): cancelFieldBooking(bookingId, { reason, authorizedByUserId })
  // CA-3 "fuera de politica" y CA-6 "autorizada por Administrador"
  // sugieren una ventana de tiempo minima para cancelar sin
  // autorizacion extra (definir con el equipo, igual que se definio
  // MAX_ADVANCE_BOOKING_DAYS arriba).
};
