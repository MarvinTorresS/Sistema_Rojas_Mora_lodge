import { ChevronLeft, ChevronRight } from 'lucide-react';

const options = [{ id: 'day', label: 'Reservas del día' }, { id: 'all', label: 'Todas las reservas' }];

export default function FieldListSwitch({ value, onChange }) {
  const toggle = () => onChange(value === 'day' ? 'all' : 'day');
  function handleKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'day' : event.key === 'End' ? 'all' : value === 'day' ? 'all' : 'day';
    onChange(next);
    event.currentTarget.querySelector(`#field-tab-${next}`)?.focus();
  }
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <button type="button" aria-label="Ver listado anterior" onClick={toggle} className="rounded-full p-2 text-primary-800 transition-colors hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary-600"><ChevronLeft size={20} /></button>
      <div role="tablist" aria-label="Listado de reservas de cancha" onKeyDown={handleKey} className="inline-flex rounded-full border border-line bg-white p-1 shadow-sm">
        {options.map((option) => <button key={option.id} id={`field-tab-${option.id}`} role="tab" type="button" aria-selected={value === option.id} aria-controls={`field-panel-${option.id}`} tabIndex={value === option.id ? 0 : -1} onClick={() => onChange(option.id)} className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors duration-200 sm:text-sm motion-reduce:transition-none ${value === option.id ? 'bg-primary-800 text-white shadow-sm' : 'text-muted hover:bg-primary-50 hover:text-primary-900'}`}>{option.label}</button>)}
      </div>
      <button type="button" aria-label="Ver listado siguiente" onClick={toggle} className="rounded-full p-2 text-primary-800 transition-colors hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary-600"><ChevronRight size={20} /></button>
    </div>
  );
}
