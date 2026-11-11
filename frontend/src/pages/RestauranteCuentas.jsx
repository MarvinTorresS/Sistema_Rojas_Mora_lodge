import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import EncabezadoRestaurante from '../components/restaurante/EncabezadoRestaurante';
import { PedidoPendiente, SelectorProductos } from '../components/restaurante/ProductosPedido';
import {
  addProductsToAccount, getAccount, listOpenAccounts, listOrderMenu, updateItemQuantity, removeAccountItem, closeAccount,
} from '../services/restauranteService';
import { formatDateTime, money, toRequestItems, MAX_QUANTITY_PER_LINE } from '../utils/restaurante';
import './ReservasCancha.css';
import './ReservasSalon.css';
import './Restaurante.css';

/**
 * HU-025 -- Agregar productos al pedido de una cuenta de mesa activa.
 *   CA-1  La cuenta actualiza el consumo acumulado al instante; cada producto
 *         muestra nombre, cantidad, precio unitario y subtotal.
 *   CA-2  Si el precio cambió después de abrir la cuenta, el producto nuevo usa
 *         el precio vigente y las líneas anteriores conservan el suyo (lo
 *         resuelve el servidor; aquí cada línea muestra su propio precio).
 *   CA-3  Sin existencias: "Producto sin existencias disponibles", no se agrega
 *         y el producto queda marcado "Agotado" en el catálogo.
 */
export default function RestauranteCuentas() {
  const [accounts, setAccounts] = useState({ status: 'loading', data: [], message: '' });
  const [menu, setMenu] = useState({ status: 'loading', data: [], message: '' });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState({ status: 'idle', data: null, message: '' });
  const [pending, setPending] = useState([]);
  const [submit, setSubmit] = useState({ status: 'idle', message: '' });
  const [notice, setNotice] = useState('');
  const [closing, setClosing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editResult, setEditResult] = useState({ status: 'idle', message: '', needsReload: false });
  const sending = useRef(false);
  const detailRequest = useRef(0);

  const loadAccounts = useCallback(async () => {
    setAccounts((prev) => ({ ...prev, status: 'loading', message: '' }));
    try {
      const { data } = await listOpenAccounts();
      setAccounts({ status: 'success', data, message: '' });
    } catch (error) { setAccounts((prev) => ({ ...prev, status: 'error', message: error.message })); }
  }, []);

  const loadMenu = useCallback(async ({ preserveDraft = false } = {}) => {
    setMenu((prev) => ({ ...prev, status: 'loading', message: '' }));
    try {
      const { data } = await listOrderMenu();
      setMenu({ status: 'success', data, message: '' });
      // Si algo del pedido por agregar se agotó mientras tanto, se quita o ajusta.
      if (!preserveDraft) setPending((prev) => prev.flatMap((line) => {
        const product = data.find((entry) => entry.productId === line.productId);
        if (!product || product.soldOut) return [];
        return [{ ...line, quantity: Math.min(line.quantity, product.stockQuantity, 99) }];
      }));
    } catch (error) { setMenu((prev) => ({ ...prev, status: 'error', message: error.message })); }
  }, []);

  useEffect(() => { loadAccounts(); loadMenu(); }, [loadAccounts, loadMenu]);

  // HU-024 (Marvin): "Tomar el pedido" / "Unir el pedido a la cuenta abierta"
  // llegan con ?cuenta=<id>; esa cuenta se abre sola una vez al entrar.
  const [searchParams] = useSearchParams();
  const requestedAccount = Number(searchParams.get('cuenta'));
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || !Number.isSafeInteger(requestedAccount) || requestedAccount < 1) return;
    preselected.current = true;
    openAccount(requestedAccount);
    // openAccount se recrea en cada render; solo importa el id pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedAccount]);

  async function openAccount(accountId) {
    if (sending.current) return;
    const id = ++detailRequest.current;
    setSelectedId(accountId);
    setClosing(null);
    setRemoving(null);
    setEditing(null);
    setEditResult({ status: 'idle', message: '', needsReload: false });
    setPending([]);
    setSubmit({ status: 'idle', message: '' });
    setNotice('');
    setDetail({ status: 'loading', data: null, message: '' });
    try {
      const data = await getAccount(accountId);
      if (id === detailRequest.current) setDetail({ status: 'success', data, message: '' });
    } catch (error) {
      if (id === detailRequest.current) setDetail({ status: 'error', data: null, message: error.message });
    }
  }

  async function addToAccount() {
    if (sending.current || editing || removing || closing || editResult.needsReload || pending.length === 0 || !selectedId) return;
    sending.current = true;
    setSubmit({ status: 'loading', message: '' });
    setNotice('');
    try {
      const updated = await addProductsToAccount(selectedId, toRequestItems(pending));
      setDetail({ status: 'success', data: updated, message: '' });
      setPending([]);
      setSubmit({ status: 'idle', message: '' });
      const mesa = updated.table?.tableNumber;
      setNotice(`Productos agregados a la cuenta${mesa ? ` de la mesa ${mesa}` : ''}. Consumo acumulado: ${money(updated.accumulatedTotal)}.`);
      // El menú (existencias / Agotado) y el resumen de cuentas cambiaron.
      loadMenu();
      loadAccounts();
    } catch (error) {
      setSubmit({ status: 'error', message: error.message, code: error.code, productName: error.details?.productName });
      // Sin existencias o cuenta ya cerrada: lo que se ve en pantalla quedó viejo.
      if (['PRODUCT_OUT_OF_STOCK', 'INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE'].includes(error.code)) loadMenu();
      if (error.code === 'ACCOUNT_CLOSED') { loadAccounts(); }
    } finally {
      sending.current = false;
    }
  }

  async function reloadSelectedAccount() {
    if (sending.current) return;
    sending.current = true;
    setEditResult((prev) => ({ ...prev, status: 'loading' }));
    try {
      const data = await getAccount(selectedId);
      setDetail({ status: 'success', data, message: '' });
      setEditing(null);
      setClosing(null);
      setRemoving(null);
      setEditResult({ status: 'idle', message: '', needsReload: false });
      loadAccounts();
      loadMenu({ preserveDraft: true });
    } catch (error) {
      setEditResult({ status: 'error', message: error.message, needsReload: true });
    } finally { sending.current = false; }
  }

  async function saveQuantity() {
    if (sending.current || !editing || editResult.needsReload) return;
    const quantity = Number(editing.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE) {
      setEditResult({ status: 'error', message: `La cantidad debe ser un entero entre 1 y ${MAX_QUANTITY_PER_LINE}.`, needsReload: false });
      return;
    }
    sending.current = true;
    setEditResult({ status: 'loading', message: '', needsReload: false });
    setNotice('');
    try {
      const updated = await updateItemQuantity(selectedId, editing.itemId, { quantity, expectedVersion: editing.expectedVersion });
      setDetail({ status: 'success', data: updated, message: '' });
      setEditing(null);
      setClosing(null);
      setRemoving(null);
      setEditResult({ status: 'idle', message: '', needsReload: false });
      setNotice('Cantidad actualizada correctamente.');
      loadAccounts();
      loadMenu({ preserveDraft: true });
    } catch (error) {
      const needsReload = ['ACCOUNT_VERSION_CONFLICT', 'ACCOUNT_CLOSED', 'ITEM_ALREADY_SENT', 'ITEM_REMOVED'].includes(error.code);
      setEditResult({ status: 'error', message: error.message, needsReload });
      if (['PRODUCT_OUT_OF_STOCK', 'INSUFFICIENT_STOCK', 'PRODUCT_UNAVAILABLE'].includes(error.code)) loadMenu({ preserveDraft: true });
      if (error.code === 'ACCOUNT_CLOSED') {
        setEditing(null);
        loadAccounts();
        try {
          const data = await getAccount(selectedId);
          setDetail({ status: 'success', data, message: '' });
        } catch (refreshError) {
          setEditResult({ status: 'error', message: `${error.message} ${refreshError.message}`, needsReload: true });
        }
      }
    } finally { sending.current = false; }
  }

  async function confirmRemoval() {
    if (sending.current || !removing || editResult.needsReload) return;
    sending.current = true;
    setEditResult({ status: 'loading', message: '', needsReload: false });
    setNotice('');
    try {
      const updated = await removeAccountItem(selectedId, removing.itemId, {
        expectedVersion: removing.expectedVersion, removedReason: removing.reason,
      });
      setDetail({ status: 'success', data: updated, message: '' });
      setRemoving(null);
      setEditResult({ status: 'idle', message: '', needsReload: false });
      setNotice('Producto retirado correctamente.');
      loadAccounts();
      loadMenu({ preserveDraft: true });
    } catch (error) {
      const needsReload = ['ACCOUNT_VERSION_CONFLICT', 'ACCOUNT_CLOSED', 'ITEM_ALREADY_SENT', 'ITEM_REMOVED'].includes(error.code)
        || error.status === 404;
      setEditResult({ status: 'error', message: error.message, needsReload });
      if (error.code === 'ACCOUNT_CLOSED') loadAccounts();
    } finally { sending.current = false; }
  }

  async function confirmClose() {
    if (sending.current || !closing || editResult.needsReload) return;
    sending.current = true;
    setEditResult({ status: 'loading', message: '', needsReload: false });
    setNotice('');
    try {
      const updated = await closeAccount(selectedId, { expectedVersion: closing.expectedVersion });
      setDetail({ status: 'success', data: updated, message: '' });
      setClosing(null);
      setPending([]);
      setEditResult({ status: 'idle', message: '', needsReload: false });
      setNotice(updated.tableStatus === 'available'
        ? 'Cuenta cerrada correctamente. Mesa disponible para un nuevo servicio.'
        : 'Cuenta cerrada correctamente. La mesa conserva sus restricciones o su ocupación por otra cuenta.');
      setAccounts(prev => ({ ...prev, data: prev.data.filter(entry => entry.accountId !== selectedId) }));
      loadAccounts();
    } catch (error) {
      const needsReload = ['ACCOUNT_VERSION_CONFLICT', 'ACCOUNT_CLOSED', 'ACCOUNT_EMPTY'].includes(error.code)
        || error.status === 404;
      setEditResult({ status: 'error', message: error.message, needsReload });
      if (error.code === 'ACCOUNT_CLOSED') loadAccounts();
    } finally { sending.current = false; }
  }

  const account = detail.data;
  const sendingNow = submit.status === 'loading' || editResult.status === 'loading';

  return (
    <div className="bombonera bmb-salon bmb-restaurante">
      <div className="bmb-content">
        <EncabezadoRestaurante
          kicker="Restaurante" title="Cuentas de mesa"
          text={<>Agregá productos a la cuenta abierta<br />y seguí el consumo acumulado.</>}
        />

        {notice && <p role="status" className="bmb-success">{notice}</p>}

        <div className="bmb-layout">
          <div className="bmb-main">
            <section className="bmb-card rst-panel" aria-labelledby="rst-accounts-title">
              <div className="rst-panel-head">
                <div className="bmb-step"><span>1</span><h2 id="rst-accounts-title">Elegí la cuenta</h2></div>
                <button type="button" className="rst-ghost" onClick={loadAccounts} disabled={accounts.status === 'loading'}>
                  <RotateCcw size={14} aria-hidden="true" />Actualizar
                </button>
              </div>
              {accounts.status === 'loading' && <p role="status" className="rst-muted">Cargando cuentas…</p>}
              {accounts.status === 'error' && (
                <div className="rst-alert" role="alert"><span>{accounts.message}</span><button type="button" onClick={loadAccounts}>Reintentar</button></div>
              )}
              {accounts.status === 'success' && accounts.data.length === 0 && (
                <div className="rst-empty">
                  <p>No hay cuentas de mesa abiertas.</p>
                  <Link to="/tareas/mesa" className="bmb-link-button">Abrir una cuenta de mesa</Link>
                </div>
              )}
              {accounts.data.length > 0 && (
                <ul className="rst-accounts" aria-label="Cuentas abiertas">
                  {accounts.data.map((entry) => (
                    <li key={entry.accountId}>
                      <button
                        type="button" aria-pressed={selectedId === entry.accountId}
                        aria-label={`Cuenta de la mesa ${entry.table?.tableNumber ?? entry.accountId}`}
                        onClick={() => openAccount(entry.accountId)} disabled={sendingNow}
                      >
                        <strong>Mesa {entry.table?.tableNumber ?? '—'}</strong>
                        <small>
                          {entry.customerName ? `Huésped: ${entry.customerName} · ` : ''}
                          {entry.itemCount} {entry.itemCount === 1 ? 'producto' : 'productos'}
                        </small>
                        <span>{money(entry.accumulatedTotal)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bmb-card rst-panel" aria-labelledby="rst-menu-title">
              <div className="rst-panel-head">
                <div className="bmb-step"><span>2</span><h2 id="rst-menu-title">Menú</h2></div>
                <button type="button" className="rst-ghost" onClick={loadMenu} disabled={menu.status === 'loading'}>
                  <RotateCcw size={14} aria-hidden="true" />Actualizar existencias
                </button>
              </div>
              <SelectorProductos
                menu={menu.data} pending={pending} onChange={setPending}
                disabled={!selectedId || sendingNow || Boolean(closing) || account?.status !== 'open'}
                loading={menu.status === 'loading' && menu.data.length === 0}
                error={menu.status === 'error' ? menu.message : ''} onRetry={loadMenu}
              />
              {!selectedId && <p className="rst-muted">Elegí primero una cuenta para poder agregar productos.</p>}
            </section>
          </div>

          <aside className="bmb-card bmb-side" aria-label="Cuenta seleccionada">
            <p className="bmb-kicker">Cuenta seleccionada</p>
            {!selectedId && <p className="rst-muted">Todavía no elegiste ninguna cuenta.</p>}
            {detail.status === 'loading' && <p role="status" className="rst-muted">Cargando cuenta…</p>}
            {detail.status === 'error' && <p role="alert" className="rst-alert-text">{detail.message}</p>}
            {account && (
              <>
                <div className="bmb-venue">
                  <span className="bmb-venue-badge" aria-hidden="true">{account.table?.tableNumber ?? '—'}</span>
                  <div>
                    <strong>Mesa {account.table?.tableNumber ?? '—'}</strong>
                    <small>Abierta {formatDateTime(account.openedAt)}</small>
                  </div>
                </div>

                {editResult.message && <p role="alert" className="rst-alert-text">{editResult.message}</p>}
                {editResult.needsReload && (
                  <button type="button" className="rst-ghost" onClick={reloadSelectedAccount} disabled={sendingNow}>Recargar cuenta</button>
                )}
                {editResult.status === 'loading' && <p role="status">Actualizando cuenta…</p>}
                {account.status !== 'open' && <p className="rst-muted">Esta cuenta está cerrada o anulada y no admite modificaciones.</p>}

                {account.items.length === 0 ? (
                  <p className="rst-muted">La cuenta todavía no tiene productos.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                  <table className="rst-lines">
                    <caption className="sr-only">Productos de la cuenta</caption>
                    <thead><tr><th scope="col">Producto</th><th scope="col">Cant.</th><th scope="col">Precio unit.</th><th scope="col">Subtotal</th><th scope="col">Acciones</th></tr></thead>
                    <tbody>
                      {account.items.map((line) => (
                        <tr key={line.itemId}>
                          <th scope="row">{line.name}</th>
                          <td>{editing?.itemId === line.itemId ? (
                            <input type="number" min="1" max={MAX_QUANTITY_PER_LINE} step="1" style={{ width: '4rem' }}
                              aria-label={`Nueva cantidad de ${line.name}, línea ${line.itemId}`}
                              value={editing.quantity} disabled={sendingNow || editResult.needsReload}
                              onChange={(event) => setEditing({ ...editing, quantity: event.target.value })} />
                          ) : line.quantity}</td>
                          <td>{money(line.unitPrice)}</td>
                          <td>{money(line.subtotal)}</td>
                          <td>
                            {editing?.itemId === line.itemId ? (
                              <>
                                <button type="button" className="rst-ghost" onClick={saveQuantity} disabled={sendingNow || editResult.needsReload}>Guardar cantidad</button>
                                <button type="button" className="rst-ghost" disabled={sendingNow} onClick={() => {
                                  setEditing(null);
                                  if (!editResult.needsReload) setEditResult({ status: 'idle', message: '', needsReload: false });
                                }}>Cancelar edición</button>
                              </>
                            ) : account.status === 'open' && line.kitchenStatus === 'pending' ? (
                              <>
                              <button type="button" className="rst-ghost" aria-label={`Editar cantidad de ${line.name}, línea ${line.itemId}`}
                                disabled={sendingNow || Boolean(editing) || Boolean(removing) || Boolean(closing) || editResult.needsReload}
                                onClick={() => {
                                  setEditing({ itemId: line.itemId, quantity: String(line.quantity), expectedVersion: account.version });
                                  setEditResult({ status: 'idle', message: '', needsReload: false });
                                  setNotice('');
                                }}>Editar cantidad</button>
                              <button type="button" className="rst-ghost" aria-label={`Retirar ${line.name}, línea ${line.itemId}`}
                                disabled={sendingNow || Boolean(editing) || Boolean(removing) || Boolean(closing) || editResult.needsReload}
                                onClick={() => {
                                  setRemoving({ itemId: line.itemId, name: line.name, expectedVersion: account.version, reason: '' });
                                  setEditResult({ status: 'idle', message: '', needsReload: false });
                                  setNotice('');
                                }}>Retirar</button>
                              </>
                            ) : ['sent', 'preparing', 'served'].includes(line.kitchenStatus) ? (
                              <small><span>Enviado a cocina; no se puede modificar.</span><br />No se puede retirar.</small>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}

                {account.status === 'open' && (
                  <button type="button" className="rst-ghost"
                    disabled={sendingNow || Boolean(editing) || Boolean(removing) || Boolean(closing) || editResult.needsReload}
                    onClick={() => {
                      if (account.items.length === 0) {
                        setEditResult({ status: 'error', message: 'No se puede cerrar una cuenta sin consumos activos.', needsReload: false });
                        return;
                      }
                      setClosing({ expectedVersion: account.version });
                      setEditResult({ status: 'idle', message: '', needsReload: false });
                      setNotice('');
                    }}>Cerrar cuenta</button>
                )}
                {closing && (
                  <section role="dialog" aria-labelledby="close-account-title" className="rst-panel">
                    <h3 id="close-account-title">Confirmar cierre de cuenta</h3>
                    <p>¿Finalizar el servicio? El cierre no registra pagos ni genera facturas.</p>
                    {pending.length > 0 && <p>Hay productos sin agregar. Si confirma, se descartará ese borrador.</p>}
                    <button type="button" disabled={sendingNow || editResult.needsReload} onClick={confirmClose}>
                      {sendingNow ? 'Cerrando…' : 'Confirmar cierre'}
                    </button>
                    <button type="button" disabled={sendingNow} onClick={() => setClosing(null)}>Volver sin cerrar</button>
                  </section>
                )}

                {removing && (
                  <section role="dialog" aria-labelledby="remove-item-title" className="rst-panel">
                    <h3 id="remove-item-title">Confirmar retiro del producto</h3>
                    <p>¿Retirar {removing.name} de la cuenta? Se devolverán sus existencias.</p>
                    <label>Motivo (opcional)
                      <input maxLength={200} value={removing.reason} disabled={sendingNow || editResult.needsReload}
                        onChange={(event) => setRemoving({ ...removing, reason: event.target.value })} />
                    </label>
                    <button type="button" onClick={confirmRemoval} disabled={sendingNow || editResult.needsReload}>Confirmar retiro</button>
                    <button type="button" disabled={sendingNow} onClick={() => {
                      setRemoving(null);
                      if (!editResult.needsReload) setEditResult({ status: 'idle', message: '', needsReload: false });
                    }}>Volver</button>
                  </section>
                )}

                <div className="bmb-total" aria-live="polite">
                  <span>Consumo acumulado</span>
                  <strong>{money(account.accumulatedTotal)}</strong>
                </div>

                <PedidoPendiente menu={menu.data} pending={pending} onChange={setPending} disabled={sendingNow || Boolean(closing) || account.status !== 'open'}>
                  {submit.status === 'error' && (
                    <p role="alert" className="rst-alert-text">
                      {submit.message}{submit.productName ? ` (${submit.productName})` : ''}
                    </p>
                  )}
                  <button type="button" className="bmb-continue" disabled={pending.length === 0 || sendingNow || Boolean(editing) || Boolean(removing) || Boolean(closing) || editResult.needsReload || account.status !== 'open'} onClick={addToAccount}>
                    <span>{submit.status === 'loading' ? 'Agregando…' : 'Agregar a la cuenta'}</span>
                  </button>
                </PedidoPendiente>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
