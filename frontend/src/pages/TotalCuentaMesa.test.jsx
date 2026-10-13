// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TotalCuentaMesa from './TotalCuentaMesa';
import { getAccountTotal } from '../services/accountTotalService';
vi.mock('../services/accountTotalService', () => ({ getAccountTotal: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const total = { account: { accountId: 1, tableNumber: 'PR-01', status: 'open' }, lines: [{ itemId: 1, productName: 'Bebida', quantity: 2, unitPrice: 1500, amount: 3000 }], subtotal: 3000, taxPercentage: 13, taxAmount: 390, total: 3390, checkedAt: '2026-10-13T02:00:00Z', message: null };
async function consult() {
  render(<MemoryRouter><TotalCuentaMesa /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Número de cuenta'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar total' }));
}
it('muestra subtotal, impuesto y total', async () => {
  getAccountTotal.mockResolvedValue(total); await consult();
  expect(await screen.findByText('Bebida')).toBeTruthy();
  expect(screen.getByText('Impuesto (13%)')).toBeTruthy();
  expect(screen.getByText('Total a pagar')).toBeTruthy();
  expect(getAccountTotal).toHaveBeenCalledWith(1);
});
it('cuenta vacia muestra nota y actualizar consulta el total nuevamente', async () => {
  getAccountTotal.mockResolvedValueOnce({ ...total, lines: [], subtotal: 0, taxAmount: 0, total: 0, message: 'No hay consumos registrados aún' }).mockResolvedValueOnce(total);
  await consult(); expect(await screen.findByRole('status')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar total' }));
  expect(await screen.findByText('Bebida')).toBeTruthy();
  expect(screen.queryByText('No hay consumos registrados aún')).toBeNull();
});
it('cuenta inexistente informa el error sin inventar un total', async () => {
  getAccountTotal.mockRejectedValue(new Error('La cuenta indicada no existe.')); await consult();
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('Total a pagar')).toBeNull();
});
