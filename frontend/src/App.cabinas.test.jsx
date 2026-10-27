// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./services/reservasCabinaService', () => ({
  getCabinAvailability: vi.fn(async () => ({ data: { cabins: [], policy: { checkInTime: '15:00', checkOutTime: '11:00' } } })),
  createCabinBooking: vi.fn(), searchCabinBookings: vi.fn(),
  listCabinBookings: vi.fn(async () => ({ data: [], meta: { page: 1, totalPages: 0, total: 0 } })),
  listCabinRates: vi.fn(async () => []), updateCabinRate: vi.fn(), updateCabinBooking: vi.fn(), cancelCabinBooking: vi.fn(),
}));
afterEach(cleanup);

it('conserva registro, listado, búsqueda y tarifas al añadir ingreso y salida con el router real', async () => {
  window.history.replaceState({}, '', '/cabinas');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Reserva de cabina' })).toBeTruthy();
  const assertExistingAccess = () => {
    expect(screen.getByRole('link', { name: 'Ver reservas' }).getAttribute('href')).toBe('/cabinas/reservas');
    expect(screen.getByRole('link', { name: 'Buscar reserva' }).getAttribute('href')).toBe('/cabinas/buscar');
    expect(screen.getByRole('link', { name: 'Tarifas' }).getAttribute('href')).toBe('/cabinas/tarifas');
  };
  assertExistingAccess();
  for (const [link, path, heading, back] of [
    ['Ver reservas', '/cabinas/reservas', 'Reservas de cabinas', 'Volver a reservas de cabina'],
    ['Buscar reserva', '/cabinas/buscar', 'Buscar reserva', 'Volver a reservas de cabina'],
    ['Tarifas', '/cabinas/tarifas', 'Tarifas de cabinas', 'Volver a reserva de cabina'],
  ]) {
    fireEvent.click(screen.getByRole('link', { name: link }));
    expect(window.location.pathname).toBe(path);
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: back }));
    expect(await screen.findByRole('heading', { name: 'Reserva de cabina' })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole('link', { name: 'Check-in' }));
  expect(window.location.pathname).toBe('/cabinas/check-in');
  expect(await screen.findByRole('heading', { name: 'Ingreso de huéspedes' })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Volver a cabinas' }));
  assertExistingAccess();
  fireEvent.click(screen.getByRole('link', { name: 'Check-out' }));
  expect(window.location.pathname).toBe('/cabinas/check-out');
  expect(await screen.findByRole('heading', { name: 'Salida de huéspedes' })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Volver a cabinas' }));
  expect(await screen.findByRole('heading', { name: 'Reserva de cabina' })).toBeTruthy();
  assertExistingAccess();
});
