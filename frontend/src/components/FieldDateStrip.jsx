import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

export function shiftFieldDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const format = (value, options) => new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', ...options }).format(new Date(`${value}T12:00:00-06:00`));

export default function FieldDateStrip({ value, onChange, today, disabled = false }) {
  const [start, setStart] = useState(value);
  const track = useRef(null);
  const direction = useRef(0);
  useLayoutEffect(() => {
    const node = track.current;
    const position = () => {
      const step = node.firstElementChild.children[1].offsetLeft - node.firstElementChild.children[0].offsetLeft;
      const days = Math.round((new Date(`${start}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000);
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const left = days * step;
      if (node.scrollTo) node.scrollTo({ left, behavior: direction.current && !reduce ? 'smooth' : 'instant' });
      else node.scrollLeft = left;
      direction.current = 0;
    };
    position();
    let width = node.clientWidth;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (node.clientWidth !== width) { width = node.clientWidth; position(); }
    }) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [start, today]);
  const move = (amount) => {
    direction.current = amount;
    setStart((date) => shiftFieldDate(date, amount));
  };
  const max = shiftFieldDate(today, 30);
  useEffect(() => { setStart((previous) => value < previous || value > shiftFieldDate(previous, 6) ? value : previous); }, [value]);
  const change = (date) => { if (date >= today && date <= max) onChange(date); };
  return (
    <div className="bmb-dates">
      <div className="bmb-step-row"><div className="bmb-step"><span>01</span><h2>Elige tu día</h2></div>
        <label className="bmb-calendar"><CalendarDays size={15} /><span>{format(start, { month: 'long', year: 'numeric' })}</span><input type="date" aria-label="Fecha" value={value} min={today} max={max} disabled={disabled} onChange={(event) => change(event.target.value)} /></label>
      </div>
      <div className="bmb-date-navigation">
        <button type="button" className="bmb-date-arrow" aria-label="Ver días anteriores" disabled={disabled || start <= today} onClick={() => move(-1)}><ChevronLeft size={19} /></button>
        <div className="bmb-week-viewport" aria-label="Seleccionar día" ref={track}><div className="bmb-week">
          {Array.from({ length: 37 }, (_, index) => shiftFieldDate(today, index)).map((date) => <button aria-hidden={date < start || date > shiftFieldDate(start, 6) ? true : undefined} tabIndex={date < start || date > shiftFieldDate(start, 6) ? -1 : undefined} key={date} type="button" className="bmb-day" disabled={disabled || date < today || date > max} aria-pressed={date === value} aria-label={format(date, { weekday: 'long', day: 'numeric', month: 'long' })} onClick={() => change(date)}><span>{format(date, { weekday: 'short' }).replace('.', '')}</span><strong>{format(date, { day: 'numeric' })}</strong><small>{date === today ? 'Hoy' : date === shiftFieldDate(today, 1) ? 'Mañana' : format(date, { month: 'short' }).replace('.', '')}</small></button>)}
        </div></div>
        <button type="button" className="bmb-date-arrow" aria-label="Ver días siguientes" disabled={disabled || shiftFieldDate(start, 6) >= max} onClick={() => move(1)}><ChevronRight size={19} /></button>
      </div>
      {start > today && <button type="button" className="bmb-today" disabled={disabled} onClick={() => { setStart(today); change(today); }}>Volver a hoy</button>}
    </div>
  );
}
