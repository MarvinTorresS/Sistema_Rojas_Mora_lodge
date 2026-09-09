'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('resource_blocks', {
      block_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      resource_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'resources', key: 'resource_id' },
      },
      start_datetime: { type: Sequelize.DATE, allowNull: false },
      end_datetime: { type: Sequelize.DATE, allowNull: false },
      reason: { type: Sequelize.STRING(250), allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'user_id' },
      },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex(
      'resource_blocks',
      ['resource_id', 'start_datetime', 'end_datetime', 'is_active'],
      { name: 'idx_blocks_resource_range' }
    );
  },
  async down(queryInterface) {
    await queryInterface.dropTable('resource_blocks');
  },
};
