// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PlanesSalon from './PlanesSalon';
import { createEventHallPlan, listEventHallPlans } from '../services/planesSalonService';

// El servicio se reemplaza completo: estas pruebas verifican la PANTALLA
// (qué pide, qué muestra) sin levantar la API ni la base de datos.
vi.mock('../services/planesSalonService', () => ({
  listEventHallPlans: vi.fn(), createEventHallPlan: vi.fn(),
}));

// Datos con la misma forma que devuelve GET /api/event-hall-plans.
const plans = [
  {
    planId: 1, resourceId: 2, planName: 'Medio dia', hours: 6, price: 150000,
    includedServices: ['Mobiliario'], depositPercentage: null,
  },
  {
    planId: 2, resourceId: 2, planName: 'Dia completo', hours: 12, price: 250000,
    includedServices: ['Mobiliario', 'Sonido'], depositPercentage: 40,
  },
];
const metaFor = (list, total = plans.length) => ({ total: list.length, totalWithoutFilters: total, availableHours: [6, 12] });

function renderPage(entry = '/salon/planes') {
  return render(<MemoryRouter initialEntries={[entry]}><PlanesSalon /></MemoryRouter>);
}
const digits = (text) => text.replace(/\D/g, '');

async function openForm() {
  fireEvent.click(await screen.findByRole('button', { name: /Nuevo plan/ }));
  return screen.findByLabelText(/Nombre del plan/);
}
function fill(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.resetAllMocks();
  listEventHallPlans.mockImplementation(async (params = {}) => {
    const list = params.hours ? plans.filter((plan) => plan.hours === params.hours) : plans;
    return { data: list, meta: metaFor(list) };
  });
});
afterEach(cleanup);

describe('HU-009 listado de planes del salón', () => {
  it('CA-1: muestra cada plan con su duración, servicios y precio', async () => {
    renderPage();
    const card = (await screen.findByText('Dia completo')).closest('li');
    expect(within(card).getByText('12 horas')).toBeTruthy();
    expect(within(card).getByText('Sonido')).toBeTruthy();
    expect(within(card).getByText('Anticipo 40 %')).toBeTruthy();
    expect(digits(within(card).getByText(/₡/).textContent)).toBe('250000');
    expect(screen.getByText('Medio dia')).toBeTruthy();
  });

  it('un plan sin servicios lo dice', async () => {
    listEventHallPlans.mockResolvedValue({
      data: [{ ...plans[0], includedServices: [] }], meta: metaFor([plans[0]], 1),
    });
    renderPage();
    expect(await screen.findByText('Sin servicios registrados')).toBeTruthy();
  });

  it('cada servicio va en su propia fila bajo "Qué incluye"', async () => {
    renderPage();
    const card = (await screen.findByText('Dia completo')).closest('li');
    expect(within(card).getByText('Qué incluye')).toBeTruthy();
    const list = within(card).getByRole('list', { name: 'Servicios incluidos en Dia completo' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Mobiliario', 'Sonido']);
  });

  it('si escribieron "No incluye" lo muestra como plan sin servicios, no como un servicio', async () => {
    listEventHallPlans.mockResolvedValue({
      data: [{ ...plans[0], includedServices: ['No incluye'] }], meta: metaFor([plans[0]], 1),
    });
    renderPage();
    expect(await screen.findByText('Este plan no incluye servicios adicionales.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: /Servicios incluidos/ })).toBeNull();
  });

  it('CA-2: filtra por duración y avisa cuando no hay planes para ese horario', async () => {
    renderPage();
    await screen.findByText('Medio dia');
    fireEvent.click(screen.getByRole('button', { name: '12 horas' }));
    await waitFor(() => expect(screen.queryByText('Medio dia')).toBeNull());
    expect(listEventHallPlans).toHaveBeenLastCalledWith({ hours: 12 });
    expect(screen.getByText('Dia completo')).toBeTruthy();

    listEventHallPlans.mockResolvedValue({ data: [], meta: metaFor([], 2) });
    fireEvent.click(screen.getByRole('button', { name: '6 horas' }));
    expect(await screen.findByText('No hay planes disponibles para el horario indicado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ver todos los planes' }));
    await waitFor(() => expect(listEventHallPlans).toHaveBeenLastCalledWith({}));
  });

  it('sin planes registrados invita a registrar el primero', async () => {
    listEventHallPlans.mockResolvedValue({ data: [], meta: { total: 0, totalWithoutFilters: 0, availableHours: [] } });
    renderPage();
    expect(await screen.findByText('Todavía no hay planes de precios registrados.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar el primer plan' }));
    expect(await screen.findByLabelText(/Nombre del plan/)).toBeTruthy();
  });

  it('muestra un error con "Reintentar" si la lista no carga', async () => {
    listEventHallPlans.mockRejectedValueOnce(new Error('No se pudieron cargar los planes del salón.'));
    renderPage();
    expect(await screen.findByText('No se pudieron cargar los planes del salón.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Medio dia')).toBeTruthy();
  });
});

describe('HU-009 llegada desde "Más información" de la reserva', () => {
  it('resalta el plan indicado en ?plan= y deja los demás normales', async () => {
    renderPage('/salon/planes?plan=2');
    const card = (await screen.findByText('Dia completo')).closest('li');
    expect(card.getAttribute('aria-current')).toBe('true');
    expect(within(card).getByText('Plan consultado')).toBeTruthy();
    const other = screen.getByText('Medio dia').closest('li');
    expect(other.getAttribute('aria-current')).toBeNull();
    expect(screen.getAllByText('Plan consultado')).toHaveLength(1);
  });

  it('lleva la vista hasta el plan consultado', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderPage('/salon/planes?plan=2');
    await screen.findByText('Dia completo');
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    delete Element.prototype.scrollIntoView;
  });

  it('sin ?plan= no resalta nada', async () => {
    renderPage();
    await screen.findByText('Dia completo');
    expect(screen.queryByText('Plan consultado')).toBeNull();
  });

  it('si el plan ya no existe avisa y muestra todos', async () => {
    renderPage('/salon/planes?plan=99');
    expect(await screen.findByText('No encontramos el plan que buscabas.')).toBeTruthy();
    expect(screen.getByText('Medio dia')).toBeTruthy();
    expect(screen.queryByText('Plan consultado')).toBeNull();
  });
});

describe('HU-008 registrar un plan', () => {
  it('CA-1: guarda el plan, avisa el éxito, cierra el formulario y recarga la lista', async () => {
    createEventHallPlan.mockResolvedValue({
      planId: 9, planName: 'Plan Boda', hours: 8, price: 180000, includedServices: ['Sonido'], depositPercentage: 30,
    });
    renderPage();
    await openForm();
    fill(/Nombre del plan/, 'Plan Boda');
    fill(/Duración/, '8');
    fill(/Precio/, '180000');
    fill('Servicios incluidos', 'Sonido');
    fill(/Anticipo/, '30');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));

    expect(await screen.findByText('El plan se registró y ya está disponible para nuevas reservas')).toBeTruthy();
    expect(createEventHallPlan).toHaveBeenCalledWith({
      planName: 'Plan Boda', hours: 8, price: 180000, includedServices: 'Sonido', depositPercentage: 30,
    });
    expect(screen.queryByLabelText('Nuevo plan de precios')).toBeNull();
    expect(listEventHallPlans).toHaveBeenCalledTimes(2);
  });

  it('CA-3: marca todos los campos obligatorios pendientes y no llama al backend', async () => {
    renderPage();
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));
    expect(await screen.findByText('El nombre del plan es obligatorio.')).toBeTruthy();
    expect(screen.getByText('La duración del plan en horas es obligatoria.')).toBeTruthy();
    expect(screen.getByText('El precio del plan es obligatorio.')).toBeTruthy();
    expect(createEventHallPlan).not.toHaveBeenCalled();
  });

  it('corregir un campo le quita su error', async () => {
    renderPage();
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));
    await screen.findByText('El nombre del plan es obligatorio.');
    fill(/Nombre del plan/, 'Plan Boda');
    expect(screen.queryByText('El nombre del plan es obligatorio.')).toBeNull();
    expect(screen.getByText('El precio del plan es obligatorio.')).toBeTruthy();
  });

  it('CA-2: nombre repetido muestra el mensaje junto al campo y deja el formulario abierto', async () => {
    const error = Object.assign(new Error('Ya existe un plan con ese nombre'), {
      status: 409, code: 'DUPLICATE_PLAN_NAME', fieldErrors: { planName: 'Ya existe un plan con ese nombre' },
    });
    createEventHallPlan.mockRejectedValue(error);
    renderPage();
    await openForm();
    fill(/Nombre del plan/, 'MEDIO DIA');
    fill(/Duración/, '6');
    fill(/Precio/, '100000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));

    expect(await screen.findByText('Ya existe un plan con ese nombre')).toBeTruthy();
    expect(screen.getByLabelText(/Nombre del plan/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Nuevo plan de precios')).toBeTruthy();
    expect(screen.queryByText('El plan se registró y ya está disponible para nuevas reservas')).toBeNull();
  });

  it('muestra los errores por campo que manda el backend', async () => {
    createEventHallPlan.mockRejectedValue(Object.assign(new Error('x'), {
      status: 422, fieldErrors: { price: 'El precio debe ser un monto mayor a cero.' },
    }));
    renderPage();
    await openForm();
    fill(/Nombre del plan/, 'Plan Boda');
    fill(/Duración/, '6');
    fill(/Precio/, '5');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));
    expect(await screen.findByText('El precio debe ser un monto mayor a cero.')).toBeTruthy();
  });

  it('un error general (red) se muestra en el formulario', async () => {
    createEventHallPlan.mockRejectedValue(Object.assign(new Error('Sin conexión'), { fieldErrors: {} }));
    renderPage();
    await openForm();
    fill(/Nombre del plan/, 'Plan Boda');
    fill(/Duración/, '6');
    fill(/Precio/, '100000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));
    expect(await screen.findByText('Sin conexión')).toBeTruthy();
  });

  it('Cancelar cierra el formulario sin llamar al backend', async () => {
    renderPage();
    await openForm();
    fill(/Nombre del plan/, 'algo');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByLabelText('Nuevo plan de precios')).toBeNull();
    expect(createEventHallPlan).not.toHaveBeenCalled();
  });

  it('los campos numéricos solo aceptan dígitos', async () => {
    renderPage();
    await openForm();
    fill(/Duración/, '1a2');
    fill(/Precio/, '1.500,00x');
    expect(screen.getByLabelText(/Duración/).value).toBe('12');
    expect(screen.getByLabelText(/Precio/).value).toBe('150000');
  });
});

describe('HU-008/HU-009 costo por hora extra', () => {
  it('el formulario tiene "Costo por hora extra" y lo envía junto al plan', async () => {
    createEventHallPlan.mockResolvedValue({
      planId: 9, planName: 'Plan Común', hours: 2, price: 50000, includedServices: [], depositPercentage: null, extraHourPrice: 8000,
    });
    renderPage();
    await openForm();
    fill(/Nombre del plan/, 'Plan Común');
    fill(/Duración/, '2');
    fill(/Precio/, '50000');
    fill(/Costo por hora extra/, '8000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));
    await screen.findByText('El plan se registró y ya está disponible para nuevas reservas');
    expect(createEventHallPlan).toHaveBeenCalledWith({
      planName: 'Plan Común', hours: 2, price: 50000, extraHourPrice: 8000,
    });
  });

  it('es opcional: sin costo no manda el campo', async () => {
    createEventHallPlan.mockResolvedValue({ planId: 9, planName: 'Plan Fijo', hours: 3, price: 1000, includedServices: [], depositPercentage: null, extraHourPrice: null });
    renderPage();
    await openForm();
    fill(/Nombre del plan/, 'Plan Fijo');
    fill(/Duración/, '3');
    fill(/Precio/, '1000');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));
    await screen.findByText('El plan se registró y ya está disponible para nuevas reservas');
    expect(createEventHallPlan.mock.calls[0][0]).not.toHaveProperty('extraHourPrice');
  });

  it('un costo en cero se marca junto al campo y no llama al backend', async () => {
    renderPage();
    await openForm();
    fill(/Nombre del plan/, 'Plan Fijo');
    fill(/Duración/, '3');
    fill(/Precio/, '1000');
    fill(/Costo por hora extra/, '0');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar plan' }));
    expect(await screen.findByText('El costo por hora extra debe ser un monto mayor a cero.')).toBeTruthy();
    expect(createEventHallPlan).not.toHaveBeenCalled();
  });

  it('la tarjeta muestra el costo por hora extra solo si el plan lo tiene', async () => {
    listEventHallPlans.mockResolvedValue({
      data: [{ ...plans[0], extraHourPrice: 8000 }, { ...plans[1], extraHourPrice: null }], meta: metaFor(plans),
    });
    renderPage();
    const withExtra = (await screen.findByText('Medio dia')).closest('li');
    expect(digits(within(withExtra).getByText(/Hora extra/).textContent)).toBe('8000');
    const without = screen.getByText('Dia completo').closest('li');
    expect(within(without).queryByText(/Hora extra/)).toBeNull();
  });
});
