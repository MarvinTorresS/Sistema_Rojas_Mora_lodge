'use strict';

// Usuario responsable de una operacion del restaurante - Sprint 4 (Marvin).
//
// TODO (Sprint 5, autenticacion): hoy el usuario llega como `userId` en el
// cuerpo (RESTAURANT_USER_ID en el frontend), igual que en HU-025/HU-030.
// Cuando exista req.user, esta verificacion se mantiene igual: solo cambia
// de donde sale el id.
//
// Nota para el equipo: consumoHuesped.service.js tiene su propia copia
// privada (assertActingUser, HU-030) con otros textos. Se propone que ambas
// historias usen este archivo en un refactor acordado.
const { User } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const { MESSAGES, CODES } = require('./restaurante.util');

// Verifica que el usuario exista y este activo.
//   required = true  -> falta el id: 422 (HU-024: la cuenta exige mesero).
//   required = false -> sin id se acepta null (auditoria sin usuario, como
//                       HU-106); si viene un id, debe ser valido.
// Devuelve el id verificado (o null).
async function assertActingUser(userId, { transaction, required = true } = {}) {
  const missing = userId === undefined || userId === null;
  if (missing && !required) return null;
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new DomainError(MESSAGES.ACTING_USER_REQUIRED, 422, {
      code: CODES.ACTING_USER_INVALID,
      details: [{ field: 'userId', message: MESSAGES.ACTING_USER_REQUIRED }],
    });
  }
  const user = await User.findByPk(userId, { transaction });
  if (!user || user.isActive === false) {
    throw new DomainError(MESSAGES.ACTING_USER_INVALID, 422, {
      code: CODES.ACTING_USER_INVALID,
      details: [{ field: 'userId', message: MESSAGES.ACTING_USER_INVALID }],
    });
  }
  return userId;
}

module.exports = { assertActingUser };
