'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('booking_extension_requests', {
      extension_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      booking_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'bookings', key: 'booking_id' },
      },
      requested_end_datetime: { type: Sequelize.DATE, allowNull: false },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      request_notes: { type: Sequelize.STRING(250) },
      rejection_reason: { type: Sequelize.STRING(250) },
      requested_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      resolved_by_user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'user_id' },
      },
      resolved_at: { type: Sequelize.DATE },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('booking_extension_requests');
  },
};
