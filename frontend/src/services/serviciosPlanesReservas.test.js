import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pruebas de la capa de servicio de HU-008, HU-009, HU-018 y HU-019:
// qué URL/cuerpo se manda y cómo se traducen los errores, en
// especial el caso "el servidor no responde".
vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

import api from './api';
import { listEventHallPlans, createEventHallPlan } from './planesSalonService';
import { searchCabinBookings, updateCabinBooking } from './reservasCabinaService';

const CONNECTION = 'No se pudo conectar con el servidor';

// axios no trae `response` cuando no hay conexión con el servidor.
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const httpError = (status, error) => Object.assign(new Error('Request failed'), {
  response: { status, data: { error } },
});

describe('planesSalonService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista los planes y devuelve el cuerpo tal cual', async () => {
    api.get.mockResolvedValue({ data: { data: [{ planId: 1 }], meta: { total: 1 } } });
    const result = await listEventHallPlans({ hours: 6 });
    expect(api.get).toHaveBeenCalledWith('/event-hall-plans', { params: { hours: 6 } });
    expect(result.meta.total).toBe(1);
  });

  it('registra un plan y devuelve el plan creado', async () => {
    api.post.mockResolvedValue({ data: { data: { planId: 9, planName: 'Plan X' } } });
    const plan = await createEventHallPlan({ planName: 'Plan X', hours: 3, price: 1000 });
    expect(api.post).toHaveBeenCalledWith('/event-hall-plans', { planName: 'Plan X', hours: 3, price: 1000 });
    expect(plan.planId).toBe(9);
  });

  it('sin respuesta del servidor avisa que no hay conexión (listar y crear)', async () => {
    api.get.mockRejectedValue(networkError());
    api.post.mockRejectedValue(networkError());
    await expect(listEventHallPlans()).rejects.toThrow(CONNECTION);
    await expect(createEventHallPlan({})).rejects.toThrow(CONNECTION);
  });

  it('un error del servidor conserva su mensaje, código y errores por campo', async () => {
    api.post.mockRejectedValue(httpError(409, {
      message: 'Ya existe un plan con ese nombre',
      code: 'DUPLICATE_PLAN_NAME',
      details: [{ field: 'planName', message: 'Ya existe un plan con ese nombre' }],
    }));
    const error = await createEventHallPlan({}).catch((e) => e);
    expect(error.message).toBe('Ya existe un plan con ese nombre');
    expect(error.status).toBe(409);
    expect(error.code).toBe('DUPLICATE_PLAN_NAME');
    expect(error.fieldErrors).toEqual({ planName: 'Ya existe un plan con ese nombre' });
  });

  it('un error del servidor sin mensaje usa el texto genérico, no el de conexión', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 500, data: {} } }));
    await expect(listEventHallPlans()).rejects.toThrow('No se pudieron cargar los planes del salón. Intentá de nuevo.');
  });
});

describe('reservasCabinaService (HU-018 y HU-019)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('busca con ?q= y devuelve data y meta', async () => {
    api.get.mockResolvedValue({ data: { data: [], meta: { total: 0, message: 'msg' } } });
    const result = await searchCabinBookings({ q: 'ana', page: 1 });
    expect(api.get).toHaveBeenCalledWith('/cabin-bookings/search', { params: { q: 'ana', page: 1 } });
    expect(result.meta.message).toBe('msg');
  });

  it('modifica con PATCH mandando solo los cambios', async () => {
    api.patch.mockResolvedValue({ data: { data: { changed: true } } });
    const result = await updateCabinBooking(7, { guestPhone: '8888-0000' });
    expect(api.patch).toHaveBeenCalledWith('/cabin-bookings/7', { guestPhone: '8888-0000' });
    expect(result.changed).toBe(true);
  });

  it('sin respuesta del servidor avisa que no hay conexión (buscar y modificar)', async () => {
    api.get.mockRejectedValue(networkError());
    api.patch.mockRejectedValue(networkError());
    await expect(searchCabinBookings({ q: 'ana' })).rejects.toThrow(CONNECTION);
    await expect(updateCabinBooking(1, { guestName: 'Ana' })).rejects.toThrow(CONNECTION);
  });

  it('el conflicto de disponibilidad conserva código y alternativas', async () => {
    const details = { alternatives: [{ resourceId: 3 }], alternativeDates: [] };
    api.patch.mockRejectedValue(httpError(409, {
      message: 'La cabina no se encuentra disponible en las fechas seleccionadas',
      code: 'CABIN_NOT_AVAILABLE',
      details,
    }));
    const error = await updateCabinBooking(1, { resourceId: 4 }).catch((e) => e);
    expect(error.code).toBe('CABIN_NOT_AVAILABLE');
    expect(error.status).toBe(409);
    expect(error.message).toBe('La cabina no se encuentra disponible en las fechas seleccionadas');
  });

  it('un error de validación del servidor conserva su mensaje', async () => {
    api.patch.mockRejectedValue(httpError(422, { message: 'Indique al menos un dato de la reserva para modificar.' }));
    await expect(updateCabinBooking(1, {})).rejects.toThrow('Indique al menos un dato de la reserva para modificar.');
  });
});
