import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getAccountTotal } from '../services/accountTotalService';
const money = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', minimumFractionDigits: 2 });
const STATUS = { open: 'Abierta', closed: 'Cerrada', cancelled: 'Cancelada' };

export default function TotalCuentaMesa() {
  const [accountId, setAccountId] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function consult(id) {
    if (!/^\d+$/.test(String(id)) || Number(id) < 1 || Number(id) > 2147483647) {
      setError('Ingresá un número de cuenta válido.'); return;
    }
    setBusy(true); setError(''); setResult(null);
    try { setResult(await getAccountTotal(Number(id))); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <section className="mx-auto w-full max-w-3xl space-y-6 p-6" aria-busy={busy}>
    <Link to="/restaurante/mesas" className="text-sm text-primary-700">Volver al estado de mesas</Link>
    <div><h1 className="font-display text-3xl font-semibold text-primary-900">Total de la cuenta</h1>
      <p className="mt-2 text-muted">Consultá los consumos, el impuesto y el total a pagar.</p></div>
    <form onSubmit={(event) => { event.preventDefault(); consult(accountId); }} className="flex flex-wrap gap-3">
      <label className="flex flex-1 flex-col gap-2 text-sm">Número de cuenta
        <input type="number" min="1" max="2147483647" step="1" value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={busy}
          className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
      <button disabled={busy} className="self-end rounded-lg bg-primary-700 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Consultando…' : 'Consultar total'}</button>
    </form>
    {error && <p role="alert" className="rounded-lg bg-coral-50 p-3 text-coral-700">{error}</p>}
    {result && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Cuenta #{result.account.accountId}{result.account.tableNumber ? ` · Mesa ${result.account.tableNumber}` : ''}</h2>
          <p className="text-sm text-muted">{STATUS[result.account.status] ?? result.account.status}</p></div>
        <button onClick={() => consult(result.account.accountId)} disabled={busy} className="rounded-lg border border-line px-4 py-2">Actualizar total</button>
      </div>
      {result.message && <p role="status">{result.message}</p>}
      <ul className="space-y-3">{result.lines.map((line) => <li key={line.itemId} className="flex flex-wrap justify-between gap-3 rounded-lg border border-line bg-surface p-4">
        <div><h3 className="font-semibold">{line.productName}</h3><p className="text-sm text-muted">{line.quantity} × {money.format(line.unitPrice)}</p></div>
        <p className="font-medium">{money.format(line.amount)}</p>
      </li>)}</ul>
      <dl className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd>{money.format(result.subtotal)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Impuesto ({result.taxPercentage}%)</dt><dd>{money.format(result.taxAmount)}</dd></div>
        <div className="flex justify-between gap-3 border-t border-line pt-3 text-xl font-semibold"><dt>Total a pagar</dt><dd>{money.format(result.total)}</dd></div>
      </dl>
      <p className="text-sm text-muted">Consulta realizada: {new Date(result.checkedAt).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica' })}</p>
    </>}
  </section>;
}
