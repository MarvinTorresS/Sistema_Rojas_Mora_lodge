// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import RestauranteCuentas from './RestauranteCuentas';
import {
  addProductsToAccount, getAccount, listOpenAccounts, listOrderMenu,
} from '../services/restauranteService';

vi.mock('../services/restauranteService', () => ({
  listOpenAccounts: vi.fn(), listOrderMenu: vi.fn(), getAccount: vi.fn(), addProductsToAccount: vi.fn(),
}));

const product = (id, name, price, stock, category = 'Platos') => ({
  productId: id, name, category, price, stockQuantity: stock, soldOut: stock <= 0, status: stock <= 0 ? 'Agotado' : 'Disponible',
});
const line = (id, name, quantity, unitPrice) => ({ itemId: id, productId: id, name, quantity, unitPrice, subtotal: quantity * unitPrice });
const account = (items = []) => ({
  accountId: 5, status: 'open', version: 1, openedAt: '2026-10-14T18:00:00Z', table: { tableId: 2, tableNumber: '2', seatCount: 4 },
  items, itemCount: items.reduce((sum, i) => sum + i.quantity, 0), accumulatedTotal: items.reduce((sum, i) => sum + i.subtotal, 0),
});
const error = (message, code, details) => Object.assign(new Error(message), { code, details });
const renderPage = () => render(<MemoryRouter><RestauranteCuentas /></MemoryRouter>);

async function pickAccount() {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de la mesa 2' }));
  await screen.findByText('Cuenta seleccionada');
  await screen.findByText('La cuenta todavía no tiene productos.');
}

beforeEach(() => {
  vi.resetAllMocks();
  listOpenAccounts.mockResolvedValue({
    data: [{ accountId: 5, table: { tableNumber: '2' }, customerName: null, itemCount: 0, accumulatedTotal: 0 }], meta: { total: 1 },
  });
  listOrderMenu.mockResolvedValue({
    data: [product(1, 'Casado', 4500, 10), product(2, 'Refresco', 1500, 20, 'Bebidas'), product(3, 'Pargo', 9000, 0)], meta: {},
  });
  getAccount.mockResolvedValue(account());
});
afterEach(cleanup);

describe('HU-025 - Agregar productos a una cuenta de mesa activa', () => {
  it('sin cuentas abiertas lo dice y no ofrece productos', async () => {
    listOpenAccounts.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    expect(await screen.findByText('No hay cuentas de mesa abiertas.')).toBeTruthy();
    expect(screen.getByText('Elegí primero una cuenta para poder agregar productos.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Agregar Casado' }).disabled).toBe(true);
  });

  it('CA-3 el producto sin existencias aparece como "Agotado" y no se puede agregar', async () => {
    await pickAccount();
    const pargo = screen.getByText('Pargo').closest('li');
    expect(within(pargo).getByText('Agotado')).toBeTruthy();
    expect(within(pargo).getByRole('button', { name: 'Agregar Pargo' }).disabled).toBe(true);
    expect(within(pargo).getByRole('button', { name: 'Agregar Pargo' }).getAttribute('title')).toBe('Producto sin existencias disponibles');
    expect(within(screen.getByText('Casado').closest('li')).getByText('Disponible')).toBeTruthy();
  });

  it('CA-1 agrega y la cuenta muestra nombre, cantidad, precio unitario, subtotal y consumo acumulado', async () => {
    addProductsToAccount.mockResolvedValue(account([line(1, 'Casado', 2, 4500)]));
    await pickAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Casado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una unidad de Casado' }));
    expect(screen.getByRole('spinbutton', { name: 'Cantidad de Casado' }).value).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a la cuenta' }));
    expect(await screen.findByText(/Productos agregados a la cuenta de la mesa 2/)).toBeTruthy();
    expect(addProductsToAccount).toHaveBeenCalledWith(5, [{ productId: 1, quantity: 2 }]);
    const row = screen.getByRole('row', { name: /Casado/ });
    expect(row.textContent.replace(/\D/g, '')).toBe('245009000'); // cantidad 2 · unitario 4500 · subtotal 9000
    expect(screen.getByText('Consumo acumulado').nextSibling.textContent.replace(/\D/g, '')).toBe('9000');
    // El pedido por agregar se vacía y el menú se vuelve a leer (existencias).
    expect(screen.getByText('Elegí productos del menú para armar el pedido.')).toBeTruthy();
    await waitFor(() => expect(listOrderMenu).toHaveBeenCalledTimes(2));
  });

  it('CA-2 cada línea conserva su precio: una línea anterior y la nueva con precio vigente', async () => {
    getAccount.mockResolvedValue(account([line(1, 'Casado', 2, 4000)]));
    addProductsToAccount.mockResolvedValue(account([line(1, 'Casado', 2, 4000), line(4, 'Casado', 1, 4500)]));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cuenta de la mesa 2' }));
    await screen.findByText('Consumo acumulado');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Casado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a la cuenta' }));
    await screen.findByText(/Productos agregados/);
    const rows = screen.getAllByRole('row', { name: /Casado/ });
    expect(rows.map((row) => row.textContent.replace(/\D/g, ''))).toEqual(['240008000', '145004500']);
    expect(screen.getByText('Consumo acumulado').nextSibling.textContent.replace(/\D/g, '')).toBe('12500');
  });

  it('CA-3 si el servidor responde sin existencias, avisa, no agrega y refresca el menú', async () => {
    addProductsToAccount.mockRejectedValue(error('Producto sin existencias disponibles', 'PRODUCT_OUT_OF_STOCK', { productName: 'Casado' }));
    await pickAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Casado' }));
    listOrderMenu.mockResolvedValue({ data: [product(1, 'Casado', 4500, 0), product(2, 'Refresco', 1500, 20)], meta: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a la cuenta' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Producto sin existencias disponibles');
    expect(alert.textContent).toContain('Casado');
    await waitFor(() => expect(within(screen.getByText('Casado', { selector: 'strong' }).closest('li')).getByText('Agotado')).toBeTruthy());
    expect(screen.getByText('La cuenta todavía no tiene productos.')).toBeTruthy();
  });

  it('no deja pedir más unidades que las existencias', async () => {
    listOrderMenu.mockResolvedValue({ data: [product(1, 'Casado', 4500, 2)], meta: {} });
    await pickAccount();
    const add = screen.getByRole('button', { name: 'Agregar Casado' });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getByRole('spinbutton', { name: 'Cantidad de Casado' }).value).toBe('2');
    expect(screen.getByRole('button', { name: 'Agregar Casado' }).disabled).toBe(true);
  });

  it('filtra el menú por texto y categoría', async () => {
    await pickAccount();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar producto' }), { target: { value: 'ref' } });
    expect(screen.queryByText('Casado', { selector: 'strong' })).toBeNull();
    expect(screen.getByText('Refresco', { selector: 'strong' })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar producto' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: 'Bebidas' } });
    expect(screen.queryByText('Casado', { selector: 'strong' })).toBeNull();
    expect(screen.getByText('Refresco', { selector: 'strong' })).toBeTruthy();
  });

  it('una cuenta cerrada muestra el motivo y no se envía dos veces', async () => {
    let fail;
    addProductsToAccount.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    await pickAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Casado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a la cuenta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregando…' }));
    expect(addProductsToAccount).toHaveBeenCalledTimes(1);
    fail(error('No es posible modificar una cuenta cerrada', 'ACCOUNT_CLOSED'));
    expect((await screen.findByRole('alert')).textContent).toContain('No es posible modificar una cuenta cerrada');
  });
});
