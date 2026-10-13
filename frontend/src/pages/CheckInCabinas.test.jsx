// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CheckInCabinas from './CheckInCabinas';
import { searchCabinBookings } from '../services/reservasCabinaService';
import { checkInCabin } from '../services/cabinCheckInService';

vi.mock('../services/reservasCabinaService', () => ({ searchCabinBookings: vi.fn() }));
vi.mock('../services/cabinCheckInService', () => ({ checkInCabin: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const booking = { bookingId: 5, status: 'active', guest: { fullName: 'Wagner' }, cabin: { name: 'Cabina 1' }, stay: { checkInDate: '2026-10-12', checkOutDate: '2026-10-14' } };
async function search() {
  render(<MemoryRouter><CheckInCabinas /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Nombre o identificación del huésped'), { target: { value: 'Wagner' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  return screen.findByRole('button', { name: 'Registrar check-in' });
}
it('registra el ingreso y deshabilita el boton para evitar repetirlo', async () => {
  searchCabinBookings.mockResolvedValue({ data: [booking], meta: { page: 1, totalPages: 1 } });
  checkInCabin.mockResolvedValue({ status: 'checked_in' });
  fireEvent.click(await search());
  expect(await screen.findByRole('status')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ingreso registrado' }).disabled).toBe(true);
  expect(checkInCabin).toHaveBeenCalledWith(5);
});
it('muestra el error de ingreso anticipado y conserva la reserva activa', async () => {
  searchCabinBookings.mockResolvedValue({ data: [booking], meta: { page: 1, totalPages: 1 } });
  checkInCabin.mockRejectedValue(new Error('No es posible realizar el check-in antes de la fecha de entrada'));
  fireEvent.click(await search());
  expect(within(await screen.findByRole('alert')).getByText(/antes de la fecha/)).toBeTruthy();
  expect(screen.getByText('Activa')).toBeTruthy();
});
