'use strict';

// Reglas puras de la BUSQUEDA de reservas por huesped (HU-018 --
// Sprint 3). Sin base de datos ni HTTP, para que el validator y el service
// usen exactamente la misma regla.

const MAX_SEARCH_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Mensajes tal como los pide el criterio de aceptacion (CA-2).
const EMPTY_SEARCH_MESSAGE = 'Ingrese el nombre o la identificación del huésped para buscar.';
const NO_RESULTS_MESSAGE = 'No se encontraron reservas con los criterios indicados';

// Quita espacios de los extremos y colapsa los repetidos del medio:
// "  Ana   Mora " -> "Ana Mora".
function normalizeSearchTerm(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

// Escapa los comodines de LIKE para que buscar "50%" o "a_b" se tome
// literal y no devuelva todas las reservas.
function escapeLike(text) {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

module.exports = {
  MAX_SEARCH_LENGTH,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  EMPTY_SEARCH_MESSAGE,
  NO_RESULTS_MESSAGE,
  normalizeSearchTerm,
  escapeLike,
};
