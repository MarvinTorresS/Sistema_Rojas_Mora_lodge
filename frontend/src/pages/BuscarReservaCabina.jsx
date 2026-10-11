import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { listCabinRates, searchCabinBookings, updateCabinBooking } from '../services/reservasCabinaService';
import { formatColones, todayInHotel } from '../components/cabinas/cabinFormat';
import Notice from '../components/common/Notice.jsx';
import GuestSearchPanel from '../components/reservaBusqueda/GuestSearchPanel.jsx';
import BookingSheet from '../components/reservaBusqueda/BookingSheet.jsx';
import BookingEditForm from '../components/reservaBusqueda/BookingEditForm.jsx';
import ConflictSuggestions from '../components/reservaBusqueda/ConflictSuggestions.jsx';
import {
  ERROR_CODES, ERROR_FIELD_BY_CODE, MESSAGES,
} from '../components/reservaBusqueda/searchConfig';
import {
  bookingFromUpdate, buildDraft, describeChanges, diffDraft, validateDraft,
} from '../components/reservaBusqueda/searchFormat';

/**
 * Buscar reserva de cabina — HU-018 (buscar por huésped) y HU-019 (modificar
 * la reserva), Sprint 3. Mismo diseño "buscador + ficha" de Extender
 * hospedaje (HU-127).
 *
 * Arquitectura (la misma de ExtenderHospedaje y TarifasCabina):
 *  - Esta página es el ÚNICO componente con estado y la única que habla con
 *    el servicio. Los componentes de components/reservaBusqueda/ son de
 *    presentación: reciben datos y avisan eventos.
 *  - La pantalla NO decide si un cambio vale ni si la cabina está libre: lo
 *    revisa el backend al guardar. La revisión de aquí (validateDraft) solo
 *    ahorra un viaje a la red.
 *
 * Flujo:
 *   HU-018: escribir nombre o cédula → Buscar (o Enter) → lista de reservas.
 *           CA-2: sin coincidencias se avisa y el criterio se mantiene.
 *   HU-019: elegir una reserva → "Modificar reserva" → cambiar fechas,
 *           cabina o datos del huésped → "Guardar cambios".
 *           CA-2: si la cabina o las fechas están ocupadas se rechaza y se
 *                 sugieren cabinas y fechas libres.
 *           CA-3: con el ingreso ya hecho la cabina y la entrada no se tocan.
 */

const IDLE_RESULT = { status: 'idle', items: [], meta: null, message: '' };

function BuscarReservaCabina() {
  // --- Búsqueda (HU-018) --------------------------------------------------
  // `term` es lo que hay escrito; `request` es lo que se pidió al presionar
  // Buscar. Se separan para que escribir NO dispare consultas (CA-1: la
  // búsqueda ocurre al presionar Buscar o Enter) y para poder repetir la
  // misma búsqueda (después de guardar) creando un `request` nuevo.
  const [term, setTerm] = useState('');
  const [request, setRequest] = useState(null);
  const [result, setResult] = useState(IDLE_RESULT);

  // --- Ficha y modificación (HU-019) ------------------------------------
  // Se guarda una COPIA de la reserva elegida (no solo su id): así la ficha
  // no desaparece si la lista cambia con otra búsqueda.
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [conflict, setConflict] = useState(null); // CA-2
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(null); // CA-1
  const [cabins, setCabins] = useState([]);

  const detailRef = useRef(null);
  const today = todayInHotel();

  // Carga la lista cada vez que se pide una búsqueda. `cancelled` descarta
  // la respuesta de una consulta vieja si ya hay otra en camino.
  useEffect(() => {
    if (!request) return undefined;
    let cancelled = false;
    setResult((previous) => ({ ...previous, status: 'loading', message: '' }));
    searchCabinBookings({ q: request.term, page: request.page })
      .then(({ data, meta }) => {
        if (cancelled) return;
        setResult({ status: 'success', items: data, meta, message: '' });
        // Sin coincidencias no se deja a la vista la ficha de una búsqueda anterior.
        if (data.length === 0) clearSelection();
      })
      .catch((error) => {
        if (!cancelled) setResult({ status: 'error', items: [], meta: null, message: error.message });
      });
    return () => { cancelled = true; };
  }, [request]);

  // En pantallas angostas la ficha queda DEBAJO de la lista; al elegir una
  // reserva se lleva a la vista (mismo criterio que Extender hospedaje).
  const selectedId = selected?.bookingId ?? null;
  useEffect(() => {
    const detail = detailRef.current;
    if (selectedId && detail && detail.getBoundingClientRect().top > window.innerHeight / 2) {
      detail.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedId]);

  // --- Búsqueda: acciones -------------------------------------------------
  function handleSearch(event) {
    event.preventDefault();
    const trimmed = term.trim();
    if (!trimmed) {
      // CA-1: sin criterio no hay búsqueda; se avisa sin ir a la red.
      setResult({ status: 'invalid', items: [], meta: null, message: MESSAGES.EMPTY_SEARCH });
      clearSelection();
      return;
    }
    setRequest({ term: trimmed, page: 1, nonce: Date.now() });
  }

  function handlePage(page) {
    setRequest((previous) => ({ ...previous, page, nonce: Date.now() }));
  }

  function handleRetry() {
    setRequest((previous) => ({ ...previous, nonce: Date.now() }));
  }

  // --- Ficha: acciones --------------------------------------------------
  function resetEditing() {
    setEditing(false);
    setDraft(null);
    setErrors({});
    setFormError('');
    setConflict(null);
  }

  // Quita la ficha elegida (y lo que se estaba editando).
  function clearSelection() {
    setSelected(null);
    setSaved(null);
    resetEditing();
  }

  function handleSelect(booking) {
    setSelected(booking);
    setSaved(null);
    resetEditing();
  }

  function handleStartEdit() {
    setSaved(null);
    setDraft(buildDraft(selected));
    setErrors({});
    setFormError('');
    setConflict(null);
    setEditing(true);
  }

  // Se carga el catálogo de cabinas la primera vez que se abre el
  // formulario (para el desplegable y la capacidad). Si falla, el formulario
  // sigue funcionando con la cabina actual.
  useEffect(() => {
    if (!editing || cabins.length > 0) return undefined;
    let cancelled = false;
    listCabinRates()
      .then((items) => { if (!cancelled) setCabins(items); })
      .catch(() => { /* sin catálogo: queda solo la cabina actual */ });
    return () => { cancelled = true; };
  }, [editing, cabins.length]);

  function handleChange(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    // Al corregir un campo se quita su error y el aviso de conflicto: ya no
    // describen lo que está escrito.
    setErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
    setFormError('');
    if (['resourceId', 'checkInDate', 'checkOutDate'].includes(field)) setConflict(null);
  }

  // Sugerencias del conflicto (CA-2): un clic cambia el borrador.
  function handleChooseCabin(resourceId) {
    setConflict(null);
    handleChange('resourceId', String(resourceId));
  }

  function handleChooseDates({ checkInDate, checkOutDate }) {
    setConflict(null);
    setDraft((current) => ({ ...current, checkInDate, checkOutDate }));
    setErrors({});
  }

  async function handleSave() {
    const found = validateDraft(selected, draft, { cabins, today });
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    const changes = diffDraft(selected, draft);
    if (Object.keys(changes).length === 0) return;

    setIsSaving(true);
    setFormError('');
    setConflict(null);
    try {
      const response = await updateCabinBooking(selected.bookingId, changes);
      // CA-1: la ficha pasa a mostrar los datos nuevos y la lista se
      // refresca (misma búsqueda) para que no muestre la reserva vieja.
      setSelected((previous) => bookingFromUpdate(previous, response));
      setSaved(response);
      resetEditing();
      setRequest((previous) => (previous ? { ...previous, nonce: Date.now() } : previous));
    } catch (error) {
      if (error.code === ERROR_CODES.CABIN_NOT_AVAILABLE) {
        // CA-2: nada cambió; se ofrecen alternativas.
        setConflict({
          message: error.message,
          alternatives: error.details?.alternatives ?? [],
          alternativeDates: error.details?.alternativeDates ?? [],
        });
      } else if (error.code === ERROR_CODES.BOOKING_NOT_MODIFIABLE) {
        // La reserva dejó de estar activa mientras se llenaba el formulario.
        setSelected((previous) => ({ ...previous, isModifiable: false }));
        resetEditing();
        setFormError(error.message);
        setRequest((previous) => (previous ? { ...previous, nonce: Date.now() } : previous));
      } else if (Object.keys(error.fieldErrors ?? {}).length > 0) {
        setErrors(error.fieldErrors);
      } else if (ERROR_FIELD_BY_CODE[error.code]) {
        setErrors({ [ERROR_FIELD_BY_CODE[error.code]]: error.message });
      } else {
        setFormError(error.message);
      }
    } finally {
      setIsSaving(false);
    }
  }

  // --- Render ------------------------------------------------------------
  const changeRows = useMemo(
    () => (editing && draft ? describeChanges(selected, draft, cabins) : []),
    [editing, draft, selected, cabins],
  );
  const canSave = changeRows.length > 0;

  return (
    <div className="flex min-h-full w-full flex-col gap-4 p-6 pb-4">
      <div>
        <Link to="/cabinas" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft size={15} />
          Volver a reservas de cabina
        </Link>
        <h2 className="mt-3 font-display text-2xl font-semibold text-primary-900">Buscar reserva</h2>
        <p className="text-sm text-muted">Ubicá la reserva de un huésped por nombre o cédula y, si hace falta, modificala.</p>
      </div>

      <div className="flex flex-col gap-4">
        <GuestSearchPanel
          term={term} onTermChange={setTerm} onSearch={handleSearch}
          status={result.status} message={result.message} bookings={result.items} meta={result.meta}
          selectedId={selectedId} onSelect={handleSelect} onRetry={handleRetry} onPage={handlePage}
        />

        {/* La ficha aparece solo cuando hay una reserva elegida: antes dejaba
            un cuadro vacío enorme. */}
        {selected && (
          <section
            ref={detailRef}
            aria-label="Ficha de la reserva"
            className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card"
          >
            <BookingSheet booking={selected} />

            {/* HU-019 CA-1: reserva modificada. */}
            {saved && !editing && (
              <div className="flex flex-col gap-3 p-5">
                <Notice tone="success" title={saved.changed ? MESSAGES.SAVED : 'La reserva ya tenía esos datos'}>
                  {saved.changed && saved.amounts.repriced && (
                    <span>
                      Nuevo total de la estadía: {formatColones(saved.amounts.totalAmount)}
                      {' '}(antes {formatColones(saved.amounts.previousTotal)}).
                    </span>
                  )}
                </Notice>
              </div>
            )}

            {!editing && formError && (
              <div className="px-5 pt-5"><Notice tone="danger" title={formError} /></div>
            )}

            {/* Reserva que no admite cambios: finalizada, cancelada... */}
            {!editing && !selected.isModifiable && (
              <div className="p-5">
                <Notice tone="info" title={MESSAGES.NOT_MODIFIABLE} />
              </div>
            )}

            {!editing && selected.isModifiable && (
              <div className="flex justify-end border-t border-line bg-surface px-[22px] py-3.5">
                <button
                  type="button" onClick={handleStartEdit}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-[10px] bg-primary-800 px-[22px] text-sm font-bold text-white transition-colors hover:bg-primary-700"
                >
                  <Pencil size={15} aria-hidden="true" />
                  Modificar reserva
                </button>
              </div>
            )}

            {editing && (
              <>
                {conflict && (
                  <div className="px-[22px] pt-5">
                    <ConflictSuggestions
                      conflict={conflict}
                      onChooseCabin={handleChooseCabin} onChooseDates={handleChooseDates}
                      onClose={() => setConflict(null)}
                    />
                  </div>
                )}
                <BookingEditForm
                  booking={selected} draft={draft} errors={errors} cabins={cabins}
                  changes={changeRows} canSave={canSave} isSaving={isSaving} formError={formError}
                  onChange={handleChange} onSubmit={handleSave} onCancel={resetEditing}
                />
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default BuscarReservaCabina;
