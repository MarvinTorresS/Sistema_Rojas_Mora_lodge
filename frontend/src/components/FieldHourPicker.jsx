import { FIELD_HOURLY_PRICE } from '../utils/fieldSlots';
import { Check } from 'lucide-react';

export default function FieldHourPicker({ slots, selectedHours, onSelect, disabled, loading, error }) {
  return <div className="bmb-hours-section">
    <div className="bmb-step-row"><div className="bmb-step"><span>02</span><h2>Encuentra tu hora</h2></div><span className="bmb-rate">₡{new Intl.NumberFormat('es-CR').format(FIELD_HOURLY_PRICE)} / hora</span></div>
    <p className="bmb-helper">Elige una hora o varias consecutivas. El último bloque termina a las 9:00 p. m.</p>
    {loading && <p role="status" className="bmb-helper">Consultando disponibilidad…</p>}
    <div className="bmb-hours" aria-label="Horarios de La Bombonera" aria-busy={loading}>
      {slots.map((slot) => {
        const selected = selectedHours.includes(slot.hour);
        const state = slot.status === 'past' ? 'Hora pasada' : slot.status === 'pending' ? 'Pendiente' : slot.status === 'occupied' ? 'Ocupada' : selected ? 'Seleccionada' : 'Disponible';
        return <button key={slot.hour} type="button" className={`bmb-hour ${selected ? 'is-selected' : ''}`} aria-label={`${slot.hourLabel} ${slot.status === 'available' ? selected ? 'Seleccionada' : 'Reservar' : state}`} aria-pressed={selected} disabled={disabled || loading || slot.status !== 'available'} onClick={() => onSelect(slot.hour)} title={slot.clientName ? `${slot.clientName} · ${slot.hourLabel}` : slot.hourLabel}><span className="bmb-hour-top"><strong>{slot.hour - 12}:00</strong><i aria-hidden="true">{selected && <Check size={11} />}</i></span><small>hasta las {slot.hour + 1 - 12}:00 p. m.</small><span className="bmb-hour-status"><i />{state}</span></button>;
      })}
    </div>
    {error && <p role="alert" className="bmb-selection-error">{error}</p>}
    <div className="bmb-legend"><span><i />Disponible</span><span><i className="chosen" />Tu selección</span><span><i className="busy" />No disponible</span></div>
  </div>;
}
