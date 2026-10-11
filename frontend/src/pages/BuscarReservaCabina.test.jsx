// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BuscarReservaCabina from './BuscarReservaCabina';
import { listCabinRates, searchCabinBookings, updateCabinBooking } from '../services/reservasCabinaService';
import { addDays, todayInHotel } from '../components/cabinas/cabinFormat';

// El servicio se reemplaza completo: estas pruebas verifican la PANTALLA
// (qué pide, qué muestra) sin levantar la API ni la base de datos.
vi.mock('../services/reservasCabinaService', () => ({
  searchCabinBookings: vi.fn(), updateCabinBooking: vi.fn(), listCabinRates: vi.fn(),
}));

const today = todayInHotel();
const checkIn = addDays(today, 10);
const checkOut = addDays(today, 13);

const ana = {
  bookingId: 5, status: 'active', isModifiable: true,
  cabin: { resourceId: 3, name: 'Cabina 1', capacity: 2 },
  guest: {
    customerId: 7, fullName: 'Ana Mora', identificationNumber: '1-1111-1111', phone: '88881111', email: 'ana@example.com',
  },
  partySize: 2, companions: 1, stay: { checkInDate: checkIn, checkOutDate: checkOut, nights: 3 },
  totalAmount: 105000, isTotalEstimated: false,
};
const luis = {
  ...ana, bookingId: 6, status: 'checked_in',
  guest: { ...ana.guest, customerId: 8, fullName: 'Luis Solano', identificationNumber: '2-2222-2222' },
};
const maria = {
  ...ana, bookingId: 7, status: 'completed', isModifiable: false,
  guest: { ...ana.guest, customerId: 9, fullName: 'María Rojas', identificationNumber: '3-3333-3333' },
};
const cabins = [
  { resourceId: 3, name: 'Cabina 1', status: 'available', capacity: 2, pricePerNight: 35000 },
  { resourceId: 4, name: 'Cabina 2', status: 'available', capacity: 4, pricePerNight: 55000 },
];
const metaFor = (items, query) => ({
  page: 1, pageSize: 20, total: items.length, totalPages: 1, query, message: items.length ? null : 'No se encontraron reservas con los criterios indicados',
});

function renderPage() {
  return render(<MemoryRouter><BuscarReservaCabina /></MemoryRouter>);
}
async function searchFor(text, items = [ana, luis, maria]) {
  searchCabinBookings.mockResolvedValue({ data: items, meta: metaFor(items, text) });
  fireEvent.change(screen.getByLabelText('Buscar huésped'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  return screen.findByText(items[0]?.guest.fullName ?? 'nada');
}
async function openEdit(booking = ana) {
  await searchFor('a', [booking]);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(booking.guest.fullName) }));
  fireEvent.click(await screen.findByRole('button', { name: /Modificar reserva/ }));
  return screen.findByRole('form', { name: 'Modificar reserva' });
}
const setField = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.resetAllMocks();
  listCabinRates.mockResolvedValue(cabins);
});
afterEach(cleanup);

describe('HU-018 buscar reserva por huésped', () => {
  it('no consulta nada hasta presionar Buscar', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Buscar huésped'), { target: { value: 'ana' } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searchCabinBookings).not.toHaveBeenCalled();
    expect(screen.getByText(/presioná Buscar/)).toBeTruthy();
  });

  it('CA-1: busca con el botón y muestra las reservas que coinciden', async () => {
    renderPage();
    await searchFor('  ana ');
    expect(searchCabinBookings).toHaveBeenCalledWith({ q: 'ana', page: 1 });
    expect(screen.getByText('3 reservas')).toBeTruthy();
    expect(screen.getByText('Luis Solano')).toBeTruthy();
    expect(screen.getByText('Hospedado')).toBeTruthy();
    expect(screen.getByText('Finalizada')).toBeTruthy();
  });

  it('CA-1: también busca con Enter', async () => {
    searchCabinBookings.mockResolvedValue({ data: [ana], meta: metaFor([ana], 'ana') });
    renderPage();
    const input = screen.getByLabelText('Buscar huésped');
    fireEvent.change(input, { target: { value: 'ana' } });
    fireEvent.submit(input.closest('form'));
    expect(await screen.findByText('Ana Mora')).toBeTruthy();
    expect(searchCabinBookings).toHaveBeenCalledTimes(1);
  });

  it('CA-2: sin coincidencias muestra el mensaje y mantiene el criterio escrito', async () => {
    renderPage();
    searchCabinBookings.mockResolvedValue({ data: [], meta: metaFor([], 'zzz') });
    fireEvent.change(screen.getByLabelText('Buscar huésped'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('No se encontraron reservas con los criterios indicados')).toBeTruthy();
    expect(screen.getByLabelText('Buscar huésped').value).toBe('zzz');
  });

  it('una búsqueda sin coincidencias quita la ficha de la reserva que se veía', async () => {
    renderPage();
    await searchFor('a');
    fireEvent.click(screen.getByRole('button', { name: /Ana Mora/ }));
    expect(screen.getByRole('region', { name: 'Ficha de la reserva' })).toBeTruthy();
    searchCabinBookings.mockResolvedValue({ data: [], meta: metaFor([], 'zzz') });
    fireEvent.change(screen.getByLabelText('Buscar huésped'), { target: { value: 'zzz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('No se encontraron reservas con los criterios indicados')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Ficha de la reserva' })).toBeNull();
  });

  it('buscar sin escribir nada también quita la ficha', async () => {
    renderPage();
    await searchFor('a');
    fireEvent.click(screen.getByRole('button', { name: /Ana Mora/ }));
    fireEvent.change(screen.getByLabelText('Buscar huésped'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Ingrese el nombre o la identificación del huésped para buscar.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Ficha de la reserva' })).toBeNull();
  });

  it('sin criterio avisa y no consulta', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Ingrese el nombre o la identificación del huésped para buscar.')).toBeTruthy();
    expect(searchCabinBookings).not.toHaveBeenCalled();
  });

  it('un error de red se muestra con "Reintentar"', async () => {
    renderPage();
    searchCabinBookings.mockRejectedValueOnce(new Error('No se pudo realizar la búsqueda.'));
    fireEvent.change(screen.getByLabelText('Buscar huésped'), { target: { value: 'ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('No se pudo realizar la búsqueda.')).toBeTruthy();
    searchCabinBookings.mockResolvedValue({ data: [ana], meta: metaFor([ana], 'ana') });
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Ana Mora')).toBeTruthy();
  });

  it('pagina los resultados', async () => {
    renderPage();
    searchCabinBookings.mockResolvedValue({ data: [ana], meta: { ...metaFor([ana], 'a'), total: 45, totalPages: 3 } });
    fireEvent.change(screen.getByLabelText('Buscar huésped'), { target: { value: 'a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Página 1 de 3');
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(searchCabinBookings).toHaveBeenLastCalledWith({ q: 'a', page: 2 }));
  });

  it('elegir una reserva muestra su ficha con los datos de contacto', async () => {
    renderPage();
    await searchFor('a');
    fireEvent.click(screen.getByRole('button', { name: /Ana Mora/ }));
    const sheet = screen.getByRole('region', { name: 'Ficha de la reserva' });
    expect(within(sheet).getByText('1-1111-1111')).toBeTruthy();
    expect(within(sheet).getByText('88881111')).toBeTruthy();
    expect(within(sheet).getByText('ana@example.com')).toBeTruthy();
    // En lugar de "acompañantes": el total de personas y la tarifa total a pagar.
    expect(within(sheet).getByText('Total de personas').nextSibling.textContent).toBe('2');
    expect(within(sheet).queryByText('Acompañantes')).toBeNull();
    expect(within(sheet).getByText('Tarifa total a pagar')).toBeTruthy();
    expect(within(sheet).getByText(/105[.,\s\u00a0]?000/)).toBeTruthy();
    expect(within(sheet).getByRole('button', { name: /Modificar reserva/ })).toBeTruthy();
  });

  it('una reserva finalizada se ve pero no se puede modificar', async () => {
    renderPage();
    await searchFor('a');
    fireEvent.click(screen.getByRole('button', { name: /María Rojas/ }));
    expect(screen.getByText('Solo se pueden modificar reservas activas o con ingreso registrado.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Modificar reserva/ })).toBeNull();
  });
});

describe('HU-019 modificar reserva', () => {
  it('Guardar queda apagado hasta que haya un cambio', async () => {
    renderPage();
    await openEdit();
    expect(screen.getByRole('button', { name: 'Guardar cambios' }).disabled).toBe(true);
    setField('Fecha de salida', addDays(today, 14));
    expect(screen.getByRole('button', { name: 'Guardar cambios' }).disabled).toBe(false);
    const summary = screen.getByLabelText('Cambios a guardar');
    expect(within(summary).getByText('Salida')).toBeTruthy();
  });

  it('CA-1: envía solo lo que cambió, avisa el éxito con el nuevo total y refresca la lista', async () => {
    updateCabinBooking.mockResolvedValue({
      changed: true,
      changes: {},
      booking: { bookingId: 5, status: 'active', partySize: 2 },
      cabin: { resourceId: 3, name: 'Cabina 1', capacity: 2 },
      guest: { fullName: 'Ana Mora', phone: '88881111', email: 'ana@example.com' },
      stay: { checkInDate: checkIn, checkOutDate: addDays(today, 15), nights: 5 },
      amounts: { repriced: true, previousTotal: 105000, totalAmount: 175000, nightlyRate: 35000 },
    });
    renderPage();
    await openEdit();
    setField('Fecha de salida', addDays(today, 15));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('La reserva se modificó correctamente')).toBeTruthy();
    expect(updateCabinBooking).toHaveBeenCalledWith(5, { checkOutDate: addDays(today, 15) });
    expect(screen.getByText(/Nuevo total de la estadía/).textContent.replace(/\D/g, '')).toContain('175000');
    // La lista se vuelve a consultar con el mismo criterio.
    await waitFor(() => expect(searchCabinBookings).toHaveBeenCalledTimes(2));
    expect(searchCabinBookings.mock.calls[1][0]).toEqual({ q: 'a', page: 1 });
    // La ficha ya muestra la nueva salida y el formulario se cerró.
    expect(screen.queryByRole('form', { name: 'Modificar reserva' })).toBeNull();
    expect(screen.getByText('5 noches')).toBeTruthy();
  });

  it('puede cambiar de cabina y datos del huésped juntos', async () => {
    updateCabinBooking.mockResolvedValue({
      changed: true, changes: {},
      booking: { bookingId: 5, status: 'active', partySize: 2 },
      cabin: { resourceId: 4, name: 'Cabina 2', capacity: 4 },
      guest: { fullName: 'Ana Mora', phone: '88889999', email: 'ana@example.com' },
      stay: { checkInDate: checkIn, checkOutDate: checkOut, nights: 3 },
      amounts: { repriced: true, previousTotal: 105000, totalAmount: 165000, nightlyRate: 55000 },
    });
    renderPage();
    await openEdit();
    await waitFor(() => expect(screen.getByRole('option', { name: /Cabina 2/ })).toBeTruthy());
    setField('Cabina', '4');
    setField('Teléfono', '88889999');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText('La reserva se modificó correctamente');
    expect(updateCabinBooking).toHaveBeenCalledWith(5, { resourceId: 4, guestPhone: '88889999' });
  });

  it('CA-2: si la cabina o las fechas están ocupadas rechaza, no cambia nada y sugiere alternativas', async () => {
    const conflict = Object.assign(new Error('La cabina no se encuentra disponible en las fechas seleccionadas'), {
      status: 409,
      code: 'CABIN_NOT_AVAILABLE',
      fieldErrors: {},
      details: {
        alternatives: [{ resourceId: 4, name: 'Cabina 2', capacity: 4, pricePerNight: 55000 }],
        alternativeDates: [{ checkInDate: addDays(checkIn, 1), checkOutDate: addDays(checkOut, 1), nights: 3 }],
      },
    });
    updateCabinBooking.mockRejectedValueOnce(conflict);
    renderPage();
    await openEdit();
    setField('Fecha de salida', addDays(today, 16));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const alert = await screen.findByText('La cabina no se encuentra disponible en las fechas seleccionadas');
    expect(alert).toBeTruthy();
    expect(screen.getByText(/La reserva original se mantiene sin modificaciones/)).toBeTruthy();
    // El formulario sigue abierto con lo escrito.
    expect(screen.getByLabelText('Fecha de salida').value).toBe(addDays(today, 16));

    // Elegir una cabina alternativa la pasa al borrador y cierra el aviso.
    fireEvent.click(screen.getByRole('button', { name: /Elegir Cabina 2/ }));
    expect(screen.getByLabelText('Cabina').value).toBe('4');
    expect(screen.queryByText('La cabina no se encuentra disponible en las fechas seleccionadas')).toBeNull();
  });

  it('CA-2: elegir una fecha alternativa cambia entrada y salida', async () => {
    updateCabinBooking.mockRejectedValueOnce(Object.assign(new Error('La cabina no se encuentra disponible en las fechas seleccionadas'), {
      code: 'CABIN_NOT_AVAILABLE', fieldErrors: {},
      details: {
        alternatives: [],
        alternativeDates: [{ checkInDate: addDays(checkIn, 2), checkOutDate: addDays(checkOut, 2), nights: 3 }],
      },
    }));
    renderPage();
    await openEdit();
    setField('Fecha de entrada', addDays(checkIn, 5));
    setField('Fecha de salida', addDays(checkOut, 5));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /Elegir del/ }));
    expect(screen.getByLabelText('Fecha de entrada').value).toBe(addDays(checkIn, 2));
    expect(screen.getByLabelText('Fecha de salida').value).toBe(addDays(checkOut, 2));
  });

  describe('CA-3 huésped ya hospedado', () => {
    it('bloquea la cabina y la fecha de entrada y explica por qué; deja salida y contacto', async () => {
      renderPage();
      await openEdit(luis);
      expect(screen.getByLabelText('Cabina').disabled).toBe(true);
      expect(screen.getByLabelText('Fecha de entrada').disabled).toBe(true);
      expect(screen.getByText('No es posible reasignar cabina con huésped hospedado')).toBeTruthy();
      expect(screen.getByText('No es posible cambiar la fecha de entrada con huésped hospedado')).toBeTruthy();
      expect(screen.getByLabelText('Fecha de salida').disabled).toBe(false);
      expect(screen.getByLabelText('Teléfono').disabled).toBe(false);
      expect(screen.getByLabelText('Correo').disabled).toBe(false);
    });

    it('si el backend lo rechaza, muestra su mensaje junto al campo', async () => {
      updateCabinBooking.mockRejectedValueOnce(Object.assign(new Error('No es posible reasignar cabina con huésped hospedado'), {
        status: 422, code: 'CABIN_CHANGE_BLOCKED', fieldErrors: {},
      }));
      renderPage();
      await openEdit(luis);
      setField('Teléfono', '88880000');
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      const messages = await screen.findAllByText('No es posible reasignar cabina con huésped hospedado');
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  it('muestra los errores por campo antes de ir al backend', async () => {
    renderPage();
    await openEdit();
    setField('Teléfono', '12');
    setField('Correo', 'no-es-correo');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('El teléfono debe tener 8 dígitos (se acepta el prefijo +506 y guiones).')).toBeTruthy();
    expect(screen.getByText('El correo no tiene un formato válido (ejemplo: nombre@correo.com).')).toBeTruthy();
    expect(updateCabinBooking).not.toHaveBeenCalled();
  });

  it('en el teléfono no se pueden escribir letras y se manda con solo los 8 dígitos', async () => {
    updateCabinBooking.mockResolvedValue({
      changed: true, changes: {}, booking: { status: 'active', partySize: 2 },
      cabin: { resourceId: 3, name: 'Cabina 1', capacity: 2 }, guest: {}, stay: ana.stay,
      amounts: { totalAmount: 105000, previousTotal: 105000, repriced: false },
    });
    searchCabinBookings.mockResolvedValue({ data: [ana], meta: metaFor([ana], 'a') });
    renderPage();
    await openEdit();
    setField('Teléfono', 'ab+506 8557-1211x');
    expect(screen.getByLabelText('Teléfono').value).toBe('+506 8557-1211');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(updateCabinBooking).toHaveBeenCalledWith(5, { guestPhone: '85571211' }));
  });

  it('un correo repetido (409) se muestra junto al campo de correo', async () => {
    updateCabinBooking.mockRejectedValueOnce(Object.assign(new Error('El correo indicado ya esta asociado a otro huesped.'), {
      status: 409, code: 'EMAIL_IN_USE', fieldErrors: {},
    }));
    renderPage();
    await openEdit();
    setField('Correo', 'otro@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('El correo indicado ya esta asociado a otro huesped.')).toBeTruthy();
    expect(screen.getByLabelText('Correo').getAttribute('aria-invalid')).toBe('true');
  });

  it('si la reserva dejó de estar activa, lo avisa y cierra el formulario', async () => {
    updateCabinBooking.mockRejectedValueOnce(Object.assign(
      new Error('Solo se pueden modificar reservas activas o con ingreso registrado.'),
      { status: 422, code: 'BOOKING_NOT_MODIFIABLE', fieldErrors: {} },
    ));
    renderPage();
    await openEdit();
    setField('Teléfono', '88880000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Modificar reserva' })).toBeNull());
    expect(screen.getAllByText('Solo se pueden modificar reservas activas o con ingreso registrado.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Modificar reserva/ })).toBeNull();
  });

  it('Cancelar cierra el formulario sin llamar al backend', async () => {
    renderPage();
    await openEdit();
    setField('Teléfono', '88880000');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('form', { name: 'Modificar reserva' })).toBeNull();
    expect(updateCabinBooking).not.toHaveBeenCalled();
  });
});
