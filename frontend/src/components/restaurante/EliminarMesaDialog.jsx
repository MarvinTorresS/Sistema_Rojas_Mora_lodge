import { useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import FieldBookingDialog from '../FieldBookingDialog';
import { deleteRestaurantTable } from '../../services/mesasService';
import { ROLES_PENDING_MESSAGE, isAdminAuthEnabled } from '../../config/features';

/**
 * HU-105 - Eliminar una mesa de forma permanente (autoriza un Administrador).
 *
 * Mientras no existan usuarios ni roles (Sprint 5, HU-032 a HU-039) nadie
 * puede autorizar con credenciales, asi que el dialogo lo explica y ofrece la
 * alternativa segura: desactivar la mesa (HU-106). El flujo con credenciales
 * queda intacto y se enciende con VITE_ADMIN_AUTH_ENABLED=true.
 */
export default function EliminarMesaDialog({ table, onClose, onDeleted, onDeactivate }) {
  if (!isAdminAuthEnabled()) {
    return <PendingRolesNotice table={table} onClose={onClose} onDeactivate={onDeactivate} />;
  }
  return <AdminDeleteForm table={table} onClose={onClose} onDeleted={onDeleted} onDeactivate={onDeactivate} />;
}

// Aviso mientras no existan roles y permisos.
function PendingRolesNotice({ table, onClose, onDeactivate }) {
  return (
    <FieldBookingDialog title="Eliminar mesa permanentemente" kicker="Autorización de Administrador" onClose={onClose}>
      <p className="rst-confirm-text">¿Desea eliminar permanentemente la mesa {table.tableNumber}?</p>
      <div role="status" className="rst-pending-feature">
        <ShieldAlert size={22} aria-hidden="true" />
        <div>
          <strong>{ROLES_PENDING_MESSAGE}</strong>
          <p>
            Eliminar una mesa requiere que un Administrador la autorice con su usuario. Esa función llega con
            el módulo de usuarios y roles; mientras tanto la eliminación no está disponible.
          </p>
        </div>
      </div>
      {table.isActive && (
        <p className="rst-muted">Si la mesa ya no se usará, puede desactivarla: sale del servicio y conserva su historial.</p>
      )}
      <div className="rst-dialog-actions">
        {table.isActive && (
          <button type="button" className="rst-primary-danger" onClick={() => onDeactivate(table)}>Desactivar la mesa</button>
        )}
        <button type="button" className="rst-ghost" onClick={onClose}>Entendido</button>
      </div>
    </FieldBookingDialog>
  );
}

// Flujo original de HU-105 con credenciales de Administrador.
function AdminDeleteForm({ table, onClose, onDeleted, onDeactivate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [result, setResult] = useState({ status: 'idle', message: '', code: '' });
  const sending = useRef(false);
  const busy = result.status === 'loading';

  async function confirm(event) {
    event.preventDefault();
    if (sending.current || result.code === 'TABLE_HAS_HISTORY') return;
    sending.current = true;
    setResult({ status: 'loading', message: '', code: '' });
    const approval = { email: email.trim(), password };
    setPassword('');
    try {
      await deleteRestaurantTable(table.tableId, approval);
      onDeleted(table);
    } catch (error) {
      setResult({ status: 'error', message: error.message, code: error.code });
    } finally {
      approval.password = '';
      sending.current = false;
    }
  }

  return (
    <FieldBookingDialog title="Eliminar mesa permanentemente" kicker="Autorización de Administrador"
      busy={busy} onClose={() => { if (!sending.current) onClose(); }}>
      <p className="rst-confirm-text">¿Desea eliminar permanentemente la mesa {table.tableNumber}?</p>
      <p className="rst-muted">Esta acción no se puede deshacer. Solo se permite si no tiene cuentas, reservas, bloqueos ni otros registros asociados.</p>
      <form onSubmit={confirm} className="rst-admin-form">
        <p className="rst-muted">Un Administrador debe autorizar esta eliminación con sus credenciales.</p>
        <div className="rst-form-field">
          <label htmlFor="admin-email" className="rst-form-label">Correo del Administrador</label>
          <input id="admin-email" className="rst-input" type="email" autoComplete="username" maxLength={150} required
            value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div className="rst-form-field">
          <label htmlFor="admin-password" className="rst-form-label">Contraseña del Administrador</label>
          <input id="admin-password" className="rst-input" type="password" autoComplete="current-password" maxLength={72} required
            value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
        </div>
        {result.status === 'error' && <p role="alert" className="rst-alert-text">{result.message}</p>}
        {result.code === 'TABLE_HAS_HISTORY' && (table.isActive ? (
          <button type="button" className="rst-ghost" onClick={() => onDeactivate(table)}>Solicitar desactivación</button>
        ) : <p className="rst-muted">La mesa ya está inactiva; se conservará su historial.</p>)}
        <div className="rst-dialog-actions">
          <button type="submit" className="rst-primary-danger" disabled={busy || result.code === 'TABLE_HAS_HISTORY'}>
            {busy ? 'Eliminando…' : 'Sí, eliminar permanentemente'}
          </button>
          <button type="button" className="rst-ghost" disabled={busy} onClick={onClose}>No, volver</button>
        </div>
      </form>
    </FieldBookingDialog>
  );
}
