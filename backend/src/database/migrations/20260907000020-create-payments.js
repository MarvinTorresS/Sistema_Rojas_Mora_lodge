'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payments', {
      payment_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      invoice_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'invoices', key: 'invoice_id' },
      },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      payment_method: {
        type: Sequelize.ENUM('cash', 'card', 'transfer', 'sinpe_movil'),
        allowNull: false,
      },
      receipt_id: {
        type: Sequelize.INTEGER,
        references: { model: 'payment_receipts', key: 'receipt_id' },
      },
      received_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
      },
      paid_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('payments');
  },
};
