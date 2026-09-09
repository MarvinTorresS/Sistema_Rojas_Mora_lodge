'use strict';

const { Sequelize } = require('sequelize');
require('dotenv').config();

// Instancia unica de conexion a la base de datos, construida solo a partir
// de variables de entorno (ver .env.example). Nunca se escriben credenciales
// directamente en el codigo fuente.
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,

    define: {
      // Se desactiva el manejo automatico de timestamps de Sequelize a
      // nivel global: el esquema no es uniforme (hay tablas con
      // created_at + updated_at, otras solo con created_at, y otras con
      // columnas de fecha con nombre propio como opened_at o issued_at).
      // Cada modelo declara explicitamente lo que su tabla realmente tiene.
      timestamps: false,
    },

    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

module.exports = sequelize;
