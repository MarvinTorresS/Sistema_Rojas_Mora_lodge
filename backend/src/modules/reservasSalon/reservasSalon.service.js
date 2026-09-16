'use strict';

// Logica de negocio de las reservas del salon de eventos (HU-007,
// HU-013 -- Marvin, Sprint 2). Misma separacion de capas que
// reservasCancha.service.js: esta capa no sabe nada de HTTP, recibe
// datos ya validados en su FORMA y lanza DomainError con un
// statusCode cuando una regla de NEGOCIO falla.
const {
  Booking, Resource, ResourceBlock, EventHallPricingPlan, Customer,
} = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { buildBookingOverlapWhere, buildBlockOverlapWhere } = require('../../utils/bookingOverlap.util');

// Tipo de recurso que atiende este modulo (ver resource.model.js).
const EVENT_HALL_RESOURCE_TYPE = 'event_hall';

// CA-4 de HU-007 y HU-013: limite de dias hacia el futuro para
// consultar disponibilidad o registrar una reserva. Se redeclara aqui
// en vez de importarla de reservasCancha.service.js a proposito: cada
// modulo es dueno de su propia politica de negocio (la cancha y el
// salon podrian, en el futuro, tener ventanas de anticipacion
// distintas sin que eso implique tocar el modulo del otro). Mismo
// valor que cancha (30 dias) porque nadie ha pedido uno distinto
// todavia -- confirmar con Marvin si el negocio define una ventana
// propia para el salon.
const MAX_ADVANCE_BOOKING_DAYS = 30;

// CA-3 de HU-013 (calculo automatico del anticipo): ni la historia de
// usuario ni sus criterios de aceptacion dicen el porcentaje. Se
// confirmo con Marvin usar 30% del precio del plan como valor de
// arranque (16/09/2026), con la salvedad explicita de que el
// encargado/cliente (Jonathan Rojas Mora) todavia no lo ha validado --
// igual que paso con MAX_ADVANCE_BOOKING_DAYS en HU-001. Si el negocio
// define un porcentaje distinto, este es el UNICO lugar que hay que
// cambiar.
const EVENT_HALL_DEPOSIT_PERCENTAGE = 0.30;

// HU-007 — Consultar la disponibilidad del salon para una fecha y
// horario.
//
// Devuelve { available, reason } en vez de lanzar un error cuando el
// salon esta ocupado: a diferencia de "registrar" (HU-013), donde un
// conflicto SI es un error porque la operacion no se puede completar,
// aqui "no disponible" es una respuesta valida y esperada (CA-2/CA-3),
// no una falla. Los unicos casos que se lanzan como DomainError son
// forma-de-negocio invalida (recurso inexistente, CA-4).
async function checkHallAvailability({ resourceId, startDatetime, endDatetime }) {
  const start = new Date(startDatetime);
  const end = new Date(endDatetime);

  if (end <= start) {
    throw new DomainError('La hora de fin debe ser posterior a la hora de inicio.', 422);
  }

  const resource = await Resource.findOne({
    where: { resourceId, resourceType: EVENT_HALL_RESOURCE_TYPE },
  });
  if (!resource) {
    throw new DomainError('El salon indicado no existe.', 404);
  }

  // CA-4: fecha fuera de rango permitido (pasado, o mas de
  // MAX_ADVANCE_BOOKING_DAYS en el futuro).
  const maxAllowedDate = new Date();
  maxAllowedDate.setDate(maxAllowedDate.getDate() + MAX_ADVANCE_BOOKING_DAYS);
  if (start < new Date()) {
    throw new DomainError('No se puede consultar disponibilidad para una fecha u hora que ya paso.', 422);
  }
  if (start > maxAllowedDate) {
    throw new DomainError(
      `Solo se puede consultar disponibilidad hasta ${MAX_ADVANCE_BOOKING_DAYS} dias de anticipacion.`,
      422,
    );
  }

  // CA-2: salon no disponible (mantenimiento/inactivo) o bloqueado.
  if (resource.status !== 'available') {
    return { available: false, reason: 'El salon no esta disponible actualmente (mantenimiento o inactivo).' };
  }
  const overlappingBlock = await ResourceBlock.findOne({
    where: { resourceId, ...buildBlockOverlapWhere({ start, end }) },
  });
  if (overlappingBlock) {
    return { available: false, reason: `El salon esta bloqueado en ese horario (${overlappingBlock.reason}).` };
  }

  // CA-3: horario con solicitud pendiente (o ya reservado). Se
  // interpreta "solicitud pendiente" en sentido amplio -- cualquier
  // reserva activa o pendiente que se cruce con el horario consultado,
  // no solo las que estan literalmente en estado 'pending' -- porque
  // ni la HU ni los CA distinguen una respuesta distinta para
  // "pendiente" vs. "ya confirmada"; ambas significan lo mismo para
  // quien pregunta "¿esta libre?". Queda anotado por si el negocio
  // pide diferenciarlas mas adelante.
  const overlappingBooking = await Booking.findOne({
    where: { resourceId, ...buildBookingOverlapWhere({ start, end }) },
  });
  if (overlappingBooking) {
    const detail = overlappingBooking.status === 'pending'
      ? 'tiene una solicitud pendiente de aprobacion en ese horario'
      : 'ya tiene una reserva confirmada en ese horario';
    return { available: false, reason: `El salon ${detail}.` };
  }

  // CA-1: consulta exitosa, salon disponible.
  return { available: true, reason: null };
}

// Busca (o crea) el Customer a partir de nombre + telefono. Misma
// logica que reservasCancha.service.js#findOrCreateCustomer (ver nota
// de duplicacion en reservasSalon.validator.js: candidata a extraerse
// junto con handleValidationErrors en una limpieza futura).
async function findOrCreateCustomer({ customerName, customerPhone }) {
  const [customer] = await Customer.findOrCreate({
    where: { phone: customerPhone },
    defaults: { fullName: customerName, phone: customerPhone },
  });
  return customer;
}

// HU-013 — Registrar la reserva del salon con el plan de precios
// seleccionado.
async function createHallBooking(payload) {
  const {
    resourceId, planId, customerName, customerPhone, startDatetime, endDatetime,
  } = payload;

  const start = new Date(startDatetime);
  const end = new Date(endDatetime);

  if (end <= start) {
    throw new DomainError('La hora de fin debe ser posterior a la hora de inicio.', 422);
  }
  if (start < new Date()) {
    throw new DomainError('No se pueden registrar reservas en una fecha u hora que ya paso.', 422);
  }

  const resource = await Resource.findOne({
    where: { resourceId, resourceType: EVENT_HALL_RESOURCE_TYPE },
  });
  if (!resource) {
    throw new DomainError('El salon indicado no existe.', 404);
  }
  if (resource.status !== 'available') {
    throw new DomainError('El salon no esta disponible actualmente (mantenimiento o inactivo).', 409);
  }

  // El plan debe existir y pertenecer a ESTE salon: un plan de otro
  // recurso (si algun dia hay mas de un salon) no deberia poder
  // asignarse por error.
  const plan = await EventHallPricingPlan.findOne({ where: { planId, resourceId } });
  if (!plan) {
    throw new DomainError('El plan de precios indicado no existe para este salon.', 404);
  }

  // CA-4 (limite de anticipacion): misma politica que la consulta de
  // disponibilidad (HU-007), asi que un horario que HU-007 reporto
  // como valido sigue siendo valido al registrar.
  const maxAllowedDate = new Date();
  maxAllowedDate.setDate(maxAllowedDate.getDate() + MAX_ADVANCE_BOOKING_DAYS);
  if (start > maxAllowedDate) {
    throw new DomainError(
      `No se pueden registrar reservas con mas de ${MAX_ADVANCE_BOOKING_DAYS} dias de anticipacion.`,
      422,
    );
  }

  // CA-2: conflicto de horario, contra otras reservas y contra
  // bloqueos vigentes de este salon.
  const overlappingBooking = await Booking.findOne({
    where: { resourceId, ...buildBookingOverlapWhere({ start, end }) },
  });
  if (overlappingBooking) {
    throw new DomainError('Ya existe una reserva en ese horario para este salon.', 409);
  }
  const overlappingBlock = await ResourceBlock.findOne({
    where: { resourceId, ...buildBlockOverlapWhere({ start, end }) },
  });
  if (overlappingBlock) {
    throw new DomainError(`El salon esta bloqueado en ese horario (${overlappingBlock.reason}).`, 409);
  }

  const customer = await findOrCreateCustomer({ customerName, customerPhone });

  // CA-1: registro exitoso. originChannel = 'staff', igual que HU-001:
  // "Como un Administrador o Recepcionista..." -> la reserva nace activa.
  const booking = await Booking.create({
    resourceId,
    customerId: customer.customerId,
    originChannel: 'staff',
    eventHallPlanId: plan.planId,
    startDatetime: start,
    endDatetime: end,
    status: 'active',
  });

  // CA-3: calculo automatico del anticipo. Se redondea a 2 decimales
  // (moneda) para no arrastrar errores de punto flotante hacia la
  // factura/pago (HU-073, Sprint 7).
  const depositAmount = Math.round(Number(plan.price) * EVENT_HALL_DEPOSIT_PERCENTAGE * 100) / 100;

  return {
    booking,
    plan: { planId: plan.planId, planName: plan.planName, hours: plan.hours, price: Number(plan.price) },
    depositAmount,
    depositPercentage: EVENT_HALL_DEPOSIT_PERCENTAGE,
  };
}

module.exports = {
  EVENT_HALL_RESOURCE_TYPE,
  MAX_ADVANCE_BOOKING_DAYS,
  EVENT_HALL_DEPOSIT_PERCENTAGE,
  checkHallAvailability,
  createHallBooking,
};
