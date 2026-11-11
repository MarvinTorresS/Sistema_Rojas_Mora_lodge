// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RegistrarMesa from './RegistrarMesa';
import { createRestaurantTable } from '../services/restauranteService';

vi.mock('../services/restauranteService', () => ({ createRestaurantTable: vi.fn() }));

const renderPage = () => render(
  <MemoryRouter initialEntries={['/restaurante/mesas/registrar']}>
    <Routes>
      <Route path="/restaurante/mesas/registrar" element={<RegistrarMesa />} />
      <Route path="/restaurante/mesas" element={<h1>Listado de mesas</h1>} />
    </Routes>
  </MemoryRouter>,
);
const type = (label, value) => fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar mesa' }));
const apiError = (message, extra) => Object.assign(new Error(message), extra);

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

describe('HU-102 - Registrar una nueva mesa', () => {
  it('CA-1 registra la mesa con número, capacidad y ubicación y muestra el mensaje de éxito', async () => {
    createRestaurantTable.mockResolvedValue({
      message: 'Mesa registrada exitosamente',
      data: { tableId: 9, tableNumber: '5', seatCount: 4, location: 'Terraza', status: 'available' },
    });
    renderPage();
    type('Número de mesa', ' 05 ');
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Terraza' }));
    expect(screen.getByText('Mesa 5')).toBeTruthy(); // vista previa ya normalizada
    save();

    expect((await screen.findByRole('status')).textContent).toBe('Mesa registrada exitosamente');
    expect(createRestaurantTable).toHaveBeenCalledWith({ tableNumber: '05', seatCount: 4, location: 'Terraza' });
    expect(screen.getByText(/Mesa 5 · 4 comensales · Terraza · Disponible/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar otra mesa' }));
    expect(screen.getByLabelText('Número de mesa', { exact: false }).value).toBe('');
  });

  it('CA-2 número duplicado: muestra el mensaje debajo del número y conserva lo escrito', async () => {
    createRestaurantTable.mockRejectedValue(apiError('Ya existe una mesa registrada con ese número', {
      code: 'TABLE_NUMBER_DUPLICATE', status: 409, details: { tableNumber: '5', tableId: 1 },
    }));
    renderPage();
    type('Número de mesa', '5');
    type('Capacidad (comensales)', '6');
    save();

    const number = screen.getByLabelText('Número de mesa', { exact: false });
    expect((await screen.findByRole('alert')).textContent).toBe('Ya existe una mesa registrada con ese número');
    expect(number.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(number.getAttribute('aria-describedby').split(' ')[0]).textContent)
      .toBe('Ya existe una mesa registrada con ese número');
    expect(number.value).toBe('5');
    expect(screen.queryByRole('button', { name: 'Registrar otra mesa' })).toBeNull();
  });

  it('CA-3 campos obligatorios: mensaje de la historia, campos en rojo y sin llamar a la API', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Interior' }));
    save();

    expect(screen.getByRole('alert').textContent).toBe('Los campos marcados con (*) son obligatorios');
    expect(screen.getByLabelText('Número de mesa', { exact: false }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Capacidad (comensales)', { exact: false }).getAttribute('aria-invalid')).toBe('true');
    expect(createRestaurantTable).not.toHaveBeenCalled();

    // Al corregir un campo se le quita la marca roja solo a ese campo.
    type('Número de mesa', '3');
    expect(screen.getByLabelText('Número de mesa', { exact: false }).getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByLabelText('Capacidad (comensales)', { exact: false }).getAttribute('aria-invalid')).toBe('true');
  });

  it('CA-3 también muestra los errores por campo que devuelve el backend (422)', async () => {
    createRestaurantTable.mockRejectedValue(apiError('La capacidad debe ser un número entero entre 1 y 20.', {
      status: 422, details: [{ field: 'seatCount', message: 'La capacidad debe ser un número entero entre 1 y 20.' }],
    }));
    renderPage();
    type('Número de mesa', '7');
    type('Capacidad (comensales)', '4');
    save();
    await screen.findByRole('alert');
    expect(screen.getAllByText('La capacidad debe ser un número entero entre 1 y 20.')).toHaveLength(2);
  });

  it('CA-4 cancelar con datos pregunta; "No" conserva y "Sí" limpia sin guardar', () => {
    renderPage();
    type('Número de mesa', '12');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('¿Desea salir sin guardar los cambios?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'No, seguir editando' }));
    expect(screen.getByLabelText('Número de mesa', { exact: false }).value).toBe('12');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, salir sin guardar' }));
    expect(screen.getByLabelText('Número de mesa', { exact: false }).value).toBe('');
    expect(screen.queryByText('¿Desea salir sin guardar los cambios?')).toBeNull();
    expect(createRestaurantTable).not.toHaveBeenCalled();
  });

  it('CA-4 sin datos ingresados, Cancelar vuelve al listado sin preguntar', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('heading', { name: 'Listado de mesas' })).toBeTruthy();
  });
});
