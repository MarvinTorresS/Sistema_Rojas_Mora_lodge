'use strict';

// HU-008 (Sprint 2) -- Registrar un nuevo plan de precios del
// salon. La historia pide guardar, ademas de nombre, duracion y precio,
// los "servicios incluidos (mobiliario, sonido, etc.)" y el "porcentaje de
// anticipo si aplica". HU-009 tambien necesita los servicios para mostrar
// cada plan. La tabla original (20260907000007) solo tenia plan_name,
// hours y price, asi que se agregan dos columnas.
//
// Por que una migracion NUEVA y no editar la original: la original ya fue
// ejecutada en la base de todo el equipo; una migracion que ya corrio no
// se vuelve a ejecutar, asi que editarla no cambiaria nada en las bases
// existentes y las dejaria desincronizadas (justo lo que el README dice que
// las migraciones versionadas evitan).
//
// Ambas columnas aceptan NULL a proposito:
//  - Los planes que ya existen (sembrados por 20260916000001) no tienen
//    servicios ni porcentaje, y una migracion no debe inventarlos.
//  - included_services guarda un arreglo JSON en texto (ej.
//    '["Mobiliario","Sonido"]'); NULL significa "sin servicios registrados".
//  - deposit_percentage es el porcentaje de anticipo PROPIO del plan
//    (0 a 100). NULL significa "el plan no define uno propio".
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('event_hall_pricing_plans', 'included_services', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('event_hall_pricing_plans', 'deposit_percentage', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('event_hall_pricing_plans', 'deposit_percentage');
    await queryInterface.removeColumn('event_hall_pricing_plans', 'included_services');
  },
};
