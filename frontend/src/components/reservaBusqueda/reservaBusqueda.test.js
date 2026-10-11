import { describe, expect, it } from 'vitest';
import {
  alternativeDatesLabel, bookingFromUpdate, buildDraft, describeChanges, diffDraft, validateDraft,
} from './searchFormat';
import { statusBadge } from './searchLooks';

const booking = {
  bookingId: 5,
  status: 'active',
  isModifiable: true,
  cabin: { resourceId: 3, name: 'Cabina 1', capacity: 2 },
  guest: {
    customerId: 7, fullName: 'Ana Mora', identificationNumber: '1-1111-1111', phone: '88881111', email: 'ana@example.com',
  },
  partySize: 2,
  companions: 1,
  stay: { checkInDate: '2026-11-10', checkOutDate: '2026-11-13', nights: 3 },
};
const cabins = [
  { resourceId: 3, name: 'Cabina 1', status: 'available', capacity: 2, pricePerNight: 35000 },
  { resourceId: 4, name: 'Cabina 2', status: 'available', capacity: 4, pricePerNight: 55000 },
];
const today = '2026-10-08';

describe('HU-019 formato de la modificación', () => {
  it('buildDraft copia los valores actuales como texto', () => {
    expect(buildDraft(booking)).toEqual({
      resourceId: '3', checkInDate: '2026-11-10', checkOutDate: '2026-11-13', companions: '1',
      guestName: 'Ana Mora', guestPhone: '88881111', guestEmail: 'ana@example.com',
    });
  });

  it('un borrador sin tocar no tiene cambios', () => {
    expect(diffDraft(booking, buildDraft(booking))).toEqual({});
  });

  it('diffDraft manda solo lo que cambió, con su tipo', () => {
    const draft = {
      ...buildDraft(booking), resourceId: '4', checkOutDate: '2026-11-15', companions: '2',
      guestPhone: '  8777   2222 ', guestEmail: 'ANA@example.com',
    };
    expect(diffDraft(booking, draft)).toEqual({
      resourceId: 4, checkOutDate: '2026-11-15', companions: 2, guestPhone: '87772222',
    });
  });

  it('describeChanges nombra las cabinas y da cada cambio legible', () => {
    const draft = { ...buildDraft(booking), resourceId: '4', checkOutDate: '2026-11-15', guestName: 'Ana M. Mora' };
    const rows = describeChanges(booking, draft, cabins);
    expect(rows.map((row) => row.key)).toEqual(['resourceId', 'checkOutDate', 'guestName']);
    expect(rows[0]).toMatchObject({ label: 'Cabina', from: 'Cabina 1', to: 'Cabina 2' });
    expect(rows[2]).toMatchObject({ from: 'Ana Mora', to: 'Ana M. Mora' });
  });

  describe('validateDraft', () => {
    const check = (override, extra = {}) => validateDraft(booking, { ...buildDraft(booking), ...override }, { cabins, today, ...extra });

    it('sin problemas devuelve vacío (aunque la entrada ya haya pasado)', () => {
      expect(check({})).toEqual({});
      const started = { ...booking, stay: { ...booking.stay, checkInDate: '2026-10-01' } };
      expect(validateDraft(started, buildDraft(started), { cabins, today })).toEqual({});
    });

    it.each([
      [{ checkOutDate: '2026-11-10' }, 'checkOutDate', 'posterior a la fecha de entrada'],
      [{ checkInDate: '2026-10-01', checkOutDate: '2026-10-05' }, 'checkInDate', 'anterior a hoy'],
      [{ checkOutDate: '' }, 'checkOutDate', 'obligatoria'],
      [{ companions: '' }, 'companions', 'entre 0 y 50'],
      [{ companions: '3' }, 'companions', 'capacidad para 2 personas y el grupo es de 4'],
      [{ guestName: '  ' }, 'guestName', 'obligatorio'],
      [{ guestName: 'Al' }, 'guestName', 'entre 3 y 150'],
      [{ guestPhone: '123' }, 'guestPhone', '8 dígitos'],
      [{ guestPhone: 'abcdefgh' }, 'guestPhone', '8 dígitos'],
      [{ guestName: 'Ana 123' }, 'guestName', 'sin números'],
      [{ guestName: 'Anastasia' }, 'guestName', 'con apellidos'],
      [{ guestEmail: 'ana@correo' }, 'guestEmail', 'formato válido'],
      [{ guestEmail: 'nope' }, 'guestEmail', 'formato válido'],
    ])('revisa %j', (override, field, text) => {
      expect(check(override)[field]).toContain(text);
    });

    it('al cambiar de cabina revisa la capacidad de la nueva', () => {
      const big = { ...booking, partySize: 4, companions: 3, cabin: { resourceId: 4, name: 'Cabina 2', capacity: 4 } };
      const errors = validateDraft(big, { ...buildDraft(big), resourceId: '3' }, { cabins, today });
      expect(errors.companions).toContain('Cabina 1');
    });
  });

  it('bookingFromUpdate refleja la respuesta de PATCH en la reserva', () => {
    const result = {
      booking: { status: 'active', partySize: 3 },
      cabin: { resourceId: 4, name: 'Cabina 2', capacity: 4 },
      guest: { fullName: 'Ana M. Mora', phone: '88889999', email: 'ana@example.com' },
      stay: { checkInDate: '2026-11-10', checkOutDate: '2026-11-15', nights: 5 },
    };
    const next = bookingFromUpdate(booking, result);
    expect(next.cabin.name).toBe('Cabina 2');
    expect(next.companions).toBe(2);
    expect(next.stay.nights).toBe(5);
    expect(next.guest).toMatchObject({ customerId: 7, identificationNumber: '1-1111-1111', fullName: 'Ana M. Mora' });
    expect(next.bookingId).toBe(5);
  });

  it('bookingFromUpdate actualiza la tarifa total con la que devuelve el guardado', () => {
    const result = {
      booking: { status: 'active', partySize: 2 },
      cabin: { resourceId: 4, name: 'Cabina 2', capacity: 4 },
      guest: {},
      stay: { checkInDate: '2026-11-10', checkOutDate: '2026-11-15', nights: 5 },
      amounts: { totalAmount: 275000, previousTotal: 105000, repriced: true },
    };
    const next = bookingFromUpdate({ ...booking, totalAmount: 105000, isTotalEstimated: true }, result);
    expect(next.totalAmount).toBe(275000);
    expect(next.isTotalEstimated).toBe(false);
    // Sin montos en la respuesta se conserva el que ya tenía.
    const kept = bookingFromUpdate({ ...booking, totalAmount: 105000 }, { ...result, amounts: undefined });
    expect(kept.totalAmount).toBe(105000);
  });

  it('alternativeDatesLabel y statusBadge', () => {
    expect(alternativeDatesLabel({ checkInDate: '2026-11-12', checkOutDate: '2026-11-15' })).toBe('12 – 15 nov');
    expect(statusBadge('checked_in')).toEqual({ label: 'Hospedado', tone: 'success' });
    expect(statusBadge('cancelled').tone).toBe('danger');
    expect(statusBadge('desconocido')).toEqual({ label: 'desconocido', tone: 'neutral' });
  });
});
