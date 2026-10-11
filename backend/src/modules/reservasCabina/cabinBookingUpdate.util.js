'use strict';

// Reglas PURAS de la MODIFICACION de una reserva de cabina (HU-019 --
// Sprint 3): que estados se pueden modificar, que campos son
// editables, como se calcula "que cambio" y que cambios prohibe tener ya
// el ingreso registrado. Sin base de datos ni HTTP, para que el validator,
// el service y las pruebas usen exactamente la misma regla.

const { normalizePhone } = require('../../utils/guestData.util');

// CA-1 pide que la reserva este "activa". Se acepta tambien la que ya tiene
// el ingreso registrado (checked_in) porque CA-3 define que se puede
// cambiar de ella. Una finalizada, cancelada, rechazada o pendiente de
// aprobacion no se modifica por aqui (igual criterio que HU-127).
const MODIFIABLE_STATUSES = ['active', 'checked_in'];

// Campos que se pueden cambiar. La identificacion del huesped NO esta: es
// la llave con la que se reconoce a la persona (HU-016 CA-3), y cambiarla
// equivaldria a poner la reserva a nombre de otra persona.
const EDITABLE_FIELDS = [
  'resourceId',
  'checkInDate',
  'checkOutDate',
  'companions',
  'guestName',
  'guestPhone',
  'guestEmail',
];

// Subconjunto que afecta la AGENDA de la cabina (si choca con otra reserva).
const SCHEDULE_FIELDS = ['resourceId', 'checkInDate', 'checkOutDate'];
// Subconjunto que son datos del huesped (se guardan en el cliente).
const GUEST_FIELDS = ['guestName', 'guestPhone', 'guestEmail'];

// Codigos estables para el frontend (decide con el codigo, no con el texto).
const UPDATE_ERROR_CODES = {
  BOOKING_NOT_MODIFIABLE: 'BOOKING_NOT_MODIFIABLE',
  CABIN_CHANGE_BLOCKED: 'CABIN_CHANGE_BLOCKED',
  CHECK_IN_DATE_LOCKED: 'CHECK_IN_DATE_LOCKED',
  INVALID_DATES: 'INVALID_DATES',
  BOOKING_CHANGED: 'BOOKING_CHANGED',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  CAPACITY_EXCEEDED: 'CAPACITY_EXCEEDED',
};

// Mensajes tal como los pide el criterio de aceptacion (CA-3).
const CABIN_CHANGE_BLOCKED_MESSAGE = 'No es posible reasignar cabina con huésped hospedado';
const CHECK_IN_DATE_LOCKED_MESSAGE = 'No es posible cambiar la fecha de entrada con huésped hospedado';

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

// Valor de un campo ya listo para comparar y guardar.
function normalizeFieldValue(field, value) {
  switch (field) {
    case 'resourceId':
    case 'companions':
      return Number(value);
    case 'guestName':
      return cleanText(value);
    case 'guestPhone':
      // Mismo formato en que se guarda: 8 digitos (+506, espacios y guiones se quitan).
      return normalizePhone(value) ?? cleanText(value);
    case 'guestEmail':
      return typeof value === 'string' ? value.trim() : value;
    default:
      return value;
  }
}

// Dos valores son "el mismo" si, una vez limpios, coinciden. El correo se
// compara sin distinguir mayusculas (a@x.com == A@X.com).
function sameValue(field, a, b) {
  if (field === 'guestEmail') {
    return String(a || '').toLowerCase() === String(b || '').toLowerCase();
  }
  return a === b;
}

// Compara lo que llego contra el estado ACTUAL de la reserva y devuelve:
//   - changes: { campo: { from, to } } SOLO de lo que de verdad cambia.
//              Mandar el mismo valor que ya tiene no cuenta como cambio.
//   - next:    el estado completo resultante (actual + cambios).
// `current` y `payload` usan los mismos nombres de campo (EDITABLE_FIELDS).
function diffBookingChanges(current, payload) {
  const changes = {};
  const next = { ...current };
  EDITABLE_FIELDS.forEach((field) => {
    if (payload[field] === undefined) return;
    const to = normalizeFieldValue(field, payload[field]);
    if (!sameValue(field, current[field], to)) {
      changes[field] = { from: current[field], to };
      next[field] = to;
    }
  });
  return { changes, next };
}

function touches(changes, fields) {
  return fields.some((field) => changes[field] !== undefined);
}

// CA-3: con el ingreso ya registrado NO se reasigna la cabina ni se mueve
// la fecha de entrada (el huesped ya esta alli); SI se permite cambiar la
// fecha de salida y los datos del huesped. Devuelve { code, message } o
// null si los cambios estan permitidos.
function getCheckedInViolation(status, changes) {
  if (status !== 'checked_in') return null;
  if (changes.resourceId !== undefined) {
    return { code: UPDATE_ERROR_CODES.CABIN_CHANGE_BLOCKED, message: CABIN_CHANGE_BLOCKED_MESSAGE };
  }
  if (changes.checkInDate !== undefined) {
    return { code: UPDATE_ERROR_CODES.CHECK_IN_DATE_LOCKED, message: CHECK_IN_DATE_LOCKED_MESSAGE };
  }
  return null;
}

module.exports = {
  MODIFIABLE_STATUSES,
  EDITABLE_FIELDS,
  SCHEDULE_FIELDS,
  GUEST_FIELDS,
  UPDATE_ERROR_CODES,
  CABIN_CHANGE_BLOCKED_MESSAGE,
  CHECK_IN_DATE_LOCKED_MESSAGE,
  normalizeFieldValue,
  diffBookingChanges,
  touches,
  getCheckedInViolation,
};
