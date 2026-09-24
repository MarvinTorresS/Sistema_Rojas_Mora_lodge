import { describe, it, expect } from 'vitest';
import { canConfirmCancellation } from '../../src/pages/ReservasCancha.jsx';

describe('PU-HU-006-CA2-01', () => {
  it.each([
    ['', false],
    ['   ', false],
    [undefined, false],
    ['Cliente canceló por lluvia', true],
    ['  con espacios alrededor  ', true],
  ])('canConfirmCancellation(%j) -> %s', (reason, esperado) => {
    expect(canConfirmCancellation(reason)).toBe(esperado);
  });
});