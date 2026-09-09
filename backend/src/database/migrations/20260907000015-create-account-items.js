'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('account_items', {
      item_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      account_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'restaurant_accounts', key: 'account_id' },
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'products', key: 'product_id' },
      },
      quantity: { type: Sequelize.INTEGER, allowNull: false },
      unit_price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      kitchen_status: {
        type: Sequelize.ENUM('pending', 'sent', 'preparing', 'served'),
        allowNull: false,
        defaultValue: 'pending',
      },
      sent_to_kitchen_at: { type: Sequelize.DATE },
      is_removed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      removed_reason: { type: Sequelize.STRING(200) },
      removed_at: { type: Sequelize.DATE },
      removed_by_user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'user_id' },
      },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('account_items', ['account_id', 'is_removed'], {
      name: 'idx_items_account_state',
    });
    await queryInterface.addIndex('account_items', ['kitchen_status', 'sent_to_kitchen_at'], {
      name: 'idx_items_kitchen',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('account_items');
  },
};
