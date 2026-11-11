// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

// Navegacion de la portada del restaurante con el router REAL: se entra desde
// "Elegir espacio" y se regresa con "Volver a elegir espacio", igual que en
// Cancha y Salon.
beforeEach(() => {
  window.history.replaceState({}, '', '/reservar');
});
afterEach(cleanup);

it('entra al restaurante desde elegir espacio y regresa con "Volver a elegir espacio"', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('link', { name: /Mesa del restaurante/ }));
  expect(window.location.pathname).toBe('/restaurante');
  expect(screen.getByRole('heading', { name: /Mesas, pedidos y consumos/ })).toBeTruthy();

  fireEvent.click(screen.getByRole('link', { name: 'Volver a elegir espacio' }));
  expect(window.location.pathname).toBe('/reservar');
  expect(await screen.findByRole('heading', { name: 'Nueva reserva' })).toBeTruthy();
});
