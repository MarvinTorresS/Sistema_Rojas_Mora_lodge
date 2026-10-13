import { formatColones } from '../cabinas/cabinFormat';
import { MAX_RATE, MESSAGE_RATE_TOO_HIGH, MESSAGES } from './rateConfig';

/**
 * Funciones puras de la pantalla de tarifas: sin React ni red, para poder
 * probarlas solas.
 */

/**
 * Interpreta lo que el usuario escribió en el campo de tarifa.
 *
 * Es la misma regla del CA-2 que aplica el backend (vacía, cero, negativa o
 * no numérica), repetida aquí SOLO para avisar al instante sin ir a la red.
 * El backend sigue siendo la autoridad: si alguna vez difieren, manda él.
 *
 * Solo se aceptan dígitos a propósito: "60.000" sería ambiguo (¿sesenta o
 * sesenta mil?) y es peor equivocarse con un precio que pedir que se escriba
 * sin separadores.
 *
 * @param {string} text
 * @returns {{ value: number | null, error: string | null }}
 */
export function parseRateInput(text) {
  const clean = String(text ?? '').trim();
  if (!/^\d+$/.test(clean)) return { value: null, error: MESSAGES.INVALID_RATE };
  const value = Number(clean);
  if (value <= 0) return { value: null, error: MESSAGES.INVALID_RATE };
  if (value > MAX_RATE) return { value: null, error: MESSAGE_RATE_TOO_HIGH };
  return { value, error: null };
}

/**
 * Compara la tarifa vigente con la que se está escribiendo.
 *
 * @param {number} previous  tarifa actual
 * @param {number} next      tarifa nueva (ya validada)
 * @returns {{ direction: 'up' | 'down' | 'same', delta: number, percent: number }}
 *          `delta` y `percent` siempre positivos; `direction` dice el sentido.
 */
export function describeRateChange(previous, next) {
  const difference = next - previous;
  if (difference === 0) return { direction: 'same', delta: 0, percent: 0 };
  return {
    direction: difference > 0 ? 'up' : 'down',
    delta: Math.abs(difference),
    percent: previous > 0 ? Math.round((Math.abs(difference) / previous) * 100) : 0,
  };
}

// "₡55.000 → ₡60.000" para los avisos.
export function formatRateTransition(previous, next) {
  return `${formatColones(previous)} → ${formatColones(next)}`;
}
