'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('restaurant_tables', {
      table_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      resource_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'resources', key: 'resource_id' },
      },
      table_number: { type: Sequelize.STRING(10), allowNull: false, unique: true },
      seat_count: { type: Sequelize.INTEGER, allowNull: false },
      status: {
        type: Sequelize.ENUM('available', 'occupied', 'inactive'),
        allowNull: false,
        defaultValue: 'available',
      },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('restaurant_tables');
  },
};
