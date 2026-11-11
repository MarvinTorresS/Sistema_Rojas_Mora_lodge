// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RestauranteCuentas from './RestauranteCuentas';
import * as api from '../services/restauranteService';
vi.mock('../services/restauranteService', () => ({
  listOpenAccounts: vi.fn(), listOrderMenu: vi.fn(), getAccount: vi.fn(),
  addProductsToAccount: vi.fn(), updateItemQuantity: vi.fn(), removeAccountItem: vi.fn(), closeAccount: vi.fn(),
}));
const detail = (overrides = {}) => ({
  accountId: 5, status: 'open', version: 4, table: { tableNumber: '2' },
  accumulatedTotal: 12000, items: [{ itemId: 11, productId: 1, name: 'Casado',
    quantity: 3, unitPrice: 4000, subtotal: 12000, kitchenStatus: 'pending' }], ...overrides,
});
beforeEach(() => {
  vi.resetAllMocks();
  api.listOpenAccounts.mockResolvedValue({ data: [{ accountId: 5, table: { tableNumber: '2' }, itemCount: 3, accumulatedTotal: 12000 }] });
  api.listOrderMenu.mockResolvedValue({ data: [] });
  api.getAccount.mockResolvedValue(detail());
  api.closeAccount.mockResolvedValue(detail({ status: 'closed', version: 5, tableStatus: 'available' }));
  api.removeAccountItem.mockResolvedValue(detail({ items: [], version: 5, accumulatedTotal: 0 }));
});
afterEach(cleanup);
async function select(data = detail()) {
  api.getAccount.mockResolvedValue(data);
  render(<MemoryRouter><RestauranteCuentas /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de la mesa 2' }));
  await screen.findByRole('table', { name: 'Productos de la cuenta' });
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Cerrar cuenta' }));
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar cierre' }));
it('confirma antes de cerrar, actualiza cuenta/listado y conserva importes', async () => {
  await select(); open(); expect(api.closeAccount).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Volver sin cerrar' }));
  expect(api.closeAccount).not.toHaveBeenCalled();
  open(); api.listOpenAccounts.mockResolvedValue({ data: [] }); confirm();
  await screen.findByText('Cuenta cerrada correctamente. Mesa disponible para un nuevo servicio.');
  expect(api.closeAccount).toHaveBeenCalledWith(5, { expectedVersion: 4 });
  expect(screen.queryByRole('button', { name: 'Cerrar cuenta' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Retirar Casado/ })).toBeNull();
  expect(screen.getByText('Consumo acumulado').nextSibling.textContent.replace(/\D/g, '')).toBe('12000');
  await screen.findByText('No hay cuentas de mesa abiertas.');
});
it('cuenta sin consumos no envía cierre', async () => {
  api.getAccount.mockResolvedValue(detail({ items: [] }));
  render(<MemoryRouter><RestauranteCuentas /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de la mesa 2' }));
  await screen.findByText('La cuenta todavía no tiene productos.'); open();
  expect((await screen.findByRole('alert')).textContent).toContain('sin consumos activos');
  expect(api.closeAccount).not.toHaveBeenCalled();
});
it.each(['closed', 'cancelled'])('no ofrece cierre para %s', async status => {
  await select(detail({ status })); expect(screen.queryByRole('button', { name: 'Cerrar cuenta' })).toBeNull();
});
it('bloquea solicitudes duplicadas y cambios mientras procesa', async () => {
  let finish; api.closeAccount.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await select(); open(); confirm();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrando…' }));
  expect(api.closeAccount).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Volver sin cerrar' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: /Retirar Casado/ }).disabled).toBe(true);
  finish(detail({ status: 'closed', tableStatus: 'inactive' }));
  await screen.findByText(/La mesa conserva sus restricciones/);
});
it.each(['ACCOUNT_VERSION_CONFLICT', 'ACCOUNT_CLOSED', 'ACCOUNT_EMPTY'])('maneja %s sin reenvío automático', async code => {
  api.closeAccount.mockRejectedValue(Object.assign(new Error('La cuenta cambió'), { code }));
  await select(); open(); confirm(); await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Confirmar cierre' }).disabled).toBe(true);
  api.getAccount.mockResolvedValue(detail({ version: 5 }));
  fireEvent.click(screen.getByRole('button', { name: 'Recargar cuenta' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(api.closeAccount).toHaveBeenCalledTimes(1);
  api.closeAccount.mockResolvedValue(detail({ status: 'closed', tableStatus: 'available' }));
  open(); confirm(); await screen.findByText(/Cuenta cerrada correctamente/);
  expect(api.closeAccount).toHaveBeenLastCalledWith(5, { expectedVersion: 5 });
});
it('error de red mantiene la cuenta y permite volver', async () => {
  api.closeAccount.mockRejectedValue(new Error('Sin conexión'));
  await select(); open(); confirm(); await screen.findByText('Sin conexión');
  fireEvent.click(screen.getByRole('button', { name: 'Volver sin cerrar' }));
  expect(screen.getByRole('button', { name: 'Cerrar cuenta' }).disabled).toBe(false);
});
