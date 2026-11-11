// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RestauranteCuentas from './RestauranteCuentas';
import * as api from '../services/restauranteService';
vi.mock('../services/restauranteService', () => ({
  listOpenAccounts: vi.fn(), listOrderMenu: vi.fn(), getAccount: vi.fn(),
  addProductsToAccount: vi.fn(), updateItemQuantity: vi.fn(), removeAccountItem: vi.fn(),
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
  api.removeAccountItem.mockResolvedValue(detail({ items: [], version: 5, accumulatedTotal: 0 }));
});
afterEach(cleanup);
async function select(data = detail()) {
  api.getAccount.mockResolvedValue(data);
  render(<MemoryRouter><RestauranteCuentas /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de la mesa 2' }));
  await screen.findByRole('table', { name: 'Productos de la cuenta' });
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Retirar Casado, línea 11' }));
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar retiro' }));
it('abrir y volver no retiran; confirmar actualiza totales, listado y menú', async () => {
  await select(); open();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(api.removeAccountItem).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
  expect(api.removeAccountItem).not.toHaveBeenCalled();
  open();
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo (opcional)' }), { target: { value: 'Desiste' } });
  confirm();
  await screen.findByText('Producto retirado correctamente.');
  expect(api.removeAccountItem).toHaveBeenCalledWith(5, 11, { expectedVersion: 4, removedReason: 'Desiste' });
  expect(screen.getByText('La cuenta todavía no tiene productos.')).toBeTruthy();
  expect(screen.getByText('Consumo acumulado').nextSibling.textContent.replace(/\D/g, '')).toBe('0');
  await waitFor(() => expect(api.listOpenAccounts).toHaveBeenCalledTimes(2));
  expect(api.listOrderMenu).toHaveBeenCalledTimes(2);
});
it.each(['sent', 'preparing', 'served'])('no permite retirar %s', async kitchenStatus => {
  const data = detail(); data.items[0].kitchenStatus = kitchenStatus;
  await select(data);
  expect(screen.queryByRole('button', { name: /Retirar Casado/ })).toBeNull();
  expect(screen.getByText(/No se puede retirar/)).toBeTruthy();
});
it.each(['closed', 'cancelled'])('no permite retirar cuenta %s', async status => {
  await select(detail({ status }));
  expect(screen.queryByRole('button', { name: /Retirar Casado/ })).toBeNull();
});
it('impide doble envío y edición simultánea', async () => {
  let resolve;
  api.removeAccountItem.mockReturnValue(new Promise(done => { resolve = done; }));
  await select(); open(); confirm(); confirm();
  expect(api.removeAccountItem).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Editar cantidad de Casado, línea 11' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Volver' }).disabled).toBe(true);
  resolve(detail({ items: [], version: 5, accumulatedTotal: 0 }));
  await screen.findByText('Producto retirado correctamente.');
});
it.each(['ACCOUNT_VERSION_CONFLICT', 'ACCOUNT_CLOSED', 'ITEM_ALREADY_SENT', 'ITEM_REMOVED'])('rechazo %s requiere recarga sin reenvío automático', async code => {
  api.removeAccountItem.mockRejectedValue(Object.assign(new Error('Recargue la cuenta.'), { code }));
  await select(); open(); confirm();
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Confirmar retiro' }).disabled).toBe(true);
  api.getAccount.mockResolvedValue(detail({ version: 5 }));
  fireEvent.click(screen.getByRole('button', { name: 'Recargar cuenta' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(api.removeAccountItem).toHaveBeenCalledTimes(1);
  open();
  api.removeAccountItem.mockResolvedValue(detail({ items: [], version: 6, accumulatedTotal: 0 }));
  confirm(); await screen.findByText('Producto retirado correctamente.');
  expect(api.removeAccountItem).toHaveBeenLastCalledWith(5, 11, { expectedVersion: 5, removedReason: '' });
});
it('error de red conserva la línea y muestra el error', async () => {
  api.removeAccountItem.mockRejectedValue(new Error('Sin conexión'));
  await select(); open(); confirm();
  expect((await screen.findByRole('alert')).textContent).toBe('Sin conexión');
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.queryByText('Producto retirado correctamente.')).toBeNull();
});
