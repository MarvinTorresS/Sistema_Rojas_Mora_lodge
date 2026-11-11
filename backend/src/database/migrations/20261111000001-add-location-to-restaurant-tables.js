'use strict';

// HU-102 (Marvin, Sprint 4) - Registrar una nueva mesa.
//
// La historia pide una "ubicacion" opcional para cada mesa (ej. "Terraza",
// "Salon principal"). La columna no existia: se agrega como VARCHAR(60)
// NULL, asi las mesas ya registradas quedan sin ubicacion (la pantalla
// muestra "—") y no hay que inventar un valor para ellas.
//
// Migracion NUEVA: no se editan las anteriores, porque las bases del equipo
// ya las ejecutaron.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('restaurant_tables', 'location', {
      type: Sequelize.STRING(60),
      allowNull: true,
      after: 'seat_count',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('restaurant_tables', 'location');
  },
};
