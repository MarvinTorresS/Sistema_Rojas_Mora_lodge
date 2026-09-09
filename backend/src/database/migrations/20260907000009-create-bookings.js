'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bookings', {
      booking_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      resource_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'resources', key: 'resource_id' },
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'customer_id' },
      },
      created_by_user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'user_id' },
      },
      origin_channel: {
        type: Sequelize.ENUM('staff', 'web'),
        allowNull: false,
        defaultValue: 'staff',
      },
      access_token: { type: Sequelize.STRING(64), unique: true },
      start_datetime: { type: Sequelize.DATE, allowNull: false },
      end_datetime: { type: Sequelize.DATE, allowNull: false },
      party_size: { type: Sequelize.INTEGER },
      event_hall_plan_id: {
        type: Sequelize.INTEGER,
        references: { model: 'event_hall_pricing_plans', key: 'plan_id' },
      },
      status: {
        type: Sequelize.ENUM('pending', 'active', 'rejected', 'checked_in', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'active',
      },
      cancellation_reason: { type: Sequelize.STRING(250) },
      rejection_reason: { type: Sequelize.STRING(250) },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('bookings', ['resource_id', 'start_datetime', 'end_datetime'], {
      name: 'idx_bookings_resource_range',
    });
    await queryInterface.addIndex('bookings', ['customer_id', 'status'], {
      name: 'idx_bookings_customer',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('bookings');
  },
};
