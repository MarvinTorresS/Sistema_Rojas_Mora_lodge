// Formato de cédula, teléfono, correo y nombre. Es la misma regla que aplica el
// backend (src/utils/guestData.util.js): la pantalla avisa antes de enviar y el
// servidor la vuelve a revisar, así que no se contradicen.

export const GUEST_MESSAGES = {
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
const NAME_PATTERN = /^[\p{L}][\p{L}\s.'’-]*$/u;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** "6-0495-0088" → "604950088". null si no son solo números o no tiene 9, 11 o 12 dígitos. */
export function normalizeIdentification(value) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s-]/g, '');
  if (!/^\d+$/.test(compact)) return null;
  return IDENTIFICATION_LENGTHS.includes(compact.length) ? compact : null;
}

/** "+506 8557-1211" → "85571211". null si no quedan 8 dígitos. */
export function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  let compact = value.trim().replace(/[\s\-()]/g, '');
  if (compact.startsWith('+')) compact = compact.slice(1);
  if (!/^\d+$/.test(compact)) return null;
  if (compact.length === PHONE_DIGITS + COUNTRY_CODE.length && compact.startsWith(COUNTRY_CODE)) {
    compact = compact.slice(COUNTRY_CODE.length);
  }
  return compact.length === PHONE_DIGITS ? compact : null;
}

export function isValidEmail(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 && text.length <= 150 && EMAIL_PATTERN.test(text) && !text.includes('..');
}

export function isValidName(value) {
  return typeof value === 'string' && NAME_PATTERN.test(value.trim());
}

/**
 * Nombre completo: al menos nombre y apellido (dos palabras de 2 letras o más).
 * Los nombres pueden repetirse entre personas; lo que identifica a cada una es
 * su cédula.
 */
export function isFullName(value) {
  if (typeof value !== 'string') return false;
  const words = value.trim().split(/\s+/).filter((word) => word.replace(/[^\p{L}]/gu, '').length >= 2);
  return words.length >= 2;
}

// --- Lo que se deja escribir en cada campo ---------------------------------
// Se quitan los caracteres que nunca valdrían, para que una letra no llegue a
// quedar en la cédula o el teléfono. Los mensajes de arriba cubren el resto
// (por ejemplo, la cantidad de dígitos).

/** Cédula: números, guiones y espacios (máximo 14 caracteres). */
export const typeIdentification = (value) => value.replace(/[^\d\s-]/g, '').replace(/^\s+/, '').slice(0, 14);

/** Teléfono: números, +, espacios, guiones y paréntesis (máximo 20). */
export const typePhone = (value) => value.replace(/[^\d\s+\-()]/g, '').replace(/^\s+/, '').slice(0, 20);

/**
 * Revisa los datos de una persona y devuelve los errores por campo. Solo se
 * revisan los campos que vienen en `values` (las claves son las del formulario
 * de cabina: guestIdentification, guestName, guestPhone, guestEmail).
 * Un campo vacío NO se marca aquí: "obligatorio" lo decide cada pantalla.
 */
export function validateGuestData(values) {
  const errors = {};
  const filled = (key) => typeof values[key] === 'string' && values[key].trim() !== '';
  if (filled('guestIdentification') && normalizeIdentification(values.guestIdentification) === null) {
    errors.guestIdentification = GUEST_MESSAGES.IDENTIFICATION;
  }
  if (filled('guestName')) {
    if (!isValidName(values.guestName)) errors.guestName = GUEST_MESSAGES.NAME;
    else if (!isFullName(values.guestName)) errors.guestName = GUEST_MESSAGES.FULL_NAME;
  }
  if (filled('guestPhone') && normalizePhone(values.guestPhone) === null) errors.guestPhone = GUEST_MESSAGES.PHONE;
  if (filled('guestEmail') && !isValidEmail(values.guestEmail)) errors.guestEmail = GUEST_MESSAGES.EMAIL;
  return errors;
}
