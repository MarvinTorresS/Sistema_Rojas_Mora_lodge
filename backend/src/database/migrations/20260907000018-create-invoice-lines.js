'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('invoice_lines', {
      line_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      invoice_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'invoices', key: 'invoice_id' },
      },
      source_type: {
        type: Sequelize.ENUM('cabin', 'event_hall', 'field', 'restaurant', 'discount'),
        allowNull: false,
      },
      // Sin FK formal a proposito: source_id apunta a una tabla distinta
      // segun source_type (linea polimorfica). La integridad la garantiza
      // la capa de servicio, no el motor de base de datos.
      source_id: { type: Sequelize.INTEGER },
      description: { type: Sequelize.STRING(200), allowNull: false },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('invoice_lines');
  },
};
