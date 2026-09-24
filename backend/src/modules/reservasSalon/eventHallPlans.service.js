'use strict';

// Logica de negocio del CRUD de planes de precio del salon de eventos
// (tabla event_hall_pricing_plans). Entidad DISTINTA de las reservas
// del salon (reservasSalon.service.js: HU-007, HU-013 a HU-015) aunque
// comparten la misma area funcional "salon" -- ver la nota en
// reservasSalon.routes.js sobre por que se separan en dos modulos.
// Mismos principios de capas que el resto del backend: sin req/res,
// DomainError con statusCode cuando falla una regla de NEGOCIO.
const { Op } = require('sequelize');
const { EventHallPricingPlan, Booking } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { ACTIVE_BOOKING_STATUSES } = require('../../utils/bookingOverlap.util');

// Aplana una fila de EventHallPricingPlan (instancia Sequelize u objeto
// plano) a la forma que consume el frontend, convirtiendo `price` a
// numero (Sequelize devuelve DECIMAL como string para no perder
// precision, pero el frontend necesita un numero para operar con el).
function mapPlan(plan) {
  const row = typeof plan.get === 'function' ? plan.get({ plain: true }) : plan;
  return {
    planId: row.planId,
    resourceId: row.resourceId,
    planName: row.planName,
    hours: row.hours,
    price: Number(row.price),
  };
}

// HU-010 — Buscar un plan de precios del salon por nombre.
// CA-1 Busqueda exitosa; CA-2 Sin resultados de busqueda: se responde
// 200 con un arreglo vacio, NUNCA 404 -- "no hay planes con ese nombre"
// es un resultado valido de una busqueda, no un error del sistema.
async function searchPlansByName({ name }) {
  const plans = await EventHallPricingPlan.findAll({
    where: { planName: { [Op.substring]: name } },
    order: [['planName', 'ASC']],
  });
  return plans.map(mapPlan);
}

// HU-011 — Editar los datos de un plan de precios existente del salon.
// CA-3 (campos obligatorios incompletos) se valida en la forma
// (eventHallPlans.validator.js); aqui solo reglas de negocio: CA-1
// (edicion exitosa) y CA-2 (edicion de un plan con reservas futuras
// asociadas).
async function updateHallPlan(planId, { planName, hours, price }) {
  const plan = await EventHallPricingPlan.findByPk(planId);
  if (!plan) {
    throw new DomainError('El plan de precios indicado no existe.', 404);
  }

  await plan.update({ planName, hours, price });

  // CA-2: el precio y la duracion del plan NO quedan "congelados" por
  // reserva (a diferencia de account_items.unit_price en el
  // restaurante, que si guarda el precio vigente al momento de agregar
  // el producto -- ver Diccionario de Datos seccion 3.15). Por eso
  // editar un plan con reservas futuras no se bloquea, pero conviene
  // informarle al Administrador cuantas reservas ya confirmadas usaran
  // los datos nuevos, para que decida si avisar al cliente.
  const futureBookingsCount = await Booking.count({
    where: {
      eventHallPlanId: plan.planId,
      status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      startDatetime: { [Op.gt]: new Date() },
    },
  });

  return { plan: mapPlan(plan), futureBookingsCount };
}

// HU-012 — Eliminar de forma permanente un plan de precios del salon.
// CA-1 Eliminacion exitosa; CA-2 Intento de eliminar un plan con
// reservas activas.
//
// Regla de baja fisica condicionada (Diccionario de Datos, seccion 1.6
// / Control de Cambios item 13): un catalogo operativo solo se elimina
// FISICAMENTE cuando no posee ningun registro asociado. La FK
// bookings.event_hall_plan_id -> event_hall_pricing_plans.plan_id
// rechazaria el DELETE a nivel de motor de cualquier forma si existiera
// CUALQUIER reserva que referencie el plan (sin importar su estado: una
// FK no distingue 'cancelled' de 'active'); se valida antes de intentar
// el DELETE para responder con un mensaje claro (409) en vez de dejar
// escapar un error crudo de MySQL con detalle tecnico (estandar 8.2.5 /
// 8.4 de la catedra).
async function deleteHallPlan(planId) {
  const plan = await EventHallPricingPlan.findByPk(planId);
  if (!plan) {
    throw new DomainError('El plan de precios indicado no existe.', 404);
  }

  const associatedBookingsCount = await Booking.count({ where: { eventHallPlanId: plan.planId } });
  if (associatedBookingsCount > 0) {
    const activeBookingsCount = await Booking.count({
      where: { eventHallPlanId: plan.planId, status: { [Op.in]: ACTIVE_BOOKING_STATUSES } },
    });
    const detail = activeBookingsCount > 0
      ? `tiene ${activeBookingsCount} reserva(s) activa(s) asociada(s)`
      : `tiene ${associatedBookingsCount} reserva(s) asociada(s) en su historial`;
    throw new DomainError(`No se puede eliminar el plan de precios: ${detail}.`, 409);
  }

  await plan.destroy();
  return { planId: plan.planId };
}

module.exports = {
  mapPlan,
  searchPlansByName,
  updateHallPlan,
  deleteHallPlan,
};
