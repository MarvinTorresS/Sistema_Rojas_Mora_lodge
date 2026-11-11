'use strict';

const pedido = require('./cuentaPedido.service');
const huesped = require('./consumoHuesped.service');
const apertura = require('./cuentaApertura.service');
const { actingUserId } = require('./catalogoMesas.controller');
const { MESSAGES } = require('./restaurante.util');

async function listOpenAccounts(req, res, next) {
  try {
    const data = await pedido.listOpenAccounts();
    return res.json({ data, meta: { total: data.length } });
  } catch (error) { return next(error); }
}

async function listMenu(req, res, next) {
  try {
    const { items, ...meta } = await pedido.listOrderMenu();
    return res.json({ data: items, meta });
  } catch (error) { return next(error); }
}

async function getAccount(req, res, next) {
  try { return res.json({ data: await pedido.getAccount(Number(req.params.accountId)) }); }
  catch (error) { return next(error); }
}

// HU-025
async function addItems(req, res, next) {
  try {
    const data = await pedido.addProductsToAccount(Number(req.params.accountId), {
      items: req.body.items, userId: actingUserId(req),
    });
    return res.status(201).json({ data });
  } catch (error) { return next(error); }
}

// HU-030
async function searchGuests(req, res, next) {
  try {
    const data = await huesped.searchGuests({ q: req.query.q });
    return res.json({ data, meta: { total: data.length } });
  } catch (error) { return next(error); }
}

async function updateItemQuantity(req, res, next) {
  try {
    const data = await pedido.updateItemQuantity(Number(req.params.accountId), Number(req.params.itemId), {
      quantity: req.body.quantity,
      expectedVersion: req.body.expectedVersion,
      userId: actingUserId(req),
    });
    return res.json({ data });
  } catch (error) { return next(error); }
}

async function closeAccount(req, res, next) {
  try {
    const data = await pedido.closeAccount(Number(req.params.accountId), {
      expectedVersion: req.body.expectedVersion, userId: actingUserId(req),
    });
    return res.json({ data });
  } catch (error) { return next(error); }
}

async function removeAccountItem(req, res, next) {
  try {
    const data = await pedido.removeAccountItem(Number(req.params.accountId), Number(req.params.itemId), {
      removedReason: req.body.removedReason,
      expectedVersion: req.body.expectedVersion,
      userId: actingUserId(req),
    });
    return res.json({ data });
  } catch (error) { return next(error); }
}

async function registerGuestConsumption(req, res, next) {
  try {
    const { bookingId, cabin, guestName, tableId, items } = req.body;
    const data = await huesped.registerGuestConsumption({
      bookingId: bookingId ? Number(bookingId) : undefined,
      cabin, guestName,
      tableId: tableId ? Number(tableId) : undefined,
      items,
      userId: actingUserId(req),
    });
    return res.status(201).json({ data });
  } catch (error) { return next(error); }
}

// HU-031
async function getGuestBalance(req, res, next) {
  try { return res.json({ data: await huesped.getGuestBalance(Number(req.query.bookingId)) }); }
  catch (error) { return next(error); }
}

// HU-024 (Marvin) - Abrir la cuenta de una mesa disponible.
async function openAccount(req, res, next) {
  try {
    const data = await apertura.openTableAccount({
      tableId: req.body.tableId,
      seenTableStatus: req.body.seenTableStatus ?? undefined,
      userId: actingUserId(req),
    });
    return res.status(201).json({ data, message: MESSAGES.ACCOUNT_OPENED });
  } catch (error) { return next(error); }
}

module.exports = {
  closeAccount,
  removeAccountItem,
  openAccount,
  updateItemQuantity,
  listOpenAccounts, listMenu, getAccount, addItems, searchGuests, registerGuestConsumption, getGuestBalance,
};
