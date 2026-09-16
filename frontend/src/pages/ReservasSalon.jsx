import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { checkHallAvailability, createHallBooking } from '../services/reservasSalonService';

/**
 * Pagina del modulo de reservas del salon de eventos.
 *
 * Alcance de esta sesion (Sprint 2, Marvin): SOLO HU-007 (consultar
 * disponibilidad) y HU-013 (registrar reserva con plan). HU-014
 * (modificar, Kendall) y HU-015 (cancelar, Kendall) llegan cuando le
 * toque su parte del sprint -- no hay lista ni tabla de reservas del
 * salon aca todavia, porque esa vista (equivalente a HU-002 de
 * cancha) no existe como historia de usuario en este sprint.
 *
 * Por que NO reutiliza DisponibilidadGrid.jsx (a pesar del comentario
 * en ese archivo que invitaba a reutilizarlo para el salon): esa
 * grilla pinta el dia completo con el nombre de cada cliente que ya
 * tiene una celda ocupada, y esos datos salen de listar TODAS las
 * reservas del dia (GET .../field-bookings?date=..., HU-002 de
 * cancha). El salon no tiene un endpoint de listado en este sprint
 * (no es ninguna de las HU-007 a HU-015), asi que no hay de donde
 * sacar esa informacion sin inventar una consulta que nadie pidio.
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

function ReservasSalon() {
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
