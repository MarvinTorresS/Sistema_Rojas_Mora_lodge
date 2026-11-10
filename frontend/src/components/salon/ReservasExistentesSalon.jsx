import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listHallBookings, getHallBooking, updateHallBooking, cancelHallBooking,
} from '../../services/reservasSalonService';
import FieldBookingDialog from '../FieldBookingDialog';
import FieldListSwitch from '../FieldListSwitch';
import { shiftFieldDate } from '../FieldDateStrip';
import {
  HALL_DEFAULT_SCHEDULE, HALL_MAX_ADVANCE_DAYS, HALL_MIN_ADVANCE_DAYS, formatClock, localIsoDate,
} from '../../utils/hallSchedule';

/**
 * "Reservas existentes" del salon de eventos (HU-014 editar, HU-015 cancelar),
 * con la misma presentacion que el listado de la cancha:
 *   - pestañas "Reservas del dia" / "Todas las reservas" (FieldListSwitch),
 *   - "Todas": recientes y proximas, o archivo por semana, con paginacion,
 *   - editar y cancelar se hacen en un cuadro (FieldBookingDialog), igual que
 *     la cancelacion de la cancha, para que no quede una pantalla suelta.
 *
 * El salon se reserva por DIA (entrada y salida fijas), asi que editar solo
 * cambia el dia: cliente, salon, estado y origen se conservan. Cancelar pide
 * confirmacion, el motivo es opcional y no hay devoluciones.
 */

const TZ = 'America/Costa_Rica';
const STATUS_LABELS = {
  pending: 'Pendiente', active: 'Activa', checked_in: 'Ingresada', completed: 'Completada', cancelled: 'Cancelada', rejected: 'Rechazada',
};
const dateFormat = new Intl.DateTimeFormat('es-CR', { timeZone: TZ, dateStyle: 'short' });
const timeFormat = new Intl.DateTimeFormat('es-CR', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('es-CR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
const longDateFormat = new Intl.DateTimeFormat('es-CR', { timeZone: TZ, dateStyle: 'long' });
const asDay = (isoDate) => new Date(`${isoDate}T12:00:00-06:00`);

function localDay(value) {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const todayInCostaRica = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

// La hora de fin muestra tambien la fecha cuando el evento termina otro dia.
function endLabel(booking) {
  const sameDay = dateFormat.format(new Date(booking.startDatetime)) === dateFormat.format(new Date(booking.endDatetime));
  return sameDay ? timeFormat.format(new Date(booking.endDatetime)) : dateTimeFormat.format(new Date(booking.endDatetime));
}

const canAct = (booking) => booking.status !== 'cancelled';

function ActionButtons({ booking, busy, onEdit, onCancel }) {
  return (
    <>
      <button type="button" aria-label={`Editar reserva ${booking.bookingId}`} disabled={busy || !canAct(booking)}
        onClick={() => onEdit(booking.bookingId)} className="rounded-lg border border-line px-3 py-2 text-primary-800 disabled:opacity-50">Editar</button>
      <button type="button" aria-label={`Cancelar reserva ${booking.bookingId}`} disabled={busy || !canAct(booking)}
        onClick={() => onCancel(booking)} className="ml-2 rounded-lg border border-line px-3 py-2 text-coral-600 disabled:opacity-50">Cancelar reserva</button>
    </>
  );
}

/** Pestaña "Reservas del dia": las del dia elegido en el formulario, por hora. */
function HallDayList({ date, reloadKey, busy, onEdit, onCancel, onRegister }) {
  const [state, setState] = useState({ status: 'loading' });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    listHallBookings({ date, page: 1, pageSize: 100 }).then(({ data }) => {
      if (current) setState({ status: 'success', data });
    }).catch((error) => {
      if (current) setState({ status: 'error', message: error.message });
    });
    return () => { current = false; };
  }, [date, reloadKey, retry]);

  const label = new Intl.DateTimeFormat('es-CR', { timeZone: TZ, dateStyle: 'full' }).format(new Date(`${date}T12:00:00-06:00`));
  const items = state.status === 'success'
    ? state.data.filter((booking) => !['cancelled', 'rejected'].includes(booking.status))
      .sort((a, b) => new Date(a.startDatetime) - new Date(b.startDatetime))
    : [];
  return (
    <div className="pt-1" aria-live="polite" aria-busy={state.status === 'loading'}>
      <h3 className="text-sm font-semibold">Reservas del día</h3>
      <p className="text-xs text-muted">{label}</p>
      {state.status === 'loading' && <p className="mt-3 text-xs text-faint">Cargando reservas…</p>}
      {state.status === 'error' && (
        <div className="mt-3">
          <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{state.message}</p>
          <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 rounded-lg border border-line px-3 py-2 text-xs">Reintentar</button>
        </div>
      )}
      {state.status === 'success' && items.length === 0 && (
        <div className="mt-3">
          <p className="text-xs text-faint">Sin reservas registradas para este día.</p>
          {onRegister && <button type="button" onClick={onRegister} className="bmb-link-button mt-2">Elegir fecha</button>}
        </div>
      )}
      {state.status === 'success' && items.length > 0 && (
        <ul className="mt-3 space-y-3">
          {items.map((booking) => (
            <li key={booking.bookingId} className="bmb-day-item">
              <div>
                <p className="text-sm font-medium text-ink">{booking.customer?.fullName ?? 'Sin nombre'}</p>
                <p className="text-xs text-faint">
                  {booking.customer?.phone && <>{booking.customer.phone} · </>}
                  Entrada {timeFormat.format(new Date(booking.startDatetime))} · Salida {endLabel(booking)}
                </p>
                <span className={`bmb-chip ${booking.status === 'pending' ? 'is-pending' : ''}`}>{STATUS_LABELS[booking.status] ?? booking.status}</span>
              </div>
              <div className="bmb-day-actions"><ActionButtons booking={booking} busy={busy} onEdit={onEdit} onCancel={onCancel} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Pestaña "Todas las reservas": recientes y proximas / archivo por semana. */
function HallAllList({ reloadKey, busy, onEdit, onCancel, onRegister }) {
  const [archive, setArchive] = useState(false);
  const [week, setWeek] = useState(0);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ status: 'loading' });
  const today = todayInCostaRica();
  const cutoff = shiftFieldDate(today, -7);
  const dateFrom = archive ? shiftFieldDate(cutoff, -7 * (week + 1)) : cutoff;
  const dateBefore = archive ? shiftFieldDate(cutoff, -7 * week) : undefined;
  const labelDate = (value) => dateFormat.format(new Date(`${value}T12:00:00-06:00`));

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    listHallBookings({ page, pageSize: 20, dateFrom, dateBefore }).then(({ data, meta }) => {
      if (!current) return;
      if (page > 1 && meta.totalPages > 0 && page > meta.totalPages) {
        setPage(Math.max(1, meta.totalPages));
        return;
      }
      setState({ status: 'success', data, meta });
    }).catch((error) => {
      if (current) setState({ status: 'error', message: error.message });
    });
    return () => { current = false; };
  }, [page, retry, reloadKey, dateFrom, dateBefore]);

  return (
    <div className="pt-1">
      <h3 id="hall-list-title" className="text-lg font-semibold">Listado de reservas del salón</h3>
      <p className="mt-1 text-sm text-muted">
        {archive ? `Archivo · del ${labelDate(dateFrom)} al ${labelDate(shiftFieldDate(dateBefore, -1))}` : 'Últimos siete días y próximas reservas.'} Ordenadas por fecha, las más recientes primero. 20 registros por página.
      </p>
      <div className="bmb-archive-controls">
        <button type="button" aria-pressed={!archive} onClick={() => { setArchive(false); setPage(1); }}>Recientes y próximas</button>
        <button type="button" aria-pressed={archive} onClick={() => { setArchive(true); setWeek(0); setPage(1); }}>Archivo por semana</button>
      </div>
      {archive && (
        <nav aria-label="Semanas del archivo" className="bmb-archive-weeks">
          <button type="button" onClick={() => { setWeek((value) => value + 1); setPage(1); }}>← Semana anterior</button>
          <button type="button" disabled={week === 0} onClick={() => { setWeek((value) => value - 1); setPage(1); }}>Semana siguiente →</button>
        </nav>
      )}
      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <p role="status" className="mt-3">Cargando reservas…</p>}
        {state.status === 'error' && (
          <div className="mt-3">
            <p role="alert">{state.message}</p>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 rounded-lg border border-line px-3 py-2 text-sm">Reintentar</button>
          </div>
        )}
        {state.status === 'success' && (state.meta.total === 0 ? (
          <div className="mt-3">
            <p>{archive ? 'No hay reservas archivadas en esta semana.' : 'No hay reservas del salón.'}</p>
            {onRegister && <button type="button" onClick={onRegister} className="mt-3 rounded-lg bg-primary-700 px-4 py-2 text-white">Registrar reserva</button>}
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm">{state.meta.total} reservas registradas</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Reservas del salón</caption>
                <thead>
                  <tr>{['Reserva', 'Cliente', 'Teléfono', 'Fecha', 'Entrada', 'Salida', 'Estado', 'Origen', 'Acciones'].map((label) => (
                    <th key={label} scope="col" className="whitespace-nowrap border-b border-line p-2">{label}</th>
                  ))}</tr>
                </thead>
                <tbody>{state.data.map((booking) => (
                  <tr key={booking.bookingId}>
                    <td className="border-b border-line p-2">#{booking.bookingId}</td>
                    <td className="border-b border-line p-2">{booking.customer?.fullName}</td>
                    <td className="whitespace-nowrap border-b border-line p-2">{booking.customer?.phone}</td>
                    <td className="whitespace-nowrap border-b border-line p-2">{dateFormat.format(new Date(booking.startDatetime))}</td>
                    <td className="whitespace-nowrap border-b border-line p-2">{timeFormat.format(new Date(booking.startDatetime))}</td>
                    <td className="whitespace-nowrap border-b border-line p-2">{endLabel(booking)}</td>
                    <td className="border-b border-line p-2">{STATUS_LABELS[booking.status] ?? booking.status}</td>
                    <td className="border-b border-line p-2">{booking.originChannel}</td>
                    <td className="whitespace-nowrap border-b border-line p-2"><ActionButtons booking={booking} busy={busy} onEdit={onEdit} onCancel={onCancel} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <nav aria-label="Paginación del listado del salón" className="mt-3 flex items-center gap-3 text-sm">
              <button type="button" disabled={busy || page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-line px-3 py-2 disabled:opacity-50">Anterior</button>
              <span>Página {state.meta.page ?? page} de {state.meta.totalPages}</span>
              <button type="button" disabled={busy || page >= state.meta.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-line px-3 py-2 disabled:opacity-50">Siguiente</button>
            </nav>
          </>
        ))}
      </div>
    </div>
  );
}

// HU-014 / HU-015: estado independiente del alta; los datos salen siempre del
// servidor, incluso despues de recargar la pagina o crear otra reserva.
export function ExistingHallBookings({
  refreshVersion = 0, onUpdated, date, initialView = 'day', onRegister,
}) {
  const [view, setView] = useState(initialView);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState(null);
  // Lo unico que se edita es el dia de la reserva (yyyy-mm-dd).
  const [draftDate, setDraftDate] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelRequest = useRef(false);
  const [feedback, setFeedback] = useState({ status: 'idle', message: '' });
  const busy = isCancelling || feedback.status === 'loading' || feedback.status === 'saving';
  const dialogOpen = Boolean(selected || cancelTarget);
  const day = date ?? todayInCostaRica();
  // Cualquier cambio externo (nueva reserva) o propio recarga la lista visible.
  const listKey = reloadKey + refreshVersion;
  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  async function edit(bookingId) {
    setFeedback({ status: 'loading', message: 'Cargando reserva…' });
    try {
      const booking = await getHallBooking(bookingId);
      if (booking.status === 'cancelled') throw new Error('Una reserva cancelada no puede modificarse.');
      setSelected(booking);
      setDraftDate(booking.date ?? localDay(booking.startDatetime));
      setFeedback({ status: 'idle', message: '' });
    } catch (error) { setFeedback({ status: 'error', message: error.message }); }
  }

  function cancel() {
    setDraftDate('');
    setSelected(null);
    setFeedback({ status: 'idle', message: '' });
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setFeedback({ status: 'saving', message: 'Guardando cambios…' });
    try {
      await updateHallBooking(selected.bookingId, { date: draftDate });
      cancel();
      onUpdated?.();
      reload();
      setFeedback({ status: 'success', message: 'Reserva modificada correctamente.' });
    } catch (error) { setFeedback({ status: 'error', message: error.message }); }
  }

  function openCancellation(booking) {
    setCancelTarget(booking);
    setCancelReason('');
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
      await cancelHallBooking(cancelTarget.bookingId,
        cancelReason.trim() ? { cancellationReason: cancelReason.trim() } : {});
      setCancelTarget(null);
      setCancelReason('');
      onUpdated?.();
      reload();
      setFeedback({ status: 'success', message: 'Reserva cancelada correctamente. No se ha realizado ninguna devolución.' });
    } catch (error) {
      setFeedback({ status: 'error', message: error.message });
    } finally {
      cancelRequest.current = false;
      setIsCancelling(false);
    }
  }

  const dateLabel = (value) => dateTimeFormat.format(new Date(value));
  const editSchedule = {
    checkInTime: selected?.checkInTime ?? HALL_DEFAULT_SCHEDULE.checkInTime,
    checkOutTime: selected?.checkOutTime ?? HALL_DEFAULT_SCHEDULE.checkOutTime,
  };
  const inDialogError = feedback.status === 'error' && dialogOpen;

  return (
    <section aria-label="Administrar reservas existentes" className="bmb-card bmb-lists space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Reservas existentes</h3>
        <button type="button" onClick={reload} disabled={busy} className="rounded-lg border border-line px-3 py-2 text-sm">Actualizar reservas</button>
      </div>
      {!dialogOpen && feedback.message && (
        <p role={feedback.status === 'error' ? 'alert' : 'status'}
          className={feedback.status === 'success' ? 'bmb-success !mt-0' : 'my-3'}>{feedback.message}</p>
      )}

      <FieldListSwitch value={view} onChange={setView} label="Listado de reservas del salón" idPrefix="hall" />
      {view === 'day' ? (
        <div role="tabpanel" id="hall-panel-day" aria-labelledby="hall-tab-day">
          <HallDayList date={day} reloadKey={listKey} busy={busy} onEdit={edit} onCancel={openCancellation} onRegister={onRegister} />
        </div>
      ) : (
        <div role="tabpanel" id="hall-panel-all" aria-labelledby="hall-tab-all">
          <HallAllList reloadKey={listKey} busy={busy} onEdit={edit} onCancel={openCancellation} onRegister={onRegister} />
        </div>
      )}

      {selected && (
        <FieldBookingDialog title="Editar reserva" kicker="Día de la reserva" busy={busy} onClose={cancel}>
          <form onSubmit={save} className="mt-4 space-y-3">
            <h4 className="font-semibold">Editar reserva #{selected.bookingId}</h4>
            <p>{selected.customer?.fullName} · {selected.customer?.phone}</p>
            <p className="text-sm text-muted">Cliente, salón, estado y origen se conservan. Solo se cambia el día.</p>
            <fieldset disabled={busy} className="space-y-3">
              <label className="block text-xs font-medium text-muted">Fecha de la reserva
                <input aria-label="Fecha de la reserva" type="date" required value={draftDate}
                  min={localIsoDate(HALL_MIN_ADVANCE_DAYS)} max={localIsoDate(HALL_MAX_ADVANCE_DAYS)}
                  onChange={(event) => setDraftDate(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" />
              </label>
              <div aria-label="Horario de la reserva" className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-ink">
                {draftDate && <p className="mb-1 font-medium">{longDateFormat.format(asDay(draftDate))}</p>}
                <p>Entrada {formatClock(editSchedule.checkInTime)} · Salida {formatClock(editSchedule.checkOutTime)}</p>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={!draftDate} className="flex-1 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Guardar cambios</button>
                <button type="button" onClick={cancel} className="rounded-lg border border-line px-4 py-2 text-sm">Cancelar edición</button>
              </div>
            </fieldset>
            {feedback.status === 'saving' && <p role="status" className="text-sm text-muted">{feedback.message}</p>}
            {inDialogError && <p role="alert" className="rounded-lg bg-coral-50 p-3 text-sm text-coral-600">{feedback.message}</p>}
          </form>
        </FieldBookingDialog>
      )}

      {!selected && cancelTarget && (
        <FieldBookingDialog title="Cancelar reserva" kicker="Justificación y confirmación" busy={isCancelling} onClose={closeCancellation}>
          <form aria-label="Confirmar cancelación de reserva" onSubmit={confirmCancellation}
            onKeyDown={(event) => { if (event.key === 'Escape') closeCancellation(); }} className="mt-4 space-y-3">
            <h4 className="font-semibold">¿Cancelar reserva #{cancelTarget.bookingId}?</h4>
            <p>{cancelTarget.customer?.fullName} · {cancelTarget.customer?.phone}</p>
            <p>{dateLabel(cancelTarget.startDatetime)} — {dateLabel(cancelTarget.endDatetime)}</p>
            <p className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-ink">La reserva dejará de ocupar este día. Esta acción no realiza pagos ni devoluciones.</p>
            <fieldset disabled={isCancelling} className="space-y-3">
              <label className="block text-xs font-medium text-muted">Motivo (opcional)
                <textarea aria-label="Motivo de cancelación" maxLength={250} value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" />
              </label>
              <div className="flex gap-2">
                <button type="submit" className="flex-1 rounded-lg bg-coral-600 px-4 py-2 text-sm font-medium text-white">{isCancelling ? 'Cancelando…' : 'Confirmar cancelación'}</button>
                <button type="button" autoFocus onClick={closeCancellation} className="rounded-lg border border-line px-4 py-2 text-sm">Volver</button>
              </div>
            </fieldset>
            {inDialogError && <p role="alert" className="rounded-lg bg-coral-50 p-3 text-sm text-coral-600">{feedback.message}</p>}
          </form>
        </FieldBookingDialog>
      )}
    </section>
  );
}

export default ExistingHallBookings;
