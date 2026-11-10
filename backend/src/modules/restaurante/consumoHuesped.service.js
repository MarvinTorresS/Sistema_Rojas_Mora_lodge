'use strict';

// Consumos del restaurante a nombre de un huesped de cabina - Sprint 4
// (Alison):
//   HU-030  Registrar un consumo a nombre de un huesped de cabina.
//   HU-031  Consultar el saldo acumulado de consumos de un huesped.
//
// Idea: el consumo se vincula a la RESERVA de la cabina (restaurant_accounts
// .booking_id), no a una persona suelta. Asi el checkout de cabinas (HU-022)
// y la factura consolidada (HU-040) ya lo encuentran por la reserva.
const { Op } = require('sequelize');
const {
  Booking, Resource, Customer, RestaurantAccount, RestaurantTable, AccountItem, Product, User, sequelize,
} = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const {
  MESSAGES, CODES, sumItems, round2, escapeLike, cabinMatches, lineSubtotal,
} = require('./restaurante.util');
const {
  addItemsInTransaction, buildAccountDetail, normalizeRequestedItems,
} = require('./cuentaPedido.service');

const CABIN_RESOURCE_TYPE = 'cabin';
// Reserva "En curso" (HU-021): el huesped ya hizo check-in y no ha salido.
const IN_COURSE_STATUS = 'checked_in';
// Para buscar: reservas que tienen sentido mostrar (se descartan las
// canceladas, rechazadas y solicitudes pendientes de aprobar).
const SEARCHABLE_STATUSES = ['active', 'checked_in', 'completed'];
const MAX_SEARCH_RESULTS = 30;

const noActiveBooking = () => new DomainError(MESSAGES.GUEST_WITHOUT_ACTIVE_BOOKING, 409, {
  code: CODES.GUEST_WITHOUT_ACTIVE_BOOKING,
});

// Items vigentes (no retirados) de las cuentas NO anuladas de cada reserva.
async function loadConsumptions(bookingIds, { transaction } = {}) {
  if (bookingIds.length === 0) return [];
  const accounts = await RestaurantAccount.findAll({
    where: { bookingId: { [Op.in]: bookingIds }, status: { [Op.ne]: 'cancelled' } },
    include: [{ model: RestaurantTable, as: 'table' }],
    transaction,
  });
  if (accounts.length === 0) return [];
  const items = await AccountItem.findAll({
    where: { accountId: { [Op.in]: accounts.map((account) => account.accountId) }, isRemoved: false },
    include: [{ model: Product, as: 'product' }],
    order: [['createdAt', 'ASC'], ['itemId', 'ASC']],
    transaction,
  });
  const accountById = new Map(accounts.map((account) => [account.accountId, account]));
  return items.map((item) => {
    const account = accountById.get(item.accountId);
    return { item, account, bookingId: account.bookingId };
  });
}

function mapGuestBooking(booking, consumptions) {
  const row = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
  const own = consumptions.filter((entry) => entry.bookingId === row.bookingId).map((entry) => entry.item);
  return {
    bookingId: row.bookingId,
    guestName: row.customer?.fullName ?? 'Sin nombre',
    phone: row.customer?.phone ?? null,
    customerId: row.customerId ?? row.customer?.customerId ?? null,
    cabinName: row.resource?.name ?? null,
    startDatetime: row.startDatetime,
    endDatetime: row.endDatetime,
    status: row.status,
    inCourse: row.status === IN_COURSE_STATUS,
    accumulatedBalance: sumItems(own),
  };
}

// Reservas de cabina que coinciden con lo digitado: numero de cabina
// ("3", "Cabina 3") o nombre del huesped / de la reserva (parcial).
async function findCabinBookings(query, { statuses = SEARCHABLE_STATUSES } = {}) {
  const text = String(query ?? '').trim();
  if (!text) return [];

  const cabins = await Resource.findAll({ where: { resourceType: CABIN_RESOURCE_TYPE } });
  const cabinIds = cabins.map((cabin) => cabin.resourceId);
  if (cabinIds.length === 0) return [];
  const matchingCabinIds = cabins.filter((cabin) => cabinMatches(cabin.name, text)).map((cabin) => cabin.resourceId);

  const customers = await Customer.findAll({
    where: { fullName: { [Op.like]: `%${escapeLike(text)}%` } },
    limit: 100,
  });
  const customerIds = customers.map((customer) => customer.customerId);

  const matchers = [];
  if (matchingCabinIds.length) matchers.push({ resourceId: { [Op.in]: matchingCabinIds } });
  if (customerIds.length) matchers.push({ customerId: { [Op.in]: customerIds } });
  if (matchers.length === 0) return [];

  return Booking.findAll({
    where: { resourceId: { [Op.in]: cabinIds }, status: { [Op.in]: statuses }, [Op.or]: matchers },
    include: [
      { model: Resource, as: 'resource' },
      { model: Customer, as: 'customer' },
    ],
    order: [['startDatetime', 'DESC'], ['bookingId', 'DESC']],
    limit: MAX_SEARCH_RESULTS,
  });
}

// Busqueda para la pantalla: devuelve las reservas con su saldo y si estan
// "en curso" (las unicas a las que se puede cargar un consumo, CA-1/CA-2).
async function searchGuests({ q } = {}) {
  const bookings = await findCabinBookings(q);
  const consumptions = await loadConsumptions(bookings.map((booking) => booking.bookingId));
  return bookings.map((booking) => mapGuestBooking(booking, consumptions));
}

// Resuelve LA reserva en curso a la que se cargara el consumo. Acepta el id
// de una reserva (lo normal: el recepcionista la elige de la busqueda) o un
// dato suelto (numero de cabina / nombre de la reserva).
async function resolveBooking({ bookingId, cabin, guestName }, { transaction } = {}) {
  if (bookingId !== undefined && bookingId !== null && bookingId !== '') {
    const booking = await Booking.findByPk(Number(bookingId), {
      include: [{ model: Resource, as: 'resource' }, { model: Customer, as: 'customer' }],
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!booking || booking.resource?.resourceType !== CABIN_RESOURCE_TYPE) {
      throw new DomainError(MESSAGES.BOOKING_NOT_FOUND, 404);
    }
    // CA-2: sin check-in registrado (o ya con salida) no hay reserva activa.
    if (booking.status !== IN_COURSE_STATUS) throw noActiveBooking();
    return booking;
  }

  const text = String(cabin ?? guestName ?? '').trim();
  if (!text) {
    throw new DomainError('Indique el número de cabina o el nombre de la reserva del huésped.', 422, {
      details: [{ field: 'guest', message: 'Indique el número de cabina o el nombre de la reserva.' }],
    });
  }
  const found = await findCabinBookings(text, { statuses: [IN_COURSE_STATUS] });
  if (found.length === 0) throw noActiveBooking();
  if (found.length > 1) {
    const consumptions = await loadConsumptions(found.map((booking) => booking.bookingId));
    throw new DomainError(MESSAGES.GUEST_AMBIGUOUS, 409, {
      code: CODES.GUEST_AMBIGUOUS,
      details: { candidates: found.map((booking) => mapGuestBooking(booking, consumptions)) },
    });
  }
  return found[0];
}

async function assertActingUser(userId, transaction) {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new DomainError('No se pudo identificar al usuario que registra el consumo.', 422, {
      details: [{ field: 'userId', message: 'Falta el usuario que registra el consumo.' }],
    });
  }
  const user = await User.findByPk(userId, { transaction });
  if (!user || user.isActive === false) {
    throw new DomainError('El usuario que registra el consumo no existe o está inactivo.', 422);
  }
}

// ---------------------------------------------------------------------
// HU-030 - Registrar un consumo del restaurante a nombre de un huesped.
//   CA-1  Huesped con reserva en curso -> el consumo queda vinculado a su
//         reserva.
//   CA-2  Sin reserva en curso -> "El huesped no cuenta con una reserva
//         activa" y no se vincula nada (el consumo va como cuenta de mesa
//         normal, HU-024).
//   CA-3  Pedidos adicionales durante la estadia -> se agregan a la misma
//         cuenta y el saldo acumulado se actualiza.
// La cuenta necesita una mesa (restaurant_accounts.table_id es obligatorio):
// solo se pide cuando la reserva todavia no tiene una cuenta abierta.
// ---------------------------------------------------------------------
async function registerGuestConsumption({
  bookingId, cabin, guestName, tableId, items, userId,
} = {}) {
  // Forma del pedido y usuario ANTES de tocar la base (falla rapido).
  normalizeRequestedItems(items);

  return sequelize.transaction(async (transaction) => {
    await assertActingUser(userId, transaction);

    // CA-2 (la validacion se repite dentro de la transaccion con la reserva
    // bloqueada: un check-out simultaneo no deja pasar un consumo).
    const preliminary = bookingId ? null : await resolveBooking({ cabin, guestName }, { transaction });
    const booking = await resolveBooking({ bookingId: bookingId ?? preliminary.bookingId }, { transaction });

    // CA-3: si ya tiene una cuenta abierta se reutiliza.
    let account = await RestaurantAccount.findOne({
      where: { bookingId: booking.bookingId, status: 'open' },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    let createdAccount = false;

    if (!account) {
      if (tableId === undefined || tableId === null || tableId === '') {
        throw new DomainError('Seleccione la mesa donde se atiende al huésped.', 422, {
          code: CODES.TABLE_REQUIRED,
          details: [{ field: 'tableId', message: 'Seleccione la mesa donde se atiende al huésped.' }],
        });
      }
      const table = await RestaurantTable.findByPk(Number(tableId), { transaction, lock: transaction.LOCK.UPDATE });
      if (!table) throw new DomainError('La mesa indicada no existe.', 404);
      if (table.status === 'inactive') {
        throw new DomainError('La mesa seleccionada está inactiva.', 409, { code: CODES.TABLE_INACTIVE });
      }
      const tableBusy = table.status === 'occupied'
        || Boolean(await RestaurantAccount.findOne({ where: { tableId: table.tableId, status: 'open' }, transaction }));
      if (tableBusy) {
        throw new DomainError('La mesa ya se encuentra ocupada', 409, { code: CODES.TABLE_OCCUPIED });
      }
      account = await RestaurantAccount.create({
        tableId: table.tableId,
        bookingId: booking.bookingId,
        customerId: booking.customerId,
        openedByUserId: userId,
        status: 'open',
        openedAt: new Date(),
      }, { transaction });
      await table.update({ status: 'occupied' }, { transaction });
      createdAccount = true;
    }

    await addItemsInTransaction({ account, items, userId, transaction });

    const consumptions = await loadConsumptions([booking.bookingId], { transaction });
    return {
      createdAccount,
      guest: mapGuestBooking(booking, consumptions),
      account: await buildAccountDetail(account, { transaction }),
    };
  });
}

// ---------------------------------------------------------------------
// HU-031 - Consultar el saldo acumulado de consumos de un huesped.
//   CA-1  Con consumos -> detalle (fecha, producto y monto) y saldo total.
//   CA-2  Sin consumos -> "Este huesped no tiene consumos registrados en el
//         restaurante" (no es un error: 200 con hasConsumptions = false).
// Cuenta TODAS las cuentas no anuladas de la reserva (abiertas o cerradas)
// y deja fuera las lineas retiradas.
// ---------------------------------------------------------------------
async function getGuestBalance(bookingId) {
  const booking = await Booking.findByPk(Number(bookingId), {
    include: [{ model: Resource, as: 'resource' }, { model: Customer, as: 'customer' }],
  });
  if (!booking || booking.resource?.resourceType !== CABIN_RESOURCE_TYPE) {
    throw new DomainError(MESSAGES.BOOKING_NOT_FOUND, 404);
  }

  const entries = await loadConsumptions([booking.bookingId]);
  const consumptions = entries.map(({ item, account }) => ({
    itemId: item.itemId,
    date: item.createdAt ?? null,
    accountId: account.accountId,
    tableNumber: account.table?.tableNumber ?? null,
    productName: item.product?.name ?? 'Producto',
    quantity: Number(item.quantity),
    unitPrice: round2(item.unitPrice),
    amount: lineSubtotal(item),
  }));
  const guest = mapGuestBooking(booking, entries);
  const hasConsumptions = consumptions.length > 0;
  return {
    guest,
    hasConsumptions,
    message: hasConsumptions ? null : MESSAGES.GUEST_WITHOUT_CONSUMPTION,
    consumptions,
    total: guest.accumulatedBalance,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  IN_COURSE_STATUS,
  searchGuests,
  registerGuestConsumption,
  getGuestBalance,
  findCabinBookings,
  resolveBooking,
};
