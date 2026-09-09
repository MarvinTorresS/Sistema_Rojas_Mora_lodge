'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_receipts', {
      receipt_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      invoice_id: {
        type: Sequelize.INTEGER,
        references: { model: 'invoices', key: 'invoice_id' },
      },
      booking_id: {
        type: Sequelize.INTEGER,
        references: { model: 'bookings', key: 'booking_id' },
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'customer_id' },
      },
      declared_method: {
        type: Sequelize.ENUM('sinpe_movil', 'transfer'),
        allowNull: false,
      },
      reference_number: { type: Sequelize.STRING(80), allowNull: false },
      declared_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      receipt_file_path: { type: Sequelize.STRING(255) },
      status: {
        type: Sequelize.ENUM('pending_review', 'verified', 'rejected'),
        allowNull: false,
        defaultValue: 'pending_review',
      },
      rejection_reason: { type: Sequelize.STRING(250) },
      submitted_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      reviewed_by_user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'user_id' },
      },
      reviewed_at: { type: Sequelize.DATE },
    });
    await queryInterface.addIndex('payment_receipts', ['status', 'submitted_at'], {
      name: 'idx_receipts_status',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('payment_receipts');
  },
};
