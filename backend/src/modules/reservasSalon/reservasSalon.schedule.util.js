'use strict';

// Horario del salon de eventos.
//
// El salon se reserva POR DIA, como un hotel: cada reserva tiene una hora
// de llegada (entrada) y una de salida, y el horario es el mismo para todos
// los clientes. No se reservan horas sueltas ni se pueden cruzar clientes
// distintos el mismo dia (el salon se limpia entre una reserva y otra).
//
// Las horas todavia no estan definidas por el negocio: 3:00 p. m. a 8:00 p. m.
// son valores por defecto. Este es el UNICO lugar que hay que cambiar cuando
// se definan (el frontend las pide a GET /api/hall-bookings/schedule).
const HALL_CHECK_IN = { hour: 15, minute: 0 };
const HALL_CHECK_OUT = { hour: 20, minute: 0 };

const pad = (value) => String(value).padStart(2, '0');
const timeLabel = ({ hour, minute }) => `${pad(hour)}:${pad(minute)}`;

function parseIsoDate(isoDate) {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  return { year, month, day };
}

// Ventana de la reserva de un dia (yyyy-mm-dd, hora LOCAL del servidor, igual
// que el listado de la cancha). `dayStart`/`dayEnd` cubren el dia completo y se
// usan para detectar cualquier otra reserva que toque ese dia.
function hallDayWindow(isoDate) {
  const { year, month, day } = parseIsoDate(isoDate);
  return {
    start: new Date(year, month - 1, day, HALL_CHECK_IN.hour, HALL_CHECK_IN.minute, 0, 0),
    end: new Date(year, month - 1, day, HALL_CHECK_OUT.hour, HALL_CHECK_OUT.minute, 0, 0),
    dayStart: new Date(year, month - 1, day, 0, 0, 0, 0),
    dayEnd: new Date(year, month - 1, day + 1, 0, 0, 0, 0),
  };
}

function localIsoDate(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function hallSchedule() {
  return { checkInTime: timeLabel(HALL_CHECK_IN), checkOutTime: timeLabel(HALL_CHECK_OUT) };
}

module.exports = {
  HALL_CHECK_IN, HALL_CHECK_OUT, hallDayWindow, localIsoDate, hallSchedule,
};
