import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { createFieldBooking, listFieldBookings, searchFieldBookings, filterFieldBookingsByStatus } from '../services/reservasCanchaService';
import DisponibilidadGrid from '../components/DisponibilidadGrid';

/**
 * Página del módulo "Cancha sintética" (HU-001 a HU-006).
 *
 * HU-001 (registrar reserva) ya está implementada: el panel lateral
 * pasó de ser una plantilla vacía a un formulario real conectado al
 * backend (POST /api/field-bookings). HU-002 consulta la ocupación y
 * HU-003 busca reservas en una sección independiente.
 *
 * Esta versión reemplaza los campos de hora de texto libre por una
 * grilla visual de disponibilidad (DisponibilidadGrid.jsx), a pedido de
 * Marvin, para que el recepcionista vea de un vistazo qué horarios
 * están libres en vez de escribir una hora y enterarse recién al
 * enviar si chocaba con otra reserva (CA-2).
 *
 * Sirve como referencia de patrón para Wagner, Kendall y Alison cuando
 * conecten sus propias páginas de módulo a sus HU.
 */

// Recurso de ejemplo: en HU-002 (listar) esto debería venir de un
// GET /api/resources en vez de estar fijo acá. Por ahora, para no
// bloquear HU-001 esperando ese endpoint (que no existe todavía),
// se deja fijo el id de la cancha sintética con la que se probó el
// backend.
const CANCHA_RESOURCE_ID = 1;

// Horario de operación de la cancha PARA LA GRILLA. Ajustado a pedido
// de Marvin (1:00 p.m. a 9:00 p.m.) para que, con bloques de 2 horas,
// entren exactamente 4 slots (1-3pm, 3-5pm, 5-7pm, 7-9pm) y la
// cuadrícula de 4 columnas quede completa, sin celdas vacías sobrando.
//
// Esto es SOLO el rango que pinta la grilla de ejemplo: HU-001 no
// valida en el backend un horario de apertura/cierre (ver
// reservasCancha.service.js — se dejó sin esa restricción a pedido de
// Marvin), así que este cambio no representa todavía una regla de
// negocio real, solo el horario que muestra esta vista mock. Si el
// negocio confirma un horario real de operación, debería validarse
// también en el service, no solo acá.
const OPENING_HOUR = 13; // 1:00 p.m.
const CLOSING_HOUR = 21; // 9:00 p.m.

// Duración fija de cada slot de la grilla, a pedido de Marvin (antes
// eran bloques de 1h). Es una simplificación deliberada para esta
// versión visual: HU-001 permite cualquier rango de horas, pero la
// grilla por ahora solo deja ELEGIR un punto de inicio y arma un bloque
// de 2 horas a partir de ahí. Si el negocio pide reservas de otra
// duración desde la grilla, esto se vuelve un segundo control (ej.
// "duración: 1h / 2h / 3h").
const SLOT_DURATION_HOURS = 2;

// Lista de reservas que alimenta la grilla y el panel "Reservas del
// día". HU-002 la conectó al backend: se carga con listFieldBookings()
// cada vez que cambia la fecha elegida (ver loadReservas en el
// componente) y se vuelve a pedir después de crear una. Arranca vacía
// mientras llega la primera respuesta.
const RESERVAS_INICIALES = [];

// Estados de reserva que efectivamente OCUPAN un horario en la grilla.
// Son los mismos que ACTIVE_BOOKING_STATUSES del backend
// (reservasCancha.service.js): una reserva 'cancelled' o 'rejected' ya
// liberó el horario y no debe pintar el slot como ocupado, y una
// 'completed' ya pasó. HU-002 trae TODAS las reservas del día; el filtro
// por estado para verlas todas es HU-004.
const SLOT_HOLDING_STATUSES = ['pending', 'active', 'checked_in'];

// yyyy-mm-dd (hora local) del inicio de una reserva que viene del
// backend en ISO/UTC. Mismo cuidado con la zona horaria que
// todayIsoDate(): se leen los componentes locales del Date, nunca se
// corta el string ISO (que está en UTC).
function isoToLocalDate(isoString) {
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Traduce una reserva tal como la devuelve el backend en HU-002
// ({ bookingId, status, startDatetime, customer: { fullName }, ... }) a
// la forma mínima que ya consumían la grilla y la lista lateral
// ({ id, cliente, date, hour, estado }), para no tener que tocar el
// resto del componente al pasar de datos en memoria a datos reales.
function mapBackendBookingToRow(booking) {
  return {
    id: booking.bookingId,
    cliente: booking.customer?.fullName ?? 'Sin nombre',
    date: isoToLocalDate(booking.startDatetime),
    hour: new Date(booking.startDatetime).getHours(),
    // Solo llegan acá reservas con estado que ocupa el horario (ver
    // SLOT_HOLDING_STATUSES): 'pending' son solicitudes web sin aprobar;
    // 'active'/'checked_in' ya están confirmadas.
    estado: booking.status === 'pending' ? 'Pendiente' : 'Confirmada',
  };
}

// yyyy-mm-dd de HOY en horario local (no toISOString, que usa UTC y
// puede quedar un día adelantado/atrasado según la zona horaria del
// navegador). Sirve como valor por defecto del selector de fecha y
// como límite mínimo (no se puede elegir un día ya pasado).
function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Valor inicial del formulario. selectedHour vive acá también (no es
// un useState aparte) porque conceptualmente ES un campo más del
// formulario, aunque se llene haciendo clic en la grilla en vez de
// tipeando. date arranca en HOY para que la grilla no aparezca vacía
// de entrada esperando que el usuario elija una fecha.
const INITIAL_FORM = {
  customerName: '',
  customerPhone: '',
  date: todayIsoDate(),
  selectedHour: null,
};

const timeFormatter = new Intl.DateTimeFormat('es-CR', { hour: 'numeric', minute: '2-digit' });
const searchDateFormatter = new Intl.DateTimeFormat('es-CR', { dateStyle: 'short', timeStyle: 'short' });
const SEARCH_STATUS_LABELS = {
  pending: 'Pendiente', active: 'Confirmada', rejected: 'Rechazada',
  checked_in: 'Ingresada', completed: 'Completada', cancelled: 'Cancelada',
};

// Formatea el yyyy-mm-dd elegido para mostrarlo legible junto al
// encabezado de la lista/grilla ("Reservas del día — lun. 15 sep.").
// Se arma la fecha con año/mes/día sueltos (no `new Date(dateString)`)
// para evitar el mismo corrimiento de zona horaria que resuelve
// todayIsoDate(): un string "yyyy-mm-dd" sin hora se interpreta en UTC.
const dateHeaderFormatter = new Intl.DateTimeFormat('es-CR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
function formatDateHeader(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return dateHeaderFormatter.format(new Date(year, month - 1, day));
}

// Arma las columnas de la grilla (una por bloque de SLOT_DURATION_HOURS
// dentro del horario de operación) para UN día específico, a partir de
// las reservas ya filtradas a ese mismo día (ver el filtro por
// `formData.date` en el componente). El incremento del bucle usa
// SLOT_DURATION_HOURS (no 1 fijo) a propósito: con bloques de 2 horas,
// avanzar de 1 en 1 generaría slots que se pisan entre sí (1-3pm y
// 2-4pm compartirían la hora 2-3pm), lo cual no tiene sentido para una
// grilla de horarios que no se superponen.
//
// `date` se recibe aparte (no alcanza con mirar las reservas) porque
// hace falta para decidir si ESTE día es hoy, y en ese caso poder
// marcar como 'past' los slots cuya hora de inicio ya pasó — no tendría
// sentido dejar que el recepcionista intente reservar una hora de hoy
// que ya quedó atrás.
//
// Es una función PURA (mismos argumentos -> mismo resultado, sin tocar
// nada externo) a propósito: eso permite probarla con un test unitario
// simple si hace falta más adelante, sin tener que renderizar el
// componente completo.
function buildSlotsFromReservations(reservations, date) {
  const slots = [];
  const isToday = date === todayIsoDate();
  const currentHour = new Date().getHours();

  for (let hour = OPENING_HOUR; hour < CLOSING_HOUR; hour += SLOT_DURATION_HOURS) {
    const reservation = reservations.find((r) => r.hour === hour);
    const hourLabel = timeFormatter.format(new Date(2000, 0, 1, hour));

    if (reservation) {
      slots.push({
        hour,
        hourLabel,
        status: reservation.estado === 'Pendiente' ? 'pending' : 'occupied',
        clientName: reservation.cliente,
      });
    } else if (isToday && hour <= currentHour) {
      slots.push({ hour, hourLabel, status: 'past' });
    } else {
      slots.push({ hour, hourLabel, status: 'available' });
    }
  }
  return slots;
}

// Convierte una hora entera (ej. 18) + una fecha (yyyy-mm-dd) en el par
// startDatetime/endDatetime ISO que espera el backend, usando la
// duración fija del slot.
function slotToIsoRange(date, hour) {
  const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
  const end = new Date(start.getTime() + SLOT_DURATION_HOURS * 60 * 60 * 1000);
  return { startDatetime: start.toISOString(), endDatetime: end.toISOString() };
}

function ReservasCancha() {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [reservas, setReservas] = useState(RESERVAS_INICIALES);
  // feedback agrupa estado + mensaje en un solo objeto porque siempre
  // cambian juntos (nunca hay un mensaje de error "idle", ni un estado
  // 'error' sin mensaje) — separarlos en dos variables sueltas
  // permitiría estados inconsistentes a mitad de una actualización.
  const [feedback, setFeedback] = useState({ status: 'idle', message: '' });
  // Estado de la carga del listado (HU-002), separado del feedback del
  // formulario: leer y crear son dos operaciones distintas y pueden
  // estar en estados diferentes a la vez.
  const [listState, setListState] = useState({ status: 'loading', message: '' });

  // HU-003 no modifica reservas, formData ni los slots de disponibilidad.
  const [searchForm, setSearchForm] = useState({ customerName: '', phone: '', date: '' });
  const [searchState, setSearchState] = useState({ status: 'idle', message: '', data: [], meta: null });
  const [searchCriteria, setSearchCriteria] = useState(null);

  // === HU-004 (Alison): filtro de reservas del día por estado ===
  // Opciones tal como las especifica la historia de usuario (no los 6
  // estados internos del ENUM de Booking.status): "Todas, Activas,
  // Canceladas", por defecto "Todas".
  const STATUS_FILTER_OPTIONS = [
    { value: '', label: 'Todas' },
    { value: 'active', label: 'Activas' },
    { value: 'cancelled', label: 'Canceladas' },
  ];

  const [statusFilter, setStatusFilter] = useState(''); // '' = "Todas"
  const [statusFilterState, setStatusFilterState] = useState({ status: 'idle', message: '', data: [] });

  // Evita que una respuesta VIEJA (ej. la de "Todas" que se dispara sola
  // al entrar a la pagina) pise el resultado de un filtro mas reciente
  // (ej. "Canceladas") si llega despues por timing de red. Cada llamada
  // a loadStatusFilter saca un numero de turno; si cuando responde el
  // servidor ese numero ya no es el mas reciente, se descarta.
  const statusFilterRequestId = useRef(0);

  async function loadStatusFilter(status) {
    const requestId = ++statusFilterRequestId.current;
    setStatusFilterState({ status: 'loading', message: '', data: [] });
    try {
      // "Todas" reutiliza el listado general de HU-002 (sin status);
      // un estado especifico usa el endpoint dedicado de HU-004.
      const result = status
        ? await filterFieldBookingsByStatus({ date: formData.date, status })
        : await listFieldBookings({ date: formData.date });
      if (requestId !== statusFilterRequestId.current) return; // respuesta vieja
      setStatusFilterState({ status: 'success', message: '', data: result.data });
    } catch (error) {
      if (requestId !== statusFilterRequestId.current) return; // respuesta vieja
      setStatusFilterState({ status: 'error', message: error.message, data: [] });
    }
  }

  // CA-1: "Cuando cambie el filtro de estado" — se dispara siempre,
  // incluso al volver a "Todas".
  function handleStatusFilterChange(event) {
    const value = event.target.value;
    setStatusFilter(value);
    loadStatusFilter(value);
  }

  // Carga los resultados apenas se monta la página (con "Todas" por
  // defecto) y cada vez que cambia la fecha. Antes esto solo corria si
  // statusFilterState.status !== 'idle', pero el estado INICIAL es
  // justamente 'idle' -- por eso "Todas" nunca mostraba nada hasta que
  // el usuario cambiaba el select una vez (y ya no podia volver a
  // "Todas" sin que se quedara en blanco otra vez).
  useEffect(() => {
    loadStatusFilter(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.date]);
  // === fin HU-004 ===

  async function loadSearch(criteria, page = 1) {
    setSearchState({ status: 'loading', message: '', data: [], meta: null });
    try {
      const result = await searchFieldBookings({ ...criteria, page });
      setSearchState({ status: 'success', message: '', data: result.data, meta: result.meta });
    } catch (error) {
      setSearchState({ status: 'error', message: error.message, data: [], meta: null });
    }
  }

  function handleSearch(event) {
    event.preventDefault();
    if (searchState.status === 'loading') return;
    const criteria = Object.fromEntries(Object.entries(searchForm)
      .map(([key, value]) => [key, value.trim()]).filter(([, value]) => value !== ''));
    if (Object.keys(criteria).length === 0) {
      setSearchState({ status: 'error', message: 'Ingresá al menos un criterio: cliente, teléfono o fecha.', data: [], meta: null });
      return;
    }
    setSearchCriteria(criteria);
    loadSearch(criteria);
  }

  // Trae del backend las reservas del día elegido. useCallback para que
  // su identidad solo cambie cuando cambia la fecha, y así el useEffect
  // de abajo no se dispare en cada render.
  const loadReservas = useCallback(async () => {
    setListState({ status: 'loading', message: '' });
    try {
      const { data } = await listFieldBookings({ date: formData.date });
      setReservas(
        data
          .filter((booking) => SLOT_HOLDING_STATUSES.includes(booking.status))
          .map(mapBackendBookingToRow),
      );
      setListState({ status: 'idle', message: '' });
    } catch (error) {
      setReservas([]);
      setListState({ status: 'error', message: error.message });
    }
  }, [formData.date]);

  useEffect(() => {
    loadReservas();
  }, [loadReservas]);

  // Solo las reservas del día elegido alimentan la grilla: sin este
  // filtro, una reserva del 15 seguiría marcando esa hora como ocupada
  // aunque el recepcionista esté viendo el día 20.
  const reservasDelDia = reservas.filter((r) => r.date === formData.date);
  const slots = buildSlotsFromReservations(reservasDelDia, formData.date);

  // HU-004 (Alison): la tabla de "Buscar reservas" tambien respeta el
  // Estado elegido en el mismo fieldset. HU-003 (Kendall) no acepta
  // status como criterio en el backend, asi que el filtro se aplica
  // aqui, sobre los resultados ya traidos, para que "Cliente: alison" +
  // "Estado: Canceladas" no muestre reservas activas de alison.
  const visibleSearchResults = statusFilter
    ? searchState.data.filter((booking) => booking.status === statusFilter)
    : searchState.data;

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      // Al cambiar de fecha, la hora elegida en la grilla anterior deja
      // de tener sentido (puede que ya ni siquiera exista como slot
      // disponible en el nuevo día) — se limpia para no enviar una
      // reserva con la fecha nueva pero la hora de otro día.
      ...(name === 'date' ? { selectedHour: null } : {}),
    }));
  }

  function handleSelectSlot(hour) {
    setFormData((prev) => ({ ...prev, selectedHour: hour }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (formData.selectedHour === null) {
      setFeedback({ status: 'error', message: 'Elegí un horario disponible en la cuadrícula.' });
      return;
    }

    setFeedback({ status: 'loading', message: '' });

    try {
      const { startDatetime, endDatetime } = slotToIsoRange(formData.date, formData.selectedHour);
      await createFieldBooking({
        resourceId: CANCHA_RESOURCE_ID,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        startDatetime,
        endDatetime,
      });

      // La reserva ya quedó en el backend. En vez de agregarla a mano a
      // la lista (y arriesgar que quede distinta a lo que guardó MySQL),
      // se limpia el formulario CONSERVANDO la fecha y se vuelve a pedir
      // el listado del día, para que la nueva reserva aparezca en la
      // grilla tal como la devuelve HU-002.
      setFormData((prev) => ({ ...INITIAL_FORM, date: prev.date }));
      setFeedback({ status: 'success', message: 'Reserva registrada correctamente.' });
      await loadReservas();
    } catch (error) {
      // error.message ya viene traducido por reservasCanchaService.js
      // a partir de los criterios de aceptación CA-2 a CA-5 (conflicto
      // de horario, demasiada anticipación, etc.) — no hace falta
      // interpretar códigos HTTP acá.
      setFeedback({ status: 'error', message: error.message });
    }
  }

  // CA-6 "Cancelación del registro": no hace falta lógica de backend,
  // solo descartar lo escrito y volver al formulario vacío.
  function handleCancel() {
    setFormData(INITIAL_FORM);
    setFeedback({ status: 'idle', message: '' });
  }

  const isSubmitting = feedback.status === 'loading';

  return (
    // w-full + p-6: antes esta página no tenía padding propio ni ancho
    // explícito, así que quedaba con su ancho de contenido natural
    // dentro del <main> (que sí ocupa toda la pantalla, ver Layout.jsx)
    // — de ahí la franja vacía a la derecha que señaló Marvin. El
    // padding lateral es a propósito consistente en los 3 bloques
    // (lista, grilla, formulario) para que no vuelva a aparecer un
    // borde "pegado" a un lado y espacio del otro.
    // h-full en la raíz + flex-col: antes esta página solo definía su
    // alto por el contenido (título + una fila de tarjetas de ~180px),
    // así que sobraba todo el resto del viewport como franja vacía
    // debajo — el mismo problema que el ancho, pero en el otro eje.
    // Al declarar h-full acá y flex-1 en el bloque lista+grilla más
    // abajo, ese bloque ahora reclama TODO el alto disponible del
    // <main> (que si ocupa la pantalla completa, ver Layout.jsx) y se
    // lo reparte con la grilla, en vez de quedar flotando arriba.
    <div className="flex min-h-full w-full flex-col gap-6 p-6 lg:flex-row">
      {/* Panel principal: lista del día + grilla de disponibilidad */}
      <div className="flex min-w-0 flex-[3] flex-col gap-6">
        <div>
          {/* Vuelve a "Elegir espacio" (SeleccionarEspacio.jsx en
              /reservar), no al dashboard: es la pantalla anterior real
              en el flujo de "Registrar reserva" (ver App.jsx). Antes
              esta página no tenía forma de regresar salvo con el botón
              "atrás" del navegador. */}
          <Link
            to="/reservar"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={15} />
            Volver a elegir espacio
          </Link>
          <h2 className="mt-3 font-display text-2xl font-semibold text-primary-900">
            Cancha sintética
          </h2>
          <p className="text-sm text-muted">
            Abierta de 1:00 p.m. a 9:00 p.m. · tarifa ₡8.000 por hora
          </p>
        </div>

        <section aria-labelledby="search-title" className="shrink-0 rounded-xl border border-line bg-surface p-4 shadow-card">
          <h3 id="search-title" className="font-display text-base font-semibold text-primary-900">Buscar reservas</h3>
          <p className="mt-1 text-xs text-muted">Combiná cliente, teléfono exacto, fecha de inicio o estado. Incluye reservas históricas.</p>
          <form onSubmit={handleSearch} className="mt-3">
            <fieldset disabled={searchState.status === 'loading'} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div>
                <label htmlFor="search-customer" className="block text-xs font-medium text-muted">Cliente</label>
                <input id="search-customer" type="text" maxLength={150} value={searchForm.customerName}
                  onChange={(event) => setSearchForm((prev) => ({ ...prev, customerName: event.target.value }))}
                  placeholder="Ej. Ken" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label htmlFor="search-phone" className="block text-xs font-medium text-muted">Teléfono exacto</label>
                <input id="search-phone" type="tel" maxLength={20} value={searchForm.phone}
                  onChange={(event) => setSearchForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Como está registrado" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
              <div>
                <label htmlFor="search-date" className="block text-xs font-medium text-muted">Fecha de inicio</label>
                <input id="search-date" type="date" value={searchForm.date}
                  onChange={(event) => setSearchForm((prev) => ({ ...prev, date: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
              </div>
              {/* HU-004 (Alison): filtro por estado, a la par de los
                  demás campos de búsqueda (misma fila del fieldset),
                  no en una fila aparte debajo. */}
              <div>
                <label htmlFor="status-filter" className="block text-xs font-medium text-muted">Estado</label>
                <select id="status-filter" value={statusFilter} onChange={handleStatusFilterChange}
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="self-end rounded-lg bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60">
                {searchState.status === 'loading' ? 'Buscando…' : 'Buscar'}
              </button>
            </fieldset>
          </form>
          {statusFilterState.status === 'loading' && <p className="mt-2 text-sm text-muted">Filtrando…</p>}
          <div aria-live="polite" aria-busy={statusFilterState.status === 'loading'}>
            {statusFilterState.status === 'error' && (
              <p role="alert" className="mt-3 rounded-lg bg-coral-50 p-3 text-sm text-coral-600">{statusFilterState.message}</p>
            )}
            {statusFilterState.status === 'success' && statusFilterState.data.length === 0 && (
              <p className="mt-3 text-sm text-muted">
                {statusFilter ? 'No hay reservas con el estado seleccionado.' : `No hay reservas registradas para ${formatDateHeader(formData.date)}.`}
              </p>
            )}
            {statusFilterState.status === 'success' && statusFilterState.data.length > 0 && (
              <div className="mt-3 max-h-64 overflow-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Reservas filtradas por estado</caption>
                  <thead><tr>{['Reserva', 'Cliente', 'Inicio', 'Fin', 'Estado'].map((label) => (
                    <th key={label} scope="col" className="whitespace-nowrap border-b border-line p-2">{label}</th>
                  ))}</tr></thead>
                  <tbody>{statusFilterState.data.map((booking) => (
                    <tr key={booking.bookingId}>
                      <td className="border-b border-line p-2">#{booking.bookingId}</td>
                      <td className="border-b border-line p-2">{booking.customer?.fullName ?? 'Sin nombre'}</td>
                      <td className="whitespace-nowrap border-b border-line p-2">{searchDateFormatter.format(new Date(booking.startDatetime))}</td>
                      <td className="whitespace-nowrap border-b border-line p-2">{searchDateFormatter.format(new Date(booking.endDatetime))}</td>
                      <td className="border-b border-line p-2">{SEARCH_STATUS_LABELS[booking.status] ?? booking.status}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          {/* fin HU-004 */}
          <div aria-live="polite" aria-busy={searchState.status === 'loading'}>
            {searchState.status === 'loading' && <p className="mt-3 text-sm text-muted">Buscando reservas…</p>}
            {searchState.status === 'error' && <p role="alert" className="mt-3 rounded-lg bg-coral-50 p-3 text-sm text-coral-600">{searchState.message}</p>}
            {searchState.status === 'success' && visibleSearchResults.length === 0 && (
              <p className="mt-3 text-sm text-muted">
                {statusFilter && searchState.data.length > 0
                  ? 'No se encontraron reservas con ese estado entre los resultados de la búsqueda.'
                  : 'No se encontraron reservas con los criterios indicados.'}
              </p>
            )}
            {searchState.status === 'success' && visibleSearchResults.length > 0 && (
              <>
                <p className="mt-3 text-xs text-muted">
                  {statusFilter
                    ? `${visibleSearchResults.length} de ${searchState.meta.total} reservas encontradas (filtradas por estado)`
                    : `${searchState.meta.total} reservas encontradas`}
                </p>
                <div className="mt-2 max-h-64 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <caption className="sr-only">Resultados de búsqueda de reservas de cancha</caption>
                    <thead><tr>{['Reserva', 'Cliente', 'Teléfono', 'Cancha', 'Inicio', 'Fin', 'Estado'].map((label) => (
                      <th key={label} scope="col" className="whitespace-nowrap border-b border-line p-2">{label}</th>
                    ))}</tr></thead>
                    <tbody>{visibleSearchResults.map((booking) => (
                      <tr key={booking.bookingId}>
                        <td className="border-b border-line p-2">#{booking.bookingId}</td>
                        <td className="border-b border-line p-2">{booking.customer?.fullName ?? 'Sin nombre'}</td>
                        <td className="whitespace-nowrap border-b border-line p-2">{booking.customer?.phone ?? '—'}</td>
                        <td className="border-b border-line p-2">{booking.resource?.name ?? '—'}</td>
                        <td className="whitespace-nowrap border-b border-line p-2">{searchDateFormatter.format(new Date(booking.startDatetime))}</td>
                        <td className="whitespace-nowrap border-b border-line p-2">{searchDateFormatter.format(new Date(booking.endDatetime))}</td>
                        <td className="border-b border-line p-2">{SEARCH_STATUS_LABELS[booking.status] ?? booking.status}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}
            {searchState.status === 'success' && searchState.meta.totalPages > 1 && (
              <nav aria-label="Paginación de búsqueda" className="mt-3 flex items-center gap-3 text-xs">
                <button type="button" disabled={searchState.meta.page <= 1}
                  onClick={() => loadSearch(searchCriteria, searchState.meta.page - 1)}
                  className="rounded-lg border border-line px-3 py-2 disabled:opacity-50">Anterior</button>
                <span>Página {searchState.meta.page} de {searchState.meta.totalPages}</span>
                <button type="button" disabled={searchState.meta.page >= searchState.meta.totalPages}
                  onClick={() => loadSearch(searchCriteria, searchState.meta.page + 1)}
                  className="rounded-lg border border-line px-3 py-2 disabled:opacity-50">Siguiente</button>
              </nav>
            )}
          </div>
        </section>

        {/* fin Buscar reservas + filtro por estado, ver dentro del form de arriba */}

        <div className="flex min-h-[420px] flex-1 flex-col gap-4 lg:flex-row">
          {/* Lista lateral "Reservas del día" — resumen en texto de lo
              mismo que ya se ve pintado en la grilla, para quien
              prefiera leer una lista en vez de escanear colores.
              Antes tenía un ancho fijo angosto (lg:w-56); ahora usa
              una proporción del espacio disponible (flex-1 de 4, la
              grilla flex-[3]) para que crezca junto con la pantalla en
              vez de dejar hueco a su lado. overflow-y-auto: si algún
              día hay muchas reservas en un día, esta lista scrollea en
              vez de estirar la tarjeta más que la grilla de al lado. */}
          <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-card lg:w-auto lg:flex-1">
            <h3 className="font-display text-sm font-semibold text-primary-900">
              Reservas del día
            </h3>
            <p className="text-xs text-muted">{formatDateHeader(formData.date)}</p>

            {listState.status === 'loading' && (
              <p className="mt-3 text-xs text-faint">Cargando reservas…</p>
            )}

            {listState.status === 'error' && (
              <p className="mt-3 rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">
                {listState.message}
              </p>
            )}

            {listState.status === 'idle' && (
              <ul className="mt-3 space-y-3">
                {slots
                  .filter((s) => s.status === 'occupied' || s.status === 'pending')
                  .map((s) => (
                    <li key={s.hour} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                      <p className="text-sm font-medium text-ink">{s.clientName}</p>
                      <p className="text-xs text-faint">{s.hourLabel}</p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          s.status === 'occupied' ? 'bg-primary-50 text-primary-800' : 'bg-amber-50 text-amber-600'
                        }`}
                      >
                        {s.status === 'occupied' ? 'Confirmada' : 'Pendiente'}
                      </span>
                    </li>
                  ))}
                {slots.every((s) => s.status !== 'occupied' && s.status !== 'pending') && (
                  <li className="text-xs text-faint">Sin reservas registradas para este día.</li>
                )}
              </ul>
            )}
          </aside>

          {/* flex + h-full: DisponibilidadGrid ahora se estira para
              llenar el alto disponible de este bloque (ver comentario
              arriba), no solo el ancho — así el fondo con la foto real
              cubre el espacio real de la pantalla en vez de quedar
              como una franja angosta con vacío debajo. */}
          <div className="flex min-w-0 flex-[3] flex-col">
            <DisponibilidadGrid
              slots={slots}
              onSelectSlot={handleSelectSlot}
              selectedHour={formData.selectedHour}
            />
          </div>
        </div>
      </div>

      {/* Panel lateral — formulario real de HU-001, reubicado como
          panel flotante crema sobre el fondo de la página. Ancho fijo
          (w-80) a propósito, a diferencia de los otros dos bloques: un
          formulario no debería estirarse con la pantalla — inputs
          demasiado anchos son más difíciles de leer, no más útiles. */}
      <aside className="w-full shrink-0 rounded-xl border border-line bg-surface p-5 shadow-card lg:w-80">
        <h3 className="font-display text-base font-semibold text-primary-900">
          Nueva reserva
        </h3>
        <p className="mt-1 text-xs text-muted">Cancha sintética</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="customerName" className="block text-xs font-medium text-muted">
              Nombre del cliente
            </label>
            <input
              id="customerName"
              name="customerName"
              type="text"
              required
              minLength={3}
              value={formData.customerName}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
              placeholder="Ej. Luis Vargas Mora"
            />
          </div>

          <div>
            <label htmlFor="customerPhone" className="block text-xs font-medium text-muted">
              Teléfono
            </label>
            <input
              id="customerPhone"
              name="customerPhone"
              type="tel"
              required
              minLength={8}
              value={formData.customerPhone}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
              placeholder="Ej. 8888-7777"
            />
          </div>

          <div>
            <label htmlFor="date" className="block text-xs font-medium text-muted">
              Fecha
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              min={todayIsoDate()}
              value={formData.date}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
            />
          </div>

          <div>
            <span className="block text-xs font-medium text-muted">Horario elegido</span>
            <p className="mt-1 rounded-lg border border-dashed border-line bg-surface-alt px-3 py-2 text-sm text-ink">
              {formData.selectedHour !== null
                ? `${timeFormatter.format(new Date(2000, 0, 1, formData.selectedHour))} – ${timeFormatter.format(
                    new Date(2000, 0, 1, formData.selectedHour + SLOT_DURATION_HOURS),
                  )}`
                : 'Elegí una celda disponible en la cuadrícula →'}
            </p>
          </div>

          {feedback.status === 'error' && (
            <p className="rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">
              {feedback.message}
            </p>
          )}
          {feedback.status === 'success' && (
            <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-600">
              {feedback.message}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              {isSubmitting ? 'Guardando…' : 'Registrar reserva'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-surface-alt disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

export default ReservasCancha;
