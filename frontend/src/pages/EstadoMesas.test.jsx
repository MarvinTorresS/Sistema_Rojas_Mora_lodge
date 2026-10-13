// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import EstadoMesas from './EstadoMesas';
import { listTableStatuses } from '../services/tableStatusService';
vi.mock('../services/tableStatusService', () => ({ listTableStatuses: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const data = [{ tableId: 1, tableNumber: '1', seatCount: 4, status: 'available' }, { tableId: 2, tableNumber: '2', seatCount: 2, status: 'occupied' }, { tableId: 3, tableNumber: '3', seatCount: 6, status: 'reserved' }];
const result = (items, message = null) => ({ data: items, meta: { checkedAt: '2026-10-13T02:00:00Z', counts: { available: items.filter((i) => i.status === 'available').length, occupied: items.filter((i) => i.status === 'occupied').length, reserved: items.filter((i) => i.status === 'reserved').length, unavailable: items.filter((i) => i.status === 'unavailable').length }, message } });
function mount() { render(<MemoryRouter><EstadoMesas /></MemoryRouter>); }
it('muestra estados con texto y capacidad', async () => {
  listTableStatuses.mockResolvedValue(result(data)); mount();
  const heading = await screen.findByRole('heading', { name: 'Mesa 1' });
  expect(within(heading.parentElement).getByText('Disponible')).toBeTruthy();
  expect(within(heading.parentElement).getByText('4 personas')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Mesa 3' })).toBeTruthy();
});
it('actualizar cambia estados y muestra el aviso cuando no quedan disponibles', async () => {
  listTableStatuses.mockResolvedValueOnce(result(data)).mockResolvedValueOnce(result(data.map((item) => ({ ...item, status: 'occupied' })), 'No hay mesas disponibles en este momento'));
  mount(); await screen.findByRole('heading', { name: 'Mesa 1' });
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
  expect(await screen.findByText('No hay mesas disponibles en este momento')).toBeTruthy();
  expect(screen.getByText('Disponible: 0')).toBeTruthy();
});
it('distingue ausencia de mesas de ausencia de disponibilidad', async () => {
  listTableStatuses.mockResolvedValue(result([])); mount();
  expect(await screen.findByText('No hay mesas configuradas en el sistema.')).toBeTruthy();
  expect(screen.queryByText('No hay mesas disponibles en este momento')).toBeNull();
});
it('un error de consulta se informa y permite reintentar', async () => {
  listTableStatuses.mockRejectedValueOnce(new Error('Servidor no disponible')).mockResolvedValueOnce(result(data)); mount();
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
  expect(await screen.findByRole('heading', { name: 'Mesa 1' })).toBeTruthy();
});
