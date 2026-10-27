'use strict';

const bcrypt = require('bcrypt');
const { User, Role } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');

// Autorizacion por operacion; no guarda credenciales ni crea sesiones o roles.
async function verifyCabinAdministrator({ email, password, reason, expectedAdditionalAmount, feeMode } = {}) {
  if (feeMode !== undefined && !['charge', 'waive'].includes(feeMode)) throw new DomainError('La opción de cobro no es válida.', 422);
  if (typeof email !== 'string' || email.length > 150 || typeof password !== 'string' || password.length > 72 || typeof reason !== 'string' || reason.trim().length < 10 || reason.length > 250) {
    throw new DomainError('Ingresá correo, contraseña y un motivo de entre 10 y 250 caracteres.', 422);
  }
  const user = await User.findOne({ where: { email: email.trim().toLowerCase(), isActive: true }, include: [{ model: Role, as: 'role' }] });
  const valid = user && await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new DomainError('No se pudo autorizar el ingreso con esas credenciales.', 401);
  if (user.role?.roleName?.toLowerCase() !== 'administrador') {
    throw new DomainError('Solo un Administrador puede autorizar el ingreso anticipado.', 403);
  }
  return { userId: user.userId, reason: reason.trim(), ...(expectedAdditionalAmount !== undefined ? { expectedAdditionalAmount } : {}), ...(feeMode ? { feeMode } : {}) };
}

module.exports = { verifyCabinAdministrator };
