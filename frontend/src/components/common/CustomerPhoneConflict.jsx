import { Phone, UserCheck, UserPlus } from 'lucide-react';

/**
 * Aviso que aparece cuando el teléfono escrito ya está registrado a nombre
 * de otra persona. Antes el sistema usaba a ese cliente en silencio y la
 * reserva quedaba con otro nombre; ahora el recepcionista decide:
 *
 *   - "Usar a <cliente>": la reserva es de ese cliente (`linkCustomerId`).
 *   - "Registrar a <nombre escrito>": es otra persona que comparte el
 *     número (`confirmNewCustomer`).
 *
 * El componente solo PINTA y avisa la elección; no llama al backend. Quien
 * lo usa (ReservasCancha / ReservasSalon) reenvía la reserva con la
 * respuesta. Así sirve igual en las dos pantallas.
 *
 * Los botones son type="button" a propósito: el aviso vive dentro del
 * <form> de la reserva y un botón sin type lo enviaría sin la elección.
 */
function CustomerPhoneConflict({ conflict, onUseExisting, onRegisterNew, disabled = false }) {
  if (!conflict) return null;
  const { existingCustomers, typedName } = conflict;

  return (
    <div role="alert" className="rounded-xl border border-amber-400 bg-amber-50 px-3.5 py-3 text-amber-600">
      <p className="flex items-start gap-2 text-[13px] font-semibold">
        <Phone size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        Este teléfono ya está registrado a nombre de otra persona.
      </p>
      <p className="mt-1 text-xs">¿La reserva es para ese cliente o para alguien más con el mismo número?</p>

      <div className="mt-3 flex flex-col gap-2">
        {existingCustomers.map((customer) => (
          <button
            key={customer.customerId}
            type="button"
            disabled={disabled}
            onClick={() => onUseExisting(customer)}
            className="flex items-center gap-2 rounded-lg border border-amber-400 bg-white px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-amber-50 disabled:opacity-60"
          >
            <UserCheck size={14} className="shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              Usar a <strong>{customer.fullName}</strong>
            </span>
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={onRegisterNew}
          className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-surface-alt disabled:opacity-60"
        >
          <UserPlus size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <span>
            Es otra persona: registrar a <strong>{typedName}</strong>
          </span>
        </button>
      </div>
    </div>
  );
}

export default CustomerPhoneConflict;
