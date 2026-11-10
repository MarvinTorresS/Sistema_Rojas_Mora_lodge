// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup, fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import ReservasSalon from './ReservasSalon';
import {
  checkHallAvailability, createHallBooking, getHallSchedule, listHallBookings,
} from '../services/reservasSalonService';
import { localIsoDate } from '../utils/hallSchedule';

// Sprint 4 (Alison): los datos del cliente del salón se piden en el mismo
// cuadro "Nueva reserva / Un último paso" de la cancha, que abre
// "Continuar con la reserva" y que debe quedar totalmente funcional. El salón
// se reserva por día (entrada y salida fijas): no hay planes ni precios.
vi.mock('../services/reservasSalonService', () => ({
  listHallBookings: vi.fn(), getHallBooking: vi.fn(), updateHallBooking: vi.fn(), cancelHallBooking: vi.fn(),
  checkHallAvailability: vi.fn(), createHallBooking: vi.fn(), getHallSchedule: vi.fn(),
}));

const SCHEDULE = { checkInTime: '15:00', checkOutTime: '20:00' };
const created = { booking: { bookingId: 31 }, date: localIsoDate(1), ...SCHEDULE };

async function reachAvailability() {
  render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar disponibilidad' }));
  await screen.findByText('El salon esta disponible ese dia.');
}
const continuar = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar con la reserva' }));
const fill = (name, phone) => {
  fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: phone } });
};

beforeEach(() => {
  vi.resetAllMocks();
  listHallBookings.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 0 } });
  getHallSchedule.mockResolvedValue(SCHEDULE);
  checkHallAvailability.mockResolvedValue({ available: true, reason: null, ...SCHEDULE });
});
afterEach(cleanup);

describe('Salón por día: sin planes', () => {
  it('no hay selector de plan, enlace a Planes, horas, horas extra ni precios', async () => {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Consultar disponibilidad' });
    expect(screen.queryByRole('link', { name: 'Planes' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Seleccionar plan/ })).toBeNull();
    for (const label of ['Hora inicio', 'Hora fin', 'Horas extra']) expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.queryByText(/Total del evento|Deposito|Anticipo|Precio del plan/)).toBeNull();
    expect(screen.getByLabelText('Fecha').value).toBe(localIsoDate(1));
    expect(screen.getByLabelText('Fecha').min).toBe(localIsoDate(1));
  });

  it('muestra la hora de entrada y de salida fijas (3:00 p. m. y 8:00 p. m. por defecto)', async () => {
    getHallSchedule.mockRejectedValue(new Error('sin conexión'));
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    const times = await screen.findByLabelText('Horario del salón');
    expect(times.textContent).toContain('3:00 p. m.');
    expect(times.textContent).toContain('8:00 p. m.');
    const summary = screen.getByRole('region', { name: 'Resumen de la reserva' });
    expect(within(summary).getByText('Entrada').nextSibling.textContent).toBe('3:00 p. m.');
    expect(within(summary).getByText('Salida').nextSibling.textContent).toBe('8:00 p. m.');
  });

  it('usa el horario que define el servidor', async () => {
    getHallSchedule.mockResolvedValue({ checkInTime: '14:00', checkOutTime: '19:30' });
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Horario del salón').textContent).toContain('2:00 p. m.'));
    expect(screen.getByLabelText('Horario del salón').textContent).toContain('7:30 p. m.');
  });

  it('consulta la disponibilidad solo con el día', async () => {
    await reachAvailability();
    expect(checkHallAvailability).toHaveBeenCalledWith({ resourceId: 2, date: localIsoDate(1) });
  });

  it('cambiar el día invalida una disponibilidad ya consultada', async () => {
    await reachAvailability();
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: localIsoDate(3) } });
    expect(screen.queryByText('El salon esta disponible ese dia.')).toBeNull();
    expect(screen.getByText('Falta consultar disponibilidad')).toBeTruthy();
  });

  it('sin fecha no consulta nada y lo dice', async () => {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    expect(await screen.findByText('Elegí la fecha de la reserva.')).toBeTruthy();
    expect(checkHallAvailability).not.toHaveBeenCalled();
  });

  it('un día ocupado se informa y no deja continuar', async () => {
    checkHallAvailability.mockResolvedValue({ available: false, reason: 'El salon ya tiene una reserva confirmada ese dia.', ...SCHEDULE });
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar disponibilidad' }));
    await screen.findByText('El salon ya tiene una reserva confirmada ese dia.');
    expect(screen.getByText('✕ No disponible')).toBeTruthy();
    continuar();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await screen.findByRole('alert')).textContent).toBe('Para continuar falta: consultar la disponibilidad.');
  });
});

describe('Continuar con la reserva (salón)', () => {
  it('ya no hay datos del cliente sueltos en la página: aparecen solo en el cuadro', async () => {
    await reachAvailability();
    expect(screen.queryByLabelText('Nombre del cliente')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar reserva' })).toBeNull();
    continuar();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Nueva reserva')).toBeTruthy();
    expect(within(dialog).getByText('Un último paso')).toBeTruthy();
    expect(within(dialog).getByLabelText('Nombre del cliente')).toBeTruthy();
    expect(within(dialog).getByLabelText('Teléfono')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Registrar reserva' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeTruthy();
  });

  it('el cuadro repite el día y la entrada y salida elegidas, sin plan ni precio', async () => {
    await reachAvailability();
    continuar();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Fecha y horario elegidos')).toBeTruthy();
    expect(within(dialog).getByText(/Entrada 3:00 p. m. · Salida 8:00 p. m./)).toBeTruthy();
    expect(within(dialog).queryByText(/anticipo|₡/i)).toBeNull();
  });

  it('sin disponibilidad consultada no abre el cuadro y explica qué falta', async () => {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Consultar disponibilidad' });
    continuar();
    expect((await screen.findByRole('alert')).textContent).toBe('Para continuar falta: consultar la disponibilidad.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sin fecha explica que falta elegirla', async () => {
    render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Fecha'), { target: { value: '' } });
    continuar();
    expect((await screen.findByRole('alert')).textContent).toBe('Para continuar falta: elegir la fecha.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Registrar reserva sin datos avisa y no envía nada; el cuadro sigue abierto', async () => {
    await reachAvailability();
    continuar();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reserva' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Para reservar falta: el nombre del cliente y el teléfono del cliente.');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(createHallBooking).not.toHaveBeenCalled();
  });

  it('registra la reserva del día, cierra el cuadro y muestra la confirmación con entrada y salida', async () => {
    createHallBooking.mockResolvedValue(created);
    await reachAvailability();
    continuar();
    fill('Ana Mora', '8888-7777');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reserva' }));
    expect(await screen.findByText('Reserva confirmada')).toBeTruthy();
    expect(createHallBooking).toHaveBeenCalledWith({
      resourceId: 2, customerName: 'Ana Mora', customerPhone: '88887777', date: localIsoDate(1),
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Reserva #31 registrada correctamente.')).toBeTruthy();
    const receipt = document.querySelector('.bmb-receipt');
    expect(within(receipt).getByText('Entrada').nextSibling.textContent).toBe('3:00 p. m.');
    expect(within(receipt).getByText('Salida').nextSibling.textContent).toBe('8:00 p. m.');
    expect(screen.queryByText(/Anticipo/)).toBeNull();
  });

  it('Cancelar descarta los datos del cliente y cierra; al volver a continuar está vacío', async () => {
    await reachAvailability();
    continuar();
    fill('Ana Mora', '88887777');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(createHallBooking).not.toHaveBeenCalled();
    continuar();
    expect(screen.getByLabelText('Nombre del cliente').value).toBe('');
    expect(screen.getByLabelText('Teléfono').value).toBe('');
  });

  it('la X cierra sin perder lo escrito', async () => {
    await reachAvailability();
    continuar();
    fill('Ana Mora', '88887777');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar nueva reserva' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    continuar();
    expect(screen.getByLabelText('Nombre del cliente').value).toBe('Ana Mora');
  });

  it('un error del servidor se ve dentro del cuadro y se puede reintentar', async () => {
    createHallBooking.mockRejectedValueOnce(new Error('El salon ya tiene una reserva ese dia.')).mockResolvedValueOnce(created);
    await reachAvailability();
    continuar();
    fill('Ana Mora', '88887777');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reserva' }));
    const alert = await screen.findByRole('alert');
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toBe(alert);
    expect(alert.textContent).toBe('El salon ya tiene una reserva ese dia.');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reserva' }));
    expect(await screen.findByText('Reserva confirmada')).toBeTruthy();
  });

  it('mientras guarda deshabilita Registrar, Cancelar y cerrar (sin doble envío)', async () => {
    let finish;
    createHallBooking.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await reachAvailability();
    continuar();
    fill('Ana Mora', '88887777');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reserva' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardando…' }).disabled).toBe(true));
    expect(screen.getByRole('button', { name: 'Cancelar' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Cerrar nueva reserva' }).disabled).toBe(true);
    fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
    expect(createHallBooking).toHaveBeenCalledTimes(1);
    finish(created);
    expect(await screen.findByText('Reserva confirmada')).toBeTruthy();
  });

  it('"Registrar otra reserva" vuelve al resumen con el botón de continuar', async () => {
    createHallBooking.mockResolvedValue(created);
    await reachAvailability();
    continuar();
    fill('Ana Mora', '88887777');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar reserva' }));
    await screen.findByText('Reserva confirmada');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar otra reserva' }));
    expect(screen.getByRole('button', { name: 'Continuar con la reserva' })).toBeTruthy();
    expect(screen.getByText('Falta consultar disponibilidad')).toBeTruthy();
  });
});
