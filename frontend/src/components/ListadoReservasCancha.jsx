import { useEffect, useState } from 'react';
import { listFieldBookings } from '../services/reservasCanchaService';

const statuses = { pending: 'Pendiente', active: 'Activa', checked_in: 'Ingresada', completed: 'Completada', cancelled: 'Cancelada', rejected: 'Rechazada' };
const dateFormat = new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', dateStyle: 'short' });
const timeFormat = new Intl.DateTimeFormat('es-CR', { timeZone: 'America/Costa_Rica', hour: 'numeric', minute: '2-digit' });

export default function ListadoReservasCancha({ refreshVersion = 0, onRegister }) {
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    listFieldBookings({ page, pageSize: 20 }).then(({ data, meta }) => {
      if (!current) return;
      if (page > 1 && page > meta.totalPages) {
        setPage(Math.max(1, meta.totalPages));
        return;
      }
      setState({ status: 'success', data, meta });
    }).catch((error) => {
      if (current) setState({ status: 'error', message: error.message });
    });
    return () => { current = false; };
  }, [page, retry, refreshVersion]);

  return (
    <section aria-labelledby="field-list-title" className="rounded-xl border border-line bg-white p-4">
      <h3 id="field-list-title" className="font-display text-lg font-semibold">Listado de reservas de cancha</h3>
      <p className="mt-1 text-sm text-muted">Todas las reservas, ordenadas por fecha ascendente. 20 registros por página.</p>
      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <p className="mt-3">Cargando listado…</p>}
        {state.status === 'error' && <div className="mt-3"><p role="alert">{state.message}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Reintentar</button></div>}
        {state.status === 'success' && (state.meta.total === 0 ? (
          <div className="mt-3">
            <p>No hay reservas registradas actualmente</p>
            <button type="button" onClick={onRegister} className="mt-3 rounded-lg bg-primary-700 px-4 py-2 text-white">Registrar reserva</button>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm">{state.meta.total} reservas registradas</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Listado de reservas de cancha</caption>
                <thead><tr>{['Cliente', 'Teléfono', 'Fecha', 'Hora inicio', 'Hora fin', 'Estado'].map((label) => <th key={label} scope="col" className="whitespace-nowrap border-b border-line p-2">{label}</th>)}</tr></thead>
                <tbody>{state.data.map((booking) => <tr key={booking.bookingId}>
                  <td className="border-b border-line p-2">{booking.customer?.fullName ?? 'Sin nombre'}</td>
                  <td className="border-b border-line p-2">{booking.customer?.phone ?? '—'}</td>
                  <td className="whitespace-nowrap border-b border-line p-2">{dateFormat.format(new Date(booking.startDatetime))}</td>
                  <td className="whitespace-nowrap border-b border-line p-2">{timeFormat.format(new Date(booking.startDatetime))}</td>
                  <td className="whitespace-nowrap border-b border-line p-2">{timeFormat.format(new Date(booking.endDatetime))}</td>
                  <td className="border-b border-line p-2">{statuses[booking.status] ?? booking.status}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <nav aria-label="Paginación del listado de cancha" className="mt-3 flex items-center gap-3 text-sm">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-line px-3 py-2 disabled:opacity-50">Anterior</button>
              <span>Página {state.meta.page} de {state.meta.totalPages}</span>
              <button type="button" disabled={page >= state.meta.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-line px-3 py-2 disabled:opacity-50">Siguiente</button>
            </nav>
          </>
        ))}
      </div>
    </section>
  );
}
