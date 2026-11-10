import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Clock, PartyPopper } from 'lucide-react';
import { checkHallAvailability, createHallBooking, getHallSchedule } from '../services/reservasSalonService';
import CustomerPhoneConflict from '../components/common/CustomerPhoneConflict';
import { useCustomerPhoneConflict } from '../hooks/useCustomerPhoneConflict';
import useEnterTransition from '../hooks/useEnterTransition';
import FieldBookingDialog from '../components/FieldBookingDialog';
import { ExistingHallBookings } from '../components/salon/ReservasExistentesSalon';
import {
  GUEST_MESSAGES, isValidName, normalizePhone, typePhone,
} from '../components/common/guestData';
import {
  HALL_DEFAULT_SCHEDULE, HALL_MAX_ADVANCE_DAYS, HALL_MIN_ADVANCE_DAYS, formatClock, localIsoDate,
} from '../utils/hallSchedule';
import './ReservasCancha.css';
import './ReservasSalon.css';

// HU-014/HU-015: el listado, la edicion y la cancelacion viven en
// components/salon/ReservasExistentesSalon.jsx (mismo estilo que la cancha).
export { ExistingHallBookings };

/**
 * Pagina del modulo de reservas del salon de eventos.
 *
 * HU-007/HU-013: disponibilidad y alta de la reserva. HU-014 agrega un
 * listado paginado y el cambio de dia con estado independiente. HU-015 agrega
 * cancelacion con confirmacion independiente de la edicion.
 *
 * El salon se reserva POR DIA, como un hotel: cada reserva tiene una hora de
 * entrada y una de salida (iguales para todos, las fija el servidor) y no se
 * pueden cruzar dos clientes el mismo dia porque el salon se limpia entre una
 * reserva y otra, y se reserva con al menos un dia de anticipacion (desde
 * mañana). Por eso ya no hay planes de precio, horas extra ni anticipo:
 * solo se elige la fecha.
 *
 * Sprint 4 (Alison): la pantalla adopta el lenguaje visual de la cancha
 * (La Bombonera). Los "Datos del cliente" se piden en el cuadro "Nueva reserva /
 * Un ultimo paso" (nombre, telefono, fecha y horario elegidos, aviso de
 * telefono ya registrado, "Registrar reserva" y "Cancelar") que abre el boton
 * "Continuar con la reserva" del resumen. Las reservas existentes se presentan
 * como en la cancha: pestañas "Reservas del dia" / "Todas las reservas",
 * archivo por semana y edicion/cancelacion en cuadros.
 */

// Mismo criterio que CANCHA_RESOURCE_ID en ReservasCancha.jsx: el backend si
// soporta varios salones (resourceId es un parametro generico), pero el
// frontend todavia no tiene forma de listarlos. Este es el unico salon que
// existe, sembrado por el seeder 20260916000001-seed-event-hall-resource.js.
const EVENT_HALL_RESOURCE_ID = 2;

const INITIAL_BOOKING_FORM = { customerName: '', customerPhone: '' };
const IDLE_AVAILABILITY = { status: 'idle', available: null, reason: null, message: '' };

// "a, b y c" para listar lo que falta en el aviso de campos incompletos.
function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

const longDateFormatter = new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeZone: 'America/Costa_Rica' });
const shortDateFormatter = new Intl.DateTimeFormat('es-CR', {
  timeZone: 'America/Costa_Rica', weekday: 'short', day: 'numeric', month: 'short',
});
const asDate = (isoDate) => new Date(`${isoDate}T12:00:00-06:00`);

/** Una fila "etiqueta / valor", reutilizada en la confirmacion. */
function SummaryRow({ label, value, emphasis = false }) {
  return (
    <div className={`bmb-row ${emphasis ? 'is-emphasis' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/**
 * Resumen de la reserva (panel lateral, igual que la cancha): fecha, entrada y
 * salida, estado de la disponibilidad y el boton "Continuar con la reserva" que
 * abre el cuadro con los datos del cliente. El boton nunca queda "muerto": si
 * falta algo, al pulsarlo se explica que falta (ver handleContinue).
 */
function ReservationSummaryPanel({
  date, schedule, availability, isCheckingAvailability, isAvailable, canContinue, onContinue, continueMessage,
}) {
  const entered = useEnterTransition();
  return (
    <section
      aria-label="Resumen de la reserva"
      className={`bmb-summary transition-all duration-300 ease-out ${entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
    >
      <p className="bmb-kicker">Tu próxima reserva</p>
      <div className="bmb-venue">
        <span className="bmb-venue-badge" aria-hidden="true"><PartyPopper size={22} /></span>
        <div><strong>Salón de eventos</strong><small>Salón principal · Rojas Mora</small></div>
      </div>

      <dl>
        <div><dt>Fecha</dt><dd>{date ? shortDateFormatter.format(asDate(date)) : '—'}</dd></div>
        <div><dt>Entrada</dt><dd>{formatClock(schedule.checkInTime)}</dd></div>
        <div><dt>Salida</dt><dd>{formatClock(schedule.checkOutTime)}</dd></div>
        <div><dt>Reserva</dt><dd>Día completo</dd></div>
      </dl>

      <div className="bmb-availability" aria-live="polite">
        {isCheckingAvailability && <span className="bmb-pill">Consultando disponibilidad…</span>}
        {!isCheckingAvailability && availability.status === 'idle' && <span className="bmb-pill">Falta consultar disponibilidad</span>}
        {isAvailable && <span className="bmb-pill is-ok">✓ Disponible</span>}
        {availability.status === 'checked' && availability.available === false && <span className="bmb-pill is-bad">✕ No disponible</span>}
      </div>

      <button type="button" className="bmb-continue bmb-continue-spaced" disabled={!canContinue} onClick={onContinue}>
        <span>Continuar con la reserva</span><ArrowRight size={17} />
      </button>
      {continueMessage
        ? <p role="alert" className="bmb-selection-error">{continueMessage}</p>
        : <p className="bmb-helper">Podés cambiar la fecha antes de registrar la reserva.</p>}
    </section>
  );
}

/**
 * Contenido del panel lateral DESPUES de confirmar: el "recibo" de la reserva
 * ya creada. onReset vuelve al resumen (limpia `confirmation` para la siguiente
 * reserva).
 */
function ReservationConfirmationPanel({ confirmation, schedule, onReset }) {
  const entered = useEnterTransition();
  return (
    <div
      className={`bmb-confirmed transition-all duration-300 ease-out ${entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
    >
      <span className="bmb-check" aria-hidden="true">✓</span>

      <div>
        <h3>Reserva confirmada</h3>
        <p className="bmb-helper">Reserva #{confirmation.booking.bookingId} registrada correctamente.</p>
      </div>

      <div className="bmb-receipt">
        <SummaryRow label="Fecha" value={longDateFormatter.format(asDate(confirmation.date))} />
        <SummaryRow label="Entrada" value={formatClock(confirmation.checkInTime ?? schedule.checkInTime)} />
        <SummaryRow label="Salida" value={formatClock(confirmation.checkOutTime ?? schedule.checkOutTime)} />
      </div>

      <button type="button" onClick={onReset} className="bmb-continue">
        <span>Registrar otra reserva</span><ArrowRight size={17} />
      </button>
    </div>
  );
}

function ReservasSalon() {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [date, setDate] = useState(() => localIsoDate(HALL_MIN_ADVANCE_DAYS));
  const [schedule, setSchedule] = useState(HALL_DEFAULT_SCHEDULE);
  const [availability, setAvailability] = useState(IDLE_AVAILABILITY);
  const [bookingForm, setBookingForm] = useState(INITIAL_BOOKING_FORM);
  const [bookingFeedback, setBookingFeedback] = useState({ status: 'idle', message: '' });
  // Aviso "este teléfono ya es de otra persona" (compartido con cancha).
  const { conflict: phoneConflict, captureConflict, clearConflict } = useCustomerPhoneConflict();
  const [confirmation, setConfirmation] = useState(null);
  // Cuadro "Nueva reserva / Un último paso" con los datos del cliente.
  const [showClientDialog, setShowClientDialog] = useState(false);
  // Se activa al intentar registrar con nombre/teléfono incompletos: desde
  // ahi los avisos se muestran y se van quitando solos conforme se completa.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // Se activa al pulsar "Continuar con la reserva" con algo pendiente.
  const [attemptedContinue, setAttemptedContinue] = useState(false);

  // Horario de entrada y salida: lo fija el servidor. Mientras responde (o si
  // no responde) se queda con el horario por defecto de utils/hallSchedule.js.
  useEffect(() => {
    let cancelled = false;
    getHallSchedule()
      .then((result) => {
        if (cancelled || !result?.checkInTime || !result?.checkOutTime) return;
        setSchedule({ checkInTime: result.checkInTime, checkOutTime: result.checkOutTime });
      })
      .catch(() => { /* respaldo por defecto */ });
    return () => { cancelled = true; };
  }, []);

  function handleDateChange(event) {
    setDate(event.target.value);
    // Cambiar el dia consultado invalida cualquier resultado de disponibilidad
    // anterior: no deberia quedar "Disponible" para un dia que ya se cambio.
    setAvailability(IDLE_AVAILABILITY);
    setConfirmation(null);
  }

  async function handleCheckAvailability() {
    if (!date) {
      setAvailability({ status: 'error', available: null, reason: null, message: 'Elegí la fecha de la reserva.' });
      return;
    }
    setAvailability({ status: 'loading', available: null, reason: null, message: '' });
    try {
      const result = await checkHallAvailability({ resourceId: EVENT_HALL_RESOURCE_ID, date });
      if (result.checkInTime && result.checkOutTime) {
        setSchedule({ checkInTime: result.checkInTime, checkOutTime: result.checkOutTime });
      }
      setAvailability({ status: 'checked', available: result.available, reason: result.reason, message: '' });
    } catch (error) {
      setAvailability({ status: 'error', available: null, reason: null, message: error.message });
    }
  }

  function handleBookingFormChange(event) {
    const { name, value } = event.target;
    // Cambiar nombre o teléfono invalida el aviso de teléfono ya registrado.
    if (name === 'customerName' || name === 'customerPhone') clearConflict();
    // En el teléfono no se dejan escribir letras ni símbolos.
    setBookingForm((prev) => ({ ...prev, [name]: name === 'customerPhone' ? typePhone(value) : value }));
  }

  // "Continuar con la reserva": solo abre el cuadro del cliente cuando la fecha
  // esta elegida y consultada como disponible; si no, dice que falta.
  function handleContinue() {
    if (confirmation || isSubmittingBooking) return;
    if (continueMissing.length > 0) {
      setAttemptedContinue(true);
      if (!date) document.getElementById('query-date')?.focus();
      return;
    }
    setAttemptedContinue(false);
    setBookingFeedback({ status: 'idle', message: '' });
    setShowClientDialog(true);
  }

  // Cierra el cuadro conservando lo escrito (la X o Escape).
  function closeClientDialog() {
    if (isSubmittingBooking) return;
    setShowClientDialog(false);
    setAttemptedSubmit(false);
    setBookingFeedback({ status: 'idle', message: '' });
    clearConflict();
  }

  // "Cancelar" del cuadro (igual que la cancha): descarta los datos del cliente.
  function handleCancelClientDialog() {
    setBookingForm(INITIAL_BOOKING_FORM);
    closeClientDialog();
  }

  function handleSubmitBooking(event) {
    event.preventDefault();
    submitBooking();
  }

  async function submitBooking() {
    if (confirmation || isSubmittingBooking) return;
    // Campo incompleto: no se envia nada, se avisa cual falta.
    if (missingFields.length > 0) {
      setAttemptedSubmit(true);
      return;
    }
    setAttemptedSubmit(false);
    setBookingFeedback({ status: 'loading', message: '' });
    try {
      const result = await createHallBooking({
        resourceId: EVENT_HALL_RESOURCE_ID,
        customerName: bookingForm.customerName.trim(),
        customerPhone: normalizePhone(bookingForm.customerPhone) ?? bookingForm.customerPhone.trim(),
        date,
      });
      clearConflict();
      setConfirmation(result);
      setShowClientDialog(false);
      setRefreshVersion((value) => value + 1);
      setBookingFeedback({ status: 'success', message: 'Reserva registrada correctamente.' });
      setBookingForm(INITIAL_BOOKING_FORM);
      // La disponibilidad consultada ya no aplica: el dia que estaba libre
      // ahora tiene esta reserva.
      setAvailability(IDLE_AVAILABILITY);
    } catch (error) {
      // El teléfono está registrado con otro nombre: se avisa que no
      // coincide (sin revelar de quién es), dentro del cuadro del cliente.
      if (captureConflict(error)) {
        setBookingFeedback({ status: 'idle', message: '' });
        return;
      }
      setBookingFeedback({ status: 'error', message: error.message });
    }
  }

  const isCheckingAvailability = availability.status === 'loading';
  const isSubmittingBooking = bookingFeedback.status === 'loading';
  const isAvailable = availability.status === 'checked' && availability.available === true;

  // Antes de abrir el cuadro del cliente: la fecha y la disponibilidad.
  const continueMissing = [
    !date && 'elegir la fecha',
    date && !isAvailable && 'consultar la disponibilidad',
  ].filter(Boolean);
  const continueMessage = attemptedContinue && continueMissing.length > 0
    ? `Para continuar falta: ${joinList(continueMissing)}.`
    : '';
  // Dentro del cuadro: nombre sin números y teléfono de 8 dígitos (misma regla
  // que el servidor).
  const nameEmpty = bookingForm.customerName.trim().length < 3;
  const phoneEmpty = bookingForm.customerPhone.trim() === '';
  const nameMissing = nameEmpty || !isValidName(bookingForm.customerName);
  const phoneMissing = normalizePhone(bookingForm.customerPhone) === null;
  const missingFields = [
    ...continueMissing,
    nameMissing && (nameEmpty ? 'el nombre del cliente' : 'corregir el nombre del cliente'),
    phoneMissing && (phoneEmpty ? 'el teléfono del cliente' : 'corregir el teléfono del cliente'),
  ].filter(Boolean);
  const incompleteMessage = attemptedSubmit && missingFields.length > 0
    ? `Para reservar falta: ${joinList(missingFields)}.`
    : '';
  // Solo se deshabilita cuando no hay nada que continuar (ya confirmada,
  // guardando o consultando).
  const canContinue = !confirmation && !isSubmittingBooking && !isCheckingAvailability;

  const inputTone = 'mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary-200';

  return (
    <div className="bombonera bmb-salon">
      <div className="bmb-content">
        <Link to="/reservar" className="bmb-back"><ArrowLeft size={16} />Volver a elegir espacio</Link>
        <header className="bmb-intro">
          <div>
            <p className="bmb-eyebrow">ROJAS MORA SPORTS & LODGE</p>
            <h1><span>Salón de eventos</span>Tu evento, a tu medida</h1>
          </div>
          <div className="bmb-intro-side">
            <p>Elegí el día, consultá la disponibilidad<br />y registrá la reserva.</p>
          </div>
        </header>

        <div className="bmb-layout">
          <div className="bmb-main">
            <section className="bmb-card bmb-schedule" aria-label="Elegir la fecha de la reserva">
              <div className="bmb-step-row">
                <div className="bmb-step"><span>1</span><h2>Fecha de la reserva</h2></div>
              </div>

              <div className="bmb-hall-day">
                <div>
                  <label htmlFor="query-date" className="block text-xs font-medium text-muted">Fecha</label>
                  <input
                    id="query-date" name="date" type="date"
                    min={localIsoDate(HALL_MIN_ADVANCE_DAYS)} max={localIsoDate(HALL_MAX_ADVANCE_DAYS)}
                    value={date} onChange={handleDateChange}
                    className={`${inputTone} border-faint`}
                  />
                </div>
                <div className="bmb-hall-times" aria-label="Horario del salón">
                  <div className="bmb-hall-time">
                    <span className="bmb-hall-time-icon" aria-hidden="true"><CalendarDays size={16} /></span>
                    <div><small>Entrada</small><strong>{formatClock(schedule.checkInTime)}</strong></div>
                  </div>
                  <div className="bmb-hall-time">
                    <span className="bmb-hall-time-icon" aria-hidden="true"><Clock size={16} /></span>
                    <div><small>Salida</small><strong>{formatClock(schedule.checkOutTime)}</strong></div>
                  </div>
                </div>
              </div>
              <p className="bmb-hall-note">
                El salón se reserva por día, como un hotel: un solo cliente por día, con la misma hora de entrada y de
                salida. Así hay tiempo para la limpieza y los horarios de clientes distintos nunca se cruzan. Se reserva
                con al menos un día de anticipación (desde mañana).
              </p>

              <button
                type="button" onClick={handleCheckAvailability} disabled={isCheckingAvailability}
                className="bmb-action mt-4"
              >
                {isCheckingAvailability ? 'Consultando…' : 'Consultar disponibilidad'}
              </button>

              {availability.status === 'error' && (
                <p className="mt-2 rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{availability.message}</p>
              )}
              {isAvailable && (
                <p className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-600">
                  El salon esta disponible ese dia.
                </p>
              )}
              {availability.status === 'checked' && availability.available === false && (
                <p className="mt-2 rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{availability.reason}</p>
              )}
            </section>

            {/* Reservas existentes (HU-014/015) debajo de la fecha, como la
                cancha: primero se arma la reserva y despues se administran. */}
            <ExistingHallBookings
              refreshVersion={refreshVersion}
              date={date || localIsoDate()}
              onRegister={() => {
                const input = document.getElementById('query-date');
                input?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                input?.focus({ preventScroll: true });
              }}
              onUpdated={() => {
                setAvailability(IDLE_AVAILABILITY);
                setConfirmation(null);
              }}
            />
          </div>

          <aside className="bmb-card bmb-side">
            {confirmation ? (
              <ReservationConfirmationPanel
                confirmation={confirmation}
                schedule={schedule}
                onReset={() => { setConfirmation(null); setDate(localIsoDate(HALL_MIN_ADVANCE_DAYS)); }}
              />
            ) : (
              <ReservationSummaryPanel
                date={date}
                schedule={schedule}
                availability={availability}
                isCheckingAvailability={isCheckingAvailability}
                isAvailable={isAvailable}
                canContinue={canContinue}
                onContinue={handleContinue}
                continueMessage={continueMessage}
              />
            )}
          </aside>
        </div>

        {showClientDialog && (
          <FieldBookingDialog busy={isSubmittingBooking} onClose={closeClientDialog}>
            <p className="mt-1 text-xs text-muted">Salón de eventos · Rojas Mora Sports & Lodge</p>

            <form onSubmit={handleSubmitBooking} noValidate className="mt-4 space-y-3">
              <div>
                <label htmlFor="customerName" className="block text-xs font-medium text-muted">Nombre del cliente</label>
                <input
                  id="customerName" name="customerName" type="text" required
                  minLength={3} maxLength={150}
                  value={bookingForm.customerName} onChange={handleBookingFormChange}
                  aria-invalid={(attemptedSubmit && nameMissing) || undefined}
                  className={`${inputTone} ${attemptedSubmit && nameMissing ? 'border-coral-400' : 'border-line'}`}
                  placeholder="Ej. Luis Vargas Mora"
                />
                {attemptedSubmit && nameMissing && (
                  <p className="mt-1 text-xs text-coral-600">
                    {nameEmpty ? 'Ingresá el nombre del cliente (mínimo 3 caracteres).' : GUEST_MESSAGES.NAME}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="customerPhone" className="block text-xs font-medium text-muted">Teléfono</label>
                <input
                  id="customerPhone" name="customerPhone" type="tel" inputMode="tel" required
                  maxLength={20} placeholder="Ej. 8888-7777"
                  value={bookingForm.customerPhone} onChange={handleBookingFormChange}
                  aria-invalid={(attemptedSubmit && phoneMissing) || undefined}
                  className={`${inputTone} ${attemptedSubmit && phoneMissing ? 'border-coral-400' : 'border-line'}`}
                />
                {attemptedSubmit && phoneMissing && (
                  <p className="mt-1 text-xs text-coral-600">
                    {phoneEmpty ? 'Ingresá el teléfono del cliente (8 dígitos).' : GUEST_MESSAGES.PHONE}
                  </p>
                )}
              </div>

              <div>
                <span className="block text-xs font-medium text-muted">Fecha y horario elegidos</span>
                <p className="mt-1 text-sm">{date ? longDateFormatter.format(asDate(date)) : '—'}</p>
                <p className="mt-1 rounded-lg border border-dashed border-line bg-surface-alt px-3 py-2 text-sm text-ink">
                  Entrada {formatClock(schedule.checkInTime)} · Salida {formatClock(schedule.checkOutTime)}
                </p>
              </div>

              <CustomerPhoneConflict conflict={phoneConflict} />

              {incompleteMessage && (
                <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{incompleteMessage}</p>
              )}
              {bookingFeedback.status === 'error' && (
                <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{bookingFeedback.message}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit" disabled={isSubmittingBooking}
                  className="flex-1 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
                >
                  {isSubmittingBooking ? 'Guardando…' : 'Registrar reserva'}
                </button>
                <button
                  type="button" onClick={handleCancelClientDialog} disabled={isSubmittingBooking}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-surface-alt disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </FieldBookingDialog>
        )}
      </div>
    </div>
  );
}

export default ReservasSalon;
