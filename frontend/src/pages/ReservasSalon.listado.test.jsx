// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import { ExistingHallBookings } from './ReservasSalon';
import { listHallBookings, getHallBooking, cancelHallBooking } from '../services/reservasSalonService';

// Sprint 4 (Alison): "Reservas existentes" del salón con la presentación del
// listado de la cancha (pestañas, recientes/archivo por semana, paginación).
vi.mock('../services/reservasSalonService', () => ({
  listHallBookings: vi.fn(), getHallBooking: vi.fn(), updateHallBooking: vi.fn(), cancelHallBooking: vi.fn(),
  checkHallAvailability: vi.fn(), createHallBooking: vi.fn(),
}));

const make = (id, overrides = {}) => ({
  bookingId: id, startDatetime: '2026-10-14T15:00:00Z', endDatetime: '2026-10-14T21:00:00Z', status: 'active', originChannel: 'staff',
  date: '2026-10-14', customer: { fullName: `Cliente ${id}`, phone: '88880000' },
  ...overrides,
});
const page = (data, meta = {}) => ({ data, meta: { page: 1, total: data.length, totalPages: data.length ? 1 : 0, ...meta } });
const lastParams = () => listHallBookings.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.resetAllMocks();
  listHallBookings.mockResolvedValue(page([make(8)]));
  getHallBooking.mockResolvedValue({ ...make(8), checkInTime: '15:00', checkOutTime: '20:00' });
});
afterEach(cleanup);

describe('Reservas del día', () => {
  it('abre en "Reservas del día" y consulta solo la fecha elegida', async () => {
    render(<ExistingHallBookings date="2026-10-14" />);
    expect(await screen.findByText('Cliente 8')).toBeTruthy();
    expect(lastParams()).toMatchObject({ date: '2026-10-14' });
    expect(screen.getByRole('tab', { name: 'Reservas del día', selected: true })).toBeTruthy();
    expect(screen.getByText(/Entrada .* Salida/)).toBeTruthy();
    expect(screen.queryByText(/Medio dia|extra/)).toBeNull();
  });

  it('ordena por hora y no muestra las canceladas', async () => {
    listHallBookings.mockResolvedValue(page([
      make(2, { startDatetime: '2026-10-14T20:00:00Z', endDatetime: '2026-10-14T22:00:00Z' }),
      make(1, { startDatetime: '2026-10-14T14:00:00Z', endDatetime: '2026-10-14T16:00:00Z' }),
      make(3, { status: 'cancelled' }),
    ]));
    render(<ExistingHallBookings date="2026-10-14" />);
    await screen.findByText('Cliente 1');
    const names = screen.getAllByText(/^Cliente \d$/).map((node) => node.textContent);
    expect(names).toEqual(['Cliente 1', 'Cliente 2']);
  });

  it('sin reservas lo dice y vuelve a consultar al cambiar de fecha', async () => {
    listHallBookings.mockResolvedValue(page([]));
    const { rerender } = render(<ExistingHallBookings date="2026-10-14" />);
    expect(await screen.findByText('Sin reservas registradas para este día.')).toBeTruthy();
    rerender(<ExistingHallBookings date="2026-10-15" />);
    await waitFor(() => expect(lastParams()).toMatchObject({ date: '2026-10-15' }));
  });

  it('muestra el error y permite reintentar', async () => {
    listHallBookings.mockRejectedValueOnce(new Error('No se pudieron cargar las reservas del salón.'));
    render(<ExistingHallBookings date="2026-10-14" />);
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudieron cargar las reservas del salón.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Cliente 8')).toBeTruthy();
  });

  it('editar y cancelar se hacen en cuadros, también desde esta pestaña', async () => {
    render(<ExistingHallBookings date="2026-10-14" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    const edit = await screen.findByRole('dialog');
    expect(within(edit).getByText('Editar reserva #8')).toBeTruthy();
    fireEvent.click(within(edit).getByRole('button', { name: 'Cancelar edición' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva 8' }));
    const cancel = await screen.findByRole('dialog');
    expect(within(cancel).getByRole('form', { name: 'Confirmar cancelación de reserva' })).toBeTruthy();
    fireEvent.click(within(cancel).getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cancelHallBooking).not.toHaveBeenCalled();
  });

  it('el error de cancelar se ve dentro del cuadro', async () => {
    cancelHallBooking.mockRejectedValue(new Error('La reserva ya se encuentra cancelada.'));
    render(<ExistingHallBookings date="2026-10-14" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva 8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
    const alert = await screen.findByRole('alert');
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toBe(alert);
  });
});

describe('Todas las reservas', () => {
  const go = async () => {
    render(<ExistingHallBookings date="2026-10-14" />);
    await screen.findByText('Cliente 8');
    fireEvent.click(screen.getByRole('tab', { name: 'Todas las reservas' }));
  };

  it('recientes y próximas: desde hace siete días, con columnas de la cancha y paginación', async () => {
    listHallBookings.mockResolvedValue(page([make(8), make(9, { status: 'cancelled' })], { total: 45, totalPages: 3 }));
    await go();
    expect(await screen.findByText('45 reservas registradas')).toBeTruthy();
    const params = lastParams();
    expect(params).toMatchObject({ page: 1, pageSize: 20 });
    expect(params.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.dateBefore).toBeUndefined();
    ['Reserva', 'Cliente', 'Teléfono', 'Fecha', 'Entrada', 'Salida', 'Estado', 'Origen', 'Acciones']
      .forEach((label) => expect(screen.getByRole('columnheader', { name: label })).toBeTruthy());
    expect(screen.queryByRole('columnheader', { name: 'Plan' })).toBeNull();
    expect(screen.getByText('Cancelada')).toBeTruthy();
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
    expect(screen.getByRole('button', { name: 'Anterior' }).disabled).toBe(false);
  });

  it('archivo por semana: acota con dateFrom/dateBefore y retrocede de a una semana', async () => {
    await go();
    await screen.findByText('1 reservas registradas');
    const recent = lastParams().dateFrom;
    fireEvent.click(screen.getByRole('button', { name: 'Archivo por semana' }));
    await waitFor(() => expect(lastParams().dateBefore).toBe(recent));
    const first = lastParams();
    expect(Date.parse(first.dateBefore) - Date.parse(first.dateFrom)).toBe(7 * 24 * 3600 * 1000);
    expect(screen.getByRole('button', { name: 'Semana siguiente →' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '← Semana anterior' }));
    await waitFor(() => expect(lastParams().dateBefore).toBe(first.dateFrom));
    expect(screen.getByRole('button', { name: 'Semana siguiente →' }).disabled).toBe(false);
  });

  it('sin reservas ofrece registrar una', async () => {
    const onRegister = vi.fn();
    listHallBookings.mockResolvedValue(page([make(8)]));
    render(<ExistingHallBookings date="2026-10-14" onRegister={onRegister} />);
    await screen.findByText('Cliente 8');
    listHallBookings.mockResolvedValue(page([]));
    fireEvent.click(screen.getByRole('tab', { name: 'Todas las reservas' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar reserva' }));
    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it('las flechas y el teclado alternan las pestañas', async () => {
    await go();
    expect(screen.getByRole('tab', { name: 'Todas las reservas', selected: true })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Reservas del día', selected: true })).toBeTruthy();
  });
});
