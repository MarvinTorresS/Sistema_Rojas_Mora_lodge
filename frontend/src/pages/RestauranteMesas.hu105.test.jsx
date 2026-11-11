// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RestauranteMesas from './RestauranteMesas';
import api from '../services/api';

vi.mock('../services/api', () => ({ default: { get: vi.fn(), delete: vi.fn(), post: vi.fn() } }));
const table = { tableId: 1, tableNumber: '1', seatCount: 4, status: 'available', stateLabel: 'Activa', isActive: true };
const list = (data) => ({ data: { data, meta: { total: data.length, activeTotal: data.length, inactiveTotal: 0, totalCapacity: 4 * data.length } } });
const failure = (status, message, code) => ({ response: { status, data: { error: { message, code } } } });

beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue(list([table])); });
afterEach(cleanup);

async function open() {
  render(<MemoryRouter><RestauranteMesas /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar mesa 1 (Administrador)' }));
  await screen.findByRole('dialog', { name: 'Eliminar mesa permanentemente' });
}
function credentials() {
  fireEvent.change(screen.getByLabelText('Correo del Administrador'), { target: { value: 'admin@example.com' } });
  fireEvent.change(screen.getByLabelText('Contraseña del Administrador'), { target: { value: 'Password-test-105' } });
}
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar permanentemente' }));

describe('HU-105 confirmación y autorización de eliminación', () => {
  it('abrir y cancelar no envía DELETE ni desactiva; las credenciales se descartan', async () => {
    await open(); credentials();
    expect(api.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'No, volver' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.delete).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar mesa 1 (Administrador)' }));
    expect(screen.getByLabelText('Contraseña del Administrador').value).toBe('');
  });

  it('CA-1 confirma con credenciales, muestra éxito y actualiza listado', async () => {
    api.delete.mockImplementation(async (_path, config) => {
      expect(config.data).toEqual({ confirmed: true, adminApproval: { email: 'admin@example.com', password: 'Password-test-105' } });
      return { data: { data: { tableId: 1, resourceId: 21 } } };
    });
    await open(); credentials(); api.get.mockResolvedValue(list([])); confirm();
    await screen.findByText('Mesa 1 eliminada permanentemente.');
    await screen.findByText('No hay mesas registradas actualmente');
    expect(api.delete.mock.calls[0][0]).toBe('/restaurant-tables/1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('CA-2 ofrece desactivación pero exige abrir y confirmar su flujo separado', async () => {
    api.delete.mockRejectedValue(failure(409, 'La mesa tiene historial. Puede desactivarla.', 'TABLE_HAS_HISTORY'));
    api.post.mockResolvedValue({ data: { data: { ...table, status: 'inactive' } } });
    await open(); credentials(); confirm();
    expect((await screen.findByRole('alert')).textContent).toContain('historial');
    expect(screen.getByLabelText('Contraseña del Administrador').value).toBe('');
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar desactivación' }));
    await screen.findByRole('dialog', { name: 'Desactivar mesa' });
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desactivar' }));
    await screen.findByText(/Mesa 1 desactivada/);
    expect(api.post.mock.calls[0][0]).toBe('/restaurant-tables/1/deactivate');
  });

  it('no ofrece desactivar automáticamente una mesa que ya está inactiva', async () => {
    api.get.mockResolvedValue(list([{ ...table, isActive: false, status: 'inactive', stateLabel: 'Inactiva' }]));
    api.delete.mockRejectedValue(failure(409, 'Tiene historial.', 'TABLE_HAS_HISTORY'));
    await open(); credentials(); confirm();
    await screen.findByText('La mesa ya está inactiva; se conservará su historial.');
    expect(screen.queryByRole('button', { name: 'Solicitar desactivación' })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'Credenciales inválidas.'], [403, 'Solo un Administrador puede eliminar mesas.'], [429, 'Demasiados intentos.'],
  ])('muestra rechazo %s y no elimina visualmente la mesa', async (status, message) => {
    api.delete.mockRejectedValue(failure(status, message));
    await open(); credentials(); confirm();
    expect((await screen.findByRole('alert')).textContent).toContain(message);
    expect(screen.getByLabelText('Contraseña del Administrador').value).toBe('');
    expect(screen.queryByText('Mesa 1 eliminada permanentemente.')).toBeNull();
    expect(api.post).not.toHaveBeenCalled(); expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('evita doble envío y cierre mientras se procesa la eliminación', async () => {
    let resolve;
    api.delete.mockReturnValue(new Promise((done) => { resolve = done; }));
    await open(); credentials(); confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminando…' }));
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'No, volver' }).disabled).toBe(true);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    resolve({ data: { data: { tableId: 1 } } });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
