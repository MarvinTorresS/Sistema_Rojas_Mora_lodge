import { useCallback, useEffect, useRef, useState } from 'react';
import { BedDouble, Download, Printer, Search } from 'lucide-react';
import EncabezadoRestaurante from '../components/restaurante/EncabezadoRestaurante';
import { PedidoPendiente, SelectorProductos } from '../components/restaurante/ProductosPedido';
import {
  getGuestBalance, listOrderMenu, listRestaurantTables, registerGuestConsumption, searchGuests,
} from '../services/restauranteService';
import {
  buildBalanceCsv, downloadTextFile, formatDate, formatDateTime, money, slug, toRequestItems,
} from '../utils/restaurante';
import './ReservasCancha.css';
import './ReservasSalon.css';
import './Restaurante.css';

/**
 * HU-030 -- Registrar un consumo del restaurante a nombre de un huésped de cabina.
 *   CA-1  Con reserva "En curso" (check-in hecho), el consumo se vincula a su
 *         reserva; se identifica por número de cabina o nombre de la reserva.
 *   CA-2  Sin reserva en curso: "El huésped no cuenta con una reserva activa" y
 *         no se vincula nada.
 *   CA-3  Los pedidos adicionales suman al saldo acumulado, visible aquí y en el
 *         módulo de cabinas (check-out lee las mismas cuentas por reserva).
 * HU-031 -- Consultar el saldo acumulado de consumos del huésped.
 *   CA-1  Detalle con fecha, producto y monto, y saldo total; se puede imprimir
 *         o exportar como "comprobante preliminar".
 *   CA-2  Sin consumos: "Este huésped no tiene consumos registrados en el restaurante".
 */
export const NO_ACTIVE_BOOKING = 'El huésped no cuenta con una reserva activa';
export const NO_CONSUMPTION = 'Este huésped no tiene consumos registrados en el restaurante';

const STATUS_LABELS = {
  pending: 'Pendiente', active: 'Reserva activa (sin check-in)', checked_in: 'En curso', completed: 'Finalizada', cancelled: 'Cancelada', rejected: 'Rechazada',
};

export default function RestauranteHuespedes() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ status: 'idle', data: [], message: '', term: '' });
  const [selected, setSelected] = useState(null);
  const [menu, setMenu] = useState({ status: 'loading', data: [], message: '' });
  const [tables, setTables] = useState([]);
  const [tableId, setTableId] = useState('');
  const [pending, setPending] = useState([]);
  const [submit, setSubmit] = useState({ status: 'idle', message: '', code: '' });
  const [notice, setNotice] = useState('');
  const [balance, setBalance] = useState({ status: 'idle', data: null, message: '' });
  const sending = useRef(false);
  const balanceRequest = useRef(0);

  const loadMenu = useCallback(async () => {
    setMenu((prev) => ({ ...prev, status: 'loading', message: '' }));
    try {
      const { data } = await listOrderMenu();
      setMenu({ status: 'success', data, message: '' });
      setPending((prev) => prev.flatMap((line) => {
        const product = data.find((entry) => entry.productId === line.productId);
        if (!product || product.soldOut) return [];
        return [{ ...line, quantity: Math.min(line.quantity, product.stockQuantity, 99) }];
      }));
    } catch (error) { setMenu((prev) => ({ ...prev, status: 'error', message: error.message })); }
  }, []);

  const loadTables = useCallback(async () => {
    try {
      const { data } = await listRestaurantTables();
      setTables(data.filter((table) => table.isActive && !table.isOccupied));
    } catch { setTables([]); }
  }, []);

  useEffect(() => { loadMenu(); loadTables(); }, [loadMenu, loadTables]);

  async function handleSearch(event) {
    event.preventDefault();
    const term = query.trim();
    if (!term) {
      setSearch({ status: 'error', data: [], message: 'Escribí el número de cabina o el nombre del huésped.', term });
      return;
    }
    setSearch({ status: 'loading', data: [], message: '', term });
    setSelected(null);
    setBalance({ status: 'idle', data: null, message: '' });
    setPending([]);
    setSubmit({ status: 'idle', message: '', code: '' });
    setNotice('');
    try {
      const { data } = await searchGuests(term);
      setSearch({ status: 'success', data, message: '', term });
    } catch (error) { setSearch({ status: 'error', data: [], message: error.message, term }); }
  }

  function chooseGuest(guest) {
    setSelected(guest);
    setPending([]);
    setSubmit({ status: 'idle', message: '', code: '' });
    setNotice('');
    setBalance({ status: 'idle', data: null, message: '' });
  }

  async function showBalance(guest) {
    const id = ++balanceRequest.current;
    setBalance({ status: 'loading', data: null, message: '' });
    try {
      const data = await getGuestBalance(guest.bookingId);
      if (id === balanceRequest.current) setBalance({ status: 'success', data, message: '' });
    } catch (error) {
      if (id === balanceRequest.current) setBalance({ status: 'error', data: null, message: error.message });
    }
  }

  async function registerConsumption() {
    if (sending.current || !selected || pending.length === 0) return;
    sending.current = true;
    setSubmit({ status: 'loading', message: '', code: '' });
    setNotice('');
    try {
      const result = await registerGuestConsumption({
        bookingId: selected.bookingId, tableId: tableId ? Number(tableId) : undefined, items: toRequestItems(pending),
      });
      const guest = result.guest;
      setSelected((prev) => ({ ...prev, accumulatedBalance: guest.accumulatedBalance }));
      setSearch((prev) => ({
        ...prev,
        data: prev.data.map((entry) => (entry.bookingId === guest.bookingId ? { ...entry, accumulatedBalance: guest.accumulatedBalance } : entry)),
      }));
      setPending([]);
      setTableId('');
      setSubmit({ status: 'idle', message: '', code: '' });
      setNotice(`Consumo registrado a nombre de ${guest.guestName} (${guest.cabinName ?? 'cabina'}). Saldo acumulado: ${money(guest.accumulatedBalance)}.`);
      // Si el detalle del saldo ya estaba abierto, se actualiza (CA-3).
      if (balance.status === 'success') showBalance(guest);
      loadMenu();
      loadTables();
    } catch (error) {
      setSubmit({ status: 'error', message: error.message, code: error.code ?? '' });
      if (['PRODUCT_OUT_OF_STOCK', 'INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE'].includes(error.code)) loadMenu();
      if (['TABLE_OCCUPIED', 'TABLE_INACTIVE'].includes(error.code)) loadTables();
    } finally {
      sending.current = false;
    }
  }

  function exportCsv() {
    const data = balance.data;
    downloadTextFile(`comprobante-preliminar-${slug(data.guest.guestName)}.csv`, buildBalanceCsv(data));
  }

  const sendingNow = submit.status === 'loading';
  const noActiveInResults = search.status === 'success' && search.data.every((guest) => !guest.inCourse);
  const canRegister = Boolean(selected?.inCourse);

  return (
    <div className="bombonera bmb-salon bmb-restaurante">
      <div className="bmb-content">
        <EncabezadoRestaurante
          kicker="Restaurante" title="Consumo de huéspedes"
          text={<>Cargá consumos a la reserva de la cabina<br />y consultá el saldo acumulado.</>}
        />

        {notice && <p role="status" className="bmb-success">{notice}</p>}

        <div className="bmb-layout">
          <div className="bmb-main">
            <section className="bmb-card rst-panel" aria-labelledby="rst-guest-title">
              <div className="bmb-step"><span>1</span><h2 id="rst-guest-title">Buscá al huésped</h2></div>
              <form role="search" aria-label="Buscar huésped" onSubmit={handleSearch} className="rst-search-form">
                <label htmlFor="guest-query">Número de cabina o nombre de la reserva</label>
                <div>
                  <input id="guest-query" type="search" maxLength={150} value={query} placeholder="Ej. 3 o Ana Mora"
                    onChange={(event) => setQuery(event.target.value)} />
                  <button type="submit" className="bmb-action" disabled={search.status === 'loading'}>
                    <Search size={14} aria-hidden="true" />{search.status === 'loading' ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>
              </form>

              <div aria-live="polite" aria-busy={search.status === 'loading'}>
                {search.status === 'error' && <p role="alert" className="rst-alert-text">{search.message}</p>}
                {noActiveInResults && <p role="alert" className="rst-alert-text">{NO_ACTIVE_BOOKING}</p>}
                {search.status === 'success' && search.data.length === 0 && (
                  <p className="rst-muted">No hay reservas de cabina con «{search.term}».</p>
                )}
              </div>

              {search.data.length > 0 && (
                <ul className="rst-guests" aria-label="Huéspedes encontrados">
                  {search.data.map((guest) => (
                    <li key={guest.bookingId} className={selected?.bookingId === guest.bookingId ? 'is-selected' : ''}>
                      <div>
                        <strong>{guest.guestName}</strong>
                        <small>{guest.cabinName ?? 'Cabina'} · {formatDate(guest.startDatetime)} – {formatDate(guest.endDatetime)}</small>
                        <span className={`rst-chip ${guest.inCourse ? 'is-ok' : 'is-pending'}`}>{STATUS_LABELS[guest.status] ?? guest.status}</span>
                      </div>
                      <div className="rst-guest-balance"><small>Saldo</small><strong>{money(guest.accumulatedBalance)}</strong></div>
                      <div className="rst-guest-actions">
                        <button type="button" aria-label={`Registrar consumo de ${guest.guestName}`} onClick={() => chooseGuest(guest)}>Registrar consumo</button>
                        <button type="button" aria-label={`Ver saldo de ${guest.guestName}`} onClick={() => { chooseGuest(guest); showBalance(guest); }}>Ver saldo</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bmb-card rst-panel" aria-labelledby="rst-guest-menu-title">
              <div className="bmb-step"><span>2</span><h2 id="rst-guest-menu-title">Menú</h2></div>
              <SelectorProductos
                menu={menu.data} pending={pending} onChange={setPending}
                disabled={!canRegister || sendingNow}
                loading={menu.status === 'loading' && menu.data.length === 0}
                error={menu.status === 'error' ? menu.message : ''} onRetry={loadMenu}
              />
              {!canRegister && <p className="rst-muted">Elegí un huésped con reserva en curso para cargar productos.</p>}
            </section>

            {balance.status !== 'idle' && (
              <section className="bmb-card rst-panel" aria-labelledby="rst-balance-title">
                {balance.status === 'loading' && <p role="status" className="rst-muted">Consultando saldo…</p>}
                {balance.status === 'error' && <p role="alert" className="rst-alert-text">{balance.message}</p>}
                {balance.status === 'success' && (
                  <>
                    <div className="rst-panel-head">
                      <div>
                        <h2 id="rst-balance-title">Saldo acumulado de {balance.data.guest.guestName}</h2>
                        <p className="rst-muted">{balance.data.guest.cabinName ?? 'Cabina'} · Comprobante preliminar</p>
                      </div>
                      {balance.data.hasConsumptions && (
                        <div className="rst-actions">
                          <button type="button" className="rst-ghost" onClick={() => window.print()}><Printer size={14} aria-hidden="true" />Imprimir</button>
                          <button type="button" className="rst-ghost" onClick={exportCsv}><Download size={14} aria-hidden="true" />Exportar CSV</button>
                        </div>
                      )}
                    </div>
                    {!balance.data.hasConsumptions ? (
                      <p role="status" className="rst-empty-text">{balance.data.message ?? NO_CONSUMPTION}</p>
                    ) : (
                      <div className="rst-print-area">
                        <h3 className="rst-print-title">Comprobante preliminar de consumos del restaurante</h3>
                        <p className="rst-print-meta">
                          {balance.data.guest.guestName} · {balance.data.guest.cabinName ?? 'Cabina'} · Generado {formatDateTime(balance.data.generatedAt)}
                        </p>
                        <div className="rst-table-wrap">
                          <table className="rst-table">
                            <caption className="sr-only">Consumos del huésped en el restaurante</caption>
                            <thead><tr><th scope="col">Fecha</th><th scope="col">Producto</th><th scope="col">Cant.</th><th scope="col">Monto</th></tr></thead>
                            <tbody>
                              {balance.data.consumptions.map((line) => (
                                <tr key={line.itemId}>
                                  <td>{formatDateTime(line.date)}</td>
                                  <td>{line.productName}</td>
                                  <td>{line.quantity}</td>
                                  <td>{money(line.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot><tr><th scope="row" colSpan={3}>Saldo total</th><td>{money(balance.data.total)}</td></tr></tfoot>
                          </table>
                        </div>
                        <p className="rst-muted">Documento preliminar: no es una factura ni representa un pago realizado.</p>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
          </div>

          <aside className="bmb-card bmb-side" aria-label="Huésped seleccionado">
            <p className="bmb-kicker">Consumo del huésped</p>
            {!selected && <p className="rst-muted">Todavía no elegiste a ningún huésped.</p>}
            {selected && (
              <>
                <div className="bmb-venue">
                  <span className="bmb-venue-badge" aria-hidden="true"><BedDouble size={22} /></span>
                  <div><strong>{selected.guestName}</strong><small>{selected.cabinName ?? 'Cabina'} · Saldo {money(selected.accumulatedBalance)}</small></div>
                </div>

                {!canRegister ? (
                  <p role="alert" className="rst-alert-text">{NO_ACTIVE_BOOKING}</p>
                ) : (
                  <>
                    <div className="rst-field">
                      <label htmlFor="guest-table">Mesa</label>
                      <select id="guest-table" value={tableId} disabled={sendingNow}
                        aria-invalid={submit.code === 'TABLE_REQUIRED' || undefined}
                        onChange={(event) => setTableId(event.target.value)}>
                        <option value="">Sin mesa (usar su cuenta abierta)</option>
                        {tables.map((table) => <option key={table.tableId} value={table.tableId}>Mesa {table.tableNumber} · {table.seatCount} personas</option>)}
                      </select>
                      <small>Si el huésped ya tiene una cuenta abierta, el pedido se suma a ella. La mesa solo se usa para abrir una cuenta nueva.</small>
                    </div>
                    <PedidoPendiente menu={menu.data} pending={pending} onChange={setPending} disabled={sendingNow}>
                      {submit.status === 'error' && <p role="alert" className="rst-alert-text">{submit.message}</p>}
                      <button type="button" className="bmb-continue" disabled={pending.length === 0 || sendingNow} onClick={registerConsumption}>
                        <span>{sendingNow ? 'Registrando…' : 'Registrar consumo'}</span>
                      </button>
                    </PedidoPendiente>
                  </>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
