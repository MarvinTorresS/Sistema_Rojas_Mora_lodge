'use strict';

// Siembra el "usuario de turno" que el restaurante (Sprint 4) necesita
// mientras no exista autenticacion (Sprint 5).
//
// Por que hace falta: el frontend envia `userId: RESTAURANT_USER_ID` (por
// defecto 1) al registrar mesas (HU-102), productos (HU-113) y al abrir una
// cuenta de mesa (HU-024). El backend verifica en `assertActingUser` que ese
// usuario exista y este activo; si la tabla `users` esta vacia responde
// 422 ACTING_USER_INVALID: "El usuario indicado no existe o esta inactivo."
// Las migraciones solo crean las tablas, no los datos, por eso un `migrate`
// limpio no basta.
//
// Por que es idempotente (a diferencia de los seeders de cancha, salon y
// cabinas): no hay `seederStorage`, asi que `pnpm seed` vuelve a correr
// todos los seeders. Este revisa antes de insertar para que correrlo dos
// veces no falle ni duplique datos.
//
// Los datos coinciden con los creados a mano en la base de Marvin
// (docs/Sprint4_HU-102_HU-104_HU-113_HU-024_Backend.md) para que todas las
// bases del equipo queden iguales. Se reemplaza en Sprint 5 por usuarios reales.
const bcrypt = require('bcrypt');

const ROLE_NAME = 'Mesero';
const USER_ID = 1;
const USER_EMAIL = 'mesero.prueba@lodge.local';

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    // 1) Si el usuario 1 ya existe (ej. creado a mano), solo se asegura que este activo.
    const [existingUsers] = await sequelize.query(
      'SELECT user_id FROM users WHERE user_id = :id OR email = :email',
      { replacements: { id: USER_ID, email: USER_EMAIL } },
    );
    if (existingUsers.length > 0) {
      await sequelize.query('UPDATE users SET is_active = 1 WHERE user_id = :id', {
        replacements: { id: existingUsers[0].user_id },
      });
      return;
    }

    // 2) Rol: se reutiliza si ya existe por nombre; si no, se crea.
    let [roles] = await sequelize.query('SELECT role_id FROM roles WHERE role_name = :name', {
      replacements: { name: ROLE_NAME },
    });
    if (roles.length === 0) {
      await queryInterface.bulkInsert('roles', [
        { role_name: ROLE_NAME, description: 'Rol temporal hasta Sprint 5 (usuarios y roles).' },
      ]);
      [roles] = await sequelize.query('SELECT role_id FROM roles WHERE role_name = :name', {
        replacements: { name: ROLE_NAME },
      });
    }

    // 3) Usuario con id fijo 1, porque es el valor por defecto del frontend.
    await queryInterface.bulkInsert('users', [
      {
        user_id: USER_ID,
        full_name: 'Mesero Prueba',
        email: USER_EMAIL,
        password_hash: await bcrypt.hash('Prueba123!', 10),
        role_id: roles[0].role_id,
        is_active: true,
      },
    ]);
  },

  async down(queryInterface) {
    // Solo borra lo que este seeder crea; el rol se deja por si otro usuario lo usa.
    await queryInterface.bulkDelete('users', { email: USER_EMAIL });
  },
};
