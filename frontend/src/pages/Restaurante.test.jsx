// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Restaurante from './Restaurante';

afterEach(cleanup);

describe('Portada del restaurante', () => {
  it('enlaza las pantallas de mesas, cuentas y consumo de huéspedes', () => {
    render(<MemoryRouter><Restaurante /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Mesas/ }).getAttribute('href')).toBe('/restaurante/mesas');
    expect(screen.getByRole('link', { name: /Cuentas de mesa/ }).getAttribute('href')).toBe('/restaurante/cuentas');
    expect(screen.getByRole('link', { name: /Consumo de huéspedes/ }).getAttribute('href')).toBe('/restaurante/huespedes');
  });
});
