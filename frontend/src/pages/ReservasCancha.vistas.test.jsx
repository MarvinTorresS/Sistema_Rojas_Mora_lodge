// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReservasCancha from './ReservasCancha';
import { listFieldBookings } from '../services/reservasCanchaService';

vi.mock('../services/reservasCanchaService', () => ({ createFieldBooking: vi.fn(), listFieldBookings: vi.fn(), searchFieldBookings: vi.fn(), filterFieldBookingsByStatus: vi.fn(), updateFieldBooking: vi.fn(), cancelFieldBooking: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('alterna una sola lista visible con botones y teclado sin perder la pagina del historial', async () => {
  listFieldBookings.mockImplementation(async ({ page = 1, date }) => ({ data: date ? [] : [{ bookingId: page, customer: { fullName: `Cliente pagina ${page}`, phone: '88881111' }, startDatetime: '2026-10-29T21:00:00Z', endDatetime: '2026-10-29T22:00:00Z', status: 'active' }], meta: { page, total: 21, totalPages: 2 } }));
  render(<MemoryRouter><ReservasCancha /></MemoryRouter>);
  expect(screen.getByRole('tabpanel', { name: 'Reservas del día' })).toBeTruthy();
  expect(screen.queryByRole('tabpanel', { name: 'Todas las reservas' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ver listado siguiente' }));
  const all = screen.getByRole('tabpanel', { name: 'Todas las reservas' });
  expect(await within(all).findByText('Cliente pagina 1')).toBeTruthy();
  fireEvent.click(within(all).getByRole('button', { name: 'Siguiente' }));
  await within(all).findByText('Cliente pagina 2');
  fireEvent.click(screen.getByRole('button', { name: 'Ver listado anterior' }));
  expect(screen.queryByRole('tabpanel', { name: 'Todas las reservas' })).toBeNull();
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Reservas del día' }), { key: 'ArrowRight' });
  expect(within(screen.getByRole('tabpanel', { name: 'Todas las reservas' })).getByText('Cliente pagina 2')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Buscar reservas' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Volver a elegir espacio' }).getAttribute('href')).toBe('/reservar');
});

it('consulta el archivo semana por semana y vuelve al listado reciente', async () => {
  listFieldBookings.mockResolvedValue({ data: [], meta: { page: 1, total: 0, totalPages: 0 } });
  render(<MemoryRouter><ReservasCancha /></MemoryRouter>);
  fireEvent.click(screen.getByRole('tab', { name: 'Todas las reservas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Archivo por semana' }));
  await screen.findByText('No hay reservas archivadas en esta semana.');
  const args = listFieldBookings.mock.calls.at(-1)[0];
  expect(args.dateBefore).toBeTruthy();
  expect(new Date(args.dateBefore) - new Date(args.dateFrom)).toBe(7 * 86400000);
  expect(screen.getByRole('button', { name: 'Semana siguiente →' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '← Semana anterior' }));
  const previous = listFieldBookings.mock.calls.at(-1)[0];
  expect(previous.dateBefore).toBe(args.dateFrom);
  fireEvent.click(screen.getByRole('button', { name: 'Recientes y próximas' }));
  const recent = listFieldBookings.mock.calls.at(-1)[0];
  expect(recent.dateBefore).toBeUndefined();
  expect(recent.dateFrom).toBe(args.dateBefore);
});
