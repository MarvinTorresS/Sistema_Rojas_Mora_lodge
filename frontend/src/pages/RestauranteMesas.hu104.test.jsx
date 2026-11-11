// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RestauranteMesas from './RestauranteMesas';
import { listRestaurantTables } from '../services/restauranteService';

vi.mock('../services/restauranteService', () => ({
  listRestaurantTables: vi.fn(), deactivateRestaurantTable: vi.fn(),
}));

const table = (id, seatCount) => ({
  tableId: id, tableNumber: String(id), seatCount, location: null, status: 'available', stateLabel: 'Activa', isActive: true, isOccupied: false,
});
const ALL = [table(1, 2), table(2, 4), table(7, 8)];
const META = { total: 3, activeTotal: 3, inactiveTotal: 0, totalCapacity: 14 };

// Simula el backend: filtra por numero exacto y capacidad minima.
function fakeBackend(filters) {
  if (!filters) return { data: ALL, meta: META };
  const data = ALL.filter((t) => (!filters.number || t.tableNumber === String(Number(filters.number)))
    && (!filters.minSeats || t.seatCount >= filters.minSeats));
  return { data, meta: { ...META, matchedTotal: data.length, filters } };
}

const renderPage = () => render(<MemoryRouter><RestauranteMesas /></MemoryRouter>);
const rowsShown = () => screen.getAllByRole('row').slice(1).map((row) => row.querySelector('th').textContent);

beforeEach(() => {
  vi.resetAllMocks();
  listRestaurantTables.mockImplementation(async (filters) => fakeBackend(filters));
});
afterEach(cleanup);

describe('HU-104 - Buscar mesa por número o capacidad', () => {
  it('sin búsqueda pide el listado exactamente como HU-103', async () => {
    renderPage();
    await screen.findByText('Mesa 7');
    expect(listRestaurantTables).toHaveBeenCalledWith();
    expect(screen.getByRole('search', { name: 'Buscar mesas' })).toBeTruthy();
  });

  it('CA-1 busca por capacidad mínima y muestra solo las que coinciden', async () => {
    renderPage();
    await screen.findByText('Mesa 7');
    fireEvent.click(screen.getByRole('button', { name: '4+' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(rowsShown()).toEqual(['Mesa 2', 'Mesa 7']));
    expect(listRestaurantTables).toHaveBeenLastCalledWith({ minSeats: 4 });
    expect(screen.getByText(/2 de 3 mesas coinciden · 4 o más personas/)).toBeTruthy();
    // Los totales siguen siendo de todo el catálogo.
    expect(screen.getByText('14 personas')).toBeTruthy();
  });

  it('CA-1 busca por número con Enter, combinable con la capacidad', async () => {
    renderPage();
    await screen.findByText('Mesa 7');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Número de mesa' }), { target: { value: '07' } });
    fireEvent.submit(screen.getByRole('search', { name: 'Buscar mesas' }));
    await waitFor(() => expect(rowsShown()).toEqual(['Mesa 7']));
    expect(listRestaurantTables).toHaveBeenLastCalledWith({ number: '07' });
  });

  it('CA-2 sin coincidencias: mensaje de la historia y el criterio se conserva', async () => {
    renderPage();
    await screen.findByText('Mesa 7');
    const number = screen.getByRole('searchbox', { name: 'Número de mesa' });
    fireEvent.change(number, { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('No se encontraron mesas con los criterios indicados')).toBeTruthy();
    expect(screen.getByText('Criterios: Mesa 25')).toBeTruthy();
    expect(number.value).toBe('25');
    expect(screen.queryByRole('table')).toBeNull();
    // No se confunde con "no hay mesas registradas" (HU-103 CA-2).
    expect(screen.queryByText('No hay mesas registradas actualmente')).toBeNull();
  });

  it('Limpiar búsqueda vuelve al listado completo', async () => {
    renderPage();
    await screen.findByText('Mesa 7');
    fireEvent.click(screen.getByRole('button', { name: '8+' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(rowsShown()).toEqual(['Mesa 7']));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    await waitFor(() => expect(rowsShown()).toEqual(['Mesa 1', 'Mesa 2', 'Mesa 7']));
    expect(screen.getByRole('button', { name: '8+' }).getAttribute('aria-pressed')).toBe('false');
  });
});
