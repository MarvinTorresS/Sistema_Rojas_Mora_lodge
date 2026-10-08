'use strict';

// Traductor HTTP <-> service de la tarifa de cabinas (HU-128). Igual de
// "tonto" que los otros controllers del modulo: no valida ni decide reglas;
// los DomainError del service van tal cual al errorHandler con next(error).
const cabinRateService = require('./cabinRate.service');

// GET /api/cabins — cabinas con su tarifa vigente.
async function listCabinRates(req, res, next) {
  try {
    const data = await cabinRateService.listCabinRates();
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

// PATCH /api/cabins/:resourceId/rate — editar la tarifa por noche (CA-1).
// Responde 200 (se modifica un recurso existente, no se crea uno nuevo).
async function updateCabinRate(req, res, next) {
  try {
    const data = await cabinRateService.updateCabinRate({
      resourceId: Number(req.params.resourceId),
      pricePerNight: req.body.pricePerNight,
    });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listCabinRates, updateCabinRate };
