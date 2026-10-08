// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExtenderHospedaje from './ExtenderHospedaje';
import { extendCabinStay, getExtensionQuote, listExtendableBookings } from '../services/reservasCabinaService';

// El servicio se reemplaza completo: estas pruebas verifican la PANTALLA
// (qué pide, qué muestra) sin levantar la API ni la base de datos.
vi.mock('../services/reservasCabinaService', () => ({
  listExtendableBookings: vi.fn(), getExtensionQuote: vi.fn(), extendCabinStay: vi.fn(),
}));

// Datos de ejemplo con la misma forma que devuelve GET /extendable.
const andres = {
  bookingId: 102, status: 'checked_in', isExtendable: true,
  cabin: { resourceId: 4, name: 'Cabina 2' },
  guest: { customerId: 7, fullName: 'Andrés Vargas Rojas', identificationNumber: '2-0456-0789' },
  stay: { checkInDate: '2026-10-07', checkOutDate: '2026-10-10', nights: 3 },
  nightlyRate: 55000,
};
const jose = {
  bookingId: 104, status: 'completed', isExtendable: false,
  cabin: { resourceId: 6, name: 'Cabina 4' },
  guest: { customerId: 9, fullName: 'José Pablo Araya Solano', identificationNumber: '3-0333-0444' },
  stay: { checkInDate: '2026-10-01', checkOutDate: '2026-10-05', nights: 4 },
  nightlyRate: 45000,
};

// Cotización con la forma de GET /:bookingId/extension-quote. Andrés
// reservó 3 noches a ₡50 000 (total registrado ₡150 000) y hoy la tarifa
// es ₡55 000: es el caso del CA-3.
function quoteFor(extraNights) {
  const extensionAmount = extraNights * 55000;
  return {
    bookingId: 102, status: 'checked_in',
    cabin: andres.cabin, guest: andres.guest,
    stay: { checkInDate: '2026-10-07', previousCheckOutDate: '2026-10-10', newCheckOutDate: `2026-10-${10 + extraNights}`, extraNights },
    amounts: {
      nightlyRate: 55000, extensionAmount, previousTotal: 150000, newTotal: 150000 + extensionAmount,
      pendingBalance: 150000 + extensionAmount, previousTotalIsEstimated: false,
    },
  };
}

function renderPage() {
  return render(<MemoryRouter><ExtenderHospedaje /></MemoryRouter>);
}
const digits = (text) => text.replace(/\D/g, '');

beforeEach(() => {
  vi.resetAllMocks();
  listExtendableBookings.mockResolvedValue([andres, jose]);
  getExtensionQuote.mockImplementation((bookingId, newCheckOutDate) => (
    Promise.resolve(quoteFor(Number(newCheckOutDate.slice(-2)) - 10))
  ));
});
afterEach(cleanup);

describe('HU-127 pantalla Extender hospedaje', () => {
  it('lista las reservas separando las en curso de las finalizadas', async () => {
    renderPage();
    expect(await screen.findByText('Andrés Vargas Rojas')).toBeTruthy();
    expect(screen.getByText('En curso · 1')).toBeTruthy();
    expect(screen.getByText('Finalizadas recientes')).toBeTruthy();
    expect(screen.getByText('José Pablo Araya Solano')).toBeTruthy();
    expect(listExtendableBookings).toHaveBeenCalledWith({ search: '' });
  });

  it('busca por nombre o cédula esperando a que el usuario termine de escribir', async () => {
    renderPage();
    await screen.findByText('Andrés Vargas Rojas');
    fireEvent.change(screen.getByLabelText('Buscar huésped'), { target: { value: 'and' } });
    await waitFor(() => expect(listExtendableBookings).toHaveBeenCalledWith({ search: 'and' }));
    // Una sola consulta de búsqueda, no una por letra.
    expect(listExtendableBookings.mock.calls.filter(([params]) => params.search !== '')).toHaveLength(1);
  });

  it('al elegir un huésped muestra su ficha y cotiza +1 noche', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Andrés Vargas Rojas'));
    expect(await screen.findByText('2-0456-0789')).toBeTruthy();
    expect(screen.getAllByText('Cabina 2').length).toBeGreaterThan(0);
    await waitFor(() => expect(getExtensionQuote).toHaveBeenCalledWith(102, '2026-10-11'));
    expect(await screen.findByText('Cabina disponible esas noches')).toBeTruthy();
  });

  it('CA-3: separa lo ya registrado (sin cambios) de las noches nuevas a tarifa actual', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Andrés Vargas Rojas'));
    fireEvent.click(await screen.findByRole('button', { name: 'Sumar una noche' }));
    await waitFor(() => expect(getExtensionQuote).toHaveBeenCalledWith(102, '2026-10-12'));

    expect(await screen.findByText('Estadía ya registrada')).toBeTruthy();
    expect(screen.getByText(/3 noches · sin cambios/)).toBeTruthy();
    expect(screen.getByText(/2 noches × .*55.?000 · tarifa actual/)).toBeTruthy();
    // 150 000 + 2 × 55 000 = 260 000 (nuevo total y saldo pendiente).
    await waitFor(() => expect(screen.getAllByText((_, node) => node.tagName === 'SPAN' && digits(node.textContent) === '260000').length).toBeGreaterThan(0));
    // Aclaración informativa (no alerta): la tarifa cambió desde la reserva.
    const note = screen.getByText(/tarifa distinta de la actual/);
    expect(note.closest('[role="note"]')).toBeTruthy();
  });

  it('CA-2: sin disponibilidad muestra el mensaje oficial y bloquea Confirmar', async () => {
    const official = 'No es posible extender la estadía porque la cabina no se encuentra disponible para la fecha solicitada';
    getExtensionQuote.mockRejectedValue(Object.assign(new Error(official), { code: 'EXTENSION_NOT_AVAILABLE' }));
    renderPage();
    fireEvent.click(await screen.findByText('Andrés Vargas Rojas'));
    expect(await screen.findByText(official)).toBeTruthy();
    expect(screen.getByText('La reserva original se mantiene sin modificaciones.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar extensión' }).disabled).toBe(true);
  });

  it('CA-1: confirma la extensión, avisa el éxito y recarga la lista', async () => {
    extendCabinStay.mockResolvedValue({ ...quoteFor(1), booking: {}, extension: {} });
    renderPage();
    fireEvent.click(await screen.findByText('Andrés Vargas Rojas'));
    await screen.findByText('Cabina disponible esas noches');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar extensión' }).disabled).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar extensión' }));

    expect(await screen.findByText('La extensión de hospedaje se registró exitosamente')).toBeTruthy();
    expect(extendCabinStay).toHaveBeenCalledWith(102, '2026-10-11');
    await waitFor(() => expect(listExtendableBookings).toHaveBeenCalledTimes(2));
  });

  it('CA-2 de carrera: si al confirmar ya no hay cupo, muestra el aviso y no registra nada', async () => {
    const official = 'No es posible extender la estadía porque la cabina no se encuentra disponible para la fecha solicitada';
    extendCabinStay.mockRejectedValue(Object.assign(new Error(official), { code: 'EXTENSION_NOT_AVAILABLE' }));
    renderPage();
    fireEvent.click(await screen.findByText('Andrés Vargas Rojas'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar extensión' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar extensión' }));

    expect(await screen.findByText(official)).toBeTruthy();
    expect(screen.queryByText('La extensión de hospedaje se registró exitosamente')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirmar extensión' }).disabled).toBe(true);
  });

  it('CA-4: una reserva finalizada muestra el mensaje y no permite continuar', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('José Pablo Araya Solano'));
    expect(await screen.findByText('No es posible extender una reserva finalizada')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a reservar cabina' }).getAttribute('href')).toBe('/cabinas');
    expect(screen.queryByRole('button', { name: 'Confirmar extensión' })).toBeNull();
    expect(getExtensionQuote).not.toHaveBeenCalled();
  });

  it('CA-5: Cancelar cierra la ficha sin registrar cambios', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Andrés Vargas Rojas'));
    await screen.findByText('Cabina disponible esas noches');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('Elegí un huésped de la lista')).toBeTruthy();
    expect(extendCabinStay).not.toHaveBeenCalled();
  });

  it('respeta el tope de noches: el botón + se desactiva en el máximo', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Andrés Vargas Rojas'));
    const plus = await screen.findByRole('button', { name: 'Sumar una noche' });
    const minus = screen.getByRole('button', { name: 'Quitar una noche' });
    expect(minus.disabled).toBe(true); // mínimo: 1 noche
    for (let i = 0; i < 29; i += 1) fireEvent.click(plus);
    expect(screen.getByText('+30')).toBeTruthy();
    expect(plus.disabled).toBe(true);
  });
});
