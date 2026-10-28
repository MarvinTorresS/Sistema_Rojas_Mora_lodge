export const FIELD_HOURLY_PRICE = 18000;
export const OPENING_HOUR = 15;
export const CLOSING_HOUR = 21;
export const SLOT_DURATION_HOURS = 1;
const HOUR_MS = 60 * 60 * 1000;
const formatter = new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', hour: 'numeric', minute: '2-digit' });

export function slotToIsoRange(date, hour, duration = SLOT_DURATION_HOURS) {
  const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00-06:00`);
  return { startDatetime: start.toISOString(), endDatetime: new Date(start.getTime() + duration * HOUR_MS).toISOString() };
}

export function selectFieldHours(selected, hour, slots) {
  if (!slots.some((slot) => slot.hour === hour && slot.status === 'available')) return selected;
  if (selected.includes(hour)) {
    return selected.length === 1 ? [] : hour === Math.min(...selected) || hour === Math.max(...selected) ? selected.filter((value) => value !== hour) : [hour];
  }
  const first = Math.min(hour, ...selected), last = Math.max(hour, ...selected);
  const next = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  if (next.some((value) => !slots.some((slot) => slot.hour === value && slot.status === 'available'))) throw new Error('Hay un horario no disponible en medio. Elegí horas consecutivas libres.');
  return next;
}

export function buildSlotsFromReservations(reservations, date, now = new Date()) {
  return Array.from({ length: CLOSING_HOUR - OPENING_HOUR }, (_, index) => {
    const hour = OPENING_HOUR + index;
    const { startDatetime, endDatetime } = slotToIsoRange(date, hour);
    const start = new Date(startDatetime);
    const end = new Date(endDatetime);
    // Comparar intervalos protege tambien reservas existentes de dos horas
    // o con minutos: no basta buscar la misma hora de inicio.
    const reservation = reservations.find((item) => new Date(item.startDatetime) < end && new Date(item.endDatetime) > start);
    return {
      hour,
      hourLabel: `${formatter.format(start)} – ${formatter.format(end)}`,
      status: reservation ? (reservation.estado === 'Pendiente' ? 'pending' : 'occupied') : start <= now ? 'past' : 'available',
      ...(reservation ? { clientName: reservation.cliente, bookingId: reservation.id } : {}),
    };
  });
}
