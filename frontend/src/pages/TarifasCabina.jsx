import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCw } from 'lucide-react';
import { listCabinRates, updateCabinRate } from '../services/reservasCabinaService';
import Notice from '../components/common/Notice.jsx';
import CabinRateRow from '../components/rates/CabinRateRow.jsx';
import { MESSAGES } from '../components/rates/rateConfig';
import { formatRateTransition, parseRateInput } from '../components/rates/rateFormat';
import { formatColones } from '../components/cabinas/cabinFormat';

/**
 * Tarifas de cabinas — HU-128 (Marvin, Sprint 3), rol Administrador.
 *
 * Arquitectura (la misma de ReservasCabina y ExtenderHospedaje):
 *  - Esta página es el ÚNICO componente con estado y la única que habla con
 *    el servicio. CabinRateRow y RateEditor (components/rates/) solo pintan
 *    lo que reciben y avisan eventos.
 *  - La lista de cabinas viene del backend: una cabina nueva en la base
 *    aparece sola, no hay ninguna escrita en el código.
 *  - La pantalla NO decide si una tarifa vale: la revisa el backend (CA-2).
 *    La revisión de aquí (parseRateInput) solo ahorra un viaje a la red.
 *
 * Una sola cabina se edita a la vez (`editing`), así hay un único
 * formulario abierto y no queda ambiguo qué se está guardando.
 */
function TarifasCabina() {
  const [listState, setListState] = useState({ status: 'loading', cabins: [], message: '' });
  const [reloadKey, setReloadKey] = useState(0);
  // { resourceId, draft, error, isSaving } o null cuando nada se edita.
  const [editing, setEditing] = useState(null);
  // Resultado del último guardado (CA-1) o error general (cabina inexistente,
  // red caída...). Los errores de la TARIFA van dentro del formulario.
  const [feedback, setFeedback] = useState(null);

  // --- Carga de la lista -----------------------------------------------
  // `cancelled` evita pintar una respuesta que llegó tarde si la pantalla ya
  // cambió (se desmontó o se pidió una recarga más nueva).
  useEffect(() => {
    let cancelled = false;
    setListState((current) => ({ ...current, status: 'loading' }));
    listCabinRates()
      .then((cabins) => { if (!cancelled) setListState({ status: 'success', cabins, message: '' }); })
      .catch((error) => {
        if (!cancelled) setListState((current) => ({ ...current, status: 'error', message: error.message }));
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // --- Acciones del formulario -------------------------------------------
  const handleEdit = useCallback((cabin) => {
    setFeedback(null);
    setEditing({
      resourceId: cabin.resourceId, draft: String(cabin.pricePerNight), error: null, isSaving: false,
    });
  }, []);

  // CA-4: cancelar cierra el formulario sin llamar al backend.
  const handleCancel = useCallback(() => setEditing(null), []);

  const handleChange = useCallback((draft) => {
    setEditing((current) => (current ? { ...current, draft, error: null } : current));
  }, []);

  async function handleSave() {
    if (!editing || editing.isSaving) return;
    const { resourceId } = editing;

    // CA-2 al instante: vacía o cero se avisa sin ir a la red.
    const parsed = parseRateInput(editing.draft);
    if (parsed.error) {
      setEditing({ ...editing, error: parsed.error });
      return;
    }

    setEditing({ ...editing, isSaving: true, error: null });
    try {
      const result = await updateCabinRate(resourceId, parsed.value);
      // CA-1: se reemplaza la cabina con lo que devolvió el backend (la
      // fuente de verdad), sin recargar toda la lista.
      setListState((current) => ({
        ...current,
        cabins: current.cabins.map((cabin) => (cabin.resourceId === resourceId ? { ...cabin, ...result.cabin } : cabin)),
      }));
      setFeedback({ kind: result.changed ? 'saved' : 'unchanged', result });
      setEditing(null);
    } catch (error) {
      if (error.status === 422) {
        // Tarifa rechazada por el backend (CA-2): se muestra en el campo.
        setEditing((current) => ({
          ...current, isSaving: false, error: error.fieldErrors?.pricePerNight || error.message,
        }));
      } else {
        // Otro problema (cabina inexistente, sin conexión): aviso general y
        // se conserva lo escrito para reintentar.
        setEditing((current) => ({ ...current, isSaving: false }));
        setFeedback({ kind: 'error', message: error.message });
      }
    }
  }

  // --- Render --------------------------------------------------------------
  const { status, cabins, message } = listState;
  const isFirstLoad = status === 'loading' && cabins.length === 0;
  const savedCabin = feedback?.result?.cabin;

  return (
    <div className="flex min-h-full w-full flex-col gap-4 p-6 pb-4">
      <div>
        <Link to="/cabinas" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft size={15} />
          Volver a reserva de cabina
        </Link>
        <h2 className="mt-3 font-display text-2xl font-semibold text-primary-900">Tarifas de cabinas</h2>
        <p className="text-sm text-muted">Definí cuánto se cobra por noche en cada cabina.</p>
      </div>

      <div className="flex w-full max-w-3xl flex-col gap-3">
        {feedback?.kind === 'saved' && (
          <Notice tone="success" title={MESSAGES.SUCCESS}>
            {savedCabin.name}: {formatRateTransition(feedback.result.previousPricePerNight, savedCabin.pricePerNight)} por noche.
            Las reservas y extensiones ya registradas conservan su precio.
          </Notice>
        )}
        {feedback?.kind === 'unchanged' && (
          <Notice tone="info" title="No hubo cambios">
            {savedCabin.name} ya tenía una tarifa de {formatColones(savedCabin.pricePerNight)} por noche.
          </Notice>
        )}
        {feedback?.kind === 'error' && <Notice tone="danger" title={feedback.message} />}

        {status === 'error' && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-coral-400 bg-coral-50 px-3 py-2.5 text-[13px] text-coral-600">
            <span className="min-w-0 flex-1">{message}</span>
            <button
              type="button" onClick={() => setReloadKey((key) => key + 1)}
              className="inline-flex items-center gap-1 font-semibold hover:underline"
            >
              <RotateCw size={13} /> Reintentar
            </button>
          </div>
        )}

        <ul aria-label="Cabinas" aria-busy={status === 'loading'} className="flex flex-col gap-3">
          {isFirstLoad && Array.from({ length: 4 }, (_, index) => (
            <li key={index} className="h-[76px] animate-pulse rounded-2xl border border-line bg-surface" />
          ))}
          {cabins.map((cabin) => {
            const isEditingThis = editing?.resourceId === cabin.resourceId;
            return (
              <CabinRateRow
                key={cabin.resourceId} cabin={cabin} onEdit={handleEdit}
                isLocked={Boolean(editing?.isSaving)}
                editor={isEditingThis ? {
                  draft: editing.draft, error: editing.error, isSaving: editing.isSaving,
                  onChange: handleChange, onSave: handleSave, onCancel: handleCancel,
                } : null}
              />
            );
          })}
        </ul>

        {status === 'success' && cabins.length === 0 && (
          <p className="rounded-xl bg-surface px-3 py-4 text-center text-[13px] text-muted">
            No hay cabinas registradas.
          </p>
        )}
      </div>
    </div>
  );
}

export default TarifasCabina;
