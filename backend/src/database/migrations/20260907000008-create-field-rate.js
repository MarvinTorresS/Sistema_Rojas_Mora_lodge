'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('field_rate', {
      rate_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      resource_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'resources', key: 'resource_id' },
      },
      price_per_hour: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      effective_from: { type: Sequelize.DATEONLY, allowNull: false },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('field_rate');
  },
};
