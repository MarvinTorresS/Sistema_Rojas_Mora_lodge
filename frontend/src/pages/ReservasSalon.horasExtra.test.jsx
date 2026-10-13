// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ReservasSalon, { ExistingHallBookings } from './ReservasSalon';
import {
  checkHallAvailability, createHallBooking, getHallBooking, listHallBookings, updateHallBooking,
} from '../services/reservasSalonService';
import { listEventHallPlans } from '../services/planesSalonService';

// Horas extra del salón: el plan cubre N horas y las que se pasa el horario se
// cobran por hora extra. Archivo aparte de ReservasSalon.test.jsx (HU-014).
vi.mock('../services/reservasSalonService', () => ({
  listHallBookings: vi.fn(), getHallBooking: vi.fn(), updateHallBooking: vi.fn(), cancelHallBooking: vi.fn(),
  checkHallAvailability: vi.fn(), createHallBooking: vi.fn(),
}));
vi.mock('../services/planesSalonService', () => ({ listEventHallPlans: vi.fn() }));

const comun = {
  planId: 9, resourceId: 2, planName: 'Plan Común', hours: 2, price: 50000, includedServices: [], depositPercentage: null, extraHourPrice: 8000,
};
const fijo = {
  planId: 10, resourceId: 2, planName: 'Plan Fijo', hours: 2, price: 40000, includedServices: [], depositPercentage: null, extraHourPrice: null,
};
const largo = {
  planId: 11, resourceId: 2, planName: 'Plan Largo', hours: 8, price: 320000, includedServices: [], depositPercentage: null, extraHourPrice: null,
};
const digits = (text) => text.replace(/\D/g, '');

async function pickPlan(name) {
  fireEvent.click(await screen.findByRole('button', { name: /Seleccionar plan|^Plan /, expanded: false }));
  const list = screen.getByRole('list', { name: 'Planes disponibles' });
  fireEvent.click(within(list).getByRole('button', { name: new RegExp(name) }));
}
const rowValue = (label) => screen.getByText(label).nextSibling.textContent;

beforeEach(() => {
  vi.resetAllMocks();
  listHallBookings.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 0 } });
  listEventHallPlans.mockResolvedValue({ data: [comun, fijo, largo], meta: { total: 3 } });
  checkHallAvailability.mockResolvedValue({ available: true, reason: null });
});
afterEach(cleanup);

// El horario por defecto es de 09:00 a 13:00 (4 horas).
describe('reservar con horas extra', () => {
  it('un plan de 2 h con horario de 4 h propone 2 horas extra y suma su valor al total y al depósito', async () => {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await pickPlan('Plan Común');
    expect(screen.getByLabelText('Horas extra').value).toBe('2');
    expect(digits(screen.getByText(/Horas extra: 2 ×/).textContent)).toBe('2800016000');
    const summaryRow = screen.getByText(/^Horas extra \(2 ×/);
    expect(digits(summaryRow.textContent)).toBe('28000');
    expect(digits(summaryRow.nextSibling.textContent)).toBe('16000');
    expect(digits(rowValue('Total del evento'))).toBe('66000');
    expect(digits(rowValue('Deposito (30%)'))).toBe('19800');
  });

  it('cambiar el número de horas extra a algo que no cuadra avisa y no deja reservar', async () => {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await pickPlan('Plan Común');
    fireEvent.change(screen.getByLabelText('Horas extra'), { target: { value: '1' } });
    expect(screen.getByText('El horario dura 4 horas y el plan "Plan Común" cubre 2: agregá 2 horas extra.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    await screen.findByText('El salon esta disponible en ese horario.');
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Ana Mora' } });
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: '88887777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Para reservar falta: corregir las horas extra.');
    expect(createHallBooking).not.toHaveBeenCalled();
  });

  it('un plan sin costo por hora extra no las admite: campo bloqueado y aviso claro', async () => {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await pickPlan('Plan Fijo');
    const input = screen.getByLabelText('Horas extra');
    expect(input.disabled).toBe(true);
    expect(screen.getByText(/Este plan no admite horas extra: elegí un plan más largo o acortá el horario/)).toBeTruthy();
    expect(digits(rowValue('Total del evento'))).toBe('40000');
  });

  it('un plan que ya cubre el horario no muestra horas extra si no las admite', async () => {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await pickPlan('Plan Largo');
    expect(screen.queryByLabelText('Horas extra')).toBeNull();
  });

  it('cambiar el horario recalcula las horas extra automáticamente', async () => {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await pickPlan('Plan Común');
    fireEvent.change(screen.getByLabelText('Hora fin'), { target: { value: '16:00' } });
    expect(screen.getByLabelText('Horas extra').value).toBe('5');
    expect(digits(rowValue('Total del evento'))).toBe('90000');
    fireEvent.change(screen.getByLabelText('Hora fin'), { target: { value: '11:00' } });
    expect(screen.getByLabelText('Horas extra').value).toBe('0');
    expect(digits(rowValue('Total del evento'))).toBe('50000');
    expect(screen.queryByText(/Horas extra: /)).toBeNull();
  });

  it('envía las horas extra al reservar y la confirmación muestra el total con horas extra', async () => {
    createHallBooking.mockResolvedValue({
      booking: { bookingId: 31 }, plan: comun, extraHours: 2, extraHoursCost: 16000, totalPrice: 66000,
      depositPercentage: 0.3, depositAmount: 19800,
    });
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await pickPlan('Plan Común');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    await screen.findByText('El salon esta disponible en ese horario.');
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Ana Mora' } });
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: '88887777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(await screen.findByText('Reserva confirmada')).toBeTruthy();
    expect(createHallBooking).toHaveBeenCalledWith(expect.objectContaining({ planId: 9, extraHours: 2 }));
    expect(screen.getByText(/Horas extra \(2 ×/)).toBeTruthy();
    expect(digits(rowValue('Total del evento'))).toBe('66000');
    expect(digits(rowValue('Anticipo requerido (30%)'))).toBe('19800');
  });

  it('sin horas extra manda extraHours en 0', async () => {
    createHallBooking.mockResolvedValue({
      booking: { bookingId: 32 }, plan: largo, extraHours: 0, extraHoursCost: 0, totalPrice: 320000, depositPercentage: 0.3, depositAmount: 96000,
    });
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await pickPlan('Plan Largo');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    await screen.findByText('El salon esta disponible en ese horario.');
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Ana Mora' } });
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: '88887777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    await screen.findByText('Reserva confirmada');
    expect(createHallBooking).toHaveBeenCalledWith(expect.objectContaining({ planId: 11, extraHours: 0 }));
    expect(screen.queryByText(/Horas extra \(/)).toBeNull();
  });

  it('si el servidor rechaza las horas extra muestra su mensaje', async () => {
    createHallBooking.mockRejectedValue(new Error('El horario dura 4 horas y el plan "Plan Común" cubre 2: agregá 2 horas extra.'));
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await pickPlan('Plan Común');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    await screen.findByText('El salon esta disponible en ese horario.');
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Ana Mora' } });
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: '88887777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    await waitFor(() => expect(screen.getAllByText(/agregá 2 horas extra/).length).toBeGreaterThan(0));
  });
});

describe('editar una reserva con horas extra', () => {
  const booking = {
    bookingId: 8, startDatetime: '2026-09-25T15:00:00Z', endDatetime: '2026-09-25T17:00:00Z',
    status: 'active', originChannel: 'staff', customer: { fullName: 'Kendall', phone: '88888888' },
    plan: comun, extraHours: 0, availablePlans: [comun, fijo], depositPercentage: 0.3,
  };
  beforeEach(() => {
    listHallBookings.mockResolvedValue({ data: [booking], meta: { total: 1, totalPages: 1 } });
    getHallBooking.mockResolvedValue(booking);
    updateHallBooking.mockResolvedValue({ ...booking, pricing: { price: 74000, depositAmount: 22200, depositDifference: 7200, extraHours: 3, extraHoursCost: 24000 } });
  });

  it('alargar el horario propone las horas extra, muestra su valor y las envía', async () => {
    render(<ExistingHallBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    const end = await screen.findByLabelText('Fin de la reserva');
    const start = screen.getByLabelText('Inicio de la reserva').value;
    fireEvent.change(end, { target: { value: `${start.slice(0, 11)}${String(Number(start.slice(11, 13)) + 5).padStart(2, '0')}:00` } });
    expect(screen.getByLabelText('Horas extra de la reserva').value).toBe('3');
    const preview = screen.getByLabelText('Vista previa del plan').textContent;
    expect(digits(preview)).toContain('24000');
    expect(preview).toContain('Total con horas extra');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Reserva modificada correctamente.');
    expect(updateHallBooking).toHaveBeenCalledWith(8, expect.objectContaining({ extraHours: 3 }));
    expect(screen.getByLabelText('Importes confirmados').textContent).toContain('Incluye 3 horas extra');
  });

  it('sin cambiar nada no manda horas extra', async () => {
    render(<ExistingHallBookings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar reserva 8' }));
    await screen.findByLabelText('Fin de la reserva');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('Reserva modificada correctamente.');
    expect(updateHallBooking.mock.calls[0][1]).not.toHaveProperty('extraHours');
  });

  it('la tabla indica cuántas horas extra tiene cada reserva', async () => {
    listHallBookings.mockResolvedValue({ data: [{ ...booking, extraHours: 2 }], meta: { total: 1, totalPages: 1 } });
    render(<ExistingHallBookings />);
    expect(await screen.findByText('+2 h extra')).toBeTruthy();
  });
});
