// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ListadoReservasCancha from './ListadoReservasCancha';
import { listFieldBookings } from '../services/reservasCanchaService';

vi.mock('../services/reservasCanchaService', () => ({ listFieldBookings: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const booking = (id) => ({ bookingId: id, customer: { fullName: `Cliente ${id}`, phone: '88881111' }, startDatetime: '2026-10-22T19:00:00Z', endDatetime: '2026-10-22T21:00:00Z', status: 'active' });

it('muestra 20 filas con sus datos y permite recorrer la segunda página', async () => {
  listFieldBookings.mockImplementation(({ page }) => Promise.resolve({ data: page === 1 ? Array.from({ length: 20 }, (_, i) => booking(i + 1)) : [booking(21)], meta: { page, pageSize: 20, total: 21, totalPages: 2 } }));
  render(<ListadoReservasCancha />);
  await screen.findByText('Cliente 1');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(21);
  expect(screen.getAllByText('88881111')).toHaveLength(20);
  expect(screen.getAllByText('Activa')).toHaveLength(20);
  expect(screen.getByRole('button', { name: 'Anterior' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  await screen.findByText('Cliente 21');
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  expect(listFieldBookings).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, dateFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), dateBefore: undefined });
  expect(screen.getByRole('button', { name: 'Siguiente' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
  await screen.findByText('Cliente 1');
});

it('el estado vacío global ofrece acceso al formulario', async () => {
  listFieldBookings.mockResolvedValue({ data: [], meta: { page: 1, total: 0, totalPages: 0 } });
  const onRegister = vi.fn();
  render(<ListadoReservasCancha onRegister={onRegister} />);
  await screen.findByText('No hay reservas recientes ni próximas.');
  fireEvent.click(screen.getByRole('button', { name: 'Registrar reserva' }));
  expect(onRegister).toHaveBeenCalledOnce();
  expect(screen.queryByRole('table')).toBeNull();
  expect(listFieldBookings).toHaveBeenCalledWith({ page: 1, pageSize: 20, dateFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), dateBefore: undefined });
});

it('un fallo de conexión se muestra como error y permite reintentar', async () => {
  listFieldBookings.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({ data: [booking(1)], meta: { page: 1, total: 1, totalPages: 1 } });
  render(<ListadoReservasCancha />);
  expect((await screen.findByRole('alert')).textContent).toBe('Sin conexión');
  expect(screen.queryByText('No hay reservas recientes ni próximas.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Cliente 1');
});

it('recarga los datos después de una operación del formulario', async () => {
  listFieldBookings.mockResolvedValueOnce({ data: [booking(1)], meta: { page: 1, total: 1, totalPages: 1 } }).mockResolvedValueOnce({ data: [booking(2)], meta: { page: 1, total: 1, totalPages: 1 } });
  const view = render(<ListadoReservasCancha refreshVersion={0} />);
  await screen.findByText('Cliente 1');
  view.rerender(<ListadoReservasCancha refreshVersion={1} />);
  await screen.findByText('Cliente 2');
  expect(screen.queryByText('Cliente 1')).toBeNull();
});
