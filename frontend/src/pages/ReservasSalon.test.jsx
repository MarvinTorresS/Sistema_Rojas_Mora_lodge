// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExistingHallBookings } from './ReservasSalon';
import { listHallBookings, getHallBooking, updateHallBooking, cancelHallBooking } from '../services/reservasSalonService';

vi.mock('../services/reservasSalonService', () => ({
  listHallBookings: vi.fn(), getHallBooking: vi.fn(), updateHallBooking: vi.fn(), cancelHallBooking: vi.fn(),
  checkHallAvailability: vi.fn(), createHallBooking: vi.fn(),
}));
const booking = {
  bookingId: 8, startDatetime: '2026-09-25T15:00:00Z', endDatetime: '2026-09-25T21:00:00Z',
  status: 'active', originChannel: 'web', customer: { fullName: 'Kendall', phone: '88888888' },
  plan: { planId: 1, planName: 'Medio dia', price: 150000 },
  availablePlans: [{ planId: 1, planName: 'Medio dia', price: 150000 }, { planId: 2, planName: 'Dia completo', price: 250000 }],
  depositPercentage: 0.3,
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
    render(<ExistingHallBookings />);
    expect(await screen.findByText('Kendall')).toBeTruthy();
    expect(listHallBookings).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(screen.getByText('Medio dia')).toBeTruthy();
  });
  it('carga por ID al entrar a edicion', async () => {
    render(<ExistingHallBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    expect(await screen.findByText('Editar reserva #8')).toBeTruthy();
    expect(getHallBooking).toHaveBeenCalledWith(8);
    expect(new Date(screen.getByLabelText('Inicio de la reserva').value).toISOString()).toBe(booking.startDatetime.replace('Z', '.000Z'));
  });
  it('guarda solo fechas y recarga la tabla', async () => {
    const onUpdated = vi.fn();
    render(<ExistingHallBookings onUpdated={onUpdated} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    const input = await screen.findByLabelText('Fin de la reserva');
    fireEvent.change(input, { target: { value: '2026-09-26T17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Reserva modificada correctamente.')).toBeTruthy();
    expect(updateHallBooking).toHaveBeenCalledWith(8, { startDatetime: new Date(booking.startDatetime).toISOString(), endDatetime: new Date('2026-09-26T17:00').toISOString() });
    expect(onUpdated).toHaveBeenCalledOnce();
    expect(listHallBookings).toHaveBeenCalledTimes(2);
  });
  it('cancelar no envia PATCH y volver a editar restaura las fechas originales', async () => {
    render(<ExistingHallBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    const input = await screen.findByLabelText('Inicio de la reserva');
    const original = input.value;
    fireEvent.change(input, { target: { value: '2026-09-26T17:00' } });
    fireEvent.change(screen.getByLabelText('Plan de la reserva'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }));
    expect(updateHallBooking).not.toHaveBeenCalled();
    expect(cancelHallBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Editar reserva 8' }));
    expect((await screen.findByLabelText('Inicio de la reserva')).value).toBe(original);
    expect(screen.getByLabelText('Plan de la reserva').value).toBe('1');
  });
  it('muestra precio y anticipo del plan seleccionado y envia el cambio', async () => {
    updateHallBooking.mockResolvedValue({ ...booking, pricing: { price: 250000, depositAmount: 75000, depositDifference: 30000 } });
    render(<ExistingHallBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    fireEvent.change(await screen.findByLabelText('Plan de la reserva'), { target: { value: '2' } });
    const preview = screen.getByLabelText('Vista previa del plan').textContent;
    expect(preview).toContain('250');
    expect(preview).toContain('75');
    expect(preview).toContain('No representa pagos realizados ni saldo pendiente');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Reserva modificada correctamente.');
    expect(updateHallBooking).toHaveBeenCalledWith(8, expect.objectContaining({ planId: 2 }));
    expect(screen.getByLabelText('Importes confirmados').textContent).toContain('30');
  });
  it('mantiene el borrador y muestra un conflicto al guardar', async () => {
    updateHallBooking.mockRejectedValue(new Error('Conflicto de horario'));
    render(<ExistingHallBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    await screen.findByLabelText('Inicio de la reserva');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Conflicto de horario'));
    expect(screen.getByLabelText('Inicio de la reserva')).toBeTruthy();
  });
});

describe('HU-015 confirmacion de cancelacion', () => {
  it('abrir y volver no envia peticiones de cancelacion', async () => {
    render(<ExistingHallBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva 8' }));
    expect(screen.getByRole('form', { name: 'Confirmar cancelación de reserva' })).toBeTruthy();
    expect(cancelHallBooking).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('form', { name: 'Confirmar cancelación de reserva' })).toBeNull();
    expect(cancelHallBooking).not.toHaveBeenCalled();
    expect(updateHallBooking).not.toHaveBeenCalled();
  });
  it('Escape cierra sin cancelar', async () => {
    render(<ExistingHallBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva 8' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Volver' }), { key: 'Escape' });
    expect(screen.queryByRole('form', { name: 'Confirmar cancelación de reserva' })).toBeNull();
    expect(cancelHallBooking).not.toHaveBeenCalled();
  });
  it('confirmar envia POST, recarga y deshabilita ambas acciones', async () => {
    const onUpdated = vi.fn();
    cancelHallBooking.mockResolvedValue({ bookingId: 8, status: 'cancelled' });
    render(<ExistingHallBookings onUpdated={onUpdated} />);
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
    render(<ExistingHallBookings />);
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
    render(<ExistingHallBookings />);
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
