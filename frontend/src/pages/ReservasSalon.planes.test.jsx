// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ReservasSalon from './ReservasSalon';
import { checkHallAvailability, createHallBooking, listHallBookings } from '../services/reservasSalonService';
import { listEventHallPlans } from '../services/planesSalonService';

// HU-009: la pantalla del salón lee los planes del catálogo en vez
// de una lista fija; los planes se eligen en un desplegable junto a
// "Plan y horario", sin plan elegido por defecto. Archivo aparte de ReservasSalon.test.jsx (HU-014) para
// no mezclar las pruebas de cada quien.
vi.mock('../services/reservasSalonService', () => ({
  listHallBookings: vi.fn(), getHallBooking: vi.fn(), updateHallBooking: vi.fn(), cancelHallBooking: vi.fn(),
  checkHallAvailability: vi.fn(), createHallBooking: vi.fn(),
}));
vi.mock('../services/planesSalonService', () => ({ listEventHallPlans: vi.fn() }));

const catalog = [
  {
    planId: 7, resourceId: 2, planName: 'Plan Boda', hours: 8, price: 320000, includedServices: [], depositPercentage: null,
  },
  {
    planId: 8, resourceId: 2, planName: 'Plan Cumple', hours: 4, price: 90000, includedServices: [], depositPercentage: null,
  },
];

function renderPage() {
  return render(<MemoryRouter><ReservasSalon /></MemoryRouter>);
}

const openPicker = async () => {
  const trigger = await screen.findByRole('button', { name: /Seleccionar plan|Plan (Boda|Cumple)/ });
  fireEvent.click(trigger);
  return screen.getByRole('list', { name: 'Planes disponibles' });
};

async function checkAvailable() {
  fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
  await screen.findByText('El salon esta disponible en ese horario.');
}

beforeEach(() => {
  vi.resetAllMocks();
  listHallBookings.mockResolvedValue({ data: [], meta: { total: 0, totalPages: 0 } });
  listEventHallPlans.mockResolvedValue({ data: catalog, meta: { total: 2 } });
  checkHallAvailability.mockResolvedValue({ available: true, reason: null });
});
afterEach(cleanup);

describe('Pantalla del salón con planes del catálogo (HU-009)', () => {
  it('no trae ningún plan seleccionado por defecto', async () => {
    renderPage();
    const trigger = await screen.findByRole('button', { name: /Seleccionar plan/ });
    await waitFor(() => expect(listEventHallPlans).toHaveBeenCalledWith({ resourceId: 2 }));
    expect(trigger.disabled).toBe(false);
    expect(screen.getByText('Plan sin elegir')).toBeTruthy();
    // Con el desplegable cerrado no se ven los planes en pantalla.
    expect(screen.queryByRole('list', { name: 'Planes disponibles' })).toBeNull();
  });

  it('el desplegable lista los planes del catálogo, sin pre-seleccionar', async () => {
    renderPage();
    const list = await openPicker();
    expect(within(list).getByRole('button', { name: /Plan Boda/ }).getAttribute('aria-pressed')).toBe('false');
    expect(within(list).getByRole('button', { name: /Plan Cumple/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('Medio dia (6 horas)')).toBeNull();
  });

  it('elegir un plan lo marca, cierra la lista y actualiza el resumen', async () => {
    renderPage();
    const list = await openPicker();
    fireEvent.click(within(list).getByRole('button', { name: /Plan Cumple/ }));
    expect(screen.queryByRole('list', { name: 'Planes disponibles' })).toBeNull();
    const trigger = screen.getByRole('button', { name: /Plan Cumple/ });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Total del evento').nextSibling.textContent.replace(/\D/g, '')).toBe('90000');
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: /Plan Cumple/, pressed: true })).toBeTruthy();
  });

  it('cada plan tiene "Más información" hacia su detalle en Planes', async () => {
    renderPage();
    const list = await openPicker();
    expect(within(list).getByRole('link', { name: 'Más información de Plan Boda' }).getAttribute('href')).toBe('/salon/planes?plan=7');
    expect(within(list).getByRole('link', { name: 'Más información de Plan Cumple' }).getAttribute('href')).toBe('/salon/planes?plan=8');
  });

  it('Escape y click fuera cierran el desplegable', async () => {
    renderPage();
    await openPicker();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('list', { name: 'Planes disponibles' })).toBeNull();
    await openPicker();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('list', { name: 'Planes disponibles' })).toBeNull();
  });

  it('si la API no responde conserva la lista de respaldo', async () => {
    listEventHallPlans.mockRejectedValue(new Error('sin red'));
    renderPage();
    await waitFor(() => expect(listEventHallPlans).toHaveBeenCalled());
    const list = await openPicker();
    expect(within(list).getByRole('button', { name: /Medio dia \(6 horas\)/ })).toBeTruthy();
    expect(within(list).getByRole('button', { name: /Dia completo \(12 horas\)/ })).toBeTruthy();
  });

  it('sin planes registrados lo dice y no deja confirmar', async () => {
    listEventHallPlans.mockResolvedValue({ data: [], meta: { total: 0 } });
    renderPage();
    expect(await screen.findByText(/Todavia no hay planes registrados/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Seleccionar plan/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Confirmar reserva' }).disabled).toBe(true);
  });

  it('ofrece el acceso a la pantalla de planes', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: 'Planes' });
    expect(link.getAttribute('href')).toBe('/salon/planes');
  });
});

describe('Orden de la pantalla', () => {
  it('muestra primero el formulario de reserva y al final las reservas existentes', async () => {
    renderPage();
    const form = (await screen.findByRole('button', { name: 'Confirmar reserva' })).closest('form');
    const existing = screen.getByRole('region', { name: 'Administrar reservas existentes' });
    expect(form.compareDocumentPosition(existing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(existing.parentElement.lastElementChild).toBe(existing);
  });
});

describe('Aviso de campos incompletos al reservar', () => {
  it('sin plan ni disponibilidad avisa qué falta y no envía nada', async () => {
    renderPage();
    await screen.findByRole('button', { name: /Seleccionar plan/ });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Para reservar falta: elegir un plan y consultar la disponibilidad.');
    expect(screen.getByText('Elegí un plan para poder reservar.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Seleccionar plan/ }).getAttribute('aria-invalid')).toBe('true');
    expect(createHallBooking).not.toHaveBeenCalled();
  });

  it('no deja consultar la disponibilidad sin plan: avisa y no llama a la API', async () => {
    renderPage();
    await screen.findByRole('button', { name: /Seleccionar plan/ });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    expect(await screen.findByText('Elegí un plan antes de consultar la disponibilidad.')).toBeTruthy();
    expect(checkHallAvailability).not.toHaveBeenCalled();
    const trigger = screen.getByRole('button', { name: /Seleccionar plan/ });
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByText('El salon esta disponible en ese horario.')).toBeNull();
  });

  it('al elegir el plan desaparece el aviso y ya se puede consultar', async () => {
    renderPage();
    await screen.findByRole('button', { name: /Seleccionar plan/ });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar disponibilidad' }));
    const list = await openPicker();
    fireEvent.click(within(list).getByRole('button', { name: /Plan Boda/ }));
    expect(screen.queryByText('Elegí un plan antes de consultar la disponibilidad.')).toBeNull();
    await checkAvailable();
    expect(checkHallAvailability).toHaveBeenCalledTimes(1);
  });

  it('avisa nombre y teléfono incompletos junto a cada campo', async () => {
    renderPage();
    await screen.findByRole('button', { name: /Seleccionar plan/ });
    const list = await openPicker();
    fireEvent.click(within(list).getByRole('button', { name: /Plan Boda/ }));
    await checkAvailable();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Para reservar falta: el nombre del cliente y el teléfono del cliente.');
    expect(screen.getByText(/Ingresá el nombre del cliente/)).toBeTruthy();
    expect(screen.getByText(/Ingresá el teléfono del cliente/)).toBeTruthy();
    expect(createHallBooking).not.toHaveBeenCalled();
  });

  it('con todo completo reserva con el plan elegido y deja la pantalla sin plan', async () => {
    createHallBooking.mockResolvedValue({
      booking: { bookingId: 31 }, plan: { planName: 'Plan Cumple', price: 90000 }, depositPercentage: 0.3, depositAmount: 27000,
    });
    renderPage();
    await screen.findByRole('button', { name: /Seleccionar plan/ });
    const list = await openPicker();
    fireEvent.click(within(list).getByRole('button', { name: /Plan Cumple/ }));
    await checkAvailable();
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Ana Mora' } });
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: '88887777' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
    expect(await screen.findByText('Reserva confirmada')).toBeTruthy();
    expect(createHallBooking).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 2, planId: 8, customerName: 'Ana Mora', customerPhone: '88887777',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar otra reserva' }));
    expect(await screen.findByRole('button', { name: /Seleccionar plan/ })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Formato del nombre y teléfono del cliente', () => {
  async function prepare() {
    renderPage();
    await screen.findByRole('button', { name: /Seleccionar plan/ });
    const list = await openPicker();
    fireEvent.click(within(list).getByRole('button', { name: /Plan Cumple/ }));
    await checkAvailable();
  }
  const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Confirmar reserva' }));

  it('en el teléfono no se pueden escribir letras', async () => {
    await prepare();
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: 'ab8888-77x77' } });
    expect(screen.getByLabelText('Telefono').value).toBe('8888-7777');
  });

  it('un teléfono que no tiene 8 dígitos o un nombre con números no se envían y se explica por qué', async () => {
    await prepare();
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Ana 123' } });
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: '8888' } });
    confirm();
    expect((await screen.findByRole('alert')).textContent)
      .toBe('Para reservar falta: corregir el nombre del cliente y corregir el teléfono del cliente.');
    expect(screen.getByText(/sin números/)).toBeTruthy();
    expect(screen.getByText(/8 dígitos \(se acepta/)).toBeTruthy();
    expect(createHallBooking).not.toHaveBeenCalled();
  });

  it('con datos correctos manda el teléfono solo con los 8 dígitos', async () => {
    createHallBooking.mockResolvedValue({
      booking: { bookingId: 31 }, plan: { planName: 'Plan Cumple', price: 90000 }, depositPercentage: 0.3, depositAmount: 27000,
    });
    await prepare();
    fireEvent.change(screen.getByLabelText('Nombre del cliente'), { target: { value: 'Ana Mora' } });
    fireEvent.change(screen.getByLabelText('Telefono'), { target: { value: '+506 8888-7777' } });
    confirm();
    await screen.findByText('Reserva confirmada');
    expect(createHallBooking).toHaveBeenCalledWith(expect.objectContaining({ customerName: 'Ana Mora', customerPhone: '88887777' }));
  });
});
