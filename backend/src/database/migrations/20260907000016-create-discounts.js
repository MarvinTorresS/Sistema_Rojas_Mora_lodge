'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('discounts', {
      discount_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      discount_type: {
        type: Sequelize.ENUM('percentage', 'fixed_amount'),
        allowNull: false,
      },
      value: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      applies_to: {
        type: Sequelize.ENUM('cabin', 'event_hall', 'field', 'restaurant', 'all'),
        allowNull: false,
      },
      valid_from: { type: Sequelize.DATEONLY, allowNull: false },
      valid_until: { type: Sequelize.DATEONLY, allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('discounts');
  },
};
