'use strict';

// Logica de negocio de la TARIFA por noche de las cabinas (HU-128 --
// Marvin, Sprint 3). Igual que el resto del modulo: esta capa no sabe de
// HTTP; recibe datos ya validados en su forma y lanza DomainError cuando
// una regla de negocio falla.
//
// Por que NO hay que "proteger" las reservas existentes aqui (CA-3): cada
// reserva y cada extension guardan una "foto" de su monto en el momento en
// que se registran (ver cabinBilling.service.js). Cambiar la tarifa de la
// cabina solo afecta lo que se registre DESPUES; el total ya registrado se
// lee de la foto, no de esta tarifa.
const { Resource, CabinDetail, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { getNightlyRateError, normalizeNightlyRate } = require('./cabinStay.util');
const { recordCabinRateChange } = require('./cabinBilling.service');

const CABIN_RESOURCE_TYPE = 'cabin';

// Codigo estable para el frontend (decide con el codigo, no con el texto).
const INVALID_RATE_CODE = 'INVALID_RATE';

// Forma publica de una cabina en esta pantalla. Un solo lugar que decide
// que campos salen, para que el listado y la respuesta del cambio sean
// siempre iguales.
function toCabinRateView(resource, cabinDetail) {
  return {
    resourceId: resource.resourceId,
    name: resource.name,
    status: resource.status,
    capacity: cabinDetail.capacity,
    pricePerNight: Number(cabinDetail.pricePerNight),
  };
}

// GET /api/cabins — todas las cabinas con su tarifa vigente. Se incluyen
// tambien las que estan en mantenimiento o inactivas: el Administrador debe
// poder ajustar su precio antes de volver a habilitarlas. Una sola consulta
// (JOIN), sin importar cuantas cabinas existan.
async function listCabinRates() {
  const cabins = await Resource.findAll({
    where: { resourceType: CABIN_RESOURCE_TYPE },
    include: [{ model: CabinDetail, as: 'cabinDetail', required: true }],
    order: [['resourceId', 'ASC']],
  });
  return cabins.map((cabin) => toCabinRateView(cabin, cabin.cabinDetail));
}

// PATCH /api/cabins/:resourceId/rate — CA-1 (edicion exitosa) y CA-2
// (tarifa invalida). El CA-4 (cancelar) es solo de pantalla: no llama aqui.
async function updateCabinRate({ resourceId, pricePerNight, userId = null }) {
  // Ultima barrera: el validator ya reviso la forma, pero esta regla es de
  // dinero y el service no debe confiar en que siempre lo llamen por HTTP.
  // Usa la MISMA funcion que el validator, asi no hay dos versiones.
  const rateError = getNightlyRateError(pricePerNight);
  if (rateError) {
    throw new DomainError(rateError, 422, { code: INVALID_RATE_CODE });
  }
  const newRate = normalizeNightlyRate(pricePerNight);

  return sequelize.transaction(async (transaction) => {
    // Se bloquea la fila de la CABINA, el mismo bloqueo que usan registrar
    // una reserva (HU-016) y extenderla (HU-127). Asi el cambio de tarifa
    // se ordena respecto a ellas: lo que ya estaba en curso termina con la
    // tarifa vieja y lo que llegue despues ve la nueva ("a partir de ese
    // momento", CA-3). Tambien evita que dos administradores se pisen y
    // que la auditoria guarde una "tarifa anterior" equivocada.
    const resource = await Resource.findOne({
      where: { resourceId, resourceType: CABIN_RESOURCE_TYPE },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!resource) {
      throw new DomainError('La cabina indicada no existe.', 404);
    }
    const cabinDetail = await CabinDetail.findByPk(resourceId, { transaction });
    if (!cabinDetail) {
      throw new DomainError('La cabina indicada no tiene datos de hospedaje configurados.', 404);
    }

    const previousRate = Number(cabinDetail.pricePerNight);

    // Misma tarifa: no hay nada que cambiar ni que auditar. Se responde con
    // exito para que repetir la peticion (doble clic, reintento) sea
    // inofensivo (idempotente), y `changed: false` deja que quien llama
    // sepa que no se escribio nada.
    if (previousRate === newRate) {
      return {
        changed: false,
        cabin: toCabinRateView(resource, cabinDetail),
        previousPricePerNight: previousRate,
      };
    }

    // Cambio y auditoria en la MISMA transaccion: o quedan las dos cosas o
    // ninguna (nunca una tarifa cambiada sin su registro).
    await cabinDetail.update({ pricePerNight: newRate }, { transaction });
    await recordCabinRateChange({
      resourceId, previousRate, newRate, userId, transaction,
    });

    return {
      changed: true,
      cabin: toCabinRateView(resource, cabinDetail),
      previousPricePerNight: previousRate,
    };
  });
}

module.exports = {
  INVALID_RATE_CODE,
  listCabinRates,
  updateCabinRate,
};
