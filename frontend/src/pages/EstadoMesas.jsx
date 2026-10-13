import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listTableStatuses } from '../services/tableStatusService';

const STATES = {
  available: { label: 'Disponible', style: 'border-teal-200 bg-teal-50 text-teal-700' },
  occupied: { label: 'Ocupada', style: 'border-coral-200 bg-coral-50 text-coral-700' },
  reserved: { label: 'Reservada', style: 'border-yellow-300 bg-yellow-50 text-yellow-900' },
  unavailable: { label: 'Fuera de servicio', style: 'border-line bg-surface-alt text-muted' },
};

export default function EstadoMesas() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    setBusy(true); setError('');
    try { setResult(await listTableStatuses()); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    listTableStatuses().then((data) => { if (active) setResult(data); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  const operational = result?.data.filter((table) => table.status !== 'unavailable') ?? [];
  const unavailable = result?.data.filter((table) => table.status === 'unavailable') ?? [];

  function cards(tables) {
    return <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{tables.map((table) => {
      const state = STATES[table.status];
      return <li key={table.tableId} className={`rounded-xl border p-5 ${state.style}`}>
        <h3 className="text-xl font-semibold">Mesa {table.tableNumber}</h3>
        <p className="mt-1 text-sm">{table.seatCount} personas</p>
        <p className="mt-3 font-semibold">{state.label}</p>
      </li>;
    })}</ul>;
  }

  return <section className="mx-auto w-full max-w-5xl space-y-6 p-6" aria-busy={busy}>
    <Link to="/" className="text-sm text-primary-700">Volver al inicio</Link>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="font-display text-3xl font-semibold text-primary-900">Estado de las mesas</h1>
        <p className="mt-2 text-muted">Consultá qué mesas podés atender en este momento.</p></div>
      <button onClick={refresh} disabled={busy} className="rounded-lg bg-primary-700 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Consultando…' : 'Actualizar'}</button>
    </div>
    {error && <div role="alert" className="rounded-lg bg-coral-50 p-3 text-coral-700"><p>{error}</p>
      {result && <p>La información mostrada corresponde a la última consulta exitosa.</p>}</div>}
    {busy && <p role="status">Consultando el estado de las mesas…</p>}
    {result && <>
      <p className="text-sm text-muted">Última consulta: {new Date(result.meta.checkedAt).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica' })}</p>
      <ul aria-label="Resumen de mesas" className="flex flex-wrap gap-3 text-sm">{Object.entries(STATES).map(([key, state]) => <li key={key} className={`rounded-lg border px-3 py-2 ${state.style}`}>{state.label}: {result.meta.counts[key]}</li>)}</ul>
      {result.data.length === 0 && <p>No hay mesas configuradas en el sistema.</p>}
      {result.meta.message && <p role="status" className="rounded-lg bg-yellow-50 p-3 text-yellow-900">{result.meta.message}</p>}
      {cards(operational)}
      {unavailable.length > 0 && <div className="space-y-4"><h2 className="text-lg font-semibold">Mesas fuera de servicio</h2>{cards(unavailable)}</div>}
    </>}
  </section>;
}
