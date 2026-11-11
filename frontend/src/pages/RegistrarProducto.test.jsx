// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RegistrarProducto, { INVALID_PRICE_MESSAGE } from './RegistrarProducto';
import { createMenuProduct, listProductCategories } from '../services/productosMenuService';

vi.mock('../services/productosMenuService', () => ({ createMenuProduct: vi.fn(), listProductCategories: vi.fn() }));

const CATEGORIES = ['Entrada', 'Plato fuerte', 'Bebida', 'Postre'].map((label) => ({ value: label, label }));

const renderPage = () => render(
  <MemoryRouter initialEntries={['/restaurante/menu/registrar']}>
    <Routes>
      <Route path="/restaurante/menu/registrar" element={<RegistrarProducto />} />
      <Route path="/restaurante/menu" element={<h1>Productos del menú</h1>} />
    </Routes>
  </MemoryRouter>,
);
const type = (label, value) => fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });
const pick = async (category) => fireEvent.click(await screen.findByRole('radio', { name: category }));
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar producto' }));
const apiError = (message, extra) => Object.assign(new Error(message), extra);

beforeEach(() => {
  vi.resetAllMocks();
  listProductCategories.mockResolvedValue(CATEGORIES);
});
afterEach(cleanup);

describe('HU-113 - Registrar un producto del menú', () => {
  it('muestra las categorías oficiales que entrega el backend', async () => {
    renderPage();
    for (const { label } of CATEGORIES) expect(await screen.findByRole('radio', { name: label })).toBeTruthy();
  });

  it('CA-1 registra el producto y muestra "Producto registrado exitosamente"', async () => {
    createMenuProduct.mockResolvedValue({
      message: 'Producto registrado exitosamente',
      data: { productId: 4, name: 'Casado con pollo', category: 'Plato fuerte', price: 4500.5, stockQuantity: 15, status: 'Disponible' },
    });
    renderPage();
    type('Nombre', '  Casado con pollo ');
    await pick('Plato fuerte');
    type('Precio', '4 500,50');
    type('Existencias iniciales', '15');
    save();

    expect((await screen.findByRole('status')).textContent).toBe('Producto registrado exitosamente');
    expect(createMenuProduct).toHaveBeenCalledWith({
      name: 'Casado con pollo', category: 'Plato fuerte', price: 4500.5, stockQuantity: 15,
    });
    expect(screen.getByRole('link', { name: 'Ver productos del menú' }).getAttribute('href')).toBe('/restaurante/menu');
  });

  it('CA-1 sin existencias envía el valor por defecto del backend', async () => {
    createMenuProduct.mockResolvedValue({ message: 'ok', data: { name: 'Café', category: 'Bebida', price: 1200, stockQuantity: 0 } });
    renderPage();
    type('Nombre', 'Café');
    await pick('Bebida');
    type('Precio', '1200');
    save();
    await screen.findByRole('status');
    expect(createMenuProduct).toHaveBeenCalledWith({ name: 'Café', category: 'Bebida', price: 1200, stockQuantity: undefined });
  });

  it('CA-2 producto duplicado en la categoría: mensaje debajo del nombre, sin perder lo escrito', async () => {
    createMenuProduct.mockRejectedValue(apiError('Ya existe un producto con ese nombre en esta categoría', {
      code: 'PRODUCT_DUPLICATE', status: 409, details: { name: 'tres leches', category: 'Postre', productId: 2 },
    }));
    renderPage();
    type('Nombre', 'tres leches');
    await pick('Postre');
    type('Precio', '2500');
    save();

    expect((await screen.findByRole('alert')).textContent).toBe('Ya existe un producto con ese nombre en esta categoría');
    const name = screen.getByLabelText('Nombre', { exact: false });
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.value).toBe('tres leches');
    expect(screen.getByRole('radio', { name: 'Postre' }).getAttribute('aria-checked')).toBe('true');
  });

  it('CA-3 faltan nombre, categoría y precio: mensaje de la historia y los tres en rojo', async () => {
    renderPage();
    await screen.findByRole('radio', { name: 'Postre' });
    type('Existencias iniciales', '3');
    save();

    expect(screen.getByRole('alert').textContent).toBe('Los campos marcados con (*) son obligatorios');
    expect(screen.getByLabelText('Nombre', { exact: false }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Precio', { exact: false }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('radiogroup', { name: 'Categoría' }).getAttribute('aria-invalid')).toBe('true');
    expect(createMenuProduct).not.toHaveBeenCalled();
  });

  it('un precio ilegible se marca en el campo sin llamar a la API', async () => {
    renderPage();
    type('Nombre', 'Fresco');
    await pick('Bebida');
    type('Precio', 'mil');
    save();
    expect((await screen.findByRole('alert')).textContent).toBe(INVALID_PRICE_MESSAGE);
    expect(screen.getByLabelText('Precio', { exact: false }).getAttribute('aria-invalid')).toBe('true');
    expect(createMenuProduct).not.toHaveBeenCalled();
  });

  it('CA-4 cancelar con datos pregunta y "Sí" limpia el formulario sin guardar', async () => {
    renderPage();
    await pick('Entrada');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('¿Desea salir sin guardar los cambios?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, salir sin guardar' }));
    expect(screen.getByRole('radio', { name: 'Entrada' }).getAttribute('aria-checked')).toBe('false');
    expect(createMenuProduct).not.toHaveBeenCalled();
  });

  it('si no cargan las categorías, avisa, no deja guardar y permite reintentar', async () => {
    listProductCategories.mockRejectedValueOnce(new Error('No se pudieron cargar las categorías del menú.'));
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar las categorías del menú.');
    expect(screen.getByRole('button', { name: 'Guardar producto' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('radio', { name: 'Bebida' })).toBeTruthy();
  });
});
