// Horario del salon de eventos. El salon se reserva POR DIA (como un hotel):
// hay una hora de entrada y una de salida, iguales para todos los clientes,
// y nunca se cruzan dos clientes el mismo dia (se limpia entre reservas).
//
// Las horas todavia no estan definidas por el negocio. El servidor es quien
// las fija (GET /api/hall-bookings/schedule); estos valores solo se usan como
// respaldo mientras responde o si no responde.
export const HALL_DEFAULT_SCHEDULE = { checkInTime: '15:00', checkOutTime: '20:00' };

// Anticipacion que admite el servidor: desde manana (minimo un dia antes, no se
// reserva para hoy) hasta 30 dias (MIN/MAX_ADVANCE_BOOKING_DAYS).
export const HALL_MIN_ADVANCE_DAYS = 1;
export const HALL_MAX_ADVANCE_DAYS = 30;

const pad = (value) => String(value).padStart(2, '0');

// "15:00" -> "3:00 p. m."
export function formatClock(value) {
  if (!value) return '';
  const [hour, minute] = String(value ?? '').split(':').map(Number);
  if (!Number.isFinite(hour)) return '';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${pad(Number.isFinite(minute) ? minute : 0)} ${hour < 12 ? 'a. m.' : 'p. m.'}`;
}

// yyyy-mm-dd de hoy (o de hoy + days) en horario local. No usa toISOString
// porque eso es UTC y a ciertas horas daria el dia siguiente.
export function localIsoDate(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
