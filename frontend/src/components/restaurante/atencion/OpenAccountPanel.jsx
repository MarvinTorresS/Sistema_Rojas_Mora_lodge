import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { RESTAURANT_USER_ID } from '../../../services/restauranteService';

export const TABLE_OCCUPIED_MESSAGE = 'La mesa ya se encuentra ocupada';
export const accountPath = (accountId) => `/restaurante/cuentas?cuenta=${accountId}`;

/**
 * HU-024: panel lateral de la mesa elegida.
 *   - Disponible: datos de la apertura y botón "Abrir cuenta" (CA-1).
 *   - Ocupada:    CA-3 "La mesa ya se encuentra ocupada"; no deja abrir otra
 *                 y sugiere unir el pedido a la cuenta que ya existe.
 * Solo presenta: la pagina decide qué pasa al confirmar (onOpen).
 */
export default function OpenAccountPanel({ table, state, accountId, opening, onOpen }) {
  if (!table) {
    return (
      <aside className="bmb-card rst-panel rst-open-panel" aria-label="Abrir cuenta">
        <p className="bmb-kicker">Abrir cuenta</p>
        <p className="rst-muted">Elegí una mesa disponible para abrir su cuenta y empezar a tomar el pedido.</p>
      </aside>
    );
  }

  const people = `${table.seatCount} ${table.seatCount === 1 ? 'comensal' : 'comensales'}`;
  return (
    <aside className="bmb-card rst-panel rst-open-panel" aria-label={`Mesa ${table.tableNumber}`}>
      <p className="bmb-kicker">{state === 'occupied' ? 'Mesa ocupada' : 'Abrir cuenta'}</p>
      <div className="rst-open-table">
        <span className={`rst-open-badge is-${state}`} aria-hidden="true">{table.tableNumber}</span>
        <div>
          <strong>Mesa {table.tableNumber}</strong>
          <span>{people}{table.location ? ` · ${table.location}` : ''}</span>
        </div>
      </div>

      {state === 'occupied' ? (
        <>
          <p role="alert" className="rst-alert-text">{TABLE_OCCUPIED_MESSAGE}</p>
          {accountId && (
            <Link to={accountPath(accountId)} className="bmb-continue rst-open-cta">
              Unir el pedido a la cuenta abierta <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </>
      ) : (
        <>
          <dl className="rst-open-facts">
            <div><dt>Mesero responsable</dt><dd>Usuario de turno (n.º {RESTAURANT_USER_ID})</dd></div>
            <div><dt>Hora de apertura</dt><dd>Se registra al confirmar</dd></div>
            <div><dt>La mesa pasará a</dt><dd className="is-occupied">Ocupada</dd></div>
          </dl>
          <button type="button" className="bmb-continue rst-open-cta" disabled={opening} onClick={() => onOpen(table)}>
            {opening ? 'Abriendo cuenta…' : 'Abrir cuenta'} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </>
      )}
    </aside>
  );
}
