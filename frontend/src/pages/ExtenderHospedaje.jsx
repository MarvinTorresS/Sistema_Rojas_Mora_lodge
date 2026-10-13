import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, CircleAlert, LoaderCircle, RotateCw, UserSearch } from 'lucide-react';
import { extendCabinStay, getExtensionQuote, listExtendableBookings } from '../services/reservasCabinaService';
import useDebouncedValue from '../hooks/useDebouncedValue';
import { addDays, countNights, formatShortDate, todayInHotel } from '../components/cabinas/cabinFormat';
import ExtendableBookingList from '../components/extension/ExtendableBookingList.jsx';
import StayDetails from '../components/extension/StayDetails.jsx';
import NightsStepper from '../components/extension/NightsStepper.jsx';
import ExtensionReceipt from '../components/extension/ExtensionReceipt.jsx';
import ExtensionSuccess from '../components/extension/ExtensionSuccess.jsx';
import Notice from '../components/common/Notice.jsx';
import {
  CHECK_OUT_TIME, ERROR_CODES, MAX_EXTENSION_NIGHTS, MESSAGES, QUICK_NIGHT_OPTIONS,
  QUOTE_DEBOUNCE_MS, SEARCH_DEBOUNCE_MS,
} from '../components/extension/extensionConfig';

/**
 * Extender hospedaje — HU-127 (Marvin, Sprint 3), diseño "B · Buscar
 * huésped + ficha" elegido en el prototipo.
 *
 * Arquitectura (igual que ReservasCabina.jsx):
 *  - Esta página es el ÚNICO componente con estado y la única que habla con
 *    el servicio (reservasCabinaService). Los componentes de
 *    components/extension/ son de presentación: reciben datos y avisan
 *    eventos (onSelect, onChange...).
 *  - La pantalla NO recalcula montos ni disponibilidad: pide una
 *    "cotización" al backend (GET extension-quote), que aplica las mismas
 *    reglas que la confirmación. Así hay una sola fuente de verdad y lo que
 *    se ve antes de confirmar es lo que el sistema valida después.
 *
 * Flujo:
 *   buscar/elegir huésped → sumar noches (se cotiza solo) → "Confirmar
 *   extensión" → aviso de éxito.
 *   CA-2: la cotización (o la confirmación) responde "sin disponibilidad".
 *   CA-3: el recibo cobra las noches nuevas con la tarifa actual y deja lo
 *         ya registrado sin cambios.
 *   CA-4: una reserva finalizada muestra el mensaje y no deja continuar.
 *   CA-5: "Cancelar" cierra la ficha sin tocar nada.
 */

const IDLE_QUOTE = { status: 'idle', data: null, forNights: 0, message: '' };
const IDLE_SUBMIT = { status: 'idle', message: '' };

function ExtenderHospedaje() {
  // --- Lista de huéspedes ---------------------------------------------
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const [bookingsState, setBookingsState] = useState({ status: 'loading', items: [], message: '' });
  const [reloadKey, setReloadKey] = useState(0);

  // --- Ficha / extensión ----------------------------------------------
  // Se guarda una COPIA de la reserva elegida (no solo su id): así la ficha
  // no desaparece si el recepcionista sigue escribiendo en el buscador y la
  // reserva deja de aparecer en la lista filtrada.
  const [selected, setSelected] = useState(null);
  const [extraNights, setExtraNights] = useState(1);
  const [quote, setQuote] = useState(IDLE_QUOTE);
  const [quoteReloadKey, setQuoteReloadKey] = useState(0);
  const [submitState, setSubmitState] = useState(IDLE_SUBMIT);
  const [confirmation, setConfirmation] = useState(null); // CA-1

  // En pantallas angostas la ficha queda DEBAJO de la lista; al elegir un
  // huésped se lleva a la vista para que no parezca que no pasó nada.
  const detailRef = useRef(null);

  const today = todayInHotel();

  // Carga la lista (al entrar, al buscar y tras confirmar una extensión).
  // `cancelled` descarta la respuesta de una consulta vieja si ya hay otra
  // en camino (el usuario siguió escribiendo): sin esto, una respuesta
  // lenta podría pisar a una más nueva.
  useEffect(() => {
    let cancelled = false;
    setBookingsState((previous) => ({ ...previous, status: 'loading', message: '' }));
    listExtendableBookings({ search: debouncedSearch.trim() })
      .then((items) => {
        if (!cancelled) setBookingsState({ status: 'success', items, message: '' });
      })
      .catch((error) => {
        if (!cancelled) setBookingsState({ status: 'error', items: [], message: error.message });
      });
    return () => { cancelled = true; };
  }, [debouncedSearch, reloadKey]);

  // Cotiza cada vez que cambia la reserva o las noches. Espera un instante
  // (QUOTE_DEBOUNCE_MS) para no mandar una petición por cada clic en "+".
  const bookingId = selected?.bookingId ?? null;
  const currentCheckOutDate = selected?.stay.checkOutDate ?? null;
  const canQuote = Boolean(selected?.isExtendable) && !confirmation;

  useEffect(() => {
    if (!canQuote) {
      setQuote(IDLE_QUOTE);
      return undefined;
    }
    let cancelled = false;
    // Se conservan los datos anteriores mientras carga: el recibo se atenúa
    // en lugar de desaparecer, y el botón Confirmar queda deshabilitado.
    setQuote((previous) => ({ ...previous, status: 'loading', message: '' }));
    const newCheckOutDate = addDays(currentCheckOutDate, extraNights);

    const timer = setTimeout(() => {
      getExtensionQuote(bookingId, newCheckOutDate)
        .then((data) => {
          if (!cancelled) setQuote({ status: 'ready', data, forNights: extraNights, message: '' });
        })
        .catch((error) => {
          if (cancelled) return;
          // CA-2: la cabina no está libre esas noches. Se decide por el
          // código del error, no por su texto.
          const status = error.code === ERROR_CODES.EXTENSION_NOT_AVAILABLE ? 'unavailable' : 'error';
          setQuote({ status, data: null, forNights: extraNights, message: error.message });
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canQuote, bookingId, currentCheckOutDate, extraNights, quoteReloadKey]);

  // Al elegir un huésped se lleva la ficha a la vista, pero solo si quedó en
  // la mitad de abajo de la pantalla (lista y ficha apiladas, típico del
  // celular): en escritorio ya están lado a lado y no hay nada que mover.
  // Va en un efecto (y no en el clic) para medir DESPUÉS de que la ficha se
  // dibujó con su altura real. `?.` en la función: jsdom (pruebas) no
  // implementa scrollIntoView.
  useEffect(() => {
    const detail = detailRef.current;
    if (bookingId && detail && detail.getBoundingClientRect().top > window.innerHeight / 2) {
      detail.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [bookingId]);

  // --- Acciones --------------------------------------------------------
  function resetForm() {
    setExtraNights(1);
    setSubmitState(IDLE_SUBMIT);
    setConfirmation(null);
  }

  function handleSelect(booking) {
    setSelected(booking);
    resetForm();
  }

  // CA-5 (y "Extender otra estadía"): cierra la ficha sin cambiar nada.
  function handleClose() {
    setSelected(null);
    resetForm();
  }

  async function handleConfirm() {
    if (!selected) return;
    setSubmitState({ status: 'loading', message: '' });
    try {
      const result = await extendCabinStay(selected.bookingId, addDays(selected.stay.checkOutDate, extraNights));
      // CA-1: la ficha pasa a mostrar la nueva salida y el aviso de éxito.
      setConfirmation(result);
      setSelected((previous) => ({
        ...previous,
        stay: {
          ...previous.stay,
          checkOutDate: result.stay.newCheckOutDate,
          nights: countNights(previous.stay.checkInDate, result.stay.newCheckOutDate),
        },
      }));
      setSubmitState(IDLE_SUBMIT);
      setReloadKey((key) => key + 1); // la lista refleja la nueva salida
    } catch (error) {
      if (error.code === ERROR_CODES.EXTENSION_NOT_AVAILABLE) {
        // CA-2 "de carrera": alguien reservó esas noches entre la
        // cotización y el clic en Confirmar. La reserva no cambió.
        setQuote({ status: 'unavailable', data: null, forNights: extraNights, message: error.message });
        setSubmitState(IDLE_SUBMIT);
        return;
      }
      if (error.code === ERROR_CODES.BOOKING_COMPLETED) {
        // La reserva se finalizó mientras se llenaba la pantalla: se pasa al
        // caso CA-4 y se refresca la lista.
        setSelected((previous) => ({ ...previous, status: 'completed', isExtendable: false }));
        setSubmitState(IDLE_SUBMIT);
        setReloadKey((key) => key + 1);
        return;
      }
      setSubmitState({ status: 'error', message: error.message });
    }
  }

  // --- Render ------------------------------------------------------------
  const isSaving = submitState.status === 'loading';
  const quoteIsCurrent = quote.status === 'ready' && quote.forNights === extraNights;
  const canConfirm = quoteIsCurrent && !isSaving;
  const newCheckOutDate = selected ? addDays(selected.stay.checkOutDate, extraNights) : null;

  function renderAvailabilityLine() {
    if (quote.status === 'unavailable') {
      return (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-coral-600">
          <CircleAlert size={14} aria-hidden="true" /> Cabina no disponible esas noches
        </p>
      );
    }
    if (quote.status === 'ready' && quoteIsCurrent) {
      return (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-primary-700">
          <CalendarCheck size={14} aria-hidden="true" /> Cabina disponible esas noches
        </p>
      );
    }
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Consultando disponibilidad…
      </p>
    );
  }

  function renderQuotePanel() {
    if (quote.status === 'unavailable') {
      // Mensaje oficial de CA-2, tal como lo manda el backend.
      return (
        <Notice tone="danger" title={quote.message}>
          La reserva original se mantiene sin modificaciones.
        </Notice>
      );
    }
    if (quote.status === 'error') {
      return (
        <Notice tone="danger" title={quote.message}>
          <button
            type="button" onClick={() => setQuoteReloadKey((key) => key + 1)}
            className="inline-flex items-center gap-1 font-semibold hover:underline"
          >
            <RotateCw size={13} aria-hidden="true" /> Reintentar
          </button>
        </Notice>
      );
    }
    if (quote.data) {
      return (
        <ExtensionReceipt
          quote={quote.data} originalNights={selected.stay.nights} dimmed={quote.status === 'loading' || !quoteIsCurrent}
        />
      );
    }
    return <div className="h-[220px] animate-pulse rounded-[14px] border border-line bg-surface" aria-hidden="true" />;
  }

  return (
    <div className="flex min-h-full w-full flex-col gap-4 p-6 pb-4">
      <div>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft size={15} />
          Volver al dashboard
        </Link>
        <h2 className="mt-3 font-display text-2xl font-semibold text-primary-900">Extender hospedaje</h2>
        <p className="text-sm text-muted">Buscá al huésped, revisá su ficha y sumá las noches.</p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <ExtendableBookingList
          search={search} onSearchChange={setSearch}
          status={bookingsState.status} message={bookingsState.message} bookings={bookingsState.items}
          selectedId={selected?.bookingId ?? null} today={today} onSelect={handleSelect}
          onRetry={() => setReloadKey((key) => key + 1)}
        />

        <section
          ref={detailRef}
          aria-label="Ficha de la estadía"
          className="flex min-w-0 flex-[999_1_560px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-card"
        >
          {!selected && (
            <div className="flex flex-col items-center gap-2 px-6 py-20 text-center text-muted">
              <UserSearch size={40} strokeWidth={1.5} className="text-primary-400" aria-hidden="true" />
              <p className="text-[15px] font-semibold text-ink">Elegí un huésped de la lista</p>
              <p className="text-[13px]">Vas a ver su cabina, su estadía y las noches que se pueden sumar.</p>
            </div>
          )}

          {selected && (
            <>
              <StayDetails booking={selected} />

              {/* CA-1: éxito */}
              {confirmation && <ExtensionSuccess result={confirmation} onDone={handleClose} />}

              {/* CA-4: reserva finalizada */}
              {!confirmation && !selected.isExtendable && (
                <div className="flex flex-col gap-3 p-5">
                  <Notice tone="danger" title={MESSAGES.FINISHED}>
                    Para una nueva estadía debe registrarse una nueva reserva de cabina.{' '}
                    <Link to="/cabinas" className="font-semibold underline">Ir a reservar cabina</Link>
                  </Notice>
                  <div>
                    <button
                      type="button" onClick={handleClose}
                      className="min-h-[44px] rounded-[10px] border border-line bg-white px-[22px] text-sm font-semibold text-ink transition-colors hover:bg-surface"
                    >
                      Volver a la lista
                    </button>
                  </div>
                </div>
              )}

              {/* Extensión en curso */}
              {!confirmation && selected.isExtendable && (
                <>
                  <div className="flex flex-wrap gap-5 px-[22px] py-5">
                    <div className="flex min-w-[260px] flex-[1_1_280px] flex-col gap-3">
                      <NightsStepper
                        value={extraNights} max={MAX_EXTENSION_NIGHTS} options={QUICK_NIGHT_OPTIONS}
                        onChange={setExtraNights}
                      />
                      <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3">
                        <div className="flex justify-between gap-3 text-[13px]">
                          <span className="text-muted">Nueva salida</span>
                          <span className="font-bold">{formatShortDate(newCheckOutDate)}, {CHECK_OUT_TIME}</span>
                        </div>
                        {renderAvailabilityLine()}
                      </div>
                    </div>

                    <div className="flex min-w-[260px] flex-[1_1_280px] flex-col gap-3" aria-live="polite">
                      {renderQuotePanel()}
                      {submitState.status === 'error' && <Notice tone="danger" title={submitState.message} />}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5 border-t border-line bg-surface px-[22px] py-3.5">
                    <button
                      type="button" onClick={handleClose} disabled={isSaving}
                      className="min-h-[46px] rounded-[10px] border border-line bg-white px-[22px] text-sm font-semibold text-ink transition-colors hover:bg-surface-alt disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button" onClick={handleConfirm} disabled={!canConfirm}
                      className="inline-flex min-h-[46px] items-center gap-2 rounded-[10px] bg-primary-800 px-[22px] text-sm font-bold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-faint"
                    >
                      {isSaving && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
                      {isSaving ? 'Confirmando…' : 'Confirmar extensión'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default ExtenderHospedaje;
