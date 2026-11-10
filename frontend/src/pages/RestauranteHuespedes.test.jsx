// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import RestauranteHuespedes from './RestauranteHuespedes';
import {
  getGuestBalance, listOrderMenu, listRestaurantTables, registerGuestConsumption, searchGuests,
} from '../services/restauranteService';
import * as utils from '../utils/restaurante';

vi.mock('../services/restauranteService', () => ({
  searchGuests: vi.fn(), listOrderMenu: vi.fn(), listRestaurantTables: vi.fn(), registerGuestConsumption: vi.fn(), getGuestBalance: vi.fn(),
}));

const guest = (overrides = {}) => ({
  bookingId: 20, guestName: 'Ana Mora Soto', phone: '88880000', cabinName: 'Cabina 1', status: 'checked_in', inCourse: true,
  startDatetime: '2026-10-13T18:00:00Z', endDatetime: '2026-10-16T17:00:00Z', accumulatedBalance: 0, ...overrides,
});
const product = (id, name, price, stock) => ({
  productId: id, name, category: 'Platos', price, stockQuantity: stock, soldOut: stock <= 0, status: stock <= 0 ? 'Agotado' : 'Disponible',
});
const error = (message, code) => Object.assign(new Error(message), { code });
const renderPage = () => render(<MemoryRouter><RestauranteHuespedes /></MemoryRouter>);
const search = async (term = '1') => {
  fireEvent.change(screen.getByLabelText('Número de cabina o nombre de la reserva'), { target: { value: term } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
};

beforeEach(() => {
  vi.resetAllMocks();
  searchGuests.mockResolvedValue({ data: [guest()], meta: { total: 1 } });
  listOrderMenu.mockResolvedValue({ data: [product(1, 'Casado', 4500, 10)], meta: {} });
  listRestaurantTables.mockResolvedValue({
    data: [
      { tableId: 2, tableNumber: '2', seatCount: 4, isActive: true, isOccupied: false },
      { tableId: 3, tableNumber: '3', seatCount: 2, isActive: true, isOccupied: true },
      { tableId: 4, tableNumber: '4', seatCount: 2, isActive: false, isOccupied: false },
    ],
    meta: {},
  });
});
afterEach(cleanup);

describe('HU-030 - Consumo a nombre de un huésped de cabina', () => {
  it('pide un dato para buscar y no consulta con el campo vacío', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Escribí el número de cabina o el nombre del huésped.');
    expect(searchGuests).not.toHaveBeenCalled();
  });

  it('CA-1 busca por cabina o nombre y muestra al huésped con reserva en curso y su saldo', async () => {
    renderPage();
    await search('1');
    expect(await screen.findByText('Ana Mora Soto')).toBeTruthy();
    expect(searchGuests).toHaveBeenCalledWith('1');
    expect(screen.getByText('En curso')).toBeTruthy();
    expect(screen.queryByText('El huésped no cuenta con una reserva activa')).toBeNull();
  });

  it('CA-1 registra el consumo vinculado a la reserva, en la mesa elegida, y actualiza el saldo', async () => {
    registerGuestConsumption.mockResolvedValue({
      createdAccount: true, guest: guest({ accumulatedBalance: 9000 }), account: { accountId: 5 },
    });
    renderPage();
    await search();
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar consumo de Ana Mora Soto' }));
    // Solo mesas activas y libres
    const select = screen.getByLabelText('Mesa');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sin mesa (usar su cuenta abierta)', 'Mesa 2 · 4 personas']);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Casado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una unidad de Casado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar consumo' }));
    expect(await screen.findByText(/Consumo registrado a nombre de Ana Mora Soto/)).toBeTruthy();
    expect(registerGuestConsumption).toHaveBeenCalledWith({ bookingId: 20, tableId: 2, items: [{ productId: 1, quantity: 2 }] });
    // CA-3: el saldo acumulado se actualiza en la lista y en el panel
    expect(within(screen.getByRole('list', { name: 'Huéspedes encontrados' })).getByText('Saldo').nextSibling.textContent.replace(/\D/g, '')).toBe('9000');
    expect(screen.getByText(/· Saldo ₡/).textContent.split('Saldo')[1].replace(/\D/g, '')).toBe('9000');
    expect(screen.getByText('Elegí productos del menú para armar el pedido.')).toBeTruthy();
  });

  it('CA-3 un pedido adicional sin mesa se suma a la cuenta abierta del huésped', async () => {
    searchGuests.mockResolvedValue({ data: [guest({ accumulatedBalance: 9000 })], meta: { total: 1 } });
    registerGuestConsumption.mockResolvedValue({ createdAccount: false, guest: guest({ accumulatedBalance: 10500 }), account: {} });
    renderPage();
    await search();
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar consumo de Ana Mora Soto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Casado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar consumo' }));
    await screen.findByText(/Saldo acumulado: /);
    expect(registerGuestConsumption).toHaveBeenCalledWith({ bookingId: 20, tableId: undefined, items: [{ productId: 1, quantity: 1 }] });
  });

  it('CA-2 sin reserva en curso: "El huésped no cuenta con una reserva activa" y no se puede cargar nada', async () => {
    searchGuests.mockResolvedValue({ data: [guest({ status: 'active', inCourse: false })], meta: { total: 1 } });
    renderPage();
    await search();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0].textContent).toBe('El huésped no cuenta con una reserva activa');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar consumo de Ana Mora Soto' }));
    expect(screen.queryByRole('button', { name: 'Registrar consumo' })).toBeNull();
    expect(screen.queryByLabelText('Mesa')).toBeNull();
    expect(screen.getByRole('button', { name: 'Agregar Casado' }).disabled).toBe(true);
    expect(registerGuestConsumption).not.toHaveBeenCalled();
  });

  it('CA-2 si la búsqueda no encuentra ninguna reserva, también avisa que no hay reserva activa', async () => {
    searchGuests.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    await search('Nadie');
    expect(await screen.findByText(/No hay reservas de cabina con «Nadie»/)).toBeTruthy();
    expect(screen.getByText('El huésped no cuenta con una reserva activa')).toBeTruthy();
  });

  it('muestra el error del servidor (p. ej. falta la mesa) dentro del panel y conserva el pedido', async () => {
    registerGuestConsumption.mockRejectedValue(error('Seleccione la mesa donde se atiende al huésped.', 'TABLE_REQUIRED'));
    renderPage();
    await search();
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar consumo de Ana Mora Soto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Casado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar consumo' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Seleccione la mesa donde se atiende al huésped.');
    expect(screen.getByLabelText('Mesa').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('spinbutton', { name: 'Cantidad de Casado' }).value).toBe('1');
  });
});

describe('HU-031 - Saldo acumulado del huésped', () => {
  const balance = {
    guest: guest({ accumulatedBalance: 10500 }), hasConsumptions: true, message: null, total: 10500, generatedAt: '2026-10-15T18:00:00Z',
    consumptions: [
      { itemId: 1, date: '2026-10-14T18:00:00Z', productName: 'Casado', quantity: 2, unitPrice: 4500, amount: 9000, tableNumber: '2' },
      { itemId: 2, date: '2026-10-15T01:00:00Z', productName: 'Refresco', quantity: 1, unitPrice: 1500, amount: 1500, tableNumber: '2' },
    ],
  };

  it('CA-1 muestra fecha, producto y monto de cada consumo y el saldo total', async () => {
    getGuestBalance.mockResolvedValue(balance);
    renderPage();
    await search();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver saldo de Ana Mora Soto' }));
    expect(await screen.findByText('Saldo acumulado de Ana Mora Soto')).toBeTruthy();
    expect(getGuestBalance).toHaveBeenCalledWith(20);
    ['Fecha', 'Producto', 'Cant.', 'Monto'].forEach((name) => expect(screen.getByRole('columnheader', { name })).toBeTruthy());
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Casado')).toBeTruthy();
    expect(rows[1].textContent.replace(/\D/g, '').endsWith('9000')).toBe(true);
    expect(within(screen.getByRole('row', { name: /Saldo total/ })).getByRole('cell').textContent.replace(/\D/g, '')).toBe('10500');
    expect(screen.getByText(/Documento preliminar: no es una factura/)).toBeTruthy();
  });

  it('CA-1 se puede imprimir y exportar el comprobante preliminar', async () => {
    getGuestBalance.mockResolvedValue(balance);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const download = vi.spyOn(utils, 'downloadTextFile').mockImplementation(() => {});
    renderPage();
    await search();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver saldo de Ana Mora Soto' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(download).toHaveBeenCalledWith('comprobante-preliminar-ana-mora-soto.csv', expect.stringContaining('Saldo total,,,,10500'));
    print.mockRestore();
    download.mockRestore();
  });

  it('CA-2 sin consumos: "Este huésped no tiene consumos registrados en el restaurante" y sin exportar', async () => {
    getGuestBalance.mockResolvedValue({
      guest: guest(), hasConsumptions: false, consumptions: [], total: 0, generatedAt: '2026-10-15T18:00:00Z',
      message: 'Este huésped no tiene consumos registrados en el restaurante',
    });
    renderPage();
    await search();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver saldo de Ana Mora Soto' }));
    expect(await screen.findByText('Este huésped no tiene consumos registrados en el restaurante')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Imprimir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).toBeNull();
    expect(screen.queryByRole('table', { name: /Consumos/ })).toBeNull();
  });

  it('un error al consultar el saldo se muestra', async () => {
    getGuestBalance.mockRejectedValue(new Error('La reserva indicada no existe.'));
    renderPage();
    await search();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver saldo de Ana Mora Soto' }));
    await waitFor(() => expect(screen.getAllByRole('alert').some((a) => a.textContent === 'La reserva indicada no existe.')).toBe(true));
  });
});
