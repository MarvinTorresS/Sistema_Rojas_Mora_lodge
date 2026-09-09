'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('products', {
      product_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      category: { type: Sequelize.STRING(60) },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      stock_quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_available: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('products', ['name', 'category'], {
      name: 'uq_product_name_category',
      unique: true,
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('products');
  },
};
