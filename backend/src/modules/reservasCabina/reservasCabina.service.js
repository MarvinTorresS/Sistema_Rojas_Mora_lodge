'use strict';

// Logica de negocio de las reservas de cabinas (HU-016 -- Marvin,
// Sprint 3). Misma separacion de capas que cancha y salon: esta capa no
// sabe nada de HTTP; recibe datos ya validados en su FORMA y lanza
// DomainError (con statusCode) cuando una regla de NEGOCIO falla.
const { Op } = require('sequelize');
const {
  Booking, Resource, ResourceBlock, CabinDetail, Customer, sequelize,
} = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { buildBookingOverlapWhere, buildBlockOverlapWhere } = require('../../utils/bookingOverlap.util');
const {
  CHECK_IN_TIME, CHECK_OUT_TIME, toHotelDatetime, toHotelDate, todayInHotelTimeZone,
  countNights, addDays, nightRange, calculateStayCost,
} = require('./cabinStay.util');
const { CABIN_AUDIT_ACTIONS, recordCabinAudit } = require('./cabinBilling.service');

// Tipo de recurso que atiende este modulo (ver resource.model.js).
const CABIN_RESOURCE_TYPE = 'cabin';

// Codigos estables para el frontend: decide con el codigo, nunca leyendo
// el texto del mensaje (que es para humanos y puede cambiar).
const GUEST_ALREADY_EXISTS_CODE = 'GUEST_ALREADY_EXISTS';
const CABIN_NOT_AVAILABLE_CODE = 'CABIN_NOT_AVAILABLE';

// Tope de la "agenda" (tira de noches) que se puede pedir de una vez.
// Evita que alguien pida un rango de anos y obligue al servidor a armar
// miles de noches por cabina.
const MAX_AGENDA_NIGHTS = 31;

// Estado de cada cabina para unas fechas y un grupo dados. El frontend
// pinta cada tarjeta segun este valor.
const CABIN_AVAILABILITY = {
  AVAILABLE: 'available', // libre y le cabe el grupo
  OCCUPIED: 'occupied', // reservada o bloqueada en esas fechas
  TOO_SMALL: 'too_small', // libre, pero no le cabe el grupo
  OUT_OF_SERVICE: 'out_of_service', // recurso en mantenimiento o inactivo
};

// Cabinas libres en [start, end) donde cabe el grupo, para sugerirlas
// cuando la solicitada esta ocupada (CA-2). Hace DOS consultas de
// ocupacion para todas las candidatas a la vez, en vez de una por
// cabina (evita el problema N+1).
async function findAlternativeCabins({
  excludeResourceId, start, end, partySize, transaction,
}) {
  const candidates = await Resource.findAll({
    where: {
      resourceType: CABIN_RESOURCE_TYPE,
      status: 'available',
      resourceId: { [Op.ne]: excludeResourceId },
    },
    include: [{
      model: CabinDetail,
      as: 'cabinDetail',
      required: true,
      where: { capacity: { [Op.gte]: partySize } },
    }],
    order: [['resourceId', 'ASC']],
    transaction,
  });
  if (candidates.length === 0) return [];

  const candidateIds = candidates.map((c) => c.resourceId);
  const busyBookings = await Booking.findAll({
    attributes: ['resourceId'],
    where: { resourceId: { [Op.in]: candidateIds }, ...buildBookingOverlapWhere({ start, end }) },
    transaction,
  });
  const busyBlocks = await ResourceBlock.findAll({
    attributes: ['resourceId'],
    where: { resourceId: { [Op.in]: candidateIds }, ...buildBlockOverlapWhere({ start, end }) },
    transaction,
  });
  const busyIds = new Set([...busyBookings, ...busyBlocks].map((row) => row.resourceId));

  return candidates
    .filter((c) => !busyIds.has(c.resourceId))
    .map((c) => ({
      resourceId: c.resourceId,
      name: c.name,
      capacity: c.cabinDetail.capacity,
      pricePerNight: Number(c.cabinDetail.pricePerNight),
    }));
}

// Disponibilidad de TODAS las cabinas para una estadia y un grupo, mas
// una "agenda" (tira de noches) por cabina. Alimenta la pantalla de
// registro (HU-016) y la sugerencia de alternativas (CA-2).
//
// ESCALABILIDAD: hace siempre 3 consultas (cabinas, reservas, bloqueos),
// sin importar si hay 4 o 40 cabinas, y cruza los datos en memoria.
// La alternativa ingenua -- preguntar a la base cabina por cabina y noche
// por noche -- creceria como cabinas x noches consultas.
async function getCabinAvailability({
  checkInDate, checkOutDate, partySize, agendaFrom, agendaTo,
}) {
  const nights = countNights(checkInDate, checkOutDate);
  if (nights < 1) {
    throw new DomainError('La fecha de salida debe ser posterior a la fecha de entrada.', 422);
  }
  // Si no se pide agenda, se usa la misma estadia.
  const agendaStartDate = agendaFrom || checkInDate;
  const agendaEndDate = agendaTo || checkOutDate;
  const agendaNights = countNights(agendaStartDate, agendaEndDate);
  if (agendaNights < 1 || agendaNights > MAX_AGENDA_NIGHTS) {
    throw new DomainError(`La agenda debe cubrir entre 1 y ${MAX_AGENDA_NIGHTS} noches.`, 422);
  }
  const groupSize = Number(partySize);

  const stayStart = toHotelDatetime(checkInDate, CHECK_IN_TIME);
  const stayEnd = toHotelDatetime(checkOutDate, CHECK_OUT_TIME);
  const agendaStart = toHotelDatetime(agendaStartDate, CHECK_IN_TIME);
  const agendaEnd = toHotelDatetime(agendaEndDate, CHECK_OUT_TIME);
  // Una sola ventana que cubre la estadia Y la agenda: con ella basta UNA
  // consulta de reservas y UNA de bloqueos para todo lo que hay que pintar.
  const windowStart = new Date(Math.min(stayStart, agendaStart));
  const windowEnd = new Date(Math.max(stayEnd, agendaEnd));

  // Consulta 1: el catalogo de cabinas (con su detalle de capacidad/precio).
  const cabins = await Resource.findAll({
    where: { resourceType: CABIN_RESOURCE_TYPE },
    include: [{ model: CabinDetail, as: 'cabinDetail', required: true }],
    order: [['resourceId', 'ASC']],
  });
  const cabinIds = cabins.map((c) => c.resourceId);

  // Consultas 2 y 3: todo lo que ocupa alguna cabina dentro de la ventana.
  const [bookings, blocks] = cabinIds.length === 0 ? [[], []] : await Promise.all([
    Booking.findAll({
      attributes: ['resourceId', 'startDatetime', 'endDatetime'],
      where: { resourceId: { [Op.in]: cabinIds }, ...buildBookingOverlapWhere({ start: windowStart, end: windowEnd }) },
    }),
    ResourceBlock.findAll({
      attributes: ['resourceId', 'startDatetime', 'endDatetime'],
      where: { resourceId: { [Op.in]: cabinIds }, ...buildBlockOverlapWhere({ start: windowStart, end: windowEnd }) },
    }),
  ]);

  // Agrupa los intervalos ocupados por cabina: Map<resourceId, [{start, end}]>.
  const busyByCabin = new Map();
  for (const row of [...bookings, ...blocks]) {
    const list = busyByCabin.get(row.resourceId) || [];
    list.push({ start: new Date(row.startDatetime), end: new Date(row.endDatetime) });
    busyByCabin.set(row.resourceId, list);
  }
  const overlapping = (intervals, start, end) => intervals.filter((iv) => iv.start < end && iv.end > start);

  const agendaDates = Array.from({ length: agendaNights }, (_, i) => addDays(agendaStartDate, i));

  const result = cabins.map((cabin) => {
    const intervals = busyByCabin.get(cabin.resourceId) || [];
    const conflicts = overlapping(intervals, stayStart, stayEnd);
    const capacity = cabin.cabinDetail.capacity;
    const pricePerNight = Number(cabin.cabinDetail.pricePerNight);

    // Prioridad: fuera de servicio > no cabe > ocupada > libre. "No cabe"
    // va antes que "ocupada" porque para ESTE grupo es definitivo; no
    // tiene sentido decirle al recepcionista cuando se libera.
    let availability = CABIN_AVAILABILITY.AVAILABLE;
    if (cabin.status !== 'available') availability = CABIN_AVAILABILITY.OUT_OF_SERVICE;
    else if (capacity < groupSize) availability = CABIN_AVAILABILITY.TOO_SMALL;
    else if (conflicts.length > 0) availability = CABIN_AVAILABILITY.OCCUPIED;

    // Fecha en que se libera: la salida mas tardia de lo que choca.
    const freesOn = conflicts.length > 0
      ? toHotelDate(new Date(Math.max(...conflicts.map((iv) => iv.end))))
      : null;

    return {
      resourceId: cabin.resourceId,
      name: cabin.name,
      description: cabin.description,
      capacity,
      pricePerNight,
      availability,
      fitsGroup: capacity >= groupSize,
      freesOn,
      stayTotal: calculateStayCost({ nights, pricePerNight }),
      nights: agendaDates.map((date) => {
        const { start, end } = nightRange(date);
        return { date, occupied: overlapping(intervals, start, end).length > 0 };
      }),
    };
  });

  return {
    stay: { checkInDate, checkOutDate, nights },
    partySize: groupSize,
    // Las horas viajan al frontend para que NO tenga su propia copia de
    // la politica (una sola fuente de verdad: cabinStay.util.js).
    stayPolicy: { checkInTime: CHECK_IN_TIME.slice(0, 5), checkOutTime: CHECK_OUT_TIME.slice(0, 5) },
    agenda: { from: agendaStartDate, to: agendaEndDate },
    availableCount: result.filter((c) => c.availability === CABIN_AVAILABILITY.AVAILABLE).length,
    cabins: result,
  };
}

// CA-3: busca al huesped por numero de IDENTIFICACION (a diferencia de
// cancha y salon, que buscan por telefono). Reglas:
//   - Si ya existe y el recepcionista NO ha confirmado vincularlo ->
//     409 con el huesped existente, para que el frontend le pregunte.
//   - Si ya existe y SI confirmo -> se reutiliza ese huesped.
//   - Si no existe -> se crea, salvo que el correo ya sea de otra
//     persona (customers.email es UNIQUE: sin esta revision la base
//     lanzaria un error 500 en vez de un 409 entendible).
async function resolveGuest({
  guestName, guestIdentification, guestPhone, guestEmail, linkExistingGuest, transaction,
}) {
  const existing = await Customer.findOne({
    where: { identificationNumber: guestIdentification },
    transaction,
  });

  if (existing) {
    if (!linkExistingGuest) {
      throw new DomainError('El huésped ya se encuentra registrado', 409, {
        code: GUEST_ALREADY_EXISTS_CODE,
        details: {
          existingGuest: {
            customerId: existing.customerId,
            fullName: existing.fullName,
            phone: existing.phone,
            email: existing.email,
          },
        },
      });
    }
    return existing;
  }

  const emailOwner = await Customer.findOne({ where: { email: guestEmail }, transaction });
  if (emailOwner) {
    throw new DomainError('El correo indicado ya esta asociado a otro huesped.', 409);
  }

  return Customer.create({
    fullName: guestName,
    identificationNumber: guestIdentification,
    phone: guestPhone,
    email: guestEmail,
  }, { transaction });
}

// HU-016 — Registrar una reserva de cabina con los datos del huesped.
async function createCabinBooking(payload) {
  const {
    resourceId, guestName, guestIdentification, guestPhone, guestEmail,
    checkInDate, checkOutDate, companions, linkExistingGuest,
  } = payload;

  // El titular tambien ocupa lugar: 2 acompanantes = 3 personas.
  const partySize = Number(companions) + 1;
  const nights = countNights(checkInDate, checkOutDate);

  // --- Reglas que NO necesitan la base de datos: se revisan antes de
  // abrir una transaccion (falla rapido y barato). ---
  if (nights < 1) {
    throw new DomainError('La fecha de salida debe ser posterior a la fecha de entrada.', 422);
  }
  // Se compara por FECHA y no por hora a proposito: un huesped que llega
  // hoy a las 20:00 se registra hoy, aunque el check-in "oficial" de las
  // 15:00 ya haya pasado.
  if (checkInDate < todayInHotelTimeZone()) {
    throw new DomainError('No se pueden registrar reservas con fecha de entrada anterior a hoy.', 422);
  }

  const start = toHotelDatetime(checkInDate, CHECK_IN_TIME);
  const end = toHotelDatetime(checkOutDate, CHECK_OUT_TIME);

  // Todo lo que sigue va en UNA transaccion por dos razones:
  //  1) Atomicidad: si crear el huesped funciona pero crear la reserva
  //     falla, el huesped se deshace (rollback) en vez de quedar suelto.
  //  2) Concurrencia: dos recepcionistas pueden reservar la MISMA cabina
  //     a la vez; ambos veran "libre" y ambos insertarian. El bloqueo de
  //     fila (FOR UPDATE) sobre el recurso hace que el segundo espere a
  //     que el primero termine y entonces SI vea la reserva nueva.
  return sequelize.transaction(async (transaction) => {
    const resource = await Resource.findOne({
      where: { resourceId, resourceType: CABIN_RESOURCE_TYPE },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!resource) {
      throw new DomainError('La cabina indicada no existe.', 404);
    }
    const cabinDetail = await CabinDetail.findByPk(resourceId, { transaction });
    if (!cabinDetail) {
      throw new DomainError('La cabina indicada no tiene datos de hospedaje configurados.', 404);
    }

    // Regla implicita (no esta en los CA de la HU, pendiente de
    // formalizar como CA nuevo, igual que se hizo con HU-007): el grupo
    // no puede superar la capacidad de la cabina.
    if (partySize > cabinDetail.capacity) {
      throw new DomainError(
        `La cabina ${resource.name} tiene capacidad para ${cabinDetail.capacity} personas y el grupo es de ${partySize}.`,
        422,
      );
    }

    // CA-2: la cabina esta fuera de servicio, bloqueada u ocupada en
    // las fechas. Las tres causas se tratan igual para el huesped: "no
    // esta disponible", y se sugieren alternativas.
    const overlappingBooking = await Booking.findOne({
      where: { resourceId, ...buildBookingOverlapWhere({ start, end }) },
      transaction,
    });
    const overlappingBlock = await ResourceBlock.findOne({
      where: { resourceId, ...buildBlockOverlapWhere({ start, end }) },
      transaction,
    });
    if (resource.status !== 'available' || overlappingBooking || overlappingBlock) {
      const alternatives = await findAlternativeCabins({
        excludeResourceId: resourceId, start, end, partySize, transaction,
      });
      throw new DomainError('La cabina no se encuentra disponible en las fechas seleccionadas', 409, {
        code: CABIN_NOT_AVAILABLE_CODE,
        details: { alternatives },
      });
    }

    // CA-3 y creacion del huesped (si hace falta).
    const guest = await resolveGuest({
      guestName, guestIdentification, guestPhone, guestEmail, linkExistingGuest, transaction,
    });

    // CA-1: registro exitoso. originChannel = 'staff' y status = 'active'
    // porque la HU la ejecuta un Administrador o Recepcionista (igual
    // que HU-001 y HU-013). created_by_user_id queda nulo hasta que
    // exista autenticacion (Sprint 5).
    const booking = await Booking.create({
      resourceId,
      customerId: guest.customerId,
      originChannel: 'staff',
      startDatetime: start,
      endDatetime: end,
      partySize,
      status: 'active',
    }, { transaction });

    // Se guarda la "foto" del monto (tarifa y total de HOY) para que un
    // cambio de tarifa posterior (HU-128) no altere lo ya registrado, y
    // para que HU-127 sepa cual es el total vigente al extender. Va en la
    // misma transaccion: si falla, la reserva tampoco se crea.
    const totalAmount = calculateStayCost({ nights, pricePerNight: cabinDetail.pricePerNight });
    await recordCabinAudit({
      action: CABIN_AUDIT_ACTIONS.BOOKING_CREATED,
      bookingId: booking.bookingId,
      details: {
        nights,
        nightlyRate: Number(cabinDetail.pricePerNight),
        totalAmount,
      },
      transaction,
    });

    return {
      booking,
      cabin: {
        resourceId: resource.resourceId,
        name: resource.name,
        capacity: cabinDetail.capacity,
        pricePerNight: Number(cabinDetail.pricePerNight),
      },
      guest: {
        customerId: guest.customerId,
        fullName: guest.fullName,
        identificationNumber: guest.identificationNumber,
        phone: guest.phone,
        email: guest.email,
      },
      stay: { checkInDate, checkOutDate, nights },
      totalAmount,
    };
  });
}

module.exports = {
  CABIN_RESOURCE_TYPE,
  CABIN_AVAILABILITY,
  MAX_AGENDA_NIGHTS,
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  GUEST_ALREADY_EXISTS_CODE,
  CABIN_NOT_AVAILABLE_CODE,
  calculateStayCost,
  countNights,
  getCabinAvailability,
  createCabinBooking,
};
