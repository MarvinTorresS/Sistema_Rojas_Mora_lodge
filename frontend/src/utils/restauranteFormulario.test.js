import { describe, expect, it } from 'vitest';
import {
  buildTableFilters, chairLayout, describeTableFilters, fieldErrorsFromApi, findMissingFields,
  isDirty, normalizeTableNumber, parsePriceInput, tableServiceState,
} from './restauranteFormulario';

describe('Utilidades de formularios del restaurante (Sprint 4 - Marvin)', () => {
  it('CA-3: findMissingFields devuelve solo los obligatorios vacíos (espacios cuentan como vacío)', () => {
    const required = { tableNumber: 'Falta número', seatCount: 'Falta capacidad' };
    expect(findMissingFields({ tableNumber: '  ', seatCount: '4' }, required)).toEqual({ tableNumber: 'Falta número' });
    expect(findMissingFields({ tableNumber: '5', seatCount: 4 }, required)).toEqual({});
  });

  it('fieldErrorsFromApi lee la lista del 422 y el código del 409', () => {
    const unprocessable = { details: [{ field: 'name', message: 'A' }, { field: 'name', message: 'B' }, { field: 'price', message: 'C' }] };
    expect(fieldErrorsFromApi(unprocessable)).toEqual({ name: 'A', price: 'C' });
    const duplicate = { code: 'PRODUCT_DUPLICATE', message: 'Duplicado', details: { productId: 1 } };
    expect(fieldErrorsFromApi(duplicate, { PRODUCT_DUPLICATE: 'name' })).toEqual({ name: 'Duplicado' });
    expect(fieldErrorsFromApi(new Error('Network Error'))).toEqual({});
  });

  it('CA-4: isDirty detecta datos sin guardar e ignora espacios', () => {
    const initial = { a: '', b: '' };
    expect(isDirty({ a: '', b: '   ' }, initial)).toBe(false);
    expect(isDirty({ a: 'x', b: '' }, initial)).toBe(true);
  });

  it('normalizeTableNumber imita al backend: quita ceros y pasa letras a mayúscula', () => {
    expect(normalizeTableNumber(' 05 ')).toBe('5');
    expect(normalizeTableNumber('t-1')).toBe('T-1');
    expect(normalizeTableNumber('')).toBe('');
  });

  it.each([
    ['4500', 4500], ['4 500', 4500], ['4500,50', 4500.5], ['₡1200.5', 1200.5],
    ['0', null], ['abc', null], ['12.345', null], ['', null],
  ])('parsePriceInput(%s) = %s', (text, expected) => {
    expect(parsePriceInput(text)).toBe(expected);
  });

  it('chairLayout reparte todas las sillas alrededor de la mesa', () => {
    expect(chairLayout(2)).toEqual({ top: 1, bottom: 1, left: 0, right: 0 });
    expect(chairLayout(4)).toEqual({ top: 1, bottom: 1, left: 1, right: 1 });
    expect(chairLayout(8)).toEqual({ top: 2, bottom: 2, left: 2, right: 2 });
    for (let seats = 0; seats <= 20; seats += 1) {
      const { top, bottom, left, right } = chairLayout(seats);
      expect(top + bottom + left + right).toBe(seats);
    }
    expect(chairLayout('')).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('HU-104: buildTableFilters omite criterios vacíos y describeTableFilters arma el eco', () => {
    expect(buildTableFilters({ number: ' ', minSeats: '' })).toBeNull();
    expect(buildTableFilters({ number: '05', minSeats: '4' })).toEqual({ number: '05', minSeats: 4 });
    expect(describeTableFilters({ number: '05', minSeats: 4 })).toBe('Mesa 5 · 4 o más personas');
  });

  it('HU-024: el estado operativo sale de la cuenta abierta, no de table.status', () => {
    expect(tableServiceState({ isActive: false }, 9)).toBe('inactive');
    expect(tableServiceState({ isActive: true, status: 'available' }, 9)).toBe('occupied');
    expect(tableServiceState({ isActive: true, status: 'occupied' }, undefined)).toBe('available');
  });
});
