// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import EditarProducto from './EditarProducto';
import { getProduct, editProduct } from '../services/productEditService';
import { deleteProduct } from '../services/productDeleteService';
vi.mock('../services/productEditService', () => ({ getProduct: vi.fn(), editProduct: vi.fn() }));
vi.mock('../services/productDeleteService', () => ({ deleteProduct: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const product = { productId: 1, name: 'Bebida', category: 'Bebidas', price: 1500, stockQuantity: 10, isAvailable: true };
async function open() {
  getProduct.mockResolvedValue(product); render(<MemoryRouter><EditarProducto /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Número de producto'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar producto' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar producto' }));
}
it('solicita confirmacion y limpia el formulario despues de eliminar', async () => {
  deleteProduct.mockResolvedValue({ message: 'Producto eliminado exitosamente' }); await open();
  expect(screen.getByText('¿Está seguro de que desea eliminar este producto? Esta acción no se puede deshacer')).toBeTruthy();
  expect(deleteProduct).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
  expect(await screen.findByText('Producto eliminado exitosamente')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
});
it('cancelar no elimina', async () => {
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Cancelar eliminación' }));
  expect(deleteProduct).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Confirmar eliminación' })).toBeNull();
});
it('historial bloqueado ofrece preparar cero existencias sin guardarlas automaticamente', async () => {
  deleteProduct.mockRejectedValue(Object.assign(new Error('No es posible eliminar un producto con historial de pedidos; márquelo como agotado o inactivo en su lugar'), { code: 'PRODUCT_HAS_HISTORY' }));
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar existencias en cero' }));
  expect(screen.getByLabelText('Existencias').value).toBe('0');
  expect(editProduct).not.toHaveBeenCalled();
});
