import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import EncabezadoRestaurante from '../components/restaurante/EncabezadoRestaurante';
import FieldBookingDialog from '../components/FieldBookingDialog';
import EliminarMesaDialog from '../components/restaurante/EliminarMesaDialog';
import { deactivateRestaurantTable, listRestaurantTables } from '../services/restauranteService';
import './ReservasCancha.css';
import './ReservasSalon.css';
import './Restaurante.css';

/**
 * Catalogo de mesas del restaurante.
 *
 * HU-103 (Administrador lista las mesas)
 *   CA-1  Listado con número, capacidad, ubicación y estado (Activa/Inactiva),
 *         ordenado por número ascendente (lo ordena el backend).
 *   CA-2  Sin mesas: "No hay mesas registradas actualmente" y el botón
 *         "Registrar mesa" con acceso directo al formulario (HU-102).
 * HU-106 (Desactivar una mesa)
 *   CA-1  Mesa activa y sin cuenta abierta: se confirma con "¿Está seguro de
 *         que desea desactivar esta mesa?" y queda "Inactiva".
 *   CA-2  Con cuenta abierta: "No es posible desactivar una mesa con cuenta abierta".
 *   CA-3  Ya inactiva: "La mesa ya se encuentra inactiva"; "Desactivar" queda
 *         deshabilitado y se ofrece "Reactivar" (HU-107, de otro integrante).
 */
export const CONFIRM_MESSAGE = '¿Está seguro de que desea desactivar esta mesa?';
export const EMPTY_MESSAGE = 'No hay mesas registradas actualmente';
// Formulario de alta de mesa (HU-102): ruta reservada para esa HU.
export const REGISTER_TABLE_PATH = '/restaurante/mesas/registrar';

function RegisterTableLink({ className = '' }) {
  return (
    <Link to={REGISTER_TABLE_PATH} className={className || 'bmb-pill-link'}>
      <Plus size={16} aria-hidden="true" />Registrar mesa
    </Link>
  );
}

export default function RestauranteMesas() {
  const [state, setState] = useState({ status: 'loading', data: [], meta: null, message: '' });
  const [target, setTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [action, setAction] = useState({ status: 'idle', message: '' });
  const [notice, setNotice] = useState('');
  const requestId = useRef(0);
  const busy = action.status === 'loading';

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) => ({ ...prev, status: 'loading', message: '' }));
    try {
      const { data, meta } = await listRestaurantTables();
      if (id === requestId.current) setState({ status: 'success', data, meta, message: '' });
    } catch (error) {
      if (id === requestId.current) setState((prev) => ({ ...prev, status: 'error', message: error.message }));
    }
  }, []);
  useEffect(() => { load(); return () => { requestId.current += 1; }; }, [load]);

  function openConfirmation(table) {
    setNotice('');
    setAction({ status: 'idle', message: '' });
    setTarget(table);
  }

  function closeConfirmation() {
    if (busy) return;
    setTarget(null);
    setAction({ status: 'idle', message: '' });
  }

  async function confirmDeactivation() {
    if (busy || !target) return;
    setAction({ status: 'loading', message: '' });
    try {
      await deactivateRestaurantTable(target.tableId);
      setNotice(`Mesa ${target.tableNumber} desactivada. Ya no aparece en el panel de asignación.`);
      setTarget(null);
      setAction({ status: 'idle', message: '' });
      await load();
    } catch (error) {
      setAction({ status: 'error', message: error.message });
      // El estado en pantalla estaba desactualizado: se vuelve a leer para que
      // el boton quede como corresponde (HU-106 CA-3).
      if (error.code === 'TABLE_ALREADY_INACTIVE') load();
    }
  }

  const { data: tables, meta } = state;
  const hasTables = state.status === 'success' && tables.length > 0;

  return (
    <div className="bombonera bmb-salon bmb-restaurante">
      <div className="bmb-content">
        <EncabezadoRestaurante
          kicker="Restaurante" title="Mesas"
          text={<>Número, capacidad, ubicación y estado<br />de cada mesa del restaurante.</>}
          actions={<RegisterTableLink />}
        />

        {notice && <p role="status" className="bmb-success">{notice}</p>}

        <section className="bmb-card rst-panel" aria-labelledby="rst-tables-title">
          <div className="rst-panel-head">
            <div>
              <h2 id="rst-tables-title">Listado de mesas</h2>
              <p className="rst-muted">Ordenadas por número, de menor a mayor.</p>
            </div>
            <button type="button" className="rst-ghost" onClick={load} disabled={state.status === 'loading' || busy}>
              <RotateCcw size={14} aria-hidden="true" />Actualizar
            </button>
          </div>

          {hasTables && meta && (
            <dl className="rst-stats" aria-label="Resumen de mesas">
              <div><dt>Mesas</dt><dd>{meta.total}</dd></div>
              <div><dt>Activas</dt><dd>{meta.activeTotal}</dd></div>
              <div><dt>Inactivas</dt><dd>{meta.inactiveTotal}</dd></div>
              <div><dt>Capacidad activa</dt><dd>{meta.totalCapacity} personas</dd></div>
            </dl>
          )}

          <div aria-live="polite" aria-busy={state.status === 'loading'}>
            {state.status === 'loading' && <p role="status" className="rst-muted">Cargando mesas…</p>}
            {state.status === 'error' && (
              <div className="rst-alert" role="alert">
                <span>{state.message}</span>
                <button type="button" onClick={load}>Reintentar</button>
              </div>
            )}
            {state.status === 'success' && tables.length === 0 && (
              <div className="rst-empty">
                <p>{EMPTY_MESSAGE}</p>
                <RegisterTableLink className="bmb-action" />
              </div>
            )}
          </div>

          {hasTables && (
            <div className="rst-table-wrap">
              <table className="rst-table">
                <caption className="sr-only">Mesas del restaurante</caption>
                <thead>
                  <tr>{['N° mesa', 'Capacidad', 'Ubicación', 'Estado', 'Acciones'].map((label) => <th key={label} scope="col">{label}</th>)}</tr>
                </thead>
                <tbody>
                  {tables.map((table) => (
                    <tr key={table.tableId}>
                      <th scope="row">Mesa {table.tableNumber}</th>
                      <td>{table.seatCount} {table.seatCount === 1 ? 'persona' : 'personas'}</td>
                      <td>{table.location || '—'}</td>
                      <td>
                        <span className={`rst-chip ${table.isActive ? 'is-ok' : 'is-bad'}`}>{table.stateLabel}</span>
                        {table.isOccupied && <span className="rst-chip is-pending">En uso</span>}
                      </td>
                      <td>
                        <button type="button" className="rst-danger"
                          aria-label={`Eliminar mesa ${table.tableNumber} (Administrador)`}
                          disabled={busy} onClick={() => { setNotice(''); setDeleteTarget(table); }}>
                          Eliminar (Administrador)
                        </button>
                        <button
                          type="button" className="rst-danger"
                          aria-label={`Desactivar mesa ${table.tableNumber}`}
                          disabled={busy || !table.isActive}
                          title={table.isActive ? undefined : 'La mesa ya se encuentra inactiva'}
                          onClick={() => openConfirmation(table)}
                        >Desactivar</button>
                        {!table.isActive && (
                          <button
                            type="button" className="rst-ghost"
                            aria-label={`Reactivar mesa ${table.tableNumber}`}
                            disabled title="La reactivación de mesas se habilita con la HU-107"
                          >Reactivar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {deleteTarget && (
          <EliminarMesaDialog table={deleteTarget} onClose={() => setDeleteTarget(null)}
            onDeleted={(table) => {
              setDeleteTarget(null);
              setNotice(`Mesa ${table.tableNumber} eliminada permanentemente.`);
              load();
            }}
            onDeactivate={(table) => { setDeleteTarget(null); openConfirmation(table); }} />
        )}

        {target && (
          <FieldBookingDialog title="Desactivar mesa" kicker="Confirmación" busy={busy} onClose={closeConfirmation}>
            <p className="rst-confirm-text">{CONFIRM_MESSAGE}</p>
            <p className="rst-muted">
              Mesa {target.tableNumber} · {target.seatCount} {target.seatCount === 1 ? 'persona' : 'personas'}
              {target.location ? ` · ${target.location}` : ''}
            </p>
            <p className="rst-muted">Dejará de aparecer en el panel de asignación. Podrá reactivarse más adelante.</p>
            {action.status === 'error' && <p role="alert" className="rst-alert-text">{action.message}</p>}
            <div className="rst-dialog-actions">
              <button type="button" className="rst-primary-danger" disabled={busy} onClick={confirmDeactivation}>
                {busy ? 'Desactivando…' : 'Sí, desactivar'}
              </button>
              <button type="button" className="rst-ghost" disabled={busy} onClick={closeConfirmation}>
                {action.status === 'error' ? 'Cerrar' : 'No, volver'}
              </button>
            </div>
          </FieldBookingDialog>
        )}
      </div>
    </div>
  );
}
