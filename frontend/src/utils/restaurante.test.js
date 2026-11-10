import { describe, expect, it } from 'vitest';
import {
  addToPending, buildBalanceCsv, maxQuantity, pendingTotal, removeFromPending, setPendingQuantity, slug, toRequestItems,
} from './restaurante';

const casado = { productId: 1, name: 'Casado', price: 4500, stockQuantity: 3 };
const refresco = { productId: 2, name: 'Refresco', price: 1500, stockQuantity: 200 };
const agotado = { productId: 3, name: 'Pargo', price: 9000, stockQuantity: 0 };

describe('pedido por agregar (HU-025)', () => {
  it('maxQuantity respeta las existencias y el tope de 99 por línea', () => {
    expect(maxQuantity(casado)).toBe(3);
    expect(maxQuantity(refresco)).toBe(99);
    expect(maxQuantity(agotado)).toBe(0);
    expect(maxQuantity(undefined)).toBe(0);
  });

  it('agrega, incrementa y no pasa de las existencias', () => {
    let pending = addToPending([], casado);
    pending = addToPending(pending, casado);
    pending = addToPending(pending, casado);
    expect(pending).toEqual([{ productId: 1, quantity: 3 }]);
    expect(addToPending(pending, casado)).toBe(pending);
  });

  it('un producto agotado no se puede agregar', () => {
    const pending = [];
    expect(addToPending(pending, agotado)).toBe(pending);
  });

  it('setPendingQuantity ajusta al límite y quita la línea con cantidades inválidas', () => {
    const pending = [{ productId: 1, quantity: 1 }];
    expect(setPendingQuantity(pending, casado, 2)).toEqual([{ productId: 1, quantity: 2 }]);
    expect(setPendingQuantity(pending, casado, 50)).toEqual([{ productId: 1, quantity: 3 }]);
    expect(setPendingQuantity(pending, casado, 0)).toEqual([]);
    expect(setPendingQuantity(pending, casado, 'abc')).toEqual([]);
    expect(setPendingQuantity(pending, casado, 2.9)).toEqual([{ productId: 1, quantity: 2 }]);
  });

  it('quita una línea y arma el cuerpo de la petición sin datos extra', () => {
    const pending = [{ productId: 1, quantity: 2, extra: 'x' }, { productId: 2, quantity: 1 }];
    expect(removeFromPending(pending, 1)).toEqual([{ productId: 2, quantity: 1 }]);
    expect(toRequestItems(pending)).toEqual([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }]);
  });

  it('estima el total con los precios del menú', () => {
    expect(pendingTotal([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 3 }], [casado, refresco])).toBe(13500);
    expect(pendingTotal([{ productId: 99, quantity: 2 }], [casado])).toBe(0);
  });
});

describe('comprobante preliminar (HU-031)', () => {
  const balance = {
    guest: { guestName: 'Ana "Anita" Mora', cabinName: 'Cabina 1' },
    generatedAt: '2026-10-15T18:00:00Z',
    total: 10500,
    consumptions: [
      { date: '2026-10-14T18:00:00Z', productName: 'Casado, con arroz', quantity: 2, unitPrice: 4500, amount: 9000 },
      { date: '2026-10-15T01:00:00Z', productName: 'Refresco', quantity: 1, unitPrice: 1500, amount: 1500 },
    ],
  };

  it('arma el CSV con fecha, producto, cantidad, precio y monto, y el saldo total', () => {
    const csv = buildBalanceCsv(balance);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[1]).toBe('Huésped,"Ana ""Anita"" Mora"');
    expect(lines).toContain('Fecha,Producto,Cantidad,Precio unitario,Monto');
    expect(lines.find((line) => line.includes('Casado'))).toMatch(/"Casado, con arroz",2,4500,9000$/);
    expect(lines.at(-1)).toBe('Saldo total,,,,10500');
  });

  it('slug genera nombres de archivo seguros', () => {
    expect(slug('Ana Mora Sóto')).toBe('ana-mora-soto');
    expect(slug('???')).toBe('huesped');
    expect(slug(undefined)).toBe('huesped');
  });
});
