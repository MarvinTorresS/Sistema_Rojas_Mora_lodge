'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('password_reset_tokens', {
      token_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'customer_id' },
      },
      token_hash: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('password_reset_tokens', ['customer_id', 'expires_at'], {
      name: 'idx_reset_customer',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('password_reset_tokens');
  },
};
