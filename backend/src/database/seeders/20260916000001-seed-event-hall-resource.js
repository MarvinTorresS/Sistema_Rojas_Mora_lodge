'use strict';

// Siembra el recurso base "salon de eventos" y sus planes de precio de
// prueba, que HU-013 (Marvin, Sprint 2) necesita para poder registrar
// una reserva: una reserva de salon siempre va bajo un plan concreto
// (event_hall_plan_id en bookings), y sin ninguna fila en
// event_hall_pricing_plans no hay ningun plan que elegir.
//
// Por que un seeder y no esperar el endpoint real de planes: HU-008
// (registrar plan) y HU-009 (consultar planes) le tocan a Alison en
// este mismo sprint. Si HU-013 dependiera de que ese codigo ya este
// escrito y fusionado, Marvin no podria avanzar ni probar su propia
// historia hasta que Alison termine la suya -- exactamente el tipo de
// dependencia entre compañeros que se identifico como causa raiz de
// que el Sprint 1 quedara "intercalado" y que la reorganizacion de
// sprints busca evitar. Con datos propios sembrados en la base, HU-013
// se puede implementar y probar de forma completamente independiente;
// cuando el endpoint real de Alison (HU-009) este listo, el frontend
// solo tiene que cambiar de donde saca la lista de planes, sin tocar
// la logica de negocio de este archivo.
//
// resource_id y plan_id se fuerzan a valores fijos (2 y 1/2) por la
// misma razon que 20260910000001-seed-field-resource.js fuerza
// resource_id=1 para la cancha: el frontend (ReservasSalon.jsx,
// constantes EVENT_HALL_RESOURCE_ID / planes de ejemplo) todavia no
// tiene forma de listarlos dinamicamente -- eso llega con HU-009
// (Alison). resource_id=2 porque 1 ya lo ocupa la cancha sintetica.
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('resources', [
      {
        resource_id: 2,
        resource_type: 'event_hall',
        name: 'Salón de eventos principal',
        description: 'Salón de eventos para actividades sociales y corporativas.',
        status: 'available',
      },
    ]);

    // Dos planes de ejemplo, para poder probar de verdad que HU-013
    // deja elegir un plan concreto (y no solo "el unico que existe").
    await queryInterface.bulkInsert('event_hall_pricing_plans', [
      {
        plan_id: 1,
        resource_id: 2,
        plan_name: 'Medio día (6 horas)',
        hours: 6,
        price: 150000.0,
      },
      {
        plan_id: 2,
        resource_id: 2,
        plan_name: 'Día completo (12 horas)',
        hours: 12,
        price: 250000.0,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('event_hall_pricing_plans', { resource_id: 2 });
    await queryInterface.bulkDelete('resources', { resource_id: 2 });
  },
};
