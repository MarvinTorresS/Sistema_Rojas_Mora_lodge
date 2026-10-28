// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FieldDateStrip from './FieldDateStrip';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Example() { const [date, setDate] = useState('2026-10-27'); return <FieldDateStrip value={date} onChange={setDate} today="2026-10-27" />; }
it('desplaza fechas con las flechas y vuelve hasta hoy sin ofrecer fechas pasadas', () => {
  render(<Example />);
  expect(screen.getByRole('button', { name: 'Ver días anteriores' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Ver días siguientes' }));
  expect(screen.queryByRole('button', { name: /martes,? 27 de octubre/i })).toBeNull();
  expect(screen.getByRole('button', { name: /martes,? 3 de noviembre/i })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /miércoles,? 28 de octubre/i }));
  expect(screen.getByLabelText('Fecha').value).toBe('2026-10-28');
  fireEvent.click(screen.getByRole('button', { name: 'Volver a hoy' }));
  expect(screen.getByLabelText('Fecha').value).toBe('2026-10-27');
  expect(screen.getByRole('button', { name: 'Ver días anteriores' }).disabled).toBe(true);
});
it('respeta el limite actual de treinta dias y permite elegir con el calendario', () => {
  render(<Example />);
  for (let index = 0; index < 24; index++) fireEvent.click(screen.getByRole('button', { name: 'Ver días siguientes' }));
  expect(screen.getByRole('button', { name: 'Ver días siguientes' }).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: /viernes,? 27 de noviembre/i })).toBeNull();
  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-12' } });
  expect(screen.getByRole('button', { name: /jueves,? 12 de noviembre/i }).getAttribute('aria-pressed')).toBe('true');
});

it('desplaza exactamente una casilla por clic y respeta movimiento reducido', () => {
  let reduce = false;
  vi.stubGlobal('matchMedia', () => ({ matches: reduce }));
  const scrollTo = vi.fn();
  const original = Element.prototype.scrollTo;
  Element.prototype.scrollTo = scrollTo;
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function () {
    return Array.from(this.parentElement.children).indexOf(this) * 70;
  });
  try {
    render(<Example />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver días siguientes' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 70, behavior: 'smooth' });
    fireEvent.click(screen.getByRole('button', { name: 'Ver días siguientes' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 140, behavior: 'smooth' });
    fireEvent.click(screen.getByRole('button', { name: 'Ver días anteriores' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 70, behavior: 'smooth' });
    reduce = true;
    fireEvent.click(screen.getByRole('button', { name: 'Ver días siguientes' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 140, behavior: 'instant' });
  } finally { Element.prototype.scrollTo = original; }
});
