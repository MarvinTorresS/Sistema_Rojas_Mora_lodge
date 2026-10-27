'use strict';
jest.mock('../../src/models', () => ({ User: { findOne: jest.fn() }, Role: {} }));
jest.mock('bcrypt', () => ({ compare: jest.fn() }));
const bcrypt = require('bcrypt');
const { User } = require('../../src/models');
const { verifyCabinAdministrator } = require('../../src/modules/reservasCabina/cabinAdminApproval.service');
const credentials = { email: 'admin@example.com', password: 'test-only-password', reason: 'Autorizacion de prueba' };
beforeEach(() => { jest.clearAllMocks(); });
test('autoriza identidad activa y rol real sin devolver credenciales', async () => {
  User.findOne.mockResolvedValue({ userId: 4, passwordHash: 'hash', role: { roleName: 'Administrador' } });
  bcrypt.compare.mockResolvedValue(true);
  expect(await verifyCabinAdministrator(credentials)).toEqual({ userId: 4, reason: credentials.reason });
  expect(User.findOne.mock.calls[0][0].where.isActive).toBe(true);
});
test('no permite un recepcionista aunque conozca su contraseña', async () => {
  User.findOne.mockResolvedValue({ userId: 4, passwordHash: 'hash', role: { roleName: 'Recepcionista' } });
  bcrypt.compare.mockResolvedValue(true);
  await expect(verifyCabinAdministrator(credentials)).rejects.toMatchObject({ statusCode: 403 });
});
test('rechaza credenciales incorrectas o usuario inactivo', async () => {
  User.findOne.mockResolvedValue(null);
  await expect(verifyCabinAdministrator(credentials)).rejects.toMatchObject({ statusCode: 401 });
  User.findOne.mockResolvedValue({ passwordHash: 'hash', role: { roleName: 'Administrador' } });
  bcrypt.compare.mockResolvedValue(false);
  await expect(verifyCabinAdministrator(credentials)).rejects.toMatchObject({ statusCode: 401 });
});
test('exige motivo y limita los campos antes de consultar', async () => {
  await expect(verifyCabinAdministrator({ ...credentials, reason: '' })).rejects.toMatchObject({ statusCode: 422 });
  expect(User.findOne).not.toHaveBeenCalled();
});
