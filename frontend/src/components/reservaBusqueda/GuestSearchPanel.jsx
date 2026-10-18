import { ChevronLeft, ChevronRight, RotateCw, Search, TriangleAlert } from 'lucide-react';
import SearchResultItem from './SearchResultItem.jsx';
import { MESSAGES } from './searchConfig';

function SkeletonRow() {
  return <div className="h-[56px] animate-pulse rounded-xl border border-line bg-surface" />;
}

/**
 * Parte de arriba de la pantalla: buscador por nombre o cédula y, justo
 * debajo, los resultados en una cuadrícula (la ficha de la reserva elegida
 * se ve más abajo, a todo el ancho). La búsqueda se lanza con el botón Buscar
 * o con Enter (HU-018 CA-1), no mientras se escribe.
 *
 * Es de presentación: la consulta real y los datos viven en la página. Aquí
 * solo se pinta lo que llega por props.
 *
 * `status`: idle (nada buscado) | loading | success | error | invalid
 * (se intentó buscar sin escribir nada).
 */
function GuestSearchPanel({
  listMode = false, term, onTermChange, onSearch, status, message, bookings, meta, selectedId, onSelect, onRetry, onPage,
}) {
  const isFirstLoad = status === 'loading' && bookings.length === 0;
  const isEmpty = status === 'success' && bookings.length === 0;
  const showProblem = status === 'error' || status === 'invalid';

  return (
    <aside
      aria-label={listMode ? 'Listado de reservas' : 'Resultados de la búsqueda'}
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-card"
    >
      {!listMode && <form onSubmit={onSearch} role="search" className="flex max-w-2xl flex-col gap-2">
        <label htmlFor="booking-search" className="text-xs font-semibold text-muted">Buscar huésped</label>
        <div className="flex gap-2">
          <div className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-faint bg-surface px-3 focus-within:border-primary-600 focus-within:ring-2 focus-within:ring-primary-200">
            <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
            <input
              id="booking-search" type="search" value={term} autoComplete="off" maxLength={100}
              onChange={(event) => onTermChange(event.target.value)}
              placeholder="Nombre o cédula"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            />
          </div>
          <button
            type="submit" disabled={status === 'loading'}
            className="min-h-[44px] rounded-[10px] bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Buscar
          </button>
        </div>
      </form>}

      {showProblem && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-coral-400 bg-coral-50 px-3 py-2.5 text-[13px] text-coral-600">
          <TriangleAlert size={16} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{message}</span>
          {status === 'error' && (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold hover:underline">
              <RotateCw size={13} aria-hidden="true" /> Reintentar
            </button>
          )}
        </div>
      )}

      <div
        aria-busy={status === 'loading'}
        className={`flex flex-col gap-2 transition-opacity duration-300 ${status === 'loading' && !isFirstLoad ? 'opacity-60' : 'opacity-100'}`}
      >
        {!listMode && status === 'idle' && (
          <p className="rounded-xl bg-surface px-3 py-4 text-center text-[13px] text-muted">
            Escribí el nombre o la cédula del huésped y presioná Buscar.
          </p>
        )}

        {isFirstLoad && (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => <SkeletonRow key={index} />)}
          </div>
        )}

        {bookings.length > 0 && (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h3 className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">
                {meta.total} {meta.total === 1 ? 'reserva' : 'reservas'}
              </h3>
              {selectedId === null && <span className="text-xs text-muted">Tocá una para ver su ficha</span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {bookings.map((booking) => (
                <SearchResultItem
                  key={booking.bookingId} booking={booking}
                  isSelected={booking.bookingId === selectedId} onSelect={onSelect}
                />
              ))}
            </div>
          </>
        )}

        {/* HU-018 CA-2: el criterio escrito se mantiene en el campo. */}
        {isEmpty && (
          <p role="status" className="rounded-xl bg-surface px-3 py-4 text-center text-[13px] text-muted">
            {listMode
              ? (meta?.total === 0 ? 'No hay reservas de cabinas registradas' : 'No hay reservas en esta página. Volvé a la página anterior.')
              : (meta?.message || MESSAGES.NO_RESULTS)}
          </p>
        )}
      </div>

      {meta && (meta.totalPages > 1 || meta.page > 1) && (
        <nav aria-label="Páginas de resultados" className="flex items-center justify-between gap-2 text-[13px] text-muted">
          <button
            type="button" onClick={() => onPage(meta.page - 1)} disabled={meta.page <= 1 || status === 'loading'}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-line px-2.5 font-semibold transition-colors hover:bg-surface disabled:opacity-50"
          >
            <ChevronLeft size={14} aria-hidden="true" /> Anterior
          </button>
          <span>Página {meta.page} de {meta.totalPages}</span>
          <button
            type="button" onClick={() => onPage(meta.page + 1)} disabled={meta.page >= meta.totalPages || status === 'loading'}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-line px-2.5 font-semibold transition-colors hover:bg-surface disabled:opacity-50"
          >
            Siguiente <ChevronRight size={14} aria-hidden="true" />
          </button>
        </nav>
      )}
    </aside>
  );
}

export default GuestSearchPanel;
