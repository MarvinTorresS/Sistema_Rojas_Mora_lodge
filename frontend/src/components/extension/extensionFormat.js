import { pluralize } from '../cabinas/cabinFormat';

/**
 * Textos auxiliares de la pantalla de extensión. Reutilizan las utilidades
 * de fecha y moneda de cabinFormat.js; aquí solo va lo propio de esta
 * pantalla.
 */

// "Laura Méndez Solís" -> "LM"
export function guestInitials(fullName = '') {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

// 1 -> "1 noche", 3 -> "3 noches"
export function nightsLabel(count) {
  return `${count} ${pluralize(count, 'noche', 'noches')}`;
}

/**
 * ¿Qué aclaración de tarifa corresponde mostrar junto al recibo?
 *
 * La regla de negocio (HU-127 CA-3 y HU-128 CA-3): las noches YA
 * registradas conservan su precio y solo las noches NUEVAS se cobran con
 * la tarifa actual. Esta función solo decide el TEXTO que explica eso:
 *  - 'estimated': la reserva es anterior al registro de montos y su total
 *                 anterior se estimó con la tarifa actual.
 *  - 'differs':   el promedio por noche de lo ya registrado no coincide con
 *                 la tarifa actual, o sea que la tarifa cambió desde que se
 *                 reservó (o desde una extensión anterior).
 *  - 'same':      nada cambió; basta la aclaración genérica.
 *
 * No se muestra la tarifa original como número porque tras varias
 * extensiones ya no es una sola: solo existe el total registrado.
 *
 * @param {{ previousTotal: number, nightlyRate: number, previousTotalIsEstimated: boolean }} amounts
 * @param {number} originalNights  noches de la estadía antes de extender
 * @returns {'estimated' | 'differs' | 'same'}
 */
export function getRateNoteKind(amounts, originalNights) {
  if (amounts.previousTotalIsEstimated) return 'estimated';
  if (originalNights > 0) {
    const averagePerNight = amounts.previousTotal / originalNights;
    if (Math.abs(averagePerNight - amounts.nightlyRate) >= 1) return 'differs';
  }
  return 'same';
}
