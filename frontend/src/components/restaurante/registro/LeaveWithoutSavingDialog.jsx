import FieldBookingDialog from '../../FieldBookingDialog';
import { LEAVE_CONFIRM_MESSAGE } from '../../../utils/restauranteFormulario';

/**
 * CA-4 de HU-102 y HU-113: "¿Desea salir sin guardar los cambios?" con
 * opciones Si / No. Reutiliza el dialogo modal del proyecto (foco atrapado,
 * Escape para cerrar) en vez de crear otro.
 */
export default function LeaveWithoutSavingDialog({ onConfirm, onCancel, detail }) {
  return (
    <FieldBookingDialog title="Cancelar registro" kicker="Confirmación" onClose={onCancel}>
      <p className="rst-confirm-text">{LEAVE_CONFIRM_MESSAGE}</p>
      {detail && <p className="rst-muted">{detail}</p>}
      <div className="rst-dialog-actions">
        <button type="button" className="rst-primary-danger" onClick={onConfirm}>Sí, salir sin guardar</button>
        <button type="button" className="rst-ghost" onClick={onCancel}>No, seguir editando</button>
      </div>
    </FieldBookingDialog>
  );
}
