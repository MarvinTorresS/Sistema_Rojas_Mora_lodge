// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CheckInCabinas from './CheckInCabinas';
import { searchCabinBookings } from '../services/reservasCabinaService';
import { checkInCabin, getEarlyCheckInQuote } from '../services/cabinCheckInService';

vi.mock('../services/reservasCabinaService', () => ({ searchCabinBookings: vi.fn() }));
vi.mock('../services/cabinCheckInService', () => ({ checkInCabin: vi.fn(), getEarlyCheckInQuote: vi.fn() }));
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

it('muestra el recargo y permite cancelar sin autorizar ni enviar credenciales', async () => {
  const future = { ...booking, stay: { checkInDate: '2099-10-12', checkOutDate: '2099-10-14' } };
  searchCabinBookings.mockResolvedValue({ data: [future], meta: { page: 1, totalPages: 1 } });
  getEarlyCheckInQuote.mockResolvedValue({ checkInDate: '2026-10-26', checkOutDate: '2099-10-14', additionalNights: 2, additionalAmount: 70000, totalAmount: 130000 });
  await search();
  fireEvent.click(screen.getByRole('button', { name: 'Autorizar ingreso anticipado' }));
  expect(await screen.findByText(/Noches adicionales: 2/)).toBeTruthy();
  expect(screen.getByLabelText('Contraseña del administrador').type).toBe('password');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar autorización' }));
  expect(screen.queryByLabelText('Contraseña del administrador')).toBeNull();
  expect(checkInCabin).not.toHaveBeenCalled();
});

it('envia la opcion sin recargo solo al confirmar con motivo y credenciales', async () => {
  searchCabinBookings.mockResolvedValue({ data: [{ ...booking, stay: { checkInDate: '2099-10-12', checkOutDate: '2099-10-14' } }], meta: { page: 1, totalPages: 1 } });
  getEarlyCheckInQuote.mockResolvedValue({ checkInDate: '2026-10-26', checkOutDate: '2099-10-14', additionalNights: 2, additionalAmount: 70000, previousTotal: 60000, totalAmount: 130000 });
  checkInCabin.mockResolvedValue({ status: 'checked_in' });
  await search();
  fireEvent.click(screen.getByRole('button', { name: 'Autorizar ingreso anticipado' }));
  const email = await screen.findByLabelText('Correo del administrador');
  fireEvent.change(email, { target: { value: 'admin@example.com' } });
  fireEvent.change(screen.getByLabelText('Contraseña del administrador'), { target: { value: 'test-only' } });
  fireEvent.change(screen.getByLabelText('Motivo de autorización'), { target: { value: 'Exoneracion autorizada para prueba' } });
  fireEvent.change(screen.getByLabelText('Cobro de noches adicionales'), { target: { value: 'waive' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Autorizar y registrar ingreso' }).closest('form'));
  await screen.findByRole('status');
  expect(checkInCabin).toHaveBeenCalledWith(5, expect.objectContaining({ feeMode: 'waive', expectedAdditionalAmount: 0, reason: 'Exoneracion autorizada para prueba' }));
  expect(screen.queryByLabelText('Contraseña del administrador')).toBeNull();
});
