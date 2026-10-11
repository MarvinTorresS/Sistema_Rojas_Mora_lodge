'use strict';

// Logica de negocio de la MODIFICACION de una reserva de cabina (HU-019 --
// Sprint 3). Un recepcionista cambia fechas, cabina o datos del
// huesped; el sistema valida la nueva disponibilidad y actualiza la reserva.
//
// Como las demas capas de servicio: no sabe nada de HTTP, recibe datos ya
// validados en su FORMA y lanza DomainError cuando una regla de NEGOCIO
// falla.
const { Op } = require('sequelize');
const {
  Booking, Resource, ResourceBlock, CabinDetail, Customer, sequelize,
} = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { GUEST_MESSAGES } = require('../../utils/guestData.util');
const { buildBookingOverlapWhere, buildBlockOverlapWhere } = require('../../utils/bookingOverlap.util');
const {
  CHECK_IN_TIME, CHECK_OUT_TIME, toHotelDatetime, toHotelDate, todayInHotelTimeZone,
  countNights, addDays, calculateStayCost,
} = require('./cabinStay.util');
const { CABIN_AUDIT_ACTIONS, recordCabinAudit, getRecordedStayTotal } = require('./cabinBilling.service');
const { findAlternativeCabins, CABIN_NOT_AVAILABLE_CODE } = require('./reservasCabina.service');
const {
  MODIFIABLE_STATUSES,
  SCHEDULE_FIELDS,
  GUEST_FIELDS,
  UPDATE_ERROR_CODES,
  diffBookingChanges,
  touches,
  getCheckedInViolation,
} = require('./cabinBookingUpdate.util');

const CABIN_RESOURCE_TYPE = 'cabin';

// Cuantas fechas alternativas se sugieren y cuanto se busca alrededor de
// las pedidas (CA-2: "sugerir cabinas o fechas alternativas").
const MAX_DATE_SUGGESTIONS = 3;
const DATE_SUGGESTION_DAYS_BEFORE = 7;
const DATE_SUGGESTION_DAYS_AFTER = 30;

// Estado ACTUAL de la reserva con los mismos nombres que usan los campos
// editables, para compararlo contra lo que llega.
function toCurrentView({ booking, guest }) {
  return {
    resourceId: booking.resourceId,
    checkInDate: toHotelDate(booking.startDatetime),
    checkOutDate: toHotelDate(booking.endDatetime),
    companions: Math.max((booking.partySize || 1) - 1, 0),
    guestName: guest.fullName,
    guestPhone: guest.phone,
    guestEmail: guest.email,
  };
}

// Respuesta publica: un solo lugar decide que campos salen.
function toResult({
  booking, resource, cabinDetail, guest, changes, amounts, changed,
}) {
  const checkInDate = toHotelDate(booking.startDatetime);
  const checkOutDate = toHotelDate(booking.endDatetime);
  return {
    changed,
    changes,
    booking: {
      bookingId: booking.bookingId,
      status: booking.status,
      startDatetime: booking.startDatetime,
      endDatetime: booking.endDatetime,
      partySize: booking.partySize,
    },
    cabin: {
      resourceId: resource.resourceId,
      name: resource.name,
      capacity: cabinDetail ? cabinDetail.capacity : null,
    },
    guest: {
      customerId: guest.customerId,
      fullName: guest.fullName,
      identificationNumber: guest.identificationNumber,
      phone: guest.phone,
      email: guest.email,
    },
    stay: { checkInDate, checkOutDate, nights: countNights(checkInDate, checkOutDate) },
    amounts,
  };
}

// Fechas de entrada alternativas, con la MISMA cantidad de noches, en las
// que la cabina esta libre. Dos consultas (reservas y bloqueos) para toda
// la ventana y el cruce se hace en memoria, en vez de una consulta por
// fecha candidata. Las mas cercanas a la pedida van primero.
async function findAlternativeDates({
  resourceId, checkInDate, nights, excludeBookingId, transaction,
}) {
  const today = todayInHotelTimeZone();
  const offsets = [];
  for (let d = 1; d <= DATE_SUGGESTION_DAYS_AFTER; d += 1) {
    offsets.push(d);
    if (d <= DATE_SUGGESTION_DAYS_BEFORE) offsets.push(-d);
  }
  const candidates = offsets
    .map((offset) => addDays(checkInDate, offset))
    .filter((date) => date >= today);
  if (candidates.length === 0) return [];

  const sorted = [...candidates].sort();
  const windowStart = toHotelDatetime(sorted[0], CHECK_IN_TIME);
  const windowEnd = toHotelDatetime(addDays(sorted[sorted.length - 1], nights), CHECK_OUT_TIME);

  const bookings = await Booking.findAll({
    attributes: ['startDatetime', 'endDatetime'],
    where: { resourceId, ...buildBookingOverlapWhere({ start: windowStart, end: windowEnd, excludeBookingId }) },
    transaction,
  });
  const blocks = await ResourceBlock.findAll({
    attributes: ['startDatetime', 'endDatetime'],
    where: { resourceId, ...buildBlockOverlapWhere({ start: windowStart, end: windowEnd }) },
    transaction,
  });
  const busy = [...bookings, ...blocks].map((row) => ({
    start: new Date(row.startDatetime), end: new Date(row.endDatetime),
  }));

  const suggestions = [];
  for (const date of candidates) {
    const start = toHotelDatetime(date, CHECK_IN_TIME);
    const end = toHotelDatetime(addDays(date, nights), CHECK_OUT_TIME);
    if (!busy.some((iv) => iv.start < end && iv.end > start)) {
      suggestions.push({ checkInDate: date, checkOutDate: addDays(date, nights), nights });
      if (suggestions.length === MAX_DATE_SUGGESTIONS) break;
    }
  }
  return suggestions;
}

// Carga una cabina (con bloqueo de fila) o lanza 404.
async function lockCabin({ resourceId, transaction, notFoundMessage }) {
  const resource = await Resource.findOne({
    where: { resourceId, resourceType: CABIN_RESOURCE_TYPE },
    lock: transaction.LOCK.UPDATE,
    transaction,
  });
  if (!resource) throw new DomainError(notFoundMessage, 404);
  return resource;
}

// PATCH /api/cabin-bookings/:bookingId
//
// CA-1: reserva activa + cambios confirmados -> se valida la nueva
//       disponibilidad, se actualiza y se registra la modificacion.
// CA-2: la cabina o las fechas nuevas estan ocupadas -> 409 con cabinas y
//       fechas alternativas; la reserva no cambia.
// CA-3: con ingreso ya registrado no se reasigna la cabina (422 con el
//       mensaje del criterio); fecha de salida y datos del huesped si.
async function updateCabinBooking({ bookingId, changes: payload, userId = null }) {
  // Se necesita la cabina ACTUAL antes de abrir la transaccion para poder
  // bloquear las cabinas implicadas (ver abajo).
  const initial = await Booking.findByPk(bookingId, { attributes: ['bookingId', 'resourceId'] });
  if (!initial) throw new DomainError('La reserva indicada no existe.', 404);

  const targetResourceId = payload.resourceId !== undefined
    ? Number(payload.resourceId)
    : initial.resourceId;

  return sequelize.transaction(async (transaction) => {
    // Se bloquean las filas de las CABINAS implicadas (la actual y la
    // nueva) en orden ascendente de id: es el mismo bloqueo que usan
    // registrar (HU-016) y extender (HU-127), asi que si otra persona
    // reserva o extiende en el mismo instante, una espera a la otra y la
    // segunda ve el cambio de la primera. El orden fijo evita que dos
    // modificaciones cruzadas (A->B y B->A) se bloqueen mutuamente.
    const lockedIds = [...new Set([initial.resourceId, targetResourceId])].sort((a, b) => a - b);
    const cabins = new Map();
    for (const id of lockedIds) {
      const isTarget = id === targetResourceId && id !== initial.resourceId;
      // eslint-disable-next-line no-await-in-loop
      cabins.set(id, await lockCabin({
        resourceId: id,
        transaction,
        notFoundMessage: isTarget
          ? 'La cabina indicada no existe.'
          : 'La reserva indicada no corresponde a una cabina.',
      }));
    }

    // Se relee la reserva YA con las cabinas bloqueadas (y con su propio
    // bloqueo) para decidir con su estado mas reciente.
    const booking = await Booking.findByPk(bookingId, { lock: transaction.LOCK.UPDATE, transaction });
    if (!booking) throw new DomainError('La reserva indicada no existe.', 404);
    if (booking.resourceId !== initial.resourceId) {
      throw new DomainError('La reserva cambió de cabina mientras se procesaba. Intente de nuevo.', 409, {
        code: UPDATE_ERROR_CODES.BOOKING_CHANGED,
      });
    }

    // CA-1: solo reservas activas (o con ingreso, ver MODIFIABLE_STATUSES).
    if (!MODIFIABLE_STATUSES.includes(booking.status)) {
      throw new DomainError('Solo se pueden modificar reservas activas o con ingreso registrado.', 422, {
        code: UPDATE_ERROR_CODES.BOOKING_NOT_MODIFIABLE,
      });
    }

    const guest = await Customer.findByPk(booking.customerId, { transaction });
    if (!guest) throw new DomainError('La reserva no tiene un huésped asociado.', 422);

    const currentResource = cabins.get(booking.resourceId);
    const currentDetail = await CabinDetail.findByPk(booking.resourceId, { transaction });

    // --- Que cambia de verdad -----------------------------------------
    const { changes, next } = diffBookingChanges(toCurrentView({ booking, guest }), payload);

    // Nada que cambiar: se responde con exito sin escribir ni auditar, para
    // que repetir la peticion (doble clic, reintento) sea inofensivo.
    if (Object.keys(changes).length === 0) {
      const { totalAmount } = await getRecordedStayTotal({
        bookingId,
        fallbackTotal: calculateStayCost({
          nights: countNights(toHotelDate(booking.startDatetime), toHotelDate(booking.endDatetime)),
          pricePerNight: currentDetail ? currentDetail.pricePerNight : 0,
        }),
        transaction,
      });
      return toResult({
        booking, resource: currentResource, cabinDetail: currentDetail, guest, changes: {}, changed: false,
        amounts: { previousTotal: totalAmount, totalAmount, repriced: false, nightlyRate: null },
      });
    }

    // CA-3: ingreso ya registrado.
    const violation = getCheckedInViolation(booking.status, changes);
    if (violation) {
      throw new DomainError(violation.message, 422, { code: violation.code });
    }

    const scheduleChanged = touches(changes, SCHEDULE_FIELDS);
    const guestChanged = touches(changes, GUEST_FIELDS);
    const cabinChanged = changes.resourceId !== undefined;
    const partyChanged = changes.companions !== undefined;

    const targetResource = cabins.get(next.resourceId);
    const targetDetail = cabinChanged
      ? await CabinDetail.findByPk(next.resourceId, { transaction })
      : currentDetail;
    if (!targetDetail) {
      throw new DomainError('La cabina indicada no tiene datos de hospedaje configurados.', 404);
    }

    // --- Reglas de fechas (solo si se tocaron, para no objetar una
    // reserva cuya entrada ya paso y que solo cambia un telefono) ---------
    const nights = countNights(next.checkInDate, next.checkOutDate);
    if (changes.checkInDate !== undefined || changes.checkOutDate !== undefined) {
      if (nights < 1) {
        throw new DomainError('La fecha de salida debe ser posterior a la fecha de entrada.', 422, {
          code: UPDATE_ERROR_CODES.INVALID_DATES,
        });
      }
      const today = todayInHotelTimeZone();
      if (changes.checkInDate !== undefined && next.checkInDate < today) {
        throw new DomainError('No se puede mover la fecha de entrada a un día anterior a hoy.', 422, {
          code: UPDATE_ERROR_CODES.INVALID_DATES,
        });
      }
      if (changes.checkOutDate !== undefined && next.checkOutDate < today) {
        throw new DomainError('No se puede mover la fecha de salida a un día anterior a hoy.', 422, {
          code: UPDATE_ERROR_CODES.INVALID_DATES,
        });
      }
    }

    // --- Capacidad (mismo criterio que HU-016) ------------------------
    const partySize = next.companions + 1;
    if ((cabinChanged || partyChanged) && partySize > targetDetail.capacity) {
      throw new DomainError(
        `La cabina ${targetResource.name} tiene capacidad para ${targetDetail.capacity} personas y el grupo es de ${partySize}.`,
        422,
        { code: UPDATE_ERROR_CODES.CAPACITY_EXCEEDED },
      );
    }

    // --- CA-1/CA-2: nueva disponibilidad ------------------------------
    // Solo cuando cambia la agenda: corregir un telefono no debe fallar
    // porque la cabina este en mantenimiento.
    const start = toHotelDatetime(next.checkInDate, CHECK_IN_TIME);
    const end = toHotelDatetime(next.checkOutDate, CHECK_OUT_TIME);
    if (scheduleChanged) {
      // La propia reserva se excluye: no puede chocar consigo misma.
      const overlappingBooking = await Booking.findOne({
        where: {
          resourceId: next.resourceId,
          ...buildBookingOverlapWhere({ start, end, excludeBookingId: bookingId }),
        },
        transaction,
      });
      const overlappingBlock = await ResourceBlock.findOne({
        where: { resourceId: next.resourceId, ...buildBlockOverlapWhere({ start, end }) },
        transaction,
      });
      if (targetResource.status !== 'available' || overlappingBooking || overlappingBlock) {
        // Con huesped hospedado no hay "otra cabina" posible (CA-3), asi que
        // solo se sugieren fechas.
        const canSuggestCabins = booking.status !== 'checked_in';
        const alternatives = canSuggestCabins
          ? await findAlternativeCabins({
            excludeResourceId: next.resourceId, start, end, partySize, transaction,
          })
          : [];
        // Mover solo la salida de la misma cabina no tiene "otra fecha de
        // entrada" que sugerir; en los demas casos si.
        const movedStart = changes.checkInDate !== undefined || cabinChanged;
        const alternativeDates = targetResource.status === 'available' && movedStart
          ? await findAlternativeDates({
            resourceId: next.resourceId,
            checkInDate: next.checkInDate,
            nights,
            excludeBookingId: bookingId,
            transaction,
          })
          : [];
        throw new DomainError(
          'La cabina no se encuentra disponible en las fechas seleccionadas',
          409,
          { code: CABIN_NOT_AVAILABLE_CODE, details: { alternatives, alternativeDates } },
        );
      }
    }

    // --- Datos del huesped --------------------------------------------
    if (changes.guestEmail !== undefined) {
      const emailOwner = await Customer.findOne({
        where: { email: next.guestEmail, customerId: { [Op.ne]: guest.customerId } },
        transaction,
      });
      if (emailOwner) {
        throw new DomainError(GUEST_MESSAGES.EMAIL_OF_OTHER_ID, 409, {
          code: UPDATE_ERROR_CODES.EMAIL_IN_USE,
        });
      }
    }

    // --- Monto --------------------------------------------------------
    // Si cambian las noches o la cabina, la estadia se vuelve a valorar con
    // la tarifa VIGENTE de la cabina elegida; si no, el total registrado se
    // conserva tal cual (HU-127/128: un cambio de tarifa no altera lo ya
    // registrado). Se informa `repriced` para que quien llama lo muestre.
    const previousNights = countNights(
      toHotelDate(booking.startDatetime),
      toHotelDate(booking.endDatetime),
    );
    const { totalAmount: previousTotal } = await getRecordedStayTotal({
      bookingId,
      fallbackTotal: calculateStayCost({
        nights: previousNights,
        pricePerNight: currentDetail ? currentDetail.pricePerNight : 0,
      }),
      transaction,
    });
    const repriced = cabinChanged || nights !== previousNights;
    const nightlyRate = repriced ? Number(targetDetail.pricePerNight) : null;
    const totalAmount = repriced
      ? calculateStayCost({ nights, pricePerNight: targetDetail.pricePerNight })
      : previousTotal;

    // --- A partir de aqui todo se escribe; si algo falla, rollback de
    // todo junto (la reserva no queda a medias ni con el huesped cambiado
    // sin su registro). ---------------------------------------------------
    if (guestChanged) {
      await guest.update({
        ...(changes.guestName !== undefined && { fullName: next.guestName }),
        ...(changes.guestPhone !== undefined && { phone: next.guestPhone }),
        ...(changes.guestEmail !== undefined && { email: next.guestEmail }),
      }, { transaction });
    }
    if (scheduleChanged || partyChanged) {
      await booking.update({
        resourceId: next.resourceId,
        startDatetime: start,
        endDatetime: end,
        partySize,
      }, { transaction });
    }

    // "Registrar usuario y fecha de la modificacion" (CA-1): la fecha y hora
    // las pone la tabla (created_at); el usuario queda nulo hasta que exista
    // autenticacion (HU-048, Sprint 5). La entrada lleva `totalAmount`, asi
    // el total vigente de la reserva sigue siendo el de su ultimo registro.
    await recordCabinAudit({
      action: CABIN_AUDIT_ACTIONS.BOOKING_UPDATED,
      bookingId,
      userId,
      details: {
        changes,
        nights,
        nightlyRate,
        repriced,
        previousTotal,
        totalAmount,
      },
      transaction,
    });

    return toResult({
      booking,
      resource: targetResource,
      cabinDetail: targetDetail,
      guest,
      changes,
      changed: true,
      amounts: {
        nightlyRate, previousTotal, totalAmount, repriced,
      },
    });
  });
}

module.exports = {
  MAX_DATE_SUGGESTIONS,
  updateCabinBooking,
};
