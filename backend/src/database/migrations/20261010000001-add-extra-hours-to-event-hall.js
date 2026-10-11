'use strict';

// Horas extra del salon de eventos.
//
// Un plan cubre una cantidad fija de horas (ej. "Comun": 2 horas). Si el
// cliente quiere mas tiempo, las horas que se pasan del plan se cobran como
// "horas extra". Hacen falta dos datos:
//  - event_hall_pricing_plans.extra_hour_price: lo que cuesta CADA hora extra
//    de ese plan. NULL = el plan no admite horas extra (es el caso de todos
//    los planes que ya existen: una migracion no debe inventar un precio).
//  - bookings.extra_hours: cuantas horas extra se contrataron en la reserva.
//    Default 0, asi que las reservas existentes (y las de cancha y cabina,
//    que comparten la tabla) quedan igual.
//
// Migracion NUEVA y no editar las anteriores: las ya ejecutadas no se vuelven
// a correr, y editarlas dejaria las bases del equipo desincronizadas.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('event_hall_pricing_plans', 'extra_hour_price', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('bookings', 'extra_hours', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('bookings', 'extra_hours');
    await queryInterface.removeColumn('event_hall_pricing_plans', 'extra_hour_price');
  },
};
