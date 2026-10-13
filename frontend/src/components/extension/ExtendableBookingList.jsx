import { RotateCw, Search, TriangleAlert } from 'lucide-react';
import BookingListItem from './BookingListItem.jsx';

function SectionTitle({ children }) {
  return <h3 className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">{children}</h3>;
}

function SkeletonRow() {
  return <div className="h-[56px] animate-pulse rounded-xl border border-line bg-surface" />;
}

/**
 * Columna izquierda de la pantalla: buscador por nombre o cédula y lista
 * de reservas, separada en "En curso" y "Finalizadas recientes".
 *
 * Es de presentación: la búsqueda real (con espera) y la carga de datos
 * viven en la página. Aquí solo se pinta lo que llega por props.
 */
function ExtendableBookingList({
  search, onSearchChange, status, message, bookings, selectedId, today, onSelect, onRetry,
}) {
  const inProgress = bookings.filter((booking) => booking.isExtendable);
  const finished = bookings.filter((booking) => !booking.isExtendable);
  const isFirstLoad = status === 'loading' && bookings.length === 0;
  const isEmpty = status === 'success' && bookings.length === 0;

  function renderRows(rows) {
    return rows.map((booking) => (
      <BookingListItem
        key={booking.bookingId} booking={booking} today={today}
        isSelected={booking.bookingId === selectedId} onSelect={onSelect}
      />
    ));
  }

  return (
    <aside
      aria-label="Huéspedes"
      className="flex min-w-0 flex-[1_1_360px] flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card md:max-w-[400px]"
    >
      <label htmlFor="extension-search" className="text-xs font-semibold text-muted">Buscar huésped</label>
      <div className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-faint bg-surface px-3 focus-within:border-primary-600 focus-within:ring-2 focus-within:ring-primary-200">
        <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
        <input
          id="extension-search" type="search" value={search} autoComplete="off"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Nombre o cédula"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
      </div>

      {status === 'error' && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-coral-400 bg-coral-50 px-3 py-2.5 text-[13px] text-coral-600">
          <TriangleAlert size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{message}</span>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold hover:underline">
            <RotateCw size={13} /> Reintentar
          </button>
        </div>
      )}

      <div
        aria-busy={status === 'loading'}
        className={`flex flex-col gap-2 transition-opacity duration-300 ${status === 'loading' && !isFirstLoad ? 'opacity-60' : 'opacity-100'}`}
      >
        {isFirstLoad && Array.from({ length: 4 }, (_, index) => <SkeletonRow key={index} />)}

        {inProgress.length > 0 && (
          <>
            <SectionTitle>En curso · {inProgress.length}</SectionTitle>
            {renderRows(inProgress)}
          </>
        )}
        {finished.length > 0 && (
          <>
            <SectionTitle>Finalizadas recientes</SectionTitle>
            {renderRows(finished)}
          </>
        )}
        {isEmpty && (
          <p className="rounded-xl bg-surface px-3 py-4 text-center text-[13px] text-muted">
            {search.trim() ? `Ningún huésped coincide con “${search.trim()}”.` : 'No hay reservas de cabina para extender.'}
          </p>
        )}
      </div>
    </aside>
  );
}

export default ExtendableBookingList;
