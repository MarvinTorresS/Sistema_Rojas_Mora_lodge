import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { createFieldBooking, listFieldBookings, searchFieldBookings, filterFieldBookingsByStatus, updateFieldBooking, cancelFieldBooking } from '../services/reservasCanchaService';
import FieldBookingDialog from '../components/FieldBookingDialog';
import FieldDateStrip from '../components/FieldDateStrip';
import FieldHourPicker from '../components/FieldHourPicker';
import FieldReservationSummary from '../components/FieldReservationSummary';
import fieldPhoto from '../assets/cancha-techada-mejorada.png';
import './ReservasCancha.css';
import FieldListSwitch from '../components/FieldListSwitch';
import { buildSlotsFromReservations, slotToIsoRange, selectFieldHours } from '../utils/fieldSlots';
import ListadoReservasCancha from '../components/ListadoReservasCancha';
import CustomerPhoneConflict from '../components/common/CustomerPhoneConflict';
import { useCustomerPhoneConflict } from '../hooks/useCustomerPhoneConflict';

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

// La grilla usa bloques de una hora entre las 15:00 y las 21:00.

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
    booking,
    id: booking.bookingId,
    startDatetime: booking.startDatetime,
    endDatetime: booking.endDatetime,
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
  selectedHours: [],
};

const timeFormatter = new Intl.DateTimeFormat('es-CR', { hour: 'numeric', minute: '2-digit' });
const searchDateFormatter = new Intl.DateTimeFormat('es-CR', { dateStyle: 'short', timeStyle: 'short' });
const SEARCH_STATUS_LABELS = {
  pending: 'Pendiente', active: 'Confirmada', rejected: 'Rechazada',
  checked_in: 'Ingresada', completed: 'Completada', cancelled: 'Cancelada',
};

// "Vencida" es un concepto SOLO VISUAL (no existe una HU que lo pida
// como regla de negocio real, se revisó toda la matriz de historias):
// una reserva 'active' cuyo horario de fin ya pasó. No se guarda en la
// base de datos ni cambia el status real — status sigue siendo
// 'active' para todo lo demas (filtros, HU-006, etc.), esto solo
// decide cómo se MUESTRA en pantalla.
function isBookingExpired(booking) {
  return booking.status !== 'cancelled' && new Date(booking.endDatetime) < new Date();
}

// Etiqueta a mostrar para una reserva: "Vencida" tiene prioridad visual
// sobre "Confirmada" cuando ya paso su horario, sin tocar el status real.
function getStatusLabel(booking) {
  if (isBookingExpired(booking)) return 'Vencida';
  return SEARCH_STATUS_LABELS[booking.status] ?? booking.status;
}

// El filtro "Activas" no debe incluir las vencidas (ya no estan
// realmente activas aunque el status en BD siga en 'active'); "Todas"
// si las sigue mostrando (solo cambia la etiqueta), y "Canceladas" no
// se ve afectado (una cancelada nunca cuenta como vencida, ver
// isBookingExpired arriba).
function excludeExpiredFromActiveFilter(bookings, filter) {
  if (filter !== 'active') return bookings;
  return bookings.filter((booking) => !isBookingExpired(booking));
}

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

function toLocalDatetimeInput(value) {
  const date = new Date(value);
  return `${isoToLocalDate(value)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

// CA-2 (HU-006): el motivo de cancelacion debe tener contenido (no vacio,
// no solo espacios) para poder pasar al paso de confirmacion / habilitar el
// boton "Confirmar". Se exporta como funcion pura para poder probarla de
// forma aislada, sin depender del componente ni del DOM.
export function canConfirmCancellation(reason) {
  return Boolean((reason ?? '').trim());
}


function ReservasCancha() {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [reservas, setReservas] = useState(RESERVAS_INICIALES);
  const [listRefreshVersion, setListRefreshVersion] = useState(0);
  const [listView, setListView] = useState('day');
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const guestFormRef = useRef(null);
  // feedback agrupa estado + mensaje en un solo objeto porque siempre
  // cambian juntos (nunca hay un mensaje de error "idle", ni un estado
  // 'error' sin mensaje) — separarlos en dos variables sueltas
  // permitiría estados inconsistentes a mitad de una actualización.
  const [feedback, setFeedback] = useState({ status: 'idle', message: '' });
  // Aviso "este teléfono ya es de otra persona" (compartido con salón).
  const { conflict: phoneConflict, captureConflict, clearConflict } = useCustomerPhoneConflict();
  // Estado de la carga del listado (HU-002), separado del feedback del
  // formulario: leer y crear son dos operaciones distintas y pueden
  // estar en estados diferentes a la vez.
  const [listState, setListState] = useState({ status: 'loading', message: '' });

  // HU-003 no modifica reservas, formData ni los slots de disponibilidad.
  const [searchForm, setSearchForm] = useState({ customerName: '', phone: '', date: '' });
  const [searchState, setSearchState] = useState({ status: 'idle', message: '', data: [], meta: null });
  const [searchCriteria, setSearchCriteria] = useState(null);
  const [editingBooking, setEditingBooking] = useState(null);
  const [editForm, setEditForm] = useState({ startDatetime: '', endDatetime: '' });
  const [editState, setEditState] = useState({ status: 'idle', message: '' });
  const editPanelRef = useRef(null);
  const searchRequestId = useRef(0);
  const reservationsRequestId = useRef(0);
  const isSavingEdit = editState.status === 'loading';

  // === HU-006 cancelar una reserva activa ===
  // Ya NO es un panel aparte con su propio "booking en foco": vive
  // DENTRO del panel de Editar (mismo editingBooking), como pidio
  // Alison. cancelStep controla en cual de los 3 pasos esta el panel:
  //   null      -> panel normal de Editar (fecha/hora + boton "Cancelar reserva")
  //   'reason'  -> se despliega el motivo (CA-5) al presionar "Cancelar reserva"
  //   'confirm' -> CA-2: "¿Está seguro...?" con Si/No, se muestra al
  //                presionar "Confirmar" en el paso de motivo
  const [cancelStep, setCancelStep] = useState(null);
  const [cancelForm, setCancelForm] = useState({ reason: '', isAdmin: false });
  const [cancelState, setCancelState] = useState({ status: 'idle', message: '' });
  const isCancelling = cancelState.status === 'loading';
  // CA-3/CA-6: si faltan menos de 24h para el inicio, hace falta
  // autorizacion de Administrador (ver MIN_CANCELLATION_NOTICE_HOURS en
  // el backend). Se calcula tambien en el frontend para mostrar el
  // aviso/checkbox de una vez, sin esperar a que el backend rechace.
  const cancelHoursUntilStart = editingBooking
    ? (new Date(editingBooking.startDatetime).getTime() - Date.now()) / (1000 * 60 * 60)
    : null;
  const cancelNeedsAdminOverride = cancelHoursUntilStart !== null && cancelHoursUntilStart < 24;

  // Boton "Cancelar reserva" dentro del panel de Editar -> despliega el motivo.
  function handleShowCancelReason() {
    if (isSavingEdit || isCancelling) return;
    setCancelForm({ reason: '', isAdmin: false });
    setCancelState({ status: 'idle', message: '' });
    setCancelStep('reason');
  }

  function openCancellation(booking) {
    if (isSavingEdit || isCancelling) return;
    setShowGuestForm(false);
    setEditingBooking(booking);
    setCancelForm({ reason: '', isAdmin: false });
    setCancelState({ status: 'idle', message: '' });
    setCancelStep('reason');
  }

  // "Volver" desde el paso de motivo -> regresa al panel normal de Editar.
  function handleBackToEdit() {
    if (isCancelling) return;
    setCancelStep(null);
    setCancelState({ status: 'idle', message: '' });
  }

  // CA-2: boton "Confirmar" del paso de motivo -> valida el motivo
  // (CA-5) y recien ahi muestra el "¿Está seguro...?" (paso 'confirm').
  // Todavia NO llama al backend aqui.
  function handleGoToCancelConfirm(event) {
    event.preventDefault();
 if (!canConfirmCancellation(cancelForm.reason)) { 
      setCancelState({ status: 'error', message: 'El motivo de cancelación es obligatorio.' });
      return;
    }
    setCancelState({ status: 'idle', message: '' });
    setCancelStep('confirm');
  }

  // "No" del paso de confirmacion -> regresa al paso de motivo (conserva lo escrito).
  function handleCancelConfirmNo() {
    if (isCancelling) return;
    setCancelStep('reason');
  }

  // "Si" del paso de confirmacion -> esta es la unica accion que
  // realmente llama al backend.
  async function handleCancelConfirmYes() {
    if (isCancelling) return;
    setCancelState({ status: 'loading', message: '' });
    try {
      await cancelFieldBooking(editingBooking.bookingId, {
        reason: cancelForm.reason.trim(),
        // CA-6: solo se manda 'Administrador' si la persona marco el
        // checkbox de autorizacion; si no, el backend aplica CA-3
        // normalmente (rechaza si esta fuera de la ventana de 24h).
        role: cancelForm.isAdmin ? 'Administrador' : undefined,
      });
      setEditingBooking(null);
      setCancelStep(null);
      setCancelForm({ reason: '', isAdmin: false });
      setListRefreshVersion((value) => value + 1);
      // Mismos refrescos que hace HU-005 al guardar una edicion, para
      // que la reserva cancelada desaparezca/actualice en las 3 vistas.
      await Promise.all([
        loadReservas(), loadStatusFilter(statusFilter),
        searchCriteria ? loadSearch(searchCriteria, 1) : Promise.resolve(),
      ]);
      setCancelState({ status: 'success', message: 'Reserva cancelada correctamente.' });
    } catch (error) {
      // Si el backend rechaza (ej. CA-3: fuera de politica sin
      // autorizacion), se regresa al paso de motivo para que la
      // persona vea el mensaje exacto y pueda marcar el checkbox de
      // Administrador si corresponde, en vez de quedar atascada en el
      // paso de Si/No sin poder corregir nada.
      setCancelStep('reason');
      setCancelState({ status: 'error', message: error.message });
    }
  }
  // === fin HU-006 ===

  function handleEdit(booking) {
    if (isSavingEdit) return;
    setEditingBooking(booking);
    setEditForm({ startDatetime: toLocalDatetimeInput(booking.startDatetime), endDatetime: toLocalDatetimeInput(booking.endDatetime) });
    setEditState({ status: 'idle', message: '' });
    // Por si quedo a medias cancelando OTRA reserva antes de entrar a
    // esta: siempre arranca en el panel normal de edicion, no en el
    // paso de motivo/confirmacion.
    setCancelStep(null);
    setCancelForm({ reason: '', isAdmin: false });
    setCancelState({ status: 'idle', message: '' });
    editPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    if (isSavingEdit) return;
    setEditingBooking(null);
    setEditForm({ startDatetime: '', endDatetime: '' });
    setEditState({ status: 'idle', message: '' });
    setCancelStep(null);
    setCancelForm({ reason: '', isAdmin: false });
    setCancelState({ status: 'idle', message: '' });
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (isSavingEdit) return;
    setEditState({ status: 'loading', message: '' });
    try {
      await updateFieldBooking(editingBooking.bookingId, {
        startDatetime: new Date(editForm.startDatetime).toISOString(),
        endDatetime: new Date(editForm.endDatetime).toISOString(),
      });
      setEditingBooking(null);
      setEditForm({ startDatetime: '', endDatetime: '' });
      setListRefreshVersion((value) => value + 1);
      // Conserva la fecha del panel diario y los criterios actuales. Si la
      // reserva cambia de dia o deja de coincidir, desaparece de esa vista.
      await Promise.all([
        loadReservas(), loadStatusFilter(statusFilter),
        searchCriteria ? loadSearch(searchCriteria, 1) : Promise.resolve(),
      ]);
      setEditState({ status: 'success', message: 'Reserva modificada correctamente.' });
    } catch (error) {
      setEditState({ status: 'error', message: error.message });
    }
  }

  // === HU-004 filtro de reservas del día por estado ===
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
    const requestId = ++searchRequestId.current;
    setSearchState({ status: 'loading', message: '', data: [], meta: null });
    try {
      const result = await searchFieldBookings({ ...criteria, page });
      if (requestId !== searchRequestId.current) return;
      setSearchState({ status: 'success', message: '', data: result.data, meta: result.meta });
    } catch (error) {
      if (requestId !== searchRequestId.current) return;
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
    const requestId = ++reservationsRequestId.current;
    setListState({ status: 'loading', message: '' });
    try {
      const { data } = await listFieldBookings({ date: formData.date });
      if (requestId !== reservationsRequestId.current) return;
      setReservas(
        data
          .filter((booking) => SLOT_HOLDING_STATUSES.includes(booking.status))
          .map(mapBackendBookingToRow),
      );
      setListState({ status: 'idle', message: '' });
    } catch (error) {
      if (requestId !== reservationsRequestId.current) return;
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

  // HU-004 la tabla de "Buscar reservas" tambien respeta el
  // Estado elegido en el mismo fieldset. HU-003 (Kendall) no acepta
  // status como criterio en el backend, asi que el filtro se aplica
  // aqui, sobre los resultados ya traidos, para que "Cliente: alison" +
  // "Estado: Canceladas" no muestre reservas activas de alison.
  const visibleSearchResults = excludeExpiredFromActiveFilter(
    statusFilter ? searchState.data.filter((booking) => booking.status === statusFilter) : searchState.data,
    statusFilter,
  );

  function handleChange(event) {
    const { name, value } = event.target;
    // Si cambian el nombre o el teléfono, el aviso de teléfono ya
    // registrado deja de aplicar: se vuelve a revisar al enviar.
    if (name === 'customerName' || name === 'customerPhone') clearConflict();
    if (name === 'date') { setShowGuestForm(false); setSelectionError(''); }
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      // Al cambiar de fecha, la hora elegida en la grilla anterior deja
      // de tener sentido (puede que ya ni siquiera exista como slot
      // disponible en el nuevo día) — se limpia para no enviar una
      // reserva con la fecha nueva pero la hora de otro día.
      ...(name === 'date' ? { selectedHour: null, selectedHours: [] } : {}),
    }));
  }

  function handleSelectSlot(hour) {
    try {
      const selectedHours = selectFieldHours(formData.selectedHours, hour, slots);
      setFormData((prev) => ({ ...prev, selectedHour: selectedHours.length ? Math.min(...selectedHours) : null, selectedHours }));
      setSelectionError('');
      if (!selectedHours.length) setShowGuestForm(false);
    } catch (error) { setSelectionError(error.message); }
  }

  function handleSubmit(event) {
    event.preventDefault();
    submitBooking();
  }

  // Envía la reserva. `resolution` es la respuesta del recepcionista al
  // aviso de teléfono ya registrado (vacía en el primer intento):
  //   { linkCustomerId, customerLabel } -> "es ese cliente"
  //   { confirmNewCustomer: true }      -> "es otra persona"
  async function submitBooking(resolution = {}) {
    const { customerLabel, ...customerChoice } = resolution;

    if (formData.selectedHour === null) {
      setFeedback({ status: 'error', message: 'Elegí un horario disponible en la cuadrícula.' });
      return;
    }

    setFeedback({ status: 'loading', message: '' });

    try {
      const { startDatetime, endDatetime } = slotToIsoRange(formData.date, formData.selectedHour, formData.selectedHours.length);
      await createFieldBooking({
        resourceId: CANCHA_RESOURCE_ID,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        startDatetime,
        endDatetime,
        ...customerChoice,
      });

      // La reserva ya quedó en el backend. En vez de agregarla a mano a
      // la lista (y arriesgar que quede distinta a lo que guardó MySQL),
      // se limpia el formulario CONSERVANDO la fecha y se vuelve a pedir
      // el listado del día, para que la nueva reserva aparezca en la
      // grilla tal como la devuelve HU-002.
      setFormData((prev) => ({ ...INITIAL_FORM, date: prev.date }));
      clearConflict();
      setShowGuestForm(false);
      // Si se eligió un cliente existente, se dice a nombre de quién quedó
      // (puede ser distinto de lo que se había escrito).
      setFeedback({
        status: 'success',
        message: customerLabel
          ? `Reserva registrada a nombre de ${customerLabel}.`
          : 'Reserva registrada correctamente.',
      });
      await loadReservas();
      setListRefreshVersion((value) => value + 1);
    } catch (error) {
      // error.message ya viene traducido por reservasCanchaService.js
      // a partir de los criterios de aceptación CA-2 a CA-5 (conflicto
      // de horario, demasiada anticipación, etc.) — no hace falta
      // interpretar códigos HTTP acá.
      // Excepción: el teléfono es de otra persona. No es un error del
      // formulario sino una pregunta, y se muestra con su propio aviso.
      if (captureConflict(error, formData.customerName.trim())) {
        setFeedback({ status: 'idle', message: '' });
        return;
      }
      setFeedback({ status: 'error', message: error.message });
    }
  }

  // CA-6 "Cancelación del registro": no hace falta lógica de backend,
  // solo descartar lo escrito y volver al formulario vacío.
  function handleCancel() {
    setFormData(INITIAL_FORM);
    setShowGuestForm(false);
    setSelectionError('');
    setFeedback({ status: 'idle', message: '' });
    clearConflict();
  }

  const isSubmitting = feedback.status === 'loading';

  return (
    <div className="bombonera"><div className="bmb-content">
      <Link to="/reservar" className="bmb-back"><ArrowLeft size={16} />Volver a elegir espacio</Link>
      <header className="bmb-intro"><div><p className="bmb-eyebrow">ROJAS MORA SPORTS & LODGE</p><h1><span>Cancha sintética</span>La Bombonera</h1></div><p>Elige el día y la hora.<br />Nos vemos en la cancha.</p></header>
      <div className="bmb-hero"><img src={fieldPhoto} alt="Cancha sintética techada La Bombonera, fotografía mejorada con IA" /><span className="bmb-hero-label"><i />Cancha techada</span><div className="bmb-hero-caption"><strong>La Bombonera</strong><p>Césped sintético · Rojas Mora</p></div><span className="bmb-hero-hours">3:00–9:00 p. m.</span></div>
      {feedback.status === 'success' && <p role="status" className="bmb-success">{feedback.message}</p>}
      <div className="bmb-layout">
      <div className="bmb-main">
        <section className="bmb-card bmb-schedule" aria-label="Elegir fecha y horario">
          <FieldDateStrip value={formData.date} today={todayIsoDate()} disabled={isSubmitting} onChange={(value) => handleChange({ target: { name: 'date', value } })} />
          <FieldHourPicker slots={slots} selectedHours={formData.selectedHours} onSelect={handleSelectSlot} disabled={isSubmitting || listState.status === 'error'} loading={listState.status === 'loading'} error={selectionError || (listState.status === 'error' ? listState.message : '')} />
        </section>

        <section aria-label="Reservas de cancha" className="bmb-card bmb-lists space-y-3">
          <FieldListSwitch value={listView} onChange={setListView} />
          <div role="tabpanel" id="field-panel-day" aria-labelledby="field-tab-day" hidden={listView !== 'day'}>
          <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-card ">
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
                {reservasDelDia.map((s) => (
                    <li key={s.id} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                      <p className="text-sm font-medium text-ink">{s.cliente}</p>
                      <p className="text-xs text-faint">{timeFormatter.format(new Date(s.startDatetime))} – {timeFormatter.format(new Date(s.endDatetime))}</p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          s.estado === 'Confirmada' ? 'bg-primary-50 text-primary-800' : 'bg-amber-50 text-amber-600'
                        }`}
                      >
                        {s.estado}
                      </span>
                      <button type="button" className="ml-3 rounded-lg border border-line px-3 py-2 text-xs text-coral-600 disabled:opacity-50" disabled={isSavingEdit || isCancelling || isBookingExpired(s.booking)} onClick={() => openCancellation(s.booking)} aria-label={`Cancelar reserva ${s.id}`}>Cancelar</button>
                    </li>
                  ))}
                {reservasDelDia.length === 0 && (
                  <li className="text-xs text-faint">Sin reservas registradas para este día.</li>
                )}
              </ul>
            )}
          </aside>

          </div>
          <div role="tabpanel" id="field-panel-all" aria-labelledby="field-tab-all" hidden={listView !== 'all'}>
        <ListadoReservasCancha onDelete={openCancellation} busy={isSavingEdit || isCancelling} refreshVersion={listRefreshVersion} onRegister={() => {
          setEditingBooking(null);
          setCancelStep(null);
          requestAnimationFrame(() => {
            const input = document.querySelector('.bmb-calendar input');
            input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input?.focus({ preventScroll: true });
          });
        }} />
          </div>
        </section>

        {/* Buscar reservas va debajo de la grilla: los horarios de la
            cancha quedan visibles sin hacer scroll. */}
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
            {statusFilterState.status === 'success' && excludeExpiredFromActiveFilter(statusFilterState.data, statusFilter).length === 0 && (
              <p className="mt-3 text-sm text-muted">
                {statusFilter ? 'No hay reservas con el estado seleccionado.' : `No hay reservas registradas para ${formatDateHeader(formData.date)}.`}
              </p>
            )}
            {statusFilterState.status === 'success' && excludeExpiredFromActiveFilter(statusFilterState.data, statusFilter).length > 0 && (
              <div className="mt-3 max-h-64 overflow-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Reservas filtradas por estado</caption>
                  <thead><tr>{['Reserva', 'Cliente', 'Inicio', 'Fin', 'Estado'].map((label) => (
                    <th key={label} scope="col" className="whitespace-nowrap border-b border-line p-2">{label}</th>
                  ))}</tr></thead>
                  <tbody>{excludeExpiredFromActiveFilter(statusFilterState.data, statusFilter).map((booking) => (
                    <tr key={booking.bookingId}>
                      <td className="border-b border-line p-2">#{booking.bookingId}</td>
                      <td className="border-b border-line p-2">{booking.customer?.fullName ?? 'Sin nombre'}</td>
                      <td className="whitespace-nowrap border-b border-line p-2">{searchDateFormatter.format(new Date(booking.startDatetime))}</td>
                      <td className="whitespace-nowrap border-b border-line p-2">{searchDateFormatter.format(new Date(booking.endDatetime))}</td>
                      <td className="border-b border-line p-2">{getStatusLabel(booking)}</td>
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
                    <thead><tr>{['Reserva', 'Cliente', 'Teléfono', 'Cancha', 'Inicio', 'Fin', 'Estado', 'Acciones'].map((label) => (
                      <th key={label} scope="col" className="whitespace-nowrap border-b border-line p-2">{label}</th>
                    ))}</tr></thead>
                    <tbody>{visibleSearchResults.map((booking) => {
                      const expired = isBookingExpired(booking);
                      return (
                      <tr key={booking.bookingId}>
                        <td className="border-b border-line p-2">#{booking.bookingId}</td>
                        <td className="border-b border-line p-2">{booking.customer?.fullName ?? 'Sin nombre'}</td>
                        <td className="whitespace-nowrap border-b border-line p-2">{booking.customer?.phone ?? '—'}</td>
                        <td className="border-b border-line p-2">{booking.resource?.name ?? '—'}</td>
                        <td className="whitespace-nowrap border-b border-line p-2">{searchDateFormatter.format(new Date(booking.startDatetime))}</td>
                        <td className="whitespace-nowrap border-b border-line p-2">{searchDateFormatter.format(new Date(booking.endDatetime))}</td>
                        <td className="border-b border-line p-2">{getStatusLabel(booking)}</td>
                        <td className="whitespace-nowrap border-b border-line p-2">
                          {/* La edición se conserva; cancelar también puede abrirse directamente. */}
                          <button type="button" disabled={booking.status === 'cancelled' || expired || isSavingEdit || isCancelling}
                            onClick={() => handleEdit(booking)}
                            aria-label={`Editar reserva ${booking.bookingId}`}
                            title={expired ? 'Esta reserva ya venció, no se puede modificar.' : booking.status === 'cancelled' ? 'Una reserva cancelada no puede modificarse.' : 'Editar fecha y horario'}
                            className="rounded-lg border border-line px-3 py-2 text-primary-800 disabled:opacity-50">Editar</button>
                          <button type="button" disabled={booking.status === 'cancelled' || expired || isSavingEdit || isCancelling} onClick={() => openCancellation(booking)} aria-label={`Cancelar reserva ${booking.bookingId}`} className="ml-2 rounded-lg border border-line px-3 py-2 text-coral-600 disabled:opacity-50">Cancelar</button>
                        </td>
                      </tr>
                      );
                    })}</tbody>
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
      </div>

      {/* Panel lateral — formulario real de HU-001, reubicado como
          panel flotante crema sobre el fondo de la página. Ancho fijo
          (w-80) a propósito, a diferencia de los otros dos bloques: un
          formulario no debería estirarse con la pantalla — inputs
          demasiado anchos son más difíciles de leer, no más útiles. */}
      <aside ref={editPanelRef} className="bmb-card bmb-side">
        {editState.status === 'success' && <p role="status" className="mb-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-600">{editState.message}</p>}
        {cancelState.status === 'success' && <p role="status" className="mb-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-600">{cancelState.message}</p>}
        {editingBooking && cancelStep && <FieldBookingDialog title="Cancelar reserva" kicker="Justificación y confirmación" busy={isCancelling} onClose={handleBackToEdit}>
          {cancelStep === 'confirm' ? (
          // === HU-006 paso 3: "¿Está seguro...?" con Sí/No (CA-2) ===
          <>
            <h3 className="font-display text-base font-semibold text-primary-900">Cancelar reserva #{editingBooking.bookingId}</h3>
            <p className="mt-2 text-sm text-muted">{editingBooking.customer?.fullName ?? 'Sin nombre'} · {editingBooking.customer?.phone ?? 'Sin teléfono'}</p>
            <p className="mt-1 text-xs text-muted">
              {editingBooking.resource?.name} · {searchDateFormatter.format(new Date(editingBooking.startDatetime))} – {searchDateFormatter.format(new Date(editingBooking.endDatetime))}
            </p>
            {/* CA-2: este mensaje aparece SOLO en este paso, despues de
                que ya se escribio el motivo y se presiono "Confirmar" en
                el paso anterior — no apenas se abre el panel. */}
            <p className="mt-3 rounded-lg bg-surface-alt px-3 py-2 text-sm text-ink">
              ¿Está seguro de que desea cancelar esta reserva?
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={isCancelling} onClick={handleCancelConfirmYes}
                className="flex-1 rounded-lg bg-coral-600 px-4 py-2 text-sm text-white disabled:opacity-60">
                {isCancelling ? 'Cancelando…' : 'Sí'}
              </button>
              <button type="button" disabled={isCancelling} onClick={handleCancelConfirmNo}
                className="flex-1 rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-60">No</button>
            </div>
            {cancelState.status === 'error' && <p role="alert" className="mt-3 rounded-lg bg-coral-50 p-3 text-sm text-coral-600">{cancelState.message}</p>}
          </>
        ) : (
          // === HU-006 paso 2: motivo (CA-5) + aviso/checkbox CA-3/CA-6 ===
          <>
            <h3 className="font-display text-base font-semibold text-primary-900">Cancelar reserva #{editingBooking.bookingId}</h3>
            <p className="mt-2 text-sm text-muted">{editingBooking.customer?.fullName ?? 'Sin nombre'} · {editingBooking.customer?.phone ?? 'Sin teléfono'}</p>
            <p className="mt-1 text-xs text-muted">
              {editingBooking.resource?.name} · {searchDateFormatter.format(new Date(editingBooking.startDatetime))} – {searchDateFormatter.format(new Date(editingBooking.endDatetime))}
            </p>
            {/* CA-3/CA-6: aviso cuando faltan menos de 24h para el inicio. */}
            {cancelNeedsAdminOverride && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Faltan menos de 24 horas para esta reserva. Solo un Administrador puede
                autorizar la cancelación fuera de política, marcando la casilla de abajo.
              </p>
            )}
            <form onSubmit={handleGoToCancelConfirm} className="mt-4 space-y-3">
              <fieldset disabled={isCancelling} className="space-y-3">
                <div>
                  <label htmlFor="cancel-reason" className="block text-xs font-medium text-muted">Motivo de cancelación</label>
                  <textarea id="cancel-reason" required maxLength={250} rows={3} value={cancelForm.reason}
                    onChange={(event) => setCancelForm((prev) => ({ ...prev, reason: event.target.value }))}
                    placeholder="Ej. El cliente llamó a cancelar por lluvia."
                    className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                  <p className="mt-1 text-right text-[10px] text-faint">{cancelForm.reason.trim().length}/250</p>
                </div>
                {/* CA-6: checkbox de autorizacion, solo aparece cuando hace
                    falta (fuera de la ventana de 24h). Parche temporal
                    mientras no exista el modulo de autenticacion — ver
                    comentario en cancelFieldBooking del backend. */}
                {cancelNeedsAdminOverride && (
                  <label className="flex items-start gap-2 text-xs text-ink">
                    <input type="checkbox" checked={cancelForm.isAdmin}
                      onChange={(event) => setCancelForm((prev) => ({ ...prev, isAdmin: event.target.checked }))}
                      className="mt-0.5" />
                    Confirmo que tengo rol de Administrador y autorizo esta cancelación fuera de política.
                  </label>
                )}
                {/* CA-2: "El botón Confirmar solo se habilita si se
                    completó el motivo de cancelación" — unica condicion,
                    tal como lo dice la HU. Al presionarlo NO se cancela
                    todavia: solo pasa al paso 3 (Si/No). */}
                <button type="submit" disabled={!canConfirmCancellation(cancelForm.reason)}
                  className="w-full rounded-lg bg-coral-600 px-4 py-2 text-sm text-white disabled:opacity-60">Confirmar</button>
                <button type="button" onClick={handleBackToEdit} className="w-full rounded-lg border border-line px-4 py-2 text-sm">Volver</button>
              </fieldset>
              {cancelState.status === 'error' && <p role="alert" className="rounded-lg bg-coral-50 p-3 text-sm text-coral-600">{cancelState.message}</p>}
            </form>
          </>
        )}
        </FieldBookingDialog>}
        {editingBooking ? (
          <>
            <h3 className="font-display text-base font-semibold text-primary-900">Editar reserva #{editingBooking.bookingId}</h3>
            <p className="mt-2 text-sm text-muted">{editingBooking.customer?.fullName ?? 'Sin nombre'} · {editingBooking.customer?.phone ?? 'Sin teléfono'}</p>
            <p className="mt-1 text-xs text-muted">{editingBooking.resource?.name} · Cliente y cancha se conservan.</p>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
              <fieldset disabled={isSavingEdit} className="space-y-3">
                <div>
                  <label htmlFor="edit-start" className="block text-xs font-medium text-muted">Inicio de la reserva</label>
                  <input id="edit-start" type="datetime-local" step="1" required value={editForm.startDatetime}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, startDatetime: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                </div>
                <div>
                  <label htmlFor="edit-end" className="block text-xs font-medium text-muted">Fin de la reserva</label>
                  <input id="edit-end" type="datetime-local" step="1" required value={editForm.endDatetime}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, endDatetime: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
                </div>
                <p className="text-xs text-muted">Ajustá el inicio y el fin; la disponibilidad se verifica al guardar.</p>
                <button type="submit" className="w-full rounded-lg bg-primary-700 px-4 py-2 text-sm text-white disabled:opacity-60">
                  {isSavingEdit ? 'Guardando…' : 'Guardar cambios'}
                </button>
                {/* Se conserva el acceso a cancelar desde la edición. */}
                <button type="button" onClick={handleShowCancelReason} disabled={isSavingEdit}
                  className="w-full rounded-lg border border-coral-300 px-4 py-2 text-sm text-coral-600 disabled:opacity-60">Cancelar reserva</button>
                <button type="button" onClick={cancelEdit} className="w-full rounded-lg border border-line px-4 py-2 text-sm">Cancelar edición</button>
              </fieldset>
              {editState.status === 'error' && <p role="alert" className="rounded-lg bg-coral-50 p-3 text-sm text-coral-600">{editState.message}</p>}
            </form>
          </>
        ) : (
          <>
        <FieldReservationSummary date={formData.date} hours={formData.selectedHours} disabled={isSubmitting || listState.status !== 'idle'} formOpen={false} onContinue={() => { if (formData.selectedHours.every((hour) => slots.some((slot) => slot.hour === hour && slot.status === 'available'))) setShowGuestForm(true); else setSelectionError('La disponibilidad cambió. Consultá nuevamente los horarios.'); }} />
        {showGuestForm && <FieldBookingDialog busy={isSubmitting} onClose={() => setShowGuestForm(false)}>
        <p className="mt-1 text-xs text-muted">Cancha sintética La Bombonera</p>

        <form ref={guestFormRef} onSubmit={handleSubmit} className="mt-4 space-y-3">
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
            <span className="block text-xs font-medium text-muted">Fecha y horario elegidos</span>
            <p className="mt-1 text-sm">{new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeZone: 'America/Costa_Rica' }).format(new Date(`${formData.date}T12:00:00-06:00`))}</p>
            <p className="mt-1 rounded-lg border border-dashed border-line bg-surface-alt px-3 py-2 text-sm text-ink">
              {formData.selectedHour !== null
                ? `${timeFormatter.format(new Date(2000, 0, 1, formData.selectedHour))} – ${timeFormatter.format(
                    new Date(2000, 0, 1, formData.selectedHour + formData.selectedHours.length),
                  )}`
                : 'Elegí una celda disponible en la cuadrícula →'}
            </p>
          </div>

          <CustomerPhoneConflict
            conflict={phoneConflict}
            disabled={isSubmitting}
            onUseExisting={(customer) => submitBooking({
              linkCustomerId: customer.customerId,
              customerLabel: customer.fullName,
            })}
            onRegisterNew={() => submitBooking({ confirmNewCustomer: true })}
          />

          {feedback.status === 'error' && (
            <p className="rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">
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
        </FieldBookingDialog>}
          </>
        )}
      </aside>
      </div>
    </div></div>
  );
}

export default ReservasCancha;
