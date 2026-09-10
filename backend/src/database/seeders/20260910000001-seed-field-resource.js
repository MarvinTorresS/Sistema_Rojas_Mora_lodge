'use strict';

// Siembra el recurso base "cancha sintetica" que necesita el modulo de
// reservas de cancha (HU-001 a HU-006) para poder funcionar.
//
// Causa raiz del error "La cancha indicada no existe" (404): las
// migraciones SOLO crean las tablas vacias, nunca insertan filas. La
// carpeta seeders/ no tenia ningun archivo todavia, asi que en
// cualquier base de datos nueva (o recien migrada) la tabla `resources`
// esta vacia y no hay ningun `resource_id = 1` para que
// reservasCancha.service.js encuentre.
//
// resource_id se fuerza a 1 explicitamente porque el frontend
// (frontend/src/pages/ReservasCancha.jsx, constante CANCHA_RESOURCE_ID)
// todavia no tiene forma de elegir la cancha dinamicamente -- eso llega
// con HU-002 (listar recursos), que le corresponde a Wagner. Mientras
// tanto, la cancha sintetica necesita tener SIEMPRE resource_id = 1.
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('resources', [
      {
        resource_id: 1,
        resource_type: 'field',
        name: 'Cancha sintetica',
        description: 'Cancha sintetica principal, uso mixto (futbol y otros deportes de cancha).',
        status: 'available',
      },
    ]);

    // Tarifa vigente desde hoy. field_rate guarda historico de precios
    // (ver fieldRate.model.js): no se sobreescribe el precio anterior,
    // se agrega una fila nueva con su propia effective_from cada vez
    // que cambie. El frontend todavia muestra "₡8.000 por hora" como
    // texto fijo en ReservasCancha.jsx -- conectarlo a esta tabla queda
    // pendiente, no se hizo en esta sesion porque no se pidio.
    await queryInterface.bulkInsert('field_rate', [
      {
        resource_id: 1,
        price_per_hour: 8000.0,
        effective_from: new Date().toISOString().slice(0, 10),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('field_rate', { resource_id: 1 });
    await queryInterface.bulkDelete('resources', { resource_id: 1 });
  },
};
