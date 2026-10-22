// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { listEventHallPlans } from './services/planesSalonService';
import { searchEventHallPlans } from './services/eventHallPlansService';

vi.mock('./services/planesSalonService', () => ({ listEventHallPlans: vi.fn(), createEventHallPlan: vi.fn() }));
vi.mock('./services/eventHallPlansService', () => ({ searchEventHallPlans: vi.fn(), updateEventHallPlan: vi.fn(), deleteEventHallPlan: vi.fn() }));
const plan = { planId: 7, planName: 'Plan del equipo', hours: 4, price: 50000, includedServices: ['Mobiliario'], depositPercentage: null };
beforeEach(() => {
  listEventHallPlans.mockResolvedValue({ data: [plan], meta: { total: 1, totalWithoutFilters: 1, availableHours: [4] } });
  searchEventHallPlans.mockResolvedValue([plan]);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('conserva catálogo y registro y permite ir a administrar y regresar usando las rutas reales', async () => {
  window.history.replaceState({}, '', '/salon/planes');
  render(<App />);
  await screen.findByText('Plan del equipo');
  fireEvent.click(screen.getByRole('button', { name: /Nuevo plan/ }));
  expect(await screen.findByLabelText(/Nombre del plan/)).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Buscar, editar o eliminar planes' }));
  expect(window.location.pathname).toBe('/salon/planes/administrar');
  fireEvent.change(screen.getByPlaceholderText('Buscar por nombre del plan…'), { target: { value: 'equipo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  expect(await screen.findByRole('button', { name: 'Editar' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Eliminar' })).toBeTruthy();
  expect(searchEventHallPlans).toHaveBeenCalledWith('equipo');
  fireEvent.click(screen.getByRole('link', { name: 'Volver al catálogo de planes' }));
  expect(window.location.pathname).toBe('/salon/planes');
  await screen.findByText('Plan del equipo');
  expect(screen.getByRole('button', { name: /Nuevo plan/ })).toBeTruthy();
});

it('el enlace con parámetro plan sigue abriendo el catálogo original y permite volver al salón', async () => {
  window.history.replaceState({}, '', '/salon/planes?plan=7');
  render(<App />);
  await screen.findByText('Plan del equipo');
  expect(document.getElementById('plan-7')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Nuevo plan/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Volver al salón' }).getAttribute('href')).toBe('/salon');
  expect(searchEventHallPlans).not.toHaveBeenCalled();
});
