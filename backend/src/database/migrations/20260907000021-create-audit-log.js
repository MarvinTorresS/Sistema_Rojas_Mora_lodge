'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_log', {
      audit_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'user_id' },
      },
      customer_id: {
        type: Sequelize.INTEGER,
        references: { model: 'customers', key: 'customer_id' },
      },
      action: { type: Sequelize.STRING(100), allowNull: false },
      entity_type: { type: Sequelize.STRING(50), allowNull: false },
      entity_id: { type: Sequelize.INTEGER, allowNull: false },
      details: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('audit_log', ['entity_type', 'entity_id'], {
      name: 'idx_audit_entity',
    });
    await queryInterface.addIndex('audit_log', ['created_at'], {
      name: 'idx_audit_created',
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('audit_log');
  },
};
