import { formatColones } from '../cabinas/cabinFormat';
import { nightsLabel, getRateNoteKind } from './extensionFormat';
import Notice from '../common/Notice.jsx';

// Textos de la aclaración de tarifa. Tono INFORMATIVO a propósito: la
// extensión no sube el precio de lo que el huésped ya pagó, así que la
// pantalla no debe sonar a "alerta de aumento".
const RATE_NOTES = {
  same: 'Las noches nuevas se cobran con la tarifa actual de la cabina; lo ya registrado no cambia.',
  differs: 'Esta reserva tiene noches registradas a una tarifa distinta de la actual. Esas noches conservan su precio; solo las noches nuevas se cobran con la tarifa actual.',
  estimated: 'Esta reserva no tiene un monto registrado, por eso el total anterior se estimó con la tarifa actual.',
};

function Row({ label, detail, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col">
        <span className="text-ink">{label}</span>
        {detail && <span className="text-xs text-muted">{detail}</span>}
      </div>
      <span className="shrink-0 font-medium text-ink">{value}</span>
    </div>
  );
}

/**
 * Recibo de la extensión. Separa en DOS líneas lo que ya estaba
 * registrado (sin cambios) y lo nuevo (tarifa actual), para que el
 * recepcionista pueda explicárselo al huésped con claridad.
 *
 * `dimmed` atenúa el recibo mientras se recalcula tras cambiar las noches,
 * así no parpadea ni se confunde con un valor ya vigente.
 */
function ExtensionReceipt({ quote, originalNights, dimmed }) {
  const { amounts, stay } = quote;

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-busy={dimmed}
        className={`flex flex-col gap-2.5 rounded-[14px] border border-dashed border-faint bg-surface p-4 text-[13.5px] transition-opacity duration-200 ${dimmed ? 'opacity-60' : 'opacity-100'}`}
      >
        <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Resumen de cobro</h4>
        <Row
          label="Estadía ya registrada"
          detail={`${nightsLabel(originalNights)} · sin cambios`}
          value={formatColones(amounts.previousTotal)}
        />
        <Row
          label="Noches nuevas"
          detail={`${nightsLabel(stay.extraNights)} × ${formatColones(amounts.nightlyRate)} · tarifa actual`}
          value={`+ ${formatColones(amounts.extensionAmount)}`}
        />
        <div className="h-px bg-line" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-bold">Nuevo total</span>
          <span className="font-display text-2xl font-bold text-primary-900">{formatColones(amounts.newTotal)}</span>
        </div>
        <div className="flex justify-between gap-3 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-600">
          <span className="font-semibold">Saldo pendiente</span>
          <span className="font-bold">{formatColones(amounts.pendingBalance)}</span>
        </div>
      </div>

      <Notice tone="info">{RATE_NOTES[getRateNoteKind(amounts, originalNights)]}</Notice>
    </div>
  );
}

export default ExtensionReceipt;
