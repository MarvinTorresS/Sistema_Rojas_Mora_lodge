// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import RestauranteCuentas from './RestauranteCuentas';
import { getAccount, listOpenAccounts, listOrderMenu } from '../services/restauranteService';

vi.mock('../services/restauranteService', () => ({
  listOpenAccounts: vi.fn(), listOrderMenu: vi.fn(), getAccount: vi.fn(), addProductsToAccount: vi.fn(),
  updateItemQuantity: vi.fn(),
}));

const account = {
  accountId: 81, status: 'open', version: 1, openedAt: '2026-11-11T17:02:00.000Z',
  table: { tableId: 4, tableNumber: '4', seatCount: 6 }, items: [], itemCount: 0, accumulatedTotal: 0,
};
const renderAt = (path) => render(<MemoryRouter initialEntries={[path]}><RestauranteCuentas /></MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  listOpenAccounts.mockResolvedValue({ data: [{ accountId: 81, table: account.table, itemCount: 0, accumulatedTotal: 0 }] });
  listOrderMenu.mockResolvedValue({ data: [] });
  getAccount.mockResolvedValue(account);
});
afterEach(cleanup);

describe('HU-024 - Llegar a la cuenta recién abierta (?cuenta=)', () => {
  it('abre sola la cuenta indicada en la dirección', async () => {
    renderAt('/restaurante/cuentas?cuenta=81');
    expect((await screen.findByRole('button', { name: 'Cuenta de la mesa 4' })).getAttribute('aria-pressed')).toBe('true');
    expect(getAccount).toHaveBeenCalledWith(81);
    expect(getAccount).toHaveBeenCalledTimes(1);
  });

  it('sin el parámetro (o con uno inválido) no abre ninguna cuenta', async () => {
    renderAt('/restaurante/cuentas?cuenta=abc');
    await screen.findByRole('button', { name: 'Cuenta de la mesa 4' });
    expect(getAccount).not.toHaveBeenCalled();
  });
});
