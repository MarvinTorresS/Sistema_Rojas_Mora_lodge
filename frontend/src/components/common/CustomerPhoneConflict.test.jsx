// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import CustomerPhoneConflict from './CustomerPhoneConflict';
import ReservasSalon from '../../pages/ReservasSalon';
import ReservasCancha from '../../pages/ReservasCancha';
import {
  checkHallAvailability, createHallBooking, getHallSchedule, listHallBookings,
} from '../../services/reservasSalonService';
import {
  createFieldBooking, listFieldBookings, searchFieldBookings, filterFieldBookingsByStatus,
} from '../../services/reservasCanchaService';

// Bug corregido el 26/10/2026: si el teléfono ya era de otra persona, la
// reserva quedaba a nombre de esa persona sin avisar. Ahora el backend
// responde CUSTOMER_PHONE_CONFLICT y la pantalla solo avisa que el teléfono
// no coincide: no muestra el nombre del otro cliente ni permite usarlo
// (evita robo de identidad).

vi.mock('../../services/reservasSalonService', () => ({
  listHallBookings: vi.fn(), getHallBooking: vi.fn(), updateHallBooking: vi.fn(), cancelHallBooking: vi.fn(),
  checkHallAvailability: vi.fn(), createHallBooking: vi.fn(), getHallSchedule: vi.fn(),
}));
vi.mock('../../services/reservasCanchaService', () => ({
  createFieldBooking: vi.fn(), listFieldBookings: vi.fn(), searchFieldBookings: vi.fn(),
  filterFieldBookingsByStatus: vi.fn(), updateFieldBooking: vi.fn(), cancelFieldBooking: vi.fn(),
}));

// Error tal como lo arman los services del frontend a partir del 409.
function phoneConflictError() {
  const error = new Error('El teléfono no coincide con el nombre del cliente. Revisá los datos e intentá de nuevo.');
  error.status = 409;
  error.code = 'CUSTOMER_PHONE_CONFLICT';
  return error;
}

afterEach(cleanup);

describe('CustomerPhoneConflict (componente)', () => {
  it('no pinta nada si no hay conflicto', () => {
    const { container } = render(<CustomerPhoneConflict conflict={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('solo avisa que el teléfono no coincide: sin nombres y sin botones', () => {
    render(<CustomerPhoneConflict conflict={{ message: 'x', existingCustomers: [{ customerId: 4, fullName: 'Juan Pérez Mora' }] }} />);
    const text = screen.getByRole('alert').textContent;
    expect(text).toContain('El teléfono no coincide.');
    expect(text).not.toContain('Juan');
    expect(text).not.toContain('Pérez');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('Salón (HU-013): teléfono ya registrado con otro nombre', () => {
  const created = (bookingId) => ({
    booking: { bookingId }, date: '2026-11-20', checkInTime: '15:00', checkOutTime: '20:00',
  });

  beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    vi.resetAllMocks();
    listHallBookings.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 0 } });
    getHallSchedule.mockResolvedValue({ checkInTime: '15:00', checkOutTime: '20:00' });
    checkHallAvailability.mockResolvedValue({ available: true, reason: null, checkInTime: '15:00', checkOutTime: '20:00' });
  });

  async function fillAndSubmit() {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar disponibilidad' }));
    await screen.findByText('El salon esta disponible ese dia.');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con la reserva' }));
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Pedro Soto Vargas' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-7777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reserva' }));
  }

  it('muestra solo el aviso "El teléfono no coincide", sin error ni opciones, y no registra la reserva', async () => {
    createHallBooking.mockRejectedValueOnce(phoneConflictError());
    await fillAndSubmit();
    expect(await screen.findByText('El teléfono no coincide.')).toBeTruthy();
    expect(screen.queryByText(/Reserva confirmada/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Usar al cliente|Es otra persona/ })).toBeNull();
    expect(createHallBooking).toHaveBeenCalledTimes(1);
    expect(createHallBooking.mock.calls[0][0]).not.toHaveProperty('linkCustomerId');
    expect(createHallBooking.mock.calls[0][0]).not.toHaveProperty('confirmNewCustomer');
  });

  it('cambiar el teléfono quita el aviso (hay que volver a revisar)', async () => {
    createHallBooking.mockRejectedValueOnce(phoneConflictError());
    await fillAndSubmit();
    await screen.findByText('El teléfono no coincide.');
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '88886666' } });
    expect(screen.queryByText('El teléfono no coincide.')).toBeNull();
  });
});

describe('Cancha (HU-001): teléfono ya registrado con otro nombre', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const emptyPage = { data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
    listFieldBookings.mockResolvedValue(emptyPage);
    searchFieldBookings.mockResolvedValue(emptyPage);
    filterFieldBookingsByStatus.mockResolvedValue(emptyPage);
  });

  it('solo avisa que el teléfono no coincide, sin revelar el nombre ni dejar usar al cliente', async () => {
    createFieldBooking.mockRejectedValueOnce(phoneConflictError());
    render(<MemoryRouter><ReservasCancha /></MemoryRouter>);

    // Mañana, para que ningún horario esté en el pasado.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isoTomorrow = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: isoTomorrow } });
    const freeSlot = await screen.findByRole('button', { name: /3:00.*4:00.*Reservar$/ });
    await waitFor(() => expect(freeSlot.disabled).toBe(false));
    fireEvent.click(freeSlot);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con la reserva' }));
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Pedro Soto Vargas' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-7777' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar reserva' }).find((button) => button.type === 'submit'));

    expect(await screen.findByText('El teléfono no coincide.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Usar al cliente|Es otra persona/ })).toBeNull();
    expect(screen.queryByText(/Reserva registrada/)).toBeNull();
    expect(createFieldBooking).toHaveBeenCalledTimes(1);
    expect(createFieldBooking.mock.calls[0][0]).not.toHaveProperty('linkCustomerId');
    expect(createFieldBooking.mock.calls[0][0]).not.toHaveProperty('confirmNewCustomer');
    // Al corregir el teléfono desaparece el aviso.
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-6666' } });
    expect(screen.queryByText('El teléfono no coincide.')).toBeNull();
  });
});
