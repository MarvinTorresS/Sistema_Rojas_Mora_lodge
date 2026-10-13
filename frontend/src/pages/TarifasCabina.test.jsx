// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TarifasCabina from './TarifasCabina';
import { listCabinRates, updateCabinRate } from '../services/reservasCabinaService';

// El servicio se reemplaza completo: estas pruebas verifican la PANTALLA
// (qué pide, qué muestra) sin levantar la API ni la base de datos.
vi.mock('../services/reservasCabinaService', () => ({
  listCabinRates: vi.fn(), updateCabinRate: vi.fn(),
}));

// Datos con la misma forma que devuelve GET /api/cabins.
const cabins = [
  { resourceId: 3, name: 'Cabina 1', status: 'available', capacity: 2, pricePerNight: 35000 },
  { resourceId: 4, name: 'Cabina 2', status: 'available', capacity: 4, pricePerNight: 55000 },
  { resourceId: 5, name: 'Cabina 3', status: 'maintenance', capacity: 1, pricePerNight: 80000 },
];

function renderPage() {
  return render(<MemoryRouter><TarifasCabina /></MemoryRouter>);
}
const digits = (text) => text.replace(/\D/g, '');
const INVALID = 'La tarifa debe ser un monto mayor a cero';

async function openEditor(name = 'Cabina 2') {
  fireEvent.click(await screen.findByRole('button', { name: `Editar tarifa de ${name}` }));
  return screen.findByLabelText('Nueva tarifa por noche');
}

beforeEach(() => {
  vi.resetAllMocks();
  listCabinRates.mockResolvedValue(cabins);
});
afterEach(cleanup);

describe('HU-128 pantalla Tarifas de cabinas', () => {
  it('lista las cabinas con su capacidad, estado y tarifa vigente', async () => {
    renderPage();
    expect(await screen.findByText('Cabina 1')).toBeTruthy();
    expect(screen.getByText('Capacidad: 4 personas')).toBeTruthy();
    expect(screen.getByText('Capacidad: 1 persona')).toBeTruthy(); // singular
    expect(screen.getByText('En mantenimiento')).toBeTruthy();
    const row = screen.getByText('Cabina 2').closest('li');
    expect(digits(within(row).getByText(/₡/).textContent)).toBe('55000');
  });

  it('muestra un error con "Reintentar" si la lista no carga', async () => {
    listCabinRates.mockRejectedValueOnce(new Error('No se pudieron cargar las tarifas.'));
    renderPage();
    expect(await screen.findByText('No se pudieron cargar las tarifas.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Cabina 1')).toBeTruthy();
    expect(listCabinRates).toHaveBeenCalledTimes(2);
  });

  it('al editar, abre el formulario con la tarifa actual y solo en esa cabina', async () => {
    renderPage();
    const input = await openEditor('Cabina 2');
    expect(input.value).toBe('55000');
    expect(screen.getAllByLabelText('Nueva tarifa por noche')).toHaveLength(1);
    expect(screen.getByText(/conservan su precio/)).toBeTruthy();
  });

  it('CA-1: guarda la tarifa, muestra el mensaje oficial y actualiza la fila', async () => {
    updateCabinRate.mockResolvedValue({
      changed: true, previousPricePerNight: 55000,
      cabin: { resourceId: 4, name: 'Cabina 2', status: 'available', capacity: 4, pricePerNight: 60000 },
    });
    renderPage();
    const input = await openEditor();
    fireEvent.change(input, { target: { value: '60000' } });
    expect(await screen.findByText(/Sube .*5.?000.*9 %/)).toBeTruthy(); // vista previa
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tarifa' }));

    expect(await screen.findByText('La tarifa de la cabina se actualizó exitosamente')).toBeTruthy();
    expect(updateCabinRate).toHaveBeenCalledWith(4, 60000);
    await waitFor(() => expect(screen.queryByLabelText('Nueva tarifa por noche')).toBeNull());
    const row = screen.getByText('Cabina 2').closest('li');
    expect(digits(within(row).getByText(/₡/).textContent)).toBe('60000');
    expect(listCabinRates).toHaveBeenCalledTimes(1); // no recarga toda la lista
  });

  it('CA-2: tarifa vacía o en cero muestra el mensaje oficial y NO llama al backend', async () => {
    renderPage();
    const input = await openEditor();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tarifa' }));
    expect((await screen.findByRole('alert')).textContent).toContain(INVALID);

    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.queryByRole('alert')).toBeNull(); // al corregir, el error se limpia
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tarifa' }));
    expect((await screen.findByRole('alert')).textContent).toContain(INVALID);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(updateCabinRate).not.toHaveBeenCalled();
  });

  it('CA-2: si el backend rechaza la tarifa (422), el mensaje aparece en el campo y se conserva lo escrito', async () => {
    updateCabinRate.mockRejectedValue(Object.assign(new Error('x'), { status: 422, fieldErrors: { pricePerNight: INVALID } }));
    renderPage();
    const input = await openEditor();
    fireEvent.change(input, { target: { value: '70000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tarifa' }));
    expect((await screen.findByRole('alert')).textContent).toContain(INVALID);
    expect(input.value).toBe('70000');
  });

  it('solo deja escribir dígitos (descarta letras, puntos y comas)', async () => {
    renderPage();
    const input = await openEditor();
    fireEvent.change(input, { target: { value: '6a0.0,00' } });
    expect(input.value).toBe('60000');
  });

  it('CA-4: Cancelar cierra el formulario sin llamar al backend ni cambiar la tarifa', async () => {
    renderPage();
    const input = await openEditor();
    fireEvent.change(input, { target: { value: '99000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByLabelText('Nueva tarifa por noche')).toBeNull());
    expect(updateCabinRate).not.toHaveBeenCalled();
    const row = screen.getByText('Cabina 2').closest('li');
    expect(digits(within(row).getByText(/₡/).textContent)).toBe('55000');
  });

  it('CA-4: Escape también cancela', async () => {
    renderPage();
    const input = await openEditor();
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Nueva tarifa por noche')).toBeNull());
    expect(updateCabinRate).not.toHaveBeenCalled();
  });

  it('con la misma tarifa, "Guardar" queda desactivado', async () => {
    renderPage();
    await openEditor();
    expect(screen.getByRole('button', { name: 'Guardar tarifa' }).disabled).toBe(true);
  });

  it('si el backend avisa que no hubo cambios, lo comunica sin decir "éxito"', async () => {
    updateCabinRate.mockResolvedValue({
      changed: false, previousPricePerNight: 55000,
      cabin: { resourceId: 4, name: 'Cabina 2', status: 'available', capacity: 4, pricePerNight: 55000 },
    });
    renderPage();
    const input = await openEditor();
    fireEvent.change(input, { target: { value: '56000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tarifa' }));
    expect(await screen.findByText('No hubo cambios')).toBeTruthy();
    expect(screen.queryByText('La tarifa de la cabina se actualizó exitosamente')).toBeNull();
  });

  it('un fallo que no es de la tarifa (ej. 404) se avisa arriba y conserva el formulario', async () => {
    updateCabinRate.mockRejectedValue(Object.assign(new Error('La cabina indicada no existe.'), { status: 404 }));
    renderPage();
    const input = await openEditor();
    fireEvent.change(input, { target: { value: '70000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar tarifa' }));
    expect(await screen.findByText('La cabina indicada no existe.')).toBeTruthy();
    expect(screen.getByLabelText('Nueva tarifa por noche').value).toBe('70000');
  });
});
