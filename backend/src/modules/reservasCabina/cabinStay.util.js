'use strict';

// Reglas de TIEMPO y MONTO de una estadia en cabina (Sprint 3 -- Marvin).
//
// Por que un archivo aparte del service: estas funciones no consultan la
// base ni lanzan errores de negocio; solo convierten fechas y calculan
// montos. Las usan HU-016 (registrar), el endpoint de disponibilidad y,
// mas adelante, HU-127 (extension de hospedaje). Tenerlas juntas y
// separadas del service (Responsabilidad Unica) evita que cada funcion
// nueva repita su propia version de "como se calcula una noche".

// --- Politica de horarios del hotel ---------------------------------
// Una cabina se reserva por NOCHES, pero la tabla bookings guarda
// DATETIME. Se convierte "fecha de entrada/salida" en datetime aplicando
// una hora fija de check-in y de check-out.
//
// Por que 15:00 / 11:00 y no 00:00 / 00:00: con horas distintas, un
// huesped puede salir a las 11:00 y OTRO entrar a las 15:00 el mismo dia
// sin que el sistema lo vea como solapamiento (bookingOverlap usa
// desigualdad estricta: termina 11:00 < empieza 15:00).
//
// Valores de arranque: ninguna HU los define. Estan en UN solo lugar
// para cambiarlos si el negocio (Jonathan Rojas Mora) pide otras horas.
const CHECK_IN_TIME = '15:00:00';
const CHECK_OUT_TIME = '11:00:00';

// Zona horaria del hotel. Sequelize no tiene `timezone` configurado, asi
// que guarda/lee en UTC. Sin zona explicita, "2026-10-12T15:00:00" se
// interpretaria en la zona de la MAQUINA donde corre el backend (en tu PC
// seria Costa Rica, en un servidor en UTC seria otra hora). Costa Rica no
// tiene horario de verano, asi que un offset fijo es seguro.
const HOTEL_TIME_ZONE = 'America/Costa_Rica';
const HOTEL_UTC_OFFSET = '-06:00';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "2026-10-12" + hora de politica -> Date en la zona del hotel.
function toHotelDatetime(dateOnly, time) {
  return new Date(`${dateOnly}T${time}${HOTEL_UTC_OFFSET}`);
}

// Date -> "AAAA-MM-DD" visto desde la zona del hotel. El locale 'en-CA'
// formatea justo como AAAA-MM-DD.
function toHotelDate(datetime) {
  return new Date(datetime).toLocaleDateString('en-CA', { timeZone: HOTEL_TIME_ZONE });
}

// Fecha de HOY en la zona del hotel, como "AAAA-MM-DD".
function todayInHotelTimeZone() {
  return toHotelDate(new Date());
}

// Noches entre dos fechas "AAAA-MM-DD". Se calcula en UTC sin horas para
// que el resultado sea un entero exacto de dias.
function countNights(checkInDate, checkOutDate) {
  const diff = Date.parse(`${checkOutDate}T00:00:00Z`) - Date.parse(`${checkInDate}T00:00:00Z`);
  return Math.round(diff / MS_PER_DAY);
}

// "2026-10-12" + 3 -> "2026-10-15" (acepta dias negativos).
function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Rango [inicio, fin) de UNA noche: de las 15:00 de esa fecha a las 11:00
// del dia siguiente. Sirve para pintar la tira de noches (agenda).
function nightRange(dateOnly) {
  return {
    start: toHotelDatetime(dateOnly, CHECK_IN_TIME),
    end: toHotelDatetime(addDays(dateOnly, 1), CHECK_OUT_TIME),
  };
}

// Monto de una estadia. Funcion AISLADA a proposito: hoy el esquema solo
// tiene un precio fijo por noche (cabin_details), pero HU-127 CA-3 habla
// de "tarifa diferente segun las fechas". Cuando exista una tarifa por
// fecha, solo cambia el cuerpo de ESTA funcion. Se redondea a 2 decimales
// (moneda) para no arrastrar errores de punto flotante.
function calculateStayCost({ nights, pricePerNight }) {
  return Math.round(nights * Number(pricePerNight) * 100) / 100;
}

// --- Regla de la TARIFA por noche (HU-128) ------------------------------
// Vive aqui, junto al calculo de montos, para que la use tanto el
// validator (forma del dato) como el service (ultima barrera) SIN repetir
// la regla: una sola fuente de verdad.
//
// Tope = el maximo que cabe en la columna DECIMAL(10,2) de la base. Tambien
// frena el error tipico de digitar un cero de mas.
const MAX_NIGHTLY_RATE = 99999999.99;
const INVALID_RATE_MESSAGE = 'La tarifa debe ser un monto mayor a cero';
const RATE_TOO_HIGH_MESSAGE = 'La tarifa no puede superar los 99 999 999,99 colones.';
const RATE_DECIMALS_MESSAGE = 'La tarifa admite como maximo 2 decimales.';

// Convierte lo que llegue (numero o texto numerico) a Number; NaN si no es
// un monto interpretable. No acepta booleanos, arreglos, objetos ni texto
// vacio: Number('') o Number(true) darian 0 o 1 "validos" por accidente.
function parseRateInput(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return Number.NaN;
}

// Devuelve el mensaje del PRIMER problema que tenga la tarifa, o null si es
// valida. Cubre el CA-2 de HU-128: vacia, cero, negativa o no numerica.
function getNightlyRateError(value) {
  const rate = parseRateInput(value);
  if (!Number.isFinite(rate) || rate <= 0) return INVALID_RATE_MESSAGE;
  if (rate > MAX_NIGHTLY_RATE) return RATE_TOO_HIGH_MESSAGE;
  if (Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-6) return RATE_DECIMALS_MESSAGE;
  return null;
}

// Tarifa ya validada -> Number con 2 decimales exactos.
function normalizeNightlyRate(value) {
  return Math.round(parseRateInput(value) * 100) / 100;
}

module.exports = {
  CHECK_IN_TIME,
  CHECK_OUT_TIME,
  HOTEL_TIME_ZONE,
  toHotelDatetime,
  toHotelDate,
  todayInHotelTimeZone,
  countNights,
  addDays,
  nightRange,
  calculateStayCost,
  MAX_NIGHTLY_RATE,
  INVALID_RATE_MESSAGE,
  getNightlyRateError,
  normalizeNightlyRate,
};
