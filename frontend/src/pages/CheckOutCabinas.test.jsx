// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CheckOutCabinas from './CheckOutCabinas';
import { searchCabinBookings } from '../services/reservasCabinaService';
import { checkOutCabin } from '../services/cabinCheckOutService';
vi.mock('../services/reservasCabinaService', () => ({ searchCabinBookings: vi.fn() }));
vi.mock('../services/cabinCheckOutService', () => ({ checkOutCabin: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const booking = { bookingId: 5, status: 'checked_in', guest: { fullName: 'Wagner Prueba' }, cabin: { name: 'Cabina 1' }, stay: { checkInDate: '2026-10-12', checkOutDate: '2026-10-13' } };
async function prepare() {
  searchCabinBookings.mockResolvedValue({ data: [booking], meta: { page: 1, totalPages: 1 } });
  render(<MemoryRouter><CheckOutCabinas /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Nombre o identificación del huésped'), { target: { value: 'Wagner' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar check-out' }));
}
it('solicita confirmacion y luego finaliza con el boton deshabilitado', async () => {
  checkOutCabin.mockResolvedValue({ status: 'completed' });
  await prepare();
  expect(checkOutCabin).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar salida' }));
  expect(await screen.findByRole('status')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Salida registrada' }).disabled).toBe(true);
});
it('bloquea por consumos y ofrece ir a facturacion sin finalizar', async () => {
  checkOutCabin.mockRejectedValue(Object.assign(new Error('Existen consumos pendientes de facturar'), { code: 'UNVERIFIED_RESTAURANT_BILLING' }));
  await prepare();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar salida' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ir a facturación' }).getAttribute('href')).toBe('/facturacion');
  expect(screen.getByText('En curso')).toBeTruthy();
});
it('cancelar la confirmacion no registra una salida', async () => {
  await prepare();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(checkOutCabin).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Confirmar salida' })).toBeNull();
});
