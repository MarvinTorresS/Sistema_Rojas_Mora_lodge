// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExistingHallBookings } from './ReservasSalon';
import { listHallBookings, getHallBooking, updateHallBooking, cancelHallBooking } from '../services/reservasSalonService';
import { localIsoDate } from '../utils/hallSchedule';

vi.mock('../services/reservasSalonService', () => ({
  listHallBookings: vi.fn(), getHallBooking: vi.fn(), updateHallBooking: vi.fn(), cancelHallBooking: vi.fn(),
  checkHallAvailability: vi.fn(), createHallBooking: vi.fn(),
}));
// Fechas futuras: el campo de fecha de la edicion no admite dias pasados.
const DAY = localIsoDate(3);
const NEXT_DAY = localIsoDate(4);
const booking = {
  bookingId: 8, date: DAY, startDatetime: '2026-09-25T21:00:00Z', endDatetime: '2026-09-26T02:00:00Z',
  status: 'active', originChannel: 'web', customer: { fullName: 'Kendall', phone: '88888888' },
  checkInTime: '15:00', checkOutTime: '20:00',
};
beforeEach(() => {
  vi.resetAllMocks();
  listHallBookings.mockResolvedValue({ data: [booking], meta: { total: 1, totalPages: 1 } });
  getHallBooking.mockResolvedValue(booking);
  updateHallBooking.mockResolvedValue(booking);
});
afterEach(cleanup);

describe('HU-014 interfaz de reservas existentes', () => {
  it('carga reservas al entrar sin depender de una creacion previa', async () => {
    render(<ExistingHallBookings initialView="all" />);
    expect(await screen.findByText('Kendall')).toBeTruthy();
    expect(listHallBookings).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
  });
  it('la tabla muestra entrada y salida del dia, sin plan', async () => {
    render(<ExistingHallBookings initialView="all" />);
    await screen.findByText('Kendall');
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Reserva', 'Cliente', 'Teléfono', 'Fecha', 'Entrada', 'Salida', 'Estado', 'Origen', 'Acciones']);
    expect(headers).not.toContain('Plan');
  });
  it('carga por ID al entrar a edicion', async () => {
    render(<ExistingHallBookings initialView="all" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    expect(await screen.findByText('Editar reserva #8')).toBeTruthy();
    expect(getHallBooking).toHaveBeenCalledWith(8);
    expect(screen.getByLabelText('Fecha de la reserva').value).toBe(DAY);
  });
  it('la edicion solo cambia el dia: muestra el horario fijo y no hay plan, horas extra ni precios', async () => {
    render(<ExistingHallBookings initialView="all" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    const schedule = (await screen.findByLabelText('Horario de la reserva')).textContent;
    expect(schedule).toContain('3:00 p. m.');
    expect(schedule).toContain('8:00 p. m.');
    expect(screen.queryByLabelText('Plan de la reserva')).toBeNull();
    expect(screen.queryByLabelText('Horas extra de la reserva')).toBeNull();
    expect(screen.queryByLabelText('Inicio de la reserva')).toBeNull();
    expect(screen.queryByText(/anticipo|precio/i)).toBeNull();
  });
  it('guarda solo la fecha y recarga la tabla', async () => {
    const onUpdated = vi.fn();
    render(<ExistingHallBookings initialView="all" onUpdated={onUpdated} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    const input = await screen.findByLabelText('Fecha de la reserva');
    fireEvent.change(input, { target: { value: NEXT_DAY } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Reserva modificada correctamente.')).toBeTruthy();
    expect(updateHallBooking).toHaveBeenCalledWith(8, { date: NEXT_DAY });
    expect(onUpdated).toHaveBeenCalledOnce();
    expect(listHallBookings).toHaveBeenCalledTimes(2);
  });
  it('cancelar la edicion no envia PATCH y volver a editar restaura la fecha original', async () => {
    render(<ExistingHallBookings initialView="all" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    const input = await screen.findByLabelText('Fecha de la reserva');
    fireEvent.change(input, { target: { value: localIsoDate(5) } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }));
    expect(updateHallBooking).not.toHaveBeenCalled();
    expect(cancelHallBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Editar reserva 8' }));
    expect((await screen.findByLabelText('Fecha de la reserva')).value).toBe(DAY);
  });
  it('sin fecha no se puede guardar', async () => {
    render(<ExistingHallBookings initialView="all" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    fireEvent.change(await screen.findByLabelText('Fecha de la reserva'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Guardar cambios' }).disabled).toBe(true);
  });
  it('mantiene el borrador y muestra un conflicto al guardar', async () => {
    updateHallBooking.mockRejectedValue(new Error('El salon ya tiene una reserva ese dia.'));
    render(<ExistingHallBookings initialView="all" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    fireEvent.change(await screen.findByLabelText('Fecha de la reserva'), { target: { value: NEXT_DAY } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('El salon ya tiene una reserva ese dia.'));
    expect(screen.getByLabelText('Fecha de la reserva').value).toBe(NEXT_DAY);
  });
});

describe('HU-015 confirmacion de cancelacion', () => {
  it('abrir y volver no envia peticiones de cancelacion', async () => {
    render(<ExistingHallBookings initialView="all" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva 8' }));
    expect(screen.getByRole('form', { name: 'Confirmar cancelación de reserva' })).toBeTruthy();
    expect(cancelHallBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('form', { name: 'Confirmar cancelación de reserva' })).toBeNull();
    expect(cancelHallBooking).not.toHaveBeenCalled();
    expect(updateHallBooking).not.toHaveBeenCalled();
  });
  it('Escape cierra sin cancelar', async () => {
    render(<ExistingHallBookings initialView="all" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva 8' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Volver' }), { key: 'Escape' });
    expect(screen.queryByRole('form', { name: 'Confirmar cancelación de reserva' })).toBeNull();
    expect(cancelHallBooking).not.toHaveBeenCalled();
  });
  it('confirmar envia POST, recarga y deshabilita ambas acciones', async () => {
    const onUpdated = vi.fn();
    cancelHallBooking.mockResolvedValue({ bookingId: 8, status: 'cancelled' });
    render(<ExistingHallBookings initialView="all" onUpdated={onUpdated} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva 8' }));
    listHallBookings.mockResolvedValue({ data: [{ ...booking, status: 'cancelled' }], meta: { total: 1, totalPages: 1 } });
    fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: 'Cliente desiste' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
    await screen.findByText('Reserva cancelada correctamente. No se ha realizado ninguna devolución.');
    expect(cancelHallBooking).toHaveBeenCalledTimes(1);
    expect(cancelHallBooking).toHaveBeenCalledWith(8, { cancellationReason: 'Cliente desiste' });
    expect(onUpdated).toHaveBeenCalledOnce();
    expect(listHallBookings).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Cancelada')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar reserva 8' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancelar reserva 8' }).disabled).toBe(true);
  });
  it('muestra error y conserva la confirmacion para volver', async () => {
    cancelHallBooking.mockRejectedValue(new Error('La reserva ya se encuentra cancelada.'));
    render(<ExistingHallBookings initialView="all" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva 8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelación' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('La reserva ya se encuentra cancelada.');
    expect(screen.getByRole('button', { name: 'Volver' }).disabled).toBe(false);
    expect(updateHallBooking).not.toHaveBeenCalled();
  });
  it('impide doble envio mientras la peticion esta pendiente', async () => {
    let resolve;
    cancelHallBooking.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<ExistingHallBookings initialView="all" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva 8' }));
    const form = screen.getByRole('form', { name: 'Confirmar cancelación de reserva' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(cancelHallBooking).toHaveBeenCalledTimes(1);
    listHallBookings.mockResolvedValue({ data: [{ ...booking, status: 'cancelled' }], meta: { total: 1, totalPages: 1 } });
    resolve({ bookingId: 8, status: 'cancelled' });
    await screen.findByText('Reserva cancelada correctamente. No se ha realizado ninguna devolución.');
  });
});
