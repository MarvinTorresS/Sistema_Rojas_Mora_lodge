// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AdminPlanesSalon from './AdminPlanesSalon';
import { searchEventHallPlans, updateEventHallPlan } from '../services/eventHallPlansService';

vi.mock('../services/eventHallPlansService', () => ({
  searchEventHallPlans: vi.fn(), updateEventHallPlan: vi.fn(), deleteEventHallPlan: vi.fn(),
}));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('HU-011 avisa que los precios nuevos no alteran reservas futuras', async () => {
  const plan = { planId: 1, planName: 'Oro', hours: 4, price: 150000 };
  searchEventHallPlans.mockResolvedValue([plan]);
  updateEventHallPlan.mockResolvedValue({ plan: { ...plan, price: 300000 }, futureBookingsCount: 2 });
  render(<MemoryRouter><AdminPlanesSalon /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText('Buscar por nombre del plan…'), { target: { value: 'Oro' } });
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '300000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText(/Este plan tiene reservas futuras; el precio nuevo solo aplicará a solicitudes nuevas/)).toBeTruthy();
  expect(updateEventHallPlan).toHaveBeenCalledWith(1, { planName: 'Oro', hours: 4, price: 300000 });
});
