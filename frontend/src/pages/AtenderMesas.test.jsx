// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import AtenderMesas from './AtenderMesas';
import { listOpenAccounts, listRestaurantTables, openTableAccount } from '../services/restauranteService';

vi.mock('../services/restauranteService', () => ({
  RESTAURANT_USER_ID: 1, listRestaurantTables: vi.fn(), listOpenAccounts: vi.fn(), openTableAccount: vi.fn(),
}));

const table = (id, overrides = {}) => ({
  tableId: id, tableNumber: String(id), seatCount: 4, location: 'Interior', status: 'available', isActive: true, ...overrides,
});
const TABLES = [table(1), table(2, { status: 'occupied' }), table(3, { isActive: false, status: 'inactive' }), table(4, { seatCount: 6 })];
const apiError = (message, extra) => Object.assign(new Error(message), extra);

const renderPage = () => render(<MemoryRouter><AtenderMesas /></MemoryRouter>);
const tile = (name) => screen.findByRole('button', { name: new RegExp(`^Mesa ${name},`) });

beforeEach(() => {
  vi.resetAllMocks();
  listRestaurantTables.mockResolvedValue({ data: TABLES, meta: {} });
  listOpenAccounts.mockResolvedValue({ data: [{ accountId: 70, table: { tableId: 2, tableNumber: '2' } }] });
});
afterEach(cleanup);

describe('HU-024 - Abrir una cuenta al asignar una mesa', () => {
  it('muestra cada mesa con su estado en texto; la inactiva no se puede elegir', async () => {
    renderPage();
    expect((await tile(1)).getAttribute('aria-label')).toBe('Mesa 1, 4 personas, disponible');
    expect((await tile(2)).getAttribute('aria-label')).toBe('Mesa 2, 4 personas, ocupada');
    expect((await tile(3)).disabled).toBe(true);
  });

  it('CA-1 abre la cuenta de una mesa disponible: registra mesero y hora, y la mesa pasa a Ocupada', async () => {
    openTableAccount.mockResolvedValue({
      message: 'Cuenta abierta exitosamente',
      data: {
        account: { accountId: 81, openedAt: '2026-11-11T17:02:00.000Z', items: [] },
        table: { ...TABLES[3], status: 'occupied' },
      },
    });
    renderPage();
    fireEvent.click(await tile(4));
    const panel = screen.getByRole('complementary', { name: 'Mesa 4' });
    expect(within(panel).getByText('Usuario de turno (n.º 1)')).toBeTruthy();
    // Despues de abrir, la recarga ya trae la cuenta nueva.
    listOpenAccounts.mockResolvedValue({ data: [
      { accountId: 70, table: { tableId: 2, tableNumber: '2' } }, { accountId: 81, table: { tableId: 4, tableNumber: '4' } },
    ] });
    fireEvent.click(within(panel).getByRole('button', { name: 'Abrir cuenta' }));

    expect((await screen.findByRole('status')).textContent).toBe('Cuenta abierta exitosamente');
    expect(openTableAccount).toHaveBeenCalledWith({ tableId: 4, seenTableStatus: 'available' });
    expect(screen.getByText('11:02 a. m.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tomar el pedido' }).getAttribute('href')).toBe('/restaurante/cuentas?cuenta=81');
    expect((await tile(4)).getAttribute('aria-label')).toBe('Mesa 4, 6 personas, ocupada');
  });

  it('CA-2 otro mesero se adelantó: "Esta mesa ya fue abierta", sin segunda cuenta, y se refresca el panel', async () => {
    openTableAccount.mockRejectedValue(apiError('Esta mesa ya fue abierta', {
      code: 'TABLE_ALREADY_OPENED', status: 409, details: { tableId: 1, accountId: 90 },
    }));
    renderPage();
    fireEvent.click(await tile(1));
    listOpenAccounts.mockResolvedValue({ data: [
      { accountId: 70, table: { tableId: 2, tableNumber: '2' } }, { accountId: 90, table: { tableId: 1, tableNumber: '1' } },
    ] });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir cuenta' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Esta mesa ya fue abierta.');
    expect(within(alert).getByRole('link', { name: 'Ver cuenta' }).getAttribute('href')).toBe('/restaurante/cuentas?cuenta=90');
    expect(openTableAccount).toHaveBeenCalledWith({ tableId: 1, seenTableStatus: 'available' });
    expect((await tile(1)).getAttribute('aria-label')).toBe('Mesa 1, 4 personas, ocupada');
    expect(listRestaurantTables).toHaveBeenCalledTimes(2);
  });

  it('CA-3 mesa ocupada: "La mesa ya se encuentra ocupada", no permite abrir y sugiere unir el pedido', async () => {
    renderPage();
    fireEvent.click(await tile(2));
    const panel = screen.getByRole('complementary', { name: 'Mesa 2' });
    expect(within(panel).getByRole('alert').textContent).toBe('La mesa ya se encuentra ocupada');
    expect(within(panel).queryByRole('button', { name: 'Abrir cuenta' })).toBeNull();
    expect(within(panel).getByRole('link', { name: /Unir el pedido a la cuenta abierta/ }).getAttribute('href'))
      .toBe('/restaurante/cuentas?cuenta=70');
    expect(openTableAccount).not.toHaveBeenCalled();
  });

  it('una mesa con status "occupied" pero sin cuenta abierta se trata como disponible (igual que el backend)', async () => {
    listOpenAccounts.mockResolvedValue({ data: [] });
    renderPage();
    expect((await tile(2)).getAttribute('aria-label')).toBe('Mesa 2, 4 personas, disponible');
  });

  it('si no cargan las mesas, avisa y permite reintentar', async () => {
    listRestaurantTables.mockRejectedValueOnce(new Error('No se pudieron cargar las mesas.'));
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar las mesas.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await tile(1)).toBeTruthy();
  });
});
