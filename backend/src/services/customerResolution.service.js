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
//   telefono ya existe con OTRO nombre, el sistema ya no decide solo: avisa
//   con un 409 y el recepcionista elige (mismo patron que el CA-3 de
//   cabinas con `linkExistingGuest`):
//     - linkCustomerId:      "si, es ese cliente"  -> se usa el existente.
//     - confirmNewCustomer:  "es otra persona"     -> se crea uno nuevo
//                                                     con el mismo telefono.
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

// Datos minimos del cliente existente que viajan al frontend en el 409
// (no se expone nada mas: correo, cedula, etc. no hacen falta para decidir).
function toConflictCandidate(customer) {
  return { customerId: customer.customerId, fullName: customer.fullName };
}

function phoneConflictError(customerPhone, customers) {
  const names = customers.map((customer) => customer.fullName).join(', ');
  return new DomainError(
    `Este teléfono ya está registrado a nombre de ${names}. Confirmá si la reserva es para ese cliente o para otra persona.`,
    409,
    {
      code: CUSTOMER_PHONE_CONFLICT_CODE,
      details: { phone: customerPhone, existingCustomers: customers.map(toConflictCandidate) },
    },
  );
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
 *   con otro nombre y el recepcionista todavia no eligio que hacer.
 */
async function matchCustomerByPhone({
  customerName, customerPhone, linkCustomerId, confirmNewCustomer, transaction,
}) {
  // findAll y no findOne: despues de un "es otra persona" puede haber
  // VARIOS clientes con el mismo telefono. `customerPhone` ya llega
  // normalizado a 8 digitos por el validator.
  const customers = await Customer.findAll({
    where: buildPhoneLookupWhere(customerPhone),
    order: [['customerId', 'ASC']],
    transaction,
  });

  // Eleccion explicita del recepcionista: "si, es ese cliente".
  if (linkCustomerId !== undefined && linkCustomerId !== null) {
    const chosen = customers.find((customer) => customer.customerId === Number(linkCustomerId));
    // Si el elegido ya no tiene ese telefono (lo cambiaron mientras tanto),
    // se vuelve a preguntar con los datos frescos en vez de reservar a
    // nombre de alguien que ya no corresponde.
    if (!chosen) throw phoneConflictError(customerPhone, customers);
    return chosen;
  }

  // Mismo telefono y mismo nombre: es la misma persona, sin preguntar.
  const sameName = customers.find((customer) => namesMatch(customer.fullName, customerName));
  if (sameName) return sameName;

  // Telefono nuevo, o el recepcionista ya confirmo que es otra persona.
  if (customers.length === 0 || confirmNewCustomer === true) return null;

  // Telefono conocido con otro nombre: no se decide en silencio.
  throw phoneConflictError(customerPhone, customers);
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
