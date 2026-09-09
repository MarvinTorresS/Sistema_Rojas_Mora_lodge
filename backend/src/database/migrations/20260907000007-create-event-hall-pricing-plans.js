'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('event_hall_pricing_plans', {
      plan_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      resource_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'resources', key: 'resource_id' },
      },
      plan_name: { type: Sequelize.STRING(50), allowNull: false },
      hours: { type: Sequelize.INTEGER, allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('event_hall_pricing_plans');
  },
};
