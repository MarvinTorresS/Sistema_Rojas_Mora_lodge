'use strict';

// Logica de negocio de los PLANES DE PRECIOS del salon (HU-008 y HU-009 --
// Sprint 2). Misma separacion de capas que el resto del backend:
// esta capa no sabe de HTTP; recibe datos ya validados en su forma y lanza
// DomainError con un statusCode cuando una regla de negocio falla.
//
// HU-010 (modificar), HU-011 (eliminar) y HU-012 (Wagner) agregaran sus
// funciones a este mismo archivo cuando les toque; aqui solo estan las
// de registrar y listar.
const { Resource, EventHallPricingPlan, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const {
  normalizePlanName,
  planNameKey,
  getPlanNameError,
  getPlanHoursError,
  getPlanPriceError,
  parseHours,
  normalizePrice,
  normalizeIncludedServices,
  serializeServices,
  parseStoredServices,
  normalizeDepositPercentage,
  normalizeExtraHourPrice,
} = require('./eventHallPlans.util');

const EVENT_HALL_RESOURCE_TYPE = 'event_hall';

// Codigos estables para el frontend (decide con el codigo, no con el texto).
const PLAN_ERROR_CODES = {
  INVALID_PLAN: 'INVALID_PLAN',
  DUPLICATE_PLAN_NAME: 'DUPLICATE_PLAN_NAME',
  HALL_NOT_SPECIFIED: 'HALL_NOT_SPECIFIED',
};

// Forma publica de un plan. Un solo lugar decide que campos salen, para que
// el listado y la respuesta del registro sean siempre iguales.
function toPlanView(plan) {
  return {
    planId: plan.planId,
    resourceId: plan.resourceId,
    planName: plan.planName,
    hours: plan.hours,
    price: Number(plan.price),
    includedServices: parseStoredServices(plan.includedServices),
    depositPercentage: plan.depositPercentage === null || plan.depositPercentage === undefined
      ? null
      : Number(plan.depositPercentage),
    // null = el plan no admite horas extra.
    extraHourPrice: plan.extraHourPrice === null || plan.extraHourPrice === undefined
      ? null
      : Number(plan.extraHourPrice),
  };
}

// Orden del listado: de menor a mayor duracion y, a igual duracion, de
// menor a mayor precio (asi "medio dia" aparece antes que "dia completo").
function comparePlans(a, b) {
  return a.hours - b.hours || a.price - b.price || a.planId - b.planId;
}

// HU-009 -- GET /api/event-hall-plans
//
// CA-1: devuelve los planes con nombre, duracion, precio y servicios.
// CA-2: `hours` filtra por duracion.
// CA-3 (sin planes): devuelve una lista vacia con 200 -- "no hay planes" no
//       es un error, y la pantalla muestra su mensaje.
//
// Se traen todos los planes del salon y se filtran en memoria: son pocos
// (un puñado por salon) y asi, ademas, se calculan en la misma consulta las
// duraciones disponibles (`availableHours`) para armar el filtro de la
// pantalla sin una segunda llamada.
async function listEventHallPlans({ resourceId, hours, search } = {}) {
  const where = {};
  if (resourceId) where.resourceId = Number(resourceId);

  const rows = await EventHallPricingPlan.findAll({ where, order: [['planId', 'ASC']] });
  const all = rows.map(toPlanView).sort(comparePlans);

  const hoursFilter = hours ? Number(hours) : null;
  const searchKey = typeof search === 'string' ? planNameKey(search) : '';

  const items = all.filter((plan) => (
    (hoursFilter === null || plan.hours === hoursFilter)
    && (!searchKey || planNameKey(plan.planName).includes(searchKey))
  ));

  const availableHours = [...new Set(all.map((plan) => plan.hours))].sort((a, b) => a - b);
  return { items, total: items.length, totalWithoutFilters: all.length, availableHours };
}

// Datos del salon unico de Rojas Mora. Son los mismos que siembra
// 20260916000001-seed-event-hall-resource.js, incluido el id 2 (el 1 es la
// cancha), para que las pantallas que ya usan EVENT_HALL_RESOURCE_ID = 2
// sigan funcionando.
const DEFAULT_HALL = {
  resourceId: 2,
  resourceType: EVENT_HALL_RESOURCE_TYPE,
  name: 'Salón de eventos principal',
  description: 'Salón de eventos para actividades sociales y corporativas.',
  status: 'available',
};

// Registra el salon unico cuando no existe. Si el id 2 lo ocupa otro recurso
// se deja que la base asigne uno. Si dos solicitudes llegan a la vez y la
// otra ya lo creo, se usa el que quedo.
async function provisionDefaultHall(transaction) {
  const idTaken = await Resource.findByPk(DEFAULT_HALL.resourceId, { transaction });
  const { resourceId, ...withoutId } = DEFAULT_HALL;
  try {
    return await Resource.create(idTaken ? withoutId : DEFAULT_HALL, { transaction });
  } catch (error) {
    const existing = await Resource.findOne({
      where: { resourceType: EVENT_HALL_RESOURCE_TYPE },
      order: [['resourceId', 'ASC']],
      transaction,
    }).catch(() => null);
    if (existing) return existing;
    throw error;
  }
}

// Salon al que pertenece el plan. Si el cliente no lo indica y existe un
// unico salon (el caso de Rojas Mora), se usa ese; si hubiera varios, hay
// que decir cual.
async function resolveHall(resourceId, transaction) {
  if (resourceId) {
    const resource = await Resource.findOne({
      where: { resourceId: Number(resourceId), resourceType: EVENT_HALL_RESOURCE_TYPE },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!resource) throw new DomainError('El salón indicado no existe.', 404);
    return resource;
  }

  const halls = await Resource.findAll({
    where: { resourceType: EVENT_HALL_RESOURCE_TYPE },
    order: [['resourceId', 'ASC']],
    transaction,
  });
  if (halls.length === 0) {
    // Rojas Mora tiene un unico salon y este formulario nunca pide elegirlo.
    // Si la base aun no lo tiene (no se corrio el seeder del salon), se
    // registra aqui en vez de dejar el formulario sin salida.
    return provisionDefaultHall(transaction);
  }
  if (halls.length > 1) {
    throw new DomainError('Indique el salón al que pertenece el plan.', 422, {
      code: PLAN_ERROR_CODES.HALL_NOT_SPECIFIED,
    });
  }
  // Se vuelve a leer con bloqueo para ordenar este registro respecto a otro
  // que llegue al mismo tiempo.
  return Resource.findByPk(halls[0].resourceId, { lock: transaction.LOCK.UPDATE, transaction });
}

// HU-008 -- POST /api/event-hall-plans
//
// CA-1: plan completo -> se guarda y se devuelve.
// CA-2: nombre repetido (sin distinguir mayusculas/minusculas) -> 409 con el
//       mensaje del criterio.
// CA-3: campos obligatorios -> 422 (nombre, duracion en horas y precio).
async function createEventHallPlan({
  resourceId, planName, hours, price, includedServices, depositPercentage, extraHourPrice,
}) {
  // Ultima barrera: el validator ya reviso la forma, pero el service no debe
  // confiar en que siempre lo llamen por HTTP. Usa las MISMAS funciones.
  const formError = getPlanNameError(planName)
    || getPlanHoursError(hours)
    || getPlanPriceError(price);
  const services = normalizeIncludedServices(includedServices);
  const deposit = normalizeDepositPercentage(depositPercentage);
  const extraHour = normalizeExtraHourPrice(extraHourPrice);
  const firstError = formError || services.error || deposit.error || extraHour.error;
  if (firstError) {
    throw new DomainError(firstError, 422, { code: PLAN_ERROR_CODES.INVALID_PLAN });
  }

  const name = normalizePlanName(planName);

  return sequelize.transaction(async (transaction) => {
    // Se bloquea la fila del SALON: dos personas que registren el mismo
    // nombre a la vez se ordenan, y la segunda ve el plan de la primera
    // (la tabla no tiene indice unico por nombre, asi que el bloqueo es lo
    // que evita el duplicado).
    const hall = await resolveHall(resourceId, transaction);

    // Lectura CON bloqueo a proposito: una lectura normal usa la "foto" de la
    // base tomada al empezar la transaccion y no veria el plan que otra
    // solicitud acaba de guardar mientras esta esperaba el bloqueo del salon;
    // la lectura con bloqueo si ve lo ultimo guardado.
    const existing = await EventHallPricingPlan.findAll({
      where: { resourceId: hall.resourceId },
      attributes: ['planId', 'planName'],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    const key = planNameKey(name);
    if (existing.some((plan) => planNameKey(plan.planName) === key)) {
      throw new DomainError('Ya existe un plan con ese nombre', 409, {
        code: PLAN_ERROR_CODES.DUPLICATE_PLAN_NAME,
        details: [{ field: 'planName', message: 'Ya existe un plan con ese nombre' }],
      });
    }

    const created = await EventHallPricingPlan.create({
      resourceId: hall.resourceId,
      planName: name,
      hours: parseHours(hours),
      price: normalizePrice(price),
      includedServices: serializeServices(services.services),
      depositPercentage: deposit.percentage,
      extraHourPrice: extraHour.price,
    }, { transaction });

    return toPlanView(created);
  });
}

module.exports = {
  PLAN_ERROR_CODES,
  listEventHallPlans,
  createEventHallPlan,
};
