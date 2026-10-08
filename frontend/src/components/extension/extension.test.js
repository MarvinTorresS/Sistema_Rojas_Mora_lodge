import { describe, expect, it } from 'vitest';
import { getRateNoteKind, guestInitials, nightsLabel } from './extensionFormat';
import { listBadge } from './extensionLooks';

// Pruebas de las piezas puras de la pantalla de extensión (HU-127): sin
// React, sin red, sin fechas del reloj (siempre se pasa "hoy" a mano).

describe('getRateNoteKind (aclaración de tarifa, CA-3)', () => {
  const amounts = { previousTotal: 150000, nightlyRate: 50000, previousTotalIsEstimated: false };

  it('"same" cuando lo registrado coincide con la tarifa actual', () => {
    expect(getRateNoteKind(amounts, 3)).toBe('same');
  });

  it('"differs" cuando la tarifa cambió desde que se reservó', () => {
    expect(getRateNoteKind({ ...amounts, nightlyRate: 55000 }, 3)).toBe('differs');
  });

  it('"estimated" cuando la reserva no tiene monto registrado', () => {
    expect(getRateNoteKind({ ...amounts, previousTotalIsEstimated: true }, 3)).toBe('estimated');
  });

  it('no divide entre cero si la estadía tuviera 0 noches', () => {
    expect(getRateNoteKind(amounts, 0)).toBe('same');
  });
});

describe('listBadge (urgencia de la reserva en la lista)', () => {
  const today = '2026-10-08';
  const booking = (status, checkInDate, checkOutDate) => ({ status, stay: { checkInDate, checkOutDate } });

  it('avisa a quien se va hoy o mañana', () => {
    expect(listBadge(booking('checked_in', '2026-10-06', '2026-10-08'), today).label).toBe('Sale hoy');
    expect(listBadge(booking('checked_in', '2026-10-06', '2026-10-09'), today).label).toBe('Sale mañana');
  });

  it('un huésped con ingreso y salida lejana figura como hospedado', () => {
    expect(listBadge(booking('checked_in', '2026-10-06', '2026-10-12'), today)).toEqual({ label: 'Hospedado', tone: 'success' });
  });

  it('distingue las reservas que aún no ingresan', () => {
    expect(listBadge(booking('active', '2026-10-11', '2026-10-13'), today).label).toBe('Próxima');
    expect(listBadge(booking('active', '2026-10-08', '2026-10-12'), today).label).toBe('Entra hoy');
    expect(listBadge(booking('active', '2026-10-06', '2026-10-12'), today).label).toBe('Por ingresar');
  });

  it('las finalizadas son neutrales', () => {
    expect(listBadge(booking('completed', '2026-10-01', '2026-10-05'), today)).toEqual({ label: 'Finalizada', tone: 'neutral' });
  });
});

describe('textos auxiliares', () => {
  it('guestInitials toma las dos primeras palabras', () => {
    expect(guestInitials('Laura Méndez Solís')).toBe('LM');
    expect(guestInitials('Madonna')).toBe('M');
  });

  it('nightsLabel respeta el singular', () => {
    expect(nightsLabel(1)).toBe('1 noche');
    expect(nightsLabel(3)).toBe('3 noches');
  });
});
