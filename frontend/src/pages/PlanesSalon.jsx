import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, RotateCw, TriangleAlert } from 'lucide-react';
import { createEventHallPlan, listEventHallPlans } from '../services/planesSalonService';
import Notice from '../components/common/Notice.jsx';
import PlanCard from '../components/planes/PlanCard.jsx';
import PlanForm from '../components/planes/PlanForm.jsx';
import { ERROR_CODES, INITIAL_FORM, MESSAGES } from '../components/planes/planesConfig';
import { buildPlanPayload, hoursLabel, validatePlanForm } from '../components/planes/planesFormat';

/**
 * Planes de precios del salón — HU-008 (registrar) y HU-009 (consultar),
 * Sprint 2.
 *
 * Arquitectura (la misma de TarifasCabina y ExtenderHospedaje):
 *  - Esta página es el ÚNICO componente con estado y la única que habla con
 *    el servicio. PlanCard y PlanForm (components/planes/) solo pintan lo
 *    que reciben y avisan eventos.
 *  - La lista viene del backend: un plan nuevo aparece solo, no hay ninguno
 *    escrito en el código.
 *  - La pantalla NO decide si un plan vale: lo revisa el backend (nombre
 *    repetido, campos obligatorios). La revisión de aquí (validatePlanForm)
 *    solo ahorra un viaje a la red.
 *
 * Flujo:
 *   HU-009: se ven todos los planes; los filtros por duración dejan ver solo
 *           los de esas horas (CA-2: sin planes para ese horario, aviso).
 *   HU-008: "Nuevo plan" abre el formulario en la misma pantalla; al guardar
 *           el plan queda disponible de inmediato para las reservas (CA-1).
 *
 * TODO (Sprint 5, roles): HU-008 es del Administrador; cuando existan los
 * roles, mostrar "Nuevo plan" solo a ese rol (HU-009 la ven los dos).
 */
function PlanesSalon() {
  // ?plan=<id>: llegada desde "Más información" en la reserva del salón; ese
  // plan se resalta y se lleva a la vista.
  const [searchParams] = useSearchParams();
  const highlightedId = Number(searchParams.get('plan')) || null;
  const [listState, setListState] = useState({
    status: 'loading', plans: [], total: 0, totalWithoutFilters: 0, availableHours: [], message: '',
  });
  const [hoursFilter, setHoursFilter] = useState(null); // null = todos
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [createdPlan, setCreatedPlan] = useState(null); // HU-008 CA-1

  // --- Carga de la lista -------------------------------------------------
  // `cancelled` descarta la respuesta de una consulta vieja si ya hay otra en
  // camino (el usuario cambió de filtro): sin esto, una respuesta lenta
  // podría pisar a una más nueva.
  useEffect(() => {
    let cancelled = false;
    setListState((current) => ({ ...current, status: 'loading', message: '' }));
    listEventHallPlans(hoursFilter ? { hours: hoursFilter } : {})
      .then(({ data, meta }) => {
        if (cancelled) return;
        setListState({
          status: 'success',
          plans: data,
          total: meta.total,
          totalWithoutFilters: meta.totalWithoutFilters,
          availableHours: meta.availableHours,
          message: '',
        });
      })
      .catch((error) => {
        if (!cancelled) setListState((current) => ({ ...current, status: 'error', message: error.message }));
      });
    return () => { cancelled = true; };
  }, [hoursFilter, reloadKey]);

  // Con ?plan=, al llegar la lista se lleva a la vista el plan consultado.
  useEffect(() => {
    if (!highlightedId || listState.status !== 'success') return;
    document.getElementById(`plan-${highlightedId}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [highlightedId, listState.status, listState.plans]);

  // --- Formulario --------------------------------------------------------
  function openForm() {
    setCreatedPlan(null);
    setForm(INITIAL_FORM);
    setErrors({});
    setFormError('');
    setFormOpen(true);
  }

  // Cancelar cierra el formulario sin llamar al backend.
  function closeForm() {
    setFormOpen(false);
    setErrors({});
    setFormError('');
  }

  function handleChange(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    // Al corregir un campo se quita su error: no sigue en rojo algo que ya
    // se está arreglando.
    setErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
    setFormError('');
  }

  async function handleSubmit() {
    // HU-008 CA-3: se marcan TODOS los campos pendientes a la vez.
    const found = validatePlanForm(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setFormError('');
      return;
    }

    setIsSaving(true);
    setFormError('');
    try {
      const plan = await createEventHallPlan(buildPlanPayload(form));
      // CA-1: se cierra el formulario, se avisa y la lista muestra el plan.
      setCreatedPlan(plan);
      setFormOpen(false);
      setForm(INITIAL_FORM);
      setErrors({});
      setHoursFilter(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      if (error.code === ERROR_CODES.DUPLICATE_PLAN_NAME) {
        // CA-2: el mensaje va junto al campo del nombre y no se guarda nada.
        setErrors({ planName: error.fieldErrors.planName || error.message });
      } else if (Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
      } else {
        setFormError(error.message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  // --- Render ------------------------------------------------------------
  const { status, plans, availableHours, totalWithoutFilters } = listState;
  const isFirstLoad = status === 'loading' && plans.length === 0 && totalWithoutFilters === 0;
  const showFilters = availableHours.length > 1 || hoursFilter !== null;
  const nothingAtAll = status === 'success' && totalWithoutFilters === 0;
  const highlightedMissing = highlightedId !== null && status === 'success' && hoursFilter === null
    && !plans.some((plan) => plan.planId === highlightedId);
  const nothingForHours = status === 'success' && plans.length === 0 && totalWithoutFilters > 0;

  return (
    <div className="flex min-h-full w-full flex-col gap-4 p-6 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/salon" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft size={15} />
            Volver al salón
          </Link>
          <h2 className="mt-3 font-display text-2xl font-semibold text-primary-900">Planes de precios del salón</h2>
          <p className="text-sm text-muted">Consultá las opciones tarifarias o registrá un plan nuevo.</p>
        </div>
        {!formOpen && (
          <button
            type="button" onClick={openForm}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] bg-primary-700 px-4 text-sm font-semibold text-white shadow-card transition-colors hover:bg-primary-800"
          >
            <Plus size={16} aria-hidden="true" />
            Nuevo plan
          </button>
        )}
      </div>

      {createdPlan && (
        <Notice tone="success" title={MESSAGES.SUCCESS}>
          {createdPlan.planName} · {hoursLabel(createdPlan.hours)}
        </Notice>
      )}

      {formOpen && (
        <PlanForm
          form={form} errors={errors} formError={formError} isSaving={isSaving}
          onChange={handleChange} onSubmit={handleSubmit} onCancel={closeForm}
        />
      )}

      {showFilters && (
        <div role="group" aria-label="Filtrar por duración" className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted">Duración</span>
          {[null, ...availableHours].map((hours) => {
            const selected = hours === hoursFilter;
            return (
              <button
                key={hours ?? 'all'} type="button" aria-pressed={selected}
                onClick={() => setHoursFilter(hours)}
                className={`min-h-[36px] rounded-full border px-3.5 text-sm font-semibold transition-colors ${
                  selected
                    ? 'border-primary-600 bg-primary-50 text-primary-800'
                    : 'border-line bg-white text-muted hover:border-primary-400'
                }`}
              >
                {hours === null ? 'Todos' : hoursLabel(hours)}
              </button>
            );
          })}
        </div>
      )}

      {highlightedMissing && !nothingAtAll && (
        <Notice tone="info" title="No encontramos el plan que buscabas.">
          Puede que ya no exista. Estos son los planes registrados.
        </Notice>
      )}

      {status === 'error' && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-coral-400 bg-coral-50 px-3 py-2.5 text-[13px] text-coral-600">
          <TriangleAlert size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{listState.message}</span>
          <button
            type="button" onClick={() => setReloadKey((key) => key + 1)}
            className="inline-flex items-center gap-1 font-semibold hover:underline"
          >
            <RotateCw size={13} aria-hidden="true" /> Reintentar
          </button>
        </div>
      )}

      <div aria-busy={status === 'loading'}>
        {isFirstLoad && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-[84px] animate-pulse rounded-2xl border border-line bg-surface" />
            ))}
          </div>
        )}

        {plans.length > 0 && (
          <ul
            aria-label="Planes de precios"
            className={`grid items-stretch gap-4 transition-opacity duration-300 lg:grid-cols-2 ${status === 'loading' ? 'opacity-60' : 'opacity-100'}`}
          >
            {plans.map((plan) => <PlanCard key={plan.planId} plan={plan} highlighted={plan.planId === highlightedId} />)}
          </ul>
        )}

        {/* HU-009 CA-2: filtro por horas sin planes. */}
        {nothingForHours && (
          <Notice tone="info" title={MESSAGES.NO_PLANS_FOR_HOURS}>
            <button
              type="button" onClick={() => setHoursFilter(null)}
              className="font-semibold underline"
            >
              Ver todos los planes
            </button>
          </Notice>
        )}

        {nothingAtAll && (
          <Notice tone="info" title={MESSAGES.NO_PLANS_AT_ALL}>
            {!formOpen && (
              <button type="button" onClick={openForm} className="font-semibold underline">
                Registrar el primer plan
              </button>
            )}
          </Notice>
        )}
      </div>
    </div>
  );
}

export default PlanesSalon;
