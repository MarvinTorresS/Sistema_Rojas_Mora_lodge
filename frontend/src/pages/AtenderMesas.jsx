import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import EncabezadoRestaurante from '../components/restaurante/EncabezadoRestaurante';
import TableTile from '../components/restaurante/atencion/TableTile';
import TableLegend from '../components/restaurante/atencion/TableLegend';
import OpenAccountPanel, { accountPath } from '../components/restaurante/atencion/OpenAccountPanel';
import {
  RESTAURANT_USER_ID, listOpenAccounts, listRestaurantTables, openTableAccount,
} from '../services/restauranteService';
import { tableServiceState } from '../utils/restauranteFormulario';
import { TIME_ZONE } from '../utils/restaurante';
import './ReservasCancha.css';
import './ReservasSalon.css';
import './Restaurante.css';
import './AtenderMesas.css';

/**
 * HU-024 (Marvin, Sprint 4) - Abrir una cuenta al asignar una mesa
 * (Mesero o Administrador). Ruta /tareas/mesa (tarjeta "Abrir cuenta de
 * mesa" del Dashboard). Concepto A del prototipo: panel de mesas por estado.
 *   CA-1  Mesa disponible: se crea la cuenta, se registran mesero y hora, y
 *         la mesa pasa a "Ocupada".
 *   CA-2  Dos meseros a la vez: el segundo ve "Esta mesa ya fue abierta" y no
 *         se crea otra cuenta (lo garantiza el backend con un bloqueo).
 *   CA-3  Mesa ocupada: "La mesa ya se encuentra ocupada" y se sugiere unir
 *         el pedido a la cuenta abierta.
 *
 * Que es "ocupada" lo decide la cuenta abierta (igual que el backend), por
 * eso se cargan mesas y cuentas abiertas a la vez.
 */
export const ALREADY_OPENED_MESSAGE = 'Esta mesa ya fue abierta';
export const ACCOUNT_OPENED_MESSAGE = 'Cuenta abierta exitosamente';

const timeFormat = new Intl.DateTimeFormat('es-CR', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const formatTime = (value) => (value ? timeFormat.format(new Date(value)) : '—');

// Errores en los que lo que se ve en pantalla quedo viejo: se recarga.
const STALE_CODES = ['TABLE_ALREADY_OPENED', 'TABLE_OCCUPIED', 'TABLE_INACTIVE'];

export default function AtenderMesas() {
  const [board, setBoard] = useState({ status: 'loading', tables: [], accountByTable: new Map(), message: '' });
  const [selectedId, setSelectedId] = useState(null);
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState(null);
  const requestId = useRef(0);
  const sending = useRef(false);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setBoard((previous) => ({ ...previous, status: 'loading', message: '' }));
    try {
      const [tables, accounts] = await Promise.all([listRestaurantTables(), listOpenAccounts()]);
      if (id !== requestId.current) return;
      const accountByTable = new Map(accounts.data
        .filter((account) => account.table)
        .map((account) => [account.table.tableId, account.accountId]));
      setBoard({ status: 'success', tables: tables.data, accountByTable, message: '' });
    } catch (error) {
      if (id === requestId.current) setBoard((previous) => ({ ...previous, status: 'error', message: error.message }));
    }
  }, []);
  useEffect(() => { load(); return () => { requestId.current += 1; }; }, [load]);

  const stateOf = (table) => tableServiceState(table, board.accountByTable.get(table.tableId));
  const selected = board.tables.find((table) => table.tableId === selectedId) ?? null;

  function select(table) {
    if (sending.current) return;
    setResult(null);
    setSelectedId(table.tableId);
  }

  async function open(table) {
    if (sending.current) return;
    sending.current = true;
    setOpening(true);
    setResult(null);
    try {
      // Lo que el mesero VEIA al confirmar: asi el backend distingue CA-2 de CA-3.
      const { data, message } = await openTableAccount({ tableId: table.tableId, seenTableStatus: stateOf(table) });
      setResult({ kind: 'success', message: message || ACCOUNT_OPENED_MESSAGE, account: data.account, table: data.table });
      setSelectedId(null);
      load();
    } catch (error) {
      setResult({
        kind: 'error', code: error.code, tableNumber: table.tableNumber,
        message: error.code === 'TABLE_ALREADY_OPENED' ? ALREADY_OPENED_MESSAGE : error.message,
        accountId: error.details?.accountId ?? null,
      });
      if (STALE_CODES.includes(error.code)) { setSelectedId(null); load(); }
    } finally {
      sending.current = false;
      setOpening(false);
    }
  }

  const hasTables = board.status === 'success' && board.tables.length > 0;

  return (
    <div className="bombonera bmb-salon bmb-restaurante">
      <div className="bmb-content">
        <EncabezadoRestaurante
          kicker="Restaurante" title="Atender mesas"
          text={<>Tocá una mesa disponible para abrir su cuenta<br />y empezar a tomar el pedido.</>}
          actions={<TableLegend />}
        />

        {result?.kind === 'error' && (
          <div role="alert" className="rst-race-alert">
            <span className="rst-race-icon" aria-hidden="true">!</span>
            <span>
              <strong>{result.message.replace(/\.$/, '')}.</strong>
              {result.code === 'TABLE_ALREADY_OPENED' && ` Otro usuario abrió la Mesa ${result.tableNumber} hace un momento; ya aparece como ocupada.`}
              {result.code === 'TABLE_OCCUPIED' && ` La Mesa ${result.tableNumber} ya tiene una cuenta abierta.`}
            </span>
            {result.accountId && <Link to={accountPath(result.accountId)}>Ver cuenta</Link>}
          </div>
        )}

        <div className="rst-service-layout">
          <section className="bmb-card rst-panel rst-service-board" aria-labelledby="rst-service-title">
            <div className="rst-panel-head">
              <h2 id="rst-service-title">Mesas del restaurante</h2>
              <button type="button" className="rst-ghost" onClick={load} disabled={board.status === 'loading' || opening}>
                <RotateCcw size={14} aria-hidden="true" />Actualizar
              </button>
            </div>

            <div aria-live="polite" aria-busy={board.status === 'loading'}>
              {board.status === 'loading' && board.tables.length === 0 && <p role="status" className="rst-muted">Cargando mesas…</p>}
              {board.status === 'error' && (
                <div className="rst-alert" role="alert">
                  <span>{board.message}</span>
                  <button type="button" onClick={load}>Reintentar</button>
                </div>
              )}
              {board.status === 'success' && board.tables.length === 0 && (
                <div className="rst-empty">
                  <p>No hay mesas registradas todavía.</p>
                  <Link to="/restaurante/mesas/registrar" className="bmb-action">Registrar mesa</Link>
                </div>
              )}
            </div>

            {hasTables && (
              <ul className="rst-tiles" aria-label="Mesas">
                {board.tables.map((table) => (
                  <li key={table.tableId}>
                    <TableTile table={table} state={stateOf(table)} selected={table.tableId === selectedId} onSelect={select} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {result?.kind === 'success' ? (
            <aside className="bmb-card rst-panel rst-open-panel" aria-label="Cuenta abierta">
              <span className="rst-done-badge" aria-hidden="true"><Check size={24} /></span>
              <h2 role="status" className="rst-open-success">{result.message}</h2>
              <dl className="rst-open-facts">
                <div><dt>Mesa</dt><dd>Mesa {result.table.tableNumber}</dd></div>
                <div><dt>Mesero responsable</dt><dd>Usuario de turno (n.º {RESTAURANT_USER_ID})</dd></div>
                <div><dt>Hora de apertura</dt><dd>{formatTime(result.account.openedAt)}</dd></div>
                <div><dt>Estado de la mesa</dt><dd className="is-occupied">Ocupada</dd></div>
              </dl>
              <Link to={accountPath(result.account.accountId)} className="bmb-continue rst-open-cta">
                Tomar el pedido <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <button type="button" className="rst-ghost rst-open-secondary" onClick={() => setResult(null)}>Atender otra mesa</button>
            </aside>
          ) : (
            <OpenAccountPanel
              table={selected} state={selected ? stateOf(selected) : null}
              accountId={selected ? board.accountByTable.get(selected.tableId) : null}
              opening={opening} onOpen={open}
            />
          )}
        </div>
      </div>
    </div>
  );
}
