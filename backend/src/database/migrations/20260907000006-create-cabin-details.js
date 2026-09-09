'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cabin_details', {
      resource_id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        references: { model: 'resources', key: 'resource_id' },
      },
      capacity: { type: Sequelize.INTEGER, allowNull: false },
      price_per_night: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('cabin_details');
  },
};
