'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('bookings', 'hall_plan_snapshot', {
      type: Sequelize.TEXT, allowNull: true,
    });
    // Las reservas antiguas solo pueden conservar las condiciones actuales.
    await queryInterface.sequelize.query(`
      UPDATE bookings b JOIN event_hall_pricing_plans p
        ON b.event_hall_plan_id = p.plan_id
      SET b.hall_plan_snapshot = JSON_OBJECT(
        'planId', p.plan_id, 'planName', p.plan_name, 'hours', p.hours,
        'price', CAST(p.price AS DECIMAL(10,2)),
        'extraHourPrice', p.extra_hour_price)
      WHERE b.hall_plan_snapshot IS NULL
    `);
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('bookings', 'hall_plan_snapshot');
  },
};
