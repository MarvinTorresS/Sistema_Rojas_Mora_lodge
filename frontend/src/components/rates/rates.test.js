import { describe, expect, it } from 'vitest';
import { MESSAGES } from './rateConfig';
import { describeRateChange, formatRateTransition, parseRateInput } from './rateFormat';

// Pruebas de las piezas puras de la pantalla de tarifas (HU-128): sin React
// ni red.

describe('parseRateInput (CA-2: tarifa vacía, cero, negativa o no numérica)', () => {
  it('acepta una tarifa en colones enteros', () => {
    expect(parseRateInput('60000')).toEqual({ value: 60000, error: null });
    expect(parseRateInput(' 60000 ')).toEqual({ value: 60000, error: null });
  });

  it.each([['vacía', ''], ['solo espacios', '   '], ['cero', '0'], ['ceros', '000'], ['negativa', '-500'], ['texto', 'abc'], ['con punto', '60.000'], ['con coma', '60,5'], ['nula', null], ['indefinida', undefined]])(
    'rechaza una tarifa %s con el mensaje oficial',
    (_label, text) => {
      expect(parseRateInput(text)).toEqual({ value: null, error: MESSAGES.INVALID_RATE });
    },
  );

  it('rechaza lo que supera el tope de la base de datos', () => {
    expect(parseRateInput('99999999').error).toBeNull();
    expect(parseRateInput('100000000').error).toMatch(/no puede superar/);
  });
});

describe('describeRateChange (vista previa antes de guardar)', () => {
  it('detecta una subida con su monto y porcentaje', () => {
    expect(describeRateChange(55000, 60000)).toEqual({ direction: 'up', delta: 5000, percent: 9 });
  });

  it('detecta una bajada con valores positivos', () => {
    expect(describeRateChange(60000, 45000)).toEqual({ direction: 'down', delta: 15000, percent: 25 });
  });

  it('reconoce que no hay cambio', () => {
    expect(describeRateChange(55000, 55000)).toEqual({ direction: 'same', delta: 0, percent: 0 });
  });

  it('no divide entre cero si la tarifa anterior fuera 0', () => {
    expect(describeRateChange(0, 5000).percent).toBe(0);
  });
});

describe('formatRateTransition', () => {
  it('muestra anterior → nueva en colones', () => {
    const text = formatRateTransition(55000, 60000);
    expect(text).toMatch(/55.?000.*→.*60.?000/);
  });
});
