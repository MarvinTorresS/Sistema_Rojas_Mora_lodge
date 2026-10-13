import { Check, Clock, Info, Percent, Plus } from 'lucide-react';
import { formatColones } from '../cabinas/cabinFormat';
import { depositLabel, hoursLabel, readServices } from './planesFormat';

/**
 * Un plan de precios del salón. Es de presentación: solo pinta lo que recibe.
 *
 * Dos zonas: arriba lo esencial (nombre, duración, anticipo y precio) y
 * debajo, separado por una línea, "Qué incluye" con cada servicio en su
 * propia fila con una marca de visto. Si el plan no tiene servicios, lo dice
 * con todas las letras en vez de dejar el espacio vacío.
 *
 * `highlighted` marca el plan al que se llegó desde "Más información" en la
 * reserva del salón: borde verde y una etiqueta. Cada tarjeta tiene su id
 * (plan-<id>) para poder llevar la vista hasta ella.
 */
function PlanCard({ plan, highlighted = false }) {
  const { services, declaredNone } = readServices(plan.includedServices);
  const hasServices = services.length > 0;

  return (
    <li
      id={`plan-${plan.planId}`}
      aria-current={highlighted ? 'true' : undefined}
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-card transition-colors ${
        highlighted ? 'border-primary-600 ring-1 ring-primary-600' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-start gap-4 px-5 py-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Clock size={22} strokeWidth={1.8} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1 basis-48">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold leading-tight text-ink">{plan.planName}</h3>
            {highlighted && (
              <span className="rounded-full bg-primary-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                Plan consultado
              </span>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-[13px] font-semibold text-teal-600">
              <Clock size={13} aria-hidden="true" />
              {hoursLabel(plan.hours)}
            </span>
            {plan.extraHourPrice != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-[13px] font-semibold text-primary-800">
                <Plus size={13} aria-hidden="true" />
                <span>Hora extra {formatColones(plan.extraHourPrice)}</span>
              </span>
            )}
            {plan.depositPercentage !== null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[13px] font-semibold text-amber-600">
                <Percent size={13} aria-hidden="true" />
                <span>Anticipo {depositLabel(plan.depositPercentage)}</span>
              </span>
            )}
          </div>
        </div>

        <div className="sm:ml-auto sm:text-right">
          <p className="text-2xl font-bold leading-tight text-primary-900">{formatColones(plan.price)}</p>
          <p className="text-sm text-muted">por evento</p>
        </div>
      </div>

      <div className="mt-auto border-t border-line bg-surface px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Qué incluye</p>
        {hasServices && (
          <ul aria-label={`Servicios incluidos en ${plan.planName}`} className="mt-2.5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {services.map((service) => (
              <li key={service} className="flex items-start gap-2 text-sm font-medium text-ink">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-200 text-primary-900">
                  <Check size={12} strokeWidth={3} aria-hidden="true" />
                </span>
                {service}
              </li>
            ))}
          </ul>
        )}
        {!hasServices && (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Info size={15} className="shrink-0" aria-hidden="true" />
            {declaredNone ? 'Este plan no incluye servicios adicionales.' : 'Sin servicios registrados'}
          </p>
        )}
      </div>
    </li>
  );
}

export default PlanCard;
