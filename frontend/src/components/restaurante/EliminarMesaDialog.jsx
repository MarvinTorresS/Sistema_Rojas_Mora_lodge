import { useRef, useState } from 'react';
import FieldBookingDialog from '../FieldBookingDialog';
import { deleteRestaurantTable } from '../../services/mesasService';

export default function EliminarMesaDialog({ table, onClose, onDeleted, onDeactivate }) {
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
      <form onSubmit={confirm}>
        <p className="rst-muted">Un Administrador debe autorizar esta eliminación con sus credenciales.</p>
        <label>Correo del Administrador
          <input type="email" autoComplete="username" maxLength={150} required value={email}
            disabled={busy} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>Contraseña del Administrador
          <input type="password" autoComplete="current-password" maxLength={72} required value={password}
            disabled={busy} onChange={(event) => setPassword(event.target.value)} />
        </label>
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
