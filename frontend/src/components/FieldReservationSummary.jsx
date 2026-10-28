import { FIELD_HOURLY_PRICE } from '../utils/fieldSlots';
import { ArrowRight } from 'lucide-react';
import photo from '../assets/cancha-techada-mejorada.png';
const time = (hour) => `${hour - 12}:00 p. m.`;

export default function FieldReservationSummary({ date, hours, onContinue, disabled, formOpen }) {
  const formattedDate = new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00-06:00`));
  return <section className="bmb-summary" aria-label="Resumen de la reserva">
    <p className="bmb-kicker">Tu próxima reserva</p>
    <div className="bmb-venue"><img src={photo} alt="" /><div><strong>La Bombonera</strong><small>Cancha sintética · Techada</small></div></div>
    <dl><div><dt>Fecha</dt><dd>{formattedDate}</dd></div><div><dt>Horario</dt><dd>{hours.length ? `${time(Math.min(...hours))} – ${time(Math.max(...hours) + 1)}` : 'Por elegir'}</dd></div><div><dt>Duración</dt><dd>{hours.length ? `${hours.length} ${hours.length === 1 ? 'hora' : 'horas'}` : '—'}</dd></div><div><dt>Precio por hora</dt><dd>₡{new Intl.NumberFormat('es-CR').format(FIELD_HOURLY_PRICE)}</dd></div></dl>
    <div className="bmb-total" aria-live="polite"><span>Total estimado</span><strong>₡{new Intl.NumberFormat('es-CR').format(hours.length * FIELD_HOURLY_PRICE)}</strong></div>
    {!formOpen && <button type="button" className="bmb-continue" disabled={disabled || !hours.length} onClick={onContinue}><span>{hours.length ? 'Continuar con la reserva' : 'Selecciona tu horario'}</span><ArrowRight size={17} /></button>}
    <p className="bmb-helper">Puedes cambiar tu selección antes de registrar la reserva.</p>
  </section>;
}
