'use strict';

// Pedido de una cuenta de mesa - Sprint 4 (Alison):
//   HU-025  Agregar productos al pedido de una cuenta de mesa activa.
// Tambien expone las lecturas que la pantalla necesita para poder tomar un
// pedido (cuentas abiertas, detalle de una cuenta y catalogo de pedido).
//
// Reglas de la HU-025:
//   CA-1  Registro exitoso: el consumo acumulado se actualiza al instante y
//         cada linea trae nombre, cantidad, precio unitario y subtotal.
//   CA-2  Precio vigente: la linea nueva usa el precio del producto AL
//         MOMENTO de agregarla; las lineas anteriores conservan el suyo.
//   CA-3  Producto sin existencias: "Producto sin existencias disponibles",
//         no se agrega, y el producto queda marcado "Agotado".
const { Op } = require('sequelize');
const {
  RestaurantAccount, AccountItem, Product, RestaurantTable, Customer, AuditLog, sequelize,
} = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const {
  MESSAGES, CODES, MAX_QUANTITY_PER_LINE, MAX_ITEMS_PER_REQUEST,
  mapAccountItem, mapMenuProduct, sumItems,
} = require('./restaurante.util');

// Normaliza los productos pedidos: lista no vacia, ids y cantidades enteras
// positivas, y un mismo producto repetido se suma en una sola entrada (asi
// las existencias se validan con la cantidad TOTAL pedida, no por separado).
function normalizeRequestedItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new DomainError('Agregue al menos un producto al pedido.', 422, {
      details: [{ field: 'items', message: 'Agregue al menos un producto al pedido.' }],
    });
  }
  if (items.length > MAX_ITEMS_PER_REQUEST) {
    throw new DomainError(`Un pedido admite como máximo ${MAX_ITEMS_PER_REQUEST} productos por envío.`, 422);
  }
  const merged = new Map();
  items.forEach((item, index) => {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || productId < 1) {
      throw new DomainError('Cada producto debe tener un identificador válido.', 422, {
        details: [{ field: `items[${index}].productId`, message: 'Producto inválido.' }],
      });
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
      throw new DomainError(`La cantidad debe ser un entero entre 1 y ${MAX_QUANTITY_PER_LINE}.`, 422, {
        details: [{ field: `items[${index}].quantity`, message: `La cantidad debe estar entre 1 y ${MAX_QUANTITY_PER_LINE}.` }],
      });
    }
    merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  });
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function assertAccountOpen(account) {
  if (account.status === 'cancelled') {
    throw new DomainError(MESSAGES.ACCOUNT_CANCELLED, 409, { code: CODES.ACCOUNT_CLOSED });
  }
  if (account.status !== 'open') {
    throw new DomainError(MESSAGES.ACCOUNT_CLOSED, 409, { code: CODES.ACCOUNT_CLOSED });
  }
}

// Agrega los productos a una cuenta YA bloqueada y verificada, dentro de la
// transaccion recibida. Es el nucleo compartido por HU-025 (cuenta de mesa)
// y HU-030 (consumo a nombre de un huesped): las dos aplican exactamente el
// mismo precio vigente, las mismas existencias y el mismo control de version.
async function addItemsInTransaction({ account, items, userId = null, transaction }) {
  assertAccountOpen(account);
  const requested = normalizeRequestedItems(items);

  // Productos bloqueados: dos meseros pidiendo la ultima unidad al mismo
  // tiempo no pueden vender mas de lo que hay.
  const products = await Product.findAll({
    where: { productId: { [Op.in]: requested.map((item) => item.productId) } },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const byId = new Map(products.map((product) => [product.productId, product]));

  // 1) Se valida TODO antes de escribir nada: si un producto falla, no se
  //    agrega ninguno (el pedido no queda a medias).
  requested.forEach(({ productId, quantity }) => {
    const product = byId.get(productId);
    if (!product) throw new DomainError(MESSAGES.PRODUCT_NOT_FOUND, 404, { details: { productId } });
    const stock = Number(product.stockQuantity) || 0;
    const details = { productId, productName: product.name, available: Math.max(stock, 0) };
    // CA-3
    if (stock <= 0) {
      throw new DomainError(MESSAGES.PRODUCT_OUT_OF_STOCK, 409, { code: CODES.PRODUCT_OUT_OF_STOCK, details });
    }
    if (product.isAvailable === false) {
      throw new DomainError(MESSAGES.PRODUCT_UNAVAILABLE, 409, { code: CODES.PRODUCT_UNAVAILABLE, details });
    }
    if (quantity > stock) {
      throw new DomainError(
        `Solo quedan ${stock} unidades de "${product.name}". Reduzca la cantidad solicitada.`,
        409,
        { code: CODES.INSUFFICIENT_STOCK, details },
      );
    }
  });

  // 2) Escritura. CA-2: unitPrice = precio del producto AHORA.
  for (const { productId, quantity } of requested) {
    const product = byId.get(productId);
    await AccountItem.create({
      accountId: account.accountId,
      productId,
      quantity,
      unitPrice: product.price,
      kitchenStatus: 'pending',
    }, { transaction });

    const remaining = (Number(product.stockQuantity) || 0) - quantity;
    // CA-3 (convencion): sin existencias el producto queda "Agotado".
    await product.update({ stockQuantity: remaining, ...(remaining <= 0 ? { isAvailable: false } : {}) }, { transaction });
  }

  // Control de concurrencia (HU-026/HU-027 comparan esta version): cualquier
  // cambio en las lineas de la cuenta la incrementa.
  await RestaurantAccount.increment('version', { by: 1, where: { accountId: account.accountId }, transaction });

  await AuditLog.create({
    userId,
    action: 'restaurant_items_added',
    entityType: 'restaurant_account',
    entityId: account.accountId,
    details: JSON.stringify({ items: requested }),
  }, { transaction });

  return requested;
}

// Detalle de la cuenta tal como lo muestra la pantalla: lineas vigentes con
// subtotal y el consumo acumulado (sin impuestos: el calculo del total con
// IVA es HU-029).
async function buildAccountDetail(account, { transaction } = {}) {
  // Una lectura pública también debe conservar el bloqueo de la cuenta
  // mientras consulta sus líneas y versión, igual que las escrituras.
  if (!transaction) return getAccount(account.accountId);
  const [table, lines] = await Promise.all([
    RestaurantTable.findByPk(account.tableId, { transaction }),
    AccountItem.findAll({
      where: { accountId: account.accountId, isRemoved: false },
      include: [{ model: Product, as: 'product' }],
      order: [['itemId', 'ASC']],
      transaction,
    }),
  ]);
  // La version puede haber cambiado dentro de la transaccion (increment).
  const fresh = await RestaurantAccount.findByPk(account.accountId, { transaction });
  const items = lines.map(mapAccountItem);
  return {
    accountId: account.accountId,
    status: account.status,
    version: Number((fresh ?? account).version),
    openedAt: account.openedAt ?? null,
    bookingId: account.bookingId ?? null,
    customerId: account.customerId ?? null,
    table: table ? { tableId: table.tableId, tableNumber: table.tableNumber, seatCount: table.seatCount } : null,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    accumulatedTotal: sumItems(items),
  };
}

// HU-025 - Agregar productos al pedido de una cuenta de mesa activa.
async function addProductsToAccount(accountId, { items, userId = null } = {}) {
  // Forma del pedido antes de abrir la transaccion (falla rapido).
  normalizeRequestedItems(items);
  return sequelize.transaction(async (transaction) => {
    const account = await RestaurantAccount.findByPk(accountId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!account) throw new DomainError(MESSAGES.ACCOUNT_NOT_FOUND, 404);
    await addItemsInTransaction({ account, items, userId, transaction });
    return buildAccountDetail(account, { transaction });
  });
}

async function getAccount(accountId) {
  return sequelize.transaction(async (transaction) => {
    const account = await RestaurantAccount.findByPk(accountId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!account) throw new DomainError(MESSAGES.ACCOUNT_NOT_FOUND, 404);
    return buildAccountDetail(account, { transaction });
  });
}

// HU-026: el bloqueo serializa las escrituras; la versión detecta una
// edición basada en un detalle anterior. No se reintenta con otra versión.
async function updateItemQuantity(accountId, itemId, { quantity, expectedVersion, userId = null } = {}) {
  if (![accountId, itemId, expectedVersion].every((value) => Number.isSafeInteger(value) && value > 0)
    || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
    throw new DomainError('Identificadores, cantidad o versión inválidos.', 422);
  }
  return sequelize.transaction(async (transaction) => {
    const account = await RestaurantAccount.findByPk(accountId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!account) throw new DomainError(MESSAGES.ACCOUNT_NOT_FOUND, 404);
    assertAccountOpen(account);
    if (Number(account.version) !== expectedVersion) {
      throw new DomainError(MESSAGES.ACCOUNT_VERSION_CONFLICT, 409, {
        code: CODES.ACCOUNT_VERSION_CONFLICT,
        details: { expectedVersion, currentVersion: Number(account.version) },
      });
    }
    const item = await AccountItem.findOne({
      where: { itemId, accountId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!item || item.accountId !== accountId) throw new DomainError(MESSAGES.ITEM_NOT_FOUND, 404);
    if (item.isRemoved) throw new DomainError(MESSAGES.ITEM_REMOVED, 409, { code: CODES.ITEM_REMOVED });
    if (item.kitchenStatus !== 'pending') {
      throw new DomainError(MESSAGES.ITEM_ALREADY_SENT, 409, { code: CODES.ITEM_ALREADY_SENT });
    }
    const product = await Product.findByPk(item.productId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product) throw new DomainError(MESSAGES.PRODUCT_NOT_FOUND, 404);
    const previousQuantity = Number(item.quantity);
    const difference = quantity - previousQuantity;
    if (difference === 0) return buildAccountDetail(account, { transaction });
    const stock = Number(product.stockQuantity) || 0;
    const details = { productId: product.productId, productName: product.name, available: Math.max(stock, 0) };
    if (difference > 0) {
      if (stock <= 0) throw new DomainError(MESSAGES.PRODUCT_OUT_OF_STOCK, 409, { code: CODES.PRODUCT_OUT_OF_STOCK, details });
      if (product.isAvailable === false) throw new DomainError(MESSAGES.PRODUCT_UNAVAILABLE, 409, { code: CODES.PRODUCT_UNAVAILABLE, details });
      if (difference > stock) {
        throw new DomainError(`Solo quedan ${stock} unidades de "${product.name}". Reduzca la cantidad solicitada.`, 409, {
          code: CODES.INSUFFICIENT_STOCK, details,
        });
      }
    }
    await item.update({ quantity }, { transaction });
    const remaining = stock - difference;
    await product.update({ stockQuantity: remaining, ...(remaining <= 0 ? { isAvailable: false } : {}) }, { transaction });
    await RestaurantAccount.increment('version', { by: 1, where: { accountId }, transaction });
    await AuditLog.create({
      userId, action: 'restaurant_item_quantity_updated', entityType: 'restaurant_account', entityId: accountId,
      details: JSON.stringify({ accountId, itemId, productId: item.productId, previousQuantity, quantity, difference }),
    }, { transaction });
    return buildAccountDetail(account, { transaction });
  });
}

// HU-027: retiro lógico y devolución única dentro de la misma transacción.
async function removeAccountItem(accountId, itemId, { expectedVersion, removedReason = null, userId = null } = {}) {
  if (![accountId, itemId, expectedVersion].every((value) => Number.isSafeInteger(value) && value > 0)
    || (removedReason !== null && (typeof removedReason !== 'string' || removedReason.length > 200))
    || (userId !== null && (!Number.isSafeInteger(userId) || userId < 1))) {
    throw new DomainError('Identificadores, motivo o versión inválidos.', 422);
  }
  return sequelize.transaction(async (transaction) => {
    const account = await RestaurantAccount.findByPk(accountId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!account) throw new DomainError(MESSAGES.ACCOUNT_NOT_FOUND, 404);
    assertAccountOpen(account);
    if (Number(account.version) !== expectedVersion) {
      throw new DomainError(MESSAGES.ACCOUNT_VERSION_CONFLICT, 409, {
        code: CODES.ACCOUNT_VERSION_CONFLICT,
        details: { expectedVersion, currentVersion: Number(account.version) },
      });
    }
    const item = await AccountItem.findOne({
      where: { itemId, accountId }, transaction, lock: transaction.LOCK.UPDATE,
    });
    if (!item || item.accountId !== accountId) throw new DomainError(MESSAGES.ITEM_NOT_FOUND, 404);
    if (item.isRemoved) throw new DomainError(MESSAGES.ITEM_REMOVED, 409, { code: CODES.ITEM_REMOVED });
    if (item.kitchenStatus !== 'pending') {
      throw new DomainError('El producto ya fue enviado a cocina y no se puede retirar.', 409, { code: CODES.ITEM_ALREADY_SENT });
    }
    const product = await Product.findByPk(item.productId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product) throw new DomainError(MESSAGES.PRODUCT_NOT_FOUND, 404);
    await item.update({
      isRemoved: true, removedAt: new Date(), removedByUserId: userId,
      removedReason: removedReason?.trim() || null,
    }, { transaction });
    await product.update({ stockQuantity: Number(product.stockQuantity) + Number(item.quantity) }, { transaction });
    await RestaurantAccount.increment('version', { by: 1, where: { accountId }, transaction });
    await AuditLog.create({
      userId, action: 'restaurant_item_removed', entityType: 'restaurant_account', entityId: accountId,
      details: JSON.stringify({ accountId, itemId, productId: item.productId,
        quantity: item.quantity, unitPrice: item.unitPrice, removedReason: removedReason?.trim() || null }),
    }, { transaction });
    return buildAccountDetail(account, { transaction });
  });
}

// Cuentas abiertas (las que aceptan consumos), con su consumo acumulado.
async function listOpenAccounts() {
  const accounts = await RestaurantAccount.findAll({
    where: { status: 'open' },
    include: [
      { model: RestaurantTable, as: 'table' },
      { model: Customer, as: 'customer' },
    ],
    order: [['openedAt', 'ASC'], ['accountId', 'ASC']],
  });
  const lines = accounts.length
    ? await AccountItem.findAll({
      where: { accountId: { [Op.in]: accounts.map((account) => account.accountId) }, isRemoved: false },
    })
    : [];
  return accounts.map((account) => {
    const own = lines.filter((line) => line.accountId === account.accountId);
    return {
      accountId: account.accountId,
      bookingId: account.bookingId ?? null,
      openedAt: account.openedAt ?? null,
      table: account.table
        ? { tableId: account.table.tableId, tableNumber: account.table.tableNumber, seatCount: account.table.seatCount }
        : null,
      customerName: account.customer?.fullName ?? null,
      itemCount: own.reduce((sum, line) => sum + Number(line.quantity), 0),
      accumulatedTotal: sumItems(own),
    };
  }).sort((a, b) => String(a.table?.tableNumber ?? '').localeCompare(String(b.table?.tableNumber ?? ''), 'es', { numeric: true }));
}

// Catalogo para tomar pedidos: productos con su estado Disponible/Agotado.
// Los productos desactivados a mano (sin ser por existencias) no se ofrecen.
async function listOrderMenu() {
  const products = await Product.findAll({ order: [['category', 'ASC'], ['name', 'ASC']] });
  const items = products
    .map(mapMenuProduct)
    .filter((product) => product.soldOut || products.find((p) => p.productId === product.productId).isAvailable !== false);
  return { items, total: items.length };
}

module.exports = {
  removeAccountItem,
  updateItemQuantity,
  normalizeRequestedItems,
  addItemsInTransaction,
  buildAccountDetail,
  addProductsToAccount,
  getAccount,
  listOpenAccounts,
  listOrderMenu,
};
