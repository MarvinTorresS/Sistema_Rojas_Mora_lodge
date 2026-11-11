import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

// Prueba unitaria de HU-001 (Marvin) — Registrar una nueva reserva de la
// cancha sintetica.
//
// Unidad bajo prueba: createFieldBooking() en reservasCancha.service.js.
// Cubre los criterios de aceptacion CA-1, CA-2, CA-4 y CA-5 de la matriz
// de trazabilidad (CA-3 se resuelve en el validator, no aqui — ver nota
// junto a CA-3 mas abajo; CA-6 es una accion de interfaz sin logica de
// backend que probar — ver nota junto a CA-6).
//
// -----------------------------------------------------------------------
// POR QUE ESTE ARCHIVO NO USA vi.mock() COMO EL DE JEST (Kendall/Alison)
// -----------------------------------------------------------------------
// reservasCancha.service.js (codigo de PRODUCCION, ya verificado y
// commiteado por Marvin — NO SE TOCA) usa require('../../models'),
// sintaxis CommonJS. Vitest, a diferencia de Jest, NO intercepta
// require(): su vi.mock() reescribe solo el grafo de imports ESM que
// resuelve Vite, y un mantenedor de Vitest lo confirma explicitamente
// ("Vitest doesn't intercept require, so it is not possible to mock a
// module that was loaded with require" — github.com/vitest-dev/vitest/
// discussions/3134). Se intento primero con vi.mock() normal (igual que
// el patron de Jest) y el service seguia recibiendo el modulo REAL de
// Sequelize, no el mock, sin importar la sintaxis del test.
//
// La solucion (documentada por el propio equipo de Vitest para este
// caso) es mas de bajo nivel: pre-poblar require.cache de Node, en la
// ruta ABSOLUTA resuelta de src/models, con nuestro objeto mockeado,
// ANTES de requerir el service. Cuando el service hace
// require('../../models'), Node resuelve esa ruta relativa a la misma
// ruta absoluta y encuentra el modulo YA en cache — nunca llega a leer
// ni ejecutar el archivo real (y por lo tanto nunca toca Sequelize ni
// MySQL). Es exactamente el mismo efecto que jest.mock(), logrado por
// otro mecanismo porque Vitest no ofrece el equivalente directo para
// CommonJS.
//
// Ejecutar: (desde backend/)  pnpm run test:vitest
//                             pnpm run test:vitest -- reservasCancha.createFieldBooking

const nodeRequire = createRequire(import.meta.url);

const mockModels = {
  Booking: { findOne: vi.fn(), create: vi.fn() },
  Resource: { findOne: vi.fn() },
  ResourceBlock: { findOne: vi.fn() },
  Customer: { findAll: vi.fn(), create: vi.fn() },
  AuditLog: { create: vi.fn() },
  sequelize: { transaction: vi.fn(async (callback) => callback({})) },
};

const modelsAbsolutePath = nodeRequire.resolve('../../src/models');
nodeRequire.cache[modelsAbsolutePath] = {
  id: modelsAbsolutePath,
  filename: modelsAbsolutePath,
  loaded: true,
  exports: mockModels,
};

// Se requiere DESPUES de pre-poblar el cache, para que el service
// resuelva sus propios require('../../models') internos contra el mock.
const service = nodeRequire('../../src/modules/reservasCancha/reservasCancha.service');
const { Booking, Resource, ResourceBlock, Customer } = mockModels;

// -----------------------------------------------------------------------
// Datos base validos, reutilizados y "sobreescritos" caso a caso.
// Manana + 2 horas: siempre en el futuro y dentro de los 30 dias, sin
// importar en que fecha corra la suite (evita una prueba que empieza a
// fallar sola con el paso del tiempo, un error comun al testear fechas).
// -----------------------------------------------------------------------
function buildValidPayload(overrides = {}) {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(15, 0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);

  return {
    resourceId: 1,
    customerName: 'Luis Vargas Mora',
    customerPhone: '88887777',
    startDatetime: start.toISOString(),
    endDatetime: end.toISOString(),
    ...overrides,
  };
}

const fakeResource = { resourceId: 1, resourceType: 'field', status: 'available' };
const fakeCustomer = { customerId: 3, fullName: 'Luis Vargas Mora', phone: '88887777' };

beforeEach(() => {
  vi.clearAllMocks();
  // Estado "feliz" por defecto: cada caso solo sobreescribe el mock que
  // necesita para forzar su escenario, en vez de repetir todo el setup.
  Resource.findOne.mockResolvedValue(fakeResource);
  Booking.findOne.mockResolvedValue(null); // sin conflictos por defecto
  ResourceBlock.findOne.mockResolvedValue(null); // sin bloqueos por defecto
  // El telefono ya pertenece a fakeCustomer con el MISMO nombre del
  // formulario: se reutiliza ese cliente (ver customerResolution.service.js).
  Customer.findAll.mockResolvedValue([fakeCustomer]);
  Customer.create.mockResolvedValue(fakeCustomer);
  Booking.create.mockResolvedValue({ bookingId: 10, status: 'active' });
});

describe('reservasCanchaService.createFieldBooking (HU-001)', () => {
  it('CP-001-01 registro exitoso: crea la reserva en estado active y canal staff', async () => {
    const payload = buildValidPayload();

    const booking = await service.createFieldBooking(payload);

    expect(booking).toEqual({ bookingId: 10, status: 'active' });
    expect(Booking.create).toHaveBeenCalledTimes(1);
    const createArgs = Booking.create.mock.calls[0][0];
    expect(createArgs).toMatchObject({
      resourceId: payload.resourceId,
      customerId: fakeCustomer.customerId,
      originChannel: 'staff', // HU-001 es registro por Administrador/Recepcionista, no web
      status: 'active',
    });
  });

  it('CP-001-02 conflicto de horario: rechaza con 409 si ya hay otra reserva de esa cancha en ese rango', async () => {
    Booking.findOne.mockResolvedValueOnce({ bookingId: 99 }); // overlap del recurso

    await expect(service.createFieldBooking(buildValidPayload()))
      .rejects.toMatchObject({ name: 'DomainError', statusCode: 409 });
    expect(Booking.create).not.toHaveBeenCalled();
  });

  // CA-3 "Campos obligatorios incompletos" se valida en la capa de
  // validator (createBookingRules, express-validator), ANTES de que la
  // peticion llegue a createFieldBooking(). No se repite aqui porque
  // esta prueba es de la funcion del SERVICE, no del middleware HTTP:
  // duplicarla en ambas capas haria que una la probara dos veces y la
  // otra ninguna. Ver PruebaFuncional_HU-001 (Postman) para el caso
  // "faltan campos obligatorios" contra el endpoint real.

  it('CP-001-04 reserva con demasiada anticipacion: rechaza con 422 si supera los 30 dias', async () => {
    const start = new Date();
    start.setDate(start.getDate() + service.MAX_ADVANCE_BOOKING_DAYS + 5);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);

    const payload = buildValidPayload({ startDatetime: start.toISOString(), endDatetime: end.toISOString() });

    await expect(service.createFieldBooking(payload))
      .rejects.toMatchObject({ name: 'DomainError', statusCode: 422 });
    expect(Booking.create).not.toHaveBeenCalled();
  });

  it('CP-001-05 reserva superpuesta del mismo cliente: rechaza con 409 aunque la cancha este libre', async () => {
    // Primera llamada a Booking.findOne = overlap del RECURSO (libre);
    // segunda llamada = overlap del CLIENTE (ocupado). El orden importa
    // porque createFieldBooking() consulta el recurso antes que el
    // cliente (ver reservasCancha.service.js, CA-2 antes que CA-5).
    // El servicio ahora revisa PRIMERO al cliente (CA-5 antes que CA-2):
    // Customer.findAll devuelve al cliente existente (mismo nombre) y el
    // primer Booking.findOne es el solape del propio cliente.
    Customer.findAll.mockResolvedValueOnce([{ customerId: 7, fullName: fakeCustomer.fullName }]);
    Booking.findOne.mockResolvedValueOnce({ bookingId: 55 });

    await expect(service.createFieldBooking(buildValidPayload()))
      .rejects.toMatchObject({ name: 'DomainError', statusCode: 409 });
    expect(Booking.create).not.toHaveBeenCalled();
  });

  // CA-6 "Cancelacion del registro" es el boton "Cancelar" del formulario
  // en el frontend (ReservasCancha.jsx): el usuario cierra el formulario
  // sin enviar nada. No hay una peticion HTTP ni una llamada a
  // createFieldBooking() que disparar, por lo que no aplica una prueba
  // unitaria de backend para este criterio — corresponde a una
  // verificacion manual/UI, no a Vitest ni a Postman.
});
