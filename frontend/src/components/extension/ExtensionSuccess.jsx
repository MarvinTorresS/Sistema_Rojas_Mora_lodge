import { Check } from 'lucide-react';
import useEnterTransition from '../../hooks/useEnterTransition';
import { formatColones, formatShortDate } from '../cabinas/cabinFormat';
import { CHECK_OUT_TIME, MESSAGES } from './extensionConfig';

/**
 * CA-1: confirmación de la extensión. Aparece dentro de la misma ficha
 * (sin saltar de pantalla) con la nueva salida y los montos resultantes.
 */
function ExtensionSuccess({ result, onDone }) {
  const entered = useEnterTransition();
  return (
    <div className="p-5">
      <div
        role="status"
        className={`flex flex-col items-center gap-2 rounded-2xl border border-primary-400 bg-primary-50 px-5 py-7 text-center text-primary-900 transition-all duration-500 ease-out ${
          entered ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-700 text-white">
          <Check size={22} strokeWidth={3} aria-hidden="true" />
        </span>
        <p className="text-[17px] font-bold">{MESSAGES.SUCCESS}</p>
        <p className="text-[13px] text-primary-800">
          {result.cabin.name} · {result.guest.fullName} · nueva salida {formatShortDate(result.stay.newCheckOutDate)}, {CHECK_OUT_TIME}
        </p>
        <p className="text-[13px] text-primary-800">
          Nuevo total {formatColones(result.amounts.newTotal)} · saldo pendiente {formatColones(result.amounts.pendingBalance)}
        </p>
        <button
          type="button" onClick={onDone}
          className="mt-2 min-h-[44px] rounded-[10px] border border-primary-700 bg-white px-[18px] text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-50"
        >
          Extender otra estadía
        </button>
      </div>
    </div>
  );
}

export default ExtensionSuccess;
