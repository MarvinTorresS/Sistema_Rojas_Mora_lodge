'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('restaurant_accounts', {
      account_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      table_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'restaurant_tables', key: 'table_id' },
      },
      booking_id: {
        type: Sequelize.INTEGER,
        references: { model: 'bookings', key: 'booking_id' },
      },
      opened_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
      },
      customer_id: {
        type: Sequelize.INTEGER,
        references: { model: 'customers', key: 'customer_id' },
      },
      status: {
        type: Sequelize.ENUM('open', 'closed', 'cancelled'),
        allowNull: false,
        defaultValue: 'open',
      },
      voided_reason: { type: Sequelize.STRING(250) },
      opened_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      closed_at: { type: Sequelize.DATE },
      // Bloqueo optimista (HU-026 esc.2, HU-027 esc.3): se incrementa en
      // cada modificacion de la cuenta o de sus lineas.
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('restaurant_accounts');
  },
};
