'use strict';

// Logica de negocio de la EXTENSION de hospedaje (HU-127 -- Marvin,
// Sprint 3). Un huesped con reserva vigente pide quedarse mas noches; el
// recepcionista consulta la cotizacion, confirma, y el sistema mueve la
// fecha de salida si la cabina esta libre.
//
// Como las demas capas de servicio: no sabe nada de HTTP, recibe datos
// ya validados en su FORMA y lanza DomainError cuando una regla de
// NEGOCIO falla.
const { Op } = require('sequelize');
const {
  Booking, Resource, ResourceBlock, CabinDetail, Customer, BookingExtensionRequest, sequelize,
} = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { buildBookingOverlapWhere, buildBlockOverlapWhere } = require('../../utils/bookingOverlap.util');
const {
  CHECK_OUT_TIME, toHotelDatetime, toHotelDate, countNights, calculateStayCost,
} = require('./cabinStay.util');
const { CABIN_AUDIT_ACTIONS, recordCabinAudit, getRecordedStayTotal } = require('./cabinBilling.service');

const CABIN_RESOURCE_TYPE = 'cabin';

// Estados desde los que SI se puede extender: la estadia esta reservada
// ('active') o el huesped ya ingreso ('checked_in').
const EXTENDABLE_STATUSES = ['active', 'checked_in'];

// Tope de noches por extension. Ninguna HU lo define: es una proteccion
// contra errores de digitacion (ej. el ano 2099) que dejarian la cabina
// "ocupada" por anos. Para estancias mas largas se repite la extension.
const MAX_EXTENSION_NIGHTS = 30;

// Cantidad maxima de filas por consulta del listado.
const LIST_LIMIT = 50;

// Codigos estables para el frontend (decide con el codigo, no con el texto).
const EXTENSION_NOT_AVAILABLE_CODE = 'EXTENSION_NOT_AVAILABLE';
const BOOKING_COMPLETED_CODE = 'BOOKING_COMPLETED';
const BOOKING_NOT_EXTENDABLE_CODE = 'BOOKING_NOT_EXTENDABLE';
const INVALID_EXTENSION_DATE_CODE = 'INVALID_EXTENSION_DATE';
const BOOKING_CHANGED_CODE = 'BOOKING_CHANGED';

// Redondeo a centimos para no arrastrar errores de punto flotante al
// sumar montos (misma idea que calculateStayCost).
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

// Escapa los comodines de LIKE para que buscar "50%" no devuelva todo.
function escapeLike(text) {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// --- Reglas de la extension (UNA sola fuente de verdad) --------------
// Las usan la cotizacion (solo lectura) y la confirmacion (escritura).
// Asi lo que el recepcionista ve en pantalla antes de confirmar es, por
// construccion, lo mismo que el sistema valida al confirmar.
//
// Recibe la reserva, la cabina y su detalle YA cargados; consulta lo que
// falta (choques y total registrado) y devuelve el resumen calculado o
// lanza DomainError. NO escribe nada.
async function evaluateExtension({
  booking, resource, cabinDetail, newCheckOutDate, transaction,
}) {
  // CA-4: reserva finalizada. Va primero porque es el caso que la HU
  // pide con mensaje exacto.
  if (booking.status === 'completed') {
    throw new DomainError('No es posible extender una reserva finalizada', 422, {
      code: BOOKING_COMPLETED_CODE,
    });
  }
  // Regla implicita (pendiente de formalizar como CA nuevo): una reserva
  // cancelada, rechazada o pendiente tampoco tiene una estadia que
  // prolongar.
  if (!EXTENDABLE_STATUSES.includes(booking.status)) {
    throw new DomainError('Solo se pueden extender reservas activas o con ingreso registrado.', 422, {
      code: BOOKING_NOT_EXTENDABLE_CODE,
    });
  }

  const checkInDate = toHotelDate(booking.startDatetime);
  const currentCheckOutDate = toHotelDate(booking.endDatetime);
  const extraNights = countNights(currentCheckOutDate, newCheckOutDate);

  if (extraNights < 1) {
    throw new DomainError(
      `La nueva fecha de salida debe ser posterior a la fecha de salida actual (${currentCheckOutDate}).`,
      422,
      { code: INVALID_EXTENSION_DATE_CODE },
    );
  }
  if (extraNights > MAX_EXTENSION_NIGHTS) {
    throw new DomainError(
      `Una extension no puede superar ${MAX_EXTENSION_NIGHTS} noches. Registre otra extension para prolongar mas.`,
      422,
      { code: INVALID_EXTENSION_DATE_CODE },
    );
  }

  // Solo las noches NUEVAS: desde la salida actual hasta la nueva salida.
  // La propia reserva se excluye (no puede chocar consigo misma).
  const extensionStart = booking.endDatetime;
  const extensionEnd = toHotelDatetime(newCheckOutDate, CHECK_OUT_TIME);

  const overlappingBooking = await Booking.findOne({
    where: {
      resourceId: booking.resourceId,
      ...buildBookingOverlapWhere({
        start: extensionStart, end: extensionEnd, excludeBookingId: booking.bookingId,
      }),
    },
    transaction,
  });
  const overlappingBlock = await ResourceBlock.findOne({
    where: {
      resourceId: booking.resourceId,
      ...buildBlockOverlapWhere({ start: extensionStart, end: extensionEnd }),
    },
    transaction,
  });
  // CA-2: cabina reservada, bloqueada o fuera de servicio. No se cambia nada.
  if (resource.status !== 'available' || overlappingBooking || overlappingBlock) {
    throw new DomainError(
      'No es posible extender la estadía porque la cabina no se encuentra disponible para la fecha solicitada',
      409,
      { code: EXTENSION_NOT_AVAILABLE_CODE },
    );
  }

  // CA-3: las noches nuevas se cobran con la tarifa VIGENTE hoy; el total
  // anterior es el que quedo REGISTRADO (no se recalcula con la tarifa de
  // hoy, asi un cambio de precio no altera lo ya cobrado).
  const nightlyRate = Number(cabinDetail.pricePerNight);
  const extensionAmount = calculateStayCost({ nights: extraNights, pricePerNight: nightlyRate });
  const originalNights = countNights(checkInDate, currentCheckOutDate);
  const { totalAmount: previousTotal, isEstimated } = await getRecordedStayTotal({
    bookingId: booking.bookingId,
    fallbackTotal: calculateStayCost({ nights: originalNights, pricePerNight: nightlyRate }),
    transaction,
  });
  const newTotal = roundMoney(previousTotal + extensionAmount);

  const guest = await Customer.findByPk(booking.customerId, { transaction });

  return {
    extensionEnd,
    cabin: { resourceId: resource.resourceId, name: resource.name },
    guest: guest && {
      customerId: guest.customerId,
      fullName: guest.fullName,
      identificationNumber: guest.identificationNumber,
    },
    stay: {
      checkInDate,
      previousCheckOutDate: currentCheckOutDate,
      newCheckOutDate,
      extraNights,
    },
    amounts: {
      nightlyRate,
      extensionAmount,
      previousTotal,
      newTotal,
      // Todavia no hay pagos registrados (llegan en el Sprint 7), asi que
      // el saldo pendiente es el total completo. Cuando existan pagos,
      // solo cambia esta linea: newTotal - pagos.
      pendingBalance: newTotal,
      // true = la reserva no tenia total registrado y se estimo con la
      // tarifa actual (solo pasa con reservas anteriores a este registro).
      previousTotalIsEstimated: isEstimated,
    },
  };
}

// Carga cabina y detalle de la reserva o lanza 404.
async function loadCabin({ resourceId, transaction, lock }) {
  const resource = await Resource.findOne({
    where: { resourceId, resourceType: CABIN_RESOURCE_TYPE },
    lock,
    transaction,
  });
  if (!resource) {
    throw new DomainError('La reserva indicada no corresponde a una cabina.', 404);
  }
  const cabinDetail = await CabinDetail.findByPk(resourceId, { transaction });
  if (!cabinDetail) {
    throw new DomainError('La cabina indicada no tiene datos de hospedaje configurados.', 404);
  }
  return { resource, cabinDetail };
}

// Solo necesitamos el id de la cabina ANTES de abrir la transaccion para
// poder bloquearla primero (ver extendCabinStay).
async function findBookingResourceId(bookingId) {
  const booking = await Booking.findByPk(bookingId, { attributes: ['bookingId', 'resourceId'] });
  if (!booking) {
    throw new DomainError('La reserva indicada no existe.', 404);
  }
  return booking.resourceId;
}

// GET /:bookingId/extension-quote — "cuanto costaria y se puede?".
// Solo lectura: aplica las MISMAS reglas que la confirmacion pero no
// escribe ni bloquea nada. Es informativo: la disponibilidad se vuelve a
// verificar (ahora con bloqueo) al confirmar.
async function quoteCabinExtension({ bookingId, newCheckOutDate }) {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) {
    throw new DomainError('La reserva indicada no existe.', 404);
  }
  const { resource, cabinDetail } = await loadCabin({ resourceId: booking.resourceId });
  const summary = await evaluateExtension({ booking, resource, cabinDetail, newCheckOutDate });

  return {
    bookingId: booking.bookingId,
    status: booking.status,
    cabin: summary.cabin,
    guest: summary.guest,
    stay: summary.stay,
    amounts: summary.amounts,
  };
}

// POST /:bookingId/extensions — confirmar la extension (CA-1).
async function extendCabinStay({ bookingId, newCheckOutDate }) {
  const resourceId = await findBookingResourceId(bookingId);

  // Una transaccion con bloqueo de fila sobre la CABINA, igual que
  // createCabinBooking: si en el mismo instante alguien registra una
  // reserva nueva en esa cabina o extiende otra estadia, uno espera al
  // otro y el segundo ya ve el cambio del primero. Sin el bloqueo, dos
  // recepcionistas podrian ocupar las mismas noches a la vez.
  return sequelize.transaction(async (transaction) => {
    const { resource, cabinDetail } = await loadCabin({
      resourceId, transaction, lock: transaction.LOCK.UPDATE,
    });

    // Se relee la reserva YA con la cabina bloqueada (y con su propio
    // bloqueo) para decidir con su estado mas reciente: pudo cambiar
    // (cancelarse, finalizar) entre la consulta de arriba y ahora.
    const booking = await Booking.findByPk(bookingId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!booking) {
      throw new DomainError('La reserva indicada no existe.', 404);
    }
    if (booking.resourceId !== resourceId) {
      throw new DomainError('La reserva cambio de cabina mientras se procesaba. Intente de nuevo.', 409, {
        code: BOOKING_CHANGED_CODE,
      });
    }

    const summary = await evaluateExtension({
      booking, resource, cabinDetail, newCheckOutDate, transaction,
    });

    // --- A partir de aqui todo se escribe; si algo falla, rollback de
    // todo junto (la reserva no queda a medias). ---
    const previousEnd = booking.endDatetime;
    await booking.update({ endDatetime: summary.extensionEnd }, { transaction });

    // La extension queda como solicitud ya APROBADA: en esta HU quien la
    // pide y quien la resuelve es el mismo recepcionista, en un solo paso.
    // resolved_by_user_id queda nulo hasta que exista autenticacion.
    const now = new Date();
    const extension = await BookingExtensionRequest.create({
      bookingId,
      requestedEndDatetime: summary.extensionEnd,
      status: 'approved',
      requestedAt: now,
      resolvedByUserId: null,
      resolvedAt: now,
    }, { transaction });

    // "Registrar el usuario, la fecha y la hora de la modificacion": la
    // fecha/hora la pone la tabla (created_at); el usuario queda nulo por
    // ahora. La "foto" de montos permite que una tarifa nueva (HU-128) no
    // altere este total.
    await recordCabinAudit({
      action: CABIN_AUDIT_ACTIONS.STAY_EXTENDED,
      bookingId,
      details: {
        extensionId: extension.extensionId,
        previousEndDatetime: previousEnd,
        newEndDatetime: summary.extensionEnd,
        extraNights: summary.stay.extraNights,
        nightlyRate: summary.amounts.nightlyRate,
        extensionAmount: summary.amounts.extensionAmount,
        previousTotal: summary.amounts.previousTotal,
        totalAmount: summary.amounts.newTotal,
      },
      transaction,
    });

    return {
      booking: {
        bookingId: booking.bookingId,
        status: booking.status,
        startDatetime: booking.startDatetime,
        endDatetime: booking.endDatetime,
      },
      extension: {
        extensionId: extension.extensionId,
        status: extension.status,
        requestedEndDatetime: extension.requestedEndDatetime,
      },
      cabin: summary.cabin,
      guest: summary.guest,
      stay: summary.stay,
      amounts: summary.amounts,
    };
  });
}

// Una fila del listado, con lo justo que necesita la pantalla.
function toListItem(booking) {
  const checkInDate = toHotelDate(booking.startDatetime);
  const checkOutDate = toHotelDate(booking.endDatetime);
  return {
    bookingId: booking.bookingId,
    status: booking.status,
    isExtendable: EXTENDABLE_STATUSES.includes(booking.status),
    cabin: { resourceId: booking.resource.resourceId, name: booking.resource.name },
    guest: {
      customerId: booking.customer.customerId,
      fullName: booking.customer.fullName,
      identificationNumber: booking.customer.identificationNumber,
    },
    stay: { checkInDate, checkOutDate, nights: countNights(checkInDate, checkOutDate) },
    nightlyRate: Number(booking.resource.cabinDetail.pricePerNight),
  };
}

// GET /extendable — reservas de cabina entre las que el recepcionista
// elige cual extender. Incluye las Finalizadas a proposito: asi puede
// elegirlas y ver el mensaje de CA-4 en vez de que "desaparezcan".
// Primero van las extendibles (las que salen antes, arriba) y luego las
// finalizadas mas recientes. Dos consultas simples en vez de un ORDER BY
// con expresion para no depender de SQL especifico de MySQL.
async function listExtendableBookings({ search } = {}) {
  const term = (search || '').trim();
  const customerWhere = term
    ? {
      [Op.or]: [
        { fullName: { [Op.like]: `%${escapeLike(term)}%` } },
        { identificationNumber: { [Op.like]: `%${escapeLike(term)}%` } },
      ],
    }
    : undefined;

  const findByStatus = (statuses, direction) => Booking.findAll({
    where: { status: { [Op.in]: statuses } },
    include: [
      {
        model: Resource,
        as: 'resource',
        required: true,
        where: { resourceType: CABIN_RESOURCE_TYPE },
        include: [{ model: CabinDetail, as: 'cabinDetail', required: true }],
      },
      { model: Customer, as: 'customer', required: true, where: customerWhere },
    ],
    order: [['endDatetime', direction]],
    limit: LIST_LIMIT,
  });

  const extendable = await findByStatus(EXTENDABLE_STATUSES, 'ASC');
  const completed = await findByStatus(['completed'], 'DESC');
  return [...extendable, ...completed].map(toListItem);
}

module.exports = {
  EXTENDABLE_STATUSES,
  MAX_EXTENSION_NIGHTS,
  EXTENSION_NOT_AVAILABLE_CODE,
  BOOKING_COMPLETED_CODE,
  BOOKING_NOT_EXTENDABLE_CODE,
  INVALID_EXTENSION_DATE_CODE,
  BOOKING_CHANGED_CODE,
  listExtendableBookings,
  quoteCabinExtension,
  extendCabinStay,
};
