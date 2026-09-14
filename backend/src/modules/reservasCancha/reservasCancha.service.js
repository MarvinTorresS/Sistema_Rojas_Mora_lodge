'use strict';

// Logica de negocio de HU-001 a HU-006 (modulo de reservas de cancha
// sintetica). Esta capa NO sabe nada de HTTP (nunca ve `req` ni `res`):
// recibe datos ya validados en su FORMA por el validator, y devuelve
// datos o lanza errores con un `statusCode` adjunto. Eso permite
// probarla con Jest llamando las funciones directo, sin levantar un
// servidor Express (ver tests/unit/).
const { Op } = require('sequelize');
const { Booking, Resource, ResourceBlock, Customer, AuditLog, sequelize } = require('../../models');

// CA-4 "Reserva con demasiada anticipacion": limite de dias hacia el
// futuro para poder registrar una reserva. Definido como constante (no
// un numero suelto en medio del codigo/"magic number") para que sea
// facil de encontrar y ajustar si el negocio cambia la politica.
const MAX_ADVANCE_BOOKING_DAYS = 30;

// CA-3 / CA-6 (HU-006): ventana minima de anticipacion para cancelar
// sin autorizacion especial. Configurable por el Administrador segun
// la historia de usuario; se deja como constante con el valor por
// defecto documentado (24 horas), misma convencion que
// MAX_ADVANCE_BOOKING_DAYS.
//
// IMPORTANTE: esta constante va ARRIBA del archivo a proposito. Una
// declaracion `const` no se "hoistea" con su valor como una funcion
// declarada con `function` (esas si quedan disponibles en todo el
// archivo sin importar el orden) -- si esta linea queda mas abajo,
// pero se usa antes (por ejemplo dentro de module.exports, que se
// ejecuta de arriba a abajo), Node explota con
// "ReferenceError: Cannot access ... before initialization" apenas
// arranca el servidor.
const MIN_CANCELLATION_NOTICE_HOURS = 24;

// Tipo de recurso que atiende este modulo. Resource es una tabla
// generica que tambien sirve para cabana/salon/mesa (ver
// resource.model.js); este modulo solo debe operar sobre canchas.
const FIELD_RESOURCE_TYPE = 'field';

// Estados de Booking que cuentan como "ocupando" el horario para efectos
// de deteccion de conflicto. Una reserva 'cancelled' o 'rejected' ya
// libero el horario y no debe bloquear una reserva nueva.
const ACTIVE_BOOKING_STATUSES = ['pending', 'active', 'checked_in'];

// Todos los estados que un Booking puede tener (mismos valores que el
// ENUM de booking.model.js). Se usa en HU-002 para validar el filtro
// opcional por estado: si llega un valor fuera de esta lista, es un
// error de forma del cliente, no una consulta vacia legitima.
const BOOKING_STATUSES = ['pending', 'active', 'rejected', 'checked_in', 'completed', 'cancelled'];

// HU-002 (paginacion): valores por defecto y tope del tamano de pagina.
// El tope evita que un cliente pida "traeme 100000 reservas" y tumbe la
// respuesta; es una constante (no un numero suelto) por la misma razon
// que MAX_ADVANCE_BOOKING_DAYS.
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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

// ---------------------------------------------------------------------
// HU-002 — Consultar el listado de reservas registradas de la cancha
// sintetica. (Wagner)
// ---------------------------------------------------------------------

// yyyy-mm-dd -> [inicio, dia siguiente) en HORA LOCAL. Se arma con
// componentes sueltos (new Date(y, m-1, d)) y no con new Date("yyyy-mm-dd"),
// porque este ultimo interpreta el string en UTC y, segun la zona
// horaria, "el dia 15" podria arrancar a las 6 p.m. del 14. El rango es
// semiabierto [inicio, fin) para que una reserva que arranca justo a
// medianoche del dia siguiente NO cuente como del dia consultado.
function localDayRange(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0),
    end: new Date(year, month - 1, day + 1, 0, 0, 0, 0),
  };
}

// Pura: arma el objeto `where` de Booking para el listado, a partir de
// los filtros opcionales ya validados EN SU FORMA por el validator
// (date con formato yyyy-mm-dd, status string). Aqui se valida el
// unico aspecto que el validator no puede: que `status`, si viene, sea
// realmente uno de los estados que el modelo admite. Se separa del
// acceso a BD para poder probarla con Jest sin levantar MySQL.
function buildListBookingsWhere({ date, status } = {}) {
  const where = {};

  if (status !== undefined && status !== null && status !== '') {
    if (!BOOKING_STATUSES.includes(status)) {
      throw new DomainError(`Estado de reserva no valido: ${status}.`, 422);
    }
    where.status = status;
  }

  if (date) {
    const { start, end } = localDayRange(date);
    where.startDatetime = { [Op.gte]: start, [Op.lt]: end };
  }

  return where;
}

// Pura: normaliza los parametros de paginacion que llegan como texto en
// el query string (?page=2&pageSize=5). Cualquier valor ausente,
// no numerico o fuera de rango cae a un valor seguro en vez de
// reventar: un listado nunca deberia fallar por un query string raro,
// como mucho ignora el parametro.
function normalizePagination({ page, pageSize } = {}) {
  const parsedPage = Number.parseInt(page, 10);
  const parsedSize = Number.parseInt(pageSize, 10);

  const safePage = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const safeSize = Number.isInteger(parsedSize) && parsedSize >= 1
    ? Math.min(parsedSize, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  return { page: safePage, pageSize: safeSize, limit: safeSize, offset: (safePage - 1) * safeSize };
}

// Aplana una fila de Booking (instancia Sequelize o ya objeto plano) a
// la forma minima que necesita el frontend: los datos de la reserva
// mas el nombre/telefono del cliente y el nombre de la cancha, sin
// exponer columnas internas ni el objeto Sequelize completo.
function mapBookingRow(booking) {
  const row = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
  return {
    bookingId: row.bookingId,
    status: row.status,
    originChannel: row.originChannel,
    startDatetime: row.startDatetime,
    endDatetime: row.endDatetime,
    resource: row.resource ? { resourceId: row.resource.resourceId, name: row.resource.name } : null,
    customer: row.customer
      ? { customerId: row.customer.customerId, fullName: row.customer.fullName, phone: row.customer.phone }
      : null,
  };
}

// HU-002 — CA-1 (visualizacion del listado) y CA-2 (sin reservas:
// items = [] y total = 0, no un error). CA-3 "Acceso sin permisos" NO
// se resuelve aqui: corresponde a un middleware de autenticacion/roles
// en la capa de routes, que todavia no existe (llega con el modulo de
// usuarios, Sprint 5). Ver el TODO en reservasCancha.routes.js.
async function listFieldBookings(query = {}) {
  const where = buildListBookingsWhere(query);
  const { page, pageSize, limit, offset } = normalizePagination(query);

  const { rows, count } = await Booking.findAndCountAll({
    where,
    include: [
      // required: true => INNER JOIN. Booking es una tabla generica
      // (sirve para cabana/salon/mesa tambien): sin este filtro el
      // modulo de cancha listaria reservas que no le corresponden.
      {
        model: Resource,
        as: 'resource',
        where: { resourceType: FIELD_RESOURCE_TYPE },
        required: true,
      },
      { model: Customer, as: 'customer', required: false },
    ],
    order: [['startDatetime', 'ASC']],
    limit,
    offset,
    // distinct: con include, sin esto el count contaria filas del JOIN
    // en vez de reservas.
    distinct: true,
  });

  return {
    items: rows.map(mapBookingRow),
    page,
    pageSize,
    total: count,
    totalPages: pageSize > 0 ? Math.ceil(count / pageSize) : 0,
  };
}

// HU-003: AND entre criterios; incluye historicos y todos los estados.
async function searchFieldBookings(query = {}) {
  const customerName = query.customerName?.trim();
  const phone = query.phone?.trim();
  const date = query.date?.trim();
  if (!customerName && !phone && !date) {
    throw new DomainError('Se requiere al menos un criterio de busqueda: cliente, telefono o fecha.', 422);
  }

  const customerWhere = {};
  if (customerName) {
    // Los comodines introducidos por el usuario se buscan literalmente.
    const escapedName = customerName.replace(/[\\%_]/g, '\\$&');
    customerWhere.fullName = { [Op.like]: `%${escapedName}%` };
  }
  if (phone) customerWhere.phone = phone;
  const { page, pageSize, limit, offset } = normalizePagination(query);
  const { rows, count } = await Booking.findAndCountAll({
    where: buildListBookingsWhere({ date }),
    include: [
      { model: Resource, as: 'resource', where: { resourceType: FIELD_RESOURCE_TYPE }, required: true },
      { model: Customer, as: 'customer', where: customerWhere, required: true },
    ],
    order: [['startDatetime', 'ASC'], ['bookingId', 'ASC']],
    limit,
    offset,
    distinct: true,
  });
  return { items: rows.map(mapBookingRow), page, pageSize, total: count, totalPages: Math.ceil(count / pageSize) };
}

module.exports = {
  DomainError,
  MAX_ADVANCE_BOOKING_DAYS,
  BOOKING_STATUSES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  rangesOverlap,
  createFieldBooking,

  // HU-002 (Wagner)
  buildListBookingsWhere,
  normalizePagination,
  mapBookingRow,
  listFieldBookings,

  searchFieldBookings,

  // HU-004 (Alison) — Filtrar las reservas de la cancha por estado, para
  // un dia especifico. CA-1 y CA-2 ya quedan cubiertos reutilizando
  // integramente listFieldBookings (HU-002, Wagner): status ya viaja
  // validado por el validator de este endpoint (aqui es obligatorio, a
  // diferencia de HU-002 donde es opcional), asi que no hace falta
  // duplicar la consulta a Sequelize.
  filterFieldBookingsByStatus,

  updateFieldBooking,

  // HU-006 (Alison) — Cancelar una reserva existente de cancha sintetica.
  MIN_CANCELLATION_NOTICE_HOURS,
  cancelFieldBooking,
};

// HU-004 (Alison) — ver comentario junto al export.
// HU-005: CA-4 no define una politica adicional para origen web.
// Se conservan origen y estado y se aplican las mismas validaciones generales.
async function updateFieldBooking(bookingId, changes = {}) {
  return sequelize.transaction(async (transaction) => {
    const booking = await Booking.findByPk(bookingId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!booking) throw new DomainError('La reserva indicada no existe.', 404);
    const resource = await Resource.findOne({
      where: { resourceId: booking.resourceId, resourceType: FIELD_RESOURCE_TYPE },
      transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!resource) throw new DomainError('La reserva no corresponde a una cancha.', 404);
    if (booking.status === 'cancelled') throw new DomainError('Una reserva cancelada no puede modificarse.', 409);
    if (resource.status !== 'available') throw new DomainError('La cancha no esta disponible.', 409);
    const start = new Date(changes.startDatetime ?? booking.startDatetime);
    const end = new Date(changes.endDatetime ?? booking.endDatetime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new DomainError('La hora de fin debe ser posterior a la hora de inicio.', 422);
    }
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + MAX_ADVANCE_BOOKING_DAYS);
    if (start < new Date() || start > maxDate) {
      throw new DomainError('El inicio debe ser futuro y estar dentro de los proximos 30 dias.', 422);
    }
    const overlap = {
      bookingId: { [Op.ne]: booking.bookingId },
      status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      startDatetime: { [Op.lt]: end }, endDatetime: { [Op.gt]: start },
    };
    if (await Booking.findOne({ where: { ...overlap, resourceId: booking.resourceId }, transaction })) {
      throw new DomainError('Ya existe una reserva en ese horario para esta cancha.', 409);
    }
    if (await ResourceBlock.findOne({ where: {
      resourceId: booking.resourceId, isActive: true,
      startDatetime: { [Op.lt]: end }, endDatetime: { [Op.gt]: start },
    }, transaction })) throw new DomainError('La cancha esta bloqueada en ese horario.', 409);
    if (await Booking.findOne({ where: { ...overlap, customerId: booking.customerId }, transaction })) {
      throw new DomainError('Este cliente ya tiene otra reserva que se cruza con ese horario.', 409);
    }
    booking.startDatetime = start;
    booking.endDatetime = end;
    await booking.save({ fields: ['startDatetime', 'endDatetime'], transaction });
    const customer = await Customer.findByPk(booking.customerId, { transaction });
    return mapBookingRow({ ...booking.get({ plain: true }), resource, customer });
  });
}

// HU-004: reutiliza el listado general.
async function filterFieldBookingsByStatus(query = {}) {
  return listFieldBookings(query);
}

// HU-006 (Alison) — Cancelar una reserva existente de cancha sintetica.
//
// `role` y `authorizedByUserId` llegan del body porque el modulo de
// usuarios/autenticacion (Sprint 5) todavia no existe: no hay un
// authMiddleware que popule req.user.role de forma confiable (mismo
// hueco que CA-3 de HU-002, ver TODO en reservasCancha.routes.js). Por
// ahora se CONFIA en lo que manda el cliente para CA-6; cuando exista
// el middleware de auth, ese valor deberia venir de req.user.role en
// vez del body, sin cambiar el resto de esta funcion.
async function cancelFieldBooking(bookingId, { reason, role, authorizedByUserId } = {}) {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) {
    throw new DomainError('La reserva indicada no existe.', 404);
  }

  // CA-4: Reserva ya cancelada previamente.
  if (booking.status === 'cancelled') {
    throw new DomainError('La reserva ya se encuentra cancelada.', 409);
  }

  // CA-5: Motivo obligatorio, no vacio, no solo espacios, max 250.
  const trimmedReason = (reason ?? '').trim();
  if (!trimmedReason) {
    throw new DomainError('El motivo de cancelación es obligatorio.', 422);
  }
  if (trimmedReason.length > 250) {
    throw new DomainError('El motivo de cancelación no puede superar los 250 caracteres.', 422);
  }

  // CA-3 / CA-6: ventana de anticipacion.
  const hoursUntilStart = (booking.startDatetime.getTime() - Date.now()) / (1000 * 60 * 60);
  const isLateCancellation = hoursUntilStart < MIN_CANCELLATION_NOTICE_HOURS;

  if (isLateCancellation && role !== 'Administrador') {
    // CA-3: fuera de politica, y no es una excepcion autorizada.
    throw new DomainError(
      `La cancelación ya no está permitida con menos de ${MIN_CANCELLATION_NOTICE_HOURS} horas de anticipación.`,
      409,
    );
  }

  booking.status = 'cancelled';
  booking.cancellationReason = trimmedReason;
  await booking.save();

  // CA-6: solo la EXCEPCION (cancelacion tardia autorizada) se audita
  // aqui; una cancelacion normal dentro de la ventana no genera este
  // registro.
  if (isLateCancellation) {
    await AuditLog.create({
      userId: authorizedByUserId ?? null,
      action: 'field_booking_cancelled_out_of_policy',
      entityType: 'booking',
      entityId: booking.bookingId,
      details: JSON.stringify({
        reason: trimmedReason,
        hoursBeforeStart: Number(hoursUntilStart.toFixed(2)),
      }),
    });
  }

  return booking;
}