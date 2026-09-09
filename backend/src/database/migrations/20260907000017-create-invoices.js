'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('invoices', {
      invoice_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'customer_id' },
      },
      booking_id: {
        type: Sequelize.INTEGER,
        references: { model: 'bookings', key: 'booking_id' },
      },
      subtotal: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      discount_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      tax_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      total: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      status: {
        type: Sequelize.ENUM('pending', 'paid', 'voided'),
        allowNull: false,
        defaultValue: 'pending',
      },
      issued_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
      },
      issued_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      voided_reason: { type: Sequelize.STRING(250) },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('invoices');
  },
};
