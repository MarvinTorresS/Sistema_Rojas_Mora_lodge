'use strict';

const bcrypt = require('bcrypt');
const { User, Role } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
// Igual trabajo criptográfico para usuarios inexistentes/inactivos.
const dummyHash = '$2b$10$TgRai6n3hAclBYnkkwbgpO9HVGXnmxLjMtHlLsINbGlvfpgp1lqCW';

async function verifyTableAdministrator({ email, password } = {}) {
  if (typeof email !== 'string' || !email.trim() || email.length > 150
    || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    throw new DomainError('Indique correo y contraseña válidos de Administrador.', 422);
  }
  const user = await User.findOne({
    where: { email: email.trim().toLowerCase(), isActive: true }, include: [{ model: Role, as: 'role' }],
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);
  if (!user || !user.isActive || !valid) throw new DomainError('No se pudo autorizar la eliminación con esas credenciales.', 401);
  if (user.role?.roleName?.toLowerCase() !== 'administrador') {
    throw new DomainError('Solo un Administrador puede eliminar mesas.', 403);
  }
  return user.userId;
}

module.exports = { verifyTableAdministrator };
