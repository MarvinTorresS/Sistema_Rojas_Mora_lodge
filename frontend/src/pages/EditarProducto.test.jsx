// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import EditarProducto from './EditarProducto';
import { getProduct, editProduct } from '../services/productEditService';
vi.mock('../services/productEditService', () => ({ getProduct: vi.fn(), editProduct: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const product = { productId: 1, name: 'Bebida', category: 'Bebidas', price: 1500, stockQuantity: 10, isAvailable: true };
async function open() {
  getProduct.mockResolvedValue(product);
  render(<MemoryRouter><EditarProducto /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Número de producto'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar producto' }));
  await screen.findByRole('button', { name: 'Guardar cambios' });
}
it('guardar cero existencias muestra producto agotado', async () => {
  editProduct.mockResolvedValue({ product: { ...product, stockQuantity: 0, isAvailable: false }, message: 'Producto actualizado exitosamente' });
  await open();
  fireEvent.change(screen.getByLabelText('Existencias'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText('Producto actualizado exitosamente')).toBeTruthy();
  expect(screen.getByText('Estado guardado: Agotado')).toBeTruthy();
  expect(editProduct).toHaveBeenCalledWith(1, expect.objectContaining({ stockQuantity: '0' }));
});
it('campos obligatorios vacios se marcan y no se envian', async () => {
  await open(); fireEvent.change(screen.getByLabelText('Nombre *'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByText('Este campo es obligatorio.')).toBeTruthy();
  expect(editProduct).not.toHaveBeenCalled();
});
it('errores del servidor conservan los datos y se muestran', async () => {
  editProduct.mockRejectedValue(new Error('Ya existe un producto con ese nombre en la misma categoría.'));
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByLabelText('Nombre *').value).toBe('Bebida');
});
