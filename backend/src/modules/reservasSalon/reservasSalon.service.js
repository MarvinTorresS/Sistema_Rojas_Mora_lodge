'use strict';

// Logica de negocio de las reservas del salon de eventos (HU-007,
// HU-013 -- Marvin, Sprint 2; HU-014, HU-015 -- Kendall). Misma
// separacion de capas que reservasCancha.service.js: esta capa no sabe
// nada de HTTP, recibe datos ya validados en su FORMA y lanza
// DomainError con un statusCode cuando una regla de NEGOCIO falla.
//
// El salon se reserva POR DIA (como un hotel): hora de entrada y de
// salida fijas (ver reservasSalon.schedule.util.js), un solo cliente
// por dia y con al menos un dia de anticipacion. Ya no hay planes de precio, horas extra ni anticipo.
const {
  Booking, Resource, ResourceBlock, Customer, sequelize,
} = require('../../models');
const { Op } = require('sequelize');
const { DomainError } = require('../../utils/domainError.util');
const { buildBookingOverlapWhere, buildBlockOverlapWhere } = require('../../utils/bookingOverlap.util');
const { matchCustomerByPhone, createCustomer } = require('../../services/customerResolution.service');
const { hallDayWindow, localIsoDate, hallSchedule } = require('./reservasSalon.schedule.util');

// Tipo de recurso que atiende este modulo (ver resource.model.js).
const EVENT_HALL_RESOURCE_TYPE = 'event_hall';

// CA-4 de HU-007 y HU-013: limite de dias hacia el futuro para
// consultar disponibilidad o registrar una reserva. Cada modulo es
// dueno de su propia politica (la cancha y el salon podrian tener
// ventanas distintas); mismo valor que cancha (30 dias) mientras el
// negocio no defina uno propio para el salon.
const MAX_ADVANCE_BOOKING_DAYS = 30;

// El salon se reserva con anticipacion: como minimo el dia antes (no se puede
// reservar para hoy). Es el piso de la ventana de anticipacion.
const MIN_ADVANCE_BOOKING_DAYS = 1;

const DAY_TAKEN_MESSAGE = 'El salon ya tiene una reserva ese dia. Se reserva por dia completo para que no se crucen clientes.';

// La fecha (yyyy-mm-dd) debe estar dentro de la ventana de anticipacion: desde
// MIN_ADVANCE_BOOKING_DAYS (manana) hasta MAX_ADVANCE_BOOKING_DAYS dias.
function assertBookableDay(window, { pastMessage, farMessage }) {
  const earliest = new Date();
  earliest.setHours(0, 0, 0, 0);
  earliest.setDate(earliest.getDate() + MIN_ADVANCE_BOOKING_DAYS);
  const maxAllowed = new Date();
  maxAllowed.setDate(maxAllowed.getDate() + MAX_ADVANCE_BOOKING_DAYS);
  if (window.dayStart < earliest) throw new DomainError(pastMessage, 422);
  if (window.start > maxAllowed) throw new DomainError(farMessage, 422);
}

const TOO_SOON = 'El salon se reserva con al menos un dia de anticipacion: no se puede reservar para hoy ni para fechas que ya pasaron.';

// Conflicto del dia: otra reserva activa que toque ese dia (sin importar la
// hora, porque el salon se reserva completo) o un bloqueo vigente dentro del
// horario de la reserva. `excludeBookingId` se usa al modificar.
async function findDayConflict({ resourceId, window, excludeBookingId, transaction }) {
  const booking = await Booking.findOne({
    where: {
      resourceId,
      ...buildBookingOverlapWhere({ start: window.dayStart, end: window.dayEnd, excludeBookingId }),
    },
    transaction,
  });
  const block = booking ? null : await ResourceBlock.findOne({
    where: { resourceId, ...buildBlockOverlapWhere({ start: window.start, end: window.end }) },
    transaction,
  });
  return { booking, block };
}

async function findHall(resourceId, transaction) {
  const resource = await Resource.findOne({
    where: { resourceId, resourceType: EVENT_HALL_RESOURCE_TYPE },
    transaction,
  });
  if (!resource) throw new DomainError('El salon indicado no existe.', 404);
  return resource;
}

// Horario fijo de entrada y salida (lo pide el frontend para mostrarlo).
function getHallSchedule() {
  return hallSchedule();
}

// HU-007 — Consultar la disponibilidad del salon para una fecha.
//
// Devuelve { available, reason } en vez de lanzar un error cuando el
// salon esta ocupado: a diferencia de "registrar" (HU-013), donde un
// conflicto SI es un error porque la operacion no se puede completar,
// aqui "no disponible" es una respuesta valida y esperada (CA-2/CA-3).
// Los unicos casos que se lanzan como DomainError son forma-de-negocio
// invalida (recurso inexistente, CA-4).
async function checkHallAvailability({ resourceId, date }) {
  const window = hallDayWindow(date);
  const resource = await findHall(resourceId);

  // CA-4: fecha fuera de rango permitido (pasado, o mas de
  // MAX_ADVANCE_BOOKING_DAYS en el futuro).
  assertBookableDay(window, {
    pastMessage: TOO_SOON,
    farMessage: `Solo se puede consultar disponibilidad hasta ${MAX_ADVANCE_BOOKING_DAYS} dias de anticipacion.`,
  });

  // CA-2: salon no disponible (mantenimiento/inactivo) o bloqueado.
  if (resource.status !== 'available') {
    return { available: false, reason: 'El salon no esta disponible actualmente (mantenimiento o inactivo).', ...hallSchedule() };
  }
  const { booking, block } = await findDayConflict({ resourceId, window });
  if (block) {
    return { available: false, reason: `El salon esta bloqueado ese dia (${block.reason}).`, ...hallSchedule() };
  }

  // CA-3: dia con solicitud pendiente (o ya reservado). Cualquier reserva
  // activa o pendiente ese dia deja el salon ocupado.
  if (booking) {
    const detail = booking.status === 'pending'
      ? 'tiene una solicitud pendiente de aprobacion ese dia'
      : 'ya tiene una reserva confirmada ese dia';
    return { available: false, reason: `El salon ${detail}.`, ...hallSchedule() };
  }

  // CA-1: consulta exitosa, salon disponible.
  return { available: true, reason: null, ...hallSchedule() };
}

// HU-013 — Registrar la reserva del salon para un dia.
async function createHallBooking(payload) {
  return sequelize.transaction((transaction) => createHallBookingInTransaction(payload, transaction));
}

async function createHallBookingInTransaction(payload, transaction) {
  const {
    resourceId, customerName, customerPhone, date, linkCustomerId, confirmNewCustomer,
  } = payload;
  const window = hallDayWindow(date);

  const resource = await findHall(resourceId, transaction);
  if (resource.status !== 'available') {
    throw new DomainError('El salon no esta disponible actualmente (mantenimiento o inactivo).', 409);
  }

  // CA-4 (limite de anticipacion): misma politica que la consulta de
  // disponibilidad (HU-007), asi que un dia que HU-007 reporto como valido
  // sigue siendo valido al registrar.
  assertBookableDay(window, {
    pastMessage: TOO_SOON,
    farMessage: `No se pueden registrar reservas con mas de ${MAX_ADVANCE_BOOKING_DAYS} dias de anticipacion.`,
  });

  // CA-2: conflicto del dia, contra otras reservas y contra bloqueos.
  const { booking: overlappingBooking, block } = await findDayConflict({ resourceId, window, transaction });
  if (overlappingBooking) throw new DomainError(DAY_TAKEN_MESSAGE, 409);
  if (block) throw new DomainError(`El salon esta bloqueado ese dia (${block.reason}).`, 409);

  // Cliente de la reserva (compartido con cancha, ver
  // services/customerResolution.service.js). Si el telefono ya es de OTRA
  // persona, se corta con un 409 CUSTOMER_PHONE_CONFLICT para que el
  // recepcionista elija. Ambos pasos van DENTRO de la transaccion: si
  // crear la reserva falla, el cliente nuevo tambien se deshace.
  const customer = (await matchCustomerByPhone({
    customerName, customerPhone, linkCustomerId, confirmNewCustomer, transaction,
  })) ?? (await createCustomer({ customerName, customerPhone, transaction }));

  // CA-1: registro exitoso. originChannel = 'staff', igual que HU-001:
  // "Como un Administrador o Recepcionista..." -> la reserva nace activa.
  const booking = await Booking.create({
    resourceId,
    customerId: customer.customerId,
    originChannel: 'staff',
    startDatetime: window.start,
    endDatetime: window.end,
    status: 'active',
  }, { transaction });

  return { booking, date, ...hallSchedule() };
}

// HU-014: DTO explicito; nunca exponer credenciales del cliente.
function mapHallBooking(booking) {
  const row = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
  return {
    bookingId: row.bookingId,
    date: localIsoDate(row.startDatetime),
    startDatetime: row.startDatetime, endDatetime: row.endDatetime,
    status: row.status, originChannel: row.originChannel,
    resource: row.resource ? { resourceId: row.resource.resourceId, name: row.resource.name } : null,
    customer: row.customer ? { customerId: row.customer.customerId, fullName: row.customer.fullName, phone: row.customer.phone } : null,
  };
}

function hallBookingIncludes() {
  return [
    { model: Resource, as: 'resource', required: true, where: { resourceType: EVENT_HALL_RESOURCE_TYPE } },
    { model: Customer, as: 'customer', attributes: ['customerId', 'fullName', 'phone'] },
  ];
}

// yyyy-mm-dd -> [inicio, dia siguiente) en HORA LOCAL (mismo criterio que el
// listado de la cancha: new Date("yyyy-mm-dd") se interpretaria en UTC).
function localDayRange(isoDate) {
  const { dayStart, dayEnd } = hallDayWindow(isoDate);
  return { start: dayStart, end: dayEnd };
}

// Filtros opcionales del listado (misma semantica que cancha, para que
// "Reservas del dia" y el archivo semanal funcionen igual en el salon):
//   date                -> reservas que inician ese dia local
//   dateFrom/dateBefore -> [dateFrom, dateBefore) por dia local
function buildHallListWhere({ date, dateFrom, dateBefore, status } = {}) {
  const where = {};
  if (status) where.status = status;
  if (date) {
    const { start, end } = localDayRange(date);
    where.startDatetime = { [Op.gte]: start, [Op.lt]: end };
  } else if (dateFrom || dateBefore) {
    where.startDatetime = {
      ...(dateFrom ? { [Op.gte]: localDayRange(dateFrom).start } : {}),
      ...(dateBefore ? { [Op.lt]: localDayRange(dateBefore).start } : {}),
    };
  }
  return where;
}

async function listHallBookings({
  page = 1, pageSize = 20, date, dateFrom, dateBefore, status,
} = {}) {
  page = Number(page);
  pageSize = Number(pageSize);
  const { rows, count } = await Booking.findAndCountAll({
    where: buildHallListWhere({ date, dateFrom, dateBefore, status }),
    include: hallBookingIncludes(), distinct: true,
    order: [['startDatetime', 'DESC'], ['bookingId', 'DESC']],
    limit: pageSize, offset: (page - 1) * pageSize,
  });
  return { items: rows.map(mapHallBooking), page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) };
}

async function getHallBooking(bookingId, options = {}) {
  const booking = await Booking.findOne({ where: { bookingId }, include: hallBookingIncludes(), ...options });
  if (!booking) throw new DomainError('La reserva del salon indicada no existe.', 404);
  return { ...mapHallBooking(booking), ...hallSchedule() };
}

// HU-014: lo unico que se modifica de una reserva del salon es el DIA
// (la hora de entrada y de salida son siempre las del horario del salon).
async function updateHallBooking(bookingId, changes = {}) {
  return sequelize.transaction(async (transaction) => {
    const booking = await Booking.findByPk(bookingId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw new DomainError('La reserva del salon indicada no existe.', 404);
    const resource = await Resource.findOne({
      where: { resourceId: booking.resourceId, resourceType: EVENT_HALL_RESOURCE_TYPE },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!resource) throw new DomainError('La reserva no pertenece a un salon de eventos.', 404);
    if (booking.status === 'cancelled') throw new DomainError('Una reserva cancelada no puede modificarse.', 409);
    if (resource.status !== 'available') throw new DomainError('El salon no esta disponible actualmente.', 409);

    const window = hallDayWindow(changes.date);
    assertBookableDay(window, {
      pastMessage: TOO_SOON,
      farMessage: `El dia debe estar dentro de los proximos ${MAX_ADVANCE_BOOKING_DAYS} dias.`,
    });
    const { booking: other, block } = await findDayConflict({
      resourceId: booking.resourceId, window, excludeBookingId: booking.bookingId, transaction,
    });
    if (other) throw new DomainError(DAY_TAKEN_MESSAGE, 409);
    if (block) throw new DomainError('El salon esta bloqueado ese dia.', 409);

    booking.startDatetime = window.start;
    booking.endDatetime = window.end;
    await booking.save({ fields: ['startDatetime', 'endDatetime'], transaction });
    return getHallBooking(booking.bookingId, { transaction });
  });
}

// HU-015: cancelacion operativa, sin pagos, anulaciones ni devoluciones.
async function cancelHallBooking(bookingId, { cancellationReason } = {}) {
  return sequelize.transaction(async (transaction) => {
    const booking = await Booking.findByPk(bookingId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw new DomainError('La reserva del salon indicada no existe.', 404);
    const resource = await Resource.findOne({
      where: { resourceId: booking.resourceId, resourceType: EVENT_HALL_RESOURCE_TYPE }, transaction,
    });
    if (!resource) throw new DomainError('La reserva no pertenece a un salon de eventos.', 404);
    if (booking.status === 'cancelled') throw new DomainError('La reserva ya se encuentra cancelada.', 409);
    const fields = ['status'];
    if (cancellationReason !== undefined) {
      if (typeof cancellationReason !== 'string' || cancellationReason.trim().length > 250) {
        throw new DomainError('El motivo debe tener como maximo 250 caracteres.', 422);
      }
      booking.cancellationReason = cancellationReason.trim();
      fields.push('cancellationReason');
    }
    booking.status = 'cancelled';
    await booking.save({ fields, transaction });
    return {
      bookingId: booking.bookingId, status: booking.status,
      cancellationReason: booking.cancellationReason ?? null,
    };
  });
}

module.exports = {
  cancelHallBooking,
  listHallBookings,
  buildHallListWhere,
  getHallBooking,
  getHallSchedule,
  updateHallBooking,
  EVENT_HALL_RESOURCE_TYPE,
  MAX_ADVANCE_BOOKING_DAYS,
  MIN_ADVANCE_BOOKING_DAYS,
  checkHallAvailability,
  createHallBooking,
};
