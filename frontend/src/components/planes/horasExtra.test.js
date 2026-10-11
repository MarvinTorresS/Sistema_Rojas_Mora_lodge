import { describe, expect, it } from 'vitest';
import {
  admitsExtraHours, extraHoursCost, extraHoursProblem, hoursBetweenDates, hoursBetweenTimes, requiredExtraHours,
} from './horasExtra';

const comun = { planId: 1, planName: 'Común', hours: 2, price: 50000, extraHourPrice: 8000 };
const fijo = { planId: 2, planName: 'Fijo', hours: 2, price: 40000, extraHourPrice: null };

describe('horasExtra', () => {
  it('hoursBetweenTimes cuenta horas completas y devuelve 0 si el fin no es posterior', () => {
    expect(hoursBetweenTimes('09:00', '13:00')).toBe(4);
    expect(hoursBetweenTimes('09:00', '11:30')).toBe(3);
    expect(hoursBetweenTimes('13:00', '09:00')).toBe(0);
    expect(hoursBetweenTimes('09:00', '09:00')).toBe(0);
    expect(hoursBetweenTimes('', '')).toBe(0);
  });

  it('hoursBetweenDates cuenta horas completas y devuelve 0 si son inválidas', () => {
    expect(hoursBetweenDates('2026-10-20T09:00', '2026-10-20T14:00')).toBe(5);
    expect(hoursBetweenDates('2026-10-20T09:00', '2026-10-20T09:01')).toBe(1);
    expect(hoursBetweenDates('2026-10-20T14:00', '2026-10-20T09:00')).toBe(0);
    expect(hoursBetweenDates('', '')).toBe(0);
  });

  it('admitsExtraHours: solo con un costo por hora extra mayor a cero', () => {
    expect(admitsExtraHours(comun)).toBe(true);
    expect(admitsExtraHours(fijo)).toBe(false);
    expect(admitsExtraHours({ ...fijo, extraHourPrice: undefined })).toBe(false);
    expect(admitsExtraHours(null)).toBe(false);
  });

  it('requiredExtraHours y extraHoursCost', () => {
    expect(requiredExtraHours(comun, 4)).toBe(2);
    expect(requiredExtraHours(comun, 2)).toBe(0);
    expect(requiredExtraHours(comun, 1)).toBe(0);
    expect(requiredExtraHours({ planName: 'Sin horas' }, 4)).toBe(0);
    expect(extraHoursCost(comun, 3)).toBe(24000);
    expect(extraHoursCost(comun, 0)).toBe(0);
    expect(extraHoursCost(fijo, 3)).toBe(0);
  });

  describe('extraHoursProblem', () => {
    it('vacío cuando todo cuadra', () => {
      expect(extraHoursProblem(comun, 4, 2)).toBe('');
      expect(extraHoursProblem(comun, 2, 0)).toBe('');
      expect(extraHoursProblem(fijo, 2, 0)).toBe('');
      expect(extraHoursProblem(null, 4, 0)).toBe('');
      expect(extraHoursProblem(comun, 0, 0)).toBe('');
    });
    it('faltan horas extra', () => {
      expect(extraHoursProblem(comun, 4, 0)).toBe('El horario dura 4 horas y el plan "Común" cubre 2: agregá 2 horas extra.');
      expect(extraHoursProblem(comun, 3, 0)).toBe('El horario dura 3 horas y el plan "Común" cubre 2: agregá 1 hora extra.');
    });
    it('sobran horas extra', () => {
      expect(extraHoursProblem(comun, 3, 4)).toBe('El horario solo supera el plan por 1 hora: no se pueden cobrar 4 horas extra.');
      expect(extraHoursProblem(comun, 2, 1)).toBe('El horario no supera las horas del plan: no hay horas extra que cobrar.');
    });
    it('plan sin costo por hora extra', () => {
      expect(extraHoursProblem(fijo, 4, 0)).toContain('Este plan no admite horas extra');
      expect(extraHoursProblem(fijo, 4, 2)).toBe('El plan "Fijo" no admite horas extra. Elegí un plan más largo o acortá el horario.');
    });
  });
});
