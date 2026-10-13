'use strict';

// Siembra las cabinas base que HU-016 (Marvin, Sprint 3) necesita para
// poder registrar una reserva: una reserva de cabina siempre apunta a un
// recurso tipo 'cabin' (resources) con sus datos propios (cabin_details).
//
// Por que un seeder y no esperar un CRUD de cabinas: ninguna HU del
// proyecto administra el catalogo de cabinas (no existe "registrar
// cabina"), asi que estos datos solo pueden venir de la base. Es el mismo
// criterio de 20260910000001-seed-field-resource.js (cancha) y
// 20260916000001-seed-event-hall-resource.js (salon).
//
// Por que CUATRO cabinas y de distinta capacidad: CA-2 de HU-016 exige que,
// cuando una cabina esta ocupada, el sistema sugiera ALTERNATIVAS libres
// para las mismas fechas. Con una sola cabina ese criterio no se puede
// ni implementar ni probar. Y con capacidades distintas se puede probar
// que una alternativa solo se sugiere si le cabe el grupo.
//
// resource_id se fuerza a 3, 4, 5 y 6 porque 1 es la cancha y 2 el salon
// (mismo motivo que en los otros seeders: el frontend aun no puede
// listar recursos dinamicamente).
//
// Los precios por noche son VALORES DE ARRANQUE para poder calcular el
// monto; el negocio (Jonathan Rojas Mora) aun no los ha validado.
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('resources', [
      {
        resource_id: 3,
        resource_type: 'cabin',
        name: 'Cabina 1',
        description: 'Cabina pequena para parejas.',
        status: 'available',
      },
      {
        resource_id: 4,
        resource_type: 'cabin',
        name: 'Cabina 2',
        description: 'Cabina familiar mediana.',
        status: 'available',
      },
      {
        resource_id: 5,
        resource_type: 'cabin',
        name: 'Cabina 3',
        description: 'Cabina grande para grupos.',
        status: 'available',
      },
      {
        resource_id: 6,
        resource_type: 'cabin',
        name: 'Cabina 4',
        description: 'Cabina para tres personas.',
        status: 'available',
      },
    ]);

    await queryInterface.bulkInsert('cabin_details', [
      { resource_id: 3, capacity: 2, price_per_night: 35000.0 },
      { resource_id: 4, capacity: 4, price_per_night: 55000.0 },
      { resource_id: 5, capacity: 6, price_per_night: 80000.0 },
      { resource_id: 6, capacity: 3, price_per_night: 45000.0 },
    ]);
  },

  async down(queryInterface) {
    // Primero el detalle (tiene la FK hacia resources), luego el recurso.
    await queryInterface.bulkDelete('cabin_details', { resource_id: [3, 4, 5, 6] });
    await queryInterface.bulkDelete('resources', { resource_id: [3, 4, 5, 6] });
  },
};
