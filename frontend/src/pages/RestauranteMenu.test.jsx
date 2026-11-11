// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import api from '../services/api';
import { money } from '../utils/restaurante';

vi.mock('../services/api', () => ({ default: { get: vi.fn() } }));

const products = [
  { productId: 1, name: 'Casado', category: 'Platos', price: 4500.5, stockQuantity: 8, status: 'Disponible' },
  { productId: 2, name: 'Pargo', category: 'Platos', price: 9000, stockQuantity: 0, status: 'Agotado' },
  { productId: 3, name: 'Sopa', category: null, price: 2000, stockQuantity: 5, status: 'No disponible' },
];
const response = (data) => ({ data: { data, meta: { total: data.length } } });
const open = (path = '/restaurante/menu') => {
  window.history.replaceState({}, '', path);
  render(<App />);
};

beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation(async (path) => {
    if (path === '/restaurant-products') return response(products);
    if (path === '/restaurant-tables') return { data: { data: [], meta: { total: 0, activeTotal: 0, inactiveTotal: 0, totalCapacity: 0 } } };
    if (['/restaurant-accounts', '/restaurant-accounts/menu'].includes(path)) return response([]);
    throw new Error(`Solicitud inesperada: ${path}`);
  });
});
afterEach(cleanup);

describe('HU-115 búsqueda del catálogo', () => {
  const search = (text) => {
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre o categoría' }), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  };

  it.each(['Cas', 'Platos'])('CA-1 busca por nombre o categoría (%s), conserva datos y permite limpiar', async (q) => {
    open();
    await screen.findByRole('table');
    api.get.mockResolvedValueOnce(response([products[0]]));
    search(` ${q} `);
    await waitFor(() => expect(screen.queryByText('Sopa')).toBeNull());
    const table = await screen.findByRole('table');
    expect(api.get).toHaveBeenLastCalledWith('/restaurant-products', { params: { q } });
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Casado')).toBeTruthy();
    expect(within(table).getAllByRole('cell')[1].textContent).toBe(money(4500.5));
    expect(within(table).getByText('8')).toBeTruthy();
    expect(within(table).getByText('Disponible')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    await screen.findByText('Sopa');
    expect(api.get).toHaveBeenLastCalledWith('/restaurant-products');
    expect(screen.getByRole('searchbox').value).toBe('');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
  });

  it('CA-2 diferencia búsqueda sin coincidencias de catálogo vacío', async () => {
    open(); await screen.findByRole('table');
    api.get.mockResolvedValueOnce(response([]));
    search('inexistente');
    await screen.findByText('No se encontraron productos que coincidan con la búsqueda');
    expect(screen.queryByText('No hay productos registrados')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    api.get.mockResolvedValueOnce(response([]));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    await screen.findByText('No hay productos registrados');
    expect(screen.queryByText('No se encontraron productos que coincidan con la búsqueda')).toBeNull();
  });

  it('un error no indica ausencia de coincidencias y reintentar conserva el criterio', async () => {
    open(); await screen.findByRole('table');
    api.get.mockRejectedValueOnce(new Error('Network Error'));
    search('Sopa');
    await screen.findByRole('alert');
    expect(screen.queryByText('No se encontraron productos que coincidan con la búsqueda')).toBeNull();
    api.get.mockResolvedValueOnce(response([products[2]]));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByText('No disponible');
    expect(api.get).toHaveBeenLastCalledWith('/restaurant-products', { params: { q: 'Sopa' } });
  });

  it('ignora una respuesta antigua cuando se limpia durante la búsqueda', async () => {
    open(); await screen.findByRole('table');
    let resolve;
    api.get.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    search('Cas');
    expect(screen.getByText('Cargando productos…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    await screen.findByText('Sopa');
    resolve(response([]));
    await waitFor(() => expect(screen.getByText('Sopa')).toBeTruthy());
    expect(screen.queryByText('No hay productos registrados')).toBeNull();
  });
});

describe('HU-114 con router y servicio Axios reales', () => {
  it('CA-1 muestra todos los datos, incluidos productos no disponibles, sin acciones fuera de alcance', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Productos registrados' });
    expect(api.get).toHaveBeenCalledWith('/restaurant-products');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent))
      .toEqual(['Nombre', 'Categoría', 'Precio', 'Existencias', 'Disponibilidad']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Platos', money(4500.5), '8', 'Disponible']);
    expect(within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Platos', money(9000), '0', 'Agotado']);
    expect(within(rows[2]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Sin categoría', money(2000), '5', 'No disponible']);
    expect(screen.queryByRole('button', { name: /Registrar|Editar|Eliminar/ })).toBeNull();
  });

  it('CA-2 presenta el mensaje exacto sin tabla ni productos ficticios', async () => {
    api.get.mockResolvedValue(response([]));
    open();
    expect(await screen.findByText('No hay productos registrados')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Casado')).toBeNull();
  });

  it('distingue carga de lista vacía', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    open();
    expect(screen.getByRole('status').textContent).toBe('Cargando productos…');
    expect(screen.queryByText('No hay productos registrados')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('distingue error de lista vacía y permite reintentar', async () => {
    api.get.mockRejectedValueOnce(new Error('Network Error'));
    open();
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar los productos del menú.');
    expect(screen.queryByText('No hay productos registrados')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('table');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('mantiene acceso al catálogo, regreso y rutas anteriores del restaurante usando App', async () => {
    open('/restaurante');
    fireEvent.click(screen.getByRole('link', { name: /Productos del menú/ }));
    await screen.findByRole('table');
    expect(window.location.pathname).toBe('/restaurante/menu');
    fireEvent.click(screen.getByRole('link', { name: 'Volver al restaurante' }));
    for (const [label, path, title] of [
      [/Cuentas de mesa/, '/restaurante/cuentas', /Cuentas de mesa/],
      [/Consumo de huéspedes/, '/restaurante/huespedes', /Consumo de huéspedes/],
      [/Mesas/, '/restaurante/mesas', /Restaurante\s*Mesas/],
    ]) {
      fireEvent.click(screen.getByRole('link', { name: label }));
      await screen.findByRole('heading', { name: title });
      expect(window.location.pathname).toBe(path);
      fireEvent.click(screen.getByRole('link', { name: 'Volver al restaurante' }));
      await waitFor(() => expect(window.location.pathname).toBe('/restaurante'));
    }
    fireEvent.click(screen.getByRole('link', { name: /Productos del menú/ }));
    await screen.findByRole('table');
  });
});
