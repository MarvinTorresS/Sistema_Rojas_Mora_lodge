import { describe, expect, it } from 'vitest';
import {
  buildPlanPayload, decimalOnly, depositLabel, digitsOnly, hoursLabel, readServices, validatePlanForm,
} from './planesFormat';
import { INITIAL_FORM } from './planesConfig';

const valid = { ...INITIAL_FORM, planName: 'Plan Boda', hours: '8', price: '180000' };

describe('planesFormat (HU-008 / HU-009)', () => {
  it('hoursLabel concuerda en singular y plural', () => {
    expect(hoursLabel(1)).toBe('1 hora');
    expect(hoursLabel(6)).toBe('6 horas');
  });

  it('depositLabel usa coma decimal', () => {
    expect(depositLabel(40)).toBe('40 %');
    expect(depositLabel(12.5)).toBe('12,5 %');
  });

  it('digitsOnly y decimalOnly limpian lo escrito o pegado', () => {
    expect(digitsOnly('1a2.3,4', 8)).toBe('1234');
    expect(digitsOnly('123456789', 8)).toBe('12345678');
    expect(decimalOnly('1a2.3.4')).toBe('12.34');
    expect(decimalOnly('abc')).toBe('');
  });

  it('un formulario completo no tiene errores', () => {
    expect(validatePlanForm(valid)).toEqual({});
    expect(validatePlanForm({ ...valid, depositPercentage: '30', includedServices: 'Sonido' })).toEqual({});
  });

  it('CA-3: marca TODOS los obligatorios pendientes a la vez', () => {
    expect(Object.keys(validatePlanForm(INITIAL_FORM))).toEqual(['planName', 'hours', 'price']);
  });

  it.each([
    [{ planName: 'ab' }, 'planName', 'entre 3 y 50'],
    [{ planName: 'x'.repeat(51) }, 'planName', 'entre 3 y 50'],
    [{ hours: '0' }, 'hours', 'entre 1 y 24'],
    [{ hours: '25' }, 'hours', 'entre 1 y 24'],
    [{ price: '0' }, 'price', 'mayor a cero'],
    [{ depositPercentage: '101' }, 'depositPercentage', 'entre 0 y 100'],
  ])('revisa %j', (override, field, text) => {
    const errors = validatePlanForm({ ...valid, ...override });
    expect(errors[field]).toContain(text);
  });

  it('el anticipo vacío es válido y 0 también', () => {
    expect(validatePlanForm({ ...valid, depositPercentage: '' })).toEqual({});
    expect(validatePlanForm({ ...valid, depositPercentage: '0' })).toEqual({});
  });

  it('buildPlanPayload manda números y omite lo opcional vacío', () => {
    expect(buildPlanPayload({ ...valid, planName: '  Plan   Boda ' })).toEqual({ planName: 'Plan Boda', hours: 8, price: 180000 });
    expect(buildPlanPayload({ ...valid, includedServices: ' Sonido, Mesas ', depositPercentage: '30' })).toEqual({
      planName: 'Plan Boda', hours: 8, price: 180000, includedServices: 'Sonido, Mesas', depositPercentage: 30,
    });
  });
});

describe('readServices', () => {
  it('deja los servicios reales tal cual', () => {
    expect(readServices(['Sonido', 'Mesas'])).toEqual({ services: ['Sonido', 'Mesas'], declaredNone: false });
  });
  it('una lista vacía no es "declaró que no incluye"', () => {
    expect(readServices([])).toEqual({ services: [], declaredNone: false });
    expect(readServices()).toEqual({ services: [], declaredNone: false });
  });
  it.each(['No incluye', 'no inlcuye', 'NO INCLUYE.', 'Ninguno', 'N/A', 'Sin servicios'])('"%s" se toma como "no incluye"', (text) => {
    expect(readServices([text])).toEqual({ services: [], declaredNone: true });
  });
  it('una marca de "no incluye" mezclada con servicios reales se descarta', () => {
    expect(readServices(['Sonido', 'No incluye'])).toEqual({ services: ['Sonido'], declaredNone: false });
  });
  it('no confunde servicios que solo empiezan parecido', () => {
    expect(readServices(['Nota de bienvenida', 'Sin costo de limpieza']).services).toHaveLength(2);
  });
});

describe('costo por hora extra del plan', () => {
  it('es opcional en el formulario', () => {
    expect(validatePlanForm({ ...valid, extraHourPrice: '' })).toEqual({});
    expect(validatePlanForm({ ...valid, extraHourPrice: '8000' })).toEqual({});
  });
  it('rechaza un costo en cero', () => {
    expect(validatePlanForm({ ...valid, extraHourPrice: '0' }).extraHourPrice).toBe('El costo por hora extra debe ser un monto mayor a cero.');
  });
  it('se manda solo si se escribió', () => {
    expect(buildPlanPayload({ ...valid, extraHourPrice: '' })).not.toHaveProperty('extraHourPrice');
    expect(buildPlanPayload({ ...valid, extraHourPrice: ' 8000 ' }).extraHourPrice).toBe(8000);
  });
});
