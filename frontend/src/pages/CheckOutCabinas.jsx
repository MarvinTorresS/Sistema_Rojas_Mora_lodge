import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { searchCabinBookings } from '../services/reservasCabinaService';
import { checkOutCabin } from '../services/cabinCheckOutService';

const STATUS = { active: 'Activa', checked_in: 'En curso', completed: 'Finalizada', pending: 'Pendiente', cancelled: 'Cancelada', rejected: 'Rechazada' };

export default function CheckOutCabinas() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState({ page: 1, totalPages: 0 });
  const [searchedQuery, setSearchedQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [billingBlocked, setBillingBlocked] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState(null);

  async function search(page = 1) {
    const term = page === 1 ? query.trim() : searchedQuery;
    if (!term) { setError('Ingresá el nombre o la identificación del huésped.'); return; }
    setBusy(true); setError(''); setMessage(''); setBillingBlocked(false); setConfirmation(null);
    try {
      const result = await searchCabinBookings({ q: term, page, pageSize: 20, operation: 'check-out' });
      setItems(result.data); setMeta(result.meta); setSearchedQuery(term);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function register() {
    const bookingId = confirmation;
    setBusy(true); setError(''); setMessage(''); setBillingBlocked(false);
    try {
      const result = await checkOutCabin(bookingId);
      setItems((current) => current.map((item) => item.bookingId === bookingId ? { ...item, status: result.status } : item));
      setMessage('Check-out registrado exitosamente. La estadía está finalizada.');
    } catch (err) { setError(err.message); setBillingBlocked(err.code === 'UNVERIFIED_RESTAURANT_BILLING'); }
    finally { setBusy(false); setConfirmation(null); }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <Link to="/cabinas" className="group inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-white/80 px-4 py-2 text-sm font-medium text-primary-800 transition-all duration-200 ease-out hover:-translate-x-0.5 hover:border-primary-300 hover:bg-primary-50 hover:shadow-sm active:translate-x-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transform-none motion-reduce:transition-none">
        <ArrowLeft size={18} aria-hidden="true" className="transition-transform duration-200 ease-out group-hover:-translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none" />Volver a cabinas
      </Link>
      <div><h1 className="font-display text-3xl font-semibold text-primary-900">Salida de huéspedes</h1>
        <p className="mt-2 text-muted">Buscá la reserva para finalizar la estadía y liberar la cabina.</p></div>
      <form onSubmit={(event) => { event.preventDefault(); search(); }} className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-2 text-sm">Nombre o identificación del huésped
          <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} disabled={busy}
            className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
        <button disabled={busy} className="self-end rounded-lg bg-primary-700 px-5 py-2 text-white disabled:opacity-50">{busy ? 'Procesando…' : 'Buscar'}</button>
      </form>
      {error && <div role="alert" className="rounded-lg bg-coral-50 p-3 text-coral-700"><p>{error}</p>
        {billingBlocked && <><p className="mt-2 text-sm">La salida sigue pendiente. Debe comprobarse la facturación de los consumos antes de finalizar.</p>
          <Link to="/facturacion" className="mt-2 inline-block underline">Ir a facturación</Link></>}
      </div>}
      {message && <p role="status" className="rounded-lg bg-teal-50 p-3 text-teal-700">{message}</p>}
      {items?.length === 0 && <p>No se encontraron reservas para este huésped.</p>}
      <ul className="space-y-3">{(items ?? []).map((item) => (
        <li key={item.bookingId} className="rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-4"><div>
            <h2 className="font-semibold">{item.guest.fullName}</h2>
            <p className="text-sm text-muted">Reserva #{item.bookingId} · {item.cabin.name}</p>
            <p className="mt-1 text-sm">Entrada: {item.stay.checkInDate} · Salida prevista: {item.stay.checkOutDate}</p>
            <p className="mt-1 text-sm font-medium">{STATUS[item.status] ?? item.status}</p></div>
            <button disabled={busy || item.status !== 'checked_in'} onClick={() => setConfirmation(item.bookingId)}
              className="rounded-lg bg-primary-700 px-4 py-2 text-white disabled:opacity-50">{item.status === 'completed' ? 'Salida registrada' : 'Registrar check-out'}</button>
          </div>
          {confirmation === item.bookingId && <div className="mt-4 space-y-3 border-t border-line pt-4">
            <p>¿Confirmás la salida de {item.guest.fullName}? Se finalizará su estadía.</p>
            <div className="flex gap-3"><button disabled={busy} onClick={register} className="rounded-lg bg-primary-700 px-4 py-2 text-white">Confirmar salida</button>
              <button disabled={busy} onClick={() => setConfirmation(null)} className="rounded-lg border border-line px-4 py-2">Cancelar</button></div>
          </div>}
        </li>
      ))}</ul>
      {meta.totalPages > 1 && <nav aria-label="Páginas de reservas" className="flex items-center gap-4">
        <button disabled={busy || meta.page <= 1} onClick={() => search(meta.page - 1)}>Anterior</button>
        <span>Página {meta.page} de {meta.totalPages}</span>
        <button disabled={busy || meta.page >= meta.totalPages} onClick={() => search(meta.page + 1)}>Siguiente</button>
      </nav>}
    </section>
  );
}
