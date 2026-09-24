import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { checkHallAvailability, createHallBooking, listHallBookings, getHallBooking, updateHallBooking, cancelHallBooking } from '../services/reservasSalonService';

/**
 * Pagina del modulo de reservas del salon de eventos.
 *
 * HU-007/HU-013: disponibilidad y alta con plan. HU-014 agrega un
 * listado paginado y edicion de fechas con estado independiente.
 * HU-015 agrega cancelacion con confirmacion independiente de la edicion.
 *
 * Por que NO reutiliza DisponibilidadGrid.jsx (a pesar del comentario
 * en ese archivo que invitaba a reutilizarlo para el salon): esa
 * grilla pinta el dia completo con el nombre de cada cliente que ya
 * tiene una celda ocupada, y esos datos salen de listar TODAS las
 * reservas del dia (GET .../field-bookings?date=..., HU-002 de
 * cancha). El listado paginado de HU-014 sirve para seleccionar una
 * reserva a editar, no representa toda la disponibilidad del dia.
 *
 * Diseno visual (16/09/2026): en vez del formulario clasico de campos
 * apilados, se exploraron 3 propuestas en Figma con Marvin y se eligio
 * el "Concepto B" -- elegir el plan primero, y un panel de resumen tipo
 * checkout (fijo a la derecha) que muestra en vivo fecha, plan,
 * deposito y total, con el boton de confirmar ahi mismo.
 *
 * Ajustes post-entrega (16/09/2026, feedback de Marvin sobre la UI ya
 * funcionando): compactacion en una sola tarjeta (antes eran 3
 * separadas), columnas simetricas (lg:items-stretch + mt-auto),
 * contraste de los inputs (border-faint + foco verde) y tipografia
 * consistente entre titulos de seccion. Un ultimo ajuste, el mas
 * grande: al confirmar una reserva, la pantalla entera se reemplazaba
 * por una tarjeta chica, dejando el resto de la pagina vacio. Ahora el
 * <form> con sus 2 columnas queda SIEMPRE montado -- la tarjeta
 * izquierda (plan/fecha/cliente) nunca desaparece -- y solo cambia el
 * contenido del panel derecho, con una animacion, entre "resumen" y
 * "confirmacion" (ver ReservationSummaryPanel / ReservationConfirmationPanel).
 */

// Mismo criterio que CANCHA_RESOURCE_ID en ReservasCancha.jsx: el
// backend si soporta varios salones (resourceId es un parametro
// generico), pero el frontend todavia no tiene forma de listarlos
// dinamicamente (eso llegaria con una futura HU de "consultar
// salones"). Mientras tanto, este es el unico salon que existe,
// sembrado por el seeder 20260916000001-seed-event-hall-resource.js.
const EVENT_HALL_RESOURCE_ID = 2;

// TODO (Alison, HU-009 -- mismo sprint): reemplazar esta lista fija por
// una llamada real a GET /api/event-hall-plans en cuanto ese endpoint
// exista. Debe coincidir con los planes que siembra
// 20260916000001-seed-event-hall-resource.js mientras tanto -- si se
// agregan o cambian planes ahi, hay que actualizar esta lista a mano.
const EVENT_HALL_PLANS = [
  { planId: 1, planName: 'Medio dia (6 horas)', hours: 6, price: 150000 },
  { planId: 2, planName: 'Dia completo (12 horas)', hours: 12, price: 250000 },
];

// Vista previa del deposito en el panel de resumen, ANTES de confirmar
// la reserva. No es la fuente de verdad: mientras el usuario todavia
// esta eligiendo, el frontend calcula este numero solo para mostrarlo
// en pantalla. El monto real que se cobra lo calcula el backend
// (EVENT_HALL_DEPOSIT_PERCENTAGE en reservasSalon.service.js) y llega
// en la respuesta de POST /hall-bookings (confirmation.depositAmount)
// -- por eso, una vez que existe `confirmation`, el panel deja de usar
// este numero y muestra el que devolvio la API.
const DEPOSIT_PERCENTAGE_PREVIEW = 0.30;

const currencyFormatter = new Intl.NumberFormat('es-CR', {
  style: 'currency', currency: 'CRC', maximumFractionDigits: 0,
});

// yyyy-mm-dd de HOY en horario local -- mismo motivo que en
// ReservasCancha.jsx (no toISOString, que usa UTC).
function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Combina fecha (yyyy-mm-dd) + hora (HH:mm) en un Date local y lo pasa
// a ISO 8601 (UTC) para el backend. Mismo patron que
// slotToIsoRange/toLocalDatetimeInput en ReservasCancha.jsx.
function toIsoDatetime(date, time) {
  return new Date(`${date}T${time}:00`).toISOString();
}

const INITIAL_QUERY = { date: todayIsoDate(), startTime: '09:00', endTime: '13:00' };
const INITIAL_BOOKING_FORM = { planId: EVENT_HALL_PLANS[0].planId, customerName: '', customerPhone: '' };

/**
 * Anima la entrada de quien lo use: arranca "oculto" (opacity-0 y
 * levemente desplazado/achicado, segun las clases que le pongas) y, un
 * frame despues, pasa al estado final -- ahi es cuando `transition-all`
 * de Tailwind SI se nota. Un cambio de clase dentro del MISMO render no
 * anima (el navegador nunca llega a pintar el estado inicial); por eso
 * hace falta el paso extra con requestAnimationFrame.
 *
 * No es una libreria de animaciones -- es el truco minimo para lograr
 * una transicion de "aparecer" sin agregar una dependencia nueva al
 * proyecto (framer-motion, etc.) para un solo efecto puntual.
 */
function useEnterTransition() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return entered;
}

/**
 * Chip de plan seleccionable, de una sola linea (Concepto B, version
 * compacta). No sabe nada de la pagina que lo contiene -- recibe el
 * plan, si esta seleccionado, y que hacer al elegirlo.
 */
function PlanOptionCard({ plan, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(plan.planId)}
      aria-pressed={selected}
      className={`flex flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600'
          : 'border-line bg-white hover:border-primary-400'
      }`}
    >
      <span className="text-sm font-semibold text-primary-900">{plan.planName}</span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">{currencyFormatter.format(plan.price)}</span>
        {selected && (
          <span className="rounded-full bg-primary-700 px-1.5 py-0.5 text-[10px] font-medium text-white">✓</span>
        )}
      </span>
    </button>
  );
}

/** Una fila "etiqueta / valor", reutilizada en el resumen y en la confirmacion. */
function SummaryRow({ label, value, emphasis = false }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={emphasis ? 'text-sm text-white' : 'text-xs text-primary-200'}>{label}</span>
      <span className={emphasis ? 'text-base font-semibold text-white' : 'text-sm font-medium text-white'}>{value}</span>
    </div>
  );
}

/**
 * Contenido del panel derecho ANTES de confirmar: fecha/plan/deposito
 * en vivo y el boton de submit. Vive dentro del <form> de la pagina
 * (el boton es type="submit"), pero no sabe nada de HTTP -- solo
 * recibe los datos ya calculados y las funciones/estado que necesita
 * mostrar.
 */
function ReservationSummaryPanel({
  queryForm, availability, isCheckingAvailability, isAvailable,
  selectedPlan, previewDeposit, canSubmitBooking, isSubmittingBooking, bookingFeedback,
}) {
  const entered = useEnterTransition();
  return (
    <div
      className={`flex flex-1 flex-col transition-all duration-300 ease-out ${
        entered ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-0'
      }`}
    >
      <div className="flex flex-col gap-4">
        <h3 className="font-display text-base font-semibold">Resumen de la reserva</h3>

        <div className="space-y-1">
          <p className="text-sm font-medium">Salon de eventos principal</p>
          <p className="text-xs text-primary-200">
            {queryForm.date} · {queryForm.startTime} – {queryForm.endTime}
          </p>
        </div>

        {isCheckingAvailability && <span className="text-xs text-primary-200">Consultando disponibilidad…</span>}
        {availability.status === 'idle' && (
          <span className="inline-flex w-fit items-center rounded-full bg-white/10 px-3 py-1 text-xs text-primary-200">
            Falta consultar disponibilidad
          </span>
        )}
        {isAvailable && (
          <span className="inline-flex w-fit items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-600">
            ✓ Disponible
          </span>
        )}
        {availability.status === 'checked' && availability.available === false && (
          <span className="inline-flex w-fit items-center rounded-full bg-coral-50 px-3 py-1 text-xs font-medium text-coral-600">
            ✕ No disponible
          </span>
        )}

        <div className="h-px w-full bg-white/15" />

        <div className="space-y-2">
          <SummaryRow label={selectedPlan.planName} value={currencyFormatter.format(selectedPlan.price)} />
          <SummaryRow label={`Deposito (${Math.round(DEPOSIT_PERCENTAGE_PREVIEW * 100)}%)`} value={currencyFormatter.format(previewDeposit)} />
        </div>

        <div className="h-px w-full bg-white/15" />

        <SummaryRow label="Total del evento" value={currencyFormatter.format(selectedPlan.price)} emphasis />
      </div>

      {/* mt-auto: ancla el boton abajo del panel (que se estira para
          igualar el alto de la tarjeta izquierda, lg:items-stretch en
          el <form>) en vez de dejarlo pegado justo debajo del total. */}
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <button
          type="submit" disabled={!canSubmitBooking}
          className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-primary-900 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmittingBooking ? 'Guardando…' : 'Confirmar reserva'}
        </button>
        {!isAvailable && (
          <p className="text-center text-[11px] text-primary-200">Consulta la disponibilidad para poder confirmar.</p>
        )}
        {bookingFeedback.status === 'error' && (
          <p className="rounded-lg bg-white px-3 py-2 text-xs text-coral-600">{bookingFeedback.message}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Contenido del panel derecho DESPUES de confirmar: mismo espacio que
 * el resumen (mismo <aside>, mismo alto), pero con el "recibo" de la
 * reserva ya creada. onReset vuelve a mostrar ReservationSummaryPanel
 * (ver handleSubmitBooking/handleQueryChange: limpian `confirmation` y
 * reinician el formulario para la siguiente reserva).
 */
function ReservationConfirmationPanel({ confirmation, onReset }) {
  const entered = useEnterTransition();
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-4 text-center transition-all duration-300 ease-out ${
        entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
      }`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-lg font-bold text-teal-600">
        ✓
      </span>

      <div>
        <h3 className="font-display text-xl font-semibold">Reserva confirmada</h3>
        <p className="mt-1 text-sm text-primary-200">Reserva #{confirmation.booking.bookingId} registrada correctamente.</p>
      </div>

      {/* CA-3: anticipo calculado por el backend. Porcentaje
          confirmado con Marvin (30%, 16/09/2026) como valor de
          arranque, pendiente de validar con el encargado del
          negocio -- ver EVENT_HALL_DEPOSIT_PERCENTAGE en
          reservasSalon.service.js. */}
      <div className="w-full space-y-2 rounded-lg bg-white/10 p-4 text-left">
        <SummaryRow label={confirmation.plan.planName} value={currencyFormatter.format(confirmation.plan.price)} />
        <div className="h-px w-full bg-white/15" />
        <SummaryRow
          label={`Anticipo requerido (${Math.round(confirmation.depositPercentage * 100)}%)`}
          value={currencyFormatter.format(confirmation.depositAmount)}
          emphasis
        />
      </div>

      <button
        type="button"
        onClick={onReset}
        className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-primary-900 transition-colors hover:bg-primary-50"
      >
        Registrar otra reserva
      </button>
    </div>
  );
}

function localDatetime(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// HU-014: estado independiente del alta y datos obtenidos del servidor,
// incluso despues de recargar la pagina o crear otra reserva.
export function ExistingHallBookings({ refreshVersion = 0, onUpdated }) {
  const [list, setList] = useState({ data: [], meta: null, loading: true, error: '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ planId: '', startDatetime: '', endDatetime: '' });
  const [savedPricing, setSavedPricing] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelRequest = useRef(false);
  const [feedback, setFeedback] = useState({ status: 'idle', message: '' });
  const requestId = useRef(0);
  const busy = isCancelling || feedback.status === 'loading' || feedback.status === 'saving';
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setList((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const result = await listHallBookings({ page, pageSize: 20 });
      if (id === requestId.current) setList({ ...result, loading: false, error: '' });
    } catch (error) {
      if (id === requestId.current) setList((prev) => ({ ...prev, loading: false, error: error.message }));
    }
  }, [page]);
  useEffect(() => { load(); return () => { requestId.current += 1; }; }, [load, refreshVersion]);

  async function edit(bookingId) {
    setSavedPricing(null);
    setFeedback({ status: 'loading', message: 'Cargando reserva…' });
    try {
      const booking = await getHallBooking(bookingId);
      if (booking.status === 'cancelled') throw new Error('Una reserva cancelada no puede modificarse.');
      setSelected(booking);
      setDraft({ planId: booking.plan?.planId ?? '', startDatetime: localDatetime(booking.startDatetime), endDatetime: localDatetime(booking.endDatetime) });
      setFeedback({ status: 'idle', message: '' });
    } catch (error) { setFeedback({ status: 'error', message: error.message }); }
  }

  function cancel() {
    setDraft({ planId: '', startDatetime: '', endDatetime: '' });
    setSavedPricing(null);
    setSelected(null);
    setFeedback({ status: 'idle', message: '' });
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setFeedback({ status: 'saving', message: 'Guardando cambios…' });
    try {
      const result = await updateHallBooking(selected.bookingId, {
        ...(Number(draft.planId) !== selected.plan?.planId && draft.planId !== '' ? { planId: Number(draft.planId) } : {}),
        startDatetime: new Date(draft.startDatetime).toISOString(),
        endDatetime: new Date(draft.endDatetime).toISOString(),
      });
      cancel();
      setSavedPricing(result.pricing ?? null);
      onUpdated?.();
      await load();
      setFeedback({ status: 'success', message: 'Reserva modificada correctamente.' });
    } catch (error) { setFeedback({ status: 'error', message: error.message }); }
  }

  function openCancellation(booking) {
    setCancelTarget(booking);
    setCancelReason('');
    setSavedPricing(null);
    setFeedback({ status: 'idle', message: '' });
  }

  function closeCancellation() {
    if (cancelRequest.current) return;
    setCancelTarget(null);
    setCancelReason('');
    setFeedback({ status: 'idle', message: '' });
  }

  async function confirmCancellation(event) {
    event.preventDefault();
    if (cancelRequest.current) return;
    cancelRequest.current = true;
    setIsCancelling(true);
    setFeedback({ status: 'idle', message: '' });
    try {
      const result = await cancelHallBooking(cancelTarget.bookingId,
        cancelReason.trim() ? { cancellationReason: cancelReason.trim() } : {});
      // Reflejar el resultado aun si falla la recarga posterior del listado.
      setList((prev) => ({ ...prev, data: prev.data.map((booking) => booking.bookingId === result.bookingId ? { ...booking, ...result } : booking) }));
      setCancelTarget(null);
      setCancelReason('');
      onUpdated?.();
      await load();
      setFeedback({ status: 'success', message: 'Reserva cancelada correctamente. No se ha realizado ninguna devolución.' });
    } catch (error) {
      setFeedback({ status: 'error', message: error.message });
    } finally {
      cancelRequest.current = false;
      setIsCancelling(false);
    }
  }

  const dateLabel = (value) => new Date(value).toLocaleString('es-CR');
  const editPlan = selected?.availablePlans?.find((plan) => plan.planId === Number(draft.planId)) ?? selected?.plan;
  const depositRate = selected?.depositPercentage ?? DEPOSIT_PERCENTAGE_PREVIEW;
  const requiredAmount = (price) => Math.round(Math.round(Number(price) * 100) * depositRate) / 100;
  const money = (value) => new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', minimumFractionDigits: 2 }).format(value);
  return (
    <section aria-label="Administrar reservas existentes" className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">Reservas existentes</h3>
        <button type="button" onClick={load} disabled={list.loading || busy} className="rounded-lg border border-line px-3 py-2">Actualizar reservas</button>
      </div>
      {list.loading && <p role="status">Cargando reservas…</p>}
      {list.error && <p role="alert">{list.error}</p>}
      {feedback.message && <p role={feedback.status === 'error' ? 'alert' : 'status'} className="my-3">{feedback.message}</p>}
      {savedPricing && <div aria-label="Importes confirmados" className="my-3 rounded-lg bg-primary-50 p-3 text-sm">
        <p>Precio actual del plan: {money(savedPricing.price)}</p>
        <p>Anticipo requerido: {money(savedPricing.depositAmount)}</p>
        <p>Diferencia de anticipo requerido: {money(savedPricing.depositDifference)}</p>
        <p>Estos importes no representan pagos realizados ni saldo pendiente.</p>
      </div>}
      {selected ? (
        <form onSubmit={save} className="mt-4 space-y-3">
          <h4 className="font-semibold">Editar reserva #{selected.bookingId}</h4>
          <p>{selected.customer?.fullName} · {selected.customer?.phone} · {selected.plan?.planName}</p>
          <p className="text-sm text-muted">Cliente, salón, estado y origen se conservan.</p>
          <fieldset disabled={busy} className="flex flex-wrap gap-3">
            <label>Plan de la reserva<select aria-label="Plan de la reserva" value={draft.planId}
              onChange={(event) => setDraft((prev) => ({ ...prev, planId: event.target.value }))} className="block rounded border border-faint p-2">
              {!selected.plan && <option value="">Sin plan</option>}
              {(selected.availablePlans ?? (selected.plan ? [selected.plan] : [])).map((plan) => <option key={plan.planId} value={plan.planId}>{plan.planName}</option>)}
            </select></label>
            <label>Inicio de la reserva<input aria-label="Inicio de la reserva" type="datetime-local" step="1" required value={draft.startDatetime}
              onChange={(event) => setDraft((prev) => ({ ...prev, startDatetime: event.target.value }))} className="block rounded border border-faint p-2" /></label>
            <label>Fin de la reserva<input aria-label="Fin de la reserva" type="datetime-local" step="1" required value={draft.endDatetime}
              onChange={(event) => setDraft((prev) => ({ ...prev, endDatetime: event.target.value }))} className="block rounded border border-faint p-2" /></label>
            <button type="submit" className="rounded-lg bg-primary-700 px-4 py-2 text-white">Guardar cambios</button>
            <button type="button" onClick={cancel} className="rounded-lg border border-line px-4 py-2">Cancelar edición</button>
          </fieldset>
          {editPlan && Number.isFinite(editPlan.price) && <div aria-label="Vista previa del plan" className="rounded-lg bg-primary-50 p-3 text-sm">
            <p>Precio del plan: {money(editPlan.price)}</p>
            <p>Anticipo requerido ({Math.round(depositRate * 100)}%): {money(requiredAmount(editPlan.price))}</p>
            {Number.isFinite(selected.plan?.price) && <p>Diferencia de anticipo requerido: {money(requiredAmount(editPlan.price) - requiredAmount(selected.plan.price))}</p>}
            <p>Vista previa con precios actuales. No representa pagos realizados ni saldo pendiente.</p>
          </div>}
        </form>
      ) : cancelTarget ? (
        <form aria-label="Confirmar cancelación de reserva" onSubmit={confirmCancellation} onKeyDown={(event) => {
          if (event.key === 'Escape') closeCancellation();
        }} className="mt-4 space-y-3 rounded-lg border border-line p-4">
          <h4 className="font-semibold">¿Cancelar reserva #{cancelTarget.bookingId}?</h4>
          <p>{cancelTarget.customer?.fullName} · {cancelTarget.plan?.planName}</p>
          <p>{dateLabel(cancelTarget.startDatetime)} — {dateLabel(cancelTarget.endDatetime)}</p>
          <p>La reserva dejará de ocupar este horario. Esta acción no realiza pagos ni devoluciones.</p>
          <fieldset disabled={isCancelling} className="space-y-3">
            <label className="block">Motivo (opcional)<textarea aria-label="Motivo de cancelación" maxLength={250} value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)} className="block w-full rounded border border-faint p-2" /></label>
            <button type="button" autoFocus onClick={closeCancellation} className="mr-3 rounded-lg border border-line px-4 py-2">Volver</button>
            <button type="submit" className="rounded-lg bg-primary-700 px-4 py-2 text-white">{isCancelling ? 'Cancelando…' : 'Confirmar cancelación'}</button>
          </fieldset>
        </form>
      ) : (
        <>
          {!list.loading && !list.error && list.data.length === 0 && <p className="mt-3">No hay reservas del salón.</p>}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Reservas del salón</caption>
              <thead><tr>{['Reserva', 'Cliente', 'Teléfono', 'Inicio', 'Fin', 'Plan', 'Estado', 'Origen', 'Acciones'].map((label) => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
              <tbody>{list.data.map((booking) => <tr key={booking.bookingId}>
                <td className="p-2">#{booking.bookingId}</td><td>{booking.customer?.fullName}</td><td>{booking.customer?.phone}</td>
                <td>{dateLabel(booking.startDatetime)}</td><td>{dateLabel(booking.endDatetime)}</td><td>{booking.plan?.planName ?? 'Sin plan'}</td>
                <td>{booking.status === 'cancelled' ? 'Cancelada' : booking.status}</td><td>{booking.originChannel}</td>
                <td><button type="button" aria-label={`Editar reserva ${booking.bookingId}`} disabled={busy || booking.status === 'cancelled'}
                  onClick={() => edit(booking.bookingId)} className="rounded-lg border border-line px-3 py-2 disabled:opacity-50">Editar</button>
                  <button type="button" aria-label={`Cancelar reserva ${booking.bookingId}`} disabled={busy || booking.status === 'cancelled'}
                    onClick={() => openCancellation(booking)} className="ml-2 rounded-lg border border-line px-3 py-2 disabled:opacity-50">Cancelar reserva</button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" disabled={busy || list.loading || page <= 1} onClick={() => setPage((prev) => prev - 1)}>Anterior</button>
            <span>Página {page} · {list.meta?.total ?? 0} reservas</span>
            <button type="button" disabled={busy || list.loading || page >= (list.meta?.totalPages ?? 0)} onClick={() => setPage((prev) => prev + 1)}>Siguiente</button>
          </div>
        </>
      )}
    </section>
  );
}

function ReservasSalon() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [queryForm, setQueryForm] = useState(INITIAL_QUERY);
  const [availability, setAvailability] = useState({ status: 'idle', available: null, reason: null, message: '' });
  const [bookingForm, setBookingForm] = useState(INITIAL_BOOKING_FORM);
  const [bookingFeedback, setBookingFeedback] = useState({ status: 'idle', message: '' });
  const [confirmation, setConfirmation] = useState(null);

  const selectedPlan = EVENT_HALL_PLANS.find((plan) => plan.planId === Number(bookingForm.planId)) ?? EVENT_HALL_PLANS[0];

  function handlePlanSelect(planId) {
    // A diferencia de cambiar la fecha/horario, elegir otro plan no
    // invalida una disponibilidad ya consultada: la disponibilidad
    // depende del horario, no del plan que se vaya a cobrar.
    setBookingForm((prev) => ({ ...prev, planId }));
  }

  function handleQueryChange(event) {
    const { name, value } = event.target;
    setQueryForm((prev) => ({ ...prev, [name]: value }));
    // Cambiar el horario consultado invalida cualquier resultado de
    // disponibilidad anterior: no deberia quedar "Disponible" en
    // pantalla para un horario que el usuario ya cambio.
    setAvailability({ status: 'idle', available: null, reason: null, message: '' });
    setConfirmation(null);
  }

  async function handleCheckAvailability() {
    setAvailability({ status: 'loading', available: null, reason: null, message: '' });
    try {
      const { startTime, endTime, date } = queryForm;
      const result = await checkHallAvailability({
        resourceId: EVENT_HALL_RESOURCE_ID,
        startDatetime: toIsoDatetime(date, startTime),
        endDatetime: toIsoDatetime(date, endTime),
      });
      setAvailability({ status: 'checked', available: result.available, reason: result.reason, message: '' });
    } catch (error) {
      setAvailability({ status: 'error', available: null, reason: null, message: error.message });
    }
  }

  function handleBookingFormChange(event) {
    const { name, value } = event.target;
    setBookingForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmitBooking(event) {
    event.preventDefault();
    setBookingFeedback({ status: 'loading', message: '' });
    try {
      const { date, startTime, endTime } = queryForm;
      const result = await createHallBooking({
        resourceId: EVENT_HALL_RESOURCE_ID,
        planId: Number(bookingForm.planId),
        customerName: bookingForm.customerName,
        customerPhone: bookingForm.customerPhone,
        startDatetime: toIsoDatetime(date, startTime),
        endDatetime: toIsoDatetime(date, endTime),
      });
      setConfirmation(result);
      setRefreshVersion((value) => value + 1);
      setBookingFeedback({ status: 'success', message: 'Reserva registrada correctamente.' });
      setBookingForm(INITIAL_BOOKING_FORM);
      // La disponibilidad consultada ya no aplica: el horario que
      // estaba libre ahora tiene esta reserva.
      setAvailability({ status: 'idle', available: null, reason: null, message: '' });
    } catch (error) {
      setBookingFeedback({ status: 'error', message: error.message });
    }
  }

  const isCheckingAvailability = availability.status === 'loading';
  const isSubmittingBooking = bookingFeedback.status === 'loading';
  const isAvailable = availability.status === 'checked' && availability.available === true;
  // El formulario de reserva se puede enviar solo si ya se confirmo
  // que el horario esta libre. El boton queda deshabilitado (no
  // oculto) para que el encargado siempre vea que ahi va a poder
  // confirmar, aunque todavia no pueda hacer click.
  const canSubmitBooking = isAvailable && !confirmation && !isSubmittingBooking;

  const previewDeposit = Math.round(selectedPlan.price * DEPOSIT_PERCENTAGE_PREVIEW);

  return (
    <div className="flex min-h-full w-full flex-col gap-5 p-6">
      <div>
        <Link to="/reservar" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft size={15} />
          Volver a elegir espacio
        </Link>
        <h2 className="mt-3 font-display text-2xl font-semibold text-primary-900">Salon de eventos</h2>
        <p className="text-sm text-muted">Elegi el plan, consulta disponibilidad y confirma la reserva con el deposito.</p>
      </div>

      <ExistingHallBookings refreshVersion={refreshVersion} onUpdated={() => {
        setAvailability({ status: 'idle', available: null, reason: null, message: '' });
        setConfirmation(null);
      }} />

      {/* El <form> con sus 2 columnas queda SIEMPRE montado, tambien
          despues de confirmar una reserva -- ver el comentario grande
          al inicio del archivo ("Ajustes post-entrega"). Lo unico que
          cambia con `confirmation` es el contenido del <aside>. */}
      <form onSubmit={handleSubmitBooking} className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        {/* Una sola tarjeta con 3 secciones separadas por divisores
            finos, en vez de 3 tarjetas independientes -- eso era lo
            que obligaba a hacer scroll para llegar a los datos del
            cliente. */}
        <div className="flex-1 rounded-xl border border-line bg-surface p-4 shadow-card">
          <h3 className="font-display text-base font-semibold text-primary-900">Plan y horario</h3>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {EVENT_HALL_PLANS.map((plan) => (
              <PlanOptionCard
                key={plan.planId}
                plan={plan}
                selected={plan.planId === selectedPlan.planId}
                onSelect={handlePlanSelect}
              />
            ))}
          </div>

          <div className="my-4 h-px bg-line" />

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="query-date" className="block text-xs font-medium text-muted">Fecha</label>
              <input
                id="query-date" name="date" type="date"
                min={todayIsoDate()} value={queryForm.date} onChange={handleQueryChange}
                className="mt-1 w-full rounded-lg border border-faint bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary-200"
              />
            </div>
            <div>
              <label htmlFor="query-start" className="block text-xs font-medium text-muted">Hora inicio</label>
              <input
                id="query-start" name="startTime" type="time"
                value={queryForm.startTime} onChange={handleQueryChange}
                className="mt-1 w-full rounded-lg border border-faint bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary-200"
              />
            </div>
            <div>
              <label htmlFor="query-end" className="block text-xs font-medium text-muted">Hora fin</label>
              <input
                id="query-end" name="endTime" type="time"
                value={queryForm.endTime} onChange={handleQueryChange}
                className="mt-1 w-full rounded-lg border border-faint bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary-200"
              />
            </div>
          </div>

          <button
            type="button" onClick={handleCheckAvailability} disabled={isCheckingAvailability}
            className="mt-3 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
          >
            {isCheckingAvailability ? 'Consultando…' : 'Consultar disponibilidad'}
          </button>

          {availability.status === 'error' && (
            <p className="mt-2 rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{availability.message}</p>
          )}
          {isAvailable && (
            <p className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-600">
              El salon esta disponible en ese horario.
            </p>
          )}
          {availability.status === 'checked' && availability.available === false && (
            <p className="mt-2 rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{availability.reason}</p>
          )}

          <div className="my-4 h-px bg-line" />

          <h3 className="font-display text-base font-semibold text-primary-900">Datos del cliente</h3>
          {!isAvailable && (
            <p className="mt-1 text-xs text-muted">Consulta primero la disponibilidad para completar estos datos.</p>
          )}
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="customerName" className="block text-xs font-medium text-muted">Nombre del cliente</label>
              <input
                id="customerName" name="customerName" type="text" required={isAvailable}
                minLength={3} maxLength={150} disabled={!isAvailable}
                value={bookingForm.customerName} onChange={handleBookingFormChange}
                className="mt-1 w-full rounded-lg border border-faint bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary-200 disabled:border-line disabled:bg-surface-alt disabled:text-faint"
              />
            </div>
            <div>
              <label htmlFor="customerPhone" className="block text-xs font-medium text-muted">Telefono</label>
              <input
                id="customerPhone" name="customerPhone" type="tel" required={isAvailable}
                minLength={8} maxLength={20} disabled={!isAvailable}
                value={bookingForm.customerPhone} onChange={handleBookingFormChange}
                className="mt-1 w-full rounded-lg border border-faint bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary-200 disabled:border-line disabled:bg-surface-alt disabled:text-faint"
              />
            </div>
          </div>
        </div>

        {/* Panel derecho: mismo <aside> siempre, cambia solo el
            contenido de adentro (resumen <-> confirmacion). */}
        <aside className="flex w-full flex-col rounded-xl bg-primary-900 p-5 text-white shadow-card lg:sticky lg:top-6 lg:w-[340px]">
          {confirmation ? (
            <ReservationConfirmationPanel
              confirmation={confirmation}
              onReset={() => { setConfirmation(null); setQueryForm(INITIAL_QUERY); }}
            />
          ) : (
            <ReservationSummaryPanel
              queryForm={queryForm}
              availability={availability}
              isCheckingAvailability={isCheckingAvailability}
              isAvailable={isAvailable}
              selectedPlan={selectedPlan}
              previewDeposit={previewDeposit}
              canSubmitBooking={canSubmitBooking}
              isSubmittingBooking={isSubmittingBooking}
              bookingFeedback={bookingFeedback}
            />
          )}
        </aside>
      </form>
    </div>
  );
}

export default ReservasSalon;
