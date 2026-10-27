// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CustomerPhoneConflict from './CustomerPhoneConflict';
import ReservasSalon from '../../pages/ReservasSalon';
import ReservasCancha from '../../pages/ReservasCancha';
import { checkHallAvailability, createHallBooking, listHallBookings } from '../../services/reservasSalonService';
import { listEventHallPlans } from '../../services/planesSalonService';
import {
  createFieldBooking, listFieldBookings, searchFieldBookings, filterFieldBookingsByStatus,
} from '../../services/reservasCanchaService';

// Bug corregido el 26/10/2026: si el teléfono ya era de otra persona, la
// reserva quedaba a nombre de esa persona sin avisar. Ahora el backend
// responde CUSTOMER_PHONE_CONFLICT y la pantalla pregunta.

vi.mock('../../services/reservasSalonService', () => ({
  listHallBookings: vi.fn(), getHallBooking: vi.fn(), updateHallBooking: vi.fn(), cancelHallBooking: vi.fn(),
  checkHallAvailability: vi.fn(), createHallBooking: vi.fn(),
}));
vi.mock('../../services/planesSalonService', () => ({ listEventHallPlans: vi.fn() }));
vi.mock('../../services/reservasCanchaService', () => ({
  createFieldBooking: vi.fn(), listFieldBookings: vi.fn(), searchFieldBookings: vi.fn(),
  filterFieldBookingsByStatus: vi.fn(), updateFieldBooking: vi.fn(), cancelFieldBooking: vi.fn(),
}));

// Error tal como lo arman los services del frontend a partir del 409.
function phoneConflictError(existingCustomers = [{ customerId: 4, fullName: 'Juan Pérez Mora' }]) {
  const error = new Error('Este teléfono ya está registrado a nombre de Juan Pérez Mora.');
  error.status = 409;
  error.code = 'CUSTOMER_PHONE_CONFLICT';
  error.details = { phone: '88887777', existingCustomers };
  return error;
}

afterEach(cleanup);

describe('CustomerPhoneConflict (componente)', () => {
  const conflict = {
    typedName: 'Pedro Soto Vargas',
    existingCustomers: [{ customerId: 4, fullName: 'Juan Pérez Mora' }, { customerId: 9, fullName: 'Ana Pérez Mora' }],
  };

  it('no pinta nada si no hay conflicto', () => {
    const { container } = render(<CustomerPhoneConflict conflict={null} onUseExisting={vi.fn()} onRegisterNew={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('ofrece usar cada cliente existente o registrar el nombre escrito', () => {
    const onUseExisting = vi.fn();
    const onRegisterNew = vi.fn();
    render(<CustomerPhoneConflict conflict={conflict} onUseExisting={onUseExisting} onRegisterNew={onRegisterNew} />);
    fireEvent.click(screen.getByRole('button', { name: 'Usar a Ana Pérez Mora' }));
    expect(onUseExisting).toHaveBeenCalledWith({ customerId: 9, fullName: 'Ana Pérez Mora' });
    fireEvent.click(screen.getByRole('button', { name: 'Es otra persona: registrar a Pedro Soto Vargas' }));
    expect(onRegisterNew).toHaveBeenCalledOnce();
  });

  it('los botones no envían el formulario que lo contiene (type="button")', () => {
    render(<CustomerPhoneConflict conflict={conflict} onUseExisting={vi.fn()} onRegisterNew={vi.fn()} />);
    screen.getAllByRole('button').forEach((button) => expect(button.getAttribute('type')).toBe('button'));
  });
});

describe('Salón (HU-013): teléfono ya registrado con otro nombre', () => {
  const plan = {
    planId: 9, resourceId: 2, planName: 'Plan Común', hours: 4, price: 50000, includedServices: [], depositPercentage: null, extraHourPrice: 8000,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    listHallBookings.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 0 } });
    listEventHallPlans.mockResolvedValue({ data: [plan], meta: { total: 1 } });
    checkHallAvailability.mockResolvedValue({ available: true, reason: null });
  });

  async function fillAndSubmit() {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Seleccionar plan|^Plan /, expanded: false }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Planes disponibles' })).getByRole('button', { name: /Plan Común/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    await screen.findByText('El salon esta disponible en ese horario.');
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Pedro Soto Vargas' } });
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: '8888-7777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
  }

  it('muestra el aviso en vez de un error y, al elegir al cliente existente, reenvía con linkCustomerId', async () => {
    createHallBooking
      .mockRejectedValueOnce(phoneConflictError())
      .mockResolvedValueOnce({
        booking: { bookingId: 31 }, plan, extraHours: 0, extraHoursCost: 0, totalPrice: 50000, depositPercentage: 0.3, depositAmount: 15000,
      });
    await fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: 'Usar a Juan Pérez Mora' }));
    expect(await screen.findByText('Reserva confirmada')).toBeTruthy();
    expect(createHallBooking).toHaveBeenLastCalledWith(expect.objectContaining({
      customerName: 'Pedro Soto Vargas', customerPhone: '88887777', linkCustomerId: 4,
    }));
  });

  it('"es otra persona" reenvía con confirmNewCustomer', async () => {
    createHallBooking.mockRejectedValueOnce(phoneConflictError()).mockResolvedValueOnce({
      booking: { bookingId: 32 }, plan, extraHours: 0, extraHoursCost: 0, totalPrice: 50000, depositPercentage: 0.3, depositAmount: 15000,
    });
    await fillAndSubmit();
    fireEvent.click(await screen.findByRole('button', { name: 'Es otra persona: registrar a Pedro Soto Vargas' }));
    expect(await screen.findByText('Reserva confirmada')).toBeTruthy();
    expect(createHallBooking).toHaveBeenLastCalledWith(expect.objectContaining({ confirmNewCustomer: true }));
  });

  it('cambiar el teléfono quita el aviso (hay que volver a revisar)', async () => {
    createHallBooking.mockRejectedValueOnce(phoneConflictError());
    await fillAndSubmit();
    await screen.findByRole('button', { name: 'Usar a Juan Pérez Mora' });
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: '88886666' } });
    expect(screen.queryByRole('button', { name: 'Usar a Juan Pérez Mora' })).toBeNull();
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

  it('pregunta y, al elegir al cliente existente, confirma a nombre de quién quedó la reserva', async () => {
    createFieldBooking.mockRejectedValueOnce(phoneConflictError()).mockResolvedValueOnce({ bookingId: 70 });
    render(<MemoryRouter><ReservasCancha /></MemoryRouter>);

    // Mañana, para que ningún horario esté en el pasado.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isoTomorrow = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: isoTomorrow } });
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Pedro Soto Vargas' } });
    fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '8888-7777' } });
    const freeSlot = (await screen.findAllByRole('button', { name: /Reservar$/ })).find((button) => !button.disabled);
    fireEvent.click(freeSlot);
    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar reserva' }).find((button) => button.type === 'submit'));

    fireEvent.click(await screen.findByRole('button', { name: 'Usar a Juan Pérez Mora' }));
    expect(await screen.findByText('Reserva registrada a nombre de Juan Pérez Mora.')).toBeTruthy();
    expect(createFieldBooking).toHaveBeenCalledTimes(2);
    expect(createFieldBooking.mock.calls[0][0]).not.toHaveProperty('linkCustomerId');
    expect(createFieldBooking.mock.calls[1][0]).toMatchObject({ customerName: 'Pedro Soto Vargas', linkCustomerId: 4 });
    expect(createFieldBooking.mock.calls[1][0]).not.toHaveProperty('customerLabel');
  });
});
