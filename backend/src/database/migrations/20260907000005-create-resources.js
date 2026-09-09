'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('resources', {
      resource_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      resource_type: {
        type: Sequelize.ENUM('cabin', 'event_hall', 'field', 'restaurant_table'),
        allowNull: false,
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT },
      status: {
        type: Sequelize.ENUM('available', 'maintenance', 'inactive'),
        allowNull: false,
        defaultValue: 'available',
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('resources');
  },
};
