'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customers', {
      customer_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      full_name: { type: Sequelize.STRING(150), allowNull: false },
      identification_number: { type: Sequelize.STRING(30), unique: true },
      phone: { type: Sequelize.STRING(20) },
      email: { type: Sequelize.STRING(150), unique: true },
      password_hash: { type: Sequelize.STRING(255) },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('customers');
  },
};
