import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function FieldBookingDialog({ children, busy, onClose, title = 'Nueva reserva', kicker = 'Un último paso' }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    const node = dialog.current;
    node.showModal();
    document.body.style.overflow = 'hidden';
    node.querySelector('input, textarea')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      node.close();
      previous?.focus();
    };
  }, []);

  return <dialog ref={dialog} className="bmb-booking-dialog" aria-labelledby="field-booking-title"
    aria-modal="true" aria-busy={busy}
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="bmb-dialog-heading">
      <div><p className="bmb-kicker">{kicker}</p><h2 id="field-booking-title">{title}</h2></div>
      <button type="button" className="bmb-dialog-close" aria-label={`Cerrar ${title.toLowerCase()}`} disabled={busy} onClick={onClose}><X size={20} /></button>
    </div>
    {children}
  </dialog>;
}
