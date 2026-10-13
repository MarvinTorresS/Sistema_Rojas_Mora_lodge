'use strict';

// Reglas de FORMATO de los datos de una persona (cedula, telefono, correo y
// nombre). Estan en un solo lugar para que las reservas de cabina y de salon
// acepten exactamente lo mismo y para que el frontend (que tiene su copia en
// components/common/guestData.js) y el backend no se contradigan.
//
// Solo revisan la FORMA del dato; no consultan la base de datos.

// Mensajes: los usan los validators y las pruebas.
const GUEST_MESSAGES = {
  IDENTIFICATION: 'La identificación debe tener solo números: 9 dígitos (cédula) u 11 o 12 (DIMEX).',
  PHONE: 'El teléfono debe tener 8 dígitos (se acepta el prefijo +506 y guiones).',
  EMAIL: 'El correo no tiene un formato válido (ejemplo: nombre@correo.com).',
  NAME: 'El nombre solo puede llevar letras, espacios, punto, guion y apóstrofo (sin números).',
  FULL_NAME: 'Escribí el nombre completo con apellidos (por ejemplo: Juan Pérez Mora).',
  EMAIL_OF_OTHER_ID: 'Ese correo ya está registrado con otra cédula. Cada cédula usa su propio correo.',
};

const PHONE_DIGITS = 8;
const COUNTRY_CODE = '506';
const IDENTIFICATION_LENGTHS = [9, 11, 12];

// Letra al inicio y luego letras, espacios, punto, guion o apostrofo.
const NAME_PATTERN = /^[\p{L}][\p{L}\s.'’-]*$/u;
// Correo: usuario@dominio.extension, sin espacios ni caracteres raros.
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

// "6-0495-0088" / "6 0495 0088" -> "604950088". Devuelve null si trae algo
// que no sea numero (letras, simbolos) o si no tiene la cantidad de digitos
// de una cedula (9) o de un DIMEX (11 o 12).
function normalizeIdentification(value) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s-]/g, '');
  if (!/^\d+$/.test(compact)) return null;
  return IDENTIFICATION_LENGTHS.includes(compact.length) ? compact : null;
}

// "+506 8557-1211" / "(506) 85571211" / "8557 1211" -> "85571211". Devuelve
// null si no queda un numero de 8 digitos.
function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  let compact = value.trim().replace(/[\s\-()]/g, '');
  if (compact.startsWith('+')) compact = compact.slice(1);
  if (!/^\d+$/.test(compact)) return null;
  if (compact.length === PHONE_DIGITS + COUNTRY_CODE.length && compact.startsWith(COUNTRY_CODE)) {
    compact = compact.slice(COUNTRY_CODE.length);
  }
  return compact.length === PHONE_DIGITS ? compact : null;
}

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 150 && EMAIL_PATTERN.test(value.trim())
    && !value.includes('..');
}

// Nombre ya limpio (sin espacios de mas): letras y signos de nombre, sin numeros.
function isValidName(value) {
  return typeof value === 'string' && NAME_PATTERN.test(value.trim());
}

// Nombre completo: al menos nombre y apellido (dos palabras de 2 letras o mas).
// Los nombres SI pueden repetirse entre personas; lo que identifica a cada una
// es su cedula.
function isFullName(value) {
  if (typeof value !== 'string') return false;
  const words = value.trim().split(/\s+/).filter((word) => word.replace(/[^\p{L}]/gu, '').length >= 2);
  return words.length >= 2;
}

module.exports = {
  isFullName,
  GUEST_MESSAGES,
  normalizeIdentification,
  normalizePhone,
  isValidEmail,
  isValidName,
};
