import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { searchCabinBookings } from '../services/reservasCabinaService';
import { checkInCabin, getEarlyCheckInQuote } from '../services/cabinCheckInService';

const STATUS = { active: 'Activa', checked_in: 'En curso', completed: 'Finalizada', pending: 'Pendiente', cancelled: 'Cancelada', rejected: 'Rechazada' };

export default function CheckInCabinas() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState({ page: 1, totalPages: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [authorization, setAuthorization] = useState(null);
  const [quote, setQuote] = useState(null);
  const [feeMode, setFeeMode] = useState('charge');
  const [credentials, setCredentials] = useState({ email: '', password: '', reason: '' });
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

  async function search(page = 1) {
    const term = page === 1 ? query.trim() : searchedQuery;
    if (!term) { setError('Ingresá el nombre o la identificación del huésped.'); return; }
    setBusy(true); setError(''); setMessage(''); setAuthorization(null); setCredentials({ email: '', password: '', reason: '' });
    try {
      const result = await searchCabinBookings({ q: term, page, pageSize: 20, operation: 'check-in' });
      setItems(result.data); setMeta(result.meta); setSearchedQuery(term);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function register(bookingId, approval) {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = approval ? await checkInCabin(bookingId, approval) : await checkInCabin(bookingId);
      setItems((current) => current.map((item) => item.bookingId === bookingId ? { ...item, status: result.status, ...(result.stay ? { stay: { ...item.stay, ...result.stay }, totalAmount: result.totalAmount } : {}) } : item));
      setMessage('Check-in registrado exitosamente. La estadía está en curso.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); setAuthorization(null); setCredentials({ email: '', password: '', reason: '' }); }
  }

  async function prepareAuthorization(bookingId) {
    setFeeMode('charge');
    setBusy(true); setError(''); setAuthorization(null); setQuote(null); setCredentials({ email: '', password: '', reason: '' });
    try { setQuote(await getEarlyCheckInQuote(bookingId)); setAuthorization(bookingId); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <Link to="/cabinas" className="group inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line bg-white/80 px-4 py-2 text-sm font-medium text-primary-800 transition-all duration-200 ease-out hover:-translate-x-0.5 hover:border-primary-300 hover:bg-primary-50 hover:shadow-sm active:translate-x-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transform-none motion-reduce:transition-none">
        <ArrowLeft size={18} aria-hidden="true" className="transition-transform duration-200 ease-out group-hover:-translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none" />Volver a cabinas
      </Link>
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
            {item.status === 'active' && item.stay.checkInDate > today && <button type="button" disabled={busy} onClick={() => prepareAuthorization(item.bookingId)} className="rounded-lg border border-line px-4 py-2 text-sm">Autorizar ingreso anticipado</button>}
            {authorization === item.bookingId && quote && <form className="w-full space-y-3 border-t border-line pt-4" onSubmit={(event) => { event.preventDefault(); register(item.bookingId, { ...credentials, feeMode, expectedAdditionalAmount: feeMode === 'waive' ? 0 : quote.additionalAmount }); }}>
              <p className="text-sm">Un administrador activo debe autorizar esta reserva con sus credenciales y un motivo. La autorización quedará registrada.</p>
              <label className="block text-sm">Cobro de noches adicionales<select value={feeMode} onChange={(event) => setFeeMode(event.target.value)} className="mt-1 block w-full rounded-lg border border-line p-2"><option value="charge">Cobrar noches adicionales</option><option value="waive">Autorizar sin recargo</option></select></label>
              <p className="rounded-lg bg-primary-50 p-3 text-sm">Se adelantará la entrada al {quote.checkInDate}. Noches adicionales: {quote.additionalNights}. Recargo: ₡{(feeMode === 'waive' ? 0 : quote.additionalAmount).toLocaleString('es-CR')}. Total de hospedaje: ₡{(feeMode === 'waive' ? quote.previousTotal : quote.totalAmount).toLocaleString('es-CR')}. La salida se mantiene el {quote.checkOutDate}.</p>
              <label className="block text-sm">Correo del administrador<input type="email" required maxLength={150} autoComplete="off" value={credentials.email} onChange={(e) => setCredentials({ ...credentials, email: e.target.value })} className="mt-1 block w-full rounded-lg border border-line p-2" /></label>
              <label className="block text-sm">Contraseña del administrador<input type="password" required maxLength={72} autoComplete="off" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} className="mt-1 block w-full rounded-lg border border-line p-2" /></label>
              <label className="block text-sm">Motivo de autorización<textarea required minLength={10} maxLength={250} value={credentials.reason} onChange={(e) => setCredentials({ ...credentials, reason: e.target.value })} className="mt-1 block w-full rounded-lg border border-line p-2" /></label>
              <div className="flex gap-3"><button disabled={busy} className="rounded-lg bg-primary-700 px-4 py-2 text-white">Autorizar y registrar ingreso</button><button type="button" disabled={busy} onClick={() => { setAuthorization(null); setCredentials({ email: '', password: '', reason: '' }); }} className="rounded-lg border border-line px-4 py-2">Cancelar autorización</button></div>
            </form>}
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
