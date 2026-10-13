'use strict';

'use strict';

// Logica de negocio del CRUD de planes de precio del salon de eventos
// (tabla event_hall_pricing_plans). Entidad DISTINTA de las reservas
// del salon, pero se integra con el mismo dominio y comparte validacion
// con la version de Alison. Se consolidan tanto las funciones de listado
// y registro como las de busqueda, edicion y baja.
const { Op } = require('sequelize');
const {
  Resource,
  EventHallPricingPlan,
  Booking,
  sequelize,
} = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { ACTIVE_BOOKING_STATUSES } = require('../../utils/bookingOverlap.util');
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
const PLAN_ERROR_CODES = {
  INVALID_PLAN: 'INVALID_PLAN',
  DUPLICATE_PLAN_NAME: 'DUPLICATE_PLAN_NAME',
  HALL_NOT_SPECIFIED: 'HALL_NOT_SPECIFIED',
};

function mapPlan(plan) {
  const row = typeof plan.get === 'function' ? plan.get({ plain: true }) : plan;
  return {
    planId: row.planId,
    resourceId: row.resourceId,
    planName: row.planName,
    hours: row.hours,
    price: Number(row.price),
    includedServices: parseStoredServices(row.includedServices),
    depositPercentage: row.depositPercentage === null || row.depositPercentage === undefined
      ? null
      : Number(row.depositPercentage),
    extraHourPrice: row.extraHourPrice === null || row.extraHourPrice === undefined
      ? null
      : Number(row.extraHourPrice),
  };
}

function toPlanView(plan) {
  return mapPlan(plan);
}

function comparePlans(a, b) {
  return a.hours - b.hours || a.price - b.price || a.planId - b.planId;
}

async function searchPlansByName({ name }) {
  const plans = await EventHallPricingPlan.findAll({
    where: { planName: { [Op.substring]: name } },
    order: [['planName', 'ASC']],
  });
  return plans.map(mapPlan);
}

async function updateHallPlan(planId, { planName, hours, price }) {
  const plan = await EventHallPricingPlan.findByPk(planId);
  if (!plan) {
    throw new DomainError('El plan de precios indicado no existe.', 404);
  }

  await plan.update({ planName, hours, price });

  const futureBookingsCount = await Booking.count({
    where: {
      eventHallPlanId: plan.planId,
      status: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      startDatetime: { [Op.gt]: new Date() },
    },
  });

  return { plan: mapPlan(plan), futureBookingsCount };
}

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

const DEFAULT_HALL = {
  resourceId: 2,
  resourceType: EVENT_HALL_RESOURCE_TYPE,
  name: 'Salón de eventos principal',
  description: 'Salón de eventos para actividades sociales y corporativas.',
  status: 'available',
};

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
    return provisionDefaultHall(transaction);
  }
  if (halls.length > 1) {
    throw new DomainError('Indique el salón al que pertenece el plan.', 422, {
      code: PLAN_ERROR_CODES.HALL_NOT_SPECIFIED,
    });
  }
  return Resource.findByPk(halls[0].resourceId, { lock: transaction.LOCK.UPDATE, transaction });
}

async function createEventHallPlan({
  resourceId, planName, hours, price, includedServices, depositPercentage, extraHourPrice,
}) {
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
    const hall = await resolveHall(resourceId, transaction);

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
  mapPlan,
  toPlanView,
  comparePlans,
  searchPlansByName,
  updateHallPlan,
  deleteHallPlan,
  listEventHallPlans,
  createEventHallPlan,
};
};
