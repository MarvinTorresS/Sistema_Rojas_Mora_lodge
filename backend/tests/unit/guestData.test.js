'use strict';

// Formato de cedula, telefono, correo y nombre en las reservas de cabina
// (registrar y modificar) y de salon (registrar). Los servicios se simulan:
// aqui solo se prueba que el validator rechace lo incorrecto y entregue los
// datos ya en su forma final (cedula y telefono solo con numeros).
jest.mock('../../src/models', () => ({
  Booking: { findAndCountAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  Resource: { findOne: jest.fn(), findAll: jest.fn() },
  ResourceBlock: { findOne: jest.fn(), findAll: jest.fn() },
  CabinDetail: { findByPk: jest.fn() },
  Customer: { findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  AuditLog: { create: jest.fn(), findOne: jest.fn(), findAll: jest.fn() },
  BookingExtensionRequest: { create: jest.fn() },
  sequelize: { transaction: jest.fn(async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })) },
}));
jest.mock('../../src/modules/reservasCabina/reservasCabina.service', () => ({
  createCabinBooking: jest.fn(),
  getCabinAvailability: jest.fn(),
}));
jest.mock('../../src/modules/reservasCabina/cabinBookingUpdate.service', () => ({
  updateCabinBooking: jest.fn(),
}));
jest.mock('../../src/modules/reservasSalon/reservasSalon.service', () => ({
  createHallBooking: jest.fn(),
  checkHallAvailability: jest.fn(),
  listHallBookings: jest.fn(),
  getHallBooking: jest.fn(),
  updateHallBooking: jest.fn(),
  cancelHallBooking: jest.fn(),
}));
const request = require('supertest');
const app = require('../../src/app');
const { createCabinBooking } = require('../../src/modules/reservasCabina/reservasCabina.service');
const { updateCabinBooking } = require('../../src/modules/reservasCabina/cabinBookingUpdate.service');
const { createHallBooking } = require('../../src/modules/reservasSalon/reservasSalon.service');
const {
  GUEST_MESSAGES, normalizeIdentification, normalizePhone, isValidEmail, isValidName, isFullName,
} = require('../../src/utils/guestData.util');

const cabinBody = {
  resourceId: 3,
  guestName: 'Juan López',
  guestIdentification: '6-0495-0088',
  guestPhone: '+506 8557-1211',
  guestEmail: 'juan@gmail.com',
  checkInDate: '2030-01-10',
  checkOutDate: '2030-01-12',
  companions: 1,
};
const hallBody = {
  resourceId: 2,
  planId: 7,
  customerName: 'Ana Mora',
  customerPhone: '8888-7777',
  startDatetime: '2030-01-10T09:00:00',
  endDatetime: '2030-01-10T15:00:00',
};

beforeEach(() => {
  jest.clearAllMocks();
  createCabinBooking.mockResolvedValue({ booking: { bookingId: 1 } });
  updateCabinBooking.mockResolvedValue({ changed: true });
  createHallBooking.mockResolvedValue({ booking: { bookingId: 1 } });
});

describe('reglas de formato (util)', () => {
  it('cedula: solo numeros, 9 digitos (o DIMEX de 11 o 12)', () => {
    expect(normalizeIdentification('6-0495-0088')).toBe('604950088');
    expect(normalizeIdentification(' 6 0495 0088 ')).toBe('604950088');
    expect(normalizeIdentification('155812345678')).toBe('155812345678');
    expect(normalizeIdentification('15581234567')).toBe('15581234567');
    expect(normalizeIdentification('Juan Lopez')).toBeNull();
    expect(normalizeIdentification('60495008A')).toBeNull();
    expect(normalizeIdentification('60495008')).toBeNull(); // 8
    expect(normalizeIdentification('6049500889')).toBeNull(); // 10
    expect(normalizeIdentification('1234567890123')).toBeNull(); // 13
    expect(normalizeIdentification(604950088)).toBeNull(); // no es texto
  });

  it('telefono: 8 digitos; acepta +506, espacios, guiones y parentesis', () => {
    expect(normalizePhone('85571211')).toBe('85571211');
    expect(normalizePhone('8557-1211')).toBe('85571211');
    expect(normalizePhone('+506 8557 1211')).toBe('85571211');
    expect(normalizePhone('(506) 8557-1211')).toBe('85571211');
    expect(normalizePhone('abcdefgh')).toBeNull();
    expect(normalizePhone('8557121')).toBeNull(); // 7
    expect(normalizePhone('855712111')).toBeNull(); // 9
    expect(normalizePhone('8557-12x1')).toBeNull();
    expect(normalizePhone('juan@gmail.com')).toBeNull();
  });

  it('correo: usuario@dominio.extension', () => {
    expect(isValidEmail('juan@gmail.com')).toBe(true);
    expect(isValidEmail('ana.mora+lodge@correo.co.cr')).toBe(true);
    ['juan', 'juan@', 'juan@gmail', '@gmail.com', 'juan@@gmail.com', 'ju an@gmail.com', 'juan@gmail..com', '85571211']
      .forEach((value) => expect(isValidEmail(value)).toBe(false));
  });

  it('nombre: letras, sin numeros ni simbolos raros', () => {
    expect(isValidName("María José O'Neil-Pérez")).toBe(true);
    ['Juan 123', '85571211', 'juan@gmail.com', '123', '-Juan', 'Ana <b>']
      .forEach((value) => expect(isValidName(value)).toBe(false));
  });
});

describe('nombre completo (cabina)', () => {
  it('pide nombre y apellido; los nombres pueden repetirse', () => {
    ['Juan Pérez', 'Juan Pérez Mora', 'María de los Ángeles Solís', "Ana M. O'Neil"].forEach((value) => expect(isFullName(value)).toBe(true));
    ['Juan', '  Juan  ', 'J P', 'Juan P.'].forEach((value) => expect(isFullName(value)).toBe(false));
  });
});

describe('POST /api/cabin-bookings: datos del huesped', () => {
  const post = (changes) => request(app).post('/api/cabin-bookings').send({ ...cabinBody, ...changes });
  const fieldsWithError = (res) => res.body.error.details.map((d) => d.field);

  it('con datos correctos entrega cedula y telefono solo con numeros', async () => {
    const res = await post({});
    expect(res.status).toBe(201);
    expect(createCabinBooking).toHaveBeenCalledWith(expect.objectContaining({
      guestIdentification: '604950088', guestPhone: '85571211', guestEmail: 'juan@gmail.com',
    }));
  });

  it('rechaza una cedula con letras o con la cantidad de digitos incorrecta', async () => {
    for (const value of ['Juan Lopez', '60495008', '6049500889', '6-0495-008A']) {
      const res = await post({ guestIdentification: value });
      expect(res.status).toBe(422);
      expect(fieldsWithError(res)).toEqual(['guestIdentification']);
      expect(res.body.error.details[0].message).toBe(GUEST_MESSAGES.IDENTIFICATION);
    }
    expect(createCabinBooking).not.toHaveBeenCalled();
  });

  it('rechaza un telefono con letras o que no tiene 8 digitos', async () => {
    for (const value of ['abcdefgh', '8557121', '855712111', 'juan@gmail.com']) {
      const res = await post({ guestPhone: value });
      expect(res.status).toBe(422);
      expect(fieldsWithError(res)).toEqual(['guestPhone']);
    }
  });

  it('rechaza un correo mal escrito', async () => {
    for (const value of ['juan', 'juan@gmail', 'juan@@gmail.com', '85571211']) {
      const res = await post({ guestEmail: value });
      expect(res.status).toBe(422);
      expect(fieldsWithError(res)).toEqual(['guestEmail']);
    }
  });

  it('rechaza un nombre con numeros', async () => {
    const res = await post({ guestName: 'Juan 123' });
    expect(res.status).toBe(422);
    expect(fieldsWithError(res)).toEqual(['guestName']);
  });

  it('rechaza un nombre sin apellidos y acepta el mismo nombre con otra cedula', async () => {
    const res = await post({ guestName: 'Juan' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0]).toEqual({ field: 'guestName', message: GUEST_MESSAGES.FULL_NAME });
    // Dos personas pueden llamarse igual: lo que las distingue es la cedula.
    expect((await post({ guestName: 'Juan Pérez Mora', guestIdentification: '1-1111-1111' })).status).toBe(201);
    expect((await post({ guestName: 'Juan Pérez Mora', guestIdentification: '2-2222-2222' })).status).toBe(201);
  });

  it('un dato faltante da un solo mensaje, el de "obligatorio"', async () => {
    const res = await post({ guestIdentification: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.filter((d) => d.field === 'guestIdentification')).toHaveLength(1);
    expect(res.body.error.details[0].message).toMatch(/obligatoria/);
  });
});

describe('PATCH /api/cabin-bookings/:id: datos del huesped', () => {
  const patch = (body) => request(app).patch('/api/cabin-bookings/5').send(body);

  it('entrega el telefono solo con numeros', async () => {
    const res = await patch({ guestPhone: '8777 2222' });
    expect(res.status).toBe(200);
    expect(updateCabinBooking).toHaveBeenCalledWith({ bookingId: 5, changes: { guestPhone: '87772222' } });
  });

  it('rechaza telefono, correo y nombre con formato incorrecto', async () => {
    expect((await patch({ guestPhone: '12345' })).status).toBe(422);
    expect((await patch({ guestPhone: 'abcdefgh' })).status).toBe(422);
    expect((await patch({ guestEmail: 'juan@gmail' })).status).toBe(422);
    expect((await patch({ guestName: 'Juan 123' })).status).toBe(422);
    expect((await patch({ guestName: 'Juan' })).status).toBe(422);
    expect(updateCabinBooking).not.toHaveBeenCalled();
  });
});

describe('POST /api/hall-bookings: datos del cliente', () => {
  const post = (changes) => request(app).post('/api/hall-bookings').send({ ...hallBody, ...changes });

  it('con datos correctos entrega el telefono solo con numeros', async () => {
    const res = await post({});
    expect(res.status).toBe(201);
    expect(createHallBooking).toHaveBeenCalledWith(expect.objectContaining({ customerPhone: '88887777' }));
  });

  it('rechaza telefono con letras o de otra longitud, y nombre con numeros', async () => {
    for (const changes of [{ customerPhone: 'abcdefgh' }, { customerPhone: '8888777' }, { customerName: 'Ana 123' }]) {
      const res = await post(changes);
      expect(res.status).toBe(422);
    }
    expect(createHallBooking).not.toHaveBeenCalled();
  });
});
