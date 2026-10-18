import { useEffect, useRef } from 'react';

// Confirmación previa, distinta del recibo posterior a crear una reserva.
export default function CancelBookingDialog({ booking, busy, error, onClose, onConfirm }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { previous?.focus(); };
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby="cancel-booking-title" aria-describedby="cancel-booking-description"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 text-ink shadow-2xl backdrop:bg-primary-900/40">
      <h2 id="cancel-booking-title" className="font-display text-xl font-semibold text-primary-900">Confirmar cancelación</h2>
      <p id="cancel-booking-description" className="my-4 text-sm">
        Se cancelará el hospedaje de {booking.guest.fullName}, reserva #{booking.bookingId}, {booking.cabin.name}.
        {' '}Entrada: {booking.stay.checkInDate}. Salida: {booking.stay.checkOutDate}.
      </p>
      {error && <p role="alert" className="mb-4 text-sm text-coral-600">{error}</p>}
      <div className="flex justify-end gap-3" aria-busy={busy}>
        <button type="button" autoFocus disabled={busy} onClick={onClose}
          className="rounded-lg border border-line px-4 py-3 disabled:opacity-50">Volver</button>
        <button type="button" disabled={busy} onClick={onConfirm}
          className="rounded-lg bg-coral-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? 'Cancelando…' : 'Confirmar cancelación'}
        </button>
      </div>
    </dialog>
  );
}
