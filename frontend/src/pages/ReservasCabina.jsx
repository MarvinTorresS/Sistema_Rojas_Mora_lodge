import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RotateCw, Tag, TriangleAlert } from 'lucide-react';
import { createCabinBooking, getCabinAvailability } from '../services/reservasCabinaService';
import StayBar from '../components/cabinas/StayBar.jsx';
import CabinCard from '../components/cabinas/CabinCard.jsx';
import UnavailableCabinBanner from '../components/cabinas/UnavailableCabinBanner.jsx';
import ReservationBar from '../components/cabinas/ReservationBar.jsx';
import GuestDrawer from '../components/cabinas/GuestDrawer.jsx';
import BookingConfirmationModal from '../components/cabinas/BookingConfirmationModal.jsx';
import { resolveLook, statusLabel } from '../components/cabinas/cabinLooks';
import {
  addDays, countNights, formatColones, formatDayMonth, formatDayRange, pluralize, stayNightDates, todayInHotel,
} from '../components/cabinas/cabinFormat';

/**
 * Reservas de cabinas — HU-016 (Marvin, Sprint 3), diseño "A3 · Tarjetas
 * con agenda" elegido en Figma.
 *
 * Arquitectura de la pantalla:
 *  - Esta página es el ÚNICO componente con estado y la única que habla
 *    con el servicio (reservasCabinaService). Los componentes de
 *    components/cabinas/ son de presentación: reciben datos y avisan
 *    eventos (onSelect, onSubmit...). Así cada pieza se entiende y se
 *    prueba sola.
 *  - Ninguna cabina está escrita en el código: la lista llega de
 *    GET /cabin-bookings/availability. Una cabina nueva en la base aparece
 *    sola en la grilla, que acomoda las tarjetas en filas automáticamente
 *    (grid auto-fill).
 *
 * Flujo (mismo que el prototipo):
 *   fechas + personas → tocar una cabina → "Continuar con el huésped" →
 *   panel lateral → "Confirmar" → confirmación.
 *   CA-2: tocar una ocupada (o que la ganen mientras se llenan los datos)
 *         muestra el aviso con alternativas.
 *   CA-3: si la identificación ya existe, el panel ofrece vincularla.
 */

// La "agenda" (tira de noches) arranca 2 noches antes de la entrada y
// muestra 7 noches: da contexto de qué pasa antes y después de la estadía.
const AGENDA_LEAD_NIGHTS = 2;
const AGENDA_NIGHTS = 7;
const MAX_PARTY_SIZE = 20;
// Solo se usa mientras llega la primera respuesta; luego manda el backend.
const DEFAULT_POLICY = { checkInTime: '15:00', checkOutTime: '11:00' };
const EMPTY_GUEST = { guestIdentification: '', guestName: '', guestPhone: '', guestEmail: '' };
const IDLE_SUBMIT = { status: 'idle', message: '', fieldErrors: {} };
const ERROR_CODES = { GUEST_ALREADY_EXISTS: 'GUEST_ALREADY_EXISTS', CABIN_NOT_AVAILABLE: 'CABIN_NOT_AVAILABLE' };

function initialStay() {
  const today = todayInHotel();
  return { checkInDate: today, checkOutDate: addDays(today, 1), partySize: 2 };
}

// Mejor alternativa primero: la que deja menos camas vacías y, a igual
// capacidad, la más barata.
function sortAlternatives(cabins) {
  return [...cabins].sort((a, b) => a.capacity - b.capacity || a.pricePerNight - b.pricePerNight);
}

function SkeletonCard() {
  return <div className="h-[420px] animate-pulse rounded-2xl border border-line bg-white/70" />;
}

function ReservasCabina() {
  const [stay, setStay] = useState(initialStay);
  const [availability, setAvailability] = useState({ status: 'idle', data: null, message: '' });
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCabinId, setSelectedCabinId] = useState(null);
  const [notice, setNotice] = useState(null); // CA-2
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [guest, setGuest] = useState(EMPTY_GUEST);
  const [existingGuest, setExistingGuest] = useState(null); // CA-3
  const [submitState, setSubmitState] = useState(IDLE_SUBMIT);
  const [confirmation, setConfirmation] = useState(null); // CA-1
  // Cada consulta lleva un número; si llega una respuesta vieja (el
  // usuario cambió la fecha dos veces rápido), se descarta. Mismo patrón
  // que reservationsRequestId en ReservasCancha.jsx.
  const requestId = useRef(0);

  const nights = countNights(stay.checkInDate, stay.checkOutDate);
  const isStayValid = nights >= 1;

  useEffect(() => {
    if (!isStayValid) return;
    const currentRequest = ++requestId.current;
    // Se conservan los datos anteriores mientras carga, para que la
    // grilla no "parpadee" en cada cambio de fecha.
    setAvailability((previous) => ({ ...previous, status: 'loading', message: '' }));
    const agendaFrom = addDays(stay.checkInDate, -AGENDA_LEAD_NIGHTS);
    getCabinAvailability({
      checkInDate: stay.checkInDate,
      checkOutDate: stay.checkOutDate,
      partySize: stay.partySize,
      agendaFrom,
      agendaTo: addDays(agendaFrom, AGENDA_NIGHTS),
    })
      .then((data) => {
        if (currentRequest === requestId.current) setAvailability({ status: 'success', data, message: '' });
      })
      .catch((error) => {
        if (currentRequest === requestId.current) setAvailability({ status: 'error', data: null, message: error.message });
      });
  }, [stay.checkInDate, stay.checkOutDate, stay.partySize, isStayValid, refreshKey]);

  const cabins = availability.data?.cabins ?? [];
  const policy = availability.data?.stayPolicy ?? DEFAULT_POLICY;
  const selectedCabin = cabins.find((cabin) => cabin.resourceId === selectedCabinId) ?? null;
  const stayDates = useMemo(() => stayNightDates(stay.checkInDate, stay.checkOutDate), [stay.checkInDate, stay.checkOutDate]);

  // Si tras recargar la cabina elegida ya no está libre, se quita la
  // selección: nunca se debe poder continuar con una cabina ocupada.
  useEffect(() => {
    if (selectedCabinId !== null && availability.status === 'success' && selectedCabin?.availability !== 'available') {
      setSelectedCabinId(null);
    }
  }, [availability.status, selectedCabin, selectedCabinId]);

  // --- Estadía ---------------------------------------------------------
  function updateStay(changes) {
    setStay((previous) => ({ ...previous, ...changes }));
    setSelectedCabinId(null);
    setNotice(null);
    setConfirmation(null);
  }
  function handleCheckInChange(checkInDate) {
    // Si la salida queda antes o igual que la nueva entrada, se corre
    // sola a la noche siguiente (evita un estado inválido de un clic).
    const checkOutDate = stay.checkOutDate <= checkInDate ? addDays(checkInDate, 1) : stay.checkOutDate;
    updateStay({ checkInDate, checkOutDate });
  }

  // --- Cabinas ---------------------------------------------------------
  function handleCabinSelect(cabin) {
    setConfirmation(null);
    if (cabin.availability === 'available') {
      setSelectedCabinId(cabin.resourceId);
      setNotice(null);
      return;
    }
    // CA-2: ocupada o fuera de servicio -> aviso con alternativas reales.
    setSelectedCabinId(null);
    setNotice({
      cabinId: cabin.resourceId,
      cabinName: cabin.name,
      reason: cabin.availability,
      freesOn: cabin.freesOn,
      alternatives: sortAlternatives(cabins.filter((c) => c.availability === 'available')),
    });
  }
  function handleChooseAlternative(resourceId) {
    setSelectedCabinId(resourceId);
    setNotice(null);
  }

  // --- Panel del huésped -----------------------------------------------
  function openDrawer() {
    if (!selectedCabin) return;
    setSubmitState(IDLE_SUBMIT);
    setIsDrawerOpen(true);
  }
  const closeDrawer = useCallback(() => {
    if (submitState.status !== 'loading') setIsDrawerOpen(false);
  }, [submitState.status]);

  function handleGuestChange(field, value) {
    // Cambiar la identificación de un huésped ya vinculado deshace el
    // vínculo: ese perfil ya no corresponde a lo que se escribió.
    if (field === 'guestIdentification' && existingGuest) {
      setExistingGuest(null);
      setGuest({ ...EMPTY_GUEST, guestIdentification: value });
      return;
    }
    setGuest((previous) => ({ ...previous, [field]: value }));
    setSubmitState((previous) => ({ ...previous, fieldErrors: { ...previous.fieldErrors, [field]: undefined } }));
  }
  function handleUnlinkGuest() {
    setExistingGuest(null);
    setGuest(EMPTY_GUEST);
  }

  async function handleSubmitGuest(event) {
    event.preventDefault();
    if (!selectedCabin) return;
    setSubmitState({ status: 'loading', message: '', fieldErrors: {} });
    try {
      const result = await createCabinBooking({
        resourceId: selectedCabin.resourceId,
        guestIdentification: guest.guestIdentification.trim(),
        guestName: guest.guestName.trim(),
        guestPhone: guest.guestPhone.trim(),
        guestEmail: guest.guestEmail.trim(),
        checkInDate: stay.checkInDate,
        checkOutDate: stay.checkOutDate,
        companions: stay.partySize - 1,
        linkExistingGuest: Boolean(existingGuest),
      });
      // CA-1: reserva registrada.
      setConfirmation(result);
      setIsDrawerOpen(false);
      setSelectedCabinId(null);
      setSubmitState(IDLE_SUBMIT);
      setRefreshKey((key) => key + 1); // la cabina ahora aparece ocupada
    } catch (error) {
      if (error.code === ERROR_CODES.GUEST_ALREADY_EXISTS) {
        // CA-3: se muestra el perfil existente y se ofrece vincularlo.
        const found = error.details?.existingGuest ?? {};
        setExistingGuest({ ...found, message: error.message });
        setGuest((previous) => ({
          ...previous,
          guestName: found.fullName || previous.guestName,
          guestPhone: found.phone || previous.guestPhone,
          guestEmail: found.email || previous.guestEmail,
        }));
        setSubmitState(IDLE_SUBMIT);
        return;
      }
      if (error.code === ERROR_CODES.CABIN_NOT_AVAILABLE) {
        // CA-2 "de carrera": otra persona la reservó mientras se llenaban
        // los datos. El backend manda las alternativas de ESE momento.
        setIsDrawerOpen(false);
        setNotice({
          cabinId: selectedCabin.resourceId,
          cabinName: selectedCabin.name,
          reason: 'taken',
          freesOn: null,
          alternatives: sortAlternatives(error.details?.alternatives ?? []),
        });
        setSelectedCabinId(null);
        setSubmitState(IDLE_SUBMIT);
        setRefreshKey((key) => key + 1);
        return;
      }
      setSubmitState({ status: 'error', message: error.message, fieldErrors: error.fieldErrors ?? {} });
    }
  }

  function handleResetAfterConfirmation() {
    setConfirmation(null);
    setGuest(EMPTY_GUEST);
    setExistingGuest(null);
  }

  // --- Render ------------------------------------------------------------
  const isFirstLoad = availability.status === 'loading' && !availability.data;
  const availabilityPill = availability.data && availability.status !== 'error'
    ? `${availability.data.availableCount} de ${cabins.length} ${pluralize(availability.data.availableCount, 'libre', 'libres')}`
    : null;

  return (
    <div className="flex min-h-full w-full flex-col gap-4 p-6 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* Mismo encabezado que Cancha y Salón: vuelve a "Elegir espacio"
              (/reservar), la pantalla anterior real del flujo. */}
          <Link to="/reservar" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
            <ArrowLeft size={15} />
            Volver a elegir espacio
          </Link>
          <h2 className="mt-3 font-display text-2xl font-semibold text-primary-900">Reserva de cabina</h2>
          <p className="text-sm text-muted">Registrá la estadía con los datos del huésped.</p>
        </div>
        {/* HU-128: la tarifa se administra en su propia pantalla. TODO
            (Sprint 5, roles): mostrar este acceso solo al Administrador. */}
        <Link
          to="/cabinas/tarifas"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border border-line bg-white px-4 text-sm font-semibold text-primary-800 shadow-card transition-colors hover:border-primary-400 hover:bg-primary-50"
        >
          <Tag size={16} aria-hidden="true" />
          Tarifas
        </Link>
      </div>

      <StayBar
        stay={stay} nights={nights} minDate={todayInHotel()} maxPartySize={MAX_PARTY_SIZE} policy={policy}
        availabilityPill={availability.status === 'loading' ? 'Consultando…' : availabilityPill}
        onCheckInChange={handleCheckInChange}
        onCheckOutChange={(checkOutDate) => updateStay({ checkOutDate })}
        onPartySizeChange={(partySize) => updateStay({ partySize })}
      />

      {!isStayValid && (
        <p className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-600">
          La fecha de salida debe ser posterior a la fecha de entrada.
        </p>
      )}

      {notice && (
        <UnavailableCabinBanner
          key={`${notice.cabinId}-${notice.reason}`} notice={notice} partySize={stay.partySize}
          onChoose={handleChooseAlternative} onClose={() => setNotice(null)}
        />
      )}

      {availability.status === 'error' && (
        <div className="flex items-center gap-3 rounded-xl border border-coral-400 bg-coral-50 px-4 py-3 text-sm text-coral-600">
          <TriangleAlert size={18} /> {availability.message}
          <button type="button" onClick={() => setRefreshKey((key) => key + 1)} className="ml-auto inline-flex items-center gap-1.5 font-semibold hover:underline">
            <RotateCw size={14} /> Reintentar
          </button>
        </div>
      )}

      {isStayValid && availability.status !== 'error' && (
        <section
          aria-label="Cabinas"
          aria-busy={availability.status === 'loading'}
          className={`grid flex-1 grid-cols-[repeat(auto-fill,minmax(270px,1fr))] content-start gap-4 transition-opacity duration-300 ${
            availability.status === 'loading' && !isFirstLoad ? 'opacity-60' : 'opacity-100'
          }`}
        >
          {isFirstLoad && Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} />)}
          {!isFirstLoad && cabins.length === 0 && availability.status === 'success' && (
            <p className="col-span-full rounded-xl border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
              No hay cabinas registradas en el sistema.
            </p>
          )}
          {cabins.map((cabin) => {
            const lookKey = resolveLook({
              cabin,
              selectedCabinId,
              focusedCabinId: notice?.cabinId,
              reservedCabinId: confirmation?.cabin.resourceId,
            });
            return (
              <CabinCard
                key={cabin.resourceId} cabin={cabin} lookKey={lookKey} partySize={stay.partySize} stayDates={stayDates}
                statusText={statusLabel(lookKey, cabin, confirmation?.guest.fullName)}
                onSelect={handleCabinSelect}
              />
            );
          })}
        </section>
      )}

      <ReservationBar cabin={selectedCabin} stay={stay} nights={nights} policy={policy} onContinue={openDrawer} />

      {isDrawerOpen && selectedCabin && (
        <GuestDrawer
          summary={`${selectedCabin.name} · ${formatDayRange(stay.checkInDate, stay.checkOutDate, '→')} · ${nights} ${pluralize(nights, 'noche', 'noches')} · ${stay.partySize} ${pluralize(stay.partySize, 'persona', 'personas')}`}
          values={guest} onFieldChange={handleGuestChange}
          existingGuest={existingGuest} onUnlinkGuest={handleUnlinkGuest}
          fieldErrors={submitState.fieldErrors} submitState={submitState}
          stayText={`${formatDayMonth(stay.checkInDate)} ${policy.checkInTime} → ${formatDayMonth(stay.checkOutDate)} ${policy.checkOutTime}`}
          nightsText={`${nights} × ${formatColones(selectedCabin.pricePerNight)}`}
          totalText={formatColones(selectedCabin.stayTotal)}
          onSubmit={handleSubmitGuest} onClose={closeDrawer}
        />
      )}

      {confirmation && (
        <BookingConfirmationModal confirmation={confirmation} policy={policy} onReset={handleResetAfterConfirmation} />
      )}
    </div>
  );
}

export default ReservasCabina;
