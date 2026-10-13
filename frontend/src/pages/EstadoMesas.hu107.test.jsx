// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import EstadoMesas from './EstadoMesas';
import { listTableStatuses } from '../services/tableStatusService';
import { reactivateTable } from '../services/tableReactivateService';
vi.mock('../services/tableStatusService', () => ({ listTableStatuses: vi.fn() }));
vi.mock('../services/tableReactivateService', () => ({ reactivateTable: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const table = { tableId: 1, tableNumber: 'PR-01', seatCount: 4, status: 'unavailable', isInactive: true };
const response = (item) => ({ data: [item], meta: { checkedAt: '2026-10-13T02:00:00Z', counts: { available: item.status === 'available' ? 1 : 0, occupied: 0, reserved: 0, unavailable: item.status === 'unavailable' ? 1 : 0 }, message: null } });
function mount() { render(<MemoryRouter><EstadoMesas /></MemoryRouter>); }
it('CA-1 actualiza el panel inmediatamente despues de reactivar', async () => {
  listTableStatuses.mockResolvedValueOnce(response(table)).mockResolvedValueOnce(response({ ...table, status: 'available', isInactive: false }));
  reactivateTable.mockResolvedValue({ message: 'Mesa reactivada exitosamente.' }); mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Reactivar mesa PR-01' }));
  await screen.findByText('Mesa reactivada exitosamente.');
  expect(within(screen.getByRole('heading', { name: 'Mesa PR-01' }).parentElement).getByText('Disponible')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reactivar mesa PR-01' }).disabled).toBe(true);
});
it('CA-2 el boton esta deshabilitado para mesas ya activas', async () => {
  listTableStatuses.mockResolvedValue(response({ ...table, status: 'available', isInactive: false })); mount();
  expect((await screen.findByRole('button', { name: 'Reactivar mesa PR-01' })).disabled).toBe(true);
  expect(reactivateTable).not.toHaveBeenCalled();
});
it('un bloqueo se informa y no cambia el estado mostrado', async () => {
  listTableStatuses.mockResolvedValue(response(table));
  reactivateTable.mockRejectedValue(new Error('La mesa tiene un bloqueo vigente y no puede reactivarse.')); mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Reactivar mesa PR-01' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(within(screen.getByRole('heading', { name: 'Mesa PR-01' }).parentElement).getByText('Fuera de servicio')).toBeTruthy();
});
it('si la reactivacion funciona pero el refresco falla lo informa sin fingir que no se guardo', async () => {
  listTableStatuses.mockResolvedValueOnce(response(table)).mockRejectedValueOnce(new Error('Sin conexion'));
  reactivateTable.mockResolvedValue({ message: 'Mesa reactivada exitosamente.' }); mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Reactivar mesa PR-01' }));
  expect(await screen.findByText(/La mesa fue reactivada, pero no se pudo actualizar/)).toBeTruthy();
});
