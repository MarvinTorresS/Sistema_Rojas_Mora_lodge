'use strict';

// Resolucion del CLIENTE de una reserva a partir de nombre + telefono.
// La usan cancha (HU-001) y salon (HU-013); antes cada modulo tenia su
// propia copia de `findOrCreateCustomer`.
//
// Por que existe (bug corregido el 26/10/2026):
//   Antes se hacia `Customer.findOrCreate({ where: { phone } })`. Ese
//   metodo, si encuentra el telefono, devuelve al cliente existente e
//   IGNORA el nombre escrito (los `defaults` solo se usan al crear). Asi,
//   reservar como "Pedro Soto" con el telefono de "Juan Perez" dejaba la
//   reserva a nombre de Juan, sin ningun aviso.
//
//   El telefono NO identifica a una persona (familias y oficinas comparten
//   numero; la tabla ni siquiera lo marca UNIQUE). Por eso, cuando el
//   telefono ya existe con OTRO nombre, la reserva se RECHAZA con un 409 que
//   solo avisa que el telefono no coincide.
//
//   Privacidad (evitar robo de identidad): el aviso NO dice a nombre de quien
//   esta el telefono y NO se puede "usar" ni ligar al cliente existente (ya no
//   hay linkCustomerId ni confirmNewCustomer): para reservar hay que escribir
//   el nombre que corresponde al telefono, o un telefono distinto.
//
// Vive en src/services/ (y no en utils/) porque consulta la base de datos;
// los archivos de utils/ son funciones puras.
const { Op, fn, col, where } = require('sequelize');
const { Customer } = require('../models');
const { DomainError } = require('../utils/domainError.util');

// Codigo estable para que el frontend reaccione sin comparar textos.
const CUSTOMER_PHONE_CONFLICT_CODE = 'CUSTOMER_PHONE_CONFLICT';

// Prefijo de Costa Rica: un numero viejo pudo guardarse como "+506 8888-7777".
const COUNTRY_CODE = '506';
// Caracteres de FORMATO que se quitan del telefono guardado antes de comparar.
const PHONE_FORMAT_CHARS = ['-', ' ', '(', ')', '+'];

// Condicion WHERE que compara SOLO LOS DIGITOS del telefono guardado.
//
// Por que no basta `{ phone: customerPhone }`: hoy los validators de cancha
// y salon guardan siempre 8 digitos ("88887777"), pero antes del 26/10/2026
// cancha guardaba el telefono tal como se escribia ("8888-7777",
// "8888 7777"). Con una comparacion exacta esos clientes viejos nunca se
// encontraban: se creaba un cliente duplicado y el aviso de telefono ya
// registrado no aparecia.
//
// Genera en MySQL: REPLACE(REPLACE(... phone ...)) IN ('88887777', '50688887777').
// Recorre la tabla completa (el REPLACE impide usar un indice); es aceptable
// por el tamano de la tabla de clientes de un solo negocio.
function buildPhoneLookupWhere(customerPhone) {
  const storedDigits = PHONE_FORMAT_CHARS.reduce(
    (expression, char) => fn('REPLACE', expression, char, ''),
    col('phone'),
  );
  return where(storedDigits, { [Op.in]: [customerPhone, `${COUNTRY_CODE}${customerPhone}`] });
}

// "  Juan   PÉREZ " -> "juan perez". Se ignoran mayusculas, tildes y
// espacios repetidos: escribir "Juan Perez" para un cliente guardado como
// "Juan Pérez" es la misma persona y no debe disparar el aviso.
function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a, b) {
  return normalizeName(a) === normalizeName(b);
}

// El 409 no lleva NINGUN dato del cliente existente (ni nombre ni id): solo
// avisa que el telefono no coincide con el nombre escrito.
const PHONE_MISMATCH_MESSAGE = 'El teléfono no coincide con el nombre del cliente. Revisá los datos e intentá de nuevo.';

function phoneConflictError() {
  return new DomainError(PHONE_MISMATCH_MESSAGE, 409, { code: CUSTOMER_PHONE_CONFLICT_CODE });
}

/**
 * Paso 1 (SOLO LECTURA): decide a que cliente pertenece la reserva.
 *
 * No crea nada a proposito: cancha revisa el CA-5 (reserva duplicada del
 * mismo cliente) con este resultado ANTES de guardar, y si la reserva se
 * rechaza no debe quedar un cliente nuevo suelto por un intento fallido.
 *
 * @returns {Promise<object|null>} el cliente existente, o `null` si hay que
 *   crear uno nuevo (con `createCustomer`) cuando la reserva ya sea valida.
 * @throws {DomainError} 409 CUSTOMER_PHONE_CONFLICT si el telefono ya existe
 *   con otro nombre (sin revelar de quien es).
 */
async function matchCustomerByPhone({ customerName, customerPhone, transaction }) {
  // findAll y no findOne: puede haber VARIOS clientes con el mismo telefono
  // (datos viejos). `customerPhone` ya llega normalizado a 8 digitos por el
  // validator.
  const customers = await Customer.findAll({
    where: buildPhoneLookupWhere(customerPhone),
    order: [['customerId', 'ASC']],
    transaction,
  });

  // Mismo telefono y mismo nombre: es la misma persona.
  const sameName = customers.find((customer) => namesMatch(customer.fullName, customerName));
  if (sameName) return sameName;

  // Telefono nuevo: se creara un cliente (createCustomer).
  if (customers.length === 0) return null;

  // Telefono conocido con otro nombre: se rechaza, sin decir de quien es.
  throw phoneConflictError();
}

/**
 * Paso 2: crea el cliente nuevo. Se llama solo cuando la reserva ya paso
 * todas sus reglas. Recibe la transaccion para que, si crear la reserva
 * falla despues, el cliente tambien se deshaga.
 */
function createCustomer({ customerName, customerPhone, transaction }) {
  return Customer.create({ fullName: customerName, phone: customerPhone }, { transaction });
}

module.exports = {
  CUSTOMER_PHONE_CONFLICT_CODE,
  buildPhoneLookupWhere,
  matchCustomerByPhone,
  createCustomer,
  namesMatch,
  normalizeName,
};
