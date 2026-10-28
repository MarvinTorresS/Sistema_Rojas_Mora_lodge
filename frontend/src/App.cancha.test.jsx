// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { createFieldBooking, listFieldBookings, searchFieldBookings, filterFieldBookingsByStatus, updateFieldBooking, cancelFieldBooking } from './services/reservasCanchaService';
import { shiftFieldDate } from './components/FieldDateStrip';

vi.mock('./services/reservasCanchaService', () => ({ createFieldBooking: vi.fn(), listFieldBookings: vi.fn(), searchFieldBookings: vi.fn(), filterFieldBookingsByStatus: vi.fn(), updateFieldBooking: vi.fn(), cancelFieldBooking: vi.fn() }));
const empty = { data: [], meta: { page: 1, total: 0, totalPages: 0 } };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.resetAllMocks();
  listFieldBookings.mockResolvedValue(empty); searchFieldBookings.mockResolvedValue(empty); filterFieldBookingsByStatus.mockResolvedValue(empty);
  window.history.replaceState({}, '', '/cancha');
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

it('registra un tramo de dos horas reales desde el boceto y conserva el regreso a elegir espacio', async () => {
  createFieldBooking.mockResolvedValue({ bookingId: 80 });
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Cancha sintética La Bombonera' })).toBeTruthy();
  const date = shiftFieldDate(screen.getByLabelText('Fecha').min, 1);
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: date } });
  const first = screen.getByRole('button', { name: /3:00.*4:00.*Reservar$/ });
  await waitFor(() => expect(first.disabled).toBe(false));
  fireEvent.click(first);
  fireEvent.click(screen.getByRole('button', { name: /4:00.*5:00.*Reservar$/ }));
  expect(within(screen.getByRole('region', { name: 'Resumen de la reserva' })).getByText(/36[.,\s]?000/)).toBeTruthy();
  screen.getByRole('button', { name: 'Continuar con la reserva' }).focus();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar con la reserva' }));
  expect(screen.getByRole('dialog', { name: 'Nueva reserva' })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByLabelText('Nombre del cliente'));
  fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Wagner Borrador' } });
  fireEvent(screen.getByRole('dialog', { name: 'Nueva reserva' }), new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Continuar con la reserva' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar con la reserva' }));
  expect(screen.getByLabelText('Nombre del cliente').value).toBe('Wagner Borrador');

  fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Wagner Prueba' } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '80009900' } });
  fireEvent.click(screen.getByRole('button', { name: 'Registrar reserva' }));
  expect(await screen.findByText('Reserva registrada correctamente.')).toBeTruthy();
  const [payload] = createFieldBooking.mock.calls[0];
  expect(new Date(payload.endDatetime) - new Date(payload.startDatetime)).toBe(2 * 3600000);
  expect(payload).toMatchObject({ resourceId: 1, customerName: 'Wagner Prueba', customerPhone: '80009900' });
  fireEvent.click(screen.getByRole('link', { name: 'Volver a elegir espacio' }));
  expect(window.location.pathname).toBe('/reservar');
  expect(await screen.findByRole('heading', { name: 'Nueva reserva' })).toBeTruthy();
});

it('mantiene la busqueda, edicion y cancelacion de reservas del equipo con el router real', async () => {
  const booking = { bookingId: 42, status: 'active', startDatetime: '2099-10-29T21:00:00Z', endDatetime: '2099-10-29T22:00:00Z', customer: { fullName: 'Ana Prueba', phone: '80009900' }, resource: { name: 'Cancha existente' } };
  searchFieldBookings.mockResolvedValue({ data: [booking], meta: { page: 1, total: 1, totalPages: 1 } });
  updateFieldBooking.mockResolvedValue(booking); cancelFieldBooking.mockResolvedValue({ ...booking, status: 'cancelled' });
  render(<App />);
  fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'Ana' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 42' }));
  expect(screen.getByLabelText('Inicio de la reserva')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('Reserva modificada correctamente.');
  expect(updateFieldBooking).toHaveBeenCalledWith(42, expect.objectContaining({ startDatetime: expect.any(String), endDatetime: expect.any(String) }));
  fireEvent.click(screen.getByRole('button', { name: 'Editar reserva 42' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
  fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: 'Cancelacion ficticia para prueba' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
  expect(cancelFieldBooking).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sí' }));
  await waitFor(() => expect(cancelFieldBooking).toHaveBeenCalledWith(42, expect.objectContaining({ reason: 'Cancelacion ficticia para prueba' })));
});

it('cancela desde el listado con justificación y confirmación en una ventana', async () => {
  const booking = { bookingId: 92, status: 'active', startDatetime: '2099-10-29T21:00:00Z', endDatetime: '2099-10-29T22:00:00Z', customer: { fullName: 'Reserva de prueba', phone: '88881111' } };
  listFieldBookings.mockImplementation(async ({ date }) => date ? empty : { data: [booking], meta: { page: 1, total: 1, totalPages: 1 } });
  cancelFieldBooking.mockResolvedValue({ ...booking, status: 'cancelled' });
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: 'Todas las reservas' }));
  const action = await screen.findByRole('button', { name: 'Cancelar reserva 92' });
  action.focus();
  fireEvent.click(action);
  let dialog = screen.getByRole('dialog', { name: 'Cancelar reserva' });
  expect(within(dialog).getByRole('button', { name: 'Confirmar' }).disabled).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('Motivo de cancelación'), { target: { value: 'El cliente solicita cancelar' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
  expect(cancelFieldBooking).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'No' }));
  expect(within(dialog).getByLabelText('Motivo de cancelación').value).toBe('El cliente solicita cancelar');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sí' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(cancelFieldBooking).toHaveBeenCalledWith(92, { reason: 'El cliente solicita cancelar', role: undefined });
  expect(await screen.findByText('Reserva cancelada correctamente.')).toBeTruthy();
});
