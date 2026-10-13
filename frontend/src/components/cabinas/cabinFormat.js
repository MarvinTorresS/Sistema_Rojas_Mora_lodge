/**
 * Utilidades de fecha y moneda de la pantalla de cabinas.
 *
 * Todas las fechas viajan como texto "AAAA-MM-DD" (igual que en el
 * backend). Para operar con ellas se interpretan en UTC a medianoche: así
 * sumar días o contar noches nunca se corre por la zona horaria del
 * navegador (el clásico bug de "me sale un día menos").
 */
const HOTEL_TIME_ZONE = 'America/Costa_Rica';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toUtcDate = (dateOnly) => new Date(`${dateOnly}T00:00:00Z`);

// "AAAA-MM-DD" de HOY en la zona del hotel (no la del navegador).
export function todayInHotel() {
  return new Date().toLocaleDateString('en-CA', { timeZone: HOTEL_TIME_ZONE });
}

export function addDays(dateOnly, days) {
  const date = toUtcDate(dateOnly);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function countNights(checkInDate, checkOutDate) {
  return Math.round((toUtcDate(checkOutDate) - toUtcDate(checkInDate)) / MS_PER_DAY);
}

// Fechas de cada NOCHE de la estadía: de la entrada al día antes de la salida.
export function stayNightDates(checkInDate, checkOutDate) {
  const nights = Math.max(countNights(checkInDate, checkOutDate), 0);
  return Array.from({ length: nights }, (_, i) => addDays(checkInDate, i));
}

const weekdayFormatter = new Intl.DateTimeFormat('es-CR', { weekday: 'short', timeZone: 'UTC' });
const monthFormatter = new Intl.DateTimeFormat('es-CR', { month: 'short', timeZone: 'UTC' });
// Intl a veces agrega punto ("mié.", "oct.") según el navegador: se quita.
const clean = (text) => text.replace(/\./g, '').toLowerCase();

export const weekdayShort = (dateOnly) => clean(weekdayFormatter.format(toUtcDate(dateOnly)));
export const monthShort = (dateOnly) => clean(monthFormatter.format(toUtcDate(dateOnly)));
export const dayOfMonth = (dateOnly) => toUtcDate(dateOnly).getUTCDate();

// "14 oct"
export const formatDayMonth = (dateOnly) => `${dayOfMonth(dateOnly)} ${monthShort(dateOnly)}`;
// "mié 14 oct"
export const formatShortDate = (dateOnly) => `${weekdayShort(dateOnly)} ${formatDayMonth(dateOnly)}`;
// "mié 14 oct 2026"
export const formatLongDate = (dateOnly) => `${formatShortDate(dateOnly)} ${dateOnly.slice(0, 4)}`;

const sameMonth = (a, b) => a.slice(0, 7) === b.slice(0, 7);

// "12 – 18 oct" (o "28 sep – 4 oct" si cruza de mes)
export function formatDayRange(from, to, separator = '–') {
  return sameMonth(from, to)
    ? `${dayOfMonth(from)} ${separator} ${dayOfMonth(to)} ${monthShort(to)}`
    : `${formatDayMonth(from)} ${separator} ${formatDayMonth(to)}`;
}

// "mié 14 → vie 16 oct"
export function formatWeekdayRange(from, to) {
  return sameMonth(from, to)
    ? `${weekdayShort(from)} ${dayOfMonth(from)} → ${weekdayShort(to)} ${dayOfMonth(to)} ${monthShort(to)}`
    : `${formatShortDate(from)} → ${formatShortDate(to)}`;
}

const colonesFormatter = new Intl.NumberFormat('es-CR', {
  style: 'currency', currency: 'CRC', maximumFractionDigits: 0,
});
export const formatColones = (amount) => colonesFormatter.format(amount);

export const pluralize = (count, singular, plural) => (count === 1 ? singular : plural);

// "Laura Méndez Solís" -> "L. Méndez"
export function shortGuestName(fullName = '') {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[1]}` : parts[0];
}
