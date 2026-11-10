// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import RestauranteMesas from './RestauranteMesas';
import { deactivateRestaurantTable, listRestaurantTables } from '../services/restauranteService';

vi.mock('../services/restauranteService', () => ({
  listRestaurantTables: vi.fn(), deactivateRestaurantTable: vi.fn(),
}));

const table = (id, overrides = {}) => ({
  tableId: id, tableNumber: String(id), seatCount: 4, location: null, status: 'available', stateLabel: 'Activa', isActive: true, isOccupied: false, ...overrides,
});
const list = (data) => ({
  data,
  meta: {
    total: data.length,
    activeTotal: data.filter((t) => t.isActive).length,
    inactiveTotal: data.filter((t) => !t.isActive).length,
    totalCapacity: data.filter((t) => t.isActive).reduce((sum, t) => sum + t.seatCount, 0),
  },
});
const renderPage = () => render(<MemoryRouter><RestauranteMesas /></MemoryRouter>);
const error = (message, code) => Object.assign(new Error(message), { code });

beforeEach(() => {
  vi.resetAllMocks();
  listRestaurantTables.mockResolvedValue(list([
    table(1, { seatCount: 2, location: 'Terraza' }),
    table(2),
    table(10, { seatCount: 6, status: 'inactive', stateLabel: 'Inactiva', isActive: false }),
  ]));
});
afterEach(cleanup);

describe('HU-103 - Listado de mesas', () => {
  it('CA-1 muestra número, capacidad, ubicación y estado en el orden recibido', async () => {
    renderPage();
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(4); // encabezado + 3 mesas
    ['N° mesa', 'Capacidad', 'Ubicación', 'Estado', 'Acciones'].forEach((name) => expect(screen.getByRole('columnheader', { name })).toBeTruthy());
    expect(within(rows[1]).getByText('Mesa 1')).toBeTruthy();
    expect(within(rows[1]).getByText('2 personas')).toBeTruthy();
    expect(within(rows[1]).getByText('Terraza')).toBeTruthy();
    expect(within(rows[1]).getByText('Activa')).toBeTruthy();
    expect(within(rows[2]).getByText('—')).toBeTruthy(); // sin ubicación registrada
    expect(within(rows[3]).getByText('Mesa 10')).toBeTruthy();
    expect(within(rows[3]).getByText('Inactiva')).toBeTruthy();
  });

  it('muestra el resumen con la capacidad de las mesas activas', async () => {
    renderPage();
    const summary = await screen.findByLabelText('Resumen de mesas');
    expect(summary.textContent).toContain('6 personas'); // 2 + 4, la inactiva no cuenta
  });

  it('CA-2 sin mesas: mensaje y botón "Registrar mesa" con acceso directo al formulario', async () => {
    listRestaurantTables.mockResolvedValue(list([]));
    renderPage();
    expect(await screen.findByText('No hay mesas registradas actualmente')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    const links = screen.getAllByRole('link', { name: 'Registrar mesa' });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link.getAttribute('href')).toBe('/restaurante/mesas/registrar'));
  });

  it('un error de carga se muestra y permite reintentar', async () => {
    listRestaurantTables.mockRejectedValueOnce(new Error('No se pudieron cargar las mesas.'));
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar las mesas.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Mesa 1')).toBeTruthy();
  });
});

describe('HU-106 - Desactivar una mesa', () => {
  const open = async (number) => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: `Desactivar mesa ${number}` }));
    return screen.getByRole('dialog');
  };

  it('CA-1 pide confirmación y no desactiva hasta confirmar', async () => {
    const dialog = await open(2);
    expect(within(dialog).getByText('¿Está seguro de que desea desactivar esta mesa?')).toBeTruthy();
    expect(deactivateRestaurantTable).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'No, volver' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deactivateRestaurantTable).not.toHaveBeenCalled();
  });

  it('CA-1 al confirmar desactiva, recarga y la mesa queda Inactiva', async () => {
    deactivateRestaurantTable.mockResolvedValue({ tableId: 2, status: 'inactive' });
    const dialog = await open(2);
    listRestaurantTables.mockResolvedValue(list([table(1), table(2, { status: 'inactive', stateLabel: 'Inactiva', isActive: false })]));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }));
    expect(await screen.findByText(/Mesa 2 desactivada/)).toBeTruthy();
    expect(deactivateRestaurantTable).toHaveBeenCalledWith(2);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desactivar mesa 2' }).disabled).toBe(true));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CA-2 con cuenta abierta muestra el motivo dentro del cuadro y la mesa sigue activa', async () => {
    deactivateRestaurantTable.mockRejectedValue(error('No es posible desactivar una mesa con cuenta abierta', 'TABLE_HAS_OPEN_ACCOUNT'));
    const dialog = await open(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe('No es posible desactivar una mesa con cuenta abierta');
    expect(within(dialog).getByRole('button', { name: 'Cerrar' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByRole('button', { name: 'Desactivar mesa 1' }).disabled).toBe(false);
  });

  it('CA-3 una mesa inactiva tiene Desactivar deshabilitado y se ofrece Reactivar', async () => {
    renderPage();
    const off = await screen.findByRole('button', { name: 'Desactivar mesa 10' });
    expect(off.disabled).toBe(true);
    expect(off.getAttribute('title')).toBe('La mesa ya se encuentra inactiva');
    expect(screen.getByRole('button', { name: 'Reactivar mesa 10' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reactivar mesa 1' })).toBeNull();
    fireEvent.click(off);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('CA-3 si el estado estaba desactualizado, avisa "La mesa ya se encuentra inactiva" y recarga', async () => {
    deactivateRestaurantTable.mockRejectedValue(error('La mesa ya se encuentra inactiva', 'TABLE_ALREADY_INACTIVE'));
    const dialog = await open(2);
    listRestaurantTables.mockResolvedValue(list([table(1), table(2, { status: 'inactive', stateLabel: 'Inactiva', isActive: false })]));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('La mesa ya se encuentra inactiva');
    await waitFor(() => expect(listRestaurantTables).toHaveBeenCalledTimes(2));
  });

  it('no permite doble envío mientras se desactiva', async () => {
    let finish;
    deactivateRestaurantTable.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const dialog = await open(2);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Desactivando…' }).disabled).toBe(true));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivando…' }));
    expect(deactivateRestaurantTable).toHaveBeenCalledTimes(1);
    finish({});
    await screen.findByText(/Mesa 2 desactivada/);
  });
});
