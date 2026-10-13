import { Home, Pencil } from 'lucide-react';
import { formatColones, pluralize } from '../cabinas/cabinFormat';
import { STATUS_BADGES } from './rateConfig';
import RateEditor from './RateEditor.jsx';

/**
 * Una cabina con su tarifa vigente y, si se está editando, su formulario.
 *
 * Es de presentación. `editor` trae el estado del formulario SOLO cuando
 * esta fila es la que se edita (la página garantiza que sea una a la vez);
 * si es null, la fila se ve en reposo.
 */
function CabinRateRow({ cabin, editor, isLocked, onEdit }) {
  const badge = STATUS_BADGES[cabin.status];
  const isEditing = Boolean(editor);

  return (
    <li className={`overflow-hidden rounded-2xl border bg-white shadow-card transition-colors ${isEditing ? 'border-primary-600' : 'border-line'}`}>
      <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Home size={20} strokeWidth={1.8} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1 basis-40">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold text-ink">{cabin.name}</h3>
            {badge && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.tone}`}>{badge.label}</span>
            )}
          </div>
          <p className="text-[13px] text-muted">
            Capacidad: {cabin.capacity} {pluralize(cabin.capacity, 'persona', 'personas')}
          </p>
        </div>

        <div className="text-right">
          <p className="text-lg font-bold text-primary-900">{formatColones(cabin.pricePerNight)}</p>
          <p className="text-xs text-faint">por noche</p>
        </div>

        <button
          type="button" onClick={() => onEdit(cabin)} disabled={isEditing || isLocked}
          aria-label={`Editar tarifa de ${cabin.name}`}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-line bg-white px-4 text-sm font-semibold text-primary-800 transition-colors hover:border-primary-400 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil size={15} aria-hidden="true" />
          Editar tarifa
        </button>
      </div>

      {isEditing && (
        <RateEditor
          cabinId={cabin.resourceId} currentRate={cabin.pricePerNight}
          draft={editor.draft} error={editor.error} isSaving={editor.isSaving}
          onChange={editor.onChange} onSave={editor.onSave} onCancel={editor.onCancel}
        />
      )}
    </li>
  );
}

export default CabinRateRow;
