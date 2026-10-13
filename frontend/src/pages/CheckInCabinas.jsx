import { useState } from 'react';
import { Link } from 'react-router-dom';
import { searchCabinBookings } from '../services/reservasCabinaService';
import { checkInCabin } from '../services/cabinCheckInService';

const STATUS = { active: 'Activa', checked_in: 'En curso', completed: 'Finalizada', pending: 'Pendiente', cancelled: 'Cancelada', rejected: 'Rechazada' };

export default function CheckInCabinas() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState({ page: 1, totalPages: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');

  async function search(page = 1) {
    const term = page === 1 ? query.trim() : searchedQuery;
    if (!term) { setError('Ingresá el nombre o la identificación del huésped.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await searchCabinBookings({ q: term, page, pageSize: 20 });
      setItems(result.data); setMeta(result.meta); setSearchedQuery(term);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function register(bookingId) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await checkInCabin(bookingId);
      setItems((current) => current.map((item) => item.bookingId === bookingId ? { ...item, status: result.status } : item));
      setMessage('Check-in registrado exitosamente. La estadía está en curso.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <Link to="/cabinas" className="text-sm text-primary-700">Volver a cabinas</Link>
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary-900">Ingreso de huéspedes</h1>
        <p className="mt-2 text-muted">Buscá la reserva y registrá el check-in el día de entrada.</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); search(); }} className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-2 text-sm">
          Nombre o identificación del huésped
          <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} disabled={busy}
            className="rounded-lg border border-line bg-surface px-3 py-2" />
        </label>
        <button disabled={busy} className="self-end rounded-lg bg-primary-700 px-5 py-2 text-white disabled:opacity-50">
          {busy ? 'Procesando…' : 'Buscar'}
        </button>
      </form>
      {error && <p role="alert" className="rounded-lg bg-coral-50 p-3 text-coral-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-teal-50 p-3 text-teal-700">{message}</p>}
      {items?.length === 0 && <p>No se encontraron reservas para este huésped.</p>}
      <ul className="space-y-3">
        {(items ?? []).map((item) => (
          <li key={item.bookingId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5">
            <div>
              <h2 className="font-semibold">{item.guest.fullName}</h2>
              <p className="text-sm text-muted">Reserva #{item.bookingId} · {item.cabin.name}</p>
              <p className="mt-1 text-sm">Entrada: {item.stay.checkInDate} · Salida: {item.stay.checkOutDate}</p>
              <p className="mt-1 text-sm font-medium">{STATUS[item.status] ?? item.status}</p>
            </div>
            <button disabled={busy || item.status !== 'active'} onClick={() => register(item.bookingId)}
              className="rounded-lg bg-primary-700 px-4 py-2 text-white disabled:opacity-50">
              {item.status === 'checked_in' ? 'Ingreso registrado' : 'Registrar check-in'}
            </button>
          </li>
        ))}
      </ul>
      {meta.totalPages > 1 && <nav aria-label="Páginas de reservas" className="flex items-center gap-4">
        <button disabled={busy || meta.page <= 1} onClick={() => search(meta.page - 1)}>Anterior</button>
        <span>Página {meta.page} de {meta.totalPages}</span>
        <button disabled={busy || meta.page >= meta.totalPages} onClick={() => search(meta.page + 1)}>Siguiente</button>
      </nav>}
    </section>
  );
}
