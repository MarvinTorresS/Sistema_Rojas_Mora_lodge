import { Phone } from 'lucide-react';

/**
 * Aviso que aparece cuando el teléfono escrito ya está registrado con OTRO
 * nombre. Solo informa que el teléfono no coincide: NO muestra el nombre del
 * cliente ligado al número y NO permite usar ni ligar a ese cliente (evita
 * robo de identidad). Para continuar hay que corregir el nombre o el
 * teléfono; el aviso desaparece apenas se edita alguno de los dos
 * (ver useCustomerPhoneConflict).
 *
 * Lo usan ReservasCancha y ReservasSalon, así que se ve igual en las dos.
 */
function CustomerPhoneConflict({ conflict }) {
  if (!conflict) return null;

  return (
    <div role="alert" className="rounded-xl border border-amber-400 bg-amber-50 px-3.5 py-3 text-amber-600">
      <p className="flex items-start gap-2 text-[13px] font-semibold">
        <Phone size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        El teléfono no coincide.
      </p>
      <p className="mt-1 text-xs">Revisá el nombre y el número del cliente e intentá de nuevo.</p>
    </div>
  );
}

export default CustomerPhoneConflict;
