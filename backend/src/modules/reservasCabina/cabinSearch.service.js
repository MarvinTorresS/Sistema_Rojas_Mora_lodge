'use strict';

// Logica de negocio de la BUSQUEDA de reservas de cabina por huesped
// (HU-018, Sprint 3). Igual que el resto del modulo: no sabe de
// HTTP; recibe datos ya validados en su forma y lanza DomainError cuando
// una regla de negocio falla.
const { Op } = require('sequelize');
const { DomainError } = require('../../utils/domainError.util');
const { readCabinBookings } = require('./cabinBookingRead.service');
const {
  DEFAULT_PAGE_SIZE, EMPTY_SEARCH_MESSAGE, NO_RESULTS_MESSAGE, normalizeSearchTerm, escapeLike,
} = require('./cabinSearch.util');

const SEARCH_TERM_REQUIRED_CODE = 'SEARCH_TERM_REQUIRED';
const { cabinOperationOrder } = require('./cabinOperationOrder');

// GET /api/cabin-bookings/search?q=
//
// CA-1: devuelve UNICAMENTE las reservas cuyo huesped coincide, por
//       nombre o por identificacion, con coincidencia parcial. LIKE de
//       MySQL no distingue mayusculas/minusculas con el collation que usa
//       el proyecto (utf8mb4_*_ci), igual que la busqueda de HU-127.
// CA-2: sin coincidencias responde 200 con lista vacia y el mensaje del
//       criterio en meta.message (no es un error). El criterio buscado se
//       devuelve en meta.query para que la pantalla lo mantenga.
//
// Incluye reservas de TODOS los estados: ubicar la informacion de
// hospedaje de un huesped incluye su historial (finalizadas, canceladas).
async function searchCabinBookings({ q, page = 1, pageSize = DEFAULT_PAGE_SIZE, operation } = {}) {
  const term = normalizeSearchTerm(q);
  if (!term) {
    throw new DomainError(EMPTY_SEARCH_MESSAGE, 422, { code: SEARCH_TERM_REQUIRED_CODE });
  }
  const currentPage = Number(page);
  const size = Number(pageSize);
  const like = `%${escapeLike(term)}%`;
  // La cedula se guarda solo con numeros: "6-0495-0088" tambien debe encontrarla.
  const digitsOnly = term.replace(/[\s-]/g, '');
  const idLike = /^\d+$/.test(digitsOnly) && digitsOnly !== term ? `%${digitsOnly}%` : null;

  const result = await readCabinBookings({
    ...(operation ? { order: cabinOperationOrder(operation) } : {}),
    page: currentPage, pageSize: size,
    customerWhere: {
      [Op.or]: [
        { fullName: { [Op.like]: like } },
        { identificationNumber: { [Op.like]: like } },
        ...(idLike ? [{ identificationNumber: { [Op.like]: idLike } }] : []),
      ],
    },
  });
  return { ...result, query: term, message: result.total === 0 ? NO_RESULTS_MESSAGE : null };
}

module.exports = {
  SEARCH_TERM_REQUIRED_CODE,
  searchCabinBookings,
};
