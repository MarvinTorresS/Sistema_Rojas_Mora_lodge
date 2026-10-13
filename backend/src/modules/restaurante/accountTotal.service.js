'use strict';
const { RestaurantAccount, RestaurantTable, AccountItem, Product, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { calculateAccountTotal } = require('./accountTotal.util');

async function getAccountTotal(accountId) {
  return sequelize.transaction(async (transaction) => {
    const account = await RestaurantAccount.findByPk(accountId, {
      include: [{ model: RestaurantTable, as: 'table', attributes: ['tableNumber'], required: false }], transaction,
    });
    if (!account) throw new DomainError('La cuenta indicada no existe.', 404);
    const items = await AccountItem.findAll({
      where: { accountId: account.accountId, isRemoved: false },
      include: [{ model: Product, as: 'product', attributes: ['name'], required: false }],
      order: [['itemId', 'ASC']], transaction,
    });
    return { account: { accountId: account.accountId, tableNumber: account.table?.tableNumber ?? null, status: account.status },
      ...calculateAccountTotal(items), checkedAt: new Date().toISOString() };
  });
}
module.exports = { getAccountTotal };
